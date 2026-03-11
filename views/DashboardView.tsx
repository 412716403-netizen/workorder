
import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  Activity, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  CreditCard,
  Warehouse
} from 'lucide-react';
import { ProductionOrder, FinanceRecord, MilestoneStatus, Product, ProductionLinkMode } from '../types';

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
  // 1. 生产统计
  const activeOrders = orders.filter(o => o.status !== 'SHIPPED');
  const totalMilestones = orders.reduce((acc, curr) => acc + (curr.milestones?.length || 0), 0);
  const completedMilestones = orders.reduce((acc, curr) => 
    acc + (curr.milestones?.filter(m => m.status === MilestoneStatus.COMPLETED).length || 0), 0
  );
  const completionRate = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  // 2. 财务统计
  const totalReceipts = financeRecords.filter(r => r.type === 'RECEIPT').reduce((sum, r) => sum + r.amount, 0);
  const totalPayments = financeRecords.filter(r => r.type === 'PAYMENT').reduce((sum, r) => sum + r.amount, 0);
  const cashFlow = totalReceipts - totalPayments;

  // 3. 库存预警
  const lowStockCount = products.filter(p => {
    const ins = psiRecords.filter(r => r.type === 'PURCHASE_BILL' && r.productId === p.id).reduce((s, r) => s + r.quantity, 0);
    const outs = psiRecords.filter(r => r.type === 'SALES_BILL' && r.productId === p.id).reduce((s, r) => s + r.quantity, 0);
    return (100 + ins - outs) < 10;
  }).length;

  // 4. 图表数据
  const prodProgressData = orders.map(o => {
    const totalOrderQty = o.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const msCount = o.milestones?.length || 0;
    const progress = (totalOrderQty > 0 && msCount > 0) 
      ? Math.round((o.milestones.reduce((acc, m) => acc + (m.completedQuantity / totalOrderQty), 0) / msCount) * 100) 
      : 0;
    return { name: o.orderNumber, progress };
  });

  const financePieData = [
    { name: '累计收款', value: totalReceipts, color: '#6366f1' },
    { name: '累计支出', value: totalPayments, color: '#f43f5e' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">经营看板</h1>
          <p className="text-slate-500 mt-1 italic">集成财务收支、生产进度与进销存核心指标</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">系统实时结存</p>
          <p className="text-sm font-bold text-indigo-600">￥{cashFlow.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="活跃生产工单" 
          value={activeOrders.length} 
          subValue="WO"
          icon={Activity} 
          trend={12} 
          color="bg-indigo-600" 
        />
        <StatCard 
          title="累计财务收入" 
          value={`￥${totalReceipts.toLocaleString()}`} 
          icon={Receipt} 
          trend={5.4} 
          color="bg-emerald-500" 
        />
        <StatCard 
          title="低库存预警" 
          value={lowStockCount} 
          subValue="项物料"
          icon={Warehouse} 
          trend={-2} 
          color="bg-rose-500" 
        />
        <StatCard 
          title="节点完成率" 
          value={`${completionRate}%`} 
          icon={TrendingUp} 
          trend={8.2} 
          color="bg-amber-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              工单生产进度追踪 (%)
            </h2>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prodProgressData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px'}}
                />
                <Bar dataKey="progress" fill="#4f46e5" radius={[12, 12, 12, 12]} barSize={40}>
                   {prodProgressData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.progress >= 100 ? '#10b981' : '#4f46e5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            财务收支分布
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">基于收款单与付款单汇总</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={financePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {financePieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4 mt-6">
            {financePieData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: item.color}}></div>
                  <span className="text-sm font-bold text-slate-600">{item.name}</span>
                </div>
                <span className="text-sm font-black text-slate-900">￥{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
