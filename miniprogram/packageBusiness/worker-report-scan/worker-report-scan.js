const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission, hasPrefixPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics } = require('../../utils/windowMetrics.js');
const { loadTraceabilityScanEnabled } = require('../../utils/featurePlugins.js');
const { createScanBatchController } = require('../utils/scanBatchController.js');
const {
  createWorkerReportScanHandlers,
  loadOrdersForWorkerScan,
  buildReportableKeySet,
} = require('../utils/scanBatchApplyWorkerReport.js');
const { listMyReportableTasks, fetchTenantConfig } = require('../../utils/workerReportApi.js');
const { fetchProductsAll, fetchCategoriesAll } = require('../../utils/orderApi.js');
const { normalizeMasterList } = require('../../utils/productionPlans.js');

Page({
  data: {
    templateId: '',
    templateName: '',
    pageTitle: '扫码报工',
    loading: true,
    scanEnabled: false,
    scanBatchOpen: false,
    scanBatchRows: [],
    scanBatchTitle: '报工 · 批量扫码',
    scanBatchHint: '扫码后确认应用，将跳转自报工表单核对提交',
    scanBatchProcessing: false,
    scanBatchShowIntentToggle: true,
    scanBatchIntent: 'BATCH',
    scanFeedbackText: '',
    scanFeedbackType: '',
    statusBarHeight: 20,
    navBarHeight: 44,
  },

  _orders: [],
  _reportableKeys: null,
  _targetGroups: null,

  onLoad(options) {
    const nav = readNavBarMetrics();
    const templateId = options.templateId ? decodeURIComponent(options.templateId) : '';
    const templateName = options.templateName ? decodeURIComponent(options.templateName) : '';
    const scanHint = templateName
      ? `当前工序：${templateName}；可扫多张工单，确认后统一提交待审`
      : '可扫多张工单的码；确认后进入报工确认页';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      templateId,
      templateName,
      pageTitle: templateName ? `${templateName} · 扫码报工` : '扫码报工',
      scanBatchTitle: templateName ? `${templateName} · 扫码报工` : '扫码报工',
      scanBatchHint: scanHint,
    });

    if (!templateId) {
      wx.showToast({ title: '请先选择工序', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const workerScan = createWorkerReportScanHandlers(this);
    this._scanBatch = createScanBatchController(this, {
      title: templateName ? `${templateName} · 扫码报工` : '扫码报工',
      hint: scanHint,
      showScanIntentToggle: true,
      resolveRowPreview: (payload) => workerScan.resolveRowPreview(payload),
      onConfirm: (payloads) => workerScan.onConfirm(payloads),
    });

    this.bootstrap();
    loadTraceabilityScanEnabled().then((scanEnabled) => {
      this.setData({ scanEnabled });
      if (!scanEnabled) {
        wx.showToast({ title: '未开启追溯码，无法扫码报工', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1200);
        return;
      }
      if (this._scanBatch) this._scanBatch.open();
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
    const perms = ctx.permissions || [];
    const canSelf =
      hasPermission(perms, 'process_report') || hasPrefixPermission(perms, 'process_report');
    if (!canSelf) {
      wx.showToast({ title: '无报工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onHeaderBack() {
    if (this._scanBatch) this._scanBatch.close();
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [config, orders, productsRaw, categoriesRaw] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        loadOrdersForWorkerScan(),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
      ]);
      const productionLinkMode =
        config && config.productionLinkMode === 'product' ? 'product' : 'order';
      this._productionLinkMode = productionLinkMode;
      const reportable = await listMyReportableTasks({ productionLinkMode }).catch(() => ({
        tasks: [],
      }));
      this._orders = orders;
      this._reportableKeys = buildReportableKeySet(reportable.tasks || []);
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      this._productById = new Map(products.map((p) => [p.id, p]));
      this._categoryById = new Map(categories.map((c) => [c.id, c]));
      this.setData({ loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  onScanBatchClose() {
    if (this._scanBatch) this._scanBatch.close();
    wx.navigateBack();
  },

  onScanBatchScan() {
    if (this._scanBatch) this._scanBatch.triggerScan();
  },

  onScanBatchConfirm() {
    if (this._scanBatch) this._scanBatch.confirm();
  },

  onScanBatchRemove(e) {
    if (this._scanBatch) this._scanBatch.removeRow(e.detail.id);
  },

  onScanBatchIntentChange(e) {
    if (this._scanBatch) this._scanBatch.setScanIntent(e.detail.intent);
  },
});
