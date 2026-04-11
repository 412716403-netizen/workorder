
import React, { useState, useMemo, useEffect } from 'react';
import { ArrowDownToLine, X, History, Check, Filter, FileText, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  BOM,
  ProductionOpRecord,
  Warehouse,
  ProductVariant,
  ProductCategory,
  ProcessSequenceMode,
  ProductMilestoneProgress,
} from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { useConfirm } from '../../contexts/ConfirmContext';
import { toLocalCompactYmd, toLocalDateYmd } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import { computePendingStockOrders } from '../../utils/pendingStockCompute';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';

function fmtDT(ts: string | Date | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

type PendingStockItem = {
  rowKey: string;
  ordersInRow: ProductionOrder[];
  order: ProductionOrder;
  orderTotal: number;
  productBlockOrderTotal: number;
  alreadyIn: number;
  pendingTotal: number;
  alreadyInByVariant: Record<string, number>;
  /** 每规格待入库 = 该规格最后一道工序报工合计 - 该规格已入库（与成衣报工一致） */
  pendingByVariant: Record<string, number>;
  productTotalStockIn?: number;
};

function defaultQuantitiesForPendingItem(item: PendingStockItem): { variantQuantities: Record<string, number>; singleQuantity: number } {
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

interface PendingStockPanelProps {
  open: boolean;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  prodRecords: ProductionOpRecord[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  boms: BOM[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  productionLinkMode: 'order' | 'product';
  processSequenceMode: ProcessSequenceMode;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const PendingStockPanel: React.FC<PendingStockPanelProps> = ({
  open,
  onClose,
  orders,
  products,
  categories,
  prodRecords,
  warehouses,
  dictionaries,
  productMilestoneProgresses,
  productionLinkMode,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const confirm = useConfirm();

  const hasPerm = (perm: string): boolean => {
    if (tenantRole === 'owner') return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('production') && !userPermissions.some(p => p.startsWith('production:'))) return true;
    if (userPermissions.includes(perm)) return true;
    return false;
  };

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const getUnitName = (productId: string) => {
    const p = productMap.get(productId);
    const u = (dictionaries.units ?? []).find((x: { id: string; name: string }) => x.id === p?.unitId);
    return (u as { name: string } | undefined)?.name ?? 'PCS';
  };

  /** 待入库清单：关联工单读工单报工；关联产品读产品 PMP 并按工单数量占比分摊（与工单中心产品组逻辑一致）。 */
  const pendingStockOrders = useMemo(
    (): PendingStockItem[] =>
      computePendingStockOrders(orders, prodRecords || [], {
        productionLinkMode,
        productMilestoneProgresses,
      }),
    [orders, prodRecords, productionLinkMode, productMilestoneProgresses],
  );

  const getNextStockInDocNo = () => {
    const prefix = 'RK';
    const todayStr = toLocalCompactYmd(new Date());
    const pattern = `${prefix}${todayStr}-`;
    const existing = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo && (r.docNo as string).startsWith(pattern));
    const seqs = existing.map(r => parseInt(((r.docNo as string) ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  /** 待入库清单弹窗 & 选择入库表单 */
  const [stockInOrder, setStockInOrder] = useState<PendingStockItem | null>(null);
  const [stockInForm, setStockInForm] = useState<{
    warehouseId: string;
    variantQuantities: Record<string, number>;
    singleQuantity: number;
  }>({ warehouseId: '', variantQuantities: {}, singleQuantity: 0 });

  const [selectedPendingRowKeys, setSelectedPendingRowKeys] = useState<Set<string>>(new Set());
  const [batchStockInItems, setBatchStockInItems] = useState<PendingStockItem[] | null>(null);
  const [batchStockForm, setBatchStockForm] = useState<{
    warehouseId: string;
    lines: Record<string, { variantQuantities: Record<string, number>; singleQuantity: number }>;
  }>({ warehouseId: '', lines: {} });

  const [showStockInFlowModal, setShowStockInFlowModal] = useState(false);
  const [stockInFlowFilter, setStockInFlowFilter] = useState<{
    dateFrom: string; dateTo: string; docNo: string; orderNumber: string; productName: string; warehouseId: string;
  }>({ dateFrom: '', dateTo: '', docNo: '', orderNumber: '', productName: '', warehouseId: '' });
  const [stockInFlowDetailDocNo, setStockInFlowDetailDocNo] = useState<string | null>(null);
  const [stockInFlowEditing, setStockInFlowEditing] = useState<{
    warehouseId: string;
    operator: string;
    rows: { id: string; variantId?: string; quantity: number }[];
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedPendingRowKeys(new Set());
      setBatchStockInItems(null);
      setBatchStockForm({ warehouseId: '', lines: {} });
    }
  }, [open]);

  useEffect(() => {
    const valid = new Set(pendingStockOrders.map(i => i.rowKey));
    setSelectedPendingRowKeys(prev => {
      const next = new Set([...prev].filter(id => valid.has(id)));
      return next.size === prev.size && [...prev].every(id => next.has(id)) ? prev : next;
    });
  }, [pendingStockOrders]);

  if (!open) return null;

  return (
    <>
      {/* 待入库清单弹窗 */}
      {(() => {
        const product = stockInOrder ? productMap.get(stockInOrder.order.productId) : null;
        const category = product ? categoryMap.get(product.categoryId) : null;
        const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);
        const groupedVariantsForStock: Record<string, ProductVariant[]> = (() => {
          if (!product?.variants?.length) return {};
          const groups: Record<string, ProductVariant[]> = {};
          product.variants.forEach(v => {
            if (!groups[v.colorId]) groups[v.colorId] = [];
            groups[v.colorId].push(v);
          });
          return groups;
        })();
        const totalStockInQty = hasColorSize
          ? (Object.values(stockInForm.variantQuantities) as number[]).reduce((s, q) => s + (q || 0), 0)
          : stockInForm.singleQuantity;
        const canSubmitStockIn = onAddRecord && totalStockInQty > 0 && totalStockInQty <= (stockInOrder?.pendingTotal ?? 0) && !!stockInForm.warehouseId;

        if (batchStockInItems && batchStockInItems.length > 0) {
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
              const t = Object.values(line.variantQuantities).reduce((s, q) => s + (Number(q) || 0), 0);
              batchTotalPieces += t;
              if (t > pit.pendingTotal) batchError = true;
              if (t > 0) batchHasValidQty = true;
              Object.entries(line.variantQuantities).forEach(([vid, q]) => {
                if ((Number(q) || 0) > (pit.pendingByVariant[vid] ?? 0)) batchError = true;
              });
            } else {
              const q = Number(line.singleQuantity) || 0;
              batchTotalPieces += q;
              if (q > pit.pendingTotal) batchError = true;
              if (q > 0) batchHasValidQty = true;
            }
          }
          const canSubmitBatch =
            (onAddRecord || onAddRecordBatch) &&
            !!batchStockForm.warehouseId &&
            batchHasValidQty &&
            !batchError;

          return (
            <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                onClick={() => {
                  setBatchStockInItems(null);
                  setBatchStockForm({ warehouseId: '', lines: {} });
                }}
              />
              <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 批量入库（{batchStockInItems.length} 笔）
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setBatchStockInItems(null);
                      setBatchStockForm({ warehouseId: '', lines: {} });
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">入库仓库（共用）</label>
                  {warehouses.length > 0 ? (
                    <select
                      value={batchStockForm.warehouseId}
                      onChange={e => setBatchStockForm(f => ({ ...f, warehouseId: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">请选择仓库</option>
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm font-bold text-amber-700">请先在「进销存」中设置仓库。</p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">本次将使用同一入库单号生成多条明细；合计 {batchTotalPieces}（校验通过后方可提交）</p>
                  {batchError && <p className="text-xs font-bold text-rose-600 mt-1">存在超量行，请检查各行不超过本单待入库。</p>}
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {batchStockInItems.map(stockItem => {
                    const order = stockItem.order;
                    const lineKey = stockItem.rowKey;
                    const line = batchStockForm.lines[lineKey] ?? { variantQuantities: {}, singleQuantity: 0 };
                    const p = productMap.get(order.productId);
                    const cat = p ? categoryMap.get(p.categoryId) : undefined;
                    const hasCS = productHasColorSizeMatrix(p ?? undefined, cat ?? undefined);
                    const unitName = getUnitName(order.productId);
                    const grouped: Record<string, ProductVariant[]> = {};
                    (p?.variants ?? []).forEach(v => {
                      if (!grouped[v.colorId]) grouped[v.colorId] = [];
                      grouped[v.colorId].push(v);
                    });
                    const patchLine = (patch: Partial<{ variantQuantities: Record<string, number>; singleQuantity: number }>) => {
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
                    return (
                      <div key={lineKey} className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-bold text-slate-800">{order.productName || p?.name}</p>
                          {productionLinkMode !== 'product' && (
                            <span className="text-xs font-bold text-slate-500">工单 {order.orderNumber}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">本单待入库 {stockItem.pendingTotal} {unitName}</p>
                        {hasCS && p?.variants?.length ? (
                          <div className="space-y-3">
                            {sortedVariantColorEntries(grouped, p.colorIds, p.sizeIds).map(([colorId, colorVariants]) => {
                              const color = (dictionaries.colors as { id: string; name: string; value: string }[] | undefined)?.find(c => c.id === colorId);
                              return (
                                <div key={colorId} className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
                                  <div className="flex items-center gap-2 w-28 shrink-0">
                                    <div className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string })?.value }} />
                                    <span className="text-xs font-bold text-slate-700">{color?.name ?? colorId}</span>
                                  </div>
                                  <div className="flex-1 flex flex-wrap gap-2">
                                    {(colorVariants as ProductVariant[]).map(v => {
                                      const size = (dictionaries.sizes as { id: string; name: string }[] | undefined)?.find(s => s.id === v.sizeId);
                                      const pending = stockItem.pendingByVariant[v.id] ?? 0;
                                      return (
                                        <div key={v.id} className="flex flex-col gap-0.5 w-[4.5rem]">
                                          <span className="text-[9px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.skuSuffix}</span>
                                          <input
                                            type="number"
                                            min={0}
                                            placeholder={`≤${pending}`}
                                            value={line.variantQuantities[v.id] ?? ''}
                                            onChange={e => {
                                              const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                                              patchLine({ variantQuantities: { [v.id]: n } });
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-1 text-xs font-bold text-indigo-600 text-center"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            max={stockItem.pendingTotal}
                            value={line.singleQuantity || ''}
                            onChange={e =>
                              patchLine({
                                singleQuantity: Math.max(0, Math.min(stockItem.pendingTotal, parseInt(e.target.value, 10) || 0)),
                              })
                            }
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-lg font-bold text-indigo-600"
                            placeholder={`最多 ${stockItem.pendingTotal}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchStockInItems(null);
                      setBatchStockForm({ warehouseId: '', lines: {} });
                    }}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                  >
                    返回列表
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmitBatch}
                    onClick={async () => {
                      if (!(onAddRecord || onAddRecordBatch) || !canSubmitBatch) return;
                      const ts = new Date().toLocaleString();
                      const operator = docOperator;
                      const docNo = getNextStockInDocNo();
                      const records: ProductionOpRecord[] = [];
                      let seq = 0;
                      for (const pit of batchStockInItems) {
                        const line = batchStockForm.lines[pit.rowKey];
                        if (!line) continue;
                        const p = productMap.get(pit.order.productId);
                        const cat = p ? categoryMap.get(p.categoryId) : undefined;
                        const hasCS = productHasColorSizeMatrix(p ?? undefined, cat ?? undefined);
                        const isMultiOrder = pit.ordersInRow.length > 1;
                        const sortedOrders = isMultiOrder
                          ? [...pit.ordersInRow].sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '', 'zh-CN'))
                          : [pit.order];
                        if (hasCS && p?.variants?.length) {
                          const variantEntries = (Object.entries(line.variantQuantities) as [string, number][]).filter(([, q]) => q > 0);
                          if (isMultiOrder) {
                            for (const [vid, totalQty] of variantEntries) {
                              let remain = totalQty;
                              for (const o of sortedOrders) {
                                if (remain <= 0) break;
                                const oVarQty = o.items.filter(i => (i.variantId || '') === vid).reduce((s, i) => s + i.quantity, 0);
                                const oStockIn = prodRecords.filter(r => r.type === 'STOCK_IN' && r.orderId === o.id && (r.variantId ?? '') === vid).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                                const cap = Math.max(0, oVarQty - oStockIn);
                                if (cap <= 0) continue;
                                const alloc = Math.min(remain, cap);
                                remain -= alloc;
                                seq += 1;
                                records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, variantId: vid || undefined, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                              }
                              if (remain > 0) {
                                seq += 1;
                                records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: sortedOrders[sortedOrders.length - 1].id, productId: pit.order.productId, variantId: vid || undefined, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                              }
                            }
                          } else {
                            variantEntries.forEach(([variantId, qty]) => {
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: pit.order.id, productId: pit.order.productId, variantId: variantId || undefined, quantity: qty, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                            });
                          }
                        } else {
                          const totalQty = line.singleQuantity || 0;
                          if (totalQty <= 0) continue;
                          if (isMultiOrder) {
                            let remain = totalQty;
                            for (const o of sortedOrders) {
                              if (remain <= 0) break;
                              const oTotal = o.items.reduce((s, i) => s + i.quantity, 0);
                              const oIn = prodRecords.filter(r => r.type === 'STOCK_IN' && r.orderId === o.id).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                              const cap = Math.max(0, oTotal - oIn);
                              if (cap <= 0) continue;
                              const alloc = Math.min(remain, cap);
                              remain -= alloc;
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                            }
                            if (remain > 0) {
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: sortedOrders[sortedOrders.length - 1].id, productId: pit.order.productId, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                            }
                          } else {
                            seq += 1;
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: pit.order.id, productId: pit.order.productId, quantity: totalQty, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                          }
                        }
                      }
                      if (records.length === 0) return;
                      if (onAddRecordBatch) await onAddRecordBatch(records);
                      else for (const rec of records) await onAddRecord!(rec);
                      const batchTotalQty = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                      toast.success('批量入库已保存', {
                        description: `入库单号 ${docNo}，${records.length} 条明细，合计 ${batchTotalQty} 件`,
                      });
                      setBatchStockInItems(null);
                      setBatchStockForm({ warehouseId: '', lines: {} });
                      setSelectedPendingRowKeys(new Set());
                    }}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" /> 确认批量入库
                  </button>
                </div>
              </div>
            </div>
          );
        }

        if (stockInOrder) {
          const order = stockInOrder.order;
          const unitName = getUnitName(order.productId);
          return (
            <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStockInOrder(null); setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 }); }} />
              <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 选择入库 — {productionLinkMode === 'product' ? (order.productName || product?.name || '关联产品') : order.orderNumber}</h3>
                  <button onClick={() => { setStockInOrder(null); setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 }); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                  <p className="text-sm font-bold text-slate-700">{order.productName || product?.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {productionLinkMode === 'product'
                      ? <>产品工单总数 {stockInOrder.productBlockOrderTotal} {unitName}，产品总入库 {stockInOrder.productTotalStockIn ?? stockInOrder.alreadyIn} {unitName}，待入库 {stockInOrder.pendingTotal} {unitName}</>
                      : <>工单总量 {stockInOrder.orderTotal} {unitName}，已入库 {stockInOrder.alreadyIn} {unitName}，待入库 {stockInOrder.pendingTotal} {unitName}</>}
                  </p>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-4">
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
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <span className="text-amber-500 text-lg">⚠</span>
                        <p className="text-sm font-bold text-amber-700">请先在「进销存」中设置仓库后再进行入库操作</p>
                      </div>
                    )}
                  </div>
                  {hasColorSize && product?.variants?.length ? (
                    <div className="space-y-4">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">入库数量明细（颜色尺码）</h4>
                      {sortedVariantColorEntries(groupedVariantsForStock, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                        const color = (dictionaries.colors as { id: string; name: string; value: string }[] | undefined)?.find(c => c.id === colorId);
                        return (
                          <div key={colorId} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
                            <div className="flex items-center gap-2 w-32 shrink-0">
                              <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string })?.value }} />
                              <span className="text-sm font-bold text-slate-700">{color?.name ?? colorId}</span>
                            </div>
                            <div className="flex-1 flex flex-wrap gap-3">
                              {(colorVariants as ProductVariant[]).map(v => {
                                const size = (dictionaries.sizes as { id: string; name: string }[] | undefined)?.find(s => s.id === v.sizeId);
                                const pending = stockInOrder.pendingByVariant[v.id] ?? 0;
                                return (
                                  <div key={v.id} className="flex flex-col gap-1 w-20">
                                    <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.skuSuffix}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder={`待入库 ${pending}`}
                                      value={stockInForm.variantQuantities[v.id] ?? ''}
                                      onChange={e => setStockInForm(f => ({
                                        ...f,
                                        variantQuantities: { ...f.variantQuantities, [v.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }
                                      }))}
                                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-2 text-sm font-bold text-indigo-600 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[9px] font-black text-slate-300 uppercase">颜色小计</p>
                              <p className="text-sm font-bold text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (stockInForm.variantQuantities[v.id] || 0), 0)}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex flex-col items-end gap-1 p-3 bg-indigo-600 rounded-2xl text-white">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold opacity-80">本次入库合计:</span>
                          <span className="text-lg font-black">{totalStockInQty} {unitName}</span>
                        </div>
                        {totalStockInQty > stockInOrder.pendingTotal && (
                          <span className="text-xs font-bold text-amber-200">不得超过可入库数量 {stockInOrder.pendingTotal} {unitName}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">入库数量 ({unitName})</label>
                      <input
                        type="number"
                        min={0}
                        max={stockInOrder.pendingTotal}
                        value={stockInForm.singleQuantity || ''}
                        onChange={e => setStockInForm(f => ({ ...f, singleQuantity: Math.max(0, Math.min(stockInOrder.pendingTotal, parseInt(e.target.value, 10) || 0)) }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 px-6 text-xl font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder={`最多 ${stockInOrder.pendingTotal}`}
                      />
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setStockInOrder(null); setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 }); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                  >
                    返回列表
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmitStockIn}
                    onClick={async () => {
                      if (!(onAddRecord || onAddRecordBatch) || !canSubmitStockIn) return;
                      const ts = new Date().toLocaleString();
                      const operator = docOperator;
                      const docNo = getNextStockInDocNo();
                      const isProductMode = productionLinkMode === 'product' && stockInOrder.ordersInRow.length > 1;
                      if (isProductMode) {
                        const records: ProductionOpRecord[] = [];
                        let seq = 0;
                        const sortedOrders = [...stockInOrder.ordersInRow].sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '', 'zh-CN'));
                        if (hasColorSize && product?.variants?.length) {
                          const variantEntries = (Object.entries(stockInForm.variantQuantities) as [string, number][]).filter(([, q]) => q > 0);
                          for (const [vid, totalQty] of variantEntries) {
                            let remain = totalQty;
                            for (const o of sortedOrders) {
                              if (remain <= 0) break;
                              const orderVarQty = o.items.filter(i => (i.variantId || '') === vid).reduce((s, i) => s + i.quantity, 0);
                              if (orderVarQty <= 0) continue;
                              const orderStockIn = prodRecords.filter(r => r.type === 'STOCK_IN' && r.orderId === o.id && (r.variantId ?? '') === vid).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                              const cap = Math.max(0, orderVarQty - orderStockIn);
                              if (cap <= 0) continue;
                              const alloc = Math.min(remain, cap);
                              remain -= alloc;
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, variantId: vid || undefined, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                            }
                            if (remain > 0) {
                              const fallback = sortedOrders[sortedOrders.length - 1];
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: fallback.id, productId: fallback.productId, variantId: vid || undefined, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                            }
                          }
                        } else {
                          let remain = stockInForm.singleQuantity || 0;
                          for (const o of sortedOrders) {
                            if (remain <= 0) break;
                            const oTotal = o.items.reduce((s, i) => s + i.quantity, 0);
                            const oIn = prodRecords.filter(r => r.type === 'STOCK_IN' && r.orderId === o.id).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                            const cap = Math.max(0, oTotal - oIn);
                            if (cap <= 0) continue;
                            const alloc = Math.min(remain, cap);
                            remain -= alloc;
                            seq += 1;
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                          }
                          if (remain > 0) {
                            const fallback = sortedOrders[sortedOrders.length - 1];
                            seq += 1;
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: fallback.id, productId: fallback.productId, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo } as ProductionOpRecord);
                          }
                        }
                        if (records.length > 0) {
                          if (onAddRecordBatch) await onAddRecordBatch(records);
                          else for (const rec of records) await onAddRecord!(rec);
                          const t = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                          toast.success('入库已保存', {
                            description: `入库单号 ${docNo}，${records.length} 条明细，合计 ${t} ${unitName}`,
                          });
                        }
                      } else if (hasColorSize && product?.variants?.length) {
                        const records = (Object.entries(stockInForm.variantQuantities) as [string, number][])
                          .filter(([, qty]) => qty > 0)
                          .map(([variantId, qty]) => ({
                            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            type: 'STOCK_IN' as const,
                            orderId: order.id,
                            productId: order.productId,
                            variantId: variantId || undefined,
                            quantity: qty,
                            operator,
                            timestamp: ts,
                            status: '已完成',
                            warehouseId: stockInForm.warehouseId || undefined,
                            docNo
                          }));
                        if (records.length > 0) {
                          if (onAddRecordBatch) {
                            await onAddRecordBatch(records as ProductionOpRecord[]);
                          } else {
                            for (const rec of records) await onAddRecord!(rec as ProductionOpRecord);
                          }
                          const t = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                          toast.success('入库已保存', {
                            description: `入库单号 ${docNo}，${records.length} 条明细，合计 ${t} ${unitName}`,
                          });
                        }
                      } else {
                        const qty = stockInForm.singleQuantity || 0;
                        if (qty <= 0) return;
                        await onAddRecord!({
                          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          type: 'STOCK_IN',
                          orderId: order.id,
                          productId: order.productId,
                          quantity: qty,
                          operator,
                          timestamp: ts,
                          status: '已完成',
                          warehouseId: stockInForm.warehouseId || undefined,
                          docNo
                        } as ProductionOpRecord);
                        toast.success('入库已保存', {
                          description: `入库单号 ${docNo}，1 条明细，合计 ${qty} ${unitName}`,
                        });
                      }
                      setStockInOrder(null);
                      setStockInForm({ warehouseId: warehouses[0]?.id ?? '', variantQuantities: {}, singleQuantity: 0 });
                    }}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" /> 确认入库
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // 待入库列表
        return (
          <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 待入库清单</h3>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {hasPerm('production:orders_pending_stock_in:create') && pendingStockOrders.length > 0 && (
                    <button
                      type="button"
                      disabled={selectedPendingRowKeys.size === 0}
                      onClick={() => {
                        const rows = pendingStockOrders.filter(i => selectedPendingRowKeys.has(i.rowKey));
                        if (rows.length === 0) return;
                        const lines: Record<string, { variantQuantities: Record<string, number>; singleQuantity: number }> = {};
                        rows.forEach(it => {
                          lines[it.rowKey] = defaultQuantitiesForPendingItem(it);
                        });
                        setStockInOrder(null);
                        setBatchStockForm({ warehouseId: warehouses[0]?.id ?? '', lines });
                        setBatchStockInItems(rows);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      批量入库{selectedPendingRowKeys.size > 0 ? ` (${selectedPendingRowKeys.size})` : ''}
                    </button>
                  )}
                  {hasPerm('production:orders_pending_stock_in:view') && (
                  <button
                    onClick={() => setShowStockInFlowModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all"
                  >
                    <History className="w-4 h-4" /> 入库流水
                  </button>
                  )}
                  <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {pendingStockOrders.length === 0 ? (
                  <p className="text-slate-500 text-center py-12">暂无待入库工单（有完成数量且待入库&gt;0 的工单将显示在此）</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {hasPerm('production:orders_pending_stock_in:create') && (
                            <th className="px-2 py-3 w-10 text-center">
                              <input
                                type="checkbox"
                                title="全选"
                                checked={
                                  pendingStockOrders.length > 0 &&
                                  pendingStockOrders.every(i => selectedPendingRowKeys.has(i.rowKey))
                                }
                                onChange={() => {
                                  const all = pendingStockOrders.every(i => selectedPendingRowKeys.has(i.rowKey));
                                  if (all) setSelectedPendingRowKeys(new Set());
                                  else setSelectedPendingRowKeys(new Set(pendingStockOrders.map(i => i.rowKey)));
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </th>
                          )}
                          {productionLinkMode !== 'product' && (
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">工单号</th>
                          )}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">
                            {productionLinkMode === 'product' ? '产品工单总数' : '工单总量'}
                          </th>
                          {productionLinkMode === 'product' && (
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">产品总入库</th>
                          )}
                          {productionLinkMode !== 'product' && (
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已入库</th>
                          )}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">
                            {productionLinkMode === 'product' ? '本单待入库' : '待入库'}
                          </th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-28"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingStockOrders.map(item => {
                          const unitName = getUnitName(item.order.productId);
                          return (
                            <tr key={item.rowKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                              {hasPerm('production:orders_pending_stock_in:create') && (
                                <td className="px-2 py-3 text-center align-middle">
                                  <input
                                    type="checkbox"
                                    checked={selectedPendingRowKeys.has(item.rowKey)}
                                    onChange={e => {
                                      e.stopPropagation();
                                      setSelectedPendingRowKeys(prev => {
                                        const next = new Set(prev);
                                        if (next.has(item.rowKey)) next.delete(item.rowKey);
                                        else next.add(item.rowKey);
                                        return next;
                                      });
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                </td>
                              )}
                              {productionLinkMode !== 'product' && (
                                <td className="px-4 py-3 font-bold text-slate-800">{item.order.orderNumber}</td>
                              )}
                              <td className="px-4 py-3 text-slate-700">{item.order.productName}</td>
                              <td className="px-4 py-3 text-slate-600 text-right">
                                {productionLinkMode === 'product' ? item.productBlockOrderTotal : item.orderTotal} {unitName}
                              </td>
                              {productionLinkMode === 'product' && (
                                <td className="px-4 py-3 text-slate-600 text-right">
                                  {item.productTotalStockIn ?? 0} {unitName}
                                </td>
                              )}
                              {productionLinkMode !== 'product' && (
                                <td className="px-4 py-3 text-slate-600 text-right">{item.alreadyIn} {unitName}</td>
                              )}
                              <td className="px-4 py-3 font-bold text-indigo-600 text-right">{item.pendingTotal} {unitName}</td>
                              <td className="px-4 py-3">
                                {hasPerm('production:orders_pending_stock_in:create') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchStockInItems(null);
                                    setBatchStockForm({ warehouseId: '', lines: {} });
                                    setStockInOrder(item);
                                    const d = defaultQuantitiesForPendingItem(item);
                                    setStockInForm({
                                      warehouseId: warehouses[0]?.id ?? '',
                                      variantQuantities: d.variantQuantities,
                                      singleQuantity: d.singleQuantity,
                                    });
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                  选择入库
                                </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 生产入库流水弹窗 */}
      {showStockInFlowModal && (() => {
        type StockInRow = {
          id: string;
          docNo: string;
          orderId: string;
          orderNumber: string;
          productId: string;
          productName: string;
          warehouseId?: string;
          warehouseName: string;
          variantId?: string;
          quantity: number;
          operator: string;
          timestamp: string;
        };
        const allStockInRows: StockInRow[] = (prodRecords || [])
          .filter(r => r.type === 'STOCK_IN')
          .map(r => {
            const order = r.orderId ? orders.find(o => o.id === r.orderId) : undefined;
            const product = productMap.get(r.productId);
            const wh = r.warehouseId ? warehouses.find(w => w.id === r.warehouseId) : undefined;
            return {
              id: r.id,
              docNo: (r.docNo as string) || r.id,
              orderId: r.orderId ?? '',
              orderNumber: order?.orderNumber ?? '',
              productId: r.productId ?? '',
              productName: product?.name || order?.productName || '',
              warehouseId: r.warehouseId,
              warehouseName: wh?.name ?? '',
              variantId: r.variantId,
              quantity: r.quantity ?? 0,
              operator: r.operator ?? '',
              timestamp: r.timestamp ?? '',
            };
          });

        const sf = stockInFlowFilter;
        const filteredRows = allStockInRows.filter(r => {
          if (sf.dateFrom || sf.dateTo) {
            const dateStr = toLocalDateYmd(r.timestamp);
            if (sf.dateFrom && dateStr < sf.dateFrom) return false;
            if (sf.dateTo && dateStr > sf.dateTo) return false;
          }
          if (sf.docNo && !r.docNo.toLowerCase().includes(sf.docNo.toLowerCase())) return false;
          if (sf.orderNumber && !r.orderNumber.toLowerCase().includes(sf.orderNumber.toLowerCase())) return false;
          if (sf.productName && !r.productName.toLowerCase().includes(sf.productName.toLowerCase())) return false;
          if (sf.warehouseId && r.warehouseId !== sf.warehouseId) return false;
          return true;
        });

        type StockInBatch = {
          docNo: string;
          rows: StockInRow[];
          first: StockInRow;
          totalQty: number;
          orderNumber: string;
          productName: string;
          warehouseName: string;
        };
        const groups = new Map<string, StockInRow[]>();
        filteredRows.forEach(r => {
          const k = r.docNo;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(r);
        });
        const batches: StockInBatch[] = Array.from(groups.entries())
          .map(([docNo, rows]) => {
            const pid = rows[0].productId;
            const prod = productMap.get(pid);
            return {
              docNo,
              rows,
              first: rows[0],
              totalQty: rows.reduce((s, r) => s + r.quantity, 0),
              orderNumber: rows[0].orderNumber,
              productName: prod?.name || rows[0].productName,
              warehouseName: rows[0].warehouseName,
            };
          })
          .sort((a, b) => {
            const da = flowRecordsEarliestMs(a.rows.map(r => ({ timestamp: r.timestamp })));
            const db = flowRecordsEarliestMs(b.rows.map(r => ({ timestamp: r.timestamp })));
            if (db !== da) return db - da;
            return a.docNo.localeCompare(b.docNo);
          });

        const totalQtyAll = batches.reduce((s, b) => s + b.totalQty, 0);
        const uniqueWarehouses = [...new Set(allStockInRows.map(r => r.warehouseId).filter(Boolean))] as string[];

        const detailBatch = stockInFlowDetailDocNo ? batches.find(b => b.docNo === stockInFlowDetailDocNo) : null;

        return (
          <>
            <div className="fixed inset-0 z-[86] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setShowStockInFlowModal(false); setStockInFlowDetailDocNo(null); }} />
              <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 生产入库流水</h3>
                  <button onClick={() => { setShowStockInFlowModal(false); setStockInFlowDetailDocNo(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">开始时间</label>
                      <input type="date" value={sf.dateFrom} onChange={e => setStockInFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">结束时间</label>
                      <input type="date" value={sf.dateTo} onChange={e => setStockInFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
                      <input type="text" value={sf.docNo} onChange={e => setStockInFlowFilter(prev => ({ ...prev, docNo: e.target.value }))} placeholder="RK2026... 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    {productionLinkMode !== 'product' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
                      <input type="text" value={sf.orderNumber} onChange={e => setStockInFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    )}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">产品名称</label>
                      <input type="text" value={sf.productName} onChange={e => setStockInFlowFilter(prev => ({ ...prev, productName: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">入库仓库</label>
                      <select value={sf.warehouseId} onChange={e => setStockInFlowFilter(prev => ({ ...prev, warehouseId: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                        <option value="">全部</option>
                        {uniqueWarehouses.map(wid => {
                          const w = warehouses.find(x => x.id === wid);
                          return <option key={wid} value={wid}>{w?.name ?? wid}</option>;
                        })}
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-4">
                    <button onClick={() => setStockInFlowFilter({ dateFrom: '', dateTo: '', docNo: '', orderNumber: '', productName: '', warehouseId: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                    <span className="text-xs text-slate-400">共 {batches.length} 次入库，合计 {totalQtyAll} 件</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {batches.length === 0 ? (
                    <p className="text-slate-500 text-center py-12">暂无生产入库流水</p>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                            {productionLinkMode !== 'product' && (
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>
                            )}
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">入库仓库</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">经办人</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {batches.map(batch => {
                            const batchProduct = productMap.get(batch.first.productId);
                            const batchUnit = (batchProduct?.unitId && dictionaries?.units?.find(u => u.id === batchProduct.unitId)?.name) || '件';
                            return (
                              <tr key={batch.docNo} className="border-b border-slate-100 hover:bg-slate-50/50">
                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDT(batch.first.timestamp)}</td>
                                <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{batch.docNo}</td>
                                <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{batch.productName}</td>
                                {productionLinkMode !== 'product' && (
                                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{batch.orderNumber}</td>
                                )}
                                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{batch.warehouseName || '—'}</td>
                                <td className="px-4 py-3 font-bold text-emerald-600 text-right whitespace-nowrap">{batch.totalQty} {batchUnit}</td>
                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{batch.first.operator}</td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() => setStockInFlowDetailDocNo(batch.docNo)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                                  >
                                    <FileText className="w-3.5 h-3.5" /> 详情
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                            <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 4 : 5}></td>
                            <td className="px-4 py-3 text-emerald-600 text-right">{totalQtyAll} 件</td>
                            <td className="px-4 py-3" colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 入库流水详情弹窗 */}
            {detailBatch && (() => {
              const product = productMap.get(detailBatch.first.productId);
              const category = product ? categoryMap.get(product.categoryId) : null;
              const hasColorSize = productHasColorSizeMatrix(product, category ?? undefined);
              const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
              const wh = warehouses.find(w => w.id === detailBatch.first.warehouseId);
              const isEditing = stockInFlowEditing !== null;
              const getVariantLabel = (variantId?: string) => {
                if (!variantId) return '—';
                const v = product?.variants?.find((x: { id: string }) => x.id === variantId);
                if (!v) return variantId;
                const color = (dictionaries.colors as { id: string; name: string }[] | undefined)?.find(c => c.id === v.colorId);
                const size = (dictionaries.sizes as { id: string; name: string }[] | undefined)?.find(s => s.id === v.sizeId);
                const parts: string[] = [];
                if (color) parts.push(color.name);
                if (size) parts.push(size.name);
                return parts.length > 0 ? parts.join(' / ') : ((v as { skuSuffix?: string })?.skuSuffix || variantId);
              };
              const startEdit = () => setStockInFlowEditing({
                warehouseId: detailBatch.first.warehouseId ?? '',
                operator: detailBatch.first.operator,
                rows: detailBatch.rows.map(r => ({ id: r.id, variantId: r.variantId, quantity: r.quantity })),
              });
              const cancelEdit = () => setStockInFlowEditing(null);
              const saveEdit = () => {
                if (!stockInFlowEditing || !onUpdateRecord) return;
                const docRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo);
                docRecords.forEach(rec => {
                  const editRow = stockInFlowEditing.rows.find(r => r.id === rec.id);
                  if (editRow) {
                    onUpdateRecord({
                      ...rec,
                      quantity: Math.max(0, editRow.quantity),
                      warehouseId: stockInFlowEditing.warehouseId || undefined,
                      operator: stockInFlowEditing.operator,
                    });
                  }
                });
                setStockInFlowEditing(null);
              };
              const handleDelete = () => {
                if (!onDeleteRecord) return;
                void confirm({ message: '确定要删除该入库单的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                  if (!ok) return;
                  const docRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo);
                  docRecords.forEach(rec => onDeleteRecord(rec.id));
                  setStockInFlowDetailDocNo(null);
                  setStockInFlowEditing(null);
                });
              };
              const ef = stockInFlowEditing;
              const editTotalQty = ef ? ef.rows.reduce((s, r) => s + r.quantity, 0) : 0;
              return (
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStockInFlowDetailDocNo(null); setStockInFlowEditing(null); }} />
                  <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                    <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                          {detailBatch.docNo}
                        </span>
                        入库详情
                      </h3>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={cancelEdit} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                            <button type="button" onClick={saveEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                              <Check className="w-4 h-4" /> 保存
                            </button>
                          </>
                        ) : (
                          <>
                            {onUpdateRecord && hasPerm('production:orders_pending_stock_in:edit') && (
                              <button type="button" onClick={startEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                                <Pencil className="w-4 h-4" /> 编辑
                              </button>
                            )}
                            {onDeleteRecord && hasPerm('production:orders_pending_stock_in:delete') && (
                              <button type="button" onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                                <Trash2 className="w-4 h-4" /> 删除
                              </button>
                            )}
                          </>
                        )}
                        <button onClick={() => { setStockInFlowDetailDocNo(null); setStockInFlowEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 space-y-4">
                      <h2 className="text-xl font-bold text-slate-900">{detailBatch.productName}</h2>
                      {isEditing && ef ? (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">入库仓库</label>
                              <select
                                value={ef.warehouseId}
                                onChange={e => setStockInFlowEditing(prev => prev ? { ...prev, warehouseId: e.target.value } : prev)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="">请选择仓库</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">经办人</label>
                              <input
                                type="text"
                                value={ef.operator}
                                onChange={e => setStockInFlowEditing(prev => prev ? { ...prev, operator: e.target.value } : prev)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ef.rows.map(row => (
                                  <tr key={row.id} className="border-b border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{getVariantLabel(row.variantId)}</td>
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        value={row.quantity}
                                        onChange={e => setStockInFlowEditing(prev => prev ? {
                                          ...prev,
                                          rows: prev.rows.map(r => r.id === row.id ? { ...r, quantity: Math.max(0, parseInt(e.target.value, 10) || 0) } : r)
                                        } : prev)}
                                        className="w-24 bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-sm font-bold text-indigo-600 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              {ef.rows.length > 1 && (
                                <tfoot>
                                  <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                                    <td className="px-4 py-3">合计</td>
                                    <td className="px-4 py-3 text-emerald-600 text-right">{editTotalQty} {unitName}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-4">
                            {productionLinkMode !== 'product' && (
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工单号</p>
                              <p className="text-sm font-bold text-slate-800">{detailBatch.orderNumber || '—'}</p>
                            </div>
                            )}
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">入库仓库</p>
                              <p className="text-sm font-bold text-slate-800">{wh?.name || '—'}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">入库数量</p>
                              <p className="text-sm font-bold text-indigo-600">{detailBatch.totalQty} {unitName}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">入库时间</p>
                              <p className="text-sm font-bold text-slate-800">{fmtDT(detailBatch.first.timestamp)}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl px-4 py-2">
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">经办人</p>
                              <p className="text-sm font-bold text-slate-800">{detailBatch.first.operator}</p>
                            </div>
                          </div>
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailBatch.rows.map(row => (
                                  <tr key={row.id} className="border-b border-slate-100">
                                    <td className="px-4 py-3 text-slate-800">{getVariantLabel(row.variantId)}</td>
                                    <td className="px-4 py-3 font-bold text-emerald-600 text-right">{row.quantity} {unitName}</td>
                                  </tr>
                                ))}
                              </tbody>
                              {hasColorSize && detailBatch.rows.length > 1 && (
                                <tfoot>
                                  <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                                    <td className="px-4 py-3">合计</td>
                                    <td className="px-4 py-3 text-emerald-600 text-right">{detailBatch.totalQty} {unitName}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        );
      })()}
    </>
  );
};

export default React.memo(PendingStockPanel);
