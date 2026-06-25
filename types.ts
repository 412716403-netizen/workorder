import type { CustomDocFieldType } from './shared/types';

export {
  MilestoneStatus,
  OrderStatus,
  PlanStatus,
  OrderDispatchStatus,
  PlanDispatchStatus,
  ORDER_DISPATCH_STATUS_LABEL,
  PLAN_DISPATCH_STATUS_LABEL,
  PLAN_DISPATCH_STATUS_BY_LABEL,
  isPlanDispatchStatus,
  isOrderDispatchStatus,
  FINANCE_DOC_NO_PREFIX,
  PLAN_DOC_NO_PREFIX,
  WORK_ORDER_DOC_NO_PREFIX,
  SCAN_ITEM_CODE_IDS_KEY,
  WEIGHT_TOLERANCE_PERCENT_KEY,
  DEFAULT_WEIGHT_TOLERANCE_PERCENT,
  type ReceiveUnitWeightAverageRow,
  type ReceiveUnitWeightAveragesResponse,
  type ProductVariantUsageDetail,
  type ProductVariantUsageEntry,
  type ProductVariantUsageResponse,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
  BATCH_FIELD_MAX_LEN,
  BATCH_NO_UNTAGGED,
  normalizeBatchNo,
  isUntaggedBatch,
  batchNoForDisplay,
  batchNoForWrite,
  PSI_TYPES_WITH_BATCH_LINE,
  PSI_PURCHASE_BILL_LABEL,
  isPurchaseBillDocType,
  categoryUsesBatchManagement,
  normalizeCollabSpecLabel,
  COLLAB_ACCEPT_CATEGORY_DECISION,
  COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW,
  type CollabAcceptCategoryDecision,
  type CollabAcceptCreateProductPayload,
  type CollabAcceptTransferBody,
  type ProcessPricingMode,
  type ProductionLinkMode,
  PRODUCTION_LINK_MODE_LABELS,
  normalizeProductionLinkMode,
  type ProcessSequenceMode,
  type FinanceCategoryKind,
  type TenantIndustryKind,
  TENANT_INDUSTRY_KINDS,
  TENANT_INDUSTRY_KIND_LABELS,
  isTenantIndustryKind,
  normalizeTenantIndustryKind,
  type ProdOpType,
  type FinanceOpType,
  type CustomDocFieldType,
  type LegacyCustomDocFieldType,
  type ProductionOpCollabData,
  type ScanValidatePurpose,
  type ScanValidateScope,
  type ScanValidateRequest,
  type ScanValidateResponse,
  type ScanValidateCode,
  DevStyleStatus,
  DevStageStatus,
  DEV_STYLE_STATUS_LABEL,
  DEV_STAGE_STATUS_LABEL,
  type DevStyleDto,
  type DevStyleVariantDto,
  type DevSampleDto,
  type DevStageDto,
  type DevStageFieldDto,
  type DevAttachmentDto,
  type DevLogDto,
  type DevBomDto,
  type DevBomItemDto,
  type DevStageTemplateDto,
  type DevStageTemplateFieldDto,
  type KnowledgeFolderDto,
  type KnowledgeDocumentSummaryDto,
  type KnowledgeDocumentDto,
  type KnowledgeTreeResponse,
  type KnowledgeDocumentReferencesResponse,
  type KnowledgeAssetUploadResponse,
  KNOWLEDGE_DOCUMENT_CONTENT_MAX_CHARS,
} from './shared/types';

export {
  WORKBENCH_BUILTIN_DEFAULT,
  WORKBENCH_HOME_PAGE_ID,
  WORKBENCH_HOME_PINNED_WIDGET_TYPES,
  WORKBENCH_HOME_PINNED_LAYOUT,
  WORKBENCH_HOME_DEFAULT_LAYOUT,
  WORKBENCH_WIDGET_CATALOG,
  WORKBENCH_WIDGET_TYPES,
  FEATURE_PLUGIN_CATALOG,
  DASHBOARD_SETTING_KEYS,
  defaultFeaturePlugins,
  parseFeaturePlugins,
  isWorkbenchHomePage,
  isHomePinnedWidgetType,
  mergeWorkbenchHomePinnedItems,
  isWorkbenchWidgetType,
  type WorkbenchWidgetType,
  type WorkbenchHomePinnedWidgetType,
  type WorkbenchWidgetCategory,
  type WorkbenchLayoutItem,
  type WorkbenchPageLayout,
  type WorkbenchPage,
  type WorkbenchConfig,
  type FeaturePluginId,
  type FeaturePluginDefinition,
  type FeaturePluginsConfig,
  type WorkbenchWidgetDefinition,
} from './shared/workbench';

export {
  WORKBENCH_SHORTCUT_CATALOG,
  DEFAULT_DASHBOARD_SHORTCUT_IDS,
  resolveShortcutItems,
  normalizeShortcutIds,
  getShortcutDefinition,
  isKnownShortcutId,
  type WorkbenchShortcutDefinition,
  type WorkbenchShortcutIconKey,
} from './shared/workbenchShortcuts';

export {
  FEATURE_PLUGIN_MARKET_CATALOG,
  FEATURE_PLUGIN_CATEGORY_TABS,
  getFeaturePluginMarketItem,
  getLatestFeaturePlugins,
  isFeaturePluginActivated,
  type FeaturePluginCategoryId,
  type FeaturePluginIconKey,
  type FeaturePluginMarketItem,
  type FeaturePluginGuideSection,
} from './shared/featurePluginCatalog';

export {
  DASHBOARD_PLATFORM_PUBLISHER,
  MAX_PLATFORM_ANNOUNCEMENTS,
  publishedMessageToNotification,
  type DashboardPublishedMessage,
} from './shared/dashboardMessages';

export {
  TENANT_EXPIRY_REMINDER_DAYS,
  DASHBOARD_SYSTEM_PUBLISHER,
  calendarDaysUntilExpiry,
  resolveTenantExpiryReminderDay,
  buildTenantExpiryReminderContent,
  tenantExpiryReminderId,
  type TenantExpiryReminderDay,
} from './shared/tenantExpiryReminder';

export {
  WORKBENCH_ORDER_STATS_PERIODS,
  WORKBENCH_ORDER_STATS_PERIOD_LABELS,
  MAX_DASHBOARD_ORDER_STATS_NODES,
  DEFAULT_DASHBOARD_ORDER_STATS_NODE_COUNT,
  normalizeOrderStatsNodeIds,
  isWorkbenchOrderStatsPeriod,
  type WorkbenchOrderStatsPeriod,
  type DashboardOrderStatsRow,
  type DashboardOrderStatsNodeOption,
  type DashboardOutsourceStatsRow,
  type DashboardReworkStatsRow,
  type DashboardSalesStats,
  type DashboardSalesOrderStats,
  type DashboardFinanceStats,
  workbenchPeriodLabel,
  resolveWorkbenchStatsPeriodRange,
} from './shared/workbenchOrderStats';

export {
  resolveEffectiveWorkbenchConfig,
  normalizeWorkbenchConfig,
  filterWorkbenchByAccess,
  canUseWidget,
  isValidWorkbenchConfig,
} from './shared/workbenchValidate';

/** 开发管理 BOM（与 BOM 结构对齐，parent 为款式 id） */
export type DevBOM = DevBomDto;
export type DevBOMItem = DevBomItemDto;

/** 与 CustomDocFieldType 相同，保留别名供计划单单据配置等既有命名 */
export type PlanFormCustomFieldType = CustomDocFieldType;

export {
  BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
  isCodeMergedPrintTemplateId,
  isReadonlySystemPrintTemplate,
  isSystemLockedPrintTemplateId,
  SYSTEM_LOCKED_PRINT_TEMPLATE_IDS,
} from './shared/systemPrintTemplates';

/** 单品码（一物一码）：计划内每件唯一扫码标识 */
export interface ItemCode {
  id: string;
  tenantId: string;
  planOrderId: string;
  productId: string;
  variantId?: string | null;
  serialNo: number;
  scanToken: string;
  status: 'ACTIVE' | 'VOIDED';
  createdAt: string;
  /** 由「批次码+单品码」生成时关联的批次 id */
  batchId?: string | null;
  /** 批次内第几件（1..批次件数）；展示编号「计划单号-批次序号-件号」用 */
  batchPieceNo?: number | null;
  /** 列表接口 include，用于展示所属批次编号 */
  batch?: { id: string; sequenceNo: number } | null;
}

