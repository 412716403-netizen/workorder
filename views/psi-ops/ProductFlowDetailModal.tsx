import React, { useState, useMemo } from 'react';
import { ModalPortal } from '../../components/ModalPortal';
import { X, Filter, FileText, ScrollText } from 'lucide-react';
import { Warehouse, Product, AppDictionaries } from '../../types';
import {
  computeWarehouseFlowTotals,
  formatWarehouseFlowQty,
  splitWarehouseVariantQtyByDirection,
  warehouseRecordToVariantQtySource,
} from './warehouseFlowHelpers';
import FlowListSummaryFooter from '../../components/flow/FlowListSummaryFooter';
import FlowListTableShell from '../../components/flow/FlowListTableShell';
import FlowListProductCell from '../../components/flow/FlowListProductCell';
import FlowListQtyMatrixHover from '../../components/flow/FlowListQtyMatrixHover';
import {
  aggregateVariantQty,
  resolveProductUnitName,
  subtractVariantQty,
} from '../../utils/flowListVariantQty';

export interface ProductFlowDetailModalProps {
  productFlowDetail: { productId: string; productName: string; warehouseId: string | null; warehouseName: string | null };
  onClose: () => void;
  warehouseFlowRows: any[];
  warehouses: Warehouse[];
  products?: Product[];
  dictionaries?: AppDictionaries;
  parseRecordTime: (r: any) => number;
  onViewDetail: (key: string) => void;
}

