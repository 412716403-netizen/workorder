
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { X, History, Check, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  BOM,
  ProductionOpRecord,
  Warehouse,
  ProductCategory,
  ProcessSequenceMode,
  ProductMilestoneProgress,
  OrderFormSettings,
  PrintTemplate,
  PrintRenderContext,
} from '../../types';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';

import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import { computePendingStockOrders } from '../../utils/pendingStockCompute';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { PlanFormCustomFieldReadonly } from '../../components/PlanFormCustomFieldControls';
import { ScanBatchTrigger } from '../../components/scan/ScanBatchTrigger';
import DocPhaseModal from '../../components/DocPhaseModal';
import { DocSummaryCard, DocInlineMetaRow } from '../../components/doc-modal';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import { rewriteScanApiErrorForIme, type ScanPayload } from '../../utils/scanPayload';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import { scanItemResultToRowDetail, scanVirtualBatchResultToRowDetail } from '../../utils/scanBatchRowDetail';
import { fmtDT } from '../../utils/formatTime';
import { buildOneBlockMatrixPrintRows } from '../../utils/variantMatrixPrintRows';
import {
  psiOrderBillFormSectionStackClass,
  psiOrderBillCompactWarehouseSelectClass,
} from '../../styles/uiDensity';
import { psiCustomFieldHasFilledDisplayValue } from '../psi-ops/psiOpsListFormatting';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import {
  stockInCollabFromCustomData,
  StockInCustomCreateFields,
  StockInCustomEditFields,
  expandPendingByVariantForMatrix,
  buildStockInFormDefaultsForPending,
  type PendingStockItem,
} from './pendingStockStockInHelpers';
import {
  fetchProductionByFilter,
  getTodayRangeIso,
  isoToDateInput,
} from '../production-ops/sharedFlowListHelpers';
import { StockInFlowModal } from './StockInFlowModal';

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
  orderFormSettings: OrderFormSettings;
  printTemplates: PrintTemplate[];
  onOpenOrderFormPrintTab?: () => void;
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
  orderFormSettings,
  printTemplates,
  onOpenOrderFormPrintTab,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);

  const singlePendingStockInDefaultWh = useCallback(() => {
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN);
    return resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '') || '';
  }, [warehouses, tenantCtx?.tenantId, userId]);

  const batchPendingStockInDefaultWh = useCallback(() => {
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN_BATCH);
    return resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '') || '';
  }, [warehouses, tenantCtx?.tenantId, userId]);
  const [stockInFilePreview, setStockInFilePreview] = useState<{ url: string; type: 'image' | 'pdf' } | null>(null);

  const hasPerm = (perm: string): boolean => {
    if (tenantRole === 'owner') return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('production') && !userPermissions.some(p => p.startsWith('production:'))) return true;
    if (userPermissions.includes(perm)) return true;
    return false;
  };

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const stockInCustomFieldDefs = orderFormSettings.stockInCustomFields ?? [];

  const getUnitName = (productId: string) => {
    const p = productMap.get(productId);
    const u = (dictionaries.units ?? []).find((x: { id: string; name: string }) => x.id === p?.unitId);
    return (u as { name: string } | undefined)?.name ?? 'PCS';
  };

  /**
   * Pending 计算自取一份"全量 STOCK_IN"——以 panel 自己 `orders` 内的 orderIds + productIds 为口径，
   * 不依赖上游 `OrderListView.orderCenterProdQuery`（那份按当前分页 `displayOrders` 收窄，
   * 当目标工单不在当前列表页时会让"已入库"漏算，pending 永远扣不下来）。
   *
   * 写入后由 `invalidateAllProdRecords` 通过 `pendingStockPanel.stockIn` 这个 queryKey 前缀触发刷新。
   */
  const pendingOrderIdsCsv = useMemo(
    () => orders.map(o => o.id).filter(Boolean).join(','),
    [orders],
  );
  const pendingProductIdsCsv = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) if (o.productId) s.add(o.productId);
    return [...s].join(',');
  }, [orders]);
  const pendingStockInQuery = useQuery({
    queryKey: ['pendingStockPanel.stockIn', pendingOrderIdsCsv, pendingProductIdsCsv],
    queryFn: () =>
      fetchProductionByFilter({
        type: 'STOCK_IN',
        orderIds: pendingOrderIdsCsv || undefined,
        productIds: pendingProductIdsCsv || undefined,
      }),
    enabled: open && (pendingOrderIdsCsv.length > 0 || pendingProductIdsCsv.length > 0),
    staleTime: 15_000,
  });

  /** 兜底：若 panel 局部 query 尚未 ready，回退到上游 `prodRecords`，避免短暂闪空。 */
  const pendingProdRecords = useMemo<ProductionOpRecord[]>(() => {
    const local = pendingStockInQuery.data;
    if (Array.isArray(local) && local.length > 0) return local;
    return prodRecords ?? [];
  }, [pendingStockInQuery.data, prodRecords]);

  /** 待入库清单：关联工单读工单报工；关联产品读产品 PMP 并按工单数量占比分摊（与工单中心产品组逻辑一致）。 */
  const pendingStockOrders = useMemo(
    (): PendingStockItem[] =>
      computePendingStockOrders(orders, pendingProdRecords, {
        productionLinkMode,
        productMilestoneProgresses,
      }),
    [orders, pendingProdRecords, productionLinkMode, productMilestoneProgresses],
  );

  /**
   * 历史实现基于 `props.prodRecords` 上一次缓存自算最大 RK 序号，但 `prodRecords` 在写入后是异步 invalidate 的，
   * 两次批量入库间隔很短时会拿到同一个号 → 两张单的明细被串到同一个 docNo 下、待入库列表也不会消失。
   * 现在不再前端自算：批量提交记录里**不带** docNo，由后端 `POST /production/records/batch` 统一分配。
   */

  /** 待入库清单弹窗 & 选择入库表单 */
  const [stockInOrder, setStockInOrder] = useState<PendingStockItem | null>(null);
  const stockInScannedItemRef = useRef<Set<string>>(new Set());
  const stockInScannedBatchRef = useRef<Set<string>>(new Set());
  const [stockInForm, setStockInForm] = useState<{
    warehouseId: string;
    variantQuantities: Record<string, number>;
    singleQuantity: number;
    customData: Record<string, unknown>;
  }>({ warehouseId: '', variantQuantities: {}, singleQuantity: 0, customData: {} });

  const [selectedPendingRowKeys, setSelectedPendingRowKeys] = useState<Set<string>>(new Set());
  const togglePendingRowKey = useCallback((rowKey: string) => {
    setSelectedPendingRowKeys(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }, []);
  const [batchStockInItems, setBatchStockInItems] = useState<PendingStockItem[] | null>(null);
  const [batchStockForm, setBatchStockForm] = useState<{
    warehouseId: string;
    customData: Record<string, unknown>;
    lines: Record<string, { variantQuantities: Record<string, number>; singleQuantity: number }>;
  }>({ warehouseId: '', customData: {}, lines: {} });

  const [showStockInFlowModal, setShowStockInFlowModal] = useState(false);
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);
  // 「生产入库流水」弹窗的 filter / detail / editing 状态 + 自身 query 全部下沉到
  // ./StockInFlowModal，主面板只保留一个 open 开关，减少 PendingStockPanel 的状态面积。

  useEffect(() => {
    if (!open) {
      setSelectedPendingRowKeys(new Set());
      setBatchStockInItems(null);
      setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
    }
  }, [open]);

  useEffect(() => {
    const valid = new Set(pendingStockOrders.map(i => i.rowKey));
    setSelectedPendingRowKeys(prev => {
      const next = new Set([...prev].filter(id => valid.has(id)));
      return next.size === prev.size && [...prev].every(id => next.has(id)) ? prev : next;
    });
  }, [pendingStockOrders]);

  useEffect(() => {
    if (!stockInOrder) {
      stockInScannedItemRef.current.clear();
      stockInScannedBatchRef.current.clear();
    }
  }, [stockInOrder]);

  if (!open) return null;

  return (
    <>
      {/* 待入库清单弹窗 */}
      {(() => {
        const product = stockInOrder ? productMap.get(stockInOrder.order.productId) : null;
        const category = product ? categoryMap.get(product.categoryId) : null;
        const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);
        const pendingCapsForSingle = stockInOrder
          ? expandPendingByVariantForMatrix(stockInOrder, product ?? undefined, category ?? undefined)
          : {};
        const totalStockInQty = hasColorSize
          ? (Object.values(stockInForm.variantQuantities) as number[]).reduce((s, q) => s + (q || 0), 0)
          : stockInForm.singleQuantity;
        const canSubmitStockIn =
          !!(onAddRecord || onAddRecordBatch) &&
          totalStockInQty > 0 &&
          totalStockInQty <= (stockInOrder?.pendingTotal ?? 0) &&
          !!stockInForm.warehouseId;

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
              const capByVid = expandPendingByVariantForMatrix(pit, p ?? undefined, cat ?? undefined);
              const t = Object.values(line.variantQuantities).reduce((s, q) => s + (Number(q) || 0), 0);
              batchTotalPieces += t;
              if (t > pit.pendingTotal) batchError = true;
              if (t > 0) batchHasValidQty = true;
              Object.entries(line.variantQuantities).forEach(([vid, q]) => {
                if ((Number(q) || 0) > (capByVid[vid] ?? 0)) batchError = true;
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
                    const pendingCaps = expandPendingByVariantForMatrix(stockItem, p ?? undefined, cat ?? undefined);
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
                          <VariantQtyMatrixInputs
                            product={p}
                            dictionaries={dictionaries}
                            quantities={line.variantQuantities}
                            onVariantQtyChange={(variantId, qty) => {
                              patchLine({ variantQuantities: { [variantId]: qty } });
                            }}
                            getCellExtras={v => {
                              const pending = pendingCaps[v.id] ?? 0;
                              return { max: pending, hint: `最多 ${pending}`, placeholder: `≤${pending}` };
                            }}
                          />
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
                      if (!(onAddRecord || onAddRecordBatch) || !canSubmitBatch) return;
                      const ts = new Date().toLocaleString();
                      const operator = docOperator;
                      // docNo 留空，由后端在批量端点里**共享分配**给整批，避免前端 stale 缓存导致两张单串号。
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
                                records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, variantId: vid || undefined, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                              }
                              if (remain > 0) {
                                seq += 1;
                                records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: sortedOrders[sortedOrders.length - 1].id, productId: pit.order.productId, variantId: vid || undefined, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                              }
                            }
                          } else {
                            variantEntries.forEach(([variantId, qty]) => {
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: pit.order.id, productId: pit.order.productId, variantId: variantId || undefined, quantity: qty, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
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
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                            }
                            if (remain > 0) {
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: sortedOrders[sortedOrders.length - 1].id, productId: pit.order.productId, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                            }
                          } else {
                            seq += 1;
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: pit.order.id, productId: pit.order.productId, quantity: totalQty, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                          }
                        }
                      }
                      if (records.length === 0) return;
                      if (onAddRecordBatch) await onAddRecordBatch(records);
                      else for (const rec of records) await onAddRecord!(rec);
                      if (batchStockForm.warehouseId) {
                        writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN_BATCH, {
                          warehouseId: batchStockForm.warehouseId,
                        });
                      }
                      const batchTotalQty = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                      toast.success('批量入库已保存', {
                        description: `${records.length} 条明细，合计 ${batchTotalQty} 件（入库单号由系统自动分配）`,
                      });
                      setBatchStockInItems(null);
                      setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
                      setSelectedPendingRowKeys(new Set());
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
        }

        if (stockInOrder) {
          const order = stockInOrder.order;
          const unitName = getUnitName(order.productId);

          const applyStockInScan = async (payload: ScanPayload): Promise<boolean> => {
            if (!payload.token) return false;
            try {
              if (payload.kind === 'ITEM') {
                if (stockInScannedItemRef.current.has(payload.token)) {
                  toast.warning('此单品码已扫描过');
                  return false;
                }
                const res = await itemCodesApi.scan(payload.token);
                if (res.status !== 'ACTIVE') {
                  toast.error(res.message || '单品码不可用');
                  return false;
                }
                if (res.productId !== order.productId) {
                  toast.error('此码产品与当前入库工单不一致');
                  return false;
                }
                const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
                if (order.planOrderId && callerPlanId !== order.planOrderId) {
                  toast.error('此码不属于当前工单所在计划');
                  return false;
                }
                stockInScannedItemRef.current.add(payload.token);
                const vid = res.variantId || '';
                if (hasColorSize) {
                  if (!vid) {
                    stockInScannedItemRef.current.delete(payload.token);
                    toast.error('产品按规格管理，码未带规格');
                    return false;
                  }
                  setStockInForm((f) => ({
                    ...f,
                    variantQuantities: { ...f.variantQuantities, [vid]: (f.variantQuantities[vid] ?? 0) + 1 },
                  }));
                } else {
                  setStockInForm((f) => ({
                    ...f,
                    singleQuantity: Math.min(stockInOrder.pendingTotal, (f.singleQuantity || 0) + 1),
                  }));
                }
                toast.success(
                  `扫码入库 +1${res.variantLabel ? `（${res.variantLabel}）` : ''}${
                    res.ownerTenantName && res.callerContext?.relation !== 'OWNER' ? ` · 来自 ${res.ownerTenantName}` : ''
                  }`,
                );
                return true;
              }
              if (payload.kind === 'BATCH') {
                if (stockInScannedBatchRef.current.has(payload.token)) {
                  toast.warning('此批次码已扫描过');
                  return false;
                }
                const res = await planVirtualBatchesApi.scan(payload.token);
                if (res.status !== 'ACTIVE') {
                  toast.error(res.message || '批次码不可用');
                  return false;
                }
                if (res.productId !== order.productId) {
                  toast.error('此批次码产品与当前入库工单不一致');
                  return false;
                }
                const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
                if (order.planOrderId && callerPlanId !== order.planOrderId) {
                  toast.error('此批次码不属于当前工单所在计划');
                  return false;
                }
                stockInScannedBatchRef.current.add(payload.token);
                const qty = res.quantity ?? 0;
                const vid = res.variantId || '';
                if (hasColorSize) {
                  if (!vid) {
                    stockInScannedBatchRef.current.delete(payload.token);
                    toast.error('产品按规格管理，码未带规格');
                    return false;
                  }
                  setStockInForm((f) => ({
                    ...f,
                    variantQuantities: { ...f.variantQuantities, [vid]: (f.variantQuantities[vid] ?? 0) + qty },
                  }));
                } else {
                  setStockInForm((f) => ({
                    ...f,
                    singleQuantity: Math.min(stockInOrder.pendingTotal, (f.singleQuantity || 0) + qty),
                  }));
                }
                toast.success(
                  `批次码入库 +${qty}${res.variantLabel ? `（${res.variantLabel}）` : ''}${
                    res.ownerTenantName && res.callerContext?.relation !== 'OWNER' ? ` · 来自 ${res.ownerTenantName}` : ''
                  }`,
                );
                return true;
              }
            } catch (e) {
              toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
              return false;
            }
            return false;
          };

          const resolveStockInScanRowPreview = async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
            if (!payload.token) return null;
            try {
              if (payload.kind === 'ITEM') {
                if (stockInScannedItemRef.current.has(payload.token)) {
                  toast.warning('此单品码已扫描过');
                  return null;
                }
                const res = await itemCodesApi.scan(payload.token);
                if (res.status !== 'ACTIVE') {
                  toast.error(res.message || '单品码不可用');
                  return null;
                }
                if (res.productId !== order.productId) {
                  toast.error('此码产品与当前入库工单不一致');
                  return null;
                }
                const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
                if (order.planOrderId && callerPlanId !== order.planOrderId) {
                  toast.error('此码不属于当前工单所在计划');
                  return null;
                }
                const vid = res.variantId || '';
                if (hasColorSize && !vid) {
                  toast.error('产品按规格管理，码未带规格');
                  return null;
                }
                return scanItemResultToRowDetail(res);
              }
              if (payload.kind === 'BATCH') {
                if (stockInScannedBatchRef.current.has(payload.token)) {
                  toast.warning('此批次码已扫描过');
                  return null;
                }
                const res = await planVirtualBatchesApi.scan(payload.token);
                if (res.status !== 'ACTIVE') {
                  toast.error(res.message || '批次码不可用');
                  return null;
                }
                if (res.productId !== order.productId) {
                  toast.error('此批次码产品与当前入库工单不一致');
                  return null;
                }
                const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
                if (order.planOrderId && callerPlanId !== order.planOrderId) {
                  toast.error('此批次码不属于当前工单所在计划');
                  return null;
                }
                const vid = res.variantId || '';
                if (hasColorSize && !vid) {
                  toast.error('产品按规格管理，码未带规格');
                  return null;
                }
                return scanVirtualBatchResultToRowDetail(res);
              }
            } catch (e) {
              toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
              return null;
            }
            return null;
          };

          const handleStockInBatchConfirm = async (payloads: ScanPayload[]) => {
            for (const p of payloads) {
              if (!(await applyStockInScan(p))) return false;
            }
            return true;
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
              newTitle={`选择入库 — ${productionLinkMode === 'product' ? (order.productName || product?.name || '关联产品') : order.orderNumber}`}
              hasPerm={() => false}
              viewPerm=""
              editPerm=""
              onClose={() => { setStockInOrder(null); setStockInForm({ warehouseId: singlePendingStockInDefaultWh(), variantQuantities: {}, singleQuantity: 0, customData: {} }); }}
              onEnterEdit={() => {}}
              onCancelEdit={() => {}}
              renderContent={() => (
                <>
                <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <p className="text-sm font-bold text-slate-700">{order.productName || product?.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {productionLinkMode === 'product'
                      ? <>产品工单总数 {stockInOrder.productBlockOrderTotal} {unitName}，产品总入库 {stockInOrder.productTotalStockIn ?? stockInOrder.alreadyIn} {unitName}，待入库 {stockInOrder.pendingTotal} {unitName}</>
                      : <>工单总量 {stockInOrder.orderTotal} {unitName}，已入库 {stockInOrder.alreadyIn} {unitName}，待入库 {stockInOrder.pendingTotal} {unitName}</>}
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
                  <StockInCustomCreateFields
                    fields={stockInCustomFieldDefs}
                    values={stockInForm.customData}
                    onChange={(id, v) => setStockInForm(f => ({ ...f, customData: { ...f.customData, [id]: v } }))}
                    onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
                  />
                  {hasColorSize && product?.variants?.length ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">入库数量明细（颜色尺码）</h4>
                        <ScanBatchTrigger
                          onApply={handleStockInBatchConfirm}
                          resolveRowPreview={resolveStockInScanRowPreview}
                          hint="扫码入库"
                          modalTitle="入库 · 批量扫码"
                          modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加入库数量。"
                          showScanIntentToggle
                        />
                      </div>
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
                          <span className="text-lg font-black">{totalStockInQty} {unitName}</span>
                        </div>
                        {totalStockInQty > stockInOrder.pendingTotal && (
                          <span className="text-xs font-bold text-amber-200">不得超过可入库数量 {stockInOrder.pendingTotal} {unitName}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">入库数量 ({unitName})</label>
                        <ScanBatchTrigger
                          onApply={handleStockInBatchConfirm}
                          resolveRowPreview={resolveStockInScanRowPreview}
                          hint="扫码入库"
                          modalTitle="入库 · 批量扫码"
                          modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加入库数量。"
                          showScanIntentToggle
                        />
                      </div>
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
                <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-4 px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setStockInOrder(null); setStockInForm({ warehouseId: singlePendingStockInDefaultWh(), variantQuantities: {}, singleQuantity: 0, customData: {} }); }}
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
                      // docNo 留空，由后端在批量端点统一分配；单条入库也由 createRecord 自动生成。
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
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, variantId: vid || undefined, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
                            }
                            if (remain > 0) {
                              const fallback = sortedOrders[sortedOrders.length - 1];
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: fallback.id, productId: fallback.productId, variantId: vid || undefined, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
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
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
                          }
                          if (remain > 0) {
                            const fallback = sortedOrders[sortedOrders.length - 1];
                            seq += 1;
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: fallback.id, productId: fallback.productId, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
                          }
                        }
                        if (records.length > 0) {
                          if (onAddRecordBatch) await onAddRecordBatch(records);
                          else for (const rec of records) await onAddRecord!(rec);
                          const t = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                          toast.success('入库已保存', {
                            description: `${records.length} 条明细，合计 ${t} ${unitName}（入库单号由系统自动分配）`,
                          });
                          if (stockInForm.warehouseId) {
                            writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN, {
                              warehouseId: stockInForm.warehouseId,
                            });
                          }
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
                            ...stockInCollabFromCustomData(stockInForm.customData),
                          }));
                        if (records.length > 0) {
                          if (onAddRecordBatch) {
                            await onAddRecordBatch(records as ProductionOpRecord[]);
                          } else {
                            for (const rec of records) await onAddRecord!(rec as ProductionOpRecord);
                          }
                          const t = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                          toast.success('入库已保存', {
                            description: `${records.length} 条明细，合计 ${t} ${unitName}（入库单号由系统自动分配）`,
                          });
                          if (stockInForm.warehouseId) {
                            writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN, {
                              warehouseId: stockInForm.warehouseId,
                            });
                          }
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
                          ...stockInCollabFromCustomData(stockInForm.customData),
                        } as ProductionOpRecord);
                        toast.success('入库已保存', {
                          description: `1 条明细，合计 ${qty} ${unitName}（入库单号由系统自动分配）`,
                        });
                        if (stockInForm.warehouseId) {
                          writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN, {
                            warehouseId: stockInForm.warehouseId,
                          });
                        }
                      }
                      setStockInOrder(null);
                      setStockInForm({ warehouseId: singlePendingStockInDefaultWh(), variantQuantities: {}, singleQuantity: 0, customData: {} });
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
        }

        // 待入库列表
        return (
          <DocPhaseModal
            open
            phase="detail"
            editingDocNumber={null}
            maxWidthClass="max-w-4xl"
            zIndexClass="z-[85]"
            detailTitle=""
            editTitle=""
            newTitle={pendingStockOrders.length > 0 ? `待入库清单（${pendingStockOrders.length}）` : '待入库清单'}
            hasPerm={() => false}
            viewPerm=""
            editPerm=""
            onClose={onClose}
            onEnterEdit={() => {}}
            onCancelEdit={() => {}}
            renderContent={() => (
              <>
                <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap justify-between">
                  <p className="text-xs font-bold text-slate-500 tabular-nums">
                    {pendingStockOrders.length > 0 ? `共 ${pendingStockOrders.length} 笔待入库` : ''}
                  </p>
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
                          const pitProduct = productMap.get(it.order.productId);
                        lines[it.rowKey] = buildStockInFormDefaultsForPending(
                          it,
                          pitProduct,
                          pitProduct ? categoryMap.get(pitProduct.categoryId) : undefined,
                        );
                        });
                        setStockInOrder(null);
                        setBatchStockForm({ warehouseId: batchPendingStockInDefaultWh(), customData: {}, lines });
                        setBatchStockInItems(rows);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      批量入库（{selectedPendingRowKeys.size}/{pendingStockOrders.length}）
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
                  </div>
                </div>
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
                            <tr
                              key={item.rowKey}
                              className={`border-b border-slate-100 hover:bg-slate-50/50${hasPerm('production:orders_pending_stock_in:create') ? ' cursor-pointer' : ''}`}
                              onClick={
                                hasPerm('production:orders_pending_stock_in:create')
                                  ? () => togglePendingRowKey(item.rowKey)
                                  : undefined
                              }
                            >
                              {hasPerm('production:orders_pending_stock_in:create') && (
                                <td className="px-2 py-3 text-center align-middle" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedPendingRowKeys.has(item.rowKey)}
                                    onChange={() => togglePendingRowKey(item.rowKey)}
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
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                {hasPerm('production:orders_pending_stock_in:create') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchStockInItems(null);
                                    setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
                                    setStockInOrder(item);
                                    const pRow = productMap.get(item.order.productId);
                                    const d = buildStockInFormDefaultsForPending(
                                      item,
                                      pRow,
                                      pRow ? categoryMap.get(pRow.categoryId) : undefined,
                                    );
                                    setStockInForm({
                                      warehouseId: singlePendingStockInDefaultWh(),
                                      variantQuantities: d.variantQuantities,
                                      singleQuantity: d.singleQuantity,
                                      customData: {},
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
              </>
            )}
          />
        );
      })()}

      {/* 生产入库流水弹窗（详情/编辑子弹窗也包含在内）已抽到 StockInFlowModal。 */}
      <StockInFlowModal
        open={showStockInFlowModal}
        onClose={() => setShowStockInFlowModal(false)}
        todayDate={todayDate}
        orders={orders}
        products={products}
        productMap={productMap}
        categoryMap={categoryMap}
        warehouses={warehouses}
        dictionaries={dictionaries}
        productionLinkMode={productionLinkMode}
        orderFormSettings={orderFormSettings}
        printTemplates={printTemplates}
        onOpenOrderFormPrintTab={onOpenOrderFormPrintTab}
        onAddRecord={onAddRecord}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
        hasPerm={hasPerm}
        onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
      />

      {stockInFilePreview && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm"
          onClick={() => setStockInFilePreview(null)}
        >
          <button
            type="button"
            onClick={() => setStockInFilePreview(null)}
            className="absolute right-6 top-6 z-10 rounded-full bg-white/20 p-2 text-white transition-all hover:bg-white/40"
            aria-label="关闭预览"
          >
            <X className="h-8 w-8" />
          </button>
          <div
            className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {stockInFilePreview.type === 'image' ? (
              <img src={stockInFilePreview.url} alt="预览" className="max-h-[85vh] w-full object-contain" />
            ) : (
              <iframe src={stockInFilePreview.url} title="PDF 预览" className="h-[85vh] w-full border-0" sandbox="allow-same-origin" />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(PendingStockPanel);