/** 批次码：单计划单、单产品、单规格 + 数量；可选同时生成绑定单品码 */
export interface PlanVirtualBatch {
  id: string;
  tenantId: string;
  planOrderId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  /** 同一计划单内从 1 递增，作废不回收 */
  sequenceNo: number;
  scanToken: string;
  status: 'ACTIVE' | 'VOIDED';
  createdAt: string;
  /** 列表接口返回：该批次下绑定单品码条数 */
  itemCodeCount?: number;
}

/**
 * 扫码接口调用方上下文：后端根据 callerTenantId 在码所在计划树里定位
 * 「本租户的计划节点与工单号」。
 */
export interface ScanCallerContext {
  callerPlanOrderId: string | null;
  callerPlanNumber: string | null;
  callerOrderNumbers: string[];
  relation: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER';
}

export interface ScanItemCodeResult {
  kind: 'ITEM_CODE';
  status: 'ACTIVE' | 'VOIDED';
  message?: string;
  itemCodeId?: string;
  serialNo?: number;
  /** 单品展示编号，如 PLN47-2-1（扫码列表等用，由服务端或前端 formatItemCodeSerialLabel 生成） */
  serialLabel?: string | null;
  planOrderId?: string;
  planNumber?: string | null;
  orderNumbers?: string[];
  productId?: string;
  productName?: string | null;
  sku?: string | null;
  variantId?: string | null;
  variantLabel?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
  ownerTenantId?: string;
  ownerTenantName?: string | null;
  batchId?: string | null;
  batchSequenceNo?: number | null;
  batchPieceNo?: number | null;
  batchSerialLabel?: string | null;
  /** 关联虚拟批次的扫码 token；无批次时为 null（报工等场景「批次扫码方式」下扫单品归一化用） */
  batchScanToken?: string | null;
  callerContext?: ScanCallerContext;
}

export interface ScanVirtualBatchResult {
  kind: 'VIRTUAL_BATCH';
  status: 'ACTIVE' | 'VOIDED';
  message?: string;
  batchId?: string;
  quantity?: number;
  /** 计划内批次序号（展示编号 PLN47-2 用） */
  sequenceNo?: number;
  /** 批次展示编号，如 PLN47-2 */
  serialLabel?: string | null;
  planOrderId?: string;
  planNumber?: string | null;
  orderNumbers?: string[];
  productId?: string;
  productName?: string | null;
  sku?: string | null;
  variantId?: string | null;
  variantLabel?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
  ownerTenantId?: string;
  ownerTenantName?: string | null;
  itemCodes?: Array<{ id: string; serialNo: number; scanToken: string; status: 'ACTIVE' | 'VOIDED' }>;
  callerContext?: ScanCallerContext;
}

export type ScanResult = ScanItemCodeResult | ScanVirtualBatchResult;

export interface TraceEvent {
  kind: 'REPORT' | 'OUTSOURCE' | 'REWORK' | 'STOCK' | 'TRANSFER' | 'OTHER';
  subKind: string;
  id: string;
  tenantId: string;
  tenantName: string | null;
  timestamp: string;
  quantity: number;
  orderId?: string | null;
  orderNumber?: string | null;
  nodeName?: string | null;
  operator?: string | null;
  notes?: string | null;
  partner?: string | null;
  warehouseId?: string | null;
}

export interface TraceResult {
  events: TraceEvent[];
  tenants: Array<{ id: string; name: string | null }>;
  planTree: Array<{ id: string; tenantId: string; planNumber: string; parentPlanId: string | null }>;
  /** 服务端分页追溯时返回 */
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  /** 追溯口径说明（单品码追溯页展示） */
  scopeNote?: string | null;
  /** 当前追溯的单品码展示编号 */
  itemSerialLabel?: string | null;
}

/**
 * @deprecated 请使用 CustomDocFieldType；保留别名仅用于读取旧 JSON 时的宽类型标注。
 * 新代码与归一化后的配置仅含 text | date | select | file。
 */
export type FieldType = import('./shared/types').LegacyCustomDocFieldType;

/** 工序节点库「报工自定义单据内容」类型，与单据自定义一致 */
export type ProcessReportFieldType = CustomDocFieldType;

export interface ReportFieldDefinition {
  id: string;
  label: string;
  type: CustomDocFieldType;
  required?: boolean;
  options?: string[];
  /** type=date：登记/报工使用日期时间控件，可手输具体时间 */
  dateWithTime?: boolean;
  /** type=date：打开表单时用系统当前日期或日期时间自动填入（与 dateWithTime 组合） */
  dateAutoFill?: boolean;
  placeholder?: string;
  /** 产品分类扩展字段：是否在工单列表、外协列表等场景展示（非文件字段）；合作单位分类下表示是否在表单中显示。默认 true */
  showInForm?: boolean;
}

export interface DictionaryItem {
  id: string;
  name: string;
  value: string;
}

export interface AppDictionaries {
  colors: DictionaryItem[];
  sizes: DictionaryItem[];
  units: DictionaryItem[];
}

export interface GlobalNodeTemplate {
  id: string;
  name: string;
  /** 工序节点库排序，越小越靠前 */
  sortOrder?: number;
  /** 报工页只读展示项（工艺说明、标准 PDF 等），内容由产品 routeReportDisplayValues 维护 */
  reportDisplayTemplate?: ReportFieldDefinition[];
  reportTemplate: ReportFieldDefinition[];
  hasBOM?: boolean;
  category?: string;
  /** @deprecated 用 enableWorkerAssignment / enableEquipmentAssignment 替代 */
  enableAssignment?: boolean;
  /** 是否启用工人派工（计划单详情中显示分派负责人），默认 true */
  enableWorkerAssignment?: boolean;
  /** 是否启用设备派工（计划单详情中显示分派设备），默认 true */
  enableEquipmentAssignment?: boolean;
  /** 报工时是否选择设备；开启后该工序报工时需选择设备 */
  enableEquipmentOnReport?: boolean;
  /** 是否开启计件工价；开启后产品与 BOM 中可配置该工序工价，计划单详情显示工价 */
  enablePieceRate?: boolean;
  /** 是否可外协；开启后该工序会在外协管理待发清单中显示，可按工单选择工序发出 */
  allowOutsource?: boolean;
  /**
   * 是否「不按顺序生产」。系统全局恒按工序顺序生产；开启本开关后该工序脱链：
   * 工单中心可按工单总量对该工序报工，不再校验前一道是否已报；
   * 其下游工序仍取「上一道（即该脱链工序）的完成量」为可报基数。
   */
  allowOutOfSequence?: boolean;
  /**
   * 是否开启「报工记录重量」。开启后：
   * 1) 本工序报工/外协收回时会要求录入本次交货重量（kg）；
   * 2) 报工记录写入时会按 BOM 子项 quantity（排除 `excludeFromWeightShare` 的辅料）自动派生占比，把交货重量拆成各子物料实际消耗快照 `ProductionOpRecord.materialBreakdown`；
   * 3) 生产物料面板的"报工耗材"列会把该工序报工对应的子物料消耗从"件数×BOM"切换为"重量×占比"，使"结余"自然变为真实损耗量。
   */
  enableWeightOnReport?: boolean;
  /**
   * 是否开启「扫码称重」。开启后（且追溯码插件开启）：**工单报工 / 外协收货**的扫码会话顶部出现电子秤捕获框，
   * 每次扫码快照秤读数并与「单件标准重量 × 数量」做理论/实测比对。
   * 仅控制秤框显示与比对，本身不落库重量；若该工序同时开启 `enableWeightOnReport`，
   * 扫码会话累计实测总重会自动同步到报工 / 收货表单的交货重量字段。（返工报工扫码不使用。）
   */
  enableScanWeighing?: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  color: string;
  hasProcess: boolean;
  hasSalesPrice: boolean;
  hasPurchasePrice: boolean;
  /** 是否关联合作单位（首选供应商；开发管理客户字段与按客户排序） */
  linkPartner?: boolean;
  hasColorSize: boolean;
  /** 是否启用批次管理：启用后相关产品在采购、出入库和生产入库中按批次记录 */
  hasBatchManagement?: boolean;
  customFields: ReportFieldDefinition[];
}

export interface PartnerCategory {
  id: string;
  name: string;
  description?: string;
  customFields: ReportFieldDefinition[];
}

export interface FinanceCategory {
  id: string;
  /** 分类归属：收款单 或 付款单 */
  kind: FinanceCategoryKind;
  /** 分类名称 */
  name: string;
  /** 是否关联工单 */
  linkOrder?: boolean;
  /** 是否关联合作单位 */
  linkPartner?: boolean;
  /** 是否选择收支账户 */
  selectPaymentAccount?: boolean;
  /** 是否关联工人 */
  linkWorker?: boolean;
  /** 是否关联产品 */
  linkProduct?: boolean;
  customFields: ReportFieldDefinition[];
}

