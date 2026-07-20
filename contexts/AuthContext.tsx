import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { clearTokens, refreshSessionSilently } from '../services/api';
import type { TenantInfo } from '../services/api';
import { isTenantElevatedRole } from '../utils/hasModulePerm';

export type TenantContext = {
  tenantId: string;
  tenantName: string;
  tenantRole: string;
  permissions: string[];
  status?: string;
  expiresAt?: string | null;
  /** 企业是否启用设备模块（由平台在「企业管理」中配置） */
  equipmentFeaturesEnabled?: boolean;
  /** 租户行业类型（平台在「企业管理」中指定；缺省视为 generic） */
  industryKind?: string;
};

type LoginData = {
  user: Record<string, unknown>;
  tenants: TenantInfo[];
  isEnterprise: boolean;
  tenantId?: string | null;
};

type TenantReadyResult = {
  tenantId: string;
  tenantName: string;
  tenantRole: string;
  permissions: string[];
  status?: string;
  expiresAt?: string | null;
  equipmentFeaturesEnabled?: boolean;
  industryKind?: string;
};

interface AuthContextValue {
  currentUser: Record<string, unknown> | null;
  tenantCtx: TenantContext | null;
  userTenants: TenantInfo[];
  isLoggedIn: boolean;
  userId: string;
  showOnboarding: boolean;
  setShowOnboarding: (v: boolean) => void;
  profileOpen: boolean;
  setProfileOpen: (v: boolean) => void;
  handleLogin: (data: LoginData) => void;
  handleLogout: () => void;
  handleSwitchTenant: () => void;
  handleTenantReady: (result: TenantReadyResult) => void;
  onProfileUpdate: (user: Record<string, unknown>) => void;
  onTenantCtxUpdate: (ctx: TenantContext) => void;
  hasPerm: (mod: string) => boolean;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const clearSessionQueryCache = useCallback(() => {
    // 切换账号/企业后清掉列表缓存，避免复用「仅本人可见」等按用户过滤的结果
    queryClient.clear();
  }, [queryClient]);

