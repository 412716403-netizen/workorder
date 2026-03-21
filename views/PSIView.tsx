import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { 
  ClipboardList, 
  Receipt, 
  ShoppingBag, 
  CreditCard, 
  Warehouse
} from 'lucide-react';
import { Product, Warehouse as WarehouseType, ProductCategory, Partner, PartnerCategory, AppDictionaries, PurchaseOrderFormSettings, PurchaseBillFormSettings } from '../types';
import PSIOpsView from './PSIOpsView';

interface PSIViewProps {
  products: Product[];
  records: any[];
  /** 生产操作记录（用于入仓流水合并生产入库 STOCK_IN） */
  prodRecords?: any[];
  /** 工单列表（生产入库行显示工单号用） */
  orders?: { id: string; orderNumber?: string }[];
  warehouses: WarehouseType[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  purchaseOrderFormSettings?: PurchaseOrderFormSettings;
  onUpdatePurchaseOrderFormSettings?: (settings: PurchaseOrderFormSettings) => void;
  purchaseBillFormSettings?: PurchaseBillFormSettings;
  onUpdatePurchaseBillFormSettings?: (settings: PurchaseBillFormSettings) => void;
  onAddRecord: (record: any) => void;
  onAddRecordBatch?: (records: any[]) => Promise<void>;
  /** 替换某一类单据、某个单号下的所有记录（用于编辑采购订单等场景） */
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  /** 删除某一类单据、某个单号下的所有记录 */
  onDeleteRecords?: (type: string, docNumber: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

// 简化业务类型，将仓库相关合并为 WAREHOUSE_MGMT
type PSITab = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL' | 'WAREHOUSE_MGMT';

const TAB_PERM_GROUPS: Record<string, string[]> = {
  PURCHASE_ORDER: ['purchase_order'],
  PURCHASE_BILL: ['purchase_bill'],
  SALES_ORDER: ['sales_order', 'sales_order_allocation', 'sales_order_pending_shipment'],
  SALES_BILL: ['sales_bill'],
  WAREHOUSE_MGMT: ['warehouse_list', 'warehouse_stocktake', 'warehouse_transfer', 'warehouse_flow'],
};

const PSIView: React.FC<PSIViewProps> = ({ products, records, prodRecords = [], orders = [], warehouses, categories, partners, partnerCategories, dictionaries, purchaseOrderFormSettings, onUpdatePurchaseOrderFormSettings, purchaseBillFormSettings, onUpdatePurchaseBillFormSettings, onAddRecord, onAddRecordBatch, onReplaceRecords, onDeleteRecords, userPermissions, tenantRole }) => {
  const [activeTab, setActiveTab] = useState<PSITab>('PURCHASE_ORDER');
  const [hideTabs, setHideTabs] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [barStyle, setBarStyle] = useState<{ left: number; width: number } | null>(null);

  const _isOwner = tenantRole === 'owner';
  const hasPsiPerm = (perm: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('psi') && !userPermissions.some(p => p.startsWith('psi:'))) return true;
    if (userPermissions.includes(perm)) return true;
    if (userPermissions.some(p => p.startsWith(`${perm}:`))) return true;
    return false;
  };

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
    { id: 'PURCHASE_ORDER', label: '采购订单', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '合同与采购计划' },
    { id: 'PURCHASE_BILL', label: '采购单', icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '进货收货确认' },
    { id: 'SALES_ORDER', label: '销售订单', icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '客户订货合同' },
    { id: 'SALES_BILL', label: '销售单', icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '发货与账务结算' },
    { id: 'WAREHOUSE_MGMT', label: '仓库管理', icon: Warehouse, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '库存查询、调拨与盘点工具' },
  ];

  const tabs = useMemo(() => allTabs.filter(tab => {
    const keys = TAB_PERM_GROUPS[tab.id];
    if (!keys) return true;
    return keys.some(k => hasPsiPerm(`psi:${k}`));
  }), [userPermissions, tenantRole]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id as PSITab);
    }
  }, [tabs.map(t => t.id).join(',')]);

  return (
    <div className="space-y-8">
      {!hideTabs && (
        <>
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
                      onClick={() => setActiveTab(tab.id as PSITab)}
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
        </>
      )}
      <div className="min-h-[600px]">
        <PSIOpsView 
          onDetailViewChange={setHideTabs}
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
          purchaseBillFormSettings={purchaseBillFormSettings}
          onUpdatePurchaseBillFormSettings={onUpdatePurchaseBillFormSettings}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onReplaceRecords={onReplaceRecords}
          onDeleteRecords={onDeleteRecords}
          prodRecords={prodRecords}
          orders={orders}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
        />
      </div>
    </div>
  );
};


export default PSIView;