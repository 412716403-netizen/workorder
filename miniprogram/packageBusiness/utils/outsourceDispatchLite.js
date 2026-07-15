/**
 * 外协待发清单（对齐 Web OutsourcePanel.outsourceDispatchRows，含色码矩阵）
 */

const {
  isProcessSequential,
  findGatingPredecessorIndex,
  buildOutOfSequenceTemplateIds,
  sumOrderQty,
} = require('./orderProcessChips.js');
const { productHasColorSizeMatrix } = require('./productionPlans.js');
const { dispatchRowKey } = require('./outsourceReceiveKeys.js');
const {
  buildDefectiveReworkByOrderMilestone,
  productOutsourceDispatchUsesAggregateVariantPool,
  sumOutsourceableByVariantProductMatrix,
} = require('./outsourceDispatchMatrix.js');
const { productGroupMaxReportableSum } = require('./productReportHints.js');
const { listProductThumbFromProduct } = require('./listProductThumb.js');

function orderCreatedMs(order) {
  if (!order) return 0;
  const t = new Date(order.createdAt || order.created_at || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function productNewestOrderCreatedMs(productId, orders) {
  let max = 0;
  (orders || []).forEach((o) => {
    if (o.productId === productId) max = Math.max(max, orderCreatedMs(o));
  });
  return max;
}

function milestoneIndexInOrder(order, nodeId) {
  const idx = (order && order.milestones || []).findIndex((m) => m.templateId === nodeId);
  return idx >= 0 ? idx : 9999;
}

function milestoneIndexInProduct(product, nodeId) {
  const seq = (product && product.milestoneNodeIds) || [];
  const idx = seq.indexOf(nodeId);
  return idx >= 0 ? idx : 9999;
}

function combinedCompletedAtTemplate(blockOrders, pmp, productId, nodeId) {
  let sum = 0;
  (blockOrders || []).forEach((order) => {
    const ms = (order.milestones || []).find((m) => m.templateId === nodeId);
    sum += Number(ms && ms.completedQuantity) || 0;
  });
  (pmp || []).forEach((row) => {
    if (row.productId !== productId || row.milestoneTemplateId !== nodeId) return;
    (row.reports || []).forEach((r) => {
      sum += Number(r.quantity) || 0;
    });
  });
  return sum;
}

function buildOutsourceDispatchRows(params) {
  const {
    productionLinkMode = 'order',
    records = [],
    orders = [],
    products = [],
    nodes = [],
    categories = [],
    productMilestoneProgresses = [],
    processSequenceMode = 'sequential',
    onlyShowIncompleteOrders = false,
  } = params;

  const nodesById = new Map((nodes || []).map((n) => [n.id, n]));
  const productsById = new Map((products || []).map((p) => [p.id, p]));
  const categoryById = new Map((categories || []).map((c) => [c.id, c]));
  const ordersByProductId = new Map();
  (orders || []).forEach((o) => {
    if (!o.productId) return;
    if (!ordersByProductId.has(o.productId)) ordersByProductId.set(o.productId, []);
    ordersByProductId.get(o.productId).push(o);
  });

  const outsourceRecords = (records || []).filter((r) => r.type === 'OUTSOURCE');
  const outOfSequenceTemplateIds = buildOutOfSequenceTemplateIds(nodes);
  const isProductMode = productionLinkMode === 'product';
  const defectiveReworkMap = buildDefectiveReworkByOrderMilestone(orders, records);
  const getDr = (oid, tid) => defectiveReworkMap.get(`${oid}|${tid}`)
    || { defective: 0, rework: 0, reworkByVariant: {} };

  if (isProductMode) {
    const dispatchedByKey = {};
    const receivedByKey = {};
    outsourceRecords.forEach((r) => {
      if (!r.nodeId || !r.productId) return;
      const key = `${r.productId}|${r.nodeId}`;
      if (r.status === '加工中') dispatchedByKey[key] = (dispatchedByKey[key] || 0) + (Number(r.quantity) || 0);
      else if (r.status === '已收回') receivedByKey[key] = (receivedByKey[key] || 0) + (Number(r.quantity) || 0);
    });

    const rows = [];
    (products || []).forEach((product) => {
      const productId = String(product.id);
      const category = categoryById.get(product.categoryId);
      const blockOrders = ordersByProductId.get(productId) || [];
      const nodeIds = ((product.milestoneNodeIds) || []).filter((nid) => {
        const node = nodesById.get(nid);
        return node && node.allowOutsource;
      });

      nodeIds.forEach((nodeId) => {
        const node = nodesById.get(nodeId);
        // 对齐 Web：含不良扣减 + 返工完成回补（getDr.rework）
        const maxReportable = blockOrders.length > 0
          ? productGroupMaxReportableSum(
            blockOrders,
            nodeId,
            productId,
            productMilestoneProgresses,
            processSequenceMode,
            getDr,
            orders,
            outOfSequenceTemplateIds,
          )
          : 0;
        const reportedQty = combinedCompletedAtTemplate(
          blockOrders,
          productMilestoneProgresses,
          productId,
          nodeId,
        );
        const key = `${productId}|${nodeId}`;
        const dispatchedQty = Math.max(
          0,
          (dispatchedByKey[key] || 0) - (receivedByKey[key] || 0),
        );
        const availableQtyRaw = Math.max(0, maxReportable - reportedQty - dispatchedQty);
        if (availableQtyRaw <= 0) return;
        const hasMatrix = productHasColorSizeMatrix(product, category);
        let availableQty = availableQtyRaw;
        if (
          hasMatrix
          && !productOutsourceDispatchUsesAggregateVariantPool(
            blockOrders,
            productMilestoneProgresses,
            productId,
            nodeId,
            product,
          )
        ) {
          const capSum = sumOutsourceableByVariantProductMatrix(
            outsourceRecords,
            product,
            nodeId,
            blockOrders,
            productMilestoneProgresses,
            processSequenceMode,
            getDr,
            outOfSequenceTemplateIds,
          );
          if (Number.isFinite(capSum)) {
            availableQty = Math.min(availableQtyRaw, capSum);
          }
        }
        if (availableQty <= 0) return;
        rows.push({
          productId,
          productName: product.name || '—',
          nodeId,
          milestoneName: (node && node.name) || nodeId,
          orderTotalQty: maxReportable,
          reportedQty,
          dispatchedQty,
          availableQty,
          hasMatrix,
        });
      });
    });

    return rows.sort((a, b) => {
      const d = productNewestOrderCreatedMs(b.productId, orders)
        - productNewestOrderCreatedMs(a.productId, orders);
      if (d !== 0) return d;
      if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
      const pa = productsById.get(a.productId);
      const pb = productsById.get(b.productId);
      return milestoneIndexInProduct(pa, a.nodeId) - milestoneIndexInProduct(pb, b.nodeId);
    });
  }

  const dispatchedByKey = {};
  const receivedByKey = {};
  outsourceRecords.forEach((r) => {
    if (!r.nodeId || !r.orderId) return;
    const key = `${r.orderId}|${r.nodeId}`;
    if (r.status === '加工中') dispatchedByKey[key] = (dispatchedByKey[key] || 0) + (Number(r.quantity) || 0);
    else if (r.status === '已收回') receivedByKey[key] = (receivedByKey[key] || 0) + (Number(r.quantity) || 0);
  });

  const rows = [];
  (orders || []).forEach((order) => {
    if (onlyShowIncompleteOrders && order.dispatchStatus === 'COMPLETED') return;
    const rawOrderTotalQty = sumOrderQty(order);
    const product = productsById.get(order.productId);
    const category = product ? categoryById.get(product.categoryId) : null;
    const hasMatrix = productHasColorSizeMatrix(product, category);
    const templateIds = (order.milestones || []).map((m) => m.templateId);

    (order.milestones || []).forEach((ms, idx) => {
      const node = nodesById.get(ms.templateId);
      if (!node || !node.allowOutsource) return;
      if (product && !(product.milestoneNodeIds || []).includes(ms.templateId)) return;

      let baseQty = rawOrderTotalQty;
      if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
        const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
        if (gateIdx >= 0) {
          const prev = order.milestones[gateIdx];
          baseQty = Number(prev && prev.completedQuantity) || 0;
        }
      }
      // 对齐 Web：返工完成数量（rework）回补到可外协基数
      const dr = getDr(order.id, ms.templateId);
      const maxReportable = Math.max(0, baseQty - dr.defective + dr.rework);
      const key = `${order.id}|${ms.templateId}`;
      const dispatchedQty = Math.max(
        0,
        (dispatchedByKey[key] || 0) - (receivedByKey[key] || 0),
      );
      const reportedQty = Number(ms.completedQuantity) || 0;
      const availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
      if (availableQty <= 0) return;

      rows.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        productId: order.productId,
        productName: (product && product.name) || order.productName || '—',
        nodeId: ms.templateId,
        milestoneName: ms.name,
        orderTotalQty: maxReportable,
        reportedQty,
        dispatchedQty,
        availableQty,
        hasMatrix,
      });
    });
  });

  return rows.sort((a, b) => {
    const oa = (orders || []).find((o) => o.id === a.orderId);
    const ob = (orders || []).find((o) => o.id === b.orderId);
    const d = orderCreatedMs(ob) - orderCreatedMs(oa);
    if (d !== 0) return d;
    const ma = milestoneIndexInOrder(oa, a.nodeId);
    const mb = milestoneIndexInOrder(ob, b.nodeId);
    if (ma !== mb) return ma - mb;
    return String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''));
  });
}