/** 收支账户类型（如：现金、银行存款、微信、支付宝），用于收付款登记时选择 */
export interface FinanceAccountType {
  id: string;
  name: string;
}

export interface BOMItem {
  categoryId?: string;
  productId: string;
  quantity: number;
  /** BOM 编辑时用于保留用户原始输入，避免 0 无法清空等交互问题 */
  quantityInput?: string;
  note?: string;
  /** 为 true 时，该子项用量按父物料的「缺料数」计算（用于替代料/补料，如毛条按全毛黑色缺料数计算） */
  useShortageOnly?: boolean;
  /** 报工按重量分摊消耗时：勾选后本子项不参与重量分摊（辅料如标签/纽扣/洗水唛），仍按件数 × quantity 统计 */
  excludeFromWeightShare?: boolean;
}

export interface BOM {
  id: string;
  name: string;
  parentProductId: string;
  variantId?: string;
  nodeId?: string;
  version: string;
  items: BOMItem[];
}

export interface ProductVariant {
  id: string;
  colorId: string;
  sizeId: string;
  skuSuffix: string;
  nodeBoms?: Record<string, string>;
  /** 规格×工序单件标准重量(kg) */
  nodeUnitWeights?: Record<string, number>;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  imageUrl?: string; // base64 data URL 或外部链接
  categoryId?: string; 
  salesPrice?: number;    
  purchasePrice?: number; 
  supplierId?: string; 
  /** 产品单位，关联公共数据字典 units */
  unitId?: string;
  colorIds: string[];
  sizeIds: string[];
  variants: ProductVariant[];
  categoryCustomData?: Record<string, any>; 
  milestoneNodeIds: string[];
  /** 报工页只读展示项内容：工序节点 id -> 展示字段 id -> 字符串值（与 reportDisplayTemplate 对应） */
  routeReportDisplayValues?: Record<string, Record<string, string>>;
  /** 标准生产路线报工填报项存档：工序节点 id -> 字段 id -> 字符串值 */
  routeReportValues?: Record<string, Record<string, string>>;
  /** 各工序工价（元/件 或 元/时，由 nodePricingModes 决定），key 为工序节点 id */
  nodeRates?: Record<string, number>;
  /** 各工序计价方式，未设置时使用系统默认；key 为工序节点 id */
  nodePricingModes?: Record<string, ProcessPricingMode>;
  /** 产品模式下已下达生产工单时，后端计算的运行时只读标志：工序（milestoneNodeIds）不可再改 */
  processLocked?: boolean;
  /** 是否启用；缺省 true。禁用后不在商品选择组件中出现，档案列表仍可管理 */
  enabled?: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  category: string; 
  location?: string;
  contact?: string;
  description?: string;
}

export interface Worker {
  id: string;
  name: string;
  groupName: string;
  role: string;
  status: 'ACTIVE' | 'ON_LEAVE';
  skills: string[];
  assignedMilestoneIds?: string[]; 
}

export interface Equipment {
  id: string;
  name: string;
  code: string;
  assignedMilestoneIds?: string[]; 
}

export interface Partner {
  id: string;
  name: string;
  /** 租户内单位序号，销售单号 XS-0001-001 的中间段 */
  partnerListNo?: number;
  /** 接口返回，用于在后端未带 partnerListNo 时按创建顺序兜底推算序号 */
  createdAt?: string;
  categoryId?: string;
  contact: string;
  customData?: Record<string, any>;
  collaborationTenantId?: string;
}

/** 进销存 PSI 单据类型（与 `partnerDocNumber`、后端一致） */
export type PsiRecordType = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL';

/** 进销存 PSI 记录（列表/详情常用字段；其余 JSON 字段按需扩展） */
export interface PsiRecord {
  id: string;
  type: PsiRecordType;
  docNumber?: string;
  docNo?: string;
  partner?: string | null;
  partnerId?: string | null;
  productId: string;
  productName?: string | null;
  productSku?: string | null;
  variantId?: string | null;
  lineGroupId?: string | null;
  quantity?: number | string | null;
  purchasePrice?: number | string | null;
  salesPrice?: number | string | null;
  operator?: string | null;
  warehouseId?: string | null;
  /** 销售订单：配货仓 */
  allocationWarehouseId?: string | null;
  allocatedQuantity?: number | string | null;
  shippedQuantity?: number | string | null;
  timestamp?: string | null;
  createdAt?: string | Date | null;
  _savedAtMs?: number | null;
  customData?: Record<string, unknown> | null;
  note?: string | null;
  /** 采购入库：到期日（YYYY-MM-DD） */
  dueDate?: string | null;
  /** 采购入库行：引用的采购订单单号（编辑保存时需带回） */
  sourceOrderNumber?: string | null;
  /** 采购入库行：引用的采购订单行 id */
  sourceLineId?: string | null;
  /** 采购/销售单行金额等（列表 API 可能带） */
  amount?: number | string | null;
  /** 批次号（API 多为 `batchNo`；部分写入路径仍可能带 `batch`） */
  batchNo?: string | null;
  batch?: string | null;
}

export interface PlanItem {
  variantId?: string;
  quantity: number;
}

export interface NodeAssignment {
  workerIds: string[];
  equipmentIds: string[];
}

export interface PlanOrder {
  id: string;
  planNumber: string;
  /** 父计划 id（子计划单时） */
  parentPlanId?: string;
  /** 来源 BOM 工序节点 id */
  bomNodeId?: string;
  productId: string;
  items: PlanItem[];
  startDate: string;
  /** 交货日期（YYYY-MM-DD 或 ISO 日期），对应库表 `due_date` */
  dueDate?: string;
  status: PlanStatus;
  customer: string;
  priority: 'High' | 'Medium' | 'Low';
  assignments?: Record<string, NodeAssignment>;
  /** 自定义表单字段值，key 为表单配置中的自定义项 id */
  customData?: Record<string, any>;
  /** 单据添加日期（列表/详情可配置显示），格式 YYYY-MM-DD */
  createdAt?: string;
  /** 服务端 @updatedAt，保存/编辑会刷新；列表排序在仅日期 createdAt 相同时可作补充 */
  updatedAt?: string;
  /** 本计划单各工序计价方式（仅本单使用，不同步到商品）；未设时用产品的 nodePricingModes 或计件 */
  nodePricingModes?: Record<string, ProcessPricingMode>;
  /**
   * 计划单派发完成状态（响应派生字段，由后端 `listPlans` / `getPlan` 注入；不写库）。
   * 仅在「关联工单模式 productionLinkMode='order'」的列表上展示徽章。
   * 计算规则：基于该计划下直接关联工单 `productionOrders WHERE planOrderId = plan.id` 的 `dispatchStatus` 聚合。
   */
  derivedStatus?: PlanDispatchStatus;
}

/** 计划单表单字段显示配置（标准字段或自定义字段） */
export interface PlanFormFieldConfig {
  id: string;
  label: string;
  /** 仅自定义字段需要，标准字段忽略 */
  type?: PlanFormCustomFieldType;
  /** 当 type 为 select 时，下拉选项的文案列表（可自定义） */
  options?: string[];
  /** type=date：新建/登记时使用日期时间，可填写具体时间 */
  dateWithTime?: boolean;
  /** type=date：打开时自动填入系统当前日期；与 dateWithTime 同时勾选则填入当前日期+时间 */
  dateAutoFill?: boolean;
  showInList: boolean;
  showInCreate: boolean;
  showInDetail: boolean;
}

/** 计划单「列表上打印」：是否显示入口、可选模板范围 */
export interface PlanListPrintSettings {
  /** 在计划单列表显示「打印」按钮，默认 true */
  showPrintButton?: boolean;
  /** 仅这些模板出现在列表打印选择器中；未设置或空数组表示不限制（全部模板）。表单配置中仅维护已加入项，删空即恢复全部可用。 */
  allowedTemplateIds?: string[];
}

/** 标签打印模版白名单（独立于列表打印） */
export interface PlanLabelPrintSettings {
  /** 仅这些模板出现在标签打印选择器中；未设置或空数组表示不限制。表单配置中仅维护已加入项，删空即恢复全部可用。 */
  allowedTemplateIds?: string[];
  /** 为 false 时计划详情不显示「追溯码」区块（单品码/批次码等）；默认 true */
  showPlanDetailTraceSection?: boolean;
  /** 计划详情「一键生成全部规格」每批件数；合法范围 1–100000，非法值在归一化时剔除 */
  bulkQuickSplitBatchSize?: number;
  /** 在「单品码+批次码」模式下，一键生成是否同步生成关联单品码；默认 true（仅影响一键生成，单条生成仍跟详情页生成类型） */
  bulkQuickSplitWithItemCodes?: boolean;
}

