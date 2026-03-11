import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  CalendarRange, 
  ClipboardList, 
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  RotateCcw
} from 'lucide-react';
import { 
  PlanOrder, ProductionOrder, Product, BOM,
  ProductionOpRecord, GlobalNodeTemplate, ProdOpType, ProductCategory, AppDictionaries, Worker, Equipment, PrintSettings, PlanFormSettings, OrderFormSettings, Partner, PartnerCategory, ProductionLinkMode, ProductMilestoneProgress, ProcessSequenceMode, Warehouse
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
  printSettings: PrintSettings;
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
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  onAddPSIRecord?: (record: any) => void;
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
}

type MainTab = 'plans' | 'orders' | ProdOpType;

const ProductionManagementView: React.FC<ProductionManagementViewProps> = ({
  productionLinkMode = 'order', processSequenceMode = 'free', allowExceedMaxReportQty = true, plans, orders, products, categories, dictionaries, workers, equipment, prodRecords, psiRecords = [], warehouses = [], globalNodes, boms, partners, partnerCategories, printSettings,
  planFormSettings, onUpdatePlanFormSettings, orderFormSettings, onUpdateOrderFormSettings,
  onCreatePlan, onUpdateProduct, onUpdatePlan, onSplitPlan, onConvertToOrder, onDeletePlan, onAddRecord, onUpdateRecord, onDeleteRecord, onAddPSIRecord, onReportSubmit, onCreateSubPlan, onCreateSubPlans, onUpdateOrder, onDeleteOrder, onUpdateReport, onDeleteReport,
  productMilestoneProgresses = [], onReportSubmitProduct, onUpdateReportProduct, onDeleteReportProduct
}) => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<MainTab>('plans');

  useEffect(() => {
    const tab = (location.state as { tab?: MainTab })?.tab;
    if (tab && ['plans', 'orders', 'STOCK_OUT', 'OUTSOURCE', 'REWORK', 'STOCK_IN'].includes(tab)) {
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

  const tabs = [
    { id: 'plans', label: '生产计划', icon: CalendarRange, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'orders', label: '工单中心', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'STOCK_OUT', label: '生产物料', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'STOCK_IN', label: '生产入库', icon: ArrowDownToLine, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

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
            printSettings={printSettings}
            planFormSettings={planFormSettings}
            onUpdatePlanFormSettings={onUpdatePlanFormSettings}
            onCreatePlan={onCreatePlan} 
            onUpdateProduct={onUpdateProduct}
            onUpdatePlan={onUpdatePlan}
            onSplitPlan={onSplitPlan}
            onConvertToOrder={onConvertToOrder}
            onDeletePlan={onDeletePlan}
            onAddPSIRecord={onAddPSIRecord}
            onCreateSubPlan={onCreateSubPlan}
            onCreateSubPlans={onCreateSubPlans}
          />
        )}

        {activeTab === 'orders' && (
          <OrderListView 
            initialDetailOrderId={(location.state as { detailOrderId?: string })?.detailOrderId}
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
            printSettings={printSettings}
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
            productMilestoneProgresses={productMilestoneProgresses}
            onReportSubmitProduct={onReportSubmitProduct}
            onUpdateReportProduct={onUpdateReportProduct}
            onDeleteReportProduct={onDeleteReportProduct}
          />
        )}

        {['STOCK_OUT', 'OUTSOURCE', 'REWORK', 'STOCK_IN'].includes(activeTab) && (
          <ProductionMgmtOpsView 
            productionLinkMode={productionLinkMode}
            records={prodRecords} 
            orders={orders} 
            products={products} 
            warehouses={warehouses}
            boms={boms}
            dictionaries={dictionaries}
            printSettings={printSettings}
            onAddRecord={onAddRecord}
            onUpdateRecord={onUpdateRecord}
            onDeleteRecord={onDeleteRecord}
            limitType={activeTab as ProdOpType}
            globalNodes={globalNodes}
            partners={partners}
            categories={categories}
            partnerCategories={partnerCategories}
          />
        )}
      </div>
    </div>
  );
};

export default ProductionManagementView;
