/**
 * 返工报工流水操作人/外协工厂展示（对齐 Web ReworkReportFlowListModal）
 */

function buildReworkByIdMap(records) {
  const m = new Map();
  (records || []).forEach((x) => {
    if (x.type === 'REWORK' && x.id != null) m.set(String(x.id), x);
  });
  return m;
}

function resolveReworkReportReceiveFactory(rr, reworkById) {
  const p = String((rr && rr.partner) || '').trim();
  if (p) return p;
  const sid = rr && rr.sourceReworkId;
  if (sid && reworkById) {
    const src = reworkById.get(String(sid));
    const sp = String((src && src.partner) || '').trim();
    if (sp) return sp;
  }
  return '';
}

function uniqOutsourcePartnersInBatch(batch, reworkById) {
  return [...new Set(
    (batch || [])
      .map((x) => resolveReworkReportReceiveFactory(x, reworkById))
      .filter(Boolean),
  )];
}

function uniqOperatorsInBatch(batch) {
  return [...new Set(
    (batch || [])
      .map((x) => String((x && x.operator) || '').trim())
      .filter(Boolean),
  )];
}

function buildReworkReportOperatorColumnLabel(groupRecs, reworkById) {
  const recs = groupRecs || [];
  const ops = [...new Set(
    recs
      .map((x) => String((x && x.operator) || '').trim())
      .filter((op) => op && op !== '外协收回'),
  )];
  const opPart = ops.length === 0
    ? ''
    : ops.length === 1
      ? ops[0]
      : `${ops[0]} 等${ops.length}人`;
  const factoryLabels = uniqOutsourcePartnersInBatch(recs, reworkById);
  const outsourcePart = factoryLabels.length === 0
    ? ''
    : factoryLabels.length === 1
      ? factoryLabels[0]
      : factoryLabels.join('、');
  if (opPart && outsourcePart) return `${opPart} · ${outsourcePart}`;
  return opPart || outsourcePart || '—';
}

function buildReworkReportOperatorsLabel(batch, reworkById) {
  const ops = uniqOperatorsInBatch(batch);
  if (ops.length === 0) return '—';
  if (ops.length === 1) return ops[0];
  return `${ops[0]} 等${ops.length}人`;
}

function buildReworkReportOutsourcePartnerDisplay(batch, reworkById) {
  const partners = uniqOutsourcePartnersInBatch(batch, reworkById);
  if (partners.length === 0) return '';
  if (partners.length === 1) return partners[0];
  return partners.join('、');
}

function recordMatchesOperatorKeyword(rec, keyword, reworkById) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return true;
  const opOk = String((rec && rec.operator) || '').toLowerCase().includes(kw);
  const partnerOk = String((rec && rec.partner) || '').toLowerCase().includes(kw);
  const factory = resolveReworkReportReceiveFactory(rec, reworkById).toLowerCase();
  const factoryOk = factory.includes(kw);
  return opOk || partnerOk || factoryOk;
}

module.exports = {
  buildReworkByIdMap,
  resolveReworkReportReceiveFactory,
  uniqOutsourcePartnersInBatch,
  uniqOperatorsInBatch,
  buildReworkReportOperatorColumnLabel,
  buildReworkReportOperatorsLabel,
  buildReworkReportOutsourcePartnerDisplay,
  recordMatchesOperatorKeyword,
};
