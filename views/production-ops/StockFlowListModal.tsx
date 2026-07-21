import React, { useState, useMemo, useEffect } from 'react';
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
import { ModalPortal } from '../../components/ModalPortal';
import {
  type StockFlowBizType,
  type StockFlowInitialSeed,
  STOCK_FLOW_BIZ_TYPE_LABEL,
  getStockFlowBizType,
  getStockFlowTypeLabel,
  sortStockFlowRecordsByDoc,
  buildStockDocDetailFromRecords,
} from './stockFlowListUtils';

export type { StockFlowInitialSeed } from './stockFlowListUtils';

export interface StockFlowListModalProps {
  visible: boolean;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  productionLinkMode: 'order' | 'product';
  onOpenDocDetail: (detail: StockDocDetail, docRecords?: ProductionOpRecord[]) => void;
  userPermissions?: string[];
  tenantRole?: string;
  /** 从工单详情等入口打开时预填筛选（含 orderIds 服务端窄拉） */
  initialSeed?: StockFlowInitialSeed | null;
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
  initialSeed = null,
}) => {
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);
  const [stockFlowFilterType, setStockFlowFilterType] = useState<StockFlowBizType>('all');
  const [stockFlowFilterOrderKeyword, setStockFlowFilterOrderKeyword] = useState('');
  const [stockFlowFilterProductKeyword, setStockFlowFilterProductKeyword] = useState('');
  const [stockFlowFilterDocNo, setStockFlowFilterDocNo] = useState('');
  const [stockFlowFilterPartner, setStockFlowFilterPartner] = useState('');
  const [stockFlowFilterDateFrom, setStockFlowFilterDateFrom] = useState(todayDate);
  const [stockFlowFilterDateTo, setStockFlowFilterDateTo] = useState(todayDate);
  const [scopedOrderIds, setScopedOrderIds] = useState('');
  const [scopedSourceProductId, setScopedSourceProductId] = useState('');
  /** 入口限定的业务类型（如返工物料入口只看返工领料/退料）；null 表示不限 */
  const [restrictedBizTypes, setRestrictedBizTypes] = useState<Exclude<StockFlowBizType, 'all'>[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (initialSeed) {
      const scoped = !!(initialSeed.orderIds || initialSeed.sourceProductId);
      setStockFlowFilterOrderKeyword(initialSeed.orderKeyword ?? initialSeed.productKeyword ?? '');
      setStockFlowFilterProductKeyword('');
      setStockFlowFilterDocNo('');
      setStockFlowFilterPartner('');
      setStockFlowFilterType('all');
      setStockFlowFilterDateFrom(initialSeed.dateFrom ?? (scoped ? '' : todayDate));
      setStockFlowFilterDateTo(initialSeed.dateTo ?? (scoped ? '' : todayDate));
      setScopedOrderIds(initialSeed.orderIds ?? '');
      setScopedSourceProductId(initialSeed.sourceProductId ?? '');
      setRestrictedBizTypes(initialSeed.onlyBizTypes?.length ? initialSeed.onlyBizTypes : null);
    } else {
      setStockFlowFilterOrderKeyword('');
      setStockFlowFilterProductKeyword('');
      setStockFlowFilterDocNo('');
      setStockFlowFilterPartner('');
      setStockFlowFilterType('all');
      setStockFlowFilterDateFrom(todayDate);
      setStockFlowFilterDateTo(todayDate);
      setScopedOrderIds('');
      setScopedSourceProductId('');
      setRestrictedBizTypes(null);
    }
  }, [visible, initialSeed, todayDate]);

  const stockFlowQuery = useQuery({
    queryKey: [
      'flow.stock',
      stockFlowFilterDateFrom,
      stockFlowFilterDateTo,
      scopedOrderIds,
      scopedSourceProductId,
    ],
    queryFn: () => {
      const params: Parameters<typeof fetchProductionByFilter>[0] = {
        types: 'STOCK_OUT,STOCK_RETURN',
      };
      const startDate = dateInputToIsoStart(stockFlowFilterDateFrom);
      const endDate = dateInputToIsoEndExclusive(stockFlowFilterDateTo);
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (scopedOrderIds) params.orderIds = scopedOrderIds;
      if (scopedSourceProductId) params.sourceProductIds = scopedSourceProductId;
      return fetchProductionByFilter(params);
    },
    enabled: visible,
    staleTime: 15_000,
  });
  const records = stockFlowQuery.data ?? [];

  const stockFlowRecords = useMemo(() => sortStockFlowRecordsByDoc(records), [records]);

  const { filteredStockFlowRecords, totalIssueQty, totalReturnQty } = useMemo(() => {
    let list = stockFlowRecords;
    if (restrictedBizTypes) list = list.filter(r => restrictedBizTypes.includes(getStockFlowBizType(r)));
    if (stockFlowFilterType !== 'all') list = list.filter(r => getStockFlowBizType(r) === stockFlowFilterType);
    if (stockFlowFilterOrderKeyword.trim() && !scopedOrderIds) {
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
    if (stockFlowFilterPartner.trim()) {
      const kw = stockFlowFilterPartner.trim().toLowerCase();
      list = list.filter(r => ((r.partner ?? '').toLowerCase()).includes(kw));
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
    };
  }, [
    stockFlowRecords,
    restrictedBizTypes,
    stockFlowFilterType,
    stockFlowFilterOrderKeyword,
    stockFlowFilterProductKeyword,
    stockFlowFilterDocNo,
    stockFlowFilterPartner,
    stockFlowFilterDateFrom,
    stockFlowFilterDateTo,
    scopedOrderIds,
    orders,
    products,
    productionLinkMode,
  ]);

  const buildStockDocDetailFromDocNo = (docNo: string): StockDocDetail | null =>
    buildStockDocDetailFromRecords(docNo, stockFlowRecords);

  const restrictedHint = restrictedBizTypes
    ? `；仅显示${restrictedBizTypes.map(t => STOCK_FLOW_BIZ_TYPE_LABEL[t]).join('/')}`
    : '';
  const filterHint = (scopedOrderIds || scopedSourceProductId
    ? '已按当前工单/产品窄拉，不限日期；可手动补充日期或其它筛选项'
    : '默认显示当天，扩大日期范围需手动改') + restrictedHint;

  if (!visible) return null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[88] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative z-10 bg-white w-full max-w-6xl max-h-[min(92vh,960px)] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 领料退料流水</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
            <span className="text-[10px] text-slate-400">{filterHint}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
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
                {(restrictedBizTypes ??
                  (Object.keys(STOCK_FLOW_BIZ_TYPE_LABEL) as Exclude<StockFlowBizType, 'all'>[])
                ).map(t => (
                  <option key={t} value={t}>{STOCK_FLOW_BIZ_TYPE_LABEL[t]}</option>
                ))}
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
                  disabled={!!scopedOrderIds}
                  className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-500"
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
                  disabled={!!scopedSourceProductId}
                  className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-500"
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
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">外协工厂</label>
              <input
                type="text"
                value={stockFlowFilterPartner}
                onChange={e => setStockFlowFilterPartner(e.target.value)}
                placeholder="模糊搜索"
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
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockFlowRecords.map(rec => {
                    const order = orders.find(o => o.id === rec.orderId);
                    const matProduct = products.find(p => p.id === rec.productId);
                    const sourceProd = rec.sourceProductId ? products.find(p => p.id === rec.sourceProductId) : null;
                    const bizType = getStockFlowBizType(rec);
                    const isReturn = rec.type === 'STOCK_RETURN';
                    const isOutsourceDispatch = bizType === 'ISSUE_OUTSOURCE';
                    const isOutsourceReturn = bizType === 'RETURN_OUTSOURCE';
                    const docNo = rec.docNo ?? '';
                    const openDetail = () => {
                      if (!docNo) return;
                      const detail = buildStockDocDetailFromDocNo(docNo);
                      if (detail) {
                        const docRecords = stockFlowRecords.filter(r => r.docNo === docNo && r.type === detail.type);
                        onOpenDocDetail(detail, docRecords);
                      }
                    };
                    const linkCol =
                      productionLinkMode === 'product'
                        ? sourceProd?.name ?? (rec.orderId ? order?.orderNumber ?? '—' : '—')
                        : rec.orderId
                          ? order?.orderNumber ?? '—'
                          : matProduct?.name ?? '—';
                    const typeLabel = getStockFlowTypeLabel(rec);
                    const typeClass = bizType === 'ISSUE_REWORK'
                      ? 'bg-purple-100 text-purple-800'
                      : bizType === 'RETURN_REWORK'
                        ? 'bg-rose-100 text-rose-800'
                        : isOutsourceReturn
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
    </ModalPortal>
  );
};

export default React.memo(StockFlowListModal);
