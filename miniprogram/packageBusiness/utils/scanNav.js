/**
 * 构建扫码会话页 URL（条件在 setup 页预选后传入）
 */
function buildScanSessionQuery(params) {
  const parts = ['type=' + encodeURIComponent(params.type || '')];
  const keys = [
    'orderId',
    'productId',
    'milestoneId',
    'nodeId',
    'partnerName',
    'warehouseId',
    'reworkNodeId',
    'orderLabel',
    'nodeName',
    'milestoneName',
    'warehouseName',
    'reworkNodeName',
  ];
  keys.forEach((k) => {
    const v = params[k];
    if (v != null && v !== '') {
      parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
  });
  return parts.join('&');
}

function buildScanSessionUrl(params) {
  return `/packageBusiness/scan-session/scan-session?${buildScanSessionQuery(params)}`;
}

module.exports = {
  buildScanSessionQuery,
  buildScanSessionUrl,
};
