const { readTenantCtx, readOperatorDisplayName, readCurrentUserId } = require('../../utils/session.js');
const { hasPermission, hasPrefixPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { readWorkerReportScanPrefill, deserializeReportScanMeta } = require('../../utils/workerReportScanPrefill.js');
const { createOrderReport, fetchTenantConfig, fetchProductsAll, fetchCategoriesAll, fetchNodesAll } = require('../utils/orderApi.js');
const { fetchDictionaries } = require('../utils/planApi.js');
const { normalizeMasterList, normalizeAppDictionaries } = require('../utils/productionPlans.js');
const {
  getEffectiveReportTemplate,
  buildReportCustomFields,
  buildInitialReportCustomData,
  buildCustomDataPayload,
  validateReportCustomFields,
} = require('../utils/orderReportForm.js');
const { buildReportScanPayloadFields } = require('../utils/reportScanMeta.js');
const { buildWorkerReportLineCards, entriesFromQuantities } = require('../utils/workerReportConfirmView.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

Page({
  data: {
    loading: true,
    submitting: false,
    pageTitle: '确认报工',
    templateName: '',
    summaryMeta: '',
    lineCards: [],
    workerName: '',
    reportCustomFields: [],
    customData: {},
    canSubmit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  _prefill: null,
  _lines: [],

  onLoad(options) {
    const nav = readNavBarMetrics();
    const selfReport = options.selfReport === '1' || options.selfReport === 'true';
    const prefill = readWorkerReportScanPrefill();
    if (!prefill || !Array.isArray(prefill.lines) || !prefill.lines.length) {
      wx.showToast({ title: '扫码数据已失效，请重新扫码', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._prefill = prefill;
    this._lines = prefill.lines;
    const meId = readCurrentUserId();
    const templateName = prefill.templateName || '';
    const orderCount = prefill.lines.length;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      pageTitle: templateName ? `${templateName} · 确认报工` : '确认报工',
      templateName,
      summaryMeta: `共 ${orderCount} 张工单 · 提交后合并为一条待审`,
      workerName: readOperatorDisplayName() || '本人',
      selfReport,
      workerId: selfReport && meId ? meId : '',
    });
    this.bootstrap();
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
    wx.navigateBack();
  },

  onCustomDataChange(e) {
    const customData = (e.detail && e.detail.values) || {};
    this.setData({
      customData,
      canSubmit: this.computeCanSubmit(customData),
    });
  },

  computeCanSubmit(customData) {
    if (!this._lines.length) return false;
    if (!this.data.workerId) return false;
    const err = validateReportCustomFields(this._reportCustomFields || [], customData || this.data.customData);
    return !err;
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [config, productsRaw, categoriesRaw, dictionariesRaw, nodesRaw] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        fetchNodesAll().catch(() => []),
      ]);
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const productMap = new Map(products.map((p) => [p.id, p]));
      const categoryMap = new Map(categories.map((c) => [c.id, c]));
      const globalNodes = normalizeMasterList(nodesRaw);
      const templateId = this._prefill.templateId || '';
      const milestoneStub = { templateId, name: this._prefill.templateName || '' };
      const reportTemplate = getEffectiveReportTemplate(milestoneStub, globalNodes);
      const reportCustomFields = buildReportCustomFields(reportTemplate, config);
      const customData = buildInitialReportCustomData(reportCustomFields);
      this._reportCustomFields = reportCustomFields;

      const lineCards = buildWorkerReportLineCards(this._lines, {
        productMap,
        categoryMap,
        dictionaries,
      });

      this.setData({
        loading: false,
        lineCards,
        reportCustomFields,
        customData,
        canSubmit: this.computeCanSubmit(customData),
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSubmit) return;
    const customErr = validateReportCustomFields(this._reportCustomFields, this.data.customData);
    if (customErr) {
      wx.showToast({ title: customErr, icon: 'none' });
      return;
    }
    if (!this.data.workerId) {
      wx.showToast({ title: '无法确认生产人员', icon: 'none' });
      return;
    }

    const customData = buildCustomDataPayload(this._reportCustomFields, this.data.customData);
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const operator = readOperatorDisplayName() || '';

    this.setData({ submitting: true });
    try {
      for (let i = 0; i < this._lines.length; i += 1) {
        const line = this._lines[i];
        const meta = deserializeReportScanMeta(line.scanMeta);
        const entries = entriesFromQuantities(line.quantities, line.defectiveQuantities);
        if (!entries.length) continue;
        for (let j = 0; j < entries.length; j += 1) {
          const entry = entries[j];
          const scanFields = buildReportScanPayloadFields(
            meta,
            entry.variantId || null,
            customData || {},
          );
          await createOrderReport(line.orderId, line.milestoneId, {
            quantity: entry.quantity,
            defectiveQuantity: entry.defectiveQuantity > 0 ? entry.defectiveQuantity : undefined,
            variantId: entry.variantId || undefined,
            workerId: this.data.workerId,
            customData: scanFields.customData,
            reportBatchId: batchId,
            operator,
            itemCodeId: scanFields.itemCodeId,
            virtualBatchId: scanFields.virtualBatchId,
            requireApproval: true,
          });
        }
      }
      wx.showToast({ title: '已提交，待审核', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/scan/scan' });
      }, 400);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '报工失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
