
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  Plus,
  X,
  User,
  Layers,
  CheckCircle2,
  Clock,
  ArrowRightCircle,
  CalendarDays,
  Edit3,
  ArrowRight,
  Split,
  Sliders,
  Printer,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { comparePlansNewestFirst, planNumberSeqForSort, planOrderListSortMs } from '../utils/planOrderSort';
import {
  PlanOrder,
  Product,
  PlanStatus,
  ProductCategory,
  AppDictionaries,
  Worker,
  Equipment,
  NodeAssignment,
  GlobalNodeTemplate,
  BOM,
  PlanFormSettings,
  Partner,
  PartnerCategory,
  PrintTemplate,
  ProductionOrder,
  PrintRenderContext,
} from '../types';
import SplitPlanModal from './plan-order-list/SplitPlanModal';
import PlanFormConfigModal from './plan-order-list/PlanFormConfigModal';
import { HiddenPrintSlot, usePrintTemplateAction } from '../components/print-editor/PrintPreview';
import { createBlankCustomTemplate } from '../utils/printTemplateDefaults';
import {
  moduleHeaderRowClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  secondaryToolbarButtonClass,
} from '../styles/uiDensity';
import PlanFormModal from './plan-order-list/PlanFormModal';
import PlanProductDetail from './plan-order-list/PlanProductDetail';
import PlanDetailPanel from './plan-order-list/PlanDetailPanel';
import { getFileExtFromDataUrl } from '../utils/fileHelpers';
import { plans as plansApi } from '../services/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { planIdToLocalYmd, toLocalDateYmd } from '../utils/localDateTime';

/** 列表交期展示：本地日历日 */
function formatPlanDueDateList(due: string): string {
  return toLocalDateYmd(due) || String(due).trim().slice(0, 10);
}

/** 列表添加日期展示：本地日历日 */
function formatPlanCreatedDateList(created: string | undefined | null): string {
  if (!created) return '';
  return toLocalDateYmd(created) || String(created).trim().slice(0, 10);
}

interface PlanOrderListViewProps {
  productionLinkMode?: 'order' | 'product';
  plans: PlanOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  workers: Worker[];
  equipment: Equipment[];
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  partners: Partner[]; 
  partnerCategories: PartnerCategory[];
  psiRecords?: any[];
  planFormSettings: PlanFormSettings;
  onUpdatePlanFormSettings: (settings: PlanFormSettings) => void;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  /** 进入「打印模版」页签时从服务端拉取最新列表（多标签保存后同步） */
  onRefreshPrintTemplates?: () => void | Promise<void>;
  /** 用于打印模板预览示例数据 */
  orders?: ProductionOrder[];
  onCreatePlan: (plan: PlanOrder) => void | Promise<void>;
  onSplitPlan: (planId: string, newPlans: PlanOrder[]) => void;
  onConvertToOrder: (planId: string) => void;
  onDeletePlan?: (planId: string) => void;
  onUpdateProduct: (product: Product) => Promise<boolean>;
  onUpdatePlan?: (planId: string, updates: Partial<PlanOrder>) => void;
  onAddPSIRecord?: (record: any) => void;
  onAddPSIRecordBatch?: (records: any[]) => Promise<void>;
  onCreateSubPlan?: (params: { productId: string; quantity: number; planId: string; bomNodeId: string }) => void;
  onCreateSubPlans?: (params: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId: string; parentProductId?: string; parentNodeId?: string }> }) => void;
}

/** 计划树根 id → 根及所有子孙计划 id（与后端批次码子树一致） */
function collectSubtreePlanIdsForPlan(rootId: string, allPlans: PlanOrder[]): string[] {
  const childrenMap = new Map<string, PlanOrder[]>();
  for (const p of allPlans) {
    if (!p.parentPlanId) continue;
    if (!childrenMap.has(p.parentPlanId)) childrenMap.set(p.parentPlanId, []);
    childrenMap.get(p.parentPlanId)!.push(p);
  }
  const out: string[] = [];
  let frontier: string[] = [rootId];
  while (frontier.length > 0) {
    out.push(...frontier);
    const next: string[] = [];
    for (const id of frontier) {
      const ch = childrenMap.get(id);
      if (ch) next.push(...ch.map(c => c.id));
    }
    frontier = next;
  }
  return out;
}

