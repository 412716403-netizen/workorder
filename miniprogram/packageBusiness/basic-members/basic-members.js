const { readTenantCtx, readCurrentUserId } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { TAB_MEMBERS, REVIEW_APPROVE_DEFAULTS } = require('../config/members.js');
const {
  filterMembers,
  buildMemberListRows,
  buildApplicationRows,
  buildSegmentTabs,
  buildMemberEmptyText,
} = require('../utils/members.js');
const {
  fetchMembers,
  fetchTenant,
  fetchApplications,
  reviewApplication,
  updateMemberRole,
  updateMemberMilestones,
  removeMember,
  fetchRolesAll,
} = require('../utils/memberApi.js');
const { fetchNodesAll } = require('../utils/planApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { shouldHubListRefetch, trackHubListHidden, LIST_ROUTES } = require('../utils/saveNavigation.js');

const HUB_LIST_ROUTE = LIST_ROUTES.BASIC_MEMBERS.replace(/^\//, '');

/** 与 basic-partners 一致：蓝区始终含搜索工具行 */
function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function applyNavMetrics(page, nav) {
  page.setData({
    statusBarHeight: nav.statusBarHeight,
    navBarHeight: nav.navBarHeight,
    headerBlockHeight: computeHeaderBlockHeight(nav),
  });
}

Page({
  data: {
    loading: true,
    activeTab: TAB_MEMBERS,
    segmentTabs: [],
    searchKeyword: '',
    memberRows: [],
    applicationRows: [],
    memberCount: 0,
    memberEmptyText: '暂无成员',
    canManage: false,
    canReviewApplications: false,
    isOwner: false,
    tenantName: '',
    inviteCode: '',
    pendingCount: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    rolePickerVisible: false,
    rolePickerValue: '',
    rolePickerMemberName: '',
    roleOptions: [],
    milestonePickerVisible: false,
    milestonePickerValue: [],
    milestonePickerMemberName: '',
    processNodes: [],
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this._initialized = false;
    this._members = [];
    this._applications = [];
    this._roles = [];
    this._globalNodes = [];
    this._roleMember = null;
    this._milestoneMember = null;
    applyNavMetrics(this, nav);
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    if (!hasPermission(ctx.permissions || [], 'basic:members:view')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const tenantRole = ctx.tenantRole || '';
    const canManage = tenantRole === 'owner' || tenantRole === 'admin';
    const canReviewApplications = canManage
      || hasPermission(ctx.permissions || [], 'basic:members:create');

    this._tenantCtx = ctx;
    this._currentUserId = readCurrentUserId();
    this.setData({
      canManage,
      canReviewApplications,
      isOwner: tenantRole === 'owner',
    });

    if (!this._initialized) {
      this.bootstrap();
    } else if (shouldHubListRefetch(this, HUB_LIST_ROUTE)) {
      this.bootstrap();
    }
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onSegmentTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData({ activeTab: key, searchKeyword: '' });
    if (key === TAB_MEMBERS) {
      this.reloadMemberList();
    } else {
      this.refreshSegmentTabs();
    }
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword });
    if (this.data.activeTab !== TAB_MEMBERS) return;
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.reloadMemberList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    if (this.data.activeTab === TAB_MEMBERS) {
      this.reloadMemberList();
    }
  },

  onAssignRoleTap(e) {
    if (!this.data.canManage) return;
    const userId = e.currentTarget.dataset.userId;
    const member = (this._members || []).find((m) => m.userId === userId);
    if (!member) return;
    this._roleMember = member;
    this.setData({
      rolePickerVisible: true,
      rolePickerValue: member.roleId || '',
      rolePickerMemberName: member.displayName || member.username || '',
      roleOptions: this._roles || [],
    });
  },

  onRolePickerClose() {
    this._roleMember = null;
    this.setData({ rolePickerVisible: false });
  },

  async onRolePickerSelect(e) {
    const { roleId } = e.detail;
    const member = this._roleMember;
    const tenantId = this._tenantCtx && this._tenantCtx.tenantId;
    if (!member || !tenantId) return;
    try {
      await updateMemberRole(tenantId, member.userId, { roleId });
      wx.showToast({ title: '权限角色已更新', icon: 'success' });
      this.setData({ rolePickerVisible: false });
      this._roleMember = null;
      await this.bootstrap();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  onRemoveMemberTap(e) {
    const userId = e.currentTarget.dataset.userId;
    const member = (this._members || []).find((m) => m.userId === userId);
    if (!member || !this.data.isOwner) return;
    const name = member.displayName || member.username || '该成员';
    wx.showModal({
      title: '确认移除',
      content: `确认移除「${name}」？`,
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        const tenantId = this._tenantCtx && this._tenantCtx.tenantId;
        if (!tenantId) return;
        try {
          await removeMember(tenantId, userId);
          wx.showToast({ title: '成员已移除', icon: 'success' });
          await this.bootstrap();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
        }
      },
    });
  },

  onMilestoneTap(e) {
    if (!this.data.canManage) return;
    const userId = e.currentTarget.dataset.userId;
    const member = (this._members || []).find((m) => m.userId === userId);
    if (!member) return;
    this._milestoneMember = member;
    this.setData({
      milestonePickerVisible: true,
      milestonePickerValue: Array.isArray(member.assignedMilestoneIds) ? member.assignedMilestoneIds : [],
      milestonePickerMemberName: member.displayName || member.username || '',
      processNodes: (this._globalNodes || []).map((n) => ({ id: n.id, name: n.name || n.id })),
    });
  },

  onMilestonePickerClose() {
    this._milestoneMember = null;
    this.setData({ milestonePickerVisible: false });
  },

  async onMilestoneConfirm(e) {
    const { assignedMilestoneIds } = e.detail;
    const member = this._milestoneMember;
    const tenantId = this._tenantCtx && this._tenantCtx.tenantId;
    if (!member || !tenantId) return;
    try {
      await updateMemberMilestones(tenantId, member.userId, { assignedMilestoneIds });
      wx.showToast({ title: '工序权限已更新', icon: 'success' });
      this.setData({ milestonePickerVisible: false });
      this._milestoneMember = null;
      await this.bootstrap();
    } catch (err) {
      const picker = this.selectComponent('#milestonePicker');
      if (picker && picker.resetSaving) picker.resetSaving();
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    }
  },

  async onReviewTap(e) {
    const { id, action } = e.currentTarget.dataset;
    if (!id || !action || !this.data.canReviewApplications) return;
    const tenantId = this._tenantCtx && this._tenantCtx.tenantId;
    if (!tenantId) return;
    const isApprove = action === 'APPROVED';
    try {
      await reviewApplication(tenantId, id, {
        action,
        ...(isApprove ? REVIEW_APPROVE_DEFAULTS : {}),
      });
      wx.showToast({ title: isApprove ? '已通过' : '已拒绝', icon: 'success' });
      await this.bootstrap();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    }
  },

  onCopyInviteCode() {
    const code = this.data.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
    });
  },

  refreshSegmentTabs() {
    const applicationRows = buildApplicationRows(this._applications);
    this.setData({
      segmentTabs: buildSegmentTabs(this.data.activeTab, {
        canReviewApplications: this.data.canReviewApplications,
        pendingCount: applicationRows.length,
      }),
      applicationRows,
      pendingCount: applicationRows.length,
    });
  },

  reloadMemberList() {
    const filtered = filterMembers(this._members, this.data.searchKeyword);
    const memberRows = buildMemberListRows(filtered, this._roles, {
      canManage: this.data.canManage,
      tenantRole: this._tenantCtx && this._tenantCtx.tenantRole,
      currentUserId: this._currentUserId,
    });
    this.setData({
      memberRows,
      memberCount: (this._members || []).length,
      memberEmptyText: buildMemberEmptyText((this._members || []).length, this.data.searchKeyword),
    });
  },

  async bootstrap() {
    this._initialized = true;
    this.setData({ loading: true });
    const tenantId = this._tenantCtx && this._tenantCtx.tenantId;
    if (!tenantId) {
      this.setData({ loading: false });
      return;
    }

    try {
      const tasks = [
        fetchMembers(tenantId),
        fetchTenant(tenantId),
        this.data.canManage ? fetchRolesAll() : Promise.resolve([]),
        fetchNodesAll(),
      ];
      if (this.data.canReviewApplications) {
        tasks.splice(1, 0, fetchApplications(tenantId));
      }

      const results = await Promise.all(tasks);
      let idx = 0;
      const members = results[idx++] || [];
      let applications = [];
      if (this.data.canReviewApplications) {
        applications = results[idx++] || [];
      }
      const tenant = results[idx++];
      const roles = results[idx++] || [];
      const globalNodes = results[idx++] || [];

      this._members = Array.isArray(members) ? members : [];
      this._applications = Array.isArray(applications) ? applications : [];
      this._roles = Array.isArray(roles) ? roles : [];
      this._globalNodes = Array.isArray(globalNodes) ? globalNodes : [];

      const applicationRows = buildApplicationRows(this._applications);
      const segmentTabs = buildSegmentTabs(this.data.activeTab, {
        canReviewApplications: this.data.canReviewApplications,
        pendingCount: applicationRows.length,
      });

      this.reloadMemberList();
      this.setData({
        loading: false,
        segmentTabs,
        applicationRows,
        pendingCount: applicationRows.length,
        tenantName: (tenant && tenant.name) || '',
        inviteCode: (tenant && tenant.inviteCode) || '',
        roleOptions: this._roles,
        processNodes: this._globalNodes.map((n) => ({ id: n.id, name: n.name || n.id })),
      });
    } catch (err) {
      this.setData({
        loading: false,
        memberRows: [],
        applicationRows: [],
        memberEmptyText: (err && err.message) || '加载失败',
      });
    }
  },
});
