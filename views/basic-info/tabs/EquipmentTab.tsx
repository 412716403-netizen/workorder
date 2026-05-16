/**
 * 基础信息 - 生产设备 Tab (Phase P8 抽离自 BasicInfoView)。
 *
 * 自包含: 列表(含工序筛选标签栏) + 编辑面板(含工序勾选)。
 */
import React, { useMemo, useState } from 'react';
import { Cpu, Plus, Search, X, Edit2, Trash2, ArrowLeft, Save, Hammer, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Equipment, GlobalNodeTemplate } from '../../../types';
import * as api from '../../../services/api';
import { useAsyncSubmitLock } from '../../../hooks/useAsyncSubmitLock';
import {
  formStandardControlClass,
  formStandardControlIconClass,
  formStandardLabelClass,
} from '../../../styles/uiDensity';

const EQUIPMENT_UNASSIGNED = 'UNASSIGNED';

interface Props {
  equipment: Equipment[];
  globalNodes: GlobalNodeTemplate[];
  onRefreshEquipment: () => Promise<void> | void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const EquipmentTab: React.FC<Props> = ({ equipment, globalNodes, onRefreshEquipment, canCreate, canEdit, canDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [equipmentNodeId, setEquipmentNodeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEq, setEditEq] = useState<Partial<Equipment>>({});
  const [showModal, setShowModal] = useState(false);
  const eqSubmit = useAsyncSubmitLock();

  const filteredEquipment = useMemo(() => {
    const byNode = equipment.filter(e => {
      if (equipmentNodeId == null) return true;
      if (equipmentNodeId === EQUIPMENT_UNASSIGNED) return !e.assignedMilestoneIds?.length;
      return e.assignedMilestoneIds?.includes(equipmentNodeId);
    });
    const t = searchTerm.trim().toLowerCase();
    if (!t) return byNode;
    return byNode.filter(e => e.name.toLowerCase().includes(t) || (e.code || '').toLowerCase().includes(t));
  }, [equipment, equipmentNodeId, searchTerm]);

  const handleOpenEq = (e?: Equipment) => {
    setEditEq(e || { name: '', code: '', assignedMilestoneIds: [] });
    setEditingId(e?.id || null);
    setShowModal(true);
  };

  const saveEq = async () => {
    if (!editEq.name?.trim()) {
      toast.warning('请填写设备名称');
      return;
    }
    await eqSubmit.run(async () => {
      try {
        if (editingId) await api.equipment.update(editingId, editEq);
        else await api.equipment.create(editEq);
        setShowModal(false);
        await onRefreshEquipment();
      } catch (err) {
        toast.error((err as Error).message || '操作失败');
      }
    });
  };

  if (showModal) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button
            onClick={() => setShowModal(false)}
            className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <button
            type="button"
            onClick={() => void saveEq()}
            disabled={eqSubmit.busy}
            className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> {eqSubmit.busy ? '保存中…' : '保存档案'}
          </button>
        </div>
        <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">设备基础信息</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={formStandardLabelClass}>设备名称</label>
              <input
                type="text"
                value={editEq.name ?? ''}
                onChange={e => setEditEq({ ...editEq, name: e.target.value })}
                className={formStandardControlClass}
              />
            </div>
            <div className="space-y-1">
              <label className={formStandardLabelClass}>设备代号</label>
              <input
                type="text"
                value={editEq.code ?? ''}
                onChange={e => setEditEq({ ...editEq, code: e.target.value })}
                className={formStandardControlClass}
              />
            </div>
          </div>
          <div className="pt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <Hammer className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">分配生产工序</h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                已选 {(editEq.assignedMilestoneIds || []).length} 节点
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {globalNodes.map(node => {
                const isChecked = editEq.assignedMilestoneIds?.includes(node.id);
                return (
                  <button
                    key={node.id}
                    onClick={() => {
                      const current = editEq.assignedMilestoneIds || [];
                      const updated = current.includes(node.id) ? current.filter(id => id !== node.id) : [...current, node.id];
                      setEditEq({ ...editEq, assignedMilestoneIds: updated });
                    }}
                    className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                      isChecked
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                        : 'bg-slate-50 border-slate-50 text-slate-600 hover:border-indigo-200'
                    }`}
                  >
                    <span className="text-xs font-bold">{node.name}</span>
                    {isChecked && <CheckCircle className="w-4 h-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">生产设备管理</h1>
          <p className="text-slate-500 mt-1 text-sm leading-snug max-w-xl">追踪车间机械设备、工装夹具及关联工序</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenEq()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4 shrink-0" /> 新增设备
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
            <button
              type="button"
              onClick={() => setEquipmentNodeId(null)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                equipmentNodeId === null ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              全部 ({equipment.length})
            </button>
            {(() => {
              const unassignedCount = equipment.filter(eq => !eq.assignedMilestoneIds?.length).length;
              return unassignedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setEquipmentNodeId(EQUIPMENT_UNASSIGNED)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    equipmentNodeId === EQUIPMENT_UNASSIGNED
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  未分配 ({unassignedCount})
                </button>
              ) : null;
            })()}
            {globalNodes.map(n => {
              const count = equipment.filter(eq => eq.assignedMilestoneIds?.includes(n.id)).length;
              if (count === 0) return null;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setEquipmentNodeId(n.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    equipmentNodeId === n.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {n.name} ({count})
                </button>
              );
            })}
          </div>
          <div className="relative w-full sm:max-w-sm sm:shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="搜索设备名称、编号…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`${formStandardControlIconClass} bg-white pr-10 shadow-sm`}
              aria-label="搜索设备"
            />
            {searchTerm.trim() !== '' && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                aria-label="清空搜索"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {filteredEquipment.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
            <Cpu className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-600">{searchTerm.trim() ? '未找到匹配的设备' : '当前筛选下暂无设备'}</p>
            {searchTerm.trim() !== '' && (
              <button type="button" onClick={() => setSearchTerm('')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                清空搜索条件
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 w-12"></th>
                  <th className="py-3 px-3">设备名称</th>
                  <th className="py-3 px-3 hidden sm:table-cell">编号</th>
                  <th className="py-3 px-3 hidden md:table-cell">关联工序</th>
                  <th className="py-3 pr-4 pl-2 text-right w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEquipment.map(e => {
                  const ids = e.assignedMilestoneIds ?? [];
                  const nodeNames = ids.map(id => globalNodes.find(g => g.id === id)?.name).filter((n): n is string => Boolean(n));
                  const nodeSummary =
                    nodeNames.length === 0
                      ? '未分配'
                      : nodeNames.length <= 2
                        ? nodeNames.join('、')
                        : `${nodeNames.slice(0, 2).join('、')} 等 ${nodeNames.length} 个`;
                  return (
                    <tr
                      key={e.id}
                      className={`group hover:bg-indigo-50/40 transition-colors ${canEdit ? 'cursor-pointer' : ''}`}
                      onClick={() => canEdit && handleOpenEq(e)}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          <Cpu className="w-4 h-4" />
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-[200px]">
                          {e.name}
                        </p>
                        <p className="sm:hidden text-[10px] text-slate-400 font-medium mt-0.5 font-mono truncate">{e.code || '—'}</p>
                      </td>
                      <td className="py-3 px-3 hidden sm:table-cell">
                        <span className="text-xs text-slate-500 font-mono font-medium">{e.code || '—'}</span>
                      </td>
                      <td className="py-3 px-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Hammer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-xs text-blue-700 font-bold tabular-nums shrink-0">{ids.length}</span>
                          <span className="text-xs text-slate-500 truncate" title={nodeNames.join('、')}>
                            {nodeSummary}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 pl-2 text-right">
                        <div className="flex items-center justify-end gap-0.5" onClick={ev => ev.stopPropagation()}>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEq(e)}
                              className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              aria-label="编辑"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await api.equipment.delete(e.id);
                                  await onRefreshEquipment();
                                } catch (err) {
                                  toast.error((err as Error).message || '删除失败');
                                }
                              }}
                              className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              aria-label="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EquipmentTab;
