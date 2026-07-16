/**
 * 矩阵自定义键盘：底部占位高度、滚动区把当前格滚到键盘上方
 *
 * 全局约定（所有挂 matrix-qty-keyboard 的页面共用）：
 * 1. 键盘组件不铺全屏 mask，表单在键盘弹出后仍可滚动
 * 2. 点空白收起：内容区 bindtap="onMatrixOutsideTap"；矩阵格 catchtap="onMatrixCellTap"
 *    （避免切格时冒泡收起）；「完成」或空白均走 confirm 收起
 * 3. 页面主 scroll-view：scroll-y + enhanced + scroll-top="{{matrixScrollTop}}"
 *    + scroll-with-animation="{{false}}"；内容区 class 加 matrix-keyboard-page--open
 * 4. 打开键盘后调用 afterMatrixKeyboardOpen(page, '.xxx-scroll')：
 *    仅按当前激活格微调 scrollTop，禁止 scroll-into-view 钉顶
 */
const { readWindowMetrics } = require('./windowMetrics.js');

/** 键盘固定层高度（rpx，含工具栏 + 键区；safe-area 由组件 CSS 处理） */
const MATRIX_KEYBOARD_PADDING_RPX = 580;

/** 格下方「最多 N」等提示预留 */
const CELL_BELOW_EXTRA_PX = 64;

function rpxToPx(rpx) {
  const win = readWindowMetrics();
  return Math.ceil((win.windowWidth / 750) * rpx);
}

function matrixKeyboardBottomInsetPx(extraRpx = 24) {
  const win = readWindowMetrics();
  return rpxToPx(MATRIX_KEYBOARD_PADDING_RPX + extraRpx) + (win.safeAreaBottom || 0);
}

/**
 * 兜底：数据绑定滚动（非 enhanced / 无 scrollTo 时）
 * 仅用 scroll-top，不用 scroll-into-view（into-view 会把格钉到顶部，最下格会「滚过头」）
 */
function applyMatrixScrollTopByData(page, nextTop) {
  const target = Math.max(0.01, Number(nextTop) || 0);
  const cur = Number(page.data.matrixScrollTop) || 0;
  const bump = Math.abs(cur - target) < 1 ? target + 1.5 : 0.01;
  const hasIntoView = Object.prototype.hasOwnProperty.call(page.data, 'matrixScrollIntoView');
  const patch = { matrixScrollTop: bump };
  if (hasIntoView) patch.matrixScrollIntoView = '';
  page.setData(patch, () => {
    page.setData({ matrixScrollTop: target });
  });
}

/**
 * 键盘弹出后，将当前激活矩阵格滚到键盘上方可见区域（仅微调，不钉顶）
 * @param {WechatMiniprogram.Page.TrivialInstance} page
 * @param {{ scrollViewSelector: string; cellSelector?: string; reserveTopPx?: number; attempt?: number }} opts
 */
function scrollMatrixCellAboveKeyboard(page, opts) {
  const scrollViewSelector = opts && opts.scrollViewSelector;
  if (!page || !scrollViewSelector) return;

  const cellSelector = (opts && opts.cellSelector) || '.plan-create-matrix__input--active';
  const reserveTopPx = (opts && opts.reserveTopPx) != null ? opts.reserveTopPx : 72;
  const attempt = (opts && opts.attempt) || 0;

  const run = () => {
    const query = page.createSelectorQuery ? page.createSelectorQuery() : wx.createSelectorQuery();
    query.select(scrollViewSelector).scrollOffset();
    query.select(scrollViewSelector).boundingClientRect();
    query.select(cellSelector).boundingClientRect();
    query.select(scrollViewSelector).node();
    query.exec((res) => {
      const offset = res && res[0];
      const svRect = res && res[1];
      const focusRect = res && res[2];
      const nodeRes = res && res[3];

      if (!offset || !svRect || !focusRect || !(focusRect.height > 0)) {
        if (attempt < 6) {
          setTimeout(() => {
            scrollMatrixCellAboveKeyboard(page, { ...opts, attempt: attempt + 1 });
          }, 60);
        }
        return;
      }

      const keyboardPx = matrixKeyboardBottomInsetPx();
      const win = readWindowMetrics();
      const keyboardTop = win.windowHeight - keyboardPx;
      const visibleBottom = Math.min(svRect.bottom, keyboardTop) - CELL_BELOW_EXTRA_PX;
      const visibleTop = svRect.top + reserveTopPx;
      let nextTop = offset.scrollTop;

      if (focusRect.bottom > visibleBottom) {
        // 格（及「最多 N」）被键盘挡住 → 上滚刚好露出
        nextTop = offset.scrollTop + (focusRect.bottom - visibleBottom);
      } else if (focusRect.top < visibleTop) {
        // 格被顶栏/可视区上沿裁切 → 略下滚，不钉到顶
        nextTop = Math.max(0, offset.scrollTop + (focusRect.top - visibleTop));
      } else {
        return;
      }

      const scrollNode = nodeRes && nodeRes.node;
      if (scrollNode && typeof scrollNode.scrollTo === 'function') {
        scrollNode.scrollTo({ top: Math.max(0, nextTop), animated: true });
        return;
      }

      applyMatrixScrollTopByData(page, nextTop);
    });
  };

  wx.nextTick(() => {
    setTimeout(run, attempt === 0 ? 160 : 50);
  });
}

/** setData 打开键盘后调用；scrollViewSelector 为页面纵向 scroll-view 的 class 选择器 */
function afterMatrixKeyboardOpen(page, scrollViewSelector, cellSelector) {
  if (page && page.data && Object.prototype.hasOwnProperty.call(page.data, 'matrixScrollIntoView')) {
    page.setData({ matrixScrollIntoView: '' });
  }
  scrollMatrixCellAboveKeyboard(page, { scrollViewSelector, cellSelector });
}

/**
 * 点矩阵输入格以外区域收起键盘（页面内容区 bindtap 调用）。
 * 复用各页 onMatrixKeyboardAction({ action: 'confirm' })，含校验/夹紧逻辑。
 */
function handleMatrixOutsideTap(page) {
  if (!page || !page.data || !page.data.matrixKeyboardVisible) return;
  if (typeof page.onMatrixKeyboardAction === 'function') {
    page.onMatrixKeyboardAction({ detail: { action: 'confirm' } });
  }
}

module.exports = {
  MATRIX_KEYBOARD_PADDING_RPX,
  matrixKeyboardBottomInsetPx,
  scrollMatrixCellAboveKeyboard,
  afterMatrixKeyboardOpen,
  handleMatrixOutsideTap,
};
