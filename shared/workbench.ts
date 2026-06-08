/**
 * 工作台（首页）共享类型、默认配置与功能插件目录。
 */

import {
  getToggleableFeaturePlugins,
} from './featurePluginCatalog';

export type WorkbenchWidgetType =
  | 'shortcuts'
  | 'plugin_center'
  | 'messages'
  | 'production_stats'
  | 'sales_stats'
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

export type FeaturePluginId = 'collaboration' | 'development';

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
  'production_stats',
  'sales_stats',
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
    category: 'efficiency',
    defaultW: 4,
    defaultH: 7,
    minW: 3,
    minH: 5,
    requiredModule: null,
  },
  {
    type: 'production_stats',
    title: '生产统计',
    description: '活跃工单、工序完成率与报工趋势',
    category: 'reports',
    defaultW: 8,
    defaultH: 7,
    minW: 4,
    minH: 5,
    requiredModule: 'production',
  },
  {
    type: 'sales_stats',
    title: '销售统计',
    description: '销售单汇总、库存预警',
    category: 'reports',
    defaultW: 8,
    defaultH: 7,
    minW: 4,
    minH: 5,
    requiredModule: 'psi',
  },
  {
    type: 'finance_stats',
    title: '财务统计',
    description: '收付款汇总与现金流',
    category: 'reports',
    defaultW: 8,
    defaultH: 7,
    minW: 4,
    minH: 5,
    requiredModule: 'finance',
  },
];

export const WORKBENCH_HOME_PAGE_ID = 'page-overview';

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
        items: [
          { i: 'w-shortcuts', widgetType: 'shortcuts', x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
          { i: 'w-messages', widgetType: 'messages', x: 4, y: 0, w: 4, h: 7, minW: 3, minH: 5 },
          { i: 'w-production', widgetType: 'production_stats', x: 8, y: 0, w: 4, h: 7, minW: 4, minH: 5 },
        ],
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

export function isWorkbenchHomePage(pageId: string): boolean {
  return pageId === WORKBENCH_HOME_PAGE_ID;
}

export function isWorkbenchWidgetType(v: unknown): v is WorkbenchWidgetType {
  return typeof v === 'string' && (WORKBENCH_WIDGET_TYPES as string[]).includes(v);
}
