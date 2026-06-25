/**
 * 待入库面板 - 批量入库模态 (Phase P7 抽离自 PendingStockPanel)。
 *
 * 含:
 * - 共享仓库 / 自定义字段
 * - 每行(每个 pendingItem)的矩阵或单数量输入
 * - 校验各行不超量(超量则禁用提交)
 */
import React from 'react';
import { Check } from 'lucide-react';
import type {
  AppDictionaries,
  Warehouse,
  Product,
  ProductCategory,
} from '../../../types';
import { productHasColorSizeMatrix } from '../../../utils/productColorSize';
import VariantQtyMatrixInputs from '../../../components/variant-matrix/VariantQtyMatrixInputs';
import DocPhaseModal from '../../../components/DocPhaseModal';
import {
  StockInCustomCreateFields,
  expandPendingByVariantForMatrix,
} from '../pendingStockStockInHelpers';
import type { usePendingStockState } from '../../../hooks/usePendingStockState';

type Helper = ReturnType<typeof usePendingStockState>;

interface Props {
  helper: Helper;
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  stockInCustomFieldDefs: { id: string; label: string; [k: string]: unknown }[];
  productionLinkMode: 'order' | 'product';
  productMap: Map<string, Product>;
  categoryMap: Map<string, ProductCategory>;
  onAddRecord?: unknown;
  onAddRecordBatch?: unknown;
}

