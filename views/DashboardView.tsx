import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import {
  Activity,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Warehouse,
} from 'lucide-react';
import { dashboard } from '../services/api';
import { moduleHeaderRowClass, pageSubtitleClass, pageTitleClass } from '../styles/uiDensity';

const DashboardCharts = lazy(() => import('../components/DashboardCharts'));

const ChartsFallback = () => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div className="lg:col-span-2 flex h-80 items-center justify-center rounded-[40px] border border-slate-200 bg-white text-sm text-slate-400">
      图表加载中…
    </div>
    <div className="flex h-80 items-center justify-center rounded-[40px] border border-slate-200 bg-white text-sm text-slate-400">
      图表加载中…
    </div>
  </div>
);

interface DashboardStats {
  production: { activeOrders: number; completionRate: number };
  finance: { totalReceipts: number; totalPayments: number; cashFlow: number };
  lowStockCount: number;
  orderProgress: { orderId: string; orderNumber: string; productName: string; progress: number }[];
}

const StatCard = ({ title, value, icon: Icon, trend, color, subValue }: any) => (
  <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-all group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10 group-hover:scale-110 transition-transform`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      {trend !== undefined && (
        <span className={`flex items-center text-xs font-bold ${trend >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
    <div className="flex items-baseline gap-2 mt-1">
      <p className="text-2xl font-black text-slate-900">{value}</p>
      {subValue && <span className="text-xs text-slate-400 font-bold">{subValue}</span>}
    </div>
  </div>
);

const DashboardView: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const data = await dashboard.getStats() as DashboardStats;
      setStats(data);
    } catch (e) {
      console.error('Dashboard stats fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading || !stats) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className={moduleHeaderRowClass}>
          <div>
            <h1 className={pageTitleClass}>经营看板</h1>
            <p className={pageSubtitleClass}>加载中…</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { production, finance, lowStockCount, orderProgress } = stats;
  const prodProgressData = orderProgress.map(o => ({ name: o.orderNumber, progress: o.progress }));
  const financePieData = [
    { name: '累计收款', value: finance.totalReceipts, color: '#6366f1' },
    { name: '累计支出', value: finance.totalPayments, color: '#f43f5e' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>经营看板</h1>
          <p className={pageSubtitleClass}>集成财务收支、生产进度与进销存核心指标</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">系统实时结存</p>
          <p className="text-sm font-bold text-indigo-600">￥{finance.cashFlow.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="活跃生产工单"
          value={production.activeOrders}
          subValue="WO"
          icon={Activity}
          color="bg-indigo-600"
        />
        <StatCard
          title="累计财务收入"
          value={`￥${finance.totalReceipts.toLocaleString()}`}
          icon={Receipt}
          color="bg-emerald-500"
        />
        <StatCard
          title="低库存预警"
          value={lowStockCount}
          subValue="项物料"
          icon={Warehouse}
          color="bg-rose-500"
        />
        <StatCard
          title="节点完成率"
          value={`${production.completionRate}%`}
          icon={TrendingUp}
          color="bg-amber-500"
        />
      </div>

      <Suspense fallback={<ChartsFallback />}>
        <DashboardCharts prodProgressData={prodProgressData} financePieData={financePieData} />
      </Suspense>
    </div>
  );
};

export default React.memo(DashboardView);
