import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronRight } from 'lucide-react';
import type {
  AppDictionaries,
  BOM,
  GlobalNodeTemplate,
  Product,
  ProductCategory,
} from '../../types';
import { bomHasConfiguredItems } from '../../utils/bomEffective';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';

export interface ProductBomSectionProps {
  product: Product;
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  products: Product[];
  /** 点击 BOM 子件打开该物料产品详情 */
  onOpenProduct?: (productId: string) => void;
}

const ProductBomSection: React.FC<ProductBomSectionProps> = ({
  product: p,
  categories,
  dictionaries,
  globalNodes,
  boms,
  products,
  onOpenProduct,
}) => {
  const [bomSkuId, setBomSkuId] = useState<string | null>(null);

  // boms 是全量清单，堆叠详情时每层都会重渲染，这里收敛为一次过滤
  const productBomsWithItems = useMemo(
    () => boms.filter(b => b.parentProductId === p.id && bomHasConfiguredItems(b)),
    [boms, p.id],
  );
  const productsById = useMemo(() => new Map(products.map(x => [x.id, x])), [products]);

  useEffect(() => {
    const singleId = `single-${p.id}`;
    const variantIds =
      p.variants && p.variants.length > 0 ? p.variants.map(v => v.id) : [singleId];
    if (variantIds.length === 1) {
      const only = variantIds[0];
      if (productBomsWithItems.some(b => b.variantId === only)) {
        setBomSkuId(only);
        return;
      }
    }
    setBomSkuId(null);
  }, [p.id, p.variants, productBomsWithItems]);

  const hasBomNodes = (p.milestoneNodeIds || []).some(
    nid => globalNodes.find(n => n.id === nid)?.hasBOM
  );
  const singleSkuId = `single-${p.id}`;
  const hasVariantMatrix = (p.variants?.length ?? 0) > 0;
  const skuOptions: { id: string; label: string }[] = hasVariantMatrix
    ? p.variants.map(v => ({
        id: v.id,
        label:
          [
            dictionaries.colors?.find(c => c.id === v.colorId)?.name,
            dictionaries.sizes?.find(s => s.id === v.sizeId)?.name,
          ]
            .filter(Boolean)
            .join(' / ') || v.skuSuffix,
      }))
    : [{ id: singleSkuId, label: '单 SKU' }];
  const selectedSkuBoms = bomSkuId
    ? productBomsWithItems.filter(b => b.variantId === bomSkuId)
    : [];

  if (productBomsWithItems.length === 0 && !hasBomNodes) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <Boxes className="w-3.5 h-3.5" /> 工艺 BOM
      </h3>
      {hasVariantMatrix && (
        <div className="flex flex-wrap gap-2">
          {skuOptions.map(opt => {
            const hasBom = productBomsWithItems.some(b => b.variantId === opt.id);
            const selected = bomSkuId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBomSkuId(opt.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                  selected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300 ring-offset-1'
                    : hasBom
                      ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-200'
                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                }`}
              >
                {opt.label}
                {!hasBom && <span className="text-[10px] ml-1 font-medium">(未配置)</span>}
              </button>
            );
          })}
        </div>
      )}
      {bomSkuId && selectedSkuBoms.length > 0 ? (
        <div className="space-y-4 pt-1">
          {selectedSkuBoms.map(bom => {
            const nodeName = bom.nodeId ? globalNodes.find(n => n.id === bom.nodeId)?.name : null;
            return (
              <div key={bom.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div>
                    {nodeName && (
                      <p className="text-[10px] font-bold text-indigo-600 mb-0.5">{nodeName}</p>
                    )}
                    <p className="text-xs font-bold text-slate-600">{bom.name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {bom.items
                    .filter(it => (it.productId ?? '').trim() !== '')
                    .map((item, idx) => {
                      const subProd = productsById.get(item.productId);
                      const subUnit = subProd?.unitId
                        ? dictionaries.units?.find(u => u.id === subProd.unitId)?.name
                        : '件';
                      const subCat = categories.find(c => c.id === subProd?.categoryId);
                      const customTags = getProductCategoryCustomFieldEntries(subProd, subCat, {
                        includeFile: false,
                      });
                      const label = subProd
                        ? [
                            (subProd.name || '').trim() || '未知物料',
                            (subProd.sku || '').trim(),
                          ]
                            .filter(Boolean)
                            .join(' ')
                        : '未知物料';
                      return (
                        <div
                          key={`${bom.id}-${idx}`}
                          className="rounded-xl bg-white border border-slate-100 px-3 py-2"
                        >
                          <div className="flex justify-between gap-2 items-start">
                            <div className="min-w-0 flex-1">
                              {subProd && onOpenProduct ? (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    onOpenProduct(subProd.id);
                                  }}
                                  className="text-sm font-bold text-indigo-600 hover:underline inline-flex items-center gap-1 max-w-full text-left"
                                  title="查看物料详情"
                                >
                                  <span className="truncate">{label}</span>
                                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                                </button>
                              ) : (
                                <p className="text-sm font-bold text-slate-800 truncate">{label}</p>
                              )}
                              {customTags.length > 0 && (
                                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                  {customTags.map(({ field, display }) => (
                                    <span
                                      key={field.id}
                                      className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                    >
                                      {field.label}: {display}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="text-sm font-black text-indigo-600 shrink-0">
                              ×{item.quantity}{' '}
                              <span className="text-xs font-bold text-slate-500">{subUnit}</span>
                            </span>
                          </div>
                          {item.note?.trim() && (
                            <p className="text-[11px] text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
                              备注：{item.note.trim()}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      ) : bomSkuId ? (
        <p className="text-sm text-slate-400 italic py-2">该规格尚未配置有效 BOM 物料明细</p>
      ) : hasVariantMatrix ? (
        <p className="text-xs text-slate-400 italic">请选择上方规格查看 BOM</p>
      ) : null}
    </div>
  );
};

export default ProductBomSection;
