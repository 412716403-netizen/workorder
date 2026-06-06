import React, { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { TableVirtuoso } from 'react-virtuoso';
import { X, Filter, FileText, ScrollText } from 'lucide-react';
import type { Product, ProductionOpRecord, PsiRecord, Warehouse } from '../../types';
import {
  fetchProductionByFilter,
  fetchPsiByFilter,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  getTodayRangeIso,
  isoToDateInput,
} from '../production-ops/sharedFlowListHelpers';
import { computeWarehouseFlowTotals, formatWarehouseFlowQty } from './warehouseFlowHelpers';
import FlowListSummaryFooter from '../../components/flow/FlowListSummaryFooter';
import FlowListProductCell from '../../components/flow/FlowListProductCell';

const WAREHOUSE_FLOW_TYPES = ['PURCHASE_BILL', 'SALES_BILL', 'TRANSFER', 'STOCKTAKE', 'STOCK_IN', 'STOCK_RETURN', 'STOCK_OUT'] as const;
const warehouseFlowTypeLabel: Record<string, string> = { PURCHASE_BILL: '采购入库', SALES_BILL: '销售出库', SALES_RETURN: '销售退货', TRANSFER: '调拨', STOCKTAKE: '盘点', STOCK_IN: '生产入库', STOCK_RETURN: '生产退料', STOCK_OUT: '领料发出' };

interface FlowRow {
  id: string;
  type: string;
  typeLabel: string;
  docNumber: string;
  dateStr: string;
  displayDateTime: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  warehouseId: string;
  warehouseName: string;
  isOutbound: boolean;
  partner: string;
  record: PsiRecord | ProductionOpRecord;
  _sortTs: number;
}

export interface WarehouseFlowDetailExtraPayload {
  psiRecords: PsiRecord[];
  prodRecords: ProductionOpRecord[];
}

export interface WarehouseFlowModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  warehouses: Warehouse[];
  orders: { id: string; orderNumber?: string }[];
  /** 详情打开回调；同时把当时窄拉到的全部 PSI / 生产记录回传给上层，避免 panel 当时窄拉未覆盖 */
  onViewDetail: (key: string, extra: WarehouseFlowDetailExtraPayload) => void;
}

