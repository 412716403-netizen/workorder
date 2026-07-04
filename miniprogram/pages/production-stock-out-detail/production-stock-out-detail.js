const { fetchDictionaries } = require('../../utils/planApi.js');
const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  fetchProductsAll,
  fetchTenantConfig,
  fetchWarehousesAll,
  fetchProductionRecords,
} = require('../../utils/orderApi.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const { fetchAllOrdersPaginated } = require('../../utils/pendingStockBadge.js');
const { buildMaterialFlowDetailView } = require('../../utils/materialStockFlow.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, win.windowHeight - headerPx);
}

Page({
  data: {
    loading: true,
    detail: null,
    docNo: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission((ctx && ctx.permissions) || [], 'production:material_records:view')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._docNo = options.docNo ? decodeURIComponent(options.docNo) : '';

    this.setData({
      docNo: this._docNo,
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });

    if (!this._docNo) {
      wx.showToast({ title: '缺少单号', icon: 'none' });
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
      const [config, orders, productsRaw, warehousesRaw, dictionariesRaw, recordsRaw] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchAllOrdersPaginated({}).catch(() => []),
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchProductionRecords({
          docNo: this._docNo,
          types: 'STOCK_OUT,STOCK_RETURN',
        }).catch(() => []),
      ]);

      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const products = normalizeMasterList(productsRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const orderMap = new Map((orders || []).map((o) => [o.id, o]));
      const warehouses = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw.data || []);
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
      const rows = Array.isArray(recordsRaw) ? recordsRaw : (recordsRaw && recordsRaw.data) || [];

      if (!rows.length) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      const detail = buildMaterialFlowDetailView(rows, {
        productMap,
        warehouseMap,
        orderMap,
        productionLinkMode,
        dictionaries: dictionariesRaw || {},
      });

      if (!detail) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      this.setData({
        loading: false,
        detail,
        docNo: detail.docNo,
      });
    } catch {
      this.setData({ loading: false, detail: null });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
