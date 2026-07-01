const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');

const ICON = (name) => `/assets/icons/${name}.png`;

const SETTINGS_TABS = [
  {
    id: 'categories',
    groupKey: 'archive',
    group: '基础档案',
    label: '产品分类管理',
    sub: '定义产品分类、颜色尺码及扩展属性',
    icon: ICON('tag'),
    permission: 'settings:categories:view',
  },
  {
    id: 'partner_categories',
    groupKey: 'archive',
    group: '基础档案',
    label: '合作单位分类',
    sub: '配置供应商、客户等单位类型的自定义字段',
    icon: ICON('shapes'),
    permission: 'settings:partner_categories:view',
  },
  {
    id: 'nodes',
    groupKey: 'production',
    group: '生产与仓储',
    label: '工序节点库',
    sub: '定义生产工序、报工模板及 BOM 关联',
    icon: ICON('database'),
    permission: 'settings:nodes:view',
  },
  {
    id: 'warehouses',
    groupKey: 'production',
    group: '生产与仓储',
    label: '仓库分类管理',
    sub: '维护实体仓库档案与分类',
    icon: ICON('warehouse'),
    permission: 'settings:warehouses:view',
  },
  {
    id: 'finance_categories',
    groupKey: 'finance',
    group: '财务结算',
    label: '收付款类型设置',
    sub: '配置收款单/付款单分类及关联项、自定义内容',
    icon: ICON('wallet'),
    permission: 'settings:finance_categories:view',
  },
  {
    id: 'production',
    groupKey: 'rules',
    group: '业务规则',
    label: '生产业务配置',
    sub: '生产关联模式、计划/工单/领料/报工等业务规则',
    icon: ICON('link-2'),
    permission: 'settings:config:view',
  },
];

function canViewTab(permissions, tenantRole, tab) {
  if (tenantRole === 'owner') return true;
  if (hasPermission(permissions, 'settings')) return true;
  return hasPermission(permissions, tab.permission);
}

function buildCategories(permissions, tenantRole) {
  const visible = SETTINGS_TABS.filter((tab) => canViewTab(permissions, tenantRole, tab));
  const order = ['archive', 'production', 'finance', 'rules'];
  const categories = [];

  order.forEach((key) => {
    const items = visible.filter((tab) => tab.groupKey === key);
    if (!items.length) return;
    categories.push({
      key,
      title: items[0].group,
      items,
    });
  });

  return categories;
}

Page({
  data: {
    categories: [],
    loading: true,
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }

    const categories = buildCategories(ctx.permissions || [], ctx.tenantRole || '');
    this.setData({ categories, loading: false });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onTabTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/settings-tab/settings-tab?id=${id}`,
      fail: () => {
        wx.showToast({ title: '打开详情失败', icon: 'none' });
      },
    });
  },
});
