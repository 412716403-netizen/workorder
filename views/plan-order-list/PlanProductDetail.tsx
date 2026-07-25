import React, { useState } from 'react';
import { X, Package } from 'lucide-react';
import type {
  Product,
  ProductCategory,
  AppDictionaries,
  Partner,
  GlobalNodeTemplate,
  BOM,
} from '../../types';
import ProductQuickDetailBody from '../shared/ProductQuickDetailBody';
import { productThumbSrc } from '../../utils/productImageSrc';
import { ModalPortal } from '../../components/ModalPortal';
import ProductImageLightbox, {
  productPreviewFromProduct,
  type ProductImagePreviewTarget,
} from '../../components/ProductImageLightbox';

interface PlanProductDetailProps {
  viewProductId: string;
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  onClose: () => void;
  onFilePreview: (url: string, type: 'image' | 'pdf') => void;
  /** 叠层高度；资料库等高层弹窗内打开时需提高，默认 z-[95] */
  stackZClass?: string;
}

/** 灯箱需高于产品详情弹窗；从 stackZClass 解析数字并上浮 */
function lightboxZAbove(stackZClass: string): string {
  const m = /^z-\[(\d+)\]$/.exec(stackZClass.trim());
  if (m) return `z-[${Number(m[1]) + 100}]`;
  return 'z-[100]';
}

const PlanProductDetail: React.FC<PlanProductDetailProps> = ({
  viewProductId,
  products,
  categories,
  dictionaries,
  partners,
  globalNodes,
  boms,
  onClose,
  onFilePreview,
  stackZClass = 'z-[95]',
}) => {
  const [imagePreview, setImagePreview] = useState<ProductImagePreviewTarget | null>(null);
  const lightboxZClass = lightboxZAbove(stackZClass);
  const p = products.find(x => x.id === viewProductId);
  const cat = p && categories.find(c => c.id === p.categoryId);
  if (!p) return null;

  const thumbSrc = productThumbSrc(p);

  return (
    <ModalPortal>
    <div className={`fixed inset-0 ${stackZClass} flex items-center justify-center p-4 sm:p-6`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden max-h-[min(92vh,960px)] flex flex-col min-h-0" onClick={e => e.stopPropagation()}>
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            {thumbSrc ? (
              <button
                type="button"
                onClick={() => setImagePreview(productPreviewFromProduct(p))}
                className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:opacity-90 transition-opacity cursor-pointer"
                aria-label="查看产品图片"
                title="点击放大查看"
              >
                <img
                  loading="lazy"
                  decoding="async"
                  src={thumbSrc}
                  alt={p.name}
                  className="w-full h-full object-cover block"
                />
              </button>
            ) : (
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-400 shrink-0"><Package className="w-8 h-8" /></div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-900 truncate">{p.name}</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">SKU: {p.sku} · {cat?.name || '未分类'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 shrink-0"><X className="w-6 h-6" /></button>
        </div>
        <ProductQuickDetailBody
          product={p}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          globalNodes={globalNodes}
          boms={boms}
          products={products}
          onOpenFilePreview={onFilePreview}
          contentClassName="p-4 space-y-6"
        />
      </div>
    </div>
    <ProductImageLightbox
      target={imagePreview}
      onClose={() => setImagePreview(null)}
      zIndexClass={lightboxZClass}
      alt={p.name}
    />
    </ModalPortal>
  );
};

export default PlanProductDetail;
