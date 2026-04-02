import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { PrintFieldOption } from './printFieldOptions';

export function FieldPicker({
  options,
  onPick,
  style = 'mustache',
}: {
  options: PrintFieldOption[];
  onPick: (placeholder: string) => void;
  style?: 'mustache' | 'dollar';
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => o.label.toLowerCase().includes(s) || o.value.toLowerCase().includes(s) || o.group.toLowerCase().includes(s));
  }, [options, q]);
  const byGroup = useMemo(() => {
    const m = new Map<string, PrintFieldOption[]>();
    for (const o of filtered) {
      const arr = m.get(o.group) ?? [];
      arr.push(o);
      m.set(o.group, arr);
    }
    return m;
  }, [filtered]);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        title="插入字段"
        onClick={() => setOpen(v => !v)}
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
      >
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[80]" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-[90] mt-1 w-72 max-h-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="搜索字段…"
                className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-2 text-xs">
              {[...byGroup.entries()].map(([group, items]) => (
                <div key={group} className="mb-2">
                  <div className="mb-1 px-1 font-black uppercase tracking-wider text-slate-400">{group}</div>
                  {items.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      className="block w-full rounded-lg px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-800"
                      onClick={() => {
                        const p = style === 'mustache' ? `{{${o.value}}}` : `\${${o.value}}`;
                        onPick(p);
                        setOpen(false);
                        setQ('');
                      }}
                    >
                      {o.label}
                      <span className="ml-1 font-mono text-[10px] text-slate-400">{o.value}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
