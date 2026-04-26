/**
 * 前后端共用的领域枚举与常量（单一事实源）。
 * 前端从根目录 `types.ts` re-export；后端从 `backend/src/types/index.ts` re-export。
 */

export enum MilestoneStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DELAYED = 'DELAYED',
}

export enum OrderStatus {
  PLANNING = 'PLANNING',
  PRODUCING = 'PRODUCING',
  QC = 'QC',
  SHIPPED = 'SHIPPED',
  ON_HOLD = 'ON_HOLD',
}

export enum PlanStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  CONVERTED = 'CONVERTED',
}

export type ProcessPricingMode = 'per_piece' | 'per_hour';
export type ProductionLinkMode = 'order' | 'product';
export type ProcessSequenceMode = 'free' | 'sequential';
export type FinanceCategoryKind = 'RECEIPT' | 'PAYMENT';
export type ProdOpType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'STOCK_RETURN'
  | 'OUTSOURCE'
  | 'REWORK'
  | 'REWORK_REPORT'
  | 'SCRAP';
export type FinanceOpType = 'RECEIPT' | 'PAYMENT' | 'RECONCILIATION' | 'SETTLEMENT';

export const FINANCE_DOC_NO_PREFIX: Record<FinanceOpType, string> = {
  RECEIPT: 'SKD',
  PAYMENT: 'FKD',
  RECONCILIATION: 'DZD',
  SETTLEMENT: 'GZD',
};

/** 采购订单 `customData`：由生产计划详情生成 PO 时写入，进销存列表/详情展示来源计划 */
export const PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID = 'sourcePlanId' as const;
export const PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER = 'sourcePlanNumber' as const;

/**
 * 自定义单据/扩展字段类型（单一事实源）：与生产计划「字段配置 → 自定义单据内容」一致。
 * 用于产品分类、合作单位分类、工序报工模板、财务分类扩展项及计划/进销存单据自定义列。
 */
export type CustomDocFieldType = 'text' | 'date' | 'select' | 'file';

/** 历史持久化 JSON 中曾出现的 type，加载时应归一为 CustomDocFieldType */
export type LegacyCustomDocFieldType = CustomDocFieldType | 'number' | 'boolean';
