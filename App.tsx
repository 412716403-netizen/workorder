import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { 
  Layout, 
  LayoutDashboard, 
  ClipboardList, 
  Settings as SettingsIcon, 
  Boxes, 
  ShoppingCart, 
  Wallet,
  LogOut,
  User,
  UserCog,
  Building2,
  Loader2,
} from 'lucide-react';
import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import TenantSelectView from './views/TenantSelectView';
import {
  Product,
  ProductionOrder,
  PlanOrder,
  ProductionOpRecord,
  FinanceRecord,
  Warehouse,
  PlanFormSettings,
  OrderFormSettings,
  PurchaseOrderFormSettings,
  PurchaseBillFormSettings,
  ProductionLinkMode,
  ProductMilestoneProgress,
  ProcessSequenceMode,
  FinanceCategory,
  FinanceAccountType,
  AppDictionaries,
  ProductCategory,
  PartnerCategory,
  GlobalNodeTemplate,
  BOM,
} from './types';

// Views
import DashboardView from './views/DashboardView';
import ProductionManagementView from './views/ProductionManagementView';
import PSIView from './views/PSIView';
import FinanceView from './views/FinanceView';
import BasicInfoView from './views/BasicInfoView';
import SettingsView from './views/SettingsView';
import UserAdminView from './views/UserAdminView';
import ProfileModal from './views/ProfileModal';
import { toast } from 'sonner';
import { clearTokens } from './services/api';
import * as api from './services/api';
import type { TenantInfo } from './services/api';

const DECIMAL_KEYS = new Set([
  'quantity', 'purchasePrice', 'salesPrice', 'amount', 'actualQuantity',
  'systemQuantity', 'diffQuantity', 'unitPrice', 'taxRate', 'taxAmount',
  'totalAmount', 'completedQuantity', 'defectiveQuantity', 'weight', 'rate',
  'allocatedQuantity', 'shippedQuantity',
]);
function normalizeDecimals<T>(arr: T[]): T[] {
  return arr.map(item => {
    const copy = { ...item } as any;
    for (const k of DECIMAL_KEYS) {
      if (k in copy && copy[k] != null && typeof copy[k] === 'string') copy[k] = Number(copy[k]) || 0;
    }
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((sub: any) => {
        const s = { ...sub };
        for (const k of DECIMAL_KEYS) {
          if (k in s && s[k] != null && typeof s[k] === 'string') s[k] = Number(s[k]) || 0;
        }
        return s;
      });
    }
    if (Array.isArray(copy.milestones)) {
      copy.milestones = copy.milestones.map((ms: any) => {
        const m = { ...ms };
        for (const k of DECIMAL_KEYS) {
          if (k in m && m[k] != null && typeof m[k] === 'string') m[k] = Number(m[k]) || 0;
        }
        if (Array.isArray(m.reports)) {
          m.reports = m.reports.map((r: any) => {
            const rc = { ...r };
            for (const k2 of DECIMAL_KEYS) {
              if (k2 in rc && rc[k2] != null && typeof rc[k2] === 'string') rc[k2] = Number(rc[k2]) || 0;
            }
            return rc;
          });
          const reportsSum = m.reports.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
          if (m.completedQuantity !== reportsSum) m.completedQuantity = reportsSum;
        }
        return m;
      });
    }
    return copy as T;
  });
}

