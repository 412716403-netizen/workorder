import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import * as api from '../services/api';
import type { Product } from '../types';
import { productThumbSrc, type ProductImageFields } from '../utils/productImageSrc';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

/** 产品缩略图点击预览：先显示 fallback，再按需拉原图 */
export type ProductImagePreviewTarget =
  | { mode: 'product'; productId: string; fallbackSrc?: string }
  /** 已是完整 URL（自定义字段附件等），不再请求产品详情 */
  | { mode: 'src'; src: string };

export function productPreviewFromProduct(
  product: ({ id: string } & ProductImageFields) | null | undefined,
): ProductImagePreviewTarget | null {
  if (!product?.id) return null;
  const fallback = productThumbSrc(product);
  if (!fallback) return null;
  return { mode: 'product', productId: product.id, fallbackSrc: fallback };
}

export function productPreviewFromSrc(src: string | null | undefined): ProductImagePreviewTarget | null {
  const s = (src ?? '').trim();
  if (!s) return null;
  return { mode: 'src', src: s };
}

export interface ProductImageLightboxProps {
  target: ProductImagePreviewTarget | null;
  onClose: () => void;
  /** 遮罩 z-index，默认 100 */
  zIndexClass?: string;
  alt?: string;
}

/**
 * 产品主图灯箱：product 模式会请求 GET /products/:id 换原图；
 * 请求中仍显示缩略图，失败则停留在 fallback。
 */
const ProductImageLightbox: React.FC<ProductImageLightboxProps> = ({
  target,
  onClose,
  zIndexClass = 'z-[100]',
  alt = '产品图片',
}) => {
  const [displaySrc, setDisplaySrc] = useState<string>('');
  const [loadingOriginal, setLoadingOriginal] = useState(false);

  useEffect(() => {
    if (!target) {
      setDisplaySrc('');
      setLoadingOriginal(false);
      return;
    }
    if (target.mode === 'src') {
      setDisplaySrc(target.src);
      setLoadingOriginal(false);
      return;
    }

    const fallback = (target.fallbackSrc ?? '').trim();
    setDisplaySrc(fallback);
    let cancelled = false;
    setLoadingOriginal(true);
    void api.products
      .get(target.productId)
      .then((p: Product) => {
        if (cancelled) return;
        const full = (p.imageUrl ?? '').trim();
        if (full) setDisplaySrc(full);
      })
      .catch(() => {
        /* 保持缩略图 */
      })
      .finally(() => {
        if (!cancelled) setLoadingOriginal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEscapeToClose(!!target && !!displaySrc, onClose);

  if (!target || !displaySrc) return null;

  return (
    <ModalPortal>
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 sm:p-6`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <div className="absolute inset-0 bg-black/80 animate-in fade-in" aria-hidden />
      <div
        className="relative z-10 max-w-full max-h-full rounded-lg bg-white p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={displaySrc}
          alt={alt}
          className="max-w-full max-h-[min(85vh,900px)] object-contain"
        />
      </div>
      {loadingOriginal && (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          加载原图…
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all"
        aria-label="关闭"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
    </ModalPortal>
  );
};

export default ProductImageLightbox;
