
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  ChevronDown,
  Tag,
  Hash,
  Eye,
  Info,
  Users,
  Cpu,
  Check,
  Wrench,
  UserPlus,
  Box,
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
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { PlanOrder, Product, PlanStatus, ProductCategory, AppDictionaries, ProductVariant, PlanItem, Worker, Equipment, NodeAssignment, GlobalNodeTemplate, BOM, PlanFormSettings, Partner, PartnerCategory } from '../types';
import { sortedVariantColorEntries } from '../utils/sortVariantsByProduct';

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

// 增强型搜索选择器：包含分类标签
const EnhancedProductSelector = ({ 
  options = [], 
  categories = [],
  value, 
  onChange, 
  disabled, 
  placeholder,
  onFilePreview
}: { 
  options: Product[]; 
  categories: ProductCategory[];
  value: string; 
  onChange: (productId: string, categoryId: string) => void; 
  disabled?: boolean; 
  placeholder?: string;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
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
    }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
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
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between disabled:opacity-50 transition-all h-[52px]"
      >
        <div className="flex items-center gap-2 truncate">
          <Package className={`w-4 h-4 ${selectedProduct ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={selectedProduct ? 'text-slate-900 truncate' : 'text-slate-400'}>
            {selectedProduct ? (() => {
              const cat = categories.find(c => c.id === selectedProduct.categoryId);
              const customParts = cat?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file')
                .map(f => {
                  const v = selectedProduct.categoryCustomData?.[f.id];
                  if (v == null || v === '') return null;
                  if (f.type === 'file' && typeof v === 'string' && v.startsWith('data:')) return `${f.label}: 已上传`;
                  return `${f.label}: ${typeof v === 'boolean' ? (v ? '是' : '否') : String(v)}`;
                })
                .filter(Boolean) ?? [];
              const base = `${selectedProduct.name} (${selectedProduct.sku})`;
              return customParts.length > 0 ? `${base} ${customParts.join(' ')}` : base;
            })() : placeholder || '搜索并选择产品型号...'}
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

          {/* 分类过滤器小标签 */}
          <div className="flex items-center gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
            <button 
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
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
            {filteredOptions.map(p => {
              const cat = categories.find(c => c.id === p.categoryId);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    onChange(p.id, p.categoryId || '');
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left p-3 rounded-2xl transition-all border-2 ${
                    p.id === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-0.5">
                    <p className="text-sm font-black truncate">{p.name}</p>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[8px] font-black uppercase">{cat?.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${p.id === value ? 'text-indigo-400' : 'text-slate-400'}`}>{p.sku}</p>
                    {cat?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                      const val = p.categoryCustomData?.[f.id];
                      if (val == null || val === '') return null;
                      if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                        const isImg = val.startsWith('data:image/');
                        const isPdf = val.startsWith('data:application/pdf');
                        if (isImg) return (
                          <span key={f.id} className="inline-flex items-center gap-1">
                            <img src={val} alt={f.label} className="h-5 w-5 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={e => { e.stopPropagation(); onFilePreview?.(val, 'image'); }} />
                            <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                          </span>
                        );
                        if (isPdf) return (
                          <span key={f.id} className="inline-flex items-center gap-1">
                            <button type="button" onClick={e => { e.stopPropagation(); onFilePreview?.(val, 'pdf'); }} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">在线查看</button>
                            <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                          </span>
                        );
                        return (
                          <a key={f.id} href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[8px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                        );
                      }
                      return <span key={f.id} className="text-[8px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                    })}
                  </div>
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

// 计划客户：从合作单位中选择，下拉搜索，下方显示合作单位分类
const PartnerCustomerSelector = ({
  value,
  onChange,
  partners = [],
  categories = [],
  placeholder = '搜索并选择合作单位...'
}: {
  value: string;
  onChange: (customerName: string) => void;
  partners: Partner[];
  categories: PartnerCategory[];
  placeholder?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    return partners.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.contact || '').toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  }, [partners, search, activeTab]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedPartner = partners.find(p => p.name === value);
  const categoryName = selectedPartner?.categoryId ? categories.find(c => c.id === selectedPartner.categoryId)?.name : null;

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">计划客户（合作单位）</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between transition-all h-[52px]"
      >
        <div className="flex items-center gap-2 truncate">
          <Building2 className={`w-4 h-4 flex-shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={value ? 'text-slate-900 truncate' : 'text-slate-400'}>{value || placeholder}</span>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : 'text-slate-400'}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-[100] p-4 animate-in fade-in zoom-in-95">
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="搜索单位名称或联系人..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">合作单位分类</p>
          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            >
              全部
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === cat.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
            {filteredOptions.map(p => {
              const catName = categories.find(c => c.id === p.categoryId)?.name || '未分类';
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.name);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left p-3 rounded-xl transition-all border-2 ${p.name === value ? 'bg-indigo-50 border-indigo-600/30 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-sm font-bold truncate">{p.name}</p>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">{catName}</span>
                  </div>
                  {p.contact && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.contact}</p>}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm">未找到符合条件的合作单位</div>
            )}
          </div>
        </div>
      )}

      {value && (
        <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
          <span className="uppercase tracking-widest text-slate-400">合作单位分类：</span>
          <span>{categoryName || '未分类'}</span>
        </div>
      )}
    </div>
  );
};

const PlanOrderListView: React.FC<PlanOrderListViewProps> = ({ productionLinkMode = 'order', plans, products, categories, dictionaries, workers, equipment, globalNodes, boms, partners, partnerCategories = [], psiRecords = [], planFormSettings, onUpdatePlanFormSettings, onCreatePlan, onSplitPlan, onConvertToOrder, onDeletePlan, onUpdateProduct, onUpdatePlan, onAddPSIRecord, onAddPSIRecordBatch, onCreateSubPlan, onCreateSubPlans }) => {
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
  const [planFormConfigDraft, setPlanFormConfigDraft] = useState<PlanFormSettings | null>(null);
  const [splitPlanId, setSplitPlanId] = useState<string | null>(null);
  const splitNumParts = 2;
  const [splitQuantities, setSplitQuantities] = useState<number[][]>([]);
  /** 点击图片查看大图：url 为要放大的图片地址 */
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');
  /** 计划详情页内锚点：点击小标签滚动到对应类目 */
  const sectionBasicRef = useRef<HTMLDivElement>(null);
  const sectionQtyRef = useRef<HTMLDivElement>(null);
  const sectionProcessRef = useRef<HTMLDivElement>(null);
  const sectionMaterialRef = useRef<HTMLDivElement>(null);

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

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState<{
    categoryId: string;
    productId: string;
    customer: string;
    dueDate: string;
    createdAt: string;
    variantQuantities: Record<string, number>;
    singleQuantity: number;
    customData: Record<string, any>;
  }>({
    categoryId: '',
    productId: '',
    customer: '',
    dueDate: '',
    createdAt: today,
    variantQuantities: {},
    singleQuantity: 0,
    customData: {}
  });

  const selectedProduct = products.find(p => p.id === form.productId);
  const activeCategory = categories.find(c => c.id === form.categoryId);
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

    const getRealStock = (materialId: string) => {
      if (!psiRecords || psiRecords.length === 0) return 0;
      const ins = psiRecords
        .filter(r => r.type === 'PURCHASE_BILL' && r.productId === materialId)
        .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const outs = psiRecords
        .filter(r => r.type === 'SALES_BILL' && r.productId === materialId)
        .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const stocktakeAdjust = psiRecords
        .filter(r => r.type === 'STOCKTAKE' && r.productId === materialId)
        .reduce((s, r) => s + (Number(r.diffQuantity) || 0), 0);
      return ins - outs + stocktakeAdjust;
    };
    
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
    const prod = viewProduct || selectedProduct;
    if (!prod || !prod.variants) return {};
    const groups: Record<string, ProductVariant[]> = {};
    prod.variants.forEach(v => {
      if (!groups[v.colorId]) groups[v.colorId] = [];
      groups[v.colorId].push(v);
    });
    return groups;
  }, [selectedProduct, viewProduct]);

  const productNodes = useMemo(() => {
    const prod = viewProduct || selectedProduct;
    if (!prod || !prod.milestoneNodeIds) return [];
    return prod.milestoneNodeIds
      .map(id => globalNodes.find(gn => gn.id === id))
      .filter((n): n is GlobalNodeTemplate => Boolean(n));
  }, [viewProduct, selectedProduct, globalNodes]);

  /** 按新建顺序生成下一个计划单号：PLN1, PLN2, PLN3...（兼容旧格式 PLN-数字、PLN数字-1 等） */
  const getNextPlanNumber = (): string => {
    const nums = plans
      .map(p => {
        const m = p.planNumber.match(/^PLN-?(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter(n => n > 0);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `PLN${next}`;
  };

  const handleCreate = () => {
    if (!selectedProduct) return;
    if ((selectedProduct.milestoneNodeIds?.length ?? 0) === 0) {
      toast.error("该产品未配置工序，不允许创建生产计划。请先在产品管理中为该产品添加工序。");
      return;
    }
    const items: PlanItem[] = [];
    if (activeCategory?.hasColorSize && selectedProduct.variants && selectedProduct.variants.length > 0) {
      (Object.entries(form.variantQuantities) as [string, number][]).forEach(([vId, qty]) => {
        if (qty > 0) items.push({ variantId: vId, quantity: qty });
      });
    } else {
      if ((form.singleQuantity as number) > 0) items.push({ quantity: form.singleQuantity as number });
    }
    if (items.length === 0) return;

    const newPlan: PlanOrder = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planNumber: getNextPlanNumber(),
      productId: form.productId,
      items,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: form.dueDate,
      status: PlanStatus.APPROVED,
      customer: form.customer,
      priority: 'Medium',
      assignments: {},
      customData: Object.keys(form.customData || {}).length ? form.customData : undefined,
      createdAt: form.createdAt || new Date().toISOString().split('T')[0]
    };
    
    onCreatePlan(newPlan);
    setShowModal(false);
    const nextToday = new Date().toISOString().split('T')[0];
    setForm({ categoryId: '', productId: '', customer: '', dueDate: '', createdAt: nextToday, variantQuantities: {}, singleQuantity: 0, customData: {} });
  };

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

  const updateVariantQty = (vId: string, val: string) => {
    const qty = parseInt(val) || 0;
    setForm(prev => ({
      ...prev,
      variantQuantities: { ...prev.variantQuantities, [vId]: qty }
    }));
  };

  const canSave = useMemo(() => {
    if (!form.productId) return false;
    if (activeCategory?.hasColorSize) return (Object.values(form.variantQuantities) as number[]).some(q => (q as number) > 0);
    return (form.singleQuantity as number) > 0;
  }, [form, activeCategory]);

  const splitPlan = splitPlanId ? plans.find(p => p.id === splitPlanId) : null;
  const openSplit = (plan: PlanOrder) => {
    setSplitPlanId(plan.id);
    setSplitQuantities(plan.items.map(item => [0, item.quantity]));
  };
  const setSplitQty = (itemIndex: number, partIndex: number, value: number) => {
    if (splitPlan && splitNumParts === 2) {
      const original = splitPlan.items[itemIndex]?.quantity ?? 0;
      const clamped = Math.max(0, Math.min(original, value));
      const otherPartIndex = 1 - partIndex;
      const otherValue = original - clamped;
      setSplitQuantities(prev => prev.map((row, i) => {
        if (i !== itemIndex) return row;
        return row.map((v, j) => j === partIndex ? clamped : j === otherPartIndex ? otherValue : v);
      }));
      return;
    }
    setSplitQuantities(prev => prev.map((row, i) => i === itemIndex ? row.map((v, j) => j === partIndex ? value : v) : row));
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

  const splitRowSums = useMemo(() => splitPlan ? splitQuantities.map((row, i) => ({ sum: row.reduce((a, b) => a + b, 0), original: splitPlan.items[i]?.quantity ?? 0 })) : [], [splitPlan, splitQuantities]);
  const splitValid = splitRowSums.length === 0 || splitRowSums.every(({ sum, original }) => sum === original);
  const confirmSplit = () => {
    if (!splitPlanId || !splitPlan || !splitValid) return;
    const newPlans: PlanOrder[] = [];
    for (let j = 0; j < splitNumParts; j++) {
      const partItems = splitPlan.items.map((item, i) => ({ variantId: item.variantId, quantity: splitQuantities[i]?.[j] ?? 0 }));
      if (partItems.every(it => it.quantity === 0)) continue;
      newPlans.push({
        ...splitPlan,
        id: `plan-${Date.now()}-${j}`,
        planNumber: `${splitPlan.planNumber}-${j + 1}`,
        items: partItems,
        assignments: {},
        createdAt: new Date().toISOString().split('T')[0]
      });
    }
    if (newPlans.length < 2) {
      toast.error('请拆成至少两份且每份数量大于 0。');
      return;
    }
    onSplitPlan(splitPlanId, newPlans);
    setSplitPlanId(null);
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">生产计划单</h1>
          <p className="text-slate-500 mt-1 italic text-sm">从需求预测到生产指令的初步规划</p>
        </div>
        {!showModal && (
          <div className="flex items-center gap-3">
            <button onClick={() => { setPlanFormConfigDraft(JSON.parse(JSON.stringify(planFormSettings))); setShowPlanFormConfigModal(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-sm font-bold transition-all border border-slate-200">
              <Sliders className="w-4 h-4" /> 表单配置
            </button>
            <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setForm(prev => ({ ...prev, dueDate: '', createdAt: t })); setShowModal(true); }} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold transition-all shadow-lg shadow-indigo-100">
            <Plus className="w-4 h-4" /> 创建生产计划
          </button>
          </div>
        )}
      </div>

      {!showModal ? (
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
                  <div className="flex items-center gap-6">
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
      ) : (
        <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
          <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
            <button onClick={() => setShowModal(false)} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
              <ArrowLeft className="w-4 h-4" /> 返回列表
            </button>
            <button onClick={handleCreate} disabled={!canSave} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50">
              <Save className="w-4 h-4" /> 确认保存计划单
            </button>
          </div>

          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                <h3 className="text-lg font-bold text-slate-800">1. 计划基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">目标生产品项 (支持搜索与分类筛选)</label>
                  <div className="flex items-stretch gap-4">
                    {selectedProduct && (
                      <div className="shrink-0">
                        {selectedProduct.imageUrl ? (
                          <button type="button" onClick={() => setImagePreviewUrl(selectedProduct.imageUrl!)} className="rounded-xl overflow-hidden border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none block">
                            <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-16 h-16 object-cover block" />
                          </button>
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-slate-200 flex items-center justify-center border border-slate-100"><Package className="w-8 h-8 text-slate-400" /></div>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                  <EnhancedProductSelector 
                    options={products} 
                    categories={categories}
                    value={form.productId} 
                    onChange={(pId, cId) => setForm({ ...form, productId: pId, categoryId: cId, variantQuantities: {}, singleQuantity: 0 })} 
                        onFilePreview={(url, type) => { setFilePreviewUrl(url); setFilePreviewType(type); }}
                  />
                </div>
                </div>
                </div>
                {planFormSettings.standardFields.find(f => f.id === 'customer')?.showInCreate !== false && productionLinkMode !== 'product' && (
                  <PartnerCustomerSelector
                    value={form.customer}
                    onChange={customerName => setForm({ ...form, customer: customerName })}
                    partners={partners}
                    categories={partnerCategories}
                    placeholder="搜索并选择合作单位..."
                  />
                )}
                {planFormSettings.standardFields.find(f => f.id === 'dueDate')?.showInCreate !== false && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望交期截止</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                  <input type="date" value={form.createdAt} onChange={e => setForm({...form, createdAt: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
                {planFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                  <div key={cf.id} className="space-y-1">
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

            {selectedProduct && (
              <div className="pt-10 border-t border-slate-50 space-y-8 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                  <h3 className="text-lg font-bold text-slate-800">2. 生产数量明细录入</h3>
                </div>

                {activeCategory?.hasColorSize && selectedProduct.variants && selectedProduct.variants.length > 0 ? (
                  <div className="space-y-6">
                    {sortedVariantColorEntries(groupedVariants, (viewProduct || selectedProduct)?.colorIds, (viewProduct || selectedProduct)?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries.colors.find(c => c.id === colorId);
                      return (
                        <div key={colorId} className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100 flex flex-col md:flex-row md:items-center gap-8 group hover:border-indigo-200 transition-all overflow-hidden">
                          <div className="flex items-center gap-3 w-40 shrink-0">
                            <div className="w-5 h-5 rounded-full border border-slate-200 shadow-inner" style={{backgroundColor: color?.value}}></div>
                            <span className="text-sm font-black text-slate-700">{color?.name}</span>
                          </div>
                          <div className="flex-1 flex flex-wrap gap-4">
                            {(colorVariants as ProductVariant[]).map(v => {
                              const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                              return (
                                <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                  <span className="text-[10px] font-black text-slate-400 text-center uppercase tracking-tighter">{size?.name}</span>
                                  <input 
                                    type="number" 
                                    placeholder="0"
                                    value={form.variantQuantities[v.id] || ''} 
                                    onChange={e => updateVariantQty(v.id, e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center shadow-sm" 
                                  />
                                </div>
                              )
                            })}
                          </div>
                          <div className="hidden md:block shrink-0 text-right bg-white/60 px-4 py-2 rounded-2xl border border-slate-100">
                             <p className="text-[9px] font-black text-slate-300 uppercase">颜色小计</p>
                             <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (form.variantQuantities[v.id] || 0), 0)}</p>
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100">
                       <div className="flex items-center gap-4">
                          <p className="text-xs font-bold opacity-80">计划生产汇总总量:</p>
                          <p className="text-xl font-black">{(Object.values(form.variantQuantities) as number[]).reduce((s, q) => s + q, 0)} <span className="text-xs font-medium">{getUnitName(form.productId)}</span></p>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-xs space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">计划生产总量 ({getUnitName(form.productId)})</label>
                    <input 
                      type="number" 
                      value={form.singleQuantity || ''} 
                      onChange={e => setForm({...form, singleQuantity: parseInt(e.target.value)||0})} 
                      className="w-full bg-slate-50 border-none rounded-xl py-4 px-6 text-xl font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner" 
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-12 bg-slate-50/30">
               {/* 1. 计划基础信息 */}
               <div ref={sectionBasicRef} className="space-y-6 scroll-mt-4">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">1. 计划基础信息</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                    {planFormSettings.standardFields.find(f => f.id === 'customer')?.showInDetail !== false && productionLinkMode !== 'product' && (
                      <PartnerCustomerSelector
                        value={tempPlanInfo.customer}
                        onChange={customerName => setTempPlanInfo({ ...tempPlanInfo, customer: customerName })}
                        partners={partners}
                        categories={partnerCategories}
                        placeholder="搜索并选择合作单位..."
                      />
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
               <div ref={sectionQtyRef} className="space-y-6 scroll-mt-4">
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
                                    <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
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
               <div ref={sectionProcessRef} className="space-y-6 scroll-mt-4">
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
                         <div key={node.id} className={`flex flex-col md:flex-row md:items-center gap-6 p-6 rounded-[28px] border transition-all ${isAssigned ? 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-50' : 'bg-white/60 border-slate-200'}`}>
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
                                   <div className="flex flex-wrap items-center gap-4 md:gap-6 border-l border-slate-200 pl-4 md:pl-6 min-w-[480px] flex-1">
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
               <div ref={sectionMaterialRef} className="space-y-6 pb-20 scroll-mt-4">
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

                       <div className="space-y-6">
                          {proposedOrders.map(order => (
                            <div key={order.orderNumber} className="bg-white border-2 border-slate-100 p-8 rounded-[40px] shadow-sm relative group hover:border-indigo-400 transition-all overflow-hidden">
                               <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-50 pb-6">
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
                       if (confirm('确定要删除该计划单吗？')) {
                         onDeletePlan(viewPlan.id);
                         setViewDetailPlanId(null);
                       }
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

      {splitPlanId && splitPlan && (() => {
        const splitProduct = products.find(p => p.id === splitPlan.productId);
        const getItemLabel = (item: PlanItem, index: number) => {
          if (item.variantId && splitProduct?.variants) {
            const v = splitProduct.variants.find(x => x.id === item.variantId);
            if (v) {
              const color = dictionaries.colors.find(c => c.id === v.colorId);
              const size = dictionaries.sizes.find(s => s.id === v.sizeId);
              return `${color?.name ?? ''}-${size?.name ?? ''}`.replace(/^-|-$/g, '') || `规格${index + 1}`;
            }
          }
          return '默认';
        };
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSplitPlanId(null)} />
            <div className="relative bg-white w-full max-w-4xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Split className="w-5 h-5 text-amber-500" /> 拆分计划单</h3>
                <button onClick={() => setSplitPlanId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4 overflow-auto">
                <p className="text-sm text-slate-500">输入计划1数量，计划2自动为剩余</p>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格/明细</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">原计划数量</th>
                        {Array.from({ length: splitNumParts }, (_, j) => <th key={j} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">计划{j + 1}数量</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {splitPlan.items.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-sm font-bold text-slate-700">{getItemLabel(item, i)}</td>
                          <td className="px-4 py-3 text-sm font-black text-slate-800 text-right">{item.quantity} {splitPlan ? getUnitName(splitPlan.productId) : 'PCS'}</td>
                          {Array.from({ length: splitNumParts }, (_, j) => {
                            const isAuto = splitNumParts === 2 && j === 1;
                            return (
                              <td key={j} className="px-4 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  readOnly={isAuto}
                                  value={splitQuantities[i]?.[j] ?? 0}
                                  onChange={e => setSplitQty(i, j, Math.max(0, parseInt(e.target.value) || 0))}
                                  className={`w-20 rounded-lg py-1.5 px-2 text-sm font-bold text-right outline-none ${isAuto ? 'bg-slate-100 border border-slate-100 text-slate-500 cursor-default' : 'bg-slate-50 border border-slate-200 text-indigo-600 focus:ring-2 focus:ring-indigo-500'}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!splitValid && <p className="text-rose-600 text-sm font-bold">请确保每一行的「计划数量」之和等于「原计划数量」。</p>}
              </div>
              <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setSplitPlanId(null)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
                <button onClick={confirmSplit} disabled={!splitValid} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"><Split className="w-4 h-4" /> 确认拆分</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 计划单表单配置弹窗 */}
      {showPlanFormConfigModal && planFormConfigDraft && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPlanFormConfigModal(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sliders className="w-5 h-5 text-indigo-500" /> 计划单表单配置</h3>
                <p className="text-xs text-slate-500 mt-1">配置在列表、新增、详情页中显示的字段，可增加自定义项</p>
              </div>
              <button onClick={() => setShowPlanFormConfigModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
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
                      {planFormConfigDraft.standardFields
                        .filter(f => !['product', 'totalQty', 'status', 'priority', 'assignedCount', 'planNumber', ...(productionLinkMode === 'product' ? ['customer'] : [])].includes(f.id))
                        .map(f => (
                        <tr key={f.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
                  <button type="button" onClick={() => setPlanFormConfigDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                    <Plus className="w-3.5 h-3.5" /> 增加
                  </button>
                </div>
                {planFormConfigDraft.customFields.length === 0 ? (
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
                        {planFormConfigDraft.customFields.map(cf => (
                          <tr key={cf.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                            <td className="px-4 py-2">
                              <select value={cf.type || 'text'} onChange={e => {
                                const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                                setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                              }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 align-top">
                              {cf.type === 'select' ? (
                                <div className="min-w-[180px] space-y-1.5">
                                  {(cf.options ?? []).map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-1">
                                      <input type="text" value={opt} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                      <button type="button" onClick={() => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                    <Plus className="w-3.5 h-3.5" /> 添加选项
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2"><button type="button" onClick={() => setPlanFormConfigDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowPlanFormConfigModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
              <button onClick={() => { onUpdatePlanFormSettings(planFormConfigDraft); setShowPlanFormConfigModal(false); setPlanFormConfigDraft(null); }} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">保存配置</button>
            </div>
          </div>
        </div>
      )}

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
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
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
