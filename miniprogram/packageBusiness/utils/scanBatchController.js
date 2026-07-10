/**
 * 页内批量扫码会话：先扫入列表，确认后由业务 onConfirm 累加/跳转（对齐 Web ScanBatchSessionModal）
 */
const { parseScanPayload, getUnrecognizedScanImeHint } = require('./scanPayload.js');
const { normalizeScanPayloadForIntent } = require('./scanBatchIntent.js');
const { rowDisplayLine } = require('./scanBatchRowDetail.js');
const {
  notifyScanFail,
  notifyScanSuccess,
} = require('./scanFeedback.js');

function rowKey(payload) {
  return `${payload.kind}:${payload.token || ''}`;
}

function nextRowId() {
  return `scan-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * @param {WechatMiniprogram.Page.Instance} page
 * @param {{
 *   title?: string;
 *   hint?: string;
 *   showScanIntentToggle?: boolean;
 *   defaultScanIntent?: 'BATCH'|'ITEM';
 *   guardBeforeIngest?: () => boolean;
 *   resolveRowPreview: (payload: object) => Promise<object|null>;
 *   onConfirm: (payloads: object[]) => Promise<boolean|void>;
 * }} options
 */
function createScanBatchController(page, options) {
  const {
    title = '批量扫码',
    hint = '',
    showScanIntentToggle = false,
    defaultScanIntent = 'BATCH',
    guardBeforeIngest,
    resolveRowPreview,
    onConfirm,
  } = options;

  const state = {
    rows: [],
    keys: new Set(),
    scanIntent: defaultScanIntent,
    processing: false,
    scanning: false,
    lastNotifyAt: 0,
  };

  page._scanNotify = (message, type) => {
    state.lastNotifyAt = Date.now();
    if (type === 'success') notifyScanSuccess(page, message);
    else notifyScanFail(page, message);
  };

  page.setData({ scanFeedbackText: '', scanFeedbackType: '' });

  function syncToPage() {
    page.setData({
      scanBatchRows: state.rows.map((r) => ({
        ...r,
        displayLine: rowDisplayLine(r.detail),
      })),
      scanBatchProcessing: state.processing,
      scanBatchTitle: title,
      scanBatchHint: hint,
      scanBatchShowIntentToggle: showScanIntentToggle,
      scanBatchIntent: state.scanIntent,
    });
  }

  function markNotified() {
    state.lastNotifyAt = Date.now();
  }

  function open() {
    state.rows = [];
    state.keys.clear();
    state.scanIntent = defaultScanIntent;
    page.setData({ scanBatchOpen: true, scanFeedbackText: '', scanFeedbackType: '' });
    syncToPage();
  }

  function close() {
    page.setData({ scanBatchOpen: false, scanBatchProcessing: false, scanFeedbackText: '', scanFeedbackType: '' });
  }

  function removeRow(id) {
    const idx = state.rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const row = state.rows[idx];
    state.keys.delete(rowKey(row.payload));
    state.rows.splice(idx, 1);
    syncToPage();
  }

  function setScanIntent(intent) {
    if (intent !== 'BATCH' && intent !== 'ITEM') return;
    state.scanIntent = intent;
    syncToPage();
  }

  async function ingestRaw(raw) {
    const code = String(raw || '').trim();
    if (!code || state.processing) return;
    if (guardBeforeIngest && !guardBeforeIngest()) return;

    const parsed = parseScanPayload(code);
    if (parsed.kind === 'UNKNOWN' || !parsed.token) {
      markNotified();
      notifyScanFail(page, '无法识别扫码内容');
      const imeHint = getUnrecognizedScanImeHint(code);
      if (imeHint) {
        setTimeout(() => notifyScanFail(page, imeHint), 2100);
      }
      return;
    }

    state.processing = true;
    syncToPage();

    try {
      const normalized = await normalizeScanPayloadForIntent(state.scanIntent, parsed);
      if (!normalized.ok) {
        markNotified();
        notifyScanFail(page, normalized.message || '扫码失败');
        return;
      }
      const payload = normalized.payload;
      const key = rowKey(payload);
      if (state.keys.has(key)) {
        markNotified();
        notifyScanFail(page, '该码已在列表中');
        return;
      }

      const notifyBefore = state.lastNotifyAt;
      const detail = await resolveRowPreview(payload);
      if (!detail) {
        if (state.lastNotifyAt === notifyBefore) {
          notifyScanFail(page, '扫码失败');
        }
        return;
      }

      state.keys.add(key);
      state.rows.push({ id: nextRowId(), payload, detail });
      notifyScanSuccess(page);
      syncToPage();
    } finally {
      state.processing = false;
      syncToPage();
    }
  }

  async function confirm() {
    if (state.processing) return false;
    if (!state.rows.length) {
      notifyScanFail(page, '请先扫码');
      return false;
    }
    state.processing = true;
    syncToPage();
    try {
      const payloads = state.rows.map((r) => r.payload);
      const result = await onConfirm(payloads);
      if (result !== false) {
        close();
        state.rows = [];
        state.keys.clear();
        return true;
      }
      return false;
    } finally {
      state.processing = false;
      syncToPage();
    }
  }

  function triggerScan() {
    if (state.scanning || state.processing) return;
    if (guardBeforeIngest && !guardBeforeIngest()) return;
    state.scanning = true;
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => ingestRaw(res.result || ''),
      fail: () => {},
      complete: () => {
        state.scanning = false;
      },
    });
  }

  return {
    open,
    close,
    ingestRaw,
    confirm,
    removeRow,
    setScanIntent,
    triggerScan,
    getRows: () => state.rows.slice(),
  };
}

module.exports = {
  createScanBatchController,
};
