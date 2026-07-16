/** 底部弹层滑入/滑出（对齐系统 picker 动效） */
const { readWindowMetrics } = require('./windowMetrics.js');

const SHEET_ANIM_MS = 300;
const SHEET_HEIGHT_RATIO = 0.85;
const PICKER_HEIGHT_RATIO = 0.75;
/** 创建时间 / 单据分类 / 收支账户 选择底栏统一高度（约 55% 屏高） */
const DATETIME_SHEET_HEIGHT_RATIO = 0.55;
const TAG_PICKER_HEIGHT_RATIO = DATETIME_SHEET_HEIGHT_RATIO;
const LIST_PICKER_HEIGHT_RATIO = DATETIME_SHEET_HEIGHT_RATIO;

function computeSheetHeightPx(picker, heightRatio) {
  const win = readWindowMetrics();
  let ratio = SHEET_HEIGHT_RATIO;
  if (typeof heightRatio === 'number' && heightRatio > 0 && heightRatio <= 1) {
    ratio = heightRatio;
  } else if (picker) {
    ratio = PICKER_HEIGHT_RATIO;
  }
  return Math.round((win.windowHeight || 667) * ratio);
}

function clearOpenTimers(ctx) {
  if (ctx._sheetOpenTimer) {
    clearTimeout(ctx._sheetOpenTimer);
    ctx._sheetOpenTimer = null;
  }
}

/** 当前页面：底栏选择器打开时隐藏「保存单据 / 确认报工」等 fixed footer */
function getCurrentPage() {
  try {
    if (typeof getCurrentPages !== 'function') return null;
    const pages = getCurrentPages();
    return pages && pages.length ? pages[pages.length - 1] : null;
  } catch (_) {
    return null;
  }
}

function bumpPagePickerSheet(delta) {
  const page = getCurrentPage();
  if (!page || typeof page.setData !== 'function') return;
  const next = Math.max(0, (page._pickerSheetDepth || 0) + delta);
  page._pickerSheetDepth = next;
  const open = next > 0;
  if (page.data && page.data.pickerSheetOpen === open) return;
  page.setData({ pickerSheetOpen: open });
}

function holdPagePickerSheet(ctx) {
  if (!ctx || ctx._pagePickerSheetHeld) return;
  ctx._pagePickerSheetHeld = true;
  bumpPagePickerSheet(1);
}

function releasePagePickerSheet(ctx) {
  if (!ctx || !ctx._pagePickerSheetHeld) return;
  ctx._pagePickerSheetHeld = false;
  bumpPagePickerSheet(-1);
}

function openBottomSheet(ctx, resetData, opts) {
  if (ctx._sheetCloseTimer) {
    clearTimeout(ctx._sheetCloseTimer);
    ctx._sheetCloseTimer = null;
  }
  clearOpenTimers(ctx);

  // 收起页面其它 input 的系统键盘，避免遮挡底栏选择器
  if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
    try {
      wx.hideKeyboard();
    } catch (_) {
      /* ignore */
    }
  }

  holdPagePickerSheet(ctx);

  const picker = Boolean(opts && opts.picker);
  const heightRatio = opts && typeof opts.heightRatio === 'number' ? opts.heightRatio : undefined;
  const sheetHeightPx = computeSheetHeightPx(picker, heightRatio);
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
    releasePagePickerSheet(ctx);
  }, SHEET_ANIM_MS);
}

function clearBottomSheetTimers(ctx) {
  clearOpenTimers(ctx);
  if (ctx._sheetCloseTimer) {
    clearTimeout(ctx._sheetCloseTimer);
    ctx._sheetCloseTimer = null;
  }
  releasePagePickerSheet(ctx);
}

module.exports = {
  SHEET_ANIM_MS,
  SHEET_HEIGHT_RATIO,
  PICKER_HEIGHT_RATIO,
  TAG_PICKER_HEIGHT_RATIO,
  LIST_PICKER_HEIGHT_RATIO,
  DATETIME_SHEET_HEIGHT_RATIO,
  computeSheetHeightPx,
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
};
