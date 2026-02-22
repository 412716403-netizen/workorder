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
  Trash2
} from 'lucide-react';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory } from '../types';

interface PSIOpsViewProps {
  type: string;
  products: Product[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  records: any[];
  onAddRecord: (record: any) => void;
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

const PSIOpsView: React.FC<PSIOpsViewProps> = ({ type, products, warehouses, categories, partners, partnerCategories, records, onAddRecord }) => {
  // 仓库管理子视图状态
  const [whSubTab, setWhSubTab] = useState<'STOCK' | 'TRANSFER_LOG' | 'STOCKTAKE_LOG'>('STOCK');
  const [inventoryViewMode, setInventoryViewMode] = useState<'warehouse' | 'product'>('warehouse');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState<string | null>(null); 
  const [creationMethod, setCreationMethod] = useState<'MANUAL' | 'FROM_ORDER'>('MANUAL');
  const [selectedPOOrderNums, setSelectedPOOrderNums] = useState<string[]>([]);
  const [selectedPOItemIds, setSelectedPOItemIds] = useState<string[]>([]); // 存储选中的具体明细ID

  const [form, setForm] = useState<any>({
    productId: '',
    warehouseId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: 0,
    actualQuantity: 0,
    partner: '',
    partnerId: '',
    note: '',
    docNumber: '',
    dueDate: new Date().toISOString().split('T')[0]
  });

  // 采购订单行项目（支持多产品）
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<{ id: string; productId: string; quantity: number; purchasePrice: number }[]>([]);

  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const bizConfig: Record<string, any> = {
    'PURCHASE_ORDER': { label: '采购订单', color: 'bg-indigo-600', partnerLabel: '供应商', prefix: 'PO', hideWarehouse: true },
    'PURCHASE_BILL': { label: '采购单', color: 'bg-emerald-600', partnerLabel: '供应商', prefix: 'PB' },
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
    const existingForPartner = records.filter((r: any) => r.type === 'PURCHASE_ORDER' && r.partner === form.partner);
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`PO-${partnerCode}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `PO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  const handleSaveManual = (submitType: string) => {
    if (submitType === 'PURCHASE_ORDER') {
      if (!form.partner || purchaseOrderItems.length === 0 || purchaseOrderItems.every(i => !i.productId || !i.quantity)) return;
      const docNumber = form.docNumber?.trim() || generatePODocNumber();
      const timestamp = new Date().toLocaleString();
      purchaseOrderItems.forEach((item, idx) => {
        if (!item.productId || !item.quantity) return;
        const amount = (item.quantity || 0) * (item.purchasePrice || 0);
        onAddRecord({
          id: `psi-po-${Date.now()}-${idx}`,
          type: 'PURCHASE_ORDER',
          docNumber,
          timestamp,
          partner: form.partner,
          partnerId: form.partnerId,
          productId: item.productId,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice || 0,
          amount,
          dueDate: form.dueDate,
          note: form.note,
          operator: '张主管'
        });
      });
      setShowModal(null);
      resetForm();
      return;
    }

    const systemQty = submitType === 'STOCKTAKE' ? getStock(form.productId, form.warehouseId) : 0;
    const prefix = bizConfig[submitType]?.prefix || (submitType === 'TRANSFER' ? 'TR' : 'DOC');
    const docNumber = form.docNumber || `${prefix}-${Date.now().toString().slice(-6)}`;

    const newRec = {
      id: `psi-${Date.now()}`,
      type: submitType,
      docNumber, 
      timestamp: new Date().toLocaleString(),
      ...form,
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

  // 过滤出未完全入库的订单明细
  const pendingPOs = useMemo(() => {
    return Object.entries(allPOByGroups).filter(([docNum, items]) => {
      const isConverted = records.some(r => r.type === 'PURCHASE_BILL' && (r.sourceOrderNumber === docNum || (r.combinedFrom && r.combinedFrom.includes(docNum))));
      return !isConverted;
    });
  }, [allPOByGroups, records]);

  // 计算当前已选订单包含的所有待选商品行
  const availableItemsFromSelectedPOs = useMemo(() => {
    const items: any[] = [];
    selectedPOOrderNums.forEach(num => {
      if (allPOByGroups[num]) {
        items.push(...allPOByGroups[num]);
      }
    });
    return items;
  }, [selectedPOOrderNums, allPOByGroups]);

  const handleConvertPOToBill = () => {
    if (selectedPOItemIds.length === 0 || !form.warehouseId) return;

    // 获取选中的具体商品行数据
    const itemsToBill = availableItemsFromSelectedPOs.filter(item => selectedPOItemIds.includes(item.id));

    const todayStr = new Date().toLocaleString();
    const pbDocNumber = form.docNumber || `PB-${Date.now().toString().slice(-6)}`;

    itemsToBill.forEach((item, idx) => {
      onAddRecord({
        ...item,
        id: `psi-pb-${Date.now()}-${idx}`,
        type: 'PURCHASE_BILL',
        docNumber: pbDocNumber,
        sourceOrderNumber: item.docNumber,
        sourceLineId: item.id, // 关联原始行
        warehouseId: form.warehouseId,
        timestamp: todayStr,
        note: form.note || `由订单[${item.docNumber}]商品明细转化`,
        operator: '张主管(订单转化)'
      });
    });

    setShowModal(null);
    resetForm();
    alert(`采购单 ${pbDocNumber} 已成功创建，包含 ${itemsToBill.length} 条入库明细`);
  };

  const resetForm = () => {
    setForm({ productId: '', warehouseId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, actualQuantity: 0, partner: '', partnerId: '', note: '', docNumber: '', dueDate: new Date().toISOString().split('T')[0] });
    setPurchaseOrderItems([]);
    setSelectedPOOrderNums([]);
    setSelectedPOItemIds([]);
    setCreationMethod('MANUAL');
  };

  const addPurchaseOrderItem = () => setPurchaseOrderItems(prev => [...prev, { id: `line-${Date.now()}`, productId: '', quantity: 0, purchasePrice: 0 }]);
  const updatePurchaseOrderItem = (id: string, updates: Partial<{ productId: string; quantity: number; purchasePrice: number }>) => {
    setPurchaseOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const removePurchaseOrderItem = (id: string) => setPurchaseOrderItems(prev => prev.filter(i => i.id !== id));

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
        
        {type !== 'WAREHOUSE_MGMT' && !(type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') && (
          <button onClick={() => { resetForm(); setShowModal(type); }} className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-sm font-bold transition-all shadow-lg ${current.color} shadow-indigo-100`}>
            <Plus className="w-4 h-4" /> 登记新{current.label}
          </button>
        )}
      </div>

      {type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER' ? (
        <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button onClick={() => setShowModal(null)} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <button
              onClick={() => handleSaveManual('PURCHASE_ORDER')}
              disabled={!form.partner || purchaseOrderItems.length === 0 || purchaseOrderItems.every(i => !i.productId || !i.quantity)}
              className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> 确认保存采购订单
            </button>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                <h3 className="text-lg font-bold text-slate-800">1. 采购订单基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望到货日期</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
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
                {purchaseOrderItems.map((line) => (
                  <div key={line.id} className="flex flex-wrap items-end gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                    <div className="flex-1 min-w-[200px]">
                      <ProductSelector options={products} categories={categories} value={line.productId} onChange={(id) => {
                        const prod = products.find(p => p.id === id);
                        updatePurchaseOrderItem(line.id, { productId: id, purchasePrice: prod?.purchasePrice ?? 0 });
                      }} />
                    </div>
                    <div className="w-24 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                      <input type="number" min={0} value={line.quantity || ''} onChange={e => updatePurchaseOrderItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                    </div>
                    <div className="w-28 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                      <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => updatePurchaseOrderItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                    </div>
                    <div className="w-28 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                      <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                        {((line.quantity || 0) * (line.purchasePrice || 0)).toFixed(2)}
                      </div>
                    </div>
                    <button onClick={() => removePurchaseOrderItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                  </div>
                ))}
                {purchaseOrderItems.length === 0 && (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                    <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入采购明细</p>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">单据备注</label>
                <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
              </div>
              <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
                <div className="flex items-center gap-4">
                  <p className="text-xs font-bold opacity-80">采购总量:</p>
                  <p className="text-xl font-black">{purchaseOrderItems.reduce((s, i) => s + (i.quantity || 0), 0)} <span className="text-xs font-medium">PCS</span></p>
                </div>
                <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                  <p className="text-xs font-bold opacity-80">订单金额:</p>
                  <p className="text-xl font-black">¥{purchaseOrderItems.reduce((s, i) => s + (i.quantity || 0) * (i.purchasePrice || 0), 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
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
              const totalQty = docItems.reduce((s, i) => s + i.quantity, 0);
              const isConverted = type === 'PURCHASE_ORDER' && records.some(r => r.type === 'PURCHASE_BILL' && (r.sourceOrderNumber === docNum || (r.combinedFrom && r.combinedFrom.includes(docNum))));

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
                        <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-400 uppercase">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {mainInfo.timestamp}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> 经办: {mainInfo.operator}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据总量</p>
                        <p className="text-lg font-black text-slate-900">{totalQty.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>

                  <div className="px-8 py-4 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                          <th className="pb-3 w-1/2">产品信息 / SKU</th>
                          {!current.hideWarehouse && <th className="pb-3 text-center">入库仓库</th>}
                          {type === 'PURCHASE_ORDER' && <th className="pb-3 text-right">采购价</th>}
                          {type === 'PURCHASE_ORDER' && <th className="pb-3 text-right">金额</th>}
                          <th className="pb-3 text-right">单项数量</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {docItems.map((item: any) => {
                          const product = products.find(p => p.id === item.productId);
                          const warehouse = warehouses.find(w => w.id === item.warehouseId);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                              <td className="py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300"><Package className="w-4 h-4" /></div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-700">{product?.name || '未知产品'}</p>
                                    <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">{product?.sku}</p>
                                  </div>
                                </div>
                              </td>
                              {!current.hideWarehouse && (
                                <td className="py-4 text-center">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-black uppercase border border-slate-100">
                                    {warehouse?.name || '默认库'}
                                  </span>
                                </td>
                              )}
                              {type === 'PURCHASE_ORDER' && (
                                <td className="py-4 text-right">
                                  <span className="text-sm font-bold text-slate-600">¥{(item.purchasePrice ?? 0).toFixed(2)}</span>
                                </td>
                              )}
                              {type === 'PURCHASE_ORDER' && (
                                <td className="py-4 text-right">
                                  <span className="text-sm font-black text-indigo-600">¥{((item.quantity ?? 0) * (item.purchasePrice ?? 0)).toFixed(2)}</span>
                                </td>
                              )}
                              <td className="py-4 text-right">
                                <span className={`text-sm font-black ${type.includes('BILL') ? 'text-indigo-600' : 'text-slate-700'}`}>{item.quantity.toLocaleString()} PCS</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 动态表单弹窗（采购订单使用全页表单，不弹窗） */}
      {showModal && !(type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') && (
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
                   <button onClick={() => setCreationMethod('MANUAL')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                     <Plus className="w-3 h-3" /> 直接手动创建
                   </button>
                   <button onClick={() => setCreationMethod('FROM_ORDER')} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${creationMethod === 'FROM_ORDER' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                     <ClipboardList className="w-3 h-3" /> 引用采购订单生成
                   </button>
                 </div>
               )}

               {creationMethod === 'MANUAL' || showModal !== 'PURCHASE_BILL' ? (
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
                            onChange={(name) => setForm({...form, partner: name})}
                            label={bizConfig[showModal]?.partnerLabel}
                            placeholder={`选择${bizConfig[showModal]?.partnerLabel}...`}
                          />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">关联物料/产品</label>
                        <select value={form.productId} onChange={e => setForm({...form, productId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                          <option value="">点击选择产品...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
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
                                   className={`p-4 rounded-[24px] border-2 text-left transition-all flex items-center justify-between ${isSelected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 bg-slate-50 hover:border-emerald-200'}`}
                                 >
                                    <div>
                                       <p className="text-sm font-black text-slate-800">{docNum}</p>
                                       <p className="text-[10px] text-slate-400 font-bold uppercase">{partnerName}</p>
                                    </div>
                                    {isSelected ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5 text-slate-200" />}
                                 </button>
                               );
                            })}
                         </div>
                       )}
                    </div>

                    {/* 2. 选择具体商品行 */}
                    {selectedPOOrderNums.length > 0 && (
                      <div className="space-y-4 pt-6 border-t border-slate-100 animate-in fade-in">
                         <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListFilter className="w-4 h-4" /> 2. 勾选本次入库明细 (按商品为一行)</h4>
                         <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                               <thead>
                                  <tr className="bg-slate-50/80 border-b border-slate-100">
                                     <th className="px-4 py-3 w-10 text-center">
                                        <button 
                                          onClick={() => {
                                             if (selectedPOItemIds.length === availableItemsFromSelectedPOs.length) setSelectedPOItemIds([]);
                                             else setSelectedPOItemIds(availableItemsFromSelectedPOs.map(i => i.id));
                                          }}
                                          className="text-slate-400 hover:text-emerald-600"
                                        >
                                           {selectedPOItemIds.length === availableItemsFromSelectedPOs.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                        </button>
                                     </th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">源订单 / 商品</th>
                                     <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收数量</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-50">
                                  {availableItemsFromSelectedPOs.map((item) => {
                                     const product = products.find(p => p.id === item.productId);
                                     const isChecked = selectedPOItemIds.includes(item.id);
                                     return (
                                       <tr 
                                         key={item.id} 
                                         onClick={() => setSelectedPOItemIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                                         className={`cursor-pointer transition-colors ${isChecked ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'}`}
                                       >
                                          <td className="px-4 py-3 text-center">
                                             {isChecked ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                                          </td>
                                          <td className="px-4 py-3">
                                             <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-300 uppercase">{item.docNumber}</span>
                                                <span className="text-xs font-bold text-slate-700">{product?.name}</span>
                                                <span className="text-[8px] text-slate-400 uppercase tracking-tighter">SKU: {product?.sku}</span>
                                             </div>
                                          </td>
                                          <td className="px-4 py-3 text-right">
                                             <span className="text-sm font-black text-indigo-600">{item.quantity} PCS</span>
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
                               <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div className="space-y-1">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库至指定仓库 <span className="text-rose-500">*</span></label>
                               <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none">
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
                 <button onClick={() => handleSaveManual(showModal)} disabled={!form.partner || !form.productId || (!current.hideWarehouse && !form.warehouseId)} className={`w-full py-4 text-white rounded-2xl font-bold shadow-xl transition-all active:scale-95 uppercase tracking-widest ${current.color} shadow-indigo-100`}>确认并生成单据</button>
               ) : (
                 <button onClick={handleConvertPOToBill} disabled={selectedPOItemIds.length === 0 || !form.warehouseId} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest flex items-center justify-center gap-2">
                   <ArrowDownToLine className="w-4 h-4" />
                   执行部分/全部合并入库 ({selectedPOItemIds.length}条商品行)
                 </button>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PSIOpsView;