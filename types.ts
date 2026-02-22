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

export type FieldType = 'text' | 'number' | 'select' | 'boolean' | 'date';

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
}

/** 工序计价方式：计件（元/件）或计时（元/时） */
export type ProcessPricingMode = 'per_piece' | 'per_hour';

export interface GlobalNodeTemplate {
  id: string;
  name: string;
  reportTemplate: ReportFieldDefinition[];
  hasBOM?: boolean;
  category?: string;
  /** 是否在计划单查看页显示该工序的派工选项，默认 true */
  enableAssignment?: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  color: string;
  hasProcess: boolean;
  hasSalesPrice: boolean;
  hasPurchasePrice: boolean;
  hasColorSize: boolean;
  customFields: ReportFieldDefinition[];
}

export interface PartnerCategory {
  id: string;
  name: string;
  description?: string;
  customFields: ReportFieldDefinition[];
}

export interface BOMItem {
  categoryId?: string;
  productId: string;
  quantity: number;
  note?: string;
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
  nodeBOMs?: Record<string, string>;
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
  colorIds: string[];
  sizeIds: string[];
  variants: ProductVariant[];
  categoryCustomData?: Record<string, any>; 
  milestoneNodeIds: string[]; 
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
  group: string;
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
  categoryId?: string;
  contact: string;
  customData?: Record<string, any>; 
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

/** 计划单表单配置：列表/新增/详情页显示哪些字段，及自定义项 */
export interface PlanFormSettings {
  standardFields: PlanFormFieldConfig[];
  customFields: PlanFormFieldConfig[];
}

export interface MilestoneReport {
  id: string;
  timestamp: string;
  operator: string;
  quantity: number;
  variantId?: string;
  customData: Record<string, any>;
  notes?: string;
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
}

export type ProdOpType = 'STOCK_IN' | 'STOCK_OUT' | 'OUTSOURCE' | 'REWORK';

export interface ProductionOpRecord {
  id: string;
  type: ProdOpType;
  orderId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  reason?: string;
  partner?: string; 
  operator: string;
  timestamp: string;
  status?: string; 
}

export type FinanceOpType = 'RECEIPT' | 'PAYMENT' | 'RECONCILIATION' | 'SETTLEMENT';

export interface FinanceRecord {
  id: string;
  type: FinanceOpType;
  amount: number;
  relatedId?: string; 
  partner: string;    
  operator: string;
  timestamp: string;
  note?: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
}

export type DocType = 'PLAN' | 'ORDER' | 'STOCK_OUT' | 'OUTSOURCE' | 'REWORK' | 'STOCK_IN';

export interface PrintTemplateField {
  id: string;
  label: string;
  enabled: boolean;
  /** 在打印平面上的位置与尺寸（mm），不设则按顺序自上而下排布 */
  leftMm?: number;
  topMm?: number;
  widthMm?: number;
  heightMm?: number;
}

/** 纸张规格 */
export type PaperSize = 'A4' | 'A5' | 'B5' | 'custom';
/** 打印方向 */
export type PrintOrientation = 'portrait' | 'landscape';

/** 画布布局元素：单字段或表格，用于计划单打印画布设计器 */
export interface PrintLayoutTableColumn {
  id: string;
  header: string;
  fieldKey: string;
}

export type PlanTableDataSource = 'planItems' | 'planAssignments';

export interface PrintLayoutElement {
  id: string;
  type: 'field' | 'table';
  leftMm: number;
  topMm: number;
  widthMm?: number;
  heightMm?: number;
  /** 当 type === 'field' 时：绑定单值字段 id */
  fieldId?: string;
  /** 当 type === 'table' 时：数据来源 */
  tableDataSource?: PlanTableDataSource;
  /** 当 type === 'table' 时：列配置 */
  columns?: PrintLayoutTableColumn[];
}

export interface PrintTemplate {
  id: DocType;
  name: string;
  enabled: boolean;
  /** 纸张设置（可选，缺省时默认 A4 纵向） */
  paperSize?: PaperSize;
  orientation?: PrintOrientation;
  paperWidthMm?: number;
  paperHeightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  /** 打印内容与布局 */
  title: string;
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showQRCode: boolean;
  fontSize: 'sm' | 'base' | 'lg';
  fields: PrintTemplateField[];
  /** 计划单画布布局元素；若存在且 length > 0 则打印时使用画布布局，否则用 fields */
  layoutElements?: PrintLayoutElement[];
}

export type PrintSettings = Record<DocType, PrintTemplate>;

/** 计划单打印可选内容项（用于模版配置与画布设计器单字段） */
export const PLAN_PRINT_FIELDS: { id: string; label: string }[] = [
  { id: 'planNumber', label: '计划单号' },
  { id: 'customer', label: '客户' },
  { id: 'dueDate', label: '交期' },
  { id: 'product', label: '产品信息' },
  { id: 'status', label: '状态' },
  { id: 'priority', label: '优先级' },
  { id: 'itemsTable', label: '计划明细表' },
  { id: 'assignmentsTable', label: '工序派工表' },
];