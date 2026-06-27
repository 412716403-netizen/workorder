import {
  WORKBENCH_BUILTIN_DEFAULT,
  WORKBENCH_HOME_PAGE_ID,
  WORKBENCH_WIDGET_CATALOG,
  WORKBENCH_WIDGET_TYPES,
  WORKBENCH_PERM_MODULE,
  isWorkbenchHomePage,
  mergeWorkbenchHomePinnedItems,
  workbenchPagePermKey,
  type WorkbenchConfig,
  type WorkbenchLayoutItem,
  type WorkbenchPage,
  isWorkbenchWidgetType,
} from './workbench.js';

function cloneConfig(config: WorkbenchConfig): WorkbenchConfig {
  return JSON.parse(JSON.stringify(config)) as WorkbenchConfig;
}

/** 合并 effective：用户 override > 内置默认 */
export function resolveEffectiveWorkbenchConfig(
  userOverride: WorkbenchConfig | null | undefined,
): WorkbenchConfig {
  const raw = userOverride ?? WORKBENCH_BUILTIN_DEFAULT;
  return normalizeWorkbenchConfig(raw);
}

export function normalizeWorkbenchConfig(raw: unknown, ensureHome = true): WorkbenchConfig {
  const base = cloneConfig(WORKBENCH_BUILTIN_DEFAULT);
  if (!raw || typeof raw !== 'object') return ensureHome ? base : { version: 1, activePageId: '', pages: [] };

  const input = raw as Partial<WorkbenchConfig>;
  const pagesRaw = Array.isArray(input.pages) ? input.pages : base.pages;
  const pages: WorkbenchPage[] = pagesRaw
    .map((p, idx) => normalizePage(p, idx))
    .filter((p): p is WorkbenchPage => p != null);

  if (pages.length === 0) {
    return ensureHome ? base : { version: 1, activePageId: '', pages: [] };
  }

  const pinned = pinHomePageFirst(pages, ensureHome);
  if (pinned.length === 0) {
    return { version: 1, activePageId: '', pages: [] };
  }
  const pageIds = new Set(pinned.map(p => p.id));
  const activePageId =
    typeof input.activePageId === 'string' && pageIds.has(input.activePageId)
      ? input.activePageId
      : pinned[0].id;

  return {
    version: 1,
    activePageId,
    pages: pinned,
  };
}

/**
 * 首页固定第一位，标题统一为「首页」。
 * `ensureHome`（默认 true）为缺省时若页面集合不含首页则注入内置首页——
 * 用于个人编辑等「首页必须存在」的场景；按可见性过滤的场景传 false，
 * 以便首页被角色权限隐藏后不被重新注入。
 */
function pinHomePageFirst(pages: WorkbenchPage[], ensureHome = true): WorkbenchPage[] {
  const sorted = [...pages].sort((a, b) => a.sortOrder - b.sortOrder);
  let home = sorted.find(p => isWorkbenchHomePage(p.id));
  const rest = sorted.filter(p => !isWorkbenchHomePage(p.id));

  if (!home) {
    if (!ensureHome) {
      return rest.map((p, idx) => ({ ...p, sortOrder: idx }));
    }
    home = { ...WORKBENCH_BUILTIN_DEFAULT.pages[0], sortOrder: 0, createdByUserId: null };
  } else {
    home = {
      ...home,
      title: '首页',
      sortOrder: 0,
      createdByUserId: null,
      layout: {
        version: 1,
        items: mergeWorkbenchHomePinnedItems(home.layout.items),
      },
    };
  }

  return [home, ...rest.map((p, idx) => ({ ...p, sortOrder: idx + 1 }))];
}

function normalizePage(raw: unknown, fallbackOrder: number): WorkbenchPage | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<WorkbenchPage>;
  const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `page-${fallbackOrder}`;
  const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : `页面 ${fallbackOrder + 1}`;
  const sortOrder = typeof p.sortOrder === 'number' ? p.sortOrder : fallbackOrder;
  const itemsRaw = p.layout && typeof p.layout === 'object' && Array.isArray((p.layout as { items?: unknown }).items)
    ? (p.layout as { items: unknown[] }).items
    : [];

  const items: WorkbenchLayoutItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < itemsRaw.length; i++) {
    const item = normalizeLayoutItem(itemsRaw[i], i);
    if (!item || seen.has(item.i)) continue;
    seen.add(item.i);
    items.push(item);
  }

  const layoutItems = isWorkbenchHomePage(id)
    ? mergeWorkbenchHomePinnedItems(items)
    : items;

  const createdByUserId = isWorkbenchHomePage(id)
    ? null
    : typeof p.createdByUserId === 'string' && p.createdByUserId.trim()
      ? p.createdByUserId.trim()
      : null;

  return {
    id,
    title,
    sortOrder,
    layout: { version: 1, items: layoutItems },
    createdByUserId,
  };
}

