import React, { useMemo, Suspense, lazy } from 'react';
import {
  Activity,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Warehouse,
} from 'lucide-react';
import { ProductionOrder, FinanceRecord, MilestoneStatus, Product, ProductionLinkMode } from '../types';
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

interface DashboardViewProps {
  orders: ProductionOrder[];
  financeRecords: FinanceRecord[];
  psiRecords: any[];
  products: Product[];
  productionLinkMode?: ProductionLinkMode;
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

const DashboardView: React.FC<DashboardViewProps> = ({ orders, financeRecords, psiRecords, products, productionLinkMode = 'order' }) => {
  const dashStats = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== 'SHIPPED');
    let totalMilestones = 0, completedMilestones = 0;
    for (const o of orders) {
      const ms = o.milestones;
      if (!ms) continue;
      totalMilestones += ms.length;
      for (const m of ms) { if (m.status === MilestoneStatus.COMPLETED) completedMilestones++; }
    }
    const completionRate = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    let totalReceipts = 0, totalPayments = 0;
    for (const r of financeRecords) {
      if (r.type === 'RECEIPT') totalReceipts += r.amount;
      else if (r.type === 'PAYMENT') totalPayments += r.amount;
    }

    const stockByProduct = new Map<string, number>();
    for (const r of psiRecords) {
      const pid = r.productId;
      if (!pid) continue;
      const qty = Number(r.quantity) || 0;
      if (r.type === 'PURCHASE_BILL') stockByProduct.set(pid, (stockByProduct.get(pid) || 0) + qty);
      else if (r.type === 'SALES_BILL') stockByProduct.set(pid, (stockByProduct.get(pid) || 0) - qty);
    }
    let lowStockCount = 0;
    for (const p of products) { if ((stockByProduct.get(p.id) || 0) < 10) lowStockCount++; }

    const prodProgressData = orders.map(o => {
      const totalOrderQty = o.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
      const msCount = o.milestones?.length || 0;
      const progress = (totalOrderQty > 0 && msCount > 0)
        ? Math.round((o.milestones.reduce((acc, m) => acc + (m.completedQuantity / totalOrderQty), 0) / msCount) * 100)
        : 0;
      return { name: o.orderNumber, progress };
    });

    return { activeOrders, totalMilestones, completedMilestones, completionRate, totalReceipts, totalPayments, cashFlow: totalReceipts - totalPayments, lowStockCount, prodProgressData };
  }, [orders, financeRecords, psiRecords, products]);

  const { activeOrders, completionRate, totalReceipts, totalPayments, cashFlow, lowStockCount, prodProgressData } = dashStats;

  const financePieData = [
    { name: '累计收款', value: totalReceipts, color: '#6366f1' },
    { name: '累计支出', value: totalPayments, color: '#f43f5e' },
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
          <p className="text-sm font-bold text-indigo-600">￥{cashFlow.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="活跃生产工单" 
          value={activeOrders.length} 
          subValue="WO"
          icon={Activity} 
          color="bg-indigo-600" 
        />
        <StatCard 
          title="累计财务收入" 
          value={`￥${totalReceipts.toLocaleString()}`} 
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
          value={`${completionRate}%`} 
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