const DEFAULT_PLAN_FORM_SETTINGS: PlanFormSettings = {
  standardFields: [
    { id: 'planNumber', label: '计划单号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'customer', label: '客户', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'dueDate', label: '交期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'createdAt', label: '添加日期', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const DEFAULT_PURCHASE_ORDER_FORM_SETTINGS: PurchaseOrderFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'dueDate', label: '期望到货日期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'createdAt', label: '添加日期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'note', label: '单据备注', showInList: false, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const DEFAULT_ORDER_FORM_SETTINGS: OrderFormSettings = {
  standardFields: [
    { id: 'orderNumber', label: '工单号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'customer', label: '客户', showInList: false, showInCreate: true, showInDetail: true },
    { id: 'dueDate', label: '交期', showInList: false, showInCreate: true, showInDetail: true },
    { id: 'startDate', label: '开始日期', showInList: false, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const DEFAULT_PURCHASE_BILL_FORM_SETTINGS: PurchaseBillFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'warehouse', label: '入库仓库', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'createdAt', label: '添加日期', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'note', label: '单据备注', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
};

const EMPTY_DICTIONARIES: AppDictionaries = { colors: [], sizes: [], units: [] };

type TenantContext = {
  tenantId: string;
  tenantName: string;
  tenantRole: string;
  permissions: string[];
};

function AppInner() {
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
  const isLoggedIn = !!currentUser && !!localStorage.getItem('accessToken');

  const handleLogin = (loginData: { user: Record<string, unknown>; tenants: TenantInfo[]; isEnterprise: boolean; tenantId?: string | null }) => {
    setCurrentUser(loginData.user);
    localStorage.setItem('currentUser', JSON.stringify(loginData.user));
    setUserTenants(loginData.tenants || []);
    localStorage.setItem('userTenants', JSON.stringify(loginData.tenants || []));

    if (loginData.tenantId && loginData.tenants?.length) {
      const matched = loginData.tenants.find(t => t.id === loginData.tenantId);
      if (matched) {
        const ctx: TenantContext = {
          tenantId: matched.id,
          tenantName: matched.name,
          tenantRole: matched.role,
          permissions: matched.permissions,
        };
        setTenantCtx(ctx);
        localStorage.setItem('tenantCtx', JSON.stringify(ctx));
      }
    } else {
      setTenantCtx(null);
      localStorage.removeItem('tenantCtx');
    }
    navigate('/', { replace: true });
  };

  const handleTenantReady = (result: { tenantId: string; tenantName: string; tenantRole: string; permissions: string[] }) => {
    const ctx: TenantContext = result;
    setTenantCtx(ctx);
    localStorage.setItem('tenantCtx', JSON.stringify(ctx));
    setShowOnboarding(false);
    api.tenants.list().then(list => {
      const infos: TenantInfo[] = list.map((t: any) => ({ id: t.id, name: t.name, role: t.role, permissions: typeof t.permissions === 'string' ? JSON.parse(t.permissions) : (t.permissions || []) }));
      setUserTenants(infos);
      localStorage.setItem('userTenants', JSON.stringify(infos));
    }).catch(() => {});
    navigate('/', { replace: true });
  };

  const handleSwitchTenant = () => {
    setTenantCtx(null);
    setShowOnboarding(false);
    localStorage.removeItem('tenantCtx');
  };

  const handleLogout = () => {
    const refreshToken = localStorage.getItem('refreshToken');
    const API_BASE = (import.meta as Record<string, Record<string, string>>).env?.VITE_API_BASE || 'http://localhost:3001/api';
    if (refreshToken) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    clearTokens();
    localStorage.removeItem('currentUser');
    localStorage.removeItem('tenantCtx');
    localStorage.removeItem('userTenants');
    setCurrentUser(null);
    setTenantCtx(null);
    setUserTenants([]);
    navigate('/', { replace: true });
  };

  useEffect(() => {
    if (!isLoggedIn || !tenantCtx) return;
    let cancelled = false;
    api.tenants.list().then(list => {
      if (cancelled) return;
      const infos: TenantInfo[] = list.map((t: any) => ({ id: t.id, name: t.name, role: t.role, permissions: typeof t.permissions === 'string' ? JSON.parse(t.permissions) : (t.permissions || []) }));
      setUserTenants(infos);
      localStorage.setItem('userTenants', JSON.stringify(infos));
      const matched = infos.find(t => t.id === tenantCtx.tenantId);
      if (matched) {
        const next: TenantContext = {
          tenantId: matched.id,
          tenantName: matched.name,
          tenantRole: matched.role,
          permissions: matched.permissions,
        };
        const prev = JSON.stringify(tenantCtx);
        if (JSON.stringify(next) !== prev) {
          setTenantCtx(next);
          localStorage.setItem('tenantCtx', JSON.stringify(next));
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn, tenantCtx?.tenantId]);

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
    return <TenantSelectView tenants={userTenants} onSelect={handleTenantReady} onCreateOrJoin={() => setShowOnboarding(true)} />;
  }

  return (
    <AuthenticatedApp
      key={`${currentUser!.id}_${tenantCtx!.tenantId}`}
      currentUser={currentUser!}
      tenantCtx={tenantCtx!}
      onLogout={handleLogout}
      onSwitchTenant={handleSwitchTenant}
      onProfileUpdate={(user) => {
        setCurrentUser(user);
        localStorage.setItem('currentUser', JSON.stringify(user));
      }}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

type AuthenticatedAppProps = {
  currentUser: Record<string, unknown>;
  tenantCtx: TenantContext;
  onLogout: () => void;
  onSwitchTenant: () => void;
  onProfileUpdate: (user: Record<string, unknown>) => void;
};

function AuthenticatedApp({ currentUser, tenantCtx, onLogout, onSwitchTenant, onProfileUpdate }: AuthenticatedAppProps) {
  const [profileOpen, setProfileOpen] = React.useState(false);
  const userId = String(currentUser.id ?? '');
  const hasPerm = (mod: string) => tenantCtx.tenantRole === 'owner' || tenantCtx.permissions.includes(mod) || tenantCtx.permissions.some(p => p.startsWith(`${mod}:`));
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 p-8">
        <p className="text-center">当前账号缺少用户标识，请退出后重新登录。</p>
      </div>
    );
  }

  // ── State declarations (all from API, no localStorage) ──
  const [dataLoading, setDataLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [plans, setPlans] = useState<PlanOrder[]>([]);
  const [psiRecords, setPsiRecords] = useState<any[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [prodRecords, setProdRecords] = useState<ProductionOpRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [partnerCategories, setPartnerCategories] = useState<PartnerCategory[]>([]);
  const [dictionaries, setDictionaries] = useState<AppDictionaries>(EMPTY_DICTIONARIES);
  const [globalNodes, setGlobalNodes] = useState<GlobalNodeTemplate[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>([]);
  const [financeAccountTypes, setFinanceAccountTypes] = useState<FinanceAccountType[]>([]);
  const [planFormSettings, setPlanFormSettings] = useState<PlanFormSettings>(DEFAULT_PLAN_FORM_SETTINGS);
  const [orderFormSettings, setOrderFormSettings] = useState<OrderFormSettings>(DEFAULT_ORDER_FORM_SETTINGS);
  const [purchaseOrderFormSettings, setPurchaseOrderFormSettings] = useState<PurchaseOrderFormSettings>(DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
  const [purchaseBillFormSettings, setPurchaseBillFormSettings] = useState<PurchaseBillFormSettings>(DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
  const [productionLinkMode, setProductionLinkMode] = useState<ProductionLinkMode>('order');
  const [processSequenceMode, setProcessSequenceMode] = useState<ProcessSequenceMode>('free');
  const [allowExceedMaxReportQty, setAllowExceedMaxReportQty] = useState<boolean>(true);
  const [productMilestoneProgresses, setProductMilestoneProgresses] = useState<ProductMilestoneProgress[]>([]);

  // ── Initial data loading ──
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      try {
        const results = await Promise.allSettled([
          api.settings.getConfig(),
          api.settings.categories.list(),
          api.settings.partnerCategories.list(),
          api.settings.nodes.list(),
          api.settings.warehouses.list(),
          api.settings.financeCategories.list(),
          api.settings.financeAccountTypes.list(),
          api.partners.list(),
          api.tenants.getReportableMembers(tenantCtx.tenantId),
          api.equipment.list(),
          api.dictionaries.list(),
          api.products.list(),
          api.boms.list(),
          api.plans.list(),
          api.orders.list(),
          api.production.list(),
          api.psi.list(),
          api.finance.list(),
          api.orders.listProductProgress(),
        ]);
        if (cancelled) return;
        const v = (i: number) => results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<unknown>).value : undefined;
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length) console.warn(`数据加载: ${failed.length}/${results.length} 个请求失败`, failed.map(r => (r as PromiseRejectedResult).reason?.message));
        const cfg = (v(0) || {}) as Record<string, unknown>;
        setProductionLinkMode((cfg.productionLinkMode as ProductionLinkMode) ?? 'order');
        setProcessSequenceMode((cfg.processSequenceMode as ProcessSequenceMode) ?? 'free');
        setAllowExceedMaxReportQty(cfg.allowExceedMaxReportQty !== false);
        setPlanFormSettings((cfg.planFormSettings as PlanFormSettings) ?? DEFAULT_PLAN_FORM_SETTINGS);
        setOrderFormSettings((cfg.orderFormSettings as OrderFormSettings) ?? DEFAULT_ORDER_FORM_SETTINGS);
        setPurchaseOrderFormSettings((cfg.purchaseOrderFormSettings as PurchaseOrderFormSettings) ?? DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
        setPurchaseBillFormSettings((cfg.purchaseBillFormSettings as PurchaseBillFormSettings) ?? DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
        if (v(1))  setCategories(v(1) as ProductCategory[]);
        if (v(2))  setPartnerCategories(v(2) as PartnerCategory[]);
        if (v(3))  setGlobalNodes(v(3) as GlobalNodeTemplate[]);
        if (v(4))  setWarehouses(v(4) as Warehouse[]);
        if (v(5))  setFinanceCategories(v(5) as FinanceCategory[]);
        if (v(6))  setFinanceAccountTypes(v(6) as FinanceAccountType[]);
        if (v(7))  setPartners(v(7) as any[]);
        if (v(8))  setWorkers(v(8) as any[]);
        if (v(9))  setEquipment(v(9) as any[]);
        if (v(10)) setDictionaries(v(10) as AppDictionaries);
        if (v(11)) setProducts(normalizeDecimals(v(11) as Product[]));
        if (v(12)) setBoms(normalizeDecimals(v(12) as BOM[]));
        if (v(13)) setPlans(normalizeDecimals(v(13) as PlanOrder[]));
        if (v(14)) setOrders(normalizeDecimals(v(14) as ProductionOrder[]));
        if (v(15)) setProdRecords(normalizeDecimals(v(15) as ProductionOpRecord[]));
        if (v(16)) setPsiRecords(normalizeDecimals(v(16) as any[]));
        if (v(17)) setFinanceRecords(normalizeDecimals(v(17) as FinanceRecord[]));
        if (v(18)) setProductMilestoneProgresses(normalizeDecimals(v(18) as ProductMilestoneProgress[]));
      } catch (err) {
        console.error('数据加载失败', err);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // ── Refresh helpers ──
  const refreshPlans = async () => setPlans(normalizeDecimals(await api.plans.list() as PlanOrder[]));
  const refreshOrders = async () => setOrders(normalizeDecimals(await api.orders.list() as ProductionOrder[]));
  const refreshProducts = async () => setProducts(normalizeDecimals(await api.products.list() as Product[]));
  const refreshBoms = async () => setBoms(normalizeDecimals(await api.boms.list() as BOM[]));
  const refreshProdRecords = async () => setProdRecords(normalizeDecimals(await api.production.list() as ProductionOpRecord[]));
  const refreshPsiRecords = async () => setPsiRecords(normalizeDecimals(await api.psi.list() as any[]));
  const refreshFinanceRecords = async () => setFinanceRecords(normalizeDecimals(await api.finance.list() as FinanceRecord[]));
  const refreshPMP = async () => setProductMilestoneProgresses(normalizeDecimals(await api.orders.listProductProgress() as ProductMilestoneProgress[]));
  const refreshCategories = async () => setCategories(await api.settings.categories.list() as ProductCategory[]);
  const refreshPartnerCategories = async () => setPartnerCategories(await api.settings.partnerCategories.list() as PartnerCategory[]);
  const refreshGlobalNodes = async () => setGlobalNodes(await api.settings.nodes.list() as GlobalNodeTemplate[]);
  const refreshWarehouses = async () => setWarehouses(await api.settings.warehouses.list() as Warehouse[]);
  const refreshFinanceCategories = async () => setFinanceCategories(await api.settings.financeCategories.list() as FinanceCategory[]);
  const refreshFinanceAccountTypes = async () => setFinanceAccountTypes(await api.settings.financeAccountTypes.list() as FinanceAccountType[]);
  const refreshPartners = async () => setPartners(await api.partners.list() as any[]);
  const refreshWorkers = async () => setWorkers(await api.tenants.getReportableMembers(tenantCtx.tenantId) as any[]);
  const refreshEquipment = async () => setEquipment(await api.equipment.list() as any[]);
  const refreshDictionaries = async () => setDictionaries(await api.dictionaries.list() as AppDictionaries);

  // ── Config update handlers (7 items) ──
  const onUpdateProductionLinkMode = async (mode: ProductionLinkMode) => {
    await api.settings.updateConfig('productionLinkMode', mode);
    setProductionLinkMode(mode);
  };
  const onUpdateProcessSequenceMode = async (mode: ProcessSequenceMode) => {
    await api.settings.updateConfig('processSequenceMode', mode);
    setProcessSequenceMode(mode);
  };
  const onUpdateAllowExceedMaxReportQty = async (value: boolean) => {
    await api.settings.updateConfig('allowExceedMaxReportQty', value);
    setAllowExceedMaxReportQty(value);
  };
  const onUpdatePlanFormSettings = async (v: PlanFormSettings) => {
    await api.settings.updateConfig('planFormSettings', v);
    setPlanFormSettings(v);
  };
  const onUpdateOrderFormSettings = async (v: OrderFormSettings) => {
    await api.settings.updateConfig('orderFormSettings', v);
    setOrderFormSettings(v);
  };
  const onUpdatePurchaseOrderFormSettings = async (v: PurchaseOrderFormSettings) => {
    await api.settings.updateConfig('purchaseOrderFormSettings', v);
    setPurchaseOrderFormSettings(v);
  };
  const onUpdatePurchaseBillFormSettings = async (v: PurchaseBillFormSettings) => {
    await api.settings.updateConfig('purchaseBillFormSettings', v);
    setPurchaseBillFormSettings(v);
  };

  // ── Product / BOM handlers ──
  const onUpdateProduct = async (p: Product) => {
    try {
      const exists = products.some(px => px.id === p.id);
      if (exists) { await api.products.update(p.id, p); } else { await api.products.create(p); }
      await refreshProducts();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };
  const onUpdateBOM = async (b: BOM) => {
    try {
      const exists = boms.some(bx => bx.id === b.id);
      if (exists) { await api.boms.update(b.id, b); } else { await api.boms.create(b); }
      await refreshBoms();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  // ── Plan handlers ──
  const onCreatePlan = async (p: PlanOrder) => {
    try {
      await api.plans.create(p);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '创建计划失败'); }
  };
  const onUpdatePlan = async (id: string, updates: Partial<PlanOrder>) => {
    try {
      await api.plans.update(id, updates);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '更新计划失败'); }
  };
  const onSplitPlan = async (planId: string, newPlans: PlanOrder[]) => {
    try {
      for (const sp of newPlans) await api.plans.create(sp);
      await api.plans.delete(planId);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '拆分失败'); }
  };
  const onDeletePlan = async (id: string) => {
    try {
      await api.plans.delete(id);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '删除计划失败'); }
  };
  const onConvertToOrder = async (id: string) => {
    try {
      await api.plans.convert(id);
      await Promise.allSettled([refreshPlans(), refreshOrders()]);
    } catch (err: any) { toast.error(err.message || '下达工单失败'); }
  };
  const onCreateSubPlan = async ({ productId, quantity, planId, bomNodeId }: { productId: string; quantity: number; planId: string; bomNodeId?: string }) => {
    try {
      await api.plans.createSubPlans(planId, [{ productId, bomNodeId, items: [{ quantity }] }]);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '创建子计划失败'); }
  };
  const onCreateSubPlans = async ({ planId, items }: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId?: string; parentProductId?: string; parentNodeId?: string }> }) => {
    try {
      const subPlans = items.map(i => ({ productId: i.productId, bomNodeId: i.bomNodeId, items: [{ quantity: i.quantity }] }));
      await api.plans.createSubPlans(planId, subPlans);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '创建子计划失败'); }
  };

  // ── Order / report handlers ──
  const onReportSubmit = async (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : '张主管';
      const rate = products.find(p => p.id === orders.find(o => o.id === oId)?.productId)?.nodeRates?.[orders.find(o => o.id === oId)?.milestones.find(m => m.id === mId)?.templateId ?? ''];
      await api.orders.createReport(oId, mId, {
        quantity: qty, operator: operatorName, defectiveQuantity: defectiveQty || 0,
        variantId: vId, workerId, equipmentId, reportBatchId, reportNo,
        customData: data ?? {}, rate: rate != null ? rate : undefined,
      });
      await refreshOrders();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  };

  const onReportSubmitProduct = async (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : '张主管';
      const rate = products.find(p => p.id === productId)?.nodeRates?.[milestoneTemplateId];
      await api.orders.createProductReport({
        productId, milestoneTemplateId, quantity: qty, operator: operatorName,
        defectiveQuantity: defectiveQty || 0, variantId: vId, workerId, equipmentId,
        reportBatchId, reportNo, customData: data ?? {}, rate: rate != null ? rate : undefined,
      });
      await refreshPMP();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  };

  const onUpdateReport = async ({ orderId, milestoneId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneId }: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string }) => {
    try {
      const targetMilestoneId = newMilestoneId || milestoneId;
      if (targetMilestoneId !== milestoneId) {
        await api.orders.deleteReport(orderId, milestoneId, reportId);
        await api.orders.createReport(orderId, targetMilestoneId, {
          quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator,
        });
      } else {
        await api.orders.updateReport(orderId, milestoneId, reportId, {
          quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator,
        });
      }
      await refreshOrders();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  };

  const onDeleteReport = async ({ orderId, milestoneId, reportId }: { orderId: string; milestoneId: string; reportId: string }) => {
    try {
      await api.orders.deleteReport(orderId, milestoneId, reportId);
      await refreshOrders();
    } catch (err: any) { toast.error(err.message || '删除报工失败'); }
  };

  const onUpdateReportProduct = async ({ progressId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneTemplateId }: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string }) => {
    try {
      if (newMilestoneTemplateId) {
        const srcProgress = productMilestoneProgresses.find(p => p.id === progressId);
        if (!srcProgress) return;
        await api.orders.deleteProductReport(reportId);
        await api.orders.createProductReport({
          productId: srcProgress.productId, variantId: srcProgress.variantId,
          milestoneTemplateId: newMilestoneTemplateId,
          quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator,
        });
      } else {
        await api.orders.updateProductReport(reportId, {
          quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator,
        });
      }
      await refreshPMP();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  };

  const onDeleteReportProduct = async ({ progressId, reportId }: { progressId: string; reportId: string }) => {
    try {
      await api.orders.deleteProductReport(reportId);
      await refreshPMP();
    } catch (err: any) { toast.error(err.message || '删除报工失败'); }
  };

  const onUpdateOrder = async (orderId: string, updates: Partial<ProductionOrder>) => {
    try {
      await api.orders.update(orderId, updates);
      await refreshOrders();
    } catch (err: any) { toast.error(err.message || '更新工单失败'); }
  };

  const onDeleteOrder = async (orderId: string) => {
    try {
      await api.orders.delete(orderId);
      await refreshOrders();
    } catch (err: any) { toast.error(err.message || '删除工单失败'); }
  };

  // ── Production record handlers ──
  const handleAddProdRecord = async (record: ProductionOpRecord) => {
    try {
      await api.production.create(record);
      await Promise.allSettled([refreshProdRecords(), refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  };
  const handleAddProdRecordsBatch = async (records: ProductionOpRecord[]) => {
    try {
      for (const record of records) {
        await api.production.create(record);
      }
      await Promise.allSettled([refreshProdRecords(), refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '批量添加记录失败'); }
  };
  const onUpdateProdRecord = async (r: ProductionOpRecord) => {
    try {
      await api.production.update(r.id, r);
      await refreshProdRecords();
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  };
  const onDeleteProdRecord = async (id: string) => {
    try {
      await api.production.delete(id);
      await refreshProdRecords();
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  };

  // ── PSI record handlers ──
  const handleAddPSIRecord = async (record: any) => {
    try {
      await api.psi.create(record);
      await refreshPsiRecords();
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  };
  const handleAddPSIRecordsBatch = async (records: any[]) => {
    try {
      await api.psi.createBatch(records);
      await refreshPsiRecords();
    } catch (err: any) { toast.error(err.message || '批量添加记录失败'); }
  };
  const handleReplacePSIRecords = async (type: string, docNumber: string, newRecords: any[]) => {
    try {
      const deleteIds = psiRecords.filter(r => r.type === type && r.docNumber === docNumber).map(r => r.id);
      await api.psi.replace(deleteIds, newRecords);
      await refreshPsiRecords();
    } catch (err: any) { toast.error(err.message || '替换记录失败'); }
  };
  const handleDeletePSIRecords = async (type: string, docNumber: string) => {
    try {
      const ids = psiRecords.filter(r => r.type === type && r.docNumber === docNumber).map(r => r.id);
      if (ids.length) await api.psi.deleteBatch(ids);
      await refreshPsiRecords();
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  };

  // ── Finance record handlers ──
  const onAddFinanceRecord = async (r: FinanceRecord) => {
    try {
      await api.finance.create(r);
      await refreshFinanceRecords();
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  };
  const onUpdateFinanceRecord = async (r: FinanceRecord) => {
    try {
      await api.finance.update(r.id, r);
      await refreshFinanceRecords();
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  };
  const onDeleteFinanceRecord = async (id: string) => {
    try {
      await api.finance.delete(id);
      await refreshFinanceRecords();
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  };

  // ── Loading UI ──
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
        {/* Sidebar Navigation */}
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

          <button onClick={onSwitchTenant}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-left"
            title="切换企业">
            <Building2 className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="truncate text-xs font-bold text-indigo-700">{tenantCtx.tenantName}</span>
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
            />
            <button
              onClick={onLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> 退出登录
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 overflow-auto pt-4 px-12 pb-12 bg-slate-50/30">
          <Routes>
            <Route path="/" element={<DashboardView orders={orders} financeRecords={financeRecords} psiRecords={psiRecords} products={products} productionLinkMode={productionLinkMode} />} />
            <Route path="/production" element={
              <ProductionManagementView 
                productionLinkMode={productionLinkMode}
                processSequenceMode={processSequenceMode}
                allowExceedMaxReportQty={allowExceedMaxReportQty}
                plans={plans}
                orders={orders}
                products={products}
                categories={categories}
                dictionaries={dictionaries}
                workers={workers}
                equipment={equipment}
                prodRecords={prodRecords}
                psiRecords={psiRecords}
                warehouses={warehouses}
                globalNodes={globalNodes}
                boms={boms}
                partners={partners}
                partnerCategories={partnerCategories}
                planFormSettings={planFormSettings}
                onUpdatePlanFormSettings={onUpdatePlanFormSettings}
                orderFormSettings={orderFormSettings}
                onUpdateOrderFormSettings={onUpdateOrderFormSettings}
                onCreatePlan={onCreatePlan}
                onUpdateProduct={onUpdateProduct}
                onUpdatePlan={onUpdatePlan}
                onSplitPlan={onSplitPlan}
                onDeletePlan={onDeletePlan}
                onConvertToOrder={onConvertToOrder}
                onAddRecord={handleAddProdRecord}
                onAddRecordBatch={handleAddProdRecordsBatch}
                onUpdateRecord={onUpdateProdRecord}
                onDeleteRecord={onDeleteProdRecord}
                onAddPSIRecord={handleAddPSIRecord}
                onAddPSIRecordBatch={handleAddPSIRecordsBatch}
                onCreateSubPlan={onCreateSubPlan}
                onCreateSubPlans={onCreateSubPlans}
                onReportSubmit={onReportSubmit}
                onReportSubmitProduct={onReportSubmitProduct}
                onUpdateReport={onUpdateReport}
                onDeleteReport={onDeleteReport}
                productMilestoneProgresses={productMilestoneProgresses}
                onUpdateReportProduct={onUpdateReportProduct}
                onDeleteReportProduct={onDeleteReportProduct}
                onUpdateOrder={onUpdateOrder}
                onDeleteOrder={onDeleteOrder}
                userPermissions={tenantCtx?.permissions}
                tenantRole={tenantCtx?.tenantRole}
              />
            } />
            <Route path="/psi" element={
              <PSIView 
                products={products}
                records={psiRecords}
                prodRecords={prodRecords}
                orders={orders}
                warehouses={warehouses}
                categories={categories}
                partners={partners}
                partnerCategories={partnerCategories}
                dictionaries={dictionaries}
                purchaseOrderFormSettings={purchaseOrderFormSettings}
                onUpdatePurchaseOrderFormSettings={onUpdatePurchaseOrderFormSettings}
                purchaseBillFormSettings={purchaseBillFormSettings}
                onUpdatePurchaseBillFormSettings={onUpdatePurchaseBillFormSettings}
                onAddRecord={handleAddPSIRecord}
                onAddRecordBatch={handleAddPSIRecordsBatch}
                onReplaceRecords={handleReplacePSIRecords}
                onDeleteRecords={handleDeletePSIRecords}
                userPermissions={tenantCtx?.permissions}
                tenantRole={tenantCtx?.tenantRole || ''}
              />
            } />
            <Route path="/finance" element={
              <FinanceView
                orders={orders}
                records={financeRecords}
                psiRecords={psiRecords}
                prodRecords={prodRecords}
                onAddRecord={onAddFinanceRecord}
                onUpdateRecord={onUpdateFinanceRecord}
                onDeleteRecord={onDeleteFinanceRecord}
                financeCategories={financeCategories}
                financeAccountTypes={financeAccountTypes}
                partners={partners}
                workers={workers}
                products={products}
                partnerCategories={partnerCategories}
                categories={categories}
                globalNodes={globalNodes}
                userPermissions={tenantCtx?.permissions}
                tenantRole={tenantCtx?.tenantRole}
              />
            } />
            <Route path="/basic" element={
              <BasicInfoView 
                products={products}
                globalNodes={globalNodes}
                categories={categories}
                partnerCategories={partnerCategories}
                boms={boms}
                equipment={equipment}
                dictionaries={dictionaries}
                partners={partners}
                onUpdateProduct={onUpdateProduct}
                onUpdateBOM={onUpdateBOM}
                onRefreshDictionaries={refreshDictionaries}
                onRefreshWorkers={refreshWorkers}
                onRefreshEquipment={refreshEquipment}
                onRefreshPartners={refreshPartners}
                onRefreshPartnerCategories={refreshPartnerCategories}
                tenantId={tenantCtx.tenantId}
                tenantRole={tenantCtx.tenantRole}
                currentUserId={userId}
                userPermissions={tenantCtx.permissions}
              />
            } />
            <Route path="/settings" element={
              <SettingsView 
                categories={categories}
                partnerCategories={partnerCategories}
                globalNodes={globalNodes}
                warehouses={warehouses}
                productionLinkMode={productionLinkMode}
                onUpdateProductionLinkMode={onUpdateProductionLinkMode}
                processSequenceMode={processSequenceMode}
                onUpdateProcessSequenceMode={onUpdateProcessSequenceMode}
                allowExceedMaxReportQty={allowExceedMaxReportQty}
                onUpdateAllowExceedMaxReportQty={onUpdateAllowExceedMaxReportQty}
                onRefreshCategories={refreshCategories}
                onRefreshPartnerCategories={refreshPartnerCategories}
                onRefreshGlobalNodes={refreshGlobalNodes}
                onRefreshWarehouses={refreshWarehouses}
                financeCategories={financeCategories}
                onRefreshFinanceCategories={refreshFinanceCategories}
                financeAccountTypes={financeAccountTypes}
                onRefreshFinanceAccountTypes={refreshFinanceAccountTypes}
                userPermissions={tenantCtx?.permissions}
                tenantRole={tenantCtx?.tenantRole}
              />
            } />
            <Route
              path="/admin/users"
              element={
                (currentUser as Record<string, unknown>)?.role === 'admin' &&
                (currentUser as Record<string, unknown>)?.id ? (
                  <UserAdminView
                    currentUserId={String((currentUser as Record<string, unknown>).id)}
                  />
                ) : (
                  <div className="max-w-md mx-auto mt-24 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
                    <p className="text-slate-700 font-bold mb-4">仅管理员可访问账号管理</p>
                    <Link to="/" className="text-indigo-600 font-bold hover:underline">
                      返回首页
                    </Link>
                  </div>
                )
              }
            />
            <Route path="/orders/:id" element={<Navigate to="/production" replace state={{ tab: 'orders' }} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
  );
}
