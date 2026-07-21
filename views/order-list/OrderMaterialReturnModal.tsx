import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { ModalPortal } from '../../components/ModalPortal';
import DocEntryTimeField from '../../components/DocEntryTimeField';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { defaultEntryDatetimeLocal, entryDatetimeLocalToTimestamp } from '../../utils/docEntryTime';
import {
  aggregateReturnableByProduct,
  type OrderMaterialReturnableRow,
} from '../../utils/orderMaterialReturnable';
import { formStandardControlClass, formStandardLabelClass } from '../../styles/uiDensity';
import type { ProdOpType, Product, ProductCategory, ProductionOpRecord, Warehouse } from '../../types';
import { batchNoForDisplay, batchNoForWrite, categoryUsesBatchManagement } from '../../types';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';

export interface OrderMaterialReturnModalProps {
  orderId: string | null;
  sourceProductId?: string | null;
  titleLabel: string;
  subtitle: string;
  returnable: OrderMaterialReturnableRow[];
  warehouses: Warehouse[];
  products: Product[];
  categories?: ProductCategory[];
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const OrderMaterialReturnModal: React.FC<OrderMaterialReturnModalProps> = ({
  orderId,
  sourceProductId = null,
  titleLabel,
  subtitle,
  returnable,
  warehouses,
  products,
  categories = [],
  onAddRecord,
  onAddRecordBatch,
  onClose,
  onSaved,
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [batchByProduct, setBatchByProduct] = useState<Record<string, string>>({});
  const [warehouseId, setWarehouseId] = useState('');
  const [entryTimestamp, setEntryTimestamp] = useState(() => defaultEntryDatetimeLocal());
  const [operator, setOperator] = useState(docOperator);
  const [submitting, setSubmitting] = useState(false);

  const productRows = useMemo(() => aggregateReturnableByProduct(returnable), [returnable]);
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const showBatchCol = useMemo(
    () =>
      productRows.some(row => {
        const p = productsById.get(row.productId);
        return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
      }),
    [productRows, productsById, categoryById],
  );

  useEffect(() => {
    const pref = readWarehousePreference(
      tenantCtx?.tenantId,
      userId,
      WAREHOUSE_DOC_KIND.PROD_MATERIAL_RETURN,
    );
    const fallback = returnable[0]?.warehouseId || warehouses[0]?.id || '';
    setWarehouseId(resolvePreferredSingleWarehouse(warehouses, pref, fallback));
    setOperator(currentOperatorDisplayName(currentUser));
  }, [tenantCtx?.tenantId, userId, warehouses, returnable, currentUser]);

  const returnableForBatch = (productId: string, batchNo: string): number => {
    const row = productRows.find(r => r.productId === productId);
    if (!row) return 0;
    const bn = batchNoForDisplay(batchNo);
    return row.batches.find(b => b.batchNo === bn)?.returnableQty ?? 0;
  };

  const handleSubmit = async () => {
    if (!warehouseId.trim()) {
      toast.error('请选择入库仓库');
      return;
    }
    const operatorName = operator.trim() || docOperator;
    if (!operatorName) {
      toast.error('请填写经办人');
      return;
    }
    const lines: { productId: string; quantity: number; warehouseId: string; batchNo?: string }[] = [];
    for (const row of productRows) {
      const qty = Number(qtyByProduct[row.productId] ?? 0);
      if (!(qty > 0)) continue;
      const p = productsById.get(row.productId);
      const batchManaged = categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
      const rawBatch = batchByProduct[row.productId] ?? '';
      if (batchManaged && !String(rawBatch).trim()) {
        toast.error(`请为物料「${row.productName}」选择批次`);
        return;
      }
      const bnDisplay = batchNoForDisplay(rawBatch);
      const maxQty = batchManaged ? returnableForBatch(row.productId, bnDisplay) : row.returnableQty;
      if (qty > maxQty + 1e-9) {
        toast.error(`「${row.productName}」本次退料超过可退数量（${maxQty}）`);
        return;
      }
      const bnWrite = batchNoForWrite(bnDisplay);
      lines.push({
        productId: row.productId,
        quantity: qty,
        warehouseId,
        ...(batchManaged ? { batchNo: bnWrite ?? bnDisplay } : {}),
      });
    }
    if (lines.length === 0) {
      toast.error('请填写本次退料数量');
      return;
    }

    const batch: ProductionOpRecord[] = lines.map(line => {
      const bn = batchNoForWrite(line.batchNo);
      return {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'STOCK_RETURN' as ProdOpType,
        productId: line.productId,
        quantity: line.quantity,
        operator: operatorName,
        timestamp: entryDatetimeLocalToTimestamp(entryTimestamp),
        status: '已完成',
        warehouseId,
        ...(bn ? { batchNo: bn } : line.batchNo ? { batchNo: String(line.batchNo) } : {}),
        ...(orderId ? { orderId } : {}),
        ...(sourceProductId ? { sourceProductId } : {}),
      };
    });

    setSubmitting(true);
    try {
      if (onAddRecordBatch && batch.length > 1) {
        await onAddRecordBatch(batch);
      } else {
        for (const rec of batch) await onAddRecord(rec);
      }
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_MATERIAL_RETURN, {
        warehouseId,
      });
      toast.success('退料成功');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '退料失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
        <div
          className="relative z-10 bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[min(92vh,960px)]"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5 text-indigo-600" /> {titleLabel}
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <DocEntryTimeField mode="datetime" value={entryTimestamp} onChange={setEntryTimestamp} />
              <label className="block">
                <span className={formStandardLabelClass}>经办人</span>
                <input
                  type="text"
                  value={operator}
                  onChange={e => setOperator(e.target.value)}
                  className={`mt-1 w-full ${formStandardControlClass}`}
                  placeholder="必填"
                />
              </label>
            </div>

            <label className="block">
              <span className={formStandardLabelClass}>入库仓库</span>
              <select
                value={warehouseId}
                onChange={e => {
                  setWarehouseId(e.target.value);
                  setBatchByProduct({});
                }}
                className={`mt-1 w-full ${formStandardControlClass}`}
              >
                {warehouses.length === 0 ? <option value="">暂无仓库</option> : null}
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.code ? ` (${w.code})` : ''}
                  </option>
                ))}
              </select>
            </label>

            {productRows.length === 0 ? (
              <p className="py-8 text-center text-xs font-medium text-slate-400">暂无可退物料</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">物料</th>
                      {showBatchCol ? (
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap w-48">批次</th>
                      ) : null}
                      <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">可退</th>
                      <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">本次退料</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {productRows.map(row => {
                      const p = productsById.get(row.productId);
                      const batchManaged = categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
                      const selectedBatch = batchByProduct[row.productId] ?? '';
                      const maxQty = batchManaged && selectedBatch
                        ? returnableForBatch(row.productId, selectedBatch)
                        : row.returnableQty;
                      return (
                        <tr key={row.productId}>
                          <td className="px-3 py-2">
                            <p className="text-xs font-semibold text-slate-800">{row.productName}</p>
                            {row.productSku ? <p className="text-[10px] font-medium text-slate-400">{row.productSku}</p> : null}
                          </td>
                          {showBatchCol ? (
                            <td className="px-3 py-2 align-middle">
                              {batchManaged ? (
                                <MaterialIssueBatchSelect
                                  product={p}
                                  categories={categories}
                                  warehouseId={warehouseId}
                                  value={selectedBatch}
                                  onChange={v => setBatchByProduct(prev => ({ ...prev, [row.productId]: v }))}
                                  mode="issue"
                                  hideLabel
                                  className="min-w-[140px]"
                                  dispatchedBatchOptions={row.batches.map(b => b.batchNo)}
                                  hideStockHint
                                />
                              ) : (
                                <span className="text-[10px] font-medium text-slate-300">—</span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700">{maxQty}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={maxQty}
                              step="any"
                              value={qtyByProduct[row.productId] ?? ''}
                              onChange={e => {
                                const v = e.target.value === '' ? 0 : Number(e.target.value);
                                setQtyByProduct(prev => ({ ...prev, [row.productId]: v }));
                              }}
                              className={`w-28 text-center ${formStandardControlClass}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              取消
            </button>
            <button
              type="button"
              disabled={submitting || productRows.length === 0}
              onClick={() => void handleSubmit()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <ArrowDownToLine className="w-4 h-4" /> {submitting ? '提交中…' : '确认退料'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default React.memo(OrderMaterialReturnModal);
