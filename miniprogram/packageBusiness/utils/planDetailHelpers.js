/**
 * 计划详情辅助（对齐 Web utils/planDetailHelpers.ts）
 */

const PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID = 'sourcePlanId';
const PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER = 'sourcePlanNumber';

function formatPlanCreatedDateList(created) {
  if (!created) return '';
  const s = String(created).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function purchaseOrderRecordMatchesPlanPanel(r, planNumbersForPO, viewPlan) {
  if (!r || r.type !== 'PURCHASE_ORDER' || !r.productId || !viewPlan) return false;
  const cd = r.customData && typeof r.customData === 'object' ? r.customData : {};
  if (String(cd[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID] || '').trim() === viewPlan.id) return true;
  const sn = String(cd[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] || '').trim();
  if (sn && planNumbersForPO.includes(sn)) return true;
  return planNumbersForPO.some((planNum) => String(r.note || '').includes(`计划单[${planNum}]`));
}

const { sumReceivedByOrderLine } = require('./psiOpsAggregators.js');

function buildReceivedByOrderLine(purchaseBills) {
  return sumReceivedByOrderLine(purchaseBills);
}

function buildRelatedPOsByMaterial(purchaseOrders, planNumbersForPO, viewPlan) {
  const map = {};
  (purchaseOrders || []).forEach((r) => {
    if (!purchaseOrderRecordMatchesPlanPanel(r, planNumbersForPO, viewPlan)) return;
    if (!map[r.productId]) map[r.productId] = [];
    map[r.productId].push(r);
  });
  return map;
}

function getInboundProgress(materialId, relatedPOsByMaterial, receivedByOrderLine) {
  const list = relatedPOsByMaterial[materialId];
  if (!list || !list.length) return null;
  let ordered = 0;
  let received = 0;
  list.forEach((r) => {
    ordered += Number(r.quantity) || 0;
    received += receivedByOrderLine[`${r.docNumber}::${r.id}`] || 0;
  });
  return { received, ordered };
}

module.exports = {
  formatPlanCreatedDateList,
  purchaseOrderRecordMatchesPlanPanel,
  buildReceivedByOrderLine,
  buildRelatedPOsByMaterial,
  getInboundProgress,
};
