import React, { useState } from 'react';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import {
  Warehouse as WarehouseIcon,
  ArrowRight,
  MapPin,
  Trash2,
} from 'lucide-react';
import { Warehouse } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';

interface WarehousesTabProps {
  warehouses: Warehouse[];
  onRefreshWarehouses: () => Promise<void>;
  canCreate: boolean;
  canDelete: boolean;
}

const WarehousesTab: React.FC<WarehousesTabProps> = ({
  warehouses,
  onRefreshWarehouses,
  canCreate,
  canDelete,
}) => {
  const [newWhName, setNewWhName] = useState('');
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [whDraft, setWhDraft] = useState({ name: '', location: '' });
  const addLock = useAsyncSubmitLock();

  const handleAddWarehouse = async () => {
    if (!newWhName.trim()) return;
    if (warehouses.some(w => w.name === newWhName.trim())) { toast.warning(`仓库"${newWhName.trim()}"已存在`); return; }
    await addLock.run(async () => {
      try {
        const created = await api.settings.warehouses.create({
          name: newWhName.trim(),
        }) as Warehouse;
        setNewWhName('');
        setEditingWhId(created.id);
        setWhDraft({
          name: (created as Warehouse).name || newWhName.trim(),
          location: (created as Warehouse).location || '',
        });
        await onRefreshWarehouses();
      } catch (err: any) { toast.error(err.message || '操作失败'); }
    });
  };

  const removeWarehouse = async (id: string) => {
    try {
      await api.settings.warehouses.delete(id);
      if (editingWhId === id) setEditingWhId(null);
      await onRefreshWarehouses();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
            <WarehouseIcon className="w-4 h-4 text-indigo-600" />
            实体库房档案库
          </h2>
          <div className="space-y-3 mb-8">
            {warehouses.map(wh => (
              <div 
                key={wh.id} 
                onClick={() => {
                  setEditingWhId(wh.id);
                  setWhDraft({
                    name: wh.name || '',
                    location: wh.location || '',
                  });
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                  editingWhId === wh.id 
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                  : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                }`}
              >
                <span className={`text-sm font-bold ${editingWhId === wh.id ? 'text-indigo-900' : 'text-slate-600'}`}>{wh.name}</span>
                <ArrowRight className={`w-4 h-4 transition-all ${editingWhId === wh.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
              </div>
            ))}
          </div>
          {canCreate && (
          <div className="pt-6 border-t border-slate-50">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速录入新仓库</h3>
            <div className="space-y-4">
              <input type="text" placeholder="仓库名称" value={newWhName} onChange={e => setNewWhName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button type="button" onClick={() => void handleAddWarehouse()} disabled={!newWhName.trim() || addLock.busy} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed">{addLock.busy ? '提交中…' : '确认添加'}</button>
            </div>
          </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-8">
         {editingWhId ? (
           <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
              {warehouses.filter(w => w.id === editingWhId).map(wh => (
                 <div key={wh.id}>
                    <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <h2 className="font-black text-slate-800 text-lg">编辑仓库：{whDraft.name || wh.name}</h2>
                      {canDelete && <button onClick={() => removeWarehouse(wh.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                    </div>
                    <div className="p-8 space-y-10">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1 md:col-span-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest">仓库名称</label>
                             <input
                               type="text"
                               value={whDraft.name}
                               onChange={(e) => setWhDraft((d) => ({ ...d, name: e.target.value }))}
                               onBlur={async () => {
                                 const cur = warehouses.find((x) => x.id === wh.id);
                                 if (!cur) return;
                                 const next = whDraft.name.trim();
                                 if (next === (cur.name || '')) return;
                                 if (!next) {
                                   toast.error('仓库名称不能为空');
                                   setWhDraft((d) => ({ ...d, name: cur.name || '' }));
                                   return;
                                 }
                                 try {
                                   await api.settings.warehouses.update(wh.id, { name: next });
                                   await onRefreshWarehouses();
                                 } catch (err: unknown) {
                                   toast.error(err instanceof Error ? err.message : '保存失败');
                                   setWhDraft((d) => ({ ...d, name: cur.name || '' }));
                                 }
                               }}
                               className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                             />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest flex items-center gap-2"><MapPin className="w-3 h-3" /> 地理位置</label>
                             <input
                               type="text"
                               value={whDraft.location}
                               onChange={(e) => setWhDraft((d) => ({ ...d, location: e.target.value }))}
                               onBlur={async () => {
                                 const cur = warehouses.find((x) => x.id === wh.id);
                                 if (!cur) return;
                                 const next = whDraft.location.trim();
                                 if (next === (cur.location || '').trim()) return;
                                 try {
                                   await api.settings.warehouses.update(wh.id, { location: next || null });
                                   await onRefreshWarehouses();
                                 } catch (err: unknown) {
                                   toast.error(err instanceof Error ? err.message : '保存失败');
                                   setWhDraft((d) => ({ ...d, location: cur.location || '' }));
                                 }
                               }}
                               className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                             />
                          </div>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><WarehouseIcon className="w-8 h-8 text-slate-300" /></div>
              <h3 className="text-lg font-bold text-slate-400">请选择左侧仓库进行配置</h3>
           </div>
         )}
      </div>
    </div>
  );
};

export default React.memo(WarehousesTab);
