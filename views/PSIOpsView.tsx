import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { 
  Plus, 
  X, 
  Clock, 
  Package, 
  User, 
  Hash,
  AlertCircle,
  ArrowRight,
  Boxes,
  Warehouse as WarehouseIcon,
  ChevronRight,
  ChevronDown,
  Tag,
  LayoutGrid,
  List,
  MoveRight,
  TrendingDown,
  TrendingUp,
  ArrowRightCircle,
  Search,
  Filter,
  Layers,
  FileText,
  Building2,
  CheckCircle2,
  ShoppingCart,
  CheckSquare,
  Square,
  ClipboardList,
  ArrowDownToLine,
  ListFilter,
  Briefcase,
  ArrowLeft,
  Save,
  Trash2,
  Sliders,
  PackageCheck,
  Pencil,
  Check,
  ScrollText
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchableProductSelect } from '../components/SearchableProductSelect';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries, ProductVariant, PurchaseOrderFormSettings, PurchaseBillFormSettings } from '../types';
import { sortedVariantColorEntries, sortedColorEntries } from '../utils/sortVariantsByProduct';
import { useProgressiveList } from '../hooks/useProgressiveList';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  moduleHeaderRowClass,
  outlineAccentToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  secondaryToolbarButtonClass,
  sectionTitleClass,
} from '../styles/uiDensity';
import { useConfirm } from '../contexts/ConfirmContext';