/** 计划单列表显示相关开关（与「字段配置」标准字段分离） */
export interface PlanListDisplaySettings {
  /** 为 true 时：计划新建/详情/列表显示交货日期；打印可选「计划.dueDate」；工单中心与外协流水列表在工单模式下显示交期列 */
  showDeliveryDate?: boolean;
  /**
   * 为 true 时计划单列表仅显示「未下单」「未完成」（隐藏派生状态为「已完成」的行）。
   * 关联工单模式下生效；筛选走后端 `excludeCompleted` 参数（内存分页，与状态关键字搜索同路径）。
   */
  onlyShowNotCompleted?: boolean;
  /**
   * 为 true 时计划单列表每行显示该计划关联采购订单的汇总到货进度（Σ已收/Σ已订购，单一百分比）。
   * 数据由 `psi.plansPurchaseProgress` 批量取回；无关联采购订单的行不展示。
   */
  showPurchaseProgress?: boolean;
  /**
   * 为 true 时计划详情「用料清单」显示「损耗」列，可按物料行填写损耗百分比；
   * 理论总需量按 (1 + 损耗%) 放大，并联动缺料数/计划用量/采购数量。
   * 损耗率按计划单持久化于 `PlanOrder.customData.materialLossRates`（按 rowKey）。
   */
  materialLossEnabled?: boolean;
}

/** 计划单表单配置：列表/新增/详情页显示哪些字段，及自定义项 */
export interface PlanFormSettings {
  standardFields: PlanFormFieldConfig[];
  customFields: PlanFormFieldConfig[];
  /** 列表展示类开关（客户、交货日期等） */
  listDisplay?: PlanListDisplaySettings;
  /** 列表打印入口与模板范围 */
  listPrint?: PlanListPrintSettings;
  /** 标签打印模版白名单 */
  labelPrint?: PlanLabelPrintSettings;
}

/** 进销存采购订单列表展示与筛选 */
export interface PurchaseOrderListDisplaySettings {
  /** 为 true 时列表仅显示尚有未入库完成行的订单（未交清） */
  onlyShowUnsettled?: boolean;
}

/**
 * 采购订单表单配置：标准/自定义字段用于列表与表单展示；列表「打印」模版白名单（详情页无打印入口；无计划单「标签打印」）。
 *
 * 注：历史曾有 `lineCustomFields`（行级自定义字段）设计，后端迁移同日加列又删列，
 * 产品决策已下线该能力。前端对应的 UI、state、读写路径均于 2026-04 清理。
 */
export interface PurchaseOrderFormSettings {
  standardFields: PlanFormFieldConfig[];
  customFields: PlanFormFieldConfig[];
  /** 进销存采购订单列表「打印」入口与白名单 */
  listPrint?: PlanListPrintSettings;
  /** 列表筛选等 */
  listDisplay?: PurchaseOrderListDisplaySettings;
  /**
   * 为 true 时，采购订单在列表、新建/编辑、详情中展示「关联产品」（值存首行 `customData.relatedProductId`）。
   * 与 `standardFields` 中的 `relatedProduct` 互斥：归一化时会迁移旧配置并剔除该伪标准字段。
   * 在「进销存 → 采购订单 → 表单配置」中，该开关位于 **列表显示** 页签（与「只显示未交清」并列），数据仍存本字段。
   */
  relatedProductEnabled?: boolean;
}

/** 进销存销售订单列表展示与筛选 */
export interface SalesOrderListDisplaySettings {
  /** 为 true 时列表仅显示尚有未发齐行的订单（行组订货数量大于已发数量） */
  onlyShowNotFullyShipped?: boolean;
}

/**
 * 销售订单表单配置：与采购订单对齐；列表与登记/详情打印共用 `listPrint` 白名单。
 * （同采购订单，`lineCustomFields` 已下线。）
 */
export interface SalesOrderFormSettings {
  standardFields: PlanFormFieldConfig[];
  customFields: PlanFormFieldConfig[];
  /** 进销存销售订单列表「打印」及登记/详情页「打印」入口与白名单 */
  listPrint?: PlanListPrintSettings;
  /** 列表筛选等 */
  listDisplay?: SalesOrderListDisplaySettings;
}

/**
 * 采购入库表单配置：与采购订单类似；列表与登记/详情打印共用 `listPrint` 白名单。
 */
export interface PurchaseBillFormSettings {
  standardFields: PlanFormFieldConfig[];
  customFields: PlanFormFieldConfig[];
  /** 进销存采购入库列表「打印」及登记/详情页「打印」入口与白名单 */
  listPrint?: PlanListPrintSettings;
  /**
   * 为 true 时，采购入库在列表、新建/编辑、详情中展示「关联成品」：存**每行** `customData.relatedProductId`（与采购品项不同）；列表为各行的去重汇总。
   * 与 `standardFields` 中历史遗留的 `relatedProduct` 伪字段互斥：归一化时会迁移并剔除该伪字段。
   * 在「进销存 → 采购入库 → 表单配置」中，该开关位于 **列表显示** 页签，数据仍存本字段。
   */
  relatedProductEnabled?: boolean;
}

/**
 * 销售单（出库）表单配置：与采购入库同形；表单配置弹窗仅维护自定义项与 `listPrint`，`standardFields` 持久化为空。
 * 列表与登记/详情打印共用 `listPrint` 白名单。
 */
export interface SalesBillFormSettings {
  standardFields: PlanFormFieldConfig[];
  customFields: PlanFormFieldConfig[];
  listPrint?: PlanListPrintSettings;
}

/**
 * 收款单列表「打印」入口与白名单；分类与自定义字段在「设置 → 收付款类型设置」维护。
 */
export interface ReceiptFormSettings {
  listPrint?: PlanListPrintSettings;
}

/**
 * 付款单列表「打印」入口与白名单；分类与自定义字段在「设置 → 收付款类型设置」维护。
 */
export interface PaymentFormSettings {
  listPrint?: PlanListPrintSettings;
}

/** 工单中心三处详情打印：入口与白名单（与 PlanListPrintSettings 语义一致） */
export interface OrderCenterPrintSettings {
  /** 工单详情弹窗 */
  orderDetail?: PlanListPrintSettings;
  /** 报工流水 → 报工批次详情 */
  reportBatchDetail?: PlanListPrintSettings;
  /** 待入库清单 → 入库流水 → 入库详情 */
  stockInFlowDetail?: PlanListPrintSettings;
}

/** 工单表单配置：在计划单表单结构基础上增加工单中心打印 */
export interface OrderFormSettings extends PlanFormSettings {
  orderCenterPrint?: OrderCenterPrintSettings;
  /**
   * 生产入库（待入库、入库登记、入库流水详情）自定义单据字段，语义与计划单 `customFields` 一致（列表/登记/详情显示开关）。
   * 历史配置曾写在 `customFields`，加载时会迁移到本字段。
   */
  stockInCustomFields?: PlanFormFieldConfig[];
}

/** 生产物料面板配置 */
export interface MaterialPanelSettings {
  /** 列表按 加工厂 → 成品/工单 → 物料 展示 */
  groupByOutsourcePartner: boolean;
  /**
   * 关联工单模式：为 true 时主列表隐藏 `dispatchStatus=COMPLETED` 的工单行。
   * 见 `onlyShowNotCompletedOrder` 业务说明（生产物料 / 外协 / 返工三模块共用字段名）。
   */
  onlyShowNotCompletedOrder?: boolean;
}
export const DEFAULT_MATERIAL_PANEL_SETTINGS: MaterialPanelSettings = {
  groupByOutsourcePartner: false,
  onlyShowNotCompletedOrder: false,
};

/** 生产物料：领料/退料流水详情弹窗的打印入口与白名单 */
export interface MaterialCenterPrintSettings {
  /** 领料发出单详情（STOCK_OUT，本厂无加工厂） */
  stockOutFlowDetail?: PlanListPrintSettings;
  /** 生产退料单详情（STOCK_RETURN，本厂无加工厂） */
  stockReturnFlowDetail?: PlanListPrintSettings;
  /** 外协领料发出单详情（STOCK_OUT 且带 partner） */
  outsourceStockOutFlowDetail?: PlanListPrintSettings;
  /** 外协生产退料单详情（STOCK_RETURN 且带 partner） */
  outsourceStockReturnFlowDetail?: PlanListPrintSettings;
}

