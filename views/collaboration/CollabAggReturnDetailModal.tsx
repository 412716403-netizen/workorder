import React, { useState } from 'react';
import { Truck, X, RotateCcw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import * as api from '../../services/api';
import type { AppDictionaries, Product } from '../../types';
import { collabFirstDispatchPayload, returnStatusLabel, resolvePreferredCollabMatrixOrder } from './collabHelpers';
import QtyMatrixTable from '../../components/variant-matrix/QtyMatrixTable';
import {
  collabPayloadItemsToQtyMatrixProps,
  CollabDocQtyPriceFooter,
  firstFiniteCollabUnitPrice,
  type CollabPayloadItem,
} from './collabDocDisplay';

export interface AggReturnItem {
  doc: any;
  transfer: any;
}

interface CollabAggReturnDetailModalProps {
  open: boolean;
  docNo: string;
  items: AggReturnItem[];
  products: Product[];
  dictionaries: AppDictionaries;
  onClose: () => void;
  onRefreshList: () => void | Promise<void>;
  onRefreshProdRecords?: () => void | Promise<void>;
  onRefreshOrders?: () => void | Promise<void>;
  onRefreshPMP?: () => void | Promise<void>;
}

function sumItemsQty(items: any[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  let t = 0;
  for (const it of items) t += Number(it?.quantity) || 0;
  return t;
}

const CollabAggReturnDetailModal: React.FC<CollabAggReturnDetailModalProps> = ({
  open,
  docNo,
  items,
  products,
  dictionaries,
  onClose,
  onRefreshList,
  onRefreshProdRecords,
  onRefreshOrders,
  onRefreshPMP,
}) => {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  if (!open || !items.length) return null;

  const t0 = items[0].transfer;
  const iAmReceiver = items.some(({ transfer }) => transfer.receiverTenantName === '本企业');
  const iAmSender = items.some(({ transfer }) => transfer.senderTenantName === '本企业');
  const peerName = t0.receiverTenantName === '本企业' ? t0.senderTenantName : t0.receiverTenantName;

  const totalQty = items.reduce((s, { doc }) => s + sumItemsQty(doc?.payload?.items), 0);
  /** 仍待甲方收回的子单（已撤回/已收回的不参与「整单撤回」条件） */
  const pendingItems = items.filter(({ doc }) => doc.status === 'PENDING_A_RECEIVE');
  const isPartyB = iAmReceiver;
  const canWithdrawRemaining = isPartyB && pendingItems.length > 0;

  const handleWithdrawWhole = async () => {
    const pending = items.filter(({ doc }) => doc.status === 'PENDING_A_RECEIVE');
    if (!pending.length) return;
    const allStillPending = pending.length === items.length;
    const ok = await confirm({
      message: allStillPending
        ? `确认撤回整张回传单（共 ${items.length} 个产品）？将删除同一张出库单号下的协作回传出库记录。`
        : `确认撤回本出库单号下仍「待甲方收回」的 ${pending.length} 条回传？已撤回或已收回的条目不受影响。`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = (await api.collaboration.withdrawReturn(pending[0].doc.id)) as { withdrawnCount?: number };
      const n = res?.withdrawnCount ?? pending.length;
      toast.success(n > 1 ? `已撤回 ${n} 条关联回传` : '已撤回回传');
      await onRefreshList();
      await onRefreshProdRecords?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReceiveAll = async () => {
    if (!pendingItems.length) return;
    const ok = await confirm({
      message: `确认收货本出库单号下仍「待甲方收回」的 ${pendingItems.length} 条回传？将逐条生成外协收回记录并更新进度。`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        pendingItems.map(({ doc }) => api.collaboration.receiveReturn(doc.id)),
      );
      const fails = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      const okn = results.length - fails.length;
      if (fails.length === 0) {
        toast.success(okn > 1 ? `已确认收货 ${okn} 条` : '已确认收货');
      } else if (okn > 0) {
        toast.error(
          `成功 ${okn} 条 / 失败 ${fails.length} 条：${(fails[0] as PromiseRejectedResult).reason?.message || '未知错误'}`,
          { duration: 8000 },
        );
      } else {
        toast.error(`确认收货失败：${(fails[0] as PromiseRejectedResult).reason?.message || '未知错误'}`, { duration: 8000 });
      }
      if (okn > 0) {
        await onRefreshList();
        await onRefreshProdRecords?.();
        await onRefreshOrders?.();
        await onRefreshPMP?.();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭" className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-[1] flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-black text-slate-900">
            <Truck className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="shrink-0">回传单（聚合）</span>
          </h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">单据基本信息</h4>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <div>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">对方单位</span>
                <span className="font-bold break-all text-slate-800">{peerName || '—'}</span>
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">出库单号</span>
                <span className="break-all text-xs font-bold text-slate-800">{docNo || '—'}</span>
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">合计数量</span>
                <span className="font-bold text-indigo-700 tabular-nums">{totalQty} 件</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {items.map(({ doc, transfer }) => {
              const rows: any[] = doc?.payload?.items ?? [];
              const sub = sumItemsQty(rows);
              const receiverProduct = products.find(p => p.id === transfer.receiverProductId) ?? null;
              const ord = resolvePreferredCollabMatrixOrder({
                payload: collabFirstDispatchPayload(transfer) ?? doc?.payload,
                product: receiverProduct,
                dictionaries,
              });
              const specMatrix = collabPayloadItemsToQtyMatrixProps(rows, { ...ord });
              const subUnit = firstFiniteCollabUnitPrice(rows as CollabPayloadItem[]);
              const subLineAmt = subUnit != null ? sub * subUnit : null;
              return (
                <div key={doc.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                    <div className="min-w-0">
                      <span className="truncate text-sm font-black text-slate-900">{transfer.senderProductName || '—'}</span>
                      {transfer.senderProductSku ? (
                        <span className="ml-2 text-xs font-bold text-slate-500">{transfer.senderProductSku}</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 tabular-nums">{sub} 件</span>
                      {returnStatusLabel(doc.status)}
                    </div>
                  </div>
                  {specMatrix.rows.length === 0 ? (
                    <div className="px-4 py-3 text-center text-xs text-slate-400">无明细</div>
                  ) : (
                    <div className="p-3">
                      <QtyMatrixTable sizeHeaders={specMatrix.sizeHeaders} rows={specMatrix.rows} />
                      <CollabDocQtyPriceFooter lineQty={sub} resolvedUnitPrice={subUnit} lineAmount={subLineAmt} />
                    </div>
                  )}
                  {doc?.payload?.note ? (
                    <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-xs text-slate-600">
                      <span className="font-bold text-slate-500">备注：</span>
                      {doc.payload.note}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {(iAmSender || isPartyB) && (
          <div className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {iAmSender && pendingItems.length > 0 && (
              <button
                type="button"
                onClick={handleConfirmReceiveAll}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4 shrink-0" />
                {busy ? '处理中…' : `确认收货（${pendingItems.length} 条）`}
              </button>
            )}
            {isPartyB && (
              <>
                {canWithdrawRemaining ? (
                  <button
                    type="button"
                    onClick={handleWithdrawWhole}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-800 transition-all hover:bg-slate-300 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {busy ? '撤回中…' : pendingItems.length === items.length ? '撤回整单' : `撤回待收回（${pendingItems.length} 条）`}
                  </button>
                ) : (
                  <p className="text-center text-xs font-medium text-slate-500">
                    当前无可撤回：本单号下回传均已撤回或已收回。
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(CollabAggReturnDetailModal);
