import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Boxes, 
  Building2, 
  Cpu,
  ShieldCheck,
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  ArrowLeft,
  Save,
  Tag,
  Database,
  Shapes,
  Info,
  ListPlus,
  CheckCircle,
  Hammer,
  MapPin,
  Library,
  Palette,
  Maximize2,
  Package
} from 'lucide-react';
const ProductManagementView = lazy(() => import('./ProductManagementView'));
const MemberManagementView = lazy(() => import('./MemberManagementView'));

const BasicInfoPanelFallback = () => (
  <div className="flex min-h-[320px] items-center justify-center text-sm font-medium text-slate-400">
    加载中…
  </div>
);
import { Product, GlobalNodeTemplate, ProductCategory, BOM, AppDictionaries, Partner, Equipment, PartnerCategory, DictionaryItem } from '../types';
import { toast } from 'sonner';
import * as api from '../services/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAsyncSubmitLock } from '../hooks/useAsyncSubmitLock';
import {
  subModuleMainContentTopClass,
  subModuleTabBarBackdropClass,
  subModuleTabBarInsetClass,
  subModuleTabBarStickyPadClass,
  subModuleTabButtonClass,
  subModuleTabPillClass,
} from '../styles/uiDensity';
import { useSetMainScrollSegment } from '../contexts/MainScrollSegmentContext';

