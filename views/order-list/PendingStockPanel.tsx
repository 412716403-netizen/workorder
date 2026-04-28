
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Check, Filter, FileText, Clock, User, Package } from 'lucide-react';
import { toast } from 'sonner';
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

import { toLocalCompactYmd, toLocalDateYmd } from '../../utils/localDateTime';
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
import { ScanInputButton } from '../../components/scan/ScanInputButton';
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import { DocSummaryCard, DocInlineMetaRow } from '../../components/doc-modal';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import type { ScanPayload } from '../../utils/scanPayload';
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
  defaultQuantitiesForPendingItem,
  type PendingStockItem,
} from './pendingStockStockInHelpers';

function StockInFlowEditSavePortal({ active, onSave }: { active: boolean; onSave: () => void }) {
  const host = React.useContext(DocPhaseEditToolbarPortalContext);
  if (!active || !host) return null;
  return createPortal(
    <button
      type="button"
      onClick={onSave}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
    >
      <Check className="w-4 h-4" /> 保存
    </button>,
    host,
  );
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
  const [stockInFlowFilter, setStockInFlowFilter] = useState<{
    dateFrom: string; dateTo: string; docNo: string; orderNumber: string; productName: string; warehouseId: string;
  }>({ dateFrom: '', dateTo: '', docNo: '', orderNumber: '', productName: '', warehouseId: '' });
  const [stockInFlowDetailDocNo, setStockInFlowDetailDocNo] = useState<string | null>(null);
  const [stockInFlowEditing, setStockInFlowEditing] = useState<{
    warehouseId: string;
    customData: Record<string, unknown>;
    /** id 为空表示该规格尚未有入库明细行，保存时走新增 */
    rows: { id: string; variantId?: string; quantity: number }[];
  } | null>(null);

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
                              const pending = stockItem.pendingByVariant[v.id] ?? 0;
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
                                records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, variantId: vid || undefined, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                              }
                              if (remain > 0) {
                                seq += 1;
                                records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: sortedOrders[sortedOrders.length - 1].id, productId: pit.order.productId, variantId: vid || undefined, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                              }
                            }
                          } else {
                            variantEntries.forEach(([variantId, qty]) => {
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: pit.order.id, productId: pit.order.productId, variantId: variantId || undefined, quantity: qty, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
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
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                            }
                            if (remain > 0) {
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: sortedOrders[sortedOrders.length - 1].id, productId: pit.order.productId, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
                            }
                          } else {
                            seq += 1;
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: pit.order.id, productId: pit.order.productId, quantity: totalQty, operator, timestamp: ts, status: '已完成', warehouseId: batchStockForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(batchStockForm.customData) } as ProductionOpRecord);
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
                        description: `入库单号 ${docNo}，${records.length} 条明细，合计 ${batchTotalQty} 件`,
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

          const handleStockInScan = async (payload: ScanPayload) => {
            if (!payload.token) return;
            try {
              if (payload.kind === 'ITEM') {
                if (stockInScannedItemRef.current.has(payload.token)) {
                  toast.warning('此单品码已扫描过');
                  return;
                }
                const res = await itemCodesApi.scan(payload.token);
                if (res.kind !== 'ITEM_CODE' || res.status !== 'ACTIVE') {
                  toast.error(res.message || '单品码不可用');
                  return;
                }
                if (res.productId !== order.productId) {
                  toast.error('此码产品与当前入库工单不一致');
                  return;
                }
                const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
                if (order.planOrderId && callerPlanId !== order.planOrderId) {
                  toast.error('此码不属于当前工单所在计划');
                  return;
                }
                stockInScannedItemRef.current.add(payload.token);
                const vid = res.variantId || '';
                if (hasColorSize) {
                  if (!vid) {
                    stockInScannedItemRef.current.delete(payload.token);
                    toast.error('产品按规格管理，码未带规格');
                    return;
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
              } else if (payload.kind === 'BATCH') {
                if (stockInScannedBatchRef.current.has(payload.token)) {
                  toast.warning('此批次码已扫描过');
                  return;
                }
                const res = await planVirtualBatchesApi.scan(payload.token);
                if (res.kind !== 'VIRTUAL_BATCH' || res.status !== 'ACTIVE') {
                  toast.error(res.message || '批次码不可用');
                  return;
                }
                if (res.productId !== order.productId) {
                  toast.error('此批次码产品与当前入库工单不一致');
                  return;
                }
                const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
                if (order.planOrderId && callerPlanId !== order.planOrderId) {
                  toast.error('此批次码不属于当前工单所在计划');
                  return;
                }
                stockInScannedBatchRef.current.add(payload.token);
                const qty = res.quantity ?? 0;
                const vid = res.variantId || '';
                if (hasColorSize) {
                  if (!vid) {
                    stockInScannedBatchRef.current.delete(payload.token);
                    toast.error('产品按规格管理，码未带规格');
                    return;
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
              }
            } catch (e) {
              toast.error((e as Error)?.message || '扫码查询失败');
            }
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
                        <ScanInputButton onScan={handleStockInScan} hint="扫码入库" />
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
                          const pending = stockInOrder.pendingByVariant[v.id] ?? 0;
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
                        <ScanInputButton onScan={handleStockInScan} hint="扫码入库" />
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
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, variantId: vid || undefined, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
                            }
                            if (remain > 0) {
                              const fallback = sortedOrders[sortedOrders.length - 1];
                              seq += 1;
                              records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: fallback.id, productId: fallback.productId, variantId: vid || undefined, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
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
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: o.id, productId: o.productId, quantity: alloc, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
                          }
                          if (remain > 0) {
                            const fallback = sortedOrders[sortedOrders.length - 1];
                            seq += 1;
                            records.push({ id: `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`, type: 'STOCK_IN', orderId: fallback.id, productId: fallback.productId, quantity: remain, operator, timestamp: ts, status: '已完成', warehouseId: stockInForm.warehouseId || undefined, docNo, ...stockInCollabFromCustomData(stockInForm.customData) } as ProductionOpRecord);
                          }
                        }
                        if (records.length > 0) {
                          if (onAddRecordBatch) await onAddRecordBatch(records);
                          else for (const rec of records) await onAddRecord!(rec);
                          const t = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                          toast.success('入库已保存', {
                            description: `入库单号 ${docNo}，${records.length} 条明细，合计 ${t} ${unitName}`,
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
                            docNo,
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
                            description: `入库单号 ${docNo}，${records.length} 条明细，合计 ${t} ${unitName}`,
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
                          docNo,
                          ...stockInCollabFromCustomData(stockInForm.customData),
                        } as ProductionOpRecord);
                        toast.success('入库已保存', {
                          description: `入库单号 ${docNo}，1 条明细，合计 ${qty} ${unitName}`,
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
            newTitle="待入库清单"
            hasPerm={() => false}
            viewPerm=""
            editPerm=""
            onClose={onClose}
            onEnterEdit={() => {}}
            onCancelEdit={() => {}}
            renderContent={() => (
              <>
                <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap justify-end">
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
                        setBatchStockForm({ warehouseId: batchPendingStockInDefaultWh(), customData: {}, lines });
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
                                    const d = defaultQuantitiesForPendingItem(item);
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
          collabData?: Record<string, unknown> | null;
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
              collabData: (r as ProductionOpRecord & { collabData?: Record<string, unknown> | null }).collabData ?? null,
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
          /** 同单首条记录上的 collabData.stockInCustomData */
          stockInCustomSnapshot?: Record<string, unknown>;
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
            const snap = rows[0].collabData?.stockInCustomData;
            return {
              docNo,
              rows,
              first: rows[0],
              totalQty: rows.reduce((s, r) => s + r.quantity, 0),
              orderNumber: rows[0].orderNumber,
              productName: prod?.name || rows[0].productName,
              warehouseName: rows[0].warehouseName,
              stockInCustomSnapshot:
                snap && typeof snap === 'object' && !Array.isArray(snap) ? (snap as Record<string, unknown>) : undefined,
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
            <DocPhaseModal
              open
              phase="detail"
              editingDocNumber={null}
              maxWidthClass="max-w-6xl"
              zIndexClass="z-[86]"
              detailTitle=""
              editTitle=""
              newTitle="生产入库流水"
              hasPerm={() => false}
              viewPerm=""
              editPerm=""
              onClose={() => { setShowStockInFlowModal(false); setStockInFlowDetailDocNo(null); }}
              onEnterEdit={() => {}}
              onCancelEdit={() => {}}
              renderContent={() => (
                <>
                <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
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
                </>
              )}
            />

            {/* 入库流水详情弹窗 */}
            {detailBatch && (() => {
              const product = productMap.get(detailBatch.first.productId);
              const category = product ? categoryMap.get(product.categoryId) : null;
              const hasColorSize = productHasColorSizeMatrix(product, category ?? undefined);
              const stockInDetailMatrixLayout =
                product && dictionaries ? buildVariantQtyMatrixLayout(product, dictionaries) : null;
              const stockInDetailMatrixProduct =
                product && product.variants?.length
                  ? ({ ...product, colorIds: undefined, sizeIds: undefined } as Product)
                  : null;
              const useStockInDetailMatrix = Boolean(
                hasColorSize && stockInDetailMatrixLayout && stockInDetailMatrixProduct && dictionaries,
              );
              const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
              const wh = warehouses.find(w => w.id === detailBatch.first.warehouseId);
              const isEditing = stockInFlowEditing !== null;
              const matrixSummaryCustomTags = product
                ? getProductCategoryCustomFieldEntries(
                    product,
                    product.categoryId ? categoryMap.get(product.categoryId) ?? null : null,
                    { includeFile: false, includeEmpty: false },
                  )
                : [];
              const stockInSnap = detailBatch.stockInCustomSnapshot ?? {};
              const stockInFieldsForDetailInline = stockInCustomFieldDefs.filter(f =>
                f.showInDetail && psiCustomFieldHasFilledDisplayValue(f, stockInSnap[f.id]),
              );
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
              const startEdit = () => {
                const baseEdit = {
                  warehouseId: detailBatch.first.warehouseId ?? '',
                  customData: { ...(detailBatch.stockInCustomSnapshot ?? {}) },
                };
                if (useStockInDetailMatrix && stockInDetailMatrixLayout && product) {
                  const layout = stockInDetailMatrixLayout;
                  const byVid = new Map<string, (typeof detailBatch.rows)[number]>();
                  for (const r of detailBatch.rows) {
                    if (r.variantId) byVid.set(r.variantId, r);
                  }
                  const rows: { id: string; variantId?: string; quantity: number }[] = [];
                  for (const cr of layout.colorRows) {
                    for (const v of cr.variantAtSize) {
                      if (!v) continue;
                      const hit = byVid.get(v.id);
                      if (hit) {
                        rows.push({ id: hit.id, variantId: v.id, quantity: hit.quantity });
                      } else {
                        rows.push({ id: '', variantId: v.id, quantity: 0 });
                      }
                    }
                  }
                  setStockInFlowEditing({ ...baseEdit, rows });
                  return;
                }
                setStockInFlowEditing({
                  ...baseEdit,
                  rows: detailBatch.rows.map(r => ({ id: r.id, variantId: r.variantId, quantity: r.quantity })),
                });
              };
              const cancelEdit = () => setStockInFlowEditing(null);
              const saveEdit = () => {
                if (!stockInFlowEditing || !onUpdateRecord) return;
                const docRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo);
                const cleanCustom = Object.fromEntries(
                  Object.entries(stockInFlowEditing.customData ?? {}).filter(
                    ([, v]) => v !== '' && v != null && v !== undefined,
                  ),
                );
                const firstCollab =
                  (docRecords[0] as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
                if (onAddRecord) {
                  let seq = 0;
                  for (const row of stockInFlowEditing.rows) {
                    if (row.id) continue;
                    if (!row.variantId || row.quantity <= 0) continue;
                    void onAddRecord({
                      id: `rec-stkin-edit-${Date.now()}-${seq++}-${row.variantId.slice(-6)}`,
                      type: 'STOCK_IN',
                      orderId: detailBatch.first.orderId,
                      productId: detailBatch.first.productId,
                      variantId: row.variantId,
                      quantity: row.quantity,
                      operator: detailBatch.first.operator,
                      timestamp: new Date().toLocaleString(),
                      status: '已完成',
                      warehouseId: stockInFlowEditing.warehouseId || undefined,
                      docNo: detailBatch.docNo,
                      collabData: {
                        ...firstCollab,
                        stockInCustomData: cleanCustom,
                      },
                    } as ProductionOpRecord);
                  }
                }
                docRecords.forEach(rec => {
                  const editRow = stockInFlowEditing.rows.find(r => r.id === rec.id);
                  if (editRow) {
                    const prevCd = (rec as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
                    onUpdateRecord({
                      ...rec,
                      quantity: Math.max(0, editRow.quantity),
                      warehouseId: stockInFlowEditing.warehouseId || undefined,
                      operator: detailBatch.first.operator,
                      collabData: {
                        ...prevCd,
                        stockInCustomData: cleanCustom,
                      },
                    });
                  }
                });
                setStockInFlowEditing(null);
              };
              const handleDelete = () => {
                if (!onDeleteRecord) return;
                const docRecords = prodRecords.filter(r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo);
                docRecords.forEach(rec => onDeleteRecord(rec.id));
                setStockInFlowDetailDocNo(null);
                setStockInFlowEditing(null);
              };
              const ef = stockInFlowEditing;
              const editTotalQty = ef ? ef.rows.reduce((s, r) => s + r.quantity, 0) : 0;
              return (
                <DocPhaseModal
                  open
                  phase={isEditing ? 'edit' : 'detail'}
                  editingDocNumber={detailBatch.docNo || '—'}
                  maxWidthClass={useStockInDetailMatrix ? 'max-w-3xl' : 'max-w-2xl'}
                  zIndexClass="z-[90]"
                  detailTitle="生产入库详情"
                  editTitle="生产入库 · 编辑"
                  newTitle=""
                  showPrint={false}
                  leadingDetailActions={
                    <OrderCenterDetailPrintBlock
                      printSlot={orderFormSettings.orderCenterPrint?.stockInFlowDetail}
                      printTemplates={printTemplates}
                      onAddPrintTemplate={onOpenOrderFormPrintTab}
                      buildContext={(_template: PrintTemplate): PrintRenderContext => {
                        const od =
                          productionLinkMode !== 'product' && detailBatch.orderNumber
                            ? orders.find(o => o.orderNumber === detailBatch.orderNumber)
                            : undefined;
                        return {
                          order: od,
                          product: product ?? undefined,
                          stockInPrint: {
                            docNo: detailBatch.docNo,
                            warehouseName: detailBatch.warehouseName || wh?.name || '',
                            operator: detailBatch.first.operator,
                            timestamp: fmtDT(detailBatch.first.timestamp),
                            productName: detailBatch.productName,
                            orderNumber: detailBatch.orderNumber || '—',
                            totalQty: detailBatch.totalQty,
                            custom: detailBatch.stockInCustomSnapshot ?? {},
                          },
                          printListRows: buildOneBlockMatrixPrintRows({
                            productId: detailBatch.first.productId,
                            product: product ?? undefined,
                            products,
                            dictionaries,
                            rows: detailBatch.rows.map(r => ({ variantId: r.variantId, quantity: r.quantity })),
                          }),
                        };
                      }}
                      pickerSubtitle={`入库单 ${detailBatch.docNo}`}
                    />
                  }
                  hasPerm={hasPerm}
                  viewPerm="production:orders_pending_stock_in:view"
                  editPerm="production:orders_pending_stock_in:edit"
                  deletePerm={onDeleteRecord ? 'production:orders_pending_stock_in:delete' : undefined}
                  deleteConfirmMessage="确定要删除该入库单的所有记录吗？此操作不可恢复。"
                  onDelete={onDeleteRecord ? handleDelete : undefined}
                  renderDocBadge={() => (
                    productionLinkMode === 'product' ? (
                      <span
                        className="max-w-[14rem] shrink-0 truncate rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600"
                        title={detailBatch.productName}
                      >
                        {detailBatch.productName || '—'}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 tabular-nums">
                        {detailBatch.orderNumber || '—'}
                      </span>
                    )
                  )}
                  onClose={() => { setStockInFlowDetailDocNo(null); setStockInFlowEditing(null); }}
                  onEnterEdit={() => { if (onUpdateRecord) startEdit(); }}
                  onCancelEdit={cancelEdit}
                  renderContent={() => (
                    <>
                      <StockInFlowEditSavePortal active={isEditing} onSave={saveEdit} />
                      <div className="space-y-4 min-h-0">
                      {isEditing && ef ? (
                        <div className={psiOrderBillFormSectionStackClass}>
                          <DocSummaryCard
                            className="mb-5"
                            main={
                              <>
                                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                                  {detailBatch.docNo?.trim() ? (
                                    <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                                      {detailBatch.docNo.trim()}
                                    </span>
                                  ) : null}
                                  <span
                                    className="inline-flex min-w-0 max-w-full shrink-0 items-center gap-x-1.5 text-xs font-bold normal-case text-slate-600 sm:text-sm"
                                    title="入库仓库"
                                  >
                                    <span className="shrink-0 whitespace-nowrap">入库仓库：</span>
                                    <select
                                      value={ef.warehouseId}
                                      onChange={e =>
                                        setStockInFlowEditing(prev => (prev ? { ...prev, warehouseId: e.target.value } : prev))
                                      }
                                      className={`${psiOrderBillCompactWarehouseSelectClass} min-w-[9rem] max-w-[min(100%,20rem)]`}
                                      aria-label="入库仓库"
                                    >
                                      <option value="">请选择</option>
                                      {warehouses.map(w => (
                                        <option key={w.id} value={w.id}>
                                          {w.name}
                                          {w.code ? ` (${w.code})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </span>
                                  {productionLinkMode !== 'product' && detailBatch.orderNumber ? (
                                    <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 tabular-nums">
                                      {detailBatch.orderNumber}
                                    </span>
                                  ) : null}
                                </div>
                                <DocInlineMetaRow className="mt-1.5">
                                  {detailBatch.first.timestamp ? (
                                    <span className="inline-flex min-h-4 items-center gap-1.5 normal-case">
                                      <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                      <span className="leading-none">时间 {fmtDT(detailBatch.first.timestamp)}</span>
                                    </span>
                                  ) : null}
                                  <span className="inline-flex min-h-4 items-center gap-1.5 normal-case">
                                    <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                    <span className="leading-none">
                                      经办: {detailBatch.first.operator?.trim() || '—'}
                                    </span>
                                  </span>
                                </DocInlineMetaRow>
                                <StockInCustomEditFields
                                  fields={stockInCustomFieldDefs}
                                  values={ef.customData}
                                  onChange={(id, v) =>
                                    setStockInFlowEditing(prev =>
                                      prev ? { ...prev, customData: { ...prev.customData, [id]: v } } : prev,
                                    )
                                  }
                                  onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
                                />
                              </>
                            }
                            side={
                              <div className="min-w-[6.5rem] md:text-right">
                                <p className="mb-0.5 text-[10px] font-black uppercase text-slate-400">合计数量</p>
                                <p className="font-black tabular-nums text-slate-800">
                                  {editTotalQty.toLocaleString()} {unitName}
                                </p>
                              </div>
                            }
                          />
                          <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              {useStockInDetailMatrix ? '产品明细（按规格）' : '产品明细'}
                            </p>
                            {useStockInDetailMatrix && stockInDetailMatrixProduct && dictionaries ? (
                              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      <th className="px-3 py-2.5 text-left">产品 / SKU</th>
                                      <th className="px-3 py-2.5 text-right">数量</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    <tr>
                                      <td className="px-3 py-2.5 align-top">
                                        <div className="flex min-w-0 items-start gap-2">
                                          {product?.imageUrl ? (
                                            <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                              <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                                decoding="async"
                                              />
                                            </div>
                                          ) : (
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                              <Package className="h-4 w-4" />
                                            </div>
                                          )}
                                          <div className="min-w-0">
                                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                              <span className="font-bold text-slate-700">
                                                {product?.name ?? detailBatch.first.productId ?? '—'}
                                              </span>
                                              {product?.sku?.trim() ? (
                                                <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                                  {product.sku.trim()}
                                                </span>
                                              ) : null}
                                            </div>
                                            {matrixSummaryCustomTags.length > 0 ? (
                                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                                {matrixSummaryCustomTags.map(({ field, display }) => (
                                                  <span
                                                    key={field.id}
                                                    className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                                  >
                                                    {field.label}: {display}
                                                  </span>
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-indigo-600">
                                        {editTotalQty.toLocaleString()} {unitName}
                                      </td>
                                    </tr>
                                    <tr className="bg-slate-50/70">
                                      <td colSpan={2} className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top">
                                        <VariantQtyMatrixInputs
                                          product={stockInDetailMatrixProduct}
                                          dictionaries={dictionaries}
                                          balancedNumericLayout
                                          quantities={Object.fromEntries(ef.rows.map(r => [r.variantId ?? '', r.quantity]))}
                                          onVariantQtyChange={(variantId, qty) => {
                                            setStockInFlowEditing(prev =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    rows: prev.rows.map(r =>
                                                      (r.variantId ?? '') === variantId ? { ...r, quantity: qty } : r,
                                                    ),
                                                  }
                                                : prev,
                                            );
                                          }}
                                        />
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      {hasColorSize ? (
                                        <>
                                          <th className="px-3 py-2.5 text-left">规格</th>
                                          <th className="px-3 py-2.5 text-right">数量</th>
                                        </>
                                      ) : (
                                        <>
                                          <th className="px-3 py-2.5 text-left">产品 / SKU</th>
                                          <th className="px-3 py-2.5 text-right">数量</th>
                                        </>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {!hasColorSize
                                      ? ef.rows.map(row => (
                                          <tr key={row.id}>
                                            <td className="px-3 py-2.5 align-top">
                                              <div className="flex min-w-0 items-start gap-2">
                                                {product?.imageUrl ? (
                                                  <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                                    <img
                                                      src={product.imageUrl}
                                                      alt={product.name}
                                                      className="h-full w-full object-cover"
                                                      loading="lazy"
                                                      decoding="async"
                                                    />
                                                  </div>
                                                ) : (
                                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                                    <Package className="h-4 w-4" />
                                                  </div>
                                                )}
                                                <div className="min-w-0">
                                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                                    <span className="font-bold text-slate-700">{detailBatch.productName}</span>
                                                    {product?.sku?.trim() ? (
                                                      <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                                        {product.sku.trim()}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                  {productionLinkMode !== 'product' && detailBatch.orderNumber ? (
                                                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                                                      工单{' '}
                                                      <span className="font-bold text-slate-600 tabular-nums">
                                                        {detailBatch.orderNumber}
                                                      </span>
                                                    </span>
                                                  ) : null}
                                                </div>
                                              </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right align-middle">
                                              <input
                                                type="number"
                                                min={0}
                                                value={row.quantity === 0 ? '' : row.quantity}
                                                onChange={e =>
                                                  setStockInFlowEditing(prev =>
                                                    prev
                                                      ? {
                                                          ...prev,
                                                          rows: prev.rows.map(r =>
                                                            r.id === row.id
                                                              ? { ...r, quantity: Math.max(0, parseInt(e.target.value, 10) || 0) }
                                                              : r,
                                                          ),
                                                        }
                                                      : prev,
                                                  )
                                                }
                                                className="inline-block h-8 w-[4.75rem] rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums placeholder:text-[9px] placeholder:text-slate-400"
                                                placeholder="0"
                                              />
                                            </td>
                                          </tr>
                                        ))
                                      : null}
                                    {hasColorSize
                                      ? ef.rows.map(row => (
                                          <tr key={row.id} className="border-b border-slate-100">
                                            <td className="px-3 py-2.5 text-slate-800">{getVariantLabel(row.variantId)}</td>
                                            <td className="px-3 py-2.5 text-right align-middle">
                                              <input
                                                type="number"
                                                min={0}
                                                value={row.quantity === 0 ? '' : row.quantity}
                                                onChange={e =>
                                                  setStockInFlowEditing(prev =>
                                                    prev
                                                      ? {
                                                          ...prev,
                                                          rows: prev.rows.map(r =>
                                                            r.id === row.id
                                                              ? { ...r, quantity: Math.max(0, parseInt(e.target.value, 10) || 0) }
                                                              : r,
                                                          ),
                                                        }
                                                      : prev,
                                                  )
                                                }
                                                className="inline-block h-8 w-[4.75rem] rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums placeholder:text-[9px] placeholder:text-slate-400"
                                                placeholder="0"
                                              />
                                            </td>
                                          </tr>
                                        ))
                                      : null}
                                  </tbody>
                                  {ef.rows.length > 1 ? (
                                    <tfoot>
                                      <tr className="border-t-2 border-indigo-200 bg-indigo-50/80 font-bold">
                                        <td className="px-3 py-2.5">合计</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-indigo-600">
                                          {editTotalQty} {unitName}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  ) : null}
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <DocSummaryCard
                            className="mb-5"
                            main={
                              <>
                                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
                                  {detailBatch.docNo?.trim() ? (
                                    <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                                      {detailBatch.docNo.trim()}
                                    </span>
                                  ) : null}
                                  {productionLinkMode !== 'product' && detailBatch.orderNumber ? (
                                    <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 tabular-nums">
                                      {detailBatch.orderNumber}
                                    </span>
                                  ) : null}
                                  <span className="text-xs font-bold normal-case text-slate-600 sm:text-sm" title="入库仓库">
                                    入库仓库：{wh?.name ?? '—'}
                                  </span>
                                </div>
                                <DocInlineMetaRow className="mt-1.5">
                                  {detailBatch.first.timestamp ? (
                                    <span className="inline-flex min-h-4 items-center gap-1.5 normal-case">
                                      <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                      <span className="leading-none">时间 {fmtDT(detailBatch.first.timestamp)}</span>
                                    </span>
                                  ) : null}
                                  <span className="inline-flex min-h-4 items-center gap-1.5 normal-case">
                                    <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                    <span className="leading-none">经办: {detailBatch.first.operator || '—'}</span>
                                  </span>
                                  {stockInFieldsForDetailInline.map(cf => (
                                    <span key={cf.id} className="inline-flex max-w-full min-w-0 items-center gap-1.5 normal-case">
                                      <span className="shrink-0 text-slate-400">{cf.label}:</span>
                                      <span className="min-w-0 break-all font-bold leading-none text-slate-700">
                                        <PlanFormCustomFieldReadonly
                                          variant="inlineMeta"
                                          cf={cf}
                                          value={stockInSnap[cf.id]}
                                          onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
                                        />
                                      </span>
                                    </span>
                                  ))}
                                </DocInlineMetaRow>
                              </>
                            }
                            side={
                              <div className="min-w-[6.5rem] md:text-right">
                                <p className="mb-0.5 text-[10px] font-black uppercase text-slate-400">合计数量</p>
                                <p className="font-black tabular-nums text-slate-800">
                                  {detailBatch.totalQty.toLocaleString()} {unitName}
                                </p>
                              </div>
                            }
                          />
                          <div className="flex-1 space-y-2 pb-4">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              {useStockInDetailMatrix ? '产品明细（按规格）' : '产品明细'}
                            </p>
                            {useStockInDetailMatrix && stockInDetailMatrixProduct && dictionaries ? (
                              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      <th className="px-3 py-2.5 text-left">产品 / SKU</th>
                                      <th className="px-3 py-2.5 text-right">数量</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    <tr>
                                      <td className="px-3 py-2.5 align-top">
                                        <div className="flex min-w-0 items-start gap-2">
                                          {product?.imageUrl ? (
                                            <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                              <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                                decoding="async"
                                              />
                                            </div>
                                          ) : (
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                              <Package className="h-4 w-4" />
                                            </div>
                                          )}
                                          <div className="min-w-0">
                                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                              <span className="font-bold text-slate-700">
                                                {product?.name ?? detailBatch.first.productId ?? '—'}
                                              </span>
                                              {product?.sku?.trim() ? (
                                                <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                                  {product.sku.trim()}
                                                </span>
                                              ) : null}
                                            </div>
                                            {matrixSummaryCustomTags.length > 0 ? (
                                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                                {matrixSummaryCustomTags.map(({ field, display }) => (
                                                  <span
                                                    key={field.id}
                                                    className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                                  >
                                                    {field.label}: {display}
                                                  </span>
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-indigo-600">
                                        {detailBatch.totalQty.toLocaleString()} {unitName}
                                      </td>
                                    </tr>
                                    <tr className="bg-slate-50/70">
                                      <td colSpan={2} className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top">
                                        <VariantQtyMatrixInputs
                                          product={stockInDetailMatrixProduct}
                                          dictionaries={dictionaries}
                                          balancedNumericLayout
                                          readOnly
                                          quantities={Object.fromEntries(
                                            detailBatch.rows.map(r => [r.variantId ?? '', r.quantity]),
                                          )}
                                        />
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : !hasColorSize ? (
                              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      <th className="px-3 py-2.5 text-left">产品 / SKU</th>
                                      <th className="px-3 py-2.5 text-right">数量</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    <tr>
                                      <td className="px-3 py-2.5 align-top">
                                        <div className="flex min-w-0 items-start gap-2">
                                          {product?.imageUrl ? (
                                            <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                              <img
                                                src={product.imageUrl}
                                                alt={product.name}
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                                decoding="async"
                                              />
                                            </div>
                                          ) : (
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                              <Package className="h-4 w-4" />
                                            </div>
                                          )}
                                          <div className="min-w-0">
                                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                              <span className="font-bold text-slate-700">{detailBatch.productName}</span>
                                              {product?.sku?.trim() ? (
                                                <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                                  {product.sku.trim()}
                                                </span>
                                              ) : null}
                                            </div>
                                            {productionLinkMode !== 'product' && detailBatch.orderNumber ? (
                                              <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                                                工单{' '}
                                                <span className="font-bold text-slate-600 tabular-nums">{detailBatch.orderNumber}</span>
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 text-right align-middle">
                                        <span className="font-black tabular-nums text-indigo-600">
                                          {detailBatch.totalQty.toLocaleString()} {unitName}
                                        </span>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      <th className="px-3 py-2.5 text-left">规格</th>
                                      <th className="px-3 py-2.5 text-right">数量</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {detailBatch.rows.map(row => (
                                      <tr key={row.id} className="border-b border-slate-100">
                                        <td className="px-3 py-2.5 text-slate-800">{getVariantLabel(row.variantId)}</td>
                                        <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-indigo-600">
                                          {row.quantity} {unitName}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  {detailBatch.rows.length > 1 ? (
                                    <tfoot>
                                      <tr className="border-t-2 border-indigo-200 bg-indigo-50/80 font-bold">
                                        <td className="px-3 py-2.5">合计</td>
                                        <td className="px-3 py-2.5 text-right tabular-nums text-indigo-600">
                                          {detailBatch.totalQty} {unitName}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  ) : null}
                                </table>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      </div>
                    </>
                  )}
                />
              );
            })()}
          </>
        );
      })()}

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
