/**
 * 领料退料流水（对齐 Web StockFlowListModal + 报工/入库流水列表 UI）
 */

const { productMetaFromMap } = require('./orderReportHistory.js');
const { formatStockInTime, resolveWarehouseName } = require('./stockInFlow.js');
const { getProductUnitName } = require('./planFormCustomField.js');
const { BATCH_NO_UNTAGGED } = require('./materialStockConfirm.js');

const TYPE_LABELS = {
  STOCK_OUT: '领料发出',
  STOCK_RETURN: '生产退料',
};

function normalizeBatchNo(raw) {
  const s = String(raw || '').trim();
  return s || '';
}

function displayBatchNo(raw) {
  const s = normalizeBatchNo(raw);
  return s || BATCH_NO_UNTAGGED;
}

function normalizeMaterialRecord(r) {
  return {
    id: r.id,
    docNo: r.docNo || r.id,
    type: r.type || '',
    orderId: r.orderId || '',
    orderNumber: r.orderNumber || '',
    sourceProductId: r.sourceProductId || '',
    productId: r.productId || '',
    productName: r.productName || '',
    warehouseId: r.warehouseId || '',
    warehouseName: r.warehouseName || '',
    quantity: Number(r.quantity) || 0,
    batchNo: normalizeBatchNo(r.batchNo),
    operator: r.operator || '',
    timestamp: r.timestamp || '',
    partner: r.partner || '',
    reason: r.reason || '',
    collabData: r.collabData || null,
  };
}

function typePrefix(type) {
  if (type === 'STOCK_RETURN') return '-';
  return '+';
}

function resolveUnitName(productMap, productId, dictionaries) {
  const product = productMap && productMap.get(productId);
  return getProductUnitName(product, dictionaries);
}

function buildQtyText(prefix, qty, unitName) {
  const unit = unitName || '件';
  return `${prefix}${qty} ${unit}`;
}

/** 按 docNo + 物料分行（对齐报工流水 / 入库流水：一个产品一行） */
function buildMaterialFlowListRows(records, opts) {
  const productionLinkMode = (opts && opts.productionLinkMode) || 'order';
  const orderMap = (opts && opts.orderMap) || new Map();
  const productMap = (opts && opts.productMap) || new Map();
  const warehouseMap = (opts && opts.warehouseMap) || new Map();
  const dictionaries = (opts && opts.dictionaries) || {};
  const list = (records || []).map(normalizeMaterialRecord);

  const byDoc = new Map();
  list.forEach((row) => {
    const docNo = row.docNo || row.id;
    if (!byDoc.has(docNo)) byDoc.set(docNo, []);
    byDoc.get(docNo).push(row);
  });

  const out = [];
  byDoc.forEach((docRows, docNo) => {
    const byProduct = new Map();
    docRows.forEach((r) => {
      const pid = r.productId || '_';
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid).push(r);
    });

    byProduct.forEach((productRows, productId) => {
      const first = productRows[0];
      const type = first.type || 'STOCK_OUT';
      const typeLabel = TYPE_LABELS[type] || type;
      const totalQty = productRows.reduce((s, r) => s + r.quantity, 0);
      const order = first.orderId ? orderMap.get(first.orderId) : null;
      const orderNumber = first.orderNumber || (order && order.orderNumber) || '';
      const meta = productMetaFromMap(
        productMap,
        productId === '_' ? '' : productId,
        first.productName,
        '',
      );
      const unitName = resolveUnitName(productMap, productId === '_' ? '' : productId, dictionaries);
      const warehouseId = first.warehouseId || '';
      const warehouseName = resolveWarehouseName(warehouseMap, warehouseId, first.warehouseName);
      const timeLabel = formatStockInTime(
        productRows.reduce((earliest, r) => {
          if (!earliest) return r.timestamp;
          return new Date(r.timestamp) < new Date(earliest) ? r.timestamp : earliest;
        }, ''),
      );

      const batchLabels = [...new Set(
        productRows.map((r) => displayBatchNo(r.batchNo)),
      )];
      const docHasBatch = productRows.some((r) => normalizeBatchNo(r.batchNo));
      const qtyPart = buildQtyText('', totalQty, unitName);
      const batchMetaText = batchLabels.join('、');
      const totalQtyText = docHasBatch ? `${batchMetaText} · ${qtyPart}` : qtyPart;

      const batchKey = `${docNo}::${productId}`;

      out.push({
        id: batchKey,
        batchKey,
        docNo,
        type,
        typeLabel,
        orderId: first.orderId || '',
        orderNumber: productionLinkMode !== 'product' ? orderNumber : '',
        showOrderNumber: productionLinkMode !== 'product' && Boolean(orderNumber),
        materialName: meta.name || first.productName || '—',
        materialSku: meta.sku,
        showMaterialSku: meta.showSku,
        productName: meta.name || first.productName || '—',
        productSku: meta.sku,
        showProductSku: meta.showSku,
        warehouseId,
        warehouseName,
        showWarehouse: Boolean(warehouseName),
        totalQty,
        totalQtyText,
        showBatchMeta: docHasBatch,
        batchMetaText: docHasBatch ? `批号 ${batchMetaText}` : '',
        timeLabel,
        operator: first.operator || '',
        operatorLine: first.operator ? `操作人：${first.operator}` : '',
        showOperator: Boolean(first.operator),
        placeholderIconSrc: type === 'STOCK_RETURN'
          ? '/assets/icons/arrow-down-to-line.png'
          : '/assets/icons/arrow-up-from-line.png',
        rows: productRows,
      });
    });
  });

  out.sort((a, b) => {
    const ta = new Date((a.rows[0] && a.rows[0].timestamp) || 0).getTime();
    const tb = new Date((b.rows[0] && b.rows[0].timestamp) || 0).getTime();
    return tb - ta;
  });

  return out;
}

