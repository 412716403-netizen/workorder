const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/partners.js'),PARTNER_ARCHIVE_ALL = _require3.PARTNER_ARCHIVE_ALL,DEFAULT_PAGE_SIZE = _require3.DEFAULT_PAGE_SIZE;
const _require4 = require('../utils/partners.js'),buildPartnerListRows = _require4.buildPartnerListRows;
const _require5 = require('../utils/partnerApi.js'),fetchPartnersAll = _require5.fetchPartnersAll;
const _require6 = require('../utils/planApi.js'),fetchPartnerCategoriesAll = _require6.fetchPartnerCategoriesAll;
const _require7 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require7.readNavBarMetrics,readWindowMetrics = _require7.readWindowMetrics;
const _require8 = require('../utils/saveNavigation.js'),shouldHubListRefetch = _require8.shouldHubListRefetch,trackHubListHidden = _require8.trackHubListHidden,LIST_ROUTES = _require8.LIST_ROUTES;

const HUB_LIST_ROUTE = LIST_ROUTES.BASIC_PARTNERS.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildSearchHint(filteredTotal, inCategoryCount, searchKeyword, page, totalPages) {
  const q = String(searchKeyword || '').trim();
  if (!q && totalPages <= 1) return '';
  const parts = [];
  if (q) {
    parts.push(`找到 ${filteredTotal} 条`);
    if (filteredTotal < inCategoryCount) parts.push(`（共 ${inCategoryCount} 条）`);
  }
  if (totalPages > 1) parts.push(`第 ${page}/${totalPages} 页`);
  return parts.join(' · ');
}

Page({
  data: {
    loading: true,
    rows: [],
    categoryTabs: [],
    searchKeyword: '',
    activeCategoryId: PARTNER_ARCHIVE_ALL,
    emptyText: '暂无单位',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
    filteredTotal: 0,
    searchHint: '',
    canCreate: false,
    canEdit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });

    const partnerId = options.partnerId ? decodeURIComponent(options.partnerId) : '';
    if (partnerId) {
      wx.redirectTo({
        url: `/packageBusiness/basic-partner-edit/basic-partner-edit?id=${encodeURIComponent(partnerId)}`
      });
      return;
    }

    const categoryId = options.categoryId ? decodeURIComponent(options.categoryId) : '';
    if (categoryId && categoryId !== PARTNER_ARCHIVE_ALL) {
      this.setData({ activeCategoryId: categoryId });
    }

    this._initialized = false;
    this._partners = [];
    this._categories = [];
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
    if (!hasPermission(ctx.permissions || [], 'basic:partners:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.setData({
      canCreate: hasPermission(ctx.permissions || [], 'basic:partners:create'),
      canEdit: hasPermission(ctx.permissions || [], 'basic:partners:edit')
    });

    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, HUB_LIST_ROUTE)) {
      this.bootstrap({ resetView: true });
    }
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onCreateTap() {
    if (!this.data.canCreate) {
      wx.showToast({ title: '暂无新建权限', icon: 'none' });
      return;
    }
    const categoryId = this.data.activeCategoryId;
    const qs = categoryId && categoryId !== PARTNER_ARCHIVE_ALL ?
    `?categoryId=${encodeURIComponent(categoryId)}` :
    '';
    this.openPartnerEdit(`/packageBusiness/basic-partner-edit/basic-partner-edit${qs}`);
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword, page: 1 });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.reloadList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '', page: 1 });
    this.reloadList();
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeCategoryId) return;
    this.setData({ activeCategoryId: id, page: 1 });
    this.reloadList();
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (!this.data.canEdit) {
      wx.showToast({ title: '暂无编辑权限', icon: 'none' });
      return;
    }
    this.openPartnerEdit(
      `/packageBusiness/basic-partner-edit/basic-partner-edit?id=${encodeURIComponent(id)}`
    );
  },

  openPartnerEdit(url) {
    wx.navigateTo({
      url,
      events: {
        hubListChanged: () => {
          this.bootstrap({ resetView: true });
        }
      }
    });
  },

  onPrevPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1 });
    this.reloadList();
  },

  onNextPage() {
    if (this.data.page >= this.data.totalPages) return;
    this.setData({ page: this.data.page + 1 });
    this.reloadList();
  },

  async bootstrap(opts) {
    this._initialized = true;
    const resetView = opts && opts.resetView;
    if (resetView) {
      // setData 异步，先同步 this.data 再 reloadList，避免仍用旧 Tab/搜索条件
      this.data.page = 1;
      this.data.searchKeyword = '';
      this.data.activeCategoryId = PARTNER_ARCHIVE_ALL;
      this.setData({
        page: 1,
        searchKeyword: '',
        activeCategoryId: PARTNER_ARCHIVE_ALL,
        loading: true
      });
    } else {
      this.setData({ loading: true });
    }
    try {
      const _await$Promise$all = await Promise.all([
        fetchPartnersAll(),
        fetchPartnerCategoriesAll()]
        ),partners = _await$Promise$all[0],categories = _await$Promise$all[1];
      this._partners = partners || [];
      this._categories = categories || [];
      this.reloadList();
    } catch (err) {
      this.setData({
        loading: false,
        rows: [],
        emptyText: err && err.message || '加载失败'
      });
    }
  },

  reloadList() {
    const inCategoryCount = this.data.activeCategoryId === PARTNER_ARCHIVE_ALL ?
    (this._partners || []).length :
    (this._partners || []).filter((p) => p.categoryId === this.data.activeCategoryId).length;

    const result = buildPartnerListRows(
      this._partners,
      this._categories,
      this.data.activeCategoryId,
      this.data.searchKeyword,
      this.data.page,
      this.data.pageSize
    );

    const hasSearch = String(this.data.searchKeyword || '').trim();
    const emptyText = inCategoryCount === 0 ?
    '该分类下暂无单位数据' :
    hasSearch ? '未找到匹配的单位' : '该分类下暂无单位数据';

    this.setData({
      loading: false,
      rows: result.rows,
      categoryTabs: result.categoryTabs,
      page: result.page,
      totalPages: result.totalPages,
      filteredTotal: result.filteredTotal,
      searchHint: buildSearchHint(
        result.filteredTotal,
        inCategoryCount,
        this.data.searchKeyword,
        result.page,
        result.totalPages
      ),
      emptyText
    });
  }
});