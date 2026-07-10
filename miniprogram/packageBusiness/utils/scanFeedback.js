/** 批量扫码：页内提示（2s）+ 提示音/震动 */

const FEEDBACK_MS = 2000;
const SUCCESS_SOUND = '/assets/sounds/scan-success.wav';
const ERROR_SOUND = '/assets/sounds/scan-error.wav';

let hideTimer = null;

function playScanSound(type) {
  const src = type === 'success' ? SUCCESS_SOUND : ERROR_SOUND;
  try {
    const audio = wx.createInnerAudioContext();
    audio.src = src;
    audio.volume = type === 'success' ? 0.45 : 0.55;
    const destroy = () => {
      try {
        audio.destroy();
      } catch {
        /* ignore */
      }
    };
    audio.onEnded(destroy);
    audio.onError(destroy);
    audio.play();
  } catch {
    /* 无音频能力时静默降级 */
  }
}

function vibrateOnScanResult(type) {
  if (!wx.vibrateShort) return;
  if (type === 'success') {
    wx.vibrateShort({ type: 'medium' });
    return;
  }
  wx.vibrateShort({ type: 'heavy' });
}

function showScanFeedback(page, message, type = 'error') {
  if (!page || !message) return;
  const safeType = type === 'success' ? 'success' : 'error';
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  page.setData({
    scanFeedbackText: String(message),
    scanFeedbackType: safeType,
  });
  playScanSound(safeType);
  vibrateOnScanResult(safeType);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (page && typeof page.setData === 'function') {
      page.setData({ scanFeedbackText: '', scanFeedbackType: '' });
    }
  }, FEEDBACK_MS);
}

function notifyScanFail(page, message) {
  showScanFeedback(page, message || '扫码失败', 'error');
}

function notifyScanSuccess(page, message) {
  if (message) showScanFeedback(page, message, 'success');
  else {
    playScanSound('success');
    vibrateOnScanResult('success');
  }
}

function attachScanNotify(page) {
  page._scanNotify = (message, type) => {
    if (type === 'success') notifyScanSuccess(page, message);
    else notifyScanFail(page, message);
  };
}

/** 批量扫码业务层统一失败提示（优先走页内 2s 条 + 提示音） */
function scanFail(page, message) {
  if (page && page._scanNotify) {
    page._scanNotify(message, 'error');
    return;
  }
  notifyScanFail(page, message);
}

module.exports = {
  FEEDBACK_MS,
  showScanFeedback,
  notifyScanFail,
  notifyScanSuccess,
  attachScanNotify,
  scanFail,
  playScanSound,
};
