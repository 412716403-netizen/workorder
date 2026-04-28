import React from 'react';
import type { PlanFormFieldConfig, ProductionOrder } from '../../types';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
import { psiOrderBillCompactLineInputClass, psiOrderBillCompactWarehouseSelectClass } from '../../styles/uiDensity';

/** 将入库登记自定义字段写入 production_op_records.collabData.stockInCustomData */
export function stockInCollabFromCustomData(customData: Record<string, unknown> | undefined): {
  collabData?: Record<string, unknown>;
} {
  const clean = Object.fromEntries(
    Object.entries(customData ?? {}).filter(([, v]) => v !== '' && v != null && v !== undefined),
  );
  if (!Object.keys(clean).length) return {};
  return { collabData: { stockInCustomData: clean } };
}

export function StockInCustomCreateFields({
  fields,
  values,
  onChange,
  onFilePreview,
}: {
  fields: PlanFormFieldConfig[];
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
}) {
  const list = fields.filter(f => f.showInCreate);
  if (!list.length) return null;
  return (
    <div className="mt-3 space-y-3">
      {list.map(cf => (
        <div key={cf.id} className="space-y-1">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
          <PlanFormCustomFieldInput
            cf={cf}
            value={values[cf.id]}
            onChange={v => onChange(cf.id, v)}
            controlClassName="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
            onFilePreview={onFilePreview}
          />
        </div>
      ))}
    </div>
  );
}

/** 入库流水编辑：与新建/外协收货一致的紧凑自定义字段（`showInCreate`） */
export function StockInCustomEditFields({
  fields,
  values,
  onChange,
  onFilePreview,
}: {
  fields: PlanFormFieldConfig[];
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
}) {
  const list = fields.filter(f => f.showInCreate);
  if (!list.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-slate-200/80 pt-3 md:grid-cols-2 md:gap-x-4 md:gap-y-3">
      {list.map(cf => {
        const eff = effectivePlanFormFieldType(cf);
        return (
          <div
            key={cf.id}
            className={eff === 'text' || eff === 'file' ? 'min-w-0 space-y-1 md:col-span-2' : 'min-w-0 space-y-1'}
          >
            <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
            <PlanFormCustomFieldInput
              cf={cf}
              value={values[cf.id]}
              onChange={v => onChange(cf.id, v)}
              controlClassName={
                eff === 'select' ? psiOrderBillCompactWarehouseSelectClass : psiOrderBillCompactLineInputClass
              }
              onFilePreview={onFilePreview}
            />
          </div>
        );
      })}
    </div>
  );
}

export type PendingStockItem = {
  rowKey: string;
  ordersInRow: ProductionOrder[];
  order: ProductionOrder;
  orderTotal: number;
  productBlockOrderTotal: number;
  alreadyIn: number;
  pendingTotal: number;
  alreadyInByVariant: Record<string, number>;
  pendingByVariant: Record<string, number>;
  productTotalStockIn?: number;
};

export function defaultQuantitiesForPendingItem(item: PendingStockItem): {
  variantQuantities: Record<string, number>;
  singleQuantity: number;
} {
  let variantQuantities: Record<string, number> = {};
  if (item.order.items.some(i => i.variantId) && Object.keys(item.pendingByVariant).length > 0) {
    Object.entries(item.pendingByVariant).forEach(([vid, q]) => {
      if (q > 0) variantQuantities[vid] = q;
    });
    const sum = Object.values(variantQuantities).reduce((s, q) => s + q, 0);
    if (sum > item.pendingTotal && item.pendingTotal > 0) {
      const scale = item.pendingTotal / sum;
      variantQuantities = Object.fromEntries(
        Object.entries(variantQuantities).map(([vid, q]) => [vid, Math.max(0, Math.round(q * scale))]),
      );
    }
  }
  return { variantQuantities, singleQuantity: item.pendingTotal };
}
