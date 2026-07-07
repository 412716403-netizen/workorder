const { buildScanSessionUrl } = require('../../utils/scanNav.js');

/** 预备页已合并至会话页，保留路由仅作兼容跳转 */
Page({
  onLoad(options) {
    const scanType = options.type || '';
    if (!scanType) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({
      url: buildScanSessionUrl({ type: scanType }),
    });
  },
});
