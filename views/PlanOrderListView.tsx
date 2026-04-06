
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  CalendarRange, 
  Plus, 
  X, 
  User, 
  Layers,
  CheckCircle2,
  Clock,
  ArrowRightCircle,
  AlertCircle,
  ArrowLeft,
  Save,
  FileText,
  CalendarDays,
  Search,
  Tag,
  Hash,
  Eye,
  Info,
  Users,
  Cpu,
  Check,
  Wrench,
  UserPlus,
  Boxes,
  MapPin,
  ClipboardCheck,
  Edit3,
  ChevronRight,
  Package,
  ArrowRight,
  ShoppingCart,
  Trash2,
  Send,
  Building2,
  FileSpreadsheet,
  ListOrdered,
  Split,
  Sliders,
  Download,
  Printer,
  QrCode,
  Ban,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../contexts/ConfirmContext';
import {
  PlanOrder,
  Product,
  PlanStatus,
  ProductCategory,
  AppDictionaries,
  ProductVariant,
  PlanItem,
  Worker,
  Equipment,
  NodeAssignment,
  GlobalNodeTemplate,
  BOM,
  PlanFormSettings,
  Partner,
  PartnerCategory,
  PrintTemplate,
  ProductionOrder,
  PrintRenderContext,
  ItemCode,
  PlanVirtualBatch,
} from '../types';
import { itemCodesApi, planVirtualBatchesApi } from '../services/api';
import { buildPrintListRowsFromItemCodes, type ItemCodePrintContext } from '../utils/printItemCodeRows';
import { buildVirtualBatchPrintRow } from '../utils/printVirtualBatch';
import { formatBatchSerialLabel, formatItemCodeSerialLabel } from '../utils/serialLabels';
import SplitPlanModal from './plan-order-list/SplitPlanModal';
import PlanFormConfigModal from './plan-order-list/PlanFormConfigModal';
import { SearchablePartnerSelect } from '../components/SearchablePartnerSelect';
import { PrintTemplateManager } from '../components/PrintTemplateManager';
import { HiddenPrintSlot, usePrintTemplateAction } from '../components/print-editor/PrintPreview';
import { createBlankCustomTemplate } from '../utils/printTemplateDefaults';
import {
  moduleHeaderRowClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  secondaryToolbarButtonClass,
  sectionTitleClass,
} from '../styles/uiDensity';
import PlanFormModal from './plan-order-list/PlanFormModal';

function getFileExtFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  if (!m) return 'bin';
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return map[m[1]] || 'bin';
}

/** 列表交期展示：仅日期，不含时间 */
function formatPlanDueDateList(due: string): string {
  const s = String(due).trim();
  if (!s) return '';
  if (s.includes('T')) return s.split('T')[0];
  const sp = s.indexOf(' ');
  if (sp > 0) return s.slice(0, sp);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** 列表添加日期展示：仅日期，不含时间 */
function formatPlanCreatedDateList(created: string | undefined | null): string {
  if (!created) return '';
  const s = String(created).trim();
  if (!s) return '';
  if (s.includes('T')) return s.split('T')[0];
  const sp = s.indexOf(' ');
  if (sp > 0) return s.slice(0, sp);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

interface PlanOrderListViewProps {
  productionLinkMode?: 'order' | 'product';
  plans: PlanOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  workers: Worker[];
  equipment: Equipment[];
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  partners: Partner[]; 
  partnerCategories: PartnerCategory[];
  psiRecords?: any[];
  planFormSettings: PlanFormSettings;
  onUpdatePlanFormSettings: (settings: PlanFormSettings) => void;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  /** 进入「打印模版」页签时从服务端拉取最新列表（多标签保存后同步） */
  onRefreshPrintTemplates?: () => void | Promise<void>;
  /** 用于打印模板预览示例数据 */
  orders?: ProductionOrder[];
  onCreatePlan: (plan: PlanOrder) => void;
  onSplitPlan: (planId: string, newPlans: PlanOrder[]) => void;
  onConvertToOrder: (planId: string) => void;
  onDeletePlan?: (planId: string) => void;
  onUpdateProduct: (product: Product) => Promise<boolean>;
  onUpdatePlan?: (planId: string, updates: Partial<PlanOrder>) => void;
  onAddPSIRecord?: (record: any) => void;
  onAddPSIRecordBatch?: (records: any[]) => Promise<void>;
  onCreateSubPlan?: (params: { productId: string; quantity: number; planId: string; bomNodeId: string }) => void;
  onCreateSubPlans?: (params: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId: string; parentProductId?: string; parentNodeId?: string }> }) => void;
}

interface ProposedOrder {
  orderNumber: string;
  partnerId: string;
  partnerName: string;
  items: {
    id: string;
    productId: string;
    materialName: string;
    materialSku: string;
    quantity: number;
    suggestedQty: number;
    nodeName: string;
  }[];
}

