import React, { Suspense, useRef, useLayoutEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardList, Settings as SettingsIcon,
  Boxes, ShoppingCart, Wallet, LogOut, User, UserCog, Building2, Loader2, Inbox, ScanLine,
  FlaskConical, LayoutDashboard, Megaphone, BookOpen,
} from 'lucide-react';

import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import TenantSelectView from './views/TenantSelectView';
import ProfileModal from './views/ProfileModal';
import { lazyWithReloadOnChunkError } from './utils/lazyWithReloadOnChunkError';

const DevManagementView = lazyWithReloadOnChunkError(() => import('./views/development/DevManagementView'));
const ProductionManagementView = lazyWithReloadOnChunkError(() => import('./views/ProductionManagementView'));
const PSIView = lazyWithReloadOnChunkError(() => import('./views/PSIView'));
const FinanceView = lazyWithReloadOnChunkError(() => import('./views/FinanceView'));
const BasicInfoView = lazyWithReloadOnChunkError(() => import('./views/BasicInfoView'));
const SettingsView = lazyWithReloadOnChunkError(() => import('./views/SettingsView'));
const UserAdminView = lazyWithReloadOnChunkError(() => import('./views/UserAdminView'));
const CollaborationInboxView = lazyWithReloadOnChunkError(() => import('./views/CollaborationInboxView'));
const PrintTemplateEditorView = lazyWithReloadOnChunkError(() => import('./views/PrintTemplateEditorView'));
const TraceView = lazyWithReloadOnChunkError(() => import('./views/TraceView'));
const WorkbenchView = lazyWithReloadOnChunkError(() => import('./views/workbench/WorkbenchView'));
const KnowledgeBaseView = lazyWithReloadOnChunkError(() => import('./views/knowledge-base/KnowledgeBaseView'));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppDataProvider, useDataLoading } from './contexts/AppDataContext';
import { useCollabPendingIndicator } from './hooks/useCollabPendingIndicator';
import { useFeaturePlugins } from './hooks/useFeaturePlugins';
import { useTraceabilityPlugin } from './hooks/useTraceabilityPlugin';
import { hasCollaborationModuleAccess, canViewCollaborationList } from './utils/canViewAmount';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { MainScrollSegmentProvider } from './contexts/MainScrollSegmentContext';
import { BRAND_LOGO_PATH, BRAND_NAME } from './constants/branding';
import { isPlatformAdmin } from './utils/isPlatformAdmin';

const AnnouncementPublishView = lazyWithReloadOnChunkError(() => import('./views/announcements/AnnouncementPublishView'));

const RouteFallback = () => (
  <div className="flex items-center justify-center py-32">
    <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
  </div>
);

function PrintEditorRoute() {
  const { id } = useParams();
  return <PrintTemplateEditorView key={id ?? 'new'} />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AuthRouter />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
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
    <ConfirmProvider>
      <React.Fragment key={`${userId}_${tenantCtx!.tenantId}`}>
        <AppDataProvider>
          <AppLayout />
        </AppDataProvider>
      </React.Fragment>
    </ConfirmProvider>
  );
}

