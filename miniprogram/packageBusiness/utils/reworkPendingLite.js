/**
 * 待处理不良行计算（对齐 Web ReworkPanel reworkPendingRows）
 */

const _require = require('./reworkPanelLite.js'),shouldShowOrderInIncompleteList = _require.shouldShowOrderInIncompleteList;
const _require2 = require('../../utils/listProductThumb.js'),listProductNameSkuFields = _require2.listProductNameSkuFields;

function milestoneIndexInOrder(order, nodeId) {
  const idx = (order && order.milestones || []).findIndex((m) => m.templateId === nodeId);
  return idx >= 0 ? idx : 999;
}

function milestoneIndexInProduct(product, nodeId) {
  const seq = product && product.milestoneNodeIds || [];
  const idx = seq.indexOf(nodeId);
  return idx >= 0 ? idx : 999;
}

function latestDefectiveReportMs(reports) {
  if (!reports || !reports.length) return 0;
  let max = 0;
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    if ((Number(r.defectiveQuantity) || 0) <= 0) continue;
    const t = Date.parse(r.timestamp || '');
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}

function buildReworkPendingRows(params) {
  const _params$productionLin =







    params.productionLinkMode,productionLinkMode = _params$productionLin === void 0 ? 'order' : _params$productionLin,_params$records = params.records,records = _params$records === void 0 ? [] : _params$records,_params$orders = params.orders,orders = _params$orders === void 0 ? [] : _params$orders,_params$products = params.products,products = _params$products === void 0 ? [] : _params$products,_params$productMilest = params.productMilestoneProgresses,productMilestoneProgresses = _params$productMilest === void 0 ? [] : _params$productMilest,_params$nodes = params.nodes,nodes = _params$nodes === void 0 ? [] : _params$nodes,_params$onlyShowIncom = params.onlyShowIncompleteOrders,onlyShowIncompleteOrders = _params$onlyShowIncom === void 0 ? false : _params$onlyShowIncom;

  const productsById = new Map((products || []).map((p) => [p.id, p]));
  const nodesById = new Map((nodes || []).map((n) => [n.id, n]));
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  const rootOrdersByProductId = new Map();
  const ordersByProductId = new Map();
  (orders || []).forEach((o) => {
    const arr = ordersByProductId.get(o.productId) || [];
    arr.push(o);
    ordersByProductId.set(o.productId, arr);
    if (!o.parentOrderId) {
      const roots = rootOrdersByProductId.get(o.productId) || [];
      roots.push(o);
      rootOrdersByProductId.set(o.productId, roots);
    }
  });

  if (productionLinkMode === 'order') {
    const reworkByKey = {};
    (records || []).
    filter((r) => r.type === 'REWORK' && r.orderId).
    forEach((r) => {
      const srcNode = r.sourceNodeId || r.nodeId;
      if (!srcNode) return;
      const key = `${r.orderId}|${srcNode}`;
      reworkByKey[key] = (reworkByKey[key] || 0) + (Number(r.quantity) || 0);
    });
    const scrapByKey = {};
    (records || []).
    filter((r) => r.type === 'SCRAP' && r.orderId && r.nodeId).
    forEach((r) => {
      const key = `${r.orderId}|${r.nodeId}`;
      scrapByKey[key] = (scrapByKey[key] || 0) + (Number(r.quantity) || 0);
    });

    const rows = [];
    (orders || []).forEach((order) => {
      if (onlyShowIncompleteOrders && !shouldShowOrderInIncompleteList(order)) return;
      const product = productsById.get(order.productId);
      (order.milestones || []).forEach((ms) => {
        const defectiveTotal = (ms.reports || []).reduce((s, r) => {var _r$defectiveQuantity;return s + ((_r$defectiveQuantity = r.defectiveQuantity) != null ? _r$defectiveQuantity : 0);}, 0);
        if (defectiveTotal <= 0) return;
        const key = `${order.id}|${ms.templateId}`;
        const reworkTotal = reworkByKey[key] || 0;
        const scrapTotal = scrapByKey[key] || 0;
        const pendingQty = defectiveTotal - reworkTotal - scrapTotal;
        if (pendingQty <= 0) return;
        const nameSku = listProductNameSkuFields(product, { name: order.productName, sku: order.sku });
        rows.push({
          rowKey: key,
          scope: 'order',
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          productName: nameSku.productName,
          productSku: nameSku.productSku,
          showProductSku: nameSku.showProductSku,
          nodeId: ms.templateId,
          milestoneName: ms.name,
          defectiveTotal,
          reworkTotal,
          scrapTotal,
          pendingQty,
          pendingQtyText: `${pendingQty} 件`,
          latestDefectiveAtMs: latestDefectiveReportMs(ms.reports)
        });
      });
    });

    rows.sort((a, b) => {
      const d = b.latestDefectiveAtMs - a.latestDefectiveAtMs;
      if (d !== 0) return d;
      const oa = ordersById.get(a.orderId);
      const ob = ordersById.get(b.orderId);
      const ma = milestoneIndexInOrder(oa, a.nodeId);
      const mb = milestoneIndexInOrder(ob, b.nodeId);
      if (ma !== mb) return ma - mb;
      return String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''));
    });
    return rows;
  }

  const prodKey = (productId, nodeId) => `${productId}|${nodeId}`;
  const defectiveMap = new Map();
  const latestDefectiveAtMap = new Map();
  const bumpLatest = (k, reports) => {
    const t = latestDefectiveReportMs(reports);
    if (t > (latestDefectiveAtMap.get(k) || 0)) latestDefectiveAtMap.set(k, t);
  };
  (productMilestoneProgresses || []).forEach((pmp) => {
    const k = prodKey(pmp.productId, pmp.milestoneTemplateId);
    const d = (pmp.reports || []).reduce((s, r) => {var _r$defectiveQuantity2;return s + ((_r$defectiveQuantity2 = r.defectiveQuantity) != null ? _r$defectiveQuantity2 : 0);}, 0);
    defectiveMap.set(k, (defectiveMap.get(k) || 0) + d);
    bumpLatest(k, pmp.reports);
  });
  (orders || []).forEach((order) => {
    (order.milestones || []).forEach((ms) => {
      const d = (ms.reports || []).reduce((s, r) => {var _r$defectiveQuantity3;return s + ((_r$defectiveQuantity3 = r.defectiveQuantity) != null ? _r$defectiveQuantity3 : 0);}, 0);
      if (d <= 0) return;
      const k = prodKey(order.productId, ms.templateId);
      defectiveMap.set(k, (defectiveMap.get(k) || 0) + d);
      bumpLatest(k, ms.reports);
    });
  });

  const reworkProd = new Map();
  (records || []).
  filter((r) => r.type === 'REWORK' && r.productId).
  forEach((r) => {
    const src = r.sourceNodeId || r.nodeId;
    if (!src) return;
    const k = prodKey(r.productId, src);
    reworkProd.set(k, (reworkProd.get(k) || 0) + (Number(r.quantity) || 0));
  });
  const scrapProd = new Map();
  (records || []).
  filter((r) => r.type === 'SCRAP' && r.productId && r.nodeId).
  forEach((r) => {
    const k = prodKey(r.productId, r.nodeId);
    scrapProd.set(k, (scrapProd.get(k) || 0) + (Number(r.quantity) || 0));
  });

  const rows = [];
  defectiveMap.forEach((defectiveTotal, key) => {
    if (defectiveTotal <= 0) return;
    const _key$split = key.split('|'),productId = _key$split[0],nodeId = _key$split[1];
    const reworkTotal = reworkProd.get(key) || 0;
    const scrapTotal = scrapProd.get(key) || 0;
    const pendingQty = defectiveTotal - reworkTotal - scrapTotal;
    if (pendingQty <= 0) return;
    const product = productsById.get(productId);
    const parents = rootOrdersByProductId.get(productId) ||
    ordersByProductId.get(productId) ||
    [];
    const cnt = parents.length;
    const parentNos = parents.map((o) => o.orderNumber).filter(Boolean);
    const productOrdersTitle = parentNos.join('、');
    const productOrdersLine = parentNos.length === 0 ?
    undefined :
    parentNos.length <= 2 ?
    productOrdersTitle :
    `${parentNos.slice(0, 2).join('、')} … 共 ${cnt} 单`;
    const firstNo = parents[0] && parents[0].orderNumber;
    const nameSku = listProductNameSkuFields(product);
    rows.push({
      rowKey: key,
      scope: 'product',
      orderId: '',
      orderNumber: cnt > 1 ? `关联产品（${cnt}条工单）` : firstNo ? `${firstNo}（按产品）` : '按产品汇总',
      productId,
      productName: nameSku.productName,
      productSku: nameSku.productSku,
      showProductSku: nameSku.showProductSku,
      nodeId,
      milestoneName: nodesById.get(nodeId) && nodesById.get(nodeId).name || nodeId,
      defectiveTotal,
      reworkTotal,
      scrapTotal,
      pendingQty,
      pendingQtyText: `${pendingQty} 件`,
      latestDefectiveAtMs: latestDefectiveAtMap.get(key) || 0,
      productOrderCount: cnt,
      productOrdersLine,
      productOrdersTitle: parentNos.length ? productOrdersTitle : undefined
    });
  });

  rows.sort((a, b) => {
    const d = b.latestDefectiveAtMs - a.latestDefectiveAtMs;
    if (d !== 0) return d;
    if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
    const pa = productsById.get(a.productId);
    const pb = productsById.get(b.productId);
    return milestoneIndexInProduct(pa, a.nodeId) - milestoneIndexInProduct(pb, b.nodeId);
  });
  return rows;
}

function filterPendingRows(rows, opts) {
  const searchKeyword = typeof opts === 'string' ? opts : opts && opts.searchKeyword || '';
  const milestoneNodeId = typeof opts === 'object' && opts ? opts.milestoneNodeId || '' : '';
  let out = rows || [];
  if (milestoneNodeId) {
    out = out.filter((row) => row.nodeId === milestoneNodeId);
  }
  const q = String(searchKeyword || '').trim().toLowerCase();
  if (!q) return out;
  return out.filter((row) => {
    const parts = [
    row.orderNumber,
    row.productName,
    row.productSku,
    row.milestoneName,
    row.productOrdersLine];

    return parts.filter(Boolean).join(' ').toLowerCase().includes(q);
  });
}

function buildPendingMilestoneOptions(rows, nodes) {
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
      name: row.milestoneName || node && node.name || id
    });
  });
  rest.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return [{ id: '', name: '全部工序' }].concat(rest);
}

function countPendingRows(rows) {
  return (rows || []).filter((r) => r.pendingQty > 0).length;
}

module.exports = {
  buildReworkPendingRows,
  filterPendingRows,
  buildPendingMilestoneOptions,
  countPendingRows
};