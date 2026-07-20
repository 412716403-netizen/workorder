const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission, isTenantElevatedRole } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { fetchWarehousesAll, fetchStockBatches, fetchProductsAll, fetchCategoriesAll } = require('../../utils/orderApi.js');
const {
  listDevMaterialRecords,
  createDevMaterialIssueBatch,
  createDevMaterialReturnBatch,
} = require('../utils/developmentApi.js');
const {
  buildIssueUiRows,
  buildReturnUiRows,
  buildIssueLines,
  buildReturnLines,
} = require('../utils/devMaterialLite.js');
const {
  decorateRowsWithBatchFlags,
  attachBatchOptionsToRows,
  applyBatchSelection,
  validateMaterialIssueBatchRows,
} = require('../../utils/materialIssueBatch.js');
const { defaultEntryDate, defaultEntryTimeHm, entryDateAndTimeToIso } = require('../../utils/docEntryTime.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  return Math.max(200, (win.windowHeight || 667) - computePlanCreateHeaderHeight(nav));
}

Page({
  data: {
    mode: 'issue',
    isIssue: true,
    pageTitle: '开发领料',
    styleId: '',
    styleName: '',
    styleCode: '',
    loading: true,
    submitting: false,
    rows: [],
    warehouses: [],
    warehouseIndex: 0,
    warehouseId: '',
    entryDate: defaultEntryDate(),
    entryTime: defaultEntryTimeHm(),
    showBatchCol: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const mode = options.mode === 'return' ? 'return' : 'issue';
    const isIssue = mode === 'issue';
    this.setData({
      mode,
      isIssue,
      pageTitle: isIssue ? '开发领料' : '开发退料',
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
    const perm = this.data.isIssue
      ? 'development:material_issue:create'
      : 'development:material_return:create';
    if (!isTenantElevatedRole(ctx && ctx.tenantRole) && !hasPermission(perms, perm)) {
      wx.showToast({ title: '无权操作', icon: 'none' });
      return;
    }
    await this.reload();
  },

  async reload() {
    const styleId = this.data.styleId;
    if (!styleId) return;
    this.setData({ loading: true });
    try {
      const [materialData, warehouses, products, categories] = await Promise.all([
        listDevMaterialRecords(styleId),
        fetchWarehousesAll(),
        fetchProductsAll(),
        fetchCategoriesAll(),
      ]);
      this._materialData = materialData;
      this._productsById = new Map((products || []).map((p) => [p.id, p]));
      this._categoryById = new Map((categories || []).map((c) => [c.id, c]));

      const whList = warehouses || [];
      const warehouseId = this.data.warehouseId || (whList[0] && whList[0].id) || '';
      const warehouseIndex = Math.max(0, whList.findIndex((w) => w.id === warehouseId));
      const warehouseNameById = {};
      whList.forEach((w) => { warehouseNameById[w.id] = w.name; });

      if (this.data.isIssue) {
        if (!materialData.canIssue) {
          wx.showToast({ title: '当前款式不可领料', icon: 'none' });
        }
        let rows = buildIssueUiRows(materialData, this._productsById);
        rows = decorateRowsWithBatchFlags(rows, this._productsById, this._categoryById);
        rows = await attachBatchOptionsToRows(rows, warehouseId, fetchStockBatches);
        this.setData({
          rows,
          warehouses: whList,
          warehouseId,
          warehouseIndex: warehouseIndex < 0 ? 0 : warehouseIndex,
          showBatchCol: rows.some((r) => r.needsBatch),
          loading: false,
        });
      } else {
        this.setData({
          rows: buildReturnUiRows(materialData, warehouseNameById),
          warehouses: whList,
          warehouseId,
          warehouseIndex: warehouseIndex < 0 ? 0 : warehouseIndex,
          showBatchCol: false,
          loading: false,
        });
      }
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  onHeaderBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) });
  },

  onWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = this.data.warehouses[idx];
    const warehouseId = wh ? wh.id : '';
    this.setData({ warehouseIndex: idx, warehouseId });
    if (this.data.isIssue) this.reload();
  },

  onQtyInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = this.data.isIssue ? 'issueQty' : 'returnQty';
    const rows = this.data.rows.slice();
    if (!rows[index]) return;
    rows[index] = { ...rows[index], [field]: e.detail.value };
    this.setData({ rows });
  },

  onBatchChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const rows = this.data.rows.slice();
    if (!rows[index]) return;
    rows[index] = applyBatchSelection(rows[index], e.detail.value);
    this.setData({ rows });
  },

  onEntryDateChange(e) {
    this.setData({ entryDate: e.detail.value });
  },

  onEntryTimeChange(e) {
    this.setData({ entryTime: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const { isIssue, warehouseId, rows } = this.data;
    if (isIssue && !warehouseId) {
      wx.showToast({ title: '请选择仓库', icon: 'none' });
      return;
    }
    const lines = isIssue
      ? buildIssueLines(rows, warehouseId)
      : buildReturnLines(rows);
    if (!lines.length) {
      wx.showToast({ title: isIssue ? '请填写领料数量' : '请填写退料数量', icon: 'none' });
      return;
    }
    if (isIssue) {
      const batchErrs = validateMaterialIssueBatchRows(rows.filter((r) => Number(r.issueQty) > 0));
      if (batchErrs && batchErrs.length) {
        wx.showToast({ title: batchErrs[0], icon: 'none' });
        return;
      }
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      const body = {
        lines,
        operator: readOperatorDisplayName(),
        timestamp: entryDateAndTimeToIso(this.data.entryDate, this.data.entryTime),
      };
      const result = isIssue
        ? await createDevMaterialIssueBatch(this.data.styleId, body)
        : await createDevMaterialReturnBatch(this.data.styleId, body);
      wx.hideLoading();
      wx.showToast({ title: `${isIssue ? '领料' : '退料'}成功`, icon: 'success' });
      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            wx.redirectTo({
              url: `/packageBusiness/development-style-detail/development-style-detail?styleId=${encodeURIComponent(this.data.styleId)}`,
            });
          },
        });
      }, 500);
      return result;
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    }
  },
});
