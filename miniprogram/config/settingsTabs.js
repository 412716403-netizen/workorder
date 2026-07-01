/**
 * 系统设置分类（对齐 Web SettingsView.tsx 六个 Tab）
 */

const { hasPermission } = require('../utils/permissions.js');

const ICON = (name) => `/assets/icons/${name}.png`;

/** @type {Array<{ id: string; group: string; groupKey: string; label: string; title: string; sub: string; icon: string; permission: string; listPath?: string; type?: 'config' }>} */
const SETTINGS_TABS = [
  {
    id: 'categories',
    group: '基础档案',
    groupKey: 'archive',
    label: '产品分类管理',
    title: '产品分类管理',
    sub: '定义产品分类、颜色尺码及扩展属性',
    icon: ICON('tag'),
    permission: 'settings:categories:view',
    listPath: '/settings/categories?all=true',
  },
  {
    id: 'partner_categories',
    group: '基础档案',
    groupKey: 'archive',
    label: '合作单位分类',
    title: '合作单位分类',
    sub: '配置供应商、客户等单位类型的自定义字段',
    icon: ICON('shapes'),
    permission: 'settings:partner_categories:view',
    listPath: '/settings/partner-categories?all=true',
  },
  {
    id: 'nodes',
    group: '生产与仓储',
    groupKey: 'production',
    label: '工序节点库',
    title: '工序节点库',
    sub: '定义生产工序、报工模板及 BOM 关联',
    icon: ICON('database'),
    permission: 'settings:nodes:view',
    listPath: '/settings/nodes?all=true',
  },
  {
    id: 'warehouses',
    group: '生产与仓储',
    groupKey: 'production',
    label: '仓库分类管理',
    title: '仓库分类管理',
    sub: '维护实体仓库档案与分类',
    icon: ICON('warehouse'),
    permission: 'settings:warehouses:view',
    listPath: '/settings/warehouses?all=true',
  },
  {
    id: 'finance_categories',
    group: '财务结算',
    groupKey: 'finance',
    label: '收付款类型设置',
    title: '收付款类型设置',
    sub: '配置收款单/付款单分类及关联项、自定义内容',
    icon: ICON('wallet'),
    permission: 'settings:finance_categories:view',
    listPath: '/settings/finance-categories?all=true',
  },
  {
    id: 'production',
    group: '业务规则',
    groupKey: 'rules',
    label: '生产业务配置',
    title: '生产业务配置',
    sub: '生产关联模式、计划/工单/领料/报工等业务规则',
    icon: ICON('link-2'),
    permission: 'settings:config:view',
    type: 'config',
  },
];

const SETTINGS_TAB_BY_ID = SETTINGS_TABS.reduce((acc, tab) => {
  acc[tab.id] = tab;
  return acc;
}, {});

const MATERIAL_COST_MODE_LABEL = {
  consumable: '按报工耗材与结余损耗',
  document_linked: '按关联采购入库与关联收付款',
};

function canViewTab(permissions, tenantRole, tab) {
  if (tenantRole === 'owner') return true;
  return hasPermission(permissions, tab.permission);
}

/**
 * 按权限过滤并分组（对齐 Web 六个 Tab，移动端按业务域分组展示）
 * @param {string[]} permissions
 * @param {string} [tenantRole]
 */
function buildSettingsCategories(permissions, tenantRole) {
  const visible = SETTINGS_TABS.filter((tab) => canViewTab(permissions, tenantRole, tab));
  const categories = [];
  const seen = new Set();

  for (const tab of visible) {
    if (seen.has(tab.groupKey)) continue;
    seen.add(tab.groupKey);
    const items = visible.filter((t) => t.groupKey === tab.groupKey);
    categories.push({
      key: tab.groupKey,
      title: tab.group,
      items,
    });
  }

  return categories;
}

function getSettingsTab(id) {
  return SETTINGS_TAB_BY_ID[id] || null;
}

function formatBoolLabel(value) {
  return value ? '已开启' : '已关闭';
}

/**
 * 将 /settings/config 转为移动端只读展示块
 * @param {Record<string, unknown>} config
 */
function buildProductionConfigSections(config) {
  const economics = config.productEconomicsSettings || {};
  const mode = economics.materialCostMode || 'consumable';

  return [
    {
      title: '数量上限',
      rows: [
        {
          label: '允许报工数量超过最大可报数量',
          value: formatBoolLabel(!!config.allowExceedMaxReportQty),
        },
        {
          label: '允许外协收货数量超过最大可收货数量',
          value: formatBoolLabel(!!config.allowExceedMaxOutsourceReceiveQty),
        },
        {
          label: '允许生产入库数量超过最大可入库数量',
          value: formatBoolLabel(!!config.allowExceedMaxStockInQty),
        },
      ],
    },
    {
      title: '扫码称重',
      rows: [
        {
          label: '扫码称重容差',
          value: `${config.weightTolerancePercent ?? 5}%`,
        },
      ],
    },
    {
      title: '产品经营 · 物料成本口径',
      rows: [
        {
          label: '当前口径',
          value: MATERIAL_COST_MODE_LABEL[mode] || mode,
        },
      ],
    },
  ];
}

module.exports = {
  SETTINGS_TABS,
  buildSettingsCategories,
  getSettingsTab,
  buildProductionConfigSections,
};
