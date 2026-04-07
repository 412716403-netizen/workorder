
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Settings2, 
  Search,
  X,
  Upload,
} from 'lucide-react';
import { Product, GlobalNodeTemplate, ProductCategory, PartnerCategory, BOM, AppDictionaries, Partner } from '../types';
import ProductImportModal from './ProductImportModal';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { pageSubtitleClass, pageTitleClass } from '../styles/uiDensity';
import ProductEditForm from './product-management/ProductEditForm';

const PRODUCT_ARCHIVE_ALL = '__all__';

interface ProductManagementViewProps {
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  categories: ProductCategory[];
  boms: BOM[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onUpdateProduct: (product: Product) => Promise<boolean>;
  onDeleteProduct?: (id: string) => Promise<boolean>;
  onUpdateBOM: (bom: BOM) => Promise<boolean>;
  onRefreshDictionaries: () => Promise<void>;
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
  onDetailViewChange,
  onRefreshProducts,
  permCanCreate = true,
  permCanEdit = true,
  permCanDelete = true,
  initialProductId,
  onClearInitialProductId,
}) => {
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>(PRODUCT_ARCHIVE_ALL);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [productArchiveSearch, setProductArchiveSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productArchiveSearch);

  const categoryCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) { m.set(p.categoryId, (m.get(p.categoryId) || 0) + 1); }
    return m;
  }, [products]);

  const bomCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of boms) { m.set(b.parentProductId, (m.get(b.parentProductId) || 0) + 1); }
    return m;
  }, [boms]);

  const categoryMapPM = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

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

  const handleStartCreateProduct = () => {
    const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEditingProduct({
      id: newId, sku: '', name: '',
      categoryId: activeCategoryFilter === PRODUCT_ARCHIVE_ALL ? (categories[0]?.id ?? '') : activeCategoryFilter,
      milestoneNodeIds: [],
      categoryCustomData: {}, routeReportValues: {}, salesPrice: undefined, purchasePrice: undefined,
      unitId: undefined,
      colorIds: [], sizeIds: [], variants: [], imageUrl: ''
    });
  };

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
            const n = (p.name ?? '').toLowerCase();
            const s = (p.sku ?? '').toLowerCase();
            const d = (p.description ?? '').toLowerCase();
            return n.includes(q) || s.includes(q) || d.includes(q);
          });
    return searched.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  }, [products, activeCategoryFilter, debouncedProductSearch]);

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
        boms={boms}
        dictionaries={dictionaries}
        partners={partners}
        partnerCategories={partnerCategories}
        onUpdateProduct={onUpdateProduct}
        onDeleteProduct={onDeleteProduct}
        onUpdateBOM={onUpdateBOM}
        onRefreshDictionaries={onRefreshDictionaries}
        onBack={() => setEditingProduct(null)}
        permCanDelete={permCanDelete}
        isPersistedProduct={products.some(p => p.id === editingProduct.id)}
      />
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
              placeholder="搜索名称、产品编号、备注…"
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none shadow-sm"
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
              当前分类下找到 <span className="text-indigo-600 tabular-nums">{filteredProducts.length}</span> 条
              {filteredProducts.length < productsInActiveCategoryCount && (
                <span className="text-slate-400 font-medium">（共 {productsInActiveCategoryCount} 条）</span>
              )}
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
                    <th className="py-3 px-3">产品名称</th>
                    <th className="py-3 px-3 hidden sm:table-cell">SKU</th>
                    <th className="py-3 px-3 hidden md:table-cell">分类</th>
                    <th className="py-3 px-3 text-center hidden md:table-cell">工序</th>
                    <th className="py-3 px-3 text-center hidden md:table-cell">变体</th>
                    <th className="py-3 px-3 text-center hidden lg:table-cell">BOM</th>
                    <th className="py-3 px-3 text-right hidden sm:table-cell">价格</th>
                    <th className="py-3 pr-4 pl-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(product => {
                    const category = categoryMapPM.get(product.categoryId);
                    const bomCount = bomCountMap.get(product.id) || 0;
                    const sales = product.salesPrice ?? 0;
                    const purchase = product.purchasePrice ?? 0;
                    const displayPrice = sales > 0 ? sales : purchase;
                    const priceLabel = sales > 0 ? '销售' : '采购';
                    return (
                      <tr key={product.id} className="group hover:bg-indigo-50/40 transition-colors cursor-pointer" onClick={() => permCanEdit && handleStartEditProduct(product)}>
                        <td className="py-3 pl-4 pr-2">
                          <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden text-slate-400 shrink-0">
                            {product.imageUrl ? (
                              <img loading="lazy" decoding="async" src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-4 h-4" />
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-[220px]">{product.name}</p>
                          <p className="sm:hidden text-[10px] text-slate-400 font-medium mt-0.5">{product.sku}</p>
                        </td>
                        <td className="py-3 px-3 hidden sm:table-cell">
                          <span className="text-xs text-slate-500 font-medium">{product.sku}</span>
                        </td>
                        <td className="py-3 px-3 hidden md:table-cell">
                          {category && <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-indigo-600">{category.name}</span>}
                        </td>
                        <td className="py-3 px-3 text-center hidden md:table-cell">
                          <span className="text-xs font-bold text-blue-600 tabular-nums">{product.milestoneNodeIds.length}</span>
                        </td>
                        <td className="py-3 px-3 text-center hidden md:table-cell">
                          <span className="text-xs font-bold text-amber-600 tabular-nums">{product.variants.length}</span>
                        </td>
                        <td className="py-3 px-3 text-center hidden lg:table-cell">
                          {bomCount > 0 ? <span className="text-xs font-bold text-emerald-600 tabular-nums">{bomCount}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-3 px-3 text-right hidden sm:table-cell">
                          <span className="text-sm font-bold text-slate-800">¥{displayPrice > 0 ? displayPrice.toLocaleString() : '0'}</span>
                          {displayPrice > 0 && <span className="text-[9px] text-slate-400 ml-1">{priceLabel}</span>}
                        </td>
                        <td className="py-3 pr-4 pl-2">
                          {permCanEdit && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleStartEditProduct(product); }}
                              className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                              <Settings2 className="w-4 h-4" />
                            </button>
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

      <ProductImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        categories={categories}
        dictionaries={dictionaries}
        products={products}
        onRefreshDictionaries={onRefreshDictionaries}
        onImportComplete={async () => { setImportModalOpen(false); if (onRefreshProducts) await onRefreshProducts(); }}
      />
    </div>
  );
};

export default React.memo(ProductManagementView);

