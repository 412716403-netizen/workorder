import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  ClipboardCheck,
  TrendingDown,
  TrendingUp,
  ArrowRightCircle,
  History,
  Activity,
  Search,
  Filter,
  Layers,
  BarChart3,
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
  Box,
  Trash2,
  Sliders
} from 'lucide-react';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries, ProductVariant, PurchaseOrderFormSettings, PurchaseBillFormSettings } from '../types';

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
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  /** 当进入订单/单据详情页时通知父组件，用于隐藏顶部标签 */
  onDetailViewChange?: (isDetail: boolean) => void;
}

// 增强型产品选择器（与生产计划一致）
const ProductSelector = ({
  options = [],
  categories = [],
  value,
  onChange
}: {
  options: Product[];
  categories: ProductCategory[];
  value: string;
  onChange: (productId: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = options.find(p => p.id === value);
  const filteredOptions = useMemo(() => {
    return options.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
      return matchesSearch && matchesCategory;
    });
  }, [options, search, activeTab]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">目标采购品项 (支持搜索与分类筛选)</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between transition-all h-[52px]"
      >
        <div className="flex items-center gap-2 truncate">
          <Package className={`w-4 h-4 ${selectedProduct ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={selectedProduct ? 'text-slate-900 truncate' : 'text-slate-400'}>
            {selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : '搜索并选择产品型号...'}
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
              placeholder="输入名称或 SKU 搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
            <button onClick={() => setActiveTab('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>全部</button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === cat.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{cat.name}</button>
            ))}
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
            {filteredOptions.map(p => {
              const cat = categories.find(c => c.id === p.categoryId);
              return (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setIsOpen(false); setSearch(''); }}
                  className={`w-full text-left p-3 rounded-2xl transition-all border-2 ${p.id === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}
                >
                  <div className="flex justify-between items-start mb-0.5">
                    <p className="text-sm font-black truncate">{p.name}</p>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[8px] font-black uppercase">{cat?.name || '未分类'}</span>
                  </div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${p.id === value ? 'text-indigo-400' : 'text-slate-400'}`}>{p.sku}</p>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="py-10 text-center">
                <Box className="w-8 h-8 text-slate-100 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">未找到符合条件的产品</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// 增强型合作伙伴选择器
const PartnerSelector = ({ 
  partners = [], 
  categories = [],
  value, 
  onChange, 
  placeholder,
  label
}: { 
  partners: Partner[]; 
  categories: PartnerCategory[];
  value: string; 
  onChange: (partnerName: string, partnerId?: string) => void; 
  placeholder?: string;
  label: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

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
        <div className="flex items-center gap-2 truncate">
          <Building2 className={`w-4 h-4 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={value ? 'text-slate-900 truncate' : 'text-slate-400'}>
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
                    {categories.find(c => c.id === p.categoryId)?.name || '未分类'}
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

const PSIOpsView: React.FC<PSIOpsViewProps> = ({ type, products, warehouses, categories, partners, partnerCategories, dictionaries, records, purchaseOrderFormSettings = { standardFields: [], customFields: [] }, onUpdatePurchaseOrderFormSettings, purchaseBillFormSettings = { standardFields: [], customFields: [] }, onUpdatePurchaseBillFormSettings, onAddRecord, onReplaceRecords, onDeleteRecords, onDetailViewChange }) => {
  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  // 仓库管理子视图状态
  const [whSubTab, setWhSubTab] = useState<'STOCK' | 'TRANSFER_LOG' | 'STOCKTAKE_LOG'>('STOCK');
  const [inventoryViewMode, setInventoryViewMode] = useState<'warehouse' | 'product'>('warehouse');
  const [searchTerm, setSearchTerm] = useState('');
  
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

  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  // 当前是否处于采购订单编辑模式（存原始单号）
  const [editingPODocNumber, setEditingPODocNumber] = useState<string | null>(null);
  const [showPOFormConfigModal, setShowPOFormConfigModal] = useState(false);
  const [poFormConfigDraft, setPOFormConfigDraft] = useState<PurchaseOrderFormSettings | null>(null);
  const [showPBFormConfigModal, setShowPBFormConfigModal] = useState(false);
  const [pbFormConfigDraft, setPBFormConfigDraft] = useState<PurchaseBillFormSettings | null>(null);
  // 采购单详情查看/删除（存单号）
  const [editingPBDocNumber, setEditingPBDocNumber] = useState<string | null>(null);

  // 切换标签时清除新增/编辑状态，避免出现不匹配的弹窗
  useEffect(() => {
    setShowModal(null);
    setEditingPODocNumber(null);
    setEditingPBDocNumber(null);
  }, [type]);

  // 订单/单据详情页时通知父组件隐藏顶部标签
  const isDetailView = (type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') || (type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL');
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
    'SALES_ORDER': { label: '销售订单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'SO' },
    'SALES_BILL': { label: '销售单', color: 'bg-rose-600', partnerLabel: '客户', prefix: 'SB' },
    'WAREHOUSE_MGMT': { label: '仓库管理', color: 'bg-indigo-600', sub: '全方位的仓库业务控制中心' },
  };

  const current = bizConfig[type];

  // 统一库存计算逻辑
  const getStock = (pId: string, whId?: string) => {
    const ins = records.filter(r => (r.type === 'PURCHASE_BILL' || (r.type === 'TRANSFER' && r.toWarehouseId === whId)) && r.productId === pId && (!whId || r.warehouseId === whId || r.toWarehouseId === whId)).reduce((s, r) => s + r.quantity, 0);
    const outs = records.filter(r => (r.type === 'SALES_BILL' || (r.type === 'TRANSFER' && r.fromWarehouseId === whId)) && r.productId === pId && (!whId || r.warehouseId === whId || r.fromWarehouseId === whId)).reduce((s, r) => s + r.quantity, 0);
    const base = whId ? 20 : 100; 
    return Math.max(0, base + ins - outs);
  };

  // 按合作单位生成采购订单单号：PO-{partnerCode}-{seq}
  const generatePODocNumber = (): string => {
    const partnerCode = (form.partnerId || partners.find(p => p.name === form.partner)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = records.filter((r: any) =>
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
    const existingForPartner = records.filter((r: any) =>
      r.type === 'PURCHASE_BILL' && (r.partnerId === partnerId || r.partner === partnerName)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`PB-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `PB-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  const handleSaveManual = (submitType: string) => {
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
        const exists = (n: string) => records.some((r: any) => r.type === 'PURCHASE_ORDER' && r.docNumber === n);
        let attempts = 0;
        while (exists(docNumber) && attempts < 50) {
          docNumber = generatePODocNumber();
          attempts++;
        }
      }
      const timestamp = new Date().toLocaleString();

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

      // 编辑模式：用新明细替换掉旧单据的所有记录；否则视为新建
      if (editingPODocNumber && onReplaceRecords) {
        onReplaceRecords('PURCHASE_ORDER', originalDocNumber || docNumber, newRecords);
      } else {
        newRecords.forEach(r => onAddRecord(r));
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
      const docNumber = form.docNumber?.trim() || (editingPBDocNumber ?? generatePBDocNumber(form.partnerId || '', form.partner || ''));
      const timestamp = new Date().toLocaleString();
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
        newRecords.forEach(r => onAddRecord(r));
      }
      setShowModal(null);
      resetForm();
      return;
    }

    const systemQty = submitType === 'STOCKTAKE' ? getStock(form.productId, form.warehouseId) : 0;
    const prefix = bizConfig[submitType]?.prefix || (submitType === 'TRANSFER' ? 'TR' : 'DOC');
    const docNumber = form.docNumber?.trim() || (
      submitType === 'PURCHASE_BILL'
        ? generatePBDocNumber(form.partnerId || '', form.partner || '')
        : `${prefix}-${Date.now().toString().slice(-6)}`
    );

    const newRec = {
      id: `psi-${Date.now()}`,
      type: submitType,
      timestamp: new Date().toLocaleString(),
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
    const filtered = records.filter(r => r.type === 'PURCHASE_ORDER');
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [records]);

  // 按 (sourceOrderNumber, sourceLineId) 汇总采购单已入库数量
  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    records.filter(r => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId).forEach(r => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
    });
    return map;
  }, [records]);

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
    const pbDocNumber = form.docNumber?.trim() || generatePBDocNumber(firstItem?.partnerId || '', firstItem?.partner || '');
    const baseId = Date.now();

    let addedCount = 0;
    itemsToBill.forEach((item, idx) => {
      const qty = Math.max(0, Math.min(item.remainingQty, selectedPOItemQuantities[item.id] ?? item.remainingQty));
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
    alert(`采购单 ${pbDocNumber} 已成功创建，包含 ${addedCount} 条入库明细`);
  };

  const resetForm = () => {
    const t = new Date().toISOString().split('T')[0];
    setForm({ productId: '', warehouseId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, actualQuantity: 0, purchasePrice: 0, partner: '', partnerId: '', note: '', docNumber: '', dueDate: '', createdAt: t, customData: {} });
    setPurchaseOrderItems([]);
    setPurchaseBillItems([]);
    setSelectedPOOrderNums([]);
    setSelectedPOItemIds([]);
    setSelectedPOItemQuantities({});
    setSelectedPOItemBatches({});
    setCreationMethod('MANUAL');
    setEditingPODocNumber(null);
    setEditingPBDocNumber(null);
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

  const groupedRecords = useMemo(() => {
    const filtered = records.filter(r => r.type === type);
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber || 'UNGROUPED-' + r.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [records, type]);

  const filteredProductStocks = useMemo(() => {
    const allStocks = products.map(p => {
      const total = getStock(p.id);
      const category = categories.find(c => c.id === p.categoryId);
      const distribution = warehouses.map(wh => ({
        warehouseId: wh.id,
        warehouseName: wh.name,
        category: wh.category,
        qty: getStock(p.id, wh.id)
      })).filter(d => d.qty > 0);
      return { ...p, total, distribution, categoryName: category?.name || '未分类' };
    });
    if (!searchTerm.trim()) return allStocks;
    const term = searchTerm.toLowerCase();
    return allStocks.filter(ps => ps.name.toLowerCase().includes(term) || ps.sku.toLowerCase().includes(term) || ps.categoryName.toLowerCase().includes(term));
  }, [products, warehouses, records, categories, searchTerm]);

  const totalInView = useMemo(() => filteredProductStocks.reduce((sum, p) => sum + p.total, 0), [filteredProductStocks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{current.label}</h1>
          <p className="text-slate-500 mt-1 italic text-sm">{current.sub || '管理业务单据与记录'}</p>
        </div>
        
        <div className="flex items-center gap-3">
          {type === 'PURCHASE_ORDER' && onUpdatePurchaseOrderFormSettings && (
            <button onClick={() => { setPOFormConfigDraft(JSON.parse(JSON.stringify(purchaseOrderFormSettings))); setShowPOFormConfigModal(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-bold transition-all border border-slate-200">
              <Sliders className="w-4 h-4" /> 表单配置
            </button>
          )}
          {type === 'PURCHASE_BILL' && onUpdatePurchaseBillFormSettings && (
            <button onClick={() => { setPBFormConfigDraft(JSON.parse(JSON.stringify(purchaseBillFormSettings))); setShowPBFormConfigModal(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-bold transition-all border border-slate-200">
              <Sliders className="w-4 h-4" /> 表单配置
            </button>
          )}
          {type !== 'WAREHOUSE_MGMT' && !(type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') && !(type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL') && (
            <button
              onClick={() => { resetForm(); setEditingPODocNumber(null); setShowModal(type); }}
              className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-sm font-bold transition-all shadow-lg ${current.color} shadow-indigo-100`}
            >
              <Plus className="w-4 h-4" /> 登记新{current.label}
            </button>
          )}
        </div>
      </div>

      {type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER' ? (
        <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button onClick={() => { setShowModal(null); setEditingPODocNumber(null); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <div className="flex items-center gap-3">
              {editingPODocNumber && onDeleteRecords && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('确定要删除该采购订单吗？')) {
                      onDeleteRecords('PURCHASE_ORDER', editingPODocNumber);
                      setShowModal(null);
                      setEditingPODocNumber(null);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              <button
                onClick={() => handleSaveManual('PURCHASE_ORDER')}
                disabled={!form.partner || purchaseOrderItems.length === 0 || !purchaseOrderItems.some(i => {
                  if (!i.productId) return false;
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                  return q > 0;
                })}
                className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {editingPODocNumber ? '保存修改' : '确认保存采购订单'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                <h3 className="text-lg font-bold text-slate-800">1. 采购订单基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 供应商、单据编号、添加日期 固定显示，不可配置 */}
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
                {purchaseOrderFormSettings.standardFields.find(f => f.id === 'dueDate')?.showInCreate !== false && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望到货日期</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                  <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                {purchaseOrderFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                    <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                  </div>
                )}
                {purchaseOrderFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
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
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                  <h3 className="text-lg font-bold text-slate-800">2. 采购明细录入</h3>
                </div>
                <button onClick={addPurchaseOrderItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                  <Plus className="w-4 h-4" /> 添加明细行
                </button>
              </div>
              <div className="space-y-4">
                {purchaseOrderItems.map((line) => {
                  const prod = products.find(p => p.id === line.productId);
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
                  <div key={line.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex-1 min-w-[200px]">
                        <ProductSelector options={products} categories={categories} value={line.productId} onChange={(id) => {
                          const p = products.find(x => x.id === id);
                          const hv = p?.variants && p.variants.length > 0;
                          updatePurchaseOrderItem(line.id, {
                            productId: id,
                            purchasePrice: p?.purchasePrice ?? 0,
                            quantity: hv ? undefined : 0,
                            variantQuantities: hv ? {} : undefined
                          });
                        }} />
                      </div>
                      <div className="w-28 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                        <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => updatePurchaseOrderItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                      </div>
                      {hasVariants && (
                        <>
                          <div className="w-24 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                            <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                              {lineQty} {line.productId ? getUnitName(line.productId) : '—'}
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
                          <div className="w-24 space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                            <div className="flex items-center gap-1.5">
                              <input type="number" min={0} value={line.quantity || ''} onChange={e => updatePurchaseOrderItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
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
                      {poDocNum && received > 0 && (
                        <div className="w-40 space-y-1 shrink-0">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">入库进度</label>
                          <div className="flex flex-col gap-1">
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress * 100}%` }} />
                            </div>
                            <span className="text-[9px] font-bold text-slate-500">已收 {received} / {lineQty}</span>
                          </div>
                        </div>
                      )}
                      <button onClick={() => removePurchaseOrderItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                    </div>
                    {hasVariants && line.productId && (
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">颜色尺码数量</label>
                        {(Object.entries(groupedByColor) as [string, ProductVariant[]][]).map(([colorId, colorVariants]) => {
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
              <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
                <div className="flex items-center gap-4">
                  <p className="text-xs font-bold opacity-80">采购总量:</p>
                  <p className="text-xl font-black">{purchaseOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q;
                }, 0)} <span className="text-xs font-medium">PCS</span></p>
                </div>
                <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                  <p className="text-xs font-bold opacity-80">订单金额:</p>
                  <p className="text-xl font-black">¥{purchaseOrderItems.reduce((s, i) => {
                    const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                    return s + q * (i.purchasePrice || 0);
                  }, 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL' ? (
        <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button onClick={() => { setShowModal(null); setEditingPBDocNumber(null); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <div className="flex items-center gap-3">
              {editingPBDocNumber && onDeleteRecords && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('确定要删除该采购单吗？')) {
                      onDeleteRecords('PURCHASE_BILL', editingPBDocNumber);
                      setShowModal(null);
                      setEditingPBDocNumber(null);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              {!editingPBDocNumber && (
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm">
                <button onClick={() => setCreationMethod('MANUAL')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                  <Plus className="w-3 h-3" /> 直接手动创建
                </button>
                <button onClick={() => setCreationMethod('FROM_ORDER')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${creationMethod === 'FROM_ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
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
                    <h3 className="text-lg font-bold text-slate-800">1. 采购单基础信息</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    {purchaseBillFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                        <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                      </div>
                    )}
                    {purchaseBillFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
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
                      <h3 className="text-lg font-bold text-slate-800">2. 入库明细录入</h3>
                    </div>
                    <button onClick={addPurchaseBillItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                      <Plus className="w-4 h-4" /> 添加明细行
                    </button>
                  </div>
                  <div className="space-y-4">
                    {purchaseBillItems.map((line) => {
                      const pbProd = products.find(p => p.id === line.productId);
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
                          <div className="flex-1 min-w-[200px]">
                            <ProductSelector options={products} categories={categories} value={line.productId}                             onChange={(id) => {
                              const p = products.find(x => x.id === id);
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
                                  {pbLineQty} {line.productId ? getUnitName(line.productId) : '—'}
                                </div>
                              </div>
                              <div className="w-28 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                                <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                  {pbLineAmount.toFixed(2)}
                                </div>
                              </div>
                              {pbProd && categories.find(c => c.id === pbProd.categoryId)?.hasBatchManagement && (
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
                              {pbProd && categories.find(c => c.id === pbProd.categoryId)?.hasBatchManagement && (
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
                            {(Object.entries(pbGroupedByColor) as [string, ProductVariant[]][]).map(([colorId, colorVariants]) => {
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
                                  alert("不可跨供应商引用订单！");
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
                  <div className="space-y-4 pt-6 border-t border-slate-100">
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
                            const product = products.find(p => p.id === item.productId);
                            const prodCategory = product && categories.find(c => c.id === product.categoryId);
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
                                <td className="px-4 py-3 text-right"><span className="text-sm font-bold text-slate-600">{item.quantity} {item.productId ? getUnitName(item.productId) : 'PCS'}</span></td>
                                <td className="px-4 py-3 text-right"><span className="text-xs font-bold text-slate-400">{item.receivedQty}</span></td>
                                <td className="px-4 py-3 text-right"><span className="text-sm font-black text-indigo-600">{item.remainingQty}</span></td>
                                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                  {isChecked ? (
                                    <input type="number" min={0} max={item.remainingQty} value={qty} onChange={e => {
                                      const v = parseFloat(e.target.value);
                                      const clamped = Number.isFinite(v) ? Math.max(0, Math.min(item.remainingQty, v)) : 0;
                                      setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: clamped }));
                                    }} className="w-20 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                  <div className="space-y-6 pt-6 border-t border-slate-100">
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
                    {purchaseBillFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据备注</label>
                        <textarea rows={2} value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none resize-none" placeholder="记录本次引用入库的特别说明..."></textarea>
                      </div>
                    )}
                    {purchaseBillFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
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
        <div className="space-y-6 animate-in fade-in duration-300">
           <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
             <div className="flex bg-white p-1 rounded-2xl w-fit border border-slate-200 shadow-sm">
               <button onClick={() => setWhSubTab('STOCK')} className={`flex items-center gap-2 px-6 py-2.5 rounded-[14px] text-xs font-bold transition-all ${whSubTab === 'STOCK' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                 <Activity className="w-3.5 h-3.5" /> 实时结存
               </button>
               <button onClick={() => setWhSubTab('TRANSFER_LOG')} className={`flex items-center gap-2 px-6 py-2.5 rounded-[14px] text-xs font-bold transition-all ${whSubTab === 'TRANSFER_LOG' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                 <History className="w-3.5 h-3.5" /> 调拨记录
               </button>
               <button onClick={() => setWhSubTab('STOCKTAKE_LOG')} className={`flex items-center gap-2 px-6 py-2.5 rounded-[14px] text-xs font-bold transition-all ${whSubTab === 'STOCKTAKE_LOG' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                 <ClipboardCheck className="w-3.5 h-3.5" /> 盘点历史
               </button>
             </div>
             <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" placeholder="搜索结存..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
             </div>
           </div>
           
           {whSubTab === 'STOCK' && (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4">
                <div className="bg-indigo-600 p-6 rounded-[32px] text-white shadow-xl shadow-indigo-100 flex items-center gap-5">
                   <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center"><BarChart3 className="w-6 h-6" /></div>
                   <div><p className="text-[10px] font-black uppercase tracking-widest opacity-70">全库总存量</p><h4 className="text-2xl font-black">{totalInView.toLocaleString()} <span className="text-xs font-medium opacity-70">PCS</span></h4></div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-5">
                   <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400"><Layers className="w-6 h-6" /></div>
                   <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">库存物料项</p><h4 className="text-2xl font-black text-slate-800">{filteredProductStocks.filter(p => p.total > 0).length} <span className="text-xs font-medium text-slate-400">SKU</span></h4></div>
                </div>
             </div>
           )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.keys(groupedRecords).length === 0 ? (
            <div className="bg-white rounded-[32px] border-2 border-dashed border-slate-200 py-24 text-center">
              <FileText className="w-16 h-16 text-slate-100 mx-auto mb-4" />
              <p className="text-slate-400 font-medium italic">暂无{current.label}流水记录</p>
            </div>
          ) : (
            Object.entries(groupedRecords).map(([docNum, docItems]) => {
              const mainInfo = docItems[0];
              const totalQty = docItems.reduce((s, i) => s + (i.quantity ?? 0), 0);
              const totalAmount = docItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.purchasePrice ?? 0), 0);
              const isConverted = type === 'PURCHASE_ORDER' && docItems.every((item: any) => (item.quantity ?? 0) <= (receivedByOrderLine[`${docNum}::${item.id}`] ?? 0));
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
                          {isConverted && <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter bg-white px-2 py-0.5 rounded-full border border-emerald-50 shadow-sm">已入库完成</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-400 uppercase flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {mainInfo.timestamp}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> 经办: {mainInfo.operator}</span>
                          {type === 'PURCHASE_ORDER' && purchaseOrderFormSettings.standardFields.find(f => f.id === 'note')?.showInList && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'PURCHASE_ORDER' && purchaseOrderFormSettings.customFields.filter(f => f.showInList).map(cf => (mainInfo.customData?.[cf.id] != null && mainInfo.customData?.[cf.id] !== '') && (
                            <span key={cf.id} className="flex items-center gap-1 text-slate-500">{cf.label}: {String(mainInfo.customData[cf.id])}</span>
                          ))}
                          {type === 'PURCHASE_BILL' && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'PURCHASE_BILL' && purchaseBillFormSettings.customFields.filter(f => f.showInList).map(cf => (mainInfo.customData?.[cf.id] != null && mainInfo.customData?.[cf.id] !== '') && (
                            <span key={cf.id} className="flex items-center gap-1 text-slate-500">{cf.label}: {String(mainInfo.customData[cf.id])}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right mr-2">
                        <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据总量</p>
                        <p className="text-lg font-black text-slate-900">{totalQty.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></p>
                      </div>
                      {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && (
                        <div className="text-right mr-2">
                          <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据金额</p>
                          <p className="text-lg font-black text-emerald-600">¥{totalAmount.toFixed(2)}</p>
                        </div>
                      )}
                      {type === 'PURCHASE_ORDER' && (
                        <button
                          type="button"
                          onClick={openPurchaseOrderDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      {type === 'PURCHASE_BILL' && (
                        <button
                          type="button"
                          onClick={openPurchaseBillDetail}
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
                        <col style={{ width: 100 }} />
                        {type === 'PURCHASE_ORDER' && <col style={{ width: 140 }} />}
                      </colgroup>
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                          <th className="pb-3 pr-6 text-left">产品信息 / SKU</th>
                          {!current.hideWarehouse && <th className="pb-3 px-3 text-center">入库仓库</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <th className="pb-3 px-3 text-right">采购价</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <th className="pb-3 px-3 text-right">金额</th>}
                          <th className="pb-3 px-3 text-right">数量</th>
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
                            const product = products.find(p => p.id === first.productId);
                            const warehouse = warehouses.find(w => w.id === first.warehouseId);
                            const orderQty = grp.reduce((s, i) => s + (i.quantity ?? 0), 0);
                            const received = type === 'PURCHASE_ORDER'
                              ? grp.reduce((s, i) => s + (receivedByOrderLine[`${docNum}::${i.id}`] ?? 0), 0)
                              : 0;
                            const progress = orderQty > 0 ? Math.min(1, received / orderQty) : 0;
                            const rowAmount = grp.reduce((s, i) => s + (i.quantity ?? 0) * (i.purchasePrice ?? 0), 0);
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
                                        {variantLabel && ` · ${variantLabel}`}
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
                                <td className="py-4 px-3 text-right">
                                  <span className={`text-sm font-black ${type.includes('BILL') ? 'text-indigo-600' : 'text-slate-700'}`}>{orderQty.toLocaleString()} {first.productId ? getUnitName(first.productId) : 'PCS'}</span>
                                </td>
                                {type === 'PURCHASE_ORDER' && (
                                  <td className="py-4 px-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
                                        <div 
                                          className={`h-full rounded-full transition-all ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                          style={{ width: `${progress * 100}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-400">
                                        {progress >= 1 ? '已完成' : `${received} / ${orderQty}`}
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

      {/* 动态表单弹窗（采购订单、采购单使用全页表单，不弹窗；仅当标签与表单类型一致时显示，避免切换标签时闪屏） */}
      {showModal && type === showModal && !(type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') && !(type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL') && (
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
                   <button onClick={() => setCreationMethod('MANUAL')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                     <Plus className="w-3 h-3" /> 直接手动创建
                   </button>
                   <button onClick={() => setCreationMethod('FROM_ORDER')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${creationMethod === 'FROM_ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
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
                          const lineProd = products.find(p => p.id === line.productId);
                          const lineCat = lineProd && categories.find(c => c.id === lineProd.categoryId);
                          const lineHasBatch = lineCat?.hasBatchManagement;
                          return (
                          <div key={line.id} className="flex flex-wrap items-end gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                            <div className="flex-1 min-w-[200px]">
                              <ProductSelector options={products} categories={categories} value={line.productId} onChange={(id) => {
                                const prod = products.find(p => p.id === id);
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
                  <div className="space-y-6">
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
                        <select value={form.productId} onChange={e => {
                          const pid = e.target.value;
                          const prod = products.find(p => p.id === pid);
                          setForm({...form, productId: pid, purchasePrice: prod?.purchasePrice ?? 0});
                        }} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                          <option value="">点击选择产品...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
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
                                            alert("不可跨供应商引用订单！");
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
                      <div className="space-y-4 pt-6 border-t border-slate-100 animate-in fade-in">
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
                                     const product = products.find(p => p.id === item.productId);
                                     const prodCategory = product && categories.find(c => c.id === product.categoryId);
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
                                             <span className="text-sm font-bold text-slate-600">{item.quantity} {item.productId ? getUnitName(item.productId) : 'PCS'}</span>
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
                                                 max={item.remainingQty}
                                                 value={qty}
                                                 onChange={e => {
                                                   const v = parseFloat(e.target.value);
                                                   const clamped = Number.isFinite(v) ? Math.max(0, Math.min(item.remainingQty, v)) : 0;
                                                   setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: clamped }));
                                                 }}
                                                 className="w-20 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
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
                      <div className="space-y-6 pt-6 border-t border-slate-100 animate-in slide-in-from-bottom-4">
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

export default PSIOpsView;