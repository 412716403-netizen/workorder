import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, X, Filter, FileText, Loader2 } from 'lucide-react';
import type { Product, PsiRecordType, Warehouse } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { PSI_DOC_TYPE_AMOUNT_KEY, canViewAmount } from '../../utils/canViewAmount';
import {
  fetchPsiByFilter,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  getTodayRangeIso,
  isoToDateInput,
} from '../production-ops/sharedFlowListHelpers';
import FlowListSummaryFooter from '../../components/flow/FlowListSummaryFooter';
import FlowListTableShell from '../../components/flow/FlowListTableShell';
import FlowListProductCell from '../../components/flow/FlowListProductCell';
import {
  buildPsiOrderBillFlowSummaryRows,
  sortPsiOrderBillFlowRows,
  filterPsiOrderBillFlowRows,
  sumPsiOrderBillFlowTotals,
  PSI_ORDER_BILL_FLOW_LABELS,
  PURCHASE_ORDER_FLOW_STATUS_FILTER_OPTIONS,
  SALES_ORDER_FLOW_STATUS_FILTER_OPTIONS,
  PURCHASE_ORDER_FLOW_STATUS_BADGE_CLASS,
  SALES_ORDER_FLOW_STATUS_BADGE_CLASS,
  type PurchaseOrderLineFlowStatus,
  type SalesOrderLineFlowStatus,
} from './psiOrderBillFlowHelpers';

