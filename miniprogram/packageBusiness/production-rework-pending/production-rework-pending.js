const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  buildReworkPendingRows,
  filterPendingRows,
  buildPendingMilestoneOptions,
} = require('../utils/reworkPendingLite.js');
const { fetchReworkRecordsForPanel } = require('../utils/reworkRecordsLoad.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchNodesAll,
  listProductProgressAll,
} = require('../utils/orderApi.js');
const { normalizeMasterList } = require('../utils/productionOrders.js');
const { listProductThumbFromProduct } = require('../utils/listProductThumb.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function decodeOpt(value) {
  if (value == null || value === '') return '';
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

function buildDefectActionUrl(row) {
  const q = [
    `scope=${encodeURIComponent(row.scope || 'order')}`,
    `productId=${encodeURIComponent(row.productId || '')}`,
    `nodeId=${encodeURIComponent(row.nodeId || '')}`,
    `pendingQty=${encodeURIComponent(String(row.pendingQty || 0))}`,
    `defectiveTotal=${encodeURIComponent(String(row.defectiveTotal || 0))}`,
    `reworkTotal=${encodeURIComponent(String(row.reworkTotal || 0))}`,
    `scrapTotal=${encodeURIComponent(String(row.scrapTotal || 0))}`,
  ];
  if (row.orderId) q.push(`orderId=${encodeURIComponent(row.orderId)}`);
  if (row.orderNumber) q.push(`orderNumber=${encodeURIComponent(row.orderNumber)}`);
  if (row.productName) q.push(`productName=${encodeURIComponent(row.productName)}`);
  if (row.milestoneName) q.push(`milestoneName=${encodeURIComponent(row.milestoneName)}`);
  return `/packageBusiness/production-rework-defect-action/production-rework-defect-action?${q.join('&')}`;
}

function computeFilterActive(data) {
  if (data.showFilterPanel) return true;
  if (data.milestoneNodeId) return true;
  return false;
}

function milestoneOptionAt(options, index) {
  const list = options || [{ id: '', name: '全部工序' }];
  return list[index] || list[0] || { id: '', name: '全部工序' };
}

function mapPendingRowForUi(row, productionLinkMode, productsById) {
  const product = productsById && row.productId ? productsById.get(row.productId) : null;
  const thumb = listProductThumbFromProduct(product);
  const productLabel = row.showProductSku
    ? `${row.productName} ${row.productSku}`
    : row.productName;
  const subtitleLine = productionLinkMode === 'product'
    ? (row.productOrdersLine || productLabel || '—')
    : `${row.orderNumber || '—'} · ${productLabel || '—'}`;
  return {
    ...row,
    ...thumb,
    subtitleLine,
    milestoneName: row.milestoneName || '—',
    pendingQtyText: row.pendingQtyText || `${row.pendingQty || 0} 件`,
  };
}

Page({
  data: {
    loading: true,
    rows: [],
    searchKeyword: '',
    showFilterPanel: false,
    filterActive: false,
    milestoneOptions: [{ id: '', name: '全部工序' }],
    milestoneNodeId: '',
    milestoneFilterIndex: 0,
    milestoneFilterLabel: '全部工序',
    draftMilestoneFilterIndex: 0,
    draftMilestoneFilterLabel: '全部工序',
    emptyText: '暂无待处理不良',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:rework_defective:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });
    this.bootstrap();
  },

  onShow() {
    if (this._refreshOnNextShow) {
      this._refreshOnNextShow = false;
      this.bootstrap();
      return;
    }
    if (this._loadedOnce && !this._bootstrapping) {
      this.bootstrap();
    }
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onPageScroll() {
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  patchFilterActive(extra) {
    this.setData({
      ...extra,
      filterActive: computeFilterActive({ ...this.data, ...extra }),
    });
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.patchFilterActive({ showFilterPanel: false });
      return;
    }
    this.patchFilterActive({
      showFilterPanel: true,
      draftMilestoneFilterIndex: this.data.milestoneFilterIndex,
      draftMilestoneFilterLabel: this.data.milestoneFilterLabel,
    });
  },

  onDraftMilestoneChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = milestoneOptionAt(this.data.milestoneOptions, idx);
    this.setData({
      draftMilestoneFilterIndex: idx,
      draftMilestoneFilterLabel: opt.name || '全部工序',
    });
  },

  onFilterReset() {
    this.patchFilterActive({
      milestoneNodeId: '',
      milestoneFilterIndex: 0,
      milestoneFilterLabel: '全部工序',
      draftMilestoneFilterIndex: 0,
      draftMilestoneFilterLabel: '全部工序',
      showFilterPanel: false,
      searchKeyword: '',
    });
    this.applyRows();
  },

  onFilterApply() {
    const idx = Number(this.data.draftMilestoneFilterIndex) || 0;
    const opt = milestoneOptionAt(this.data.milestoneOptions, idx);
    this.patchFilterActive({
      milestoneNodeId: opt.id || '',
      milestoneFilterIndex: idx,
      milestoneFilterLabel: opt.name || '全部工序',
      showFilterPanel: false,
    });
    this.applyRows();
  },

  syncMilestoneOptions() {
    const milestoneOptions = buildPendingMilestoneOptions(this._allRows || [], this._nodes || []);
    let milestoneFilterIndex = this.data.milestoneFilterIndex || 0;
    if (milestoneFilterIndex >= milestoneOptions.length) milestoneFilterIndex = 0;
    const milestoneOpt = milestoneOptionAt(milestoneOptions, milestoneFilterIndex);
    this.patchFilterActive({
      milestoneOptions,
      milestoneFilterIndex,
      milestoneNodeId: milestoneOpt.id || '',
      milestoneFilterLabel: milestoneOpt.name || '全部工序',
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    this.applyRows();
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyRows();
  },

  onProductImageError(e) {
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const rows = (this.data.rows || []).map((row) => (
      row.rowKey === key ? { ...row, showProductImage: false } : row
    ));
    this.setData({ rows });
  },

  onRowTap(e) {
    const key = e.currentTarget.dataset.key;
    const row = (this._allRows || []).find((r) => r.rowKey === key);
    if (!row || row.pendingQty <= 0) return;
    wx.navigateTo({
      url: buildDefectActionUrl(row),
    });
  },

  applyRows() {
    const filtered = filterPendingRows(this._allRows || [], {
      searchKeyword: this.data.searchKeyword,
      milestoneNodeId: this.data.milestoneNodeId,
    });
    const rows = filtered.map((r) => mapPendingRowForUi(
      r,
      this._productionLinkMode,
      this._productsById,
    ));
    const hasFilter = !!(this.data.searchKeyword || this.data.milestoneNodeId);
    this.setData({
      rows,
      emptyText: hasFilter ? '无匹配项，请调整筛选' : '暂无待处理不良',
    });
  },

  async bootstrap() {
    this._bootstrapping = true;
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig().catch(() => ({}));
      this._productionLinkMode = config.productionLinkMode || 'order';
      const settings = config.reworkFormSettings || {};
      const onlyIncomplete = settings.onlyShowNotCompletedOrder === true;

      const [orders, productsRaw, nodesRaw, pmpRaw] = await Promise.all([
        fetchAllOrdersPaginated(onlyIncomplete ? { excludeCompleted: 'true' } : {}),
        fetchProductsAll(),
        fetchNodesAll(),
        listProductProgressAll(),
      ]);

      const products = normalizeMasterList(productsRaw);
      this._products = products;
      this._productsById = new Map(products.map((p) => [p.id, p]));
      this._nodes = normalizeMasterList(nodesRaw);
      this._pmp = Array.isArray(pmpRaw) ? pmpRaw : [];
      this._orders = orders || [];

      this._records = await fetchReworkRecordsForPanel({
        productionLinkMode: this._productionLinkMode,
        orders: this._orders,
        products,
      });

      this._allRows = buildReworkPendingRows({
        productionLinkMode: this._productionLinkMode,
        records: this._records,
        orders: this._orders,
        products,
        nodes: this._nodes,
        productMilestoneProgresses: this._pmp,
        onlyShowIncompleteOrders: onlyIncomplete,
      });

      this.syncMilestoneOptions();
      this.setData({ loading: false });
      this.applyRows();
    } catch (err) {
      this.setData({ loading: false });
      if (err && err.statusCode === 401) return;
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      this._bootstrapping = false;
      this._loadedOnce = true;
    }
  },
});