/** 生产物料表单：本厂/外协各两套自定义单据字段 + 详情打印配置（与工单中心入库自定义/打印语义对齐） */
export interface MaterialFormSettings {
  materialIssueCustomFields?: PlanFormFieldConfig[];
  materialReturnCustomFields?: PlanFormFieldConfig[];
  /** 外协加工厂领料发出（STOCK_OUT + partner）自定义，快照键 `outsourceMaterialIssueCustomData` */
  outsourceMaterialIssueCustomFields?: PlanFormFieldConfig[];
  /** 外协加工厂生产退料（STOCK_RETURN + partner）自定义，快照键 `outsourceMaterialReturnCustomData` */
  outsourceMaterialReturnCustomFields?: PlanFormFieldConfig[];
  materialCenterPrint?: MaterialCenterPrintSettings;
}

export const DEFAULT_MATERIAL_FORM_SETTINGS: MaterialFormSettings = {
  materialIssueCustomFields: [],
  materialReturnCustomFields: [],
  outsourceMaterialIssueCustomFields: [],
  outsourceMaterialReturnCustomFields: [],
};

/** 外协流水详情弹窗：发出单 / 收回单打印入口与白名单 */
export interface OutsourceCenterPrintSettings {
  /** 外协发出（加工中）流水详情 */
  dispatchFlowDetail?: PlanListPrintSettings;
  /** 外协收回流水详情 */
  receiveFlowDetail?: PlanListPrintSettings;
}

/** 外协管理：两套自定义单据字段 + 详情打印（与生产物料表单语义对齐） */
export interface OutsourceFormSettings {
  outsourceDispatchCustomFields?: PlanFormFieldConfig[];
  outsourceReceiveCustomFields?: PlanFormFieldConfig[];
  outsourceCenterPrint?: OutsourceCenterPrintSettings;
  /**
   * 为 true 时，外协列表加工厂旁的文档图标打开「加工厂往来数量明细」弹窗；为 false 或未设置时打开外协流水并带筛选。
   */
  showPartnerFlowDetailOnList?: boolean;
  /** 为 true 时，外协发出新增/详情/编辑显示交货日期，加工厂往来明细表增加交货日期列；入口在表单配置「列表显示」（`collabData.outsourceDispatchDeliveryDate`）。 */
  showOutsourceDispatchDeliveryDate?: boolean;
  /** 为 true 时，外协主列表隐藏加工厂剩余 pending<=0 的小卡；无可见加工厂时隐藏整行。 */
  hideZeroPendingPartnerOnList?: boolean;
  /**
   * 关联工单模式：为 true 时主列表与「待发清单」隐藏 `dispatchStatus=COMPLETED` 的工单行；
   * 「待收回清单」始终不过滤。
   */
  onlyShowNotCompletedOrder?: boolean;
}

export const DEFAULT_OUTSOURCE_FORM_SETTINGS: OutsourceFormSettings = {
  outsourceDispatchCustomFields: [],
  outsourceReceiveCustomFields: [],
  showPartnerFlowDetailOnList: false,
  showOutsourceDispatchDeliveryDate: false,
  hideZeroPendingPartnerOnList: false,
  onlyShowNotCompletedOrder: false,
};

/** 返工管理：处理不良流水详情 / 返工报工流水详情打印入口与白名单 */
export interface ReworkCenterPrintSettings {
  /** 处理不良品流水 → 详情弹窗 */
  defectTreatmentFlowDetail?: PlanListPrintSettings;
  /** 返工报工流水 → 详情弹窗 */
  reworkReportFlowDetail?: PlanListPrintSettings;
}

/** 返工管理：两套自定义单据字段 + 流水详情打印（与工单中心入库自定义语义对齐） */
export interface ReworkFormSettings {
  /** 处理不良（REWORK/SCRAP 同 docNo）自定义；快照键 `collabData.defectTreatmentCustomData` */
  defectTreatmentCustomFields?: PlanFormFieldConfig[];
  /** 返工报工（REWORK_REPORT 同 docNo）自定义；快照键 `collabData.reworkReportCustomData` */
  reworkReportCustomFields?: PlanFormFieldConfig[];
  reworkCenterPrint?: ReworkCenterPrintSettings;
  /**
   * 关联工单模式：为 true 时主列表与「待处理不良」隐藏 `dispatchStatus=COMPLETED` 的工单行。
   */
  onlyShowNotCompletedOrder?: boolean;
}

export const DEFAULT_REWORK_FORM_SETTINGS: ReworkFormSettings = {
  defectTreatmentCustomFields: [],
  reworkReportCustomFields: [],
  onlyShowNotCompletedOrder: false,
};

// ── 打印模板（标签 / 单据可视化设计） ──

export type PrintBodyElementType =
  | 'text'
  | 'qrcode'
  | 'line'
  | 'rect'
  | 'image'
  | 'dynamicTable'
  | 'dynamicList';

/** 打印图片：本地上传存 data URL；地址/字段可含 {{}} 占位符 */
export type PrintImageSourceType = 'upload' | 'url' | 'field';

export interface PrintImageElementConfig {
  sourceType: PrintImageSourceType;
  /** 上传为 data URL；地址为 http(s) 或相对路径；字段为占位模板如 {{产品.imageUrl}} */
  src: string;
  /** 不透明度 0–100，默认 100 */
  opacityPct?: number;
  /** true：等比适配（object-fit: contain）；false：拉伸铺满 */
  keepAspectRatio?: boolean;
  /** 图片固有宽高比 width/height；有则拖拽与改宽高时按比例联动 */
  naturalAspectRatio?: number;
}

export interface PrintTextElementConfig {
  content: string;
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  color: string;
  displayFormat?: 'text' | 'number';
  thousandSeparator?: boolean;
  uppercase?: boolean;
  /** 将文本内容编码为二维码显示（与独立二维码组件二选一场景） */
  renderAsQr?: boolean;
}

export interface PrintQRCodeElementConfig {
  content: string;
}

export interface PrintLineElementConfig {
  thicknessMm: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  color: string;
  /** 与水平方向夹角（逆时针为正），单位度；0 为水平。竖线历史数据会在归一化时转为 width=长度、height=粗细、angleDeg=90 */
  angleDeg?: number;
}

export interface PrintRectElementConfig {
  borderWidthMm: number;
  borderColor: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillColor: string;
  cornerRadiusMm: number;
}

export interface PrintTableElementConfig {
  rows: number;
  cols: number;
  borderStyle: 'solid' | 'dashed' | 'none';
  borderColor: string;
  /** 单元格文案，key 为 `r-c` */
  cells: Record<string, string>;
  /** 单元格水平对齐，key 同 cells；缺省为居中 */
  cellTextAlign?: Record<string, 'left' | 'center' | 'right'>;
  /** 单元格文字颜色，key 同 cells；缺省为 #000000 */
  cellColors?: Record<string, string>;
  /** 单元格字号 pt，key 同 cells；缺省约 6pt */
  cellFontSizePt?: Record<string, number>;
  /** 单元格字重，key 同 cells；缺省为常规 */
  cellFontWeight?: Record<string, 'normal' | 'bold'>;
}

/** 动态列表列字段排序用语义（由模版 `documentType` 推导；不限制时视为 order） */
export type PrintDynamicListDataSource =
  | 'plan'
  | 'order'
  | 'product'
  | 'salesBill'
  | 'productionMaterial'
  | 'outsource'
  | 'rework'
  | 'purchaseOrder'
  | 'purchaseBill'
  | 'salesOrder';

/** 动态列表列类型；矩阵列为 HTML 表格布局（整张动态列表切换渲染） */
export type PrintDynamicListColumnKind = 'text' | 'colorSizeMatrix' | 'colorMaterialMatrix';

export interface PrintDynamicListColumn {
  id: string;
  headerLabel: string;
  /** 单元格占位，如 {{工单.orderNumber}}；矩阵列通常留空，由 colorSizeMatrixJson / colorMaterialMatrixJson 驱动 */
  contentTemplate: string;
  textAlign: 'left' | 'center' | 'right';
  color: string;
  /** 缺省为 `text` */
  cellKind?: PrintDynamicListColumnKind;
  /** 矩阵列：表头「颜色」文案 */
  matrixColorHeader?: string;
  /** 矩阵列：表头组标题（颜色尺码列为「尺码数量」；颜色物料列为「工序物料」） */
  matrixSizeGroupTitle?: string;
  /** 颜色尺码矩阵列：是否在尺码列后追加「小计」列（按颜色行的数量求和）；缺省关闭 */
  matrixShowRowSubtotal?: boolean;
  /** 颜色尺码矩阵列：「小计」列表头文案，缺省「小计」 */
  matrixRowSubtotalHeader?: string;
  /** 数据行字号 pt；未设置则用组件级 fontSizePt */
  fontSizePt?: number;
  /** 数据行字重；未设置则为常规 */
  fontWeight?: 'normal' | 'bold';
  /** 表头该列字号 pt；未设置则用 headerFontSizePt */
  headerFontSizePt?: number;
  /**
   * 表头该列字重；未设置则为半粗(600)
   * `normal` | `bold` 覆盖默认
   */
  headerFontWeight?: 'normal' | 'bold';
}

