/**
 * 外协流水详情编辑：数量矩阵/行编辑与保存计划（对齐 Web OutsourceFlowDocumentDetailModal）
 */
const { flattenMatrixVariantIds } = require('../../utils/matrixQtyKeyboard.js');
const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
const { parseNonNegativeInt } = require('../../utils/orderReportForm.js');
const { productHasColorSizeMatrix } = require('../../utils/productionPlans.js');
const { editPartsToTimestamp } = require('./reportBatchDetail.js');

function splitOutsourceRecords(records) {
  const list = records || [];
  return {
    dispatchRows: list.filter((r) => r.status !== '已收回'),
    receiveRows: list.filter((r) => r.status === '已收回'),
  };
}

function initOutsourceSectionEditState(sectionRows, product, category) {
  const rows = sectionRows || [];
  const useMatrix = Boolean(
    product
    && productHasColorSizeMatrix(product, category)
    && rows.some((r) => r.variantId),
  );

  if (useMatrix) {
    const quantities = {};
    const unitPrices = {};
    const variantRecordMap = {};
    const byVid = new Map();
    rows.forEach((r) => {
      if (r.variantId) byVid.set(r.variantId, r);
    });
    (product.variants || []).forEach((v) => {
      const hit = byVid.get(v.id);
      quantities[v.id] = hit ? String(Number(hit.quantity) || 0) : '0';
      if (hit && hit.unitPrice != null && hit.unitPrice !== '') {
        unitPrices[v.id] = String(Number(hit.unitPrice) || 0);
      }
      variantRecordMap[v.id] = { record: hit || null };
    });
    return {
      useMatrix: true,
      quantities,
      unitPrices,
      variantRecordMap,
      lineItems: [],
      singleQty: '0',
    };
  }

  if (rows.length > 1) {
    return {
      useMatrix: false,
      quantities: {},
      unitPrices: {},
      variantRecordMap: {},
      lineItems: rows.map((r) => ({
        recordId: r.id,
        editQty: String(Number(r.quantity) || 0),
        editUnitPrice: r.unitPrice != null && r.unitPrice !== '' ? String(Number(r.unitPrice) || 0) : '',
      })),
      singleQty: '0',
    };
  }

  const first = rows[0] || {};
  return {
    useMatrix: false,
    quantities: {},
    unitPrices: {},
    variantRecordMap: {},
    lineItems: [],
    singleQty: first.id ? String(Number(first.quantity) || 0) : '0',
    editUnitPrice: first.unitPrice != null && first.unitPrice !== '' ? String(Number(first.unitPrice) || 0) : '',
  };
}

function buildOutsourceEditMatrixLayout(product, dictionaries, quantities) {
  if (!product) return null;
  return buildVariantMatrixUiModel(product, dictionaries, quantities);
}

function sumSectionMatrixQty(quantities, matrixLayout) {
  if (!matrixLayout) return 0;
  let total = 0;
  flattenMatrixVariantIds(matrixLayout).forEach((vid) => {
    total += parseNonNegativeInt(quantities[vid], 0);
  });
  return total;
}

function validateOutsourceFlowEditSave(ctx) {
  const {
    partnerName,
    dispatchState,
    receiveState,
    dispatchMatrixLayout,
    receiveMatrixLayout,
    hasDispatch,
    hasReceive,
  } = ctx;

  if (!String(partnerName || '').trim()) return '请选择合作单位';

  if (hasDispatch) {
    if (dispatchState.useMatrix) {
      if (sumSectionMatrixQty(dispatchState.quantities, dispatchMatrixLayout) <= 0) {
        return '请填写发出数量';
      }
    } else if (dispatchState.lineItems.length) {
      const ok = dispatchState.lineItems.some((line) => parseNonNegativeInt(line.editQty, 0) > 0);
      if (!ok) return '请填写发出数量';
    } else if (parseNonNegativeInt(dispatchState.singleQty, 0) <= 0) {
      return '请填写发出数量';
    }
  }

  if (hasReceive) {
    if (receiveState.useMatrix) {
      if (sumSectionMatrixQty(receiveState.quantities, receiveMatrixLayout) <= 0) {
        return '请填写收回数量';
      }
    } else if (receiveState.lineItems.length) {
      const ok = receiveState.lineItems.some((line) => parseNonNegativeInt(line.editQty, 0) > 0);
      if (!ok) return '请填写收回数量';
    } else if (parseNonNegativeInt(receiveState.singleQty, 0) <= 0) {
      return '请填写收回数量';
    }
  }

  if (!hasDispatch && !hasReceive) return '无可保存的明细';
  return '';
}

