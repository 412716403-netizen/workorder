/**
 * 生产计划列表排序（对齐 Web utils/planOrderSort.ts）
 * 严格按计划单编号数值降序（PLN11 在 PLN2 前），其次 createdAt/updatedAt，再 id。
 */

function planNumberSeqForSort(planNumber) {
  const m = String(planNumber || '').trim().match(/^PLN-?(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function planOrderListSortMs(p) {
  if (p.createdAt) {
    const t = new Date(p.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (p.updatedAt) {
    const t = new Date(p.updatedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const m = String(p.id || '').match(/^plan-([^-]+)-/);
  if (m) {
    const ts = parseInt(m[1], 36);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function comparePlansNewestFirst(a, b) {
  const n = planNumberSeqForSort(b.planNumber) - planNumberSeqForSort(a.planNumber);
  if (n !== 0) return n;
  const d = planOrderListSortMs(b) - planOrderListSortMs(a);
  if (d !== 0) return d;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function sortPlansNewestFirst(plans) {
  return [...(plans || [])].sort(comparePlansNewestFirst);
}

module.exports = {
  planNumberSeqForSort,
  planOrderListSortMs,
  comparePlansNewestFirst,
  sortPlansNewestFirst,
};
