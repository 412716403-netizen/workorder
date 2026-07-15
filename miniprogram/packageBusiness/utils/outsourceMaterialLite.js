/**
 * 外协物料外发/退回辅助（对齐 Web OutsourceMaterialDispatchModal / OutsourceMaterialReturnModal）
 *
 * 外发清单口径：仅按「外协在途（OUTSOURCE · 加工中）」工序 × BOM 用量汇总物料；
 * 不再灌整张产品全工序 BOM（否则会出现与外协无关的物料）。
 */

const {
  buildBomMaterialsForOrder,
  buildBomMaterialsForProductGroup,
} = require('./orderMaterialLite.js');

function partnerMatchRecord(r, partnerKey) {
  const rp = String(r.partner || '').trim();
  const pk = String(partnerKey || '').trim();
  if (!pk) return false;
  return rp === pk;
}

function buildPartnerIssuedMap(records, scope, partnerKey) {
  const issuedMap = new Map();
  const pk = String(partnerKey || '').trim();
  if (!pk) return issuedMap;
  (records || []).forEach((r) => {
    if (!partnerMatchRecord(r, pk)) return;
    let inScope = false;
    if (scope.sourceProductId) {
      if (r.sourceProductId === scope.sourceProductId) inScope = true;
      else if (r.orderId && scope.orderIds && scope.orderIds.has(r.orderId)) inScope = true;
    } else if (scope.orderId) {
      if (r.orderId === scope.orderId) inScope = true;
      if (scope.orderIds && scope.orderIds.has(r.orderId)) inScope = true;
    }
    if (!inScope) return;
    const pid = r.productId;
    if (!pid) return;
    if (r.type === 'STOCK_OUT') {
      if (r.reason === '来自于返工') return;
      issuedMap.set(pid, (issuedMap.get(pid) || 0) + (Number(r.quantity) || 0));
    } else if (r.type === 'STOCK_RETURN') {
      issuedMap.set(pid, (issuedMap.get(pid) || 0) - (Number(r.quantity) || 0));
    }
  });
  return issuedMap;
}

/**
 * 子工单等：外协记录 variantId 常为父成品规格，与本产品 BOM 规格对不上。
 * 对齐 Web computeOutsourceQtyForNodeVariant。
 */
function computeOutsourceQtyForNodeVariant(
  nodeId,
  variantId,
  outsourceQtyByNode,
  outsourceQtyByNodeVar,
  bomsAtNode,
  productVariantCount,
) {
  const direct = outsourceQtyByNodeVar.get(`${nodeId}|${variantId}`) || 0;
  if (direct > 0) return direct;
  const nodeTotal = outsourceQtyByNode.get(nodeId) || 0;
  if (nodeTotal <= 0) return 0;
  const prefix = `${nodeId}|`;
  const reportedIds = [...outsourceQtyByNodeVar.keys()]
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
  const siblingVariantIds = new Set(
    (bomsAtNode || []).map((b) => b.variantId).filter(Boolean),
  );
  const anyReportedHitsSiblingVariant = reportedIds.some((id) => siblingVariantIds.has(id));
  if (anyReportedHitsSiblingVariant) return 0;
  if (productVariantCount <= 1 || reportedIds.length === 0) return nodeTotal;
  return 0;
}

function effectiveOutsourceQtyForBomFallback(
  bom,
  nodeId,
  outsourceQtyByNode,
  outsourceQtyByNodeVar,
  siblingBomsAtNode,
  productVariantCount,
) {
  if (!bom.variantId) return outsourceQtyByNode.get(nodeId) || 0;
  return computeOutsourceQtyForNodeVariant(
    nodeId,
    bom.variantId,
    outsourceQtyByNode,
    outsourceQtyByNodeVar,
    siblingBomsAtNode,
    productVariantCount,
  );
}

function nodeNameById(globalNodes, nodeId) {
  const n = (globalNodes || []).find((g) => g.id === nodeId);
  return (n && n.name) || nodeId || '';
}

