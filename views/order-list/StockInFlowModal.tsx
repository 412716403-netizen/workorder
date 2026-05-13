/**
 * 生产入库流水弹窗 + 入库流水详情/编辑子弹窗。
 *
 * 从 PendingStockPanel 拆出（S11 工程性整理）：
 * - 自身查询：`useQuery(['flow.stockIn', dateFrom, dateTo])` 走 fetchProductionByFilter，
 *   仅在 open=true 时启用。
 * - 自身 state：filter（dateFrom/dateTo/docNo/orderNumber/productName/warehouseId）、
 *   detailDocNo（点击哪一单看详情）、editing（详情编辑态）。
 * - 写入回调：`onAddRecord`、`onUpdateRecord`、`onDeleteRecord` 由父层透传到底层
 *   AppDataContext，保持「写完 invalidate -> useQuery 自动刷新」闭环。
 *
 * 设计上保持与原内联代码完全一致：所有 className、文本、字段都没动；
 * 仅是把一段 IIFE JSX 抽成正经组件 + props 接口。
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Filter, FileText, Clock, User, Package, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type {
  ProductionOrder,
  Product,
  AppDictionaries,
  ProductionOpRecord,
  Warehouse,
  ProductCategory,
  OrderFormSettings,
  PrintTemplate,
  PrintRenderContext,
} from '../../types';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { PlanFormCustomFieldReadonly } from '../../components/PlanFormCustomFieldControls';
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import { DocSummaryCard, DocInlineMetaRow } from '../../components/doc-modal';
import { fmtDT } from '../../utils/formatTime';
import { buildOneBlockMatrixPrintRows } from '../../utils/variantMatrixPrintRows';
import {
  psiOrderBillFormSectionStackClass,
  psiOrderBillCompactWarehouseSelectClass,
} from '../../styles/uiDensity';
import { psiCustomFieldHasFilledDisplayValue } from '../psi-ops/psiOpsListFormatting';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { StockInCustomEditFields } from './pendingStockStockInHelpers';
import {
  fetchProductionByFilter,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
} from '../production-ops/sharedFlowListHelpers';

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

export interface StockInFlowModalProps {
  open: boolean;
  onClose: () => void;
  /** 弹窗默认筛选用的"今天" YYYY-MM-DD（父层用 sharedFlowListHelpers.isoToDateInput 算好）。 */
  todayDate: string;
  orders: ProductionOrder[];
  products: Product[];
  productMap: Map<string, Product>;
  categoryMap: Map<string, ProductCategory>;
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  productionLinkMode: 'order' | 'product';
  orderFormSettings: OrderFormSettings;
  printTemplates: PrintTemplate[];
  onOpenOrderFormPrintTab?: () => void;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  hasPerm: (perm: string) => boolean;
  onFilePreview: (url: string, type: 'image' | 'pdf') => void;
}

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

type StockInBatch = {
  docNo: string;
  rows: StockInRow[];
  first: StockInRow;
  totalQty: number;
  orderNumber: string;
  productName: string;
  warehouseName: string;
  stockInCustomSnapshot?: Record<string, unknown>;
};

export const StockInFlowModal: React.FC<StockInFlowModalProps> = ({
  open,
  onClose,
  todayDate,
  orders,
  products,
  productMap,
  categoryMap,
  warehouses,
  dictionaries,
  productionLinkMode,
  orderFormSettings,
  printTemplates,
  onOpenOrderFormPrintTab,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  hasPerm,
  onFilePreview,
}) => {
  const [stockInFlowFilter, setStockInFlowFilter] = useState<{
    dateFrom: string; dateTo: string; docNo: string; orderNumber: string; productName: string; warehouseId: string;
  }>({ dateFrom: todayDate, dateTo: todayDate, docNo: '', orderNumber: '', productName: '', warehouseId: '' });
  const [stockInFlowDetailDocNo, setStockInFlowDetailDocNo] = useState<string | null>(null);
  const [stockInFlowEditing, setStockInFlowEditing] = useState<{
    warehouseId: string;
    customData: Record<string, unknown>;
    /** id 为空表示该规格尚未有入库明细行，保存时走新增 */
    rows: { id: string; variantId?: string; quantity: number }[];
  } | null>(null);

  const stockInFlowQuery = useQuery({
    queryKey: ['flow.stockIn', stockInFlowFilter.dateFrom, stockInFlowFilter.dateTo],
    queryFn: () =>
      fetchProductionByFilter({
        type: 'STOCK_IN',
        startDate: dateInputToIsoStart(stockInFlowFilter.dateFrom),
        endDate: dateInputToIsoEndExclusive(stockInFlowFilter.dateTo),
      }),
    enabled: open,
    staleTime: 15_000,
  });

  const stockInCustomFieldDefs = orderFormSettings.stockInCustomFields ?? [];

  if (!open) return null;

  const allStockInRows: StockInRow[] = (stockInFlowQuery.data ?? [])
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
    if (sf.docNo && !r.docNo.toLowerCase().includes(sf.docNo.toLowerCase())) return false;
    if (sf.orderNumber && !r.orderNumber.toLowerCase().includes(sf.orderNumber.toLowerCase())) return false;
    if (sf.productName && !r.productName.toLowerCase().includes(sf.productName.toLowerCase())) return false;
    if (sf.warehouseId && r.warehouseId !== sf.warehouseId) return false;
    return true;
  });

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
        onClose={() => { onClose(); setStockInFlowDetailDocNo(null); }}
        onEnterEdit={() => {}}
        onCancelEdit={() => {}}
        renderContent={() => (
          <>
            <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                <span className="text-[10px] text-slate-400">默认显示当天，扩大日期范围需手动改</span>
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
                <button onClick={() => setStockInFlowFilter({ dateFrom: todayDate, dateTo: todayDate, docNo: '', orderNumber: '', productName: '', warehouseId: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">重置为当天</button>
                <span className="text-xs text-slate-400">共 {batches.length} 次入库，合计 {totalQtyAll} 件</span>
                {stockInFlowQuery.isFetching && (
                  <span className="text-xs text-indigo-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />加载中</span>
                )}
              </div>
            </div>
            {stockInFlowQuery.isLoading ? (
              <p className="text-slate-500 text-center py-12">加载中…</p>
            ) : batches.length === 0 ? (
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
          const docRecords = (stockInFlowQuery.data ?? []).filter(
            r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo,
          );
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
          const docRecords = (stockInFlowQuery.data ?? []).filter(
            r => r.type === 'STOCK_IN' && r.docNo === detailBatch.docNo,
          );
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
                            onFilePreview={(url, type) => onFilePreview(url, type)}
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
                                    onFilePreview={(url, type) => onFilePreview(url, type)}
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
};
