const {
  PRODUCT_MATERIAL_COST_MODES,
  MATERIAL_COST_MODE_LABEL,
  MATERIAL_COST_MODE_DESC,
  DEFAULT_WEIGHT_TOLERANCE_PERCENT,
} = require('../config/productionConfig.js');

function clampWeightTolerance(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WEIGHT_TOLERANCE_PERCENT;
  return Math.min(100, Math.max(0, n));
}

function normalizeProductEconomicsSettings(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const mode = base.materialCostMode;
  const materialCostMode = PRODUCT_MATERIAL_COST_MODES.includes(mode)
    ? mode
    : 'consumable';
  return { materialCostMode };
}

function isTraceabilityEnabled(plugins) {
  return !(plugins && plugins.traceability === false);
}

/**
 * 构建生产业务配置页 UI 模型
 * @param {Record<string, unknown>} config
 * @param {Record<string, boolean>} plugins
 */
function buildProductionConfigForm(config, plugins) {
  const cfg = config || {};
  const economics = normalizeProductEconomicsSettings(cfg.productEconomicsSettings);
  const weightEnabled = isTraceabilityEnabled(plugins);

  const exceedToggles = [
    {
      key: 'allowExceedMaxReportQty',
      label: '允许报工数量超过最大可报数量',
      desc: '关闭后，报工数量将被限制在弹窗中显示的「最多 N」以内。',
      value: !!cfg.allowExceedMaxReportQty,
    },
    {
      key: 'allowExceedMaxOutsourceReceiveQty',
      label: '允许外协收货数量超过最大可收货数量',
      desc: '关闭后，外协收货录入与扫码累加将被限制在每行的「最多 N」以内。',
      value: !!cfg.allowExceedMaxOutsourceReceiveQty,
    },
    {
      key: 'allowExceedMaxStockInQty',
      label: '允许生产入库数量超过最大可入库数量',
      desc: '关闭后，待入库清单做入库时，入库数量将被限制在「待入库 N」以内。',
      value: !!cfg.allowExceedMaxStockInQty,
    },
  ];

  const costModes = PRODUCT_MATERIAL_COST_MODES.map((mode) => ({
    mode,
    label: MATERIAL_COST_MODE_LABEL[mode] || mode,
    desc: MATERIAL_COST_MODE_DESC[mode] || '',
    active: economics.materialCostMode === mode,
  }));

  return {
    exceedToggles,
    weightEnabled,
    weightTolerancePercent: clampWeightTolerance(
      cfg.weightTolerancePercent ?? DEFAULT_WEIGHT_TOLERANCE_PERCENT,
    ),
    costModes,
    productEconomicsSettings: economics,
  };
}

module.exports = {
  clampWeightTolerance,
  normalizeProductEconomicsSettings,
  isTraceabilityEnabled,
  buildProductionConfigForm,
};
