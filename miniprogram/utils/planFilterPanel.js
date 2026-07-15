/** 顶栏筛选面板：打开后短暂忽略 onPageScroll 触发的关闭（避免惯性滚动误关） */
function markFilterPanelOpen(page, ms = 400) {
  if (page) page._ignoreScrollCloseUntil = Date.now() + ms;
}

function shouldCloseFilterPanelOnScroll(page) {
  return Date.now() >= (page && page._ignoreScrollCloseUntil || 0);
}

module.exports = {
  markFilterPanelOpen,
  shouldCloseFilterPanelOnScroll,
};
