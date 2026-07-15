/**
 * 入库流水列表（对齐 Web StockInFlowModal）
 */

const { productHasColorSizeMatrix, variantLabel } = require('../../utils/productionPlans.js');
const { buildVariantMatrixUiModel } = require('../../utils/variantQtyMatrix.js');
const { getProductUnitName } = require('../../utils/planFormCustomField.js');
const { productMetaFromMap } = require('../../utils/orderReportHistory.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON } = require('../../utils/listProductThumb.js');

function resolveWarehouseName(warehouseMap, warehouseId, fallbackName) {
  const fb = String(fallbackName || '').trim();
  if (fb) return fb;
  if (!warehouseId || !warehouseMap) return '';
  const wh = warehouseMap.get(warehouseId);
  if (!wh) return '';
  return wh.name || wh.code || String(warehouseId);
}

function formatStockInTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeStockInRecord(r) {
  return {
    id: r.id,
    docNo: r.docNo || r.id,
    orderId: r.orderId || '',
    orderNumber: r.orderNumber || '',
    productId: r.productId || '',
    productName: r.productName || '',
    warehouseId: r.warehouseId || '',
    warehouseName: r.warehouseName || '',
    variantId: r.variantId || '',
    quantity: Number(r.quantity) || 0,
    operator: r.operator || '',
    timestamp: r.timestamp || '',
    collabData: r.collabData || null,
  };
}

/** 按 RK 单号聚合，同一单号下按产品分行（对齐 Web StockInFlowListRow） */
function buildStockInFlowListRows(records, opts) {
  const productionLinkMode = (opts && opts.productionLinkMode) || 'order';
  const orderMap = (opts && opts.orderMap) || new Map();
  const productMap = (opts && opts.productMap) || null;
  const warehouseMap = (opts && opts.warehouseMap) || new Map();
  const list = (records || []).map(normalizeStockInRecord);

  const byDoc = new Map();
  list.forEach((row) => {
    const docNo = row.docNo || row.id;
    if (!byDoc.has(docNo)) byDoc.set(docNo, []);
    byDoc.get(docNo).push(row);
  });

  const out = [];
  byDoc.forEach((rows, docNo) => {
    const byProduct = new Map();
    rows.forEach((r) => {
      const pid = r.productId || '_';
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid).push(r);
    });

    byProduct.forEach((productRows, productId) => {
      const first = productRows[0];
      const order = first.orderId ? orderMap.get(first.orderId) : null;
      const orderNumber = first.orderNumber
        || (order && order.orderNumber)
        || '';
      const productName = first.productName
        || (order && order.productName)
        || '';
      const totalQty = productRows.reduce((s, r) => s + r.quantity, 0);
      const warehouseId = first.warehouseId || '';
      const warehouseName = resolveWarehouseName(warehouseMap, warehouseId, first.warehouseName);
      const timeLabel = formatStockInTime(
        productRows.reduce((earliest, r) => {
          if (!earliest) return r.timestamp;
          return new Date(r.timestamp) < new Date(earliest) ? r.timestamp : earliest;
        }, ''),
      );

      const batchKey = `${docNo}::${productId}`;
      const meta = productMetaFromMap(productMap, productId === '_' ? '' : productId, productName, '');

      out.push({
        id: batchKey,
        batchKey,
        docNo,
        productId: productId === '_' ? '' : productId,
        productName: meta.name || productName,
        productSku: meta.sku,
        showProductSku: meta.showSku,
        productImageUrl: meta.imageUrl,
        showProductImage: Boolean(meta.imageUrl),
        placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
        orderNumber: productionLinkMode !== 'product' ? orderNumber : '',
        showOrderNumber: productionLinkMode !== 'product' && Boolean(orderNumber),
        warehouseId,
        warehouseName,
        showWarehouse: Boolean(warehouseName),
        totalQty,
        totalQtyText: `+${totalQty}`,
        timeLabel,
        operator: first.operator || '',
        operatorLine: first.operator ? `操作人：${first.operator}` : '',
        showOperator: Boolean(first.operator),
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

function filterStockInFlowRows(rows, opts) {
  const keyword = opts && typeof opts === 'object' ? (opts.keyword || '') : String(opts || '');
  const warehouseId = opts && typeof opts === 'object' ? (opts.warehouseId || '') : '';
  let list = rows || [];

  if (warehouseId) {
    list = list.filter((row) => row.warehouseId === warehouseId);
  }

  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return list;
  return list.filter((row) => {
    const hay = [
      row.docNo,
      row.orderNumber,
      row.productName,
      row.operator,
    ].join(' ').toLowerCase();
    return hay.includes(kw);
  });
}

function sumStockInFlowQty(rows) {
  return (rows || []).reduce((s, r) => s + (Number(r.totalQty) || 0), 0);
}

/** 入库详情视图（含色码矩阵，对齐报工批次详情） */
function buildStockInFlowDetailView(rows, opts) {
  const productMap = (opts && opts.productMap) || new Map();
  const categoryMap = (opts && opts.categoryMap) || new Map();
  const warehouseMap = (opts && opts.warehouseMap) || new Map();
  const dictionaries = (opts && opts.dictionaries) || {};
  const productionLinkMode = (opts && opts.productionLinkMode) || 'order';
  const list = (rows || []).map(normalizeStockInRecord);
  if (!list.length) return null;

  const first = list[0];
  const product = first.productId ? productMap.get(first.productId) : null;
  const category = product && product.categoryId
    ? categoryMap.get(product.categoryId)
    : null;
  const unitName = getProductUnitName(product, dictionaries);
  const meta = productMetaFromMap(productMap, first.productId, first.productName, '');

  const qtyMap = {};
  list.forEach((r) => {
    if (r.variantId) {
      qtyMap[r.variantId] = String((Number(qtyMap[r.variantId]) || 0) + r.quantity);
    }
  });

  let matrixLayout = null;
  if (product && productHasColorSizeMatrix(product, category)) {
    matrixLayout = buildVariantMatrixUiModel(product, dictionaries, qtyMap);
  }
  const showMatrix = Boolean(matrixLayout);

  const lineItems = list.map((r) => {
    const variant = product && product.variants
      ? product.variants.find((v) => v.id === r.variantId)
      : null;
    const vLabel = variant ? variantLabel(variant, dictionaries) : '';
    const qty = Number(r.quantity) || 0;
    return {
      id: r.id,
      variantId: r.variantId || '',
      label: vLabel || (r.variantId ? `规格 ${r.variantId}` : (meta.name || '产品')),
      quantity: qty,
      quantityText: `${qty} ${unitName}`,
      orderNumber: r.orderNumber || '',
    };
  });

  const totalQty = list.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const warehouseId = first.warehouseId || '';
  const warehouseName = resolveWarehouseName(warehouseMap, warehouseId, first.warehouseName);

  return {
    docNo: first.docNo,
    productId: first.productId || '',
    productName: meta.name || first.productName || '—',
    productSku: meta.sku,
    showProductSku: meta.showSku,
    productImageUrl: meta.imageUrl,
    showProductImage: Boolean(meta.imageUrl),
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    orderNumber: first.orderNumber || '',
    showOrderNumber: productionLinkMode !== 'product' && Boolean(first.orderNumber),
    warehouseId,
    warehouseName,
    showWarehouse: Boolean(warehouseName),
    operator: first.operator || '—',
    timeLabel: formatStockInTime(first.timestamp),
    unitName,
    totalQty,
    totalQtyText: `${totalQty} ${unitName}`,
    matrixLayout,
    showMatrix,
    lineItems,
    showLineItems: !showMatrix && lineItems.length > 0,
    allowQtyEdit: !showMatrix,
  };
}

module.exports = {
  normalizeStockInRecord,
  resolveWarehouseName,
  buildStockInFlowListRows,
  buildStockInFlowDetailView,
  filterStockInFlowRows,
  sumStockInFlowQty,
  formatStockInTime,
};
