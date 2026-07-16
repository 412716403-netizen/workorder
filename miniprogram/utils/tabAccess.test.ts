import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  canShowHomeTab,
  canShowAppsTab,
  buildVisibleTabItems,
  resolveDefaultTabPath,
} = require('./tabAccess.js') as {
  canShowHomeTab: (ctx: { tenantRole?: string; permissions?: string[] } | null) => boolean;
  canShowAppsTab: (
    ctx: { tenantRole?: string; permissions?: string[] } | null,
    plugins?: Record<string, boolean>,
  ) => boolean;
  buildVisibleTabItems: (
    ctx: { tenantRole?: string; permissions?: string[] } | null,
    plugins?: Record<string, boolean>,
  ) => Array<{ key: string }>;
  resolveDefaultTabPath: (
    ctx: { tenantRole?: string; permissions?: string[] } | null,
    plugins?: Record<string, boolean>,
  ) => string;
};

describe('小程序 Tab 工作台权限', () => {
  it('创建者始终显示首页与应用', () => {
    const ctx = { tenantRole: 'owner', permissions: [] };
    expect(canShowHomeTab(ctx)).toBe(true);
    expect(canShowAppsTab(ctx)).toBe(true);
    expect(buildVisibleTabItems(ctx).map((item) => item.key)).toContain('home');
    expect(buildVisibleTabItems(ctx).map((item) => item.key)).toContain('apps');
    expect(resolveDefaultTabPath(ctx)).toBe('/pages/home/home');
  });

  it('成员没有 workbench 权限时隐藏首页', () => {
    const ctx = { tenantRole: 'worker', permissions: ['production'] };
    expect(canShowHomeTab(ctx)).toBe(false);
    expect(canShowAppsTab(ctx)).toBe(true);
    expect(buildVisibleTabItems(ctx).map((item) => item.key)).not.toContain('home');
    expect(buildVisibleTabItems(ctx).map((item) => item.key)).toContain('apps');
    expect(resolveDefaultTabPath(ctx)).toBe('/pages/apps/apps');
  });

  it('仅报工成员默认进入报工 Tab，并隐藏应用', () => {
    const ctx = { tenantRole: 'worker', permissions: ['process_report'] };
    expect(canShowHomeTab(ctx)).toBe(false);
    expect(canShowAppsTab(ctx)).toBe(false);
    expect(buildVisibleTabItems(ctx).map((item) => item.key)).not.toContain('apps');
    expect(resolveDefaultTabPath(ctx)).toBe('/pages/scan/scan');
  });

  it('仅 process_report 子权限同样隐藏应用', () => {
    const ctx = { tenantRole: 'worker', permissions: ['process_report:self'] };
    expect(canShowAppsTab(ctx)).toBe(false);
    expect(buildVisibleTabItems(ctx).map((item) => item.key)).not.toContain('apps');
  });

  it('成员拥有任一明确工作台页面权限时显示首页', () => {
    const ctx = { tenantRole: 'worker', permissions: ['workbench:page-custom'] };
    expect(canShowHomeTab(ctx)).toBe(true);
    expect(resolveDefaultTabPath(ctx)).toBe('/pages/home/home');
  });
});
