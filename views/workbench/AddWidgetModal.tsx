import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  WORKBENCH_WIDGET_CATALOG,
  type WorkbenchWidgetType,
  canUseWidget,
} from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useFeaturePlugins } from '../../hooks/useFeaturePlugins';

const CATEGORY_LABELS: Record<string, string> = {
  general: '通用',
  efficiency: '工作效率',
  reports: '智能报表',
};

interface AddWidgetModalProps {
  open: boolean;
  onClose: () => void;
  existingTypes: WorkbenchWidgetType[];
  onAdd: (type: WorkbenchWidgetType) => void;
}

const AddWidgetModal: React.FC<AddWidgetModalProps> = ({
  open,
  onClose,
  existingTypes,
  onAdd,
}) => {
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const { tenantCtx } = useAuth();
  const { plugins } = useFeaturePlugins();
  const permissions = tenantCtx?.permissions ?? [];

  const available = useMemo(
    () => WORKBENCH_WIDGET_CATALOG.filter(w =>
      canUseWidget(w.type, { permissions, featurePlugins: plugins, tenantRole: tenantCtx?.tenantRole }),
    ),
    [permissions, plugins, tenantCtx?.tenantRole],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter(w => {
      if (category !== 'all' && w.category !== category) return false;
      if (!q) return true;
      return w.title.toLowerCase().includes(q) || w.description.toLowerCase().includes(q);
    });
  }, [available, category, search]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of available) counts.set(w.category, (counts.get(w.category) ?? 0) + 1);
    return [
      { id: 'all', label: '全部', count: available.length },
      ...Object.entries(CATEGORY_LABELS)
        .map(([id, label]) => ({
          id,
          label,
          count: counts.get(id) ?? 0,
        }))
        .filter(c => c.count > 0),
    ];
  }, [available]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-black text-slate-900">添加组件</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="w-44 shrink-0 border-r border-slate-100 p-4">
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs"
                placeholder="搜索"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <nav className="flex flex-col gap-1">
              {categories.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`rounded-lg px-3 py-2 text-left text-xs font-bold ${
                    category === c.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {c.label} ({c.count})
                </button>
              ))}
            </nav>
          </aside>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map(w => {
                const added = existingTypes.includes(w.type);
                return (
                  <button
                    key={w.type}
                    type="button"
                    disabled={added}
                    onClick={() => { onAdd(w.type); onClose(); }}
                    className={`rounded-xl border p-4 text-left transition ${
                      added
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-70'
                        : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{w.title}</span>
                      {added && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          已添加
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{w.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddWidgetModal;