function OrderFlowStatusBadge({
  statusKey,
  label,
  recordType,
}: {
  statusKey?: PurchaseOrderLineFlowStatus | SalesOrderLineFlowStatus;
  label?: string;
  recordType: PsiRecordType;
}) {
  if (!statusKey || !label) return <span className="text-slate-400">—</span>;
  const cls =
    recordType === 'PURCHASE_ORDER'
      ? PURCHASE_ORDER_FLOW_STATUS_BADGE_CLASS[statusKey as PurchaseOrderLineFlowStatus]
      : SALES_ORDER_FLOW_STATUS_BADGE_CLASS[statusKey as SalesOrderLineFlowStatus];
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${cls ?? 'bg-slate-100 text-slate-600'}`}>
      {label}
    </span>
  );
}

const PARTNER_LABEL: Record<PsiRecordType, string> = {
  PURCHASE_ORDER: '供应商',
  PURCHASE_BILL: '供应商',
  SALES_ORDER: '客户',
  SALES_BILL: '客户',
};

export interface PsiOrderBillFlowListModalProps {
  recordType: PsiRecordType;
  open: boolean;
  onClose: () => void;
  onOpenDetail: (docNumber: string) => void;
  products: Product[];
  warehouses: Warehouse[];
  /** 采购订单流水：按行汇总已入库数量（来自采购入库单） */
  receivedByOrderLine?: Record<string, number>;
}

const PsiOrderBillFlowListModal: React.FC<PsiOrderBillFlowListModalProps> = ({
  recordType,
  open,
  onClose,
  onOpenDetail,
  products,
  warehouses,
  receivedByOrderLine,
}) => {
  const { tenantCtx } = useAuth();
  const showAmount = useMemo(() => {
    const key = PSI_DOC_TYPE_AMOUNT_KEY[recordType];
    return key ? canViewAmount(tenantCtx?.tenantRole, tenantCtx?.permissions, key) : true;
  }, [recordType, tenantCtx?.tenantRole, tenantCtx?.permissions]);

  const flowLabel = PSI_ORDER_BILL_FLOW_LABELS[recordType];
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);
  const [dateFrom, setDateFrom] = useState(todayDate);
  const [dateTo, setDateTo] = useState(todayDate);
  const [filterDocNo, setFilterDocNo] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const dateFromIso = dateInputToIsoStart(dateFrom);
  const dateToIso = dateInputToIsoEndExclusive(dateTo);
  const showWarehouse = recordType === 'PURCHASE_BILL' || recordType === 'SALES_BILL';
  const showOrderStatus = recordType === 'PURCHASE_ORDER' || recordType === 'SALES_ORDER';
  const isSalesBill = recordType === 'SALES_BILL';
  const partnerLabel = PARTNER_LABEL[recordType];
  const statusFilterOptions =
    recordType === 'PURCHASE_ORDER'
      ? PURCHASE_ORDER_FLOW_STATUS_FILTER_OPTIONS
      : recordType === 'SALES_ORDER'
        ? SALES_ORDER_FLOW_STATUS_FILTER_OPTIONS
        : [];

  const flowQuery = useQuery({
    queryKey: ['flow.psi', recordType, dateFrom, dateTo],
    queryFn: () =>
      fetchPsiByFilter({
        type: recordType,
        startDate: dateFromIso,
        endDate: dateToIso,
      }),
    enabled: open,
    staleTime: 15_000,
  });

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses]);

  const filteredRows = useMemo(() => {
    const records = flowQuery.data ?? [];
    const built = buildPsiOrderBillFlowSummaryRows(
      records,
      recordType,
      productMap,
      warehouseMap,
      recordType === 'PURCHASE_ORDER' ? receivedByOrderLine : undefined,
    );
    const sorted = sortPsiOrderBillFlowRows(built, recordType);
    return filterPsiOrderBillFlowRows(sorted, {
      docNo: filterDocNo,
      partner: filterPartner,
      product: filterProduct,
      status: showOrderStatus ? filterStatus : undefined,
    });
  }, [
    flowQuery.data,
    recordType,
    productMap,
    warehouseMap,
    receivedByOrderLine,
    filterDocNo,
    filterPartner,
    filterProduct,
    filterStatus,
    showOrderStatus,
  ]);

  const totals = useMemo(() => sumPsiOrderBillFlowTotals(filteredRows), [filteredRows]);

  const qtyClass =
    isSalesBill && totals.totalQty < 0 ? 'text-amber-600' : 'text-indigo-600';
  const amountClass =
    isSalesBill && totals.totalAmount < 0 ? 'text-amber-600' : 'text-emerald-600';


  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-indigo-600 shrink-0" /> {flowLabel}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
            <span className="text-[10px] text-slate-400">默认显示当天，扩大日期范围需手动改</span>
          </div>
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${showOrderStatus ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-3`}>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
              <input
                type="text"
                value={filterDocNo}
                onChange={e => setFilterDocNo(e.target.value)}
                placeholder="模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">{partnerLabel}</label>
              <input
                type="text"
                value={filterPartner}
                onChange={e => setFilterPartner(e.target.value)}
                placeholder="模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input
                type="text"
                value={filterProduct}
                onChange={e => setFilterProduct(e.target.value)}
                placeholder="模糊搜索"
                className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {showOrderStatus && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">状态</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                >
                  {statusFilterOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                      label: '数量',
                      value: `${totals.totalQty.toLocaleString()} 件`,
                      className: qtyClass,
                    },
                    ...(showAmount
                      ? [{
                          label: '金额',
                          value: `¥${totals.totalAmount.toFixed(2)}`,
                          className: amountClass,
                        }]
                      : []),
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
                      {partnerLabel}
                    </th>
                    {showWarehouse && (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                        仓库
                      </th>
                    )}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                      产品
                    </th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">
                      数量
                    </th>
                    {showAmount && (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">
                      金额
                    </th>
                    )}
                    {showOrderStatus && (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">
                        状态
                      </th>
                    )}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => {
                    const rowQtyNegative = isSalesBill && row.totalQty < 0;
                    const rowAmountNegative = isSalesBill && row.totalAmount < 0;
                    return (
                      <tr key={row.rowKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.dateStr}</td>
                        <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">
                          {row.docNumberDisplay}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">{row.partner}</td>
                        {showWarehouse && (
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.warehouseName}</td>
                        )}
                        <td className="px-4 py-3">
                          <FlowListProductCell
                            product={productMap.get(row.productId)}
                            name={row.productSummary}
                            sku={row.productSku}
                          />
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-black tabular-nums ${
                            rowQtyNegative ? 'text-amber-600' : 'text-indigo-600'
                          }`}
                        >
                          {row.totalQty.toLocaleString()}
                        </td>
                        {showAmount && (
                        <td
                          className={`px-4 py-3 text-right font-black tabular-nums ${
                            rowAmountNegative ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          ¥{row.totalAmount.toFixed(2)}
                        </td>
                        )}
                        {showOrderStatus && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <OrderFlowStatusBadge
                              statusKey={row.statusKey}
                              label={row.statusLabel}
                              recordType={recordType}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenDetail(row.docNumber)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
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

export default React.memo(PsiOrderBillFlowListModal);
