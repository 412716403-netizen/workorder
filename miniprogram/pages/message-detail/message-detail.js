const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

function decodeOpt(v) {
  if (v == null || v === '') return '';
  try {
    return decodeURIComponent(String(v));
  } catch {
    return String(v);
  }
}

Page({
  data: {
    title: '消息详情',
    body: '',
    tagLabel: '',
    tagTone: 'muted',
    timeText: '',
    scrollHeight: 600,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const win = readWindowMetrics();
    const rpx = (win.windowWidth || 375) / 750;
    const headerPx =
      (nav.statusBarHeight || 20) + (nav.navBarHeight || 44) + Math.round(28 * rpx);

    this.setData({
      scrollHeight: Math.max(200, (win.windowHeight || 667) - headerPx),
      title: decodeOpt(options.title) || '消息详情',
      body: decodeOpt(options.body) || '暂无内容',
      tagLabel: decodeOpt(options.tagLabel) || '',
      tagTone: decodeOpt(options.tagTone) || 'muted',
      timeText: decodeOpt(options.timeText) || '',
    });

    const ec = typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null;
    if (ec && typeof ec.on === 'function') {
      ec.on('messageDetailInit', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        this.setData({
          title: payload.title || this.data.title || '消息详情',
          body: payload.body || this.data.body || '暂无内容',
          tagLabel: payload.tagLabel || this.data.tagLabel || '',
          tagTone: payload.tagTone || this.data.tagTone || 'muted',
          timeText: payload.timeText || this.data.timeText || '',
        });
      });
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },
});
