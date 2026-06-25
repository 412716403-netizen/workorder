/**
 * 工作台（首页）共享类型、默认配置与功能插件目录。
 */

import {
  getToggleableFeaturePlugins,
} from './featurePluginCatalog.js';

export type WorkbenchWidgetType =
  | 'shortcuts'
  | 'plugin_center'
  | 'messages'
  | 'order_stats'
  | 'outsource_stats'
  | 'rework_stats'
  | 'sales_stats'
  | 'sales_order_stats'
  | 'finance_stats';

export type WorkbenchWidgetCategory = 'general' | 'efficiency' | 'reports';

export interface WorkbenchLayoutItem {
  i: string;
  widgetType: WorkbenchWidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface WorkbenchPageLayout {
  version: 1;
  items: WorkbenchLayoutItem[];
}

export interface WorkbenchPage {
  id: string;
  title: string;
  sortOrder: number;
  layout: WorkbenchPageLayout;
}

export interface WorkbenchConfig {
  version: 1;
  activePageId: string;
  pages: WorkbenchPage[];
}

export type FeaturePluginId = 'collaboration' | 'development' | 'knowledge_base' | 'traceability' | 'funds_account';

export interface FeaturePluginDefinition {
  id: FeaturePluginId;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export interface FeaturePluginsConfig {
  [key: string]: boolean | undefined;
}

export interface WorkbenchWidgetDefinition {
  type: WorkbenchWidgetType;
  title: string;
  description: string;
  category: WorkbenchWidgetCategory;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  /** 顶级模块权限，如 production；null 表示全员可见 */
  requiredModule: string | null;
  /** 依赖的功能插件 id；未启用则不可添加 */
  requiredPlugin?: FeaturePluginId;
}

export const WORKBENCH_WIDGET_TYPES: WorkbenchWidgetType[] = [
  'shortcuts',
  'plugin_center',
  'messages',
  'order_stats',
  'outsource_stats',
  'rework_stats',
  'sales_stats',
  'sales_order_stats',
  'finance_stats',
];

export const FEATURE_PLUGIN_CATALOG: FeaturePluginDefinition[] = getToggleableFeaturePlugins().map(p => ({
  id: p.id as FeaturePluginId,
  label: p.label,
  description: p.tagline,
  defaultEnabled: p.defaultEnabled,
}));

export const WORKBENCH_WIDGET_CATALOG: WorkbenchWidgetDefinition[] = [
  {
    type: 'shortcuts',
    title: '快捷入口',
    description: '常用功能一键直达，提升工作效率',
    category: 'general',
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 4,
    requiredModule: null,
  },
  {
    type: 'plugin_center',
    title: '插件中心',
    description: '浏览插件市场，查看功能介绍与使用说明',
    category: 'general',
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 4,
    requiredModule: null,
  },
  {
    type: 'messages',
    title: '消息中心',
    description: '协作待办、成员申请与系统通知',
    category: 'general',
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 5,
    requiredModule: null,
  },
  {
    type: 'order_stats',
    title: '工单统计',
    description: '按工序查看计划数、良品数、不良品数与完成进度',
    category: 'reports',
    defaultW: 6,
    defaultH: 7,
    minW: 3,
    minH: 6,
    requiredModule: 'production',
  },
  {
    type: 'outsource_stats',
    title: '外协统计',
    description: '按工序查看外协任务、待收回与收派进度',
    category: 'reports',
    defaultW: 6,
    defaultH: 7,
    minW: 3,
    minH: 6,
    requiredModule: 'production',
  },
  {
    type: 'rework_stats',
    title: '返工统计',
    description: '按工序查看返工任务、待返工与完成进度',
    category: 'reports',
    defaultW: 5,
    defaultH: 7,
    minW: 3,
    minH: 6,
    requiredModule: 'production',
  },
  {
    type: 'sales_stats',
    title: '销售统计',
    description: '销售出库、单数与退货汇总',
    category: 'reports',
    defaultW: 5,
    defaultH: 6,
    minW: 4,
    minH: 4,
    requiredModule: 'psi',
  },
  {
    type: 'sales_order_stats',
    title: '销售订单统计',
    description: '销售订单金额、单数与件数汇总',
    category: 'reports',
    defaultW: 5,
    defaultH: 6,
    minW: 4,
    minH: 4,
    requiredModule: 'psi',
  },
  {
    type: 'finance_stats',
    title: '财务统计',
    description: '收付款汇总与净现金流',
    category: 'reports',
    defaultW: 5,
    defaultH: 6,
    minW: 4,
    minH: 4,
    requiredModule: 'finance',
  },
];

export const WORKBENCH_HOME_PAGE_ID = 'page-overview';

/** 首页固定组件：租户不可移除、拖动或缩放 */
export const WORKBENCH_HOME_PINNED_WIDGET_TYPES = [
  'shortcuts',
  'plugin_center',
  'messages',
] as const satisfies readonly WorkbenchWidgetType[];

export type WorkbenchHomePinnedWidgetType = (typeof WORKBENCH_HOME_PINNED_WIDGET_TYPES)[number];

const HOME_PINNED_WIDGET_SET = new Set<string>(WORKBENCH_HOME_PINNED_WIDGET_TYPES);

export function isHomePinnedWidgetType(widgetType: WorkbenchWidgetType): boolean {
  return HOME_PINNED_WIDGET_SET.has(widgetType);
}

/** 首页顶部固定三卡（快捷入口 / 插件中心 / 消息中心） */
export const WORKBENCH_HOME_PINNED_LAYOUT: WorkbenchLayoutItem[] = [
  { i: 'w-shortcuts', widgetType: 'shortcuts', x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'w-plugin-center', widgetType: 'plugin_center', x: 4, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
  { i: 'w-messages', widgetType: 'messages', x: 8, y: 0, w: 4, h: 6, minW: 3, minH: 5 },
];

/** 首页固定区占据的最底行（不含），其余组件须从此行开始 */
export function getWorkbenchHomePinnedRowBottom(): number {
  return WORKBENCH_HOME_PINNED_LAYOUT.reduce((max, it) => Math.max(max, it.y + it.h), 0);
}

/** 系统内置首页完整布局（含统计组件默认位置） */
export const WORKBENCH_HOME_DEFAULT_LAYOUT: WorkbenchLayoutItem[] = [
  ...WORKBENCH_HOME_PINNED_LAYOUT,
  { i: 'w-order-stats', widgetType: 'order_stats', x: 0, y: 6, w: 6, h: 7, minW: 3, minH: 6 },
  { i: 'w-outsource-stats', widgetType: 'outsource_stats', x: 6, y: 6, w: 6, h: 7, minW: 3, minH: 6 },
  { i: 'w-finance-stats', widgetType: 'finance_stats', x: 0, y: 13, w: 4, h: 6, minW: 4, minH: 4 },
  { i: 'w-sales-stats', widgetType: 'sales_stats', x: 4, y: 13, w: 4, h: 6, minW: 4, minH: 4 },
  { i: 'w-rework-stats', widgetType: 'rework_stats', x: 8, y: 13, w: 4, h: 6, minW: 3, minH: 6 },
];

export function mergeWorkbenchHomePinnedItems(items: WorkbenchLayoutItem[]): WorkbenchLayoutItem[] {
  const zoneBottom = getWorkbenchHomePinnedRowBottom();
  const custom = items
    .filter(it => !isHomePinnedWidgetType(it.widgetType))
    .map(it => (it.y < zoneBottom ? { ...it, y: zoneBottom } : it));
  return [
    ...WORKBENCH_HOME_PINNED_LAYOUT.map(it => ({ ...it })),
    ...custom,
  ];
}

export const WORKBENCH_BUILTIN_DEFAULT: WorkbenchConfig = {
  version: 1,
  activePageId: WORKBENCH_HOME_PAGE_ID,
  pages: [
    {
      id: WORKBENCH_HOME_PAGE_ID,
      title: '首页',
      sortOrder: 0,
      layout: {
        version: 1,
        items: WORKBENCH_HOME_DEFAULT_LAYOUT.map(it => ({ ...it })),
      },
    },
  ],
};

export const DASHBOARD_SETTING_KEYS = {
  featurePlugins: 'featurePlugins',
} as const;

export function defaultFeaturePlugins(): FeaturePluginsConfig {
  const out: FeaturePluginsConfig = {};
  for (const p of FEATURE_PLUGIN_CATALOG) {
    out[p.id] = p.defaultEnabled;
  }
  return out;
}

/** 合并 DB 中的 featurePlugins；存量租户未写入 traceability 键时视为已开启 */
export function parseFeaturePlugins(value: unknown): FeaturePluginsConfig {
  const base = defaultFeaturePlugins();
  if (!value || typeof value !== 'object') return base;
  const stored = value as FeaturePluginsConfig;
  const merged = { ...base, ...stored };
  if (!Object.prototype.hasOwnProperty.call(stored, 'traceability')) {
    merged.traceability = true;
  }
  return merged;
}

export function isWorkbenchHomePage(pageId: string): boolean {
  return pageId === WORKBENCH_HOME_PAGE_ID;
}

export function isWorkbenchWidgetType(v: unknown): v is WorkbenchWidgetType {
  return typeof v === 'string' && (WORKBENCH_WIDGET_TYPES as string[]).includes(v);
}