interface BasicInfoViewProps {
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  boms: BOM[];
  equipment: Equipment[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  onUpdateProduct: (product: Product) => Promise<boolean>;
  onDeleteProduct: (id: string) => Promise<boolean>;
  onUpdateBOM: (bom: BOM) => Promise<boolean>;
  onRefreshDictionaries: () => Promise<void>;
  onRefreshWorkers: () => Promise<void>;
  onRefreshEquipment: () => Promise<void>;
  onRefreshPartners: () => Promise<void>;
  onRefreshPartnerCategories: () => Promise<void>;
  onRefreshProducts?: () => Promise<void>;
  tenantId: string;
  tenantRole: string;
  currentUserId: string;
  userPermissions?: string[];
}

const TAB_PERM_MAP: Record<string, string> = {
  PRODUCTS: 'basic:products',
  PARTNERS: 'basic:partners',
  MEMBERS: 'basic:members',
  EQUIPMENT: 'basic:equipment',
  DICTIONARIES: 'basic:dictionaries',
};

type BasicTab = 'PRODUCTS' | 'PARTNERS' | 'MEMBERS' | 'EQUIPMENT' | 'DICTIONARIES';

const BasicInfoView: React.FC<BasicInfoViewProps> = ({
  products, globalNodes, categories, partnerCategories, boms, equipment, dictionaries, partners,
  onUpdateProduct, onDeleteProduct, onUpdateBOM, onRefreshDictionaries, onRefreshWorkers, onRefreshEquipment, onRefreshPartners,
  onRefreshProducts, tenantId, tenantRole, currentUserId, userPermissions
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

  const location = useLocation();
  const navigate = useNavigate();
  const locState = location.state as { editProductId?: string } | null;

  const [activeTab, setActiveTab] = useState<BasicTab>(locState?.editProductId ? 'PRODUCTS' : 'PRODUCTS');
  const setScrollSegment = useSetMainScrollSegment();
  useLayoutEffect(() => {
    setScrollSegment?.(activeTab);
  }, [activeTab, setScrollSegment]);

  const [initialProductId, setInitialProductId] = useState<string | null>(locState?.editProductId ?? null);
  const clearInitialProductId = useCallback(() => {
    setInitialProductId(null);
    if (locState?.editProductId) navigate(location.pathname, { replace: true, state: {} });
  }, [locState?.editProductId, navigate, location.pathname]);

  /** 设备管理：按工序分类，null = 全部，'UNASSIGNED' = 未分配 */
  const [equipmentNodeId, setEquipmentNodeId] = useState<string | null>(null);
  const EQUIPMENT_UNASSIGNED = 'UNASSIGNED';

  // --- 合作单位视图特有状态 ---
  const [activePartnerCategoryId, setActivePartnerCategoryId] = useState<string>(partnerCategories[0]?.id || 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm);

  // --- 弹窗与编辑状态 ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<BasicTab | null>(null);

  // 临时编辑数据
  const [editPartner, setEditPartner] = useState<Partial<Partner>>({});
  const [editEq, setEditEq] = useState<Partial<Equipment>>({});

  const [dictEditingId, setDictEditingId] = useState<string | null>(null);
  const [dictAddType, setDictAddType] = useState<'color' | 'size' | 'unit'>('color');
  const [dictAddName, setDictAddName] = useState('');
  /** 色值 / 编码等；为空保存时用名称填充 */
  const [dictAddValue, setDictAddValue] = useState('');
  const dictSubmit = useAsyncSubmitLock();
  const partnerSubmit = useAsyncSubmitLock();
  const eqSubmit = useAsyncSubmitLock();
  /** 公共字典列表：类型筛选（与合作单位分类条同级） */
  const [activeDictKindFilter, setActiveDictKindFilter] = useState<'all' | 'color' | 'size' | 'unit'>('all');
  const [productDetailVisible, setProductDetailVisible] = useState(false);
  const [membersTabMounted, setMembersTabMounted] = useState(false);

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
    if (productDetailVisible) {
      setIsStuck(false);
      setBarStyle(null);
      return;
    }
    const sentinel = sentinelRef.current;
    const scrollParent = sentinel?.closest('[class*="overflow-auto"]');
    if (!sentinel || !scrollParent) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { root: scrollParent, rootMargin: '0px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [productDetailVisible]);

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


  const units = dictionaries.units ?? [];

  const closeDictionaryModal = () => {
    setShowModal(null);
    setDictEditingId(null);
    setDictAddValue('');
  };

  const handleOpenDictionaryAdd = () => {
    setDictEditingId(null);
    setDictAddType('color');
    setDictAddName('');
    setDictAddValue('');
    setShowModal('DICTIONARIES');
  };

  const handleOpenDictionaryEdit = (row: { id: string; kind: 'color' | 'size' | 'unit'; name: string; value: string }) => {
    setDictEditingId(row.id);
    setDictAddType(row.kind);
    setDictAddName(row.name);
    setDictAddValue(row.value && row.value !== row.name ? row.value : '');
    setShowModal('DICTIONARIES');
  };

  const saveDictionaryItem = async () => {
    const val = dictAddName.trim();
    if (!val) {
      toast.warning('请填写名称');
      return;
    }
    const valuePayload = dictAddValue.trim() || val;
    const typeLabel = dictAddType === 'color' ? '颜色' : dictAddType === 'size' ? '尺码' : '单位';

    if (dictEditingId) {
      const dupColor = dictAddType === 'color' && dictionaries.colors.some(c => c.id !== dictEditingId && c.name === val);
      const dupSize = dictAddType === 'size' && dictionaries.sizes.some(s => s.id !== dictEditingId && s.name === val);
      const dupUnit = dictAddType === 'unit' && units.some(u => u.id !== dictEditingId && u.name === val);
      if (dupColor || dupSize || dupUnit) {
        toast.warning(`${typeLabel}「${val}」已存在`);
        return;
      }
      await dictSubmit.run(async () => {
        try {
          await api.dictionaries.update(dictEditingId, { name: val, value: valuePayload });
          setDictAddName('');
          setDictAddValue('');
          closeDictionaryModal();
          await onRefreshDictionaries();
          toast.success('已保存');
        } catch (err: any) {
          toast.error(err.message || '操作失败');
        }
      });
      return;
    }

    if (dictAddType === 'color' && dictionaries.colors.some(c => c.name === val)) {
      toast.warning(`${typeLabel}「${val}」已存在`);
      return;
    }
    if (dictAddType === 'size' && dictionaries.sizes.some(s => s.name === val)) {
      toast.warning(`${typeLabel}「${val}」已存在`);
      return;
    }
    if (dictAddType === 'unit' && units.some(u => u.name === val)) {
      toast.warning(`${typeLabel}「${val}」已存在`);
      return;
    }
    await dictSubmit.run(async () => {
      try {
        await api.dictionaries.create({ type: dictAddType, name: val, value: valuePayload });
        setDictAddName('');
        setDictAddValue('');
        closeDictionaryModal();
        await onRefreshDictionaries();
        toast.success('已添加');
      } catch (err: any) {
        toast.error(err.message || '操作失败');
      }
    });
  };

  const handleDeleteDictionary = async (id: string) => {
    try {
      await api.dictionaries.delete(id);
      await onRefreshDictionaries();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  type DictRow = { id: string; kind: 'color' | 'size' | 'unit'; name: string; value: string };

  const filteredDictionaryRows = useMemo(() => {
    const rows: DictRow[] = [
      ...dictionaries.colors.map(c => ({ id: c.id, kind: 'color' as const, name: c.name, value: c.value ?? '' })),
      ...dictionaries.sizes.map(s => ({ id: s.id, kind: 'size' as const, name: s.name, value: s.value ?? '' })),
      ...units.map(u => ({ id: u.id, kind: 'unit' as const, name: u.name, value: u.value ?? '' })),
    ];
    const byKind =
      activeDictKindFilter === 'all' ? rows : rows.filter(r => r.kind === activeDictKindFilter);
    const t = debouncedSearchTerm.trim().toLowerCase();
    const bySearch =
      !t
        ? byKind
        : byKind.filter(
            r => r.name.toLowerCase().includes(t) || (r.value && r.value.toLowerCase().includes(t)),
          );
    const kindOrder = { color: 0, size: 1, unit: 2 };
    return [...bySearch].sort((a, b) => {
      const d = kindOrder[a.kind] - kindOrder[b.kind];
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [dictionaries.colors, dictionaries.sizes, units, activeDictKindFilter, debouncedSearchTerm]);

  const dictTotalCount =
    dictionaries.colors.length + dictionaries.sizes.length + units.length;

  const allTabs = [
    { id: 'PRODUCTS', label: '产品与 BOM', icon: Boxes },
    { id: 'PARTNERS', label: '合作单位', icon: Building2 },
    { id: 'MEMBERS', label: '成员管理', icon: ShieldCheck },
    { id: 'EQUIPMENT', label: '设备管理', icon: Cpu },
    { id: 'DICTIONARIES', label: '公共数据字典', icon: Library },
  ];
  const tabs = allTabs.filter(t => canView(t.id));

  // --- 过滤逻辑：合作单位 ---
  const filteredPartners = useMemo(() => {
    return partners.filter(p => {
      const matchesCategory = activePartnerCategoryId === 'all' || p.categoryId === activePartnerCategoryId;
      const term = debouncedSearchTerm.toLowerCase();
      const matchesSearch = p.name.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [partners, activePartnerCategoryId, debouncedSearchTerm]);

  const filteredEquipment = useMemo(() => {
    const byNode = equipment.filter(e => {
      if (equipmentNodeId == null) return true;
      if (equipmentNodeId === EQUIPMENT_UNASSIGNED) return !e.assignedMilestoneIds?.length;
      return e.assignedMilestoneIds?.includes(equipmentNodeId);
    });
    const t = searchTerm.trim().toLowerCase();
    if (!t) return byNode;
    return byNode.filter(
      e => e.name.toLowerCase().includes(t) || (e.code || '').toLowerCase().includes(t),
    );
  }, [equipment, equipmentNodeId, searchTerm]);

  // --- 操作处理器 ---
  const handleOpenPartner = (p?: Partner) => {
    setEditPartner(p || { 
      name: '', 
      categoryId: activePartnerCategoryId !== 'all' ? activePartnerCategoryId : '', 
      contact: '', 
      customData: {},
    });
    setEditingId(p?.id || null);
    setShowModal('PARTNERS');
  };

  const savePartner = async () => {
    if (!editPartner.name?.trim()) {
      toast.warning('请填写单位名称');
      return;
    }
    if (!editingId && !editPartner.categoryId) {
      toast.warning('请选择单位分类');
      return;
    }
    await partnerSubmit.run(async () => {
      try {
        if (editingId) {
          if (editPartner.partnerListNo == null || editPartner.partnerListNo < 1) {
            toast.error('请填写有效的单位编号（1–9999）');
            return;
          }
          await api.partners.update(editingId, editPartner);
        } else {
          const { partnerListNo: _n, ...createPayload } = editPartner;
          await api.partners.create(createPayload);
        }
        setShowModal(null);
        await onRefreshPartners();
      } catch (err: any) {
        toast.error(err.message || '操作失败');
      }
    });
  };

  const handleOpenEq = (e?: Equipment) => {
    setEditEq(e || { name: '', code: '', assignedMilestoneIds: [] });
    setEditingId(e?.id || null);
    setShowModal('EQUIPMENT');
  };

  const saveEq = async () => {
    if (!editEq.name?.trim()) {
      toast.warning('请填写设备名称');
      return;
    }
    await eqSubmit.run(async () => {
      try {
        if (editingId) {
          await api.equipment.update(editingId, editEq);
        } else {
          await api.equipment.create(editEq);
        }
        setShowModal(null);
        await onRefreshEquipment();
      } catch (err: any) {
        toast.error(err.message || '操作失败');
      }
    });
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
            placeholder="检索单位名称..." 
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

  const showTabs = !productDetailVisible;

  return (
    <div className="space-y-0">
      {showTabs && (
        <>
          <div>
            <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
            <div
              ref={tabsWrapRef}
              className={`${subModuleTabBarBackdropClass} ${
                isStuck
                  ? `fixed top-0 px-12 ${subModuleTabBarStickyPadClass}`
                  : subModuleTabBarInsetClass
              }`}
              style={isStuck && barStyle ? { left: barStyle.left, width: barStyle.width } : undefined}
            >
              <div className={subModuleTabPillClass}>
                <div className="flex gap-1 min-w-max">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { const t = tab.id as BasicTab; setActiveTab(t); setSearchTerm(''); setShowModal(null); if (t === 'MEMBERS') setMembersTabMounted(true); }}
                      className={subModuleTabButtonClass(activeTab === tab.id)}
                    >
                      <tab.icon className={`w-4 h-4 shrink-0 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-300'}`} />
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
      <div className={showTabs ? subModuleMainContentTopClass : undefined}>
        {activeTab === 'PRODUCTS' && (
          <Suspense fallback={<BasicInfoPanelFallback />}>
          <ProductManagementView products={products} globalNodes={globalNodes} categories={categories} boms={boms} dictionaries={dictionaries} partners={partners} partnerCategories={partnerCategories} onUpdateProduct={onUpdateProduct} onDeleteProduct={onDeleteProduct} onUpdateBOM={onUpdateBOM} onRefreshDictionaries={onRefreshDictionaries} onRefreshProducts={onRefreshProducts} onDetailViewChange={setProductDetailVisible} permCanCreate={canCreate('PRODUCTS')} permCanEdit={canEdit('PRODUCTS')} permCanDelete={canDelete('PRODUCTS')} initialProductId={initialProductId} onClearInitialProductId={clearInitialProductId} />
          </Suspense>
        )}

        {activeTab === 'PARTNERS' && !showModal && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">合作单位中心</h1>
                <p className="text-slate-500 mt-1 text-sm leading-snug max-w-xl">分类管理外部单位档案及自定义扩展信息</p>
              </div>
              {canCreate('PARTNERS') && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenPartner()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
                  >
                    <Plus className="w-4 h-4 shrink-0" /> 新增单位
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setActivePartnerCategoryId('all')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activePartnerCategoryId === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    全部单位 ({partners.length})
                  </button>
                  {partnerCategories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActivePartnerCategoryId(cat.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activePartnerCategoryId === cat.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {cat.name} ({partners.filter(p => p.categoryId === cat.id).length})
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:max-w-sm sm:shrink-0">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="检索单位名称…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none shadow-sm"
                    aria-label="检索合作单位"
                  />
                  {searchTerm.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                      aria-label="清空搜索"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {filteredPartners.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                  <Building2 className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">
                    {searchTerm.trim() ? '未找到匹配的单位' : '该分类下暂无单位数据'}
                  </p>
                  {searchTerm.trim() !== '' && (
                    <button type="button" onClick={() => setSearchTerm('')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                      清空搜索条件
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 pl-4 pr-2 w-12"></th>
                        <th className="py-3 px-2 w-[4.5rem] text-center">编号</th>
                        <th className="py-3 px-3">单位名称</th>
                        <th className="py-3 px-3 hidden sm:table-cell">联系人</th>
                        <th className="py-3 px-3 hidden md:table-cell">电话</th>
                        <th className="py-3 px-3 hidden lg:table-cell">分类</th>
                        <th className="py-3 px-3 hidden xl:table-cell text-center">协作</th>
                        <th className="py-3 pr-4 pl-2 text-right w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPartners.map(p => {
                        const category = partnerCategories.find(c => c.id === p.categoryId);
                        const phoneFieldId = category?.customFields.find(f => f.label.includes('电话'))?.id;
                        const phoneNumber = phoneFieldId ? p.customData?.[phoneFieldId] : null;
                        const phoneDisplay = phoneNumber != null && String(phoneNumber).trim() !== '' ? String(phoneNumber) : '—';
                        return (
                          <tr
                            key={p.id}
                            className={`group hover:bg-indigo-50/40 transition-colors ${canEdit('PARTNERS') ? 'cursor-pointer' : ''}`}
                            onClick={() => canEdit('PARTNERS') && handleOpenPartner(p)}
                          >
                            <td className="py-3 pl-4 pr-2">
                              <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                <Building2 className="w-4 h-4" />
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                                {p.partnerListNo != null ? String(p.partnerListNo).padStart(4, '0') : '—'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-[200px]">{p.name}</p>
                              <p className="sm:hidden text-[10px] text-slate-400 font-medium mt-0.5 truncate">{p.contact || '—'}</p>
                            </td>
                            <td className="py-3 px-3 hidden sm:table-cell">
                              <span className="text-xs text-slate-600 font-medium">{p.contact || '—'}</span>
                            </td>
                            <td className="py-3 px-3 hidden md:table-cell">
                              <span className="text-xs text-slate-500 font-medium">{phoneDisplay}</span>
                            </td>
                            <td className="py-3 px-3 hidden lg:table-cell">
                              {category ? (
                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-indigo-600">{category.name}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 hidden xl:table-cell text-center">
                              {p.collaborationTenantId ? (
                                <span className="text-[10px] font-bold text-emerald-600">已关联</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 pl-2 text-right">
                              <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                                {canEdit('PARTNERS') && (
                                  <button type="button" onClick={() => handleOpenPartner(p)} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" aria-label="编辑">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete('PARTNERS') && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await api.partners.delete(p.id);
                                        await onRefreshPartners();
                                      } catch (err: any) {
                                        toast.error(err.message || '删除失败');
                                      }
                                    }}
                                    className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    aria-label="删除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {membersTabMounted && (
          <div style={{ display: activeTab === 'MEMBERS' ? undefined : 'none' }}>
            <Suspense fallback={<BasicInfoPanelFallback />}>
            <MemberManagementView tenantId={tenantId} tenantRole={tenantRole} currentUserId={currentUserId} globalNodes={globalNodes} onRefreshWorkers={onRefreshWorkers} />
            </Suspense>
          </div>
        )}

        {activeTab === 'EQUIPMENT' && !showModal && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">生产设备管理</h1>
                <p className="text-slate-500 mt-1 text-sm leading-snug max-w-xl">追踪车间机械设备、工装夹具及关联工序</p>
              </div>
              {canCreate('EQUIPMENT') && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenEq()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
                  >
                    <Plus className="w-4 h-4 shrink-0" /> 新增设备
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
                  <button
                    type="button"
                    onClick={() => setEquipmentNodeId(null)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${equipmentNodeId === null ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    全部 ({equipment.length})
                  </button>
                  {(() => {
                    const unassignedCount = equipment.filter(eq => !eq.assignedMilestoneIds?.length).length;
                    return unassignedCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => setEquipmentNodeId(EQUIPMENT_UNASSIGNED)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${equipmentNodeId === EQUIPMENT_UNASSIGNED ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        未分配 ({unassignedCount})
                      </button>
                    ) : null;
                  })()}
                  {globalNodes.map(n => {
                    const count = equipment.filter(eq => eq.assignedMilestoneIds?.includes(n.id)).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setEquipmentNodeId(n.id)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${equipmentNodeId === n.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {n.name} ({count})
                      </button>
                    );
                  })}
                </div>
                <div className="relative w-full sm:max-w-sm sm:shrink-0">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="搜索设备名称、编号…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none shadow-sm"
                    aria-label="搜索设备"
                  />
                  {searchTerm.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                      aria-label="清空搜索"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {filteredEquipment.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                  <Cpu className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">
                    {searchTerm.trim() ? '未找到匹配的设备' : '当前筛选下暂无设备'}
                  </p>
                  {searchTerm.trim() !== '' && (
                    <button type="button" onClick={() => setSearchTerm('')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                      清空搜索条件
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 pl-4 pr-2 w-12"></th>
                        <th className="py-3 px-3">设备名称</th>
                        <th className="py-3 px-3 hidden sm:table-cell">编号</th>
                        <th className="py-3 px-3 hidden md:table-cell">关联工序</th>
                        <th className="py-3 pr-4 pl-2 text-right w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEquipment.map(e => {
                        const ids = e.assignedMilestoneIds ?? [];
                        const nodeNames = ids
                          .map(id => globalNodes.find(g => g.id === id)?.name)
                          .filter((n): n is string => Boolean(n));
                        const nodeSummary =
                          nodeNames.length === 0
                            ? '未分配'
                            : nodeNames.length <= 2
                              ? nodeNames.join('、')
                              : `${nodeNames.slice(0, 2).join('、')} 等 ${nodeNames.length} 个`;
                        return (
                          <tr
                            key={e.id}
                            className={`group hover:bg-indigo-50/40 transition-colors ${canEdit('EQUIPMENT') ? 'cursor-pointer' : ''}`}
                            onClick={() => canEdit('EQUIPMENT') && handleOpenEq(e)}
                          >
                            <td className="py-3 pl-4 pr-2">
                              <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                <Cpu className="w-4 h-4" />
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-[200px]">{e.name}</p>
                              <p className="sm:hidden text-[10px] text-slate-400 font-medium mt-0.5 font-mono truncate">{e.code || '—'}</p>
                            </td>
                            <td className="py-3 px-3 hidden sm:table-cell">
                              <span className="text-xs text-slate-500 font-mono font-medium">{e.code || '—'}</span>
                            </td>
                            <td className="py-3 px-3 hidden md:table-cell">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Hammer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="text-xs text-blue-700 font-bold tabular-nums shrink-0">{ids.length}</span>
                                <span className="text-xs text-slate-500 truncate" title={nodeNames.join('、')}>
                                  {nodeSummary}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 pl-2 text-right">
                              <div className="flex items-center justify-end gap-0.5" onClick={ev => ev.stopPropagation()}>
                                {canEdit('EQUIPMENT') && (
                                  <button type="button" onClick={() => handleOpenEq(e)} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" aria-label="编辑">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete('EQUIPMENT') && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await api.equipment.delete(e.id);
                                        await onRefreshEquipment();
                                      } catch (err: any) {
                                        toast.error(err.message || '删除失败');
                                      }
                                    }}
                                    className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    aria-label="删除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'DICTIONARIES' && !showModal && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">公共数据字典</h1>
                <p className="text-slate-500 mt-1 text-sm leading-snug max-w-xl">维护颜色、尺码与产品计量单位，供产品与单据引用</p>
              </div>
              {canCreate('DICTIONARIES') && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleOpenDictionaryAdd}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
                  >
                    <Plus className="w-4 h-4 shrink-0" /> 新增
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setActiveDictKindFilter('all')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeDictKindFilter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    全部 ({dictTotalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDictKindFilter('color')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeDictKindFilter === 'color' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    颜色 ({dictionaries.colors.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDictKindFilter('size')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeDictKindFilter === 'size' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    尺码 ({dictionaries.sizes.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDictKindFilter('unit')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeDictKindFilter === 'unit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    产品单位 ({units.length})
                  </button>
                </div>
                <div className="relative w-full sm:max-w-sm sm:shrink-0">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="搜索名称…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none shadow-sm"
                    aria-label="搜索字典项"
                  />
                  {searchTerm.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                      aria-label="清空搜索"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {searchTerm.trim() !== '' && filteredDictionaryRows.length > 0 && (
                <p className="text-xs font-bold text-slate-500">
                  找到 <span className="text-indigo-600 tabular-nums">{filteredDictionaryRows.length}</span> 条
                </p>
              )}

              {filteredDictionaryRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
                  <Library className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-600">
                    {searchTerm.trim() ? '未找到匹配的字典项' : '当前筛选下暂无数据'}
                  </p>
                  {searchTerm.trim() !== '' && (
                    <button type="button" onClick={() => setSearchTerm('')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                      清空搜索条件
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 pl-4 pr-2 w-12"></th>
                        <th className="py-3 px-3 hidden sm:table-cell">类型</th>
                        <th className="py-3 px-3">名称</th>
                        <th className="py-3 pr-4 pl-2 text-right min-w-[5.5rem]">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDictionaryRows.map(row => {
                        const kindLabel =
                          row.kind === 'color' ? '颜色' : row.kind === 'size' ? '尺码' : '产品单位';
                        const KindIcon = row.kind === 'color' ? Palette : row.kind === 'size' ? Maximize2 : Package;
                        const vTrim = String(row.value || '').trim();
                        const isHexColor =
                          row.kind === 'color' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(vTrim);
                        return (
                          <tr
                            key={`${row.kind}-${row.id}`}
                            className={`group hover:bg-indigo-50/40 transition-colors ${canEdit('DICTIONARIES') ? 'cursor-pointer' : ''}`}
                            onClick={() => canEdit('DICTIONARIES') && handleOpenDictionaryEdit(row)}
                          >
                            <td className="py-3 pl-4 pr-2">
                              <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors overflow-hidden">
                                {isHexColor ? (
                                  <span
                                    className="w-full h-full block border border-slate-200"
                                    style={{ backgroundColor: vTrim }}
                                    title={vTrim}
                                  />
                                ) : (
                                  <KindIcon className="w-4 h-4" />
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 hidden sm:table-cell">
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-indigo-600">{kindLabel}</span>
                            </td>
                            <td className="py-3 px-3">
                              <p className={`text-sm font-bold text-slate-800 truncate max-w-[200px] ${canEdit('DICTIONARIES') ? 'group-hover:text-indigo-600 transition-colors' : ''}`}>
                                {row.name}
                              </p>
                              <p className="sm:hidden text-[10px] text-slate-400 font-bold mt-0.5">{kindLabel}</p>
                            </td>
                            <td className="py-3 pr-4 pl-2 text-right">
                              <div className="flex items-center justify-end gap-0.5" onClick={ev => ev.stopPropagation()}>
                                {canEdit('DICTIONARIES') && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDictionaryEdit(row)}
                                    className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex"
                                    aria-label="编辑"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {canDelete('DICTIONARIES') && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDictionary(row.id)}
                                    className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                                    aria-label="删除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {showModal === 'DICTIONARIES' && activeTab === 'DICTIONARIES' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
            <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
              <button type="button" onClick={closeDictionaryModal} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
                <ArrowLeft className="w-4 h-4" /> 返回列表
              </button>
              <button
                type="button"
                onClick={saveDictionaryItem}
                disabled={dictSubmit.busy || !dictAddName.trim()}
                className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> {dictSubmit.busy ? '保存中…' : '保存'}
              </button>
            </div>

            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                  <Library className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">{dictEditingId ? '编辑字典项' : '新增字典项'}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">字典类型</label>
                  <select
                    value={dictAddType}
                    onChange={e => setDictAddType(e.target.value as 'color' | 'size' | 'unit')}
                    disabled={!!dictEditingId}
                    className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="color">颜色</option>
                    <option value="size">尺码</option>
                    <option value="unit">产品单位</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">名称</label>
                  <input
                    type="text"
                    value={dictAddName}
                    onChange={e => setDictAddName(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]"
                    placeholder={dictAddType === 'color' ? '如：曜石黑、珍珠白' : dictAddType === 'size' ? '如：XL、42' : '如：PCS、公斤'}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                    色值 / 编码（可选，留空则与名称相同）
                  </label>
                  <input
                    type="text"
                    value={dictAddValue}
                    onChange={e => setDictAddValue(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px] font-mono text-sm"
                    placeholder={dictAddType === 'color' ? '如 #1a1a1a（十六进制色值）' : '如内部编码，可与名称不同'}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 合作单位编辑弹窗 */}
        {showModal === 'PARTNERS' && activeTab === 'PARTNERS' && (
           <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
             <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
               <button onClick={() => setShowModal(null)} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
                 <ArrowLeft className="w-4 h-4" /> 返回列表
               </button>
               <button
                 type="button"
                 onClick={() => void savePartner()}
                 disabled={partnerSubmit.busy}
                 className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Save className="w-4 h-4" /> {partnerSubmit.busy ? '保存中…' : '保存资料'}
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
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单位编号（销售单 XS-0001-xxx）</label>
                    {editingId ? (
                      <>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          value={editPartner.partnerListNo ?? ''}
                          onChange={e => {
                            const v = e.target.value;
                            setEditPartner({
                              ...editPartner,
                              partnerListNo: v === '' ? undefined : Math.min(9999, Math.max(1, parseInt(v, 10) || 1)),
                            });
                          }}
                          className="w-full max-w-[200px] bg-slate-50 border-none rounded-xl py-3 px-4 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px] tabular-nums"
                        />
                        <p className="text-[10px] text-slate-400 font-medium mt-1 ml-1">租户内唯一；中间四位与流水共同组成单号，勿与其他单位重复</p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-slate-500 py-3">保存后按创建顺序自动分配（0001 起）</p>
                    )}
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

        {showModal === 'EQUIPMENT' && activeTab === 'EQUIPMENT' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
             <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
               <button onClick={() => setShowModal(null)} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
                 <ArrowLeft className="w-4 h-4" /> 返回列表
               </button>
               <button
                 type="button"
                 onClick={() => void saveEq()}
                 disabled={eqSubmit.busy}
                 className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Save className="w-4 h-4" /> {eqSubmit.busy ? '保存中…' : '保存档案'}
               </button>
             </div>
             <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
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

export default React.memo(BasicInfoView);