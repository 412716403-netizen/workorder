import { describe, expect, it } from 'vitest';
import type { DevStyleDto } from '../types';
import { DevStageStatus, DevStyleStatus } from '../types';
import {
  styleHasStageInProgress,
  styleMatchesSyncFilter,
  styleMatchesDevSearch,
  hasActiveDevStyleListFilter,
  filterDevStyles,
} from './devStyleListFilter';

const baseStyle = (overrides: Partial<DevStyleDto>): DevStyleDto => ({
  id: 's1',
  code: 'A',
  name: 'n',
  colorIds: [],
  sizeIds: [],
  milestoneNodeIds: [],
  status: DevStyleStatus.DEVELOPING,
  variants: [],
  samples: [
    {
      id: 'sam1',
      name: '头样',
      createdAt: '',
      stages: [
        { id: 'st1', name: '设计', status: DevStageStatus.IN_PROGRESS, order: 0, updatedAt: '', fields: [], attachments: [] },
        { id: 'st2', name: '制版', status: DevStageStatus.PENDING, order: 1, updatedAt: '', fields: [], attachments: [] },
      ],
      logs: [],
    },
  ],
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('styleHasStageInProgress', () => {
  it('matches in_progress stage name', () => {
    expect(styleHasStageInProgress(baseStyle({}), '设计')).toBe(true);
    expect(styleHasStageInProgress(baseStyle({}), '制版')).toBe(false);
  });
});

describe('styleMatchesSyncFilter', () => {
  it('filters published vs archived', () => {
    expect(styleMatchesSyncFilter(baseStyle({ status: DevStyleStatus.PUBLISHED }), 'synced')).toBe(true);
    expect(styleMatchesSyncFilter(baseStyle({ status: DevStyleStatus.ARCHIVED }), 'synced')).toBe(false);
    expect(styleMatchesSyncFilter(baseStyle({ status: DevStyleStatus.ARCHIVED }), 'unsynced')).toBe(true);
  });
});

describe('styleMatchesDevSearch', () => {
  it('matches supplier partner name when partners provided', () => {
    const style = baseStyle({ supplierId: 'p1' });
    const partners = [{ id: 'p1', name: '华联客户', categoryId: 'c1' }];
    expect(styleMatchesDevSearch(style, '华联', partners)).toBe(true);
    expect(styleMatchesDevSearch(style, '不存在', partners)).toBe(false);
  });
});

describe('filterDevStyles', () => {
  it('returns empty when stage filter matches nothing', () => {
    const list = filterDevStyles([baseStyle({})], {
      activeTab: 'developing',
      searchQuery: '',
      filters: { stageName: '制版', syncStatus: 'all' },
    });
    expect(list).toHaveLength(0);
  });
});

describe('hasActiveDevStyleListFilter', () => {
  it('checks tab-specific active filter', () => {
    expect(hasActiveDevStyleListFilter({ stageName: '设计', syncStatus: 'all' }, 'developing')).toBe(true);
    expect(hasActiveDevStyleListFilter({ stageName: 'all', syncStatus: 'synced' }, 'developing')).toBe(false);
    expect(hasActiveDevStyleListFilter({ stageName: 'all', syncStatus: 'synced' }, 'archived')).toBe(true);
  });
});
