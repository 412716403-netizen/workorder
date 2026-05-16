/**
 * 返工详情/编辑视图共用的"产品 / SKU + 自定义字段标签"单元格 (P9 抽离)。
 *
 * 原 ReworkReportFlowDetailModal 在 4 个表格分支里重复了 80+ 行的相同 JSX:
 * 产品图 / 缺省图 / 产品名 / SKU / category 自定义字段标签(及可选工单号)。
 */
import React from 'react';
import { Package } from 'lucide-react';
import type { Product } from '../../../types';
import type { getProductCategoryCustomFieldEntries } from '../../../utils/reportCustomDocField';

type CustomTags = ReturnType<typeof getProductCategoryCustomFieldEntries>;

interface Props {
  product: Product | undefined;
  fallbackProductId?: string;
  customTags: CustomTags;
  /** 仅在 productionLinkMode='order' 的 no-color-size 详情视图下展示工单号 */
  showOrderNumber?: { orderNumber: string } | null;
}

const ReworkProductInfoCell: React.FC<Props> = ({ product, fallbackProductId, customTags, showOrderNumber }) => (
  <div className="flex min-w-0 items-start gap-2">
    {product?.imageUrl ? (
      <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
        <img
          src={product.imageUrl}
          alt={product?.name ?? '—'}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    ) : (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
        <Package className="h-4 w-4" />
      </div>
    )}
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-bold text-slate-700">{product?.name ?? fallbackProductId ?? '—'}</span>
        {product?.sku?.trim() ? (
          <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
            {product.sku.trim()}
          </span>
        ) : null}
      </div>
      {customTags.length > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {customTags.map(({ field, display }) => (
            <span
              key={field.id}
              className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
            >
              {field.label}: {display}
            </span>
          ))}
        </div>
      ) : null}
      {showOrderNumber?.orderNumber ? (
        <p className="mt-1 text-[10px] font-medium text-slate-500">
          工单 <span className="font-bold text-slate-600 tabular-nums">{showOrderNumber.orderNumber}</span>
        </p>
      ) : null}
    </div>
  </div>
);

export default ReworkProductInfoCell;
