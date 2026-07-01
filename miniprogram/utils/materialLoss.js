/**
 * 物料损耗（对齐 Web utils/materialLoss.ts）
 */

const MATERIAL_LOSS_RATES_KEY = 'materialLossRates';

function getMaterialLossRates(customData) {
  const raw = customData && customData[MATERIAL_LOSS_RATES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  Object.keys(raw).forEach((key) => {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  });
  return out;
}

function applyLoss(base, lossPct) {
  const b = Number(base);
  if (!Number.isFinite(b)) return 0;
  const p = Number(lossPct);
  if (!Number.isFinite(p) || p <= 0) return b;
  return b * (1 + p / 100);
}

module.exports = {
  MATERIAL_LOSS_RATES_KEY,
  getMaterialLossRates,
  applyLoss,
};
