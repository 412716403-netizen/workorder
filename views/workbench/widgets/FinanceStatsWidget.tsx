import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import { useAuth } from '../../../contexts/AuthContext';
import { hasPriceAmountModuleAccess } from '../../../utils/canViewAmount';
import { useDashboardStats } from '../../../hooks/useDashboardStats';
import { workbenchPeriodLabel, type WorkbenchOrderStatsPeriod } from '../../../types';
import {
  formatWorkbenchAmount,
  formatWorkbenchCount,
  WorkbenchKpiHero,
  WorkbenchKpiMetric,
  WorkbenchStatsHeaderExtra,
} from './WorkbenchKpiCard';

interface FinanceStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const FINANCE_THEME = {
  periodBorder: 'border-indigo-200',
  periodActive: 'bg-indigo-500',
  periodText: 'text-indigo-700',
} as const;

const FinanceStatsWidget: React.FC<FinanceStatsWidgetProps> = ({ editing, onRemove }) => {
  const [period, setPeriod] = useState<WorkbenchOrderStatsPeriod>('today');
  const { tenantCtx } = useAuth();
  const showAmount = hasPriceAmountModuleAccess(tenantCtx?.tenantRole, tenantCtx?.permissions);
  const { data, isLoading, isFetching, refetch } = useDashboardStats('finance', period);
  const fin = data?.finance;

  const headerExtra = (
    <WorkbenchStatsHeaderExtra
      period={period}
      onPeriodChange={setPeriod}
      theme={FINANCE_THEME}
      isFetching={isFetching}
      onRefresh={() => void refetch()}
    />
  );

  const cashFlowTone = useMemo(() => {
    if (!fin || !showAmount) return 'indigo' as const;
    if (fin.cashFlow > 0) return 'emerald' as const;
    if (fin.cashFlow < 0) return 'rose' as const;
    return 'indigo' as const;
  }, [fin, showAmount]);

  const heroHint = useMemo(() => {
    if (!fin) return undefined;
    return `收款 ${formatWorkbenchCount(fin.receiptCount)} 笔 · 付款 ${formatWorkbenchCount(fin.paymentCount)} 笔`;
  }, [fin]);

  return (
    <WidgetShell title="财务统计" editing={editing} onRemove={onRemove} headerExtra={headerExtra}>
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : !fin ? (
        <p className="py-10 text-center text-sm text-slate-400">无财务模块权限</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <WorkbenchKpiHero
            label={`${workbenchPeriodLabel(period)}净现金流`}
            value={formatWorkbenchAmount(fin.cashFlow, showAmount)}
            hint={heroHint}
            tone={cashFlowTone}
          />
          <div className="grid grid-cols-2 gap-3">
            <WorkbenchKpiMetric
              label={`${workbenchPeriodLabel(period)}收款`}
              value={formatWorkbenchAmount(fin.receiptAmount, showAmount)}
              sub={`${formatWorkbenchCount(fin.receiptCount)} 笔`}
              tone="emerald"
            />
            <WorkbenchKpiMetric
              label={`${workbenchPeriodLabel(period)}支出`}
              value={formatWorkbenchAmount(fin.paymentAmount, showAmount)}
              sub={`${formatWorkbenchCount(fin.paymentCount)} 笔`}
              tone="rose"
            />
          </div>
        </div>
      )}
    </WidgetShell>
  );
};

export default FinanceStatsWidget;
