/** 消息 Tab 角标（index=3：首页/应用/扫码/消息/我的） */

const MESSAGES_TAB_INDEX = 3;

function updateMessagesTabBadge(total) {
  const n = Number(total) || 0;
  if (n > 0) {
    wx.setTabBarBadge({
      index: MESSAGES_TAB_INDEX,
      text: n > 99 ? '99+' : String(n),
    });
  } else {
    wx.removeTabBarBadge({ index: MESSAGES_TAB_INDEX });
  }
}

module.exports = {
  MESSAGES_TAB_INDEX,
  updateMessagesTabBadge,
};
