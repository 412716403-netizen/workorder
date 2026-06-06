import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpFromLine,
  Undo2,
  Truck,
  X,
  ScrollText,
  Filter,
  FileText,
  Loader2,
} from 'lucide-react';
import type { ProductionOpRecord, ProductionOrder, Product } from '../../types';
import { hasOpsPerm, type StockDocDetail } from './types';
import { formatLocalDateTimeZh, parseProductionOpTimestampMs, toLocalDateYmdFromProductionTimestamp } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import {
  fetchProductionByFilter,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  isoToDateInput,
  getTodayRangeIso,
} from './sharedFlowListHelpers';
import FlowListSummaryFooter from '../../components/flow/FlowListSummaryFooter';
import FlowListTableShell from '../../components/flow/FlowListTableShell';
import FlowListProductCell from '../../components/flow/FlowListProductCell';

type StockFlowBizType =
  | 'all'
  | 'ISSUE_INTERNAL'
  | 'RETURN_INTERNAL'
  | 'ISSUE_OUTSOURCE'
  | 'RETURN_OUTSOURCE';

function getStockFlowBizType(r: ProductionOpRecord): Exclude<StockFlowBizType, 'all'> {
  if (r.type === 'STOCK_OUT') return r.partner ? 'ISSUE_OUTSOURCE' : 'ISSUE_INTERNAL';
  return r.partner ? 'RETURN_OUTSOURCE' : 'RETURN_INTERNAL';
}

export interface StockFlowListModalProps {
  visible: boolean;
  onClose: () => void;
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
  orders,
  products,
  productionLinkMode,
  onOpenDocDetail,
  userPermissions,
  tenantRole,
}) => {
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);
  const [stockFlowFilterType, setStockFlowFilterType] = useState<StockFlowBizType>('all');
  const [stockFlowFilterOrderKeyword, setStockFlowFilterOrderKeyword] = useState('');
  const [stockFlowFilterProductKeyword, setStockFlowFilterProductKeyword] = useState('');
  const [stockFlowFilterDocNo, setStockFlowFilterDocNo] = useState('');
  const [stockFlowFilterDateFrom, setStockFlowFilterDateFrom] = useState(todayDate);
  const [stockFlowFilterDateTo, setStockFlowFilterDateTo] = useState(todayDate);

  const stockFlowQuery = useQuery({
    queryKey: ['flow.stock', stockFlowFilterDateFrom, stockFlowFilterDateTo],
    queryFn: () =>
      fetchProductionByFilter({
        types: 'STOCK_OUT,STOCK_RETURN',
        startDate: dateInputToIsoStart(stockFlowFilterDateFrom),
        endDate: dateInputToIsoEndExclusive(stockFlowFilterDateTo),
      }),
    enabled: visible,
    staleTime: 15_000,
  });
  const records = stockFlowQuery.data ?? [];

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

  const { filteredStockFlowRecords, totalIssueQty, totalReturnQty } = useMemo(() => {
    let list = stockFlowRecords;
    if (stockFlowFilterType !== 'all') list = list.filter(r => getStockFlowBizType(r) === stockFlowFilterType);
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
    // 服务端已按日期窗口窄拉；客户端再按 YMD 兜底确保边界精确（用户改输入框后视觉一致）
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
      lines: docRecords.map(r => ({
        productId: r.productId,
        quantity: r.quantity,
        ...(r.batchNo ? { batchNo: r.batchNo } : {}),
      })),
      reason: first.reason,
      operator: first.operator ?? '',
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
            <span className="text-[10px] text-slate-400">默认显示当天，扩大日期范围需手动改</span>
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
                onChange={e => setStockFlowFilterType(e.target.value as StockFlowBizType)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              >
                <option value="all">全部</option>
                <option value="ISSUE_INTERNAL">领料发出</option>
                <option value="RETURN_INTERNAL">生产退料</option>
                <option value="ISSUE_OUTSOURCE">外协领料发出</option>
                <option value="RETURN_OUTSOURCE">外协生产退料</option>
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
          {stockFlowQuery.isFetching && (
          <div className="mt-2 flex items-center gap-4">
              <span className="text-xs text-indigo-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />加载中</span>
          </div>
          )}
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-4">
          {stockFlowQuery.isLoading ? (
            <p className="text-slate-500 text-center py-12">加载中…</p>
          ) : filteredStockFlowRecords.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无领料/退料流水</p>
          ) : (
            <FlowListTableShell
              className="flex-1 min-h-0"
              footer={
                <FlowListSummaryFooter
                  mode="bar"
                  count={filteredStockFlowRecords.length}
                  metrics={[
                    { label: '领料', value: `${totalIssueQty} 件`, className: 'text-indigo-600' },
                    { label: '退料', value: `${totalReturnQty} 件`, className: 'text-amber-600' },
                    {
                      label: '净领料',
                      value: `${Math.round((totalIssueQty - totalReturnQty) * 100) / 100} 件`,
                      className: 'text-slate-700',
                    },
                  ]}
                />
              }
            >
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
                    const isOutsourceDispatch = rec.type === 'STOCK_OUT' && !!rec.partner;
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
                    const typeLabel = isOutsourceReturn
                      ? '外协生产退料'
                      : isReturn
                        ? '生产退料'
                        : isOutsourceDispatch
                          ? '外协领料发出'
                          : '领料发出';
                    const typeClass = isOutsourceReturn
                      ? 'bg-orange-100 text-orange-800'
                      : isReturn
                        ? 'bg-amber-100 text-amber-800'
                        : isOutsourceDispatch
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-indigo-100 text-indigo-800';
                    return (
                      <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{rec.docNo ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${typeClass}`}>
                            {isOutsourceReturn ? <Undo2 className="w-3 h-3" /> : isReturn ? <Undo2 className="w-3 h-3" /> : isOutsourceDispatch ? <Truck className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
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
                        <td className="px-4 py-3">
                          {productionLinkMode === 'product' && sourceProd ? (
                            <FlowListProductCell product={sourceProd} />
                          ) : (
                            <span className="text-[10px] font-black text-indigo-600">{linkCol}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <FlowListProductCell product={matProduct} emptyNameLabel="未知物料" />
                        </td>
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
                </tbody>
              </table>
            </FlowListTableShell>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(StockFlowListModal);
