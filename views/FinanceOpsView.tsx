import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Clock, Search, Building2, User, FileText, Sliders, Printer, FileSpreadsheet, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../services/api';
import {
  FinanceRecord,
  FinanceOpType,
  ProductionOrder,
  FinanceCategory,
  FinanceAccountType,
  Partner,
  Worker,
  Product,
  PartnerCategory,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  FINANCE_DOC_NO_PREFIX,
  ProductMilestoneProgress,
  PlanOrder,
  PrintTemplate,
  ReceiptFormSettings,
  PaymentFormSettings,
} from '../types';
import { PartnerSelect } from '../components/PartnerSelect';
import {
  formConfigToolbarButtonClass,
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  psiOrderBillCompactSummaryBarClass,
  psiOrderBillCompactSummaryLabelClass,
  psiOrderBillCompactSummaryValueClass,
  psiOrderBillFormPartnerTriggerClassCompact,
} from '../styles/uiDensity';
import { PsiListPrintController, type PsiListPrintControllerHandle } from '../components/psi/PsiListPrintPicker';
import { buildReceiptPrintContextFromRecord } from '../utils/buildReceiptPrintContext';
import { buildPaymentPrintContextFromRecord } from '../utils/buildPaymentPrintContext';
import ReceiptFormConfigModal from './finance/ReceiptFormConfigModal';
import PaymentFormConfigModal from './finance/PaymentFormConfigModal';
import FinanceDetailModal from './finance/FinanceDetailModal';
import PartnerProductReconTable from './finance/PartnerProductReconTable';
import FinanceRecordFormModal, { type FinanceRecordFormValues } from './finance/FinanceRecordFormModal';
import FinanceDocFlowListModal from './finance/FinanceDocFlowListModal';
import { FINANCE_FLOW_LABELS } from './finance/financeFlowHelpers';
import WorkerSelectWithTabs from './finance/WorkerSelectWithTabs';
import { type DetailTarget } from './finance/financeDetailTypes';
import { DEFAULT_RECEIPT_FORM_SETTINGS, DEFAULT_PAYMENT_FORM_SETTINGS } from '../contexts/AppDataContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { toLocalCompactYmd, toLocalDateYmd } from '../utils/localDateTime';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useFinanceReconciliation } from '../hooks/useFinanceReconciliation';
import { downloadPartnerReconciliationXlsx } from '../utils/downloadPartnerReconciliationXlsx';
import { downloadSettlementReconciliationXlsx } from '../utils/downloadSettlementReconciliationXlsx';
import { toPartnerStyleProductRows } from '../utils/settlementReconProductLedger';
import { fmtDT } from '../utils/formatTime';
import { hasModulePerm } from '../utils/hasModulePerm';
import { useAuth } from '../contexts/AuthContext';
import { currentOperatorDisplayName } from '../utils/currentOperatorDisplayName';

interface FinanceOpsViewProps {
  type: FinanceOpType;
  orders: ProductionOrder[];
  records: FinanceRecord[];
  /** 全部收付款记录，用于按类型+日期生成单据编号 */
  allRecords: FinanceRecord[];
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
  plans: PlanOrder[];
  receiptFormSettings: ReceiptFormSettings;
  paymentFormSettings: PaymentFormSettings;
  onUpdateReceiptFormSettings: (s: ReceiptFormSettings) => void | Promise<void>;
  onUpdatePaymentFormSettings: (s: PaymentFormSettings) => void | Promise<void>;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
}

