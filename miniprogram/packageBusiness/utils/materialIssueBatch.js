/**
 * 工单领料批次（对齐 Web MaterialIssueBatchSelect + MaterialIssueModal 校验）
 */

const _require = require('./materialStockConfirm.js'),BATCH_NO_UNTAGGED = _require.BATCH_NO_UNTAGGED;

function normalizeBatchNoFromApi(raw) {
  const s = String(raw != null ? raw : '').trim();
  return s || BATCH_NO_UNTAGGED;
}

function formatBatchOptionLabel(batchNo, stock) {
  const no = String(batchNo || '').trim();
  if (!no) return '';
  const qty = Math.max(0, Number(stock) || 0);
  return `${no}（余 ${qty}）`;
}

function enrichBatchRowFields(row) {
  const batchNo = row.batchNo || '';
  const batchStock = Math.max(0, Number(row.batchStock) || 0);
  const batchDisplayText = batchNo ?
  batchStock > 0 ? formatBatchOptionLabel(batchNo, batchStock) : batchNo :
  '';
  return {
    ...row,
    batchStock,
    batchDisplayText,
    showBatchStock: Boolean(batchNo) && batchStock > 0
  };
}

function categoryUsesBatchManagement(cat) {
  return Boolean(cat && cat.hasBatchManagement) && !Boolean(cat && cat.hasColorSize);
}

function materialProductNeedsBatch(materialProductId, productsById, categoryById) {
  const p = productsById.get(materialProductId);
  if (!p || !p.categoryId) return false;
  return categoryUsesBatchManagement(categoryById.get(p.categoryId));
}

function rowsNeedBatchColumn(rows, productsById, categoryById) {
  return (rows || []).some(
    (r) => materialProductNeedsBatch(r.materialProductId, productsById, categoryById)
  );
}

function decorateRowsWithBatchFlags(rows, productsById, categoryById) {
  return (rows || []).map((r) => ({
    ...r,
    needsBatch: materialProductNeedsBatch(r.materialProductId, productsById, categoryById),
    batchOptions: [],
    batchPickerRange: [],
    batchIndex: 0,
    batchNo: '',
    batchStock: 0
  }));
}

async function attachBatchOptionsToRows(rows, warehouseId, fetchStockBatches) {
  const out = [];
  for (const row of rows || []) {
    if (!row.needsBatch) {
      out.push(row);
      continue;
    }
    if (!warehouseId) {
      out.push({
        ...row,
        batchOptions: [],
        batchPickerRange: ['请先选择仓库'],
        batchIndex: 0,
        batchNo: '',
        batchStock: 0
      });
      continue;
    }
    let batchOptions = [];
    try {
      const raw = await fetchStockBatches({
        productId: row.materialProductId,
        warehouseId
      });
      batchOptions = (Array.isArray(raw) ? raw : []).map((o) => {
        const batchNo = normalizeBatchNoFromApi(o.batchNo);
        const stock = Number(o.stock) || 0;
        return {
          batchNo,
          stock,
          label: formatBatchOptionLabel(batchNo, stock)
        };
      });
    } catch {
      batchOptions = [];
    }
    const batchPickerRange = batchOptions.length ?
    batchOptions.map((o) => o.label) :
    ['暂无可用批次'];
    const prevBatchNo = row.batchNo || '';
    let batchIndex = batchOptions.findIndex((o) => o.batchNo === prevBatchNo);
    if (batchIndex < 0) batchIndex = 0;
    const selected = batchOptions[batchIndex];
    out.push(enrichBatchRowFields({
      ...row,
      batchOptions,
      batchPickerRange,
      batchIndex,
      batchNo: selected ? selected.batchNo : '',
      batchStock: selected ? selected.stock : 0
    }));
  }
  return out;
}

