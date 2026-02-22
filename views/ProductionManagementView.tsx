
import React, { useState } from 'react';
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
  onCreateOrder: (order: ProductionOrder) => void;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddPSIRecord?: (record: any) => void;
}

type MainTab = 'plans' | 'orders' | ProdOpType;

const ProductionManagementView: React.FC<ProductionManagementViewProps> = ({
  plans, orders, products, categories, dictionaries, workers, equipment, prodRecords, globalNodes, boms, partners, partnerCategories, printSettings,
  planFormSettings, onUpdatePlanFormSettings,
  onCreatePlan, onUpdateProduct, onUpdatePlan, onSplitPlan, onConvertToOrder, onCreateOrder, onAddRecord, onAddPSIRecord
}) => {
  const [activeTab, setActiveTab] = useState<MainTab>('plans');

  const tabs = [
    { id: 'plans', label: '生产计划', icon: CalendarRange, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'orders', label: '工单中心', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'STOCK_OUT', label: '领料出库', icon: ArrowUpFromLine, color: 'text-indigo-600', bg: 'bg-indigo-600' },
    { id: 'OUTSOURCE', label: '外协管理', icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-600' },
    { id: 'REWORK', label: '返工管理', icon: RotateCcw, color: 'text-indigo-600', bg: 'bg-indigo-600' },
    { id: 'STOCK_IN', label: '生产入库', icon: ArrowDownToLine, color: 'text-indigo-600', bg: 'bg-indigo-600' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
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

      <div className="animate-in slide-in-from-bottom-4 duration-500 min-h-[600px]">
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
            printSettings={printSettings}
            planFormSettings={planFormSettings}
            onUpdatePlanFormSettings={onUpdatePlanFormSettings}
            onCreatePlan={onCreatePlan} 
            onUpdateProduct={onUpdateProduct}
            onUpdatePlan={onUpdatePlan}
            onSplitPlan={onSplitPlan}
            onConvertToOrder={onConvertToOrder} 
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
