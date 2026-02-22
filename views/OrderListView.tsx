
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Tag, Clock, Layers, Plus, History, Printer } from 'lucide-react';
import { ProductionOrder, MilestoneStatus, Product, GlobalNodeTemplate, OrderStatus, PrintSettings } from '../types';
import { ORDER_STATUS_MAP } from '../constants';

interface OrderListViewProps {
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  printSettings: PrintSettings;
  onCreateOrder: (order: ProductionOrder) => void;
}

const OrderListView: React.FC<OrderListViewProps> = ({ orders, products, globalNodes, printSettings, onCreateOrder }) => {
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  const orderPrintConfig = printSettings.ORDER;

  // ... (原有逻辑保持不变)
  const [newOrderForm, setNewOrderForm] = useState({
    orderNumber: `PO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
    productId: '',
    quantity: 0,
    customer: '',
    dueDate: new Date().toISOString().split('T')[0]
  });

  const handlePrint = (e: React.MouseEvent, order: ProductionOrder) => {
    e.preventDefault();
    e.stopPropagation();
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">生产工单中心</h1>
          <p className="text-slate-500 mt-1 italic text-sm">追踪各工序节点进度与完工比例</p>
        </div>
        {!showModal && (
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-sm font-bold transition-all"
            >
              <History className="w-4 h-4" />
              报工流水
            </button>
            <button 
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold transition-all shadow-lg shadow-indigo-200"
            >
              <Plus className="w-4 h-4" />
              新建工单
            </button>
          </div>
        )}
      </div>

      {!showModal ? (
        <div className="grid grid-cols-1 gap-6">
          {orders.map((order) => {
            const totalMilestones = order.milestones.length;
            const completedMilestones = order.milestones.filter(m => m.status === MilestoneStatus.COMPLETED).length;
            const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
            
            const overallProgress = totalMilestones > 0 ? Math.round(
              (order.milestones.reduce((acc, m) => acc + (m.completedQuantity / orderTotalQty), 0) / totalMilestones) * 100
            ) : 0;

            return (
              <Link 
                key={order.id} 
                to={`/orders/${order.id}`}
                className="bg-white rounded-[32px] border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-8 mb-8">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3 mb-2">
                           <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">
                             {order.orderNumber}
                           </span>
                           <span className={`text-[10px] font-bold ${ORDER_STATUS_MAP[order.status].color}`}>
                             ● {ORDER_STATUS_MAP[order.status].label}
                           </span>
                         </div>
                         {orderPrintConfig.enabled && (
                            <button onClick={(e) => handlePrint(e, order)} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="打印作业指令单">
                               <Printer className="w-5 h-5" />
                            </button>
                         )}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{order.productName}</h3>
                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1"><Tag className="w-4 h-4 text-slate-300" /> {order.sku}</span>
                        <span className="flex items-center gap-1"><Layers className="w-4 h-4 text-slate-300" /> 总数: {orderTotalQty}</span>
                        <span className="flex items-center gap-1 text-rose-500"><Clock className="w-4 h-4" /> {order.dueDate}</span>
                      </div>
                    </div>

                    <div className="lg:w-72 text-right">
                      {/* ... (原有进度逻辑) */}
                    </div>
                  </div>
                  {/* ... (节点详情逻辑) */}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* 新建工单表单 略 */
        <div></div>
      )}
    </div>
  );
};

export default OrderListView;
