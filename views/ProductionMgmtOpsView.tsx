import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  RotateCcw,
  Clock,
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
  Package,
  UserPlus,
  History
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ProductionOpRecord, ProductionOrder, Product, ProdOpType, Warehouse, BOM, AppDictionaries, GlobalNodeTemplate, Partner, ProductCategory, ProductVariant, PartnerCategory, Worker, ProcessSequenceMode, ProductMilestoneProgress } from '../types';
import { productGroupMaxReportableSum, pmpCompletedAtTemplate, variantMaxGoodProductMode } from '../utils/productReportAggregates';
import { buildDefectiveReworkByOrderMilestone } from '../utils/defectiveReworkByOrderMilestone';
import { splitQtyBySourceDefectiveAcrossParentOrders } from '../utils/reworkSplitByProductOrders';
import { sortedVariantColorEntries } from '../utils/sortVariantsByProduct';
import WorkerSelector from '../components/WorkerSelector';
import EquipmentSelector from '../components/EquipmentSelector';
import * as api from '../services/api';
import {
  moduleHeaderRowClass,
  outlineAccentToolbarButtonClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../styles/uiDensity';
import { useConfirm } from '../contexts/ConfirmContext';

/** 待处理不良「单号」筛选：支持报工单号 BG…、批次 id */
function reworkReportsMatchDocSearch(
  reports: { reportNo?: string; reportBatchId?: string; id: string }[] | undefined,
  kwLower: string
): boolean {
  if (!kwLower || !reports?.length) return false;
  return reports.some(
    r =>
      (r.reportNo && r.reportNo.toLowerCase().includes(kwLower)) ||
      (r.reportBatchId && String(r.reportBatchId).toLowerCase().includes(kwLower)) ||
      String(r.id).toLowerCase().includes(kwLower)
  );
}

type ReworkPendingRow = {
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
  /** 关联产品模式：主工单条数 */
  productOrderCount?: number;
  /** 关联产品模式：工单号摘要（两行内） */
  productOrdersLine?: string;
  /** 关联产品模式：全部工单号，用于悬停 */
  productOrdersTitle?: string;
};

interface ProductionMgmtOpsViewProps {
  productionLinkMode?: 'order' | 'product';
  /** 关联产品模式下的产品工序进度，用于外协待发清单可委外数量 */
  productMilestoneProgresses?: ProductMilestoneProgress[];
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses?: Warehouse[];
  boms?: BOM[];
  dictionaries?: AppDictionaries;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  limitType?: ProdOpType;
  excludeType?: ProdOpType;
  globalNodes?: GlobalNodeTemplate[];
  partners?: Partner[];
  categories?: ProductCategory[];
  partnerCategories?: PartnerCategory[];
  /** 返工报工：报工人员、设备（与工单中心报工一致） */
  workers?: Worker[];
  equipment?: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  /** 工序生产顺序（与工单中心一致：顺序模式下按路径上道完成量限制本道可报工数） */
  processSequenceMode?: ProcessSequenceMode;
  userPermissions?: string[];
  tenantRole?: string;
}

type OutsourceModalType = 'dispatch' | 'receive' | 'flow';

const ProductionMgmtOpsView: React.FC<ProductionMgmtOpsViewProps> = ({
  productionLinkMode = 'order', productMilestoneProgresses = [], records, orders, products, warehouses = [], boms = [], dictionaries, onAddRecord, onAddRecordBatch, onUpdateRecord, onDeleteRecord,   limitType, excludeType, globalNodes = [], partners = [], categories = [], partnerCategories = [], workers = [], equipment = [], processSequenceMode = 'free',
  userPermissions, tenantRole
}) => {
  const _isOwner = tenantRole === 'owner';
  const hasOpsPerm = (permKey: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes('production')) return true;
    if (userPermissions.includes(permKey)) return true;
    if (userPermissions.some(p => p.startsWith(`${permKey}:`))) return true;
    return false;
  };
  const canViewMainList = hasOpsPerm(
    limitType === 'STOCK_OUT' ? 'production:material_list:allow'
      : limitType === 'OUTSOURCE' ? 'production:outsource_list:allow'
      : 'production:rework_list:allow'
  );
  const navigate = useNavigate();
  const confirm = useConfirm();
  const allTabs = [
    { id: 'STOCK_OUT', label: '生产物料', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '物料下发与库存扣减' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '外部委托加工业务追踪' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '不合格品返工流程记录' },
  ];

  const currentBiz = allTabs.find(t => t.id === limitType);

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
  /** 关联产品模式：按成品选料领退料时的成品 productId（与 stockSelectOrderId 互斥） */
  const [stockSelectSourceProductId, setStockSelectSourceProductId] = useState<string | null>(null);
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
    /** 关联产品模式下的成品 id，详情页不展示工单 */
    sourceProductId?: string;
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
  /** 协作同步：发出成功后弹窗确认是否同步给协作企业 */
  const [collabSyncConfirm, setCollabSyncConfirm] = useState<{
    partnerName: string;
    collaborationTenantId: string;
    recordIds: string[];
  } | null>(null);
  const [collabSyncing, setCollabSyncing] = useState(false);
  const [collabRoutes, setCollabRoutes] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');

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
  /** 待收回清单第二步：各工单+工序的加工费单价（元/件）key = orderId|nodeId */
  const [receiveFormUnitPrices, setReceiveFormUnitPrices] = useState<Record<string, number>>({});
  /** 待收回清单第二步：备注说明 */
  const [receiveFormRemark, setReceiveFormRemark] = useState('');
  /** 待收回清单：收回弹窗，当前操作的 工单+工序 及待收数量（保留供兼容，新流程用勾选+收货表单） */
  const [receiveModal, setReceiveModal] = useState<{ orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; pendingQty: number } | null>(null);
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
  /** 详情页编辑（收回单）：加工费单价 key=orderId|nodeId 或 orderId|nodeId|variantId */
  const [flowDetailUnitPrices, setFlowDetailUnitPrices] = useState<Record<string, number>>({});
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
  /** 返工报工流水弹窗（参考报工流水） */
  const [reworkFlowModalOpen, setReworkFlowModalOpen] = useState(false);
  const [reworkFlowFilter, setReworkFlowFilter] = useState<{ dateFrom: string; dateTo: string; orderNumber: string; productId: string; nodeName: string; operator: string; reportNo: string }>({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', reportNo: '' });
  /** 返工报工流水：点击详情的记录（同单号批次在弹窗内按 docNo 聚合） */
  const [reworkFlowDetailRecord, setReworkFlowDetailRecord] = useState<ProductionOpRecord | null>(null);
  /** 返工报工流水详情：编辑态（参考报工流水详情），含时间/操作人/报工人员/设备/原因及每行数量 */
  const [reworkFlowDetailEditing, setReworkFlowDetailEditing] = useState<{
    form: { timestamp: string; operator: string; workerId: string; equipmentId: string; reason: string; unitPrice: number; rowEdits: { recordId: string; quantity: number }[] };
    firstRecord: ProductionOpRecord;
  } | null>(null);
  /** 返工管理：点击「详情」时展示的工单 id（主工单），弹窗内展示该工单的返工与不良处理情况 */
  const [reworkDetailOrderId, setReworkDetailOrderId] = useState<string | null>(null);
  /** 处理不良品流水弹窗：生成返工(REWORK)+报损(SCRAP)，UI 参考返工报工流水 */
  const [defectFlowModalOpen, setDefectFlowModalOpen] = useState(false);
  const [defectFlowFilter, setDefectFlowFilter] = useState<{ dateFrom: string; dateTo: string; orderNumber: string; productId: string; nodeName: string; operator: string; recordType: string }>({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', recordType: '' });
  const [defectFlowDetailRecord, setDefectFlowDetailRecord] = useState<ProductionOpRecord | null>(null);
  const [defectFlowDetailEditing, setDefectFlowDetailEditing] = useState<{ form: { timestamp: string; operator: string; reason: string; rowEdits: { recordId: string; quantity: number }[] }; firstRecord: ProductionOpRecord } | null>(null);
  const [reworkListSearchOrder, setReworkListSearchOrder] = useState('');
  const [reworkListSearchProduct, setReworkListSearchProduct] = useState('');
  const [reworkListSearchNodeId, setReworkListSearchNodeId] = useState('');
  /** 待处理不良：当前点击「处理」的行，并弹出处理方式（报损/返工） */
  const [reworkActionRow, setReworkActionRow] = useState<{
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
  } | null>(null);
  /** 处理方式：报损 → 填数量+原因提交 SCRAP；返工 → 选工序+数量提交 REWORK */
  const [reworkActionMode, setReworkActionMode] = useState<'scrap' | 'rework' | null>(null);
  const [reworkActionQty, setReworkActionQty] = useState(0);
  const [reworkActionReason, setReworkActionReason] = useState('');
  /** 返工目标工序（多选） */
  const [reworkActionNodeIds, setReworkActionNodeIds] = useState<string[]>([]);
  /** 不良品处理：有颜色尺码时按规格录入数量（参考计划单生产明细） */
  const [reworkActionVariantQuantities, setReworkActionVariantQuantities] = useState<Record<string, number>>({});
  /** 返工管理：主工单及子工单 展开/收起 */
  const [reworkExpandedParents, setReworkExpandedParents] = useState<Set<string>>(new Set());
  /** 返工管理：物料弹窗（该工单 BOM 领料，确认后写入生产物料并在领料退料流水中备注「来自于返工」） */
  const [reworkMaterialOrderId, setReworkMaterialOrderId] = useState<string | null>(null);
  const [reworkMaterialQty, setReworkMaterialQty] = useState<Record<string, number>>({});
  const [reworkMaterialWarehouseId, setReworkMaterialWarehouseId] = useState<string>(() => warehouses[0]?.id ?? '');
  /** 返工报工弹窗：点击工序标签打开，当前工单 + 工序 */
  const [reworkReportModal, setReworkReportModal] = useState<{ order: ProductionOrder; nodeId: string; nodeName: string } | null>(null);
  /** 返工报工：按路径（及规格）录入的完成数量，key = pathKey 或 pathKey__variantId */
  const [reworkReportQuantities, setReworkReportQuantities] = useState<Record<string, number>>({});
  /** 返工报工：报工人员、设备（与工单中心报工一致） */
  const [reworkReportWorkerId, setReworkReportWorkerId] = useState('');
  const [reworkReportEquipmentId, setReworkReportEquipmentId] = useState('');
  /** 返工报工：单价（元/件） */
  const [reworkReportUnitPrice, setReworkReportUnitPrice] = useState<number>(0);

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

  const filteredRecords = useMemo(() => records.filter(r => r.type === limitType), [records, limitType]);
  const stockFlowRecords = useMemo(() =>
    limitType === 'STOCK_OUT'
      ? records.filter(r => r.type === 'STOCK_OUT' || r.type === 'STOCK_RETURN').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      : []
  , [records, limitType]);
  const { filteredStockFlowRecords, totalIssueQty, totalReturnQty, countIssue, countReturn } = useMemo(() => {
    let list = stockFlowRecords;
    if (stockFlowFilterType !== 'all') list = list.filter(r => r.type === stockFlowFilterType);
    if (stockFlowFilterOrderKeyword.trim()) {
      const kw = stockFlowFilterOrderKeyword.trim().toLowerCase();
      if (productionLinkMode === 'product') {
        list = list.filter(r => {
          const sp = r.sourceProductId ? products.find(x => x.id === r.sourceProductId) : null;
          const name = (sp?.name ?? '').toLowerCase();
          const id = (r.sourceProductId ?? '').toLowerCase();
          return name.includes(kw) || id.includes(kw);
        });
      } else {
        list = list.filter(r => {
          const o = orders.find(x => x.id === r.orderId);
          const orderNum = (o?.orderNumber ?? '').toLowerCase();
          const orderId = (r.orderId ?? '').toLowerCase();
          return orderNum.includes(kw) || orderId.includes(kw);
        });
      }
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
  }, [stockFlowRecords, stockFlowFilterType, stockFlowFilterOrderKeyword, stockFlowFilterProductKeyword, stockFlowFilterDocNo, stockFlowFilterDateFrom, stockFlowFilterDateTo, orders, products, productionLinkMode]);

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
        const ordProduct = products.find(p => p.id === ord.productId);
        const variants = ordProduct?.variants ?? [];
        const variantCompletedMap = new Map<string, number>();
        ord.milestones.forEach(ms => {
          (ms.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
          });
        });
        const bestMsIdx = ord.milestones.reduce((bi, ms, i) => ms.completedQuantity > (ord.milestones[bi]?.completedQuantity ?? 0) ? i : bi, 0);
        const bestMs = ord.milestones[bestMsIdx];
        if (bestMs) {
          variantCompletedMap.clear();
          (bestMs.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
          });
        }
        const totalCompleted = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);

        const addTheory = (bi: { productId: string; quantity: number }, qty: number) => {
          const theory = Number(bi.quantity) * qty;
          if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
          prodMap.get(bi.productId)!.theoryCost += theory;
        };

        if (variants.length > 0 && variantCompletedMap.size > 0) {
          variants.forEach(v => {
            const vCompleted = variantCompletedMap.get(v.id) ?? 0;
            if (vCompleted <= 0) return;
            const seenBomIds = new Set<string>();
            if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const bom = boms.find(b => b.id === bomId);
                bom?.items.forEach(bi => addTheory(bi, vCompleted));
              });
            } else {
              boms.filter(b => b.parentProductId === ordProduct!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                if (seenBomIds.has(bom.id)) return;
                seenBomIds.add(bom.id);
                bom.items.forEach(bi => addTheory(bi, vCompleted));
              });
            }
          });
        } else if (variants.length > 0) {
          variants.forEach(v => {
            const seenBomIds = new Set<string>();
            if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const bom = boms.find(b => b.id === bomId);
                bom?.items.forEach(bi => addTheory(bi, totalCompleted));
              });
            }
          });
          if (prodMap.size === 0 && ordProduct) {
            boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
              bom.items.forEach(bi => addTheory(bi, totalCompleted));
            });
          }
        } else if (ordProduct) {
          boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
            bom.items.forEach(bi => addTheory(bi, totalCompleted));
          });
        }
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

  /** 关联产品模式：按成品聚合物料（多工单同产品合并一行卡片） */
  const productMaterialStatsByProduct = useMemo(() => {
    if (limitType !== 'STOCK_OUT' || productionLinkMode !== 'product') return null as Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]> | null;
    const result = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
    const finishedProductHasBom = (fpId: string): boolean => {
      const ordProduct = products.find(p => p.id === fpId);
      if (!ordProduct) return false;
      const variants = ordProduct.variants ?? [];
      const bomItems: { productId: string; quantity: number }[] = [];
      if (variants.length > 0) {
        variants.forEach(v => {
          if (v.nodeBoms) {
            Object.values(v.nodeBoms).forEach(bomId => {
              const bom = boms.find(b => b.id === bomId);
              bom?.items.forEach(bi => bomItems.push(bi));
            });
          }
        });
      }
      if (bomItems.length === 0) {
        boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
          bom.items.forEach(bi => bomItems.push(bi));
        });
      }
      return bomItems.length > 0;
    };
    const finishedIds = [...new Set(orders.filter(o => !o.parentOrderId).map(o => o.productId))]
      .filter(Boolean)
      .filter(fpId => finishedProductHasBom(fpId));
    for (const fpId of finishedIds) {
      const roots = orders.filter(o => !o.parentOrderId && o.productId === fpId);
      const allFamilyIds = new Set<string>();
      roots.forEach(p => getOrderFamilyIds(p.id).forEach(id => allFamilyIds.add(id)));
      const prodMap = new Map<string, { issue: number; returnQty: number; theoryCost: number }>();
      roots.forEach(parent => {
        const familyIds = new Set(getOrderFamilyIds(parent.id));
        const familyOrders = orders.filter(o => familyIds.has(o.id));
        familyOrders.forEach(ord => {
          const ordProduct = products.find(p => p.id === ord.productId);
          const variants = ordProduct?.variants ?? [];
          let totalCompleted = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);
          if (totalCompleted <= 0 && productMilestoneProgresses.length > 0) {
            const pm = productMilestoneProgresses.filter(p => p.productId === fpId);
            if (pm.length > 0) totalCompleted = Math.max(...pm.map(p => p.completedQuantity ?? 0), 0);
          }

          const variantCompletedMap = new Map<string, number>();
          const bestMsIdx = ord.milestones.reduce((bi, ms, i) => ms.completedQuantity > (ord.milestones[bi]?.completedQuantity ?? 0) ? i : bi, 0);
          const bestMs = ord.milestones[bestMsIdx];
          if (bestMs) {
            (bestMs.reports || []).forEach(r => {
              const vid = r.variantId ?? '';
              variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
            });
          }

          const addTheory2 = (bi: { productId: string; quantity: number }, qty: number) => {
            const theory = Number(bi.quantity) * qty;
            if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
            prodMap.get(bi.productId)!.theoryCost += theory;
          };

          if (variants.length > 0 && variantCompletedMap.size > 0) {
            variants.forEach(v => {
              const vCompleted = variantCompletedMap.get(v.id) ?? 0;
              if (vCompleted <= 0) return;
              const seenBomIds = new Set<string>();
              if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
                (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                  if (seenBomIds.has(bomId)) return;
                  seenBomIds.add(bomId);
                  const bom = boms.find(b => b.id === bomId);
                  bom?.items.forEach(bi => addTheory2(bi, vCompleted));
                });
              } else {
                boms.filter(b => b.parentProductId === ordProduct!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                  if (seenBomIds.has(bom.id)) return;
                  seenBomIds.add(bom.id);
                  bom.items.forEach(bi => addTheory2(bi, vCompleted));
                });
              }
            });
          } else if (ordProduct) {
            const bomItems: { productId: string; quantity: number }[] = [];
            if (variants.length > 0) {
              variants.forEach(v => {
                if (v.nodeBoms) {
                  const seenBomIds = new Set<string>();
                  (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                    if (seenBomIds.has(bomId)) return;
                    seenBomIds.add(bomId);
                    const bom = boms.find(b => b.id === bomId);
                    bom?.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: Number(bi.quantity) }));
                  });
                }
              });
            }
            if (bomItems.length === 0) {
              boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
                bom.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: Number(bi.quantity) }));
              });
            }
            bomItems.forEach(bi => addTheory2(bi, totalCompleted));
          }
        });
      });
      records.forEach(r => {
        if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return;
        const bySource = r.sourceProductId === fpId;
        const byOrder = r.orderId && allFamilyIds.has(r.orderId);
        if (!bySource && !byOrder) return;
        if (!prodMap.has(r.productId)) prodMap.set(r.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
        const cur = prodMap.get(r.productId)!;
        if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
        else cur.returnQty += r.quantity;
      });
      result.set(fpId, Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v })));
    }
    return result;
  }, [limitType, productionLinkMode, records, orders, boms, products, productMilestoneProgresses]);

  const defectiveReworkByOrderForOutsource = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, records),
    [orders, records]
  );

  /** 外协：待发清单可选行。工单模式=工单+可外协工序；产品模式=可委外=与报工最多一致−已报良品−已委外发出 */
  const outsourceDispatchRows = useMemo(() => {
    if (limitType !== 'OUTSOURCE' || globalNodes.length === 0) return [];
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE');
    const isProductMode = productionLinkMode === 'product';

    if (isProductMode) {
      const dispatchedByKey: Record<string, number> = {};
      outsourceRecords.forEach(r => {
        if (r.status !== '加工中' || !r.nodeId) return;
        if (r.orderId) return;
        const key = `${r.productId}|${r.nodeId}`;
        dispatchedByKey[key] = (dispatchedByKey[key] ?? 0) + r.quantity;
      });
      const rows: { orderId?: string; orderNumber?: string; productId: string; productName: string; nodeId: string; milestoneName: string; orderTotalQty: number; reportedQty: number; dispatchedQty: number; availableQty: number }[] = [];
      const productIds = new Set<string>(products.map(p => String(p.id)));
      const getDr = (oid: string, tid: string) =>
        defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0 };
      productIds.forEach(productId => {
        const product = products.find(p => p.id === productId);
        const blockOrders = orders.filter(o => o.productId === productId);
        const nodeIds = (product?.milestoneNodeIds || []).filter((nid: string) => {
          const node = globalNodes.find(n => n.id === nid);
          return node?.allowOutsource;
        });
        nodeIds.forEach((nodeId: string) => {
          const node = globalNodes.find(n => n.id === nodeId);
          const maxReportable =
            blockOrders.length > 0
              ? productGroupMaxReportableSum(
                  blockOrders,
                  nodeId,
                  productId,
                  productMilestoneProgresses || [],
                  (processSequenceMode ?? 'free') as ProcessSequenceMode,
                  getDr
                )
              : 0;
          const reportedQty = pmpCompletedAtTemplate(productMilestoneProgresses || [], productId, nodeId);
          const key = `${productId}|${nodeId}`;
          const dispatchedQty = dispatchedByKey[key] ?? 0;
          const availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
          if (availableQty <= 0) return;
          rows.push({
            productId,
            productName: product?.name ?? '—',
            nodeId,
            milestoneName: node?.name ?? nodeId,
            orderTotalQty: maxReportable,
            reportedQty,
            dispatchedQty,
            availableQty
          });
        });
      });
      return rows.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    }

    const dispatchedByKey: Record<string, number> = {};
    outsourceRecords.forEach(r => {
      if (r.status !== '加工中' || !r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      dispatchedByKey[key] = (dispatchedByKey[key] ?? 0) + r.quantity;
    });
    const rows: { orderId?: string; orderNumber?: string; productId: string; productName: string; nodeId: string; milestoneName: string; orderTotalQty: number; reportedQty: number; dispatchedQty: number; availableQty: number }[] = [];
    const getDr = (oid: string, tid: string) =>
      defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0 };
    const parentList = orders.filter(o => !o.parentOrderId);
    parentList.forEach(order => {
      const rawOrderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
      const product = products.find(p => p.id === order.productId);
      order.milestones.forEach(ms => {
        const node = globalNodes.find(n => n.id === ms.templateId);
        if (!node?.allowOutsource) return;
        if (product && !(product.milestoneNodeIds || []).includes(ms.templateId)) return;
        let baseQty = rawOrderTotalQty;
        if (processSequenceMode === 'sequential') {
          const idx = order.milestones.findIndex(m => m.id === ms.id);
          if (idx > 0) {
            const prev = order.milestones[idx - 1];
            baseQty = prev?.completedQuantity ?? 0;
          }
        }
        const { defective, rework } = getDr(order.id, ms.templateId);
        const maxReportable = Math.max(0, baseQty - defective + rework);
        const key = `${order.id}|${ms.templateId}`;
        const dispatchedQty = dispatchedByKey[key] ?? 0;
        const reportedQty = ms.completedQuantity ?? 0;
        const availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
        if (availableQty <= 0) return;
        rows.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          productName: product?.name ?? order.productName ?? '—',
          nodeId: ms.templateId,
          milestoneName: ms.name,
          orderTotalQty: maxReportable,
          reportedQty,
          dispatchedQty,
          availableQty
        });
      });
    });
    return rows;
  }, [limitType, productionLinkMode, records, orders, products, globalNodes, productMilestoneProgresses, processSequenceMode, defectiveReworkByOrderForOutsource]);

  /** 待发清单：按单号（仅工单模式）、货号模糊搜索 + 工序选择过滤后的行 */
  const filteredDispatchRows = useMemo(() => {
    const orderKw = (dispatchListSearchOrder || '').trim().toLowerCase();
    const productKw = (dispatchListSearchProduct || '').trim().toLowerCase();
    return outsourceDispatchRows.filter(row => {
      if (productionLinkMode === 'order' && orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (dispatchListSearchNodeId && row.nodeId !== dispatchListSearchNodeId) return false;
      return true;
    });
  }, [outsourceDispatchRows, dispatchListSearchOrder, dispatchListSearchProduct, dispatchListSearchNodeId, products, productionLinkMode]);

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

  /** 返工：待处理不良。工单模式按单+工序；关联产品模式按产品+工序（PMP + 各工单工序不良合并，扣减工单级与无单号返工/报损） */
  const reworkPendingRows = useMemo((): ReworkPendingRow[] => {
    if (limitType !== 'REWORK') return [];
    if (productionLinkMode === 'order') {
      const reworkByKey: Record<string, number> = {};
      records
        .filter(r => r.type === 'REWORK' && r.orderId)
        .forEach(r => {
          const srcNode = r.sourceNodeId ?? r.nodeId;
          if (!srcNode) return;
          const key = `${r.orderId}|${srcNode}`;
          reworkByKey[key] = (reworkByKey[key] ?? 0) + r.quantity;
        });
      const scrapByKey: Record<string, number> = {};
      records
        .filter(r => r.type === 'SCRAP' && r.orderId && r.nodeId)
        .forEach(r => {
          const key = `${r.orderId}|${r.nodeId}`;
          scrapByKey[key] = (scrapByKey[key] ?? 0) + r.quantity;
        });
      const rows: ReworkPendingRow[] = [];
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
            scope: 'order',
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
    }
    const prodKey = (productId: string, nodeId: string) => `${productId}|${nodeId}`;
    const defectiveMap = new Map<string, number>();
    productMilestoneProgresses.forEach(pmp => {
      const k = prodKey(pmp.productId, pmp.milestoneTemplateId);
      const d = (pmp.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
      defectiveMap.set(k, (defectiveMap.get(k) ?? 0) + d);
    });
    orders.forEach(order => {
      order.milestones.forEach(ms => {
        const d = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
        if (d <= 0) return;
        const k = prodKey(order.productId, ms.templateId);
        defectiveMap.set(k, (defectiveMap.get(k) ?? 0) + d);
      });
    });
    const reworkProd = new Map<string, number>();
    records
      .filter(r => r.type === 'REWORK' && r.productId)
      .forEach(r => {
        const src = r.sourceNodeId ?? r.nodeId;
        if (!src) return;
        const k = prodKey(r.productId, src);
        reworkProd.set(k, (reworkProd.get(k) ?? 0) + r.quantity);
      });
    const scrapProd = new Map<string, number>();
    records
      .filter(r => r.type === 'SCRAP' && r.productId && r.nodeId)
      .forEach(r => {
        const k = prodKey(r.productId, r.nodeId);
        scrapProd.set(k, (scrapProd.get(k) ?? 0) + r.quantity);
      });
    const rows: ReworkPendingRow[] = [];
    defectiveMap.forEach((defectiveTotal, key) => {
      if (defectiveTotal <= 0) return;
      const [productId, nodeId] = key.split('|');
      const reworkTotal = reworkProd.get(key) ?? 0;
      const scrapTotal = scrapProd.get(key) ?? 0;
      const pendingQty = defectiveTotal - reworkTotal - scrapTotal;
      if (pendingQty <= 0) return;
      const product = products.find(p => p.id === productId);
      const parents = orders.filter(o => !o.parentOrderId && o.productId === productId);
      const cnt = parents.length;
      const parentNos = parents.map(o => o.orderNumber).filter(Boolean) as string[];
      const productOrdersTitle = parentNos.join('、');
      const productOrdersLine =
        parentNos.length === 0
          ? undefined
          : parentNos.length <= 2
            ? productOrdersTitle
            : `${parentNos.slice(0, 2).join('、')} … 共 ${cnt} 单`;
      const firstNo = parents[0]?.orderNumber;
      rows.push({
        scope: 'product',
        orderId: '',
        orderNumber: cnt > 1 ? `关联产品（${cnt}条工单）` : firstNo ? `${firstNo}（按产品）` : '按产品汇总',
        productId,
        productName: product?.name ?? '—',
        nodeId,
        milestoneName: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId,
        defectiveTotal,
        reworkTotal,
        scrapTotal,
        pendingQty,
        productOrderCount: cnt,
        productOrdersLine,
        productOrdersTitle: parentNos.length ? productOrdersTitle : undefined
      });
    });
    rows.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    return rows;
  }, [limitType, productionLinkMode, records, orders, products, productMilestoneProgresses, globalNodes]);

  /** 待处理不良：单号（含报工单号 BG…）、货号、工序 */
  const filteredReworkPendingRows = useMemo(() => {
    const orderKw = (reworkListSearchOrder || '').trim().toLowerCase();
    const productKw = (reworkListSearchProduct || '').trim().toLowerCase();
    return reworkPendingRows.filter(row => {
      if (orderKw) {
        const numOk = (row.orderNumber || '').toLowerCase().includes(orderKw);
        let docOk = false;
        if (row.scope === 'order') {
          const o = orders.find(x => x.id === row.orderId);
          const ms = o?.milestones?.find(m => m.templateId === row.nodeId);
          docOk = reworkReportsMatchDocSearch(ms?.reports, orderKw);
        } else {
          for (const p of productMilestoneProgresses) {
            if (p.productId !== row.productId || p.milestoneTemplateId !== row.nodeId) continue;
            if (reworkReportsMatchDocSearch(p.reports, orderKw)) {
              docOk = true;
              break;
            }
          }
          if (!docOk) {
            for (const o of orders) {
              if (o.productId !== row.productId) continue;
              const ms = o.milestones?.find(m => m.templateId === row.nodeId);
              if (reworkReportsMatchDocSearch(ms?.reports, orderKw)) {
                docOk = true;
                break;
              }
            }
          }
          if (!docOk) {
            docOk = orders.some(
              o => !o.parentOrderId && o.productId === row.productId && (o.orderNumber || '').toLowerCase().includes(orderKw)
            );
          }
        }
        if (!numOk && !docOk) return false;
      }
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (reworkListSearchNodeId && row.nodeId !== reworkListSearchNodeId) return false;
      return true;
    });
  }, [
    reworkPendingRows,
    reworkListSearchOrder,
    reworkListSearchProduct,
    reworkListSearchNodeId,
    products,
    orders,
    productMilestoneProgresses
  ]);

  /** 待处理不良列表：待返工多的优先，便于处理积压 */
  const displayReworkPendingRows = useMemo(() => {
    return [...filteredReworkPendingRows].sort((a, b) => {
      if (b.pendingQty !== a.pendingQty) return b.pendingQty - a.pendingQty;
      const aKey = a.scope === 'order' ? a.orderNumber : a.productName;
      const bKey = b.scope === 'order' ? b.orderNumber : b.productName;
      return (aKey || '').localeCompare(bKey || '', 'zh-CN');
    });
  }, [filteredReworkPendingRows]);

  const reworkPendingTotalPending = useMemo(
    () => displayReworkPendingRows.reduce((s, r) => s + r.pendingQty, 0),
    [displayReworkPendingRows]
  );

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

  /** 返工管理·关联产品：按产品汇总各返工目标工序（不区分工单） */
  const reworkStatsByProductId = useMemo(() => {
    if (limitType !== 'REWORK' || productionLinkMode !== 'product') {
      return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    }
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const parentIdSetByProduct = new Map<string, Set<string>>();
    parentOrders.forEach(o => {
      if (!parentIdSetByProduct.has(o.productId)) parentIdSetByProduct.set(o.productId, new Set());
      parentIdSetByProduct.get(o.productId)!.add(o.id);
    });
    const byProduct = new Map<string, Map<string, { totalQty: number; completedQty: number; pendingSeq: number }>>();
    reworkRecords.forEach(r => {
      const pid = r.productId;
      if (!pid) return;
      const parents = parentIdSetByProduct.get(pid);
      if (!parents) return;
      if (r.orderId && !parents.has(r.orderId)) return;
      const byNode = byProduct.get(pid) ?? new Map();
      const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      const completed =
        r.status === '已完成' ||
        (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
      targetNodes.forEach(nodeId => {
        const cur = byNode.get(nodeId) ?? { totalQty: 0, completedQty: 0, pendingSeq: 0 };
        cur.totalQty += r.quantity;
        const doneAtNode =
          r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
        cur.completedQty += Math.min(r.quantity, doneAtNode);
        cur.pendingSeq += reworkRemainingAtNode(r, nodeId);
        byNode.set(nodeId, cur);
      });
      byProduct.set(pid, byNode);
    });
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    byProduct.forEach((byNode, pid) => {
      const product = products.find(p => p.id === pid);
      const seq = product?.milestoneNodeIds ?? [];
      let list = Array.from(byNode.entries())
        .filter(([, v]) => v.totalQty > 0)
        .map(([nodeId, v]) => ({
          nodeId,
          nodeName: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty
        }));
      if (seq.length) {
        list.sort((a, b) => {
          const ia = seq.indexOf(a.nodeId);
          const ib = seq.indexOf(b.nodeId);
          if (ia === -1 && ib === -1) return (a.nodeName || '').localeCompare(b.nodeName || '');
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
      } else {
        list.sort((a, b) => {
          const idxA = globalNodes.findIndex(n => n.id === a.nodeId);
          const idxB = globalNodes.findIndex(n => n.id === b.nodeId);
          return (idxA < 0 ? 999 : idxA) - (idxB < 0 ? 999 : idxB);
        });
      }
      if (list.length > 0) result.set(pid, list);
    });
    return result;
  }, [limitType, productionLinkMode, records, parentOrders, products, globalNodes, processSequenceMode]);

  /** 返工管理·关联工单：按单 + 目标工序聚合 */
  const reworkStatsByOrderId = useMemo(() => {
    if (limitType !== 'REWORK' || productionLinkMode === 'product') {
      return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    }
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    orders.forEach(order => {
      const byNode = new Map<string, { totalQty: number; completedQty: number; pendingSeq: number }>();
      reworkRecords.forEach(r => {
        if (r.orderId !== order.id) return;
        const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
        const completed =
          r.status === '已完成' ||
          (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
        targetNodes.forEach(nodeId => {
          const cur = byNode.get(nodeId) ?? { totalQty: 0, completedQty: 0, pendingSeq: 0 };
          cur.totalQty += r.quantity;
          const doneAtNode =
            r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
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
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty
        }))
        .sort((a, b) => {
          const idxA = globalNodes.findIndex(n => n.id === a.nodeId);
          const idxB = globalNodes.findIndex(n => n.id === b.nodeId);
          return (idxA < 0 ? 999 : idxA) - (idxB < 0 ? 999 : idxB);
        });
      if (list.length > 0) result.set(order.id, list);
    });
    return result;
  }, [limitType, productionLinkMode, records, orders, globalNodes, processSequenceMode]);

  /** 不良品处理：当前行的产品、分类、是否按颜色尺码录入 */
  const reworkActionProduct = useMemo(() => (reworkActionRow ? products.find(p => p.id === reworkActionRow.productId) : null), [reworkActionRow, products]);
  const reworkActionCategory = useMemo(() => (reworkActionProduct ? categories.find(c => c.id === reworkActionProduct.categoryId) : null), [reworkActionProduct, categories]);
  const reworkActionHasColorSize = Boolean(reworkActionCategory?.hasColorSize && reworkActionProduct?.variants && reworkActionProduct.variants.length > 0);
  /** 不良品处理：按规格的可处理数量 = 报工不良明细(variantId) − 已返工明细 − 已报损明细 */
  const reworkActionPendingByVariant = useMemo((): Record<string, number> => {
    if (!reworkActionRow) return {};
    const defectiveByVariant: Record<string, number> = {};
    if (reworkActionRow.scope === 'product') {
      productMilestoneProgresses
        .filter(p => p.productId === reworkActionRow.productId && p.milestoneTemplateId === reworkActionRow.nodeId)
        .forEach(pmp => {
          (pmp.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            defectiveByVariant[vid] = (defectiveByVariant[vid] ?? 0) + (r.defectiveQuantity ?? 0);
          });
        });
      orders.forEach(o => {
        if (o.productId !== reworkActionRow.productId) return;
        const ms = o.milestones?.find(m => m.templateId === reworkActionRow.nodeId);
        (ms?.reports || []).forEach(r => {
          const vid = r.variantId ?? '';
          defectiveByVariant[vid] = (defectiveByVariant[vid] ?? 0) + (r.defectiveQuantity ?? 0);
        });
      });
    } else {
      const order = orders.find(o => o.id === reworkActionRow.orderId);
      const ms = order?.milestones?.find(m => m.templateId === reworkActionRow.nodeId);
      (ms?.reports || []).forEach(r => {
        const vid = r.variantId ?? '';
        defectiveByVariant[vid] = (defectiveByVariant[vid] ?? 0) + (r.defectiveQuantity ?? 0);
      });
    }
    const reworkByVariant: Record<string, number> = {};
    if (reworkActionRow.scope === 'product') {
      records
        .filter(
          r =>
            r.type === 'REWORK' &&
            r.productId === reworkActionRow.productId &&
            (r.sourceNodeId ?? r.nodeId) === reworkActionRow.nodeId
        )
        .forEach(r => {
          const vid = r.variantId ?? '';
          reworkByVariant[vid] = (reworkByVariant[vid] ?? 0) + r.quantity;
        });
    } else {
      records
        .filter(r => r.type === 'REWORK' && r.orderId === reworkActionRow.orderId && (r.sourceNodeId ?? r.nodeId) === reworkActionRow.nodeId)
        .forEach(r => {
          const vid = r.variantId ?? '';
          reworkByVariant[vid] = (reworkByVariant[vid] ?? 0) + r.quantity;
        });
    }
    const scrapByVariant: Record<string, number> = {};
    if (reworkActionRow.scope === 'product') {
      records
        .filter(r => r.type === 'SCRAP' && r.productId === reworkActionRow.productId && r.nodeId === reworkActionRow.nodeId)
        .forEach(r => {
          const vid = r.variantId ?? '';
          scrapByVariant[vid] = (scrapByVariant[vid] ?? 0) + r.quantity;
        });
    } else {
      records.filter(r => r.type === 'SCRAP' && r.orderId === reworkActionRow.orderId && r.nodeId === reworkActionRow.nodeId).forEach(r => {
        const vid = r.variantId ?? '';
        scrapByVariant[vid] = (scrapByVariant[vid] ?? 0) + r.quantity;
      });
    }
    const pending: Record<string, number> = {};
    const allVariantIds = new Set<string>([...Object.keys(defectiveByVariant), ...Object.keys(reworkByVariant), ...Object.keys(scrapByVariant)]);
    if (reworkActionProduct?.variants?.length) {
      reworkActionProduct.variants.forEach(v => { allVariantIds.add(v.id); });
    }
    allVariantIds.forEach(vid => {
      const d = defectiveByVariant[vid] ?? 0;
      const rw = reworkByVariant[vid] ?? 0;
      const sp = scrapByVariant[vid] ?? 0;
      const p = Math.max(0, d - rw - sp);
      if (p > 0 || vid !== '') pending[vid] = p;
    });
    return pending;
  }, [reworkActionRow, orders, records, reworkActionProduct?.variants, productMilestoneProgresses]);

  /** 不良品处理：规格数量汇总（用于校验与展示） */
  const reworkActionVariantTotal = useMemo(() => (Object.values(reworkActionVariantQuantities) as number[]).reduce((s, q) => s + (Number(q) || 0), 0), [reworkActionVariantQuantities]);
  const reworkActionGroupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!reworkActionProduct?.variants?.length) return {};
    const groups: Record<string, ProductVariant[]> = {};
    reworkActionProduct.variants.forEach(v => {
      const c = v.colorId || 'none';
      if (!groups[c]) groups[c] = [];
      groups[c].push(v);
    });
    return groups;
  }, [reworkActionProduct?.variants]);

  /** 返工报工弹窗：按路径分组的待返工数据；顺序模式下仅统计「上道已流入本道」的可报数，pathKey 保留路径顺序 */
  const reworkReportPaths = useMemo(() => {
    if (!reworkReportModal) return [];
    const { order, nodeId: currentNodeId } = reworkReportModal;
    const reworkList = records.filter(r => {
      if (r.type !== 'REWORK') return false;
      const orderOk = r.orderId === order.id;
      const productLegacy = !r.orderId && r.productId === order.productId;
      if (!orderOk && !productLegacy) return false;
      const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      if (!pathNodes.includes(currentNodeId)) return false;
      if (r.status === '已完成') return false;
      const remaining = reworkRemainingAtNode(r, currentNodeId);
      if (remaining <= 0) return false;
      return true;
    });
    const byPath = new Map<string, { records: ProductionOpRecord[]; pendingByVariant: Record<string, number> }>();
    reworkList.forEach(r => {
      const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      const pathKey = pathNodes.join('|');
      const cur = byPath.get(pathKey) ?? { records: [], pendingByVariant: {} };
      cur.records.push(r);
      const remaining = reworkRemainingAtNode(r, currentNodeId);
      const vid = r.variantId ?? '';
      cur.pendingByVariant[vid] = (cur.pendingByVariant[vid] ?? 0) + remaining;
      byPath.set(pathKey, cur);
    });
    return Array.from(byPath.entries()).map(([pathKey, { records: recs, pendingByVariant }]) => {
      const nodeIds = pathKey.split('|').filter(Boolean);
      const pathLabel = nodeIds.length <= 1
        ? (globalNodes.find(n => n.id === nodeIds[0])?.name ?? nodeIds[0])
        : nodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、');
      const totalPending = Object.values(pendingByVariant).reduce((s, q) => s + q, 0);
      return { pathKey, pathLabel, nodeIds, records: recs, totalPending, pendingByVariant };
    }).filter(p => p.totalPending > 0);
  }, [reworkReportModal, records, globalNodes, processSequenceMode]);

  /** 返工报工：当前工单产品、是否按规格 */
  const reworkReportProduct = useMemo(() => reworkReportModal ? products.find(p => p.id === reworkReportModal.order.productId) : null, [reworkReportModal, products]);
  const reworkReportCategory = useMemo(() => reworkReportProduct ? categories.find(c => c.id === reworkReportProduct.categoryId) : null, [reworkReportProduct, categories]);
  const reworkReportHasColorSize = Boolean(reworkReportCategory?.hasColorSize && reworkReportProduct?.variants && reworkReportProduct.variants.length > 0);
  const reworkReportGroupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!reworkReportProduct?.variants?.length) return {};
    const groups: Record<string, ProductVariant[]> = {};
    reworkReportProduct.variants.forEach(v => {
      const c = v.colorId || 'none';
      if (!groups[c]) groups[c] = [];
      groups[c].push(v);
    });
    return groups;
  }, [reworkReportProduct?.variants]);

  /** 返工管理：工单模式=主/子分组；关联产品模式=仅按产品一条（工序汇总） */
  const reworkListBlocks = useMemo(() => {
    if (limitType !== 'REWORK') return [];
    if (productionLinkMode === 'product') {
      return Array.from(reworkStatsByProductId.keys())
        .sort((a, b) =>
          (products.find(p => p.id === a)?.name || '').localeCompare(products.find(p => p.id === b)?.name || '', 'zh-CN')
        )
        .map(productId => ({ type: 'productAggregate' as const, productId }));
    }
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
  }, [limitType, productionLinkMode, parentOrders, orders, reworkStatsByOrderId, reworkStatsByProductId, products]);

  /** 外协：待收回清单。工单模式=按工单+工序汇总；产品模式=按产品+工序+合作方汇总，无工单 */
  const outsourceReceiveRows = useMemo(() => {
    if (limitType !== 'OUTSOURCE') return [];
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE');
    const isProductMode = productionLinkMode === 'product';

    if (isProductMode) {
      const byKey: Record<string, { dispatched: number; received: number; partner: string }> = {};
      outsourceRecords.forEach(r => {
        if (r.orderId || !r.nodeId || !r.productId) return;
        const key = `${r.productId}|${r.nodeId}|${r.partner ?? ''}`;
        if (!byKey[key]) byKey[key] = { dispatched: 0, received: 0, partner: r.partner ?? '' };
        if (r.status === '加工中') byKey[key].dispatched += r.quantity;
        else if (r.status === '已收回') byKey[key].received += r.quantity;
      });
      const rows: { orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; dispatched: number; received: number; pending: number }[] = [];
      Object.entries(byKey).forEach(([key, v]) => {
        const pending = v.dispatched - v.received;
        if (pending <= 0) return;
        const [productId, nodeId] = key.split('|');
        const product = products.find(p => p.id === productId);
        const node = globalNodes.find(n => n.id === nodeId);
        rows.push({
          nodeId,
          productId,
          productName: product?.name ?? '—',
          milestoneName: node?.name ?? nodeId,
          partner: v.partner,
          dispatched: v.dispatched,
          received: v.received,
          pending
        });
      });
      return rows.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    }

    const byKey: Record<string, { dispatched: number; received: number; partner: string }> = {};
    outsourceRecords.forEach(r => {
      if (!r.orderId || !r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      if (!byKey[key]) byKey[key] = { dispatched: 0, received: 0, partner: r.partner ?? '' };
      if (r.status === '加工中') byKey[key].dispatched += r.quantity;
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
    const rows: { orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; dispatched: number; received: number; pending: number }[] = [];
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
  }, [limitType, productionLinkMode, records, orders, products, globalNodes]);

  /** 待收回清单：按工单号（仅工单模式）、货号、外协工厂模糊搜索 + 工序选择过滤后的行 */
  const filteredReceiveRows = useMemo(() => {
    const orderKw = (receiveListSearchOrder || '').trim().toLowerCase();
    const productKw = (receiveListSearchProduct || '').trim().toLowerCase();
    const partnerKw = (receiveListSearchPartner || '').trim().toLowerCase();
    return outsourceReceiveRows.filter(row => {
      if (productionLinkMode === 'order' && orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
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
  }, [outsourceReceiveRows, receiveListSearchOrder, receiveListSearchProduct, receiveListSearchPartner, receiveListSearchNodeId, products, productionLinkMode]);

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

  /** 委外统计：工单模式按工单聚合；产品模式按产品聚合（不区分工单），用于列表页展示 */
  const outsourceStatsByOrder = useMemo(() => {
    if (limitType !== 'OUTSOURCE') return [];
    const isProductMode = productionLinkMode === 'product';
    if (isProductMode) {
      const outsourceRecs = records.filter(r => r.type === 'OUTSOURCE' && !r.orderId && r.partner && r.productId);
      const byKey: Record<string, { productId: string; partner: string; nodeId: string; dispatched: number; received: number }> = {};
      outsourceRecs.forEach(r => {
        const nodeId = r.nodeId ?? '';
        const key = `${r.productId}|${r.partner}|${nodeId}`;
        if (!byKey[key]) byKey[key] = { productId: r.productId, partner: r.partner, nodeId, dispatched: 0, received: 0 };
        if (r.status === '加工中') byKey[key].dispatched += r.quantity;
        else if (r.status === '已收回') byKey[key].received += r.quantity;
      });
      const byProduct = new Map<string, { partner: string; nodeId: string; nodeName: string; dispatched: number; received: number; pending: number }[]>();
      Object.values(byKey).forEach(v => {
        const pending = Math.max(0, v.dispatched - v.received);
        const nodeName = (globalNodes.find(n => n.id === v.nodeId)?.name ?? v.nodeId) || '—';
        if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
        byProduct.get(v.productId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
      });
      return Array.from(byProduct.entries())
        .map(([productId, partners]) => {
          const product = products.find(p => p.id === productId);
          const seq = product?.milestoneNodeIds ?? [];
          const nodeOrder = (nodeId: string) => {
            const i = seq.indexOf(nodeId);
            return i >= 0 ? i : 9999;
          };
          const sortedPartners = [...partners].sort((a, b) => {
            const d = nodeOrder(a.nodeId) - nodeOrder(b.nodeId);
            if (d !== 0) return d;
            return (a.partner || '').localeCompare(b.partner || '');
          });
          return {
            productId,
            productName: product?.name ?? '—',
            partners: sortedPartners
          };
        })
        .sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    }
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
          productId: order?.productId,
          productName: product?.name ?? order?.productName ?? '—',
          partners: sortedPartners
        };
      })
      .sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''));
  }, [limitType, productionLinkMode, records, orders, products, globalNodes]);

  /** 外协流水：工单模式按 单据号+工单+产品 聚合；产品模式按 单据号+产品 聚合（不显示工单号） */
  const outsourceFlowSummaryRows = useMemo(() => {
    if (limitType !== 'OUTSOURCE') return [];
    const isProductMode = productionLinkMode === 'product';
    const outsourceList = isProductMode ? records.filter(r => r.type === 'OUTSOURCE' && !r.orderId) : records.filter(r => r.type === 'OUTSOURCE');

    if (isProductMode) {
      const key = (docNo: string, productId: string) => `${docNo}|${productId}`;
      const byKey = new Map<string, { docNo: string; productId: string; productName: string; records: ProductionOpRecord[] }>();
      outsourceList.forEach(rec => {
        const docNo = rec.docNo ?? '—';
        const pid = rec.productId || '';
        const product = products.find(p => p.id === pid);
        const k = key(docNo, pid);
        if (!byKey.has(k)) {
          byKey.set(k, { docNo, productId: pid, productName: product?.name ?? '—', records: [] });
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
          return { ...row, orderId: '', orderNumber: '', records: sorted, dateStr, partner, totalQuantity, remark, milestoneStr, typeStr };
        })
        .sort((a, b) => {
          const tA = a.records[0]?.timestamp ?? '';
          const tB = b.records[0]?.timestamp ?? '';
          return new Date(tB).getTime() - new Date(tA).getTime();
        });
    }

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
          orderNumber: order?.orderNumber ?? (oid ? oid : (product?.name ?? '—')),
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
  }, [limitType, productionLinkMode, records, orders, products, globalNodes]);

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
    if (productionLinkMode !== 'product' && flowFilterOrder.trim()) {
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
  }, [outsourceFlowSummaryRows, flowFilterDateFrom, flowFilterDateTo, flowFilterType, flowFilterPartner, flowFilterDocNo, flowFilterOrder, flowFilterProduct, flowFilterMilestone, productionLinkMode]);

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

  /** 待发清单第二步：从表单弹窗确认发出 */
  const handleDispatchFormSubmit = async () => {
    const partnerName = (dispatchPartnerName || '').trim();
    if (!partnerName) {
      toast.warning('请选择外协工厂。');
      return;
    }
    const entries = Object.entries(dispatchFormQuantities).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      toast.warning('请至少填写一项委外数量。');
      return;
    }
    const docNo = getNextOutsourceDocNo(partnerName);
    const timestamp = new Date().toLocaleString();
    const isProductMode = productionLinkMode === 'product';
    const batch: ProductionOpRecord[] = [];
    entries.forEach(([key, qty]) => {
      const parts = key.split('|');
      const nodeId = parts.length >= 2 ? parts[1] : '';
      const variantId = parts[2];
      if (isProductMode) {
        const productId = parts[0];
        const product = products.find(p => p.id === productId);
        if (!product) return;
        batch.push({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          productId,
          quantity: qty,
          reason: dispatchRemark.trim() || undefined,
          operator: '张主管',
          timestamp,
          status: '加工中',
          partner: partnerName,
          docNo,
          nodeId,
          variantId: variantId || undefined
        } as ProductionOpRecord);
      } else {
        const orderId = parts[0];
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        batch.push({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        } as ProductionOpRecord);
      }
    });
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) await onAddRecord(rec);
    }

    const matchedPartner = partners.find(p => p.name === partnerName);
    const collabTenantId = matchedPartner?.collaborationTenantId;

    setDispatchFormQuantities({});
    setDispatchRemark('');
    setDispatchPartnerName('');
    setDispatchPartnerOpen(false);
    setDispatchPartnerSearch('');
    setDispatchPartnerCategoryTab('all');
    setDispatchFormModalOpen(false);
    setOutsourceModal(null);
    setDispatchSelectedKeys(new Set());

    if (collabTenantId) {
      setCollabSyncConfirm({
        partnerName,
        collaborationTenantId: collabTenantId,
        recordIds: batch.map(r => r.id),
      });
      api.collaboration.listOutsourceRoutes().then(setCollabRoutes).catch(() => setCollabRoutes([]));
    }
  };

  /** 待收回：确认收回（使用 WX-R 开头的收回单号，与发出单号区分） */
  const handleOutsourceReceiveSubmit = () => {
    if (!receiveModal || receiveQty <= 0) return;
    if (receiveQty > receiveModal.pendingQty) {
      toast.error(`本次收回数量不能大于待收回数量（${receiveModal.pendingQty}）。`);
      return;
    }
    const receiveDocNo = getNextReceiveDocNo(receiveModal.partner);
    onAddRecord({
      id: `rec-${Date.now()}-recv-${Math.random().toString(36).slice(2, 8)}`,
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

  /** 关联产品待收回：baseKey 与规格 id 分隔，避免 partner 含 | 时解析错误 */
  const RECEIVE_VARIANT_SEP = '__v__';
  const productReceiveRowKey = (r: { productId: string; nodeId: string; partner?: string }) =>
    `${r.productId}|${r.nodeId}|${r.partner ?? ''}`;

  /** 待收回清单第二步：从表单弹窗确认收货（按规格写入已收回记录，带出原发出单号） */
  const handleReceiveFormSubmit = () => {
    const entries = Object.entries(receiveFormQuantities).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      toast.warning('请至少填写一项收回数量。');
      return;
    }
    const isProductMode = productionLinkMode === 'product';
    for (const [key, qty] of entries) {
      const parts = key.split('|');
      if (isProductMode) {
        const baseK = key.includes(RECEIVE_VARIANT_SEP) ? key.split(RECEIVE_VARIANT_SEP)[0]! : key;
        const row = outsourceReceiveRows.find(r => r.orderId == null && productReceiveRowKey(r) === baseK);
        if (!row) continue;
        const dispatchR = records.filter(
          rr =>
            rr.type === 'OUTSOURCE' &&
            rr.status === '加工中' &&
            !rr.orderId &&
            rr.productId === row.productId &&
            rr.nodeId === row.nodeId &&
            (rr.partner ?? '') === (row.partner ?? '')
        );
        const receiveR = records.filter(
          rr =>
            rr.type === 'OUTSOURCE' &&
            rr.status === '已收回' &&
            !rr.orderId &&
            rr.productId === row.productId &&
            rr.nodeId === row.nodeId &&
            (rr.partner ?? '') === (row.partner ?? '')
        );
        const pendingVar = (vid: string) => {
          const d = dispatchR.filter(rr => (rr.variantId || '') === vid).reduce((s, rr) => s + rr.quantity, 0);
          const rc = receiveR.filter(rr => (rr.variantId || '') === vid).reduce((s, rr) => s + rr.quantity, 0);
          return Math.max(0, d - rc);
        };
        const dispNoVar = dispatchR.filter(rr => !rr.variantId).reduce((s, rr) => s + rr.quantity, 0);
        const recNoVar = receiveR.filter(rr => !rr.variantId).reduce((s, rr) => s + rr.quantity, 0);
        const pendingNoVar = Math.max(0, dispNoVar - recNoVar);
        const hasVariantDispatch = dispatchR.some(rr => !!rr.variantId);
        if (key.includes(RECEIVE_VARIANT_SEP)) {
          const variantId = key.split(RECEIVE_VARIANT_SEP)[1] ?? '';
          const maxQ = pendingVar(variantId);
          if (qty > maxQ) {
            toast.error(`本次收回数量不能大于该规格待收数量（最多${maxQ}）。`);
            return;
          }
        } else if (key === productReceiveRowKey(row)) {
          const maxAgg = hasVariantDispatch ? pendingNoVar : row.pending;
          if (qty > maxAgg) {
            toast.error(`本次收回数量不能大于待收数量（最多${maxAgg}）。`);
            return;
          }
        }
      } else {
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
            toast.error(`本次收回数量不能大于待收数量（最多${maxQty}）。`);
            return;
          }
        } else {
          if (qty > row.pending) {
            toast.error(`本次收回数量不能大于待收数量（最多${row.pending}）。`);
            return;
          }
        }
      }
    }
    const timestamp = new Date().toLocaleString();
    const firstKey = receiveSelectedKeys.values().next().value;
    const firstRow = firstKey ? outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey) : null;
    const partnerName = firstRow?.partner ?? '';
    const receiveDocNo = getNextReceiveDocNo(partnerName);
    for (const [key, qty] of entries) {
      const parts = key.split('|');
      if (isProductMode) {
        const baseKey = key.includes(RECEIVE_VARIANT_SEP) ? key.split(RECEIVE_VARIANT_SEP)[0]! : key;
        const rowP = outsourceReceiveRows.find(r => r.orderId == null && productReceiveRowKey(r) === baseKey);
        if (!rowP) continue;
        const productId = rowP.productId;
        const nodeId = rowP.nodeId;
        const variantId = key.includes(RECEIVE_VARIANT_SEP) ? key.split(RECEIVE_VARIANT_SEP)[1] : undefined;
        const unitPrice = receiveFormUnitPrices[baseKey] ?? 0;
        const amount = qty * unitPrice;
        onAddRecord({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          productId,
          quantity: qty,
          reason: receiveFormRemark.trim() || undefined,
          operator: '张主管',
          timestamp,
          status: '已收回',
          partner: partnerName,
          nodeId,
          variantId: variantId || undefined,
          docNo: receiveDocNo,
          unitPrice: unitPrice || undefined,
          amount: amount || undefined
        });
      } else {
        const orderId = parts[0];
        const nodeId = parts[1];
        const variantId = parts[2];
        const baseKey = parts.length === 3 ? `${orderId}|${nodeId}` : key;
        const unitPrice = receiveFormUnitPrices[baseKey] ?? 0;
        const amount = qty * unitPrice;
        const order = orders.find(o => o.id === orderId);
        if (!order) continue;
        onAddRecord({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
          docNo: receiveDocNo,
          unitPrice: unitPrice || undefined,
          amount: amount || undefined
        });
      }
    }
    setReceiveFormQuantities({});
    setReceiveFormUnitPrices({});
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

  /** 处理不良品流水单号（生成返工 REWORK + 报损 SCRAP 共用）：FL + 日期(yyyyMMdd) + 序号(4位)，使两条流水单号连续 */
  const getNextReworkDocNo = () => {
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `FL${todayStr}-`;
    const existing = records.filter(r => (r.type === 'REWORK' || r.type === 'SCRAP') && r.docNo && r.docNo.startsWith(pattern));
    const used = new Set(existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n) && n >= 1));
    let next = 1;
    while (used.has(next)) next++;
    return `FL${todayStr}-${String(next).padStart(4, '0')}`;
  };

  /** 返工报工流水单号（REWORK_REPORT）：FG + 日期(yyyyMMdd) + 序号(4位)；仅统计 REWORK_REPORT，使返工报工流水中单号连续 */
  const getNextReworkReportDocNo = () => {
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `FG${todayStr}-`;
    const existing = records.filter(r => r.type === 'REWORK_REPORT' && r.docNo && r.docNo.startsWith(pattern));
    const used = new Set(existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n) && n >= 1));
    let next = 1;
    while (used.has(next)) next++;
    return `FG${todayStr}-${String(next).padStart(4, '0')}`;
  };

  /** 返工单号展示：有 docNo 且符合 FG+8位日期+序号 则用 docNo；否则需由调用方传入同日内顺序号（见返工流水弹窗内 buildReworkDisplayDocNoMap） */
  const getReworkDisplayDocNo = (r: ProductionOpRecord, fallbackSeq?: number) => {
    if (r.docNo && /^FG\d{8}-\d{4}$/.test(r.docNo)) return r.docNo;
    const d = r.timestamp ? new Date(r.timestamp) : new Date();
    const dateStr = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0].replace(/-/g, '') : d.toISOString().split('T')[0].replace(/-/g, '');
    const seq = fallbackSeq != null ? fallbackSeq : 1;
    return `FG${dateStr}-${String(seq).padStart(4, '0')}`;
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
      sourceProductId: first.sourceProductId,
      timestamp: first.timestamp,
      warehouseId: first.warehouseId ?? '',
      lines: docRecords.map(r => ({ productId: r.productId, quantity: r.quantity })),
      reason: first.reason,
      operator: first.operator
    };
  };

  const handleStockConfirmSubmit = async () => {
    if (!stockSelectMode) return;
    const toSubmit = Array.from(stockSelectedIds).filter(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
    if (toSubmit.length === 0) return;
    const recordType: ProdOpType = stockSelectMode === 'stock_out' ? 'STOCK_OUT' : 'STOCK_RETURN';
    const docNo = getNextStockDocNo(recordType);
    const timestamp = new Date().toLocaleString();
    const operator = '张主管';
    const srcPid = stockSelectSourceProductId;
    if (srcPid) {
      const batch: ProductionOpRecord[] = toSubmit.map(pid => ({
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: recordType,
        orderId: undefined,
        sourceProductId: srcPid,
        productId: pid,
        quantity: stockConfirmQuantities[pid],
        reason: stockConfirmReason || undefined,
        operator,
        timestamp,
        status: '已完成',
        warehouseId: stockConfirmWarehouseId || undefined,
        docNo
      } as ProductionOpRecord));
      if (onAddRecordBatch && batch.length > 1) {
        await onAddRecordBatch(batch);
      } else {
        for (const rec of batch) await onAddRecord(rec);
      }
      setStockDocDetail({
        docNo,
        type: recordType,
        orderId: '',
        sourceProductId: srcPid,
        timestamp,
        warehouseId: stockConfirmWarehouseId || '',
        lines: toSubmit.map(pid => ({ productId: pid, quantity: stockConfirmQuantities[pid] })),
        reason: stockConfirmReason || undefined,
        operator
      });
    } else if (stockSelectOrderId) {
      const batch: ProductionOpRecord[] = toSubmit.map(pid => ({
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
      } as ProductionOpRecord));
      if (onAddRecordBatch && batch.length > 1) {
        await onAddRecordBatch(batch);
      } else {
        for (const rec of batch) await onAddRecord(rec);
      }
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
    } else return;
    setShowStockConfirmModal(false);
    setStockSelectOrderId(null);
    setStockSelectSourceProductId(null);
    setStockSelectMode(null);
    setStockSelectedIds(new Set());
    setStockConfirmQuantities({});
    setStockConfirmReason('');
  };

  const handleAdd = () => {
    if (!limitType) return;
    const isStockReturn = limitType === 'STOCK_OUT' && stockModalMode === 'stock_return';
    const recordType: ProdOpType = isStockReturn ? 'STOCK_RETURN' : (stockModalMode === 'stock_out' ? 'STOCK_OUT' : limitType);
    const docNo = (recordType === 'STOCK_OUT' || recordType === 'STOCK_RETURN') ? getNextStockDocNo(recordType) : undefined;
    const newRecord: ProductionOpRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: recordType,
      orderId: productionLinkMode === 'product' ? undefined : (form.orderId || undefined),
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
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>{currentBiz?.label || '业务流水'}</h1>
          <p className={pageSubtitleClass}>{currentBiz?.sub || '处理生产业务流水记录'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
        {!showModal && isProductionMaterial && hasOpsPerm('production:material_records:view') && (
            <button
              type="button"
              onClick={() => setShowStockFlowModal(true)}
              className={outlineAccentToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" />
              领料退料流水
            </button>
        )}
        {!showModal && limitType === 'OUTSOURCE' && (
          <>
            {hasOpsPerm('production:outsource_send:allow') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('dispatch')}
              className={outlineToolbarButtonClass}
            >
              <ClipboardList className="w-4 h-4 shrink-0" /> 待发清单
            </button>
            )}
            {hasOpsPerm('production:outsource_receive:allow') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('receive')}
              className={outlineToolbarButtonClass}
            >
              <ArrowDownToLine className="w-4 h-4 shrink-0" /> 待收回清单
            </button>
            )}
            {hasOpsPerm('production:outsource_records:view') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('flow')}
              className={outlineToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" /> 外协流水
            </button>
            )}
          </>
        )}
        {!showModal && limitType === 'REWORK' && (
          <>
            {hasOpsPerm('production:rework_defective:allow') && (
            <button
              type="button"
              onClick={() => setReworkPendingModalOpen(true)}
              className={outlineToolbarButtonClass}
            >
              <ClipboardList className="w-4 h-4 shrink-0" /> 待处理不良
            </button>
            )}
            {hasOpsPerm('production:rework_records:view') && (
            <button
              type="button"
              onClick={() => { setDefectFlowModalOpen(true); setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }}
              className={outlineToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" /> 处理不良品流水
            </button>
            )}
            {hasOpsPerm('production:rework_report_records:view') && (
            <button
              type="button"
              onClick={() => setReworkFlowModalOpen(true)}
              className={outlineToolbarButtonClass}
            >
              <History className="w-4 h-4 shrink-0" /> 返工报工流水
            </button>
            )}
          </>
        )}
        </div>
      </div>

      {isProductionMaterial && !showModal && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看生产物料列表</p>
        </div>
      )}
      {isProductionMaterial && !showModal && canViewMainList && (
        <div className="space-y-4">
          {productionLinkMode === 'product' && productMaterialStatsByProduct ? (
            (() => {
              const pEntries = Array.from(productMaterialStatsByProduct.entries());
              if (pEntries.length === 0) {
                return (
                  <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
                    <p className="text-slate-400 text-sm">暂无工单，请先在「生产计划」下达工单</p>
                  </div>
                );
              }
              return pEntries.map(([fpId, materials]) => {
                const fp = products.find(p => p.id === fpId);
                const orderCnt = orders.filter(o => !o.parentOrderId && o.productId === fpId).length;
                const selecting = stockSelectSourceProductId === fpId && stockSelectMode;
                return (
                  <div key={`fp-${fpId}`} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">关联产品（共 {orderCnt} 条工单）</p>
                          <p className="text-base font-bold text-slate-900 mt-0.5">{fp?.name ?? '—'}{fp?.sku ? <span className="text-slate-400 font-medium text-sm ml-2">{fp.sku}</span> : null}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selecting ? (
                          <>
                            <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (stockSelectedIds.size === 0) return;
                                setStockConfirmQuantities({});
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
                              onClick={() => { setStockSelectSourceProductId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            {hasOpsPerm('production:material_issue:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                            </button>
                            )}
                            {hasOpsPerm('production:material_return:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <Undo2 className="w-3.5 h-3.5" /> 生产退料
                            </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/80">
                            {selecting && (
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
                            <td colSpan={selecting ? 7 : 6} className="px-6 py-8 text-center text-slate-400 text-sm">该产品暂无 BOM 物料，请先在产品中配置 BOM</td>
                          </tr>
                        ) : (
                          materials.map(({ productId, issue, returnQty, theoryCost }) => {
                            const prod = products.find(p => p.id === productId);
                            const net = issue - returnQty;
                            const isSelected = stockSelectedIds.has(productId);
                            return (
                              <tr key={productId} className="hover:bg-slate-50/50 transition-colors">
                                {selecting && (
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
              });
            })()
          ) : parentOrders.length === 0 ? (
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
                              setStockConfirmQuantities({});
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
                          {hasOpsPerm('production:material_issue:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                          </button>
                          )}
                          {hasOpsPerm('production:material_return:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> 生产退料
                          </button>
                          )}
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

      {limitType === 'REWORK' && !showModal && !reworkPendingModalOpen && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看返工管理列表</p>
        </div>
      )}
      {limitType === 'REWORK' && !showModal && !reworkPendingModalOpen && canViewMainList && (
        <div className="space-y-2">
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
                const stats = [...(reworkStatsByOrderId.get(order.id) ?? [])];
                const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const cardClass = isChild
                  ? 'bg-white px-5 py-2 rounded-2xl border border-l-4 border-l-slate-300 border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center'
                  : 'bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center';
                return (
                  <div key={order.id} className={cardClass} style={indentPx != null && indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                    <div className="flex items-center gap-4 min-w-0">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => setReworkDetailOrderId(order.parentOrderId ?? order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none block`}>
                          <img src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => setReworkDetailOrderId(order.parentOrderId ?? order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors`}>
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
                          {order.startDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 开始: {(order.startDate || '').trim().slice(0, 10)}</span>}
                          {order.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 交期: {(order.dueDate || '').trim().slice(0, 10)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                      {stats.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x -mx-0.5">
                          <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
                            {stats.map(({ nodeId, nodeName, totalQty, completedQty, pendingQty }) => {
                              const isAllDone = pendingQty <= 0;
                              return (
                                <button
                                  key={nodeId}
                                  type="button"
                                  title={`工序「${nodeName}」返工：总 ${totalQty}，已返工 ${completedQty}，${processSequenceMode === 'sequential' ? '可报 ' : '未返工 '}${pendingQty}${processSequenceMode === 'sequential' ? '（顺序模式：上道流入可报数）' : ''}（点击报工）`}
                                  onClick={() => { setReworkReportModal({ order, nodeId, nodeName }); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); }}
                                  className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border bg-slate-50 border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left cursor-pointer"
                                >
                                  <span className="text-[10px] font-bold text-indigo-600 mb-1 leading-tight truncate w-full text-center">{nodeName}</span>
                                  <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                    <span className="text-base font-black text-slate-900 leading-none">{pendingQty}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
                                    <span>{processSequenceMode === 'sequential' ? (pendingQty + completedQty) : totalQty} / <span className="text-slate-600">{completedQty}</span></span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 text-slate-400 text-sm italic">该工单暂无返工工序</div>
                      )}
                      {(hasOpsPerm('production:rework_detail:allow') || hasOpsPerm('production:rework_material:allow')) && (
                      <div className="flex flex-col gap-2 shrink-0 pt-0.5">
                        {hasOpsPerm('production:rework_detail:allow') && (
                        <button
                          type="button"
                          onClick={() => setReworkDetailOrderId(order.parentOrderId ?? order.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        )}
                        {hasOpsPerm('production:rework_material:allow') && (
                        <button
                          type="button"
                          onClick={() => { setReworkMaterialOrderId(order.id); setReworkMaterialQty({}); setReworkMaterialWarehouseId(warehouses[0]?.id ?? ''); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <Package className="w-3.5 h-3.5" /> 物料
                        </button>
                        )}
                      </div>
                      )}
                    </div>
                  </div>
                );
              };

              if (block.type === 'productAggregate') {
                const fp = products.find(p => p.id === block.productId);
                const stats = reworkStatsByProductId.get(block.productId) ?? [];
                const repOrder = parentOrders
                  .filter(o => o.productId === block.productId)
                  .sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''))[0];
                const totalQtyAll = parentOrders
                  .filter(o => o.productId === block.productId)
                  .reduce((s, o) => s + o.items.reduce((t, i) => t + i.quantity, 0), 0);
                if (!repOrder) return null;
                return (
                  <div
                    key={`rework-prod-${block.productId}`}
                    className="bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr_auto] gap-3 lg:gap-4 items-center"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {fp?.imageUrl ? (
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                          <img src={fp.imageUrl} alt={fp.name} className="w-full h-full object-cover block" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600">
                          <Layers className="w-7 h-7" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">按产品汇总</span>
                          <span className="font-bold text-slate-800 text-lg">{fp?.name ?? '未知产品'}</span>
                          {fp?.sku && <span className="text-[10px] font-bold text-slate-500">{fp.sku}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" /> 合计件数: {totalQtyAll}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                      {stats.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x -mx-0.5">
                          <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
                            {stats.map(({ nodeId, nodeName, totalQty, completedQty, pendingQty }) => {
                              const isAllDone = pendingQty <= 0;
                              return (
                                <button
                                  key={nodeId}
                                  type="button"
                                  title={`工序「${nodeName}」返工（全产品汇总）：总 ${totalQty}，已返工 ${completedQty}，${processSequenceMode === 'sequential' ? '可报 ' : '未返工 '}${pendingQty}（点击报工，以首单为载体）`}
                                  onClick={() => {
                                    setReworkReportModal({ order: repOrder, nodeId, nodeName });
                                    setReworkReportQuantities({});
                                    setReworkReportWorkerId('');
                                    setReworkReportEquipmentId('');
                                  }}
                                  className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border bg-slate-50 border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left cursor-pointer"
                                >
                                  <span className="text-[10px] font-bold text-indigo-600 mb-1 leading-tight truncate w-full text-center">{nodeName}</span>
                                  <div
                                    className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}
                                  >
                                    <span className="text-base font-black text-slate-900 leading-none">{pendingQty}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
                                    <span>
                                      {processSequenceMode === 'sequential' ? pendingQty + completedQty : totalQty} /{' '}
                                      <span className="text-slate-600">{completedQty}</span>
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 text-slate-400 text-sm italic">暂无返工工序</div>
                      )}
                    </div>
                    {(hasOpsPerm('production:rework_detail:allow') || hasOpsPerm('production:rework_material:allow')) && (
                      <div className="flex flex-col gap-2 shrink-0 pt-0.5">
                        {hasOpsPerm('production:rework_detail:allow') && (
                        <button
                          type="button"
                          onClick={() => setReworkDetailOrderId(repOrder.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        )}
                        {hasOpsPerm('production:rework_material:allow') && (
                        <button
                          type="button"
                          onClick={() => { setReworkMaterialOrderId(repOrder.id); setReworkMaterialQty({}); setReworkMaterialWarehouseId(warehouses[0]?.id ?? ''); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <Package className="w-3.5 h-3.5" /> 物料
                        </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
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
                  <div className="p-2.5 space-y-1.5">
                    {isExpanded ? allWithDepth.map(({ order, depth }) => renderReworkCard(order, depth > 0, depth > 0 ? 24 * depth : 0)) : renderReworkCard(parent)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 确认领料/退料弹窗：布局与编辑页一致 */}
      {showStockConfirmModal && (stockSelectOrderId || stockSelectSourceProductId) && stockSelectMode && isProductionMaterial && (() => {
        const order = stockSelectOrderId ? orders.find(o => o.id === stockSelectOrderId) : undefined;
        const srcProd = stockSelectSourceProductId ? products.find(p => p.id === stockSelectSourceProductId) : undefined;
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
                    {srcProd ? srcProd.name : (order?.orderNumber ?? '')}
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
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{srcProd?.name ?? (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—')}</h2>
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
        const sourceProd = stockDocDetail.sourceProductId
          ? products.find(p => p.id === stockDocDetail.sourceProductId)
          : null;
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
                    {order
                      ? order.orderNumber
                      : sourceProd?.name ??
                        (stockDocDetail.lines[0]
                          ? products.find(p => p.id === stockDocDetail.lines[0].productId)?.name ?? stockDocDetail.docNo
                          : stockDocDetail.docNo)}
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
                      {onUpdateRecord && hasOpsPerm('production:material_records:edit') && (
                        <button
                          type="button"
                          onClick={startEdit}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && hasOpsPerm('production:material_records:delete') && (
                        <button
                          type="button"
                          onClick={() => {
                            void confirm({ message: `确定要删除该张${isReturn ? '退料' : '领料'}单的所有记录吗？此操作不可恢复。`, danger: true }).then((ok) => {
                              if (!ok) return;
                              const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
                              docRecords.forEach(rec => onDeleteRecord(rec.id));
                              setStockDocDetail(null);
                              setStockDocEditForm(null);
                            });
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
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">
                  {sourceProd?.name ?? (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—')}
                </h2>
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
                {productionLinkMode !== 'product' ? (
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
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">关联产品</label>
                    <input
                      type="text"
                      value={stockFlowFilterOrderKeyword}
                      onChange={e => setStockFlowFilterOrderKeyword(e.target.value)}
                      placeholder="成品名称模糊搜索"
                      className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                )}
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
            <div className="flex-1 overflow-auto p-4">
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
                        {productionLinkMode !== 'product' ? (
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单</th>
                        ) : (
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">关联产品</th>
                        )}
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
                        const matProduct = products.find(p => p.id === rec.productId);
                        const sourceProd = rec.sourceProductId ? products.find(p => p.id === rec.sourceProductId) : null;
                        const isReturn = rec.type === 'STOCK_RETURN';
                        const docNo = rec.docNo ?? '';
                        const openDetail = () => {
                          if (!docNo) return;
                          const detail = buildStockDocDetailFromDocNo(docNo);
                          if (detail) setStockDocDetail(detail);
                        };
                        const linkCol =
                          productionLinkMode === 'product'
                            ? sourceProd?.name ?? (rec.orderId ? order?.orderNumber ?? '—' : '—')
                            : rec.orderId
                              ? order?.orderNumber ?? '—'
                              : matProduct?.name ?? '—';
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
                            <td className="px-4 py-3 text-[10px] font-black text-indigo-600">{linkCol}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{matProduct?.name ?? '未知物料'}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{rec.quantity}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{rec.reason ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">{rec.operator}</td>
                            <td className="px-4 py-3">
                              {docNo && hasOpsPerm('production:material_records:view') ? (
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

      {limitType === 'OUTSOURCE' && !showModal && outsourceModal === null && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看外协管理列表</p>
        </div>
      )}
      {limitType === 'OUTSOURCE' && !showModal && outsourceModal === null && canViewMainList && (
        <div className="space-y-2">
          {outsourceStatsByOrder.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <Truck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">暂无委外数据，请点击上方「待发清单」「待收回清单」或「外协流水」操作。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {outsourceStatsByOrder.map((item) => {
                const orderId = 'orderId' in item ? item.orderId : undefined;
                const orderNumber = 'orderNumber' in item ? item.orderNumber : undefined;
                const productId = 'productId' in item ? item.productId : (item as { productId: string }).productId;
                const productName = item.productName;
                const partners = item.partners;
                const order = orderId ? orders.find(o => o.id === orderId) : undefined;
                const product = products.find(p => p.id === productId);
                const orderTotalQty = order?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                return (
                <div
                  key={orderId ?? productId}
                  className="bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center"
                >
                  <div className="flex items-center gap-4 min-w-0">
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
                        {productionLinkMode !== 'product' && orderNumber != null && <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{orderNumber}</span>}
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
                        {productionLinkMode !== 'product' && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>}
                        {order?.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 交期: {(order.dueDate || '').trim().slice(0, 10)}</span>}
                        {order?.startDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 开始: {(order.startDate || '').trim().slice(0, 10)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 flex-wrap flex-1 min-w-0 -my-0.5">
                    {partners.map(({ partner, nodeId, nodeName, dispatched, received, pending }) => (
                      <div
                        key={`${partner}|${nodeId}`}
                        className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 transition-colors"
                      >
                        <div className="mb-1 w-full text-center leading-tight">
                          <div className="text-[10px] font-bold text-emerald-600 truncate" title={nodeName}>{nodeName}</div>
                          <div className="text-[10px] font-bold text-slate-600 truncate" title={partner}>{partner}</div>
                        </div>
                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${pending > 0 ? 'border-indigo-300' : 'border-emerald-400'}`}>
                          <span className="text-base font-black text-slate-900 leading-none">{pending}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 leading-tight">
                          <span className="text-[10px] font-bold text-slate-500">{dispatched} / {received}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (productionLinkMode === 'product') setFlowFilterOrder('');
                              else setFlowFilterOrder(orderNumber ?? '');
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
              <p className="text-xs text-slate-500">
                {productionLinkMode === 'product'
                  ? '仅显示工序节点中已开启「可外协」的工序；可委外数量 = 产品该工序报工完成量 − 已委外发出。同一批次只能选择同一工序同时发出。'
                  : '仅显示工序节点中已开启「可外协」的工序；可委外数量 = 工单总量 − 该工序已报工 − 已委外发出。同一批次只能选择同一工序的工单同时发出。'}
              </p>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
              {productionLinkMode !== 'product' && (
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
              )}
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
                    {productionLinkMode !== 'product' && <th className="w-[28%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>}
                    <th className={`${productionLinkMode === 'product' ? 'w-[40%]' : 'w-[28%]'} px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest`}>产品</th>
                    <th className="w-[20%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                    <th className="w-[24%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">可委外数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDispatchRows.length === 0 ? (
                    <tr>
                      <td colSpan={productionLinkMode === 'product' ? 4 : 5} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceDispatchRows.length === 0 ? (productionLinkMode === 'product' ? '暂无可外协工序或可委外数量均为 0。请先在关联产品报工中完成该工序报工。' : '暂无可外协工序，或可委外数量均为 0。请在系统设置中为工序开启「可外协」并确保工单有未委外数量。') : '无匹配项，请调整搜索条件。'}</td>
                    </tr>
                  ) : (
                    filteredDispatchRows.map(row => {
                      const key = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
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
                                  if (next.size > 0) {
                                    const selectedNodeId = next.values().next().value?.split('|')[1];
                                    if (selectedNodeId !== row.nodeId) {
                                      toast.warning('只能选择同一工序同时发出，请先取消其他工序的勾选。');
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
                          {productionLinkMode !== 'product' && <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>}
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
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" /> 待处理不良</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed hidden sm:block">
                  {productionLinkMode === 'product'
                    ? '合并产品工序与各工单报工不良；单号支持工单号或报工单号 BG…。列表按「待返工」从高到低排列。'
                    : '扣除已返工/报损后的待处理数量；单号支持工单号或报工单号。按待返工数量优先显示。'}
                </p>
              </div>
              <button type="button" onClick={() => setReworkPendingModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:flex-initial sm:min-w-[180px]">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">单号</label>
                  <input
                    type="text"
                    value={reworkListSearchOrder}
                    onChange={e => setReworkListSearchOrder(e.target.value)}
                    placeholder="工单号 / BG报工单号"
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[120px] flex-1 sm:flex-initial sm:min-w-[160px]">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">产品</label>
                  <input
                    type="text"
                    value={reworkListSearchProduct}
                    onChange={e => setReworkListSearchProduct(e.target.value)}
                    placeholder="名称 / SKU"
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">工序</label>
                  <select
                    value={reworkListSearchNodeId}
                    onChange={e => setReworkListSearchNodeId(e.target.value)}
                    className="rounded-xl border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[120px]"
                  >
                    <option value="">全部工序</option>
                    {reworkPendingNodeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className={`w-full text-left border-collapse ${productionLinkMode === 'product' ? 'min-w-[720px]' : 'min-w-[880px]'}`}>
                <thead>
                  <tr className="bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                    {productionLinkMode !== 'product' && (
                      <th className="px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-[22%]">工单号</th>
                    )}
                    <th className={`px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider ${productionLinkMode === 'product' ? 'w-[30%]' : 'w-[24%]'}`}>产品</th>
                    <th className="px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-[14%]">工序</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">不良</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">已返工</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">已报损</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-amber-700 uppercase tracking-wider whitespace-nowrap w-[10%]">待返工</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider w-[11%]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReworkPendingRows.length === 0 ? (
                    <tr>
                      <td colSpan={productionLinkMode === 'product' ? 7 : 8} className="px-6 py-16 text-center text-slate-400 text-sm">
                        {reworkPendingRows.length === 0
                          ? '暂无待处理不良。请先在工单中心报工中登记不良品数量。'
                          : '无匹配项，可尝试报工单号（BG…）或清空筛选。'}
                      </td>
                    </tr>
                  ) : (
                    displayReworkPendingRows.map((row, idx) => {
                      const p = products.find(pr => pr.id === row.productId);
                      return (
                        <tr
                          key={row.scope === 'product' ? `p-${row.productId}|${row.nodeId}` : `${row.orderId}|${row.nodeId}`}
                          className={`border-b border-slate-100/80 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-indigo-50/40`}
                        >
                          {productionLinkMode !== 'product' && (
                            <td className="px-4 sm:px-5 py-3 align-top min-w-0">
                              {row.scope === 'product' && row.productOrderCount != null ? (
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 shrink-0">按产品</span>
                                    <span className="text-sm font-bold text-slate-800 tabular-nums">{row.productOrderCount} 条工单</span>
                                  </div>
                                  {row.productOrdersLine ? (
                                    <p
                                      className="text-[11px] text-slate-500 mt-1.5 leading-snug line-clamp-2 break-all"
                                      title={row.productOrdersTitle || row.productOrdersLine}
                                    >
                                      {row.productOrdersLine}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-sm font-bold text-slate-800 tabular-nums" title={row.orderNumber}>{row.orderNumber}</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 sm:px-5 py-3 align-top min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2" title={row.productName}>{row.productName}</p>
                            {p?.sku ? <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate" title={p.sku}>{p.sku}</p> : null}
                          </td>
                          <td className="px-4 sm:px-5 py-3 align-middle">
                            <span className="inline-flex items-center text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg max-w-full truncate" title={row.milestoneName}>
                              {row.milestoneName}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-bold text-slate-600">{row.defectiveTotal}</td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-semibold text-slate-500">{row.reworkTotal}</td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-semibold text-slate-500">{row.scrapTotal}</td>
                          <td className="px-3 py-3 text-right align-middle">
                            <span className="inline-block min-w-[2rem] tabular-nums text-sm font-black text-amber-800 bg-amber-100/90 px-2 py-1 rounded-lg">{row.pendingQty}</span>
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <button
                              type="button"
                              onClick={() => setReworkActionRow(row)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                              处理
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {displayReworkPendingRows.length > 0 && (
              <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <span className="text-xs font-bold text-slate-600">
                  当前列表 <span className="text-slate-900 tabular-nums">{displayReworkPendingRows.length}</span> 条
                </span>
                <span className="text-xs font-bold text-slate-600">
                  待返工合计 <span className="text-base font-black text-amber-700 tabular-nums">{reworkPendingTotalPending}</span> 件
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 返工详情弹窗：工单简要信息 + 不良与处理汇总 + 工序返工未报工 + 处理不良品记录 + 返工报工记录 */}
      {limitType === 'REWORK' && reworkDetailOrderId && (() => {
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
          order.milestones.forEach(ms => {
            const defective = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
            const rework = (records || []).filter(r => r.type === 'REWORK' && r.orderId === oid && (r.sourceNodeId ?? r.nodeId) === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
            const scrap = (records || []).filter(r => r.type === 'SCRAP' && r.orderId === oid && r.nodeId === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
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

        const defectRecordsList = (records || []).filter((r): r is ProductionOpRecord => (r.type === 'REWORK' || r.type === 'SCRAP') && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const reworkReportList = (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT' && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

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
              <div className="flex-1 overflow-auto p-4 space-y-4">
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
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3"><span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{r.type === 'REWORK' ? '返工' : '报损'}</span></td><td className="px-4 py-3 text-slate-700">{getSourceNodeName(r)}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.type === 'REWORK' ? getReworkTargetNodes(r) : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{r.timestamp || '—'}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
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
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3 text-slate-700">{globalNodes.find(n => n.id === r.nodeId)?.name ?? r.nodeId ?? '—'}</td><td className="px-4 py-3 text-right font-bold text-indigo-600">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.variantId ? (product?.variants?.find(v => v.id === r.variantId) as { skuSuffix?: string } | undefined)?.skuSuffix ?? r.variantId : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{r.timestamp || '—'}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
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

      {/* 返工管理：物料弹窗（该工单 BOM，输入数量确认领料，单据写入生产物料且领料退料流水备注「来自于返工」） */}
      {limitType === 'REWORK' && reworkMaterialOrderId && onAddRecord && (() => {
        const order = orders.find(o => o.id === reworkMaterialOrderId);
        if (!order) return null;
        const product = products.find(p => p.id === order.productId);
        const orderQty = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
        const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
        const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
        const addMat = (bom: BOM, qty: number, nodeName: string) => {
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
          (order.items ?? []).forEach(item => {
            const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
            const lineQty = item.quantity;
            const seenBomIds = new Set<string>();
            if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              Object.entries(v.nodeBoms).forEach(([nodeId, bomId]) => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
                const bom = boms.find(b => b.id === bomId);
                if (bom) addMat(bom, lineQty, nodeName);
              });
            } else {
              boms.filter(b => b.parentProductId === product!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                if (seenBomIds.has(bom.id)) return;
                seenBomIds.add(bom.id);
                const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
                addMat(bom, lineQty, nodeName);
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
              ? ((order.items ?? []).find(i => i.variantId === bom.variantId)?.quantity ?? 0)
              : orderQty;
            addMat(bom, qty, nodeName);
          });
        }
        matMap.forEach((v, productId) => {
          bomMaterials.push({ productId, ...v, nodeNames: Array.from(v.nodeNames) });
        });
        const getNextStockDocNo = () => {
          const prefix = 'LL';
          const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
          const pattern = `${prefix}${todayStr}-`;
          const existing = records.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
          const seqs = existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n));
          const maxSeq = seqs.length ? Math.max(...seqs) : 0;
          return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
        };
        const handleConfirm = async () => {
          const toIssue = bomMaterials.filter(m => (reworkMaterialQty[m.productId] ?? 0) > 0);
          if (toIssue.length === 0) return;
          const docNo = getNextStockDocNo();
          const warehouseId = reworkMaterialWarehouseId || (warehouses[0]?.id ?? '');
          const batch: ProductionOpRecord[] = toIssue.map(m => ({
            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'STOCK_OUT' as const,
            orderId: order.id,
            productId: m.productId,
            quantity: reworkMaterialQty[m.productId],
            operator: '张主管',
            timestamp: new Date().toLocaleString(),
            status: '已完成',
            warehouseId: warehouseId || undefined,
            docNo,
            reason: '来自于返工'
          } as ProductionOpRecord));
          if (onAddRecordBatch && batch.length > 1) {
            await onAddRecordBatch(batch);
          } else {
            for (const rec of batch) await onAddRecord(rec);
          }
          setReworkMaterialOrderId(null);
          setReworkMaterialQty({});
        };
        return (
          <div className="fixed inset-0 z-[76] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setReworkMaterialOrderId(null); setReworkMaterialQty({}); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-indigo-600" /> 返工领料
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {product?.name ?? order.productName}</p>
                </div>
                <button type="button" onClick={() => { setReworkMaterialOrderId(null); setReworkMaterialQty({}); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {warehouses.length > 0 && (
                  <div className="mb-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                    <select
                      value={reworkMaterialWarehouseId}
                      onChange={e => setReworkMaterialWarehouseId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                {bomMaterials.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-sm">该工单未配置 BOM 物料，无法进行领料</p>
                ) : (
                  (() => {
                    const reworkIssuedMap = new Map<string, number>();
                    records.filter(r => r.type === 'STOCK_OUT' && r.orderId === order.id && r.reason === '来自于返工').forEach(r => {
                      reworkIssuedMap.set(r.productId, (reworkIssuedMap.get(r.productId) ?? 0) + r.quantity);
                    });
                    return (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-100">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">领料累计</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料数量</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {bomMaterials.map(m => (
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
                              <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{reworkIssuedMap.get(m.productId) ?? 0}</td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={reworkMaterialQty[m.productId] ?? ''}
                                  onChange={e => setReworkMaterialQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                                  className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                  placeholder="0"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()
                )}
              </div>
              {bomMaterials.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setReworkMaterialOrderId(null); setReworkMaterialQty({}); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!bomMaterials.some(m => (reworkMaterialQty[m.productId] ?? 0) > 0)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <ArrowUpFromLine className="w-4 h-4" /> 确认领料
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 处理不良品流水弹窗：REWORK(生成返工)+SCRAP(报损)，UI 参考返工报工流水 */}
      {limitType === 'REWORK' && defectFlowModalOpen && (() => {
        const defectRecords = (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK' || r.type === 'SCRAP');
        const f = defectFlowFilter;
        const filtered = defectRecords.filter(r => {
          const order = orders.find(o => o.id === r.orderId);
          const product = products.find(p => p.id === r.productId);
          const sourceNodeId = r.type === 'REWORK' ? (r.sourceNodeId ?? r.nodeId) : r.nodeId;
          const nodeName = sourceNodeId ? (globalNodes.find(n => n.id === sourceNodeId)?.name ?? '') : '';
          if (f.dateFrom || f.dateTo) {
            const dateStr = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
            if (f.dateFrom && dateStr < f.dateFrom) return false;
            if (f.dateTo && dateStr > f.dateTo) return false;
          }
          if (f.orderNumber && !(order?.orderNumber ?? '').toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
          if (f.productId) {
            const name = (product?.name ?? '').toLowerCase();
            const kw = f.productId.toLowerCase();
            if (!name.includes(kw) && !(r.productId ?? '').toLowerCase().includes(kw)) return false;
          }
          if (f.nodeName && !nodeName.toLowerCase().includes(f.nodeName.toLowerCase())) return false;
          if (f.operator && !(r.operator ?? '').toLowerCase().includes(f.operator.toLowerCase())) return false;
          if (f.recordType === 'REWORK' && r.type !== 'REWORK') return false;
          if (f.recordType === 'SCRAP' && r.type !== 'SCRAP') return false;
          return true;
        });
        const sorted = [...filtered].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const totalQuantity = sorted.reduce((s, r) => s + (r.quantity ?? 0), 0);
        const uniqueNodeNames = [...new Set(defectRecords.map(r => {
          const sid = r.type === 'REWORK' ? (r.sourceNodeId ?? r.nodeId) : r.nodeId;
          return sid ? (globalNodes.find(n => n.id === sid)?.name ?? '') : '';
        }).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string)) as string[];
        const uniqueOperators = [...new Set(defectRecords.map(r => r.operator).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
        const getSourceNodeName = (rec: ProductionOpRecord) => {
          const sid = rec.type === 'REWORK' ? (rec.sourceNodeId ?? rec.nodeId) : rec.nodeId;
          return sid ? (globalNodes.find(n => n.id === sid)?.name ?? sid) : '—';
        };
        const getDocNo = (rec: ProductionOpRecord) => (rec.docNo) ? rec.docNo : '—';
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setDefectFlowModalOpen(false); setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 处理不良品流水</h3>
                <button type="button" onClick={() => { setDefectFlowModalOpen(false); setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <p className="text-xs text-slate-500">生成返工、报损等处理不良品的记录。按时间倒序。</p>
              </div>
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                </div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${productionLinkMode === 'product' ? 'md:grid-cols-7' : 'md:grid-cols-8'}`}>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                    <input type="date" value={f.dateFrom} onChange={e => setDefectFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                    <input type="date" value={f.dateTo} onChange={e => setDefectFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  {productionLinkMode !== 'product' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
                    <input type="text" value={f.orderNumber} onChange={e => setDefectFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                    <input type="text" value={f.productId} onChange={e => setDefectFlowFilter(prev => ({ ...prev, productId: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">来源工序</label>
                    <select value={f.nodeName} onChange={e => setDefectFlowFilter(prev => ({ ...prev, nodeName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">全部</option>
                      {uniqueNodeNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                    <select value={f.recordType} onChange={e => setDefectFlowFilter(prev => ({ ...prev, recordType: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">全部</option>
                      <option value="REWORK">返工</option>
                      <option value="SCRAP">报损</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label>
                    <input type="text" value={f.operator} onChange={e => setDefectFlowFilter(prev => ({ ...prev, operator: e.target.value }))} placeholder="操作人模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4">
                  <button type="button" onClick={() => setDefectFlowFilter({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', recordType: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                  <span className="text-xs text-slate-400">共 {sorted.length} 条记录</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {sorted.length === 0 ? (
                  <p className="text-slate-500 text-center py-12">暂无处理不良品流水</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                          {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">来源工序</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(r => {
                          const order = orders.find(o => o.id === r.orderId);
                          const product = products.find(p => p.id === r.productId);
                          const typeLabel = r.type === 'REWORK' ? '返工' : '报损';
                          return (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.timestamp || '—'}</td>
                              {productionLinkMode !== 'product' && <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{order?.orderNumber ?? '—'}</td>}
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getDocNo(r)}</td>
                              <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{product?.name ?? r.productId ?? '—'}</td>
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getSourceNodeName(r)}</td>
                              <td className="px-4 py-3 whitespace-nowrap"><span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{typeLabel}</span></td>
                              <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">{r.quantity ?? 0} 件</td>
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.operator || '—'}</td>
                              <td className="px-4 py-3">
                                {hasOpsPerm('production:rework_records:view') && (
                                  <button type="button" onClick={() => setDefectFlowDetailRecord(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0">
                                    <FileText className="w-3.5 h-3.5" /> 详情
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                          <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 5 : 6}></td>
                          <td className="px-4 py-3 text-indigo-600 text-right">{totalQuantity} 件</td>
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

      {/* 处理不良品流水 - 详情弹窗（同单号批次、规格表、合计、编辑/删除） */}
      {limitType === 'REWORK' && defectFlowDetailRecord && (() => {
        const r = defectFlowDetailRecord;
        const detailBatch = r.type === 'REWORK' && r.docNo
          ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'REWORK' && x.orderId === r.orderId && x.docNo === r.docNo)
          : r.type === 'SCRAP' && r.docNo
            ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'SCRAP' && x.orderId === r.orderId && x.docNo === r.docNo)
            : [r];
        const first = detailBatch[0];
        if (!first) return null;
        const order = orders.find(o => o.id === first.orderId);
        const product = products.find(p => p.id === first.productId);
        const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
        const sourceNodeId = first.type === 'REWORK' ? (first.sourceNodeId ?? first.nodeId) : first.nodeId;
        const sourceNodeName = sourceNodeId ? globalNodes.find(n => n.id === sourceNodeId)?.name ?? sourceNodeId : '—';
        const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
        const hasColorSize = Boolean(product?.variants?.length);
        const getVariantLabel = (rec: ProductionOpRecord) => {
          if (!rec.variantId) return '未分规格';
          const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId);
          return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId;
        };
        const typeLabel = first.type === 'REWORK' ? '返工' : '报损';
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  {productionLinkMode === 'product'
                    ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
                    : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
                  }
                  处理不良品详情
                </h3>
                <div className="flex items-center gap-2">
                  {defectFlowDetailEditing ? (
                    <>
                      <button type="button" onClick={() => setDefectFlowDetailEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!onUpdateRecord || !defectFlowDetailEditing) return;
                          const tsStr = defectFlowDetailEditing.form.timestamp ? (() => { const d = new Date(defectFlowDetailEditing.form.timestamp); return isNaN(d.getTime()) ? new Date().toLocaleString() : d.toLocaleString(); })() : new Date().toLocaleString();
                          defectFlowDetailEditing.form.rowEdits.forEach(row => {
                            const rec = detailBatch.find(x => x.id === row.recordId);
                            if (!rec) return;
                            onUpdateRecord({ ...rec, quantity: Math.max(0, row.quantity), timestamp: tsStr, operator: defectFlowDetailEditing.form.operator, reason: defectFlowDetailEditing.form.reason || undefined });
                          });
                          setDefectFlowDetailEditing(null);
                          setDefectFlowDetailRecord(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm('production:rework_records:edit') && (
                        <button
                          type="button"
                          onClick={() => {
                            const rec = detailBatch[0];
                            let dt = new Date(rec.timestamp || undefined);
                            if (isNaN(dt.getTime())) dt = new Date();
                            const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                            setDefectFlowDetailEditing({
                              firstRecord: rec,
                              form: { timestamp: tsStr, operator: rec.operator ?? '', reason: rec.reason ?? '', rowEdits: detailBatch.map(x => ({ recordId: x.id, quantity: x.quantity ?? 0 })) }
                            });
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && hasOpsPerm('production:rework_records:delete') && (
                        <button
                          type="button"
                          onClick={() => {
                            void confirm({ message: '确定删除该记录？', danger: true }).then((ok) => {
                              if (!ok) return;
                              detailBatch.forEach(x => onDeleteRecord(x.id));
                              setDefectFlowDetailRecord(null);
                              setDefectFlowDetailEditing(null);
                            });
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100"
                        >
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{product?.name ?? first.productId ?? '—'}</h2>
                {defectFlowDetailEditing ? (
                  <>
                    <div className="grid grid-cols-[1fr_1fr] gap-3">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">时间</p>
                        <input type="datetime-local" value={defectFlowDetailEditing.form.timestamp} onChange={e => setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" />
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p>
                        <input type="text" value={defectFlowDetailEditing.form.operator} onChange={e => setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" placeholder="操作人" />
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">原因/备注</p>
                        <input type="text" value={defectFlowDetailEditing.form.reason} onChange={e => setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" placeholder="选填" />
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                        <tbody>
                          {defectFlowDetailEditing.form.rowEdits.map((rowEdit) => {
                            const rec = detailBatch.find(x => x.id === rowEdit.recordId);
                            if (!rec) return null;
                            return (
                              <tr key={rec.id} className="border-b border-slate-100">
                                <td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td>
                                <td className="px-4 py-3 text-right">
                                  <input type="number" min={0} value={rowEdit.quantity} onChange={e => { const v = Math.max(0, Number(e.target.value) || 0); setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(re => re.recordId === rec.id ? { ...re, quantity: v } : re) } } : prev); }} className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200" />
                                  <span className="text-slate-600 text-sm ml-1">{unitName}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot><tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold"><td className="px-4 py-3">合计</td><td className="px-4 py-3 text-indigo-600 text-right">{defectFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}</td></tr></tfoot>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">类型</p>
                        <p className="text-sm font-bold text-slate-800">{typeLabel}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">来源工序</p>
                        <p className="text-sm font-bold text-slate-800">{sourceNodeName}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">数量</p>
                        <p className="text-sm font-bold text-indigo-600">{totalQty} {unitName}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">时间</p>
                        <p className="text-sm font-bold text-slate-800">{first.timestamp || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p>
                        <p className="text-sm font-bold text-slate-800">{first.operator ?? '—'}</p>
                      </div>
                      {first.reason && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">原因/备注</p>
                          <p className="text-sm font-bold text-slate-800">{first.reason}</p>
                        </div>
                      )}
                    </div>
                    {(detailBatch.length > 1 || hasColorSize) && (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                          <tbody>
                            {detailBatch.map(rec => (
                              <tr key={rec.id} className="border-b border-slate-100">
                                <td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td>
                                <td className="px-4 py-3 font-bold text-indigo-600 text-right">{rec.quantity ?? 0} {unitName}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold"><td className="px-4 py-3">合计</td><td className="px-4 py-3 text-indigo-600 text-right">{totalQty} {unitName}</td></tr></tfoot>
                        </table>
                      </div>
                    )}
                    {first.type === 'REWORK' && (first.reworkNodeIds?.length ?? 0) > 0 && (
                      <div className="text-sm">
                        <span className="text-slate-400 font-bold">返工目标工序</span>
                        <p className="text-slate-800 mt-1">{first.reworkNodeIds!.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 返工报工流水弹窗：参考报工流水，含搜索、列表（时间/工单号/报工单号/产品/工序/操作人/详情） */}
      {limitType === 'REWORK' && reworkFlowModalOpen && (() => {
        /** 返工报工流水仅显示「返工报工」产生的流水（每报一次一条），不显示「生成返工」的单据，避免同一次报工出现两条 */
        const reworkRecords = (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT');
        const validDocNoRe = /^FG\d{8}-\d{4}$/;
        const getDateStr = (r: ProductionOpRecord) => {
          const d = r.timestamp ? new Date(r.timestamp) : new Date();
          return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0].replace(/-/g, '') : d.toISOString().split('T')[0].replace(/-/g, '');
        };
        const needFallback = reworkRecords.filter(r => !r.docNo || !validDocNoRe.test(r.docNo));
        const needFallbackSorted = [...needFallback].sort((a, b) => {
          const da = getDateStr(a), db = getDateStr(b);
          if (da !== db) return da.localeCompare(db);
          const ta = new Date(a.timestamp || 0).getTime(), tb = new Date(b.timestamp || 0).getTime();
          if (ta !== tb) return ta - tb;
          return (a.id || '').localeCompare(b.id || '');
        });
        const reworkDisplayDocNoMap = new Map<string, string>();
        const seqByDate: Record<string, number> = {};
        needFallbackSorted.forEach(r => {
          const ds = getDateStr(r);
          seqByDate[ds] = (seqByDate[ds] ?? 0) + 1;
          reworkDisplayDocNoMap.set(r.id, `FG${ds}-${String(seqByDate[ds]).padStart(4, '0')}`);
        });
        const getDisplayDocNo = (r: ProductionOpRecord) =>
          (r.docNo && validDocNoRe.test(r.docNo)) ? r.docNo : (reworkDisplayDocNoMap.get(r.id) ?? getReworkDisplayDocNo(r, 1));
        const f = reworkFlowFilter;
        const filtered = reworkRecords.filter(r => {
          const order = orders.find(o => o.id === r.orderId);
          const product = products.find(p => p.id === r.productId);
          const nodeName = r.nodeId ? (globalNodes.find(n => n.id === r.nodeId)?.name ?? '') : '';
          if (f.dateFrom || f.dateTo) {
            const dateStr = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
            if (f.dateFrom && dateStr < f.dateFrom) return false;
            if (f.dateTo && dateStr > f.dateTo) return false;
          }
          if (f.orderNumber && !(order?.orderNumber ?? '').toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
          if (f.productId) {
            const name = (product?.name ?? '').toLowerCase();
            const kw = f.productId.toLowerCase();
            if (!name.includes(kw) && !(r.productId ?? '').toLowerCase().includes(kw)) return false;
          }
          if (f.nodeName && !nodeName.toLowerCase().includes(f.nodeName.toLowerCase())) return false;
          if (f.operator && !(r.operator ?? '').toLowerCase().includes(f.operator.toLowerCase())) return false;
          if (f.reportNo) {
            const key = getDisplayDocNo(r).toLowerCase();
            if (!key.includes(f.reportNo.toLowerCase())) return false;
          }
          return true;
        });
        const sorted = [...filtered].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const totalQuantity = sorted.reduce((s, r) => s + (r.quantity ?? 0), 0);
        const totalAmount = sorted.reduce((s, r) => s + (r.amount ?? 0), 0);
        const hasAnyPrice = sorted.some(r => r.unitPrice != null && r.unitPrice > 0);
        const uniqueNodeNames = [...new Set(reworkRecords.map(r => globalNodes.find(n => n.id === r.nodeId)?.name).filter(Boolean))] as string[];
        const uniqueOperators = [...new Set(reworkRecords.map(r => r.operator).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
        const displayReportNo = getDisplayDocNo;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setReworkFlowModalOpen(false); setReworkFlowDetailRecord(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 返工报工流水</h3>
                <button type="button" onClick={() => { setReworkFlowModalOpen(false); setReworkFlowDetailRecord(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <p className="text-xs text-slate-500">仅显示每次在工序上做返工报工产生的流水，报一次产生一条（新单据号）。按报工时间排序。</p>
              </div>
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                </div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${productionLinkMode === 'product' ? 'md:grid-cols-6' : 'md:grid-cols-7'}`}>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                    <input type="date" value={f.dateFrom} onChange={e => setReworkFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                    <input type="date" value={f.dateTo} onChange={e => setReworkFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  {productionLinkMode !== 'product' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
                    <input type="text" value={f.orderNumber} onChange={e => setReworkFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                    <input type="text" value={f.productId} onChange={e => setReworkFlowFilter(prev => ({ ...prev, productId: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
                    <select value={f.nodeName} onChange={e => setReworkFlowFilter(prev => ({ ...prev, nodeName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">全部</option>
                      {uniqueNodeNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">报工单号</label>
                    <input type="text" value={f.reportNo} onChange={e => setReworkFlowFilter(prev => ({ ...prev, reportNo: e.target.value }))} placeholder="FG+日期+序号 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label>
                    <input type="text" value={f.operator} onChange={e => setReworkFlowFilter(prev => ({ ...prev, operator: e.target.value }))} placeholder="操作人模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4">
                  <button type="button" onClick={() => setReworkFlowFilter({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', reportNo: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                  <span className="text-xs text-slate-400">共 {sorted.length} 条返工报工记录</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {sorted.length === 0 ? (
                  <p className="text-slate-500 text-center py-12">暂无返工报工流水</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                          {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">报工单号</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                          {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">单价</th>}
                          {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">金额</th>}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(r => {
                          const order = orders.find(o => o.id === r.orderId);
                          const product = products.find(p => p.id === r.productId);
                          const nodeName = r.nodeId ? (globalNodes.find(n => n.id === r.nodeId)?.name ?? '') : '—';
                          return (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.timestamp || '—'}</td>
                              {productionLinkMode !== 'product' && <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{order?.orderNumber ?? '—'}</td>}
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{displayReportNo(r)}</td>
                              <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{product?.name ?? r.productId ?? '—'}</td>
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{nodeName}</td>
                              <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">{r.quantity ?? 0} 件</td>
                              {hasAnyPrice && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice.toFixed(2) : '—'}</td>}
                              {hasAnyPrice && <td className="px-4 py-3 text-right font-bold text-amber-600 whitespace-nowrap">{r.amount != null && r.amount > 0 ? r.amount.toFixed(2) : '—'}</td>}
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.operator || '—'}</td>
                              <td className="px-4 py-3">
                                {hasOpsPerm('production:rework_report_records:view') && (
                                  <button type="button" onClick={() => setReworkFlowDetailRecord(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0">
                                    <FileText className="w-3.5 h-3.5" /> 详情
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                          <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 4 : 5}></td>
                          <td className="px-4 py-3 text-indigo-600 text-right">{totalQuantity} 件</td>
                          {hasAnyPrice && <td className="px-4 py-3"></td>}
                          {hasAnyPrice && <td className="px-4 py-3 text-amber-600 text-right">{totalAmount.toFixed(2)}</td>}
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

      {/* 返工报工流水 - 详情弹窗（参考报工流水：同单号批次、规格表、合计、编辑/删除） */}
      {reworkFlowDetailRecord && (() => {
        const r = reworkFlowDetailRecord;
        const detailBatch = r.type === 'REWORK_REPORT'
          ? (r.docNo
              ? (records || []).filter(
                  (x): x is ProductionOpRecord =>
                    x.type === 'REWORK_REPORT' && x.docNo === r.docNo && x.productId === r.productId
                )
              : [r])
          : (records || []).filter(
              (x): x is ProductionOpRecord => x.type === 'REWORK' && x.orderId === r.orderId && (x.sourceNodeId ?? x.nodeId) === (r.sourceNodeId ?? r.nodeId) && (r.docNo ? x.docNo === r.docNo : x.id === r.id)
            );
        const first = detailBatch[0];
        if (!first) return null;
        const order = orders.find(o => o.id === first.orderId);
        const product = products.find(p => p.id === first.productId);
        const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
        const nodeName = first.nodeId ? globalNodes.find(n => n.id === first.nodeId)?.name : null;
        /** 来源工序应显示返工来源（报不良的工序），用 REWORK 记录的 sourceNodeId；不显示路径上的上一道工序 */
        const reworkOrigin = (records || []).find(x => x.type === 'REWORK' && (x.orderId === first.orderId || (orders.find(o => o.id === first.orderId)?.parentOrderId === x.orderId)) && ((x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : []).includes(first.nodeId ?? '')));
        const resolvedSourceNodeId = (reworkOrigin?.sourceNodeId != null ? reworkOrigin.sourceNodeId : first.sourceNodeId) ?? undefined;
        const sourceNodeName = resolvedSourceNodeId ? globalNodes.find(n => n.id === resolvedSourceNodeId)?.name : null;
        const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
        const hasColorSize = Boolean(product?.variants?.length);
        const getVariantLabel = (rec: ProductionOpRecord) => {
          if (!rec.variantId) return '未分规格';
          const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId);
          return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId;
        };
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setReworkFlowDetailRecord(null); setReworkFlowDetailEditing(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  {productionLinkMode === 'product'
                    ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
                    : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
                  }
                  返工详情
                </h3>
                <div className="flex items-center gap-2">
                  {reworkFlowDetailEditing ? (
                    <>
                      <button type="button" onClick={() => setReworkFlowDetailEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!onUpdateRecord || !reworkFlowDetailEditing) return;
                          const f = reworkFlowDetailEditing.form;
                          const tsStr = f.timestamp ? (() => { const d = new Date(f.timestamp); return isNaN(d.getTime()) ? new Date().toLocaleString() : d.toLocaleString(); })() : new Date().toLocaleString();
                          const opName = (workers?.find(w => w.id === f.workerId)?.name) ?? f.operator;
                          const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
                          f.rowEdits.forEach(row => {
                            const rec = detailBatch.find(x => x.id === row.recordId);
                            if (!rec) return;
                            const newQty = Math.max(0, row.quantity);
                            const oldQty = rec.quantity ?? 0;
                            const delta = newQty - oldQty;
                            if (delta !== 0 && rec.sourceReworkId && rec.nodeId) {
                              const key = `${rec.sourceReworkId}|${rec.nodeId}`;
                              const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
                              cur.delta += delta;
                              reworkDeltas.set(key, cur);
                            }
                            onUpdateRecord({ ...rec, quantity: newQty, timestamp: tsStr, operator: opName, reason: f.reason || undefined, workerId: f.workerId || undefined, equipmentId: f.equipmentId || undefined, unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined, amount: f.unitPrice > 0 ? newQty * f.unitPrice : undefined });
                          });
                          reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
                            const reworkRec = records.find(r => r.id === reworkId && r.type === 'REWORK');
                            if (!reworkRec) return;
                            const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
                            const newDone = Math.max(0, oldDone + delta);
                            const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
                            const nodes = (reworkRec.reworkNodeIds?.length ? reworkRec.reworkNodeIds : (reworkRec.nodeId ? [reworkRec.nodeId] : []));
                            const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
                            const wasComplete = reworkRec.status === '已完成';
                            onUpdateRecord({ ...reworkRec, reworkCompletedQuantityByNode: updCompleted, status: allDone ? '已完成' : (wasComplete ? '处理中' : reworkRec.status) });
                          });
                          setReworkFlowDetailEditing(null);
                          setReworkFlowDetailRecord(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm('production:rework_report_records:edit') && (
                        <button
                          type="button"
                          onClick={() => {
                            const rec = detailBatch[0];
                            let dt = new Date(rec.timestamp || undefined);
                            if (isNaN(dt.getTime())) dt = new Date();
                            const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                            setReworkFlowDetailEditing({
                              firstRecord: rec,
                              form: {
                                timestamp: tsStr,
                                operator: rec.operator ?? '',
                                workerId: rec.workerId ?? '',
                                equipmentId: rec.equipmentId ?? '',
                                reason: rec.reason ?? '',
                                unitPrice: rec.unitPrice ?? 0,
                                rowEdits: detailBatch.map(x => ({ recordId: x.id, quantity: x.quantity ?? 0 }))
                              }
                            });
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && hasOpsPerm('production:rework_report_records:delete') && (
                        <button
                          type="button"
                          onClick={() => {
                            void confirm({ message: '确定要删除该返工单的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                              if (!ok) return;
                            const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
                            detailBatch.forEach(rec => {
                              if (rec.sourceReworkId && rec.nodeId) {
                                const key = `${rec.sourceReworkId}|${rec.nodeId}`;
                                const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
                                cur.delta -= (rec.quantity ?? 0);
                                reworkDeltas.set(key, cur);
                              }
                            });
                            detailBatch.forEach(x => onDeleteRecord(x.id));
                            reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
                              const reworkRec = records.find(r => r.id === reworkId && r.type === 'REWORK');
                              if (!reworkRec || !onUpdateRecord) return;
                              const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
                              const newDone = Math.max(0, oldDone + delta);
                              const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
                              const nodes = (reworkRec.reworkNodeIds?.length ? reworkRec.reworkNodeIds : (reworkRec.nodeId ? [reworkRec.nodeId] : []));
                              const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
                              const wasComplete = reworkRec.status === '已完成';
                              onUpdateRecord({ ...reworkRec, reworkCompletedQuantityByNode: updCompleted, status: allDone ? '已完成' : (wasComplete ? '处理中' : reworkRec.status) });
                            });
                            setReworkFlowDetailRecord(null);
                            setReworkFlowDetailEditing(null);
                          });
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                        >
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setReworkFlowDetailRecord(null); setReworkFlowDetailEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{product?.name ?? first.productId ?? '—'}</h2>
                {reworkFlowDetailEditing ? (
                  <>
                    <div className="grid grid-cols-[1fr_1fr] gap-3">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">返工时间</p>
                        <input
                          type="datetime-local"
                          value={reworkFlowDetailEditing.form.timestamp}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p>
                        <input
                          type="text"
                          value={reworkFlowDetailEditing.form.operator}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="操作人"
                        />
                      </div>
                      {workers && workers.length > 0 && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">报工人员</p>
                          <WorkerSelector
                            options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                            processNodes={globalNodes}
                            currentNodeId={first.nodeId ?? ''}
                            value={reworkFlowDetailEditing.form.workerId}
                            onChange={(id) => { const w = workers.find(wx => wx.id === id); setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, workerId: id, operator: w?.name ?? prev.form.operator } } : prev); }}
                            placeholder="选择报工人员..."
                            variant="compact"
                          />
                        </div>
                      )}
                      {equipment && equipment.length > 0 && globalNodes.find(n => n.id === first.nodeId)?.enableEquipmentOnReport && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">设备</p>
                          <EquipmentSelector
                            options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                            processNodes={globalNodes}
                            currentNodeId={first.nodeId ?? ''}
                            value={reworkFlowDetailEditing.form.equipmentId}
                            onChange={(id) => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, equipmentId: id } } : prev)}
                            placeholder="选择设备..."
                            variant="compact"
                          />
                        </div>
                      )}
                      <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">原因/备注</p>
                        <input
                          type="text"
                          value={reworkFlowDetailEditing.form.reason}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="选填"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={reworkFlowDetailEditing.form.unitPrice || ''}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev)}
                          placeholder="0"
                          className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                        <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                          {(reworkFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (reworkFlowDetailEditing.form.unitPrice || 0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                            {reworkFlowDetailEditing.form.unitPrice > 0 && (
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {detailBatch.map(rec => {
                            const rowEdit = reworkFlowDetailEditing.form.rowEdits.find(re => re.recordId === rec.id);
                            if (!rowEdit) return null;
                            return (
                              <tr key={rec.id} className="border-b border-slate-100">
                                <td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      value={rowEdit.quantity}
                                      onChange={e => {
                                        const v = Math.max(0, Number(e.target.value) || 0);
                                        setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.recordId === rec.id ? { ...r, quantity: v } : r) } } : prev);
                                      }}
                                      className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    <span className="text-slate-600 text-sm">{unitName}</span>
                                  </div>
                                </td>
                                {reworkFlowDetailEditing.form.unitPrice > 0 && (
                                  <td className="px-4 py-3 font-bold text-amber-600 text-right">{(rowEdit.quantity * reworkFlowDetailEditing.form.unitPrice).toFixed(2)}</td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                            <td className="px-4 py-3">合计</td>
                            <td className="px-4 py-3 text-indigo-600 text-right">{reworkFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}</td>
                            {reworkFlowDetailEditing.form.unitPrice > 0 && (
                              <td className="px-4 py-3 text-amber-600 text-right">{(reworkFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * reworkFlowDetailEditing.form.unitPrice).toFixed(2)}</td>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工序</p>
                        <p className="text-sm font-bold text-slate-800">{nodeName ?? first.nodeId ?? '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">来源工序</p>
                        <p className="text-sm font-bold text-slate-800">{sourceNodeName ?? (first.sourceNodeId ? globalNodes.find(n => n.id === first.sourceNodeId)?.name : null) ?? '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">返工数量</p>
                        <p className="text-sm font-bold text-indigo-600">{totalQty} {unitName}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">返工时间</p>
                        <p className="text-sm font-bold text-slate-800">{first.timestamp || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p>
                        <p className="text-sm font-bold text-slate-800">{first.operator ?? '—'}</p>
                      </div>
                      {first.reason && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">原因/备注</p>
                          <p className="text-sm font-bold text-slate-800">{first.reason}</p>
                        </div>
                      )}
                      {first.unitPrice != null && first.unitPrice > 0 && (
                        <>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">单价（元/件）</p>
                            <p className="text-sm font-bold text-slate-800">{first.unitPrice.toFixed(2)}</p>
                          </div>
                          <div className="bg-amber-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-amber-500 font-bold uppercase mb-0.5">金额（元）</p>
                            <p className="text-sm font-bold text-amber-600">{(totalQty * first.unitPrice).toFixed(2)}</p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                            {first.unitPrice != null && first.unitPrice > 0 && (
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {detailBatch.map(rec => (
                            <tr key={rec.id} className="border-b border-slate-100">
                              <td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td>
                              <td className="px-4 py-3 font-bold text-indigo-600 text-right">{rec.quantity ?? 0} {unitName}</td>
                              {first.unitPrice != null && first.unitPrice > 0 && (
                                <td className="px-4 py-3 font-bold text-amber-600 text-right">{((rec.quantity ?? 0) * first.unitPrice).toFixed(2)}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        {hasColorSize || detailBatch.length > 1 ? (
                          <tfoot>
                            <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                              <td className="px-4 py-3">合计</td>
                              <td className="px-4 py-3 text-indigo-600 text-right">{totalQty} {unitName}</td>
                              {first.unitPrice != null && first.unitPrice > 0 && (
                                <td className="px-4 py-3 text-amber-600 text-right">{(totalQty * first.unitPrice).toFixed(2)}</td>
                              )}
                            </tr>
                          </tfoot>
                        ) : null}
                      </table>
                    </div>
                    {(first.reworkNodeIds?.length ?? 0) > 0 && (
                      <div className="text-sm">
                        <span className="text-slate-400 font-bold">返工目标工序</span>
                        <p className="text-slate-800 mt-1">{first.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p>
                      </div>
                    )}
                    {(first.completedNodeIds?.length ?? 0) > 0 && (
                      <div className="text-sm">
                        <span className="text-slate-400 font-bold">已完成工序</span>
                        <p className="text-slate-800 mt-1">{first.completedNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {limitType === 'REWORK' && reworkActionRow && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({}); }} aria-hidden />
          <div className={`relative bg-white w-full rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden ${reworkActionMode === null ? 'max-w-md' : 'max-w-4xl max-h-[90vh]'}`} onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900">不良品处理</h3>
              <button type="button" onClick={() => { setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({}); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
              <p className="text-sm text-slate-600">
                {reworkActionRow.scope === 'product' ? (
                  <>
                    <span className="font-bold text-indigo-700">按产品汇总</span>
                    <span className="mx-1">·</span>
                    <span className="font-bold text-slate-800">{reworkActionRow.orderNumber}</span>
                  </>
                ) : (
                  <span className="font-bold text-slate-800">{reworkActionRow.orderNumber}</span>
                )}
                <span className="mx-1">·</span>
                {reworkActionRow.productName} · {reworkActionRow.milestoneName} · 待处理 <span className="font-bold text-amber-600">{reworkActionRow.pendingQty}</span> 件
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
                  {reworkActionHasColorSize ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">报损数量明细（按规格）</label>
                        <span className="text-sm font-bold text-rose-600">合计 {reworkActionVariantTotal} 件</span>
                      </div>
                      <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
                        {sortedVariantColorEntries(reworkActionGroupedVariants, reworkActionProduct?.colorIds, reworkActionProduct?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
                          return (
                            <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-2 shrink-0">
                                {color && <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string }).value }} />}
                                <span className="text-sm font-bold text-slate-800">{(color as { name?: string })?.name ?? colorId}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-1">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                                  const maxVariant = reworkActionPendingByVariant[v.id] ?? 0;
                                  const qty = reworkActionVariantQuantities[v.id] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxVariant}
                                        value={qty === 0 ? '' : qty}
                                        onChange={e => setReworkActionVariantQuantities(prev => ({ ...prev, [v.id]: Math.min(maxVariant, Math.max(0, Number(e.target.value) || 0)) }))}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-rose-600 text-right outline-none focus:ring-2 focus:ring-rose-200 placeholder:text-[10px] placeholder:text-slate-400"
                                        placeholder={`最多${maxVariant}`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
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
                  )}
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
                    <button type="button" onClick={() => { setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionVariantQuantities({}); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      disabled={reworkActionHasColorSize ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty)}
                      onClick={() => {
                        const reason = reworkActionReason || undefined;
                        const operator = '张主管';
                        const timestamp = new Date().toLocaleString();
                        const nodeIdSc = reworkActionRow.nodeId;
                        const scrapDocNo = getNextReworkDocNo();
                        const parentsSc = orders.filter(o => !o.parentOrderId && o.productId === reworkActionRow.productId);
                        const splitProductSc = reworkActionRow.scope === 'product' && parentsSc.length > 0;
                        const pushScrap = (oid: string, vid: string | undefined, q: number, rid: string) => {
                          if (!onAddRecord || q <= 0) return;
                          onAddRecord({
                            id: rid,
                            type: 'SCRAP',
                            orderId: oid,
                            productId: reworkActionRow.productId,
                            variantId: vid,
                            quantity: q,
                            reason,
                            operator,
                            timestamp,
                            nodeId: nodeIdSc,
                            docNo: scrapDocNo
                          });
                        };
                        if (reworkActionHasColorSize) {
                          if (!onAddRecord || reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) return;
                          if (splitProductSc) {
                            const qtyMap: Record<string, number> = {};
                            Object.entries(reworkActionVariantQuantities).forEach(([vId, q]) => {
                              const n = Number(q) || 0;
                              if (n <= 0 || n > (reworkActionPendingByVariant[vId] ?? 0)) return;
                              qtyMap[vId] = n;
                            });
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsSc,
                              productMilestoneProgresses,
                              qtyMap
                            );
                            if (splits.length === 0) return;
                            splits.forEach((sp, i) => pushScrap(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-sc-${i}`));
                          } else {
                            Object.entries(reworkActionVariantQuantities).forEach(([variantId, qty]) => {
                              const q = Number(qty) || 0;
                              if (q <= 0) return;
                              const maxV = reworkActionPendingByVariant[variantId] ?? 0;
                              if (q > maxV) return;
                              pushScrap(reworkActionRow.orderId, variantId || undefined, q, `rec-${Date.now()}-${variantId}`);
                            });
                          }
                        } else {
                          if (!onAddRecord || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
                          if (splitProductSc) {
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsSc,
                              productMilestoneProgresses,
                              { '': reworkActionQty }
                            );
                            if (splits.length === 0) return;
                            splits.forEach((sp, i) => pushScrap(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-sc-${i}`));
                          } else {
                            pushScrap(reworkActionRow.orderId, undefined, reworkActionQty, `rec-${Date.now()}-sc-${Math.random().toString(36).slice(2, 8)}`);
                          }
                        }
                        setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionVariantQuantities({});
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                    >
                      确定报损
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                      {reworkActionRow.scope === 'product' ? '返工目标工序（按产品工艺顺序，可多选）' : '返工目标工序（可多选）'}
                    </label>
                    {reworkActionProduct?.milestoneNodeIds && reworkActionProduct.milestoneNodeIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        {reworkActionProduct.milestoneNodeIds.map((nid, stepIdx) => {
                          const n = globalNodes.find(x => x.id === nid);
                          if (!n) return null;
                          const checked = reworkActionNodeIds.includes(nid);
                          return (
                            <button
                              key={nid}
                              type="button"
                              onClick={() =>
                                setReworkActionNodeIds(prev =>
                                  checked ? prev.filter(id => id !== nid) : [...prev, nid].sort((a, b) => {
                                    const ia = reworkActionProduct.milestoneNodeIds!.indexOf(a);
                                    const ib = reworkActionProduct.milestoneNodeIds!.indexOf(b);
                                    if (ia < 0 && ib < 0) return a.localeCompare(b);
                                    if (ia < 0) return 1;
                                    if (ib < 0) return -1;
                                    return ia - ib;
                                  })
                                )
                              }
                              className={`flex flex-col items-center min-w-[76px] py-2 px-2 rounded-xl border-2 transition-all ${
                                checked ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-200'
                              }`}
                            >
                              <span className="text-[9px] font-black text-slate-400 mb-0.5">第{stepIdx + 1}道</span>
                              <span className="text-xs font-bold text-slate-800 text-center leading-tight">{n.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <p className="text-[10px] text-slate-500 font-bold">其他工序</p>
                    <div className="max-h-32 overflow-auto border border-slate-200 rounded-xl p-2 space-y-1">
                      {globalNodes
                        .filter(n => !reworkActionProduct?.milestoneNodeIds?.includes(n.id))
                        .map(n => {
                          const checked = reworkActionNodeIds.includes(n.id);
                          return (
                            <label key={n.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setReworkActionNodeIds(prev => checked ? prev.filter(id => id !== n.id) : [...prev, n.id])}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm font-bold text-slate-700">{n.name}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                  {reworkActionHasColorSize ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">返工数量明细（按规格）</label>
                        <span className="text-sm font-bold text-indigo-600">合计 {reworkActionVariantTotal} 件</span>
                      </div>
                      <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
                        {sortedVariantColorEntries(reworkActionGroupedVariants, reworkActionProduct?.colorIds, reworkActionProduct?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
                          return (
                            <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-2 shrink-0">
                                {color && <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string }).value }} />}
                                <span className="text-sm font-bold text-slate-800">{(color as { name?: string })?.name ?? colorId}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-1">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                                  const maxVariant = reworkActionPendingByVariant[v.id] ?? 0;
                                  const qty = reworkActionVariantQuantities[v.id] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxVariant}
                                        value={qty === 0 ? '' : qty}
                                        onChange={e => setReworkActionVariantQuantities(prev => ({ ...prev, [v.id]: Math.min(maxVariant, Math.max(0, Number(e.target.value) || 0)) }))}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                                        placeholder={`最多${maxVariant}`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
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
                  )}
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
                    <button type="button" onClick={() => { setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({}); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      disabled={reworkActionNodeIds.length === 0 || (reworkActionHasColorSize ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty))}
                      onClick={() => {
                        const reason = reworkActionReason || undefined;
                        const operator = '张主管';
                        const timestamp = new Date().toLocaleString();
                        const sourceNodeId = reworkActionRow.nodeId;
                        const reworkNodeIds = reworkActionNodeIds.length > 0 ? reworkActionNodeIds : undefined;
                        const nodeId = reworkActionNodeIds[0];
                        const reworkDocNo = getNextReworkDocNo();
                        const seqPath = reworkActionProduct?.milestoneNodeIds ?? [];
                        const sortedPath =
                          reworkActionNodeIds.length > 0
                            ? [...reworkActionNodeIds].sort((a, b) => {
                                const ia = seqPath.indexOf(a);
                                const ib = seqPath.indexOf(b);
                                if (ia < 0 && ib < 0) return a.localeCompare(b);
                                if (ia < 0) return 1;
                                if (ib < 0) return -1;
                                return ia - ib;
                              })
                            : [];
                        const reworkNodeIdsSorted = sortedPath.length > 0 ? sortedPath : undefined;
                        const nodeIdFirst = sortedPath[0];
                        const parentsRw = orders.filter(o => !o.parentOrderId && o.productId === reworkActionRow.productId);
                        const splitProductRw = reworkActionRow.scope === 'product' && parentsRw.length > 0;
                        const pushRework = (oid: string, vid: string | undefined, q: number, rid: string) => {
                          if (!onAddRecord || q <= 0) return;
                          onAddRecord({
                            id: rid,
                            type: 'REWORK',
                            orderId: oid,
                            productId: reworkActionRow.productId,
                            variantId: vid,
                            quantity: q,
                            reason,
                            operator,
                            timestamp,
                            status: '待返工',
                            sourceNodeId,
                            nodeId: nodeIdFirst,
                            reworkNodeIds: reworkNodeIdsSorted,
                            docNo: reworkDocNo
                          });
                        };
                        if (reworkActionHasColorSize) {
                          if (!onAddRecord || reworkActionNodeIds.length === 0 || reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) return;
                          if (splitProductRw) {
                            const qtyMap: Record<string, number> = {};
                            Object.entries(reworkActionVariantQuantities).forEach(([vId, q]) => {
                              const n = Number(q) || 0;
                              if (n <= 0) return;
                              if (n > (reworkActionPendingByVariant[vId] ?? 0)) return;
                              qtyMap[vId] = n;
                            });
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsRw,
                              productMilestoneProgresses,
                              qtyMap
                            );
                            if (splits.length === 0) return;
                            splits.forEach((sp, i) =>
                              pushRework(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-rw-${i}-${sp.orderId}`)
                            );
                          } else {
                            Object.entries(reworkActionVariantQuantities).forEach(([variantId, qty]) => {
                              const q = Number(qty) || 0;
                              if (q <= 0) return;
                              const maxV = reworkActionPendingByVariant[variantId] ?? 0;
                              if (q > maxV) return;
                              pushRework(reworkActionRow.orderId, variantId || undefined, q, `rec-${Date.now()}-${variantId}`);
                            });
                          }
                        } else {
                          if (!onAddRecord || reworkActionNodeIds.length === 0 || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
                          if (splitProductRw) {
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsRw,
                              productMilestoneProgresses,
                              { '': reworkActionQty }
                            );
                            if (splits.length === 0) return;
                            splits.forEach((sp, i) =>
                              pushRework(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-rw-${i}-${sp.orderId}`)
                            );
                          } else {
                            pushRework(reworkActionRow.orderId, undefined, reworkActionQty, `rec-${Date.now()}-rw-${Math.random().toString(36).slice(2, 8)}`);
                          }
                        }
                        setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({});
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

      {/* 返工报工弹窗：点击工序标签打开，按路径分开录入（做法1），支持颜色尺码与最多数量提示 */}
      {limitType === 'REWORK' && reworkReportModal && onUpdateRecord && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 z-0 bg-slate-900/60"
            onClick={() => { setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); setReworkReportUnitPrice(0); }}
            aria-hidden
          />
          <div
            className="relative z-10 bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> {reworkReportModal.nodeName} · 返工报工</h3>
              <button type="button" onClick={() => { setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); setReworkReportUnitPrice(0); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-sm text-slate-600">
                {productionLinkMode === 'product' ? (
                  <>
                    <span className="font-bold text-slate-800">{reworkReportModal.order.productName || '—'}</span>
                    <span className="text-slate-400 text-xs ml-2">载体工单 {reworkReportModal.order.orderNumber}</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-800">{reworkReportModal.order.orderNumber}</span>
                    <span className="mx-2">·</span>
                    <span>{reworkReportModal.order.productName || '—'}</span>
                  </>
                )}
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">生产人员 <span className="text-rose-500">*</span></label>
                <WorkerSelector
                  options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                  processNodes={globalNodes}
                  currentNodeId={reworkReportModal.nodeId}
                  value={reworkReportWorkerId}
                  onChange={(id: string) => setReworkReportWorkerId(id)}
                  placeholder="选择报工人员..."
                  variant="default"
                  icon={UserPlus}
                />
              </div>
              {globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">设备 <span className="text-rose-500">*</span></label>
                  <EquipmentSelector
                    options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                    processNodes={globalNodes}
                    currentNodeId={reworkReportModal.nodeId}
                    value={reworkReportEquipmentId}
                    onChange={(id: string) => setReworkReportEquipmentId(id)}
                    placeholder="选择设备..."
                    variant="default"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={reworkReportUnitPrice || ''}
                    onChange={e => setReworkReportUnitPrice(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                  <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                    {(() => {
                      const totalQty = reworkReportPaths.reduce((sum, p) => {
                        if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
                          return sum + (reworkReportProduct.variants.reduce((vs, v) => vs + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0), 0));
                        }
                        return sum + (reworkReportQuantities[p.pathKey] ?? 0);
                      }, 0);
                      return (totalQty * (reworkReportUnitPrice || 0)).toFixed(2);
                    })()}
                  </div>
                </div>
              </div>
              {reworkReportPaths.length === 0 ? (
                <p className="text-slate-500 py-4">
                  {processSequenceMode === 'sequential'
                    ? '该工序暂无待返工数量（顺序模式：请先完成上一道返工工序的报工）'
                    : '该工序暂无待返工数量'}
                </p>
              ) : (
                <div className="space-y-4 pb-2">
                  {reworkReportPaths.map(({ pathKey, pathLabel, records: pathRecords, totalPending, pendingByVariant }) => {
                    const currentNodeId = reworkReportModal.nodeId;
                    if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
                      return (
                        <div key={pathKey} className="space-y-3 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800">返工路径：{pathLabel}</span>
                            <span className="text-xs font-bold text-indigo-600">待返工合计 {totalPending} 件</span>
                          </div>
                          <div className="space-y-3 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                            {sortedVariantColorEntries(reworkReportGroupedVariants, reworkReportProduct?.colorIds, reworkReportProduct?.sizeIds).map(([colorId, colorVariants]) => {
                              const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
                              return (
                                <div key={colorId} className="flex items-center gap-4 flex-wrap">
                                  <div className="flex items-center gap-2 shrink-0">
                                    {color && <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string }).value }} />}
                                    <span className="text-sm font-bold text-slate-800">{(color as { name?: string })?.name ?? colorId}</span>
                                  </div>
                                  <div className="flex items-center gap-3 flex-1">
                                    {colorVariants.map(v => {
                                      const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                                      const pendingUndiff = pendingByVariant[''] ?? 0;
                                      const onlyUndiff =
                                        pendingUndiff > 0 &&
                                        Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);
                                      const maxV = onlyUndiff
                                        ? pendingUndiff
                                        : (pendingByVariant[v.id] ?? 0);
                                      const qty = reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0;
                                      return (
                                        <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                          <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={maxV}
                                            value={qty === 0 ? '' : qty}
                                            onChange={e => {
                                              const raw = Math.max(0, Number(e.target.value) || 0);
                                              if (!onlyUndiff) {
                                                setReworkReportQuantities(prev => ({ ...prev, [`${pathKey}__${v.id}`]: Math.min(maxV, raw) }));
                                                return;
                                              }
                                              setReworkReportQuantities(prev => {
                                                const sumOthers = (reworkReportProduct?.variants ?? [])
                                                  .filter(x => x.id !== v.id)
                                                  .reduce((s, x) => s + (prev[`${pathKey}__${x.id}`] ?? 0), 0);
                                                const cap = Math.max(0, pendingUndiff - sumOthers);
                                                return { ...prev, [`${pathKey}__${v.id}`]: Math.min(cap, raw) };
                                              });
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                                            placeholder={`最多${maxV}`}
                                          />
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
                    const totalEntered = reworkReportQuantities[pathKey] ?? 0;
                    return (
                      <div key={pathKey} className="flex items-center gap-4 flex-wrap bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                        <span className="text-sm font-bold text-slate-800 shrink-0">返工路径：{pathLabel}</span>
                        <span className="text-xs font-bold text-slate-500">待返工 {totalPending} 件</span>
                        <input
                          type="number"
                          min={0}
                          max={totalPending}
                          value={totalEntered === 0 ? '' : totalEntered}
                          onChange={e => setReworkReportQuantities(prev => ({ ...prev, [pathKey]: Math.min(totalPending, Math.max(0, Number(e.target.value) || 0)) }))}
                          className="w-28 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400"
                          placeholder={`最多${totalPending}`}
                        />
                        <span className="text-xs text-slate-400">件</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {reworkReportPaths.length > 0 && (
              <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex gap-3 bg-white">
                    <button type="button" onClick={() => { setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportUnitPrice(0); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!reworkReportWorkerId?.trim()) {
                          toast.warning('请先选择生产人员');
                          return;
                        }
                        const needEquip = globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport;
                        if (needEquip && !reworkReportEquipmentId?.trim()) {
                          toast.warning('请先选择设备');
                          return;
                        }
                        if (!onAddRecord) {
                          toast.error('系统未配置保存单据，无法提交返工报工');
                          return;
                        }
                        const pathsSnapshot = reworkReportPaths;
                        const hasAnyQty = pathsSnapshot.some(p => {
                          if (!reworkReportHasColorSize) return (reworkReportQuantities[p.pathKey] ?? 0) > 0;
                          const pu = p.pendingByVariant[''] ?? 0;
                          const onlyU =
                            pu > 0 &&
                            Object.keys(p.pendingByVariant).every(k => k === '' || (p.pendingByVariant[k] ?? 0) <= 0);
                          if (onlyU) {
                            const sum =
                              reworkReportProduct?.variants?.reduce(
                                (s, v) => s + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0),
                                0
                              ) ?? 0;
                            if (sum > 0) return true;
                          }
                          if ((p.pendingByVariant[''] ?? 0) > 0 && (reworkReportQuantities[`${p.pathKey}__`] ?? 0) > 0) return true;
                          return (reworkReportProduct?.variants ?? []).some(v => (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0) > 0);
                        });
                        if (!hasAnyQty) {
                          toast.warning('请先在各返工路径下填写报工数量');
                          return;
                        }
                        const currentNodeId = reworkReportModal.nodeId;
                        let batchDocNo = '';
                        let reportSeq = 0;
                        let appliedReportQty = 0;
                        const pushReworkReport = (qty: number, variantId: string | undefined, src: ProductionOpRecord) => {
                          if (qty <= 0 || !onAddRecord) return;
                          if (!batchDocNo) batchDocNo = getNextReworkReportDocNo();
                          appliedReportQty += qty;
                          const ts = new Date().toLocaleString();
                          const opName = workers?.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? '张主管';
                          const sid = src.id != null ? String(src.id) : 'x';
                          onAddRecord({
                            id: `rec-rework-report-${Date.now()}-${reportSeq++}-${sid.slice(-8)}`,
                            type: 'REWORK_REPORT' as const,
                            orderId: src.orderId ?? reworkReportModal.order.id,
                            productId: reworkReportModal.order.productId,
                            operator: opName,
                            timestamp: ts,
                            nodeId: currentNodeId,
                            sourceNodeId: src.sourceNodeId,
                            sourceReworkId: src.id,
                            workerId: reworkReportWorkerId || undefined,
                            equipmentId: reworkReportEquipmentId || undefined,
                            quantity: qty,
                            variantId: variantId || undefined,
                            docNo: batchDocNo,
                            unitPrice: reworkReportUnitPrice > 0 ? reworkReportUnitPrice : undefined,
                            amount: reworkReportUnitPrice > 0 ? qty * reworkReportUnitPrice : undefined,
                          });
                        };
                        try {
                        for (const { pathKey, records: pathRecords, pendingByVariant } of pathsSnapshot) {
                          if (reworkReportHasColorSize) {
                            const pendingUndiff = pendingByVariant[''] ?? 0;
                            const onlyUndiffPending =
                              pendingUndiff > 0 &&
                              Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);

                            if (onlyUndiffPending) {
                              const userTotal =
                                reworkReportProduct?.variants?.reduce(
                                  (s, v) => s + (reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0),
                                  0
                                ) ?? 0;
                              const totalToApply = Math.min(userTotal, pendingUndiff);
                              if (totalToApply <= 0) continue;
                              let remaining = totalToApply;
                              const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
                              for (const r of sortedRecs) {
                                if (remaining <= 0) break;
                                const room = r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0);
                                const add = Math.min(room, remaining);
                                if (add <= 0) continue;
                                remaining -= add;
                                const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + add;
                                const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
                                const allDone = nodes.every(
                                  n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? add : 0) >= r.quantity
                                );
                                const opName = workers.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? r.operator;
                                const ts = new Date().toLocaleString();
                                onUpdateRecord({
                                  ...r,
                                  reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
                                  ...(allDone ? { status: '已完成' as const } : {}),
                                  workerId: reworkReportWorkerId || undefined,
                                  equipmentId: reworkReportEquipmentId || undefined,
                                  operator: opName,
                                  timestamp: ts
                                });
                                pushReworkReport(add, undefined, r);
                              }
                              continue;
                            }

                            const byVariant: Record<string, number> = {};
                            if ((pendingByVariant[''] ?? 0) > 0) byVariant[''] = Math.min(reworkReportQuantities[`${pathKey}__`] ?? 0, pendingByVariant[''] ?? 0);
                            reworkReportProduct?.variants?.forEach(v => { byVariant[v.id] = Math.min(reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0, pendingByVariant[v.id] ?? 0); });
                            const totalToApply = Object.values(byVariant).reduce((s, q) => s + q, 0);
                            if (totalToApply <= 0) continue;
                            let remainingByVariant = { ...byVariant };
                            const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
                            for (const r of sortedRecs) {
                              const vid = r.variantId ?? '';
                              const need = Math.min(r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0), remainingByVariant[vid] ?? 0);
                              if (need <= 0) continue;
                              remainingByVariant[vid] = (remainingByVariant[vid] ?? 0) - need;
                              const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + need;
                              const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
                              const allDone = nodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? need : 0) >= r.quantity);
                              const opName = workers.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? r.operator;
                              const ts = new Date().toLocaleString();
                              onUpdateRecord({
                                ...r,
                                reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
                                ...(allDone ? { status: '已完成' as const } : {}),
                                workerId: reworkReportWorkerId || undefined,
                                equipmentId: reworkReportEquipmentId || undefined,
                                operator: opName,
                                timestamp: ts
                              });
                              pushReworkReport(need, vid || undefined, r);
                            }
                          } else {
                            const totalToApply = Math.min(reworkReportQuantities[pathKey] ?? 0, pathRecords.reduce((s, r) => s + (r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0)), 0));
                            if (totalToApply <= 0) continue;
                            let remaining = totalToApply;
                            const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
                            for (const r of sortedRecs) {
                              if (remaining <= 0) break;
                              const room = r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0);
                              const add = Math.min(room, remaining);
                              if (add <= 0) continue;
                              remaining -= add;
                              const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + add;
                              const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
                              const allDone = nodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? add : 0) >= r.quantity);
                              const opName = workers.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? r.operator;
                              const ts = new Date().toLocaleString();
                              onUpdateRecord({
                                ...r,
                                reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
                                ...(allDone ? { status: '已完成' as const } : {}),
                                workerId: reworkReportWorkerId || undefined,
                                equipmentId: reworkReportEquipmentId || undefined,
                                operator: opName,
                                timestamp: ts
                              });
                              pushReworkReport(add, r.variantId, r);
                            }
                          }
                        }
                        } catch (e) {
                          console.error(e);
                          toast.error(`提交失败：${e instanceof Error ? e.message : String(e)}`);
                          return;
                        }
                        if (appliedReportQty <= 0) {
                          toast.error('未能写入返工报工：请确认所填数量与各规格「待返工」一致，或尝试刷新页面后重试。');
                          return;
                        }
                        setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); setReworkReportUnitPrice(0);
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      确认报工
                    </button>
              </div>
            )}
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
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品明细</h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {productionLinkMode === 'product'
                  ? '有颜色尺码的产品按规格录入委外数量。每格「最多」与工单中心 · 关联产品报工该工序一致（规格级可报良品余量，已扣本工序已报良品；再扣本规格已外协未收回）。无规格区分的单规格产品可填合计。'
                  : '有颜色尺码的工单按规格录入。每格「最多」与该工序可报最多数量一致（顺序模式以前工序该规格完成量为基数），再扣已报良品及已外协未收回。'}
              </p>
              <div className="space-y-8">
              {outsourceDispatchRows.filter(row => dispatchSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`)).map(row => {
                const dispatchRowKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
                const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
                const product = products.find(p => p.id === row.productId);
                const category = categories.find(c => c.id === product?.categoryId);
                const isProductBlock = productionLinkMode === 'product' && row.orderId == null;
                const blockOrders = isProductBlock ? orders.filter(o => o.productId === row.productId) : [];
                const variantIdsInBlock = new Set<string>();
                blockOrders.forEach(o => {
                  (o.items ?? []).forEach(i => {
                    if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId);
                  });
                });
                const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                const hasMultiVariantProduct = (product?.variants?.length ?? 0) > 1;
                const hasColorSizeOrder = productionLinkMode === 'order' && category?.hasColorSize && hasMultiVariantProduct;
                const hasColorSizeProduct = isProductBlock && category?.hasColorSize && hasMultiVariantProduct;
                const baseKey = dispatchRowKey;
                const variantsInOrder =
                  hasColorSizeOrder && product?.variants
                    ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id))
                    : [];
                const variantsInProductBlock =
                  hasColorSizeProduct && product?.variants
                    ? (product.variants as ProductVariant[]).filter(v => variantIdsInBlock.has(v.id))
                    : [];

                if (variantsInOrder.length > 0) {
                  const ms = order?.milestones?.find(m => m.templateId === row.nodeId);
                  const msIdx = order?.milestones?.findIndex(m => m.templateId === row.nodeId) ?? -1;
                  const prevMs = (processSequenceMode === 'sequential' && msIdx > 0)
                    ? order?.milestones?.[msIdx - 1]
                    : undefined;
                  const outsourceDispatchedForNode = records.filter(
                    r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId
                  );
                  const drForNode = row.orderId
                    ? (defectiveReworkByOrderForOutsource.get(`${row.orderId}|${row.nodeId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> })
                    : { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
                  const getAvailableForVariant = (variantId: string) => {
                    const completedInMs = (ms?.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.quantity), 0);
                    const defectiveForVariant = (ms?.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.defectiveQuantity ?? 0), 0);
                    let seqRemaining: number;
                    if (prevMs) {
                      const prevCompleted = (prevMs.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.quantity), 0);
                      seqRemaining = prevCompleted - completedInMs;
                    } else {
                      const orderItem = order?.items?.find(i => (i.variantId || '') === variantId);
                      seqRemaining = (orderItem?.quantity ?? 0) - completedInMs;
                    }
                    const base = Math.max(0, seqRemaining - defectiveForVariant);
                    const reworkForVariant = drForNode.reworkByVariant?.[variantId] ?? 0;
                    const dispatched = outsourceDispatchedForNode.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                    return Math.max(0, base + reworkForVariant - dispatched);
                  };
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInOrder.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        {row.orderNumber != null && (
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>
                        )}
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">颜色尺码</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}|${v.id}`;
                                  const maxVariant = getAvailableForVariant(v.id);
                                  const cellQty = dispatchFormQuantities[qtyKey] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxVariant}
                                        value={cellQty === 0 ? '' : cellQty}
                                        onChange={e => {
                                          const raw = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                          setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxVariant) }));
                                        }}
                                        placeholder={`最多${maxVariant}`}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                                      />
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

                if (variantsInProductBlock.length > 0) {
                  const getDr = (oid: string, tid: string) =>
                    defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? {
                      defective: 0,
                      rework: 0,
                      reworkByVariant: {} as Record<string, number>
                    };
                  const milestoneNodeIds = product?.milestoneNodeIds || [];
                  const seq = (processSequenceMode ?? 'free') as ProcessSequenceMode;
                  const outsourcedProductNode = records.filter(
                    r =>
                      r.type === 'OUTSOURCE' &&
                      r.status === '加工中' &&
                      !r.orderId &&
                      r.productId === row.productId &&
                      r.nodeId === row.nodeId
                  );
                  const getAvailableForVariantProduct = (variantId: string) => {
                    const maxGood = variantMaxGoodProductMode(
                      variantId,
                      row.nodeId,
                      row.productId,
                      blockOrders,
                      productMilestoneProgresses || [],
                      seq,
                      milestoneNodeIds,
                      getDr
                    );
                    const dispatched = outsourcedProductNode
                      .filter(r => (r.variantId || '') === variantId)
                      .reduce((s, r) => s + r.quantity, 0);
                    return Math.max(0, maxGood - dispatched);
                  };
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInProductBlock.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">关联产品 · 颜色尺码</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                        <span className="text-xs text-slate-500">（合计可委外 {row.availableQty}，按规格之和填写）</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}|${v.id}`;
                                  const maxVariant = getAvailableForVariantProduct(v.id);
                                  const cellQty = dispatchFormQuantities[qtyKey] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxVariant}
                                        value={cellQty === 0 ? '' : cellQty}
                                        onChange={e => {
                                          const raw = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                          setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxVariant) }));
                                        }}
                                        placeholder={`最多${maxVariant}`}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                                      />
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
                      {productionLinkMode !== 'product' && row.orderNumber != null && (
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>
                      )}
                      {isProductBlock && (
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">单规格/无尺码矩阵</span>
                      )}
                      <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    </div>
                    <div className="flex flex-col gap-1 flex-1 max-w-xs">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">委外数量</label>
                      <input
                        type="number"
                        min={0}
                        max={row.availableQty}
                        value={(dispatchFormQuantities[baseKey] ?? 0) === 0 ? '' : dispatchFormQuantities[baseKey]}
                        onChange={e => {
                          const raw = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setDispatchFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, row.availableQty) }));
                        }}
                        placeholder={`最多${row.availableQty}`}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                      />
                      <span className="text-[10px] text-slate-500">
                        {isProductBlock ? '与报工页本工序合计上限一致' : '下单 − 已报 − 已发出'}
                      </span>
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
              <p className="text-xs text-slate-500">{productionLinkMode === 'product' ? '已发出未收回的产品+工序+外协厂汇总；勾选后点击「批量收回」填写本次收回数量。' : '已发出未收回的工单+工序汇总；点击「收回」填写本次收回数量。'}</p>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
              {productionLinkMode !== 'product' && (
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
              )}
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
                    {productionLinkMode !== 'product' && <th className="w-[18%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>}
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
                      <td colSpan={productionLinkMode === 'product' ? 7 : 8} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceReceiveRows.length === 0 ? '暂无待收回项。' : '无匹配项，请调整搜索条件。'}</td>
                    </tr>
                  ) : (
                    filteredReceiveRows.map(row => {
                      const key = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
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
                                    const firstRow = outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey);
                                    const selectedPartner = firstRow?.partner ?? '';
                                    if (selectedPartner !== (row.partner ?? '')) {
                                      toast.warning('只能选择同一外协工厂同时收货，请先取消其他加工厂的勾选。');
                                      return prev;
                                    }
                                    const selectedNodeId = firstKey?.split('|')[1];
                                    if (selectedNodeId !== row.nodeId) {
                                      toast.warning('只能选择同一工序同时收货，请先取消其他工序的勾选。');
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
                          {productionLinkMode !== 'product' && <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>}
                          <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-700 align-middle truncate" title={row.partner || '—'}>
                            {row.partner || '—'}
                            {partners.find(p => p.name === row.partner)?.collaborationTenantId && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-50 text-indigo-600 uppercase">协作</span>
                            )}
                          </td>
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
                      const row = outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey);
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
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品明细</h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {productionLinkMode === 'product'
                  ? '关联产品且发出单按颜色尺码录入时，按规格收回；每格「最多」= 该规格已发出未收回数。若有未带规格的发出的数量，在下方「未按规格」行收回。'
                  : '按规格收回时每格不超过该规格待收数量。'}
              </p>
              <div className="space-y-8">
              {outsourceReceiveRows.filter(row => receiveSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`)).map(row => {
                const receiveRowKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
                const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
                const product = products.find(p => p.id === row.productId);
                const category = categories.find(c => c.id === product?.categoryId);
                const hasColorSize = productionLinkMode === 'order' && category?.hasColorSize && (product?.variants?.length ?? 0) > 1;
                const baseKey = receiveRowKey;
                const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                const variantsInOrder = hasColorSize && product?.variants
                  ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id))
                  : [];
                const dispatchRecords = productionLinkMode === 'product'
                  ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
                  : records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                const receiveRecords = productionLinkMode === 'product'
                  ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
                  : records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                const getPendingForVariant = (variantId: string) => {
                  const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                  const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                  return Math.max(0, dispatched - received);
                };
                const isProductBlockRecv = productionLinkMode === 'product' && row.orderId == null;
                const blockOrdersRecv = isProductBlockRecv ? orders.filter(o => o.productId === row.productId) : [];
                const variantIdsInBlockRecv = new Set<string>();
                blockOrdersRecv.forEach(o => {
                  (o.items ?? []).forEach(i => {
                    if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlockRecv.add(i.variantId);
                  });
                });
                const hasMultiVariantRecv = (product?.variants?.length ?? 0) > 1;
                const variantsInProductBlockRecv =
                  isProductBlockRecv && category?.hasColorSize && hasMultiVariantRecv && product?.variants
                    ? (product.variants as ProductVariant[]).filter(v => variantIdsInBlockRecv.has(v.id))
                    : [];
                const hasVariantProductDispatchesRecv = dispatchRecords.some(r => !!r.variantId);
                const dispNoVarRecv = dispatchRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
                const recNoVarRecv = receiveRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
                const pendingNoVarRecv = Math.max(0, dispNoVarRecv - recNoVarRecv);

                if (isProductBlockRecv && variantsInProductBlockRecv.length > 0 && hasVariantProductDispatchesRecv) {
                  const groupedPb: Record<string, ProductVariant[]> = {};
                  variantsInProductBlockRecv.forEach(v => {
                    if (!groupedPb[v.colorId]) groupedPb[v.colorId] = [];
                    groupedPb[v.colorId].push(v);
                  });
                  const rowTotalPb =
                    variantsInProductBlockRecv.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`] ?? 0), 0) +
                    (pendingNoVarRecv > 0 ? receiveFormQuantities[baseKey] ?? 0 : 0);
                  const rowUnitPb = receiveFormUnitPrices[baseKey] ?? 0;
                  const rowAmountPb = rowTotalPb * rowUnitPb;
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">关联产品 · 颜色尺码</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                        <span className="text-xs text-slate-500">待收回合计 {row.pending} 件</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedPb, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`;
                                  const maxV = getPendingForVariant(v.id);
                                  const cellQ = receiveFormQuantities[qtyKey] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxV}
                                        value={cellQ === 0 ? '' : cellQ}
                                        onChange={e => {
                                          const raw = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                          setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxV) }));
                                        }}
                                        placeholder={`最多${maxV}`}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {pendingNoVarRecv > 0 && (
                        <div className="p-4 bg-white rounded-xl border border-dashed border-slate-200 flex flex-wrap items-center gap-4">
                          <span className="text-sm font-bold text-slate-600">未按规格发出的待收回</span>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-400">数量</span>
                            <input
                              type="number"
                              min={0}
                              max={pendingNoVarRecv}
                              value={(receiveFormQuantities[baseKey] ?? 0) === 0 ? '' : receiveFormQuantities[baseKey]}
                              onChange={e => {
                                const raw = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, pendingNoVarRecv) }));
                              }}
                              placeholder={`最多${pendingNoVarRecv}`}
                              className="w-36 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={receiveFormUnitPrices[baseKey] ?? ''}
                            onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                            placeholder="0"
                            className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                          <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                            {rowAmountPb.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (variantsInOrder.length > 0) {
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInOrder.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                  const rowTotalQty = variantsInOrder.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}|${v.id}`] ?? 0), 0);
                  const rowUnitPrice = receiveFormUnitPrices[baseKey] ?? 0;
                  const rowAmount = rowTotalQty * rowUnitPrice;
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
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
                      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={receiveFormUnitPrices[baseKey] ?? ''}
                            onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                            placeholder="0"
                            className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                          <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                            {rowAmount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                      <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap flex-1">
                      <div className="flex items-center gap-2">
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
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={receiveFormUnitPrices[baseKey] ?? ''}
                          onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                          placeholder="0"
                          className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                        <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                          {((receiveFormQuantities[baseKey] ?? 0) * (receiveFormUnitPrices[baseKey] ?? 0)).toFixed(2)}
                        </div>
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
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 外协流水</h3>
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
                {productionLinkMode !== 'product' && (
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
                )}
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
            <div className="flex-1 overflow-auto p-4">
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
                        {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">备注</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOutsourceFlowRows.map(row => {
                        const rowKey = productionLinkMode === 'product' ? `${row.docNo}|${row.productId}` : `${row.docNo}|${row.orderId}|${row.productId}`;
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
                            {productionLinkMode !== 'product' && <td className="px-4 py-3 text-[10px] font-black text-indigo-600 uppercase">{row.orderNumber}</td>}
                            <td className="px-4 py-3 font-bold text-slate-800">{row.productName}</td>
                            <td className="px-4 py-3 font-bold text-slate-700">{row.milestoneStr}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQuantity}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={row.remark}>{row.remark}</td>
                            <td className="px-4 py-3">
                              {hasOpsPerm('production:outsource_records:view') && (
                                <button
                                  type="button"
                                  onClick={() => setFlowDetailKey(row.docNo)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                                >
                                  <FileText className="w-3.5 h-3.5" /> 详情
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 9 : 10}>
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
        const isReceiveDoc = first.status === '已收回';
        const totalAmount = isReceiveDoc ? docRecords.reduce((s, r) => s + (r.amount ?? 0), 0) : 0;
        const docDateStr = first.timestamp ? (() => { try { const d = new Date(first.timestamp); return isNaN(d.getTime()) ? first.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return first.timestamp; } })() : '—';
        const docPartner = first.partner ?? '—';
        const docRemark = docRecords.map(r => r.reason).filter(Boolean)[0] ?? '—';
        const isProductModeDetail = productionLinkMode === 'product' && docRecords.some(r => !r.orderId);
        const byOrderNode = new Map<string, ProductionOpRecord[]>();
        docRecords.forEach(rec => {
          if (!rec.nodeId) return;
          const key = isProductModeDetail ? `${rec.productId}|${rec.nodeId}` : (rec.orderId ? `${rec.orderId}|${rec.nodeId}` : '');
          if (!key) return;
          if (!byOrderNode.has(key)) byOrderNode.set(key, []);
          byOrderNode.get(key)!.push(rec);
        });
        const detailLines = Array.from(byOrderNode.entries()).map(([key, recs]) => {
          const order = recs[0].orderId ? orders.find(o => o.id === recs[0].orderId) : undefined;
          const product = products.find(p => p.id === (order?.productId ?? recs[0].productId));
          const nodeName = recs[0].nodeId ? (globalNodes.find(n => n.id === recs[0].nodeId)?.name ?? recs[0].nodeId) : '—';
          const variantQty: Record<string, number> = {};
          recs.forEach(r => {
            const v = r.variantId || '';
            if (!variantQty[v]) variantQty[v] = 0;
            variantQty[v] += r.quantity;
          });
          return { key, order, product, orderNumber: order?.orderNumber ?? (isProductModeDetail ? '' : recs[0].orderId), productName: product?.name ?? '—', nodeName, records: recs, variantQty };
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
                      <button type="button" onClick={() => { setFlowDetailEditMode(false); setFlowDetailPartnerOpen(false); setFlowDetailPartnerSearch(''); setFlowDetailUnitPrices({}); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!onDeleteRecord) return;
                          const partnerName = (flowDetailEditPartner || '').trim();
                          if (!partnerName) { toast.warning('请选择外协工厂。'); return; }
                          const entries = Object.entries(flowDetailQuantities).filter(([, qty]) => qty > 0);
                          if (entries.length === 0) { toast.warning('请至少填写一项数量。'); return; }
                          const isReceiveDoc = first.status === '已收回';
                          const toDelete = isReceiveDoc ? docRecords : docRecords.filter(r => r.status !== '已收回');
                          for (const rec of toDelete) await onDeleteRecord(rec.id);
                          const timestamp = first.timestamp || new Date().toLocaleString();
                          const newStatus = isReceiveDoc ? '已收回' : '加工中';
                          const batch: ProductionOpRecord[] = [];
                          entries.forEach(([key, qty]) => {
                            const parts = key.split('|');
                            const nodeId = parts[1];
                            const variantId = parts[2];
                            if (isProductModeDetail) {
                              const productId = parts[0];
                              const baseKey = parts.length >= 2 ? `${productId}|${nodeId}` : key;
                              const unitPrice = isReceiveDoc ? (flowDetailUnitPrices[key] ?? flowDetailUnitPrices[baseKey] ?? 0) : undefined;
                              const amount = isReceiveDoc && unitPrice != null ? Number(qty) * unitPrice : undefined;
                              batch.push({
                                id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                type: 'OUTSOURCE',
                                productId,
                                quantity: qty,
                                reason: flowDetailEditRemark.trim() || undefined,
                                operator: first.operator || '张主管',
                                timestamp,
                                status: newStatus,
                                partner: partnerName,
                                docNo: flowDetailKey,
                                nodeId,
                                variantId: variantId || undefined,
                                unitPrice: unitPrice || undefined,
                                amount: amount ?? undefined
                              } as ProductionOpRecord);
                              return;
                            }
                            const orderId = parts[0];
                            const baseKey = parts.length >= 2 ? `${orderId}|${nodeId}` : key;
                            const order = orders.find(o => o.id === orderId);
                            if (!order) return;
                            const unitPrice = isReceiveDoc ? (flowDetailUnitPrices[key] ?? flowDetailUnitPrices[baseKey] ?? 0) : undefined;
                            const amount = isReceiveDoc && unitPrice != null ? Number(qty) * unitPrice : undefined;
                            batch.push({
                              id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
                              variantId: variantId || undefined,
                              unitPrice: unitPrice || undefined,
                              amount: amount ?? undefined
                            } as ProductionOpRecord);
                          });
                          if (onAddRecordBatch && batch.length > 1) {
                            await onAddRecordBatch(batch);
                          } else {
                            for (const rec of batch) await onAddRecord(rec);
                          }
                          setFlowDetailEditMode(false);
                          setFlowDetailPartnerOpen(false);
                          setFlowDetailUnitPrices({});
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && hasOpsPerm('production:outsource_records:edit') && (
                        <button
                          type="button"
                          onClick={() => {
                            setFlowDetailEditPartner(docPartner);
                            setFlowDetailEditRemark(docRemark);
                            const initQty: Record<string, number> = {};
                            docRecords.forEach(r => {
                              const k = isProductModeDetail
                                ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`
                                : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`;
                              initQty[k] = (initQty[k] || 0) + r.quantity;
                            });
                            setFlowDetailQuantities(initQty);
                            const isReceive = first.status === '已收回';
                            if (isReceive) {
                              const initUnitPrice: Record<string, number> = {};
                              docRecords.forEach(r => {
                                const k = isProductModeDetail
                                  ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`
                                  : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`;
                                initUnitPrice[k] = r.unitPrice ?? 0;
                              });
                              docRecords.forEach(r => {
                                if (r.variantId) {
                                  const base = isProductModeDetail ? `${r.productId}|${r.nodeId}` : `${r.orderId}|${r.nodeId}`;
                                  if (initUnitPrice[base] == null) initUnitPrice[base] = r.unitPrice ?? 0;
                                }
                              });
                              setFlowDetailUnitPrices(initUnitPrice);
                            } else {
                              setFlowDetailUnitPrices({});
                            }
                            setFlowDetailEditMode(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && hasOpsPerm('production:outsource_records:delete') && (
                        <button
                          type="button"
                          onClick={() => {
                            void confirm({ message: '确定要删除该张外协单的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                              if (!ok) return;
                              docRecords.forEach(rec => onDeleteRecord(rec.id));
                              setFlowDetailKey(null);
                              setFlowDetailEditMode(false);
                            });
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
                  {isReceiveDoc && (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">加工费合计（元）</label>
                      <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-emerald-50 flex items-center">{totalAmount.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0 p-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">商品明细</h4>
                <div className="space-y-8">
                  {detailLines.map(({ key, order, product, orderNumber, productName, nodeName, records: lineRecords, variantQty }) => {
                    const category = categories.find(c => c.id === product?.categoryId);
                    const hasColorSizeCategory = !!category?.hasColorSize;
                    const allProductVariants = (product?.variants as ProductVariant[]) ?? [];
                    const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                    const variantIdsFromRecords = new Set(
                      Object.entries(variantQty)
                        .filter(([vid, q]) => vid !== '' && (Number(q) || 0) !== 0)
                        .map(([vid]) => vid),
                    );
                    let variantsForDetail: ProductVariant[] = [];
                    if (hasColorSizeCategory && allProductVariants.length > 0) {
                      if (variantIdsInOrder.size > 0) {
                        variantsForDetail = allProductVariants.filter(v => variantIdsInOrder.has(v.id));
                      }
                      if (variantsForDetail.length === 0 && variantIdsFromRecords.size > 0) {
                        variantsForDetail = allProductVariants.filter(v => variantIdsFromRecords.has(v.id));
                      }
                    }
                    const showVariantQtyGrid = hasColorSizeCategory && variantsForDetail.length > 0;
                    if (showVariantQtyGrid) {
                      const groupedByColor: Record<string, ProductVariant[]> = {};
                      variantsForDetail.forEach(v => {
                        if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                        groupedByColor[v.colorId].push(v);
                      });
                      return (
                        <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>}
                            <span className="text-sm font-bold text-slate-800">{productName}</span>
                            <span className="text-sm font-bold text-indigo-600">{nodeName}</span>
                          </div>
                          <div className="space-y-4">
                            {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                              const color = dictionaries?.colors?.find(c => c.id === colorId);
                              return (
                                <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
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
                          {isReceiveDoc && (
                            <div className="flex flex-wrap items-center gap-4 pt-4 mt-4 border-t border-slate-100">
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                                {flowDetailEditMode ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={flowDetailUnitPrices[key] ?? ''}
                                    onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                                    placeholder="0"
                                    className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                ) : (
                                  <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                                    {lineRecords[0]?.unitPrice != null ? Number(lineRecords[0].unitPrice).toFixed(2) : '—'}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                                <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                                  {flowDetailEditMode
                                    ? variantsForDetail.reduce((sum, v) => {
                                        const qtyKey = `${key}|${v.id}`;
                                        const q = flowDetailQuantities[qtyKey] ?? variantQty[v.id] ?? 0;
                                        const up = flowDetailUnitPrices[qtyKey] ?? flowDetailUnitPrices[key] ?? lineRecords.find(r => (r.variantId || '') === v.id)?.unitPrice ?? 0;
                                        return sum + q * up;
                                      }, 0).toFixed(2)
                                    : lineRecords.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    const totalQty = Object.values(variantQty).reduce((s, n) => s + n, 0);
                    const singleQty = flowDetailEditMode ? (flowDetailQuantities[key] ?? totalQty) : totalQty;
                    const lineRec = lineRecords[0];
                    const lineUnitPrice = flowDetailEditMode && isReceiveDoc
                      ? (flowDetailUnitPrices[key] ?? lineRec?.unitPrice ?? 0)
                      : (lineRec?.unitPrice ?? 0);
                    const lineAmount = flowDetailEditMode && isReceiveDoc ? (singleQty * lineUnitPrice) : (lineRec?.amount ?? 0);
                    return (
                      <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap">
                            {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>}
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
                        {isReceiveDoc && (
                          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                              {flowDetailEditMode ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={flowDetailUnitPrices[key] ?? ''}
                                  onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                                  className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              ) : (
                                <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineUnitPrice.toFixed(2)}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                              <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineAmount.toFixed(2)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {receiveModal && limitType === 'OUTSOURCE' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setReceiveModal(null); setReceiveQty(0); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4">
            <h3 className="text-lg font-black text-slate-900">委外收回</h3>
            <div className="text-sm space-y-1">
              {receiveModal.orderNumber != null && <p><span className="text-slate-500">工单：</span><span className="font-bold text-slate-800">{receiveModal.orderNumber}</span></p>}
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
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4">
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
                {[...products].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)).map(p => (
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
      {collabSyncConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setCollabSyncConfirm(null); setSelectedRouteId(''); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" /> 同步到协作企业
            </h3>
            <p className="text-sm text-slate-600">
              外协工厂「<span className="font-bold text-slate-800">{collabSyncConfirm.partnerName}</span>」已绑定协作企业，是否将本次发出的 {collabSyncConfirm.recordIds.length} 条记录同步？
            </p>
            {(() => {
              const matchingRoutes = collabRoutes.filter((r: any) => {
                const sorted = [...(r.steps || [])].sort((a: any, b: any) => a.stepOrder - b.stepOrder);
                return sorted.length > 0 && sorted[0].receiverTenantId === collabSyncConfirm.collaborationTenantId;
              });
              if (matchingRoutes.length === 0) return null;
              return (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">外协路线（可选）</label>
                <select
                  value={selectedRouteId}
                  onChange={e => setSelectedRouteId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-slate-800"
                >
                  <option value="">不使用路线（单步外协）</option>
                  {matchingRoutes.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({(r.steps || []).length} 步)
                    </option>
                  ))}
                </select>
                {selectedRouteId && (() => {
                  const route = collabRoutes.find((r: any) => r.id === selectedRouteId);
                  if (!route) return null;
                  return (
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      {(route.steps || []).sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((s: any, i: number) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-slate-400 text-xs">→</span>}
                          <span className="text-xs font-bold text-indigo-600">{s.nodeName}·{s.receiverTenantName}</span>
                        </React.Fragment>
                      ))}
                      <span className="text-slate-400 text-xs">→</span>
                      <span className="text-xs font-bold text-emerald-600">回传</span>
                    </div>
                  );
                })()}
              </div>
              );
            })()}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setCollabSyncConfirm(null); setSelectedRouteId(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                暂不发送
              </button>
              <button
                type="button"
                disabled={collabSyncing}
                onClick={async () => {
                  setCollabSyncing(true);
                  try {
                    const res = await api.collaboration.syncDispatch({
                      recordIds: collabSyncConfirm.recordIds,
                      collaborationTenantId: collabSyncConfirm.collaborationTenantId,
                      ...(selectedRouteId ? { outsourceRouteId: selectedRouteId } : {}),
                    });
                    toast.success(`已同步 ${res.dispatches?.length ?? 0} 条到协作企业`);
                    setCollabSyncConfirm(null);
                    setSelectedRouteId('');
                  } catch (err: any) {
                    toast.error(err.message || '同步失败');
                  } finally {
                    setCollabSyncing(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {collabSyncing ? '同步中...' : '确认发送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ProductionMgmtOpsView);
