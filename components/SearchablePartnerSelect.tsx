import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Building2, ChevronRight } from 'lucide-react';
import type { Partner, PartnerCategory } from '../types';

/**
 * 合作单位选择：与 SearchableProductSelect 一致使用 Portal + fixed，避免在滚动/弹窗内被裁切。
 * onChange 始终回传 (名称, id)。value 可用名称或 id，由 valueMode 指定。
 */
export function SearchablePartnerSelect({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  categories = [],
  compact = false,
  triggerClassName,
  valueMode = 'name',
  showCategoryHint = true,
}: {
  options: Partner[];
  value: string;
  onChange: (partnerName: string, partnerId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  categories?: PartnerCategory[];
  compact?: boolean;
  triggerClassName?: string;
  /** name：与计划单 customer 等存名称的字段一致；id：绑定 id（如协作绑定、对账筛选） */
  valueMode?: 'name' | 'id';
  /** 为 false 时不显示触发器下方的「合作单位分类」一行（如财务筛选条） */
  showCategoryHint?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const selectedPartner =
    valueMode === 'id' ? options.find(p => p.id === value) : options.find(p => p.name === value);

  const searchNeedle = search.toLowerCase().trim();

  const filteredOptions = useMemo(() => {
    return options
      .filter(p => {
        const hay = [
          p.name,
          p.contact || '',
          ...Object.values(p.customData ?? {}).map(v =>
            v == null || typeof v === 'object' ? '' : String(v)
          ),
        ]
          .join(' ')
          .toLowerCase();
        const matchesSearch = !searchNeedle || hay.includes(searchNeedle);
        const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  }, [options, searchNeedle, activeTab]);

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
        zIndex: 10050,
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
        zIndex: 10050,
        display: 'flex',
        flexDirection: 'column',
      });
    }
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
  }, [isOpen, updatePanelPosition, search, activeTab, filteredOptions.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if ((e.target as Element)?.closest?.('[data-searchable-partner-dropdown]')) return;
      setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const triggerCls = compact
    ? 'w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between disabled:opacity-50 transition-all min-h-[40px]'
    : 'w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between disabled:opacity-50 transition-all min-h-[48px]';

  const searchInputCls = compact
    ? 'w-full bg-slate-50 border-none rounded-lg py-2 pl-9 pr-3 text-sm font-bold leading-tight outline-none focus:ring-2 focus:ring-indigo-500'
    : 'w-full bg-slate-50 border-none rounded-xl py-3 pl-11 pr-4 text-sm font-bold leading-tight outline-none focus:ring-2 focus:ring-indigo-500';

  const tabBtnCls = (active: boolean) =>
    compact
      ? `px-2 py-1 rounded-md text-[10px] font-black uppercase transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`
      : `px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;

  const rowBtnCls = (selected: boolean) => {
    const pad = compact ? 'py-2 px-2.5 rounded-xl' : 'p-3 rounded-2xl';
    return `w-full text-left ${pad} transition-all border-2 ${
      selected ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
    }`;
  };

  const dropdownPanel = isOpen && typeof document !== 'undefined' && (
    <div
      data-searchable-partner-dropdown
      className={`bg-white border border-slate-200 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${compact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}
      style={panelStyle}
      onMouseDown={e => e.preventDefault()}
    >
      <div className={`relative flex-shrink-0 ${compact ? 'mb-2' : 'mb-4'}`}>
        <Search
          className={`absolute text-slate-400 ${compact ? 'left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5' : 'left-3.5 top-1/2 -translate-y-1/2 w-4 h-4'}`}
        />
        <input
          autoFocus
          type="text"
          className={searchInputCls}
          placeholder="搜索单位名称、联系人..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className={`flex items-center gap-1 flex-shrink-0 overflow-x-auto no-scrollbar ${compact ? 'mb-2 pb-0.5' : 'mb-4 pb-1'}`}>
        <button type="button" onClick={() => setActiveTab('all')} className={tabBtnCls(activeTab === 'all')}>
          全部
        </button>
        {categories.map(cat => (
          <button key={cat.id} type="button" onClick={() => setActiveTab(cat.id)} className={tabBtnCls(activeTab === cat.id)}>
            {cat.name}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
        {filteredOptions.map(p => {
          const cat = categories.find(c => c.id === p.categoryId);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.name, p.id);
                setIsOpen(false);
                setSearch('');
              }}
              className={rowBtnCls(valueMode === 'id' ? p.id === value : p.name === value)}
            >
              <div className={`flex justify-between items-start gap-2 ${compact ? 'mb-0' : 'mb-0.5'}`}>
                <p className={`font-black truncate leading-tight min-w-0 flex-1 ${compact ? 'text-xs' : 'text-sm'}`}>{p.name}</p>
                {cat && (
                  <span
                    className={`rounded bg-slate-100 text-slate-500 font-black uppercase shrink-0 leading-none ${compact ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[11px]'}`}
                  >
                    {cat.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {p.contact ? (
                  <p
                    className={`font-bold uppercase tracking-widest leading-tight truncate max-w-full ${compact ? 'text-[11px]' : 'text-xs'} ${(valueMode === 'id' ? p.id === value : p.name === value) ? 'text-indigo-400' : 'text-slate-400'}`}
                  >
                    {p.contact}
                  </p>
                ) : null}
                {cat?.customFields?.map(f => {
                  const val = p.customData?.[f.id];
                  if (val == null || val === '') return null;
                  if (f.type === 'file')
                    return (
                      <span
                        key={f.id}
                        className={`font-bold text-slate-500 rounded bg-slate-50 leading-tight ${compact ? 'text-[8px] px-1 py-px' : 'text-[10px] px-1.5 py-0.5'}`}
                      >
                        {f.label}: 已上传
                      </span>
                    );
                  return (
                    <span
                      key={f.id}
                      className={`font-bold text-slate-500 rounded bg-slate-50 leading-tight ${compact ? 'text-[8px] px-1 py-px' : 'text-[10px] px-1.5 py-0.5'}`}
                    >
                      {f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
        {filteredOptions.length === 0 && (
          <div className={compact ? 'py-6 text-center' : 'py-10 text-center'}>
            <Building2 className={`text-slate-100 mx-auto mb-2 block ${compact ? 'w-6 h-6' : 'w-8 h-8'}`} />
            <p className={`text-slate-400 font-medium leading-tight ${compact ? 'text-xs' : 'text-sm'}`}>未找到符合条件的合作单位</p>
          </div>
        )}
      </div>
    </div>
  );

  const categoryName = selectedPartner?.categoryId
    ? categories.find(c => c.id === selectedPartner.categoryId)?.name
    : null;

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(o => !o)}
        className={triggerClassName ? `${triggerCls} ${triggerClassName}` : triggerCls}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <Building2 className={`shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${selectedPartner ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={`font-bold truncate leading-tight ${compact ? 'text-xs' : 'text-[13px]'} ${selectedPartner ? 'text-slate-900' : 'text-slate-400'}`}>
            {selectedPartner
              ? (() => {
                  const cat = categories.find(c => c.id === selectedPartner.categoryId);
                  const customParts =
                    cat?.customFields
                      ?.map(f => {
                        const v = selectedPartner.customData?.[f.id];
                        if (v == null || v === '') return null;
                        if (f.type === 'file') return `${f.label}: 已上传`;
                        return `${f.label}: ${typeof v === 'boolean' ? (v ? '是' : '否') : String(v)}`;
                      })
                      .filter(Boolean) ?? [];
                  const base = selectedPartner.contact
                    ? `${selectedPartner.name} · ${selectedPartner.contact}`
                    : selectedPartner.name;
                  return customParts.length > 0 ? `${base} ${customParts.join(' ')}` : base;
                })()
              : placeholder || '搜索并选择合作单位...'}
          </span>
        </div>
        <ChevronRight
          className={`shrink-0 transition-transform ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${isOpen ? 'rotate-90' : 'text-slate-400'}`}
        />
      </button>

      {showCategoryHint && selectedPartner && (
        <div className={`mt-1.5 font-bold text-slate-500 flex items-center gap-1.5 flex-wrap ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          <span className="uppercase tracking-widest text-slate-400">合作单位分类</span>
          <span>{categoryName || '未分类'}</span>
        </div>
      )}

      {dropdownPanel && createPortal(dropdownPanel, document.body)}
    </div>
  );
}
