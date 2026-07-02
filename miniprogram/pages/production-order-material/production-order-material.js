const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  getOrder,
  fetchBomsAll,
  fetchProductsAll,
  fetchProductionRecords,
  createProductionRecord,
  fetchWarehousesAll,
} = require('../../utils/orderApi.js');
const { buildMaterialIssueRows } = require('../../utils/orderMaterialLite.js');
const { normalizeMasterList } = require('../../utils/productionOrders.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

Page({
  data: {
    loading: true,
    rows: [],
    canMaterial: false,
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
    this._orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    const ctx = readTenantCtx();
    this.setData({
      canMaterial: hasPermission((ctx && ctx.permissions) || [], 'production:orders_material:allow'),
    });
    if (!this._orderId) {
      wx.showToast({ title: '缺少工单 ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadData();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onIssueQtyInput(e) {
    const { id } = e.currentTarget.dataset;
    const val = e.detail.value || '';
    const rows = (this.data.rows || []).map((r) =>
      r.materialProductId === id ? { ...r, issueQty: val } : r,
    );
    this.setData({ rows });
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [order, bomsRaw, productsRaw, recordsRaw, warehousesRaw] = await Promise.all([
        getOrder(this._orderId),
        fetchBomsAll(),
        fetchProductsAll(),
        fetchProductionRecords({
          types: 'STOCK_OUT,STOCK_RETURN',
          orderIds: this._orderId,
        }),
        fetchWarehousesAll(),
      ]);
      this._order = order;
      const boms = Array.isArray(bomsRaw) ? bomsRaw : [];
      const products = normalizeMasterList(productsRaw);
      const productsById = new Map(products.map((p) => [p.id, p]));
      const records = Array.isArray(recordsRaw) ? recordsRaw : (recordsRaw.data || []);
      const whList = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw.data || []);
      this._defaultWarehouse = whList[0] || null;

      const rows = buildMaterialIssueRows(order, boms, records, productsById).map((r) => ({
        ...r,
        issueQty: r.pending > 0 ? String(Math.min(r.pending, r.pending)) : '1',
      }));

      this.setData({ loading: false, rows });
    } catch {
      this.setData({ loading: false, rows: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onIssueTap(e) {
    if (!this.data.canMaterial || !this._order) return;
    const { id } = e.currentTarget.dataset;
    const row = (this.data.rows || []).find((r) => r.materialProductId === id);
    if (!row) return;
    const qty = Number(row.issueQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      wx.showToast({ title: '请输入有效数量', icon: 'none' });
      return;
    }
    if (row.pending > 0 && qty > row.pending) {
      wx.showToast({ title: `最多领 ${row.pending}`, icon: 'none' });
      return;
    }
    const wh = this._defaultWarehouse;
    if (!wh) {
      wx.showToast({ title: '暂无可用仓库', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中' });
    try {
      await createProductionRecord({
        type: 'STOCK_OUT',
        orderId: this._order.id,
        productId: row.materialProductId,
        sourceProductId: this._order.productId,
        quantity: qty,
        warehouseId: wh.id,
        warehouseName: wh.name,
        operator: readOperatorDisplayName(),
      });
      wx.showToast({ title: '领料成功', icon: 'success' });
      await this.loadData();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '领料失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
