
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Clock, Layers, Plus, History, User, Sliders, X, FileText, ChevronDown, ChevronRight, ScrollText, Pencil, Search, Package, RotateCcw, ArrowDownToLine, Split } from 'lucide-react';
import {
  ProductionOrder,
  MilestoneStatus,
  Milestone,
  Product,
  GlobalNodeTemplate,
  OrderFormSettings,
  PlanFormSettings,
  PlanOrder,
  PrintTemplate,
  ProductCategory,
  AppDictionaries,
  Partner,
  PartnerCategory,
  OutsourceFormSettings,
  BOM,
  ProductionOpRecord,
  Worker,
  ProductMilestoneProgress,
  ProcessSequenceMode,
  Warehouse,
  OrderDispatchStatus,
} from '../types';
import { getOrderDispatchStatusStyle } from '../utils/dispatchStatusStyle';
import {
  buildOrderDispatchToggleConfirmMessage,
  ORDER_DISPATCH_STATUS_CONFIRM_TITLE,
} from '../utils/orderDispatchStatusConfirm';
import PlanProductDetail from './plan-order-list/PlanProductDetail';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getRootOrderNumber, reworkRemainingAtNode } from '../utils/orderListHelpers';
import { useQuery } from '@tanstack/react-query';
import { fetchProductionByFilter } from './production-ops/sharedFlowListHelpers';
import { orders as ordersApi, production as productionApi } from '../services/api';
import { normalizeDecimals } from '../contexts/formSettingsDefaults';
import OrderDetailModal from './OrderDetailModal';
import ProductProductionDetailModal from './order-list/ProductProductionDetailModal';
import OrderFlowView from './OrderFlowView';
import PendingStockPanel from './order-list/PendingStockPanel';
import MaterialIssueModal from './order-list/MaterialIssueModal';
import ReportModal from './order-list/ReportModal';
import ReportHistoryModal, { type ReportHistoryInitialSeed } from './order-list/ReportHistoryModal';
import ReportBatchDetailModal from './order-list/ReportBatchDetailModal';
import OrderFormConfigModal from './order-list/OrderFormConfigModal';
import ReworkDetailModal from './order-list/ReworkDetailModal';
import ReworkDetailProductModal from './order-list/ReworkDetailProductModal';
import {
  sumBlockOrderQty,
  pmpCompletedAtTemplate,
  productGroupMaxReportableSum,
} from '../utils/productReportAggregates';
import { getProductCategoryCustomFieldEntries } from '../utils/reportCustomDocField';
import { computePendingStockOrders } from '../utils/pendingStockCompute';
import { buildDefectiveReworkByOrderMilestone } from '../utils/defectiveReworkByOrderMilestone';
import { toLocalDateYmd } from '../utils/localDateTime';
import {
  formConfigToolbarButtonClass,
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../styles/uiDensity';
import { useConfirm } from '../contexts/ConfirmContext';
import {
  blockOrderCreatedMs,
  blockSortTieId,
  orderCreatedMs,
  type OrderCenterListBlock as OrderListBlock,
} from '../utils/orderCenterSort';
import { buildOutOfSequenceTemplateIds, findGatingPredecessorIndex, isProcessSequential } from '../shared/processSequence';

interface OrderListViewProps {
  productionLinkMode?: 'order' | 'product';
  processSequenceMode?: ProcessSequenceMode;
  allowExceedMaxReportQty?: boolean;
  allowExceedMaxStockInQty?: boolean;
  orders: ProductionOrder[];
  /** 打印模版管理弹窗预览用；可传空数组 */
  plans?: PlanOrder[];
  products: Product[];
  workers?: Worker[];
  equipment?: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories?: PartnerCategory[];
  outsourceFormSettings?: OutsourceFormSettings;
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  /** 计划单列表显示配置；用于工单模式下「交期」列是否与「显示交货日期」联动 */
  planFormSettings?: PlanFormSettings;
  orderFormSettings: OrderFormSettings;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  warehouses?: Warehouse[];
  onUpdateOrderFormSettings: (settings: OrderFormSettings) => void | Promise<void>;
  onRefreshGlobalNodes: () => Promise<void>;
  onReportSubmit?: (orderId: string, milestoneId: string, quantity: number, customData: any, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => void;
  onUpdateOrder?: (orderId: string, updates: Partial<ProductionOrder>) => void;
  /**
   * 关联工单模式：手动切换工单派发完成状态徽章（进行中 ↔ 已完成）。
   * 调用后端 PATCH /api/orders/:id/dispatch-status，会同时把 `dispatchStatusManual=true`，
   * 自动入库逻辑不再覆盖该工单。无传入或产品模式下徽章只读，不可点击。
   */
  onUpdateOrderDispatchStatus?: (orderId: string, status: OrderDispatchStatus) => void | Promise<void>;
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
  customData?: Record<string, any>;
  weight?: number | null;
};

interface OrderListViewExtendedProps extends OrderListViewProps {
  initialDetailOrderId?: string | null;
  /** 关闭工单详情弹窗时由父组件清除 location.state 中的 detailOrderId，避免切 tab 再回来时弹窗再次打开 */
  onClearDetailOrderIdFromState?: () => void;
  onUpdateReport?: (params: ReportUpdateParams) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => Promise<Product | null>;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  productMilestoneProgresses?: ProductMilestoneProgress[];
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, quantity: number, customData: any, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, any>; weight?: number | null }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  onNavigateToProductEdit?: (productId: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const OrderListView: React.FC<OrderListViewExtendedProps> = ({
  productionLinkMode = 'order',
  processSequenceMode = 'sequential',
  allowExceedMaxReportQty = false,
  allowExceedMaxStockInQty = false,
  initialDetailOrderId,
  onClearDetailOrderIdFromState,
  orders,
  plans = [],
  products,
  workers = [],
  equipment = [],
  categories,
  dictionaries,
  partners,
  partnerCategories = [],
  outsourceFormSettings,
  boms,
  globalNodes,
  planFormSettings,
  orderFormSettings,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  warehouses = [],
  onUpdateOrderFormSettings,
  onRefreshGlobalNodes,
  onReportSubmit,
  onUpdateOrder,
  onUpdateOrderDispatchStatus,
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
  /**
   * 主列表「工序圈圈」点击报工的门控：受角色「报工流水 · 添加」复选框
   * （`production:orders_report_records:create`）控制。
   * owner / 无细粒度配置 / 持有裸 `production` 模块键者放行；否则必须勾选该项才允许报工。
   */
  const hasProcessReportPerm = (): boolean => {
    if (_isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes('production')) return true;
    return userPermissions.includes('production:orders_report_records:create');
  };
  const confirm = useConfirm();
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  /** 「不按顺序生产」工序 id 集合：全局恒按顺序，这些工序例外，可按工单总量报工 */
  const outOfSequenceTemplateIds = useMemo(() => buildOutOfSequenceTemplateIds(globalNodes), [globalNodes]);

  const [detailOrderId, setDetailOrderId] = useState<string | null>(initialDetailOrderId ?? null);
  /** 产品模式下产品组「详情」 */
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  /** 是否从「工单流水」打开详情；两种模式下均启用 detailFromFlowLayout 单工单流水布局 */
  const [orderDetailFromFlow, setOrderDetailFromFlow] = useState(false);
  const openOrderDetail = useCallback((orderId: string, fromOrderFlow = false) => {
    setDetailOrderId(orderId);
    setOrderDetailFromFlow(fromOrderFlow);
  }, []);
  const openProductDetail = useCallback((productId: string) => {
    setDetailProductId(productId);
  }, []);
  const closeOrderDetail = useCallback(() => {
    setDetailOrderId(null);
    setOrderDetailFromFlow(false);
    onClearDetailOrderIdFromState?.();
  }, [onClearDetailOrderIdFromState]);
  const closeProductDetail = useCallback(() => {
    setDetailProductId(null);
  }, []);
  const [showOrderFlowModal, setShowOrderFlowModal] = useState(false);
  /** 从产品卡片打开工单流水时传入，用于预填搜索筛选 */
  const [orderFlowProductId, setOrderFlowProductId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  /** 从工单详情打开报工流水时预填筛选 */
  const [reportHistorySeed, setReportHistorySeed] = useState<ReportHistoryInitialSeed | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const PAGE_SIZE = 20;
  const [fetchedOrders, setFetchedOrders] = useState<ProductionOrder[]>([]);
  const fetchGenRef = useRef(0);

  const onlyShowNotCompletedOrders =
    productionLinkMode === 'order' && orderFormSettings.listDisplay?.onlyShowNotCompleted === true;

  const fetchPagedOrders = useCallback(async (page: number, searchTerm: string, excludeCompleted: boolean) => {
    const gen = ++fetchGenRef.current;
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
      if (searchTerm) params.search = searchTerm;
      if (excludeCompleted) params.excludeCompleted = 'true';
      const result = await ordersApi.listPaginated(params);
      if (gen !== fetchGenRef.current) return;
      const data = Array.isArray(result) ? (result as unknown as ProductionOrder[]) : ((result?.data ?? []) as ProductionOrder[]);
      const total = Array.isArray(result) ? data.length : (result?.total ?? 0);
      setFetchedOrders(data);
      setTotalOrders(total);
    } catch (e) {
      console.error('Failed to fetch paginated orders', e);
    }
  }, []);

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, onlyShowNotCompletedOrders]);
  // 条数变化（下达工单、删单等）须重拉当前页；条数不变时仅依赖下方 displayOrders 与 context 按 id 合并，避免每次报工都触发分页请求
  useEffect(() => {
    fetchPagedOrders(currentPage, debouncedSearch, onlyShowNotCompletedOrders);
  }, [currentPage, debouncedSearch, onlyShowNotCompletedOrders, fetchPagedOrders, orders.length]);

  /** 分页接口的工单与上下文 orders 合并：报工后父级会更新 orders，避免列表仍显示旧工序完成量 */
  const displayOrders = useMemo(() => {
    const usePaged = fetchedOrders.length > 0 || Boolean(debouncedSearch) || currentPage > 1;
    if (!usePaged) return orders;
    const byId = new Map(orders.map(o => [o.id, o]));
    return fetchedOrders.map(o => byId.get(o.id) ?? o);
  }, [fetchedOrders, orders, debouncedSearch, currentPage]);

  /** 工单中心：按当前列表涉及工单 + 产品窄拉生产流水（避免父级全量 refreshProdRecords） */
  const ORDER_CENTER_PRODUCTION_TYPES = 'REWORK,OUTSOURCE,REWORK_REPORT,STOCK_IN';
  const narrowOrderIdsForProd = useMemo(() => {
    const ids = new Set<string>();
    for (const o of displayOrders) {
      ids.add(o.id);
      if (o.parentOrderId) ids.add(o.parentOrderId);
    }
    for (const o of displayOrders) {
      for (const c of orders) {
        if (c.parentOrderId === o.id) ids.add(c.id);
      }
    }
    return [...ids];
  }, [displayOrders, orders]);

  const narrowProductIdsForProd = useMemo(() => {
    const s = new Set<string>();
    displayOrders.forEach(o => {
      if (o.productId) s.add(o.productId);
    });
    return [...s];
  }, [displayOrders]);

  const orderCenterProdQuery = useQuery({
    queryKey: [
      'orderCenterProdNarrow',
      ORDER_CENTER_PRODUCTION_TYPES,
      narrowOrderIdsForProd.join('\n'),
      narrowProductIdsForProd.join('\n'),
      orders.length,
    ],
    enabled: narrowOrderIdsForProd.length > 0 || narrowProductIdsForProd.length > 0,
    queryFn: async (): Promise<ProductionOpRecord[]> => {
      const acc: ProductionOpRecord[] = [];
      let page = 1;
      const pageSize = 200;
      for (;;) {
        const params: Record<string, string> = {
          page: String(page),
          pageSize: String(pageSize),
          types: ORDER_CENTER_PRODUCTION_TYPES,
        };
        if (narrowOrderIdsForProd.length) params.orderIds = narrowOrderIdsForProd.join(',');
        if (narrowProductIdsForProd.length) params.productIds = narrowProductIdsForProd.join(',');
        const res = await productionApi.listPage(params);
        const chunk = Array.isArray(res) ? (res as ProductionOpRecord[]) : ((res?.data ?? []) as ProductionOpRecord[]);
        acc.push(...chunk);
        const total = Array.isArray(res) ? chunk.length : (res?.total ?? 0);
        if (chunk.length < pageSize || acc.length >= total) break;
        page += 1;
        if (page > 40) break;
      }
      return normalizeDecimals(acc);
    },
    staleTime: 15_000,
  });

  const effectiveProdRecords = useMemo((): ProductionOpRecord[] => {
    if (!orderCenterProdQuery.isSuccess) return [];
    return orderCenterProdQuery.data ?? [];
  }, [orderCenterProdQuery.isSuccess, orderCenterProdQuery.data]);

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
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');
  const [showOrderFormConfigModal, setShowOrderFormConfigModal] = useState(false);
  /** 打开工单表单配置时默认页签（工具栏为字段；详情「增加打印模版」为打印） */
  const [orderFormConfigEntryTab, setOrderFormConfigEntryTab] = useState<'fields' | 'print'>('fields');
  const openOrderFormPrintTab = useCallback(() => {
    setOrderFormConfigEntryTab('print');
    void onRefreshPrintTemplates?.();
    setShowOrderFormConfigModal(true);
  }, [onRefreshPrintTemplates]);
  /** 每次打开报工弹窗递增，用于 ReportModal key，避免关闭再开后仍保留上次输入/旧默认值表现 */
  const [reportModalSession, setReportModalSession] = useState(0);
  const [reportModal, setReportModal] = useState<{
    order: ProductionOrder;
    milestone: Milestone;
    /** 关联产品模式：产品级总量与完成量，用于弹窗展示 */
    productTotalQty?: number;
    productCompletedQty?: number;
    /** 顺序工序模式下该工序实际可报基数（扣不良+返工后），用于提示文案 */
    productMaxReportableQty?: number;
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

  // reworkRemainingAtNode / getRootOrderNumber 已抽离至 utils/orderListHelpers.ts

  /** 按单 + 目标工序聚合返工统计（工单中心返工详情弹窗用）；顺序模式下 pendingQty = 按路径上道完成后的可报数 */
  const reworkStatsByOrderId = useMemo(() => {
    if (productionLinkMode !== 'order') return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    const reworkRecords = effectiveProdRecords.filter(r => r.type === 'REWORK');
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    displayOrders.forEach(order => {
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
          cur.pendingSeq += reworkRemainingAtNode(r, nodeId, processSequenceMode, outOfSequenceTemplateIds);
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
  }, [productionLinkMode, effectiveProdRecords, displayOrders, globalNodes, processSequenceMode, outOfSequenceTemplateIds]);

  const showInList = (id: string) => orderFormSettings.standardFields.find(f => f.id === id)?.showInList ?? false;

  /**
   * 关联产品模式下，PMP 没有 orderId 字段（详见 docs/05-production-link-mode.md），
   * 工单卡圆心若只读 milestone.completedQuantity，会让产品池上的进度在工单卡上完全消失，
   * 用户从弹窗（混读 PMP+milestone）退出回列表时数字突变。
   *
   * 这里按 `items.quantity` 比例把 PMP 摊回到工单卡——这是**估算值**，并非真实归属（PMP 设计上
   * 不可逆向归属到具体工单）。`tooltip` 中会标注"估算"，避免用户误以为这是精确数据。
   */
  const pmpCompletedByProductTpl = useMemo(() => {
    const m = new Map<string, number>();
    (productMilestoneProgresses ?? []).forEach(p => {
      const k = `${p.productId}|${p.milestoneTemplateId}`;
      m.set(k, (m.get(k) ?? 0) + (p.completedQuantity ?? 0));
    });
    return m;
  }, [productMilestoneProgresses]);

  const productOrdersTotalQtyByPid = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      const total = o.items.reduce((s, i) => s + i.quantity, 0);
      m.set(o.productId, (m.get(o.productId) ?? 0) + total);
    }
    return m;
  }, [orders]);

  /**
   * 工序级外协「已发未收回」聚合（用于列表小卡 tooltip 与剩余口径，与 ReportModal 对齐）。
   *
   * 排除 `sourceReworkId`（返工触发的外协计入返工链路，不影响主进度）。
   * - `outsourceNetByOrderTpl`：按 `orderId|templateId`，对应工单维度发出的未收回数（order 模式 + 历史遗留）。
   * - `outsourceNetByProductTpl`：按 `productId|templateId`，对应产品维度发出的未收回数（product 模式无 orderId）。
   *
   * 工单卡（product 模式）按 `items.quantity` 比例摊回 product 维度数据，与 PMP 摊回口径对称；
   * 产品组卡直接合并两个维度的未收回数。
   */
  const outsourceNetByOrderTpl = useMemo(() => {
    const m = new Map<string, number>();
    (effectiveProdRecords ?? [])
      .filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.orderId && r.nodeId)
      .forEach(r => {
        const k = `${r.orderId}|${r.nodeId}`;
        const cur = m.get(k) ?? 0;
        if (r.status === '加工中') m.set(k, cur + (r.quantity ?? 0));
        else if (r.status === '已收回') m.set(k, cur - (r.quantity ?? 0));
      });
    for (const [k, v] of m) m.set(k, Math.max(0, v));
    return m;
  }, [effectiveProdRecords]);

  const outsourceNetByProductTpl = useMemo(() => {
    const m = new Map<string, number>();
    (effectiveProdRecords ?? [])
      .filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId && !r.orderId && r.productId && r.nodeId)
      .forEach(r => {
        const k = `${r.productId}|${r.nodeId}`;
        const cur = m.get(k) ?? 0;
        if (r.status === '加工中') m.set(k, cur + (r.quantity ?? 0));
        else if (r.status === '已收回') m.set(k, cur - (r.quantity ?? 0));
      });
    for (const [k, v] of m) m.set(k, Math.max(0, v));
    return m;
  }, [effectiveProdRecords]);

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

  // getRootOrderNumber 已抽离至 utils/orderListHelpers.ts

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
  /**
   * 角标和弹窗内笔数共用同一口径：
   * - orders 用全量（不收窄到 displayOrders）；
   * - STOCK_IN 也用按 panel 内 orderIds + productIds 自取的"全量 STOCK_IN"
   *   （不依赖 `effectiveProdRecords` — 它按 `displayOrders` 收窄，跨页 / 跨搜索后会把
   *   不在当前列表页的工单的"已入库"算成 0，导致 pending 永远扣不下来、角标和弹窗对不上）。
   *
   * 该 query 与 `PendingStockPanel.pendingStockInQuery` 同前缀 `pendingStockPanel.stockIn`，
   * 写入后 `invalidateAllProdRecords` 会一并刷新。
   */
  const allOrderIdsForPending = useMemo(
    () => orders.map(o => o.id).filter(Boolean).join(','),
    [orders],
  );
  const allProductIdsForPending = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) if (o.productId) s.add(o.productId);
    return [...s].join(',');
  }, [orders]);
  const pendingStockInQuery = useQuery({
    queryKey: ['pendingStockPanel.stockIn', allOrderIdsForPending, allProductIdsForPending],
    queryFn: () =>
      fetchProductionByFilter({
        type: 'STOCK_IN',
        orderIds: allOrderIdsForPending || undefined,
        productIds: allProductIdsForPending || undefined,
      }),
    enabled: allOrderIdsForPending.length > 0 || allProductIdsForPending.length > 0,
    staleTime: 15_000,
  });
  const pendingStockSourceRecords = useMemo<ProductionOpRecord[]>(() => {
    const local = pendingStockInQuery.data;
    if (Array.isArray(local) && local.length > 0) return local;
    return effectiveProdRecords ?? [];
  }, [pendingStockInQuery.data, effectiveProdRecords]);
  const pendingStockOrders = useMemo(
    (): PendingStockItem[] =>
      computePendingStockOrders(orders, pendingStockSourceRecords, {
        productionLinkMode,
        productMilestoneProgresses,
      }),
    [orders, pendingStockSourceRecords, productionLinkMode, productMilestoneProgresses],
  );

  /** 待入库清单弹窗 & 选择入库表单 */
  const [showPendingStockModal, setShowPendingStockModal] = useState(false);

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(displayOrders, effectiveProdRecords),
    [displayOrders, effectiveProdRecords]
  );

  const getDefectiveRework = (orderId: string, templateId: string) => defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

  /** 顺序模式下：判断某工单某工序是否允许报工（上游最近按顺序工序有报工，或上游无按顺序工序则放开；脱链工序恒允许） */
  const canReportMilestone = (order: ProductionOrder, ms: Milestone): boolean => {
    if (!isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) return true;
    const idx = order.milestones.findIndex(m => m.id === ms.id);
    const templateIds = order.milestones.map(m => m.templateId);
    const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
    if (gateIdx < 0) return true;
    const prev = order.milestones[gateIdx];
    if (!prev) return true;
    const hasReports = (prev.reports && prev.reports.length > 0) || prev.completedQuantity > 0;
    return hasReports;
  };

  const handleOpenReport = (
    order: ProductionOrder,
    ms: Milestone,
    productAggregate?: { totalQty: number; completedQty: number; maxReportableQty?: number; orders: ProductionOrder[]; items?: { variantId?: string; quantity: number; completedQuantity: number }[] }
  ) => {
    if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
      const idx = order.milestones.findIndex(m => m.id === ms.id);
      const templateIds = order.milestones.map(m => m.templateId);
      const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
      if (gateIdx >= 0) {
        const blockOrders = productAggregate?.orders ?? [order];
        const prevTid = order.milestones[gateIdx].templateId;
        const prevDone =
          productionLinkMode === 'product' && productMilestoneProgresses.length > 0
            ? pmpCompletedAtTemplate(productMilestoneProgresses, order.productId, prevTid)
            : order.milestones[gateIdx].completedQuantity ?? 0;
        const blockQty = sumBlockOrderQty(blockOrders);
        const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
        const prevAlloc =
          productionLinkMode === 'product' && productMilestoneProgresses.length > 0 && blockQty > 0
            ? (orderQty * prevDone) / blockQty
            : prevDone;
        const prevReady =
          (order.milestones[gateIdx].completedQuantity ?? 0) > 0 || prevAlloc > 0;
        if (!canReportMilestone(order, ms) && !prevReady) return;
      } else if (!canReportMilestone(order, ms)) return;
    }
    if (!onReportSubmit && !(productionLinkMode === 'product' && onReportSubmitProduct)) return;
    setReportModalSession(s => s + 1);
    setReportModal({
      order,
      milestone: ms,
      productTotalQty: productAggregate?.totalQty,
      productCompletedQty: productAggregate?.completedQty,
      productMaxReportableQty: productAggregate?.maxReportableQty,
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
            onClick={() => {
              setOrderFormConfigEntryTab('fields');
              setShowOrderFormConfigModal(true);
            }}
            className={formConfigToolbarButtonClass}
          >
            <Sliders className="w-4 h-4 shrink-0" /> 表单配置
          </button>
          )}
          <button
            type="button"
            onClick={() => { setOrderFlowProductId(null); setShowOrderFlowModal(true); }}
            className={outlineToolbarButtonClass}
          >
            <ScrollText className="w-4 h-4 shrink-0" />
            工单流水
          </button>
          {hasOrderPerm('production:orders_report_records:view') && (
          <button 
            type="button"
            onClick={() => { setReportHistorySeed(null); setShowHistoryModal(true); }}
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
            待入库清单{pendingStockOrders.length > 0 ? `（${pendingStockOrders.length}）` : ''}
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
                /**
                 * 产品上是否已绑工序模板（产品管理里的工序顺序）。
                 * 协作接受派发时若产品无工序，后端可能从「同产品旧工单」复制 milestones 到本单，此时工单上有圆点但产品仍为未配置，
                 * 必须仍提示「去配置工序」，否则列表只显示工序条、用户找不到入口（如万濮服饰毛衣 10 类场景）。
                 */
                const productHasMilestoneTemplate = (product?.milestoneNodeIds?.length ?? 0) > 0;
                const showConfigureProcessHint =
                  order.status === 'PENDING_PROCESS' ||
                  (product != null && !productHasMilestoneTemplate);
                const cardClass = isChild
                  ? 'bg-white px-5 py-2 rounded-2xl border border-l-4 border-l-slate-300 border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center'
                  : 'bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center';
                return (
                  <div key={order.id} className={cardClass} style={indentPx != null && indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                    <div className="flex items-center gap-4 min-w-0">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => hasOrderPerm('production:orders_detail:view') && openOrderDetail(order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none block`}>
                          <img loading="lazy" decoding="async" src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => hasOrderPerm('production:orders_detail:view') && openOrderDetail(order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors`}>
                          <Layers className={isChild ? 'w-6 h-6' : 'w-7 h-7'} />
                        </button>
                      )}
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{order.orderNumber}</span>
                          {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子工单</span>}
                          {/*
                            关联工单模式专属：派发完成状态徽章。
                            - dispatchStatus 由后端 STOCK_IN 入库累计自动推进（manual=false 时）。
                            - 点击切换：进行中 ↔ 已完成；后端会持久化 manual=true，自动逻辑不再覆盖。
                            - 无 onUpdateOrderDispatchStatus 或无 edit 权限时只读展示。
                            - 产品模式不展示徽章（与计划单列表保持一致）。
                          */}
                          {productionLinkMode === 'order' && (() => {
                            const dispatchStyle = getOrderDispatchStatusStyle(order.dispatchStatus);
                            const canToggle = !!onUpdateOrderDispatchStatus && hasOrderPerm('production:orders_detail:edit');
                            const currentLabel = dispatchStyle.label;
                            const nextStatus =
                              order.dispatchStatus === OrderDispatchStatus.COMPLETED
                                ? OrderDispatchStatus.IN_PROGRESS
                                : OrderDispatchStatus.COMPLETED;
                            const badgeClass = `text-[10px] font-bold px-2 py-0.5 rounded ${dispatchStyle.className}`;
                            const tooltip = canToggle
                              ? '点击切换状态（手动覆盖后自动入库不再修改本工单）'
                              : `派发完成状态：${currentLabel}`;
                            return canToggle ? (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  /**
                                   * 切换前二次确认：
                                   * - 手动覆盖将使该工单的「自动入库推进」失效（dispatchStatusManual=true）；
                                   * - 后续即使继续 STOCK_IN 入库或删除入库记录，系统也不会再自动修改本工单 dispatchStatus。
                                   *   该行为不可由 UI 撤销（如需恢复自动判定需后端重置 manual 标记）。
                                   */
                                  const ok = await confirm({
                                    title: ORDER_DISPATCH_STATUS_CONFIRM_TITLE,
                                    message: buildOrderDispatchToggleConfirmMessage(
                                      order.orderNumber,
                                      order.dispatchStatus ?? OrderDispatchStatus.IN_PROGRESS,
                                      nextStatus,
                                    ),
                                    confirmText: '确认切换',
                                    cancelText: '取消',
                                  });
                                  if (!ok) return;
                                  await onUpdateOrderDispatchStatus!(order.id, nextStatus);
                                }}
                                className={`${badgeClass} cursor-pointer hover:opacity-80 transition-opacity`}
                                title={tooltip}
                              >
                                {currentLabel}
                              </button>
                            ) : (
                              <span className={badgeClass} title={tooltip}>
                                {currentLabel}
                              </span>
                            );
                          })()}
                          <button type="button" onClick={(e) => { e.stopPropagation(); product && setViewProductId(product.id); }} className={`text-left font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors ${isChild ? 'text-sm' : 'text-base'}`}>
                            {order.productName || '未知产品'}
                          </button>
                          <span className="text-[10px] font-bold text-slate-500">{order.sku}</span>
                        </div>
                        <div className="mb-1 flex flex-wrap items-center gap-1">
                          {product &&
                            getProductCategoryCustomFieldEntries(product, categoryMap.get(product.categoryId), {
                              includeFile: false,
                            }).map(({ field, display }) => (
                              <span
                                key={field.id}
                                className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50"
                              >
                                {field.label}: {display}
                              </span>
                            ))}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          {productionLinkMode !== 'product' &&
                            (order.customer ?? '').trim() !== '' &&
                            (planFormSettings?.standardFields?.find(f => f.id === 'customer')?.showInList ?? false) && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" /> {order.customer}
                              </span>
                            )}
                          <span className="inline-flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>
                            {productionLinkMode !== 'product' &&
                              planFormSettings?.listDisplay?.showDeliveryDate === true &&
                              order.dueDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> 交货日期: {toLocalDateYmd(order.dueDate) || order.dueDate}
                              </span>
                            )}
                          </span>
                          {showInList('startDate') && order.startDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> 开始: {toLocalDateYmd(order.startDate) || order.startDate}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                      <div className="flex flex-col gap-2 flex-1 min-w-0 min-h-0">
                        {showConfigureProcessHint ? (
                          <div className="flex flex-col sm:flex-row sm:items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2">
                            <div className="flex items-center gap-3 flex-wrap shrink-0">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-50 text-amber-600 border border-amber-200">
                                待配工序
                              </span>
                              {onNavigateToProductEdit && (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); onNavigateToProductEdit(order.productId); }}
                                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors"
                                >
                                  <Pencil className="w-3 h-3" /> 去配置工序
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] font-medium text-slate-600 leading-snug flex-1 min-w-0">
                              {order.milestones.length > 0
                                ? '工单上的工序来自历史工单复制，本产品仍未在产品管理中绑定工序，请先配置后再稳定报工。'
                                : '本企业产品尚未配置工序，无法报工。请到「资料与配置 → 产品管理」为该产品添加工序。'}
                            </p>
                          </div>
                        ) : null}
                        {order.milestones.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x -mx-0.5">
                          <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
                            {/* 产品模式：按工单 items.quantity 比例摊回 PMP（估算，详见 pmpCompletedByProductTpl 注释） */}
                            {order.milestones.map((ms) => {
                              const isCompleted = ms.status === MilestoneStatus.COMPLETED;
                              const canReport = !!onReportSubmit && canReportMilestone(order, ms);
                              const productTotalAcrossOrders = productionLinkMode === 'product'
                                ? (productOrdersTotalQtyByPid.get(order.productId) ?? orderTotalQty)
                                : orderTotalQty;
                              const shareRatio = productionLinkMode === 'product' && productTotalAcrossOrders > 0
                                ? orderTotalQty / productTotalAcrossOrders
                                : 0;
                              const pmpShareAt = (templateId: string) => {
                                if (productionLinkMode !== 'product' || shareRatio <= 0) return 0;
                                const total = pmpCompletedByProductTpl.get(`${order.productId}|${templateId}`) ?? 0;
                                return total * shareRatio;
                              };
                              const pmpShareCur = pmpShareAt(ms.templateId);
                              const currentCompletedRaw = ms.completedQuantity + pmpShareCur;
                              const currentCompleted = Math.round(currentCompletedRaw);
                              let baseQty = orderTotalQty;
                              if (isProcessSequential(processSequenceMode, ms.templateId, outOfSequenceTemplateIds)) {
                                const idx = order.milestones.findIndex(m => m.id === ms.id);
                                const templateIds = order.milestones.map(m => m.templateId);
                                const gateIdx = findGatingPredecessorIndex(templateIds, idx, outOfSequenceTemplateIds);
                                if (gateIdx >= 0) {
                                  const prev = order.milestones[gateIdx];
                                  const pmpSharePrev = pmpShareAt(prev.templateId);
                                  baseQty = (prev?.completedQuantity ?? 0) + pmpSharePrev;
                                }
                              }
                              const { defective, rework } = getDefectiveRework(order.id, ms.templateId);
                              const availableQty = Math.max(0, Math.round(baseQty - defective + rework));
                              const remaining = availableQty - currentCompleted;
                              /**
                               * 小卡圆下的 `availableQty / remaining` 数字保持原口径（不扣外协），
                               * 仅在 hover tooltip 上**额外**追加"外协剩余 X 件"，与 ReportModal 的"扣外协"剩余口径互补。
                               * `product` 模式下产品维度外协按 `shareRatio` 摊回（与 PMP 摊回对称）。
                               */
                              const outsourceShareCurRaw =
                                (outsourceNetByOrderTpl.get(`${order.id}|${ms.templateId}`) ?? 0) +
                                (productionLinkMode === 'product'
                                  ? (outsourceNetByProductTpl.get(`${order.productId}|${ms.templateId}`) ?? 0) * shareRatio
                                  : 0);
                              const outsourceShareCur = Math.max(0, Math.round(outsourceShareCurRaw));
                              const tooltipParts = [
                                `工序「${ms.name}」`,
                                `可报 ${availableQty} 件（已扣不良、加返工完成）`,
                                `已报 ${currentCompleted}`,
                                `剩 ${remaining} 件`,
                              ];
                              if (outsourceShareCur > 0) {
                                tooltipParts.push(`外协剩余 ${outsourceShareCur} 件`);
                              }
                              const tooltipBase = tooltipParts.join(' · ');
                              const tooltip = productionLinkMode === 'product' && (pmpShareCur > 0 || (outsourceNetByProductTpl.get(`${order.productId}|${ms.templateId}`) ?? 0) > 0)
                                ? `${tooltipBase}\n（产品池上的已报与外协未收回按工单数量比例摊回，为估算值；精确数字请查看产品维度详情）`
                                : tooltipBase;
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
                                  onClick={e => { e.stopPropagation(); hasOrderPerm('production:orders_detail:view') && openOrderDetail(order.id); }}
                                  className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 hover:border-slate-200 transition-colors cursor-pointer"
                                  title={tooltip}
                                >
                                  {content}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        ) : !showConfigureProcessHint ? (
                        <div className="w-40 text-right self-center">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-slate-400">进度</span>
                            <span className="text-xs font-black text-indigo-600">{overallProgress}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-500 rounded-full" style={{ width: `${overallProgress}%` }} />
                          </div>
                        </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {hasOrderPerm('production:orders_detail:view') && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); openOrderDetail(order.id); }}
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
                  // 关联产品模式：PMP（产品报工）与工单里程碑（关联工单报工 / 外协收回写回）都会产生完成量，
                  // 必须将两路完成量相加；任一路被忽略都会导致「毛衣9 横机 24 件显示成 4」这类漏报。
                  productMilestoneProgresses.filter(p => p.productId === block.productId).forEach(pmp => {
                    const name = globalNodes.find(n => n.id === pmp.milestoneTemplateId)?.name ?? '';
                    const cur = byTemplate.get(pmp.milestoneTemplateId);
                    byTemplate.set(pmp.milestoneTemplateId, {
                      name: cur?.name || name,
                      completed: (cur?.completed ?? 0) + (pmp.completedQuantity ?? 0)
                    });
                  });
                  block.orders.forEach(o => o.milestones.forEach(m => {
                    const cur = byTemplate.get(m.templateId);
                    byTemplate.set(m.templateId, {
                      name: cur?.name || m.name,
                      completed: (cur?.completed ?? 0) + (m.completedQuantity ?? 0),
                    });
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
                const pgProductHasMilestoneTemplate = (product?.milestoneNodeIds?.length ?? 0) > 0;
                const pgShowConfigureProcessHint =
                  (product != null && !pgProductHasMilestoneTemplate) ||
                  block.orders.some(o => o.status === 'PENDING_PROCESS');
                const pgHasMilestoneStrip = Array.from(byTemplate.entries()).length > 0;
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
                                <button type="button" onClick={e => { e.stopPropagation(); product && setViewProductId(product.id); }} className="text-left text-base font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                                  {block.productName}
                                </button>
                                <span className="text-[10px] font-bold text-slate-500">{product?.sku || block.orders[0]?.sku}</span>
                              </div>
                              <div className="mb-1 flex flex-wrap items-center gap-1">
                                {product &&
                                  getProductCategoryCustomFieldEntries(product, categoryMap.get(product.categoryId), {
                                    includeFile: false,
                                  }).map(({ field, display }) => (
                                    <span
                                      key={field.id}
                                      className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50"
                                    >
                                      {field.label}: {display}
                                    </span>
                                  ))}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 合计 {totalQty} 件</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                            <div className="flex flex-col gap-2 flex-1 min-w-0 min-h-0">
                              {pgShowConfigureProcessHint ? (
                                <div className="flex flex-col sm:flex-row sm:items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2">
                                  <div className="flex items-center gap-3 flex-wrap shrink-0">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-50 text-amber-600 border border-amber-200">
                                      待配工序
                                    </span>
                                    {onNavigateToProductEdit && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); onNavigateToProductEdit(block.productId); }}
                                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-bold text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors"
                                      >
                                        <Pencil className="w-3 h-3" /> 去配置工序
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-medium text-slate-600 leading-snug flex-1 min-w-0">
                                    {pgHasMilestoneStrip
                                      ? '工单上的工序来自历史工单复制，本产品仍未在产品管理中绑定工序，请先配置后再稳定报工。'
                                      : '本企业产品尚未配置工序，无法报工。请到「资料与配置 → 产品管理」为该产品添加工序。'}
                                  </p>
                                </div>
                              ) : null}
                              {pgHasMilestoneStrip ? (
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
                                    const templateIds = templateEntries.map(([t]) => t);
                                    const gateIdx = findGatingPredecessorIndex(templateIds, mIdx, outOfSequenceTemplateIds);
                                    /** 关联产品报工写在 pmp，不良不在工单里程碑；顺序+产品时不能用「合计−里程碑不良」否则会漏扣 pmp 不良（如横机显示成下单总数 450） */
                                    const availableQty =
                                      productionLinkMode === 'product' && productMilestoneProgresses.length > 0
                                        ? productGroupMaxReportableSum(
                                            block.orders,
                                            tid,
                                            block.productId,
                                            productMilestoneProgresses,
                                            processSequenceMode,
                                            (oid, t) => getDefectiveRework(oid, t),
                                            undefined,
                                            orders,
                                            outOfSequenceTemplateIds,
                                          )
                                        : (() => {
                                            let baseQty = totalQty;
                                            if (isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds) && gateIdx >= 0) {
                                              baseQty = templateEntries[gateIdx][1].completed;
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
                                    /**
                                     * 小卡圆下数字保持原口径（不扣外协），仅 hover tooltip 额外提示"外协剩余 X 件"。
                                     * 产品组卡精确合并两类外协（按 productId 维度 + 旗下所有工单维度）。
                                     */
                                    const outsourceForProductGroup =
                                      (outsourceNetByProductTpl.get(`${block.productId}|${tid}`) ?? 0) +
                                      block.orders.reduce(
                                        (s, o) => s + (outsourceNetByOrderTpl.get(`${o.id}|${tid}`) ?? 0),
                                        0,
                                      );
                                    const allowReport = (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && (
                                      !isProcessSequential(processSequenceMode, tid, outOfSequenceTemplateIds) ||
                                      gateIdx < 0 ||
                                      templateEntries[gateIdx][1].completed > 0
                                    );
                                    const tooltipReadOnly = [
                                      `可报最多 ${availDisplay}`,
                                      `已报 ${m.completed}`,
                                      `剩 ${remainingDisplay} 件`,
                                      ...(outsourceForProductGroup > 0 ? [`外协剩余 ${outsourceForProductGroup} 件`] : []),
                                    ].join(' · ');
                                    const tooltipText = allowReport
                                      ? `${tooltipReadOnly}（点击报工）`
                                      : '需先完成前一道工序的报工后才能报本工序';
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
                                        // 外协收回等将完成量直接写到工单里程碑 reports 上，需合入规格维度汇总，避免仅 PMP 渠道的数据导致已报量偏小。
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
                                        maxReportableQty: Math.max(0, Math.round(Number(availableQty) || 0)),
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
                                        title={tooltipText}
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
                                      <div key={tid} className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 bg-slate-50 rounded-xl border border-slate-100" title={tooltipReadOnly}>
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
                              ) : !pgShowConfigureProcessHint ? (
                              <div className="w-40 self-center">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-bold text-slate-400">进度</span>
                                  <span className="text-xs font-black text-indigo-600">{Math.min(100, overallProgress)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 transition-all rounded-full" style={{ width: `${Math.min(100, overallProgress)}%` }} />
                                </div>
                              </div>
                              ) : null}
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              {hasOrderPerm('production:orders_detail:view') && (
                              <button
                                type="button"
                                onClick={() => openProductDetail(block.productId)}
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
          <div className="relative bg-white w-full max-w-6xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-indigo-500" /> 工单流水
              </h3>
              <button onClick={() => { setShowOrderFlowModal(false); setOrderFlowProductId(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <OrderFlowView
              orders={orders}
              products={products}
              embedded
              productionLinkMode={productionLinkMode}
              planFormSettings={planFormSettings}
              initialProductId={orderFlowProductId}
              onOpenOrderDetail={(id) => openOrderDetail(id, true)}
            />
          </div>
        </div>
      )}

      {showOrderFormConfigModal && (
        <OrderFormConfigModal
          open={showOrderFormConfigModal}
          onClose={() => setShowOrderFormConfigModal(false)}
          defaultTabWhenOpen={orderFormConfigEntryTab}
          productionLinkMode={productionLinkMode}
          orderFormSettings={orderFormSettings}
          onUpdateOrderFormSettings={onUpdateOrderFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          onRefreshGlobalNodes={onRefreshGlobalNodes}
        />
      )}

      {reportModal && (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && (
        <ReportModal
          key={`${reportModal.order.id}-${reportModal.milestone.id}-${reportModalSession}`}
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
          prodRecords={effectiveProdRecords}
          boms={boms}
          plans={plans}
        />
      )}

      <ReportHistoryModal
        open={showHistoryModal}
        onClose={() => { setShowHistoryModal(false); setReportDetailBatch(null); setReportHistorySeed(null); }}
        orders={orders}
        products={products}
        globalNodes={globalNodes}
        dictionaries={dictionaries}
        productionLinkMode={productionLinkMode}
        productMilestoneProgresses={productMilestoneProgresses}
        prodRecords={effectiveProdRecords}
        onOpenBatchDetail={(batch) => setReportDetailBatch(batch)}
        initialSeed={reportHistorySeed}
      />

      {/* 待入库清单弹窗 */}
      <PendingStockPanel
        open={showPendingStockModal}
        onClose={() => setShowPendingStockModal(false)}
        orders={orders}
        products={products}
        categories={categories}
        globalNodes={globalNodes}
        prodRecords={effectiveProdRecords}
        warehouses={warehouses}
        dictionaries={dictionaries}
        boms={boms}
        productMilestoneProgresses={productMilestoneProgresses}
        productionLinkMode={productionLinkMode}
        processSequenceMode={processSequenceMode}
        allowExceedMaxStockInQty={allowExceedMaxStockInQty}
        orderFormSettings={orderFormSettings}
        printTemplates={printTemplates}
        onOpenOrderFormPrintTab={hasOrderPerm('production:orders_form_config:allow') ? openOrderFormPrintTab : undefined}
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
          prodRecords={effectiveProdRecords}
          productMilestoneProgresses={productMilestoneProgresses}
          processSequenceMode={processSequenceMode}
          productionLinkMode={productionLinkMode}
          orderFormSettings={orderFormSettings}
          printTemplates={printTemplates}
          onOpenOrderFormPrintTab={hasOrderPerm('production:orders_form_config:allow') ? openOrderFormPrintTab : undefined}
          onUpdateReport={onUpdateReport}
          onDeleteReport={onDeleteReport}
          onUpdateReportProduct={onUpdateReportProduct}
          onDeleteReportProduct={onDeleteReportProduct}
          onUpdateProduct={onUpdateProduct}
          onReportSubmit={onReportSubmit}
          onReportSubmitProduct={onReportSubmitProduct}
          hasOrderPerm={hasOrderPerm}
          partners={partners}
          partnerCategories={partnerCategories}
          outsourceFormSettings={outsourceFormSettings}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onUpdateRecord={onUpdateRecord}
          onDeleteRecord={onDeleteRecord}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
        />
      )}

      <ProductProductionDetailModal
        productId={detailProductId}
        onClose={closeProductDetail}
        orders={orders}
        products={products}
        boms={boms}
        categories={categories}
        dictionaries={dictionaries}
        prodRecords={effectiveProdRecords}
        productMilestoneProgresses={productMilestoneProgresses ?? []}
        globalNodes={globalNodes}
        outsourceFormSettings={outsourceFormSettings}
        partners={partners}
        partnerCategories={partnerCategories}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
        canViewReportHistory={hasOrderPerm('production:orders_report_records:view')}
        onOpenReportHistory={(seed) => {
          setReportHistorySeed(seed);
          setShowHistoryModal(true);
        }}
        onOpenOrderDetail={
          hasOrderPerm('production:orders_detail:view')
            ? (id) => {
                closeProductDetail();
                openOrderDetail(id, true);
              }
            : undefined
        }
        onAddRecord={onAddRecord}
        onAddRecordBatch={onAddRecordBatch}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
      />

      <OrderDetailModal
        orderId={detailOrderId}
        onClose={closeOrderDetail}
        orders={orders}
        products={products}
        boms={boms}
        prodRecords={effectiveProdRecords}
        dictionaries={dictionaries}
        categories={categories}
        orderFormSettings={orderFormSettings}
        printTemplates={printTemplates}
        onOpenOrderFormPrintTab={hasOrderPerm('production:orders_form_config:allow') ? openOrderFormPrintTab : undefined}
        productionLinkMode={productionLinkMode}
        productMilestoneProgresses={productMilestoneProgresses}
        globalNodes={globalNodes}
        detailFromFlowLayout={orderDetailFromFlow}
        onUpdateOrder={hasOrderPerm('production:orders_detail:edit') ? onUpdateOrder : undefined}
        onDeleteOrder={hasOrderPerm('production:orders_detail:delete') && onDeleteOrder ? (id) => { onDeleteOrder(id); closeOrderDetail(); } : undefined}
        canViewReportHistory={hasOrderPerm('production:orders_report_records:view')}
        onOpenReportHistory={(seed) => {
          setReportHistorySeed(seed);
          setShowHistoryModal(true);
        }}
        outsourceFormSettings={outsourceFormSettings}
        planFormSettings={planFormSettings}
        partners={partners}
        partnerCategories={partnerCategories}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
        onAddRecord={onAddRecord}
        onAddRecordBatch={onAddRecordBatch}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
      />

      {filePreviewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm" onClick={() => setFilePreviewUrl(null)}>
          <button type="button" onClick={() => setFilePreviewUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
            <X className="w-8 h-8" />
          </button>
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {filePreviewType === 'image' ? (
              <img src={filePreviewUrl} alt="预览" className="w-full h-full max-h-[85vh] object-contain" />
            ) : (
              <iframe src={filePreviewUrl} title="PDF 预览" className="w-full h-[85vh] border-0" />
            )}
          </div>
        </div>
      )}

      {viewProductId && (
        <PlanProductDetail
          viewProductId={viewProductId}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          globalNodes={globalNodes}
          boms={boms}
          onClose={() => setViewProductId(null)}
          onFilePreview={(url, type) => {
            setFilePreviewUrl(url);
            setFilePreviewType(type);
          }}
        />
      )}

      {reworkDetailOrderId && (
        <ReworkDetailModal
          orderId={reworkDetailOrderId}
          onClose={() => setReworkDetailOrderId(null)}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          prodRecords={effectiveProdRecords}
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
          prodRecords={effectiveProdRecords}
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
          productionLinkMode={productionLinkMode}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onClose={() => {
            setMaterialIssueOrderId(null);
            setMaterialIssueForProduct(null);
          }}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          categories={categories}
        />
      )}
    </div>
  );
};

export default React.memo(OrderListView);
