import React from 'react';
import { Package } from 'lucide-react';

export interface FlowListProductCellProps {
  product?: {
    name?: string | null;
    sku?: string | null;
    imageUrl?: string | null;
  } | null;
  name?: string | null;
  sku?: string | null;
  /** 无名称时的占位，默认「未知产品」 */
  emptyNameLabel?: string;
}

/** 流水列表「产品」列：缩略图 + 名称 + SKU，与工单流水 OrderFlowView 一致 */
const FlowListProductCell: React.FC<FlowListProductCellProps> = ({
  product,
  name,
  sku,
  emptyNameLabel = '未知产品',
}) => {
  const displayName = (product?.name ?? name)?.trim() || emptyNameLabel;
  const displaySku = (product?.sku ?? sku)?.trim() ?? '';
  const imageUrl = product?.imageUrl?.trim() || '';

  return (
    <div className="flex items-center gap-2">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-8 h-8 rounded-lg object-cover border border-slate-100 shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-slate-400" />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-bold text-slate-800 truncate">{displayName}</p>
        <p className="text-[10px] font-bold text-slate-500">{displaySku}</p>
      </div>
    </div>
  );
};

export default FlowListProductCell;
