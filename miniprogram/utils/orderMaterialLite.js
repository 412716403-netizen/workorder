/**
 * 工单中心领料（对齐 Web MaterialIssueModal 核心口径）
 */

const { sumOrderQty } = require('./orderProcessChips.js');

function roundQty(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function formatQtyDisplay(n) {
  const r = roundQty(n);
  return Number.isInteger(r) ? String(r) : String(r);
}

function effectiveBomQtyForOrder(order, bom, orderQty, bomsSameParentAndNode) {
  if (!bom.variantId) return orderQty;
  const hit = (order.items || []).find((i) => i.variantId === bom.variantId);
  if (hit != null && hit.quantity > 0) return hit.quantity;
  if ((order.items || []).length === 1 && order.items[0].quantity > 0) return order.items[0].quantity;
  const scopeVariantIds = new Set(
    (bomsSameParentAndNode || []).map((b) => b.variantId).filter(Boolean),
  );
  const anyItemMatchesScope = (order.items || []).some(
    (i) => i.variantId && scopeVariantIds.has(i.variantId),
  );
  if (!anyItemMatchesScope && orderQty > 0) return orderQty;
  return hit != null ? hit.quantity : 0;
}

function nodeNameById(globalNodes, nodeId) {
  const n = (globalNodes || []).find((g) => g.id === nodeId);
  return (n && n.name) || nodeId || '';
}

function addBomItemsToMap(matMap, bom, qty, nodeName, products) {
  (bom.items || []).forEach((bi) => {
    const mp = (products || []).find((p) => p.id === bi.productId);
    const add = Number(bi.quantity) * qty;
    const existing = matMap.get(bi.productId);
    if (existing) {
      existing.unitNeeded += add;
      if (nodeName) existing.nodeNames.add(nodeName);
    } else {
      const ns = new Set();
      if (nodeName) ns.add(nodeName);
      matMap.set(bi.productId, {
        productId: bi.productId,
        name: (mp && mp.name) || '未知物料',
        sku: (mp && mp.sku) || '',
        unitNeeded: add,
        nodeNames: ns,
      });
    }
  });
}

function buildBomMaterialsForSingleOrder(order, products, boms, globalNodes, productOverride) {
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const product = productOverride || productMap.get(order.productId);
  const orderQty = sumOrderQty(order);
  const matMap = new Map();
  const variants = (product && product.variants) || [];

  if (variants.length > 0) {
    (order.items || []).forEach((item) => {
      if (item.quantity <= 0) return;
      const v = variants.find((vx) => vx.id === item.variantId) || variants[0];
      const lineQty = item.quantity;
      const seenBomIds = new Set();
      if (v && v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
        Object.entries(v.nodeBoms).forEach(([nodeId, bomIdRaw]) => {
          const bomId = String(bomIdRaw);
          if (seenBomIds.has(bomId)) return;
          seenBomIds.add(bomId);
          const bom = (boms || []).find((b) => b.id === bomId);
          if (bom) {
            addBomItemsToMap(
              matMap,
              bom,
              lineQty,
              nodeNameById(globalNodes, nodeId),
              products,
            );
          }
        });
      } else if (product) {
        (boms || [])
          .filter((b) => b.parentProductId === product.id && b.variantId === v.id && b.nodeId)
          .forEach((bom) => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            addBomItemsToMap(
              matMap,
              bom,
              lineQty,
              nodeNameById(globalNodes, bom.nodeId),
              products,
            );
          });
      }
    });
  }

  if (matMap.size === 0 && product) {
    const seenBomIds = new Set();
    const fallbackBoms = (boms || []).filter((b) => b.parentProductId === product.id && b.nodeId);
    fallbackBoms.forEach((bom) => {
      if (seenBomIds.has(bom.id)) return;
      seenBomIds.add(bom.id);
      const qty = effectiveBomQtyForOrder(order, bom, orderQty, fallbackBoms);
      if (qty <= 0) return;
      addBomItemsToMap(matMap, bom, qty, nodeNameById(globalNodes, bom.nodeId), products);
    });
  }

  return Array.from(matMap.values()).map((v) => ({
    ...v,
    nodeNames: Array.from(v.nodeNames),
  }));
}

function buildBomMaterialsForOrder(order, products, boms, globalNodes) {
  return buildBomMaterialsForSingleOrder(order, products, boms, globalNodes, null);
}

function buildBomMaterialsForProductGroup(groupOrders, sourceProductId, products, boms, globalNodes) {
  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const finishedProduct = productMap.get(sourceProductId);
  const matMap = new Map();

  (groupOrders || []).forEach((order) => {
    const orderQty = sumOrderQty(order);
    if (orderQty <= 0) return;
    const product = productMap.get(order.productId) || finishedProduct;
    const localRows = buildBomMaterialsForSingleOrder(order, products, boms, globalNodes, product);
    localRows.forEach((row) => {
      const existing = matMap.get(row.productId);
      if (existing) {
        existing.unitNeeded += row.unitNeeded;
        (row.nodeNames || []).forEach((n) => existing.nodeNames.add(n));
      } else {
        matMap.set(row.productId, {
          ...row,
          nodeNames: new Set(row.nodeNames || []),
        });
      }
    });
  });

  return Array.from(matMap.values()).map((v) => ({
    ...v,
    nodeNames: Array.from(v.nodeNames),
  }));
}

