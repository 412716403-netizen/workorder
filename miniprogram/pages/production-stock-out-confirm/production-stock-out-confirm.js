const { readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { readTenantCtx } = require('../../utils/session.js');
const {
  fetchWarehousesAll,
  fetchCategoriesAll,
  createProductionRecordBatch,
  fetchStockBatches,
} = require('../../utils/orderApi.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const {
  buildConfirmRows,
  attachConfirmRowUnits,
  validateConfirmRows,
  buildProductionRecordBatchPayload,
  buildReturnDispatchedBatchesByProduct,
  parseBatchErrorMessage,
} = require('../../utils/materialStockConfirm.js');
const {
  decorateConfirmRowsWithBatchFlags,
  attachBatchOptionsToConfirmRows,
  attachReturnBatchOptionsToConfirmRows,
  confirmRowsNeedBatchColumn,
  applyBatchSelection,
} = require('../../utils/materialIssueBatch.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { INTERNAL_PARTNER_KEY } = require('../../utils/materialStatsLite.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

Page({
  data: {
    loading: true,
    submitting: false,
    mode: 'stock_out',
    modeLabel: '领料',
    pageTitle: '确认领料',
    orderNumber: '',
    productName: '',
    partnerLabel: '',
    rows: [],
    showBatchCol: false,
    warehouseNames: [],
    warehouseIndex: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const perms = (ctx && ctx.permissions) || [];
    const mode = options.mode ? decodeURIComponent(options.mode) : 'stock_out';
    if (mode === 'stock_out' && !hasPermission(perms, 'production:material_issue:allow')) {
      wx.showToast({ title: '无领料权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (mode === 'stock_return' && !hasPermission(perms, 'production:material_return:allow')) {
      wx.showToast({ title: '无退料权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const detail = (getApp().globalData && getApp().globalData.materialStockConfirm) || null;
    if (!detail || !detail.materials || !detail.materials.length) {
      wx.showToast({ title: '缺少领退料数据', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._detail = detail;
    this._mode = mode;
    this._products = detail.products || [];
    this._orders = detail.orders || [];
    this._stockRecords = detail.stockRecords || [];
    this._partnerKey = detail.partnerKey || INTERNAL_PARTNER_KEY;
    this._productsById = new Map(this._products.map((p) => [p.id, p]));
    this._returnDispatchedByProduct = mode === 'stock_return'
      ? buildReturnDispatchedBatchesByProduct({
        records: this._stockRecords,
        orderId: detail.orderId || '',
        sourceProductId: detail.sourceProductId || '',
        orders: this._orders,
        partnerKey: this._partnerKey,
      })
      : null;

    const modeLabel = mode === 'stock_return' ? '退料' : '领料';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      mode,
      modeLabel,
      pageTitle: `确认${modeLabel}`,
      orderNumber: detail.orderNumber || '',
      productName: detail.productName || '',
      partnerLabel: (this._partnerKey !== INTERNAL_PARTNER_KEY && detail.partnerLabel)
        ? detail.partnerLabel
        : '',
    });
    this.initRows(mode).then(() => this.loadWarehouses());
  },

  async initRows(mode) {
    let rows = buildConfirmRows(this._detail.materials, mode);
    let dictionaries = {};
    try {
      const [categoriesRaw, dictRaw] = await Promise.all([
        fetchCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
      ]);
      const categories = normalizeMasterList(categoriesRaw);
      this._categoryById = new Map(categories.map((c) => [c.id, c]));
      dictionaries = dictRaw || {};
    } catch {
      this._categoryById = new Map();
    }
    rows = attachConfirmRowUnits(rows, this._productsById, dictionaries);
    rows = decorateConfirmRowsWithBatchFlags(rows, this._productsById, this._categoryById);
    this._rows = rows;
    this.setData({
      showBatchCol: confirmRowsNeedBatchColumn(rows),
      rows,
    });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async loadWarehouses() {
    try {
      const raw = await fetchWarehousesAll();
      const list = Array.isArray(raw) ? raw : (raw && raw.data) || [];
      if (!list.length) {
        this.setData({ loading: false });
        wx.showToast({ title: '暂无可用仓库', icon: 'none' });
        return;
      }
      this._warehouses = list;
      this.setData({
        loading: false,
        warehouseNames: list.map((w) => w.name || w.code || w.id),
        warehouseIndex: 0,
      });
      await this.refreshBatchOptions();
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '仓库加载失败', icon: 'none' });
    }
  },

  async refreshBatchOptions() {
    const rows = this._rows || this.data.rows || [];
    if (!rows.length) return;

    let nextRows;
    if (this._mode === 'stock_return') {
      nextRows = attachReturnBatchOptionsToConfirmRows(rows, this._returnDispatchedByProduct);
    } else {
      const wh = (this._warehouses || [])[this.data.warehouseIndex];
      nextRows = await attachBatchOptionsToConfirmRows(
        rows,
        wh ? wh.id : '',
        fetchStockBatches,
      );
    }
    this._rows = nextRows;
    this.setData({
      rows: nextRows,
      showBatchCol: confirmRowsNeedBatchColumn(nextRows),
    });
  },

  async onWarehouseChange(e) {
    this.setData({ warehouseIndex: Number(e.detail.value) || 0 });
    if (this._mode === 'stock_out') {
      await this.refreshBatchOptions();
    }
  },

  onQtyInput(e) {
    const { id } = e.currentTarget.dataset;
    const val = e.detail.value || '';
    const rows = (this.data.rows || []).map((r) => (
      r.productId === id ? { ...r, quantity: val } : r
    ));
    this._rows = rows;
    this.setData({ rows });
  },

  onBatchChange(e) {
    const { id } = e.currentTarget.dataset;
    const idx = Number(e.detail.value);
    const rows = (this.data.rows || []).map((r) => {
      if (r.productId !== id) return r;
      return applyBatchSelection(r, idx);
    });
    this._rows = rows;
    this.setData({ rows });
  },

  async onSubmitTap() {
    if (this.data.submitting) return;
    const errors = validateConfirmRows(this.data.rows, this._mode);
    if (errors.length) {
      wx.showToast({ title: errors[0], icon: 'none' });
      return;
    }
    const wh = (this._warehouses || [])[this.data.warehouseIndex];
    if (!wh) {
      wx.showToast({ title: '请选择仓库', icon: 'none' });
      return;
    }

    const payload = buildProductionRecordBatchPayload({
      mode: this._mode,
      rows: this.data.rows,
      orderId: this._detail.orderId || undefined,
      sourceProductId: this._detail.sourceProductId || undefined,
      warehouse: wh,
      operator: readOperatorDisplayName(),
      partner: this._partnerKey !== INTERNAL_PARTNER_KEY ? this._partnerKey : undefined,
    });

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      await createProductionRecordBatch(payload);
      wx.showToast({ title: `${this.data.modeLabel}成功`, icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/production-stock-out/production-stock-out' });
      }, 400);
    } catch (err) {
      wx.showToast({ title: parseBatchErrorMessage(err), icon: 'none', duration: 2500 });
      this.setData({ submitting: false });
    } finally {
      wx.hideLoading();
    }
  },
});
