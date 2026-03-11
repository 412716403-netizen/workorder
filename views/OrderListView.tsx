
import React, { useState, useMemo } from 'react';
import { Clock, Layers, Plus, History, User, Sliders, X, Trash2, FileText, Check, ChevronDown, ChevronRight, ScrollText, UserPlus, Filter, Pencil, ClipboardList, Search, Package, ArrowUpFromLine } from 'lucide-react';
import { ProductionOrder, MilestoneStatus, Milestone, Product, GlobalNodeTemplate, PrintSettings, OrderFormSettings, ProductCategory, AppDictionaries, Partner, BOM, ProductionOpRecord, ProdOpType, Worker, ProductMilestoneProgress, ProcessSequenceMode, Warehouse } from '../types';
import ProductDetailModal from './ProductDetailModal';
import OrderDetailModal from './OrderDetailModal';
import OrderFlowView from './OrderFlowView';
import WorkerSelector from '../components/WorkerSelector';
import EquipmentSelector from '../components/EquipmentSelector';

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
  printSettings: PrintSettings;
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
  onUpdateReport?: (params: ReportUpdateParams) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => void;
  onAddRecord?: (record: ProductionOpRecord) => void;
  productMilestoneProgresses?: ProductMilestoneProgress[];
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, quantity: number, customData: any, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
}

