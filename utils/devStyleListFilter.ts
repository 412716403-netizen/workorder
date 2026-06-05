import type { DevStageTemplateDto, DevStyleDto, Partner } from '../types';
import { DevStyleStatus } from '../types';
import { resolveDevStyleCustomerName } from './devStyleDisplay';

export type DevSyncFilter = 'all' | 'synced' | 'unsynced';
export type DevStageNameFilter = 'all' | string;
export type DevListTab = 'developing' | 'archived';

export interface DevStyleListFilters {
  /** 开发中：当前进行中的节点名 */
  stageName: DevStageNameFilter;
  /** 已归档：是否已同步大货 */
  syncStatus: DevSyncFilter;
}

export const DEV_STYLE_LIST_FILTERS_DEFAULT: DevStyleListFilters = {
  stageName: 'all',
  syncStatus: 'all',
};

export interface DevStyleListFilterParams {
  activeTab: DevListTab;
  searchQuery: string;
  filters: DevStyleListFilters;
  partners?: Partner[];
}

/** 款式是否有指定名称且状态为进行中的节点（任一样品轮次） */
export function styleHasStageInProgress(style: DevStyleDto, stageName: string): boolean {
  if (!stageName || stageName === 'all') return true;
  return style.samples.some((sample) =>
    sample.stages.some((st) => st.name === stageName && st.status === 'in_progress'),
  );
}

export function styleMatchesSyncFilter(style: DevStyleDto, syncStatus: DevSyncFilter): boolean {
  if (syncStatus === 'all') return true;
  if (syncStatus === 'synced') return style.status === DevStyleStatus.PUBLISHED;
  if (syncStatus === 'unsynced') return style.status === DevStyleStatus.ARCHIVED;
  return true;
}

export function styleMatchesDevListTab(style: DevStyleDto, activeTab: DevListTab): boolean {
  if (activeTab === 'archived') {
    return style.status === DevStyleStatus.ARCHIVED || style.status === DevStyleStatus.PUBLISHED;
  }
  return style.status === DevStyleStatus.DEVELOPING;
}

export function styleMatchesDevSearch(
  style: DevStyleDto,
  searchQuery: string,
  partners?: Partner[],
): boolean {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  const customer = (resolveDevStyleCustomerName(style, partners) ?? '').toLowerCase();
  return (
    style.code.toLowerCase().includes(q) ||
    style.name.toLowerCase().includes(q) ||
    customer.includes(q)
  );
}

/** 侧边栏 Tab + 搜索 + 筛选后的可见款式列表 */
export function filterDevStyles(
  styles: DevStyleDto[],
  params: DevStyleListFilterParams,
): DevStyleDto[] {
  const { activeTab, searchQuery, filters, partners } = params;
  return styles.filter((s) => {
    if (!styleMatchesDevListTab(s, activeTab)) return false;
    if (activeTab === 'developing' && !styleHasStageInProgress(s, filters.stageName)) return false;
    if (activeTab === 'archived' && !styleMatchesSyncFilter(s, filters.syncStatus)) return false;
    return styleMatchesDevSearch(s, searchQuery, partners);
  });
}

export function hasActiveDevStyleListFilter(
  filters: DevStyleListFilters,
  tab: DevListTab,
): boolean {
  if (tab === 'developing') return filters.stageName !== 'all';
  return filters.syncStatus !== 'all';
}

/** 节点库顺序 + 样品中实际出现的节点名 */
export function collectDevStageFilterOptions(
  templates: DevStageTemplateDto[],
  styles: DevStyleDto[],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const t of [...templates].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))) {
    if (!seen.has(t.name)) {
      seen.add(t.name);
      ordered.push(t.name);
    }
  }
  for (const style of styles) {
    for (const sample of style.samples) {
      for (const st of sample.stages) {
        if (!seen.has(st.name)) {
          seen.add(st.name);
          ordered.push(st.name);
        }
      }
    }
  }
  return ordered;
}
