const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { fetchProductionRecords, fetchProductsAll, fetchWarehousesAll } = require('../utils/orderApi.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
const { listProductNameSkuFields } = require('../utils/listProductThumb.js');
const { formatFlowDateTime, formatWarehouseFlowQty } = require('../utils/warehouseFlow.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = nav.statusBarHeight + nav.navBarHeight;
  return headerPx + Math.ceil((win.windowWidth / 750) * 24);
}

Page({
  data: {
    loading: true,
    detail: null,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._type = options.type ? decodeURIComponent(options.type) : 'STOCK_RETURN';
    this._id = options.id ? decodeURIComponent(options.id) : '';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
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
    try {
      const [productsRaw, warehousesRaw, recordsRaw] = await Promise.all([
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchProductionRecords({
          types: this._type || 'STOCK_RETURN',
          all: 'true',
        }).catch(() => []),
      ]);

      const products = normalizeMasterList(productsRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw.data || []);
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
      const qty = record.quantity ?? 0;

      this.setData({
        loading: false,
        detail: {
          typeLabel: this._type === 'STOCK_RETURN' ? '生产退料' : (record.type || this._type),
          productName: nameFields.productName,
          productSku: nameFields.productSku,
          showProductSku: nameFields.showProductSku,
          qtyText: formatWarehouseFlowQty(qty),
          warehouseName: (warehouse && warehouse.name) || '—',
          timeLabel: formatFlowDateTime(record.timestamp || ''),
          docNo: record.docNo || record.id || '—',
        },
      });
    } catch {
      this.setData({ loading: false, detail: null });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
