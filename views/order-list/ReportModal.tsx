
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { FileText, X, Check, UserPlus, BookOpen } from 'lucide-react';
import { ScanBatchTrigger } from '../../components/scan/ScanBatchTrigger';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import { rewriteScanApiErrorForIme, type ScanPayload } from '../../utils/scanPayload';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import { scanItemResultToRowDetail, scanVirtualBatchResultToRowDetail } from '../../utils/scanBatchRowDetail';
import {
  ProductionOrder,
  Milestone,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductCategory,
  Worker,
  ProductMilestoneProgress,
  ProductionOpRecord,
  ProcessSequenceMode,
  ProductVariant,
  BOM,
} from '../../types';
import { calcUsageByWeight } from '../../utils/bomMaterialUsageByWeight';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import {
  pmpCompletedAtTemplate,
  combinedCompletedAtTemplate,
  productGroupMaxReportableSum,
  pmpDefectiveTotalAtTemplate,
  variantMaxGoodProductMode,
} from '../../utils/productReportAggregates';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { reworkMergeBucketOrderId } from '../../utils/reworkMergeBucketOrderId';
import { toast } from 'sonner';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { toLocalCompactYmd } from '../../utils/localDateTime';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../components/variant-matrix/QtyMatrixTable';
import { parseRouteReportFileUrls, dataUrlToBlobUrl } from '../../utils/routeReportFileUrls';
import { coerceRouteReportDefaultForField, getEffectiveReportTemplate } from '../../utils/effectiveReportTemplate';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';

export interface ReportModalData {
  order: ProductionOrder;
  milestone: Milestone;
  productTotalQty?: number;
  productCompletedQty?: number;
  /** 顺序工序模式下该工序实际可报基数（扣不良+返工后），用于提示文案 */
  productMaxReportableQty?: number;
  productItems?: { variantId?: string; quantity: number; completedQuantity: number }[];
  productOrders?: ProductionOrder[];
}

