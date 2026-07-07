/**
 * 扫码载荷解析（与 Web utils/scanPayload.ts 保持同步）
 */

const TOKEN_CHAR = /^[A-Za-z0-9._-]+$/;
const MIN_TOKEN_LEN = 16;
const MAX_TOKEN_LEN = 64;

const UNRECOGNIZED_SCAN_IME_HINT =
  '检测到可能为中文输入法误转，请切换到英文（半角）输入法后重扫。';

function normalizeScanSeparators(s) {
  let out = s;
  try {
    out = out.normalize('NFKC');
  } catch {
    /* ignore */
  }
  return out
    .replace(/[\u3002\uFF0E]/g, '.')
    .replace(/[\u2014\u2013\u2212\uFF0D]/g, '-')
    .replace(/[\uFF3F]/g, '_')
    .replace(/\uFF0F/g, '/');
}

function scanRawLooksLikeImeCorruption(raw) {
  const s = String(raw ?? '');
  if (!s) return false;
  if (/[\u3002\uFF0E\u2014\u2013\u2212\uFF0D\uFF3F\uFF0F]/.test(s)) return true;
  if (/[\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19]/.test(s)) return true;
  return false;
}

function trimAndStripQuery(v) {
  const s = v.trim();
  if (!s) return '';
  const qIdx = s.indexOf('?');
  const hIdx = s.indexOf('#');
  let cut = s.length;
  if (qIdx >= 0) cut = Math.min(cut, qIdx);
  if (hIdx >= 0) cut = Math.min(cut, hIdx);
  return s.slice(0, cut);
}

function scanInputLikelyImeIssue(raw) {
  const s = String(raw ?? '');
  if (!s.trim()) return false;
  if (scanRawLooksLikeImeCorruption(s)) return true;
  const trimmed = trimAndStripQuery(s);
  if (!trimmed) return false;
  return trimmed !== normalizeScanSeparators(trimmed);
}

function isLikelyToken(token) {
  return token.length >= MIN_TOKEN_LEN && token.length <= MAX_TOKEN_LEN && TOKEN_CHAR.test(token);
}

function normalizeExtractedScanToken(token) {
  const i = token.indexOf('.');
  if (i <= 0) return token;
  const prefix = token.slice(0, i);
  if (!/^[0-9A-Fa-f]{8}$/.test(prefix)) return token;
  return prefix.toLowerCase() + token.slice(i);
}

function parseScanPayload(raw) {
  const base = { kind: 'UNKNOWN', token: null, raw };
  if (raw == null) return base;

  const cleaned = normalizeScanSeparators(trimAndStripQuery(String(raw)));
  if (!cleaned) return base;

  const pathToken = '[A-Za-z0-9._-]+';
  const batchMatch = cleaned.match(new RegExp(`/scan/batch/(${pathToken})/?$`, 'i'));
  if (batchMatch && isLikelyToken(batchMatch[1])) {
    return { kind: 'BATCH', token: normalizeExtractedScanToken(batchMatch[1]), raw };
  }

  const itemMatch = cleaned.match(new RegExp(`/scan/(${pathToken})/?$`, 'i'));
  if (itemMatch && isLikelyToken(itemMatch[1])) {
    return { kind: 'ITEM', token: normalizeExtractedScanToken(itemMatch[1]), raw };
  }

  if (isLikelyToken(cleaned)) {
    return { kind: 'ITEM', token: normalizeExtractedScanToken(cleaned), raw };
  }

  return base;
}

function getUnrecognizedScanImeHint(raw) {
  if (scanInputLikelyImeIssue(raw) || scanRawLooksLikeImeCorruption(raw)) {
    return UNRECOGNIZED_SCAN_IME_HINT;
  }
  return undefined;
}

const SCAN_CODE_NOT_FOUND_RE = /(单品码|批次码)不存在/;

function rewriteScanApiErrorForIme(raw, message) {
  const m = String(message ?? '').trim();
  if (!m || !SCAN_CODE_NOT_FOUND_RE.test(m)) return message;
  if (!scanInputLikelyImeIssue(raw)) return message;
  return '读码内容疑似被输入法改写，请切换到英文（半角）输入法后重新扫码。';
}

function formatScanRecentChipText(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '—';
  const batchPath = s.match(/\/scan\/batch\/([^/?#]+)\/?$/i);
  if (batchPath && batchPath[1]) {
    const t = batchPath[1];
    return t.length > 26 ? `${t.slice(0, 22)}…` : t;
  }
  const itemPath = s.match(/\/scan\/([^/?#]+)\/?$/i);
  if (itemPath && itemPath[1] && !/\/scan\/batch\//i.test(s)) {
    const t = itemPath[1];
    return t.length > 26 ? `${t.slice(0, 22)}…` : t;
  }
  return s.length > 28 ? `…${s.slice(-24)}` : s;
}

module.exports = {
  parseScanPayload,
  getUnrecognizedScanImeHint,
  rewriteScanApiErrorForIme,
  formatScanRecentChipText,
};
