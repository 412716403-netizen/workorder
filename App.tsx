import React, { Suspense, useRef, useLayoutEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useParams, useLocation } from 'react-router-dom';
import {
  ClipboardList, Settings as SettingsIcon,
  Boxes, ShoppingCart, Wallet, LogOut, User, UserCog, Building2, Loader2, Inbox, ScanLine,
} from 'lucide-react';

import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import TenantSelectView from './views/TenantSelectView';
import ProfileModal from './views/ProfileModal';
import { lazyWithReloadOnChunkError } from './utils/lazyWithReloadOnChunkError';

const ProductionManagementView = lazyWithReloadOnChunkError(() => import('./views/ProductionManagementView'));
const PSIView = lazyWithReloadOnChunkError(() => import('./views/PSIView'));
const FinanceView = lazyWithReloadOnChunkError(() => import('./views/FinanceView'));
const BasicInfoView = lazyWithReloadOnChunkError(() => import('./views/BasicInfoView'));
const SettingsView = lazyWithReloadOnChunkError(() => import('./views/SettingsView'));
const UserAdminView = lazyWithReloadOnChunkError(() => import('./views/UserAdminView'));
const CollaborationInboxView = lazyWithReloadOnChunkError(() => import('./views/CollaborationInboxView'));
const PrintTemplateEditorView = lazyWithReloadOnChunkError(() => import('./views/PrintTemplateEditorView'));
const TraceView = lazyWithReloadOnChunkError(() => import('./views/TraceView'));

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppDataProvider, useDataLoading } from './contexts/AppDataContext';
import { useCollabPendingIndicator } from './hooks/useCollabPendingIndicator';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { MainScrollSegmentProvider } from './contexts/MainScrollSegmentContext';
import { BRAND_LOGO_PATH, BRAND_NAME } from './constants/branding';

const RouteFallback = () => (
  <div className="flex items-center justify-center py-32">
    <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
  </div>
);

function PrintEditorRoute() {
  const { id } = useParams();
  return <PrintTemplateEditorView key={id ?? 'new'} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}

function AuthRouter() {
  const {
    isLoggedIn, currentUser, tenantCtx, userTenants,
    showOnboarding, setShowOnboarding,
    handleLogin, handleLogout, handleTenantReady,
  } = useAuth();

  if (!isLoggedIn) {
    return <LoginView onLogin={handleLogin} />;
  }

  if (userTenants.length === 0 && !tenantCtx) {
    return <OnboardingView onTenantReady={handleTenantReady} onBackToLogin={handleLogout} />;
  }

  if (showOnboarding && !tenantCtx) {
    return (
      <OnboardingView
        onTenantReady={handleTenantReady}
        onBack={userTenants.length > 0 ? () => setShowOnboarding(false) : undefined}
        onBackToLogin={handleLogout}
      />
    );
  }

  if (userTenants.length > 0 && !tenantCtx) {
    return (
      <TenantSelectView
        tenants={userTenants}
        onSelect={handleTenantReady}
        onCreateOrJoin={() => setShowOnboarding(true)}
        onLogout={handleLogout}
      />
    );
  }

  const userId = String(currentUser!.id ?? '');
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 p-8">
        <p className="text-center">当前账号缺少用户标识，请退出后重新登录。</p>
      </div>
    );
  }

  return (
    <React.Fragment key={`${userId}_${tenantCtx!.tenantId}`}>
      <AppDataProvider>
        <AppLayout />
      </AppDataProvider>
    </React.Fragment>
  );
}

