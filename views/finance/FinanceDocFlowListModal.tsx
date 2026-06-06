import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, X, Filter, FileText, Loader2 } from 'lucide-react';
import type { FinanceCategory, FinanceRecord, Product } from '../../types';
import {
  fetchFinanceByFilter,
  dateInputToIsoStart,
  dateInputToFinanceEndInclusive,
  getTodayRangeIso,
  isoToDateInput,
} from '../production-ops/sharedFlowListHelpers';
import FlowListSummaryFooter from '../../components/flow/FlowListSummaryFooter';
import FlowListTableShell from '../../components/flow/FlowListTableShell';
import FlowListProductCell from '../../components/flow/FlowListProductCell';
import { fmtDT } from '../../utils/formatTime';
import {
  filterFinanceFlowRows,
  sumFinanceFlowTotals,
  FINANCE_FLOW_LABELS,
  FINANCE_FLOW_PARTNER_LABEL,
  type FinanceFlowRecordType,
} from './financeFlowHelpers';

export interface FinanceDocFlowListModalProps {
  recordType: FinanceFlowRecordType;
  open: boolean;
  onClose: () => void;
  onOpenDetail: (record: FinanceRecord) => void;
  products: Product[];
  financeCategories: FinanceCategory[];
}

const FinanceDocFlowListModal: React.FC<FinanceDocFlowListModalProps> = ({
  recordType,
  open,
  onClose,
  onOpenDetail,
  products,
  financeCategories,
}) => {
  const flowLabel = FINANCE_FLOW_LABELS[recordType];
  const partnerLabel = FINANCE_FLOW_PARTNER_LABEL[recordType];
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);
  const [dateFrom, setDateFrom] = useState(todayDate);
  const [dateTo, setDateTo] = useState(todayDate);
  const [filterDocNo, setFilterDocNo] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProduct, setFilterProduct] = useState('');

  const dateFromIso = dateInputToIsoStart(dateFrom);
  const dateToIso = dateInputToFinanceEndInclusive(dateTo);

  const flowQuery = useQuery({
    queryKey: ['flow.finance', recordType, dateFrom, dateTo],
    queryFn: () =>
      fetchFinanceByFilter({
        type: recordType,
        startDate: dateFromIso,
        endDate: dateToIso,
      }),
    enabled: open,
    staleTime: 15_000,
  });

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(
    () => new Map(financeCategories.map(c => [c.id, c])),
    [financeCategories],
  );

  const filteredRows = useMemo(() => {
    const records = flowQuery.data ?? [];
    const filtered = filterFinanceFlowRows(
      records,
      {
        docNo: filterDocNo,
        partner: filterPartner,
        operator: filterOperator,
        categoryKeyword: filterCategory,
        productKeyword: filterProduct,
      },
      productMap,
      categoryMap,
    );
    return [...filtered].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [
    flowQuery.data,
    filterDocNo,
    filterPartner,
    filterOperator,
    filterCategory,
    filterProduct,
    productMap,
    categoryMap,
  ]);

  const totals = useMemo(() => sumFinanceFlowTotals(filteredRows), [filteredRows]);
  const amountClass =
    recordType === 'RECEIPT' ? 'text-emerald-600 font-bold' : 'text-slate-900 font-bold';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        role="presentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-flow-title"
        className="relative bg-white w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-100">
          <h2
            id="finance-flow-title"
            className="text-base font-semibold text-slate-900 flex items-center gap-2"
          >
            <ScrollText className="w-5 h-5 text-indigo-600 shrink-0" /> {flowLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all shrink-0"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 px-5 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-500">
            <Filter className="w-3.5 h-3.5" /> 筛选
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
              <input
                type="text"
                value={filterDocNo}
                onChange={e => setFilterDocNo(e.target.value)}
                placeholder="模糊匹配"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">{partnerLabel}</label>
              <input
                type="text"
                value={filterPartner}
                onChange={e => setFilterPartner(e.target.value)}
                placeholder="模糊匹配"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">经办人</label>
              <input
                type="text"
                value={filterOperator}
                onChange={e => setFilterOperator(e.target.value)}
                placeholder="模糊匹配"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">收付款类型</label>
              <input
                type="text"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                placeholder="模糊匹配"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input
                type="text"
                value={filterProduct}
                onChange={e => setFilterProduct(e.target.value)}
                placeholder="名称/SKU"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
              />
            </div>
          </div>
          {flowQuery.isFetching && (
            <div className="mt-2 flex items-center gap-4">
              <span className="text-xs text-indigo-500 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                加载中
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col p-4">
          {flowQuery.isLoading ? (
            <p className="text-slate-500 text-center py-12">加载中…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无{flowLabel}记录</p>
          ) : (
            <FlowListTableShell
              className="flex-1 min-h-0"
              footer={
                <FlowListSummaryFooter
                  mode="bar"
                  count={totals.rowCount}
                  countSuffix="条"
                  metrics={[
                    {
                      label: '金额合计',
                      value: `¥${totals.totalAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`,
                      className: amountClass,
                    },
                  ]}
                />
              }
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                      添加日期
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                      单号
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                      收付款类型
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                      {partnerLabel}
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                      经办人
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                      产品
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">
                      金额
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center whitespace-nowrap">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(rec => {
                    const product = rec.productId ? productMap.get(rec.productId) : undefined;
                    const categoryName = rec.categoryId
                      ? categoryMap.get(rec.categoryId)?.name
                      : undefined;
                    return (
                      <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-xs font-medium text-slate-600 whitespace-nowrap">
                          {fmtDT(rec.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {rec.docNo || rec.id}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-600 whitespace-nowrap">
                          {categoryName || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {rec.partner || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-600 whitespace-nowrap">
                          {rec.operator || '—'}
                        </td>
                        <td className="px-4 py-3 min-w-[140px]">
                          {product ? (
                            <FlowListProductCell product={product} />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm whitespace-nowrap ${amountClass}`}>
                          ¥ {Number(rec.amount).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onOpenDetail(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all"
                          >
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
  );
};

export default React.memo(FinanceDocFlowListModal);
