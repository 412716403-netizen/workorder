import React, { useState, useEffect, useCallback } from 'react';
import { Users, Shield, ShieldCheck, User, Trash2, Check, X, Copy, Loader2, KeyRound, Plus, Pencil, ChevronDown, ChevronRight, CheckCircle, ShieldAlert } from 'lucide-react';
import * as api from '../services/api';
import type { RoleRow } from '../services/api';
import type { GlobalNodeTemplate } from '../types';
import { toast } from 'sonner';

const ALL_PERMISSIONS = [
  { id: 'dashboard', label: '经营看板' },
  { id: 'production', label: '生产管理' },
  { id: 'process_report', label: '工序报工' },
  { id: 'psi', label: '进销存' },
  { id: 'finance', label: '财务结算' },
  { id: 'basic', label: '基础信息' },
  { id: 'settings', label: '系统设置' },
];

const SETTINGS_SUB_MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: 'categories',            label: '产品分类管理',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'partner_categories',    label: '合作单位分类',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'nodes',                 label: '工序节点库',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'warehouses',            label: '仓库分类管理',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'finance_categories',    label: '收付款分类设置', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'finance_account_types', label: '收支账户类型',   actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'config',                label: '业务配置',       actions: ['view', 'edit'] },
];

const BASIC_SUB_MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: 'products',     label: '产品与BOM',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'partners',     label: '合作单位',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'members',      label: '成员管理',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'equipment',    label: '设备管理',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'dictionaries', label: '公共数据字典',   actions: ['view', 'create', 'delete'] },
];

const PRODUCTION_SUB_MODULES: { key: string; label: string; actions: string[]; group: string }[] = [
  { key: 'plans', label: '生产计划', actions: ['view', 'create', 'edit', 'delete'], group: '生产计划' },
  { key: 'orders_list', label: '主列表', actions: ['allow'], group: '工单中心' },
  { key: 'orders_form_config', label: '表单配置', actions: ['allow'], group: '工单中心' },
  { key: 'orders_report_records', label: '报工流水', actions: ['view', 'edit', 'delete'], group: '工单中心' },
  { key: 'orders_pending_stock_in', label: '待入库流水', actions: ['view', 'create', 'edit', 'delete'], group: '工单中心' },
  { key: 'orders_detail', label: '工单详情', actions: ['view', 'edit', 'delete'], group: '工单中心' },
  { key: 'orders_material', label: '物料', actions: ['allow'], group: '工单中心' },
  { key: 'orders_rework', label: '返工', actions: ['allow'], group: '工单中心' },
  { key: 'material_list', label: '主列表', actions: ['allow'], group: '生产物料' },
  { key: 'material_records', label: '领料退料流水', actions: ['view', 'edit', 'delete'], group: '生产物料' },
  { key: 'material_issue', label: '领料发出', actions: ['allow'], group: '生产物料' },
  { key: 'material_return', label: '生产退料', actions: ['allow'], group: '生产物料' },
  { key: 'outsource_list', label: '主列表', actions: ['allow'], group: '外协管理' },
  { key: 'outsource_send', label: '待发清单', actions: ['allow'], group: '外协管理' },
  { key: 'outsource_receive', label: '待收回清单', actions: ['allow'], group: '外协管理' },
  { key: 'outsource_records', label: '外协流水', actions: ['view', 'edit', 'delete'], group: '外协管理' },
  { key: 'rework_list', label: '主列表', actions: ['allow'], group: '返工管理' },
  { key: 'rework_defective', label: '待处理不良', actions: ['allow'], group: '返工管理' },
  { key: 'rework_records', label: '处理不良流水', actions: ['view', 'edit', 'delete'], group: '返工管理' },
  { key: 'rework_report_records', label: '返工报工流水', actions: ['view', 'edit', 'delete'], group: '返工管理' },
  { key: 'rework_detail', label: '详情', actions: ['allow'], group: '返工管理' },
  { key: 'rework_material', label: '物料', actions: ['allow'], group: '返工管理' },
];

