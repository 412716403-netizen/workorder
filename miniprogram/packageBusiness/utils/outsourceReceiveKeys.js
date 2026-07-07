/**
 * 外协待收回/收货录入 key（对齐 views/production-ops/outsourceReceiveKeys.ts）
 */

const RECEIVE_VARIANT_SEP = '__v__';

function outsourceReceiveBaseKey(row) {
  const partner = row.partner ?? '';
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
    const [baseK, variantId] = key.split(RECEIVE_VARIANT_SEP);
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
    (r) => r.orderId === orderId && r.nodeId === nodeId && (r.partner ?? '') === partner,
  );
  if (orderRow) return { row: orderRow, isProductScope: false, baseKey, variantId };
  return null;
}

module.exports = {
  RECEIVE_VARIANT_SEP,
  outsourceReceiveBaseKey,
  dispatchRowKey,
  resolveOutsourceReceiveEntry,
};
