const { TAB_MEMBERS, TAB_APPLICATIONS, TAB_INVITE } = require('../config/members.js');

function tenantRoleLabel(role) {
  if (role === 'owner') return '创建者';
  return '成员';
}

function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveMemberPermsLocal(member, rolesList) {
  if (!member) return [];
  if (member.role === 'owner') return ['process_report'];
  if (member.roleId) {
    const role = (rolesList || []).find((r) => r.id === member.roleId);
    if (role && Array.isArray(role.permissions)) return role.permissions;
  }
  return Array.isArray(member.permissions) ? member.permissions : [];
}

function memberHasReportPerm(member, rolesList) {
  if (!member) return false;
  if (member.role === 'owner') return true;
  const perms = resolveMemberPermsLocal(member, rolesList);
  return perms.includes('process_report');
}

function filterMembers(members, keyword) {
  const list = Array.isArray(members) ? members : [];
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((m) => {
    const hay = [m.displayName, m.username, m.phone, m.roleName, m.userId]
      .filter(Boolean)
      .join('\0')
      .toLowerCase();
    return hay.includes(q);
  });
}

function buildMemberListRows(members, rolesList, ctx) {
  const {
    canManage = false,
    tenantRole = '',
    currentUserId = '',
  } = ctx || {};

  return (members || []).map((m) => {
    const displayName = m.displayName || m.username || '未命名';
    const subline = m.phone || m.username || '';
    const milestoneCount = Array.isArray(m.assignedMilestoneIds) ? m.assignedMilestoneIds.length : 0;
    const isOwnerMember = m.role === 'owner';
    const isSelf = m.userId === currentUserId;
    const showAssignRole = canManage && !isOwnerMember && !isSelf;
    const showRemove = tenantRole === 'owner' && !isOwnerMember && !isSelf;
    const showMilestone = canManage && memberHasReportPerm(m, rolesList);

    return {
      id: m.id,
      userId: m.userId,
      displayName,
      subline,
      roleName: m.roleName || '',
      showRoleName: Boolean(m.roleName),
      tenantRoleLabel: tenantRoleLabel(m.role),
      showTenantRole: !m.roleName && Boolean(m.role),
      milestoneCount,
      milestoneText: `工序 ${milestoneCount} 个`,
      showMilestone,
      showAssignRole: showAssignRole,
      showRemove,
      roleId: m.roleId || '',
      assignedMilestoneIds: Array.isArray(m.assignedMilestoneIds) ? m.assignedMilestoneIds : [],
      avatarText: displayName.slice(0, 1) || '员',
    };
  });
}

function buildApplicationRows(applications) {
  return (applications || [])
    .filter((a) => a.status === 'PENDING')
    .map((a) => {
      const user = a.user || {};
      const displayName = user.displayName || user.username || '申请人';
      return {
        id: a.id,
        userId: a.userId,
        displayName,
        phone: user.phone || user.username || '',
        message: a.message || '',
        showMessage: Boolean(a.message),
        createdAtText: formatDateShort(a.createdAt),
        avatarText: displayName.slice(0, 1) || '申',
      };
    });
}

function buildSegmentTabs(activeTab, ctx) {
  const {
    canReviewApplications = false,
    pendingCount = 0,
  } = ctx || {};

  const tabs = [
    { key: TAB_MEMBERS, label: '成员列表', active: activeTab === TAB_MEMBERS, badge: 0, showBadge: false },
  ];

  if (canReviewApplications) {
    tabs.push({
      key: TAB_APPLICATIONS,
      label: '待审核',
      active: activeTab === TAB_APPLICATIONS,
      badge: pendingCount,
      showBadge: pendingCount > 0,
    });
  }

  tabs.push({
    key: TAB_INVITE,
    label: '邀请码',
    active: activeTab === TAB_INVITE,
    badge: 0,
    showBadge: false,
  });

  return tabs;
}

function buildMemberEmptyText(sourceCount, keyword) {
  const q = String(keyword || '').trim();
  if (sourceCount === 0) return '暂无成员';
  if (q) return '无匹配项，请调整搜索关键词';
  return '暂无成员';
}

module.exports = {
  tenantRoleLabel,
  filterMembers,
  buildMemberListRows,
  memberHasReportPerm,
  buildApplicationRows,
  buildSegmentTabs,
  buildMemberEmptyText,
};