const emptyForm: FinanceRecordFormValues = {
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

const FinanceOpsView: React.FC<FinanceOpsViewProps> = ({
  type,
  orders,
  records,
  allRecords,
  productMilestoneProgresses = [],
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  financeCategories,
  financeAccountTypes,
  partners,
  workers,
  products,
  partnerCategories,
  categories,
  globalNodes,
  dictionaries,
  userPermissions,
  tenantRole,
  plans,
  receiptFormSettings,
  paymentFormSettings,
  onUpdateReceiptFormSettings,
  onUpdatePaymentFormSettings,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const _isOwner = tenantRole === 'owner';
  const hasFinancePerm = (permKey: string) => hasModulePerm(tenantRole, userPermissions, 'finance', permKey);
  const financePermModule = type === 'RECEIPT' ? 'receipt' : type === 'PAYMENT' ? 'payment' : 'reconciliation';
  const canView = hasFinancePerm(`finance:${financePermModule}:${financePermModule === 'reconciliation' ? 'allow' : 'view'}`);
  const canCreate = financePermModule !== 'reconciliation' && hasFinancePerm(`finance:${financePermModule}:create`);
  const canEdit = financePermModule !== 'reconciliation' && hasFinancePerm(`finance:${financePermModule}:edit`);
  const canDelete = financePermModule !== 'reconciliation' && hasFinancePerm(`finance:${financePermModule}:delete`);
  const confirm = useConfirm();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detailRecord, setDetailRecord] = useState<DetailTarget | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  /** 编辑现有记录时把详情快照存下来，避免依赖 allRecords 全量 */
  const [editingRecordSnapshot, setEditingRecordSnapshot] = useState<FinanceRecord | null>(null);

  useEffect(() => {
    setShowModal(false);
    setDetailRecord(null);
    setEditingRecordId(null);
    setEditingRecordSnapshot(null);
    setFinanceFlowOpen(false);
  }, [type]);
  const [financeListSearch, setFinanceListSearch] = useState('');
  const debouncedFinanceListSearch = useDebouncedValue(financeListSearch, 300);

  /**
   * Phase 3.A：非对账模式下不再依赖 `AppDataContext.financeRecords` 全量。
   * 直接走后端分页 + 搜索；翻页/搜索只刷当前页。对账模式仍由 hook 内 react-query 处理。
   */
  const FIN_PAGE_SIZE = 20;
  const [finPage, setFinPage] = useState(1);
  const qc = useQueryClient();
  const listSearchTrim = debouncedFinanceListSearch.trim();
  const listEnabled = type !== 'RECONCILIATION';
  const listQuery = useQuery({
    queryKey: ['finance', 'list', type, listSearchTrim, finPage, FIN_PAGE_SIZE],
    queryFn: () =>
      api.finance.listPage({
        type,
        ...(listSearchTrim ? { search: listSearchTrim } : {}),
        page: finPage,
        pageSize: FIN_PAGE_SIZE,
      }),
    enabled: listEnabled,
    staleTime: 15_000,
    placeholderData: prev => prev,
  });
  const pagedDisplayRecords = useMemo<FinanceRecord[]>(
    () => (listQuery.data?.data as FinanceRecord[] | undefined) ?? [],
    [listQuery.data],
  );
  const finTotal = listQuery.data?.total ?? 0;
  const finTotalPages = Math.max(1, Math.ceil(finTotal / FIN_PAGE_SIZE));
  const invalidateFinanceList = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['finance', 'list'] });
    qc.invalidateQueries({ queryKey: ['finance', 'today-count'] });
  }, [qc]);

  /** 今日同 type 笔数：用于"新增"时预生成单号；用 startDate/endDate 收窄 + pageSize=1 仅取 total */
  const todayBounds = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const start = `${y}-${m}-${d}T00:00:00.000`;
    const end = `${y}-${m}-${d}T23:59:59.999`;
    return { ymd: `${y}${m}${d}`, start, end };
  }, []);
  const todayCountQuery = useQuery({
    queryKey: ['finance', 'today-count', type, todayBounds.ymd],
    queryFn: () =>
      api.finance.listPage({
        type,
        startDate: todayBounds.start,
        endDate: todayBounds.end,
        page: 1,
        pageSize: 1,
      }),
    enabled: listEnabled,
    staleTime: 30_000,
  });

  /** Phase 3.A：mutation 完成后失效列表 + today-count；保持原有 onAddRecord/onUpdate/onDelete 写入 context 行为 */
  const handleDeleteRecord = useCallback(
    (id: string) => {
      if (!onDeleteRecord) return;
      const ret = onDeleteRecord(id) as unknown;
      Promise.resolve(ret).finally(invalidateFinanceList);
    },
    [onDeleteRecord, invalidateFinanceList],
  );

  /**
   * 参照报工单：前缀 + yyyyMMdd + '-' + 4位序号，按同类型当日已有记录数+1。
   *
   * Phase 3.A：序号来源由"前端 allRecords 全量遍历"切换为后端 today-count 接口（pageSize=1 仅取 total）；
   * 仅用于前端预览，后端 createRecord 仍会自己调 `generateDocNo` 落库，避免竞态。
   */
  const getNextDocNo = useCallback(() => {
    const todayStr = toLocalCompactYmd(new Date());
    const seq = (todayCountQuery.data?.total ?? 0) + 1;
    const seqStr = String(seq).padStart(4, '0');
    return `${FINANCE_DOC_NO_PREFIX[type]}${todayStr}-${seqStr}`;
  }, [todayCountQuery.data?.total, type]);

  const bizConfig: Record<FinanceOpType, any> = {
    'RECEIPT': { label: '收款单', sub: '登记从客户处收到的款项', partnerLabel: '缴款客户' },
    'PAYMENT': { label: '付款单', sub: '登记支付给供应商或员工的款项', partnerLabel: '收款单位/个人' },
    'RECONCILIATION': { label: '财务对账', sub: '记录往来对账确认结果', partnerLabel: '对账单位' },
    'SETTLEMENT': { label: '工资单', sub: '登记工人的生产计件工资结算记录', partnerLabel: '领薪工人' },
  };

  const current = bizConfig[type];
  const isReceiptOrPayment = type === 'RECEIPT' || type === 'PAYMENT';

  const safeReceiptFormSettings = receiptFormSettings ?? DEFAULT_RECEIPT_FORM_SETTINGS;
  const safePaymentFormSettings = paymentFormSettings ?? DEFAULT_PAYMENT_FORM_SETTINGS;
  const listPrintSlot =
    type === 'RECEIPT' ? safeReceiptFormSettings.listPrint : type === 'PAYMENT' ? safePaymentFormSettings.listPrint : undefined;
  const showListPrintButton = isReceiptOrPayment && listPrintSlot?.showPrintButton !== false;
  const financeListPrintRef = useRef<PsiListPrintControllerHandle>(null);
  const [showReceiptFormConfig, setShowReceiptFormConfig] = useState(false);
  const [showPaymentFormConfig, setShowPaymentFormConfig] = useState(false);
  const [financeFormConfigTab, setFinanceFormConfigTab] = useState<'fields' | 'print'>('fields');
  const [financeFlowOpen, setFinanceFlowOpen] = useState(false);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const orderMap = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const workerMap = useMemo(() => new Map(workers.map(w => [w.id, w])), [workers]);
  const financeCatMap = useMemo(() => new Map(financeCategories.map(c => [c.id, c])), [financeCategories]);

  const recon = useFinanceReconciliation({
    type,
    records,
    partners,
    orders,
    productMilestoneProgresses: productMilestoneProgresses ?? [],
    productMap,
    workerMap,
    financeCatMap,
    globalNodes,
    dictionaries,
    debouncedFinanceListSearch,
  });

  const {
    reconciliationSubTab,
    setReconciliationSubTab,
    reconDateFrom,
    setReconDateFrom,
    reconDateTo,
    setReconDateTo,
    reconPartnerId,
    setReconPartnerId,
    reconWorkerId,
    setReconWorkerId,
    reconQueryDateFrom,
    setReconQueryDateFrom,
    reconQueryDateTo,
    setReconQueryDateTo,
    reconQueryPartnerId,
    setReconQueryPartnerId,
    reconQueryWorkerId,
    setReconQueryWorkerId,
    reconHasFilter,
    reconQueryDateFromT,
    reconQueryDateToT,
    inFinanceDateRangeQuery,
    partnerReconList,
    settlementReconList,
    partnerReconListFiltered,
    settlementReconListFiltered,
    partnerReconWithBalance,
    partnerReconSummary,
    partnerOpeningBalanceLoading,
    partnerReconViewMode,
    setPartnerReconViewMode,
    partnerProductReconList,
    partnerProductReconListFiltered,
    settlementReconWithBalance,
    settlementReconSummary,
    settlementReconViewMode,
    setSettlementReconViewMode,
    settlementProductReconList,
    settlementProductReconListFiltered,
    displayRecords,
    tableSourceRecords,
    reconLoading,
  } = recon;

  const partnerQueryDisplayName = useMemo(
    () => partners.find(p => p.id === reconQueryPartnerId)?.name?.trim() ?? '',
    [partners, reconQueryPartnerId],
  );

  const workerQueryDisplayName = useMemo(
    () => workers.find(w => w.id === reconQueryWorkerId)?.name?.trim() ?? '',
    [workers, reconQueryWorkerId],
  );

  const canExportPartnerReconciliation =
    type === 'RECONCILIATION' &&
    reconciliationSubTab === 'partner' &&
    reconHasFilter &&
    !!partnerReconSummary &&
    !reconLoading &&
    !partnerOpeningBalanceLoading;

  const handleExportPartnerReconciliation = useCallback(async () => {
    if (!partnerReconSummary) {
      toast.warning('请先完成查询后再导出');
      return;
    }
    try {
      await downloadPartnerReconciliationXlsx({
        dateFrom: reconQueryDateFromT,
        dateTo: reconQueryDateToT,
        partnerName: partnerQueryDisplayName || reconQueryPartnerId || '合作单位',
        summary: partnerReconSummary,
        viewMode: partnerReconViewMode,
        documentRows: partnerReconWithBalance,
        productRows: partnerProductReconListFiltered,
      });
      toast.success('已导出 Excel');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败');
    }
  }, [
    partnerReconSummary,
    reconQueryDateFromT,
    reconQueryDateToT,
    partnerQueryDisplayName,
    reconQueryPartnerId,
    partnerReconViewMode,
    partnerReconWithBalance,
    partnerProductReconListFiltered,
  ]);

  const canExportSettlementReconciliation =
    type === 'RECONCILIATION' &&
    reconciliationSubTab === 'settlement' &&
    reconHasFilter &&
    !!settlementReconSummary &&
    !reconLoading;

  const handleExportSettlementReconciliation = useCallback(async () => {
    if (!settlementReconSummary) {
      toast.warning('请先完成查询后再导出');
      return;
    }
    try {
      await downloadSettlementReconciliationXlsx({
        dateFrom: reconQueryDateFromT,
        dateTo: reconQueryDateToT,
        workerName: workerQueryDisplayName || reconQueryWorkerId || '工人',
        summary: settlementReconSummary,
        viewMode: settlementReconViewMode,
        documentRows: settlementReconWithBalance,
        productRows: settlementProductReconListFiltered,
      });
      toast.success('已导出 Excel');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败');
    }
  }, [
    settlementReconSummary,
    reconQueryDateFromT,
    reconQueryDateToT,
    workerQueryDisplayName,
    reconQueryWorkerId,
    settlementReconViewMode,
    settlementReconWithBalance,
    settlementProductReconListFiltered,
  ]);

  const settlementProductRowsForTable = useMemo(
    () => toPartnerStyleProductRows(settlementProductReconListFiltered),
    [settlementProductReconListFiltered],
  );

  useEffect(() => {
    setFinanceListSearch('');
  }, [type, reconciliationSubTab, partnerReconViewMode, settlementReconViewMode]);

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
    setEditingRecordSnapshot(rec);
  }, []);

  const handleSave = () => {
    if (editingRecordId) {
      const existing = editingRecordSnapshot ?? allRecords.find(r => r.id === editingRecordId);
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
        invalidateFinanceList();
      }
      setShowModal(false);
      setForm(emptyForm);
      setEditingRecordId(null);
      setEditingRecordSnapshot(null);
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
      operator: docOperator,
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
    invalidateFinanceList();
    setShowModal(false);
    setForm(emptyForm);
  };

  const needPartner = !selectedCategory || selectedCategory.linkPartner === true;
  const canSaveReceiptPayment = form.amount > 0 && (!needPartner || form.partner.trim() !== '') && (!categoriesForType.length || form.categoryId);
  const canSaveOther = form.amount > 0 && form.partner.trim() !== '';
  const canSave = isReceiptOrPayment ? canSaveReceiptPayment : canSaveOther;

  useEffect(() => { setFinPage(1); }, [type, debouncedFinanceListSearch, reconciliationSubTab, reconQueryPartnerId, reconQueryWorkerId]);

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
                    onClick={() => {
                      setReconciliationSubTab('partner');
                      setSettlementReconViewMode('document');
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${reconciliationSubTab === 'partner' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Building2 className="w-3.5 h-3.5" /> 合作单位
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReconciliationSubTab('settlement');
                      setPartnerReconViewMode('document');
                      setSettlementReconViewMode('document');
                    }}
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full sm:w-auto">
            {(type !== 'RECONCILIATION') && (
              <div className="relative w-full sm:w-56 sm:max-w-xs">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  placeholder={type === 'RECONCILIATION' ? '在当前对账结果中搜索…' : '搜索单号、对方、金额、备注、分类…'}
                  value={financeListSearch}
                  onChange={e => setFinanceListSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>
            )}
            {type !== 'RECONCILIATION' &&
              ((isReceiptOrPayment && canView) ||
                canCreate ||
                (isReceiptOrPayment &&
                  canEdit &&
                  (type === 'RECEIPT' ? onUpdateReceiptFormSettings : onUpdatePaymentFormSettings))) && (
                <div className="flex flex-wrap items-center gap-2 shrink-0 mt-0 sm:mt-0">
                  {isReceiptOrPayment && canEdit && type === 'RECEIPT' && onUpdateReceiptFormSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setFinanceFormConfigTab('fields');
                        setShowReceiptFormConfig(true);
                      }}
                      className={formConfigToolbarButtonClass}
                    >
                      <Sliders className="w-4 h-4 shrink-0" /> 表单配置
                    </button>
                  )}
                  {isReceiptOrPayment && canEdit && type === 'PAYMENT' && onUpdatePaymentFormSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setFinanceFormConfigTab('fields');
                        setShowPaymentFormConfig(true);
                      }}
                      className={formConfigToolbarButtonClass}
                    >
                      <Sliders className="w-4 h-4 shrink-0" /> 表单配置
                    </button>
                  )}
                  {isReceiptOrPayment && canView && (
                    <button
                      type="button"
                      onClick={() => setFinanceFlowOpen(true)}
                      className={outlineToolbarButtonClass}
                    >
                      <ScrollText className="w-4 h-4 shrink-0" />{' '}
                      {FINANCE_FLOW_LABELS[type]}
                    </button>
                  )}
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecordId(null);
                        setForm(emptyForm);
                        setShowModal(true);
                      }}
                      className={primaryToolbarButtonClass}
                    >
                      <Plus className="w-4 h-4 shrink-0" /> 新增{current.label}
                    </button>
                  )}
                </div>
              )}
          </div>
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
                    <PartnerSelect
                      options={partners}
                      categories={partnerCategories}
                      value={reconPartnerId}
                      onChange={(_, id) => setReconPartnerId(id)}
                      valueMode="id"
                      placeholder="请选择合作单位"
                      triggerClassName={`${psiOrderBillFormPartnerTriggerClassCompact} bg-white border border-slate-200`}
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
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPartnerReconViewMode('document')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${partnerReconViewMode === 'document' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    按单据
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartnerReconViewMode('product')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${partnerReconViewMode === 'product' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    按产品
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!canExportPartnerReconciliation}
                  onClick={() => void handleExportPartnerReconciliation()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> 导出 Excel
                </button>
                {reconHasFilter && (
                  <div className="relative w-full sm:w-56 sm:max-w-xs">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="search"
                      placeholder="在当前对账结果中搜索…"
                      value={financeListSearch}
                      onChange={e => setFinanceListSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  </div>
                )}
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
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSettlementReconViewMode('document')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${settlementReconViewMode === 'document' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    按单据
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlementReconViewMode('product')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${settlementReconViewMode === 'product' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    按产品
                  </button>
                </div>
                <button
                  type="button"
                  disabled={!canExportSettlementReconciliation}
                  onClick={() => void handleExportSettlementReconciliation()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> 导出 Excel
                </button>
                {reconHasFilter && (
                  <div className="relative w-full sm:w-56 sm:max-w-xs">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="search"
                      placeholder="在当前对账结果中搜索…"
                      value={financeListSearch}
                      onChange={e => setFinanceListSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-xs font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {type === 'RECONCILIATION' && reconciliationSubTab === 'partner' && reconHasFilter && (
        <div className={`${psiOrderBillCompactSummaryBarClass} grid grid-cols-2 sm:grid-cols-4 gap-4`}>
          {partnerOpeningBalanceLoading || reconLoading ? (
            <p className="col-span-full text-center text-sm font-bold text-white/90 py-1">计算中…</p>
          ) : partnerReconSummary ? (
            <>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>上期余额</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  ¥ {partnerReconSummary.openingBalance.toLocaleString()}
                </p>
              </div>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>本期累计增加</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  {partnerReconSummary.periodInc > 0
                    ? `¥ ${partnerReconSummary.periodInc.toLocaleString()}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>本期累计减少</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  {partnerReconSummary.periodDec > 0
                    ? `¥ ${partnerReconSummary.periodDec.toLocaleString()}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>本期应收余额</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  ¥ {partnerReconSummary.closingBalance.toLocaleString()}
                </p>
              </div>
            </>
          ) : null}
        </div>
      )}

      {type === 'RECONCILIATION' && reconciliationSubTab === 'settlement' && reconHasFilter && (
        <div className={`${psiOrderBillCompactSummaryBarClass} grid grid-cols-2 sm:grid-cols-4 gap-4`}>
          {reconLoading ? (
            <p className="col-span-full text-center text-sm font-bold text-white/90 py-1">计算中…</p>
          ) : settlementReconSummary ? (
            <>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>上期余额</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  ¥ {settlementReconSummary.openingBalance.toLocaleString()}
                </p>
              </div>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>本期累计增加</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  {settlementReconSummary.periodInc > 0
                    ? `¥ ${settlementReconSummary.periodInc.toLocaleString()}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>本期累计减少</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  {settlementReconSummary.periodDec > 0
                    ? `¥ ${settlementReconSummary.periodDec.toLocaleString()}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className={psiOrderBillCompactSummaryLabelClass}>本期应收余额</p>
                <p className={`${psiOrderBillCompactSummaryValueClass} text-white`}>
                  ¥ {settlementReconSummary.closingBalance.toLocaleString()}
                </p>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* 数据列表 */}
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {type === 'RECONCILIATION' &&
          reconciliationSubTab === 'partner' &&
          partnerReconViewMode === 'product' ? (
            !reconHasFilter ? (
              <div className="px-8 py-20 text-center text-slate-300 italic text-sm">请选择合作单位后点击查询</div>
            ) : reconLoading ? (
              <div className="px-8 py-20 text-center text-slate-300 text-sm">加载中…</div>
            ) : (
              <PartnerProductReconTable
                rows={partnerProductReconListFiltered}
                emptyMessage={
                  debouncedFinanceListSearch.trim() &&
                  partnerProductReconList.length > 0 &&
                  partnerProductReconListFiltered.length === 0
                    ? '无匹配项，请调整搜索关键词'
                    : '该条件下暂无对账单据'
                }
              />
            )
          ) : type === 'RECONCILIATION' &&
            reconciliationSubTab === 'settlement' &&
            settlementReconViewMode === 'product' ? (
            !reconHasFilter ? (
              <div className="px-8 py-20 text-center text-slate-300 italic text-sm">请选择工人后点击查询</div>
            ) : reconLoading ? (
              <div className="px-8 py-20 text-center text-slate-300 text-sm">加载中…</div>
            ) : (
              <PartnerProductReconTable
                rows={settlementProductRowsForTable}
                emptyMessage={
                  debouncedFinanceListSearch.trim() &&
                  settlementProductReconList.length > 0 &&
                  settlementProductReconListFiltered.length === 0
                    ? '无匹配项，请调整搜索关键词'
                    : '该条件下暂无对账单据'
                }
              />
            )
          ) : (
            <>
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
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center min-w-[9rem]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(() => {
                const isPartnerRecon = type === 'RECONCILIATION' && reconciliationSubTab === 'partner';
                const isSettlementRecon = type === 'RECONCILIATION' && reconciliationSubTab === 'settlement';
                const listLength = isPartnerRecon ? partnerReconWithBalance.length : isSettlementRecon ? settlementReconWithBalance.length : pagedDisplayRecords.length;
                const colSpan = (isPartnerRecon || isSettlementRecon) ? 8 : 6;
                const qFin = debouncedFinanceListSearch.trim();
                let emptyMsg =
                  type === 'RECONCILIATION'
                    ? !reconHasFilter
                      ? reconciliationSubTab === 'partner'
                        ? '请选择合作单位后点击查询'
                        : '请选择工人后点击查询'
                      : '该条件下暂无对账单据'
                    : listQuery.isLoading
                      ? '加载中…'
                      : '暂无该模块财务记录';
                if (type === 'RECONCILIATION' && reconHasFilter) {
                  if (isPartnerRecon && partnerReconList.length > 0 && partnerReconWithBalance.length === 0 && qFin) emptyMsg = '无匹配项，请调整搜索关键词';
                  else if (isSettlementRecon && settlementReconList.length > 0 && settlementReconWithBalance.length === 0 && qFin) emptyMsg = '无匹配项，请调整搜索关键词';
                } else if (type !== 'RECONCILIATION' && !listQuery.isLoading && finTotal === 0 && qFin) {
                  emptyMsg = '无匹配项，请调整搜索关键词';
                }
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
                        <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">{rec.sourceReworkId ? '返工收回' : '外协收回'}</span></td>
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
                      <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailRecord(rec)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        {showListPrintButton && canView && (
                          <button
                            type="button"
                            onClick={() => {
                              void onRefreshPrintTemplates?.();
                              financeListPrintRef.current?.openPicker(rec.id);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all whitespace-nowrap shrink-0"
                          >
                            <Printer className="w-3.5 h-3.5" /> 打印
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
          {finTotalPages > 1 && type !== 'RECONCILIATION' && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="text-xs text-slate-400">共 {finTotal} 条，第 {finPage} / {finTotalPages} 页</span>
              <button type="button" disabled={finPage <= 1} onClick={() => setFinPage(p => p - 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">上一页</button>
              <button type="button" disabled={finPage >= finTotalPages} onClick={() => setFinPage(p => p + 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">下一页</button>
            </div>
          )}
            </>
          )}
        </div>
      </div>

      <FinanceDetailModal
        detailRecord={detailRecord}
        onClose={() => setDetailRecord(null)}
        fillFormFromRecord={fillFormFromRecord}
        setEditingRecordId={setEditingRecordId}
        setShowModal={setShowModal}
        setDetailRecord={setDetailRecord}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord ? handleDeleteRecord : undefined}
        canEdit={canEdit}
        canDelete={canDelete}
        confirm={confirm}
        showListPrintButton={showListPrintButton}
        canView={canView}
        financeListPrintRef={financeListPrintRef}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
        orders={orders}
        productMap={productMap}
        workerMap={workerMap}
        globalNodes={globalNodes}
        dictionaries={dictionaries}
        categories={categories}
        financeCatMap={financeCatMap}
        bizConfig={bizConfig}
        current={current}
        type={type}
      />

      <FinanceRecordFormModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setForm(emptyForm);
          setEditingRecordId(null);
          setEditingRecordSnapshot(null);
        }}
        editingRecordId={editingRecordId}
        current={current}
        isReceiptOrPayment={isReceiptOrPayment}
        categoriesForType={categoriesForType}
        selectedCategory={selectedCategory}
        form={form}
        setForm={setForm}
        handleSave={handleSave}
        canSave={canSave}
        orders={orders}
        products={products}
        partners={partners}
        partnerCategories={partnerCategories}
        categories={categories}
        workers={workers}
        globalNodes={globalNodes}
        financeAccountTypes={financeAccountTypes}
      />

      {showReceiptFormConfig && (
        <ReceiptFormConfigModal
          open={showReceiptFormConfig}
          onClose={() => setShowReceiptFormConfig(false)}
          defaultTabWhenOpen={financeFormConfigTab}
          settings={safeReceiptFormSettings}
          onSave={onUpdateReceiptFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
      )}
      {showPaymentFormConfig && (
        <PaymentFormConfigModal
          open={showPaymentFormConfig}
          onClose={() => setShowPaymentFormConfig(false)}
          defaultTabWhenOpen={financeFormConfigTab}
          settings={safePaymentFormSettings}
          onSave={onUpdatePaymentFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
      )}

      {isReceiptOrPayment && (
        <PsiListPrintController<FinanceRecord>
          ref={financeListPrintRef}
          listPrintSlot={listPrintSlot}
          printTemplates={printTemplates}
          resolveDocItems={recId => {
            const hit = pagedDisplayRecords.find(r => r.id === recId) ?? records.find(r => r.id === recId);
            return hit ? [hit] : [];
          }}
          buildContext={(_t, { docItems }) => {
            const rec = docItems[0];
            if (!rec) return {};
            if (rec.type === 'RECEIPT') {
              return buildReceiptPrintContextFromRecord({
                record: rec,
                categoryMap: financeCatMap,
                productMap,
                workerMap,
                orderMap,
                orders,
              });
            }
            return buildPaymentPrintContextFromRecord({
              record: rec,
              categoryMap: financeCatMap,
              productMap,
              workerMap,
              orderMap,
              orders,
            });
          }}
          pickerSubtitle={recId => {
            const r = pagedDisplayRecords.find(x => x.id === recId) ?? records.find(x => x.id === recId);
            return `${current.label} ${r?.docNo || r?.id || recId}`;
          }}
          onAddPrintTemplate={
            type === 'RECEIPT' && onUpdateReceiptFormSettings
              ? () => {
                  setFinanceFormConfigTab('print');
                  setShowReceiptFormConfig(true);
                }
              : type === 'PAYMENT' && onUpdatePaymentFormSettings
                ? () => {
                    setFinanceFormConfigTab('print');
                    setShowPaymentFormConfig(true);
                  }
                : undefined
          }
        />
      )}

      {isReceiptOrPayment && financeFlowOpen && (
        <FinanceDocFlowListModal
          recordType={type}
          open={financeFlowOpen}
          onClose={() => setFinanceFlowOpen(false)}
          onOpenDetail={rec => {
            setFinanceFlowOpen(false);
            setDetailRecord(rec);
          }}
          products={products}
          financeCategories={financeCategories}
        />
      )}
    </div>
  );
};

export default React.memo(FinanceOpsView);
