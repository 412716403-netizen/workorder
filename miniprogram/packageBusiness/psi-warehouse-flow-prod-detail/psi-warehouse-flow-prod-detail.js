const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../utils/orderApi.js'),fetchProductionRecords = _require3.fetchProductionRecords,fetchProductsAll = _require3.fetchProductsAll,fetchWarehousesAll = _require3.fetchWarehousesAll;
const _require4 = require('../utils/productionPlans.js'),normalizeMasterList = _require4.normalizeMasterList;
const _require5 = require('../utils/listProductThumb.js'),listProductNameSkuFields = _require5.listProductNameSkuFields;
const _require6 = require('../utils/warehouseFlow.js'),formatFlowDateTime = _require6.formatFlowDateTime,formatWarehouseFlowQty = _require6.formatWarehouseFlowQty;
const _require7 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require7.readNavBarMetrics,readWindowMetrics = _require7.readWindowMetrics;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = nav.statusBarHeight + nav.navBarHeight;
  return headerPx + Math.ceil(win.windowWidth / 750 * 24);
}

Page({
  data: {
    loading: true,
    detail: null,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._type = options.type ? decodeURIComponent(options.type) : 'STOCK_RETURN';
    this._id = options.id ? decodeURIComponent(options.id) : '';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });
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
    if (!hasPermission(ctx.permissions || [], 'psi:warehouse_flow:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (!this._id) {
      wx.showToast({ title: '缺少记录 ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {var _record$quantity;
      const _await$Promise$all = await Promise.all([
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchProductionRecords({
          types: this._type || 'STOCK_RETURN',
          all: 'true'
        }).catch(() => [])]
        ),productsRaw = _await$Promise$all[0],warehousesRaw = _await$Promise$all[1],recordsRaw = _await$Promise$all[2];

      const products = normalizeMasterList(productsRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data || [];
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
      const records = Array.isArray(recordsRaw) ? recordsRaw : [];
      const record = records.find((r) => r.id === this._id);

      if (!record) {
        this.setData({ loading: false, detail: null });
        wx.showToast({ title: '记录不存在', icon: 'none' });
        return;
      }

      const product = productMap.get(record.productId);
      const nameFields = listProductNameSkuFields(product);
      const warehouse = warehouseMap.get(record.warehouseId);
      const qty = (_record$quantity = record.quantity) != null ? _record$quantity : 0;

      this.setData({
        loading: false,
        detail: {
          typeLabel: this._type === 'STOCK_RETURN' ? '生产退料' : record.type || this._type,
          productName: nameFields.productName,
          productSku: nameFields.productSku,
          showProductSku: nameFields.showProductSku,
          qtyText: formatWarehouseFlowQty(qty),
          warehouseName: warehouse && warehouse.name || '—',
          timeLabel: formatFlowDateTime(record.timestamp || ''),
          docNo: record.docNo || record.id || '—'
        }
      });
    } catch {
      this.setData({ loading: false, detail: null });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});