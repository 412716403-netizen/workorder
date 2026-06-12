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

/**
 * 工单派发完成状态（持久化字段，`ProductionOrder.dispatchStatus`）。
 * - `IN_PROGRESS`：进行中（默认值，或入库未达计划数）
 * - `COMPLETED`：已完成（入库累计 ≥ 计划数 自动写入；或用户手动覆盖）
 * 自动推进规则见 `recalcOrderDispatchStatusByStockIn`：当 `dispatchStatusManual=true` 时跳过自动逻辑。
 */
export enum OrderDispatchStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export const ORDER_DISPATCH_STATUS_LABEL: Record<OrderDispatchStatus, string> = {
  [OrderDispatchStatus.IN_PROGRESS]: '进行中',
  [OrderDispatchStatus.COMPLETED]: '已完成',
};

/**
 * 计划单派发完成状态（响应派生字段，不落库，由后端 `listPlans` 注入）。
 * 基于该计划单下「直接关联的工单」（`productionOrders WHERE planOrderId = plan.id`）聚合得到：
 * - 无工单 → `NOT_DISPATCHED`
 * - 全部工单 `dispatchStatus === COMPLETED` → `COMPLETED`
 * - 其他 → `IN_PROGRESS`
 * 父子计划在列表里各自是独立的 `PlanOrder` 行，互不影响。
 */
export enum PlanDispatchStatus {
  NOT_DISPATCHED = 'NOT_DISPATCHED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export const PLAN_DISPATCH_STATUS_LABEL: Record<PlanDispatchStatus, string> = {
  [PlanDispatchStatus.NOT_DISPATCHED]: '未下单',
  [PlanDispatchStatus.IN_PROGRESS]: '未完成',
  [PlanDispatchStatus.COMPLETED]: '已完成',
};

/** 中文状态文案 → PlanDispatchStatus 映射（搜索框关键字匹配用） */
export const PLAN_DISPATCH_STATUS_BY_LABEL: Record<string, PlanDispatchStatus> = {
  未下单: PlanDispatchStatus.NOT_DISPATCHED,
  未完成: PlanDispatchStatus.IN_PROGRESS,
  已完成: PlanDispatchStatus.COMPLETED,
};

export function isPlanDispatchStatus(v: unknown): v is PlanDispatchStatus {
  return v === PlanDispatchStatus.NOT_DISPATCHED
    || v === PlanDispatchStatus.IN_PROGRESS
    || v === PlanDispatchStatus.COMPLETED;
}

export function isOrderDispatchStatus(v: unknown): v is OrderDispatchStatus {
  return v === OrderDispatchStatus.IN_PROGRESS || v === OrderDispatchStatus.COMPLETED;
}

export type ProcessPricingMode = 'per_piece' | 'per_hour';
export type ProductionLinkMode = 'order' | 'product';
export type ProcessSequenceMode = 'free' | 'sequential';
export type FinanceCategoryKind = 'RECEIPT' | 'PAYMENT';

/** 租户行业类型（平台管理员指定；预设数据在代码中维护） */
export const TENANT_INDUSTRY_KINDS = ['generic', 'sweater_factory'] as const;
export type TenantIndustryKind = (typeof TENANT_INDUSTRY_KINDS)[number];

export const TENANT_INDUSTRY_KIND_LABELS: Record<TenantIndustryKind, string> = {
  generic: '通用',
  sweater_factory: '毛衣工厂',
};

export function isTenantIndustryKind(value: string): value is TenantIndustryKind {
  return (TENANT_INDUSTRY_KINDS as readonly string[]).includes(value);
}

/** 非法或空值归一为 `generic` */
export function normalizeTenantIndustryKind(value: string | null | undefined): TenantIndustryKind {
  if (value != null && value !== '' && isTenantIndustryKind(value)) return value;
  return 'generic';
}

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
 * - knowledge：资料库引用，填值时从资料库中选择文档，存储 JSON `{ id, title }`。
 */
export type CustomDocFieldType = 'text' | 'date' | 'select' | 'file' | 'knowledge';

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

