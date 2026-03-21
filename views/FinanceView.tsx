import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Scale
} from 'lucide-react';
import { ProductionOrder, FinanceRecord, FinanceOpType, FinanceCategory, FinanceAccountType, Partner, Worker, Product } from '../types';
import { PartnerCategory, ProductCategory, GlobalNodeTemplate } from '../types';
import FinanceOpsView from './FinanceOpsView';

interface FinanceViewProps {
  orders: ProductionOrder[];
  records: FinanceRecord[];
  psiRecords?: any[];
  prodRecords?: any[];
  onAddRecord: (record: FinanceRecord) => void;
  onUpdateRecord: (record: FinanceRecord) => void;
  onDeleteRecord: (id: string) => void;
  financeCategories: FinanceCategory[];
  financeAccountTypes: FinanceAccountType[];
  partners: Partner[];
  workers: Worker[];
  products: Product[];
  partnerCategories: PartnerCategory[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  userPermissions?: string[];
  tenantRole?: string;
}

const FinanceView: React.FC<FinanceViewProps> = ({ orders, records, psiRecords = [], prodRecords = [], onAddRecord, onUpdateRecord, onDeleteRecord, financeCategories, financeAccountTypes, partners, workers, products, partnerCategories, categories, globalNodes, userPermissions, tenantRole }) => {
  const [activeTab, setActiveTab] = useState<FinanceOpType>('RECEIPT');
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

  const _isOwner = tenantRole === 'owner';
  const hasFinancePerm = (permKey: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('finance') && !userPermissions.some(p => p.startsWith('finance:'))) return true;
    return userPermissions.includes(permKey);
  };

  const allTabs = [
    { id: 'RECEIPT', label: '收款单', icon: ArrowDownCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '客户款项回收记录' },
    { id: 'PAYMENT', label: '付款单', icon: ArrowUpCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '供应商及费用支出记录' },
    { id: 'RECONCILIATION', label: '财务对账', icon: Scale, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '往来款项核对与差异分析' },
  ];
  const permMap: Record<string, string> = {
    RECEIPT: 'finance:receipt:view',
    PAYMENT: 'finance:payment:view',
    RECONCILIATION: 'finance:reconciliation:allow',
  };
  const tabs = allTabs.filter(tab => hasFinancePerm(permMap[tab.id]));

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
                  onClick={() => setActiveTab(tab.id as FinanceOpType)}
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
        <FinanceOpsView 
          type={activeTab}
          orders={orders}
          records={records.filter(r => r.type === activeTab)}
          allRecords={records}
          psiRecords={psiRecords}
          prodRecords={prodRecords}
          onAddRecord={onAddRecord}
          onUpdateRecord={onUpdateRecord}
          onDeleteRecord={onDeleteRecord}
          financeCategories={financeCategories}
          financeAccountTypes={financeAccountTypes}
          partners={partners}
          workers={workers}
          products={products}
          partnerCategories={partnerCategories}
          categories={categories}
          globalNodes={globalNodes}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
        />
      </div>
    </div>
  );
};

export default FinanceView;
