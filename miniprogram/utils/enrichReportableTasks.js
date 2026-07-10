/**
 * 可报任务列表「可报 N」与报工详情页一致（扣外协/待审/按规格顺控）。
 * 主包在 API 返回后本地重算，避免旧版后端仍返回 chip 口径（如 229）。
 */
const { normalizeListBody } = require('./listResponse.js');
const { request } = require('./request.js');

function loadReportCalcDeps() {
  return {
    ...require('../packageBusiness/utils/reportVariantMaxQty.js'),
    productHasColorSizeMatrix: require('../packageBusiness/utils/productionPlans.js')
      .productHasColorSizeMatrix,
  };
}

function buildQs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function getOrder(id) {
  return request({
    path: `/orders/${encodeURIComponent(id)}`,
    method: 'GET',
    timeout: 60000,
  }).catch(() => null);
}

function fetchTenantConfig() {
  return request({ path: '/settings/config', method: 'GET', timeout: 60000 }).catch(() => ({}));
}

function fetchProductionRecords(params) {
  return request({
    path: `/production/records${buildQs(params)}`,
    method: 'GET',
    timeout: 90000,
  })
    .then((body) => normalizeListBody(body))
    .catch(() => []);
}

function computeTaskDisplayRemaining(order, milestone, globalNodes, config, prodRecords, product, category) {
  const { computeOrderReportHints, buildVariantMaxGoodMap, productHasColorSizeMatrix } =
    loadReportCalcDeps();
  const hints = computeOrderReportHints(order, milestone, globalNodes, config, prodRecords || []);
  let remaining = Math.max(0, Number(hints.hintRemaining) || 0);
  if (product && productHasColorSizeMatrix(product, category)) {
    const variantMaxGoodMap = buildVariantMaxGoodMap(
      order,
      milestone,
      product,
      hints.opts,
      prodRecords || [],
    );
    const variantSum = Object.values(variantMaxGoodMap).reduce(
      (s, v) => s + (Math.max(0, Number(v) || 0)),
      0,
    );
    remaining = Math.max(0, Math.min(variantSum, remaining));
  }
  return remaining;
}

/**
 * @param {Array<object>} rawTasks
 * @param {Map<string, object>} [productMap]
 * @param {Map<string, object>} [categoryMap]
 */
async function enrichReportableTasksRemaining(rawTasks, productMap, categoryMap) {
  const tasks = Array.isArray(rawTasks) ? rawTasks : [];
  const orderIds = [...new Set(tasks.map((t) => t.orderId).filter(Boolean))];
  if (!orderIds.length) return tasks;

  loadReportCalcDeps();

  const [config, nodesRaw, prodRecordsRaw, ...ordersRaw] = await Promise.all([
    fetchTenantConfig(),
    request({ path: '/settings/nodes?all=true', method: 'GET', timeout: 60000 }).catch(() => []),
    fetchProductionRecords({
      orderIds: orderIds.join(','),
      types: 'OUTSOURCE,REWORK,REWORK_REPORT',
      all: 'true',
    }),
    ...orderIds.map((id) => getOrder(id)),
  ]);

  const globalNodes = Array.isArray(nodesRaw) ? nodesRaw : [];
  const orderById = new Map();
  ordersRaw.forEach((order) => {
    if (order && order.id) orderById.set(order.id, order);
  });
  const prodRecords = Array.isArray(prodRecordsRaw) ? prodRecordsRaw : [];
  const prodByOrder = new Map();
  prodRecords.forEach((r) => {
    if (!r.orderId) return;
    const list = prodByOrder.get(r.orderId) || [];
    list.push(r);
    prodByOrder.set(r.orderId, list);
  });

  const enriched = [];
  tasks.forEach((task) => {
    const order = orderById.get(task.orderId);
    if (!order) {
      enriched.push(task);
      return;
    }
    const milestone = (order.milestones || []).find((m) => m.id === task.milestoneId);
    if (!milestone) {
      if ((Number(task.remaining) || 0) > 0) enriched.push(task);
      return;
    }
    const product = productMap && productMap.get(order.productId);
    const category =
      product && product.categoryId && categoryMap
        ? categoryMap.get(product.categoryId)
        : null;
    const remaining = computeTaskDisplayRemaining(
      order,
      milestone,
      globalNodes,
      config,
      prodByOrder.get(task.orderId) || [],
      product,
      category,
    );
    if (remaining > 0) {
      enriched.push({ ...task, remaining });
    } else if ((Number(task.remaining) || 0) > 0) {
      enriched.push(task);
    }
  });
  return enriched;
}

module.exports = {
  enrichReportableTasksRemaining,
  computeTaskDisplayRemaining,
};
