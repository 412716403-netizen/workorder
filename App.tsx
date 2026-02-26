import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { 
  Layout, 
  LayoutDashboard, 
  ClipboardList, 
  Settings as SettingsIcon, 
  Boxes, 
  ShoppingCart, 
  Wallet
} from 'lucide-react';
import { 
  MOCK_PRODUCTS, 
  MOCK_ORDERS, 
  MOCK_CATEGORIES, 
  MOCK_DICTIONARIES, 
  MOCK_GLOBAL_NODES, 
  MOCK_BOMS, 
  MOCK_PARTNERS, 
  MOCK_WORKERS, 
  MOCK_EQUIPMENT,
  MOCK_PARTNER_CATEGORIES 
} from './constants';
import { 
  Product, 
  ProductionOrder, 
  PlanOrder, 
  ProductionOpRecord, 
  FinanceRecord, 
  Warehouse, 
  PrintSettings, 
  PlanFormSettings,
  PurchaseOrderFormSettings,
  PurchaseBillFormSettings,
  PlanStatus,
  MilestoneStatus,
  OrderStatus,
} from './types';

// Views
import DashboardView from './views/DashboardView';
import ProductionManagementView from './views/ProductionManagementView';
import OrderDetailView from './views/OrderDetailView';
import PSIView from './views/PSIView';
import FinanceView from './views/FinanceView';
import BasicInfoView from './views/BasicInfoView';
import SettingsView from './views/SettingsView';
import { usePersistedState } from './hooks/usePersistedState';

const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  PLAN: { id: 'PLAN', name: '计划单', enabled: true, title: '生产计划指令单', headerText: '', footerText: '', showLogo: true, showQRCode: true, fontSize: 'base', fields: [] },
  ORDER: { id: 'ORDER', name: '生产工单', enabled: true, title: '正式生产作业单', headerText: '', footerText: '', showLogo: true, showQRCode: true, fontSize: 'base', fields: [] },
  STOCK_OUT: { id: 'STOCK_OUT', name: '领料单', enabled: true, title: '仓库领料出库单', headerText: '', footerText: '', showLogo: true, showQRCode: true, fontSize: 'base', fields: [] },
  OUTSOURCE: { id: 'OUTSOURCE', name: '外协单', enabled: true, title: '委外加工指令单', headerText: '', footerText: '', showLogo: true, showQRCode: true, fontSize: 'base', fields: [] },
  REWORK: { id: 'REWORK', name: '返工单', enabled: true, title: '生产返工通知单', headerText: '', footerText: '', showLogo: true, showQRCode: true, fontSize: 'base', fields: [] },
  STOCK_IN: { id: 'STOCK_IN', name: '入库单', enabled: true, title: '成品入库凭证', headerText: '', footerText: '', showLogo: true, showQRCode: true, fontSize: 'base', fields: [] },
};

const DEFAULT_PLAN_FORM_SETTINGS: PlanFormSettings = {
  // 产品、计划量、状态、优先级、已派发工序数不在此配置，由系统固定展示
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

const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 'wh-1', name: '中心原材料仓库', code: 'WH-RAW-01', category: '原料库', location: '1号楼101', contact: '张库管' },
  { id: 'wh-2', name: '成品周转仓', code: 'WH-FIN-02', category: '成品库', location: '2号楼201', contact: '李库管' },
];

/**
 * Main application component.
 * Manages global state for products, orders, plans, and accounting records.
 * Provides navigation and routing to different business modules.
 */
