import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';

interface CollabPeerReceiveModalProps {
  open: boolean;
  onClose: () => void;
  items: Array<{ ret: any; transfer: any }>;
  onDone: () => Promise<void> | void;
}

type Row = {
  returnId: string;
  transferId: string;
  productName: string;
  productSku: string;
  docNo: string;
  createdAt: string;
  qty: number;
  specPreview: string;
  selected: boolean;
};

function sumItemsQty(items: any[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  let total = 0;
  for (const it of items) total += Number(it?.quantity) || 0;
  return total;
}

function specPreview(items: any[] | undefined, max = 3): string {
  if (!Array.isArray(items)) return '';
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const label = [it.colorName, it.sizeName].filter(Boolean).join('/');
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= max) break;
  }
  const extra = items.length > seen.size ? '…' : '';
  return labels.join('，') + extra;
}

const CollabPeerReceiveModal: React.FC<CollabPeerReceiveModalProps> = ({ open, onClose, items, onDone }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const next: Row[] = items.map(({ ret, transfer }) => ({
        returnId: ret.id,
        transferId: transfer.id,
        productName: transfer.senderProductName || '—',
        productSku: transfer.senderProductSku || '',
        docNo: (ret.payload as any)?.stockOutDocNo || '',
        createdAt: ret.createdAt,
        qty: sumItemsQty(ret.payload?.items),
        specPreview: specPreview(ret.payload?.items),
        selected: true,
      }));
      setRows(next);
    }
    prevOpenRef.current = open;
  }, [open, items]);

  const selectedCount = useMemo(() => rows.filter(r => r.selected).length, [rows]);

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
      toast.warning('请至少勾选一条回传单');
      return;
    }
    setSubmitting(true);
    const results = await Promise.allSettled(
      targets.map(t => api.collaboration.receiveReturn(t.returnId)),
    );
    setSubmitting(false);

    const fails: Array<{ name: string; err: string }> = [];
    let okCount = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') okCount++;
      else fails.push({ name: targets[i].productName, err: (r as PromiseRejectedResult).reason?.message || '未知错误' });
    });

    if (fails.length === 0) {
      toast.success(`已确认收回 ${okCount} 条`);
    } else if (okCount > 0) {
      toast.error(`${okCount} 成功 / ${fails.length} 失败：${fails[0].name}：${fails[0].err}`, { duration: 8000 });
    } else {
      toast.error(`确认收回失败：${fails[0].err}`, { duration: 8000 });
    }

    if (okCount > 0) {
      onClose();
      await onDone();
    }
  };

  const allSelected = rows.length > 0 && rows.every(r => r.selected);

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-[1] w-full max-w-3xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Check className="w-5 h-5 text-indigo-600" /> 批量确认收回
            <span className="text-xs text-slate-500 font-bold">{selectedCount}/{rows.length} 条</span>
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center gap-3 text-xs">
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
            确认后将为每条回传单单独生成外协回收单号、写入收回流水，并更新生产进度。
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 px-5 py-4">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">该合作单位暂无待确认收回的回传单</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r, idx) => (
                <label
                  key={r.returnId}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                    r.selected ? 'border-indigo-300 bg-white' : 'border-slate-200 bg-white/60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={() => toggleOne(idx)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-black text-slate-900 truncate">{r.productName}</span>
                      {r.productSku && <span className="text-xs text-slate-500 shrink-0">{r.productSku}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-700">合计 {r.qty} 件</span>
                      {r.specPreview && <span className="truncate">{r.specPreview}</span>}
                      {r.docNo && <span className="truncate">单据号：{r.docNo}</span>}
                      <span>{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button
            disabled={submitting || selectedCount === 0}
            onClick={submit}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '确认中...' : `确认收回${selectedCount > 0 ? `（${selectedCount}）` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabPeerReceiveModal);