function addBomItemsToMap(matMap, bom, qty, nodeName, products) {
  (bom.items || []).forEach((bi) => {
    if (!bi || !bi.productId) return;
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

/**
 * 从 OUTSOURCE·加工中 流水聚合「工序 / 工序×规格」外协数量（对齐 Web 物料外发）。
 * @returns {{ outsourceQtyByNode: Map, outsourceQtyByNodeVar: Map }}
 */
function buildOpenOutsourceQtyMaps(outsourceRecords, scope) {
  const outsourceQtyByNode = new Map();
  const outsourceQtyByNodeVar = new Map();
  const isProductMode = !!scope.sourceProductId;
  const relOrderIds = isProductMode
    ? new Set((scope.orderIds || []).map((id) => id))
    : undefined;

  (outsourceRecords || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || !r.nodeId || r.sourceReworkId) return;
    if (r.status !== '加工中') return;
    const match = isProductMode
      ? ((r.productId === scope.sourceProductId && !r.orderId)
        || (r.orderId && relOrderIds && relOrderIds.has(r.orderId)))
      : (r.orderId === scope.orderId);
    if (!match) return;
    outsourceQtyByNode.set(r.nodeId, (outsourceQtyByNode.get(r.nodeId) || 0) + (Number(r.quantity) || 0));
    if (r.variantId) {
      const vk = `${r.nodeId}|${r.variantId}`;
      outsourceQtyByNodeVar.set(vk, (outsourceQtyByNodeVar.get(vk) || 0) + (Number(r.quantity) || 0));
    }
  });
  return { outsourceQtyByNode, outsourceQtyByNodeVar };
}

/**
 * 按外协在途工序筛出物料清单（理论需量 = 外协在途件数 × BOM 单耗）。
 */
function buildBomMaterialsByOutsourceQty(params) {
  const {
    product,
    products,
    boms,
    globalNodes,
    outsourceQtyByNode,
    outsourceQtyByNodeVar,
  } = params;
  if (!product) return [];

  const matMap = new Map();
  const variants = product.variants || [];
  const productVariantCount = variants.length;
  const bomsForProduct = (boms || []).filter((b) => b.parentProductId === product.id);

  if (variants.length > 0) {
    variants.forEach((v) => {
      const seenBomIds = new Set();
      if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
        Object.entries(v.nodeBoms).forEach(([nodeId, bomIdRaw]) => {
          const bomId = String(bomIdRaw);
          if (seenBomIds.has(bomId)) return;
          seenBomIds.add(bomId);
          const bom = (boms || []).find((b) => b.id === bomId);
          const bomsAtNode = bomsForProduct.filter((b) => b.nodeId === nodeId);
          const qty = computeOutsourceQtyForNodeVariant(
            nodeId,
            v.id,
            outsourceQtyByNode,
            outsourceQtyByNodeVar,
            bomsAtNode,
            productVariantCount,
          );
          if (bom && qty > 0) {
            addBomItemsToMap(matMap, bom, qty, nodeNameById(globalNodes, nodeId), products);
          }
        });
      } else {
        (boms || [])
          .filter((b) => b.parentProductId === product.id && b.variantId === v.id && b.nodeId)
          .forEach((bom) => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            const nodeId = bom.nodeId;
            const bomsAtNode = bomsForProduct.filter((b) => b.nodeId === nodeId);
            const qty = computeOutsourceQtyForNodeVariant(
              nodeId,
              v.id,
              outsourceQtyByNode,
              outsourceQtyByNodeVar,
              bomsAtNode,
              productVariantCount,
            );
            if (qty > 0) {
              addBomItemsToMap(matMap, bom, qty, nodeNameById(globalNodes, nodeId), products);
            }
          });
      }
    });
  }

  if (matMap.size === 0) {
    const fallbackBoms = (boms || []).filter((b) => b.parentProductId === product.id && b.nodeId);
    fallbackBoms.forEach((bom) => {
      const nodeId = bom.nodeId;
      const siblingAtNode = fallbackBoms.filter((b) => b.nodeId === nodeId);
      const qty = effectiveOutsourceQtyForBomFallback(
        bom,
        nodeId,
        outsourceQtyByNode,
        outsourceQtyByNodeVar,
        siblingAtNode,
        productVariantCount,
      );
      if (qty > 0) {
        addBomItemsToMap(matMap, bom, qty, nodeNameById(globalNodes, nodeId), products);
      }
    });
  }

  return Array.from(matMap.values()).map((v) => ({
    ...v,
    nodeNames: Array.from(v.nodeNames),
  }));
}

