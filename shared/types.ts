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
