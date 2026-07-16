const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  canViewFundsAccount,
  mapAccountFlowCard,
  buildTransferEditParams,
} = require('../utils/financeAccounts.js');
const { buildCategoryMap } = require('../utils/financeRecords.js');
const {
  listFinanceRecordsPaginated,
  fetchFinanceCategoriesAll,
  normalizeMasterList,
} = require('../../utils/financeApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  shouldHubListRefetch,
  trackHubListHidden,
  LIST_ROUTES,
} = require('../../utils/saveNavigation.js');

const FLOW_LIST_ROUTE = LIST_ROUTES.FINANCE_ACCOUNT_FLOW.replace(/^\//, '');
const DEFAULT_PAGE_SIZE = 20;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    cards: [],
    accountName: '',
    searchKeyword: '',
    emptyText: '该账户暂无流水记录',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._accountTypeId = options.accountTypeId ? decodeURIComponent(options.accountTypeId) : '';
    const accountName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      accountName
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
    if (!this._accountTypeId || !canViewFundsAccount(ctx.tenantRole, ctx.permissions || [])) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._canEditTransfer = hasPermission(ctx.permissions || [], 'finance:transfer:edit');
    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, FLOW_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.reloadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.loadPage(this.data.page + 1);
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.reloadList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.reloadList();
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    const card = (this.data.cards || []).find((c) => c.id === id);
    if (!card) return;
    if (card.isTransfer) {
      if (!this._canEditTransfer) return;
      const rec = (this._records || []).find((r) => r.id === id);
      const params = rec ? buildTransferEditParams(rec) : null;
      if (!params) {
        wx.showToast({ title: '转账账户信息缺失，无法编辑', icon: 'none' });
        return;
      }
      wx.navigateTo({
        url:
          '/packageFinance/finance-account-transfer/finance-account-transfer' +
          `?groupId=${encodeURIComponent(params.transferGroupId)}` +
          `&fromAccountId=${encodeURIComponent(params.fromAccountId)}` +
          `&toAccountId=${encodeURIComponent(params.toAccountId)}` +
          `&amount=${encodeURIComponent(String(params.amount))}` +
          `&note=${encodeURIComponent(params.note)}`
      });
      return;
    }
    const detailPage = card.recType === 'RECEIPT' ? 'finance-receipt-detail' : 'finance-payment-detail';
    wx.navigateTo({
      url: `/packageFinance/${detailPage}/${detailPage}?id=${encodeURIComponent(id)}`
    });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    try {
      const categories = await fetchFinanceCategoriesAll();
      this._categoryMap = buildCategoryMap(normalizeMasterList(categories));
      await this.reloadList();
    } catch (err) {
      this.setData({ loading: false, cards: [], emptyText: '加载失败' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async reloadList() {
    this.setData({ loading: true, page: 1 });
    return this.loadPage(1, true);
  },

  async loadPage(page, replace) {
    const search = (this.data.searchKeyword || '').trim();
    if (!replace) this.setData({ loadingMore: true });
    try {
      const result = await listFinanceRecordsPaginated({
        accountTypeId: this._accountTypeId,
        ...(search ? { search } : {}),
        page,
        pageSize: this.data.pageSize
      });
      const records = result.data || [];
      this._records = replace ? records : (this._records || []).concat(records);
      const ctx = { categoryMap: this._categoryMap };
      const nextCards = records.map((rec) => mapAccountFlowCard(rec, ctx));
      const cards = replace ? nextCards : (this.data.cards || []).concat(nextCards);
      const total = typeof result.total === 'number' ? result.total : cards.length;
      this.setData({
        loading: false,
        loadingMore: false,
        cards,
        page,
        total,
        hasMore: cards.length < total,
        emptyText: total ? '' : search ? '无匹配流水，请调整搜索关键词' : '该账户暂无流水记录'
      });
    } catch (err) {
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});
