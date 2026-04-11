
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Clock, Layers, Plus, History, User, Sliders, X, FileText, ChevronDown, ChevronRight, ScrollText, Pencil, Search, Package, RotateCcw, ArrowDownToLine, Split } from 'lucide-react';
import { ProductionOrder, MilestoneStatus, Milestone, Product, GlobalNodeTemplate, OrderFormSettings, ProductCategory, AppDictionaries, Partner, BOM, ProductionOpRecord, Worker, ProductMilestoneProgress, ProcessSequenceMode, Warehouse } from '../types';
import ProductDetailModal from './ProductDetailModal';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { orders as ordersApi } from '../services/api';
import OrderDetailModal from './OrderDetailModal';
import OrderFlowView from './OrderFlowView';
import PendingStockPanel from './order-list/PendingStockPanel';
import MaterialIssueModal from './order-list/MaterialIssueModal';
import ReportModal from './order-list/ReportModal';
import ReportHistoryModal from './order-list/ReportHistoryModal';
import ReportBatchDetailModal from './order-list/ReportBatchDetailModal';
import OrderFormConfigModal from './order-list/OrderFormConfigModal';
import ReworkDetailModal from './order-list/ReworkDetailModal';
import ReworkDetailProductModal from './order-list/ReworkDetailProductModal';
import {
  sumBlockOrderQty,
  pmpCompletedAtTemplate,
  productGroupMaxReportableSum,
} from '../utils/productReportAggregates';
import { computePendingStockOrders } from '../utils/pendingStockCompute';
import { buildDefectiveReworkByOrderMilestone } from '../utils/defectiveReworkByOrderMilestone';
import {
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
  secondaryToolbarButtonClass,
} from '../styles/uiDensity';
import { useConfirm } from '../contexts/ConfirmContext';
import {
  blockOrderCreatedMs,
  blockSortTieId,
  orderCreatedMs,
  type OrderCenterListBlock as OrderListBlock,
} from '../utils/orderCenterSort';

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
  onUpdateProduct?: (product: Product) => Promise<boolean>;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  productMilestoneProgresses?: ProductMilestoneProgress[];
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, quantity: number, customData: any, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  onNavigateToProductEdit?: (productId: string) => void;
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
  onNavigateToProductEdit,
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
  const confirm = useConfirm();
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const [detailOrderId, setDetailOrderId] = useState<string | null>(initialDetailOrderId ?? null);
  const [showOrderFlowModal, setShowOrderFlowModal] = useState(false);
  /** 从产品卡片打开工单流水时传入，用于预填搜索筛选 */
  const [orderFlowProductId, setOrderFlowProductId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const PAGE_SIZE = 20;
  const [fetchedOrders, setFetchedOrders] = useState<ProductionOrder[]>([]);
  const fetchGenRef = useRef(0);

  const fetchPagedOrders = useCallback(async (page: number, searchTerm: string) => {
    const gen = ++fetchGenRef.current;
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
      if (searchTerm) params.search = searchTerm;
      const result = await ordersApi.listPaginated(params);
      if (gen !== fetchGenRef.current) return;
      setFetchedOrders(result.data as ProductionOrder[]);
      setTotalOrders(result.total);
    } catch (e) {
      console.error('Failed to fetch paginated orders', e);
    }
  }, []);

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch]);
  // 条数变化（下达工单、删单等）须重拉当前页；条数不变时仅依赖下方 displayOrders 与 context 按 id 合并，避免每次报工都触发分页请求
  useEffect(() => {
    fetchPagedOrders(currentPage, debouncedSearch);
  }, [currentPage, debouncedSearch, fetchPagedOrders, orders.length]);

  /** 分页接口的工单与上下文 orders 合并：报工后父级会更新 orders，避免列表仍显示旧工序完成量 */
  const displayOrders = useMemo(() => {
    const usePaged = fetchedOrders.length > 0 || Boolean(debouncedSearch) || currentPage > 1;
    if (!usePaged) return orders;
    const byId = new Map(orders.map(o => [o.id, o]));
    return fetchedOrders.map(o => byId.get(o.id) ?? o);
  }, [fetchedOrders, orders, debouncedSearch, currentPage]);
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
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
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [showOrderFormConfigModal, setShowOrderFormConfigModal] = useState(false);
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

  /** 物料发出弹窗：选中的父工单 id */
  const [materialIssueOrderId, setMaterialIssueOrderId] = useState<string | null>(null);
  /** 关联产品模式：按成品聚合多工单的物料发出（与产品卡片行一致） */
  const [materialIssueForProduct, setMaterialIssueForProduct] = useState<{ productId: string; orders: ProductionOrder[] } | null>(null);

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

  /** 父子工单映射：父工单 id → 子工单列表 */
  const parentToSubOrders = useMemo(() => {
    const map = new Map<string, ProductionOrder[]>();
    displayOrders.filter(o => o.parentOrderId).forEach(o => {
      const pid = o.parentOrderId!;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(o);
    });
    map.forEach(arr => arr.sort((a, b) => orderCreatedMs(b) - orderCreatedMs(a) || (a.orderNumber || '').localeCompare(b.orderNumber || '')));
    return map;
  }, [displayOrders]);

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
    displayOrders.forEach(o => {
      const root = getRootOrderNumber(o.orderNumber || '');
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(o);
    });
    const multi = new Map<string, ProductionOrder[]>();
    map.forEach((arr, root) => { if (arr.length >= 2) multi.set(root, arr); });
    return multi;
  }, [displayOrders, productionLinkMode]);

  /** 列表展示块：单条 或 原单分组（同一计划拆出的多工单） 或 主工单+子工单分组 或 按产品分组（product 模式） */
  const listBlocks = useMemo((): OrderListBlock[] => {
    const pmps = productMilestoneProgresses ?? [];
    if (productionLinkMode === 'product') {
      const byProduct = new Map<string, ProductionOrder[]>();
      for (const order of displayOrders) {
        const pid = order.productId || 'unknown';
        if (!byProduct.has(pid)) byProduct.set(pid, []);
        byProduct.get(pid)!.push(order);
      }
      return Array.from(byProduct.entries())
        .map(([productId, ords]) => {
          const sortedOrds = [...ords].sort(
            (a, b) => orderCreatedMs(b) - orderCreatedMs(a) || (a.orderNumber || '').localeCompare(b.orderNumber || ''),
          );
          return {
            type: 'productGroup' as const,
            productId,
            productName: sortedOrds[0]?.productName || productMap.get(productId)?.name || '未知产品',
            orders: sortedOrds,
          };
        })
        .sort(
          (a, b) =>
            Math.max(0, ...b.orders.map(orderCreatedMs)) - Math.max(0, ...a.orders.map(orderCreatedMs)) ||
            (a.productId || '').localeCompare(b.productId || ''),
        );
    }
    const blocks: OrderListBlock[] = [];
    const used = new Set<string>();
    for (const order of displayOrders) {
      if (used.has(order.id)) continue;
      if (order.parentOrderId) continue;
      const root = getRootOrderNumber(order.orderNumber || '');
      if (rootToOrders.has(root)) {
        const groupOrders = rootToOrders.get(root)!;
        groupOrders.forEach(o => used.add(o.id));
        blocks.push({
          type: 'orderGroup',
          groupKey: root,
          orders: [...groupOrders].sort(
            (a, b) => orderCreatedMs(b) - orderCreatedMs(a) || (a.orderNumber || '').localeCompare(b.orderNumber || ''),
          ),
        });
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
    return blocks.sort(
      (a, b) =>
        blockOrderCreatedMs(b, parentToSubOrders) - blockOrderCreatedMs(a, parentToSubOrders) ||
        blockSortTieId(a).localeCompare(blockSortTieId(b)),
    );
  }, [displayOrders, parentToSubOrders, rootToOrders, productionLinkMode, products, productMap, productMilestoneProgresses]);


  /** 待入库清单：有完成数量即可显示。关联工单：最后一道工序完成量 − 已入库；关联产品：同产品 PMP 最后一道工序完成量按工单（规格）数量占比分摊 − 已入库。 */
  type PendingStockItem = {
    rowKey: string;
    ordersInRow: ProductionOrder[];
    order: ProductionOrder;
    orderTotal: number;
    productBlockOrderTotal: number;
    alreadyIn: number;
    pendingTotal: number;
    alreadyInByVariant: Record<string, number>;
    /** 每规格待入库 = 该规格最后一道工序报工合计 - 该规格已入库（与成衣报工一致） */
    pendingByVariant: Record<string, number>;
    productTotalStockIn?: number;
  };
  const pendingStockOrders = useMemo(
    (): PendingStockItem[] =>
      computePendingStockOrders(orders, prodRecords || [], {
        productionLinkMode,
        productMilestoneProgresses,
      }),
    [orders, prodRecords, productionLinkMode, productMilestoneProgresses],
  );

  /** 待入库清单弹窗 & 选择入库表单 */
  const [showPendingStockModal, setShowPendingStockModal] = useState(false);

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
    setReportModal({
      order,
      milestone: ms,
      productTotalQty: productAggregate?.totalQty,
      productCompletedQty: productAggregate?.completedQty,
      productItems: productAggregate?.items,
      productOrders: productAggregate?.orders
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>生产工单中心</h1>
          <p className={pageSubtitleClass}>追踪各工序节点进度与完工比例</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full sm:w-auto">
          {/* 搜索框：与基础信息检索框量级一致 */}
          <div className="relative w-full sm:w-56 sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="搜索产品、工单号、客户..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {hasOrderPerm('production:orders_form_config:allow') && (
          <button
            type="button"
            onClick={() => setShowOrderFormConfigModal(true)}
            className={secondaryToolbarButtonClass}
          >
            <Sliders className="w-4 h-4 shrink-0" /> 表单配置
          </button>
          )}
          {productionLinkMode === 'product' && (
            <button
              type="button"
              onClick={() => { setOrderFlowProductId(null); setShowOrderFlowModal(true); }}
              className={outlineToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" />
              工单流水
            </button>
          )}
          {hasOrderPerm('production:orders_report_records:view') && (
          <button 
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className={outlineToolbarButtonClass}
          >
            <History className="w-4 h-4 shrink-0" />
            报工流水
          </button>
          )}
          {hasOrderPerm('production:orders_pending_stock_in') && (
          <button
            type="button"
            onClick={() => setShowPendingStockModal(true)}
            className={outlineToolbarButtonClass}
          >
            <ArrowDownToLine className="w-4 h-4 shrink-0" />
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
      </div>

      {!hasOrderPerm('production:orders_list:allow') ? (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看工单列表</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-2">
          {orders.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
              <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">暂无工单数据</p>
            </div>
          ) : (<>
            {listBlocks.map((block) => {
              const renderOrderCard = (order: ProductionOrder, isChild?: boolean, indentPx?: number) => {
                const product = productMap.get(order.productId);
                const totalMilestones = order.milestones.length;
                const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const overallProgress = totalMilestones > 0
                  ? Math.round(
                      (order.milestones.reduce((acc, m) => acc + (m.completedQuantity / orderTotalQty), 0) / totalMilestones) * 100
                    )
                  : 0;
                const cardClass = isChild
                  ? 'bg-white px-5 py-2 rounded-2xl border border-l-4 border-l-slate-300 border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center'
                  : 'bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center';
                return (
                  <div key={order.id} className={cardClass} style={indentPx != null && indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                    <div className="flex items-center gap-4 min-w-0">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => hasOrderPerm('production:orders_detail:view') && setDetailOrderId(order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none block`}>
                          <img loading="lazy" decoding="async" src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
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
                          {product && categoryMap.get(product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
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
                    <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                      {order.status === 'PENDING_PROCESS' ? (
                        <div className="flex items-center gap-3 flex-1">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-50 text-amber-600 border border-amber-200">
                            待配工序
                          </span>
                          {onNavigateToProductEdit && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); onNavigateToProductEdit(order.productId); }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> 去配置工序
                            </button>
                          )}
                        </div>
                      ) : order.milestones.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x -mx-0.5">
                          <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
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
                                  <span className="text-[10px] font-bold text-emerald-600 mb-1 leading-tight truncate w-full text-center">{ms.name}</span>
                                  <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isCompleted ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                    <span className="text-base font-black text-slate-900 leading-none">{currentCompleted}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
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
                                  className={`flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border transition-colors text-left ${
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
                                  className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 hover:border-slate-200 transition-colors cursor-pointer"
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
                            onClick={e => { e.stopPropagation(); setMaterialIssueForProduct(null); setMaterialIssueOrderId(order.id); }}
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
                    <div className="p-3 space-y-2">
                      {groupOrders.map(order => (
                        <div key={order.id}>{renderOrderCard(order)}</div>
                      ))}
                    </div>
                  </div>
                );
              }
              if (block.type === 'productGroup') {
                const product = productMap.get(block.productId);
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
                        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-2 hover:shadow-lg hover:border-indigo-200 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center">
                          <div className="flex items-center gap-4 min-w-0">
                            {product?.imageUrl ? (
                              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                                <img loading="lazy" decoding="async" src={product.imageUrl} alt={block.productName} className="w-full h-full object-cover block" />
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
                          <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                            {Array.from(byTemplate.entries()).length > 0 ? (
                              <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden -mx-0.5">
                                <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
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
                                        className={`flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border transition-colors ${
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
                                        <span className="text-[10px] font-bold text-emerald-600 mb-1 leading-tight truncate w-full text-center">{m.name}</span>
                                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                          <span className="text-base font-black text-slate-900 leading-none">{m.completed}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
                                          <span>{availDisplay} / <span className={remaining <= 0 && m.completed === 0 ? '' : remaining < 0 ? 'text-rose-500' : ''}>{remainingDisplay}</span></span>
                                        </div>
                                      </button>
                                    ) : (
                                      <div key={tid} className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 bg-slate-50 rounded-xl border border-slate-100">
                                        <span className="text-[10px] font-bold text-emerald-600 mb-1 leading-tight truncate w-full text-center">{m.name}</span>
                                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                          <span className="text-base font-black text-slate-900 leading-none">{m.completed}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
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
                  <div className="p-2.5 space-y-1.5">
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
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
                <span className="text-xs text-slate-400">共 {totalOrders} 条，第 {currentPage} / {totalPages} 页</span>
                <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">上一页</button>
                <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">下一页</button>
              </div>
            )}
          </>)}
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
            <div className="flex-1 overflow-auto p-4">
              <OrderFlowView orders={orders} products={products} embedded productionLinkMode={productionLinkMode} initialProductId={orderFlowProductId} onOpenOrderDetail={(id) => setDetailOrderId(id)} />
            </div>
          </div>
        </div>
      )}

      {showOrderFormConfigModal && (
        <OrderFormConfigModal
          onClose={() => setShowOrderFormConfigModal(false)}
          orderFormSettings={orderFormSettings}
          onUpdateOrderFormSettings={onUpdateOrderFormSettings}
        />
      )}

      {reportModal && (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && (
        <ReportModal
          reportModal={reportModal}
          open={true}
          onClose={() => setReportModal(null)}
          onReportSubmit={onReportSubmit}
          onReportSubmitProduct={onReportSubmitProduct}
          products={products}
          categories={categories}
          globalNodes={globalNodes}
          workers={workers}
          equipment={equipment}
          dictionaries={dictionaries}
          processSequenceMode={processSequenceMode}
          allowExceedMaxReportQty={allowExceedMaxReportQty}
          productionLinkMode={productionLinkMode}
          orders={orders}
          productMilestoneProgresses={productMilestoneProgresses}
          prodRecords={prodRecords}
        />
      )}

      <ReportHistoryModal
        open={showHistoryModal}
        onClose={() => { setShowHistoryModal(false); setReportDetailBatch(null); }}
        orders={orders}
        products={products}
        globalNodes={globalNodes}
        dictionaries={dictionaries}
        productionLinkMode={productionLinkMode}
        productMilestoneProgresses={productMilestoneProgresses}
        prodRecords={prodRecords}
        onOpenBatchDetail={(batch) => setReportDetailBatch(batch)}
      />

      {/* 待入库清单弹窗 */}
      <PendingStockPanel
        open={showPendingStockModal}
        onClose={() => setShowPendingStockModal(false)}
        orders={orders}
        products={products}
        categories={categories}
        globalNodes={globalNodes}
        prodRecords={prodRecords}
        warehouses={warehouses}
        dictionaries={dictionaries}
        boms={boms}
        productMilestoneProgresses={productMilestoneProgresses}
        productionLinkMode={productionLinkMode}
        processSequenceMode={processSequenceMode}
        onAddRecord={onAddRecord}
        onAddRecordBatch={onAddRecordBatch}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      {reportDetailBatch && (
        <ReportBatchDetailModal
          batch={reportDetailBatch as any}
          onClose={() => setReportDetailBatch(null)}
          orders={orders}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          globalNodes={globalNodes}
          workers={workers}
          prodRecords={prodRecords}
          productMilestoneProgresses={productMilestoneProgresses}
          processSequenceMode={processSequenceMode}
          productionLinkMode={productionLinkMode}
          onUpdateReport={onUpdateReport}
          onDeleteReport={onDeleteReport}
          onUpdateReportProduct={onUpdateReportProduct}
          onDeleteReportProduct={onDeleteReportProduct}
          onUpdateProduct={onUpdateProduct}
          hasOrderPerm={hasOrderPerm}
        />
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

      {reworkDetailOrderId && (
        <ReworkDetailModal
          orderId={reworkDetailOrderId}
          onClose={() => setReworkDetailOrderId(null)}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          prodRecords={prodRecords}
          reworkStatsByOrderId={reworkStatsByOrderId}
        />
      )}

      {reworkDetailProductId && productionLinkMode === "product" && (
        <ReworkDetailProductModal
          productId={reworkDetailProductId}
          onClose={() => setReworkDetailProductId(null)}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          prodRecords={prodRecords}
          productMilestoneProgresses={productMilestoneProgresses}
          reworkRemainingAtNode={reworkRemainingAtNode}
        />
      )}

      {onAddRecord && (materialIssueOrderId || materialIssueForProduct) && (
        <MaterialIssueModal
          orderId={materialIssueForProduct ? null : materialIssueOrderId}
          forProduct={materialIssueForProduct}
          orders={orders}
          products={products}
          boms={boms}
          warehouses={warehouses}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          prodRecords={prodRecords}
          productionLinkMode={productionLinkMode}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onClose={() => {
            setMaterialIssueOrderId(null);
            setMaterialIssueForProduct(null);
          }}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
        />
      )}
    </div>
  );
};

export default React.memo(OrderListView);
