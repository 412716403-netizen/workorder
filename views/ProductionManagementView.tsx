import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  CalendarRange, 
  ClipboardList, 
  ArrowUpFromLine,
  Truck,
  RotateCcw
} from 'lucide-react';
import { 
  PlanOrder, ProductionOrder, Product, BOM,
  ProductionOpRecord, GlobalNodeTemplate, ProdOpType, ProductCategory, AppDictionaries, Worker, Equipment,   PlanFormSettings, OrderFormSettings, MaterialPanelSettings, MaterialFormSettings, OutsourceFormSettings, ReworkFormSettings, Partner, PartnerCategory, ProductionLinkMode, ProductMilestoneProgress, ProcessSequenceMode, Warehouse, PrintTemplate
} from '../types';
import { lazyWithReloadOnChunkError } from '../utils/lazyWithReloadOnChunkError';

const PlanOrderListView = lazyWithReloadOnChunkError(() => import('./PlanOrderListView'));
const OrderListView = lazyWithReloadOnChunkError(() => import('./OrderListView'));
const ProductionMgmtOpsView = lazyWithReloadOnChunkError(() => import('./ProductionMgmtOpsView'));

const TabPanelFallback = () => (
  <div className="flex min-h-[320px] items-center justify-center text-sm font-medium text-slate-400">
    加载中…
  </div>
);
import {
  subModuleMainContentTopClass,
  subModuleTabBarBackdropClass,
  subModuleTabBarInsetClass,
  subModuleTabBarStickyPadClass,
  subModuleTabButtonClass,
  subModuleTabPillClass,
} from '../styles/uiDensity';
import { useModulePermission, usePermFilteredTabs } from '../hooks/useModulePermission';
import { useSetMainScrollSegment } from '../contexts/MainScrollSegmentContext';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData, useConfigData, useOrdersData, usePsiData, useAppActions } from '../contexts/AppDataContext';

type MainTab = 'plans' | 'orders' | ProdOpType;

