import {
  WORKBENCH_BUILTIN_DEFAULT,
  WORKBENCH_HOME_PAGE_ID,
  WORKBENCH_WIDGET_CATALOG,
  WORKBENCH_WIDGET_TYPES,
  isWorkbenchHomePage,
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

export function normalizeWorkbenchConfig(raw: unknown): WorkbenchConfig {
  const base = cloneConfig(WORKBENCH_BUILTIN_DEFAULT);
  if (!raw || typeof raw !== 'object') return base;

  const input = raw as Partial<WorkbenchConfig>;
  const pagesRaw = Array.isArray(input.pages) ? input.pages : base.pages;
  const pages: WorkbenchPage[] = pagesRaw
    .map((p, idx) => normalizePage(p, idx))
    .filter((p): p is WorkbenchPage => p != null);

  if (pages.length === 0) return base;

  const pinned = pinHomePageFirst(pages);
  const pageIds = new Set(pinned.map(p => p.id));
  let activePageId =
    typeof input.activePageId === 'string' && pageIds.has(input.activePageId)
      ? input.activePageId
      : pinned[0].id;

  return {
    version: 1,
    activePageId,
    pages: pinned,
  };
}

/** 首页固定第一位，标题统一为「首页」 */
function pinHomePageFirst(pages: WorkbenchPage[]): WorkbenchPage[] {
  const sorted = [...pages].sort((a, b) => a.sortOrder - b.sortOrder);
  let home = sorted.find(p => isWorkbenchHomePage(p.id));
  const rest = sorted.filter(p => !isWorkbenchHomePage(p.id));

  if (!home) {
    home = { ...WORKBENCH_BUILTIN_DEFAULT.pages[0], sortOrder: 0 };
  } else {
    home = { ...home, title: '首页', sortOrder: 0 };
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

  return {
    id,
    title,
    sortOrder,
    layout: { version: 1, items },
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

/** 剔除用户无权使用的 widget（防篡改） */
export function filterWorkbenchByAccess(
  config: WorkbenchConfig,
  opts: {
    permissions: string[];
    featurePlugins: Record<string, boolean | undefined>;
    tenantRole?: string;
  },
): WorkbenchConfig {
  const next = cloneConfig(config);
  next.pages = next.pages.map(page => ({
    ...page,
    layout: {
      version: 1,
      items: page.layout.items.filter(item => canUseWidget(item.widgetType, opts)),
    },
  }));
  if (!next.pages.some(p => p.id === next.activePageId)) {
    next.activePageId = WORKBENCH_HOME_PAGE_ID;
  }
  return pinHomePageOrder(next);
}

function pinHomePageOrder(config: WorkbenchConfig): WorkbenchConfig {
  return { ...config, pages: pinHomePageFirst(config.pages) };
}

export function canUseWidget(
  widgetType: string,
  opts: {
    permissions: string[];
    featurePlugins: Record<string, boolean | undefined>;
    tenantRole?: string;
  },
): boolean {
  if (!isWorkbenchWidgetType(widgetType)) return false;
  const def = WORKBENCH_WIDGET_CATALOG.find(w => w.type === widgetType);
  if (!def) return false;
  if (def.requiredPlugin && opts.featurePlugins[def.requiredPlugin] === false) return false;
  if (!def.requiredModule) return true;
  if (opts.tenantRole === 'owner' || opts.tenantRole === 'admin') return true;
  const { permissions } = opts;
  if (!permissions || permissions.length === 0) return true;
  if (permissions.includes(def.requiredModule)) return true;
  return permissions.some(p => p.startsWith(`${def.requiredModule}:`));
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
