const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics } = require('../../utils/windowMetrics.js');
const {
  listReportHistory,
  approveReport,
  rejectReport,
  fetchProductsAll,
  fetchTenantConfig,
} = require('../utils/orderApi.js');
const {
  mapOrderReportRow,
  mapProductReportRow,
} = require('../utils/orderReportHistory.js');

function canApprove(permissions) {
  return (
    hasPermission(permissions, 'production:orders_report_records:edit') ||
    hasPermission(permissions, 'production')
  );
}

function enrichPendingRow(row, raw) {
  const showOrderNumber = row.showOrderNumber && row.orderNumber;
  const orderHeadline = showOrderNumber
    ? `${row.orderNumber} · ${row.milestoneName}`
    : row.milestoneName;
  const batchKey = raw.reportBatchId || raw.reportId || row.id;
  return Object.assign({}, row, {
    reportId: raw.reportId || row.reportId || row.id,
    batchKey,
    orderHeadline,
    showReportNo: Boolean(raw.reportNo || row.reportNo),
    reportNo: raw.reportNo || row.reportNo || '',
    goodQty: Number(row.goodQty) || Number(raw.quantity) || 0,
    defectiveQty: Number(row.defectiveQty) || Number(raw.defectiveQuantity) || 0,
  });
}

function groupPendingBatches(flatRows) {
  const map = new Map();
  (flatRows || []).forEach((row) => {
    const key = row.batchKey || row.reportId;
    if (!map.has(key)) {
      map.set(key, {
        batchKey: key,
        reportIds: [],
        timeLabel: row.timeLabel,
        timestampMs: row.timestampMs || 0,
        showReportNo: row.showReportNo,
        reportNo: row.reportNo,
        orderHeadline: row.orderHeadline,
        productName: row.productName,
        productSku: row.productSku,
        showProductSku: row.showProductSku,
        productImageUrl: row.productImageUrl,
        showProductImage: row.showProductImage,
        placeholderIconSrc: row.placeholderIconSrc,
        showDefective: false,
        defectiveQty: 0,
        goodQty: 0,
        checked: false,
      });
    }
    const group = map.get(key);
    group.reportIds.push(row.reportId);
    group.goodQty += Number(row.goodQty) || 0;
    const defective = Number(row.defectiveQty) || 0;
    if (defective > 0) {
      group.showDefective = true;
      group.defectiveQty += defective;
    }
  });
  return Array.from(map.values())
    .map((group) => ({
      ...group,
      goodQtyText: `${group.goodQty} 件`,
      defectiveText: group.showDefective ? `不良 ${group.defectiveQty}` : '',
    }))
    .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    loading: false,
    rows: [],
    selectedCount: 0,
    allSelected: false,
    actingBatchKey: '',
    batchActing: false,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
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
    const role = ctx.tenantRole;
    if (role !== 'owner' && !canApprove(ctx.permissions || [])) {
      wx.showToast({ title: '无审核权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.reload();
  },

  onPullDownRefresh() {
    this.reload()
      .catch(() => {})
      .finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/apps/apps' }) });
  },

  syncSelectionUi() {
    const selected = this._selected || {};
    const rows = (this._allRows || []).map((row) => ({
      ...row,
      checked: Boolean(selected[row.batchKey]),
    }));
    const selectedCount = Object.keys(selected).length;
    const allSelected = rows.length > 0 && selectedCount === rows.length;
    this.setData({ rows, selectedCount, allSelected });
  },

  onToggleSelect(e) {
    const batchKey = e.currentTarget.dataset.batchKey;
    this.toggleBatchSelection(batchKey);
  },

  onToggleSelectAll() {
    const rows = this._allRows || [];
    if (!rows.length) return;
    const selected = this._selected || {};
    const allSelected = rows.every((row) => selected[row.batchKey]);
    if (allSelected) {
      this._selected = {};
    } else {
      this._selected = rows.reduce((acc, row) => {
        acc[row.batchKey] = true;
        return acc;
      }, {});
    }
    this.syncSelectionUi();
  },

  toggleBatchSelection(batchKey) {
    if (!batchKey) return;
    const selected = { ...(this._selected || {}) };
    if (selected[batchKey]) delete selected[batchKey];
    else selected[batchKey] = true;
    this._selected = selected;
    this.syncSelectionUi();
  },

  collectReportIds(batchKeys) {
    const keySet = new Set(batchKeys || []);
    const ids = [];
    (this._allRows || []).forEach((row) => {
      if (!keySet.has(row.batchKey)) return;
      row.reportIds.forEach((id) => {
        if (id) ids.push(id);
      });
    });
    return [...new Set(ids)];
  },

  confirmReview(action, count) {
    const verb = action === 'approve' ? '通过' : '驳回';
    return new Promise((resolve) => {
      wx.showModal({
        title: `确认${verb}`,
        content: count > 1 ? `确定批量${verb} ${count} 条待审报工？` : `确定${verb}该条报工？`,
        confirmColor: action === 'approve' ? '#2f6bff' : '#ff4d4f',
        success: (res) => resolve(!!res.confirm),
      });
    });
  },

  async runReviewAction(batchKeys, action) {
    if (!batchKeys.length || this.data.batchActing || this.data.actingBatchKey) return;
    const reportIds = this.collectReportIds(batchKeys);
    if (!reportIds.length) {
      wx.showToast({ title: '报工记录无效', icon: 'none' });
      return;
    }
    const confirmed = await this.confirmReview(action, batchKeys.length);
    if (!confirmed) return;

    const singleKey = batchKeys.length === 1 ? batchKeys[0] : '';
    this.setData({
      batchActing: batchKeys.length > 1,
      actingBatchKey: singleKey,
    });
    try {
      for (const reportId of reportIds) {
        if (action === 'approve') await approveReport(reportId);
        else await rejectReport(reportId);
      }
      wx.showToast({
        title: action === 'approve' ? '已通过' : '已驳回',
        icon: 'success',
      });
      this._selected = {};
      await this.reload();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '审核失败', icon: 'none' });
    } finally {
      this.setData({ batchActing: false, actingBatchKey: '' });
    }
  },

  onApprove(e) {
    const batchKey = e.currentTarget.dataset.batchKey;
    if (!batchKey) return;
    void this.runReviewAction([batchKey], 'approve');
  },

  onReject(e) {
    const batchKey = e.currentTarget.dataset.batchKey;
    if (!batchKey) return;
    void this.runReviewAction([batchKey], 'reject');
  },

  onBatchApprove() {
    const batchKeys = Object.keys(this._selected || {});
    if (!batchKeys.length || this.data.batchActing) return;
    void this.runReviewAction(batchKeys, 'approve');
  },

  onBatchReject() {
    const batchKeys = Object.keys(this._selected || {});
    if (!batchKeys.length || this.data.batchActing) return;
    void this.runReviewAction(batchKeys, 'reject');
  },

  async reload() {
    this.setData({ loading: true });
    try {
      const [config, products] = await Promise.all([
        fetchTenantConfig().catch(() => ({})),
        fetchProductsAll().catch(() => []),
      ]);
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      const hist = await listReportHistory({
        approvalStatus: 'PENDING',
        productionLinkMode,
      });
      const productMap = new Map((products || []).map((p) => [p.id, p]));
      const orderRows = (hist.orderReports || []).map((r, idx) =>
        enrichPendingRow(
          mapOrderReportRow(r, idx, {
            isGlobalMode: true,
            productionLinkMode,
            productMap,
          }),
          r,
        ),
      );
      const pmpRows = (hist.productReports || []).map((r, idx) =>
        enrichPendingRow(mapProductReportRow(r, idx, { productMap }), r),
      );
      this._allRows = groupPendingBatches(orderRows.concat(pmpRows));
      const keySet = new Set(this._allRows.map((row) => row.batchKey));
      const nextSelected = {};
      Object.keys(this._selected || {}).forEach((key) => {
        if (keySet.has(key)) nextSelected[key] = true;
      });
      this._selected = nextSelected;
      this.syncSelectionUi();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onDetailTap(e) {
    const batchKey = e.currentTarget.dataset.batchKey;
    if (!batchKey) {
      wx.showToast({ title: '无法打开详情', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/packageBusiness/production-order-report-batch-detail/production-order-report-batch-detail?batchKey=${encodeURIComponent(batchKey)}&review=1`,
    });
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this._allRows = (this._allRows || []).map((row) => {
      if (row.batchKey !== key) return row;
      return { ...row, showProductImage: false, productImageUrl: '' };
    });
    this.syncSelectionUi();
  },
});
