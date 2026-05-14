/**
 * 扫码载荷解析工具：统一把扫码枪/摄像头/手工粘贴得到的字符串，
 * 归一化成 { kind, token } 供业务层调用 itemCodesApi.scan / planVirtualBatchesApi.scan。
 *
 * 打印模板里二维码内容默认是：
 *   - 单品码：`${baseUrl}/scan/${scanToken}`
 *   - 批次码：`${baseUrl}/scan/batch/${scanToken}`
 * 也兼容：直接打印 `{{行.scanToken}}` 或 `{{批次.scanToken}}` 这种纯 token 场景。
 */

export type ScanPayloadKind = 'ITEM' | 'BATCH' | 'UNKNOWN';

export interface ScanPayload {
  kind: ScanPayloadKind;
  token: string | null;
  raw: string;
}

/**
 * 扫码 token 字符集：`generateScanToken` 为 `8位hex + '.' + base64url`（见 `planTreeQuota.generateScanToken`），
 * URL 路径段与纯 token 解析必须允许中间的 `.`，否则 `{{行.scanUrl}}` 永远无法识别。
 */
const TOKEN_CHAR = /^[A-Za-z0-9._-]+$/;
const MIN_TOKEN_LEN = 16;
const MAX_TOKEN_LEN = 64;

/**
 * 兜底归一：扫码枪扫码时若操作系统处于**中文输入法**，常见 ASCII 符号会被
 * 自动替换为对应中文/全角字符，导致 token 字符集不通过。统一在这里把
 * 已知误转字符还原为 ASCII，避免「无法识别」频繁出现。
 *
 * 同时执行 Unicode NFKC：把全角字母/数字归一为半角（`Ａ` → `A`、`１` → `1` 等）。
 */
function normalizeScanSeparators(s: string): string {
  let out = s;
  try {
    out = out.normalize('NFKC');
  } catch {
    // 老引擎兜底：忽略
  }
  return out
    .replace(/[\u3002\uFF0E]/g, '.') // 中文句号 / 全角句点 → .
    .replace(/[\u2014\u2013\u2212\uFF0D]/g, '-') // EM/EN DASH / 减号 / 全角连字符 → -
    .replace(/[\uFF3F]/g, '_'); // 全角下划线 → _
}

/**
 * 原始扫码串是否**疑似**中文输入法把 ASCII 转成了全角/中文标点（扫码枪常见问题）。
 * 用于在 `parseScanPayload` 仍为 UNKNOWN 时给出「请切英文输入法」的友好提示。
 */
export function scanRawLooksLikeImeCorruption(raw: string): boolean {
  const s = String(raw ?? '');
  if (!s) return false;
  // 常见误转：句号、破折号、减号、下划线
  if (/[\u3002\uFF0E\u2014\u2013\u2212\uFF0D\uFF3F]/.test(s)) return true;
  // 全角英文/数字（未走 NFKC 前的原始串里仍可能存在）
  if (/[\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19]/.test(s)) return true;
  return false;
}

/**
 * 读入串是否**疑似**受中文输入法 / 全角影响（与 `parseScanPayload` 内归一化逻辑对齐）。
 * 用于：服务端返回「码不存在」时，避免把输入法误扫误判成真缺码。
 */
export function scanInputLikelyImeIssue(raw: string): boolean {
  const s = String(raw ?? '');
  if (!s.trim()) return false;
  if (scanRawLooksLikeImeCorruption(s)) return true;
  const trimmed = trimAndStripQuery(s);
  if (!trimmed) return false;
  const cleaned = normalizeScanSeparators(trimmed);
  return trimmed !== cleaned;
}

/** 后端对 `GET .../scan/:token` 的典型 404 文案 */
const SCAN_CODE_NOT_FOUND_RE = /(单品码|批次码)不存在/;

/**
 * 扫码接口抛错时：若为「单品码/批次码不存在」且读入串疑似输入法改写，则提示切输入法，避免误导。
 */
export function rewriteScanApiErrorForIme(raw: string, message: string): string {
  const m = String(message ?? '').trim();
  if (!m || !SCAN_CODE_NOT_FOUND_RE.test(m)) return message;
  if (!scanInputLikelyImeIssue(raw)) return message;
  return '读码内容疑似被输入法改写，请切换到英文（半角）输入法后重新扫码。若已切换仍失败，请核对条码是否有效。';
}

function trimAndStripQuery(v: string): string {
  const s = v.trim();
  if (!s) return '';
  const qIdx = s.indexOf('?');
  const hIdx = s.indexOf('#');
  let cut = s.length;
  if (qIdx >= 0) cut = Math.min(cut, qIdx);
  if (hIdx >= 0) cut = Math.min(cut, hIdx);
  return s.slice(0, cut);
}

function isLikelyToken(token: string): boolean {
  return (
    token.length >= MIN_TOKEN_LEN &&
    token.length <= MAX_TOKEN_LEN &&
    TOKEN_CHAR.test(token)
  );
}

/**
 * 解析扫码内容。
 * 规则（按顺序匹配）：
 *   1) `/scan/batch/<token>` 末尾 → BATCH
 *   2) `/scan/<token>` 末尾      → ITEM
 *   3) 纯 token（合规字符集，长度在范围内）→ 默认按 ITEM 处理（业务侧扫码失败时可回退尝试 BATCH）
 *   4) 其他 → UNKNOWN
 */
export function parseScanPayload(raw: string): ScanPayload {
  const base: ScanPayload = { kind: 'UNKNOWN', token: null, raw };
  if (raw == null) return base;

  const cleaned = normalizeScanSeparators(trimAndStripQuery(String(raw)));
  if (!cleaned) return base;

  const pathToken = `[A-Za-z0-9._-]+`;
  const batchMatch = cleaned.match(new RegExp(`/scan/batch/(${pathToken})/?$`));
  if (batchMatch && isLikelyToken(batchMatch[1])) {
    return { kind: 'BATCH', token: batchMatch[1], raw };
  }

  const itemMatch = cleaned.match(new RegExp(`/scan/(${pathToken})/?$`));
  if (itemMatch && isLikelyToken(itemMatch[1])) {
    return { kind: 'ITEM', token: itemMatch[1], raw };
  }

  if (isLikelyToken(cleaned)) {
    return { kind: 'ITEM', token: cleaned, raw };
  }

  return base;
}

/** 「最近扫码」芯片无产品名时的短文案：URL 则只显示路径末段 token，否则截断原串 */
export function formatScanRecentChipText(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '—';
  const batchPath = s.match(/\/scan\/batch\/([^/?#]+)\/?$/i);
  if (batchPath?.[1]) {
    const t = batchPath[1];
    return t.length > 26 ? `${t.slice(0, 22)}…` : t;
  }
  const itemPath = s.match(/\/scan\/([^/?#]+)\/?$/i);
  if (itemPath?.[1] && !/\/scan\/batch\//i.test(s)) {
    const t = itemPath[1];
    return t.length > 26 ? `${t.slice(0, 22)}…` : t;
  }
  return s.length > 28 ? `…${s.slice(-24)}` : s;
}

/** 把 { kind, token } 反向拼成打印/分享用的 URL（baseUrl 不以 `/` 结尾）。 */
export function buildScanUrl(
  baseUrl: string,
  kind: Exclude<ScanPayloadKind, 'UNKNOWN'>,
  token: string,
): string {
  const base = baseUrl.replace(/\/$/, '');
  return kind === 'BATCH'
    ? `${base}/scan/batch/${token}`
    : `${base}/scan/${token}`;
}
