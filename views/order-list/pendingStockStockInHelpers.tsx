import React from 'react';
import type { PlanFormFieldConfig, Product, ProductCategory, ProductionOrder } from '../../types';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import {
  formStandardControlClass,
  formStandardLabelClass,
  psiOrderBillCompactLineInputClass,
  psiOrderBillCompactWarehouseSelectClass,
} from '../../styles/uiDensity';

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
          <label className={formStandardLabelClass}>{cf.label}</label>
          <PlanFormCustomFieldInput
            cf={cf}
            value={values[cf.id]}
            onChange={v => onChange(cf.id, v)}
            controlClassName={`${formStandardControlClass} bg-white`}
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
            <label className={formStandardLabelClass}>{cf.label}</label>
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

/**
 * 待入库按规格上限：compute 可能只给出通栏 `''`，而颜色尺码矩阵按 variantId 校验，
 * 需拆到各规格（优先按本行涉及工单的 items 数量占比；无行规格则均分）。
 */
export function expandPendingByVariantForMatrix(
  item: PendingStockItem,
  product: Product | undefined,
  category: ProductCategory | undefined,
): Record<string, number> {
  const pb = item.pendingByVariant || {};
  if (!productHasColorSizeMatrix(product, category) || !product?.variants?.length) {
    return { ...pb };
  }

  const positive = Object.entries(pb).filter(([, q]) => (Number(q) || 0) > 0);
  const onlyUndiff = positive.length === 0 || (positive.length === 1 && positive[0][0] === '');

  if (!onlyUndiff) {
    const out: Record<string, number> = { ...pb };
    if ((out[''] ?? 0) > 0 && positive.some(([k]) => k !== '')) delete out[''];
    return out;
  }

  const T = item.pendingTotal;
  if (T <= 0) return {};

  const weights = new Map<string, number>();
  for (const v of product.variants) {
    let w = 0;
    for (const o of item.ordersInRow) {
      w += o.items.filter(i => (i.variantId || '') === v.id).reduce((s, i) => s + i.quantity, 0);
    }
    if (w > 0) weights.set(v.id, w);
  }

  const out: Record<string, number> = {};
  const totalW = [...weights.values()].reduce((s, x) => s + x, 0);
  if (totalW > 0) {
    let rem = T;
    const entries = [...weights.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    entries.forEach(([vid, w], idx) => {
      if (idx === entries.length - 1) out[vid] = rem;
      else {
        const q = Math.floor((T * w) / totalW);
        out[vid] = q;
        rem -= q;
      }
    });
  } else {
    const vs = [...product.variants].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const n = vs.length;
    if (n === 0) return {};
    const base = Math.floor(T / n);
    let rem = T - base * n;
    vs.forEach((v, i) => {
      out[v.id] = base + (i < rem ? 1 : 0);
    });
  }
  return out;
}

/** 打开入库表单时的默认数量（含颜色尺码矩阵 + 通栏待入库拆规格） */
export function buildStockInFormDefaultsForPending(
  item: PendingStockItem,
  product: Product | undefined,
  category: ProductCategory | undefined,
): { variantQuantities: Record<string, number>; singleQuantity: number } {
  const hasMatrix = productHasColorSizeMatrix(product, category) && (product?.variants?.length ?? 0) > 0;
  if (!hasMatrix) {
    return defaultQuantitiesForPendingItem(item);
  }

  const pb = item.pendingByVariant || {};
  const positive = Object.entries(pb).filter(([, q]) => (Number(q) || 0) > 0);
  const onlyUndiff = positive.length === 0 || (positive.length === 1 && positive[0][0] === '');
  const caps = expandPendingByVariantForMatrix(item, product, category);

  if (onlyUndiff) {
    const variantQuantities: Record<string, number> = {};
    for (const [vid, cap] of Object.entries(caps)) {
      if (cap > 0) variantQuantities[vid] = cap;
    }
    return { variantQuantities, singleQuantity: 0 };
  }

  let variantQuantities: Record<string, number> = {};
  if (item.order.items.some(i => i.variantId)) {
    for (const [vid, q] of Object.entries(pb)) {
      const raw = Number(q) || 0;
      if (!vid || raw <= 0) continue;
      const capVal = caps[vid];
      const cap = capVal != null ? capVal : raw;
      variantQuantities[vid] = Math.min(raw, cap);
    }
  }
  let sum = Object.values(variantQuantities).reduce((s, q) => s + q, 0);
  if (sum > item.pendingTotal && item.pendingTotal > 0) {
    const scale = item.pendingTotal / sum;
    variantQuantities = Object.fromEntries(
      Object.entries(variantQuantities).map(([vid, q]) => [vid, Math.max(0, Math.floor(q * scale))]),
    );
    sum = Object.values(variantQuantities).reduce((s, q) => s + q, 0);
  }
  if (sum === 0 && item.pendingTotal > 0 && Object.keys(caps).length > 0) {
    const variantQuantitiesFromCaps: Record<string, number> = {};
    for (const [vid, cap] of Object.entries(caps)) {
      if (cap > 0) variantQuantitiesFromCaps[vid] = cap;
    }
    return { variantQuantities: variantQuantitiesFromCaps, singleQuantity: 0 };
  }
  return { variantQuantities, singleQuantity: 0 };
}
