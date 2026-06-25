import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, ArrowLeftRight, X, Clock, FileText, Search, CreditCard } from 'lucide-react';
import * as api from '../../services/api';
import {
  FinanceAccountType,
  FinanceCategory,
  FinanceOpType,
  FinanceRecord,
  Product,
  ProductionOrder,
  Worker,
  FINANCE_UNASSIGNED_ACCOUNT_KEY,
} from '../../types';
import type { PsiListPrintControllerHandle } from '../../components/psi/PsiListPrintPicker';
import { hasSubPermission } from '../../utils/hasSubPermission';
import { fmtDT } from '../../utils/formatTime';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import AccountTransferModal from './AccountTransferModal';
import AccountTypesModal from '../settings/AccountTypesModal';
import FinanceDetailModal from './FinanceDetailModal';

interface AccountBalancesTabProps {
  financeAccountTypes: FinanceAccountType[];
  userPermissions: string[] | null | undefined;
  onRefreshFinanceAccountTypes: () => Promise<void>;
  canViewAccountType: boolean;
  canCreateAccountType: boolean;
  canEditAccountType: boolean;
  canDeleteAccountType: boolean;
  orders: ProductionOrder[];
  financeCategories: FinanceCategory[];
  workers: Worker[];
  products: Product[];
}

/** 详情弹窗与收付款流水一致：按记录类型给出「收款单/付款单」及合作单位标签。 */
const DETAIL_BIZ_CONFIG: Record<FinanceOpType, { label: string; partnerLabel: string }> = {
  RECEIPT: { label: '收款单', partnerLabel: '缴款客户' },
  PAYMENT: { label: '付款单', partnerLabel: '收款单位/个人' },
  RECONCILIATION: { label: '财务对账', partnerLabel: '对账单位' },
  SETTLEMENT: { label: '工资单', partnerLabel: '领薪工人' },
};

const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DRILL_PAGE_SIZE = 50;

interface RecTransferInfo {
  transfer: boolean;
  counterpart?: string;
  direction?: string;
}

const readTransfer = (rec: FinanceRecord): RecTransferInfo => {
  const cd = rec.customData as Record<string, unknown> | undefined;
  return {
    transfer: cd?.transfer === true,
    counterpart: cd?.counterpartAccountName as string | undefined,
    direction: cd?.direction as string | undefined,
  };
};

const recCategoryName = (rec: FinanceRecord): string | undefined =>
  (rec as unknown as { category?: { name?: string } }).category?.name;

const recTypeLabel = (rec: FinanceRecord, t: RecTransferInfo): string => {
  if (t.transfer) return `账户转账（${t.direction === 'in' ? '转入' : '转出'}）`;
  return recCategoryName(rec) || (rec.type === 'RECEIPT' ? '收款单' : '付款单');
};

type PeriodKey = 'today' | 'week' | 'month' | 'all';

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];

/** 由期间枚举换算本地时间范围（ISO）；「全部」返回空，不带日期。周以周一为起点。 */
const periodRange = (period: PeriodKey): { startDate?: string; endDate?: string } => {
  if (period === 'all') return {};
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  } else if (period === 'month') {
    start.setDate(1);
  }
  return { startDate: start.toISOString(), endDate: now.toISOString() };
};

