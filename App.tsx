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
  PlanFormSettings, OrderFormSettings,
  PurchaseOrderFormSettings,
  PurchaseBillFormSettings,
  PlanStatus,
  MilestoneStatus,
  OrderStatus,
  ProductionLinkMode,
  ProductMilestoneProgress,
  ProcessSequenceMode,
} from './types';

// Views
import DashboardView from './views/DashboardView';
import ProductionManagementView from './views/ProductionManagementView';
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
  const [orderFormSettings, setOrderFormSettings] = usePersistedState<OrderFormSettings>('orderFormSettings', DEFAULT_ORDER_FORM_SETTINGS);
  const [purchaseOrderFormSettings, setPurchaseOrderFormSettings] = usePersistedState<PurchaseOrderFormSettings>('purchaseOrderFormSettings', DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
  const [purchaseBillFormSettings, setPurchaseBillFormSettings] = usePersistedState<PurchaseBillFormSettings>('purchaseBillFormSettings', DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
  const [productionLinkMode, setProductionLinkMode] = usePersistedState<ProductionLinkMode>('productionLinkMode', 'order');
  const [processSequenceMode, setProcessSequenceMode] = usePersistedState<ProcessSequenceMode>('processSequenceMode', 'free');
  const [allowExceedMaxReportQty, setAllowExceedMaxReportQty] = usePersistedState<boolean>('allowExceedMaxReportQty', true);
  const [productMilestoneProgresses, setProductMilestoneProgresses] = usePersistedState<ProductMilestoneProgress[]>('productMilestoneProgresses', []);

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
                printSettings={printSettings}
                planFormSettings={planFormSettings}
                onUpdatePlanFormSettings={setPlanFormSettings}
                orderFormSettings={orderFormSettings}
                onUpdateOrderFormSettings={setOrderFormSettings}
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
                  if (!plan) return;
                  const getAllDescendants = (planId: string): PlanOrder[] => {
                    const direct = plans.filter(p => p.parentPlanId === planId);
                    return direct.flatMap(p => [p, ...getAllDescendants(p.id)]);
                  };
                  const allDescendants = getAllDescendants(id);
                  const toConvert = [plan, ...allDescendants].filter(p => p.status !== PlanStatus.CONVERTED);
                  if (toConvert.length === 0) {
                    alert('该计划及所有子计划均已下达，无需重复操作。');
                    return;
                  }
                  const existingParentOrder = plan.status === PlanStatus.CONVERTED
                    ? orders.find(o => o.planOrderId === plan.id)
                    : null;
                  const planIdToOrderId = new Map<string, string>();
                  if (existingParentOrder) planIdToOrderId.set(plan.id, existingParentOrder.id);
                  let mainOrderId = existingParentOrder?.id;
                  const newOrders: ProductionOrder[] = [];
                  const baseTs = Date.now();
                  toConvert.forEach((p, idx) => {
                    const prod = products.find(px => px.id === p.productId);
                    const parentOrderId = productionLinkMode === 'product' ? undefined : (p.parentPlanId ? (planIdToOrderId.get(p.parentPlanId) ?? orders.find(o => o.planOrderId === p.parentPlanId)?.id) : undefined);
                    const today = new Date().toISOString().split('T')[0];
                    const ord: ProductionOrder = {
                      id: `ord-${baseTs}-${idx}`,
                      orderNumber: p.planNumber.replace(/^PLN/i, 'WO'),
                      planOrderId: p.id,
                      productId: p.productId,
                      productName: prod?.name || '',
                      sku: prod?.sku || '',
                      items: p.items.map(i => ({ ...i, completedQuantity: 0 })),
                      customer: p.customer,
                      startDate: p.startDate,
                      dueDate: p.dueDate,
                      status: OrderStatus.PRODUCING,
                      priority: p.priority,
                      parentOrderId,
                      bomNodeId: p.bomNodeId,
                      sourcePlanId: p.parentPlanId,
                      createdAt: today,
                      milestones: (prod?.milestoneNodeIds || []).map(gnId => {
                        const gn = globalNodes.find(n => n.id === gnId);
                        return {
                          id: `ms-${baseTs}-${gnId}-${idx}`,
                          templateId: gnId,
                          name: gn?.name || '',
                          status: MilestoneStatus.PENDING,
                          plannedDate: p.dueDate,
                          completedQuantity: 0,
                          reportTemplate: gn?.reportTemplate || [],
                          reports: [],
                          weight: 1,
                          assignedWorkerIds: p.assignments?.[gnId]?.workerIds || [],
                          assignedEquipmentIds: p.assignments?.[gnId]?.equipmentIds || []
                        };
                      })
                    };
                    planIdToOrderId.set(p.id, ord.id);
                    if (!mainOrderId) mainOrderId = ord.id;
                    newOrders.push(ord);
                  });
                  setOrders([...newOrders, ...orders]);
                  const convertedIds = new Set(toConvert.map(p => p.id));
                  setPlans(plans.map(p => convertedIds.has(p.id) ? { ...p, status: PlanStatus.CONVERTED } : p));
                }}
                onAddRecord={(r) => setProdRecords(prev => [r, ...prev])}
                onUpdateRecord={(r) => setProdRecords(prev => prev.map(x => x.id === r.id ? r : x))}
                onDeleteRecord={(id) => setProdRecords(prev => prev.filter(x => x.id !== id))}
                onAddPSIRecord={handleAddPSIRecord}
                onCreateSubPlan={({ productId, quantity, planId, bomNodeId }) => {
                  const plan = plans.find(p => p.id === planId);
                  const product = products.find(p => p.id === productId);
                  if (!plan || !product) return;
                  const baseNum = plan.planNumber.includes('-S') ? plan.planNumber : plan.planNumber.replace(/PLN-?(\d+)/i, (_, n) => `PLN${n}`);
                  setPlans(prev => {
                    const subCount = prev.filter(p => p.parentPlanId === planId).length + 1;
                    const subPlan: PlanOrder = {
                      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                      planNumber: `${baseNum}-S${subCount}`,
                      parentPlanId: planId,
                      bomNodeId,
                      productId,
                      items: [{ variantId: product.variants?.[0]?.id, quantity }],
                      startDate: plan.startDate,
                      dueDate: plan.dueDate,
                      status: PlanStatus.APPROVED,
                      customer: plan.customer,
                      priority: plan.priority,
                      assignments: {},
                      createdAt: new Date().toISOString().split('T')[0]
                    };
                    return [subPlan, ...prev];
                  });
                }}
                onCreateSubPlans={({ planId, items }) => {
                  const rootPlan = plans.find(p => p.id === planId);
                  if (!rootPlan || !items.length) return;
                  setPlans(prev => {
                    const createdByKey = new Map<string, string>();
                    const getBaseNum = (p: PlanOrder) => p.planNumber.includes('-S') ? p.planNumber : p.planNumber.replace(/PLN-?(\d+)/i, (_, n) => `PLN${n}`);
                    const newPlans: PlanOrder[] = [];
                    items.forEach(({ productId, quantity, bomNodeId, parentProductId, parentNodeId }) => {
                      const product = products.find(p => p.id === productId);
                      if (!product) return;
                      let effectiveParentId = planId;
                      if (parentProductId != null) {
                        const key = `${parentProductId}-${parentNodeId || ''}`;
                        effectiveParentId = createdByKey.get(key) ?? (() => {
                          const queue: string[] = [planId];
                          while (queue.length > 0) {
                            const pid = queue.shift()!;
                            const found = prev.find(p => p.parentPlanId === pid && p.productId === parentProductId && (p.bomNodeId || '') === (parentNodeId || ''));
                            if (found) return found.id;
                            prev.filter(p => p.parentPlanId === pid).forEach(p => queue.push(p.id));
                          }
                          return planId;
                        })();
                      }
                      const parentPlan = prev.find(p => p.id === effectiveParentId) || newPlans.find(p => p.id === effectiveParentId) || (effectiveParentId === planId ? rootPlan : null);
                      const baseNum = parentPlan ? getBaseNum(parentPlan) : (rootPlan.planNumber.includes('-S') ? rootPlan.planNumber : rootPlan.planNumber.replace(/PLN-?(\d+)/i, (_, n) => `PLN${n}`));
                      const subCount = prev.filter(p => p.parentPlanId === effectiveParentId).length + newPlans.filter(p => p.parentPlanId === effectiveParentId).length + 1;
                      const subPlan: PlanOrder = {
                        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        planNumber: `${baseNum}-S${subCount}`,
                        parentPlanId: effectiveParentId,
                        bomNodeId,
                        productId,
                        items: [{ variantId: product.variants?.[0]?.id, quantity }],
                        startDate: rootPlan.startDate,
                        dueDate: rootPlan.dueDate,
                        status: PlanStatus.APPROVED,
                        customer: rootPlan.customer,
                        priority: rootPlan.priority,
                        assignments: {},
                        createdAt: new Date().toISOString().split('T')[0]
                      };
                      createdByKey.set(`${productId}-${bomNodeId || ''}`, subPlan.id);
                      newPlans.push(subPlan);
                    });
                    return [...newPlans, ...prev];
                  });
                }}
                onReportSubmit={(oId, mId, qty, data, vId, workerId, defectiveQty, equipmentId, reportBatchId, reportNo) => {
                  const operatorName = workerId ? (workers.find(w => w.id === workerId)?.name ?? '未知') : '张主管';
                  const defQty = defectiveQty ?? 0;
                  setOrders(prev => prev.map(o => {
                    if (o.id !== oId) return o;
                    const newMilestones = o.milestones.map(m => {
                      if (m.id !== mId) return m;
                      const newReport = {
                        id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        timestamp: new Date().toLocaleString(),
                        operator: operatorName,
                        quantity: qty,
                        defectiveQuantity: defQty > 0 ? defQty : undefined,
                        equipmentId: equipmentId || undefined,
                        variantId: vId,
                        reportBatchId: reportBatchId || undefined,
                        reportNo: reportNo || undefined,
                        customData: data ?? {}
                      };
                      const newQty = m.completedQuantity + qty;
                      const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
                      return { ...m, completedQuantity: newQty, reports: [...m.reports, newReport], status: newQty >= totalQty ? MilestoneStatus.COMPLETED : MilestoneStatus.IN_PROGRESS };
                    });
                    const newItems = o.items.length === 1
                      ? [{ ...o.items[0], completedQuantity: o.items[0].completedQuantity + qty }]
                      : o.items.map(item => item.variantId === vId ? { ...item, completedQuantity: item.completedQuantity + qty } : item);
                    return { ...o, milestones: newMilestones, items: newItems };
                  }));
                }}
                onReportSubmitProduct={(productId, milestoneTemplateId, qty, data, vId, workerId, defectiveQty, equipmentId, reportBatchId, reportNo) => {
                  const operatorName = workerId ? (workers.find(w => w.id === workerId)?.name ?? '未知') : '张主管';
                  const defQty = defectiveQty ?? 0;
                  const newReport = {
                    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    timestamp: new Date().toLocaleString(),
                    operator: operatorName,
                    quantity: qty,
                    defectiveQuantity: defQty > 0 ? defQty : undefined,
                    equipmentId: equipmentId || undefined,
                    variantId: vId,
                    reportBatchId: reportBatchId || undefined,
                    reportNo: reportNo || undefined,
                    customData: data ?? {}
                  };
                  setProductMilestoneProgresses(prev => {
                    const vid = vId ?? '';
                    const existing = prev.find(p => p.productId === productId && (p.variantId ?? '') === vid && p.milestoneTemplateId === milestoneTemplateId);
                    const reports = [...(existing?.reports ?? []), newReport];
                    const completedQuantity = reports.reduce((s, r) => s + r.quantity, 0);
                    const updated = { id: existing?.id ?? `pmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, productId, variantId: vId, milestoneTemplateId, completedQuantity, reports, updatedAt: new Date().toISOString() };
                    if (existing) return prev.map(p => p.id === existing.id ? updated : p);
                    return [...prev, updated];
                  });
                }}
                onUpdateReport={({ orderId, milestoneId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneId }) => {
                  const targetMilestoneId = newMilestoneId || milestoneId;
                  setOrders(prev => {
                    let oldReport: { quantity: number; variantId?: string; reportBatchId?: string; reportNo?: string; customData?: Record<string, any>; notes?: string; equipmentId?: string; timestamp?: string; operator?: string } | null = null;
                    const afterRemove = prev.map(o => {
                      if (o.id !== orderId) return o;
                      const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
                      const newMilestones = o.milestones.map(m => {
                        if (m.id !== milestoneId) return m;
                        const r = m.reports.find(x => x.id === reportId);
                        if (!r) return m;
                        oldReport = { quantity: r.quantity, variantId: r.variantId, reportBatchId: r.reportBatchId, reportNo: r.reportNo, customData: r.customData, notes: r.notes, equipmentId: r.equipmentId, timestamp: r.timestamp, operator: r.operator };
                        const remaining = m.reports.filter(x => x.id !== reportId);
                        const completed = remaining.reduce((s, rep) => s + rep.quantity, 0);
                        const status = completed >= totalQty ? MilestoneStatus.COMPLETED : completed > 0 ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING;
                        return { ...m, completedQuantity: completed, reports: remaining, status };
                      });
                      let newItems = o.items;
                      if (oldReport) {
                        const v = oldReport.variantId;
                        const delta = -oldReport.quantity;
                        if (o.items.length === 1 && !v) {
                          newItems = [{ ...o.items[0], completedQuantity: Math.max(0, o.items[0].completedQuantity + delta) }];
                        } else {
                          newItems = o.items.map(item =>
                            (item.variantId || '') !== (v || '')
                              ? item
                              : { ...item, completedQuantity: Math.max(0, (item.completedQuantity || 0) + delta) }
                          );
                        }
                      }
                      return { ...o, milestones: newMilestones, items: newItems };
                    });
                    if (!oldReport) return prev;
                    const newQty = Math.max(0, quantity);
                    const newDef = Math.max(0, defectiveQuantity ?? 0);
                    const defForReport = newDef > 0 ? newDef : undefined;
                    return afterRemove.map(o => {
                      if (o.id !== orderId) return o;
                      const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
                      const newMilestones = o.milestones.map(m => {
                        if (m.id !== targetMilestoneId) return m;
                        const updatedReport = {
                          id: reportId,
                          timestamp: timestamp ?? oldReport!.timestamp ?? new Date().toLocaleString(),
                          operator: operator ?? oldReport!.operator ?? '未知',
                          quantity: newQty,
                          defectiveQuantity: defForReport,
                          variantId: oldReport!.variantId,
                          reportBatchId: oldReport!.reportBatchId,
                          reportNo: oldReport!.reportNo,
                          customData: oldReport!.customData ?? {},
                          notes: oldReport!.notes,
                          equipmentId: oldReport!.equipmentId
                        };
                        const others = m.reports.filter(r => r.id !== reportId);
                        const reports = [...others, updatedReport];
                        const completed = reports.reduce((s, rep) => s + rep.quantity, 0);
                        const status = completed >= totalQty ? MilestoneStatus.COMPLETED : completed > 0 ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING;
                        return { ...m, completedQuantity: completed, reports, status };
                      });
                      let newItems = o.items;
                      const v = oldReport!.variantId;
                      if (newQty > 0) {
                        if (o.items.length === 1 && !v) {
                          newItems = [{
                            ...o.items[0],
                            completedQuantity: Math.min(o.items[0].quantity, o.items[0].completedQuantity + newQty)
                          }];
                        } else {
                          newItems = o.items.map(item =>
                            (item.variantId || '') !== (v || '')
                              ? item
                              : {
                                  ...item,
                                  completedQuantity: Math.min(item.quantity, (item.completedQuantity || 0) + newQty)
                                }
                          );
                        }
                      }
                      return { ...o, milestones: newMilestones, items: newItems };
                    });
                  });
                }}
                onDeleteReport={({ orderId, milestoneId, reportId }) => {
                  setOrders(prev => prev.map(o => {
                    if (o.id !== orderId) return o;
                    const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
                    let removed: { quantity: number; variantId?: string } | null = null;
                    const newMilestones = o.milestones.map(m => {
                      if (m.id !== milestoneId) return m;
                      const r = m.reports.find(x => x.id === reportId);
                      if (!r) return m;
                      removed = { quantity: r.quantity, variantId: r.variantId };
                      const remaining = m.reports.filter(x => x.id !== reportId);
                      const completed = remaining.reduce((s, rep) => s + rep.quantity, 0);
                      const status = completed >= totalQty ? MilestoneStatus.COMPLETED : completed > 0 ? MilestoneStatus.IN_PROGRESS : MilestoneStatus.PENDING;
                      return { ...m, completedQuantity: completed, reports: remaining, status };
                    });
                    let newItems = o.items;
                    if (removed) {
                      const v = removed.variantId;
                      const delta = -removed.quantity;
                      if (o.items.length === 1 && !v) {
                        newItems = [{ ...o.items[0], completedQuantity: Math.max(0, o.items[0].completedQuantity + delta) }];
                      } else {
                        newItems = o.items.map(item =>
                          (item.variantId || '') !== (v || '')
                            ? item
                            : { ...item, completedQuantity: Math.max(0, (item.completedQuantity || 0) + delta) }
                        );
                      }
                    }
                    return { ...o, milestones: newMilestones, items: newItems };
                  }));
                }}
                productMilestoneProgresses={productMilestoneProgresses}
                onUpdateReportProduct={({ progressId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneTemplateId }) => {
                  setProductMilestoneProgresses(prev => {
                    const srcProgress = prev.find(p => p.id === progressId);
                    if (!srcProgress) return prev;
                    const srcReport = (srcProgress.reports ?? []).find(r => r.id === reportId);
                    if (!srcReport) return prev;
                    const defQ = defectiveQuantity ?? 0;
                    const updatedReport = { ...srcReport, quantity, defectiveQuantity: defQ > 0 ? defQ : undefined, timestamp: timestamp ?? srcReport.timestamp, operator: operator ?? srcReport.operator };
                    if (!newMilestoneTemplateId || newMilestoneTemplateId === srcProgress.milestoneTemplateId) {
                      return prev.map(p => {
                        if (p.id !== progressId) return p;
                        const reports = (p.reports ?? []).map(r => r.id === reportId ? updatedReport : r);
                        const completedQuantity = reports.reduce((s, r) => s + r.quantity, 0);
                        return { ...p, reports, completedQuantity, updatedAt: new Date().toISOString() };
                      });
                    }
                    const afterRemove = prev.map(p => {
                      if (p.id !== progressId) return p;
                      const reports = (p.reports ?? []).filter(r => r.id !== reportId);
                      const completedQuantity = reports.reduce((s, r) => s + r.quantity, 0);
                      return { ...p, reports, completedQuantity, updatedAt: new Date().toISOString() };
                    });
                    const targetProgress = afterRemove.find(p => p.productId === srcProgress.productId && p.milestoneTemplateId === newMilestoneTemplateId && (p.variantId || '') === (srcProgress.variantId || ''));
                    if (targetProgress) {
                      return afterRemove.map(p => {
                        if (p.id !== targetProgress.id) return p;
                        const reports = [...(p.reports ?? []), updatedReport];
                        const completedQuantity = reports.reduce((s, r) => s + r.quantity, 0);
                        return { ...p, reports, completedQuantity, updatedAt: new Date().toISOString() };
                      });
                    }
                    const gn = globalNodes.find(n => n.id === newMilestoneTemplateId);
                    const newProgress: ProductMilestoneProgress = {
                      id: crypto.randomUUID(),
                      productId: srcProgress.productId,
                      variantId: srcProgress.variantId,
                      milestoneTemplateId: newMilestoneTemplateId,
                      milestoneName: gn?.name || newMilestoneTemplateId,
                      completedQuantity: updatedReport.quantity,
                      reports: [updatedReport],
                      updatedAt: new Date().toISOString()
                    };
                    return [...afterRemove, newProgress];
                  });
                }}
                onDeleteReportProduct={({ progressId, reportId }) => {
                  setProductMilestoneProgresses(prev => prev.map(p => {
                    if (p.id !== progressId) return p;
                    const reports = (p.reports ?? []).filter(r => r.id !== reportId);
                    const completedQuantity = reports.reduce((s, r) => s + r.quantity, 0);
                    return { ...p, reports, completedQuantity, updatedAt: new Date().toISOString() };
                  }));
                }}
                onUpdateOrder={(orderId, updates) => {
                  setOrders(orders.map(o => o.id === orderId ? { ...o, ...updates } : o));
                }}
                onDeleteOrder={(orderId) => setOrders(orders.filter(o => o.id !== orderId))}
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
            <Route path="/finance" element={<FinanceView orders={orders} records={financeRecords} onAddRecord={(r) => setFinanceRecords(prev => [r, ...prev])} />} />
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
                productionLinkMode={productionLinkMode}
                onUpdateProductionLinkMode={setProductionLinkMode}
                processSequenceMode={processSequenceMode}
                onUpdateProcessSequenceMode={setProcessSequenceMode}
                allowExceedMaxReportQty={allowExceedMaxReportQty}
                onUpdateAllowExceedMaxReportQty={setAllowExceedMaxReportQty}
                onUpdateCategories={setCategories}
                onUpdatePartnerCategories={setPartnerCategories}
                onUpdateGlobalNodes={setGlobalNodes}
                onUpdateWarehouses={setWarehouses}
              />
            } />
            <Route path="/orders/:id" element={<Navigate to="/production" replace state={{ tab: 'orders' }} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
