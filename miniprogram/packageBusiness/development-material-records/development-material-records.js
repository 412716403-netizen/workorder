const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission, isTenantElevatedRole } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { fetchWarehousesAll } = require('../../utils/orderApi.js');
const { listDevMaterialRecords } = require('../utils/developmentApi.js');
const { formatSummaryCards } = require('../utils/devMaterialLite.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  return Math.max(200, (win.windowHeight || 667) - computePlanCreateHeaderHeight(nav));
}

function canAccessMaterial(perms, elevated) {
  if (elevated) return true;
  return (
    hasPermission(perms, 'development:material_records:view') ||
    hasPermission(perms, 'development:material_issue:create') ||
    hasPermission(perms, 'development:material_return:create')
  );
}

Page({
  data: {
    styleId: '',
    styleName: '',
    styleCode: '',
    loading: true,
    docs: [],
    materialSummary: [],
    materialEmptyHint: '暂无领退料记录',
    canMaterialIssue: false,
    canMaterialReturn: false,
    canMaterialRecords: false,
    issueDisabled: true,
    returnDisabled: true,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      styleId: options.styleId ? decodeURIComponent(options.styleId) : '',
      styleName: options.styleName ? decodeURIComponent(options.styleName) : '',
      styleCode: options.styleCode ? decodeURIComponent(options.styleCode) : '',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.bootstrap();
  },

  async bootstrap() {
    const plugins = await loadFeaturePlugins();
    if (!isPluginEnabled(plugins, 'development')) {
      wx.showToast({ title: '开发管理未开启', icon: 'none' });
      return;
    }
    const ctx = readTenantCtx();
    const perms = (ctx && ctx.permissions) || [];
    const elevated = isTenantElevatedRole(ctx && ctx.tenantRole);
    if (!canAccessMaterial(perms, elevated)) {
      wx.showToast({ title: '无权查看', icon: 'none' });
      return;
    }
    this._canMaterialIssue = elevated || hasPermission(perms, 'development:material_issue:create');
    this._canMaterialReturn = elevated || hasPermission(perms, 'development:material_return:create');
    this._canMaterialRecords = elevated || hasPermission(perms, 'development:material_records:view');
    this.setData({
      canMaterialIssue: this._canMaterialIssue,
      canMaterialReturn: this._canMaterialReturn,
      canMaterialRecords: this._canMaterialRecords,
    });
    await this.reload();
  },

  async reload() {
    if (!this.data.styleId) return;
    this.setData({ loading: true });
    try {
      const [materialData, warehouses] = await Promise.all([
        listDevMaterialRecords(this.data.styleId),
        fetchWarehousesAll().catch(() => []),
      ]);
      const whName = {};
      (warehouses || []).forEach((w) => { whName[w.id] = w.name; });
      const bomIds = (materialData && materialData.bomProductIds) || [];
      const materialSummary = formatSummaryCards(materialData);
      let materialEmptyHint = '暂无领退料记录';
      if (!bomIds.length) materialEmptyHint = '请先配置试制 BOM';

      const docs = this._canMaterialRecords
        ? ((materialData && materialData.docs) || []).map((doc) => ({
          ...doc,
          typeLabel: doc.type === 'STOCK_OUT' ? '领料' : '退料',
          timeText: doc.timestamp ? new Date(doc.timestamp).toLocaleString() : '',
          lines: (doc.lines || []).map((line) => ({
            ...line,
            warehouseName: line.warehouseId ? (whName[line.warehouseId] || line.warehouseId) : '—',
            batchText: line.batchNo || '无批号',
            showProductSku: Boolean(line.productName && line.productSku && line.productName !== line.productSku),
          })),
        }))
        : [];

      this.setData({
        docs,
        materialSummary,
        materialEmptyHint,
        issueDisabled: !(materialData && materialData.canIssue && bomIds.length > 0),
        returnDisabled: !(materialData && materialData.canReturn),
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  openOperation(mode) {
    const q = [
      `styleId=${encodeURIComponent(this.data.styleId)}`,
      `styleName=${encodeURIComponent(this.data.styleName || '')}`,
      `styleCode=${encodeURIComponent(this.data.styleCode || '')}`,
    ];
    wx.navigateTo({
      url: `/packageBusiness/development-material-operation/development-material-operation?mode=${mode}&${q.join('&')}`,
    });
  },

  onMaterialIssueTap() {
    if (this.data.issueDisabled) {
      wx.showToast({
        title: this.data.materialEmptyHint === '请先配置试制 BOM' ? '请先配置试制 BOM' : '当前不可领料',
        icon: 'none',
      });
      return;
    }
    this.openOperation('issue');
  },

  onMaterialReturnTap() {
    if (this.data.returnDisabled) {
      wx.showToast({ title: '暂无可退物料', icon: 'none' });
      return;
    }
    this.openOperation('return');
  },

  onHeaderBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) });
  },
});
