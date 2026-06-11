import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import { useAuth } from '../../../contexts/AuthContext';
import { canViewAmount, AMOUNT_PERMISSION_KEYS } from '../../../utils/canViewAmount';
import { useDashboardStats } from '../../../hooks/useDashboardStats';
import { workbenchPeriodLabel, type WorkbenchOrderStatsPeriod } from '../../../types';
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
  const [period, setPeriod] = useState<WorkbenchOrderStatsPeriod>('today');
  const { tenantCtx } = useAuth();
  const showAmount = canViewAmount(
    tenantCtx?.tenantRole,
    tenantCtx?.permissions,
    AMOUNT_PERMISSION_KEYS.PSI_SALES_BILL,
  );
  const { data, isLoading, isFetching, refetch } = useDashboardStats('sales', period);
  const sales = data?.sales;

  const headerExtra = (
    <WorkbenchStatsHeaderExtra
      period={period}
      onPeriodChange={setPeriod}
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
    <WidgetShell title="销售统计" editing={editing} onRemove={onRemove} headerExtra={headerExtra}>
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : !sales ? (
        <p className="py-10 text-center text-sm text-slate-400">无进销存模块权限</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <WorkbenchKpiHero
            label={`${workbenchPeriodLabel(period)}销售额`}
            value={formatWorkbenchAmount(sales.salesAmount, showAmount)}
            hint={heroHint}
            tone="sky"
          />
          <div className="grid grid-cols-3 gap-3">
            <WorkbenchKpiMetric
              label="销售单数"
              value={formatWorkbenchCount(sales.salesBillCount)}
              sub="出库单"
            />
            <WorkbenchKpiMetric
              label="销售件数"
              value={formatWorkbenchCount(sales.salesQuantity)}
              sub="出库数量"
              tone="emerald"
            />
            <WorkbenchKpiMetric
              label={`${workbenchPeriodLabel(period)}退货`}
              value={formatWorkbenchCount(sales.salesReturnQuantity)}
              sub="销售退货件数"
              tone={sales.salesReturnQuantity > 0 ? 'amber' : 'default'}
            />
          </div>
        </div>
      )}
    </WidgetShell>
  );
};

export default SalesStatsWidget;
