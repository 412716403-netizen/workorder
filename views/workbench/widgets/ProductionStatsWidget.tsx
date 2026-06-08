import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import WidgetShell from '../WidgetShell';
import { dashboard } from '../../../services/api/dashboard';
import { useAuth } from '../../../contexts/AuthContext';
import { dashboardQueryKey } from '../../../hooks/dashboardQueryKeys';

interface ProductionStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const ProductionStatsWidget: React.FC<ProductionStatsWidgetProps> = ({ editing, onRemove }) => {
  const { tenantCtx } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: dashboardQueryKey(tenantCtx?.tenantId, 'stats', 'production'),
    queryFn: () => dashboard.getStats({ days: 30 }),
    staleTime: 60_000,
    enabled: !!tenantCtx?.tenantId,
  });

  const prod = data?.production;

  return (
    <WidgetShell title="生产统计" editing={editing} onRemove={onRemove}>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : !prod ? (
        <p className="py-8 text-center text-sm text-slate-400">无生产模块权限</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="活跃工单" value={String(prod.activeOrders)} />
            <StatCard label="工序完成率" value={`${prod.completionRate}%`} />
            <StatCard label="已完成工序" value={`${prod.completedMilestones}/${prod.totalMilestones}`} />
          </div>
          {prod.trend.length > 0 && (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prod.trend}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => String(v).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip />
                  <Line type="monotone" dataKey="quantity" stroke="#10b981" strokeWidth={2} dot={false} name="报工数量" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </WidgetShell>
  );
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-emerald-50/80 px-3 py-2 text-center">
      <div className="text-lg font-black text-emerald-700">{value}</div>
      <div className="text-[10px] font-bold text-emerald-600/80">{label}</div>
    </div>
  );
}

export default ProductionStatsWidget;
