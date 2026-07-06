const { formatLocalDateTimeZh } = require('../../utils/flowDocSortLite.js');
const { formatMoney } = require('../../utils/financeReconciliation.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

const WORK_DETAIL_STORAGE_KEY = 'financeReconWorkDetail';

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 8);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function mapDetail(raw) {
  if (!raw) return null;
  const items = (raw.items || []).map((item, index) => ({
    index,
    orderNumber: item.orderNumber || '—',
    productName: item.productName || '—',
    milestoneName: item.milestoneName || '—',
    quantityText: String(Number(item.quantity) || 0),
    rateText: formatMoney(item.rate),
    amountText: formatMoney(item.amount),
  }));
  const ts = raw.timestamp ? formatLocalDateTimeZh(new Date(raw.timestamp)) : '—';
  return {
    reportNo: raw.reportNo || '—',
    workerName: raw.workerName || '—',
    timestampText: ts,
    amountText: formatMoney(raw.amount),
    items,
  };
}

Page({
  data: {
    detail: null,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
  },

  onLoad() {
    const nav = readNavBarMetrics();
    let raw = null;
    try {
      raw = wx.getStorageSync(WORK_DETAIL_STORAGE_KEY) || null;
      wx.removeStorageSync(WORK_DETAIL_STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      detail: mapDetail(raw),
    });
  },

  onHeaderBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/apps/apps' }) });
  },
});
