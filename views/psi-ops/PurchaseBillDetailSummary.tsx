import React, { useMemo } from 'react';
import { Clock, Package, User } from 'lucide-react';
import type { AppDictionaries, Product, ProductVariant, Warehouse } from '../../types';
import { formatPsiDocListTime } from '../../utils/flowDocSort';
import { formatPsiDocNumForList } from './psiOpsListFormatting';

export interface PurchaseBillDetailSummaryProps {
  docNumber: string;
  recordsList: any[];
  productMapPSI: Map<string, Product>;
  warehouseMapPSI: Map<string, Warehouse>;
  dictionaries: AppDictionaries;
  getUnitName: (productId: string) => string;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
}

const PurchaseBillDetailSummary: React.FC<PurchaseBillDetailSummaryProps> = ({
  docNumber,
  recordsList,
  productMapPSI,
  warehouseMapPSI,
  dictionaries,
  getUnitName,
  formatQtyDisplay,
}) => {
  const docItems = useMemo(
    () => recordsList.filter((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === docNumber),
    [recordsList, docNumber],
  );

  const mainInfo = docItems[0];
  const totalQty = useMemo(
    () => docItems.reduce((s, i) => s + formatQtyDisplay(i.quantity), 0),
    [docItems, formatQtyDisplay],
  );
  const totalAmount = useMemo(
    () => docItems.reduce((s, i) => s + formatQtyDisplay(i.quantity) * (Number(i.purchasePrice) || 0), 0),
    [docItems, formatQtyDisplay],
  );

  const rowGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    docItems.forEach((item: any) => {
      const gid = item.lineGroupId ?? item.id;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(item);
    });
    return Object.entries(groups);
  }, [docItems]);

  if (!mainInfo) {
    return <p className="text-sm text-slate-500 py-8 text-center">未找到该采购单数据。</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-black text-slate-800">{mainInfo.partner || '未指定单位'}</span>
          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-indigo-50 text-indigo-600 border-indigo-100">
            {formatPsiDocNumForList(docNumber)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-slate-400 uppercase">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatPsiDocListTime(docItems as any[])}
          </span>
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> 经办: {mainInfo.operator || '—'}
          </span>
        </div>
        <div className="flex flex-wrap gap-6 pt-1 border-t border-slate-200/80 text-sm">
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
            <p className="font-black text-slate-800 tabular-nums">{totalQty.toLocaleString()} PCS</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计金额</p>
            <p className="font-black text-emerald-600 tabular-nums">¥{totalAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
              <th className="py-2.5 px-3 text-left">产品 / SKU</th>
              <th className="py-2.5 px-3 text-center">入库仓库</th>
              <th className="py-2.5 px-3 text-right">采购价</th>
              <th className="py-2.5 px-3 text-right">金额</th>
              <th className="py-2.5 px-3 text-right">数量</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rowGroups.map(([gid, grp]) => {
              const first = grp[0];
              const product = productMapPSI.get(first.productId);
              const rowProductName = product?.name || (first as any)?.productName;
              const rowProductSku = product?.sku || (first as any)?.productSku;
              const warehouse = warehouseMapPSI.get(first.warehouseId);
              const orderQty = grp.reduce((s, i) => s + formatQtyDisplay(i.quantity), 0);
              const rowAmount = grp.reduce((s, i) => s + formatQtyDisplay(i.quantity) * (Number(i.purchasePrice) || 0), 0);
              const avgPrice = orderQty > 0 ? rowAmount / orderQty : 0;
              const variantParts = grp
                .filter((i: any) => i.variantId && product?.variants)
                .map((i: any) => {
                  const v = product?.variants?.find((vv: ProductVariant) => vv.id === i.variantId);
                  if (!v) return '';
                  const c = dictionaries.colors.find(cc => cc.id === v.colorId)?.name ?? '';
                  const sz = dictionaries.sizes.find(ss => ss.id === v.sizeId)?.name ?? '';
                  return [c, sz].filter(Boolean).join(' / ');
                })
                .filter(Boolean);
              const variantLabel =
                variantParts.length > 1
                  ? `多规格 (${variantParts.join(', ')})`
                  : variantParts[0]
                    ? variantParts[0]
                    : '';

              return (
                <tr key={gid}>
                  <td className="py-2.5 px-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="w-7 h-7 shrink-0 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300">
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-700">{rowProductName || '未知产品'}</div>
                        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">
                          {rowProductSku}
                          {variantLabel ? ` · ${variantLabel}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-black uppercase border border-slate-100">
                      {warehouse?.name || '默认库'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-600">¥{avgPrice.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-black text-indigo-600">¥{rowAmount.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-black text-slate-700">
                    {orderQty.toLocaleString()} {first.productId ? getUnitName(first.productId) : 'PCS'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(PurchaseBillDetailSummary);