export interface PrintDynamicListElementConfig {
  /** 数据列数（不含序号列）；与 columns 长度保持一致 */
  dataColumnCount: number;
  showHeader: boolean;
  showSerial: boolean;
  serialHeaderLabel: string;
  borderStyle: 'solid' | 'dashed' | 'none';
  borderColor: string;
  headerBackgroundColor: string;
  headerFontSizePt: number;
  fontSizePt: number;
  columns: PrintDynamicListColumn[];
  /** 序号列宽度 mm；未设置或 0 则按比例自动分配 */
  serialColumnWidthMm?: number;
  /** 各数据列宽度 mm，与列顺序对应；缺项或 0 表示该列参与均分剩余空间 */
  dataColumnWidthsMm?: number[];
  /** 表头行高度 mm；未设置或 0 则按内容自动 */
  headerRowHeightMm?: number;
  /** 数据行高度 mm；未设置或 0 则占满组件内除表头外的剩余高度 */
  bodyRowHeightMm?: number;
}

export type PrintElementConfig =
  | PrintTextElementConfig
  | PrintQRCodeElementConfig
  | PrintLineElementConfig
  | PrintRectElementConfig
  | PrintImageElementConfig
  | PrintTableElementConfig
  | PrintDynamicListElementConfig;

export interface PrintBodyElement {
  id: string;
  type: PrintBodyElementType;
  /** 相对可打印内容区左上角，单位 mm */
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked?: boolean;
  repeatPerPage?: boolean;
  config: PrintElementConfig;
}

export type HeaderFooterSlot = 'left' | 'center' | 'right';

export interface PrintHeaderFooterItem {
  slot: HeaderFooterSlot;
  content: string;
  fontSizePt: number;
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  color: string;
}

export interface PrintHeaderFooterConfig {
  heightMm: number;
  backgroundColor: string;
  borderWidthMm: number;
  borderColor: string;
  items: PrintHeaderFooterItem[];
}

/** 动态列表多行打印时的行数据；列模板用 {{行.字段名}}，入口需传入（如 buildPrintListRowsFromOrderItems） */
export type PrintListRow = Record<string, string | number | undefined | null>;

/** 打印用批次字段（键与占位符路径一致，如 scanUrl、quantity） */
export type VirtualBatchPrintRow = Record<string, string>;

/** 销售单矩阵表一行颜色对应各尺码数量（与 sizes[] 下标对齐） */
export interface SalesBillMatrixColorRow {
  colorName: string;
  quantities: number[];
}

/** 销售单矩阵表：一个货号（一行明细）的 rowspan 块 */
export interface SalesBillMatrixGroup {
  lineNo: number;
  sku: string;
  productName: string;
  /** 尺码列标题，如 XL、xs、均码 */
  sizes: string[];
  colorRows: SalesBillMatrixColorRow[];
  totalQty: number;
  unitPrice: number;
  totalAmount: number;
  remark: string;
  /** 采购入库等 PSI 行携带的批次，透传到 PrintListRow.batchNo */
  batchNo?: string;
  /** 采购入库行级关联成品 id */
  relatedProductId?: string;
}

/** 采购订单打印：占位符 {{采购订单.xxx}} */
export interface PurchaseOrderPrintContext {
  docNumber: string;
  partner: string;
  operator?: string;
  docTotalQty: number;
  docTotalAmount: number;
  custom?: Record<string, unknown>;
}

/** 销售订单打印：占位符 {{销售订单.xxx}}（表头字段与采购订单对应项语义一致，标签在字段选项中区分客户等） */
export type SalesOrderPrintContext = PurchaseOrderPrintContext;

/** 采购入库打印：占位符 {{采购入库.xxx}}（兼容 {{采购单.xxx}}） */
export interface PurchaseBillPrintContext {
  docNumber: string;
  partner: string;
  operator?: string;
  /** 入库仓库名称 */
  warehouseName: string;
  docTotalQty: number;
  docTotalAmount: number;
  /** 各行关联成品去重汇总；占位符 {{采购入库.relatedProduct}} */
  relatedProduct?: string;
  custom?: Record<string, unknown>;
}

/**
 * 收款单/付款单打印表头：占位符 {{收款单.xxx}}、{{付款单.xxx}}；
 * `custom` 与 `FinanceRecord.customData` 一致（key 为分类自定义字段 id）。
 */
export interface FinanceDocPrintContext {
  docNo: string;
  type: '收款单' | '付款单';
  amount: number;
  /** 金额中文大写（人民币） */
  amountText: string;
  partner: string;
  operator: string;
  timestamp: string;
  /** 收付款类型名称 */
  category: string;
  paymentAccount: string;
  workerName: string;
  productName: string;
  productSku: string;
  /** 关联工单号（relatedId 存工单号时） */
  relatedDocNo: string;
  note: string;
  custom?: Record<string, unknown>;
}

/** 销售单（SALES_BILL）表头/页脚占位符 {{销售单.xxx}} */
export interface SalesBillPrintDoc {
  /** 展示用标题，如「某某销售单」 */
  title: string;
  docNumber: string;
  partner: string;
  partnerId?: string;
  warehouseName: string;
  /** 本地日历展示，如 2026年03月14日 */
  createdAtDisplay: string;
  note: string;
  docTotalQty: number;
  docTotalAmount: number;
  /** 开单前合作单位应收余额（与财务对账逻辑一致） */
  previousBalance: number;
  /** 本单应收变动额（与明细金额代数和一致） */
  currentDebt: number;
  /** 开单后应收余额 */
  accumulatedDebt: number;
  /** 表单配置自定义项；占位符 {{销售单.custom.<id>}} */
  custom?: Record<string, unknown>;
}

