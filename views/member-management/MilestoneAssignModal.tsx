import React, { useState } from 'react';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import * as api from '../../services/api';
import type { GlobalNodeTemplate } from '../../types';
import { toast } from 'sonner';
import type { Member } from './constants';

interface MilestoneAssignModalProps {
  member: Member;
  globalNodes: GlobalNodeTemplate[];
  tenantId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function MilestoneAssignModal({ member, globalNodes, tenantId, onClose, onSaved }: MilestoneAssignModalProps) {
  const [milestoneIds, setMilestoneIds] = useState<string[]>(member.assignedMilestoneIds || []);

  async function saveMilestones() {
    try {
      await api.tenants.updateMemberMilestones(tenantId, member.userId, { assignedMilestoneIds: milestoneIds });
      toast.success('工序权限已更新');
      onClose();
      await onSaved();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">分配生产工序权限</h3>
              <p className="text-xs text-slate-400">{member.displayName || member.username}</p>
            </div>
          </div>
        </div>
        <div className="p-6 flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              已分配 {milestoneIds.length} 个工序节点
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {globalNodes.map(node => {
              const isChecked = milestoneIds.includes(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    setMilestoneIds(prev =>
                      prev.includes(node.id) ? prev.filter(id => id !== node.id) : [...prev, node.id]
                    );
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
          {globalNodes.length === 0 && (
            <p className="text-center py-8 text-sm text-slate-400 italic">暂无工序节点，请先在系统设置中创建</p>
          )}
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-white rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">
            取消
          </button>
          <button onClick={saveMilestones}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(MilestoneAssignModal);
