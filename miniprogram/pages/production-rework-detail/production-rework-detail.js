const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const { fetchTenantConfig, fetchProductsAll, fetchNodesAll } = require('../../utils/orderApi.js');
const { fetchAllOrdersPaginated } = require('../../utils/pendingStockBadge.js');
const { fetchReworkRecordsForPanel } = require('../../utils/reworkRecordsLoad.js');
const { buildReworkDetailView } = require('../../utils/reworkDetailLite.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx);
}

function mapBasicRows(view) {
  const rows = [
    { label: '工单号', value: view.orderNumber || '—' },
    { label: '产品', value: view.productName || '—' },
  ];
  if (view.productSku) {
    rows.push({ label: 'SKU', value: view.productSku });
  }
  if (view.customer) {
    rows.push({ label: '客户', value: view.customer });
  }
  if (view.dueDate) {
    rows.push({ label: '交期', value: view.dueDate });
  }
  if (view.orderTotalQtyText) {
    rows.push({ label: '工单总量', value: view.orderTotalQtyText });
  }
  if (view.showChildren) {
    rows.push({ label: '子工单', value: `${view.childCount} 个` });
  }
  return rows.map((row, index, list) => ({
    ...row,
    isLast: index === list.length - 1,
  }));
}

Page({
  data: {
    loading: true,
    title: '返工详情',
    productHero: null,
    basicRows: [],
    defectRows: [],
    reworkStatRows: [],
    defectRecordsList: [],
    reworkReportList: [],
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });

    this._reworkOrderId = options.reworkOrderId ? decodeURIComponent(options.reworkOrderId) : '';
    if (!this._reworkOrderId) {
      wx.showToast({ title: '缺少返工工单 ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadDetail();
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onProductImageError() {
    if (!this.data.productHero) return;
    this.setData({
      productHero: {
        ...this.data.productHero,
        showProductImage: false,
      },
    });
  },

  async loadDetail() {
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    if (!hasPermission(ctx.permissions || [], 'production:rework_detail:allow')) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this.setData({ loading: true });
    try {
      const [config, orders, productsRaw, nodesRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll(),
      ]);

      const products = normalizeMasterList(productsRaw);
      const nodes = normalizeMasterList(nodesRaw);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const records = await fetchReworkRecordsForPanel({
        productionLinkMode,
        orders: orders || [],
        products,
      });

      const view = buildReworkDetailView({
        reworkDetailOrderId: this._reworkOrderId,
        orders: orders || [],
        products,
        records: records || [],
        nodes,
        productionLinkMode,
      });

      if (!view) {
        throw new Error('返工工单不存在');
      }

      const productHero = {
        productName: view.productName,
        productSku: view.productSku || '',
        showProductSku: !!(view.productSku && view.productSku.trim()),
        productImageUrl: view.productImageUrl,
        showProductImage: view.showProductImage,
        placeholderIconSrc: view.placeholderIconSrc,
        showProductCustomTags: false,
        productCustomTags: [],
      };

      this.setData({
        loading: false,
        title: view.orderNumber || '返工详情',
        productHero,
        basicRows: mapBasicRows(view),
        defectRows: view.defectRows || [],
        reworkStatRows: view.reworkStatRows || [],
        defectRecordsList: view.defectRecordsList || [],
        reworkReportList: view.reworkReportList || [],
      });
      wx.setNavigationBarTitle({ title: view.orderNumber || '返工详情' });
    } catch (err) {
      this.setData({
        loading: false,
        productHero: null,
        basicRows: [],
        defectRows: [],
        reworkStatRows: [],
        defectRecordsList: [],
        reworkReportList: [],
      });
      wx.showToast({
        title: (err && err.message) || '加载失败',
        icon: 'none',
      });
      setTimeout(() => wx.navigateBack(), 1000);
    }
  },
});
