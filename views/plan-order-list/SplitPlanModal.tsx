
import React, { useMemo, useState } from 'react';
import { Split, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanOrder, Product, AppDictionaries, PlanItem } from '../../types';

export interface SplitPlanModalProps {
  plan: PlanOrder;
  products: Product[];
  dictionaries: AppDictionaries;
  onSplit: (planId: string, newPlans: PlanOrder[]) => void;
  onClose: () => void;
}

const NUM_PARTS = 2;

const SplitPlanModal: React.FC<SplitPlanModalProps> = ({ plan, products, dictionaries, onSplit, onClose }) => {
  const [splitQuantities, setSplitQuantities] = useState<number[][]>(
    () => plan.items.map(item => [0, item.quantity]),
  );

  const splitProduct = products.find(p => p.id === plan.productId);

  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const getItemLabel = (item: PlanItem, index: number) => {
    if (item.variantId && splitProduct?.variants) {
      const v = splitProduct.variants.find(x => x.id === item.variantId);
      if (v) {
        const color = dictionaries.colors.find(c => c.id === v.colorId);
        const size = dictionaries.sizes.find(s => s.id === v.sizeId);
        return `${color?.name ?? ''}-${size?.name ?? ''}`.replace(/^-|-$/g, '') || `规格${index + 1}`;
      }
    }
    return '默认';
  };

  const setSplitQty = (itemIndex: number, partIndex: number, value: number) => {
    if (NUM_PARTS === 2) {
      const original = plan.items[itemIndex]?.quantity ?? 0;
      const clamped = Math.max(0, Math.min(original, value));
      const otherPartIndex = 1 - partIndex;
      const otherValue = original - clamped;
      setSplitQuantities(prev => prev.map((row, i) => {
        if (i !== itemIndex) return row;
        return row.map((v, j) => j === partIndex ? clamped : j === otherPartIndex ? otherValue : v);
      }));
      return;
    }
    setSplitQuantities(prev => prev.map((row, i) => i === itemIndex ? row.map((v, j) => j === partIndex ? value : v) : row));
  };

  const splitRowSums = useMemo(
    () => splitQuantities.map((row, i) => ({ sum: row.reduce((a, b) => a + b, 0), original: plan.items[i]?.quantity ?? 0 })),
    [splitQuantities, plan.items],
  );
  const splitValid = splitRowSums.length === 0 || splitRowSums.every(({ sum, original }) => sum === original);

  const confirmSplit = () => {
    if (!splitValid) return;
    const newPlans: PlanOrder[] = [];
    for (let j = 0; j < NUM_PARTS; j++) {
      const partItems = plan.items.map((item, i) => ({ variantId: item.variantId, quantity: splitQuantities[i]?.[j] ?? 0 }));
      if (partItems.every(it => it.quantity === 0)) continue;
      newPlans.push({
        ...plan,
        id: `plan-${Date.now()}-${j}`,
        planNumber: `${plan.planNumber}-${j + 1}`,
        items: partItems,
        assignments: {},
        createdAt: new Date().toISOString().split('T')[0],
      });
    }
    if (newPlans.length < 2) {
      toast.error('请拆成至少两份且每份数量大于 0。');
      return;
    }
    onSplit(plan.id, newPlans);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-4xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Split className="w-5 h-5 text-amber-500" /> 拆分计划单</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          <p className="text-sm text-slate-500">输入计划1数量，计划2自动为剩余</p>
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格/明细</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">原计划数量</th>
                  {Array.from({ length: NUM_PARTS }, (_, j) => <th key={j} className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">计划{j + 1}数量</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.items.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{getItemLabel(item, i)}</td>
                    <td className="px-4 py-3 text-sm font-black text-slate-800 text-right">{item.quantity} {getUnitName(plan.productId)}</td>
                    {Array.from({ length: NUM_PARTS }, (_, j) => {
                      const isAuto = NUM_PARTS === 2 && j === 1;
                      return (
                        <td key={j} className="px-4 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            readOnly={isAuto}
                            value={splitQuantities[i]?.[j] ?? 0}
                            onChange={e => setSplitQty(i, j, Math.max(0, parseInt(e.target.value) || 0))}
                            className={`w-20 rounded-lg py-1.5 px-2 text-sm font-bold text-right outline-none ${isAuto ? 'bg-slate-100 border border-slate-100 text-slate-500 cursor-default' : 'bg-slate-50 border border-slate-200 text-indigo-600 focus:ring-2 focus:ring-indigo-500'}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!splitValid && <p className="text-rose-600 text-sm font-bold">请确保每一行的「计划数量」之和等于「原计划数量」。</p>}
        </div>
        <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
          <button onClick={confirmSplit} disabled={!splitValid} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"><Split className="w-4 h-4" /> 确认拆分</button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SplitPlanModal);
