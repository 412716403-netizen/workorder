/**
 * 返工单据号生成（对齐 Web ReworkPanel：FL 处理不良 / FG 返工报工）
 */

function localCompactYmd(date) {
  const d = date instanceof Date ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function nextDocNo(records, typeFilter, prefix) {
  const todayStr = localCompactYmd(new Date());
  const pattern = `${prefix}${todayStr}-`;
  const existing = (records || []).filter(
    (r) => typeFilter(r) && r.docNo && String(r.docNo).startsWith(pattern),
  );
  const used = new Set(
    existing
      .map((r) => parseInt(String(r.docNo).slice(pattern.length), 10))
      .filter((n) => !Number.isNaN(n) && n >= 1),
  );
  let next = 1;
  while (used.has(next)) next += 1;
  return `${prefix}${todayStr}-${String(next).padStart(4, '0')}`;
}

function getNextDefectTreatmentDocNo(records) {
  return nextDocNo(
    records,
    (r) => r.type === 'REWORK' || r.type === 'SCRAP',
    'FL',
  );
}

function getNextReworkReportDocNo(records) {
  return nextDocNo(records, (r) => r.type === 'REWORK_REPORT', 'FG');
}

module.exports = {
  localCompactYmd,
  getNextDefectTreatmentDocNo,
  getNextReworkReportDocNo,
};
