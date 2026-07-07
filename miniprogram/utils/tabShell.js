/** Tab 页顶栏安全区：内容顶对齐微信胶囊，蓝色背景延伸至屏幕顶部 */
const { readWindowMetrics } = require('./windowMetrics.js');

function readTabShellInsets() {
  try {
    const { windowWidth, statusBarHeight } = readWindowMetrics();
    const menu = wx.getMenuButtonBoundingClientRect();
    return {
      headerPaddingTop: menu.top || statusBarHeight + 4,
      headerPaddingRight: windowWidth - menu.left + 10,
    };
  } catch (err) {
    return {
      headerPaddingTop: 48,
      headerPaddingRight: 28,
    };
  }
}

module.exports = {
  readTabShellInsets,
};
