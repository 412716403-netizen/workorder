/**
 * 返工详情页 UI 模型（对齐 Web ReworkOrderDetailModal）
 */

const _require = require('./reworkPanelLite.js'),buildReworkStats = _require.buildReworkStats;
const _require2 = require('./listProductThumb.js'),listProductThumbFromProduct = _require2.listProductThumbFromProduct;

function buildReworkDetailView(opts) {
  const
    reworkDetailOrderId =





    opts.reworkDetailOrderId,_opts$orders = opts.orders,orders = _opts$orders === void 0 ? [] : _opts$orders,_opts$products = opts.products,products = _opts$products === void 0 ? [] : _opts$products,_opts$records = opts.records,records = _opts$records === void 0 ? [] : _opts$records,_opts$nodes = opts.nodes,nodes = _opts$nodes === void 0 ? [] : _opts$nodes,_opts$productionLinkM = opts.productionLinkMode,productionLinkMode = _opts$productionLinkM === void 0 ? 'order' : _opts$productionLinkM;

  const mainOrder = (orders || []).find((o) => o.id === reworkDetailOrderId);
  if (!mainOrder) return null;

  const childOrders = (orders || []).filter((o) => o.parentOrderId === reworkDetailOrderId);
  const orderIds = [reworkDetailOrderId, ...childOrders.map((o) => o.id)];
  const product = (products || []).find((p) => p.id === mainOrder.productId);
  const nodesById = new Map((nodes || []).map((n) => [n.id, n]));
  const orderTotalQty = (mainOrder.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const thumb = listProductThumbFromProduct(product);

  const defectByNode = new Map();
  orderIds.forEach((oid) => {
    const order = (orders || []).find((o) => o.id === oid);
    if (!order) return;
    (order.milestones || []).forEach((ms) => {
      const defective = (ms.reports || []).reduce((s, r) => {var _r$defectiveQuantity;return s + ((_r$defectiveQuantity = r.defectiveQuantity) != null ? _r$defectiveQuantity : 0);}, 0);
      const rework = (records || []).
      filter((r) => r.type === 'REWORK' && r.orderId === oid &&
      (r.sourceNodeId || r.nodeId) === ms.templateId).
      reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const scrap = (records || []).
      filter((r) => r.type === 'SCRAP' && r.orderId === oid && r.nodeId === ms.templateId).
      reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const pending = Math.max(0, defective - rework - scrap);
      if (defective <= 0 && rework <= 0 && scrap <= 0) return;
      const name = nodesById.get(ms.templateId) && nodesById.get(ms.templateId).name || ms.name || ms.templateId;
      const cur = defectByNode.get(ms.templateId) || {
        name, defective: 0, rework: 0, scrap: 0, pending: 0
      };
      cur.defective += defective;
      cur.rework += rework;
      cur.scrap += scrap;
      cur.pending += pending;
      defectByNode.set(ms.templateId, cur);
    });
  });

  const defectRows = Array.from(defectByNode.entries()).
  map(([nodeId, v]) => ({ nodeId, ...v })).
  sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const _buildReworkStats = buildReworkStats({
      productionLinkMode,
      records,
      orders,
      products,
      nodes
    }),statsByOrderId = _buildReworkStats.statsByOrderId;

  const reworkStatsByNode = new Map();
  orderIds.forEach((oid) => {
    const stats = statsByOrderId.get(oid) || [];
    stats.forEach((s) => {
      const cur = reworkStatsByNode.get(s.nodeId) || {
        name: s.nodeName, totalQty: 0, completedQty: 0, pendingQty: 0
      };
      cur.totalQty += s.totalQty;
      cur.completedQty += s.completedQty;
      cur.pendingQty += s.pendingQty;
      reworkStatsByNode.set(s.nodeId, cur);
    });
  });

  const reworkStatRows = Array.from(reworkStatsByNode.entries()).
  map(([nodeId, v]) => ({ nodeId, ...v })).
  sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const defectRecordsList = (records || []).
  filter((r) => (r.type === 'REWORK' || r.type === 'SCRAP') && orderIds.includes(r.orderId || '')).
  sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()).
  map((rec) => {
    const sid = rec.type === 'REWORK' ? rec.sourceNodeId || rec.nodeId : rec.nodeId;
    const sourceName = sid ? nodesById.get(sid) && nodesById.get(sid).name || sid : '—';
    const targetNodes = rec.reworkNodeIds && rec.reworkNodeIds.length > 0 ?
    rec.reworkNodeIds :
    rec.nodeId ? [rec.nodeId] : [];
    const targetLabel = targetNodes.length ?
    targetNodes.map((nid) => nodesById.get(nid) && nodesById.get(nid).name || nid).join('、') :
    '—';
    return {
      id: rec.id,
      docNo: rec.docNo || '—',
      typeLabel: rec.type === 'SCRAP' ? '报损' : rec.partner ? '委外返工' : '厂内返工',
      quantity: rec.quantity,
      qtyText: `${rec.quantity} 件`,
      sourceName,
      targetLabel,
      status: rec.status || '',
      timestamp: rec.timestamp,
      timeLabel: rec.timestamp ? String(rec.timestamp).slice(0, 16) : '—'
    };
  });

  const reworkReportList = (records || []).
  filter((r) => r.type === 'REWORK_REPORT' && orderIds.includes(r.orderId || '')).
  sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()).
  map((rec) => ({
    id: rec.id,
    docNo: rec.docNo || '—',
    quantity: rec.quantity,
    qtyText: `${rec.quantity} 件`,
    nodeName: nodesById.get(rec.nodeId) && nodesById.get(rec.nodeId).name || rec.nodeId || '—',
    timestamp: rec.timestamp,
    timeLabel: rec.timestamp ? String(rec.timestamp).slice(0, 16) : '—',
    operator: rec.operator || '—'
  }));

  return {
    orderId: mainOrder.id,
    orderNumber: mainOrder.orderNumber || '',
    productName: product && product.name || mainOrder.productName || '—',
    productSku: product && product.sku || '',
    customer: mainOrder.customer || '',
    dueDate: mainOrder.dueDate ? String(mainOrder.dueDate).slice(0, 10) : '',
    orderTotalQty,
    orderTotalQtyText: orderTotalQty > 0 ? `${orderTotalQty} 件` : '',
    childCount: childOrders.length,
    showChildren: childOrders.length > 0,
    defectRows,
    reworkStatRows,
    defectRecordsList,
    reworkReportList,
    ...thumb
  };
}

module.exports = {
  buildReworkDetailView
};