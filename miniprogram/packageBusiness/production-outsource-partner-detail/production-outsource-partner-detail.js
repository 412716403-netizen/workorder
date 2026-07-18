const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =



  require('../utils/outsourcePartnerFlowDetail.js'),DOC_TYPE_FILTER_LABELS = _require3.DOC_TYPE_FILTER_LABELS,DOC_TYPE_FILTER_VALUES = _require3.DOC_TYPE_FILTER_VALUES,buildPartnerDetailViewModel = _require3.buildPartnerDetailViewModel;
const _require4 = require('../utils/outsourceRecordsLoad.js'),fetchOutsourceRecordsForPanel = _require4.fetchOutsourceRecordsForPanel;
const _require5 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require5.fetchAllOrdersPaginated;
const _require6 =



  require('../../utils/orderApi.js'),fetchTenantConfig = _require6.fetchTenantConfig,fetchProductsAll = _require6.fetchProductsAll,fetchCategoriesAll = _require6.fetchCategoriesAll;
const _require7 = require('../../utils/planApi.js'),fetchDictionaries = _require7.fetchDictionaries;
const _require8 = require('../../utils/productionPlans.js'),normalizeMasterList = _require8.normalizeMasterList,normalizeAppDictionaries = _require8.normalizeAppDictionaries;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const { markFilterPanelOpen, shouldCloseFilterPanelOnScroll } = require('../../utils/planFilterPanel.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { openTodoEdit } = require('../utils/todosApi.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function computeFilterActive(data) {
  if (data.showFilterPanel) return true;
  if (data.docType) return true;
  if (data.dateFrom) return true;
  if (data.dateTo) return true;
  return false;
}

Page({
  data: {
    loading: true,
    header: null,
    rows: [],
    summaryRows: [],
    variantColumns: [],
    showVariantCols: false,
    showDeliveryDateColumn: false,
    docCount: 0,
    hasAnyRows: false,
    searchKeyword: '',
    showFilterPanel: false,
    filterActive: false,
    docTypeFilterLabels: DOC_TYPE_FILTER_LABELS,
    docTypeFilterIndex: 0,
    docType: '',
    dateFrom: '',
    dateTo: '',
    draftDateFrom: '',
    draftDateTo: '',
    draftDocTypeIndex: 0,
    showTodoBtn: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:outsource_list:allow')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._seed = {
      orderId: options.orderId ? decodeURIComponent(options.orderId) : undefined,
      productId: decodeURIComponent(options.productId || ''),
      nodeId: decodeURIComponent(options.nodeId || ''),
      partner: decodeURIComponent(options.partner || ''),
      nodeName: decodeURIComponent(options.nodeName || ''),
      productName: decodeURIComponent(options.productName || ''),
      orderNumber: decodeURIComponent(options.orderNumber || '')
    };
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });
    loadFeaturePlugins().then((plugins) => {
      this.setData({ showTodoBtn: isPluginEnabled(plugins, 'todo_reminder') });
    });
    this.loadData();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onAddTodoTap() {
    if (!this.data.showTodoBtn || !this._seed) return;
    const seed = this._seed;
    openTodoEdit({
      seed: {
        sourceType: 'outsource',
        sourceId: seed.orderId || seed.productId || null,
        sourceDocNo: '外协管理',
        sourceTitle: `${seed.partner || ''} · ${seed.nodeName || ''} · ${seed.productName || ''}`,
        href: `/production?tab=OUTSOURCE&outsourceFlow=${encodeURIComponent(JSON.stringify(seed))}`,
      },
    });
  },

  onPageScroll() {
    if (!shouldCloseFilterPanelOnScroll(this)) return;
    if (this.data.showFilterPanel) {
      this.setData({ showFilterPanel: false, filterActive: computeFilterActive({ ...this.data, showFilterPanel: false }) });
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this._filterTimer);
    this._filterTimer = setTimeout(() => this.applyView(), 300);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyView();
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.setData({
        showFilterPanel: false,
        filterActive: computeFilterActive({ ...this.data, showFilterPanel: false })
      });
      return;
    }
    markFilterPanelOpen(this);
    this.setData({
      showFilterPanel: true,
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftDocTypeIndex: this.data.docTypeFilterIndex,
      filterActive: true
    });
  },

  onDraftDateFromChange(e) {
    this.setData({ draftDateFrom: e.detail.value || '' });
  },

  onDraftDateToChange(e) {
    this.setData({ draftDateTo: e.detail.value || '' });
  },

  onDraftDocTypeChange(e) {
    this.setData({ draftDocTypeIndex: Number(e.detail.value) || 0 });
  },

  onFilterReset() {
    this.setData({
      draftDateFrom: '',
      draftDateTo: '',
      draftDocTypeIndex: 0
    });
  },

  onFilterApply() {
    const docTypeIdx = this.data.draftDocTypeIndex || 0;
    this.setData({
      dateFrom: this.data.draftDateFrom || '',
      dateTo: this.data.draftDateTo || '',
      docTypeFilterIndex: docTypeIdx,
      docType: DOC_TYPE_FILTER_VALUES[docTypeIdx] || '',
      showFilterPanel: false,
      filterActive: computeFilterActive({
        ...this.data,
        dateFrom: this.data.draftDateFrom || '',
        dateTo: this.data.draftDateTo || '',
        docType: DOC_TYPE_FILTER_VALUES[docTypeIdx] || '',
        showFilterPanel: false
      })
    });
    this.applyView();
  },

  onRowTap(e) {
    const docNo = e.currentTarget.dataset.docNo;
    if (!docNo) return;
    wx.navigateTo({
      url: `/packageBusiness/production-outsource-flow-detail/production-outsource-flow-detail?docNo=${encodeURIComponent(docNo)}`
    });
  },

  applyView() {
    if (!this._context) return;
    const vm = buildPartnerDetailViewModel({
      ...this._context,
      searchKeyword: this.data.searchKeyword,
      docType: this.data.docType,
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo
    });
    this.setData({
      header: vm.header,
      rows: vm.rows,
      summaryRows: vm.summaryRows,
      variantColumns: vm.variantColumns,
      showVariantCols: vm.showVariantCols,
      showDeliveryDateColumn: vm.showDeliveryDateColumn,
      docCount: vm.docCount,
      hasAnyRows: vm.hasAnyRows
    });
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({}))]
        ),config = _await$Promise$all[0],orders = _await$Promise$all[1],productsRaw = _await$Promise$all[2],categoriesRaw = _await$Promise$all[3],dictionariesRaw = _await$Promise$all[4];
      const productionLinkMode = config.productionLinkMode || 'order';
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const productsById = new Map(products.map((p) => [p.id, p]));
      const categoriesById = new Map(categories.map((c) => [c.id, c]));
      const records = await fetchOutsourceRecordsForPanel({
        productionLinkMode,
        orders: orders || [],
        products
      });

      const product = productsById.get(this._seed.productId);
      const category = product ? categoriesById.get(product.categoryId) : undefined;
      const order = this._seed.orderId ?
      (orders || []).find((o) => o.id === this._seed.orderId) :
      undefined;
      const showDeliveryDateColumn = (config.outsourceFormSettings || {}).
      showOutsourceDispatchDeliveryDate === true;

      this._context = {
        seed: this._seed,
        productionLinkMode,
        records: records || [],
        product,
        category,
        order,
        dictionaries: normalizeAppDictionaries(dictionariesRaw),
        showDeliveryDateColumn
      };

      this.setData({ loading: false });
      this.applyView();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
    }
  }
});