function normalizeLayoutItem(raw: unknown, idx: number): WorkbenchLayoutItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const it = raw as Partial<WorkbenchLayoutItem>;
  if (!isWorkbenchWidgetType(it.widgetType)) return null;
  const def = WORKBENCH_WIDGET_CATALOG.find(w => w.type === it.widgetType);
  const minW = def?.minW ?? 2;
  const minH = def?.minH ?? 2;
  const w = clampNum(it.w, minW, 12, def?.defaultW ?? 4);
  const h = clampNum(it.h, minH, 24, def?.defaultH ?? 4);
  return {
    i: typeof it.i === 'string' && it.i.trim() ? it.i.trim() : `w-${idx}`,
    widgetType: it.widgetType,
    x: clampNum(it.x, 0, 11, 0),
    y: clampNum(it.y, 0, 1000, 0),
    w,
    h,
    minW,
    minH,
  };
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

export interface WorkbenchWidgetAccessOpts {
  permissions: string[];
  featurePlugins: Record<string, boolean | undefined>;
  tenantRole?: string;
  /** 当前查看者 userId（用于判断页面级完整授权） */
  userId?: string;
}

/**
 * 剔除用户无权使用的 widget（防篡改）。
 *
 * 页面级完整授权（{@link hasWorkbenchPageFullAccess}）命中的页面：
 * 不再按模块权限剔除 widget（页面查看权限＝该页内容整体授权），
 * 仅当依赖的功能插件被租户关闭时仍会剔除。
 */
export function filterWorkbenchByAccess(
  config: WorkbenchConfig,
  opts: WorkbenchWidgetAccessOpts,
): WorkbenchConfig {
  const next = cloneConfig(config);
  next.pages = next.pages.map(page => {
    const fullAccess = hasWorkbenchPageFullAccess(page, {
      userId: opts.userId ?? '',
      permissions: opts.permissions,
      tenantRole: opts.tenantRole,
    });
    const kept = page.layout.items.filter(item => canUseWidget(item.widgetType, opts, fullAccess));
    return {
      ...page,
      layout: {
        version: 1,
        items: isWorkbenchHomePage(page.id) ? mergeWorkbenchHomePinnedItems(kept) : kept,
      },
    };
  });
  // 不重新注入首页：首页若已被可见性过滤移除，应保持移除
  next.pages = pinHomePageFirst(next.pages, false);
  next.activePageId = resolveActivePageId(next.pages, next.activePageId);
  return next;
}

function pinHomePageOrder(config: WorkbenchConfig, ensureHome = true): WorkbenchConfig {
  return { ...config, pages: pinHomePageFirst(config.pages, ensureHome) };
}

/** 选定可用的 activePageId：原值仍在页面集合则保留，否则回落首页或首个页面 */
function resolveActivePageId(pages: WorkbenchPage[], current: string): string {
  if (pages.some(p => p.id === current)) return current;
  return pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
}

export function canUseWidget(
  widgetType: string,
  opts: {
    permissions: string[];
    featurePlugins: Record<string, boolean | undefined>;
    tenantRole?: string;
  },
  /** 页面级完整授权时跳过模块权限校验（仍保留功能插件开关校验） */
  fullAccess = false,
): boolean {
  if (!isWorkbenchWidgetType(widgetType)) return false;
  const def = WORKBENCH_WIDGET_CATALOG.find(w => w.type === widgetType);
  if (!def) return false;
  if (def.requiredPlugin && opts.featurePlugins[def.requiredPlugin] === false) return false;
  if (fullAccess) return true;
  if (!def.requiredModule) return true;
  if (opts.tenantRole === 'owner' || opts.tenantRole === 'admin') return true;
  const { permissions } = opts;
  if (!permissions || permissions.length === 0) return true;
  if (permissions.includes(def.requiredModule)) return true;
  return permissions.some(p => p.startsWith(`${def.requiredModule}:`));
}

export interface WorkbenchPageAccessOpts {
  /** 当前查看者 userId */
  userId: string;
  /** 当前查看者有效权限（含 `workbench:<pageId>` 授权 key） */
  permissions: string[];
}

/**
 * 判断某页面对当前用户是否可见（严格模式：不给 owner/admin 自动可见）：
 * - 首页：始终可见。
 * - 自定义页面：仅**创建者本人**，或角色被授予 `workbench:<pageId>`（或裸 `workbench` 模块＝全部页面）。
 */
export function canViewWorkbenchPage(page: WorkbenchPage, opts: WorkbenchPageAccessOpts): boolean {
  if (isWorkbenchHomePage(page.id)) {
    // 裸 workbench（＝全部页面）或显式授予首页查看权
    if (opts.permissions.includes(WORKBENCH_PERM_MODULE)) return true;
    if (opts.permissions.includes(workbenchPagePermKey(page.id))) return true;
    // 角色已启用「按页面授权」（持有任意 workbench:<pageId> 键）但未含首页 → 隐藏首页
    if (opts.permissions.some(p => p.startsWith(`${WORKBENCH_PERM_MODULE}:`))) return false;
    // 未涉及工作台页面权限的角色：首页作为默认落地页保持可见
    return true;
  }
  if (page.createdByUserId && page.createdByUserId === opts.userId) return true;
  return (
    opts.permissions.includes(workbenchPagePermKey(page.id))
    || opts.permissions.includes(WORKBENCH_PERM_MODULE)
  );
}

