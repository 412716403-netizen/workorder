export enum MilestoneStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DELAYED = 'DELAYED'
}

export enum OrderStatus {
  PLANNING = 'PLANNING',
  PRODUCING = 'PRODUCING',
  QC = 'QC',
  SHIPPED = 'SHIPPED',
  ON_HOLD = 'ON_HOLD'
}

export enum PlanStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  CONVERTED = 'CONVERTED'
}

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

export type FieldType = 'text' | 'number' | 'select' | 'boolean' | 'date' | 'file';

/** 工序节点库「报工表单模板」中应使用的字段类型（仅存 text / select / file；历史数据可能含 number/boolean/date） */
export type ProcessReportFieldType = 'text' | 'select' | 'file';

export interface ReportFieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  /** 产品分类专属扩展字段：是否在表单中显示（新增、列表、详情页），默认 true */
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

/** 工序计价方式：计件（元/件）或计时（元/时） */
export type ProcessPricingMode = 'per_piece' | 'per_hour';

/** 生产关联模式：关联工单（order）或关联产品（product） */
export type ProductionLinkMode = 'order' | 'product';

/** 工序顺序模式：不限制顺序（free）或按顺序生产（sequential） */
export type ProcessSequenceMode = 'free' | 'sequential';

export interface GlobalNodeTemplate {
  id: string;
  name: string;
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
}

export interface ProductCategory {
  id: string;
  name: string;
  color: string;
  hasProcess: boolean;
  hasSalesPrice: boolean;
  hasPurchasePrice: boolean;
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

/** 收付款单据分类：收款单/付款单下的类型（如预收款、材料款等），用于控制登记时显示的关联项与自定义字段 */
export type FinanceCategoryKind = 'RECEIPT' | 'PAYMENT';

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
  /** 标准生产路线报工填报项存档：工序节点 id -> 字段 id -> 字符串值 */
  routeReportValues?: Record<string, Record<string, string>>;
  /** 各工序工价（元/件 或 元/时，由 nodePricingModes 决定），key 为工序节点 id */
  nodeRates?: Record<string, number>;
  /** 各工序计价方式，未设置时使用系统默认；key 为工序节点 id */
  nodePricingModes?: Record<string, ProcessPricingMode>;
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
  dueDate: string;
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
}

/** 计划单表单字段显示配置（标准字段或自定义字段） */
export interface PlanFormFieldConfig {
  id: string;
  label: string;
  /** 仅自定义字段需要，标准字段忽略 */
  type?: 'text' | 'number' | 'date' | 'select';
  /** 当 type 为 select 时，下拉选项的文案列表（可自定义） */
  options?: string[];
  showInList: boolean;
  showInCreate: boolean;
  showInDetail: boolean;
}

/** 计划单「列表上打印」：是否显示入口、可选模板范围（空数组表示全部模板） */
export interface PlanListPrintSettings {
  /** 在计划单列表显示「打印」按钮，默认 true */
  showPrintButton?: boolean;
  /** 勾选后仅这些模板出现在选择器中；空数组或未设置表示不限制（全部模板） */
  allowedTemplateIds?: string[];
}

/** 标签打印模版白名单（独立于列表打印） */
export interface PlanLabelPrintSettings {
  allowedTemplateIds?: string[];
}

/** 计划单表单配置：列表/新增/详情页显示哪些字段，及自定义项 */
export interface PlanFormSettings {
  standardFields: PlanFormFieldConfig[];
  customFields: PlanFormFieldConfig[];
  /** 列表打印入口与模板范围 */
  listPrint?: PlanListPrintSettings;
  /** 标签打印模版白名单 */
  labelPrint?: PlanLabelPrintSettings;
}

/** 采购订单表单配置：结构同计划单，用于列表/新增/详情页字段显示控制 */
export type PurchaseOrderFormSettings = PlanFormSettings;

/** 采购单表单配置：结构同计划单 */
export type PurchaseBillFormSettings = PlanFormSettings;

/** 工单表单配置：结构同计划单，用于工单列表/新增/详情页字段显示控制 */
export type OrderFormSettings = PlanFormSettings;

/** 生产物料面板配置 */
export interface MaterialPanelSettings {
  /** 列表按 加工厂 → 成品/工单 → 物料 展示 */
  groupByOutsourcePartner: boolean;
}
export const DEFAULT_MATERIAL_PANEL_SETTINGS: MaterialPanelSettings = {
  groupByOutsourcePartner: false,
};

// ── 打印模板（标签 / 单据可视化设计） ──

export type PrintBodyElementType = 'text' | 'qrcode' | 'line' | 'rect' | 'image' | 'dynamicTable' | 'dynamicList';

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

/** 动态列表绑定的业务数据源（决定推荐字段；占位符仍可按需写任意 {{}}） */
export type PrintDynamicListDataSource = 'plan' | 'order' | 'product';

export interface PrintDynamicListColumn {
  id: string;
  headerLabel: string;
  /** 单元格占位，如 {{工单.orderNumber}} */
  contentTemplate: string;
  textAlign: 'left' | 'center' | 'right';
  color: string;
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
  dataSource: PrintDynamicListDataSource;
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

/** 打印上下文：预览/打印时解析占位符 */
export interface PrintRenderContext {
  plan?: PlanOrder;
  order?: ProductionOrder;
  product?: Product;
  milestoneName?: string;
  completedQuantity?: number;
  page?: { current: number; total: number };
  /** 存在且非空时，动态列表按行渲染并按组件高度自动分页（与 ctx.page.total 取较大者） */
  printListRows?: PrintListRow[];
  /** 标签打印模式：每行数据独占一整页，所有元素均可使用 {{行.xxx}} 占位符 */
  labelPerRow?: boolean;
  /**
   * 渲染某一明细行单元格时由引擎注入，业务勿手动赋值
   * @internal
   */
  listRow?: PrintListRow;
  /** 批次码标签：占位符 {{批次.xxx}}，见 printFieldOptions「批次码」分组 */
  virtualBatch?: VirtualBatchPrintRow;
}

/** 纸张可打印区内边距（mm），未设置时按 0 处理以兼容旧模板 */
export interface PrintPaperMarginsMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PrintTemplate {
  id: string;
  name: string;
  paperSize: { widthMm: number; heightMm: number };
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
}

export type ProdOpType = 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_RETURN' | 'OUTSOURCE' | 'REWORK' | 'REWORK_REPORT' | 'SCRAP';

export interface ProductionOpRecord {
  id: string;
  type: ProdOpType;
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
  /** 协作同步元数据：标识记录来源（syncDispatch / collaborationReturn / chainForward 等） */
  collabData?: { source?: string; transferId?: string; dispatchId?: string; returnId?: string; [key: string]: any };
}

export type FinanceOpType = 'RECEIPT' | 'PAYMENT' | 'RECONCILIATION' | 'SETTLEMENT';

/** 收付款单据编号前缀：收款单 SKD、付款单 FKD、财务对账 DZD、工资单 GZD，规则同报工单 BG+日期+序号 */
export const FINANCE_DOC_NO_PREFIX: Record<FinanceOpType, string> = {
  RECEIPT: 'SKD',
  PAYMENT: 'FKD',
  RECONCILIATION: 'DZD',
  SETTLEMENT: 'GZD',
};

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