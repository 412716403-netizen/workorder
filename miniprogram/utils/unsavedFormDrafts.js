/**
 * 未保存表单草稿清理（登录/登出、离开编辑页时统一调用）
 * 保留：仓库偏好、通知已读、扫码历史、分类默认单位等用户设置
 */
const EXACT_UNSAVED_KEYS = [
  'financeReconWorkDetail',
];

function clearUnsavedFormDrafts() {
  EXACT_UNSAVED_KEYS.forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch (_) {
      // ignore
    }
  });
}

module.exports = {
  clearUnsavedFormDrafts,
};