const AccountBalancesTab: React.FC<AccountBalancesTabProps> = ({
  financeAccountTypes,
  userPermissions,
  onRefreshFinanceAccountTypes,
  canViewAccountType,
  canCreateAccountType,
  canEditAccountType,
  canDeleteAccountType,
  orders,
  financeCategories,
  workers,
  products,
}) => {
  const qc = useQueryClient();
  const financeCatMap = useMemo(() => new Map(financeCategories.map(c => [c.id, c])), [financeCategories]);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const workerMap = useMemo(() => new Map(workers.map(w => [w.id, w])), [workers]);
  const printRef = useRef<PsiListPrintControllerHandle | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAccountTypes, setShowAccountTypes] = useState(false);
  const [drillAccountId, setDrillAccountId] = useState<string | null>(null);
  const [detailRec, setDetailRec] = useState<FinanceRecord | null>(null);
  const [drillSearch, setDrillSearch] = useState('');
  const debouncedDrillSearch = useDebouncedValue(drillSearch.trim(), 300);

  const openDrill = (id: string) => {
    setDrillSearch('');
    setDrillAccountId(id);
  };

  const canTransfer = hasSubPermission(userPermissions, 'finance:transfer:create');

  const balancesQuery = useQuery({
    queryKey: ['finance', 'account-balances', period],
    queryFn: () => api.finance.accountBalances(periodRange(period)),
    staleTime: 15_000,
  });

  const drillQuery = useQuery({
    queryKey: ['finance', 'account-ledger', drillAccountId, debouncedDrillSearch, period],
    queryFn: () => api.finance.listPage({
      accountTypeId: drillAccountId!,
      page: 1,
      pageSize: DRILL_PAGE_SIZE,
      search: debouncedDrillSearch || undefined,
      ...periodRange(period),
    }),
    enabled: !!drillAccountId,
    staleTime: 15_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['finance', 'account-balances'] });
    qc.invalidateQueries({ queryKey: ['finance', 'account-ledger'] });
    qc.invalidateQueries({ queryKey: ['finance', 'list'] });
  };

  const data = balancesQuery.data;
  const accounts = data?.accounts ?? [];
  const totals = data?.totals;
  const unassigned = data?.unassigned;
  const hasUnassigned = !!unassigned && (unassigned.inflow !== 0 || unassigned.outflow !== 0);

  const drillAccountName =
    drillAccountId === FINANCE_UNASSIGNED_ACCOUNT_KEY
      ? '未归账'
      : accounts.find(a => a.accountTypeId === drillAccountId)?.name ?? '';
  const drillRecords = (drillQuery.data?.data as FinanceRecord[] | undefined) ?? [];

  return (
    <div className="px-1 py-4 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-800">资金账户余额</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100">
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  period === p.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {canViewAccountType && (
            <button
              type="button"
              onClick={() => setShowAccountTypes(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              账户类型
            </button>
          )}
          {canTransfer && (
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
            >
              <ArrowLeftRight className="w-4 h-4" />
              账户转账
            </button>
          )}
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{period === 'all' ? '期初合计' : '期初余额'}</p>
            <p className="text-lg font-bold text-slate-700 mt-1">{fmtMoney(totals.openingBalance)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{period === 'all' ? '累计流入' : '本期流入'}</p>
            <p className="text-lg font-bold text-emerald-600 mt-1">{fmtMoney(totals.inflow)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{period === 'all' ? '累计流出' : '本期流出'}</p>
            <p className="text-lg font-bold text-rose-600 mt-1">{fmtMoney(totals.outflow)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">当前余额合计</p>
            <p className="text-lg font-bold text-indigo-600 mt-1">{fmtMoney(totals.balance)}</p>
          </div>
        </div>
      )}

      {balancesQuery.isLoading ? (
        <p className="py-12 text-center text-slate-400 text-sm">加载中…</p>
      ) : accounts.length === 0 && !hasUnassigned ? (
        <p className="py-12 text-center text-slate-400 text-sm">暂无收支账户类型，请先在「设置 - 收支账户类型」中添加</p>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => (
            <button
              key={acc.accountTypeId}
              type="button"
              onClick={() => openDrill(acc.accountTypeId)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 truncate">{acc.name}</span>
                  {acc.accountKind && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{acc.accountKind}</span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  期初 {fmtMoney(acc.openingBalance)} · 流入 {fmtMoney(acc.inflow)} · 流出 {fmtMoney(acc.outflow)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-400">当前余额</p>
                <p className={`text-lg font-bold ${acc.balance < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmtMoney(acc.balance)}</p>
              </div>
            </button>
          ))}
          {hasUnassigned && (
            <button
              type="button"
              onClick={() => openDrill(FINANCE_UNASSIGNED_ACCOUNT_KEY)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 truncate">未归账</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">未选账户</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  流入 {fmtMoney(unassigned!.inflow)} · 流出 {fmtMoney(unassigned!.outflow)} · 未计入账户余额
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-400">净额</p>
                <p className="text-lg font-bold text-slate-800">{fmtMoney(unassigned!.inflow - unassigned!.outflow)}</p>
              </div>
            </button>
          )}
        </div>
      )}

      {showTransfer && (
        <AccountTransferModal
          financeAccountTypes={financeAccountTypes}
          onClose={() => setShowTransfer(false)}
          onSuccess={invalidate}
        />
      )}

      {showAccountTypes && (
        <AccountTypesModal
          financeAccountTypes={financeAccountTypes}
          onRefreshFinanceAccountTypes={async () => {
            await onRefreshFinanceAccountTypes();
            invalidate();
          }}
          onClose={() => setShowAccountTypes(false)}
          canCreate={canCreateAccountType}
          canEdit={canEditAccountType}
          canDelete={canDeleteAccountType}
        />
      )}

      {drillAccountId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDrillAccountId(null)} />
          <div className="relative bg-white w-full max-w-5xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/80 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800 truncate">{drillAccountName} · 账户流水</h2>
                {!drillQuery.isLoading && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    共 {drillQuery.data?.total ?? drillRecords.length} 条
                    {(drillQuery.data?.total ?? 0) > DRILL_PAGE_SIZE && ` · 仅显示最近 ${DRILL_PAGE_SIZE} 条`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={drillSearch}
                    onChange={e => setDrillSearch(e.target.value)}
                    placeholder="搜索单号 / 单位 / 备注"
                    className="w-56 pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>
                <button type="button" onClick={() => setDrillAccountId(null)} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1">
              {drillQuery.isLoading ? (
                <p className="py-20 text-center text-slate-400 text-sm">加载中…</p>
              ) : drillRecords.length === 0 ? (
                <p className="py-20 text-center text-slate-300 italic text-sm">
                  {debouncedDrillSearch ? '无匹配项，请调整搜索关键词' : '该账户暂无流水记录'}
                </p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">业务时间</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">单据编号</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">单据类型</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">合作单位/对方</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">收入</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">支出</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {drillRecords.map(rec => {
                      const isReceipt = rec.type === 'RECEIPT';
                      const t = readTransfer(rec);
                      const counterparty = t.transfer ? (t.counterpart || '—') : (rec.partner || '—');
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-slate-300" />
                              <span className="text-xs font-bold text-slate-600">{fmtDT(rec.timestamp)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap"><span className="text-xs font-bold text-slate-800">{rec.docNo || rec.id}</span></td>
                          <td className="px-6 py-4 whitespace-nowrap"><span className="text-xs font-bold text-slate-600">{recTypeLabel(rec, t)}</span></td>
                          <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm font-bold text-slate-800">{counterparty}</span></td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <span className="text-sm font-black text-emerald-600">{isReceipt ? `+${fmtMoney(rec.amount)}` : '—'}</span>
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <span className="text-sm font-black text-rose-600">{isReceipt ? '—' : `-${fmtMoney(rec.amount)}`}</span>
                          </td>
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setDetailRec(rec)}
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
              )}
            </div>
          </div>
        </div>
      )}

      {detailRec && (
        <FinanceDetailModal
          detailRecord={detailRec}
          onClose={() => setDetailRec(null)}
          fillFormFromRecord={() => {}}
          setEditingRecordId={() => {}}
          setShowModal={() => {}}
          setDetailRecord={target => setDetailRec((target as FinanceRecord | null) ?? null)}
          canEdit={false}
          canDelete={false}
          confirm={async () => false}
          showListPrintButton={false}
          canView={false}
          financeListPrintRef={printRef}
          orders={orders}
          productMap={productMap}
          workerMap={workerMap}
          globalNodes={[]}
          categories={[]}
          financeCatMap={financeCatMap}
          bizConfig={DETAIL_BIZ_CONFIG}
          current={DETAIL_BIZ_CONFIG[detailRec.type]}
          type={detailRec.type}
        />
      )}
    </div>
  );
};

export default React.memo(AccountBalancesTab);
