import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import { dashboard } from '../../../services/api/dashboard';
import { useAuth } from '../../../contexts/AuthContext';
import { canViewAmount, AMOUNT_PERMISSION_KEYS } from '../../../utils/canViewAmount';
import { dashboardQueryKey } from '../../../hooks/dashboardQueryKeys';

interface SalesStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const SalesStatsWidget: React.FC<SalesStatsWidgetProps> = ({ editing, onRemove }) => {
  const { tenantCtx } = useAuth();
  const showAmount = canViewAmount(
    tenantCtx?.tenantRole,
    tenantCtx?.permissions,
    AMOUNT_PERMISSION_KEYS.PSI_SALES_BILL,
  );

  const { data, isLoading } = useQuery({
    queryKey: dashboardQueryKey(tenantCtx?.tenantId, 'stats', 'sales'),
    queryFn: () => dashboard.getStats(),
    staleTime: 60_000,
    enabled: !!tenantCtx?.tenantId,
  });

  const sales = data?.sales;

  return (
    <WidgetShell title="销售统计" editing={editing} onRemove={onRemove}>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : !sales ? (
        <p className="py-8 text-center text-sm text-slate-400">无进销存模块权限</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="本月销售单" value={String(sales.monthBillCount)} />
          <StatCard
            label="本月销售额"
            value={showAmount ? `¥${sales.monthAmount.toLocaleString()}` : '***'}
          />
          <StatCard label="库存预警" value={`${sales.lowStockCount} 种`} accent="amber" />
          <StatCard
            label="本月采购入库"
            value={showAmount ? `¥${sales.purchaseMonthAmount.toLocaleString()}` : '***'}
          />
        </div>
      )}
    </WidgetShell>
  );
};

function StatCard({
  label,
  value,
  accent = 'sky',
}: {
  label: string;
  value: string;
  accent?: 'sky' | 'amber';
}) {
  const cls = accent === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700';
  return (
    <div className={`rounded-xl px-3 py-3 ${cls}`}>
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] font-bold opacity-80">{label}</div>
    </div>
  );
}

export default SalesStatsWidget;