const PendingStockBatchModal: React.FC<Props> = ({
  helper,
  warehouses,
  dictionaries,
  stockInCustomFieldDefs,
  productionLinkMode,
  productMap,
  categoryMap,
  onAddRecord,
  onAddRecordBatch,
}) => {
  const {
    allowExceedMaxStockInQty,
    batchStockInItems,
    setBatchStockInItems,
    batchStockForm,
    setBatchStockForm,
    setStockInFilePreview,
    getUnitName,
    submitBatchStockIn,
  } = helper;

  if (!batchStockInItems || batchStockInItems.length === 0) return null;

  /* ---- 校验 ---- */
  let batchError = false;
  let batchHasValidQty = false;
  let batchTotalPieces = 0;
  for (const pit of batchStockInItems) {
    const line = batchStockForm.lines[pit.rowKey];
    if (!line) {
      batchError = true;
      break;
    }
    const p = productMap.get(pit.order.productId);
    const cat = p ? categoryMap.get(p.categoryId) : undefined;
    const hasCS = productHasColorSizeMatrix(p ?? undefined, cat ?? undefined);
    if (hasCS && p?.variants?.length) {
      const capByVid = expandPendingByVariantForMatrix(pit, p ?? undefined, cat ?? undefined);
      const t = Object.values(line.variantQuantities).reduce<number>((s, q) => s + (Number(q) || 0), 0);
      batchTotalPieces += t;
      if (!allowExceedMaxStockInQty && t > pit.pendingTotal) batchError = true;
      if (t > 0) batchHasValidQty = true;
      if (!allowExceedMaxStockInQty) {
        Object.entries(line.variantQuantities).forEach(([vid, q]) => {
          if ((Number(q) || 0) > (capByVid[vid] ?? 0)) batchError = true;
        });
      }
    } else {
      const q = Number(line.singleQuantity) || 0;
      batchTotalPieces += q;
      if (!allowExceedMaxStockInQty && q > pit.pendingTotal) batchError = true;
      if (q > 0) batchHasValidQty = true;
    }
  }
  const canSubmitBatch = (onAddRecord || onAddRecordBatch) && !!batchStockForm.warehouseId && batchHasValidQty && !batchError;

  return (
    <DocPhaseModal
      open
      phase="detail"
      editingDocNumber={null}
      maxWidthClass="max-w-4xl"
      zIndexClass="z-[85]"
      detailTitle=""
      editTitle=""
      newTitle={`批量入库（${batchStockInItems.length} 笔）`}
      hasPerm={() => false}
      viewPerm=""
      editPerm=""
      onClose={() => {
        setBatchStockInItems(null);
        setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
      }}
      onEnterEdit={() => {}}
      onCancelEdit={() => {}}
      renderContent={() => (
        <>
          <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
              入库仓库（共用）
            </label>
            {warehouses.length > 0 ? (
              <select
                value={batchStockForm.warehouseId}
                onChange={e => setBatchStockForm(f => ({ ...f, warehouseId: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">请选择仓库</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.code ? ` (${w.code})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-bold text-amber-700">请先在「进销存」中设置仓库。</p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              本次将使用同一入库单号生成多条明细；合计 {batchTotalPieces}（校验通过后方可提交）
            </p>
            {batchError && (
              <p className="text-xs font-bold text-rose-600 mt-1">存在超量行，请检查各行不超过本单待入库。</p>
            )}
            <StockInCustomCreateFields
              fields={stockInCustomFieldDefs}
              values={batchStockForm.customData}
              onChange={(id, v) => setBatchStockForm(f => ({ ...f, customData: { ...f.customData, [id]: v } }))}
              onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
            />
          </div>
          <div className="space-y-4">
            {batchStockInItems.map(stockItem => {
              const order = stockItem.order;
              const lineKey = stockItem.rowKey;
              const line = batchStockForm.lines[lineKey] ?? { variantQuantities: {}, singleQuantity: 0 };
              const p = productMap.get(order.productId);
              const cat = p ? categoryMap.get(p.categoryId) : undefined;
              const hasCS = productHasColorSizeMatrix(p ?? undefined, cat ?? undefined);
              const unitName = getUnitName(order.productId);
              const patchLine = (
                patch: Partial<{ variantQuantities: Record<string, number>; singleQuantity: number }>,
              ) => {
                setBatchStockForm(f => {
                  const cur = f.lines[lineKey] ?? { variantQuantities: {}, singleQuantity: 0 };
                  return {
                    ...f,
                    lines: {
                      ...f.lines,
                      [lineKey]: {
                        ...cur,
                        ...patch,
                        variantQuantities:
                          patch.variantQuantities !== undefined
                            ? { ...cur.variantQuantities, ...patch.variantQuantities }
                            : cur.variantQuantities,
                      },
                    },
                  };
                });
              };
              const pendingCaps = expandPendingByVariantForMatrix(stockItem, p ?? undefined, cat ?? undefined);
              return (
                <div key={lineKey} className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800">{order.productName || p?.name}</p>
                    {productionLinkMode !== 'product' && (
                      <span className="text-xs font-bold text-slate-500">工单 {order.orderNumber}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    本单待入库 {stockItem.pendingTotal} {unitName}
                  </p>
                  {hasCS && p?.variants?.length ? (
                    <VariantQtyMatrixInputs
                      product={p}
                      dictionaries={dictionaries}
                      quantities={line.variantQuantities}
                      onVariantQtyChange={(variantId, qty) => {
                        patchLine({ variantQuantities: { [variantId]: qty } });
                      }}
                      getCellExtras={v => {
                        const pending = pendingCaps[v.id] ?? 0;
                        return {
                          max: allowExceedMaxStockInQty ? undefined : pending,
                          hint: `待入库 ${pending}`,
                          placeholder: allowExceedMaxStockInQty ? undefined : `≤${pending}`,
                        };
                      }}
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={allowExceedMaxStockInQty ? undefined : stockItem.pendingTotal}
                      value={line.singleQuantity || ''}
                      onChange={e => {
                        const raw = parseInt(e.target.value, 10) || 0;
                        patchLine({
                          singleQuantity: allowExceedMaxStockInQty
                            ? Math.max(0, raw)
                            : Math.max(0, Math.min(stockItem.pendingTotal, raw)),
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-lg font-bold text-indigo-600"
                      placeholder={allowExceedMaxStockInQty ? '请输入数量' : `最多 ${stockItem.pendingTotal}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-4 px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setBatchStockInItems(null);
                setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
            >
              返回列表
            </button>
            <button
              type="button"
              disabled={!canSubmitBatch}
              onClick={async () => {
                if (!canSubmitBatch) return;
                await submitBatchStockIn();
              }}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> 确认批量入库
            </button>
          </div>
        </>
      )}
    />
  );
};

export default PendingStockBatchModal;
