import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ArrowDownToLine, X, Check, ScanLine, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, Partner, ProductCategory } from '../../types';
import { outsourceReceiveBaseKey } from './outsourceReceiveKeys';
import { ScanBatchSessionModal } from '../../components/scan/ScanBatchSessionModal';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import {
  useOutsourceReceiveScan,
  type ReceiveScanRow,
} from '../../hooks/useOutsourceReceiveScan';
import type { ScanPayload } from '../../utils/scanPayload';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import FlowListProductCell from '../../components/flow/FlowListProductCell';

export interface ReceiveRow {
  orderId?: string;
  nodeId: string;
  productId: string;
  orderNumber?: string;
  productName: string;
  milestoneName: string;
  partner: string;
  dispatched: number;
  received: number;
  pending: number;
}

export interface OutsourceReceiveScanConfirmEntry {
  /** receiveFormQuantities 的 entry key（含 variant 后缀） */
  key: string;
  /** baseKey；用于 receiveSelectedKeys */
  baseKey: string;
  qty: number;
  productName?: string;
  variantLabel?: string | null;
  /** 本次扫码解析到的单品码 id（用于把收货记录写入产品追溯链路） */
  itemCodeId?: string | null;
  /** 本次扫码解析到的虚拟批次 id（同批次各单品码共享追溯链路） */
  virtualBatchId?: string | null;
}

export interface OutsourceReceiveScanConfirmPayload {
  partner: string;
  nodeId: string;
  entries: OutsourceReceiveScanConfirmEntry[];
}

export interface OutsourceReceiveListModalProps {
  productionLinkMode: 'order' | 'product';
  outsourceReceiveRows: ReceiveRow[];
  /**
   * 未按 pending>0 过滤的全量聚合行；用于扫码会话的「跨工厂 / 已收完」分流判定。
   * 缺省时退化为仅基于 `outsourceReceiveRows` 判断（不影响主流程）。
   */
  outsourceReceiveAllAggregates?: ReceiveRow[];
  products: Product[];
  partners: Partner[];
  /** 用于扫码 hook 的 `productHasColorSizeMatrix` 判断 */
  categories: ProductCategory[];
  /** 受 SystemSetting.allowExceedMaxOutsourceReceiveQty 控制（影响扫码特例放行） */
  allowExceedMaxOutsourceReceiveQty?: boolean;
  receiveSelectedKeys: Set<string>;
  setReceiveSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** 当前已累加的录入数量（hook 用作 checkExceedMax 上限校验入参） */
  receiveFormQuantities: Record<string, number>;
  onReceiveFormOpen: () => void;
  /**
   * 扫码会话确认后回调：父组件需合并选中行、累加数量、关清单弹窗、开录入弹窗。
   * 详细合并约束见 `OutsourcePanel.handleReceiveScanConfirm`。
   */
  onScanConfirm: (payload: OutsourceReceiveScanConfirmPayload) => void;
  onClose: () => void;
}

