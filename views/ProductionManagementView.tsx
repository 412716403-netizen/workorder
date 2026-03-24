import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
  ProductionOpRecord, GlobalNodeTemplate, ProdOpType, ProductCategory, AppDictionaries, Worker, Equipment, PlanFormSettings, OrderFormSettings, Partner, PartnerCategory, ProductionLinkMode, ProductMilestoneProgress, ProcessSequenceMode, Warehouse
} from '../types';
import PlanOrderListView from './PlanOrderListView';
import OrderListView from './OrderListView';
import ProductionMgmtOpsView from './ProductionMgmtOpsView';

interface ProductionManagementViewProps {
  productionLinkMode?: ProductionLinkMode;
  processSequenceMode?: ProcessSequenceMode;
  allowExceedMaxReportQty?: boolean;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  workers: Worker[];
  equipment: Equipment[];
  prodRecords: ProductionOpRecord[];
  psiRecords?: any[];
  warehouses?: Warehouse[];
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  planFormSettings: PlanFormSettings;
  onUpdatePlanFormSettings: (settings: PlanFormSettings) => void;
  orderFormSettings: OrderFormSettings;
  onUpdateOrderFormSettings: (settings: OrderFormSettings) => void;
  onCreatePlan: (plan: PlanOrder) => void;
  onUpdateProduct: (product: Product) => void;
  onUpdatePlan?: (planId: string, updates: Partial<PlanOrder>) => void;
  onSplitPlan: (planId: string, newPlans: PlanOrder[]) => void;
  onConvertToOrder: (planId: string) => void;
  onDeletePlan?: (planId: string) => void;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  onAddPSIRecord?: (record: any) => void;
  onAddPSIRecordBatch?: (records: any[]) => Promise<void>;
  onReportSubmit?: (orderId: string, milestoneId: string, quantity: number, customData: any, variantId?: string) => void;
  onCreateSubPlan?: (params: { productId: string; quantity: number; planId: string; bomNodeId: string }) => void;
  onCreateSubPlans?: (params: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId: string; parentProductId?: string; parentNodeId?: string }> }) => void;
  onUpdateOrder?: (orderId: string, updates: Partial<ProductionOrder>) => void;
  onDeleteOrder?: (orderId: string) => void;
  onUpdateReport?: (params: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string }) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  productMilestoneProgresses?: ProductMilestoneProgress[];
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, quantity: number, customData: any, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

type MainTab = 'plans' | 'orders' | ProdOpType;

const ProductionManagementView: React.FC<ProductionManagementViewProps> = ({
  productionLinkMode = 'order', processSequenceMode = 'free', allowExceedMaxReportQty = true, plans, orders, products, categories, dictionaries, workers, equipment, prodRecords, psiRecords = [], warehouses = [], globalNodes, boms,   partners, partnerCategories,
  planFormSettings, onUpdatePlanFormSettings, orderFormSettings, onUpdateOrderFormSettings,
  onCreatePlan, onUpdateProduct, onUpdatePlan, onSplitPlan, onConvertToOrder, onDeletePlan, onAddRecord, onAddRecordBatch, onUpdateRecord, onDeleteRecord, onAddPSIRecord, onAddPSIRecordBatch, onReportSubmit, onCreateSubPlan, onCreateSubPlans, onUpdateOrder, onDeleteOrder, onUpdateReport, onDeleteReport,
  productMilestoneProgresses = [], onReportSubmitProduct, onUpdateReportProduct, onDeleteReportProduct,
  userPermissions, tenantRole
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isOwner = tenantRole === 'owner';
  const hasProdPerm = (permKey: string): boolean => {
    if (isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes('production')) return true;
    if (userPermissions.includes(permKey)) return true;
    if (userPermissions.some(p => p.startsWith(`${permKey}:`))) return true;
    return false;
  };

  const TAB_PERM_GROUPS: Record<string, string[]> = {
    plans: ['plans'],
    orders: ['orders_list', 'orders_form_config', 'orders_report_records', 'orders_pending_stock_in', 'orders_detail', 'orders_material', 'orders_rework'],
    STOCK_OUT: ['material_list', 'material_records', 'material_issue', 'material_return'],
    OUTSOURCE: ['outsource_list', 'outsource_send', 'outsource_receive', 'outsource_records'],
    REWORK: ['rework_list', 'rework_defective', 'rework_records', 'rework_report_records', 'rework_detail', 'rework_material'],
  };

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

  const allTabs = [
    { id: 'plans', label: '生产计划', icon: CalendarRange, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'orders', label: '工单中心', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'STOCK_OUT', label: '生产物料', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];
  const tabs = allTabs.filter(tab => {
    const keys = TAB_PERM_GROUPS[tab.id];
    if (!keys) return true;
    return keys.some(k => hasProdPerm(`production:${k}`));
  });

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id as MainTab);
    }
  }, [tabs.map(t => t.id).join(',')]);

  return (
    <div className="space-y-8">
      <div>
        <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
        <div
          ref={tabsWrapRef}
          className={`z-20 py-4 bg-slate-50/95 backdrop-blur-sm ${
            isStuck ? 'fixed top-0 px-12' : '-mx-12 px-12'
          }`}
          style={isStuck && barStyle ? { left: barStyle.left, width: barStyle.width } : undefined}
        >
        <div className="flex bg-white p-1.5 rounded-[24px] border border-slate-200 shadow-sm w-full lg:w-fit overflow-x-auto no-scrollbar">
          <div className="flex gap-1 min-w-max">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as MainTab)}
                className={`flex items-center gap-3 px-6 py-3 rounded-[18px] text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? `${tab.bg} ${tab.color} shadow-sm`
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? tab.color : 'text-slate-300'}`} />
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
      <div className="min-h-[600px]">
        {activeTab === 'plans' && (
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
        )}

        {activeTab === 'orders' && (
<OrderListView
            initialDetailOrderId={(location.state as { detailOrderId?: string })?.detailOrderId}
            onClearDetailOrderIdFromState={clearDetailOrderIdFromState}
            productionLinkMode={productionLinkMode}
            processSequenceMode={processSequenceMode}
            allowExceedMaxReportQty={allowExceedMaxReportQty}
            orders={orders} 
            products={products} 
            workers={workers}
            equipment={equipment}
            categories={categories}
            dictionaries={dictionaries}
            partners={partners}
            boms={boms}
            globalNodes={globalNodes} 
            orderFormSettings={orderFormSettings}
            prodRecords={prodRecords}
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
        )}

        {['STOCK_OUT', 'OUTSOURCE', 'REWORK'].includes(activeTab) && (
          <ProductionMgmtOpsView 
            productionLinkMode={productionLinkMode}
            productMilestoneProgresses={productMilestoneProgresses}
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
            userPermissions={userPermissions}
            tenantRole={tenantRole}
          />
        )}
      </div>
    </div>
  );
};

export default ProductionManagementView;
