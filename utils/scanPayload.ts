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

/** base64url token 允许字符集：A-Z a-z 0-9 - _ */
const TOKEN_CHAR = /^[A-Za-z0-9_-]+$/;
const MIN_TOKEN_LEN = 16;
const MAX_TOKEN_LEN = 64;

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

  const cleaned = trimAndStripQuery(String(raw));
  if (!cleaned) return base;

  const batchMatch = cleaned.match(/\/scan\/batch\/([A-Za-z0-9_-]+)\/?$/);
  if (batchMatch && isLikelyToken(batchMatch[1])) {
    return { kind: 'BATCH', token: batchMatch[1], raw };
  }

  const itemMatch = cleaned.match(/\/scan\/([A-Za-z0-9_-]+)\/?$/);
  if (itemMatch && isLikelyToken(itemMatch[1])) {
    return { kind: 'ITEM', token: itemMatch[1], raw };
  }

  if (isLikelyToken(cleaned)) {
    return { kind: 'ITEM', token: cleaned, raw };
  }

  return base;
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
