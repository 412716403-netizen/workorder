import React, { useState, useMemo } from 'react';
import {
  ArrowUpFromLine,
  Undo2,
  Truck,
  X,
  ScrollText,
  Filter,
  FileText,
} from 'lucide-react';
import type { ProductionOpRecord, ProductionOrder, Product } from '../../types';
import { hasOpsPerm, type StockDocDetail } from './types';
import { formatLocalDateTimeZh, parseProductionOpTimestampMs, toLocalDateYmdFromProductionTimestamp } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';

export interface StockFlowListModalProps {
  visible: boolean;
  onClose: () => void;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  productionLinkMode: 'order' | 'product';
  onOpenDocDetail: (detail: StockDocDetail) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const StockFlowListModal: React.FC<StockFlowListModalProps> = ({
  visible,
  onClose,
  records,
  orders,
  products,
  productionLinkMode,
  onOpenDocDetail,
  userPermissions,
  tenantRole,
}) => {
  const [stockFlowFilterType, setStockFlowFilterType] = useState<'all' | 'STOCK_OUT' | 'STOCK_RETURN'>('all');
  const [stockFlowFilterOrderKeyword, setStockFlowFilterOrderKeyword] = useState('');
  const [stockFlowFilterProductKeyword, setStockFlowFilterProductKeyword] = useState('');
  const [stockFlowFilterDocNo, setStockFlowFilterDocNo] = useState('');
  const [stockFlowFilterDateFrom, setStockFlowFilterDateFrom] = useState('');
  const [stockFlowFilterDateTo, setStockFlowFilterDateTo] = useState('');

  /** 按单据号聚合：整张单按组内最早时间倒序，单内明细按 id 稳定序 */
  const stockFlowRecords = useMemo(() => {
    const list = records.filter(r => r.type === 'STOCK_OUT' || r.type === 'STOCK_RETURN');
    const byDoc = new Map<string, ProductionOpRecord[]>();
    for (const r of list) {
      const k = (r.docNo && String(r.docNo).trim()) ? String(r.docNo) : r.id;
      if (!byDoc.has(k)) byDoc.set(k, []);
      byDoc.get(k)!.push(r);
    }
    const entries = [...byDoc.entries()].sort(([ka, ra], [kb, rb]) => {
      const da = flowRecordsEarliestMs(ra);
      const db = flowRecordsEarliestMs(rb);
      if (db !== da) return db - da;
      return ka.localeCompare(kb);
    });
    return entries.flatMap(([, rs]) => [...rs].sort((a, b) => (a.id || '').localeCompare(b.id || '')));
  }, [records]);

  const { filteredStockFlowRecords, totalIssueQty, totalReturnQty, countIssue, countReturn } = useMemo(() => {
    let list = stockFlowRecords;
    if (stockFlowFilterType !== 'all') list = list.filter(r => r.type === stockFlowFilterType);
    if (stockFlowFilterOrderKeyword.trim()) {
      const kw = stockFlowFilterOrderKeyword.trim().toLowerCase();
      if (productionLinkMode === 'product') {
        list = list.filter(r => {
          const sp = r.sourceProductId ? products.find(x => x.id === r.sourceProductId) : null;
          const name = (sp?.name ?? '').toLowerCase();
          const id = (r.sourceProductId ?? '').toLowerCase();
          return name.includes(kw) || id.includes(kw);
        });
      } else {
        list = list.filter(r => {
          const o = orders.find(x => x.id === r.orderId);
          const orderNum = (o?.orderNumber ?? '').toLowerCase();
          const orderId = (r.orderId ?? '').toLowerCase();
          return orderNum.includes(kw) || orderId.includes(kw);
        });
      }
    }
    if (stockFlowFilterProductKeyword.trim()) {
      const kw = stockFlowFilterProductKeyword.trim().toLowerCase();
      list = list.filter(r => {
        const p = products.find(x => x.id === r.productId);
        const name = (p?.name ?? '').toLowerCase();
        const productId = (r.productId ?? '').toLowerCase();
        return name.includes(kw) || productId.includes(kw);
      });
    }
    if (stockFlowFilterDocNo.trim()) {
      const kw = stockFlowFilterDocNo.trim().toLowerCase();
      list = list.filter(r => ((r.docNo ?? '').toLowerCase()).includes(kw));
    }
    if (stockFlowFilterDateFrom) {
      const from = stockFlowFilterDateFrom;
      list = list.filter(r => {
        const d = r.timestamp ? toLocalDateYmdFromProductionTimestamp(r.timestamp) : '';
        return d >= from;
      });
    }
    if (stockFlowFilterDateTo) {
      const to = stockFlowFilterDateTo;
      list = list.filter(r => {
        const d = r.timestamp ? toLocalDateYmdFromProductionTimestamp(r.timestamp) : '';
        return d <= to;
      });
    }
    const issueList = list.filter(r => r.type === 'STOCK_OUT');
    const returnList = list.filter(r => r.type === 'STOCK_RETURN');
    const totalIssueQty = issueList.reduce((s, r) => s + r.quantity, 0);
    const totalReturnQty = returnList.reduce((s, r) => s + r.quantity, 0);
    return {
      filteredStockFlowRecords: list,
      totalIssueQty,
      totalReturnQty,
      countIssue: issueList.length,
      countReturn: returnList.length
    };
  }, [stockFlowRecords, stockFlowFilterType, stockFlowFilterOrderKeyword, stockFlowFilterProductKeyword, stockFlowFilterDocNo, stockFlowFilterDateFrom, stockFlowFilterDateTo, orders, products, productionLinkMode]);

  const buildStockDocDetailFromDocNo = (docNo: string): StockDocDetail | null => {
    const docRecords = stockFlowRecords.filter(r => r.docNo === docNo);
    if (docRecords.length === 0) return null;
    const first = docRecords[0];
    return {
      docNo,
      type: first.type as 'STOCK_OUT' | 'STOCK_RETURN',
      orderId: first.orderId ?? '',
      sourceProductId: first.sourceProductId,
      timestamp: first.timestamp,
      warehouseId: first.warehouseId ?? '',
      lines: docRecords.map(r => ({ productId: r.productId, quantity: r.quantity })),
      reason: first.reason,
      operator: '',
      partner: first.partner,
    };
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 领料退料流水</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input
                type="date"
                value={stockFlowFilterDateFrom}
                onChange={e => setStockFlowFilterDateFrom(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input
                type="date"
                value={stockFlowFilterDateTo}
                onChange={e => setStockFlowFilterDateTo(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
              <select
                value={stockFlowFilterType}
                onChange={e => setStockFlowFilterType(e.target.value as 'all' | 'STOCK_OUT' | 'STOCK_RETURN')}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="all">全部</option>
                <option value="STOCK_OUT">领料</option>
                <option value="STOCK_RETURN">退料</option>
              </select>
            </div>
            {productionLinkMode !== 'product' ? (
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">工单</label>
                <input
                  type="text"
                  value={stockFlowFilterOrderKeyword}
                  onChange={e => setStockFlowFilterOrderKeyword(e.target.value)}
                  placeholder="工单号模糊搜索"
                  className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">关联产品</label>
                <input
                  type="text"
                  value={stockFlowFilterOrderKeyword}
                  onChange={e => setStockFlowFilterOrderKeyword(e.target.value)}
                  placeholder="成品名称模糊搜索"
                  className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">物料</label>
              <input
                type="text"
                value={stockFlowFilterProductKeyword}
                onChange={e => setStockFlowFilterProductKeyword(e.target.value)}
                placeholder="物料名称模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
              <input
                type="text"
                value={stockFlowFilterDocNo}
                onChange={e => setStockFlowFilterDocNo(e.target.value)}
                placeholder="LL/TL 模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => { setStockFlowFilterType('all'); setStockFlowFilterOrderKeyword(''); setStockFlowFilterProductKeyword(''); setStockFlowFilterDocNo(''); setStockFlowFilterDateFrom(''); setStockFlowFilterDateTo(''); }}
              className="text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              清空筛选
            </button>
            <span className="text-xs text-slate-400">共 {filteredStockFlowRecords.length} 条</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {filteredStockFlowRecords.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无领料/退料流水</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据号</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">业务时间</th>
                    {productionLinkMode !== 'product' ? (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单</th>
                    ) : (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">关联产品</th>
                    )}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">物料</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">原因/备注</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockFlowRecords.map(rec => {
                    const order = orders.find(o => o.id === rec.orderId);
                    const matProduct = products.find(p => p.id === rec.productId);
                    const sourceProd = rec.sourceProductId ? products.find(p => p.id === rec.sourceProductId) : null;
                    const isReturn = rec.type === 'STOCK_RETURN';
                    const isCollabReturn = rec.type === 'STOCK_OUT' && rec.operator === '协作回传出库';
                    const isOutsourceDispatch = rec.type === 'STOCK_OUT' && !!rec.partner && !isCollabReturn;
                    const isOutsourceReturn = rec.type === 'STOCK_RETURN' && !!rec.partner;
                    const docNo = rec.docNo ?? '';
                    const openDetail = () => {
                      if (!docNo) return;
                      const detail = buildStockDocDetailFromDocNo(docNo);
                      if (detail) onOpenDocDetail(detail);
                    };
                    const linkCol =
                      productionLinkMode === 'product'
                        ? sourceProd?.name ?? (rec.orderId ? order?.orderNumber ?? '—' : '—')
                        : rec.orderId
                          ? order?.orderNumber ?? '—'
                          : matProduct?.name ?? '—';
                    const typeLabel = isCollabReturn ? '协作回传' : isOutsourceReturn ? '外退' : isReturn ? '退料' : isOutsourceDispatch ? '外发' : '领料';
                    const typeClass = isCollabReturn ? 'bg-emerald-100 text-emerald-800' : isOutsourceReturn ? 'bg-orange-100 text-orange-800' : isReturn ? 'bg-amber-100 text-amber-800' : isOutsourceDispatch ? 'bg-teal-100 text-teal-800' : 'bg-indigo-100 text-indigo-800';
                    return (
                      <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{rec.docNo ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${typeClass}`}>
                            {isCollabReturn ? <Truck className="w-3 h-3" /> : isOutsourceReturn ? <Undo2 className="w-3 h-3" /> : isReturn ? <Undo2 className="w-3 h-3" /> : isOutsourceDispatch ? <Truck className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                            {typeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {(() => {
                            const ms = parseProductionOpTimestampMs(rec.timestamp);
                            if (ms > 0) return formatLocalDateTimeZh(new Date(ms));
                            const raw = rec.timestamp?.trim();
                            return raw || '—';
                          })()}
                        </td>
                        <td className="px-4 py-3 text-[10px] font-black text-indigo-600">{linkCol}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{matProduct?.name ?? '未知物料'}</td>
                        <td className="px-4 py-3 text-right font-black text-indigo-600">{rec.quantity}</td>
                        <td className="px-4 py-3 text-xs font-bold text-teal-700 whitespace-nowrap">{rec.partner ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{rec.reason ?? '—'}</td>
                        <td className="px-4 py-3">
                          {docNo && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:view') ? (
                            <button
                              type="button"
                              onClick={openDetail}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                            >
                              <FileText className="w-3.5 h-3.5" /> 详情
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                    <td className="px-4 py-3" colSpan={10}>
                      <span className="text-[10px] text-slate-500 uppercase mr-3">合计</span>
                      <span className="text-xs text-indigo-600">领料 {countIssue} 条，{totalIssueQty}</span>
                      <span className="text-slate-300 mx-2">|</span>
                      <span className="text-xs text-amber-600">退料 {countReturn} 条，{totalReturnQty}</span>
                      <span className="text-slate-300 mx-2">|</span>
                      <span className="text-xs text-slate-700">净领料 {Math.round((totalIssueQty - totalReturnQty) * 100) / 100}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(StockFlowListModal);
