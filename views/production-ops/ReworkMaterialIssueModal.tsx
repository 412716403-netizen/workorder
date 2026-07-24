import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpFromLine, X } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  ProductCategory,
  Warehouse,
  ReworkMaterialRecordsResponse,
} from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { useStockSnapshot } from '../../hooks/useStockSnapshot';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import DocEntryTimeField from '../../components/DocEntryTimeField';
import { ModalPortal } from '../../components/ModalPortal';
import { defaultEntryDatetimeLocal, entryDatetimeLocalToTimestamp } from '../../utils/docEntryTime';
import { formatMaterialQtyDisplay } from '../../utils/formatMaterialQtyDisplay';
import type { ReworkBomMaterial } from '../../utils/reworkBomMaterials';

export interface ReworkMaterialIssueModalProps {
  order: ProductionOrder;
  productName: string;
  bomMaterials: ReworkBomMaterial[];
  data: ReworkMaterialRecordsResponse;
  products: Product[];
  categories?: ProductCategory[];
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const ReworkMaterialIssueModal: React.FC<ReworkMaterialIssueModalProps> = ({
  order,
  productName,
  bomMaterials,
  data,
  products,
  categories = [],
  warehouses,
  onClose,
  onSaved,
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [batchByProduct, setBatchByProduct] = useState<Record<string, string>>({});
  const [warehouseId, setWarehouseId] = useState<string>(() => warehouses[0]?.id ?? '');
  const [entryTimestamp, setEntryTimestamp] = useState(() => defaultEntryDatetimeLocal());
  const [operator, setOperator] = useState(docOperator);
  const [submitting, setSubmitting] = useState(false);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const netQtyByProduct = useMemo(
    () => new Map(data.summary.map(row => [row.productId, row.netQty])),
    [data.summary],
  );
  const { listAvailableBatches, getStock } = useStockSnapshot({ enabled: true });

  useEffect(() => {
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_REWORK_MATERIAL_ISSUE);
    const wid = resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '');
    setWarehouseId(wid || '');
    setOperator(currentOperatorDisplayName(currentUser));
    // 仅初始化时按用户偏好选仓
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showBatchCol = bomMaterials.some(m => {
    const p = productMap.get(m.productId);
    return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
  });

  const handleConfirm = async () => {
    const toIssue = bomMaterials.filter(m => (qtyByProduct[m.productId] ?? 0) > 0);
    if (toIssue.length === 0) return;
    const operatorName = operator.trim() || docOperator;
    if (!operatorName) {
      toast.error('请填写经办人');
      return;
    }
    const wh = warehouseId || (warehouses[0]?.id ?? '');
    if (!wh) {
      toast.error('请选择出库仓库');
      return;
    }
    setSubmitting(true);
    try {
      for (const m of toIssue) {
        const p = productMap.get(m.productId);
        const c = categoryById.get(p?.categoryId ?? '');
        if (!categoryUsesBatchManagement(c)) continue;
        const bn = clampBatchNoInput(batchByProduct[m.productId] ?? '');
        if (!bn) {
          toast.error(`请为物料「${m.name}」选择批次`);
          return;
        }
        try {
          const opts = await api.psi.getStockBatches({ productId: m.productId, warehouseId: wh });
          const av = opts.find(o => o.batchNo === bn)?.stock ?? 0;
          if ((qtyByProduct[m.productId] ?? 0) > av) {
            toast.error(`物料「${m.name}」批次「${bn}」可用库存不足（${formatMaterialQtyDisplay(av)}）`);
            return;
          }
        } catch {
          toast.error('校验批次库存失败，请稍后重试');
          return;
        }
      }
      const lines = toIssue.map(m => {
        const p = productMap.get(m.productId);
        const c = categoryById.get(p?.categoryId ?? '');
        const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(batchByProduct[m.productId] ?? '') : '';
        return {
          productId: m.productId,
          quantity: qtyByProduct[m.productId],
          warehouseId: wh,
          ...(bn ? { batchNo: bn } : {}),
        };
      });
      const result = await api.production.reworkMaterialIssueBatch(order.id, {
        lines,
        operator: operatorName,
        timestamp: entryDatetimeLocalToTimestamp(entryTimestamp),
      });
      toast.success(`领料成功 · ${result.docNo}`);
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_REWORK_MATERIAL_ISSUE, {
        warehouseId: wh,
      });
      setQtyByProduct({});
      setBatchByProduct({});
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '领料失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative z-10 bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[min(92vh,960px)]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowUpFromLine className="w-5 h-5 text-indigo-600" /> 返工领料</h3>
            <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {productName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <DocEntryTimeField mode="datetime" value={entryTimestamp} onChange={setEntryTimestamp} />
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">经办人</label>
              <input
                type="text"
                value={operator}
                onChange={e => setOperator(e.target.value)}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                placeholder="必填"
              />
            </div>
          </div>
          {warehouses.length > 0 && (
            <div className="mb-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
              <select
                value={warehouseId}
                onChange={e => {
                  setWarehouseId(e.target.value);
                  setBatchByProduct({});
                }}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>))}
              </select>
            </div>
          )}
          {bomMaterials.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">该工单未配置 BOM 物料，无法进行领料</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">净领用</th>
                  {showBatchCol ? (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-44">批次</th>
                  ) : (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-24">库存数量</th>
                  )}
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bomMaterials.map(m => (
                  <tr key={m.productId} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800">{m.name}</p>
                        {m.nodeNames.map(nn => (<span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>))}
                      </div>
                      {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{netQtyByProduct.get(m.productId) ?? 0}</td>
                    {showBatchCol ? (
                      <td className="px-4 py-3 align-top">
                        <MaterialIssueBatchSelect
                          product={productMap.get(m.productId)}
                          categories={categories}
                          warehouseId={warehouseId}
                          value={batchByProduct[m.productId] ?? ''}
                          onChange={v => setBatchByProduct(prev => ({ ...prev, [m.productId]: v }))}
                          mode="issue"
                          hideLabel
                          mergeBatches={listAvailableBatches(m.productId, warehouseId)}
                        />
                      </td>
                    ) : (
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-600 tabular-nums">
                        {formatMaterialQtyDisplay(getStock(m.productId, warehouseId))}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <input type="number" min={0} step={1} value={qtyByProduct[m.productId] ?? ''} onChange={e => setQtyByProduct(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {bomMaterials.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
            <button type="button" onClick={() => void handleConfirm()} disabled={submitting || !bomMaterials.some(m => (qtyByProduct[m.productId] ?? 0) > 0)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <ArrowUpFromLine className="w-4 h-4" /> {submitting ? '提交中…' : '确认领料'}
            </button>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
};

export default React.memo(ReworkMaterialIssueModal);