/**
 * 判断某页面对当前用户是否「完整可见」——页面查看权限＝该页内容的整体授权：
 * - owner/admin（提权角色）：恒为 true。
 * - 自定义页面创建者本人：true。
 * - 角色被授予 `workbench:<pageId>`，或裸 `workbench`（＝全部页面，含首页）：true。
 *
 * 命中完整可见时，该页 widget 不再按模块/金额权限过滤，统计内容（含金额）全部展示。
 * 未命中时：首页按查看者自身模块/金额权限过滤；自定义页则根本不可见。
 */
export function hasWorkbenchPageFullAccess(
  page: WorkbenchPage,
  opts: { userId: string; permissions: string[]; tenantRole?: string },
): boolean {
  if (opts.tenantRole === 'owner' || opts.tenantRole === 'admin') return true;
  if (page.createdByUserId && page.createdByUserId === opts.userId) return true;
  return (
    opts.permissions.includes(workbenchPagePermKey(page.id))
    || opts.permissions.includes(WORKBENCH_PERM_MODULE)
  );
}

/**
 * 判断某自定义页面当前用户是否可编辑：仅**创建者本人**（被授权的查看者只读）。
 * 首页为每位用户的个人页，恒可编辑（编辑的是自己的个人副本）。
 */
export function canEditWorkbenchPage(page: WorkbenchPage, opts: WorkbenchPageAccessOpts): boolean {
  if (isWorkbenchHomePage(page.id)) return true;
  return !!page.createdByUserId && page.createdByUserId === opts.userId;
}

/** 仅保留当前用户可见的页面（首页可被角色权限隐藏），用于 GET 返回前过滤 */
export function filterWorkbenchPagesByVisibility(
  config: WorkbenchConfig,
  opts: WorkbenchPageAccessOpts,
): WorkbenchConfig {
  const next = cloneConfig(config);
  next.pages = pinHomePageFirst(next.pages.filter(page => canViewWorkbenchPage(page, opts)), false);
  next.activePageId = resolveActivePageId(next.pages, next.activePageId);
  return next;
}

/**
 * 保存时合并租户级共享的自定义页面（不含首页）。纯函数；不做 widget 权限过滤。
 *
 * `canManage`：当前用户是否有「管理自定义页面」的权限（按业务约定＝企业创建者 owner）。
 *
 * 规则：
 * - 仅 `canManage` 者可创建/编辑/删除自定义页面；非管理者的任何改动都被忽略（库保持不变）。
 * - 提交中已存在于库的页面：管理者以提交版本覆盖（保留原创建者）；非管理者保留库中版本。
 * - 提交中新出现的页面：仅管理者可新增，记为当前用户创建；非管理者忽略。
 * - 库中存在但提交未含的页面：管理者视为删除；非管理者一律保留。
 */
export function mergeSharedWorkbenchPages(
  storedPages: WorkbenchPage[],
  submittedPages: WorkbenchPage[],
  opts: { userId: string; canManage: boolean },
): WorkbenchPage[] {
  const stored = storedPages.filter(p => !isWorkbenchHomePage(p.id));

  // 非管理者：库内容原样保留，忽略其全部改动
  if (!opts.canManage) {
    return stored.map((p, idx) => ({ ...p, sortOrder: idx + 1 }));
  }

  const submitted = submittedPages.filter(p => !isWorkbenchHomePage(p.id));
  const submittedById = new Map(submitted.map(p => [p.id, p]));
  const storedIds = new Set(stored.map(p => p.id));

  const result: WorkbenchPage[] = [];

  for (const sp of stored) {
    const sub = submittedById.get(sp.id);
    if (sub) {
      result.push({ ...sub, createdByUserId: sp.createdByUserId ?? opts.userId });
    }
    // 管理者未提交某库内页面：视为删除，跳过
  }

  for (const sub of submitted) {
    if (storedIds.has(sub.id)) continue;
    result.push({ ...sub, createdByUserId: opts.userId });
  }

  return result.map((p, idx) => ({ ...p, sortOrder: idx + 1 }));
}

export function isValidWorkbenchConfig(raw: unknown): raw is WorkbenchConfig {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as WorkbenchConfig;
  if (c.version !== 1) return false;
  if (!Array.isArray(c.pages) || c.pages.length < 1) return false;
  if (typeof c.activePageId !== 'string') return false;
  if (!c.pages.some(p => p.id === c.activePageId)) return false;
  for (const page of c.pages) {
    if (!page.id || !page.title) return false;
    if (!page.layout || page.layout.version !== 1 || !Array.isArray(page.layout.items)) return false;
    for (const item of page.layout.items) {
      if (!(WORKBENCH_WIDGET_TYPES as string[]).includes(item.widgetType)) return false;
    }
  }
  return true;
}
