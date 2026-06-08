import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, X, Truck } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import QtyMatrixTable from '../../components/variant-matrix/QtyMatrixTable';
import { collabPayloadItemsToQtyMatrixProps, type CollabPayloadItem } from './collabDocDisplay';
import { resolvePreferredCollabMatrixOrder } from './collabHelpers';
import { AMOUNT_PERMISSION_KEYS, useCanViewAmount } from '../../utils/canViewAmount';

interface CollabPeerConfirmForwardModalProps {
  open: boolean;
  onClose: () => void;
  transfers: any[];
  onDone: () => Promise<void> | void;
}

type Row = {
  transferId: string;
  transfer: any;
  productName: string;
  productSku: string;
  createdAt: string;
  qty: number;
  chainStep: number;
  nextStepLabel: string;
  items: CollabPayloadItem[];
  note: string;
  docNo: string;
  selected: boolean;
  originUnitPrice: number | null;
};

function sumItemsQty(items: any[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  let t = 0;
  for (const it of items) t += Number(it?.quantity) || 0;
  return t;
}

const CollabPeerConfirmForwardModal: React.FC<CollabPeerConfirmForwardModalProps> = ({ open, onClose, transfers, onDone }) => {
  const showCollabAmount = useCanViewAmount(AMOUNT_PERMISSION_KEYS.COLLABORATION);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const next: Row[] = transfers.map(t => {
        const allItems: CollabPayloadItem[] = (t.dispatches || []).flatMap((d: any) => d.payload?.items ?? []);
        const qty = sumItemsQty(allItems);
        const route = t.outsourceRouteSnapshot as any[] | undefined;
        const currStep = Array.isArray(route) ? route.find((s: any) => s.stepOrder === t.chainStep) : null;
        const nextStepLabel = currStep
          ? `${currStep.nodeName ?? '未命名工序'} · ${currStep.receiverTenantName ?? '未知工厂'}`
          : `链上 ${t.chainStep} 步`;
        const firstDispatch = (t.dispatches || [])[0];
        const fp = firstDispatch?.payload as any;
        const docNo = fp?.stockOutDocNo || '';
        const note = fp?.note || '';
        const up = Number(fp?.originSettlement?.unitPrice);
        const originUnitPrice = Number.isFinite(up) && up >= 0 ? up : null;
        return {
          transferId: t.id,
          transfer: t,
          productName: t.senderProductName || '—',
          productSku: t.senderProductSku || '',
          createdAt: t.createdAt,
          qty,
          chainStep: t.chainStep || 0,
          nextStepLabel,
          items: allItems,
          note,
          docNo,
          selected: true,
          originUnitPrice,
        };
      });
      setRows(next);
    }
    prevOpenRef.current = open;
  }, [open, transfers]);

  const selectedCount = useMemo(() => rows.filter(r => r.selected).length, [rows]);
  /** 所有已选行合计件数（转发单不携带价格，只汇总数量） */
  const selectedTotalQty = useMemo(
    () => rows.reduce((s, r) => s + (r.selected ? r.qty : 0), 0),
    [rows],
  );

  /** 预生成各行规格矩阵；转发链不含价格，矩阵按纯数量渲染。 */
  const rowMatrices = useMemo(
    () => rows.map(r => {
      const fp = (r.transfer.dispatches || [])[0]?.payload;
      const ord = resolvePreferredCollabMatrixOrder({ payload: fp });
      return collabPayloadItemsToQtyMatrixProps(r.items, { ...ord });
    }),
    [rows],
  );

  if (!open) return null;

  const toggleOne = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };
  const toggleAll = () => {
    const all = rows.every(r => r.selected);
    setRows(prev => prev.map(r => ({ ...r, selected: !all })));
  };

  const submit = async () => {
    const targets = rows.filter(r => r.selected);
    if (targets.length === 0) {
      toast.warning('请至少勾选一条待确认转发');
      return;
    }
    setSubmitting(true);
    const results = await Promise.allSettled(
      targets.map(t => api.collaboration.confirmForward(t.transferId)),
    );
    setSubmitting(false);

    const fails: Array<{ name: string; err: string }> = [];
    let okCount = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') okCount++;
      else fails.push({ name: targets[i].productName, err: (r as PromiseRejectedResult).reason?.message || '未知错误' });
    });

    if (fails.length === 0) {
      toast.success(`已确认转发 ${okCount} 条（自动生成外协收回+发出流水）`);
    } else if (okCount > 0) {
      toast.error(`${okCount} 成功 / ${fails.length} 失败：${fails[0].name}：${fails[0].err}`, { duration: 8000 });
    } else {
      toast.error(`确认转发失败：${fails[0].err}`, { duration: 8000 });
    }

    if (okCount > 0) {
      onClose();
      await onDone();
    }
  };

  const allSelected = rows.length > 0 && rows.every(r => r.selected);

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="关闭" className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-[1] flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
          <h3 className="flex min-w-0 items-center gap-2 text-base font-black text-slate-900">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-amber-500" />
            <span className="shrink-0">批量确认转发</span>
            <span className="text-xs text-slate-500 font-bold">{selectedCount}/{rows.length} 条</span>
          </h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0 flex flex-wrap items-center gap-3 text-xs">
          {rows.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
            >
              {allSelected ? '全部取消' : '全部选中'}
            </button>
          )}
          <span className="text-slate-500">
            确认后将为每条链上子单分别生成「上一站回收」与「下一站发出」两条外协流水。
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
          {rows.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-white p-4">
              <h4 className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">已选合计</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">勾选条数</span>
                  <span className="font-bold text-slate-800 tabular-nums">{selectedCount} / {rows.length}</span>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">合计数量</span>
                  <span className="font-bold text-amber-600 tabular-nums">{selectedTotalQty} 件</span>
                </div>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">该合作单位暂无待确认转发</div>
          ) : (
            <div className="space-y-3">
              {rows.map((r, idx) => {
                const matrix = rowMatrices[idx];
                return (
                  <div
                    key={r.transferId}
                    className={`overflow-hidden rounded-xl border shadow-sm transition-colors ${
                      r.selected ? 'border-amber-300 bg-white' : 'border-slate-200 bg-white/70'
                    }`}
                  >
                    <label className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 cursor-pointer">
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={() => toggleOne(idx)}
                          className="w-4 h-4 accent-amber-500 shrink-0"
                        />
                        <span className="truncate text-sm font-black text-slate-900">{r.productName}</span>
                        {r.productSku ? (
                          <span className="text-xs font-bold text-slate-500 shrink-0">{r.productSku}</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 tabular-nums">{r.qty} 件</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                          <Truck className="h-3 w-3" /> {r.nextStepLabel}
                        </span>
                      </div>
                    </label>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2.5 text-[11px] text-slate-500">
                      {r.docNo && (
                        <span>
                          <span className="font-bold text-slate-500">派发单号：</span>
                          <span className="text-slate-700 break-all">{r.docNo}</span>
                        </span>
                      )}
                      {r.createdAt && (
                        <span className="text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
                      )}
                    </div>

                    {matrix.rows.length === 0 ? (
                      <div className="px-4 py-3 text-center text-xs text-slate-400">无明细</div>
                    ) : (
                      <div className="p-3">
                        <QtyMatrixTable sizeHeaders={matrix.sizeHeaders} rows={matrix.rows} />
                      </div>
                    )}

                    {showCollabAmount && r.originUnitPrice != null && (
                      <div className="border-t border-amber-100 bg-amber-50/80 px-4 py-2 text-[11px] text-amber-950">
                        <span className="font-bold">乙方申报单价（确认后写入外协收货）：</span>
                        <span className="tabular-nums font-black">{r.originUnitPrice}</span> 元/件
                      </div>
                    )}

                    {r.note ? (
                      <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-xs text-slate-600">
                        <span className="font-bold text-slate-500">备注：</span>
                        {r.note}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button
            disabled={submitting || selectedCount === 0}
            onClick={submit}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? '确认中...' : `确认转发${selectedCount > 0 ? `（${selectedCount}）` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabPeerConfirmForwardModal);
