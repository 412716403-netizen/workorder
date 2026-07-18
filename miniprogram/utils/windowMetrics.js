/** 读取窗口与安全区指标（优先新 API，兼容旧基础库） */
function readWindowMetrics() {
  if (typeof wx.getWindowInfo === 'function') {
    const win = wx.getWindowInfo();
    return {
      windowWidth: win.windowWidth || 375,
      windowHeight: win.windowHeight || 667,
      statusBarHeight: win.statusBarHeight || 20,
      safeAreaBottom: win.safeArea && win.screenHeight
        ? win.screenHeight - win.safeArea.bottom
        : 0,
    };
  }
  const sys = wx.getSystemInfoSync();
  return {
    windowWidth: sys.windowWidth || 375,
    windowHeight: sys.windowHeight || 667,
    statusBarHeight: sys.statusBarHeight || 20,
    safeAreaBottom: sys.safeArea ? sys.screenHeight - sys.safeArea.bottom : 0,
  };
}

function readNavBarMetrics() {
  try {
    const { statusBarHeight, windowWidth } = readWindowMetrics();
    const menu = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
    /** 顶栏右侧需预留的宽度，避免内容被微信胶囊遮挡 */
    const menuRightInset = Math.max(0, Math.ceil(windowWidth - menu.left + 8));
    return { statusBarHeight, navBarHeight, menuRightInset };
  } catch (err) {
    return { statusBarHeight: 20, navBarHeight: 44, menuRightInset: 96 };
  }
}

function rpxToPx(rpx) {
  const win = readWindowMetrics();
  return Math.ceil((win.windowWidth / 750) * rpx);
}

/** plan-header 仅标题栏（padding-bottom 28rpx） */
function computeSimplePlanHeaderHeight(nav) {
  return nav.statusBarHeight + nav.navBarHeight + rpxToPx(28);
}

/** plan-create-header（padding-bottom 12rpx） */
function computePlanCreateHeaderHeight(nav) {
  return nav.statusBarHeight + nav.navBarHeight + rpxToPx(12);
}

/** 订单编辑页双行底栏（合计 + 删除/保存） */
const PO_EDIT_FOOTER_RPX = 200;

/** 固定底栏占位（如外协确认「确认发出」） */
function computeFixedFooterInsetPx(footerRpx = 128) {
  const win = readWindowMetrics();
  return rpxToPx(footerRpx) + (win.safeAreaBottom || 0);
}

function computePoEditFooterInsetPx() {
  return computeFixedFooterInsetPx(PO_EDIT_FOOTER_RPX);
}

module.exports = {
  readWindowMetrics,
  readNavBarMetrics,
  rpxToPx,
  computeSimplePlanHeaderHeight,
  computePlanCreateHeaderHeight,
  computeFixedFooterInsetPx,
  computePoEditFooterInsetPx,
  PO_EDIT_FOOTER_RPX,
};