/** 外协管理卡片上可用于物料外发的加工厂（外协在途 或 已有外协流水的 partner） */
function listOpenOutsourcePartnersForScope(outsourceRecords, scope, productionLinkMode) {
  const set = new Set();
  const isProduct = productionLinkMode === 'product';
  (outsourceRecords || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || !r.partner || r.sourceReworkId) return;
    if (isProduct) {
      const hit = (r.productId === scope.productId && !r.orderId)
        || (r.sourceProductId === scope.productId)
        || (scope.orderIds && r.orderId && scope.orderIds.has(r.orderId));
      if (!hit) return;
    } else if (r.orderId !== scope.orderId) {
      return;
    }
    set.add(String(r.partner).trim());
  });
  return Array.from(set).filter(Boolean).sort();
}

function listOutsourceDispatchPartnersForCard(records, scope, productionLinkMode) {
  const set = new Set();
  (records || []).forEach((r) => {
    if (r.type !== 'STOCK_OUT' || !r.partner) return;
    if (productionLinkMode === 'product') {
      if (r.sourceProductId === scope.productId
        || (!r.sourceProductId && r.productId === scope.productId)) {
        set.add(r.partner);
      }
    } else if (r.orderId === scope.orderId) {
      set.add(r.partner);
    }
  });
  return Array.from(set).filter(Boolean).sort();
}

function bomRowsToMaterialStats(bomRows, issuedMap) {
  return (bomRows || []).map((row) => {
    const issue = Number(issuedMap.get(row.productId)) || 0;
    return {
      productId: row.productId,
      name: row.name,
      sku: row.sku || '',
      unitNeeded: row.unitNeeded,
      issue,
      returnQty: 0,
      reportCost: 0,
    };
  });
}

function buildOutsourceMaterialPayload(params) {
  const {
    productionLinkMode,
    orderId,
    productId,
    partnerKey,
    partnerLabel,
    orders,
    products,
    boms,
    globalNodes,
    stockRecords,
    outsourceRecords,
  } = params;

  let bomRows = [];
  let orderNumber = '';
  let productName = '';
  let sourceProductId = '';
  const orderIds = new Set();

  if (productionLinkMode === 'product' && productId) {
    const groupOrders = (orders || []).filter((o) => o.productId === productId);
    groupOrders.forEach((o) => orderIds.add(o.id));
    const product = (products || []).find((p) => p.id === productId);
    productName = (product && product.name) || '—';
    sourceProductId = productId;
    const qtyMaps = buildOpenOutsourceQtyMaps(outsourceRecords, {
      sourceProductId: productId,
      orderIds: [...orderIds],
    });
    bomRows = buildBomMaterialsByOutsourceQty({
      product,
      products,
      boms,
      globalNodes,
      outsourceQtyByNode: qtyMaps.outsourceQtyByNode,
      outsourceQtyByNodeVar: qtyMaps.outsourceQtyByNodeVar,
    });
  } else if (orderId) {
    const order = (orders || []).find((o) => o.id === orderId);
    if (!order) return null;
    orderIds.add(order.id);
    orderNumber = order.orderNumber || '';
    const product = (products || []).find((p) => p.id === order.productId);
    productName = (product && product.name) || order.productName || '—';
    sourceProductId = order.productId || '';
    const qtyMaps = buildOpenOutsourceQtyMaps(outsourceRecords, { orderId });
    bomRows = buildBomMaterialsByOutsourceQty({
      product,
      products,
      boms,
      globalNodes,
      outsourceQtyByNode: qtyMaps.outsourceQtyByNode,
      outsourceQtyByNodeVar: qtyMaps.outsourceQtyByNodeVar,
    });
  } else {
    return null;
  }

  const issuedMap = buildPartnerIssuedMap(stockRecords, {
    orderId,
    sourceProductId,
    orderIds,
  }, partnerKey);

  const materials = bomRowsToMaterialStats(bomRows, issuedMap);

  return {
    partnerKey: partnerKey || '',
    partnerLabel: partnerLabel || partnerKey || '',
    orderId: orderId || '',
    sourceProductId,
    orderNumber,
    productName,
    materials,
    products: products || [],
    orders: orders || [],
    stockRecords: stockRecords || [],
  };
}

module.exports = {
  buildPartnerIssuedMap,
  buildOpenOutsourceQtyMaps,
  buildBomMaterialsByOutsourceQty,
  listOpenOutsourcePartnersForScope,
  buildOutsourceMaterialPayload,
  listOutsourceDispatchPartnersForCard,
  // 兼容旧调用方（内部退料预填等）
  buildBomMaterialsForOrder,
  buildBomMaterialsForProductGroup,
};
