import React, { useCallback, useEffect, useState } from 'react';
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
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { parseModalZIndex } from '../../utils/modalZIndex';

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

const DEFAULT_STACK_Z = 95;
/** 下钻各层之间的 z-index 间距，留出空间给层内的灯箱等浮层 */
const LAYER_Z_STEP = 200;

/**
 * 产品只读详情：用 productId 栈做多层下钻（BOM 子件 / 被调用父产品）。
 * 各层 z-index 用内联 style（不用动态 Tailwind 类），否则 JIT 扫不到 `z-[295]` 等类名，
 * 子层会落在父层后面看起来像「弹窗没出来」。
 */
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
  stackZClass = `z-[${DEFAULT_STACK_Z}]`,
}) => {
  const [stack, setStack] = useState<string[]>([viewProductId]);
  const [imagePreview, setImagePreview] = useState<ProductImagePreviewTarget | null>(null);
  const zBase = parseModalZIndex(stackZClass, DEFAULT_STACK_Z);

  useEffect(() => {
    setStack([viewProductId]);
    setImagePreview(null);
  }, [viewProductId]);

  const openProduct = useCallback(
    (productId: string) => {
      const id = (productId ?? '').trim();
      if (!id) return;
      if (!products.some(x => x.id === id)) return;
      setStack(prev => {
        // A→B→A 时回退到已有那层，避免互相引用的产品把栈无限叠高
        const existing = prev.indexOf(id);
        return existing >= 0 ? prev.slice(0, existing + 1) : [...prev, id];
      });
    },
    [products],
  );

  const closeLayer = useCallback(
    (index: number) => {
      if (index <= 0) {
        onClose();
        return;
      }
      setStack(prev => prev.slice(0, index));
      setImagePreview(null);
    },
    [onClose],
  );

  const closeTopLayer = useCallback(() => {
    closeLayer(stack.length - 1);
  }, [closeLayer, stack.length]);

  // 灯箱自己也监听 Esc，打开时让它优先处理
  useEscapeToClose(imagePreview == null, closeTopLayer);

  if (stack.length === 0) return null;

  const topProduct = products.find(x => x.id === stack[stack.length - 1]);
  // 灯箱要高于当前最顶层详情
  const lightboxZ = zBase + stack.length * LAYER_Z_STEP;

  return (
    <ModalPortal>
      {stack.map((productId, index) => {
        const p = products.find(x => x.id === productId);
        if (!p) return null;
        const cat = categories.find(c => c.id === p.categoryId);
        const thumbSrc = productThumbSrc(p);
        const layerZ = zBase + index * LAYER_Z_STEP;
        return (
          <div
            key={`product-detail-${index}-${productId}`}
            className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
            style={{ zIndex: layerZ }}
          >
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => closeLayer(index)}
            />
            <div
              className="relative z-10 bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden max-h-[min(92vh,960px)] flex flex-col min-h-0"
              onClick={e => e.stopPropagation()}
            >
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
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-400 shrink-0">
                      <Package className="w-8 h-8" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-xl font-black text-slate-900 truncate">{p.name}</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">
                      SKU: {p.sku} · {cat?.name || '未分类'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => closeLayer(index)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
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
                onOpenProduct={openProduct}
                contentClassName="p-4 space-y-6"
              />
            </div>
          </div>
        );
      })}
      <ProductImageLightbox
        target={imagePreview}
        onClose={() => setImagePreview(null)}
        zIndex={lightboxZ}
        alt={topProduct?.name}
      />
    </ModalPortal>
  );
};

export default PlanProductDetail;
