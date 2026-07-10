const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics } = require('../../utils/windowMetrics.js');
const {
  listReportHistory,
  approveReport,
  rejectReport,
  fetchProductsAll,
} = require('../utils/orderApi.js');
const {
  mapOrderReportRow,
  mapProductReportRow,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
} = require('../utils/orderReportHistory.js');

function canApprove(permissions) {
  return (
    hasPermission(permissions, 'production:orders_report_records:edit') ||
    hasPermission(permissions, 'production')
  );
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    loading: false,
    rows: [],
    actingId: '',
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

  async reload() {
    this.setData({ loading: true });
    try {
      // 默认当天待审
      const range = (() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return { start: today, end: today };
      })();
      const [hist, products] = await Promise.all([
        listReportHistory({
          startDate: dateInputToIsoStart(range.start),
          endDate: dateInputToIsoEndExclusive(range.end),
          approvalStatus: 'PENDING',
          productionLinkMode: 'product',
        }),
        fetchProductsAll().catch(() => []),
      ]);
      const productMap = new Map((products || []).map((p) => [p.id, p]));
      const orderRows = (hist.orderReports || []).map((r, idx) => ({
        ...mapOrderReportRow(r, idx, {
          isGlobalMode: true,
          productionLinkMode: 'order',
          productMap,
        }),
        reportId: r.reportId,
        source: 'order',
      }));
      const pmpRows = (hist.productReports || []).map((r, idx) => ({
        ...mapProductReportRow(r, idx, { productMap }),
        reportId: r.reportId,
        source: 'pmp',
      }));
      const rows = orderRows
        .concat(pmpRows)
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      this.setData({ rows });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onApprove(e) {
    const reportId = e.currentTarget.dataset.id;
    if (!reportId || this.data.actingId) return;
    this.setData({ actingId: reportId });
    try {
      await approveReport(reportId);
      wx.showToast({ title: '已通过', icon: 'success' });
      await this.reload();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '审核失败', icon: 'none' });
    } finally {
      this.setData({ actingId: '' });
    }
  },

  async onReject(e) {
    const reportId = e.currentTarget.dataset.id;
    if (!reportId || this.data.actingId) return;
    this.setData({ actingId: reportId });
    try {
      await rejectReport(reportId);
      wx.showToast({ title: '已驳回', icon: 'success' });
      await this.reload();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '驳回失败', icon: 'none' });
    } finally {
      this.setData({ actingId: '' });
    }
  },
});
