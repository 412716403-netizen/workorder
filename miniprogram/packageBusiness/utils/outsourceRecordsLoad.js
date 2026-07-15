/**
 * 外协 Hub 数据加载（对齐 Web OutsourcePanel Phase 3.E 窄拉 + 今日合并）
 */

const { normalizeListBody } = require('../../utils/listResponse.js');
const { fetchProductionRecords } = require('./orderApi.js');
const {
  getActiveOrderIdsCsv,
  getActiveSourceProductIdsCsv,
} = require('./materialStatsLite.js');
const {
  localTodayYmd,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
} = require('./orderReportHistory.js');

const ORDER_IDS_BATCH_SIZE = 40;

function mergeRecordsById(...groups) {
  const seen = new Set();
  const out = [];
  groups.flat().forEach((r) => {
    if (!r || !r.id || seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
  });
  return out;
}

function splitCsv(csv, batchSize) {
  const ids = String(csv || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return [];
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize).join(','));
  }
  return batches;
}

async function fetchProductionRecordsBatched(baseParams, orderIdsCsv) {
  const batches = splitCsv(orderIdsCsv, ORDER_IDS_BATCH_SIZE);
  if (!batches.length) {
    const raw = await fetchProductionRecords(baseParams);
    return normalizeListBody(raw);
  }
  let out = [];
  for (let i = 0; i < batches.length; i += 1) {
    const orderIds = batches[i];
    try {
      const raw = await fetchProductionRecords({ ...baseParams, orderIds });
      out = mergeRecordsById(out, normalizeListBody(raw));
    } catch {
      // 单批失败不阻断其余批次
    }
  }
  return out;
}

async function fetchOutsourceRecordsForPanel(opts) {
  const {
    productionLinkMode = 'order',
    orders = [],
    products = [],
  } = opts || {};

  const orderIdsCsv = getActiveOrderIdsCsv(orders);
  const productIdsCsv = (products || []).map((p) => p.id).filter(Boolean).join(',');
  const queries = [];

  const canMainQuery = productionLinkMode === 'product'
    ? (orderIdsCsv.length > 0 || productIdsCsv.length > 0)
    : orderIdsCsv.length > 0;

  if (canMainQuery) {
    const mainParams = { type: 'OUTSOURCE', all: 'true' };
    if (productionLinkMode === 'product' && productIdsCsv) {
      mainParams.productIds = productIdsCsv;
    }
    queries.push(fetchProductionRecordsBatched(mainParams, orderIdsCsv));
  }

  const today = localTodayYmd();
  queries.push(
    fetchProductionRecords({
      type: 'OUTSOURCE',
      all: 'true',
      startDate: dateInputToIsoStart(today),
      endDate: dateInputToIsoEndExclusive(today),
    })
      .then((body) => normalizeListBody(body))
      .catch(() => []),
  );

  const batches = await Promise.all(queries);
  return mergeRecordsById(...batches);
}

async function fetchStockRecordsForOutsourcePanel(orders) {
  const orderIdsCsv = getActiveOrderIdsCsv(orders || []);
  const sourceProductIdsCsv = getActiveSourceProductIdsCsv(orders || []);
  if (!orderIdsCsv && !sourceProductIdsCsv) return [];
  const params = { types: 'STOCK_OUT,STOCK_RETURN', all: 'true' };
  if (sourceProductIdsCsv) params.sourceProductIds = sourceProductIdsCsv;
  return fetchProductionRecordsBatched(params, orderIdsCsv);
}

/** 对齐 Web OutsourcePanel reworkByOrderQuery：待发清单可外协数需要返工完成回补 */
async function fetchReworkRecordsForOutsourcePanel(orders) {
  const orderIdsCsv = getActiveOrderIdsCsv(orders || []);
  if (!orderIdsCsv) return [];
  return fetchProductionRecordsBatched(
    { types: 'REWORK,REWORK_REPORT', all: 'true' },
    orderIdsCsv,
  );
}

module.exports = {
  fetchOutsourceRecordsForPanel,
  fetchStockRecordsForOutsourcePanel,
  fetchReworkRecordsForOutsourcePanel,
  mergeRecordsById,
};
