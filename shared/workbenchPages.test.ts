import { describe, it, expect } from 'vitest';
import {
  WORKBENCH_HOME_PAGE_ID,
  workbenchPagePermKey,
  type WorkbenchPage,
} from './workbench.js';
import {
  canViewWorkbenchPage,
  canEditWorkbenchPage,
  hasWorkbenchPageFullAccess,
  canUseWidget,
  filterWorkbenchPagesByVisibility,
  mergeSharedWorkbenchPages,
} from './workbenchValidate.js';

function page(id: string, createdByUserId: string | null): WorkbenchPage {
  return {
    id,
    title: id,
    sortOrder: 1,
    layout: { version: 1, items: [] },
    createdByUserId,
  };
}

const home = page(WORKBENCH_HOME_PAGE_ID, null);

describe('canViewWorkbenchPage', () => {
  const p = page('page-a', 'owner1');

  it('首页对未涉及工作台页面权限的角色默认可见', () => {
    expect(canViewWorkbenchPage(home, { userId: 'uX', permissions: [] })).toBe(true);
    expect(canViewWorkbenchPage(home, { userId: 'uX', permissions: ['production', 'psi'] })).toBe(true);
  });

  it('裸 workbench 或显式授予首页时首页可见', () => {
    expect(canViewWorkbenchPage(home, { userId: 'uX', permissions: ['workbench'] })).toBe(true);
    expect(
      canViewWorkbenchPage(home, {
        userId: 'uX',
        permissions: [workbenchPagePermKey(WORKBENCH_HOME_PAGE_ID)],
      }),
    ).toBe(true);
  });

  it('角色已按页面授权但未含首页时，首页被隐藏', () => {
    expect(
      canViewWorkbenchPage(home, { userId: 'uX', permissions: [workbenchPagePermKey('page-a')] }),
    ).toBe(false);
  });

  it('创建者本人可见自己的自定义页', () => {
    expect(canViewWorkbenchPage(p, { userId: 'owner1', permissions: [] })).toBe(true);
  });

  it('非创建者默认不可见（不给 owner/admin 自动可见）', () => {
    expect(canViewWorkbenchPage(p, { userId: 'u2', permissions: [] })).toBe(false);
  });

  it('被角色授予 workbench:<pageId> 后可见', () => {
    expect(
      canViewWorkbenchPage(p, { userId: 'u2', permissions: [workbenchPagePermKey('page-a')] }),
    ).toBe(true);
  });

  it('被授予裸 workbench 模块＝全部页面可见', () => {
    expect(canViewWorkbenchPage(p, { userId: 'u2', permissions: ['workbench'] })).toBe(true);
  });
});

describe('canEditWorkbenchPage', () => {
  const p = page('page-a', 'owner1');
  it('仅创建者可编辑；被授权的只读查看者不可编辑', () => {
    expect(canEditWorkbenchPage(p, { userId: 'owner1', permissions: [] })).toBe(true);
    expect(
      canEditWorkbenchPage(p, { userId: 'u2', permissions: [workbenchPagePermKey('page-a')] }),
    ).toBe(false);
  });
  it('首页为个人页，恒可编辑', () => {
    expect(canEditWorkbenchPage(home, { userId: 'u1', permissions: [] })).toBe(true);
  });
});

describe('hasWorkbenchPageFullAccess', () => {
  const p = page('page-a', 'owner1');

  it('owner/admin 恒为完整可见', () => {
    expect(hasWorkbenchPageFullAccess(p, { userId: 'x', permissions: [], tenantRole: 'owner' })).toBe(true);
    expect(hasWorkbenchPageFullAccess(home, { userId: 'x', permissions: [], tenantRole: 'admin' })).toBe(true);
  });

  it('创建者本人对自己的自定义页完整可见', () => {
    expect(hasWorkbenchPageFullAccess(p, { userId: 'owner1', permissions: [] })).toBe(true);
  });

  it('被授予 workbench:<pageId> 即完整可见', () => {
    expect(
      hasWorkbenchPageFullAccess(p, { userId: 'u2', permissions: [workbenchPagePermKey('page-a')] }),
    ).toBe(true);
  });

  it('裸 workbench 对全部页面（含首页）完整可见', () => {
    expect(hasWorkbenchPageFullAccess(home, { userId: 'u2', permissions: ['workbench'] })).toBe(true);
    expect(hasWorkbenchPageFullAccess(p, { userId: 'u2', permissions: ['workbench'] })).toBe(true);
  });

  it('授予首页 workbench:<homeId> 使首页完整可见', () => {
    expect(
      hasWorkbenchPageFullAccess(home, {
        userId: 'u2',
        permissions: [workbenchPagePermKey(WORKBENCH_HOME_PAGE_ID)],
      }),
    ).toBe(true);
  });

  it('普通查看者对未授权页不完整可见', () => {
    expect(hasWorkbenchPageFullAccess(p, { userId: 'u2', permissions: [] })).toBe(false);
    expect(hasWorkbenchPageFullAccess(home, { userId: 'u2', permissions: [] })).toBe(false);
  });
});

