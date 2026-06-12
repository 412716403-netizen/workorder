import { request, persistAccessToken } from './_client';

// ── Roles ──
export type RoleRow = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number };
};

export const roles = {
  list: () => request<RoleRow[]>('/roles?all=true'),
  create: (data: { name: string; description?: string; permissions: string[] }) =>
    request<RoleRow>('/roles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<RoleRow>(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
};

// ── Tenants ──
export const tenants = {
  list: () => request<Array<{ id: string; name: string; logo?: string; inviteCode: string; status?: string; expiresAt?: string | null; role: string; permissions: unknown; joinedAt: string; equipmentFeaturesEnabled?: boolean; industryKind?: string }>>('/tenants?all=true'),
  create: (data: { name: string; logo?: string }) =>
    request<{ tenant: { id: string; name: string; status: string }; message: string }>('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  select: async (id: string) => {
    const result = await request<{
      tenantId: string;
      tenantName: string;
      tenantRole: string;
      permissions: string[];
      expiresAt?: string | null;
      equipmentFeaturesEnabled?: boolean;
      industryKind?: string;
      accessToken: string;
      refreshToken: string;
    }>(`/tenants/${id}/select`, { method: 'POST' });
    if (result.accessToken) persistAccessToken(result.accessToken);
    return result;
  },
  get: (id: string) => request<{ id: string; name: string; logo?: string; inviteCode: string; expiresAt?: string | null }>(`/tenants/${id}`),
  update: (id: string, data: { name?: string; logo?: string }) =>
    request(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  lookup: (code: string) => request<{ id: string; name: string; logo?: string; memberCount: number }>(`/tenants/lookup?code=${encodeURIComponent(code)}`),
  apply: (id: string, data?: { message?: string }) =>
    request(`/tenants/${id}/apply`, { method: 'POST', body: JSON.stringify(data || {}) }),
  myApplications: () => request<Array<{ id: string; tenantId: string; status: string; tenant: { id: string; name: string; logo?: string }; createdAt: string }>>('/tenants/my-applications'),
  getMembers: (id: string) =>
    request<Array<{ id: string; userId: string; username: string; phone?: string; displayName?: string; role: string; permissions: unknown; roleId?: string | null; roleName?: string | null; assignedMilestoneIds?: string[]; joinedAt: string }>>(`/tenants/${id}/members`),
  getReportableMembers: (id: string) =>
    request<Array<{ id: string; name: string; groupName: string; role: string; status: string; skills: string[]; assignedMilestoneIds: string[] }>>(`/tenants/${id}/reportable-members`),
  updateMemberRole: (id: string, uid: string, data: { role?: string; roleId?: string | null }) =>
    request(`/tenants/${id}/members/${uid}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMemberPerms: (id: string, uid: string, data: { permissions: string[] }) =>
    request(`/tenants/${id}/members/${uid}/perms`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMemberMilestones: (id: string, uid: string, data: { assignedMilestoneIds: string[] }) =>
    request(`/tenants/${id}/members/${uid}/milestones`, { method: 'PUT', body: JSON.stringify(data) }),
  removeMember: (id: string, uid: string) =>
    request(`/tenants/${id}/members/${uid}`, { method: 'DELETE' }),
  getApplications: (id: string) =>
    request<Array<{ id: string; userId: string; status: string; message?: string; user: { id: string; username: string; phone?: string; displayName?: string }; createdAt: string }>>(`/tenants/${id}/applications`),
  reviewApplication: (id: string, appId: string, data: { action: 'APPROVED' | 'REJECTED'; role?: string; permissions?: string[] }) =>
    request(`/tenants/${id}/applications/${appId}`, { method: 'PUT', body: JSON.stringify(data) }),
};
