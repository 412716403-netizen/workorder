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
  Pie,
} from 'recharts';
import { Activity, CreditCard } from 'lucide-react';

export type ProdProgressRow = { name: string; progress: number };
export type FinancePieRow = { name: string; value: number; color: string };

interface DashboardChartsProps {
  prodProgressData: ProdProgressRow[];
  financePieData: FinancePieRow[];
}

/** 经营看板图表区：单独打包以便与 recharts 一并按需加载 */
const DashboardCharts: React.FC<DashboardChartsProps> = ({ prodProgressData, financePieData }) => (
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
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
            <Tooltip
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }}
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
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-sm font-bold text-slate-600">{item.name}</span>
            </div>
            <span className="text-sm font-black text-slate-900">￥{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default React.memo(DashboardCharts);
