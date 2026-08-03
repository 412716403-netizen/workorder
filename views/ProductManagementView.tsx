
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Package, 
  Plus, 
  Settings2, 
  Search,
  X,
  Upload,
  Loader2,
  Building2,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product, GlobalNodeTemplate, ProductCategory, PartnerCategory, BOM, AppDictionaries, Partner, ProductCodeAutoGen } from '../types';
import ProductImportModal from './ProductImportModal';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { pageSubtitleClass, pageTitleClass, formStandardControlIconClass } from '../styles/uiDensity';
import ProductEditForm from './product-management/ProductEditForm';
import PlanProductDetail from './plan-order-list/PlanProductDetail';
import { bomHasConfiguredItems } from '../utils/bomEffective';
import { buildProductCopyDraft } from '../utils/buildProductCopyDraft';
import { getProductCodeRule } from '../utils/productCodeRule';
import { getProductCategoryCustomFieldEntries } from '../utils/reportCustomDocField';
import { productMatchesSearchQuery } from '../utils/productSearchMatch';
import { compareProductsArchiveOrder } from '../utils/productSort';
import { isProductEnabled } from '../utils/productEnabled';
import { buildPartnerNameById, resolveProductPartnerName } from '../utils/productPartnerDisplay';
import { useConfigData, useMasterData, useOrdersData, useAppActions } from '../contexts/AppDataContext';
import { useClientPagination } from '../hooks/useClientPagination';
import ListPageControls from '../components/ListPageControls';
import * as api from '../services/api';
import { productThumbSrc } from '../utils/productImageSrc';
import ProductImageLightbox, {
  productPreviewFromProduct,
  type ProductImagePreviewTarget,
} from '../components/ProductImageLightbox';
import MediaFilePreviewOverlay, {
  type MediaFilePreview,
} from '../components/MediaFilePreviewOverlay';

const PRODUCT_ARCHIVE_PAGE_SIZE = 20;

const PRODUCT_ARCHIVE_ALL = '__all__';

