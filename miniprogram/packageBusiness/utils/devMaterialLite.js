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

/** 试制 BOM 顶层物料单个用量（跨变体/工序按 productId 去重，保留首次用量） */
function buildDevBomUnitQtyMap(boms) {
  const map = new Map();
  (boms || []).forEach((bom) => {
    ((bom && bom.items) || []).forEach((item) => {
      const productId = String((item && item.productId) || '').trim();
      if (!productId || map.has(productId)) return;
      const qty = Number(item && item.quantity);
      if (!Number.isFinite(qty)) return;
      map.set(productId, qty);
    });
  });
  return map;
}

function formatUnitQty(raw) {
  if (raw == null || !Number.isFinite(Number(raw))) return '';
  const t = Number(Number(raw).toFixed(6));
  return String(t);
}

function productLabel(productsById, summaryById, productId) {
  const summary = summaryById && summaryById.get(productId);
  const product = productsById && (productsById.get ? productsById.get(productId) : productsById[productId]);
  const productName = (product && product.name) || (summary && summary.productName) || productId;
  const productSku = (product && product.sku) || (summary && summary.productSku) || '';
  return {
    productName,
    productSku,
    showProductSku: Boolean(productName && productSku && productName !== productSku),
  };
}

/**
 * @deprecated 仅顶层扁平行；领料页请用 buildIssueUiRowsFromFlat + 树展开
 */
function buildIssueUiRows(materialData, productsById, unitQtyByProductId) {
  const bomIds = (materialData && materialData.bomProductIds) || [];
  const summaryById = new Map(((materialData && materialData.summary) || []).map((s) => [s.productId, s]));
  const qtyMap = unitQtyByProductId instanceof Map
    ? unitQtyByProductId
    : new Map(Object.entries(unitQtyByProductId || {}));
  return bomIds.map((productId) => {
    const summary = summaryById.get(productId);
    const label = productLabel(productsById, summaryById, productId);
    const unitQty = qtyMap.has(productId) ? qtyMap.get(productId) : null;
    return {
      productId,
      materialProductId: productId,
      name: label.productName,
      productName: label.productName,
      productSku: label.productSku,
      showProductSku: label.showProductSku,
      netQty: summary ? summary.netQty : 0,
      issuedQty: summary ? summary.issuedQty : 0,
      unitQty: unitQty == null ? null : Number(unitQty),
      unitQtyText: formatUnitQty(unitQty),
      issueQty: '',
      batchNo: '',
      level: 1,
      hasChildren: false,
      rowKey: productId,
      expanded: false,
      indentPx: 0,
    };
  });
}

/**
 * 由树扁平可见行生成领料 UI 行（含子物料缩进 / 展开态）
 * @param {Array} flatRows flattenVisibleRows 结果
 * @param {object} materialData
 * @param {Map} productsById
 * @param {{ qtyByProduct?: object, batchMetaByProduct?: Map }} [state]
 */
function buildIssueUiRowsFromFlat(flatRows, materialData, productsById, state) {
  const summaryById = new Map(((materialData && materialData.summary) || []).map((s) => [s.productId, s]));
  const qtyByProduct = (state && state.qtyByProduct) || {};
  const batchMetaByProduct = (state && state.batchMetaByProduct) || new Map();
  return (flatRows || []).map((flat) => {
    const productId = flat.productId;
    const summary = summaryById.get(productId);
    const label = productLabel(productsById, summaryById, productId);
    const unitQty = flat.unitQty == null || !Number.isFinite(Number(flat.unitQty))
      ? null
      : Number(flat.unitQty);
    const batchMeta = batchMetaByProduct.get
      ? batchMetaByProduct.get(productId)
      : batchMetaByProduct[productId];
    const level = Math.max(1, Number(flat.level) || 1);
    return {
      productId,
      materialProductId: productId,
      name: label.productName,
      productName: label.productName,
      productSku: label.productSku,
      showProductSku: label.showProductSku,
      netQty: summary ? summary.netQty : 0,
      issuedQty: summary ? summary.issuedQty : 0,
      unitQty,
      unitQtyText: formatUnitQty(unitQty),
      issueQty: qtyByProduct[productId] != null ? String(qtyByProduct[productId]) : '',
      level,
      hasChildren: Boolean(flat.hasChildren),
      rowKey: flat.rowKey,
      expanded: Boolean(flat.expanded),
      indentPx: (level - 1) * 20,
      ...(batchMeta || {
        needsBatch: false,
        batchNo: '',
        batchOptions: [],
        batchPickerRange: [],
        batchIndex: 0,
        batchDisplayText: '',
        batchStock: 0,
      }),
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

/** 领料行按 productId 去重：同一物料可挂在多个父料下，只应生成一条出库行（对齐 Web 的 qtyByProduct） */
function buildIssueLines(rows, warehouseId) {
  const lines = [];
  const seen = new Set();
  (rows || []).forEach((row) => {
    const quantity = Number(row.issueQty);
    if (!(quantity > 0)) return;
    if (seen.has(row.productId)) return;
    seen.add(row.productId);
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
  buildDevBomUnitQtyMap,
  buildIssueUiRows,
  buildIssueUiRowsFromFlat,
  buildReturnUiRows,
  buildIssueLines,
  buildReturnLines,
  formatSummaryCards,
};
