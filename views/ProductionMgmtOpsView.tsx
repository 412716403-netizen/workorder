import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  RotateCcw,
  Clock,
  Printer,
  Undo2,
  ClipboardList,
  Layers,
  X,
  ScrollText,
  Check,
  Filter,
  FileText,
  Pencil,
  Trash2,
  Building2,
  ChevronDown,
  ChevronRight,
  Search,
  User,
  Package
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ProductionOpRecord, ProductionOrder, Product, ProdOpType, PrintSettings, Warehouse, BOM, AppDictionaries, GlobalNodeTemplate, Partner, ProductCategory, ProductVariant, PartnerCategory } from '../types';

interface ProductionMgmtOpsViewProps {
  productionLinkMode?: 'order' | 'product';
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses?: Warehouse[];
  boms?: BOM[];
  dictionaries?: AppDictionaries;
  printSettings: PrintSettings;
  onAddRecord: (record: ProductionOpRecord) => void;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  limitType?: ProdOpType;
  excludeType?: ProdOpType;
  globalNodes?: GlobalNodeTemplate[];
  partners?: Partner[];
  categories?: ProductCategory[];
  partnerCategories?: PartnerCategory[];
}

type OutsourceModalType = 'dispatch' | 'receive' | 'flow';

const ProductionMgmtOpsView: React.FC<ProductionMgmtOpsViewProps> = ({
  productionLinkMode = 'order', records, orders, products, warehouses = [], boms = [], dictionaries, printSettings, onAddRecord, onUpdateRecord, onDeleteRecord,   limitType, excludeType, globalNodes = [], partners = [], categories = [], partnerCategories = []
}) => {
  const navigate = useNavigate();
  const allTabs = [
    { id: 'STOCK_OUT', label: '生产物料', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '物料下发与库存扣减' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '外部委托加工业务追踪' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '不合格品返工流程记录' },
    { id: 'STOCK_IN', label: '生产入库', icon: ArrowDownToLine, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '成品入库与完工确认' },
  ];

  const currentBiz = allTabs.find(t => t.id === limitType);
  const printConfig = limitType ? printSettings[limitType] : null;

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    orderId: '',
    productId: '',
    quantity: 0,
    reason: '',
    partner: '',
    warehouseId: ''
  });
  /** 生产物料页：领料/退料弹窗类型，从工单行打开时预填 orderId */
  const [stockModalMode, setStockModalMode] = useState<'stock_out' | 'stock_return' | null>(null);
  /** 生产物料页：领料退料流水弹窗（右上角点击打开） */
  const [showStockFlowModal, setShowStockFlowModal] = useState(false);
  /** 生产物料页：当前处于“选物料”状态的工单 id，及领料/退料模式 */
  const [stockSelectOrderId, setStockSelectOrderId] = useState<string | null>(null);
  const [stockSelectMode, setStockSelectMode] = useState<'stock_out' | 'stock_return' | null>(null);
  /** 当前工单下已选中的物料 productId 集合 */
  const [stockSelectedIds, setStockSelectedIds] = useState<Set<string>>(new Set());
  /** 确认领料/退料弹窗：选好物料后填数量与仓库，再提交 */
  const [showStockConfirmModal, setShowStockConfirmModal] = useState(false);
  const [stockConfirmQuantities, setStockConfirmQuantities] = useState<Record<string, number>>({});
  const [stockConfirmWarehouseId, setStockConfirmWarehouseId] = useState('');
  const [stockConfirmReason, setStockConfirmReason] = useState('');
  /** 领料退料流水弹窗：筛选条件 */
  const [stockFlowFilterType, setStockFlowFilterType] = useState<'all' | 'STOCK_OUT' | 'STOCK_RETURN'>('all');
  const [stockFlowFilterOrderKeyword, setStockFlowFilterOrderKeyword] = useState('');
  const [stockFlowFilterProductKeyword, setStockFlowFilterProductKeyword] = useState('');
  const [stockFlowFilterDocNo, setStockFlowFilterDocNo] = useState('');
  const [stockFlowFilterDateFrom, setStockFlowFilterDateFrom] = useState('');
  const [stockFlowFilterDateTo, setStockFlowFilterDateTo] = useState('');
  /** 领料/退料保存后或从流水点击查看详情显示的单据详情（null 表示不显示） */
  const [stockDocDetail, setStockDocDetail] = useState<{
    docNo: string;
    type: 'STOCK_OUT' | 'STOCK_RETURN';
    orderId: string;
    timestamp: string;
    warehouseId: string;
    lines: { productId: string; quantity: number }[];
    reason?: string;
    operator: string;
  } | null>(null);
  /** 单据详情页编辑态：非 null 时显示编辑表单 */
  const [stockDocEditForm, setStockDocEditForm] = useState<{
    warehouseId: string;
    lines: { productId: string; quantity: number }[];
    reason: string;
  } | null>(null);

  /** 外协管理：当前打开的弹窗 待发清单 / 待收回清单 / 外协流水，null 为不打开 */
  const [outsourceModal, setOutsourceModal] = useState<OutsourceModalType | null>(null);
  /** 待发清单：选中的外协工厂名称（与计划客户选择一致，存名称） */
  const [dispatchPartnerName, setDispatchPartnerName] = useState('');
  /** 外协工厂选择器：下拉是否展开 */
  const [dispatchPartnerOpen, setDispatchPartnerOpen] = useState(false);
  /** 外协工厂选择器：搜索关键字 */
  const [dispatchPartnerSearch, setDispatchPartnerSearch] = useState('');
  /** 外协工厂选择器：当前分类 tab */
  const [dispatchPartnerCategoryTab, setDispatchPartnerCategoryTab] = useState<string>('all');
  const dispatchPartnerContainerRef = useRef<HTMLDivElement>(null);
  /** 待发清单：单号模糊搜索 */
  const [dispatchListSearchOrder, setDispatchListSearchOrder] = useState('');
  /** 待发清单：货号模糊搜索（产品名称或 SKU） */
  const [dispatchListSearchProduct, setDispatchListSearchProduct] = useState('');
  /** 待发清单：工序筛选，空为全部 */
  const [dispatchListSearchNodeId, setDispatchListSearchNodeId] = useState('');
  /** 待发清单：勾选的工单+工序 key 集合 orderId|nodeId */
  const [dispatchSelectedKeys, setDispatchSelectedKeys] = useState<Set<string>>(new Set());
  /** 待发清单第二步：外协发出表单弹窗是否打开 */
  const [dispatchFormModalOpen, setDispatchFormModalOpen] = useState(false);
  /** 待发清单第二步：表单内各规格委外数量 key = orderId|nodeId 或 orderId|nodeId|variantId */
  const [dispatchFormQuantities, setDispatchFormQuantities] = useState<Record<string, number>>({});
  /** 待发清单第二步：备注说明 */
  const [dispatchRemark, setDispatchRemark] = useState('');
  /** 待收回清单：工单号模糊搜索 */
  const [receiveListSearchOrder, setReceiveListSearchOrder] = useState('');
  /** 待收回清单：货号模糊搜索（产品名称或 SKU） */
  const [receiveListSearchProduct, setReceiveListSearchProduct] = useState('');
  /** 待收回清单：工序筛选，空为全部 */
  const [receiveListSearchNodeId, setReceiveListSearchNodeId] = useState('');
  /** 待收回清单：外协工厂模糊搜索 */
  const [receiveListSearchPartner, setReceiveListSearchPartner] = useState('');
  /** 待收回清单：勾选的工单+工序 key 集合 orderId|nodeId（同一工序才能同时收货） */
  const [receiveSelectedKeys, setReceiveSelectedKeys] = useState<Set<string>>(new Set());
  /** 待收回清单第二步：收货表单弹窗是否打开 */
  const [receiveFormModalOpen, setReceiveFormModalOpen] = useState(false);
  /** 待收回清单第二步：表单内各规格本次收回数量 key = orderId|nodeId 或 orderId|nodeId|variantId */
  const [receiveFormQuantities, setReceiveFormQuantities] = useState<Record<string, number>>({});
  /** 待收回清单第二步：备注说明 */
  const [receiveFormRemark, setReceiveFormRemark] = useState('');
  /** 待收回清单：收回弹窗，当前操作的 工单+工序 及待收数量（保留供兼容，新流程用勾选+收货表单） */
  const [receiveModal, setReceiveModal] = useState<{ orderId: string; nodeId: string; productId: string; orderNumber: string; productName: string; milestoneName: string; partner: string; pendingQty: number } | null>(null);
  /** 收回弹窗：本次收回数量 */
  const [receiveQty, setReceiveQty] = useState(0);
  /** 外协流水：当前查看详情的单据号（docNo），非空时弹出该单据详情 */
  const [flowDetailKey, setFlowDetailKey] = useState<string | null>(null);
  /** 详情页编辑模式：为 true 时基本信息与数量可编辑 */
  const [flowDetailEditMode, setFlowDetailEditMode] = useState(false);
  const [flowDetailEditPartner, setFlowDetailEditPartner] = useState('');
  const [flowDetailEditRemark, setFlowDetailEditRemark] = useState('');
  /** 详情页编辑：数量 key=orderId|nodeId 或 orderId|nodeId|variantId */
  const [flowDetailQuantities, setFlowDetailQuantities] = useState<Record<string, number>>({});
  /** 详情页：外协工厂选择器展开、搜索、分类 tab */
  const [flowDetailPartnerOpen, setFlowDetailPartnerOpen] = useState(false);
  const [flowDetailPartnerSearch, setFlowDetailPartnerSearch] = useState('');
  const [flowDetailPartnerCategoryTab, setFlowDetailPartnerCategoryTab] = useState<string>('all');
  const flowDetailPartnerRef = useRef<HTMLDivElement>(null);
  /** 外协流水搜索：日期、类型、外协工厂(模糊)、单号(模糊)、工单(模糊)、产品(模糊)、工序(模糊) */
  const [flowFilterDateFrom, setFlowFilterDateFrom] = useState('');
  const [flowFilterDateTo, setFlowFilterDateTo] = useState('');
  const [flowFilterType, setFlowFilterType] = useState<'all' | '发出' | '收回'>('all');
  const [flowFilterPartner, setFlowFilterPartner] = useState('');
  const [flowFilterDocNo, setFlowFilterDocNo] = useState('');
  const [flowFilterOrder, setFlowFilterOrder] = useState('');
  const [flowFilterProduct, setFlowFilterProduct] = useState('');
  const [flowFilterMilestone, setFlowFilterMilestone] = useState('');
  /** 返工管理：待处理不良弹窗 */
  const [reworkPendingModalOpen, setReworkPendingModalOpen] = useState(false);
  const [reworkListSearchOrder, setReworkListSearchOrder] = useState('');
  const [reworkListSearchProduct, setReworkListSearchProduct] = useState('');
  const [reworkListSearchNodeId, setReworkListSearchNodeId] = useState('');
  /** 待处理不良：当前点击「处理」的行，并弹出处理方式（报损/返工） */
  const [reworkActionRow, setReworkActionRow] = useState<{
    orderId: string; orderNumber: string; productId: string; productName: string; nodeId: string; milestoneName: string;
    defectiveTotal: number; reworkTotal: number; scrapTotal: number; pendingQty: number;
  } | null>(null);
  /** 处理方式：报损 → 填数量+原因提交 SCRAP；返工 → 选工序+数量提交 REWORK */
  const [reworkActionMode, setReworkActionMode] = useState<'scrap' | 'rework' | null>(null);
  const [reworkActionQty, setReworkActionQty] = useState(0);
  const [reworkActionReason, setReworkActionReason] = useState('');
  /** 返工目标工序（多选） */
  const [reworkActionNodeIds, setReworkActionNodeIds] = useState<string[]>([]);
  /** 返工管理：主工单及子工单 展开/收起 */
  const [reworkExpandedParents, setReworkExpandedParents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dispatchFormModalOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dispatchPartnerContainerRef.current && !dispatchPartnerContainerRef.current.contains(e.target as Node)) setDispatchPartnerOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dispatchFormModalOpen]);

  /** 详情页编辑：合作单位筛选列表（与新增一致逻辑） */
  const filteredFlowDetailPartners = useMemo(() => {
    return partners.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(flowDetailPartnerSearch.toLowerCase()) || (p.contact || '').toLowerCase().includes(flowDetailPartnerSearch.toLowerCase());
      const matchesCategory = flowDetailPartnerCategoryTab === 'all' || p.categoryId === flowDetailPartnerCategoryTab;
      return matchesSearch && matchesCategory;
    });
  }, [partners, flowDetailPartnerSearch, flowDetailPartnerCategoryTab]);

  useEffect(() => {
    if (!flowDetailEditMode || !flowDetailPartnerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (flowDetailPartnerRef.current && !flowDetailPartnerRef.current.contains(e.target as Node)) setFlowDetailPartnerOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [flowDetailEditMode, flowDetailPartnerOpen]);

  const filteredDispatchPartners = useMemo(() => {
    return partners.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(dispatchPartnerSearch.toLowerCase()) || (p.contact || '').toLowerCase().includes(dispatchPartnerSearch.toLowerCase());
      const matchesCategory = dispatchPartnerCategoryTab === 'all' || p.categoryId === dispatchPartnerCategoryTab;
      return matchesSearch && matchesCategory;
    });
  }, [partners, dispatchPartnerSearch, dispatchPartnerCategoryTab]);

  const filteredRecords = records.filter(r => r.type === limitType);
  const stockFlowRecords = (limitType === 'STOCK_OUT' ? records.filter(r => r.type === 'STOCK_OUT' || r.type === 'STOCK_RETURN') : []).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  /** 领料退料流水弹窗：按筛选条件过滤后的列表及合计（工单/物料/单据号均为模糊搜索） */
  const { filteredStockFlowRecords, totalIssueQty, totalReturnQty, countIssue, countReturn } = useMemo(() => {
    let list = stockFlowRecords;
    if (stockFlowFilterType !== 'all') list = list.filter(r => r.type === stockFlowFilterType);
    if (stockFlowFilterOrderKeyword.trim()) {
      const kw = stockFlowFilterOrderKeyword.trim().toLowerCase();
      list = list.filter(r => {
        const o = orders.find(x => x.id === r.orderId);
        const orderNum = (o?.orderNumber ?? '').toLowerCase();
        const orderId = (r.orderId ?? '').toLowerCase();
        return orderNum.includes(kw) || orderId.includes(kw);
      });
    }
    if (stockFlowFilterProductKeyword.trim()) {
      const kw = stockFlowFilterProductKeyword.trim().toLowerCase();
      list = list.filter(r => {
        const p = products.find(x => x.id === r.productId);
        const name = (p?.name ?? '').toLowerCase();
        const productId = (r.productId ?? '').toLowerCase();
        return name.includes(kw) || productId.includes(kw);
      });
    }
    if (stockFlowFilterDocNo.trim()) {
      const kw = stockFlowFilterDocNo.trim().toLowerCase();
      list = list.filter(r => ((r.docNo ?? '').toLowerCase()).includes(kw));
    }
    if (stockFlowFilterDateFrom) {
      const from = stockFlowFilterDateFrom;
      list = list.filter(r => {
        const d = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
        return d >= from;
      });
    }
    if (stockFlowFilterDateTo) {
      const to = stockFlowFilterDateTo;
      list = list.filter(r => {
        const d = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
        return d <= to;
      });
    }
    const issueList = list.filter(r => r.type === 'STOCK_OUT');
    const returnList = list.filter(r => r.type === 'STOCK_RETURN');
    const totalIssueQty = issueList.reduce((s, r) => s + r.quantity, 0);
    const totalReturnQty = returnList.reduce((s, r) => s + r.quantity, 0);
    return {
      filteredStockFlowRecords: list,
      totalIssueQty,
      totalReturnQty,
      countIssue: issueList.length,
      countReturn: returnList.length
    };
  }, [stockFlowRecords, stockFlowFilterType, stockFlowFilterOrderKeyword, stockFlowFilterProductKeyword, stockFlowFilterDocNo, stockFlowFilterDateFrom, stockFlowFilterDateTo, orders, products]);

  /** 父工单列表（无 parentOrderId 的为父工单） */
  const parentOrders = useMemo(() => orders.filter(o => !o.parentOrderId), [orders]);

  /** 取某父工单及其所有子工单的 id 列表 */
  const getOrderFamilyIds = (parentId: string): string[] => {
    const ids: string[] = [parentId];
    const queue: string[] = [parentId];
    while (queue.length > 0) {
      const pid = queue.shift()!;
      orders.filter(o => o.parentOrderId === pid).forEach(o => {
        ids.push(o.id);
        queue.push(o.id);
      });
    }
    return ids;
  };

  /** 取某父工单及其所有子工单，带层级深度（0=父，1=一级子，2=二级子…） */
  const getOrderFamilyWithDepth = (parentId: string): { order: ProductionOrder; depth: number }[] => {
    const result: { order: ProductionOrder; depth: number }[] = [];
    const parent = orders.find(o => o.id === parentId);
    if (!parent) return result;
    result.push({ order: parent, depth: 0 });
    let queue: { id: string; depth: number }[] = [{ id: parentId, depth: 0 }];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      orders.filter(o => o.parentOrderId === id).forEach(o => {
        result.push({ order: o, depth: depth + 1 });
        queue.push({ id: o.id, depth: depth + 1 });
      });
    }
    return result;
  };

  /** 按父工单聚合：父工单 id -> 该父工单及所有子工单下各物料的 领料/退料/净领用/报工理论耗材 汇总；含 BOM 全部物料（无记录时也显示） */
  const parentMaterialStats = useMemo(() => {
    if (limitType !== 'STOCK_OUT') return new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
    const result = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
    const parentList = orders.filter(o => !o.parentOrderId);
    parentList.forEach(parent => {
      const familyIds = new Set(getOrderFamilyIds(parent.id));
      const prodMap = new Map<string, { issue: number; returnQty: number; theoryCost: number }>();
      const familyOrders = orders.filter(o => familyIds.has(o.id));
      familyOrders.forEach(ord => {
        const completedQty = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);
        const ordProduct = products.find(p => p.id === ord.productId);
        const variants = ordProduct?.variants ?? [];
        const bomItems: { productId: string; quantity: number }[] = [];
        if (variants.length > 0) {
          variants.forEach(v => {
            if (v.nodeBOMs) {
              Object.values(v.nodeBOMs).forEach(bomId => {
                const bom = boms.find(b => b.id === bomId);
                bom?.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: bi.quantity }));
              });
            }
          });
        }
        if (bomItems.length === 0 && ordProduct) {
          boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
            bom.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: bi.quantity }));
          });
        }
        bomItems.forEach(bi => {
          const theory = bi.quantity * completedQty;
          if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
          prodMap.get(bi.productId)!.theoryCost += theory;
        });
      });
      records.forEach(r => {
        if ((r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') || !familyIds.has(r.orderId)) return;
        if (!prodMap.has(r.productId)) prodMap.set(r.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
        const cur = prodMap.get(r.productId)!;
        if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
        else cur.returnQty += r.quantity;
      });
      result.set(parent.id, Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v })));
    });
    return result;
  }, [limitType, records, orders, boms, products]);

  /** 外协：待发清单可选行（工单+可外协工序），含可委外数量 */
  const outsourceDispatchRows = useMemo(() => {
    if (limitType !== 'OUTSOURCE' || globalNodes.length === 0) return [];
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE');
    const dispatchedByKey: Record<string, number> = {};
    outsourceRecords.forEach(r => {
      if (r.status !== '加工中' || !r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      dispatchedByKey[key] = (dispatchedByKey[key] ?? 0) + r.quantity;
    });
    const rows: { orderId: string; orderNumber: string; productId: string; productName: string; nodeId: string; milestoneName: string; orderTotalQty: number; reportedQty: number; dispatchedQty: number; availableQty: number }[] = [];
    const parentList = orders.filter(o => !o.parentOrderId);
    parentList.forEach(order => {
      const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
      const product = products.find(p => p.id === order.productId);
      order.milestones.forEach(ms => {
        const node = globalNodes.find(n => n.id === ms.templateId);
        if (!node?.allowOutsource) return;
        // 仅显示产品当前已配置的工序：若产品未配置该工序（如毛衣圆领未配置纺纱），则不出现在待发清单
        if (product && !(product.milestoneNodeIds || []).includes(ms.templateId)) return;
        const key = `${order.id}|${ms.templateId}`;
        const dispatchedQty = dispatchedByKey[key] ?? 0;
        const reportedQty = ms.completedQuantity ?? 0;
        const availableQty = Math.max(0, orderTotalQty - reportedQty - dispatchedQty);
        if (availableQty <= 0) return;
        rows.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          productName: product?.name ?? order.productName ?? '—',
          nodeId: ms.templateId,
          milestoneName: ms.name,
          orderTotalQty,
          reportedQty,
          dispatchedQty,
          availableQty
        });
      });
    });
    return rows;
  }, [limitType, records, orders, products, globalNodes]);

  /** 待发清单：按单号、货号模糊搜索 + 工序选择过滤后的行 */
  const filteredDispatchRows = useMemo(() => {
    const orderKw = (dispatchListSearchOrder || '').trim().toLowerCase();
    const productKw = (dispatchListSearchProduct || '').trim().toLowerCase();
    return outsourceDispatchRows.filter(row => {
      if (orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (dispatchListSearchNodeId && row.nodeId !== dispatchListSearchNodeId) return false;
      return true;
    });
  }, [outsourceDispatchRows, dispatchListSearchOrder, dispatchListSearchProduct, dispatchListSearchNodeId, products]);

  /** 待发清单：工序选项（当前列表中的工序去重） */
  const dispatchListNodeOptions = useMemo(() => {
    const seen = new Set<string>();
    return outsourceDispatchRows.reduce<{ value: string; label: string }[]>((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, []);
  }, [outsourceDispatchRows]);

  /** 返工：待处理不良清单（报工不良 − 已返工 − 已报损，按工单+工序汇总；含父子工单，每条显示该工单的真实工单号与产品名） */
  const reworkPendingRows = useMemo(() => {
    if (limitType !== 'REWORK' || productionLinkMode !== 'order') return [];
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const reworkByKey: Record<string, number> = {};
    reworkRecords.forEach(r => {
      if (!r.orderId) return;
      const srcNode = r.sourceNodeId ?? r.nodeId;
      if (!srcNode) return;
      const key = `${r.orderId}|${srcNode}`;
      reworkByKey[key] = (reworkByKey[key] ?? 0) + r.quantity;
    });
    const scrapRecords = records.filter(r => r.type === 'SCRAP');
    const scrapByKey: Record<string, number> = {};
    scrapRecords.forEach(r => {
      if (!r.orderId || !r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      scrapByKey[key] = (scrapByKey[key] ?? 0) + r.quantity;
    });
    const rows: { orderId: string; orderNumber: string; productId: string; productName: string; nodeId: string; milestoneName: string; defectiveTotal: number; reworkTotal: number; scrapTotal: number; pendingQty: number }[] = [];
    orders.forEach(order => {
      const product = products.find(p => p.id === order.productId);
      order.milestones.forEach(ms => {
        const defectiveTotal = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
        if (defectiveTotal <= 0) return;
        const key = `${order.id}|${ms.templateId}`;
        const reworkTotal = reworkByKey[key] ?? 0;
        const scrapTotal = scrapByKey[key] ?? 0;
        const pendingQty = defectiveTotal - reworkTotal - scrapTotal;
        if (pendingQty <= 0) return;
        rows.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          productName: product?.name ?? order.productName ?? '—',
          nodeId: ms.templateId,
          milestoneName: ms.name,
          defectiveTotal,
          reworkTotal,
          scrapTotal,
          pendingQty
        });
      });
    });
    rows.sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''));
    return rows;
  }, [limitType, productionLinkMode, records, orders, products]);

  /** 待处理不良：按单号、货号模糊搜索 + 工序筛选 */
  const filteredReworkPendingRows = useMemo(() => {
    const orderKw = (reworkListSearchOrder || '').trim().toLowerCase();
    const productKw = (reworkListSearchProduct || '').trim().toLowerCase();
    return reworkPendingRows.filter(row => {
      if (orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (reworkListSearchNodeId && row.nodeId !== reworkListSearchNodeId) return false;
      return true;
    });
  }, [reworkPendingRows, reworkListSearchOrder, reworkListSearchProduct, reworkListSearchNodeId, products]);

  /** 待处理不良：工序选项（当前列表中的工序去重） */
  const reworkPendingNodeOptions = useMemo(() => {
    const seen = new Set<string>();
    return reworkPendingRows.reduce<{ value: string; label: string }[]>((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, []);
  }, [reworkPendingRows]);

  /** 返工管理：按单工单聚合返工统计（每张卡片显示该工单自己的返工工序标签） */
  const reworkStatsByOrderId = useMemo(() => {
    if (limitType !== 'REWORK' || productionLinkMode !== 'order') return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    orders.forEach(order => {
      const byNode = new Map<string, { totalQty: number; completedQty: number }>();
      reworkRecords.forEach(r => {
        if (r.orderId !== order.id) return;
        const srcNode = r.sourceNodeId ?? r.nodeId;
        if (!srcNode) return;
        const cur = byNode.get(srcNode) ?? { totalQty: 0, completedQty: 0 };
        cur.totalQty += r.quantity;
        if (r.status === '已完成') cur.completedQty += r.quantity;
        byNode.set(srcNode, cur);
      });
      const list = Array.from(byNode.entries())
        .filter(([, v]) => v.totalQty > 0)
        .map(([nodeId, v]) => ({
          nodeId,
          nodeName: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: v.totalQty - v.completedQty
        }))
        .sort((a, b) => a.nodeName.localeCompare(b.nodeName));
      if (list.length > 0) result.set(order.id, list);
    });
    return result;
  }, [limitType, productionLinkMode, records, orders, globalNodes]);

  /** 返工管理：父子工单列表块（与工单中心一致：单条 或 主工单+子工单分组） */
  const reworkListBlocks = useMemo(() => {
    if (limitType !== 'REWORK' || productionLinkMode !== 'order') return [];
    const reworkOrderIds = new Set(orders.filter(o => (reworkStatsByOrderId.get(o.id)?.length ?? 0) > 0).map(o => o.id));
    const parentHasRework = (parent: ProductionOrder) => {
      if (reworkOrderIds.has(parent.id)) return true;
      return getOrderFamilyIds(parent.id).some(id => reworkOrderIds.has(id));
    };
    const children = (parentId: string) => orders.filter(o => o.parentOrderId === parentId);
    const blocks: { type: 'single'; order: ProductionOrder } | { type: 'parentChild'; parent: ProductionOrder; children: ProductionOrder[] }[] = [];
    const used = new Set<string>();
    parentOrders.forEach(order => {
      if (used.has(order.id)) return;
      const childList = children(order.id);
      if (childList.length > 0 && parentHasRework(order)) {
        used.add(order.id);
        getOrderFamilyIds(order.id).forEach(id => used.add(id));
        blocks.push({ type: 'parentChild', parent: order, children: childList });
      } else if (reworkStatsByOrderId.has(order.id)) {
        used.add(order.id);
        blocks.push({ type: 'single', order });
      }
    });
    return blocks;
  }, [limitType, productionLinkMode, parentOrders, orders, reworkStatsByOrderId]);

  /** 外协：待收回清单（按工单+工序汇总，待收>0） */
  const outsourceReceiveRows = useMemo(() => {
    if (limitType !== 'OUTSOURCE') return [];
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE');
    const byKey: Record<string, { dispatched: number; received: number; partner: string }> = {};
    outsourceRecords.forEach(r => {
      if (!r.orderId || !r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      if (!byKey[key]) byKey[key] = { dispatched: 0, received: 0, partner: r.partner ?? '' };
      if (r.status === '加工中') byKey[key].dispatched += r.quantity;
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
    const rows: { orderId: string; nodeId: string; productId: string; orderNumber: string; productName: string; milestoneName: string; partner: string; dispatched: number; received: number; pending: number }[] = [];
    Object.entries(byKey).forEach(([key, v]) => {
      const pending = v.dispatched - v.received;
      if (pending <= 0) return;
      const [orderId, nodeId] = key.split('|');
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      const ms = order.milestones.find(m => m.templateId === nodeId);
      const product = products.find(p => p.id === order.productId);
      rows.push({
        orderId,
        nodeId,
        productId: order.productId,
        orderNumber: order.orderNumber,
        productName: product?.name ?? order.productName ?? '—',
        milestoneName: ms?.name ?? nodeId,
        partner: v.partner,
        dispatched: v.dispatched,
        received: v.received,
        pending
      });
    });
    return rows;
  }, [limitType, records, orders, products]);

  /** 待收回清单：按工单号、货号、外协工厂模糊搜索 + 工序选择过滤后的行 */
  const filteredReceiveRows = useMemo(() => {
    const orderKw = (receiveListSearchOrder || '').trim().toLowerCase();
    const productKw = (receiveListSearchProduct || '').trim().toLowerCase();
    const partnerKw = (receiveListSearchPartner || '').trim().toLowerCase();
    return outsourceReceiveRows.filter(row => {
      if (orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (partnerKw && !(row.partner || '').toLowerCase().includes(partnerKw)) return false;
      if (receiveListSearchNodeId && row.nodeId !== receiveListSearchNodeId) return false;
      return true;
    });
  }, [outsourceReceiveRows, receiveListSearchOrder, receiveListSearchProduct, receiveListSearchPartner, receiveListSearchNodeId, products]);

  /** 待收回清单：工序选项（当前列表中的工序去重） */
  const receiveListNodeOptions = useMemo(() => {
    const seen = new Set<string>();
    return outsourceReceiveRows.reduce<{ value: string; label: string }[]>((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, []);
  }, [outsourceReceiveRows]);

  /** 委外统计：按工单聚合，每个工单下按外协工厂+工序汇总 总发出/总收回/未收（用于主页展示） */
  const outsourceStatsByOrder = useMemo(() => {
    if (limitType !== 'OUTSOURCE') return [];
    const outsourceRecs = records.filter(r => r.type === 'OUTSOURCE' && r.orderId && r.partner);
    const byKey: Record<string, { orderId: string; partner: string; nodeId: string; dispatched: number; received: number }> = {};
    outsourceRecs.forEach(r => {
      const nodeId = r.nodeId ?? '';
      const key = `${r.orderId}|${r.partner}|${nodeId}`;
      if (!byKey[key]) byKey[key] = { orderId: r.orderId, partner: r.partner, nodeId, dispatched: 0, received: 0 };
      if (r.status === '加工中') byKey[key].dispatched += r.quantity;
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
    const byOrder = new Map<string, { partner: string; nodeId: string; nodeName: string; dispatched: number; received: number; pending: number }[]>();
    Object.values(byKey).forEach(v => {
      const pending = Math.max(0, v.dispatched - v.received);
      const order = orders.find(o => o.id === v.orderId);
      const ms = order?.milestones?.find(m => m.templateId === v.nodeId);
      const nodeName = (ms?.name ?? globalNodes.find(n => n.id === v.nodeId)?.name ?? v.nodeId) || '—';
      if (!byOrder.has(v.orderId)) byOrder.set(v.orderId, []);
      byOrder.get(v.orderId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
    });
    return Array.from(byOrder.entries())
      .map(([orderId, partners]) => {
        const order = orders.find(o => o.id === orderId);
        const product = products.find(p => p.id === order?.productId);
        const milestoneIndex = (nodeId: string) => {
          const idx = order?.milestones?.findIndex(m => m.templateId === nodeId) ?? -1;
          return idx >= 0 ? idx : 9999;
        };
        const sortedPartners = [...partners].sort((a, b) => milestoneIndex(a.nodeId) - milestoneIndex(b.nodeId));
        return {
          orderId,
          orderNumber: order?.orderNumber ?? orderId,
          productName: product?.name ?? order?.productName ?? '—',
          partners: sortedPartners
        };
      })
      .sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''));
  }, [limitType, records, orders, products, globalNodes]);

  /** 外协流水：按 单据号+工单+产品 聚合，同一单据下不同工单各占一行（两产品同时新增则显示两条） */
  const outsourceFlowSummaryRows = useMemo(() => {
    if (limitType !== 'OUTSOURCE') return [];
    const outsourceList = records.filter(r => r.type === 'OUTSOURCE');
    const key = (docNo: string, orderId: string, productId: string) => `${docNo}|${orderId}|${productId}`;
    const byKey = new Map<string, { docNo: string; orderId: string; orderNumber: string; productId: string; productName: string; records: ProductionOpRecord[] }>();
    outsourceList.forEach(rec => {
      const docNo = rec.docNo ?? '—';
      const oid = rec.orderId || '';
      const pid = rec.productId || '';
      const order = orders.find(o => o.id === oid);
      const product = products.find(p => p.id === pid);
      const k = key(docNo, oid, pid);
      if (!byKey.has(k)) {
        byKey.set(k, {
          docNo,
          orderId: oid,
          orderNumber: order?.orderNumber ?? oid,
          productId: pid,
          productName: product?.name ?? '—',
          records: []
        });
      }
      byKey.get(k)!.records.push(rec);
    });
    return Array.from(byKey.values())
      .map(row => {
        const sorted = [...row.records].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const earliest = sorted[sorted.length - 1];
        const dateStr = earliest?.timestamp ? (() => { try { const d = new Date(earliest.timestamp); return isNaN(d.getTime()) ? earliest.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return earliest.timestamp; } })() : '—';
        const partner = row.records[0]?.partner ?? '—';
        const totalQuantity = row.records.reduce((s, r) => s + r.quantity, 0);
        const remark = row.records.map(r => r.reason).filter(Boolean)[0] ?? '—';
        const nodeNames = [...new Set(row.records.map(r => r.nodeId).filter(Boolean))].map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid);
        const milestoneStr = nodeNames.length ? nodeNames.join('、') : '—';
        const hasDispatch = row.records.some(r => r.status !== '已收回');
        const hasReceive = row.records.some(r => r.status === '已收回');
        const typeStr = hasDispatch && hasReceive ? '发出、收回' : hasDispatch ? '发出' : '收回';
        return { ...row, records: sorted, dateStr, partner, totalQuantity, remark, milestoneStr, typeStr };
      })
      .sort((a, b) => {
        const tA = a.records[0]?.timestamp ?? '';
        const tB = b.records[0]?.timestamp ?? '';
        return new Date(tB).getTime() - new Date(tA).getTime();
      });
  }, [limitType, records, orders, products, globalNodes]);

  /** 外协流水：按搜索条件过滤（日期范围、类型；外协工厂/单号/产品/工序模糊） */
  const filteredOutsourceFlowRows = useMemo(() => {
    let list = outsourceFlowSummaryRows;
    if (flowFilterDateFrom.trim()) {
      const from = flowFilterDateFrom.trim();
      list = list.filter(row => {
        const ts = row.records.length ? row.records[row.records.length - 1]?.timestamp : '';
        const d = ts ? new Date(ts).toISOString().split('T')[0] : '';
        return d >= from;
      });
    }
    if (flowFilterDateTo.trim()) {
      const to = flowFilterDateTo.trim();
      list = list.filter(row => {
        const ts = row.records.length ? row.records[row.records.length - 1]?.timestamp : '';
        const d = ts ? new Date(ts).toISOString().split('T')[0] : '';
        return d <= to;
      });
    }
    if (flowFilterType !== 'all') {
      list = list.filter(row => (row.typeStr || '').includes(flowFilterType));
    }
    if (flowFilterPartner.trim()) {
      const kw = flowFilterPartner.trim().toLowerCase();
      list = list.filter(row => (row.partner ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterDocNo.trim()) {
      const kw = flowFilterDocNo.trim().toLowerCase();
      list = list.filter(row => (row.docNo ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterOrder.trim()) {
      const kw = flowFilterOrder.trim().toLowerCase();
      list = list.filter(row => (row.orderNumber ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterProduct.trim()) {
      const kw = flowFilterProduct.trim().toLowerCase();
      list = list.filter(row => (row.productName ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterMilestone.trim()) {
      const nodeId = flowFilterMilestone.trim();
      list = list.filter(row => row.records.some(r => r.nodeId === nodeId));
    }
    return list;
  }, [outsourceFlowSummaryRows, flowFilterDateFrom, flowFilterDateTo, flowFilterType, flowFilterPartner, flowFilterDocNo, flowFilterOrder, flowFilterProduct, flowFilterMilestone]);

  /** 外协流水：当前筛选结果下的发出/收回数量合计（用于合计行） */
  const { outsourceFlowTotalDispatch, outsourceFlowTotalReceive } = useMemo(() => {
    let dispatch = 0;
    let receive = 0;
    filteredOutsourceFlowRows.forEach(row => {
      row.records.forEach(r => {
        if (r.status === '加工中') dispatch += r.quantity;
        else if (r.status === '已收回') receive += r.quantity;
      });
    });
    return { outsourceFlowTotalDispatch: dispatch, outsourceFlowTotalReceive: receive };
  }, [filteredOutsourceFlowRows]);

  const handlePrint = (rec: ProductionOpRecord) => {
    window.print();
  };

  /** 委外发出单号规则：WX-合作单位编号-序号（编号与序号不显示在界面，仅用于对单）。合作单位编号与序号均可自动升位（>9999 变为 5 位）。 */
  const OUTSOURCE_DOCNO_REGEX = /^WX-(\d+)-(\d+)$/;
  const getPartnerCodeFromName = (partnerName: string): number => {
    const withCode = records.filter(r => r.type === 'OUTSOURCE' && r.partner === partnerName && r.docNo && OUTSOURCE_DOCNO_REGEX.test(r.docNo));
    if (withCode.length > 0) {
      const m = withCode[0].docNo!.match(OUTSOURCE_DOCNO_REGEX);
      if (m) return parseInt(m[1], 10);
    }
    const allNew = records.filter(r => r.type === 'OUTSOURCE' && r.docNo && OUTSOURCE_DOCNO_REGEX.test(r.docNo));
    const codes = allNew.map(r => { const m = r.docNo!.match(OUTSOURCE_DOCNO_REGEX); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
    return codes.length ? Math.max(...codes) + 1 : 1;
  };
  const getNextSeqForPartner = (partnerCodeNum: number): number => {
    const withNewFormat = records.filter(r => r.type === 'OUTSOURCE' && r.docNo && OUTSOURCE_DOCNO_REGEX.test(r.docNo!));
    const samePartner = withNewFormat.filter(r => {
      const m = r.docNo!.match(OUTSOURCE_DOCNO_REGEX);
      return m && parseInt(m[1], 10) === partnerCodeNum;
    });
    const seqs = samePartner.map(r => { const m = r.docNo!.match(OUTSOURCE_DOCNO_REGEX); return m ? parseInt(m[2], 10) : 0; }).filter(n => n > 0);
    return seqs.length ? Math.max(...seqs) + 1 : 1;
  };
  const getNextOutsourceDocNo = (partnerName: string): string => {
    const code = getPartnerCodeFromName(partnerName);
    const seq = getNextSeqForPartner(code);
    return `WX-${String(code).padStart(4, '0')}-${String(seq).padStart(4, '0')}`;
  };

  /** 外协收回单号规则：WX-R-合作单位编号-序号（与发出 WX- 区分，收回单独序号池） */
  const OUTSOURCE_RECEIVE_DOCNO_REGEX = /^WX-R-(\d+)-(\d+)$/;
  const getPartnerCodeFromNameForReceive = (partnerName: string): number => {
    const withCode = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === partnerName && r.docNo && OUTSOURCE_RECEIVE_DOCNO_REGEX.test(r.docNo));
    if (withCode.length > 0) {
      const m = withCode[0].docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX);
      if (m) return parseInt(m[1], 10);
    }
    const allReceive = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.docNo && OUTSOURCE_RECEIVE_DOCNO_REGEX.test(r.docNo));
    const codes = allReceive.map(r => { const m = r.docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
    return codes.length ? Math.max(...codes) + 1 : 1;
  };
  const getNextSeqForPartnerReceive = (partnerCodeNum: number): number => {
    const withFormat = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.docNo && OUTSOURCE_RECEIVE_DOCNO_REGEX.test(r.docNo!));
    const samePartner = withFormat.filter(r => {
      const m = r.docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX);
      return m && parseInt(m[1], 10) === partnerCodeNum;
    });
    const seqs = samePartner.map(r => { const m = r.docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX); return m ? parseInt(m[2], 10) : 0; }).filter(n => n > 0);
    return seqs.length ? Math.max(...seqs) + 1 : 1;
  };
  const getNextReceiveDocNo = (partnerName: string): string => {
    const code = getPartnerCodeFromNameForReceive(partnerName);
    const seq = getNextSeqForPartnerReceive(code);
    return `WX-R-${String(code).padStart(4, '0')}-${String(seq).padStart(4, '0')}`;
  };

  /** 旧规则生成的外协记录（无 docNo 或既非 WX- 发出格式也非 WX-R- 收回格式），用于一键清除 */
  const oldFormatOutsourceRecords = useMemo(() =>
    records.filter(r => {
      if (r.type !== 'OUTSOURCE') return false;
      if (!r.docNo) return true;
      if (OUTSOURCE_DOCNO_REGEX.test(r.docNo)) return false;
      if (OUTSOURCE_RECEIVE_DOCNO_REGEX.test(r.docNo)) return false;
      return true;
    }),
    [records]
  );

  /** 待发清单第二步：从表单弹窗确认发出 */
  const handleDispatchFormSubmit = () => {
    const partnerName = (dispatchPartnerName || '').trim();
    if (!partnerName) {
      alert('请选择外协工厂。');
      return;
    }
    const entries = Object.entries(dispatchFormQuantities).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      alert('请至少填写一项委外数量。');
      return;
    }
    const docNo = getNextOutsourceDocNo(partnerName);
    const timestamp = new Date().toLocaleString();
    entries.forEach(([key, qty]) => {
      const parts = key.split('|');
      const orderId = parts[0];
      const nodeId = parts[1];
      const variantId = parts[2];
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      onAddRecord({
        id: `rec-${Date.now()}-${key.replace(/\|/g, '-')}`,
        type: 'OUTSOURCE',
        orderId,
        productId: order.productId,
        quantity: qty,
        reason: dispatchRemark.trim() || undefined,
        operator: '张主管',
        timestamp,
        status: '加工中',
        partner: partnerName,
        docNo,
        nodeId,
        variantId: variantId || undefined
      });
    });
    setDispatchFormQuantities({});
    setDispatchRemark('');
    setDispatchPartnerName('');
    setDispatchPartnerOpen(false);
    setDispatchPartnerSearch('');
    setDispatchPartnerCategoryTab('all');
    setDispatchFormModalOpen(false);
    setOutsourceModal(null);
    setDispatchSelectedKeys(new Set());
  };

  /** 待收回：确认收回（使用 WX-R 开头的收回单号，与发出单号区分） */
  const handleOutsourceReceiveSubmit = () => {
    if (!receiveModal || receiveQty <= 0) return;
    if (receiveQty > receiveModal.pendingQty) {
      alert(`本次收回数量不能大于待收回数量（${receiveModal.pendingQty}）。`);
      return;
    }
    const receiveDocNo = getNextReceiveDocNo(receiveModal.partner);
    onAddRecord({
      id: `rec-${Date.now()}-receive`,
      type: 'OUTSOURCE',
      orderId: receiveModal.orderId,
      productId: receiveModal.productId,
      quantity: receiveQty,
      operator: '张主管',
      timestamp: new Date().toLocaleString(),
      status: '已收回',
      partner: receiveModal.partner,
      nodeId: receiveModal.nodeId,
      docNo: receiveDocNo
    });
    setReceiveModal(null);
    setReceiveQty(0);
  };

  /** 待收回清单第二步：从表单弹窗确认收货（按规格写入已收回记录，带出原发出单号） */
  const handleReceiveFormSubmit = () => {
    const entries = Object.entries(receiveFormQuantities).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      alert('请至少填写一项收回数量。');
      return;
    }
    for (const [key, qty] of entries) {
      const parts = key.split('|');
      const orderId = parts[0];
      const nodeId = parts[1];
      const variantId = parts[2];
      const row = outsourceReceiveRows.find(r => r.orderId === orderId && r.nodeId === nodeId);
      if (!row) continue;
      if (parts.length === 3) {
        const dispatchRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === orderId && r.nodeId === nodeId);
        const receiveRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.orderId === orderId && r.nodeId === nodeId);
        const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
        const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
        const maxQty = Math.max(0, dispatched - received);
        if (qty > maxQty) {
          alert(`本次收回数量不能大于待收数量（最多${maxQty}）。`);
          return;
        }
      } else {
        if (qty > row.pending) {
          alert(`本次收回数量不能大于待收数量（最多${row.pending}）。`);
          return;
        }
      }
    }
    const timestamp = new Date().toLocaleString();
    const firstKey = receiveSelectedKeys.values().next().value;
    const firstRow = firstKey ? outsourceReceiveRows.find(r => `${r.orderId}|${r.nodeId}` === firstKey) : null;
    const partnerName = firstRow?.partner ?? '';
    const receiveDocNo = getNextReceiveDocNo(partnerName);
    for (const [key, qty] of entries) {
      const parts = key.split('|');
      const orderId = parts[0];
      const nodeId = parts[1];
      const variantId = parts[2];
      const order = orders.find(o => o.id === orderId);
      if (!order) continue;
      onAddRecord({
        id: `rec-${Date.now()}-${key.replace(/\|/g, '-')}`,
        type: 'OUTSOURCE',
        orderId,
        productId: order.productId,
        quantity: qty,
        reason: receiveFormRemark.trim() || undefined,
        operator: '张主管',
        timestamp,
        status: '已收回',
        partner: partnerName,
        nodeId,
        variantId: variantId || undefined,
        docNo: receiveDocNo
      });
    }
    setReceiveFormQuantities({});
    setReceiveFormRemark('');
    setReceiveFormModalOpen(false);
    setReceiveSelectedKeys(new Set());
  };

  /** 领料/退料单据号：领料 LLyyyyMMdd-0001，退料 TLyyyyMMdd-0001，当日同类型顺序递增 */
  const getNextStockDocNo = (type: 'STOCK_OUT' | 'STOCK_RETURN') => {
    const prefix = type === 'STOCK_OUT' ? 'LL' : 'TL';
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === type && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  /** 根据单据号从流水中聚合出单据详情（用于「查看详情」） */
  const buildStockDocDetailFromDocNo = (docNo: string) => {
    const docRecords = stockFlowRecords.filter(r => r.docNo === docNo);
    if (docRecords.length === 0) return null;
    const first = docRecords[0];
    return {
      docNo,
      type: first.type as 'STOCK_OUT' | 'STOCK_RETURN',
      orderId: first.orderId ?? '',
      timestamp: first.timestamp,
      warehouseId: first.warehouseId ?? '',
      lines: docRecords.map(r => ({ productId: r.productId, quantity: r.quantity })),
      reason: first.reason,
      operator: first.operator
    };
  };

  const handleStockConfirmSubmit = () => {
    if (!stockSelectOrderId || !stockSelectMode) return;
    const toSubmit = Array.from(stockSelectedIds).filter(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
    if (toSubmit.length === 0) return;
    const recordType: ProdOpType = stockSelectMode === 'stock_out' ? 'STOCK_OUT' : 'STOCK_RETURN';
    const docNo = getNextStockDocNo(recordType);
    const timestamp = new Date().toLocaleString();
    const operator = '张主管';
    toSubmit.forEach(pid => {
      onAddRecord({
        id: `rec-${Date.now()}-${pid}`,
        type: recordType,
        orderId: stockSelectOrderId,
        productId: pid,
        quantity: stockConfirmQuantities[pid],
        reason: stockConfirmReason || undefined,
        operator,
        timestamp,
        status: '已完成',
        warehouseId: stockConfirmWarehouseId || undefined,
        docNo
      });
    });
    setStockDocDetail({
      docNo,
      type: recordType,
      orderId: stockSelectOrderId,
      timestamp,
      warehouseId: stockConfirmWarehouseId || '',
      lines: toSubmit.map(pid => ({ productId: pid, quantity: stockConfirmQuantities[pid] })),
      reason: stockConfirmReason || undefined,
      operator
    });
    setShowStockConfirmModal(false);
    setStockSelectOrderId(null);
    setStockSelectMode(null);
    setStockSelectedIds(new Set());
    setStockConfirmQuantities({});
    setStockConfirmReason('');
  };

  const openStockModal = (mode: 'stock_out' | 'stock_return', order: ProductionOrder) => {
    setStockModalMode(mode);
    setForm({ orderId: order.id, productId: order.productId || '', quantity: 0, reason: '', partner: '', warehouseId: warehouses[0]?.id ?? '' });
    setShowModal(true);
  };

  const handleAdd = () => {
    if (!limitType) return;
    const isStockReturn = limitType === 'STOCK_OUT' && stockModalMode === 'stock_return';
    const recordType: ProdOpType = isStockReturn ? 'STOCK_RETURN' : (stockModalMode === 'stock_out' ? 'STOCK_OUT' : limitType);
    const docNo = (recordType === 'STOCK_OUT' || recordType === 'STOCK_RETURN') ? getNextStockDocNo(recordType) : undefined;
    const newRecord: ProductionOpRecord = {
      id: `rec-${Date.now()}`,
      type: recordType,
      orderId: form.orderId,
      productId: form.productId,
      quantity: form.quantity,
      reason: form.reason,
      partner: form.partner,
      operator: '张主管',
      timestamp: new Date().toLocaleString(),
      status: limitType === 'OUTSOURCE' ? '加工中' : '已完成',
      warehouseId: form.warehouseId || undefined,
      docNo
    };
    onAddRecord(newRecord);
    setShowModal(false);
    setStockModalMode(null);
    setForm({ orderId: '', productId: '', quantity: 0, reason: '', partner: '', warehouseId: '' });
  };

  const isProductionMaterial = limitType === 'STOCK_OUT';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{currentBiz?.label || '业务流水'}</h1>
          <p className="text-slate-500 mt-1 italic text-sm">{currentBiz?.sub || '处理生产业务流水记录'}</p>
        </div>
        {!showModal && isProductionMaterial && (
          <button
            type="button"
            onClick={() => setShowStockFlowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-indigo-600 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all"
          >
            <ScrollText className="w-4 h-4" />
            领料退料流水
          </button>
        )}
        {!showModal && limitType === 'OUTSOURCE' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOutsourceModal('dispatch')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ClipboardList className="w-4 h-4" /> 待发清单
            </button>
            <button
              type="button"
              onClick={() => setOutsourceModal('receive')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ArrowDownToLine className="w-4 h-4" /> 待收回清单
            </button>
            <button
              type="button"
              onClick={() => setOutsourceModal('flow')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ScrollText className="w-4 h-4" /> 外协流水
            </button>
          </div>
        )}
        {!showModal && limitType === 'REWORK' && (
          <button
            type="button"
            onClick={() => setReworkPendingModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ClipboardList className="w-4 h-4" /> 待处理不良
          </button>
        )}
        {!showModal && !isProductionMaterial && limitType !== 'OUTSOURCE' && limitType !== 'REWORK' && (
          <button
            onClick={() => { setShowModal(true); setStockModalMode(null); }}
            className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-sm font-bold transition-all shadow-lg ${currentBiz?.bg || 'bg-indigo-600'}`}
          >
            <Plus className="w-4 h-4" /> 记录新业务
          </button>
        )}
      </div>

      {isProductionMaterial && !showModal && (
        <div className="space-y-6">
          {parentOrders.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">暂无工单，请先在「生产计划」下达工单</p>
            </div>
          ) : (
            parentOrders.map(order => {
              const product = products.find(p => p.id === order.productId);
              const materials = parentMaterialStats.get(order.id) ?? [];
              const familyIds = getOrderFamilyIds(order.id);
              const childCount = familyIds.length - 1;
              return (
                <div key={order.id} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          工单号: {order.orderNumber}
                          {childCount > 0 && <span className="ml-2 text-slate-400 font-normal">（含 {childCount} 个子工单）</span>}
                        </p>
                        {order.priority && order.priority !== 'Medium' && (
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-bold ${order.priority === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {order.priority === 'High' ? 'HIGH' : 'LOW'}
                          </span>
                        )}
                        <p className="text-base font-bold text-slate-900 mt-0.5">{product?.name ?? order.productName ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stockSelectOrderId === order.id && stockSelectMode ? (
                        <>
                          <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (stockSelectedIds.size === 0) return;
                              setStockConfirmQuantities(
                                Array.from(stockSelectedIds).reduce((acc, id) => ({ ...acc, [id]: 0 }), {} as Record<string, number>)
                              );
                              setStockConfirmWarehouseId(warehouses[0]?.id ?? '');
                              setShowStockConfirmModal(true);
                            }}
                            disabled={stockSelectedIds.size === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                          >
                            <Check className="w-3.5 h-3.5" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> 生产退料
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80">
                          {stockSelectOrderId === order.id && (
                            <th className="px-4 py-3 w-12">
                              <input
                                type="checkbox"
                                checked={materials.length > 0 && materials.every(m => stockSelectedIds.has(m.productId))}
                                onChange={e => {
                                  if (e.target.checked) setStockSelectedIds(new Set(materials.map(m => m.productId)));
                                  else setStockSelectedIds(new Set());
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </th>
                          )}
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料信息</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">生产领料(+)</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">生产退料(-)</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">净领用</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">报工耗材<span className="text-slate-300 font-normal">(理论)</span></th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">当前结余</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {materials.length === 0 ? (
                          <tr>
                            <td colSpan={stockSelectOrderId === order.id ? 7 : 6} className="px-6 py-8 text-center text-slate-400 text-sm">该工单暂无 BOM 物料，请先在产品中配置 BOM</td>
                          </tr>
                        ) : (
                          materials.map(({ productId, issue, returnQty, theoryCost }) => {
                            const prod = products.find(p => p.id === productId);
                            const net = issue - returnQty;
                            const isSelected = stockSelectedIds.has(productId);
                            return (
                              <tr key={productId} className="hover:bg-slate-50/50 transition-colors">
                                {stockSelectOrderId === order.id && (
                                  <td className="px-4 py-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {
                                        setStockSelectedIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(productId)) next.delete(productId);
                                          else next.add(productId);
                                          return next;
                                        });
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                  </td>
                                )}
                                <td className="px-6 py-3">
                                  <div>
                                    <p className="text-sm font-bold text-slate-800">{prod?.name ?? '未知物料'}</p>
                                    {prod?.sku && <p className="text-[10px] text-slate-400 font-medium">{prod.sku}</p>}
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-indigo-600 inline-flex items-center gap-0.5">{issue} <ArrowUpFromLine className="w-3.5 h-3.5 opacity-70" /></span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-rose-600 inline-flex items-center gap-0.5">{returnQty} <Undo2 className="w-3.5 h-3.5 opacity-70" /></span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-slate-800">{net}</span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-amber-600">{Math.round(theoryCost * 100) / 100}</span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  {(() => {
                                    const balance = net - theoryCost;
                                    const rounded = Math.round(balance * 100) / 100;
                                    return (
                                      <span className={`text-sm font-bold ${rounded >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{rounded}</span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {limitType === 'REWORK' && !showModal && !reworkPendingModalOpen && (
        <div className="space-y-4">
          {parentOrders.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">暂无工单，请先在「生产计划」下达工单</p>
            </div>
          ) : reworkListBlocks.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">暂无返工记录，请先在「待处理不良」中处理不良品</p>
            </div>
          ) : (
            reworkListBlocks.map((block) => {
              const renderReworkCard = (order: ProductionOrder, isChild?: boolean, indentPx?: number) => {
                const product = products.find(p => p.id === order.productId);
                const stats = reworkStatsByOrderId.get(order.id) ?? [];
                const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const cardClass = isChild
                  ? 'bg-white p-5 rounded-2xl border border-l-4 border-l-slate-300 border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 lg:gap-10 items-center'
                  : 'bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 lg:gap-10 items-center';
                return (
                  <div key={order.id} className={cardClass} style={indentPx != null && indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                    <div className="flex items-center gap-6 min-w-0">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => navigate('/production', { state: { tab: 'orders', detailOrderId: order.id } })} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none block`}>
                          <img src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => navigate('/production', { state: { tab: 'orders', detailOrderId: order.id } })} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors`}>
                          <Layers className={isChild ? 'w-6 h-6' : 'w-7 h-7'} />
                        </button>
                      )}
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{order.orderNumber}</span>
                          {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子工单</span>}
                          <span className={`font-bold text-slate-800 ${isChild ? 'text-base' : 'text-lg'}`}>{order.productName || '未知产品'}</span>
                          {order.sku && <span className="text-[10px] font-bold text-slate-500">{order.sku}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          {productionLinkMode !== 'product' && order.customer && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.customer}</span>}
                          <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>
                          {order.startDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 开始: {order.startDate}</span>}
                          {order.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 交期: {order.dueDate}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {stats.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x">
                          <div className="flex items-stretch gap-2 flex-nowrap py-1 w-max">
                            {stats.map(({ nodeId, nodeName, totalQty, completedQty, pendingQty }) => {
                              const isAllDone = pendingQty <= 0;
                              return (
                                <div
                                  key={nodeId}
                                  title={`工序「${nodeName}」返工：总 ${totalQty}，已返工 ${completedQty}，未返工 ${pendingQty}`}
                                  className="flex flex-col items-center shrink-0 min-w-[88px] py-2 px-2 rounded-xl border bg-slate-50 border-slate-100"
                                >
                                  <span className="text-[10px] font-bold text-indigo-600 mb-2 truncate w-full text-center">{nodeName}</span>
                                  <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-2 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                    <span className="text-base font-black text-slate-900">{pendingQty}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                    <span>{totalQty} / <span className="text-slate-600">{completedQty}</span></span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 text-slate-400 text-sm italic">该工单暂无返工工序</div>
                      )}
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate('/production', { state: { tab: 'orders', detailOrderId: order.id } })}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/production', { state: { tab: 'orders', materialIssueOrderId: order.id } })}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <Package className="w-3.5 h-3.5" /> 物料
                        </button>
                      </div>
                    </div>
                  </div>
                );
              };

              if (block.type === 'single') {
                return <div key={block.order.id}>{renderReworkCard(block.order)}</div>;
              }
              const { parent, children: childList } = block;
              const allWithDepth = getOrderFamilyWithDepth(parent.id);
              const isExpanded = reworkExpandedParents.has(parent.id);
              return (
                <div key={`rework-parentChild-${parent.id}`} className="rounded-2xl border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setReworkExpandedParents(prev => { const next = new Set(prev); if (next.has(parent.id)) next.delete(parent.id); else next.add(parent.id); return next; })}
                    className="w-full px-4 py-2 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2 hover:bg-slate-200/60 transition-colors text-left"
                    title={isExpanded ? '收起子工单' : '展开子工单'}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />}
                    <Plus className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">主工单及子工单（共 {allWithDepth.length} 条）</span>
                  </button>
                  <div className="p-3 space-y-2">
                    {isExpanded ? allWithDepth.map(({ order, depth }) => renderReworkCard(order, depth > 0, depth > 0 ? 24 * depth : 0)) : renderReworkCard(parent)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 确认领料/退料弹窗：布局与编辑页一致 */}
      {showStockConfirmModal && stockSelectOrderId && stockSelectMode && isProductionMaterial && (() => {
        const order = orders.find(o => o.id === stockSelectOrderId);
        const selectedList = Array.from(stockSelectedIds);
        const hasValidQty = selectedList.some(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
        const isReturn = stockSelectMode === 'stock_return';
        const getUnitName = (productId: string) => {
          const p = products.find(x => x.id === productId);
          return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
        };
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                    {order?.orderNumber ?? ''}
                  </span>
                  {isReturn ? '确认退料' : '确认领料'}
                </h3>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                  <button
                    type="button"
                    onClick={handleStockConfirmSubmit}
                    disabled={!hasValidQty}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 ${isReturn ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  >
                    <Check className="w-4 h-4" /> {isReturn ? '确认退料' : '确认领料'}
                  </button>
                  <button type="button" onClick={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-6">
                <h2 className="text-xl font-bold text-slate-900">{order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—'}</h2>
                <div className={`grid gap-3 ${warehouses.length > 0 ? 'grid-cols-[1fr_1.5fr]' : 'grid-cols-1'}`}>
                  {warehouses.length > 0 && (
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{isReturn ? '退回仓库' : '出库仓库'}</p>
                      <select
                        value={stockConfirmWarehouseId}
                        onChange={e => setStockConfirmWarehouseId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="bg-slate-50 rounded-xl px-4 py-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">备注</p>
                    <input
                      type="text"
                      value={stockConfirmReason}
                      onChange={e => setStockConfirmReason(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="选填"
                    />
                  </div>
                </div>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedList.map(pid => {
                        const prod = products.find(p => p.id === pid);
                        return (
                          <tr key={pid} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? pid}</td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={stockConfirmQuantities[pid] ?? ''}
                                onChange={e => setStockConfirmQuantities(prev => ({ ...prev, [pid]: Number(e.target.value) || 0 }))}
                                className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-4 py-3 text-slate-500">{getUnitName(pid)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 领料/退料单保存后的单据详情弹窗 */}
      {stockDocDetail && isProductionMaterial && (() => {
        const order = orders.find(o => o.id === stockDocDetail.orderId);
        const warehouse = warehouses.find(w => w.id === stockDocDetail.warehouseId);
        const getUnitName = (productId: string) => {
          const p = products.find(x => x.id === productId);
          return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
        };
        const isReturn = stockDocDetail.type === 'STOCK_RETURN';
        const isEditing = stockDocEditForm !== null;
        const startEdit = () => setStockDocEditForm({
          warehouseId: stockDocDetail.warehouseId,
          lines: stockDocDetail.lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
          reason: stockDocDetail.reason ?? ''
        });
        const cancelEdit = () => setStockDocEditForm(null);
        const saveEdit = () => {
          if (!stockDocEditForm || !onUpdateRecord) return;
          const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
          docRecords.forEach(rec => {
            const line = stockDocEditForm.lines.find(l => l.productId === rec.productId);
            if (line) {
              onUpdateRecord({
                ...rec,
                quantity: line.quantity,
                warehouseId: stockDocEditForm.warehouseId || undefined,
                reason: stockDocEditForm.reason.trim() || undefined
              });
            }
          });
          setStockDocDetail(prev => prev ? {
            ...prev,
            warehouseId: stockDocEditForm.warehouseId,
            lines: stockDocEditForm.lines,
            reason: stockDocEditForm.reason.trim() || undefined
          } : null);
          setStockDocEditForm(null);
        };
        const form = stockDocEditForm;
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStockDocDetail(null); setStockDocEditForm(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                    {order?.orderNumber ?? stockDocDetail.docNo}
                  </span>
                  {isReturn ? '退料单详情' : '领料单详情'}
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
                      {onUpdateRecord && (
                        <button
                          type="button"
                          onClick={startEdit}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`确定要删除该张${isReturn ? '退料' : '领料'}单的所有记录吗？此操作不可恢复。`)) return;
                            const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
                            docRecords.forEach(rec => onDeleteRecord(rec.id));
                            setStockDocDetail(null);
                            setStockDocEditForm(null);
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                        >
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setStockDocDetail(null); setStockDocEditForm(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-6">
                <h2 className="text-xl font-bold text-slate-900">{order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—'}</h2>
                {!isEditing ? (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">单据号</p>
                        <p className="text-sm font-bold text-slate-800 font-mono">{stockDocDetail.docNo}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">类型</p>
                        <p className="text-sm font-bold text-slate-800">{isReturn ? '退料' : '领料'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工单号</p>
                        <p className="text-sm font-bold text-indigo-600">{order?.orderNumber ?? stockDocDetail.orderId}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">业务时间</p>
                        <p className="text-sm font-bold text-slate-800">{stockDocDetail.timestamp}</p>
                      </div>
                      {warehouse && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">{isReturn ? '退回仓库' : '出库仓库'}</p>
                          <p className="text-sm font-bold text-slate-800">{warehouse.name}{warehouse.code ? ` (${warehouse.code})` : ''}</p>
                        </div>
                      )}
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">经办</p>
                        <p className="text-sm font-bold text-slate-800">{stockDocDetail.operator}</p>
                      </div>
                      {stockDocDetail.reason && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">备注</p>
                          <p className="text-sm font-bold text-slate-800">{stockDocDetail.reason}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto -mt-2">
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stockDocDetail.lines.map(({ productId, quantity }) => {
                              const prod = products.find(p => p.id === productId);
                              return (
                                <tr key={productId} className="border-b border-slate-100">
                                  <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                                  <td className="px-4 py-3 font-bold text-indigo-600 text-right">{quantity}</td>
                                  <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {form && (
                      <>
                        <div className="grid grid-cols-[1fr_1.5fr] gap-3">
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{isReturn ? '退回仓库' : '出库仓库'}</p>
                            <select
                              value={form.warehouseId}
                              onChange={e => setStockDocEditForm(prev => prev ? { ...prev, warehouseId: e.target.value } : null)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                              {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                              ))}
                            </select>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">备注</p>
                            <input
                              type="text"
                              value={form.reason}
                              onChange={e => setStockDocEditForm(prev => prev ? { ...prev, reason: e.target.value } : null)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="选填"
                            />
                          </div>
                        </div>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                              </tr>
                            </thead>
                            <tbody>
                              {form.lines.map(({ productId, quantity }) => {
                                const prod = products.find(p => p.id === productId);
                                return (
                                  <tr key={productId} className="border-b border-slate-100">
                                    <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        value={quantity}
                                        onChange={e => {
                                          const v = Number(e.target.value) || 0;
                                          setStockDocEditForm(prev => prev ? {
                                            ...prev,
                                            lines: prev.lines.map(l => l.productId === productId ? { ...l, quantity: v } : l)
                                          } : null);
                                        }}
                                        className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 领料退料流水弹窗（样式参考报工流水） */}
      {showStockFlowModal && isProductionMaterial && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowStockFlowModal(false)} aria-hidden />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 领料退料流水</h3>
              <button type="button" onClick={() => setShowStockFlowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                  <input
                    type="date"
                    value={stockFlowFilterDateFrom}
                    onChange={e => setStockFlowFilterDateFrom(e.target.value)}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                  <input
                    type="date"
                    value={stockFlowFilterDateTo}
                    onChange={e => setStockFlowFilterDateTo(e.target.value)}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                  <select
                    value={stockFlowFilterType}
                    onChange={e => setStockFlowFilterType(e.target.value as 'all' | 'STOCK_OUT' | 'STOCK_RETURN')}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  >
                    <option value="all">全部</option>
                    <option value="STOCK_OUT">领料</option>
                    <option value="STOCK_RETURN">退料</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">工单</label>
                  <input
                    type="text"
                    value={stockFlowFilterOrderKeyword}
                    onChange={e => setStockFlowFilterOrderKeyword(e.target.value)}
                    placeholder="工单号模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">物料</label>
                  <input
                    type="text"
                    value={stockFlowFilterProductKeyword}
                    onChange={e => setStockFlowFilterProductKeyword(e.target.value)}
                    placeholder="物料名称模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
                  <input
                    type="text"
                    value={stockFlowFilterDocNo}
                    onChange={e => setStockFlowFilterDocNo(e.target.value)}
                    placeholder="LL/TL 模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => { setStockFlowFilterType('all'); setStockFlowFilterOrderKeyword(''); setStockFlowFilterProductKeyword(''); setStockFlowFilterDocNo(''); setStockFlowFilterDateFrom(''); setStockFlowFilterDateTo(''); }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  清空筛选
                </button>
                <span className="text-xs text-slate-400">共 {filteredStockFlowRecords.length} 条</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {filteredStockFlowRecords.length === 0 ? (
                <p className="text-slate-500 text-center py-12">暂无领料/退料流水</p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">业务时间</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">原因/备注</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">经办</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStockFlowRecords.map(rec => {
                        const order = orders.find(o => o.id === rec.orderId);
                        const product = products.find(p => p.id === rec.productId);
                        const isReturn = rec.type === 'STOCK_RETURN';
                        const docNo = rec.docNo ?? '';
                        const openDetail = () => {
                          if (!docNo) return;
                          const detail = buildStockDocDetailFromDocNo(docNo);
                          if (detail) setStockDocDetail(detail);
                        };
                        return (
                          <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{rec.docNo ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${isReturn ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                {isReturn ? <Undo2 className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                                {isReturn ? '退料' : '领料'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{rec.timestamp}</td>
                            <td className="px-4 py-3 text-[10px] font-black text-indigo-600 uppercase">{order?.orderNumber ?? '—'}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{product?.name ?? '未知物料'}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{rec.quantity}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{rec.reason ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">{rec.operator}</td>
                            <td className="px-4 py-3">
                              {docNo ? (
                                <button
                                  type="button"
                                  onClick={openDetail}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                                >
                                  <FileText className="w-3.5 h-3.5" /> 详情
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <td className="px-4 py-3" colSpan={9}>
                          <span className="text-[10px] text-slate-500 uppercase mr-3">合计</span>
                          <span className="text-xs text-indigo-600">领料 {countIssue} 条，{totalIssueQty}</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-amber-600">退料 {countReturn} 条，{totalReturnQty}</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-slate-700">净领料 {Math.round((totalIssueQty - totalReturnQty) * 100) / 100}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {limitType === 'OUTSOURCE' && !showModal && outsourceModal === null && (
        <div className="space-y-6">
          {outsourceStatsByOrder.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <Truck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">暂无委外数据，请点击上方「待发清单」「待收回清单」或「外协流水」操作。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {outsourceStatsByOrder.map(({ orderId, orderNumber, productName, partners }) => {
                const order = orders.find(o => o.id === orderId);
                const product = products.find(p => p.id === order?.productId);
                const orderTotalQty = order?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                return (
                <div
                  key={orderId}
                  className="bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 lg:gap-10 items-center"
                >
                  <div className="flex items-center gap-6 min-w-0">
                    {product?.imageUrl ? (
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                        <img src={product.imageUrl} alt={productName} className="w-full h-full object-cover block" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600">
                        <Layers className="w-7 h-7" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{orderNumber}</span>
                        <span className="text-lg font-bold text-slate-800">{productName}</span>
                        {product?.sku && <span className="text-[10px] font-bold text-slate-500">{product.sku}</span>}
                        {product && categories.find(c => c.id === product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                          const val = product.categoryCustomData?.[f.id];
                          if (val == null || val === '') return null;
                          return <span key={f.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                        })}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                        {productionLinkMode !== 'product' && order?.customer && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.customer}</span>}
                        <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>
                        {order?.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 交期: {order.dueDate}</span>}
                        {order?.startDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 开始: {order.startDate}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {partners.map(({ partner, nodeId, nodeName, dispatched, received, pending }) => (
                      <div
                        key={`${partner}|${nodeId}`}
                        className="flex flex-col items-center shrink-0 min-w-[88px] py-2 px-2 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 transition-colors"
                      >
                        <div className="mb-2 w-full text-center leading-tight">
                          <div className="text-[10px] font-bold text-emerald-600 truncate" title={nodeName}>{nodeName}</div>
                          <div className="text-[10px] font-bold text-slate-600 truncate" title={partner}>{partner}</div>
                        </div>
                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-2 ${pending > 0 ? 'border-indigo-300' : 'border-emerald-400'}`}>
                          <span className="text-base font-black text-slate-900">{pending}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500">{dispatched} / {received}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFlowFilterOrder(orderNumber);
                              setFlowFilterProduct(productName);
                              setFlowFilterMilestone(nodeId);
                              setFlowFilterPartner(partner);
                              setOutsourceModal('flow');
                            }}
                            className="p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                            title="查看该产品、工序、加工厂的外协流水"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      )}

      {limitType === 'OUTSOURCE' && outsourceModal === 'dispatch' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOutsourceModal(null)} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600" /> 待发清单</h3>
              <button type="button" onClick={() => setOutsourceModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <p className="text-xs text-slate-500">仅显示工序节点中已开启「可外协」的工序；可委外数量 = 工单总量 − 该工序已报工 − 已委外发出。同一批次只能选择同一工序的工单同时发出。</p>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</label>
                <input
                  type="text"
                  value={dispatchListSearchOrder}
                  onChange={e => setDispatchListSearchOrder(e.target.value)}
                  placeholder="工单号模糊搜索"
                  className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">货号</label>
                <input
                  type="text"
                  value={dispatchListSearchProduct}
                  onChange={e => setDispatchListSearchProduct(e.target.value)}
                  placeholder="产品名/SKU 模糊搜索"
                  className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</label>
                <select
                  value={dispatchListSearchNodeId}
                  onChange={e => setDispatchListSearchNodeId(e.target.value)}
                  className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">全部</option>
                  {dispatchListNodeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                    <th className="w-12 px-4 py-3" />
                    <th className="w-[28%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>
                    <th className="w-[28%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">产品</th>
                    <th className="w-[20%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                    <th className="w-[24%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">可委外数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDispatchRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceDispatchRows.length === 0 ? '暂无可外协工序，或可委外数量均为 0。请在系统设置中为工序开启「可外协」并确保工单有未委外数量。' : '无匹配项，请调整搜索条件。'}</td>
                    </tr>
                  ) : (
                    filteredDispatchRows.map(row => {
                      const key = `${row.orderId}|${row.nodeId}`;
                      const checked = dispatchSelectedKeys.has(key);
                      return (
                        <tr key={key} className="hover:bg-slate-50/50 bg-white">
                          <td className="w-12 px-4 py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setDispatchSelectedKeys(prev => {
                                  const next = new Set(prev);
                                  if (next.has(key)) {
                                    next.delete(key);
                                    return next;
                                  }
                                  // 仅允许同一工序同时发出：若已选行中存在不同工序，则提示并不勾选
                                  if (next.size > 0) {
                                    const selectedNodeId = next.values().next().value?.split('|')[1];
                                    if (selectedNodeId !== row.nodeId) {
                                      alert('只能选择同一工序的工单同时发出，请先取消其他工序的勾选。');
                                      return prev;
                                    }
                                  }
                                  next.add(key);
                                  return next;
                                });
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700 align-middle">{row.availableQty}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {outsourceDispatchRows.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <span className="text-sm font-bold text-slate-600">已选 {dispatchSelectedKeys.size} 项</span>
                <button
                  type="button"
                  disabled={dispatchSelectedKeys.size === 0}
                  onClick={() => setDispatchFormModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" /> 外协发出
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {limitType === 'REWORK' && reworkPendingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setReworkPendingModalOpen(false)} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600" /> 待处理不良</h3>
              <button type="button" onClick={() => setReworkPendingModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <p className="text-xs text-slate-500">来自报工不良品数量，扣除已返工、已报损后的待处理数量。含父子工单，按实际工单号与产品显示。</p>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</label>
                <input
                  type="text"
                  value={reworkListSearchOrder}
                  onChange={e => setReworkListSearchOrder(e.target.value)}
                  placeholder="工单号模糊搜索"
                  className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">货号</label>
                <input
                  type="text"
                  value={reworkListSearchProduct}
                  onChange={e => setReworkListSearchProduct(e.target.value)}
                  placeholder="产品名/SKU 模糊搜索"
                  className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</label>
                <select
                  value={reworkListSearchNodeId}
                  onChange={e => setReworkListSearchNodeId(e.target.value)}
                  className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">全部</option>
                  {reworkPendingNodeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                    <th className="w-[28%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>
                    <th className="w-[28%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">产品</th>
                    <th className="w-[20%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                    <th className="w-[10%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">报工不良</th>
                    <th className="w-[10%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已返工</th>
                    <th className="w-[10%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已报损</th>
                    <th className="w-[10%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待返工</th>
                    <th className="w-[14%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReworkPendingRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-slate-400 text-sm">
                        {reworkPendingRows.length === 0
                          ? (productionLinkMode === 'product' ? '关联产品模式下待处理不良清单敬请期待。' : '暂无待处理不良。请先在报工中登记不良品数量。')
                          : '无匹配项，请调整搜索条件。'}
                      </td>
                    </tr>
                  ) : (
                    filteredReworkPendingRows.map(row => (
                      <tr key={`${row.orderId}|${row.nodeId}`} className="hover:bg-slate-50/50 bg-white">
                        <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>
                        <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                        <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                        <td className="px-6 py-3 text-right text-sm font-bold text-slate-600 align-middle">{row.defectiveTotal}</td>
                        <td className="px-6 py-3 text-right text-sm font-bold text-slate-500 align-middle">{row.reworkTotal}</td>
                        <td className="px-6 py-3 text-right text-sm font-bold text-slate-500 align-middle">{row.scrapTotal}</td>
                        <td className="px-6 py-3 text-right text-sm font-bold text-amber-600 align-middle">{row.pendingQty}</td>
                        <td className="px-6 py-3 text-right align-middle">
                          <button
                            type="button"
                            onClick={() => setReworkActionRow(row)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                          >
                            处理
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {limitType === 'REWORK' && reworkActionRow && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">不良品处理</h3>
              <button type="button" onClick={() => { setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-800">{reworkActionRow.orderNumber}</span> · {reworkActionRow.productName} · {reworkActionRow.milestoneName} · 待处理 <span className="font-bold text-amber-600">{reworkActionRow.pendingQty}</span> 件
              </p>
              {reworkActionMode === null ? (
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setReworkActionMode('scrap')}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-slate-200 text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 transition-colors"
                  >
                    报损
                  </button>
                  <button
                    type="button"
                    onClick={() => setReworkActionMode('rework')}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                  >
                    返工到指定工序
                  </button>
                </div>
              ) : reworkActionMode === 'scrap' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">报损数量</label>
                    <input
                      type="number"
                      min={1}
                      max={reworkActionRow.pendingQty}
                      value={reworkActionQty || ''}
                      onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                      placeholder={`1 ~ ${reworkActionRow.pendingQty}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因（选填）</label>
                    <input
                      type="text"
                      value={reworkActionReason}
                      onChange={e => setReworkActionReason(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                      placeholder="如：不可修复"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      disabled={reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty}
                      onClick={() => {
                        if (!onAddRecord || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
                        const order = orders.find(o => o.id === reworkActionRow.orderId);
                        onAddRecord({
                          id: `rec-${Date.now()}`,
                          type: 'SCRAP',
                          orderId: reworkActionRow.orderId,
                          productId: reworkActionRow.productId,
                          quantity: reworkActionQty,
                          reason: reworkActionReason || undefined,
                          operator: '张主管',
                          timestamp: new Date().toLocaleString(),
                          nodeId: reworkActionRow.nodeId
                        });
                        setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason('');
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                    >
                      确定报损
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">返工目标工序（可多选）</label>
                    <div className="max-h-40 overflow-auto border border-slate-200 rounded-xl p-2 space-y-1.5">
                      {globalNodes.map(n => {
                        const checked = reworkActionNodeIds.includes(n.id);
                        return (
                          <label key={n.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setReworkActionNodeIds(prev => checked ? prev.filter(id => id !== n.id) : [...prev, n.id])}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-bold text-slate-800">{n.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">返工数量</label>
                    <input
                      type="number"
                      min={1}
                      max={reworkActionRow.pendingQty}
                      value={reworkActionQty || ''}
                      onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={`1 ~ ${reworkActionRow.pendingQty}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因（选填）</label>
                    <input
                      type="text"
                      value={reworkActionReason}
                      onChange={e => setReworkActionReason(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="如：尺寸不良"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      disabled={reworkActionNodeIds.length === 0 || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty}
                      onClick={() => {
                        if (!onAddRecord || reworkActionNodeIds.length === 0 || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
                        onAddRecord({
                          id: `rec-${Date.now()}`,
                          type: 'REWORK',
                          orderId: reworkActionRow.orderId,
                          productId: reworkActionRow.productId,
                          quantity: reworkActionQty,
                          reason: reworkActionReason || undefined,
                          operator: '张主管',
                          timestamp: new Date().toLocaleString(),
                          status: '待返工',
                          sourceNodeId: reworkActionRow.nodeId,
                          nodeId: reworkActionNodeIds[0],
                          reworkNodeIds: reworkActionNodeIds.length > 0 ? reworkActionNodeIds : undefined
                        });
                        setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]);
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    >
                      生成返工
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {limitType === 'OUTSOURCE' && dispatchFormModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setDispatchFormModalOpen(false); }} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-indigo-600" /> 外协发出 · 录入数量</h3>
              <button type="button" onClick={() => setDispatchFormModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative space-y-1.5" ref={dispatchPartnerContainerRef}>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
                  <button
                    type="button"
                    onClick={() => setDispatchPartnerOpen(!dispatchPartnerOpen)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between transition-all h-[52px] text-left"
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <Building2 className={`w-4 h-4 flex-shrink-0 ${dispatchPartnerName ? 'text-indigo-600' : 'text-slate-300'}`} />
                      <span className={dispatchPartnerName ? 'text-slate-900 truncate' : 'text-slate-400'}>{dispatchPartnerName || '搜索并选择外协工厂...'}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${dispatchPartnerOpen ? 'rotate-180' : 'text-slate-400'}`} />
                  </button>
                  {dispatchPartnerOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-[100] p-4 animate-in fade-in zoom-in-95">
                      <div className="relative mb-3">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          autoFocus
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="搜索单位名称或联系人..."
                          value={dispatchPartnerSearch}
                          onChange={e => setDispatchPartnerSearch(e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">合作单位分类</p>
                      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1">
                        <button
                          type="button"
                          onClick={() => setDispatchPartnerCategoryTab('all')}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${dispatchPartnerCategoryTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                        >
                          全部
                        </button>
                        {partnerCategories.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setDispatchPartnerCategoryTab(cat.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${dispatchPartnerCategoryTab === cat.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                      <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                        {filteredDispatchPartners.map(p => {
                          const catName = partnerCategories.find(c => c.id === p.categoryId)?.name || '未分类';
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setDispatchPartnerName(p.name);
                                setDispatchPartnerOpen(false);
                                setDispatchPartnerSearch('');
                              }}
                              className={`w-full text-left p-3 rounded-xl transition-all border-2 ${p.name === dispatchPartnerName ? 'bg-indigo-50 border-indigo-600/30 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}
                            >
                              <div className="flex justify-between items-center gap-2">
                                <p className="text-sm font-bold truncate">{p.name}</p>
                                <span className="text-[10px] font-bold text-slate-400 shrink-0">{catName}</span>
                              </div>
                              {p.contact && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.contact}</p>}
                            </button>
                          );
                        })}
                        {filteredDispatchPartners.length === 0 && (
                          <div className="py-8 text-center text-slate-400 text-sm">未找到符合条件的合作单位</div>
                        )}
                      </div>
                    </div>
                  )}
                  {dispatchPartnerName && (
                    <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                      <span className="uppercase tracking-widest text-slate-400">合作单位分类：</span>
                      <span>{partnerCategories.find(c => c.id === partners.find(p => p.name === dispatchPartnerName)?.categoryId)?.name || '未分类'}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
                  <input
                    type="text"
                    value={dispatchRemark}
                    onChange={e => setDispatchRemark(e.target.value)}
                    placeholder="选填"
                    className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">商品明细</h4>
              <div className="space-y-8">
              {outsourceDispatchRows.filter(row => dispatchSelectedKeys.has(`${row.orderId}|${row.nodeId}`)).map(row => {
                const order = orders.find(o => o.id === row.orderId);
                const product = products.find(p => p.id === row.productId);
                const category = categories.find(c => c.id === product?.categoryId);
                const hasColorSize = category?.hasColorSize && (product?.variants?.length ?? 0) > 1;
                const baseKey = `${row.orderId}|${row.nodeId}`;
                const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                const variantsInOrder = hasColorSize && product?.variants
                  ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id))
                  : [];
                if (variantsInOrder.length > 0) {
                  const ms = order?.milestones?.find(m => m.templateId === row.nodeId);
                  const outsourceDispatchedForNode = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                  const getAvailableForVariant = (variantId: string) => {
                    const orderItem = order?.items?.find(i => (i.variantId || '') === variantId);
                    const qty = orderItem?.quantity ?? 0;
                    const reported = (ms?.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                    const dispatched = outsourceDispatchedForNode.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                    return Math.max(0, qty - reported - dispatched);
                  };
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInOrder.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      </div>
                      <div className="space-y-4">
                        {(Object.entries(groupedByColor) as [string, ProductVariant[]][]).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-6 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}|${v.id}`;
                                  const maxVariant = getAvailableForVariant(v.id);
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                      <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                                      <div className="relative flex items-center bg-white border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500">
                                        <input
                                          type="number"
                                          min={0}
                                          max={maxVariant}
                                          value={dispatchFormQuantities[qtyKey] ?? ''}
                                          onChange={e => setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Number(e.target.value) || 0 }))}
                                          className="w-full bg-transparent rounded-xl py-1.5 pl-2 pr-12 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none"
                                        />
                                        <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{maxVariant}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>
                      <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">委外数量</label>
                      <div className="relative flex items-center bg-white border border-slate-200 rounded-xl w-32 focus-within:ring-2 focus-within:ring-indigo-500">
                        <input
                          type="number"
                          min={0}
                          max={row.availableQty}
                          value={dispatchFormQuantities[baseKey] ?? ''}
                          onChange={e => setDispatchFormQuantities(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                          className="w-full bg-transparent rounded-xl py-2 pl-3 pr-10 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none"
                        />
                        <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{row.availableQty}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 shrink-0">
              <button
                type="button"
                onClick={handleDispatchFormSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
              >
                <Check className="w-4 h-4" /> 确认发出
              </button>
            </div>
          </div>
        </div>
      )}

      {limitType === 'OUTSOURCE' && outsourceModal === 'receive' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOutsourceModal(null)} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 待收回清单</h3>
              <button type="button" onClick={() => setOutsourceModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <p className="text-xs text-slate-500">已发出未收回的工单+工序汇总；点击「收回」填写本次收回数量。</p>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</label>
                <input
                  type="text"
                  value={receiveListSearchOrder}
                  onChange={e => setReceiveListSearchOrder(e.target.value)}
                  placeholder="工单号模糊搜索"
                  className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">货号</label>
                <input
                  type="text"
                  value={receiveListSearchProduct}
                  onChange={e => setReceiveListSearchProduct(e.target.value)}
                  placeholder="产品名/SKU 模糊搜索"
                  className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</label>
                <input
                  type="text"
                  value={receiveListSearchPartner}
                  onChange={e => setReceiveListSearchPartner(e.target.value)}
                  placeholder="模糊搜索"
                  className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</label>
                <select
                  value={receiveListSearchNodeId}
                  onChange={e => setReceiveListSearchNodeId(e.target.value)}
                  className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="">全部</option>
                  {receiveListNodeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                    <th className="w-12 px-4 py-3" />
                    <th className="w-[18%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>
                    <th className="w-[18%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">产品</th>
                    <th className="w-[14%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                    <th className="w-[14%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">外协厂商</th>
                    <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">发出总量</th>
                    <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收总量</th>
                    <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceiveRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceReceiveRows.length === 0 ? '暂无待收回项。' : '无匹配项，请调整搜索条件。'}</td>
                    </tr>
                  ) : (
                    filteredReceiveRows.map(row => {
                      const key = `${row.orderId}|${row.nodeId}`;
                      const checked = receiveSelectedKeys.has(key);
                      return (
                        <tr key={key} className="hover:bg-slate-50/50 bg-white">
                          <td className="w-12 px-4 py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setReceiveSelectedKeys(prev => {
                                  const next = new Set(prev);
                                  if (next.has(key)) {
                                    next.delete(key);
                                    return next;
                                  }
                                  if (next.size > 0) {
                                    const firstKey = next.values().next().value;
                                    const firstRow = outsourceReceiveRows.find(r => `${r.orderId}|${r.nodeId}` === firstKey);
                                    const selectedPartner = firstRow?.partner ?? '';
                                    if (selectedPartner !== (row.partner ?? '')) {
                                      alert('只能选择同一外协工厂的工单同时收货，请先取消其他加工厂的勾选。');
                                      return prev;
                                    }
                                    const selectedNodeId = firstKey?.split('|')[1];
                                    if (selectedNodeId !== row.nodeId) {
                                      alert('只能选择同一工序的工单同时收货，请先取消其他工序的勾选。');
                                      return prev;
                                    }
                                  }
                                  next.add(key);
                                  return next;
                                });
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-700 align-middle truncate" title={row.partner || '—'}>{row.partner || '—'}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700 align-middle">{row.dispatched}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-emerald-600 align-middle">{row.received}</td>
                          <td className="px-6 py-3 text-right text-sm font-black text-amber-600 align-middle">{row.pending}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {outsourceReceiveRows.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <span className="text-sm font-bold text-slate-600">已选 {receiveSelectedKeys.size} 项</span>
                <button
                  type="button"
                  disabled={receiveSelectedKeys.size === 0}
                  onClick={() => setReceiveFormModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" /> 收货
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {limitType === 'OUTSOURCE' && receiveFormModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setReceiveFormModalOpen(false); }} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 外协收货 · 录入数量</h3>
              <button type="button" onClick={() => setReceiveFormModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
                  <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-slate-50 flex items-center">
                    {(() => {
                      const firstKey = receiveSelectedKeys.values().next().value;
                      if (!firstKey) return '—';
                      const row = outsourceReceiveRows.find(r => `${r.orderId}|${r.nodeId}` === firstKey);
                      return row?.partner || '—';
                    })()}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
                  <input
                    type="text"
                    value={receiveFormRemark}
                    onChange={e => setReceiveFormRemark(e.target.value)}
                    placeholder="选填"
                    className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">商品明细（本次收回数量，不超过待收数量）</h4>
              <div className="space-y-8">
              {outsourceReceiveRows.filter(row => receiveSelectedKeys.has(`${row.orderId}|${row.nodeId}`)).map(row => {
                const order = orders.find(o => o.id === row.orderId);
                const product = products.find(p => p.id === row.productId);
                const category = categories.find(c => c.id === product?.categoryId);
                const hasColorSize = category?.hasColorSize && (product?.variants?.length ?? 0) > 1;
                const baseKey = `${row.orderId}|${row.nodeId}`;
                const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                const variantsInOrder = hasColorSize && product?.variants
                  ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id))
                  : [];
                const dispatchRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                const receiveRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                const getPendingForVariant = (variantId: string) => {
                  const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                  const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                  return Math.max(0, dispatched - received);
                };
                if (variantsInOrder.length > 0) {
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInOrder.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                        <span className="text-[10px] font-black text-amber-600">待收共 {row.pending} 件</span>
                      </div>
                      <div className="space-y-4">
                        {(Object.entries(groupedByColor) as [string, ProductVariant[]][]).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-6 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}|${v.id}`;
                                  const maxVariant = getPendingForVariant(v.id);
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                      <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                                      <div className="relative flex items-center bg-white border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500">
                                        <input
                                          type="number"
                                          min={0}
                                          max={maxVariant}
                                          value={receiveFormQuantities[qtyKey] ?? ''}
                                          onChange={e => setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Number(e.target.value) || 0 }))}
                                          className="w-full bg-transparent rounded-xl py-1.5 pl-2 pr-12 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none"
                                        />
                                        <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{maxVariant}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>
                      <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      <span className="text-[10px] font-black text-amber-600">待收共 {row.pending} 件</span>
                    </div>
                    <div className="flex items-center gap-3 flex-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本次收回数量</label>
                      <div className="relative flex items-center bg-white border border-slate-200 rounded-xl w-32 focus-within:ring-2 focus-within:ring-indigo-500">
                        <input
                          type="number"
                          min={0}
                          max={row.pending}
                          value={receiveFormQuantities[baseKey] ?? ''}
                          onChange={e => setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                          className="w-full bg-transparent rounded-xl py-2 pl-3 pr-10 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none"
                        />
                        <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{row.pending}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 shrink-0">
              <button
                type="button"
                onClick={handleReceiveFormSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
              >
                <Check className="w-4 h-4" /> 确认收货
              </button>
            </div>
          </div>
        </div>
      )}

      {limitType === 'OUTSOURCE' && outsourceModal === 'flow' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setOutsourceModal(null); setFlowDetailKey(null); }} aria-hidden />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 外协流水</h3>
                {onDeleteRecord && oldFormatOutsourceRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { if (window.confirm(`确定删除全部 ${oldFormatOutsourceRecords.length} 条旧格式外协单据吗？`)) oldFormatOutsourceRecords.forEach(r => onDeleteRecord(r.id)); }}
                    className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200"
                  >
                    清除旧格式单据（{oldFormatOutsourceRecords.length}）
                  </button>
                )}
              </div>
              <button type="button" onClick={() => { setOutsourceModal(null); setFlowDetailKey(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                  <input
                    type="date"
                    value={flowFilterDateFrom}
                    onChange={e => setFlowFilterDateFrom(e.target.value)}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                  <input
                    type="date"
                    value={flowFilterDateTo}
                    onChange={e => setFlowFilterDateTo(e.target.value)}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                  <select
                    value={flowFilterType}
                    onChange={e => setFlowFilterType(e.target.value as 'all' | '发出' | '收回')}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  >
                    <option value="all">全部</option>
                    <option value="发出">发出</option>
                    <option value="收回">收回</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">外协工厂</label>
                  <input
                    type="text"
                    value={flowFilterPartner}
                    onChange={e => setFlowFilterPartner(e.target.value)}
                    placeholder="模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
                  <input
                    type="text"
                    value={flowFilterDocNo}
                    onChange={e => setFlowFilterDocNo(e.target.value)}
                    placeholder="模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">工单</label>
                  <input
                    type="text"
                    value={flowFilterOrder}
                    onChange={e => setFlowFilterOrder(e.target.value)}
                    placeholder="模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                  <input
                    type="text"
                    value={flowFilterProduct}
                    onChange={e => setFlowFilterProduct(e.target.value)}
                    placeholder="模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
                  <select
                    value={flowFilterMilestone}
                    onChange={e => setFlowFilterMilestone(e.target.value)}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  >
                    <option value="">全部</option>
                    {globalNodes.map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => { setFlowFilterDateFrom(''); setFlowFilterDateTo(''); setFlowFilterType('all'); setFlowFilterPartner(''); setFlowFilterDocNo(''); setFlowFilterOrder(''); setFlowFilterProduct(''); setFlowFilterMilestone(''); }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  清空筛选
                </button>
                <span className="text-xs text-slate-400">共 {filteredOutsourceFlowRows.length} 条</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {filteredOutsourceFlowRows.length === 0 ? (
                <p className="text-slate-500 text-center py-12">暂无外协流水记录</p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">备注</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOutsourceFlowRows.map(row => {
                        const rowKey = `${row.docNo}|${row.orderId}|${row.productId}`;
                        const hasDispatch = (row.typeStr || '').includes('发出');
                        const hasReceive = (row.typeStr || '').includes('收回');
                        return (
                          <tr key={rowKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNo}</td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.dateStr}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                {hasDispatch && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                    <ArrowUpFromLine className="w-3 h-3" /> 发出
                                  </span>
                                )}
                                {hasReceive && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    <Undo2 className="w-3 h-3" /> 收回
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800">{row.partner}</td>
                            <td className="px-4 py-3 text-[10px] font-black text-indigo-600 uppercase">{row.orderNumber}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{row.productName}</td>
                            <td className="px-4 py-3 font-bold text-slate-700">{row.milestoneStr}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQuantity}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={row.remark}>{row.remark}</td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setFlowDetailKey(row.docNo)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                              >
                                <FileText className="w-3.5 h-3.5" /> 详情
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <td className="px-4 py-3" colSpan={10}>
                          <span className="text-[10px] text-slate-500 uppercase mr-3">合计</span>
                          <span className="text-xs text-indigo-600">发出 {outsourceFlowTotalDispatch} 件</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-amber-600">收回 {outsourceFlowTotalReceive} 件</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-slate-700">结余 {Math.round((outsourceFlowTotalDispatch - outsourceFlowTotalReceive) * 100) / 100} 件</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 外协流水 - 单据详情弹窗：整张单据的详情，布局参照外协发出新增（基本信息 + 商品明细含颜色尺码） */}
      {limitType === 'OUTSOURCE' && outsourceModal === 'flow' && flowDetailKey && (() => {
        const docRecords = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
        if (docRecords.length === 0) return null;
        const first = docRecords[0];
        const docDateStr = first.timestamp ? (() => { try { const d = new Date(first.timestamp); return isNaN(d.getTime()) ? first.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return first.timestamp; } })() : '—';
        const docPartner = first.partner ?? '—';
        const docRemark = docRecords.map(r => r.reason).filter(Boolean)[0] ?? '—';
        const byOrderNode = new Map<string, ProductionOpRecord[]>();
        docRecords.forEach(rec => {
          if (!rec.orderId || !rec.nodeId) return;
          const key = `${rec.orderId}|${rec.nodeId}`;
          if (!byOrderNode.has(key)) byOrderNode.set(key, []);
          byOrderNode.get(key)!.push(rec);
        });
        const detailLines = Array.from(byOrderNode.entries()).map(([key, recs]) => {
          const order = orders.find(o => o.id === recs[0].orderId);
          const product = products.find(p => p.id === (order?.productId ?? recs[0].productId));
          const nodeName = recs[0].nodeId ? (globalNodes.find(n => n.id === recs[0].nodeId)?.name ?? recs[0].nodeId) : '—';
          const variantQty: Record<string, number> = {};
          recs.forEach(r => {
            const v = r.variantId || '';
            if (!variantQty[v]) variantQty[v] = 0;
            variantQty[v] += r.quantity;
          });
          return { key, order, product, orderNumber: order?.orderNumber ?? recs[0].orderId, productName: product?.name ?? '—', nodeName, records: recs, variantQty };
        });
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setFlowDetailKey(null); setFlowDetailEditMode(false); }} aria-hidden />
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 单据详情 · {flowDetailKey}</h3>
                <div className="flex items-center gap-2">
                  {flowDetailEditMode ? (
                    <>
                      <button type="button" onClick={() => { setFlowDetailEditMode(false); setFlowDetailPartnerOpen(false); setFlowDetailPartnerSearch(''); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!onDeleteRecord) return;
                          const partnerName = (flowDetailEditPartner || '').trim();
                          if (!partnerName) { alert('请选择外协工厂。'); return; }
                          const entries = Object.entries(flowDetailQuantities).filter(([, qty]) => qty > 0);
                          if (entries.length === 0) { alert('请至少填写一项数量。'); return; }
                          const isReceiveDoc = first.status === '已收回';
                          const toDelete = isReceiveDoc ? docRecords : docRecords.filter(r => r.status !== '已收回');
                          toDelete.forEach(rec => onDeleteRecord(rec.id));
                          const timestamp = first.timestamp || new Date().toLocaleString();
                          const newStatus = isReceiveDoc ? '已收回' : '加工中';
                          entries.forEach(([key, qty]) => {
                            const parts = key.split('|');
                            const orderId = parts[0];
                            const nodeId = parts[1];
                            const variantId = parts[2];
                            const order = orders.find(o => o.id === orderId);
                            if (!order) return;
                            onAddRecord({
                              id: `rec-${Date.now()}-${key.replace(/\|/g, '-')}`,
                              type: 'OUTSOURCE',
                              orderId,
                              productId: order.productId,
                              quantity: qty,
                              reason: flowDetailEditRemark.trim() || undefined,
                              operator: first.operator || '张主管',
                              timestamp,
                              status: newStatus,
                              partner: partnerName,
                              docNo: flowDetailKey,
                              nodeId,
                              variantId: variantId || undefined
                            });
                          });
                          setFlowDetailEditMode(false);
                          setFlowDetailPartnerOpen(false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && (
                        <button
                          type="button"
                          onClick={() => {
                            setFlowDetailEditPartner(docPartner);
                            setFlowDetailEditRemark(docRemark);
                            const initQty: Record<string, number> = {};
                            docRecords.forEach(r => {
                              const k = `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`;
                              initQty[k] = (initQty[k] || 0) + r.quantity;
                            });
                            setFlowDetailQuantities(initQty);
                            setFlowDetailEditMode(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`确定要删除该张外协单的所有记录吗？此操作不可恢复。`)) return;
                            docRecords.forEach(rec => onDeleteRecord(rec.id));
                            setFlowDetailKey(null);
                            setFlowDetailEditMode(false);
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                        >
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setFlowDetailKey(null); setFlowDetailEditMode(false); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">单号</label>
                    <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{flowDetailKey}</div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">日期</label>
                    <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docDateStr}</div>
                  </div>
                  <div className="relative space-y-1.5" ref={flowDetailPartnerRef}>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
                    {flowDetailEditMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setFlowDetailPartnerOpen(!flowDetailPartnerOpen)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between transition-all h-[52px] text-left"
                        >
                          <div className="flex items-center gap-2 truncate min-w-0">
                            <Building2 className={`w-4 h-4 flex-shrink-0 ${flowDetailEditPartner ? 'text-indigo-600' : 'text-slate-300'}`} />
                            <span className={flowDetailEditPartner ? 'text-slate-900 truncate' : 'text-slate-400'}>{flowDetailEditPartner || '搜索并选择外协工厂...'}</span>
                          </div>
                          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${flowDetailPartnerOpen ? 'rotate-180' : 'text-slate-400'}`} />
                        </button>
                        {flowDetailPartnerOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-[100] p-4">
                            <div className="relative mb-3">
                              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input
                                type="text"
                                placeholder="搜索单位名称或联系人..."
                                value={flowDetailPartnerSearch}
                                onChange={e => setFlowDetailPartnerSearch(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">合作单位分类</p>
                            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1">
                              <button type="button" onClick={() => setFlowDetailPartnerCategoryTab('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${flowDetailPartnerCategoryTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>全部</button>
                              {partnerCategories.map(cat => (
                                <button key={cat.id} type="button" onClick={() => setFlowDetailPartnerCategoryTab(cat.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${flowDetailPartnerCategoryTab === cat.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{cat.name}</button>
                              ))}
                            </div>
                            <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
                              {filteredFlowDetailPartners.map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => { setFlowDetailEditPartner(p.name); setFlowDetailPartnerOpen(false); setFlowDetailPartnerSearch(''); }}
                                  className={`w-full text-left p-3 rounded-xl transition-all border-2 ${p.name === flowDetailEditPartner ? 'bg-indigo-50 border-indigo-600/30 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}
                                >
                                  <div className="flex justify-between items-center gap-2">
                                    <p className="text-sm font-bold truncate">{p.name}</p>
                                    <span className="text-[10px] font-bold text-slate-400 shrink-0">{partnerCategories.find(c => c.id === p.categoryId)?.name || '未分类'}</span>
                                  </div>
                                  {p.contact && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.contact}</p>}
                                </button>
                              ))}
                              {filteredFlowDetailPartners.length === 0 && <div className="py-8 text-center text-slate-400 text-sm">未找到符合条件的合作单位</div>}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docPartner}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
                    {flowDetailEditMode ? (
                      <input
                        type="text"
                        value={flowDetailEditRemark}
                        onChange={e => setFlowDetailEditRemark(e.target.value)}
                        placeholder="选填"
                        className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                      />
                    ) : (
                      <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center truncate" title={docRemark}>{docRemark}</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0 p-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">商品明细</h4>
                <div className="space-y-8">
                  {detailLines.map(({ key, order, product, orderNumber, productName, nodeName, variantQty }) => {
                    const category = categories.find(c => c.id === product?.categoryId);
                    const hasColorSize = category?.hasColorSize && (product?.variants?.length ?? 0) > 1;
                    const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                    const variantsInOrder = hasColorSize && product?.variants
                      ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id))
                      : [];
                    if (variantsInOrder.length > 0) {
                      const groupedByColor: Record<string, ProductVariant[]> = {};
                      variantsInOrder.forEach(v => {
                        if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                        groupedByColor[v.colorId].push(v);
                      });
                      return (
                        <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 space-y-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>
                            <span className="text-sm font-bold text-slate-800">{productName}</span>
                            <span className="text-sm font-bold text-indigo-600">{nodeName}</span>
                          </div>
                          <div className="space-y-4">
                            {(Object.entries(groupedByColor) as [string, ProductVariant[]][]).map(([colorId, colorVariants]) => {
                              const color = dictionaries?.colors?.find(c => c.id === colorId);
                              return (
                                <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-6 p-4 bg-white rounded-xl border border-slate-100">
                                  <div className="flex items-center gap-3 w-40 shrink-0">
                                    <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                    <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                                  </div>
                                  <div className="flex-1 flex flex-wrap gap-4">
                                    {colorVariants.map(v => {
                                      const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                      const qtyKey = `${key}|${v.id}`;
                                      const qty = flowDetailEditMode ? (flowDetailQuantities[qtyKey] ?? variantQty[v.id] ?? 0) : (variantQty[v.id] ?? 0);
                                      return (
                                        <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                          <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                                          {flowDetailEditMode ? (
                                            <input
                                              type="number"
                                              min={0}
                                              value={flowDetailQuantities[qtyKey] ?? ''}
                                              onChange={e => setFlowDetailQuantities(prev => ({ ...prev, [qtyKey]: Number(e.target.value) || 0 }))}
                                              className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none"
                                            />
                                          ) : (
                                            <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{qty}</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    const totalQty = Object.values(variantQty).reduce((s, n) => s + n, 0);
                    const singleQty = flowDetailEditMode ? (flowDetailQuantities[key] ?? totalQty) : totalQty;
                    return (
                      <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>
                          <span className="text-sm font-bold text-slate-800">{productName}</span>
                          <span className="text-sm font-bold text-indigo-600">{nodeName}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">委外数量</label>
                          {flowDetailEditMode ? (
                            <input
                              type="number"
                              min={0}
                              value={flowDetailQuantities[key] ?? ''}
                              onChange={e => setFlowDetailQuantities(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                              className="w-32 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none"
                            />
                          ) : (
                            <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl w-32 py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{totalQty}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {limitType !== 'OUTSOURCE' && !isProductionMaterial && limitType !== 'REWORK' && !showModal && (
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">关联工单/产品</th>
                  {limitType === 'OUTSOURCE' && <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>}
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务数量</th>
                  {limitType === 'OUTSOURCE' && <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">类型</th>}
                  {limitType === 'OUTSOURCE' && <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">外协厂商</th>}
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">经办/操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={limitType === 'OUTSOURCE' ? 7 : 5} className="px-8 py-20 text-center text-slate-300 italic text-sm">暂无该业务模块的流水记录</td>
                  </tr>
                ) : (
                  (limitType === 'OUTSOURCE' ? [...filteredRecords].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : filteredRecords).map(rec => {
                    const order = orders.find(o => o.id === rec.orderId);
                    const product = products.find(p => p.id === rec.productId);
                    const nodeName = limitType === 'OUTSOURCE' && rec.nodeId ? (globalNodes.find(n => n.id === rec.nodeId)?.name ?? rec.nodeId) : null;
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/30 transition-colors group">
                        <td className="px-8 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-300" />
                            <span className="text-xs font-bold text-slate-600">{rec.timestamp}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter mb-0.5">{order?.orderNumber || '通用项'}</span>
                            <span className="text-sm font-bold text-slate-800">{product?.name || '未知物料'}</span>
                          </div>
                        </td>
                        {limitType === 'OUTSOURCE' && <td className="px-8 py-4 text-sm font-bold text-slate-700">{nodeName ?? '—'}</td>}
                        <td className="px-8 py-4">
                          <span className="text-sm font-black text-indigo-600">{rec.quantity} PCS</span>
                        </td>
                        {limitType === 'OUTSOURCE' && <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">{rec.status === '已收回' ? '收回' : '发出'}</span></td>}
                        {limitType === 'OUTSOURCE' && <td className="px-8 py-4"><span className="text-xs font-bold text-slate-700">{rec.partner ?? '—'}</span></td>}
                        <td className="px-8 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex flex-col items-end opacity-60 group-hover:opacity-100 transition-opacity">
                              <span className="text-xs font-bold text-slate-700">{rec.operator}</span>
                              <span className="text-[10px] text-slate-400 italic max-w-[200px] truncate">{rec.reason || '-'}</span>
                            </div>
                            {printConfig?.enabled && (
                              <button onClick={() => handlePrint(rec)} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100" title="打印单据凭证">
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {receiveModal && limitType === 'OUTSOURCE' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setReceiveModal(null); setReceiveQty(0); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">委外收回</h3>
            <div className="text-sm space-y-1">
              <p><span className="text-slate-500">工单：</span><span className="font-bold text-slate-800">{receiveModal.orderNumber}</span></p>
              <p><span className="text-slate-500">产品：</span><span className="font-bold text-slate-800">{receiveModal.productName}</span></p>
              <p><span className="text-slate-500">工序：</span><span className="font-bold text-indigo-600">{receiveModal.milestoneName}</span></p>
              <p><span className="text-slate-500">待收回数量：</span><span className="font-bold text-amber-600">{receiveModal.pendingQty}</span></p>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">本次收回数量</label>
              <input
                type="number"
                min={1}
                max={receiveModal.pendingQty}
                value={receiveQty || ''}
                onChange={e => setReceiveQty(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setReceiveModal(null); setReceiveQty(0); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleOutsourceReceiveSubmit}
                disabled={receiveQty <= 0 || receiveQty > receiveModal.pendingQty}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                确认收回
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && isProductionMaterial && stockModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setShowModal(false); setStockModalMode(null); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">
              {stockModalMode === 'stock_return' ? '生产退料' : '生产领料'}
            </h3>
            {form.orderId && (
              <div className="text-sm">
                <span className="text-slate-500">工单：</span>
                <span className="font-bold text-slate-800">{orders.find(o => o.id === form.orderId)?.orderNumber ?? form.orderId}</span>
              </div>
            )}
            {warehouses.length > 0 && (
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                  {stockModalMode === 'stock_return' ? '退回仓库' : '出库仓库'}
                </label>
                <select
                  value={form.warehouseId}
                  onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">物料</label>
              <select
                value={form.productId}
                onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">请选择物料</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">数量</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.quantity || ''}
                onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) || 0 }))}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因/备注</label>
              <input
                type="text"
                value={form.reason || ''}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="选填"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowModal(false); setStockModalMode(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!form.productId || (form.quantity ?? 0) <= 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && !isProductionMaterial && (
        <div></div>
      )}
    </div>
  );
};

export default ProductionMgmtOpsView;
