import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, User } from 'lucide-react';
import type { GlobalNodeTemplate } from '../types';

export interface EntityOption {
  id: string;
  name: string;
  sub?: string;
  assignedMilestoneIds?: string[];
}

/** Portal 下拉层 z-index；须高于报工/返工弹窗外壳（z-80 左右） */
const DEFAULT_ENTITY_DROPDOWN_Z = 10050;

interface EntitySelectorProps {
  options: EntityOption[];
  processNodes: GlobalNodeTemplate[];
  currentNodeId: string;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  variant?: 'default' | 'compact' | 'form';
  icon?: React.ComponentType<{ className?: string }>;
  /** 嵌入高层弹窗时可提高，避免被其它 Portal 遮挡 */
  portalZIndex?: number;
}

const UNASSIGNED_TAB = 'UNASSIGNED';

const EntitySelector: React.FC<EntitySelectorProps> = ({
  options,
  processNodes,
  currentNodeId,
  value,
  onChange,
  placeholder = '选择...',
  variant = 'default',
  icon: Icon = User,
  portalZIndex = DEFAULT_ENTITY_DROPDOWN_Z,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>(currentNodeId);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const visibleProcessNodes = useMemo(
    () => processNodes.filter(n => options.some(o => o.assignedMilestoneIds?.includes(n.id))),
    [processNodes, options],
  );

  const unassignedCount = useMemo(
    () => options.filter(o => !o.assignedMilestoneIds?.length).length,
    [options],
  );

  const filteredByTab = useMemo(() => {
    if (activeTab === 'all') return options;
    if (activeTab === UNASSIGNED_TAB) return options.filter(o => !o.assignedMilestoneIds?.length);
    return options.filter(o => o.assignedMilestoneIds?.includes(activeTab));
  }, [options, activeTab]);

  const filtered = useMemo(
    () =>
      filteredByTab.filter(
        o =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          (o.sub?.toLowerCase().includes(search.toLowerCase()) ?? false),
      ),
    [filteredByTab, search],
  );

  const handleSelect = (id: string) => {
    onChange(value === id ? '' : id);
    if (value !== id) setIsOpen(false);
  };

  useEffect(() => { setActiveTab(currentNodeId); }, [currentNodeId]);

  useEffect(() => {
    if (activeTab === 'all' || activeTab === UNASSIGNED_TAB) return;
    if (!visibleProcessNodes.some(n => n.id === activeTab)) {
      setActiveTab(visibleProcessNodes.some(n => n.id === currentNodeId) ? currentNodeId : 'all');
    }
  }, [activeTab, visibleProcessNodes, currentNodeId]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(visibleProcessNodes.some(n => n.id === currentNodeId) ? currentNodeId : 'all');
    }
  }, [isOpen, currentNodeId, visibleProcessNodes]);

  const updatePanelPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || !isOpen) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const w = Math.min(Math.max(rect.width, 280), window.innerWidth - pad * 2);
    let left = rect.left;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (left < pad) left = pad;

    const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
    const spaceAbove = rect.top - gap - pad;
    const preferBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
    const cap = Math.min(window.innerHeight * 0.62, Math.max(preferBelow ? spaceBelow : spaceAbove, 200));

    if (preferBelow) {
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + gap,
        left,
        width: w,
        maxHeight: cap,
        zIndex: portalZIndex,
        display: 'flex',
        flexDirection: 'column',
      });
    } else {
      setPanelStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + gap,
        left,
        width: w,
        maxHeight: cap,
        zIndex: portalZIndex,
        display: 'flex',
        flexDirection: 'column',
      });
    }
  }, [isOpen, portalZIndex]);

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
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if ((e.target as Element)?.closest?.('[data-entity-selector-dropdown]')) return;
      setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const selected = options.find(o => o.id === value);

  const triggerClass =
    variant === 'form'
      ? 'flex h-9 min-h-9 flex-nowrap items-center bg-white px-2 py-0'
      : variant === 'compact'
        ? 'flex min-h-9 h-auto flex-wrap bg-white p-2'
        : 'flex min-h-9 h-auto flex-wrap bg-white p-2.5';

  const triggerShellClass =
    variant === 'form'
      ? 'rounded-lg border-slate-200 hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500'
      : 'rounded-xl border-slate-200 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-50';

  const dropdownPanel = isOpen && typeof document !== 'undefined' && (
    <div
      data-entity-selector-dropdown
      className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-150"
      style={panelStyle}
      onMouseDown={e => e.preventDefault()}
    >
      <div className="relative mb-2 flex-shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          autoFocus
          type="text"
          name="stp-entity-search"
          autoComplete="off"
          className="w-full bg-slate-50 border-none rounded-lg py-1.5 pl-8 pr-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="搜索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
        >
          全部
        </button>
        {unassignedCount > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab(UNASSIGNED_TAB)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === UNASSIGNED_TAB ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
          >
            未分配 ({unassignedCount})
          </button>
        )}
        {visibleProcessNodes.map(n => (
          <button
            key={n.id}
            type="button"
            onClick={() => setActiveTab(n.id)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === n.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
          >
            {n.name} ({options.filter(o => o.assignedMilestoneIds?.includes(n.id)).length})
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
        {filtered.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleSelect(opt.id)}
            className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between group ${
              value === opt.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-700'
            }`}
          >
            <div>
              <p className="text-[11px] font-bold">{opt.name}</p>
              {opt.sub && (
                <p className={`text-[9px] font-medium ${value === opt.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {opt.sub}
                </p>
              )}
            </div>
            {value === opt.id && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center py-4 text-[10px] text-slate-400 italic">未找到匹配项</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative w-full">
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full cursor-pointer gap-1.5 border transition-all outline-none ${triggerShellClass} ${triggerClass}`}
      >
        {!value ? (
          <span
            className={`flex min-w-0 flex-1 items-center gap-1.5 font-bold ${
              variant === 'form'
                ? 'text-xs text-slate-400'
                : 'text-slate-300 text-[11px] py-1'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{placeholder}</span>
          </span>
        ) : (
          <span
            className={`flex min-w-0 max-w-full items-center gap-1 rounded-lg bg-indigo-600 px-2 py-0.5 font-black text-white shadow-sm ${
              variant === 'form' ? 'text-xs' : 'text-[10px]'
            }`}
          >
            <span className="min-w-0 truncate">{selected?.name}</span>
            <X className="h-3 w-3 shrink-0 hover:text-rose-200" onClick={e => { e.stopPropagation(); onChange(''); }} />
          </span>
        )}
      </div>

      {dropdownPanel && createPortal(dropdownPanel, document.body)}
    </div>
  );
};

export default EntitySelector;
export type { EntitySelectorProps };
