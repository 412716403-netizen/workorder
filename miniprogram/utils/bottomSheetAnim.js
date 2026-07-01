/** 底部弹层滑入/滑出（对齐系统 picker 动效） */

const SHEET_ANIM_MS = 300;

function openBottomSheet(ctx, resetData) {
  if (ctx._sheetCloseTimer) {
    clearTimeout(ctx._sheetCloseTimer);
    ctx._sheetCloseTimer = null;
  }
  const payload = { open: true, sheetShow: false };
  if (resetData && typeof resetData === 'object') {
    Object.keys(resetData).forEach((key) => {
      payload[key] = resetData[key];
    });
  }
  ctx.setData(payload);
  ctx._sheetOpenTimer = setTimeout(() => {
    ctx.setData({ sheetShow: true });
    ctx._sheetOpenTimer = null;
  }, 30);
}

function closeBottomSheet(ctx, resetData) {
  if (ctx._sheetOpenTimer) {
    clearTimeout(ctx._sheetOpenTimer);
    ctx._sheetOpenTimer = null;
  }
  if (!ctx.data.open) return;
  ctx.setData({ sheetShow: false });
  ctx._sheetCloseTimer = setTimeout(() => {
    const payload = { open: false, sheetShow: false };
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
  if (ctx._sheetOpenTimer) {
    clearTimeout(ctx._sheetOpenTimer);
    ctx._sheetOpenTimer = null;
  }
  if (ctx._sheetCloseTimer) {
    clearTimeout(ctx._sheetCloseTimer);
    ctx._sheetCloseTimer = null;
  }
}

module.exports = {
  SHEET_ANIM_MS,
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
};