const PSI_SUB_MODULES: { key: string; label: string; actions: string[]; group: string }[] = [
  { key: 'purchase_order', label: '采购订单', actions: ['view', 'create', 'edit', 'delete'], group: '采购订单' },
  { key: 'purchase_bill', label: '采购单', actions: ['view', 'create', 'edit', 'delete'], group: '采购单' },
  { key: 'sales_order', label: '销售订单', actions: ['view', 'create', 'edit', 'delete'], group: '销售订单' },
  { key: 'sales_order_allocation', label: '配货', actions: ['allow'], group: '销售订单' },
  { key: 'sales_order_pending_shipment', label: '待发货清单', actions: ['allow'], group: '销售订单' },
  { key: 'sales_bill', label: '销售单', actions: ['view', 'create', 'edit', 'delete'], group: '销售单' },
  { key: 'warehouse_list', label: '主列表', actions: ['allow'], group: '仓库管理' },
  { key: 'warehouse_stocktake', label: '盘点单', actions: ['view', 'create', 'edit', 'delete'], group: '仓库管理' },
  { key: 'warehouse_transfer', label: '调拨单', actions: ['view', 'create', 'edit', 'delete'], group: '仓库管理' },
  { key: 'warehouse_flow', label: '仓库流水', actions: ['allow'], group: '仓库管理' },
];

const FINANCE_SUB_MODULES: { key: string; label: string; actions: string[]; group: string }[] = [
  { key: 'receipt', label: '收款单', actions: ['view', 'create', 'edit', 'delete'], group: '收款单' },
  { key: 'payment', label: '付款单', actions: ['view', 'create', 'edit', 'delete'], group: '付款单' },
  { key: 'reconciliation', label: '财务对帐', actions: ['allow'], group: '财务对帐' },
];

const ACTION_LABELS: Record<string, string> = { view: '查看', create: '添加', edit: '编辑', delete: '删除' };

interface MemberManagementViewProps {
  tenantId: string;
  tenantRole: string;
  currentUserId: string;
  globalNodes: GlobalNodeTemplate[];
  onRefreshWorkers?: () => Promise<void>;
}

type Member = {
  id: string; userId: string; username: string; phone?: string;
  displayName?: string; role: string; permissions: unknown;
  roleId?: string | null; roleName?: string | null;
  assignedMilestoneIds?: string[];
  joinedAt: string;
};
type Application = {
  id: string; userId: string; status: string; message?: string;
  user: { id: string; username: string; phone?: string; displayName?: string };
  createdAt: string;
};

