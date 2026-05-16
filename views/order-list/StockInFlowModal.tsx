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
  /** 同一单号下出现的所有不同产品（按首次出现顺序） */
  productNames: string[];
  productIds: string[];
  warehouseName: string;
  stockInCustomSnapshot?: Record<string, unknown>;
};

/** 流水列表行：同一 RK 单号下每个产品各占一行 */
type StockInFlowListRow = {
  docNo: string;
  productId: string;
  productName: string;
  rows: StockInRow[];
  first: StockInRow;
  totalQty: number;
  orderNumber: string;
  warehouseName: string;
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
    /**
     * id 为空表示该规格尚未有入库明细行，保存时走新增。
     * productId/orderId 用于多产品共号场景：每行明确归属哪个产品/工单，
     * 避免保存时新建明细误用 `detailBatch.first.productId` 把其他产品的格子塞回毛衣16。
     */
    rows: { id: string; productId: string; orderId: string; variantId?: string; quantity: number }[];
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
      const productIds: string[] = [];
      const productNames: string[] = [];
      for (const r of rows) {
        if (!productIds.includes(r.productId)) {
          productIds.push(r.productId);
          const p = productMap.get(r.productId);
          productNames.push(p?.name || r.productName || r.productId);
        }
      }
      return {
        docNo,
        rows,
        first: rows[0],
        totalQty: rows.reduce((s, r) => s + r.quantity, 0),
        orderNumber: rows[0].orderNumber,
        productName: prod?.name || rows[0].productName,
        productNames,
        productIds,
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
  /** 按单据 × 产品展开：一单多品时列表各占一行 */
  const flowListRows: StockInFlowListRow[] = batches.flatMap(batch =>
    batch.productIds.map(productId => {
      const rows = batch.rows.filter(r => r.productId === productId);
      const p = productMap.get(productId);
      return {
        docNo: batch.docNo,
        productId,
        productName: p?.name || rows[0]?.productName || productId,
        rows,
        first: rows[0],
        totalQty: rows.reduce((s, r) => s + r.quantity, 0),
        orderNumber: rows[0]?.orderNumber ?? batch.orderNumber,
        warehouseName: batch.warehouseName,
      };
    }),
  );
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
                <span className="text-xs text-slate-400">
                  共 {batches.length} 次入库、{flowListRows.length} 条明细，合计 {totalQtyAll} 件
                </span>
                {stockInFlowQuery.isFetching && (
                  <span className="text-xs text-indigo-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />加载中</span>
                )}
              </div>
            </div>
            {stockInFlowQuery.isLoading ? (
              <p className="text-slate-500 text-center py-12">加载中…</p>
            ) : flowListRows.length === 0 ? (
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
                    {flowListRows.map(row => {
                      const rowProduct = productMap.get(row.productId);
                      const rowUnit =
                        (rowProduct?.unitId && dictionaries?.units?.find(u => u.id === rowProduct.unitId)?.name) || '件';
                      return (
                        <tr key={`${row.docNo}-${row.productId}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDT(row.first.timestamp)}</td>
                          <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{row.docNo}</td>
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{row.productName}</td>
                          {productionLinkMode !== 'product' && (
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.orderNumber}</td>
                          )}
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName || '—'}</td>
                          <td className="px-4 py-3 font-bold text-emerald-600 text-right whitespace-nowrap">
                            {row.totalQty} {rowUnit}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.first.operator}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setStockInFlowDetailDocNo(row.docNo)}
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
        /**
         * 按 productId 把 detailBatch.rows 分组——一次「批量入库」可以同时勾多个产品，
         * 后端会让它们共享同一个 RK 单号，所以一个 docNo 下完全可能出现 2+ 个产品。
         * 旧实现只取 first.productId 做矩阵/单产品渲染，其他产品的变体不在它的色/码维表里
         * → 矩阵静默吞掉那部分明细，导致"合计 15 / 明细只有 10"对账不上。
         */
        type DetailGroup = {
          productId: string;
          product: Product | undefined;
          category: ProductCategory | null;
          hasColorSize: boolean;
          matrixLayout: ReturnType<typeof buildVariantQtyMatrixLayout> | null;
          matrixProduct: Product | null;
          useMatrix: boolean;
          unitName: string;
          rows: StockInRow[];
          totalQty: number;
          customTags: ReturnType<typeof getProductCategoryCustomFieldEntries>;
          firstRow: StockInRow;
        };
        const detailProductGroups: DetailGroup[] = (() => {
          const map = new Map<string, StockInRow[]>();
          for (const r of detailBatch.rows) {
            if (!map.has(r.productId)) map.set(r.productId, []);
            map.get(r.productId)!.push(r);
          }
          return Array.from(map.entries()).map(([pid, rows]) => {
            const p = productMap.get(pid);
            const cat = p ? categoryMap.get(p.categoryId) ?? null : null;
            const hasCS = productHasColorSizeMatrix(p ?? undefined, cat ?? undefined);
            /** 保留 colorIds/sizeIds，矩阵列顺序与商品档案一致；仅展示本单有数量的格 */
            const mProd =
              p && p.variants?.length
                ? ({
                    ...p,
                    colorIds: p.colorIds?.length ? p.colorIds : undefined,
                    sizeIds: p.sizeIds?.length ? p.sizeIds : undefined,
                  } as Product)
                : null;
            const layout = mProd && dictionaries ? buildVariantQtyMatrixLayout(mProd, dictionaries) : null;
            const useM = Boolean(hasCS && layout && mProd && dictionaries);
            const unit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
            const tags = p
              ? getProductCategoryCustomFieldEntries(p, cat, { includeFile: false, includeEmpty: false })
              : [];
            return {
              productId: pid,
              product: p,
              category: cat,
              hasColorSize: hasCS,
              matrixLayout: layout,
              matrixProduct: mProd,
              useMatrix: useM,
              unitName: unit,
              rows,
              totalQty: rows.reduce((s, r) => s + r.quantity, 0),
              customTags: tags,
              firstRow: rows[0],
            };
          });
        })();
        const isMultiProduct = detailProductGroups.length > 1;
        const headerProduct = detailProductGroups[0]?.product;
        const headerUnitName = detailProductGroups[0]?.unitName ?? '件';
        const wh = warehouses.find(w => w.id === detailBatch.first.warehouseId);
        const isEditing = stockInFlowEditing !== null;
        const stockInSnap = detailBatch.stockInCustomSnapshot ?? {};
        const stockInFieldsForDetailInline = stockInCustomFieldDefs.filter(f =>
          f.showInDetail && psiCustomFieldHasFilledDisplayValue(f, stockInSnap[f.id]),
        );
        const getVariantLabel = (g: DetailGroup, variantId?: string) => {
          if (!variantId) return '—';
          const v = g.product?.variants?.find((x: { id: string }) => x.id === variantId);
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
          const editRows: { id: string; productId: string; orderId: string; variantId?: string; quantity: number }[] = [];
          for (const g of detailProductGroups) {
            if (g.useMatrix && g.matrixLayout) {
              const byVid = new Map<string, StockInRow>();
              for (const r of g.rows) {
                if (r.variantId) byVid.set(r.variantId, r);
              }
              for (const cr of g.matrixLayout.colorRows) {
                for (const v of cr.variantAtSize) {
                  if (!v) continue;
                  const hit = byVid.get(v.id);
                  if (hit) {
                    editRows.push({
                      id: hit.id,
                      productId: g.productId,
                      orderId: hit.orderId,
                      variantId: v.id,
                      quantity: hit.quantity,
                    });
                  } else {
                    editRows.push({
                      id: '',
                      productId: g.productId,
                      orderId: g.firstRow.orderId,
                      variantId: v.id,
                      quantity: 0,
                    });
                  }
                }
              }
            } else {
              for (const r of g.rows) {
                editRows.push({
                  id: r.id,
                  productId: g.productId,
                  orderId: r.orderId,
                  variantId: r.variantId,
                  quantity: r.quantity,
                });
              }
            }
          }
          setStockInFlowEditing({ ...baseEdit, rows: editRows });
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
                orderId: row.orderId,
                productId: row.productId,
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
            maxWidthClass={detailProductGroups.some(g => g.useMatrix) ? 'max-w-3xl' : 'max-w-2xl'}
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
                    product: headerProduct ?? undefined,
                    stockInPrint: {
                      docNo: detailBatch.docNo,
                      warehouseName: detailBatch.warehouseName || wh?.name || '',
                      operator: detailBatch.first.operator,
                      timestamp: fmtDT(detailBatch.first.timestamp),
                      productName: isMultiProduct
                        ? `${detailBatch.productNames[0]} 等 ${detailBatch.productIds.length} 个`
                        : detailBatch.productName,
                      orderNumber: detailBatch.orderNumber || '—',
                      totalQty: detailBatch.totalQty,
                      custom: detailBatch.stockInCustomSnapshot ?? {},
                    },
                    /**
                     * 多产品共单时把每个产品块的明细按顺序拼起来；
                     * 单产品场景退化为原来的单块输出，模板渲染保持兼容。
                     */
                    printListRows: detailProductGroups.flatMap(g =>
                      buildOneBlockMatrixPrintRows({
                        productId: g.productId,
                        product: g.product ?? undefined,
                        products,
                        dictionaries,
                        rows: g.rows.map(r => ({ variantId: r.variantId, quantity: r.quantity })),
                      }),
                    ),
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
            renderContent={() => {
              /**
               * 单产品块渲染（只读）。多产品共号时这个函数会被多次调用，
               * 一次渲一个 g.productId 的明细块（matrix 或简单表）。
               */
              const renderDetailBlock = (g: DetailGroup) => {
                const blockTotalLabel = `${g.totalQty.toLocaleString()} ${g.unitName}`;
                if (g.useMatrix && g.matrixProduct) {
                  return (
                    <div key={g.productId} className="overflow-x-auto rounded-2xl border border-slate-200">
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
                                {g.product?.imageUrl ? (
                                  <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                    <img src={g.product.imageUrl} alt={g.product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                  </div>
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-bold text-slate-700">{g.product?.name ?? g.productId}</span>
                                    {g.product?.sku?.trim() ? (
                                      <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{g.product.sku.trim()}</span>
                                    ) : null}
                                  </div>
                                  {g.customTags.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {g.customTags.map(({ field, display }) => (
                                        <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                          {field.label}: {display}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-indigo-600">{blockTotalLabel}</td>
                          </tr>
                          <tr className="bg-slate-50/70">
                            <td colSpan={2} className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top">
                              <VariantQtyMatrixInputs
                                product={g.matrixProduct}
                                dictionaries={dictionaries}
                                balancedNumericLayout
                                readOnly
                                quantities={Object.fromEntries(g.rows.map(r => [r.variantId ?? '', r.quantity]))}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                }
                if (!g.hasColorSize) {
                  return (
                    <div key={g.productId} className="overflow-x-auto rounded-2xl border border-slate-200">
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
                                {g.product?.imageUrl ? (
                                  <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                    <img src={g.product.imageUrl} alt={g.product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                  </div>
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-bold text-slate-700">{g.product?.name ?? g.firstRow.productName ?? g.productId}</span>
                                    {g.product?.sku?.trim() ? (
                                      <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{g.product.sku.trim()}</span>
                                    ) : null}
                                  </div>
                                  {productionLinkMode !== 'product' && g.firstRow.orderNumber ? (
                                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                                      工单 <span className="font-bold text-slate-600 tabular-nums">{g.firstRow.orderNumber}</span>
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right align-middle">
                              <span className="font-black tabular-nums text-indigo-600">{blockTotalLabel}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                }
                return (
                  <div key={g.productId} className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-black uppercase tracking-widest text-slate-400">
                          <th className="px-3 py-2.5 text-left">规格</th>
                          <th className="px-3 py-2.5 text-right">数量</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {g.rows.map(row => (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="px-3 py-2.5 text-slate-800">{getVariantLabel(g, row.variantId)}</td>
                            <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-indigo-600">
                              {row.quantity} {g.unitName}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {g.rows.length > 1 ? (
                        <tfoot>
                          <tr className="border-t-2 border-indigo-200 bg-indigo-50/80 font-bold">
                            <td className="px-3 py-2.5">合计</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-indigo-600">{blockTotalLabel}</td>
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                );
              };

              const renderEditBlock = (g: DetailGroup) => {
                const blockEditRows = ef ? ef.rows.filter(r => r.productId === g.productId) : [];
                const blockEditTotal = blockEditRows.reduce((s, r) => s + r.quantity, 0);
                const updateRowQty = (rowId: string, qty: number) => {
                  setStockInFlowEditing(prev =>
                    prev
                      ? {
                          ...prev,
                          rows: prev.rows.map(r => (r.id === rowId ? { ...r, quantity: qty } : r)),
                        }
                      : prev,
                  );
                };
                const updateMatrixQty = (variantId: string, qty: number) => {
                  setStockInFlowEditing(prev =>
                    prev
                      ? {
                          ...prev,
                          rows: prev.rows.map(r =>
                            r.productId === g.productId && (r.variantId ?? '') === variantId
                              ? { ...r, quantity: qty }
                              : r,
                          ),
                        }
                      : prev,
                  );
                };
                if (g.useMatrix && g.matrixProduct) {
                  return (
                    <div key={g.productId} className="overflow-x-auto rounded-2xl border border-slate-200">
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
                                {g.product?.imageUrl ? (
                                  <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                    <img src={g.product.imageUrl} alt={g.product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                  </div>
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-bold text-slate-700">{g.product?.name ?? g.productId}</span>
                                    {g.product?.sku?.trim() ? (
                                      <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{g.product.sku.trim()}</span>
                                    ) : null}
                                  </div>
                                  {g.customTags.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {g.customTags.map(({ field, display }) => (
                                        <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                          {field.label}: {display}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-indigo-600">
                              {blockEditTotal.toLocaleString()} {g.unitName}
                            </td>
                          </tr>
                          <tr className="bg-slate-50/70">
                            <td colSpan={2} className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top">
                              <VariantQtyMatrixInputs
                                product={g.matrixProduct}
                                dictionaries={dictionaries}
                                balancedNumericLayout
                                quantities={Object.fromEntries(blockEditRows.map(r => [r.variantId ?? '', r.quantity]))}
                                onVariantQtyChange={(variantId, qty) => updateMatrixQty(variantId, qty)}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                }
                return (
                  <div key={g.productId} className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-black uppercase tracking-widest text-slate-400">
                          {g.hasColorSize ? (
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
                        {!g.hasColorSize
                          ? blockEditRows.map(row => (
                              <tr key={row.id}>
                                <td className="px-3 py-2.5 align-top">
                                  <div className="flex min-w-0 items-start gap-2">
                                    {g.product?.imageUrl ? (
                                      <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                        <img src={g.product.imageUrl} alt={g.product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                      </div>
                                    ) : (
                                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                        <Package className="h-4 w-4" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <span className="font-bold text-slate-700">{g.product?.name ?? g.firstRow.productName ?? g.productId}</span>
                                        {g.product?.sku?.trim() ? (
                                          <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{g.product.sku.trim()}</span>
                                        ) : null}
                                      </div>
                                      {productionLinkMode !== 'product' && g.firstRow.orderNumber ? (
                                        <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                                          工单 <span className="font-bold text-slate-600 tabular-nums">{g.firstRow.orderNumber}</span>
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
                                    onChange={e => updateRowQty(row.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="inline-block h-8 w-[4.75rem] rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums placeholder:text-[9px] placeholder:text-slate-400"
                                    placeholder="0"
                                  />
                                </td>
                              </tr>
                            ))
                          : blockEditRows.map(row => (
                              <tr key={row.id} className="border-b border-slate-100">
                                <td className="px-3 py-2.5 text-slate-800">{getVariantLabel(g, row.variantId)}</td>
                                <td className="px-3 py-2.5 text-right align-middle">
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.quantity === 0 ? '' : row.quantity}
                                    onChange={e => updateRowQty(row.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="inline-block h-8 w-[4.75rem] rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums placeholder:text-[9px] placeholder:text-slate-400"
                                    placeholder="0"
                                  />
                                </td>
                              </tr>
                            ))}
                      </tbody>
                      {blockEditRows.length > 1 ? (
                        <tfoot>
                          <tr className="border-t-2 border-indigo-200 bg-indigo-50/80 font-bold">
                            <td className="px-3 py-2.5">合计</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-indigo-600">
                              {blockEditTotal} {g.unitName}
                            </td>
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                );
              };

              return (
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
                              {editTotalQty.toLocaleString()} {headerUnitName}
                            </p>
                          </div>
                        }
                      />
                      {detailProductGroups.map(g => (
                        <div key={`edit-${g.productId}`} className="space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {isMultiProduct
                              ? `产品明细 — ${g.product?.name ?? g.firstRow.productName ?? g.productId}`
                              : g.useMatrix
                                ? '产品明细（按规格）'
                                : '产品明细'}
                          </p>
                          {renderEditBlock(g)}
                        </div>
                      ))}
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
                              {isMultiProduct ? (
                                <span
                                  className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700"
                                  title={detailBatch.productNames.join('、')}
                                >
                                  含 {detailBatch.productIds.length} 个产品
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
                              {detailBatch.totalQty.toLocaleString()} {headerUnitName}
                            </p>
                          </div>
                        }
                      />
                      <div className="flex-1 space-y-4 pb-4">
                        {detailProductGroups.map(g => (
                          <div key={`detail-${g.productId}`} className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              {isMultiProduct
                                ? `产品明细 — ${g.product?.name ?? g.firstRow.productName ?? g.productId}`
                                : g.useMatrix
                                  ? '产品明细（按规格）'
                                  : '产品明细'}
                            </p>
                            {renderDetailBlock(g)}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  </div>
                </>
              );
            }}
          />
        );
      })()}
    </>
  );
};
