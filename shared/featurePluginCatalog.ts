/**
 * 插件市场展示目录（功能介绍、使用说明、分类标签）。
 * 带 toggleable 的项与 system_settings.featurePlugins 联动；其余为说明型插件。
 */

import type { FeaturePluginId } from './workbench';

export type FeaturePluginCategoryId = 'reporting' | 'tools' | 'management';

export type FeaturePluginIconKey = 'Inbox' | 'FlaskConical' | 'BookOpen';

export interface FeaturePluginGuideSection {
  title: string;
  body: string;
  bullets?: string[];
}

export interface FeaturePluginMarketItem {
  /** toggleable 项 id 须为 FeaturePluginId */
  id: FeaturePluginId | string;
  label: string;
  tagline: string;
  category: FeaturePluginCategoryId;
  tags: string[];
  icon: FeaturePluginIconKey;
  /** 上线日期（YYYY-MM-DD），用于「最新上线」排序 */
  launchedAt: string;
  defaultEnabled: boolean;
  /** 是否写入 featurePlugins 开关 */
  toggleable: boolean;
  /** 说明型插件：启用状态跟随此开关 */
  linkedPluginId?: FeaturePluginId;
  introduction: {
    summary: string;
    highlights: string[];
    scenarios: string[];
  };
  usageGuide: FeaturePluginGuideSection[];
}

export const FEATURE_PLUGIN_CATEGORY_TABS: { id: FeaturePluginCategoryId | 'all'; label: string }[] = [
  { id: 'all', label: '全部插件' },
  { id: 'reporting', label: '报工类' },
  { id: 'tools', label: '工具类' },
  { id: 'management', label: '管理类' },
];

