import { describe, it, expect } from 'vitest';
import {
  WORKBENCH_BUILTIN_DEFAULT,
  type WorkbenchConfig,
} from '../shared/workbench';
import {
  resolveEffectiveWorkbenchConfig,
  normalizeWorkbenchConfig,
  filterWorkbenchByAccess,
} from '../shared/workbenchValidate';

describe('resolveEffectiveWorkbenchConfig', () => {
  it('prefers user override over builtin default', () => {
    const user: WorkbenchConfig = {
      version: 1,
      activePageId: 'u1',
      pages: [
        { id: 'page-overview', title: '首页', sortOrder: 0, layout: { version: 1, items: [] } },
        { id: 'u1', title: '我的', sortOrder: 1, layout: { version: 1, items: [] } },
      ],
    };
    const effective = resolveEffectiveWorkbenchConfig(user);
    expect(effective.pages.find(p => p.id === 'u1')?.title).toBe('我的');
    expect(effective.pages[0].title).toBe('首页');
  });

  it('falls back to builtin when no config', () => {
    const effective = resolveEffectiveWorkbenchConfig(null);
    expect(effective.activePageId).toBe(WORKBENCH_BUILTIN_DEFAULT.activePageId);
    expect(effective.pages[0].title).toBe('首页');
  });

  it('pins home page first and renames legacy overview title', () => {
    const config = normalizeWorkbenchConfig({
      version: 1,
      activePageId: 'page-custom',
      pages: [
        { id: 'page-custom', title: '自定义', sortOrder: 0, layout: { version: 1, items: [] } },
        { id: 'page-overview', title: '概览', sortOrder: 1, layout: { version: 1, items: [] } },
      ],
    });
    expect(config.pages[0].id).toBe('page-overview');
    expect(config.pages[0].title).toBe('首页');
    expect(config.pages[1].id).toBe('page-custom');
  });
});

describe('normalizeWorkbenchConfig', () => {
  it('keeps at least one page from empty pages array', () => {
    const normalized = normalizeWorkbenchConfig({ version: 1, activePageId: 'x', pages: [] });
    expect(normalized.pages.length).toBeGreaterThanOrEqual(1);
  });

  it('fixes invalid activePageId to home when home is injected', () => {
    const config = normalizeWorkbenchConfig({
      version: 1,
      activePageId: 'missing',
      pages: [{ id: 'p1', title: 'A', sortOrder: 0, layout: { version: 1, items: [] } }],
    });
    expect(config.activePageId).toBe('page-overview');
    expect(config.pages[0].title).toBe('首页');
    expect(config.pages[1]?.id).toBe('p1');
  });
});

describe('mergeWorkbenchHomePinnedItems', () => {
  it('always restores pinned widgets on home page', () => {
    const config = normalizeWorkbenchConfig({
      version: 1,
      activePageId: 'page-overview',
      pages: [
        {
          id: 'page-overview',
          title: '首页',
          sortOrder: 0,
          layout: {
            version: 1,
            items: [
              { i: 'w-sales', widgetType: 'sales_stats', x: 0, y: 20, w: 4, h: 6 },
            ],
          },
        },
      ],
    });
    const types = config.pages[0].layout.items.map(i => i.widgetType);
    expect(types).toContain('shortcuts');
    expect(types).toContain('plugin_center');
    expect(types).toContain('messages');
    expect(types).toContain('sales_stats');
    expect(types.filter(t => t === 'shortcuts')).toHaveLength(1);
    const messages = config.pages[0].layout.items.find(i => i.widgetType === 'messages');
    expect(messages).toMatchObject({ x: 8, y: 0, w: 4, h: 6 });
  });

  it('pushes custom widgets below pinned header row', () => {
    const config = normalizeWorkbenchConfig({
      version: 1,
      activePageId: 'page-overview',
      pages: [
        {
          id: 'page-overview',
          title: '首页',
          sortOrder: 0,
          layout: {
            version: 1,
            items: [
              { i: 'w-order', widgetType: 'order_stats', x: 8, y: 0, w: 5, h: 7 },
            ],
          },
        },
      ],
    });
    const order = config.pages[0].layout.items.find(i => i.widgetType === 'order_stats');
    expect(order?.y).toBeGreaterThanOrEqual(6);
    const messages = config.pages[0].layout.items.find(i => i.widgetType === 'messages');
    expect(messages).toMatchObject({ x: 8, y: 0 });
  });

  it('builtin default includes full home dashboard layout', () => {
    const types = WORKBENCH_BUILTIN_DEFAULT.pages[0].layout.items.map(i => i.widgetType);
    expect(types).toEqual([
      'shortcuts',
      'plugin_center',
      'messages',
      'order_stats',
      'outsource_stats',
      'finance_stats',
      'sales_stats',
      'rework_stats',
    ]);
  });
});

describe('filterWorkbenchByAccess', () => {
  it('removes widgets without module permission', () => {
    const config = normalizeWorkbenchConfig(WORKBENCH_BUILTIN_DEFAULT);
    const filtered = filterWorkbenchByAccess(config, {
      permissions: ['basic'],
      featurePlugins: {},
      tenantRole: 'worker',
    });
    const types = filtered.pages.flatMap(p => p.layout.items.map(i => i.widgetType));
    expect(types).not.toContain('production_stats');
    expect(types).toContain('shortcuts');
  });
});
