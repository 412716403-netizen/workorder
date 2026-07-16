const { readTenantCtx, readOperatorDisplayName, readCurrentUserId } = require('../../utils/session.js');
const { hasPermission, hasPrefixPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { readWorkerReportScanPrefill, deserializeReportScanMeta } = require('../utils/workerReportScanPrefill.js');
const { createOrderReport, createProductReport, fetchTenantConfig, fetchProductsAll, fetchCategoriesAll, fetchNodesAll, getOrder, fetchProductionRecords } = require('../../utils/orderApi.js');
const { fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeMasterList, normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const {
  getEffectiveReportTemplate,
  buildReportCustomFields,
  buildInitialReportCustomData,
  buildCustomDataPayload,
  validateReportCustomFields,
} = require('../../utils/orderReportForm.js');
const { buildReportScanPayloadFields } = require('../utils/reportScanMeta.js');
const { buildWorkerReportDisplayLines, entriesFromQuantities } = require('../utils/workerReportConfirmView.js');
const { defaultEntryDate, defaultEntryTimeHm, entryDateAndTimeToIso } = require('../../utils/docEntryTime.js');

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
    pageTitle: '报工',
    templateName: '',
    lineCards: [],
    qtyInputMode: 'good',
    workerName: '',
    reportCustomFields: [],
    customData: {},
    canSubmit: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    entryDate: '',
    entryTime: '',
    pickerSheetOpen: false,
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
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      pageTitle: templateName ? `${templateName} · 报工` : '报工',
      templateName,
      workerName: readOperatorDisplayName() || '本人',
      selfReport,
      workerId: selfReport && meId ? meId : '',
      entryDate: defaultEntryDate(),
      entryTime: defaultEntryTimeHm(),
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

  onEntryDateTimeChange(e) {
    const detail = e.detail || {};
    this.setData({
      entryDate: detail.date || '',
      entryTime: detail.time || '',
    });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
  },

  computeCanSubmit(customData) {
    if (!this._lines.length) return false;
    if (!this.data.workerId) return false;
    const err = validateReportCustomFields(this._reportCustomFields || [], customData || this.data.customData);
    return !err;
  },

  onQtyModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.qtyInputMode) return;
    this.setData({ qtyInputMode: mode });
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
      this._productionLinkMode =
        config && config.productionLinkMode === 'product' ? 'product' : 'order';
      const templateId = this._prefill.templateId || '';
      const milestoneStub = { templateId, name: this._prefill.templateName || '' };
      const reportTemplate = getEffectiveReportTemplate(milestoneStub, globalNodes);
      const reportCustomFields = buildReportCustomFields(reportTemplate, config);
      const customData = buildInitialReportCustomData(reportCustomFields);
      this._reportCustomFields = reportCustomFields;

      const orderIds = [...new Set(this._lines.map((line) => line.orderId).filter(Boolean))];
      const [ordersRaw, prodRecordsRaw] = await Promise.all([
        Promise.all(orderIds.map((id) => getOrder(id).catch(() => null))),
        orderIds.length
          ? fetchProductionRecords({
            orderIds: orderIds.join(','),
            types: 'OUTSOURCE,REWORK,REWORK_REPORT',
            all: 'true',
          }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const orderMap = new Map();
      orderIds.forEach((id, index) => {
        if (ordersRaw[index]) orderMap.set(id, ordersRaw[index]);
      });
      const prodRecords = Array.isArray(prodRecordsRaw) ? prodRecordsRaw : [];

      const lineCards = buildWorkerReportDisplayLines(this._lines, {
        orderMap,
        productMap,
        categoryMap,
        dictionaries,
        config,
        prodRecords,
        globalNodes,
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
    const timestamp = entryDateAndTimeToIso(this.data.entryDate, this.data.entryTime);

    this.setData({ submitting: true });
    try {
      // 产品模式：按 productId×template×规格 合并后写 PMP，避免同一产品多工单重复写入
      if (this._productionLinkMode === 'product' || this._lines.some((l) => l.mode === 'product')) {
        const agg = new Map();
        for (let i = 0; i < this._lines.length; i += 1) {
          const line = this._lines[i];
          const productId = line.productId;
          const milestoneTemplateId =
            line.milestoneTemplateId || this._prefill.templateId || '';
          if (!productId || !milestoneTemplateId) continue;
          const meta = deserializeReportScanMeta(line.scanMeta);
          const entries = entriesFromQuantities(line.quantities, line.defectiveQuantities);
          entries.forEach((entry) => {
            const key = `${productId}|${milestoneTemplateId}|${entry.variantId || ''}`;
            const cur = agg.get(key) || {
              productId,
              milestoneTemplateId,
              variantId: entry.variantId || undefined,
              quantity: 0,
              defectiveQuantity: 0,
              meta,
            };
            cur.quantity += entry.quantity;
            cur.defectiveQuantity += entry.defectiveQuantity || 0;
            agg.set(key, cur);
          });
        }
        for (const item of agg.values()) {
          if (!(item.quantity > 0)) continue;
          const scanFields = buildReportScanPayloadFields(
            item.meta,
            item.variantId || null,
            customData || {},
          );
          await createProductReport({
            productId: item.productId,
            milestoneTemplateId: item.milestoneTemplateId,
            quantity: item.quantity,
            defectiveQuantity: item.defectiveQuantity > 0 ? item.defectiveQuantity : undefined,
            variantId: item.variantId,
            workerId: this.data.workerId,
            customData: scanFields.customData,
            reportBatchId: batchId,
            operator,
            timestamp,
            itemCodeId: scanFields.itemCodeId,
            virtualBatchId: scanFields.virtualBatchId,
            requireApproval: true,
          });
        }
      } else {
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
              timestamp,
              itemCodeId: scanFields.itemCodeId,
              virtualBatchId: scanFields.virtualBatchId,
              requireApproval: true,
            });
          }
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
