import React, { useState, useMemo } from 'react';
import { X, Filter, FileText, ScrollText } from 'lucide-react';
import { Warehouse } from '../../types';

export interface ProductFlowDetailModalProps {
  productFlowDetail: { productId: string; productName: string; warehouseId: string | null; warehouseName: string | null };
  onClose: () => void;
  warehouseFlowRows: any[];
  warehouses: Warehouse[];
  parseRecordTime: (r: any) => number;
  onViewDetail: (key: string) => void;
}

const ProductFlowDetailModal: React.FC<ProductFlowDetailModalProps> = ({
  productFlowDetail,
  onClose,
  warehouseFlowRows,
  warehouses,
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
    return rows.sort((a: any, b: any) => parseRecordTime(b.record) - parseRecordTime(a.record));
  }, [warehouseFlowRows, productFlowDetail, parseRecordTime]);

  const filteredRows = useMemo(() => {
    let rows = detailRows;
    if (dateFrom) rows = rows.filter((r: any) => (r.dateStr || '') >= dateFrom);
    if (dateTo) rows = rows.filter((r: any) => (r.dateStr || '') <= dateTo);
    if (flowType !== 'all') {
      if (flowType === 'SALES_RETURN') rows = rows.filter((r: any) => r.type === 'SALES_BILL' && r.quantity < 0);
      else rows = rows.filter((r: any) => r.type === flowType);
    }
    if (warehouseId !== 'all') rows = rows.filter((r: any) => (r.warehouseId || '') === warehouseId);
    return rows;
  }, [detailRows, dateFrom, dateTo, flowType, warehouseId]);

  const totalQuantity = useMemo(() => filteredRows.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0), [filteredRows]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
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
            <span className="text-xs text-slate-400">共 {filteredRows.length} 条</span>
            <span className="text-xs font-bold text-indigo-600">合计数量：{Math.round(totalQuantity * 100) / 100}</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {detailRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无该产品{productFlowDetail.warehouseName ? '在该仓库' : ''}的流水记录</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">无符合筛选条件的记录</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
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
                  {filteredRows.map((row: any) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.displayDateTime ?? row.dateStr}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">{row.typeLabel}</span></td>
                      <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNumber}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{row.productName} <span className="text-slate-400 font-normal text-[10px]">{row.productSku}</span></td>
                      <td className="px-4 py-3 text-right font-black text-indigo-600">{row.quantity}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => onViewDetail(`${row.type}|${row.docNumber}`)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductFlowDetailModal);