/** 打印上下文：预览/打印时解析占位符 */
export interface PrintRenderContext {
  /** 当前租户公司名称；占位符 {{租户.name}} */
  tenantName?: string;
  plan?: PlanOrder;
  order?: ProductionOrder;
  product?: Product;
  /** 解析 {{产品.processNodes}} 等工序名称时按 id 查表；计划单打印等场景由调用方注入 */
  globalNodes?: GlobalNodeTemplate[];
  milestoneName?: string;
  completedQuantity?: number;
  page?: { current: number; total: number };
  /** 存在且非空时，动态列表按行渲染并按组件高度自动分页（与 ctx.page.total 取较大者） */
  printListRows?: PrintListRow[];
  /** 标签打印模式：每行数据独占一整页，所有元素均可使用 {{行.xxx}} 占位符 */
  labelPerRow?: boolean;
  /**
   * 批次码标签批量打印：与 labelPerRow 类似，每页使用 virtualBatchRows 中一行作为 {{批次.xxx}}
   */
  labelPerVirtualBatch?: boolean;
  /** 与 labelPerVirtualBatch 配套，每项对应一页标签 */
  virtualBatchRows?: VirtualBatchPrintRow[];
  /**
   * 渲染某一明细行单元格时由引擎注入，业务勿手动赋值
   * @internal
   */
  listRow?: PrintListRow;
  /** 批次码标签：占位符 {{批次.xxx}}，见 printFieldOptions「批次码」分组 */
  virtualBatch?: VirtualBatchPrintRow;
  /** 销售单打印：占位符 {{销售单.xxx}} */
  salesBill?: SalesBillPrintDoc;
  /** 报工批次详情打印：占位符 {{报工.xxx}} */
  reportBatchPrint?: Record<string, string | number | undefined>;
  /** 采购订单打印：占位符 {{采购订单.xxx}} */
  purchaseOrderPrint?: PurchaseOrderPrintContext;
  /** 销售订单打印：占位符 {{销售订单.xxx}} */
  salesOrderPrint?: SalesOrderPrintContext;
  /** 采购入库打印：占位符 {{采购入库.xxx}}（兼容 {{采购单.xxx}}） */
  purchaseBillPrint?: PurchaseBillPrintContext;
  /**
   * 入库单详情打印：占位符 {{入库.docNo}} 等；自定义项为 {{入库.custom.<字段id>}}，见工单表单配置「入库自定义单据内容」。
   * `custom` 为入库流水快照，与 `collabData.stockInCustomData` 一致。
   */
  stockInPrint?: StockInPrintContext;
  /**
   * 领料发出详情打印：占位符 {{领料发出.xxx}}；自定义 {{领料发出.custom.<字段id>}}，快照同 `collabData.materialIssueCustomData`。
   */
  materialIssuePrint?: MaterialFlowPrintContext;
  /**
   * 生产退料详情打印：占位符 {{生产退料.xxx}}；自定义 {{生产退料.custom.<字段id>}}，快照同 `collabData.materialReturnCustomData`。
   */
  materialReturnPrint?: MaterialFlowPrintContext;
  /**
   * 外协发出详情打印：占位符 {{外协发出.xxx}}；自定义 {{外协发出.custom.<字段id>}}，快照同 `collabData.outsourceDispatchCustomData`。
   */
  outsourceDispatchPrint?: MaterialFlowPrintContext;
  /**
   * 外协收回详情打印：占位符 {{外协收回.xxx}}；自定义 {{外协收回.custom.<字段id>}}，快照同 `collabData.outsourceReceiveCustomData`。
   */
  outsourceReceivePrint?: MaterialFlowPrintContext;
  /**
   * 生产物料外协领料发出详情打印：占位符 {{外协领料发出.xxx}}；自定义 {{外协领料发出.custom.<字段id>}}，快照同 `collabData.outsourceMaterialIssueCustomData`（与「外协管理」外协发出不同）。
   */
  outsourceMaterialIssuePrint?: MaterialFlowPrintContext;
  /**
   * 生产物料外协生产退料详情打印：占位符 {{外协生产退料.xxx}}；自定义 {{外协生产退料.custom.<字段id>}}，快照同 `collabData.outsourceMaterialReturnCustomData`。
   */
  outsourceMaterialReturnPrint?: MaterialFlowPrintContext;
  /**
   * 处理不良流水详情打印：占位符 {{处理不良.xxx}}；自定义 {{处理不良.custom.<字段id>}}，快照同 `collabData.defectTreatmentCustomData`。
   */
  defectTreatmentPrint?: ReworkFlowPrintContext;
  /**
   * 返工报工流水详情打印：占位符 {{返工报工.xxx}}；自定义 {{返工报工.custom.<字段id>}}，快照同 `collabData.reworkReportCustomData`。
   */
  reworkReportPrint?: ReworkFlowPrintContext;
  /** 收款单打印：占位符 {{收款单.xxx}} */
  receiptPrint?: FinanceDocPrintContext;
  /** 付款单打印：占位符 {{付款单.xxx}} */
  paymentPrint?: FinanceDocPrintContext;
}

/** 入库打印表头字段 + 可选自定义项快照 */
export interface StockInPrintContext {
  docNo?: string;
  warehouseName?: string;
  operator?: string;
  timestamp?: string;
  /** 外协发出可选：交货日期（YYYY-MM-DD） */
  deliveryDate?: string;
  productName?: string;
  orderNumber?: string;
  totalQty?: string | number;
  custom?: Record<string, unknown>;
  /** 生产物料领退单等扩展展示（入库单可不填） */
  partner?: string;
  reason?: string;
  /** 外协收回等：加工费合计（元） */
  totalAmount?: string | number;
}

/**
 * 返工管理流水打印表头：在入库/领料打印字段基础上扩展返工业务展示键；
 * 占位符 {{处理不良.xxx}}、{{返工报工.xxx}}，`custom` 与对应 collabData 快照一致。
 */
export interface ReworkFlowPrintContext extends StockInPrintContext {
  /** 返工 / 报损 等 */
  typeLabel?: string;
  sourceNodeName?: string;
  /**
   * 外协返工等：批次内带 `partner` 时用于打印摘要；有值时为 `外协工厂：xxx\\n`，否则不设（避免占位符前残留「外协工厂：」）。
   */
  outsourceFactoryBlock?: string;
  /**
   * 返工报工单左上角摘要：批次有 `partner` 时为「外协工厂：xxx\\n」；否则为本厂「操作人：xxx\\n」；无可显内容时不设。
   */
  reworkReportHeaderLeftBlock?: string;
  /** 返工目标工序（多选拼接） */
  targetNodesLabel?: string;
  /** 返工报工涉及工序名称 */
  nodeNames?: string;
  /** 批次内操作人汇总文案 */
  operators?: string;
  workerName?: string;
  equipmentName?: string;
  unitPrice?: string;
  batchTotalAmount?: string;
}

/** 领料/退料流水单打印表头（字段键与入库打印一致，便于复用解析逻辑） */
export type MaterialFlowPrintContext = StockInPrintContext;

/** 纸张可打印区内边距（mm），未设置时按 0 处理以兼容旧模板 */
export interface PrintPaperMarginsMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 打印模板适用单据：用于编辑器内字段分类过滤；缺省或 all 表示不限制 */
export type PrintTemplateDocumentType =
  | 'all'
  | 'plan'
  | 'order'
  | 'salesBill'
  | 'productionMaterial'
  | 'outsource'
  | 'rework'
  | 'purchaseOrder'
  | 'purchaseBill'
  | 'salesOrder'
  | 'salesOrderUnshipped'
  | 'receipt'
  | 'payment';

/** 与「增加/管理模版」弹窗入口一一对应；用于同数据源下多入口互斥展示（如外协发出 vs 外协收回） */
export const PLAN_PRINT_TEMPLATE_MANAGE_SCOPES = [
  'planList',
  'planLabel',
  'orderDetail',
  'reportBatchDetail',
  'stockInFlowDetail',
  'materialIssueFlowDetail',
  'materialReturnFlowDetail',
  'materialOutsourceIssueFlowDetail',
  'materialOutsourceReturnFlowDetail',
  'outsourceDispatchFlowDetail',
  'outsourceReceiveFlowDetail',
  'defectTreatmentFlowDetail',
  'reworkReportFlowDetail',
  'purchaseOrderList',
  'salesOrderList',
  'purchaseBillList',
  'salesBillList',
  'receiptList',
  'paymentList',
] as const;

export type PlanPrintTemplateManageScope = (typeof PLAN_PRINT_TEMPLATE_MANAGE_SCOPES)[number];

export function isPlanPrintTemplateManageScope(s: string): s is PlanPrintTemplateManageScope {
  return (PLAN_PRINT_TEMPLATE_MANAGE_SCOPES as readonly string[]).includes(s);
}

