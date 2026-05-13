import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Building2, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Partner, PartnerCategory } from '../types';
import * as api from '../services/api';
import { useAuthOptional } from '../contexts/AuthContext';
import { useAppActionsOptional } from '../contexts/AppDataContext';
import { hasSubPermission } from '../utils/hasSubPermission';
import { effectiveCustomDocFieldType, formatReportCustomDataForList } from '../utils/reportCustomDocField';
import { getSupplierCategoryId } from '../utils/resolvePartnerCategoryId';
import { psiOrderBillCompactLineInputClass, psiOrderBillCompactLineLabelClass } from '../styles/uiDensity';

/**
 * 合作单位选择：与 SearchableProductSelect 一致使用 Portal + fixed，避免在滚动/弹窗内被裁切。
 * onChange 始终回传 (名称, id)。value 可用名称或 id，由 valueMode 指定。
 */
const DEFAULT_PARTNER_DROPDOWN_Z = 10050;

function resolveQuickCreateFormCategoryId(
  categories: PartnerCategory[],
  explicit?: string
): string | undefined {
  const ex = explicit?.trim();
  if (ex) return ex;
  return getSupplierCategoryId(categories);
}

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
  /** Portal 下拉层 z-index；嵌入「新增产品」等高层弹窗时需高于外壳（默认 10050） */
  portalZIndex = DEFAULT_PARTNER_DROPDOWN_Z,
  /** 为 true 时在下拉内显示「新建」入口（需具备合作单位新建权限且至少有一个合作单位分类） */
  allowQuickCreate = false,
  /** 快捷新建表单中分类的默认值（id）；不传时尝试匹配名称「供应商」 */
  quickCreateCategoryId,
  /** 有值时仅允许选择该分类下合作单位；分类 Tab 仍显示，点其它分类时列表会为空或不含可选项 */
  onlyCategoryId,
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
  portalZIndex?: number;
  allowQuickCreate?: boolean;
  quickCreateCategoryId?: string;
  onlyCategoryId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  /** 快捷新建弹窗中选中的合作单位分类 id */
  const [quickFormCategoryId, setQuickFormCategoryId] = useState('');
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const auth = useAuthOptional();
  const appActions = useAppActionsOptional();

  const canQuickCreate = useMemo(() => {
    if (!allowQuickCreate || categories.length === 0) return false;
    const tctx = auth?.tenantCtx;
    if (!tctx) return false;
    if (tctx.tenantRole === 'owner') return true;
    return (
      hasSubPermission(tctx.permissions, 'basic:partners:view') &&
      hasSubPermission(tctx.permissions, 'basic:partners:create')
    );
  }, [allowQuickCreate, categories.length, auth]);

  const quickCreateCategoryOptions = useMemo(
    () =>
      onlyCategoryId?.trim()
        ? categories.filter(c => c.id === onlyCategoryId)
        : categories,
    [categories, onlyCategoryId]
  );

  const selectedPartner =
    valueMode === 'id' ? options.find(p => p.id === value) : options.find(p => p.name === value);

  const searchNeedle = search.toLowerCase().trim();

  const filteredOptions = useMemo(() => {
    return options
      .filter(p => {
        if (onlyCategoryId?.trim() && p.categoryId !== onlyCategoryId) {
          return false;
        }
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
  }, [options, onlyCategoryId, searchNeedle, activeTab]);

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
  }, [isOpen, updatePanelPosition, search, activeTab, filteredOptions.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if ((e.target as Element)?.closest?.('[data-searchable-partner-dropdown]')) return;
      if ((e.target as Element)?.closest?.('[data-searchable-partner-quick-create]')) return;
      setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    setActiveTab('all');
  }, [onlyCategoryId]);

  const triggerCls = compact
    ? 'w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between disabled:opacity-50 transition-all min-h-[36px]'
    : 'w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between disabled:opacity-50 transition-all min-h-[48px]';

  const searchInputCls = compact
    ? 'w-full bg-slate-50 border-none rounded-lg py-1.5 pl-8 pr-2.5 text-xs font-semibold leading-tight outline-none focus:ring-2 focus:ring-indigo-500'
    : 'w-full bg-slate-50 border-none rounded-xl py-3 pl-11 pr-4 text-sm font-bold leading-tight outline-none focus:ring-2 focus:ring-indigo-500';

  const tabBtnCls = (active: boolean) =>
    compact
      ? `px-2 py-0.5 rounded-md text-[11px] font-black uppercase transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`
      : `px-3 py-1.5 rounded-lg text-sm font-black uppercase transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;

  const rowBtnCls = (selected: boolean) => {
    const pad = compact ? 'py-1 px-2 rounded-lg' : 'p-3 rounded-2xl';
    return `w-full text-left ${pad} transition-all border-2 ${
      selected ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
    }`;
  };

  const dropdownPanel = isOpen && typeof document !== 'undefined' && (
    <div
      data-searchable-partner-dropdown
      className={`bg-white border border-slate-200 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${compact ? 'rounded-lg p-2' : 'rounded-2xl p-4'}`}
      style={panelStyle}
      onMouseDown={e => e.preventDefault()}
    >
      <div className={`flex items-center gap-1.5 flex-shrink-0 ${compact ? 'mb-1.5' : 'mb-4'}`}>
        <div className="relative flex-1 min-w-0">
          <Search
            className={`absolute text-slate-400 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${compact ? 'left-2' : 'left-3.5'}`}
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
        {canQuickCreate && (
          <button
            type="button"
            onClick={() => {
              setQuickName('');
              setQuickFormCategoryId(resolveQuickCreateFormCategoryId(categories, quickCreateCategoryId) ?? '');
              setIsOpen(false);
              setQuickCreateOpen(true);
            }}
            title="快捷新建合作单位（与基础信息一致，保存后出现在列表中）"
            className={`shrink-0 inline-flex items-center gap-0.5 rounded-lg bg-indigo-600 text-white font-black uppercase tracking-wide hover:bg-indigo-700 active:bg-indigo-800 transition-all shadow-sm shadow-indigo-600/20 ${
              compact ? 'px-1.5 py-1 text-[9px]' : 'px-3 py-3 text-[11px]'
            }`}
          >
            <Plus className="w-3 h-3" />
            新建
          </button>
        )}
      </div>

      <div
        className={`flex items-center flex-shrink-0 overflow-x-auto no-scrollbar ${compact ? 'gap-0.5 mb-1.5 pb-0.5' : 'gap-1 mb-4 pb-1'}`}
      >
        <button type="button" onClick={() => setActiveTab('all')} className={tabBtnCls(activeTab === 'all')}>
          全部
        </button>
        {categories.map(cat => (
          <button key={cat.id} type="button" onClick={() => setActiveTab(cat.id)} className={tabBtnCls(activeTab === cat.id)}>
            {cat.name}
          </button>
        ))}
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto custom-scrollbar ${compact ? 'space-y-0' : 'space-y-0.5'}`}>
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
              <div className={`flex justify-between items-start ${compact ? 'gap-1.5 -my-px' : 'gap-2 mb-0.5'}`}>
                <p className={`truncate leading-tight min-w-0 flex-1 ${compact ? 'text-xs font-bold' : 'text-sm font-black'}`}>{p.name}</p>
                {cat && (
                  <span
                    className={`rounded bg-slate-100 text-slate-500 font-bold uppercase shrink-0 leading-tight ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}
                  >
                    {cat.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {p.contact ? (
                  <p
                    className={`font-semibold uppercase tracking-tight leading-tight truncate max-w-full ${compact ? 'text-[9px]' : 'text-xs font-bold tracking-widest'} ${(valueMode === 'id' ? p.id === value : p.name === value) ? 'text-indigo-400' : 'text-slate-400'}`}
                  >
                    {p.contact}
                  </p>
                ) : null}
                {cat?.customFields?.map(f => {
                  const val = p.customData?.[f.id];
                  if (val == null || val === '') return null;
                  if (effectiveCustomDocFieldType(f) === 'file')
                    return (
                      <span
                        key={f.id}
                        className={`font-bold text-slate-500 rounded bg-slate-50 leading-tight ${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-1.5 py-0.5'}`}
                      >
                        {f.label}: 已上传
                      </span>
                    );
                  return (
                    <span
                      key={f.id}
                      className={`font-bold text-slate-500 rounded bg-slate-50 leading-tight ${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-1.5 py-0.5'}`}
                    >
                      {f.label}: {formatReportCustomDataForList(f, val)}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
        {filteredOptions.length === 0 && (
          <div className={compact ? 'py-4 text-center' : 'py-10 text-center'}>
            <Building2 className={`text-slate-100 mx-auto block ${compact ? 'mb-1.5 w-5 h-5' : 'mb-2 w-8 h-8'}`} />
            <p className="text-slate-400 font-medium leading-tight text-xs">未找到符合条件的合作单位</p>
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
          <span className={`truncate leading-tight ${compact ? 'text-xs font-semibold' : 'text-[13px] font-bold'} ${selectedPartner ? 'text-slate-900' : 'text-slate-400'}`}>
            {selectedPartner
              ? (() => {
                  const cat = categories.find(c => c.id === selectedPartner.categoryId);
                  const customParts =
                    cat?.customFields
                      ?.map(f => {
                        const v = selectedPartner.customData?.[f.id];
                        if (v == null || v === '') return null;
                        if (effectiveCustomDocFieldType(f) === 'file') return `${f.label}: 已上传`;
                        return `${f.label}: ${formatReportCustomDataForList(f, v)}`;
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

      {quickCreateOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-searchable-partner-quick-create
            className="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm"
            style={{ zIndex: portalZIndex + 500 }}
            onClick={() => {
              if (!quickSubmitting) setQuickCreateOpen(false);
            }}
            role="presentation"
          >
            <div
              className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-quick-create-title"
            >
              <h4 id="partner-quick-create-title" className="text-sm font-black text-slate-900">
                快捷新建合作单位
              </h4>
              <p className="mt-1 text-[10px] font-bold text-slate-500">
                与「基础信息 → 合作单位」使用相同接口创建；保存后将出现在列表中并自动选中。
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className={`${psiOrderBillCompactLineLabelClass} mb-1.5`}>单位名称</label>
                  <input
                    type="text"
                    className={psiOrderBillCompactLineInputClass}
                    placeholder="请输入单位名称"
                    value={quickName}
                    onChange={e => setQuickName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={`${psiOrderBillCompactLineLabelClass} mb-1.5`}>合作单位分类</label>
                  <select
                    className={`${psiOrderBillCompactLineInputClass} cursor-pointer`}
                    value={quickFormCategoryId}
                    onChange={e => setQuickFormCategoryId(e.target.value)}
                  >
                    <option value="">请选择分类</option>
                    {quickCreateCategoryOptions.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={quickSubmitting}
                  onClick={() => !quickSubmitting && setQuickCreateOpen(false)}
                  className="h-9 min-h-9 rounded-xl border border-slate-200 bg-white px-5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={quickSubmitting}
                  onClick={async () => {
                    const name = quickName.trim();
                    if (!name) {
                      toast.warning('请填写单位名称');
                      return;
                    }
                    if (!quickFormCategoryId.trim()) {
                      toast.warning('请选择合作单位分类');
                      return;
                    }
                    setQuickSubmitting(true);
                    try {
                      const created = (await api.partners.create({
                        name,
                        contact: '',
                        categoryId: quickFormCategoryId.trim(),
                      })) as Partner;
                      await appActions?.refreshPartners();
                      onChange(created.name, created.id);
                      setQuickCreateOpen(false);
                      setQuickName('');
                      setQuickFormCategoryId('');
                      setSearch('');
                      setIsOpen(false);
                      toast.success('已添加合作单位');
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : '创建失败');
                    } finally {
                      setQuickSubmitting(false);
                    }
                  }}
                  className="h-9 min-h-9 rounded-xl bg-indigo-600 px-6 text-xs font-black text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {quickSubmitting ? '保存中…' : '保存并选用'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
