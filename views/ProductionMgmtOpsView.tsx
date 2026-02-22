
import React, { useState } from 'react';
import { 
  Plus, 
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  RotateCcw,
  Clock,
  Printer
} from 'lucide-react';
import { ProductionOpRecord, ProductionOrder, Product, ProdOpType, PrintSettings } from '../types';

interface ProductionMgmtOpsViewProps {
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  printSettings: PrintSettings;
  onAddRecord: (record: ProductionOpRecord) => void;
  limitType?: ProdOpType;
  excludeType?: ProdOpType;
}

const ProductionMgmtOpsView: React.FC<ProductionMgmtOpsViewProps> = ({ 
  records, orders, products, printSettings, onAddRecord, limitType, excludeType 
}) => {
  const allTabs = [
    { id: 'STOCK_OUT', label: '领料出库', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '物料下发与库存扣减' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '外部委托加工业务追踪' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '不合格品返工流程记录' },
    { id: 'STOCK_IN', label: '生产入库', icon: ArrowDownToLine, color: 'text-indigo-600', bg: 'bg-indigo-600', sub: '成品入库与完工确认' },
  ];

  const currentBiz = allTabs.find(t => t.id === limitType);
  const printConfig = limitType ? printSettings[limitType] : null;

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    orderId: '',
    productId: '',
    quantity: 0,
    reason: '',
    partner: ''
  });

  const filteredRecords = records.filter(r => r.type === limitType);

  const handlePrint = (rec: ProductionOpRecord) => {
    window.print();
  };

  const handleAdd = () => {
    if (!limitType) return;
    const newRecord: ProductionOpRecord = {
      id: `rec-${Date.now()}`,
      type: limitType,
      orderId: form.orderId,
      productId: form.productId,
      quantity: form.quantity,
      reason: form.reason,
      partner: form.partner,
      operator: '张主管',
      timestamp: new Date().toLocaleString(),
      status: limitType === 'OUTSOURCE' ? '加工中' : '已完成'
    };
    onAddRecord(newRecord);
    setShowModal(false);
    setForm({ orderId: '', productId: '', quantity: 0, reason: '', partner: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{currentBiz?.label || '业务流水'}</h1>
          <p className="text-slate-500 mt-1 italic text-sm">{currentBiz?.sub || '处理生产业务流水记录'}</p>
        </div>
        {!showModal && (
          <button 
            onClick={() => setShowModal(true)}
            className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-sm font-bold transition-all shadow-lg ${currentBiz?.bg || 'bg-indigo-600'}`}
          >
            <Plus className="w-4 h-4" /> 记录新业务
          </button>
        )}
      </div>

      {!showModal ? (
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">关联工单/产品</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务数量</th>
                  {limitType === 'OUTSOURCE' && <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">外协厂商</th>}
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">经办/操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-slate-300 italic text-sm">暂无该业务模块的流水记录</td>
                  </tr>
                ) : (
                  filteredRecords.map(rec => {
                    const order = orders.find(o => o.id === rec.orderId);
                    const product = products.find(p => p.id === rec.productId);
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/30 transition-colors group">
                        <td className="px-8 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-300" />
                            <span className="text-xs font-bold text-slate-600">{rec.timestamp}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter mb-0.5">{order?.orderNumber || '通用项'}</span>
                            <span className="text-sm font-bold text-slate-800">{product?.name || '未知物料'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                           <span className={`text-sm font-black text-indigo-600`}>
                             {rec.quantity} PCS
                           </span>
                        </td>
                        {limitType === 'OUTSOURCE' && <td className="px-8 py-4"><span className="text-xs font-bold text-slate-700">{rec.partner}</span></td>}
                        <td className="px-8 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                             <div className="flex flex-col items-end opacity-60 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs font-bold text-slate-700">{rec.operator}</span>
                                <span className="text-[10px] text-slate-400 italic max-w-[200px] truncate">{rec.reason || '-'}</span>
                             </div>
                             {printConfig?.enabled && (
                               <button onClick={() => handlePrint(rec)} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100" title="打印单据凭证">
                                 <Printer className="w-4 h-4" />
                               </button>
                             )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 新增表单略 */
        <div></div>
      )}
    </div>
  );
};

export default ProductionMgmtOpsView;
