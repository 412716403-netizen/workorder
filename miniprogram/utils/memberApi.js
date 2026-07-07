const { request } = require('./request.js');

function fetchMembers(tenantId) {
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}/members`,
    method: 'GET',
    timeout: 60000,
  }).catch(() => []);
}

function fetchTenant(tenantId) {
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}`,
    method: 'GET',
    timeout: 60000,
  });
}

function fetchApplications(tenantId) {
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}/applications`,
    method: 'GET',
    timeout: 60000,
  }).catch(() => []);
}

function reviewApplication(tenantId, appId, body) {
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}/applications/${encodeURIComponent(appId)}`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  });
}

function updateMemberRole(tenantId, uid, body) {
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  });
}

function updateMemberMilestones(tenantId, uid, body) {
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}/milestones`,
    method: 'PUT',
    data: body,
    timeout: 60000,
  });
}

function removeMember(tenantId, uid) {
  return request({
    path: `/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}`,
    method: 'DELETE',
    timeout: 60000,
  });
}

function fetchRolesAll() {
  return request({
    path: '/roles?all=true',
    method: 'GET',
    timeout: 60000,
  }).catch(() => []);
}

module.exports = {
  fetchMembers,
  fetchTenant,
  fetchApplications,
  reviewApplication,
  updateMemberRole,
  updateMemberMilestones,
  removeMember,
  fetchRolesAll,
};