function filterMaterialFlowRows(rows, opts) {
  const keyword = opts && typeof opts === 'object' ? (opts.keyword || '') : String(opts || '');
  const typeFilter = opts && typeof opts === 'object' ? (opts.typeFilter || '') : '';
  let list = rows || [];

  if (typeFilter) {
    list = list.filter((row) => row.type === typeFilter);
  }

  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return list;
  return list.filter((row) => {
    const hay = [
      row.docNo,
      row.orderNumber,
      row.materialName,
      row.productName,
      row.materialSku,
      row.productSku,
      row.batchMetaText,
      row.operator,
      row.typeLabel,
      row.warehouseName,
    ].join(' ').toLowerCase();
    return hay.includes(kw);
  });
}

function sumMaterialFlowQty(rows) {
  return (rows || []).reduce((s, r) => s + (Number(r.totalQty) || 0), 0);
}

function computeMaterialFlowStats(rows) {
  const list = rows || [];
  let issueQty = 0;
  let returnQty = 0;
  let issueCount = 0;
  let returnCount = 0;
  list.forEach((row) => {
    const qty = Number(row.totalQty) || 0;
    if (row.type === 'STOCK_RETURN') {
      returnQty += qty;
      returnCount += 1;
    } else {
      issueQty += qty;
      issueCount += 1;
    }
  });
  const parts = [`共 ${list.length} 条`];
  if (issueCount) parts.push(`领料 ${issueQty}`);
  if (returnCount) parts.push(`退料 ${returnQty}`);
  return {
    batchCount: list.length,
    issueQty,
    returnQty,
    issueCount,
    returnCount,
    totalQtyText: String(sumMaterialFlowQty(list)),
    footerText: parts.join(' · '),
  };
}

function buildMaterialFlowDetailView(rows, opts) {
  const productMap = (opts && opts.productMap) || new Map();
  const warehouseMap = (opts && opts.warehouseMap) || new Map();
  const orderMap = (opts && opts.orderMap) || new Map();
  const productionLinkMode = (opts && opts.productionLinkMode) || 'order';
  const dictionaries = (opts && opts.dictionaries) || {};
  const list = (rows || []).map(normalizeMaterialRecord);
  if (!list.length) return null;

  const first = list[0];
  const type = first.type || 'STOCK_OUT';
  const typeLabel = TYPE_LABELS[type] || type;
  const order = first.orderId ? orderMap.get(first.orderId) : null;
  const orderNumber = first.orderNumber || (order && order.orderNumber) || '';
  const warehouseId = first.warehouseId || '';
  const warehouseName = resolveWarehouseName(warehouseMap, warehouseId, first.warehouseName);
  const totalQty = list.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const prefix = typePrefix(type);
  const unitNames = [...new Set(list.map((r) => resolveUnitName(productMap, r.productId, dictionaries)))];
  const totalUnitName = unitNames.length === 1 ? unitNames[0] : '件';

  const lineItems = list.map((r) => {
    const meta = productMetaFromMap(productMap, r.productId, r.productName, '');
    const qty = Number(r.quantity) || 0;
    const unitName = resolveUnitName(productMap, r.productId, dictionaries);
    const batchLabel = displayBatchNo(r.batchNo);
    const qtyText = buildQtyText(prefix, qty, unitName);
    const docHasBatch = list.some((x) => normalizeBatchNo(x.batchNo));
    return {
      id: r.id,
      productId: r.productId,
      name: meta.name || r.productName || '—',
      sku: meta.sku,
      showSku: meta.showSku,
      batchNo: batchLabel,
      showBatch: docHasBatch,
      quantity: qty,
      quantityText: docHasBatch ? `${batchLabel} · ${qtyText}` : qtyText,
    };
  });

  const finishedProductId = first.sourceProductId || (order && order.productId) || '';
  const finishedMeta = productMetaFromMap(
    productMap,
    finishedProductId,
    (order && order.productName) || '',
    (order && order.sku) || '',
  );

  return {
    docNo: first.docNo,
    type,
    typeLabel,
    orderNumber,
    showOrderNumber: productionLinkMode !== 'product' && Boolean(orderNumber),
    productName: finishedMeta.name || '—',
    productSku: finishedMeta.sku,
    showProductSku: finishedMeta.showSku,
    warehouseId,
    warehouseName,
    showWarehouse: Boolean(warehouseName),
    operator: first.operator || '—',
    timeLabel: formatStockInTime(first.timestamp),
    reason: first.reason || '',
    showReason: Boolean(first.reason),
    partner: first.partner || '',
    showPartner: Boolean(first.partner),
    totalQty,
    totalQtyText: buildQtyText(prefix, totalQty, totalUnitName),
    lineItems,
  };
}

const TYPE_FILTER_LABELS = ['全部类型', '领料发出', '生产退料'];
const TYPE_FILTER_VALUES = ['', 'STOCK_OUT', 'STOCK_RETURN'];

module.exports = {
  TYPE_LABELS,
  TYPE_FILTER_LABELS,
  TYPE_FILTER_VALUES,
  normalizeMaterialRecord,
  buildMaterialFlowListRows,
  filterMaterialFlowRows,
  sumMaterialFlowQty,
  computeMaterialFlowStats,
  buildMaterialFlowDetailView,
};
