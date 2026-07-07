/**
 * 外协扫码加工厂候选项（对齐 Web OutsourceReceiveListModal.scanPartnerSelectOptions）
 */

function buildOutsourcePartnerOptions(aggregates, partners) {
  const names = new Set();
  (aggregates || []).forEach((row) => {
    if ((row.pending ?? 0) <= 0) return;
    const p = (row.partner ?? '').trim();
    if (p) names.add(p);
  });
  const allowed = [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const master = partners || [];
  const fromMaster = master.filter((p) => allowed.includes(p.name));
  const known = new Set(fromMaster.map((p) => p.name));
  const extras = allowed
    .filter((name) => !known.has(name))
    .map((name) => ({ id: `pending-partner:${name}`, name, contact: '' }));

  return [...fromMaster, ...extras];
}

module.exports = {
  buildOutsourcePartnerOptions,
};