function AppLayout() {
  const auth = useAuth();
  const dataLoading = useDataLoading();
  const location = useLocation();
  const printEditorFullscreen = location.pathname.startsWith('/print-editor');

  const mainContentRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const prevScrollKey = useRef('');
  const pathAnchorRef = useRef(location.pathname);
  const [scrollSegment, setScrollSegment] = useState('');

  useLayoutEffect(() => {
    const el = mainContentRef.current;
    if (!el || printEditorFullscreen) return;

    const pathChanged = pathAnchorRef.current !== location.pathname;
    if (pathChanged) {
      pathAnchorRef.current = location.pathname;
    }
    const segmentForKey = pathChanged ? '' : scrollSegment;
    const key = `${location.pathname}|${segmentForKey}`;

    if (prevScrollKey.current !== key) {
      if (prevScrollKey.current) {
        scrollPositions.current[prevScrollKey.current] = el.scrollTop;
      }
      el.scrollTop = scrollPositions.current[key] ?? 0;
      prevScrollKey.current = key;
    }
  }, [location.pathname, scrollSegment, printEditorFullscreen]);

  const { currentUser, tenantCtx, hasPerm, handleLogout, handleSwitchTenant } = auth;
  const { profileOpen, setProfileOpen, onProfileUpdate, onTenantCtxUpdate } = auth;
  const collabHasPending = useCollabPendingIndicator(tenantCtx?.tenantId ?? null);

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          <span className="text-sm text-slate-400 font-medium">加载数据中…</span>
        </div>
      </div>
    );
  }

  return (
    <ConfirmProvider>
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar — 打印模板编辑页隐藏，便于全宽画布 */}
      {!printEditorFullscreen && (
      <div className="w-44 bg-white border-r border-slate-200 flex flex-col p-5 gap-8">
        <div className="flex items-center gap-3">
          <img
            src={BRAND_LOGO_PATH}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 object-contain"
          />
          <div className="flex flex-col min-w-0">
            <h1 className="text-xl font-black tracking-tight text-slate-900 truncate">{BRAND_NAME}</h1>
          </div>
        </div>

        <div className="flex items-center gap-0.5 min-w-0">
          <button
            type="button"
            onClick={handleSwitchTenant}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-violet-50 py-2 pl-3 pr-2 text-left transition-colors hover:bg-violet-100"
            title="切换企业"
          >
            <Building2 className="h-4 w-4 shrink-0 text-violet-600" />
            <span className="truncate text-xs font-bold text-violet-800">{tenantCtx!.tenantName}</span>
          </button>
          <Link
            to="/trace"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-800 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="扫码追溯 / 产品追溯"
          >
            <ScanLine className="h-5 w-5" strokeWidth={2.25} />
          </Link>
        </div>

        <nav className="flex flex-col gap-1.5">
          {hasPerm('production') && (
            <Link to="/production" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ClipboardList className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 生产管理
            </Link>
          )}
          {hasPerm('psi') && (
            <Link to="/psi" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ShoppingCart className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 进销存
            </Link>
          )}
          {hasPerm('finance') && (
            <Link to="/finance" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Wallet className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 财务结算
            </Link>
          )}
          <Link to="/collaboration" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group relative">
            <Inbox className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 协作管理
            {collabHasPending && (
              <span className="absolute top-2.5 right-3 w-2 h-2 rounded-full bg-rose-500" aria-label="有待办" />
            )}
          </Link>
          {hasPerm('basic') && (
            <Link to="/basic" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Boxes className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 基础信息
            </Link>
          )}
          {hasPerm('settings') && (
            <Link to="/settings" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <SettingsIcon className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 系统设置
            </Link>
          )}
          {(currentUser as Record<string, unknown>)?.role === 'admin' && (
            <Link to="/admin/users" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <UserCog className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 账号管理
            </Link>
          )}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 rounded-lg transition-colors text-left"
            title="个人信息"
          >
            <User className="w-4 h-4 flex-shrink-0" />
            <span className="truncate font-medium">
              {(currentUser as Record<string, unknown>)?.displayName as string ||
                (currentUser as Record<string, unknown>)?.username as string ||
                '用户'}
            </span>
          </button>
          <ProfileModal
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            onUpdated={onProfileUpdate}
            tenantId={tenantCtx!.tenantId}
            tenantName={tenantCtx!.tenantName}
            tenantRole={tenantCtx!.tenantRole}
            tenantExpiresAt={tenantCtx!.expiresAt ?? null}
            onTenantNameChanged={(name) => onTenantCtxUpdate({ ...tenantCtx!, tenantName: name })}
          />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" /> 退出登录
          </button>
        </div>
      </div>
      )}

      {/* Main Content */}
      <div
        ref={mainContentRef}
        className={
          printEditorFullscreen
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 p-3'
            : 'min-h-0 flex-1 overflow-auto bg-slate-50/30 px-12 pb-8 pt-4'
        }
      >
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <MainScrollSegmentProvider setScrollSegment={setScrollSegment}>
              {printEditorFullscreen ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <AppRoutes />
                </div>
              ) : (
                <AppRoutes />
              )}
            </MainScrollSegmentProvider>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
    </ConfirmProvider>
  );
}

// ── Route wrappers: each subscribes only to the domains it needs ──

/** 根路径与通配：进入首个有模块权限的业务页 */
function DefaultHomeRedirect() {
  const { hasPerm } = useAuth();
  if (hasPerm('production')) return <Navigate to="/production" replace />;
  if (hasPerm('psi')) return <Navigate to="/psi" replace />;
  if (hasPerm('finance')) return <Navigate to="/finance" replace />;
  if (hasPerm('basic')) return <Navigate to="/basic" replace />;
  if (hasPerm('settings')) return <Navigate to="/settings" replace />;
  return <Navigate to="/collaboration" replace />;
}

function ProductionRoute() {
  return <ProductionManagementView />;
}

function PsiRoute() {
  return <PSIView />;
}

function FinanceRoute() {
  return <FinanceView />;
}

function CollaborationRoute() {
  return <CollaborationInboxView />;
}

function BasicInfoRoute() {
  return <BasicInfoView />;
}

function SettingsRoute() {
  return <SettingsView />;
}

function AppRoutes() {
  const { currentUser } = useAuth();
  const userId = String(currentUser?.id ?? '');

  return (
    <Routes>
      <Route path="/" element={<DefaultHomeRedirect />} />
      <Route path="/production" element={<ProductionRoute />} />
      <Route path="/psi" element={<PsiRoute />} />
      <Route path="/finance" element={<FinanceRoute />} />
      <Route path="/collaboration" element={<CollaborationRoute />} />
      <Route path="/basic" element={<BasicInfoRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route
        path="/admin/users"
        element={
          (currentUser as Record<string, unknown>)?.role === 'admin' && userId ? (
            <UserAdminView currentUserId={userId} />
          ) : (
            <div className="max-w-md mx-auto mt-24 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
              <p className="text-slate-700 font-bold mb-4">仅管理员可访问账号管理</p>
              <Link to="/" className="text-indigo-600 font-bold hover:underline">返回首页</Link>
            </div>
          )
        }
      />
      <Route path="/orders/:id" element={<Navigate to="/production" replace state={{ tab: 'orders' }} />} />
      <Route
        path="/trace"
        element={
          <Suspense fallback={<RouteFallback />}>
            <TraceView />
          </Suspense>
        }
      />
      <Route
        path="/print-editor/:id"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PrintEditorRoute />
          </Suspense>
        }
      />
      <Route path="*" element={<DefaultHomeRedirect />} />
    </Routes>
  );
}