const SearchableMultiSelect = ({ 
  options, 
  selectedIds, 
  onChange, 
  placeholder,
  icon: Icon,
  variant = "default"
}: { 
  options: { id: string; name: string; sub?: string }[]; 
  selectedIds: string[]; 
  onChange: (ids: string[]) => void; 
  placeholder: string;
  icon: any;
  variant?: "default" | "compact";
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => 
    options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.sub?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id))
  , [options, search]);

  const toggle = (id: string) => {
    const newIds = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id];
    onChange(newIds);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white border border-slate-200 rounded-xl flex flex-wrap gap-1.5 cursor-pointer hover:border-indigo-400 hover:ring-2 hover:ring-indigo-50 transition-all min-h-[46px] ${variant === 'compact' ? 'p-2' : 'p-3'}`}
      >
        {selectedIds.length === 0 ? (
          <span className="text-slate-300 text-[11px] font-bold flex items-center gap-1.5 py-1">
            <Icon className="w-3.5 h-3.5" /> {placeholder}
          </span>
        ) : (
          selectedIds.map(id => {
            const opt = options.find(o => o.id === id);
            return (
              <span key={id} className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm">
                {opt?.name}
                <X className="w-3 h-3 hover:text-rose-200" onClick={(e) => { e.stopPropagation(); toggle(id); }} />
              </span>
            );
          })
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[200] p-3 animate-in fade-in zoom-in-95">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus
              type="text"
              className="w-full bg-slate-50 border-none rounded-lg py-1.5 pl-8 pr-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-0.5">
            {filtered.map(opt => (
              <button
                key={opt.id}
                onClick={() => toggle(opt.id)}
                className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between group ${
                  selectedIds.includes(opt.id) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                   <p className="text-[11px] font-bold">{opt.name}</p>
                   {opt.sub && <p className={`text-[9px] font-medium ${selectedIds.includes(opt.id) ? 'text-indigo-200' : 'text-slate-400'}`}>{opt.sub}</p>}
                </div>
                {selectedIds.includes(opt.id) && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center py-4 text-[10px] text-slate-400 italic">未找到匹配项</p>}
          </div>
        </div>
      )}
    </div>
  );
};

// 工序派工用：搜索框下带工序分类标签，默认当前工序
const SearchableMultiSelectWithProcessTabs = ({
  options,
  processNodes,
  currentNodeId,
  selectedIds,
  onChange,
  placeholder,
  icon: Icon,
  variant = 'default'
}: {
  options: { id: string; name: string; sub?: string; assignedMilestoneIds?: string[] }[];
  processNodes: GlobalNodeTemplate[];
  currentNodeId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  icon: any;
  variant?: 'default' | 'compact';
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>(currentNodeId);
  const containerRef = useRef<HTMLDivElement>(null);

  /** 仅显示数量不为 0 的标签：全部、未分配（有则显示）、各工序（有则显示） */
  const UNASSIGNED_TAB = 'UNASSIGNED';
  const visibleProcessNodes = useMemo(
    () => processNodes.filter(n => options.filter(o => o.assignedMilestoneIds?.includes(n.id)).length > 0),
    [processNodes, options]
  );
  const unassignedCount = useMemo(
    () => options.filter(o => !o.assignedMilestoneIds?.length).length,
    [options]
  );

  /** 先按当前标签分类筛选工人/设备，再按搜索关键词筛选 */
  const filteredByTab = useMemo(() => {
    if (activeTab === 'all') return options;
    if (activeTab === UNASSIGNED_TAB) return options.filter(o => !o.assignedMilestoneIds?.length);
    return options.filter(o => o.assignedMilestoneIds?.includes(activeTab));
  }, [options, activeTab]);

  const filtered = useMemo(() =>
    filteredByTab.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.sub?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id))
  , [filteredByTab, search]);

  const toggle = (id: string) => {
    const newIds = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id];
    onChange(newIds);
  };

  useEffect(() => {
    setActiveTab(currentNodeId);
  }, [currentNodeId]);

  useEffect(() => {
    if (activeTab === 'all' || activeTab === UNASSIGNED_TAB) return;
    if (!visibleProcessNodes.some(n => n.id === activeTab)) {
      setActiveTab(visibleProcessNodes.some(n => n.id === currentNodeId) ? currentNodeId : 'all');
    }
  }, [activeTab, visibleProcessNodes, currentNodeId]);

  /** 打开下拉时默认选当前工序（如横机）；若当前工序数量为 0 则选全部 */
  useEffect(() => {
    if (isOpen) {
      const currentInList = visibleProcessNodes.some(n => n.id === currentNodeId);
      setActiveTab(currentInList ? currentNodeId : 'all');
    }
  }, [isOpen, currentNodeId, visibleProcessNodes]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white border border-slate-200 rounded-xl flex flex-wrap gap-1.5 cursor-pointer hover:border-indigo-400 hover:ring-2 hover:ring-indigo-50 transition-all min-h-[46px] ${variant === 'compact' ? 'p-2' : 'p-3'}`}
      >
        {selectedIds.length === 0 ? (
          <span className="text-slate-300 text-[11px] font-bold flex items-center gap-1.5 py-1">
            <Icon className="w-3.5 h-3.5" /> {placeholder}
          </span>
        ) : (
          selectedIds.map(id => {
            const opt = options.find(o => o.id === id);
            return (
              <span key={id} className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm">
                {opt?.name}
                <X className="w-3 h-3 hover:text-rose-200" onClick={(e) => { e.stopPropagation(); toggle(id); }} />
              </span>
            );
          })
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[200] p-3 animate-in fade-in zoom-in-95">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus
              type="text"
              className="w-full bg-slate-50 border-none rounded-lg py-1.5 pl-8 pr-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            >
              全部
            </button>
            {unassignedCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab(UNASSIGNED_TAB)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === UNASSIGNED_TAB ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                未分配 ({unassignedCount})
              </button>
            )}
            {visibleProcessNodes.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveTab(n.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === n.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                {n.name} ({options.filter(o => o.assignedMilestoneIds?.includes(n.id)).length})
              </button>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-0.5">
            {filtered.map(opt => (
              <button
                key={opt.id}
                onClick={() => toggle(opt.id)}
                className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between group ${
                  selectedIds.includes(opt.id) ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                   <p className="text-[11px] font-bold">{opt.name}</p>
                   {opt.sub && <p className={`text-[9px] font-medium ${selectedIds.includes(opt.id) ? 'text-indigo-200' : 'text-slate-400'}`}>{opt.sub}</p>}
                </div>
                {selectedIds.includes(opt.id) && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center py-4 text-[10px] text-slate-400 italic">未找到匹配项</p>}
          </div>
        </div>
      )}
    </div>
  );
};

/** 计划树根 id → 根及所有子孙计划 id（与后端批次码子树一致） */
function collectSubtreePlanIdsForPlan(rootId: string, allPlans: PlanOrder[]): string[] {
  const childrenMap = new Map<string, PlanOrder[]>();
  for (const p of allPlans) {
    if (!p.parentPlanId) continue;
    if (!childrenMap.has(p.parentPlanId)) childrenMap.set(p.parentPlanId, []);
    childrenMap.get(p.parentPlanId)!.push(p);
  }
  const out: string[] = [];
  let frontier: string[] = [rootId];
  while (frontier.length > 0) {
    out.push(...frontier);
    const next: string[] = [];
    for (const id of frontier) {
      const ch = childrenMap.get(id);
      if (ch) next.push(...ch.map(c => c.id));
    }
    frontier = next;
  }
  return out;
}

type TraceGenMode = null | 'item' | 'batch' | 'batchWithItems';

const PlanOrderListView: React.FC<PlanOrderListViewProps> = ({ productionLinkMode = 'order', plans, products, categories, dictionaries, workers, equipment, globalNodes, boms, partners, partnerCategories = [], psiRecords = [], planFormSettings, onUpdatePlanFormSettings, printTemplates, onUpdatePrintTemplates, onRefreshPrintTemplates, orders = [], onCreatePlan, onSplitPlan, onConvertToOrder, onDeletePlan, onUpdateProduct, onUpdatePlan, onAddPSIRecord, onAddPSIRecordBatch, onCreateSubPlan, onCreateSubPlans }) => {
  const [showModal, setShowModal] = useState(false);
  const [viewDetailPlanId, setViewDetailPlanId] = useState<string | null>(null);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [viewProductBomSkuId, setViewProductBomSkuId] = useState<string | null>(null);
  const [tempAssignments, setTempAssignments] = useState<Record<string, NodeAssignment>>({});
  const [tempPlanInfo, setTempPlanInfo] = useState<{
    customer: string;
    dueDate: string;
    createdAt: string;
    items: PlanItem[];
    customData?: Record<string, any>;
  }>({ customer: '', dueDate: '', createdAt: '', items: [] });
  
  const [isSaving, setIsSaving] = useState(false);
  const [tempNodeRates, setTempNodeRates] = useState<Record<string, number>>({});
  const [showPlanFormConfigModal, setShowPlanFormConfigModal] = useState(false);
  const [planPrintPickerOpen, setPlanPrintPickerOpen] = useState(false);
  const [planPrintPickerPlan, setPlanPrintPickerPlan] = useState<PlanOrder | null>(null);
  const [planListPrintRun, setPlanListPrintRun] = useState<{ template: PrintTemplate; plan: PlanOrder } | null>(null);
  const [splitPlanId, setSplitPlanId] = useState<string | null>(null);
  /** 点击图片查看大图：url 为要放大的图片地址 */
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');
  const [itemCodes, setItemCodes] = useState<ItemCode[]>([]);
  const [itemCodesTotal, setItemCodesTotal] = useState(0);
  const [itemCodesPage, setItemCodesPage] = useState(1);
  const [itemCodesLoading, setItemCodesLoading] = useState(false);
  const [itemCodesGenerating, setItemCodesGenerating] = useState(false);
  const [itemCodesVariantFilter, setItemCodesVariantFilter] = useState<string>('');
  /** 详情内「打印单品码」弹窗 */
  const [itemCodePrintOpen, setItemCodePrintOpen] = useState(false);
  const [itemCodePrintPlan, setItemCodePrintPlan] = useState<PlanOrder | null>(null);
  const [itemCodePrintCodes, setItemCodePrintCodes] = useState<ItemCode[]>([]);
  const [itemCodePrintSelectedIds, setItemCodePrintSelectedIds] = useState<Set<string>>(new Set());
  const [itemCodePrintLoading, setItemCodePrintLoading] = useState(false);
  const [virtualBatches, setVirtualBatches] = useState<PlanVirtualBatch[]>([]);
  /** 子树内全部批次码，用于计算「最多还可生成」（与后端占用汇总一致） */
  const [virtualBatchesSubtree, setVirtualBatchesSubtree] = useState<PlanVirtualBatch[]>([]);
  const [virtualBatchesLoading, setVirtualBatchesLoading] = useState(false);
  const [vbCreating, setVbCreating] = useState(false);
  const [vbBulkBatchSize, setVbBulkBatchSize] = useState<string>('');
  const [vbBulkSplitting, setVbBulkSplitting] = useState(false);
  const [vbVariantId, setVbVariantId] = useState<string>('');
  const [vbQuantity, setVbQuantity] = useState<string>('');
  /** 追溯码：先选生成类型，再展示对应表单（单品码 / 批次码 / 单品码+批次码） */
  const [traceGenMode, setTraceGenMode] = useState<TraceGenMode>(null);
  /** 单品码列表按批次筛选（从批次表点击单品码数时设置） */
  const [itemCodesBatchFilter, setItemCodesBatchFilter] = useState<string>('');
  const [batchPrintModal, setBatchPrintModal] = useState<{ plan: PlanOrder; batch: PlanVirtualBatch } | null>(null);
  const sectionTraceRef = useRef<HTMLDivElement>(null);
  const traceItemListRef = useRef<HTMLDivElement>(null);
  const traceBatchListRef = useRef<HTMLDivElement>(null);
  /** 计划详情页内锚点：点击小标签滚动到对应类目 */
  const sectionBasicRef = useRef<HTMLDivElement>(null);
  const sectionQtyRef = useRef<HTMLDivElement>(null);
  const sectionProcessRef = useRef<HTMLDivElement>(null);
  const sectionMaterialRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  useEffect(() => {
    setViewProductBomSkuId(null);
  }, [viewProductId]);

  /** 切换计划时清空计划用量（避免跨计划数据混杂） */
  useEffect(() => {
    if (!viewDetailPlanId) setPlannedQtyByKey({});
  }, [viewDetailPlanId]);

  // 分组后的采购单状态
  const [proposedOrders, setProposedOrders] = useState<ProposedOrder[]>([]);
  const [isProcessingPO, setIsProcessingPO] = useState(false);
  /** 计划用量：物料行 (materialId-nodeId-parentProductId) -> 用户输入的计划用量；null 表示用户已清空 */
  const [plannedQtyByKey, setPlannedQtyByKey] = useState<Record<string, number | null>>({});
  /** 点击「已生成采购单」时展示该物料关联的采购订单列表，值为 materialId */
  const [relatedPOsMaterialId, setRelatedPOsMaterialId] = useState<string | null>(null);

  const viewPlan = plans.find(p => p.id === viewDetailPlanId);
  const viewProduct = products.find(p => p.id === viewPlan?.productId);
  /** 子工单详情页物料状态同步父工单：用于 relatedPOsByMaterial、subPlan 判断等 */
  const parentPlan = viewPlan?.parentPlanId ? plans.find(p => p.id === viewPlan.parentPlanId) : null;
  const effectivePlanForMaterial = parentPlan || viewPlan;

  /** 当前计划及其所有祖先的计划单号（用于采购单关联：子工单创建的 PO 用 viewPlan 单号，需同时匹配本计划及父级） */
  const planNumbersForPO = useMemo(() => {
    if (!viewPlan) return [];
    const nums: string[] = [viewPlan.planNumber];
    let p: PlanOrder | undefined = viewPlan;
    while (p?.parentPlanId) {
      const parent = plans.find(x => x.id === p!.parentPlanId);
      if (parent) { nums.push(parent.planNumber); p = parent; } else break;
    }
    return nums;
  }, [viewPlan, plans]);

  /** 与后端一致：子树内计划量 − 子树内有效批次占用 = 本次最多可填 */
  const vbQuotaInfo = useMemo(() => {
    if (!viewPlan || !viewProduct) return null;
    const vKey = (v: string | null | undefined) => v ?? '';
    if (viewProduct.variants.length > 0 && !vbVariantId) {
      return { kind: 'needVariant' as const };
    }
    const effVariant: string | null = viewProduct.variants.length > 0 ? vbVariantId : null;
    const subtree = collectSubtreePlanIdsForPlan(viewPlan.id, plans);
    const productId = viewPlan.productId;
    let maxFromPlan = 0;
    for (const pid of subtree) {
      const p = plans.find(pl => pl.id === pid);
      if (!p || p.productId !== productId) continue;
      for (const it of p.items || []) {
        if (vKey(it.variantId) === vKey(effVariant)) {
          maxFromPlan += Math.floor(Number(it.quantity));
        }
      }
    }
    let allocated = 0;
    for (const b of virtualBatchesSubtree) {
      if (b.status !== 'ACTIVE') continue;
      if (b.productId !== productId) continue;
      if (!subtree.includes(b.planOrderId)) continue;
      if (vKey(b.variantId) !== vKey(effVariant)) continue;
      allocated += b.quantity;
    }
    const remaining = Math.max(0, maxFromPlan - allocated);
    return { kind: 'ok' as const, maxFromPlan, allocated, remaining };
  }, [viewPlan, viewProduct, vbVariantId, plans, virtualBatchesSubtree]);

  /** 全规格剩余可拆件数合计（与批量拆满逻辑一致，用于禁用/提示） */
  const vbBulkAllSummary = useMemo(() => {
    if (!viewPlan || !viewProduct) return null;
    const vKey = (v: string | null | undefined) => v ?? '';
    const subtree = collectSubtreePlanIdsForPlan(viewPlan.id, plans);
    const productId = viewPlan.productId;
    const variantKeys = new Set<string>();
    for (const pid of subtree) {
      const p = plans.find(pl => pl.id === pid);
      if (!p || p.productId !== productId) continue;
      for (const it of p.items || []) {
        variantKeys.add(vKey(it.variantId));
      }
    }
    if (variantKeys.size === 0) {
      return { totalRemaining: 0, variantCount: 0 };
    }
    let totalRemaining = 0;
    for (const vk of variantKeys) {
      let maxFromPlan = 0;
      for (const pid of subtree) {
        const p = plans.find(pl => pl.id === pid);
        if (!p || p.productId !== productId) continue;
        for (const it of p.items || []) {
          if (vKey(it.variantId) === vk) maxFromPlan += Math.floor(Number(it.quantity));
        }
      }
      let allocated = 0;
      for (const b of virtualBatchesSubtree) {
        if (b.status !== 'ACTIVE') continue;
        if (b.productId !== productId) continue;
        if (!subtree.includes(b.planOrderId)) continue;
        if (vKey(b.variantId) !== vk) continue;
        allocated += b.quantity;
      }
      totalRemaining += Math.max(0, maxFromPlan - allocated);
    }
    return { totalRemaining, variantCount: variantKeys.size };
  }, [viewPlan, viewProduct, plans, virtualBatchesSubtree]);

  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  // 本计划已生成过采购订单的物料 ID（用于用料清单行标识）；匹配当前计划及所有祖先的 PO
  const materialIdsWithPO = useMemo(() => {
    if (!planNumbersForPO.length || !psiRecords?.length) return new Set<string>();
    const ids = new Set<string>();
    psiRecords.forEach((r: any) => {
      if (r.type !== 'PURCHASE_ORDER' || !r.note || !r.productId) return;
      if (planNumbersForPO.some(planNum => String(r.note).includes(`计划单[${planNum}]`))) ids.add(r.productId);
    });
    return ids;
  }, [planNumbersForPO, psiRecords]);

  // 本计划下各物料对应的采购订单记录（用于点击「已生成采购单」查看）；匹配当前计划及所有祖先的 PO
  const relatedPOsByMaterial = useMemo(() => {
    if (!planNumbersForPO.length || !psiRecords?.length) return {} as Record<string, any[]>;
    const map: Record<string, any[]> = {};
    psiRecords.forEach((r: any) => {
      if (r.type !== 'PURCHASE_ORDER' || !r.note || !r.productId) return;
      if (planNumbersForPO.some(planNum => String(r.note).includes(`计划单[${planNum}]`))) {
        if (!map[r.productId]) map[r.productId] = [];
        map[r.productId].push(r);
      }
    });
    return map;
  }, [planNumbersForPO, psiRecords]);

  // 采购订单已入库数量（按 sourceOrderNumber::sourceLineId 汇总）
  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    (psiRecords || []).filter((r: any) => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId).forEach((r: any) => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
    });
    return map;
  }, [psiRecords]);

  const getInboundProgress = (materialId: string): { received: number; ordered: number } | null => {
    const list = relatedPOsByMaterial[materialId];
    if (!list?.length) return null;
    let ordered = 0;
    let received = 0;
    list.forEach((r: any) => {
      ordered += r.quantity ?? 0;
      received += receivedByOrderLine[`${r.docNumber}::${r.id}`] ?? 0;
    });
    return { received, ordered };
  };

  useEffect(() => {
    if (viewProduct) {
      setTempNodeRates(viewProduct.nodeRates ? { ...viewProduct.nodeRates } : {});
    } else {
      setTempNodeRates({});
    }
  }, [viewProduct?.id]);

  // 用料清单汇总逻辑：多级 BOM 递归
  // 理论总需量：一级=生产计划数量×BOM；二级+=父件计划用量×BOM（毛条依全毛黑色计划用量，羊毛依毛条计划用量）
  // 计划用量：默认=缺料数（理论总需量−库存）；当父件有子计划时 getEffectiveQty 使用子计划数量
  /** 在 viewPlan 的子树中递归查找某物料的子计划 */
  const findSubPlanForMaterial = (materialId: string, nodeId: string, rootPlanId: string): PlanOrder | null => {
    const queue: string[] = [rootPlanId];
    while (queue.length > 0) {
      const pid = queue.shift()!;
      const child = plans.find((p: PlanOrder) => p.parentPlanId === pid && p.productId === materialId && (p.bomNodeId || '') === (nodeId || ''));
      if (child) return child;
      plans.filter((p: PlanOrder) => p.parentPlanId === pid).forEach((p: PlanOrder) => queue.push(p.id));
    }
    return null;
  };
  const getEffectiveQty = (materialId: string, nodeId: string, fallback: number): number => {
    if (!viewPlan) return fallback;
    const subPlan = findSubPlanForMaterial(materialId, nodeId, viewPlan.id);
    const subQty = subPlan?.items?.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0) ?? 0;
    if (subPlan && subQty > 0) return subQty;
    return fallback;
  };
  const materialRequirements = useMemo(() => {
    if (!viewPlan || !viewProduct || !tempPlanInfo.items) return [];
    type ReqEntry = { materialId: string; nodeId: string; quantity: number; level: number; parentProductId?: string };
    const reqMap: Record<string, ReqEntry> = {};
    const shortageDrivenList: { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }[] = [];

    const addToReqMap = (productId: string, quantity: number, nodeId: string, visited: Set<string>, level: number, parentProductId?: string) => {
      if (quantity <= 0) return;
      if (visited.has(productId)) return;
      const key = `${productId}-${nodeId}`;
      if (!reqMap[key]) reqMap[key] = { materialId: productId, nodeId, quantity: 0, level, parentProductId };
      reqMap[key].quantity += quantity;
      if (level > (reqMap[key].level ?? 0)) reqMap[key].level = level;
      if (parentProductId) reqMap[key].parentProductId = parentProductId;

      const subBom = boms.find(b => b.parentProductId === productId);
      if (!subBom || !subBom.items.length) return;
      visited.add(productId);
      subBom.items.forEach((bomItem: { productId: string; quantity: number }) => {
        shortageDrivenList.push({ productId: bomItem.productId, nodeId, parentProductId: productId, unitPerParent: Number(bomItem.quantity) || 0 });
      });
      visited.delete(productId);
    };

    const stockIndex = new Map<string, number>();
    if (psiRecords && psiRecords.length > 0) {
      for (const r of psiRecords) {
        const pid = r.productId;
        if (!pid) continue;
        const prev = stockIndex.get(pid) || 0;
        if (r.type === 'PURCHASE_BILL') stockIndex.set(pid, prev + (Number(r.quantity) || 0));
        else if (r.type === 'SALES_BILL') stockIndex.set(pid, prev - (Number(r.quantity) || 0));
        else if (r.type === 'STOCKTAKE') stockIndex.set(pid, prev + (Number(r.diffQuantity) || 0));
      }
    }
    const getRealStock = (materialId: string) => stockIndex.get(materialId) || 0;
    
    tempPlanInfo.items.forEach((item: PlanItem) => {
      const planQty = Number(item.quantity) || 0;
      if (planQty <= 0) return;
      const variantId = item.variantId || `single-${viewProduct.id}`;
      const variantBoms = boms.filter(b => b.parentProductId === viewProduct.id && b.variantId === variantId && b.nodeId);
      variantBoms.forEach(bom => {
        if (bom.nodeId) {
          bom.items.forEach((bomItem: { productId: string; quantity: number }) => {
            addToReqMap(bomItem.productId, Number(bomItem.quantity) * planQty, bom.nodeId!, new Set(), 1);
          });
        }
      });
    });

    type Row = { rowKey: string; materialId: string; materialName: string; materialSku: string; nodeName: string; nodeId: string; totalNeeded: number; stock: number; shortage: number; level: number; parentProductId?: string; parentMaterialName?: string; plannedQty: number };
    const list: Row[] = [];
    Object.values(reqMap).forEach(req => {
      const material = products.find(p => p.id === req.materialId);
      const node = globalNodes.find(n => n.id === req.nodeId);
      const stock = getRealStock(req.materialId);
      const totalNeeded = req.quantity;
      const shortage = Math.max(0, totalNeeded - stock);
      const parentId = req.parentProductId ?? viewProduct.id;
      const rowKey = `${req.materialId}-${req.nodeId}-${parentId}`;
      const plannedQty = getEffectiveQty(req.materialId, req.nodeId, plannedQtyByKey[rowKey] !== undefined ? (plannedQtyByKey[rowKey] ?? 0) : shortage);
      list.push({
        rowKey,
        materialId: req.materialId,
        materialName: material?.name || '未知物料',
        materialSku: material?.sku || '-',
        nodeName: node?.name || '未知工序',
        nodeId: req.nodeId,
        totalNeeded,
        stock,
        shortage,
        level: req.level,
        parentProductId: req.parentProductId,
        plannedQty
      });
    });

    const aggregatePending = (items: { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }[]) => {
      const map: Record<string, { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }> = {};
      items.forEach(({ productId, nodeId, parentProductId, unitPerParent }) => {
        const k = `${productId}-${nodeId}-${parentProductId}`;
        if (!map[k]) map[k] = { productId, nodeId, parentProductId, unitPerParent };
      });
      return Object.values(map);
    };
    let pending = aggregatePending(shortageDrivenList);
    let currentLevel = 2;
    while (pending.length > 0) {
      const nextPending: { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }[] = [];
      pending.forEach(({ productId, nodeId, parentProductId, unitPerParent }) => {
        const parentRow = list.find(r => r.materialId === parentProductId && r.nodeId === nodeId);
        const parentFallback = parentRow ? (plannedQtyByKey[parentRow.rowKey] !== undefined ? (plannedQtyByKey[parentRow.rowKey] ?? 0) : parentRow.shortage) : 0;
        const parentPlannedQty = parentRow ? getEffectiveQty(parentProductId, nodeId, parentFallback) : 0;
        const totalNeeded = parentPlannedQty * unitPerParent;
        const material = products.find(p => p.id === productId);
        const node = globalNodes.find(n => n.id === nodeId);
        const stock = getRealStock(productId);
        const shortage = Math.max(0, totalNeeded - stock);
        const rowKey = `${productId}-${nodeId}-${parentProductId}`;
        const plannedQty = plannedQtyByKey[rowKey] !== undefined ? (plannedQtyByKey[rowKey] ?? 0) : shortage;
        list.push({
          rowKey,
          materialId: productId,
          materialName: material?.name || '未知物料',
          materialSku: material?.sku || '-',
          nodeName: node?.name || '未知工序',
          nodeId,
          totalNeeded,
          stock,
          shortage,
          level: currentLevel,
          parentProductId,
          plannedQty
        });
        const subBom = boms.find(b => b.parentProductId === productId);
        if (subBom?.items?.length) subBom.items.forEach((bomItem: { productId: string; quantity: number }) => nextPending.push({ productId: bomItem.productId, nodeId, parentProductId: productId, unitPerParent: Number(bomItem.quantity) || 0 }));
      });
      pending = aggregatePending(nextPending);
      currentLevel++;
    }

    const level1Rows = list.filter(r => r.level === 1);
    const appendSubtree = (out: Row[], parentId: string, nid: string) => {
      list.filter(r => r.parentProductId === parentId && r.nodeId === nid).forEach(c => { out.push(c); appendSubtree(out, c.materialId, c.nodeId); });
    };
    const sorted: Row[] = [];
    level1Rows.forEach(p => { sorted.push(p); appendSubtree(sorted, p.materialId, p.nodeId); });
    sorted.push(...list.filter(r => !sorted.includes(r)));

    return sorted.map(r => ({
      ...r,
      parentMaterialName: r.parentProductId ? (products.find(p => p.id === r.parentProductId)?.name) : undefined
    }));
  }, [viewPlan, viewProduct, tempPlanInfo.items, boms, products, globalNodes, plannedQtyByKey, plans, effectivePlanForMaterial, psiRecords]);

  /** 创建子工单按钮：仅与需生成计划单的物料相关；当所有可生产物料均已生成子计划时禁用 */
  const hasProducibleNeedingSubPlan = (materialRequirements as any[]).some((r: any) => {
    const p = products.find(px => px.id === r.materialId);
    const isProducible = (p?.milestoneNodeIds?.length ?? 0) > 0;
    if (!isProducible || (r.plannedQty ?? 0) <= 0) return false;
    const existing = viewPlan ? findSubPlanForMaterial(r.materialId, r.nodeId, viewPlan.id) : null;
    return !existing;
  });

  /** 创建子工单（仅可生产物料，按计划用量；已存在的会更新数量，未存在的会新建；按 BOM 层级建立父子关系） */
  const handleCreateSubPlansFromPlannedQty = () => {
    if (!viewPlan || (!onCreateSubPlan && !onCreateSubPlans)) return;
    const producible = (materialRequirements as any[]).filter((r: any) => {
      const p = products.find(px => px.id === r.materialId);
      return (p?.milestoneNodeIds?.length ?? 0) > 0 && r.plannedQty > 0;
    });
    if (producible.length === 0) {
      toast.warning("请先填写可生产物料的计划用量（有工序路线的物料）。");
      return;
    }
    const existingByProductNode = new Map<string, PlanOrder>();
    const addExistingRecursive = (planId: string) => {
      plans.filter((p: PlanOrder) => p.parentPlanId === planId).forEach((p: PlanOrder) => {
        existingByProductNode.set(`${p.productId}-${p.bomNodeId || ''}`, p);
        addExistingRecursive(p.id);
      });
    };
    addExistingRecursive(viewPlan.id);
    const toUpdate: { req: any; existing: PlanOrder }[] = [];
    const toCreate: any[] = [];
    producible.forEach((r: any) => {
      const qty = Math.max(0, Number(r.plannedQty) || 0);
      if (qty <= 0) return;
      const existing = existingByProductNode.get(`${r.materialId}-${r.nodeId || ''}`);
      if (existing) {
        toUpdate.push({ req: r, existing });
      } else {
        toCreate.push(r);
      }
    });
    toUpdate.forEach(({ req, existing }) => {
      onUpdatePlan?.(existing.id, { items: [{ variantId: products.find(p => p.id === req.materialId)?.variants?.[0]?.id, quantity: Math.max(0, Number(req.plannedQty) || 0) }] });
    });
    if (toCreate.length > 0) {
      if (onCreateSubPlans) {
        const sorted = [...toCreate].sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
        onCreateSubPlans({
          planId: viewPlan.id,
          items: sorted.map((r: any) => {
            const parentRow = r.parentProductId ? (materialRequirements as any[]).find((x: any) => x.materialId === r.parentProductId) : null;
            return {
              productId: r.materialId,
              quantity: Math.max(0, Number(r.plannedQty) || 0),
              bomNodeId: r.nodeId,
              parentProductId: r.parentProductId,
              parentNodeId: r.parentProductId ? (parentRow?.nodeId ?? r.nodeId) : undefined
            };
          })
        });
      } else {
        toCreate.forEach((r: any) => {
          onCreateSubPlan?.({ productId: r.materialId, quantity: Math.max(0, Number(r.plannedQty) || 0), planId: viewPlan.id, bomNodeId: r.nodeId });
        });
      }
    }
    toast.success(`已创建/更新 ${toUpdate.length + toCreate.length} 条子计划单。`);
  };

  // --- 采购单生成逻辑：按计划用量，仅当全部缺料物料已填计划用量时可用；已创建过则不允许再次创建 ---
  const hasSubBom = (materialId: string) => boms.some(b => b.parentProductId === materialId);
  const leafMaterials = (materialRequirements as any[]).filter((m: any) => !hasSubBom(m.materialId));
  const leafWithShortage = leafMaterials.filter((m: any) => m.shortage > 0);
  const allPlannedFilled = leafWithShortage.every((m: any) => (m.plannedQty ?? 0) > 0);
  const hasExistingPOs = Object.keys(relatedPOsByMaterial).length > 0;
  const canGeneratePO = leafWithShortage.length > 0 && allPlannedFilled && proposedOrders.length === 0 && !hasExistingPOs;

  const handleGenerateProposedOrders = () => {
    if (!canGeneratePO) {
      if (hasExistingPOs) toast.warning("采购订单已创建，不可重复创建。");
      else if (leafWithShortage.length === 0) toast.info("当前库存充裕，无需生成额外采购单。");
      else if (!allPlannedFilled) toast.warning("请先为所有缺料物料填写计划用量。");
      return;
    }

    if (partners.length === 0) {
      toast.error("未找到系统定义的单位，请先在基本信息中创建供应商。");
      return;
    }

    const groupedMap: Record<string, ProposedOrder> = {};
    // 统一按 PO-{供应商代码}-{序号} 规则生成单号
    const getNextSeqForPartner = (partnerId: string, partnerName: string) => {
      const partnerCode = (partnerId || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
      const existingForPartner = (psiRecords || []).filter((r: any) =>
        r.type === 'PURCHASE_ORDER' && (r.partnerId === partnerId || r.partner === partnerName)
      );
      const seqNums = existingForPartner.map((r: any) => {
        const m = r.docNumber?.match(new RegExp(`PO-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
        return m ? parseInt(m[1], 10) : 0;
      });
      const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
      return { partnerCode, nextSeq };
    };

    leafWithShortage.forEach((item: any, index: number) => {
      const materialProduct = products.find(p => p.id === item.materialId);
      const supplierId = materialProduct?.supplierId;
      const supplier = (supplierId && partners.find(p => p.id === supplierId)) || partners[0];
      if (!supplier) return;
      if (!groupedMap[supplier.id]) {
        const { partnerCode, nextSeq } = getNextSeqForPartner(supplier.id, supplier.name);
        groupedMap[supplier.id] = { orderNumber: `PO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`, partnerId: supplier.id, partnerName: supplier.name, items: [] };
      }
      const qtyRounded = Math.round(Number(item.plannedQty ?? item.shortage) * 100) / 100;
      groupedMap[supplier.id].items.push({
        id: `item-${Date.now()}-${item.materialId}-${index}`,
        productId: item.materialId,
        materialName: item.materialName,
        materialSku: item.materialSku,
        quantity: qtyRounded,
        suggestedQty: qtyRounded,
        nodeName: item.nodeName
      });
    });

    setProposedOrders(Object.values(groupedMap));
  };

  const handleConfirmAndSaveOrders = async () => {
    if (!onAddPSIRecord) return;
    setIsProcessingPO(true);

    try {
        // 保存前确保单据号唯一：若与已有采购订单撞号（如手动新建过同号），则重新生成，避免 onAddPSIRecord 追加导致明细混在一起
        const existingDocNumbers = new Set(
          (psiRecords || []).filter((r: any) => r.type === 'PURCHASE_ORDER' && r.docNumber).map((r: any) => r.docNumber)
        );
        const getNextSeqForPartner = (partnerId: string, partnerName: string) => {
          const partnerCode = (partnerId || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
          const existingForPartner = (psiRecords || []).filter((r: any) =>
            r.type === 'PURCHASE_ORDER' && (r.partnerId === partnerId || r.partner === partnerName)
          );
          const seqNums = existingForPartner.map((r: any) => {
            const m = r.docNumber?.match(new RegExp(`PO-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
            return m ? parseInt(m[1], 10) : 0;
          });
          let nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
          let cand = `PO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
          while (existingDocNumbers.has(cand)) {
            nextSeq++;
            cand = `PO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
          }
          existingDocNumbers.add(cand);
          return cand;
        };

        const allRecs: any[] = [];
        const baseId = Date.now();
        proposedOrders.forEach((order, oi) => {
            const docNum = existingDocNumbers.has(order.orderNumber)
              ? getNextSeqForPartner(order.partnerId, order.partnerName)
              : order.orderNumber;
            existingDocNumbers.add(docNum);
            order.items.forEach((item, ii) => {
                const qty = item.quantity ?? 0;
                if (qty <= 0) return;
                const prod = products.find(p => p.id === item.productId);
                const purchasePrice = prod?.purchasePrice ?? 0;
                allRecs.push({
                    id: `psi-po-${baseId}-${oi}-${ii}`,
                    docNumber: docNum, 
                    type: 'PURCHASE_ORDER',
                    productId: item.productId,
                    quantity: qty,
                    purchasePrice,
                    partner: order.partnerName,
                    partnerId: order.partnerId,
                    warehouseId: 'wh-1',
                    note: `计划单[${viewPlan?.planNumber}]补货需求 | 针对工序:${item.nodeName}`,
                    timestamp: new Date().toISOString(),
                    operator: '系统生成',
            });
        });
        });
        const reversed = allRecs.reverse();
        if (onAddPSIRecordBatch) {
          await onAddPSIRecordBatch(reversed);
        } else {
          for (const r of reversed) await onAddPSIRecord(r);
        }

        setTimeout(() => {
            setIsProcessingPO(false);
            setProposedOrders([]);
            toast.success(`已成功保存 ${proposedOrders.length} 张采购订单，可在进销存模块查看详情。`);
        }, 500);
    } catch (err) {
        setIsProcessingPO(false);
        console.error(err);
    }
  };

  const updateProposedItemQty = (orderNum: string, itemId: string, val: string) => {
    const trimmed = val.trim();
    const qty = trimmed === '' ? undefined : (Number.isFinite(parseFloat(trimmed)) ? Math.round(parseFloat(trimmed) * 100) / 100 : undefined);
    setProposedOrders(prev => prev.map(order => {
        if (order.orderNumber !== orderNum) return order;
        return {
            ...order,
            items: order.items.map(item => item.id === itemId ? { ...item, quantity: qty } : item)
        };
    }));
  };

  const removeProposedOrder = (orderNum: string) => {
    setProposedOrders(prev => prev.filter(o => o.orderNumber !== orderNum));
  };

  const removeProposedOrderItem = (orderNum: string, itemId: string) => {
    setProposedOrders(prev => prev.flatMap(order => {
      if (order.orderNumber !== orderNum) return [order];
      const newItems = order.items.filter(item => item.id !== itemId);
      if (newItems.length === 0) return [];
      return [{ ...order, items: newItems }];
    }));
  };

  useEffect(() => {
    if (viewPlan) {
      setTempAssignments(viewPlan.assignments || {});
      const createdDate = formatPlanCreatedDateList(viewPlan.createdAt || (() => { const m = viewPlan.id.match(/^plan-(\d+)/); return m ? new Date(parseInt(m[1], 10)).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]; })());
      const dueDateOnly = formatPlanDueDateList(viewPlan.dueDate || '');
      setTempPlanInfo({
        customer: viewPlan.customer,
        dueDate: dueDateOnly || viewPlan.dueDate || '',
        createdAt: createdDate,
        items: JSON.parse(JSON.stringify(viewPlan.items || [])),
        customData: viewPlan.customData ? { ...viewPlan.customData } : {}
      });
      setProposedOrders([]); 
    }
  }, [viewPlan]);

  const groupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!viewProduct || !viewProduct.variants) return {};
    const groups: Record<string, ProductVariant[]> = {};
    viewProduct.variants.forEach(v => {
      if (!groups[v.colorId]) groups[v.colorId] = [];
      groups[v.colorId].push(v);
    });
    return groups;
  }, [viewProduct]);

  const productNodes = useMemo(() => {
    if (!viewProduct || !viewProduct.milestoneNodeIds) return [];
    return viewProduct.milestoneNodeIds
      .map(id => globalNodes.find(gn => gn.id === id))
      .filter((n): n is GlobalNodeTemplate => Boolean(n));
  }, [viewProduct, globalNodes]);


  const handleUpdateDetail = () => {
    if (viewDetailPlanId) {
      setIsSaving(true);
      onUpdatePlan?.(viewDetailPlanId, { 
        assignments: tempAssignments,
        customer: tempPlanInfo.customer,
        dueDate: tempPlanInfo.dueDate,
        createdAt: tempPlanInfo.createdAt,
        items: tempPlanInfo.items,
        customData: tempPlanInfo.customData
      });
      if (viewProduct) {
        const mergedRates: Record<string, number> = { ...(viewProduct.nodeRates || {}) };
        Object.entries(tempNodeRates).forEach(([nodeId, rate]) => {
          const numericRate = typeof rate === 'number' ? rate : parseFloat(String(rate));
          mergedRates[nodeId] = isNaN(numericRate) ? 0 : numericRate;
        });
        onUpdateProduct({ ...viewProduct, nodeRates: mergedRates });
      }
      setTimeout(() => {
        setIsSaving(false);
        setViewDetailPlanId(null);
      }, 300);
    }
  };

  const updateTempAssignment = (nodeId: string, updates: Partial<NodeAssignment>) => {
    setTempAssignments(prev => ({
      ...prev,
      [nodeId]: {
        workerIds: prev[nodeId]?.workerIds || [],
        equipmentIds: prev[nodeId]?.equipmentIds || [],
        ...updates
      }
    }));
  };

  const updateDetailItemQty = (variantId: string | undefined, val: string) => {
    const qty = parseInt(val) || 0;
    setTempPlanInfo(prev => {
      const newItems = prev.items.map(item => {
        if (item.variantId === variantId) return { ...item, quantity: qty };
        return item;
      });
      if (variantId === undefined && newItems.length === 1) {
          newItems[0].quantity = qty;
      }
      return { ...prev, items: newItems };
    });
  };


  const splitPlan = splitPlanId ? plans.find(p => p.id === splitPlanId) ?? null : null;
  const openSplit = (plan: PlanOrder) => {
    setSplitPlanId(plan.id);
  };
  /** 从计划单号解析拆分组：仅当单号形如「原单-1」「原单-2」…「原单-99」时视为拆分单（本系统拆分生成），避免把 PLN-327611 等普通编号误判为拆分组 */
  const getSplitGroupKey = (planNumber: string): string | null => {
    const m = planNumber.match(/^(.+)-([1-9]\d?)$/);
    return m ? m[1] : null;
  };
  /** 多次拆单后的「根单号」：反复去掉末尾 -数字，如 PLN1-1-2 → PLN1-1 → PLN1，保证同一原单的所有拆单归到同一框 */
  const getRootPlanNumber = (planNumber: string): string => {
    let s = planNumber;
    for (;;) {
      const m = s.match(/^(.+)-([1-9]\d?)$/);
      if (!m) return s;
      s = m[1];
    }
  };
  /** 根单号 → 该原单下所有计划单（含多次拆单后的 PLN1-1-1、PLN1-1-2、PLN1-2 等，仅包含至少有 2 条的同组） */
  const rootToPlans = useMemo(() => {
    const map = new Map<string, PlanOrder[]>();
    plans.forEach(p => {
      const root = getRootPlanNumber(p.planNumber);
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(p);
    });
    const multi = new Map<string, PlanOrder[]>();
    map.forEach((arr, root) => { if (arr.length >= 2) multi.set(root, arr); });
    return multi;
  }, [plans]);
  /** 列表排序：最新添加的单据排在前面（按 id 内时间戳倒序），不受拆单分组影响 */
  const sortedPlansForList = useMemo(() => {
    const ts = (p: PlanOrder) => parseInt(p.id.match(/^plan-(\d+)/)?.[1] ?? '0', 10) || 0;
    return [...plans].sort((a, b) => ts(b) - ts(a));
  }, [plans]);

  /** 父子计划分组：父计划 id → 子计划列表 */
  const parentToSubPlans = useMemo(() => {
    const map = new Map<string, PlanOrder[]>();
    plans.filter(p => p.parentPlanId).forEach(p => {
      const pid = p.parentPlanId!;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(p);
    });
    map.forEach(arr => arr.sort((a, b) => (a.planNumber || '').localeCompare(b.planNumber || '')));
    return map;
  }, [plans]);

  const showPlanListPrintButton = planFormSettings.listPrint?.showPrintButton !== false;
  const planListPrintPickerTemplates = useMemo(() => {
    const allowed = planFormSettings.listPrint?.allowedTemplateIds;
    if (!allowed?.length) return printTemplates;
    return printTemplates.filter(t => allowed.includes(t.id));
  }, [printTemplates, planFormSettings.listPrint?.allowedTemplateIds]);

  const idlePlanPrintTemplate = useMemo(() => createBlankCustomTemplate(80, 60, ' '), []);
  const idlePlanPrintCtx = useMemo<PrintRenderContext>(() => ({}), []);

  const planListActivePrintTemplate = planListPrintRun?.template ?? idlePlanPrintTemplate;
  const planListActivePrintCtx: PrintRenderContext = planListPrintRun
    ? {
        plan: planListPrintRun.plan,
        product: products.find(p => p.id === planListPrintRun.plan.productId),
        printListRows: (planListPrintRun.plan as any)._printListRows ?? undefined,
        labelPerRow: (planListPrintRun.plan as any)._labelPerRow ?? undefined,
        virtualBatch: (planListPrintRun.plan as any)._virtualBatch ?? undefined,
      }
    : idlePlanPrintCtx;

  const { printRef: planListPrintRef, handlePrint: handlePlanListPrint } = usePrintTemplateAction(
    planListActivePrintTemplate,
    planListActivePrintCtx,
  );

  useEffect(() => {
    if (!planListPrintRun) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const maybePromise = handlePlanListPrint();
      if (maybePromise && typeof (maybePromise as any).then === 'function') {
        (maybePromise as Promise<void>).finally(() => {
          if (!cancelled) setPlanListPrintRun(null);
        });
      } else {
        setTimeout(() => { if (!cancelled) setPlanListPrintRun(null); }, 1000);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [planListPrintRun, handlePlanListPrint]);

  const openPlanPrintPicker = useCallback(
    (plan: PlanOrder) => {
      if (!planListPrintPickerTemplates.length) {
        toast.error('暂无可用打印模板，请先在「表单配置 → 打印模版」中创建模板');
        return;
      }
      setPlanPrintPickerPlan(plan);
      setPlanPrintPickerOpen(true);
    },
    [planListPrintPickerTemplates],
  );

  const labelPrintPickerTemplates = useMemo(() => {
    const allowed = planFormSettings.labelPrint?.allowedTemplateIds;
    if (!allowed?.length) return printTemplates;
    return printTemplates.filter(t => allowed.includes(t.id));
  }, [printTemplates, planFormSettings.labelPrint?.allowedTemplateIds]);

  const openItemCodePrintPicker = useCallback(
    (plan: PlanOrder, variantFilter: string, batchFilter: string) => {
      if (!labelPrintPickerTemplates.length) {
        toast.error('暂无标签打印模版，请在「表单配置 → 打印模版」中配置标签白名单或取消白名单限制');
        return;
      }
      setItemCodePrintPlan(plan);
      setItemCodePrintOpen(true);
      setItemCodePrintLoading(true);
      const params: Record<string, string | number> = {
        planOrderId: plan.id,
        page: 1,
        pageSize: 500,
        status: 'ACTIVE',
      };
      if (variantFilter) params.variantId = variantFilter;
      if (batchFilter) params.batchId = batchFilter;
      void itemCodesApi
        .list(params as any)
        .then(res => {
          setItemCodePrintCodes(res.items);
          setItemCodePrintSelectedIds(new Set(res.items.map(c => c.id)));
        })
        .catch(() => toast.error('加载单品码失败'))
        .finally(() => setItemCodePrintLoading(false));
    },
    [labelPrintPickerTemplates],
  );

  const loadItemCodes = useCallback(async (planOrderId: string, page = 1, variantFilter = '', batchFilter = '') => {
    setItemCodesLoading(true);
    try {
      const params: any = { planOrderId, page, pageSize: 100, status: 'ACTIVE' };
      if (variantFilter) params.variantId = variantFilter;
      if (batchFilter) params.batchId = batchFilter;
      const res = await itemCodesApi.list(params);
      setItemCodes(res.items);
      setItemCodesTotal(res.total);
      setItemCodesPage(res.page);
    } catch (e: any) {
      toast.error(e.message || '加载单品码失败');
    } finally {
      setItemCodesLoading(false);
    }
  }, []);

  const handleGenerateItemCodes = useCallback(async (planOrderId: string) => {
    setItemCodesGenerating(true);
    try {
      const res = await itemCodesApi.generate(planOrderId);
      if (res.generated === 0) {
        toast.info('单品码已全部生成，无需补充');
      } else {
        const details = res.byVariant
          .filter(v => v.count > 0)
          .map(v => `${v.variantId ? v.variantId : '总量'}: ${v.count}`)
          .join(', ');
        toast.success(`已生成 ${res.generated} 个单品码${details ? `（${details}）` : ''}`);
      }
      await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
    } catch (e: any) {
      toast.error(e.message || '生成单品码失败');
    } finally {
      setItemCodesGenerating(false);
    }
  }, [loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter]);

  const handleVoidItemCode = useCallback(async (codeId: string, planOrderId: string) => {
    try {
      await itemCodesApi.void(codeId);
      toast.success('单品码已作废');
      await loadItemCodes(planOrderId, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter);
    } catch (e: any) {
      toast.error(e.message || '作废失败');
    }
  }, [loadItemCodes, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter]);

  const loadVirtualBatches = useCallback(async (planOrderId: string) => {
    setVirtualBatchesLoading(true);
    try {
      const subtree = collectSubtreePlanIdsForPlan(planOrderId, plans);
      const results = await Promise.all(
        subtree.map(id => planVirtualBatchesApi.list({ planOrderId: id }).then(res => ({ id, items: res.items }))),
      );
      const byId = new Map<string, PlanVirtualBatch>();
      for (const { items } of results) {
        for (const b of items) byId.set(b.id, b);
      }
      setVirtualBatchesSubtree([...byId.values()]);
      setVirtualBatches(results.find(r => r.id === planOrderId)?.items ?? []);
    } catch (e: any) {
      toast.error(e.message || '加载批次码失败');
    } finally {
      setVirtualBatchesLoading(false);
    }
  }, [plans]);

  useEffect(() => {
    if (viewDetailPlanId) {
      void loadItemCodes(viewDetailPlanId);
      void loadVirtualBatches(viewDetailPlanId);
      setItemCodesVariantFilter('');
      setItemCodesBatchFilter('');
      setVbVariantId('');
      setVbQuantity('');
      setVbBulkBatchSize('');
      setTraceGenMode(null);
    } else {
      setItemCodes([]);
      setItemCodesTotal(0);
      setVirtualBatches([]);
      setVirtualBatchesSubtree([]);
    }
  }, [viewDetailPlanId, loadItemCodes, loadVirtualBatches]);

  const handleCreateVirtualBatch = useCallback(
    async (planOrderId: string, productVariants: ProductVariant[]) => {
      const qty = Math.floor(Number(vbQuantity));
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error('请输入有效的批次件数（≥1）');
        return;
      }
      let variantId: string | null = null;
      if (productVariants.length > 0) {
        if (!vbVariantId) {
          toast.error('请选择规格（颜色/尺码）');
          return;
        }
        variantId = vbVariantId;
      }
      setVbCreating(true);
      try {
        const res = await planVirtualBatchesApi.create({
          planOrderId,
          variantId,
          quantity: qty,
          withItemCodes: traceGenMode === 'batchWithItems',
        });
        const ic = res.itemCodesCreated ?? 0;
        toast.success(
          ic > 0 ? `已生成批次码，并生成 ${ic} 个单品码` : '已生成批次码',
        );
        setVbQuantity('');
        await loadVirtualBatches(planOrderId);
        await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
      } catch (e: any) {
        toast.error(e.message || '生成失败');
      } finally {
        setVbCreating(false);
      }
    },
    [vbQuantity, vbVariantId, traceGenMode, loadVirtualBatches, loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  const handleBulkSplitVirtualBatches = useCallback(
    async (planOrderId: string) => {
      const bs = Math.floor(Number(vbBulkBatchSize));
      if (!Number.isFinite(bs) || bs < 1) {
        toast.error('请输入有效的每批件数（≥1）');
        return;
      }
      setVbBulkSplitting(true);
      try {
        const res = await planVirtualBatchesApi.bulkSplitAll({
          planOrderId,
          batchSize: bs,
          withItemCodes: traceGenMode === 'batchWithItems',
        });
        const vCount = res.byVariant.length;
        const totalQty = res.byVariant.reduce((s, x) => s + x.totalQty, 0);
        const ic = res.itemCodesCreated ?? 0;
        toast.success(
          ic > 0
            ? `已生成 ${res.totalCreated} 个批次码（${vCount} 种规格），合计 ${totalQty} 件；同时生成 ${ic} 个单品码`
            : `已生成 ${res.totalCreated} 个批次码（${vCount} 种规格），合计 ${totalQty} 件，每批最多 ${res.batchSize} 件`,
        );
        await loadVirtualBatches(planOrderId);
        await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
      } catch (e: any) {
        toast.error(e.message || '批量拆批失败');
      } finally {
        setVbBulkSplitting(false);
      }
    },
    [vbBulkBatchSize, traceGenMode, loadVirtualBatches, loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  const handleVoidVirtualBatch = useCallback(
    async (id: string, planOrderId: string) => {
      try {
        await planVirtualBatchesApi.void(id);
        toast.success('批次码已作废（关联单品码已同步作废）');
        await loadVirtualBatches(planOrderId);
        await loadItemCodes(planOrderId, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter);
      } catch (e: any) {
        toast.error(e.message || '作废失败');
      }
    },
    [loadVirtualBatches, loadItemCodes, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  /** 递归获取某计划下所有子孙计划（深度优先，用于列表展示），返回 { plan, depth } */
  const getAllDescendantsWithDepth = (planId: string, depth: number): { plan: PlanOrder; depth: number }[] => {
    const direct = parentToSubPlans.get(planId) || [];
    const result: { plan: PlanOrder; depth: number }[] = [];
    direct.forEach(p => {
      result.push({ plan: p, depth });
      result.push(...getAllDescendantsWithDepth(p.id, depth + 1));
    });
    return result;
  };

  /** 是否存在未下达的子计划（用于显示「补充下达子工单」） */
  const hasUnconvertedSubPlans = (planId: string) =>
    getAllDescendantsWithDepth(planId, 1).some(d => d.plan.status !== PlanStatus.CONVERTED);

  /** 列表展示块：单条 或 拆分组 或 父计划+子计划分组 */
  type ListBlock = { type: 'single'; plan: PlanOrder } | { type: 'group'; groupKey: string; plans: PlanOrder[] } | { type: 'parentChild'; parent: PlanOrder; children: PlanOrder[] };
  const listBlocks = useMemo((): ListBlock[] => {
    const blocks: ListBlock[] = [];
    const used = new Set<string>();
    for (const plan of sortedPlansForList) {
      if (used.has(plan.id)) continue;
      if (plan.parentPlanId) continue;
      const root = getRootPlanNumber(plan.planNumber);
      if (rootToPlans.has(root)) {
        const groupPlans = rootToPlans.get(root)!;
        groupPlans.forEach(p => used.add(p.id));
        blocks.push({ type: 'group', groupKey: root, plans: [...groupPlans].sort((a, b) => (a.planNumber || '').localeCompare(b.planNumber || '')) });
      } else {
        const children = parentToSubPlans.get(plan.id) || [];
        if (children.length > 0) {
          used.add(plan.id);
          const allDescendants = getAllDescendantsWithDepth(plan.id, 1).map(d => d.plan);
          allDescendants.forEach(p => used.add(p.id));
          blocks.push({ type: 'parentChild', parent: plan, children });
        } else {
          used.add(plan.id);
          blocks.push({ type: 'single', plan });
        }
      }
    }
    return blocks;
  }, [sortedPlansForList, rootToPlans, parentToSubPlans]);

  return (
    <>
    <HiddenPrintSlot template={planListActivePrintTemplate} ctx={planListActivePrintCtx} printRef={planListPrintRef} />
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>生产计划单</h1>
          <p className={pageSubtitleClass}>从需求预测到生产指令的初步规划</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPlanFormConfigModal(true)}
            className={secondaryToolbarButtonClass}
          >
            <Sliders className="w-4 h-4 shrink-0" /> 表单配置
          </button>
          <button type="button" onClick={() => setShowModal(true)} className={primaryToolbarButtonClass}>
            <Plus className="w-4 h-4 shrink-0" /> 创建生产计划
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
          {plans.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
              <CalendarRange className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">暂无生产计划数据</p>
            </div>
          ) : (
            listBlocks.map((block, blockIdx) => {
              if (block.type === 'single') {
                const plan = block.plan;
              const product = products.find(p => p.id === plan.productId);
              const totalQty = plan.items && Array.isArray(plan.items) ? plan.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : 0;
              const assignedCount = plan.assignments ? Object.values(plan.assignments).filter(a => (a as NodeAssignment).workerIds && (a as NodeAssignment).workerIds.length > 0).length : 0;
                const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                const customListFields = planFormSettings.customFields.filter(f => f.showInList);
                const createdDateRaw = plan.createdAt || (() => { const m = plan.id.match(/^plan-(\d+)/); return m ? new Date(parseInt(m[1], 10)).toISOString().split('T')[0] : ''; })();
                const createdDate = formatPlanCreatedDateList(createdDateRaw);
              return (
                <div key={plan.id} className="bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group flex items-center justify-between">
                  <div className="flex items-center gap-4">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => setImagePreviewUrl(product.imageUrl)} className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none">
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${plan.status === PlanStatus.CONVERTED ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                      {plan.status === PlanStatus.CONVERTED ? <CheckCircle2 className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
                    </div>
                      )}
                    <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{plan.planNumber}</span>
                          {showInList('product') && product && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-lg font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                              {product.name || '未知产品'}
                            </button>
                          )}
                          {product && categories.find(c => c.id === product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                            const val = product.categoryCustomData?.[f.id];
                            if (val == null || val === '') return null;
                            if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                              const isImg = val.startsWith('data:image/');
                              const isPdf = val.startsWith('data:application/pdf');
                              if (isImg) return (
                                <span key={f.id} className="inline-flex items-center gap-1">
                                  <img src={val} alt={f.label} className="h-6 w-6 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('image'); }} />
                                  <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                </span>
                              );
                              if (isPdf) return (
                                <span key={f.id} className="inline-flex items-center gap-1">
                                  <button type="button" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">在线查看</button>
                                  <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                </span>
                              );
                              return (
                                <a key={f.id} href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                              );
                            }
                            return <span key={f.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                          })}
                          {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                      </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                          {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                          {showInList('dueDate') && plan.dueDate && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> 交期: {formatPlanDueDateList(plan.dueDate)}</span>}
                          {showInList('createdAt') && createdDate && <span className="flex items-center gap-1 text-slate-500"><CalendarDays className="w-3 h-3" /> 添加: {createdDate}</span>}
                          {customListFields.map(cf => (plan.customData?.[cf.id] != null && plan.customData?.[cf.id] !== '') && <span key={cf.id} className="flex items-center gap-1">{cf.label}: {String(plan.customData[cf.id])}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setViewDetailPlanId(plan.id)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold transition-all border border-slate-100">
                        <Edit3 className="w-4 h-4" /> 详情
                    </button>
                    {showPlanListPrintButton && (
                      <button
                        type="button"
                        onClick={() => openPlanPrintPicker(plan)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                      >
                        <Printer className="w-4 h-4" /> 打印
                      </button>
                    )}
                    {plan.status !== PlanStatus.CONVERTED ? (
                        <>
                          {(parentToSubPlans.get(plan.id)?.length ?? 0) === 0 && (
                            <button onClick={() => openSplit(plan)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-200">
                              <Split className="w-4 h-4" /> 拆分
                            </button>
                          )}
                      <button onClick={() => onConvertToOrder(plan.id)} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-black transition-all flex items-center gap-2">
                          <ArrowRightCircle className="w-4 h-4" /> 下达工单
                      </button>
                        </>
                    ) : hasUnconvertedSubPlans(plan.id) ? (
                      <button onClick={() => onConvertToOrder(plan.id)} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white hover:bg-amber-600 rounded-xl text-xs font-bold transition-all border border-amber-400">
                        <ArrowRightCircle className="w-4 h-4" /> 补充下达子工单
                      </button>
                    ) : (
                      <div className="px-5 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200">已转正式工单</div>
                    )}
                    </div>
                  </div>
                );
              }
              if (block.type === 'parentChild') {
                const { parent, children } = block;
                const allWithDepth = [{ plan: parent, depth: 0 }, ...getAllDescendantsWithDepth(parent.id, 1)];
                const allPlans = allWithDepth.map(d => d.plan);
                return (
                  <div key={`parentChild-${parent.id}`} className="rounded-[32px] border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-bold text-slate-800">主计划及子计划（共 {allPlans.length} 条）</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {allWithDepth.map(({ plan, depth }, idx) => {
                        const product = products.find(p => p.id === plan.productId);
                        const totalQty = plan.items && Array.isArray(plan.items) ? plan.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : 0;
                        const isChild = depth > 0;
                        const indentPx = isChild ? 24 * depth : 0;
                        const assignedCount = plan.assignments ? Object.values(plan.assignments).filter(a => (a as NodeAssignment).workerIds && (a as NodeAssignment).workerIds.length > 0).length : 0;
                        const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                        const customListFields = planFormSettings.customFields.filter(f => f.showInList);
                        const createdDateRaw = plan.createdAt || (() => { const m = plan.id.match(/^plan-(\d+)/); return m ? new Date(parseInt(m[1], 10)).toISOString().split('T')[0] : ''; })();
                        const createdDate = formatPlanCreatedDateList(createdDateRaw);
                        return (
                          <div key={plan.id} className={`bg-white p-5 rounded-2xl border transition-all flex items-center justify-between ${isChild ? 'border-l-4 border-l-slate-300 border-slate-200' : 'border-slate-200'} hover:shadow-lg hover:border-slate-300`} style={indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                            <div className="flex items-center gap-5">
                              {product?.imageUrl ? (
                                <button type="button" onClick={() => setImagePreviewUrl(product.imageUrl)} className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0"><img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover block" /></button>
                              ) : (
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.status === PlanStatus.CONVERTED ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                  {plan.status === PlanStatus.CONVERTED ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-3 mb-1 flex-wrap">
                                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase">{plan.planNumber}</span>
                                  {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子计划</span>}
                                  {showInList('product') && product && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-base font-bold text-slate-800 hover:text-indigo-600 hover:underline">{product.name || '未知产品'}</button>
                                  )}
                                  {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                  {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                                  {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                                  {showInList('dueDate') && plan.dueDate && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> 交期: {formatPlanDueDateList(plan.dueDate)}</span>}
                                  {showInList('createdAt') && createdDate && <span className="flex items-center gap-1 text-slate-500"><CalendarDays className="w-3 h-3" /> 添加: {createdDate}</span>}
                                  {customListFields.map(cf => (plan.customData?.[cf.id] != null && plan.customData?.[cf.id] !== '') && <span key={cf.id} className="flex items-center gap-1">{cf.label}: {String(plan.customData[cf.id])}</span>)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setViewDetailPlanId(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold border border-slate-100"><Edit3 className="w-3.5 h-3.5" /> 详情</button>
                              {showPlanListPrintButton && (
                                <button
                                  type="button"
                                  onClick={() => openPlanPrintPicker(plan)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Printer className="w-3.5 h-3.5" /> 打印
                                </button>
                              )}
                              {!isChild && plan.status !== PlanStatus.CONVERTED && (
                                <>
                                  {children.length === 0 && (
                                    <button onClick={() => openSplit(plan)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold border border-slate-200"><Split className="w-3.5 h-3.5" /> 拆分</button>
                                  )}
                                  <button onClick={() => onConvertToOrder(plan.id)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black flex items-center gap-1.5"><ArrowRightCircle className="w-3.5 h-3.5" /> 下达工单</button>
                                </>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && hasUnconvertedSubPlans(plan.id) && (
                                <button onClick={() => onConvertToOrder(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white hover:bg-amber-600 rounded-xl text-xs font-bold border border-amber-400"><ArrowRightCircle className="w-3.5 h-3.5" /> 补充下达子工单</button>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && !hasUnconvertedSubPlans(plan.id) && <div className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200">已转工单</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              // block.type === 'group'：同一原单的拆分单用底框包在一起，每个拆分单下展示其子工单（含多级）
              const { groupKey, plans: groupPlans } = block;
              const allPlansInGroup = groupPlans.flatMap(p => [p, ...getAllDescendantsWithDepth(p.id, 1).map(d => d.plan)]);
              return (
                <div key={`group-${groupKey}-${blockIdx}`} className="rounded-[32px] border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2">
                    <Split className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-bold text-slate-800">原单 {groupKey} 拆分（共 {allPlansInGroup.length} 条）</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {groupPlans.flatMap(plan => {
                      const plansWithDepth = [{ plan, depth: 0 }, ...getAllDescendantsWithDepth(plan.id, 1)];
                      return plansWithDepth.map(({ plan: p, depth }) => {
                        const isChild = depth > 0;
                        const plan = p;
                        const product = products.find(pr => pr.id === plan.productId);
                        const totalQty = plan.items && Array.isArray(plan.items) ? plan.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : 0;
                        const assignedCount = plan.assignments ? Object.values(plan.assignments).filter(a => (a as NodeAssignment).workerIds && (a as NodeAssignment).workerIds.length > 0).length : 0;
                        const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                        const customListFields = planFormSettings.customFields.filter(f => f.showInList);
                        const createdDateRaw = plan.createdAt || (() => { const m = plan.id.match(/^plan-(\d+)/); return m ? new Date(parseInt(m[1], 10)).toISOString().split('T')[0] : ''; })();
                        const createdDate = formatPlanCreatedDateList(createdDateRaw);
                        const indentPx = isChild ? 24 * depth : 0;
                        return (
                          <div key={plan.id} className={`bg-white p-5 rounded-2xl border transition-all flex items-center justify-between ${isChild ? 'border-l-4 border-l-slate-300 border-slate-200' : 'border-slate-200'} hover:shadow-lg hover:border-slate-300`} style={indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                          <div className="flex items-center gap-5">
                            {product?.imageUrl ? (
                              <button type="button" onClick={() => setImagePreviewUrl(product.imageUrl)} className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none">
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover block" />
                              </button>
                            ) : (
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.status === PlanStatus.CONVERTED ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                {plan.status === PlanStatus.CONVERTED ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-3 mb-1 flex-wrap">
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{plan.planNumber}</span>
                                {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子计划</span>}
                                {showInList('product') && product && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-base font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                                    {product.name || '未知产品'}
                                  </button>
                                )}
                                {product && categories.find(c => c.id === product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                                  const val = product.categoryCustomData?.[f.id];
                                  if (val == null || val === '') return null;
                                  if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                                    const isImg = val.startsWith('data:image/');
                                    const isPdf = val.startsWith('data:application/pdf');
                                    if (isImg) return (
                                      <span key={f.id} className="inline-flex items-center gap-1">
                                        <img src={val} alt={f.label} className="h-5 w-5 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('image'); }} />
                                        <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                      </span>
                                    );
                                    if (isPdf) return (
                                      <span key={f.id} className="inline-flex items-center gap-1">
                                        <button type="button" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">在线查看</button>
                                        <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                      </span>
                                    );
                                    return (
                                      <a key={f.id} href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                    );
                                  }
                                  return <span key={f.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                                })}
                                {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                                {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                                {showInList('dueDate') && plan.dueDate && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> 交期: {formatPlanDueDateList(plan.dueDate)}</span>}
                                {showInList('createdAt') && createdDate && <span className="flex items-center gap-1 text-slate-500"><CalendarDays className="w-3 h-3" /> 添加: {createdDate}</span>}
                                {customListFields.map(cf => (plan.customData?.[cf.id] != null && plan.customData?.[cf.id] !== '') && <span key={cf.id} className="flex items-center gap-1">{cf.label}: {String(plan.customData[cf.id])}</span>)}
                              </div>
                            </div>
                          </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setViewDetailPlanId(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold border border-slate-100">
                                <Edit3 className="w-3.5 h-3.5" /> 详情
                              </button>
                              {showPlanListPrintButton && (
                                <button
                                  type="button"
                                  onClick={() => openPlanPrintPicker(plan)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Printer className="w-3.5 h-3.5" /> 打印
                                </button>
                              )}
                              {!isChild && plan.status !== PlanStatus.CONVERTED && (
                                <>
                                  {(parentToSubPlans.get(plan.id)?.length ?? 0) === 0 && (
                                    <button onClick={() => openSplit(plan)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold border border-slate-200">
                                      <Split className="w-3.5 h-3.5" /> 拆分
                                    </button>
                                  )}
                                  <button onClick={() => onConvertToOrder(plan.id)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black flex items-center gap-1.5">
                                    <ArrowRightCircle className="w-3.5 h-3.5" /> 下达工单
                                  </button>
                                </>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && hasUnconvertedSubPlans(plan.id) && (
                                <button onClick={() => onConvertToOrder(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white hover:bg-amber-600 rounded-xl text-xs font-bold border border-amber-400"><ArrowRightCircle className="w-3.5 h-3.5" /> 补充下达子工单</button>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && !hasUnconvertedSubPlans(plan.id) && <div className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200">已转工单</div>}
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

      <PlanFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        products={products}
        categories={categories}
        dictionaries={dictionaries}
        partners={partners}
        partnerCategories={partnerCategories}
        planFormSettings={planFormSettings}
        plans={plans}
        productionLinkMode={productionLinkMode}
        onSave={(plan) => { onCreatePlan(plan); }}
        onImagePreview={(url) => setImagePreviewUrl(url)}
        onFilePreview={(url, type) => { setFilePreviewUrl(url); setFilePreviewType(type); }}
      />

      {viewDetailPlanId && viewPlan && viewProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setViewDetailPlanId(null)}></div>
          <div className="relative bg-white w-full max-w-6xl rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh]">
            
            <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-50">
               <div className="flex items-center gap-5">
                  {viewProduct.imageUrl ? (
                    <button type="button" onClick={() => setImagePreviewUrl(viewProduct.imageUrl)} className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none">
                      <img src={viewProduct.imageUrl} alt={viewProduct.name} className="w-full h-full object-cover block" />
                    </button>
                  ) : (
                    <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100 flex-shrink-0"><Info className="w-7 h-7" /></div>
                  )}
                  <div>
                       <h2 className="text-2xl font-black text-slate-900 tracking-tight">查看生产计划</h2>
                    <p className="text-sm font-bold text-slate-400 mt-0.5 tracking-tighter uppercase flex flex-wrap items-center gap-2">
                      {viewPlan.planNumber} — 关联：{viewProduct.name}
                      {categories.find(c => c.id === viewProduct.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                        const val = viewProduct.categoryCustomData?.[f.id];
                        if (val == null || val === '') return null;
                        if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                          const isImg = val.startsWith('data:image/');
                          const isPdf = val.startsWith('data:application/pdf');
                          if (isImg) return (
                            <span key={f.id} className="inline-flex items-center gap-1.5 align-middle">
                              <img src={val} alt={f.label} className="h-6 w-6 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('image'); }} />
                              <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[10px] font-bold text-indigo-500 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                       </span>
                          );
                          if (isPdf) return (
                            <span key={f.id} className="inline-flex items-center gap-1.5 align-middle">
                              <button type="button" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="text-[10px] font-bold text-indigo-500 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">在线查看</button>
                              <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[10px] font-bold text-indigo-500 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                            </span>
                          );
                          return (
                            <a key={f.id} href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[10px] font-bold text-indigo-500 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                          );
                        }
                        return <span key={f.id} className="text-[10px] font-bold text-slate-500 px-2 py-0.5 rounded bg-slate-100">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                      })}
                    </p>
                  </div>
               </div>
               <button onClick={() => setViewDetailPlanId(null)} className="p-3 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-all"><X className="w-7 h-7" /></button>
            </div>

            {/* 类目锚点小标签：点击滚动到对应区块 */}
            <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-50/80 border-b border-slate-100 shrink-0">
              <button type="button" onClick={() => sectionBasicRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
                基本信息
              </button>
              <button type="button" onClick={() => sectionQtyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
                数量明细
              </button>
              <button type="button" onClick={() => sectionProcessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
                工序任务
              </button>
              <button type="button" onClick={() => sectionMaterialRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
                生产用料
              </button>
              <button type="button" onClick={() => sectionTraceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
                <span className="inline-flex items-center gap-1"><QrCode className="w-3.5 h-3.5" />追溯码</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-12 bg-slate-50/30">
               {/* 1. 计划基础信息 */}
               <div ref={sectionBasicRef} className="space-y-4 scroll-mt-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">1. 计划基础信息</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                    {planFormSettings.standardFields.find(f => f.id === 'customer')?.showInDetail !== false && productionLinkMode !== 'product' && (
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">计划客户（合作单位）</label>
                        <SearchablePartnerSelect
                          options={partners}
                          categories={partnerCategories}
                          value={tempPlanInfo.customer}
                          onChange={customerName => setTempPlanInfo({ ...tempPlanInfo, customer: customerName })}
                          placeholder="搜索并选择合作单位..."
                        />
                      </div>
                    )}
                    {/* 交期与添加日期在详情中始终显示，便于查看与编辑 */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">交期截止日期</label>
                      <div className="relative">
                        <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input type="date" value={tempPlanInfo.dueDate || ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-11 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">添加日期</label>
                      <div className="relative">
                        <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input type="date" value={tempPlanInfo.createdAt || ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-11 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                    </div>
                    {planFormSettings.customFields.filter(f => f.showInDetail).map(cf => (
                      <div key={cf.id} className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{cf.label}</label>
                        {cf.type === 'date' ? (
                          <input type="date" value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        ) : cf.type === 'number' ? (
                          <input type="number" value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        ) : cf.type === 'select' ? (
                          <select value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none">
                            <option value="">请选择</option>
                            {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        )}
                      </div>
                    ))}
                  </div>
               </div>

               {/* 2. 规格数量矩阵 */}
               <div ref={sectionQtyRef} className="space-y-4 scroll-mt-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">2. 生产数量明细录入 (可编辑)</h3>
                  </div>
                  <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                    {tempPlanInfo.items && tempPlanInfo.items.length > 0 && tempPlanInfo.items[0].variantId ? (
                        <div className="space-y-4">
                            {(Object.entries(tempPlanInfo.items.reduce((acc: Record<string, any[]>, item) => {
                                const v = viewProduct.variants.find(vx => vx.id === item.variantId);
                                if (v) { if (!acc[v.colorId]) acc[v.colorId] = []; acc[v.colorId].push({ ...item, variant: v }); }
                                return acc;
                            }, {})) as [string, any[]][]).map(([colorId, colorItems]) => {
                                const color = dictionaries.colors.find(c => c.id === colorId);
                                return (
                                    <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex items-center gap-3 w-40 shrink-0">
                                            <div className="w-6 h-6 rounded-full border border-slate-200" style={{backgroundColor: color?.value}}></div>
                                            <span className="text-sm font-black text-slate-700">{color?.name}</span>
                                        </div>
                                        <div className="flex-1 flex flex-wrap gap-4">
                                            {colorItems.map((item, idx) => {
                                                const size = dictionaries.sizes.find(s => s.id === item.variant.sizeId);
                                                return (
                                                    <div key={idx} className="flex flex-col gap-1 w-20">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase text-center">{size?.name}</span>
                                                        <input type="number" value={item.quantity} onChange={e => updateDetailItemQty(item.variantId, e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="max-w-xs space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase">总量 ({viewPlan ? getUnitName(viewPlan.productId) : 'PCS'})</label>
                             <input type="number" value={tempPlanInfo.items?.[0]?.quantity || 0} onChange={e => updateDetailItemQty(undefined, e.target.value)} className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-2xl font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                    )}
                  </div>
               </div>

               {/* 3. 工序任务 */}
               <div ref={sectionProcessRef} className="space-y-4 scroll-mt-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">3. 工序任务</h3>
                  </div>
                  <div className="space-y-4">
                     {productNodes.map((node, idx) => {
                       const eligibleWorkers = workers.filter(w => w.assignedMilestoneIds?.includes(node.id));
                       const isAssigned = (tempAssignments[node.id] as NodeAssignment)?.workerIds?.length > 0;
                       const enableWorker = node.enableAssignment !== false && node.enableWorkerAssignment !== false;
                       const enableEquipment = node.enableAssignment !== false && node.enableEquipmentAssignment !== false;
                       const canAssign = enableWorker || enableEquipment;
                       return (
                         <div key={node.id} className={`flex flex-col md:flex-row md:items-center gap-4 p-5 rounded-[28px] border transition-all ${isAssigned ? 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-50' : 'bg-white/60 border-slate-200'}`}>
                            <div className="flex items-center gap-4 md:w-56 shrink-0">
                               <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black shadow-inner ${isAssigned ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                               <div>
                                 <h4 className="text-sm font-black text-slate-800">{node.name}</h4>
                                 <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                   {node.hasBOM ? '需配置BOM' : '标准工序'}
                                   {canAssign ? (enableWorker && enableEquipment ? ' · 工人/设备派工' : enableWorker ? ' · 工人派工' : ' · 设备派工') : ' · 不派工'}
                                 </p>
                            </div>
                            </div>
                            <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                               <div className="flex items-center gap-4 shrink-0">
                                 {node.enablePieceRate && (
                                 <div className="flex items-center gap-2 w-[9rem]">
                                   <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap w-6">工价</span>
                                   <input
                                     type="number"
                                     min={0}
                                     step={0.01}
                                     placeholder="0"
                                     value={tempNodeRates[node.id] ?? ''}
                                     onChange={e => {
                                       const v = parseFloat(e.target.value);
                                       setTempNodeRates(prev => ({ ...prev, [node.id]: isNaN(v) ? 0 : v }));
                                     }}
                                     className="w-20 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                   />
                                   <span className="text-[9px] text-slate-400 whitespace-nowrap">元/件</span>
                                 </div>
                                 )}
                                 {canAssign && (
                                   <div className="flex flex-wrap items-center gap-4 md:gap-4 border-l border-slate-200 pl-4 md:pl-5 min-w-[480px] flex-1">
                                     {enableWorker && (
                                       <div className="min-w-[440px] w-full max-w-[640px]">
                                         <SearchableMultiSelectWithProcessTabs
                                           variant="compact"
                                           icon={UserPlus}
                                           placeholder="分派负责人..."
                                           processNodes={globalNodes}
                                           currentNodeId={node.id}
                                           options={workers.map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                                           selectedIds={(tempAssignments[node.id] as NodeAssignment)?.workerIds || []}
                                           onChange={(ids) => updateTempAssignment(node.id, { workerIds: ids })}
                                         />
                                       </div>
                                     )}
                                     {enableEquipment && (
                                       <div className="min-w-[440px] w-full max-w-[640px]">
                                         <SearchableMultiSelectWithProcessTabs
                                           variant="compact"
                                           icon={Wrench}
                                           placeholder="分派设备..."
                                           processNodes={globalNodes}
                                           currentNodeId={node.id}
                                           options={equipment.map(e => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                                           selectedIds={(tempAssignments[node.id] as NodeAssignment)?.equipmentIds || []}
                                           onChange={(ids) => updateTempAssignment(node.id, { equipmentIds: ids })}
                                         />
                                       </div>
                                     )}
                                   </div>
                                 )}
                               </div>
                            </div>
                         </div>
                       )
                     })}
                  </div>
               </div>

               {/* 4. 计划生产用料清单 (BOM 汇总) */}
               <div ref={sectionMaterialRef} className="space-y-4 pb-20 scroll-mt-4">
                  <div className="flex flex-col gap-4 ml-2">
                     <div className="flex items-center justify-between flex-wrap gap-4">
                     <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">4. 计划生产用料清单 (BOM 汇总)</h3>
                     </div>
                        <div className="flex items-center gap-2">
                           {onCreateSubPlan && (
                             <button
                               onClick={handleCreateSubPlansFromPlannedQty}
                               disabled={!hasProducibleNeedingSubPlan}
                               className="bg-amber-500 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 transition-all flex items-center gap-2 disabled:opacity-50"
                               title={!hasProducibleNeedingSubPlan ? '可生产物料均已生成计划单，或请先填写计划用量' : undefined}
                             >
                               <Plus className="w-3.5 h-3.5" />
                               创建子工单
                             </button>
                           )}
                     <button 
                        onClick={handleGenerateProposedOrders}
                             disabled={!canGeneratePO || materialRequirements.length === 0}
                        className="bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-black transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
                             title={hasExistingPOs ? '采购订单已创建，不可重复创建' : !allPlannedFilled && leafWithShortage.length > 0 ? '请先为所有缺料物料填写计划用量' : undefined}
                      >
                         <ShoppingCart className="w-3.5 h-3.5" />
                             创建采购订单
                      </button>
                        </div>
                     </div>
                  </div>

                  <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="bg-slate-50/50 border-b border-slate-100">
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料名称 / SKU</th>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">理论总需量</th>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">库存</th>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">计算缺料数</th>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center min-w-[140px]">计划用量</th>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center min-w-[220px]">状态</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {(materialRequirements as any[]).length === 0 ? (
                              <tr><td colSpan={6} className="px-8 py-10 text-center text-slate-300 italic text-sm">尚未配置 BOM 详情</td></tr>
                           ) : (
                              (materialRequirements as any[]).map((req: any, idx: number) => (
                                 <tr
                                    key={idx}
                                    className={`hover:bg-slate-50/30 transition-colors group ${(req.level ?? 1) >= 2 ? 'bg-slate-50/40' : ''}`}
                                 >
                                    <td className={`py-4 pr-8 ${(req.level ?? 1) === 1 ? 'pl-8' : ''}`} style={(req.level ?? 1) >= 2 ? { paddingLeft: `${32 + ((req.level ?? 2) - 1) * 20}px` } : undefined}>
                                       <div className="flex flex-col gap-0.5">
                                          {(req.level ?? 1) >= 2 && (
                                             <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                                                <span className="inline-block w-4 border-l-2 border-indigo-300 border-b-0 rounded-b-none shrink-0" aria-hidden />
                                                {req.level === 2 ? '二级' : req.level === 3 ? '三级' : `${req.level}级`} BOM
                                             </span>
                                          )}
                                          <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-bold text-slate-800">
                                              {(() => {
                                                const hasSku = req.materialSku && String(req.materialSku).trim() && req.materialSku !== '-';
                                                const skuPart = hasSku ? `（${req.materialSku}）` : '';
                                                return `${req.materialName}${skuPart}`;
                                              })()}
                                            </span>
                                            {(() => {
                                              const p = products.find(x => x.id === req.materialId);
                                              const cat = categories.find(c => c.id === p?.categoryId);
                                              const catName = cat?.name ?? '';
                                              return catName ? <span className="text-[10px] font-medium text-slate-400">{catName}</span> : null;
                                            })()}
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-8 py-4">
                                       <span className="text-sm font-black text-slate-600 whitespace-nowrap">{Number(req.totalNeeded).toFixed(2)} {getUnitName(req.materialId)}</span>
                                    </td>
                                    <td className="px-8 py-4 text-center">
                                       <span className={`text-sm font-black whitespace-nowrap ${req.stock < req.totalNeeded ? 'text-rose-500' : 'text-emerald-500'}`}>
                                          {Number(req.stock).toFixed(2)} {getUnitName(req.materialId)}
                                       </span>
                                    </td>
                                    <td className="px-8 py-4 text-right">
                                       {req.shortage > 0 ? (
                                          <span className="text-sm font-black text-indigo-600 whitespace-nowrap">
                                            {Number(req.shortage).toFixed(2)} {getUnitName(req.materialId)}
                                             </span>
                                       ) : (
                                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap">库存充沛</span>
                                       )}
                                    </td>
                                    <td className="px-8 py-4">
                                       <div className="flex items-center justify-center gap-1 flex-nowrap">
                                          {(() => {
                                            const subPlan = viewPlan ? findSubPlanForMaterial(req.materialId, req.nodeId, viewPlan.id) : null;
                                            const subPlanQty = subPlan?.items?.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0) ?? 0;
                                            const hasSubPlan = !!(subPlan && subPlanQty > 0);
                                            if (hasSubPlan) {
                                              return (
                                                <span className="inline-block bg-slate-100 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-700 text-right whitespace-nowrap">{Number(subPlanQty).toFixed(2)} {getUnitName(req.materialId)}</span>
                                              );
                                            }
                                            const poList = relatedPOsByMaterial[req.materialId] || [];
                                            const hasPO = poList.length > 0;
                                            const poQty = poList.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
                                            if (hasPO) {
                                              return (
                                                <span className="inline-block bg-slate-100 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-700 text-right whitespace-nowrap">{Number(poQty).toFixed(2)} {getUnitName(req.materialId)}</span>
                                              );
                                            }
                                            return (
                                              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                                <input
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  placeholder="—"
                                                  value={(() => {
                                                    const raw = req.rowKey in plannedQtyByKey ? plannedQtyByKey[req.rowKey] : req.plannedQty;
                                                    if (raw == null || raw === 0) return '';
                                                    const n = Number(raw);
                                                    if (isNaN(n) || n <= 0) return '';
                                                    const rounded = Math.round(n * 100) / 100;
                                                    return String(Number(rounded.toFixed(2)));
                                                  })()}
                                                  onChange={e => {
                                                    const raw = e.target.value.trim();
                                                    if (raw === '') {
                                                      setPlannedQtyByKey(prev => ({ ...prev, [req.rowKey]: null }));
                                                      return;
                                                    }
                                                    const v = parseFloat(raw);
                                                    const qty = isNaN(v) || v < 0 ? 0 : Math.round(v * 100) / 100;
                                                    setPlannedQtyByKey(prev => ({ ...prev, [req.rowKey]: qty }));
                                                  }}
                                                  className="w-24 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none shrink-0"
                                                />
                                                <span className="text-[10px] font-bold text-slate-400 shrink-0">{getUnitName(req.materialId)}</span>
                                              </span>
                                            );
                                          })()}
                                          </div>
                                    </td>
                                    <td className="px-8 py-4">
                                       {(() => {
                                          const isProducible = (products.find(p => p.id === req.materialId)?.milestoneNodeIds?.length ?? 0) > 0;
                                          const subPlan = viewPlan ? findSubPlanForMaterial(req.materialId, req.nodeId, viewPlan.id) : null;
                                          const hasSubPlan = !!subPlan;
                                          if (isProducible) {
                                             if (hasSubPlan) {
                                                return <span className="text-emerald-600 text-[10px] font-bold uppercase whitespace-nowrap">已生成生产计划</span>;
                                             }
                                             return <span className="text-slate-300 text-[10px] font-bold uppercase whitespace-nowrap">未生成计划单</span>;
                                          }
                                          const progress = getInboundProgress(req.materialId);
                                          if (progress) {
                                             const unit = getUnitName(req.materialId);
                                             const received = progress.received;
                                             const ordered = progress.ordered;
                                             const pct = ordered > 0 ? Math.min(1, received / ordered) : 0;
                                             const isOverReceived = received > ordered;
                                             return (
                                                <button
                                                   type="button"
                                                   onClick={() => setRelatedPOsMaterialId(req.materialId)}
                                                   className="w-full min-w-[200px] inline-flex flex-col items-stretch gap-1.5 px-3 py-2 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-indigo-50/80 hover:border-indigo-100 transition-colors cursor-pointer text-left"
                                                   title="点击查看相关采购订单"
                                                >
                                                   <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
                                                      {isOverReceived ? (
                                                         <>
                                                            <div className="h-full bg-emerald-500" style={{ width: `${(ordered / received) * 100}%` }} />
                                                            <div className="h-full bg-rose-500" style={{ width: `${((received - ordered) / received) * 100}%` }} />
                                                         </>
                                                      ) : (
                                                         <div
                                                            className={`h-full rounded-full transition-all ${pct >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                            style={{ width: `${Math.min(100, pct * 100)}%` }}
                                                         />
                                                      )}
                                                   </div>
                                                   <span className="text-[10px] font-bold text-slate-700 whitespace-nowrap">
                                                      {isOverReceived
                                                         ? `已收 ${Number(received).toFixed(2)} / ${Number(ordered).toFixed(2)} ${unit}（已超收）`
                                                         : pct >= 1
                                                            ? `已完成`
                                                            : `已收 ${Number(received).toFixed(2)} / ${Number(ordered).toFixed(2)} ${unit}`}
                                                   </span>
                                                </button>
                                             );
                                          }
                                          return (
                                             <span className="text-slate-300 text-[10px] font-bold uppercase whitespace-nowrap">未生成采购单</span>
                                          );
                                       })()}
                                    </td>
                                 </tr>
                              ))
                           )}
                        </tbody>
                     </table>
                  </div>

                  {proposedOrders.length > 0 && (
                    <div className="mt-12 space-y-8 animate-in slide-in-from-bottom-6">
                       <div className="flex items-center justify-between ml-2">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 border border-amber-100 shadow-sm"><FileSpreadsheet className="w-5 h-5" /></div>
                             <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">待确认采购订单预览 ({proposedOrders.length} 张单据)</h3>
                                <p className="text-[10px] text-slate-400 font-bold italic mt-0.5">已按单位归类，点击保存正式同步至采购模块</p>
                             </div>
                          </div>
                          <div className="flex gap-3">
                             <button onClick={() => setProposedOrders([])} className="px-4 py-2 text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase">清空待办</button>
                             <button 
                                onClick={handleConfirmAndSaveOrders}
                                disabled={isProcessingPO}
                                className="bg-emerald-600 text-white px-8 py-2.5 rounded-xl text-xs font-black shadow-xl shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all"
                             >
                                {isProcessingPO ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                确认并保存采购订单
                             </button>
                          </div>
                       </div>

                       <div className="space-y-4">
                          {proposedOrders.map(order => (
                            <div key={order.orderNumber} className="bg-white border-2 border-slate-100 p-8 rounded-[40px] shadow-sm relative group hover:border-indigo-400 transition-all overflow-hidden">
                               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-50 pb-4">
                                  <div className="flex items-center gap-5">
                                     <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg">
                                        <Building2 className="w-5 h-5 mb-0.5" />
                                        <span className="text-[8px] font-black uppercase opacity-60">PRT</span>
                                     </div>
                                     <div>
                                        <div className="flex items-center gap-3">
                                           <h4 className="text-lg font-black text-slate-800">{order.partnerName}</h4>
                                           <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                                              {order.orderNumber}
                                           </span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic flex items-center gap-2">
                                           <ListOrdered className="w-3 h-3" /> 包含明细：{order.items.length} 项
                                        </p>
                                     </div>
                                  </div>
                                  <button 
                                      onClick={() => removeProposedOrder(order.orderNumber)}
                                      className="flex items-center gap-2 px-4 py-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all text-[11px] font-black uppercase"
                                   >
                                      <Trash2 className="w-4 h-4" /> 移除单据
                                   </button>
                               </div>

                               <div className="overflow-x-auto">
                                  <table className="w-full text-left">
                                     <thead>
                                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                           <th className="pb-4 pl-2">物料档案 / SKU</th>
                                           <th className="pb-4 text-center">对应生产环节</th>
                                           <th className="pb-4 text-center">系统缺料数</th>
                                           <th className="pb-4 text-right">拟采购数量 (可编辑)</th>
                                           <th className="pb-4 pr-2 w-16 text-center">操作</th>
                                        </tr>
                                     </thead>
                                     <tbody className="divide-y divide-slate-50">
                                        {order.items.map(item => (
                                          <tr key={item.id} className="group/item">
                                             <td className="py-4 pl-2">
                                                <div className="flex flex-col">
                                                   <span className="text-sm font-bold text-slate-700">{item.materialName}</span>
                                                   <span className="text-[9px] font-bold text-slate-300 uppercase">SKU: {item.materialSku}</span>
                                                </div>
                                             </td>
                                             <td className="py-4 text-center">
                                                <span className="text-[10px] font-black text-indigo-400 uppercase">{item.nodeName}</span>
                                             </td>
                                             <td className="py-4 text-center">
                                                <span className="text-xs font-bold text-slate-400">{Number(item.suggestedQty).toFixed(2)} {getUnitName(item.productId)}</span>
                                             </td>
                                             <td className="py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                      <input 
                                                         type="number" 
                                                      min={0}
                                                      step="0.01"
                                                      placeholder="—"
                                                      value={(() => {
                                                         const raw = item.quantity;
                                                         if (raw == null || raw === 0) return '';
                                                         const n = Number(raw);
                                                         if (isNaN(n) || n <= 0) return '';
                                                         const rounded = Math.round(n * 100) / 100;
                                                         return String(Number(rounded.toFixed(2)));
                                                      })()}
                                                      onChange={e => {
                                                         const raw = e.target.value.trim();
                                                         if (raw === '') {
                                                            updateProposedItemQty(order.orderNumber, item.id, '');
                                                            return;
                                                         }
                                                         const v = parseFloat(raw);
                                                         const qty = isNaN(v) || v < 0 ? 0 : Math.round(v * 100) / 100;
                                                         updateProposedItemQty(order.orderNumber, item.id, String(qty));
                                                      }}
                                                      className="w-24 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                                   />
                                                   <span className="text-[10px] font-bold text-slate-400">{getUnitName(item.productId)}</span>
                                                </div>
                                             </td>
                                             <td className="py-4 pr-2 text-center">
                                                <button
                                                   type="button"
                                                   onClick={() => removeProposedOrderItem(order.orderNumber, item.id)}
                                                   className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                   title="删除该物料"
                                                >
                                                   <Trash2 className="w-4 h-4" />
                                                </button>
                                             </td>
                                          </tr>
                                        ))}
                                     </tbody>
                                  </table>
                               </div>

                               <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                                  <div className="flex items-center gap-4 text-[10px] font-bold text-amber-500">
                                     <AlertCircle className="w-3.5 h-3.5" />
                                     <span>请确认各明细项数量是否满足最小包装量</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                     <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">单据预估总量：</span>
                                     <span className="text-lg font-black text-slate-900">{Number(order.items.reduce((s, i) => s + (i.quantity ?? 0), 0)).toFixed(2)} {viewPlan ? getUnitName(viewPlan.productId) : 'PCS'}</span>
                                  </div>
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>
                  )}
               </div>

               {/* 5. 追溯码 */}
               <div ref={sectionTraceRef} className="space-y-4 scroll-mt-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                    <QrCode className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">5. 追溯码</h3>
                  </div>
                  <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">生成类型</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button
                          type="button"
                          onClick={() => setTraceGenMode('item')}
                          className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'item' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                        >
                          <span className="text-xs font-black text-slate-800 block">单品码</span>
                          <span className="text-[10px] text-slate-500 mt-1 block leading-snug">一物一码，不经过批次</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTraceGenMode('batch')}
                          className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'batch' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                        >
                          <span className="text-xs font-black text-slate-800 block">批次码</span>
                          <span className="text-[10px] text-slate-500 mt-1 block leading-snug">按批二维码，不自动建单品码</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTraceGenMode('batchWithItems')}
                          className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'batchWithItems' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                        >
                          <span className="text-xs font-black text-slate-800 block">单品码+批次码</span>
                          <span className="text-[10px] text-slate-500 mt-1 block leading-snug">建批时同步生成关联单品码</span>
                        </button>
                      </div>
                      {traceGenMode === null && (
                        <p className="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 leading-relaxed">
                          请先选择要生成的码类型，再填写参数并点击生成。
                        </p>
                      )}
                    </div>

                    {(traceGenMode === 'item' || traceGenMode === 'batchWithItems') && (
                      <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                        <p className="text-xs text-slate-500 max-w-xl">
                          {traceGenMode === 'batchWithItems' ? (
                            <>
                              除批次同步生成的关联单品码外，还可在此<strong className="text-slate-700">单独补充</strong>不绑定批次的单品码；下方列表含<strong className="text-slate-700">批次码</strong>列便于对照。
                            </>
                          ) : (
                            <>为计划内每件货物生成全局唯一单品码（不绑定批次），可用于标签打印与扫码识别。</>
                          )}
                        </p>
                        <button
                          type="button"
                          disabled={itemCodesGenerating}
                          onClick={() => viewPlan && handleGenerateItemCodes(viewPlan.id)}
                          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-100 shrink-0"
                        >
                          {itemCodesGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                          {itemCodesGenerating ? '生成中...' : '生成单品码'}
                        </button>
                      </div>
                    )}

                    {(traceGenMode === 'batch' || traceGenMode === 'batchWithItems') && (
                      <div className="space-y-6">
                        <p className="text-xs text-slate-500 leading-relaxed">
                          一个二维码对应<strong className="text-slate-700">固定件数</strong>。额度按<strong className="text-slate-600">本计划及子计划、同产品</strong>的计划明细汇总；有效批次占用额度，作废不占。标签请使用打印模版中的批次码占位符。
                          {traceGenMode === 'batchWithItems' ? (
                            <> 当前类型下，每批会<strong className="text-slate-600">同步创建 N 条可单独扫码的单品码</strong>并与批次关联；作废批次将级联作废这些单品码。</>
                          ) : (
                            <> 当前类型下<strong className="text-slate-600">不会</strong>随批次自动创建单品码。</>
                          )}
                        </p>

                        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-5 space-y-4 shadow-sm shadow-indigo-500/5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                              <Layers className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <p className="text-[11px] font-black text-indigo-950 uppercase tracking-wider">快速批量</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">对计划树里出现的<strong className="text-slate-600">每一种规格</strong>分别拆满剩余额度，无需先选规格。</p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                            <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">每批件数</label>
                              <input
                                type="number"
                                min={1}
                                value={vbBulkBatchSize}
                                onChange={e => setVbBulkBatchSize(e.target.value)}
                                placeholder={vbBulkAllSummary && vbBulkAllSummary.totalRemaining > 0 ? '如 50' : '—'}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={
                                vbBulkSplitting ||
                                !vbBulkAllSummary ||
                                vbBulkAllSummary.variantCount === 0 ||
                                vbBulkAllSummary.totalRemaining <= 0
                              }
                              onClick={() => viewPlan && handleBulkSplitVirtualBatches(viewPlan.id)}
                              className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                            >
                              {vbBulkSplitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                              {vbBulkSplitting ? '拆批中...' : '一键拆满全部规格'}
                            </button>
                            {vbBulkAllSummary && vbBulkAllSummary.variantCount > 0 ? (
                              <p className="text-[10px] text-slate-500 sm:max-w-xs sm:pb-0.5">
                                {vbBulkAllSummary.totalRemaining > 0 ? (
                                  <>全规格合计还可分配约 <strong className="text-slate-700">{vbBulkAllSummary.totalRemaining}</strong> 件（{vbBulkAllSummary.variantCount} 种规格有明细）。</>
                                ) : (
                                  <>当前各规格剩余额度已为 0，无法继续批量拆批。</>
                                )}
                              </p>
                            ) : (
                              <p className="text-[10px] text-slate-400 sm:pb-0.5">暂无计划明细，无法拆批。</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-white">
                              <Boxes className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <p className="text-[11px] font-black text-slate-800 uppercase tracking-wider">单条生成</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">任选一种规格，自定义本批次件数（受该规格剩余额度限制）。</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-end gap-3">
                            {viewProduct.variants.length > 0 ? (
                              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[220px]">
                                <label className="text-[10px] font-black text-slate-400 uppercase">规格</label>
                                <select
                                  value={vbVariantId}
                                  onChange={e => setVbVariantId(e.target.value)}
                                  className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                                >
                                  <option value="">请选择</option>
                                  {viewProduct.variants.map(v => {
                                    const color = dictionaries.colors.find(c => c.id === v.colorId);
                                    const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                    const label = [color?.name, size?.name].filter(Boolean).join('-') || v.skuSuffix || v.id;
                                    return (
                                      <option key={v.id} value={v.id}>{label}</option>
                                    );
                                  })}
                                </select>
                              </div>
                            ) : null}
                            <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">件数</label>
                              <input
                                type="number"
                                min={1}
                                max={vbQuotaInfo?.kind === 'ok' && vbQuotaInfo.remaining > 0 ? vbQuotaInfo.remaining : undefined}
                                value={vbQuantity}
                                onChange={e => setVbQuantity(e.target.value)}
                                placeholder={
                                  vbQuotaInfo?.kind === 'needVariant'
                                    ? '请先选规格'
                                    : vbQuotaInfo?.kind === 'ok'
                                      ? vbQuotaInfo.remaining > 0
                                        ? `最多 ${vbQuotaInfo.remaining}`
                                        : '已满（0）'
                                      : '如 100'
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={vbCreating}
                              onClick={() => viewPlan && handleCreateVirtualBatch(viewPlan.id, viewProduct.variants)}
                              className="shrink-0 border-2 border-slate-300 bg-white text-slate-800 px-5 py-2.5 rounded-xl text-xs font-bold hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                              {vbCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Boxes className="w-3.5 h-3.5" />}
                              {vbCreating ? '生成中...' : '生成批次码'}
                            </button>
                          </div>
                          {vbQuotaInfo?.kind === 'ok' && vbQuotaInfo.maxFromPlan > 0 && (
                            <p className="text-[10px] text-slate-400 leading-tight">
                              当前所选规格：计划量 {vbQuotaInfo.maxFromPlan}，已用批次 {vbQuotaInfo.allocated}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {(traceGenMode === 'item' || traceGenMode === 'batchWithItems') && (
                    <div ref={traceItemListRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                          <QrCode className="w-4 h-4 text-indigo-600 shrink-0" />
                          单品码一览
                        </h4>
                        {viewPlan && itemCodesTotal > 0 && (
                          <button
                            type="button"
                            onClick={() => openItemCodePrintPicker(viewPlan, itemCodesVariantFilter, itemCodesBatchFilter)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            打印单品码
                          </button>
                        )}
                      </div>

                      {viewProduct.variants.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black text-slate-400 uppercase">筛选规格：</span>
                          <button
                            type="button"
                            onClick={() => {
                              setItemCodesVariantFilter('');
                              setItemCodesBatchFilter('');
                              viewPlan && loadItemCodes(viewPlan.id, 1, '', '');
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${!itemCodesVariantFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                          >
                            全部
                          </button>
                          {viewProduct.variants.map(v => {
                            const color = dictionaries.colors.find(c => c.id === v.colorId);
                            const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                            const label = [color?.name, size?.name].filter(Boolean).join('-') || v.skuSuffix || v.id;
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => {
                                  setItemCodesBatchFilter('');
                                  setItemCodesVariantFilter(v.id);
                                  viewPlan && loadItemCodes(viewPlan.id, 1, v.id, '');
                                }}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${itemCodesVariantFilter === v.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {itemCodesBatchFilter && viewPlan && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase">批次筛选</span>
                          <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                            仅显示所选批次的单品码
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setItemCodesBatchFilter('');
                              viewPlan && loadItemCodes(viewPlan.id, 1, itemCodesVariantFilter, '');
                            }}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                          >
                            清除批次筛选
                          </button>
                        </div>
                      )}

                      {itemCodesLoading ? (
                        <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
                      ) : itemCodes.length === 0 ? (
                        <div className="text-center py-8 text-sm text-slate-400">
                          暂无单品码
                          {traceGenMode === 'item'
                            ? '，点击上方「生成单品码」开始'
                            : '；可点击上方「生成单品码」补充，或通过下方批次生成时自动创建关联单品码'}
                        </div>
                      ) : (
                        <>
                          <div className="text-xs text-slate-500">
                            共 <span className="font-black text-indigo-600">{itemCodesTotal}</span> 个单品码
                            {itemCodesTotal > 100 && `（第 ${itemCodesPage} 页）`}
                          </div>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">编号</th>
                                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">
                                    {traceGenMode === 'batchWithItems' ? '批次码' : '所属批次'}
                                  </th>
                                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">状态</th>
                                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">生成时间</th>
                                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase text-right">操作</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {itemCodes.map(code => {
                                  const variant = viewProduct.variants.find(v => v.id === code.variantId);
                                  const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                                  const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                                  const variantLabel = [color?.name, size?.name].filter(Boolean).join('-') || variant?.skuSuffix || '—';
                                  return (
                                    <tr key={code.id} className="hover:bg-slate-50/50">
                                      <td className="px-4 py-2.5 text-xs font-bold text-slate-800 break-all">
                                        {formatItemCodeSerialLabel(viewPlan.planNumber, code.serialNo)}
                                      </td>
                                      <td
                                        className={`px-4 py-2.5 text-xs break-all ${traceGenMode === 'batchWithItems' && code.batch?.sequenceNo != null ? 'cursor-pointer text-indigo-600 hover:underline' : 'text-slate-600'}`}
                                        onClick={() => {
                                          if (!code.batch?.sequenceNo || traceGenMode !== 'batchWithItems') return;
                                          traceBatchListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }}
                                        title={traceGenMode === 'batchWithItems' && code.batch?.sequenceNo != null ? '点击查看下方批次码一览' : undefined}
                                      >
                                        {code.batch?.sequenceNo != null
                                          ? formatBatchSerialLabel(viewPlan.planNumber, code.batch.sequenceNo)
                                          : '—'}
                                      </td>
                                      <td className="px-4 py-2.5 text-xs text-slate-600">{variantLabel}</td>
                                      <td className="px-4 py-2.5">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${code.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                          {code.status === 'ACTIVE' ? '正常' : '已作废'}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-[10px] text-slate-400">{new Date(code.createdAt).toLocaleDateString('zh-CN')}</td>
                                      <td className="px-4 py-2.5 text-right">
                                        {code.status === 'ACTIVE' && (
                                          <button
                                            type="button"
                                            onClick={() => viewPlan && handleVoidItemCode(code.id, viewPlan.id)}
                                            className="text-[10px] font-bold text-rose-400 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                                          >
                                            <Ban className="w-3 h-3 inline mr-0.5" />作废
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {itemCodesTotal > 100 && (
                            <div className="flex items-center justify-center gap-2 pt-2">
                              <button
                                type="button"
                                disabled={itemCodesPage <= 1}
                                onClick={() =>
                                  viewPlan &&
                                  loadItemCodes(viewPlan.id, itemCodesPage - 1, itemCodesVariantFilter, itemCodesBatchFilter)
                                }
                                className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                              >
                                上一页
                              </button>
                              <span className="text-xs text-slate-500">第 {itemCodesPage} 页 / 共 {Math.ceil(itemCodesTotal / 100)} 页</span>
                              <button
                                type="button"
                                disabled={itemCodesPage >= Math.ceil(itemCodesTotal / 100)}
                                onClick={() =>
                                  viewPlan &&
                                  loadItemCodes(viewPlan.id, itemCodesPage + 1, itemCodesVariantFilter, itemCodesBatchFilter)
                                }
                                className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                              >
                                下一页
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    )}

                    {(traceGenMode === 'batch' || traceGenMode === 'batchWithItems') && (
                    <div ref={traceBatchListRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                        批次码一览
                      </h4>
                      {virtualBatchesLoading ? (
                        <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
                      ) : virtualBatches.length === 0 ? (
                        <div className="text-center py-8 text-sm text-slate-400">暂无批次码</div>
                      ) : (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase min-w-[7rem]">编号</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">件数</th>
                                {traceGenMode === 'batchWithItems' && (
                                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase w-16">单品码</th>
                                )}
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">状态</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">创建时间</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase text-right">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {virtualBatches.map(b => {
                                const variant = b.variantId ? viewProduct.variants.find(v => v.id === b.variantId) : null;
                                const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                                const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                                const variantLabel = variant
                                  ? [color?.name, size?.name].filter(Boolean).join('-') || variant.skuSuffix || '—'
                                  : '默认';
                                return (
                                  <tr key={b.id} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5 text-xs font-black text-slate-700 break-all" title={b.sequenceNo != null ? String(b.sequenceNo) : undefined}>
                                      {b.sequenceNo != null ? formatBatchSerialLabel(viewPlan.planNumber, b.sequenceNo) : '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">{variantLabel}</td>
                                    <td className="px-4 py-2.5 text-xs font-black text-indigo-600">{b.quantity}</td>
                                    {traceGenMode === 'batchWithItems' && (
                                      <td className="px-4 py-2.5 text-xs">
                                        {(b.itemCodeCount ?? 0) > 0 ? (
                                          <button
                                            type="button"
                                            className="font-black text-indigo-600 hover:underline"
                                            onClick={() => {
                                              if (!viewPlan) return;
                                              setItemCodesBatchFilter(b.id);
                                              traceItemListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                              void loadItemCodes(viewPlan.id, 1, itemCodesVariantFilter, b.id);
                                            }}
                                          >
                                            {b.itemCodeCount}
                                          </button>
                                        ) : (
                                          <span className="text-slate-400">—</span>
                                        )}
                                      </td>
                                    )}
                                    <td className="px-4 py-2.5">
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${b.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                        {b.status === 'ACTIVE' ? '正常' : '已作废'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-[10px] text-slate-400">{new Date(b.createdAt).toLocaleString('zh-CN')}</td>
                                    <td className="px-4 py-2.5 text-right space-x-2">
                                      {b.status === 'ACTIVE' && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => viewPlan && setBatchPrintModal({ plan: viewPlan, batch: b })}
                                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                                          >
                                            <Printer className="w-3 h-3 inline mr-0.5" />打印标签
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => viewPlan && handleVoidVirtualBatch(b.id, viewPlan.id)}
                                            className="text-[10px] font-bold text-rose-400 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                                          >
                                            <Ban className="w-3 h-3 inline mr-0.5" />作废
                                          </button>
                                        </>
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
                    )}
                  </div>
               </div>


            </div>

            <div className="px-10 py-6 bg-white/80 backdrop-blur-lg border-t border-slate-100 flex justify-between items-center sticky bottom-0">
               <div className="flex flex-col">
                  <p className="text-xs font-bold text-slate-500">当前操作：<span className="text-indigo-600 font-black">计划资料整体更新</span></p>
                  <p className="text-[10px] text-slate-400 mt-1 italic font-medium">※ 点击保存将同步更新客户、交期、规格数量及派发方案。</p>
               </div>
               <div className="flex items-center gap-4">
                 <button onClick={() => setViewDetailPlanId(null)} className="px-8 py-3 text-sm font-black text-slate-400 hover:text-slate-800 transition-colors uppercase">放弃修改</button>
                 {onDeletePlan && (
                   <button
                     onClick={() => {
                       void confirm({ message: '确定要删除该计划单吗？', danger: true }).then((ok) => {
                         if (!ok) return;
                         onDeletePlan(viewPlan.id);
                         setViewDetailPlanId(null);
                       });
                     }}
                     className="px-6 py-3 text-sm font-black text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-2xl border border-rose-200 flex items-center gap-2"
                   >
                     <Trash2 className="w-4 h-4" /> 删除
                   </button>
                 )}
                 {viewPlan.status !== PlanStatus.CONVERTED && !viewPlan.parentPlanId && (
                   <>
                     {(parentToSubPlans.get(viewPlan.id)?.length ?? 0) === 0 && (
                       <button onClick={() => { openSplit(viewPlan); setViewDetailPlanId(null); }} className="px-6 py-3 text-sm font-black text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-2xl border border-amber-200 flex items-center gap-2">
                         <Split className="w-4 h-4" /> 拆分计划
                       </button>
                     )}
                     <button onClick={() => { onConvertToOrder(viewPlan.id); setViewDetailPlanId(null); }} className="px-6 py-3 text-sm font-black text-white bg-slate-900 hover:bg-black rounded-2xl flex items-center gap-2">
                       <ArrowRightCircle className="w-4 h-4" /> 下达工单
                     </button>
                   </>
                 )}
                 {viewPlan.status === PlanStatus.CONVERTED && !viewPlan.parentPlanId && hasUnconvertedSubPlans(viewPlan.id) && (
                   <button onClick={() => { onConvertToOrder(viewPlan.id); setViewDetailPlanId(null); }} className="px-6 py-3 text-sm font-black text-white bg-amber-500 hover:bg-amber-600 rounded-2xl flex items-center gap-2">
                     <ArrowRightCircle className="w-4 h-4" /> 补充下达子工单
                   </button>
                 )}
                 <button 
                    onClick={handleUpdateDetail}
                    disabled={isSaving}
                    className="bg-indigo-600 text-white px-12 py-3.5 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                 >
                   {isSaving ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                   保存并更新计划内容
                 </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* 点击「已生成采购单」后展示该物料关联的采购订单 */}
      {relatedPOsMaterialId && (() => {
        const list = relatedPOsByMaterial[relatedPOsMaterialId] || [];
        const materialName = products.find(p => p.id === relatedPOsMaterialId)?.name || '未知物料';
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setRelatedPOsMaterialId(null)} />
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                  相关采购订单 — {materialName}
                </h3>
                <button type="button" onClick={() => setRelatedPOsMaterialId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                {list.length === 0 ? (
                  <p className="px-6 py-8 text-center text-slate-400 text-sm">暂无记录</p>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">供应商</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">订购数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已收</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.map((r: any, i: number) => {
                        const received = receivedByOrderLine[`${r.docNumber}::${r.id}`] ?? 0;
                        const ordered = r.quantity ?? 0;
                        return (
                        <tr key={r.id || i} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-xs font-bold text-slate-700">{r.docNumber ?? '—'}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-700">{r.partner ?? '—'}</td>
                          <td className="px-4 py-3 text-xs font-black text-indigo-600 text-right">{Number(ordered).toFixed(2)} {relatedPOsMaterialId ? getUnitName(relatedPOsMaterialId) : 'PCS'}</td>
                          <td className="px-4 py-3 text-xs font-bold text-right">{Number(received).toFixed(2)} <span className="text-slate-400 font-normal">/ {Number(ordered).toFixed(2)}</span></td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
                <button type="button" onClick={() => setRelatedPOsMaterialId(null)} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">关闭</button>
              </div>
            </div>
    </div>
  );
      })()}

      {splitPlan && (
        <SplitPlanModal
          plan={splitPlan}
          products={products}
          dictionaries={dictionaries}
          onSplit={onSplitPlan}
          onClose={() => setSplitPlanId(null)}
        />
      )}

      {/* 列表打印：选择模版（仅计划单列表样式，单品码标签请在计划详情「单品码一览」中打印） */}
      {planPrintPickerOpen && planPrintPickerPlan && (() => {
        const pickerPlan = planPrintPickerPlan;

        const handlePickListTemplate = (t: PrintTemplate) => {
          setPlanListPrintRun({ template: t, plan: pickerPlan });
          setPlanPrintPickerOpen(false);
          setPlanPrintPickerPlan(null);
        };

        return (
        <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() => {
              setPlanPrintPickerOpen(false);
              setPlanPrintPickerPlan(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-900">选择打印模版</h3>
                <p className="mt-0.5 text-xs text-slate-500">计划单 {pickerPlan.planNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlanPrintPickerOpen(false);
                  setPlanPrintPickerPlan(null);
                }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="max-h-[min(40vh,280px)] divide-y divide-slate-100 overflow-y-auto p-2">
              {planListPrintPickerTemplates.length === 0 ? (
                <li className="text-center py-6 text-xs text-slate-400">暂无可用模版</li>
              ) : planListPrintPickerTemplates.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handlePickListTemplate(t)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-indigo-50"
                  >
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="shrink-0 text-xs font-bold text-indigo-600">
                      {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        );
      })()}

      {/* 计划详情：单品码标签打印 */}
      {itemCodePrintOpen && itemCodePrintPlan && (() => {
        const pickerPlan = itemCodePrintPlan;
        const pickerProduct = products.find(p => p.id === pickerPlan.productId);

        const handleItemCodeTemplatePick = (t: PrintTemplate) => {
          const selectedCodes = itemCodePrintCodes.filter(c => itemCodePrintSelectedIds.has(c.id));
          if (selectedCodes.length === 0) {
            toast.error('请至少勾选一个单品码');
            return;
          }
          const orders2 = (orders ?? []).filter((o: any) => o.planOrderId === pickerPlan.id);
          const ctx2: ItemCodePrintContext = {
            planNumber: pickerPlan.planNumber,
            productName: pickerProduct?.name ?? '',
            orderNumbers: orders2.map((o: any) => o.orderNumber),
            variants: pickerProduct?.variants ?? [],
          };
          const baseUrl = window.location.origin;
          const rows = buildPrintListRowsFromItemCodes(selectedCodes, ctx2, dictionaries, baseUrl);
          setPlanListPrintRun({
            template: t,
            plan: { ...pickerPlan, _printListRows: rows, _labelPerRow: true } as any,
          });
          setItemCodePrintOpen(false);
          setItemCodePrintPlan(null);
          setItemCodePrintSelectedIds(new Set());
        };

        return (
        <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() => {
              setItemCodePrintOpen(false);
              setItemCodePrintPlan(null);
              setItemCodePrintSelectedIds(new Set());
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-900">打印单品码标签</h3>
                <p className="mt-0.5 text-xs text-slate-500">计划单 {pickerPlan.planNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setItemCodePrintOpen(false);
                  setItemCodePrintPlan(null);
                  setItemCodePrintSelectedIds(new Set());
                }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 max-h-48 overflow-y-auto">
              {itemCodePrintLoading ? (
                <div className="text-center py-4 text-xs text-slate-400">加载中...</div>
              ) : itemCodePrintCodes.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">暂无单品码，请先生成单品码</div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-400">
                    已加载 {itemCodePrintCodes.length} 条（最多 500 条；超出时请用规格/批次筛选后分批打印）
                  </p>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded text-indigo-600"
                        checked={itemCodePrintSelectedIds.size === itemCodePrintCodes.length && itemCodePrintCodes.length > 0}
                        onChange={e => {
                          setItemCodePrintSelectedIds(
                            e.target.checked ? new Set(itemCodePrintCodes.map(c => c.id)) : new Set(),
                          );
                        }}
                      />
                      全选（{itemCodePrintSelectedIds.size}/{itemCodePrintCodes.length}）
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {itemCodePrintCodes.map(code => {
                      const variant = pickerProduct?.variants.find(v => v.id === code.variantId);
                      const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                      const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                      const vLabel = [color?.name, size?.name].filter(Boolean).join('-') || variant?.skuSuffix || '';
                      return (
                        <label
                          key={code.id}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${itemCodePrintSelectedIds.has(code.id) ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3 rounded text-indigo-600"
                            checked={itemCodePrintSelectedIds.has(code.id)}
                            onChange={e => {
                              const next = new Set(itemCodePrintSelectedIds);
                              if (e.target.checked) next.add(code.id);
                              else next.delete(code.id);
                              setItemCodePrintSelectedIds(next);
                            }}
                          />
                          {formatItemCodeSerialLabel(pickerPlan.planNumber, code.serialNo)}
                          {vLabel ? ` · ${vLabel}` : ''}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <ul className="max-h-[min(40vh,280px)] divide-y divide-slate-100 overflow-y-auto p-2">
              {labelPrintPickerTemplates.length === 0 ? (
                <li className="text-center py-6 text-xs text-slate-400">
                  暂无标签打印模版，请在「表单配置 → 打印模版」中配置标签白名单
                </li>
              ) : labelPrintPickerTemplates.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handleItemCodeTemplatePick(t)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-indigo-50"
                  >
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="shrink-0 text-xs font-bold text-indigo-600">
                      {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        );
      })()}

      {/* 批次码：选择标签模版 */}
      {batchPrintModal && (() => {
        const { plan, batch } = batchPrintModal;
        const prod = products.find(p => p.id === plan.productId);
        const variant = batch.variantId ? prod?.variants.find(v => v.id === batch.variantId) : null;
        const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
        const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
        const variantLabel = variant
          ? [color?.name, size?.name].filter(Boolean).join('-') || variant.skuSuffix || ''
          : '';
        const pickTemplate = (t: PrintTemplate) => {
          const orders2 = (orders ?? []).filter((o: ProductionOrder) => o.planOrderId === plan.id);
          const vbRow = buildVirtualBatchPrintRow(
            batch,
            {
              planNumber: plan.planNumber,
              productName: prod?.name ?? '',
              sku: prod?.sku ?? '',
              orderNumbers: orders2.map(o => o.orderNumber).filter(Boolean).join(', '),
              variantLabel,
              colorName: color?.name ?? '',
              sizeName: size?.name ?? '',
            },
            window.location.origin,
          );
          setPlanListPrintRun({ template: t, plan: { ...plan, _virtualBatch: vbRow } as any });
          setBatchPrintModal(null);
        };
        return (
          <div className="fixed inset-0 z-[73] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              aria-label="关闭"
              onClick={() => setBatchPrintModal(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">打印批次标签</h3>
                  <p className="mt-0.5 text-xs text-slate-500 break-all">
                    {batch.sequenceNo != null ? formatBatchSerialLabel(plan.planNumber, batch.sequenceNo) : '—'} · {batch.quantity} 件{variantLabel ? ` · ${variantLabel}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchPrintModal(null)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ul className="max-h-[min(40vh,280px)] divide-y divide-slate-100 overflow-y-auto p-2">
                {labelPrintPickerTemplates.length === 0 ? (
                  <li className="text-center py-6 text-xs text-slate-400">
                    暂无标签打印模版，请在「表单配置 → 打印模版」中配置标签白名单
                  </li>
                ) : (
                  labelPrintPickerTemplates.map(t => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => pickTemplate(t)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-indigo-50"
                      >
                        <span className="min-w-0 truncate">{t.name}</span>
                        <span className="shrink-0 text-xs font-bold text-indigo-600">
                          {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        );
      })()}

      {/* 计划单表单配置弹窗 */}
      <PlanFormConfigModal
        open={showPlanFormConfigModal}
        onClose={() => setShowPlanFormConfigModal(false)}
        settings={planFormSettings}
        onSave={onUpdatePlanFormSettings}
        productionLinkMode={productionLinkMode}
        printTemplates={printTemplates}
        onUpdatePrintTemplates={onUpdatePrintTemplates}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
        planFormSettings={planFormSettings}
        plans={plans}
        orders={orders}
        products={products}
      />

      {/* 点击产品图查看大图 */}
      {imagePreviewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 animate-in fade-in" onClick={() => setImagePreviewUrl(null)}>
          <img src={imagePreviewUrl} alt="大图" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          <button type="button" onClick={() => setImagePreviewUrl(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all"><X className="w-6 h-6" /></button>
        </div>
      )}

      {/* 文件预览弹窗 (图片/PDF) */}
      {filePreviewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm" onClick={() => setFilePreviewUrl(null)}>
          <button onClick={() => setFilePreviewUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
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

      {/* 商品信息详情弹窗 */}
      {viewProductId && (() => {
        const p = products.find(x => x.id === viewProductId);
        const cat = p && categories.find(c => c.id === p.categoryId);
        const unitName = p?.unitId ? dictionaries.units?.find(u => u.id === p.unitId)?.name : '件';
        if (!p) return null;
        return (
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setViewProductId(null)} />
            <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-16 h-16 rounded-2xl object-cover border border-slate-200" />
                  ) : (
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-400"><Package className="w-8 h-8" /></div>
                  )}
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{p.name}</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">SKU: {p.sku} · {cat?.name || '未分类'}</p>
                  </div>
                </div>
                <button onClick={() => setViewProductId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {(p.salesPrice ?? 0) > 0 && (
                    <div className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">销售单价</p>
                      <p className="text-lg font-black text-indigo-600">¥ {(p.salesPrice ?? 0).toLocaleString()} <span className="text-slate-500 font-bold">{unitName}</span></p>
                    </div>
                  )}
                  {(p.purchasePrice ?? 0) > 0 && (
                    <div className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">采购单价</p>
                      <p className="text-lg font-black text-slate-600">¥ {(p.purchasePrice ?? 0).toLocaleString()} <span className="text-slate-500 font-bold">{unitName}</span></p>
                    </div>
                  )}
                  {p.supplierId && (() => {
                    const supplier = partners.find(pt => pt.id === p.supplierId);
                    return supplier ? (
                      <div className="bg-slate-50 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">供应商</p>
                        <p className="text-sm font-bold text-slate-700">{supplier.name}</p>
                      </div>
                    ) : null;
                  })()}
                  {(!((p.salesPrice ?? 0) > 0) && !((p.purchasePrice ?? 0) > 0)) && (
                    <div className="col-span-2 bg-slate-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">单位</p>
                      <p className="text-sm font-bold text-slate-700">{unitName}</p>
                    </div>
                  )}
                </div>
                {cat?.customFields && cat.customFields.length > 0 && p.categoryCustomData && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> 扩展属性</h3>
                    <div className="flex flex-wrap gap-2">
                      {cat.customFields.map(f => {
                        const val = p.categoryCustomData?.[f.id];
                        if (val == null || val === '') return null;
                        if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                          const isImg = val.startsWith('data:image/');
                          const isPdf = val.startsWith('data:application/pdf');
                          if (isImg) return (
                            <div key={f.id} className="flex items-center gap-2">
                              <img src={val} alt={f.label} className="h-12 w-12 object-cover rounded-xl border cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={() => { setFilePreviewUrl(val); setFilePreviewType('image'); }} />
                              <a href={val} download={`${f.label}.${getFileExtFromDataUrl(val)}`} className="text-xs font-bold text-indigo-600 hover:underline">下载</a>
                            </div>
                          );
                          if (isPdf) return (
                            <div key={f.id} className="flex items-center gap-2">
                              <button type="button" onClick={() => { setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100">在线查看</button>
                              <a href={val} download={`${f.label}.${getFileExtFromDataUrl(val)}`} className="text-xs font-bold text-indigo-600 hover:underline">下载</a>
                            </div>
                          );
                          return (
                            <a key={f.id} href={val} download={`${f.label}.${getFileExtFromDataUrl(val)}`} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-indigo-50">下载</a>
                          );
                        }
                        return (
                          <div key={f.id} className="px-3 py-1.5 bg-slate-100 rounded-lg">
                            <span className="text-[10px] font-bold text-slate-400">{f.label}: </span>
                            <span className="text-sm font-bold text-slate-700">{typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Wrench className="w-3.5 h-3.5" /> 工序</h3>
                  <div className="flex flex-wrap gap-2">
                    {(p.milestoneNodeIds || []).map(nodeId => {
                      const node = globalNodes.find(n => n.id === nodeId);
                      return node ? (
                        <span key={nodeId} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold">{node.name}</span>
                      ) : null;
                    })}
                    {(!p.milestoneNodeIds || p.milestoneNodeIds.length === 0) && (
                      <span className="text-sm text-slate-400 italic">暂无工序</span>
                    )}
                  </div>
                </div>
                {(() => {
                  const productBoms = boms.filter(b => b.parentProductId === p.id);
                  const hasBomNodes = (p.milestoneNodeIds || []).some(nid => globalNodes.find(n => n.id === nid)?.hasBOM);
                  const singleSkuId = `single-${p.id}`;
                  const skuOptions: { id: string; label: string }[] = p.variants && p.variants.length > 0
                    ? p.variants.map(v => ({
                        id: v.id,
                        label: [dictionaries.colors?.find(c => c.id === v.colorId)?.name, dictionaries.sizes?.find(s => s.id === v.sizeId)?.name].filter(Boolean).join(' / ') || v.skuSuffix
                      }))
                    : [{ id: singleSkuId, label: '单 SKU' }];
                  const selectedSkuBoms = viewProductBomSkuId ? productBoms.filter(b => b.variantId === viewProductBomSkuId) : [];
                  return (productBoms.length > 0 || hasBomNodes) ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Boxes className="w-3.5 h-3.5" /> 工艺 BOM</h3>
                        {viewProductBomSkuId && (
                          <button type="button" onClick={() => setViewProductBomSkuId(null)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                            <ArrowLeft className="w-3 h-3" /> 返回选择
                          </button>
                        )}
                      </div>
                      {!viewProductBomSkuId ? (
                        <div className="space-y-2">
                          <p className="text-sm text-slate-500">点击 SKU 查看该规格的 BOM 明细</p>
                          <div className="flex flex-wrap gap-2">
                            {skuOptions.map(opt => {
                              const hasBom = productBoms.some(b => b.variantId === opt.id);
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setViewProductBomSkuId(opt.id)}
                                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${hasBom ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}
                                >
                                  {opt.label}
                                  {!hasBom && <span className="text-[10px] ml-1">(未配置)</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : selectedSkuBoms.length > 0 ? (
                        <div className="space-y-4">
                          <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl w-fit">
                            当前查看：{skuOptions.find(o => o.id === viewProductBomSkuId)?.label || '该规格'}
                          </p>
                          {selectedSkuBoms.map(bom => {
                            const nodeName = bom.nodeId ? globalNodes.find(n => n.id === bom.nodeId)?.name : null;
                            return (
                              <div key={bom.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                {nodeName && <p className="text-[10px] font-bold text-indigo-600 mb-2">{nodeName}</p>}
                                <div className="space-y-1.5">
                                  {bom.items.map((item, idx) => {
                                    const subProd = products.find(x => x.id === item.productId);
                                    const subUnit = subProd?.unitId ? dictionaries.units?.find(u => u.id === subProd.unitId)?.name : '件';
                                    return (
                                      <div key={idx} className="flex justify-between items-center text-sm">
                                        <span className="font-bold text-slate-700 truncate flex-1">{subProd?.name || subProd?.sku || '未知物料'}</span>
                                        <span className="text-slate-500 font-medium shrink-0 ml-2">{item.quantity} {subUnit}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic py-2">该规格尚未配置 BOM 物料明细</p>
                      )}
                    </div>
                  ) : null;
                })()}
                {cat?.hasColorSize && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> 颜色尺码</h3>
                    <div className="space-y-2">
                      {p.colorIds && p.colorIds.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 mb-1.5">颜色</p>
                          <div className="flex flex-wrap gap-2">
                            {(p.colorIds || []).map(cId => {
                              const c = dictionaries.colors?.find(x => x.id === cId);
                              return c ? (
                                <span key={cId} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl text-sm font-bold text-slate-700">
                                  <span className="w-2.5 h-2.5 rounded-full border border-slate-200" style={{ backgroundColor: c.value }} />
                                  {c.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      )}
                      {p.sizeIds && p.sizeIds.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 mb-1.5">尺码</p>
                          <div className="flex flex-wrap gap-2">
                            {(p.sizeIds || []).map(sId => {
                              const s = dictionaries.sizes?.find(x => x.id === sId);
                              return s ? (
                                <span key={sId} className="px-3 py-1.5 bg-slate-50 rounded-xl text-sm font-bold text-slate-700">{s.name}</span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
};

export default PlanOrderListView;
