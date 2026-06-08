import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search } from 'lucide-react';
import {
  WORKBENCH_SHORTCUT_CATALOG,
  type WorkbenchShortcutDefinition,
} from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import { useFeaturePlugins } from '../../../hooks/useFeaturePlugins';
import { filterWorkbenchShortcutsByAccess } from '../../../utils/workbenchShortcutsFilter';

const MAX_SHORTCUTS = 12;

interface ShortcutsEditModalProps {
  open: boolean;
  selectedIds: string[];
  isSaving?: boolean;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}

const ShortcutsEditModal: React.FC<ShortcutsEditModalProps> = ({
  open,
  selectedIds,
  isSaving,
  onClose,
  onSave,
}) => {
  const { tenantCtx } = useAuth();
  const { plugins } = useFeaturePlugins();
  const permissions = tenantCtx?.permissions ?? [];
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setDraftIds(selectedIds);
      setQuery('');
    }
  }, [open, selectedIds]);

  const available = useMemo(
    () => filterWorkbenchShortcutsByAccess(
      WORKBENCH_SHORTCUT_CATALOG,
      plugins,
      tenantCtx?.tenantRole,
      permissions,
    ),
    [plugins, tenantCtx?.tenantRole, permissions],
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? available.filter(
          item =>
            item.label.toLowerCase().includes(q)
            || item.group.toLowerCase().includes(q),
        )
      : available;
    const map = new Map<string, WorkbenchShortcutDefinition[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [available, query]);

  const toggle = (id: string) => {
    setDraftIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_SHORTCUTS) {
        return prev;
      }
      return [...prev, id];
    });
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-edit-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="shortcuts-edit-title" className="text-lg font-black text-slate-900">编辑快捷入口</h2>
          <p className="mt-1 text-xs text-slate-500">
            选择常用功能，点击后将直达对应模块的子页面（最多 {MAX_SHORTCUTS} 个）
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索功能名称或分组…"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none ring-indigo-100 focus:border-indigo-300 focus:ring-2"
            />
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            已选 {draftIds.length}/{MAX_SHORTCUTS}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">无匹配项</p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-5 last:mb-0">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{group}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map(item => {
                    const checked = draftIds.includes(item.id);
                    const disabled = !checked && draftIds.length >= MAX_SHORTCUTS;
                    return (
                      <label
                        key={item.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                          checked
                            ? 'border-indigo-200 bg-indigo-50/60'
                            : disabled
                              ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50'
                              : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/80'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(item.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-slate-800">{item.label}</span>
                          <span className="block text-[10px] text-slate-400">{item.group}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={draftIds.length === 0 || isSaving}
            onClick={() => onSave(draftIds)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ShortcutsEditModal;
