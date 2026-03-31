import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Tag, 
  LayoutGrid,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ListPlus,
  ArrowRight,
  Info,
  DollarSign,
  ShoppingCart,
  Maximize,
  Database,
  PlusCircle,
  FileText,
  Boxes,
  Warehouse as WarehouseIcon,
  MapPin,
  PlusSquare,
  Building2,
  Shapes,
  Users,
  Wrench,
  Link2,
  Truck,
  Wallet,
  CreditCard,
  UserPlus,
  Package,
  ClipboardList,
  X,
  Plus,
} from 'lucide-react';
import { ProductCategory, ReportFieldDefinition, FieldType, GlobalNodeTemplate, Warehouse, PartnerCategory, FinanceCategory, FinanceCategoryKind, FinanceAccountType, ProductionLinkMode, ProcessSequenceMode } from '../types';
import { toast } from 'sonner';
import * as api from '../services/api';

interface SettingsViewProps {
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  globalNodes: GlobalNodeTemplate[];
  warehouses: Warehouse[];
  productionLinkMode?: ProductionLinkMode;
  onUpdateProductionLinkMode?: (mode: ProductionLinkMode) => void;
  processSequenceMode?: ProcessSequenceMode;
  onUpdateProcessSequenceMode?: (mode: ProcessSequenceMode) => void;
  allowExceedMaxReportQty?: boolean;
  onUpdateAllowExceedMaxReportQty?: (value: boolean) => void;
  onRefreshCategories: () => Promise<void>;
  onRefreshPartnerCategories: () => Promise<void>;
  onRefreshGlobalNodes: () => Promise<void>;
  onRefreshWarehouses: () => Promise<void>;
  financeCategories: FinanceCategory[];
  onRefreshFinanceCategories: () => Promise<void>;
  financeAccountTypes: FinanceAccountType[];
  onRefreshFinanceAccountTypes: () => Promise<void>;
  userPermissions?: string[];
  tenantRole?: string;
}

type SettingsTab = 'categories' | 'partner_categories' | 'nodes' | 'warehouses' | 'finance_categories' | 'production';

/** 产品分类扩展字段·下拉选项：UI 与「计划单表单配置」中下拉选项列一致；选项文案失焦保存，避免中文 IME 每字请求 */
function ProductCategorySelectOptions({
  catId,
  fieldId,
  options,
  onPersist,
}: {
  catId: string;
  fieldId: string;
  options: string[];
  onPersist: (catId: string, fieldId: string, next: string[]) => void;
}) {
  const opts = options ?? [];

  return (
    <div className="w-full mt-2 pt-2 border-t border-slate-100">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">选项（下拉时）</p>
      <div className="min-w-[180px] space-y-1.5">
        {opts.map((opt, idx) => (
          <PlanFormStyleSelectOptionRow
            key={`${fieldId}-opt-${idx}`}
            serverValue={opt}
            onCommit={(text) => {
              const v = text.trim();
              if (!v) {
                onPersist(catId, fieldId, opts.filter((_, i) => i !== idx));
              } else if (v !== (opt || '').trim()) {
                const next = [...opts];
                next[idx] = v;
                onPersist(catId, fieldId, next);
              }
            }}
            onRemove={() => onPersist(catId, fieldId, opts.filter((_, i) => i !== idx))}
          />
        ))}
        <button
          type="button"
          onClick={() => onPersist(catId, fieldId, [...opts, '新选项'])}
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> 添加选项
        </button>
      </div>
    </div>
  );
}

function NodeReportTemplateSelectOptions({
  nodeId,
  fieldId,
  options,
  onPersist,
}: {
  nodeId: string;
  fieldId: string;
  options: string[];
  onPersist: (nodeId: string, fieldId: string, next: string[]) => void;
}) {
  const opts = options ?? [];
  return (
    <div className="w-full mt-2 pt-2 border-t border-slate-100 md:col-span-3">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">下拉选项</p>
      <div className="min-w-[180px] space-y-1.5">
        {opts.map((opt, idx) => (
          <PlanFormStyleSelectOptionRow
            key={`${fieldId}-opt-${idx}`}
            serverValue={opt}
            onCommit={(text) => {
              const v = text.trim();
              if (!v) {
                onPersist(nodeId, fieldId, opts.filter((_, i) => i !== idx));
              } else if (v !== (opt || '').trim()) {
                const next = [...opts];
                next[idx] = v;
                onPersist(nodeId, fieldId, next);
              }
            }}
            onRemove={() => onPersist(nodeId, fieldId, opts.filter((_, i) => i !== idx))}
          />
        ))}
        <button
          type="button"
          onClick={() => onPersist(nodeId, fieldId, [...opts, '新选项'])}
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" /> 添加选项
        </button>
      </div>
    </div>
  );
}

function PlanFormStyleSelectOptionRow({
  serverValue,
  onCommit,
  onRemove,
}: {
  serverValue: string;
  onCommit: (text: string) => void;
  onRemove: () => void;
}) {
  const [local, setLocal] = useState(serverValue);
  useEffect(() => setLocal(serverValue), [serverValue]);
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder="选项文案"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded shrink-0"
        title="删除"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** 扩展字段名称/标签：失焦再保存，避免每字请求打断中文输入法 */
function ExtFieldLabelInput({
  inputKey,
  label,
  onPersist,
  placeholder,
  className,
  emptyHint = '名称不能为空',
}: {
  inputKey: string;
  label: string;
  onPersist: (trimmed: string) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  emptyHint?: string;
}) {
  const [local, setLocal] = useState(label);
  useEffect(() => {
    setLocal(label);
  }, [inputKey, label]);

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const t = local.trim();
        const cur = (label || '').trim();
        if (t === cur) return;
        if (!t) {
          toast.error(emptyHint);
          setLocal(label);
          return;
        }
        void onPersist(t);
      }}
      className={className}
    />
  );
}

const TAB_PERM_MAP: Record<string, string> = {
  categories: 'settings:categories',
  partner_categories: 'settings:partner_categories',
  nodes: 'settings:nodes',
  warehouses: 'settings:warehouses',
  finance_categories: 'settings:finance_categories',
  finance_account_types: 'settings:finance_account_types',
  production: 'settings:config',
};

