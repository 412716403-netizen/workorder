function _arrayLikeToArray(r, a) {(null == a || a > r.length) && (a = r.length);for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];return n;} /**
 * 返工报工路径分组（对齐 utils/reworkReportGroup.ts，扫码/手输共用）
 */

const _require =


  require('./reworkPanelLite.js'),buildOutOfSequenceTemplateIds = _require.buildOutOfSequenceTemplateIds,reworkRemainingAtNode = _require.reworkRemainingAtNode;

function reworkQtyKey(productId, pathKey, variantId) {
  if (variantId === undefined) return `${productId}__${pathKey}`;
  return `${productId}__${pathKey}__${variantId}`;
}

function parseReworkQtyKey(key) {
  const parts = String(key || '').split('__');
  if (parts.length < 2) return null;
  const productId = parts[0],rest = _arrayLikeToArray(parts).slice(1);
  if (!productId) return null;
  if (rest.length === 1) return { productId, pathKey: rest[0] };
  const pathKey = rest.slice(0, -1).join('__');
  const variantId = rest[rest.length - 1];
  return { productId, pathKey, variantId };
}

function buildReworkReportPaths(args) {
  const _args$records =








    args.records,records = _args$records === void 0 ? [] : _args$records,currentNodeId = args.currentNodeId,_args$isOutsourceRewo = args.isOutsourceRework,isOutsourceRework = _args$isOutsourceRewo === void 0 ? false : _args$isOutsourceRewo,_args$outsourcePartne = args.outsourcePartner,outsourcePartner = _args$outsourcePartne === void 0 ? '' : _args$outsourcePartne,_args$globalNodes = args.globalNodes,globalNodes = _args$globalNodes === void 0 ? [] : _args$globalNodes,anchorProductId = args.anchorProductId,scopeProductId = args.scopeProductId,scopeOrderId = args.scopeOrderId;

  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);
  const reworkList = (records || []).filter((r) => {
    if (r.type !== 'REWORK') return false;
    if (scopeProductId && r.productId !== scopeProductId) return false;
    if (scopeOrderId && r.orderId !== scopeOrderId) return false;
    const recPartner = (r.partner || '').trim();
    if (isOutsourceRework) {
      if (recPartner !== String(outsourcePartner || '').trim()) return false;
    } else if (recPartner) return false;
    const pathNodes = r.reworkNodeIds && r.reworkNodeIds.length > 0 ?
    r.reworkNodeIds :
    r.nodeId ? [r.nodeId] : [];
    if (!pathNodes.includes(currentNodeId)) return false;
    if (r.status === '已完成') return false;
    const remaining = reworkRemainingAtNode(r, currentNodeId, outOfSequenceTemplateIds);
    return remaining > 0;
  });

  const byKey = new Map();
  reworkList.forEach((r) => {
    const productId = r.productId;
    if (!productId) return;
    const pathNodes = r.reworkNodeIds && r.reworkNodeIds.length > 0 ?
    r.reworkNodeIds :
    r.nodeId ? [r.nodeId] : [];
    const pathKey = pathNodes.join('|');
    const mapKey = `${productId}::${pathKey}`;
    const cur = byKey.get(mapKey) || { productId, records: [], pendingByVariant: {} };
    cur.records.push(r);
    const remaining = reworkRemainingAtNode(r, currentNodeId, outOfSequenceTemplateIds);
    const vid = r.variantId || '';
    cur.pendingByVariant[vid] = (cur.pendingByVariant[vid] || 0) + remaining;
    byKey.set(mapKey, cur);
  });

  const rows = [];
  byKey.forEach(({ productId, records: recs, pendingByVariant }) => {
    const first = recs[0];
    const pathNodes = first && first.reworkNodeIds && first.reworkNodeIds.length > 0 ?
    first.reworkNodeIds :
    first && first.nodeId ? [first.nodeId] : [];
    const pathKey = pathNodes.join('|');
    const nodeIds = pathKey.split('|').filter(Boolean);
    const pathLabel = nodeIds.length <= 1 ?
    (globalNodes.find((n) => n.id === nodeIds[0]) || {}).name || nodeIds[0] :
    nodeIds.map((nid) => (globalNodes.find((n) => n.id === nid) || {}).name || nid).join('、');
    const totalPending = Object.values(pendingByVariant).reduce((s, q) => s + q, 0);
    if (totalPending > 0) {
      rows.push({
        productId, pathKey, pathLabel, nodeIds, records: recs, totalPending, pendingByVariant
      });
    }
  });

  if (anchorProductId) {
    rows.sort((a, b) => {
      if (a.productId === anchorProductId && b.productId !== anchorProductId) return -1;
      if (b.productId === anchorProductId && a.productId !== anchorProductId) return 1;
      return a.productId.localeCompare(b.productId);
    });
  } else {
    rows.sort((a, b) => a.productId.localeCompare(b.productId));
  }
  return rows;
}

function groupReworkPathsByProduct(paths) {
  const byProduct = new Map();
  (paths || []).forEach((p) => {
    const list = byProduct.get(p.productId) || [];
    list.push(p);
    byProduct.set(p.productId, list);
  });
  return Array.from(byProduct.entries()).map(([productId, productPaths]) => ({
    productId,
    paths: productPaths,
    totalPending: productPaths.reduce((s, p) => s + p.totalPending, 0)
  }));
}

function findReworkPathForScan(paths, productId, variantId) {
  const productPaths = (paths || []).filter((p) => p.productId === productId);
  if (variantId) {
    return productPaths.find((p) => (p.pendingByVariant[variantId] || 0) > 0);
  }
  return productPaths.find((p) => p.totalPending > 0) || productPaths[0];
}

function collectReworkOrderIdsForProduct(paths, productId, fallbackOrderId) {
  const ids = new Set();
  (paths || []).
  filter((p) => p.productId === productId).
  forEach((p) => {
    p.records.forEach((r) => {
      if (r.orderId) ids.add(r.orderId);
    });
  });
  if (ids.size === 0 && fallbackOrderId) ids.add(fallbackOrderId);
  return [...ids];
}

function listReworkNodeIdsWithPending(records, orderId, globalNodes) {
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(globalNodes);
  const nodeIds = new Set();
  (records || []).forEach((r) => {
    if (r.type !== 'REWORK') return;
    if (orderId && r.orderId !== orderId) return;
    if ((r.partner || '').trim()) return;
    const pathNodes = r.reworkNodeIds && r.reworkNodeIds.length > 0 ?
    r.reworkNodeIds :
    r.nodeId ? [r.nodeId] : [];
    pathNodes.forEach((nid) => {
      if (reworkRemainingAtNode(r, nid, outOfSequenceTemplateIds) > 0) nodeIds.add(nid);
    });
  });
  return [...nodeIds];
}

function sumReworkEnteredForPath(quantities, productId, pathKey) {
  let sum = 0;
  Object.entries(quantities || {}).forEach(([key, qty]) => {
    const parsed = parseReworkQtyKey(key);
    if (!parsed || parsed.productId !== productId || parsed.pathKey !== pathKey) return;
    sum += Number(qty) || 0;
  });
  return sum;
}

function hasAnyReworkEnteredQty(quantities) {
  return Object.values(quantities || {}).some((q) => (Number(q) || 0) > 0);
}

module.exports = {
  buildReworkReportPaths,
  groupReworkPathsByProduct,
  findReworkPathForScan,
  collectReworkOrderIdsForProduct,
  listReworkNodeIdsWithPending,
  reworkQtyKey,
  parseReworkQtyKey,
  sumReworkEnteredForPath,
  hasAnyReworkEnteredQty
};