const OrderListView: React.FC<OrderListViewExtendedProps> = ({
  productionLinkMode = 'order',
  processSequenceMode = 'free',
  allowExceedMaxReportQty = true,
  initialDetailOrderId,
  orders,
  products,
  workers = [],
  equipment = [],
  categories,
  dictionaries,
  partners,
  boms,
  globalNodes,
  printSettings,
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
  productMilestoneProgresses = [],
  onReportSubmitProduct,
  onUpdateReportProduct,
  onDeleteReportProduct
}) => {
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
  /** 物料发出弹窗：各物料领料数量输入 */
  const [materialIssueQty, setMaterialIssueQty] = useState<Record<string, number>>({});
  /** 物料发出弹窗：选择的出库仓库 */
  const [materialIssueWarehouseId, setMaterialIssueWarehouseId] = useState<string>(warehouses[0]?.id ?? '');

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

  /** 列表展示块：单条 或 主工单+子工单分组 或 按产品分组（product 模式） */
  type ListBlock =
    | { type: 'single'; order: ProductionOrder }
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
    return blocks;
  }, [filteredOrdersForList, parentToSubOrders, productionLinkMode, products]);

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
    // 顺序模式下，如果前一工序尚无报工记录，则不允许打开报工弹窗
    if (processSequenceMode === 'sequential' && !canReportMilestone(order, ms)) {
      return;
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
      const prevCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === prevTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      const curCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === milestoneTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      return prevCompleted - curCompleted;
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

  const submitReport = () => {
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
        entries.forEach(([vId, qty]) => {
          const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          onReportSubmitProduct!(
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
        });
      } else {
        const reportNo = getNextReportNo();
        onReportSubmitProduct(
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
      entries.forEach(([vId, qty]) => {
        let targetOrder = reportModal!.order;
        if (reportModal!.productOrders?.length) {
          const withVariant = reportModal!.productOrders.find(o => o.items.some(i => i.variantId === vId));
          targetOrder = withVariant ?? reportModal!.productOrders![0];
        }
        const ms = targetOrder.milestones.find(m => m.templateId === reportModal!.milestone.templateId) ?? reportModal!.milestone;
        const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
        onReportSubmit!(
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
      });
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
      onReportSubmit(
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
          <button
            onClick={() => { setOrderFormConfigDraft(JSON.parse(JSON.stringify(orderFormSettings))); setShowOrderFormConfigModal(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-bold transition-all border border-slate-200"
          >
            <Sliders className="w-4 h-4" /> 表单配置
          </button>
          {productionLinkMode === 'product' && (
            <button
              onClick={() => { setOrderFlowProductId(null); setShowOrderFlowModal(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all"
            >
              <ScrollText className="w-4 h-4" />
              工单流水
            </button>
          )}
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all"
          >
            <History className="w-4 h-4" />
            报工流水
          </button>
        </div>
      </div>

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
                        <button type="button" onClick={() => setDetailOrderId(order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none block`}>
                          <img src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => setDetailOrderId(order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors`}>
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
                              // 可报工数 / 剩余可报工数：在不限制模式下 = 工单总量 / (总量 - 当前工序已报)；
                              // 顺序模式下 = 上一道工序已报量 / (上道已报量 - 当前工序已报量)
                              let availableQty = orderTotalQty;
                              const currentCompleted = ms.completedQuantity;
                              if (processSequenceMode === 'sequential') {
                                const idx = order.milestones.findIndex(m => m.id === ms.id);
                                if (idx > 0) {
                                  const prev = order.milestones[idx - 1];
                                  availableQty = prev?.completedQuantity ?? 0;
                                }
                              }
                              const remaining = availableQty - currentCompleted;
                              const tooltip = `工序「${ms.name}」：已完成 ${currentCompleted} 件，基础数量 ${availableQty} 件，剩余 ${remaining} 件`;
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
                              return onReportSubmit ? (
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
                                  onClick={e => { e.stopPropagation(); setDetailOrderId(order.id); }}
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
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setDetailOrderId(order.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        {onAddRecord && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setMaterialIssueOrderId(order.id); }}
                            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                          >
                            <Package className="w-3.5 h-3.5" /> 物料
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
                                    // 可报工数：free 模式 = 总量；sequential 模式 = 上一道工序已报量（第一道 = 总量）
                                    let availableQty = totalQty;
                                    if (processSequenceMode === 'sequential' && mIdx > 0) {
                                      availableQty = templateEntries[mIdx - 1][1].completed;
                                    }
                                    const remaining = availableQty - m.completed;
                                    const isDone = remaining <= 0 && m.completed > 0;
                                    // 顺序模式下，前一道工序无报工则禁用后续工序
                                    const allowReport = (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && (
                                      processSequenceMode !== 'sequential' || mIdx === 0 || templateEntries[mIdx - 1][1].completed > 0
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
                                    return (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) ? (
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
                                        title={allowReport ? '点击报工' : '需先完成前一道工序的报工后才能报本工序'}
                                      >
                                        <span className="text-[10px] font-bold text-emerald-600 mb-2 truncate w-full text-center">{m.name}</span>
                                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-2 ${isDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                          <span className="text-base font-black text-slate-900">{m.completed}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                          <span>{availableQty} / <span className={remaining <= 0 && m.completed === 0 ? '' : remaining < 0 ? 'text-rose-500' : ''}>{remaining}</span></span>
                                        </div>
                                      </button>
                                    ) : (
                                      <div key={tid} className="flex flex-col items-center shrink-0 min-w-[88px] py-2 px-2 bg-slate-50 rounded-xl border border-slate-100">
                                        <span className="text-[10px] font-bold text-emerald-600 mb-2 truncate w-full text-center">{m.name}</span>
                                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-2 ${isDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                          <span className="text-base font-black text-slate-900">{m.completed}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                          <span>{availableQty} / <span className={remaining < 0 ? 'text-rose-500' : ''}>{remaining}</span></span>
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
                            <button
                              type="button"
                              onClick={() => { setOrderFlowProductId(block.productId); setShowOrderFlowModal(true); }}
                              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all shrink-0"
                            >
                              <ScrollText className="w-3.5 h-3.5" /> 查看明细
                            </button>
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

      {/* 工序报工弹窗 */}
      {reportModal && (onReportSubmit || (productionLinkMode === 'product' && onReportSubmitProduct)) && (
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
                      <span className="ml-2">该工序已完成 {reportModal.productCompletedQty} 件，剩余 {Math.max(0, reportModal.productTotalQty - reportModal.productCompletedQty)} 件</span>
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
                  options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.group, assignedMilestoneIds: w.assignedMilestoneIds }))}
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
                                const item = (reportModal.productItems ?? reportModal.order.items).find(i => (i.variantId || '') === variant.id);
                                let remaining = 0;
                                if (processSequenceMode === 'sequential') {
                                  remaining = getSeqRemainingForVariant(variant.id);
                                } else {
                                  const completedInMilestone = reportModal.productItems
                                    ? (item?.completedQuantity ?? 0)
                                    : (reportModal.milestone.reports || []).filter(r => (r.variantId || '') === variant.id).reduce((s, r) => s + r.quantity, 0);
                                  remaining = item ? item.quantity - completedInMilestone : 0;
                                }
                                const maxAllowed = Math.max(remaining, 0);
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
                                      placeholder={`最多${remaining}`}
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
                        const max = (() => {
                        const items = reportModal.productItems ?? reportModal.order.items;
                        const item = items.length === 1 ? items[0] : items.find(i => (i.variantId || '') === reportForm.variantId);
                        if (!item) return 0;
                        if (processSequenceMode === 'sequential') {
                          return getSeqRemainingForVariant(item.variantId || reportForm.variantId || '');
                        }
                        const completedInMilestone = reportModal.productItems
                          ? (item.completedQuantity ?? 0)
                          : (items.length === 1 && !item.variantId)
                            ? (reportModal.milestone.completedQuantity || 0)
                            : (reportModal.milestone.reports || []).filter(r => (r.variantId || '') === (item.variantId || '')).reduce((s, r) => s + r.quantity, 0);
                        return item.quantity - completedInMilestone;
                      })();
                        const maxAllowed = Math.max(max, 0);
                        const next = allowExceedMaxReportQty ? raw : Math.min(raw, maxAllowed);
                        setReportForm({ ...reportForm, quantity: next });
                      }}
                      placeholder={`最多${(() => {
                        const items = reportModal.productItems ?? reportModal.order.items;
                        const item = items.length === 1 ? items[0] : items.find(i => (i.variantId || '') === reportForm.variantId);
                        if (!item) return 0;
                        if (processSequenceMode === 'sequential') {
                          return getSeqRemainingForVariant(item.variantId || reportForm.variantId || '');
                        }
                        const completedInMilestone = reportModal.productItems
                          ? (item.completedQuantity ?? 0)
                          : (items.length === 1 && !item.variantId)
                            ? (reportModal.milestone.completedQuantity || 0)
                            : (reportModal.milestone.reports || []).filter(r => (r.variantId || '') === (item.variantId || '')).reduce((s, r) => s + r.quantity, 0);
                        return item.quantity - completedInMilestone;
                      })()}`}
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
      )}

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
            const rate = p?.nodeRates?.[r.milestone.templateId] ?? 0;
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
            const rate = p?.nodeRates?.[first.progress.milestoneTemplateId] ?? 0;
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
              totalAmount: rows.reduce((s, x) => s + x.report.quantity * rate, 0),
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
                          const reportNo = batch.reportNo || rawKey;
                          return (
                          <tr key={batch.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{batch.first.report.timestamp}</td>
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
                    {reportDetailBatch.source === 'order' && onUpdateReport && reportDetailBatch.rows.length > 0 && (
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
                    {reportDetailBatch.source === 'product' && onUpdateReportProduct && reportDetailBatch.rows.length > 0 && (
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
                    {reportDetailBatch.source === 'order' && onDeleteReport && (
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
                    {reportDetailBatch.source === 'product' && onDeleteReportProduct && (
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
              {editingReport ? (
                <>
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
                        options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.group, assignedMilestoneIds: w.assignedMilestoneIds }))}
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
              ) : (
                <>
                  <div className="flex flex-wrap gap-4">
                    {(() => {
                      const productId = reportDetailBatch.source === 'order' ? reportDetailBatch.first.order.productId : reportDetailBatch.productId;
                      const p = products.find(px => px.id === productId);
                      const unitName = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                      const milestoneName = reportDetailBatch.source === 'order'
                        ? reportDetailBatch.first.milestone.name
                        : reportDetailBatch.milestoneName;
                      return (
                        <>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工序</p>
                            <p className="text-sm font-bold text-slate-800">{milestoneName || '—'}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">本次报工量</p>
                            <p className="text-sm font-bold text-indigo-600">{reportDetailBatch.totalGood} {unitName}</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">报工时间</p>
                            <p className="text-sm font-bold text-slate-800">{reportDetailBatch.first.report.timestamp}</p>
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
                                const rate = p?.nodeRates?.[milestone.templateId] ?? 0;
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
                                const rate = p?.nodeRates?.[progress.milestoneTemplateId] ?? 0;
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
        onClose={() => setDetailOrderId(null)}
        orders={orders}
        products={products}
        prodRecords={prodRecords}
        dictionaries={dictionaries}
        categories={categories}
        orderFormSettings={orderFormSettings}
        productionLinkMode={productionLinkMode}
        onUpdateOrder={onUpdateOrder}
        onDeleteOrder={onDeleteOrder ? (id) => { onDeleteOrder(id); setDetailOrderId(null); } : undefined}
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

      {/* 物料发出弹窗：显示该工单 BOM 所需物料，可输入数量批量领料 */}
      {materialIssueOrderId && onAddRecord && (() => {
        const order = orders.find(o => o.id === materialIssueOrderId);
        if (!order) return null;
        const product = products.find(p => p.id === order.productId);
        const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
        const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
        const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
        const variants = product?.variants ?? [];
        if (variants.length > 0) {
          variants.forEach(v => {
            if (v.nodeBOMs) {
              Object.entries(v.nodeBOMs).forEach(([nodeId, bomId]) => {
                const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
                const bom = boms.find(b => b.id === bomId);
                bom?.items.forEach(bi => {
                  const mp = products.find(px => px.id === bi.productId);
                  const existing = matMap.get(bi.productId);
                  if (existing) {
                    existing.unitNeeded += bi.quantity * orderQty;
                    if (nodeName) existing.nodeNames.add(nodeName);
                  } else {
                    const ns = new Set<string>();
                    if (nodeName) ns.add(nodeName);
                    matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: bi.quantity * orderQty, nodeNames: ns });
                  }
                });
              });
            }
          });
        }
        if (matMap.size === 0 && product) {
          boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
            const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
            bom.items.forEach(bi => {
              const mp = products.find(px => px.id === bi.productId);
              const existing = matMap.get(bi.productId);
              if (existing) {
                existing.unitNeeded += bi.quantity * orderQty;
                if (nodeName) existing.nodeNames.add(nodeName);
              } else {
                const ns = new Set<string>();
                if (nodeName) ns.add(nodeName);
                matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: bi.quantity * orderQty, nodeNames: ns });
              }
            });
          });
        }
        matMap.forEach((v, productId) => {
          bomMaterials.push({ productId, ...v, nodeNames: Array.from(v.nodeNames) });
        });
        const issuedMap = new Map<string, number>();
        prodRecords.filter(r => r.type === 'STOCK_OUT' && r.orderId === order.id).forEach(r => {
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
              id: `rec-${Date.now()}-${m.productId}`,
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
    </div>
  );
};

export default OrderListView;
