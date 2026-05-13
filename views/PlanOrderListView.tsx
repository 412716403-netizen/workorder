
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
  Edit3,
  ArrowRight,
  Split,
  Sliders,
  Printer,
  Search,
  CalendarClock,
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
  PlanFormFieldConfig,
} from '../types';
import { effectivePlanFormFieldType } from '../utils/planFormCustomField';
import SplitPlanModal from './plan-order-list/SplitPlanModal';
import PlanFormConfigModal from './plan-order-list/PlanFormConfigModal';
import { HiddenPrintSlot, usePrintTemplateAction } from '../components/print-editor/PrintPreview';
import { createBlankCustomTemplate } from '../utils/printTemplateDefaults';
import { buildPlanPrintListRows } from '../utils/buildPlanPrintListRows';
import {
  formConfigToolbarButtonClass,
  moduleHeaderRowClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
} from '../styles/uiDensity';
import PlanFormModal from './plan-order-list/PlanFormModal';
import PlanProductDetail from './plan-order-list/PlanProductDetail';
import PlanDetailPanel from './plan-order-list/PlanDetailPanel';
import { PlanPrintTemplateManageDialog } from '../components/plan-print/PlanPrintTemplateManageDialog';
import { plans as plansApi } from '../services/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatPlanOrderCreatedAtForList, toLocalDateYmd } from '../utils/localDateTime';
import { getProductCategoryCustomFieldEntries } from '../utils/reportCustomDocField';

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
  onUpdateProduct: (product: Product) => Promise<Product | null>;
  onUpdatePlan?: (planId: string, updates: Partial<PlanOrder>) => void | Promise<void>;
  /** 计划交期变更时同步关联工单（需工单编辑权限） */
  onUpdateOrder?: (orderId: string, updates: Partial<ProductionOrder>) => void | Promise<void>;
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

function renderPlanListCustomFieldValue(
  cf: PlanFormFieldConfig,
  plan: PlanOrder,
  setImagePreviewUrl: (u: string | null) => void,
  setFilePreviewUrl: (u: string | null) => void,
  setFilePreviewType: (t: 'image' | 'pdf') => void,
): React.ReactNode {
  const raw = plan.customData?.[cf.id];
  if (raw == null || raw === '') return null;
  const t = effectivePlanFormFieldType(cf);
  const s = String(raw);
  if (t === 'file' && s.startsWith('data:image/')) {
    return (
      <span key={cf.id} className="flex shrink-0 items-center gap-1">
        <span className="text-slate-500">{cf.label}:</span>
        <button
          type="button"
          onClick={() => setImagePreviewUrl(s)}
          className="h-7 w-7 shrink-0 overflow-hidden rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <img src={s} alt="" className="h-full w-full object-cover" />
        </button>
      </span>
    );
  }
  if (t === 'file' && s.startsWith('data:application/pdf')) {
    return (
      <span key={cf.id} className="flex shrink-0 items-center gap-1">
        <span className="text-slate-500">{cf.label}:</span>
        <button
          type="button"
          className="text-xs font-bold text-indigo-600 hover:underline"
          onClick={() => {
            setFilePreviewUrl(s);
            setFilePreviewType('pdf');
          }}
        >
          查看
        </button>
      </span>
    );
  }
  if (t === 'file' && s.startsWith('data:')) {
    return (
      <span key={cf.id} className="flex shrink-0 items-center gap-1">
        <span className="text-slate-500">{cf.label}:</span>
        <button
          type="button"
          className="text-xs font-bold text-indigo-600 hover:underline"
          onClick={() => window.open(s, '_blank', 'noopener,noreferrer')}
        >
          查看
        </button>
      </span>
    );
  }
  return (
    <span key={cf.id} className="flex items-center gap-1">
      {cf.label}: {s}
    </span>
  );
}