/** 合并 API 批次与本地快照（对齐 Web useWarehouseBatchOptions mergeFromLocal） */
function mergeWarehouseBatchOptions(apiRows, mergeRows) {
  const map = new Map();
  (Array.isArray(apiRows) ? apiRows : []).forEach((o) => {
    const batchNo = normalizeBatchNoFromApi(o.batchNo);
    if (!batchNo) return;
    map.set(batchNo, Number(o.stock) || 0);
  });
  (Array.isArray(mergeRows) ? mergeRows : []).forEach((m) => {
    const batchNo = normalizeBatchNoFromApi(m.batchNo);
    if (!batchNo) return;
    const prev = map.get(batchNo);
    map.set(batchNo, Math.max(prev != null ? prev : 0, Number(m.stock) || 0));
  });
  return [...map.entries()].
  map(([batchNo, stock]) => ({
    batchNo,
    stock,
    label: formatBatchOptionLabel(batchNo, stock) || batchNo
  })).
  filter((o) => o.batchNo && o.stock > 0).
  sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
}

function applyBatchSelection(row, batchIndex) {
  const idx = Number(batchIndex);
  const options = row.batchOptions || [];
  if (!Number.isFinite(idx) || idx < 0 || idx >= options.length) {
    return enrichBatchRowFields({ ...row, batchIndex: 0, batchNo: '', batchStock: 0 });
  }
  const selected = options[idx];
  return enrichBatchRowFields({
    ...row,
    batchIndex: idx,
    batchNo: selected.batchNo,
    batchStock: selected.stock
  });
}

function validateMaterialIssueBatchRows(rows) {
  const errors = [];
  (rows || []).forEach((row) => {
    const qty = Number(row.issueQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!row.needsBatch) return;
    if (!row.batchNo) {
      errors.push(`请为物料「${row.name}」选择批次`);
      return;
    }
    const batchKey = row.batchNo === BATCH_NO_UNTAGGED ? BATCH_NO_UNTAGGED : row.batchNo;
    if (qty > (Number(row.batchStock) || 0)) {
      errors.push(`物料「${row.name}」批次「${batchKey}」可用库存不足（${row.batchStock || 0}）`);
    }
  });
  return errors;
}

function decorateConfirmRowsWithBatchFlags(rows, productsById, categoryById) {
  return (rows || []).map((r) => ({
    ...r,
    needsBatch: materialProductNeedsBatch(r.productId, productsById, categoryById),
    batchOptions: [],
    batchPickerRange: [],
    batchIndex: 0,
    batchNo: '',
    batchStock: 0
  }));
}

async function attachBatchOptionsToConfirmRows(rows, warehouseId, fetchStockBatches) {
  const out = [];
  for (const row of rows || []) {
    if (!row.needsBatch) {
      out.push(row);
      continue;
    }
    if (!warehouseId) {
      out.push({
        ...row,
        batchOptions: [],
        batchPickerRange: ['请先选择仓库'],
        batchIndex: 0,
        batchNo: '',
        batchStock: 0
      });
      continue;
    }
    let batchOptions = [];
    try {
      const raw = await fetchStockBatches({
        productId: row.productId,
        warehouseId
      });
      batchOptions = (Array.isArray(raw) ? raw : []).map((o) => {
        const batchNo = normalizeBatchNoFromApi(o.batchNo);
        const stock = Number(o.stock) || 0;
        return {
          batchNo,
          stock,
          label: formatBatchOptionLabel(batchNo, stock)
        };
      });
    } catch {
      batchOptions = [];
    }
    const batchPickerRange = batchOptions.length ?
    batchOptions.map((o) => o.label) :
    ['暂无可用批次'];
    const prevBatchNo = row.batchNo || '';
    let batchIndex = batchOptions.findIndex((o) => o.batchNo === prevBatchNo);
    if (batchIndex < 0) batchIndex = 0;
    const selected = batchOptions[batchIndex];
    out.push(enrichBatchRowFields({
      ...row,
      batchOptions,
      batchPickerRange,
      batchIndex,
      batchNo: selected ? selected.batchNo : '',
      batchStock: selected ? selected.stock : 0
    }));
  }
  return out;
}

