const {
  getUnrecognizedScanImeHint,
  rewriteScanApiErrorForIme,
  formatScanRecentChipText,
} = require('./scanPayload.js');
const { pushScanRecord } = require('../../utils/scanHistory.js');

function scanSummaryLine(scanRes) {
  if (!scanRes) return '';
  const name = scanRes.productName || scanRes.sku || '';
  const plan = scanRes.planNumber ? `计划 ${scanRes.planNumber}` : '';
  const serial = scanRes.serialLabel || '';
  return [name, plan, serial].filter(Boolean).join(' · ');
}

function buildResultCard(title, lines) {
  return { title, lines: lines || [], traceEvents: [] };
}

function resolveScanIds(scanRes) {
  if (scanRes.kind === 'VIRTUAL_BATCH') {
    return {
      itemCodeId: null,
      virtualBatchId: scanRes.batchId || null,
    };
  }
  const itemCodeId = scanRes.itemCodeId || null;
  const virtualBatchId = scanRes.batchId || null;
  return { itemCodeId, virtualBatchId };
}

function productIdFromScan(scanRes) {
  if (scanRes.productId) return scanRes.productId;
  if (scanRes.kind === 'VIRTUAL_BATCH' && scanRes.batchId) return scanRes.productId || null;
  return null;
}

function buildSessionLog(raw, status, title, lines) {
  const d = new Date();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: formatScanRecentChipText(raw),
    status,
    title,
    lines: (lines || []).filter(Boolean),
    time,
  };
}

function failScan(ctx, raw, message, title = '扫码失败') {
  const hint = getUnrecognizedScanImeHint(raw);
  wx.showToast({ title: message, icon: 'none', duration: 2500 });
  pushScanRecord({
    code: formatScanRecentChipText(raw),
    type: ctx.scanType,
    typeLabel: ctx.typeLabel,
    nodeName: ctx.nodeName || ctx.reworkNodeName || '',
    partnerName: ctx.partnerName || '',
    status: 'error',
    summary: message,
  });
  if (hint) {
    setTimeout(() => wx.showToast({ title: hint, icon: 'none', duration: 3000 }), 2600);
  }
  return {
    ok: false,
    sessionLog: buildSessionLog(raw, 'error', title, [message]),
  };
}

function successHistory(ctx, payload, summary, extra) {
  pushScanRecord({
    code: formatScanRecentChipText(payload.raw),
    type: ctx.scanType,
    typeLabel: ctx.typeLabel,
    nodeName: ctx.nodeName || '',
    partnerName: ctx.partnerName || '',
    status: 'success',
    summary,
    ...extra,
  });
}

function rewriteError(raw, err, fallback) {
  return rewriteScanApiErrorForIme(raw, (err && err.message) || fallback);
}

module.exports = {
  scanSummaryLine,
  buildResultCard,
  buildSessionLog,
  resolveScanIds,
  productIdFromScan,
  failScan,
  successHistory,
  rewriteError,
};
