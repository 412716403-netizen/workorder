/**
 * 产品生产详情统计（对齐 Web utils/productProductionDetailStats）
 */

const { combinedCompletedAtTemplate } = require('./productReportHints.js');

function resolveMilestoneTemplateName(templateId, globalNodes, productOrders) {
  const fromGlobal = (globalNodes || []).find((n) => n && n.id === templateId);
  if (fromGlobal && fromGlobal.name) return fromGlobal.name;
  for (let i = 0; i < (productOrders || []).length; i += 1) {
    const ms = ((productOrders[i] && productOrders[i].milestones) || []).find(
      (m) => m && m.templateId === templateId,
    );
    if (ms && ms.name) return ms.name;
  }
  return templateId || '工序';
}

function collectTemplateIds(productId, productOrders, pmps, milestoneNodeIds) {
  const tplIds = new Set();
  (pmps || [])
    .filter((p) => p.productId === productId)
    .forEach((p) => {
      if (p.milestoneTemplateId) tplIds.add(p.milestoneTemplateId);
    });
  (productOrders || []).forEach((o) => {
    (o.milestones || []).forEach((m) => {
      if (!m || !m.templateId) return;
      if ((Number(m.completedQuantity) || 0) > 0 || ((m.reports || []).length > 0)) {
        tplIds.add(m.templateId);
      }
    });
  });
  (milestoneNodeIds || []).forEach((id) => {
    if (id) tplIds.add(id);
  });
  const orderIndex = (id) => {
    const i = (milestoneNodeIds || []).indexOf(id);
    return i >= 0 ? i : 9999;
  };
  return Array.from(tplIds).sort((a, b) => {
    const d = orderIndex(a) - orderIndex(b);
    return d !== 0 ? d : String(a).localeCompare(String(b));
  });
}

function defectiveFromPmp(pmps, productId, nodeId) {
  return (pmps || [])
    .filter((p) => p.productId === productId && p.milestoneTemplateId === nodeId)
    .reduce(
      (s, p) =>
        s + (p.reports || []).reduce((a, r) => a + (Number(r.defectiveQuantity) || 0), 0),
      0,
    );
}

function defectiveFromOrders(productOrders, nodeId) {
  return (productOrders || []).reduce((s, o) => {
    const ms = (o.milestones || []).find((m) => m.templateId === nodeId);
    return (
      s +
      ((ms && ms.reports) || []).reduce((a, r) => a + (Number(r.defectiveQuantity) || 0), 0)
    );
  }, 0);
}

function scrapQtyForNode(productId, productOrders, prodRecords, nodeId) {
  const orderIds = new Set((productOrders || []).map((o) => o.id));
  return (prodRecords || [])
    .filter(
      (r) =>
        r.type === 'SCRAP' &&
        r.nodeId === nodeId &&
        (r.productId === productId || (r.orderId != null && orderIds.has(r.orderId))),
    )
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
}

/** 各工序报工汇总：良品双路；不良 PMP+milestone.reports；报损 SCRAP */
function aggregateProductReportSummaryByNode(
  productId,
  productOrders,
  pmps,
  prodRecords,
  globalNodes,
  milestoneNodeIds,
) {
  const templateIds = collectTemplateIds(
    productId,
    productOrders,
    pmps,
    milestoneNodeIds || [],
  );
  const rows = [];
  templateIds.forEach((nodeId) => {
    const goodQty = Math.round(
      combinedCompletedAtTemplate(productOrders, pmps, productId, nodeId),
    );
    const defQty = Math.round(
      defectiveFromPmp(pmps, productId, nodeId) + defectiveFromOrders(productOrders, nodeId),
    );
    const scrapQty = Math.round(
      scrapQtyForNode(productId, productOrders, prodRecords, nodeId),
    );
    if (goodQty === 0 && defQty === 0 && scrapQty === 0) return;
    rows.push({
      nodeId,
      name: resolveMilestoneTemplateName(nodeId, globalNodes, productOrders),
      goodQty,
      defQty,
      scrapQty,
      goodText: `${goodQty}`,
      defText: defQty > 0 ? `${defQty}` : '—',
      scrapText: scrapQty > 0 ? `${scrapQty}` : '—',
    });
  });
  return rows;
}

/** 产品维度外协合伙人汇总 */
function aggregateProductOutsourcePartners(productId, prodRecords, globalNodes) {
  const nodeNameById = new Map((globalNodes || []).map((n) => [n.id, n.name]));
  const byKey = {};
  (prodRecords || [])
    .filter(
      (r) =>
        r.type === 'OUTSOURCE' &&
        !r.sourceReworkId &&
        r.partner &&
        r.productId === productId,
    )
    .forEach((r) => {
      const nodeId = r.nodeId || '';
      const key = `${r.partner}|${nodeId}`;
      if (!byKey[key]) {
        byKey[key] = {
          partner: r.partner,
          nodeId,
          dispatched: 0,
          received: 0,
        };
      }
      if (r.status === '加工中') byKey[key].dispatched += Number(r.quantity) || 0;
      else if (r.status === '已收回') byKey[key].received += Number(r.quantity) || 0;
    });

  return Object.keys(byKey)
    .map((k) => {
      const v = byKey[k];
      const pending = Math.max(0, v.dispatched - v.received);
      return {
        chipKey: k,
        partner: v.partner,
        nodeId: v.nodeId,
        nodeName: nodeNameById.get(v.nodeId) || v.nodeId || '—',
        dispatched: v.dispatched,
        received: v.received,
        pending,
        metaText: `${v.dispatched}/${pending}`,
        progress:
          v.dispatched > 0
            ? Math.min(100, Math.round((v.received / v.dispatched) * 100))
            : 0,
        isCompleted: pending <= 0 && v.received > 0,
      };
    })
    .filter((v) => v.dispatched > 0 || v.received > 0)
    .sort((a, b) => {
      const d = String(a.nodeName).localeCompare(String(b.nodeName));
      return d !== 0 ? d : String(a.partner || '').localeCompare(String(b.partner || ''));
    });
}

function productStockInAggregates(productId, prodRecords) {
  let alreadyIn = 0;
  (prodRecords || []).forEach((r) => {
    if (r.type === 'STOCK_IN' && r.productId === productId) {
      alreadyIn += Number(r.quantity) || 0;
    }
  });
  return { alreadyIn: Math.round(alreadyIn) };
}

function sumBlockOrderQty(orders) {
  return (orders || []).reduce(
    (s, o) =>
      s + (o.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0),
    0,
  );
}

module.exports = {
  aggregateProductReportSummaryByNode,
  aggregateProductOutsourcePartners,
  productStockInAggregates,
  sumBlockOrderQty,
  resolveMilestoneTemplateName,
};
