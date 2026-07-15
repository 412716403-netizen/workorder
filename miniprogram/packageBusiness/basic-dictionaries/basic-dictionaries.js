const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { DICT_KIND_ALL, DEFAULT_PAGE_SIZE } = require('../config/dictionaries.js');
const { buildDictionaryListRows, flattenDictionaryRows } = require('../utils/dictionaries.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { shouldHubListRefetch, trackHubListHidden, LIST_ROUTES } = require('../../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.BASIC_DICTIONARIES.replace(/^\//, '');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildSearchHint(filteredTotal, inKindCount, searchKeyword, page, totalPages) {
  const q = String(searchKeyword || '').trim();
  if (!q && totalPages <= 1) return '';
  const parts = [];
  if (q) {
    parts.push(`找到 ${filteredTotal} 条`);
    if (filteredTotal < inKindCount) parts.push(`（共 ${inKindCount} 条）`);
  }
  if (totalPages > 1) parts.push(`第 ${page}/${totalPages} 页`);
  return parts.join(' · ');
}

Page({
  data: {
    loading: true,
    rows: [],
    kindTabs: [],
    searchKeyword: '',
    activeKind: DICT_KIND_ALL,
    emptyText: '暂无字典项',
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
    filteredTotal: 0,
    searchHint: '',
    canCreate: false,
    canEdit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    const dictId = options.id ? decodeURIComponent(options.id) : '';
    if (dictId) {
      wx.redirectTo({
        url: `/packageBusiness/basic-dictionary-edit/basic-dictionary-edit?id=${encodeURIComponent(dictId)}`,
      });
      return;
    }

    const kind = options.kind ? decodeURIComponent(options.kind) : '';
    if (kind && kind !== DICT_KIND_ALL) {
      this.setData({ activeKind: kind });
    }

    this._initialized = false;
    this._dictionaries = { colors: [], sizes: [], units: [] };
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
    if (!hasPermission(ctx.permissions || [], 'basic:dictionaries:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.setData({
      canCreate: hasPermission(ctx.permissions || [], 'basic:dictionaries:create'),
      canEdit: hasPermission(ctx.permissions || [], 'basic:dictionaries:edit'),
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
    const kind = this.data.activeKind;
    const qs = kind && kind !== DICT_KIND_ALL
      ? `?kind=${encodeURIComponent(kind)}`
      : '';
    this.openDictionaryEdit(`/packageBusiness/basic-dictionary-edit/basic-dictionary-edit${qs}`);
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

  onKindTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeKind) return;
    this.setData({ activeKind: id, page: 1 });
    this.reloadList();
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (!this.data.canEdit) {
      wx.showToast({ title: '暂无编辑权限', icon: 'none' });
      return;
    }
    this.openDictionaryEdit(
      `/packageBusiness/basic-dictionary-edit/basic-dictionary-edit?id=${encodeURIComponent(id)}`,
    );
  },

  openDictionaryEdit(url) {
    wx.navigateTo({
      url,
      events: {
        hubListChanged: () => {
          this.bootstrap({ resetView: true });
        },
      },
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
      this.data.page = 1;
      this.data.searchKeyword = '';
      this.data.activeKind = DICT_KIND_ALL;
      this.setData({
        page: 1,
        searchKeyword: '',
        activeKind: DICT_KIND_ALL,
        loading: true,
      });
    } else {
      this.setData({ loading: true });
    }
    try {
      const raw = await fetchDictionaries();
      this._dictionaries = normalizeAppDictionaries(raw);
      this.reloadList();
    } catch (err) {
      this.setData({
        loading: false,
        rows: [],
        emptyText: (err && err.message) || '加载失败',
      });
    }
  },

  reloadList() {
    const allRows = flattenDictionaryRows(this._dictionaries);
    const inKindCount = this.data.activeKind === DICT_KIND_ALL
      ? allRows.length
      : allRows.filter((r) => r.kind === this.data.activeKind).length;

    const result = buildDictionaryListRows(
      this._dictionaries,
      this.data.activeKind,
      this.data.searchKeyword,
      this.data.page,
      this.data.pageSize,
    );

    const hasSearch = String(this.data.searchKeyword || '').trim();
    const emptyText = inKindCount === 0
      ? '当前筛选下暂无数据'
      : (hasSearch ? '未找到匹配的字典项' : '当前筛选下暂无数据');

    this.setData({
      loading: false,
      rows: result.rows,
      kindTabs: result.kindTabs,
      page: result.page,
      totalPages: result.totalPages,
      filteredTotal: result.filteredTotal,
      searchHint: buildSearchHint(
        result.filteredTotal,
        inKindCount,
        this.data.searchKeyword,
        result.page,
        result.totalPages,
      ),
      emptyText,
    });
  },
});
