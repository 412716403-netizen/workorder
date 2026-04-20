import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Truck, X, ChevronDown, ChevronRight } from 'lucide-react';
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
import { computeCollaborationReturnableRows, resolveCollabPeerDefaultUnitPriceString, type CollabReturnRow } from './collabHelpers';
import CollabPeerQtyMatrixBlock from './CollabPeerQtyMatrixBlock';

interface CollabPeerReturnModalProps {
  open: boolean;
  onClose: () => void;
  eligibleTransfers: any[];
  /** 同合作单位下的所有 transfers（含历史 returns），用于取上一张回传单的单价 */
  peerTransfers?: any[];
  warehouses: Warehouse[];
  products: Product[];
  prodRecords: ProductionOpRecord[];
  dictionaries: AppDictionaries;
  onDone: () => Promise<void> | void;
}

type TransferBlock = {
  transfer: any;
  selected: boolean;
  expanded: boolean;
  rows: CollabReturnRow[];
  note: string;
  /** 单价（元），写入回传明细供甲方外协收货同步 */
  unitPrice: string;
};

const CollabPeerReturnModal: React.FC<CollabPeerReturnModalProps> = ({
  open, onClose, eligibleTransfers, peerTransfers, warehouses, products, prodRecords, dictionaries, onDone,
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

    // 首次打开：按「合作单位 + 单据类型」记忆回填出库仓库（后续用户手改不覆盖）。
    let effectiveWarehouseId = warehouseId;
    if (isFirstOpen) {
      const peerTid = eligibleTransfers[0]?.senderTenantId ?? '';
      effectiveWarehouseId = resolveCollabOutboundWarehouseId(
        warehouses,
        tenantCtx?.tenantId,
        userId,
        WAREHOUSE_DOC_KIND.COLLAB_RETURN,
        peerTid || undefined,
      );
      setWarehouseId(effectiveWarehouseId);
    }

    const requireWarehouse = warehouses.length > 0;
    setBlocks(prev => {
      const prevById = new Map(prev.map(b => [b.transfer.id, b]));
      const next: TransferBlock[] = [];
      for (const t of eligibleTransfers) {
        const rows = computeCollaborationReturnableRows(
          t, effectiveWarehouseId || undefined, products, prodRecords, dictionaries, requireWarehouse,
        );
        if (rows.length === 0) continue;
        const defaultPrice = resolveCollabPeerDefaultUnitPriceString({
          peerTransfers: peerTransfers ?? eligibleTransfers,
          receiverProductId: t.receiverProductId,
        });
        const existing = !isFirstOpen ? prevById.get(t.id) : undefined;
        if (existing) {
          // 合并：沿用 selected/expanded/note 与用户已填的 unitPrice；rows 按最新可回上限裁剪，保留用户已填数量。
          const mergedRows = rows.map(r => {
            const prevRow = existing.rows.find(er => er.colorName === r.colorName && er.sizeName === r.sizeName);
            let qty = prevRow ? prevRow.qty : String(r.maxReturnable);
            const n = Number(qty);
            if (Number.isFinite(n) && n > r.maxReturnable) qty = String(r.maxReturnable);
            return { ...r, qty };
          });
          const prevPrice = String(existing.unitPrice ?? '').trim();
          next.push({
            ...existing,
            transfer: t,
            rows: mergedRows,
            unitPrice: prevPrice !== '' ? existing.unitPrice : defaultPrice,
          });
        } else {
          next.push({
            transfer: t,
            selected: true,
            expanded: true,
            rows: rows.map(r => ({ ...r, qty: String(r.maxReturnable) })),
            note: '',
            unitPrice: defaultPrice,
          });
        }
      }
      return next;
    });
  }, [
    open, eligibleTransfers, peerTransfers, warehouses, warehouseId, products,
    prodRecords, dictionaries, tenantCtx?.tenantId, userId,
  ]);

  const selectedCount = useMemo(() => blocks.filter(b => b.selected).length, [blocks]);
  const totalEligible = blocks.length;

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
  const updateUnitPrice = (blockIdx: number, value: string) => {
    setBlocks(prev => prev.map((b, i) => i === blockIdx ? { ...b, unitPrice: value } : b));
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
    const payloads: Array<{ transferId: string; productName: string; body: any }> = [];
    for (const b of blocks) {
      if (!b.selected) continue;
      for (const r of b.rows) {
        const q = Number(r.qty) || 0;
        if (q > r.maxReturnable) {
          toast.error(`「${b.transfer.senderProductName}」「${[r.colorName, r.sizeName].filter(Boolean).join('/') || '无规格'}」超过可回传上限 ${r.maxReturnable}`);
          return;
        }
      }
      const up = Number(b.unitPrice);
      const hasUnit = Number.isFinite(up) && up >= 0;
      const items = b.rows
        .map(r => {
          const q = Number(r.qty) || 0;
          if (q <= 0) return null;
          const amount = hasUnit ? Math.round(q * up * 100) / 100 : undefined;
          return {
            colorName: r.colorName,
            sizeName: r.sizeName,
            quantity: q,
            ...(hasUnit ? { unitPrice: up, ...(amount != null ? { amount } : {}) } : {}),
          };
        })
        .filter(Boolean) as Array<{ colorName: string | null; sizeName: string | null; quantity: number; unitPrice?: number; amount?: number }>;
      if (items.length === 0) continue;
      payloads.push({
        transferId: b.transfer.id,
        productName: b.transfer.senderProductName || '',
        body: { items, note: b.note || undefined, warehouseId: warehouseId || undefined },
      });
    }
    if (payloads.length === 0) {
      toast.warning('请至少为一个产品填写回传数量');
      return;
    }

    setSubmitting(true);
    // 串行复用 sharedStockOutDocNo；returnGroupId 整批相同 → 同批一气泡；撤回后再传同单号仍用新 returnGroupId → 新气泡
    const returnGroupId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `rg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let sharedStockOutDocNo: string | null = null;
    const okNames: string[] = [];
    const failList: Array<{ name: string; err: string }> = [];
    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i];
      try {
        const res = (await api.collaboration.createReturn(p.transferId, {
          ...p.body,
          returnGroupId,
          ...(sharedStockOutDocNo ? { sharedStockOutDocNo: sharedStockOutDocNo } : {}),
        })) as { payload?: { stockOutDocNo?: string } };
        okNames.push(p.productName);
        const dn = res?.payload && typeof (res.payload as any).stockOutDocNo === 'string'
          ? String((res.payload as any).stockOutDocNo).trim()
          : '';
        if (!sharedStockOutDocNo && dn) sharedStockOutDocNo = dn;
      } catch (err: any) {
        failList.push({ name: p.productName, err: err?.message || '未知错误' });
        if (okNames.length === 0) break;
      }
    }
    setSubmitting(false);

    const ok = okNames.length;
    const peerTid = eligibleTransfers[0]?.senderTenantId;
    if (warehouseId && ok > 0) {
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.COLLAB_RETURN, { warehouseId });
      if (peerTid) {
        writeCollabPeerWarehousePreference(
          tenantCtx?.tenantId,
          userId,
          WAREHOUSE_DOC_KIND.COLLAB_RETURN,
          peerTid,
          { warehouseId },
        );
      }
    }

    if (failList.length === 0) {
      toast.success(`已提交回传 ${ok} 条（自动从仓库出库）${sharedStockOutDocNo ? `，单号 ${sharedStockOutDocNo}` : ''}`);
    } else if (ok > 0) {
      toast.error(`${ok} 条成功 / ${failList.length} 条失败：${failList[0].name}：${failList[0].err}`, { duration: 8000 });
    } else {
      toast.error(`全部失败：${failList[0].err}`, { duration: 8000 });
    }

    if (ok > 0) {
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
            <Truck className="w-5 h-5 text-emerald-600" /> 批量回传
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
                className="flex-1 bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">请选择仓库</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {totalEligible > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
              >
                {allSelected ? '全部取消' : '全部选中'}
              </button>
              <span className="text-slate-500">
                可回传 = 甲方发出总量 − 已回传总量，按颜色/尺码汇总。请按需勾选产品并填写本次回传数量。
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50">
          {blocks.length === 0 && (
            <div className="py-10 text-center text-slate-400 text-sm">
              {warehouses.length > 0 && !warehouseId
                ? '请先选择出库仓库以查看可回传产品'
                : '该合作单位暂无可回传产品（库存不足或已全部回传）'}
            </div>
          )}
          {blocks.map((b, blockIdx) => {
            return (
              <div key={b.transfer.id} className={`rounded-xl border ${b.selected ? 'border-emerald-300 bg-white' : 'border-slate-200 bg-white/60'} overflow-hidden`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={b.selected}
                    onChange={() => toggleSelect(blockIdx)}
                    className="w-4 h-4 accent-emerald-600"
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
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {b.rows.length} 个规格可回传
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
                      unitPrice={b.unitPrice}
                      onUnitPriceChange={updateUnitPrice}
                      rows={b.rows}
                      capColumnTitle="可回"
                      ringClass="focus:ring-2 focus:ring-emerald-500"
                      onUpdateRow={updateRow}
                    />
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
                      <input
                        type="text"
                        value={b.note}
                        onChange={e => updateNote(blockIdx, e.target.value)}
                        disabled={!b.selected}
                        placeholder="该产品回传备注（可选）"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
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
            disabled={submitting || selectedCount === 0 || (warehouses.length > 0 && !warehouseId)}
            onClick={submit}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '提交中...' : `确认回传${selectedCount > 0 ? `（${selectedCount}）` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabPeerReturnModal);