export const FEATURE_PLUGIN_MARKET_CATALOG: FeaturePluginMarketItem[] = [
  {
    id: 'collaboration',
    label: '协作管理',
    tagline: '企业间外协派发、回传与协作收件箱，跨厂协同更高效',
    category: 'management',
    tags: ['外协协作', '多租户'],
    icon: 'Inbox',
    launchedAt: '2024-10-01',
    defaultEnabled: true,
    toggleable: true,
    introduction: {
      summary:
        '协作管理面向「甲乙方」式外协场景：甲方可派发计划/工单给协作企业，乙方在协作收件箱接单、回传进度与报工，双方数据在同一业务链上可追溯。',
      highlights: [
        '协作收件箱集中处理待接单、待回传、待确认事项',
        '支持跨租户派发与回传，减少微信/Excel 对账',
        '与生产工单、工序报工联动，状态实时同步',
      ],
      scenarios: [
        '服装厂将部分工序外发给加工厂，需在线派单与回传',
        '多工厂集团内部分子公司协作生产',
        '外协厂仅使用协作模块，不接触甲方全部 ERP 数据',
      ],
    },
    usageGuide: [
      {
        title: '开通与权限',
        body: '租户管理员可在插件中心开启「协作管理」。成员需具备协作模块相应 view/create 权限方可访问侧栏与收件箱。',
        bullets: ['管理员：插件中心开启 → 系统设置分配协作权限', '普通成员：侧栏进入「协作管理」查看待办'],
      },
      {
        title: '派发协作任务',
        body: '在生产管理或协作模块中创建外协派发，选择协作企业与工序范围。派发后对方将在协作收件箱收到待办。',
      },
      {
        title: '回传与确认',
        body: '协作方在收件箱接单并完成报工/回传；发起方可审核回传数据，确认后写入本方生产进度。',
      },
    ],
  },
  {
    id: 'development',
    label: '开发管理',
    tagline: '款式开发、试制 BOM 与打样流程，衔接正式生产',
    category: 'management',
    tags: ['款式开发', 'BOM 试制'],
    icon: 'FlaskConical',
    launchedAt: '2025-11-01',
    defaultEnabled: true,
    toggleable: true,
    introduction: {
      summary:
        '开发管理模块服务款式/产品从概念到试制阶段：维护开发 BOM、打样进度，试制确认后可转入正式产品与生产计划。',
      highlights: [
        '开发款式与试制 BOM 独立管理',
        '打样节点进度跟踪',
        '与正式产品档案、BOM 衔接',
      ],
      scenarios: [
        '服装企业季节新款开发与打样',
        '需要先试制再量产的离散制造',
      ],
    },
    usageGuide: [
      {
        title: '开启模块',
        body: '插件中心开启「开发管理」后，侧栏出现开发管理入口；需分配 development 模块权限。',
      },
      {
        title: '维护开发款式',
        body: '在开发管理中新建款式，维护试制 BOM 与物料清单，记录打样版本。',
      },
      {
        title: '转入量产',
        body: '试制确认后，可将开发数据沉淀到正式产品档案，再创建生产计划与工单。',
      },
    ],
  },
  {
    id: 'knowledge_base',
    label: '资料库',
    tagline: '企业知识沉淀：文件夹管理与飞书风格文档编辑',
    category: 'tools',
    tags: ['知识库', '文档协作'],
    icon: 'BookOpen',
    launchedAt: '2026-06-10',
    defaultEnabled: false,
    toggleable: true,
    introduction: {
      summary:
        '资料库面向租户内知识沉淀：左侧文件夹/文档树管理，右侧飞书风格块级富文本编辑，支持标题、列表、待办、表格、代码块与图片。',
      highlights: [
        '租户内共享文件夹与文档，权限可按文件夹/文档细粒度控制',
        '斜杠命令快速插入内容块，贴近飞书文档体验',
        '图片独立上传存储，文档正文仅引用 URL',
      ],
      scenarios: [
        '沉淀生产工艺、SOP、培训资料',
        '跨部门共享项目文档与会议纪要',
        '替代散落 Excel/Word 的企业内部知识库',
      ],
    },
    usageGuide: [
      {
        title: '开通与权限',
        body: '租户管理员在插件中心开启「资料库」后，侧栏出现资料库入口（位于基础信息上方）。成员需具备 knowledge_base 模块权限。',
        bullets: ['管理员：插件中心开启 → 成员管理分配资料库权限', '编辑文档需 documents:edit 权限'],
      },
      {
        title: '管理文件夹与文档',
        body: '左侧树形面板可新建文件夹、在文件夹下创建文档；支持重命名与删除（空文件夹方可删除）。',
      },
      {
        title: '编辑文档',
        body: '右侧编辑器输入「/」唤起块级菜单，可插入标题、列表、待办、表格、代码块、分割线、高亮块与图片。',
      },
    ],
  },
];

/** 参与 featurePlugins 持久化的插件项 */
export function getToggleableFeaturePlugins(): Pick<
  FeaturePluginMarketItem,
  'id' | 'label' | 'tagline' | 'defaultEnabled'
>[] {
  return FEATURE_PLUGIN_MARKET_CATALOG.filter(p => p.toggleable).map(p => ({
    id: p.id,
    label: p.label,
    tagline: p.tagline,
    defaultEnabled: p.defaultEnabled,
  }));
}

export function getFeaturePluginMarketItem(id: string): FeaturePluginMarketItem | undefined {
  return FEATURE_PLUGIN_MARKET_CATALOG.find(p => p.id === id);
}

/** 按上线日期倒序，取最新 N 个插件 */
export function getLatestFeaturePlugins(limit = 3): FeaturePluginMarketItem[] {
  return [...FEATURE_PLUGIN_MARKET_CATALOG]
    .sort((a, b) => b.launchedAt.localeCompare(a.launchedAt))
    .slice(0, limit);
}

export function isFeaturePluginActivated(
  item: FeaturePluginMarketItem,
  plugins: Record<string, boolean | undefined>,
): boolean {
  if (item.toggleable) {
    return plugins[item.id] !== false;
  }
  if (item.linkedPluginId) {
    return plugins[item.linkedPluginId] !== false;
  }
  return true;
}
