import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';
import { clearTokens } from '../services/api';
import type { TenantInfo } from '../services/api';

export type TenantContext = {
  tenantId: string;
  tenantName: string;
  tenantRole: string;
  permissions: string[];
  status?: string;
  expiresAt?: string | null;
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
      return (
        tenantCtx.tenantRole === 'owner' ||
        tenantCtx.permissions.includes(mod) ||
        tenantCtx.permissions.some(p => p.startsWith(`${mod}:`))
      );
    },
    [tenantCtx],
  );

  const handleLogin = useCallback(
    (loginData: LoginData) => {
      setCurrentUser(loginData.user);
      localStorage.setItem('currentUser', JSON.stringify(loginData.user));
      localStorage.setItem('isLoggedIn', '1');
      setUserTenants(loginData.tenants || []);
      localStorage.setItem('userTenants', JSON.stringify(loginData.tenants || []));

      if (loginData.tenantId && loginData.tenants?.length) {
        const matched = loginData.tenants.find(t => t.id === loginData.tenantId);
        if (matched && matched.status !== 'pending' && matched.status !== 'rejected') {
          const ctx: TenantContext = {
            tenantId: matched.id,
            tenantName: matched.name,
            tenantRole: matched.role,
            permissions: matched.permissions,
            status: matched.status,
            expiresAt: matched.expiresAt ?? null,
          };
          setTenantCtx(ctx);
          localStorage.setItem('tenantCtx', JSON.stringify(ctx));
        }
      } else {
        setTenantCtx(null);
        localStorage.removeItem('tenantCtx');
      }
      navigate('/', { replace: true });
    },
    [navigate],
  );

  const handleLogout = useCallback(() => {
    api.auth.logout().catch(() => {});
    clearTokens();
    localStorage.removeItem('currentUser');
    localStorage.removeItem('tenantCtx');
    localStorage.removeItem('userTenants');
    localStorage.removeItem('isLoggedIn');
    setCurrentUser(null);
    setTenantCtx(null);
    setUserTenants([]);
    navigate('/', { replace: true });
  }, [navigate]);

  const handleTenantReady = useCallback(
    (result: TenantReadyResult) => {
      const ctx: TenantContext = {
        tenantId: result.tenantId,
        tenantName: result.tenantName,
        tenantRole: result.tenantRole,
        permissions: result.permissions,
        status: result.status,
        expiresAt: result.expiresAt ?? null,
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
          }));
          setUserTenants(infos);
          localStorage.setItem('userTenants', JSON.stringify(infos));
        })
        .catch(() => {});
      navigate('/', { replace: true });
    },
    [navigate],
  );

  const handleSwitchTenant = useCallback(() => {
    setTenantCtx(null);
    setShowOnboarding(false);
    localStorage.removeItem('tenantCtx');
  }, []);

  const onProfileUpdate = useCallback((user: Record<string, unknown>) => {
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  }, []);

  const onTenantCtxUpdate = useCallback((ctx: TenantContext) => {
    setTenantCtx(ctx);
    localStorage.setItem('tenantCtx', JSON.stringify(ctx));
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !tenantCtx) return;
    let cancelled = false;
    api.tenants
      .list()
      .then(list => {
        if (cancelled) return;
        const infos: TenantInfo[] = list.map((t: any) => ({
          id: t.id, name: t.name, role: t.role,
          permissions: typeof t.permissions === 'string' ? JSON.parse(t.permissions) : (t.permissions || []),
          status: t.status, expiresAt: t.expiresAt ?? null,
        }));
        setUserTenants(infos);
        localStorage.setItem('userTenants', JSON.stringify(infos));
        const matched = infos.find(t => t.id === tenantCtx.tenantId);
        if (matched) {
          const next: TenantContext = {
            tenantId: matched.id,
            tenantName: matched.name,
            tenantRole: matched.role,
            permissions: matched.permissions,
            status: matched.status,
            expiresAt: matched.expiresAt ?? null,
          };
          if (JSON.stringify(next) !== JSON.stringify(tenantCtx)) {
            setTenantCtx(next);
            localStorage.setItem('tenantCtx', JSON.stringify(next));
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn, tenantCtx?.tenantId]);

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
