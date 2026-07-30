import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import type { BOM, Product } from '../../types';
import { findBomParentProductIds } from '../../utils/bomWhereUsed';

/** 通用辅料可能被上百个产品引用，默认折叠到这个条数 */
const COLLAPSED_ROW_COUNT = 10;

export interface ProductBomWhereUsedSectionProps {
  product: Product;
  boms: BOM[];
  products: Product[];
  /** 点击父产品打开其详情 */
  onOpenProduct?: (productId: string) => void;
}

const ProductBomWhereUsedSection: React.FC<ProductBomWhereUsedSectionProps> = ({
  product: p,
  boms,
  products,
  onOpenProduct,
}) => {
  const [expanded, setExpanded] = useState(false);
  const parentIds = useMemo(() => findBomParentProductIds(boms, p.id), [boms, p.id]);

  useEffect(() => {
    setExpanded(false);
  }, [p.id]);

  const rows = useMemo(() => {
    if (parentIds.length === 0) return [];
    const productsById = new Map(products.map(x => [x.id, x]));
    return parentIds
      .map(parentProductId => {
        const parent = productsById.get(parentProductId);
        // Product.name 是产品编号，Product.sku 是产品名称（见 types.ts 注释）
        const code = (parent?.name || '').trim();
        const productName = (parent?.sku || '').trim();
        return {
          parentProductId,
          exists: Boolean(parent),
          label: [code, productName].filter(Boolean).join(' ') || '未知产品',
          sortKey: code || productName,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'zh'));
  }, [parentIds, products]);

  if (rows.length === 0) return null;

  const collapsible = rows.length > COLLAPSED_ROW_COUNT;
  const visibleRows = collapsible && !expanded ? rows.slice(0, COLLAPSED_ROW_COUNT) : rows;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <Link2 className="w-3.5 h-3.5" /> 被以下产品调用
      </h3>
      <div className="space-y-2">
        {visibleRows.map(row => (
          <div
            key={row.parentProductId}
            className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
          >
            {row.exists && onOpenProduct ? (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onOpenProduct(row.parentProductId);
                }}
                className="text-sm font-bold text-indigo-600 hover:underline inline-flex items-center gap-1 max-w-full text-left"
                title="查看产品详情"
              >
                <span className="truncate">{row.label}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <p className="text-sm font-bold text-slate-800 truncate">{row.label}</p>
            )}
          </div>
        ))}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
        >
          {expanded ? `收起（共 ${rows.length} 个）` : `展开全部（共 ${rows.length} 个）`}
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};

export default ProductBomWhereUsedSection;
