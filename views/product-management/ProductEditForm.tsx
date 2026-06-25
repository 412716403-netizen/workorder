
import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
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
  ClipboardCheck,
  LayoutGrid,
  Boxes,
  Zap,
  Hash,
  Search,
  Settings,
  ArrowRight,
  GripVertical,
  ImagePlus,
  Image as ImageIcon,
  Download,
  Upload,
  ListChecks,
  BookOpen,
  Lock,
} from 'lucide-react';
import { Product, GlobalNodeTemplate, ProductCategory, PartnerCategory, BOM, BOMItem, AppDictionaries, ProductVariant, DictionaryItem, Partner, ProductionLinkMode, ProductionOrder } from '../../types';
import { sortVariantsByColorThenSize } from '../../utils/sortVariantsByProduct';
import BomVariantMatrix from '../../components/product/BomVariantMatrix';
import { VariantNodeWeightSettingTrigger } from './VariantNodeWeightSection';
import { getProductScanWeighingNodes } from '../../utils/variantNodeUnitWeight';
import { useTraceabilityPlugin } from '../../hooks/useTraceabilityPlugin';
import { productColorSizeEnabled, validateProductColorSizeSelection } from '../../utils/productColorSize';
import { bomHasConfiguredItems } from '../../utils/bomEffective';
import { isProductBlockedAsBomMaterial } from '../../utils/productBomMaterial';
import { productMatchesSearchQuery } from '../../utils/productSearchMatch';
import {
  getFileExtFromDataUrl,
  parseRouteReportFileUrls,
  stringifyRouteReportFileUrls,
  dataUrlToBlobUrl,
} from '../../utils/routeReportFileUrls';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import { isProductProcessLocked, milestoneNodeIdsEqual } from '../../shared/productProcessLock';
import { isProductEnabled } from '../../utils/productEnabled';
import * as api from '../../services/api';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { SupplierSelect } from '../../components/SupplierSelect';
import { useAuthOptional } from '../../contexts/AuthContext';
import { hasSubPermission } from '../../utils/hasSubPermission';
import BomEditorPortal, { useBomEditorPortalState } from './BomEditorPortal';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';
import { PlanFormKnowledgeInput } from '../../components/PlanFormCustomFieldControls';
import ProductCategoryInfoFields from '../../components/product/ProductCategoryInfoFields';
import {
  readLastUnitByCategoryMap,
  writeLastUnitForCategory,
  resolveDefaultUnitForNewProductCategory,
} from '../../utils/productLastUnitByCategory';
import { resolveProductSkuForSave } from '../../utils/productSkuAutoGen';
import { validateProductCatalogUnique } from '../../utils/productCatalogUnique';
import { findPartnerByName } from '../../utils/partnerNormalize';
import {
  productArchiveFormCardClass,
  productArchiveFormCategoryPillClass,
  productArchiveFormControlClass,
  productArchiveFormControlIconClass,
  productArchiveFormGridGapClass,
  productArchiveFormLabelClass,
  productArchiveFormPartnerTriggerClass,
  productArchiveFormQuickAddBtnClass,
  productArchiveFormSpecPickerClass,
  productArchiveFormStickyBarClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';
import { lazyWithReloadOnChunkError } from '../../utils/lazyWithReloadOnChunkError';

const LazyProductArchiveCreateModal = lazyWithReloadOnChunkError(() => import('../../components/ProductArchiveCreateModal'));

// 产品编号自动生成已外迁，见 utils/productSkuAutoGen.ts

function resolveDefaultPartnerCategoryId(categories: PartnerCategory[]): string {
  return categories.find(c => c.name.includes('供应商'))?.id ?? categories[0]?.id ?? '';
}

// localStorage 偏好读写已外迁，见 utils/productLastUnitByCategory.ts

function normalizeRouteReportValuesFromApi(raw: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [nodeId, fields] of Object.entries(raw as Record<string, unknown>)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    out[nodeId] = {};
    for (const [fieldId, v] of Object.entries(fields as Record<string, unknown>)) {
      if (v == null) continue;
      out[nodeId][fieldId] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  return out;
}

/** 附件预览挂到 document.body，且 z-index 极高，避免产品详情页（另一路 return）未渲染或 stacking 盖住 */
function FilePreviewPortal({
  preview,
  onClose,
}: {
  preview: { src: string; kind: 'image' | 'pdf' } | null;
  onClose: () => void;
}) {
  if (!preview || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm"
      style={{ zIndex: 2147483000 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="附件预览"
    >
      <button type="button" onClick={onClose} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
        <X className="w-8 h-8" />
      </button>
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {preview.kind === 'image' ? (
          <img src={preview.src} alt="预览" className="w-full h-full max-h-[85vh] object-contain" />
        ) : (
          <iframe src={preview.src} title="PDF 预览" className="w-full h-[85vh] border-0" />
        )}
      </div>
    </div>,
    document.body
  );
}

const SpecSelectorModal = ({
  isOpen,
  onClose,
  title,
  items,
  selectedIds,
  onToggle,
  onAddNew,
  type,
  stackZClass = 'z-[10250]',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: DictionaryItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAddNew: (name: string) => void;
  type: 'color' | 'size';
  /** 嵌在 ProductArchiveCreateModal（z=10800）内时需更高，否则被外壳挡住 */
  stackZClass?: string;
}) => {
  const [search, setSearch] = useState('');
  const filteredItems = items.filter(item => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || (item.value ?? '').toLowerCase().includes(q);
  });
  const exactMatch = items.find(item => item.name === search.trim());
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${stackZClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-xl rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">已选择 {selectedIds.length} 项</span>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full transition-all"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
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
                placeholder={type === 'color' ? '搜索名称或色值…' : '搜索名称或编码…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${productArchiveFormControlIconClass} pl-9`}
              />
            </div>
            {search.trim() && !exactMatch && (
              <button 
                onClick={() => { onAddNew(search.trim()); setSearch(''); }}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-black transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" /> 新增 "{search.trim()}"
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

/** BOM 弹窗内：批量勾选产品后加入多行，再逐行填用量（与单行 SearchableProductSelect 互补） */
const BomBatchAddPanel = ({
  open,
  onClose,
  options,
  categories,
  alreadyUsedProductIds,
  blockedProductIds,
  parentProductId,
  onConfirm,
  allowQuickCreate = true,
}: {
  open: boolean;
  onClose: () => void;
  options: Product[];
  categories: ProductCategory[];
  alreadyUsedProductIds: string[];
  /** 含颜色/尺码的产品，不可批量加入 BOM */
  blockedProductIds: string[];
  parentProductId: string;
  onConfirm: (rows: { productId: string; categoryId?: string }[]) => void;
  /** 在「新增产品」弹窗内嵌编辑时关闭，避免再叠一层新建弹窗 */
  allowQuickCreate?: boolean;
}) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const auth = useAuthOptional();
  const canQuickCreate = useMemo(() => {
    const tctx = auth?.tenantCtx;
    if (!tctx) return false;
    if (tctx.tenantRole === 'owner') return true;
    return (
      hasSubPermission(tctx.permissions, 'basic:products:view') &&
      hasSubPermission(tctx.permissions, 'basic:products:create')
    );
  }, [auth]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveTab('all');
      setPicked(new Set());
      setQuickCreateOpen(false);
    }
  }, [open]);

  const usedSet = useMemo(() => new Set(alreadyUsedProductIds.filter(Boolean)), [alreadyUsedProductIds]);
  const blockedSet = useMemo(() => new Set(blockedProductIds.filter(Boolean)), [blockedProductIds]);

  const pool = useMemo(
    () => options.filter(p => p.id !== parentProductId && isProductEnabled(p)),
    [options, parentProductId],
  );

  const filtered = useMemo(() => {
    return pool
      .filter(p => {
        const q = search.trim();
        const cat = categories.find(c => c.id === p.categoryId) ?? null;
        const matchesSearch = productMatchesSearchQuery(p, cat, q);
        const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  }, [pool, search, activeTab, categories]);

  const tabBtnCls = (active: boolean) =>
    `px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all whitespace-nowrap shrink-0 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;

  const toggle = (id: string) => {
    if (usedSet.has(id) || blockedSet.has(id)) return;
    setPicked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllVisible = () => {
    setPicked(prev => {
      const n = new Set(prev);
      for (const p of filtered) {
        if (!usedSet.has(p.id) && !blockedSet.has(p.id)) n.add(p.id);
      }
      return n;
    });
  };

  const clearPicked = () => setPicked(new Set());

  const handleConfirm = () => {
    const ids = [...picked].filter(id => !usedSet.has(id) && !blockedSet.has(id));
    if (ids.length === 0) return;
    onConfirm(
      ids.map(id => {
        const p = options.find(x => x.id === id);
        return { productId: id, categoryId: p?.categoryId };
      }),
    );
    onClose();
  };

  const pickedValid = [...picked].filter(id => !usedSet.has(id) && !blockedSet.has(id));
  const visibleSelectable = filtered.filter(p => !usedSet.has(p.id) && !blockedSet.has(p.id)).length;

  if (!open) return null;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3" data-bom-batch-panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" /> 批量勾选添加
          </p>
          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed max-w-md">
            勾选多个物料后一次加入下方清单，再逐行填写用量；已在本 BOM 中的不可重复勾选。带颜色/尺码的产品不可作 BOM 子件。仍可用「添加物料清单行」逐条搜索单选。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canQuickCreate && allowQuickCreate && (
            <button
              type="button"
              onClick={() => setQuickCreateOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-3 h-3" /> 新增产品
            </button>
          )}
          <button type="button" onClick={onClose} className="text-[10px] font-bold text-slate-500 hover:text-slate-800">
            收起
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="名称、SKU 或自定义内容筛选…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        <button type="button" onClick={() => setActiveTab('all')} className={tabBtnCls(activeTab === 'all')}>
          全部
        </button>
        {categories.map(cat => (
          <button key={cat.id} type="button" onClick={() => setActiveTab(cat.id)} className={tabBtnCls(activeTab === cat.id)}>
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={visibleSelectable === 0}
          className="text-[10px] font-bold text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline"
        >
          全选当前列表
        </button>
        <button type="button" onClick={clearPicked} disabled={picked.size === 0} className="text-[10px] font-bold text-slate-500 hover:underline disabled:opacity-40">
          清除勾选
        </button>
      </div>

      <div className="max-h-52 overflow-y-auto custom-scrollbar rounded-xl border border-slate-200 bg-white divide-y divide-slate-50">
        {filtered.map(p => {
          const used = usedSet.has(p.id);
          const blocked = blockedSet.has(p.id);
          const checked = picked.has(p.id);
          const cat = categories.find(c => c.id === p.categoryId);
          const rowDisabled = used || blocked;
          return (
            <label
              key={p.id}
              className={`flex items-start gap-2.5 px-3 py-2.5 ${rowDisabled ? 'opacity-45 cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-slate-50/80'}`}
            >
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={checked}
                disabled={rowDisabled}
                onChange={() => toggle(p.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs font-bold text-slate-800 truncate">{p.name}</span>
                  {cat && (
                    <span className="text-[7px] font-black uppercase text-slate-400 bg-slate-100 px-1 py-0 rounded shrink-0">{cat.name}</span>
                  )}
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5">{p.sku}</p>
                {used && <p className="text-[9px] text-amber-600 font-bold mt-0.5">已在清单中</p>}
                {blocked && !used && <p className="text-[9px] text-slate-500 font-bold mt-0.5">含颜色/尺码，不可作 BOM 子件</p>}
              </div>
            </label>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-[10px] text-slate-400 font-medium">没有可选产品</div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
          取消
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pickedValid.length === 0}
          className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
        >
          加入清单 ({pickedValid.length})
        </button>
      </div>

      {allowQuickCreate && quickCreateOpen && (
        <Suspense fallback={null}>
          <LazyProductArchiveCreateModal
            isOpen={quickCreateOpen}
            onClose={() => setQuickCreateOpen(false)}
            defaultCategoryId={activeTab !== 'all' ? activeTab : undefined}
            onCreated={p => {
              setPicked(prev => {
                const n = new Set(prev);
                n.add(p.id);
                return n;
              });
              setActiveTab('all');
              setSearch('');
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export interface ProductEditFormProps {
  initialProduct: Product;
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  categories: ProductCategory[];
  boms: BOM[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onUpdateProduct: (product: Product) => Promise<Product | null>;
  onDeleteProduct?: (id: string) => Promise<boolean>;
  onUpdateBOM: (bom: BOM) => Promise<boolean>;
  onRefreshDictionaries: () => Promise<void>;
  onRefreshPartners: () => Promise<void>;
  onBack: () => void;
  permCanDelete?: boolean;
  isPersistedProduct: boolean;
  /** 从搜索框等弹窗嵌入时：子层 z-index 已抬高；顶栏「返回」改为「关闭」 */
  embeddedInQuickCreateModal?: boolean;
  /** 保存产品资料成功后（在 onBack 之前）回调，便于外层选中新建产品 */
  onProductPersisted?: (product: Product) => void;
  /** 工序锁定推算：由外层传入，避免本组件静态依赖 AppDataContext（防循环依赖 / HMR 整页重载） */
  productionLinkMode?: ProductionLinkMode;
  ordersForProcessLock?: ReadonlyArray<Pick<ProductionOrder, 'productId' | 'status'>>;
}

const ProductEditForm: React.FC<ProductEditFormProps> = ({
  initialProduct,
  products,
  globalNodes,
  categories,
  boms,
  dictionaries,
  partners,
  partnerCategories,
  onUpdateProduct,
  onDeleteProduct,
  onUpdateBOM,
  onRefreshDictionaries,
  onRefreshPartners,
  onBack,
  permCanDelete = true,
  isPersistedProduct,
  embeddedInQuickCreateModal = false,
  onProductPersisted,
  productionLinkMode = 'order',
  ordersForProcessLock = [],
}) => {
  const confirm = useConfirm();
  const { weightEnabled } = useTraceabilityPlugin();
  const auth = useAuthOptional();
  /** 嵌在「新增产品」全屏弹窗（z=10800）内时，子层须更高，避免颜色/尺码等二级弹窗被挡住 */
  const nestedOverlayZ = embeddedInQuickCreateModal ? 'z-[11200]' : 'z-[10250]';
  const [workingProduct, setWorkingProduct] = useState<Product>(() => JSON.parse(JSON.stringify(initialProduct)));

  /** 打开编辑时从 API 拉取工序锁定基线（列表缓存可能缺 processLocked / 工序） */
  const [processLockBaseline, setProcessLockBaseline] = useState(() => ({
    milestoneNodeIds: initialProduct.milestoneNodeIds ?? [],
    processLocked: initialProduct.processLocked,
  }));

  useEffect(() => {
    if (!isPersistedProduct) return;
    let cancelled = false;
    void api.products.get(initialProduct.id).then((p: Product) => {
      if (cancelled) return;
      setProcessLockBaseline({
        milestoneNodeIds: p.milestoneNodeIds ?? [],
        processLocked: p.processLocked,
      });
    }).catch(() => {
      /* 拉取失败时沿用列表数据 + 本地 orders 推算 */
    });
    return () => { cancelled = true; };
  }, [isPersistedProduct, initialProduct.id]);

  const processLocked = useMemo(
    () => isProductProcessLocked(
      productionLinkMode,
      {
        id: initialProduct.id,
        milestoneNodeIds: processLockBaseline.milestoneNodeIds,
        processLocked: processLockBaseline.processLocked,
      },
      ordersForProcessLock,
    ),
    [productionLinkMode, initialProduct.id, processLockBaseline, ordersForProcessLock],
  );

  const [modalType, setModalType] = useState<'color' | 'size' | null>(null);
  const [quickAddSpecOpen, setQuickAddSpecOpen] = useState<'color' | 'size' | null>(null);
  const [quickAddSpecName, setQuickAddSpecName] = useState('');
  const [quickAddSpecBusy, setQuickAddSpecBusy] = useState(false);
  const [quickAddUnitOpen, setQuickAddUnitOpen] = useState(false);
  const [quickAddUnitName, setQuickAddUnitName] = useState('');
  const [quickAddUnitBusy, setQuickAddUnitBusy] = useState(false);
  const [quickAddSupplierOpen, setQuickAddSupplierOpen] = useState(false);
  const [quickAddSupplierName, setQuickAddSupplierName] = useState('');
  const [quickAddSupplierCategoryId, setQuickAddSupplierCategoryId] = useState(() => resolveDefaultPartnerCategoryId(partnerCategories));
  const [quickAddSupplierBusy, setQuickAddSupplierBusy] = useState(false);
  /** 产品主图：拖放高亮（整块上传区） */
  const [productImageDragOver, setProductImageDragOver] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ src: string; kind: 'image' | 'pdf' } | null>(null);
  const filePreviewRevokeRef = useRef<(() => void) | undefined>(undefined);

  const openFilePreview = useCallback((rawUrl: string, kind: 'image' | 'pdf') => {
    filePreviewRevokeRef.current?.();
    filePreviewRevokeRef.current = undefined;
    if (kind === 'pdf' && rawUrl.startsWith('data:')) {
      const conv = dataUrlToBlobUrl(rawUrl);
      if (conv) {
        filePreviewRevokeRef.current = conv.revoke;
        setFilePreview({ src: conv.url, kind: 'pdf' });
        return;
      }
    }
    setFilePreview({ src: rawUrl, kind });
  }, []);

  const closeFilePreview = useCallback(() => {
    filePreviewRevokeRef.current?.();
    filePreviewRevokeRef.current = undefined;
    setFilePreview(null);
  }, []);

  const applyProductImageFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请使用图片文件（JPG、PNG、GIF 等）');
      return;
    }
    const r = new FileReader();
    r.onload = () => setWorkingProduct(wp => ({ ...wp, imageUrl: r.result as string }));
    r.readAsDataURL(file);
  }, []);

  useEffect(() => () => {
    filePreviewRevokeRef.current?.();
  }, []);

  const routeReportDisplayFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [routeReportDisplayFieldValues, setRouteReportDisplayFieldValues] = useState<Record<string, Record<string, string>>>(
    () => normalizeRouteReportValuesFromApi(initialProduct.routeReportDisplayValues)
  );
  const bomEditorState = useBomEditorPortalState();
  const {
    activeVariantIdForBOM,
    setActiveVariantIdForBOM,
    activeNodeIdForBOM,
    setActiveNodeIdForBOM,
    workingBOM,
    setWorkingBOM,
    bomBatchOpen,
    setBomBatchOpen,
    copyBOMDropdownOpen,
    setCopyBOMDropdownOpen,
    copyBOMDropdownStyle,
    setCopyBOMDropdownStyle,
    bomSaving,
    setBomSaving,
  } = bomEditorState;
  const copyBOMTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (copyBOMDropdownOpen && copyBOMTriggerRef.current) {
      const rect = copyBOMTriggerRef.current.getBoundingClientRect();
      const z = embeddedInQuickCreateModal ? 11350 : 10800;
      setCopyBOMDropdownStyle({ position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right, width: 256, zIndex: z });
    }
  }, [copyBOMDropdownOpen, embeddedInQuickCreateModal]);

  useEffect(() => {
    if (!activeVariantIdForBOM || !activeNodeIdForBOM) setCopyBOMDropdownOpen(false);
  }, [activeVariantIdForBOM, activeNodeIdForBOM]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (copyBOMTriggerRef.current?.contains(t) || (e.target as Element)?.closest?.('[data-portal-copy-bom]')) return;
      setCopyBOMDropdownOpen(false);
    };
    if (copyBOMDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [copyBOMDropdownOpen]);

  const activeCategory = categories.find(c => c.id === workingProduct.categoryId);
  const canQuickAddSupplier = useMemo(() => {
    const tctx = auth?.tenantCtx;
    if (!tctx) return false;
    if (tctx.tenantRole === 'owner') return true;
    return (
      hasSubPermission(tctx.permissions, 'basic:partners:view') &&
      hasSubPermission(tctx.permissions, 'basic:partners:create')
    );
  }, [auth]);

  /** 保存成功后与「新建时选手动单位」均写入，供下次同分类新建默认带出 */
  const persistLastUnitPreference = useCallback(
    (categoryId: string | undefined, unitId: string | undefined) => {
      const cid = (categoryId ?? '').trim();
      const uid = (unitId ?? '').trim();
      if (!cid || !uid) return;
      writeLastUnitForCategory(auth?.tenantCtx?.tenantId, cid, uid);
    },
    [auth?.tenantCtx?.tenantId],
  );

  /** 新建：打开表单时已有分类但尚未选单位（如从模板带入）时补默认单位 */
  useEffect(() => {
    if (isPersistedProduct) return;
    const cid = (workingProduct.categoryId ?? '').trim();
    if (!cid) return;
    if ((workingProduct.unitId ?? '').trim()) return;
    const units = dictionaries.units ?? [];
    const unitIds = new Set(units.map(u => u.id));
    if (unitIds.size === 0) return;
    const preferred = resolveDefaultUnitForNewProductCategory(
      auth?.tenantCtx?.tenantId,
      cid,
      products,
      unitIds,
    );
    if (!preferred) return;
    setWorkingProduct(wp => {
      if ((wp.categoryId ?? '').trim() !== cid) return wp;
      if ((wp.unitId ?? '').trim()) return wp;
      return { ...wp, unitId: preferred };
    });
  }, [
    isPersistedProduct,
    workingProduct.categoryId,
    workingProduct.unitId,
    products,
    dictionaries.units,
    auth?.tenantCtx?.tenantId,
  ]);

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
            nodeBoms: {},
            nodeUnitWeights: {},
          });
        }
      });
    });
    return newVariants;
  };

  useEffect(() => {
    if (workingProduct && productColorSizeEnabled(workingProduct, activeCategory)) {
      const newVariants = generateVariants(workingProduct.colorIds, workingProduct.sizeIds, workingProduct.variants);
      const currentHash = workingProduct.variants.map(v => `${v.colorId}-${v.sizeId}`).sort().join(',');
      const nextHash = newVariants.map(v => `${v.colorId}-${v.sizeId}`).sort().join(',');
      if (currentHash !== nextHash) setWorkingProduct({ ...workingProduct, variants: newVariants });
    }
  }, [workingProduct?.colorIds, workingProduct?.sizeIds, activeCategory?.hasColorSize, activeCategory?.id]);

  const [specRemovalCheckBusy, setSpecRemovalCheckBusy] = useState(false);

  /**
   * 取消勾选颜色/尺码即删除对应变体；已持久化的产品先查后端引用情况，
   * 有业务数据（工单、报工、进销存等）则阻止取消。后端保存时还有同口径校验兜底。
   */
  const checkSpecRemovalAllowed = async (type: 'color' | 'size', id: string): Promise<boolean> => {
    if (!isPersistedProduct || !workingProduct) return true;
    const affectedIds = workingProduct.variants
      .filter(v => (type === 'color' ? v.colorId === id : v.sizeId === id))
      .map(v => v.id);
    if (affectedIds.length === 0) return true;
    try {
      const res = await api.products.variantUsage(workingProduct.id, affectedIds);
      const blocked = res.usages.filter(u => u.total > 0);
      if (blocked.length === 0) return true;
      const specName = (type === 'color' ? dictionaries.colors : dictionaries.sizes).find(i => i.id === id)?.name ?? '';
      const detail = blocked
        .map(u => `规格【${u.variantLabel}】有 ${u.details.map(d => `${d.count} 条${d.label}`).join('、')}`)
        .join('；');
      toast.error(`${type === 'color' ? '颜色' : '尺码'}【${specName}】已产生业务数据，无法删除：${detail}`);
      return false;
    } catch {
      // 预检接口异常时放行，由后端保存时的引用校验兜底
      return true;
    }
  };

  const toggleAttribute = async (type: 'color' | 'size', id: string) => {
    if (!workingProduct) return;
    const key = type === 'color' ? 'colorIds' : 'sizeIds';
    if (workingProduct[key].includes(id)) {
      if (specRemovalCheckBusy) return;
      setSpecRemovalCheckBusy(true);
      try {
        const allowed = await checkSpecRemovalAllowed(type, id);
        if (!allowed) return;
      } finally {
        setSpecRemovalCheckBusy(false);
      }
      setWorkingProduct(wp => ({ ...wp, [key]: wp[key].filter(x => x !== id) }));
    } else {
      setWorkingProduct(wp => (wp[key].includes(id) ? wp : { ...wp, [key]: [...wp[key], id] }));
    }
  };

  const handleAddNewSpec = async (type: 'colors' | 'sizes', name: string): Promise<boolean> => {
    try {
      const dictType = type === 'colors' ? 'color' : 'size';
      const created = await api.dictionaries.create({ type: dictType, name, value: type === 'colors' ? '#ccc' : name }) as DictionaryItem;
      await onRefreshDictionaries();
      const key = type === 'colors' ? 'colorIds' : 'sizeIds';
      setWorkingProduct(wp => ({ ...wp, [key]: [...wp[key], created.id] }));
      return true;
    } catch (err: any) {
      toast.error(err.message || '操作失败');
      return false;
    }
  };

  const submitQuickAddSpec = async () => {
    const kind = quickAddSpecOpen;
    if (!kind) return;
    const name = quickAddSpecName.trim();
    if (!name) {
      toast.error(kind === 'color' ? '请输入颜色名称' : '请输入尺码名称');
      return;
    }
    const items = kind === 'color' ? dictionaries.colors : dictionaries.sizes;
    const existing = items.find(i => i.name === name);
    if (existing) {
      const key = kind === 'color' ? 'colorIds' : 'sizeIds';
      if (workingProduct[key].includes(existing.id)) {
        toast.info(kind === 'color' ? '该颜色已在已选列表中' : '该尺码已在已选列表中');
      } else {
        setWorkingProduct({ ...workingProduct, [key]: [...workingProduct[key], existing.id] });
        toast.info(kind === 'color' ? '该颜色已存在，已加入已选' : '该尺码已存在，已加入已选');
      }
      setQuickAddSpecOpen(null);
      setQuickAddSpecName('');
      return;
    }
    if (quickAddSpecBusy) return;
    setQuickAddSpecBusy(true);
    try {
      const ok = await handleAddNewSpec(kind === 'color' ? 'colors' : 'sizes', name);
      if (ok) {
        toast.success(kind === 'color' ? '已添加颜色' : '已添加尺码');
        setQuickAddSpecOpen(null);
        setQuickAddSpecName('');
      }
    } finally {
      setQuickAddSpecBusy(false);
    }
  };

  const submitQuickAddUnit = async () => {
    const name = quickAddUnitName.trim();
    if (!name) {
      toast.error('请输入单位名称');
      return;
    }
    const units = dictionaries.units ?? [];
    const existing = units.find(u => u.name === name);
    if (existing) {
      setWorkingProduct({ ...workingProduct, unitId: existing.id });
      if (!isPersistedProduct) {
        persistLastUnitPreference(workingProduct.categoryId, existing.id);
      }
      toast.info('该单位已存在，已为您选中');
      setQuickAddUnitOpen(false);
      setQuickAddUnitName('');
      return;
    }
    if (quickAddUnitBusy) return;
    setQuickAddUnitBusy(true);
    try {
      const created = await api.dictionaries.create({ type: 'unit', name, value: name }) as DictionaryItem;
      await onRefreshDictionaries();
      setWorkingProduct({ ...workingProduct, unitId: created.id });
      if (!isPersistedProduct) {
        persistLastUnitPreference(workingProduct.categoryId, created.id);
      }
      toast.success('已添加产品单位');
      setQuickAddUnitOpen(false);
      setQuickAddUnitName('');
    } catch (err: any) {
      toast.error(err.message || '添加失败');
    } finally {
      setQuickAddUnitBusy(false);
    }
  };

  const submitQuickAddSupplier = async () => {
    const name = quickAddSupplierName.trim();
    if (!name) {
      toast.error('请输入供应商名称');
      return;
    }
    const existing = findPartnerByName(partners, name);
    if (existing) {
      setWorkingProduct(wp => ({ ...wp, supplierId: existing.id }));
      toast.info('该供应商已存在，已为您选中');
      setQuickAddSupplierOpen(false);
      setQuickAddSupplierName('');
      return;
    }
    if (quickAddSupplierBusy) return;
    setQuickAddSupplierBusy(true);
    try {
      const created = await api.partners.create({
        name,
        categoryId: quickAddSupplierCategoryId || undefined,
        contact: '',
        customData: {},
      }) as Partner;
      await onRefreshPartners();
      setWorkingProduct(wp => ({ ...wp, supplierId: created.id }));
      toast.success('已添加供应商');
      setQuickAddSupplierOpen(false);
      setQuickAddSupplierName('');
    } catch (err: any) {
      toast.error(err.message || '添加失败');
    } finally {
      setQuickAddSupplierBusy(false);
    }
  };

  const validateProductForSave = (p: Product, catalog: Product[]): boolean => {
    const name = (p.name ?? '').trim();
    const sku = (p.sku ?? '').trim();
    if (!name) {
      toast.error('产品全称不能为空');
      return false;
    }
    // 产品编号须在调用前经 resolveProductSkuForSave 处理（留空则已生成：两字母 + 时间戳）
    if (!sku) {
      toast.error('产品编号不能为空');
      return false;
    }
    const catalogErr = validateProductCatalogUnique(catalog, { name, sku, excludeProductId: p.id });
    if (catalogErr) {
      toast.error(catalogErr);
      return false;
    }
    const categoryId = (p.categoryId ?? '').trim();
    if (!categoryId) {
      toast.error('没有选择产品类型，请去系统设置中添加产品分类');
      return false;
    }
    const category = categories.find(c => c.id === categoryId);
    const colorSizeErr = validateProductColorSizeSelection(p, category);
    if (colorSizeErr) {
      toast.error(colorSizeErr);
      return false;
    }
    return true;
  };

  const [saveProductBusy, setSaveProductBusy] = useState(false);
  const saveProductInFlightRef = useRef(false);
  const saveProduct = async () => {
    if (!workingProduct) return;
    const resolved = resolveProductSkuForSave(workingProduct, products);
    if ((workingProduct.sku ?? '').trim() !== (resolved.sku ?? '').trim()) {
      setWorkingProduct(resolved);
    }
    if (!validateProductForSave(resolved, products)) return;
    const milestoneChanged = !milestoneNodeIdsEqual(
      processLockBaseline.milestoneNodeIds,
      resolved.milestoneNodeIds ?? [],
    );
    if (processLocked && milestoneChanged) {
      toast.error('该产品已下达生产工单，工序已锁定，不能修改工序路线。');
      return;
    }
    if (saveProductInFlightRef.current) return;
    saveProductInFlightRef.current = true;
    const toSave: Product = {
      ...resolved,
      name: resolved.name.trim(),
      sku: resolved.sku.trim(),
      salesPrice: workingProduct.salesPrice ?? 0,
      purchasePrice: workingProduct.purchasePrice ?? 0,
      routeReportValues: normalizeRouteReportValuesFromApi(resolved.routeReportValues),
      routeReportDisplayValues: routeReportDisplayFieldValues,
    };
    const { processLocked: _pl, ...payload } = toSave;
    setSaveProductBusy(true);
    try {
      const saved = await onUpdateProduct(payload);
      if (saved) {
        persistLastUnitPreference(saved.categoryId, saved.unitId);
        onProductPersisted?.(saved);
        onBack();
        setRouteReportDisplayFieldValues({});
      }
    } finally {
      saveProductInFlightRef.current = false;
      setSaveProductBusy(false);
    }
  };

  const [deleteProductBusy, setDeleteProductBusy] = useState(false);

  const handleDeletePersistedProduct = async () => {
    if (!workingProduct || !onDeleteProduct || !isPersistedProduct) return;
    const ok = await confirm({
      message: `确定删除产品「${workingProduct.name || workingProduct.sku}」？将同时删除其工序物料单（若已配置），且不可恢复。`,
      danger: true,
    });
    if (!ok) return;
    setDeleteProductBusy(true);
    try {
      closeBOMEditor();
      const ok = await onDeleteProduct(workingProduct.id);
      if (ok) {
        onBack();
      }
    } finally {
      setDeleteProductBusy(false);
    }
  };

  const toggleNodeInProduct = (nodeId: string) => {
    if (!workingProduct || processLocked) return;
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
    if (!workingProduct || processLocked) return;
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
    setBomBatchOpen(false);
    setActiveVariantIdForBOM(variant.id);
    setActiveNodeIdForBOM(nodeId);
    const existingBOM = boms.find(b => b.variantId === variant.id && b.nodeId === nodeId);
    if (existingBOM) {
      setWorkingBOM(JSON.parse(JSON.stringify(existingBOM)));
    } else {
      const nodeName = globalNodes.find(n => n.id === nodeId)?.name;
      setWorkingBOM({
        id: `bom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `${workingProduct?.name} [${nodeName}]`,
        parentProductId: workingProduct!.id,
        variantId: variant.id,
        nodeId: nodeId,
        version: 'V1.0',
        items: []
      });
    }
  };

  const closeBOMEditor = useCallback(() => {
    setCopyBOMDropdownOpen(false);
    setBomBatchOpen(false);
    setActiveVariantIdForBOM(null);
    setActiveNodeIdForBOM(null);
    setWorkingBOM(null);
  }, []);

  useEffect(() => {
    if (!activeVariantIdForBOM || !activeNodeIdForBOM || !workingBOM) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBOMEditor();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeVariantIdForBOM, activeNodeIdForBOM, workingBOM, closeBOMEditor]);

  const saveBomInFlightRef = useRef(false);
  const saveBOM = async () => {
    if (!workingBOM || !workingProduct || !activeVariantIdForBOM || !activeNodeIdForBOM) return;
    const resolved = resolveProductSkuForSave(workingProduct, products);
    if ((workingProduct.sku ?? '').trim() !== (resolved.sku ?? '').trim()) {
      setWorkingProduct(resolved);
    }
    if (!validateProductForSave(resolved, products)) return;
    if (saveBomInFlightRef.current) return;
    saveBomInFlightRef.current = true;
    setBomSaving(true);
    try {
      const { processLocked: _plBom, ...bomProductPayload } = {
        ...resolved,
        name: resolved.name.trim(),
        sku: resolved.sku.trim(),
        salesPrice: resolved.salesPrice ?? 0,
        purchasePrice: resolved.purchasePrice ?? 0,
      };
      const savedProduct = await onUpdateProduct(bomProductPayload);
      if (!savedProduct) return;
      persistLastUnitPreference(savedProduct.categoryId, savedProduct.unitId);
      for (const it of workingBOM.items) {
        const pid = it.productId?.trim();
        if (!pid) continue;
        const p = products.find(x => x.id === pid);
        if (p && isProductBlockedAsBomMaterial(p)) {
          toast.error(`BOM 不能使用带颜色/尺码的产品：${p.name}`);
          return;
        }
      }
      const persistedBom = boms.some(bx => bx.id === workingBOM.id);
      const hasConfiguredItems = bomHasConfiguredItems(workingBOM);
      let bomOk = false;
      if (!hasConfiguredItems) {
        if (persistedBom) {
          bomOk = await onUpdateBOM({ ...workingBOM, items: [] });
        } else {
          bomOk = true;
        }
      } else {
        bomOk = await onUpdateBOM(workingBOM);
      }
      if (bomOk) closeBOMEditor();
    } finally {
      saveBomInFlightRef.current = false;
      setBomSaving(false);
    }
  };

  const copyBOMFrom = (sourceVariantId: string) => {
    const sourceBOM = boms.find(b => b.variantId === sourceVariantId && b.nodeId === activeNodeIdForBOM);
    if (sourceBOM && workingBOM) {
      const raw = JSON.parse(JSON.stringify(sourceBOM.items)) as BOMItem[];
      const merged = new Map<string, BOMItem>();
      for (const it of raw) {
        if (!it.productId?.trim()) continue;
        const srcP = products.find(x => x.id === it.productId);
        if (srcP && isProductBlockedAsBomMaterial(srcP)) continue;
        const q = typeof it.quantity === 'number' && !Number.isNaN(it.quantity) ? it.quantity : Number(it.quantity) || 0;
        const prev = merged.get(it.productId);
        if (prev) {
          const pq = typeof prev.quantity === 'number' && !Number.isNaN(prev.quantity) ? prev.quantity : Number(prev.quantity) || 0;
          merged.set(it.productId, { ...prev, quantity: pq + q, quantityInput: undefined });
        } else {
          merged.set(it.productId, { ...it, quantity: q, quantityInput: undefined });
        }
      }
      setWorkingBOM({ ...workingBOM, items: Array.from(merged.values()) });
    }
  };

  const updateBOMItem = (idx: number, updates: Partial<BOMItem>) => {
    if (!workingBOM) return;
    const newItems = [...workingBOM.items];
    newItems[idx] = { ...newItems[idx], ...updates };
    setWorkingBOM({ ...workingBOM, items: newItems });
  };

  const bomBlockedProductIds = useMemo(
    () => products.filter(isProductBlockedAsBomMaterial).map(p => p.id),
    [products],
  );

  const nodeIds = (workingProduct.milestoneNodeIds as string[]);
  const selectedNodesOrdered = nodeIds.map(id => globalNodes.find(gn => gn.id === id)).filter(Boolean) as GlobalNodeTemplate[];
  const scanWeighingNodes = getProductScanWeighingNodes(nodeIds, globalNodes);
  const enabledBOMNodes = selectedNodesOrdered.filter(n => n.hasBOM);

  const singleSkuVariantId = `single-${workingProduct.id}`;
  const singleSkuNodeBOMs: Record<string, string> = Object.fromEntries(
    boms.filter(b => b.parentProductId === workingProduct.id && b.variantId === singleSkuVariantId && b.nodeId && bomHasConfiguredItems(b)).map(b => [b.nodeId!, b.id])
  );
  const availableBOMSources = useMemo(() => {
    const filtered = workingProduct.variants.filter(srcV => {
      if (!activeVariantIdForBOM || !activeNodeIdForBOM) return false;
      return (
        srcV.id !== activeVariantIdForBOM &&
        boms.some(b => b.variantId === srcV.id && b.nodeId === activeNodeIdForBOM && bomHasConfiguredItems(b))
      );
    });
    return sortVariantsByColorThenSize(filtered, workingProduct.colorIds, workingProduct.sizeIds);
  }, [
    workingProduct.variants,
    workingProduct.colorIds,
    workingProduct.sizeIds,
    activeVariantIdForBOM,
    activeNodeIdForBOM,
    boms,
  ]);

  return (
      <div className={`max-w-5xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 ${embeddedInQuickCreateModal ? 'pb-8' : 'pb-32'}`}>

        <div className={productArchiveFormStickyBarClass}>
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-slate-500 font-medium text-xs hover:text-slate-800 transition-all h-9 px-2">
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" /> {embeddedInQuickCreateModal ? '关闭' : '返回列表'}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            {permCanDelete && onDeleteProduct && isPersistedProduct && (
              <button
                type="button"
                disabled={deleteProductBusy}
                onClick={() => void handleDeletePersistedProduct()}
                className="h-9 px-3 rounded-lg font-medium flex items-center gap-1.5 border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 disabled:opacity-50 transition-all text-xs shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" /> 删除产品
              </button>
            )}
            <button
              type="button"
              disabled={saveProductBusy}
              onClick={() => void saveProduct()}
              className={`${primaryToolbarButtonClass} bg-indigo-600 text-white h-9 px-4 flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <Save className="w-3.5 h-3.5 shrink-0" /> {saveProductBusy ? '保存中…' : '保存产品资料'}
            </button>
          </div>
        </div>

        <ProductCategoryInfoFields
          working={workingProduct}
          setWorking={setWorkingProduct}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          partnerCategories={partnerCategories}
          products={products}
          isNewRecord={!isPersistedProduct}
          onRefreshDictionaries={onRefreshDictionaries}
          onRefreshPartners={onRefreshPartners}
          embeddedInQuickCreateModal={embeddedInQuickCreateModal}
        />

        {/* 3. 生产工序与工艺 BOM */}
        {activeCategory?.hasProcess && (
          <div className={productArchiveFormCardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0"><ClipboardCheck className="w-4 h-4" /></div>
                <h3 className={sectionTitleClass}>2. 生产工序与工艺 BOM</h3>
              </div>
              {weightEnabled && scanWeighingNodes.length > 0 ? (
              <VariantNodeWeightSettingTrigger
                product={workingProduct}
                nodes={scanWeighingNodes}
                dictionaries={dictionaries}
                onChange={variants => setWorkingProduct({ ...workingProduct, variants })}
                overlayClassName={embeddedInQuickCreateModal ? nestedOverlayZ : 'z-[110]'}
              />
              ) : null}
            </div>

            {processLocked ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-amber-900 leading-snug">
                  该产品已下达生产工单，工序已锁定。如需调整工序，请先撤销或完成相关工单。工价、报工模板与 BOM 仍可编辑。
                </p>
              </div>
            ) : null}

            <div className="space-y-4">
              {/* 上：可选工序 */}
              <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/90 to-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 gap-y-1 mb-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-black text-white">1</span>
                  <h4 className="text-sm font-black text-slate-800">可选工序</h4>
                  <span className="text-[10px] text-slate-400">点击加入下方标准路线</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {globalNodes.map(gn => {
                    const isSelected = workingProduct.milestoneNodeIds.includes(gn.id);
                    return (
                      <button
                        key={gn.id}
                        type="button"
                        disabled={processLocked}
                        onClick={() => toggleNodeInProduct(gn.id)}
                        className={`p-3 rounded-lg border text-left transition-all flex items-center justify-between gap-2 ${processLocked ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50' : isSelected ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                      >
                        <span className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-600'}`}>{gn.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 中：标准生产路线 + 工序自定内容录入 */}
              <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/20 p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-black text-white">2</span>
                    <h4 className="text-sm font-black text-slate-800">标准生产路线</h4>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-white/80 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                    共 {(workingProduct.milestoneNodeIds as string[]).length} 道工序 · ↑↓ 调整顺序
                  </span>
                </div>
                <div className="space-y-3 relative">
                  {selectedNodesOrdered.length > 0 && (
                    <div className="absolute left-[13px] top-8 bottom-8 w-0.5 bg-indigo-100 z-0 hidden sm:block" aria-hidden />
                  )}
                  {(selectedNodesOrdered as GlobalNodeTemplate[]).map((node, idx) => (
                      <div key={node.id} className="relative z-10 rounded-2xl border border-white bg-white/90 shadow-sm ring-1 ring-indigo-50 group">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:pl-4">
                          <div className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800">{node.name}</p>
                            {node.hasBOM && (
                              <p className="text-[9px] text-indigo-600 font-bold flex items-center gap-1 mt-0.5">
                                <Boxes className="w-2.5 h-2.5 shrink-0" /> 需在下方「BOM 精细化配置」中维护物料
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
                            {node.enablePieceRate && (
                              <div className="flex items-center gap-2">
                                <label className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">工价</label>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="0"
                                  value={workingProduct.nodeRates?.[node.id] ?? ''}
                                  onChange={e => updateNodeRate(node.id, parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <span className="text-[9px] text-slate-400 whitespace-nowrap">元/件</span>
                              </div>
                            )}
                          </div>
                          <div className={`flex gap-0.5 transition-opacity ${processLocked ? 'opacity-30 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
                            {idx > 0 && (
                              <button type="button" title="上移" disabled={processLocked} onClick={() => moveNode(idx, idx - 1)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 disabled:cursor-not-allowed">↑</button>
                            )}
                            {idx < selectedNodesOrdered.length - 1 && (
                              <button type="button" title="下移" disabled={processLocked} onClick={() => moveNode(idx, idx + 1)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 disabled:cursor-not-allowed">↓</button>
                            )}
                          </div>
                        </div>
                        {(node.reportDisplayTemplate?.length ?? 0) > 0 && (
                        <div className="mx-3 mb-3 rounded-xl border border-indigo-100/80 bg-slate-50/60 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <BookOpen className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">报工页展示内容</span>
                            <span className="text-[10px] text-slate-500">（工序库配置项；此处维护本产品在报工弹窗中只读展示的内容）</span>
                          </div>
                          <div className="space-y-2">
                            {(node.reportDisplayTemplate ?? []).map(field => {
                              const rk = `d:${node.id}:${field.id}`;
                              const val = routeReportDisplayFieldValues[node.id]?.[field.id] ?? '';
                              const setVal = (v: string) => {
                                setRouteReportDisplayFieldValues(prev => ({
                                  ...prev,
                                  [node.id]: { ...prev[node.id], [field.id]: v },
                                }));
                              };
                              return (
                                <div key={field.id} className="rounded-lg border border-slate-200/90 bg-white/90 px-2.5 py-2">
                                  <label className="text-[10px] font-bold text-slate-500 block mb-1">
                                    {field.label}
                                    <span className="text-slate-300 font-normal mx-1">·</span>
                                    <span className="text-slate-400 font-normal">
                                      {field.type === 'file' ? '文件/PDF' : field.type === 'knowledge' ? '资料库' : '文本'}
                                    </span>
                                  </label>
                                  {field.type === 'knowledge' && (
                                    <PlanFormKnowledgeInput
                                      value={val}
                                      onChange={v => setVal(typeof v === 'string' ? v : '')}
                                    />
                                  )}
                                  {field.type !== 'file' && field.type !== 'knowledge' && (
                                    <input
                                      type="text"
                                      value={val}
                                      onChange={e => setVal(e.target.value)}
                                      placeholder={field.placeholder || '工艺说明、注意事项等'}
                                      className="route-report-control w-full box-border bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                  )}
                                  {field.type === 'file' && (() => {
                                    const fileUrls = parseRouteReportFileUrls(val);
                                    const maxSize = 5 * 1024 * 1024;
                                    const acceptFiles = 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
                                    const appendFiles = (fileList: FileList | null) => {
                                      const files = Array.from(fileList || []);
                                      if (files.length === 0) return;
                                      const overs = files.filter(f => f.size > maxSize);
                                      if (overs.length > 0) {
                                        toast.error(`有 ${overs.length} 个文件超过 5MB 上限，已跳过`);
                                      }
                                      const ok = files.filter(f => f.size <= maxSize);
                                      if (ok.length === 0) return;
                                      Promise.all(
                                        ok.map(
                                          f =>
                                            new Promise<string | null>(resolve => {
                                              const reader = new FileReader();
                                              reader.onload = () => resolve(reader.result as string);
                                              reader.onerror = () => resolve(null);
                                              reader.readAsDataURL(f);
                                            })
                                        )
                                      ).then(parts => {
                                        const next = [...fileUrls, ...parts.filter((x): x is string => !!x)];
                                        setVal(stringifyRouteReportFileUrls(next));
                                      });
                                    };
                                    return (
                                      <div className="space-y-1.5">
                                        <input
                                          ref={el => { routeReportDisplayFileInputRefs.current[rk] = el; }}
                                          type="file"
                                          multiple
                                          accept={acceptFiles}
                                          className="hidden"
                                          onChange={e => {
                                            appendFiles(e.target.files);
                                            e.target.value = '';
                                          }}
                                        />
                                        <div className="flex flex-wrap gap-2">
                                          {fileUrls.map((url, fi) => (
                                            <div
                                              key={`${rk}-${fi}`}
                                              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 pl-1 pr-1 py-1"
                                            >
                                              {url.startsWith('data:image/') ? (
                                                <button
                                                  type="button"
                                                  onClick={() => { openFilePreview(url, 'image'); }}
                                                  className="h-12 w-12 rounded-md border border-slate-200 overflow-hidden shrink-0 focus:ring-2 focus:ring-indigo-500"
                                                >
                                                  <img src={url} alt="" className="h-full w-full object-cover pointer-events-none" />
                                                </button>
                                              ) : url.startsWith('data:application/pdf') ? (
                                                <button
                                                  type="button"
                                                  onClick={() => { openFilePreview(url, 'pdf'); }}
                                                  className="h-12 w-12 rounded-md border border-slate-200 bg-white flex items-center justify-center shrink-0 focus:ring-2 focus:ring-indigo-500"
                                                  title="查看 PDF"
                                                >
                                                  <FileText className="w-5 h-5 text-rose-500 pointer-events-none" />
                                                </button>
                                              ) : (
                                                <div className="h-12 w-12 rounded-md border border-slate-200 bg-white flex items-center justify-center shrink-0" title="附件">
                                                  <FileText className="w-5 h-5 text-slate-500" />
                                                </div>
                                              )}
                                              <div className="flex flex-col gap-0.5 min-w-0">
                                                <a
                                                  href={url}
                                                  download={`${field.label}-${fi + 1}.${getFileExtFromDataUrl(url)}`}
                                                  className="flex items-center gap-0.5 text-xs font-bold text-indigo-600 hover:underline truncate max-w-[120px]"
                                                >
                                                  <Download className="w-3 h-3 shrink-0" /> 下载
                                                </a>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const next = fileUrls.filter((_, i) => i !== fi);
                                                    setVal(stringifyRouteReportFileUrls(next));
                                                  }}
                                                  className="text-left text-xs font-bold text-rose-500 hover:text-rose-700"
                                                >
                                                  移除
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => routeReportDisplayFileInputRefs.current[rk]?.click()}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                                          >
                                            <ImagePlus className="w-3.5 h-3.5" /> 添加图片或文件
                                          </button>
                                          {fileUrls.length > 0 && (
                                            <button
                                              type="button"
                                              onClick={() => setVal('')}
                                              className="px-2 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100"
                                            >
                                              全部清除
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        )}
                      </div>
                  ))}
                  {selectedNodesOrdered.length === 0 && (
                    <div className="py-14 border-2 border-dashed border-indigo-100 rounded-2xl text-center text-slate-400 text-xs">
                      请先在上方「可选工序」中选择工序，将在此按顺序排列
                    </div>
                  )}
                </div>
              </section>

              {/* 下：BOM 精细化配置（配色与「标准生产路线」一致） */}
              <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/20 p-4 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-black text-white">3</span>
                  <h4 className="text-sm font-black text-slate-800">BOM 精细化配置</h4>
                  <span className="text-[10px] text-slate-500">按 SKU / 变体维护需 BOM 工序的物料清单</span>
                </div>
                <BomVariantMatrix
                  product={workingProduct}
                  boms={boms}
                  enabledBOMNodes={enabledBOMNodes}
                  dictionaries={dictionaries}
                  activeVariantIdForBOM={activeVariantIdForBOM}
                  activeNodeIdForBOM={activeNodeIdForBOM}
                  singleSkuVariantId={singleSkuVariantId}
                  singleSkuNodeBOMs={singleSkuNodeBOMs}
                  onOpenBOMEditor={openBOMEditor}
                />
              </section>
            </div>

            {/* BOM 配置弹窗（单 SKU 与多变体共用） */}
            <BomEditorPortal
              product={workingProduct}
              boms={boms}
              globalNodes={globalNodes}
              dictionaries={dictionaries}
              categories={categories}
              products={products}
              state={bomEditorState}
              enabledBOMNodes={enabledBOMNodes}
              availableBOMSources={availableBOMSources}
              bomBlockedProductIds={bomBlockedProductIds}
              embeddedInQuickCreateModal={embeddedInQuickCreateModal}
              nestedOverlayZ={nestedOverlayZ}
              BomBatchAddPanelComponent={BomBatchAddPanel}
              copyBOMTriggerRef={copyBOMTriggerRef}
              onCopyBOMFrom={copyBOMFrom}
              onUpdateBOMItem={updateBOMItem}
              onSave={() => { void saveBOM(); }}
              onClose={closeBOMEditor}
            />
          </div>
        )}
        {/* 图片放大弹窗 */}
        {lightboxImageUrl && (
          <div className={`fixed inset-0 ${embeddedInQuickCreateModal ? nestedOverlayZ : 'z-[110]'} flex items-center justify-center p-8`} onClick={() => setLightboxImageUrl(null)}>
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />
            <button onClick={() => setLightboxImageUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
              <X className="w-8 h-8" />
            </button>
            <img src={lightboxImageUrl} alt="产品图片" className="relative z-10 max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
        <FilePreviewPortal preview={filePreview} onClose={closeFilePreview} />
      </div>
    );

};

export default ProductEditForm;
