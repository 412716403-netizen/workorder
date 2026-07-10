/**
 * 工人多工单扫码确认页：展示行与提交条目
 */
const { getProductUnitName } = require('./planFormCustomField.js');
const {
  buildQtyHintText,
  resolveReportFormMode,
  buildReportMatrixLayout,
  buildMultiVariantRows,
} = require('./orderReportForm.js');
const {
  computeOrderReportHints,
  buildVariantMaxGoodMap,
} = require('./reportVariantMaxQty.js');
const { variantLabel } = require('./productionPlans.js');

function entriesFromQuantities(quantities, defectiveQuantities) {
  const entries = [];
  const keys = new Set([
    ...Object.keys(quantities || {}),
    ...Object.keys(defectiveQuantities || {}),
  ]);
  keys.forEach((vid) => {
    const quantity = Math.max(0, Number((quantities || {})[vid]) || 0);
    const defectiveQuantity = Math.max(0, Number((defectiveQuantities || {})[vid]) || 0);
    if (quantity > 0 || defectiveQuantity > 0) {
      entries.push({
        variantId: vid || undefined,
        quantity,
        defectiveQuantity,
      });
    }
  });
  return entries;
}

function buildReportQtyHint(reportHints, unitName) {
  return buildQtyHintText({
    totalQty: reportHints.hintTotalQty,
    maxReportable: reportHints.hintMaxReportable,
    reported: reportHints.hintCompletedDisplay,
    remaining: reportHints.hintRemaining,
    defective: reportHints.defectiveQtyForHint,
    totalOutsourcedAtNode: reportHints.totalOutsourcedAtNode,
    totalRework: reportHints.totalRework,
    pendingApprovalQty: reportHints.pendingApprovalQty,
    reworkRemaining: reportHints.reworkRemainingQty,
  }, unitName);
}

function firstQtyValue(map) {
  const values = Object.values(map || {});
  return values.length ? Math.max(0, Number(values[0]) || 0) : 0;
}

function buildWorkerReportDisplayLine(line, ctx) {
  const {
    order,
    product,
    category,
    dictionaries,
    config,
    prodRecords,
    globalNodes,
  } = ctx;

  if (!order) {
    return buildWorkerReportLineCardsFallback([line], {
      productMap: new Map(product ? [[line.productId, product]] : []),
      categoryMap: new Map(category ? [[product.categoryId, category]] : []),
      dictionaries,
    })[0];
  }

  const milestone = (order.milestones || []).find((m) => m.id === line.milestoneId);
  if (!milestone) {
    return buildWorkerReportLineCardsFallback([line], {
      productMap: new Map(product ? [[line.productId, product]] : []),
      categoryMap: new Map(category ? [[product.categoryId, category]] : []),
      dictionaries,
    })[0];
  }

  const orderItems = order.items || [];
  const unitName = getProductUnitName(product, dictionaries);
  const reportHints = computeOrderReportHints(order, milestone, globalNodes, config, prodRecords);
  const qtyHint = buildReportQtyHint(reportHints, unitName);
  const variantMaxGoodMap = buildVariantMaxGoodMap(
    order,
    milestone,
    product,
    reportHints.opts,
    prodRecords,
  );
  const layoutOpts = {
    variantMaxGoodMap,
    effectiveRemainingForModal: reportHints.effectiveRemainingForModal,
    allowExceedMaxReportQty: !!(config && config.allowExceedMaxReportQty),
  };

  const quantities = line.quantities || {};
  const defectiveQuantities = line.defectiveQuantities || {};
  let formMode = resolveReportFormMode(product, category, orderItems);
  let matrixLayout = null;
  let variantRows = [];
  let singleQuantity = '';
  let singleDefectiveQty = '';

  if (formMode === 'matrix' && product) {
    matrixLayout = buildReportMatrixLayout(
      product,
      dictionaries,
      quantities,
      defectiveQuantities,
      layoutOpts,
      orderItems,
    );
    if (!matrixLayout) formMode = 'multi';
  }
  if (formMode === 'multi' && product) {
    variantRows = buildMultiVariantRows(
      product,
      category,
      dictionaries,
      orderItems,
      quantities,
      defectiveQuantities,
      variantMaxGoodMap,
      unitName,
    );
    if (!variantRows.length) formMode = 'single';
  }
  if (formMode === 'single') {
    const keys = new Set([
      ...Object.keys(quantities),
      ...Object.keys(defectiveQuantities),
    ]);
    const vid = keys.size === 1 ? [...keys][0] : '';
    singleQuantity = String(
      quantities[vid] != null
        ? quantities[vid]
        : firstQtyValue(quantities),
    );
    singleDefectiveQty = String(
      defectiveQuantities[vid] != null
        ? defectiveQuantities[vid]
        : firstQtyValue(defectiveQuantities),
    );
  }

  const orderNumber = line.orderNumber || order.orderNumber || '—';
  const productName = line.productName || (product && product.name) || '—';

  return {
    key: `${line.orderId}:${line.milestoneId}`,
    orderNumber,
    productName,
    productSku: line.productSku || (product && product.sku) || '',
    showProductSku: Boolean(line.productSku || (product && product.sku)),
    qtyHint,
    formMode,
    matrixLayout,
    variantRows,
    singleQuantity,
    singleDefectiveQty,
    unitName,
  };
}

