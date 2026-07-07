const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  DOC_TYPE_FILTER_LABELS,
  DOC_TYPE_FILTER_VALUES,
  buildPartnerDetailViewModel,
} = require('../utils/outsourcePartnerFlowDetail.js');
const { fetchOutsourceRecordsForPanel } = require('../utils/outsourceRecordsLoad.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
} = require('../utils/orderApi.js');
const { fetchDictionaries } = require('../utils/planApi.js');
const { normalizeMasterList, normalizeAppDictionaries } = require('../utils/productionPlans.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
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
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:outsource_list:allow')) {
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
      orderNumber: decodeURIComponent(options.orderNumber || ''),
    };
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });
    this.loadData();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onPageScroll() {
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
        filterActive: computeFilterActive({ ...this.data, showFilterPanel: false }),
      });
      return;
    }
    this.setData({
      showFilterPanel: true,
      draftDateFrom: this.data.dateFrom,
      draftDateTo: this.data.dateTo,
      draftDocTypeIndex: this.data.docTypeFilterIndex,
      filterActive: true,
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
      draftDocTypeIndex: 0,
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
        showFilterPanel: false,
      }),
    });
    this.applyView();
  },

  onRowTap(e) {
    const docNo = e.currentTarget.dataset.docNo;
    if (!docNo) return;
    wx.navigateTo({
      url: `/packageBusiness/production-outsource-flow-detail/production-outsource-flow-detail?docNo=${encodeURIComponent(docNo)}`,
    });
  },

  applyView() {
    if (!this._context) return;
    const vm = buildPartnerDetailViewModel({
      ...this._context,
      searchKeyword: this.data.searchKeyword,
      docType: this.data.docType,
      dateFrom: this.data.dateFrom,
      dateTo: this.data.dateTo,
    });
    this.setData({
      header: vm.header,
      rows: vm.rows,
      summaryRows: vm.summaryRows,
      variantColumns: vm.variantColumns,
      showVariantCols: vm.showVariantCols,
      showDeliveryDateColumn: vm.showDeliveryDateColumn,
      docCount: vm.docCount,
      hasAnyRows: vm.hasAnyRows,
    });
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [config, orders, productsRaw, categoriesRaw, dictionariesRaw] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
      ]);
      const productionLinkMode = config.productionLinkMode || 'order';
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const productsById = new Map(products.map((p) => [p.id, p]));
      const categoriesById = new Map(categories.map((c) => [c.id, c]));
      const records = await fetchOutsourceRecordsForPanel({
        productionLinkMode,
        orders: orders || [],
        products,
      });

      const product = productsById.get(this._seed.productId);
      const category = product ? categoriesById.get(product.categoryId) : undefined;
      const order = this._seed.orderId
        ? (orders || []).find((o) => o.id === this._seed.orderId)
        : undefined;
      const showDeliveryDateColumn = (config.outsourceFormSettings || {})
        .showOutsourceDispatchDeliveryDate === true;

      this._context = {
        seed: this._seed,
        productionLinkMode,
        records: records || [],
        product,
        category,
        order,
        dictionaries: normalizeAppDictionaries(dictionariesRaw),
        showDeliveryDateColumn,
      };

      this.setData({ loading: false });
      this.applyView();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },
});
