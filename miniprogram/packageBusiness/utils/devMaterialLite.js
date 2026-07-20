/**
 * 开发物料领退：UI 派生（对齐 Web utils/devMaterialHelpers）
 */

const BATCH_NO_UNTAGGED = '无批号';

function returnableRowKey(row) {
  const batchNo = !row.batchNo || String(row.batchNo).trim() === ''
    ? BATCH_NO_UNTAGGED
    : String(row.batchNo).trim();
  return `${row.productId}::${row.warehouseId}::${batchNo}`;
}

function buildIssueUiRows(materialData, productsById) {
  const bomIds = (materialData && materialData.bomProductIds) || [];
  const summaryById = new Map(((materialData && materialData.summary) || []).map((s) => [s.productId, s]));
  return bomIds.map((productId) => {
    const summary = summaryById.get(productId);
    const product = productsById && (productsById.get ? productsById.get(productId) : productsById[productId]);
    const productName = (product && product.name) || (summary && summary.productName) || productId;
    const productSku = (product && product.sku) || (summary && summary.productSku) || '';
    return {
      productId,
      materialProductId: productId,
      name: productName,
      productName,
      productSku,
      showProductSku: Boolean(productName && productSku && productName !== productSku),
      netQty: summary ? summary.netQty : 0,
      issuedQty: summary ? summary.issuedQty : 0,
      issueQty: '',
      batchNo: '',
    };
  });
}

function buildReturnUiRows(materialData, warehouseNameById) {
  return ((materialData && materialData.returnable) || []).map((row) => {
    const key = returnableRowKey(row);
    const whName = (warehouseNameById && warehouseNameById[row.warehouseId]) || row.warehouseId;
    return {
      key,
      productId: row.productId,
      productName: row.productName,
      productSku: row.productSku || '',
      showProductSku: Boolean(row.productName && row.productSku && row.productName !== row.productSku),
      warehouseId: row.warehouseId,
      warehouseName: whName,
      batchNo: row.batchNo || BATCH_NO_UNTAGGED,
      returnableQty: row.returnableQty,
      returnQty: '',
    };
  });
}

function buildIssueLines(rows, warehouseId) {
  const lines = [];
  (rows || []).forEach((row) => {
    const quantity = Number(row.issueQty);
    if (!(quantity > 0)) return;
    const line = {
      productId: row.productId,
      quantity,
      warehouseId,
    };
    if (row.needsBatch) {
      const bn = String(row.batchNo || '').trim();
      if (bn) line.batchNo = bn;
    }
    lines.push(line);
  });
  return lines;
}

function buildReturnLines(rows) {
  const lines = [];
  (rows || []).forEach((row) => {
    const quantity = Number(row.returnQty);
    if (!(quantity > 0)) return;
    lines.push({
      productId: row.productId,
      quantity,
      warehouseId: row.warehouseId,
      batchNo: row.batchNo,
    });
  });
  return lines;
}

function formatSummaryCards(materialData) {
  return ((materialData && materialData.summary) || []).map((row) => ({
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku || '',
    showProductSku: Boolean(row.productName && row.productSku && row.productName !== row.productSku),
    issuedQty: row.issuedQty,
    returnedQty: row.returnedQty,
    netQty: row.netQty,
  }));
}

module.exports = {
  BATCH_NO_UNTAGGED,
  returnableRowKey,
  buildIssueUiRows,
  buildReturnUiRows,
  buildIssueLines,
  buildReturnLines,
  formatSummaryCards,
};