function mapDispatchRowForUi(row, productionLinkMode, selectedKeys, productsById) {
  const key = dispatchRowKey(row);
  const selected = selectedKeys && selectedKeys.has(key);
  const availableQty = Number(row.availableQty) || 0;
  const product = productsById && row.productId ? productsById.get(row.productId) : null;
  const thumb = listProductThumbFromProduct(product);
  return {
    ...row,
    ...thumb,
    rowKey: key,
    selected,
    showOrderNumber: productionLinkMode !== 'product' && !!row.orderNumber,
    subtitleLine: productionLinkMode === 'product'
      ? (row.productName || '—')
      : `${row.orderNumber || '—'} · ${row.productName || '—'}`,
    milestoneName: row.milestoneName || '—',
    availableQty,
    availableQtyText: String(availableQty),
  };
}

function buildDispatchMilestoneOptions(rows, nodes) {
  const nodesById = new Map((nodes || []).map((n) => [n.id, n]));
  const seen = new Set();
  const rest = [];
  (rows || []).forEach((row) => {
    const id = row.nodeId;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const node = nodesById.get(id);
    rest.push({
      id,
      name: row.milestoneName || (node && node.name) || id,
    });
  });
  rest.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return [{ id: '', name: '全部工序' }].concat(rest);
}

function filterDispatchRows(rows, keyword, filterOptions) {
  const milestoneNodeId = (filterOptions && filterOptions.milestoneNodeId) || '';
  let list = rows || [];
  if (milestoneNodeId) {
    list = list.filter((row) => row.nodeId === milestoneNodeId);
  }
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((row) => {
    const parts = [
      row.orderNumber,
      row.productName,
      row.milestoneName,
    ].filter(Boolean);
    return parts.join(' ').toLowerCase().includes(q);
  });
}

module.exports = {
  buildOutsourceDispatchRows,
  buildDispatchMilestoneOptions,
  mapDispatchRowForUi,
  filterDispatchRows,
  dispatchRowKey,
};