interface PSIOpsViewProps {
  type: string;
  products: Product[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  records: any[];
  purchaseOrderFormSettings?: PurchaseOrderFormSettings;
  onUpdatePurchaseOrderFormSettings?: (settings: PurchaseOrderFormSettings) => void;
  purchaseBillFormSettings?: PurchaseBillFormSettings;
  onUpdatePurchaseBillFormSettings?: (settings: PurchaseBillFormSettings) => void;
  onAddRecord: (record: any) => void;
  onAddRecordBatch?: (records: any[]) => Promise<void>;
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  /** 当进入订单/单据详情页时通知父组件，用于隐藏顶部标签 */
  onDetailViewChange?: (isDetail: boolean) => void;
  /** 生产操作记录（入仓流水合并生产入库 STOCK_IN 用） */
  prodRecords?: any[];
  /** 工单列表（生产入库行显示工单号用） */
  orders?: { id: string; orderNumber?: string }[];
  userPermissions?: string[];
  tenantRole?: string;
}

// 增强型合作伙伴选择器
const PartnerSelector = ({ 
  partners = [], 
  categories = [],
  value, 
  onChange, 
  placeholder,
  label,
  triggerClassName = '',
}: { 
  partners: Partner[]; 
  categories: PartnerCategory[];
  value: string; 
  onChange: (partnerName: string, partnerId?: string) => void; 
  placeholder?: string;
  label: string;
  /** 触发按钮内文字字号，与基本信息/订单详情表单对齐 */
  triggerClassName?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const categoryMapPSI = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const filteredOptions = useMemo(() => {
    return partners.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
      return matchesSearch && matchesCategory;
    });
  }, [partners, search, activeTab]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between transition-all h-[52px]"
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <Building2 className={`w-4 h-4 shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={`truncate ${value ? 'text-slate-900' : 'text-slate-400'} ${triggerClassName || 'text-sm'}`}>
            {value || placeholder || '点击选择单位...'}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : 'text-slate-400'}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-3xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95">
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              className="w-full bg-slate-50 border-none rounded-xl py-3 pl-11 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="搜索单位名称..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
            <button 
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            >
              全部
            </button>
            {categories.map(cat => (
              <button 
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === cat.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
            {filteredOptions.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  onChange(p.name, p.id);
                  setIsOpen(false);
                  setSearch('');
                }}
                className={`w-full text-left p-3 rounded-2xl transition-all border-2 ${
                  p.name === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex justify-between items-center">
                  <p className="text-sm font-black truncate">{p.name}</p>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[8px] font-black uppercase">
                    {categoryMapPSI.get(p.categoryId)?.name || '未分类'}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{p.contact}</p>
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div className="py-10 text-center">
                <Briefcase className="w-8 h-8 text-slate-100 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">未找到符合条件的单位</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PSIOpsView: React.FC<PSIOpsViewProps> = ({ type, products, warehouses, categories, partners, partnerCategories, dictionaries, records, purchaseOrderFormSettings = { standardFields: [], customFields: [] }, onUpdatePurchaseOrderFormSettings, purchaseBillFormSettings = { standardFields: [], customFields: [] }, onUpdatePurchaseBillFormSettings, onAddRecord, onAddRecordBatch, onReplaceRecords, onDeleteRecords, onDetailViewChange, prodRecords = [], orders = [], userPermissions, tenantRole }) => {
  const confirm = useConfirm();
  const _isOwner = tenantRole === 'owner';
  const hasPsiPerm = (perm: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('psi') && !userPermissions.some(p => p.startsWith('psi:'))) return true;
    if (userPermissions.includes(perm)) return true;
    if (userPermissions.some(p => p.startsWith(`${perm}:`))) return true;
    return false;
  };
  const ordersList = orders ?? [];
  const recordsList = records ?? [];
  const safePurchaseOrderFormSettings = { standardFields: purchaseOrderFormSettings?.standardFields ?? [], customFields: purchaseOrderFormSettings?.customFields ?? [] };
  const safePurchaseBillFormSettings = { standardFields: purchaseBillFormSettings?.standardFields ?? [], customFields: purchaseBillFormSettings?.customFields ?? [] };
  const productMapPSI = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const warehouseMapPSI = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses]);
  const categoryMapPSI = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const getUnitName = (productId: string) => {
    const p = productMapPSI.get(productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };
  /** 数量列展示：转为数字去掉前导零，如 "035" 千克 -> 35 千克 */
  const formatQtyDisplay = (q: number | string | undefined | null): number => {
    if (q == null || q === '') return 0;
    const n = Number(q);
    return Number.isFinite(n) ? n : 0;
  };

  // 仓库管理子视图状态
  const [inventoryViewMode, setInventoryViewMode] = useState<'warehouse' | 'product'>('warehouse');
  /** 按仓库查看时，选中要查看详情的仓库 id；null 表示显示仓库列表 */
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  /** 按仓库详情里展开规格明细的行，key 为 warehouseId-productId */
  const [expandedWarehouseProductKeys, setExpandedWarehouseProductKeys] = useState<Set<string>>(new Set());
  /** 按物料表格里展开规格明细的产品 id */
  const [expandedProductIdByMaterial, setExpandedProductIdByMaterial] = useState<string | null>(null);
  /** 仓库管理：点击产品图放大查看 */
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  /** 仓库管理：仓库流水弹窗 */
  const [warehouseFlowModalOpen, setWarehouseFlowModalOpen] = useState(false);
  /** 仓库流水：点击详情的单据 key（type|docNumber） */
  const [warehouseFlowDetailKey, setWarehouseFlowDetailKey] = useState<string | null>(null);
  /** 仓库流水筛选 */
  const [whFlowDateFrom, setWhFlowDateFrom] = useState('');
  const [whFlowDateTo, setWhFlowDateTo] = useState('');
  const [whFlowType, setWhFlowType] = useState<string>('all');
  const [whFlowWarehouse, setWhFlowWarehouse] = useState<string>('all');
  const [whFlowDocNo, setWhFlowDocNo] = useState('');
  const [whFlowProduct, setWhFlowProduct] = useState('');
  /** 仓库管理：产品流水详情弹窗（产品+可选仓库），null 为关闭 */
  const [productFlowDetail, setProductFlowDetail] = useState<{ productId: string; productName: string; warehouseId: string | null; warehouseName: string | null } | null>(null);
  /** 产品流水详情弹窗：筛选（开始时间、结束时间、类型、仓库），参考领料退料流水 */
  const [productFlowDateFrom, setProductFlowDateFrom] = useState('');
  const [productFlowDateTo, setProductFlowDateTo] = useState('');
  const [productFlowType, setProductFlowType] = useState<string>('all');
  const [productFlowWarehouseId, setProductFlowWarehouseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  /** 调拨单弹窗 */
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<{ fromWarehouseId: string; toWarehouseId: string; transferDate: string; note: string }>({
    fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().split('T')[0], note: ''
  });
  const [transferItems, setTransferItems] = useState<{ id: string; productId: string; quantity?: number; variantQuantities?: Record<string, number> }[]>([]);
  /** 当前编辑的调拨单单号（保存后清空） */
  const [editingTransferDocNumber, setEditingTransferDocNumber] = useState<string | null>(null);
  /** 调拨单列表弹窗是否打开 */
  const [transferListModalOpen, setTransferListModalOpen] = useState(false);
  /** 在列表弹窗中查看详情的单号，null 表示显示列表 */
  const [transferDetailDocNumber, setTransferDetailDocNumber] = useState<string | null>(null);

  /** 盘点单：列表弹窗、详情单号、表单弹窗、编辑单号 */
  const [stocktakeListModalOpen, setStocktakeListModalOpen] = useState(false);
  const [stocktakeDetailDocNumber, setStocktakeDetailDocNumber] = useState<string | null>(null);
  const [stocktakeModalOpen, setStocktakeModalOpen] = useState(false);
  const [stocktakeForm, setStocktakeForm] = useState<{ warehouseId: string; stocktakeDate: string; note: string }>({
    warehouseId: '', stocktakeDate: new Date().toISOString().split('T')[0], note: ''
  });
  const [stocktakeItems, setStocktakeItems] = useState<{ id: string; productId: string; quantity?: number; variantQuantities?: Record<string, number> }[]>([]);
  const [editingStocktakeDocNumber, setEditingStocktakeDocNumber] = useState<string | null>(null);

  const [showModal, setShowModal] = useState<string | null>(null); 
  const [creationMethod, setCreationMethod] = useState<'MANUAL' | 'FROM_ORDER'>('MANUAL');
  const [selectedPOOrderNums, setSelectedPOOrderNums] = useState<string[]>([]);
  const [selectedPOItemIds, setSelectedPOItemIds] = useState<string[]>([]); // 存储选中的具体明细ID
  const [selectedPOItemQuantities, setSelectedPOItemQuantities] = useState<Record<string, number>>({}); // 每条选中行的本次入库数量
  const [selectedPOItemBatches, setSelectedPOItemBatches] = useState<Record<string, string>>({}); // 每条选中行的批次（引用订单生成时）

  const [form, setForm] = useState<any>({
    productId: '',
    warehouseId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: 0,
    actualQuantity: 0,
    purchasePrice: 0,
    partner: '',
    partnerId: '',
    note: '',
    docNumber: '',
    dueDate: '',
    createdAt: new Date().toISOString().split('T')[0],
    customData: {} as Record<string, any>
  });

  // 采购订单行项目（支持多产品；开启颜色尺码的产品使用 variantQuantities；sourceRecordIds 用于编辑时计算已入库）
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<{ id: string; productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; sourceRecordIds?: string[] }[]>([]);
  // 手动创建采购单的行项目（支持多产品）
  const [purchaseBillItems, setPurchaseBillItems] = useState<{ id: string; productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; batch?: string }[]>([]);
  // 销售订单行项目（支持多产品；有颜色尺码用 variantQuantities，无则用 quantity；销售价 salesPrice）
  const [salesOrderItems, setSalesOrderItems] = useState<{ id: string; productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number>; sourceRecordIds?: string[] }[]>([]);
  // 销售单行项目（同销售订单结构，出库需选仓库）
  const [salesBillItems, setSalesBillItems] = useState<{ id: string; productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number>; sourceRecordIds?: string[] }[]>([]);

  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  // 当前是否处于采购订单编辑模式（存原始单号）
  const [editingPODocNumber, setEditingPODocNumber] = useState<string | null>(null);
  const [showPOFormConfigModal, setShowPOFormConfigModal] = useState(false);
  const [poFormConfigDraft, setPOFormConfigDraft] = useState<PurchaseOrderFormSettings | null>(null);
  const [showPBFormConfigModal, setShowPBFormConfigModal] = useState(false);
  const [pbFormConfigDraft, setPBFormConfigDraft] = useState<PurchaseBillFormSettings | null>(null);
  // 采购单详情查看/删除（存单号）
  const [editingPBDocNumber, setEditingPBDocNumber] = useState<string | null>(null);
  // 销售订单详情编辑（存单号）
  const [editingSODocNumber, setEditingSODocNumber] = useState<string | null>(null);
  // 销售单详情编辑（存单号）
  const [editingSBDocNumber, setEditingSBDocNumber] = useState<string | null>(null);
  // 销售订单列表 - 配货弹窗：当前行 { docNumber, lineGroupId, product, grp }
  const [allocationModal, setAllocationModal] = useState<{ docNumber: string; lineGroupId: string; product: Product; grp: any[] } | null>(null);
  // 配货弹窗内输入的配货数量：无规格时为 number，有规格时为 { variantId: number }
  const [allocationQuantities, setAllocationQuantities] = useState<number | Record<string, number> | null>(null);
  // 配货弹窗选择的出库仓库
  const [allocationWarehouseId, setAllocationWarehouseId] = useState<string>('');

  // 切换标签时清除新增/编辑状态，避免出现不匹配的弹窗
  useEffect(() => {
    setShowModal(null);
    setEditingPODocNumber(null);
    setEditingPBDocNumber(null);
    setEditingSODocNumber(null);
    setEditingSBDocNumber(null);
    setShowPendingShipmentModal(false);
  }, [type]);

  // 订单/单据详情页时通知父组件隐藏顶部标签
  const isDetailView = (type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') || (type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL') || (type === 'SALES_ORDER' && showModal === 'SALES_ORDER') || (type === 'SALES_BILL' && showModal === 'SALES_BILL');
  useEffect(() => {
    onDetailViewChange?.(isDetailView);
  }, [isDetailView, onDetailViewChange]);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const bizConfig: Record<string, any> = {
    'PURCHASE_ORDER': { label: '采购订单', color: 'bg-indigo-600', partnerLabel: '供应商', prefix: 'PO', hideWarehouse: true },
    'PURCHASE_BILL': { label: '采购单', color: 'bg-indigo-600', partnerLabel: '供应商', prefix: 'PB' },
    'SALES_ORDER': { label: '销售订单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'SO', hideWarehouse: true },
    'SALES_BILL': { label: '销售单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'SB' },
    'WAREHOUSE_MGMT': { label: '仓库管理', color: 'bg-indigo-600', sub: '全方位的仓库业务控制中心' },
  };

  const current = bizConfig[type];

  // 待发货清单：搜索与勾选
  const [pendingShipSearchDoc, setPendingShipSearchDoc] = useState('');
  const [pendingShipSearchProduct, setPendingShipSearchProduct] = useState('');
  const [pendingShipSearchPartner, setPendingShipSearchPartner] = useState('');
  const [pendingShipSearchWarehouse, setPendingShipSearchWarehouse] = useState('');
  const [pendingShipSelectedIds, setPendingShipSelectedIds] = useState<Set<string>>(new Set());
  /** 销售订单下：待发货清单是否以弹窗形式打开 */
  const [showPendingShipmentModal, setShowPendingShipmentModal] = useState(false);
  /** 待发货清单 - 详情弹窗：当前选中的分组（按 lineGroupId 一组，有颜色尺码时一行显示总数） */
  const [pendingShipDetailGroup, setPendingShipDetailGroup] = useState<{
    groupKey: string;
    docNumber: string;
    productId: string;
    productName: string;
    productSku: string;
    partner: string;
    warehouseId: string;
    warehouseName: string;
    totalQuantity: number;
    records: any[];
  } | null>(null);
  /** 待发货详情 - 编辑态：各行的已配数量（variantId -> qty 或 单行 quantity） */
  const [pendingShipDetailEdit, setPendingShipDetailEdit] = useState<Record<string, number> | number | null>(null);
  /** 待发货详情 - 编辑态：配货仓库（出库仓库） */
  const [pendingShipDetailEditWarehouseId, setPendingShipDetailEditWarehouseId] = useState<string | null>(null);

  // 解析记录时间戳（用于排序和比较）：优先 _savedAtMs（可靠毫秒戳），其次尝试解析 createdAt（ISO 日期）
  const parseRecordTime = useCallback((r: any): number => {
    if (typeof r._savedAtMs === 'number') return r._savedAtMs;
    for (const key of ['timestamp', 'createdAt']) {
      const t = r[key];
      if (t) { const d = new Date(t); if (!isNaN(d.getTime())) return d.getTime(); }
    }
    return 0;
  }, []);

  // ── 库存预聚合索引：一次遍历 recordsList + prodRecords，后续 O(1) 查询 ──
  type WhBucket = { psiIn: number; psiOut: number; transferIn: number; transferOut: number; prodIn: number; prodOut: number; stocktakeAdj: number; stocktakeByDoc: Map<string, number> };
  type TimedQty = { time: number; qty: number };
  type VarBucket = { psiIn: number; psiOut: number; transferIn: number; transferOut: number; prodIn: number; prodOut: number; stocktakeRecords: { time: number; qty: number; sysQty: number; id: string }[]; psiInRecords: TimedQty[]; psiOutRecords: TimedQty[]; prodInRecords: TimedQty[]; prodOutRecords: TimedQty[] };

  const stockIndex = useMemo(() => {
    const whMap = new Map<string, WhBucket>();
    const varMap = new Map<string, VarBucket>();

    const getWh = (pId: string, whId: string): WhBucket => {
      const k = `${pId}::${whId}`;
      let b = whMap.get(k);
      if (!b) { b = { psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeAdj: 0, stocktakeByDoc: new Map() }; whMap.set(k, b); }
      return b;
    };
    const getVar = (pId: string, whId: string, vId: string): VarBucket => {
      const k = `${pId}::${whId}::${vId}`;
      let b = varMap.get(k);
      if (!b) { b = { psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeRecords: [], psiInRecords: [], psiOutRecords: [], prodInRecords: [], prodOutRecords: [] }; varMap.set(k, b); }
      return b;
    };
    const pTime = (r: any): number => {
      if (typeof r._savedAtMs === 'number') return r._savedAtMs;
      for (const key of ['timestamp', 'createdAt']) { const t = r[key]; if (t) { const d = new Date(t); if (!isNaN(d.getTime())) return d.getTime(); } }
      return 0;
    };

    for (const r of recordsList) {
      const pId = r.productId;
      if (!pId) continue;
      const wh = r.warehouseId || '';
      const vId = (r as any).variantId || '';
      const qty = Number(r.quantity) || 0;
      const time = pTime(r);

      if (r.type === 'PURCHASE_BILL') {
        if (wh) { const wb = getWh(pId, wh); wb.psiIn += qty; if (vId) { const vb = getVar(pId, wh, vId); vb.psiIn += qty; vb.psiInRecords.push({ time, qty }); } }
      } else if (r.type === 'SALES_BILL') {
        if (wh) { const wb = getWh(pId, wh); wb.psiOut += qty; if (vId) { const vb = getVar(pId, wh, vId); vb.psiOut += qty; vb.psiOutRecords.push({ time, qty }); } }
      } else if (r.type === 'TRANSFER') {
        const toWh = (r as any).toWarehouseId as string | undefined;
        const fromWh = (r as any).fromWarehouseId as string | undefined;
        if (toWh) { const wb = getWh(pId, toWh); wb.transferIn += qty; if (vId) { const vb = getVar(pId, toWh, vId); vb.transferIn += qty; vb.psiInRecords.push({ time, qty }); } }
        if (fromWh) { const wb = getWh(pId, fromWh); wb.transferOut += qty; if (vId) { const vb = getVar(pId, fromWh, vId); vb.transferOut += qty; vb.psiOutRecords.push({ time, qty }); } }
      } else if (r.type === 'STOCKTAKE') {
        if (wh) {
          const wb = getWh(pId, wh);
          const diff = Number(r.diffQuantity) || 0;
          wb.stocktakeAdj += diff;
          const doc = r.docNumber || '';
          wb.stocktakeByDoc.set(doc, (wb.stocktakeByDoc.get(doc) || 0) + diff);
          if (vId && typeof (r as any).systemQuantity === 'number') {
            getVar(pId, wh, vId).stocktakeRecords.push({ time, qty, sysQty: (r as any).systemQuantity, id: r.id });
          }
        }
      }
    }

    for (const r of (prodRecords || []) as any[]) {
      const pId = r.productId;
      if (!pId) continue;
      const wh = r.warehouseId || '';
      const vId = r.variantId || '';
      const qty = Number(r.quantity) || 0;
      const time = pTime(r);

      if (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') {
        if (wh) { getWh(pId, wh).prodIn += qty; const vb = getVar(pId, wh, vId); vb.prodIn += qty; vb.prodInRecords.push({ time, qty }); }
      } else if (r.type === 'STOCK_OUT') {
        if (wh) { getWh(pId, wh).prodOut += qty; const vb = getVar(pId, wh, vId); vb.prodOut += qty; vb.prodOutRecords.push({ time, qty }); }
      }
    }

    return { whMap, varMap };
  }, [recordsList, prodRecords]);

  // ── 库存查询函数（O(1) 查表） ──
  const getStock = useCallback((pId: string, whId?: string, excludeDocNumber?: string) => {
    if (!whId) return 0;
    const b = stockIndex.whMap.get(`${pId}::${whId}`);
    if (!b) return 0;
    const ins = b.psiIn + b.transferIn + b.prodIn;
    const outs = b.psiOut + b.transferOut + b.prodOut;
    const adj = b.stocktakeAdj - (excludeDocNumber ? (b.stocktakeByDoc.get(excludeDocNumber) || 0) : 0);
    return ins - outs + adj;
  }, [stockIndex]);

  const getStockVariant = useCallback((pId: string, whId: string | undefined, variantId: string) => {
    if (!whId) return 0;
    const vb = stockIndex.varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb) return 0;
    return (vb.psiIn + vb.transferIn + vb.prodIn) - (vb.psiOut + vb.transferOut + vb.prodOut);
  }, [stockIndex]);

  const getNullVariantProdStock = useCallback((pId: string, whId?: string) => {
    if (!whId) return 0;
    const vb = stockIndex.varMap.get(`${pId}::${whId}::`);
    if (!vb) return 0;
    return Math.max(0, vb.prodIn - vb.prodOut);
  }, [stockIndex]);

  const getStocktakeAdjust = useCallback((pId: string, whId: string) => {
    const b = stockIndex.whMap.get(`${pId}::${whId}`);
    return b ? b.stocktakeAdj : 0;
  }, [stockIndex]);

  const getVariantDisplayQty = useCallback((pId: string, whId: string, variantId: string) => {
    const vb = stockIndex.varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb || vb.stocktakeRecords.length === 0) return getStockVariant(pId, whId, variantId);
    const latest = vb.stocktakeRecords.reduce((best, r) => r.time > best.time ? r : best);
    const latestTime = latest.time;
    const insAfter =
      vb.psiInRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0) +
      vb.prodInRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0);
    const outsAfter =
      vb.psiOutRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0) +
      vb.prodOutRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0);
    const adjustAfter = vb.stocktakeRecords.filter(r => r.id !== latest.id && r.time >= latestTime)
      .reduce((s, r) => s + (r.qty - r.sysQty), 0);
    return latest.qty + insAfter - outsAfter + adjustAfter;
  }, [stockIndex, getStockVariant]);
  const generatePODocNumber = (): string => {
    const partnerCode = (form.partnerId || partners.find(p => p.name === form.partner)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'PURCHASE_ORDER' && (r.partnerId === form.partnerId || r.partner === form.partner)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`PO-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `PO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  // 按合作单位生成采购单单号：PB-{partnerCode}-{seq}
  const generatePBDocNumber = (partnerId: string, partnerName: string): string => {
    const partnerCode = (partnerId || partners.find(p => p.name === partnerName)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'PURCHASE_BILL' && (r.partnerId === partnerId || r.partner === partnerName)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`PB-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `PB-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  // 按客户生成销售订单单号：SO-{partnerCode}-{seq}
  const generateSODocNumber = (): string => {
    const partnerCode = (form.partnerId || partners.find(p => p.name === form.partner)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'SALES_ORDER' && (r.partnerId === form.partnerId || r.partner === form.partner)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`SO-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `SO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  // 按客户生成销售单单号：SB-{partnerCode}-{seq}（表单用）
  const generateSBDocNumber = (): string => {
    const partnerCode = (form.partnerId || partners.find(p => p.name === form.partner)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'SALES_BILL' && (r.partnerId === form.partnerId || r.partner === form.partner)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`SB-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `SB-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  // 按客户生成销售单单号（待发货一键生成销售单用）
  const generateSBDocNumberForPartner = (partnerId: string, partnerName: string): string => {
    const partnerCode = (partnerId || partners.find(p => p.name === partnerName)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'SALES_BILL' && (r.partnerId === partnerId || r.partner === partnerName)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`SB-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `SB-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  // 调拨单单号：TR-YYYYMMDD-001
  const generateTRDocNumber = (): string => {
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
    const prefix = `TR-${y}${m}${d}`;
    const existing = recordsList.filter((r: any) => r.type === 'TRANSFER' && (r.docNumber || '').toLowerCase().startsWith(prefix.toLowerCase()));
    const seqNums = existing.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
  };

  // 盘点单单号：ST-YYYYMMDD-001
  const generateSTDocNumber = (): string => {
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
    const prefix = `ST-${y}${m}${d}`;
    const existing = recordsList.filter((r: any) => r.type === 'STOCKTAKE' && (r.docNumber || '').toLowerCase().startsWith(prefix.toLowerCase()));
    const seqNums = existing.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
  };

  const handleSaveManual = async (submitType: string) => {
    if (submitType === 'PURCHASE_ORDER') {
      const hasValidLine = purchaseOrderItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || purchaseOrderItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingPODocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingPODocNumber ?? generatePODocNumber());
      // 新建时若单据号已存在（如计划单生成过同号），循环生成直至得到唯一号，避免 onAddRecord 追加到已有订单导致明细混在一起
      if (!editingPODocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'PURCHASE_ORDER' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingPODocNumber
        ? (recordsList.find((r: any) => r.type === 'PURCHASE_ORDER' && r.docNumber === editingPODocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();

      const newRecords: any[] = [];
      let recIdx = 0;
      purchaseOrderItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.purchasePrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (!qty || qty <= 0) return;
            const amount = qty * price;
            newRecords.push({
              id: `psi-po-${Date.now()}-${recIdx++}`,
              type: 'PURCHASE_ORDER',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              purchasePrice: price,
              amount,
              dueDate: form.dueDate,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          const amount = item.quantity! * price;
          newRecords.push({
            id: `psi-po-${Date.now()}-${recIdx++}`,
            type: 'PURCHASE_ORDER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity,
            purchasePrice: price,
            amount,
            dueDate: form.dueDate,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
          });
        }
      });

      if (newRecords.length === 0) return;

      if (editingPODocNumber && onReplaceRecords) {
        onReplaceRecords('PURCHASE_ORDER', originalDocNumber || docNumber, newRecords);
      } else {
        if (onAddRecordBatch) await onAddRecordBatch(newRecords);
        else { for (const r of newRecords) await onAddRecord(r); }
      }

      setShowModal(null);
      resetForm();
      setEditingPODocNumber(null);
      return;
    }

    if (submitType === 'PURCHASE_BILL') {
      const hasValidBillLine = purchaseBillItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || !form.warehouseId || purchaseBillItems.length === 0 || !hasValidBillLine) return;
      const originalDocNumber = editingPBDocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingPBDocNumber ?? generatePBDocNumber(form.partnerId || '', form.partner || ''));
      if (!editingPBDocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'PURCHASE_BILL' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingPBDocNumber
        ? (recordsList.find((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === editingPBDocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();
      const newRecords: any[] = [];
      let pbIdx = 0;
      purchaseBillItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.purchasePrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (!qty || qty <= 0) return;
            newRecords.push({
              id: `psi-pb-${Date.now()}-${pbIdx++}`,
              type: 'PURCHASE_BILL',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              purchasePrice: price,
              amount: qty * price,
              warehouseId: form.warehouseId,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
              ...(item.batch != null && item.batch !== '' && { batch: item.batch })
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          newRecords.push({
            id: `psi-pb-${Date.now()}-${pbIdx++}`,
            type: 'PURCHASE_BILL',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity!,
            purchasePrice: price,
            amount: item.quantity! * price,
            warehouseId: form.warehouseId,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
            ...(item.batch != null && item.batch !== '' && { batch: item.batch })
          });
        }
      });
      if (editingPBDocNumber && onReplaceRecords) {
        onReplaceRecords('PURCHASE_BILL', originalDocNumber || docNumber, newRecords);
      } else {
        if (onAddRecordBatch) await onAddRecordBatch(newRecords);
        else { for (const r of newRecords) await onAddRecord(r); }
      }
      setShowModal(null);
      resetForm();
      return;
    }

    if (submitType === 'SALES_ORDER') {
      const hasValidLine = salesOrderItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || salesOrderItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingSODocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingSODocNumber ?? generateSODocNumber());
      if (!editingSODocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'SALES_ORDER' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingSODocNumber
        ? (recordsList.find((r: any) => r.type === 'SALES_ORDER' && r.docNumber === editingSODocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();
      const newRecords: any[] = [];
      let recIdx = 0;
      salesOrderItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.salesPrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (!qty || qty <= 0) return;
            const amount = qty * price;
            newRecords.push({
              id: `psi-so-${Date.now()}-${recIdx++}`,
              type: 'SALES_ORDER',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              salesPrice: price,
              amount,
              dueDate: form.dueDate,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          const amount = item.quantity! * price;
          newRecords.push({
            id: `psi-so-${Date.now()}-${recIdx++}`,
            type: 'SALES_ORDER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity,
            salesPrice: price,
            amount,
            dueDate: form.dueDate,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
          });
        }
      });
      if (newRecords.length === 0) return;
      if (editingSODocNumber && onReplaceRecords) {
        onReplaceRecords('SALES_ORDER', originalDocNumber || docNumber, newRecords);
      } else {
        if (onAddRecordBatch) await onAddRecordBatch(newRecords);
        else { for (const r of newRecords) await onAddRecord(r); }
      }
      setShowModal(null);
      resetForm();
      setEditingSODocNumber(null);
      return;
    }

    if (submitType === 'SALES_BILL') {
      const hasValidLine = salesBillItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q !== 0;
      });
      if (!form.partner || !form.warehouseId || salesBillItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingSBDocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingSBDocNumber ?? generateSBDocNumber());
      if (!editingSBDocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'SALES_BILL' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingSBDocNumber
        ? (recordsList.find((r: any) => r.type === 'SALES_BILL' && r.docNumber === editingSBDocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();
      const newRecords: any[] = [];
      let recIdx = 0;
      salesBillItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.salesPrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (qty === 0) return;
            newRecords.push({
              id: `psi-sb-${Date.now()}-${recIdx++}`,
              type: 'SALES_BILL',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              warehouseId: form.warehouseId,
              productId: item.productId,
              variantId,
              quantity: qty,
              salesPrice: price,
              amount: qty * price,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
            });
          });
        } else if ((item.quantity ?? 0) !== 0) {
          newRecords.push({
            id: `psi-sb-${Date.now()}-${recIdx++}`,
            type: 'SALES_BILL',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            warehouseId: form.warehouseId,
            productId: item.productId,
            quantity: item.quantity!,
            salesPrice: price,
            amount: item.quantity! * price,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
          });
        }
      });
      if (newRecords.length === 0) return;
      if (editingSBDocNumber && onReplaceRecords) {
        onReplaceRecords('SALES_BILL', originalDocNumber || docNumber, newRecords);
      } else {
        if (onAddRecordBatch) await onAddRecordBatch(newRecords);
        else { for (const r of newRecords) await onAddRecord(r); }
      }
      setShowModal(null);
      resetForm();
      setEditingSBDocNumber(null);
      return;
    }

    if (submitType === 'PURCHASE_ORDER' || submitType === 'PURCHASE_BILL' || submitType === 'SALES_ORDER' || submitType === 'SALES_BILL') return;

    const systemQty = submitType === 'STOCKTAKE' ? getStock(form.productId, form.warehouseId) : 0;
    const prefix = bizConfig[submitType]?.prefix || (submitType === 'TRANSFER' ? 'TR' : 'DOC');
    const docNumber = form.docNumber?.trim() || (
      submitType === 'PURCHASE_BILL'
        ? generatePBDocNumber(form.partnerId || '', form.partner || '')
        : `${prefix}-${Date.now().toString().slice(-6)}`
    );

    const newRec = {
      id: `psi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: submitType,
      timestamp: new Date().toLocaleString(),
      _savedAtMs: Date.now(),
      ...form,
      docNumber,
      purchasePrice: submitType === 'PURCHASE_BILL' ? (form.purchasePrice ?? 0) : undefined,
      systemQuantity: systemQty,
      diffQuantity: submitType === 'STOCKTAKE' ? (form.actualQuantity - systemQty) : 0,
      operator: '张主管'
    };
    onAddRecord(newRec);
    setShowModal(null);
    resetForm();
  };

  // 获取所有采购订单的分组数据
  const allPOByGroups = useMemo(() => {
    const filtered = recordsList.filter(r => r.type === 'PURCHASE_ORDER');
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  // 按 (sourceOrderNumber, sourceLineId) 汇总采购单已入库数量
  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    recordsList.filter(r => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId).forEach(r => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
    });
    return map;
  }, [recordsList]);

  const getReceivedQty = (docNum: string, lineId: string) => receivedByOrderLine[`${docNum}::${lineId}`] ?? 0;

  // 过滤出有未收完明细的订单（支持部分到货：只要任一行待收>0则显示）
  const pendingPOs = useMemo(() => {
    return Object.entries(allPOByGroups).filter(([, items]) => {
      return items.some((item: any) => {
        const received = getReceivedQty(item.docNumber, item.id);
        return (item.quantity ?? 0) > received;
      });
    });
  }, [allPOByGroups, receivedByOrderLine]);

  // 当前已选订单包含的待选商品行，附带 已收/待收 数量（仅展示待收>0的行）
  const availableItemsFromSelectedPOs = useMemo(() => {
    const items: any[] = [];
    selectedPOOrderNums.forEach(num => {
      if (allPOByGroups[num]) {
        allPOByGroups[num].forEach((item: any) => {
          const orderQty = item.quantity ?? 0;
          const received = getReceivedQty(item.docNumber, item.id);
          const remaining = Math.max(0, orderQty - received);
          if (remaining > 0) {
            items.push({ ...item, receivedQty: received, remainingQty: remaining });
          }
        });
      }
    });
    return items;
  }, [selectedPOOrderNums, allPOByGroups, receivedByOrderLine]);

  const handleConvertPOToBill = () => {
    if (selectedPOItemIds.length === 0 || !form.warehouseId) return;

    const itemsToBill = availableItemsFromSelectedPOs.filter(item => selectedPOItemIds.includes(item.id));
    const todayStr = new Date().toLocaleString();
    const firstItem = itemsToBill[0];
    let pbDocNumber = form.docNumber?.trim() || generatePBDocNumber(firstItem?.partnerId || '', firstItem?.partner || '');
    // 新建时若单据号已存在，循环生成直至唯一，避免 onAddRecord 追加到已有采购单导致明细混在一起
    const exists = (n: string) => recordsList.some((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === n);
    let attempts = 0;
    while (exists(pbDocNumber) && attempts < 50) {
      pbDocNumber = generatePBDocNumber(firstItem?.partnerId || '', firstItem?.partner || '');
      attempts++;
    }
    const baseId = Date.now();

    let addedCount = 0;
    itemsToBill.forEach((item, idx) => {
      const qty = Math.max(0, selectedPOItemQuantities[item.id] ?? item.remainingQty ?? 0);
      if (qty <= 0) return;
      addedCount++;
      const batchVal = selectedPOItemBatches[item.id]?.trim();
      onAddRecord({
        ...item,
        id: `psi-pb-${baseId}-${idx}`,
        type: 'PURCHASE_BILL',
        docNumber: pbDocNumber,
        quantity: qty,
        sourceOrderNumber: item.docNumber,
        sourceLineId: item.id,
        warehouseId: form.warehouseId,
        timestamp: todayStr,
        _savedAtMs: Date.now(),
        note: form.note || `由订单[${item.docNumber}]商品明细转化`,
        operator: '张主管(订单转化)',
        lineGroupId: item.lineGroupId ?? item.id,
        createdAt: form.createdAt || new Date().toISOString().split('T')[0],
        ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
        ...(batchVal && { batch: batchVal })
      });
    });

    setShowModal(null);
    resetForm();
    toast.success(`采购单 ${pbDocNumber} 已成功创建，包含 ${addedCount} 条入库明细`);
  };

  const resetForm = () => {
    const t = new Date().toISOString().split('T')[0];
    setForm({ productId: '', warehouseId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, actualQuantity: 0, purchasePrice: 0, partner: '', partnerId: '', note: '', docNumber: '', dueDate: '', createdAt: t, customData: {} });
    setPurchaseOrderItems([]);
    setPurchaseBillItems([]);
    setSalesOrderItems([]);
    setSalesBillItems([]);
    setSelectedPOOrderNums([]);
    setSelectedPOItemIds([]);
    setSelectedPOItemQuantities({});
    setSelectedPOItemBatches({});
    setCreationMethod('MANUAL');
    setEditingPODocNumber(null);
    setEditingPBDocNumber(null);
    setEditingSODocNumber(null);
    setEditingSBDocNumber(null);
  };

  const addPurchaseOrderItem = () => setPurchaseOrderItems(prev => [...prev, { id: `line-${Date.now()}`, productId: '', quantity: 0, purchasePrice: 0 }]);
  const updatePurchaseOrderItem = (id: string, updates: Partial<{ productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number> }>) => {
    setPurchaseOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updatePurchaseOrderVariantQty = (lineId: string, variantId: string, qty: number) => {
    setPurchaseOrderItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removePurchaseOrderItem = (id: string) => setPurchaseOrderItems(prev => prev.filter(i => i.id !== id));

  const addSalesOrderItem = () => setSalesOrderItems(prev => [...prev, { id: `so-line-${Date.now()}`, productId: '', quantity: 0, salesPrice: 0 }]);
  const updateSalesOrderItem = (id: string, updates: Partial<{ productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number> }>) => {
    setSalesOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateSalesOrderVariantQty = (lineId: string, variantId: string, qty: number) => {
    setSalesOrderItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeSalesOrderItem = (id: string) => setSalesOrderItems(prev => prev.filter(i => i.id !== id));

  const addSalesBillItem = () => setSalesBillItems(prev => [...prev, { id: `sb-line-${Date.now()}`, productId: '', quantity: 0, salesPrice: 0 }]);
  const updateSalesBillItem = (id: string, updates: Partial<{ productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number> }>) => {
    setSalesBillItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateSalesBillVariantQty = (lineId: string, variantId: string, qty: number) => {
    setSalesBillItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeSalesBillItem = (id: string) => setSalesBillItems(prev => prev.filter(i => i.id !== id));

  const addPurchaseBillItem = () => setPurchaseBillItems(prev => [...prev, { id: `pb-line-${Date.now()}`, productId: '', quantity: 0, purchasePrice: 0 }]);
  const updatePurchaseBillItem = (id: string, updates: Partial<{ productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; batch?: string }>) => {
    setPurchaseBillItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updatePurchaseBillVariantQty = (lineId: string, variantId: string, qty: number) => {
    setPurchaseBillItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removePurchaseBillItem = (id: string) => setPurchaseBillItems(prev => prev.filter(i => i.id !== id));

  const addTransferItem = () => setTransferItems(prev => [...prev, { id: `tr-line-${Date.now()}`, productId: '', quantity: 0 }]);
  const updateTransferItem = (id: string, updates: Partial<{ productId: string; quantity?: number; variantQuantities?: Record<string, number> }>) => {
    setTransferItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateTransferVariantQty = (lineId: string, variantId: string, qty: number) => {
    setTransferItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeTransferItem = (id: string) => setTransferItems(prev => prev.filter(i => i.id !== id));

  const addStocktakeItem = () => setStocktakeItems(prev => [...prev, { id: `st-line-${Date.now()}`, productId: '', quantity: 0 }]);
  const updateStocktakeItem = (id: string, updates: Partial<{ productId: string; quantity?: number; variantQuantities?: Record<string, number> }>) => {
    setStocktakeItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateStocktakeVariantQty = (lineId: string, variantId: string, qty: number) => {
    setStocktakeItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeStocktakeItem = (id: string) => setStocktakeItems(prev => prev.filter(i => i.id !== id));

  const handleSaveTransfer = async () => {
    const fromId = transferForm.fromWarehouseId?.trim();
    const toId = transferForm.toWarehouseId?.trim();
    if (!fromId || !toId) {
      toast.warning('请选择调出仓库和调入仓库');
      return;
    }
    if (fromId === toId) {
      toast.warning('调出仓库与调入仓库不能相同');
      return;
    }
    const hasValidLine = transferItems.some(i => {
      if (!i.productId) return false;
      const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
      return q > 0;
    });
    if (transferItems.length === 0 || !hasValidLine) {
      toast.warning('请至少添加一条调拨明细且数量大于 0');
      return;
    }
    const docNumber = editingTransferDocNumber || generateTRDocNumber();
    const timestamp = editingTransferDocNumber
      ? (recordsList.find((r: any) => r.type === 'TRANSFER' && r.docNumber === editingTransferDocNumber)?.timestamp ?? new Date().toLocaleString())
      : new Date().toLocaleString();
    const createdAt = transferForm.transferDate || new Date().toISOString().split('T')[0];
    const newRecords: any[] = [];
    let trIdx = 0;
    transferItems.forEach((item) => {
      if (!item.productId) return;
      if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
        Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
          if (!qty || qty <= 0) return;
          newRecords.push({
            id: `psi-tr-${Date.now()}-${trIdx++}`,
            type: 'TRANSFER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            fromWarehouseId: fromId,
            toWarehouseId: toId,
            productId: item.productId,
            variantId,
            quantity: qty,
            note: transferForm.note || undefined,
            lineGroupId: item.id,
            createdAt,
          });
        });
      } else if ((item.quantity ?? 0) > 0) {
        newRecords.push({
          id: `psi-tr-${Date.now()}-${trIdx++}`,
          type: 'TRANSFER',
          docNumber,
          timestamp,
          _savedAtMs: Date.now(),
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          productId: item.productId,
          quantity: item.quantity!,
          note: transferForm.note || undefined,
          lineGroupId: item.id,
          createdAt,
        });
      }
    });
    const originalDocNumber = editingTransferDocNumber;
    if (originalDocNumber && onReplaceRecords) {
      onReplaceRecords('TRANSFER', originalDocNumber, newRecords);
    } else {
      if (onAddRecordBatch) await onAddRecordBatch(newRecords);
      else { for (const r of newRecords) await onAddRecord(r); }
    }
    setTransferModalOpen(false);
    setEditingTransferDocNumber(null);
    setTransferForm({ fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().split('T')[0], note: '' });
    setTransferItems([]);
  };

  const handleSaveStocktake = async () => {
    const warehouseId = stocktakeForm.warehouseId?.trim();
    if (!warehouseId) {
      toast.warning('请选择盘点仓库');
      return;
    }
    const hasValidLine = stocktakeItems.some(i => {
      if (!i.productId) return false;
      const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
      return q >= 0;
    });
    if (stocktakeItems.length === 0 || !hasValidLine) {
      toast.warning('请至少添加一条盘点明细');
      return;
    }
    const docNumber = editingStocktakeDocNumber || generateSTDocNumber();
    const timestamp = editingStocktakeDocNumber
      ? (recordsList.find((r: any) => r.type === 'STOCKTAKE' && r.docNumber === editingStocktakeDocNumber)?.timestamp ?? new Date().toLocaleString())
      : new Date().toLocaleString();
    const createdAt = stocktakeForm.stocktakeDate || new Date().toISOString().split('T')[0];
    const newRecords: any[] = [];
    let stIdx = 0;
    stocktakeItems.forEach((item) => {
      if (!item.productId) return;
      if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
        Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
          if (qty < 0) return;
          const sysQtyAtSave = getVariantDisplayQty(item.productId, warehouseId, variantId);
          newRecords.push({
            id: `psi-st-${Date.now()}-${stIdx++}`,
            type: 'STOCKTAKE',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            warehouseId,
            productId: item.productId,
            variantId,
            quantity: qty,
            systemQuantity: sysQtyAtSave,
            note: stocktakeForm.note || undefined,
            lineGroupId: item.id,
            createdAt,
          });
        });
      } else if ((item.quantity ?? 0) >= 0) {
        const sysQtyAtSave = getStock(item.productId, warehouseId, editingStocktakeDocNumber ?? undefined);
        newRecords.push({
          id: `psi-st-${Date.now()}-${stIdx++}`,
          type: 'STOCKTAKE',
          docNumber,
          timestamp,
          _savedAtMs: Date.now(),
          warehouseId,
          productId: item.productId,
          quantity: item.quantity ?? 0,
          systemQuantity: sysQtyAtSave,
          note: stocktakeForm.note || undefined,
          lineGroupId: item.id,
          createdAt,
        });
      }
    });
    // 盘点用于调整库存：按产品汇总实盘数，与系统数做差得到调整量，写入每条记录所在产品的“首条”的 diffQuantity
    // 有规格产品用 getVariantDisplayQty 之和（与填单时、仓库管理展示一致），这样详情“盘前”与用户填单时看到的系统数一致
    const originalDocNumber = editingStocktakeDocNumber ?? undefined;
    const byProductId = new Map<string, number>();
    newRecords.forEach(r => { byProductId.set(r.productId, (byProductId.get(r.productId) ?? 0) + (r.quantity ?? 0)); });
    const firstRecordIndexByProductId = new Map<string, number>();
    newRecords.forEach((r, idx) => {
      if (!firstRecordIndexByProductId.has(r.productId)) firstRecordIndexByProductId.set(r.productId, idx);
    });
    byProductId.forEach((actualTotal, productId) => {
      const product = productMapPSI.get(productId);
      const hasVariants = (product?.variants?.length ?? 0) > 0;
      const systemQty = hasVariants
        ? (product!.variants ?? []).reduce((s, v) => s + getVariantDisplayQty(productId, warehouseId, v.id), 0)
        : getStock(productId, warehouseId, originalDocNumber);
      const diff = actualTotal - systemQty;
      const firstIdx = firstRecordIndexByProductId.get(productId);
      if (firstIdx !== undefined) newRecords[firstIdx].diffQuantity = diff;
    });
    if (originalDocNumber && onReplaceRecords) {
      onReplaceRecords('STOCKTAKE', originalDocNumber, newRecords);
    } else {
      if (onAddRecordBatch) await onAddRecordBatch(newRecords);
      else { for (const r of newRecords) await onAddRecord(r); }
    }
    setStocktakeModalOpen(false);
    setEditingStocktakeDocNumber(null);
    setStocktakeForm({ warehouseId: '', stocktakeDate: new Date().toISOString().split('T')[0], note: '' });
    setStocktakeItems([]);
  };

  // 待发货清单：已配货且未发走的销售订单（待发 = 已配 - 已发），按 (docNumber, lineGroupId) 分组
  const pendingShipmentGroups = useMemo(() => {
    if (type !== 'SALES_ORDER') return [];
    const list = recordsList.filter((r: any) => {
      if (r.type !== 'SALES_ORDER') return false;
      const allocated = r.allocatedQuantity ?? 0;
      const shipped = r.shippedQuantity ?? 0;
      return allocated - shipped > 0;
    });
    const groups: Record<string, { docNumber: string; productId: string; records: any[] }> = {};
    list.forEach((r: any) => {
      const gid = r.lineGroupId ?? r.id;
      const key = `${r.docNumber}::${gid}`;
      if (!groups[key]) {
        groups[key] = { docNumber: r.docNumber, productId: r.productId, records: [] };
      }
      groups[key].records.push(r);
    });
    return Object.entries(groups).map(([groupKey, g]) => {
      const product = productMapPSI.get(g.productId);
      const first = g.records[0];
      const warehouse = warehouseMapPSI.get((first.allocationWarehouseId || first.warehouseId));
      const totalQuantity = g.records.reduce((s, r) => s + ((r.allocatedQuantity ?? 0) - (r.shippedQuantity ?? 0)), 0);
      return {
        groupKey,
        docNumber: g.docNumber,
        productId: g.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        partner: first.partner ?? '—',
        warehouseId: first.allocationWarehouseId || first.warehouseId || '',
        warehouseName: warehouse?.name ?? '—',
        totalQuantity,
        records: g.records,
      };
    });
  }, [recordsList, type, products, warehouses]);

  const filteredPendingShipmentGroups = useMemo(() => {
    if (type !== 'SALES_ORDER') return [];
    const doc = pendingShipSearchDoc.trim().toLowerCase();
    const prod = pendingShipSearchProduct.trim().toLowerCase();
    const part = pendingShipSearchPartner.trim().toLowerCase();
    const wh = pendingShipSearchWarehouse.trim().toLowerCase();
    return pendingShipmentGroups.filter(row => {
      if (doc && !row.docNumber.toLowerCase().includes(doc)) return false;
      if (prod && !row.productName.toLowerCase().includes(prod) && !row.productSku.toLowerCase().includes(prod)) return false;
      if (part && !row.partner.toLowerCase().includes(part)) return false;
      if (wh && !row.warehouseName.toLowerCase().includes(wh)) return false;
      return true;
    });
  }, [type, pendingShipmentGroups, pendingShipSearchDoc, pendingShipSearchProduct, pendingShipSearchPartner, pendingShipSearchWarehouse]);

  const groupedRecords = useMemo(() => {
    const filtered = recordsList.filter(r => r.type === type);
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber || 'UNGROUPED-' + r.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList, type]);

  /** 单据列表排序：按单据号倒序（003、002、001），新单在上，001 不会因时间戳排到第一条 */
  const sortedGroupedEntries = useMemo(() => {
    const entries = Object.entries(groupedRecords);
    return entries.sort(([docNumA], [docNumB]) => (docNumB || '').localeCompare(docNumA || ''));
  }, [groupedRecords]);

  /** 调拨单按单号分组（列表弹窗用） */
  const transferOrdersGrouped = useMemo(() => {
    const filtered = recordsList.filter((r: any) => r.type === 'TRANSFER');
    const groups: Record<string, any[]> = {};
    filtered.forEach((r: any) => {
      const key = r.docNumber || 'UNGROUPED-' + r.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  /** 盘点单按单号分组（列表弹窗用） */
  const stocktakeOrdersGrouped = useMemo(() => {
    const filtered = recordsList.filter((r: any) => r.type === 'STOCKTAKE');
    const groups: Record<string, any[]> = {};
    filtered.forEach((r: any) => {
      const key = r.docNumber || 'UNGROUPED-' + r.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  const filteredProductStocks = useMemo(() => {
    const allStocks = products.map(p => {
      const category = categoryMapPSI.get(p.categoryId);
      const hasVariants = (p.variants?.length ?? 0) > 0;
      // 有规格产品：各仓数量 = 各规格“展示数量”之和（展示数量 = 最近盘点实盘数，无盘点则=出入库），明细与行结存一致
      const distribution = warehouses.map(wh => ({
        warehouseId: wh.id,
        warehouseName: wh.name,
        category: wh.category,
        qty: hasVariants
          ? (p.variants ?? []).reduce((s, v) => s + getVariantDisplayQty(p.id, wh.id, v.id), 0) + getNullVariantProdStock(p.id, wh.id)
          : getStock(p.id, wh.id)
      }));
      // 总库存 = 各仓数量之和
      const total = distribution.reduce((s, d) => s + d.qty, 0);
      const variantBreakdown = (p.variants?.length
        ? p.variants.map(v => {
            const perWarehouse = warehouses.map(wh => ({ warehouseId: wh.id, qty: getVariantDisplayQty(p.id, wh.id, v.id) }));
            const totalQty = perWarehouse.reduce((s, x) => s + x.qty, 0);
            return {
              variantId: v.id,
              colorId: v.colorId,
              sizeId: v.sizeId,
              colorName: dictionaries?.colors?.find(c => c.id === v.colorId)?.name ?? v.colorId,
              sizeName: dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId,
              totalQty,
              perWarehouse
            };
          })
        : undefined) as { variantId: string; colorId: string; sizeId: string; colorName: string; sizeName: string; totalQty: number; perWarehouse: { warehouseId: string; qty: number }[] }[] | undefined;
      return { ...p, total, distribution, categoryName: category?.name || '未分类', variantBreakdown };
    });
    if (!debouncedSearchTerm.trim()) return allStocks;
    const term = debouncedSearchTerm.toLowerCase();
    return allStocks.filter(ps => ps.name.toLowerCase().includes(term) || ps.sku.toLowerCase().includes(term) || ps.categoryName.toLowerCase().includes(term));
  }, [products, warehouses, recordsList, categories, debouncedSearchTerm, getStockVariant, getVariantDisplayQty, getNullVariantProdStock, dictionaries]);

  const nonZeroStocks = useMemo(() => filteredProductStocks.filter(p => p.total !== 0), [filteredProductStocks]);
  const pStocks = useProgressiveList(nonZeroStocks);

  // 仓库流水：与仓库相关的单据类型（STOCK_IN、STOCK_RETURN、STOCK_OUT 来自 prodRecords，其余来自 records）
  const WAREHOUSE_FLOW_TYPES = ['PURCHASE_BILL', 'SALES_BILL', 'TRANSFER', 'STOCKTAKE', 'STOCK_IN', 'STOCK_RETURN', 'STOCK_OUT'] as const;
  const warehouseFlowTypeLabel: Record<string, string> = { PURCHASE_BILL: '采购入库', SALES_BILL: '销售出库', SALES_RETURN: '销售退货', TRANSFER: '调拨', STOCKTAKE: '盘点', STOCK_IN: '生产入库', STOCK_RETURN: '生产退料', STOCK_OUT: '领料发出' };
  const formatFlowDateTime = (ts: string) => {
    if (!ts || !ts.toString().trim()) return '—';
    const d = new Date(ts.toString());
    if (isNaN(d.getTime())) return ts.toString();
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0 || (ts.toString().length > 10 && /[T\s]/.test(ts.toString()));
    return hasTime ? d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : d.toLocaleDateString('zh-CN');
  };
  const toFlowDateStr = (ts: string) => {
    if (!ts || !ts.toString().trim()) return '';
    const d = new Date(ts.toString());
    if (isNaN(d.getTime())) return ts.toString().slice(0, 10);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const warehouseFlowRows = useMemo(() => {
    const list = recordsList.filter(r => WAREHOUSE_FLOW_TYPES.includes(r.type as any)) as any[];
    const psiRows = list.map(r => {
      const product = productMapPSI.get(r.productId);
      const dateStr = toFlowDateStr((r.createdAt || r.timestamp || '').toString()) || (r.createdAt || r.timestamp || '').toString().slice(0, 10);
      const dateOnly = dateStr;
      const displayDate = dateOnly || (r.timestamp || '—');
      const displayDateTime = formatFlowDateTime(r.timestamp || r.createdAt || '');
      const inboundWarehouseId = r.type === 'TRANSFER' ? r.toWarehouseId : r.warehouseId;
      const outboundWarehouseId = r.type === 'TRANSFER' ? r.fromWarehouseId : (r.type === 'SALES_BILL' ? r.warehouseId : undefined);
      const warehouseName = r.type === 'SALES_BILL'
        ? (warehouseMapPSI.get(r.warehouseId)?.name ?? '—')
        : (r.type === 'TRANSFER'
          ? (r.toWarehouseId ? warehouseMapPSI.get(r.toWarehouseId)?.name ?? '—' : '—')
          : (warehouseMapPSI.get(r.warehouseId)?.name ?? '—'));
      const qty = r.quantity ?? 0;
      const isSalesReturn = r.type === 'SALES_BILL' && qty < 0;
      return {
        id: r.id,
        type: r.type,
        typeLabel: isSalesReturn ? '销售退货' : (warehouseFlowTypeLabel[r.type] || r.type),
        docNumber: r.docNumber || '—',
        dateStr: displayDate,
        displayDateTime: displayDateTime,
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: qty,
        warehouseId: inboundWarehouseId || r.warehouseId,
        warehouseName,
        isOutbound: r.type === 'SALES_BILL',
        partner: r.partner ?? '—',
        record: r
      };
    });
    const stockInList = (prodRecords || []).filter((r: any) => r.type === 'STOCK_IN') as any[];
    const stockInRows = stockInList.map(r => {
      const product = productMapPSI.get(r.productId);
      const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
      const dateStr = toFlowDateStr((r.timestamp || '').toString()) || (r.timestamp || '').toString().slice(0, 10);
      const displayDate = dateStr || '—';
      const docNumber = r.docNo || (order?.orderNumber ? `工单入库-${order.orderNumber}` : `SI-${r.id}`);
      return {
        id: r.id,
        type: 'STOCK_IN',
        typeLabel: '生产入库',
        docNumber,
        dateStr: displayDate,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: warehouseMapPSI.get(r.warehouseId)?.name ?? '—',
        isOutbound: false,
        partner: '—',
        record: r
      };
    });
    const stockReturnList = (prodRecords || []).filter((r: any) => r.type === 'STOCK_RETURN') as any[];
    const stockReturnRows = stockReturnList.map(r => {
      const product = productMapPSI.get(r.productId);
      const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
      const dateStr = toFlowDateStr((r.timestamp || '').toString()) || (r.timestamp || '').toString().slice(0, 10);
      const displayDate = dateStr || '—';
      const docNumber = r.docNo || (order?.orderNumber ? `退料-${order.orderNumber}` : `TR-${r.id}`);
      return {
        id: r.id,
        type: 'STOCK_RETURN',
        typeLabel: '生产退料',
        docNumber,
        dateStr: displayDate,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: warehouseMapPSI.get(r.warehouseId)?.name ?? '—',
        isOutbound: false,
        partner: '—',
        record: r
      };
    });
    const stockOutList = (prodRecords || []).filter((r: any) => r.type === 'STOCK_OUT') as any[];
    const stockOutRows = stockOutList.map(r => {
      const product = productMapPSI.get(r.productId);
      const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
      const dateStr = toFlowDateStr((r.timestamp || '').toString()) || (r.timestamp || '').toString().slice(0, 10);
      const displayDate = dateStr || '—';
      const docNumber = r.docNo || (order?.orderNumber ? `领料-${order.orderNumber}` : `LO-${r.id}`);
      return {
        id: r.id,
        type: 'STOCK_OUT',
        typeLabel: '领料发出',
        docNumber,
        dateStr: displayDate,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: warehouseMapPSI.get(r.warehouseId)?.name ?? '—',
        isOutbound: true,
        partner: '—',
        record: r
      };
    });
    const allRows = [...psiRows, ...stockInRows, ...stockReturnRows, ...stockOutRows];
    const byKey = new Map<string, { row: typeof allRows[0]; totalQty: number; maxTs: number }>();
    allRows.forEach(r => {
      const key = `${r.type}|${r.docNumber}|${r.productId}`;
      const ts = parseRecordTime(r.record);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { row: r, totalQty: r.quantity, maxTs: ts });
      } else {
        existing.totalQty += r.quantity;
        if (ts > existing.maxTs) { existing.maxTs = ts; existing.row = r; }
      }
    });
    return Array.from(byKey.entries())
      .map(([key, { row, totalQty, maxTs }]) => ({ ...row, id: key, quantity: totalQty, _sortTs: maxTs }))
      .sort((a, b) => (b as any)._sortTs - (a as any)._sortTs);
  }, [recordsList, prodRecords, products, warehouses, ordersList, parseRecordTime]);
  const filteredWarehouseFlowRows = useMemo(() => {
    let rows = warehouseFlowRows;
    if (whFlowDateFrom) rows = rows.filter(r => r.dateStr >= whFlowDateFrom);
    if (whFlowDateTo) rows = rows.filter(r => r.dateStr <= whFlowDateTo);
    if (whFlowType !== 'all') {
      if (whFlowType === 'SALES_RETURN') rows = rows.filter(r => r.type === 'SALES_BILL' && r.quantity < 0);
      else if (whFlowType === 'SALES_BILL') rows = rows.filter(r => r.type === 'SALES_BILL' && r.quantity >= 0);
      else rows = rows.filter(r => r.type === whFlowType);
    }
    if (whFlowWarehouse !== 'all') {
      rows = rows.filter(r => (r.warehouseId || '') === whFlowWarehouse);
    }
    if (whFlowDocNo.trim()) {
      const t = whFlowDocNo.trim().toLowerCase();
      rows = rows.filter(r => (r.docNumber || '').toLowerCase().includes(t));
    }
    if (whFlowProduct.trim()) {
      const t = whFlowProduct.trim().toLowerCase();
      rows = rows.filter(r => r.productName.toLowerCase().includes(t) || r.productSku.toLowerCase().includes(t));
    }
    return rows;
  }, [warehouseFlowRows, whFlowDateFrom, whFlowDateTo, whFlowType, whFlowWarehouse, whFlowDocNo, whFlowProduct]);

  // 产品流水详情弹窗：按产品（+ 可选仓库）筛选的流水，按时间倒序
  const productFlowDetailRows = useMemo(() => {
    if (!productFlowDetail) return [];
    const pid = productFlowDetail.productId;
    const whId = productFlowDetail.warehouseId;
    let rows = warehouseFlowRows.filter((r: any) => r.productId === pid);
    if (whId) {
      rows = rows.filter((r: any) => {
        const rec = r.record;
        if (rec.type === 'TRANSFER') return rec.toWarehouseId === whId || rec.fromWarehouseId === whId;
        if (rec.type === 'SALES_BILL') return rec.warehouseId === whId;
        return (r.warehouseId || rec.warehouseId) === whId;
      });
    }
    return rows.sort((a: any, b: any) => parseRecordTime(b.record) - parseRecordTime(a.record));
  }, [warehouseFlowRows, productFlowDetail]);

  // 产品流水详情：应用搜索条件（开始时间、结束时间、类型、仓库）后的列表及合计数量
  const productFlowFilteredRows = useMemo(() => {
    let rows = productFlowDetailRows;
    if (productFlowDateFrom) rows = rows.filter((r: any) => (r.dateStr || '') >= productFlowDateFrom);
    if (productFlowDateTo) rows = rows.filter((r: any) => (r.dateStr || '') <= productFlowDateTo);
    if (productFlowType !== 'all') {
      if (productFlowType === 'SALES_RETURN') rows = rows.filter((r: any) => r.type === 'SALES_BILL' && r.quantity < 0);
      else rows = rows.filter((r: any) => r.type === productFlowType);
    }
    if (productFlowWarehouseId !== 'all') rows = rows.filter((r: any) => (r.warehouseId || '') === productFlowWarehouseId);
    return rows;
  }, [productFlowDetailRows, productFlowDateFrom, productFlowDateTo, productFlowType, productFlowWarehouseId]);

  const productFlowTotalQuantity = useMemo(() => productFlowFilteredRows.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0), [productFlowFilteredRows]);

  // 按仓库聚合的库存列表（主列表用），lines 含 imageUrl、有规格时含 variantBreakdown（该仓下各规格数量，含 0 以支持展开）
  const warehouseStockList = useMemo(() => {
    return warehouses.map(wh => {
      const lines = filteredProductStocks
        .filter(ps => {
          const d = ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id);
          return d && d.qty !== 0;
        })
        .map(ps => {
          const d = ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id);
          const hasVariants = (ps as any).variantBreakdown != null;
          const variantBreakdown = hasVariants
            ? ((ps as any).variantBreakdown as { variantId: string; colorId: string; sizeId: string; colorName: string; sizeName: string; perWarehouse: { warehouseId: string; qty: number }[] }[]).map((vb: { variantId: string; colorId: string; sizeId: string; colorName: string; sizeName: string; perWarehouse: { warehouseId: string; qty: number }[] }) => ({
                variantId: vb.variantId,
                colorId: vb.colorId,
                sizeId: vb.sizeId,
                colorName: vb.colorName,
                sizeName: vb.sizeName,
                qty: vb.perWarehouse.find((pw: { warehouseId: string }) => pw.warehouseId === wh.id)?.qty ?? 0
              }))
            : undefined;
          const qtyForLine = d?.qty ?? 0;
          return { productId: ps.id, name: ps.name, sku: ps.sku, categoryName: ps.categoryName, qty: qtyForLine, imageUrl: ps.imageUrl, variantBreakdown };
        });
      const totalQty = lines.reduce((s, l) => s + l.qty, 0);
      return { warehouseId: wh.id, warehouseName: wh.name, code: wh.code, category: wh.category, location: wh.location, contact: wh.contact, totalQty, skuCount: lines.length, lines };
    });
  }, [warehouses, filteredProductStocks]);

  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>{current.label}</h1>
          <p className={pageSubtitleClass}>{current.sub || '管理业务单据与记录'}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {type === 'PURCHASE_ORDER' && onUpdatePurchaseOrderFormSettings && (
            <button type="button" onClick={() => { setPOFormConfigDraft(JSON.parse(JSON.stringify(purchaseOrderFormSettings))); setShowPOFormConfigModal(true); }} className={secondaryToolbarButtonClass}>
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'PURCHASE_BILL' && onUpdatePurchaseBillFormSettings && (
            <button type="button" onClick={() => { setPBFormConfigDraft(JSON.parse(JSON.stringify(purchaseBillFormSettings))); setShowPBFormConfigModal(true); }} className={secondaryToolbarButtonClass}>
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'SALES_ORDER' && !showModal && hasPsiPerm('psi:sales_order_pending_shipment:allow') && (
            <button
              type="button"
              onClick={() => setShowPendingShipmentModal(true)}
              className={outlineAccentToolbarButtonClass}
            >
              <PackageCheck className="w-4 h-4 shrink-0" /> 待发货清单
              {pendingShipmentGroups.length > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                  {pendingShipmentGroups.length}
                </span>
              )}
            </button>
          )}
          {type !== 'WAREHOUSE_MGMT' && !(type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') && !(type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL') && !(type === 'SALES_ORDER' && showModal === 'SALES_ORDER') && !(type === 'SALES_BILL' && showModal === 'SALES_BILL') && hasPsiPerm(`psi:${type === 'PURCHASE_ORDER' ? 'purchase_order' : type === 'PURCHASE_BILL' ? 'purchase_bill' : type === 'SALES_ORDER' ? 'sales_order' : 'sales_bill'}:create`) && (
            <button
              type="button"
              onClick={() => { resetForm(); setEditingPODocNumber(null); setEditingSODocNumber(null); setEditingSBDocNumber(null); setShowModal(type); }}
              className={`${primaryToolbarButtonClass} ${current.color}`}
            >
            <Plus className="w-4 h-4 shrink-0" /> 登记新{current.label}
          </button>
        )}
        </div>
      </div>

      {type === 'SALES_ORDER' && showPendingShipmentModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPendingShipmentModal(false)} aria-hidden />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><PackageCheck className="w-5 h-5 text-indigo-600" /> 待发货清单</h3>
              <button type="button" onClick={() => setShowPendingShipmentModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">订单单号</label>
                  <input type="text" value={pendingShipSearchDoc} onChange={e => setPendingShipSearchDoc(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">商品名称</label>
                  <input type="text" value={pendingShipSearchProduct} onChange={e => setPendingShipSearchProduct(e.target.value)} placeholder="产品名/SKU 模糊" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">客户</label>
                  <input type="text" value={pendingShipSearchPartner} onChange={e => setPendingShipSearchPartner(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
                  <input type="text" value={pendingShipSearchWarehouse} onChange={e => setPendingShipSearchWarehouse(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <span className="text-xs text-slate-400">已配货未出库的销售订单明细；勾选后点击「发货」生成销售单（仅可同时勾选同一客户、同一仓库的明细一起发货）。</span>
                <span className="text-xs text-slate-400">共 {filteredPendingShipmentGroups.length} 项</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {filteredPendingShipmentGroups.length === 0 ? (
                <p className="text-slate-500 text-center py-12">{pendingShipmentGroups.length === 0 ? '暂无待发货项，请先在销售订单中完成配货。' : '无匹配项，请调整搜索条件。'}</p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="w-12 px-4 py-3" />
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">订单单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">商品名称</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">客户</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPendingShipmentGroups.map(group => {
                        const groupRecordIds = group.records.map((r: any) => r.id);
                        const allChecked = groupRecordIds.every(id => pendingShipSelectedIds.has(id));
                        const checked = allChecked;
                        const toggleGroupSelection = () => {
                          if (!allChecked && pendingShipSelectedIds.size > 0) {
                            const firstId = pendingShipSelectedIds.values().next().value!;
                            const firstGroup = filteredPendingShipmentGroups.find(gg => gg.records.some((r: any) => r.id === firstId));
                            if (firstGroup && (firstGroup.partner !== group.partner || firstGroup.warehouseId !== group.warehouseId)) {
                              toast.warning('只能选择同一客户、同一仓库的明细同时发货，请先取消其他勾选。');
                              return;
                            }
                          }
                          setPendingShipSelectedIds(prev => {
                            const next = new Set(prev);
                            if (allChecked) {
                              groupRecordIds.forEach(id => next.delete(id));
                              return next;
                            }
                            groupRecordIds.forEach(id => next.add(id));
                            return next;
                          });
                        };
                        return (
                          <tr
                            key={group.groupKey}
                            className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                            onClick={toggleGroupSelection}
                          >
                            <td className="px-4 py-3 align-middle" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={toggleGroupSelection}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{group.docNumber}</td>
                            <td className="px-4 py-3 font-bold text-slate-800 truncate" title={group.productName}>{group.productName}</td>
                            <td className="px-4 py-3 font-bold text-slate-800 truncate" title={group.partner}>{group.partner}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{group.totalQuantity.toLocaleString()}</td>
                            <td className="px-4 py-3 font-bold text-slate-700 truncate" title={group.warehouseName}>{group.warehouseName}</td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => { setPendingShipDetailGroup(group); setPendingShipDetailEdit(null); }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                            >
                              <FileText className="w-3.5 h-3.5" /> 详情
                            </button>
                            </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {pendingShipmentGroups.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <span className="text-sm font-bold text-slate-600">已选 {pendingShipSelectedIds.size} 项</span>
                <button
                  type="button"
                  disabled={pendingShipSelectedIds.size === 0}
                  onClick={async () => {
                    if (pendingShipSelectedIds.size === 0 || !onAddRecord) return;
                    const selectedRecords = filteredPendingShipmentGroups.flatMap(g => g.records).filter((r: any) => pendingShipSelectedIds.has(r.id));
                    const first = selectedRecords[0];
                    const partnerName = first.partner || '';
                    const partnerId = first.partnerId || partners.find(p => p.name === partnerName)?.id || '';
                    const warehouseId = first.allocationWarehouseId || first.warehouseId || '';
                    if (!warehouseId || !partnerName) {
                      toast.error('所选明细缺少客户或仓库信息，无法生成销售单。');
                      return;
                    }
                    const newDocNumber = generateSBDocNumberForPartner(partnerId, partnerName);
                    const timestamp = new Date().toLocaleString();
                    const createdAt = new Date().toISOString().split('T')[0];
                    let recIdx = 0;
                    const newBillRecords = selectedRecords.map((r: any) => {
                      const pendingQty = (r.allocatedQuantity ?? 0) - (r.shippedQuantity ?? 0);
                      const price = r.salesPrice ?? 0;
                      return {
                        id: `psi-sb-${Date.now()}-${recIdx++}`,
                        type: 'SALES_BILL',
                        docNumber: newDocNumber,
                        timestamp,
                        _savedAtMs: Date.now(),
                        partner: partnerName,
                        partnerId,
                        warehouseId,
                        productId: r.productId,
                        variantId: r.variantId,
                        quantity: pendingQty,
                        salesPrice: price,
                        amount: pendingQty * price,
                        note: '',
                        operator: '张主管',
                        lineGroupId: r.lineGroupId ?? r.id,
                        createdAt,
                      };
                    });
                    if (onAddRecordBatch) await onAddRecordBatch(newBillRecords);
                    else { for (const r of newBillRecords) await onAddRecord(r); }
                    // 发走后只增加已发数量，不修改已配数量，销售订单仍为已配货；待发清单按「已配-已发」过滤，发走的自动不显示
                    if (onReplaceRecords) {
                      const docNumbersToUpdate = [...new Set(selectedRecords.map((r: any) => r.docNumber))];
                      docNumbersToUpdate.forEach(docNum => {
                        const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === docNum);
                        const newRecords = docRecords.map((re: any) => {
                          if (!pendingShipSelectedIds.has(re.id)) return re;
                          const allocated = re.allocatedQuantity ?? 0;
                          const alreadyShipped = re.shippedQuantity ?? 0;
                          const pending = allocated - alreadyShipped;
                          return { ...re, shippedQuantity: alreadyShipped + pending };
                        });
                        onReplaceRecords('SALES_ORDER', docNum, newRecords);
                      });
                    }
                    setPendingShipSelectedIds(new Set());
                    setShowPendingShipmentModal(false);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowDownToLine className="w-4 h-4" /> 发货生成销售单
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 待发货清单 - 详情弹窗（数量明细、编辑、删除，参考报工流水详情） */}
      {type === 'SALES_ORDER' && pendingShipDetailGroup && (() => {
        const g = pendingShipDetailGroup;
        const product = productMapPSI.get(g.productId);
        const hasVariants = g.records.some((r: any) => r.variantId) && (product?.variants?.length ?? 0) > 0;
        const unitName = getUnitName(g.productId);
        const isEditing = pendingShipDetailEdit !== null;
        const editQuantities = isEditing
          ? (hasVariants
            ? (pendingShipDetailEdit as Record<string, number>)
            : { _single: pendingShipDetailEdit as number })
          : null;
        const editWarehouseId = pendingShipDetailEditWarehouseId ?? g.warehouseId;
        const handleSaveEdit = () => {
          if (!onReplaceRecords || editQuantities == null) return;
          const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === g.docNumber);
          const newRecords = docRecords.map((re: any) => {
            const inGroup = g.records.some((r: any) => r.id === re.id);
            if (!inGroup) return re;
            const base = { ...re, allocationWarehouseId: editWarehouseId || re.allocationWarehouseId };
            if (hasVariants && re.variantId != null) {
              const qty = (editQuantities as Record<string, number>)[re.variantId] ?? re.allocatedQuantity ?? 0;
              return { ...base, allocatedQuantity: Math.max(0, qty) };
            }
            if (!hasVariants) {
              const qty = typeof editQuantities === 'number' ? editQuantities : (editQuantities as Record<string, number>)._single ?? re.allocatedQuantity ?? 0;
              return { ...base, allocatedQuantity: Math.max(0, qty) };
            }
            return base;
          });
          onReplaceRecords('SALES_ORDER', g.docNumber, newRecords);
          setPendingShipDetailEdit(null);
          setPendingShipDetailEditWarehouseId(null);
          setPendingShipDetailGroup(null);
        };
        const handleDelete = () => {
          if (!onReplaceRecords) return;
          void confirm({ message: '确定要取消该组配货吗？已配数量将清零。', danger: true }).then((ok) => {
            if (!ok) return;
            const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === g.docNumber);
            const newRecords = docRecords.map((re: any) => {
              if (!g.records.some((r: any) => r.id === re.id)) return re;
              return { ...re, allocatedQuantity: 0 };
            });
            onReplaceRecords('SALES_ORDER', g.docNumber, newRecords);
            setPendingShipDetailGroup(null);
            setPendingShipDetailEdit(null);
            setPendingShipDetailEditWarehouseId(null);
          });
        };
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setPendingShipDetailGroup(null); setPendingShipDetailEdit(null); setPendingShipDetailEditWarehouseId(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{g.docNumber}</span>
                  配货详情
                </h3>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button type="button" onClick={() => { setPendingShipDetailEdit(null); setPendingShipDetailEditWarehouseId(null); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button type="button" onClick={handleSaveEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingShipDetailEditWarehouseId(g.warehouseId);
                          if (hasVariants) {
                            const next: Record<string, number> = {};
                            g.records.forEach((r: any) => { next[r.variantId] = r.allocatedQuantity ?? 0; });
                            setPendingShipDetailEdit(next);
                          } else {
                            setPendingShipDetailEdit(g.records[0]?.allocatedQuantity ?? 0);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Pencil className="w-4 h-4" /> 编辑
                      </button>
                      {onReplaceRecords && (
                        <button type="button" onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setPendingShipDetailGroup(null); setPendingShipDetailEdit(null); setPendingShipDetailEditWarehouseId(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{g.productName}</h2>
                  <p className="text-xs text-slate-500 mt-1">客户：{g.partner}{!isEditing && ` · 仓库：${g.warehouseName}`}</p>
                  {isEditing && (
                    <div className="mt-3">
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">配货仓库（出库仓库）</label>
                      <select
                        value={editWarehouseId}
                        onChange={e => setPendingShipDetailEditWarehouseId(e.target.value)}
                        className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3">数量明细</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格 / 颜色尺码</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已配数量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hasVariants
                          ? g.records.map((r: any) => {
                              const v = product?.variants?.find((vv: ProductVariant) => vv.id === r.variantId);
                              const colorName = v?.colorId ? (dictionaries.colors.find(c => c.id === v.colorId)?.name ?? '') : '';
                              const sizeName = v?.sizeId ? (dictionaries.sizes.find(s => s.id === v.sizeId)?.name ?? '') : '';
                              const specLabel = [colorName, sizeName].filter(Boolean).join(' / ') || (r.variantId ?? '—');
                              const qty = isEditing && editQuantities && typeof editQuantities === 'object' && !('_single' in editQuantities)
                                ? (editQuantities as Record<string, number>)[r.variantId] ?? r.allocatedQuantity ?? 0
                                : r.allocatedQuantity ?? 0;
                              return (
                                <tr key={r.id} className="border-b border-slate-100">
                                  <td className="px-4 py-3 font-bold text-slate-800">{specLabel}</td>
                                  <td className="px-4 py-3 text-right">
                                    {isEditing ? (
                                      <input
                                        type="number"
                                        min={0}
                                        value={qty}
                                        onChange={e => setPendingShipDetailEdit((prev: Record<string, number> | number | null) => {
                                          const next = prev as Record<string, number>;
                                          return { ...next, [r.variantId]: Math.max(0, parseInt(e.target.value, 10) || 0) };
                                        })}
                                        className="w-24 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                      />
                                    ) : (
                                      <span className="font-black text-indigo-600">{qty.toLocaleString()} {unitName}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          : (
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-3 font-bold text-slate-800">数量</td>
                              <td className="px-4 py-3 text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={typeof editQuantities === 'number' ? editQuantities : (editQuantities as Record<string, number>)?._single ?? g.totalQuantity}
                                    onChange={e => setPendingShipDetailEdit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="w-24 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                ) : (
                                  <span className="font-black text-indigo-600">{g.totalQuantity.toLocaleString()} {unitName}</span>
                                )}
                              </td>
                            </tr>
                          )}
                        <tr className="bg-indigo-50/80 font-bold">
                          <td className="px-4 py-3 text-slate-700">合计</td>
                          <td className="px-4 py-3 text-right text-indigo-600">
                            {isEditing && hasVariants && editQuantities && typeof editQuantities === 'object' && !('_single' in editQuantities)
                              ? Object.values(editQuantities).reduce((s, n) => s + (n || 0), 0).toLocaleString()
                              : isEditing && !hasVariants && typeof editQuantities === 'number'
                                ? editQuantities.toLocaleString()
                                : g.totalQuantity.toLocaleString()}{' '}
                            {unitName}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER' ? (
        <div className="max-w-5xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button type="button" onClick={() => { setShowModal(null); setEditingPODocNumber(null); }} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <div className="flex items-center gap-3">
              {editingPODocNumber && onDeleteRecords && hasPsiPerm('psi:purchase_order:delete') && (
                <button
                  type="button"
                  onClick={() => {
                    void confirm({ message: '确定要删除该采购订单吗？', danger: true }).then((ok) => {
                      if (!ok) return;
                      onDeleteRecords('PURCHASE_ORDER', editingPODocNumber);
                      setShowModal(null);
                      setEditingPODocNumber(null);
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold transition-all border border-rose-200"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSaveManual('PURCHASE_ORDER')}
                disabled={!form.partner || purchaseOrderItems.length === 0 || !purchaseOrderItems.some(i => {
                  if (!i.productId) return false;
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                  return q > 0;
                })}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {editingPODocNumber ? '保存修改' : '确认保存采购订单'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                <h3 className={sectionTitleClass}>1. 采购订单基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 供应商、单据编号、添加日期 固定显示，不可配置 */}
                <div className="md:col-span-2">
                  <PartnerSelector
                    partners={partners}
                    categories={partnerCategories}
                    value={form.partner}
                    onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id || '' })}
                    label={current.partnerLabel}
                    placeholder={`选择${current.partnerLabel}...`}
                    triggerClassName="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  </div>
                </div>
                {safePurchaseOrderFormSettings.standardFields.find(f => f.id === 'dueDate')?.showInCreate !== false && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望到货日期</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                  <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                {safePurchaseOrderFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                    <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                  </div>
                )}
                {safePurchaseOrderFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                  <div key={cf.id} className={cf.type === 'text' || cf.type === undefined ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{cf.label}</label>
                    {cf.type === 'date' ? (
                      <input type="date" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                    ) : cf.type === 'number' ? (
                      <input type="number" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                    ) : cf.type === 'select' ? (
                      <select value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                        <option value="">请选择</option>
                        {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder={`${cf.label}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-10 border-t border-slate-50 space-y-8">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                  <h3 className={sectionTitleClass}>2. 采购明细录入</h3>
                </div>
                <button type="button" onClick={addPurchaseOrderItem} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all">
                  <Plus className="w-4 h-4 shrink-0" /> 添加明细行
                </button>
              </div>
              <div className="space-y-4">
                {purchaseOrderItems.map((line) => {
                  const prod = productMapPSI.get(line.productId);
                  const hasVariants = prod?.variants && prod.variants.length > 0;
                  const lineQty = hasVariants
                    ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                    : (line.quantity ?? 0);
                  const lineAmount = lineQty * (line.purchasePrice || 0);
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  if (prod?.variants) {
                    prod.variants.forEach(v => {
                      if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                      groupedByColor[v.colorId].push(v);
                    });
                  }
                  const poDocNum = editingPODocNumber || form.docNumber || '';
                  const received = poDocNum && line.sourceRecordIds
                    ? line.sourceRecordIds.reduce((s, rid) => s + (receivedByOrderLine[`${poDocNum}::${rid}`] ?? 0), 0)
                    : (poDocNum ? (receivedByOrderLine[`${poDocNum}::${line.id}`] ?? 0) : 0);
                  const progress = lineQty > 0 ? Math.min(1, received / lineQty) : 0;
                  return (
                  <div key={line.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4 shadow-sm hover:border-indigo-100/80 transition-all">
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex-1 min-w-[200px] space-y-2 min-w-0">
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">目标采购品项 (支持搜索与分类筛选)</label>
                        <SearchableProductSelect
                          compact
                          categories={categories}
                          options={products}
                          value={line.productId}
                          placeholder="搜索并选择产品型号..."
                          onChange={(id) => {
                            const p = productMapPSI.get(id);
                            const hv = p?.variants && p.variants.length > 0;
                            updatePurchaseOrderItem(line.id, {
                              productId: id,
                              purchasePrice: p?.purchasePrice ?? 0,
                              quantity: hv ? undefined : 0,
                              variantQuantities: hv ? {} : undefined
                            });
                          }}
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                        <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => updatePurchaseOrderItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                      </div>
                      {hasVariants && (
                        <>
                          <div className="w-24 space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {lineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      {!hasVariants && (
                        <>
                          <div className="w-24 space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                            <div className="flex items-center gap-1.5">
                              <input type="number" min={0} value={line.quantity || ''} onChange={e => updatePurchaseOrderItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                              <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {lineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      {poDocNum && received > 0 && (
                        <div className="w-40 space-y-1 shrink-0">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">入库进度</label>
                          <div className="flex flex-col gap-1">
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                              {received > lineQty ? (
                                <>
                                  <div className="h-full bg-emerald-500" style={{ width: `${(lineQty / received) * 100}%` }} />
                                  <div className="h-full bg-rose-500" style={{ width: `${((received - lineQty) / received) * 100}%` }} />
                                </>
                              ) : (
                                <div className={`h-full rounded-full ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
                              )}
                            </div>
                            <span className="text-[9px] font-bold text-slate-500">
                              {received > lineQty ? `已收 ${received} / ${lineQty}（已超收）` : `已收 ${received} / ${lineQty}`}
                            </span>
                          </div>
                        </div>
                      )}
                      <button type="button" onClick={() => removePurchaseOrderItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all" aria-label="删除明细行"><Trash2 className="w-5 h-5" /></button>
                    </div>
                    {hasVariants && line.productId && (
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                          <Layers className="w-3.5 h-3.5" /> 颜色尺码数量
                        </label>
                        {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries.colors.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white/80 p-3 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-2 w-28 shrink-0">
                                <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {colorVariants.map(v => {
                                  const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                  return (
                                    <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                      <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        placeholder="0"
                                        value={line.variantQuantities?.[v.id] ?? ''}
                                        onChange={e => updatePurchaseOrderVariantQty(line.id, v.id, parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="ml-auto text-right shrink-0">
                                <span className="text-[9px] font-black text-slate-400">小计</span>
                                <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );})}
                {purchaseOrderItems.length === 0 && (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                    <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入采购明细</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end p-5 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100 gap-8">
                <div className="flex items-center gap-4">
                  <p className="text-xs font-bold opacity-90">采购总量</p>
                  <p className="text-xl font-black tabular-nums">{purchaseOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q;
                }, 0)} <span className="text-xs font-semibold opacity-90">PCS</span></p>
                </div>
                <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                  <p className="text-xs font-bold opacity-90">订单金额</p>
                  <p className="text-xl font-black tabular-nums">¥{purchaseOrderItems.reduce((s, i) => {
                    const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                    return s + q * (i.purchasePrice || 0);
                  }, 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : type === 'SALES_ORDER' && showModal === 'SALES_ORDER' ? (
        <div className="max-w-6xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button onClick={() => { setShowModal(null); setEditingSODocNumber(null); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <div className="flex items-center gap-3">
              {editingSODocNumber && onDeleteRecords && hasPsiPerm('psi:sales_order:delete') && (
                <button
                  type="button"
                  onClick={() => {
                    void confirm({ message: '确定要删除该销售订单吗？', danger: true }).then((ok) => {
                      if (!ok) return;
                      onDeleteRecords('SALES_ORDER', editingSODocNumber);
                      setShowModal(null);
                      setEditingSODocNumber(null);
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              <button
                onClick={() => handleSaveManual('SALES_ORDER')}
                disabled={!form.partner || salesOrderItems.length === 0 || !salesOrderItems.some(i => {
                  if (!i.productId) return false;
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                  return q > 0;
                })}
                className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {editingSODocNumber ? '保存修改' : '确认保存销售订单'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                <h3 className={sectionTitleClass}>1. 销售订单基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <PartnerSelector
                    partners={partners}
                    categories={partnerCategories}
                    value={form.partner}
                    onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id || '' })}
                    label={current.partnerLabel}
                    placeholder={`选择${current.partnerLabel}...`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望交货日期</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                  <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                  <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                </div>
              </div>
            </div>

            <div className="pt-10 border-t border-slate-50 space-y-8">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                  <h3 className={sectionTitleClass}>2. 销售明细录入</h3>
                </div>
                <button onClick={addSalesOrderItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                  <Plus className="w-4 h-4" /> 添加明细行
                </button>
              </div>
              <div className="space-y-4">
                {salesOrderItems.map((line) => {
                  const prod = productMapPSI.get(line.productId);
                  const hasVariants = prod?.variants && prod.variants.length > 0;
                  const lineQty = hasVariants
                    ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                    : (line.quantity ?? 0);
                  const lineAmount = lineQty * (line.salesPrice || 0);
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  if (prod?.variants) {
                    prod.variants.forEach(v => {
                      if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                      groupedByColor[v.colorId].push(v);
                    });
                  }
                  return (
                  <div key={line.id} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex-1 min-w-[240px] space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标商品 (支持搜索与分类筛选)</label>
                        <SearchableProductSelect
                          options={products}
                          categories={categories}
                          value={line.productId}
                          onChange={(id) => {
                            const p = productMapPSI.get(id);
                            const hv = p?.variants && p.variants.length > 0;
                            updateSalesOrderItem(line.id, {
                              productId: id,
                              salesPrice: p?.salesPrice ?? 0,
                              quantity: hv ? undefined : 0,
                              variantQuantities: hv ? {} : undefined
                            });
                          }}
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售价 (元)</label>
                        <input type="number" min={0} step={0.01} value={line.salesPrice || ''} onChange={e => updateSalesOrderItem(line.id, { salesPrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                      </div>
                      {hasVariants && (
                        <>
                          <div className="w-24 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {lineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      {!hasVariants && (
                        <>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售数量（无颜色尺码）</label>
                            <div className="flex items-center gap-1.5">
                              <input type="number" min={0} value={line.quantity || ''} onChange={e => updateSalesOrderItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                              <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {lineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      <button onClick={() => removeSalesOrderItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                    </div>
                    {hasVariants && line.productId && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）</p>
                        {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries.colors.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                              <div className="flex items-center gap-2 w-28 shrink-0">
                                <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {colorVariants.map(v => {
                                  const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                  return (
                                    <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                      <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        placeholder="0"
                                        value={line.variantQuantities?.[v.id] ?? ''}
                                        onChange={e => updateSalesOrderVariantQty(line.id, v.id, parseInt(e.target.value) || 0)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="ml-auto text-right shrink-0 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100">
                                <p className="text-[9px] font-black text-slate-400 uppercase">颜色小计</p>
                                <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );})}
                {salesOrderItems.length === 0 && (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                    <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入销售明细</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
                <div className="flex items-center gap-4">
                  <p className="text-xs font-bold opacity-80">销售总量:</p>
                  <p className="text-xl font-black">{salesOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q;
                }, 0)} <span className="text-xs font-medium">PCS</span></p>
                </div>
                <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                  <p className="text-xs font-bold opacity-80">订单金额:</p>
                  <p className="text-xl font-black">¥{salesOrderItems.reduce((s, i) => {
                    const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                    return s + q * (i.salesPrice || 0);
                  }, 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : type === 'SALES_BILL' && showModal === 'SALES_BILL' ? (
        <div className="max-w-6xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button onClick={() => { setShowModal(null); setEditingSBDocNumber(null); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <div className="flex items-center gap-3">
              {editingSBDocNumber && onDeleteRecords && hasPsiPerm('psi:sales_bill:delete') && (
                <button
                  type="button"
                  onClick={() => {
                    void confirm({ message: '确定要删除该销售单吗？', danger: true }).then((ok) => {
                      if (!ok) return;
                      onDeleteRecords('SALES_BILL', editingSBDocNumber);
                      setShowModal(null);
                      setEditingSBDocNumber(null);
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              <button
                onClick={() => handleSaveManual('SALES_BILL')}
                disabled={!form.partner || !form.warehouseId || salesBillItems.length === 0 || !salesBillItems.some(i => {
                  if (!i.productId) return false;
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                  return q !== 0;
                })}
                className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {editingSBDocNumber ? '保存修改' : '确认保存销售单'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                <h3 className={sectionTitleClass}>1. 销售单基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <PartnerSelector
                    partners={partners}
                    categories={partnerCategories}
                    value={form.partner}
                    onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id || '' })}
                    label={current.partnerLabel}
                    placeholder={`选择${current.partnerLabel}...`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">出库仓库</label>
                  <select value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                    <option value="">选择仓库...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                  <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                  <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                </div>
              </div>
            </div>

            <div className="pt-10 border-t border-slate-50 space-y-8">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                  <h3 className={sectionTitleClass}>2. 销售出库明细</h3>
                </div>
                <button onClick={addSalesBillItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                  <Plus className="w-4 h-4" /> 添加明细行
                </button>
              </div>
              <div className="space-y-4">
                {salesBillItems.map((line) => {
                  const prod = productMapPSI.get(line.productId);
                  const hasVariants = prod?.variants && prod.variants.length > 0;
                  const lineQty = hasVariants
                    ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                    : (line.quantity ?? 0);
                  const lineAmount = lineQty * (line.salesPrice || 0);
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  if (prod?.variants) {
                    prod.variants.forEach(v => {
                      if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                      groupedByColor[v.colorId].push(v);
                    });
                  }
                  return (
                  <div key={line.id} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex-1 min-w-[240px] space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标商品 (支持搜索与分类筛选)</label>
                        <SearchableProductSelect
                          options={products}
                          categories={categories}
                          value={line.productId}
                          onChange={(id) => {
                            const p = productMapPSI.get(id);
                            const hv = p?.variants && p.variants.length > 0;
                            updateSalesBillItem(line.id, {
                              productId: id,
                              salesPrice: p?.salesPrice ?? 0,
                              quantity: hv ? undefined : 0,
                              variantQuantities: hv ? {} : undefined
                            });
                          }}
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售价 (元)</label>
                        <input type="number" min={0} step={0.01} value={line.salesPrice || ''} onChange={e => updateSalesBillItem(line.id, { salesPrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                      </div>
                      {hasVariants && (
                        <>
                          <div className="w-24 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {lineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      {!hasVariants && (
                        <>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">出库数量（负数=退货）</label>
                            <div className="flex items-center gap-1.5">
                              <input type="number" value={line.quantity ?? ''} onChange={e => { const v = parseInt(e.target.value, 10); updateSalesBillItem(line.id, { quantity: Number.isNaN(v) ? 0 : v }); }} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                              <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                            </div>
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {lineAmount.toFixed(2)}
                            </div>
                          </div>
                        </>
                      )}
                      <button onClick={() => removeSalesBillItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                    </div>
                    {hasVariants && line.productId && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）</p>
                        {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries.colors.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                              <div className="flex items-center gap-2 w-28 shrink-0">
                                <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {colorVariants.map(v => {
                                  const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                  return (
                                    <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                      <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                      <input
                                        type="number"
                                        placeholder="0"
                                        value={line.variantQuantities?.[v.id] ?? ''}
                                        onChange={e => { const vv = parseInt(e.target.value, 10); updateSalesBillVariantQty(line.id, v.id, Number.isNaN(vv) ? 0 : vv); }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="ml-auto text-right shrink-0 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100">
                                <p className="text-[9px] font-black text-slate-400 uppercase">颜色小计</p>
                                <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );})}
                {salesBillItems.length === 0 && (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                    <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入销售出库明细（数量可填负数表示退货）</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
                <div className="flex items-center gap-4">
                  <p className="text-xs font-bold opacity-80">出库总量:</p>
                  <p className="text-xl font-black">{salesBillItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q;
                }, 0)} <span className="text-xs font-medium">PCS</span></p>
                </div>
                <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                  <p className="text-xs font-bold opacity-80">单据金额:</p>
                  <p className="text-xl font-black">¥{salesBillItems.reduce((s, i) => {
                    const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                    return s + q * (i.salesPrice || 0);
                  }, 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL' ? (
        <div className="max-w-5xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button
              onClick={() => {
                setShowModal(null);
                setEditingPBDocNumber(null);
                setCreationMethod('MANUAL');
                setSelectedPOOrderNums([]);
                setSelectedPOItemIds([]);
                setSelectedPOItemQuantities({});
                setSelectedPOItemBatches({});
              }}
              className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <div className="flex items-center gap-3">
              {editingPBDocNumber && onDeleteRecords && hasPsiPerm('psi:purchase_bill:delete') && (
                <button
                  type="button"
                  onClick={() => {
                    void confirm({ message: '确定要删除该采购单吗？', danger: true }).then((ok) => {
                      if (!ok) return;
                      onDeleteRecords('PURCHASE_BILL', editingPBDocNumber);
                      setShowModal(null);
                      setEditingPBDocNumber(null);
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              {!editingPBDocNumber && (
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm">
                <button onClick={() => { setCreationMethod('MANUAL'); setPurchaseBillItems([]); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                  <Plus className="w-3 h-3" /> 直接手动创建
                </button>
                <button onClick={() => { setCreationMethod('FROM_ORDER'); setPurchaseBillItems([]); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${creationMethod === 'FROM_ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                  <ClipboardList className="w-3 h-3" /> 引用采购订单生成
                </button>
              </div>
              )}
              {(!editingPBDocNumber ? creationMethod === 'MANUAL' : true) ? (
                <button
                  onClick={() => handleSaveManual('PURCHASE_BILL')}
                  disabled={!form.partner || !form.warehouseId || purchaseBillItems.length === 0 || !purchaseBillItems.some(i => {
                  if (!i.productId) return false;
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                  return q > 0;
                })}
                  className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {editingPBDocNumber ? '保存修改' : '确认保存采购单'}
                </button>
              ) : (
                <button
                  onClick={handleConvertPOToBill}
                  disabled={!form.warehouseId || selectedPOItemIds.length === 0 || selectedPOItemIds.every(id => (selectedPOItemQuantities[id] ?? 0) <= 0)}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 text-sm"
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  执行入库 ({selectedPOItemIds.filter(id => (selectedPOItemQuantities[id] ?? 0) > 0).length} 条)
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
            {(!editingPBDocNumber ? creationMethod === 'MANUAL' : true) ? (
              <>
                <div className="space-y-8">
                  <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                    <h3 className={sectionTitleClass}>1. 采购单基础信息</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <PartnerSelector partners={partners} categories={partnerCategories} value={form.partner} onChange={(name, id) => setForm({...form, partner: name, partnerId: id || ''})} label="供应商" placeholder="选择供应商..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                      <input type="date" value={form.createdAt} onChange={e => setForm({...form, createdAt: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">入库仓库</label>
                      <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">选择仓库...</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    {safePurchaseBillFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                        <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                      </div>
                    )}
                    {safePurchaseBillFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                      <div key={cf.id} className={cf.type === 'text' || cf.type === undefined ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{cf.label}</label>
                        {cf.type === 'date' ? (
                          <input type="date" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                        ) : cf.type === 'number' ? (
                          <input type="number" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                        ) : cf.type === 'select' ? (
                          <select value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                            <option value="">请选择</option>
                            {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder={`${cf.label}`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-10 border-t border-slate-50 space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><Layers className="w-5 h-5" /></div>
                      <h3 className={sectionTitleClass}>2. 入库明细录入</h3>
                    </div>
                    <button onClick={addPurchaseBillItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                      <Plus className="w-4 h-4" /> 添加明细行
                    </button>
                  </div>
                  <div className="space-y-4">
                    {purchaseBillItems.map((line) => {
                      const pbProd = productMapPSI.get(line.productId);
                      const pbHasVariants = pbProd?.variants && pbProd.variants.length > 0;
                      const pbLineQty = pbHasVariants
                        ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                        : (line.quantity ?? 0);
                      const pbLineAmount = pbLineQty * (line.purchasePrice || 0);
                      const pbGroupedByColor: Record<string, ProductVariant[]> = {};
                      if (pbProd?.variants) {
                        pbProd.variants.forEach(v => {
                          if (!pbGroupedByColor[v.colorId]) pbGroupedByColor[v.colorId] = [];
                          pbGroupedByColor[v.colorId].push(v);
                        });
                      }
                      return (
                      <div key={line.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                        <div className="flex flex-wrap items-end gap-4">
                          <div className="flex-1 min-w-[200px] space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标采购品项 (支持搜索与分类筛选)</label>
                            <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                              const p = productMapPSI.get(id);
                              const hv = p?.variants && p.variants.length > 0;
                              updatePurchaseBillItem(line.id, {
                                productId: id,
                                purchasePrice: p?.purchasePrice ?? 0,
                                quantity: hv ? undefined : 0,
                                variantQuantities: hv ? {} : undefined,
                                batch: undefined
                              });
                            }} />
                          </div>
                          <div className="w-28 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                            <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => updatePurchaseBillItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                          </div>
                          {pbHasVariants && (
                            <>
                              <div className="w-24 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                                <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                  {formatQtyDisplay(pbLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                                </div>
                              </div>
                              <div className="w-28 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                                <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                  {pbLineAmount.toFixed(2)}
                                </div>
                              </div>
                              {pbProd && categoryMapPSI.get(pbProd.categoryId)?.hasBatchManagement && (
                                <div className="w-28 space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">批次</label>
                                  <input type="text" value={line.batch || ''} onChange={e => updatePurchaseBillItem(line.id, { batch: e.target.value.trim() || undefined })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="批号" />
                                </div>
                              )}
                            </>
                          )}
                          {!pbHasVariants && (
                            <>
                              <div className="w-24 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                                <div className="flex items-center gap-1.5">
                                  <input type="number" min={0} value={line.quantity || ''} onChange={e => updatePurchaseBillItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                  <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                                </div>
                              </div>
                              <div className="w-28 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                                <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                  {pbLineAmount.toFixed(2)}
                                </div>
                              </div>
                              {pbProd && categoryMapPSI.get(pbProd.categoryId)?.hasBatchManagement && (
                                <div className="w-28 space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">批次</label>
                                  <input type="text" value={line.batch || ''} onChange={e => updatePurchaseBillItem(line.id, { batch: e.target.value.trim() || undefined })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="批号" />
                                </div>
                              )}
                            </>
                          )}
                          <button onClick={() => removePurchaseBillItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                        </div>
                        {pbHasVariants && line.productId && (
                          <div className="pt-2 border-t border-slate-100 space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">颜色尺码数量</label>
                            {sortedVariantColorEntries(pbGroupedByColor, pbProd?.colorIds, pbProd?.sizeIds).map(([colorId, colorVariants]) => {
                              const color = dictionaries.colors.find(c => c.id === colorId);
                              return (
                                <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white/80 p-3 rounded-xl border border-slate-100">
                                  <div className="flex items-center gap-2 w-28 shrink-0">
                                    <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                    <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    {colorVariants.map(v => {
                                      const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                      return (
                                        <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                          <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                          <input
                                            type="number"
                                            min={0}
                                            placeholder="0"
                                            value={line.variantQuantities?.[v.id] ?? ''}
                                            onChange={e => updatePurchaseBillVariantQty(line.id, v.id, parseInt(e.target.value) || 0)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="ml-auto text-right shrink-0">
                                    <span className="text-[9px] font-black text-slate-400">小计</span>
                                    <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );})}
                    {purchaseBillItems.length === 0 && (
                      <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                        <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入入库明细</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
                    <div className="flex items-center gap-4">
                      <p className="text-xs font-bold opacity-80">入库总量:</p>
                      <p className="text-xl font-black">{purchaseBillItems.reduce((s, i) => s + (i.quantity || 0), 0)} <span className="text-xs font-medium">PCS</span></p>
                    </div>
                    <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                      <p className="text-xs font-bold opacity-80">总金额:</p>
                      <p className="text-xl font-black">¥{purchaseBillItems.reduce((s, i) => s + (i.quantity || 0) * (i.purchasePrice || 0), 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-8">
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ClipboardList className="w-4 h-4" /> 1. 选择来源订单</h4>
                  {pendingPOs.length === 0 ? (
                    <div className="py-12 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                      <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 font-bold italic text-xs">暂无未入库完成的采购订单</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {pendingPOs.map(([docNum, items]) => {
                        const isSelected = selectedPOOrderNums.includes(docNum);
                        const partnerName = items[0]?.partner;
                        return (
                          <button
                            key={docNum}
                            onClick={() => {
                              if (selectedPOOrderNums.length > 0) {
                                const currentPartner = allPOByGroups[selectedPOOrderNums[0]][0]?.partner;
                                if (partnerName !== currentPartner) {
                                  toast.error("不可跨供应商引用订单！");
                                  return;
                                }
                              }
                              setSelectedPOOrderNums(prev => prev.includes(docNum) ? prev.filter(n => n !== docNum) : [...prev, docNum]);
                            }}
                            className={`p-4 rounded-[24px] border-2 text-left transition-all flex items-center justify-between ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-50 bg-slate-50 hover:border-indigo-200'}`}
                          >
                            <div>
                              <p className="text-sm font-black text-slate-800">{docNum}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">{partnerName}</p>
                            </div>
                            {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-slate-200" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedPOOrderNums.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListFilter className="w-4 h-4" /> 2. 勾选并填写本次入库数量 (支持部分到货)</h4>
                    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-100">
                            <th className="px-4 py-3 w-10 text-center">
                              <button onClick={(e) => {
                                e.stopPropagation();
                                if (selectedPOItemIds.length === availableItemsFromSelectedPOs.length) {
                                  setSelectedPOItemIds([]);
                                  setSelectedPOItemQuantities({});
                                  setSelectedPOItemBatches({});
                                } else {
                                  const ids = availableItemsFromSelectedPOs.map(i => i.id);
                                  setSelectedPOItemIds(ids);
                                  setSelectedPOItemQuantities(prev => {
                                    const next = { ...prev };
                                    availableItemsFromSelectedPOs.forEach(i => { next[i.id] = i.remainingQty; });
                                    return next;
                                  });
                                }
                              }} className="text-slate-400 hover:text-indigo-600">
                                {selectedPOItemIds.length === availableItemsFromSelectedPOs.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                              </button>
                            </th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">源订单 / 商品</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">采购价</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">订单数量</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">本次入库数量</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">批次</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {availableItemsFromSelectedPOs.map((item) => {
                            const product = productMapPSI.get(item.productId);
                            const prodCategory = product && categoryMapPSI.get(product.categoryId);
                            const hasBatch = prodCategory?.hasBatchManagement;
                            const isChecked = selectedPOItemIds.includes(item.id);
                            const qty = selectedPOItemQuantities[item.id] ?? item.remainingQty;
                            const handleToggle = () => {
                              if (isChecked) {
                                setSelectedPOItemIds(prev => prev.filter(id => id !== item.id));
                                setSelectedPOItemQuantities(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                setSelectedPOItemBatches(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                              } else {
                                setSelectedPOItemIds(prev => [...prev, item.id]);
                                setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: item.remainingQty }));
                              }
                            };
                            return (
                              <tr key={item.id} onClick={() => handleToggle()} className={`cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}>
                                <td className="px-4 py-3 text-center">
                                  {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-300 uppercase">{item.docNumber}</span>
                                    <span className="text-xs font-bold text-slate-700">{product?.name}</span>
                                    <span className="text-[8px] text-slate-400 uppercase tracking-tighter">
                                      SKU: {product?.sku}
                                      {item.variantId && product?.variants && (() => {
                                        const v = product.variants.find((x: ProductVariant) => x.id === item.variantId);
                                        if (!v) return '';
                                        const c = dictionaries.colors.find(x => x.id === v.colorId)?.name;
                                        const s = dictionaries.sizes.find(x => x.id === v.sizeId)?.name;
                                        return (c || s) ? ` · ${[c, s].filter(Boolean).join(' / ')}` : '';
                                      })()}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right"><span className="text-xs font-bold text-slate-500">¥{(item.purchasePrice ?? 0).toFixed(2)}</span></td>
                                <td className="px-4 py-3 text-right"><span className="text-sm font-bold text-slate-600">{formatQtyDisplay(item.quantity)} {item.productId ? getUnitName(item.productId) : 'PCS'}</span></td>
                                <td className="px-4 py-3 text-right"><span className="text-xs font-bold text-slate-400">{item.receivedQty}</span></td>
                                <td className="px-4 py-3 text-right"><span className="text-sm font-black text-indigo-600">{item.remainingQty}</span></td>
                                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                  {isChecked ? (
                                    <input type="number" min={0} value={qty} onChange={e => {
                                      const v = parseFloat(e.target.value);
                                      const val = Number.isFinite(v) ? Math.max(0, v) : 0;
                                      setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: val }));
                                    }} className="w-20 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" title="允许超过采购订单数量（如超收）" />
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                  {isChecked && hasBatch ? (
                                    <input type="text" value={selectedPOItemBatches[item.id] ?? ''} onChange={e => setSelectedPOItemBatches(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="批号" className="w-24 py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedPOItemIds.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">本次入库单号 (选填)</label>
                        <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">添加日期</label>
                        <input type="date" value={form.createdAt} onChange={e => setForm({...form, createdAt: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库至指定仓库 <span className="text-rose-500">*</span></label>
                        <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                          <option value="">点击选择入库仓...</option>
                          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {safePurchaseBillFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据备注</label>
                        <textarea rows={2} value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none resize-none" placeholder="记录本次引用入库的特别说明..."></textarea>
                      </div>
                    )}
                    {safePurchaseBillFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                      <div key={cf.id} className={cf.type === 'text' || cf.type === undefined ? 'space-y-1 md:col-span-2' : 'space-y-1'}>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{cf.label}</label>
                        {cf.type === 'date' ? (
                          <input type="date" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                        ) : cf.type === 'number' ? (
                          <input type="number" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                        ) : cf.type === 'select' ? (
                          <select value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">请选择</option>
                            {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder={`${cf.label}`} />
                        )}
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : type === 'WAREHOUSE_MGMT' ? (
        <div className="space-y-4 animate-in fade-in duration-300">
           <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
             <div className="flex items-center gap-3 flex-wrap">
               <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                 <button onClick={() => { setInventoryViewMode('warehouse'); setSelectedWarehouseId(null); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${inventoryViewMode === 'warehouse' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                   <WarehouseIcon className="w-3.5 h-3.5" /> 按仓库
                 </button>
                 <button onClick={() => setInventoryViewMode('product')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${inventoryViewMode === 'product' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                   <Package className="w-3.5 h-3.5" /> 按物料
                 </button>
               </div>
               <div className="relative group">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <input type="text" placeholder="搜索产品名称、SKU 或分类..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
               </div>
             </div>
             <div className="flex items-center gap-3">
               {hasPsiPerm('psi:warehouse_stocktake:view') && (
               <button
                 type="button"
                 onClick={() => { setStocktakeListModalOpen(true); setStocktakeDetailDocNumber(null); }}
                 className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold transition-all hover:bg-indigo-50"
               >
                 <ClipboardList className="w-4 h-4" /> 盘点单
               </button>
               )}
               {hasPsiPerm('psi:warehouse_transfer:view') && (
               <button
                 type="button"
                 onClick={() => { setTransferListModalOpen(true); setTransferDetailDocNumber(null); }}
                 className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold transition-all hover:bg-indigo-50"
               >
                 <MoveRight className="w-4 h-4" /> 调拨单
               </button>
               )}
               {hasPsiPerm('psi:warehouse_flow:allow') && (
               <button
                 type="button"
                 onClick={() => { setWarehouseFlowModalOpen(true); setWarehouseFlowDetailKey(null); }}
                 className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold transition-all hover:bg-indigo-50"
               >
                 <ScrollText className="w-4 h-4" /> 仓库流水
               </button>
               )}
             </div>
           </div>
           
           <>
               {/* 主列表：仓库库存信息（按仓库为二级：先仓库列表，点击再进该仓详情） */}
               {!hasPsiPerm('psi:warehouse_list:allow') ? (
                 <div className="bg-white rounded-[24px] border-2 border-dashed border-slate-100 p-20 text-center">
                   <WarehouseIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                   <p className="text-slate-400 font-medium">无权限查看仓库列表</p>
                 </div>
               ) : (
               <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2">
                 {inventoryViewMode === 'warehouse' ? (
                   selectedWarehouseId == null ? (
                     /* 一级：仓库列表，点击进入该仓详情 */
                     <div className="p-4 md:p-5">
                       {warehouseStockList.length === 0 ? (
                         <div className="py-16 text-center text-slate-400">
                           <WarehouseIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                           <p className="text-sm font-bold">暂无仓库或库存数据</p>
                           <p className="text-xs mt-1">请先在系统设置中维护仓库，并通过采购入库等业务产生库存</p>
                         </div>
                       ) : (
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                           {warehouseStockList.map(whRow => (
                             <button
                               key={whRow.warehouseId}
                               type="button"
                               onClick={() => setSelectedWarehouseId(whRow.warehouseId)}
                               className="text-left p-5 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md hover:bg-indigo-50/30 transition-all group"
                             >
                               <div className="flex items-start gap-4">
                                 <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 shrink-0">
                                   <WarehouseIcon className="w-6 h-6" />
                                 </div>
                                 <div className="min-w-0 flex-1">
                                   <h3 className="text-base font-black text-slate-800 truncate">{whRow.warehouseName}</h3>
                                   <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                     <span>{whRow.code}</span>
                                     <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{whRow.category}</span>
                                     {whRow.location && <span className="truncate">{whRow.location}</span>}
                                   </div>
                                   <div className="flex items-center gap-4 mt-3 text-sm">
                                     <span className="text-slate-500 font-bold">总存量 <span className={`font-black ${whRow.totalQty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{whRow.totalQty.toLocaleString()}</span></span>
                                     <span className="text-slate-500 font-bold">物料 <span className="text-slate-700 font-black">{whRow.skuCount}</span> SKU</span>
                                   </div>
                                 </div>
                                 <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 shrink-0 mt-0.5" />
                               </div>
                             </button>
                           ))}
                         </div>
                       )}
                     </div>
                   ) : (
                     /* 二级：选中仓库的库存详情（含产品图片） */
                     (() => {
                       const whRow = warehouseStockList.find(w => w.warehouseId === selectedWarehouseId);
                       if (!whRow) return null;
                       return (
                         <div className="p-4 md:p-5">
                           <button
                             type="button"
                             onClick={() => setSelectedWarehouseId(null)}
                             className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm mb-4"
                           >
                             <ArrowLeft className="w-4 h-4" /> 返回仓库列表
                           </button>
                           <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                             <div className="flex items-center gap-4">
                               <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                 <WarehouseIcon className="w-6 h-6" />
                               </div>
                               <div>
                                 <h3 className="text-lg font-black text-slate-800">{whRow.warehouseName}</h3>
                                 <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                   <span>{whRow.code}</span>
                                   <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{whRow.category}</span>
                                   {whRow.location && <span>{whRow.location}</span>}
                                   {whRow.contact && <span>负责人: {whRow.contact}</span>}
                                 </div>
                               </div>
                             </div>
                             <div className="flex items-center gap-4 text-sm">
                               <span className="text-slate-500 font-bold">总存量 <span className={`font-black ${whRow.totalQty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{whRow.totalQty.toLocaleString()}</span> PCS</span>
                               <span className="text-slate-500 font-bold">物料种类 <span className="text-slate-700 font-black">{whRow.skuCount}</span> SKU</span>
                             </div>
                           </div>
                           {whRow.lines.length === 0 ? (
                             <p className="text-sm text-slate-400 italic py-6">该仓库暂无结存</p>
                           ) : (
                             <div className="overflow-x-auto rounded-xl border border-slate-100">
                               <table className="w-full text-left">
                                 <thead>
                                   <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/80 border-b border-slate-100">
                                     <th className="px-4 py-3 w-10" />
                                     <th className="px-4 py-3 w-14">图片</th>
                                     <th className="px-4 py-3">产品 / SKU</th>
                                     <th className="px-4 py-3">分类</th>
                                     <th className="px-4 py-3 text-right">结存数量</th>
                                     <th className="px-4 py-3 text-right w-24">操作</th>
                                   </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-50">
                                   {whRow.lines.map(line => {
                                     const expandKey = `${whRow.warehouseId}-${line.productId}`;
                                     const hasVariants = (line as any).variantBreakdown?.length > 0;
                                     const isExpanded = expandedWarehouseProductKeys.has(expandKey);
                                     const groupedByColor: Record<string, { colorName: string; items: { sizeName: string; qty: number }[] }> = {};
                                     if (hasVariants) {
                                       ((line as any).variantBreakdown as { colorId: string; colorName: string; sizeName: string; qty: number }[]).forEach((vb: { colorId: string; colorName: string; sizeName: string; qty: number }) => {
                                         if (!groupedByColor[vb.colorId]) groupedByColor[vb.colorId] = { colorName: vb.colorName, items: [] };
                                         groupedByColor[vb.colorId].items.push({ sizeName: vb.sizeName, qty: vb.qty });
                                       });
                                     }
                                     return (
                                       <React.Fragment key={expandKey}>
                                         <tr className="hover:bg-slate-50/50 transition-colors">
                                           <td className="px-2 py-3 w-10">
                                             {hasVariants ? (
                                               <button type="button" onClick={() => setExpandedWarehouseProductKeys(prev => { const next = new Set(prev); if (next.has(expandKey)) next.delete(expandKey); else next.add(expandKey); return next; })} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                                                 {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                               </button>
                                             ) : null}
                                           </td>
                                           <td className="px-4 py-3">
                                             {line.imageUrl ? (
                                               <button type="button" onClick={() => setImagePreviewUrl(line.imageUrl!)} className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:opacity-90 transition-opacity">
                                                 <img src={line.imageUrl} alt={line.name} className="w-full h-full object-cover block" />
                                               </button>
                                             ) : (
                                               <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                                                 <Package className="w-5 h-5" />
                                               </div>
                                             )}
                                           </td>
                                           <td className="px-4 py-3">
                                             <div>
                                               <p className="text-sm font-bold text-slate-800">{line.name}</p>
                                               <p className="text-[10px] text-slate-400 font-bold uppercase">{line.sku}</p>
                                             </div>
                                           </td>
                                           <td className="px-4 py-3 text-sm text-slate-600">{line.categoryName}</td>
                                           <td className="px-4 py-3 text-right">
                                             <span className={`text-sm font-black ${line.qty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{line.qty.toLocaleString()}</span>
                                             <span className="text-[10px] text-slate-400 ml-1">{line.productId ? getUnitName(line.productId) : 'PCS'}</span>
                                           </td>
                                           <td className="px-4 py-3 text-right">
                                             <button type="button" onClick={() => setProductFlowDetail({ productId: line.productId, productName: line.name, warehouseId: whRow.warehouseId, warehouseName: whRow.warehouseName })} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                               <FileText className="w-3.5 h-3.5" /> 详情
                                             </button>
                                           </td>
                                         </tr>
                                        {hasVariants && isExpanded && (
                                          <tr>
                                            <td colSpan={6} className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                                              <div className="space-y-3 pl-4">
                                                {sortedColorEntries(groupedByColor, productMapPSI.get(line.productId)?.colorIds).map(([colorId, { colorName, items }]) => {
                                                  const color = dictionaries?.colors?.find(c => c.id === colorId);
                                                  return (
                                                  <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                                                    <div className="flex items-center gap-3 w-40 shrink-0">
                                                      <div className="w-5 h-5 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: color?.value }} />
                                                      <span className="text-sm font-black text-slate-700">{colorName}</span>
                                                    </div>
                                                    <div className="flex-1 flex flex-wrap gap-4">
                                                      {items.map((item, idx) => (
                                                        <div key={idx} className="flex flex-col gap-1.5 w-24">
                                                          <span className="text-[10px] font-black text-slate-400 uppercase">{item.sizeName}</span>
                                                          <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2">
                                                            <span className={`text-sm font-bold ${item.qty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{item.qty.toLocaleString()}</span>
                                                           </div>
                                                         </div>
                                                       ))}
                                                     </div>
                                                   </div>
                                                   );
                                                 })}
                                                 {(() => {
                                                   const variantSum = (Object.values(groupedByColor) as { items: { qty: number }[] }[]).reduce((s, g) => s + g.items.reduce((t, i) => t + i.qty, 0), 0);
                                                   const stocktakePart = line.qty - variantSum;
                                                   if (stocktakePart > 0) return (
                                                     <div className="mt-2 p-3 bg-amber-50/80 rounded-xl border border-amber-100 text-xs">
                                                       <span className="text-amber-700 font-bold">盘点调整（产品级）：+{stocktakePart.toLocaleString()}</span>
                                                       <span className="text-slate-500 ml-1">（行结存 = 各规格数量 + 盘点调整）</span>
                                                     </div>
                                                   );
                                                   return null;
                                                 })()}
                                               </div>
                                             </td>
                                           </tr>
                                         )}
                                       </React.Fragment>
                                     );
                                   })}
                                 </tbody>
                               </table>
                             </div>
                           )}
                         </div>
                       );
                     })()
                   )
                 ) : (
                   <div className="overflow-x-auto">
                     {nonZeroStocks.length === 0 ? (
                       <div className="py-16 text-center text-slate-400">
                         <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                         <p className="text-sm font-bold">暂无库存数据</p>
                         <p className="text-xs mt-1">通过采购入库、生产入库等业务产生库存后在此展示</p>
                       </div>
                     ) : (<>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-4 w-10" />
                            <th className="px-4 py-4 w-14">图片</th>
                            <th className="px-6 py-4">产品 / SKU</th>
                            <th className="px-6 py-4">分类</th>
                            <th className="px-6 py-4 text-right">总库存</th>
                            {warehouses.map(wh => (
                              <th key={wh.id} className="px-4 py-4 text-right whitespace-nowrap">{wh.name}</th>
                            ))}
                            <th className="px-4 py-4 text-right w-24">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                         {pStocks.visibleItems.map(ps => {
                            const hasVariants = (ps as any).variantBreakdown?.length > 0;
                            const isExpanded = expandedProductIdByMaterial === ps.id;
                            const groupedByColor: Record<string, { colorName: string; items: { sizeName: string; totalQty: number }[] }> = {};
                            if (hasVariants) {
                              ((ps as any).variantBreakdown as { colorId: string; colorName: string; sizeName: string; totalQty: number }[]).forEach((vb: { colorId: string; colorName: string; sizeName: string; totalQty: number }) => {
                                if (!groupedByColor[vb.colorId]) groupedByColor[vb.colorId] = { colorName: vb.colorName, items: [] };
                                groupedByColor[vb.colorId].items.push({ sizeName: vb.sizeName, totalQty: vb.totalQty });
                              });
                            }
                            const colSpan = 6 + warehouses.length;
                            return (
                              <React.Fragment key={ps.id}>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-2 py-3 w-10">
                                    {hasVariants ? (
                                      <button type="button" onClick={() => setExpandedProductIdByMaterial(prev => prev === ps.id ? null : ps.id)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                      </button>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3">
                                    {ps.imageUrl ? (
                                      <button type="button" onClick={() => setImagePreviewUrl(ps.imageUrl!)} className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:opacity-90 transition-opacity">
                                        <img src={ps.imageUrl} alt={ps.name} className="w-full h-full object-cover block" />
                                      </button>
                                    ) : (
                                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                                        <Package className="w-5 h-5" />
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-3">
                                    <div>
                                      <p className="text-sm font-bold text-slate-800">{ps.name}</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase">{ps.sku}</p>
                                    </div>
                                  </td>
                                  <td className="px-6 py-3 text-sm text-slate-600">{ps.categoryName}</td>
                                  <td className="px-6 py-3 text-right">
                                    <span className={`text-sm font-black ${ps.total < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{ps.total.toLocaleString()}</span>
                                    <span className="text-[10px] text-slate-400 ml-1">{getUnitName(ps.id)}</span>
                                  </td>
                                  {warehouses.map(wh => {
                                    const d = ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id);
                                    const qty = d?.qty ?? 0;
                                    return (
                                      <td key={wh.id} className="px-4 py-3 text-right text-sm font-bold text-slate-600">
                                        {qty !== 0 ? <span className={qty < 0 ? 'text-rose-600 font-bold' : ''}>{qty.toLocaleString()}</span> : '—'}
                                      </td>
                                    );
                                  })}
                                  <td className="px-4 py-3 text-right">
                                    <button type="button" onClick={() => setProductFlowDetail({ productId: ps.id, productName: ps.name, warehouseId: null, warehouseName: null })} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                      <FileText className="w-3.5 h-3.5" /> 详情
                                    </button>
                                  </td>
                                </tr>
                                {hasVariants && isExpanded && (
                                  <tr>
                                    <td colSpan={colSpan} className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                                      <div className="space-y-3 pl-4">
                                        {sortedColorEntries(groupedByColor, productMapPSI.get(ps.id)?.colorIds).map(([colorId, { colorName, items }]) => {
                                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                                          return (
                                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                                              <div className="flex items-center gap-3 w-40 shrink-0">
                                                <div className="w-5 h-5 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: color?.value }} />
                                                <span className="text-sm font-black text-slate-700">{colorName}</span>
                                              </div>
                                              <div className="flex-1 flex flex-wrap gap-4">
                                                {items.map((item, idx) => (
                                                  <div key={idx} className="flex flex-col gap-1.5 w-24">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">{item.sizeName}</span>
                                                    <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2">
                                                      <span className="text-sm font-bold text-indigo-600">{item.totalQty.toLocaleString()}</span>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                         </tbody>
                       </table>
                       {pStocks.hasMore && (
                         <div className="flex items-center justify-center gap-3 py-3 bg-slate-50/80 border-t border-slate-100">
                           <span className="text-xs text-slate-400">已显示 {pStocks.visibleItems.length} / {pStocks.total} 条</span>
                           <button type="button" onClick={pStocks.showMore} className="px-4 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all">加载更多</button>
                           <button type="button" onClick={pStocks.showAll} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all">全部显示</button>
                         </div>
                       )}
                     </>)}
                   </div>
                 )}
               </div>
               )}

               {/* 产品图点击放大 */}
               {imagePreviewUrl && (
                 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 animate-in fade-in" onClick={() => setImagePreviewUrl(null)} aria-hidden>
                   <img src={imagePreviewUrl} alt="产品图片" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                   <button type="button" onClick={() => setImagePreviewUrl(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all" aria-label="关闭">
                     <X className="w-6 h-6" />
                   </button>
                 </div>
               )}

               {/* 盘点单列表弹窗：列表 + 查看详情（详情中可编辑） + 新增盘点单 */}
               {stocktakeListModalOpen && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStocktakeListModalOpen(false); setStocktakeDetailDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-3xl max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div className="flex items-center gap-3">
                         {stocktakeDetailDocNumber ? (
                           <button type="button" onClick={() => setStocktakeDetailDocNumber(null)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="返回列表"><ArrowLeft className="w-5 h-5" /></button>
                         ) : null}
                         <div>
                           <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><ClipboardList className="w-5 h-5 text-indigo-600" /> {stocktakeDetailDocNumber ? `盘点单详情 - ${stocktakeDetailDocNumber}` : '盘点单'}</h3>
                           <p className="text-xs text-slate-500 mt-0.5">{stocktakeDetailDocNumber ? '查看明细，可点击「编辑」修改' : '盘点单列表，可查看详情或新增'}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {!stocktakeDetailDocNumber && hasPsiPerm('psi:warehouse_stocktake:create') && (
                           <button type="button" onClick={() => { setEditingStocktakeDocNumber(null); setStocktakeForm({ warehouseId: '', stocktakeDate: new Date().toISOString().split('T')[0], note: '' }); setStocktakeItems([]); setStocktakeListModalOpen(false); setStocktakeModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                             <Plus className="w-4 h-4" /> 新增盘点单
                           </button>
                         )}
                         <button type="button" onClick={() => { setStocktakeListModalOpen(false); setStocktakeDetailDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {!stocktakeDetailDocNumber ? (
                         Object.keys(stocktakeOrdersGrouped).length === 0 ? (
                           <div className="py-16 text-center text-slate-500">
                             <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                             <p className="text-sm font-medium">暂无盘点单</p>
                             <p className="text-xs mt-1">点击「新增盘点单」创建第一张盘点单</p>
                           </div>
                         ) : (
                           <div className="space-y-3">
                             {Object.entries(stocktakeOrdersGrouped).map(([docNum, docItems]) => {
                               const first = docItems[0];
                               const totalQty = docItems.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                               const whName = warehouseMapPSI.get(first.warehouseId)?.name ?? '—';
                               return (
                                 <div key={docNum} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                   <div className="flex items-center gap-4">
                                     <span className="text-[10px] font-mono font-black text-indigo-600 uppercase tracking-wide">{docNum}</span>
                                     <span className="text-sm text-slate-600">{whName}</span>
                                     <span className="text-xs text-slate-400">{(first.createdAt || '').toString().slice(0, 10)}</span>
                                     <span className="text-sm font-bold text-slate-700">共 {totalQty} 件</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <button type="button" onClick={() => setStocktakeDetailDocNumber(docNum)} className="px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1">
                                       <FileText className="w-3.5 h-3.5" /> 查看详情
                                     </button>
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         )
                       ) : (
                         (() => {
                           const docItems = stocktakeOrdersGrouped[stocktakeDetailDocNumber];
                           if (!docItems || docItems.length === 0) return <p className="text-slate-500 py-8">未找到该盘点单</p>;
                           const first = docItems[0];
                           const whName = warehouseMapPSI.get(first.warehouseId)?.name ?? '—';
                           const byLineGroup = new Map<string, any[]>();
                           docItems.forEach((r: any) => {
                             const gid = r.lineGroupId ?? r.id;
                             if (!byLineGroup.has(gid)) byLineGroup.set(gid, []);
                             byLineGroup.get(gid)!.push(r);
                           });
                           const openStocktakeForEdit = () => {
                             setEditingStocktakeDocNumber(stocktakeDetailDocNumber);
                             setStocktakeForm({
                               warehouseId: first.warehouseId || '',
                               stocktakeDate: (first.createdAt || '').toString().slice(0, 10) || new Date().toISOString().split('T')[0],
                               note: first.note || ''
                             });
                             const groups: Record<string, any[]> = {};
                             docItems.forEach((item: any) => {
                               const gid = item.lineGroupId ?? item.id;
                               if (!groups[gid]) groups[gid] = [];
                               groups[gid].push(item);
                             });
                             setStocktakeItems(Object.entries(groups).map(([gid, grp]) => {
                               const firstItem = grp[0];
                               const variantQuantities: Record<string, number> = {};
                               let quantity = 0;
                               grp.forEach((item: any) => {
                                 if (item.variantId) {
                                   variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
                                 } else {
                                   quantity += item.quantity ?? 0;
                                 }
                               });
                               const hasVariants = Object.keys(variantQuantities).length > 0;
                               return hasVariants
                                 ? { id: gid, productId: firstItem.productId, variantQuantities }
                                 : { id: gid, productId: firstItem.productId, quantity };
                             }));
                             setStocktakeListModalOpen(false);
                             setStocktakeDetailDocNumber(null);
                             setStocktakeModalOpen(true);
                           };
                           return (
                             <div className="space-y-4">
                               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">盘点仓库</span><span className="font-bold text-slate-800">{whName}</span></div>
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">盘点日期</span><span className="font-bold text-slate-800">{(first.createdAt || '').toString().slice(0, 10)}</span></div>
                                 {first.note && <div className="col-span-2"><span className="text-slate-400 block text-xs font-bold mb-0.5">备注</span><span className="text-slate-600">{first.note}</span></div>}
                               </div>
                               <div>
                                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">盘点明细</h4>
                                 <p className="text-xs text-slate-500 mb-2">「系统数量」= 本单保存时该产品在系统中的数量（盘前），「实盘数量」= 本单盘点录入的数量，便于了解从多少数量盘库到多少数量；有颜色尺码会展开各规格的当时系统数与实盘数。</p>
                                 <div className="border border-slate-200 rounded-xl overflow-hidden">
                                   <table className="w-full text-left text-sm">
                                     <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">系统数量（盘前）</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">实盘数量</th></tr></thead>
                                     <tbody>
                                       {Array.from(byLineGroup.entries()).map(([gid, grp]) => {
                                         const firstLine = grp[0];
                                         const product = productMapPSI.get(firstLine.productId);
                                         const whId = first.warehouseId;
                                         const qty = grp.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
                                         const hasVariants = (product?.variants?.length ?? 0) > 0;
                                         // 直接从记录中读取保存时存入的 systemQuantity（盘前），无则回退用 diff 反算
                                         const hasSavedSysQty = grp.some((r: any) => typeof r.systemQuantity === 'number');
                                         const systemQtyAtStocktake = hasSavedSysQty
                                           ? grp.reduce((s: number, r: any) => s + (r.systemQuantity ?? 0), 0)
                                           : (() => { const diffQ = docItems.find((r: any) => r.productId === firstLine.productId)?.diffQuantity ?? 0; return qty - Number(diffQ); })();
                                         const stGroupedByColor: Record<string, ProductVariant[]> = {};
                                         if (product?.variants) {
                                           product.variants.forEach((v: ProductVariant) => {
                                             if (!stGroupedByColor[v.colorId]) stGroupedByColor[v.colorId] = [];
                                             stGroupedByColor[v.colorId].push(v);
                                           });
                                         }
                                         const variantQtyFromGrp = (variantId: string) => grp.reduce((s: number, r: any) => s + (r.variantId === variantId ? (r.quantity ?? 0) : 0), 0);
                                         const variantSysFromGrp = (variantId: string) => {
                                           const rec = grp.find((r: any) => (r.variantId || '') === variantId);
                                           return typeof rec?.systemQuantity === 'number' ? rec.systemQuantity : null;
                                         };
                                         return (
                                           <React.Fragment key={gid}>
                                             <tr className="border-b border-slate-100">
                                               <td className="px-4 py-3 font-bold text-slate-800">{product?.name ?? '—'} <span className="text-slate-400 font-normal text-xs">{product?.sku ?? ''}</span></td>
                                               <td className="px-4 py-3 text-right font-bold text-slate-600">{systemQtyAtStocktake} {product ? getUnitName(product.id) : 'PCS'}</td>
                                               <td className="px-4 py-3 text-right font-black text-indigo-600">{qty} {product ? getUnitName(product.id) : 'PCS'}</td>
                                             </tr>
                                             {hasVariants && whId && (
                                               <tr className="border-b border-slate-100 last:border-0 bg-slate-50/60">
                                                 <td colSpan={3} className="px-4 py-3">
                                                   <div className="space-y-3">
                                                     {sortedVariantColorEntries(stGroupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                                                       const color = dictionaries?.colors?.find(c => c.id === colorId);
                                                       return (
                                                         <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-slate-100">
                                                           <div className="flex items-center gap-2 w-28 shrink-0">
                                                             <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                                             <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                                           </div>
                                                           <div className="flex flex-wrap gap-4">
                                                             {colorVariants.map((v: ProductVariant) => {
                                                               const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                                               const actualV = variantQtyFromGrp(v.id);
                                                               const sysV = variantSysFromGrp(v.id) ?? actualV;
                                                               return (
                                                                 <div key={v.id} className="flex flex-col gap-0.5 w-24">
                                                                   <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                                                   <div className="flex items-center gap-2 text-xs">
                                                                     <span className="text-slate-500">系统 <span className="font-bold text-slate-600">{sysV}</span></span>
                                                                     <span className="text-slate-400">/</span>
                                                                     <span className="text-indigo-600 font-black">实盘 {actualV}</span>
                                                                   </div>
                                                                 </div>
                                                               );
                                                             })}
                                                           </div>
                                                         </div>
                                                       );
                                                     })}
                                                   </div>
                                                 </td>
                                               </tr>
                                             )}
                                           </React.Fragment>
                                         );
                                       })}
                                     </tbody>
                                   </table>
                                 </div>
                               </div>
                               <div className="flex justify-end items-center gap-3 pt-2">
                                 {onDeleteRecords && hasPsiPerm('psi:warehouse_stocktake:delete') && (
                                   <button type="button" onClick={() => { void confirm({ message: '确定要删除该盘点单吗？', danger: true }).then((ok) => { if (!ok) return; onDeleteRecords('STOCKTAKE', stocktakeDetailDocNumber); setStocktakeDetailDocNumber(null); setStocktakeListModalOpen(false); }); }} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all">
                                     <Trash2 className="w-4 h-4" /> 删除盘点单
                                   </button>
                                 )}
                                 {hasPsiPerm('psi:warehouse_stocktake:edit') && (
                                 <button type="button" onClick={openStocktakeForEdit} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                                   <Pencil className="w-4 h-4" /> 编辑盘点单
                                 </button>
                                 )}
                               </div>
                             </div>
                           );
                         })()
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {/* 调拨单列表弹窗：列表 + 查看详情（详情中可编辑） + 新建调拨单 */}
               {transferListModalOpen && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setTransferListModalOpen(false); setTransferDetailDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-3xl max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div className="flex items-center gap-3">
                         {transferDetailDocNumber ? (
                           <button type="button" onClick={() => setTransferDetailDocNumber(null)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="返回列表"><ArrowLeft className="w-5 h-5" /></button>
                         ) : null}
                         <div>
                           <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><MoveRight className="w-5 h-5 text-indigo-600" /> {transferDetailDocNumber ? `调拨单详情 - ${transferDetailDocNumber}` : '调拨单'}</h3>
                           <p className="text-xs text-slate-500 mt-0.5">{transferDetailDocNumber ? '查看明细，可点击「编辑」修改' : '调拨单列表，可查看详情或新建'}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {!transferDetailDocNumber && hasPsiPerm('psi:warehouse_transfer:create') && (
                           <button type="button" onClick={() => { setEditingTransferDocNumber(null); setTransferForm({ fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().split('T')[0], note: '' }); setTransferItems([]); setTransferListModalOpen(false); setTransferModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                             <Plus className="w-4 h-4" /> 新建调拨单
                           </button>
                         )}
                         <button type="button" onClick={() => { setTransferListModalOpen(false); setTransferDetailDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {!transferDetailDocNumber ? (
                         /* 列表 */
                         Object.keys(transferOrdersGrouped).length === 0 ? (
                           <div className="py-16 text-center text-slate-500">
                             <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                             <p className="text-sm font-medium">暂无调拨单</p>
                             <p className="text-xs mt-1">点击「新建调拨单」创建第一张调拨单</p>
                           </div>
                         ) : (
                           <div className="space-y-3">
                             {Object.entries(transferOrdersGrouped).map(([docNum, docItems]) => {
                               const first = docItems[0];
                               const totalQty = docItems.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                               const fromName = warehouseMapPSI.get(first.fromWarehouseId)?.name ?? '—';
                               const toName = warehouseMapPSI.get(first.toWarehouseId)?.name ?? '—';
                               return (
                                 <div key={docNum} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                   <div className="flex items-center gap-4">
                                     <span className="text-[10px] font-mono font-black text-indigo-600 uppercase tracking-wide">{docNum}</span>
                                     <span className="text-sm text-slate-600">{fromName} → {toName}</span>
                                     <span className="text-xs text-slate-400">{(first.createdAt || '').toString().slice(0, 10)}</span>
                                     <span className="text-sm font-bold text-slate-700">共 {totalQty} 件</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <button type="button" onClick={() => setTransferDetailDocNumber(docNum)} className="px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1">
                                       <FileText className="w-3.5 h-3.5" /> 查看详情
                                     </button>
                                     {onDeleteRecords && hasPsiPerm('psi:warehouse_transfer:delete') && (
                                       <button type="button" onClick={() => { void confirm({ message: '确定要删除该调拨单吗？', danger: true }).then((ok) => { if (!ok) return; onDeleteRecords('TRANSFER', docNum); }); }} className="px-3 py-1.5 text-[11px] font-bold rounded-xl border border-slate-200 text-slate-500 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all flex items-center gap-1">
                                         <Trash2 className="w-3.5 h-3.5" /> 删除
                                       </button>
                                     )}
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         )
                       ) : (
                         /* 详情 */
                         (() => {
                           const docItems = transferOrdersGrouped[transferDetailDocNumber];
                           if (!docItems || docItems.length === 0) return <p className="text-slate-500 py-8">未找到该调拨单</p>;
                           const first = docItems[0];
                           const fromName = warehouseMapPSI.get(first.fromWarehouseId)?.name ?? '—';
                           const toName = warehouseMapPSI.get(first.toWarehouseId)?.name ?? '—';
                           const byLineGroup = new Map<string, any[]>();
                           docItems.forEach((r: any) => {
                             const gid = r.lineGroupId ?? r.id;
                             if (!byLineGroup.has(gid)) byLineGroup.set(gid, []);
                             byLineGroup.get(gid)!.push(r);
                           });
                           const openTransferForEdit = () => {
                             setEditingTransferDocNumber(transferDetailDocNumber);
                             setTransferForm({
                               fromWarehouseId: first.fromWarehouseId || '',
                               toWarehouseId: first.toWarehouseId || '',
                               transferDate: (first.createdAt || '').toString().slice(0, 10) || new Date().toISOString().split('T')[0],
                               note: first.note || ''
                             });
                             const groups: Record<string, any[]> = {};
                             docItems.forEach((item: any) => {
                               const gid = item.lineGroupId ?? item.id;
                               if (!groups[gid]) groups[gid] = [];
                               groups[gid].push(item);
                             });
                             setTransferItems(Object.entries(groups).map(([gid, grp]) => {
                               const firstItem = grp[0];
                               const variantQuantities: Record<string, number> = {};
                               let quantity = 0;
                               grp.forEach((item: any) => {
                                 if (item.variantId) {
                                   variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
                                 } else {
                                   quantity += item.quantity ?? 0;
                                 }
                               });
                               const hasVariants = Object.keys(variantQuantities).length > 0;
                               return hasVariants
                                 ? { id: gid, productId: firstItem.productId, variantQuantities }
                                 : { id: gid, productId: firstItem.productId, quantity };
                             }));
                             setTransferListModalOpen(false);
                             setTransferDetailDocNumber(null);
                             setTransferModalOpen(true);
                           };
                           return (
                             <div className="space-y-4">
                               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">调出仓库</span><span className="font-bold text-slate-800">{fromName}</span></div>
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">调入仓库</span><span className="font-bold text-slate-800">{toName}</span></div>
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">调拨日期</span><span className="font-bold text-slate-800">{(first.createdAt || '').toString().slice(0, 10)}</span></div>
                                 {first.note && <div className="col-span-2"><span className="text-slate-400 block text-xs font-bold mb-0.5">备注</span><span className="text-slate-600">{first.note}</span></div>}
                               </div>
                               <div>
                                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">调拨明细</h4>
                                 <div className="border border-slate-200 rounded-xl overflow-hidden">
                                   <table className="w-full text-left text-sm">
                                     <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                                     <tbody>
                                       {Array.from(byLineGroup.entries()).map(([gid, grp]) => {
                                         const firstLine = grp[0];
                                         const product = productMapPSI.get(firstLine.productId);
                                         const qty = grp.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
                                         return (
                                           <tr key={gid} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3 font-bold text-slate-800">{product?.name ?? '—'} <span className="text-slate-400 font-normal text-xs">{product?.sku ?? ''}</span></td><td className="px-4 py-3 text-right font-black text-indigo-600">{qty} {product ? getUnitName(product.id) : 'PCS'}</td></tr>
                                         );
                                       })}
                                     </tbody>
                                   </table>
                                 </div>
                               </div>
                               {hasPsiPerm('psi:warehouse_transfer:edit') && (
                               <div className="flex justify-end pt-2">
                                 <button type="button" onClick={openTransferForEdit} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                                   <Pencil className="w-4 h-4" /> 编辑调拨单
                                 </button>
                               </div>
                               )}
                             </div>
                           );
                         })()
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {/* 调拨单表单弹窗（新建/编辑） */}
               {transferModalOpen && (
                 <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setTransferModalOpen(false); setEditingTransferDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div>
                         <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><MoveRight className="w-5 h-5 text-indigo-600" /> {editingTransferDocNumber ? '编辑调拨单' : '调拨单'}</h3>
                         <p className="text-xs text-slate-500 mt-0.5">{editingTransferDocNumber ? `单号：${editingTransferDocNumber}` : '选择调出/调入仓库并添加调拨产品'}</p>
                       </div>
                       <button type="button" onClick={() => { setTransferModalOpen(false); setEditingTransferDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="flex-1 overflow-auto p-4 space-y-4">
                       {/* 单据信息 */}
                       <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">单据信息</h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">调出仓库</label>
                             <select value={transferForm.fromWarehouseId} onChange={e => setTransferForm(f => ({ ...f, fromWarehouseId: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                               <option value="">请选择</option>
                               {warehouses.map(w => (
                                 <option key={w.id} value={w.id}>{w.name}</option>
                               ))}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">调入仓库</label>
                             <select value={transferForm.toWarehouseId} onChange={e => setTransferForm(f => ({ ...f, toWarehouseId: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                               <option value="">请选择</option>
                               {warehouses.map(w => (
                                 <option key={w.id} value={w.id}>{w.name}</option>
                               ))}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">调拨日期</label>
                             <input type="date" value={transferForm.transferDate} onChange={e => setTransferForm(f => ({ ...f, transferDate: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                           <div className="sm:col-span-2 lg:col-span-1">
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">备注</label>
                             <input type="text" value={transferForm.note} onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))} placeholder="选填" className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                         </div>
                       </div>
                       {/* 调拨明细 */}
                       <div>
                         <div className="flex items-center justify-between mb-3">
                           <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> 调拨明细</h4>
                           <button type="button" onClick={addTransferItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                             <Plus className="w-4 h-4" /> 添加明细行
                           </button>
                         </div>
                         <div className="space-y-3">
                           {transferItems.map((line) => {
                             const trProd = productMapPSI.get(line.productId);
                             const trHasVariants = trProd?.variants && trProd.variants.length > 0;
                             const trLineQty = trHasVariants
                               ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                               : (line.quantity ?? 0);
                             const trGroupedByColor: Record<string, ProductVariant[]> = {};
                             if (trProd?.variants) {
                               trProd.variants.forEach(v => {
                                 if (!trGroupedByColor[v.colorId]) trGroupedByColor[v.colorId] = [];
                                 trGroupedByColor[v.colorId].push(v);
                               });
                             }
                             const isLineEmpty = !line.productId;
                             return (
                               <div key={line.id} className={`rounded-2xl border space-y-4 transition-all ${isLineEmpty ? 'bg-white border-slate-200 p-4 border-dashed' : 'bg-white border-slate-200 p-4 shadow-sm'}`}>
                                 <div className="flex flex-wrap items-end gap-3">
                                   <div className="flex-1 min-w-[200px] max-w-md space-y-1">
                                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{isLineEmpty ? '选择产品' : '产品'}</label>
                                     <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                                       const p = productMapPSI.get(id);
                                       const hv = p?.variants && p.variants.length > 0;
                                       updateTransferItem(line.id, { productId: id, quantity: hv ? undefined : 0, variantQuantities: hv ? {} : undefined });
                                     }} />
                                   </div>
                                   {trHasVariants && (
                                     <div className="w-24 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">总数</label>
                                       <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-indigo-50 rounded-xl border border-indigo-100">
                                         {formatQtyDisplay(trLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                                       </div>
                                     </div>
                                   )}
                                   {!trHasVariants && (
                                     <div className="w-28 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">数量</label>
                                       <div className="flex items-center gap-1.5">
                                         <input type="number" min={0} value={line.quantity ?? ''} onChange={e => updateTransferItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                         <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                                       </div>
                                     </div>
                                   )}
                                   <button type="button" onClick={() => removeTransferItem(line.id)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shrink-0" title="删除该行"><Trash2 className="w-5 h-5" /></button>
                                 </div>
                                 {trHasVariants && line.productId && (
                                   <div className="pt-3 border-t border-slate-100 space-y-3">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">颜色尺码数量</label>
                                     {sortedVariantColorEntries(trGroupedByColor, trProd?.colorIds, trProd?.sizeIds).map(([colorId, colorVariants]) => {
                                       const color = dictionaries.colors.find(c => c.id === colorId);
                                       return (
                                         <div key={colorId} className="flex flex-wrap items-center gap-4 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                                           <div className="flex items-center gap-2 w-28 shrink-0">
                                             <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                             <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                           </div>
                                           <div className="flex flex-wrap gap-3">
                                             {colorVariants.map(v => {
                                               const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                               return (
                                                 <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                                   <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                                   <input type="number" min={0} placeholder="0" value={line.variantQuantities?.[v.id] ?? ''} onChange={e => updateTransferVariantQty(line.id, v.id, parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
                                                 </div>
                                               );
                                             })}
                                           </div>
                                           <div className="ml-auto text-right shrink-0">
                                             <span className="text-[9px] font-bold text-slate-400">小计</span>
                                             <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                                           </div>
                                         </div>
                                       );
                                     })}
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                           {transferItems.length === 0 && (
                             <div className="py-14 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/50">
                               <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                               <p className="text-slate-500 text-sm font-medium">暂无明细，点击「添加明细行」添加调拨产品</p>
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                     {/* 底部汇总 + 保存（固定） */}
                     <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
                       <div className="text-sm text-slate-600">
                         {transferItems.length > 0 && (() => {
                           const totalQty = transferItems.reduce((sum, i) => sum + (i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0)), 0);
                           const validLines = transferItems.filter(i => i.productId && ((i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0)) > 0)).length;
                           return <span>共 <strong className="text-indigo-600">{validLines}</strong> 种产品，合计 <strong className="text-indigo-600">{totalQty}</strong> 件</span>;
                         })()}
                       </div>
                       <button
                         type="button"
                         onClick={handleSaveTransfer}
                         disabled={
                           !transferForm.fromWarehouseId ||
                           !transferForm.toWarehouseId ||
                           transferForm.fromWarehouseId === transferForm.toWarehouseId ||
                           transferItems.length === 0 ||
                           !transferItems.some(i => {
                             if (!i.productId) return false;
                             const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                             return q > 0;
                           })
                         }
                         className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md"
                       >
                         <Save className="w-4 h-4" /> 保存调拨单
                       </button>
                     </div>
                   </div>
                 </div>
               )}

               {/* 盘点单表单弹窗（新建/编辑）：多产品，支持有/无颜色尺码 */}
               {stocktakeModalOpen && (
                 <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStocktakeModalOpen(false); setEditingStocktakeDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div>
                         <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><ClipboardList className="w-5 h-5 text-indigo-600" /> {editingStocktakeDocNumber ? '编辑盘点单' : '盘点单'}</h3>
                         <p className="text-xs text-slate-500 mt-0.5">{editingStocktakeDocNumber ? `单号：${editingStocktakeDocNumber}` : '选择盘点仓库并录入实盘数量'}</p>
                       </div>
                       <button type="button" onClick={() => { setStocktakeModalOpen(false); setEditingStocktakeDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="flex-1 overflow-auto p-4 space-y-4">
                       <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">单据信息</h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">盘点仓库</label>
                             <select value={stocktakeForm.warehouseId} onChange={e => setStocktakeForm(f => ({ ...f, warehouseId: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                               <option value="">请选择</option>
                               {warehouses.map(w => (
                                 <option key={w.id} value={w.id}>{w.name}</option>
                               ))}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">盘点日期</label>
                             <input type="date" value={stocktakeForm.stocktakeDate} onChange={e => setStocktakeForm(f => ({ ...f, stocktakeDate: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                           <div className="sm:col-span-2 lg:col-span-1">
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">备注</label>
                             <input type="text" value={stocktakeForm.note} onChange={e => setStocktakeForm(f => ({ ...f, note: e.target.value }))} placeholder="选填" className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                         </div>
                       </div>
                       <div>
                         <div className="flex items-center justify-between mb-3">
                           <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> 盘点明细（可多产品）</h4>
                           <button type="button" onClick={addStocktakeItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                             <Plus className="w-4 h-4" /> 添加明细行
                           </button>
                         </div>
                         <p className="text-xs text-slate-500 mb-3">每行会显示当前「系统数量」供参考，录入实盘数量保存后将按差异调整库存。</p>
                         <div className="space-y-3">
                           {stocktakeItems.map((line) => {
                             const stProd = productMapPSI.get(line.productId);
                             const stHasVariants = stProd?.variants && stProd.variants.length > 0;
                             const stLineQty = stHasVariants
                               ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                               : (line.quantity ?? 0);
                             const stGroupedByColor: Record<string, ProductVariant[]> = {};
                             if (stProd?.variants) {
                               stProd.variants.forEach(v => {
                                 if (!stGroupedByColor[v.colorId]) stGroupedByColor[v.colorId] = [];
                                 stGroupedByColor[v.colorId].push(v);
                               });
                             }
                             const isLineEmpty = !line.productId;
                             // 本页为「当前系统数量」：与仓库管理一致，已盘过的显示盘后数（getVariantDisplayQty）
                             const systemQtyForLine = line.productId && stocktakeForm.warehouseId
                               ? (stHasVariants && stProd?.variants
                                   ? stProd.variants.reduce((s, v) => s + getVariantDisplayQty(line.productId!, stocktakeForm.warehouseId!, v.id), 0)
                                   : getStock(line.productId, stocktakeForm.warehouseId, editingStocktakeDocNumber ?? undefined))
                               : null;
                             return (
                               <div key={line.id} className={`rounded-2xl border space-y-4 transition-all ${isLineEmpty ? 'bg-white border-slate-200 p-4 border-dashed' : 'bg-white border-slate-200 p-4 shadow-sm'}`}>
                                 <div className="flex flex-wrap items-end gap-3">
                                   <div className="flex-1 min-w-[200px] max-w-md space-y-1">
                                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{isLineEmpty ? '选择产品' : '产品'}</label>
                                     <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                                       const p = productMapPSI.get(id);
                                       const hv = p?.variants && p.variants.length > 0;
                                       updateStocktakeItem(line.id, { productId: id, quantity: hv ? undefined : 0, variantQuantities: hv ? {} : undefined });
                                     }} />
                                   </div>
                                   {line.productId && stocktakeForm.warehouseId && (
                                     <div className="w-28 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">系统数量</label>
                                       <div className="py-2.5 px-3 text-sm font-bold text-slate-600 bg-slate-50 rounded-xl border border-slate-200">
                                         {systemQtyForLine != null ? systemQtyForLine : '—'} {getUnitName(line.productId)}
                                       </div>
                                     </div>
                                   )}
                                   {stHasVariants && (
                                     <div className="w-24 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">总数</label>
                                       <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-indigo-50 rounded-xl border border-indigo-100">
                                         {formatQtyDisplay(stLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                                       </div>
                                     </div>
                                   )}
                                   {!stHasVariants && (
                                     <div className="w-28 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">实盘数量</label>
                                       <div className="flex items-center gap-1.5">
                                         <input type="number" min={0} value={line.quantity ?? ''} onChange={e => updateStocktakeItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                         <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                                       </div>
                                     </div>
                                   )}
                                   <button type="button" onClick={() => removeStocktakeItem(line.id)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shrink-0" title="删除该行"><Trash2 className="w-5 h-5" /></button>
                                 </div>
                                 {stHasVariants && line.productId && (
                                   <div className="pt-3 border-t border-slate-100 space-y-3">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">颜色尺码（{stocktakeForm.warehouseId ? '系统数量供参考，请录入实盘数量' : '请先选择盘点仓库后可显示系统数量' }）</label>
                                     {sortedVariantColorEntries(stGroupedByColor, stProd?.colorIds, stProd?.sizeIds).map(([colorId, colorVariants]) => {
                                       const color = dictionaries.colors.find(c => c.id === colorId);
                                       return (
                                         <div key={colorId} className="flex flex-wrap items-center gap-4 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                                           <div className="flex items-center gap-2 w-28 shrink-0">
                                             <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                             <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                           </div>
                                           <div className="flex flex-wrap gap-3">
                                             {colorVariants.map(v => {
                                               const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                               const sysQtyV = stocktakeForm.warehouseId ? getVariantDisplayQty(line.productId, stocktakeForm.warehouseId, v.id) : null;
                                               return (
                                                 <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                                   <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                                   {sysQtyV != null && <span className="text-[9px] text-slate-500">系统 {sysQtyV}</span>}
                                                   <input type="number" min={0} placeholder="0" value={line.variantQuantities?.[v.id] ?? ''} onChange={e => updateStocktakeVariantQty(line.id, v.id, parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
                                                 </div>
                                               );
                                             })}
                                           </div>
                                           <div className="ml-auto text-right shrink-0">
                                             <span className="text-[9px] font-bold text-slate-400">小计</span>
                                             <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                                           </div>
                                         </div>
                                       );
                                     })}
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                           {stocktakeItems.length === 0 && (
                             <div className="py-14 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/50">
                               <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                               <p className="text-slate-500 text-sm font-medium">暂无明细，点击「添加明细行」录入盘点数量</p>
                             </div>
                           )}
                         </div>
                         <div className="mt-6 flex justify-end">
                           <button
                             type="button"
                             onClick={handleSaveStocktake}
                             disabled={
                               !stocktakeForm.warehouseId ||
                               stocktakeItems.length === 0 ||
                               !stocktakeItems.some(i => {
                                 if (!i.productId) return false;
                                 const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                                 return q >= 0;
                               })
                             }
                             className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md"
                           >
                             <Save className="w-4 h-4" /> 保存盘点单
                           </button>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               )}

               {/* 仓库流水弹窗 */}
               {warehouseFlowModalOpen && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setWarehouseFlowModalOpen(false); setWarehouseFlowDetailKey(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 仓库流水</h3>
                       <button type="button" onClick={() => { setWarehouseFlowModalOpen(false); setWarehouseFlowDetailKey(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                       <div className="flex items-center gap-2 mb-3">
                         <Filter className="w-4 h-4 text-slate-500" />
                         <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                           <input type="date" value={whFlowDateFrom} onChange={e => setWhFlowDateFrom(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                           <input type="date" value={whFlowDateTo} onChange={e => setWhFlowDateTo(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                          <select value={whFlowType} onChange={e => setWhFlowType(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                            <option value="all">全部</option>
                            {WAREHOUSE_FLOW_TYPES.map(t => (
                              <option key={t} value={t}>{warehouseFlowTypeLabel[t]}</option>
                            ))}
                            <option value="SALES_RETURN">销售退货</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
                          <select value={whFlowWarehouse} onChange={e => setWhFlowWarehouse(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                            <option value="all">全部</option>
                            {warehouses.map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
                           <input type="text" value={whFlowDocNo} onChange={e => setWhFlowDocNo(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                           <input type="text" value={whFlowProduct} onChange={e => setWhFlowProduct(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                       </div>
                       <div className="mt-2 flex items-center gap-4">
                         <button type="button" onClick={() => { setWhFlowDateFrom(''); setWhFlowDateTo(''); setWhFlowType('all'); setWhFlowWarehouse('all'); setWhFlowDocNo(''); setWhFlowProduct(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                         <span className="text-xs text-slate-400">共 {filteredWarehouseFlowRows.length} 条</span>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {filteredWarehouseFlowRows.length === 0 ? (
                         <p className="text-slate-500 text-center py-12">暂无仓库流水记录</p>
                       ) : (
                         <div className="border border-slate-200 rounded-2xl overflow-hidden">
                           <TableVirtuoso
                             style={{ height: Math.min(filteredWarehouseFlowRows.length * 48 + 48, 520) }}
                             data={filteredWarehouseFlowRows}
                             fixedHeaderContent={() => (
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期时间</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                              </tr>
                             )}
                             itemContent={(_idx, row) => (
                               <>
                                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.displayDateTime ?? row.dateStr}</td>
                                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">{row.typeLabel}</span></td>
                                  <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNumber}</td>
                                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName}</td>
                                  <td className="px-4 py-3 font-bold text-slate-800">{row.productName} <span className="text-slate-400 font-normal text-[10px]">{row.productSku}</span></td>
                                  <td className="px-4 py-3 text-right font-black text-indigo-600">{row.quantity}</td>
                                  <td className="px-4 py-3">
                                     <button type="button" onClick={() => setWarehouseFlowDetailKey(`${row.type}|${row.docNumber}`)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                       <FileText className="w-3.5 h-3.5" /> 详情
                                     </button>
                                   </td>
                               </>
                             )}
                             components={{ Table: (props) => <table {...props} className="w-full text-left text-sm" />, TableRow: ({ item: _item, ...props }) => <tr {...props} className="border-b border-slate-100 hover:bg-slate-50/50" /> }}
                           />
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {/* 仓库管理 - 产品流水详情弹窗（当前产品+可选仓库的流水） */}
               {productFlowDetail && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setProductFlowDetail(null); setWarehouseFlowDetailKey(null); setProductFlowDateFrom(''); setProductFlowDateTo(''); setProductFlowType('all'); setProductFlowWarehouseId('all'); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2">
                         <ScrollText className="w-5 h-5 text-indigo-600" />
                         仓库流水
                         {productFlowDetail.warehouseName ? ` - ${productFlowDetail.warehouseName} / ${productFlowDetail.productName}` : ` - ${productFlowDetail.productName}`}
                       </h3>
                       <button type="button" onClick={() => { setProductFlowDetail(null); setWarehouseFlowDetailKey(null); setProductFlowDateFrom(''); setProductFlowDateTo(''); setProductFlowType('all'); setProductFlowWarehouseId('all'); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                       <div className="flex items-center gap-2 mb-3">
                         <Filter className="w-4 h-4 text-slate-500" />
                         <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">开始时间</label>
                           <input
                             type="date"
                             value={productFlowDateFrom}
                             onChange={e => setProductFlowDateFrom(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                           />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">结束时间</label>
                           <input
                             type="date"
                             value={productFlowDateTo}
                             onChange={e => setProductFlowDateTo(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                           />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                           <select
                             value={productFlowType}
                             onChange={e => setProductFlowType(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                           >
                             <option value="all">全部</option>
                             <option value="PURCHASE_BILL">采购入库</option>
                             <option value="SALES_BILL">销售出库</option>
                             <option value="SALES_RETURN">销售退货</option>
                             <option value="TRANSFER">调拨</option>
                             <option value="STOCKTAKE">盘点</option>
                             <option value="STOCK_IN">生产入库</option>
                             <option value="STOCK_RETURN">生产退料</option>
                             <option value="STOCK_OUT">领料发出</option>
                           </select>
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
                           <select
                             value={productFlowWarehouseId}
                             onChange={e => setProductFlowWarehouseId(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                           >
                             <option value="all">全部</option>
                             {warehouses.map(w => (
                               <option key={w.id} value={w.id}>{w.name}</option>
                             ))}
                           </select>
                         </div>
                       </div>
                       <div className="mt-2 flex items-center gap-4 flex-wrap">
                         <button
                           type="button"
                           onClick={() => { setProductFlowDateFrom(''); setProductFlowDateTo(''); setProductFlowType('all'); setProductFlowWarehouseId('all'); }}
                           className="text-xs font-bold text-slate-500 hover:text-slate-700"
                         >
                           清空筛选
                         </button>
                         <span className="text-xs text-slate-400">共 {productFlowFilteredRows.length} 条</span>
                         <span className="text-xs font-bold text-indigo-600">合计数量：{Math.round(productFlowTotalQuantity * 100) / 100}</span>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {productFlowDetailRows.length === 0 ? (
                         <p className="text-slate-500 text-center py-12">暂无该产品{productFlowDetail.warehouseName ? '在该仓库' : ''}的流水记录</p>
                       ) : productFlowFilteredRows.length === 0 ? (
                         <p className="text-slate-500 text-center py-12">无符合筛选条件的记录</p>
                       ) : (
                         <div className="border border-slate-200 rounded-2xl overflow-hidden">
                           <table className="w-full text-left text-sm">
                             <thead>
                               <tr className="bg-slate-50 border-b border-slate-200">
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期时间</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                               </tr>
                             </thead>
                             <tbody>
                               {productFlowFilteredRows.map((row: any) => (
                                 <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                   <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.displayDateTime ?? row.dateStr}</td>
                                   <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">{row.typeLabel}</span></td>
                                   <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNumber}</td>
                                   <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName}</td>
                                   <td className="px-4 py-3 font-bold text-slate-800">{row.productName} <span className="text-slate-400 font-normal text-[10px]">{row.productSku}</span></td>
                                   <td className="px-4 py-3 text-right font-black text-indigo-600">{row.quantity}</td>
                                   <td className="px-4 py-3">
                                     <button type="button" onClick={() => setWarehouseFlowDetailKey(`${row.type}|${row.docNumber}`)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                       <FileText className="w-3.5 h-3.5" /> 详情
                                     </button>
                                   </td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {/* 仓库流水 - 单据详情弹窗（主流水弹窗或产品流水详情弹窗内点击详情时显示） */}
               {(warehouseFlowModalOpen || productFlowDetail) && warehouseFlowDetailKey && (() => {
                 const [detailType, detailDocNo] = warehouseFlowDetailKey.split('|');
                 const isStockIn = detailType === 'STOCK_IN';
                 const isStockReturn = detailType === 'STOCK_RETURN';
                 const isStockOut = detailType === 'STOCK_OUT';
                 const docRecords = isStockIn
                   ? (prodRecords || []).filter((r: any) => {
                       if (r.type !== 'STOCK_IN') return false;
                       if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
                       if (detailDocNo.startsWith('工单入库-')) {
                         const wantOrderNum = detailDocNo.replace('工单入库-', '');
                         const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
                         return order?.orderNumber === wantOrderNum;
                       }
                       return false;
                     }) as any[]
                   : isStockReturn
                   ? (prodRecords || []).filter((r: any) => {
                       if (r.type !== 'STOCK_RETURN') return false;
                       if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
                       if (detailDocNo.startsWith('退料-')) {
                         const wantOrderNum = detailDocNo.replace('退料-', '');
                         const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
                         return order?.orderNumber === wantOrderNum;
                       }
                       return false;
                     }) as any[]
                   : isStockOut
                   ? (prodRecords || []).filter((r: any) => {
                       if (r.type !== 'STOCK_OUT') return false;
                       if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
                       if (detailDocNo.startsWith('领料-')) {
                         const wantOrderNum = detailDocNo.replace('领料-', '');
                         const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
                         return order?.orderNumber === wantOrderNum;
                       }
                       return false;
                     }) as any[]
                   : recordsList.filter((r: any) => r.type === detailType && (r.docNumber || '') === detailDocNo) as any[];
                 if (docRecords.length === 0) return null;
                 const first = docRecords[0];
                 const mainInfo = isStockIn
                   ? { docNumber: first.docNo || (ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ? `工单入库-${ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ?? '—' }
                   : isStockReturn
                   ? { docNumber: first.docNo || (ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ? `退料-${ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ?? '—' }
                   : isStockOut
                   ? { docNumber: first.docNo || (ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ? `领料-${ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ?? '—' }
                   : { docNumber: first.docNumber || detailDocNo, createdAt: first.createdAt || first.timestamp || '—', partner: first.partner ?? '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.note ?? '—', fromWarehouseId: first.fromWarehouseId, toWarehouseId: first.toWarehouseId, orderNumber: '—' };
                 const detailLinesByProductVariant = new Map<string, { productId: string; variantId?: string; quantity: number; purchasePrice?: number; salesPrice?: number; record: any }>();
                 docRecords.forEach(r => {
                   const vId = r.variantId ?? '';
                   const key = `${r.productId}|${vId}`;
                   const existing = detailLinesByProductVariant.get(key);
                   const qty = r.quantity ?? 0;
                   const price = r.purchasePrice ?? r.salesPrice;
                   if (!existing) {
                     detailLinesByProductVariant.set(key, { productId: r.productId, variantId: vId || undefined, quantity: qty, purchasePrice: price, salesPrice: r.salesPrice, record: r });
                   } else {
                     existing.quantity += qty;
                   }
                 });
                 const detailLines = Array.from(detailLinesByProductVariant.values()).map(item => {
                   const product = productMapPSI.get(item.productId);
                   const category = categoryMapPSI.get(product?.categoryId);
                   const hasColorSize = category?.hasColorSize && (product?.variants?.length ?? 0) > 0;
                   let variantLabel = '';
                   if (item.variantId && product?.variants) {
                     const v = product.variants.find((vv: ProductVariant) => vv.id === item.variantId);
                     if (v) {
                       const colorName = (dictionaries.colors ?? []).find(c => c.id === v.colorId)?.name ?? '';
                       const sizeName = (dictionaries.sizes ?? []).find(s => s.id === v.sizeId)?.name ?? '';
                       variantLabel = [colorName, sizeName].filter(Boolean).join(' / ') || v.skuSuffix || item.variantId;
                     }
                   }
                   return {
                     ...item,
                     productName: product?.name ?? '—',
                     productSku: product?.sku ?? '—',
                     unitName: item.productId ? getUnitName(item.productId) : 'PCS',
                     hasColorSize: !!variantLabel,
                     variantLabel
                   };
                 });
                 return (
                   <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                     <div className="absolute inset-0 bg-slate-900/60" onClick={() => setWarehouseFlowDetailKey(null)} aria-hidden />
                     <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                       <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                         <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 单据详情 · {mainInfo.docNumber}</h3>
                         <button type="button" onClick={() => setWarehouseFlowDetailKey(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                       </div>
                       <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                           <div>
                             <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">单号</label>
                             <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{mainInfo.docNumber}</div>
                           </div>
                           <div>
                             <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">日期时间</label>
                             <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{formatFlowDateTime(mainInfo.createdAt)}</div>
                           </div>
                           <div>
                             <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">{detailType === 'SALES_BILL' ? '客户' : detailType === 'PURCHASE_BILL' ? '供应商' : detailType === 'TRANSFER' ? '调拨' : detailType === 'STOCKTAKE' ? '仓库' : detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT' ? '工单号' : '备注'}</label>
                             <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">
                               {detailType === 'TRANSFER' ? `${warehouseMapPSI.get(mainInfo.fromWarehouseId)?.name ?? '—'} → ${warehouseMapPSI.get(mainInfo.toWarehouseId)?.name ?? '—'}` : detailType === 'STOCKTAKE' ? mainInfo.warehouseName : detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT' ? (mainInfo as any).orderNumber : mainInfo.partner}
                             </div>
                           </div>
                           {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL' || detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT') && (
                             <div>
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">仓库</label>
                               <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{mainInfo.warehouseName}</div>
                             </div>
                           )}
                           {mainInfo.note && (
                             <div className="md:col-span-2">
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注</label>
                               <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white truncate" title={mainInfo.note}>{mainInfo.note}</div>
                             </div>
                           )}
                         </div>
                       </div>
                       <div className="flex-1 overflow-auto min-h-0 p-4">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">明细</h4>
                         <div className="border border-slate-200 rounded-xl overflow-hidden">
                           <table className="w-full text-left text-sm">
                             <thead>
                               <tr className="bg-slate-50 border-b border-slate-200">
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品 / SKU</th>
                                 {detailLines.some((l: any) => l.variantLabel) && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格（颜色/尺码）</th>}
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                 {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">单价</th>}
                                 {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>}
                               </tr>
                             </thead>
                             <tbody>
                               {detailLines.map((line, idx) => {
                                 const price = line.purchasePrice ?? line.salesPrice ?? 0;
                                 return (
                                   <tr key={`${line.productId}-${line.variantId ?? ''}-${idx}`} className="border-b border-slate-100">
                                     <td className="px-4 py-3"><span className="font-bold text-slate-800">{line.productName}</span> <span className="text-slate-400 text-[10px]">{line.productSku}</span></td>
                                     {detailLines.some((l: any) => l.variantLabel) && (
                                       <td className="px-4 py-3 text-slate-600">{line.variantLabel || '—'}</td>
                                     )}
                                     <td className="px-4 py-3 text-right font-bold text-indigo-600">{(line.quantity ?? 0)} {line.unitName}</td>
                                     {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && (
                                       <>
                                         <td className="px-4 py-3 text-right">¥{price.toFixed(2)}</td>
                                         <td className="px-4 py-3 text-right">¥{((line.quantity ?? 0) * price).toFixed(2)}</td>
                                       </>
                                     )}
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
           </>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedGroupedEntries.length === 0 ? (
            <div className="bg-white rounded-[32px] border-2 border-dashed border-slate-200 py-24 text-center">
              <FileText className="w-16 h-16 text-slate-100 mx-auto mb-4" />
              <p className="text-slate-400 font-medium italic">暂无{current.label}流水记录</p>
            </div>
          ) : (
            sortedGroupedEntries.map(([docNum, docItems]) => {
              const mainInfo = docItems[0];
              const totalQty = docItems.reduce((s, i) => s + (i.quantity ?? 0), 0);
              const totalAmount = (type === 'SALES_ORDER' || type === 'SALES_BILL')
                ? docItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.salesPrice ?? 0), 0)
                : docItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.purchasePrice ?? 0), 0);
              const isConverted = type === 'PURCHASE_ORDER' && docItems.every((item: any) => (item.quantity ?? 0) <= (receivedByOrderLine[`${docNum}::${item.id}`] ?? 0));
              // 打开销售订单详情用于编辑
              const openSalesOrderDetail = () => {
                if (type !== 'SALES_ORDER') return;
                setEditingSODocNumber(docNum);
                setForm((prev: any) => ({
                  ...prev,
                  partner: mainInfo.partner || '',
                  partnerId: mainInfo.partnerId || '',
                  docNumber: mainInfo.docNumber || docNum,
                  dueDate: mainInfo.dueDate || prev.dueDate,
                  createdAt: mainInfo.createdAt || new Date().toISOString().split('T')[0],
                  note: mainInfo.note || '',
                  customData: mainInfo.customData ? { ...mainInfo.customData } : {}
                }));
                const groups: Record<string, any[]> = {};
                (docItems as any[]).forEach((item: any) => {
                  const gid = item.lineGroupId ?? item.id;
                  if (!groups[gid]) groups[gid] = [];
                  groups[gid].push(item);
                });
                setSalesOrderItems(Object.entries(groups).map(([gid, grp]) => {
                  const first = grp[0];
                  const prod = products.find((p: Product) => p.id === first.productId);
                  const price = (prod?.salesPrice != null && prod.salesPrice > 0) ? prod.salesPrice : (first.salesPrice ?? 0);
                  const variantQuantities: Record<string, number> = {};
                  let quantity = 0;
                  grp.forEach((item: any) => {
                    if (item.variantId) {
                      variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
                    } else {
                      quantity += item.quantity ?? 0;
                    }
                  });
                  const hasVariants = Object.keys(variantQuantities).length > 0;
                  return hasVariants
                    ? { id: gid, productId: first.productId, salesPrice: price, variantQuantities, sourceRecordIds: grp.map((r: any) => r.id) }
                    : { id: gid, productId: first.productId, quantity, salesPrice: price, sourceRecordIds: grp.map((r: any) => r.id) };
                }));
                setShowModal('SALES_ORDER');
              };
              // 打开销售单详情用于编辑
              const openSalesBillDetail = () => {
                if (type !== 'SALES_BILL') return;
                setEditingSBDocNumber(docNum);
                setForm((prev: any) => ({
                  ...prev,
                  partner: mainInfo.partner || '',
                  partnerId: mainInfo.partnerId || '',
                  docNumber: mainInfo.docNumber || docNum,
                  warehouseId: mainInfo.warehouseId || prev.warehouseId,
                  createdAt: mainInfo.createdAt || new Date().toISOString().split('T')[0],
                  note: mainInfo.note || '',
                  customData: mainInfo.customData ? { ...mainInfo.customData } : {}
                }));
                const groups: Record<string, any[]> = {};
                (docItems as any[]).forEach((item: any) => {
                  const gid = item.lineGroupId ?? item.id;
                  if (!groups[gid]) groups[gid] = [];
                  groups[gid].push(item);
                });
                setSalesBillItems(Object.entries(groups).map(([gid, grp]) => {
                  const first = grp[0];
                  const prod = products.find((p: Product) => p.id === first.productId);
                  const price = (prod?.salesPrice != null && prod.salesPrice > 0) ? prod.salesPrice : (first.salesPrice ?? 0);
                  const variantQuantities: Record<string, number> = {};
                  let quantity = 0;
                  grp.forEach((item: any) => {
                    if (item.variantId) {
                      variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
                    } else {
                      quantity += item.quantity ?? 0;
                    }
                  });
                  const hasVariants = Object.keys(variantQuantities).length > 0;
                  return hasVariants
                    ? { id: gid, productId: first.productId, salesPrice: price, variantQuantities, sourceRecordIds: grp.map((r: any) => r.id) }
                    : { id: gid, productId: first.productId, quantity, salesPrice: price, sourceRecordIds: grp.map((r: any) => r.id) };
                }));
                setShowModal('SALES_BILL');
              };
              // 打开采购订单详情用于编辑
              const openPurchaseOrderDetail = () => {
                if (type !== 'PURCHASE_ORDER') return;
                setEditingPODocNumber(docNum);
                setForm((prev: any) => ({
                  ...prev,
                  partner: mainInfo.partner || '',
                  partnerId: mainInfo.partnerId || '',
                  docNumber: mainInfo.docNumber || docNum,
                  dueDate: mainInfo.dueDate || prev.dueDate,
                  createdAt: mainInfo.createdAt || new Date().toISOString().split('T')[0],
                  note: mainInfo.note || '',
                  customData: mainInfo.customData ? { ...mainInfo.customData } : {}
                }));
                // 按 lineGroupId 分组，每组对应表单一行（同一添加批次合并）
                const groups: Record<string, any[]> = {};
                (docItems as any[]).forEach((item: any) => {
                  const gid = item.lineGroupId ?? item.id;
                  if (!groups[gid]) groups[gid] = [];
                  groups[gid].push(item);
                });
                setPurchaseOrderItems(Object.entries(groups).map(([gid, grp]) => {
                  const first = grp[0];
                  const prod = products.find((p: Product) => p.id === first.productId);
                  const price = (prod?.purchasePrice != null && prod.purchasePrice > 0) ? prod.purchasePrice : (first.purchasePrice ?? 0);
                  const variantQuantities: Record<string, number> = {};
                  let quantity = 0;
                  grp.forEach((item: any) => {
                    if (item.variantId) {
                      variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
                    } else {
                      quantity += item.quantity ?? 0;
                    }
                  });
                  const hasVariants = Object.keys(variantQuantities).length > 0;
                  return hasVariants
                    ? { id: gid, productId: first.productId, purchasePrice: price, variantQuantities, sourceRecordIds: grp.map((r: any) => r.id) }
                    : { id: gid, productId: first.productId, quantity, purchasePrice: price, sourceRecordIds: grp.map((r: any) => r.id) };
                }));
                setShowModal('PURCHASE_ORDER');
              };

              // 打开采购单详情用于编辑（与采购订单一致：全页表单）
              const openPurchaseBillDetail = () => {
                if (type !== 'PURCHASE_BILL') return;
                setEditingPBDocNumber(docNum);
                setForm((prev: any) => ({
                  ...prev,
                  partner: mainInfo.partner || '',
                  partnerId: mainInfo.partnerId || '',
                  docNumber: mainInfo.docNumber || docNum,
                  warehouseId: mainInfo.warehouseId || prev.warehouseId,
                  createdAt: mainInfo.createdAt || new Date().toISOString().split('T')[0],
                  note: mainInfo.note || '',
                  customData: mainInfo.customData ? { ...mainInfo.customData } : {}
                }));
                const groups: Record<string, any[]> = {};
                (docItems as any[]).forEach((item: any) => {
                  const gid = item.lineGroupId ?? item.id;
                  if (!groups[gid]) groups[gid] = [];
                  groups[gid].push(item);
                });
                setPurchaseBillItems(Object.entries(groups).map(([gid, grp]) => {
                  const first = grp[0];
                  const prod = products.find((p: Product) => p.id === first.productId);
                  const price = (prod?.purchasePrice != null && prod.purchasePrice > 0) ? prod.purchasePrice : (first.purchasePrice ?? 0);
                  const variantQuantities: Record<string, number> = {};
                  let quantity = 0;
                  grp.forEach((item: any) => {
                    if (item.variantId) {
                      variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
                    } else {
                      quantity += item.quantity ?? 0;
                    }
                  });
                  const hasVariants = Object.keys(variantQuantities).length > 0;
                  const batch = (grp[0] as any).batch;
                  return hasVariants
                    ? { id: gid, productId: first.productId, purchasePrice: price, variantQuantities, ...(batch && { batch }) }
                    : { id: gid, productId: first.productId, quantity, purchasePrice: price, ...(batch && { batch }) };
                }));
                setCreationMethod('MANUAL');
                setShowModal('PURCHASE_BILL');
              };

              return (
                <div key={docNum} className="bg-white border border-slate-200 rounded-[32px] shadow-sm hover:shadow-lg transition-all overflow-hidden group">
                  <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:border-indigo-100 transition-all ${isConverted ? 'text-emerald-500' : 'text-slate-400 group-hover:text-indigo-600'}`}>
                        {isConverted ? <CheckCircle2 className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-black text-slate-800">{mainInfo.partner || '未指定单位'}</h3>
                          <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${isConverted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                             {docNum.startsWith('UNGROUPED-') ? '独立单据' : docNum}
                          </span>
                          {type === 'SALES_BILL' && totalQty < 0 && <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shadow-sm">销售退货</span>}
                          {isConverted && <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter bg-white px-2 py-0.5 rounded-full border border-emerald-50 shadow-sm">已入库完成</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-400 uppercase flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {mainInfo.timestamp}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> 经办: {mainInfo.operator}</span>
                          {type === 'PURCHASE_ORDER' && safePurchaseOrderFormSettings.standardFields.find(f => f.id === 'note')?.showInList && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'PURCHASE_ORDER' && safePurchaseOrderFormSettings.customFields.filter(f => f.showInList).map(cf => (mainInfo.customData?.[cf.id] != null && mainInfo.customData?.[cf.id] !== '') && (
                            <span key={cf.id} className="flex items-center gap-1 text-slate-500">{cf.label}: {String(mainInfo.customData[cf.id])}</span>
                          ))}
                          {type === 'PURCHASE_BILL' && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'PURCHASE_BILL' && safePurchaseBillFormSettings.customFields.filter(f => f.showInList).map(cf => (mainInfo.customData?.[cf.id] != null && mainInfo.customData?.[cf.id] !== '') && (
                            <span key={cf.id} className="flex items-center gap-1 text-slate-500">{cf.label}: {String(mainInfo.customData[cf.id])}</span>
                          ))}
                          {type === 'SALES_ORDER' && mainInfo.dueDate && (
                            <span className="flex items-center gap-1 text-rose-500 font-bold">交期: {mainInfo.dueDate}</span>
                          )}
                          {type === 'SALES_ORDER' && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'SALES_BILL' && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right mr-2">
                        <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据总量</p>
                        <p className={`text-lg font-black ${type === 'SALES_BILL' && totalQty < 0 ? 'text-amber-600' : 'text-slate-900'}`}>{totalQty.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></p>
                      </div>
                      {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL' || type === 'SALES_ORDER' || type === 'SALES_BILL') && (
                        <div className="text-right mr-2">
                          <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据金额</p>
                          <p className={`text-lg font-black ${type === 'SALES_BILL' && totalAmount < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>¥{totalAmount.toFixed(2)}</p>
                        </div>
                      )}
                      {type === 'PURCHASE_ORDER' && hasPsiPerm('psi:purchase_order:view') && (
                        <button
                          type="button"
                          onClick={openPurchaseOrderDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      {type === 'PURCHASE_BILL' && hasPsiPerm('psi:purchase_bill:view') && (
                        <button
                          type="button"
                          onClick={openPurchaseBillDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      {type === 'SALES_ORDER' && hasPsiPerm('psi:sales_order:view') && (
                        <button
                          type="button"
                          onClick={openSalesOrderDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      {type === 'SALES_BILL' && hasPsiPerm('psi:sales_bill:view') && (
                        <button
                          type="button"
                          onClick={openSalesBillDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>

                  <div className="px-8 py-4 overflow-x-auto">
                    <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: 'auto' }} />
                        {!current.hideWarehouse && <col style={{ width: 100 }} />}
                        {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <col style={{ width: 100 }} />}
                        {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <col style={{ width: 110 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 132 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 82 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 92 }} />}
                        {type === 'SALES_BILL' && <col style={{ width: 82 }} />}
                        {type === 'SALES_BILL' && <col style={{ width: 92 }} />}
                        {type !== 'SALES_ORDER' && <col style={{ width: type === 'SALES_BILL' ? 132 : 100 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 140 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 82 }} />}
                        {type === 'PURCHASE_ORDER' && <col style={{ width: 140 }} />}
                      </colgroup>
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                          <th className="pb-3 pr-6 text-left">产品信息 / SKU</th>
                          {!current.hideWarehouse && <th className="pb-3 px-3 text-center">{type === 'SALES_BILL' ? '出库仓库' : '入库仓库'}</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <th className="pb-3 px-3 text-right">采购价</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <th className="pb-3 px-3 text-right">金额</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-right">数量</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-right">销售价</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-right">金额</th>}
                          {type === 'SALES_BILL' && <th className="pb-3 px-3 text-right">销售价</th>}
                          {type === 'SALES_BILL' && <th className="pb-3 px-3 text-right">金额</th>}
                          {type !== 'SALES_ORDER' && <th className="pb-3 px-3 text-right">数量</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-left">配货进度</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-center">操作</th>}
                          {type === 'PURCHASE_ORDER' && <th className="pb-3 px-3 text-left">入库进度</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(() => {
                          const groups: Record<string, any[]> = {};
                          (docItems as any[]).forEach((item: any) => {
                            const gid = item.lineGroupId ?? item.id;
                            if (!groups[gid]) groups[gid] = [];
                            groups[gid].push(item);
                          });
                          return Object.entries(groups).map(([gid, grp]) => {
                            const first = grp[0];
                            const product = productMapPSI.get(first.productId);
                            const warehouse = warehouseMapPSI.get(first.warehouseId);
                            const orderQty = grp.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
                            const allocatedQty = type === 'SALES_ORDER' ? grp.reduce((s, i) => s + (i.allocatedQuantity ?? 0), 0) : 0;
                            const received = type === 'PURCHASE_ORDER'
                              ? grp.reduce((s, i) => s + (receivedByOrderLine[`${docNum}::${i.id}`] ?? 0), 0)
                              : 0;
                            const progress = orderQty > 0 ? Math.min(1, received / orderQty) : 0;
                            const rowAmount = (type === 'SALES_ORDER' || type === 'SALES_BILL')
                              ? grp.reduce((s, i) => s + (i.quantity ?? 0) * (i.salesPrice ?? 0), 0)
                              : grp.reduce((s, i) => s + (i.quantity ?? 0) * (i.purchasePrice ?? 0), 0);
                            const avgPrice = orderQty > 0 ? rowAmount / orderQty : 0;
                            const variantParts = grp
                              .filter((i: any) => i.variantId && product?.variants)
                              .map((i: any) => {
                                const v = product!.variants!.find((vv: ProductVariant) => vv.id === i.variantId);
                                if (!v) return '';
                                const c = dictionaries.colors.find(cc => cc.id === v.colorId)?.name ?? '';
                                const sz = dictionaries.sizes.find(ss => ss.id === v.sizeId)?.name ?? '';
                                return [c, sz].filter(Boolean).join(' / ');
                              })
                              .filter(Boolean);
                            const variantLabel = variantParts.length > 1
                              ? `多规格 (${variantParts.join(', ')})`
                              : variantParts[0]
                                ? variantParts[0]
                                : '';
                          return (
                              <tr key={gid} className="hover:bg-slate-50/30 transition-colors">
                                <td className="py-4 pr-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300"><Package className="w-4 h-4" /></div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-700">{product?.name || '未知产品'}</p>
                                      <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">
                                        {product?.sku}
                                        {variantLabel && type !== 'SALES_ORDER' && type !== 'SALES_BILL' && ` · ${variantLabel}`}
                                      </p>
                                  </div>
                                </div>
                              </td>
                              {!current.hideWarehouse && (
                                  <td className="py-4 px-3 text-center">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-black uppercase border border-slate-100">
                                    {warehouse?.name || '默认库'}
                                  </span>
                                </td>
                              )}
                                {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                              </td>
                                )}
                                {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">
                                      {orderQty.toLocaleString()} {first.productId ? getUnitName(first.productId) : 'PCS'}
                                    </span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_BILL' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_BILL' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type !== 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className={`text-sm font-black ${type.includes('BILL') ? 'text-indigo-600' : 'text-slate-700'}`}>
                                      {type === 'PURCHASE_ORDER' && received > orderQty
                                        ? `${received.toLocaleString()} / ${orderQty.toLocaleString()}`
                                        : orderQty.toLocaleString()}{' '}
                                      {first.productId ? getUnitName(first.productId) : 'PCS'}
                                    </span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
                                        {allocatedQty > orderQty ? (
                                          <>
                                            <div className="h-full bg-emerald-500" style={{ width: `${orderQty > 0 ? (orderQty / allocatedQty) * 100 : 0}%` }} />
                                            <div className="h-full bg-rose-500" style={{ width: `${orderQty > 0 ? ((allocatedQty - orderQty) / allocatedQty) * 100 : 0}%` }} />
                                          </>
                                        ) : (
                                          <div
                                            className={`h-full rounded-full transition-all ${orderQty > 0 && allocatedQty >= orderQty ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${orderQty > 0 ? Math.min(100, (allocatedQty / orderQty) * 100) : 0}%` }}
                                          />
                                        )}
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-400">
                                        {allocatedQty > orderQty ? `已配 ${allocatedQty} / ${orderQty}（已超配）` : orderQty > 0 && allocatedQty >= orderQty ? '已完成' : `已配 ${allocatedQty} / ${orderQty}`}
                                      </span>
                                    </div>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && hasPsiPerm('psi:sales_order_allocation:allow') && (
                                  <td className="py-4 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAllocationModal({ docNumber: docNum, lineGroupId: gid, product: product!, grp: grp });
                                        setAllocationWarehouseId(grp[0]?.allocationWarehouseId ?? warehouses[0]?.id ?? '');
                                        const hasVariants = grp.some((i: any) => i.variantId);
                                        if (hasVariants) {
                                          const next: Record<string, number> = {};
                                          grp.forEach((i: any) => {
                                            if (i.variantId) {
                                              const order = i.quantity ?? 0;
                                              const allocated = i.allocatedQuantity ?? 0;
                                              next[i.variantId] = Math.max(0, order - allocated);
                                            }
                                          });
                                          setAllocationQuantities(next);
                                        } else {
                                          const order = grp[0]?.quantity ?? 0;
                                          const allocated = grp[0]?.allocatedQuantity ?? 0;
                                          setAllocationQuantities(Math.max(0, order - allocated));
                                        }
                                      }}
                                      className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1 inline-flex whitespace-nowrap"
                                    >
                                      <PackageCheck className="w-3.5 h-3.5 shrink-0" /> 配货
                                    </button>
                                  </td>
                                )}
                                {type === 'PURCHASE_ORDER' && (
                                  <td className="py-4 px-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
                                        {received > orderQty ? (
                                          <>
                                            <div className="h-full bg-emerald-500" style={{ width: `${(orderQty / received) * 100}%` }} />
                                            <div className="h-full bg-rose-500" style={{ width: `${((received - orderQty) / received) * 100}%` }} />
                                          </>
                                        ) : (
                                          <div 
                                            className={`h-full rounded-full transition-all ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${Math.min(100, progress * 100)}%` }}
                                          />
                                        )}
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-400">
                                        {received > orderQty ? `${received} / ${orderQty}（已超收）` : progress >= 1 ? '已完成' : `${received} / ${orderQty}`}
                                      </span>
                                    </div>
                                  </td>
                                )}
                            </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}

        </div>
      )}

      {/* 动态表单弹窗（采购订单、采购单、销售订单均使用全页表单，不弹此窗；仅其他类型用此弹窗） */}
      {showModal && type === showModal && !(type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') && !(type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL') && !(type === 'SALES_ORDER' && showModal === 'SALES_ORDER') && !(type === 'SALES_BILL' && showModal === 'SALES_BILL') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(null)}></div>
          <div className="relative bg-white w-full max-w-3xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800">业务登记：{bizConfig[showModal]?.label}</h2>
              <button onClick={() => setShowModal(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-all"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
               {showModal === 'PURCHASE_BILL' && (
                 <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-sm w-fit mb-4">
                   <button onClick={() => { setCreationMethod('MANUAL'); setPurchaseBillItems([]); }} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                     <Plus className="w-3 h-3" /> 直接手动创建
                   </button>
                   <button onClick={() => { setCreationMethod('FROM_ORDER'); setPurchaseBillItems([]); }} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${creationMethod === 'FROM_ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                     <ClipboardList className="w-3 h-3" /> 引用采购订单生成
                   </button>
                 </div>
               )}

               {showModal === 'PURCHASE_BILL' && creationMethod === 'MANUAL' ? (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据编号 (选填)</label>
                        <div className="relative">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <PartnerSelector partners={partners} categories={partnerCategories} value={form.partner} onChange={(name, id) => setForm({...form, partner: name, partnerId: id || ''})} label="供应商" placeholder="选择供应商..." />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库仓库</label>
                      <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">选择仓库...</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Layers className="w-4 h-4" /> 入库明细</h4>
                        <button onClick={addPurchaseBillItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                          <Plus className="w-4 h-4" /> 添加明细行
                        </button>
                      </div>
                      <div className="space-y-4">
                        {purchaseBillItems.map((line) => {
                          const lineProd = productMapPSI.get(line.productId);
                          const lineCat = lineProd && categoryMapPSI.get(lineProd.categoryId);
                          const lineHasBatch = lineCat?.hasBatchManagement;
                          return (
                          <div key={line.id} className="flex flex-wrap items-end gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                            <div className="flex-1 min-w-[200px] space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标采购品项 (支持搜索与分类筛选)</label>
                              <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                                const prod = productMapPSI.get(id);
                                updatePurchaseBillItem(line.id, { productId: id, purchasePrice: prod?.purchasePrice ?? 0, batch: undefined });
                              }} />
                            </div>
                            <div className="w-24 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                              <div className="flex items-center gap-1.5">
                                <input type="number" min={0} value={line.quantity || ''} onChange={e => updatePurchaseBillItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                              </div>
                            </div>
                            <div className="w-28 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                              <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                {((line.quantity || 0) * (line.purchasePrice || 0)).toFixed(2)}
                              </div>
                            </div>
                            {lineHasBatch && (
                              <div className="w-28 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">批次</label>
                                <input type="text" value={line.batch || ''} onChange={e => updatePurchaseBillItem(line.id, { batch: e.target.value.trim() || undefined })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="批号" />
                              </div>
                            )}
                            <button onClick={() => removePurchaseBillItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                          </div>
                        );})}
                        {purchaseBillItems.length === 0 && (
                          <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                            <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                            <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入入库明细</p>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
                        <div className="flex items-center gap-4">
                          <p className="text-xs font-bold opacity-80">入库总量:</p>
                          <p className="text-xl font-black">{purchaseBillItems.reduce((s, i) => {
                            const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                            return s + q;
                          }, 0)} <span className="text-xs font-medium">PCS</span></p>
                        </div>
                        <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                          <p className="text-xs font-bold opacity-80">总金额:</p>
                          <p className="text-xl font-black">¥{purchaseBillItems.reduce((s, i) => {
                            const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                            return s + q * (i.purchasePrice || 0);
                          }, 0).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据备注</label><textarea rows={2} value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none resize-none" placeholder="备注说明..."></textarea></div>
                  </div>
               ) : creationMethod === 'MANUAL' || showModal !== 'PURCHASE_BILL' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据编号 (选填)</label>
                          <div className="relative">
                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                            <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <PartnerSelector 
                            partners={partners}
                            categories={partnerCategories}
                            value={form.partner}
                            onChange={(name, id) => setForm({...form, partner: name, partnerId: id || ''})}
                            label={bizConfig[showModal]?.partnerLabel}
                            placeholder={`选择${bizConfig[showModal]?.partnerLabel}...`}
                          />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">关联物料/产品</label>
                        <SearchableProductSelect options={products} categories={categories} value={form.productId} onChange={(pid) => {
                          const prod = productMapPSI.get(pid);
                          setForm({...form, productId: pid, purchasePrice: prod?.purchasePrice ?? 0});
                        }} />
                    </div>
                    {showModal === 'PURCHASE_BILL' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">采购价 (元)</label>
                          <input type="number" min={0} step={0.01} value={form.purchasePrice ?? ''} onChange={e => setForm({...form, purchasePrice: parseFloat(e.target.value) || 0})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">金额 (元)</label>
                          <div className="py-3 px-4 text-sm font-black text-indigo-600 bg-slate-50 rounded-2xl">
                            ¥{((form.quantity ?? 0) * (form.purchasePrice ?? 0)).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}
                    {!current.hideWarehouse && (
                      <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">业务仓库</label><select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"><option value="">选择仓库...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">业务数量 (PCS)</label>
                          <input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value)||0})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">业务日期</label>
                          <input type="text" disabled value={new Date().toLocaleDateString()} className="w-full bg-slate-50/50 border-none rounded-2xl py-3 px-4 text-xs font-bold text-slate-400" />
                        </div>
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据备注</label><textarea rows={2} value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none resize-none" placeholder="备注说明..."></textarea></div>
                  </div>
               ) : (
                  <div className="space-y-8 animate-in slide-in-from-right-4">
                    {/* 1. 选择采购订单 */}
                    <div className="space-y-4">
                       <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ClipboardList className="w-4 h-4" /> 1. 选择来源订单</h4>
                       {pendingPOs.length === 0 ? (
                         <div className="py-12 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                            <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                            <p className="text-slate-400 font-bold italic text-xs">暂无未入库完成的采购订单</p>
                         </div>
                       ) : (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {pendingPOs.map(([docNum, items]) => {
                               const isSelected = selectedPOOrderNums.includes(docNum);
                               const partnerName = items[0]?.partner;
                               return (
                                 <button 
                                   key={docNum}
                                   onClick={() => {
                                      if (selectedPOOrderNums.length > 0) {
                                         const currentPartner = allPOByGroups[selectedPOOrderNums[0]][0]?.partner;
                                         if (partnerName !== currentPartner) {
                                            toast.error("不可跨供应商引用订单！");
                                            return;
                                         }
                                      }
                                      setSelectedPOOrderNums(prev => prev.includes(docNum) ? prev.filter(n => n !== docNum) : [...prev, docNum]);
                                   }}
                                   className={`p-4 rounded-[24px] border-2 text-left transition-all flex items-center justify-between ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-50 bg-slate-50 hover:border-indigo-200'}`}
                                 >
                                    <div>
                                       <p className="text-sm font-black text-slate-800">{docNum}</p>
                                       <p className="text-[10px] text-slate-400 font-bold uppercase">{partnerName}</p>
                                    </div>
                                    {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-slate-200" />}
                                 </button>
                               );
                            })}
                         </div>
                       )}
                    </div>

                    {/* 2. 选择具体商品行，支持部分到货：可编辑本次入库数量 */}
                    {selectedPOOrderNums.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-slate-100 animate-in fade-in">
                         <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListFilter className="w-4 h-4" /> 2. 勾选并填写本次入库数量 (支持部分到货)</h4>
                         <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                               <thead>
                                  <tr className="bg-slate-50/80 border-b border-slate-100">
                                     <th className="px-4 py-3 w-10 text-center">
                                        <button 
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             if (selectedPOItemIds.length === availableItemsFromSelectedPOs.length) {
                                               setSelectedPOItemIds([]);
                                               setSelectedPOItemQuantities({});
                                               setSelectedPOItemBatches({});
                                             } else {
                                               const ids = availableItemsFromSelectedPOs.map(i => i.id);
                                               setSelectedPOItemIds(ids);
                                               setSelectedPOItemQuantities(prev => {
                                                 const next = { ...prev };
                                                 availableItemsFromSelectedPOs.forEach(i => { next[i.id] = i.remainingQty; });
                                                 return next;
                                               });
                                             }
                                          }}
                                          className="text-slate-400 hover:text-indigo-600"
                                        >
                                           {selectedPOItemIds.length === availableItemsFromSelectedPOs.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        </button>
                                     </th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">源订单 / 商品</th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">采购价</th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">订单数量</th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收</th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收</th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">本次入库数量</th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">批次</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-50">
                                  {availableItemsFromSelectedPOs.map((item) => {
                                     const product = productMapPSI.get(item.productId);
                                     const prodCategory = product && categoryMapPSI.get(product.categoryId);
                                     const hasBatch = prodCategory?.hasBatchManagement;
                                     const isChecked = selectedPOItemIds.includes(item.id);
                                     const qty = selectedPOItemQuantities[item.id] ?? item.remainingQty;
                                     const handleToggle = () => {
                                       if (isChecked) {
                                         setSelectedPOItemIds(prev => prev.filter(id => id !== item.id));
                                         setSelectedPOItemQuantities(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                         setSelectedPOItemBatches(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                                       } else {
                                         setSelectedPOItemIds(prev => [...prev, item.id]);
                                         setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: item.remainingQty }));
                                       }
                                     };
                                     return (
                                       <tr 
                                         key={item.id} 
                                         onClick={() => handleToggle()}
                                         className={`cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}
                                       >
                                          <td className="px-4 py-3 text-center">
                                             {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                          </td>
                                          <td className="px-4 py-3">
                                             <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">{item.docNumber}</span>
                                                <span className="text-xs font-bold text-slate-700">{product?.name}</span>
                                                <span className="text-[8px] text-slate-400 uppercase tracking-tighter">SKU: {product?.sku}</span>
                                             </div>
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                             <span className="text-xs font-bold text-slate-500">¥{(item.purchasePrice ?? 0).toFixed(2)}</span>
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                             <span className="text-sm font-bold text-slate-600">{formatQtyDisplay(item.quantity)} {item.productId ? getUnitName(item.productId) : 'PCS'}</span>
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                             <span className="text-xs font-bold text-slate-400">{item.receivedQty}</span>
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                             <span className="text-sm font-black text-indigo-600">{item.remainingQty}</span>
                                          </td>
                                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                             {isChecked ? (
                                               <input
                                                 type="number"
                                                 min={0}
                                                 value={qty}
                                                 onChange={e => {
                                                   const v = parseFloat(e.target.value);
                                                   const val = Number.isFinite(v) ? Math.max(0, v) : 0;
                                                   setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: val }));
                                                 }}
                                                 className="w-20 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                 title="允许超过采购订单数量（如超收）"
                                               />
                                             ) : (
                                               <span className="text-slate-300">—</span>
                                             )}
                                          </td>
                                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                             {isChecked && hasBatch ? (
                                               <input type="text" value={selectedPOItemBatches[item.id] ?? ''} onChange={e => setSelectedPOItemBatches(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="批号" className="w-24 py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                                             ) : (
                                               <span className="text-slate-300">—</span>
                                             )}
                                          </td>
                                       </tr>
                                     )
                                  })}
                               </tbody>
                            </table>
                         </div>
                      </div>
                    )}

                    {/* 3. 其他入库设置 */}
                    {selectedPOItemIds.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-slate-100 animate-in slide-in-from-bottom-4">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">本次入库单号 (选填)</label>
                               <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div className="space-y-1">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库至指定仓库 <span className="text-rose-500">*</span></label>
                               <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                                  <option value="">点击选择入库仓...</option>
                                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                               </select>
                            </div>
                         </div>
                         <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库备注</label><textarea rows={2} value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none resize-none" placeholder="记录本次引用入库的特别说明..."></textarea></div>
                      </div>
                    )}
                  </div>
               )}
            </div>
            <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex gap-4">
               {creationMethod === 'MANUAL' || showModal !== 'PURCHASE_BILL' ? (
                 <button 
                   onClick={() => handleSaveManual(showModal)} 
                   disabled={
                     showModal === 'PURCHASE_BILL' && creationMethod === 'MANUAL'
                       ? !form.partner || !form.warehouseId || purchaseBillItems.length === 0 || !purchaseBillItems.some(i => {
                          if (!i.productId) return false;
                          const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                          return q > 0;
                        })
                       : !form.partner || !form.productId || (!current.hideWarehouse && !form.warehouseId)
                   } 
                   className={`w-full py-4 text-white rounded-2xl font-bold shadow-xl transition-all active:scale-95 uppercase tracking-widest ${current.color} shadow-indigo-100`}
                 >
                   确认并生成单据
                 </button>
               ) : (
                 <button 
                  onClick={handleConvertPOToBill} 
                  disabled={!form.warehouseId || selectedPOItemIds.length === 0 || selectedPOItemIds.every(id => (selectedPOItemQuantities[id] ?? 0) <= 0)} 
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest flex items-center justify-center gap-2"
                >
                   <ArrowDownToLine className="w-4 h-4" />
                   执行部分/全部合并入库 ({selectedPOItemIds.filter(id => (selectedPOItemQuantities[id] ?? 0) > 0).length} 条)
                 </button>
               )}
            </div>
          </div>
        </div>
      )}

      {/* 销售订单列表 - 配货弹窗 */}
      {allocationModal && allocationQuantities !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => { setAllocationModal(null); setAllocationQuantities(null); }} />
          <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-black text-slate-800">配货</h3>
              </div>
              <button type="button" onClick={() => { setAllocationModal(null); setAllocationQuantities(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-auto flex-1 min-h-0">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-800">{allocationModal.product?.name}</span>
                <span className="text-slate-400 ml-1">· 单号 {allocationModal.docNumber}</span>
              </p>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">配货仓库（出库仓库）</label>
                <select
                  value={allocationWarehouseId}
                  onChange={e => setAllocationWarehouseId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">请选择仓库...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const orderTotal = allocationModal.grp.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                const allocatedTotal = allocationModal.grp.reduce((s: number, i: any) => s + (i.allocatedQuantity ?? 0), 0);
                const remainingTotal = typeof allocationQuantities === 'object'
                  ? Object.values(allocationQuantities).reduce((a, b) => a + b, 0)
                  : (allocationQuantities ?? 0);
                const unallocatedTotal = Math.max(0, orderTotal - allocatedTotal - remainingTotal);
                return (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="text-slate-500">订单数量：<strong className="text-slate-800">{orderTotal.toLocaleString()}</strong></span>
                    <span className="text-slate-500">已配货数量：<strong className="text-slate-700">{allocatedTotal.toLocaleString()}</strong></span>
                    <span className="text-slate-500">本次剩余待配：<strong className="text-indigo-600">{remainingTotal.toLocaleString()}</strong></span>
                    {unallocatedTotal > 0 && (
                      <span className="text-slate-500">未配货：<strong className="text-amber-600">{unallocatedTotal.toLocaleString()}</strong></span>
                    )}
                  </div>
                );
              })()}
              {allocationModal.grp.some((i: any) => i.variantId) ? (
                <div className="space-y-4 overflow-auto">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）· 输入为剩余配货数量</p>
                  {(() => {
                    const groupedByColor: Record<string, ProductVariant[]> = {};
                    const grpVariantIds = new Set(allocationModal.grp.map((i: any) => i.variantId).filter(Boolean));
                    allocationModal.product?.variants?.forEach((v: ProductVariant) => {
                      if (!grpVariantIds.has(v.id)) return;
                      if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                      groupedByColor[v.colorId].push(v);
                    });
                    const orderByVariant: Record<string, number> = {};
                    const allocatedByVariant: Record<string, number> = {};
                    allocationModal.grp.forEach((i: any) => {
                      if (i.variantId) {
                        orderByVariant[i.variantId] = (orderByVariant[i.variantId] ?? 0) + (i.quantity ?? 0);
                        allocatedByVariant[i.variantId] = (allocatedByVariant[i.variantId] ?? 0) + (i.allocatedQuantity ?? 0);
                      }
                    });
                    return sortedVariantColorEntries(groupedByColor, allocationModal.product?.colorIds, allocationModal.product?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries.colors.find(c => c.id === colorId);
                      const orderSum = (colorVariants as ProductVariant[]).reduce((s, v) => s + (orderByVariant[v.id] ?? 0), 0);
                      const allocatedSum = (colorVariants as ProductVariant[]).reduce((s, v) => s + (allocatedByVariant[v.id] ?? 0), 0);
                      const remainingSum = typeof allocationQuantities === 'object'
                        ? (colorVariants as ProductVariant[]).reduce((s, v) => s + (allocationQuantities[v.id] ?? 0), 0)
                        : 0;
                      const unallocSum = Math.max(0, orderSum - allocatedSum - remainingSum);
                      return (
                        <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-2 w-28 shrink-0">
                            <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                            <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {colorVariants.map(v => {
                              const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                              const orderQty = orderByVariant[v.id] ?? 0;
                              const allocatedQty = allocatedByVariant[v.id] ?? 0;
                              const remainingQty = typeof allocationQuantities === 'object' ? (allocationQuantities[v.id] ?? 0) : 0;
                              const unallocated = Math.max(0, orderQty - allocatedQty - remainingQty);
                              return (
                                <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                  <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder="0"
                                    value={remainingQty || ''}
                                    onChange={e => {
                                      const val = parseInt(e.target.value, 10);
                                      setAllocationQuantities(prev => {
                                        if (typeof prev !== 'object') return prev;
                                        return { ...prev, [v.id]: isNaN(val) ? 0 : val };
                                      });
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                    title="剩余配货数量"
                                  />
                                  <div className="flex justify-between text-[9px] text-slate-400">
                                    <span>已配 {allocatedQty}</span>
                                    {unallocated > 0 && <span className="text-amber-600">未配 {unallocated}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">剩余配货数量</label>
                  <input
                    type="number"
                    min={0}
                    value={typeof allocationQuantities === 'number' ? allocationQuantities : 0}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      setAllocationQuantities(isNaN(v) ? 0 : v);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="本次配货数量"
                  />
                  {allocationModal.grp[0] && (allocationModal.grp[0].allocatedQuantity ?? 0) > 0 && (
                    <p className="text-xs text-slate-500 mt-1">已配货：{(allocationModal.grp[0].allocatedQuantity ?? 0).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-4 shrink-0 bg-slate-50/50">
              <button type="button" onClick={() => { setAllocationModal(null); setAllocationQuantities(null); }} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 rounded-xl hover:bg-white border border-slate-200 transition-colors">
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!allocationModal || !onReplaceRecords) { setAllocationModal(null); setAllocationQuantities(null); return; }
                  if (!allocationWarehouseId) return;
                  const docRecords = recordsList.filter((r: any) => r.type === 'SALES_ORDER' && r.docNumber === allocationModal.docNumber);
                  const newRecords = docRecords.map((r: any) => {
                    const inGrp = allocationModal.grp.find((g: any) => g.id === r.id);
                    if (!inGrp) return r;
                    const remaining = typeof allocationQuantities === 'object' && inGrp.variantId
                      ? (allocationQuantities[inGrp.variantId] ?? 0)
                      : (typeof allocationQuantities === 'number' ? allocationQuantities : 0);
                    return { ...r, allocatedQuantity: (r.allocatedQuantity ?? 0) + remaining, allocationWarehouseId: allocationWarehouseId };
                  });
                  onReplaceRecords('SALES_ORDER', allocationModal.docNumber, newRecords);
                  setAllocationModal(null);
                  setAllocationQuantities(null);
                }}
                disabled={!allocationWarehouseId}
                className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 采购订单表单配置弹窗 */}
      {showPOFormConfigModal && poFormConfigDraft && onUpdatePurchaseOrderFormSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPOFormConfigModal(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sliders className="w-5 h-5 text-indigo-500" /> 采购订单表单配置</h3>
                <p className="text-xs text-slate-500 mt-1">配置在列表、新增、详情页中显示的字段，可增加自定义项</p>
              </div>
              <button onClick={() => setShowPOFormConfigModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
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
                      {poFormConfigDraft.standardFields.filter(f => !['docNumber', 'partner', 'createdAt'].includes(f.id)).map(f => (
                        <tr key={f.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setPOFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setPOFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setPOFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
                  <button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                    <Plus className="w-3.5 h-3.5" /> 增加
                  </button>
                </div>
                {poFormConfigDraft.customFields.length === 0 ? (
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
                        {poFormConfigDraft.customFields.map(cf => (
                          <tr key={cf.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                            <td className="px-4 py-2">
                              <select value={cf.type || 'text'} onChange={e => {
                                const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                                setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                              }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 align-top">
                              {cf.type === 'select' ? (
                                <div className="min-w-[180px] space-y-1.5">
                                  {(cf.options ?? []).map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-1">
                                      <input type="text" value={opt} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                      <button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                    <Plus className="w-3.5 h-3.5" /> 添加选项
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2"><button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowPOFormConfigModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
              <button onClick={() => { onUpdatePurchaseOrderFormSettings(poFormConfigDraft); setShowPOFormConfigModal(false); setPOFormConfigDraft(null); }} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">保存配置</button>
            </div>
          </div>
        </div>
      )}

      {/* 采购单表单配置弹窗 */}
      {showPBFormConfigModal && pbFormConfigDraft && onUpdatePurchaseBillFormSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPBFormConfigModal(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sliders className="w-5 h-5 text-indigo-500" /> 采购单表单配置</h3>
                <p className="text-xs text-slate-500 mt-1">配置在列表、新增、详情页中显示的字段，可增加自定义项</p>
              </div>
              <button onClick={() => setShowPBFormConfigModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
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
                      {pbFormConfigDraft.standardFields.filter(f => !['docNumber', 'partner', 'warehouse', 'createdAt'].includes(f.id)).map(f => (
                        <tr key={f.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setPBFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setPBFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setPBFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
                  <button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                    <Plus className="w-3.5 h-3.5" /> 增加
                  </button>
                </div>
                {pbFormConfigDraft.customFields.length === 0 ? (
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
                        {pbFormConfigDraft.customFields.map(cf => (
                          <tr key={cf.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                            <td className="px-4 py-2">
                              <select value={cf.type || 'text'} onChange={e => {
                                const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                                setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                              }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 align-top">
                              {cf.type === 'select' ? (
                                <div className="min-w-[180px] space-y-1.5">
                                  {(cf.options ?? []).map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-1">
                                      <input type="text" value={opt} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                      <button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                    <Plus className="w-3.5 h-3.5" /> 添加选项
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2"><button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowPBFormConfigModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
              <button onClick={() => { onUpdatePurchaseBillFormSettings(pbFormConfigDraft); setShowPBFormConfigModal(false); setPBFormConfigDraft(null); }} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">保存配置</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PSIOpsView);