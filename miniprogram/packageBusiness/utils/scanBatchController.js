/**
 * 页内批量扫码会话：先扫入列表，确认后由业务 onConfirm 累加/跳转（对齐 Web ScanBatchSessionModal）
 */
const { parseScanPayload, getUnrecognizedScanImeHint } = require('./scanPayload.js');
const { normalizeScanPayloadForIntent } = require('./scanBatchIntent.js');
const { rowDisplayLine } = require('./scanBatchRowDetail.js');
const { vibrateOnScan } = require('./scanCamera.js');

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
  };

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

  function open() {
    state.rows = [];
    state.keys.clear();
    state.scanIntent = defaultScanIntent;
    page.setData({ scanBatchOpen: true });
    syncToPage();
  }

  function close() {
    page.setData({ scanBatchOpen: false, scanBatchProcessing: false });
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
      wx.showToast({ title: '无法识别扫码内容', icon: 'none' });
      const imeHint = getUnrecognizedScanImeHint(code);
      if (imeHint) {
        setTimeout(() => wx.showToast({ title: imeHint, icon: 'none', duration: 3000 }), 2600);
      }
      return;
    }

    state.processing = true;
    syncToPage();

    try {
      const normalized = await normalizeScanPayloadForIntent(state.scanIntent, parsed);
      if (!normalized.ok) {
        wx.showToast({ title: normalized.message || '扫码失败', icon: 'none' });
        return;
      }
      const payload = normalized.payload;
      const key = rowKey(payload);
      if (state.keys.has(key)) {
        wx.showToast({ title: '该码已在列表中', icon: 'none' });
        return;
      }

      const detail = await resolveRowPreview(payload);
      if (!detail) return;

      state.keys.add(key);
      state.rows.push({ id: nextRowId(), payload, detail });
      vibrateOnScan();
      syncToPage();
    } finally {
      state.processing = false;
      syncToPage();
    }
  }

  async function confirm() {
    if (state.processing) return false;
    if (!state.rows.length) {
      wx.showToast({ title: '请先扫码', icon: 'none' });
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
      fail: () => wx.showToast({ title: '扫码已取消', icon: 'none' }),
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
