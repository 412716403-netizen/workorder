import React, { useState, useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { X, Filter, FileText, ScrollText } from 'lucide-react';
import { Warehouse } from '../../types';

const WAREHOUSE_FLOW_TYPES = ['PURCHASE_BILL', 'SALES_BILL', 'TRANSFER', 'STOCKTAKE', 'STOCK_IN', 'STOCK_RETURN', 'STOCK_OUT'] as const;
const warehouseFlowTypeLabel: Record<string, string> = { PURCHASE_BILL: '采购入库', SALES_BILL: '销售出库', SALES_RETURN: '销售退货', TRANSFER: '调拨', STOCKTAKE: '盘点', STOCK_IN: '生产入库', STOCK_RETURN: '生产退料', STOCK_OUT: '领料发出' };

export interface WarehouseFlowModalProps {
  open: boolean;
  onClose: () => void;
  warehouseFlowRows: any[];
  warehouses: Warehouse[];
  onViewDetail: (key: string) => void;
}

const WarehouseFlowModal: React.FC<WarehouseFlowModalProps> = ({
  open,
  onClose,
  warehouseFlowRows,
  warehouses,
  onViewDetail,
}) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flowType, setFlowType] = useState<string>('all');
  const [flowWarehouse, setFlowWarehouse] = useState<string>('all');
  const [docNo, setDocNo] = useState('');
  const [product, setProduct] = useState('');

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
          <div className="mt-2 flex items-center gap-4">
            <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setFlowType('all'); setFlowWarehouse('all'); setDocNo(''); setProduct(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
            <span className="text-xs text-slate-400">共 {filteredRows.length} 条</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {filteredRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无仓库流水记录</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <TableVirtuoso
                style={{ height: Math.min(filteredRows.length * 48 + 48, 520) }}
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
                itemContent={(_idx, row) => (
                  <>
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
