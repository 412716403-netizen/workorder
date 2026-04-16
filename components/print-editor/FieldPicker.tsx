import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search } from 'lucide-react';
import type { PrintFieldOption } from './printFieldOptions';

const POPOVER_Z_BACKDROP = 80;
const POPOVER_Z_PANEL = 90;
const MAX_W = 416;
const EST_H = 400;

function computePopoverRect(trigger: DOMRect): { top: number; left: number; width: number } {
  const width = Math.min(MAX_W, window.innerWidth - 16);
  let left = trigger.right - width;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

  let top = trigger.bottom + 4;
  if (top + EST_H > window.innerHeight - 8) {
    top = Math.max(8, trigger.top - EST_H - 4);
  }

  return { top, left, width };
}

export function FieldPicker({
  options,
  onPick,
  style = 'mustache',
}: {
  options: PrintFieldOption[];
  onPick: (placeholder: string) => void;
  style?: 'mustache' | 'dollar';
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pickedGroup, setPickedGroup] = useState<string | null>(null);
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePopoverRect = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPopoverRect(computePopoverRect(el.getBoundingClientRect()));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      o =>
        o.label.toLowerCase().includes(s) ||
        o.value.toLowerCase().includes(s) ||
        o.group.toLowerCase().includes(s),
    );
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

  const groupNames = useMemo(() => [...byGroup.keys()], [byGroup]);

  const activeGroup = useMemo(() => {
    if (pickedGroup && byGroup.has(pickedGroup)) return pickedGroup;
    return groupNames[0] ?? null;
  }, [pickedGroup, byGroup, groupNames]);

  useEffect(() => {
    if (pickedGroup && !byGroup.has(pickedGroup)) {
      setPickedGroup(null);
    }
  }, [byGroup, pickedGroup]);

  const fieldsInActive = activeGroup ? (byGroup.get(activeGroup) ?? []) : [];

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    setPickedGroup(null);
    setPopoverRect(null);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverRect();
    const onScroll = () => updatePopoverRect();
    window.addEventListener('resize', updatePopoverRect);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePopoverRect);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePopoverRect]);

  const toggleOpen = () => {
    if (open) {
      close();
      return;
    }
    setPickedGroup(null);
    setQ('');
    const el = anchorRef.current;
    if (el) {
      setPopoverRect(computePopoverRect(el.getBoundingClientRect()));
    }
    setOpen(true);
  };

  const portal =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        <div
          className="fixed inset-0"
          style={{ zIndex: POPOVER_Z_BACKDROP }}
          aria-hidden
          onClick={close}
        />
        <div
          className="fixed flex min-h-0 max-h-[min(24rem,72vh)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          style={{
            zIndex: POPOVER_Z_PANEL,
            top: popoverRect?.top ?? 0,
            left: popoverRect?.left ?? 0,
            width: popoverRect?.width ?? MAX_W,
          }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-2.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜索分类或字段…"
              className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
              autoFocus
            />
          </div>
          <div className="flex min-h-0 flex-1 divide-x divide-slate-100">
            <div className="flex min-h-0 w-[min(10.5rem,34%)] shrink-0 flex-col overflow-y-auto overscroll-contain py-1">
              {groupNames.length === 0 ? (
                <p className="px-2.5 py-2 text-[11px] text-slate-400">无匹配分类</p>
              ) : (
                groupNames.map(name => {
                  const count = byGroup.get(name)?.length ?? 0;
                  const active = name === activeGroup;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setPickedGroup(name)}
                      title={`${name}（${count}）`}
                      className={`flex w-full min-w-0 flex-col items-stretch gap-0.5 px-2.5 py-2 text-left text-xs font-medium leading-snug transition-colors ${
                        active
                          ? 'bg-indigo-50 text-indigo-900'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span className="min-w-0 break-words">{name}</span>
                      <span
                        className={`self-start tabular-nums rounded-md px-1 py-0.5 text-[10px] font-semibold leading-none ${
                          active ? 'bg-indigo-200/80 text-indigo-900' : 'bg-slate-200/70 text-slate-600'
                        }`}
                      >
                        {count} 个字段
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-2 text-xs">
              {activeGroup ? (
                <div className="mb-2 shrink-0 border-b border-slate-100 pb-2 text-[11px] font-semibold text-slate-500">
                  {activeGroup}
                  <span className="ml-1 font-normal text-slate-400">（{fieldsInActive.length} 个字段）</span>
                </div>
              ) : null}
              {fieldsInActive.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-slate-400">请选择左侧分类</p>
              ) : (
                fieldsInActive.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    className="mb-1 block w-full rounded-lg px-2 py-2 text-left last:mb-0 hover:bg-indigo-50"
                    onClick={() => {
                      const p = style === 'mustache' ? `{{${o.value}}}` : `\${${o.value}}`;
                      onPick(p);
                      close();
                    }}
                  >
                    <div className="font-medium text-slate-800">{o.label}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400" title={o.value}>
                      {o.value}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </>,
      document.body,
    );

  return (
    <div ref={anchorRef} className="relative inline-flex">
      <button
        type="button"
        title="插入字段"
        onClick={toggleOpen}
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-indigo-600"
      >
        <Plus className="h-4 w-4" />
      </button>
      {portal}
    </div>
  );
}
