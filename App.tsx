import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import {
  Layout, LayoutDashboard, ClipboardList, Settings as SettingsIcon,
  Boxes, ShoppingCart, Wallet, LogOut, User, UserCog, Building2, Loader2, Inbox,
} from 'lucide-react';

import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import TenantSelectView from './views/TenantSelectView';
import DashboardView from './views/DashboardView';
import ProductionManagementView from './views/ProductionManagementView';
import PSIView from './views/PSIView';
import FinanceView from './views/FinanceView';
import BasicInfoView from './views/BasicInfoView';
import SettingsView from './views/SettingsView';
import UserAdminView from './views/UserAdminView';
import ProfileModal from './views/ProfileModal';
import CollaborationInboxView from './views/CollaborationInboxView';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppDataProvider, useAppData } from './contexts/AppDataContext';
import ErrorBoundary from './components/ErrorBoundary';

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
  const data = useAppData();

  const { currentUser, tenantCtx, hasPerm, handleLogout, handleSwitchTenant } = auth;
  const { profileOpen, setProfileOpen, onProfileUpdate, onTenantCtxUpdate } = auth;

  if (data.dataLoading) {
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
      {/* Sidebar */}
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
            <Link to="/" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <LayoutDashboard className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 经营看板
            </Link>
          )}
          {hasPerm('production') && (
            <Link to="/production" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ClipboardList className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 生产管理
            </Link>
          )}
          {hasPerm('psi') && (
            <Link to="/psi" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ShoppingCart className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 进销存
            </Link>
          )}
          {hasPerm('finance') && (
            <Link to="/finance" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Wallet className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 财务结算
            </Link>
          )}
          <Link to="/collaboration" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
            <Inbox className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 协作管理
          </Link>
          {hasPerm('basic') && (
            <Link to="/basic" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Boxes className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 基础信息
            </Link>
          )}
          {hasPerm('settings') && (
            <Link to="/settings" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <SettingsIcon className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 系统设置
            </Link>
          )}
          {(currentUser as Record<string, unknown>)?.role === 'admin' && (
            <Link to="/admin/users" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
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

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-auto pt-4 px-12 pb-12 bg-slate-50/30">
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </div>
    </div>
  );
}

