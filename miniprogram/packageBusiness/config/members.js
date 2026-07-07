/** 成员管理 Hub Tab */
const TAB_MEMBERS = 'members';
const TAB_APPLICATIONS = 'applications';
const TAB_INVITE = 'invite';

const TAB_KEYS = {
  MEMBERS: TAB_MEMBERS,
  APPLICATIONS: TAB_APPLICATIONS,
  INVITE: TAB_INVITE,
};

/** 审核通过默认角色与权限（对齐 Web MemberManagementView.handleReview） */
const REVIEW_APPROVE_DEFAULTS = {
  role: 'worker',
  permissions: ['production'],
};

module.exports = {
  TAB_MEMBERS,
  TAB_APPLICATIONS,
  TAB_INVITE,
  TAB_KEYS,
  REVIEW_APPROVE_DEFAULTS,
};