function attachReturnBatchOptionsToConfirmRows(rows, dispatchedByProduct) {
  const map = dispatchedByProduct || {};
  return (rows || []).map((row) => {
    if (!row.needsBatch) return row;
    const batches = map[row.productId] || map[row.materialProductId] || [];
    const batchOptions = batches.map((batchNo) => ({
      batchNo,
      stock: 0,
      label: batchNo
    }));
    const batchPickerRange = batchOptions.length ?
    batchOptions.map((o) => o.label) :
    ['暂无已发批次'];
    const prevBatchNo = row.batchNo || '';
    let batchIndex = batchOptions.findIndex((o) => o.batchNo === prevBatchNo);
    if (batchIndex < 0) batchIndex = 0;
    const selected = batchOptions[batchIndex];
    return enrichBatchRowFields({
      ...row,
      batchOptions,
      batchPickerRange,
      batchIndex,
      batchNo: selected ? selected.batchNo : '',
      batchStock: 0
    });
  });
}

function attachReturnBatchOptionsToRows(rows, dispatchedByProduct) {
  const map = dispatchedByProduct || {};
  return (rows || []).map((row) => {
    if (!row.needsBatch) return row;
    const batches = map[row.materialProductId] || map[row.productId] || [];
    const batchOptions = batches.map((batchNo) => ({
      batchNo,
      stock: 0,
      label: batchNo
    }));
    const batchPickerRange = batchOptions.length ?
    batchOptions.map((o) => o.label) :
    ['暂无已发批次'];
    const prevBatchNo = row.batchNo || '';
    let batchIndex = batchOptions.findIndex((o) => o.batchNo === prevBatchNo);
    if (batchIndex < 0) batchIndex = 0;
    const selected = batchOptions[batchIndex];
    return enrichBatchRowFields({
      ...row,
      batchOptions,
      batchPickerRange,
      batchIndex,
      batchNo: selected ? selected.batchNo : '',
      batchStock: 0
    });
  });
}

function validateReturnBatchRows(rows) {
  const errors = [];
  (rows || []).forEach((row) => {
    const qty = Number(row.issueQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!row.needsBatch) return;
    if (!row.batchNo) {
      errors.push(`请为物料「${row.name}」选择批次`);
    }
  });
  return errors;
}

function confirmRowsNeedBatchColumn(rows) {
  return (rows || []).some((r) => r.needsBatch);
}

function validateConfirmBatchRows(rows, mode) {
  const errors = [];
  (rows || []).forEach((row) => {
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!row.needsBatch) return;
    if (!row.batchNo) {
      errors.push(`请为物料「${row.name}」选择批次`);
      return;
    }
    if (mode !== 'stock_out') return;
    const batchKey = row.batchNo === BATCH_NO_UNTAGGED ? BATCH_NO_UNTAGGED : row.batchNo;
    if (qty > (Number(row.batchStock) || 0)) {
      errors.push(`物料「${row.name}」批次「${batchKey}」可用库存不足（${row.batchStock || 0}）`);
    }
  });
  return errors;
}

module.exports = {
  BATCH_NO_UNTAGGED,
  categoryUsesBatchManagement,
  materialProductNeedsBatch,
  rowsNeedBatchColumn,
  formatBatchOptionLabel,
  enrichBatchRowFields,
  decorateRowsWithBatchFlags,
  attachBatchOptionsToRows,
  applyBatchSelection,
  mergeWarehouseBatchOptions,
  normalizeBatchNoFromApi,
  validateMaterialIssueBatchRows,
  decorateConfirmRowsWithBatchFlags,
  attachBatchOptionsToConfirmRows,
  attachReturnBatchOptionsToConfirmRows,
  attachReturnBatchOptionsToRows,
  validateReturnBatchRows,
  confirmRowsNeedBatchColumn,
  validateConfirmBatchRows
};