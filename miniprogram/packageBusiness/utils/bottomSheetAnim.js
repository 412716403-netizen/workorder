/** 底部弹层滑入/滑出（对齐系统 picker 动效） */
const { readWindowMetrics } = require('../../utils/windowMetrics.js');

const SHEET_ANIM_MS = 300;
const SHEET_HEIGHT_RATIO = 0.85;
const PICKER_HEIGHT_RATIO = 0.75;

function computeSheetHeightPx(picker) {
  const win = readWindowMetrics();
  const ratio = picker ? PICKER_HEIGHT_RATIO : SHEET_HEIGHT_RATIO;
  return Math.round((win.windowHeight || 667) * ratio);
}

function clearOpenTimers(ctx) {
  if (ctx._sheetOpenTimer) {
    clearTimeout(ctx._sheetOpenTimer);
    ctx._sheetOpenTimer = null;
  }
}

function openBottomSheet(ctx, resetData, opts) {
  if (ctx._sheetCloseTimer) {
    clearTimeout(ctx._sheetCloseTimer);
    ctx._sheetCloseTimer = null;
  }
  clearOpenTimers(ctx);

  const picker = Boolean(opts && opts.picker);
  const sheetHeightPx = computeSheetHeightPx(picker);
  const payload = {
    open: true,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx,
  };
  if (resetData && typeof resetData === 'object') {
    Object.keys(resetData).forEach((key) => {
      payload[key] = resetData[key];
    });
  }

  ctx.setData(payload, () => {
    const startAnim = () => {
      ctx.setData({ sheetMotion: true });
      ctx._sheetOpenTimer = setTimeout(() => {
        ctx.setData({ sheetShow: true });
        ctx._sheetOpenTimer = null;
      }, 20);
    };
    if (typeof wx.nextTick === 'function') {
      wx.nextTick(startAnim);
    } else {
      startAnim();
    }
  });

}

function closeBottomSheet(ctx, resetData) {
  clearOpenTimers(ctx);
  if (!ctx.data.open) return;
  ctx.setData({ sheetShow: false, sheetMotion: true });
  ctx._sheetCloseTimer = setTimeout(() => {
    const payload = {
      open: false,
      sheetShow: false,
      sheetMotion: false,
      sheetHeightPx: 0,
    };
    if (resetData && typeof resetData === 'object') {
      Object.keys(resetData).forEach((key) => {
        payload[key] = resetData[key];
      });
    }
    ctx.setData(payload);
    ctx._sheetCloseTimer = null;
  }, SHEET_ANIM_MS);
}

function clearBottomSheetTimers(ctx) {
  clearOpenTimers(ctx);
  if (ctx._sheetCloseTimer) {
    clearTimeout(ctx._sheetCloseTimer);
    ctx._sheetCloseTimer = null;
  }
}

module.exports = {
  SHEET_ANIM_MS,
  computeSheetHeightPx,
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
};