function AppLayout() {
  const auth = useAuth();
  const dataLoading = useDataLoading();
  const location = useLocation();
  const navigate = useNavigate();
  const printEditorFullscreen = location.pathname.startsWith('/print-editor');
  const isWorkbenchRoute = location.pathname.startsWith('/workbench');

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
  const platformAdmin = isPlatformAdmin(currentUser as Record<string, unknown>);
  const showCollabNav =
    hasCollaborationModuleAccess(tenantCtx?.tenantRole, tenantCtx?.permissions)
    && canViewCollaborationList(tenantCtx?.tenantRole, tenantCtx?.permissions);
  const collabHasPending = useCollabPendingIndicator(tenantCtx?.tenantId ?? null, showCollabNav);
  const { isPluginEnabled } = useFeaturePlugins();
  const { traceEnabled } = useTraceabilityPlugin();
  const showDevNav = hasPerm('development') && isPluginEnabled('development');
  const showKnowledgeNav = hasPerm('knowledge_base') && isPluginEnabled('knowledge_base');
  const showCollabNavWithPlugin = showCollabNav && isPluginEnabled('collaboration');

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
          {traceEnabled ? (
          <Link
            to="/trace"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-800 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="扫码追溯 / 产品追溯"
          >
            <ScanLine className="h-5 w-5" strokeWidth={2.25} />
          </Link>
          ) : null}
        </div>

        <nav className="flex flex-col gap-1.5">
          {platformAdmin ? (
            <>
              <Link to="/announcements" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
                <Megaphone className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 信息发布
              </Link>
              <Link to="/admin/users" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
                <UserCog className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 账号管理
              </Link>
            </>
          ) : (
            <>
          <Link
            to="/workbench"
            onClick={e => {
              e.preventDefault();
              navigate('/workbench', {
                state: { workbenchHome: Date.now() },
                replace: location.pathname === '/workbench',
              });
            }}
            className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group"
          >
            <LayoutDashboard className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 工作台
          </Link>
          {showDevNav && (
            <Link to="/development" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <FlaskConical className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 开发管理
            </Link>
          )}
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
          {showCollabNavWithPlugin && (
          <Link to="/collaboration" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group relative">
            <Inbox className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 协作管理
            {collabHasPending && (
              <span className="absolute top-2.5 right-3 w-2 h-2 rounded-full bg-rose-500" aria-label="有待办" />
            )}
          </Link>
          )}
          {showKnowledgeNav && (
            <Link to="/knowledge-base" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <BookOpen className="w-5 h-5 shrink-0 text-slate-300 group-hover:text-indigo-600" /> 资料库
            </Link>
          )}
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
            </>
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
            : isWorkbenchRoute
              ? 'min-h-0 flex-1 overflow-auto bg-slate-50/30 px-4 pb-6 pt-4'
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
  );
}

// ── Route wrappers: each subscribes only to the domains it needs ──

/** 根路径与通配：平台管理员进信息发布，其余进工作台 */
function DefaultHomeRedirect() {
  const { currentUser } = useAuth();
  if (isPlatformAdmin(currentUser as Record<string, unknown>)) {
    return <Navigate to="/announcements" replace />;
  }
  return <Navigate to="/workbench" replace state={{ workbenchHome: Date.now() }} />;
}

/** 平台管理员不可访问业务模块，统一重定向到信息发布 */
function PlatformAdminBusinessGuard({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (isPlatformAdmin(currentUser as Record<string, unknown>)) {
    return <Navigate to="/announcements" replace />;
  }
  return <>{children}</>;
}

function AnnouncementsRoute() {
  const { currentUser } = useAuth();
  if (!isPlatformAdmin(currentUser as Record<string, unknown>)) {
    return (
      <div className="max-w-md mx-auto mt-24 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-slate-700 font-bold mb-4">无权访问信息发布</p>
        <Link to="/workbench" className="text-indigo-600 font-bold hover:underline">返回工作台</Link>
      </div>
    );
  }
  return <AnnouncementPublishView />;
}

function WorkbenchRoute() {
  return <WorkbenchView />;
}

function DevelopmentRoute() {
  return <DevManagementView />;
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
  const { tenantCtx } = useAuth();
  const allowed =
    hasCollaborationModuleAccess(tenantCtx?.tenantRole, tenantCtx?.permissions)
    && canViewCollaborationList(tenantCtx?.tenantRole, tenantCtx?.permissions);
  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-24 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-slate-700 font-bold mb-4">无权访问协作管理</p>
        <Link to="/" className="text-indigo-600 font-bold hover:underline">返回首页</Link>
      </div>
    );
  }
  return <CollaborationInboxView />;
}

function TraceRoute() {
  const { traceEnabled } = useTraceabilityPlugin();
  if (!traceEnabled) {
    return (
      <div className="max-w-md mx-auto mt-24 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-slate-700 font-bold mb-4">追溯码插件未开启</p>
        <p className="text-sm text-slate-500 mb-4">请在插件中心开通「追溯码」后使用扫码追溯功能。</p>
        <Link to="/workbench" className="text-indigo-600 font-bold hover:underline">返回工作台</Link>
      </div>
    );
  }
  return (
    <Suspense fallback={<RouteFallback />}>
      <TraceView />
    </Suspense>
  );
}

function KnowledgeBaseRoute() {
  const { hasPerm } = useAuth();
  const { isPluginEnabled } = useFeaturePlugins();
  const allowed = hasPerm('knowledge_base') && isPluginEnabled('knowledge_base');
  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-24 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
        <p className="text-slate-700 font-bold mb-4">无权访问资料库或插件未开启</p>
        <Link to="/workbench" className="text-indigo-600 font-bold hover:underline">返回工作台</Link>
      </div>
    );
  }
  return <KnowledgeBaseView />;
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
      <Route path="/announcements" element={<AnnouncementsRoute />} />
      <Route path="/workbench" element={<PlatformAdminBusinessGuard><WorkbenchRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/development" element={<PlatformAdminBusinessGuard><DevelopmentRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/production" element={<PlatformAdminBusinessGuard><ProductionRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/psi" element={<PlatformAdminBusinessGuard><PsiRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/finance" element={<PlatformAdminBusinessGuard><FinanceRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/collaboration" element={<PlatformAdminBusinessGuard><CollaborationRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/knowledge-base" element={<PlatformAdminBusinessGuard><KnowledgeBaseRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/basic" element={<PlatformAdminBusinessGuard><BasicInfoRoute /></PlatformAdminBusinessGuard>} />
      <Route path="/settings" element={<PlatformAdminBusinessGuard><SettingsRoute /></PlatformAdminBusinessGuard>} />
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
      <Route path="/orders/:id" element={<PlatformAdminBusinessGuard><Navigate to="/production" replace state={{ tab: 'orders' }} /></PlatformAdminBusinessGuard>} />
      <Route
        path="/trace"
        element={
          <PlatformAdminBusinessGuard>
            <TraceRoute />
          </PlatformAdminBusinessGuard>
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
