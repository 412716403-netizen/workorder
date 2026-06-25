/**
 * 待入库面板 - 单条「选择入库」模态 (Phase P7 抽离自 PendingStockPanel)。
 *
 * 含:
 * - 仓库选择 / 自定义字段
 * - 矩阵或单数量输入
 * - 提交确认（扫码在待入库清单弹窗完成，确认后进入本页）
 */
import React from 'react';
import { Check, Package, Warehouse as WarehouseIcon } from 'lucide-react';
import type {
  AppDictionaries,
  Warehouse,
  Product,
  ProductCategory,
} from '../../../types';
import { productHasColorSizeMatrix } from '../../../utils/productColorSize';
import VariantQtyMatrixInputs from '../../../components/variant-matrix/VariantQtyMatrixInputs';
import DocPhaseModal from '../../../components/DocPhaseModal';
import { StockInCustomCreateFields, expandPendingByVariantForMatrix } from '../pendingStockStockInHelpers';
import type { usePendingStockState } from '../../../hooks/usePendingStockState';
import {
  formStandardControlClass,
  formStandardLabelClass,
  psiOrderBillFormCardClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormGridGapClass,
  sectionTitleClass,
} from '../../../styles/uiDensity';

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

function PendingStatCard({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        highlight ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-100 bg-slate-50/80'
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-black tabular-nums ${highlight ? 'text-indigo-600' : 'text-slate-800'}`}>
        {value}
        <span className="ml-1 text-xs font-bold text-slate-400">{unit}</span>
      </p>
    </div>
  );
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
    allowExceedMaxStockInQty,
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

  const productDisplayName = order.productName || product?.name || '关联产品';
  const unitName = getUnitName(order.productId);
  const orderTotal =
    productionLinkMode === 'product' ? stockInOrder.productBlockOrderTotal : stockInOrder.orderTotal;
  const alreadyIn =
    productionLinkMode === 'product'
      ? (stockInOrder.productTotalStockIn ?? stockInOrder.alreadyIn)
      : stockInOrder.alreadyIn;

  const totalStockInQty = hasColorSize
    ? (Object.values(stockInForm.variantQuantities) as number[]).reduce((s, q) => s + (q || 0), 0)
    : stockInForm.singleQuantity;
  const exceedsPending = !allowExceedMaxStockInQty && totalStockInQty > stockInOrder.pendingTotal;
  const canSubmitStockIn =
    !!(onAddRecord || onAddRecordBatch) &&
    totalStockInQty > 0 &&
    !exceedsPending &&
    !!stockInForm.warehouseId;

  const resetForm = () => {
    setStockInOrder(null);
    setStockInForm({
      warehouseId: singlePendingStockInDefaultWh(),
      variantQuantities: {},
      singleQuantity: 0,
      customData: {},
    });
  };

  return (
    <DocPhaseModal
      open
      phase="detail"
      editingDocNumber={null}
      maxWidthClass="max-w-2xl"
      zIndexClass="z-[85]"
      detailTitle=""
      editTitle=""
      newTitle={productDisplayName}
      hasPerm={() => false}
      viewPerm=""
      editPerm=""
      onClose={resetForm}
      onEnterEdit={() => {}}
      onCancelEdit={() => {}}
      renderContent={() => (
        <>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                确认入库
              </span>
              {productionLinkMode !== 'product' && order.orderNumber ? (
                <span className="text-xs font-bold text-slate-500">工单 {order.orderNumber}</span>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <PendingStatCard label={productionLinkMode === 'product' ? '产品工单' : '工单总量'} value={orderTotal} unit={unitName} />
              <PendingStatCard label="已入库" value={alreadyIn} unit={unitName} />
              <PendingStatCard label="待入库" value={stockInOrder.pendingTotal} unit={unitName} highlight />
            </div>

            <div className={psiOrderBillFormCardClass}>
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
                  <div className={psiOrderBillFormSectionIconIndigoClass}>
                    <WarehouseIcon className="h-4 w-4" />
                  </div>
                  <h4 className={sectionTitleClass}>1. 入库信息</h4>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                  <div className="space-y-1 md:col-span-2">
                    <label className={formStandardLabelClass}>入库仓库</label>
                    {warehouses.length > 0 ? (
                      <select
                        value={stockInForm.warehouseId}
                        onChange={e => setStockInForm(f => ({ ...f, warehouseId: e.target.value }))}
                        className={`${formStandardControlClass} bg-white`}
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
                      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <span className="text-amber-500">⚠</span>
                        <p className="text-xs font-bold text-amber-700">请先在「进销存」中设置仓库后再进行入库操作</p>
                      </div>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <StockInCustomCreateFields
                      fields={stockInCustomFieldDefs}
                      values={stockInForm.customData}
                      onChange={(id, v) => setStockInForm(f => ({ ...f, customData: { ...f.customData, [id]: v } }))}
                      onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={psiOrderBillFormSectionIconEmeraldClass}>
                      <Package className="h-4 w-4" />
                    </div>
                    <h4 className={sectionTitleClass}>2. 入库数量</h4>
                  </div>
                  {!hasColorSize && (
                    <span className="text-xs font-bold text-slate-400 tabular-nums">
                      待入库 {stockInOrder.pendingTotal} {unitName}
                    </span>
                  )}
                </div>

                {hasColorSize && product?.variants?.length ? (
                  <div className="space-y-3">
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
                        return { max: allowExceedMaxStockInQty ? undefined : pending, hint: `待入库 ${pending}` };
                      }}
                    />
                    <div
                      className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                        exceedsPending ? 'border-rose-200 bg-rose-50/60' : 'border-slate-100 bg-slate-50/80'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-500">本次入库合计</span>
                      <div className="text-right">
                        <span className={`text-sm font-black tabular-nums ${exceedsPending ? 'text-rose-600' : 'text-indigo-600'}`}>
                          {totalStockInQty} {unitName}
                        </span>
                        {exceedsPending && (
                          <p className="text-[10px] font-bold text-rose-500 mt-0.5">
                            不得超过 {stockInOrder.pendingTotal} {unitName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-xs space-y-1.5">
                    <label className={formStandardLabelClass}>入库数量 ({unitName})</label>
                    <input
                      type="number"
                      min={0}
                      max={allowExceedMaxStockInQty ? undefined : stockInOrder.pendingTotal}
                      value={stockInForm.singleQuantity || ''}
                      onChange={e => {
                        const raw = parseInt(e.target.value, 10) || 0;
                        setStockInForm(f => ({
                          ...f,
                          singleQuantity: allowExceedMaxStockInQty
                            ? Math.max(0, raw)
                            : Math.max(0, Math.min(stockInOrder.pendingTotal, raw)),
                        }));
                      }}
                      className={`${formStandardControlClass} bg-white text-right font-bold tabular-nums text-indigo-600`}
                      placeholder={allowExceedMaxStockInQty ? '请输入数量' : `最多 ${stockInOrder.pendingTotal}`}
                    />
                    {exceedsPending && (
                      <p className="text-[10px] font-bold text-rose-500">
                        不得超过待入库 {stockInOrder.pendingTotal} {unitName}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>

          <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-5 px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
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