const OutsourceReceiveListModal: React.FC<OutsourceReceiveListModalProps> = ({
  productionLinkMode,
  outsourceReceiveRows,
  outsourceReceiveAllAggregates,
  products,
  partners,
  categories,
  allowExceedMaxOutsourceReceiveQty = false,
  receiveSelectedKeys,
  setReceiveSelectedKeys,
  receiveFormQuantities,
  onReceiveFormOpen,
  onScanConfirm,
  onClose,
}) => {
  const [searchOrder, setSearchOrder] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchPartner, setSearchPartner] = useState('');
  const [searchNodeId, setSearchNodeId] = useState('');

  const showOrderNumberCol = productionLinkMode === 'order';
  const tableColCount = 1 + (showOrderNumberCol ? 1 : 0) + 6;

  const nodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const init: { value: string; label: string }[] = [];
    return outsourceReceiveRows.reduce((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, init);
  }, [outsourceReceiveRows]);

  // ---------- 扫码会话状态 ----------
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPartner, setScanPartner] = useState('');
  /**
   * 首条扫入命中后锁定该工序，后续不同工序的码会被拒绝（toast「请分批收货」）。
   * 真实命中累积在 `handleScanApply` 内局部计算；这里仅做 UI 徽标展示用途。
   */
  const [scanLockedNodeId, setScanLockedNodeId] = useState<string | null>(null);
  const prevScanPartnerRef = useRef('');

  const partnerOptions = useMemo(() => {
    const set = new Set<string>();
    outsourceReceiveRows.forEach((row) => {
      const p = (row.partner ?? '').trim();
      if (p) set.add(p);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [outsourceReceiveRows]);

  /** 扫码弹窗内可搜索加工厂选择：候选项 = 待收回清单中的加工厂名称 */
  const scanPartnerSelectOptions = useMemo((): Partner[] => {
    const allowed = new Set(partnerOptions);
    const fromMaster = partners.filter((p) => allowed.has(p.name));
    const known = new Set(fromMaster.map((p) => p.name));
    const extras: Partner[] = partnerOptions
      .filter((name) => !known.has(name))
      .map((name) => ({ id: `pending-partner:${name}`, name, contact: '' }));
    return [...fromMaster, ...extras];
  }, [partners, partnerOptions]);

  const handleOpenScan = useCallback(() => {
    setScanPartner('');
    setScanLockedNodeId(null);
    prevScanPartnerRef.current = '';
    setScanOpen(true);
  }, []);

  const handleCloseScan = useCallback(() => {
    setScanOpen(false);
    setScanPartner('');
    setScanLockedNodeId(null);
  }, []);

  /** Hook 的 pendingRows / allAggregates 仅传 partner 过滤后的子集；nodeLock 闭包内基于最新 scanLockedNodeId */
  const scanRows = useMemo<ReceiveScanRow[]>(
    () =>
      outsourceReceiveRows.map((r) => ({
        orderId: r.orderId,
        productId: r.productId,
        nodeId: r.nodeId,
        partner: r.partner,
        pending: r.pending,
        productName: r.productName,
        milestoneName: r.milestoneName,
      })),
    [outsourceReceiveRows],
  );

  const scanAllAggregates = useMemo<ReceiveScanRow[] | undefined>(
    () =>
      outsourceReceiveAllAggregates?.map((r) => ({
        orderId: r.orderId,
        productId: r.productId,
        nodeId: r.nodeId,
        partner: r.partner,
        pending: r.pending,
        productName: r.productName,
        milestoneName: r.milestoneName,
      })),
    [outsourceReceiveAllAggregates],
  );

  const isNodeAllowed = useCallback(
    (nodeId: string) => (scanLockedNodeId == null ? true : nodeId === scanLockedNodeId),
    [scanLockedNodeId],
  );

  const { applyScanPayload, resolveScanRowPreview, resetSession } = useOutsourceReceiveScan({
    pendingRows: scanRows,
    allAggregates: scanAllAggregates,
    products,
    categories,
    allowExceedMaxOutsourceReceiveQty,
    partner: scanPartner || undefined,
    isNodeAllowed,
  });

  /** 弹窗关闭时重置 hook 会话去重 */
  useEffect(() => {
    if (!scanOpen) resetSession();
  }, [scanOpen, resetSession]);

  /** 扫码弹窗打开期间切换加工厂：清空工序锁、hook 会话去重（列表由 sessionResetKey 清空） */
  useEffect(() => {
    if (!scanOpen) {
      prevScanPartnerRef.current = scanPartner;
      return;
    }
    const prev = prevScanPartnerRef.current;
    if (prev !== scanPartner) {
      if (prev) {
        toast.info('已切换加工厂，已扫列表已清空');
      }
      prevScanPartnerRef.current = scanPartner;
      setScanLockedNodeId(null);
      resetSession();
    }
  }, [scanPartner, scanOpen, resetSession]);

  /**
   * ScanBatchSessionModal 在用户点「确认应用」时一次性把会话内所有 payloads 传回。
   * 我们在这里做：partner 必选校验 → 逐条调用 hook 解析 → 累计 entries + 锁工序 →
   * 任一失败返回 false 保持弹窗打开（toast 已由 hook 给出）。
   */
  const handleScanApply = useCallback(
    async (payloads: ScanPayload[]): Promise<boolean> => {
      if (!scanPartner) {
        toast.warning('请先选择加工厂');
        return false;
      }
      // ScanBatchSessionModal 在用户「确认应用」时一次性回调 onApply 传入会话内所有 payloads，
      // 因此在这一个调用内逐条累加即可，无需跨调用持久化中间结果。
      const accEntries: OutsourceReceiveScanConfirmEntry[] = [];
      let lockedNode: string | null = scanLockedNodeId;
      const currentQuantitiesSnapshot: Record<string, number> = { ...receiveFormQuantities };
      for (const payload of payloads) {
        const res = await applyScanPayload({ payload, currentQuantities: currentQuantitiesSnapshot });
        if (!res) return false;
        // 首条扫入即锁工序
        if (lockedNode == null) lockedNode = res.row.nodeId;
        else if (res.row.nodeId !== lockedNode) {
          const lockName =
            outsourceReceiveRows.find((r) => r.nodeId === lockedNode)?.milestoneName ?? lockedNode;
          toast.error(`本次扫码已锁定工序「${lockName}」，请分批收货`);
          return false;
        }
        accEntries.push({
          key: res.key,
          baseKey: res.baseKey,
          qty: res.qty,
          productName: res.row.productName,
          variantLabel: res.detail.specNote ?? `${res.detail.colorName} / ${res.detail.sizeName}`,
          itemCodeId: res.itemCodeId,
          virtualBatchId: res.virtualBatchId,
        });
        currentQuantitiesSnapshot[res.key] = (currentQuantitiesSnapshot[res.key] ?? 0) + res.qty;
      }
      if (accEntries.length === 0) {
        toast.warning('没有命中的扫码明细');
        return false;
      }
      // 与上次选中的行（手动勾选 / 上次扫码）做合并冲突检查：必须同工厂 + 同工序
      if (receiveSelectedKeys.size > 0) {
        const firstKey = receiveSelectedKeys.values().next().value;
        const firstRow = outsourceReceiveRows.find((r) => outsourceReceiveBaseKey(r) === firstKey);
        if (firstRow) {
          if ((firstRow.partner ?? '') !== scanPartner) {
            toast.error(
              `已勾选的行属于加工厂「${firstRow.partner ?? ''}」，与本次扫码的「${scanPartner}」不同。请先清空已勾选项。`,
            );
            return false;
          }
          if (lockedNode && firstRow.nodeId !== lockedNode) {
            toast.error(
              `已勾选的行属于工序「${firstRow.milestoneName}」，与本次扫码的工序不同。请先清空已勾选项。`,
            );
            return false;
          }
        }
      }
      // 同步工序锁定状态用于 UI 徽标
      setScanLockedNodeId(lockedNode);
      // 提交给父组件合并 + 跳转录入弹窗
      onScanConfirm({
        partner: scanPartner,
        nodeId: lockedNode!,
        entries: accEntries,
      });
      // 关闭扫码会话；ScanBatchSessionModal 的 onApply 返回非 false 时会自调 onClose
      setScanOpen(false);
      setScanPartner('');
      setScanLockedNodeId(null);
      return true;
    },
    [
      scanPartner,
      scanLockedNodeId,
      receiveFormQuantities,
      applyScanPayload,
      outsourceReceiveRows,
      receiveSelectedKeys,
      onScanConfirm,
    ],
  );

  /** ScanBatchSessionModal preview：解析 token 取展示字段（不做命中/上限校验） */
  const handleScanPreview = useCallback(
    async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      if (!scanPartner) {
        toast.warning('请先选择加工厂');
        return null;
      }
      return resolveScanRowPreview(payload);
    },
    [scanPartner, resolveScanRowPreview],
  );

  const lockedNodeName = useMemo(() => {
    if (!scanLockedNodeId) return null;
    return (
      outsourceReceiveRows.find((r) => r.nodeId === scanLockedNodeId)?.milestoneName ??
      scanLockedNodeId
    );
  }, [scanLockedNodeId, outsourceReceiveRows]);

  /** 扫码会话顶部插槽：加工厂下拉 + 工序锁定徽标 */
  const scanHeaderSlot = (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          加工厂（必选）
        </label>
        {lockedNodeName ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <Lock className="h-3 w-3" /> 工序已锁定 · {lockedNodeName}
          </span>
        ) : null}
      </div>
      <SearchablePartnerSelect
        options={scanPartnerSelectOptions}
        value={scanPartner}
        onChange={(name) => setScanPartner(name)}
        placeholder="搜索加工厂名称"
        compact
        showCategoryHint={false}
        portalZIndex={10100}
        triggerClassName="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
      />
      <p className="text-[10px] leading-snug text-slate-500">
        选择加工厂后才能开始扫码；切换加工厂将清空已扫列表。首条扫入将锁定工序。
      </p>
    </div>
  );

  const filteredRows = useMemo(() => {
    const orderKw = (searchOrder || '').trim().toLowerCase();
    const productKw = (searchProduct || '').trim().toLowerCase();
    const partnerKw = (searchPartner || '').trim().toLowerCase();
    return outsourceReceiveRows.filter(row => {
      if (showOrderNumberCol && orderKw && row.orderNumber != null && !(row.orderNumber || '').toLowerCase().includes(orderKw))
        return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (partnerKw && !(row.partner || '').toLowerCase().includes(partnerKw)) return false;
      if (searchNodeId && row.nodeId !== searchNodeId) return false;
      return true;
    });
  }, [outsourceReceiveRows, searchOrder, searchProduct, searchPartner, searchNodeId, products, showOrderNumberCol]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6">
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ArrowDownToLine className="h-5 w-5 shrink-0 text-indigo-600" /> 待收回清单
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 sm:px-6">
          <p className="text-xs leading-relaxed text-slate-500">
            已发出未收回的外协单。可勾选行后批量收货，或点「扫码收货」选好加工厂后用扫码枪自动命中明细。
          </p>
        </div>
        <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-3 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-3">
            {showOrderNumberCol ? (
              <div className="flex min-w-0 flex-col gap-1 lg:w-[11rem] lg:shrink-0">
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">单号</label>
                <input
                  type="text"
                  value={searchOrder}
                  onChange={e => setSearchOrder(e.target.value)}
                  placeholder="工单号模糊搜索"
                  className="w-full min-w-0 rounded-lg border border-slate-200 py-2 pl-3 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1 lg:min-w-[12rem] lg:flex-1 lg:max-w-[18rem]">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">货号</label>
              <input
                type="text"
                value={searchProduct}
                onChange={e => setSearchProduct(e.target.value)}
                placeholder="产品名 / SKU 模糊搜索"
                className="w-full min-w-0 rounded-lg border border-slate-200 py-2 pl-3 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1 lg:w-[11rem] lg:shrink-0">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">外协工厂</label>
              <input
                type="text"
                value={searchPartner}
                onChange={e => setSearchPartner(e.target.value)}
                placeholder="模糊搜索"
                className="w-full min-w-0 rounded-lg border border-slate-200 py-2 pl-3 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1 lg:w-[10rem] lg:shrink-0">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">工序</label>
              <select
                value={searchNodeId}
                onChange={e => setSearchNodeId(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">全部</option>
                {nodeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2 pt-0 sm:px-5">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 shadow-[0_1px_0_0_rgb(226_232_240)]">
                <th className="w-11 px-2 py-2.5 sm:w-12 sm:px-3" scope="col" />
                {showOrderNumberCol ? (
                  <th className="w-[13%] px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3" scope="col">
                    工单号
                  </th>
                ) : null}
                <th
                  className={`px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3 ${showOrderNumberCol ? 'w-[22%]' : 'w-[30%]'}`}
                  scope="col"
                >
                  产品
                </th>
                <th className="w-[11%] px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3" scope="col">
                  工序
                </th>
                <th className="w-[18%] px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3" scope="col">
                  外协厂商
                </th>
                <th
                  className="w-[11%] whitespace-nowrap px-2 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3"
                  scope="col"
                >
                  发出总量
                </th>
                <th
                  className="w-[11%] whitespace-nowrap px-2 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3"
                  scope="col"
                >
                  已收总量
                </th>
                <th
                  className="w-[11%] whitespace-nowrap px-2 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3"
                  scope="col"
                >
                  待收数量
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={tableColCount} className="px-4 py-14 text-center text-sm text-slate-400 sm:px-6 sm:py-16">
                    {outsourceReceiveRows.length === 0 ? '暂无待收回项。' : '无匹配项，请调整搜索条件。'}
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  const key = outsourceReceiveBaseKey(row);
                  const checked = receiveSelectedKeys.has(key);
                  const toggleRow = () => {
                    setReceiveSelectedKeys(prev => {
                      const next = new Set(prev);
                      if (next.has(key)) {
                        next.delete(key);
                        return next;
                      }
                      if (next.size > 0) {
                        const firstKey = next.values().next().value;
                        const firstRow = outsourceReceiveRows.find(
                          r => outsourceReceiveBaseKey(r) === firstKey,
                        );
                        const selectedPartner = firstRow?.partner ?? '';
                        if (selectedPartner !== (row.partner ?? '')) {
                          toast.warning('只能选择同一外协工厂同时收货，请先取消其他加工厂的勾选。');
                          return prev;
                        }
                        if ((firstRow?.nodeId ?? '') !== row.nodeId) {
                          toast.warning('只能选择同一工序同时收货，请先取消其他工序的勾选。');
                          return prev;
                        }
                      }
                      next.add(key);
                      return next;
                    });
                  };
                  const rowSurface = checked
                    ? 'bg-indigo-50/80 hover:bg-indigo-50'
                    : 'bg-white hover:bg-slate-50/80';
                  return (
                    <tr key={key} className={`cursor-pointer transition-colors ${rowSurface}`} onClick={toggleRow}>
                      <td className="w-11 px-2 py-2.5 align-middle sm:w-12 sm:px-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={toggleRow}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      {showOrderNumberCol ? (
                        <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3" title={row.orderNumber || '—'}>
                          <span className="block truncate text-sm font-bold text-slate-800 tabular-nums">
                            {row.orderNumber || <span className="text-slate-300">—</span>}
                          </span>
                        </td>
                      ) : null}
                      <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3">
                        <FlowListProductCell
                          product={products.find(p => p.id === row.productId)}
                          name={row.productName}
                        />
                      </td>
                      <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3" title={row.milestoneName}>
                        <span className="block truncate text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      </td>
                      <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3" title={row.partner || '—'}>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="min-w-0 truncate text-sm font-bold text-slate-700">{row.partner || '—'}</span>
                          {partners.find(p => p.name === row.partner)?.collaborationTenantId ? (
                            <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-600 bg-indigo-50">
                              协作
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:px-3">
                        <span className="text-sm font-bold tabular-nums text-slate-700">{row.dispatched}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:px-3">
                        <span className="text-sm font-bold tabular-nums text-emerald-600">{row.received}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:px-3">
                        <span className="text-sm font-black tabular-nums text-amber-600">{row.pending}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {outsourceReceiveRows.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-5 py-3.5 sm:px-6">
            <span className="text-sm font-bold text-slate-600">
              已选 <span className="tabular-nums text-indigo-700">{receiveSelectedKeys.size}</span> 项
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenScan}
                className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 transition-all hover:bg-indigo-50"
              >
                <ScanLine className="h-4 w-4 shrink-0" /> 扫码收货
              </button>
              <button
                type="button"
                disabled={receiveSelectedKeys.size === 0}
                onClick={onReceiveFormOpen}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4 shrink-0" /> 收货
              </button>
            </div>
          </div>
        )}
      </div>

      <ScanBatchSessionModal
        open={scanOpen}
        onClose={handleCloseScan}
        onApply={handleScanApply}
        resolveRowPreview={handleScanPreview}
        title="外协收货 · 扫码"
        hint="先选加工厂，再用扫码枪扫入二维码；确认后将自动跳到收货录入弹窗。"
        showScanIntentToggle
        headerSlot={scanHeaderSlot}
        scanDisabled={!scanPartner}
        scanDisabledHint="请先在上方选择加工厂后再开始扫码。"
        sessionResetKey={scanPartner}
      />
    </div>
  );
};

export default React.memo(OutsourceReceiveListModal);
