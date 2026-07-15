/**
 * 合作单位名称规范化（对齐 Web utils/partnerNormalize.ts）
 */

function partnerNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function findPartnerByName(partners, name, excludeId) {
  const key = partnerNameKey(name);
  if (!key) return undefined;
  return (partners || []).find(
    (p) => partnerNameKey(p.name) === key && p.id !== excludeId,
  );
}

module.exports = {
  partnerNameKey,
  findPartnerByName,
};