const ProductFlowDetailModal: React.FC<ProductFlowDetailModalProps> = ({
  productFlowDetail,
  onClose,
  warehouseFlowRows,
  warehouses,
  products = [],
  dictionaries,
  parseRecordTime,
  onViewDetail,
}) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flowType, setFlowType] = useState<string>('all');
  const [warehouseId, setWarehouseId] = useState<string>('all');

  const detailRows = useMemo(() => {
    const pid = productFlowDetail.productId;
    const whId = productFlowDetail.warehouseId;
    let rows = warehouseFlowRows.filter((r: any) => r.productId === pid);
    if (whId) {
      rows = rows.filter((r: any) => {
        const rec = r.record;
        if (rec.type === 'TRANSFER') return rec.toWarehouseId === whId || rec.fromWarehouseId === whId;
        if (rec.type === 'SALES_BILL') return rec.warehouseId === whId;
        return (r.warehouseId || rec.warehouseId) === whId;
      });
    }
    const sortTs = (r: any) =>
      typeof r._sortTs === 'number' && r._sortTs > 0 ? r._sortTs : parseRecordTime(r.record);
    return rows.sort(
      (a: any, b: any) => sortTs(b) - sortTs(a) || String(a.id).localeCompare(String(b.id)),
    );
  }, [warehouseFlowRows, productFlowDetail, parseRecordTime]);

  const filteredRows = useMemo(() => {
    let rows = detailRows;
    if (dateFrom) rows = rows.filter((r: any) => (r.dateStr || '') >= dateFrom);
    if (dateTo) rows = rows.filter((r: any) => (r.dateStr || '') <= dateTo);
    if (flowType !== 'all') {
      if (flowType === 'SALES_RETURN') rows = rows.filter((r: any) => r.type === 'SALES_BILL' && r.quantity < 0);
      else if (flowType === 'SALES_BILL') rows = rows.filter((r: any) => r.type === 'SALES_BILL' && r.quantity >= 0);
      else if (flowType === 'PURCHASE_RETURN') rows = rows.filter((r: any) => r.type === 'PURCHASE_BILL' && r.quantity < 0);
      else if (flowType === 'PURCHASE_BILL') rows = rows.filter((r: any) => r.type === 'PURCHASE_BILL' && r.quantity >= 0);
      else rows = rows.filter((r: any) => r.type === flowType);
    }
    if (warehouseId !== 'all') rows = rows.filter((r: any) => (r.warehouseId || '') === warehouseId);
    return rows;
  }, [detailRows, dateFrom, dateTo, flowType, warehouseId]);

  const flowTotals = useMemo(() => computeWarehouseFlowTotals(filteredRows), [filteredRows]);
  const detailProduct = products.find(p => p.id === productFlowDetail.productId);
  const summaryUnitName = resolveProductUnitName(detailProduct, dictionaries);
  const summaryDirectionQty = useMemo(() => {
    const { inbound, outbound } = splitWarehouseVariantQtyByDirection(filteredRows);
    const inboundBreakdown = aggregateVariantQty(inbound);
    const outboundBreakdown = aggregateVariantQty(outbound);
    return {
      inbound: inboundBreakdown,
      outbound: outboundBreakdown,
      net: subtractVariantQty(inboundBreakdown, outboundBreakdown),
    };
  }, [filteredRows]);

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative z-10 bg-white w-full max-w-6xl max-h-[min(92vh,960px)] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-indigo-600" />
            仓库流水
            {productFlowDetail.warehouseName ? ` - ${productFlowDetail.warehouseName} / ${productFlowDetail.productName}` : ` - ${productFlowDetail.productName}`}
          </h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">开始时间</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">结束时间</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
              <select
                value={flowType}
                onChange={e => setFlowType(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="all">全部</option>
                <option value="PURCHASE_BILL">采购入库</option>
                <option value="PURCHASE_RETURN">采购退货</option>
                <option value="SALES_BILL">销售出库</option>
                <option value="SALES_RETURN">销售退货</option>
                <option value="TRANSFER">调拨</option>
                <option value="STOCKTAKE">盘点</option>
                <option value="STOCK_IN">生产入库</option>
                <option value="STOCK_RETURN">生产退料</option>
                <option value="STOCK_OUT">领料发出</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="all">全部</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => { setDateFrom(''); setDateTo(''); setFlowType('all'); setWarehouseId('all'); }}
              className="text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              清空筛选
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-4">
          {detailRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无该产品{productFlowDetail.warehouseName ? '在该仓库' : ''}的流水记录</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">无符合筛选条件的记录</p>
          ) : (
            <FlowListTableShell
              className="flex-1 min-h-0"
              footer={
                <FlowListSummaryFooter
                  mode="bar"
                  count={filteredRows.length}
                  metrics={[
                    {
                      label: '入库',
                      value: detailProduct ? (
                        <FlowListQtyMatrixHover
                          product={detailProduct}
                          dictionaries={dictionaries}
                          breakdown={summaryDirectionQty.inbound}
                          totalQty={flowTotals.inboundTotal}
                          unitName={summaryUnitName}
                          label="入库"
                        >
                          {formatWarehouseFlowQty(flowTotals.inboundTotal)} {summaryUnitName}
                        </FlowListQtyMatrixHover>
                      ) : (
                        `${formatWarehouseFlowQty(flowTotals.inboundTotal)} 件`
                      ),
                      className: 'text-indigo-600',
                    },
                    {
                      label: '出库',
                      value: detailProduct ? (
                        <FlowListQtyMatrixHover
                          product={detailProduct}
                          dictionaries={dictionaries}
                          breakdown={summaryDirectionQty.outbound}
                          totalQty={flowTotals.outboundTotal}
                          unitName={summaryUnitName}
                          label="出库"
                        >
                          {formatWarehouseFlowQty(flowTotals.outboundTotal)} {summaryUnitName}
                        </FlowListQtyMatrixHover>
                      ) : (
                        `${formatWarehouseFlowQty(flowTotals.outboundTotal)} 件`
                      ),
                      className: 'text-amber-600',
                    },
                    {
                      label: '净变化',
                      value: detailProduct ? (
                        <FlowListQtyMatrixHover
                          product={detailProduct}
                          dictionaries={dictionaries}
                          breakdown={summaryDirectionQty.net}
                          totalQty={flowTotals.netChange}
                          unitName={summaryUnitName}
                          label="净变化"
                        >
                          {flowTotals.netChange >= 0 ? '+' : ''}
                          {formatWarehouseFlowQty(flowTotals.netChange)} {summaryUnitName}
                        </FlowListQtyMatrixHover>
                      ) : (
                        `${flowTotals.netChange >= 0 ? '+' : ''}${formatWarehouseFlowQty(flowTotals.netChange)} 件`
                      ),
                      className: flowTotals.netChange < 0 ? 'text-rose-600' : 'text-slate-700',
                    },
                  ]}
                />
              }
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期时间</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row: any) => {
                    const rowProduct = products.find(p => p.id === row.productId) ?? detailProduct;
                    const rowUnitName = resolveProductUnitName(rowProduct, dictionaries);
                    const rowSources = (
                      row.sourceRecords?.length ? row.sourceRecords : [row.record]
                    ).map(warehouseRecordToVariantQtySource);
                    const rowVariantQty = aggregateVariantQty(rowSources);
                    return (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.displayDateTime ?? row.dateStr}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">{row.typeLabel}</span></td>
                      <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNumber}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName}</td>
                      <td className="px-4 py-3">
                        <FlowListProductCell
                          product={rowProduct}
                          name={row.productName}
                          sku={row.productSku}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-black text-indigo-600">
                        <FlowListQtyMatrixHover
                          product={rowProduct}
                          dictionaries={dictionaries}
                          breakdown={rowVariantQty}
                          totalQty={row.quantity}
                          unitName={rowUnitName}
                        >
                          {row.quantity}
                        </FlowListQtyMatrixHover>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onViewDetail(`${row.type}|${row.docNumber}`)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </FlowListTableShell>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default React.memo(ProductFlowDetailModal);
