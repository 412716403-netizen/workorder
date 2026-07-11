const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { request } = require('../../utils/request.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const { readNavBarMetrics, readWindowMetrics, computeFixedFooterInsetPx } = require('../../utils/windowMetrics.js');
const { buildOutsourceReceiveAggregates } = require('../utils/outsourceReceiveAggregates.js');
const { buildOutsourcePartnerOptions } = require('../utils/outsourcePartnerOptions.js');
const { mergePartnerIntoList } = require('../utils/mergePartnerList.js');
const { fetchOutsourceRecordsForPanel } = require('../utils/outsourceRecordsLoad.js');
const { fetchAllOrdersPaginated } = require('../utils/pendingStockBadge.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchNodesAll,
  fetchCategoriesAll,
  listProductProgressAll,
} = require('../utils/orderApi.js');
const { normalizeMasterList } = require('../utils/productionPlans.js');
const { createScanBatchController } = require('../utils/scanBatchController.js');
const { createOutsourceReceiveScanBatchHandlers } = require('../utils/scanBatchApplyOutsource.js');
const { loadTraceabilityScanEnabled } = require('../../utils/featurePlugins.js');

function computeHeaderBlockHeight(nav) {
  return nav.statusBarHeight + nav.navBarHeight;
}

function countPendingForPartner(rows, partnerName) {
  if (!partnerName) return 0;
  return (rows || []).filter((r) => (r.partner || '') === partnerName && r.pending > 0).length;
}

Page({
  data: {
    loading: true,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
    footerInsetPx: 120,
    scanPartnerName: '',
    partnerOptions: [],
    partnerCategories: [],
    pendingCount: 0,
    scanEnabled: false,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'production:outsource_receive:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    loadTraceabilityScanEnabled().then((scanEnabled) => {
      if (!scanEnabled) {
        wx.showToast({ title: '追溯码插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({ scanEnabled: true });
    });

    const outsourceScan = createOutsourceReceiveScanBatchHandlers(this);
    this._scanBatch = createScanBatchController(this, {
      title: '外协收货 · 批量扫码',
      showScanIntentToggle: true,
      guardBeforeIngest: () => {
        if (!this.data.scanPartnerName) {
          wx.showToast({ title: '请先选择加工厂', icon: 'none' });
          return false;
        }
        return true;
      },
      resolveRowPreview: (payload) => outsourceScan.resolveRowPreview(payload),
      onConfirm: (payloads) => outsourceScan.onConfirm(payloads),
    });

    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      footerInsetPx: computeFixedFooterInsetPx(128),
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onScanPartnerChange(e) {
    const name = (e.detail && e.detail.name) || '';
    this.setData({
      scanPartnerName: name,
      pendingCount: countPendingForPartner(this._allRows, name),
    });
  },

  onPartnerCreated(e) {
    const partner = e.detail && e.detail.partner;
    if (!partner || !partner.id) return;
    this._masterPartners = mergePartnerIntoList(this._masterPartners || [], partner);
    const partnerOptions = buildOutsourcePartnerOptions(this._allRows || [], this._masterPartners);
    this.setData({ partnerOptions });
  },

  onOpenScanTap() {
    if (!this.data.scanPartnerName) {
      wx.showToast({ title: '请先选择加工厂', icon: 'none' });
      return;
    }
    if (this._scanBatch) this._scanBatch.open();
  },

  onScanBatchClose() {
    if (this._scanBatch) this._scanBatch.close();
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

  async loadScanPartnerOptions() {
    try {
      const results = await Promise.all([
        request({ path: '/master/partners?all=true', method: 'GET' }).catch(() => []),
        request({ path: '/settings/partner-categories?all=true', method: 'GET' }).catch(() => []),
      ]);
      const partners = results[0];
      const categories = results[1];
      const master = normalizeListBody(partners);
      this._masterPartners = master;
      const partnerOptions = buildOutsourcePartnerOptions(
        this._allRows || [],
        master,
      );
      this.setData({
        partnerOptions,
        partnerCategories: normalizeListBody(categories),
      });
    } catch {
      /* ignore */
    }
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig().catch(() => ({}));
      this._productionLinkMode = config.productionLinkMode || 'order';
      const results = await Promise.all([
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchNodesAll(),
        fetchCategoriesAll(),
        listProductProgressAll().catch(() => []),
      ]);
      const orders = results[0];
      const productsRaw = results[1];
      const nodesRaw = results[2];
      const categoriesRaw = results[3];
      const pmpRaw = results[4];

      const products = normalizeMasterList(productsRaw);
      this._orders = orders || [];
      this._products = products;
      this._categories = normalizeMasterList(categoriesRaw);
      this._pmp = Array.isArray(pmpRaw) ? pmpRaw : [];
      const ordersById = new Map((orders || []).map((o) => [o.id, o]));
      const productsById = new Map(products.map((p) => [p.id, p]));
      this._nodes = normalizeMasterList(nodesRaw);
      const nodesById = new Map(this._nodes.map((n) => [n.id, n]));
      this._records = await fetchOutsourceRecordsForPanel({
        productionLinkMode: this._productionLinkMode,
        orders: orders || [],
        products,
      });
      this._allRows = buildOutsourceReceiveAggregates(
        this._records,
        ordersById,
        productsById,
        nodesById,
      ).filter((r) => r.pending > 0);

      const scanPartnerName = this.data.scanPartnerName;
      this.setData({
        loading: false,
        pendingCount: countPendingForPartner(this._allRows, scanPartnerName),
      });
      await this.loadScanPartnerOptions();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },
});
