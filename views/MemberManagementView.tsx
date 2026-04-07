import React, { useState, useEffect, useCallback } from 'react';
import { Users, Shield, ShieldCheck, KeyRound, Loader2 } from 'lucide-react';
import * as api from '../services/api';
import type { RoleRow } from '../services/api';
import type { GlobalNodeTemplate } from '../types';
import { toast } from 'sonner';
import { useConfirm } from '../contexts/ConfirmContext';
import type { Member, Application } from './member-management/constants';
import InviteCodeTab from './member-management/InviteCodeTab';
import ApplicationsTab from './member-management/ApplicationsTab';
import MembersTab from './member-management/MembersTab';
import RolesTab from './member-management/RolesTab';
import RoleEditModal from './member-management/RoleEditModal';
import MilestoneAssignModal from './member-management/MilestoneAssignModal';

interface MemberManagementViewProps {
  tenantId: string;
  tenantRole: string;
  currentUserId: string;
  globalNodes: GlobalNodeTemplate[];
  onRefreshWorkers?: () => Promise<void>;
}

export default function MemberManagementView({ tenantId, tenantRole, currentUserId, globalNodes, onRefreshWorkers }: MemberManagementViewProps) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<'members' | 'applications' | 'invite' | 'roles'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [tenantInfo, setTenantInfo] = useState<{ inviteCode: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [rolesList, setRolesList] = useState<RoleRow[]>([]);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);

  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [milestoneEditMember, setMilestoneEditMember] = useState<Member | null>(null);

  const canManage = tenantRole === 'owner' || tenantRole === 'admin';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.tenants.getMembers(tenantId),
        canManage ? api.tenants.getApplications(tenantId) : Promise.resolve([]),
        api.tenants.get(tenantId),
        canManage ? api.roles.list() : Promise.resolve([]),
      ]);
      const val = (i: number) => results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<any>).value : undefined;
      if (val(0)) setMembers(val(0));
      if (val(1)) setApplications(val(1).filter((x: Application) => x.status === 'PENDING'));
      if (val(2)) setTenantInfo(val(2));
      if (val(3)) setRolesList(val(3));
    } catch (err: any) { toast.error(err.message || '加载失败'); }
    finally { setLoading(false); }
  }, [tenantId, canManage]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAssignRole(uid: string, roleId: string | null) {
    try {
      await api.tenants.updateMemberRole(tenantId, uid, { roleId });
      toast.success('权限角色已更新');
      await loadData();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  async function handleRemoveMember(uid: string) {
    const ok = await confirm({ message: '确认移除该成员？', danger: true });
    if (!ok) return;
    try {
      await api.tenants.removeMember(tenantId, uid);
      toast.success('成员已移除');
      await loadData();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  async function handleReview(appId: string, action: 'APPROVED' | 'REJECTED') {
    try {
      await api.tenants.reviewApplication(tenantId, appId, {
        action,
        role: 'worker',
        permissions: ['dashboard', 'production'],
      });
      toast.success(action === 'APPROVED' ? '已通过' : '已拒绝');
      await loadData();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  function copyInviteCode() {
    if (tenantInfo?.inviteCode) {
      navigator.clipboard.writeText(tenantInfo.inviteCode);
      toast.success('邀请码已复制');
    }
  }

  function openCreateRole() {
    setEditingRole(null);
    setRoleModalOpen(true);
  }

  function openEditRole(role: RoleRow) {
    setEditingRole(role);
    setRoleModalOpen(true);
  }

  async function handleDeleteRole(role: RoleRow) {
    const ok = await confirm({ message: `确认删除角色「${role.name}」？`, danger: true });
    if (!ok) return;
    try {
      await api.roles.delete(role.id);
      toast.success('角色已删除');
      await loadData();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  function openMilestoneModal(m: Member) {
    setMilestoneEditMember(m);
    setMilestoneModalOpen(true);
  }

  async function handleMilestoneSaved() {
    await loadData();
    if (onRefreshWorkers) await onRefreshWorkers();
  }

  if (loading) {
    return <div className="flex items-center justify-start h-64 pl-0"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-4 w-full text-left animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">成员管理</h1>
          <p className="text-slate-500 mt-1 text-sm leading-snug max-w-xl">管理企业成员、审核加入申请、邀请码与角色权限</p>
        </div>
        <div className="flex flex-wrap gap-1.5 min-w-0 justify-start">
          {([
            { key: 'members' as const, label: '成员列表', icon: Users },
            ...(canManage
              ? [{ key: 'applications' as const, label: '待审核', icon: Shield, badgeCount: applications.length } as const]
              : []),
            { key: 'invite' as const, label: '邀请码', icon: ShieldCheck },
            ...(canManage ? [{ key: 'roles' as const, label: '角色管理', icon: KeyRound }] : []),
          ]).map(t => {
            const badge =
              'badgeCount' in t && t.badgeCount > 0 ? (
                <span
                  className={`ml-0.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-black flex items-center justify-center ${
                    tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-600 text-white'
                  }`}
                >
                  {t.badgeCount}
                </span>
              ) : null;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  tab === t.key
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <t.icon className="w-3.5 h-3.5 shrink-0" /> {t.label}
                {badge}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'invite' && tenantInfo && (
        <InviteCodeTab tenantInfo={tenantInfo} onCopyInviteCode={copyInviteCode} />
      )}

      {tab === 'applications' && (
        <ApplicationsTab applications={applications} onReview={handleReview} />
      )}

      {tab === 'members' && (
        <MembersTab
          members={members}
          canManage={canManage}
          tenantRole={tenantRole}
          currentUserId={currentUserId}
          rolesList={rolesList}
          onAssignRole={handleAssignRole}
          onRemoveMember={handleRemoveMember}
          onOpenMilestoneModal={openMilestoneModal}
        />
      )}

      {tab === 'roles' && canManage && (
        <RolesTab
          rolesList={rolesList}
          onOpenCreateRole={openCreateRole}
          onOpenEditRole={openEditRole}
          onDeleteRole={handleDeleteRole}
        />
      )}

      {roleModalOpen && (
        <RoleEditModal
          editingRole={editingRole}
          onClose={() => setRoleModalOpen(false)}
          onSaved={loadData}
        />
      )}

      {milestoneModalOpen && milestoneEditMember && (
        <MilestoneAssignModal
          member={milestoneEditMember}
          globalNodes={globalNodes}
          tenantId={tenantId}
          onClose={() => setMilestoneModalOpen(false)}
          onSaved={handleMilestoneSaved}
        />
      )}
    </div>
  );
}