function buildWorkerReportLineCardsFallback(lines, ctx) {
  const { productMap, categoryMap, dictionaries } = ctx;
  return (lines || []).map((line) => {
    const product = line.productId && productMap ? productMap.get(line.productId) : null;
    const category = product && product.categoryId && categoryMap
      ? categoryMap.get(product.categoryId)
      : null;
    const qtyRows = [];
    const keys = new Set([
      ...Object.keys(line.quantities || {}),
      ...Object.keys(line.defectiveQuantities || {}),
    ]);
    keys.forEach((vid) => {
      const good = Math.max(0, Number((line.quantities || {})[vid]) || 0);
      const def = Math.max(0, Number((line.defectiveQuantities || {})[vid]) || 0);
      if (good <= 0 && def <= 0) return;
      let label = '合计';
      if (vid && product) {
        label = variantLabel(product, category, dictionaries, vid) || vid;
      } else if (vid) {
        label = vid;
      }
      qtyRows.push({
        label,
        goodText: `${good} 件`,
        showDefective: def > 0,
        defectiveText: def > 0 ? `不良 ${def}` : '',
      });
    });
    const sumGood = Object.values(line.quantities || {}).reduce(
      (s, v) => s + (Number(v) || 0),
      0,
    );
    const orderNumber = line.orderNumber || '—';
    const productName = line.productName || '—';
    return {
      key: `${line.orderId}:${line.milestoneId}`,
      orderNumber,
      productName,
      productSku: line.productSku || '',
      showProductSku: Boolean(line.productSku),
      qtyHint: '',
      formMode: 'fallback',
      qtyRows,
      totalGoodText: `${sumGood} 件`,
      headline: `${orderNumber} · ${productName}`,
    };
  });
}

function buildWorkerReportDisplayLines(lines, ctx) {
  const { orderMap } = ctx;
  return (lines || [])
    .map((line) => {
      const order = orderMap && orderMap.get
        ? orderMap.get(line.orderId)
        : ctx.order;
      const product = line.productId && ctx.productMap
        ? ctx.productMap.get(line.productId)
        : null;
      const category = product && product.categoryId && ctx.categoryMap
        ? ctx.categoryMap.get(product.categoryId)
        : null;
      return buildWorkerReportDisplayLine(line, {
        ...ctx,
        order,
        product,
        category,
      });
    })
    .filter(Boolean);
}

/** @deprecated 使用 buildWorkerReportDisplayLines */
function buildWorkerReportLineCards(lines, ctx) {
  return buildWorkerReportLineCardsFallback(lines, ctx);
}

module.exports = {
  entriesFromQuantities,
  buildReportQtyHint,
  buildWorkerReportDisplayLine,
  buildWorkerReportDisplayLines,
  buildWorkerReportLineCards,
};
