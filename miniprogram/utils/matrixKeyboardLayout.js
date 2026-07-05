/**
 * 矩阵自定义键盘：底部占位高度、滚动区把当前格滚到键盘上方
 */
const { readWindowMetrics } = require('./windowMetrics.js');

/** 键盘固定层高度（rpx，含工具栏 + 键区；safe-area 由组件 CSS 处理） */
const MATRIX_KEYBOARD_PADDING_RPX = 540;

function rpxToPx(rpx) {
  const win = readWindowMetrics();
  return Math.ceil((win.windowWidth / 750) * rpx);
}

function matrixKeyboardBottomInsetPx(extraRpx = 16) {
  const win = readWindowMetrics();
  return rpxToPx(MATRIX_KEYBOARD_PADDING_RPX + extraRpx) + (win.safeAreaBottom || 0);
}

/**
 * 键盘弹出后，将当前激活矩阵格滚到键盘上方可见区域
 * @param {WechatMiniprogram.Page.TrivialInstance} page
 * @param {{ scrollViewSelector: string; cellSelector?: string; reserveTopPx?: number }} opts
 */
function scrollMatrixCellAboveKeyboard(page, opts) {
  const scrollViewSelector = opts && opts.scrollViewSelector;
  if (!page || !scrollViewSelector) return;

  const cellSelector = (opts && opts.cellSelector) || '.plan-create-matrix__input--active';
  const reserveTopPx = (opts && opts.reserveTopPx) != null ? opts.reserveTopPx : 96;
  const keyboardPx = matrixKeyboardBottomInsetPx();

  const run = () => {
    const query = page.createSelectorQuery ? page.createSelectorQuery() : wx.createSelectorQuery();
    query.select(scrollViewSelector).scrollOffset();
    query.select(scrollViewSelector).boundingClientRect();
    query.select(cellSelector).boundingClientRect();
    query.exec((res) => {
      const offset = res && res[0];
      const svRect = res && res[1];
      const cellRect = res && res[2];
      if (!offset || !svRect || !cellRect) return;

      const win = readWindowMetrics();
      const visibleBottom = win.windowHeight - keyboardPx;
      const cellTopTarget = svRect.top + reserveTopPx;
      let nextTop = offset.scrollTop;

      if (cellRect.bottom > visibleBottom - 12) {
        nextTop = offset.scrollTop + (cellRect.bottom - visibleBottom) + 24;
      } else if (cellRect.top < cellTopTarget) {
        nextTop = Math.max(0, offset.scrollTop + (cellRect.top - cellTopTarget));
      } else {
        return;
      }

      page.setData({ matrixScrollTop: 0 }, () => {
        page.setData({ matrixScrollTop: nextTop });
      });
    });
  };

  wx.nextTick(() => {
    setTimeout(run, 60);
  });
}

/** setData 打开键盘后调用 */
function afterMatrixKeyboardOpen(page, scrollViewSelector, cellSelector) {
  scrollMatrixCellAboveKeyboard(page, { scrollViewSelector, cellSelector });
}

module.exports = {
  MATRIX_KEYBOARD_PADDING_RPX,
  matrixKeyboardBottomInsetPx,
  scrollMatrixCellAboveKeyboard,
  afterMatrixKeyboardOpen,
};
