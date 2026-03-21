import React, { useMemo } from 'react';
import { toast } from 'sonner';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Trash2, ClipboardList } from 'lucide-react';
import { ProductionOrder, Product, OrderFormSettings, ProductionOpRecord, ProductionLinkMode } from '../types';

interface OrderDetailViewProps {
  productionLinkMode?: ProductionLinkMode;
  orders: ProductionOrder[];
  products: Product[];
  prodRecords: ProductionOpRecord[];
  dictionaries: { colors?: { id: string; name: string }[]; sizes?: { id: string; name: string }[]; units?: { id: string; name: string }[] };
  workers?: { id: string; name: string }[];
  equipment?: { id: string; name: string }[];
  orderFormSettings?: OrderFormSettings;
  onReportSubmit?: (orderId: string, milestoneId: string, quantity: number, customData: any, variantId?: string) => void;
  onDeleteOrder?: (orderId: string) => void;
}

const OrderDetailView: React.FC<OrderDetailViewProps> = ({
  orders, products, prodRecords, orderFormSettings, onDeleteOrder, productionLinkMode
}) => {
  const showInDetail = (id: string) => orderFormSettings?.standardFields.find(f => f.id === id)?.showInDetail ?? true;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const order = orders.find(o => o.id === id);
  const product = products.find(p => p.id === order?.productId);

  const orderTotalQty = useMemo(() => order?.items.reduce((s, i) => s + i.quantity, 0) || 0, [order]);

  if (!order) return <div className="p-8 text-center text-slate-500 font-bold">工单未找到</div>;

  const handleDelete = () => {
    if (!onDeleteOrder) return;
    if (productionLinkMode !== 'product') {
      const hasReport = order.milestones.some(m => m.completedQuantity > 0 || (m.reports?.length ?? 0) > 0);
      if (hasReport) {
        toast.error('该工单已有报工记录，不允许删除。');
        return;
      }
      const relatedRecords = prodRecords.filter(r => r.orderId === order.id);
      if (relatedRecords.length > 0) {
        toast.error(`该工单存在 ${relatedRecords.length} 条关联单据（领料出库/外协/返工/报损/生产入库），请先在相关模块删除后再试。`);
        return;
      }
      const childOrders = orders.filter(o => o.parentOrderId === order.id);
      if (childOrders.length > 0) {
        toast.error(`该工单存在 ${childOrders.length} 条子工单，请先删除子工单后再试。`);
        return;
      }
    }
    if (window.confirm(`确定要删除工单「${order.orderNumber}」吗？此操作不可恢复。`)) {
      onDeleteOrder(order.id);
      navigate('/production', { state: { tab: 'orders' } });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/production', { state: { tab: 'orders' } })} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm">
          <ArrowLeft className="w-4 h-4" /> 返回工单管理
        </button>
        {onDeleteOrder && (
          <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold transition-all border border-rose-200">
            <Trash2 className="w-4 h-4" /> 删除工单
          </button>
        )}
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
        <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              {showInDetail('orderNumber') && <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order.orderNumber}</span>}
              {showInDetail('customer') && order.customer && <span className="text-xs font-bold text-slate-400">● {order.customer}</span>}
            </div>
            <h1 className="text-3xl font-bold text-slate-900">{order.productName}</h1>
          </div>
          <div className="flex items-center gap-6 mt-4 md:mt-0 py-4 px-6 bg-slate-50 rounded-2xl border border-slate-100 flex-wrap">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">产品编号</p>
              <p className="text-sm font-bold text-slate-800">{order.sku}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">工单总量</p>
              <p className="text-sm font-bold text-indigo-600">{orderTotalQty} PCS</p>
            </div>
            {showInDetail('dueDate') && (
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">交期</p>
                <p className="text-sm font-bold text-slate-800">{order.dueDate}</p>
              </div>
            )}
            {showInDetail('startDate') && order.startDate && (
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">开始日期</p>
                <p className="text-sm font-bold text-slate-800">{order.startDate}</p>
              </div>
            )}
          </div>
        </div>

        {/* 工单明细 */}
        <div className="space-y-4">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Layers className="w-3.5 h-3.5" /> 工单明细
          </h4>
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">序号</th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">规格</th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">数量</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => {
                  const variant = product?.variants.find(v => v.id === item.variantId);
                  return (
                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="px-6 py-4 text-sm font-bold text-slate-700">{idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{variant?.skuSuffix || '默认规格'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800 text-right">{item.quantity} 件</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        {/* 各工序报工汇总 */}
        {order.milestones.some(m => (m.reports?.length ?? 0) > 0) && (
          <div className="space-y-4 pt-6">
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5" /> 各工序报工汇总
            </h4>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">工序</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">良品</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">不良品</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">报损</th>
                  </tr>
                </thead>
                <tbody>
                  {order.milestones.map(m => {
                    const goodQty = (m.reports || []).reduce((s, r) => s + r.quantity, 0);
                    const defQty = (m.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
                    const scrapQty = prodRecords
                      .filter(r => r.type === 'SCRAP' && r.orderId === order.id && r.nodeId === m.templateId)
                      .reduce((s, r) => s + r.quantity, 0);
                    if (goodQty === 0 && defQty === 0 && scrapQty === 0) return null;
                    return (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-6 py-4 text-sm font-bold text-slate-700">{m.name}</td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600 text-right">{goodQty} 件</td>
                        <td className="px-6 py-4 text-sm font-bold text-amber-600 text-right">{defQty > 0 ? `${defQty} 件` : '—'}</td>
                        <td className="px-6 py-4 text-sm font-bold text-rose-600 text-right">{scrapQty > 0 ? `${scrapQty} 件` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

          {orderFormSettings?.customFields && orderFormSettings.customFields.filter(f => f.showInDetail).length > 0 && (
            <div className="pt-4 space-y-3">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">自定义字段</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orderFormSettings.customFields.filter(f => f.showInDetail).map(f => {
                  const val = (order as any).customData?.[f.id];
                  if (val == null || val === '') return null;
                  return (
                    <div key={f.id} className="bg-slate-50 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{f.label}</p>
                      <p className="text-sm font-bold text-slate-800">{typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailView;
