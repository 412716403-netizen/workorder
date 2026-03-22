
import React, { useState, useMemo } from 'react';
import { Clock, Layers, Plus, History, User, Sliders, X, Trash2, FileText, Check, ChevronDown, ChevronRight, ScrollText, UserPlus, Filter, Pencil, ClipboardList, Search, Package, ArrowUpFromLine, RotateCcw, ArrowDownToLine, Split } from 'lucide-react';
import { ProductionOrder, MilestoneStatus, Milestone, Product, GlobalNodeTemplate, OrderFormSettings, ProductCategory, AppDictionaries, Partner, BOM, ProductionOpRecord, ProdOpType, Worker, ProductMilestoneProgress, ProcessSequenceMode, Warehouse, ProductVariant } from '../types';
import ProductDetailModal from './ProductDetailModal';
import OrderDetailModal from './OrderDetailModal';
import OrderFlowView from './OrderFlowView';
import WorkerSelector from '../components/WorkerSelector';
import EquipmentSelector from '../components/EquipmentSelector';
import {
  sumBlockOrderQty,
  pmpCompletedAtTemplate,
  productGroupMaxReportableSum,
  variantMaxGoodProductMode
} from '../utils/productReportAggregates';
import { buildDefectiveReworkByOrderMilestone } from '../utils/defectiveReworkByOrderMilestone';
import { sortedVariantColorEntries } from '../utils/sortVariantsByProduct';

