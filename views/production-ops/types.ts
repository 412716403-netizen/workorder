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
  PsiRecord,
} from '../../types';

export type OutsourceModalType = 'dispatch' | 'receive' | 'flow';

export interface StockDocDetail {
  docNo: string;
  type: 'STOCK_OUT' | 'STOCK_RETURN';
  orderId: string;
  sourceProductId?: string;
  timestamp: string;
  warehouseId: string;
  lines: { productId: string; quantity: number; batchNo?: string }[];
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
  /**
   * Phase 3.E：各 panel 现在按业务条件（活动工单 ids / status）窄拉自己的 records，
   * 不再依赖 ProductionMgmtOpsView 的 12000 上限全量。保留 prop 作为兜底/兼容。
   */
  records?: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  boms: BOM[];
  dictionaries?: AppDictionaries;
  /**
   * Phase 3.E follow-up：从 fire-and-forget 改为返回服务端创建后的记录（含 docNo）。
   * 调用方可拿到真实 docNo，避免在 view 层重复实现 docNo 生成逻辑。
   * 兼容写法：返回 `void` 时调用方自己回退到拉刷新。
   */
  onAddRecord: (record: ProductionOpRecord) => void | Promise<ProductionOpRecord | null | void>;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<ProductionOpRecord[] | void>;
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
  /** 返工领料等弹窗内合并本地进销存批次余量（可选） */
  psiRecords?: PsiRecord[];
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
