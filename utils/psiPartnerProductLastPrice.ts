import { recordDocLineTimeMs } from './flowDocSort';

/**
 * 进销存「合作单位 + 商品」上次单价记忆工具。
 *
 * 匹配规则（见 .cursor/plans/合作单位上次单价_*.plan.md）：
 * - 采购侧：`PURCHASE_ORDER` + `PURCHASE_BILL`，取 `purchasePrice`。
 * - 销售侧：`SALES_ORDER` + `SALES_BILL`，取 `salesPrice`。
 * - 键：`productId` + 合作单位（`partnerId` 优先；缺省时 `partner` 名称 `trim()` 后比对）。
 * - 忽略 `variantId`（同 SKU 不同规格共用一个上次价）。
 * - 时间序：复用 `recordDocLineTimeMs`，取最大。
 * - 可选 `excludeDocNumber` 用于编辑本单时排除自身。
 * - 价格 0 视为有效单价（与手工填 0 语义一致），`null` / `undefined` / `NaN` 视为无效。
 */

export type PsiPriceSide = 'PURCHASE' | 'SALES';

interface PsiRecordLike {
  type?: string;
  docNumber?: string | null;
  productId?: string | null;
  partnerId?: string | null;
  partner?: string | null;
  purchasePrice?: number | string | null;
  salesPrice?: number | string | null;
  timestamp?: string | null;
  createdAt?: string | Date | null;
  _savedAtMs?: number | null;
}

const PURCHASE_TYPES = new Set(['PURCHASE_ORDER', 'PURCHASE_BILL']);
const SALES_TYPES = new Set(['SALES_ORDER', 'SALES_BILL']);

/** 合作单位规范化：trim；空串统一为 '' */
function normPartnerName(s: unknown): string {
  if (s == null) return '';
  return String(s).trim();
}

/** 把可能为字符串的价格转成有效数字；无效返回 null */
function coercePrice(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 构建「索引 Map」：`${side}|${partnerKey}|${productId}` → 最近一条的单价 + 时间毫秒。
 *
 * `partnerKey` 规则：
 * - 若记录有非空 `partnerId` → `id:${partnerId}`；
 * - 否则 → `name:${trim(partner)}`。
 *
 * 约定：对同一个键，取 `recordDocLineTimeMs` 最大的一条；调用方通过 `buildQueryKey` 查询。
 */
export function buildPsiLastPriceIndex(
  records: PsiRecordLike[] | null | undefined,
  opts?: { excludeDocNumber?: string | null },
): Map<string, { price: number; timeMs: number }> {
  const out = new Map<string, { price: number; timeMs: number }>();
  if (!records?.length) return out;
  const exclude = opts?.excludeDocNumber ?? '';
  for (const r of records) {
    if (!r || !r.productId) continue;
    const t = r.type;
    let side: PsiPriceSide | null = null;
    if (t && PURCHASE_TYPES.has(t)) side = 'PURCHASE';
    else if (t && SALES_TYPES.has(t)) side = 'SALES';
    if (!side) continue;
    if (exclude && r.docNumber && String(r.docNumber) === String(exclude)) continue;
    const rawPrice = side === 'PURCHASE' ? r.purchasePrice : r.salesPrice;
    const price = coercePrice(rawPrice);
    if (price == null) continue;
    const timeMs = recordDocLineTimeMs({
      timestamp: r.timestamp ?? null,
      createdAt: r.createdAt ?? null,
      _savedAtMs: r._savedAtMs ?? null,
    });
    const partnerIdNorm = r.partnerId ? String(r.partnerId).trim() : '';
    const keys: string[] = [];
    const productId = String(r.productId);
    if (partnerIdNorm) keys.push(`${side}|id:${partnerIdNorm}|${productId}`);
    const partnerNameNorm = normPartnerName(r.partner);
    if (partnerNameNorm) keys.push(`${side}|name:${partnerNameNorm}|${productId}`);
    if (keys.length === 0) continue;
    for (const k of keys) {
      const prev = out.get(k);
      if (!prev || timeMs > prev.timeMs) out.set(k, { price, timeMs });
    }
  }
  return out;
}

/**
 * 构造查询键；传入 `partnerId` 与 `partnerName`：
 * - 优先返回 `id:${partnerId}` 键；
 * - 否则回退 `name:${trim(partnerName)}` 键；
 * - 两者皆空返回 null。
 *
 * 索引内同时以 id: 与 name: 各存一份，因此调用方使用 id 命中时，
 * 仍可匹配历史上仅用 name 写入（缺 partnerId）的老数据 —— 需再尝试 name 回退。
 */
export function buildQueryKeys(
  side: PsiPriceSide,
  partnerId: string | null | undefined,
  partnerName: string | null | undefined,
  productId: string,
): string[] {
  const keys: string[] = [];
  const pid = partnerId ? String(partnerId).trim() : '';
  if (pid) keys.push(`${side}|id:${pid}|${productId}`);
  const pname = normPartnerName(partnerName);
  if (pname) keys.push(`${side}|name:${pname}|${productId}`);
  return keys;
}

/**
 * 从索引中查询某 (side, partner, product) 的上次单价。
 *
 * 查询顺序：先 partnerId、再 partnerName；二者都未命中返回 null。
 * 对同一商品若同时有 id 与 name 命中，取时间最大的一条（避免旧数据缺 partnerId 时遗漏）。
 */
export function lookupLastPrice(
  index: Map<string, { price: number; timeMs: number }>,
  side: PsiPriceSide,
  partnerId: string | null | undefined,
  partnerName: string | null | undefined,
  productId: string,
): number | null {
  const keys = buildQueryKeys(side, partnerId, partnerName, productId);
  let best: { price: number; timeMs: number } | null = null;
  for (const k of keys) {
    const hit = index.get(k);
    if (!hit) continue;
    if (!best || hit.timeMs > best.timeMs) best = hit;
  }
  return best ? best.price : null;
}

/**
 * 直接从原始 records 一次性查询（无索引场景，如计划补货批处理）。
 * O(n) 扫描，内部构建临时索引。
 */
export function getLastPsiUnitPrice(
  records: PsiRecordLike[] | null | undefined,
  side: PsiPriceSide,
  params: {
    partnerId?: string | null;
    partnerName?: string | null;
    productId: string;
    excludeDocNumber?: string | null;
  },
): number | null {
  if (!records?.length || !params.productId) return null;
  const index = buildPsiLastPriceIndex(records, { excludeDocNumber: params.excludeDocNumber });
  return lookupLastPrice(index, side, params.partnerId, params.partnerName, params.productId);
}

/** 采购侧便捷入口：对应 `PURCHASE_ORDER` + `PURCHASE_BILL` 的 `purchasePrice`。 */
export function getLastPurchaseUnitPrice(
  records: PsiRecordLike[] | null | undefined,
  params: {
    partnerId?: string | null;
    partnerName?: string | null;
    productId: string;
    excludeDocNumber?: string | null;
  },
): number | null {
  return getLastPsiUnitPrice(records, 'PURCHASE', params);
}

/** 销售侧便捷入口：对应 `SALES_ORDER` + `SALES_BILL` 的 `salesPrice`。 */
export function getLastSalesUnitPrice(
  records: PsiRecordLike[] | null | undefined,
  params: {
    partnerId?: string | null;
    partnerName?: string | null;
    productId: string;
    excludeDocNumber?: string | null;
  },
): number | null {
  return getLastPsiUnitPrice(records, 'SALES', params);
}
