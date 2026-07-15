/**
 * 合作单位 + 商品上次单价（对齐 utils/psiPartnerProductLastPrice.ts）
 */

const { flowRecordsEarliestMs } = require('../../utils/flowDocSortLite.js');

const PURCHASE_TYPES = new Set(['PURCHASE_ORDER', 'PURCHASE_BILL']);
const SALES_TYPES = new Set(['SALES_ORDER', 'SALES_BILL']);

function normPartnerName(s) {
  if (s == null) return '';
  return String(s).trim();
}

function coercePrice(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function recordDocLineTimeMs(r) {
  if (r && r._savedAtMs) return Number(r._savedAtMs) || 0;
  const ts = r && r.timestamp ? new Date(r.timestamp).getTime() : 0;
  if (ts > 0) return ts;
  const ca = r && r.createdAt;
  if (ca) {
    const ms = new Date(ca).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return flowRecordsEarliestMs([r]);
}

function buildQueryKey(side, partnerId, partnerName, productId) {
  const pid = String(productId || '').trim();
  if (!pid) return '';
  const idNorm = partnerId ? String(partnerId).trim() : '';
  const partnerKey = idNorm ? `id:${idNorm}` : `name:${normPartnerName(partnerName)}`;
  return `${side}|${partnerKey}|${pid}`;
}

function buildPsiLastPriceIndex(records, opts) {
  const out = new Map();
  const exclude = (opts && opts.excludeDocNumber) || '';
  (records || []).forEach((r) => {
    if (!r || !r.productId) return;
    let side = null;
    if (PURCHASE_TYPES.has(r.type)) side = 'PURCHASE';
    else if (SALES_TYPES.has(r.type)) side = 'SALES';
    if (!side) return;
    if (exclude && r.docNumber && String(r.docNumber) === String(exclude)) return;
    const rawPrice = side === 'PURCHASE' ? r.purchasePrice : r.salesPrice;
    const price = coercePrice(rawPrice);
    if (price == null) return;
    const timeMs = recordDocLineTimeMs(r);
    const partnerIdNorm = r.partnerId ? String(r.partnerId).trim() : '';
    const keys = [];
    if (partnerIdNorm) keys.push(buildQueryKey(side, partnerIdNorm, '', r.productId));
    const nameNorm = normPartnerName(r.partner);
    if (nameNorm) keys.push(buildQueryKey(side, '', nameNorm, r.productId));
    keys.forEach((key) => {
      if (!key) return;
      const prev = out.get(key);
      if (!prev || timeMs >= prev.timeMs) out.set(key, { price, timeMs });
    });
  });
  return out;
}

function lookupLastPrice(index, side, partnerId, partnerName, productId) {
  const map = index || new Map();
  const idNorm = partnerId ? String(partnerId).trim() : '';
  if (idNorm) {
    const hit = map.get(buildQueryKey(side, idNorm, '', productId));
    if (hit) return hit.price;
  }
  const nameNorm = normPartnerName(partnerName);
  if (nameNorm) {
    const hit = map.get(buildQueryKey(side, '', nameNorm, productId));
    if (hit) return hit.price;
  }
  return null;
}

function resolveDefaultSalesPrice(records, partnerId, partnerName, productId, productMap, excludeDocNumber) {
  if (!productId) return 0;
  const index = buildPsiLastPriceIndex(records, { excludeDocNumber });
  const last = lookupLastPrice(index, 'SALES', partnerId, partnerName, productId);
  if (last != null) return last;
  const product = productMap && productMap.get ? productMap.get(productId) : null;
  return product && product.salesPrice != null ? Number(product.salesPrice) || 0 : 0;
}

module.exports = {
  buildPsiLastPriceIndex,
  lookupLastPrice,
  resolveDefaultSalesPrice,
};
