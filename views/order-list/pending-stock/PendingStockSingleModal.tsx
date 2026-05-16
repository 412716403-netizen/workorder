/**
 * 待入库面板 - 单条「选择入库」模态 (Phase P7 抽离自 PendingStockPanel)。
 *
 * 含:
 * - 仓库选择 / 自定义字段
 * - 矩阵或单数量输入
 * - 提交确认（扫码在待入库清单弹窗完成，确认后进入本页）
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
import { StockInCustomCreateFields, expandPendingByVariantForMatrix, type PendingStockItem } from '../pendingStockStockInHelpers';
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

const PendingStockSingleModal: React.FC<Props> = ({
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
    stockInOrder,
    setStockInOrder,
    stockInForm,
    setStockInForm,
    setStockInFilePreview,
    singlePendingStockInDefaultWh,
    getUnitName,
    submitSingleStockIn,
  } = helper;

  if (!stockInOrder) return null;

  const order = stockInOrder.order;
  const product = productMap.get(order.productId);
  const category = product ? categoryMap.get(product.categoryId) : undefined;
  const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);
  const pendingCapsForSingle = expandPendingByVariantForMatrix(stockInOrder, product ?? undefined, category ?? undefined);

  const unitName = getUnitName(order.productId);
  const totalStockInQty = hasColorSize
    ? (Object.values(stockInForm.variantQuantities) as number[]).reduce((s, q) => s + (q || 0), 0)
    : stockInForm.singleQuantity;
  const canSubmitStockIn =
    !!(onAddRecord || onAddRecordBatch) &&
    totalStockInQty > 0 &&
    totalStockInQty <= (stockInOrder?.pendingTotal ?? 0) &&
    !!stockInForm.warehouseId;

  return (
    <DocPhaseModal
      open
      phase="detail"
      editingDocNumber={null}
      maxWidthClass="max-w-2xl"
      zIndexClass="z-[85]"
      detailTitle=""
      editTitle=""
      newTitle={`确认入库 — ${productionLinkMode === 'product' ? (order.productName || product?.name || '关联产品') : order.orderNumber}`}
      hasPerm={() => false}
      viewPerm=""
      editPerm=""
      onClose={() => {
        setStockInOrder(null);
        setStockInForm({ warehouseId: singlePendingStockInDefaultWh(), variantQuantities: {}, singleQuantity: 0, customData: {} });
      }}
      onEnterEdit={() => {}}
      onCancelEdit={() => {}}
      renderContent={() => (
        <>
          <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <p className="text-sm font-bold text-slate-700">{order.productName || product?.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {productionLinkMode === 'product' ? (
                <>
                  产品工单总数 {stockInOrder.productBlockOrderTotal} {unitName}，产品总入库{' '}
                  {stockInOrder.productTotalStockIn ?? stockInOrder.alreadyIn} {unitName}，待入库 {stockInOrder.pendingTotal} {unitName}
                </>
              ) : (
                <>
                  工单总量 {stockInOrder.orderTotal} {unitName}，已入库 {stockInOrder.alreadyIn} {unitName}，待入库{' '}
                  {stockInOrder.pendingTotal} {unitName}
                </>
              )}
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">入库仓库</label>
              {warehouses.length > 0 ? (
                <select
                  value={stockInForm.warehouseId}
                  onChange={e => setStockInForm(f => ({ ...f, warehouseId: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
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
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-amber-500 text-lg">⚠</span>
                  <p className="text-sm font-bold text-amber-700">请先在「进销存」中设置仓库后再进行入库操作</p>
                </div>
              )}
            </div>
            <StockInCustomCreateFields
              fields={stockInCustomFieldDefs}
              values={stockInForm.customData}
              onChange={(id, v) => setStockInForm(f => ({ ...f, customData: { ...f.customData, [id]: v } }))}
              onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
            />
            {hasColorSize && product?.variants?.length ? (
              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">入库数量明细（颜色尺码）</h4>
                <VariantQtyMatrixInputs
                  product={product}
                  dictionaries={dictionaries}
                  quantities={stockInForm.variantQuantities}
                  onVariantQtyChange={(variantId, qty) =>
                    setStockInForm(f => ({
                      ...f,
                      variantQuantities: { ...f.variantQuantities, [variantId]: qty },
                    }))
                  }
                  getCellExtras={v => {
                    const pending = pendingCapsForSingle[v.id] ?? 0;
                    return { max: pending, hint: `待入库 ${pending}` };
                  }}
                />
                <div className="flex flex-col items-end gap-1 p-3 bg-indigo-600 rounded-2xl text-white">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold opacity-80">本次入库合计:</span>
                    <span className="text-lg font-black">
                      {totalStockInQty} {unitName}
                    </span>
                  </div>
                  {totalStockInQty > stockInOrder.pendingTotal && (
                    <span className="text-xs font-bold text-amber-200">
                      不得超过可入库数量 {stockInOrder.pendingTotal} {unitName}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  入库数量 ({unitName})
                </label>
                <input
                  type="number"
                  min={0}
                  max={stockInOrder.pendingTotal}
                  value={stockInForm.singleQuantity || ''}
                  onChange={e =>
                    setStockInForm(f => ({
                      ...f,
                      singleQuantity: Math.max(
                        0,
                        Math.min(stockInOrder.pendingTotal, parseInt(e.target.value, 10) || 0),
                      ),
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 px-6 text-xl font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder={`最多 ${stockInOrder.pendingTotal}`}
                />
              </div>
            )}
          </div>
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-4 px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setStockInOrder(null);
                setStockInForm({
                  warehouseId: singlePendingStockInDefaultWh(),
                  variantQuantities: {},
                  singleQuantity: 0,
                  customData: {},
                });
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
            >
              返回列表
            </button>
            <button
              type="button"
              disabled={!canSubmitStockIn}
              onClick={async () => {
                if (!canSubmitStockIn) return;
                await submitSingleStockIn({ unitName });
              }}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> 确认入库
            </button>
          </div>
        </>
      )}
    />
  );
};

export default PendingStockSingleModal;

// 仅为消除 PendingStockItem 未使用的 import 警告(实际签名通过 helper 推断)
void ({} as PendingStockItem | null);
