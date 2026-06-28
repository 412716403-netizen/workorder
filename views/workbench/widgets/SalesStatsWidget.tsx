import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import { useAuth } from '../../../contexts/AuthContext';
import { canViewAmount, AMOUNT_PERMISSION_KEYS } from '../../../utils/canViewAmount';
import { useWorkbenchPageFullAccess } from '../WorkbenchPageAccessContext';
import { useDashboardStats } from '../../../hooks/useDashboardStats';
import { useWorkbenchPeriodFilter } from '../../../hooks/useWorkbenchPeriodFilter';
import {
  formatWorkbenchAmount,
  formatWorkbenchCount,
  WorkbenchKpiHero,
  WorkbenchKpiMetric,
  WorkbenchStatsHeaderExtra,
} from './WorkbenchKpiCard';

interface SalesStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const SALES_THEME = {
  periodBorder: 'border-sky-200',
  periodActive: 'bg-sky-500',
  periodText: 'text-sky-700',
} as const;

const SalesStatsWidget: React.FC<SalesStatsWidgetProps> = ({ editing, onRemove }) => {
  const periodState = useWorkbenchPeriodFilter('today');
  const {
    periodTab,
    setPeriodTab,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filter,
    periodLabel,
    customRangeInvalid,
    headerShellProps,
  } = periodState;
  const { tenantCtx } = useAuth();
  const fullAccess = useWorkbenchPageFullAccess();
  const showAmount =
    fullAccess
    || canViewAmount(
      tenantCtx?.tenantRole,
      tenantCtx?.permissions,
      AMOUNT_PERMISSION_KEYS.PSI_SALES_BILL,
    );
  const { data, isLoading, isFetching, refetch } = useDashboardStats('sales', filter);
  const sales = data?.sales;

  const headerExtra = (
    <WorkbenchStatsHeaderExtra
      periodTab={periodTab}
      onPeriodTabChange={setPeriodTab}
      customStart={customStart}
      customEnd={customEnd}
      onCustomStartChange={setCustomStart}
      onCustomEndChange={setCustomEnd}
      theme={SALES_THEME}
      isFetching={isFetching}
      onRefresh={() => void refetch()}
    />
  );

  const heroHint = useMemo(() => {
    if (!sales) return undefined;
    return `${formatWorkbenchCount(sales.salesBillCount)} 单 · ${formatWorkbenchCount(sales.salesQuantity)} 件`;
  }, [sales]);

  return (
    <WidgetShell
      title="销售统计"
      editing={editing}
      onRemove={onRemove}
      headerExtra={headerExtra}
      {...headerShellProps}
    >
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : !sales ? (
        <p className="py-10 text-center text-sm text-slate-400">无进销存模块权限</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <WorkbenchKpiHero
            label={`${periodLabel}销售额`}
            value={formatWorkbenchAmount(sales.salesAmount, showAmount)}
            hint={heroHint}
            tone="sky"
          />
          <div className="grid grid-cols-3 gap-3">
            <WorkbenchKpiMetric label="销售单数" value={formatWorkbenchCount(sales.salesBillCount)} sub="出库单" />
            <WorkbenchKpiMetric
              label="销售件数"
              value={formatWorkbenchCount(sales.salesQuantity)}
              sub="出库数量"
              tone="emerald"
            />
            <WorkbenchKpiMetric
              label={`${periodLabel}退货`}
              value={formatWorkbenchCount(sales.salesReturnQuantity)}
              sub="销售退货件数"
              tone={sales.salesReturnQuantity > 0 ? 'amber' : 'default'}
            />
          </div>
          {customRangeInvalid && (
            <p className="text-center text-[10px] text-rose-500">结束日期不能早于开始</p>
          )}
        </div>
      )}
    </WidgetShell>
  );
};

export default SalesStatsWidget;
