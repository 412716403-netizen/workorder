/** 生产业务配置常量（对齐 shared/types.ts PRODUCT_MATERIAL_COST_*） */

const PRODUCT_MATERIAL_COST_MODES = ['consumable', 'document_linked'];

const MATERIAL_COST_MODE_LABEL = {
  consumable: '按报工耗材与结余损耗',
  document_linked: '按关联采购入库与关联收付款',
};

const MATERIAL_COST_MODE_DESC = {
  consumable:
    '按报工耗材数量（BOM 或称重）× 物料采购价，并计入领退料结余损耗。适合精细领料、横机称重等场景。',
  document_linked:
    '按采购入库「关联成品」金额与财务「关联产品」的收付款累计。给供应商付货款时请勿再关联产品，以免与入库重复。',
};

const DEFAULT_WEIGHT_TOLERANCE_PERCENT = 5;

module.exports = {
  PRODUCT_MATERIAL_COST_MODES,
  MATERIAL_COST_MODE_LABEL,
  MATERIAL_COST_MODE_DESC,
  DEFAULT_WEIGHT_TOLERANCE_PERCENT,
};
