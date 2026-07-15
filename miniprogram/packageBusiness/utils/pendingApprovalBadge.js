/**
 * 待审报工角标（对齐 Web countPendingApprovalBatches / 工单中心工具栏）
 */
const { listReportHistory, fetchTenantConfig } = require('../../utils/orderApi.js');

function countPendingApprovalBatches(orderReports, productReports) {
  const keys = new Set();
  const add = (r) => {
    const key = r.reportBatchId || r.reportId || r.id;
    if (key) keys.add(String(key));
  };
  (orderReports || []).forEach(add);
  (productReports || []).forEach(add);
  return keys.size;
}

async function computePendingApprovalCount() {
  const config = await fetchTenantConfig().catch(() => ({}));
  const productionLinkMode = (config && config.productionLinkMode) || 'order';
  const hist = await listReportHistory({
    approvalStatus: 'PENDING',
    productionLinkMode,
  });
  return countPendingApprovalBatches(hist.orderReports, hist.productReports);
}

module.exports = {
  countPendingApprovalBatches,
  computePendingApprovalCount,
};