interface ReportModalProps {
  reportModal: ReportModalData;
  open: boolean;
  onClose: () => void;
  onReportSubmit?: (
    orderId: string, milestoneId: string, quantity: number, customData: any,
    variantId?: string, workerId?: string, defectiveQty?: number,
    equipmentId?: string, reportBatchId?: string, reportNo?: string,
    weight?: number,
  ) => void;
  onReportSubmitProduct?: (
    productId: string, milestoneTemplateId: string, quantity: number, customData: any,
    variantId?: string, workerId?: string, defectiveQty?: number,
    equipmentId?: string, reportBatchId?: string, reportNo?: string,
    weight?: number,
  ) => void;
  products: Product[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  dictionaries: AppDictionaries;
  processSequenceMode: ProcessSequenceMode;
  allowExceedMaxReportQty: boolean;
  productionLinkMode: 'order' | 'product';
  orders: ProductionOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  prodRecords: ProductionOpRecord[];
  /** 工序开启「报工时记录重量」时，用于本工序 BOM 预览与按占比分摊预估 */
  boms?: BOM[];
}

const ReportModal: React.FC<ReportModalProps> = ({
  reportModal,
  open,
  onClose,
  onReportSubmit,
  onReportSubmitProduct,
  products,
  categories,
  globalNodes,
  workers,
  equipment,
  dictionaries,
  processSequenceMode,
  allowExceedMaxReportQty,
  productionLinkMode,
  orders,
  productMilestoneProgresses,
  prodRecords,
  boms,
}) => {
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, prodRecords),
    [orders, prodRecords],
  );

  const getDefectiveRework = (orderId: string, templateId: string) =>
    defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ??
    { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

  /** 与列表一致：优先用父级最新 orders，避免弹窗内仍用打开时的工单快照 */
  const orderIdsInModal = useMemo(
    () => (reportModal.productOrders?.length ? reportModal.productOrders.map(o => o.id) : [reportModal.order.id]),
    [reportModal.productOrders, reportModal.order.id],
  );
  const ordersInModal = useMemo(() => {
    const resolved = orderIdsInModal
      .map(id => orders.find(o => o.id === id))
      .filter((o): o is ProductionOrder => o != null);
    if (resolved.length > 0) return resolved;
    return reportModal.productOrders?.length ? reportModal.productOrders : [reportModal.order];
  }, [orderIdsInModal, orders, reportModal.productOrders, reportModal.order]);

  const [reportForm, setReportForm] = useState<{
    quantity: number;
    defectiveQuantity: number;
    variantId: string;
    workerId: string;
    equipmentId: string;
    customData: Record<string, any>;
    variantQuantities?: Record<string, number>;
    variantDefectiveQuantities?: Record<string, number>;
    /** 工序开启「报工时记录重量」时的本次交货总重量（kg） */
    weight: number;
  }>(() => {
    const initialData: Record<string, any> = {};
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

  const weightReportEnabled = useMemo(
    () => !!globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableWeightOnReport,
    [globalNodes, reportModal.milestone.templateId],
  );

  /** 根据节点 + 产品定位本工序适用 BOM；优先精确 variant，次选单 SKU */
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

  /** 顶部预览：按当前报工数量与重量在单 variant 下折算每种子物料的实际消耗 */
  const weightPreviewRows = useMemo(() => {
    if (!weightReportEnabled) return [] as ReturnType<typeof calcUsageByWeight>;
    const totalQty = reportForm.variantQuantities
      ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0)
      : reportForm.quantity;
    if (!(reportForm.weight > 0) || !(totalQty > 0)) return [];
    const variantForBom = reportForm.variantQuantities
      ? Object.entries(reportForm.variantQuantities).find(([, q]) => q > 0)?.[0]
      : reportForm.variantId;
    const bom = resolveBomForVariant(variantForBom);
    if (!bom) return [];
    const productsById = new Map(products.map(p => [p.id, p]));
    return calcUsageByWeight(bom, totalQty, reportForm.weight, productsById);
  }, [
    weightReportEnabled,
    reportForm.weight,
    reportForm.quantity,
    reportForm.variantQuantities,
    reportForm.variantId,
    resolveBomForVariant,
    products,
  ]);

  const effectiveReportTemplate = useMemo(
    () => getEffectiveReportTemplate(reportModal.milestone, globalNodes),
    [
      reportModal.order.id,
      reportModal.milestone.id,
      reportModal.milestone.templateId,
      reportModal.milestone.reportTemplate,
      globalNodes,
    ],
  );

  /**
   * 本工序展示：图片用弹层大图；PDF 用新标签页打开。
   * Chrome 在带 sandbox 的 iframe 里常拦截内置 PDF 查看器，出现「此页面已被 Chrome 屏蔽」，故 PDF 不走 iframe。
   */
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
      // 勿在第三个参数里加 noopener：含 noopener 时 window.open 按规范固定返回 null，
      // 即使新标签已打开，会误触发「弹窗被拦截」提示。
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

  const handleReportFieldChange = (fieldId: string, value: any) => {
    setReportForm(prev => ({ ...prev, customData: { ...prev.customData, [fieldId]: value } }));
  };

  const handleVariantQuantityChange = (variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantQuantities: { ...(prev.variantQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  };

  const handleVariantDefectiveChange = (variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantDefectiveQuantities: { ...(prev.variantDefectiveQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  };

  const scannedItemTokensRef = useRef<Set<string>>(new Set());
  const scannedBatchTokensRef = useRef<Set<string>>(new Set());

  const applyScanPayload = useCallback(
    async (payload: ScanPayload): Promise<boolean> => {
      if (!payload.token) return false;
      const currentPlanOrderId = reportModal.order.planOrderId;
      if (!currentPlanOrderId) {
        toast.error('当前工单未关联计划，无法校验扫码');
        return false;
      }
      try {
        if (payload.kind === 'ITEM') {
          if (scannedItemTokensRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return false;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.status === 'VOIDED') {
            toast.error(res.message || '单品码已作废');
            return false;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (callerPlanId !== currentPlanOrderId) {
            toast.error('此码不属于当前工单所在计划');
            return false;
          }
          scannedItemTokensRef.current.add(payload.token);
          const vid = res.variantId || '';
          if (reportForm.variantQuantities && !vid) {
            scannedItemTokensRef.current.delete(payload.token);
            toast.error('单品码未带规格，无法在按规格模式下累加');
            return false;
          }
          setReportForm(f => {
            if (f.variantQuantities) {
              const prev = f.variantQuantities[vid] ?? 0;
              return { ...f, variantQuantities: { ...f.variantQuantities, [vid]: prev + 1 } };
            }
            return { ...f, quantity: (f.quantity || 0) + 1, variantId: vid || f.variantId };
          });
          toast.success(
            `扫码 +1${res.variantLabel || res.productName ? `（${res.variantLabel || res.productName}）` : ''}${
              res.ownerTenantName && res.callerContext?.relation !== 'OWNER' ? ` · 来自 ${res.ownerTenantName}` : ''
            }`,
          );
          return true;
        }
        if (payload.kind === 'BATCH') {
          if (scannedBatchTokensRef.current.has(payload.token)) {
            toast.warning('此批次码已扫描过');
            return false;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.status === 'VOIDED') {
            toast.error(res.message || '批次码已作废');
            return false;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (callerPlanId !== currentPlanOrderId) {
            toast.error('此批次码不属于当前工单所在计划');
            return false;
          }
          scannedBatchTokensRef.current.add(payload.token);
          const qty = res.quantity ?? 0;
          const vid = res.variantId || '';
          if (reportForm.variantQuantities && !vid) {
            scannedBatchTokensRef.current.delete(payload.token);
            toast.error('批次码未带规格，无法在按规格模式下累加');
            return false;
          }
          setReportForm(f => {
            if (f.variantQuantities) {
              const prev = f.variantQuantities[vid] ?? 0;
              return { ...f, variantQuantities: { ...f.variantQuantities, [vid]: prev + qty } };
            }
            return { ...f, quantity: (f.quantity || 0) + qty, variantId: vid || f.variantId };
          });
          toast.success(
            `批次码 +${qty}${res.variantLabel || res.productName ? `（${res.variantLabel || res.productName}）` : ''}${
              res.ownerTenantName && res.callerContext?.relation !== 'OWNER' ? ` · 来自 ${res.ownerTenantName}` : ''
            }`,
          );
          return true;
        }
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return false;
      }
      return false;
    },
    [reportModal.order.planOrderId, reportForm.variantQuantities],
  );

  const resolveReportScanRowPreview = useCallback(
    async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      if (!payload.token) return null;
      const currentPlanOrderId = reportModal.order.planOrderId;
      if (!currentPlanOrderId) {
        toast.error('当前工单未关联计划，无法校验扫码');
        return null;
      }
      try {
        if (payload.kind === 'ITEM') {
          if (scannedItemTokensRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return null;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.status === 'VOIDED') {
            toast.error(res.message || '单品码已作废');
            return null;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (callerPlanId !== currentPlanOrderId) {
            toast.error('此码不属于当前工单所在计划');
            return null;
          }
          const vid = res.variantId || '';
          if (reportForm.variantQuantities && !vid) {
            toast.error('单品码未带规格，无法在按规格模式下累加');
            return null;
          }
          return scanItemResultToRowDetail(res);
        }
        if (payload.kind === 'BATCH') {
          if (scannedBatchTokensRef.current.has(payload.token)) {
            toast.warning('此批次码已扫描过');
            return null;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.status === 'VOIDED') {
            toast.error(res.message || '批次码已作废');
            return null;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (callerPlanId !== currentPlanOrderId) {
            toast.error('此批次码不属于当前工单所在计划');
            return null;
          }
          const vid = res.variantId || '';
          if (reportForm.variantQuantities && !vid) {
            toast.error('批次码未带规格，无法在按规格模式下累加');
            return null;
          }
          return scanVirtualBatchResultToRowDetail(res);
        }
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return null;
      }
      return null;
    },
    [reportModal.order.planOrderId, reportForm.variantQuantities],
  );

  const handleScanBatchConfirm = useCallback(
    async (payloads: ScanPayload[]) => {
      for (const p of payloads) {
        const ok = await applyScanPayload(p);
        if (!ok) return false;
      }
      return true;
    },
    [applyScanPayload],
  );

  const getSeqRemainingForVariant = useCallback((variantId: string): number => {
    const productId = reportModal.order.productId;
    const milestoneTemplateId = reportModal.milestone.templateId;
    const allOrders = ordersInModal;
    const items = reportModal.productItems ?? reportModal.order.items;
    const item = items.find(i => (i.variantId || '') === variantId) ?? (items.length === 1 ? items[0] : undefined);

    let tplIndex: number;
    let prevTemplateId: string | undefined;
    if (productionLinkMode === 'product') {
      const product = productMap.get(productId);
      const nodeIds = product?.milestoneNodeIds || [];
      tplIndex = nodeIds.indexOf(milestoneTemplateId);
      if (tplIndex > 0) prevTemplateId = nodeIds[tplIndex - 1];
    } else {
      const ref = allOrders.find(o => o.milestones.some(m => m.templateId === milestoneTemplateId)) ?? reportModal.order;
      tplIndex = ref.milestones.findIndex(m => m.templateId === milestoneTemplateId);
      if (tplIndex > 0) prevTemplateId = ref.milestones[tplIndex - 1].templateId;
    }

    const freshMilestone = allOrders
      .map(o => o.milestones.find(m => m.templateId === milestoneTemplateId))
      .find(Boolean);

    if (tplIndex <= 0) {
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
            (prevMs.reports || []).forEach(r => {
              if ((r.variantId || '') === vid) prevQty += r.quantity;
            });
          } else if ((prevMs.completedQuantity ?? 0) > 0 && orderTotalQty > 0) {
            prevQty += Math.round(((prevMs.completedQuantity ?? 0) * variantItemQty) / orderTotalQty);
          }
        }
      }
      const curMs = o.milestones.find(m => m.templateId === milestoneTemplateId);
      if (curMs) {
        const hasVariantReports = (curMs.reports || []).some(r => r.variantId && r.variantId !== '');
        if (hasVariantReports) {
          (curMs.reports || []).forEach(r => {
            if ((r.variantId || '') === vid) curQty += r.quantity;
          });
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
    ordersInModal,
    productionLinkMode,
    productMap,
    productMilestoneProgresses,
  ]);

  const getNextReportNo = () => {
    const todayStr = toLocalCompactYmd(new Date());
    const keys = new Set<string>();
    orders.forEach(o => {
      o.milestones?.forEach(m => {
        (m.reports || []).forEach(r => {
          const ds = toLocalCompactYmd(r.timestamp);
          if (!ds || ds !== todayStr) return;
          const key = r.reportBatchId || r.reportNo || r.id;
          keys.add(key);
        });
      });
    });
    productMilestoneProgresses.forEach(p => {
      (p.reports || []).forEach(r => {
        const ds = toLocalCompactYmd(r.timestamp);
        if (!ds || ds !== todayStr) return;
        const key = r.reportBatchId || r.reportNo || r.id;
        keys.add(key);
      });
    });
    const seq = keys.size + 1;
    const seqStr = String(seq).padStart(4, '0');
    return `BG${todayStr}-${seqStr}`;
  };

  const submitReport = async () => {
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
    const category = categoryMap.get(product?.categoryId);
    const showVariantMatrix = productHasColorSizeMatrix(product, category);

    /** 矩阵模式下按良品数量把总重量按比例拆到每个 variant 报工记录上（defectiveOnly 行不分重量） */
    const matrixTotalQtyForWeight = reportForm.variantQuantities
      ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0)
      : 0;
    const weightForVariant = (qty: number) => {
      if (!weightReportEnabled || !(reportForm.weight > 0)) return undefined;
      if (!(matrixTotalQtyForWeight > 0) || !(qty > 0)) return undefined;
      return reportForm.weight * (qty / matrixTotalQtyForWeight);
    };

    if (productionLinkMode === 'product' && onReportSubmitProduct) {
      if (showVariantMatrix && reportForm.variantQuantities) {
        const entries = Object.entries(reportForm.variantQuantities).filter(([vId, q]) => {
          const def = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          return q > 0 || def > 0;
        });
        if (entries.length === 0) return;
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const reportNo = getNextReportNo();
        for (const [vId, qty] of entries) {
          const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          await onReportSubmitProduct!(
            productId, milestoneTemplateId, qty, reportForm.customData,
            vId, reportForm.workerId || undefined, defQty,
            reportForm.equipmentId || undefined, batchId, reportNo,
            weightForVariant(qty),
          );
        }
      } else {
        const reportNo = getNextReportNo();
        await onReportSubmitProduct(
          productId, milestoneTemplateId, reportForm.quantity, reportForm.customData,
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
      const entries = Object.entries(reportForm.variantQuantities).filter(([vId, q]) => {
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
        await onReportSubmit!(
          targetOrder.id, ms.id, qty, reportForm.customData,
          vId, reportForm.workerId || undefined, defQty,
          reportForm.equipmentId || undefined, batchId, reportNo,
          weightForVariant(qty),
        );
      }
    } else {
      let targetOrder = reportModal.order;
      if (reportModal.productOrders && reportModal.productOrders.length > 0) {
        const vId = reportForm.variantId || undefined;
        const withVariant = reportModal.productOrders.find(o =>
          vId ? o.items.some(i => i.variantId === vId) : true,
        );
        targetOrder = withVariant ?? reportModal.productOrders[0];
      }
      const ms = targetOrder.milestones.find(m => m.templateId === reportModal.milestone.templateId) ?? reportModal.milestone;
      const reportNo = getNextReportNo();
      await onReportSubmit(
        targetOrder.id, ms.id, reportForm.quantity, reportForm.customData,
        reportForm.variantId || undefined, reportForm.workerId || undefined,
        reportForm.defectiveQuantity || 0, reportForm.equipmentId || undefined,
        undefined, reportNo,
        weightReportEnabled && reportForm.weight > 0 ? reportForm.weight : undefined,
      );
    }
    onClose();
  };

  const isMatrixMode = (() => {
    const product = productMap.get(reportModal.order.productId);
    const category = categoryMap.get(product?.categoryId);
    return productHasColorSizeMatrix(product, category);
  })();

  const matrixTotalQty = reportForm.variantQuantities
    ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0)
    : 0;
  const matrixTotalDef = reportForm.variantDefectiveQuantities
    ? Object.values(reportForm.variantDefectiveQuantities).reduce((s, q) => s + q, 0)
    : 0;
  const canSubmitMatrix = isMatrixMode
    ? (matrixTotalQty + matrixTotalDef) > 0
    : (reportForm.quantity + reportForm.defectiveQuantity) > 0;
  const needEquipment =
    equipmentFeaturesOn &&
    !!globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableEquipmentOnReport;

  if (!open) return null;

  const tid = reportModal.milestone.templateId;
  const pid = reportModal.order.productId;
  const useProductPmp = productionLinkMode === 'product' && productMilestoneProgresses.length > 0;
  const productForModal = productMap.get(pid);
  const modalMilestoneOrder = productForModal?.milestoneNodeIds ?? [];
  const seqIdx = modalMilestoneOrder.indexOf(tid);
  const totalBase = useProductPmp
    ? productGroupMaxReportableSum(
        ordersInModal,
        tid,
        pid,
        productMilestoneProgresses,
        processSequenceMode,
        (oid, t) => getDefectiveRework(oid, t),
        undefined,
        orders,
      )
    : processSequenceMode === 'sequential'
      ? ordersInModal.reduce((s, o) => {
          const idx = o.milestones.findIndex(m => m.templateId === tid);
          if (idx <= 0) return s + o.items.reduce((a, i) => a + i.quantity, 0);
          const prev = o.milestones[idx - 1];
          return s + (prev?.completedQuantity ?? 0);
        }, 0)
      : ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const totalDefective = ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0);
  const pmpDefectiveAtNode = useProductPmp
    ? pmpDefectiveTotalAtTemplate(productMilestoneProgresses, pid, tid)
    : 0;
  /** 关联产品模式下不良写在 PMP，工单里程碑常为 0；与可报量计算口径对齐，避免提示漏掉「报不良」件数 */
  const defectiveQtyForHint = useProductPmp ? Math.max(pmpDefectiveAtNode, totalDefective) : totalDefective;
  const totalRework = [...new Set(ordersInModal.map(o => reworkMergeBucketOrderId(o.id, orders)))].reduce(
    (s, bid) => s + getDefectiveRework(bid, tid).rework,
    0,
  );
  // 关联产品：PMP + 工单里程碑（外协收回会写回里程碑）双路径求和，避免「已报」数显示偏小。
  const totalCompleted = useProductPmp
    ? combinedCompletedAtTemplate(ordersInModal, productMilestoneProgresses, pid, tid)
    : ordersInModal.reduce((s, o) => s + (o.milestones.find(m => m.templateId === tid)?.completedQuantity ?? 0), 0);
  const outsourceFilter = useProductPmp
    ? (r: ProductionOpRecord) => r.type === 'OUTSOURCE' && !r.sourceReworkId && !r.orderId && r.productId === pid && r.nodeId === tid
    : (r: ProductionOpRecord) => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.nodeId === tid && orderIdsInModal.includes(r.orderId ?? '');
  const outsourceDispatchedByVariant: Record<string, number> = {};
  const outsourceReceivedByVariant: Record<string, number> = {};
  let totalDispatched = 0;
  let totalReceived = 0;
  prodRecords.filter(outsourceFilter).forEach(r => {
    const vid = r.variantId ?? '';
    if (r.status === '加工中') {
      totalDispatched += r.quantity ?? 0;
      outsourceDispatchedByVariant[vid] = (outsourceDispatchedByVariant[vid] ?? 0) + (r.quantity ?? 0);
    } else if (r.status === '已收回') {
      totalReceived += r.quantity ?? 0;
      outsourceReceivedByVariant[vid] = (outsourceReceivedByVariant[vid] ?? 0) + (r.quantity ?? 0);
    }
  });
  const totalOutsourcedAtNode = Math.max(0, totalDispatched - totalReceived);
  const outsourcedByVariantId: Record<string, number> = {};
  for (const vid of new Set([...Object.keys(outsourceDispatchedByVariant), ...Object.keys(outsourceReceivedByVariant)])) {
    const net = (outsourceDispatchedByVariant[vid] ?? 0) - (outsourceReceivedByVariant[vid] ?? 0);
    if (net > 0) outsourcedByVariantId[vid] = net;
  }
  const effectiveRemainingForModal = useProductPmp
    ? Math.max(0, totalBase - totalCompleted - totalOutsourcedAtNode)
    : Math.max(0, totalBase - totalDefective + totalRework - totalCompleted - totalOutsourcedAtNode);

  /** 顶栏「可报 A/B」：有产品聚合用入参，否则从弹窗内多单/单工单推导，关联工单与关联产品同一套文案 */
  const hintTotalQty =
    reportModal.productTotalQty ??
    ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const hintMaxReportableRaw =
    reportModal.productMaxReportableQty ??
    (useProductPmp
      ? productGroupMaxReportableSum(
          ordersInModal,
          tid,
          pid,
          productMilestoneProgresses,
          processSequenceMode,
          (oid, t) => getDefectiveRework(oid, t),
          undefined,
          orders,
        )
      : ordersInModal.reduce((s, o) => {
          const idx = o.milestones.findIndex(m => m.templateId === tid);
          let base = o.items.reduce((a, i) => a + i.quantity, 0);
          if (processSequenceMode === 'sequential' && idx > 0) {
            base = o.milestones[idx - 1]?.completedQuantity ?? 0;
          }
          const { defective, rework } = getDefectiveRework(o.id, tid);
          return s + Math.max(0, base - defective + rework);
        }, 0));
  const hintMaxReportable = Math.max(0, Math.round(Number(hintMaxReportableRaw) || 0));
  const hintCompletedDisplay = reportModal.productCompletedQty ?? totalCompleted;
  /** 与 effectiveRemainingForModal 一致：本工序外协「已发未收回」均应从可报剩余中扣除，并单独展示件数 */
  const hintRemaining = Math.max(0, hintMaxReportable - hintCompletedDisplay - totalOutsourcedAtNode);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-4xl min-h-0 max-h-[min(90vh,calc(100dvh-2rem))] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> {reportModal.milestone.name} · 报工</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <form className="flex flex-col flex-1 min-h-0" autoComplete="off" onSubmit={e => e.preventDefault()}>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4 space-y-3">
          {isMatrixMode && (
          <div className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-slate-700">{reportModal.order.productName}</span>
            {hintTotalQty > 0 ? (
              <>
                <span className="mx-2">·</span>
                <span className="ml-2">
                  {hintMaxReportable !== hintTotalQty ? (
                    <>可报 {hintMaxReportable}/{hintTotalQty} 件 · </>
                  ) : (
                    <>合计 {hintTotalQty} 件 · </>
                  )}
                  已报 {hintCompletedDisplay} · 剩 {hintRemaining} 件
                  {totalOutsourcedAtNode > 0 ? (
                    <span className="text-slate-400" title="本工序已发外协、尚未收回的在制数量（外协剩余）">
                      {' '}
                      · 外协剩余 {totalOutsourcedAtNode} 件
                    </span>
                  ) : null}
                  {defectiveQtyForHint > 0 ? (
                    <span
                      className="text-slate-400"
                      title="本工序报不良等需走返工流程的件数（含关联产品报工 PMP）"
                    >
                      {' '}
                      · 返工 {defectiveQtyForHint} 件
                    </span>
                  ) : null}
                  {totalRework > 0 ? (
                    <span className="text-slate-400" title="返工报工已回缴到本工序的完成件数">
                      {' '}
                      ·{defectiveQtyForHint > 0 ? ' 返工完成' : ' 返工'} {totalRework}
                    </span>
                  ) : null}
                </span>
              </>
            ) : (
              <>
                <span className="mx-2">·</span>
                <span>{reportModal.order.orderNumber}</span>
              </>
            )}
            {(() => {
              const p = products.find(px => px.id === reportModal.order.productId);
              const rate = p?.nodeRates?.[reportModal.milestone.templateId] ?? 0;
              if (rate <= 0) return null;
              const totalQty = reportForm.variantQuantities ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0) : 0;
              return (
                <div className="mt-2 flex items-center gap-4 text-indigo-600">
                  <span className="font-bold">本工序工价：{rate.toFixed(2)} 元/件</span>
                  {totalQty > 0 && <span className="font-bold">预计金额：{(totalQty * rate).toFixed(2)} 元</span>}
            </div>
              );
            })()}
          </div>
          )}
          {(() => {
            const tid = reportModal.milestone.templateId;
            const nodeDef = globalNodes.find(n => n.id === tid);
            const fromMilestone = reportModal.milestone.reportDisplayTemplate;
            const displayTpl =
              (fromMilestone?.length ?? 0) > 0 ? fromMilestone : (nodeDef?.reportDisplayTemplate ?? []);
            if (displayTpl.length === 0) return null;
            const product = productMap.get(reportModal.order.productId);
            const displayVals = product?.routeReportDisplayValues?.[tid] ?? {};

            type VisibleDisplayRow =
              | { field: (typeof displayTpl)[number]; kind: 'file'; urls: string[] }
              | { field: (typeof displayTpl)[number]; kind: 'text'; text: string };
            const visibleRows: VisibleDisplayRow[] = [];
            for (const field of displayTpl) {
              const raw = displayVals[field.id] ?? '';
              if (field.type === 'file') {
                const urls = parseRouteReportFileUrls(raw);
                if (urls.length === 0) continue;
                visibleRows.push({ field, kind: 'file', urls });
              } else if (String(raw).trim()) {
                visibleRows.push({ field, kind: 'text', text: String(raw) });
              }
            }
            if (visibleRows.length === 0) return null;

            return (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-3 py-3 space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">本工序展示（只读）</span>
                </div>
                {visibleRows.map(row => (
                  <div key={row.field.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                    <p className="text-[10px] font-bold text-slate-500 mb-1.5">{row.field.label}</p>
                    {row.kind === 'file' ? (
                      <div className="flex flex-wrap gap-2">
                        {row.urls.map((url, fi) => (
                          <div key={`${row.field.id}-${fi}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-1.5">
                            {url.startsWith('data:image/') ? (
                              <button
                                type="button"
                                onClick={() => openDisplayFilePreview(url, 'image')}
                                className="rounded-md border border-slate-200 overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:opacity-90"
                                title="点击查看大图"
                              >
                                <img src={url} alt="" className="h-16 w-16 object-cover pointer-events-none" />
                              </button>
                            ) : url.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(url) ? (
                              <button
                                type="button"
                                onClick={() => openDisplayFilePreview(url, 'pdf')}
                                className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg px-1 py-0.5"
                              >
                                <FileText className="w-4 h-4 text-rose-500 shrink-0" /> 查看 PDF
                              </button>
                            ) : (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-indigo-600 hover:underline"
                              >
                                附件 {fi + 1}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.text}</p>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">生产人员 <span className="text-rose-500">*</span></label>
            <WorkerSelector
              options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
              processNodes={globalNodes}
              currentNodeId={reportModal.milestone.templateId}
              value={reportForm.workerId}
              onChange={(id) => setReportForm(prev => ({ ...prev, workerId: id }))}
              placeholder="选择报工人员..."
              variant="default"
              icon={UserPlus}
            />
          </div>
          {needEquipment && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">设备 <span className="text-rose-500">*</span></label>
              <EquipmentSelector
                options={equipment.map(e => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                processNodes={globalNodes}
                currentNodeId={reportModal.milestone.templateId}
                value={reportForm.equipmentId}
                onChange={(id) => setReportForm(prev => ({ ...prev, equipmentId: id }))}
                placeholder="选择设备..."
                variant="default"
              />
            </div>
          )}
          {isMatrixMode ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase shrink-0">本次完成数量（按规格）</label>
                <div className="flex items-center gap-2 shrink-0">
                  <ScanBatchTrigger
                    onApply={handleScanBatchConfirm}
                    resolveRowPreview={resolveReportScanRowPreview}
                    size="sm"
                    hint="扫码录入"
                    modalTitle="报工 · 批量扫码"
                    modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加到本次完成数量。"
                    showScanIntentToggle
                  />
                  <span className="text-xs sm:text-sm font-bold text-indigo-600 tabular-nums">合计 {matrixTotalQty} 件</span>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50/50 p-2 sm:p-2.5 ring-1 ring-slate-100/80">
                {(() => {
                  const product = productMap.get(reportModal.order.productId);
                  const category = categoryMap.get(product?.categoryId);
                  if (!product || !productHasColorSizeMatrix(product, category) || !dictionaries) return null;
                  const currentOrder = ordersInModal[0];
                  const currentMs = currentOrder?.milestones.find(m => m.templateId === tid);
                  const reworkByVariant: Record<string, number> = {};
                  for (const bid of new Set(ordersInModal.map(o => reworkMergeBucketOrderId(o.id, orders)))) {
                    const rw = getDefectiveRework(bid, tid).reworkByVariant;
                    Object.entries(rw).forEach(([k, q]) => {
                      reworkByVariant[k] = (reworkByVariant[k] ?? 0) + q;
                    });
                  }
                  const itemsSource = currentOrder?.items ?? reportModal.productItems ?? reportModal.order.items ?? [];
                  const milestoneNodeIds = product.milestoneNodeIds || [];
                  const variantRemainingBaseMap = new Map<string, number>();
                  for (const variant of product.variants ?? []) {
                    if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
                      const rawMax =
                        variantMaxGoodProductMode(
                          variant.id,
                          tid,
                          reportModal.order.productId,
                          ordersInModal,
                          productMilestoneProgresses,
                          processSequenceMode,
                          milestoneNodeIds,
                          (oid, t) => getDefectiveRework(oid, t),
                          orders,
                        ) - (outsourcedByVariantId[variant.id] ?? 0);
                      variantRemainingBaseMap.set(variant.id, Math.max(0, rawMax));
                      continue;
                    }
                    const item = Array.isArray(itemsSource) ? itemsSource.find((i: { variantId?: string }) => (i.variantId || '') === variant.id) : undefined;
                    const completedInMilestone = (currentMs?.reports || []).filter((r: { variantId?: string }) => (r.variantId || '') === variant.id).reduce((s: number, r: { quantity?: number }) => s + (r.quantity ?? 0), 0);
                    const defectiveForThisVariant = (currentMs?.reports || []).filter((r: { variantId?: string; defectiveQuantity?: number }) => (r.variantId || '') === variant.id).reduce((s: number, r: { defectiveQuantity?: number }) => s + (r.defectiveQuantity ?? 0), 0);
                    const base = processSequenceMode === 'sequential'
                      ? Math.max(0, getSeqRemainingForVariant(variant.id) - defectiveForThisVariant)
                      : (item ? Math.max(0, (item.quantity ?? 0) - completedInMilestone - defectiveForThisVariant) : 0);
                    const reworkForVariant = reworkByVariant[variant.id] ?? 0;
                    const outsourcedForVariant = outsourcedByVariantId[variant.id] ?? 0;
                    variantRemainingBaseMap.set(variant.id, Math.max(0, base + reworkForVariant - outsourcedForVariant));
                  }
                  const renderVariantCellMatrix = (variant: ProductVariant) => {
                    const qty = reportForm.variantQuantities?.[variant.id] ?? 0;
                    const remaining = Math.max(0, variantRemainingBaseMap.get(variant.id) ?? 0);
                    const currentCellQty = reportForm.variantQuantities?.[variant.id] ?? 0;
                    const otherTotal = matrixTotalQty - currentCellQty;
                    const maxAllowed = Math.max(0, allowExceedMaxReportQty ? remaining : Math.min(remaining, effectiveRemainingForModal - otherTotal));
                    return (
                      <div key={variant.id} className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={qty === 0 ? '' : qty}
                            onChange={e => {
                              const raw = parseInt(e.target.value) || 0;
                              const next = allowExceedMaxReportQty ? raw : Math.min(raw, maxAllowed);
                              handleVariantQuantityChange(variant.id, next);
                            }}
                            className="h-8 w-[3rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[9px] placeholder:text-slate-400"
                            placeholder="0"
                            title={`良品，最多 ${maxAllowed}`}
                          />
                          <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-slate-400">
                            最多 {maxAllowed}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            tabIndex={-1}
                            value={(reportForm.variantDefectiveQuantities?.[variant.id] ?? 0) === 0 ? '' : (reportForm.variantDefectiveQuantities?.[variant.id] ?? 0)}
                            onChange={e => handleVariantDefectiveChange(variant.id, parseInt(e.target.value) || 0)}
                            className="h-8 w-[3rem] shrink-0 rounded-md border border-amber-200/90 bg-amber-50/90 px-1.5 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-[9px] placeholder:text-amber-400/80"
                            placeholder="0"
                            title="不良品"
                          />
                          <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-amber-800">不良品</span>
                        </div>
                      </div>
                    );
                  };
                  const layout = buildVariantQtyMatrixLayout(product, dictionaries);
                  if (!layout) return null;
                  const rows: QtyMatrixTableRow[] = layout.colorRows.map(row => {
                    let rowSum = 0;
                    const cells = row.variantAtSize.map((variant, si) => {
                      if (!variant) {
                        return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
                      }
                      rowSum += reportForm.variantQuantities?.[variant.id] ?? 0;
                      return renderVariantCellMatrix(variant);
                    });
                    return {
                      key: row.key,
                      colorCell: (
                        <div className="flex items-center gap-2">
                          {row.colorSwatch ? (
                            <span className="h-4 w-4 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: row.colorSwatch }} />
                          ) : null}
                          <span>{row.colorLabel}</span>
                        </div>
                      ),
                      cells,
                      subtotalCell: rowSum,
                    };
                  });
                  return (
                    <QtyMatrixTable
                      sizeHeaders={layout.sizeColumns.map(c => c.header)}
                      rows={rows}
                      dense
                    />
                  );
                })()}
              </div>
            </div>
          ) : (
            (() => {
              const reportProduct = productMap.get(reportModal.order.productId);
              const detailUnit =
                (reportProduct?.unitId && dictionaries.units.find(u => u.id === reportProduct.unitId)?.name) || '件';
              const nodeRate = reportProduct?.nodeRates?.[reportModal.milestone.templateId] ?? 0;
              const estAmount = reportForm.quantity > 0 && nodeRate > 0 ? reportForm.quantity * nodeRate : 0;
              return (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/40 px-4 pb-4 pt-4 space-y-3">
          {((reportModal.productItems ?? reportModal.order.items).length > 1) && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">报工规格项</label>
              <select
                    tabIndex={-1}
                value={reportForm.variantId}
                onChange={(e) => setReportForm({ ...reportForm, variantId: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
              >
                <option value="">请选择报工规格...</option>
                {(reportModal.productItems ?? reportModal.order.items).map((item, idx) => {
                  const product = productMap.get(reportModal.order.productId);
                  const v = product?.variants?.find((x: { id: string }) => x.id === item.variantId);
                      const completedInMilestone = reportModal.productItems
                        ? (item.completedQuantity ?? 0)
                        : (reportModal.milestone.reports || []).filter(r => (r.variantId || '') === (item.variantId || '')).reduce((s, r) => s + r.quantity, 0);
                      const remaining = item.quantity - completedInMilestone;
                  return (
                    <option key={item.variantId ?? idx} value={item.variantId || ''}>
                      {(v as { skuSuffix?: string })?.skuSuffix || item.variantId || `规格${idx + 1}`} (剩余: {remaining})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 sm:gap-x-5">
                <div className="flex min-w-0 w-full flex-1 flex-col gap-0.5 sm:w-auto sm:max-w-[min(100%,24rem)]">
                  {productionLinkMode === 'product' ? (
                    <>
                      <span className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{reportModal.order.productName}</span>
                      <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-snug">
                        {hintTotalQty > 0 ? (
                          <span className="block mt-0.5">
                            {hintMaxReportable !== hintTotalQty ? (
                              <>可报 {hintMaxReportable}/{hintTotalQty} {detailUnit} · </>
                            ) : (
                              <>合计 {hintTotalQty} {detailUnit} · </>
                            )}
                            已报 {hintCompletedDisplay} · 剩 {hintRemaining} {detailUnit}
                            {totalOutsourcedAtNode > 0 ? (
                              <span className="text-slate-400" title="本工序已发外协、尚未收回的在制数量（外协剩余）">
                                {' '}
                                · 外协剩余 {totalOutsourcedAtNode} {detailUnit}
                              </span>
                            ) : null}
                            {defectiveQtyForHint > 0 ? (
                              <span
                                className="text-slate-400"
                                title="本工序报不良等需走返工流程的数量（含关联产品报工 PMP）"
                              >
                                {' '}
                                · 返工 {defectiveQtyForHint} {detailUnit}
                              </span>
                            ) : null}
                            {totalRework > 0 ? (
                              <span className="text-slate-400" title="返工报工已回缴到本工序的完成数量">
                                {' '}
                                ·{defectiveQtyForHint > 0 ? ' 返工完成' : ' 返工'} {totalRework}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px] sm:text-[11px]">工单 {reportModal.order.orderNumber}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex min-w-0 w-full flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-slate-900">{reportModal.order.orderNumber}</span>
                        <span className="text-sm text-slate-400">·</span>
                        <span className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{reportModal.order.productName}</span>
                      </div>
                      {hintTotalQty > 0 ? (
                        <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-snug">
                          <span className="block mt-0.5">
                            {hintMaxReportable !== hintTotalQty ? (
                              <>可报 {hintMaxReportable}/{hintTotalQty} {detailUnit} · </>
                            ) : (
                              <>合计 {hintTotalQty} {detailUnit} · </>
                            )}
                            已报 {hintCompletedDisplay} · 剩 {hintRemaining} {detailUnit}
                            {totalOutsourcedAtNode > 0 ? (
                              <span className="text-slate-400" title="本工序已发外协、尚未收回的在制数量（外协剩余）">
                                {' '}
                                · 外协剩余 {totalOutsourcedAtNode} {detailUnit}
                              </span>
                            ) : null}
                            {defectiveQtyForHint > 0 ? (
                              <span className="text-slate-400" title="本工序报不良等需走返工流程的件数">
                                {' '}
                                · 返工 {defectiveQtyForHint} {detailUnit}
                              </span>
                            ) : null}
                            {totalRework > 0 ? (
                              <span className="text-slate-400" title="返工报工已回缴到本工序的完成件数">
                                {' '}
                                ·{defectiveQtyForHint > 0 ? ' 返工完成' : ' 返工'} {totalRework}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex flex-col shrink-0 sm:pl-1">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={reportForm.quantity === 0 ? '' : reportForm.quantity}
                        onChange={e => {
                          const raw = parseInt(e.target.value) || 0;
                          const next = allowExceedMaxReportQty ? raw : Math.min(raw, effectiveRemainingForModal);
                          setReportForm({ ...reportForm, quantity: next });
                        }}
                        placeholder="0"
                        title={`最多 ${effectiveRemainingForModal}`}
                        className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[9px] placeholder:text-slate-400 tabular-nums"
                      />
                      <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-slate-400">
                        最多 {effectiveRemainingForModal}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        tabIndex={-1}
                        value={reportForm.defectiveQuantity === 0 ? '' : reportForm.defectiveQuantity}
                        onChange={e => setReportForm({ ...reportForm, defectiveQuantity: parseInt(e.target.value) || 0 })}
                        className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-amber-200/90 bg-amber-50/90 px-2 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-[9px] placeholder:text-amber-400/80 tabular-nums"
                        placeholder="0"
                        title="不良品"
                      />
                      <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-amber-800">不良品</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-end gap-2 sm:gap-3">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap tracking-wide">工价</label>
                  <div className="h-8 w-[5.25rem] box-border rounded-lg border border-slate-100 bg-white px-1.5 text-xs font-bold text-slate-700 flex items-center justify-center tabular-nums">
                    {nodeRate > 0 ? `${nodeRate.toFixed(2)} 元/${detailUnit}` : '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap tracking-wide">预计金额</label>
                  <div className="h-8 min-w-[4.75rem] max-w-[5.5rem] box-border rounded-lg border border-slate-100 bg-white px-1 text-xs font-bold text-slate-700 flex items-center justify-center tabular-nums">
                    {reportForm.quantity > 0 && nodeRate > 0 ? estAmount.toFixed(2) : '—'}
                  </div>
                </div>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0 sm:pl-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap tracking-wide">扫码累加</label>
                  <div className="h-8 flex items-center">
                    <ScanBatchTrigger
                      onApply={handleScanBatchConfirm}
                      resolveRowPreview={resolveReportScanRowPreview}
                      hint="扫码录入"
                      modalTitle="报工 · 批量扫码"
                      modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加到本次完成数量。"
                      showScanIntentToggle
                    />
                  </div>
                </div>
              </div>
            </div>
              );
            })()
          )}
          {weightReportEnabled && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <label className="text-[11px] font-bold text-indigo-700 uppercase tracking-widest">本次交货总重量 (kg)</label>
                <span className="text-[10px] text-indigo-500 font-medium leading-snug sm:text-right">将按 BOM 自动分摊到各子物料</span>
              </div>
              <input
                type="number"
                min={0}
                step="0.0001"
                value={reportForm.weight === 0 ? '' : reportForm.weight}
                onChange={e => {
                  const n = parseFloat(e.target.value);
                  setReportForm(prev => ({ ...prev, weight: Number.isFinite(n) && n > 0 ? n : 0 }));
                }}
                className="w-full bg-white border border-indigo-200 rounded-lg py-2 px-3 text-sm font-bold text-indigo-700 text-right outline-none focus:ring-2 focus:ring-indigo-200"
              />
              {weightPreviewRows.length > 0 ? (
                <div className="rounded-xl bg-white border border-indigo-100 overflow-hidden">
                  <div className="px-3 py-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50/70 border-b border-indigo-100">
                    预估物料消耗（按 BOM 占比 × 输入重量）
                  </div>
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <tr>
                        <th className="px-3 py-1.5 text-left">物料</th>
                        <th className="px-3 py-1.5 text-right">占比</th>
                        <th className="px-3 py-1.5 text-right" title="BOM 单位用量 × 报工件数">理论重量 (kg)</th>
                        <th className="px-3 py-1.5 text-right">实际消耗 (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weightPreviewRows.map(row => (
                        <tr key={row.materialProductId} className="border-t border-slate-100 last:border-b-0">
                          <td className="px-3 py-1.5 text-slate-700 font-bold">{row.materialName || row.materialProductId}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{(row.ratio * 100).toFixed(1)}%</td>
                          <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">
                            {row.theoreticalQty != null ? row.theoreticalQty.toFixed(4) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-indigo-600 font-bold tabular-nums">{row.actualWeight.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                reportForm.weight > 0 && (
                  <p className="text-[10px] text-amber-600 font-bold">
                    未找到适用 BOM 或 BOM 无可分摊子项，提交后将仅保存重量，暂不拆分物料消耗。
                  </p>
                )
              )}
            </div>
          )}
          <ReportCustomFieldsEditor
            fields={effectiveReportTemplate}
            values={reportForm.customData}
            onChange={handleReportFieldChange}
            namePrefix="stp-report"
          />
          </div>
        </form>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-white">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
          <button type="button" onClick={submitReport} disabled={!canSubmitMatrix || !reportForm.workerId || (needEquipment && !reportForm.equipmentId) || (!isMatrixMode && ((reportModal.productItems ?? reportModal.order.items).length > 1) && !reportForm.variantId)} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"><Check className="w-4 h-4" /> 确认提交</button>
        </div>
      </div>
      {displayImagePreview && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-slate-900/80 backdrop-blur-sm"
          onClick={closeDisplayImagePreview}
          role="presentation"
        >
          <button
            type="button"
            onClick={closeDisplayImagePreview}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
            aria-label="关闭预览"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="relative z-[1] w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
          >
            <img
              src={displayImagePreview}
              alt="预览"
              className="max-h-[85vh] w-full object-contain bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ReportModal);
