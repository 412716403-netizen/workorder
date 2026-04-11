import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Clock, DollarSign, Search, ChevronDown, Building2, User, FileText, Pencil, Trash2 } from 'lucide-react';
import { FinanceRecord, FinanceOpType, ProductionOrder, FinanceCategory, FinanceAccountType, Partner, Worker, Product, ReportFieldDefinition, PartnerCategory, ProductCategory, GlobalNodeTemplate, AppDictionaries, FINANCE_DOC_NO_PREFIX, ProductMilestoneProgress } from '../types';
import { SearchableProductSelect } from '../components/SearchableProductSelect';
import { SearchablePartnerSelect } from '../components/SearchablePartnerSelect';
import type { ProductionOpRecord } from '../types';
import { moduleHeaderRowClass, pageSubtitleClass, pageTitleClass, primaryToolbarButtonClass } from '../styles/uiDensity';
import { useConfirm } from '../contexts/ConfirmContext';
import { toLocalCompactYmd, toLocalDateYmd } from '../utils/localDateTime';
import { productHasColorSizeMatrix } from '../utils/productColorSize';

function CustomFieldInput({ field, value, onChange }: { field: ReportFieldDefinition; value: any; onChange: (v: any) => void }) {
  const v = value ?? '';
  if (field.type === 'number') {
    return (
      <input type="number" placeholder={field.placeholder} value={v} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
    );
  }
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!v} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded text-indigo-600" />
        <span className="text-sm font-bold text-slate-700">{field.label}</span>
      </label>
    );
  }
  if (field.type === 'date') {
    return (
      <input type="date" value={typeof v === 'string' ? v : ''} onChange={e => onChange(e.target.value || undefined)} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
    );
  }
  if (field.type === 'select') {
    return (
      <select value={v} onChange={e => onChange(e.target.value)} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
        <option value="">请选择...</option>
        {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  return (
    <input type="text" placeholder={field.placeholder} value={v} onChange={e => onChange(e.target.value)} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
  );
}

// 关联工单：模糊搜索（工单号、商品名称、商品编号）
function OrderSearchSelect({ orders, products, value, onChange, label }: { orders: ProductionOrder[]; products: Product[]; value: string; onChange: (orderNumber: string) => void; label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const pMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const options = useMemo(() => [
    ...orders.map(o => ({ id: o.id, orderNumber: o.orderNumber, productName: o.productName, productId: o.productId })),
    { id: 'General-Wages', orderNumber: 'General-Wages', productName: '通用生产补贴/奖金', productId: '' }
  ], [orders]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => {
      const sku = o.productId ? (pMap.get(o.productId)?.sku ?? '') : '';
      return o.orderNumber.toLowerCase().includes(s) || (o.productName || '').toLowerCase().includes(s) || sku.toLowerCase().includes(s);
    });
  }, [options, pMap, search]);
  const selected = options.find(o => o.orderNumber === value);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between h-[52px]">
        <span className={value ? 'text-slate-900 truncate' : 'text-slate-400'}>{selected ? `${selected.orderNumber} - ${selected.productName}` : '搜索工单号、商品名称或编号...'}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : 'text-slate-400'}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[100] mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95">
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input autoFocus type="text" className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="搜索工单号、商品名称、商品编号..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-1">
            {filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.orderNumber); setIsOpen(false); setSearch(''); }} className={`w-full text-left p-3 rounded-xl transition-all border-2 ${o.orderNumber === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}>
                <p className="text-sm font-bold truncate">{o.orderNumber} - {o.productName}</p>
                {o.productId && <p className="text-[10px] text-slate-400 mt-0.5">{pMap.get(o.productId)?.sku ?? ''}</p>}
              </button>
            ))}
            {filtered.length === 0 && <p className="py-6 text-center text-slate-400 text-sm">未找到匹配工单</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// 关联工人：按工序分类、可搜索（参照合作单位按标签分类）
function WorkerSelectWithTabs({ workers, processNodes, value, onChange, label, compact }: { workers: Worker[]; processNodes: GlobalNodeTemplate[]; value: string; onChange: (id: string) => void; label: string; compact?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const UNASSIGNED = 'UNASSIGNED';
  const visibleNodes = useMemo(() => processNodes.filter(n => workers.some(w => w.assignedMilestoneIds?.includes(n.id))), [processNodes, workers]);
  const filteredByTab = useMemo(() => {
    if (activeTab === 'all') return workers;
    if (activeTab === UNASSIGNED) return workers.filter(w => !w.assignedMilestoneIds?.length);
    return workers.filter(w => w.assignedMilestoneIds?.includes(activeTab));
  }, [workers, activeTab]);
  const filtered = useMemo(() => filteredByTab.filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || (w.groupName || '').toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)), [filteredByTab, search]);
  const selected = workers.find(w => w.id === value);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const dropdown = (
    <div className={compact ? 'absolute top-full left-0 mt-2 min-w-[300px] w-[300px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95' : 'absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95'}>
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input autoFocus type="text" className="w-full min-w-0 bg-slate-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="搜索工人姓名..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">按工序分类</p>
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1">
        <button type="button" onClick={() => setActiveTab('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>全部</button>
        {workers.filter(w => !w.assignedMilestoneIds?.length).length > 0 && (
          <button type="button" onClick={() => setActiveTab(UNASSIGNED)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === UNASSIGNED ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>未分配</button>
        )}
        {visibleNodes.map(n => (
          <button key={n.id} type="button" onClick={() => setActiveTab(n.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === n.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{n.name}</button>
        ))}
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1">
        {filtered.map(w => (
          <button key={w.id} type="button" onClick={() => { onChange(w.id); setIsOpen(false); setSearch(''); }} className={`w-full text-left p-3 rounded-xl transition-all border-2 ${w.id === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}>
            <p className="text-sm font-bold truncate">{w.name}</p>
            {w.groupName && <p className="text-[10px] text-slate-400 mt-0.5">{w.groupName}</p>}
          </button>
        ))}
        {filtered.length === 0 && <p className="py-6 text-center text-slate-400 text-sm">未找到匹配工人</p>}
      </div>
    </div>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-2 relative" ref={containerRef}>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white border border-slate-200 rounded-xl py-2 pl-3 pr-8 min-w-[120px] text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 transition-all hover:border-slate-300"
        >
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <User className={`w-3.5 h-3.5 flex-shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
            <span className={value ? 'text-slate-800 truncate' : 'text-slate-400'}>{selected ? selected.name : '请选择工人'}</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && dropdown}
      </div>
    );
  }
  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between h-[52px]">
        <div className="flex items-center gap-2 truncate">
          <User className={`w-4 h-4 flex-shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={value ? 'text-slate-900 truncate' : 'text-slate-400'}>{selected ? selected.name : '搜索并选择工人...'}</span>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : 'text-slate-400'}`} />
      </button>
      {isOpen && dropdown}
    </div>
  );
}

interface FinanceOpsViewProps {
  type: FinanceOpType;
  orders: ProductionOrder[];
  records: FinanceRecord[];
  /** 全部收付款记录，用于按类型+日期生成单据编号 */
  allRecords: FinanceRecord[];
  /** 进销存记录（采购单、销售单等），用于合作单位对账汇总 */
  psiRecords?: any[];
  /** 生产操作记录（外协收回等），用于合作单位对账汇总 */
  prodRecords?: ProductionOpRecord[];
  /** 关联产品模式下报工写入此处，报工结算需与工单 milestones.reports 一并汇总 */
  productMilestoneProgresses?: ProductMilestoneProgress[];
  onAddRecord: (record: FinanceRecord) => void;
  onUpdateRecord?: (record: FinanceRecord) => void;
  onDeleteRecord?: (id: string) => void;
  financeCategories: FinanceCategory[];
  financeAccountTypes: FinanceAccountType[];
  partners: Partner[];
  workers: Worker[];
  products: Product[];
  partnerCategories: PartnerCategory[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  userPermissions?: string[];
  tenantRole?: string;
}

const emptyForm = {
    amount: 0,
    relatedId: '',
    partner: '',
  note: '',
  categoryId: '',
  workerId: '',
  productId: '',
  paymentAccount: '',
  customData: {} as Record<string, any>,
};

/** 合作单位对账：统一展示行（采购单/销售单/外协收回/收款单/付款单） */
type PartnerReconRow =
  | { source: 'finance'; rec: FinanceRecord }
  | { source: 'psi'; docType: string; docNo: string; timestamp: string; partner: string; amount: number; operator?: string; note?: string }
  | { source: 'prod'; rec: ProductionOpRecord };

/** 报工结算对账：统一展示行（报工单、返工报工、收款单、付款单） */
type SettlementReconRow =
  | { source: 'work_report'; reportNo: string; timestamp: string; workerId: string; workerName: string; amount: number; items: { orderNumber: string; productName: string; milestoneName: string; quantity: number; rate: number; amount: number }[] }
  | { source: 'rework_report'; rec: ProductionOpRecord }
  | { source: 'settlement_finance'; rec: FinanceRecord };

/** 详情弹窗可展示的对象：财务单（报工结算）或合作单位对账行 或 报工结算对账行 */
type DetailTarget = FinanceRecord | PartnerReconRow | SettlementReconRow;

function isPartnerReconRow(x: DetailTarget): x is PartnerReconRow {
  return 'source' in x && (x.source === 'finance' || x.source === 'psi' || x.source === 'prod');
}

function isSettlementReconRow(x: DetailTarget): x is SettlementReconRow {
  return 'source' in x && (x.source === 'work_report' || x.source === 'rework_report' || x.source === 'settlement_finance');
}

function getFinanceRecordFromDetail(d: DetailTarget): FinanceRecord | null {
  if (isPartnerReconRow(d)) return d.source === 'finance' ? d.rec : null;
  if (isSettlementReconRow(d) && d.source === 'settlement_finance') return d.rec;
  if (typeof d === 'object' && d !== null && 'type' in d && ['RECEIPT', 'PAYMENT', 'RECONCILIATION', 'SETTLEMENT'].includes((d as FinanceRecord).type)) return d as FinanceRecord;
  return null;
}

const FinanceOpsView: React.FC<FinanceOpsViewProps> = ({ type, orders, records, allRecords, psiRecords = [], prodRecords = [], productMilestoneProgresses = [], onAddRecord, onUpdateRecord, onDeleteRecord, financeCategories, financeAccountTypes, partners, workers, products, partnerCategories, categories, globalNodes, dictionaries, userPermissions, tenantRole }) => {
  const _isOwner = tenantRole === 'owner';
  const hasFinancePerm = (permKey: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('finance') && !userPermissions.some(p => p.startsWith('finance:'))) return true;
    return userPermissions.includes(permKey);
  };
  const financePermModule = type === 'RECEIPT' ? 'receipt' : type === 'PAYMENT' ? 'payment' : 'reconciliation';
  const canView = hasFinancePerm(`finance:${financePermModule}:${financePermModule === 'reconciliation' ? 'allow' : 'view'}`);
  const canCreate = financePermModule !== 'reconciliation' && hasFinancePerm(`finance:${financePermModule}:create`);
  const canEdit = financePermModule !== 'reconciliation' && hasFinancePerm(`finance:${financePermModule}:edit`);
  const canDelete = financePermModule !== 'reconciliation' && hasFinancePerm(`finance:${financePermModule}:delete`);
  const confirm = useConfirm();
  const fmtDT = (ts: any): string => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detailRecord, setDetailRecord] = useState<DetailTarget | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  useEffect(() => {
    setShowModal(false);
    setDetailRecord(null);
    setEditingRecordId(null);
  }, [type]);
  /** 财务对账：两个子标签 合作单位 | 报工结算 */
  const [reconciliationSubTab, setReconciliationSubTab] = useState<'partner' | 'settlement'>('partner');
  /** 日期区间（YYYY-MM-DD） */
  const [reconDateFrom, setReconDateFrom] = useState('');
  const [reconDateTo, setReconDateTo] = useState('');
  /** 合作单位 / 工人 搜索 */
  const [reconPartnerId, setReconPartnerId] = useState('');
  const [reconWorkerId, setReconWorkerId] = useState('');
  /** 点击查询后提交的筛选条件（列表按此显示，未点查询不显示列表） */
  const [reconQueryDateFrom, setReconQueryDateFrom] = useState('');
  const [reconQueryDateTo, setReconQueryDateTo] = useState('');
  const [reconQueryPartnerId, setReconQueryPartnerId] = useState('');
  const [reconQueryWorkerId, setReconQueryWorkerId] = useState('');

  /** 参照报工单：前缀 + yyyyMMdd + '-' + 4位序号，按同类型当日已有记录数+1 */
  const getNextDocNo = useCallback(() => {
    const todayStr = toLocalCompactYmd(new Date());
    const keys = new Set<string>();
    allRecords.filter(r => r.type === type).forEach(r => {
      const ds = toLocalCompactYmd(r.timestamp);
      if (!ds || ds !== todayStr) return;
      keys.add(r.docNo || r.id);
    });
    const seq = keys.size + 1;
    const seqStr = String(seq).padStart(4, '0');
    return `${FINANCE_DOC_NO_PREFIX[type]}${todayStr}-${seqStr}`;
  }, [allRecords, type]);

  const bizConfig: Record<FinanceOpType, any> = {
    'RECEIPT': { label: '收款单', sub: '登记从客户处收到的款项', partnerLabel: '缴款客户' },
    'PAYMENT': { label: '付款单', sub: '登记支付给供应商或员工的款项', partnerLabel: '收款单位/个人' },
    'RECONCILIATION': { label: '财务对账', sub: '记录往来对账确认结果', partnerLabel: '对账单位' },
    'SETTLEMENT': { label: '工资单', sub: '登记工人的生产计件工资结算记录', partnerLabel: '领薪工人' },
  };

  const current = bizConfig[type];
  const isReceiptOrPayment = type === 'RECEIPT' || type === 'PAYMENT';

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const workerMap = useMemo(() => new Map(workers.map(w => [w.id, w])), [workers]);
  const financeCatMap = useMemo(() => new Map(financeCategories.map(c => [c.id, c])), [financeCategories]);
  const categoriesForType = useMemo(() =>
    financeCategories.filter(c => c.kind === type),
    [financeCategories, type]
  );
  const selectedCategory = useMemo(() =>
    form.categoryId ? financeCategories.find(c => c.id === form.categoryId) : null,
    [financeCategories, form.categoryId]
  );

  const fillFormFromRecord = useCallback((rec: FinanceRecord) => {
    setForm({
      amount: rec.amount,
      relatedId: rec.relatedId || '',
      partner: rec.partner || '',
      note: rec.note || '',
      categoryId: rec.categoryId || '',
      workerId: rec.workerId || '',
      productId: rec.productId || '',
      paymentAccount: rec.paymentAccount || '',
      customData: rec.customData ? { ...rec.customData } : {},
    });
  }, []);

  const handleSave = () => {
    if (editingRecordId) {
      const existing = allRecords.find(r => r.id === editingRecordId);
      if (existing && onUpdateRecord) {
        const updated: FinanceRecord = {
          ...existing,
          amount: form.amount,
          relatedId: form.relatedId || undefined,
          partner: form.partner,
          note: form.note,
          categoryId: form.categoryId || undefined,
          workerId: form.workerId || undefined,
          productId: form.productId || undefined,
          paymentAccount: form.paymentAccount || undefined,
          customData: Object.keys(form.customData).length ? { ...form.customData } : undefined,
        };
        onUpdateRecord(updated);
      }
      setShowModal(false);
      setForm(emptyForm);
      setEditingRecordId(null);
      return;
    }
    const newRec: FinanceRecord = {
      id: `fin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: type,
      docNo: getNextDocNo(),
      timestamp: new Date().toLocaleString(),
      amount: form.amount,
      relatedId: form.relatedId || undefined,
      partner: form.partner,
      note: form.note,
      operator: '财务办-陈会计',
      status: 'COMPLETED',
    };
    if (isReceiptOrPayment) {
      newRec.categoryId = form.categoryId || undefined;
      newRec.workerId = form.workerId || undefined;
      newRec.productId = form.productId || undefined;
      newRec.paymentAccount = form.paymentAccount || undefined;
      if (Object.keys(form.customData).length) newRec.customData = { ...form.customData };
    }
    onAddRecord(newRec);
    setShowModal(false);
    setForm(emptyForm);
  };

  const needPartner = !selectedCategory || selectedCategory.linkPartner === true;
  const canSaveReceiptPayment = form.amount > 0 && (!needPartner || form.partner.trim() !== '') && (!categoriesForType.length || form.categoryId);
  const canSaveOther = form.amount > 0 && form.partner.trim() !== '';
  const canSave = isReceiptOrPayment ? canSaveReceiptPayment : canSaveOther;

  /** 财务对账：已点击查询后的条件（列表按此显示） */
  const reconHasFilter = type === 'RECONCILIATION' && (reconciliationSubTab === 'partner' ? !!reconQueryPartnerId : !!reconQueryWorkerId);

  const reconQueryDateFromT = reconQueryDateFrom.trim();
  const reconQueryDateToT = reconQueryDateTo.trim();
  const inFinanceDateRangeQuery = useCallback((ts: string, from: string, to: string) => {
    const d = toLocalDateYmd(ts);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }, []);

  /** 合作单位对账：采购单、销售单、外协收回、收款单、付款单 合并列表（按点击查询后的条件） */
  const partnerReconList = useMemo((): PartnerReconRow[] => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'partner' || !reconQueryPartnerId) return [];
    const partnerName = partners.find(p => p.id === reconQueryPartnerId)?.name ?? '';
    const from = reconQueryDateFromT;
    const to = reconQueryDateToT;
    const rows: PartnerReconRow[] = [];
    const psiTypes = ['PURCHASE_BILL', 'SALES_BILL'] as const;
    const psiLabel: Record<string, string> = { PURCHASE_BILL: '采购单', SALES_BILL: '销售单' };
    const psiFiltered = (psiRecords as any[]).filter((r: any) => psiTypes.includes(r.type) && (r.partner === partnerName || r.partnerId === reconQueryPartnerId));
    const psiByDoc = new Map<string, { type: string; timestamp: string; partner: string; amount: number; operator?: string; note?: string }>();
    psiFiltered.forEach((r: any) => {
      const dateStr = r.createdAt ? toLocalDateYmd(r.createdAt) : (r.timestamp ? toLocalDateYmd(r.timestamp) : '') || '';
      if (from && dateStr < from) return;
      if (to && dateStr > to) return;
      const docKey = `${r.type}|${r.docNumber || r.id}`;
      const cur = psiByDoc.get(docKey);
      const amt = Number(r.amount) || 0;
      if (!cur) psiByDoc.set(docKey, { type: r.type, timestamp: r.timestamp || '', partner: r.partner || '', amount: amt, operator: r.operator, note: r.note });
      else cur.amount += amt;
    });
    psiByDoc.forEach((v, docKey) => {
      const docNo = docKey.split('|')[1] || '';
      const docType = (v.type === 'SALES_BILL' && v.amount < 0) ? '销售退货' : (psiLabel[v.type] || v.type);
      rows.push({ source: 'psi', docType, docNo, timestamp: v.timestamp, partner: v.partner, amount: v.amount, operator: v.operator, note: v.note });
    });
    const prodByDoc = new Map<string, { status: string; timestamp: string; partner: string; amount: number; operator?: string; count: number }>();
    (prodRecords as ProductionOpRecord[]).filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === partnerName).forEach(rec => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (from && d < from) return;
      if (to && d > to) return;
      const docKey = rec.docNo || rec.id;
      const cur = prodByDoc.get(docKey);
      const amt = Number(rec.amount) || 0;
      if (!cur) prodByDoc.set(docKey, { status: rec.status || '', timestamp: rec.timestamp || '', partner: rec.partner || '', amount: amt, operator: rec.operator ?? undefined, count: 1 });
      else { cur.amount += amt; cur.count += 1; }
    });
    prodByDoc.forEach((v, docNo) => {
      rows.push({ source: 'psi', docType: '外协收回', docNo, timestamp: v.timestamp, partner: v.partner, amount: v.amount, operator: v.operator });
    });
    const finByDoc = new Map<string, { rec: FinanceRecord; amount: number; count: number }>();
    allRecords.filter(rec => (rec.type === 'RECEIPT' || rec.type === 'PAYMENT') && rec.partner === partnerName && inFinanceDateRangeQuery(rec.timestamp, from, to)).forEach(rec => {
      const docKey = rec.docNo || rec.id;
      const cur = finByDoc.get(docKey);
      if (!cur) finByDoc.set(docKey, { rec: { ...rec }, amount: rec.amount, count: 1 });
      else { cur.amount += rec.amount; cur.count += 1; cur.rec = { ...cur.rec, amount: cur.amount }; }
    });
    finByDoc.forEach(v => {
      rows.push({ source: 'finance', rec: v.rec });
    });
    rows.sort((a, b) => {
      const ta = a.source === 'finance' ? a.rec.timestamp : a.source === 'psi' ? a.timestamp : a.rec.timestamp;
      const tb = b.source === 'finance' ? b.rec.timestamp : b.source === 'psi' ? b.timestamp : b.rec.timestamp;
      return new Date(ta).getTime() - new Date(tb).getTime();
    });
    return rows;
  }, [type, reconciliationSubTab, reconQueryPartnerId, reconQueryDateFromT, reconQueryDateToT, partners, psiRecords, prodRecords, allRecords, inFinanceDateRangeQuery]);

  /** 报工结算对账：报工单（按 reportNo 汇总）、返工报工、收款单、付款单 合并列表（按工人+日期查询后） */
  const settlementReconList = useMemo((): SettlementReconRow[] => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || !reconQueryWorkerId) return [];
    const from = reconQueryDateFromT;
    const to = reconQueryDateToT;
    const workerName = workerMap.get(reconQueryWorkerId)?.name ?? '';
    const rows: SettlementReconRow[] = [];
    const reportToWorkerId = (r: any) => (r.workerId ?? r.customData?.workerId ?? '') as string;
    const workReportGroups = new Map<string, { timestamp: string; workerId: string; workerName: string; amount: number; items: { orderNumber: string; productName: string; milestoneName: string; quantity: number; rate: number; amount: number }[] }>();
    const variantDisplay = (product: Product | undefined, variantId?: string) => {
      if (!variantId || !product?.variants?.length) return '';
      const v = product.variants.find(x => x.id === variantId);
      if (!v) return variantId;
      const color = dictionaries?.colors?.find(c => c.id === v.colorId)?.name;
      const size = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name;
      return [color, size].filter(Boolean).join(' / ') || v.skuSuffix || variantId;
    };
    orders.forEach(order => {
      const nodeRates = productMap.get(order.productId)?.nodeRates;
      order.milestones?.forEach(milestone => {
        const rate = nodeRates?.[milestone.templateId] ?? 0;
        (milestone.reports || []).forEach((r: any) => {
          const wid = reportToWorkerId(r);
          if (wid !== reconQueryWorkerId) return;
          const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
          if (from && dateStr < from) return;
          if (to && dateStr > to) return;
          const qty = Number(r.quantity) || 0;
          const unitRate = r.rate != null ? Number(r.rate) : rate;
          const amt = qty * unitRate;
          const key = r.reportNo || r.reportBatchId || r.id;
          const existing = workReportGroups.get(key);
          const item = { orderNumber: order.orderNumber, productName: order.productName ?? '', milestoneName: milestone.name ?? '', quantity: qty, rate: unitRate, amount: amt };
          if (!existing) {
            workReportGroups.set(key, { timestamp: r.timestamp || '', workerId: wid, workerName, amount: amt, items: [item] });
          } else {
            existing.amount += amt;
            existing.items.push(item);
          }
        });
      });
    });
    productMilestoneProgresses.forEach(pmp => {
      const prod = productMap.get(pmp.productId);
      const nodeRates = prod?.nodeRates;
      const milestoneName = globalNodes.find(n => n.id === pmp.milestoneTemplateId)?.name ?? '';
      const defaultRate = nodeRates?.[pmp.milestoneTemplateId] ?? 0;
      const baseProductName = prod?.name ?? '';
      (pmp.reports || []).forEach((r: any) => {
        const wid = reportToWorkerId(r);
        if (wid !== reconQueryWorkerId) return;
        const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
        if (from && dateStr < from) return;
        if (to && dateStr > to) return;
        const qty = Number(r.quantity) || 0;
        const unitRate = r.rate != null ? Number(r.rate) : defaultRate;
        const amt = qty * unitRate;
        const key = r.reportNo || r.reportBatchId || r.id;
        const existing = workReportGroups.get(key);
        const vid = (r.variantId ?? pmp.variantId) as string | undefined;
        const vLabel = variantDisplay(prod, vid);
        const item = {
          orderNumber: '关联产品',
          productName: vLabel ? `${baseProductName}（${vLabel}）` : baseProductName,
          milestoneName,
          quantity: qty,
          rate: unitRate,
          amount: amt,
        };
        if (!existing) {
          workReportGroups.set(key, { timestamp: r.timestamp || '', workerId: wid, workerName, amount: amt, items: [item] });
        } else {
          existing.amount += amt;
          existing.items.push(item);
        }
      });
    });
    workReportGroups.forEach((v, reportNo) => {
      rows.push({ source: 'work_report', reportNo: reportNo || '—', timestamp: v.timestamp, workerId: v.workerId, workerName: v.workerName, amount: v.amount, items: v.items });
    });
    (prodRecords as ProductionOpRecord[]).filter(r => r.type === 'REWORK_REPORT' && r.workerId === reconQueryWorkerId).forEach(rec => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (from && d < from) return;
      if (to && d > to) return;
      rows.push({ source: 'rework_report', rec });
    });
    allRecords.filter(rec => (rec.type === 'RECEIPT' || rec.type === 'PAYMENT') && rec.workerId === reconQueryWorkerId && inFinanceDateRangeQuery(rec.timestamp, from, to)).forEach(rec => {
      rows.push({ source: 'settlement_finance', rec });
    });
    rows.sort((a, b) => {
      const ta = a.source === 'settlement_finance' ? a.rec.timestamp : a.source === 'rework_report' ? a.rec.timestamp : a.timestamp;
      const tb = b.source === 'settlement_finance' ? b.rec.timestamp : b.source === 'rework_report' ? b.rec.timestamp : b.timestamp;
      return new Date(ta).getTime() - new Date(tb).getTime();
    });
    return rows;
  }, [type, reconciliationSubTab, reconQueryWorkerId, reconQueryDateFromT, reconQueryDateToT, orders, productMilestoneProgresses, productMap, workerMap, prodRecords, allRecords, inFinanceDateRangeQuery, globalNodes, dictionaries]);

  const FIN_PAGE_SIZE = 20;
  const [finPage, setFinPage] = useState(1);

  /** 财务对账：按日期 + 工人筛选后的财务单列表（非对账时用；对账报工结算用 settlementReconList） */
  const displayRecords = useMemo(() => {
    if (type !== 'RECONCILIATION') return records;
    if (reconciliationSubTab === 'partner') return []; // 合作单位用 partnerReconList
    if (reconciliationSubTab === 'settlement') return []; // 报工结算用 settlementReconWithBalance
    if (!reconQueryWorkerId) return [];
    const from = reconQueryDateFromT;
    const to = reconQueryDateToT;
    return allRecords.filter(rec => {
      if (!rec.workerId) return false;
      if (!inFinanceDateRangeQuery(rec.timestamp, from, to)) return false;
      if (rec.workerId !== reconQueryWorkerId) return false;
      return true;
    });
  }, [type, records, allRecords, reconciliationSubTab, reconQueryDateFromT, reconQueryDateToT, reconQueryWorkerId, inFinanceDateRangeQuery]);

  useEffect(() => { setFinPage(1); }, [type]);
  const finTotalPages = Math.max(1, Math.ceil(displayRecords.length / FIN_PAGE_SIZE));
  const pagedDisplayRecords = useMemo(
    () => displayRecords.slice((finPage - 1) * FIN_PAGE_SIZE, finPage * FIN_PAGE_SIZE),
    [displayRecords, finPage],
  );

  /** 报工结算：每行应收增加、应收减少及逐行应收余额。应收减少=报工单、返工报工、收款单；应收增加=付款单 */
  const settlementReconWithBalance = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || settlementReconList.length === 0) return [];
    let running = 0;
    return settlementReconList.map(row => {
      let inc = 0;
      let dec = 0;
      if (row.source === 'work_report') dec = row.amount;
      else if (row.source === 'rework_report') dec = Number(row.rec.amount) || 0;
      else if (row.source === 'settlement_finance') {
        if (row.rec.type === 'RECEIPT') dec = row.rec.amount;
        else if (row.rec.type === 'PAYMENT') inc = row.rec.amount;
      }
      running += inc - dec;
      return { row, receivableInc: inc, receivableDec: dec, balance: running };
    });
  }, [type, reconciliationSubTab, settlementReconList]);

  /** 合作单位对账：每行应收增加、应收减少及逐行应收余额。应收增加=销售单、付款单；应收减少=采购单、外协收回、收款单 */
  const partnerReconWithBalance = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'partner' || partnerReconList.length === 0) return [];
    let running = 0;
    return partnerReconList.map(row => {
      let inc = 0;
      let dec = 0;
      if (row.source === 'finance') {
        if (row.rec.type === 'RECEIPT') dec = row.rec.amount;
        else if (row.rec.type === 'PAYMENT') inc = row.rec.amount;
      } else if (row.source === 'psi') {
        if (row.docType === '采购单') dec = Math.abs(row.amount);
        else if (row.docType === '外协收回') dec = Math.abs(row.amount);
        else if (row.docType === '销售单') {
          if (row.amount >= 0) inc = row.amount;
          else dec = Math.abs(row.amount);
        }
      } else if (row.source === 'prod') {
        dec = Number(row.rec.amount) || 0;
      }
      running += inc - dec;
      return { row, receivableInc: inc, receivableDec: dec, balance: running };
    });
  }, [type, reconciliationSubTab, partnerReconList]);

  if (!canView) {
    return (
      <div className="space-y-4">
        <h1 className={pageTitleClass}>{current.label}</h1>
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <p className="text-slate-400 text-sm">暂无该模块的查看权限，请联系管理员配置</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex flex-col gap-4">
        <div className={moduleHeaderRowClass}>
          <div>
            <h1 className={pageTitleClass}>{current.label}</h1>
            {type === 'RECONCILIATION' ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mt-1 w-full max-w-4xl">
                <p className={pageSubtitleClass}>{current.sub}</p>
                <div className="flex bg-slate-100 p-1 rounded-xl w-fit justify-self-center">
                  <button
                    type="button"
                    onClick={() => setReconciliationSubTab('partner')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${reconciliationSubTab === 'partner' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Building2 className="w-3.5 h-3.5" /> 合作单位
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconciliationSubTab('settlement')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${reconciliationSubTab === 'settlement' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <User className="w-3.5 h-3.5" /> 报工结算
                  </button>
                </div>
                <div />
              </div>
            ) : (
              <p className={pageSubtitleClass}>{current.sub}</p>
            )}
          </div>
          {type !== 'RECONCILIATION' && canCreate && (
            <div className="flex items-center gap-2 shrink-0 mt-4 sm:mt-0">
            <button
              type="button"
              onClick={() => { setEditingRecordId(null); setForm(emptyForm); setShowModal(true); }}
              className={primaryToolbarButtonClass}
            >
              <Plus className="w-4 h-4 shrink-0" /> 新增{current.label}
            </button>
            </div>
          )}
        </div>
        {type === 'RECONCILIATION' && (
          <div className="flex flex-wrap items-center gap-3">
            {reconciliationSubTab === 'partner' ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">开始日期</span>
                  <input type="date" value={reconDateFrom} onChange={e => setReconDateFrom(e.target.value)} className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">结束日期</span>
                  <input type="date" value={reconDateTo} onChange={e => setReconDateTo(e.target.value)} className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">合作单位</span>
                  <div className="min-w-[140px]">
                    <SearchablePartnerSelect
                      options={partners}
                      categories={partnerCategories}
                      value={reconPartnerId}
                      onChange={(_, id) => setReconPartnerId(id)}
                      valueMode="id"
                      compact
                      showCategoryHint={false}
                      placeholder="请选择合作单位"
                      triggerClassName="bg-white border border-slate-200"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setReconQueryDateFrom(reconDateFrom); setReconQueryDateTo(reconDateTo); setReconQueryPartnerId(reconPartnerId); setReconQueryWorkerId(''); }}
                  disabled={!reconPartnerId}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  查询
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">开始日期</span>
                  <input type="date" value={reconDateFrom} onChange={e => setReconDateFrom(e.target.value)} className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">结束日期</span>
                  <input type="date" value={reconDateTo} onChange={e => setReconDateTo(e.target.value)} className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <WorkerSelectWithTabs workers={workers} processNodes={globalNodes} value={reconWorkerId} onChange={setReconWorkerId} label="工人" compact />
                <button
                  type="button"
                  onClick={() => { setReconQueryDateFrom(reconDateFrom); setReconQueryDateTo(reconDateTo); setReconQueryWorkerId(reconWorkerId); setReconQueryPartnerId(''); }}
                  disabled={!reconWorkerId}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  查询
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 数据列表 */}
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{type === 'RECONCILIATION' && reconciliationSubTab === 'settlement' ? '工人' : current.partnerLabel}</th>
                {type === 'RECONCILIATION' && (reconciliationSubTab === 'partner' || reconciliationSubTab === 'settlement') ? (
                  <>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">应收增加</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">应收减少</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">应收余额</th>
                  </>
                ) : (
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">业务金额</th>
                )}
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(() => {
                const isPartnerRecon = type === 'RECONCILIATION' && reconciliationSubTab === 'partner';
                const isSettlementRecon = type === 'RECONCILIATION' && reconciliationSubTab === 'settlement';
                const listLength = isPartnerRecon ? partnerReconWithBalance.length : isSettlementRecon ? settlementReconWithBalance.length : pagedDisplayRecords.length;
                const colSpan = (isPartnerRecon || isSettlementRecon) ? 8 : 6;
                const emptyMsg = type === 'RECONCILIATION' ? (reconHasFilter ? '该条件下暂无对账单据' : (reconciliationSubTab === 'partner' ? '请选择合作单位后点击查询' : '请选择工人后点击查询')) : '暂无该模块财务记录';
                if (listLength === 0) {
                  return (
                    <tr>
                      <td colSpan={colSpan} className="px-8 py-20 text-center text-slate-300 italic text-sm">{emptyMsg}</td>
                    </tr>
                  );
                }
                if (isSettlementRecon) {
                  return settlementReconWithBalance.map(({ row, receivableInc, receivableDec, balance }, idx) => {
                    if (row.source === 'work_report') {
                      return (
                        <tr key={`work-${row.reportNo}-${idx}`} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-8 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-300" /><span className="text-xs font-bold text-slate-600">{fmtDT(row.timestamp)}</span></div></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-800">{row.reportNo}</span></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">报工单</span></td>
                          <td className="px-8 py-4"><span className="text-sm font-bold text-slate-800">{row.workerName || '-'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-slate-800">—</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-emerald-600">¥ {row.amount.toLocaleString()}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-indigo-600">¥ {balance.toLocaleString()}</span></td>
                          <td className="px-8 py-4 text-center">
                            <button type="button" onClick={() => setDetailRecord(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                          </td>
                        </tr>
                      );
                    }
                    if (row.source === 'rework_report') {
                      const rec = row.rec;
                      return (
                        <tr key={`rework-${rec.id}`} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-8 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-300" /><span className="text-xs font-bold text-slate-600">{fmtDT(rec.timestamp)}</span></div></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-800">{rec.docNo || rec.id}</span></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">返工报工</span></td>
                          <td className="px-8 py-4"><span className="text-sm font-bold text-slate-800">{workerMap.get(rec.workerId)?.name ?? rec.workerId ?? '-'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-slate-800">—</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-emerald-600">¥ {(Number(rec.amount) || 0).toLocaleString()}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-indigo-600">¥ {balance.toLocaleString()}</span></td>
                          <td className="px-8 py-4 text-center">
                            <button type="button" onClick={() => setDetailRecord(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                          </td>
                        </tr>
                      );
                    }
                    const rec = row.rec;
                    return (
                      <tr key={`settle-fin-${rec.id}`} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-300" /><span className="text-xs font-bold text-slate-600">{fmtDT(rec.timestamp)}</span></div></td>
                        <td className="px-8 py-4"><span className="text-xs font-bold text-slate-800">{rec.docNo || rec.id}</span></td>
                        <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">{bizConfig[rec.type]?.label ?? rec.type}</span></td>
                        <td className="px-8 py-4"><span className="text-sm font-bold text-slate-800">{workerMap.get(rec.workerId)?.name ?? rec.workerId ?? '-'}</span></td>
                        <td className="px-8 py-4 text-right"><span className="text-sm font-black text-slate-800">{receivableInc > 0 ? `¥ ${receivableInc.toLocaleString()}` : '—'}</span></td>
                        <td className="px-8 py-4 text-right"><span className="text-sm font-black text-emerald-600">{receivableDec > 0 ? `¥ ${receivableDec.toLocaleString()}` : '—'}</span></td>
                        <td className="px-8 py-4 text-right"><span className="text-sm font-black text-indigo-600">¥ {balance.toLocaleString()}</span></td>
                        <td className="px-8 py-4 text-center">
                          <button type="button" onClick={() => setDetailRecord(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                        </td>
                      </tr>
                    );
                  });
                }
                if (isPartnerRecon) {
                  return partnerReconWithBalance.map(({ row, receivableInc, receivableDec, balance }, idx) => {
                    if (row.source === 'finance') {
                      const rec = row.rec;
                      return (
                        <tr key={`fin-${rec.id}`} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-8 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-300" /><span className="text-xs font-bold text-slate-600">{fmtDT(rec.timestamp)}</span></div></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-800">{rec.docNo || rec.id}</span></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">{bizConfig[rec.type]?.label ?? rec.type}</span></td>
                          <td className="px-8 py-4"><span className="text-sm font-bold text-slate-800">{rec.partner || '-'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-slate-800">{receivableInc > 0 ? `¥ ${receivableInc.toLocaleString()}` : '—'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-emerald-600">{receivableDec > 0 ? `¥ ${receivableDec.toLocaleString()}` : '—'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-indigo-600">¥ {balance.toLocaleString()}</span></td>
                          <td className="px-8 py-4 text-center">
                            <button type="button" onClick={() => setDetailRecord(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                          </td>
                        </tr>
                      );
                    }
                    if (row.source === 'psi') {
                      return (
                        <tr key={`psi-${row.docNo}-${idx}`} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-8 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-300" /><span className="text-xs font-bold text-slate-600">{fmtDT(row.timestamp)}</span></div></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-800">{row.docNo}</span></td>
                          <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">{row.docType}</span></td>
                          <td className="px-8 py-4"><span className="text-sm font-bold text-slate-800">{row.partner || '-'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-slate-800">{receivableInc > 0 ? `¥ ${receivableInc.toLocaleString()}` : '—'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-emerald-600">{receivableDec > 0 ? `¥ ${receivableDec.toLocaleString()}` : '—'}</span></td>
                          <td className="px-8 py-4 text-right"><span className="text-sm font-black text-indigo-600">¥ {balance.toLocaleString()}</span></td>
                          <td className="px-8 py-4 text-center">
                            <button type="button" onClick={() => setDetailRecord(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                          </td>
                        </tr>
                      );
                    }
                    const rec = row.rec;
                    return (
                      <tr key={`prod-${rec.id}`} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-300" /><span className="text-xs font-bold text-slate-600">{fmtDT(rec.timestamp)}</span></div></td>
                        <td className="px-8 py-4"><span className="text-xs font-bold text-slate-800">{rec.docNo || rec.id}</span></td>
                        <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">外协收回</span></td>
                        <td className="px-8 py-4"><span className="text-sm font-bold text-slate-800">{rec.partner || '-'}</span></td>
                        <td className="px-8 py-4 text-right"><span className="text-sm font-black text-slate-800">{receivableInc > 0 ? `¥ ${receivableInc.toLocaleString()}` : '—'}</span></td>
                        <td className="px-8 py-4 text-right"><span className="text-sm font-black text-emerald-600">{receivableDec > 0 ? `¥ ${receivableDec.toLocaleString()}` : '—'}</span></td>
                        <td className="px-8 py-4 text-right"><span className="text-sm font-black text-indigo-600">¥ {balance.toLocaleString()}</span></td>
                        <td className="px-8 py-4 text-center">
                          <button type="button" onClick={() => setDetailRecord(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                        </td>
                      </tr>
                    );
                  });
                }
                return pagedDisplayRecords.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-xs font-bold text-slate-600">{fmtDT(rec.timestamp)}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <span className="text-xs font-bold text-slate-800">{rec.docNo || rec.id}</span>
                    </td>
                    <td className="px-8 py-4">
                      <span className="text-xs font-bold text-slate-600">
                        {rec.categoryId ? (financeCatMap.get(rec.categoryId)?.name ?? bizConfig[rec.type]?.label) : (bizConfig[rec.type]?.label ?? rec.type)}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-slate-800">{rec.partner || '-'}</span>
                        {rec.workerId && (
                          <span className="text-[10px] text-slate-500">关联工人：{workerMap.get(rec.workerId)?.name ?? rec.workerId}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <span className={`text-sm font-black ${rec.type === 'RECEIPT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        ¥ {rec.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => setDetailRecord(rec)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5" /> 详情
                      </button>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
          {finTotalPages > 1 && type !== 'RECONCILIATION' && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="text-xs text-slate-400">共 {displayRecords.length} 条，第 {finPage} / {finTotalPages} 页</span>
              <button type="button" disabled={finPage <= 1} onClick={() => setFinPage(p => p - 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">上一页</button>
              <button type="button" disabled={finPage >= finTotalPages} onClick={() => setFinPage(p => p + 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">下一页</button>
            </div>
          )}
        </div>
      </div>

      {/* 详情弹窗：财务单 / 合作单位对账 / 报工结算对账 */}
      {detailRecord && (() => {
        const financeRec = getFinanceRecordFromDetail(detailRecord);
        const isReconRow = isPartnerReconRow(detailRecord);
        const isSettleRow = isSettlementReconRow(detailRecord);
        const reconSource = isReconRow ? detailRecord.source : null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDetailRecord(null)} />
            <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col">
              <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                <h2 className="text-lg font-bold text-slate-800">单据详情</h2>
                <div className="flex items-center gap-2">
                  {financeRec && onUpdateRecord && canEdit && (
                    <button type="button" onClick={() => { fillFormFromRecord(financeRec); setEditingRecordId(financeRec.id); setDetailRecord(null); setShowModal(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-sm font-bold transition-all">
                      <Pencil className="w-4 h-4" /> 编辑
                    </button>
                  )}
                  {financeRec && onDeleteRecord && canDelete && (
                    <button type="button" onClick={() => { void confirm({ message: '确定删除该单据？', danger: true }).then((ok) => { if (!ok) return; onDeleteRecord(financeRec.id); setDetailRecord(null); }); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-bold transition-all">
                      <Trash2 className="w-4 h-4" /> 删除
                    </button>
                  )}
                  <button type="button" onClick={() => setDetailRecord(null)} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="p-8 overflow-y-auto flex-1 space-y-5">
                {isSettleRow && detailRecord.source === 'work_report' && (() => {
                  const row = detailRecord;
                  return (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">报工单</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">报工单号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.reportNo}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(row.timestamp)}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.workerName || '-'}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合计金额</span><p className="text-sm font-black text-slate-800 mt-0.5">¥ {row.amount.toLocaleString()}</p></div>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">明细（工单/产品、工序、数量、单价）</span>
                        <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-4 py-2 font-black text-slate-500">工单号</th>
                                <th className="px-4 py-2 font-black text-slate-500">产品</th>
                                <th className="px-4 py-2 font-black text-slate-500">工序</th>
                                <th className="px-4 py-2 font-black text-slate-500 text-right">数量</th>
                                <th className="px-4 py-2 font-black text-slate-500 text-right">单价</th>
                                <th className="px-4 py-2 font-black text-slate-500 text-right">金额</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {row.items.map((item, i) => (
                                <tr key={i}>
                                  <td className="px-4 py-2 font-bold text-slate-800">{item.orderNumber}</td>
                                  <td className="px-4 py-2 font-bold text-slate-800">{item.productName}</td>
                                  <td className="px-4 py-2 font-bold text-slate-800">{item.milestoneName}</td>
                                  <td className="px-4 py-2 text-right font-bold text-slate-800">{item.quantity}</td>
                                  <td className="px-4 py-2 text-right font-bold text-slate-800">¥ {item.rate.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right font-black text-slate-800">¥ {item.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {isSettleRow && detailRecord.source === 'rework_report' && (() => {
                  const row = detailRecord;
                  const rec = row.rec;
                  const order = orders.find(o => o.id === rec.orderId);
                  const product = productMap.get(rec.productId);
                  const node = rec.nodeId ? globalNodes.find(n => n.id === rec.nodeId) : null;
                  const unitPrice = rec.unitPrice != null && rec.unitPrice !== undefined ? Number(rec.unitPrice) : null;
                  const amount = Number(rec.amount) || 0;
                  return (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">返工报工</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.docNo || rec.id}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(rec.timestamp)}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{workerMap.get(rec.workerId)?.name ?? rec.workerId ?? '-'}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">生产订单</span><p className="text-sm font-bold text-slate-800 mt-0.5">{order?.orderNumber ?? rec.orderId ?? '-'}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品</span><p className="text-sm font-bold text-slate-800 mt-0.5">{product?.name ?? rec.productId ?? '-'}</p></div>
                        {node && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工序节点</span><p className="text-sm font-bold text-slate-800 mt-0.5">{node.name}</p></div>}
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">数量</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.quantity}</p></div>
                        {(unitPrice != null) && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单价</span><p className="text-sm font-bold text-slate-800 mt-0.5">¥ {unitPrice.toLocaleString()}</p></div>}
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">金额</span><p className="text-sm font-black text-slate-800 mt-0.5">¥ {amount.toLocaleString()}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.operator}</p></div>
                      </div>
                    </div>
                  );
                })()}
                {reconSource === 'psi' && (() => {
                  const row = detailRecord;
                  if (row.source !== 'psi') return null;
                  const psiType = row.docType === '采购单' ? 'PURCHASE_BILL' : 'SALES_BILL';
                  const lineRecords = (psiRecords as any[]).filter((r: any) => r.type === psiType && (r.docNumber === row.docNo || r.docNo === row.docNo));
                  return (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.docType}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.docNo}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(row.timestamp)}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合作单位</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.partner || '-'}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合计金额</span><p className="text-sm font-black text-slate-800 mt-0.5">¥ {row.amount.toLocaleString()}</p></div>
                        {row.operator != null && row.operator !== '' && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{row.operator}</p></div>}
                        {(row.note != null && row.note !== '') && <div className="col-span-2"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">备注</span><p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{row.note}</p></div>}
                      </div>
                      {lineRecords.length > 0 && (() => {
                        const byProduct = new Map<string, { product: Product | undefined; lines: any[] }>();
                        lineRecords.forEach((r: any) => {
                          const pid = r.productId || 'unknown';
                          if (!byProduct.has(pid)) byProduct.set(pid, { product: productMap.get(pid), lines: [] });
                          byProduct.get(pid)!.lines.push(r);
                        });
                        return (
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">明细（产品、数量、单价）</span>
                            <div className="mt-2 space-y-3">
                              {Array.from(byProduct.entries()).map(([pid, { product: prod, lines }]) => {
                                const productName = prod?.name ?? lines[0]?.productName ?? pid;
                                const category = prod ? categories.find(c => c.id === prod.categoryId) : null;
                                const hasColorSize = productHasColorSizeMatrix(prod, category ?? undefined);
                                const totalQty = lines.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
                                const unitPrice = Number(lines[0]?.purchasePrice ?? lines[0]?.salesPrice ?? 0);
                                const totalAmt = lines.reduce((s: number, r: any) => s + (Number(r.amount) || (Number(r.quantity) || 0) * Number(r.purchasePrice ?? r.salesPrice ?? 0)), 0);
                                return (
                                  <div key={pid} className="border border-slate-100 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                                      <span className="text-sm font-bold text-slate-800">{productName}</span>
                                      <div className="flex items-center gap-4 text-sm">
                                        <span className="font-bold text-slate-600">数量: {totalQty.toLocaleString()}</span>
                                        <span className="font-bold text-slate-600">单价: ¥ {unitPrice.toLocaleString()}</span>
                                        <span className="font-black text-slate-800">金额: ¥ {totalAmt.toLocaleString()}</span>
                                      </div>
                                    </div>
                                    {hasColorSize && (
                                      <div className="px-4 py-2 space-y-1.5">
                                        {(() => {
                                          const colorGroups = new Map<string, { colorName: string; items: { sizeName: string; qty: number }[] }>();
                                          const colorOrder = prod!.colorIds || [];
                                          lines.forEach((r: any) => {
                                            if (!r.variantId) return;
                                            const v = prod!.variants.find(vx => vx.id === r.variantId);
                                            if (!v) return;
                                            const cid = v.colorId;
                                            if (!colorGroups.has(cid)) {
                                              const cName = dictionaries?.colors?.find(c => c.id === cid)?.name ?? cid;
                                              colorGroups.set(cid, { colorName: cName, items: [] });
                                            }
                                            const sName = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId;
                                            colorGroups.get(cid)!.items.push({ sizeName: sName, qty: Number(r.quantity) || 0 });
                                          });
                                          const sortedEntries = Array.from(colorGroups.entries()).sort(([a], [b]) => {
                                            const ia = colorOrder.indexOf(a);
                                            const ib = colorOrder.indexOf(b);
                                            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                                          });
                                          if (sortedEntries.length === 0) return null;
                                          return sortedEntries.map(([cid, { colorName, items }]) => {
                                            const color = dictionaries?.colors?.find(c => c.id === cid);
                                            return (
                                              <div key={cid} className="flex items-center gap-3 py-1">
                                                <div className="flex items-center gap-1.5 w-20 shrink-0">
                                                  {color && <div className="w-3.5 h-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />}
                                                  <span className="text-xs font-bold text-slate-700">{colorName}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-3">
                                                  {items.map((it, idx) => (
                                                    <span key={idx} className="text-xs text-slate-600"><span className="font-bold">{it.sizeName}</span> <span className="text-indigo-600 font-black">{it.qty}</span></span>
                                                  ))}
                                                </div>
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
                {reconSource === 'prod' && (() => {
                  const row = detailRecord;
                  if (row.source !== 'prod') return null;
                  const rec = row.rec;
                  const order = orders.find(o => o.id === rec.orderId);
                  const product = productMap.get(rec.productId);
                  const node = rec.nodeId ? globalNodes.find(n => n.id === rec.nodeId) : null;
                  const unitPrice = rec.unitPrice != null && rec.unitPrice !== undefined ? Number(rec.unitPrice) : null;
                  const amount = Number(rec.amount) || 0;
                  const relatedRecs = (prodRecords as ProductionOpRecord[]).filter(r =>
                    r.type === 'OUTSOURCE' && r.status === '已收回' && r.docNo === rec.docNo
                  );
                  const category = product ? categories.find(c => c.id === product.categoryId) : null;
                  const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);
                  const totalQty = relatedRecs.length > 1
                    ? relatedRecs.reduce((s, r) => s + Number(r.quantity), 0)
                    : Number(rec.quantity);
                  return (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">外协收回</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.docNo || rec.id}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(rec.timestamp)}</p></div>
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">合作单位</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.partner || '-'}</p></div>
                        {order && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">生产订单</span><p className="text-sm font-bold text-slate-800 mt-0.5">{order.orderNumber}</p></div>}
                        {node && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">工序节点</span><p className="text-sm font-bold text-slate-800 mt-0.5">{node.name}</p></div>}
                        {rec.status != null && rec.status !== '' && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">状态</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.status}</p></div>}
                        <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{rec.operator}</p></div>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品、数量、单价</span>
                        <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-50 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800">{product?.name ?? rec.productId ?? '—'}</span>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="font-bold text-slate-600">数量: {totalQty}</span>
                              <span className="font-bold text-slate-600">单价: {unitPrice != null ? `¥ ${unitPrice.toLocaleString()}` : '—'}</span>
                              <span className="font-black text-slate-800">金额: ¥ {amount.toLocaleString()}</span>
                            </div>
                          </div>
                          {hasColorSize && (() => {
                            const colorGroups = new Map<string, { colorName: string; items: { sizeName: string; qty: number }[] }>();
                            const colorOrder = product!.colorIds || [];
                            const recsToShow = relatedRecs.length > 1 ? relatedRecs : [rec];
                            recsToShow.forEach(r => {
                              if (!r.variantId) return;
                              const v = product!.variants.find(vx => vx.id === r.variantId);
                              if (!v) return;
                              const cid = v.colorId;
                              if (!colorGroups.has(cid)) {
                                const cName = dictionaries?.colors?.find(c => c.id === cid)?.name ?? cid;
                                colorGroups.set(cid, { colorName: cName, items: [] });
                              }
                              const sName = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId;
                              colorGroups.get(cid)!.items.push({ sizeName: sName, qty: Number(r.quantity) || 0 });
                            });
                            const sortedEntries = Array.from(colorGroups.entries()).sort(([a], [b]) => {
                              const ia = colorOrder.indexOf(a);
                              const ib = colorOrder.indexOf(b);
                              return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                            });
                            if (sortedEntries.length === 0) return null;
                            return (
                              <div className="px-4 py-2 space-y-1.5">
                                {sortedEntries.map(([cid, { colorName, items }]) => {
                                  const color = dictionaries?.colors?.find(c => c.id === cid);
                                  return (
                                    <div key={cid} className="flex items-center gap-3 py-1">
                                      <div className="flex items-center gap-1.5 w-20 shrink-0">
                                        {color && <div className="w-3.5 h-3.5 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />}
                                        <span className="text-xs font-bold text-slate-700">{colorName}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-3">
                                        {items.map((it, idx) => (
                                          <span key={idx} className="text-xs text-slate-600"><span className="font-bold">{it.sizeName}</span> <span className="text-indigo-600 font-black">{it.qty}</span></span>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {(financeRec != null) && (
                  <>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据编号</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.docNo || financeRec.id}</p></div>
                      <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单据类型</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.categoryId ? (financeCatMap.get(financeRec.categoryId)?.name ?? bizConfig[financeRec.type]?.label) : (bizConfig[financeRec.type]?.label ?? financeRec.type)}</p></div>
                      <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务时间</span><p className="text-sm font-bold text-slate-800 mt-0.5">{fmtDT(financeRec.timestamp)}</p></div>
                      <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{current.partnerLabel}</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.partner || '-'}</p></div>
                      {financeRec.workerId && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">关联工人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{workerMap.get(financeRec.workerId)?.name ?? financeRec.workerId}</p></div>}
                      {financeRec.relatedId && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">关联工单</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.relatedId}</p></div>}
                      {financeRec.paymentAccount && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">收支账户</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.paymentAccount}</p></div>}
                      <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务金额</span><p className={`text-sm font-black mt-0.5 ${financeRec.type === 'RECEIPT' ? 'text-emerald-600' : 'text-slate-800'}`}>¥ {financeRec.amount.toLocaleString()}</p></div>
                      <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">经办人</span><p className="text-sm font-bold text-slate-800 mt-0.5">{financeRec.operator}</p></div>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">产品、数量、单价</span>
                      <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-2 font-black text-slate-500">产品</th>
                              <th className="px-4 py-2 font-black text-slate-500 text-right">数量</th>
                              <th className="px-4 py-2 font-black text-slate-500 text-right">单价</th>
                              <th className="px-4 py-2 font-black text-slate-500 text-right">金额</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-4 py-2 font-bold text-slate-800">{financeRec.productId ? (productMap.get(financeRec.productId)?.name ?? financeRec.productId) : '—'}</td>
                              <td className="px-4 py-2 text-right font-bold text-slate-800">—</td>
                              <td className="px-4 py-2 text-right font-bold text-slate-800">—</td>
                              <td className="px-4 py-2 text-right font-black text-slate-800">¥ {financeRec.amount.toLocaleString()}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {(financeRec.note != null && financeRec.note !== '') && <div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">备注</span><p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{financeRec.note}</p></div>}
                    {financeRec.customData && Object.keys(financeRec.customData).length > 0 && (() => {
                      const cat = financeRec.categoryId ? financeCatMap.get(financeRec.categoryId) ?? null : null;
                      const fields = cat?.customFields ?? [];
                      return fields.length > 0 ? <div className="space-y-3"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">自定义内容</span><div className="grid grid-cols-2 gap-x-8 gap-y-2">{fields.map(f => <div key={f.id}><span className="text-[10px] text-slate-400">{f.label}</span><p className="text-sm font-bold text-slate-800 mt-0.5">{String(financeRec.customData![f.id] ?? '-')}</p></div>)}</div></div> : null;
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 新增/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setShowModal(false); setForm(emptyForm); setEditingRecordId(null); }}></div>
          <div className="relative bg-white w-full max-w-3xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[95vh] flex flex-col">
            <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/40">
              <h2 className="text-xl font-bold text-slate-800">{editingRecordId ? '编辑单据' : `登记${current.label}`}</h2>
              <button onClick={() => { setShowModal(false); setForm(emptyForm); setEditingRecordId(null); }} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-10 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {isReceiptOrPayment ? (
                  <>
                    {categoriesForType.length > 0 && (
                      <div className="space-y-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据分类</label>
                  <select 
                          value={form.categoryId}
                          onChange={e => setForm({ ...form, categoryId: e.target.value, customData: {} })}
                          className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="">请选择分类...</option>
                          {categoriesForType.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selectedCategory && (
                      <>
                        {selectedCategory.linkOrder && (
                          <div className="lg:col-span-2">
                            <OrderSearchSelect orders={orders} products={products} value={form.relatedId} onChange={v => setForm({ ...form, relatedId: v })} label="关联工单" />
                          </div>
                        )}
                        {selectedCategory.linkPartner && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{current.partnerLabel}</label>
                            <SearchablePartnerSelect
                              options={partners}
                              categories={partnerCategories}
                              value={form.partner}
                              onChange={name => setForm({ ...form, partner: name })}
                              placeholder="请选择..."
                            />
                          </div>
                        )}
                        {selectedCategory.selectPaymentAccount && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">收支账户</label>
                            <select value={financeAccountTypes.find(a => a.name === form.paymentAccount)?.id ?? ''} onChange={e => { const a = financeAccountTypes.find(x => x.id === e.target.value); setForm({ ...form, paymentAccount: a ? a.name : '' }); }} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                              <option value="">请选择收支账户类型...</option>
                              {financeAccountTypes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
               </div>
                        )}
                        {selectedCategory.linkWorker && (
                          <WorkerSelectWithTabs workers={workers} processNodes={globalNodes} value={form.workerId} onChange={id => setForm({ ...form, workerId: id })} label="关联工人" />
                        )}
                        {selectedCategory.linkProduct && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">关联产品</label>
                            <SearchableProductSelect options={products} categories={categories} value={form.productId} onChange={id => setForm({ ...form, productId: id })} />
                          </div>
                        )}
                        {(selectedCategory.customFields || []).map(field => (
                          <div key={field.id} className="space-y-1">
                            {field.type !== 'boolean' && <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{field.label}</label>}
                            <CustomFieldInput field={field} value={form.customData[field.id]} onChange={v => setForm({ ...form, customData: { ...form.customData, [field.id]: v } })} />
                          </div>
                        ))}
                      </>
                    )}
                    {!selectedCategory && (
                      <div className="space-y-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{current.partnerLabel}</label>
                        <SearchablePartnerSelect
                          options={partners}
                          categories={partnerCategories}
                          value={form.partner}
                          onChange={name => setForm({ ...form, partner: name })}
                          placeholder="请选择..."
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <OrderSearchSelect orders={orders} products={products} value={form.relatedId} onChange={v => setForm({ ...form, relatedId: v })} label="关联工单 / 计件参考" />
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{current.partnerLabel}</label>
                      <SearchablePartnerSelect
                        options={partners}
                        categories={partnerCategories}
                        value={form.partner}
                        onChange={name => setForm({ ...form, partner: name })}
                        placeholder="请选择..."
                      />
                    </div>
                  </>
                )}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">结算金额 (CNY)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">备注说明</label>
                  <textarea rows={2} placeholder="输入备注..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>
               </div>
            </div>
            <div className="px-10 py-6 bg-slate-50/80 border-t border-slate-100 shrink-0">
              <button onClick={handleSave} disabled={!canSave} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98]">
                保存单据
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(FinanceOpsView);