/** 进销存 `PURCHASE_BILL` 单据中文名（导航、表单、对账、打印分组等） */
export const PSI_PURCHASE_BILL_LABEL = '采购入库';

const PSI_PURCHASE_BILL_LABEL_LEGACY = '采购单';

/** 对账/详情等处的 docType 是否为采购入库（兼容历史「采购单」文案） */
export function isPurchaseBillDocType(docType: string): boolean {
  return docType === PSI_PURCHASE_BILL_LABEL || docType === PSI_PURCHASE_BILL_LABEL_LEGACY;
}

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

/**
 * 扫码报工/入库/返工时，按「单品码模式」逐件扫入的单品码列表，写入对应记录的 `customData`
 * （工序报工 → milestone/PMP report；入库/返工 → ProductionOpRecord）。
 *
 * 用途：产品追溯查询时按此列表逐件精确命中，使「单品码模式」下每件单独可查、同批未扫入的单品不被误关联；
 * 批次码模式不写该键，追溯沿用 `virtual_batch_id`（整批共享链路）。
 *
 * 关键点：
 * - 该键只服务于追溯展示，**不改变扫码去重所依赖的 `item_code_id / virtual_batch_id` 列写入**；
 * - 以 `__` 前缀标记为内部元数据，报工详情/打印不展示（见 `INTERNAL_CUSTOM_DATA_KEYS`）。
 */
export const SCAN_ITEM_CODE_IDS_KEY = '__scanItemCodeIds' as const;

/** system_settings 键：扫码称重容差百分比（默认 5，表示 ±5%） */
export const WEIGHT_TOLERANCE_PERCENT_KEY = 'weightTolerancePercent' as const;
export const DEFAULT_WEIGHT_TOLERANCE_PERCENT = 5;

/** 规格×工序历史外协收货单件重量均值（Σ交货重÷Σ收货件数） */
export interface ReceiveUnitWeightAverageRow {
  variantId: string;
  nodeId: string;
  avgUnitWeightKg: number;
  recordCount: number;
}

export interface ReceiveUnitWeightAveragesResponse {
  productId: string;
  averages: ReceiveUnitWeightAverageRow[];
}

/**
 * 产品规格（变体）业务引用情况。
 * 前端 `api.products.variantUsage` 与后端 `GET /products/:id/variant-usage` 共用：
 * 删除颜色/尺码（即删除变体）前校验是否已产生业务数据。
 */
export interface ProductVariantUsageDetail {
  /** 引用来源中文名，如「工单明细」「进销存流水」 */
  label: string;
  count: number;
}

export interface ProductVariantUsageEntry {
  variantId: string;
  /** 规格展示名（skuSuffix，如「红色-XL」），缺省回退 variantId */
  variantLabel: string;
  /** 各来源引用条数合计；> 0 表示该规格不可删除 */
  total: number;
  details: ProductVariantUsageDetail[];
}

export interface ProductVariantUsageResponse {
  productId: string;
  usages: ProductVariantUsageEntry[];
}

/**
 * 扫码二次校验（去重 + 单据上限）请求/响应。
 * 前端 `itemCodesApi.validateUsage` 与后端 `POST /item-codes/scan/validate-usage`
 * 共用：扫码成功后、改表单前调用；持久化去重作用域由 `purpose` 决定。
 */
export type ScanValidatePurpose =
  | 'MILESTONE_REPORT'
  | 'PRODUCT_REPORT'
  | 'STOCK_IN'
  | 'REWORK_REPORT'
  | 'OUTSOURCE_RECEIVE';

export interface ScanValidateScope {
  milestoneId?: string;
  productId?: string;
  milestoneTemplateId?: string;
  variantId?: string | null;
  orderId?: string;
  orderIds?: string[];
  sourceReworkId?: string;
  nodeId?: string;
  partner?: string;
  docNo?: string;
  excludeRecordId?: string;
}

