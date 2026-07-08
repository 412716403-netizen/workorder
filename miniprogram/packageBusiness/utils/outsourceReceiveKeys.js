/**
 * 外协待收回/收货录入 key（对齐 views/production-ops/outsourceReceiveKeys.ts）
 */

const RECEIVE_VARIANT_SEP = '__v__';

function outsourceReceiveBaseKey(row) {var _row$partner;
  const partner = (_row$partner = row.partner) != null ? _row$partner : '';
  if (row.orderId != null) return `${row.orderId}|${row.nodeId}|${partner}`;
  return `${row.productId}|${row.nodeId}|${partner}`;
}

function dispatchRowKey(row) {
  if (row.orderId) return `${row.orderId}|${row.nodeId}`;
  return `${row.productId}|${row.nodeId}`;
}

/**
 * 解析 receiveFormQuantities 的 entry key（对齐 Web resolveOutsourceReceiveEntry）
 */
function resolveOutsourceReceiveEntry(key, rows) {
  if (key.includes(RECEIVE_VARIANT_SEP)) {
    const _key$split = key.split(RECEIVE_VARIANT_SEP),baseK = _key$split[0],variantId = _key$split[1];
    if (!baseK) return null;
    const row = (rows || []).find((r) => r.orderId == null && outsourceReceiveBaseKey(r) === baseK);
    if (row) return { row, isProductScope: true, baseKey: baseK, variantId };
    return null;
  }
  const productRow = (rows || []).find((r) => r.orderId == null && outsourceReceiveBaseKey(r) === key);
  if (productRow) return { row: productRow, isProductScope: true, baseKey: key };
  const parts = key.split('|');
  if (parts.length < 3) return null;
  const orderId = parts[0];
  const nodeId = parts[1];
  const partner = parts[2];
  const variantId = parts.length > 3 ? parts.slice(3).join('|') : undefined;
  const baseKey = `${orderId}|${nodeId}|${partner}`;
  const orderRow = (rows || []).find(
    (r) => {var _r$partner;return r.orderId === orderId && r.nodeId === nodeId && ((_r$partner = r.partner) != null ? _r$partner : '') === partner;}
  );
  if (orderRow) return { row: orderRow, isProductScope: false, baseKey, variantId };
  return null;
}

module.exports = {
  RECEIVE_VARIANT_SEP,
  outsourceReceiveBaseKey,
  dispatchRowKey,
  resolveOutsourceReceiveEntry
};