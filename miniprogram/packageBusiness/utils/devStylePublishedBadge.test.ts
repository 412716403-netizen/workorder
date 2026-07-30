import { describe, it, expect } from 'vitest';
import { isDevStylePublishedForDisplay } from './devStyleDisplay.js';
import { buildDevStyleListRows } from './devStyleListFilter.js';
import { buildStyleDetailView } from './devStyleDetailView.js';

const listCtx = { categories: [], partners: [], dictionaries: { colors: [], sizes: [], units: [] } };
const detailCtx = {
  ...listCtx,
  globalNodes: [],
  canEdit: true,
  canDelete: true,
};

function style(overrides: Record<string, unknown> = {}) {
  return {
    id: 'st1',
    code: 'D001',
    name: '产品编号A',
    status: 'developing',
    publishedProductId: null,
    colorIds: [],
    sizeIds: [],
    milestoneNodeIds: [],
    variants: [],
    samples: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Web 侧同名函数在 utils/devStyleDisplay.ts，两端口径必须一致
describe('isDevStylePublishedForDisplay (miniprogram parity)', () => {
  it('keeps the published mark after restoring to developing', () => {
    expect(isDevStylePublishedForDisplay(style({ publishedProductId: 'prod1' }))).toBe(true);
    expect(
      isDevStylePublishedForDisplay(style({ status: 'archived', publishedProductId: 'prod1' })),
    ).toBe(true);
  });

  it('marks published styles and leaves never-published ones alone', () => {
    expect(isDevStylePublishedForDisplay(style({ status: 'published' }))).toBe(true);
    expect(isDevStylePublishedForDisplay(style())).toBe(false);
    expect(isDevStylePublishedForDisplay(null)).toBe(false);
  });
});

describe('列表卡片徽章', () => {
  it('shows 已发布 for a restored style sitting in 开发中', () => {
    const [row] = buildDevStyleListRows([style({ publishedProductId: 'prod1' })], listCtx);
    expect(row.showPublishedBadge).toBe(true);
    expect(row.statusLabel).toBe('');
  });

  it('leaves a plain developing style without any badge', () => {
    const [row] = buildDevStyleListRows([style()], listCtx);
    expect(row.showPublishedBadge).toBe(false);
    expect(row.statusLabel).toBe('');
  });

  it('still shows 已发布 for published styles', () => {
    const [row] = buildDevStyleListRows([
      style({ status: 'published', publishedProductId: 'prod1' }),
    ], listCtx);
    expect(row.showPublishedBadge).toBe(true);
  });
});

describe('详情徽章', () => {
  it('adds a separate 已发布 badge next to 开发中', () => {
    const detail = buildStyleDetailView(style({ publishedProductId: 'prod1' }), detailCtx);
    expect(detail.statusLabel).toBe('开发中');
    expect(detail.showPublishedBadge).toBe(true);
  });

  it('does not duplicate the badge while the style is still published', () => {
    const detail = buildStyleDetailView(
      style({ status: 'published', publishedProductId: 'prod1' }),
      detailCtx,
    );
    expect(detail.statusTone).toBe('published');
    expect(detail.showPublishedBadge).toBe(false);
  });

  it('hides 生成商品 once a product exists', () => {
    const detail = buildStyleDetailView(
      style({ status: 'archived', publishedProductId: 'prod1' }),
      detailCtx,
    );
    expect(detail.showPublishedBadge).toBe(true);
    expect(detail.actions.showPublish).toBe(false);
  });

  it('allows 还原至开发中 while published (read-only)', () => {
    const detail = buildStyleDetailView(
      style({ status: 'published', publishedProductId: 'prod1' }),
      detailCtx,
    );
    expect(detail.actions.showRestore).toBe(true);
    expect(detail.actions.showEdit).toBe(false);
    expect(detail.readOnly).toBe(true);
  });

  it('allows editing after restore while keeping publishedProductId', () => {
    const detail = buildStyleDetailView(
      style({ status: 'developing', publishedProductId: 'prod1' }),
      detailCtx,
    );
    expect(detail.actions.showEdit).toBe(true);
    expect(detail.actions.showArchive).toBe(true);
    expect(detail.actions.showPublish).toBe(false);
    expect(detail.showPublishedBadge).toBe(true);
  });
});