function buildIssuedMapForOrder(prodRecords, orderId) {
  const issuedMap = new Map();
  (prodRecords || []).forEach((r) => {
    if (r.partner) return;
    if (r.orderId !== orderId) return;
    if (r.type === 'STOCK_OUT') {
      if (r.reason === '来自于返工') return;
      const pid = r.productId;
      issuedMap.set(pid, (issuedMap.get(pid) || 0) + (Number(r.quantity) || 0));
    } else if (r.type === 'STOCK_RETURN') {
      const pid = r.productId;
      issuedMap.set(pid, (issuedMap.get(pid) || 0) - (Number(r.quantity) || 0));
    }
  });
  return issuedMap;
}

function buildIssuedMapForProduct(prodRecords, groupOrders, sourceProductId) {
  const familyIds = new Set((groupOrders || []).map((o) => o.id));
  const materialIssueHit = (r) => r.sourceProductId === sourceProductId
    || (!r.sourceProductId && r.orderId != null && familyIds.has(r.orderId));

  const issuedMap = new Map();
  (prodRecords || []).forEach((r) => {
    if (r.partner) return;
    if (!materialIssueHit(r)) return;
    if (r.type === 'STOCK_OUT') {
      if (r.reason === '来自于返工') return;
      const pid = r.productId;
      issuedMap.set(pid, (issuedMap.get(pid) || 0) + (Number(r.quantity) || 0));
    } else if (r.type === 'STOCK_RETURN') {
      const pid = r.productId;
      issuedMap.set(pid, (issuedMap.get(pid) || 0) - (Number(r.quantity) || 0));
    }
  });
  return issuedMap;
}

function buildProgressUi(issued, needed) {
  const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
  const overIssue = issued > needed;
  const progressGreenWidth = overIssue && issued > 0 ? (needed / issued) * 100 : pct;
  const progressRedWidth = overIssue && issued > 0 ? ((issued - needed) / issued) * 100 : 0;
  return {
    issuedText: formatQtyDisplay(issued),
    unitNeededText: formatQtyDisplay(needed),
    progressPct: pct,
    overIssue,
    showOverIssue: overIssue,
    progressGreenWidth,
    progressRedWidth,
    progressLabel: overIssue
      ? `净已领 ${formatQtyDisplay(issued)}（超发 ${formatQtyDisplay(issued - needed)}）`
      : `净已领 ${formatQtyDisplay(issued)}`,
  };
}

function buildMaterialIssueUiRows(bomMaterials, issuedMap) {
  return (bomMaterials || []).map((m) => {
    const issued = issuedMap.get(m.productId) || 0;
    const progress = buildProgressUi(issued, m.unitNeeded);
    const nodeNames = m.nodeNames || [];
    return {
      materialProductId: m.productId,
      name: m.name,
      sku: m.sku || '',
      showSku: Boolean(m.sku),
      unitNeeded: roundQty(m.unitNeeded),
      issued: roundQty(issued),
      nodeNames,
      showNodeTags: nodeNames.length > 0,
      issueQty: '',
      ...progress,
    };
  });
}

/** @deprecated 保留旧接口，内部走新口径 */
function buildMaterialIssueRows(order, boms, prodRecords, productsById) {
  const products = productsById instanceof Map
    ? Array.from(productsById.values())
    : Object.values(productsById || {});
  const bomMaterials = buildBomMaterialsForOrder(order, products, boms, []);
  const issuedMap = buildIssuedMapForOrder(prodRecords, order.id);
  return buildMaterialIssueUiRows(bomMaterials, issuedMap).map((row) => ({
    ...row,
    needed: row.unitNeeded,
    pending: Math.max(0, roundQty(row.unitNeeded - row.issued)),
    canIssue: row.unitNeeded - row.issued > 0,
  }));
}

function issuedQtyForMaterial(prodRecords, orderId, materialProductId) {
  const map = buildIssuedMapForOrder(prodRecords, orderId);
  return map.get(materialProductId) || 0;
}

function bomsForProduct(boms, productId) {
  return (boms || []).filter((b) => b.parentProductId === productId);
}

module.exports = {
  roundQty,
  formatQtyDisplay,
  effectiveBomQtyForOrder,
  buildBomMaterialsForOrder,
  buildBomMaterialsForProductGroup,
  buildIssuedMapForOrder,
  buildIssuedMapForProduct,
  buildMaterialIssueUiRows,
  buildMaterialIssueRows,
  issuedQtyForMaterial,
  bomsForProduct,
};