const PlanOrderListView: React.FC<PlanOrderListViewProps> = ({ productionLinkMode = 'order', plans, products, categories, dictionaries, workers, equipment, globalNodes, boms, partners, partnerCategories = [], psiRecords = [], planFormSettings, onUpdatePlanFormSettings, printTemplates, onUpdatePrintTemplates, onRefreshPrintTemplates, orders = [], onCreatePlan, onSplitPlan, onConvertToOrder, onDeletePlan, onUpdateProduct, onUpdatePlan, onAddPSIRecord, onAddPSIRecordBatch, onCreateSubPlan, onCreateSubPlans }) => {
  const [showModal, setShowModal] = useState(false);
  const [viewDetailPlanId, setViewDetailPlanId] = useState<string | null>(null);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [showPlanFormConfigModal, setShowPlanFormConfigModal] = useState(false);
  const [planPrintPickerOpen, setPlanPrintPickerOpen] = useState(false);
  const [planPrintPickerPlan, setPlanPrintPickerPlan] = useState<PlanOrder | null>(null);
  const [planListPrintRun, setPlanListPrintRun] = useState<{ template: PrintTemplate; plan: PlanOrder } | null>(null);
  const [splitPlanId, setSplitPlanId] = useState<string | null>(null);
  /** 点击图片查看大图：url 为要放大的图片地址 */
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');

  const [planSearch, setPlanSearch] = useState('');
  const debouncedPlanSearch = useDebouncedValue(planSearch, 300);
  const [planPage, setPlanPage] = useState(1);
  const [totalPlans, setTotalPlans] = useState(0);
  const PLAN_PAGE_SIZE = 20;
  const [fetchedPlans, setFetchedPlans] = useState<PlanOrder[]>([]);
  const planFetchGen = useRef(0);

  const fetchPagedPlans = useCallback(async (page: number, searchTerm: string) => {
    const gen = ++planFetchGen.current;
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(PLAN_PAGE_SIZE) };
      if (searchTerm) params.search = searchTerm;
      const result = await plansApi.listPaginated(params);
      if (gen !== planFetchGen.current) return;
      setFetchedPlans(result.data as PlanOrder[]);
      setTotalPlans(result.total);
    } catch (e) {
      console.error('Failed to fetch paginated plans', e);
    }
  }, []);

  useEffect(() => { setPlanPage(1); }, [debouncedPlanSearch]);
  // 列表数据以分页接口为准；Context 中 plans 在增删改后会变，须同步重拉当前页，否则界面仍显示旧的 fetchedPlans
  useEffect(() => {
    fetchPagedPlans(planPage, debouncedPlanSearch);
  }, [planPage, debouncedPlanSearch, fetchPagedPlans, plans]);

  const displayPlans = fetchedPlans.length > 0 || debouncedPlanSearch || planPage > 1 ? fetchedPlans : plans;
  /** 列表统一按单据生成时间新在前（与后端分页 orderBy 一致，并修正子计划与父计划交错时的展示顺序） */
  const plansForView = useMemo(() => [...displayPlans].sort(comparePlansNewestFirst), [displayPlans]);
  const totalPlanPages = Math.max(1, Math.ceil(totalPlans / PLAN_PAGE_SIZE));

  const splitPlan = splitPlanId ? plans.find(p => p.id === splitPlanId) ?? null : null;
  /** 从计划单号解析拆分组：仅当单号形如「原单-1」「原单-2」…「原单-99」时视为拆分单（本系统拆分生成），避免把 PLN-327611 等普通编号误判为拆分组 */
  const getSplitGroupKey = (planNumber: string): string | null => {
    const m = planNumber.match(/^(.+)-([1-9]\d?)$/);
    return m ? m[1] : null;
  };
  /** 多次拆单后的「根单号」：反复去掉末尾 -数字，如 PLN1-1-2 → PLN1-1 → PLN1，保证同一原单的所有拆单归到同一框 */
  const getRootPlanNumber = (planNumber: string): string => {
    let s = planNumber;
    for (;;) {
      const m = s.match(/^(.+)-([1-9]\d?)$/);
      if (!m) return s;
      s = m[1];
    }
  };
  /** 根单号 → 该原单下所有计划单（含多次拆单后的 PLN1-1-1、PLN1-1-2、PLN1-2 等，仅包含至少有 2 条的同组） */
  const rootToPlans = useMemo(() => {
    const map = new Map<string, PlanOrder[]>();
    plansForView.forEach(p => {
      const root = getRootPlanNumber(p.planNumber);
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(p);
    });
    const multi = new Map<string, PlanOrder[]>();
    map.forEach((arr, root) => { if (arr.length >= 2) multi.set(root, arr); });
    return multi;
  }, [plansForView]);

  /** 父子计划分组：父计划 id → 子计划列表 */
  const parentToSubPlans = useMemo(() => {
    const map = new Map<string, PlanOrder[]>();
    plansForView.filter(p => p.parentPlanId).forEach(p => {
      const pid = p.parentPlanId!;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(p);
    });
    map.forEach(arr => arr.sort(comparePlansNewestFirst));
    return map;
  }, [plansForView]);

  const showPlanListPrintButton = planFormSettings.listPrint?.showPrintButton !== false;
  const planListPrintPickerTemplates = useMemo(() => {
    const allowed = planFormSettings.listPrint?.allowedTemplateIds;
    if (!allowed?.length) return printTemplates;
    return printTemplates.filter(t => allowed.includes(t.id));
  }, [printTemplates, planFormSettings.listPrint?.allowedTemplateIds]);

  const idlePlanPrintTemplate = useMemo(() => createBlankCustomTemplate(80, 60, ' '), []);
  const idlePlanPrintCtx = useMemo<PrintRenderContext>(() => ({}), []);

  const planListActivePrintTemplate = planListPrintRun?.template ?? idlePlanPrintTemplate;
  const planListActivePrintCtx: PrintRenderContext = planListPrintRun
    ? {
        plan: planListPrintRun.plan,
        product: products.find(p => p.id === planListPrintRun.plan.productId),
        printListRows: (planListPrintRun.plan as any)._printListRows ?? undefined,
        labelPerRow: (planListPrintRun.plan as any)._labelPerRow ?? undefined,
        virtualBatch: (planListPrintRun.plan as any)._virtualBatch ?? undefined,
      }
    : idlePlanPrintCtx;

  const { printRef: planListPrintRef, handlePrint: handlePlanListPrint } = usePrintTemplateAction(
    planListActivePrintTemplate,
    planListActivePrintCtx,
  );

  useEffect(() => {
    if (!planListPrintRun) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const maybePromise = handlePlanListPrint();
      if (maybePromise && typeof (maybePromise as any).then === 'function') {
        (maybePromise as Promise<void>).finally(() => {
          if (!cancelled) setPlanListPrintRun(null);
        });
      } else {
        setTimeout(() => { if (!cancelled) setPlanListPrintRun(null); }, 1000);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [planListPrintRun, handlePlanListPrint]);

  const openPlanPrintPicker = useCallback(
    (plan: PlanOrder) => {
      if (!planListPrintPickerTemplates.length) {
        toast.error('暂无可用打印模板，请先在「表单配置 → 打印模版」中创建模板');
        return;
      }
      setPlanPrintPickerPlan(plan);
      setPlanPrintPickerOpen(true);
    },
    [planListPrintPickerTemplates],
  );

  const labelPrintPickerTemplates = useMemo(() => {
    const allowed = planFormSettings.labelPrint?.allowedTemplateIds;
    if (!allowed?.length) return printTemplates;
    return printTemplates.filter(t => allowed.includes(t.id));
  }, [printTemplates, planFormSettings.labelPrint?.allowedTemplateIds]);

  /** 递归获取某计划下所有子孙计划（深度优先，用于列表展示），返回 { plan, depth } */
  const getAllDescendantsWithDepth = (planId: string, depth: number): { plan: PlanOrder; depth: number }[] => {
    const direct = parentToSubPlans.get(planId) || [];
    const result: { plan: PlanOrder; depth: number }[] = [];
    direct.forEach(p => {
      result.push({ plan: p, depth });
      result.push(...getAllDescendantsWithDepth(p.id, depth + 1));
    });
    return result;
  };

  /** 是否存在未下达的子计划（用于显示「补充下达子工单」） */
  const hasUnconvertedSubPlans = (planId: string) =>
    getAllDescendantsWithDepth(planId, 1).some(d => d.plan.status !== PlanStatus.CONVERTED);

  /** 列表展示块：单条 或 拆分组 或 父计划+子计划分组 */
  type ListBlock = { type: 'single'; plan: PlanOrder } | { type: 'group'; groupKey: string; plans: PlanOrder[] } | { type: 'parentChild'; parent: PlanOrder; children: PlanOrder[] };
  const listBlocks = useMemo((): ListBlock[] => {
    const blocks: ListBlock[] = [];
    const used = new Set<string>();
    for (const plan of plansForView) {
      if (used.has(plan.id)) continue;
      if (plan.parentPlanId) continue;
      const root = getRootPlanNumber(plan.planNumber);
      if (rootToPlans.has(root)) {
        const groupPlans = rootToPlans.get(root)!;
        groupPlans.forEach(p => used.add(p.id));
        blocks.push({
          type: 'group',
          groupKey: root,
          plans: [...groupPlans].sort(comparePlansNewestFirst),
        });
      } else {
        const children = parentToSubPlans.get(plan.id) || [];
        if (children.length > 0) {
          used.add(plan.id);
          const allDescendants = getAllDescendantsWithDepth(plan.id, 1).map(d => d.plan);
          allDescendants.forEach(p => used.add(p.id));
          blocks.push({ type: 'parentChild', parent: plan, children });
        } else {
          used.add(plan.id);
          blocks.push({ type: 'single', plan });
        }
      }
    }
    const maxPlanSubtreeListSortMs = (root: PlanOrder, subMap: Map<string, PlanOrder[]>): number => {
      let m = planOrderListSortMs(root);
      const stack = [...(subMap.get(root.id) ?? [])];
      while (stack.length) {
        const c = stack.pop()!;
        m = Math.max(m, planOrderListSortMs(c));
        for (const x of subMap.get(c.id) ?? []) stack.push(x);
      }
      return m;
    };
    const blockCreatedMs = (b: ListBlock): number => {
      switch (b.type) {
        case 'single':
          return planOrderListSortMs(b.plan);
        case 'group':
          return Math.max(0, ...b.plans.map(planOrderListSortMs));
        case 'parentChild':
          return maxPlanSubtreeListSortMs(b.parent, parentToSubPlans);
        default:
          return 0;
      }
    };
    const blockPrimaryPlanNumber = (b: ListBlock): string =>
      b.type === 'single' ? b.plan.planNumber : b.type === 'group' ? b.groupKey : b.parent.planNumber;
    const blockTieId = (b: ListBlock): string =>
      b.type === 'single' ? b.plan.id : b.type === 'group' ? b.groupKey : b.parent.id;
    return blocks.sort((a, b) => {
      const n = planNumberSeqForSort(blockPrimaryPlanNumber(b)) - planNumberSeqForSort(blockPrimaryPlanNumber(a));
      if (n !== 0) return n;
      const d = blockCreatedMs(b) - blockCreatedMs(a);
      if (d !== 0) return d;
      return blockTieId(a).localeCompare(blockTieId(b));
    });
  }, [plansForView, rootToPlans, parentToSubPlans]);

  return (
    <>
    <HiddenPrintSlot template={planListActivePrintTemplate} ctx={planListActivePrintCtx} printRef={planListPrintRef} />
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>生产计划单</h1>
          <p className={pageSubtitleClass}>从需求预测到生产指令的初步规划</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full sm:w-auto">
          <div className="relative w-full sm:w-56 sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="搜索计划单号、客户..."
              value={planSearch}
              onChange={e => setPlanSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPlanFormConfigModal(true)}
              className={secondaryToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
            <button type="button" onClick={() => setShowModal(true)} className={primaryToolbarButtonClass}>
              <Plus className="w-4 h-4 shrink-0" /> 创建生产计划
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
          {plansForView.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
              <CalendarRange className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">暂无生产计划数据</p>
            </div>
          ) : (
            listBlocks.map((block, blockIdx) => {
              if (block.type === 'single') {
                const plan = block.plan;
              const product = products.find(p => p.id === plan.productId);
              const totalQty = plan.items && Array.isArray(plan.items) ? plan.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : 0;
              const assignedCount = plan.assignments ? Object.values(plan.assignments).filter(a => (a as NodeAssignment).workerIds && (a as NodeAssignment).workerIds.length > 0).length : 0;
                const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                const customListFields = planFormSettings.customFields.filter(f => f.showInList);
                const createdDateRaw = plan.createdAt || planIdToLocalYmd(plan.id);
                const createdDate = formatPlanCreatedDateList(createdDateRaw);
              return (
                <div key={plan.id} className="bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group flex items-center justify-between">
                  <div className="flex items-center gap-4">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => setImagePreviewUrl(product.imageUrl)} className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none">
                          <img loading="lazy" decoding="async" src={product.imageUrl} alt={product.name} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${plan.status === PlanStatus.CONVERTED ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                      {plan.status === PlanStatus.CONVERTED ? <CheckCircle2 className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
                    </div>
                      )}
                    <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{plan.planNumber}</span>
                          {showInList('product') && product && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-lg font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                              {product.name || '未知产品'}
                            </button>
                          )}
                          {product && categories.find(c => c.id === product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                            const val = product.categoryCustomData?.[f.id];
                            if (val == null || val === '') return null;
                            if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                              const isImg = val.startsWith('data:image/');
                              const isPdf = val.startsWith('data:application/pdf');
                              if (isImg) return (
                                <span key={f.id} className="inline-flex items-center gap-1">
                                  <img src={val} alt={f.label} className="h-6 w-6 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('image'); }} />
                                  <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                </span>
                              );
                              if (isPdf) return (
                                <span key={f.id} className="inline-flex items-center gap-1">
                                  <button type="button" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">在线查看</button>
                                  <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                </span>
                              );
                              return (
                                <a key={f.id} href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                              );
                            }
                            return <span key={f.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                          })}
                          {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                      </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                          {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                          {showInList('dueDate') && plan.dueDate && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> 交期: {formatPlanDueDateList(plan.dueDate)}</span>}
                          {showInList('createdAt') && createdDate && <span className="flex items-center gap-1 text-slate-500"><CalendarDays className="w-3 h-3" /> 添加: {createdDate}</span>}
                          {customListFields.map(cf => (plan.customData?.[cf.id] != null && plan.customData?.[cf.id] !== '') && <span key={cf.id} className="flex items-center gap-1">{cf.label}: {String(plan.customData[cf.id])}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewDetailPlanId(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold transition-all border border-slate-100">
                        <Edit3 className="w-3.5 h-3.5" /> 详情
                    </button>
                    {showPlanListPrintButton && (
                      <button
                        type="button"
                        onClick={() => openPlanPrintPicker(plan)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                      >
                        <Printer className="w-3.5 h-3.5" /> 打印
                      </button>
                    )}
                    {plan.status !== PlanStatus.CONVERTED ? (
                      <button onClick={() => onConvertToOrder(plan.id)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black transition-all flex items-center gap-1.5">
                          <ArrowRightCircle className="w-3.5 h-3.5" /> 下达工单
                      </button>
                    ) : hasUnconvertedSubPlans(plan.id) ? (
                      <button onClick={() => onConvertToOrder(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white hover:bg-amber-600 rounded-xl text-xs font-bold transition-all border border-amber-400">
                        <ArrowRightCircle className="w-3.5 h-3.5" /> 补充下达子工单
                      </button>
                    ) : (
                      <div className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200">已转正式工单</div>
                    )}
                    </div>
                  </div>
                );
              }
              if (block.type === 'parentChild') {
                const { parent, children } = block;
                const allWithDepth = [{ plan: parent, depth: 0 }, ...getAllDescendantsWithDepth(parent.id, 1)];
                const allPlans = allWithDepth.map(d => d.plan);
                return (
                  <div key={`parentChild-${parent.id}`} className="rounded-[32px] border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-bold text-slate-800">主计划及子计划（共 {allPlans.length} 条）</span>
                    </div>
                    <div className="p-2.5 space-y-1.5">
                      {allWithDepth.map(({ plan, depth }, idx) => {
                        const product = products.find(p => p.id === plan.productId);
                        const totalQty = plan.items && Array.isArray(plan.items) ? plan.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : 0;
                        const isChild = depth > 0;
                        const indentPx = isChild ? 24 * depth : 0;
                        const assignedCount = plan.assignments ? Object.values(plan.assignments).filter(a => (a as NodeAssignment).workerIds && (a as NodeAssignment).workerIds.length > 0).length : 0;
                        const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                        const customListFields = planFormSettings.customFields.filter(f => f.showInList);
                        const createdDateRaw = plan.createdAt || planIdToLocalYmd(plan.id);
                        const createdDate = formatPlanCreatedDateList(createdDateRaw);
                        return (
                          <div key={plan.id} className={`bg-white px-5 py-2 rounded-2xl border transition-all flex items-center justify-between ${isChild ? 'border-l-4 border-l-slate-300 border-slate-200' : 'border-slate-200'} hover:shadow-lg hover:border-slate-300`} style={indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                            <div className="flex items-center gap-4">
                              {product?.imageUrl ? (
                                <button type="button" onClick={() => setImagePreviewUrl(product.imageUrl)} className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0"><img loading="lazy" decoding="async" src={product.imageUrl} alt={product.name} className="w-full h-full object-cover block" /></button>
                              ) : (
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.status === PlanStatus.CONVERTED ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                  {plan.status === PlanStatus.CONVERTED ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-3 mb-1 flex-wrap">
                                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase">{plan.planNumber}</span>
                                  {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子计划</span>}
                                  {showInList('product') && product && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-base font-bold text-slate-800 hover:text-indigo-600 hover:underline">{product.name || '未知产品'}</button>
                                  )}
                                  {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                  {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                                  {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                                  {showInList('dueDate') && plan.dueDate && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> 交期: {formatPlanDueDateList(plan.dueDate)}</span>}
                                  {showInList('createdAt') && createdDate && <span className="flex items-center gap-1 text-slate-500"><CalendarDays className="w-3 h-3" /> 添加: {createdDate}</span>}
                                  {customListFields.map(cf => (plan.customData?.[cf.id] != null && plan.customData?.[cf.id] !== '') && <span key={cf.id} className="flex items-center gap-1">{cf.label}: {String(plan.customData[cf.id])}</span>)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setViewDetailPlanId(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold border border-slate-100"><Edit3 className="w-3.5 h-3.5" /> 详情</button>
                              {showPlanListPrintButton && (
                                <button
                                  type="button"
                                  onClick={() => openPlanPrintPicker(plan)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Printer className="w-3.5 h-3.5" /> 打印
                                </button>
                              )}
                              {!isChild && plan.status !== PlanStatus.CONVERTED && (
                                <button onClick={() => onConvertToOrder(plan.id)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black flex items-center gap-1.5"><ArrowRightCircle className="w-3.5 h-3.5" /> 下达工单</button>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && hasUnconvertedSubPlans(plan.id) && (
                                <button onClick={() => onConvertToOrder(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white hover:bg-amber-600 rounded-xl text-xs font-bold border border-amber-400"><ArrowRightCircle className="w-3.5 h-3.5" /> 补充下达子工单</button>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && !hasUnconvertedSubPlans(plan.id) && <div className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200">已转工单</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              // block.type === 'group'：同一原单的拆分单用底框包在一起，每个拆分单下展示其子工单（含多级）
              const { groupKey, plans: groupPlans } = block;
              const allPlansInGroup = groupPlans.flatMap(p => [p, ...getAllDescendantsWithDepth(p.id, 1).map(d => d.plan)]);
              return (
                <div key={`group-${groupKey}-${blockIdx}`} className="rounded-[32px] border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2">
                    <Split className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-bold text-slate-800">原单 {groupKey} 拆分（共 {allPlansInGroup.length} 条）</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {groupPlans.flatMap(plan => {
                      const plansWithDepth = [{ plan, depth: 0 }, ...getAllDescendantsWithDepth(plan.id, 1)];
                      return plansWithDepth.map(({ plan: p, depth }) => {
                        const isChild = depth > 0;
                        const plan = p;
                        const product = products.find(pr => pr.id === plan.productId);
                        const totalQty = plan.items && Array.isArray(plan.items) ? plan.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) : 0;
                        const assignedCount = plan.assignments ? Object.values(plan.assignments).filter(a => (a as NodeAssignment).workerIds && (a as NodeAssignment).workerIds.length > 0).length : 0;
                        const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                        const customListFields = planFormSettings.customFields.filter(f => f.showInList);
                        const createdDateRaw = plan.createdAt || planIdToLocalYmd(plan.id);
                        const createdDate = formatPlanCreatedDateList(createdDateRaw);
                        const indentPx = isChild ? 24 * depth : 0;
                        return (
                          <div key={plan.id} className={`bg-white px-5 py-2 rounded-2xl border transition-all flex items-center justify-between ${isChild ? 'border-l-4 border-l-slate-300 border-slate-200' : 'border-slate-200'} hover:shadow-lg hover:border-slate-300`} style={indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                          <div className="flex items-center gap-4">
                            {product?.imageUrl ? (
                              <button type="button" onClick={() => setImagePreviewUrl(product.imageUrl)} className="w-12 h-12 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none">
                                <img loading="lazy" decoding="async" src={product.imageUrl} alt={product.name} className="w-full h-full object-cover block" />
                              </button>
                            ) : (
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.status === PlanStatus.CONVERTED ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                {plan.status === PlanStatus.CONVERTED ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-3 mb-1 flex-wrap">
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{plan.planNumber}</span>
                                {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子计划</span>}
                                {showInList('product') && product && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-base font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                                    {product.name || '未知产品'}
                                  </button>
                                )}
                                {product && categories.find(c => c.id === product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                                  const val = product.categoryCustomData?.[f.id];
                                  if (val == null || val === '') return null;
                                  if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                                    const isImg = val.startsWith('data:image/');
                                    const isPdf = val.startsWith('data:application/pdf');
                                    if (isImg) return (
                                      <span key={f.id} className="inline-flex items-center gap-1">
                                        <img src={val} alt={f.label} className="h-5 w-5 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('image'); }} />
                                        <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                      </span>
                                    );
                                    if (isPdf) return (
                                      <span key={f.id} className="inline-flex items-center gap-1">
                                        <button type="button" onClick={e => { e.stopPropagation(); setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">在线查看</button>
                                        <a href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                      </span>
                                    );
                                    return (
                                      <a key={f.id} href={val} download={`附件.${getFileExtFromDataUrl(val)}`} onClick={e => e.stopPropagation()} className="text-[9px] font-bold text-indigo-500 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100">下载</a>
                                    );
                                  }
                                  return <span key={f.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                                })}
                                {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                                {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                                {showInList('dueDate') && plan.dueDate && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> 交期: {formatPlanDueDateList(plan.dueDate)}</span>}
                                {showInList('createdAt') && createdDate && <span className="flex items-center gap-1 text-slate-500"><CalendarDays className="w-3 h-3" /> 添加: {createdDate}</span>}
                                {customListFields.map(cf => (plan.customData?.[cf.id] != null && plan.customData?.[cf.id] !== '') && <span key={cf.id} className="flex items-center gap-1">{cf.label}: {String(plan.customData[cf.id])}</span>)}
                              </div>
                            </div>
                          </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setViewDetailPlanId(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl text-xs font-bold border border-slate-100">
                                <Edit3 className="w-3.5 h-3.5" /> 详情
                              </button>
                              {showPlanListPrintButton && (
                                <button
                                  type="button"
                                  onClick={() => openPlanPrintPicker(plan)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Printer className="w-3.5 h-3.5" /> 打印
                                </button>
                              )}
                              {!isChild && plan.status !== PlanStatus.CONVERTED && (
                                <button onClick={() => onConvertToOrder(plan.id)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black flex items-center gap-1.5">
                                  <ArrowRightCircle className="w-3.5 h-3.5" /> 下达工单
                                </button>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && hasUnconvertedSubPlans(plan.id) && (
                                <button onClick={() => onConvertToOrder(plan.id)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white hover:bg-amber-600 rounded-xl text-xs font-bold border border-amber-400"><ArrowRightCircle className="w-3.5 h-3.5" /> 补充下达子工单</button>
                              )}
                              {!isChild && plan.status === PlanStatus.CONVERTED && !hasUnconvertedSubPlans(plan.id) && <div className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200">已转工单</div>}
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              );
            })
          )}
          {totalPlanPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="text-xs text-slate-400">共 {totalPlans} 条，第 {planPage} / {totalPlanPages} 页</span>
              <button type="button" disabled={planPage <= 1} onClick={() => setPlanPage(p => p - 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">上一页</button>
              <button type="button" disabled={planPage >= totalPlanPages} onClick={() => setPlanPage(p => p + 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">下一页</button>
            </div>
          )}
        </div>

      <PlanFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        products={products}
        categories={categories}
        dictionaries={dictionaries}
        partners={partners}
        partnerCategories={partnerCategories}
        planFormSettings={planFormSettings}
        plans={plans}
        productionLinkMode={productionLinkMode}
        onSave={async (plan) => {
          await Promise.resolve(onCreatePlan(plan));
        }}
        onImagePreview={(url) => setImagePreviewUrl(url)}
        onFilePreview={(url, type) => { setFilePreviewUrl(url); setFilePreviewType(type); }}
      />

      {viewDetailPlanId && (
        <PlanDetailPanel
          planId={viewDetailPlanId}
          onClose={() => setViewDetailPlanId(null)}
          plans={plans}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          workers={workers}
          equipment={equipment}
          globalNodes={globalNodes}
          boms={boms}
          partners={partners}
          partnerCategories={partnerCategories}
          psiRecords={psiRecords}
          planFormSettings={planFormSettings}
          orders={orders}
          productionLinkMode={productionLinkMode}
          onUpdatePlan={onUpdatePlan}
          onDeletePlan={onDeletePlan}
          onConvertToOrder={onConvertToOrder}
          onUpdateProduct={onUpdateProduct}
          onAddPSIRecord={onAddPSIRecord}
          onAddPSIRecordBatch={onAddPSIRecordBatch}
          onCreateSubPlan={onCreateSubPlan}
          onCreateSubPlans={onCreateSubPlans}
          onRequestSplit={(plan) => setSplitPlanId(plan.id)}
          onImagePreview={(url) => setImagePreviewUrl(url)}
          onFilePreview={(url, type) => { setFilePreviewUrl(url); setFilePreviewType(type); }}
          onPrintRun={setPlanListPrintRun}
          labelPrintPickerTemplates={labelPrintPickerTemplates}
          printTemplates={printTemplates}
        />
      )}

      {splitPlan && (
        <SplitPlanModal
          plan={splitPlan}
          products={products}
          dictionaries={dictionaries}
          onSplit={onSplitPlan}
          onClose={() => setSplitPlanId(null)}
        />
      )}

      {/* 列表打印：选择模版（仅计划单列表样式，单品码标签请在计划详情「单品码一览」中打印） */}
      {planPrintPickerOpen && planPrintPickerPlan && (() => {
        const pickerPlan = planPrintPickerPlan;

        const handlePickListTemplate = (t: PrintTemplate) => {
          setPlanListPrintRun({ template: t, plan: pickerPlan });
          setPlanPrintPickerOpen(false);
          setPlanPrintPickerPlan(null);
        };

        return (
        <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() => {
              setPlanPrintPickerOpen(false);
              setPlanPrintPickerPlan(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-900">选择打印模版</h3>
                <p className="mt-0.5 text-xs text-slate-500">计划单 {pickerPlan.planNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlanPrintPickerOpen(false);
                  setPlanPrintPickerPlan(null);
                }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="max-h-[min(40vh,280px)] divide-y divide-slate-100 overflow-y-auto p-2">
              {planListPrintPickerTemplates.length === 0 ? (
                <li className="text-center py-6 text-xs text-slate-400">暂无可用模版</li>
              ) : planListPrintPickerTemplates.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handlePickListTemplate(t)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-indigo-50"
                  >
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="shrink-0 text-xs font-bold text-indigo-600">
                      {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        );
      })()}



      {/* 计划单表单配置弹窗 */}
      <PlanFormConfigModal
        open={showPlanFormConfigModal}
        onClose={() => setShowPlanFormConfigModal(false)}
        settings={planFormSettings}
        onSave={onUpdatePlanFormSettings}
        productionLinkMode={productionLinkMode}
        printTemplates={printTemplates}
        onUpdatePrintTemplates={onUpdatePrintTemplates}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
        planFormSettings={planFormSettings}
        plans={plans}
        orders={orders}
        products={products}
      />

      {/* 点击产品图查看大图 */}
      {imagePreviewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 animate-in fade-in" onClick={() => setImagePreviewUrl(null)}>
          <img src={imagePreviewUrl} alt="大图" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          <button type="button" onClick={() => setImagePreviewUrl(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all"><X className="w-6 h-6" /></button>
        </div>
      )}

      {/* 文件预览弹窗 (图片/PDF) */}
      {filePreviewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm" onClick={() => setFilePreviewUrl(null)}>
          <button onClick={() => setFilePreviewUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
            <X className="w-8 h-8" />
          </button>
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {filePreviewType === 'image' ? (
              <img src={filePreviewUrl} alt="预览" className="w-full h-full max-h-[85vh] object-contain" />
            ) : (
              <iframe src={filePreviewUrl} title="PDF 预览" className="w-full h-[85vh] border-0" />
            )}
          </div>
        </div>
      )}

      {viewProductId && (
        <PlanProductDetail
          viewProductId={viewProductId}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          globalNodes={globalNodes}
          boms={boms}
          onClose={() => setViewProductId(null)}
          onFilePreview={(url, type) => { setFilePreviewUrl(url); setFilePreviewType(type); }}
        />
      )}
    </div>
    </>
  );
};

export default PlanOrderListView;
