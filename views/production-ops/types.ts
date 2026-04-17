import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProdOpType,
  Warehouse,
  BOM,
  AppDictionaries,
  GlobalNodeTemplate,
  Partner,
  ProductCategory,
  PartnerCategory,
  Worker,
  ProcessSequenceMode,
  ProductMilestoneProgress,
  PlanOrder,
  PrintTemplate,
  OutsourceFormSettings,
  MaterialFormSettings,
  ReworkFormSettings,
} from '../../types';

export type OutsourceModalType = 'dispatch' | 'receive' | 'flow';

export interface StockDocDetail {
  docNo: string;
  type: 'STOCK_OUT' | 'STOCK_RETURN';
  orderId: string;
  sourceProductId?: string;
  timestamp: string;
  warehouseId: string;
  lines: { productId: string; quantity: number }[];
  reason?: string;
  operator: string;
  partner?: string;
}

export type ReworkPendingRow = {
  scope: 'order' | 'product';
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  nodeId: string;
  milestoneName: string;
  defectiveTotal: number;
  reworkTotal: number;
  scrapTotal: number;
  pendingQty: number;
  productOrderCount?: number;
  productOrdersLine?: string;
  productOrdersTitle?: string;
};

export interface PanelProps {
  productionLinkMode: 'order' | 'product';
  productMilestoneProgresses: ProductMilestoneProgress[];
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  boms: BOM[];
  dictionaries?: AppDictionaries;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  globalNodes: GlobalNodeTemplate[];
  partners: Partner[];
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  processSequenceMode: ProcessSequenceMode;
  userPermissions?: string[];
  tenantRole?: string;
  /** 外协管理专用（可选，仅外协页使用） */
  plans?: PlanOrder[];
  outsourceFormSettings?: OutsourceFormSettings;
  onUpdateOutsourceFormSettings?: (settings: OutsourceFormSettings) => void | Promise<void>;
  printTemplates?: PrintTemplate[];
  onUpdatePrintTemplates?: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  /** 外协物料发出/退回：自定义项定义来源（生产物料表单配置中的外协两套） */
  materialFormSettings?: MaterialFormSettings;
  /** 返工管理专用（可选） */
  reworkFormSettings?: ReworkFormSettings;
  onUpdateReworkFormSettings?: (settings: ReworkFormSettings) => void | Promise<void>;
}

export function hasOpsPerm(
  tenantRole: string | undefined,
  userPermissions: string[] | undefined,
  permKey: string,
): boolean {
  if (tenantRole === 'owner') return true;
  if (!userPermissions) return true;
  if (userPermissions.includes('production')) return true;
  if (userPermissions.includes(permKey)) return true;
  if (userPermissions.some(p => p.startsWith(`${permKey}:`))) return true;
  return false;
}

export function getOrderFamilyIds(
  orders: ProductionOrder[],
  parentId: string,
  childrenByParentId?: Map<string, ProductionOrder[]>,
): string[] {
  const ids: string[] = [parentId];
  const queue: string[] = [parentId];
  while (queue.length > 0) {
    const pid = queue.shift()!;
    const children = childrenByParentId
      ? (childrenByParentId.get(pid) ?? [])
      : orders.filter(o => o.parentOrderId === pid);
    for (const o of children) { ids.push(o.id); queue.push(o.id); }
  }
  return ids;
}

export function getOrderFamilyWithDepth(
  orders: ProductionOrder[],
  parentId: string,
  ordersById?: Map<string, ProductionOrder>,
  childrenByParentId?: Map<string, ProductionOrder[]>,
): { order: ProductionOrder; depth: number }[] {
  const result: { order: ProductionOrder; depth: number }[] = [];
  const parent = ordersById ? ordersById.get(parentId) : orders.find(o => o.id === parentId);
  if (!parent) return result;
  result.push({ order: parent, depth: 0 });
  const queue: { id: string; depth: number }[] = [{ id: parentId, depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const children = childrenByParentId
      ? (childrenByParentId.get(id) ?? [])
      : orders.filter(o => o.parentOrderId === id);
    for (const o of children) {
      result.push({ order: o, depth: depth + 1 });
      queue.push({ id: o.id, depth: depth + 1 });
    }
  }
  return result;
}