export interface ScanValidateRequest {
  purpose: ScanValidatePurpose;
  scope: ScanValidateScope;
  itemCodeId?: string | null;
  virtualBatchId?: string | null;
  currentQty?: number;
  addQty?: number;
  maxQty?: number;
}

export type ScanValidateCode = 'ALLOWED' | 'DUPLICATE_SAVED' | 'EXCEEDS_MAX';

export interface ScanValidateResponse {
  code: ScanValidateCode;
  message?: string;
  remaining?: number;
}

/** 款式开发：款式状态 */
export enum DevStyleStatus {
  DEVELOPING = 'developing',
  ARCHIVED = 'archived',
  PUBLISHED = 'published',
}

export const DEV_STYLE_STATUS_LABEL: Record<DevStyleStatus, string> = {
  [DevStyleStatus.DEVELOPING]: '开发中',
  [DevStyleStatus.ARCHIVED]: '已归档',
  [DevStyleStatus.PUBLISHED]: '已发布大货',
};

/** 款式开发：样品轮次内开发节点状态 */
export enum DevStageStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  EXCEPTION = 'exception',
}

export const DEV_STAGE_STATUS_LABEL: Record<DevStageStatus, string> = {
  [DevStageStatus.PENDING]: '待开始',
  [DevStageStatus.IN_PROGRESS]: '进行中',
  [DevStageStatus.COMPLETED]: '已完成',
  [DevStageStatus.EXCEPTION]: '异常/退回',
};

export interface DevStageFieldDto {
  id: string;
  label: string;
  value: string;
  type: string;
}

export interface DevAttachmentDto {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
}

export interface DevStageDto {
  id: string;
  name: string;
  status: DevStageStatus;
  order: number;
  updatedAt: string;
  fields: DevStageFieldDto[];
  attachments: DevAttachmentDto[];
}

export interface DevLogDto {
  id: string;
  user: string;
  action: string;
  detail: string;
  time: string;
}

export interface DevSampleDto {
  id: string;
  name: string;
  createdAt: string;
  stages: DevStageDto[];
  logs: DevLogDto[];
}

export interface DevStyleVariantDto {
  id: string;
  colorId: string;
  sizeId: string;
  skuSuffix: string;
  nodeBoms?: Record<string, string>;
}

export interface DevBomItemDto {
  id?: number;
  categoryId?: string;
  productId: string;
  quantity: number;
  note?: string;
  useShortageOnly?: boolean;
  excludeFromWeightShare?: boolean;
  sortOrder?: number;
}

export interface DevBomDto {
  id: string;
  parentStyleId: string;
  variantId?: string;
  nodeId?: string;
  name?: string;
  items: DevBomItemDto[];
}

export interface DevStyleDto {
  id: string;
  code: string;
  name: string;
  customerName?: string;
  imageUrl?: string;
  categoryId?: string;
  categoryCustomData?: Record<string, unknown>;
  colorIds: string[];
  sizeIds: string[];
  milestoneNodeIds: string[];
  salesPrice?: number;
  purchasePrice?: number;
  unitId?: string;
  supplierId?: string;
  status: DevStyleStatus;
  publishedProductId?: string;
  variants: DevStyleVariantDto[];
  samples: DevSampleDto[];
  createdAt: string;
  updatedAt: string;
}

export interface DevStageTemplateFieldDto {
  id: string;
  label: string;
  type: CustomDocFieldType;
  required: boolean;
  order: number;
  options?: string[];
  /** type=date：登记时使用日期时间控件 */
  dateWithTime?: boolean;
  /** type=date：打开登记表单时自动填入当前日期/时间 */
  dateAutoFill?: boolean;
}

export interface DevStageTemplateDto {
  id: string;
  name: string;
  order: number;
  fields: DevStageTemplateFieldDto[];
}

/** 资料库文件夹 */
export interface KnowledgeFolderDto {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 资料库文档 */
export interface KnowledgeDocumentDto {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeTreeResponse {
  folders: KnowledgeFolderDto[];
  documents: KnowledgeDocumentDto[];
}

export interface KnowledgeAssetUploadResponse {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}
