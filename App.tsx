import React, { Suspense, useEffect, useRef, useLayoutEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useParams, useLocation } from 'react-router-dom';
import {
  Layout, LayoutDashboard, ClipboardList, Settings as SettingsIcon,
  Boxes, ShoppingCart, Wallet, LogOut, User, UserCog, Building2, Loader2, Inbox,
} from 'lucide-react';

import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import TenantSelectView from './views/TenantSelectView';
import ProfileModal from './views/ProfileModal';

const DashboardView = React.lazy(() => import('./views/DashboardView'));
const ProductionManagementView = React.lazy(() => import('./views/ProductionManagementView'));
const PSIView = React.lazy(() => import('./views/PSIView'));
const FinanceView = React.lazy(() => import('./views/FinanceView'));
const BasicInfoView = React.lazy(() => import('./views/BasicInfoView'));
const SettingsView = React.lazy(() => import('./views/SettingsView'));
const UserAdminView = React.lazy(() => import('./views/UserAdminView'));
const CollaborationInboxView = React.lazy(() => import('./views/CollaborationInboxView'));
const PrintTemplateEditorView = React.lazy(() => import('./views/PrintTemplateEditorView'));

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppDataProvider, useDataLoading, useMasterData, useConfigData, useOrdersData, usePsiData, useFinanceData, useAppActions } from './contexts/AppDataContext';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { MainScrollSegmentProvider } from './contexts/MainScrollSegmentContext';

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
      <div className="w-52 bg-white border-r border-slate-200 flex flex-col p-5 gap-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
            <Layout className="w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter uppercase">智造云 ERP</h1>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise OS</span>
          </div>
        </div>

        <button
          onClick={handleSwitchTenant}
          className="flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-left"
          title="切换企业"
        >
          <Building2 className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <span className="truncate text-xs font-bold text-indigo-700">{tenantCtx!.tenantName}</span>
        </button>

        <nav className="flex flex-col gap-1.5">
          {hasPerm('dashboard') && (
            <Link to="/" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <LayoutDashboard className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 经营看板
            </Link>
          )}
          {hasPerm('production') && (
            <Link to="/production" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ClipboardList className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 生产管理
            </Link>
          )}
          {hasPerm('psi') && (
            <Link to="/psi" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ShoppingCart className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 进销存
            </Link>
          )}
          {hasPerm('finance') && (
            <Link to="/finance" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Wallet className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 财务结算
            </Link>
          )}
          <Link to="/collaboration" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
            <Inbox className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 协作管理
          </Link>
          {hasPerm('basic') && (
            <Link to="/basic" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Boxes className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 基础信息
            </Link>
          )}
          {hasPerm('settings') && (
            <Link to="/settings" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <SettingsIcon className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 系统设置
            </Link>
          )}
          {(currentUser as Record<string, unknown>)?.role === 'admin' && (
            <Link to="/admin/users" className="flex items-center gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <UserCog className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 账号管理
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

function DashboardRoute() {
  return <DashboardView />;
}

function ProductionRoute() {
  const m = useMasterData();
  const c = useConfigData();
  const o = useOrdersData();
  const { psiRecords } = usePsiData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();
  useEffect(() => { a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);
  return (
    <ProductionManagementView
      productionLinkMode={c.productionLinkMode} processSequenceMode={c.processSequenceMode}
      allowExceedMaxReportQty={c.allowExceedMaxReportQty}
      plans={o.plans} orders={o.orders} products={m.products} categories={m.categories}
      dictionaries={m.dictionaries} workers={m.workers} equipment={m.equipment}
      prodRecords={o.prodRecords} psiRecords={psiRecords} warehouses={m.warehouses}
      globalNodes={m.globalNodes} boms={m.boms} partners={m.partners}
      partnerCategories={m.partnerCategories}
      planFormSettings={c.planFormSettings} onUpdatePlanFormSettings={a.onUpdatePlanFormSettings}
      printTemplates={c.printTemplates} onUpdatePrintTemplates={a.onUpdatePrintTemplates}
      onRefreshPrintTemplates={a.refreshPrintTemplates}
      orderFormSettings={c.orderFormSettings} onUpdateOrderFormSettings={a.onUpdateOrderFormSettings}
      materialPanelSettings={c.materialPanelSettings} onUpdateMaterialPanelSettings={a.onUpdateMaterialPanelSettings}
      onCreatePlan={a.onCreatePlan} onUpdateProduct={a.onUpdateProduct}
      onUpdatePlan={a.onUpdatePlan} onSplitPlan={a.onSplitPlan}
      onDeletePlan={a.onDeletePlan} onConvertToOrder={a.onConvertToOrder}
      onAddRecord={a.onAddProdRecord} onAddRecordBatch={a.onAddProdRecordBatch}
      onUpdateRecord={a.onUpdateProdRecord} onDeleteRecord={a.onDeleteProdRecord}
      onAddPSIRecord={a.onAddPSIRecord} onAddPSIRecordBatch={a.onAddPSIRecordBatch}
      onCreateSubPlan={a.onCreateSubPlan} onCreateSubPlans={a.onCreateSubPlans}
      onReportSubmit={a.onReportSubmit} onReportSubmitProduct={a.onReportSubmitProduct}
      onUpdateReport={a.onUpdateReport} onDeleteReport={a.onDeleteReport}
      productMilestoneProgresses={o.productMilestoneProgresses}
      onUpdateReportProduct={a.onUpdateReportProduct} onDeleteReportProduct={a.onDeleteReportProduct}
      onUpdateOrder={a.onUpdateOrder} onDeleteOrder={a.onDeleteOrder}
      userPermissions={tenantCtx?.permissions} tenantRole={tenantCtx?.tenantRole}
    />
  );
}

function PsiRoute() {
  const m = useMasterData();
  const c = useConfigData();
  const o = useOrdersData();
  const { psiRecords } = usePsiData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();
  useEffect(() => { a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);
  return (
    <PSIView
      products={m.products} records={psiRecords} prodRecords={o.prodRecords}
      orders={o.orders} warehouses={m.warehouses} categories={m.categories}
      partners={m.partners} partnerCategories={m.partnerCategories} dictionaries={m.dictionaries}
      purchaseOrderFormSettings={c.purchaseOrderFormSettings}
      onUpdatePurchaseOrderFormSettings={a.onUpdatePurchaseOrderFormSettings}
      purchaseBillFormSettings={c.purchaseBillFormSettings}
      onUpdatePurchaseBillFormSettings={a.onUpdatePurchaseBillFormSettings}
      onAddRecord={a.onAddPSIRecord} onAddRecordBatch={a.onAddPSIRecordBatch}
      onReplaceRecords={a.onReplacePSIRecords} onDeleteRecords={a.onDeletePSIRecords}
      userPermissions={tenantCtx?.permissions} tenantRole={tenantCtx?.tenantRole || ''}
    />
  );
}

function FinanceRoute() {
  const m = useMasterData();
  const o = useOrdersData();
  const { psiRecords } = usePsiData();
  const f = useFinanceData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();
  useEffect(() => { a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);
  return (
    <FinanceView
      orders={o.orders} records={f.financeRecords} psiRecords={psiRecords}
      prodRecords={o.prodRecords}
      productMilestoneProgresses={o.productMilestoneProgresses}
      onAddRecord={a.onAddFinanceRecord} onUpdateRecord={a.onUpdateFinanceRecord}
      onDeleteRecord={a.onDeleteFinanceRecord}
      financeCategories={f.financeCategories} financeAccountTypes={f.financeAccountTypes}
      partners={m.partners} workers={m.workers} products={m.products}
      partnerCategories={m.partnerCategories} categories={m.categories}
      globalNodes={m.globalNodes} dictionaries={m.dictionaries}
      userPermissions={tenantCtx?.permissions} tenantRole={tenantCtx?.tenantRole}
    />
  );
}

function CollaborationRoute() {
  const m = useMasterData();
  const o = useOrdersData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();
  useEffect(() => { a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);
  return (
    <CollaborationInboxView
      products={m.products} partners={m.partners} partnerCategories={m.partnerCategories}
      orders={o.orders} prodRecords={o.prodRecords} warehouses={m.warehouses}
      dictionaries={m.dictionaries} nodeTemplates={m.globalNodes}
      onRefreshPartners={a.refreshPartners} onRefreshProducts={a.refreshProducts}
      onRefreshOrders={a.refreshOrders} onRefreshProdRecords={a.refreshProdRecords}
      onRefreshPMP={a.refreshPMP}
      tenantRole={tenantCtx?.tenantRole} userPermissions={tenantCtx?.permissions}
    />
  );
}

function BasicInfoRoute() {
  const m = useMasterData();
  const a = useAppActions();
  const { tenantCtx, currentUser } = useAuth();
  const userId = String(currentUser?.id ?? '');
  return (
    <BasicInfoView
      products={m.products} globalNodes={m.globalNodes} categories={m.categories}
      partnerCategories={m.partnerCategories} boms={m.boms} equipment={m.equipment}
      dictionaries={m.dictionaries} partners={m.partners}
      onUpdateProduct={a.onUpdateProduct} onDeleteProduct={a.onDeleteProduct}
      onUpdateBOM={a.onUpdateBOM}
      onRefreshDictionaries={a.refreshDictionaries} onRefreshWorkers={a.refreshWorkers}
      onRefreshEquipment={a.refreshEquipment} onRefreshPartners={a.refreshPartners}
      onRefreshPartnerCategories={a.refreshPartnerCategories} onRefreshProducts={a.refreshProducts}
      tenantId={tenantCtx!.tenantId} tenantRole={tenantCtx!.tenantRole}
      currentUserId={userId} userPermissions={tenantCtx!.permissions}
    />
  );
}

function SettingsRoute() {
  const m = useMasterData();
  const c = useConfigData();
  const f = useFinanceData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();
  return (
    <SettingsView
      categories={m.categories} partnerCategories={m.partnerCategories}
      globalNodes={m.globalNodes} warehouses={m.warehouses}
      productionLinkMode={c.productionLinkMode} onUpdateProductionLinkMode={a.onUpdateProductionLinkMode}
      processSequenceMode={c.processSequenceMode} onUpdateProcessSequenceMode={a.onUpdateProcessSequenceMode}
      allowExceedMaxReportQty={c.allowExceedMaxReportQty}
      onUpdateAllowExceedMaxReportQty={a.onUpdateAllowExceedMaxReportQty}
      onRefreshCategories={a.refreshCategories} onRefreshPartnerCategories={a.refreshPartnerCategories}
      onRefreshGlobalNodes={a.refreshGlobalNodes} onRefreshWarehouses={a.refreshWarehouses}
      financeCategories={f.financeCategories} onRefreshFinanceCategories={a.refreshFinanceCategories}
      financeAccountTypes={f.financeAccountTypes} onRefreshFinanceAccountTypes={a.refreshFinanceAccountTypes}
      userPermissions={tenantCtx?.permissions} tenantRole={tenantCtx?.tenantRole}
    />
  );
}

function AppRoutes() {
  const { currentUser } = useAuth();
  const userId = String(currentUser?.id ?? '');

  return (
    <Routes>
      <Route path="/" element={<DashboardRoute />} />
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
        path="/print-editor/:id"
        element={
          <Suspense fallback={<RouteFallback />}>
            <PrintEditorRoute />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