function AppRoutes() {
  const auth = useAuth();
  const d = useAppData();
  const { currentUser, tenantCtx } = auth;
  const userId = String(currentUser?.id ?? '');

  return (
    <Routes>
      <Route path="/" element={
        <DashboardView
          orders={d.orders}
          financeRecords={d.financeRecords}
          psiRecords={d.psiRecords}
          products={d.products}
          productionLinkMode={d.productionLinkMode}
        />
      } />
      <Route path="/production" element={
        <ProductionManagementView
          productionLinkMode={d.productionLinkMode}
          processSequenceMode={d.processSequenceMode}
          allowExceedMaxReportQty={d.allowExceedMaxReportQty}
          plans={d.plans}
          orders={d.orders}
          products={d.products}
          categories={d.categories}
          dictionaries={d.dictionaries}
          workers={d.workers}
          equipment={d.equipment}
          prodRecords={d.prodRecords}
          psiRecords={d.psiRecords}
          warehouses={d.warehouses}
          globalNodes={d.globalNodes}
          boms={d.boms}
          partners={d.partners}
          partnerCategories={d.partnerCategories}
          planFormSettings={d.planFormSettings}
          onUpdatePlanFormSettings={d.onUpdatePlanFormSettings}
          orderFormSettings={d.orderFormSettings}
          onUpdateOrderFormSettings={d.onUpdateOrderFormSettings}
          onCreatePlan={d.onCreatePlan}
          onUpdateProduct={d.onUpdateProduct}
          onUpdatePlan={d.onUpdatePlan}
          onSplitPlan={d.onSplitPlan}
          onDeletePlan={d.onDeletePlan}
          onConvertToOrder={d.onConvertToOrder}
          onAddRecord={d.onAddProdRecord}
          onAddRecordBatch={d.onAddProdRecordBatch}
          onUpdateRecord={d.onUpdateProdRecord}
          onDeleteRecord={d.onDeleteProdRecord}
          onAddPSIRecord={d.onAddPSIRecord}
          onAddPSIRecordBatch={d.onAddPSIRecordBatch}
          onCreateSubPlan={d.onCreateSubPlan}
          onCreateSubPlans={d.onCreateSubPlans}
          onReportSubmit={d.onReportSubmit}
          onReportSubmitProduct={d.onReportSubmitProduct}
          onUpdateReport={d.onUpdateReport}
          onDeleteReport={d.onDeleteReport}
          productMilestoneProgresses={d.productMilestoneProgresses}
          onUpdateReportProduct={d.onUpdateReportProduct}
          onDeleteReportProduct={d.onDeleteReportProduct}
          onUpdateOrder={d.onUpdateOrder}
          onDeleteOrder={d.onDeleteOrder}
          userPermissions={tenantCtx?.permissions}
          tenantRole={tenantCtx?.tenantRole}
        />
      } />
      <Route path="/psi" element={
        <PSIView
          products={d.products}
          records={d.psiRecords}
          prodRecords={d.prodRecords}
          orders={d.orders}
          warehouses={d.warehouses}
          categories={d.categories}
          partners={d.partners}
          partnerCategories={d.partnerCategories}
          dictionaries={d.dictionaries}
          purchaseOrderFormSettings={d.purchaseOrderFormSettings}
          onUpdatePurchaseOrderFormSettings={d.onUpdatePurchaseOrderFormSettings}
          purchaseBillFormSettings={d.purchaseBillFormSettings}
          onUpdatePurchaseBillFormSettings={d.onUpdatePurchaseBillFormSettings}
          onAddRecord={d.onAddPSIRecord}
          onAddRecordBatch={d.onAddPSIRecordBatch}
          onReplaceRecords={d.onReplacePSIRecords}
          onDeleteRecords={d.onDeletePSIRecords}
          userPermissions={tenantCtx?.permissions}
          tenantRole={tenantCtx?.tenantRole || ''}
        />
      } />
      <Route path="/finance" element={
        <FinanceView
          orders={d.orders}
          records={d.financeRecords}
          psiRecords={d.psiRecords}
          prodRecords={d.prodRecords}
          onAddRecord={d.onAddFinanceRecord}
          onUpdateRecord={d.onUpdateFinanceRecord}
          onDeleteRecord={d.onDeleteFinanceRecord}
          financeCategories={d.financeCategories}
          financeAccountTypes={d.financeAccountTypes}
          partners={d.partners}
          workers={d.workers}
          products={d.products}
          partnerCategories={d.partnerCategories}
          categories={d.categories}
          globalNodes={d.globalNodes}
          dictionaries={d.dictionaries}
          userPermissions={tenantCtx?.permissions}
          tenantRole={tenantCtx?.tenantRole}
        />
      } />
      <Route path="/collaboration" element={
        <CollaborationInboxView
          products={d.products}
          partners={d.partners}
          orders={d.orders}
          prodRecords={d.prodRecords}
          warehouses={d.warehouses}
          dictionaries={d.dictionaries}
          nodeTemplates={d.globalNodes}
          onRefreshPartners={d.refreshPartners}
          onRefreshProducts={d.refreshProducts}
          onRefreshOrders={d.refreshOrders}
          onRefreshProdRecords={d.refreshProdRecords}
          onRefreshPMP={d.refreshPMP}
          tenantRole={tenantCtx?.tenantRole}
          userPermissions={tenantCtx?.permissions}
        />
      } />
      <Route path="/basic" element={
        <BasicInfoView
          products={d.products}
          globalNodes={d.globalNodes}
          categories={d.categories}
          partnerCategories={d.partnerCategories}
          boms={d.boms}
          equipment={d.equipment}
          dictionaries={d.dictionaries}
          partners={d.partners}
          onUpdateProduct={d.onUpdateProduct}
          onDeleteProduct={d.onDeleteProduct}
          onUpdateBOM={d.onUpdateBOM}
          onRefreshDictionaries={d.refreshDictionaries}
          onRefreshWorkers={d.refreshWorkers}
          onRefreshEquipment={d.refreshEquipment}
          onRefreshPartners={d.refreshPartners}
          onRefreshPartnerCategories={d.refreshPartnerCategories}
          tenantId={tenantCtx!.tenantId}
          tenantRole={tenantCtx!.tenantRole}
          currentUserId={userId}
          userPermissions={tenantCtx!.permissions}
        />
      } />
      <Route path="/settings" element={
        <SettingsView
          categories={d.categories}
          partnerCategories={d.partnerCategories}
          globalNodes={d.globalNodes}
          warehouses={d.warehouses}
          productionLinkMode={d.productionLinkMode}
          onUpdateProductionLinkMode={d.onUpdateProductionLinkMode}
          processSequenceMode={d.processSequenceMode}
          onUpdateProcessSequenceMode={d.onUpdateProcessSequenceMode}
          allowExceedMaxReportQty={d.allowExceedMaxReportQty}
          onUpdateAllowExceedMaxReportQty={d.onUpdateAllowExceedMaxReportQty}
          onRefreshCategories={d.refreshCategories}
          onRefreshPartnerCategories={d.refreshPartnerCategories}
          onRefreshGlobalNodes={d.refreshGlobalNodes}
          onRefreshWarehouses={d.refreshWarehouses}
          financeCategories={d.financeCategories}
          onRefreshFinanceCategories={d.refreshFinanceCategories}
          financeAccountTypes={d.financeAccountTypes}
          onRefreshFinanceAccountTypes={d.refreshFinanceAccountTypes}
          userPermissions={tenantCtx?.permissions}
          tenantRole={tenantCtx?.tenantRole}
        />
      } />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
