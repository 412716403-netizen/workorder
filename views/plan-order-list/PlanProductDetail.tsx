import React from 'react';
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
}) => {
  const p = products.find(x => x.id === viewProductId);
  const cat = p && categories.find(c => c.id === p.categoryId);
  if (!p) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col min-h-0" onClick={e => e.stopPropagation()}>
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            {p.imageUrl ? (
              <img loading="lazy" decoding="async" src={p.imageUrl} alt={p.name} className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0" />
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
  );
};

export default PlanProductDetail;
