/**
 * 待入库表单：矩阵、校验、默认值（对齐 Web PendingStockSingleModal）
 */

const _require = require('../../utils/productionPlans.js'),productHasColorSizeMatrix = _require.productHasColorSizeMatrix;
const _require2 = require('../../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require2.buildVariantMatrixUiModel;
const _require3 = require('./reportVariantMaxQty.js'),sumMatrixQuantities = _require3.sumMatrixQuantities;

const WAREHOUSE_PREF_SINGLE = 'PROD_PENDING_STOCK_IN_WAREHOUSE';
const WAREHOUSE_PREF_BATCH = 'PROD_PENDING_STOCK_IN_BATCH_WAREHOUSE';

function readWarehousePreference(kind) {
  const key = kind === 'batch' ? WAREHOUSE_PREF_BATCH : WAREHOUSE_PREF_SINGLE;
  try {
    return wx.getStorageSync(key) || '';
  } catch {
    return '';
  }
}

function writeWarehousePreference(kind, warehouseId) {
  const key = kind === 'batch' ? WAREHOUSE_PREF_BATCH : WAREHOUSE_PREF_SINGLE;
  try {
    if (warehouseId) wx.setStorageSync(key, warehouseId);
  } catch {

    /* ignore */}
}

function resolvePreferredWarehouse(warehouses, kind) {
  const list = warehouses || [];
  if (!list.length) return null;
  const prefId = readWarehousePreference(kind);
  if (prefId) {
    const found = list.find((w) => w.id === prefId);
    if (found) return found;
  }
  return list[0];
}

function buildInitialVariantQuantities(pendingByVariant) {
  const map = {};
  Object.entries(pendingByVariant || {}).forEach(([vid, qty]) => {
    const n = Math.max(0, Number(qty) || 0);
    if (n > 0) map[vid] = n;
  });
  return map;
}

/**
 * 待入库按规格上限：compute 可能只给出通栏 ''，矩阵按 variantId 校验时需拆到各规格
 * （对齐 views/order-list/pendingStockStockInHelpers.tsx expandPendingByVariantForMatrix）
 */
function expandPendingByVariantForMatrix(item, product, category) {
  const pb = item && item.pendingByVariant || {};
  if (!productHasColorSizeMatrix(product, category) || !(product && product.variants && product.variants.length)) {
    return { ...pb };
  }

  const positive = Object.entries(pb).filter(([, q]) => (Number(q) || 0) > 0);
  const onlyUndiff = positive.length === 0 || positive.length === 1 && positive[0][0] === '';

  if (!onlyUndiff) {var _out$;
    const out = { ...pb };
    if (((_out$ = out['']) != null ? _out$ : 0) > 0 && positive.some(([k]) => k !== '')) delete out[''];
    return out;
  }

  const T = item && item.pendingTotal || 0;
  if (T <= 0) return {};

  const weights = new Map();
  for (const v of product.variants) {
    let w = 0;
    for (const o of item.ordersInRow || []) {
      w += (o.items || []).
      filter((i) => (i.variantId || '') === v.id).
      reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    }
    if (w > 0) weights.set(v.id, w);
  }

  const out = {};
  const totalW = [...weights.values()].reduce((s, x) => s + x, 0);
  if (totalW > 0) {
    let rem = T;
    const entries = [...weights.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    entries.forEach(([vid, w], idx) => {
      if (idx === entries.length - 1) {
        out[vid] = rem;
      } else {
        const q = Math.floor(T * w / totalW);
        out[vid] = q;
        rem -= q;
      }
    });
  } else {
    const vs = [...product.variants].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const n = vs.length;
    if (n === 0) return {};
    const base = Math.floor(T / n);
    let rem = T - base * n;
    vs.forEach((v, i) => {
      out[v.id] = base + (i < rem ? 1 : 0);
    });
  }
  return out;
}

function defaultQuantitiesForPendingItem(item) {
  let variantQuantities = {};
  const order = item && item.order;
  const hasLineVariants = order && (order.items || []).some((i) => i.variantId);
  const pb = item && item.pendingByVariant || {};
  if (hasLineVariants && Object.keys(pb).length > 0) {
    Object.entries(pb).forEach(([vid, q]) => {
      if ((Number(q) || 0) > 0) variantQuantities[vid] = Number(q) || 0;
    });
    const sum = Object.values(variantQuantities).reduce((s, q) => s + q, 0);
    if (sum > item.pendingTotal && item.pendingTotal > 0) {
      const scale = item.pendingTotal / sum;
      variantQuantities = Object.fromEntries(
        Object.entries(variantQuantities).map(([vid, q]) => [vid, Math.max(0, Math.round(q * scale))])
      );
    }
  }
  return { variantQuantities, singleQuantity: item.pendingTotal || 0 };
}

/** 打开入库表单默认数量（含颜色尺码矩阵 + 通栏待入库拆规格） */
function buildStockInFormDefaultsForPending(item, product, category) {
  const hasMatrix = productHasColorSizeMatrix(product, category) &&
  product && product.variants && product.variants.length > 0;
  if (!hasMatrix) {
    return defaultQuantitiesForPendingItem(item);
  }

  const pb = item && item.pendingByVariant || {};
  const positive = Object.entries(pb).filter(([, q]) => (Number(q) || 0) > 0);
  const onlyUndiff = positive.length === 0 || positive.length === 1 && positive[0][0] === '';
  const caps = expandPendingByVariantForMatrix(item, product, category);

  if (onlyUndiff) {
    const variantQuantities = {};
    Object.entries(caps).forEach(([vid, cap]) => {
      if ((Number(cap) || 0) > 0) variantQuantities[vid] = Number(cap) || 0;
    });
    return { variantQuantities, singleQuantity: 0 };
  }

  const order = item && item.order;
  let variantQuantities = {};
  if (order && (order.items || []).some((i) => i.variantId)) {
    Object.entries(pb).forEach(([vid, q]) => {
      const raw = Number(q) || 0;
      if (!vid || raw <= 0) return;
      const capVal = caps[vid];
      const cap = capVal != null ? capVal : raw;
      variantQuantities[vid] = Math.min(raw, cap);
    });
  }
  let sum = Object.values(variantQuantities).reduce((s, q) => s + q, 0);
  if (sum > item.pendingTotal && item.pendingTotal > 0) {
    const scale = item.pendingTotal / sum;
    variantQuantities = Object.fromEntries(
      Object.entries(variantQuantities).map(([vid, q]) => [vid, Math.max(0, Math.floor(q * scale))])
    );
    sum = Object.values(variantQuantities).reduce((s, q) => s + q, 0);
  }
  if (sum === 0 && item.pendingTotal > 0 && Object.keys(caps).length > 0) {
    const fromCaps = {};
    Object.entries(caps).forEach(([vid, cap]) => {
      if ((Number(cap) || 0) > 0) fromCaps[vid] = Number(cap) || 0;
    });
    return { variantQuantities: fromCaps, singleQuantity: 0 };
  }
  return { variantQuantities, singleQuantity: 0 };
}

function buildPendingStockItem(row, order, ordersInRow) {
  return {
    rowKey: row.rowKey,
    ordersInRow: ordersInRow || [],
    order: order || ordersInRow && ordersInRow[0] || null,
    orderTotal: row.orderTotal || 0,
    productBlockOrderTotal: row.productBlockOrderTotal || row.orderTotal || 0,
    alreadyIn: row.alreadyIn || 0,
    pendingTotal: row.pendingTotal || 0,
    alreadyInByVariant: row.alreadyInByVariant || {},
    pendingByVariant: row.pendingByVariant || {}
  };
}

function decorateStockInMatrixCell(cell, qtyMap, pendingByVariant, matrixTotal, allowExceed) {
  if (!cell.variantId) {
    return { ...cell, maxQtyLabel: '', maxQty: 0 };
  }
  const pending = Math.max(0, Number((pendingByVariant || {})[cell.variantId]) || 0);
  const currentQty = Number((qtyMap || {})[cell.variantId]) || 0;
  const otherTotal = matrixTotal - currentQty;
  let maxAllowed = pending;
  if (!allowExceed && pending > 0) {
    const cap = pending;
    maxAllowed = Math.max(0, Math.min(pending, cap - otherTotal + currentQty));
  }
  const quantity = qtyMap[cell.variantId] != null ? String(qtyMap[cell.variantId]) : '';
  return {
    ...cell,
    quantity,
    maxQty: maxAllowed,
    maxQtyLabel: `最多 ${maxAllowed}`
  };
}

function patchStockInMatrixLayout(matrixLayout, quantities, pendingByVariant, allowExceed) {
  if (!matrixLayout) return null;
  const qtyMap = quantities || {};
  const matrixTotal = sumMatrixQuantities(qtyMap);
  return {
    sizeColumns: matrixLayout.sizeColumns,
    colorRows: (matrixLayout.colorRows || []).map((row) => ({
      ...row,
      cells: (row.cells || []).map((cell) => decorateStockInMatrixCell(
        cell,
        qtyMap,
        pendingByVariant,
        matrixTotal,
        allowExceed
      ))
    }))
  };
}

function buildStockInMatrixLayout(product, dictionaries, quantities, pendingByVariant, allowExceed) {
  const matrix = buildVariantMatrixUiModel(product, dictionaries, quantities);
  if (!matrix) return null;
  return patchStockInMatrixLayout(matrix, quantities, pendingByVariant, allowExceed);
}

function resolveStockInFormMode(product, category, pendingByVariant) {
  if (productHasColorSizeMatrix(product, category)) return 'matrix';
  const named = Object.keys(pendingByVariant || {}).filter((k) => k !== '');
  if (named.length > 1) return 'multi';
  return 'single';
}

function sumVariantQtyMap(map) {
  return Object.values(map || {}).reduce((s, q) => s + (Number(q) || 0), 0);
}

function validateStockInQty(formMode, quantities, singleQuantity, pendingTotal, pendingByVariant, allowExceed, unitName) {
  const unit = unitName || '件';
  if (formMode === 'matrix' || formMode === 'multi') {
    const total = sumVariantQtyMap(quantities);
    if (total <= 0) return '请填写入库数量';
    if (!allowExceed && pendingTotal > 0 && total > pendingTotal) {
      return `合计最多入库 ${pendingTotal} ${unit}`;
    }
    if (!allowExceed) {
      const over = Object.entries(quantities || {}).find(([vid, qty]) => {
        const n = Number(qty) || 0;
        if (n <= 0) return false;
        const cap = Math.max(0, Number((pendingByVariant || {})[vid]) || 0);
        return n > cap;
      });
      if (over) {
        const cap = Math.max(0, Number((pendingByVariant || {})[over[0]]) || 0);
        return `该规格最多入库 ${cap} ${unit}`;
      }
    }
    return '';
  }
  const qty = Number(singleQuantity) || 0;
  if (qty <= 0) return '请填写入库数量';
  if (!allowExceed && pendingTotal > 0 && qty > pendingTotal) {
    return `最多入库 ${pendingTotal} ${unit}`;
  }
  return '';
}

function buildBatchLineViewModels(rows, lineForms, unitName) {
  const unit = unitName || '件';
  return (rows || []).map((row) => {
    const form = lineForms && lineForms[row.rowKey] || {};
    const pendingTotal = row.pendingTotal || 0;
    const qty = form.singleQuantity != null ? String(form.singleQuantity) : String(pendingTotal || '');
    return {
      rowKey: row.rowKey,
      titleLine: row.orderNumber || row.productName || row.rowKey,
      subtitleLine: row.productName || '',
      pendingTotal,
      quantity: qty,
      pendingMeta: `待入库 ${pendingTotal} ${unit}`
    };
  });
}

module.exports = {
  WAREHOUSE_PREF_SINGLE,
  WAREHOUSE_PREF_BATCH,
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredWarehouse,
  buildInitialVariantQuantities,
  expandPendingByVariantForMatrix,
  buildStockInFormDefaultsForPending,
  buildPendingStockItem,
  buildStockInMatrixLayout,
  patchStockInMatrixLayout,
  resolveStockInFormMode,
  sumVariantQtyMap,
  validateStockInQty,
  buildBatchLineViewModels
};