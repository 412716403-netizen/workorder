import React from 'react';
import { User, Trash2, ShieldAlert } from 'lucide-react';
import type { RoleRow } from '../../services/api';
import type { Member } from './constants';
import { memberHasReportPerm } from './constants';

interface MembersTabProps {
  members: Member[];
  canManage: boolean;
  tenantRole: string;
  currentUserId: string;
  rolesList: RoleRow[];
  onAssignRole: (uid: string, roleId: string | null) => void;
  onRemoveMember: (uid: string) => void;
  onOpenMilestoneModal: (m: Member) => void;
}

function MembersTab({
  members, canManage, tenantRole, currentUserId, rolesList,
  onAssignRole, onRemoveMember, onOpenMilestoneModal,
}: MembersTabProps) {
  return (
    <div className="bg-white rounded-[32px] border border-slate-200 w-full overflow-hidden shadow-sm">
      <div className="divide-y divide-slate-100">
        {members.map(m => (
          <div key={m.id} className="p-4 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <div className="font-medium text-sm">{m.displayName || m.username}</div>
                  <div className="text-xs text-gray-400">{m.phone || m.username}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {m.roleName && (
                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {m.roleName}
                  </span>
                )}
                {canManage && m.role !== 'owner' && memberHasReportPerm(m, rolesList) && (
                  <button
                    type="button"
                    onClick={() => onOpenMilestoneModal(m)}
                    className="text-xs px-2 py-1 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    工序 {(m.assignedMilestoneIds?.length || 0)} 个
                  </button>
                )}
                {canManage && m.role !== 'owner' && m.userId !== currentUserId && (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.roleId || ''}
                      onChange={e => onAssignRole(m.userId, e.target.value || null)}
                      className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
                    >
                      <option value="">未分配角色</option>
                      {rolesList.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    {tenantRole === 'owner' && (
                      <button onClick={() => onRemoveMember(m.userId)} className="p-1 text-red-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(MembersTab);
