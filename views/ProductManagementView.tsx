
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Package, 
  Plus, 
  Settings2, 
  Trash2, 
  Save, 
  ArrowLeft,
  X,
  Tag,
  Check,
  FileText,
  DollarSign,
  ShoppingCart,
  Maximize,
  Palette,
  ChevronRight,
  ClipboardCheck,
  Copy,
  LayoutGrid,
  Boxes,
  Zap,
  Hash,
  Search,
  Filter,
  PlusCircle,
  Settings,
  ArrowRight,
  GripVertical,
  Building2,
  ImagePlus,
  Image as ImageIcon,
  Download
} from 'lucide-react';
import { Product, GlobalNodeTemplate, ProductCategory, BOM, BOMItem, AppDictionaries, ProductVariant, DictionaryItem, Partner } from '../types';

function getFileExtFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  if (!m) return 'bin';
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return map[m[1]] || 'bin';
}

interface ProductManagementViewProps {
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  categories: ProductCategory[];
  boms: BOM[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  onUpdateProduct: (product: Product) => void;
  onUpdateBOM: (bom: BOM) => void;
  onUpdateDictionaries: (dicts: AppDictionaries) => void;
  onDetailViewChange?: (inDetail: boolean) => void;
}

const SpecSelectorModal = ({ 
  isOpen, 
  onClose, 
  title, 
  items, 
  selectedIds, 
  onToggle, 
  onAddNew,
  type
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  items: DictionaryItem[]; 
  selectedIds: string[]; 
  onToggle: (id: string) => void;
  onAddNew: (name: string) => void;
  type: 'color' | 'size';
}) => {
  const [search, setSearch] = useState('');
  const filteredItems = items.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
  const exactMatch = items.find(item => item.name === search);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-xl rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">已选择 {selectedIds.length} 项</span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-wrap gap-2 min-h-[60px]">
            {selectedIds.map(id => {
              const item = items.find(i => i.id === id);
              return (
                <div key={id} className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in zoom-in-50">
                  {item?.name}
                  <button onClick={() => onToggle(id)}><X className="w-3 h-3" /></button>
                </div>
              );
            })}
            {selectedIds.length === 0 && <span className="text-slate-300 text-xs italic m-auto">暂未选择任何规格值</span>}
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                autoFocus
                type="text" 
                placeholder={`搜索${type === 'color' ? '颜色' : '尺码'}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold text-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            {search && !exactMatch && (
              <button 
                onClick={() => { onAddNew(search); setSearch(''); }}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-black transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" /> 新增 "{search}"
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {filteredItems.map(item => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <button 
                  key={item.id}
                  onClick={() => onToggle(item.id)}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all group ${
                    isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-50 bg-white hover:border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {type === 'color' && <div className="w-4 h-4 rounded-full border border-slate-200" style={{backgroundColor: item.value}}></div>}
                    <span className="text-sm font-bold">{item.name}</span>
                  </div>
                  {isSelected && <Check className="w-5 h-5 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-8 bg-slate-50/50 border-t border-slate-50">
          <button onClick={onClose} className="w-full py-4 bg-indigo-600 text-white rounded-[20px] font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all">确认选择 ({selectedIds.length})</button>
        </div>
      </div>
    </div>
  );
};

// 与创建生产计划中「搜索并选择产品型号」一致：触发样式、绝对定位下拉、输入框显示自定义内容（含分类自定义字段）
const SearchableProductSelect = ({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  categories = []
}: {
  options: Product[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  categories?: ProductCategory[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = options.find(p => p.id === value);

  const filteredOptions = useMemo(() => {
    return options.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
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
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border-none rounded-xl py-3.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none flex items-center justify-between disabled:opacity-50 transition-all min-h-[48px]"
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          <Package className={`w-4 h-4 shrink-0 ${selectedProduct ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={`text-xs font-bold truncate ${selectedProduct ? 'text-slate-900' : 'text-slate-400'}`}>
            {selectedProduct
              ? (() => {
                  const cat = categories.find(c => c.id === selectedProduct.categoryId);
                  const customParts =
                    cat?.customFields
                      ?.map(f => {
                        const v = selectedProduct.categoryCustomData?.[f.id];
                        if (v == null || v === '') return null;
                        if (f.type === 'file') return `${f.label}: 已上传`;
                        return `${f.label}: ${typeof v === 'boolean' ? (v ? '是' : '否') : String(v)}`;
                      })
                      .filter(Boolean) ?? [];
                  const base = `${selectedProduct.name} (${selectedProduct.sku})`;
                  return customParts.length > 0 ? `${base} ${customParts.join(' ')}` : base;
                })()
              : placeholder || '搜索并选择产品型号...'}
          </span>
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-90' : 'text-slate-400'}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95">
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
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            >
              全部
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
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
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left p-3 rounded-2xl transition-all border-2 ${
                    p.id === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-0.5">
                    <p className="text-sm font-black truncate">{p.name}</p>
                    {cat && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[8px] font-black uppercase shrink-0">{cat.name}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${p.id === value ? 'text-indigo-400' : 'text-slate-400'}`}>{p.sku}</p>
                    {cat?.customFields
                      ?.map(f => {
                        const val = p.categoryCustomData?.[f.id];
                        if (val == null || val === '') return null;
                        if (f.type === 'file') return (
                          <span key={f.id} className="text-[8px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: 已上传</span>
                        );
                        return (
                          <span key={f.id} className="text-[8px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">
                            {f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}
                          </span>
                        );
                      })}
                  </div>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="py-10 text-center">
                <Package className="w-8 h-8 text-slate-100 mx-auto mb-2 block" />
                <p className="text-xs text-slate-400 font-medium">未找到符合条件的产品</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// 使用 Portal 的下拉选择（避免被 overflow 裁剪）
const PortalSelect = ({ value, onChange, options, optionPairs, placeholder = '请选择...', className = '', compact = false }: { 
  value: string; onChange: (v: string) => void; 
  options?: string[]; 
  optionPairs?: { value: string; label: string }[];
  placeholder?: string; 
  className?: string;
  compact?: boolean; // 紧凑模式：下拉选项为单行高度
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const items = optionPairs ?? (options || []).map(o => ({ value: o, label: o }));
  const displayLabel = value ? (items.find(i => i.value === value)?.label ?? value) : placeholder;
  const optionCls = compact ? 'px-3 py-1.5 text-xs font-bold' : 'px-4 py-2 text-sm font-bold';

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setStyle({ position: 'fixed' as const, top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 });
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || (e.target as Element)?.closest?.('[data-portal-select]')) return;
      setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div className="relative">
      <button ref={triggerRef} type="button" onClick={() => setIsOpen(!isOpen)} className={className || 'w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none text-left flex items-center justify-between'}>
        <span>{displayLabel}</span>
        <ChevronRight className={`w-4 h-4 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div data-portal-select className={`bg-white border border-slate-200 rounded-xl shadow-xl ${compact ? 'py-0.5' : 'py-1'} max-h-48 overflow-y-auto`} style={style}>
          <button type="button" onClick={() => { onChange(''); setIsOpen(false); }} className={`w-full text-left hover:bg-slate-50 text-slate-500 ${optionCls}`}>{placeholder}</button>
          {items.map(item => (
            <button key={item.value} type="button" onClick={() => { onChange(item.value); setIsOpen(false); }} className={`w-full text-left hover:bg-slate-50 ${value === item.value ? 'bg-indigo-50 text-indigo-600' : 'text-slate-800'} ${optionCls}`}>{item.label}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

const ProductManagementView: React.FC<ProductManagementViewProps> = ({ 
  products, 
  globalNodes, 
  categories,
  boms,
  dictionaries,
  partners,
  onUpdateProduct, 
  onUpdateBOM,
  onUpdateDictionaries,
  onDetailViewChange
}) => {
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>(categories[0]?.id || 'cat-material');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [workingProduct, setWorkingProduct] = useState<Product | null>(null);
  
  const [modalType, setModalType] = useState<'color' | 'size' | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [activeVariantIdForBOM, setActiveVariantIdForBOM] = useState<string | null>(null);
  const [activeNodeIdForBOM, setActiveNodeIdForBOM] = useState<string | null>(null);
  const [workingBOM, setWorkingBOM] = useState<BOM | null>(null);
  const [copyBOMDropdownOpen, setCopyBOMDropdownOpen] = useState(false);
  const [copyBOMDropdownStyle, setCopyBOMDropdownStyle] = useState<React.CSSProperties>({});
  const copyBOMTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (copyBOMDropdownOpen && copyBOMTriggerRef.current) {
      const rect = copyBOMTriggerRef.current.getBoundingClientRect();
      setCopyBOMDropdownStyle({ position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right, width: 256, zIndex: 9999 });
    }
  }, [copyBOMDropdownOpen]);

  useEffect(() => {
    if (!activeVariantIdForBOM || !activeNodeIdForBOM) setCopyBOMDropdownOpen(false);
  }, [activeVariantIdForBOM, activeNodeIdForBOM]);

  useEffect(() => {
    onDetailViewChange?.(!!(editingProductId && workingProduct));
  }, [editingProductId, workingProduct, onDetailViewChange]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (copyBOMTriggerRef.current?.contains(t) || (e.target as Element)?.closest?.('[data-portal-copy-bom]')) return;
      setCopyBOMDropdownOpen(false);
    };
    if (copyBOMDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [copyBOMDropdownOpen]);

  const activeCategory = categories.find(c => c.id === (workingProduct?.categoryId || activeCategoryFilter));

  const generateVariants = (colorIds: string[], sizeIds: string[], existingVariants: ProductVariant[]): ProductVariant[] => {
    if (colorIds.length === 0 && sizeIds.length === 0) return [];
    const colors = colorIds.length > 0 ? colorIds : ['none'];
    const sizes = sizeIds.length > 0 ? sizeIds : ['none'];
    const newVariants: ProductVariant[] = [];
    colors.forEach(cId => {
      sizes.forEach(sId => {
        const existing = existingVariants.find(v => v.colorId === cId && v.sizeId === sId);
        if (existing) {
          newVariants.push(existing);
        } else {
          const colorName = dictionaries.colors.find(c => c.id === cId)?.name || '';
          const sizeName = dictionaries.sizes.find(s => s.id === sId)?.name || '';
          newVariants.push({
            id: `v-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            colorId: cId, sizeId: sId,
            skuSuffix: `${colorName}${colorName && sizeName ? '-' : ''}${sizeName}`,
            nodeBOMs: {}
          });
        }
      });
    });
    return newVariants;
  };

  useEffect(() => {
    if (workingProduct && activeCategory?.hasColorSize) {
      const newVariants = generateVariants(workingProduct.colorIds, workingProduct.sizeIds, workingProduct.variants);
      const currentHash = workingProduct.variants.map(v => `${v.colorId}-${v.sizeId}`).sort().join(',');
      const nextHash = newVariants.map(v => `${v.colorId}-${v.sizeId}`).sort().join(',');
      if (currentHash !== nextHash) setWorkingProduct({ ...workingProduct, variants: newVariants });
    }
  }, [workingProduct?.colorIds, workingProduct?.sizeIds]);

  const toggleAttribute = (type: 'color' | 'size', id: string) => {
    if (!workingProduct) return;
    const key = type === 'color' ? 'colorIds' : 'sizeIds';
    const current = [...workingProduct[key]];
    const index = current.indexOf(id);
    if (index > -1) current.splice(index, 1);
    else current.push(id);
    setWorkingProduct({ ...workingProduct, [key]: current });
  };

  const handleAddNewSpec = (type: 'colors' | 'sizes', name: string) => {
    const newId = `${type === 'colors' ? 'c' : 's'}-${Date.now()}`;
    const newItem: DictionaryItem = { id: newId, name, value: type === 'colors' ? '#ccc' : name };
    const newDicts = { ...dictionaries, [type]: [...dictionaries[type], newItem] };
    onUpdateDictionaries(newDicts);
    if (workingProduct) {
      const key = type === 'colors' ? 'colorIds' : 'sizeIds';
      setWorkingProduct({ ...workingProduct, [key]: [...workingProduct[key], newId] });
    }
  };

  const handleStartEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setWorkingProduct(JSON.parse(JSON.stringify(p)));
    setActiveVariantIdForBOM(null);
    setActiveNodeIdForBOM(null);
  };

  const handleStartCreateProduct = () => {
    const newId = `p-${Date.now()}`;
    setEditingProductId(newId);
    setWorkingProduct({
      id: newId, sku: '', name: '新产品名称',
      categoryId: activeCategoryFilter, milestoneNodeIds: [],
      categoryCustomData: {}, salesPrice: 0, purchasePrice: 0,
      unitId: (dictionaries.units ?? [])[0]?.id ?? '',
      colorIds: [], sizeIds: [], variants: [], imageUrl: ''
    });
  };

  const saveProduct = () => {
    if (workingProduct) {
      const toSave: Product = {
        ...workingProduct,
        salesPrice: workingProduct.salesPrice ?? 0,
        purchasePrice: workingProduct.purchasePrice ?? 0,
      };
      onUpdateProduct(toSave);
      setEditingProductId(null);
    }
  };

  const toggleNodeInProduct = (nodeId: string) => {
    if (!workingProduct) return;
    const current = [...workingProduct.milestoneNodeIds];
    const index = current.indexOf(nodeId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(nodeId);
    }
    setWorkingProduct({ ...workingProduct, milestoneNodeIds: current });
  };

  const moveNode = (fromIdx: number, toIdx: number) => {
    if (!workingProduct) return;
    const current = [...workingProduct.milestoneNodeIds];
    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved);
    setWorkingProduct({ ...workingProduct, milestoneNodeIds: current });
  };

  const updateNodeRate = (nodeId: string, value: number) => {
    if (!workingProduct) return;
    setWorkingProduct({ ...workingProduct, nodeRates: { ...workingProduct.nodeRates, [nodeId]: value } });
  };

  // --- BOM 逻辑 ---
  const openBOMEditor = (variant: ProductVariant, nodeId: string) => {
    setActiveVariantIdForBOM(variant.id);
    setActiveNodeIdForBOM(nodeId);
    const existingBOM = boms.find(b => b.variantId === variant.id && b.nodeId === nodeId);
    if (existingBOM) {
      setWorkingBOM(JSON.parse(JSON.stringify(existingBOM)));
    } else {
      const nodeName = globalNodes.find(n => n.id === nodeId)?.name;
      setWorkingBOM({
        id: `bom-${Date.now()}`,
        name: `${workingProduct?.name} [${nodeName}]`,
        parentProductId: workingProduct!.id,
        variantId: variant.id,
        nodeId: nodeId,
        version: 'V1.0',
        items: []
      });
    }
  };

  const saveBOM = () => {
    if (workingBOM && workingProduct && activeVariantIdForBOM && activeNodeIdForBOM) {
      onUpdateBOM(workingBOM);
      if (activeVariantIdForBOM.startsWith('single-')) {
        setActiveVariantIdForBOM(null);
        setActiveNodeIdForBOM(null);
        setWorkingBOM(null);
        return;
      }
      const updatedVariants = workingProduct.variants.map(v => {
        if (v.id === activeVariantIdForBOM) {
          const nodeBOMs = { ...(v.nodeBOMs || {}), [activeNodeIdForBOM]: workingBOM.id };
          return { ...v, nodeBOMs };
        }
        return v;
      });
      setWorkingProduct({ ...workingProduct, variants: updatedVariants });
      setActiveVariantIdForBOM(null);
      setActiveNodeIdForBOM(null);
      setWorkingBOM(null);
    }
  };

  const copyBOMFrom = (sourceVariantId: string) => {
    const sourceBOM = boms.find(b => b.variantId === sourceVariantId && b.nodeId === activeNodeIdForBOM);
    if (sourceBOM && workingBOM) {
      setWorkingBOM({ ...workingBOM, items: JSON.parse(JSON.stringify(sourceBOM.items)) });
    }
  };

  const updateBOMItem = (idx: number, updates: Partial<BOMItem>) => {
    if (!workingBOM) return;
    const newItems = [...workingBOM.items];
    newItems[idx] = { ...newItems[idx], ...updates };
    setWorkingBOM({ ...workingBOM, items: newItems });
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.categoryId === activeCategoryFilter);
  }, [products, activeCategoryFilter]);

  // 分组变体：按颜色分组
  const groupedVariants = useMemo(() => {
    if (!workingProduct) return {};
    const groups: Record<string, ProductVariant[]> = {};
    workingProduct.variants.forEach(v => {
      if (!groups[v.colorId]) groups[v.colorId] = [];
      groups[v.colorId].push(v);
    });
    return groups;
  }, [workingProduct?.variants]);

  if (editingProductId && workingProduct) {
    const nodeIds = (workingProduct.milestoneNodeIds as string[]);
    const selectedNodesOrdered = nodeIds.map(id => globalNodes.find(gn => gn.id === id)).filter(Boolean) as GlobalNodeTemplate[];
    const enabledBOMNodes = selectedNodesOrdered.filter(n => n.hasBOM);

    const singleSkuVariantId = `single-${workingProduct.id}`;
    const singleSkuNodeBOMs: Record<string, string> = Object.fromEntries(
      boms.filter(b => b.parentProductId === workingProduct.id && b.variantId === singleSkuVariantId && b.nodeId).map(b => [b.nodeId!, b.id])
    );
    const availableBOMSources = workingProduct.variants.filter(srcV => {
      if (!activeVariantIdForBOM || !activeNodeIdForBOM) return false;
      return srcV.id !== activeVariantIdForBOM && srcV.nodeBOMs && srcV.nodeBOMs[activeNodeIdForBOM];
    });

    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-32">
        <SpecSelectorModal 
          isOpen={modalType === 'color'} 
          onClose={() => setModalType(null)} title="选取款式生产颜色" type="color"
          items={dictionaries.colors} selectedIds={workingProduct.colorIds}
          onToggle={(id) => toggleAttribute('color', id)} onAddNew={(name) => handleAddNewSpec('colors', name)}
        />
        <SpecSelectorModal 
          isOpen={modalType === 'size'} 
          onClose={() => setModalType(null)} title="选取款式生产尺码" type="size"
          items={dictionaries.sizes} selectedIds={workingProduct.sizeIds}
          onToggle={(id) => toggleAttribute('size', id)} onAddNew={(name) => handleAddNewSpec('sizes', name)}
        />

        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button onClick={() => setEditingProductId(null)} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <button onClick={saveProduct} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
            <Save className="w-4 h-4" /> 保存产品资料
          </button>
        </div>

        {/* 1. 核心档案 */}
        <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
            <h3 className="text-lg font-bold text-slate-800">1. 核心业务档案</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="md:col-span-2 space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">业务分类</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => setWorkingProduct({...workingProduct, categoryId: cat.id})} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-2 ${workingProduct.categoryId === cat.id ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm' : 'border-slate-50 bg-slate-50 text-slate-400'}`}>{cat.name}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">产品全称</label>
              <input type="text" value={workingProduct.name} onChange={e => setWorkingProduct({...workingProduct, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">产品编号</label>
              <input type="text" value={workingProduct.sku} onChange={e => setWorkingProduct({...workingProduct, sku: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">产品单位</label>
              <select value={workingProduct.unitId ?? ''} onChange={e => setWorkingProduct({...workingProduct, unitId: e.target.value || undefined})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">请选择单位</option>
                {(dictionaries.units ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {/* 产品图片 */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">产品图片</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-slate-200 flex-shrink-0">
                  {workingProduct.imageUrl ? (
                    <div className="relative w-full h-full group">
                      <button type="button" onClick={() => setLightboxImageUrl(workingProduct.imageUrl || null)} className="absolute inset-0 w-full h-full flex items-center justify-center p-0 border-0 cursor-zoom-in">
                        <img src={workingProduct.imageUrl} alt={workingProduct.name} className="w-full h-full object-cover pointer-events-none" />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setWorkingProduct({...workingProduct, imageUrl: ''}); }} className="absolute top-0.5 right-0.5 w-6 h-6 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    id="product-image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.type.startsWith('image/')) {
                        const r = new FileReader();
                        r.onload = () => setWorkingProduct({...workingProduct, imageUrl: r.result as string});
                        r.readAsDataURL(f);
                      }
                      e.target.value = '';
                    }}
                  />
                  <label htmlFor="product-image-upload" className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-100 transition-all w-fit">
                    <ImagePlus className="w-4 h-4" /> 上传图片
                  </label>
                  <span className="text-[10px] text-slate-400">支持 JPG、PNG、GIF，建议尺寸 200×200</span>
                </div>
              </div>
            </div>

            {/* 价格与供应商管理 */}
            {(activeCategory?.hasSalesPrice || activeCategory?.hasPurchasePrice) && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                 {activeCategory.hasSalesPrice && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">标准销售单价 (CNY)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input type="number" value={workingProduct.salesPrice} onChange={e => setWorkingProduct({...workingProduct, salesPrice: parseFloat(e.target.value)||0})} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                    </div>
                 )}
                 {activeCategory.hasPurchasePrice && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">参考采购单价 (CNY)</label>
                        <div className="relative">
                          <ShoppingCart className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                          <input type="number" value={workingProduct.purchasePrice} onChange={e => setWorkingProduct({...workingProduct, purchasePrice: parseFloat(e.target.value)||0})} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">首选供应商 (档案关联)</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 z-10 pointer-events-none" />
                          <PortalSelect
                            value={workingProduct.supplierId || ''}
                            onChange={v => setWorkingProduct({...workingProduct, supplierId: v})}
                            optionPairs={partners.map(s => ({ value: s.id, label: s.name }))}
                            placeholder="未关联供应商"
                            className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none text-left flex items-center justify-between"
                          />
                        </div>
                      </div>
                    </>
                 )}
              </div>
            )}

            {activeCategory?.customFields && activeCategory.customFields.length > 0 && (
              <div className="md:col-span-2 pt-6 border-t border-slate-50 mt-4 space-y-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1 flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5" /> 分类专用扩展属性
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeCategory.customFields.map(field => (
                    <div key={field.id} className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5 ml-1 tracking-widest">
                        {field.label} {field.required && <span className="text-rose-500">*</span>}
                      </label>
                      {field.type === 'text' && (
                        <input 
                          type="text" 
                          value={workingProduct.categoryCustomData?.[field.id] || ''} 
                          onChange={e => setWorkingProduct({
                            ...workingProduct, 
                            categoryCustomData: { ...workingProduct.categoryCustomData, [field.id]: e.target.value }
                          })}
                          className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                        />
                      )}
                      {field.type === 'number' && (
                        <input 
                          type="number" 
                          value={workingProduct.categoryCustomData?.[field.id] || ''} 
                          onChange={e => setWorkingProduct({
                            ...workingProduct, 
                            categoryCustomData: { ...workingProduct.categoryCustomData, [field.id]: parseFloat(e.target.value) || 0 }
                          })}
                          className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                        />
                      )}
                      {field.type === 'select' && (
                        <PortalSelect
                          value={workingProduct.categoryCustomData?.[field.id] || ''}
                          onChange={v => setWorkingProduct({
                            ...workingProduct,
                            categoryCustomData: { ...workingProduct.categoryCustomData, [field.id]: v }
                          })}
                          options={field.options || []}
                          placeholder="请选择..."
                          className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none text-left flex items-center justify-between"
                        />
                      )}
                      {field.type === 'boolean' && (
                        <div className="flex items-center gap-3 py-2 px-1">
                          <button 
                            onClick={() => setWorkingProduct({
                              ...workingProduct,
                              categoryCustomData: { ...workingProduct.categoryCustomData, [field.id]: !workingProduct.categoryCustomData?.[field.id] }
                            })}
                            className={`w-10 h-5 rounded-full relative transition-all duration-200 ${workingProduct.categoryCustomData?.[field.id] ? 'bg-indigo-600' : 'bg-slate-300'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow-sm ${workingProduct.categoryCustomData?.[field.id] ? 'left-5.5' : 'left-0.5'}`}></div>
                          </button>
                          <span className="text-[10px] font-bold text-slate-500">{workingProduct.categoryCustomData?.[field.id] ? '是' : '否'}</span>
                        </div>
                      )}
                      {field.type === 'file' && (
                        <div className="space-y-2">
                          <input
                            ref={el => { fileInputRefs.current[field.id] = el; }}
                            type="file"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const maxSize = 5 * 1024 * 1024; // 5MB
                              if (file.size > maxSize) {
                                alert('文件大小不能超过 5MB');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                const dataUrl = reader.result as string;
                                setWorkingProduct({
                                  ...workingProduct,
                                  categoryCustomData: { ...workingProduct.categoryCustomData, [field.id]: dataUrl }
                                });
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }}
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            {workingProduct.categoryCustomData?.[field.id] ? (
                              <>
                                {String(workingProduct.categoryCustomData[field.id]).startsWith('data:image/') ? (
                                  <>
                                    <img
                                      src={workingProduct.categoryCustomData[field.id] as string}
                                      alt={field.label}
                                      className="h-16 w-16 object-cover rounded-xl border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                                      onClick={() => { setFilePreviewUrl(workingProduct.categoryCustomData![field.id] as string); setFilePreviewType('image'); }}
                                    />
                                    <a href={workingProduct.categoryCustomData[field.id] as string} download={`附件.${getFileExtFromDataUrl(workingProduct.categoryCustomData[field.id] as string)}`} className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                                      <Download className="w-4 h-4" /> 下载
                                    </a>
                                  </>
                                ) : String(workingProduct.categoryCustomData[field.id]).startsWith('data:application/pdf') ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => { setFilePreviewUrl(workingProduct.categoryCustomData![field.id] as string); setFilePreviewType('pdf'); }}
                                      className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                                    >
                                      <FileText className="w-4 h-4" /> 在线查看
                                    </button>
                                    <a href={workingProduct.categoryCustomData[field.id] as string} download={`附件.${getFileExtFromDataUrl(workingProduct.categoryCustomData[field.id] as string)}`} className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                                      <Download className="w-4 h-4" /> 下载
                                    </a>
                                  </>
                                ) : (
                                  <a href={workingProduct.categoryCustomData[field.id] as string} download={`附件.${getFileExtFromDataUrl(workingProduct.categoryCustomData[field.id] as string)}`} className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                                    <Download className="w-4 h-4" /> 下载
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setWorkingProduct({
                                    ...workingProduct,
                                    categoryCustomData: { ...workingProduct.categoryCustomData, [field.id]: '' }
                                  })}
                                  className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold hover:bg-rose-100"
                                >
                                  删除
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => fileInputRefs.current[field.id]?.click()}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                              >
                                <ImagePlus className="w-4 h-4" /> 上传文件
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. 颜色尺码配置 */}
        {activeCategory?.hasColorSize && (
          <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-[160px_1fr] divide-x divide-slate-100">
               <div className="px-10 py-6 bg-slate-50/50 text-sm font-bold text-slate-400 flex items-center justify-center">规格名</div>
               <div className="px-10 py-6 bg-slate-50/50 text-sm font-bold text-slate-400 flex items-center">已选规格值</div>
               
               <div className="px-10 py-10 flex items-center justify-center text-sm font-bold text-slate-700">颜色</div>
               <div className="px-10 py-10 flex items-center gap-6 group">
                  <button onClick={() => setModalType('color')} className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all">
                    <Filter className="w-5 h-5" />
                    <div className="flex flex-col gap-0.5 mt-1">
                      <div className="w-3 h-0.5 bg-white/40 rounded-full"></div>
                      <div className="w-2 h-0.5 bg-white/40 rounded-full mx-auto"></div>
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {workingProduct.colorIds.map(id => {
                      const c = dictionaries.colors.find(i => i.id === id);
                      return (
                        <span key={id} className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{backgroundColor: c?.value}}></div>
                          {c?.name}
                        </span>
                      );
                    })}
                    {workingProduct.colorIds.length === 0 && <span className="text-slate-300 text-sm font-medium italic">点击图标开启颜色选择器</span>}
                  </div>
               </div>

               <div className="px-10 py-10 flex items-center justify-center text-sm font-bold text-slate-700">尺寸</div>
               <div className="px-10 py-10 flex items-center gap-6 group">
                  <button onClick={() => setModalType('size')} className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all">
                    <Filter className="w-5 h-5" />
                    <div className="flex flex-col gap-0.5 mt-1">
                      <div className="w-3 h-0.5 bg-white/40 rounded-full"></div>
                      <div className="w-2 h-0.5 bg-white/40 rounded-full mx-auto"></div>
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {workingProduct.sizeIds.map(id => {
                      const s = dictionaries.sizes.find(s => s.id === id);
                      return (
                        <span key={id} className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-600">{s?.name}</span>
                      );
                    })}
                    {workingProduct.sizeIds.length === 0 && <span className="text-slate-300 text-sm font-medium italic">点击图标开启尺寸选择器</span>}
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* 3. 生产工序与工艺 BOM */}
        {activeCategory?.hasProcess && (
          <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><ClipboardCheck className="w-5 h-5" /></div>
              <h3 className="text-lg font-bold text-slate-800">2. 生产工序与工艺 BOM</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
               <div className="space-y-6">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">可用工序库 (点击选择)</h4>
                 <div className="grid grid-cols-2 gap-3">
                   {globalNodes.map(gn => {
                     const isSelected = workingProduct.milestoneNodeIds.includes(gn.id);
                     return (
                       <div key={gn.id} onClick={() => toggleNodeInProduct(gn.id)} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group ${isSelected ? 'border-indigo-600 bg-indigo-50/40' : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'}`}>
                         <span className={`text-xs font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-500'}`}>{gn.name}</span>
                         {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                       </div>
                     );
                   })}
                 </div>
               </div>

               <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">标准生产路线序列 (拖拽排序)</h4>
                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">共 {(workingProduct.milestoneNodeIds as string[]).length} 个节点</span>
                 </div>
                 <div className="space-y-2 relative">
                   {selectedNodesOrdered.length > 0 && <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-100 z-0"></div>}
                   {(selectedNodesOrdered as GlobalNodeTemplate[]).map((node, idx) => {
                     return (
                     <div key={node.id} className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm group">
                        <div className="w-6 h-6 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                           <p className="text-xs font-bold text-slate-800 whitespace-nowrap">{node.name}</p>
                           {node.hasBOM && <p className="text-[9px] text-amber-500 font-bold flex items-center gap-1 mt-0.5 whitespace-nowrap"><Boxes className="w-2.5 h-2.5 shrink-0" /> 需配置 BOM 物料</p>}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 shrink-0">
                           {node.enablePieceRate && (
                           <div className="flex items-center gap-2 min-w-[7rem]">
                              <label className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap shrink-0">工价</label>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                placeholder="0"
                                value={workingProduct.nodeRates?.[node.id] ?? ''}
                                onChange={e => updateNodeRate(node.id, parseFloat(e.target.value) || 0)}
                                className="min-w-[5rem] w-20 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              <span className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">元/件</span>
                           </div>
                           )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all w-12 justify-end">
                           {idx > 0 && <button onClick={() => moveNode(idx, idx - 1)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all">↑</button>}
                           {idx < selectedNodesOrdered.length - 1 && <button onClick={() => moveNode(idx, idx + 1)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all">↓</button>}
                        </div>
                     </div>
                   ); })}
                   {selectedNodesOrdered.length === 0 && <div className="py-12 border-2 border-dashed border-slate-100 rounded-3xl text-center text-slate-300 text-xs italic">请从左侧选择需要的生产工序节点</div>}
                 </div>
               </div>
            </div>

            {/* 单 SKU 产品 BOM 配置（未开启颜色尺码时，产品仅 1 种 SKU，仍可配置需 BOM 的工序） */}
            {workingProduct.variants.length === 0 && enabledBOMNodes.length > 0 && (
              <div className="pt-10 border-t border-slate-50 space-y-6">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest block">工序 BOM 配置（单 SKU 产品）</h4>
                <div className="p-6 rounded-3xl border border-slate-100 bg-slate-50/50">
                  <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-200/50">
                    <div>
                      <p className="text-sm font-black text-slate-800">本产品</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">SKU: {workingProduct.sku}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {enabledBOMNodes.map(node => {
                      const hasNodeBOM = !!singleSkuNodeBOMs[node.id];
                      const isEditing = activeVariantIdForBOM === singleSkuVariantId && activeNodeIdForBOM === node.id;
                      const singleSkuVirtualVariant: ProductVariant = { id: singleSkuVariantId, colorId: '', sizeId: '', skuSuffix: workingProduct.sku, nodeBOMs: singleSkuNodeBOMs };
                      return (
                        <button
                          key={node.id}
                          onClick={() => openBOMEditor(singleSkuVirtualVariant, node.id)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border-2 ${isEditing ? 'bg-indigo-600 border-indigo-600 text-white' : (hasNodeBOM ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200')}`}
                        >
                          <Boxes className={`w-3.5 h-3.5 ${isEditing ? 'text-white' : (hasNodeBOM ? 'text-amber-500' : 'text-slate-300')}`} />
                          {node.name} BOM
                          {hasNodeBOM && !isEditing && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 变体 BOM 矩阵配置 (按颜色分组) */}
            {workingProduct.variants.length > 0 && enabledBOMNodes.length > 0 && (
              <div className="pt-10 border-t border-slate-50 space-y-8">
                 <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest block">变体 BOM 精细化配置矩阵</h4>
                    <p className="text-[10px] text-slate-400 font-medium italic">同一颜色的多个尺码在一行显示，支持各工序独立配料</p>
                 </div>

                 <div className="space-y-12">
                    {(Object.entries(groupedVariants) as [string, ProductVariant[]][]).map(([colorId, colorVariants]) => {
                      const color = dictionaries.colors.find(c => c.id === colorId);
                      return (
                        <div key={colorId} className="space-y-4">
                           <div className="flex items-center gap-3 ml-2">
                              <div className="w-4 h-4 rounded-full border border-slate-200" style={{backgroundColor: color?.value}}></div>
                              <h5 className="text-sm font-black text-slate-800 uppercase tracking-widest">颜色: {color?.name}</h5>
                              <span className="text-[10px] text-slate-400 font-bold">({colorVariants.length} 个尺码变体)</span>
                           </div>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {colorVariants.map(v => {
                                 const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                 const nodeBOMs = v.nodeBOMs || {};
                                 const isActiveVar = activeVariantIdForBOM === v.id;
                                 return (
                                   <div key={v.id} className={`p-5 rounded-3xl border transition-all ${isActiveVar ? 'border-indigo-600 bg-indigo-50/40 shadow-xl ring-2 ring-indigo-500/10' : 'bg-slate-50/50 border-slate-100 hover:border-slate-200 hover:bg-white'}`}>
                                      <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-200/50">
                                         <div>
                                            <p className="text-xs font-black text-slate-800">尺码: {size?.name}</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">SKU: {workingProduct.sku}-{v.skuSuffix}</p>
                                         </div>
                                      </div>
                                      <div className="space-y-2">
                                         {enabledBOMNodes.map(node => {
                                           const hasNodeBOM = !!nodeBOMs[node.id];
                                           const isEditing = activeVariantIdForBOM === v.id && activeNodeIdForBOM === node.id;
                                           return (
                                             <button 
                                               key={node.id}
                                               onClick={() => openBOMEditor(v, node.id)}
                                               className={`w-full px-3 py-2 rounded-xl text-[10px] font-bold flex items-center justify-between transition-all border-2 ${isEditing ? 'bg-indigo-600 border-indigo-600 text-white' : (hasNodeBOM ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200')}`}
                                             >
                                                <div className="flex items-center gap-2">
                                                  <Boxes className={`w-3 h-3 ${isEditing ? 'text-white' : (hasNodeBOM ? 'text-amber-500' : 'text-slate-300')}`} />
                                                  {node.name} BOM
                                                </div>
                                                {hasNodeBOM && !isEditing && <Check className="w-3 h-3" />}
                                                {isEditing && <ArrowRight className="w-3 h-3" />}
                                             </button>
                                           );
                                         })}
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
            )}

            {/* 嵌入式 BOM 编辑器（单 SKU 与多变体共用） */}
            {enabledBOMNodes.length > 0 && activeVariantIdForBOM && activeNodeIdForBOM && workingBOM && (() => {
              const activeVariant = workingProduct?.variants.find(v => v.id === activeVariantIdForBOM);
              const isSingleSku = !activeVariant || activeVariantIdForBOM.startsWith('single-');
              const colorName = activeVariant?.colorId ? (dictionaries.colors.find(c => c.id === activeVariant.colorId)?.name ?? '') : '';
              const sizeName = activeVariant?.sizeId ? (dictionaries.sizes.find(s => s.id === activeVariant.sizeId)?.name ?? '') : '';
              const colorSizeLabel = isSingleSku ? '单 SKU（通用）' : [colorName, sizeName].filter(Boolean).join(' / ');
              return (
              <div className="pt-10 border-t border-slate-50">
                <div className="bg-white p-8 rounded-[32px] border-2 border-indigo-600 shadow-[0_32px_64px_-12px_rgba(79,70,229,0.25)] animate-in slide-in-from-top-8 relative z-50">
                      <div className="flex items-center justify-between mb-8">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Boxes className="w-6 h-6" /></div>
                            <div>
                               <h5 className="text-sm font-black text-slate-800 uppercase tracking-widest">配置物料明细</h5>
                               <p className="text-[10px] text-slate-400 font-bold uppercase">{workingBOM.name}</p>
                               <p className="text-[10px] text-indigo-500 font-bold mt-1">
                                  {isSingleSku ? '适用：' : '适用颜色尺码：'}{colorSizeLabel}
                               </p>
                            </div>
                         </div>
                         <div className="flex items-center gap-3">
                            <div className="relative">
                               <button ref={copyBOMTriggerRef} type="button" onClick={() => setCopyBOMDropdownOpen(!copyBOMDropdownOpen)} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-600 hover:bg-white transition-all"><Copy className="w-3.5 h-3.5" /> 复制现有方案</button>
                               {copyBOMDropdownOpen && typeof document !== 'undefined' && createPortal(
                                 <div data-portal-copy-bom className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-2 max-h-48 overflow-y-auto custom-scrollbar" style={copyBOMDropdownStyle}>
                                   {availableBOMSources.map(srcV => (
                                     <button key={srcV.id} type="button" onClick={() => { copyBOMFrom(srcV.id); setCopyBOMDropdownOpen(false); }} className="w-full text-left p-3 hover:bg-indigo-50 rounded-xl text-xs font-bold text-slate-700">{srcV.skuSuffix}</button>
                                   ))}
                                   {availableBOMSources.length === 0 && <p className="text-[10px] text-slate-300 p-4 italic text-center">暂无可复用的配置</p>}
                                 </div>,
                                 document.body
                               )}
                            </div>
                            <button onClick={() => { setActiveVariantIdForBOM(null); setActiveNodeIdForBOM(null); }} className="p-2 text-slate-400 hover:text-slate-600 transition-all"><X className="w-6 h-6" /></button>
                         </div>
                      </div>

                      <div className="space-y-4">
                         {workingBOM.items.map((item, idx) => (
                           <div key={idx} className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6 items-start relative group shadow-sm hover:bg-white hover:border-indigo-100 transition-all">
                              <button onClick={() => {
                                const newItems = [...workingBOM.items];
                                newItems.splice(idx, 1);
                                setWorkingBOM({...workingBOM, items: newItems});
                              }} className="absolute -top-2 -right-2 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-rose-600"><Trash2 className="w-4 h-4" /></button>
                              <div className="space-y-4 min-w-0">
                                 <div>
                                   <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">1. 核心物料/组件 (支持搜索与分类筛选)</label>
                                   <SearchableProductSelect
                                     categories={categories}
                                     value={item.productId}
                                     onChange={val => {
                                       const p = products.find(x => x.id === val);
                                       updateBOMItem(idx, { productId: val, categoryId: p?.categoryId });
                                     }}
                                     options={products.filter(p => p.id !== workingProduct?.id)}
                                     placeholder="搜索并选择产品型号..."
                                   />
                                 </div>
                              </div>
                              <div className="w-full md:w-32">
                                 <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">2. 标准单位用量</label>
                                 <input
                                   type="number"
                                   value={item.quantityInput ?? (Number.isFinite(item.quantity) ? item.quantity : '')}
                                   onChange={e => {
                                     const raw = e.target.value;
                                     const num = raw === '' ? 0 : (parseFloat(raw) || 0);
                                     updateBOMItem(idx, { quantityInput: raw, quantity: num });
                                   }}
                                   className="w-full bg-white border border-slate-100 rounded-xl p-3 text-xs font-bold outline-none text-center"
                                 />
                              </div>
                           </div>
                         ))}
                         <button onClick={() => setWorkingBOM({...workingBOM, items: [...workingBOM.items, { productId: '', quantity: 1 }]})} className="w-full py-5 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold text-xs hover:bg-white hover:border-indigo-400 transition-all flex items-center justify-center gap-2 group"><Plus className="w-4 h-4 group-hover:scale-110 transition-transform" /> 添加物料清单行</button>
                         <div className="flex justify-end pt-6">
                            <button onClick={saveBOM} className="bg-indigo-600 text-white px-12 py-3.5 rounded-2xl font-black text-xs shadow-2xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">保存此节点的 BOM 方案</button>
                         </div>
                      </div>
                </div>
              </div>
            ); })()}
          </div>
        )}
        {/* 图片放大弹窗 */}
        {lightboxImageUrl && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-8" onClick={() => setLightboxImageUrl(null)}>
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
            <button onClick={() => setLightboxImageUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
              <X className="w-8 h-8" />
            </button>
            <img src={lightboxImageUrl} alt="产品图片" className="relative z-10 max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">产品与 BOM 档案中心</h1>
          <p className="text-slate-500 mt-1 italic text-sm">定义业务规则、生产规格与工序物料明细</p>
        </div>
        <button onClick={handleStartCreateProduct} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"><Plus className="w-4 h-4" /> 创建新产品</button>
      </div>

      <div className="flex bg-slate-100/50 p-1 rounded-xl w-fit">
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategoryFilter(cat.id)} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeCategoryFilter === cat.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{cat.name} ({products.filter(p => p.categoryId === cat.id).length})</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.map(product => {
          const category = categories.find(c => c.id === product.categoryId);
          const bomCount = boms.filter(b => b.parentProductId === product.id).length;
          return (
            <div key={product.id} className="bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-2xl hover:border-indigo-400 transition-all group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden text-slate-400 group-hover:text-indigo-50 group-hover:text-indigo-600 transition-all shadow-inner flex-shrink-0">
                  {product.imageUrl ? (
                    <button type="button" onClick={() => setLightboxImageUrl(product.imageUrl)} className="w-full h-full p-0 border-0 cursor-zoom-in flex items-center justify-center"><img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover pointer-events-none" /></button>
                  ) : (
                    <Package className="w-6 h-6" />
                  )}
                </div>
                <button type="button" onClick={() => handleStartEditProduct(product)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors bg-slate-50 rounded-xl"><Settings2 className="w-5 h-5" /></button>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{product.name}</h3>
              <p className="text-[11px] text-slate-400 font-bold mb-4 flex items-center gap-1 uppercase tracking-tighter"><Hash className="w-3 h-3 text-slate-300" /> {product.sku}</p>
              
              {(category?.customFields?.length ?? 0) > 0 && product.categoryCustomData && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {category.customFields.map(field => {
                    const val = product.categoryCustomData?.[field.id];
                    if (val == null || val === '') return null;
                    if (field.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                      const isImg = val.startsWith('data:image/');
                      const isPdf = val.startsWith('data:application/pdf');
                      return (
                        <div key={field.id} className="flex items-center gap-1.5">
                          {isImg ? (
                            <>
                              <img
                                src={val}
                                alt={field.label}
                                className="h-8 w-8 object-cover rounded-lg border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                                onClick={(e) => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('image'); }}
                              />
                              <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-[9px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                                <Download className="w-3 h-3" /> 下载
                              </a>
                            </>
                          ) : isPdf ? (
                            <>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-[9px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                                <FileText className="w-3 h-3" /> 在线查看
                              </button>
                              <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-[9px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                                <Download className="w-3 h-3" /> 下载
                              </a>
                            </>
                          ) : (
                            <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-[9px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">
                              <Download className="w-3 h-3" /> 下载
                            </a>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={field.id} className="px-2 py-1 bg-slate-50 rounded-lg text-[9px] font-bold text-slate-600">
                        {field.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mb-6">
                 <div className="px-2 py-1 bg-blue-50/50 rounded-lg text-[9px] font-bold text-blue-600 uppercase tracking-widest">工序: {product.milestoneNodeIds.length}</div>
                 <div className="px-2 py-1 bg-amber-50/50 rounded-lg text-[9px] font-bold text-amber-600 uppercase tracking-widest">变体: {product.variants.length}</div>
                 {bomCount > 0 && <div className="px-2 py-1 bg-emerald-50/50 rounded-lg text-[9px] font-bold text-emerald-600 uppercase tracking-widest">BOM: {bomCount} 份</div>}
              </div>

              <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                 <div className="flex flex-col">
                    {(() => {
                      const sales = product.salesPrice ?? 0;
                      const purchase = product.purchasePrice ?? 0;
                      const displayPrice = sales > 0 ? sales : purchase;
                      const label = sales > 0 ? '销售' : '采购';
                      return (
                        <span className="text-base font-black text-indigo-600 tracking-tight" title={`${label}价`}>
                          ¥ {displayPrice > 0 ? displayPrice.toLocaleString() : '0'}
                          {displayPrice > 0 && <span className="text-[9px] font-medium text-slate-400 ml-1">{label}</span>}
                        </span>
                      );
                    })()}
                    <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase text-white w-fit mt-1 shadow-sm bg-indigo-600`}>{category?.name}</span>
                 </div>
                 <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          )
        })}
      </div>

      {/* 图片放大弹窗 */}
      {lightboxImageUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8" onClick={() => setLightboxImageUrl(null)}>
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
          <button onClick={() => setLightboxImageUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
            <X className="w-8 h-8" />
          </button>
          <img src={lightboxImageUrl} alt="产品图片" className="relative z-10 max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* 文件预览弹窗 (图片/PDF) */}
      {filePreviewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm" onClick={() => setFilePreviewUrl(null)}>
          <button onClick={() => setFilePreviewUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
            <X className="w-8 h-8" />
          </button>
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {filePreviewType === 'image' ? (
              <img src={filePreviewUrl} alt="预览" className="w-full h-full max-h-[85vh] object-contain" />
            ) : (
              <iframe src={filePreviewUrl} title="PDF 预览" className="w-full h-[85vh] border-0" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagementView;
