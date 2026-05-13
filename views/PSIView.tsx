import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, Suspense, lazy } from 'react';
import { 
  ClipboardList, 
  Receipt, 
  ShoppingBag, 
  CreditCard, 
  Warehouse
} from 'lucide-react';
import { Product, Warehouse as WarehouseType, ProductCategory, Partner, PartnerCategory, AppDictionaries } from '../types';
const PSIOpsView = lazy(() => import('./PSIOpsView'));

const PsiPanelFallback = () => (
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
import { useMasterData, useConfigData, useOrdersData, useAppActions } from '../contexts/AppDataContext';
// Phase 3.D follow-up：PSIView 不再向 PSIOpsView 透传 `prodRecords` 全量大包；
// WarehousePanel 内已用 useQuery 按 STOCK_* 类型窄拉；OrderBillFormPage 内 prodRecords
// 仅用于销售单打印应收 ledger，Step 3.2 会改为打印时异步取后端 partner-receivable。

// 简化业务类型，将仓库相关合并为 WAREHOUSE_MGMT
type PSITab = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL' | 'WAREHOUSE_MGMT';

const TAB_PERM_GROUPS: Record<string, string[]> = {
  PURCHASE_ORDER: ['purchase_order'],
  PURCHASE_BILL: ['purchase_bill'],
  SALES_ORDER: ['sales_order', 'sales_order_allocation', 'sales_order_pending_shipment'],
  SALES_BILL: ['sales_bill'],
  WAREHOUSE_MGMT: ['warehouse_list', 'warehouse_stocktake', 'warehouse_transfer', 'warehouse_flow'],
};

const PSIView: React.FC = () => {
  const m = useMasterData();
  const c = useConfigData();
  const o = useOrdersData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();
  /**
   * Phase 3.D follow-up：context 已不再维护 psi 全量；
   * 各 PSI 作业页内部由 `usePsiOpsRecordsList` 按 tab 的 type 集合 react-query 窄拉，
   * 这里仅传 [] 占位（保留 PSIOpsView records prop 签名，后续可整体删）。
   */
  const records: any[] = [];

  useEffect(() => { void a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);

  const products = m.products;
  const warehouses = m.warehouses;
  const categories = m.categories;
  const partners = m.partners;
  const partnerCategories = m.partnerCategories;
  const dictionaries = m.dictionaries;
  const purchaseOrderFormSettings = c.purchaseOrderFormSettings;
  const onUpdatePurchaseOrderFormSettings = a.onUpdatePurchaseOrderFormSettings;
  const salesOrderFormSettings = c.salesOrderFormSettings;
  const onUpdateSalesOrderFormSettings = a.onUpdateSalesOrderFormSettings;
  const purchaseBillFormSettings = c.purchaseBillFormSettings;
  const onUpdatePurchaseBillFormSettings = a.onUpdatePurchaseBillFormSettings;
  const salesBillFormSettings = c.salesBillFormSettings;
  const onUpdateSalesBillFormSettings = a.onUpdateSalesBillFormSettings;
  const onAddRecord = a.onAddPSIRecord;
  const onAddRecordBatch = a.onAddPSIRecordBatch;
  const onReplaceRecords = a.onReplacePSIRecords;
  const onDeleteRecords = a.onDeletePSIRecords;
  const orders = o.orders;
  const userPermissions = tenantCtx?.permissions;
  const tenantRole = tenantCtx?.tenantRole || '';
  const [activeTab, setActiveTab] = useState<PSITab>('PURCHASE_ORDER');
  const setScrollSegment = useSetMainScrollSegment();
  useLayoutEffect(() => {
    setScrollSegment?.(activeTab);
  }, [activeTab, setScrollSegment]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [barStyle, setBarStyle] = useState<{ left: number; width: number } | null>(null);

  const { hasPerm: hasPsiPerm } = useModulePermission({ tenantRole, userPermissions, moduleName: 'psi' });

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
    { id: 'PURCHASE_ORDER', label: '采购订单', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '合同与采购计划' },
    { id: 'PURCHASE_BILL', label: '采购单', icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '进货收货确认' },
    { id: 'SALES_ORDER', label: '销售订单', icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '客户订货合同' },
    { id: 'SALES_BILL', label: '销售单', icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '发货与账务结算' },
    { id: 'WAREHOUSE_MGMT', label: '仓库管理', icon: Warehouse, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '库存查询、调拨与盘点工具' },
  ], []);
  const tabs = usePermFilteredTabs({
    allTabs,
    permGroups: TAB_PERM_GROUPS,
    permPrefix: 'psi',
    hasPerm: hasPsiPerm,
    activeTab,
    setActiveTab: (id) => setActiveTab(id as PSITab),
  });

  return (
    <div className="space-y-0">
      <>
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
                    onClick={() => setActiveTab(tab.id as PSITab)}
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
      </>
      <div className={`min-h-[600px] ${subModuleMainContentTopClass}`}>
        <Suspense fallback={<PsiPanelFallback />}>
        <PSIOpsView 
          type={activeTab}
          products={products}
          warehouses={warehouses}
          categories={categories}
          partners={partners}
          partnerCategories={partnerCategories}
          dictionaries={dictionaries}
          records={records}
          purchaseOrderFormSettings={purchaseOrderFormSettings}
          onUpdatePurchaseOrderFormSettings={onUpdatePurchaseOrderFormSettings}
          salesOrderFormSettings={salesOrderFormSettings}
          onUpdateSalesOrderFormSettings={onUpdateSalesOrderFormSettings}
          purchaseBillFormSettings={purchaseBillFormSettings}
          onUpdatePurchaseBillFormSettings={onUpdatePurchaseBillFormSettings}
          salesBillFormSettings={salesBillFormSettings}
          onUpdateSalesBillFormSettings={onUpdateSalesBillFormSettings}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onReplaceRecords={onReplaceRecords}
          onDeleteRecords={onDeleteRecords}
          orders={orders}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
        />
        </Suspense>
      </div>
    </div>
  );
};


export default PSIView;