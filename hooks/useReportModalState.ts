/**
 * ReportModal 的 state + handler + 派生计算集中托管 hook (Phase P4 抽离)。
 *
 * 持有:
 * - reportForm: 报工表单 state (含数量/不良/规格/工人/设备/重量/customData/variantQty 矩阵)
 * - displayImagePreview: 工序展示文件大图预览
 * - 文件预览 PDF blob URL 清理 ref
 * - 扫码已用 token 集合 (item / batch)
 *
 * 暴露:
 * - 表单 setter / handlers (custom field / variant qty / variant def)
 * - 文件预览 (open / close / cleanup)
 * - 扫码 (apply / resolveRowPreview / handleConfirm)
 * - 派生 getSeqRemainingForVariant
 * - submitReport (校验 + 调 onReportSubmit/onReportSubmitProduct)
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import type {
  ProductionOrder,
  Milestone,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductCategory,
  ProductMilestoneProgress,
  ProcessSequenceMode,
  BOM,
  PlanOrder,
} from '../types';
import { itemCodesApi, planVirtualBatchesApi } from '../services/api';
import { rewriteScanApiErrorForIme, type ScanPayload } from '../utils/scanPayload';
import { arePlanOrdersScanCompatible } from '../utils/planOrderScanCompat';
import type { ScanValidatePurpose, ScanValidateScope } from '../types';
import { SCAN_ITEM_CODE_IDS_KEY } from '../types';
import type { ScanBatchRowDetail } from '../utils/scanBatchRowDetail';
import type { ScanBatchApplyMeta } from '../components/scan/ScanBatchSessionModal';
import { scanItemResultToRowDetail, scanVirtualBatchResultToRowDetail } from '../utils/scanBatchRowDetail';
import { calcUsageByWeight } from '../utils/bomMaterialUsageByWeight';
import { coerceRouteReportDefaultForField, getEffectiveReportTemplate } from '../utils/effectiveReportTemplate';
import { buildOutOfSequenceTemplateIds, findGatingPredecessorIndex, isProcessSequential } from '../shared/processSequence';
import { productHasColorSizeMatrix } from '../utils/productColorSize';
import { dataUrlToBlobUrl } from '../utils/routeReportFileUrls';
import { generateNextReportNo } from '../utils/reportNoGen';
import { distributeWeightByQty } from '../utils/reportBatchWeightHelpers';

export interface ReportModalData {
  order: ProductionOrder;
  milestone: Milestone;
  productTotalQty?: number;
  productCompletedQty?: number;
  productMaxReportableQty?: number;
  productItems?: { variantId?: string; quantity: number; completedQuantity: number }[];
  productOrders?: ProductionOrder[];
}

/** 工单中心报工扫码解析结果（按 token 缓存，确认时复用以避免重复网络请求） */
type PreparedReportScan = {
  vid: string;
  qty: number;
  itemCodeId: string | null;
  batchId: string | null;
  detail: ScanBatchRowDetail;
  variantLabel?: string | null;
  productName?: string | null;
  ownerTenantName?: string | null;
  relation?: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER';
};

export interface ReportFormState {
  quantity: number;
  defectiveQuantity: number;
  variantId: string;
  workerId: string;
  equipmentId: string;
  customData: Record<string, unknown>;
  variantQuantities?: Record<string, number>;
  variantDefectiveQuantities?: Record<string, number>;
  /** 工序开启「报工时记录重量」时的本次交货总重量 (kg) */
  weight: number;
}

