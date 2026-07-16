const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  PERIODS,
  periodRange,
  canViewFundsAccount,
  hasAccountTypePerm,
  mapBalancesResult,
} = require('../utils/financeAccounts.js');
const {
  getAccountBalances,
  fetchFeaturePlugins,
  isFundsAccountEnabled,
} = require('../../utils/financeApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  shouldHubListRefetch,
  trackHubListHidden,
  LIST_ROUTES,
} = require('../../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.FINANCE_ACCOUNTS.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    periods: PERIODS,
    activePeriod: 'all',
    totalsView: [],
    rows: [],
    unassignedRow: null,
    canTransfer: false,
    canManageTypes: false,
    emptyText: '暂无收支账户，请先添加账户类型',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });
    this._initialized = false;
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
    const permissions = ctx.permissions || [];
    if (!canViewFundsAccount(ctx.tenantRole, permissions)) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      canTransfer: hasPermission(permissions, 'finance:transfer:create'),
      canManageTypes: hasAccountTypePerm(ctx.tenantRole, ctx.permissions, 'view')
    });
    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, HUB_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.reloadBalances().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onPeriodTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activePeriod) return;
    this.setData({ activePeriod: key });
    this.reloadBalances();
  },

  onTransferTap() {
    if (!this.data.canTransfer) {
      wx.showToast({ title: '暂无转账权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/packageFinance/finance-account-transfer/finance-account-transfer' });
  },

  onAccountTypesTap() {
    if (!this.data.canManageTypes) {
      wx.showToast({ title: '暂无账户管理权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/packageFinance/finance-account-types/finance-account-types' });
  },

  onAccountTap(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '';
    if (!id) return;
    wx.navigateTo({
      url: `/packageFinance/finance-account-flow/finance-account-flow?accountTypeId=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`
    });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const plugins = await fetchFeaturePlugins();
      if (!isFundsAccountEnabled(plugins)) {
        wx.showToast({ title: '资金账户插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      await this.reloadBalances();
    } catch (err) {
      this.setData({ loading: false, rows: [], totalsView: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async reloadBalances() {
    this.setData({ loading: true });
    try {
      const data = await getAccountBalances(periodRange(this.data.activePeriod));
      const view = mapBalancesResult(data, this.data.activePeriod);
      this.setData({
        loading: false,
        totalsView: view.totalsView,
        rows: view.rows,
        unassignedRow: view.unassignedRow,
        emptyText: '暂无收支账户，请先添加账户类型'
      });
    } catch (err) {
      this.setData({ loading: false, rows: [], unassignedRow: null, totalsView: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});