function fmtDT(ts: string | Date | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

interface OrderListViewProps {
  productionLinkMode?: 'order' | 'product';
  processSequenceMode?: ProcessSequenceMode;
  allowExceedMaxReportQty?: boolean;
  orders: ProductionOrder[];
  products: Product[];
  workers?: Worker[];
  equipment?: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  orderFormSettings: OrderFormSettings;
  prodRecords?: ProductionOpRecord[];
  warehouses?: Warehouse[];
  onUpdateOrderFormSettings: (settings: OrderFormSettings) => void;
  onReportSubmit?: (orderId: string, milestoneId: string, quantity: number, customData: any, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => void;
  onUpdateOrder?: (orderId: string, updates: Partial<ProductionOrder>) => void;
  onDeleteOrder?: (orderId: string) => void;
}

type ReportUpdateParams = {
  orderId: string;
  milestoneId: string;
  reportId: string;
  quantity: number;
  defectiveQuantity?: number;
  timestamp?: string;
  operator?: string;
  newOrderId?: string;
  newMilestoneId?: string;
};

interface OrderListViewExtendedProps extends OrderListViewProps {
  initialDetailOrderId?: string | null;
  /** 关闭工单详情弹窗时由父组件清除 location.state 中的 detailOrderId，避免切 tab 再回来时弹窗再次打开 */
  onClearDetailOrderIdFromState?: () => void;
  onUpdateReport?: (params: ReportUpdateParams) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => void;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  productMilestoneProgresses?: ProductMilestoneProgress[];
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, quantity: number, customData: any, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const OrderListView: React.FC<OrderListViewExtendedProps> = ({
  productionLinkMode = 'order',
  processSequenceMode = 'free',
  allowExceedMaxReportQty = true,
  initialDetailOrderId,
  onClearDetailOrderIdFromState,
  orders,
  products,
  workers = [],
  equipment = [],
  categories,
  dictionaries,
  partners,
  boms,
  globalNodes,
  orderFormSettings,
  prodRecords = [],
  warehouses = [],
  onUpdateOrderFormSettings,
  onReportSubmit,
  onUpdateOrder,
  onDeleteOrder,
  onUpdateReport,
  onDeleteReport,
  onUpdateProduct,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  productMilestoneProgresses = [],
  onReportSubmitProduct,
  onUpdateReportProduct,
  onDeleteReportProduct,
  userPermissions,
  tenantRole
}) => {
  const _isOwner = tenantRole === 'owner';
  const hasOrderPerm = (permKey: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes('production')) return true;
    if (userPermissions.includes(permKey)) return true;
    if (userPermissions.some(p => p.startsWith(`${permKey}:`))) return true;
    return false;
  };
  const hasProcessReportPerm = (): boolean => {
    if (_isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes('production')) return true;
    if (userPermissions.includes('process_report')) return true;
    if (userPermissions.includes('production:orders_list:allow')) return true;
    return false;
  };
  const [detailOrderId, setDetailOrderId] = useState<string | null>(initialDetailOrderId ?? null);
  const [showOrderFlowModal, setShowOrderFlowModal] = useState(false);
  /** 从产品卡片打开工单流水时传入，用于预填搜索筛选 */
  const [orderFlowProductId, setOrderFlowProductId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [search, setSearch] = useState('');
  type OrderReportRow = {
    order: ProductionOrder;
    milestone: { id: string; name: string; templateId: string };
    report: {
      id: string;
      timestamp: string;
      operator: string;
      quantity: number;
      defectiveQuantity?: number;
      variantId?: string;
      reportBatchId?: string;
      reportNo?: string;
    };
  };
  type ProductReportRow = { progress: ProductMilestoneProgress; report: OrderReportRow['report'] };
  const [reportDetailBatch, setReportDetailBatch] = useState<
    | { source: 'order'; key: string; rows: OrderReportRow[]; first: OrderReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string }
    | { source: 'product'; key: string; progressId: string; productId: string; productName: string; milestoneName: string; milestoneTemplateId: string; rows: ProductReportRow[]; first: ProductReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string }
    | null
  >(null);
  const [editingReport, setEditingReport] = useState<{
    orderId: string;
    milestoneId: string;
    templateId: string;
    productId: string;
    form: {
      timestamp: string;
      operator: string;
      workerId: string;
      /** 工价（元/件），用于整单；保存时写回 product.nodeRates[templateId] */
      rate: number;
      /** 每行：reportId, orderId, milestoneId, quantity, defectiveQuantity */
      rowEdits: {
        reportId: string;
        orderId: string;
        milestoneId: string;
        /** 关联产品模式下使用 */
        progressId?: string;
        quantity: number;
        defectiveQuantity: number;
      }[];
    };
  } | null>(null);
  const [reportHistoryFilter, setReportHistoryFilter] = useState<{
    productId: string;
    orderNumber: string;
    milestoneName: string;
    operator: string;
    dateFrom: string;
    dateTo: string;
    reportNo: string;
  }>({ productId: '', orderNumber: '', milestoneName: '', operator: '', dateFrom: '', dateTo: '', reportNo: '' });
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [showOrderFormConfigModal, setShowOrderFormConfigModal] = useState(false);
  const [orderFormConfigDraft, setOrderFormConfigDraft] = useState<OrderFormSettings | null>(null);
  const [reportModal, setReportModal] = useState<{
    order: ProductionOrder;
    milestone: Milestone;
    /** 关联产品模式：产品级总量与完成量，用于弹窗展示 */
    productTotalQty?: number;
    productCompletedQty?: number;
    /** 关联产品模式：按规格汇总的 { variantId, quantity, completedQuantity }，用于多规格时的下拉选项 */
    productItems?: { variantId?: string; quantity: number; completedQuantity: number }[];
    /** 关联产品模式：所有相关工单，用于提交时确定更新目标 */
    productOrders?: ProductionOrder[];
  } | null>(null);
  const [reportForm, setReportForm] = useState<{
    quantity: number;
    defectiveQuantity: number;
    variantId: string;
    workerId: string;
    equipmentId: string;
    customData: Record<string, any>;
    /** 多规格（颜色尺码）时按 variantId 存储数量 */
    variantQuantities?: Record<string, number>;
    /** 多规格时按 variantId 存储不良品数量 */
    variantDefectiveQuantities?: Record<string, number>;
  }>({
    quantity: 0,
    defectiveQuantity: 0,
    variantId: '',
    workerId: '',
    equipmentId: '',
    customData: {},
    variantQuantities: {},
    variantDefectiveQuantities: {}
  });

  /** 物料发出弹窗：选中的父工单 id */
  const [materialIssueOrderId, setMaterialIssueOrderId] = useState<string | null>(null);
  /** 关联产品模式：按成品聚合多工单的物料发出（与产品卡片行一致） */
  const [materialIssueForProduct, setMaterialIssueForProduct] = useState<{ productId: string; orders: ProductionOrder[] } | null>(null);
  /** 物料发出弹窗：各物料领料数量输入 */
  const [materialIssueQty, setMaterialIssueQty] = useState<Record<string, number>>({});
  /** 物料发出弹窗：选择的出库仓库 */
  const [materialIssueWarehouseId, setMaterialIssueWarehouseId] = useState<string>(warehouses[0]?.id ?? '');

  /** 返工详情弹窗：选中的主工单 id（工单中心列表点击「返工」打开） */
  const [reworkDetailOrderId, setReworkDetailOrderId] = useState<string | null>(null);
  /** 返工详情弹窗（关联产品模式）：选中的产品 id */
  const [reworkDetailProductId, setReworkDetailProductId] = useState<string | null>(null);

  /** 已展开的父工单 id 集合，默认空 = 全部收缩（仅 order 模式） */
  const [expandedParents, setExpandedParents] = useState<Set<string>>(() => new Set());
  const toggleExpand = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  /** 顺序模式：单条返工记录在工序 nodeId 上的「剩余可报数」= 上道已完成流入本道 - 本道已完成 */
  const reworkRemainingAtNode = (r: ProductionOpRecord, nodeId: string): number => {
    const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
    const idx = pathNodes.indexOf(nodeId);
    if (idx < 0) return 0;
    const doneAtNode = r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) ? r.quantity : 0);
    if (processSequenceMode === 'sequential' && idx > 0) {
      const prevNodeId = pathNodes[idx - 1];
      const doneAtPrev = r.reworkCompletedQuantityByNode?.[prevNodeId] ?? 0;
      return Math.max(0, Math.min(doneAtPrev, r.quantity) - doneAtNode);
    }
    return Math.max(0, r.quantity - doneAtNode);
  };

  /** 按单 + 目标工序聚合返工统计（工单中心返工详情弹窗用）；顺序模式下 pendingQty = 按路径上道完成后的可报数 */
  const reworkStatsByOrderId = useMemo(() => {
    if (productionLinkMode !== 'order') return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    const reworkRecords = prodRecords.filter(r => r.type === 'REWORK');
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    orders.forEach(order => {
      const byNode = new Map<string, { totalQty: number; completedQty: number; pendingSeq: number }>();
      reworkRecords.forEach(r => {
        if (r.orderId !== order.id) return;
        const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
        const completed = r.status === '已完成' || (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
        targetNodes.forEach(nodeId => {
          const cur = byNode.get(nodeId) ?? { totalQty: 0, completedQty: 0, pendingSeq: 0 };
          cur.totalQty += r.quantity;
          const doneAtNode = r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
          cur.completedQty += Math.min(r.quantity, doneAtNode);
          cur.pendingSeq += reworkRemainingAtNode(r, nodeId);
          byNode.set(nodeId, cur);
        });
      });
      const list = Array.from(byNode.entries())
        .filter(([, v]) => v.totalQty > 0)
        .map(([nodeId, v]) => ({
          nodeId,
          nodeName: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : (v.totalQty - v.completedQty)
        }))
        .sort((a, b) => {
          const idxA = globalNodes.findIndex(n => n.id === a.nodeId);
          const idxB = globalNodes.findIndex(n => n.id === b.nodeId);
          return (idxA < 0 ? 999 : idxA) - (idxB < 0 ? 999 : idxB);
        });
      if (list.length > 0) result.set(order.id, list);
    });
    return result;
  }, [productionLinkMode, prodRecords, orders, globalNodes, processSequenceMode]);

  const showInList = (id: string) => orderFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;

  /** 列表排序：最新添加的工单排在前面（按 id 内时间戳倒序） */
  const sortedOrdersForList = useMemo(() => {
    const ts = (o: ProductionOrder) => parseInt(o.id.match(/(\d+)/)?.[1] ?? '0', 10) || 0;
    return [...orders].sort((a, b) => ts(b) - ts(a));
  }, [orders]);

  /** 顶部搜索：按产品、工单号、SKU、客户过滤列表 */
  const filteredOrdersForList = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sortedOrdersForList;

    return sortedOrdersForList.filter(order => {
      const product = products.find(p => p.id === order.productId);
      const productName = (order.productName || product?.name || '').toLowerCase();
      const sku = (order.sku || '').toLowerCase();
      const orderNumber = (order.orderNumber || '').toLowerCase();
      const customer = productionLinkMode !== 'product'
        ? (order.customer || '').toLowerCase()
        : '';

      return (
        productName.includes(keyword) ||
        sku.includes(keyword) ||
        orderNumber.includes(keyword) ||
        (customer && customer.includes(keyword))
      );
    });
  }, [sortedOrdersForList, products, search, productionLinkMode]);

  /** 父子工单映射：父工单 id → 子工单列表 */
  const parentToSubOrders = useMemo(() => {
    const map = new Map<string, ProductionOrder[]>();
    orders.filter(o => o.parentOrderId).forEach(o => {
      const pid = o.parentOrderId!;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(o);
    });
    map.forEach(arr => arr.sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '')));
    return map;
  }, [orders]);

  /** 递归获取某工单下所有子孙工单（深度优先，用于列表展示），返回 { order, depth } */
  const getAllDescendantsWithDepth = (orderId: string, depth: number): { order: ProductionOrder; depth: number }[] => {
    const direct = parentToSubOrders.get(orderId) || [];
    const result: { order: ProductionOrder; depth: number }[] = [];
    direct.forEach(o => {
      result.push({ order: o, depth });
      result.push(...getAllDescendantsWithDepth(o.id, depth + 1));
    });
    return result;
  };

  /** 关联工单模式下：工单号根（反复去掉末尾 -数字），如 WO2-1-2 → WO2-1 → WO2，同一计划单拆出的工单归到同一框 */
  const getRootOrderNumber = (orderNumber: string): string => {
    let s = orderNumber || '';
    for (;;) {
      const m = s.match(/^(.+)-([1-9]\d?)$/);
      if (!m) return s;
      s = m[1];
    }
  };

  /** 关联工单模式下：根工单号 → 该原单下所有工单（WO2-1-1、WO2-1-2、WO2-2 等，仅包含至少 2 条的同组；基于当前筛选列表） */
  const rootToOrders = useMemo(() => {
    if (productionLinkMode !== 'order') return new Map<string, ProductionOrder[]>();
    const map = new Map<string, ProductionOrder[]>();
    filteredOrdersForList.forEach(o => {
      const root = getRootOrderNumber(o.orderNumber || '');
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(o);
    });
    const multi = new Map<string, ProductionOrder[]>();
    map.forEach((arr, root) => { if (arr.length >= 2) multi.set(root, arr); });
    return multi;
  }, [filteredOrdersForList, productionLinkMode]);

  /** 列表展示块：单条 或 原单分组（同一计划拆出的多工单） 或 主工单+子工单分组 或 按产品分组（product 模式） */
  type ListBlock =
    | { type: 'single'; order: ProductionOrder }
    | { type: 'orderGroup'; groupKey: string; orders: ProductionOrder[] }
    | { type: 'parentChild'; parent: ProductionOrder; children: ProductionOrder[] }
    | { type: 'productGroup'; productId: string; productName: string; orders: ProductionOrder[] };
  const listBlocks = useMemo((): ListBlock[] => {
    if (productionLinkMode === 'product') {
      const byProduct = new Map<string, ProductionOrder[]>();
      for (const order of filteredOrdersForList) {
        const pid = order.productId || 'unknown';
        if (!byProduct.has(pid)) byProduct.set(pid, []);
        byProduct.get(pid)!.push(order);
      }
      return Array.from(byProduct.entries())
        .map(([productId, orders]) => ({
          type: 'productGroup' as const,
          productId,
          productName: orders[0]?.productName || products.find(p => p.id === productId)?.name || '未知产品',
          orders
        }))
        .sort((a, b) => (b.productName || '').localeCompare(a.productName || ''));
    }
    const blocks: ListBlock[] = [];
    const used = new Set<string>();
    for (const order of filteredOrdersForList) {
      if (used.has(order.id)) continue;
      if (order.parentOrderId) continue;
      const root = getRootOrderNumber(order.orderNumber || '');
      if (rootToOrders.has(root)) {
        const groupOrders = rootToOrders.get(root)!;
        groupOrders.forEach(o => used.add(o.id));
        blocks.push({ type: 'orderGroup', groupKey: root, orders: [...groupOrders].sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '')) });
      } else {
        const children = parentToSubOrders.get(order.id) || [];
        if (children.length > 0) {
          used.add(order.id);
          getAllDescendantsWithDepth(order.id, 1).forEach(({ order: o }) => used.add(o.id));
          blocks.push({ type: 'parentChild', parent: order, children });
        } else {
          used.add(order.id);
          blocks.push({ type: 'single', order });
        }
      }
    }
    return blocks;
  }, [filteredOrdersForList, parentToSubOrders, rootToOrders, productionLinkMode, products]);

  /** 单位名称（用于待入库等展示） */
  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    const u = (dictionaries.units ?? []).find((x: { id: string; name: string }) => x.id === p?.unitId);
    return (u as { name: string } | undefined)?.name ?? 'PCS';
  };

  /** 待入库清单：有完成数量即可显示。可入库数量 = 最后一道工序的完成量 - 已入库量；有颜色尺码时按规格取最后一道工序报工汇总。 */
  type PendingStockItem = {
    order: ProductionOrder;
    orderTotal: number;
    alreadyIn: number;
    pendingTotal: number;
    alreadyInByVariant: Record<string, number>;
    /** 每规格待入库 = 该规格最后一道工序报工合计 - 该规格已入库（与成衣报工一致） */
    pendingByVariant: Record<string, number>;
  };
  const pendingStockOrders = useMemo((): PendingStockItem[] => {
    const list: PendingStockItem[] = [];
    for (const order of orders) {
      if (!order.milestones?.length) continue;
      const orderTotal = order.items.reduce((s, i) => s + i.quantity, 0);
      const lastMilestone = order.milestones[order.milestones.length - 1];
      /** 最后一道工序按规格汇总的完成量（成衣报工按 variantId 汇总） */
      const completedByVariant: Record<string, number> = {};
      (lastMilestone?.reports ?? []).forEach(r => {
        const vid = r.variantId ?? '';
        completedByVariant[vid] = (completedByVariant[vid] ?? 0) + r.quantity;
      });
      const hasVariantBreakdown = Object.keys(completedByVariant).some(k => k !== '');
      /** 总完成量：有按规格报工时用汇总值，否则用工序的 completedQuantity */
      const completedProduced = hasVariantBreakdown
        ? Object.values(completedByVariant).reduce((s, q) => s + q, 0)
        : (lastMilestone?.completedQuantity ?? 0);
      const stockInRecords = (prodRecords || []).filter(r => r.type === 'STOCK_IN' && r.orderId === order.id);
      const alreadyIn = stockInRecords.reduce((s, r) => s + r.quantity, 0);
      const alreadyInByVariant: Record<string, number> = {};
      stockInRecords.forEach(r => {
        const vid = r.variantId ?? '';
        alreadyInByVariant[vid] = (alreadyInByVariant[vid] ?? 0) + r.quantity;
      });
      /** 待入库总量 = 已完成产量 - 已入库 */
      const pendingTotal = Math.max(0, completedProduced - alreadyIn);
      if (pendingTotal <= 0) continue;
      /** 每规格待入库 = 该规格完成量 - 该规格已入库（与成衣报工数量一致） */
      const pendingByVariant: Record<string, number> = {};
      if (hasVariantBreakdown) {
        Object.entries(completedByVariant).forEach(([vid, qty]) => {
          const inV = alreadyInByVariant[vid] ?? 0;
          const p = Math.max(0, qty - inV);
          pendingByVariant[vid] = p;
        });
      }
      list.push({
        order,
        orderTotal,
        alreadyIn,
        pendingTotal,
        alreadyInByVariant,
        pendingByVariant: Object.keys(pendingByVariant).length > 0 ? pendingByVariant : { '': pendingTotal }
      });
    }
    return list.sort((a, b) => (b.order.orderNumber || '').localeCompare(a.order.orderNumber || ''));
  }, [orders, prodRecords]);

  /** 待入库清单弹窗 & 选择入库表单 */
  const [showPendingStockModal, setShowPendingStockModal] = useState(false);
  const [stockInOrder, setStockInOrder] = useState<PendingStockItem | null>(null);
  const [stockInForm, setStockInForm] = useState<{
    warehouseId: string;
    variantQuantities: Record<string, number>;
    singleQuantity: number;
  }>({ warehouseId: '', variantQuantities: {}, singleQuantity: 0 });

  const [showStockInFlowModal, setShowStockInFlowModal] = useState(false);
  const [stockInFlowFilter, setStockInFlowFilter] = useState<{
    dateFrom: string; dateTo: string; docNo: string; orderNumber: string; productName: string; warehouseId: string;
  }>({ dateFrom: '', dateTo: '', docNo: '', orderNumber: '', productName: '', warehouseId: '' });
  const [stockInFlowDetailDocNo, setStockInFlowDetailDocNo] = useState<string | null>(null);
  const [stockInFlowEditing, setStockInFlowEditing] = useState<{
    warehouseId: string;
    operator: string;
    rows: { id: string; variantId?: string; quantity: number }[];
  } | null>(null);

  const getNextStockInDocNo = () => {
    const prefix = 'RK';
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}${todayStr}-`;
    const existing = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo && (r.docNo as string).startsWith(pattern));
    const seqs = existing.map(r => parseInt(((r.docNo as string) ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, prodRecords),
    [orders, prodRecords]
  );

  const getDefectiveRework = (orderId: string, templateId: string) => defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

  /** 顺序模式下：判断某工单某工序是否允许报工（前一道有报工或本身为第一道） */
  const canReportMilestone = (order: ProductionOrder, ms: Milestone): boolean => {
    if (processSequenceMode !== 'sequential') return true;
    const idx = order.milestones.findIndex(m => m.id === ms.id);
    if (idx <= 0) return true;
    const prev = order.milestones[idx - 1];
    if (!prev) return true;
    const hasReports = (prev.reports && prev.reports.length > 0) || prev.completedQuantity > 0;
    return hasReports;
  };

  const handleOpenReport = (
    order: ProductionOrder,
    ms: Milestone,
    productAggregate?: { totalQty: number; completedQty: number; orders: ProductionOrder[]; items?: { variantId?: string; quantity: number; completedQuantity: number }[] }
  ) => {
    if (processSequenceMode === 'sequential') {
      const idx = order.milestones.findIndex(m => m.id === ms.id);
      if (idx > 0) {
        const blockOrders = productAggregate?.orders ?? [order];
        const prevTid = order.milestones[idx - 1].templateId;
        const prevDone =
          productionLinkMode === 'product' && productMilestoneProgresses.length > 0
            ? pmpCompletedAtTemplate(productMilestoneProgresses, order.productId, prevTid)
            : order.milestones[idx - 1].completedQuantity ?? 0;
        const blockQty = sumBlockOrderQty(blockOrders);
        const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
        const prevAlloc =
          productionLinkMode === 'product' && productMilestoneProgresses.length > 0 && blockQty > 0
            ? (orderQty * prevDone) / blockQty
            : prevDone;
        const prevReady =
          (order.milestones[idx - 1].completedQuantity ?? 0) > 0 || prevAlloc > 0;
        if (!canReportMilestone(order, ms) && !prevReady) return;
      } else if (!canReportMilestone(order, ms)) return;
    }
    if (!onReportSubmit && !(productionLinkMode === 'product' && onReportSubmitProduct)) return;
    const initialData: Record<string, any> = {};
    ms.reportTemplate.forEach(f => {
      initialData[f.id] = f.type === 'boolean' ? false : '';
    });
    const product = products.find(p => p.id === order.productId);
    const category = categories.find(c => c.id === product?.categoryId);
    const hasColorSize = Boolean(product?.colorIds?.length && product?.sizeIds?.length) || Boolean(category?.hasColorSize);
    const items = productAggregate?.items ?? order.items;
    const singleVariant = items.length === 1 ? (items[0].variantId || '') : '';

    // 打开报工弹窗时不预填数量，只重置表单；提示数量通过占位符展示
    const variantQuantities: Record<string, number> = {};
    const variantDefective: Record<string, number> = {};
    if (hasColorSize && product?.variants?.length) {
      product.variants.forEach(v => {
        variantQuantities[v.id] = 0;
        variantDefective[v.id] = 0;
      });
    }

    setReportForm({
      quantity: 0,
      defectiveQuantity: 0,
      variantId: singleVariant,
      workerId: '',
      equipmentId: '',
      customData: initialData,
      variantQuantities: hasColorSize && product?.variants?.length ? variantQuantities : undefined,
      variantDefectiveQuantities: hasColorSize && product?.variants?.length ? variantDefective : undefined
    });
    setReportModal({
      order,
      milestone: ms,
      productTotalQty: productAggregate?.totalQty,
      productCompletedQty: productAggregate?.completedQty,
      productItems: productAggregate?.items,
      productOrders: productAggregate?.orders
    });
  };

  const handleReportFieldChange = (fieldId: string, value: any) => {
    setReportForm(prev => ({ ...prev, customData: { ...prev.customData, [fieldId]: value } }));
  };

  const handleVariantQuantityChange = (variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantQuantities: { ...(prev.variantQuantities ?? {}), [variantId]: Math.max(0, qty) }
    }));
  };

  const handleVariantDefectiveChange = (variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantDefectiveQuantities: { ...(prev.variantDefectiveQuantities ?? {}), [variantId]: Math.max(0, qty) }
    }));
  };

  /**
   * 顺序模式下，计算某个规格在当前报工工序上的"剩余可报数"。
   * 关联产品模式使用 productMilestoneProgresses + milestoneNodeIds 作为数据源和排序依据；
   * 工单模式回退到 order.milestones.reports。
   */
  const getSeqRemainingForVariant = (variantId: string): number => {
    if (!reportModal) return 0;
    const productId = reportModal.order.productId;
    const milestoneTemplateId = reportModal.milestone.templateId;
    const allOrders = reportModal.productOrders?.length ? reportModal.productOrders : [reportModal.order];
    const items = reportModal.productItems ?? reportModal.order.items;
    const item = items.find(i => (i.variantId || '') === variantId) ?? (items.length === 1 ? items[0] : undefined);

    let tplIndex: number;
    let prevTemplateId: string | undefined;
    if (productionLinkMode === 'product') {
      const product = products.find(p => p.id === productId);
      const nodeIds = product?.milestoneNodeIds || [];
      tplIndex = nodeIds.indexOf(milestoneTemplateId);
      if (tplIndex > 0) prevTemplateId = nodeIds[tplIndex - 1];
    } else {
      const ref = allOrders.find(o => o.milestones.some(m => m.templateId === milestoneTemplateId)) ?? reportModal.order;
      tplIndex = ref.milestones.findIndex(m => m.templateId === milestoneTemplateId);
      if (tplIndex > 0) prevTemplateId = ref.milestones[tplIndex - 1].templateId;
    }

    if (tplIndex <= 0) {
      if (!item) return 0;
      if (reportModal.productItems) {
        return item.quantity - (item.completedQuantity ?? 0);
      }
      if (items.length === 1 && !item.variantId) {
        return item.quantity - (reportModal.milestone.completedQuantity || 0);
      }
      const completedInMilestone = (reportModal.milestone.reports || [])
        .filter(r => (r.variantId || '') === variantId)
        .reduce((s, r) => s + r.quantity, 0);
      return item.quantity - completedInMilestone;
    }

    if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0 && prevTemplateId) {
      const curCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === milestoneTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      const prevCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === prevTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      return Math.max(0, prevCompleted - curCompleted);
    }

    let prevQty = 0;
    let curQty = 0;
    allOrders.forEach(o => {
      if (prevTemplateId) {
        const prevMs = o.milestones.find(m => m.templateId === prevTemplateId);
        if (prevMs) {
          (prevMs.reports || []).forEach(r => {
            if ((r.variantId || '') === variantId) prevQty += r.quantity;
          });
        }
      }
      const curMs = o.milestones.find(m => m.templateId === milestoneTemplateId);
      if (curMs) {
        (curMs.reports || []).forEach(r => {
          if ((r.variantId || '') === variantId) curQty += r.quantity;
        });
      }
    });
    return prevQty - curQty;
  };

  const getNextReportNo = () => {
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const keys = new Set<string>();

    // 按批次统计当日已存在的报工单（工单模式）
    orders.forEach(o => {
      o.milestones?.forEach(m => {
        (m.reports || []).forEach(r => {
          const dt = new Date(r.timestamp);
          if (isNaN(dt.getTime())) return;
          const ds = dt.toISOString().split('T')[0].replace(/-/g, '');
          if (ds !== todayStr) return;
          const key = r.reportBatchId || r.reportNo || r.id;
          keys.add(key);
        });
      });
    });

    // 按批次统计当日已存在的报工单（关联产品模式）
    productMilestoneProgresses.forEach(p => {
      (p.reports || []).forEach(r => {
        const dt = new Date(r.timestamp);
        if (isNaN(dt.getTime())) return;
        const ds = dt.toISOString().split('T')[0].replace(/-/g, '');
        if (ds !== todayStr) return;
        const key = r.reportBatchId || r.reportNo || r.id;
        keys.add(key);
      });
    });

    const seq = keys.size + 1;
    const seqStr = String(seq).padStart(4, '0');
    return `BG${todayStr}-${seqStr}`;
  };

  const submitReport = async () => {
    if (!reportModal) return;
    const productId = reportModal.order.productId;
    const milestoneTemplateId = reportModal.milestone.templateId;
    const product = products.find(p => p.id === productId);
    const category = categories.find(c => c.id === product?.categoryId);
    const hasColorSize = Boolean(product?.colorIds?.length && product?.sizeIds?.length) || Boolean(category?.hasColorSize);

    if (productionLinkMode === 'product' && onReportSubmitProduct) {
      if (hasColorSize && reportForm.variantQuantities) {
        const entries = Object.entries(reportForm.variantQuantities).filter(([vId, q]) => {
          const def = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          return q > 0 || def > 0;
        });
        if (entries.length === 0) return;
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const reportNo = getNextReportNo();
        for (const [vId, qty] of entries) {
          const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          await onReportSubmitProduct!(
            productId,
            milestoneTemplateId,
            qty,
            reportForm.customData,
            vId,
            reportForm.workerId || undefined,
            defQty,
            reportForm.equipmentId || undefined,
            batchId,
            reportNo
          );
        }
      } else {
        const reportNo = getNextReportNo();
        await onReportSubmitProduct(
          productId,
          milestoneTemplateId,
          reportForm.quantity,
          reportForm.customData,
          reportForm.variantId || undefined,
          reportForm.workerId || undefined,
          reportForm.defectiveQuantity || 0,
          reportForm.equipmentId || undefined,
          undefined,
          reportNo
        );
      }
      setReportModal(null);
      return;
    }

    if (!onReportSubmit) return;
    if (hasColorSize && reportForm.variantQuantities) {
      const entries = Object.entries(reportForm.variantQuantities).filter(([vId, q]) => {
        const def = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
        return q > 0 || def > 0;
      });
      if (entries.length === 0) return;
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const reportNo = getNextReportNo();
      for (const [vId, qty] of entries) {
        let targetOrder = reportModal!.order;
        if (reportModal!.productOrders?.length) {
          const withVariant = reportModal!.productOrders.find(o => o.items.some(i => i.variantId === vId));
          targetOrder = withVariant ?? reportModal!.productOrders![0];
        }
        const ms = targetOrder.milestones.find(m => m.templateId === reportModal!.milestone.templateId) ?? reportModal!.milestone;
        const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
        await onReportSubmit!(
          targetOrder.id,
          ms.id,
          qty,
          reportForm.customData,
          vId,
          reportForm.workerId || undefined,
          defQty,
          reportForm.equipmentId || undefined,
          batchId,
          reportNo
        );
      }
    } else {
      let targetOrder = reportModal.order;
      if (reportModal.productOrders && reportModal.productOrders.length > 0) {
        const vId = reportForm.variantId || undefined;
        const withVariant = reportModal.productOrders.find(o =>
          vId ? o.items.some(i => i.variantId === vId) : true
        );
        targetOrder = withVariant ?? reportModal.productOrders[0];
      }
      const ms = targetOrder.milestones.find(m => m.templateId === reportModal.milestone.templateId) ?? reportModal.milestone;
      const reportNo = getNextReportNo();
      await onReportSubmit(
        targetOrder.id,
        ms.id,
        reportForm.quantity,
        reportForm.customData,
        reportForm.variantId || undefined,
        reportForm.workerId || undefined,
        reportForm.defectiveQuantity || 0,
        reportForm.equipmentId || undefined,
        undefined,
        reportNo
      );
    }
    setReportModal(null);
  };

  const isMatrixMode = Boolean(reportModal && (() => {
    const product = products.find(p => p.id === reportModal.order.productId);
    const category = categories.find(c => c.id === product?.categoryId);
    return (product?.colorIds?.length && product?.sizeIds?.length) || category?.hasColorSize;
  })());
  const matrixTotalQty = reportForm.variantQuantities
    ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0)
    : 0;
  const matrixTotalDef = reportForm.variantDefectiveQuantities
    ? Object.values(reportForm.variantDefectiveQuantities).reduce((s, q) => s + q, 0)
    : 0;
  const canSubmitMatrix = isMatrixMode
    ? (matrixTotalQty + matrixTotalDef) > 0
    : (reportForm.quantity + reportForm.defectiveQuantity) > 0;
  const needEquipment = reportModal && globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableEquipmentOnReport;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">生产工单中心</h1>
          <p className="text-slate-500 mt-1 italic text-sm">追踪各工序节点进度与完工比例</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 搜索框放在表单配置左侧 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索产品、工单号、客户..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 w-56 bg-white"
            />
          </div>
          {hasOrderPerm('production:orders_form_config:allow') && (
          <button
            onClick={() => { setOrderFormConfigDraft(JSON.parse(JSON.stringify(orderFormSettings))); setShowOrderFormConfigModal(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-bold transition-all border border-slate-200"
          >
            <Sliders className="w-4 h-4" /> 表单配置
          </button>
          )}
          {productionLinkMode === 'product' && (
            <button
              onClick={() => { setOrderFlowProductId(null); setShowOrderFlowModal(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all"
            >
              <ScrollText className="w-4 h-4" />
              工单流水
            </button>
          )}
          {hasOrderPerm('production:orders_report_records:view') && (
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all"
          >
            <History className="w-4 h-4" />
            报工流水
          </button>
          )}
          {hasOrderPerm('production:orders_pending_stock_in') && (
          <button
            onClick={() => { setShowPendingStockModal(true); setStockInOrder(null); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all"
          >
            <ArrowDownToLine className="w-4 h-4" />
            待入库清单
            {pendingStockOrders.length > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                {pendingStockOrders.length}
              </span>
            )}
          </button>
          )}
        </div>
      </div>

      {!hasOrderPerm('production:orders_list:allow') ? (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看工单列表</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4">
          {orders.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
              <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">暂无工单数据</p>
            </div>
          ) : (
            listBlocks.map((block) => {
              const renderOrderCard = (order: ProductionOrder, isChild?: boolean, indentPx?: number) => {
                const product = products.find(p => p.id === order.productId);
                const totalMilestones = order.milestones.length;
                const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const overallProgress = totalMilestones > 0
                  ? Math.round(
                      (order.milestones.reduce((acc, m) => acc + (m.completedQuantity / orderTotalQty), 0) / totalMilestones) * 100
                    )
                  : 0;
                const cardClass = isChild
                  ? 'bg-white p-5 rounded-2xl border border-l-4 border-l-slate-300 border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 lg:gap-10 items-center'
                  : 'bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 lg:gap-10 items-center';
                return (
                  <div key={order.id} className={cardClass} style={indentPx != null && indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                    <div className="flex items-center gap-6 min-w-0">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => hasOrderPerm('production:orders_detail:view') && setDetailOrderId(order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none block`}>
                          <img src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => hasOrderPerm('production:orders_detail:view') && setDetailOrderId(order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors`}>
                          <Layers className={isChild ? 'w-6 h-6' : 'w-7 h-7'} />
                        </button>
                      )}
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{order.orderNumber}</span>
                          {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子工单</span>}
                          <button type="button" onClick={(e) => { e.stopPropagation(); product && setViewProductId(product.id); }} className={`text-left font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors ${isChild ? 'text-base' : 'text-lg'}`}>
                            {order.productName || '未知产品'}
                          </button>
                          <span className="text-[10px] font-bold text-slate-500">{order.sku}</span>
                          {product && categories.find(c => c.id === product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                            const val = product.categoryCustomData?.[f.id];
                            if (val == null || val === '') return null;
                            return <span key={f.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                          })}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          {showInList('customer') && productionLinkMode !== 'product' && order.customer && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.customer}</span>}
                          <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>
                          {showInList('dueDate') && order.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 交期: {order.dueDate}</span>}
                          {showInList('startDate') && order.startDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 开始: {order.startDate}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {order.milestones.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x">
                          <div className="flex items-stretch gap-2 flex-nowrap py-1 w-max">
                            {order.milestones.map((ms) => {
                              const isCompleted = ms.status === MilestoneStatus.COMPLETED;
                              const canReport = !!onReportSubmit && canReportMilestone(order, ms);
                              let baseQty = orderTotalQty;
                              const currentCompleted = ms.completedQuantity;
                              if (processSequenceMode === 'sequential') {
                                const idx = order.milestones.findIndex(m => m.id === ms.id);
                                if (idx > 0) {
                                  const prev = order.milestones[idx - 1];
                                  baseQty = prev?.completedQuantity ?? 0;
                                }
                              }
                              const { defective, rework } = getDefectiveRework(order.id, ms.templateId);
                              const availableQty = Math.max(0, baseQty - defective + rework);
                              const remaining = availableQty - currentCompleted;
                              const tooltip = `工序「${ms.name}」：已完成 ${currentCompleted} 件，可报最多 ${availableQty} 件（已扣不良、加返工完成），剩余 ${remaining} 件`;
                              const content = (
                                <>
                                  <span className="text-[10px] font-bold text-emerald-600 mb-2 truncate w-full text-center">{ms.name}</span>
                                  <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-2 ${isCompleted ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                    <span className="text-base font-black text-slate-900">{currentCompleted}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                    <span>{availableQty} / <span className={remaining < 0 ? 'text-rose-500' : ''}>{remaining}</span></span>
                                  </div>
                                </>
                              );
                              return (onReportSubmit && hasProcessReportPerm()) ? (
                                <button
                                  key={ms.id}
                                  type="button"
                                  disabled={!canReport}
                                  onClick={e => { e.stopPropagation(); canReport && handleOpenReport(order, ms); }}
                                  className={`flex flex-col items-center shrink-0 min-w-[88px] py-2 px-2 rounded-xl border transition-colors text-left ${
                                    canReport
                                      ? 'bg-slate-50 border-slate-100 hover:bg-slate-100 hover:border-slate-200 cursor-pointer'
                                      : 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                                  }`}
                                  title={canReport ? `${tooltip}（点击报工）` : `${tooltip}（需先完成前一道工序后才能报本工序）`}
                                >
                                  {content}
                                </button>
                              ) : (
                                <button
                                  key={ms.id}
                                  type="button"
                                  onClick={e => { e.stopPropagation(); hasOrderPerm('production:orders_detail:view') && setDetailOrderId(order.id); }}
                                  className="flex flex-col items-center shrink-0 min-w-[88px] py-2 px-2 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 hover:border-slate-200 transition-colors cursor-pointer"
                                  title={tooltip}
                                >
                                  {content}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="w-40 text-right">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-slate-400">进度</span>
                            <span className="text-xs font-black text-indigo-600">{overallProgress}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-500 rounded-full" style={{ width: `${overallProgress}%` }} />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-2 shrink-0">
                        {hasOrderPerm('production:orders_detail:view') && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setDetailOrderId(order.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        )}
                        {onAddRecord && hasOrderPerm('production:orders_material:allow') && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setMaterialIssueForProduct(null); setMaterialIssueOrderId(order.id); setMaterialIssueQty({}); setMaterialIssueWarehouseId(warehouses[0]?.id ?? ''); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                          >
                            <Package className="w-3.5 h-3.5" /> 物料
                          </button>
                        )}
                        {hasOrderPerm('production:orders_rework:allow') && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setReworkDetailOrderId(order.parentOrderId ?? order.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-amber-100 text-amber-600 bg-white hover:bg-amber-50 transition-all w-full justify-center"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> 返工
                        </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };

              if (block.type === 'single') {
                return <div key={block.order.id}>{renderOrderCard(block.order)}</div>;
              }
              if (block.type === 'orderGroup') {
                const { groupKey, orders: groupOrders } = block;
                return (
                  <div key={`orderGroup-${groupKey}`} className="rounded-[32px] border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2">
                      <Split className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-bold text-slate-800">原单 {groupKey}（共 {groupOrders.length} 条工单）</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {groupOrders.map(order => (
                        <div key={order.id}>{renderOrderCard(order)}</div>
                      ))}
                    </div>
                  </div>
                );
              }
              if (block.type === 'productGroup') {
                const product = products.find(p => p.id === block.productId);
                const totalQty = block.orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
                const orderCount = block.orders.length;
                const byTemplate = new Map<string, { name: string; completed: number }>();
                if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
                  productMilestoneProgresses.filter(p => p.productId === block.productId).forEach(pmp => {
                    const name = globalNodes.find(n => n.id === pmp.milestoneTemplateId)?.name ?? '';
                    const cur = byTemplate.get(pmp.milestoneTemplateId);
                    byTemplate.set(pmp.milestoneTemplateId, {
                      name: cur?.name || name,
                      completed: (cur?.completed ?? 0) + (pmp.completedQuantity ?? 0)
                    });
                  });
                  block.orders.forEach(o => o.milestones.forEach(m => {
                    if (!byTemplate.has(m.templateId)) byTemplate.set(m.templateId, { name: m.name, completed: 0 });
                  }));
                }
                if (byTemplate.size === 0) {
                  block.orders.forEach(o => {
                    o.milestones.forEach(m => {
                      const cur = byTemplate.get(m.templateId);
                      byTemplate.set(m.templateId, {
                        name: m.name,
                        completed: (cur?.completed ?? 0) + m.completedQuantity
                      });
                    });
                  });
                }
                const totalMilestones = byTemplate.size;
                const overallProgress = totalQty > 0 && totalMilestones > 0
                  ? Math.round((Array.from(byTemplate.values()).reduce((acc, m) => acc + m.completed / totalQty, 0) / totalMilestones) * 100)
                  : 0;
                return (
                  <div key={`productGroup-${block.productId}`}>
                    <div className="pt-0">
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:border-indigo-200 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-center">
                          <div className="flex items-center gap-6 min-w-0">
                            {product?.imageUrl ? (
                              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                                <img src={product.imageUrl} alt={block.productName} className="w-full h-full object-cover block" />
                              </div>
                            ) : (
                              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600">
                                <Layers className="w-7 h-7" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-3 mb-1 flex-wrap">
                                <button type="button" onClick={e => { e.stopPropagation(); product && setViewProductId(product.id); }} className="text-left text-lg font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                                  {block.productName}
                                </button>
                                <span className="text-[10px] font-bold text-slate-500">{product?.sku || block.orders[0]?.sku}</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 合计 {totalQty} 件</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            {Array.from(byTemplate.entries()).length > 0 ? (
                              <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden">
                                <div className="flex items-stretch gap-2 flex-nowrap py-1">
                                  {(() => {
                                    const templateEntries = Array.from(byTemplate.entries()).sort(([aId], [bId]) => {
                                      const order = product?.milestoneNodeIds || [];
                                      const ia = order.indexOf(aId);
                                      const ib = order.indexOf(bId);
                                      if (ia === -1 && ib === -1) return aId.localeCompare(bId);
                                      if (ia === -1) return 1;
                                      if (ib === -1) return -1;
                                      return ia - ib;
                                    });
                                    return templateEntries.map(([tid, m], mIdx) => {
                                    /** 关联产品报工写在 pmp，不良不在工单里程碑；顺序+产品时不能用「合计−里程碑不良」否则会漏扣 pmp 不良（如横机显示成下单总数 450） */
                                    const availableQty =
                                      productionLinkMode === 'product' && productMilestoneProgresses.length > 0
                                        ? productGroupMaxReportableSum(
                                            block.orders,
                                            tid,
                                            block.productId,
                                            productMilestoneProgresses,
                                            processSequenceMode,
                                            (oid, t) => getDefectiveRework(oid, t)
                                          )
                                        : (() => {
                                            let baseQty = totalQty;
                                            if (processSequenceMode === 'sequential' && mIdx > 0) {
                                              baseQty = templateEntries[mIdx - 1][1].completed;
                                            }
                                            const defectiveSum = block.orders.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0);
                                            const reworkSum = block.orders.reduce((s, o) => s + getDefectiveRework(o.id, tid).rework, 0);
                                            return Math.max(0, baseQty - defectiveSum + reworkSum);
                                          })();
                                    const availDisplay = Math.max(0, Math.round(Number(availableQty) || 0));
                                    const remainingRaw = Math.round((Number(availableQty) || 0) - m.completed);
                                    const remainingDisplay = allowExceedMaxReportQty ? remainingRaw : Math.max(0, remainingRaw);
                                    const remaining = availableQty - m.completed;
                                    const isDone = remaining <= 0 && m.completed > 0;
                                    const allowReport = (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && (
                                      processSequenceMode !== 'sequential' ||
                                      mIdx === 0 ||
                                      templateEntries[mIdx - 1][1].completed > 0
                                    );
                                    const handleProductGroupMsClick = () => {
                                      if (!allowReport) return;
                                      if (!onReportSubmit && !(productionLinkMode === 'product' && onReportSubmitProduct)) return;
                                      const ordersWithMs = block.orders
                                        .map(o => ({ order: o, ms: o.milestones.find(x => x.templateId === tid) }))
                                        .filter((x): x is { order: ProductionOrder; ms: Milestone } => !!x.ms);
                                      if (ordersWithMs.length === 0) return;
                                      const first = ordersWithMs[0];
                                      const totalQty = block.orders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
                                      const completedQty = m.completed;
                                      let variantMap = new Map<string, { quantity: number; completedQuantity: number }>();
                                      if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
                                        productMilestoneProgresses.filter(p => p.productId === block.productId && p.milestoneTemplateId === tid).forEach(pmp => {
                                          const vid = pmp.variantId ?? '';
                                          const cur = variantMap.get(vid) ?? { quantity: 0, completedQuantity: 0 };
                                          cur.completedQuantity += pmp.completedQuantity ?? 0;
                                          variantMap.set(vid, cur);
                                        });
                                        block.orders.forEach(o => o.items.forEach(item => {
                                          const vid = item.variantId ?? '';
                                          const cur = variantMap.get(vid) ?? { quantity: 0, completedQuantity: 0 };
                                          cur.quantity += item.quantity;
                                          variantMap.set(vid, cur);
                                        }));
                                      } else {
                                        block.orders.forEach(o => {
                                          const msForOrder = o.milestones.find(x => x.templateId === tid);
                                          o.items.forEach(item => {
                                            const vid = item.variantId ?? '';
                                            const cur = variantMap.get(vid) ?? { quantity: 0, completedQuantity: 0 };
                                            cur.quantity += item.quantity;
                                            const reportQty = msForOrder?.reports
                                              ?.filter(r => (r.variantId || '') === vid)
                                              .reduce((a, r) => a + r.quantity, 0) ?? 0;
                                            cur.completedQuantity += reportQty;
                                            variantMap.set(vid, cur);
                                          });
                                        });
                                      }
                                      const productItems = variantMap.size > 0
                                        ? Array.from(variantMap.entries()).map(([variantId, v]) => ({
                                            variantId: variantId || undefined,
                                            quantity: v.quantity,
                                            completedQuantity: v.completedQuantity
                                          }))
                                        : undefined;
                                      handleOpenReport(first.order, first.ms, {
                                        totalQty,
                                        completedQty,
                                        orders: ordersWithMs.map(x => x.order),
                                        items: productItems
                                      });
                                    };
                                    return ((onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && hasProcessReportPerm()) ? (
                                      <button
                                        key={tid}
                                        type="button"
                                        disabled={!allowReport}
                                        onClick={allowReport ? handleProductGroupMsClick : undefined}
                                        className={`flex flex-col items-center shrink-0 min-w-[88px] py-2 px-2 rounded-xl border transition-colors ${
                                          allowReport
                                            ? 'bg-slate-50 border-slate-100 hover:bg-slate-100 hover:border-slate-200 cursor-pointer'
                                            : 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                                        }`}
                                        title={
                                          allowReport
                                            ? `可报最多 ${availDisplay}，已完成 ${m.completed}，剩余 ${remainingDisplay}（点击报工）`
                                            : '需先完成前一道工序的报工后才能报本工序'
                                        }
                                      >
                                        <span className="text-[10px] font-bold text-emerald-600 mb-2 truncate w-full text-center">{m.name}</span>
                                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-2 ${isDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                          <span className="text-base font-black text-slate-900">{m.completed}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                          <span>{availDisplay} / <span className={remaining <= 0 && m.completed === 0 ? '' : remaining < 0 ? 'text-rose-500' : ''}>{remainingDisplay}</span></span>
                                        </div>
                                      </button>
                                    ) : (
                                      <div key={tid} className="flex flex-col items-center shrink-0 min-w-[88px] py-2 px-2 bg-slate-50 rounded-xl border border-slate-100">
                                        <span className="text-[10px] font-bold text-emerald-600 mb-2 truncate w-full text-center">{m.name}</span>
                                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-2 ${isDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                          <span className="text-base font-black text-slate-900">{m.completed}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                          <span>{availDisplay} / <span className={remaining < 0 ? 'text-rose-500' : ''}>{remainingDisplay}</span></span>
                                        </div>
                                      </div>
                                    );
                                  });
                                  })()}
                                </div>
                              </div>
                            ) : (
                              <div className="w-40">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-bold text-slate-400">进度</span>
                                  <span className="text-xs font-black text-indigo-600">{Math.min(100, overallProgress)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 transition-all rounded-full" style={{ width: `${Math.min(100, overallProgress)}%` }} />
                                </div>
                              </div>
                            )}
                            <div className="flex flex-col gap-2 shrink-0">
                              {hasOrderPerm('production:orders_detail:view') && (
                              <button
                                type="button"
                                onClick={() => { setOrderFlowProductId(block.productId); setShowOrderFlowModal(true); }}
                                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                              >
                                <FileText className="w-3.5 h-3.5" /> 详情
                              </button>
                              )}
                              {onAddRecord && hasOrderPerm('production:orders_material:allow') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMaterialIssueOrderId(null);
                                    setMaterialIssueForProduct({ productId: block.productId, orders: block.orders });
                                    setMaterialIssueQty({});
                                    setMaterialIssueWarehouseId(warehouses[0]?.id ?? '');
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                                >
                                  <Package className="w-3.5 h-3.5" /> 物料
                                </button>
                              )}
                              {hasOrderPerm('production:orders_rework:allow') && (
                              <button
                                type="button"
                                onClick={() => setReworkDetailProductId(block.productId)}
                                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-amber-100 text-amber-600 bg-white hover:bg-amber-50 transition-all w-full justify-center"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> 返工
                              </button>
                              )}
                            </div>
                          </div>
                        </div>
                    </div>
                  </div>
                );
              }
              const { parent, children } = block;
              const allWithDepth = [{ order: parent, depth: 0 }, ...getAllDescendantsWithDepth(parent.id, 1)];
              const allOrders = allWithDepth.map(d => d.order);
              const isExpanded = expandedParents.has(parent.id);
              return (
                <div key={`parentChild-${parent.id}`} className="rounded-2xl border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(parent.id)}
                    className="w-full px-4 py-2 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2 hover:bg-slate-200/60 transition-colors text-left"
                    title={isExpanded ? '收起子工单' : '展开子工单'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                    <Plus className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">主工单及子工单（共 {allOrders.length} 条）</span>
                  </button>
                  <div className="p-3 space-y-2">
                    {isExpanded ? (
                      allWithDepth.map(({ order, depth }) => {
                        const isChild = depth > 0;
                        const indentPx = isChild ? 24 * depth : 0;
                        return renderOrderCard(order, isChild, indentPx);
                      })
                    ) : (
                      renderOrderCard(parent, false)
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 工单流水弹窗 */}
      {showOrderFlowModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setShowOrderFlowModal(false); setOrderFlowProductId(null); }} />
          <div className="relative bg-white w-full max-w-5xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-indigo-500" /> 工单流水
              </h3>
              <button onClick={() => { setShowOrderFlowModal(false); setOrderFlowProductId(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <OrderFlowView orders={orders} products={products} embedded productionLinkMode={productionLinkMode} initialProductId={orderFlowProductId} onOpenOrderDetail={(id) => setDetailOrderId(id)} />
            </div>
          </div>
        </div>
      )}

      {/* 工单表单配置弹窗 */}
      {showOrderFormConfigModal && orderFormConfigDraft && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowOrderFormConfigModal(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sliders className="w-5 h-5 text-indigo-500" /> 工单表单配置</h3>
                <p className="text-xs text-slate-500 mt-1">配置在列表、新增、详情页中显示的字段，可增加自定义项</p>
              </div>
              <button onClick={() => setShowOrderFormConfigModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6 overflow-auto">
              <div>
                <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">标准字段显示</h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">字段</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderFormConfigDraft.standardFields
                        .filter(f => !['product', 'sku', 'totalQty', 'status', 'orderNumber'].includes(f.id))
                        .map(f => (
                          <tr key={f.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                            <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
                  <button type="button" onClick={() => setOrderFormConfigDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                    <Plus className="w-3.5 h-3.5" /> 增加
                  </button>
                </div>
                {orderFormConfigDraft.customFields.length === 0 ? (
                  <p className="text-sm text-slate-400 italic py-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">暂无自定义项，点击「增加」添加</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">标签</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">类型</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">选项（下拉时）</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orderFormConfigDraft.customFields.map(cf => (
                          <tr key={cf.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                            <td className="px-4 py-2">
                              <select value={cf.type || 'text'} onChange={e => {
                                const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                                setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                              }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 align-top">
                              {cf.type === 'select' ? (
                                <div className="min-w-[180px] space-y-1.5">
                                  {(cf.options ?? []).map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-1">
                                      <input type="text" value={opt} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                      <button type="button" onClick={() => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                    <Plus className="w-3.5 h-3.5" /> 添加选项
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2"><button type="button" onClick={() => setOrderFormConfigDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowOrderFormConfigModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
              <button onClick={() => { onUpdateOrderFormSettings(orderFormConfigDraft); setShowOrderFormConfigModal(false); setOrderFormConfigDraft(null); }} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">保存配置</button>
            </div>
          </div>
        </div>
      )}

      {/* 工序报工弹窗：用当前 orders 中的工单算可报最多，避免提交后仍用旧快照导致「最多」不随不良变化 */}
      {reportModal && (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && (() => {
        const orderIdsInModal = reportModal.productOrders?.length ? reportModal.productOrders.map(o => o.id) : [reportModal.order.id];
        const resolvedFromOrders = orderIdsInModal.map(id => orders.find(o => o.id === id)).filter((o): o is ProductionOrder => o != null);
        const ordersInModal = resolvedFromOrders.length > 0 ? resolvedFromOrders : (reportModal.productOrders?.length ? reportModal.productOrders : [reportModal.order]);
        const tid = reportModal.milestone.templateId;
        const pid = reportModal.order.productId;
        const useProductPmp =
          productionLinkMode === 'product' && productMilestoneProgresses.length > 0;
        const productForModal = products.find(p => p.id === pid);
        const modalMilestoneOrder = productForModal?.milestoneNodeIds ?? [];
        const seqIdx = modalMilestoneOrder.indexOf(tid);
        const totalBase = useProductPmp
          ? processSequenceMode === 'sequential' && seqIdx > 0
            ? Math.max(
                0,
                pmpCompletedAtTemplate(productMilestoneProgresses, pid, modalMilestoneOrder[seqIdx - 1]) -
                  ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0) +
                  ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).rework, 0)
              )
            : productGroupMaxReportableSum(ordersInModal, tid, pid, productMilestoneProgresses, processSequenceMode, (oid, t) =>
                getDefectiveRework(oid, t)
              )
          : processSequenceMode === 'sequential'
            ? ordersInModal.reduce((s, o) => {
                const idx = o.milestones.findIndex(m => m.templateId === tid);
                if (idx <= 0) return s + o.items.reduce((a, i) => a + i.quantity, 0);
                const prev = o.milestones[idx - 1];
                return s + (prev?.completedQuantity ?? 0);
              }, 0)
            : ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
        const totalDefective = ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0);
        const totalRework = ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).rework, 0);
        const totalCompleted = useProductPmp
          ? pmpCompletedAtTemplate(productMilestoneProgresses, pid, tid)
          : ordersInModal.reduce((s, o) => s + (o.milestones.find(m => m.templateId === tid)?.completedQuantity ?? 0), 0);
        /** 本工序已外协未收回（关联产品模式按产品+工序；工单模式按工单+工序） */
        const outsourcePendingRecords = useProductPmp
          ? prodRecords.filter(
              r =>
                r.type === 'OUTSOURCE' &&
                r.status === '加工中' &&
                !r.orderId &&
                r.productId === pid &&
                r.nodeId === tid
            )
          : prodRecords.filter(
              r =>
                r.type === 'OUTSOURCE' &&
                r.status === '加工中' &&
                r.nodeId === tid &&
                orderIdsInModal.includes(r.orderId ?? '')
            );
        const totalOutsourcedAtNode = outsourcePendingRecords.reduce((s, r) => s + (r.quantity ?? 0), 0);
        const outsourcedByVariantId: Record<string, number> = {};
        outsourcePendingRecords.forEach(r => {
          const vid = r.variantId ?? '';
          if (!vid) return;
          outsourcedByVariantId[vid] = (outsourcedByVariantId[vid] ?? 0) + (r.quantity ?? 0);
        });
        const effectiveRemainingForModal = useProductPmp
          ? Math.max(0, totalBase - totalCompleted - totalOutsourcedAtNode)
          : Math.max(0, totalBase - totalDefective + totalRework - totalCompleted - totalOutsourcedAtNode);
        return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setReportModal(null)} />
          <div className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> {reportModal.milestone.name} · 报工</h3>
              <button onClick={() => setReportModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-xs text-slate-500 font-medium">
                <span className="font-bold text-slate-700">{reportModal.order.productName}</span>
                {reportModal.productTotalQty != null ? (
                  <>
                    <span className="mx-2">·</span>
                    <span>产品合计 {reportModal.productTotalQty} 件</span>
                    {reportModal.productCompletedQty != null && (
                      <span className="ml-2">
                        该工序已完成 {reportModal.productCompletedQty} 件，剩余{' '}
                        {Math.max(0, (reportModal.productTotalQty ?? 0) - (reportModal.productCompletedQty ?? 0) - (useProductPmp ? totalOutsourcedAtNode : 0))}{' '}
                        件
                        {useProductPmp && totalOutsourcedAtNode > 0 && (
                          <span className="text-slate-400">（已扣外协未收回 {totalOutsourcedAtNode}）</span>
                        )}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="mx-2">·</span>
                    <span>{reportModal.order.orderNumber}</span>
                  </>
                )}
                {(() => {
                  const p = products.find(px => px.id === reportModal.order.productId);
                  const rate = p?.nodeRates?.[reportModal.milestone.templateId] ?? 0;
                  if (rate <= 0) return null;
                  const totalQty = isMatrixMode ? (reportForm.variantQuantities ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0) : 0) : reportForm.quantity;
                  const totalDef = isMatrixMode ? (reportForm.variantDefectiveQuantities ? Object.values(reportForm.variantDefectiveQuantities).reduce((s, q) => s + q, 0) : 0) : reportForm.defectiveQuantity;
                  return (
                    <div className="mt-2 flex items-center gap-4 text-indigo-600">
                      <span className="font-bold">本工序工价：{rate.toFixed(2)} 元/件</span>
                      {totalQty > 0 && <span className="font-bold">预计金额：{(totalQty * rate).toFixed(2)} 元</span>}
              </div>
                  );
                })()}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">生产人员 <span className="text-rose-500">*</span></label>
                <WorkerSelector
                  options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                  processNodes={globalNodes}
                  currentNodeId={reportModal.milestone.templateId}
                  value={reportForm.workerId}
                  onChange={(id) => setReportForm(prev => ({ ...prev, workerId: id }))}
                  placeholder="选择报工人员..."
                  variant="default"
                  icon={UserPlus}
                />
              </div>
              {globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableEquipmentOnReport && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">设备 <span className="text-rose-500">*</span></label>
                  <EquipmentSelector
                    options={equipment.map(e => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                    processNodes={globalNodes}
                    currentNodeId={reportModal.milestone.templateId}
                    value={reportForm.equipmentId}
                    onChange={(id) => setReportForm(prev => ({ ...prev, equipmentId: id }))}
                    placeholder="选择设备..."
                    variant="default"
                  />
                </div>
              )}
              {isMatrixMode ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">本次完成数量（按规格）</label>
                    <span className="text-sm font-bold text-indigo-600">合计 {matrixTotalQty} 件</span>
                  </div>
                  <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
                    {(() => {
                      const product = products.find(p => p.id === reportModal.order.productId);
                      if (!product?.colorIds?.length || !product?.sizeIds?.length || !dictionaries?.colors || !dictionaries?.sizes) return null;
                      const currentOrder = ordersInModal[0];
                      const currentMs = currentOrder?.milestones.find(m => m.templateId === tid);
                      const { reworkByVariant } = currentOrder ? getDefectiveRework(currentOrder.id, tid) : { reworkByVariant: {} as Record<string, number> };
                      const itemsSource = currentOrder?.items ?? reportModal.productItems ?? reportModal.order.items ?? [];
                      const milestoneNodeIds = product.milestoneNodeIds || [];
                      const variantRemainingBaseMap = new Map<string, number>();
                      product.colorIds.forEach(colorId => {
                        product.sizeIds.forEach(sizeId => {
                          const variant = product.variants?.find(v => v.colorId === colorId && v.sizeId === sizeId);
                          if (!variant) return;
                          if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
                            const rawMax =
                              variantMaxGoodProductMode(
                                variant.id,
                                tid,
                                reportModal.order.productId,
                                ordersInModal,
                                productMilestoneProgresses,
                                processSequenceMode,
                                milestoneNodeIds,
                                (oid, t) => getDefectiveRework(oid, t)
                              ) - (outsourcedByVariantId[variant.id] ?? 0);
                            variantRemainingBaseMap.set(variant.id, Math.max(0, rawMax));
                            return;
                          }
                          const item = Array.isArray(itemsSource) ? itemsSource.find((i: { variantId?: string }) => (i.variantId || '') === variant.id) : undefined;
                          const completedInMilestone = (currentMs?.reports || []).filter((r: { variantId?: string }) => (r.variantId || '') === variant.id).reduce((s: number, r: { quantity?: number }) => s + (r.quantity ?? 0), 0);
                          const defectiveForThisVariant = (currentMs?.reports || []).filter((r: { variantId?: string; defectiveQuantity?: number }) => (r.variantId || '') === variant.id).reduce((s: number, r: { defectiveQuantity?: number }) => s + (r.defectiveQuantity ?? 0), 0);
                          const base = processSequenceMode === 'sequential'
                            ? Math.max(0, getSeqRemainingForVariant(variant.id) - defectiveForThisVariant)
                            : (item ? Math.max(0, (item.quantity ?? 0) - completedInMilestone - defectiveForThisVariant) : 0);
                          const reworkForVariant = reworkByVariant[variant.id] ?? 0;
                          const outsourcedForVariant = outsourcedByVariantId[variant.id] ?? 0;
                          variantRemainingBaseMap.set(variant.id, Math.max(0, base + reworkForVariant - outsourcedForVariant));
                        });
                      });
                      return product.colorIds.map(colorId => {
                        const color = dictionaries.colors.find((c: { id: string; name: string; value: string }) => c.id === colorId);
                        if (!color) return null;
                        return (
                          <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />
                              <span className="text-sm font-bold text-slate-800">{color.name}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-1">
                              {product.sizeIds.map(sizeId => {
                                const size = dictionaries.sizes.find((s: { id: string; name: string }) => s.id === sizeId);
                                const variant = product.variants?.find(v => v.colorId === colorId && v.sizeId === sizeId);
                                if (!size || !variant) return null;
                                const qty = reportForm.variantQuantities?.[variant.id] ?? 0;
                                const remaining = Math.max(0, variantRemainingBaseMap.get(variant.id) ?? 0);
                                const currentCellQty = reportForm.variantQuantities?.[variant.id] ?? 0;
                                const otherTotal = matrixTotalQty - currentCellQty;
                                const maxAllowed = Math.max(0, allowExceedMaxReportQty ? remaining : Math.min(remaining, effectiveRemainingForModal - otherTotal));
                                return (
                                  <div key={sizeId} className="flex flex-col gap-1 min-w-[64px]">
                                    <span className="text-[10px] font-bold text-slate-400">{size.name}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={qty === 0 ? '' : qty}
                                      onChange={e => {
                                        const raw = parseInt(e.target.value) || 0;
                                        const next = allowExceedMaxReportQty ? raw : Math.min(raw, maxAllowed);
                                        handleVariantQuantityChange(variant.id, next);
                                      }}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                                      placeholder={`最多${maxAllowed}`}
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      tabIndex={-1}
                                      value={(reportForm.variantDefectiveQuantities?.[variant.id] ?? 0) === 0 ? '' : (reportForm.variantDefectiveQuantities?.[variant.id] ?? 0)}
                                      onChange={e => handleVariantDefectiveChange(variant.id, parseInt(e.target.value) || 0)}
                                      className="w-full bg-amber-50/80 border border-amber-100 rounded-lg px-2 py-1 text-[10px] text-amber-800 text-right outline-none placeholder:text-amber-400"
                                      placeholder="不良"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                <>
              {((reportModal.productItems ?? reportModal.order.items).length > 1) && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">报工规格项</label>
                  <select
                        tabIndex={-1}
                    value={reportForm.variantId}
                    onChange={(e) => setReportForm({ ...reportForm, variantId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
                  >
                    <option value="">请选择报工规格...</option>
                    {(reportModal.productItems ?? reportModal.order.items).map((item, idx) => {
                      const product = products.find(p => p.id === reportModal.order.productId);
                      const v = product?.variants?.find((x: { id: string }) => x.id === item.variantId);
                          const completedInMilestone = reportModal.productItems
                            ? (item.completedQuantity ?? 0)
                            : (reportModal.milestone.reports || []).filter(r => (r.variantId || '') === (item.variantId || '')).reduce((s, r) => s + r.quantity, 0);
                          const remaining = item.quantity - completedInMilestone;
                      return (
                        <option key={item.variantId ?? idx} value={item.variantId || ''}>
                          {(v as { skuSuffix?: string })?.skuSuffix || item.variantId || `规格${idx + 1}`} (剩余: {remaining})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">本次完成数量（良品）</label>
                    <input
                      type="number"
                      min={0}
                      value={reportForm.quantity === 0 ? '' : reportForm.quantity}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value) || 0;
                        const next = allowExceedMaxReportQty ? raw : Math.min(raw, effectiveRemainingForModal);
                        setReportForm({ ...reportForm, quantity: next });
                      }}
                      placeholder={`最多${effectiveRemainingForModal}`}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                    />
              </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">不良品数量</label>
                    <input
                      type="number"
                      min={0}
                      tabIndex={-1}
                      value={reportForm.defectiveQuantity === 0 ? '' : reportForm.defectiveQuantity}
                      onChange={(e) => setReportForm({ ...reportForm, defectiveQuantity: parseInt(e.target.value) || 0 })}
                      className="w-full bg-amber-50/80 border border-amber-100 rounded-xl py-2.5 px-3 text-sm font-bold text-amber-800 text-right outline-none focus:ring-2 focus:ring-amber-200"
                      placeholder="0"
                    />
                  </div>
                </>
              )}
              {reportModal.milestone.reportTemplate.map(field => (
                <div key={field.id} className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">{field.label} {field.required && <span className="text-rose-500">*</span>}</label>
                  {field.type === 'text' && <input tabIndex={-1} type="text" value={reportForm.customData[field.id] || ''} onChange={(e) => handleReportFieldChange(field.id, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none" />}
                  {field.type === 'number' && <input tabIndex={-1} type="number" value={reportForm.customData[field.id] ?? ''} onChange={(e) => handleReportFieldChange(field.id, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none" />}
                  {field.type === 'select' && (
                    <select tabIndex={-1} value={reportForm.customData[field.id] || ''} onChange={(e) => handleReportFieldChange(field.id, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none">
                      <option value="">请选择...</option>
                      {(field.options || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}
                  {field.type === 'boolean' && (
                    <div className="flex items-center gap-3 py-1">
                      <button tabIndex={-1} type="button" onClick={() => handleReportFieldChange(field.id, !reportForm.customData[field.id])} className={`w-10 h-5 rounded-full relative transition-colors ${reportForm.customData[field.id] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${reportForm.customData[field.id] ? 'left-5.5' : 'left-0.5'}`} />
                      </button>
                      <span className="text-[10px] font-bold text-slate-500">{reportForm.customData[field.id] ? '是' : '否'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setReportModal(null)} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
              <button onClick={submitReport} disabled={!canSubmitMatrix || !reportForm.workerId || (needEquipment && !reportForm.equipmentId) || (!isMatrixMode && ((reportModal.productItems ?? reportModal.order.items).length > 1) && !reportForm.variantId)} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"><Check className="w-4 h-4" /> 确认提交</button>
            </div>
          </div>
        </div>
      );
      })()}

      {/* 报工流水弹窗 */}
      {showHistoryModal && (() => {
        type ReportRow = {
          order: ProductionOrder;
          milestone: { id: string; name: string; templateId: string };
          report: {
            id: string;
            timestamp: string;
            operator: string;
            quantity: number;
            defectiveQuantity?: number;
            variantId?: string;
            reportBatchId?: string;
            reportNo?: string;
          };
        };
        const allRows: ReportRow[] = [];
        orders.forEach(o => {
          o.milestones?.forEach(m => {
            (m.reports || []).forEach(r => {
              allRows.push({ order: o, milestone: { id: m.id, name: m.name, templateId: m.templateId }, report: r });
            });
          });
        });
        type OrderBatch = { source: 'order'; key: string; rows: ReportRow[]; first: ReportRow; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string };
        type ProductBatchItem = { progress: ProductMilestoneProgress; report: typeof allRows[0]['report'] };
        type ProductBatch = { source: 'product'; key: string; progressId: string; productId: string; productName: string; milestoneName: string; milestoneTemplateId: string; rows: ProductBatchItem[]; first: ProductBatchItem; totalGood: number; totalDefective: number; totalAmount: number; reportNo?: string };
        const f = reportHistoryFilter;
        const filteredOrderRows = allRows.filter(({ order, milestone, report }) => {
          if (f.productId) {
            const p = products.find(px => px.id === order.productId);
            const name = (p?.name || '').toLowerCase();
            const kw = f.productId.toLowerCase();
            if (!name.includes(kw) && !order.productId.toLowerCase().includes(kw)) return false;
          }
          if (productionLinkMode !== 'product' && f.orderNumber && !order.orderNumber?.toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
          if (f.milestoneName && !milestone.name?.toLowerCase().includes(f.milestoneName.toLowerCase())) return false;
          if (f.operator && !report.operator?.toLowerCase().includes(f.operator.toLowerCase())) return false;
          if (f.reportNo) {
            const kw = f.reportNo.toLowerCase();
            const key = (report.reportNo || report.reportBatchId || report.id).toLowerCase();
            if (!key.includes(kw)) return false;
          }
          if (f.dateFrom || f.dateTo) {
            const dt = new Date(report.timestamp);
            const dateStr = dt.toISOString().split('T')[0];
            if (f.dateFrom && dateStr < f.dateFrom) return false;
            if (f.dateTo && dateStr > f.dateTo) return false;
          }
          return true;
        });
        const groupKeyOrder = (r: ReportRow) => r.report.reportBatchId || r.report.id;
        const orderGroups = new Map<string, ReportRow[]>();
        filteredOrderRows.forEach(r => {
          const k = groupKeyOrder(r);
          if (!orderGroups.has(k)) orderGroups.set(k, []);
          orderGroups.get(k)!.push(r);
        });
        const orderBatches: OrderBatch[] = Array.from(orderGroups.entries()).map(([k, rows]) => ({
          source: 'order' as const,
          key: k,
          rows,
          first: rows[0],
          totalGood: rows.reduce((s, r) => s + r.report.quantity, 0),
          totalDefective: rows.reduce((s, r) => s + (r.report.defectiveQuantity ?? 0), 0),
          totalAmount: rows.reduce((s, r) => {
            const p = products.find(px => px.id === r.order.productId);
            const rate = r.report.rate ?? p?.nodeRates?.[r.milestone.templateId] ?? 0;
            return s + r.report.quantity * rate;
          }, 0),
          reportNo: rows.find(r => r.report.reportBatchId || r.report.reportNo)?.report.reportNo
        }));
        let productBatches: ProductBatch[] = [];
        if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
          const productRows: ProductBatchItem[] = [];
          productMilestoneProgresses.forEach(pmp => {
            (pmp.reports ?? []).forEach(r => {
              productRows.push({ progress: pmp, report: r });
            });
          });
          const filteredProductRows = productRows.filter(({ progress, report }) => {
            if (f.productId) {
              const p = products.find(px => px.id === progress.productId);
              const name = (p?.name || '').toLowerCase();
              const kw = f.productId.toLowerCase();
              if (!name.includes(kw) && !progress.productId.toLowerCase().includes(kw)) return false;
            }
            const mn = globalNodes.find(n => n.id === progress.milestoneTemplateId)?.name ?? '';
            if (f.milestoneName && !mn.toLowerCase().includes(f.milestoneName.toLowerCase())) return false;
            if (f.operator && !report.operator?.toLowerCase().includes(f.operator.toLowerCase())) return false;
            if (f.reportNo) {
              const kw = f.reportNo.toLowerCase();
              const key = (report.reportNo || report.reportBatchId || report.id).toLowerCase();
              if (!key.includes(kw)) return false;
            }
            if (f.dateFrom || f.dateTo) {
              const dt = new Date(report.timestamp);
              const dateStr = dt.toISOString().split('T')[0];
              if (f.dateFrom && dateStr < f.dateFrom) return false;
              if (f.dateTo && dateStr > f.dateTo) return false;
            }
            return true;
          });
          const productGroupKey = (item: ProductBatchItem) => item.report.reportBatchId || item.report.id;
          const productGroups = new Map<string, ProductBatchItem[]>();
          filteredProductRows.forEach(item => {
            const k = productGroupKey(item);
            if (!productGroups.has(k)) productGroups.set(k, []);
            productGroups.get(k)!.push(item);
          });
          productBatches = Array.from(productGroups.entries()).map(([k, rows]) => {
            const first = rows[0];
            const p = products.find(px => px.id === first.progress.productId);
            const defaultRate = p?.nodeRates?.[first.progress.milestoneTemplateId] ?? 0;
            return {
              source: 'product' as const,
              key: `product-${k}`,
              progressId: first.progress.id,
              productId: first.progress.productId,
              productName: p?.name ?? '',
              milestoneName: globalNodes.find(n => n.id === first.progress.milestoneTemplateId)?.name ?? '',
              milestoneTemplateId: first.progress.milestoneTemplateId,
              rows,
              first,
              totalGood: rows.reduce((s, x) => s + x.report.quantity, 0),
              totalDefective: rows.reduce((s, x) => s + (x.report.defectiveQuantity ?? 0), 0),
              totalAmount: rows.reduce((s, x) => s + x.report.quantity * (x.report.rate ?? defaultRate), 0),
              reportNo: rows.find(r => r.report.reportBatchId || r.report.reportNo)?.report.reportNo
            };
          });
        }
        const batches: (OrderBatch | ProductBatch)[] = [...orderBatches, ...productBatches].sort((a, b) => {
          const ta = a.source === 'order' ? a.first.report.timestamp : a.first.report.timestamp;
          const tb = b.source === 'order' ? b.first.report.timestamp : b.first.report.timestamp;
          return new Date(tb).getTime() - new Date(ta).getTime();
        });
        const totalGood = batches.reduce((s, b) => s + b.totalGood, 0);
        const totalDefective = batches.reduce((s, b) => s + b.totalDefective, 0);
        const totalAmount = batches.reduce((s, b) => s + b.totalAmount, 0);
        const getUnitName = (productId: string) => {
          const p = products.find(px => px.id === productId);
          return (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
        };
        const firstBatchProductId = batches.length > 0 ? (batches[0].source === 'order' ? batches[0].first.order.productId : batches[0].productId) : '';
        const summaryUnit = batches.length > 0 && batches.every(b => (b.source === 'order' ? b.first.order.productId : b.productId) === firstBatchProductId)
          ? getUnitName(firstBatchProductId) : '件';
        const uniqueProducts = [...new Set([...orders.map(o => o.productId), ...productMilestoneProgresses.map(p => p.productId)])].filter(Boolean);
        const uniqueMilestones = [...new Set([...allRows.map(r => r.milestone.name), ...productBatches.map(b => b.milestoneName)])].filter(Boolean);
        const uniqueOperators = [...new Set([...allRows.map(r => r.report.operator), ...productBatches.flatMap(b => b.rows.map(r => r.report.operator))])].filter(Boolean).sort((a, b) => a.localeCompare(b));
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setShowHistoryModal(false); setReportDetailBatch(null); }} />
            <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 报工流水</h3>
                <button onClick={() => { setShowHistoryModal(false); setReportDetailBatch(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                    <input type="date" value={f.dateFrom} onChange={e => setReportHistoryFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                    <input type="date" value={f.dateTo} onChange={e => setReportHistoryFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                    <input
                      type="text"
                      value={f.productId}
                      onChange={e => setReportHistoryFilter(prev => ({ ...prev, productId: e.target.value }))}
                      placeholder="产品名称模糊搜索"
                      className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
                    <select value={f.milestoneName} onChange={e => setReportHistoryFilter(prev => ({ ...prev, milestoneName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">全部</option>
                      {uniqueMilestones.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">报工单号</label>
                    <input
                      type="text"
                      value={f.reportNo}
                      onChange={e => setReportHistoryFilter(prev => ({ ...prev, reportNo: e.target.value }))}
                      placeholder="BG2026... 模糊搜索"
                      className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                  {productionLinkMode !== 'product' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
                      <input
                        type="text"
                        value={f.orderNumber}
                        onChange={e => setReportHistoryFilter(prev => ({ ...prev, orderNumber: e.target.value }))}
                        placeholder="模糊搜索"
                        className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label>
                    <input
                      type="text"
                      value={f.operator}
                      onChange={e => setReportHistoryFilter(prev => ({ ...prev, operator: e.target.value }))}
                      placeholder="操作人模糊搜索"
                      className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4">
                  <button onClick={() => setReportHistoryFilter({ productId: '', orderNumber: '', milestoneName: '', operator: '', dateFrom: '', dateTo: '', reportNo: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                  <span className="text-xs text-slate-400">共 {batches.length} 次报工</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {batches.length === 0 ? (
                  <p className="text-slate-500 text-center py-12">暂无报工流水</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                          {productionLinkMode !== 'product' && (
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>
                          )}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">报工单号</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">良品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">不良品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.map(batch => {
                          const batchUnit = getUnitName(batch.source === 'order' ? batch.first.order.productId : batch.productId);
                          const rawKey = batch.source === 'product' && batch.key.startsWith('product-') ? batch.key.slice('product-'.length) : batch.key;
                          const reportNoRaw = batch.reportNo || rawKey;
                          const reportNo = reportNoRaw.startsWith('外协收回·') ? reportNoRaw.slice(5) : reportNoRaw;
                          return (
                          <tr key={batch.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDT(batch.first.report.timestamp)}</td>
                            {productionLinkMode !== 'product' && (
                              <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                                {batch.source === 'order' ? batch.first.order.orderNumber : '—'}
                              </td>
                            )}
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{reportNo}</td>
                            <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{batch.source === 'order' ? batch.first.order.productName : batch.productName}</td>
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{batch.source === 'order' ? batch.first.milestone.name : batch.milestoneName}</td>
                            <td className="px-4 py-3 font-bold text-emerald-600 text-right whitespace-nowrap">{batch.totalGood} {batchUnit}</td>
                            <td className="px-4 py-3 font-bold text-amber-600 text-right whitespace-nowrap">{batch.totalDefective > 0 ? `${batch.totalDefective} ${batchUnit}` : '—'}</td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{batch.first.report.operator}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setReportDetailBatch({ ...batch })}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                              >
                                <FileText className="w-3.5 h-3.5" /> 详情
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                          <td className="px-4 py-3" colSpan={productionLinkMode !== 'product' ? 5 : 4}></td>
                          <td className="px-4 py-3 text-emerald-600 text-right">{totalGood} {summaryUnit}</td>
                          <td className="px-4 py-3 text-amber-600 text-right">{totalDefective > 0 ? `${totalDefective} ${summaryUnit}` : '—'}</td>
                          <td className="px-4 py-3" colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 待入库清单弹窗 */}
      {showPendingStockModal && (() => {
        const product = stockInOrder ? products.find(p => p.id === stockInOrder.order.productId) : null;
        const category = product ? categories.find(c => c.id === product.categoryId) : null;
        const hasColorSize = !!(category?.hasColorSize && product?.variants?.length);
        const groupedVariantsForStock: Record<string, ProductVariant[]> = (() => {
          if (!product?.variants?.length) return {};
          const groups: Record<string, ProductVariant[]> = {};
          product.variants.forEach(v => {
            if (!groups[v.colorId]) groups[v.colorId] = [];
            groups[v.colorId].push(v);
          });
          return groups;
        })();
        const totalStockInQty = hasColorSize
          ? (Object.values(stockInForm.variantQuantities) as number[]).reduce((s, q) => s + (q || 0), 0)
          : stockInForm.singleQuantity;
        const canSubmitStockIn = onAddRecord && totalStockInQty > 0 && totalStockInQty <= stockInOrder.pendingTotal && (warehouses.length === 0 || !!stockInForm.warehouseId);

        if (stockInOrder) {
          // 选择入库表单（含颜色尺码明细）
          const order = stockInOrder.order;
          const unitName = getUnitName(order.productId);
          return (
            <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStockInOrder(null); setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 }); }} />
              <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 选择入库 — {order.orderNumber}</h3>
                  <button onClick={() => { setStockInOrder(null); setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 }); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                  <p className="text-sm font-bold text-slate-700">{order.productName || product?.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">工单总量 {stockInOrder.orderTotal} {unitName}，已入库 {stockInOrder.alreadyIn} {unitName}，待入库 {stockInOrder.pendingTotal} {unitName}</p>
                </div>
                <div className="flex-1 overflow-auto p-6 space-y-6">
                  {warehouses.length > 0 && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">入库仓库</label>
                      <select
                        value={stockInForm.warehouseId}
                        onChange={e => setStockInForm(f => ({ ...f, warehouseId: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">请选择仓库</option>
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {hasColorSize && product?.variants?.length ? (
                    <div className="space-y-6">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">入库数量明细（颜色尺码）</h4>
                      {sortedVariantColorEntries(groupedVariantsForStock, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                        const color = (dictionaries.colors as { id: string; name: string; value: string }[] | undefined)?.find(c => c.id === colorId);
                        return (
                          <div key={colorId} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
                            <div className="flex items-center gap-2 w-32 shrink-0">
                              <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string })?.value }} />
                              <span className="text-sm font-bold text-slate-700">{color?.name ?? colorId}</span>
                            </div>
                            <div className="flex-1 flex flex-wrap gap-3">
                              {(colorVariants as ProductVariant[]).map(v => {
                                const size = (dictionaries.sizes as { id: string; name: string }[] | undefined)?.find(s => s.id === v.sizeId);
                                const pending = stockInOrder.pendingByVariant[v.id] ?? 0;
                                return (
                                  <div key={v.id} className="flex flex-col gap-1 w-20">
                                    <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.skuSuffix}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder={`待入库 ${pending}`}
                                      value={stockInForm.variantQuantities[v.id] ?? ''}
                                      onChange={e => setStockInForm(f => ({
                                        ...f,
                                        variantQuantities: { ...f.variantQuantities, [v.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }
                                      }))}
                                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-2 text-sm font-bold text-indigo-600 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[9px] font-black text-slate-300 uppercase">颜色小计</p>
                              <p className="text-sm font-bold text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (stockInForm.variantQuantities[v.id] || 0), 0)}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex flex-col items-end gap-1 p-3 bg-indigo-600 rounded-2xl text-white">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold opacity-80">本次入库合计:</span>
                          <span className="text-lg font-black">{totalStockInQty} {unitName}</span>
                        </div>
                        {totalStockInQty > stockInOrder.pendingTotal && (
                          <span className="text-xs font-bold text-amber-200">不得超过可入库数量 {stockInOrder.pendingTotal} {unitName}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">入库数量 ({unitName})</label>
                      <input
                        type="number"
                        min={0}
                        max={stockInOrder.pendingTotal}
                        value={stockInForm.singleQuantity || ''}
                        onChange={e => setStockInForm(f => ({ ...f, singleQuantity: Math.max(0, Math.min(stockInOrder.pendingTotal, parseInt(e.target.value, 10) || 0)) }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 px-6 text-xl font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder={`最多 ${stockInOrder.pendingTotal}`}
                      />
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setStockInOrder(null); setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 }); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                  >
                    返回列表
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmitStockIn}
                    onClick={async () => {
                      if (!(onAddRecord || onAddRecordBatch) || !canSubmitStockIn) return;
                      const ts = new Date().toLocaleString();
                      const operator = '张主管';
                      const docNo = getNextStockInDocNo();
                      if (hasColorSize && product?.variants?.length) {
                        const records = (Object.entries(stockInForm.variantQuantities) as [string, number][])
                          .filter(([, qty]) => qty > 0)
                          .map(([variantId, qty]) => ({
                            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            type: 'STOCK_IN' as const,
                            orderId: order.id,
                            productId: order.productId,
                            variantId: variantId || undefined,
                            quantity: qty,
                            operator,
                            timestamp: ts,
                            status: '已完成',
                            warehouseId: stockInForm.warehouseId || undefined,
                            docNo
                          }));
                        if (onAddRecordBatch) {
                          await onAddRecordBatch(records as ProductionOpRecord[]);
                        } else {
                          for (const rec of records) await onAddRecord!(rec as ProductionOpRecord);
                        }
                      } else {
                        const qty = stockInForm.singleQuantity || 0;
                        if (qty <= 0) return;
                        await onAddRecord!({
                          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          type: 'STOCK_IN',
                          orderId: order.id,
                          productId: order.productId,
                          quantity: qty,
                          operator,
                          timestamp: ts,
                          status: '已完成',
                          warehouseId: stockInForm.warehouseId || undefined,
                          docNo
                        } as ProductionOpRecord);
                      }
                      setStockInOrder(null);
                      setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 });
                    }}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" /> 确认入库
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // 待入库列表
        return (
          <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPendingStockModal(false)} />
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 待入库清单</h3>
                <div className="flex items-center gap-2">
                  {hasOrderPerm('production:orders_pending_stock_in:view') && (
                  <button
                    onClick={() => setShowStockInFlowModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all"
                  >
                    <History className="w-4 h-4" /> 入库流水
                  </button>
                  )}
                  <button onClick={() => setShowPendingStockModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {pendingStockOrders.length === 0 ? (
                  <p className="text-slate-500 text-center py-12">暂无待入库工单（有完成数量且待入库&gt;0 的工单将显示在此）</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">工单号</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">工单总量</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已入库</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">待入库</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-28"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingStockOrders.map(item => {
                          const unitName = getUnitName(item.order.productId);
                          return (
                            <tr key={item.order.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-bold text-slate-800">{item.order.orderNumber}</td>
                              <td className="px-4 py-3 text-slate-700">{item.order.productName}</td>
                              <td className="px-4 py-3 text-slate-600 text-right">{item.orderTotal} {unitName}</td>
                              <td className="px-4 py-3 text-slate-600 text-right">{item.alreadyIn} {unitName}</td>
                              <td className="px-4 py-3 font-bold text-indigo-600 text-right">{item.pendingTotal} {unitName}</td>
                              <td className="px-4 py-3">
                                {hasOrderPerm('production:orders_pending_stock_in:create') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStockInOrder(item);
                                    let defaultVariantQuantities: Record<string, number> = {};
                                    if (item.order.items.some(i => i.variantId) && Object.keys(item.pendingByVariant).length > 0) {
                                      Object.entries(item.pendingByVariant).forEach(([vid, q]) => { if (q > 0) defaultVariantQuantities[vid] = q; });
                                      const sum = Object.values(defaultVariantQuantities).reduce((s, q) => s + q, 0);
                                      if (sum > item.pendingTotal && item.pendingTotal > 0) {
                                        const scale = item.pendingTotal / sum;
                                        defaultVariantQuantities = Object.fromEntries(
                                          Object.entries(defaultVariantQuantities).map(([vid, q]) => [vid, Math.max(0, Math.round(q * scale))])
                                        );
                                      }
                                    }
                                    setStockInForm({
                                      warehouseId: warehouses[0]?.id ?? '',
                                      variantQuantities: defaultVariantQuantities,
                                      singleQuantity: item.pendingTotal
                                    });
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                  选择入库
                                </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 生产入库流水弹窗 */}
      {showStockInFlowModal && (() => {
        type StockInRow = {
          id: string;
          docNo: string;
          orderId: string;
          orderNumber: string;
          productId: string;
          productName: string;
          warehouseId?: string;
          warehouseName: string;
          variantId?: string;
          quantity: number;
          operator: string;
          timestamp: string;
        };
        const allStockInRows: StockInRow[] = (prodRecords || [])
          .filter(r => r.type === 'STOCK_IN')
          .map(r => {
            const order = orders.find(o => o.id === r.orderId);
            const product = products.find(p => p.id === r.productId);
            const wh = warehouses.find(w => w.id === r.warehouseId);
            return {
              id: r.id,
              docNo: (r.docNo as string) || r.id,
              orderId: r.orderId ?? '',
              orderNumber: order?.orderNumber ?? '',
              productId: r.productId ?? '',
              productName: order?.productName || product?.name || '',
              warehouseId: r.warehouseId,
              warehouseName: wh?.name ?? '',
              variantId: r.variantId,
              quantity: r.quantity ?? 0,
              operator: r.operator ?? '',
              timestamp: r.timestamp ?? '',
            };
          });

        const sf = stockInFlowFilter;
        const filteredRows = allStockInRows.filter(r => {
          if (sf.dateFrom || sf.dateTo) {
            const dt = new Date(r.timestamp);
            const dateStr = isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0];
            if (sf.dateFrom && dateStr < sf.dateFrom) return false;
            if (sf.dateTo && dateStr > sf.dateTo) return false;
          }
          if (sf.docNo && !r.docNo.toLowerCase().includes(sf.docNo.toLowerCase())) return false;
          if (sf.orderNumber && !r.orderNumber.toLowerCase().includes(sf.orderNumber.toLowerCase())) return false;
          if (sf.productName && !r.productName.toLowerCase().includes(sf.productName.toLowerCase())) return false;
          if (sf.warehouseId && r.warehouseId !== sf.warehouseId) return false;
          return true;
        });

        type StockInBatch = {
          docNo: string;
          rows: StockInRow[];
          first: StockInRow;
          totalQty: number;
          orderNumber: string;
          productName: string;
          warehouseName: string;
        };
        const groups = new Map<string, StockInRow[]>();
        filteredRows.forEach(r => {
          const k = r.docNo;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(r);
        });
        const batches: StockInBatch[] = Array.from(groups.entries())
          .map(([docNo, rows]) => ({
            docNo,
            rows,
            first: rows[0],
            totalQty: rows.reduce((s, r) => s + r.quantity, 0),
            orderNumber: rows[0].orderNumber,
            productName: rows[0].productName,
            warehouseName: rows[0].warehouseName,
          }))
          .sort((a, b) => new Date(b.first.timestamp).getTime() - new Date(a.first.timestamp).getTime());

        const totalQtyAll = batches.reduce((s, b) => s + b.totalQty, 0);
        const uniqueWarehouses = [...new Set(allStockInRows.map(r => r.warehouseId).filter(Boolean))] as string[];

        const detailBatch = stockInFlowDetailDocNo ? batches.find(b => b.docNo === stockInFlowDetailDocNo) : null;

        return (
          <>
            <div className="fixed inset-0 z-[86] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setShowStockInFlowModal(false); setStockInFlowDetailDocNo(null); }} />
              <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 生产入库流水</h3>
                  <button onClick={() => { setShowStockInFlowModal(false); setStockInFlowDetailDocNo(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">开始时间</label>
                      <input type="date" value={sf.dateFrom} onChange={e => setStockInFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">结束时间</label>
                      <input type="date" value={sf.dateTo} onChange={e => setStockInFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
                      <input type="text" value={sf.docNo} onChange={e => setStockInFlowFilter(prev => ({ ...prev, docNo: e.target.value }))} placeholder="RK2026... 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
                      <input type="text" value={sf.orderNumber} onChange={e => setStockInFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">产品名称</label>
                      <input type="text" value={sf.productName} onChange={e => setStockInFlowFilter(prev => ({ ...prev, productName: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">入库仓库</label>
                      <select value={sf.warehouseId} onChange={e => setStockInFlowFilter(prev => ({ ...prev, warehouseId: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                        <option value="">全部</option>
                        {uniqueWarehouses.map(wid => {
                          const w = warehouses.find(x => x.id === wid);
                          return <option key={wid} value={wid}>{w?.name ?? wid}</option>;
                        })}
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-4">
                    <button onClick={() => setStockInFlowFilter({ dateFrom: '', dateTo: '', docNo: '', orderNumber: '', productName: '', warehouseId: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                    <span className="text-xs text-slate-400">共 {batches.length} 次入库，合计 {totalQtyAll} 件</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-6">
                  {batches.length === 0 ? (
                    <p className="text-slate-500 text-center py-12">暂无生产入库流水</p>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">入库仓库</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">经办人</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {batches.map(batch => {
                            const batchProduct = products.find(p => p.id === batch.first.productId);
                            const batchUnit = (batchProduct?.unitId && dictionaries?.units?.find(u => u.id === batchProduct.unitId)?.name) || '件';
                            return (
                              <tr key={batch.docNo} className="border-b border-slate-100 hover:bg-slate-50/50">
                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDT(batch.first.timestamp)}</td>
                                <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{batch.docNo}</td>
                                <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{batch.productName}</td>
                                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{batch.orderNumber}</td>
                                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{batch.warehouseName || '—'}</td>
                                <td className="px-4 py-3 font-bold text-emerald-600 text-right whitespace-nowrap">{batch.totalQty} {batchUnit}</td>
                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{batch.first.operator}</td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => setStockInFlowDetailDocNo(batch.docNo)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                                  >
                                    <FileText className="w-3.5 h-3.5" /> 详情
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                            <td className="px-4 py-3" colSpan={5}></td>
                            <td className="px-4 py-3 text-emerald-600 text-right">{totalQtyAll} 件</td>
                            <td className="px-4 py-3" colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 入库流水详情弹窗 */}
            {detailBatch && (() => {
              const product = products.find(p => p.id === detailBatch.first.productId);
              const category = product ? categories.find(c => c.id === product.categoryId) : null;
              const hasColorSize = Boolean(product?.colorIds?.length && product?.sizeIds?.length) || Boolean(category?.hasColorSize);
              const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
              const wh = warehouses.find(w => w.id === detailBatch.first.warehouseId);
              const isEditing = stockInFlowEditing !== null;
              const getVariantLabel = (variantId?: string) => {
                if (!variantId) return '—';
                const v = product?.variants?.find((x: { id: string }) => x.id === variantId);
                if (!v) return variantId;
                const color = (dictionaries.colors as { id: string; name: string }[] | undefined)?.find(c => c.id === v.colorId);
                const size = (dictionaries.sizes as { id: string; name: string }[] | undefined)?.find(s => s.id === v.sizeId);
                const parts: string[] = [];
                if (color) parts.push(color.name);
                if (size) parts.push(size.name);
                return parts.length > 0 ? parts.join(' / ') : ((v as { skuSuffix?: string })?.skuSuffix || variantId);
              };
              const startEdit = () => setStockInFlowEditing({
                warehouseId: detailBatch.first.warehouseId ?? '',
                operator: detailBatch.first.operator,
                rows: detailBatch.rows.map(r => ({ id: r.id, variantId: r.variantId, quantity: r.quantity })),
              });
              const cancelEdit = () => setStockInFlowEditing(null);
              const saveEdit = () => {
                if (!stockInFlowEditing || !onUpdateRecord) return;
                const docRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo);
                docRecords.forEach(rec => {
                  const editRow = stockInFlowEditing.rows.find(r => r.id === rec.id);
                  if (editRow) {
                    onUpdateRecord({
                      ...rec,
                      quantity: Math.max(0, editRow.quantity),
                      warehouseId: stockInFlowEditing.warehouseId || undefined,
                      operator: stockInFlowEditing.operator,
                    });
                  }
                });
                setStockInFlowEditing(null);
              };
              const handleDelete = () => {
                if (!onDeleteRecord) return;
                if (!window.confirm('确定要删除该入库单的所有记录吗？此操作不可恢复。')) return;
                const docRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo);
                docRecords.forEach(rec => onDeleteRecord(rec.id));
                setStockInFlowDetailDocNo(null);
                setStockInFlowEditing(null);
              };
              const ef = stockInFlowEditing;
              const editTotalQty = ef ? ef.rows.reduce((s, r) => s + r.quantity, 0) : 0;
              return (
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStockInFlowDetailDocNo(null); setStockInFlowEditing(null); }} />
                  <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          {detailBatch.docNo}
                        </span>
                        入库详情
                      </h3>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={cancelEdit} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                            <button type="button" onClick={saveEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                              <Check className="w-4 h-4" /> 保存
                            </button>
                          </>
                        ) : (
                          <>
                            {onUpdateRecord && hasOrderPerm('production:orders_pending_stock_in:edit') && (
                              <button type="button" onClick={startEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                                <Pencil className="w-4 h-4" /> 编辑
                              </button>
                            )}
                            {onDeleteRecord && hasOrderPerm('production:orders_pending_stock_in:delete') && (
                              <button type="button" onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                                <Trash2 className="w-4 h-4" /> 删除
                              </button>
                            )}
                          </>
                        )}
                        <button onClick={() => { setStockInFlowDetailDocNo(null); setStockInFlowEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                      <h2 className="text-xl font-bold text-slate-900">{detailBatch.productName}</h2>
                      {isEditing && ef ? (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">入库仓库</label>
                              <select
                                value={ef.warehouseId}
                                onChange={e => setStockInFlowEditing(prev => prev ? { ...prev, warehouseId: e.target.value } : prev)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="">请选择仓库</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">经办人</label>
                              <input
                                type="text"
                                value={ef.operator}
                                onChange={e => setStockInFlowEditing(prev => prev ? { ...prev, operator: e.target.value } : prev)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ef.rows.map(row => (
                                  <tr key={row.id} className="border-b border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{getVariantLabel(row.variantId)}</td>
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        value={row.quantity}
                                        onChange={e => setStockInFlowEditing(prev => prev ? {
                                          ...prev,
                                          rows: prev.rows.map(r => r.id === row.id ? { ...r, quantity: Math.max(0, parseInt(e.target.value, 10) || 0) } : r)
                                        } : prev)}
                                        className="w-24 bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-sm font-bold text-indigo-600 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              {ef.rows.length > 1 && (
                                <tfoot>
                                  <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                                    <td className="px-4 py-3">合计</td>
                                    <td className="px-4 py-3 text-emerald-600 text-right">{editTotalQty} {unitName}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-4">
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工单号</p>
                              <p className="text-sm font-bold text-slate-800">{detailBatch.orderNumber || '—'}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">入库仓库</p>
                              <p className="text-sm font-bold text-slate-800">{wh?.name || '—'}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">入库数量</p>
                              <p className="text-sm font-bold text-indigo-600">{detailBatch.totalQty} {unitName}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">入库时间</p>
                              <p className="text-sm font-bold text-slate-800">{fmtDT(detailBatch.first.timestamp)}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">经办人</p>
                              <p className="text-sm font-bold text-slate-800">{detailBatch.first.operator}</p>
                            </div>
                          </div>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailBatch.rows.map(row => (
                                  <tr key={row.id} className="border-b border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{getVariantLabel(row.variantId)}</td>
                                    <td className="px-4 py-3 font-bold text-emerald-600 text-right">{row.quantity} {unitName}</td>
                                  </tr>
                                ))}
                              </tbody>
                              {hasColorSize && detailBatch.rows.length > 1 && (
                                <tfoot>
                                  <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                                    <td className="px-4 py-3">合计</td>
                                    <td className="px-4 py-3 text-emerald-600 text-right">{detailBatch.totalQty} {unitName}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        );
      })()}

      {reportDetailBatch && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setReportDetailBatch(null); setEditingReport(null); }} />
          <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                  {reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.orderNumber : '产品'}
                </span>
                报工详情
              </h3>
              <div className="flex items-center gap-2">
                {editingReport ? (
                  <>
                    <button onClick={() => setEditingReport(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                    <button
                      onClick={() => {
                        const f = editingReport.form;
                        const ts = new Date(f.timestamp);
                        const tsStr = isNaN(ts.getTime()) ? new Date().toLocaleString() : ts.toLocaleString();
                        if (reportDetailBatch.source === 'order' && onUpdateReport) {
                          const origMilestoneId = reportDetailBatch.first.milestone.id;
                          const changedMilestone = editingReport.milestoneId !== origMilestoneId;
                          f.rowEdits.forEach(row => {
                            onUpdateReport({
                              orderId: row.orderId,
                              milestoneId: row.milestoneId,
                              reportId: row.reportId,
                              quantity: Math.max(0, row.quantity),
                              defectiveQuantity: Math.max(0, row.defectiveQuantity),
                              timestamp: tsStr,
                              operator: f.operator,
                              newMilestoneId: changedMilestone ? editingReport.milestoneId : undefined
                            });
                          });
                        } else if (reportDetailBatch.source === 'product' && onUpdateReportProduct) {
                          const origTemplateId = reportDetailBatch.milestoneTemplateId;
                          const changedTemplate = editingReport.templateId !== origTemplateId;
                          f.rowEdits.forEach(row => {
                            if (!row.progressId) return;
                            onUpdateReportProduct({
                              progressId: row.progressId,
                              reportId: row.reportId,
                              quantity: Math.max(0, row.quantity),
                              defectiveQuantity: Math.max(0, row.defectiveQuantity),
                              timestamp: tsStr,
                              operator: f.operator,
                              newMilestoneTemplateId: changedTemplate ? editingReport.templateId : undefined
                            });
                          });
                        }
                        if (onUpdateProduct && f.rate >= 0) {
                          const product = products.find(p => p.id === editingReport.productId);
                          if (product) {
                            onUpdateProduct({
                              ...product,
                              nodeRates: { ...(product.nodeRates || {}), [editingReport.templateId]: f.rate }
                            });
                          }
                        }
                        setEditingReport(null);
                        setReportDetailBatch(null);
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      <Check className="w-4 h-4" /> 保存
                    </button>
                  </>
                ) : (
                  <>
                    {reportDetailBatch.source === 'order' && onUpdateReport && reportDetailBatch.rows.length > 0 && hasOrderPerm('production:orders_report_records:edit') && (
                      <button
                        type="button"
                        onClick={() => {
                          const { order, milestone, report } = reportDetailBatch.rows[0];
                          const ts = report.timestamp;
                          let dt = new Date(ts);
                          if (isNaN(dt.getTime())) dt = new Date();
                          const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                          const product = products.find(p => p.id === order.productId);
                          const rate = product?.nodeRates?.[milestone.templateId] ?? 0;
                          const matchingWorker = workers.find(w => w.name === report.operator);
                          setEditingReport({
                            orderId: order.id,
                            milestoneId: milestone.id,
                            templateId: milestone.templateId,
                            productId: order.productId,
                            form: {
                              timestamp: tsStr,
                              operator: report.operator,
                              workerId: matchingWorker?.id || '',
                              rate,
                              rowEdits: reportDetailBatch.rows.map(({ order: o, milestone: m, report: r }) => ({
                                reportId: r.id,
                                orderId: o.id,
                                milestoneId: m.id,
                                quantity: r.quantity,
                                defectiveQuantity: r.defectiveQuantity ?? 0
                              }))
                            }
                          });
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Pencil className="w-4 h-4" /> 编辑
                      </button>
                    )}
                    {reportDetailBatch.source === 'product' && onUpdateReportProduct && reportDetailBatch.rows.length > 0 && hasOrderPerm('production:orders_report_records:edit') && (
                      <button
                        type="button"
                        onClick={() => {
                          const { progress, report } = reportDetailBatch.rows[0];
                          const ts = report.timestamp;
                          let dt = new Date(ts);
                          if (isNaN(dt.getTime())) dt = new Date();
                          const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                          const product = products.find(p => p.id === progress.productId);
                          const rate = product?.nodeRates?.[progress.milestoneTemplateId] ?? 0;
                          const matchingWorker = workers.find(w => w.name === report.operator);
                          setEditingReport({
                            orderId: '',
                            milestoneId: '',
                            templateId: progress.milestoneTemplateId,
                            productId: progress.productId,
                            form: {
                              timestamp: tsStr,
                              operator: report.operator,
                              workerId: matchingWorker?.id || '',
                              rate,
                              rowEdits: reportDetailBatch.rows.map(({ progress: pr, report: r }) => ({
                                reportId: r.id,
                                orderId: '',
                                milestoneId: '',
                                progressId: pr.id,
                                quantity: r.quantity,
                                defectiveQuantity: r.defectiveQuantity ?? 0
                              }))
                            }
                          });
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Pencil className="w-4 h-4" /> 编辑
                      </button>
                    )}
                    {reportDetailBatch.source === 'order' && onDeleteReport && hasOrderPerm('production:orders_report_records:delete') && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm('确定要删除该次报工的所有记录吗？此操作不可恢复。')) return;
                          reportDetailBatch.rows.forEach(({ order, milestone, report }) => {
                            onDeleteReport({ orderId: order.id, milestoneId: milestone.id, reportId: report.id });
                          });
                          setReportDetailBatch(null);
                          setEditingReport(null);
                          setShowHistoryModal(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                      >
                        <Trash2 className="w-4 h-4" /> 删除
                      </button>
                    )}
                    {reportDetailBatch.source === 'product' && onDeleteReportProduct && hasOrderPerm('production:orders_report_records:delete') && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm('确定要删除该次报工的所有记录吗？此操作不可恢复。')) return;
                          reportDetailBatch.rows.forEach(({ progress, report }) => {
                            onDeleteReportProduct({ progressId: progress.id, reportId: report.id });
                          });
                          setReportDetailBatch(null);
                          setEditingReport(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                      >
                        <Trash2 className="w-4 h-4" /> 删除
                      </button>
                    )}
                  </>
                )}
                <button onClick={() => { setReportDetailBatch(null); setEditingReport(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <h2 className="text-xl font-bold text-slate-900">{reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productName : reportDetailBatch.productName}</h2>
              {editingReport ? (() => {
                const order = reportDetailBatch.source === 'order' ? orders.find(o => o.id === editingReport.orderId) : null;
                const milestone = order?.milestones.find(m => m.templateId === editingReport.templateId);
                const tid = editingReport.templateId;
                const orderTotal = order ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
                const totalBase = order && milestone && processSequenceMode === 'sequential'
                  ? (() => { const idx = order.milestones.findIndex(m => m.templateId === tid); if (idx <= 0) return orderTotal; const prev = order.milestones[idx - 1]; return prev?.completedQuantity ?? 0; })()
                  : (orderTotal || 0);
                const { defective: totalDefective, rework: totalRework } = order ? getDefectiveRework(order.id, tid) : { defective: 0, rework: 0 };
                const totalCompleted = milestone?.completedQuantity ?? 0;
                const outsourcedPendingEdit = order ? prodRecords.filter(
                  r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === order.id && r.nodeId === tid
                ).reduce((s, r) => s + (r.quantity ?? 0), 0) : 0;
                const effectiveRemainingSaved = Math.max(0, totalBase - totalDefective + totalRework - totalCompleted - outsourcedPendingEdit);
                const batchDefectiveSum = editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                const maxBatchGood = effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - batchDefectiveSum;
                return (
                <>
                  {reportDetailBatch.source === 'order' && order && (
                    <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
                      本工序可报最多 <span className="font-bold text-indigo-600">{effectiveRemainingSaved}</span> 件（已扣不良、加返工）；当前批良品合计不超过 <span className="font-bold text-indigo-600">{Math.max(0, maxBatchGood)}</span> 件
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_1.5fr_2.5fr] gap-3">
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">工序</p>
                      <select
                        value={editingReport.templateId}
                        onChange={e => {
                          const newTemplateId = e.target.value;
                          const product = products.find(p => p.id === editingReport.productId);
                          const newRate = product?.nodeRates?.[newTemplateId] ?? 0;
                          if (reportDetailBatch.source === 'order') {
                            const order = orders.find(o => o.id === editingReport.orderId);
                            const newMilestone = order?.milestones.find(m => m.templateId === newTemplateId);
                            setEditingReport(prev => prev ? {
                              ...prev,
                              templateId: newTemplateId,
                              milestoneId: newMilestone?.id || prev.milestoneId,
                              form: { ...prev.form, rate: newRate }
                            } : prev);
                          } else {
                            setEditingReport(prev => prev ? {
                              ...prev,
                              templateId: newTemplateId,
                              form: { ...prev.form, rate: newRate }
                            } : prev);
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        {globalNodes.map(n => (
                          <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">报工时间</p>
                      <input
                        type="datetime-local"
                        value={editingReport.form.timestamp}
                        onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    </div>
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p>
                      <WorkerSelector
                        options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                        processNodes={globalNodes}
                        currentNodeId={editingReport.templateId}
                        value={editingReport.form.workerId}
                        onChange={(id) => {
                          const w = workers.find(wx => wx.id === id);
                          setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, workerId: id, operator: w?.name || prev.form.operator } } : prev);
                        }}
                        placeholder="选择操作人..."
                        variant="compact"
                      />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">良品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">不良品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportDetailBatch.source === 'order'
                          ? reportDetailBatch.rows.map(({ order, milestone, report }) => {
                              const rowEdit = editingReport.form.rowEdits.find(r => r.reportId === report.id);
                              if (!rowEdit) return null;
                              const otherGoodSum = editingReport.form.rowEdits.filter(r => r.reportId !== report.id).reduce((s, r) => s + r.quantity, 0);
                              const maxThisRow = Math.max(0, maxBatchGood - otherGoodSum);
                              const p = products.find(px => px.id === order.productId);
                              const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                              const variantSuffix = report.variantId && (() => {
                                const v = p?.variants?.find((x: { id: string }) => x.id === report.variantId);
                                return (v as { skuSuffix?: string })?.skuSuffix;
                              })();
                              const rate = editingReport.form.rate;
                              const amount = rowEdit.quantity * rate;
                              return (
                                <tr key={report.id} className="border-b border-slate-100">
                                  <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxThisRow || undefined}
                                        title={maxBatchGood >= 0 ? `本批良品合计最多 ${maxBatchGood} 件` : ''}
                                        value={rowEdit.quantity}
                                        onChange={e => {
                                          const raw = parseInt(e.target.value) || 0;
                                          const v = maxBatchGood >= 0 ? Math.min(raw, maxThisRow) : raw;
                                          setEditingReport(prev => prev ? {
                                            ...prev,
                                            form: {
                                              ...prev.form,
                                              rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, quantity: v } : r)
                                            }
                                          } : prev);
                                        }}
                                        className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                      />
                                      <span className="text-slate-600 text-sm">{detailUnit}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        value={rowEdit.defectiveQuantity}
                                        onChange={e => {
                                          const v = Math.max(0, parseInt(e.target.value) || 0);
                                          setEditingReport(prev => {
                                            if (!prev) return prev;
                                            const nextEdits = prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, defectiveQuantity: v } : r);
                                            const newDefSum = nextEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                                            const newMaxBatchGood = effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - newDefSum;
                                            const totalQty = nextEdits.reduce((s, r) => s + r.quantity, 0);
                                            if (totalQty > newMaxBatchGood && newMaxBatchGood >= 0) {
                                              const scale = totalQty > 0 ? newMaxBatchGood / totalQty : 0;
                                              const clamped = nextEdits.map(r => ({ ...r, quantity: Math.floor(r.quantity * scale) }));
                                              const remainder = newMaxBatchGood - clamped.reduce((s, r) => s + r.quantity, 0);
                                              const final = clamped.length > 0 && remainder > 0 ? clamped.map((r, i) => i === 0 ? { ...r, quantity: r.quantity + remainder } : r) : clamped;
                                              return { ...prev, form: { ...prev.form, rowEdits: final } };
                                            }
                                            return { ...prev, form: { ...prev.form, rowEdits: nextEdits } };
                                          });
                                        }}
                                        className="w-20 bg-amber-50/80 border border-amber-100 rounded-lg px-2 py-1 text-sm font-bold text-amber-800 text-right outline-none focus:ring-2 focus:ring-amber-200"
                                      />
                                      <span className="text-slate-600 text-sm">{detailUnit}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {reportDetailBatch.rows.findIndex(x => x.report.id === report.id) === 0 ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={editingReport.form.rate}
                                          onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev)}
                                          className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                        />
                                        <span className="text-slate-500 text-xs">元/{detailUnit}</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-600 text-sm">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-bold text-indigo-600 text-right">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                                </tr>
                              );
                            })
                          : reportDetailBatch.rows.map(({ progress, report }) => {
                              const rowEdit = editingReport.form.rowEdits.find(r => r.reportId === report.id);
                              if (!rowEdit) return null;
                              const p = products.find(px => px.id === progress.productId);
                              const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                              const variantSuffix = progress.variantId && (() => {
                                const v = p?.variants?.find((x: { id: string }) => x.id === progress.variantId);
                                return (v as { skuSuffix?: string })?.skuSuffix;
                              })();
                              const rate = editingReport.form.rate;
                              const amount = rowEdit.quantity * rate;
                              return (
                                <tr key={report.id} className="border-b border-slate-100">
                                  <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        value={rowEdit.quantity}
                                        onChange={e => {
                                          const v = parseInt(e.target.value) || 0;
                                          setEditingReport(prev => prev ? {
                                            ...prev,
                                            form: {
                                              ...prev.form,
                                              rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, quantity: v } : r)
                                            }
                                          } : prev);
                                        }}
                                        className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                      />
                                      <span className="text-slate-600 text-sm">{detailUnit}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        value={rowEdit.defectiveQuantity}
                                        onChange={e => {
                                          const v = parseInt(e.target.value) || 0;
                                          setEditingReport(prev => prev ? {
                                            ...prev,
                                            form: {
                                              ...prev.form,
                                              rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, defectiveQuantity: v } : r)
                                            }
                                          } : prev);
                                        }}
                                        className="w-20 bg-amber-50/80 border border-amber-100 rounded-lg px-2 py-1 text-sm font-bold text-amber-800 text-right outline-none focus:ring-2 focus:ring-amber-200"
                                      />
                                      <span className="text-slate-600 text-sm">{detailUnit}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {reportDetailBatch.rows.findIndex(x => x.report.id === report.id) === 0 ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={editingReport.form.rate}
                                          onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev)}
                                          className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                        />
                                        <span className="text-slate-500 text-xs">元/{detailUnit}</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-600 text-sm">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-bold text-indigo-600 text-right">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                                </tr>
                              );
                            })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                          <td className="px-4 py-3">合计</td>
                          <td className="px-4 py-3 text-emerald-600 text-right">
                            {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {(products.find(px => px.id === editingReport.productId)?.unitId && dictionaries?.units?.find(u => u.id === products.find(px => px.id === editingReport.productId)?.unitId)?.name) || '件'}
                          </td>
                          <td className="px-4 py-3 text-amber-600 text-right">
                            {(() => {
                              const totalDef = editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                              const unitName = (products.find(px => px.id === editingReport.productId)?.unitId && dictionaries?.units?.find(u => u.id === products.find(px => px.id === editingReport.productId)?.unitId)?.name) || '件';
                              return totalDef > 0 ? `${totalDef} ${unitName}` : '—';
                            })()}
                          </td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-indigo-600 text-right">
                            {editingReport.form.rowEdits.reduce((s, r) => s + r.quantity * editingReport.form.rate, 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              );
              })() : (
                <>
                  <div className="flex flex-wrap gap-4">
                    {(() => {
                      const productId = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productId : reportDetailBatch.productId;
                      const p = products.find(px => px.id === productId);
                      const unitName = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                      const milestoneName = reportDetailBatch.source === 'order'
                        ? reportDetailBatch.first.milestone.name
                        : reportDetailBatch.milestoneName;
                      const order = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order : null;
                      const tid = reportDetailBatch.source === 'order' ? reportDetailBatch.first.milestone.templateId : reportDetailBatch.milestoneTemplateId;
                      const orderTotal = order ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
                      const ms = order?.milestones.find(m => m.templateId === tid);
                      const totalBase = order && ms && processSequenceMode === 'sequential'
                        ? (() => { const idx = order.milestones.findIndex(m => m.templateId === tid); if (idx <= 0) return orderTotal; const prev = order.milestones[idx - 1]; return prev?.completedQuantity ?? 0; })()
                        : (orderTotal || 0);
                      const { defective: drDef, rework: drRework } = order ? getDefectiveRework(order.id, tid) : { defective: 0, rework: 0 };
                      const outsourcedPendingView = order ? prodRecords.filter(
                        r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === order.id && r.nodeId === tid
                      ).reduce((s, r) => s + (r.quantity ?? 0), 0) : 0;
                      const effectiveRemainingView = order && ms ? Math.max(0, totalBase - drDef + drRework - (ms.completedQuantity ?? 0) - outsourcedPendingView) : null;
                      return (
                        <>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工序</p>
                            <p className="text-sm font-bold text-slate-800">{milestoneName || '—'}</p>
                          </div>
                          {effectiveRemainingView != null && (
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">本工序可报最多</p>
                              <p className="text-sm font-bold text-indigo-600">{effectiveRemainingView} {unitName} <span className="text-[10px] font-normal text-slate-400">（已扣不良、加返工、已外协）</span></p>
                            </div>
                          )}
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">本次报工量</p>
                            <p className="text-sm font-bold text-indigo-600">{reportDetailBatch.totalGood} {unitName}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">报工时间</p>
                            <p className="text-sm font-bold text-slate-800">{fmtDT(reportDetailBatch.first.report.timestamp)}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p>
                            <p className="text-sm font-bold text-slate-800">{reportDetailBatch.first.report.operator}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex-1 overflow-auto px-6 pb-6 -mt-2">
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">良品</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">不良品</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportDetailBatch.source === 'order'
                            ? reportDetailBatch.rows.map(({ order, milestone, report }) => {
                                const p = products.find(px => px.id === order.productId);
                                const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                                const variantSuffix = report.variantId && (() => {
                                  const v = p?.variants?.find((x: { id: string }) => x.id === report.variantId);
                                  return (v as { skuSuffix?: string })?.skuSuffix;
                                })();
                                const rate = report.rate ?? p?.nodeRates?.[milestone.templateId] ?? 0;
                                const amount = report.quantity * rate;
                                return (
                                  <tr key={report.id} className="border-b border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                                    <td className="px-4 py-3 font-bold text-emerald-600 text-right">
                                      {report.quantity} {detailUnit}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-amber-600 text-right">
                                      {(report.defectiveQuantity ?? 0) > 0 ? `${report.defectiveQuantity} ${detailUnit}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-right">
                                      {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-indigo-600 text-right">
                                      {amount > 0 ? amount.toFixed(2) : '—'}
                                    </td>
                                  </tr>
                                );
                              })
                            : reportDetailBatch.rows.map(({ progress, report }) => {
                                const p = products.find(px => px.id === progress.productId);
                                const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                                const variantSuffix = progress.variantId && (() => {
                                  const v = p?.variants?.find((x: { id: string }) => x.id === progress.variantId);
                                  return (v as { skuSuffix?: string })?.skuSuffix;
                                })();
                                const rate = report.rate ?? p?.nodeRates?.[progress.milestoneTemplateId] ?? 0;
                                const amount = report.quantity * rate;
                                return (
                                  <tr key={report.id} className="border-b border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{variantSuffix || '—'}</td>
                                    <td className="px-4 py-3 font-bold text-emerald-600 text-right">
                                      {report.quantity} {detailUnit}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-amber-600 text-right">
                                      {(report.defectiveQuantity ?? 0) > 0 ? `${report.defectiveQuantity} ${detailUnit}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-right">
                                      {rate > 0 ? `${rate.toFixed(2)} 元/${detailUnit}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-indigo-600 text-right">
                                      {amount > 0 ? amount.toFixed(2) : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                        </tbody>
                        {(() => {
                          const productId = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productId : reportDetailBatch.productId;
                          const p = products.find(px => px.id === productId);
                          const cat = categories.find(c => c.id === p?.categoryId);
                          const hasColorSize = Boolean(p?.colorIds?.length && p?.sizeIds?.length) || Boolean(cat?.hasColorSize);
                          const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                          if (!hasColorSize) return null;
                          return (
                            <tfoot>
                              <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                                <td className="px-4 py-3">合计</td>
                                <td className="px-4 py-3 text-emerald-600 text-right">
                                  {reportDetailBatch.totalGood} {detailUnit}
                                </td>
                                <td className="px-4 py-3 text-amber-600 text-right">
                                  {reportDetailBatch.totalDefective > 0 ? `${reportDetailBatch.totalDefective} ${detailUnit}` : '—'}
                                </td>
                                <td className="px-4 py-3"></td>
                                <td className="px-4 py-3 text-indigo-600 text-right">
                                  {reportDetailBatch.totalAmount.toFixed(2)}
                                </td>
                              </tr>
                            </tfoot>
                          );
                        })()}
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <OrderDetailModal
        orderId={detailOrderId}
        onClose={() => { setDetailOrderId(null); onClearDetailOrderIdFromState?.(); }}
        orders={orders}
        products={products}
        prodRecords={prodRecords}
        dictionaries={dictionaries}
        categories={categories}
        orderFormSettings={orderFormSettings}
        productionLinkMode={productionLinkMode}
        productMilestoneProgresses={productMilestoneProgresses}
        globalNodes={globalNodes}
        onUpdateOrder={hasOrderPerm('production:orders_detail:edit') ? onUpdateOrder : undefined}
        onDeleteOrder={hasOrderPerm('production:orders_detail:delete') && onDeleteOrder ? (id) => { onDeleteOrder(id); setDetailOrderId(null); onClearDetailOrderIdFromState?.(); } : undefined}
      />

      <ProductDetailModal
        productId={viewProductId}
        onClose={() => setViewProductId(null)}
        products={products}
        categories={categories}
        dictionaries={dictionaries}
        partners={partners}
        boms={boms}
        globalNodes={globalNodes}
      />

      {/* 返工详情弹窗：工单简要信息 + 不良与处理汇总 + 工序返工未报工 + 处理不良品记录 + 返工报工记录 */}
      {reworkDetailOrderId && (() => {
        const mainOrder = orders.find(o => o.id === reworkDetailOrderId);
        if (!mainOrder) return null;
        const childOrders = orders.filter(o => o.parentOrderId === reworkDetailOrderId);
        const orderIds = [reworkDetailOrderId, ...childOrders.map(o => o.id)];
        const product = products.find(p => p.id === mainOrder.productId);
        const orderTotalQty = mainOrder.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;

        const defectByNode = new Map<string, { name: string; defective: number; rework: number; scrap: number; pending: number }>();
        orderIds.forEach(oid => {
          const order = orders.find(o => o.id === oid);
          if (!order) return;
          order.milestones?.forEach(ms => {
            const defective = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
            const rework = (prodRecords || []).filter(r => r.type === 'REWORK' && r.orderId === oid && (r.sourceNodeId ?? r.nodeId) === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
            const scrap = (prodRecords || []).filter(r => r.type === 'SCRAP' && r.orderId === oid && r.nodeId === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
            const pending = Math.max(0, defective - rework - scrap);
            if (defective <= 0 && rework <= 0 && scrap <= 0) return;
            const name = globalNodes.find(n => n.id === ms.templateId)?.name ?? ms.templateId;
            const cur = defectByNode.get(ms.templateId) ?? { name, defective: 0, rework: 0, scrap: 0, pending: 0 };
            cur.defective += defective;
            cur.rework += rework;
            cur.scrap += scrap;
            cur.pending += pending;
            defectByNode.set(ms.templateId, cur);
          });
        });
        const defectRows = Array.from(defectByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const reworkStatsByNode = new Map<string, { name: string; totalQty: number; completedQty: number; pendingQty: number }>();
        orderIds.forEach(oid => {
          const stats = reworkStatsByOrderId.get(oid) ?? [];
          stats.forEach(s => {
            const cur = reworkStatsByNode.get(s.nodeId) ?? { name: s.nodeName, totalQty: 0, completedQty: 0, pendingQty: 0 };
            cur.totalQty += s.totalQty;
            cur.completedQty += s.completedQty;
            cur.pendingQty += s.pendingQty;
            reworkStatsByNode.set(s.nodeId, cur);
          });
        });
        const reworkStatRows = Array.from(reworkStatsByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const defectRecordsList = (prodRecords || []).filter((r): r is ProductionOpRecord => (r.type === 'REWORK' || r.type === 'SCRAP') && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const reworkReportList = (prodRecords || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT' && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

        const getSourceNodeName = (rec: ProductionOpRecord) => {
          const sid = rec.type === 'REWORK' ? (rec.sourceNodeId ?? rec.nodeId) : rec.nodeId;
          return sid ? (globalNodes.find(n => n.id === sid)?.name ?? sid) : '—';
        };
        const getReworkTargetNodes = (rec: ProductionOpRecord) => (rec.reworkNodeIds?.length ? rec.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、') : (rec.nodeId ? (globalNodes.find(n => n.id === rec.nodeId)?.name ?? rec.nodeId) : '—'));

        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setReworkDetailOrderId(null)} aria-hidden />
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{mainOrder.orderNumber}</span>
                  返工详情
                </h3>
                <p className="text-xs text-slate-500 mt-1">本页仅展示该工单的返工与不良处理情况</p>
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                  <span className="font-bold text-slate-800">{mainOrder.productName ?? product?.name ?? '—'}</span>
                  <span className="text-slate-500">总数量 {orderTotalQty} 件</span>
                  {mainOrder.customer && <span className="text-slate-500">客户 {mainOrder.customer}</span>}
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-6">
                {defectRows.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">不良与处理汇总（按来源工序）</h4>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工不良</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已生成返工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报损</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">待处理</th></tr></thead>
                        <tbody>
                          {defectRows.map(row => (
                            <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.defective}</td><td className="px-4 py-3 text-right text-slate-600">{row.rework}</td><td className="px-4 py-3 text-right text-slate-600">{row.scrap}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pending}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {reworkStatRows.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">工序返工未报工</h4>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">返工总量</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">未报工</th></tr></thead>
                        <tbody>
                          {reworkStatRows.map(row => (
                            <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.totalQty}</td><td className="px-4 py-3 text-right text-emerald-600">{row.completedQty}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pendingQty}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">处理不良品记录（生成返工 + 报损）</h4>
                  {defectRecordsList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">类型</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">来源工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">返工目标工序</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                        <tbody>
                          {defectRecordsList.map(r => (
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3"><span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{r.type === 'REWORK' ? '返工' : '报损'}</span></td><td className="px-4 py-3 text-slate-700">{getSourceNodeName(r)}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.type === 'REWORK' ? getReworkTargetNodes(r) : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDT(r.timestamp)}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">返工报工记录</h4>
                  {reworkReportList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                        <tbody>
                          {reworkReportList.map(r => (
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3 text-slate-700">{globalNodes.find(n => n.id === r.nodeId)?.name ?? r.nodeId ?? '—'}</td><td className="px-4 py-3 text-right font-bold text-indigo-600">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.variantId ? (product?.variants?.find(v => v.id === r.variantId) as { skuSuffix?: string } | undefined)?.skuSuffix ?? r.variantId : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDT(r.timestamp)}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end">
                <button type="button" onClick={() => setReworkDetailOrderId(null)} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">关闭</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 返工详情弹窗（关联产品模式）：按产品汇总，不区分工单 */}
      {reworkDetailProductId && productionLinkMode === 'product' && (() => {
        const product = products.find(p => p.id === reworkDetailProductId);
        if (!product) return null;
        const relatedOrders = orders.filter(o => o.productId === reworkDetailProductId && !o.parentOrderId);
        const relatedOrderIds = new Set<string>();
        relatedOrders.forEach(o => {
          relatedOrderIds.add(o.id);
          orders.filter(c => c.parentOrderId === o.id).forEach(c => relatedOrderIds.add(c.id));
        });
        const allOrderIds = Array.from(relatedOrderIds);
        const totalQty = relatedOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);

        const defectByNode = new Map<string, { name: string; defective: number; rework: number; scrap: number; pending: number }>();
        allOrderIds.forEach(oid => {
          const order = orders.find(o => o.id === oid);
          if (!order) return;
          order.milestones?.forEach(ms => {
            const defective = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
            const rework = (prodRecords || []).filter(r => r.type === 'REWORK' && (r.orderId === oid || (!r.orderId && r.productId === reworkDetailProductId)) && (r.sourceNodeId ?? r.nodeId) === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
            const scrap = (prodRecords || []).filter(r => r.type === 'SCRAP' && (r.orderId === oid || (!r.orderId && r.productId === reworkDetailProductId)) && r.nodeId === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
            const pending = Math.max(0, defective - rework - scrap);
            if (defective <= 0 && rework <= 0 && scrap <= 0) return;
            const name = globalNodes.find(n => n.id === ms.templateId)?.name ?? ms.templateId;
            const cur = defectByNode.get(ms.templateId) ?? { name, defective: 0, rework: 0, scrap: 0, pending: 0 };
            cur.defective += defective;
            cur.rework += rework;
            cur.scrap += scrap;
            cur.pending += pending;
            defectByNode.set(ms.templateId, cur);
          });
        });
        if (productMilestoneProgresses.length > 0) {
          productMilestoneProgresses.filter(p => p.productId === reworkDetailProductId).forEach(pmp => {
            const defective = (pmp.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
            if (defective <= 0) return;
            const nodeId = pmp.milestoneTemplateId;
            const name = globalNodes.find(n => n.id === nodeId)?.name ?? nodeId;
            const cur = defectByNode.get(nodeId);
            if (!cur) {
              const rework = (prodRecords || []).filter(r => r.type === 'REWORK' && r.productId === reworkDetailProductId && (r.sourceNodeId ?? r.nodeId) === nodeId).reduce((s, r) => s + (r.quantity ?? 0), 0);
              const scrap = (prodRecords || []).filter(r => r.type === 'SCRAP' && r.productId === reworkDetailProductId && r.nodeId === nodeId).reduce((s, r) => s + (r.quantity ?? 0), 0);
              defectByNode.set(nodeId, { name, defective, rework, scrap, pending: Math.max(0, defective - rework - scrap) });
            }
          });
        }
        const defectRows = Array.from(defectByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const reworkRecords = prodRecords.filter(r => r.type === 'REWORK' && (allOrderIds.includes(r.orderId ?? '') || (!r.orderId && r.productId === reworkDetailProductId)));
        const reworkStatsByNode = new Map<string, { name: string; totalQty: number; completedQty: number; pendingQty: number }>();
        reworkRecords.forEach(r => {
          const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
          const completed = r.status === '已完成' || (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
          targetNodes.forEach(nodeId => {
            const cur = reworkStatsByNode.get(nodeId) ?? { name: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId, totalQty: 0, completedQty: 0, pendingQty: 0 };
            cur.totalQty += r.quantity;
            const doneAtNode = r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
            cur.completedQty += Math.min(r.quantity, doneAtNode);
            cur.pendingQty += reworkRemainingAtNode(r, nodeId);
            reworkStatsByNode.set(nodeId, cur);
          });
        });
        const reworkStatRows = Array.from(reworkStatsByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const defectRecordsList = (prodRecords || []).filter((r): r is ProductionOpRecord => (r.type === 'REWORK' || r.type === 'SCRAP') && (allOrderIds.includes(r.orderId ?? '') || (!r.orderId && r.productId === reworkDetailProductId))).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const reworkReportList = (prodRecords || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT' && (allOrderIds.includes(r.orderId ?? '') || (!r.orderId && r.productId === reworkDetailProductId))).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

        const getSourceNodeName = (rec: ProductionOpRecord) => {
          const sid = rec.type === 'REWORK' ? (rec.sourceNodeId ?? rec.nodeId) : rec.nodeId;
          return sid ? (globalNodes.find(n => n.id === sid)?.name ?? sid) : '—';
        };
        const getReworkTargetNodes = (rec: ProductionOpRecord) => (rec.reworkNodeIds?.length ? rec.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、') : (rec.nodeId ? (globalNodes.find(n => n.id === rec.nodeId)?.name ?? rec.nodeId) : '—'));

        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setReworkDetailProductId(null)} aria-hidden />
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product.name}</span>
                  返工详情
                </h3>
                <p className="text-xs text-slate-500 mt-1">本页展示该产品下所有工单的返工与不良处理汇总</p>
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                  <span className="font-bold text-slate-800">{product.name}</span>
                  {product.sku && <span className="text-slate-500">{product.sku}</span>}
                  <span className="text-slate-500">合计 {totalQty} 件</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-6">
                {defectRows.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">不良与处理汇总（按来源工序）</h4>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工不良</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已生成返工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报损</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">待处理</th></tr></thead>
                        <tbody>
                          {defectRows.map(row => (
                            <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.defective}</td><td className="px-4 py-3 text-right text-slate-600">{row.rework}</td><td className="px-4 py-3 text-right text-slate-600">{row.scrap}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pending}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {reworkStatRows.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">工序返工进度</h4>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">返工总量</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">未报工</th></tr></thead>
                        <tbody>
                          {reworkStatRows.map(row => (
                            <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.totalQty}</td><td className="px-4 py-3 text-right text-emerald-600">{row.completedQty}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pendingQty}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">处理不良品记录（生成返工 + 报损）</h4>
                  {defectRecordsList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">类型</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">来源工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">返工目标工序</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                        <tbody>
                          {defectRecordsList.map(r => (
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3"><span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{r.type === 'REWORK' ? '返工' : '报损'}</span></td><td className="px-4 py-3 text-slate-700">{getSourceNodeName(r)}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.type === 'REWORK' ? getReworkTargetNodes(r) : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDT(r.timestamp)}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">返工报工记录</h4>
                  {reworkReportList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                        <tbody>
                          {reworkReportList.map(r => (
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3 text-slate-700">{globalNodes.find(n => n.id === r.nodeId)?.name ?? r.nodeId ?? '—'}</td><td className="px-4 py-3 text-right font-bold text-indigo-600">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.variantId ? (product.variants?.find(v => v.id === r.variantId) as { skuSuffix?: string } | undefined)?.skuSuffix ?? r.variantId : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDT(r.timestamp)}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end">
                <button type="button" onClick={() => setReworkDetailProductId(null)} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">关闭</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 物料发出弹窗：显示该工单 BOM 所需物料，可输入数量批量领料 */}
      {materialIssueOrderId && onAddRecord && !materialIssueForProduct && (() => {
        const order = orders.find(o => o.id === materialIssueOrderId);
        if (!order) return null;
        const product = products.find(p => p.id === order.productId);
        const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
        const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
        const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
        const addBomItems = (bom: BOM, qty: number, nodeName: string) => {
          bom.items.forEach(bi => {
            const mp = products.find(px => px.id === bi.productId);
            const add = Number(bi.quantity) * qty;
            const existing = matMap.get(bi.productId);
            if (existing) {
              existing.unitNeeded += add;
              if (nodeName) existing.nodeNames.add(nodeName);
            } else {
              const ns = new Set<string>();
              if (nodeName) ns.add(nodeName);
              matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
            }
          });
        };
        const variants = product?.variants ?? [];
        if (variants.length > 0) {
          order.items.forEach(item => {
            const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
            const lineQty = item.quantity;
            const seenBomIds = new Set<string>();
            if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              Object.entries(v.nodeBoms).forEach(([nodeId, bomId]) => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
                const bom = boms.find(b => b.id === bomId);
                if (bom) addBomItems(bom, lineQty, nodeName);
              });
            } else {
              boms.filter(b => b.parentProductId === product!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                if (seenBomIds.has(bom.id)) return;
                seenBomIds.add(bom.id);
                const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
                addBomItems(bom, lineQty, nodeName);
              });
            }
          });
        }
        if (matMap.size === 0 && product) {
          const seenBomIds = new Set<string>();
          boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
            const qty = bom.variantId
              ? (order.items.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
              : orderQty;
            addBomItems(bom, qty, nodeName);
          });
        }
        matMap.forEach((v, productId) => {
          bomMaterials.push({ productId, ...v, nodeNames: Array.from(v.nodeNames) });
        });
        const issuedMap = new Map<string, number>();
        prodRecords.filter(r => r.type === 'STOCK_OUT' && r.orderId === order.id && r.reason !== '来自于返工').forEach(r => {
          issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
        });
        const getNextStockDocNo = () => {
          const prefix = 'LL';
          const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
          const pattern = `${prefix}${todayStr}-`;
          const existing = prodRecords.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
          const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
          const maxSeq = seqs.length ? Math.max(...seqs) : 0;
          return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
        };
        const handleIssueMaterials = () => {
          const toIssue = bomMaterials.filter(m => (materialIssueQty[m.productId] ?? 0) > 0);
          if (toIssue.length === 0) return;
          const docNo = getNextStockDocNo();
          toIssue.forEach(m => {
            const rec: ProductionOpRecord = {
              id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: 'STOCK_OUT' as ProdOpType,
              orderId: order.id,
              productId: m.productId,
              quantity: materialIssueQty[m.productId],
              operator: '张主管',
              timestamp: new Date().toLocaleString(),
              status: '已完成',
              warehouseId: materialIssueWarehouseId || undefined,
              docNo
            };
            onAddRecord(rec);
          });
          setMaterialIssueOrderId(null);
          setMaterialIssueQty({});
        };
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setMaterialIssueOrderId(null); setMaterialIssueQty({}); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-indigo-600" /> 物料发出
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {product?.name ?? order.productName}</p>
                </div>
                <button type="button" onClick={() => { setMaterialIssueOrderId(null); setMaterialIssueQty({}); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {warehouses.length > 0 && (
                  <div className="mb-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                    <select
                      value={materialIssueWarehouseId}
                      onChange={e => setMaterialIssueWarehouseId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                {bomMaterials.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-sm">该工单未配置 BOM 物料，无法进行物料发出</p>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">理论需量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">领料进度</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料数量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {bomMaterials.map(m => {
                        const issued = issuedMap.get(m.productId) ?? 0;
                        return (
                        <tr key={m.productId} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-slate-800">{m.name}</p>
                              {m.nodeNames.map(nn => (
                                <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>
                              ))}
                            </div>
                            {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{m.unitNeeded}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const needed = m.unitNeeded;
                              const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
                              const overIssue = issued > needed;
                              return (
                                <div className="flex flex-col gap-1">
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                    {overIssue ? (
                                      <>
                                        <div className="h-full bg-emerald-500" style={{ width: `${(needed / issued) * 100}%` }} />
                                        <div className="h-full bg-rose-500" style={{ width: `${((issued - needed) / issued) * 100}%` }} />
                                      </>
                                    ) : (
                                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                                    )}
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-500">
                                    {overIssue ? <span>已发 {issued} <span className="text-rose-500">（超发 {issued - needed}）</span></span> : `已发 ${issued}`}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={materialIssueQty[m.productId] ?? ''}
                              onChange={e => setMaterialIssueQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {bomMaterials.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setMaterialIssueOrderId(null); setMaterialIssueQty({}); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleIssueMaterials}
                    disabled={!bomMaterials.some(m => (materialIssueQty[m.productId] ?? 0) > 0)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <ArrowUpFromLine className="w-4 h-4" /> 确认领料发出
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 关联产品：多工单合并 BOM，领料写入 sourceProductId（无工单） */}
      {materialIssueForProduct && onAddRecord && (() => {
        const { productId: sourceProductId, orders: groupOrders } = materialIssueForProduct;
        const finishedProduct = products.find(p => p.id === sourceProductId);
        const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
        const mergeLocal = (local: Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>) => {
          local.forEach((v, pid) => {
            const existing = matMap.get(pid);
            if (existing) {
              existing.unitNeeded += v.unitNeeded;
              v.nodeNames.forEach(n => existing.nodeNames.add(n));
            } else {
              matMap.set(pid, {
                name: v.name,
                sku: v.sku,
                unitNeeded: v.unitNeeded,
                nodeNames: new Set(v.nodeNames)
              });
            }
          });
        };
        const addOrderBom = (order: ProductionOrder) => {
          const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
          if (orderQty <= 0) return;
          const product = products.find(p => p.id === order.productId) ?? finishedProduct;
          const local = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
          const variants = product?.variants ?? [];
          const addLocal = (bom: BOM, qty: number, nodeName: string) => {
            bom.items.forEach(bi => {
              const mp = products.find(px => px.id === bi.productId);
              const add = Number(bi.quantity) * qty;
              const existing = local.get(bi.productId);
              if (existing) {
                existing.unitNeeded += add;
                if (nodeName) existing.nodeNames.add(nodeName);
              } else {
                const ns = new Set<string>();
                if (nodeName) ns.add(nodeName);
                local.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
              }
            });
          };
          if (variants.length > 0) {
            order.items.forEach(item => {
              const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
              const lineQty = item.quantity;
              const seenBomIds = new Set<string>();
              if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
                Object.entries(v.nodeBoms).forEach(([nodeId, bomId]) => {
                  if (seenBomIds.has(bomId)) return;
                  seenBomIds.add(bomId);
                  const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
                  const bom = boms.find(b => b.id === bomId);
                  if (bom) addLocal(bom, lineQty, nodeName);
                });
              } else {
                boms.filter(b => b.parentProductId === (product ?? finishedProduct)!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                  if (seenBomIds.has(bom.id)) return;
                  seenBomIds.add(bom.id);
                  const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
                  addLocal(bom, lineQty, nodeName);
                });
              }
            });
          }
          if (local.size === 0 && product) {
            const seenBomIds = new Set<string>();
            boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
              if (seenBomIds.has(bom.id)) return;
              seenBomIds.add(bom.id);
              const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
              const qty = bom.variantId
                ? (order.items.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
                : orderQty;
              addLocal(bom, qty, nodeName);
            });
          }
          mergeLocal(local);
        };
        groupOrders.forEach(addOrderBom);
        const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
        matMap.forEach((v, pid) => {
          bomMaterials.push({ productId: pid, ...v, nodeNames: Array.from(v.nodeNames) });
        });
        const familyIds = new Set(groupOrders.map(o => o.id));
        const issuedMap = new Map<string, number>();
        prodRecords
          .filter(r => r.type === 'STOCK_OUT' && r.reason !== '来自于返工')
          .forEach(r => {
            const hit =
              r.sourceProductId === sourceProductId ||
              (!r.sourceProductId && r.orderId && familyIds.has(r.orderId));
            if (hit) issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
          });
        const getNextStockDocNo = () => {
          const prefix = 'LL';
          const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
          const pattern = `${prefix}${todayStr}-`;
          const existing = prodRecords.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
          const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
          const maxSeq = seqs.length ? Math.max(...seqs) : 0;
          return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
        };
        const handleIssueMaterials = () => {
          const toIssue = bomMaterials.filter(m => (materialIssueQty[m.productId] ?? 0) > 0);
          if (toIssue.length === 0) return;
          const docNo = getNextStockDocNo();
          toIssue.forEach((m, i) => {
            onAddRecord({
              id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: 'STOCK_OUT' as ProdOpType,
              productId: m.productId,
              quantity: materialIssueQty[m.productId],
              operator: '张主管',
              timestamp: new Date().toLocaleString(),
              status: '已完成',
              warehouseId: materialIssueWarehouseId || undefined,
              docNo,
              sourceProductId
            });
          });
          setMaterialIssueForProduct(null);
          setMaterialIssueQty({});
        };
        const orderLabels = groupOrders.map(o => o.orderNumber).filter(Boolean).join('、');
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => { setMaterialIssueForProduct(null); setMaterialIssueQty({}); }}
              aria-hidden
            />
            <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-indigo-600" /> 物料发出（关联产品）
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {finishedProduct?.name ?? '—'} · 共 {groupOrders.length} 条工单{orderLabels ? `（${orderLabels}）` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setMaterialIssueForProduct(null); setMaterialIssueQty({}); }}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {warehouses.length > 0 && (
                  <div className="mb-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                    <select
                      value={materialIssueWarehouseId}
                      onChange={e => setMaterialIssueWarehouseId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                          {w.code ? ` (${w.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {bomMaterials.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-sm">该产品未配置 BOM 物料，无法进行物料发出</p>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">累计理论需量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">领料进度</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {bomMaterials.map(m => {
                        const issued = issuedMap.get(m.productId) ?? 0;
                        return (
                          <tr key={m.productId} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-800">{m.name}</p>
                                {m.nodeNames.map(nn => (
                                  <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                    {nn}
                                  </span>
                                ))}
                              </div>
                              {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{m.unitNeeded}</td>
                            <td className="px-4 py-3">
                              {(() => {
                                const needed = m.unitNeeded;
                                const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
                                const overIssue = issued > needed;
                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                      {overIssue ? (
                                        <>
                                          <div className="h-full bg-emerald-500" style={{ width: `${(needed / issued) * 100}%` }} />
                                          <div
                                            className="h-full bg-rose-500"
                                            style={{ width: `${((issued - needed) / issued) * 100}%` }}
                                          />
                                        </>
                                      ) : (
                                        <div
                                          className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      )}
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-500">
                                      {overIssue ? (
                                        <span>
                                          已发 {issued} <span className="text-rose-500">（超发 {issued - needed}）</span>
                                        </span>
                                      ) : (
                                        `已发 ${issued}`
                                      )}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={materialIssueQty[m.productId] ?? ''}
                                onChange={e =>
                                  setMaterialIssueQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))
                                }
                                className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {bomMaterials.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setMaterialIssueForProduct(null); setMaterialIssueQty({}); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleIssueMaterials}
                    disabled={!bomMaterials.some(m => (materialIssueQty[m.productId] ?? 0) > 0)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <ArrowUpFromLine className="w-4 h-4" /> 确认领料发出
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default OrderListView;