const PlanOrderListView: React.FC<PlanOrderListViewProps> = ({ productionLinkMode = 'order', plans, products, categories, dictionaries, workers, equipment, globalNodes, boms, partners, partnerCategories = [], planFormSettings, onUpdatePlanFormSettings, printTemplates, onUpdatePrintTemplates, onRefreshPrintTemplates, orders = [], onCreatePlan, onSplitPlan, onConvertToOrder, onDeletePlan, onUpdateProduct, onUpdatePlan, onUpdateOrder, onAddPSIRecord, onAddPSIRecordBatch, onCreateSubPlan, onCreateSubPlans }) => {
  const [showModal, setShowModal] = useState(false);
  const [viewDetailPlanId, setViewDetailPlanId] = useState<string | null>(null);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [showPlanFormConfigModal, setShowPlanFormConfigModal] = useState(false);
  /** 打开计划单表单配置时默认页签（工具栏为字段；列表「增加打印模版」为打印） */
  const [planFormConfigEntryTab, setPlanFormConfigEntryTab] = useState<'fields' | 'print'>('fields');
  const openPlanFormPrintTab = useCallback(() => {
    setPlanFormConfigEntryTab('print');
    void onRefreshPrintTemplates?.();
    setShowPlanFormConfigModal(true);
  }, [onRefreshPrintTemplates]);
  const [planPrintPickerOpen, setPlanPrintPickerOpen] = useState(false);
  const [planPrintPickerPlan, setPlanPrintPickerPlan] = useState<PlanOrder | null>(null);
  const [planPrintTemplateManageScope, setPlanPrintTemplateManageScope] = useState<'planList' | 'planLabel' | null>(null);
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
      const data = Array.isArray(result) ? (result as unknown as PlanOrder[]) : ((result?.data ?? []) as PlanOrder[]);
      const total = Array.isArray(result) ? data.length : (result?.total ?? 0);
      setFetchedPlans(data);
      setTotalPlans(total);
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
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const renderProductCustomTags = useCallback(
    (product: Product | undefined) => {
      if (!product) return null;
      return getProductCategoryCustomFieldEntries(product, categoryMap.get(product.categoryId), {
        includeFile: false,
      }).map(({ field, display }) => (
        <span key={field.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">
          {field.label}: {display}
        </span>
      ));
    },
    [categoryMap],
  );
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
  /** 仅当已在表单配置中加入至少一个可选模版 id 时，才列出可选模版；未配置时不列出全部模版（与工单中心一致） */
  const { planListPrintPickerTemplates, planListPrintPickerHasWhitelist } = useMemo(() => {
    const raw = planFormSettings.listPrint?.allowedTemplateIds;
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      return { planListPrintPickerTemplates: [] as PrintTemplate[], planListPrintPickerHasWhitelist: false };
    }
    const allowedSet = new Set(
      raw.map(x => (x != null && x !== '' ? String(x).trim() : '')).filter(Boolean),
    );
    if (allowedSet.size === 0) {
      return { planListPrintPickerTemplates: [] as PrintTemplate[], planListPrintPickerHasWhitelist: false };
    }
    return {
      planListPrintPickerTemplates: printTemplates.filter(t => allowedSet.has(String(t.id).trim())),
      planListPrintPickerHasWhitelist: true,
    };
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
        virtualBatchRows: (planListPrintRun.plan as any)._virtualBatchRows ?? undefined,
        labelPerVirtualBatch: (planListPrintRun.plan as any)._labelPerVirtualBatch ?? undefined,
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

  const openPlanPrintPicker = useCallback((plan: PlanOrder) => {
    setPlanPrintPickerPlan(plan);
    setPlanPrintPickerOpen(true);
  }, []);

  const mergePlanPrintWhitelist = useCallback(
    (scope: 'planList' | 'planLabel', templateId: string) => {
      if (scope === 'planList') {
        const prev = planFormSettings.listPrint?.allowedTemplateIds;
        const allowedTemplateIds = prev?.length
          ? Array.from(new Set([...prev, templateId]))
          : [templateId];
        onUpdatePlanFormSettings({
          ...planFormSettings,
          listPrint: {
            ...planFormSettings.listPrint,
            showPrintButton: planFormSettings.listPrint?.showPrintButton !== false,
            allowedTemplateIds,
          },
        });
        return;
      }
      const prev = planFormSettings.labelPrint?.allowedTemplateIds;
      const allowedTemplateIds = prev?.length ? Array.from(new Set([...prev, templateId])) : [templateId];
      onUpdatePlanFormSettings({
        ...planFormSettings,
        labelPrint: {
          ...planFormSettings.labelPrint,
          allowedTemplateIds,
        },
      });
    },
    [planFormSettings, onUpdatePlanFormSettings],
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
              onClick={() => {
                setPlanFormConfigEntryTab('fields');
                setShowPlanFormConfigModal(true);
              }}
              className={formConfigToolbarButtonClass}
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
              const createdListLabel = formatPlanOrderCreatedAtForList(plan.createdAt, plan.id);
                const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                const customListFields = planFormSettings.customFields.filter(f => f.showInList);
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
                            <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-base font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                              {product.name || '未知产品'}
                            </button>
                          )}
                          {showInList('product') && <span className="text-[10px] font-bold text-slate-500">{product?.sku ?? ''}</span>}
                          {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                      </div>
                        <div className="mb-1 flex flex-wrap items-center gap-1">{renderProductCustomTags(product)}</div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                          {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                          {showInList('createdAt') && createdListLabel && (
                            <span className="flex items-center gap-1 shrink-0" title="单据创建时间">
                              <CalendarClock className="w-3 h-3 shrink-0" />
                              {createdListLabel}
                            </span>
                          )}
                          {planFormSettings.listDisplay?.showDeliveryDate === true && plan.dueDate && (
                            <span className="flex items-center gap-1 shrink-0" title="交货日期">
                              <Clock className="w-3 h-3 shrink-0" />
                              交货 {toLocalDateYmd(plan.dueDate) || String(plan.dueDate).slice(0, 10)}
                            </span>
                          )}
                          {customListFields.map(cf =>
                            renderPlanListCustomFieldValue(cf, plan, setImagePreviewUrl, setFilePreviewUrl, setFilePreviewType),
                          )}
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
                      <span className="flex items-center px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-100 select-none" aria-hidden>
                        已转正式工单
                      </span>
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
                        const createdListLabel = formatPlanOrderCreatedAtForList(plan.createdAt, plan.id);
                        const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                        const customListFields = planFormSettings.customFields.filter(f => f.showInList);
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
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-sm font-bold text-slate-800 hover:text-indigo-600 hover:underline">{product.name || '未知产品'}</button>
                                  )}
                                  {showInList('product') && <span className="text-[10px] font-bold text-slate-500">{product?.sku ?? ''}</span>}
                                  {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                                </div>
                                <div className="mb-1 flex flex-wrap items-center gap-1">{renderProductCustomTags(product)}</div>
                                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                  {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                                  {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                                  {showInList('createdAt') && createdListLabel && (
                                    <span className="flex items-center gap-1 shrink-0" title="单据创建时间">
                                      <CalendarClock className="w-3 h-3 shrink-0" />
                                      {createdListLabel}
                                    </span>
                                  )}
                                  {planFormSettings.listDisplay?.showDeliveryDate === true && plan.dueDate && (
                                    <span className="flex items-center gap-1 shrink-0" title="交货日期">
                                      <Clock className="w-3 h-3 shrink-0" />
                                      交货 {toLocalDateYmd(plan.dueDate) || String(plan.dueDate).slice(0, 10)}
                                    </span>
                                  )}
                                  {customListFields.map(cf =>
                            renderPlanListCustomFieldValue(cf, plan, setImagePreviewUrl, setFilePreviewUrl, setFilePreviewType),
                          )}
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
                              {!isChild && plan.status === PlanStatus.CONVERTED && !hasUnconvertedSubPlans(plan.id) && (
                                <span className="flex items-center px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-100 select-none" aria-hidden>
                                  已转工单
                                </span>
                              )}
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
                        const createdListLabel = formatPlanOrderCreatedAtForList(plan.createdAt, plan.id);
                        const showInList = (id: string) => planFormSettings.standardFields.find(f => f.id === id)?.showInList ?? true;
                        const customListFields = planFormSettings.customFields.filter(f => f.showInList);
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
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setViewProductId(product.id); }} className="text-left text-sm font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors">
                                    {product.name || '未知产品'}
                                  </button>
                                )}
                                {showInList('product') && <span className="text-[10px] font-bold text-slate-500">{product?.sku ?? ''}</span>}
                                {showInList('assignedCount') && assignedCount > 0 && <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">已派发 {assignedCount} 工序</span>}
                              </div>
                              <div className="mb-1 flex flex-wrap items-center gap-1">{renderProductCustomTags(product)}</div>
                              <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                                {showInList('customer') && productionLinkMode !== 'product' && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {plan.customer}</span>}
                                {showInList('totalQty') && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 计划总量: {totalQty}</span>}
                                {showInList('createdAt') && createdListLabel && (
                                  <span className="flex items-center gap-1 shrink-0" title="单据创建时间">
                                    <CalendarClock className="w-3 h-3 shrink-0" />
                                    {createdListLabel}
                                  </span>
                                )}
                                {planFormSettings.listDisplay?.showDeliveryDate === true && plan.dueDate && (
                                  <span className="flex items-center gap-1 shrink-0" title="交货日期">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    交货 {toLocalDateYmd(plan.dueDate) || String(plan.dueDate).slice(0, 10)}
                                  </span>
                                )}
                                {customListFields.map(cf =>
                            renderPlanListCustomFieldValue(cf, plan, setImagePreviewUrl, setFilePreviewUrl, setFilePreviewType),
                          )}
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
                              {!isChild && plan.status === PlanStatus.CONVERTED && !hasUnconvertedSubPlans(plan.id) && (
                                <span className="flex items-center px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-100 select-none" aria-hidden>
                                  已转工单
                                </span>
                              )}
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
          planFormSettings={planFormSettings}
          orders={orders}
          productionLinkMode={productionLinkMode}
          onUpdatePlan={onUpdatePlan}
          onUpdateOrder={onUpdateOrder}
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
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          onMergeLabelPrintWhitelist={id => mergePlanPrintWhitelist('planLabel', id)}
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
          const prod = products.find(p => p.id === pickerPlan.productId);
          const printListRows = buildPlanPrintListRows(pickerPlan, prod, dictionaries, {
            globalNodes,
            boms,
            products,
            categories,
          });
          setPlanListPrintRun({
            template: t,
            plan: { ...pickerPlan, _printListRows: printListRows } as PlanOrder,
          });
          setPlanPrintPickerOpen(false);
          setPlanPrintPickerPlan(null);
        };

        return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
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
            className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
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

            <div className="max-h-[min(40vh,280px)] overflow-y-auto p-2">
              {planListPrintPickerTemplates.length === 0 ? (
                <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
                  <p className="text-xs leading-relaxed text-slate-500">
                    {planListPrintPickerHasWhitelist
                      ? '已加入的可选模版在当前列表中均不可用，或模版已被删除。请在「表单配置 → 打印模版」中调整。'
                      : '请先在「表单配置 → 打印模版」中为「计划单列表」增加模版并加入可选列表后，再在此处打印。'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPlanPrintPickerOpen(false);
                      setPlanPrintPickerPlan(null);
                      openPlanFormPrintTab();
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4" />
                    增加打印模版
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {planListPrintPickerTemplates.map(t => (
                    <li key={t.id}>
                      <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50/80">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-800">{t.name}</div>
                          <div className="mt-0.5 text-xs font-bold text-indigo-600">
                            {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePickListTemplate(t)}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          打印
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        );
      })()}



      {/* 计划单表单配置弹窗 */}
      <PlanFormConfigModal
        open={showPlanFormConfigModal}
        onClose={() => setShowPlanFormConfigModal(false)}
        defaultTabWhenOpen={planFormConfigEntryTab}
        settings={planFormSettings}
        onSave={onUpdatePlanFormSettings}
        productionLinkMode={productionLinkMode}
        printTemplates={printTemplates}
        onUpdatePrintTemplates={onUpdatePrintTemplates}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
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

      {planPrintTemplateManageScope && (
        <PlanPrintTemplateManageDialog
          open
          onClose={() => setPlanPrintTemplateManageScope(null)}
          scope={planPrintTemplateManageScope}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          planFormSettings={planFormSettings}
          onMergePrintWhitelist={id => mergePlanPrintWhitelist(planPrintTemplateManageScope, id)}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
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
