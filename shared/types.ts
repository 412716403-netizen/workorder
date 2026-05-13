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

/** 与 `psi_records.batch_no` / `production_op_records.batch_no` 一致的最大长度 */
export const BATCH_FIELD_MAX_LEN = 100;

/**
 * 「无批号」哨兵字符串：仅用于 UI / API / 打印展示与等价匹配。
 * - DB 字段 `batch_no` 仍以 `NULL` 表示"无批号"，无需迁移历史数据。
 * - 写入路径：`cleanPsi` 与批次校验把哨兵视同未填，最终写入 `NULL`。
 * - 读取路径：`getStockBatches` 与 `usePsiStockIndex` 把 `NULL` 归一为该哨兵后再返回。
 * 真实业务批号请避免使用该字面量，以免被自动归一为"未填"。
 */
export const BATCH_NO_UNTAGGED = '无批号';

/**
 * 批次号写入/聚合键统一归一：trim、空串视为未填、超长截断至 {@link BATCH_FIELD_MAX_LEN}。
 * 前后端与 Prisma 写入应共用，避免「同批号不同写法」在 Map 中分裂。
 */
export function normalizeBatchNo(input: unknown): string | undefined {
  if (input == null) return undefined;
  const s = String(input).trim();
  if (s === '') return undefined;
  return s.length > BATCH_FIELD_MAX_LEN ? s.slice(0, BATCH_FIELD_MAX_LEN) : s;
}

/** 判断是否为"无批号"：null / undefined / 空串 / 仅空白 / 哨兵字符串 都算。 */
export function isUntaggedBatch(input: unknown): boolean {
  if (input == null) return true;
  const s = String(input).trim();
  return s === '' || s === BATCH_NO_UNTAGGED;
}

/** 把任意输入归一为「展示用批号」：未填 / 哨兵 → {@link BATCH_NO_UNTAGGED}；否则返回归一后的批号字符串。 */
export function batchNoForDisplay(input: unknown): string {
  if (isUntaggedBatch(input)) return BATCH_NO_UNTAGGED;
  return normalizeBatchNo(input) ?? BATCH_NO_UNTAGGED;
}

/** 把展示批号转为写入 DB 的批号：哨兵 / 未填 → undefined（落 NULL）；否则返回归一字符串。 */
export function batchNoForWrite(input: unknown): string | undefined {
  if (isUntaggedBatch(input)) return undefined;
  return normalizeBatchNo(input);
}

/**
 * 可作为明细批次维度参与「按批次库存」汇总的 PSI 类型（与前端 `usePsiStockIndex` 对齐，供文档与扩展参考）。
 */
export const PSI_TYPES_WITH_BATCH_LINE = [
  'PURCHASE_BILL',
  'SALES_BILL',
  'STOCK_IN',
  'TRANSFER',
  'STOCKTAKE',
] as const;

/**
 * 产品分类是否按批次管理物料（与颜色尺码互斥：二者不应同时为 true，服务端会拒绝）。
 */
export function categoryUsesBatchManagement(
  cat: { hasBatchManagement?: boolean | null; hasColorSize?: boolean | null } | null | undefined,
): boolean {
  return Boolean(cat?.hasBatchManagement) && !Boolean(cat?.hasColorSize);
}

/** 协作派发/接受：颜色尺码等规格标签归一（NFKC + 折叠空白），前后端与协作 payload 共用 */
export function normalizeCollabSpecLabel(v: unknown): string | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s.length) return null;
  try {
    s = s.normalize('NFKC');
  } catch {
    /* ignore */
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : null;
}

/** 协作：乙方接受派发时产品分类由本地决策 */
export const COLLAB_ACCEPT_CATEGORY_DECISION = ['existing', 'create', 'none'] as const;
export type CollabAcceptCategoryDecision = (typeof COLLAB_ACCEPT_CATEGORY_DECISION)[number];

export type CollabAcceptCreateProductPayload = {
  name: string;
  sku: string;
  description?: string;
  colorNames?: string[];
  sizeNames?: string[];
  categoryDecision: CollabAcceptCategoryDecision;
  /** categoryDecision === 'existing' 时必填 */
  categoryId?: string | null;
  /** categoryDecision === 'create' 时必填 */
  categoryNameToCreate?: string;
};

export type CollabAcceptTransferBody = {
  dispatchIds?: string[];
  createProduct?: CollabAcceptCreateProductPayload;
};

/**
 * 协作发出 `subcontract_collaboration_dispatches.amendment_status`：
 * 甲方在「待接受」下直接同步修改 payload 后，乙方需确认已查看最新明细（与已接受后的修订流 `PENDING_B_CONFIRM` 区分）。
 */
export const COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW = 'PENDING_B_REVIEW' as const;

/**
 * `production_op_records.collab_data` JSON 常见键（与 `utils/productionOpCollab/*` 键名一致）。
 * 与 `Record<string, unknown>` 交叉以允许扩展字段。
 */
export type ProductionOpCollabData = {
  /** 如协作回传：`collaborationReturn` */
  source?: string;
  stockInCustomData?: Record<string, unknown>;
  outsourceDispatchCustomData?: Record<string, unknown>;
  outsourceReceiveCustomData?: Record<string, unknown>;
  reworkReportCustomData?: Record<string, unknown>;
  defectTreatmentCustomData?: Record<string, unknown>;
  materialStockCustomData?: Record<string, unknown>;
} & Record<string, unknown>;