export default function App() {
  const [products, setProducts] = usePersistedState<Product[]>('products', MOCK_PRODUCTS);
  const [orders, setOrders] = usePersistedState<ProductionOrder[]>('orders', MOCK_ORDERS);
  const [plans, setPlans] = usePersistedState<PlanOrder[]>('plans', []);
  const [psiRecords, setPsiRecords] = usePersistedState<any[]>('psiRecords', []);
  const [financeRecords, setFinanceRecords] = usePersistedState<FinanceRecord[]>('financeRecords', []);
  const [prodRecords, setProdRecords] = usePersistedState<ProductionOpRecord[]>('prodRecords', []);
  const [categories, setCategories] = usePersistedState('categories', MOCK_CATEGORIES);
  const [partnerCategories, setPartnerCategories] = usePersistedState('partnerCategories', MOCK_PARTNER_CATEGORIES);
  const [dictionaries, setDictionaries] = usePersistedState('dictionaries', MOCK_DICTIONARIES);
  const [globalNodes, setGlobalNodes] = usePersistedState('globalNodes', MOCK_GLOBAL_NODES);
  const [boms, setBoms] = usePersistedState('boms', MOCK_BOMS);
  const [partners, setPartners] = usePersistedState('partners', MOCK_PARTNERS);
  const [workers, setWorkers] = usePersistedState('workers', MOCK_WORKERS);
  const [equipment, setEquipment] = usePersistedState('equipment', MOCK_EQUIPMENT);
  const [warehouses, setWarehouses] = usePersistedState('warehouses', MOCK_WAREHOUSES);
  const [printSettings, setPrintSettings] = usePersistedState('printSettings', DEFAULT_PRINT_SETTINGS);
  const [planFormSettings, setPlanFormSettings] = usePersistedState<PlanFormSettings>('planFormSettings', DEFAULT_PLAN_FORM_SETTINGS);
  const [purchaseOrderFormSettings, setPurchaseOrderFormSettings] = usePersistedState<PurchaseOrderFormSettings>('purchaseOrderFormSettings', DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
  const [purchaseBillFormSettings, setPurchaseBillFormSettings] = usePersistedState<PurchaseBillFormSettings>('purchaseBillFormSettings', DEFAULT_PURCHASE_BILL_FORM_SETTINGS);

  const handleAddPSIRecord = (record: any) => setPsiRecords(prev => [record, ...prev]);
  const handleReplacePSIRecords = (type: string, docNumber: string, newRecords: any[]) => {
    setPsiRecords(prev => {
      const firstIdx = prev.findIndex(r => r.type === type && r.docNumber === docNumber);
      const filtered = prev.filter(r => !(r.type === type && r.docNumber === docNumber));
      if (firstIdx < 0) return [...filtered, ...newRecords];
      // 在原位置插入新记录，保持单据顺序不变
      return [...filtered.slice(0, firstIdx), ...newRecords, ...filtered.slice(firstIdx)];
    });
  };
  const handleDeletePSIRecords = (type: string, docNumber: string) => {
    setPsiRecords(prev => prev.filter(r => !(r.type === type && r.docNumber === docNumber)));
  };

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
        {/* Sidebar Navigation */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col p-8 gap-10">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
               <Layout className="w-7 h-7" />
             </div>
             <div className="flex flex-col">
               <h1 className="text-xl font-black tracking-tighter uppercase">智造云 ERP</h1>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise OS</span>
             </div>
          </div>
          
          <nav className="flex flex-col gap-1.5">
            <Link to="/" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <LayoutDashboard className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 经营看板
            </Link>
            <Link to="/production" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ClipboardList className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 生产管理
            </Link>
            <Link to="/psi" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <ShoppingCart className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 进销存
            </Link>
            <Link to="/finance" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Wallet className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 财务结算
            </Link>
            <Link to="/basic" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <Boxes className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 基础信息
            </Link>
            <Link to="/settings" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl hover:bg-slate-50 transition-all font-bold text-sm text-slate-600 group">
              <SettingsIcon className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" /> 系统设置
            </Link>
          </nav>
        </div>

        {/* Main Content Area - pt-4 减小顶部空白，min-h-0 让 overflow-auto 生效 */}
        <div className="flex-1 min-h-0 overflow-auto pt-4 px-12 pb-12 bg-slate-50/30">
          <Routes>
            <Route path="/" element={<DashboardView orders={orders} financeRecords={financeRecords} psiRecords={psiRecords} products={products} />} />
            <Route path="/production" element={
              <ProductionManagementView 
                plans={plans}
                orders={orders}
                products={products}
                categories={categories}
                dictionaries={dictionaries}
                workers={workers}
                equipment={equipment}
                prodRecords={prodRecords}
                psiRecords={psiRecords}
                globalNodes={globalNodes}
                boms={boms}
                partners={partners}
                partnerCategories={partnerCategories}
                printSettings={printSettings}
                planFormSettings={planFormSettings}
                onUpdatePlanFormSettings={setPlanFormSettings}
                onCreatePlan={(p) => setPlans([p, ...plans])}
                onUpdateProduct={(p) => {
                  const exists = products.some(px => px.id === p.id);
                  setProducts(exists ? products.map(px => px.id === p.id ? p : px) : [p, ...products]);
                }}
                onUpdatePlan={(id, updates) => setPlans(plans.map(p => p.id === id ? { ...p, ...updates } : p))}
                onSplitPlan={(planId, newPlans) => setPlans(newPlans.concat(plans.filter(p => p.id !== planId)))}
                onDeletePlan={(id) => setPlans(plans.filter(p => p.id !== id))}
                onConvertToOrder={(id) => {
                  const plan = plans.find(p => p.id === id);
                  if (plan) {
                    const newOrder: ProductionOrder = {
                      id: `ord-${Date.now()}`,
                      orderNumber: plan.planNumber.replace('PLN', 'WO'),
                      planOrderId: plan.id,
                      productId: plan.productId,
                      productName: products.find(p => p.id === plan.productId)?.name || '',
                      sku: products.find(p => p.id === plan.productId)?.sku || '',
                      items: plan.items.map(i => ({ ...i, completedQuantity: 0 })),
                      customer: plan.customer,
                      startDate: plan.startDate,
                      dueDate: plan.dueDate,
                      status: OrderStatus.PRODUCING,
                      priority: plan.priority,
                      milestones: (products.find(p => p.id === plan.productId)?.milestoneNodeIds || []).map(gnId => {
                         const gn = globalNodes.find(n => n.id === gnId);
                         return {
                           id: `ms-${Date.now()}-${gnId}`,
                           templateId: gnId,
                           name: gn?.name || '',
                           status: MilestoneStatus.PENDING,
                           plannedDate: plan.dueDate,
                           completedQuantity: 0,
                           reportTemplate: gn?.reportTemplate || [],
                           reports: [],
                           weight: 1,
                           assignedWorkerIds: plan.assignments?.[gnId]?.workerIds || [],
                           assignedEquipmentIds: plan.assignments?.[gnId]?.equipmentIds || []
                         };
                      })
                    };
                    setOrders([newOrder, ...orders]);
                    setPlans(plans.map(p => p.id === id ? { ...p, status: PlanStatus.CONVERTED } : p));
                  }
                }}
                onCreateOrder={(o) => setOrders([o, ...orders])}
                onAddRecord={(r) => setProdRecords([r, ...prodRecords])}
                onAddPSIRecord={handleAddPSIRecord}
              />
            } />
            <Route path="/orders/:id" element={
              <OrderDetailView 
                orders={orders} 
                products={products} 
                dictionaries={dictionaries} 
                workers={workers} 
                equipment={equipment} 
                onReportSubmit={(oId, mId, qty, data, vId) => {
                   setOrders(orders.map(o => {
                     if (o.id === oId) {
                       const newMilestones = o.milestones.map(m => {
                         if (m.id === mId) {
                           const newReport = { id: `rep-${Date.now()}`, timestamp: new Date().toLocaleString(), operator: '张主管', quantity: qty, variantId: vId, customData: data };
                           const newQty = m.completedQuantity + qty;
                           return { ...m, completedQuantity: newQty, reports: [...m.reports, newReport], status: newQty >= o.items.reduce((s,i)=>s+i.quantity,0) ? MilestoneStatus.COMPLETED : MilestoneStatus.IN_PROGRESS };
                         }
                         return m;
                       });
                       const newItems = o.items.map(item => {
                          if (item.variantId === vId) return { ...item, completedQuantity: item.completedQuantity + qty };
                          return item;
                       });
                       return { ...o, milestones: newMilestones, items: newItems };
                     }
                     return o;
                   }));
                }}
              />
            } />
            <Route path="/psi" element={
              <PSIView 
                products={products}
                records={psiRecords}
                warehouses={warehouses}
                categories={categories}
                partners={partners}
                partnerCategories={partnerCategories}
                dictionaries={dictionaries}
                purchaseOrderFormSettings={purchaseOrderFormSettings}
                onUpdatePurchaseOrderFormSettings={setPurchaseOrderFormSettings}
                purchaseBillFormSettings={purchaseBillFormSettings}
                onUpdatePurchaseBillFormSettings={setPurchaseBillFormSettings}
                onAddRecord={handleAddPSIRecord}
                onReplaceRecords={handleReplacePSIRecords}
                onDeleteRecords={handleDeletePSIRecords}
              />
            } />
            <Route path="/finance" element={<FinanceView orders={orders} records={financeRecords} onAddRecord={(r) => setFinanceRecords([r, ...financeRecords])} />} />
            <Route path="/basic" element={
              <BasicInfoView 
                products={products}
                globalNodes={globalNodes}
                categories={categories}
                partnerCategories={partnerCategories}
                boms={boms}
                workers={workers}
                equipment={equipment}
                dictionaries={dictionaries}
                partners={partners}
                onUpdateProduct={(p) => {
                  const exists = products.some(px => px.id === p.id);
                  setProducts(exists ? products.map(px => px.id === p.id ? p : px) : [p, ...products]);
                }}
                onUpdateBOM={(b) => setBoms(prev => {
                  const idx = prev.findIndex(bx => bx.id === b.id);
                  if (idx >= 0) return prev.map(bx => bx.id === b.id ? b : bx);
                  return [...prev, b];
                })}
                onUpdateDictionaries={setDictionaries}
                onUpdateWorkers={setWorkers}
                onUpdateEquipment={setEquipment}
                onUpdatePartners={setPartners}
                onUpdatePartnerCategories={setPartnerCategories}
              />
            } />
            <Route path="/settings" element={
              <SettingsView 
                categories={categories}
                partnerCategories={partnerCategories}
                globalNodes={globalNodes}
                warehouses={warehouses}
                onUpdateCategories={setCategories}
                onUpdatePartnerCategories={setPartnerCategories}
                onUpdateGlobalNodes={setGlobalNodes}
                onUpdateWarehouses={setWarehouses}
              />
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
