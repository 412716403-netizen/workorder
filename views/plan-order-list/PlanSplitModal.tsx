import React, { useEffect, useMemo, useState } from 'react';
import { ModalPortal } from '../../components/ModalPortal';
import { Layers, Split, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AppDictionaries, PlanItem, PlanOrder, Product, ProductCategory } from '../../types';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { formStandardControlClass, formStandardLabelClass, sectionTitleClass } from '../../styles/uiDensity';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';

export type PlanSplitModalProps = {
  open: boolean;
  onClose: () => void;
  plan: PlanOrder;
  product: Product;
  category?: ProductCategory;
  dictionaries: AppDictionaries;
  onConfirm: (items: Array<{ variantId?: string; quantity: number }>) => void | Promise<void>;
};

function sumItems(items: PlanItem[] | undefined): number {
  return (items ?? []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
}

function remainingByVariant(items: PlanItem[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items ?? []) {
    const vid = it.variantId?.trim() ? it.variantId.trim() : '__single__';
    out[vid] = (out[vid] ?? 0) + (Number(it.quantity) || 0);
  }
  return out;
}

const PlanSplitModal: React.FC<PlanSplitModalProps> = ({
  open,
  onClose,
  plan,
  product,
  category,
  dictionaries,
  onConfirm,
}) => {
  const submitLock = useAsyncSubmitLock();
  const useMatrix = productHasColorSizeMatrix(product, category);
  const remainingMap = useMemo(() => remainingByVariant(plan.items), [plan.items]);
  const [splitVariantQty, setSplitVariantQty] = useState<Record<string, number>>({});
  const [singleSplitQty, setSingleSplitQty] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSplitVariantQty({});
    setSingleSplitQty(0);
  }, [open, plan.id]);

  if (!open) return null;

  const unitName = dictionaries.units?.find(u => u.id === product.unitId)?.name ?? 'PCS';
  const totalRemaining = sumItems(plan.items);
  const totalSplit = useMatrix
    ? Object.values(splitVariantQty).reduce((s, q) => s + (Number(q) || 0), 0)
    : singleSplitQty;

  const getUnitName = () => unitName;

  const handleSubmit = async () => {
    if (totalSplit <= 0) {
      toast.error('请填写拆出数量');
      return;
    }
    if (totalRemaining - totalSplit < 1) {
      toast.error('拆单后原单须至少保留 1 件，请减少拆出数量');
      return;
    }

    const items: Array<{ variantId?: string; quantity: number }> = [];
    if (useMatrix) {
      for (const [vid, q] of Object.entries(splitVariantQty)) {
        const qty = Number(q) || 0;
        if (qty <= 0) continue;
        const rem = remainingMap[vid] ?? 0;
        if (qty > rem) {
          toast.error('拆出数量不能超过当前剩余数量');
          return;
        }
        items.push({ variantId: vid, quantity: qty });
      }
    } else {
      const rem = remainingMap['__single__'] ?? totalRemaining;
      if (singleSplitQty > rem) {
        toast.error('拆出数量不能超过当前剩余数量');
        return;
      }
      items.push({ quantity: singleSplitQty });
    }

    if (items.length === 0) {
      toast.error('请填写拆出数量');
      return;
    }

    await submitLock.run(async () => {
      await onConfirm(items);
    });
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl max-h-[min(92vh,960px)] flex flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Split className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">拆单</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {plan.planNumber} · 本次仅拆出 1 条新计划单
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
            <p>
              当前剩余总量：<span className="font-black text-slate-900">{totalRemaining.toLocaleString()}</span> {getUnitName()}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              填写拆到新计划单的数量；原单自动扣减，且须至少保留 1 件。
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
              <Layers className="h-4 w-4 text-emerald-600" />
              <h4 className={sectionTitleClass}>本次拆出数量</h4>
            </div>

            {useMatrix && product.variants.length > 0 ? (
              <VariantQtyMatrixInputs
                product={product}
                dictionaries={dictionaries}
                quantities={splitVariantQty}
                onVariantQtyChange={(variantId, qty) => {
                  setSplitVariantQty(prev => ({ ...prev, [variantId]: qty }));
                }}
                getCellExtras={v => {
                  const rem = remainingMap[v.id] ?? 0;
                  return {
                    max: rem,
                    hint: rem > 0 ? `剩 ${rem}` : undefined,
                    placeholder: '0',
                  };
                }}
                balancedNumericLayout
              />
            ) : (
              <div className="max-w-xs space-y-2">
                <label className={formStandardLabelClass}>
                  拆出数量（最多 {Math.max(0, (remainingMap['__single__'] ?? totalRemaining) - 1)} {getUnitName()}）
                </label>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, (remainingMap['__single__'] ?? totalRemaining) - 1)}
                  value={singleSplitQty || ''}
                  onChange={e => setSingleSplitQty(parseInt(e.target.value, 10) || 0)}
                  className={formStandardControlClass}
                  placeholder="0"
                />
              </div>
            )}

            <div className="flex justify-end rounded-2xl bg-indigo-600 px-4 py-3 text-white">
              <p className="text-xs font-bold opacity-90">
                本次拆出合计：<span className="text-lg font-black">{totalSplit.toLocaleString()}</span> {getUnitName()}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            type="button"
            disabled={submitLock.busy || totalSplit <= 0}
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitLock.busy ? '提交中…' : '确认拆单'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default React.memo(PlanSplitModal);
