
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  History,
  ArrowUpCircle,
  FileText,
  Check,
  X,
  ChevronDown,
  User,
  Layers,
  Cpu,
  Users
} from 'lucide-react';
import { ProductionOrder, MilestoneStatus, Milestone, Product, AppDictionaries, Worker, Equipment } from '../types';
import { STATUS_COLORS } from '../constants';

interface OrderDetailViewProps {
  orders: ProductionOrder[];
  products: Product[];
  dictionaries: AppDictionaries;
  workers: Worker[];
  equipment: Equipment[];
  onReportSubmit: (orderId: string, milestoneId: string, quantity: number, customData: any, variantId?: string) => void;
  onAssignResources?: (orderId: string, milestoneId: string, workerIds: string[], equipmentIds: string[]) => void;
}

const OrderDetailView: React.FC<OrderDetailViewProps> = ({ 
  orders, products, dictionaries, workers, equipment, onReportSubmit 
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const order = orders.find(o => o.id === id);
  const product = products.find(p => p.id === order?.productId);

  const [reportingMsId, setReportingMsId] = useState<string | null>(null);
  
  const [reportForm, setReportForm] = useState<{ quantity: number; variantId: string; customData: Record<string, any> }>({
    quantity: 0,
    variantId: '',
    customData: {}
  });

  const [expandedReports, setExpandedReports] = useState<string | null>(null);

  const orderTotalQty = useMemo(() => order?.items.reduce((s, i) => s + i.quantity, 0) || 0, [order]);

  if (!order) return <div className="p-8 text-center text-slate-500 font-bold">工单未找到</div>;

  const handleOpenReport = (m: Milestone) => {
    setReportingMsId(m.id);
    const initialData: any = {};
    m.reportTemplate.forEach(f => {
      initialData[f.id] = f.type === 'boolean' ? false : '';
    });
    setReportForm({
      quantity: 0,
      variantId: order.items.length === 1 ? (order.items[0].variantId || '') : '',
      customData: initialData
    });
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    setReportForm(prev => ({ ...prev, customData: { ...prev.customData, [fieldId]: value } }));
  };

  const submitReport = (msId: string) => {
    onReportSubmit(order.id, msId, reportForm.quantity, reportForm.customData, reportForm.variantId || undefined);
    setReportingMsId(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm">
        <ArrowLeft className="w-4 h-4" /> 返回工单管理
      </button>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
        <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order.orderNumber}</span>
              <span className="text-xs font-bold text-slate-400">● {order.customer}</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">{order.productName}</h1>
          </div>
          <div className="flex items-center gap-6 mt-4 md:mt-0 py-4 px-6 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">主 SKU</p>
              <p className="text-sm font-bold text-slate-800">{order.sku}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">工单总量</p>
              <p className="text-sm font-bold text-indigo-600">{orderTotalQty} PCS</p>
            </div>
          </div>
        </div>

        {/* 规格进度明细 */}
        {order.items.length > 1 && (
            <div className="mb-10 space-y-4">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5" /> 规格完工明细
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {order.items.map((item, idx) => {
                        const variant = product?.variants.find(v => v.id === item.variantId);
                        const progress = Math.round((item.completedQuantity / item.quantity) * 100);
                        return (
                            <div key={idx} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-black text-slate-700">{variant?.skuSuffix || '默认规格'}</span>
                                    <span className="text-[10px] font-black text-indigo-600">{progress}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                                    <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold text-slate-400">
                                    <span>完成 / 计划</span>
                                    <span>{item.completedQuantity} / {item.quantity}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        )}

        <div className="space-y-8 relative">
          <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-100"></div>
          {order.milestones.map((ms, idx) => (
            <div key={ms.id} className="relative flex gap-8">
              <div className={`relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm transition-all ${
                ms.status === MilestoneStatus.COMPLETED ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white border-2 border-slate-100 text-slate-300'
              }`}>
                {ms.status === MilestoneStatus.COMPLETED ? <Check className="w-6 h-6" /> : idx + 1}
              </div>

              <div className="flex-1 p-6 rounded-3xl border border-slate-100 bg-white hover:border-indigo-200 transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h4 className="text-xl font-bold text-slate-900">{ms.name}</h4>
                    <div className="flex items-center gap-3 mt-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block ${STATUS_COLORS[ms.status]}`}>
                        {ms.status}
                        </span>
                        {(ms.assignedWorkerIds?.length || 0) > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase">
                                <Users className="w-3 h-3" /> 已派发人员
                            </span>
                        )}
                        {(ms.assignedEquipmentIds?.length || 0) > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded uppercase">
                                <Cpu className="w-3 h-3" /> 已预定设备
                            </span>
                        )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ms.status !== MilestoneStatus.COMPLETED && (
                        <button 
                        onClick={() => handleOpenReport(ms)}
                        className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center gap-2"
                        >
                        <ArrowUpCircle className="w-4 h-4" /> 节点报工
                        </button>
                    )}
                  </div>
                </div>

                {/* 派发详情只读展示 */}
                {(ms.assignedWorkerIds?.length || 0 + (ms.assignedEquipmentIds?.length || 0)) > 0 && (
                   <div className="mb-6 flex flex-wrap gap-4 text-[10px] font-bold text-slate-400">
                      {ms.assignedWorkerIds?.map(wid => (
                         <span key={wid} className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                           <User className="w-2.5 h-2.5" /> {workers.find(w=>w.id===wid)?.name}
                         </span>
                      ))}
                      {ms.assignedEquipmentIds?.map(eid => (
                         <span key={eid} className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                           <Cpu className="w-2.5 h-2.5" /> {equipment.find(e=>e.id===eid)?.name}
                         </span>
                      ))}
                   </div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">总体节点进度</span>
                  <span className="text-xs font-bold text-slate-800">{ms.completedQuantity} / {orderTotalQty}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${(ms.completedQuantity / orderTotalQty) * 100}%` }}></div>
                </div>

                {reportingMsId === ms.id && (
                  <div className="mt-6 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center justify-between mb-6">
                      <h5 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-indigo-600" /> 填写报工单内容</h5>
                      <button onClick={() => setReportingMsId(null)}><X className="w-4 h-4 text-slate-400" /></button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {order.items.length > 1 && (
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">报工规格项</label>
                          <select 
                            value={reportForm.variantId} 
                            onChange={(e) => setReportForm({...reportForm, variantId: e.target.value})}
                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold outline-none appearance-none"
                          >
                            <option value="">请选择报工规格...</option>
                            {order.items.map(item => {
                                const v = product?.variants.find(x => x.id === item.variantId);
                                return <option key={item.variantId} value={item.variantId}>{v?.skuSuffix} (剩余待办: {item.quantity - item.completedQuantity})</option>
                            })}
                          </select>
                        </div>
                      )}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">本次完成数量</label>
                        <input type="number" value={reportForm.quantity} onChange={(e) => setReportForm({...reportForm, quantity: parseInt(e.target.value)||0})} className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      {ms.reportTemplate.map(field => (
                        <div key={field.id} className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">{field.label} {field.required && <span className="text-rose-500">*</span>}</label>
                          {field.type === 'text' && <input type="text" value={reportForm.customData[field.id]} onChange={(e) => handleFieldChange(field.id, e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none" />}
                          {field.type === 'number' && <input type="number" value={reportForm.customData[field.id]} onChange={(e) => handleFieldChange(field.id, e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none" />}
                          {field.type === 'select' && (
                            <select value={reportForm.customData[field.id]} onChange={(e) => handleFieldChange(field.id, e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none">
                              <option value="">请选择...</option>
                              {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          )}
                          {field.type === 'boolean' && (
                            <div className="flex items-center gap-3 py-1">
                              <button onClick={() => handleFieldChange(field.id, !reportForm.customData[field.id])} className={`w-10 h-5 rounded-full relative transition-colors ${reportForm.customData[field.id] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${reportForm.customData[field.id] ? 'left-5.5' : 'left-0.5'}`}></div>
                              </button>
                              <span className="text-[10px] font-bold text-slate-500">{reportForm.customData[field.id] ? '是' : '否'}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 flex justify-end gap-3 border-t border-indigo-100/50 pt-4">
                      <button onClick={() => submitReport(ms.id)} disabled={reportForm.quantity <= 0 || (order.items.length > 1 && !reportForm.variantId)} className="bg-indigo-600 text-white px-8 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"><Check className="w-4 h-4" /> 确认提交</button>
                    </div>
                  </div>
                )}

                {ms.reports.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-50">
                    <button onClick={() => setExpandedReports(expandedReports === ms.id ? null : ms.id)} className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
                      <History className="w-3 h-3" /> 历史报工详情 ({ms.reports.length}) <ChevronDown className={`w-3 h-3 transition-transform ${expandedReports === ms.id ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedReports === ms.id && (
                      <div className="mt-4 space-y-3 animate-in slide-in-from-top-2">
                        {ms.reports.slice().reverse().map(r => {
                          const v = product?.variants.find(x => x.id === r.variantId);
                          return (
                            <div key={r.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-slate-400 border border-slate-200"><User className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-800">{r.operator} {v && <span className="text-indigo-500 ml-1">[{v.skuSuffix}]</span>}</p>
                                        <p className="text-[9px] text-slate-400">{r.timestamp}</p>
                                    </div>
                                </div>
                                <span className="text-xs font-black text-indigo-600">+{r.quantity} PCS</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                {Object.entries(r.customData).map(([key, val]) => (
                                    <div key={key} className="bg-white/50 px-2 py-1 rounded-lg">
                                    <span className="text-[8px] text-slate-400 block font-bold uppercase">{key}</span>
                                    <span className="text-xs font-bold text-slate-700">{typeof val === 'boolean' ? (val?'是':'否') : val}</span>
                                    </div>
                                ))}
                                </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailView;