export default function MemberManagementView({ tenantId, tenantRole, currentUserId, globalNodes, onRefreshWorkers }: MemberManagementViewProps) {
  const [tab, setTab] = useState<'members' | 'applications' | 'invite' | 'roles'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [tenantInfo, setTenantInfo] = useState<{ inviteCode: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [rolesList, setRolesList] = useState<RoleRow[]>([]);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [rolePerms, setRolePerms] = useState<string[]>([]);

  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [milestoneEditMember, setMilestoneEditMember] = useState<Member | null>(null);
  const [milestoneIds, setMilestoneIds] = useState<string[]>([]);

  const canManage = tenantRole === 'owner' || tenantRole === 'admin';

  function memberHasReportPerm(m: Member): boolean {
    if (m.role === 'owner') return true;
    const perms = resolveMemberPermsLocal(m);
    if (perms.includes('process_report')) return true;
    return false;
  }

  function resolveMemberPermsLocal(m: Member): string[] {
    if (m.role === 'owner') return ALL_PERMISSIONS.map(p => p.id);
    if (m.roleId && m.roleName) {
      const role = rolesList.find(r => r.id === m.roleId);
      if (role) return Array.isArray(role.permissions) ? role.permissions as string[] : [];
    }
    return Array.isArray(m.permissions) ? m.permissions as string[] : [];
  }

  function openMilestoneModal(m: Member) {
    setMilestoneEditMember(m);
    setMilestoneIds(m.assignedMilestoneIds || []);
    setMilestoneModalOpen(true);
  }

  async function saveMilestones() {
    if (!milestoneEditMember) return;
    try {
      await api.tenants.updateMemberMilestones(tenantId, milestoneEditMember.userId, { assignedMilestoneIds: milestoneIds });
      toast.success('工序权限已更新');
      setMilestoneModalOpen(false);
      await loadData();
      if (onRefreshWorkers) await onRefreshWorkers();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

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
    if (!confirm('确认移除该成员？')) return;
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

  // ── Role CRUD ──
  function openCreateRole() {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setRolePerms([]);
    setSettingsExpanded(false);
    setBasicExpanded(false);
    setProductionExpanded(false);
    setPsiExpanded(false);
    setRoleModalOpen(true);
  }

  function openEditRole(role: RoleRow) {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDesc(role.description || '');
    const perms = Array.isArray(role.permissions) ? [...role.permissions] : [];
    if (!perms.includes('settings') && perms.some(p => p.startsWith('settings:'))) {
      perms.push('settings');
    }
    if (!perms.includes('basic') && perms.some(p => p.startsWith('basic:'))) {
      perms.push('basic');
    }
    if (!perms.includes('production') && perms.some(p => p.startsWith('production:'))) {
      perms.push('production');
    }
    if (!perms.includes('psi') && perms.some(p => p.startsWith('psi:'))) {
      perms.push('psi');
    }
    if (!perms.includes('finance') && perms.some(p => p.startsWith('finance:'))) {
      perms.push('finance');
    }
    setRolePerms(perms);
    setSettingsExpanded(false);
    setBasicExpanded(false);
    setProductionExpanded(false);
    setPsiExpanded(false);
    setFinanceExpanded(false);
    setRoleModalOpen(true);
  }

  async function handleSaveRole() {
    if (!roleName.trim()) { toast.error('请输入角色名称'); return; }
    let permsToSave = [...rolePerms];
    if (permsToSave.some(p => p.startsWith('settings:'))) {
      permsToSave = permsToSave.filter(p => p !== 'settings');
    }
    if (permsToSave.some(p => p.startsWith('basic:'))) {
      permsToSave = permsToSave.filter(p => p !== 'basic');
    }
    if (permsToSave.some(p => p.startsWith('production:'))) {
      permsToSave = permsToSave.filter(p => p !== 'production');
    }
    if (permsToSave.some(p => p.startsWith('psi:'))) {
      permsToSave = permsToSave.filter(p => p !== 'psi');
    }
    if (permsToSave.some(p => p.startsWith('finance:'))) {
      permsToSave = permsToSave.filter(p => p !== 'finance');
    }
    try {
      if (editingRole) {
        await api.roles.update(editingRole.id, { name: roleName.trim(), description: roleDesc.trim() || undefined, permissions: permsToSave });
        toast.success('角色已更新');
      } else {
        await api.roles.create({ name: roleName.trim(), description: roleDesc.trim() || undefined, permissions: permsToSave });
        toast.success('角色已创建');
      }
      setRoleModalOpen(false);
      await loadData();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  async function handleDeleteRole(role: RoleRow) {
    if (!confirm(`确认删除角色「${role.name}」？`)) return;
    try {
      await api.roles.delete(role.id);
      toast.success('角色已删除');
      await loadData();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  function toggleSettingsPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];

      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleBasicPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];

      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleBasicAll() {
    const allBasicPerms = BASIC_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `basic:${sm.key}:${a}`)
    );
    const hasAll = allBasicPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('basic:')) : [...new Set([...prev.filter(p => !p.startsWith('basic:')), ...allBasicPerms])]
    );
  }

  function toggleBasicSubModuleAll(smKey: string) {
    const sm = BASIC_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `basic:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`basic:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`basic:${smKey}:`)), ...perms]
    );
  }

  function toggleSettingsAll() {
    const allSettingsPerms = SETTINGS_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `settings:${sm.key}:${a}`)
    );
    const hasAll = allSettingsPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('settings:')) : [...new Set([...prev.filter(p => !p.startsWith('settings:')), ...allSettingsPerms])]
    );
  }

  function toggleSettingsSubModuleAll(smKey: string) {
    const sm = SETTINGS_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `settings:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`settings:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`settings:${smKey}:`)), ...perms]
    );
  }

  function toggleProductionPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view' && action !== 'allow') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleProductionAll() {
    const allPerms = PRODUCTION_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `production:${sm.key}:${a}`)
    );
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('production:')) : [...new Set([...prev.filter(p => !p.startsWith('production:')), ...allPerms])]
    );
  }

  function toggleProductionSubModuleAll(smKey: string) {
    const sm = PRODUCTION_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `production:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`production:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`production:${smKey}:`)), ...perms]
    );
  }

  function toggleProductionGroupAll(group: string) {
    const groupItems = PRODUCTION_SUB_MODULES.filter(sm => sm.group === group);
    const allPerms = groupItems.flatMap(sm => sm.actions.map(a => `production:${sm.key}:${a}`));
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev => {
      const groupPrefixes = groupItems.map(sm => `production:${sm.key}:`);
      const withoutGroup = prev.filter(p => !groupPrefixes.some(prefix => p.startsWith(prefix)));
      return hasAll ? withoutGroup : [...new Set([...withoutGroup, ...allPerms])];
    });
  }

  function togglePsiPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view' && action !== 'allow') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function togglePsiAll() {
    const allPerms = PSI_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `psi:${sm.key}:${a}`)
    );
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('psi:')) : [...new Set([...prev.filter(p => !p.startsWith('psi:')), ...allPerms])]
    );
  }

  function togglePsiSubModuleAll(smKey: string) {
    const sm = PSI_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `psi:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`psi:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`psi:${smKey}:`)), ...perms]
    );
  }

  function togglePsiGroupAll(group: string) {
    const groupItems = PSI_SUB_MODULES.filter(sm => sm.group === group);
    const allPerms = groupItems.flatMap(sm => sm.actions.map(a => `psi:${sm.key}:${a}`));
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev => {
      const groupPrefixes = groupItems.map(sm => `psi:${sm.key}:`);
      const withoutGroup = prev.filter(p => !groupPrefixes.some(prefix => p.startsWith(prefix)));
      return hasAll ? withoutGroup : [...new Set([...withoutGroup, ...allPerms])];
    });
  }

  function toggleFinancePerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view' && action !== 'allow') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleFinanceAll() {
    const allPerms = FINANCE_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `finance:${sm.key}:${a}`)
    );
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('finance:')) : [...new Set([...prev.filter(p => !p.startsWith('finance:')), ...allPerms])]
    );
  }

  function toggleFinanceSubModuleAll(smKey: string) {
    const sm = FINANCE_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `finance:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`finance:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`finance:${smKey}:`)), ...perms]
    );
  }

  function toggleFinanceGroupAll(group: string) {
    const groupItems = FINANCE_SUB_MODULES.filter(sm => sm.group === group);
    const allPerms = groupItems.flatMap(sm => sm.actions.map(a => `finance:${sm.key}:${a}`));
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev => {
      const groupPrefixes = groupItems.map(sm => `finance:${sm.key}:`);
      const withoutGroup = prev.filter(p => !groupPrefixes.some(prefix => p.startsWith(prefix)));
      return hasAll ? withoutGroup : [...new Set([...withoutGroup, ...allPerms])];
    });
  }

  function toggleModulePerm(modId: string) {
    setRolePerms(prev => {
      if (prev.includes(modId)) {
        if (modId === 'settings') {
          return prev.filter(p => p !== modId && !p.startsWith('settings:'));
        }
        if (modId === 'basic') {
          return prev.filter(p => p !== modId && !p.startsWith('basic:'));
        }
        if (modId === 'production') {
          return prev.filter(p => p !== modId && !p.startsWith('production:'));
        }
        if (modId === 'psi') {
          return prev.filter(p => p !== modId && !p.startsWith('psi:'));
        }
        if (modId === 'finance') {
          return prev.filter(p => p !== modId && !p.startsWith('finance:'));
        }
        return prev.filter(p => p !== modId);
      }
      return [...prev, modId];
    });
  }

  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const settingsModuleChecked = rolePerms.includes('settings');
  const [basicExpanded, setBasicExpanded] = useState(false);
  const basicModuleChecked = rolePerms.includes('basic');
  const [productionExpanded, setProductionExpanded] = useState(false);
  const productionModuleChecked = rolePerms.includes('production');
  const [psiExpanded, setPsiExpanded] = useState(false);
  const psiModuleChecked = rolePerms.includes('psi');
  const [financeExpanded, setFinanceExpanded] = useState(false);
  const financeModuleChecked = rolePerms.includes('finance');

  function permSummary(perms: string[]): string {
    const settingsCount = SETTINGS_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`settings:${sm.key}:`))).length;
    const basicCount = BASIC_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`basic:${sm.key}:`))).length;
    const productionCount = PRODUCTION_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`production:${sm.key}:`))).length;
    const psiCount = PSI_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`psi:${sm.key}:`))).length;
    const financeCount = FINANCE_SUB_MODULES.filter(sm => perms.some(p => p.startsWith(`finance:${sm.key}:`))).length;
    const modules = ALL_PERMISSIONS
      .filter(p => perms.includes(p.id))
      .map(p => {
        if (p.id === 'settings' && settingsCount > 0) return `${p.label}(${settingsCount}项)`;
        if (p.id === 'basic' && basicCount > 0) return `${p.label}(${basicCount}项)`;
        if (p.id === 'production' && productionCount > 0) return `${p.label}(${productionCount}项)`;
        if (p.id === 'psi' && psiCount > 0) return `${p.label}(${psiCount}项)`;
        if (p.id === 'finance' && financeCount > 0) return `${p.label}(${financeCount}项)`;
        return p.label;
      });
    if (!perms.includes('settings') && settingsCount > 0) modules.push(`系统设置(${settingsCount}项)`);
    if (!perms.includes('basic') && basicCount > 0) modules.push(`基础信息(${basicCount}项)`);
    if (!perms.includes('production') && productionCount > 0) modules.push(`生产管理(${productionCount}项)`);
    if (!perms.includes('psi') && psiCount > 0) modules.push(`进销存(${psiCount}项)`);
    if (!perms.includes('finance') && financeCount > 0) modules.push(`财务结算(${financeCount}项)`);
    return modules.length > 0 ? modules.join('、') : '无权限';
  }

  if (loading) {
    return <div className="flex items-center justify-start h-64 pl-0"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-8 w-full text-left">
      <div className="flex flex-col gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">成员管理</h1>
          <p className="text-slate-500 mt-1 italic text-sm">管理企业成员、审核加入申请、邀请码与角色权限</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-start">
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
                    tab === t.key ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'
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
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                  tab === t.key
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <t.icon className="w-4 h-4 flex-shrink-0" /> {t.label}
                {badge}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 邀请码 ── */}
      {tab === 'invite' && tenantInfo && (
        <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm w-full">
          <h3 className="font-bold text-lg text-slate-900 mb-1">企业邀请码</h3>
          <p className="text-sm text-slate-500 mb-6">将此邀请码分享给需要加入的成员</p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-2xl">
            <div className="flex-1 min-w-0 px-4 py-3 bg-slate-50 rounded-xl font-mono text-lg font-bold tracking-wider text-slate-900 text-left border border-slate-100">
              {tenantInfo.inviteCode}
            </div>
            <button type="button" onClick={copyInviteCode}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 shrink-0">
              <Copy className="w-5 h-5" /> 复制
            </button>
          </div>
        </div>
      )}

      {/* ── 待审核 ── */}
      {tab === 'applications' && (
        <div className="bg-white rounded-[32px] border border-slate-200 w-full overflow-hidden shadow-sm">
          {applications.length === 0 ? (
            <div className="p-8 text-left text-slate-400 font-medium">暂无待审核申请</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {applications.map(app => (
                <div key={app.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-left">
                  <div>
                    <div className="font-medium">{app.user.displayName || app.user.username}</div>
                    <div className="text-xs text-gray-400">{app.user.phone} · {new Date(app.createdAt).toLocaleDateString()}</div>
                    {app.message && <div className="text-xs text-gray-500 mt-1">留言：{app.message}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleReview(app.id, 'APPROVED')} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1">
                      <Check className="w-3 h-3" /> 通过
                    </button>
                    <button onClick={() => handleReview(app.id, 'REJECTED')} className="px-3 py-1.5 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200 flex items-center gap-1">
                      <X className="w-3 h-3" /> 拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 成员列表 ── */}
      {tab === 'members' && (
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
                    {canManage && m.role !== 'owner' && memberHasReportPerm(m) && (
                      <button
                        type="button"
                        onClick={() => openMilestoneModal(m)}
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
                          onChange={e => handleAssignRole(m.userId, e.target.value || null)}
                          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5"
                        >
                          <option value="">未分配角色</option>
                          {rolesList.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        {tenantRole === 'owner' && (
                          <button onClick={() => handleRemoveMember(m.userId)} className="p-1 text-red-400 hover:text-red-600">
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
      )}

      {/* ── 角色管理 ── */}
      {tab === 'roles' && canManage && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg text-slate-900">角色列表</h3>
              <p className="text-sm text-slate-500">创建角色并配置细粒度权限，然后分配给成员</p>
            </div>
            <button onClick={openCreateRole}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> 新建角色
            </button>
          </div>

          {rolesList.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm text-center">
              <KeyRound className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">还没有自定义角色</p>
              <p className="text-slate-400 text-sm mt-1">点击「新建角色」创建第一个角色</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {rolesList.map(role => (
                <div key={role.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className="font-bold text-slate-900">{role.name}</h4>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          {role._count?.members ?? 0} 人使用
                        </span>
                      </div>
                      {role.description && <p className="text-sm text-slate-500 mb-2">{role.description}</p>}
                      <p className="text-xs text-slate-400">
                        权限：{permSummary(Array.isArray(role.permissions) ? role.permissions as string[] : [])}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditRole(role)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!role.isSystem && (
                        <button onClick={() => handleDeleteRole(role)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 角色编辑弹窗 ── */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRoleModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-900">{editingRole ? '编辑角色' : '新建角色'}</h3>
            </div>
            <div className="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色名称 *</label>
                <input type="text" value={roleName} onChange={e => setRoleName(e.target.value)}
                  placeholder="如：生产主管、仓库管理员"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                <input type="text" value={roleDesc} onChange={e => setRoleDesc(e.target.value)}
                  placeholder="可选，简述此角色的职责"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
              </div>

              {/* 模块级权限 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">模块权限</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMISSIONS.map(p => (
                    <label key={p.id} className="flex items-center gap-1.5 text-xs cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                      <input type="checkbox" checked={rolePerms.includes(p.id)}
                        onChange={() => toggleModulePerm(p.id)}
                        className="rounded border-gray-300 text-indigo-600" />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* 基础信息细粒度权限矩阵 */}
              {basicModuleChecked && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBasicExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-700">基础信息 - 细粒度权限</span>
                    <div className="flex items-center gap-2">
                      {!basicExpanded && rolePerms.some(p => p.startsWith('basic:')) && (
                        <span className="text-xs text-indigo-500 font-medium">
                          已配置 {BASIC_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`basic:${sm.key}:`))).length} 项
                        </span>
                      )}
                      {basicExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {basicExpanded && (
                    <>
                      <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                        不配置细粒度权限时，拥有基础信息的全部权限
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-t border-slate-100">
                            <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={BASIC_SUB_MODULES.flatMap(sm => sm.actions.map(a => `basic:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                  onChange={toggleBasicAll}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                                全选
                              </label>
                            </th>
                            {['view', 'create', 'edit', 'delete'].map(a => (
                              <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {BASIC_SUB_MODULES.map(sm => (
                            <tr key={sm.key} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 text-slate-700 font-medium">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={sm.actions.every(a => rolePerms.includes(`basic:${sm.key}:${a}`))}
                                    onChange={() => toggleBasicSubModuleAll(sm.key)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                  {sm.label}
                                </label>
                              </td>
                              {['view', 'create', 'edit', 'delete'].map(action => {
                                const perm = `basic:${sm.key}:${action}`;
                                const available = sm.actions.includes(action);
                                return (
                                  <td key={action} className="text-center px-2 py-2.5">
                                    {available ? (
                                      <input
                                        type="checkbox"
                                        checked={rolePerms.includes(perm)}
                                        onChange={() => toggleBasicPerm(perm)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {/* 生产管理细粒度权限矩阵 */}
              {productionModuleChecked && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setProductionExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-700">生产管理 - 细粒度权限</span>
                    <div className="flex items-center gap-2">
                      {!productionExpanded && rolePerms.some(p => p.startsWith('production:')) && (
                        <span className="text-xs text-indigo-500 font-medium">
                          已配置 {PRODUCTION_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`production:${sm.key}:`))).length} 项
                        </span>
                      )}
                      {productionExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {productionExpanded && (
                    <>
                      <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                        不配置细粒度权限时，拥有生产管理的全部权限
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-t border-slate-100">
                            <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={PRODUCTION_SUB_MODULES.flatMap(sm => sm.actions.map(a => `production:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                  onChange={toggleProductionAll}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                                全选
                              </label>
                            </th>
                            {['view', 'create', 'edit', 'delete'].map(a => (
                              <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            const groups = [...new Set(PRODUCTION_SUB_MODULES.map(sm => sm.group))];
                            const rows: React.ReactNode[] = [];
                            for (const group of groups) {
                              const items = PRODUCTION_SUB_MODULES.filter(sm => sm.group === group);
                              const allowItems = items.filter(sm => sm.actions.length === 1 && sm.actions[0] === 'allow');
                              const crudItems = items.filter(sm => !(sm.actions.length === 1 && sm.actions[0] === 'allow'));
                              rows.push(
                                <tr key={`pg-${group}`} className="bg-indigo-50/40">
                                  <td colSpan={5} className="px-4 py-1.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={items.flatMap(sm => sm.actions.map(a => `production:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                        onChange={() => toggleProductionGroupAll(group)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{group}</span>
                                    </label>
                                  </td>
                                </tr>
                              );
                              {/* "允许"类项合并为一行 */}
                              {allowItems.length > 0 && rows.push(
                                <tr key={`pa-${group}`} className="hover:bg-slate-50/50">
                                  <td colSpan={5} className="px-4 pl-8 py-2.5">
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                                      {allowItems.map(sm => (
                                        <label key={sm.key} className="flex items-center gap-1.5 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={rolePerms.includes(`production:${sm.key}:allow`)}
                                            onChange={() => toggleProductionSubModuleAll(sm.key)}
                                            className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                          />
                                          <span className="text-sm text-slate-700 font-medium">{sm.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {/* CRUD 类项每行单独显示 */}
                              for (const sm of crudItems) {
                                rows.push(
                                  <tr key={sm.key} className="hover:bg-slate-50/50">
                                    <td className="px-4 pl-8 py-2.5 text-slate-700 font-medium">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={sm.actions.every(a => rolePerms.includes(`production:${sm.key}:${a}`))}
                                          onChange={() => toggleProductionSubModuleAll(sm.key)}
                                          className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                        />
                                        {sm.label}
                                      </label>
                                    </td>
                                    {['view', 'create', 'edit', 'delete'].map(action => {
                                      const perm = `production:${sm.key}:${action}`;
                                      const available = sm.actions.includes(action);
                                      return (
                                        <td key={action} className="text-center px-2 py-2.5">
                                          {available ? (
                                            <input
                                              type="checkbox"
                                              checked={rolePerms.includes(perm)}
                                              onChange={() => toggleProductionPerm(perm)}
                                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                            />
                                          ) : (
                                            <span className="text-slate-300">—</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              }
                            }
                            return rows;
                          })()}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {/* 进销存细粒度权限矩阵 */}
              {psiModuleChecked && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPsiExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-700">进销存 - 细粒度权限</span>
                    <div className="flex items-center gap-2">
                      {!psiExpanded && rolePerms.some(p => p.startsWith('psi:')) && (
                        <span className="text-xs text-indigo-500 font-medium">
                          已配置 {PSI_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`psi:${sm.key}:`))).length} 项
                        </span>
                      )}
                      {psiExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {psiExpanded && (
                    <>
                      <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                        不配置细粒度权限时，拥有进销存的全部权限
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-t border-slate-100">
                            <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={PSI_SUB_MODULES.flatMap(sm => sm.actions.map(a => `psi:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                  onChange={togglePsiAll}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                                全选
                              </label>
                            </th>
                            {['view', 'create', 'edit', 'delete'].map(a => (
                              <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            const groups = [...new Set(PSI_SUB_MODULES.map(sm => sm.group))];
                            const rows: React.ReactNode[] = [];
                            for (const group of groups) {
                              const items = PSI_SUB_MODULES.filter(sm => sm.group === group);
                              const allowItems = items.filter(sm => sm.actions.length === 1 && sm.actions[0] === 'allow');
                              const crudItems = items.filter(sm => !(sm.actions.length === 1 && sm.actions[0] === 'allow'));
                              rows.push(
                                <tr key={`psi-g-${group}`} className="bg-indigo-50/40">
                                  <td colSpan={5} className="px-4 py-1.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={items.flatMap(sm => sm.actions.map(a => `psi:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                        onChange={() => togglePsiGroupAll(group)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{group}</span>
                                    </label>
                                  </td>
                                </tr>
                              );
                              {allowItems.length > 0 && rows.push(
                                <tr key={`psi-a-${group}`} className="hover:bg-slate-50/50">
                                  <td colSpan={5} className="px-4 pl-8 py-2.5">
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                                      {allowItems.map(sm => (
                                        <label key={sm.key} className="flex items-center gap-1.5 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={rolePerms.includes(`psi:${sm.key}:allow`)}
                                            onChange={() => togglePsiSubModuleAll(sm.key)}
                                            className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                          />
                                          <span className="text-sm text-slate-700 font-medium">{sm.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              for (const sm of crudItems) {
                                rows.push(
                                  <tr key={sm.key} className="hover:bg-slate-50/50">
                                    <td className="px-4 pl-8 py-2.5 text-slate-700 font-medium">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={sm.actions.every(a => rolePerms.includes(`psi:${sm.key}:${a}`))}
                                          onChange={() => togglePsiSubModuleAll(sm.key)}
                                          className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                        />
                                        {sm.label}
                                      </label>
                                    </td>
                                    {['view', 'create', 'edit', 'delete'].map(action => {
                                      const perm = `psi:${sm.key}:${action}`;
                                      const available = sm.actions.includes(action);
                                      return (
                                        <td key={action} className="text-center px-2 py-2.5">
                                          {available ? (
                                            <input
                                              type="checkbox"
                                              checked={rolePerms.includes(perm)}
                                              onChange={() => togglePsiPerm(perm)}
                                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                            />
                                          ) : (
                                            <span className="text-slate-300">—</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              }
                            }
                            return rows;
                          })()}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {/* 财务结算细粒度权限矩阵 */}
              {financeModuleChecked && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFinanceExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-700">财务结算 - 细粒度权限</span>
                    <div className="flex items-center gap-2">
                      {!financeExpanded && rolePerms.some(p => p.startsWith('finance:')) && (
                        <span className="text-xs text-indigo-500 font-medium">
                          已配置 {FINANCE_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`finance:${sm.key}:`))).length} 项
                        </span>
                      )}
                      {financeExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {financeExpanded && (
                    <>
                      <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                        不配置细粒度权限时，拥有财务结算的全部权限
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-t border-slate-100">
                            <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={FINANCE_SUB_MODULES.flatMap(sm => sm.actions.map(a => `finance:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                  onChange={toggleFinanceAll}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                                全选
                              </label>
                            </th>
                            {['view', 'create', 'edit', 'delete'].map(a => (
                              <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            const groups = [...new Set(FINANCE_SUB_MODULES.map(sm => sm.group))];
                            const rows: React.ReactNode[] = [];
                            for (const group of groups) {
                              const items = FINANCE_SUB_MODULES.filter(sm => sm.group === group);
                              const allowItems = items.filter(sm => sm.actions.length === 1 && sm.actions[0] === 'allow');
                              const crudItems = items.filter(sm => !(sm.actions.length === 1 && sm.actions[0] === 'allow'));
                              rows.push(
                                <tr key={`fin-g-${group}`} className="bg-indigo-50/40">
                                  <td colSpan={5} className="px-4 py-1.5">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={items.flatMap(sm => sm.actions.map(a => `finance:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                        onChange={() => toggleFinanceGroupAll(group)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{group}</span>
                                    </label>
                                  </td>
                                </tr>
                              );
                              {allowItems.length > 0 && rows.push(
                                <tr key={`fin-a-${group}`} className="hover:bg-slate-50/50">
                                  <td colSpan={5} className="px-4 pl-8 py-2.5">
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                                      {allowItems.map(sm => (
                                        <label key={sm.key} className="flex items-center gap-1.5 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={rolePerms.includes(`finance:${sm.key}:allow`)}
                                            onChange={() => toggleFinanceSubModuleAll(sm.key)}
                                            className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                          />
                                          <span className="text-sm text-slate-700 font-medium">{sm.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              for (const sm of crudItems) {
                                rows.push(
                                  <tr key={sm.key} className="hover:bg-slate-50/50">
                                    <td className="px-4 pl-8 py-2.5 text-slate-700 font-medium">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={sm.actions.every(a => rolePerms.includes(`finance:${sm.key}:${a}`))}
                                          onChange={() => toggleFinanceSubModuleAll(sm.key)}
                                          className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                        />
                                        {sm.label}
                                      </label>
                                    </td>
                                    {['view', 'create', 'edit', 'delete'].map(action => {
                                      const perm = `finance:${sm.key}:${action}`;
                                      const available = sm.actions.includes(action);
                                      return (
                                        <td key={action} className="text-center px-2 py-2.5">
                                          {available ? (
                                            <input
                                              type="checkbox"
                                              checked={rolePerms.includes(perm)}
                                              onChange={() => toggleFinancePerm(perm)}
                                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                            />
                                          ) : (
                                            <span className="text-slate-300">—</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              }
                            }
                            return rows;
                          })()}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {/* 系统设置细粒度权限矩阵 */}
              {settingsModuleChecked && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSettingsExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-sm font-bold text-slate-700">系统设置 - 细粒度权限</span>
                    <div className="flex items-center gap-2">
                      {!settingsExpanded && rolePerms.some(p => p.startsWith('settings:')) && (
                        <span className="text-xs text-indigo-500 font-medium">
                          已配置 {SETTINGS_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`settings:${sm.key}:`))).length} 项
                        </span>
                      )}
                      {settingsExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {settingsExpanded && (
                    <>
                      <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                        不配置细粒度权限时，拥有系统设置的全部权限
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-t border-slate-100">
                            <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={SETTINGS_SUB_MODULES.flatMap(sm => sm.actions.map(a => `settings:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                  onChange={toggleSettingsAll}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                                全选
                              </label>
                            </th>
                            {['view', 'create', 'edit', 'delete'].map(a => (
                              <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {SETTINGS_SUB_MODULES.map(sm => (
                            <tr key={sm.key} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 text-slate-700 font-medium">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={sm.actions.every(a => rolePerms.includes(`settings:${sm.key}:${a}`))}
                                    onChange={() => toggleSettingsSubModuleAll(sm.key)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                  {sm.label}
                                </label>
                              </td>
                              {['view', 'create', 'edit', 'delete'].map(action => {
                                const perm = `settings:${sm.key}:${action}`;
                                const available = sm.actions.includes(action);
                                return (
                                  <td key={action} className="text-center px-2 py-2.5">
                                    {available ? (
                                      <input
                                        type="checkbox"
                                        checked={rolePerms.includes(perm)}
                                        onChange={() => toggleSettingsPerm(perm)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-white rounded-b-2xl">
              <button onClick={() => setRoleModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">
                取消
              </button>
              <button onClick={handleSaveRole}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
                {editingRole ? '保存修改' : '创建角色'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 工序分配弹窗 ── */}
      {milestoneModalOpen && milestoneEditMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMilestoneModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col mx-4"
            onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">分配生产工序权限</h3>
                  <p className="text-xs text-slate-400">{milestoneEditMember.displayName || milestoneEditMember.username}</p>
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
              <button onClick={() => setMilestoneModalOpen(false)}
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
      )}
    </div>
  );
}
