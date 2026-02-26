import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
  ProductionOpRecord, GlobalNodeTemplate, ProdOpType, ProductCategory, AppDictionaries, Worker, Equipment, PrintSettings, PlanFormSettings, Partner, PartnerCategory 
} from '../types';
import PlanOrderListView from './PlanOrderListView';
import OrderListView from './OrderListView';
import ProductionMgmtOpsView from './ProductionMgmtOpsView';

interface ProductionManagementViewProps {
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  workers: Worker[];
  equipment: Equipment[];
  prodRecords: ProductionOpRecord[];
  psiRecords?: any[];
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  printSettings: PrintSettings;
  planFormSettings: PlanFormSettings;
  onUpdatePlanFormSettings: (settings: PlanFormSettings) => void;
  onCreatePlan: (plan: PlanOrder) => void;
  onUpdateProduct: (product: Product) => void;
  onUpdatePlan?: (planId: string, updates: Partial<PlanOrder>) => void;
  onSplitPlan: (planId: string, newPlans: PlanOrder[]) => void;
  onConvertToOrder: (planId: string) => void;
  onDeletePlan?: (planId: string) => void;
  onCreateOrder: (order: ProductionOrder) => void;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddPSIRecord?: (record: any) => void;
}

type MainTab = 'plans' | 'orders' | ProdOpType;

const ProductionManagementView: React.FC<ProductionManagementViewProps> = ({
  plans, orders, products, categories, dictionaries, workers, equipment, prodRecords, psiRecords = [], globalNodes, boms, partners, partnerCategories, printSettings,
  planFormSettings, onUpdatePlanFormSettings,
  onCreatePlan, onUpdateProduct, onUpdatePlan, onSplitPlan, onConvertToOrder, onDeletePlan, onCreateOrder, onAddRecord, onAddPSIRecord
}) => {
  const [activeTab, setActiveTab] = useState<MainTab>('plans');
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
    { id: 'STOCK_OUT', label: '领料出库', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-600' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-600' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-600' },
    { id: 'STOCK_IN', label: '生产入库', icon: ArrowDownToLine, color: 'text-indigo-600', bg: 'bg-indigo-600' },
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
          />
        )}

        {activeTab === 'orders' && (
          <OrderListView 
            orders={orders} 
            products={products} 
            globalNodes={globalNodes} 
            printSettings={printSettings}
            onCreateOrder={onCreateOrder} 
          />
        )}

        {['STOCK_OUT', 'OUTSOURCE', 'REWORK', 'STOCK_IN'].includes(activeTab) && (
          <ProductionMgmtOpsView 
            records={prodRecords} 
            orders={orders} 
            products={products} 
            printSettings={printSettings}
            onAddRecord={onAddRecord}
            limitType={activeTab as ProdOpType}
          />
        )}
      </div>
    </div>
  );
};

export default ProductionManagementView;
