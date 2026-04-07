
import React, { useState } from 'react';
import { Sliders, Plus, X, Trash2 } from 'lucide-react';
import { OrderFormSettings } from '../../types';

interface OrderFormConfigModalProps {
  onClose: () => void;
  orderFormSettings: OrderFormSettings;
  onUpdateOrderFormSettings: (settings: OrderFormSettings) => void;
}

const OrderFormConfigModal: React.FC<OrderFormConfigModalProps> = ({
  onClose,
  orderFormSettings,
  onUpdateOrderFormSettings,
}) => {
  const [draft, setDraft] = useState<OrderFormSettings>(() =>
    JSON.parse(JSON.stringify(orderFormSettings))
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sliders className="w-5 h-5 text-indigo-500" /> 工单表单配置</h3>
            <p className="text-xs text-slate-500 mt-1">配置在列表、新增、详情页中显示的字段，可增加自定义项</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-auto">
          <div>
            <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">标准字段显示</h4>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">字段</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.standardFields
                    .filter(f => !['product', 'sku', 'totalQty', 'status', 'orderNumber'].includes(f.id))
                    .map(f => (
                      <tr key={f.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                        <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
              <button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                <Plus className="w-3.5 h-3.5" /> 增加
              </button>
            </div>
            {draft.customFields.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">暂无自定义项，点击「增加」添加</p>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">标签</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">类型</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">选项（下拉时）</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.customFields.map(cf => (
                      <tr key={cf.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                        <td className="px-4 py-2">
                          <select value={cf.type || 'text'} onChange={e => {
                            const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                            setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                          }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                            <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 align-top">
                          {cf.type === 'select' ? (
                            <div className="min-w-[180px] space-y-1.5">
                              {(cf.options ?? []).map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-1">
                                  <input type="text" value={opt} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                  <button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                              <button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                <Plus className="w-3.5 h-3.5" /> 添加选项
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2"><button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
          <button onClick={() => { onUpdateOrderFormSettings(draft); onClose(); }} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">保存配置</button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OrderFormConfigModal);
