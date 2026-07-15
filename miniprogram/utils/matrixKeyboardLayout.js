/**
 * 矩阵自定义键盘：底部占位高度、滚动区把当前格滚到键盘上方
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

function activeCellScrollIntoViewId(page) {
  const id = page && page.data && page.data.activeMatrixVariantId;
  return id ? `mqk-cell-${id}` : '';
}

/** 兜底：数据绑定方式滚动（scroll-view 未开 enhanced 时） */
function applyMatrixScrollTopByData(page, nextTop, intoViewId) {
  const target = Math.max(0.01, Number(nextTop) || 0);
  const cur = Number(page.data.matrixScrollTop) || 0;
  const bump = Math.abs(cur - target) < 1 ? target + 1.5 : 0.01;
  const hasIntoView = Object.prototype.hasOwnProperty.call(page.data, 'matrixScrollIntoView');
  const patch = { matrixScrollTop: bump };
  if (hasIntoView) patch.matrixScrollIntoView = '';
  page.setData(patch, () => {
    if (intoViewId && hasIntoView) {
      // scroll-into-view 优先级高于 scroll-top，二者只用其一
      page.setData({ matrixScrollIntoView: intoViewId });
    } else {
      page.setData({ matrixScrollTop: target });
    }
  });
}

/**
 * 键盘弹出后，将当前激活矩阵格滚到键盘上方可见区域
 * @param {WechatMiniprogram.Page.TrivialInstance} page
 * @param {{ scrollViewSelector: string; cellSelector?: string; reserveTopPx?: number; attempt?: number }} opts
 */
function scrollMatrixCellAboveKeyboard(page, opts) {
  const scrollViewSelector = opts && opts.scrollViewSelector;
  if (!page || !scrollViewSelector) return;

  const cellSelector = (opts && opts.cellSelector) || '.plan-create-matrix__input--active';
  const reserveTopPx = (opts && opts.reserveTopPx) != null ? opts.reserveTopPx : 72;
  const attempt = (opts && opts.attempt) || 0;
  // 整块锚点（如处理数量卡片）优先顶到可视区上部
  const preferTopAlign = typeof cellSelector === 'string' && cellSelector.indexOf('anchor') >= 0;

  const run = () => {
    const query = page.createSelectorQuery ? page.createSelectorQuery() : wx.createSelectorQuery();
    query.select(scrollViewSelector).scrollOffset();
    query.select(scrollViewSelector).boundingClientRect();
    query.select(cellSelector).boundingClientRect();
    query.select(preferTopAlign ? '.plan-create-matrix__input--active' : cellSelector).boundingClientRect();
    query.select(scrollViewSelector).node();
    query.exec((res) => {
      const offset = res && res[0];
      const svRect = res && res[1];
      const anchorRect = res && res[2];
      const activeRect = res && res[3];
      const nodeRes = res && res[4];
      const focusRect = activeRect && activeRect.height > 0 ? activeRect : anchorRect;

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
      const cellTopTarget = svRect.top + reserveTopPx;
      let nextTop = offset.scrollTop;

      if (preferTopAlign && anchorRect && anchorRect.height > 0) {
        // 数量卡片顶到滚动区上方，避免上方长列表占满可视高度
        nextTop = Math.max(0, offset.scrollTop + (anchorRect.top - cellTopTarget));
        if (focusRect.bottom > visibleBottom) {
          nextTop += focusRect.bottom - visibleBottom;
        }
      } else if (focusRect.bottom > visibleBottom) {
        nextTop = offset.scrollTop + (focusRect.bottom - visibleBottom);
      } else if (focusRect.top < cellTopTarget) {
        nextTop = Math.max(0, offset.scrollTop + (focusRect.top - cellTopTarget));
      } else {
        return;
      }

      const scrollNode = nodeRes && nodeRes.node;
      if (scrollNode && typeof scrollNode.scrollTo === 'function') {
        // enhanced scroll-view：命令式滚动，不依赖 scroll-top 数据变化
        scrollNode.scrollTo({ top: Math.max(0, nextTop), animated: true });
        return;
      }

      applyMatrixScrollTopByData(
        page,
        nextTop,
        preferTopAlign ? '' : activeCellScrollIntoViewId(page)
      );
    });
  };

  wx.nextTick(() => {
    setTimeout(run, attempt === 0 ? 160 : 50);
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