describe('canUseWidget 页面级完整授权', () => {
  const noPerm = { permissions: ['production'], featurePlugins: {} };

  it('无对应模块时默认剔除金额类统计组件', () => {
    expect(canUseWidget('sales_stats', noPerm)).toBe(false);
  });

  it('完整授权时跳过模块校验，保留统计组件', () => {
    expect(canUseWidget('sales_stats', noPerm, true)).toBe(true);
    expect(canUseWidget('finance_stats', noPerm, true)).toBe(true);
  });

  it('完整授权仍受功能插件开关约束', () => {
    const collabOff = { permissions: [], featurePlugins: { collaboration: false } };
    // sales_stats 不依赖插件，完整授权下可用
    expect(canUseWidget('sales_stats', collabOff, true)).toBe(true);
  });
});

describe('filterWorkbenchPagesByVisibility', () => {
  it('仅保留可见页；无工作台页面权限时首页默认保留', () => {
    const config = {
      version: 1 as const,
      activePageId: 'page-b',
      pages: [home, page('page-a', 'u1'), page('page-b', 'u2')],
    };
    const filtered = filterWorkbenchPagesByVisibility(config, { userId: 'u1', permissions: [] });
    const ids = filtered.pages.map(p => p.id);
    expect(ids).toContain(WORKBENCH_HOME_PAGE_ID);
    expect(ids).toContain('page-a');
    expect(ids).not.toContain('page-b');
    // activePageId 不可见时回落首页
    expect(filtered.activePageId).toBe(WORKBENCH_HOME_PAGE_ID);
  });

  it('角色按页面授权但未含首页时，首页被移除且不再被重新注入', () => {
    const config = {
      version: 1 as const,
      activePageId: WORKBENCH_HOME_PAGE_ID,
      pages: [home, page('page-a', 'owner1'), page('page-b', 'owner1')],
    };
    const filtered = filterWorkbenchPagesByVisibility(config, {
      userId: 'u2',
      permissions: [workbenchPagePermKey('page-a')],
    });
    const ids = filtered.pages.map(p => p.id);
    expect(ids).not.toContain(WORKBENCH_HOME_PAGE_ID);
    expect(ids).toEqual(['page-a']);
    // 首页不可见，activePageId 回落到首个可见页
    expect(filtered.activePageId).toBe('page-a');
  });

  it('角色按页面授权且未授予任何可见页时，结果为空（无首页注入）', () => {
    const config = {
      version: 1 as const,
      activePageId: WORKBENCH_HOME_PAGE_ID,
      pages: [home, page('page-a', 'owner1')],
    };
    const filtered = filterWorkbenchPagesByVisibility(config, {
      userId: 'u2',
      permissions: [workbenchPagePermKey('page-zzz')],
    });
    expect(filtered.pages).toHaveLength(0);
  });
});

describe('mergeSharedWorkbenchPages', () => {
  it('管理者(owner)新增页面记为当前用户创建', () => {
    const merged = mergeSharedWorkbenchPages([], [page('new1', null)], { userId: 'owner1', canManage: true });
    expect(merged).toHaveLength(1);
    expect(merged[0].createdByUserId).toBe('owner1');
  });

  it('非管理者新增页面被忽略', () => {
    const merged = mergeSharedWorkbenchPages([], [page('new1', null)], { userId: 'u2', canManage: false });
    expect(merged).toHaveLength(0);
  });

  it('非管理者提交不可改写/删除任何页（库原样保留）', () => {
    const stored = [{ ...page('p1', 'owner1'), title: '原标题' }, page('p2', 'owner1')];
    const submitted = [{ ...page('p1', 'owner1'), title: '被篡改' }];
    const merged = mergeSharedWorkbenchPages(stored, submitted, { userId: 'u2', canManage: false });
    expect(merged.map(p => p.id).sort()).toEqual(['p1', 'p2']);
    expect(merged.find(p => p.id === 'p1')?.title).toBe('原标题');
  });

  it('管理者可改写并删除任意页', () => {
    const stored = [{ ...page('p1', 'owner1'), title: '原' }, page('p2', 'owner1')];
    const submitted = [{ ...page('p1', 'owner1'), title: '改' }];
    const merged = mergeSharedWorkbenchPages(stored, submitted, { userId: 'owner1', canManage: true });
    expect(merged.map(p => p.id)).toEqual(['p1']);
    expect(merged[0].title).toBe('改');
    expect(merged[0].createdByUserId).toBe('owner1');
  });
});