  const [currentUser, setCurrentUser] = useState<Record<string, unknown> | null>(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [tenantCtx, setTenantCtx] = useState<TenantContext | null>(() => {
    const saved = localStorage.getItem('tenantCtx');
    return saved ? JSON.parse(saved) : null;
  });
  const [userTenants, setUserTenants] = useState<TenantInfo[]>(() => {
    const saved = localStorage.getItem('userTenants');
    return saved ? JSON.parse(saved) : [];
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isLoggedIn = !!currentUser && !!localStorage.getItem('isLoggedIn');
  const userId = String(currentUser?.id ?? '');

  const hasPerm = useCallback(
    (mod: string) => {
      if (!tenantCtx) return false;
      if (isTenantElevatedRole(tenantCtx.tenantRole)) return true;
      const perms = tenantCtx.permissions;
      // 成员未绑定角色（或角色无权限）时不得默认获得全模块权限。
      if (!perms || perms.length === 0) return false;
      return perms.includes(mod) || perms.some(p => p.startsWith(`${mod}:`));
    },
    [tenantCtx],
  );

  const handleLogin = useCallback(
    (loginData: LoginData) => {
      clearSessionQueryCache();
      setCurrentUser(loginData.user);
      localStorage.setItem('currentUser', JSON.stringify(loginData.user));
      localStorage.setItem('isLoggedIn', '1');
      setUserTenants(loginData.tenants || []);
      localStorage.setItem('userTenants', JSON.stringify(loginData.tenants || []));

      // 登录后一律进入选企业页（单企业也要确认），不因响应里的 tenantId 自动进入。
      setTenantCtx(null);
      localStorage.removeItem('tenantCtx');
      navigate('/', { replace: true });
    },
    [navigate, clearSessionQueryCache],
  );

  const handleLogout = useCallback(() => {
    api.auth.logout().catch(() => {});
    clearTokens();
    clearSessionQueryCache();
    localStorage.removeItem('currentUser');
    localStorage.removeItem('tenantCtx');
    localStorage.removeItem('userTenants');
    localStorage.removeItem('isLoggedIn');
    setCurrentUser(null);
    setTenantCtx(null);
    setUserTenants([]);
    navigate('/', { replace: true });
  }, [navigate, clearSessionQueryCache]);

  const handleTenantReady = useCallback(
    (result: TenantReadyResult) => {
      clearSessionQueryCache();
      const ctx: TenantContext = {
        tenantId: result.tenantId,
        tenantName: result.tenantName,
        tenantRole: result.tenantRole,
        permissions: result.permissions,
        status: result.status,
        expiresAt: result.expiresAt ?? null,
        equipmentFeaturesEnabled: result.equipmentFeaturesEnabled,
        industryKind: result.industryKind,
      };
      setTenantCtx(ctx);
      localStorage.setItem('tenantCtx', JSON.stringify(ctx));
      setShowOnboarding(false);
      api.tenants
        .list()
        .then(list => {
          const infos: TenantInfo[] = list.map((t: any) => ({
            id: t.id, name: t.name, role: t.role,
            permissions: typeof t.permissions === 'string' ? JSON.parse(t.permissions) : (t.permissions || []),
            status: t.status, expiresAt: t.expiresAt ?? null,
            equipmentFeaturesEnabled: t.equipmentFeaturesEnabled,
            industryKind: t.industryKind,
          }));
          setUserTenants(infos);
          localStorage.setItem('userTenants', JSON.stringify(infos));
        })
        .catch(() => {});
      navigate('/', { replace: true });
    },
    [navigate, clearSessionQueryCache],
  );

  const handleSwitchTenant = useCallback(() => {
    clearSessionQueryCache();
    setTenantCtx(null);
    setShowOnboarding(false);
    localStorage.removeItem('tenantCtx');
  }, [clearSessionQueryCache]);

  const onProfileUpdate = useCallback((user: Record<string, unknown>) => {
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  }, []);

  const onTenantCtxUpdate = useCallback((ctx: TenantContext) => {
    setTenantCtx(ctx);
    localStorage.setItem('tenantCtx', JSON.stringify(ctx));
  }, []);

  // 长时间空闲后 access 会过期；进页/回前台/定时静默刷新，避免一点击就大量 401
  useEffect(() => {
    if (!localStorage.getItem('isLoggedIn')) return;
    void refreshSessionSilently();
  }, []);

  /** 从服务端同步租户列表与有效权限（角色变更后避免 localStorage 残留 workbench 等键） */
  const syncTenantPermissions = useCallback(() => {
    if (!isLoggedIn) return;
    const currentTenantId = (() => {
      try {
        const raw = localStorage.getItem('tenantCtx');
        if (!raw) return null;
        return (JSON.parse(raw) as TenantContext).tenantId ?? null;
      } catch {
        return null;
      }
    })();
    api.tenants
      .list()
      .then(list => {
        const infos: TenantInfo[] = list.map((t: any) => ({
          id: t.id, name: t.name, role: t.role,
          permissions: typeof t.permissions === 'string' ? JSON.parse(t.permissions) : (t.permissions || []),
          status: t.status, expiresAt: t.expiresAt ?? null,
          equipmentFeaturesEnabled: t.equipmentFeaturesEnabled,
          industryKind: t.industryKind,
        }));
        setUserTenants(infos);
        localStorage.setItem('userTenants', JSON.stringify(infos));
        setTenantCtx(prev => {
          const tid = prev?.tenantId ?? currentTenantId;
          if (!tid) return prev;
          const matched = infos.find(t => t.id === tid);
          if (!matched) return prev;
          const next: TenantContext = {
            tenantId: matched.id,
            tenantName: matched.name,
            tenantRole: matched.role,
            permissions: matched.permissions,
            status: matched.status,
            expiresAt: matched.expiresAt ?? null,
            equipmentFeaturesEnabled: matched.equipmentFeaturesEnabled,
            industryKind: matched.industryKind,
          };
          if (prev && JSON.stringify(next) === JSON.stringify(prev)) return prev;
          localStorage.setItem('tenantCtx', JSON.stringify(next));
          return next;
        });
      })
      .catch(() => {});
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !tenantCtx?.tenantId) return;
    // Phase 3.F：延后 2.5s，避免与首屏 critical 批数据请求抢占浏览器并发连接；
    // 期间沿用 localStorage 权限渲染，同步完成后自动纠正。
    const t = window.setTimeout(() => syncTenantPermissions(), 2500);
    return () => window.clearTimeout(t);
  }, [isLoggedIn, tenantCtx?.tenantId, syncTenantPermissions]);

  /**
   * 后端 access 默认约 15m（JWT_EXPIRES_IN）。原先每 8m 刷新一次：若某次失败，下次已到 16m 之后，令牌已过期，仍在操作也会被踢。
   * 改为约 4m 一次，并网络恢复时再试，给足重试窗口。
   * 回前台时同时刷新会话与租户权限。
   */
  useEffect(() => {
    if (!isLoggedIn) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshSessionSilently();
        syncTenantPermissions();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const tick = () => {
      void refreshSessionSilently();
      syncTenantPermissions();
    };
    const t = window.setInterval(tick, 4 * 60 * 1000);
    window.addEventListener('online', tick);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(t);
      window.removeEventListener('online', tick);
    };
  }, [isLoggedIn, syncTenantPermissions]);

  const value: AuthContextValue = {
    currentUser,
    tenantCtx,
    userTenants,
    isLoggedIn,
    userId,
    showOnboarding,
    setShowOnboarding,
    profileOpen,
    setProfileOpen,
    handleLogin,
    handleLogout,
    handleSwitchTenant,
    handleTenantReady,
    onProfileUpdate,
    onTenantCtxUpdate,
    hasPerm,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** 无 Provider 时返回 null；用于需要在独立/测试场景渲染时避免崩溃的通用组件 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthCtx);
}
