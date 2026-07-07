/**
 * 返工主列表聚合（对齐 Web ReworkPanel reworkStatsByOrderId / reworkStatsByProductId）
 */

const { OrderDispatchStatus } = require('../config/productionOrders.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON, listProductNameSkuFields } = require('./listProductThumb.js');

function buildOutOfSequenceTemplateIds(nodes) {
  const set = new Set();
  (nodes || []).forEach((n) => {
    if (n.allowOutOfSequence) set.add(n.id);
  });
  return set;
}

function findGatingPredecessorIndex(templateIds, currentIndex, outOfSequenceTemplateIds) {
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    const tid = templateIds[i];
    if (!tid) continue;
    if (!outOfSequenceTemplateIds || !outOfSequenceTemplateIds.has(tid)) return i;
  }
  return -1;
}

function isProcessSequential(nodeId, outOfSequenceTemplateIds) {
  if (nodeId && outOfSequenceTemplateIds && outOfSequenceTemplateIds.has(nodeId)) return false;
  return true;
}

function reworkRemainingAtNode(r, nodeId, outOfSequenceTemplateIds) {
  const pathNodes = r.reworkNodeIds && r.reworkNodeIds.length > 0
    ? r.reworkNodeIds
    : (r.nodeId ? [r.nodeId] : []);
  const idx = pathNodes.indexOf(nodeId);
  if (idx < 0) return 0;
  const doneAtNode = (r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[nodeId])
    ?? ((r.completedNodeIds || []).includes(nodeId) ? r.quantity : 0);
  if (isProcessSequential(nodeId, outOfSequenceTemplateIds)) {
    const gateIdx = findGatingPredecessorIndex(pathNodes, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      const prevNodeId = pathNodes[gateIdx];
      const doneAtPrev = (r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[prevNodeId]) ?? 0;
      return Math.max(0, Math.min(doneAtPrev, r.quantity) - doneAtNode);
    }
  }
  return Math.max(0, r.quantity - doneAtNode);
}

function buildReworkPartnerMap(records) {
  const m = new Map();
  (records || []).forEach((x) => {
    if (x.type === 'OUTSOURCE' && x.sourceReworkId && (x.partner || '').trim()) {
      m.set(String(x.sourceReworkId), (x.partner || '').trim());
    }
  });
  return m;
}

function resolveReworkOutsourcePartner(r, partnerMap) {
  const fromRec = (r.partner || '').trim();
  if (fromRec) return fromRec;
  if (r.id) return partnerMap.get(String(r.id)) || '';
  return '';
}