const SettingsView: React.FC<SettingsViewProps> = ({ 
  categories, 
  partnerCategories,
  globalNodes, 
  warehouses,
  financeCategories,
  onRefreshFinanceCategories,
  financeAccountTypes,
  onRefreshFinanceAccountTypes,
  productionLinkMode = 'order',
  onUpdateProductionLinkMode,
  processSequenceMode = 'free',
  onUpdateProcessSequenceMode,
  allowExceedMaxReportQty = true,
  onUpdateAllowExceedMaxReportQty,
  onRefreshCategories, 
  onRefreshPartnerCategories,
  onRefreshGlobalNodes,
  onRefreshWarehouses,
  userPermissions,
  tenantRole,
}) => {
  const isOwner = tenantRole === 'owner';
  const hasPerm = (perm: string): boolean => {
    if (isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes(perm)) return true;
    const [module] = perm.split(':');
    if (module && userPermissions.includes(module)) return true;
    return false;
  };
  const canView = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:view`) : true;
  };
  const canCreate = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:create`) : true;
  };
  const canEdit = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:edit`) : true;
  };
  const canDelete = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:delete`) : true;
  };
  const [activeTab, setActiveTab] = useState<SettingsTab>('categories');
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  /** 分类名称本地草稿：失焦再保存，避免每字请求 API 打断中文输入法 */
  const [categoryNameDraft, setCategoryNameDraft] = useState('');
  const [partnerCatNameDraft, setPartnerCatNameDraft] = useState('');
  const [nodeNameDraft, setNodeNameDraft] = useState('');
  const [whDraft, setWhDraft] = useState({ name: '', location: '' });
  const [financeCatNameDraft, setFinanceCatNameDraft] = useState('');

  const [newPCatName, setNewPCatName] = useState('');
  const [editingPCatId, setEditingPCatId] = useState<string | null>(null);

  const [newWhName, setNewWhName] = useState('');
  const [editingWhId, setEditingWhId] = useState<string | null>(null);

  const [newFinanceCatName, setNewFinanceCatName] = useState('');
  const [editingFinanceCatId, setEditingFinanceCatId] = useState<string | null>(null);
  const [newAccountTypeName, setNewAccountTypeName] = useState('');
  const [editingAccountTypeId, setEditingAccountTypeId] = useState<string | null>(null);
  const [editingAccountTypeName, setEditingAccountTypeName] = useState('');
  const [showAccountTypesModal, setShowAccountTypesModal] = useState(false);

  const [newNodeName, setNewNodeName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const tabs = [
    { id: 'categories', label: '产品分类管理', icon: Tag, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '产品分类管理', sub: '定义产品分类、颜色尺码及扩展属性' },
    { id: 'partner_categories', label: '合作单位分类', icon: Shapes, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '合作单位分类', sub: '配置供应商、客户等单位类型的自定义字段' },
    { id: 'nodes', label: '工序节点库', icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '工序节点库', sub: '定义生产工序、报工模板及 BOM 关联' },
    { id: 'warehouses', label: '仓库分类管理', icon: WarehouseIcon, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '仓库分类管理', sub: '维护实体仓库档案与分类' },
    { id: 'finance_categories', label: '收付款类型设置', icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '收付款类型设置', sub: '配置收款单/付款单分类及关联项、自定义内容' },
    { id: 'production', label: '生产业务配置', icon: Link2, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '生产业务配置', sub: '生产关联模式、计划/工单/领料/报工等业务规则' },
  ];
  const visibleTabs = tabs.filter(t => canView(t.id));
  const activeTabMeta = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0];
  const effectiveTab = activeTabMeta?.id as SettingsTab | undefined;

  const addPartnerCategory = async () => {
    if (!newPCatName.trim()) return;
    if (partnerCategories.some(c => c.name === newPCatName.trim())) { toast.warning(`分类"${newPCatName.trim()}"已存在`); return; }
    try {
      const created = await api.settings.partnerCategories.create({ name: newPCatName, customFields: [] }) as PartnerCategory;
      setNewPCatName('');
      setEditingPCatId(created.id);
      setPartnerCatNameDraft((created as PartnerCategory).name || newPCatName.trim());
      await onRefreshPartnerCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const removePartnerCategory = async (id: string) => {
    try {
      await api.settings.partnerCategories.delete(id);
      if (editingPCatId === id) setEditingPCatId(null);
      await onRefreshPartnerCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updatePCategoryConfig = async (id: string, updates: Partial<PartnerCategory>) => {
    try {
      await api.settings.partnerCategories.update(id, updates);
      await onRefreshPartnerCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const addPCustomField = (catId: string) => {
    const newField: ReportFieldDefinition = { id: `pcf-${crypto.randomUUID().slice(0, 8)}`, label: '新扩展项', type: 'text', required: false };
    const cat = partnerCategories.find(c => c.id === catId);
    if (cat) {
      updatePCategoryConfig(catId, { customFields: [...cat.customFields, newField] });
    }
  };

  const updatePCustomField = (catId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const cat = partnerCategories.find(c => c.id === catId);
    if (cat) {
      const newFields = cat.customFields.map(f => f.id === fieldId ? { ...f, ...updates } : f);
      updatePCategoryConfig(catId, { customFields: newFields });
    }
  };

  const removePCustomField = (catId: string, fieldId: string) => {
    const cat = partnerCategories.find(c => c.id === catId);
    if (cat) {
      updatePCategoryConfig(catId, { customFields: cat.customFields.filter(f => f.id !== fieldId) });
    }
  };

  const handleAddWarehouse = async () => {
    if (!newWhName.trim()) return;
    if (warehouses.some(w => w.name === newWhName.trim())) { toast.warning(`仓库"${newWhName.trim()}"已存在`); return; }
    try {
      const created = await api.settings.warehouses.create({
        name: newWhName.trim(),
      }) as Warehouse;
      setNewWhName('');
      setEditingWhId(created.id);
      setWhDraft({
        name: (created as Warehouse).name || newWhName.trim(),
        location: (created as Warehouse).location || '',
      });
      await onRefreshWarehouses();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const removeWarehouse = async (id: string) => {
    try {
      await api.settings.warehouses.delete(id);
      if (editingWhId === id) setEditingWhId(null);
      await onRefreshWarehouses();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const handleQuickAddNode = async () => {
    if (!newNodeName.trim()) return;
    if (globalNodes.some(n => n.name === newNodeName.trim())) { toast.warning(`工序"${newNodeName.trim()}"已存在`); return; }
    try {
      const created = await api.settings.nodes.create({
        name: newNodeName, reportTemplate: [], hasBOM: false,
        enableAssignment: false, enableWorkerAssignment: false,
        enableEquipmentAssignment: false, enableEquipmentOnReport: false,
        enablePieceRate: false, allowOutsource: false,
      }) as GlobalNodeTemplate;
      setNewNodeName('');
      setEditingNodeId(created.id);
      setNodeNameDraft((created as GlobalNodeTemplate).name || newNodeName.trim());
      await onRefreshGlobalNodes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const removeNode = async (id: string) => {
    try {
      await api.settings.nodes.delete(id);
      if (editingNodeId === id) setEditingNodeId(null);
      await onRefreshGlobalNodes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateNodeConfig = async (id: string, updates: Partial<GlobalNodeTemplate>) => {
    try {
      await api.settings.nodes.update(id, updates);
      await onRefreshGlobalNodes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const addFieldToNode = (nodeId: string) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      const newField: ReportFieldDefinition = { id: `f-${crypto.randomUUID().slice(0, 8)}`, label: '新填报项', type: 'text' };
      updateNodeConfig(nodeId, { reportTemplate: [...node.reportTemplate, newField] });
    }
  };

  const updateNodeField = (nodeId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      const newFields = node.reportTemplate.map(f => f.id === fieldId ? { ...f, ...updates } : f);
      updateNodeConfig(nodeId, { reportTemplate: newFields });
    }
  };

  const removeNodeField = (nodeId: string, fieldId: string) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      updateNodeConfig(nodeId, { reportTemplate: node.reportTemplate.filter(f => f.id !== fieldId) });
    }
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    if (categories.some(c => c.name === newCatName.trim())) { toast.warning(`分类"${newCatName.trim()}"已存在`); return; }
    try {
      const created = await api.settings.categories.create({
        name: newCatName, color: 'bg-indigo-600', hasProcess: false,
        hasSalesPrice: false, hasPurchasePrice: false, hasColorSize: false,
        hasBatchManagement: false, customFields: []
      }) as ProductCategory;
      setNewCatName('');
      setEditingCatId(created.id);
      setCategoryNameDraft((created as ProductCategory).name || newCatName.trim());
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const removeCategory = async (id: string) => {
    try {
      await api.settings.categories.delete(id);
      if (editingCatId === id) setEditingCatId(null);
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateCategoryConfig = async (id: string, updates: Partial<ProductCategory>) => {
    try {
      await api.settings.categories.update(id, updates);
      await onRefreshCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const addCustomField = (catId: string) => {
    const newField: ReportFieldDefinition = { id: `cf-${crypto.randomUUID().slice(0, 8)}`, label: '新属性名称', type: 'text', required: false };
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      updateCategoryConfig(catId, { customFields: [...cat.customFields, newField] });
    }
  };

  const updateCustomField = (catId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      const newFields = cat.customFields.map(f => f.id === fieldId ? { ...f, ...updates } : f);
      updateCategoryConfig(catId, { customFields: newFields });
    }
  };

  const removeCustomField = (catId: string, fieldId: string) => {
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      updateCategoryConfig(catId, { customFields: cat.customFields.filter(f => f.id !== fieldId) });
    }
  };

  const addFinanceCategory = async () => {
    if (!newFinanceCatName.trim()) return;
    try {
      const created = await api.settings.financeCategories.create({
        kind: 'RECEIPT', name: newFinanceCatName.trim(), linkOrder: false,
        linkPartner: false, selectPaymentAccount: false, linkWorker: false,
        linkProduct: false, customFields: []
      }) as FinanceCategory;
      setNewFinanceCatName('');
      setEditingFinanceCatId(created.id);
      setFinanceCatNameDraft((created as FinanceCategory).name || newFinanceCatName.trim());
      await onRefreshFinanceCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const removeFinanceCategory = async (id: string) => {
    try {
      await api.settings.financeCategories.delete(id);
      if (editingFinanceCatId === id) setEditingFinanceCatId(null);
      await onRefreshFinanceCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateFinanceCategoryConfig = async (id: string, updates: Partial<FinanceCategory>) => {
    try {
      await api.settings.financeCategories.update(id, updates);
      await onRefreshFinanceCategories();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const addFinanceCustomField = (catId: string) => {
    const newField: ReportFieldDefinition = { id: `fcf-${crypto.randomUUID().slice(0, 8)}`, label: '新扩展项', type: 'text', required: false };
    const cat = financeCategories.find(c => c.id === catId);
    if (cat) {
      updateFinanceCategoryConfig(catId, { customFields: [...cat.customFields, newField] });
    }
  };

  const updateFinanceCustomField = (catId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const cat = financeCategories.find(c => c.id === catId);
    if (cat) {
      const newFields = cat.customFields.map(f => f.id === fieldId ? { ...f, ...updates } : f);
      updateFinanceCategoryConfig(catId, { customFields: newFields });
    }
  };

  const removeFinanceCustomField = (catId: string, fieldId: string) => {
    const cat = financeCategories.find(c => c.id === catId);
    if (cat) {
      updateFinanceCategoryConfig(catId, { customFields: cat.customFields.filter(f => f.id !== fieldId) });
    }
  };

  const addFinanceAccountType = async () => {
    if (!newAccountTypeName.trim()) return;
    try {
      await api.settings.financeAccountTypes.create({ name: newAccountTypeName.trim() });
      setNewAccountTypeName('');
      await onRefreshFinanceAccountTypes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const removeFinanceAccountType = async (id: string) => {
    try {
      await api.settings.financeAccountTypes.delete(id);
      if (editingAccountTypeId === id) setEditingAccountTypeId(null);
      await onRefreshFinanceAccountTypes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateFinanceAccountTypeConfig = async (id: string, updates: Partial<FinanceAccountType>) => {
    try {
      await api.settings.financeAccountTypes.update(id, updates);
      await onRefreshFinanceAccountTypes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  return (
    <div className="space-y-8">
      <div className="pt-4">
        <div className="flex bg-white p-1.5 rounded-[24px] border border-slate-200 shadow-sm w-full lg:w-fit overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-3 px-6 py-3 rounded-[18px] text-sm font-bold transition-all whitespace-nowrap ${
                (effectiveTab === tab.id)
                  ? `${tab.bg} ${tab.color} shadow-sm`
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${(effectiveTab === tab.id) ? tab.color : 'text-slate-300'}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      </div>

      {activeTabMeta && (
        <div className={`mb-8 ${activeTab === 'finance_categories' ? 'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4' : ''}`}>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{(activeTabMeta as typeof tabs[0]).title}</h1>
            <p className="text-slate-500 mt-1 italic text-sm">{(activeTabMeta as typeof tabs[0]).sub}</p>
          </div>
          {activeTab === 'finance_categories' && canView('finance_account_types') && (
            <button
              type="button"
              onClick={() => { setShowAccountTypesModal(true); setNewAccountTypeName(''); setEditingAccountTypeId(null); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all shadow-sm shrink-0"
            >
              <CreditCard className="w-4 h-4" /> 收支账户类型
            </button>
          )}
        </div>
      )}

      <div className="min-h-[600px]">
        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
                <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Tag className="w-4 h-4 text-indigo-600" />
                  产品分类库
                </h2>
                <div className="space-y-3 mb-8">
                  {categories.map(cat => (
                    <div 
                      key={cat.id} 
                      onClick={() => {
                        setEditingCatId(cat.id);
                        setCategoryNameDraft(cat.name);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                        editingCatId === cat.id 
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                        : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${editingCatId === cat.id ? 'text-indigo-900' : 'text-slate-600'}`}>{cat.name}</span>
                      </div>
                      <ArrowRight className={`w-4 h-4 transition-all ${editingCatId === cat.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
                    </div>
                  ))}
                </div>
                {canCreate('categories') && (
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增产品分类</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={addCategory} disabled={!newCatName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">确认添加</button>
                  </div>
                </div>
                )}
              </div>
            </div>
            <div className="lg:col-span-8">
              {editingCatId ? (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                  {categories.filter(c => c.id === editingCatId).map(cat => (
                    <div key={cat.id}>
                      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h2 className="font-black text-slate-800 text-lg">编辑产品分类：{categoryNameDraft || cat.name}</h2>
                        {canDelete('categories') && <button onClick={() => removeCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                      </div>
                      <div className="p-8 space-y-12">
                        <div className="space-y-6">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4" /> 1. 分类基础信息
                          </h3>
                          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                            <div className="space-y-1 max-w-sm">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类名称</label>
                              <input
                                type="text"
                                value={categoryNameDraft}
                                onChange={(e) => setCategoryNameDraft(e.target.value)}
                                onBlur={async () => {
                                  const cur = categories.find((x) => x.id === cat.id);
                                  if (!cur) return;
                                  const next = categoryNameDraft.trim();
                                  if (next === cur.name) return;
                                  if (!next) {
                                    toast.error('分类名称不能为空');
                                    setCategoryNameDraft(cur.name);
                                    return;
                                  }
                                  try {
                                    await api.settings.categories.update(cat.id, { name: next });
                                    await onRefreshCategories();
                                  } catch (err: unknown) {
                                    toast.error(err instanceof Error ? err.message : '保存失败');
                                    setCategoryNameDraft(cur.name);
                                  }
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4" /> 2. 模块权限与特性开关
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                              { label: '启用工序设置', key: 'hasProcess', desc: '开启后支持配置生产工序路线。', icon: Info },
                              { label: '启用销售价格', key: 'hasSalesPrice', desc: '是否在该类产品中录入销售标价。', icon: DollarSign },
                              { label: '启用采购价和供应商', key: 'hasPurchasePrice', desc: '开启后可维护参考采购单价并关联首选供应商。', icon: ShoppingCart },
                              { label: '启用颜色尺码', key: 'hasColorSize', desc: '开启后支持颜色、尺码库选择。', icon: Maximize },
                              { label: '启用批次管理', key: 'hasBatchManagement', desc: '开启后该类产品在采购、出入库和生产入库中按批次记录库存。', icon: Tag },
                            ].map(toggle => (
                              <div key={toggle.key} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <toggle.icon className="w-4 h-4 text-indigo-400" />
                                    <span className="text-sm font-bold text-slate-800">{toggle.label}</span>
                                  </div>
                                  <button onClick={() => updateCategoryConfig(cat.id, { [toggle.key]: !(cat as any)[toggle.key] })}>
                                    {(cat as any)[toggle.key] ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">{toggle.desc}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-slate-100">
                           <div className="flex items-center justify-between">
                              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <ListPlus className="w-4 h-4" /> 3. 分类专属扩展字段
                              </h3>
                              <button onClick={() => addCustomField(cat.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all">
                                <PlusSquare className="w-3.5 h-3.5" /> 新增扩展项
                              </button>
                           </div>
                           <div className="space-y-3">
                              {cat.customFields.map((field, fIdx) => (
                                <div key={field.id} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col gap-3 group hover:bg-white hover:border-indigo-200 transition-all">
                                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <ExtFieldLabelInput
                                        inputKey={`prod-cf-${cat.id}-${field.id}`}
                                        label={field.label}
                                        placeholder="属性名称"
                                        onPersist={(t) => updateCustomField(cat.id, field.id, { label: t })}
                                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                      />
                                      <select
                                        value={field.type}
                                        onChange={(e) => {
                                          const v = e.target.value as FieldType;
                                          if (v === 'file') {
                                            updateCustomField(cat.id, field.id, { type: v, showInForm: false, options: undefined });
                                          } else if (v === 'select') {
                                            updateCustomField(cat.id, field.id, {
                                              type: v,
                                              options: field.type === 'select' && Array.isArray(field.options) && field.options.length > 0 ? field.options : [],
                                            });
                                          } else {
                                            updateCustomField(cat.id, field.id, { type: v, options: undefined });
                                          }
                                        }}
                                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer"
                                      >
                                        <option value="text">文本输入</option><option value="number">数字录入</option><option value="select">下拉选择</option><option value="file">文件上传</option>
                                      </select>
                                      <div className="flex items-center gap-4 px-2 flex-wrap">
                                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateCustomField(cat.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[10px] font-black text-slate-400 uppercase">必填</span></label>
                                        {field.type !== 'file' && (
                                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.showInForm !== false} onChange={e => updateCustomField(cat.id, field.id, { showInForm: e.target.checked })} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[10px] font-black text-slate-400 uppercase">生产/进销存列表中显示</span></label>
                                        )}
                                      </div>
                                    </div>
                                    <button type="button" onClick={() => removeCustomField(cat.id, field.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-all self-start md:self-center shrink-0"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                                  {field.type === 'select' && (
                                    <ProductCategorySelectOptions
                                      catId={cat.id}
                                      fieldId={field.id}
                                      options={field.options || []}
                                      onPersist={(cid, fid, next) => {
                                        const c = categories.find((x) => x.id === cid);
                                        if (!c) return;
                                        updateCategoryConfig(cid, {
                                          customFields: c.customFields.map((f) => (f.id === fid ? { ...f, options: next } : f)),
                                        });
                                      }}
                                    />
                                  )}
                                </div>
                              ))}
                           </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
                   <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Tag className="w-8 h-8 text-slate-300" /></div>
                   <h3 className="text-lg font-bold text-slate-400">请选择左侧分类进行配置</h3>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'partner_categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
                <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Shapes className="w-4 h-4 text-indigo-600" />
                  合作单位分类库
                </h2>
                <div className="space-y-3 mb-8">
                  {partnerCategories.map(cat => (
                    <div 
                      key={cat.id} 
                      onClick={() => {
                        setEditingPCatId(cat.id);
                        setPartnerCatNameDraft(cat.name);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                        editingPCatId === cat.id 
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                        : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${editingPCatId === cat.id ? 'text-indigo-900' : 'text-slate-600'}`}>{cat.name}</span>
                      </div>
                      <ArrowRight className={`w-4 h-4 transition-all ${editingPCatId === cat.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
                    </div>
                  ))}
                </div>
                {canCreate('partner_categories') && (
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增单位分类</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="分类名称 (如：核心供应商)" value={newPCatName} onChange={e => setNewPCatName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={addPartnerCategory} disabled={!newPCatName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">确认添加</button>
                  </div>
                </div>
                )}
              </div>
            </div>
            <div className="lg:col-span-8">
              {editingPCatId ? (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                  {partnerCategories.filter(c => c.id === editingPCatId).map(cat => (
                    <div key={cat.id}>
                      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h2 className="font-black text-slate-800 text-lg">编辑单位分类：{partnerCatNameDraft || cat.name}</h2>
                        {canDelete('partner_categories') && <button onClick={() => removePartnerCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                      </div>
                      <div className="p-8 space-y-12">
                        <div className="space-y-6">
                           <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Settings className="w-4 h-4" /> 1. 基础信息设置</h3>
                           <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                              <div className="space-y-1 max-w-sm">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类名称</label>
                                 <input
                                   type="text"
                                   value={partnerCatNameDraft}
                                   onChange={(e) => setPartnerCatNameDraft(e.target.value)}
                                   onBlur={async () => {
                                     const cur = partnerCategories.find((x) => x.id === cat.id);
                                     if (!cur) return;
                                     const next = partnerCatNameDraft.trim();
                                     if (next === cur.name) return;
                                     if (!next) {
                                       toast.error('分类名称不能为空');
                                       setPartnerCatNameDraft(cur.name);
                                       return;
                                     }
                                     try {
                                       await api.settings.partnerCategories.update(cat.id, { name: next });
                                       await onRefreshPartnerCategories();
                                     } catch (err: unknown) {
                                       toast.error(err instanceof Error ? err.message : '保存失败');
                                       setPartnerCatNameDraft(cur.name);
                                     }
                                   }}
                                   className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                 />
                              </div>
                           </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-slate-100">
                           <div className="flex items-center justify-between">
                              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Building2 className="w-4 h-4" /> 2. 单位专属扩展字段 (自定义内容)
                              </h3>
                              <button onClick={() => addPCustomField(cat.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all shadow-md">
                                <PlusSquare className="w-3.5 h-3.5" /> 增加信息字段
                              </button>
                           </div>
                           <div className="space-y-3">
                              {cat.customFields.length === 0 ? (
                                <div className="py-12 border-2 border-dashed border-slate-100 rounded-[24px] text-center text-slate-300 text-xs italic">
                                   尚未定义分类扩展信息。开启后，该类单位将支持录入如：纳税号、结算周期等自定义内容。
                                </div>
                              ) : (
                                cat.customFields.map((field, fIdx) => (
                                  <div key={field.id} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4 group hover:bg-white hover:border-indigo-200 transition-all">
                                    <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-black text-[10px]">{fIdx + 1}</div>
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <ExtFieldLabelInput
                                        inputKey={`partner-cf-${cat.id}-${field.id}`}
                                        label={field.label}
                                        placeholder="字段名称 (如：纳税识别号)"
                                        onPersist={(t) => updatePCustomField(cat.id, field.id, { label: t })}
                                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                      />
                                      <select value={field.type} onChange={e => updatePCustomField(cat.id, field.id, { type: e.target.value as FieldType })} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer">
                                        <option value="text">普通文本</option><option value="number">数字/金额</option><option value="select">下拉单选</option><option value="boolean">是否开关</option><option value="date">日期选择</option>
                                      </select>
                                      <div className="flex items-center gap-4 px-2">
                                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updatePCustomField(cat.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded text-indigo-600 border-slate-300" /><span className="text-[10px] font-black text-slate-400 uppercase">必填</span></label>
                                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.showInForm !== false} onChange={e => updatePCustomField(cat.id, field.id, { showInForm: e.target.checked })} className="w-4 h-4 rounded text-indigo-600 border-slate-300" /><span className="text-[10px] font-black text-slate-400 uppercase">表单中显示</span></label>
                                      </div>
                                    </div>
                                    <button onClick={() => removePCustomField(cat.id, field.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                                ))
                              )}
                           </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
                   <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Shapes className="w-8 h-8 text-slate-300" /></div>
                   <h3 className="text-lg font-bold text-slate-400">请选择左侧分类进行配置</h3>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'nodes' && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
               <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
                <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Database className="w-4 h-4 text-indigo-600" />
                  全局工序库
                </h2>
                <div className="space-y-3 mb-8">
                  {globalNodes.map(node => (
                    <div 
                      key={node.id} 
                      onClick={() => {
                        setEditingNodeId(node.id);
                        setNodeNameDraft(node.name);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                        editingNodeId === node.id 
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                        : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${editingNodeId === node.id ? 'text-indigo-900' : 'text-slate-600'}`}>{node.name}</span>
                      </div>
                      <ArrowRight className={`w-4 h-4 transition-all ${editingNodeId === node.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
                    </div>
                  ))}
                </div>
                {canCreate('nodes') && (
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速录入新工序</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="工序名称" value={newNodeName} onChange={e => setNewNodeName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={handleQuickAddNode} disabled={!newNodeName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">保存并配置</button>
                  </div>
                </div>
                )}
              </div>
            </div>
            <div className="lg:col-span-8">
               {editingNodeId ? (
                 <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                    {globalNodes.filter(n => n.id === editingNodeId).map(node => (
                       <div key={node.id}>
                          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="font-black text-slate-800 text-lg">编辑工序：{nodeNameDraft || node.name}</h2>
                            {canDelete('nodes') && <button onClick={() => removeNode(node.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                          </div>
                          <div className="p-8 space-y-10">
                             <div className="space-y-6">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <Settings className="w-4 h-4" /> 1. 工序基础信息
                                </h3>
                                <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 max-w-md">
                                   <div className="space-y-1">
                                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest">工序名称</label>
                                      <input
                                        type="text"
                                        value={nodeNameDraft}
                                        onChange={(e) => setNodeNameDraft(e.target.value)}
                                        onBlur={async () => {
                                          const cur = globalNodes.find((x) => x.id === node.id);
                                          if (!cur) return;
                                          const next = nodeNameDraft.trim();
                                          if (next === cur.name) return;
                                          if (!next) {
                                            toast.error('工序名称不能为空');
                                            setNodeNameDraft(cur.name);
                                            return;
                                          }
                                          try {
                                            await api.settings.nodes.update(node.id, { name: next });
                                            await onRefreshGlobalNodes();
                                          } catch (err: unknown) {
                                            toast.error(err instanceof Error ? err.message : '保存失败');
                                            setNodeNameDraft(cur.name);
                                          }
                                        }}
                                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                      />
                                   </div>
                                </div>
                             </div>

                             <div className="space-y-6">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <Settings className="w-4 h-4" /> 2. 工序功能开关
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                      <div className="flex items-center justify-between mb-2">
                                         <div className="flex items-center gap-2">
                                           <Boxes className="w-4 h-4 text-indigo-400" />
                                           <span className="text-sm font-bold text-slate-800">启用 BOM 依赖</span>
                                         </div>
                                         <button onClick={() => updateNodeConfig(node.id, { hasBOM: !node.hasBOM })}>
                                           {node.hasBOM ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                         </button>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-medium">开启后在此工序报工将扣减关联物料。</p>
                                   </div>
                                   <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                      <div className="flex items-center justify-between mb-2">
                                         <div className="flex items-center gap-2">
                                           <Users className="w-4 h-4 text-indigo-400" />
                                           <span className="text-sm font-bold text-slate-800">工人派工</span>
                                         </div>
                                         <button
                                           onClick={() => {
                                             const next = !(node.enableAssignment !== false && node.enableWorkerAssignment !== false);
                                             updateNodeConfig(node.id, next ? { enableAssignment: true, enableWorkerAssignment: true } : { enableWorkerAssignment: false });
                                           }}
                                         >
                                           {(node.enableAssignment !== false && node.enableWorkerAssignment !== false) ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                         </button>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-medium">开启后计划单详情中显示该工序的「分派负责人」选项。</p>
                                   </div>
                                   <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                      <div className="flex items-center justify-between mb-2">
                                         <div className="flex items-center gap-2">
                                           <Wrench className="w-4 h-4 text-indigo-400" />
                                           <span className="text-sm font-bold text-slate-800">设备派工</span>
                                         </div>
                                         <button
                                           onClick={() => {
                                             const next = !(node.enableAssignment !== false && node.enableEquipmentAssignment !== false);
                                             updateNodeConfig(node.id, next ? { enableAssignment: true, enableEquipmentAssignment: true } : { enableEquipmentAssignment: false });
                                           }}
                                         >
                                           {(node.enableAssignment !== false && node.enableEquipmentAssignment !== false) ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                         </button>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-medium">开启后计划单详情中显示该工序的「分派设备」选项。</p>
                                   </div>
                                   <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                      <div className="flex items-center justify-between mb-2">
                                         <div className="flex items-center gap-2">
                                           <Wrench className="w-4 h-4 text-indigo-400" />
                                           <span className="text-sm font-bold text-slate-800">报工选择设备</span>
                                         </div>
                                         <button onClick={() => updateNodeConfig(node.id, { enableEquipmentOnReport: !node.enableEquipmentOnReport })}>
                                           {node.enableEquipmentOnReport ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                         </button>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-medium">开启后该工序报工时需选择设备（参照设备派工输入框）。</p>
                                   </div>
                                   <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                      <div className="flex items-center justify-between mb-2">
                                         <div className="flex items-center gap-2">
                                           <DollarSign className="w-4 h-4 text-indigo-400" />
                                           <span className="text-sm font-bold text-slate-800">开启计件工价</span>
                                         </div>
                                         <button onClick={() => updateNodeConfig(node.id, { enablePieceRate: !node.enablePieceRate })}>
                                           {node.enablePieceRate ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                         </button>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-medium">开启后产品与 BOM 中可配置该工序工价（元/件），计划单详情显示工价。</p>
                                   </div>
                                   <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                      <div className="flex items-center justify-between mb-2">
                                         <div className="flex items-center gap-2">
                                           <Truck className="w-4 h-4 text-indigo-400" />
                                           <span className="text-sm font-bold text-slate-800">可外协</span>
                                         </div>
                                         <button onClick={() => updateNodeConfig(node.id, { allowOutsource: !node.allowOutsource })}>
                                           {node.allowOutsource ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                         </button>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-medium">开启后该工序会在外协管理待发清单中显示，可按工单选择工序发出。</p>
                                   </div>
                                </div>
                             </div>

                             <div className="space-y-6 pt-6 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                   <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText className="w-4 h-4" /> 报工表单模板配置</h3>
                                   <button onClick={() => addFieldToNode(node.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all">
                                      <PlusCircle className="w-3.5 h-3.5" /> 增加填报项
                                   </button>
                                </div>
                                <div className="space-y-3">
                                   {node.reportTemplate.length === 0 && <p className="text-center py-10 text-xs text-slate-300 italic border-2 border-dashed border-slate-100 rounded-2xl">暂无表单项，工人只需上报完工数量</p>}
                                   {node.reportTemplate.map((field, idx) => {
                                     const typeTri: FieldType =
                                       field.type === 'select' || field.type === 'file' ? field.type : 'text';
                                     return (
                                     <div key={field.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                                           <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm shrink-0">{idx + 1}</div>
                                           <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                              <ExtFieldLabelInput
                                                inputKey={`node-rt-${node.id}-${field.id}`}
                                                label={field.label}
                                                placeholder="标签名称"
                                                onPersist={(t) => updateNodeField(node.id, field.id, { label: t })}
                                                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                                              />
                                              <select
                                                value={typeTri}
                                                onChange={(e) => {
                                                  const v = e.target.value as FieldType;
                                                  if (v === 'select') {
                                                    updateNodeField(node.id, field.id, {
                                                      type: v,
                                                      options:
                                                        field.type === 'select' && Array.isArray(field.options) && field.options.length > 0
                                                          ? field.options
                                                          : [],
                                                    });
                                                  } else {
                                                    updateNodeField(node.id, field.id, { type: v, options: undefined });
                                                  }
                                                }}
                                                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                                              >
                                                <option value="text">文本输入</option>
                                                <option value="select">下拉选择</option>
                                                <option value="file">上传文件/图片</option>
                                              </select>
                                              <div className="flex items-center gap-4 px-2 flex-wrap">
                                                 <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateNodeField(node.id, field.id, { required: e.target.checked })} className="w-3.5 h-3.5 rounded text-indigo-600" /><span className="text-[10px] font-bold text-slate-400 uppercase">必填</span></label>
                                                 <button type="button" onClick={() => removeNodeField(node.id, field.id)} className="ml-auto p-1.5 text-rose-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                              </div>
                                              {field.type === 'select' && (
                                                <NodeReportTemplateSelectOptions
                                                  nodeId={node.id}
                                                  fieldId={field.id}
                                                  options={field.options || []}
                                                  onPersist={(nid, fid, next) => updateNodeField(nid, fid, { options: next })}
                                                />
                                              )}
                                           </div>
                                        </div>
                                     </div>
                                   );
                                   })}
                                </div>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Database className="w-8 h-8 text-slate-300" /></div>
                    <h3 className="text-lg font-bold text-slate-400">请选择左侧工序进行配置</h3>
                 </div>
               )}
            </div>
          </div>
        )}

        {activeTab === 'warehouses' && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
                <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <WarehouseIcon className="w-4 h-4 text-indigo-600" />
                  实体库房档案库
                </h2>
                <div className="space-y-3 mb-8">
                  {warehouses.map(wh => (
                    <div 
                      key={wh.id} 
                      onClick={() => {
                        setEditingWhId(wh.id);
                        setWhDraft({
                          name: wh.name || '',
                          location: wh.location || '',
                        });
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                        editingWhId === wh.id 
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                        : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                      }`}
                    >
                      <span className={`text-sm font-bold ${editingWhId === wh.id ? 'text-indigo-900' : 'text-slate-600'}`}>{wh.name}</span>
                      <ArrowRight className={`w-4 h-4 transition-all ${editingWhId === wh.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
                    </div>
                  ))}
                </div>
                {canCreate('warehouses') && (
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速录入新仓库</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="仓库名称" value={newWhName} onChange={e => setNewWhName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={handleAddWarehouse} disabled={!newWhName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">确认添加</button>
                  </div>
                </div>
                )}
              </div>
            </div>
            <div className="lg:col-span-8">
               {editingWhId ? (
                 <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                    {warehouses.filter(w => w.id === editingWhId).map(wh => (
                       <div key={wh.id}>
                          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="font-black text-slate-800 text-lg">编辑仓库：{whDraft.name || wh.name}</h2>
                            {canDelete('warehouses') && <button onClick={() => removeWarehouse(wh.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                          </div>
                          <div className="p-8 space-y-10">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1 md:col-span-2">
                                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest">仓库名称</label>
                                   <input
                                     type="text"
                                     value={whDraft.name}
                                     onChange={(e) => setWhDraft((d) => ({ ...d, name: e.target.value }))}
                                     onBlur={async () => {
                                       const cur = warehouses.find((x) => x.id === wh.id);
                                       if (!cur) return;
                                       const next = whDraft.name.trim();
                                       if (next === (cur.name || '')) return;
                                       if (!next) {
                                         toast.error('仓库名称不能为空');
                                         setWhDraft((d) => ({ ...d, name: cur.name || '' }));
                                         return;
                                       }
                                       try {
                                         await api.settings.warehouses.update(wh.id, { name: next });
                                         await onRefreshWarehouses();
                                       } catch (err: unknown) {
                                         toast.error(err instanceof Error ? err.message : '保存失败');
                                         setWhDraft((d) => ({ ...d, name: cur.name || '' }));
                                       }
                                     }}
                                     className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                   />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest flex items-center gap-2"><MapPin className="w-3 h-3" /> 地理位置</label>
                                   <input
                                     type="text"
                                     value={whDraft.location}
                                     onChange={(e) => setWhDraft((d) => ({ ...d, location: e.target.value }))}
                                     onBlur={async () => {
                                       const cur = warehouses.find((x) => x.id === wh.id);
                                       if (!cur) return;
                                       const next = whDraft.location.trim();
                                       if (next === (cur.location || '').trim()) return;
                                       try {
                                         await api.settings.warehouses.update(wh.id, { location: next || null });
                                         await onRefreshWarehouses();
                                       } catch (err: unknown) {
                                         toast.error(err instanceof Error ? err.message : '保存失败');
                                         setWhDraft((d) => ({ ...d, location: cur.location || '' }));
                                       }
                                     }}
                                     className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                   />
                                </div>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><WarehouseIcon className="w-8 h-8 text-slate-300" /></div>
                    <h3 className="text-lg font-bold text-slate-400">请选择左侧仓库进行配置</h3>
                 </div>
               )}
            </div>
          </div>
        )}

        {activeTab === 'finance_categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
                <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Wallet className="w-4 h-4 text-indigo-600" />
                  收付款类型库
                </h2>
                <div className="space-y-3 mb-8">
                  {financeCategories.map(cat => (
                    <div
                      key={cat.id}
                      onClick={() => {
                        setEditingFinanceCatId(cat.id);
                        setFinanceCatNameDraft(cat.name);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                        editingFinanceCatId === cat.id
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                          : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-sm font-bold ${editingFinanceCatId === cat.id ? 'text-indigo-900' : 'text-slate-600'}`}>{cat.name}</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">{cat.kind === 'RECEIPT' ? '收款单' : '付款单'}</span>
                      </div>
                      <ArrowRight className={`w-4 h-4 transition-all ${editingFinanceCatId === cat.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
                    </div>
                  ))}
                </div>
                {canCreate('finance_categories') && (
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增收付款类型</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="分类名称" value={newFinanceCatName} onChange={e => setNewFinanceCatName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={addFinanceCategory} disabled={!newFinanceCatName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">确认添加</button>
                  </div>
                </div>
                )}
              </div>
            </div>
            <div className="lg:col-span-8">
              {editingFinanceCatId ? (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                  {financeCategories.filter(c => c.id === editingFinanceCatId).map(cat => (
                    <div key={cat.id}>
                      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h2 className="font-black text-slate-800 text-lg">编辑收付款类型：{financeCatNameDraft || cat.name}</h2>
                        {canDelete('finance_categories') && <button onClick={() => removeFinanceCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                      </div>
                      <div className="p-8 space-y-12">
                        <div className="space-y-6">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Settings className="w-4 h-4" /> 1. 基础信息</h3>
                          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类</label>
                              <select value={cat.kind} onChange={e => updateFinanceCategoryConfig(cat.id, { kind: e.target.value as FinanceCategoryKind })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                                <option value="RECEIPT">收款单</option>
                                <option value="PAYMENT">付款单</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类名称</label>
                              <input
                                type="text"
                                value={financeCatNameDraft}
                                onChange={(e) => setFinanceCatNameDraft(e.target.value)}
                                onBlur={async () => {
                                  const cur = financeCategories.find((x) => x.id === cat.id);
                                  if (!cur) return;
                                  const next = financeCatNameDraft.trim();
                                  if (next === cur.name) return;
                                  if (!next) {
                                    toast.error('分类名称不能为空');
                                    setFinanceCatNameDraft(cur.name);
                                    return;
                                  }
                                  try {
                                    await api.settings.financeCategories.update(cat.id, { name: next });
                                    await onRefreshFinanceCategories();
                                  } catch (err: unknown) {
                                    toast.error(err instanceof Error ? err.message : '保存失败');
                                    setFinanceCatNameDraft(cur.name);
                                  }
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><LayoutGrid className="w-4 h-4" /> 2. 关联与选项开关</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                              { label: '是否关联工单', key: 'linkOrder', desc: '登记时可选关联工单。', icon: ClipboardList },
                              { label: '是否关联合作单位', key: 'linkPartner', desc: '登记时选择或填写合作单位/客户/供应商。', icon: Building2 },
                              { label: '是否选择收支账户', key: 'selectPaymentAccount', desc: '登记时选择收支账户。', icon: CreditCard },
                              { label: '是否关联工人', key: 'linkWorker', desc: '登记时可选关联工人（如工资、补贴）。', icon: UserPlus },
                              { label: '是否关联产品', key: 'linkProduct', desc: '登记时可选关联产品。', icon: Package },
                            ].map(toggle => (
                              <div key={toggle.key} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <toggle.icon className="w-4 h-4 text-indigo-400" />
                                    <span className="text-sm font-bold text-slate-800">{toggle.label}</span>
                                  </div>
                                  <button onClick={() => updateFinanceCategoryConfig(cat.id, { [toggle.key]: !(cat as any)[toggle.key] })}>
                                    {(cat as any)[toggle.key] ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">{toggle.desc}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListPlus className="w-4 h-4" /> 3. 自定义内容</h3>
                            <button onClick={() => addFinanceCustomField(cat.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all">
                              <PlusSquare className="w-3.5 h-3.5" /> 新增扩展项
                            </button>
                          </div>
                          <div className="space-y-3">
                            {cat.customFields.length === 0 ? (
                              <div className="py-12 border-2 border-dashed border-slate-100 rounded-[24px] text-center text-slate-300 text-xs italic">
                                尚未定义自定义内容。可增加如：发票号、结算方式、备注等扩展字段。
                              </div>
                            ) : (
                              cat.customFields.map((field, fIdx) => (
                                <div key={field.id} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4 group hover:bg-white hover:border-indigo-200 transition-all">
                                  <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-black text-[10px]">{fIdx + 1}</div>
                                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <ExtFieldLabelInput
                                      inputKey={`finance-cf-${cat.id}-${field.id}`}
                                      label={field.label}
                                      placeholder="字段名称"
                                      onPersist={(t) => updateFinanceCustomField(cat.id, field.id, { label: t })}
                                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <select value={field.type} onChange={e => updateFinanceCustomField(cat.id, field.id, { type: e.target.value as FieldType })} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer">
                                      <option value="text">普通文本</option><option value="number">数字/金额</option><option value="select">下拉单选</option><option value="boolean">是否开关</option><option value="date">日期选择</option>
                                    </select>
                                    <div className="flex items-center gap-4 px-2">
                                      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateFinanceCustomField(cat.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded text-indigo-600 border-slate-300" /><span className="text-[10px] font-black text-slate-400 uppercase">必填</span></label>
                                    </div>
                                  </div>
                                  <button onClick={() => removeFinanceCustomField(cat.id, field.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Wallet className="w-8 h-8 text-slate-300" /></div>
                  <h3 className="text-lg font-bold text-slate-400">请选择左侧收付款类型进行配置</h3>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'production' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
              <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Link2 className="w-4 h-4 text-indigo-600" />
                生产关联模式
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                决定计划单、工单、领料、报工等生产业务以工单维度还是产品维度进行关联和统计。
              </p>
              <div className="space-y-4">
                {[
                  { id: 'order' as const, label: '关联工单', desc: '计划/工单显示客户、交期；领料、报工、外协、返工、入库均关联工单；工单中心按父子分组。' },
                  { id: 'product' as const, label: '关联产品', desc: '计划不显示客户；工单扁平化；领料、报工等按产品关联；工单中心按产品分组。' },
                ].map(opt => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all ${
                      !canEdit('production') ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      productionLinkMode === opt.id
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="productionLinkMode"
                      checked={productionLinkMode === opt.id}
                      disabled={!canEdit('production')}
                      onChange={() => onUpdateProductionLinkMode?.(opt.id)}
                      className="mt-1 w-4 h-4 text-indigo-600"
                    />
                    <div>
                      <span className="font-bold text-slate-800">{opt.label}</span>
                      <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-6 italic">
                配置修改后仅影响新产生的数据，历史数据保持不变。
              </p>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Link2 className="w-4 h-4 text-indigo-600" />
                工序生产顺序
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                控制工序是否必须按工序路线依次生产，以及报工弹窗中的默认数量提示规则。
              </p>
              <div className="space-y-4">
                {[
                  {
                    id: 'free' as const,
                    label: '不限制工序顺序',
                    desc: '所有工序可独立报工，当前工单中心与报工行为保持不变。'
                  },
                  {
                    id: 'sequential' as const,
                    label: '按工序顺序生产',
                    desc: '前一工序存在报工记录后，后一工序才允许报工；下道工序默认提示数量为上一道工序的已报工数量（按颜色尺码分别提示）。'
                  },
                ].map(opt => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all ${
                      !canEdit('production') ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      processSequenceMode === opt.id
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="processSequenceMode"
                      checked={processSequenceMode === opt.id}
                      disabled={!canEdit('production')}
                      onChange={() => onUpdateProcessSequenceMode?.(opt.id)}
                      className="mt-1 w-4 h-4 text-indigo-600"
                    />
                    <div>
                      <span className="font-bold text-slate-800">{opt.label}</span>
                      <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-6 italic">
                工序顺序配置同样仅影响新产生的报工与进度计算，历史数据不会被回溯调整。
              </p>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Link2 className="w-4 h-4 text-indigo-600" />
                报工数量上限
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                控制报工时是否允许超过系统计算的“最多”数量（如计划剩余数或上一道工序报工数）。
              </p>
              <div className="bg-slate-50/60 border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    允许报工数量超过最大可报数量
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    关闭后，报工数量将被限制在弹窗中显示的“最多 N”以内，无法录入更大的数值。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEdit('production')}
                  onClick={() => onUpdateAllowExceedMaxReportQty?.(!allowExceedMaxReportQty)}
                  className={`ml-4 ${!canEdit('production') ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {allowExceedMaxReportQty ? (
                    <ToggleRight className={`w-10 h-10 ${!canEdit('production') ? 'text-slate-400' : 'text-indigo-600'}`} />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-slate-300" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 收支账户类型弹窗 */}
      {showAccountTypesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setShowAccountTypesModal(false); setEditingAccountTypeId(null); }} />
          <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">收支账户类型</h2>
              <button type="button" onClick={() => { setShowAccountTypesModal(false); setEditingAccountTypeId(null); }} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {canCreate('finance_account_types') && (
              <div className="space-y-4 mb-6">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">新增账户类型</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="如：现金、银行存款、微信、支付宝"
                    value={newAccountTypeName}
                    onChange={e => setNewAccountTypeName(e.target.value)}
                    className="flex-1 bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button type="button" onClick={addFinanceAccountType} disabled={!newAccountTypeName.trim()} className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0">
                    确认添加
                  </button>
                </div>
              </div>
              )}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">已配置类型</p>
                {financeAccountTypes.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-sm">暂无收支账户类型，请在上方新增</p>
                ) : (
                  financeAccountTypes.map(acc => (
                    <div key={acc.id} className="flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200 transition-all">
                      {editingAccountTypeId === acc.id ? (
                        <>
                          <input
                            type="text"
                            value={editingAccountTypeName}
                            onChange={e => setEditingAccountTypeName(e.target.value)}
                            className="flex-1 bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button type="button" onClick={() => { updateFinanceAccountTypeConfig(acc.id, { name: editingAccountTypeName.trim() }); setEditingAccountTypeId(null); }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">
                            保存
                          </button>
                          <button type="button" onClick={() => setEditingAccountTypeId(null)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200">
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-bold text-slate-800">{acc.name}</span>
                          {canEdit('finance_account_types') && (
                          <button type="button" onClick={() => { setEditingAccountTypeId(acc.id); setEditingAccountTypeName(acc.name); }} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="编辑">
                            <FileText className="w-4 h-4" />
                          </button>
                          )}
                          {canDelete('finance_account_types') && (
                          <button type="button" onClick={() => { removeFinanceAccountType(acc.id); }} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all" title="删除">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          )}
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(SettingsView);