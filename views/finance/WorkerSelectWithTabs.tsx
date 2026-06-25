import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, User } from 'lucide-react';
import type { GlobalNodeTemplate, Worker } from '../../types';
import { formStandardControlClass } from '../../styles/uiDensity';

interface WorkerSelectWithTabsProps {
  workers: Worker[];
  processNodes: GlobalNodeTemplate[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  compact?: boolean;
}

const WORKER_DROPDOWN_Z = 10050;

function WorkerSelectWithTabs({ workers, processNodes, value, onChange, label, compact }: WorkerSelectWithTabsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const UNASSIGNED = 'UNASSIGNED';

  const visibleNodes = useMemo(
    () => processNodes.filter(n => workers.some(w => w.assignedMilestoneIds?.includes(n.id))),
    [processNodes, workers],
  );
  const filteredByTab = useMemo(() => {
    if (activeTab === 'all') return workers;
    if (activeTab === UNASSIGNED) return workers.filter(w => !w.assignedMilestoneIds?.length);
    return workers.filter(w => w.assignedMilestoneIds?.includes(activeTab));
  }, [workers, activeTab]);
  const filtered = useMemo(
    () =>
      filteredByTab
        .filter(
          w =>
            w.name.toLowerCase().includes(search.toLowerCase()) ||
            (w.groupName || '').toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)),
    [filteredByTab, search],
  );
  const selected = workers.find(w => w.id === value);
  const hasUnassigned = useMemo(() => workers.some(w => !w.assignedMilestoneIds?.length), [workers]);

  const updatePanelPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !isOpen) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const w = Math.min(Math.max(rect.width, 300), window.innerWidth - pad * 2);
    let left = rect.left;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (left < pad) left = pad;

    const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
    const spaceAbove = rect.top - gap - pad;
    const preferBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const cap = Math.min(window.innerHeight * 0.62, Math.max(preferBelow ? spaceBelow : spaceAbove, 220));

    setPanelStyle({
      position: 'fixed',
      left,
      width: w,
      maxHeight: cap,
      zIndex: WORKER_DROPDOWN_Z,
      display: 'flex',
      flexDirection: 'column',
      ...(preferBelow ? { top: rect.bottom + gap } : { bottom: window.innerHeight - rect.top + gap }),
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updatePanelPosition();
    const raf = requestAnimationFrame(updatePanelPosition);
    const onScroll = () => updatePanelPosition();
    const onResize = () => updatePanelPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, updatePanelPosition, search, activeTab, filtered.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Element;
      if (triggerRef.current?.contains(t as Node)) return;
      if (t?.closest?.('[data-worker-select-dropdown]')) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const tabBtnCls = (active: boolean) =>
    `px-2 py-0.5 rounded-md text-[11px] font-black uppercase whitespace-nowrap transition-all ${
      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
    }`;

  const dropdownPanel = isOpen && typeof document !== 'undefined' && (
    <div
      data-worker-select-dropdown
      className="bg-white border border-slate-200 rounded-lg shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-150"
      style={panelStyle}
    >
      <div className="relative mb-1.5 flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          autoFocus
          type="text"
          className="w-full min-w-0 bg-slate-50 border-none rounded-lg py-1.5 pl-8 pr-2.5 text-xs font-semibold leading-tight outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="搜索工人姓名..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-0.5 mb-1.5 overflow-x-auto no-scrollbar pb-0.5 flex-shrink-0">
        <button type="button" onClick={() => setActiveTab('all')} className={tabBtnCls(activeTab === 'all')}>
          全部
        </button>
        {hasUnassigned && (
          <button type="button" onClick={() => setActiveTab(UNASSIGNED)} className={tabBtnCls(activeTab === UNASSIGNED)}>
            未分配
          </button>
        )}
        {visibleNodes.map(n => (
          <button key={n.id} type="button" onClick={() => setActiveTab(n.id)} className={tabBtnCls(activeTab === n.id)}>
            {n.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-0">
        {filtered.map(w => {
          const isSel = w.id === value;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                onChange(w.id);
                setIsOpen(false);
                setSearch('');
              }}
              className={`w-full text-left py-1 px-2 rounded-lg transition-all border-2 ${
                isSel
                  ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700'
                  : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex justify-between items-center gap-1.5 -my-px">
                <p className="truncate leading-tight min-w-0 flex-1 text-xs font-bold">{w.name}</p>
                {w.groupName && (
                  <span className="rounded bg-slate-100 text-slate-500 font-bold uppercase shrink-0 leading-tight px-1.5 py-0.5 text-[10px]">
                    {w.groupName}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-4 text-center">
            <User className="text-slate-100 mx-auto block mb-1.5 w-5 h-5" />
            <p className="text-slate-400 font-medium leading-tight text-xs">未找到匹配工人</p>
          </div>
        )}
      </div>
    </div>
  );

  const portalDropdown = dropdownPanel && createPortal(dropdownPanel, document.body);

  if (compact) {
    return (
      <div className="flex items-center gap-2 relative">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="bg-white border border-slate-200 rounded-xl py-2 pl-3 pr-8 min-w-[120px] text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 transition-all hover:border-slate-300 relative"
        >
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <User className={`w-3.5 h-3.5 flex-shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
            <span className={value ? 'text-slate-800 truncate' : 'text-slate-400'}>{selected ? selected.name : '请选择工人'}</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {portalDropdown}
      </div>
    );
  }
  return (
    <div className="space-y-1 relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen(o => !o)} className={`${formStandardControlClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2 truncate">
          <User className={`w-4 h-4 flex-shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={value ? 'text-slate-900 truncate' : 'text-slate-400'}>{selected ? selected.name : '搜索并选择工人...'}</span>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : 'text-slate-400'}`} />
      </button>
      {portalDropdown}
    </div>
  );
}

export default React.memo(WorkerSelectWithTabs);