function orderCreatedMs(order) {
  if (!order) return 0;
  const raw = order.createdAt || order.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function productNewestOrderCreatedMs(productId, orders) {
  let max = 0;
  (orders || []).forEach((o) => {
    if (o.productId !== productId) return;
    max = Math.max(max, orderCreatedMs(o));
  });
  return max;
}

function shouldShowOrderInIncompleteList(order) {
  if (!order) return true;
  return (order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS) !== OrderDispatchStatus.COMPLETED;
}

function buildDataIndexes(orders, products, nodes) {
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  const productsById = new Map((products || []).map((p) => [p.id, p]));
  const nodesById = new Map((nodes || []).map((n) => [n.id, n]));
  const childrenByParentId = new Map();
  (orders || []).forEach((o) => {
    if (!o.parentOrderId) return;
    const arr = childrenByParentId.get(o.parentOrderId) || [];
    arr.push(o);
    childrenByParentId.set(o.parentOrderId, arr);
  });
  const nodeIndexMap = new Map();
  (nodes || []).forEach((n, i) => nodeIndexMap.set(n.id, i));
  return { ordersById, productsById, nodesById, childrenByParentId, nodeIndexMap };
}

function getOrderFamilyIds(orders, parentId, childrenByParentId) {
  const ids = [parentId];
  (childrenByParentId.get(parentId) || []).forEach((c) => ids.push(c.id));
  return ids;
}

function orderBelongsToProductInList(orderId, productId, orders) {
  const o = (orders || []).find((x) => x.id === orderId);
  return o ? o.productId === productId : false;
}

function buildReworkStats(params) {
  const {
    productionLinkMode = 'order',
    records = [],
    orders = [],
    products = [],
    nodes = [],
    processSequenceMode = 'sequential',
  } = params;

  const idx = buildDataIndexes(orders, products, nodes);
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(nodes);
  const reworkPartnerMap = buildReworkPartnerMap(records);
  const reworkRecords = (records || []).filter((r) => r.type === 'REWORK');

  if (productionLinkMode === 'product') {
    const byProduct = new Map();
    reworkRecords.forEach((r) => {
      const pid = r.productId;
      if (!pid || !idx.productsById.has(pid)) return;
      if (r.orderId && !orderBelongsToProductInList(r.orderId, pid, orders)) return;
      const byKey = byProduct.get(pid) || new Map();
      const targetNodes = r.reworkNodeIds && r.reworkNodeIds.length > 0
        ? r.reworkNodeIds
        : (r.nodeId ? [r.nodeId] : []);
      const completed = r.status === '已完成'
        || (targetNodes.length > 0
          && targetNodes.every((n) => ((r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[n]) ?? 0) >= r.quantity));
      const outsourcePartnerName = resolveReworkOutsourcePartner(r, reworkPartnerMap);
      targetNodes.forEach((nodeId) => {
        const groupKey = `${nodeId}\0${outsourcePartnerName}`;
        const cur = byKey.get(groupKey) || {
          nodeId, totalQty: 0, completedQty: 0, pendingSeq: 0, outsourcePartner: outsourcePartnerName,
        };
        cur.totalQty += Number(r.quantity) || 0;
        const doneAtNode = (r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[nodeId])
          ?? ((r.completedNodeIds || []).includes(nodeId) || completed ? r.quantity : 0);
        cur.completedQty += Math.min(Number(r.quantity) || 0, doneAtNode);
        cur.pendingSeq += reworkRemainingAtNode(r, nodeId, outOfSequenceTemplateIds);
        byKey.set(groupKey, cur);
      });
      byProduct.set(pid, byKey);
    });

    const statsByProductId = new Map();
    byProduct.forEach((byKey, pid) => {
      const product = idx.productsById.get(pid);
      const seq = (product && product.milestoneNodeIds) || [];
      let list = Array.from(byKey.values())
        .filter((v) => v.totalQty > 0)
        .map((v) => ({
          nodeId: v.nodeId,
          nodeName: (idx.nodesById.get(v.nodeId) && idx.nodesById.get(v.nodeId).name) || v.nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty,
          outsourcePartner: v.outsourcePartner || undefined,
        }));
      const sortByNodeThenPartner = (a, b, getIdx) => {
        const ia = getIdx(a.nodeId);
        const ib = getIdx(b.nodeId);
        if (ia !== ib) return ia - ib;
        return (a.outsourcePartner ? 1 : 0) - (b.outsourcePartner ? 1 : 0);
      };
      if (seq.length) {
        const seqIndex = new Map();
        seq.forEach((nid, i) => seqIndex.set(nid, i));
        list.sort((a, b) => sortByNodeThenPartner(a, b, (nid) => (
          seqIndex.has(nid) ? seqIndex.get(nid) : 999
        )));
      } else {
        list.sort((a, b) => sortByNodeThenPartner(
          a,
          b,
          (nid) => idx.nodeIndexMap.get(nid) ?? 999,
        ));
      }
      if (list.length > 0) statsByProductId.set(pid, list);
    });
    return { statsByOrderId: new Map(), statsByProductId, idx, outOfSequenceTemplateIds };
  }

  const reworkByOrderId = new Map();
  reworkRecords.forEach((r) => {
    if (!r.orderId) return;
    const arr = reworkByOrderId.get(r.orderId) || [];
    arr.push(r);
    reworkByOrderId.set(r.orderId, arr);
  });

  const statsByOrderId = new Map();
  (orders || []).forEach((order) => {
    const orderReworks = reworkByOrderId.get(order.id);
    if (!orderReworks || !orderReworks.length) return;
    const byKey = new Map();
    orderReworks.forEach((r) => {
      const targetNodes = r.reworkNodeIds && r.reworkNodeIds.length > 0
        ? r.reworkNodeIds
        : (r.nodeId ? [r.nodeId] : []);
      const completed = r.status === '已完成'
        || (targetNodes.length > 0
          && targetNodes.every((n) => ((r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[n]) ?? 0) >= r.quantity));
      const outsourcePartnerName = resolveReworkOutsourcePartner(r, reworkPartnerMap);
      targetNodes.forEach((nodeId) => {
        const groupKey = `${nodeId}\0${outsourcePartnerName}`;
        const cur = byKey.get(groupKey) || {
          nodeId, totalQty: 0, completedQty: 0, pendingSeq: 0, outsourcePartner: outsourcePartnerName,
        };
        cur.totalQty += Number(r.quantity) || 0;
        const doneAtNode = (r.reworkCompletedQuantityByNode && r.reworkCompletedQuantityByNode[nodeId])
          ?? ((r.completedNodeIds || []).includes(nodeId) || completed ? r.quantity : 0);
        cur.completedQty += Math.min(Number(r.quantity) || 0, doneAtNode);
        cur.pendingSeq += reworkRemainingAtNode(r, nodeId, outOfSequenceTemplateIds);
        byKey.set(groupKey, cur);
      });
    });
    const list = Array.from(byKey.values())
      .filter((v) => v.totalQty > 0)
      .map((v) => ({
        nodeId: v.nodeId,
        nodeName: (idx.nodesById.get(v.nodeId) && idx.nodesById.get(v.nodeId).name) || v.nodeId,
        totalQty: v.totalQty,
        completedQty: v.completedQty,
        pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty,
        outsourcePartner: v.outsourcePartner || undefined,
      }))
      .sort((a, b) => {
        const ia = idx.nodeIndexMap.get(a.nodeId) ?? 999;
        const ib = idx.nodeIndexMap.get(b.nodeId) ?? 999;
        if (ia !== ib) return ia - ib;
        return (a.outsourcePartner ? 1 : 0) - (b.outsourcePartner ? 1 : 0);
      });
    if (list.length > 0) statsByOrderId.set(order.id, list);
  });

  return { statsByOrderId, statsByProductId: new Map(), idx, outOfSequenceTemplateIds };
}

function buildReworkListBlocks(params) {
  const {
    productionLinkMode = 'order',
    orders = [],
    statsByOrderId,
    statsByProductId,
    idx,
  } = params;

  const parentOrders = (orders || []).filter((o) => !o.parentOrderId);
  if (productionLinkMode === 'product') {
    return Array.from(statsByProductId.keys())
      .sort((a, b) => {
        const d = productNewestOrderCreatedMs(b, orders) - productNewestOrderCreatedMs(a, orders);
        if (d !== 0) return d;
        return String(a).localeCompare(String(b));
      })
      .map((productId) => ({ type: 'productAggregate', productId }));
  }

  const reworkOrderIds = new Set(
    (orders || [])
      .filter((o) => (statsByOrderId.get(o.id) || []).length > 0)
      .map((o) => o.id),
  );
  const parentHasRework = (parent) => {
    if (reworkOrderIds.has(parent.id)) return true;
    return getOrderFamilyIds(orders, parent.id, idx.childrenByParentId)
      .some((id) => reworkOrderIds.has(id));
  };

  const blocks = [];
  const used = new Set();
  parentOrders.forEach((order) => {
    if (used.has(order.id)) return;
    const childList = idx.childrenByParentId.get(order.id) || [];
    if (childList.length > 0 && parentHasRework(order)) {
      used.add(order.id);
      getOrderFamilyIds(orders, order.id, idx.childrenByParentId).forEach((id) => used.add(id));
      blocks.push({ type: 'parentChild', parent: order, children: childList });
    } else if (statsByOrderId.has(order.id)) {
      used.add(order.id);
      blocks.push({ type: 'single', order });
    }
  });

  return blocks.sort((a, b) => {
    const msA = a.type === 'single' ? orderCreatedMs(a.order) : orderCreatedMs(a.parent);
    const msB = b.type === 'single' ? orderCreatedMs(b.order) : orderCreatedMs(b.parent);
    if (msB !== msA) return msB - msA;
    const idA = a.type === 'single' ? a.order.id : a.parent.id;
    const idB = b.type === 'single' ? b.order.id : b.parent.id;
    return String(idA).localeCompare(String(idB));
  });
}

function filterReworkBlocks(blocks, opts) {
  const {
    searchKeyword = '',
    onlyShowIncompleteOrders = false,
    productionLinkMode = 'order',
    statsByOrderId,
    idx,
  } = opts || {};

  let out = blocks || [];
  if (onlyShowIncompleteOrders) {
    out = out.filter((block) => {
      if (block.type === 'productAggregate') return true;
      if (block.type === 'single') {
        return shouldShowOrderInIncompleteList(block.order);
      }
      const family = [block.parent, ...block.children];
      return family.some(
        (o) => shouldShowOrderInIncompleteList(o) && (statsByOrderId.get(o.id) || []).length > 0,
      );
    });
  }

  const q = String(searchKeyword || '').trim().toLowerCase();
  if (!q) return out;

  const orderHay = (order) => {
    const p = idx.productsById.get(order.productId);
    return [order.orderNumber, order.productName, order.sku, order.customer, p && p.name, p && p.sku]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  };

  return out.filter((block) => {
    if (block.type === 'productAggregate') {
      const fp = idx.productsById.get(block.productId);
      const stats = (opts.statsByProductId && opts.statsByProductId.get(block.productId)) || [];
      const parts = [fp && fp.name, fp && fp.sku, block.productId];
      stats.forEach((s) => {
        parts.push(s.nodeName, s.outsourcePartner);
      });
      return parts.filter(Boolean).join(' ').toLowerCase().includes(q);
    }
    if (block.type === 'single') return orderHay(block.order).includes(q);
    return (orderHay(block.parent) + ' ' + block.children.map(orderHay).join(' ')).includes(q);
  });
}

function mapReworkNodeChips(stats, canReport) {
  return (stats || []).map((s) => {
    const pending = Number(s.pendingQty) || 0;
    const total = Number(s.totalQty) || 0;
    const completed = Number(s.completedQty) || 0;
    const disabled = pending <= 0;
    const partnerSuffix = s.outsourcePartner ? ` · ${s.outsourcePartner}` : '';
    return {
      milestoneId: s.nodeId,
      nodeId: s.nodeId,
      name: s.nodeName || s.nodeId,
      label: s.nodeName || s.nodeId,
      subLabel: disabled ? `${completed}/${total}` : `待返 ${pending}`,
      metaText: `${completed}/${total}`,
      pendingQty: pending,
      totalQty: total,
      completedQty: completed,
      outsourcePartner: s.outsourcePartner || '',
      partnerSuffix,
      disabled: disabled || !canReport,
      isCompleted: pending <= 0 && total > 0,
      chipKey: `${s.nodeId}|${s.outsourcePartner || ''}`,
    };
  });
}

function mapReworkCardForUi(block, ctx) {
  const {
    productionLinkMode = 'order',
    statsByOrderId,
    statsByProductId,
    idx,
    expandedParents = {},
    canReport = false,
    canDetail = false,
    canMaterial = false,
  } = ctx;

  if (block.type === 'productAggregate') {
    const product = idx.productsById.get(block.productId);
    const stats = statsByProductId.get(block.productId) || [];
    const productImageUrl = String((product && product.imageUrl) || '').trim();
    const nameSku = listProductNameSkuFields(product);
    return {
      cardKey: block.productId,
      blockType: 'productAggregate',
      productId: block.productId,
      orderId: '',
      orderNumber: '',
      productName: nameSku.productName,
      productImageUrl,
      productSku: nameSku.productSku,
      showProductSku: nameSku.showProductSku,
      showProductImage: Boolean(productImageUrl),
      placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
      showOrderNumber: false,
      showCustomer: false,
      showDueDate: false,
      showOrderTotal: false,
      chips: mapReworkNodeChips(stats, canReport),
      canDetail,
      canMaterial,
      reworkOrderId: '',
    };
  }

  const mapOrderCard = (order, isChild) => {
    const product = idx.productsById.get(order.productId);
    const stats = statsByOrderId.get(order.id) || [];
    const productImageUrl = String((product && product.imageUrl) || '').trim();
    const nameSku = listProductNameSkuFields(product, { name: order.productName, sku: order.sku });
    const dueDate = order.dueDate ? String(order.dueDate).trim().slice(0, 10) : '';
    const orderTotalQty = (order.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    return {
      cardKey: order.id,
      blockType: isChild ? 'child' : 'single',
      orderId: order.id,
      productId: order.productId || '',
      orderNumber: order.orderNumber || '',
      productName: nameSku.productName,
      productImageUrl,
      productSku: nameSku.productSku,
      showProductSku: nameSku.showProductSku,
      customer: order.customer || '',
      dueDate,
      dueDateLabel: dueDate ? `交期 ${dueDate}` : '',
      orderTotalQty,
      orderTotalQtyText: orderTotalQty > 0 ? `${orderTotalQty} 件` : '',
      showProductImage: Boolean(productImageUrl),
      placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
      showOrderNumber: productionLinkMode !== 'product' && !!order.orderNumber,
      showCustomer: productionLinkMode !== 'product' && !!order.customer,
      showDueDate: productionLinkMode !== 'product' && !!dueDate,
      showOrderTotal: productionLinkMode !== 'product' && orderTotalQty > 0,
      chips: mapReworkNodeChips(stats, canReport),
      canDetail,
      canMaterial,
      reworkOrderId: order.parentOrderId || order.id,
    };
  };

  if (block.type === 'single') {
    return mapOrderCard(block.order, false);
  }

  const parentId = block.parent.id;
  const expanded = !!expandedParents[parentId];
  const parentCard = mapOrderCard(block.parent, false);
  parentCard.blockType = 'parent';
  parentCard.cardKey = parentId;
  parentCard.expanded = expanded;
  parentCard.hasChildren = true;
  parentCard.children = expanded
    ? block.children.map((c) => mapOrderCard(c, true))
    : [];
  return parentCard;
}

module.exports = {
  buildReworkStats,
  buildReworkListBlocks,
  filterReworkBlocks,
  mapReworkCardForUi,
  mapReworkNodeChips,
  shouldShowOrderInIncompleteList,
  reworkRemainingAtNode,
  buildOutOfSequenceTemplateIds,
  buildDataIndexes,
  getOrderFamilyIds,
  orderCreatedMs,
  productNewestOrderCreatedMs,
};
