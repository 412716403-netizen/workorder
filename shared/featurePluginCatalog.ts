/**
 * 插件市场展示目录（功能介绍、使用说明、分类标签）。
 * 带 toggleable 的项与 system_settings.featurePlugins 联动；其余为说明型插件。
 */

import type { FeaturePluginId } from './workbench.js';

export type FeaturePluginCategoryId = 'reporting' | 'tools' | 'management';

export type FeaturePluginIconKey = 'Inbox' | 'FlaskConical' | 'BookOpen' | 'ScanLine' | 'Wallet';

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
    defaultEnabled: false,
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
    defaultEnabled: false,
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
        '左侧 + 菜单快速插入内容块，贴近飞书文档体验',
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
  {
    id: 'funds_account',
    label: '资金账户',
    tagline: '账户余额、流水台账与账户间转账，收付款按账户精确归集',
    category: 'management',
    tags: ['资金账户', '余额台账'],
    icon: 'Wallet',
    launchedAt: '2026-06-25',
    defaultEnabled: false,
    toggleable: true,
    introduction: {
      summary:
        '资金账户插件面向需要按账户（现金/银行/微信等）精确管理资金的场景：在「财务」内提供资金账户页，实时聚合各账户期初、流入、流出与当前余额，支持账户流水下钻与账户间转账；开启后收款单/付款单登记时需选择收支账户，使每笔款项精确归集到账户。',
      highlights: [
        '资金账户页：按账户实时聚合余额，支持今日/本周/本月/全部期间筛选',
        '账户流水下钻与查看单据详情，账户间转账（内部调拨）一键完成',
        '收款单/付款单登记时强制选择收支账户，款项精确归账',
        '账户类型（含期初余额/期初日期）在资金账户页内维护',
      ],
      scenarios: [
        '需要分账户掌握现金、银行、在线钱包余额的企业',
        '资金在多个账户间频繁划拨、需留痕的财务管理',
        '暂不需要账户级资金管理的小厂可关闭插件，收付款不再要求选账户',
      ],
    },
    usageGuide: [
      {
        title: '开通与权限',
        body: '租户管理员在插件中心开启「资金账户」。开启后「财务」出现「资金账户」页；账户余额查看与转账分别受 finance:account:view、finance:transfer:create 权限控制，账户类型维护沿用 settings:finance_account_types:* 权限。',
        bullets: ['管理员：插件中心开启', '关闭插件后：资金账户页隐藏，收付款不再要求选择收支账户'],
      },
      {
        title: '维护账户与期初',
        body: '在「财务 - 资金账户 - 账户类型」中新增账户，录入期初余额与期初日期；当前余额 = 期初 + 累计收 − 累计付，实时聚合不落库。',
      },
      {
        title: '登记与转账',
        body: '收款单/付款单登记时选择收支账户，款项归集到对应账户；账户间划拨用「账户转账」生成一进一出两条流水，天然计入各自余额。',
      },
    ],
  },
  {
    id: 'traceability',
    label: '追溯码',
    tagline: '单品码/批次码生成、扫码追溯、报工扫码累加与称重校验',
    category: 'reporting',
    tags: ['单品码', '批次码', '扫码称重'],
    icon: 'ScanLine',
    launchedAt: '2026-06-11',
    defaultEnabled: false,
    toggleable: true,
    introduction: {
      summary:
        '追溯码插件面向需要单品/批次级追溯的制造场景：在计划单生成码、扫码查询生产链路，并在报工、外协收货、返工、待入库等环节通过扫码累加数量；开启后可配合电子秤做理论重量比对与交货总重录入。',
      highlights: [
        '计划单内生成单品码与虚拟批次码，支持标签打印',
        '侧栏与快捷入口进入扫码追溯页，查看单件生产链路',
        '报工/外协/返工/待入库支持扫码枪批量累加数量',
        '工序开启记重时可录入交货总重、维护单件标准重量与容差校验',
      ],
      scenarios: [
        '服装针织需按件追溯横机、缝盘等工序进度',
        '外协收回需扫码确认规格数量并可选称重',
        '暂不需要追溯的小厂可关闭插件，仅用手工数量录入',
      ],
    },
    usageGuide: [
      {
        title: '开通与权限',
        body: '租户管理员在插件中心开启「追溯码」。成员需具备生产计划 view 权限方可使用追溯查询与计划内码生成；报工/外协等模块仍按原有 RBAC 控制。',
        bullets: ['管理员：插件中心开启', '关闭插件后：追溯页、扫码累加、称重相关 UI 均不可用'],
      },
      {
        title: '生成与打印追溯码',
        body: '在生产计划详情中维护追溯码区块，按规格生成单品码或虚拟批次码，并使用标签模板打印。',
      },
      {
        title: '扫码报工与称重',
        body: '报工或外协收货时点击扫码累加，扫入码后确认应用；若工序开启「报工时记录重量」，可维护单件标准重量并在扫码会话中比对秤读数。',
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
