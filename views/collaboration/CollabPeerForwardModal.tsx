import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Forward, X, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  writeWarehousePreference,
  writeCollabPeerWarehousePreference,
  resolveCollabOutboundWarehouseId,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import type { Product, ProductionOpRecord, AppDictionaries, Warehouse } from '../../types';
import {
  computeCollaborationForwardableRows,
  getNextForwardStep,
  getNextForwardStepKey,
  type CollabReturnRow,
} from './collabHelpers';
import CollabPeerQtyMatrixBlock from './CollabPeerQtyMatrixBlock';

interface CollabPeerForwardModalProps {
  open: boolean;
  onClose: () => void;
  eligibleTransfers: any[];
  warehouses: Warehouse[];
  products: Product[];
  prodRecords: ProductionOpRecord[];
  dictionaries: AppDictionaries;
  onDone: () => Promise<void> | void;
}

type TransferBlock = {
  transfer: any;
  nextStepKey: string | null;
  nextStepLabel: string;
  selected: boolean;
  expanded: boolean;
  rows: CollabReturnRow[];
  note: string;
};

const CollabPeerForwardModal: React.FC<CollabPeerForwardModalProps> = ({
  open, onClose, eligibleTransfers, warehouses, products, prodRecords, dictionaries, onDone,
}) => {
  const { tenantCtx, userId } = useAuth();
  const [warehouseId, setWarehouseId] = useState('');
  const [blocks, setBlocks] = useState<TransferBlock[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    const isFirstOpen = !prevOpenRef.current;
    prevOpenRef.current = true;

    let effectiveWarehouseId = warehouseId;
    if (isFirstOpen) {
      const peerTid = eligibleTransfers[0]?.senderTenantId ?? '';
      effectiveWarehouseId = resolveCollabOutboundWarehouseId(
        warehouses,
        tenantCtx?.tenantId,
        userId,
        WAREHOUSE_DOC_KIND.COLLAB_FORWARD,
        peerTid || undefined,
      );
      setWarehouseId(effectiveWarehouseId);
    }

    setBlocks(prev => {
      const prevById = new Map(prev.map(b => [b.transfer.id, b]));
      const next: TransferBlock[] = [];
      for (const t of eligibleTransfers) {
        const rows = computeCollaborationForwardableRows(
          t, effectiveWarehouseId || undefined, products, prodRecords, dictionaries,
        );
        if (rows.length === 0) continue;
        const step = getNextForwardStep(t);
        const nextStepLabel = step
          ? `${step.nodeName ?? '未命名工序'} · ${step.receiverTenantName ?? '未知工厂'}`
          : '下一站未知';
        const existing = !isFirstOpen ? prevById.get(t.id) : undefined;
        if (existing) {
          const mergedRows = rows.map(r => {
            const prevRow = existing.rows.find(er => er.colorName === r.colorName && er.sizeName === r.sizeName);
            let qty = prevRow ? prevRow.qty : String(r.maxReturnable);
            const n = Number(qty);
            if (Number.isFinite(n) && n > r.maxReturnable) qty = String(r.maxReturnable);
            return { ...r, qty };
          });
          next.push({
            ...existing,
            transfer: t,
            nextStepKey: getNextForwardStepKey(t),
            nextStepLabel,
            rows: mergedRows,
          });
        } else {
          next.push({
            transfer: t,
            nextStepKey: getNextForwardStepKey(t),
            nextStepLabel,
            selected: true,
            expanded: true,
            rows: rows.map(r => ({ ...r, qty: String(r.maxReturnable) })),
            note: '',
          });
        }
      }
      return next;
    });
  }, [
    open, eligibleTransfers, warehouses, warehouseId, products,
    prodRecords, dictionaries, tenantCtx?.tenantId, userId,
  ]);

  const selectedBlocks = useMemo(() => blocks.filter(b => b.selected), [blocks]);
  const selectedCount = selectedBlocks.length;
  const totalEligible = blocks.length;

  // 下一站一致性校验
  const nextStepInconsistent = useMemo(() => {
    if (selectedBlocks.length < 2) return false;
    const firstKey = selectedBlocks[0].nextStepKey;
    return selectedBlocks.some(b => b.nextStepKey !== firstKey);
  }, [selectedBlocks]);

  if (!open) return null;

  const updateRow = (blockIdx: number, rowIdx: number, qty: string) => {
    setBlocks(prev => prev.map((b, i) => i === blockIdx
      ? { ...b, rows: b.rows.map((r, j) => (j === rowIdx ? { ...r, qty } : r)) }
      : b));
  };
  const toggleSelect = (blockIdx: number) => {
    setBlocks(prev => prev.map((b, i) => i === blockIdx ? { ...b, selected: !b.selected } : b));
  };
  const toggleExpand = (blockIdx: number) => {
    setBlocks(prev => prev.map((b, i) => i === blockIdx ? { ...b, expanded: !b.expanded } : b));
  };
  const updateNote = (blockIdx: number, note: string) => {
    setBlocks(prev => prev.map((b, i) => i === blockIdx ? { ...b, note } : b));
  };
  const toggleSelectAll = () => {
    const all = blocks.every(b => b.selected);
    setBlocks(prev => prev.map(b => ({ ...b, selected: !all })));
  };

  const submit = async () => {
    if (warehouses.length > 0 && !warehouseId) {
      toast.warning('请选择出库仓库');
      return;
    }
    if (selectedCount === 0) {
      toast.warning('请至少勾选一个产品');
      return;
    }
    if (nextStepInconsistent) {
      toast.error('所选产品的下一站加工厂/工序不一致，请分开转发');
      return;
    }
    const payloads: Array<{ transferId: string; productName: string; body: any }> = [];
    for (const b of selectedBlocks) {
      for (const r of b.rows) {
        const q = Number(r.qty) || 0;
        if (q > r.maxReturnable) {
          toast.error(`「${b.transfer.senderProductName}」「${[r.colorName, r.sizeName].filter(Boolean).join('/') || '无规格'}」超过可转发上限 ${r.maxReturnable}`);
          return;
        }
      }
      /** 转发单不携带单价/金额：下一站加工厂视图、甲方确认转发气泡均按数量展示。 */
      const items = b.rows
        .map(r => {
          const q = Number(r.qty) || 0;
          if (q <= 0) return null;
          return { colorName: r.colorName, sizeName: r.sizeName, quantity: q };
        })
        .filter(Boolean) as Array<{ colorName: string | null; sizeName: string | null; quantity: number }>;
      if (items.length === 0) continue;
      payloads.push({
        transferId: b.transfer.id,
        productName: b.transfer.senderProductName || '',
        body: { items, note: b.note || undefined, warehouseId: warehouseId || undefined },
      });
    }
    if (payloads.length === 0) {
      toast.warning('请为所选产品填写转发数量');
      return;
    }

    setSubmitting(true);
    // 串行以复用 sharedDispatchDocNo —— 第 1 条失败即整批中止。
    let sharedDocNo: string | null = null;
    const okList: string[] = [];
    const failList: Array<{ name: string; err: string }> = [];
    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i];
      try {
        const res = await api.collaboration.forwardTransfer(p.transferId, {
          ...p.body,
          ...(sharedDocNo ? { sharedDispatchDocNo: sharedDocNo } : {}),
        });
        okList.push(p.productName);
        if (!sharedDocNo && res?.dispatchDocNo) sharedDocNo = res.dispatchDocNo;
      } catch (err: any) {
        failList.push({ name: p.productName, err: err?.message || '未知错误' });
        if (okList.length === 0) {
          // 第一条失败：尚未生成共用单号，直接中止整批
          break;
        }
        // 已有成功项（共用单号已生成）：继续尝试剩余项（保持同单号语义）
      }
    }
    setSubmitting(false);

    const peerTid = eligibleTransfers[0]?.senderTenantId;
    if (warehouseId && okList.length > 0) {
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.COLLAB_FORWARD, { warehouseId });
      if (peerTid) {
        writeCollabPeerWarehousePreference(
          tenantCtx?.tenantId,
          userId,
          WAREHOUSE_DOC_KIND.COLLAB_FORWARD,
          peerTid,
          { warehouseId },
        );
      }
    }

    if (failList.length === 0) {
      toast.success(`已转发 ${okList.length} 个产品到下一站${sharedDocNo ? `，单号 ${sharedDocNo}` : ''}`);
    } else if (okList.length > 0) {
      toast.error(`${okList.length} 成功 / ${failList.length} 失败：${failList[0].name}：${failList[0].err}`, { duration: 8000 });
    } else {
      toast.error(`转发失败：${failList[0].err}`, { duration: 8000 });
    }

    if (okList.length > 0) {
      onClose();
      await onDone();
    }
  };

  const allSelected = totalEligible > 0 && blocks.every(b => b.selected);

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-[1] w-full max-w-5xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Forward className="w-5 h-5 text-orange-500" /> 批量转发到下一站
            <span className="text-xs text-slate-500 font-bold">
              {selectedCount}/{totalEligible} 个产品
            </span>
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0 space-y-3">
          {warehouses.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-black text-slate-500 uppercase shrink-0">出库仓库</label>
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none"
              >
                <option value="">请选择仓库</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {totalEligible > 1 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
              >
                {allSelected ? '全部取消' : '全部选中'}
              </button>
            )}
            <span className="text-slate-500">
              多产品同时转发必须「下一站加工厂/工序一致」。批量成功后对方会看到同一张派发单号下的多产品。
            </span>
          </div>
          {nextStepInconsistent && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-medium">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              所选产品的下一站加工厂/工序不一致，请仅勾选相同下一站的产品，或分开多次转发。
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50">
          {blocks.length === 0 && (
            <div className="py-10 text-center text-slate-400 text-sm">
              {warehouses.length > 0 && !warehouseId
                ? '请先选择出库仓库以查看可转发产品'
                : '该合作单位暂无可转发产品（库存不足或已全部转发）'}
            </div>
          )}
          {blocks.map((b, blockIdx) => {
            return (
              <div key={b.transfer.id} className={`rounded-xl border ${b.selected ? 'border-orange-300 bg-white' : 'border-slate-200 bg-white/60'} overflow-hidden`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={b.selected}
                    onChange={() => toggleSelect(blockIdx)}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => toggleExpand(blockIdx)}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-600"
                  >
                    {b.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-slate-900 truncate">
                      {b.transfer.senderProductName || '—'}
                      {b.transfer.senderProductSku && <span className="ml-2 text-xs font-bold text-slate-500">{b.transfer.senderProductSku}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      下一站：<span className="font-bold text-slate-700">{b.nextStepLabel}</span>
                    </div>
                  </div>
                </div>
                {b.expanded && (
                  <div>
                    <CollabPeerQtyMatrixBlock
                      blockIdx={blockIdx}
                      selected={b.selected}
                      productName={
                        products.find(p => p.id === b.transfer.receiverProductId)?.name
                        || b.transfer.senderProductName
                        || '—'
                      }
                      productSku={
                        products.find(p => p.id === b.transfer.receiverProductId)?.sku
                        ?? b.transfer.senderProductSku
                      }
                      showPricing={false}
                      rows={b.rows}
                      capColumnTitle="可转"
                      ringClass="focus:ring-2 focus:ring-orange-500"
                      onUpdateRow={updateRow}
                    />
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
                      <input
                        type="text"
                        value={b.note}
                        onChange={e => updateNote(blockIdx, e.target.value)}
                        disabled={!b.selected}
                        placeholder="该产品转发备注（可选）"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button
            disabled={submitting || selectedCount === 0 || nextStepInconsistent || (warehouses.length > 0 && !warehouseId)}
            onClick={submit}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? '转发中...' : `确认转发${selectedCount > 0 ? `（${selectedCount}）` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabPeerForwardModal);
