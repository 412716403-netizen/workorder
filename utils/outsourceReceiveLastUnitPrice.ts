/**
 * 外协收回「合作单位 + 商品 + 工序」上次单价记忆工具。
 *
 * 匹配规则（见 .cursor/plans/合作单位上次单价_*.plan.md）：
 * - `type === 'OUTSOURCE'` 且 `status === '已收回'` 且 `unitPrice` 可解析。
 * - 键：`productId` + `partner`（`trim()` 后比对）+ `nodeId`。
 * - 忽略 `variantId`。
 * - 时间序：`new Date(timestamp)` 可解析则取最大；否则回退 `_savedAtMs` / 0。
 * - 可选 `excludeDocNo` 用于编辑本单时排除自身。
 * - 价格 0 视为无效（外协收回默认 0，若把 0 视为有效会把"无单价的历史"当"上次 0"错填）。
 */

interface ProdRecordLike {
  type?: string;
  status?: string | null;
  docNo?: string | null;
  productId?: string | null;
  partner?: string | null;
  nodeId?: string | null;
  unitPrice?: number | string | null;
  timestamp?: string | Date | null;
  _savedAtMs?: number | null;
}

function normPartnerName(s: unknown): string {
  if (s == null) return '';
  return String(s).trim();
}

function coercePriceStrict(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

function prodTimeMs(r: ProdRecordLike): number {
  const ts = r.timestamp;
  if (ts != null && String(ts).trim() !== '') {
    const t = new Date(ts as string | Date).getTime();
    if (Number.isFinite(t) && t > 0) return t;
  }
  if (typeof r._savedAtMs === 'number' && Number.isFinite(r._savedAtMs) && r._savedAtMs > 0) return r._savedAtMs;
  return 0;
}

/**
 * 构建外协收回上次单价索引：`${partnerNameNorm}|${productId}|${nodeId}` → { price, timeMs }。
 */
export function buildOutsourceReceiveLastPriceIndex(
  prodRecords: ProdRecordLike[] | null | undefined,
  opts?: { excludeDocNo?: string | null },
): Map<string, { price: number; timeMs: number }> {
  const out = new Map<string, { price: number; timeMs: number }>();
  if (!prodRecords?.length) return out;
  const exclude = opts?.excludeDocNo ?? '';
  for (const r of prodRecords) {
    if (!r || r.type !== 'OUTSOURCE') continue;
    if (r.status !== '已收回') continue;
    if (exclude && r.docNo && String(r.docNo) === String(exclude)) continue;
    const price = coercePriceStrict(r.unitPrice);
    if (price == null) continue;
    const productId = r.productId ? String(r.productId) : '';
    const nodeId = r.nodeId ? String(r.nodeId) : '';
    const partnerKey = normPartnerName(r.partner);
    if (!productId || !nodeId || !partnerKey) continue;
    const key = `${partnerKey}|${productId}|${nodeId}`;
    const timeMs = prodTimeMs(r);
    const prev = out.get(key);
    if (!prev || timeMs > prev.timeMs) out.set(key, { price, timeMs });
  }
  return out;
}

/** 查询索引 */
export function lookupOutsourceReceiveLastPrice(
  index: Map<string, { price: number; timeMs: number }>,
  partnerName: string | null | undefined,
  productId: string,
  nodeId: string,
): number | null {
  const partnerKey = normPartnerName(partnerName);
  if (!partnerKey || !productId || !nodeId) return null;
  const hit = index.get(`${partnerKey}|${productId}|${nodeId}`);
  return hit ? hit.price : null;
}
