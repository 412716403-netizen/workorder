import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import { dashboard } from '../../../services/api/dashboard';
import { useAuth } from '../../../contexts/AuthContext';
import { hasPriceAmountModuleAccess } from '../../../utils/canViewAmount';
import { dashboardQueryKey } from '../../../hooks/dashboardQueryKeys';

interface FinanceStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const FinanceStatsWidget: React.FC<FinanceStatsWidgetProps> = ({ editing, onRemove }) => {
  const { tenantCtx } = useAuth();
  const showAmount = hasPriceAmountModuleAccess(tenantCtx?.tenantRole, tenantCtx?.permissions);

  const { data, isLoading } = useQuery({
    queryKey: dashboardQueryKey(tenantCtx?.tenantId, 'stats', 'finance'),
    queryFn: () => dashboard.getStats(),
    staleTime: 60_000,
    enabled: !!tenantCtx?.tenantId,
  });

  const fin = data?.finance;

  return (
    <WidgetShell title="财务统计" editing={editing} onRemove={onRemove}>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : !fin ? (
        <p className="py-8 text-center text-sm text-slate-400">无财务模块权限</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="累计收款"
            value={showAmount ? `¥${fin.totalReceipt.toLocaleString()}` : '***'}
            tone="emerald"
          />
          <StatCard
            label="累计支出"
            value={showAmount ? `¥${fin.totalPayment.toLocaleString()}` : '***'}
            tone="rose"
          />
          <StatCard
            label="现金流"
            value={showAmount ? `¥${fin.cashFlow.toLocaleString()}` : '***'}
            tone="indigo"
          />
        </div>
      )}
    </WidgetShell>
  );
};

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'indigo';
}) {
  const bg = {
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  }[tone];
  return (
    <div className={`rounded-xl px-3 py-3 text-center ${bg}`}>
      <div className="text-sm font-black">{value}</div>
      <div className="text-[10px] font-bold opacity-80">{label}</div>
    </div>
  );
}

export default FinanceStatsWidget;
