import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Forward, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import QtyMatrixTable from '../../components/variant-matrix/QtyMatrixTable';
import { collabPayloadItemsToQtyMatrixProps, type CollabPayloadItem } from './collabDocDisplay';
import { resolvePreferredCollabMatrixOrder } from './collabHelpers';
import { AMOUNT_PERMISSION_KEYS, useCanViewAmount } from '../../utils/canViewAmount';

interface CollabForwardDetailModalProps {
  open: boolean;
  onClose: () => void;
  /** 同一派发单号下的链式子 transfer 列表（与收件箱转发气泡一致） */
  siblings: any[];
  onDone: () => Promise<void> | void;
}

type Row = {
  transfer: any;
  transferId: string;
  productName: string;
  productSku: string;
  nextStepLabel: string;
  items: CollabPayloadItem[];
  note: string;
  docNo: string;
  qty: number;
  selected: boolean;
  /** 甲方是否仍可点「确认转发」 */
  canConfirm: boolean;
  /** 乙方申报单价（originSettlement），下一站不可见 */
  originUnitPrice: number | null;
};

function sumItemsQty(items: any[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  let t = 0;
  for (const it of items) t += Number(it?.quantity) || 0;
  return t;
}

const CollabForwardDetailModal: React.FC<CollabForwardDetailModalProps> = ({ open, onClose, siblings, onDone }) => {
  const showCollabAmount = useCanViewAmount(AMOUNT_PERMISSION_KEYS.COLLABORATION);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const list = (siblings || []).filter(Boolean);
      const next: Row[] = list.map(t => {
        const allItems: CollabPayloadItem[] = (t.dispatches || []).flatMap((d: any) => d.payload?.items ?? []);
        const qty = sumItemsQty(allItems);
        const route = t.outsourceRouteSnapshot as any[] | undefined;
        const currStep = Array.isArray(route) ? route.find((s: any) => s.stepOrder === t.chainStep) : null;
        const nextStepLabel = currStep
          ? `${currStep.nodeName ?? '未命名工序'} · ${currStep.receiverTenantName ?? '未知工厂'}`
          : `链上 ${t.chainStep ?? 0} 步`;
        const firstDispatch = (t.dispatches || [])[0];
        const fp = firstDispatch?.payload as any;
        const docNo = fp?.stockOutDocNo || '';
        const note = fp?.note || '';
        const up = Number(fp?.originSettlement?.unitPrice);
        const originUnitPrice = Number.isFinite(up) && up >= 0 ? up : null;
        const canConfirm = t.senderTenantName === '本企业' && !t.originConfirmedAt;
        return {
          transfer: t,
          transferId: t.id,
          productName: t.senderProductName || '—',
          productSku: t.senderProductSku || '',
          nextStepLabel,
          items: allItems,
          note,
          docNo,
          qty,
          selected: true,
          canConfirm,
          originUnitPrice,
        };
      });
      setRows(next);
    }
    prevOpenRef.current = open;
  }, [open, siblings]);

  const hasAnyConfirmable = useMemo(() => rows.some(r => r.canConfirm), [rows]);
  const selectedPendingCount = useMemo(() => rows.filter(r => r.selected && r.canConfirm).length, [rows]);

  const matrices = useMemo(
    () => rows.map(r => {
      const fp = (r.transfer.dispatches || [])[0]?.payload;
      const ord = resolvePreferredCollabMatrixOrder({ payload: fp });
      return collabPayloadItemsToQtyMatrixProps(r.items, { ...ord });
    }),
    [rows],
  );

  const allConfirmableSelected =
    rows.filter(r => r.canConfirm).length > 0 && rows.filter(r => r.canConfirm).every(r => r.selected);

  const toggleOne = (idx: number) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r)));
  };
  const toggleAll = () => {
    const confirmable = rows.filter(r => r.canConfirm);
    if (confirmable.length === 0) return;
    const allSel = confirmable.every(r => r.selected);
    setRows(prev => prev.map(r => (r.canConfirm ? { ...r, selected: !allSel } : r)));
  };

  const submit = async () => {
    const pending = rows.filter(r => r.selected && r.canConfirm);
    if (pending.length === 0) {
      toast.warning('没有可确认的转发单（可能已全部确认）');
      return;
    }
    setSubmitting(true);
    const results = await Promise.allSettled(
      pending.map(r => api.collaboration.confirmForward(r.transferId)),
    );
    setSubmitting(false);

    let okCount = 0;
    results.forEach(r => {
      if (r.status === 'fulfilled') okCount++;
    });

    if (okCount === pending.length) {
      toast.success(`已确认转发 ${okCount} 条（自动生成外协收回+发出流水）`);
    } else if (okCount > 0) {
      toast.error(`${okCount} 成功 / ${pending.length - okCount} 失败`, { duration: 8000 });
    } else {
      toast.error(`确认转发失败：${(results[0] as PromiseRejectedResult).reason?.message || '未知错误'}`, { duration: 8000 });
    }

    if (okCount > 0) {
      onClose();
      await onDone();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭" className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-[1] w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2 min-w-0">
            <Forward className="w-5 h-5 text-orange-600 shrink-0" />
            <span>转发单详情</span>
            {rows[0]?.docNo ? (
              <span className="text-xs font-bold text-slate-500 truncate">单号 {rows[0].docNo}</span>
            ) : null}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/80">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">无转发数据</div>
          ) : (
            rows.map((r, idx) => (
              <div key={r.transferId} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div
                  className={`flex items-start gap-3 px-4 py-3 border-b border-slate-100${r.canConfirm ? ' cursor-pointer' : ''}`}
                  onClick={r.canConfirm ? () => toggleOne(idx) : undefined}
                >
                  <div className="shrink-0 pt-0.5" onClick={e => e.stopPropagation()}>
                    {r.canConfirm ? (
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => toggleOne(idx)}
                        className="w-4 h-4 mt-0.5 accent-orange-600"
                        aria-label="选中确认"
                      />
                    ) : (
                      <span className="w-4 h-4 mt-0.5 shrink-0 inline-block" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{r.productName}</span>
                      {r.productSku ? <span className="text-xs font-bold text-slate-500">{r.productSku}</span> : null}
                      {!r.canConfirm && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">已确认</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      下一站 <span className="font-bold text-orange-700">{r.nextStepLabel}</span>
                      <span className="mx-2">·</span>
                      <span className="font-bold text-slate-700 tabular-nums">{r.qty} 件</span>
                    </p>
                    {r.note ? <p className="text-[11px] text-slate-500 mt-1">备注：{r.note}</p> : null}
                  </div>
                </div>
                <div className="p-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">数量明细</h4>
                  {matrices[idx]?.rows?.length ? (
                    <QtyMatrixTable sizeHeaders={matrices[idx]!.sizeHeaders} rows={matrices[idx]!.rows} />
                  ) : (
                    <p className="text-xs text-slate-400">无规格明细</p>
                  )}
                  {showCollabAmount && r.originUnitPrice != null && (
                    <p className="mt-3 text-[11px] text-amber-900/90 rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2">
                      <span className="font-bold">乙方申报单价（确认转发后写入甲方外协收货）：</span>
                      <span className="tabular-nums font-black">{r.originUnitPrice}</span> 元/件
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
          {rows.filter(x => x.canConfirm).length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              {allConfirmableSelected ? '取消全选' : '全选待确认'}
            </button>
          )}
          <div className="flex-1 min-w-[8rem]" />
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">
            关闭
          </button>
          {hasAnyConfirmable && (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || selectedPendingCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {submitting ? '确认中…' : `确认转发${selectedPendingCount > 0 ? `（${selectedPendingCount}）` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabForwardDetailModal);