function buildOutsourceRecordBody(params) {
  const {
    ref,
    qty,
    status,
    partner,
    operator,
    timestamp,
    docNo,
    productionLinkMode,
    ordersById,
    unitPrice,
    collabData,
  } = params;

  const variantField = ref.variantId ? { variantId: ref.variantId } : {};
  const amount = unitPrice != null && unitPrice > 0
    ? Math.round(qty * unitPrice * 100) / 100
    : undefined;

  const base = {
    type: 'OUTSOURCE',
    quantity: qty,
    operator: operator || ref.operator || '',
    timestamp: timestamp || ref.timestamp || undefined,
    status,
    partner,
    docNo,
    nodeId: ref.nodeId,
    unitPrice: unitPrice != null && unitPrice > 0 ? unitPrice : undefined,
    amount,
    ...variantField,
  };

  if (collabData) base.collabData = collabData;

  if (productionLinkMode === 'product' || !ref.orderId) {
    return { ...base, productId: ref.productId };
  }

  const order = ordersById.get(ref.orderId);
  if (!order) return null;
  return {
    ...base,
    orderId: ref.orderId,
    productId: order.productId,
  };
}

function appendSectionCreates(ctx, sectionRows, state, matrixLayout, status) {
  const {
    createBatch,
    partner,
    operator,
    timestamp,
    docNo,
    productionLinkMode,
    ordersById,
    isReceive,
  } = ctx;

  const rows = sectionRows || [];
  if (!rows.length) return;
  const first = rows[0];
  const collabData = first.collabData || undefined;

  if (state.useMatrix && matrixLayout) {
    flattenMatrixVariantIds(matrixLayout).forEach((variantId) => {
      const qty = parseNonNegativeInt(state.quantities[variantId], 0);
      if (qty <= 0) return;
      const meta = state.variantRecordMap[variantId] || {};
      const ref = (meta.record) || { ...first, variantId };
      let unitPrice;
      if (isReceive) {
        const raw = state.unitPrices[variantId];
        unitPrice = raw != null && raw !== '' ? Number(raw) : Number(ref.unitPrice) || undefined;
      }
      const body = buildOutsourceRecordBody({
        ref: { ...ref, variantId },
        qty,
        status,
        partner,
        operator,
        timestamp,
        docNo,
        productionLinkMode,
        ordersById,
        unitPrice,
        collabData,
      });
      if (body) createBatch.push(body);
    });
    return;
  }

  if (state.lineItems.length) {
    state.lineItems.forEach((line, index) => {
      const ref = rows[index] || first;
      const qty = parseNonNegativeInt(line.editQty, 0);
      if (qty <= 0) return;
      let unitPrice;
      if (isReceive && line.editUnitPrice !== undefined) {
        unitPrice = line.editUnitPrice !== '' ? Number(line.editUnitPrice) : undefined;
      }
      const body = buildOutsourceRecordBody({
        ref,
        qty,
        status,
        partner,
        operator,
        timestamp,
        docNo,
        productionLinkMode,
        ordersById,
        unitPrice,
        collabData,
      });
      if (body) createBatch.push(body);
    });
    return;
  }

  const qty = parseNonNegativeInt(state.singleQty, 0);
  if (qty <= 0) return;
  let unitPrice;
  if (isReceive && state.editUnitPrice !== undefined && state.editUnitPrice !== '') {
    unitPrice = Number(state.editUnitPrice);
  }
  const body = buildOutsourceRecordBody({
    ref: first,
    qty,
    status,
    partner,
    operator,
    timestamp,
    docNo,
    productionLinkMode,
    ordersById,
    unitPrice,
    collabData,
  });
  if (body) createBatch.push(body);
}

function buildOutsourceFlowEditSavePlan(ctx) {
  const {
    records,
    partnerName,
    operator,
    editDate,
    editTime,
    docNo,
    productionLinkMode,
    ordersById,
    dispatchState,
    receiveState,
    dispatchMatrixLayout,
    receiveMatrixLayout,
  } = ctx;

  const { dispatchRows, receiveRows } = splitOutsourceRecords(records);
  const timestamp = editPartsToTimestamp(editDate, editTime);
  const partner = String(partnerName || '').trim();
  const deleteIds = (records || []).map((r) => r.id).filter(Boolean);
  const createBatch = [];

  const sectionCtx = {
    createBatch,
    partner,
    operator,
    timestamp,
    docNo,
    productionLinkMode,
    ordersById,
  };

  appendSectionCreates(
    { ...sectionCtx, isReceive: false },
    dispatchRows,
    dispatchState,
    dispatchMatrixLayout,
    '加工中',
  );
  appendSectionCreates(
    { ...sectionCtx, isReceive: true },
    receiveRows,
    receiveState,
    receiveMatrixLayout,
    '已收回',
  );

  return { deleteIds, createBatch };
}

module.exports = {
  splitOutsourceRecords,
  initOutsourceSectionEditState,
  buildOutsourceEditMatrixLayout,
  validateOutsourceFlowEditSave,
  buildOutsourceFlowEditSavePlan,
  sumSectionMatrixQty,
};