interface ProductManagementViewProps {
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  categories: ProductCategory[];
  boms: BOM[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onUpdateProduct: (product: Product & { codeAutoGen?: ProductCodeAutoGen }) => Promise<Product | null>;
  onDeleteProduct?: (id: string) => Promise<boolean>;
  onUpdateBOM: (bom: BOM) => Promise<boolean>;
  onRefreshDictionaries: () => Promise<void>;
  onRefreshPartners: () => Promise<void>;
  onDetailViewChange?: (inDetail: boolean) => void;
  onRefreshProducts?: () => Promise<void>;
  permCanCreate?: boolean;
  permCanEdit?: boolean;
  permCanDelete?: boolean;
  initialProductId?: string | null;
  onClearInitialProductId?: () => void;
}

const ProductManagementView: React.FC<ProductManagementViewProps> = ({ 
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
  onDetailViewChange,
  onRefreshProducts,
  permCanCreate = true,
  permCanEdit = true,
  permCanDelete = true,
  initialProductId,
  onClearInitialProductId,
}) => {
  const { productionLinkMode, productCodeRules } = useConfigData();
  const { onUpdateProductCodeRules, refreshBoms } = useAppActions();
  const { masterDataReady } = useMasterData();
  const [imagePreview, setImagePreview] = useState<ProductImagePreviewTarget | null>(null);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<MediaFilePreview | null>(null);
  const { orders } = useOrdersData();
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>(PRODUCT_ARCHIVE_ALL);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  /** 复制产品时尚未落库的 BOM 草稿，保存产品后一并 create */
  const [pendingBoms, setPendingBoms] = useState<BOM[]>([]);
  const pendingBomsRef = useRef<BOM[]>([]);
  pendingBomsRef.current = pendingBoms;
  /** 本会话已成功写入过的 BOM id，避免 saveBOM 紧跟 flush 时因 React 未重渲再次 create */
  const createdBomIdsRef = useRef<Set<string>>(new Set());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [productArchiveSearch, setProductArchiveSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productArchiveSearch);
  const [togglingEnabledId, setTogglingEnabledId] = useState<string | null>(null);

  const categoryCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) { m.set(p.categoryId, (m.get(p.categoryId) || 0) + 1); }
    return m;
  }, [products]);

  const bomCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of boms) {
      if (!bomHasConfiguredItems(b)) continue;
      m.set(b.parentProductId, (m.get(b.parentProductId) || 0) + 1);
    }
    return m;
  }, [boms]);

  /** 作为 BOM 子件被引用的次数（物料被调用次数） */
  const materialCallCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of boms) {
      for (const it of b.items ?? []) {
        const pid = (it.productId ?? '').trim();
        if (!pid) continue;
        m.set(pid, (m.get(pid) || 0) + 1);
      }
    }
    return m;
  }, [boms]);

  const categoryMapPM = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const partnerNameById = useMemo(() => buildPartnerNameById(partners), [partners]);

  useEffect(() => {
    if (activeCategoryFilter === PRODUCT_ARCHIVE_ALL) return;
    if (categories.length > 0 && !categories.some(c => c.id === activeCategoryFilter)) {
      setActiveCategoryFilter(PRODUCT_ARCHIVE_ALL);
    }
  }, [categories, activeCategoryFilter]);

  useEffect(() => {
    onDetailViewChange?.(!!editingProduct);
  }, [editingProduct, onDetailViewChange]);

  useEffect(() => {
    if (initialProductId && !editingProduct) {
      const p = products.find(x => x.id === initialProductId);
      if (p) {
        setEditingProduct(JSON.parse(JSON.stringify(p)));
        onClearInitialProductId?.();
      }
    }
  }, [initialProductId, products]);

  const handleStartEditProduct = (p: Product) => {
    setEditingProduct(JSON.parse(JSON.stringify(p)));
  };

  const handleToggleEnabled = useCallback(async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!permCanEdit || togglingEnabledId) return;
    const nextEnabled = !isProductEnabled(product);
    setTogglingEnabledId(product.id);
    try {
      await api.products.update(product.id, { enabled: nextEnabled });
      if (onRefreshProducts) {
        await onRefreshProducts();
      } else {
        await onUpdateProduct({ ...product, enabled: nextEnabled });
      }
      toast.success(nextEnabled ? '已启用' : '已禁用');
    } catch (err) {
      toast.error((err as Error).message || '操作失败');
    } finally {
      setTogglingEnabledId(null);
    }
  }, [permCanEdit, togglingEnabledId, onRefreshProducts, onUpdateProduct]);

  const handleStartCreateProduct = () => {
    setPendingBoms([]);
    createdBomIdsRef.current.clear();
    const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEditingProduct({
      id: newId, sku: '', name: '',
      categoryId: activeCategoryFilter === PRODUCT_ARCHIVE_ALL ? (categories[0]?.id ?? '') : activeCategoryFilter,
      milestoneNodeIds: [],
      categoryCustomData: {}, routeReportValues: {}, routeReportDisplayValues: {}, salesPrice: undefined, purchasePrice: undefined,
      unitId: undefined,
      colorIds: [], sizeIds: [], variants: [], imageUrl: ''
    });
  };

  const handleStartCopyProduct = useCallback(async (source: Product) => {
    if (!permCanCreate) {
      toast.error('没有新建产品权限');
      return;
    }
    let full = source;
    try {
      // 列表可能是 lite 缓存（缺原图等），复制前拉完整档案
      full = await api.products.get(source.id) as Product;
    } catch {
      /* 拉详情失败则用列表数据继续 */
    }
    const draft = buildProductCopyDraft(full, boms, {
      catalog: products,
      useAutoCode: getProductCodeRule(productCodeRules ?? {}, full.categoryId).mode === 'auto',
    });
    createdBomIdsRef.current.clear();
    setPendingBoms(draft.boms);
    setEditingProduct(draft.product);
    toast.message(draft.boms.length > 0
      ? `已复制为新建草稿（含 ${draft.boms.length} 份 BOM），请确认后保存`
      : '已复制为新建草稿，请确认后保存');
  }, [permCanCreate, boms, products, productCodeRules]);

  const effectiveBoms = useMemo(() => {
    if (pendingBoms.length === 0) return boms;
    const pendingIds = new Set(pendingBoms.map(b => b.id));
    return [...boms.filter(b => !pendingIds.has(b.id)), ...pendingBoms];
  }, [boms, pendingBoms]);

  const persistBom = useCallback(async (bom: BOM): Promise<boolean> => {
    const known =
      createdBomIdsRef.current.has(bom.id) || boms.some(b => b.id === bom.id);
    if (known) {
      try {
        await api.boms.update(bom.id, bom);
        createdBomIdsRef.current.add(bom.id);
        void refreshBoms();
        return true;
      } catch (err) {
        toast.error((err as Error).message || 'BOM 更新失败');
        return false;
      }
    }
    const ok = await onUpdateBOM(bom);
    if (ok) createdBomIdsRef.current.add(bom.id);
    return ok;
  }, [boms, onUpdateBOM, refreshBoms]);

  const handleUpdateProductWithPendingBoms = useCallback(async (
    product: Product & { codeAutoGen?: ProductCodeAutoGen },
  ) => {
    const saved = await onUpdateProduct(product);
    if (!saved) return null;
    const drafts = pendingBomsRef.current.filter(bomHasConfiguredItems);
    if (drafts.length === 0) return saved;
    // 先清空 pending，避免并发路径重复 flush
    setPendingBoms([]);
    pendingBomsRef.current = [];
    let failed = 0;
    for (const bom of drafts) {
      const ok = await persistBom({ ...bom, parentProductId: saved.id });
      if (!ok) failed += 1;
    }
    void refreshBoms();
    if (failed > 0) {
      toast.error(`产品已保存，但有 ${failed} 份 BOM 未写入成功，请在编辑页重新配置`);
    }
    return saved;
  }, [onUpdateProduct, persistBom, refreshBoms]);

  const handleUpdateBomDropPending = useCallback(async (bom: BOM) => {
    const ok = await persistBom(bom);
    if (ok) {
      setPendingBoms(prev => prev.filter(b => b.id !== bom.id));
    }
    return ok;
  }, [persistBom]);

  const filteredProducts = useMemo(() => {
    const inCategory =
      activeCategoryFilter === PRODUCT_ARCHIVE_ALL
        ? products
        : products.filter(p => p.categoryId === activeCategoryFilter);
    const q = debouncedProductSearch.trim().toLowerCase();
    const searched =
      !q
        ? inCategory
        : inCategory.filter(p => {
            const cat = categoryMapPM.get(p.categoryId ?? '') ?? null;
            const partnerName = resolveProductPartnerName(p, cat, partnerNameById);
            return productMatchesSearchQuery(p, cat, q, { partnerName });
          });
    return [...searched].sort(compareProductsArchiveOrder);
  }, [products, activeCategoryFilter, debouncedProductSearch, categoryMapPM, partnerNameById]);

  const productListResetKey = `${activeCategoryFilter}|${debouncedProductSearch}`;
  const {
    page: productPage,
    setPage: setProductPage,
    totalPages: productTotalPages,
    pagedItems: pagedProducts,
    total: filteredProductTotal,
    pageSize: productPageSize,
  } = useClientPagination(filteredProducts, PRODUCT_ARCHIVE_PAGE_SIZE, productListResetKey);

  const productsInActiveCategoryCount = useMemo(() => {
    if (activeCategoryFilter === PRODUCT_ARCHIVE_ALL) return products.length;
    return products.filter(p => p.categoryId === activeCategoryFilter).length;
  }, [products, activeCategoryFilter]);

  if (editingProduct) {
    return (
      <ProductEditForm
        key={editingProduct.id}
        initialProduct={editingProduct}
        products={products}
        globalNodes={globalNodes}
        categories={categories}
        boms={effectiveBoms}
        dictionaries={dictionaries}
        partners={partners}
        partnerCategories={partnerCategories}
        onUpdateProduct={handleUpdateProductWithPendingBoms}
        onDeleteProduct={onDeleteProduct}
        onUpdateBOM={handleUpdateBomDropPending}
        onRefreshDictionaries={onRefreshDictionaries}
        onRefreshPartners={onRefreshPartners}
        onBack={() => {
          setPendingBoms([]);
          createdBomIdsRef.current.clear();
          setEditingProduct(null);
        }}
        permCanDelete={permCanDelete}
        isPersistedProduct={products.some(p => p.id === editingProduct.id)}
        productionLinkMode={productionLinkMode}
        ordersForProcessLock={orders}
        productCodeRules={productCodeRules}
        onUpdateProductCodeRules={onUpdateProductCodeRules}
      />
    );
  }

  // Phase 3.F：products 属 secondary 批后台加载；未就绪且列表为空时显示局部 loading，避免闪「暂无数据」
  if (!masterDataReady && products.length === 0) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          <span className="text-sm text-slate-400 font-medium">产品档案加载中…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div>
          <h1 className={pageTitleClass}>产品与 BOM 档案中心</h1>
          <p className={pageSubtitleClass}>定义业务规则、生产规格与工序物料明细</p>
        </div>
        {permCanCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-indigo-50 hover:border-indigo-300 active:scale-[0.98] transition-all"
            >
              <Upload className="w-4 h-4 shrink-0" /> 导入产品
            </button>
            <button
              type="button"
              onClick={handleStartCreateProduct}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4 shrink-0" /> 创建产品
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter(PRODUCT_ARCHIVE_ALL)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${activeCategoryFilter === PRODUCT_ARCHIVE_ALL ? 'bg-indigo-600 text-white shadow-sm border-indigo-600 hover:bg-indigo-700 hover:border-indigo-700' : 'bg-white/60 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-800 hover:border-slate-300'}`}
            >
              全部 ({products.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryFilter(cat.id)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${activeCategoryFilter === cat.id ? 'bg-indigo-600 text-white shadow-sm border-indigo-600 hover:bg-indigo-700 hover:border-indigo-700' : 'bg-white/60 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-800 hover:border-slate-300'}`}
              >
                {cat.name} ({categoryCountMap.get(cat.id) || 0})
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-sm sm:shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input type="search" value={productArchiveSearch} onChange={e => setProductArchiveSearch(e.target.value)}
              placeholder="搜索名称、编号、合作单位、备注或分类自定义内容…"
              className={`${formStandardControlIconClass} bg-white pr-10 shadow-sm`}
              aria-label="搜索产品" />
            {productArchiveSearch.trim() !== '' && (
              <button type="button" onClick={() => setProductArchiveSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all" aria-label="清空搜索">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

          {productArchiveSearch.trim() !== '' && productsInActiveCategoryCount > 0 && (
            <p className="text-xs font-bold text-slate-500">
              当前分类下找到 <span className="text-indigo-600 tabular-nums">{filteredProductTotal}</span> 条
              {filteredProductTotal < productsInActiveCategoryCount && (
                <span className="text-slate-400 font-medium">（共 {productsInActiveCategoryCount} 条）</span>
              )}
              {productTotalPages > 1 && (
                <span className="text-slate-400 font-medium"> · 每页 {productPageSize} 条</span>
              )}
            </p>
          )}
          {productArchiveSearch.trim() === '' && filteredProductTotal > 0 && productTotalPages > 1 && (
            <p className="text-xs font-bold text-slate-500">
              共 <span className="text-indigo-600 tabular-nums">{filteredProductTotal}</span> 条 · 每页 {productPageSize} 条
            </p>
          )}

          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
              <Search className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm font-bold text-slate-600">
                {productsInActiveCategoryCount === 0 ? '该分类下暂无产品' : productArchiveSearch.trim() ? '未找到匹配的产品' : '该分类下暂无产品'}
              </p>
              {productArchiveSearch.trim() !== '' && productsInActiveCategoryCount > 0 && (
                <button type="button" onClick={() => setProductArchiveSearch('')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">清空搜索条件</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-2 w-12"></th>
                    <th className="py-3 px-3">产品编号</th>
                    <th className="py-3 px-3 hidden sm:table-cell">产品名称</th>
                    <th className="py-3 px-3 hidden md:table-cell">分类</th>
                    <th className="py-3 px-3 text-center hidden lg:table-cell">BOM</th>
                    <th className="py-3 px-3 text-center hidden lg:table-cell" title="作为其它产品 BOM 子件被引用的次数">
                      被调用
                    </th>
                    <th className="py-3 px-3 text-right hidden sm:table-cell">价格</th>
                    <th className="py-3 px-3 text-center w-20">状态</th>
                    <th className="py-3 pr-4 pl-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedProducts.map(product => {
                    const category = categoryMapPM.get(product.categoryId);
                    const bomCount = bomCountMap.get(product.id) || 0;
                    const callCount = materialCallCountMap.get(product.id) || 0;
                    const sales = product.salesPrice ?? 0;
                    const purchase = product.purchasePrice ?? 0;
                    const displayPrice = sales > 0 ? sales : purchase;
                    const priceLabel = sales > 0 ? '销售' : '采购';
                    const customTags = getProductCategoryCustomFieldEntries(product, category, { includeFile: false });
                    const partnerName = resolveProductPartnerName(product, category, partnerNameById);
                    const enabled = isProductEnabled(product);
                    return (
                      <tr
                        key={product.id}
                        className={`group hover:bg-indigo-50/40 transition-colors ${!enabled ? 'opacity-60' : ''}`}
                      >
                        <td className="py-3 pl-4 pr-2">
                          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center overflow-hidden text-slate-400 shrink-0 border border-slate-100">
                            {productThumbSrc(product) ? (
                              <button type="button" onClick={() => setImagePreview(productPreviewFromProduct(product))} className="w-full h-full focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="查看产品图片">
                              <img loading="lazy" decoding="async" src={productThumbSrc(product)} alt={product.name} className="w-full h-full object-cover" />
                              </button>
                            ) : (
                              <Package className="w-4 h-4" />
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => setViewProductId(product.id)}
                            className="text-left text-sm font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors truncate max-w-[220px]"
                            title="查看产品详情"
                          >
                            {product.name}
                            {!enabled && (
                              <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-500 align-middle no-underline">
                                已禁用
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewProductId(product.id)}
                            className="sm:hidden block text-left text-[10px] text-slate-400 font-medium mt-0.5 hover:text-indigo-600 hover:underline"
                            title="查看产品详情"
                          >
                            {product.sku}
                          </button>
                          {(partnerName || customTags.length > 0) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {partnerName && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                  <Building2 className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                                  {partnerName}
                                </span>
                              )}
                              {customTags.map(({ field, display }) => (
                                <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                  {field.label}: {display}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 hidden sm:table-cell">
                          <button
                            type="button"
                            onClick={() => setViewProductId(product.id)}
                            className="text-left text-xs text-slate-500 font-medium hover:text-indigo-600 hover:underline transition-colors"
                            title="查看产品详情"
                          >
                            {product.sku || '—'}
                          </button>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          {category && <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-indigo-600">{category.name}</span>}
                        </td>
                        <td className="py-3 px-3 text-center hidden lg:table-cell">
                          {bomCount > 0 ? <span className="text-xs font-bold text-emerald-600 tabular-nums">{bomCount}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-3 px-3 text-center hidden lg:table-cell">
                          {callCount > 0 ? (
                            <span className="text-xs font-bold text-violet-600 tabular-nums" title="BOM 子件引用次数">
                              {callCount}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right hidden sm:table-cell">
                          <span className="text-sm font-bold text-slate-800">¥{displayPrice > 0 ? displayPrice.toLocaleString() : '0'}</span>
                          {displayPrice > 0 && <span className="text-[9px] text-slate-400 ml-1">{priceLabel}</span>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {permCanEdit ? (
                            <button
                              type="button"
                              disabled={togglingEnabledId === product.id}
                              onClick={e => void handleToggleEnabled(product, e)}
                              title={enabled ? '点击禁用' : '点击启用'}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 ${
                                enabled ? 'bg-indigo-600' : 'bg-slate-300'
                              }`}
                              aria-label={enabled ? '禁用产品' : '启用产品'}
                              aria-pressed={enabled}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                  enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          ) : (
                            <span className={`text-[10px] font-bold ${enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {enabled ? '启用' : '禁用'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 pl-2">
                          <div className="flex items-center justify-end gap-0.5">
                            {permCanCreate && (
                              <button
                                type="button"
                                onClick={() => { void handleStartCopyProduct(product); }}
                                className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="复制为新产品"
                                aria-label="复制为新产品"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            )}
                            {permCanEdit && (
                              <button type="button" onClick={() => handleStartEditProduct(product)}
                                className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="编辑产品"
                                aria-label="编辑产品">
                                <Settings2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <ListPageControls
                page={productPage}
                totalPages={productTotalPages}
                total={filteredProductTotal}
                pageSize={productPageSize}
                onPageChange={setProductPage}
              />
            </div>
          )}
      </div>

      <ProductImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        categories={categories}
        dictionaries={dictionaries}
        products={products}
        onRefreshDictionaries={onRefreshDictionaries}
        onImportComplete={async () => { setImportModalOpen(false); if (onRefreshProducts) await onRefreshProducts(); }}
      />
      <ProductImageLightbox target={imagePreview} onClose={() => setImagePreview(null)} />
      {viewProductId && (
        <PlanProductDetail
          viewProductId={viewProductId}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          globalNodes={globalNodes}
          boms={boms}
          onClose={() => setViewProductId(null)}
          onFilePreview={(url, type) => setFilePreview({ src: url, kind: type })}
        />
      )}
      <MediaFilePreviewOverlay preview={filePreview} onClose={() => setFilePreview(null)} />
    </div>
  );
};

export default React.memo(ProductManagementView);