export interface PrintTemplate {
  id: string;
  name: string;
  /** 系统统一下发，仅服务端合并写入；租户不可改、不可入库覆盖 */
  isSystemTemplate?: boolean;
  /** 数据源单据类型；仅影响模版编辑时可选字段分组，不改变运行时解析 */
  documentType?: PrintTemplateDocumentType;
  /**
   * 从哪个「增加/管理模版」入口创建/归属（可选）。
   * 同一 documentType 下多入口（外协发出/收回、返工两类、物料四类）按此互斥过滤；未设置的历史模版仍可在相关入口共用出现。
   */
  printTemplateManageScope?: PlanPrintTemplateManageScope;
  paperSize: { widthMm: number; heightMm: number };
  /**
   * 为 true 时「尺寸及方向」下拉固定显示「自定义尺寸」，即使宽高与某预设（如 A4）相同。
   * 用于区分「选用 A4 预设」与「自定义为 210×297」；未设置时按宽高匹配预设。
   */
  paperSizeCustom?: boolean;
  /** 纸张内边距（mm），作用于整张纸内的内容区 */
  paperMarginsMm?: PrintPaperMarginsMm;
  /** 纸张底色（可打印区外侧仍为白时可与边距配合） */
  paperBackgroundColor?: string;
  header?: PrintHeaderFooterConfig;
  footer?: PrintHeaderFooterConfig;
  elements: PrintBodyElement[];
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneReport {
  id: string;
  timestamp: string;
  operator: string;
  quantity: number;
  /** 不良品数量 */
  defectiveQuantity?: number;
  /** 报工选择的设备 id */
  equipmentId?: string;
  variantId?: string;
  /** 同次报工（如多规格矩阵）的批次 id，用于流水汇总展示 */
  reportBatchId?: string;
  /** 报工单号，例如 BG20260302-0001；同一批次共用同一个编号 */
  reportNo?: string;
  customData: Record<string, any>;
  notes?: string;
  /** 报工时的工序工价（元/件），保存时写入，流水与报工结算优先使用此项 */
  rate?: number;
  /** 报工人员 id，用于报工结算按工人筛选 */
  workerId?: string;
  /**
   * 报工录入的本次交货总重量（kg），仅当所属工序 `enableWeightOnReport` 为 true 时有值。
   * 用于按 BOM 占比派生各子物料实际消耗，替代传统的"件数 × BOM"理论口径。
   */
  weight?: number;
  /**
   * 按 BOM 占比把 `weight` 拆成的各子物料实际消耗快照，写入时由后端基于当时 BOM 计算并固化。
   * 生产物料面板在工序开启称重后会聚合此快照的 `actualWeight`。
   */
  materialBreakdown?: MaterialBreakdownRow[];
}

/** 关联产品模式下，产品 × 规格 × 工序维度的进度独立存储（报工不写入工单） */
export interface ProductMilestoneProgress {
  id: string;
  productId: string;
  variantId?: string;
  milestoneTemplateId: string;
  completedQuantity: number;
  reports?: MilestoneReport[];
  updatedAt?: string;
}

export interface Milestone {
  id: string;
  templateId: string; 
  name: string;
  status: MilestoneStatus;
  plannedDate: string;
  actualDate?: string;
  completedQuantity: number;
  /** 报工页只读展示项结构快照（与 GlobalNodeTemplate.reportDisplayTemplate 一致） */
  reportDisplayTemplate?: ReportFieldDefinition[];
  reportTemplate: ReportFieldDefinition[];
  reports: MilestoneReport[];
  weight: number;
  assignedWorkerIds?: string[]; 
  assignedEquipmentIds?: string[]; 
}

export interface OrderItem {
  variantId?: string;
  quantity: number;
  completedQuantity: number;
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  planOrderId?: string;
  parentOrderId?: string;
  bomNodeId?: string;
  sourcePlanId?: string;
  productId: string;
  productName: string;
  sku: string;
  items: OrderItem[];
  customer: string;
  startDate: string;
  dueDate: string;
  status: OrderStatus;
  milestones: Milestone[];
  priority: 'High' | 'Medium' | 'Low';
  /** 工单创建/下达日期，YYYY-MM-DD，用于工单流水统计 */
  createdAt?: string;
  /** 服务端 @updatedAt，报工等会刷新；用于列表「最近活动」排序 */
  updatedAt?: string;
  /**
   * 工单派发完成状态（持久化）。
   * 入库累计达标后由前端确认再写 COMPLETED；用户在工单中心手动点击可覆盖。
   * 仅在「关联工单模式 productionLinkMode='order'」的列表上展示徽章；产品模式不展示但字段仍写入。
   */
  dispatchStatus?: OrderDispatchStatus;
  /** 是否被用户手动覆盖过 `dispatchStatus`；为 true 时自动入库逻辑跳过该工单。 */
  dispatchStatusManual?: boolean;
}

export interface ProductionOpRecord {
  id: string;
  type: ProdOpType;
  /** 扫码入库/生产操作关联的虚拟批次 id */
  virtualBatchId?: string;
  /** 扫码关联的单品码 id */
  itemCodeId?: string;
  /** 关联工单时必填，关联产品时为空 */
  orderId?: string;
  productId: string;
  variantId?: string;
  quantity: number;
  reason?: string;
  partner?: string;
  operator: string;
  timestamp: string;
  status?: string;
  /** 领料出库 = 出库仓库；退料入库 = 入库仓库 */
  warehouseId?: string;
  /** 领料/退料单据号，规则同报工单号：领料 LLyyyyMMdd-0001，退料 TLyyyyMMdd-0001 */
  docNo?: string;
  /** 外协/返工等：关联工序节点 id（对应 Milestone.templateId / GlobalNodeTemplate.id）；返工时为返工目标工序 */
  nodeId?: string;
  /** 返工专用：不良品来源工序（报工所在工序），用于从待处理不良中扣减 */
  sourceNodeId?: string;
  /** 返工报工：对应哪条 REWORK 单据，用于把完成数量回灌到该单所属工单的来源工序可报量 */
  sourceReworkId?: string;
  /** 返工专用：返工目标工序 id 列表（多选时）；若有则 nodeId 可为第一项 */
  reworkNodeIds?: string[];
  /** 返工专用：本单已完成的目标工序 id 列表，用于多工序返工时按节点推进；当与 reworkNodeIds 一致时整单视为已完成 */
  completedNodeIds?: string[];
  /** 返工专用：按目标工序已完成数量（支持部分完成），nodeId -> 已完工数；未设则按 completedNodeIds 整单计 */
  reworkCompletedQuantityByNode?: Record<string, number>;
  /** 返工报工：报工人员 id（与工单中心报工一致） */
  workerId?: string;
  /** 返工报工：设备 id（工序开启报工设备时必填） */
  equipmentId?: string;
  /** 关联产品模式下领料/退料：成品产品 id（物料行的 productId 为子项物料） */
  sourceProductId?: string;
  /** 外协收回：加工费单价（元/件） */
  unitPrice?: number;
  /** 外协收回：金额（加工费，元），一般为 quantity * unitPrice */
  amount?: number;
  /**
   * 报工/外协收货本次交货重量（单位 kg），仅当对应工序 `enableWeightOnReport` 为 true 时有值。
   * 用于配合 BOM 子项占比自动拆分出各子物料实际消耗。
   */
  weight?: number;
  /**
   * 按 BOM 占比把 `weight` 拆成的各子物料实际消耗快照。
   * 生产物料面板的"报工耗材"列在对应工序开启称重后，会按此快照聚合替代传统的"件数×BOM"口径。
   */
  materialBreakdown?: MaterialBreakdownRow[];
  /**
   * 协作同步元数据、入库/领退/外协等单据级自定义字段快照等（与 `ProductionOpRecord` 服务端 JSON 一致）。
   * 外协：`outsourceDispatchCustomData` / `outsourceReceiveCustomData`。
   * 返工管理：`defectTreatmentCustomData`（处理不良批次）、`reworkReportCustomData`（返工报工批次）。
   */
  collabData?: ProductionOpCollabData;
  /**
   * 扫码追溯扩展（如 `__scanItemCodeIds` 逐件扫入列表），与报工 `MilestoneReport.customData` 同键。
   * 外协收货逐件落库时优先用 `itemCodeId` 列，可不写此字段。
   */
  customData?: Record<string, unknown>;
  /** 领料/退料/外协物料等明细批次号，与进销存 `PsiRecord.batchNo` 对齐 */
  batchNo?: string;
}

/**
 * 报工/外协收货按重量分摊到各子物料的一行消耗快照。
 * 数据来源：`ProductionOpRecord.weight` × 运行时派生的子项占比（`BOMItem.quantity` 除以 Σquantity，排除 `excludeFromWeightShare` 的辅料）。
 */
export interface MaterialBreakdownRow {
  /** 子物料 productId */
  materialProductId: string;
  /** 子物料名称快照，避免后续改名后历史记录失真 */
  materialName: string;
  /** 运行时派生的占比（0~1，所有参与分摊行合计 = 1） */
  ratio: number;
  /** 本子物料实际消耗重量（单位 kg，= weight × ratio） */
  actualWeight: number;
  /** 理论件数消耗（= 报工件数 × BOMItem.quantity），可选，用于报表层计算损耗差 */
  theoreticalQty?: number;
}

export interface OutsourceRouteStep {
  stepOrder: number;
  nodeId: string;
  nodeName: string;
  receiverTenantId: string;
  receiverTenantName: string;
}

export interface OutsourceRoute {
  id: string;
  tenantId: string;
  name: string;
  steps: OutsourceRouteStep[];
  createdAt: string;
  updatedAt: string;
}

export interface FinanceRecord {
  id: string;
  type: FinanceOpType;
  /** 单据编号，规则：前缀(SKD/FKD/DZD/GZD)+yyyyMMdd-0001 */
  docNo?: string;
  amount: number;
  relatedId?: string;
  partner: string;
  operator: string;
  timestamp: string;
  note?: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  /** 收付款类型设置中的分类 id（仅收款单/付款单） */
  categoryId?: string;
  /** 关联工人 id（当分类开启“是否关联工人”时） */
  workerId?: string;
  /** 关联产品 id（当分类开启“是否关联产品”时） */
  productId?: string;
  /** 收支账户（当分类开启「是否选择收支账户」时） */
  paymentAccount?: string;
  /** 分类自定义字段值，key 为 customField.id */
  customData?: Record<string, any>;
}

export type DocType = 'PLAN' | 'ORDER' | 'STOCK_OUT' | 'STOCK_RETURN' | 'OUTSOURCE' | 'REWORK' | 'STOCK_IN';