interface UseReportModalStateArgs {
  reportModal: ReportModalData;
  open: boolean;
  onClose: () => void;
  products: Product[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  productionLinkMode: 'order' | 'product';
  productMilestoneProgresses: ProductMilestoneProgress[];
  processSequenceMode: ProcessSequenceMode;
  ordersInModal: ProductionOrder[];
  productMap: Map<string, Product>;
  categoryMap: Map<string, ProductCategory>;
  weightReportEnabled: boolean;
  effectiveReportTemplate: ReturnType<typeof getEffectiveReportTemplate>;
  boms?: BOM[];
  orders: ProductionOrder[];
  /** 计划单列表：报工扫码时校验码与工单是否在同一计划树 */
  plans?: PlanOrder[];
  onReportSubmit?: (orderId: string, milestoneId: string, quantity: number, customData: unknown, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => void;
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, quantity: number, customData: unknown, variantId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => void;
  /**
   * 扫码累加前的本格剩余上限（同 `effectiveRemainingForModal` / 矩阵 `getSeqRemainingForVariant` - 不良 - 外协 口径）。
   * 返回 null/undefined 表示该入口不做上限拦截，仅做持久化去重。
   */
  getScanMaxQty?: (variantId: string | null) => number | null | undefined;
}

export function useReportModalState(args: UseReportModalStateArgs) {
  const {
    reportModal,
    open,
    onClose,
    products,
    categories,
    globalNodes,
    dictionaries,
    productionLinkMode,
    productMilestoneProgresses,
    processSequenceMode,
    ordersInModal,
    productMap,
    categoryMap,
    weightReportEnabled,
    effectiveReportTemplate,
    boms,
    orders,
    plans = [],
    onReportSubmit,
    onReportSubmitProduct,
    getScanMaxQty,
  } = args;

  const outOfSequenceTemplateIds = useMemo(() => buildOutOfSequenceTemplateIds(globalNodes), [globalNodes]);

  const [reportForm, setReportForm] = useState<ReportFormState>(() => {
    const initialData: Record<string, unknown> = {};
    const product = products.find(p => p.id === reportModal.order.productId);
    const defaults = product?.routeReportValues?.[reportModal.milestone.templateId] ?? {};
    getEffectiveReportTemplate(reportModal.milestone, globalNodes).forEach(f => {
      const raw = defaults[f.id];
      if (raw !== undefined && raw !== '') {
        initialData[f.id] = coerceRouteReportDefaultForField(f, raw);
      } else {
        initialData[f.id] = '';
      }
    });
    const category = categories.find(c => c.id === product?.categoryId);
    const showVariantMatrix = productHasColorSizeMatrix(product, category);
    const items = reportModal.productItems ?? reportModal.order.items;
    const singleVariant = items.length === 1 ? (items[0].variantId || '') : '';
    const variantQuantities: Record<string, number> = {};
    const variantDefective: Record<string, number> = {};
    if (showVariantMatrix && product?.variants?.length) {
      product.variants.forEach(v => {
        variantQuantities[v.id] = 0;
        variantDefective[v.id] = 0;
      });
    }
    return {
      quantity: 0,
      defectiveQuantity: 0,
      variantId: singleVariant,
      workerId: '',
      equipmentId: '',
      customData: initialData,
      variantQuantities: showVariantMatrix && product?.variants?.length ? variantQuantities : undefined,
      variantDefectiveQuantities: showVariantMatrix && product?.variants?.length ? variantDefective : undefined,
      weight: 0,
    };
  });

  /** 按节点 + 产品定位本工序适用 BOM;优先精确 variant,次选单 SKU */
  const resolveBomForVariant = useCallback(
    (variantId?: string): BOM | undefined => {
      if (!weightReportEnabled || !boms?.length) return undefined;
      const productId = reportModal.order.productId;
      const nodeId = reportModal.milestone.templateId;
      const forProduct = boms.filter(b => b.parentProductId === productId && b.nodeId === nodeId);
      if (forProduct.length === 0) return undefined;
      if (variantId) {
        const exact = forProduct.find(b => b.variantId === variantId);
        if (exact) return exact;
      }
      return forProduct.find(b => !b.variantId) ?? forProduct[0];
    },
    [weightReportEnabled, boms, reportModal.order.productId, reportModal.milestone.templateId],
  );

  const weightPreviewRows = useMemo(() => {
    if (!weightReportEnabled) return [] as ReturnType<typeof calcUsageByWeight>;
    const totalQty = reportForm.variantQuantities
      ? Object.values(reportForm.variantQuantities).reduce<number>((s, q) => s + (q as number), 0)
      : reportForm.quantity;
    if (!(reportForm.weight > 0) || !(totalQty > 0)) return [];
    const variantForBom = reportForm.variantQuantities
      ? Object.entries(reportForm.variantQuantities).find(([, q]) => (q as number) > 0)?.[0]
      : reportForm.variantId;
    const bom = resolveBomForVariant(variantForBom);
    if (!bom) return [];
    const productsById = new Map(products.map(p => [p.id, p]));
    return calcUsageByWeight(bom, totalQty, reportForm.weight, productsById);
  }, [weightReportEnabled, reportForm.weight, reportForm.quantity, reportForm.variantQuantities, reportForm.variantId, resolveBomForVariant, products]);

  /** 工序展示: 图片用弹层大图;PDF 用新标签页打开 */
  const pdfBlobRevokeRef = useRef<(() => void) | undefined>(undefined);
  const [displayImagePreview, setDisplayImagePreview] = useState<string | null>(null);

  const cleanupPdfBlobUrl = useCallback(() => {
    pdfBlobRevokeRef.current?.();
    pdfBlobRevokeRef.current = undefined;
  }, []);

  const closeDisplayImagePreview = useCallback(() => {
    setDisplayImagePreview(null);
  }, []);

  const openDisplayFilePreview = useCallback((url: string, kind: 'image' | 'pdf') => {
    if (kind === 'pdf') {
      cleanupPdfBlobUrl();
      let openUrl = url;
      if (url.startsWith('data:')) {
        const conv = dataUrlToBlobUrl(url);
        if (conv) {
          pdfBlobRevokeRef.current = conv.revoke;
          openUrl = conv.url;
        }
      }
      const win = window.open(openUrl, '_blank');
      if (!win) {
        toast.error('无法打开新窗口，请检查浏览器是否拦截了弹窗');
        cleanupPdfBlobUrl();
      }
      return;
    }
    setDisplayImagePreview(url);
  }, [cleanupPdfBlobUrl]);

  useEffect(() => {
    if (!open) {
      closeDisplayImagePreview();
      cleanupPdfBlobUrl();
    }
  }, [open, closeDisplayImagePreview, cleanupPdfBlobUrl]);

  useEffect(() => () => {
    cleanupPdfBlobUrl();
  }, [cleanupPdfBlobUrl]);

  const handleReportFieldChange = useCallback((fieldId: string, value: unknown) => {
    setReportForm(prev => ({ ...prev, customData: { ...prev.customData, [fieldId]: value } }));
  }, []);

  const handleVariantQuantityChange = useCallback((variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantQuantities: { ...(prev.variantQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  }, []);

  const handleVariantDefectiveChange = useCallback((variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantDefectiveQuantities: { ...(prev.variantDefectiveQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  }, []);

  /**
   * 扫码解析缓存：扫码（预览）阶段写入「scan + validate-usage」结果，
   * 点「确认应用」时命中缓存 → 0 网络请求，避免逐条重新解析触发频控/投毒。
   * 去重依赖扫码弹窗自身的 keysRef + 此缓存幂等，不再单独维护 token 集合。
   */
  const preparedByTokenRef = useRef<Map<string, PreparedReportScan>>(new Map());
  const reportScanLinkRef = useRef<{ virtualBatchId: string | null; itemCodeId: string | null }>({
    virtualBatchId: null,
    itemCodeId: null,
  });
  /**
   * 单品码模式下按规格累积本次扫入的单品码列表（key = variantId，无规格为 ''）。
   * 提交时写入对应报工的 `customData.__scanItemCodeIds`，使追溯可逐件精确命中。
   * `hadBatchScan` 标记本次是否扫过批次码：批次码模式沿用整批链路，不写逐件列表（避免混扫时批次部分漏关联）。
   */
  const reportScanItemCodesByVidRef = useRef<Map<string, string[]>>(new Map());
  const reportHadBatchScanRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    preparedByTokenRef.current.clear();
    reportScanLinkRef.current = { virtualBatchId: null, itemCodeId: null };
    reportScanItemCodesByVidRef.current = new Map();
    reportHadBatchScanRef.current = false;
  }, [open, reportModal.order.id, reportModal.milestone.id]);

  /**
   * 调后端 `scan/validate-usage`：持久化去重 + 单据上限校验。
   * - 返回 `true` 表示允许累加；`false` 表示已 toast 提示并应拒绝（不入列表 / 不累加表单）。
   * - 网络异常时降级为允许（不阻塞业务），由 createReport 写入兜底处兜底防重。
   */
  const validateScanForReport = useCallback(
    async (params: {
      itemCodeId: string | null;
      virtualBatchId: string | null;
      variantId: string | null;
      addQty: number;
    }): Promise<boolean> => {
      const { itemCodeId, virtualBatchId, variantId, addQty } = params;
      if (!itemCodeId && !virtualBatchId) return true;
      const purpose: ScanValidatePurpose =
        productionLinkMode === 'product' ? 'PRODUCT_REPORT' : 'MILESTONE_REPORT';
      const scope: ScanValidateScope =
        purpose === 'PRODUCT_REPORT'
          ? {
              productId: reportModal.order.productId,
              milestoneTemplateId: reportModal.milestone.templateId,
              variantId: variantId || null,
            }
          : { milestoneId: reportModal.milestone.id };
      const maxQty = getScanMaxQty?.(variantId || null);
      const currentQty = reportForm.variantQuantities
        ? reportForm.variantQuantities[variantId || ''] ?? 0
        : reportForm.quantity || 0;
      try {
        const res = await itemCodesApi.validateUsage({
          purpose,
          scope,
          itemCodeId,
          virtualBatchId,
          currentQty,
          addQty,
          maxQty: typeof maxQty === 'number' ? maxQty : undefined,
        });
        if (res.code === 'DUPLICATE_SAVED') {
          toast.error(res.message || '该码已被使用，不可重复扫码');
          return false;
        }
        if (res.code === 'EXCEEDS_MAX') {
          toast.error(res.message || '本次扫入数量超过单据最大可填值');
          return false;
        }
        return true;
      } catch {
        return true;
      }
    },
    [
      productionLinkMode,
      reportModal.order.productId,
      reportModal.milestone.templateId,
      reportModal.milestone.id,
      reportForm.variantQuantities,
      reportForm.quantity,
      getScanMaxQty,
    ],
  );

  /**
   * 扫码解析（含持久化去重校验），按 token 缓存。
   * - 扫码（预览）阶段与「确认应用」阶段共用：预览先解析并缓存，确认时命中缓存 → 0 网络请求。
   */
  const prepareReportScan = useCallback(
    async (payload: ScanPayload): Promise<PreparedReportScan | null> => {
      if (!payload.token) return null;
      const cached = preparedByTokenRef.current.get(payload.token);
      if (cached) return cached;
      const currentPlanOrderId = reportModal.order.planOrderId;
      if (!currentPlanOrderId) {
        toast.error('当前工单未关联计划，无法校验扫码');
        return null;
      }
      const isPlanCompatible = (codePlanOrderId: string) =>
        arePlanOrdersScanCompatible(plans, codePlanOrderId, currentPlanOrderId);
      try {
        if (payload.kind === 'ITEM') {
          const res = await itemCodesApi.scan(payload.token);
          if (res.status === 'VOIDED') {
            toast.error(res.message || '单品码已作废');
            return null;
          }
          const codePlanId = res.planOrderId;
          if (!isPlanCompatible(codePlanId)) {
            toast.error('此码不属于当前工单所在计划');
            return null;
          }
          if (res.kind !== 'ITEM_CODE') return null;
          const vid = res.variantId || '';
          if (reportForm.variantQuantities && !vid) {
            toast.error('单品码未带规格，无法在按规格模式下累加');
            return null;
          }
          const okValidate = await validateScanForReport({
            itemCodeId: res.itemCodeId ?? null,
            virtualBatchId: res.batchId ?? null,
            variantId: vid || null,
            addQty: 1,
          });
          if (!okValidate) return null;
          const prepared: PreparedReportScan = {
            vid,
            qty: 1,
            itemCodeId: res.itemCodeId ?? null,
            batchId: res.batchId ?? null,
            detail: scanItemResultToRowDetail(res),
            variantLabel: res.variantLabel,
            productName: res.productName,
            ownerTenantName: res.ownerTenantName,
            relation: res.callerContext?.relation,
          };
          preparedByTokenRef.current.set(payload.token, prepared);
          return prepared;
        }
        if (payload.kind === 'BATCH') {
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.kind !== 'VIRTUAL_BATCH') return null;
          if (res.status === 'VOIDED') {
            toast.error(res.message || '批次码已作废');
            return null;
          }
          const codePlanId = res.planOrderId;
          if (!isPlanCompatible(codePlanId)) {
            toast.error('此批次码不属于当前工单所在计划');
            return null;
          }
          const qty = res.quantity ?? 0;
          const vid = res.variantId || '';
          if (reportForm.variantQuantities && !vid) {
            toast.error('批次码未带规格，无法在按规格模式下累加');
            return null;
          }
          const okValidate = await validateScanForReport({
            itemCodeId: null,
            virtualBatchId: res.batchId ?? null,
            variantId: vid || null,
            addQty: qty,
          });
          if (!okValidate) return null;
          const prepared: PreparedReportScan = {
            vid,
            qty,
            itemCodeId: null,
            batchId: res.batchId ?? null,
            detail: scanVirtualBatchResultToRowDetail(res),
            variantLabel: res.variantLabel,
            productName: res.productName,
            ownerTenantName: res.ownerTenantName,
            relation: res.callerContext?.relation,
          };
          preparedByTokenRef.current.set(payload.token, prepared);
          return prepared;
        }
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return null;
      }
      return null;
    },
    [reportModal.order.planOrderId, reportForm.variantQuantities, validateScanForReport, plans],
  );

  const resolveReportScanRowPreview = useCallback(
    async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      const prepared = await prepareReportScan(payload);
      return prepared?.detail ?? null;
    },
    [prepareReportScan],
  );

  const applyScanPayload = useCallback(
    async (payload: ScanPayload): Promise<boolean> => {
      // 扫码阶段已通过 resolveReportScanRowPreview 调 prepareReportScan 并缓存，
      // 此处命中缓存 → 0 网络；缓存未命中（极少数）才回退到网络解析。
      const prepared = await prepareReportScan(payload);
      if (!prepared) return false;
      const { vid, qty } = prepared;
      if (prepared.batchId) reportScanLinkRef.current.virtualBatchId = prepared.batchId;
      if (prepared.itemCodeId) {
        reportScanLinkRef.current.itemCodeId = prepared.itemCodeId;
        const arr = reportScanItemCodesByVidRef.current.get(vid) ?? [];
        if (!arr.includes(prepared.itemCodeId)) arr.push(prepared.itemCodeId);
        reportScanItemCodesByVidRef.current.set(vid, arr);
      } else if (prepared.batchId) {
        reportHadBatchScanRef.current = true;
      }
      setReportForm(f => {
        if (f.variantQuantities) {
          const prev = f.variantQuantities[vid] ?? 0;
          return { ...f, variantQuantities: { ...f.variantQuantities, [vid]: prev + qty } };
        }
        return { ...f, quantity: (f.quantity || 0) + qty, variantId: vid || f.variantId };
      });
      return true;
    },
    [prepareReportScan],
  );

  const handleScanBatchConfirm = useCallback(
    async (payloads: ScanPayload[], meta?: ScanBatchApplyMeta) => {
      for (const p of payloads) {
        const ok = await applyScanPayload(p);
        if (!ok) return false;
      }
      if (weightReportEnabled && meta && meta.totalMeasuredWeightKg > 0) {
        setReportForm(f => ({ ...f, weight: meta.totalMeasuredWeightKg }));
      }
      return true;
    },
    [applyScanPayload, weightReportEnabled],
  );

  const getSeqRemainingForVariant = useCallback((variantId: string): number => {
    const productId = reportModal.order.productId;
    const milestoneTemplateId = reportModal.milestone.templateId;
    const allOrders = ordersInModal;
    const items = reportModal.productItems ?? reportModal.order.items;
    const item = items.find(i => (i.variantId || '') === variantId) ?? (items.length === 1 ? items[0] : undefined);

    let tplIndex: number;
    let prevTemplateId: string | undefined;
    let templateIdPath: string[] = [];
    if (productionLinkMode === 'product') {
      const product = productMap.get(productId);
      const nodeIds = product?.milestoneNodeIds || [];
      templateIdPath = nodeIds;
      tplIndex = nodeIds.indexOf(milestoneTemplateId);
    } else {
      const ref = allOrders.find(o => o.milestones.some(m => m.templateId === milestoneTemplateId)) ?? reportModal.order;
      templateIdPath = ref.milestones.map(m => m.templateId);
      tplIndex = ref.milestones.findIndex(m => m.templateId === milestoneTemplateId);
    }
    const gateIdx = findGatingPredecessorIndex(templateIdPath, tplIndex, outOfSequenceTemplateIds);
    if (gateIdx >= 0) prevTemplateId = templateIdPath[gateIdx];

    const freshMilestone = allOrders.map(o => o.milestones.find(m => m.templateId === milestoneTemplateId)).find(Boolean);

    // 脱链工序（不按顺序生产）或上游无按顺序工序：按规格总量计可报，不取前道完成量。
    const seqConstrained = isProcessSequential(processSequenceMode, milestoneTemplateId, outOfSequenceTemplateIds);

    if (!seqConstrained || gateIdx < 0) {
      if (!item) return 0;
      if (reportModal.productItems) {
        return item.quantity - (item.completedQuantity ?? 0);
      }
      if (items.length === 1 && !item.variantId) {
        return item.quantity - (freshMilestone?.completedQuantity ?? reportModal.milestone.completedQuantity ?? 0);
      }
      const completedInMilestone = (freshMilestone?.reports || reportModal.milestone.reports || [])
        .filter(r => (r.variantId || '') === variantId)
        .reduce((s, r) => s + r.quantity, 0);
      return item.quantity - completedInMilestone;
    }

    if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0 && prevTemplateId) {
      const curCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === milestoneTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      const prevCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === prevTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      return Math.max(0, prevCompleted - curCompleted);
    }

    let prevQty = 0;
    let curQty = 0;
    const vid = variantId || '';
    allOrders.forEach(o => {
      const variantItemQty = o.items.filter(i => (i.variantId ?? '') === vid).reduce((s, i) => s + i.quantity, 0);
      const orderTotalQty = o.items.reduce((s, i) => s + i.quantity, 0);

      if (prevTemplateId) {
        const prevMs = o.milestones.find(m => m.templateId === prevTemplateId);
        if (prevMs) {
          const hasVariantReports = (prevMs.reports || []).some(r => r.variantId && r.variantId !== '');
          if (hasVariantReports) {
            (prevMs.reports || []).forEach(r => { if ((r.variantId || '') === vid) prevQty += r.quantity; });
          } else if ((prevMs.completedQuantity ?? 0) > 0 && orderTotalQty > 0) {
            prevQty += Math.round(((prevMs.completedQuantity ?? 0) * variantItemQty) / orderTotalQty);
          }
        }
      }
      const curMs = o.milestones.find(m => m.templateId === milestoneTemplateId);
      if (curMs) {
        const hasVariantReports = (curMs.reports || []).some(r => r.variantId && r.variantId !== '');
        if (hasVariantReports) {
          (curMs.reports || []).forEach(r => { if ((r.variantId || '') === vid) curQty += r.quantity; });
        } else if ((curMs.completedQuantity ?? 0) > 0 && orderTotalQty > 0) {
          curQty += Math.round(((curMs.completedQuantity ?? 0) * variantItemQty) / orderTotalQty);
        }
      }
    });
    return prevQty - curQty;
  }, [reportModal.order, reportModal.milestone, reportModal.productItems, ordersInModal, productionLinkMode, productMap, productMilestoneProgresses, processSequenceMode, outOfSequenceTemplateIds]);

  const submitReport = useCallback(async () => {
    const tmpl = effectiveReportTemplate;
    for (const f of tmpl) {
      if (!f.required) continue;
      const v = reportForm.customData[f.id];
      if (f.type === 'file') {
        if (v == null || (typeof v === 'string' && v.trim() === '')) {
          toast.error(`请上传或选择：${f.label}`);
          return;
        }
      } else if (v == null || (typeof v === 'string' && v.trim() === '')) {
        toast.error(`请填写：${f.label}`);
        return;
      }
    }
    const productId = reportModal.order.productId;
    const milestoneTemplateId = reportModal.milestone.templateId;
    const product = productMap.get(productId);
    const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
    const showVariantMatrix = productHasColorSizeMatrix(product, category);
    void dictionaries;

    const matrixWeightPartsByVariantId = (() => {
      if (!weightReportEnabled || !(reportForm.weight > 0) || !reportForm.variantQuantities) {
        return null as Map<string, number> | null;
      }
      const entries = (Object.entries(reportForm.variantQuantities) as Array<[string, number]>).filter(
        ([, q]) => q > 0,
      );
      if (entries.length === 0) return null;
      const parts = distributeWeightByQty(
        reportForm.weight,
        entries.map(([, q]) => ({ quantity: q })),
      );
      return new Map(entries.map(([vId], idx) => [vId, parts[idx]!]));
    })();
    const weightForVariant = (variantId: string) => matrixWeightPartsByVariantId?.get(variantId);

    const getNextReportNo = () => generateNextReportNo(orders, productMilestoneProgresses);
    /**
     * 单品码模式下取本次扫入的单品码列表：
     * - `variantId` 传具体规格（矩阵报工每行）→ 仅取该规格扫入的单品码；
     * - 传 `null`（非矩阵单条报工）→ 合并所有规格的单品码（同一条报工承载全部扫入）。
     * 扫过批次码（批次码模式）则不写列表，沿用整批 virtual_batch_id 链路。
     */
    const collectScanItemCodes = (variantId: string | null): string[] => {
      if (reportHadBatchScanRef.current) return [];
      const map = reportScanItemCodesByVidRef.current;
      if (variantId === null) return [...new Set([...map.values()].flat())];
      return map.get(variantId) ?? [];
    };
    const submitCustomData = (variantId: string | null): Record<string, unknown> => {
      const scanItemCodeIds = collectScanItemCodes(variantId);
      return {
        ...reportForm.customData,
        ...(reportScanLinkRef.current.virtualBatchId
          ? { virtualBatchId: reportScanLinkRef.current.virtualBatchId }
          : {}),
        ...(reportScanLinkRef.current.itemCodeId ? { itemCodeId: reportScanLinkRef.current.itemCodeId } : {}),
        ...(scanItemCodeIds.length > 0 ? { [SCAN_ITEM_CODE_IDS_KEY]: scanItemCodeIds } : {}),
      };
    };

    if (productionLinkMode === 'product' && onReportSubmitProduct) {
      if (showVariantMatrix && reportForm.variantQuantities) {
        const entries = (Object.entries(reportForm.variantQuantities) as Array<[string, number]>).filter(([vId, q]) => {
          const def = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          return q > 0 || def > 0;
        });
        if (entries.length === 0) return;
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const reportNo = getNextReportNo();
        for (const [vId, qty] of entries) {
          const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          await onReportSubmitProduct(
            productId, milestoneTemplateId, qty, submitCustomData(vId),
            vId, reportForm.workerId || undefined, defQty,
            reportForm.equipmentId || undefined, batchId, reportNo,
            weightForVariant(vId),
          );
        }
      } else {
        const reportNo = getNextReportNo();
        await onReportSubmitProduct(
          productId, milestoneTemplateId, reportForm.quantity, submitCustomData(null),
          reportForm.variantId || undefined, reportForm.workerId || undefined,
          reportForm.defectiveQuantity || 0, reportForm.equipmentId || undefined,
          undefined, reportNo,
          weightReportEnabled && reportForm.weight > 0 ? reportForm.weight : undefined,
        );
      }
      onClose();
      return;
    }

    if (!onReportSubmit) return;
    if (showVariantMatrix && reportForm.variantQuantities) {
      const entries = (Object.entries(reportForm.variantQuantities) as Array<[string, number]>).filter(([vId, q]) => {
        const def = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
        return q > 0 || def > 0;
      });
      if (entries.length === 0) return;
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const reportNo = getNextReportNo();
      for (const [vId, qty] of entries) {
        let targetOrder = reportModal.order;
        if (reportModal.productOrders?.length) {
          const withVariant = reportModal.productOrders.find(o => o.items.some(i => i.variantId === vId));
          targetOrder = withVariant ?? reportModal.productOrders[0];
        }
        const ms = targetOrder.milestones.find(m => m.templateId === reportModal.milestone.templateId) ?? reportModal.milestone;
        const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
        await onReportSubmit(
          targetOrder.id, ms.id, qty, submitCustomData(vId),
          vId, reportForm.workerId || undefined, defQty,
          reportForm.equipmentId || undefined, batchId, reportNo,
          weightForVariant(vId),
        );
      }
    } else {
      let targetOrder = reportModal.order;
      if (reportModal.productOrders && reportModal.productOrders.length > 0) {
        const vId = reportForm.variantId || undefined;
        const withVariant = reportModal.productOrders.find(o => vId ? o.items.some(i => i.variantId === vId) : true);
        targetOrder = withVariant ?? reportModal.productOrders[0];
      }
      const ms = targetOrder.milestones.find(m => m.templateId === reportModal.milestone.templateId) ?? reportModal.milestone;
      const reportNo = getNextReportNo();
      await onReportSubmit(
        targetOrder.id, ms.id, reportForm.quantity, submitCustomData(null),
        reportForm.variantId || undefined, reportForm.workerId || undefined,
        reportForm.defectiveQuantity || 0, reportForm.equipmentId || undefined,
        undefined, reportNo,
        weightReportEnabled && reportForm.weight > 0 ? reportForm.weight : undefined,
      );
    }
    onClose();
  }, [
    effectiveReportTemplate, reportForm, reportModal, productMap, categoryMap, dictionaries,
    weightReportEnabled, productionLinkMode, onReportSubmit, onReportSubmitProduct, onClose,
    orders, productMilestoneProgresses,
  ]);

  return {
    reportForm,
    setReportForm,
    weightPreviewRows,
    displayImagePreview,
    closeDisplayImagePreview,
    openDisplayFilePreview,
    handleReportFieldChange,
    handleVariantQuantityChange,
    handleVariantDefectiveChange,
    applyScanPayload,
    resolveReportScanRowPreview,
    handleScanBatchConfirm,
    getSeqRemainingForVariant,
    submitReport,
  };
}
