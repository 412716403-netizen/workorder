import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Package, ChevronRight } from 'lucide-react';
import type { Product, ProductCategory } from '../types';

function getFileExtFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:[^/]+\/([^;]+)/);
  return m?.[1]?.replace('jpeg', 'jpg') ?? 'bin';
}

/** 与 BOM 物料行、生产计划一致：Portal + fixed，避免在滚动/弹窗内被裁切 */
export function SearchableProductSelect({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  categories = [],
  compact = false,
  unavailableProductIds = [],
  disabledProductIds = [],
  disabledProductReason = '该产品含颜色/尺码，不可作为 BOM 子件',
  onFilePreview,
  triggerClassName,
}: {
  options: Product[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  categories?: ProductCategory[];
  compact?: boolean;
  unavailableProductIds?: string[];
  /** 策略禁用（如 BOM 不可选带颜色尺码的产品）；当前行已选中的 id 仍可显示，不阻止换选 */
  disabledProductIds?: string[];
  disabledProductReason?: string;
  /** 传入后，下拉列表中文件类自定义字段会显示缩略图/预览/下载，而非仅「已上传」文案 */
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
  /** 追加到触发按钮的 className，用于外部覆盖高度/圆角等 */
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const selectedProduct = options.find(p => p.id === value);

  const filteredOptions = useMemo(() => {
    return options
      .filter(p => {
        const matchesSearch =
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
        const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  }, [options, search, activeTab]);

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
      if ((e.target as Element)?.closest?.('[data-searchable-product-dropdown]')) return;
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

  const unavailableSet = useMemo(() => new Set(unavailableProductIds.filter(Boolean)), [unavailableProductIds]);
  const disabledProductSet = useMemo(() => new Set(disabledProductIds.filter(Boolean)), [disabledProductIds]);

  const rowBtnCls = (selected: boolean, unavailable: boolean) => {
    const pad = compact ? 'py-2 px-2.5 rounded-xl' : 'p-3 rounded-2xl';
    if (unavailable) {
      return `w-full text-left ${pad} transition-all border-2 opacity-50 cursor-not-allowed bg-slate-100 border-slate-100 text-slate-400`;
    }
    return `w-full text-left ${pad} transition-all border-2 ${
      selected ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
    }`;
  };

  const dropdownPanel = isOpen && typeof document !== 'undefined' && (
    <div
      data-searchable-product-dropdown
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
          placeholder="输入名称或 SKU 搜索..."
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
          const duplicateUnavailable = unavailableSet.has(p.id) && p.id !== value;
          const policyDisabled = disabledProductSet.has(p.id) && p.id !== value;
          const unavailable = duplicateUnavailable || policyDisabled;
          const rowTitle = duplicateUnavailable
            ? '已在其他行添加，不可重复选择'
            : policyDisabled
              ? disabledProductReason
              : undefined;
          return (
            <button
              key={p.id}
              type="button"
              disabled={unavailable}
              title={rowTitle}
              onClick={() => {
                if (unavailable) return;
                onChange(p.id);
                setIsOpen(false);
                setSearch('');
              }}
              className={rowBtnCls(p.id === value, unavailable)}
            >
              <div className={`flex justify-between items-start gap-2 ${compact ? 'mb-0' : 'mb-0.5'}`}>
                <p className={`font-black truncate leading-tight min-w-0 flex-1 ${compact ? 'text-sm' : 'text-base'}`}>{p.name}</p>
                {cat && (
                  <span
                    className={`rounded bg-slate-100 text-slate-500 font-black uppercase shrink-0 leading-none ${compact ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[11px]'}`}
                  >
                    {cat.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <p
                  className={`font-bold uppercase tracking-widest leading-tight ${compact ? 'text-[11px]' : 'text-xs'} ${p.id === value ? 'text-indigo-400' : 'text-slate-400'}`}
                >
                  {p.sku}
                </p>
                {cat?.customFields?.map(f => {
                  const val = p.categoryCustomData?.[f.id];
                  if (val == null || val === '') return null;
                  if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:') && onFilePreview) {
                    const isImg = val.startsWith('data:image/');
                    const isPdf = val.startsWith('data:application/pdf');
                    if (isImg) return (
                      <span key={f.id} className="inline-flex items-center gap-1">
                        <img src={val} alt={f.label} className="h-5 w-5 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={e => { e.stopPropagation(); onFilePreview(val, 'image'); }} />
                        <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                      </span>
                    );
                    if (isPdf) return (
                      <span key={f.id} className="inline-flex items-center gap-1">
                        <button type="button" onClick={e => { e.stopPropagation(); onFilePreview(val, 'pdf'); }} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">在线查看</button>
                        <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                      </span>
                    );
                    return (
                      <a key={f.id} href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                    );
                  }
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
            <Package className={`text-slate-100 mx-auto mb-2 block ${compact ? 'w-6 h-6' : 'w-8 h-8'}`} />
            <p className={`text-slate-400 font-medium leading-tight ${compact ? 'text-xs' : 'text-sm'}`}>未找到符合条件的产品</p>
          </div>
        )}
      </div>
    </div>
  );

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
          <Package className={`shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${selectedProduct ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={`font-bold truncate leading-tight ${compact ? 'text-[13px]' : 'text-sm'} ${selectedProduct ? 'text-slate-900' : 'text-slate-400'}`}>
            {selectedProduct
              ? (() => {
                  const cat = categories.find(c => c.id === selectedProduct.categoryId);
                  const customParts =
                    cat?.customFields
                      ?.map(f => {
                        const v = selectedProduct.categoryCustomData?.[f.id];
                        if (v == null || v === '') return null;
                        if (f.type === 'file') return `${f.label}: 已上传`;
                        return `${f.label}: ${typeof v === 'boolean' ? (v ? '是' : '否') : String(v)}`;
                      })
                      .filter(Boolean) ?? [];
                  const base = `${selectedProduct.name} (${selectedProduct.sku})`;
                  return customParts.length > 0 ? `${base} ${customParts.join(' ')}` : base;
                })()
              : placeholder || '搜索并选择产品型号...'}
          </span>
        </div>
        <ChevronRight
          className={`shrink-0 transition-transform ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${isOpen ? 'rotate-90' : 'text-slate-400'}`}
        />
      </button>

      {dropdownPanel && createPortal(dropdownPanel, document.body)}
    </div>
  );
}
