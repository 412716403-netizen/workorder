import React, { useState, useMemo } from 'react';
import { 
  Boxes, 
  Users, 
  Building2, 
  Cpu,
  Phone,
  ChevronRight,
  ShieldCheck,
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  Hash,
  ArrowLeft,
  Save,
  Tag,
  Database,
  Briefcase,
  Shapes,
  Info,
  ListPlus,
  CheckCircle,
  ShieldAlert,
  Hammer,
  MapPin,
  Library,
  Palette,
  Maximize2
} from 'lucide-react';
import ProductManagementView from './ProductManagementView';
import { Product, GlobalNodeTemplate, ProductCategory, BOM, AppDictionaries, Partner, Worker, Equipment, PartnerCategory, DictionaryItem } from '../types';

interface BasicInfoViewProps {
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  boms: BOM[];
  workers: Worker[];
  equipment: Equipment[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  onUpdateProduct: (product: Product) => void;
  onUpdateBOM: (bom: BOM) => void;
  onUpdateDictionaries: (dicts: AppDictionaries) => void;
  onUpdateWorkers: (workers: Worker[]) => void;
  onUpdateEquipment: (equipment: Equipment[]) => void;
  onUpdatePartners: (partners: Partner[]) => void;
  onUpdatePartnerCategories: (categories: PartnerCategory[]) => void;
}

type BasicTab = 'PRODUCTS' | 'PARTNERS' | 'WORKERS' | 'EQUIPMENT' | 'DICTIONARIES';

const BasicInfoView: React.FC<BasicInfoViewProps> = ({
  products, globalNodes, categories, partnerCategories, boms, workers, equipment, dictionaries, partners,
  onUpdateProduct, onUpdateBOM, onUpdateDictionaries, onUpdateWorkers, onUpdateEquipment, onUpdatePartners
}) => {
  const [activeTab, setActiveTab] = useState<BasicTab>('PRODUCTS');
  
  // --- 合作单位视图特有状态 ---
  const [activePartnerCategoryId, setActivePartnerCategoryId] = useState<string>(partnerCategories[0]?.id || 'all');
  const [searchTerm, setSearchTerm] = useState('');

  // --- 弹窗与编辑状态 ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<BasicTab | null>(null);

  // 临时编辑数据
  const [editPartner, setEditPartner] = useState<Partial<Partner>>({});
  const [editWorker, setEditWorker] = useState<Partial<Worker>>({});
  const [editEq, setEditEq] = useState<Partial<Equipment>>({});

  const [newColorName, setNewColorName] = useState('');
  const [newSizeName, setNewSizeName] = useState('');

  const handleAddColor = () => {
    if (!newColorName.trim()) return;
    const newItem: DictionaryItem = { id: `c-${Date.now()}`, name: newColorName.trim(), value: newColorName.trim() };
    onUpdateDictionaries({ ...dictionaries, colors: [...dictionaries.colors, newItem] });
    setNewColorName('');
  };

  const handleAddSize = () => {
    if (!newSizeName.trim()) return;
    const newItem: DictionaryItem = { id: `s-${Date.now()}`, name: newSizeName, value: newSizeName };
    onUpdateDictionaries({ ...dictionaries, sizes: [...dictionaries.sizes, newItem] });
    setNewSizeName('');
  };

  const tabs = [
    { id: 'PRODUCTS', label: '产品与 BOM', icon: Boxes },
    { id: 'PARTNERS', label: '合作单位', icon: Building2 },
    { id: 'WORKERS', label: '工人管理', icon: Users },
    { id: 'EQUIPMENT', label: '设备管理', icon: Cpu },
    { id: 'DICTIONARIES', label: '公共数据字典', icon: Library },
  ];

  // --- 过滤逻辑：合作单位 ---
  const filteredPartners = useMemo(() => {
    return partners.filter(p => {
      const matchesCategory = activePartnerCategoryId === 'all' || p.categoryId === activePartnerCategoryId;
      const term = searchTerm.toLowerCase();
      const matchesSearch = p.name.toLowerCase().includes(term) || p.contact.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [partners, activePartnerCategoryId, searchTerm]);

  // --- 操作处理器 ---
  const handleOpenPartner = (p?: Partner) => {
    setEditPartner(p || { 
      name: '', 
      categoryId: activePartnerCategoryId !== 'all' ? activePartnerCategoryId : '', 
      contact: '', 
      customData: {} 
    });
    setEditingId(p?.id || null);
    setShowModal('PARTNERS');
  };

  const savePartner = () => {
    if (editingId) {
      onUpdatePartners(partners.map(p => p.id === editingId ? { ...p, ...editPartner } as Partner : p));
    } else {
      const newPartner: Partner = { 
        ...editPartner as Partner, 
        id: `pa-${Date.now()}` 
      };
      onUpdatePartners([...partners, newPartner]);
    }
    setShowModal(null);
  };

  const handleOpenWorker = (w?: Worker) => {
    setEditWorker(w || { name: '', group: '', skills: [], status: 'ACTIVE', assignedMilestoneIds: [] });
    setEditingId(w?.id || null);
    setShowModal('WORKERS');
  };

  const saveWorker = () => {
    if (editingId) {
      onUpdateWorkers(workers.map(w => w.id === editingId ? { ...w, ...editWorker } as Worker : w));
    } else {
      const worker: Worker = { ...editWorker as Worker, id: `w-${Date.now()}`, role: '普工', status: 'ACTIVE' };
      onUpdateWorkers([...workers, worker]);
    }
    setShowModal(null);
  };

  const handleOpenEq = (e?: Equipment) => {
    setEditEq(e || { name: '', code: '', assignedMilestoneIds: [] });
    setEditingId(e?.id || null);
    setShowModal('EQUIPMENT');
  };

  const saveEq = () => {
    if (editingId) {
      onUpdateEquipment(equipment.map(e => e.id === editingId ? { ...e, ...editEq } as Equipment : e));
    } else {
      const eq: Equipment = { ...editEq as Equipment, id: `e-${Date.now()}` };
      onUpdateEquipment([...equipment, eq]);
    }
    setShowModal(null);
  };

  const renderHeader = (title: string, sub: string, onAdd: (() => void) | null, btnLabel: string) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-1 italic text-sm">{sub}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative group hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500" />
          <input 
            type="text" 
            placeholder="检索单位名称/联系人..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-48"
          />
        </div>
        {onAdd && (
          <button onClick={onAdd} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
            <Plus className="w-4 h-4" /> {btnLabel}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 主导航标签 */}
      <div className="flex bg-white p-1.5 rounded-[24px] border border-slate-200 shadow-sm w-fit overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as BasicTab); setSearchTerm(''); }}
              className={`flex items-center gap-3 px-6 py-3 rounded-[18px] text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id 
                ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-300'}`} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'PRODUCTS' && (
          <ProductManagementView products={products} globalNodes={globalNodes} categories={categories} boms={boms} dictionaries={dictionaries} partners={partners} onUpdateProduct={onUpdateProduct} onUpdateBOM={onUpdateBOM} onUpdateDictionaries={onUpdateDictionaries} />
        )}

        {activeTab === 'PARTNERS' && !showModal && (
          <div className="space-y-8">
            {renderHeader('合作单位中心', '分类管理外部单位档案及自定义扩展信息', () => handleOpenPartner(), '新增单位')}
            
            {/* 分类导航条 */}
            <div className="flex bg-slate-100/50 p-1 rounded-xl w-fit overflow-x-auto no-scrollbar max-w-full">
              <button 
                onClick={() => setActivePartnerCategoryId('all')} 
                className={`px-5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activePartnerCategoryId === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                全部单位 ({partners.length})
              </button>
              {partnerCategories.map(cat => (
                <button 
                  key={cat.id} 
                  onClick={() => setActivePartnerCategoryId(cat.id)} 
                  className={`px-5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${activePartnerCategoryId === cat.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {cat.name} ({partners.filter(p => p.categoryId === cat.id).length})
                </button>
              ))}
            </div>

            {/* 单位卡片网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPartners.map(p => {
                const category = partnerCategories.find(c => c.id === p.categoryId);
                const phoneFieldId = category?.customFields.find(f => f.label.includes('电话'))?.id;
                const phoneNumber = phoneFieldId ? p.customData?.[phoneFieldId] : null;

                return (
                  <div key={p.id} className="bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-2xl hover:border-indigo-400 transition-all group flex flex-col relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all shadow-inner">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => handleOpenPartner(p)} className="p-2 text-slate-300 hover:text-indigo-600 bg-slate-50 rounded-xl transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => onUpdatePartners(partners.filter(x => x.id !== p.id))} className="p-2 text-slate-300 hover:text-rose-600 bg-slate-50 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">{p.name}</h3>
                    <p className="text-[11px] text-slate-400 font-bold mb-4 flex items-center gap-1 uppercase tracking-tighter">
                      <Phone className="w-3 h-3 text-slate-300" /> {phoneNumber || '未登记电话'}
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                      <div className="px-2 py-1 bg-blue-50/50 rounded-lg text-[9px] font-bold text-blue-600 uppercase tracking-widest">{p.contact}</div>
                      {category && (
                        <div className={`px-2 py-1 bg-indigo-50 rounded-lg text-[9px] font-bold text-indigo-600 uppercase tracking-widest border border-indigo-100`}>
                          {category.name}
                        </div>
                      )}
                    </div>

                    {/* 自定义字段摘要展示 */}
                    {category && category.customFields.length > 0 && p.customData && (
                       <div className="mb-2 space-y-2 bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
                          {category.customFields.slice(0, 3).map(cf => (
                             <div key={cf.id} className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-400 font-bold uppercase">{cf.label}</span>
                                <span className="text-slate-700 font-black truncate max-w-[100px]">
                                  {typeof p.customData?.[cf.id] === 'boolean' ? (p.customData?.[cf.id] ? '是' : '否') : (p.customData?.[cf.id] || '-')}
                                </span>
                             </div>
                          ))}
                       </div>
                    )}

                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-end">
                      <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                );
              })}
              {filteredPartners.length === 0 && (
                <div className="col-span-full py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200">
                   <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-4 opacity-50" />
                   <p className="text-slate-400 font-medium italic">该分类下暂无单位数据</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'WORKERS' && !showModal && (
          <div className="space-y-8">
            {renderHeader('工人档案库', '追踪生产人员的技能分布与权限节点', () => handleOpenWorker(), '建立档案')}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {workers.filter(w => !searchTerm || w.name.includes(searchTerm)).map(w => (
                <div key={w.id} className="bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-2xl transition-all group flex flex-col relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner group-hover:scale-110 transition-transform">{w.name.charAt(0)}</div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => handleOpenWorker(w)} className="p-2 text-slate-300 hover:text-indigo-600 bg-slate-50 rounded-xl"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => onUpdateWorkers(workers.filter(x => x.id !== w.id))} className="p-2 text-slate-300 hover:text-rose-600 bg-slate-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{w.name}</h3>
                  <p className="text-[11px] text-slate-400 font-bold mb-4 flex items-center gap-1 uppercase tracking-tighter"><Briefcase className="w-3 h-3 text-slate-300" /> {w.group}</p>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {w.skills.map(s => <span key={s} className="px-2 py-1 bg-slate-50 text-slate-500 text-[9px] font-bold rounded-lg uppercase tracking-widest">{s}</span>)}
                  </div>
                  <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">权限节点: {w.assignedMilestoneIds?.length || 0} 个</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-200 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'EQUIPMENT' && !showModal && (
          <div className="space-y-8">
            {renderHeader('生产设备管理', '追踪车间机械设备、工装夹具及关联工序', () => handleOpenEq(), '新增设备')}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {equipment.filter(e => !searchTerm || e.name.includes(searchTerm)).map(e => (
                <div key={e.id} className="bg-white p-6 rounded-[32px] border border-slate-200 hover:shadow-2xl transition-all group flex flex-col">
                   <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all shadow-inner"><Cpu className="w-6 h-6" /></div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => handleOpenEq(e)} className="p-2 text-slate-300 hover:text-indigo-600 bg-slate-50 rounded-xl"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => onUpdateEquipment(equipment.filter(x => x.id !== e.id))} className="p-2 text-slate-300 hover:text-rose-600 bg-slate-50 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{e.name}</h3>
                  <p className="text-[11px] text-slate-400 font-bold mb-4 uppercase tracking-widest"><Hash className="w-3 h-3 inline mr-1" /> {e.code}</p>
                  <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Hammer className="w-3.5 h-3.5 text-blue-500" />
                       <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">支持工序: {e.assignedMilestoneIds?.length || 0} 节点</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'DICTIONARIES' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
            <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm p-8 space-y-8 flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div className="flex items-center gap-3">
                  <Palette className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 text-lg">款式颜色库</h3>
                </div>
                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{dictionaries.colors.length} 项</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar max-h-96 pr-2">
                <div className="grid grid-cols-2 gap-3">
                  {dictionaries.colors.map(c => (
                    <div key={c.id} className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-100 group">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-800">{c.name}</p>
                      </div>
                      <button onClick={() => onUpdateDictionaries({ ...dictionaries, colors: dictionaries.colors.filter(x => x.id !== c.id) })} className="opacity-0 group-hover:opacity-100 p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-6 border-t border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">快速新增颜色</h4>
                <div className="flex gap-3">
                  <input type="text" placeholder="颜色名称 (如: 曜石黑、珍珠白)" value={newColorName} onChange={e => setNewColorName(e.target.value)} className="flex-1 bg-slate-50 border-none rounded-xl py-2.5 px-4 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button onClick={handleAddColor} disabled={!newColorName.trim()} className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"><Plus className="w-5 h-5" /></button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm p-8 space-y-8 flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div className="flex items-center gap-3">
                  <Maximize2 className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800 text-lg">款式尺码库</h3>
                </div>
                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{dictionaries.sizes.length} 项</span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar max-h-96 pr-2">
                <div className="grid grid-cols-2 gap-3">
                  {dictionaries.sizes.map(s => (
                    <div key={s.id} className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-100 group">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-800">{s.name}</p>
                      </div>
                      <button onClick={() => onUpdateDictionaries({ ...dictionaries, sizes: dictionaries.sizes.filter(x => x.id !== s.id) })} className="opacity-0 group-hover:opacity-100 p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-6 border-t border-slate-50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">快速新增尺码</h4>
                <div className="flex gap-3">
                  <input type="text" placeholder="尺码代号 (如: XL, 42)" value={newSizeName} onChange={e => setNewSizeName(e.target.value)} className="flex-1 bg-slate-50 border-none rounded-xl py-2.5 px-4 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button onClick={handleAddSize} disabled={!newSizeName.trim()} className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"><Plus className="w-5 h-5" /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 合作单位编辑弹窗 */}
        {showModal === 'PARTNERS' && (
           <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
             <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
               <button onClick={() => setShowModal(null)} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
                 <ArrowLeft className="w-4 h-4" /> 返回列表
               </button>
               <button onClick={savePartner} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                 <Save className="w-4 h-4" /> 保存资料
               </button>
             </div>

             <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><Building2 className="w-5 h-5" /></div>
                  <h3 className="text-lg font-bold text-slate-800">单位基础档案</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单位名称</label>
                    <input type="text" value={editPartner.name} onChange={e => setEditPartner({...editPartner, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="公司或个人名称" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单位分类 (决定扩展字段)</label>
                    <select value={editPartner.categoryId} onChange={e => setEditPartner({...editPartner, categoryId: e.target.value, customData: {}})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                      <option value="">点击选择分类...</option>
                      {partnerCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">首要联系人</label>
                    <input type="text" value={editPartner.contact} onChange={e => setEditPartner({...editPartner, contact: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="业务对接人" />
                  </div>
                </div>

                {/* 动态渲染自定义扩展字段 */}
                {editPartner.categoryId && (
                  <div className="pt-8 border-t border-slate-50 space-y-6 animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3 mb-2">
                       <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shadow-sm"><Shapes className="w-5 h-5" /></div>
                       <div>
                          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">分类专属扩展信息</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">根据分类 [{partnerCategories.find(c=>c.id===editPartner.categoryId)?.name}] 动态加载</p>
                       </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                      {partnerCategories.find(c => c.id === editPartner.categoryId)?.customFields.map(field => (
                        <div key={field.id} className="space-y-1">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{field.label} {field.required && <span className="text-rose-500">*</span>}</label>
                           {field.type === 'text' && <input type="text" value={editPartner.customData?.[field.id] || ''} onChange={e => setEditPartner({...editPartner, customData: {...(editPartner.customData||{}), [field.id]: e.target.value}})} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" placeholder={field.placeholder || `请输入${field.label}`} />}
                           {field.type === 'number' && <input type="number" value={editPartner.customData?.[field.id] || ''} onChange={e => setEditPartner({...editPartner, customData: {...(editPartner.customData||{}), [field.id]: parseFloat(e.target.value)||0}})} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />}
                           {field.type === 'select' && (
                             <select value={editPartner.customData?.[field.id] || ''} onChange={e => setEditPartner({...editPartner, customData: {...(editPartner.customData||{}), [field.id]: e.target.value}})} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none shadow-sm h-[46px]">
                               <option value="">请选择...</option>
                               {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                             </select>
                           )}
                           {field.type === 'boolean' && (
                              <div className="flex items-center gap-3 h-[46px]">
                                <button onClick={() => setEditPartner({...editPartner, customData: {...(editPartner.customData||{}), [field.id]: !editPartner.customData?.[field.id]}})} className={`w-12 h-6 rounded-full relative transition-colors ${editPartner.customData?.[field.id] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${editPartner.customData?.[field.id] ? 'left-7' : 'left-1'}`}></div>
                                </button>
                                <span className="text-xs font-bold text-slate-500">{editPartner.customData?.[field.id] ? '是 (True)' : '否 (False)'}</span>
                              </div>
                           )}
                           {field.type === 'date' && <input type="date" value={editPartner.customData?.[field.id] || ''} onChange={e => setEditPartner({...editPartner, customData: {...(editPartner.customData||{}), [field.id]: e.target.value}})} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold outline-none shadow-sm" />}
                        </div>
                      ))}
                      {partnerCategories.find(c => c.id === editPartner.categoryId)?.customFields.length === 0 && (
                        <div className="col-span-full py-4 text-center text-[10px] text-slate-300 font-bold uppercase italic">该分类未定义任何扩展属性</div>
                      )}
                    </div>
                  </div>
                )}
             </div>
           </div>
        )}

        {(showModal === 'WORKERS' || showModal === 'EQUIPMENT') && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
             <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
               <button onClick={() => setShowModal(null)} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
                 <ArrowLeft className="w-4 h-4" /> 返回列表
               </button>
               <button onClick={showModal === 'WORKERS' ? saveWorker : saveEq} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                 <Save className="w-4 h-4" /> 保存档案
               </button>
             </div>
             <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
                {showModal === 'WORKERS' && (
                  <>
                    <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><Users className="w-5 h-5" /></div>
                      <h3 className="text-lg font-bold text-slate-800">工人基础资料</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">姓名</label>
                        <input type="text" value={editWorker.name} onChange={e => setEditWorker({...editWorker, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">班组</label>
                        <input type="text" value={editWorker.group} onChange={e => setEditWorker({...editWorker, group: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                      </div>
                    </div>
                    <div className="pt-6 space-y-6">
                       <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><ShieldAlert className="w-5 h-5" /></div>
                             <h3 className="text-lg font-bold text-slate-800">分配生产工序权限</h3>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">已分配 {(editWorker.assignedMilestoneIds || []).length} 节点</span>
                       </div>
                       <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {globalNodes.map(node => {
                            const isChecked = editWorker.assignedMilestoneIds?.includes(node.id);
                            return (
                              <button 
                                key={node.id} 
                                onClick={() => {
                                  const current = editWorker.assignedMilestoneIds || [];
                                  const updated = current.includes(node.id) ? current.filter(id => id !== node.id) : [...current, node.id];
                                  setEditWorker({ ...editWorker, assignedMilestoneIds: updated });
                                }} 
                                className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-50 text-slate-600 hover:border-indigo-200'}`}
                              >
                                <span className="text-xs font-bold">{node.name}</span>
                                {isChecked && <CheckCircle className="w-4 h-4 text-white" />}
                              </button>
                            );
                          })}
                       </div>
                    </div>
                  </>
                )}
                {showModal === 'EQUIPMENT' && (
                   <>
                    <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><Cpu className="w-5 h-5" /></div>
                      <h3 className="text-lg font-bold text-slate-800">设备基础信息</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">设备名称</label>
                        <input type="text" value={editEq.name} onChange={e => setEditEq({...editEq, name: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">设备代号</label>
                        <input type="text" value={editEq.code} onChange={e => setEditEq({...editEq, code: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                      </div>
                    </div>
                    <div className="pt-6 space-y-6">
                       <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><Hammer className="w-5 h-5" /></div>
                             <h3 className="text-lg font-bold text-slate-800">分配生产工序</h3>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">已选 {(editEq.assignedMilestoneIds || []).length} 节点</span>
                       </div>
                       <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {globalNodes.map(node => {
                            const isChecked = editEq.assignedMilestoneIds?.includes(node.id);
                            return (
                              <button 
                                key={node.id} 
                                onClick={() => {
                                  const current = editEq.assignedMilestoneIds || [];
                                  const updated = current.includes(node.id) ? current.filter(id => id !== node.id) : [...current, node.id];
                                  setEditEq({ ...editEq, assignedMilestoneIds: updated });
                                }} 
                                className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${isChecked ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-50 text-slate-600 hover:border-indigo-200'}`}
                              >
                                <span className="text-xs font-bold">{node.name}</span>
                                {isChecked && <CheckCircle className="w-4 h-4 text-white" />}
                              </button>
                            );
                          })}
                       </div>
                    </div>
                  </>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BasicInfoView;