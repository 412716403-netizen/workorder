/**
 * 返工 Hub 数据加载（对齐 Web ReworkPanel Phase 3.E 窄拉）
 */

const { normalizeListBody } = require('../../utils/listResponse.js');
const { fetchProductionRecords } = require('./orderApi.js');
const { getActiveOrderIdsCsv } = require('./materialStatsLite.js');
const {
  localTodayYmd,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
} = require('./orderReportHistory.js');
const { mergeRecordsById } = require('./outsourceRecordsLoad.js');

const ORDER_IDS_BATCH_SIZE = 40;

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
      // 单批失败不阻断
    }
  }
  return out;
}

async function fetchReworkRecordsForPanel(opts) {
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
    const mainParams = { types: 'REWORK,REWORK_REPORT,SCRAP,OUTSOURCE', all: 'true' };
    if (productionLinkMode === 'product' && productIdsCsv) {
      mainParams.productIds = productIdsCsv;
    }
    queries.push(fetchProductionRecordsBatched(mainParams, orderIdsCsv));
  }

  const today = localTodayYmd();
  queries.push(
    fetchProductionRecords({
      types: 'REWORK,REWORK_REPORT,SCRAP,OUTSOURCE',
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

module.exports = {
  fetchReworkRecordsForPanel,
};