const ProductionManagementView: React.FC = () => {
  const m = useMasterData();
  const c = useConfigData();
  const o = useOrdersData();
  const { psiRecords } = usePsiData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();

  useEffect(() => { void a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);

  const productionLinkMode = c.productionLinkMode;
  const processSequenceMode = c.processSequenceMode;
  const allowExceedMaxReportQty = c.allowExceedMaxReportQty;
  const plans = o.plans;
  const orders = o.orders;
  const products = m.products;
  const categories = m.categories;
  const dictionaries = m.dictionaries;
  const workers = m.workers;
  const equipment = m.equipment;
  const prodRecords = o.prodRecords;
  const warehouses = m.warehouses;
  const globalNodes = m.globalNodes;
  const boms = m.boms;
  const partners = m.partners;
  const partnerCategories = m.partnerCategories;
  const planFormSettings = c.planFormSettings;
  const onUpdatePlanFormSettings = a.onUpdatePlanFormSettings;
  const printTemplates = c.printTemplates;
  const onUpdatePrintTemplates = a.onUpdatePrintTemplates;
  const onRefreshPrintTemplates = a.refreshPrintTemplates;
  const orderFormSettings = c.orderFormSettings;
  const onUpdateOrderFormSettings = a.onUpdateOrderFormSettings;
  const materialPanelSettings = c.materialPanelSettings;
  const onUpdateMaterialPanelSettings = a.onUpdateMaterialPanelSettings;
  const materialFormSettings = c.materialFormSettings;
  const onUpdateMaterialFormSettings = a.onUpdateMaterialFormSettings;
  const outsourceFormSettings = c.outsourceFormSettings;
  const onUpdateOutsourceFormSettings = a.onUpdateOutsourceFormSettings;
  const reworkFormSettings = c.reworkFormSettings;
  const onUpdateReworkFormSettings = a.onUpdateReworkFormSettings;
  const onCreatePlan = a.onCreatePlan;
  const onUpdateProduct = a.onUpdateProduct;
  const onUpdatePlan = a.onUpdatePlan;
  const onSplitPlan = a.onSplitPlan;
  const onConvertToOrder = a.onConvertToOrder;
  const onDeletePlan = a.onDeletePlan;
  const onAddRecord = a.onAddProdRecord;
  const onAddRecordBatch = a.onAddProdRecordBatch;
  const onUpdateRecord = a.onUpdateProdRecord;
  const onDeleteRecord = a.onDeleteProdRecord;
  const onAddPSIRecord = a.onAddPSIRecord;
  const onAddPSIRecordBatch = a.onAddPSIRecordBatch;
  const onReportSubmit = a.onReportSubmit;
  const onCreateSubPlan = a.onCreateSubPlan;
  const onCreateSubPlans = a.onCreateSubPlans;
  const onUpdateOrder = a.onUpdateOrder;
  const onDeleteOrder = a.onDeleteOrder;
  const onUpdateReport = a.onUpdateReport;
  const onDeleteReport = a.onDeleteReport;
  const productMilestoneProgresses = o.productMilestoneProgresses;
  const onReportSubmitProduct = a.onReportSubmitProduct;
  const onUpdateReportProduct = a.onUpdateReportProduct;
  const onDeleteReportProduct = a.onDeleteReportProduct;
  const userPermissions = tenantCtx?.permissions;
  const tenantRole = tenantCtx?.tenantRole;
  const location = useLocation();
  const navigate = useNavigate();

  const { hasPerm: hasProdPerm } = useModulePermission({ tenantRole, userPermissions, moduleName: 'production' });

  const PROD_TAB_PERM_GROUPS: Record<string, string[]> = useMemo(() => ({
    plans: ['plans'],
    orders: ['orders_list', 'orders_form_config', 'orders_report_records', 'orders_pending_stock_in', 'orders_detail', 'orders_material', 'orders_rework'],
    STOCK_OUT: ['material_list', 'material_records', 'material_issue', 'material_return'],
    OUTSOURCE: ['outsource_form_config', 'outsource_list', 'outsource_send', 'outsource_receive', 'outsource_records', 'outsource_material'],
    REWORK: [
      'rework_list',
      'rework_defective',
      'rework_records',
      'rework_report_records',
      'rework_detail',
      'rework_material',
      'rework_form_config',
    ],
  }), []);

  const [activeTab, setActiveTab] = useState<MainTab>('plans');

  /** 关闭工单详情时清除 location.state 中的 detailOrderId，避免切到其他 tab 再回工单中心时弹窗再次打开 */
  const clearDetailOrderIdFromState = () => {
    const state = location.state && typeof location.state === 'object' && !Array.isArray(location.state) ? location.state as Record<string, unknown> : {};
    if ('detailOrderId' in state) {
      const { detailOrderId: _, ...rest } = state;
      navigate(location.pathname, { replace: true, state: Object.keys(rest).length > 0 ? rest : undefined });
    }
  };

  useEffect(() => {
    const tab = (location.state as { tab?: MainTab })?.tab;
    if (tab && ['plans', 'orders', 'STOCK_OUT', 'OUTSOURCE', 'REWORK'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.state]);

  const setScrollSegment = useSetMainScrollSegment();
  useLayoutEffect(() => {
    setScrollSegment?.(activeTab);
  }, [activeTab, setScrollSegment]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [barStyle, setBarStyle] = useState<{ left: number; width: number } | null>(null);

  const updateBarPosition = () => {
    const scrollParent = sentinelRef.current?.closest('[class*="overflow-auto"]');
    if (scrollParent) {
      const rect = scrollParent.getBoundingClientRect();
      setBarStyle({ left: rect.left, width: rect.width });
    }
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollParent = sentinel?.closest('[class*="overflow-auto"]');
    if (!sentinel || !scrollParent) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { root: scrollParent, rootMargin: '0px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (isStuck) {
      updateBarPosition();
      window.addEventListener('resize', updateBarPosition);
      return () => window.removeEventListener('resize', updateBarPosition);
    } else {
      setBarStyle(null);
    }
  }, [isStuck]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (tabsWrapRef.current) {
        setPlaceholderHeight(tabsWrapRef.current.offsetHeight);
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const allTabs = useMemo(() => [
    { id: 'plans', label: '生产计划', icon: CalendarRange, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'orders', label: '工单中心', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'STOCK_OUT', label: '生产物料', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ], []);
  const tabs = usePermFilteredTabs({
    allTabs,
    permGroups: PROD_TAB_PERM_GROUPS,
    permPrefix: 'production',
    hasPerm: hasProdPerm,
    activeTab,
    setActiveTab: (id) => setActiveTab(id as MainTab),
  });

  return (
    <div className="space-y-0">
      <div>
        <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
        <div
          ref={tabsWrapRef}
          className={`${subModuleTabBarBackdropClass} ${
            isStuck
              ? `fixed top-0 px-12 ${subModuleTabBarStickyPadClass}`
              : subModuleTabBarInsetClass
          }`}
          style={isStuck && barStyle ? { left: barStyle.left, width: barStyle.width } : undefined}
        >
          <div className={subModuleTabPillClass}>
            <div className="flex gap-1 min-w-max">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as MainTab)}
                  className={subModuleTabButtonClass(activeTab === tab.id)}
                >
                  <tab.icon
                    className={`w-4 h-4 shrink-0 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-300'}`}
                  />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {isStuck && placeholderHeight > 0 && (
        <div style={{ height: placeholderHeight }} aria-hidden="true" />
      )}
      <div className={`min-h-[600px] ${subModuleMainContentTopClass}`}>
        {activeTab === 'plans' && (
          <Suspense fallback={<TabPanelFallback />}>
          <PlanOrderListView 
            productionLinkMode={productionLinkMode}
            plans={plans} 
            products={products} 
            categories={categories}
            dictionaries={dictionaries}
            workers={workers}
            equipment={equipment}
            globalNodes={globalNodes}
            boms={boms}
            partners={partners}
            partnerCategories={partnerCategories}
            psiRecords={psiRecords}
            planFormSettings={planFormSettings}
            onUpdatePlanFormSettings={onUpdatePlanFormSettings}
            printTemplates={printTemplates}
            onUpdatePrintTemplates={onUpdatePrintTemplates}
            onRefreshPrintTemplates={onRefreshPrintTemplates}
            orders={orders}
            onCreatePlan={hasProdPerm('production:plans:create') ? onCreatePlan : undefined as any}
            onUpdateProduct={onUpdateProduct}
            onUpdatePlan={hasProdPerm('production:plans:edit') ? onUpdatePlan : undefined}
            onSplitPlan={hasProdPerm('production:plans:edit') ? onSplitPlan : (() => {})}
            onConvertToOrder={hasProdPerm('production:plans:edit') ? onConvertToOrder : (() => {})}
            onDeletePlan={hasProdPerm('production:plans:delete') ? onDeletePlan : undefined}
            onAddPSIRecord={onAddPSIRecord}
            onAddPSIRecordBatch={onAddPSIRecordBatch}
            onCreateSubPlan={onCreateSubPlan}
            onCreateSubPlans={onCreateSubPlans}
          />
          </Suspense>
        )}

        {activeTab === 'orders' && (
          <Suspense fallback={<TabPanelFallback />}>
<OrderListView
            initialDetailOrderId={(location.state as { detailOrderId?: string })?.detailOrderId}
            onClearDetailOrderIdFromState={clearDetailOrderIdFromState}
            productionLinkMode={productionLinkMode}
            processSequenceMode={processSequenceMode}
            allowExceedMaxReportQty={allowExceedMaxReportQty}
            orders={orders}
            plans={plans}
            products={products} 
            workers={workers}
            equipment={equipment}
            categories={categories}
            dictionaries={dictionaries}
            partners={partners}
            boms={boms}
            globalNodes={globalNodes}
            planFormSettings={planFormSettings}
            orderFormSettings={orderFormSettings}
            printTemplates={printTemplates}
            onUpdatePrintTemplates={onUpdatePrintTemplates}
            onRefreshPrintTemplates={onRefreshPrintTemplates}
            prodRecords={prodRecords}
            psiRecords={psiRecords}
            warehouses={warehouses}
            onUpdateOrderFormSettings={onUpdateOrderFormSettings}
            onReportSubmit={onReportSubmit}
            onUpdateOrder={onUpdateOrder}
            onDeleteOrder={onDeleteOrder}
            onUpdateReport={onUpdateReport}
            onDeleteReport={onDeleteReport}
            onUpdateProduct={onUpdateProduct}
            onAddRecord={onAddRecord}
            onAddRecordBatch={onAddRecordBatch}
            onUpdateRecord={onUpdateRecord}
            onDeleteRecord={onDeleteRecord}
            productMilestoneProgresses={productMilestoneProgresses}
            onReportSubmitProduct={onReportSubmitProduct}
            onUpdateReportProduct={onUpdateReportProduct}
            onDeleteReportProduct={onDeleteReportProduct}
            onNavigateToProductEdit={(productId: string) => navigate('/basic', { state: { editProductId: productId } })}
            userPermissions={userPermissions}
            tenantRole={tenantRole}
          />
          </Suspense>
        )}

        {['STOCK_OUT', 'OUTSOURCE', 'REWORK'].includes(activeTab) && (
          <Suspense fallback={<TabPanelFallback />}>
          <ProductionMgmtOpsView 
            productionLinkMode={productionLinkMode}
            productMilestoneProgresses={productMilestoneProgresses}
            plans={plans}
            records={prodRecords} 
            orders={orders} 
            products={products} 
            warehouses={warehouses}
            boms={boms}
            dictionaries={dictionaries}
            onAddRecord={onAddRecord}
            onAddRecordBatch={onAddRecordBatch}
            onUpdateRecord={onUpdateRecord}
            onDeleteRecord={onDeleteRecord}
            limitType={activeTab as ProdOpType}
            globalNodes={globalNodes}
            partners={partners}
            categories={categories}
            partnerCategories={partnerCategories}
            workers={workers}
            equipment={equipment}
            processSequenceMode={processSequenceMode}
            materialPanelSettings={materialPanelSettings}
            onUpdateMaterialPanelSettings={onUpdateMaterialPanelSettings}
            materialFormSettings={materialFormSettings}
            onUpdateMaterialFormSettings={onUpdateMaterialFormSettings}
            printTemplates={printTemplates}
            onUpdatePrintTemplates={onUpdatePrintTemplates}
            onRefreshPrintTemplates={onRefreshPrintTemplates}
            outsourceFormSettings={outsourceFormSettings}
            onUpdateOutsourceFormSettings={onUpdateOutsourceFormSettings}
            reworkFormSettings={reworkFormSettings}
            onUpdateReworkFormSettings={onUpdateReworkFormSettings}
            userPermissions={userPermissions}
            tenantRole={tenantRole}
            psiRecords={psiRecords}
            planFormSettings={planFormSettings}
          />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default ProductionManagementView;
