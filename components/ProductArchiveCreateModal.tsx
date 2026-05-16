import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, X } from 'lucide-react';
import type { Product, ProductCategory } from '../types';
import ProductEditForm from '../views/product-management/ProductEditForm';
import { useMasterData, useAppActions } from '../contexts/AppDataContext';

export interface ProductArchiveCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategoryId?: string;
  onCreated: (product: Product) => void;
}

function buildDraftProduct(categories: ProductCategory[], defaultCategoryId?: string): Product {
  const newId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const categoryId =
    defaultCategoryId && categories.some(c => c.id === defaultCategoryId)
      ? defaultCategoryId
      : categories[0]?.id ?? '';
  return {
    id: newId,
    sku: '',
    name: '',
    categoryId,
    milestoneNodeIds: [],
    categoryCustomData: {},
    routeReportValues: {},
    routeReportDisplayValues: {},
    salesPrice: undefined,
    purchasePrice: undefined,
    unitId: undefined,
    colorIds: [],
    sizeIds: [],
    variants: [],
    imageUrl: '',
  };
}

/**
 * 与「基础信息 → 产品与 BOM」中新建产品相同的完整编辑能力（嵌入 ProductEditForm）。
 * 用于进销存、计划、BOM 配置等处的「新增产品」，与基础信息 → 产品档案新建一致；经 lazy 加载避免与 ProductEditForm 循环依赖。
 */
export const ProductArchiveCreateModal: React.FC<ProductArchiveCreateModalProps> = ({
  isOpen,
  onClose,
  defaultCategoryId,
  onCreated,
}) => {
  const { products, categories, boms, dictionaries, partners, globalNodes, partnerCategories } = useMasterData();
  const { onUpdateProduct, onDeleteProduct, onUpdateBOM, refreshDictionaries, refreshPartners } = useAppActions();
  const [instanceKey, setInstanceKey] = useState(0);

  useEffect(() => {
    if (isOpen) setInstanceKey(k => k + 1);
  }, [isOpen]);

  const initialProduct = useMemo(
    () => buildDraftProduct(categories, defaultCategoryId),
    [instanceKey, categories, defaultCategoryId],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-searchable-product-quick-create
      className="fixed inset-0 z-[10800] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-archive-create-title"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="product-archive-create-title" className="text-sm font-semibold text-slate-900 truncate">
                新增产品
              </h2>
              <p className="text-[10px] text-slate-500 font-medium truncate">与产品档案中心一致，可配置颜色尺码、工序与 BOM</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all shrink-0"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-50 px-3 py-4 sm:px-4">
          <ProductEditForm
            key={instanceKey}
            initialProduct={initialProduct}
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
            onRefreshDictionaries={refreshDictionaries}
            onRefreshPartners={refreshPartners}
            onBack={onClose}
            permCanDelete={false}
            isPersistedProduct={false}
            embeddedInQuickCreateModal
            onProductPersisted={onCreated}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProductArchiveCreateModal;
