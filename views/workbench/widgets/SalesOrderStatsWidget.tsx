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

interface SalesOrderStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const SALES_ORDER_THEME = {
  periodBorder: 'border-indigo-200',
  periodActive: 'bg-indigo-500',
  periodText: 'text-indigo-700',
} as const;

const SalesOrderStatsWidget: React.FC<SalesOrderStatsWidgetProps> = ({ editing, onRemove }) => {
  const [period, setPeriod] = useState<WorkbenchOrderStatsPeriod>('today');
  const { tenantCtx } = useAuth();
  const showAmount = canViewAmount(
    tenantCtx?.tenantRole,
    tenantCtx?.permissions,
    AMOUNT_PERMISSION_KEYS.PSI_SALES_ORDER,
  );
  const { data, isLoading, isFetching, refetch } = useDashboardStats('salesOrder', period);
  const salesOrder = data?.salesOrder;

  const headerExtra = (
    <WorkbenchStatsHeaderExtra
      period={period}
      onPeriodChange={setPeriod}
      theme={SALES_ORDER_THEME}
      isFetching={isFetching}
      onRefresh={() => void refetch()}
    />
  );

  const heroHint = useMemo(() => {
    if (!salesOrder) return undefined;
    return `${formatWorkbenchCount(salesOrder.salesOrderCount)} 单 · ${formatWorkbenchCount(salesOrder.salesOrderQuantity)} 件`;
  }, [salesOrder]);

  return (
    <WidgetShell title="销售订单统计" editing={editing} onRemove={onRemove} headerExtra={headerExtra}>
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : !salesOrder ? (
        <p className="py-10 text-center text-sm text-slate-400">无进销存模块权限</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <WorkbenchKpiHero
            label={`${workbenchPeriodLabel(period)}订单额`}
            value={formatWorkbenchAmount(salesOrder.salesOrderAmount, showAmount)}
            hint={heroHint}
            tone="indigo"
          />
          <div className="grid grid-cols-3 gap-3">
            <WorkbenchKpiMetric
              label="订单数"
              value={formatWorkbenchCount(salesOrder.salesOrderCount)}
              sub="销售订单"
            />
            <WorkbenchKpiMetric
              label="订单件数"
              value={formatWorkbenchCount(salesOrder.salesOrderQuantity)}
              sub="订购数量"
              tone="emerald"
            />
            <WorkbenchKpiMetric
              label={`${workbenchPeriodLabel(period)}减单`}
              value={formatWorkbenchCount(salesOrder.salesOrderReduceQuantity)}
              sub="负数量件数"
              tone={salesOrder.salesOrderReduceQuantity > 0 ? 'amber' : 'default'}
            />
          </div>
        </div>
      )}
    </WidgetShell>
  );
};

export default SalesOrderStatsWidget;
