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
  hasWorkbenchModuleAccess,
  hasWorkbenchNavAccess,
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

describe('hasWorkbenchNavAccess', () => {
  it('owner 恒显示侧栏入口，历史 admin 不再提权', () => {
    expect(hasWorkbenchNavAccess([], 'owner')).toBe(true);
    expect(hasWorkbenchNavAccess(['production'], 'admin')).toBe(false);
  });

  it('须显式授予 workbench 或页面 key', () => {
    expect(hasWorkbenchNavAccess(['workbench'], 'member')).toBe(true);
    expect(hasWorkbenchNavAccess([workbenchPagePermKey('page-a')], 'member')).toBe(true);
  });

  it('未配置工作台时不显示（含空权限与其它模块）', () => {
    expect(hasWorkbenchNavAccess([], 'member')).toBe(false);
    expect(hasWorkbenchNavAccess(['production', 'psi'], 'member')).toBe(false);
  });
});

describe('hasWorkbenchModuleAccess', () => {
  it('空权限列表无工作台入口', () => {
    expect(hasWorkbenchModuleAccess([])).toBe(false);
  });

  it('裸 workbench 或页面 key 视为有入口', () => {
    expect(hasWorkbenchModuleAccess(['workbench'])).toBe(true);
    expect(hasWorkbenchModuleAccess([workbenchPagePermKey('page-a')])).toBe(true);
  });

  it('仅有其它模块权限时无工作台入口', () => {
    expect(hasWorkbenchModuleAccess(['production', 'psi'])).toBe(false);
  });
});

describe('canViewWorkbenchPage', () => {
  const p = page('page-a', 'owner1');

  it('未授予工作台时首页不可见', () => {
    expect(canViewWorkbenchPage(home, { userId: 'uX', permissions: [] })).toBe(false);
  });

  it('owner 对全部页面恒可见，历史 admin 按成员权限处理', () => {
    expect(canViewWorkbenchPage(home, { userId: 'owner1', permissions: ['production'], tenantRole: 'owner' })).toBe(true);
    expect(canViewWorkbenchPage(p, { userId: 'owner1', permissions: [], tenantRole: 'owner' })).toBe(true);
    expect(canViewWorkbenchPage(home, { userId: 'admin1', permissions: ['production'], tenantRole: 'admin' })).toBe(false);
  });

  it('首页对已配置其它模块但未授予工作台的角色不可见', () => {
    expect(canViewWorkbenchPage(home, { userId: 'uX', permissions: ['production', 'psi'] })).toBe(false);
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

  it('成员即使是历史页面创建人也须获得角色授权', () => {
    expect(canViewWorkbenchPage(p, { userId: 'owner1', permissions: [] })).toBe(false);
  });

  it('未授权成员默认不可见', () => {
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
  it('只有企业创建者可编辑；被授权成员只读', () => {
    expect(canEditWorkbenchPage(p, { userId: 'owner1', permissions: [], tenantRole: 'owner' })).toBe(true);
    expect(
      canEditWorkbenchPage(p, { userId: 'u2', permissions: [workbenchPagePermKey('page-a')] }),
    ).toBe(false);
  });
  it('owner 对首页恒可编辑', () => {
    expect(canEditWorkbenchPage(home, { userId: 'owner1', permissions: ['production'], tenantRole: 'owner' })).toBe(true);
  });
  it('成员的工作台页面始终只读', () => {
    expect(canEditWorkbenchPage(home, { userId: 'u1', permissions: ['production'] })).toBe(false);
    expect(canEditWorkbenchPage(home, { userId: 'u1', permissions: ['workbench'] })).toBe(false);
    expect(
      canEditWorkbenchPage(home, {
        userId: 'u1',
        permissions: [workbenchPagePermKey(WORKBENCH_HOME_PAGE_ID)],
      }),
    ).toBe(false);
  });
});

describe('hasWorkbenchPageFullAccess', () => {
  const p = page('page-a', 'owner1');

  it('owner 恒为完整可见，历史 admin 不再提权', () => {
    expect(hasWorkbenchPageFullAccess(p, { userId: 'x', permissions: [], tenantRole: 'owner' })).toBe(true);
    expect(hasWorkbenchPageFullAccess(home, { userId: 'x', permissions: [], tenantRole: 'admin' })).toBe(false);
  });

  it('成员的历史页面创建记录不代替角色授权', () => {
    expect(hasWorkbenchPageFullAccess(p, { userId: 'owner1', permissions: [] })).toBe(false);
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
  it('仅保留可见页；页面历史创建人无权限时也不保留', () => {
    const config = {
      version: 1 as const,
      activePageId: 'page-b',
      pages: [home, page('page-a', 'u1'), page('page-b', 'u2')],
    };
    const filtered = filterWorkbenchPagesByVisibility(config, { userId: 'u1', permissions: ['production'] });
    const ids = filtered.pages.map(p => p.id);
    expect(ids).not.toContain(WORKBENCH_HOME_PAGE_ID);
    expect(ids).not.toContain('page-a');
    expect(ids).not.toContain('page-b');
    expect(filtered.pages).toHaveLength(0);
  });

  it('未授予任何工作台权限时结果为空', () => {
    const config = {
      version: 1 as const,
      activePageId: WORKBENCH_HOME_PAGE_ID,
      pages: [home, page('page-a', 'owner1')],
    };
    const filtered = filterWorkbenchPagesByVisibility(config, {
      userId: 'u2',
      permissions: ['production', 'psi'],
    });
    expect(filtered.pages).toHaveLength(0);
  });

  it('未授予工作台时首页默认不保留（空权限）', () => {
    const config = {
      version: 1 as const,
      activePageId: 'page-b',
      pages: [home, page('page-a', 'u1'), page('page-b', 'u2')],
    };
    const filtered = filterWorkbenchPagesByVisibility(config, { userId: 'u1', permissions: [] });
    const ids = filtered.pages.map(p => p.id);
    expect(ids).not.toContain(WORKBENCH_HOME_PAGE_ID);
    expect(ids).not.toContain('page-a');
    expect(ids).not.toContain('page-b');
    expect(filtered.pages).toHaveLength(0);
  });

  it('owner 过滤后保留全部页面', () => {
    const config = {
      version: 1 as const,
      activePageId: WORKBENCH_HOME_PAGE_ID,
      pages: [home, page('page-a', 'u2')],
    };
    const filtered = filterWorkbenchPagesByVisibility(config, {
      userId: 'owner1',
      permissions: ['production'],
      tenantRole: 'owner',
    });
    expect(filtered.pages.map(p => p.id)).toContain(WORKBENCH_HOME_PAGE_ID);
    expect(filtered.pages.map(p => p.id)).toContain('page-a');
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
