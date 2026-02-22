import React, { useState } from 'react';
import { 
  ClipboardList, 
  Receipt, 
  ShoppingBag, 
  CreditCard, 
  Warehouse
} from 'lucide-react';
import { Product, Warehouse as WarehouseType, ProductCategory, Partner, PartnerCategory } from '../types';
import PSIOpsView from './PSIOpsView';

interface PSIViewProps {
  products: Product[];
  records: any[];
  warehouses: WarehouseType[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onAddRecord: (record: any) => void;
}

// 简化业务类型，将仓库相关合并为 WAREHOUSE_MGMT
type PSITab = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL' | 'WAREHOUSE_MGMT';

const PSIView: React.FC<PSIViewProps> = ({ products, records, warehouses, categories, partners, partnerCategories, onAddRecord }) => {
  const [activeTab, setActiveTab] = useState<PSITab>('PURCHASE_ORDER');

  const tabs = [
    { id: 'PURCHASE_ORDER', label: '采购订单', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '合同与采购计划' },
    { id: 'PURCHASE_BILL', label: '采购单', icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '进货收货确认' },
    { id: 'SALES_ORDER', label: '销售订单', icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '客户订货合同' },
    { id: 'SALES_BILL', label: '销售单', icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '发货与账务结算' },
    { id: 'WAREHOUSE_MGMT', label: '仓库管理', icon: Warehouse, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '库存查询、调拨与盘点工具' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 顶部统一导航栏 */}
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

      {/* 统一视图容器 */}
      <div className="animate-in slide-in-from-bottom-4 duration-500 min-h-[600px]">
        <PSIOpsView 
          type={activeTab}
          products={products}
          warehouses={warehouses}
          categories={categories}
          partners={partners}
          partnerCategories={partnerCategories}
          records={records}
          onAddRecord={onAddRecord}
        />
      </div>
    </div>
  );
};

export default PSIView;