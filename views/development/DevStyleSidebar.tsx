import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Image as ImageIcon,
  ChevronRight,
  Users,
  Clock,
  Filter,
} from 'lucide-react';
import type { DevStageTemplateDto, DevStyleDto, Partner, ProductCategory } from '../../types';
import { DevStyleStatus } from '../../types';
import {
  collectDevStageFilterOptions,
  hasActiveDevStyleListFilter,
  type DevStyleListFilters,
} from '../../utils/devStyleListFilter';
import { getDevSampleSidebarProgress, resolveDevStyleCustomerName } from '../../utils/devStyleDisplay';
import {
  formStandardCategoryPillClass,
  formStandardControlClass,
  formStandardLabelClass,
  primaryToolbarButtonClass,
  subModuleTabButtonClass,
} from '../../styles/uiDensity';

export type DevListTab = 'developing' | 'archived';
export type DevSortMode = 'time' | 'customer';

interface DevStyleSidebarProps {
  styles: DevStyleDto[];
  categories: ProductCategory[];
  partners: Partner[];
  templates: DevStageTemplateDto[];
  selectedId: string | null;
  activeTab: DevListTab;
  onTabChange: (tab: DevListTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortMode: DevSortMode;
  onSortModeChange: (m: DevSortMode) => void;
  filters: DevStyleListFilters;
  onFiltersChange: (filters: DevStyleListFilters) => void;
  /** 已按 Tab / 搜索 / 筛选过滤后的款式（父级统一计算，避免选中与列表不一致） */
  visibleStyles: DevStyleDto[];
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  canCreate: boolean;
  loading?: boolean;
}

function StyleListCard({
  style,
  selected,
  onSelect,
}: {
  style: DevStyleDto;
  selected: boolean;
  onSelect: () => void;
}) {
  const hasError = style.samples.some((s) => s.stages.some((st) => st.status === 'exception'));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-2xl border transition-all relative ${
        selected ? 'bg-indigo-50/50 border-indigo-200 shadow-sm' : 'bg-white border-transparent hover:bg-slate-50'
      }`}
    >
      {hasError && (
        <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
      <div className="flex gap-4">
        <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
          {style.imageUrl ? (
            <img src={style.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-6 h-6 text-slate-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{style.name}</h4>
            {style.status === DevStyleStatus.PUBLISHED && (
              <span className="shrink-0 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white">已发布</span>
            )}
          </div>
          <p className="mb-2 truncate text-xs font-medium text-slate-500">{style.code}</p>
          <div className="flex flex-col gap-1.5">
            {style.samples.map((sample) => {
              const progress = getDevSampleSidebarProgress(sample);
              const dotClass =
                progress.kind === 'exception'
                  ? 'bg-red-500'
                  : progress.kind === 'in_progress'
                    ? 'bg-blue-500'
                    : progress.kind === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-slate-300';
              const textClass =
                progress.kind === 'exception'
                  ? 'text-red-500 font-bold'
                  : progress.kind === 'completed'
                    ? 'text-emerald-600 font-bold'
                    : '';
              return (
                <div key={sample.id} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className={`w-1 h-1 rounded-full shrink-0 ${dotClass}`} />
                  <span className={`truncate ${textClass}`}>
                    {sample.name}: {progress.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </button>
  );
}

const DevStyleSidebar: React.FC<DevStyleSidebarProps> = ({
  styles,
  categories,
  partners,
  templates,
  selectedId,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  sortMode,
  onSortModeChange,
  filters,
  onFiltersChange,
  visibleStyles,
  onSelect,
  onCreate,
  canCreate,
  loading,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const stageFilterOptions = useMemo(
    () => collectDevStageFilterOptions(templates, styles),
    [templates, styles],
  );

  const filterActive = hasActiveDevStyleListFilter(filters, activeTab);
  const customerSortEnabled = categories.some((c) => c.linkPartner);
  const sortActive = sortMode !== 'time';
  const panelActive = filterActive || sortActive;

  const sorted = useMemo(() => {
    const list = [...visibleStyles];
    if (sortMode === 'time') {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else {
      list.sort((a, b) =>
        (resolveDevStyleCustomerName(a, partners) || '未分配客户').localeCompare(
          resolveDevStyleCustomerName(b, partners) || '未分配客户',
          'zh-CN',
        ),
      );
    }
    return list;
  }, [visibleStyles, sortMode, partners]);

  const customerGroups = useMemo(() => {
    const groups: Record<string, DevStyleDto[]> = {};
    for (const s of sorted) {
      const key = resolveDevStyleCustomerName(s, partners)?.trim() || '未分配客户';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === '未分配客户') return 1;
      if (b === '未分配客户') return -1;
      return a.localeCompare(b, 'zh-CN');
    });
  }, [sorted, partners]);

  const developingCount = styles.filter((s) => s.status === DevStyleStatus.DEVELOPING).length;
  const archivedCount = styles.filter(
    (s) => s.status === DevStyleStatus.ARCHIVED || s.status === DevStyleStatus.PUBLISHED,
  ).length;

  const toggleCustomer = (name: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <aside className="w-[340px] shrink-0 bg-white border-r border-slate-200 flex flex-col h-full">
      {canCreate && (
        <div className="p-6 border-b border-slate-50">
          <button
            type="button"
            onClick={onCreate}
            className={`w-full flex items-center justify-center gap-2 ${primaryToolbarButtonClass}`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            录入新产品
          </button>
        </div>
      )}

      <div className="px-6 py-4 flex gap-2">
        {(['developing', 'archived'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`flex-1 flex items-center justify-center gap-2 ${subModuleTabButtonClass(activeTab === tab)}`}
          >
            {tab === 'developing' ? '开发中' : '已归档'}
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {tab === 'developing' ? developingCount : archivedCount}
            </span>
          </button>
        ))}
      </div>

      <div className="px-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索款号、品名、客户…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`${formStandardControlClass} pl-10`}
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className={`p-2.5 rounded-xl border transition-all ${
              filterOpen || panelActive
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-indigo-600'
            }`}
            title="筛选与排序"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="mx-6 mb-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
            <span className="text-xs font-semibold text-slate-900">筛选与排序</span>
            <button
              type="button"
              onClick={() => {
                onFiltersChange({ stageName: 'all', syncStatus: 'all' });
                onSortModeChange('time');
              }}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              重置
            </button>
          </div>
          <div>
            <label className={`mb-2 ${formStandardLabelClass}`}>
              排列方式
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onSortModeChange('time')}
                className={`flex items-center justify-center gap-1.5 ${formStandardCategoryPillClass(sortMode === 'time')}`}
              >
                <Clock className="h-3.5 w-3.5" />
                按时间
              </button>
              {customerSortEnabled ? (
                <button
                  type="button"
                  onClick={() => onSortModeChange('customer')}
                  className={`flex items-center justify-center gap-1.5 ${formStandardCategoryPillClass(sortMode === 'customer')}`}
                >
                  <Users className="h-3.5 w-3.5" />
                  按客户
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="请先在设置 → 产品分类中启用「关联合作单位」"
                  className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-300"
                >
                  <Users className="h-3.5 w-3.5" />
                  按客户
                </button>
              )}
            </div>
          </div>
          {activeTab === 'developing' ? (
            <div>
              <label className={`mb-2 ${formStandardLabelClass}`}>
                当前进度节点
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onFiltersChange({ ...filters, stageName: 'all' })}
                  className={formStandardCategoryPillClass(filters.stageName === 'all')}
                >
                  全部节点
                </button>
                {stageFilterOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, stageName: name })}
                    className={formStandardCategoryPillClass(filters.stageName === name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className={`mb-2 ${formStandardLabelClass}`}>
                同步状态
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['all', '全部'],
                    ['synced', '已同步'],
                    ['unsynced', '未同步'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFiltersChange({ ...filters, syncStatus: value })}
                    className={`justify-center ${formStandardCategoryPillClass(filters.syncStatus === value)}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
        {loading ? (
          <p className="text-center text-xs text-slate-400 py-12">加载中…</p>
        ) : sorted.length === 0 ? (
          <p className="py-12 text-center text-xs text-slate-400">
            {filterActive || sortActive || searchQuery.trim() ? '当前筛选条件下暂无款式' : '暂无款式'}
          </p>
        ) : sortMode === 'customer' ? (
          customerGroups.map(([customer, items]) => {
            const expanded = expandedCustomers.has(customer) || items.some((s) => s.id === selectedId);
            return (
              <div key={customer}>
                <button
                  type="button"
                  onClick={() => toggleCustomer(customer)}
                  className="w-full flex items-center gap-2 px-2 py-2 text-xs font-semibold text-slate-400 hover:text-indigo-600"
                >
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  {customer}
                  <span className="ml-auto text-slate-300">{items.length}</span>
                </button>
                {expanded && (
                  <div className="space-y-2 mb-3">
                    {items.map((s) => (
                      <StyleListCard
                        key={s.id}
                        style={s}
                        selected={selectedId === s.id}
                        onSelect={() => onSelect(s.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          sorted.map((s) => (
            <StyleListCard
              key={s.id}
              style={s}
              selected={selectedId === s.id}
              onSelect={() => onSelect(s.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
};

export default DevStyleSidebar;
