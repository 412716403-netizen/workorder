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
import { useState, useMemo, useCallback, useRef, useEffect, type SetStateAction } from 'react';
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
import { isReportScanPlanCompatible } from '../utils/planOrderScanCompat';
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
import { distributeWeightByQty, roundWeightKg } from '../utils/reportBatchWeightHelpers';
import { accumulateMeasuredWeightByProduct } from '../utils/scanMeasuredWeightByProduct';
import {
  productHasMilestoneTemplate,
  resolveOrdersForProductAtTemplate,
  resolveTargetOrderForReport,
} from '../utils/reportRowDerivations';

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
  productId: string;
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
   * 扫码累加前的本格剩余上限（按产品 + 规格）。
   * 返回 null/undefined 表示该入口不做上限拦截，仅做持久化去重。
   */
  getScanMaxQty?: (productId: string, variantId: string | null) => number | null | undefined;
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

  const anchorProductId = reportModal.order.productId;
  const milestoneTemplateId = reportModal.milestone.templateId;

  const buildInitialFormForProduct = useCallback(
    (productId: string): ReportFormState => {
      const initialData: Record<string, unknown> = {};
      const product = products.find(p => p.id === productId);
      const defaults = product?.routeReportValues?.[milestoneTemplateId] ?? {};
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
      const productOrders = resolveOrdersForProductAtTemplate(orders, productId, milestoneTemplateId, reportModal.order.id);
      const refOrder = productOrders[0] ?? (productId === anchorProductId ? reportModal.order : undefined);
      const items =
        productId === anchorProductId
          ? (reportModal.productItems ?? reportModal.order.items)
          : (refOrder?.items ?? []);
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
    },
    [
      products,
      categories,
      globalNodes,
      reportModal.milestone,
      reportModal.order,
      reportModal.productItems,
      milestoneTemplateId,
      anchorProductId,
      orders,
    ],
  );

  const [sessionProductIds, setSessionProductIds] = useState<string[]>(() => [anchorProductId]);
  const [productForms, setProductForms] = useState<Record<string, ReportFormState>>(() => ({
    [anchorProductId]: buildInitialFormForProduct(anchorProductId),
  }));

  const reportForm = productForms[anchorProductId] ?? buildInitialFormForProduct(anchorProductId);

  const setReportForm = useCallback(
    (updater: SetStateAction<ReportFormState>) => {
      setProductForms(prev => {
        const cur = prev[anchorProductId] ?? buildInitialFormForProduct(anchorProductId);
        const next = typeof updater === 'function' ? updater(cur) : updater;
        return { ...prev, [anchorProductId]: next };
      });
    },
    [anchorProductId, buildInitialFormForProduct],
  );

  const setProductForm = useCallback((productId: string, updater: SetStateAction<ReportFormState>) => {
    setProductForms(prev => {
      const cur = prev[productId] ?? buildInitialFormForProduct(productId);
      const next = typeof updater === 'function' ? updater(cur) : updater;
      return { ...prev, [productId]: next };
    });
  }, [buildInitialFormForProduct]);

  const ensureProductInSession = useCallback(
    (productId: string) => {
      setSessionProductIds(prev => (prev.includes(productId) ? prev : [...prev, productId]));
      setProductForms(prev => (prev[productId] ? prev : { ...prev, [productId]: buildInitialFormForProduct(productId) }));
    },
    [buildInitialFormForProduct],
  );

  useEffect(() => {
    if (!open) return;
    const initial = buildInitialFormForProduct(anchorProductId);
    setSessionProductIds([anchorProductId]);
    setProductForms({ [anchorProductId]: initial });
  }, [open, reportModal.order.id, reportModal.milestone.id, anchorProductId, buildInitialFormForProduct]);

  /** 按节点 + 产品定位本工序适用 BOM;优先精确 variant,次选单 SKU */
  const resolveBomForProductVariant = useCallback(
    (productId: string, variantId?: string): BOM | undefined => {
      if (!weightReportEnabled || !boms?.length) return undefined;
      const nodeId = reportModal.milestone.templateId;
      const forProduct = boms.filter(b => b.parentProductId === productId && b.nodeId === nodeId);
      if (forProduct.length === 0) return undefined;
      if (variantId) {
        const exact = forProduct.find(b => b.variantId === variantId);
        if (exact) return exact;
      }
      return forProduct.find(b => !b.variantId) ?? forProduct[0];
    },
    [weightReportEnabled, boms, reportModal.milestone.templateId],
  );

  const getWeightPreviewRowsForProduct = useCallback(
    (productId: string, form: ReportFormState): ReturnType<typeof calcUsageByWeight> => {
      if (!weightReportEnabled) return [];
      const totalQty = form.variantQuantities
        ? Object.values(form.variantQuantities).reduce<number>((s, q) => s + (q as number), 0)
        : form.quantity;
      if (!(form.weight > 0) || !(totalQty > 0)) return [];
      const variantForBom = form.variantQuantities
        ? Object.entries(form.variantQuantities).find(([, q]) => (q as number) > 0)?.[0]
        : form.variantId;
      const bom = resolveBomForProductVariant(productId, variantForBom);
      if (!bom) return [];
      const productsById = new Map(products.map(p => [p.id, p]));
      return calcUsageByWeight(bom, totalQty, form.weight, productsById);
    },
    [weightReportEnabled, resolveBomForProductVariant, products],
  );

  const weightPreviewRows = useMemo(
    () => getWeightPreviewRowsForProduct(anchorProductId, reportForm),
    [getWeightPreviewRowsForProduct, anchorProductId, reportForm],
  );

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

  const handleVariantQuantityChange = useCallback((productId: string, variantId: string, qty: number) => {
    setProductForm(productId, prev => ({
      ...prev,
      variantQuantities: { ...(prev.variantQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  }, [setProductForm]);

  const handleVariantDefectiveChange = useCallback((productId: string, variantId: string, qty: number) => {
    setProductForm(productId, prev => ({
      ...prev,
      variantDefectiveQuantities: { ...(prev.variantDefectiveQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  }, [setProductForm]);

  /**
   * 扫码解析缓存：扫码（预览）阶段写入「scan + validate-usage」结果，
   * 点「确认应用」时命中缓存 → 0 网络请求，避免逐条重新解析触发频控/投毒。
   * 去重依赖扫码弹窗自身的 keysRef + 此缓存幂等，不再单独维护 token 集合。
   */
  const preparedByTokenRef = useRef<Map<string, PreparedReportScan>>(new Map());
  const reportScanLinkByProductRef = useRef<Map<string, { virtualBatchId: string | null; itemCodeId: string | null }>>(new Map());
  const reportScanItemCodesByKeyRef = useRef<Map<string, string[]>>(new Map());
  const reportHadBatchScanByProductRef = useRef<Set<string>>(new Set());

  const scanTraceKey = (productId: string, variantId: string) => `${productId}__${variantId || ''}`;

  useEffect(() => {
    if (!open) return;
    preparedByTokenRef.current.clear();
    reportScanLinkByProductRef.current = new Map();
    reportScanItemCodesByKeyRef.current = new Map();
    reportHadBatchScanByProductRef.current = new Set();
  }, [open, reportModal.order.id, reportModal.milestone.id]);

  /**
   * 调后端 `scan/validate-usage`：持久化去重 + 单据上限校验。
   * - 返回 `true` 表示允许累加；`false` 表示已 toast 提示并应拒绝（不入列表 / 不累加表单）。
   * - 网络异常时降级为允许（不阻塞业务），由 createReport 写入兜底处兜底防重。
   */
  const validateScanForReport = useCallback(
    async (params: {
      productId: string;
      itemCodeId: string | null;
      virtualBatchId: string | null;
      variantId: string | null;
      addQty: number;
    }): Promise<boolean> => {
      const { productId, itemCodeId, virtualBatchId, variantId, addQty } = params;
      if (!itemCodeId && !virtualBatchId) return true;
      const purpose: ScanValidatePurpose =
        productionLinkMode === 'product' ? 'PRODUCT_REPORT' : 'MILESTONE_REPORT';
      const target =
        productionLinkMode === 'order'
          ? resolveTargetOrderForReport(orders, productId, milestoneTemplateId, variantId ?? undefined, reportModal.order.id)
          : null;
      const scope: ScanValidateScope =
        purpose === 'PRODUCT_REPORT'
          ? {
              productId,
              milestoneTemplateId,
              variantId: variantId || null,
            }
          : { milestoneId: target?.milestoneId ?? reportModal.milestone.id };
      const form = productForms[productId];
      const maxQty = getScanMaxQty?.(productId, variantId || null);
      const currentQty = form?.variantQuantities
        ? form.variantQuantities[variantId || ''] ?? 0
        : form?.quantity || 0;
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
      milestoneTemplateId,
      reportModal.milestone.id,
      reportModal.order.id,
      productForms,
      getScanMaxQty,
      orders,
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
      const anchorPlanOrderId = reportModal.order.planOrderId;
      if (productionLinkMode !== 'product' && !anchorPlanOrderId) {
        toast.error('当前工单未关联计划，无法校验扫码');
        return null;
      }
      const collectProductPlanOrderIds = (productId: string): string[] => {
        const seen = new Set<string>();
        const ids: string[] = [];
        const push = (planOrderId?: string | null) => {
          if (planOrderId && !seen.has(planOrderId)) {
            seen.add(planOrderId);
            ids.push(planOrderId);
          }
        };
        for (const o of reportModal.productOrders ?? []) {
          if (o.productId === productId) push(o.planOrderId);
        }
        for (const o of resolveOrdersForProductAtTemplate(orders, productId, milestoneTemplateId, reportModal.order.id)) {
          push(o.planOrderId);
        }
        for (const o of orders) {
          if (o.productId === productId) push(o.planOrderId);
        }
        return ids;
      };
      const isPlanCompatible = (codePlanOrderId: string, productId: string) =>
        isReportScanPlanCompatible(plans, codePlanOrderId, {
          productionLinkMode,
          anchorPlanOrderId,
          productPlanOrderIds: collectProductPlanOrderIds(productId),
        });
      const validateProductAtNode = (productId: string, productName?: string | null) => {
        const product = productMap.get(productId);
        const ok = productHasMilestoneTemplate(
          productId,
          milestoneTemplateId,
          orders,
          productionLinkMode,
          product?.milestoneNodeIds,
        );
        if (!ok) toast.error(`「${productName ?? productId}」不包含工序「${reportModal.milestone.name}」`);
        return ok;
      };
      try {
        if (payload.kind === 'ITEM') {
          const res = await itemCodesApi.scan(payload.token);
          if (res.status === 'VOIDED') {
            toast.error(res.message || '单品码已作废');
            return null;
          }
          if (res.kind !== 'ITEM_CODE') return null;
          const productId = res.productId ?? '';
          if (!productId || !validateProductAtNode(productId, res.productName)) return null;
          const codePlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (!codePlanId || !isPlanCompatible(codePlanId, productId)) {
            toast.error('此码不属于当前工单所在计划');
            return null;
          }
          const vid = res.variantId || '';
          const product = productMap.get(productId);
          const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
          if (productHasColorSizeMatrix(product, category) && !vid) {
            toast.error('单品码未带规格，无法在按规格模式下累加');
            return null;
          }
          const okValidate = await validateScanForReport({
            productId,
            itemCodeId: res.itemCodeId ?? null,
            virtualBatchId: res.batchId ?? null,
            variantId: vid || null,
            addQty: 1,
          });
          if (!okValidate) return null;
          const prepared: PreparedReportScan = {
            productId,
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
          const productId = res.productId ?? '';
          if (!productId || !validateProductAtNode(productId, res.productName)) return null;
          const codePlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (!codePlanId || !isPlanCompatible(codePlanId, productId)) {
            toast.error('此批次码不属于当前工单所在计划');
            return null;
          }
          const qty = res.quantity ?? 0;
          const vid = res.variantId || '';
          const product = productMap.get(productId);
          const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
          if (productHasColorSizeMatrix(product, category) && !vid) {
            toast.error('批次码未带规格，无法在按规格模式下累加');
            return null;
          }
          const okValidate = await validateScanForReport({
            productId,
            itemCodeId: null,
            virtualBatchId: res.batchId ?? null,
            variantId: vid || null,
            addQty: qty,
          });
          if (!okValidate) return null;
          const prepared: PreparedReportScan = {
            productId,
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
    [
      reportModal.order.planOrderId,
      reportModal.productOrders,
      reportModal.milestone.name,
      validateScanForReport,
      plans,
      productMap,
      categoryMap,
      orders,
      productionLinkMode,
      milestoneTemplateId,
    ],
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
      const prepared = await prepareReportScan(payload);
      if (!prepared) return false;
      const { productId, vid, qty } = prepared;
      ensureProductInSession(productId);
      const link = reportScanLinkByProductRef.current.get(productId) ?? { virtualBatchId: null, itemCodeId: null };
      if (prepared.batchId) link.virtualBatchId = prepared.batchId;
      if (prepared.itemCodeId) {
        link.itemCodeId = prepared.itemCodeId;
        const traceKey = scanTraceKey(productId, vid);
        const arr = reportScanItemCodesByKeyRef.current.get(traceKey) ?? [];
        if (!arr.includes(prepared.itemCodeId)) arr.push(prepared.itemCodeId);
        reportScanItemCodesByKeyRef.current.set(traceKey, arr);
      } else if (prepared.batchId) {
        reportHadBatchScanByProductRef.current.add(productId);
      }
      reportScanLinkByProductRef.current.set(productId, link);
      setProductForm(productId, f => {
        if (f.variantQuantities) {
          const prev = f.variantQuantities[vid] ?? 0;
          return { ...f, variantQuantities: { ...f.variantQuantities, [vid]: prev + qty } };
        }
        return { ...f, quantity: (f.quantity || 0) + qty, variantId: vid || f.variantId };
      });
      if (prepared.productName && productId !== anchorProductId) {
        toast.success(`已累加 ${prepared.productName}${prepared.variantLabel ? ` · ${prepared.variantLabel}` : ''} +${qty}`);
      }
      return true;
    },
    [prepareReportScan, ensureProductInSession, setProductForm, anchorProductId],
  );

  const handleScanBatchConfirm = useCallback(
    async (payloads: ScanPayload[], meta?: ScanBatchApplyMeta) => {
      for (const p of payloads) {
        const ok = await applyScanPayload(p);
        if (!ok) return false;
      }
      if (weightReportEnabled && meta && (meta.totalMeasuredWeightKg ?? 0) > 0) {
        const weightByProduct = await accumulateMeasuredWeightByProduct(
          payloads,
          meta,
          async payload => (await prepareReportScan(payload))?.productId ?? null,
        );
        for (const [productId, w] of weightByProduct) {
          setProductForm(productId, f => ({ ...f, weight: roundWeightKg((f.weight ?? 0) + w) }));
        }
      }
      return true;
    },
    [applyScanPayload, weightReportEnabled, prepareReportScan, setProductForm],
  );

  const getSeqRemainingForVariant = useCallback((productId: string, variantId: string): number => {
    const allOrders = resolveOrdersForProductAtTemplate(orders, productId, milestoneTemplateId, reportModal.order.id);
    const items =
      productId === anchorProductId
        ? (reportModal.productItems ?? reportModal.order.items)
        : (allOrders[0]?.items ?? []);
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
  }, [
    reportModal.order,
    reportModal.milestone,
    reportModal.productItems,
    orders,
    anchorProductId,
    milestoneTemplateId,
    productionLinkMode,
    productMap,
    productMilestoneProgresses,
    processSequenceMode,
    outOfSequenceTemplateIds,
  ]);

  const submitReport = useCallback(async () => {
    const tmpl = effectiveReportTemplate;
    const sharedWorkerId = reportForm.workerId;
    const sharedEquipmentId = reportForm.equipmentId;
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

    const getNextReportNo = () => generateNextReportNo(orders, productMilestoneProgresses);

    for (const pid of sessionProductIds) {
      const form = productForms[pid];
      if (!form) continue;
      const product = productMap.get(pid);
      const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
      const showVariantMatrix = productHasColorSizeMatrix(product, category);
      const link = reportScanLinkByProductRef.current.get(pid);
      const hadBatch = reportHadBatchScanByProductRef.current.has(pid);

      const matrixWeightPartsByVariantId = (() => {
        if (!weightReportEnabled || !(form.weight > 0) || !form.variantQuantities) return null as Map<string, number> | null;
        const entries = (Object.entries(form.variantQuantities) as Array<[string, number]>).filter(([, q]) => q > 0);
        if (entries.length === 0) return null;
        const parts = distributeWeightByQty(form.weight, entries.map(([, q]) => ({ quantity: q })));
        return new Map(entries.map(([vId], idx) => [vId, parts[idx]!]));
      })();
      const weightForVariant = (variantId: string) => matrixWeightPartsByVariantId?.get(variantId);

      const collectScanItemCodes = (variantId: string | null): string[] => {
        if (hadBatch) return [];
        if (variantId === null) {
          return [
            ...new Set(
              [...reportScanItemCodesByKeyRef.current.entries()]
                .filter(([k]) => k.startsWith(`${pid}__`))
                .flatMap(([, v]) => v),
            ),
          ];
        }
        return reportScanItemCodesByKeyRef.current.get(scanTraceKey(pid, variantId)) ?? [];
      };

      const submitCustomData = (variantId: string | null): Record<string, unknown> => {
        const scanItemCodeIds = collectScanItemCodes(variantId);
        return {
          ...form.customData,
          ...(link?.virtualBatchId ? { virtualBatchId: link.virtualBatchId } : {}),
          ...(link?.itemCodeId ? { itemCodeId: link.itemCodeId } : {}),
          ...(scanItemCodeIds.length > 0 ? { [SCAN_ITEM_CODE_IDS_KEY]: scanItemCodeIds } : {}),
        };
      };

      const hasQty = showVariantMatrix && form.variantQuantities
        ? Object.entries(form.variantQuantities).some(([vId, q]) => (q as number) > 0 || (form.variantDefectiveQuantities?.[vId] ?? 0) > 0)
        : form.quantity + form.defectiveQuantity > 0;
      if (!hasQty) continue;

      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const reportNo = getNextReportNo();

      if (productionLinkMode === 'product' && onReportSubmitProduct) {
        if (showVariantMatrix && form.variantQuantities) {
          const entries = (Object.entries(form.variantQuantities) as Array<[string, number]>).filter(([vId, q]) => {
            const def = form.variantDefectiveQuantities?.[vId] ?? 0;
            return q > 0 || def > 0;
          });
          for (const [vId, qty] of entries) {
            const defQty = form.variantDefectiveQuantities?.[vId] ?? 0;
            await onReportSubmitProduct(
              pid,
              milestoneTemplateId,
              qty,
              submitCustomData(vId),
              vId,
              sharedWorkerId || undefined,
              defQty,
              sharedEquipmentId || undefined,
              batchId,
              reportNo,
              weightForVariant(vId),
            );
          }
        } else {
          await onReportSubmitProduct(
            pid,
            milestoneTemplateId,
            form.quantity,
            submitCustomData(null),
            form.variantId || undefined,
            sharedWorkerId || undefined,
            form.defectiveQuantity || 0,
            sharedEquipmentId || undefined,
            undefined,
            reportNo,
            weightReportEnabled && form.weight > 0 ? form.weight : undefined,
          );
        }
        continue;
      }

      if (!onReportSubmit) continue;
      if (showVariantMatrix && form.variantQuantities) {
        const entries = (Object.entries(form.variantQuantities) as Array<[string, number]>).filter(([vId, q]) => {
          const def = form.variantDefectiveQuantities?.[vId] ?? 0;
          return q > 0 || def > 0;
        });
        for (const [vId, qty] of entries) {
          const target = resolveTargetOrderForReport(orders, pid, milestoneTemplateId, vId, reportModal.order.id);
          if (!target) {
            toast.error(`未找到产品「${product?.name ?? pid}」的可报工单`);
            return;
          }
          const defQty = form.variantDefectiveQuantities?.[vId] ?? 0;
          await onReportSubmit(
            target.order.id,
            target.milestoneId,
            qty,
            submitCustomData(vId),
            vId,
            sharedWorkerId || undefined,
            defQty,
            sharedEquipmentId || undefined,
            batchId,
            reportNo,
            weightForVariant(vId),
          );
        }
      } else {
        const target = resolveTargetOrderForReport(
          orders,
          pid,
          milestoneTemplateId,
          form.variantId || undefined,
          reportModal.order.id,
        );
        if (!target) {
          toast.error(`未找到产品「${product?.name ?? pid}」的可报工单`);
          return;
        }
        await onReportSubmit(
          target.order.id,
          target.milestoneId,
          form.quantity,
          submitCustomData(null),
          form.variantId || undefined,
          sharedWorkerId || undefined,
          form.defectiveQuantity || 0,
          sharedEquipmentId || undefined,
          undefined,
          reportNo,
          weightReportEnabled && form.weight > 0 ? form.weight : undefined,
        );
      }
    }
    onClose();
  }, [
    effectiveReportTemplate,
    reportForm,
    sessionProductIds,
    productForms,
    productMap,
    categoryMap,
    weightReportEnabled,
    productionLinkMode,
    onReportSubmit,
    onReportSubmitProduct,
    onClose,
    orders,
    productMilestoneProgresses,
    milestoneTemplateId,
    reportModal.order.id,
  ]);

  return {
    reportForm,
    setReportForm,
    productForms,
    sessionProductIds,
    setProductForm,
    weightPreviewRows,
    getWeightPreviewRowsForProduct,
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
