import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search } from 'lucide-react';
import { MAX_DASHBOARD_ORDER_STATS_NODES } from '../../../types';

interface OrderStatsEditModalProps {
  open: boolean;
  nodes: { id: string; name: string }[];
  selectedIds: string[];
  isSaving?: boolean;
  title?: string;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}

const OrderStatsEditModal: React.FC<OrderStatsEditModalProps> = ({
  open,
  nodes,
  selectedIds,
  isSaving,
  title = '编辑展示工序',
  onClose,
  onSave,
}) => {
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setDraftIds(selectedIds);
      setQuery('');
    }
  }, [open, selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(node => node.name.toLowerCase().includes(q));
  }, [nodes, query]);

  const toggle = (id: string) => {
    setDraftIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_DASHBOARD_ORDER_STATS_NODES) return prev;
      return [...prev, id];
    });
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-stats-edit-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="order-stats-edit-title" className="text-lg font-black text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            最多选择 {MAX_DASHBOARD_ORDER_STATS_NODES} 个工序，按系统工序顺序展示
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索工序名称"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-300"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">暂无匹配工序</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map(node => {
                const checked = draftIds.includes(node.id);
                const disabled = !checked && draftIds.length >= MAX_DASHBOARD_ORDER_STATS_NODES;
                return (
                  <li key={node.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                        checked
                          ? 'border-indigo-200 bg-indigo-50/60'
                          : disabled
                            ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60'
                            : 'border-slate-100 hover:border-indigo-100 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(node.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span className="text-sm font-bold text-slate-800">{node.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <span className="text-xs text-slate-500">已选 {draftIds.length} / {MAX_DASHBOARD_ORDER_STATS_NODES}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              取消
            </button>
            <button
              type="button"
              disabled={draftIds.length === 0 || isSaving}
              onClick={() => onSave(draftIds)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default OrderStatsEditModal;
