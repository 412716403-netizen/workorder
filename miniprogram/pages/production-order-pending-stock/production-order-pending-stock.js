const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  getOrder,
  fetchProductionRecords,
  createProductionRecord,
  fetchWarehousesAll,
  fetchTenantConfig,
} = require('../../utils/orderApi.js');
const { computeOrderPendingStockRow } = require('../../utils/pendingStockComputeLite.js');
const { loadPendingStockRows } = require('../../utils/pendingStockBadge.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function mapListRow(row, productionLinkMode) {
  const isProductMode = productionLinkMode === 'product';
  return {
    rowKey: row.rowKey,
    orderId: row.orderId,
    titleLine: isProductMode ? (row.productName || row.orderNumber) : (row.orderNumber || ''),
    subtitleLine: isProductMode ? `涉及 ${row.productBlockOrderTotal || row.orderTotal} 件工单总量` : (row.productName || ''),
    orderTotal: row.orderTotal,
    alreadyIn: row.alreadyIn,
    pendingTotal: row.pendingTotal,
  };
}

Page({
  data: {
    loading: true,
    isListMode: false,
    pageTitle: '待入库',
    rows: [],
    row: null,
    stockInQty: '1',
    canCreate: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    this._isListMode = !this._orderId;

    const ctx = readTenantCtx();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      isListMode: this._isListMode,
      pageTitle: this._isListMode ? '待入库清单' : '待入库',
      canCreate: hasPermission((ctx && ctx.permissions) || [], 'production:orders_pending_stock_in:create'),
    });

    if (this._isListMode) {
      this.loadList();
    } else {
      this.loadSingle();
    }
  },

  onShow() {
    if (this._isListMode && !this.data.loading) {
      this.loadList();
    } else if (!this._isListMode && this._orderId && !this.data.loading) {
      this.loadSingle();
    }
  },

  onPullDownRefresh() {
    const task = this._isListMode ? this.loadList() : this.loadSingle();
    task.finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onListRowTap(e) {
    const { orderId } = e.currentTarget.dataset;
    if (!orderId) return;
    wx.navigateTo({
      url: `/pages/production-order-pending-stock/production-order-pending-stock?orderId=${encodeURIComponent(orderId)}`,
    });
  },

  onQtyInput(e) {
    this.setData({ stockInQty: e.detail.value || '' });
  },

  onGoScan() {
    const app = getApp();
    if (app.globalData) app.globalData.scanPreset = { type: 'stockIn' };
    wx.switchTab({ url: '/pages/scan/scan' });
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig();
      this._productionLinkMode = (config && config.productionLinkMode) || 'order';
      const rawRows = await loadPendingStockRows();
      const rows = rawRows.map((row) => mapListRow(row, this._productionLinkMode));
      this.setData({ loading: false, rows });
    } catch {
      this.setData({ loading: false, rows: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadSingle() {
    this.setData({ loading: true });
    try {
      const order = await getOrder(this._orderId);
      const records = await fetchProductionRecords({
        type: 'STOCK_IN',
        all: 'true',
        orderIds: this._orderId,
      });
      const list = Array.isArray(records) ? records : (records.data || []);
      const row = computeOrderPendingStockRow(order, list);
      this._order = order;
      this.setData({
        loading: false,
        row,
        stockInQty: row.pendingTotal > 0 ? String(row.pendingTotal) : '1',
      });
      const warehouses = await fetchWarehousesAll();
      const whList = Array.isArray(warehouses) ? warehouses : (warehouses.data || []);
      this._defaultWarehouse = whList[0] || null;
    } catch {
      this.setData({ loading: false, row: null });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onStockIn() {
    if (!this.data.canCreate || !this._order) return;
    const qty = Number(this.data.stockInQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      wx.showToast({ title: '请输入有效数量', icon: 'none' });
      return;
    }
    const row = this.data.row;
    if (row && row.pendingTotal > 0 && qty > row.pendingTotal) {
      wx.showToast({ title: `最多入库 ${row.pendingTotal} 件`, icon: 'none' });
      return;
    }
    const wh = this._defaultWarehouse;
    if (!wh) {
      wx.showToast({ title: '暂无可用仓库', icon: 'none' });
      return;
    }
    const ctx = readTenantCtx();
    wx.showLoading({ title: '提交中' });
    try {
      await createProductionRecord({
        type: 'STOCK_IN',
        orderId: this._order.id,
        productId: this._order.productId,
        quantity: qty,
        warehouseId: wh.id,
        warehouseName: wh.name,
        operator: (ctx && (ctx.displayName || ctx.username)) || '',
      });
      wx.showToast({ title: '入库成功', icon: 'success' });
      await this.loadSingle();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '入库失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