function toFlowDateStr(ts: string): string {
  if (!ts || !ts.toString().trim()) return '';
  const d = new Date(ts.toString());
  if (isNaN(d.getTime())) return ts.toString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatFlowDateTime(ts: string): string {
  if (!ts || !ts.toString().trim()) return '—';
  const d = new Date(ts.toString());
  if (isNaN(d.getTime())) return ts.toString();
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0 || (ts.toString().length > 10 && /[T\s]/.test(ts.toString()));
  return hasTime ? d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : d.toLocaleDateString('zh-CN');
}

function parseRecordMs(rec: PsiRecord | ProductionOpRecord): number {
  const r = rec as any;
  const candidate = r.createdAt || r.timestamp;
  if (!candidate) return 0;
  const t = new Date(candidate).getTime();
  return Number.isNaN(t) ? 0 : t;
}

const WarehouseFlowModal: React.FC<WarehouseFlowModalProps> = ({
  open,
  onClose,
  products,
  warehouses,
  orders,
  onViewDetail,
}) => {
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);
  const [dateFrom, setDateFrom] = useState(todayDate);
  const [dateTo, setDateTo] = useState(todayDate);
  const [flowType, setFlowType] = useState<string>('all');
  const [flowWarehouse, setFlowWarehouse] = useState<string>('all');
  const [docNo, setDocNo] = useState('');
  const [product, setProduct] = useState('');

  const dateFromIso = dateInputToIsoStart(dateFrom);
  const dateToIso = dateInputToIsoEndExclusive(dateTo);

  /**
   * PSI 四类并发拉取（PURCHASE_BILL / SALES_BILL / TRANSFER / STOCKTAKE）+ 生产三类（STOCK_IN/OUT/RETURN）。
   * 服务端按 createdAt / timestamp 过滤，前端再按产品 / 单号 / 仓库等 useMemo 过滤展示。
   */
  const queries = useQueries({
    queries: [
      {
        queryKey: ['flow.warehouse.psi.purchaseBill', dateFrom, dateTo],
        queryFn: () => fetchPsiByFilter({ type: 'PURCHASE_BILL', startDate: dateFromIso, endDate: dateToIso }),
        enabled: open,
        staleTime: 15_000,
      },
      {
        queryKey: ['flow.warehouse.psi.salesBill', dateFrom, dateTo],
        queryFn: () => fetchPsiByFilter({ type: 'SALES_BILL', startDate: dateFromIso, endDate: dateToIso }),
        enabled: open,
        staleTime: 15_000,
      },
      {
        queryKey: ['flow.warehouse.psi.transfer', dateFrom, dateTo],
        queryFn: () => fetchPsiByFilter({ type: 'TRANSFER', startDate: dateFromIso, endDate: dateToIso }),
        enabled: open,
        staleTime: 15_000,
      },
      {
        queryKey: ['flow.warehouse.psi.stocktake', dateFrom, dateTo],
        queryFn: () => fetchPsiByFilter({ type: 'STOCKTAKE', startDate: dateFromIso, endDate: dateToIso }),
        enabled: open,
        staleTime: 15_000,
      },
      {
        queryKey: ['flow.warehouse.prod', dateFrom, dateTo],
        queryFn: () => fetchProductionByFilter({
          types: 'STOCK_IN,STOCK_OUT,STOCK_RETURN',
          startDate: dateFromIso,
          endDate: dateToIso,
        }),
        enabled: open,
        staleTime: 15_000,
      },
    ],
  });

  const isLoading = queries.some(q => q.isLoading);
  const psiAll = useMemo<PsiRecord[]>(
    () => [
      ...((queries[0].data as PsiRecord[] | undefined) ?? []),
      ...((queries[1].data as PsiRecord[] | undefined) ?? []),
      ...((queries[2].data as PsiRecord[] | undefined) ?? []),
      ...((queries[3].data as PsiRecord[] | undefined) ?? []),
    ],
    [queries[0].data, queries[1].data, queries[2].data, queries[3].data],
  );
  const prodAll = useMemo<ProductionOpRecord[]>(
    () => (queries[4].data as ProductionOpRecord[] | undefined) ?? [],
    [queries[4].data],
  );

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses]);
  const ordersById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);

  /** 聚合：四类 PSI + 三类生产 → 按 type|docNumber|productId 合并 */
  const warehouseFlowRows = useMemo<FlowRow[]>(() => {
    const psiList = psiAll.filter(r => WAREHOUSE_FLOW_TYPES.includes(r.type as never));
    const psiRows: FlowRow[] = psiList.map(r => {
      const rec = r as any;
      const productMeta = productMap.get(rec.productId);
      const dateStr = toFlowDateStr((rec.createdAt || rec.timestamp || '').toString());
      const warehouseId = rec.type === 'TRANSFER'
        ? (rec.toWarehouseId || rec.warehouseId)
        : rec.warehouseId;
      const warehouseName = rec.type === 'SALES_BILL'
        ? (warehouseMap.get(rec.warehouseId)?.name ?? '—')
        : rec.type === 'TRANSFER'
          ? (rec.toWarehouseId ? warehouseMap.get(rec.toWarehouseId)?.name ?? '—' : '—')
          : (warehouseMap.get(rec.warehouseId)?.name ?? '—');
      const qty = rec.quantity ?? 0;
      const isSalesReturn = rec.type === 'SALES_BILL' && qty < 0;
      return {
        id: rec.id,
        type: rec.type,
        typeLabel: isSalesReturn ? '销售退货' : (warehouseFlowTypeLabel[rec.type] || rec.type),
        docNumber: rec.docNumber || '—',
        dateStr: dateStr || (rec.timestamp ?? '—'),
        displayDateTime: formatFlowDateTime(rec.timestamp || rec.createdAt || ''),
        productId: rec.productId,
        productName: productMeta?.name ?? '—',
        productSku: productMeta?.sku ?? '—',
        quantity: qty,
        warehouseId: warehouseId || rec.warehouseId,
        warehouseName,
        isOutbound: rec.type === 'SALES_BILL',
        partner: rec.partner ?? '—',
        record: r,
        _sortTs: parseRecordMs(r),
      };
    });

    const buildProdRow = (r: ProductionOpRecord, type: 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_RETURN'): FlowRow => {
      const rec = r as any;
      const productMeta = productMap.get(rec.productId);
      const order = ordersById.get(rec.orderId ?? '');
      const dateStr = toFlowDateStr((rec.timestamp || '').toString());
      const fallbackPrefix = type === 'STOCK_IN' ? '工单入库-' : type === 'STOCK_RETURN' ? '退料-' : '领料-';
      const fallbackShort = type === 'STOCK_IN' ? 'SI' : type === 'STOCK_RETURN' ? 'TR' : 'LO';
      const docNumber = rec.docNo
        || (order?.orderNumber ? `${fallbackPrefix}${order.orderNumber}` : `${fallbackShort}-${rec.id}`);
      return {
        id: rec.id,
        type,
        typeLabel: warehouseFlowTypeLabel[type] || type,
        docNumber,
        dateStr: dateStr || '—',
        displayDateTime: formatFlowDateTime(rec.timestamp || ''),
        productId: rec.productId,
        productName: productMeta?.name ?? '—',
        productSku: productMeta?.sku ?? '—',
        quantity: rec.quantity ?? 0,
        warehouseId: rec.warehouseId,
        warehouseName: warehouseMap.get(rec.warehouseId)?.name ?? '—',
        isOutbound: type === 'STOCK_OUT',
        partner: '—',
        record: r,
        _sortTs: parseRecordMs(r),
      };
    };
    const stockInRows = prodAll.filter(r => r.type === 'STOCK_IN').map(r => buildProdRow(r, 'STOCK_IN'));
    const stockReturnRows = prodAll.filter(r => r.type === 'STOCK_RETURN').map(r => buildProdRow(r, 'STOCK_RETURN'));
    const stockOutRows = prodAll.filter(r => r.type === 'STOCK_OUT').map(r => buildProdRow(r, 'STOCK_OUT'));

    const allRows = [...psiRows, ...stockInRows, ...stockReturnRows, ...stockOutRows];
    const groups = new Map<string, FlowRow[]>();
    allRows.forEach(r => {
      const key = `${r.type}|${r.docNumber}|${r.productId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    return Array.from(groups.entries())
      .map(([key, rows]) => {
        const tsList = rows.map(r => r._sortTs).filter(t => t > 0);
        const minTs = tsList.length ? Math.min(...tsList) : 0;
        const displayRow = rows.reduce((best, cur) => {
          if (cur._sortTs <= 0) return best;
          if (best._sortTs <= 0) return cur;
          return cur._sortTs < best._sortTs ? cur : best;
        }, rows[0]);
        const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
        return { ...displayRow, id: key, quantity: totalQty, _sortTs: minTs };
      })
      .sort((a, b) => b._sortTs - a._sortTs || String(a.id).localeCompare(String(b.id)));
  }, [psiAll, prodAll, productMap, warehouseMap, ordersById]);

  const filteredRows = useMemo(() => {
    let rows = warehouseFlowRows;
    if (dateFrom) rows = rows.filter(r => r.dateStr >= dateFrom);
    if (dateTo) rows = rows.filter(r => r.dateStr <= dateTo);
    if (flowType !== 'all') {
      if (flowType === 'SALES_RETURN') rows = rows.filter(r => r.type === 'SALES_BILL' && r.quantity < 0);
      else if (flowType === 'SALES_BILL') rows = rows.filter(r => r.type === 'SALES_BILL' && r.quantity >= 0);
      else rows = rows.filter(r => r.type === flowType);
    }
    if (flowWarehouse !== 'all') {
      rows = rows.filter(r => (r.warehouseId || '') === flowWarehouse);
    }
    if (docNo.trim()) {
      const t = docNo.trim().toLowerCase();
      rows = rows.filter(r => (r.docNumber || '').toLowerCase().includes(t));
    }
    if (product.trim()) {
      const t = product.trim().toLowerCase();
      rows = rows.filter(r => r.productName.toLowerCase().includes(t) || r.productSku.toLowerCase().includes(t));
    }
    return rows;
  }, [warehouseFlowRows, dateFrom, dateTo, flowType, flowWarehouse, docNo, product]);

  const flowTotals = useMemo(
    () => computeWarehouseFlowTotals(filteredRows),
    [filteredRows],
  );

  const handleViewDetail = (key: string) => {
    onViewDetail(key, { psiRecords: psiAll, prodRecords: prodAll });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 仓库流水</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
            <span className="text-[10px] text-slate-400">默认显示当天，扩大日期范围需手动改</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
           <div>
             <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
             <select value={flowType} onChange={e => setFlowType(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
               <option value="all">全部</option>
               {WAREHOUSE_FLOW_TYPES.map(t => (
                 <option key={t} value={t}>{warehouseFlowTypeLabel[t]}</option>
               ))}
               <option value="SALES_RETURN">销售退货</option>
             </select>
           </div>
           <div>
             <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
             <select value={flowWarehouse} onChange={e => setFlowWarehouse(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
               <option value="all">全部</option>
               {warehouses.map(w => (
                 <option key={w.id} value={w.id}>{w.name}</option>
               ))}
             </select>
           </div>
           <div>
             <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
              <input type="text" value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input type="text" value={product} onChange={e => setProduct(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-4">
          {isLoading ? (
            <p className="text-slate-500 text-center py-12">加载中…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无仓库流水记录</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <TableVirtuoso
                style={{ height: Math.min(filteredRows.length * 48 + 48 + 44, 560) }}
                data={filteredRows}
                fixedHeaderContent={() => (
                 <tr className="bg-slate-50 border-b border-slate-200">
                   <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期时间</th>
                   <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                   <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                   <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                   <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                   <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                   <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                 </tr>
                )}
                fixedFooterContent={() => (
                  <FlowListSummaryFooter
                    mode="tableRow"
                    count={filteredRows.length}
                    colSpan={6}
                    trailingEmptyCols={1}
                    metrics={[
                      { label: '入库', value: `${formatWarehouseFlowQty(flowTotals.inboundTotal)} 件`, className: 'text-indigo-600' },
                      { label: '出库', value: `${formatWarehouseFlowQty(flowTotals.outboundTotal)} 件`, className: 'text-amber-600' },
                      {
                        label: '净变化',
                        value: `${flowTotals.netChange >= 0 ? '+' : ''}${formatWarehouseFlowQty(flowTotals.netChange)} 件`,
                        className: flowTotals.netChange < 0 ? 'text-rose-600' : 'text-slate-700',
                      },
                    ]}
                  />
                )}
                itemContent={(_idx, row) => (
                  <>
                     <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.displayDateTime ?? row.dateStr}</td>
                     <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">{row.typeLabel}</span></td>
                     <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNumber}</td>
                     <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName}</td>
                     <td className="px-4 py-3">
                       <FlowListProductCell
                         product={productMap.get(row.productId)}
                         name={row.productName}
                         sku={row.productSku}
                       />
                     </td>
                     <td className="px-4 py-3 text-right font-black text-indigo-600">{row.quantity}</td>
                     <td className="px-4 py-3">
                        <button type="button" onClick={() => handleViewDetail(`${row.type}|${row.docNumber}`)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      </td>
                  </>
                )}
                components={{ Table: (props) => <table {...props} className="w-full text-left text-sm" />, TableRow: ({ item: _item, ...props }) => <tr {...props} className="border-b border-slate-100 hover:bg-slate-50/50" /> }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(WarehouseFlowModal);
