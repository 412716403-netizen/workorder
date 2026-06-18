import { request, persistAccessToken } from './_client';

export type TenantInfo = {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  status?: string;
  expiresAt?: string | null;
  /** 企业是否启用设备模块；缺省为开 */
  equipmentFeaturesEnabled?: boolean;
  /** 租户行业类型（TenantIndustryKind；缺省视为 generic） */
  industryKind?: string;
};

export type LoginResult = {
  user: MeUser;
  accessToken: string;
  refreshToken: string;
  isEnterprise: boolean;
  tenants: TenantInfo[];
  tenantId?: string | null;
};

export type MeUser = {
  id: string;
  username: string;
  phone?: string | null;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  isEnterprise?: boolean;
  accountExpiresAt: string | null;
  tenants?: TenantInfo[];
};

// ── Auth ──
export const auth = {
  async register(data: { phone: string; password: string; displayName?: string }) {
    const result = await request<LoginResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (result.accessToken) persistAccessToken(result.accessToken);
    return result;
  },

  async login(username: string, password: string) {
    const result = await request<LoginResult>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    if (result.accessToken) persistAccessToken(result.accessToken);
    return result;
  },

  async logout() {
    await request('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    persistAccessToken(null);
  },

  async me() {
    return request<MeUser>('/auth/me');
  },

  async updateProfile(data: {
    displayName?: string;
    oldPassword?: string;
    newPassword?: string;
  }) {
    const result = await request<{
      user: MeUser;
      accessToken?: string;
      refreshToken?: string;
    }>('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
    if (result.accessToken) persistAccessToken(result.accessToken);
    return result;
  },

  async phoneChangeSendCodeOld(oldPhone: string) {
    return request<{ message: string; devCode?: string }>('/auth/phone-change/send-code-old', {
      method: 'POST',
      body: JSON.stringify({ oldPhone }),
    });
  },

  async phoneChangeVerifyOldCode(oldPhone: string, code: string) {
    return request<{ phaseToken: string }>('/auth/phone-change/verify-old-code', {
      method: 'POST',
      body: JSON.stringify({ oldPhone, code }),
    });
  },

  async phoneChangeSendCodeNew(phaseToken: string, newPhone: string) {
    return request<{ message: string; devCode?: string }>('/auth/phone-change/send-code-new', {
      method: 'POST',
      body: JSON.stringify({ phaseToken, newPhone }),
    });
  },

  async phoneChangeComplete(phaseToken: string, newPhone: string, code: string) {
    const result = await request<{
      user: MeUser;
      accessToken: string;
      refreshToken: string;
    }>('/auth/phone-change/complete', {
      method: 'POST',
      body: JSON.stringify({ phaseToken, newPhone, code }),
    });
    if (result.accessToken) persistAccessToken(result.accessToken);
    return result;
  },
};

export type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: string;
  status: string;
  accountExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const adminUsers = {
  list: () => request<AdminUserRow[]>('/admin/users?all=true'),
  create: (data: {
    username: string;
    password: string;
    displayName?: string;
    email?: string | null;
    role?: 'admin' | 'user';
    accountExpiresAt?: string | null;
  }) =>
    request<AdminUserRow>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: {
      displayName?: string;
      email?: string | null;
      role?: 'admin' | 'user';
      status?: 'active' | 'disabled';
      password?: string;
      accountExpiresAt?: string | null;
    },
  ) =>
    request<AdminUserRow>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
};

export type AdminTenantRow = {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  equipmentFeaturesEnabled?: boolean;
  industryKind: string;
  industryPresetAppliedAt: string | null;
  productionLinkMode: 'order' | 'product';
  productionLinkModeLocked?: boolean;
  memberCount: number;
  owner: { id: string; username: string; displayName: string | null; phone: string | null } | null;
  createdAt: string;
};

export type AdminTenantUpdateResponse = {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  equipmentFeaturesEnabled?: boolean;
  industryKind: string;
  industryPresetAppliedAt: string | null;
  productionLinkMode: 'order' | 'product';
  productionLinkModeLocked: boolean;
  presetSkippedReason?: string;
};

export const adminTenants = {
  list: (params?: { status?: string }) => {
    const p: Record<string, string> = { all: 'true' };
    if (params?.status) p.status = params.status;
    return request<AdminTenantRow[]>(`/admin/tenants?${new URLSearchParams(p).toString()}`);
  },
  update: (
    id: string,
    data: {
      expiresAt?: string | null;
      status?: string;
      equipmentModuleEnabled?: boolean;
      industryKind?: string;
      productionLinkMode?: 'order' | 'product';
    },
  ) =>
    request<AdminTenantUpdateResponse>(`/admin/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
