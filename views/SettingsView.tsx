import React, { useState } from 'react';
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
  Contact,
  PlusSquare,
  Building2,
  Shapes,
  Users,
  Wrench,
} from 'lucide-react';
import { ProductCategory, ReportFieldDefinition, FieldType, GlobalNodeTemplate, Warehouse, PartnerCategory } from '../types';

interface SettingsViewProps {
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  globalNodes: GlobalNodeTemplate[];
  warehouses: Warehouse[];
  onUpdateCategories: (categories: ProductCategory[]) => void;
  onUpdatePartnerCategories: (categories: PartnerCategory[]) => void;
  onUpdateGlobalNodes: (nodes: GlobalNodeTemplate[]) => void;
  onUpdateWarehouses: (warehouses: Warehouse[]) => void;
}

type SettingsTab = 'categories' | 'partner_categories' | 'nodes' | 'warehouses';

const SettingsView: React.FC<SettingsViewProps> = ({ 
  categories, 
  partnerCategories,
  globalNodes, 
  warehouses,
  onUpdateCategories, 
  onUpdatePartnerCategories,
  onUpdateGlobalNodes,
  onUpdateWarehouses,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('categories');
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const [newPCatName, setNewPCatName] = useState('');
  const [editingPCatId, setEditingPCatId] = useState<string | null>(null);

  const [newWhName, setNewWhName] = useState('');
  const [editingWhId, setEditingWhId] = useState<string | null>(null);

  const [newNodeName, setNewNodeName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const tabs = [
    { id: 'categories', label: '产品分类管理', icon: Tag, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '产品分类管理', sub: '定义产品分类、颜色尺码及扩展属性' },
    { id: 'partner_categories', label: '合作单位分类', icon: Shapes, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '合作单位分类', sub: '配置供应商、客户等单位类型的自定义字段' },
    { id: 'nodes', label: '工序节点库', icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '工序节点库', sub: '定义生产工序、报工模板及 BOM 关联' },
    { id: 'warehouses', label: '仓库分类管理', icon: WarehouseIcon, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '仓库分类管理', sub: '维护实体仓库档案与分类' },
  ];
  const activeTabMeta = tabs.find(t => t.id === activeTab);

  const addPartnerCategory = () => {
    if (!newPCatName.trim()) return;
    const newCat: PartnerCategory = {
      id: `pcat-${Date.now()}`,
      name: newPCatName,
      customFields: []
    };
    onUpdatePartnerCategories([...partnerCategories, newCat]);
    setNewPCatName('');
    setEditingPCatId(newCat.id);
  };

  const removePartnerCategory = (id: string) => {
    onUpdatePartnerCategories(partnerCategories.filter(c => c.id !== id));
    if (editingPCatId === id) setEditingPCatId(null);
  };

  const updatePCategoryConfig = (id: string, updates: Partial<PartnerCategory>) => {
    onUpdatePartnerCategories(partnerCategories.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const addPCustomField = (catId: string) => {
    const newField: ReportFieldDefinition = { id: `pcf-${Date.now()}`, label: '新扩展项', type: 'text', required: false };
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

  const handleAddWarehouse = () => {
    if (!newWhName.trim()) return;
    const newWh: Warehouse = {
      id: `wh-${Date.now()}`,
      name: newWhName,
      code: `WH${Math.floor(Math.random() * 900) + 100}`,
      category: '未分类',
      location: '',
      contact: '',
      description: ''
    };
    onUpdateWarehouses([...warehouses, newWh]);
    setNewWhName('');
    setEditingWhId(newWh.id);
  };

  const removeWarehouse = (id: string) => {
    onUpdateWarehouses(warehouses.filter(w => w.id !== id));
    if (editingWhId === id) setEditingWhId(null);
  };

  const updateWarehouseConfig = (id: string, updates: Partial<Warehouse>) => {
    onUpdateWarehouses(warehouses.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const handleQuickAddNode = () => {
    if (!newNodeName.trim()) return;
    const newNode: GlobalNodeTemplate = {
      id: `gn-${Date.now()}`,
      name: newNodeName,
      reportTemplate: [],
      hasBOM: false
    };
    onUpdateGlobalNodes([...globalNodes, newNode]);
    setNewNodeName('');
    setEditingNodeId(newNode.id);
  };

  const removeNode = (id: string) => {
    onUpdateGlobalNodes(globalNodes.filter(n => n.id !== id));
    if (editingNodeId === id) setEditingNodeId(null);
  };

  const updateNodeConfig = (id: string, updates: Partial<GlobalNodeTemplate>) => {
    onUpdateGlobalNodes(globalNodes.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const addFieldToNode = (nodeId: string) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      const newField: ReportFieldDefinition = { id: `f-${Date.now()}`, label: '新填报项', type: 'text' };
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

  const addCategory = () => {
    if (!newCatName.trim()) return;
    const newCat: ProductCategory = {
      id: `cat-${Date.now()}`,
      name: newCatName,
      color: 'bg-indigo-600',
      hasProcess: true,
      hasSalesPrice: false,
      hasPurchasePrice: false,
      hasColorSize: false,
      customFields: []
    };
    onUpdateCategories([...categories, newCat]);
    setNewCatName('');
    setEditingCatId(newCat.id);
  };

  const removeCategory = (id: string) => {
    onUpdateCategories(categories.filter(c => c.id !== id));
    if (editingCatId === id) setEditingCatId(null);
  };

  const updateCategoryConfig = (id: string, updates: Partial<ProductCategory>) => {
    onUpdateCategories(categories.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const addCustomField = (catId: string) => {
    const newField: ReportFieldDefinition = { id: `cf-${Date.now()}`, label: '新属性名称', type: 'text', required: false };
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

  return (
    <div className="space-y-8">
      <div className="pt-4">
        <div className="flex bg-white p-1.5 rounded-[24px] border border-slate-200 shadow-sm w-full lg:w-fit overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
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

      {activeTabMeta && (
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{(activeTabMeta as typeof tabs[0]).title}</h1>
          <p className="text-slate-500 mt-1 italic text-sm">{(activeTabMeta as typeof tabs[0]).sub}</p>
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
                      onClick={() => setEditingCatId(cat.id)}
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
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增产品分类</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={addCategory} disabled={!newCatName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">确认添加</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-8">
              {editingCatId ? (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                  {categories.filter(c => c.id === editingCatId).map(cat => (
                    <div key={cat.id}>
                      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h2 className="font-black text-slate-800 text-lg">编辑产品分类：{cat.name}</h2>
                        <button onClick={() => removeCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
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
                                value={cat.name}
                                onChange={e => updateCategoryConfig(cat.id, { name: e.target.value })}
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
                              { label: '启用采购价格', key: 'hasPurchasePrice', desc: '启用后同时开启供应商管理功能。', icon: ShoppingCart },
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
                                <div key={field.id} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4 group hover:bg-white hover:border-indigo-200 transition-all">
                                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input type="text" placeholder="属性名称" value={field.label} onChange={e => updateCustomField(cat.id, field.id, { label: e.target.value })} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                                    <select value={field.type} onChange={e => { const v = e.target.value as FieldType; updateCustomField(cat.id, field.id, v === 'file' ? { type: v, showInForm: false } : { type: v }); }} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer">
                                      <option value="text">文本输入</option><option value="number">数字录入</option><option value="select">下拉选择</option><option value="file">文件上传</option>
                                    </select>
                                    <div className="flex items-center gap-4 px-2">
                                      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateCustomField(cat.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[10px] font-black text-slate-400 uppercase">必填</span></label>
                                      {field.type !== 'file' && (
                                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.showInForm !== false} onChange={e => updateCustomField(cat.id, field.id, { showInForm: e.target.checked })} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[10px] font-black text-slate-400 uppercase">生产/进销存列表中显示</span></label>
                                      )}
                                    </div>
                                  </div>
                                  <button onClick={() => removeCustomField(cat.id, field.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
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
                      onClick={() => setEditingPCatId(cat.id)}
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
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速新增单位分类</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="分类名称 (如：核心供应商)" value={newPCatName} onChange={e => setNewPCatName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={addPartnerCategory} disabled={!newPCatName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">确认添加</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-8">
              {editingPCatId ? (
                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                  {partnerCategories.filter(c => c.id === editingPCatId).map(cat => (
                    <div key={cat.id}>
                      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h2 className="font-black text-slate-800 text-lg">编辑单位分类：{cat.name}</h2>
                        <button onClick={() => removePartnerCategory(cat.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                      </div>
                      <div className="p-8 space-y-12">
                        <div className="space-y-6">
                           <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Settings className="w-4 h-4" /> 1. 基础信息设置</h3>
                           <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                              <div className="space-y-1 max-w-sm">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">分类名称</label>
                                 <input type="text" value={cat.name} onChange={e => updatePCategoryConfig(cat.id, { name: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                                      <input type="text" placeholder="字段名称 (如：纳税识别号)" value={field.label} onChange={e => updatePCustomField(cat.id, field.id, { label: e.target.value })} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
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
                      onClick={() => setEditingNodeId(node.id)}
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
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速录入新工序</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="工序名称" value={newNodeName} onChange={e => setNewNodeName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={handleQuickAddNode} disabled={!newNodeName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">保存并配置</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-8">
               {editingNodeId ? (
                 <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                    {globalNodes.filter(n => n.id === editingNodeId).map(node => (
                       <div key={node.id}>
                          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="font-black text-slate-800 text-lg">编辑工序：{node.name}</h2>
                            <button onClick={() => removeNode(node.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
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
                                        value={node.name}
                                        onChange={e => updateNodeConfig(node.id, { name: e.target.value })}
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
                                   {node.reportTemplate.map((field, idx) => (
                                     <div key={field.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
                                        <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm">{idx + 1}</div>
                                        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3">
                                           <input type="text" placeholder="标签名称" value={field.label} onChange={e => updateNodeField(node.id, field.id, { label: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none" />
                                           <select value={field.type} onChange={e => updateNodeField(node.id, field.id, { type: e.target.value as FieldType })} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none">
                                              <option value="text">文本输入</option><option value="number">数字录入</option><option value="select">下拉选择</option><option value="boolean">布尔开关</option><option value="date">日期选取</option>
                                           </select>
                                           <div className="flex items-center gap-4 px-2">
                                              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateNodeField(node.id, field.id, { required: e.target.checked })} className="w-3.5 h-3.5 rounded text-indigo-600" /><span className="text-[10px] font-bold text-slate-400 uppercase">必填</span></label>
                                              <button onClick={() => removeNodeField(node.id, field.id)} className="ml-auto p-1.5 text-rose-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                           </div>
                                        </div>
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
                      onClick={() => setEditingWhId(wh.id)}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                        editingWhId === wh.id 
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                        : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-sm font-bold ${editingWhId === wh.id ? 'text-indigo-900' : 'text-slate-600'}`}>{wh.name}</span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{wh.code}</span>
                      </div>
                      <ArrowRight className={`w-4 h-4 transition-all ${editingWhId === wh.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
                    </div>
                  ))}
                </div>
                <div className="pt-6 border-t border-slate-50">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速录入新仓库</h3>
                  <div className="space-y-4">
                    <input type="text" placeholder="仓库名称" value={newWhName} onChange={e => setNewWhName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <button onClick={handleAddWarehouse} disabled={!newWhName.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50">初始化档案</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-8">
               {editingWhId ? (
                 <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
                    {warehouses.filter(w => w.id === editingWhId).map(wh => (
                       <div key={wh.id}>
                          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="font-black text-slate-800 text-lg">编辑仓库：{wh.name}</h2>
                            <button onClick={() => removeWarehouse(wh.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                          </div>
                          <div className="p-8 space-y-10">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest">仓库代号 (CODE)</label>
                                   <input type="text" value={wh.code} onChange={e => updateWarehouseConfig(wh.id, { code: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                                <div className="space-y-1">
                                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest">仓库分类</label>
                                   <select value={wh.category} onChange={e => updateWarehouseConfig(wh.id, { category: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                                      <option value="原料库">原料库</option><option value="半成品库">半成品库</option><option value="成品库">成品库</option><option value="辅料/备件库">辅料/备件库</option><option value="残次/待处理库">残次/待处理库</option>
                                   </select>
                                </div>
                                <div className="space-y-1">
                                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest flex items-center gap-2"><MapPin className="w-3 h-3" /> 地理位置</label>
                                   <input type="text" value={wh.location} onChange={e => updateWarehouseConfig(wh.id, { location: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                                <div className="space-y-1">
                                   <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest flex items-center gap-2"><Contact className="w-3 h-3" /> 库管责任人</label>
                                   <input type="text" value={wh.contact} onChange={e => updateWarehouseConfig(wh.id, { contact: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
      </div>
    </div>
  );
};

export default SettingsView;