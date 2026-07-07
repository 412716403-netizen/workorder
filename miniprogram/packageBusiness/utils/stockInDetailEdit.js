/**
 * 入库流水详情编辑：色码矩阵数量初始化与保存计划（对齐 Web StockInFlowModal saveEdit）
 */
const { flattenMatrixVariantIds } = require('./matrixQtyKeyboard.js');
const { buildVariantMatrixUiModel } = require('./variantQtyMatrix.js');
const { parseNonNegativeInt } = require('./orderReportForm.js');

function initStockInEditMatrixState(rows, product) {
  const quantities = {};
  const variantRecordMap = {};
  const byVid = new Map();
  (rows || []).forEach((r) => {
    const vid = r.variantId || '';
    if (vid) byVid.set(vid, r);
  });
  const first = (rows && rows[0]) || {};

  (product && product.variants || []).forEach((v) => {
    const hit = byVid.get(v.id);
    quantities[v.id] = hit ? String(Number(hit.quantity) || 0) : '0';
    variantRecordMap[v.id] = {
      id: (hit && hit.id) || '',
      orderId: (hit && hit.orderId) || first.orderId || '',
      productId: (hit && hit.productId) || first.productId || (product && product.id) || '',
    };
  });

  return { quantities, variantRecordMap };
}

function buildStockInEditMatrixLayout(product, dictionaries, quantities) {
  return buildVariantMatrixUiModel(product, dictionaries, quantities);
}

function sumStockInEditQuantities(quantities, matrixLayout) {
  if (!matrixLayout) return 0;
  let total = 0;
  flattenMatrixVariantIds(matrixLayout).forEach((vid) => {
    total += parseNonNegativeInt(quantities[vid], 0);
  });
  return total;
}

function validateStockInEditSave(ctx) {
  const { useMatrix, quantities, matrixLayout, singleQty, warehouseId } = ctx;
  if (!warehouseId) return '请选择仓库';
  if (useMatrix) {
    if (sumStockInEditQuantities(quantities, matrixLayout) <= 0) return '请填写入库数量';
    return '';
  }
  if (parseNonNegativeInt(singleQty, 0) <= 0) return '请输入有效数量';
  return '';
}

function buildStockInEditSaveOperations(ctx) {
  const {
    rows,
    quantities,
    variantRecordMap,
    matrixLayout,
    useMatrix,
    warehouseId,
    docNo,
    operator,
    timestamp,
    singleQty,
    collabData,
  } = ctx;

  const ops = [];
  const first = (rows && rows[0]) || {};
  const baseCollab = collabData != null ? collabData : (first.collabData || undefined);

  if (useMatrix && matrixLayout) {
    flattenMatrixVariantIds(matrixLayout).forEach((variantId) => {
      const qty = parseNonNegativeInt(quantities[variantId], 0);
      const meta = variantRecordMap[variantId] || {};
      const recordId = meta.id;

      if (recordId) {
        ops.push({
          type: 'update',
          id: recordId,
          body: {
            quantity: Math.max(0, qty),
            warehouseId: warehouseId || undefined,
            operator: operator || undefined,
          },
        });
      } else if (qty > 0) {
        const body = {
          type: 'STOCK_IN',
          orderId: meta.orderId || first.orderId || undefined,
          productId: meta.productId || first.productId,
          variantId,
          quantity: qty,
          warehouseId: warehouseId || undefined,
          docNo: docNo || undefined,
          operator: operator || first.operator || undefined,
          timestamp: timestamp || first.timestamp || undefined,
          status: '已完成',
        };
        if (baseCollab) body.collabData = baseCollab;
        ops.push({ type: 'create', body });
      }
    });
    return ops;
  }

  const primary = rows[0];
  if (!primary) return ops;
  const qty = parseNonNegativeInt(singleQty, 0);
  ops.push({
    type: 'update',
    id: primary.id,
    body: {
      quantity: qty,
      warehouseId: warehouseId || undefined,
      operator: operator || undefined,
    },
  });
  for (let i = 1; i < rows.length; i += 1) {
    ops.push({ type: 'delete', id: rows[i].id });
  }
  return ops;
}

module.exports = {
  initStockInEditMatrixState,
  buildStockInEditMatrixLayout,
  validateStockInEditSave,
  buildStockInEditSaveOperations,
  sumStockInEditQuantities,
};
