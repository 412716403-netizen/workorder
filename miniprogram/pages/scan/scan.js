const { readTenantCtx } = require('../../utils/session.js');
const { readHistory } = require('../../utils/scanHistory.js');
const { buildScanTypeEntries } = require('../../config/scanTypes.js');
const { buildScanSessionUrl } = require('../../utils/scanNav.js');

Page({
  data: {
    typeEntries: [],
    history: [],
    displayHistory: [],
    historyExpanded: false,
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
    this.setData({
      typeEntries: buildScanTypeEntries(ctx.permissions || []),
    });
    this.refreshHistory();

    const app = getApp();
    const preset = app.globalData && app.globalData.scanPreset;
    if (preset && preset.type) {
      app.globalData.scanPreset = null;
      const type = preset.type === 'stockIn' ? 'stock_in' : preset.type;
      const params = { type };
      if (preset.nodeId) {
        params.nodeId = preset.nodeId;
        params.nodeName = preset.nodeName || '';
      }
      wx.navigateTo({ url: buildScanSessionUrl(params) });
    }
  },

  refreshHistory() {
    const history = readHistory();
    const { historyExpanded } = this.data;
    this.setData({
      history,
      displayHistory: historyExpanded ? history : history.slice(0, 5),
    });
  },

  onTypeTap(e) {
    const { key, allowed } = e.currentTarget.dataset;
    if (!allowed) {
      wx.showToast({ title: '无权限使用该功能', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: buildScanSessionUrl({ type: key }) });
  },

  onToggleHistory() {
    const historyExpanded = !this.data.historyExpanded;
    const { history } = this.data;
    this.setData({
      historyExpanded,
      displayHistory: historyExpanded ? history : history.slice(0, 5),
    });
  },
});
