import React, { useState, useMemo, useCallback, useRef } from 'react';
import { FileText, X, UserPlus, Layers, Package } from 'lucide-react';
import { toast } from 'sonner';
import { ScanBatchTrigger } from '../../components/scan/ScanBatchTrigger';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import { rewriteScanApiErrorForIme, type ScanPayload } from '../../utils/scanPayload';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import { scanItemResultToRowDetail, scanVirtualBatchResultToRowDetail } from '../../utils/scanBatchRowDetail';
import { buildOutOfSequenceTemplateIds, isProcessSequential } from '../../shared/processSequence';
import {
  buildReworkReportPaths,
  groupReworkPathsByProduct,
  findReworkPathForScan,
  collectReworkOrderIdsForProduct,
  reworkQtyKey,
  sumReworkEnteredForPath,
  hasAnyReworkEnteredQty,
  sumTotalReworkEnteredQty,
  type ReworkReportPathRow,
} from '../../utils/reworkReportGroup';
import {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductCategory,
  Worker,
  ProcessSequenceMode,
  Partner,
  PlanFormFieldConfig,
} from '../../types';
import { SCAN_ITEM_CODE_IDS_KEY } from '../../types';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { checkExceedMax } from '../../utils/scanApplyGuards';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import {
  sectionTitleClass,
  psiOrderBillFormCardClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormDetailSplitClass,
  psiOrderBillFormGridGapClass,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillCompactLineLabelClass,
  psiOrderBillCompactLineInputClass,
  psiOrderBillCompactLineReadonlyClass,
  psiOrderBillCompactSummaryBarClass,
  psiOrderBillCompactSummaryLabelClass,
  psiOrderBillCompactSummaryValueClass,
  psiOrderBillCompactSummaryUnitClass,
  psiOrderBillCompactWarehouseSelectClass,
} from '../../styles/uiDensity';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import { nextOutsourceDocNumberResolved } from './sharedFlowListHelpers';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { REWORK_REPORT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { useTraceabilityPlugin } from '../../hooks/useTraceabilityPlugin';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';

function reworkReportCollabFromValues(values: Record<string, unknown>): { collabData?: Record<string, unknown> } {
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v != null && v !== undefined));
  if (!Object.keys(clean).length) return {};
  return { collabData: { [REWORK_REPORT_CUSTOM_DATA_KEY]: clean } };
}

/** 返工报工扫码解析结果（按 token 缓存，确认时复用以避免重复网络请求） */
type PreparedReworkScan = {
  productId: string;
  vid: string;
  add: number;
  ownerTenantName?: string | null;
  relation?: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER';
  variantLabel?: string | null;
  productName?: string | null;
  detail: ScanBatchRowDetail;
  /** 单品码扫入时为该单品码 id；批次码扫入为 null */
  itemCodeId: string | null;
  /** 所属虚拟批次 id（单品码取父批次，批次码取自身） */
  batchId: string | null;
};

export interface ReworkReportSubmitModalProps {
  reworkReportModal: { order: ProductionOrder; nodeId: string; nodeName: string; outsourcePartner?: string };
  productionLinkMode: 'order' | 'product';
  records: ProductionOpRecord[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  categories: ProductCategory[];
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  processSequenceMode: ProcessSequenceMode;
  partners: Partner[];
  reworkReportCustomFields?: PlanFormFieldConfig[];
  onAddRecord: (record: ProductionOpRecord) => void;
  onUpdateRecord: (record: ProductionOpRecord) => void;
  getNextReworkReportDocNo: () => string;
  onClose: () => void;
}

const ReworkReportSubmitModal: React.FC<ReworkReportSubmitModalProps> = ({
  reworkReportModal,
  productionLinkMode,
  records,
  products,
  globalNodes,
  dictionaries,
  categories,
  workers,
  equipment,
  processSequenceMode,
  partners,
  reworkReportCustomFields = [],
  onAddRecord,
  onUpdateRecord,
  getNextReworkReportDocNo,
  onClose,
}) => {
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const { scanEnabled } = useTraceabilityPlugin();
  const { currentUser } = useAuth();
  const docOperatorFallback = currentOperatorDisplayName(currentUser);
  const [reworkReportQuantities, setReworkReportQuantities] = useState<Record<string, number>>({});
  const [reworkReportWorkerId, setReworkReportWorkerId] = useState('');
  const [reworkReportEquipmentId, setReworkReportEquipmentId] = useState('');
  const [reworkReportUnitPrice, setReworkReportUnitPrice] = useState<number>(0);
  const [reworkReportCustomData, setReworkReportCustomData] = useState<Record<string, unknown>>({});

  const reworkReportCreateFields = useMemo(
    () => reworkReportCustomFields.filter(f => f.showInCreate),
    [reworkReportCustomFields],
  );
  const reworkReportCustomBlock =
    reworkReportCreateFields.length > 0 ? (
      <>
        {reworkReportCreateFields.map(cf => {
          const eff = effectivePlanFormFieldType(cf);
          return (
            <div
              key={cf.id}
              className={
                eff === 'text' || eff === 'file' ? 'min-w-0 space-y-1.5 md:col-span-2' : 'min-w-0 space-y-1.5'
              }
            >
              <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                {cf.label}
              </label>
              <PlanFormCustomFieldInput
                cf={cf}
                value={reworkReportCustomData[cf.id]}
                onChange={v =>
                  setReworkReportCustomData(prev => ({
                    ...prev,
                    [cf.id]: v,
                  }))
                }
                dictionaries={dictionaries}
                controlClassName={
                  eff === 'select' ? psiOrderBillCompactWarehouseSelectClass : psiOrderBillCompactLineInputClass
                }
              />
            </div>
          );
        })}
      </>
    ) : null;

  const { order, nodeId: currentNodeId, outsourcePartner } = reworkReportModal;
  const isOutsourceRework = !!outsourcePartner;
  const outOfSequenceTemplateIds = useMemo(() => buildOutOfSequenceTemplateIds(globalNodes), [globalNodes]);

  const reworkReportPaths = useMemo(
    () =>
      buildReworkReportPaths({
        records,
        currentNodeId,
        isOutsourceRework,
        outsourcePartner,
        processSequenceMode,
        globalNodes,
        anchorProductId: order.productId,
        scopeProductId: order.productId,
        scopeOrderId: productionLinkMode === 'order' ? order.id : undefined,
      }),
    [
      records,
      currentNodeId,
      isOutsourceRework,
      outsourcePartner,
      processSequenceMode,
      globalNodes,
      order.productId,
      order.id,
      productionLinkMode,
    ],
  );

  const reworkProductGroups = useMemo(
    () => groupReworkPathsByProduct(reworkReportPaths),
    [reworkReportPaths],
  );

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const productHasColorSize = useCallback(
    (productId: string) => {
      const product = productMap.get(productId);
      const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
      return productHasColorSizeMatrix(product, category);
    },
    [productMap, categoryMap],
  );

  const getProductVariantIds = useCallback(
    (productId: string) => productMap.get(productId)?.variants?.map(v => v.id) ?? [],
    [productMap],
  );

  const anchorProduct = useMemo(() => productMap.get(order.productId) ?? null, [productMap, order.productId]);
  const reworkReportDisplayName = anchorProduct?.name ?? order.productName ?? '—';

  /** 仅单产品、单路径、无矩阵时，数量与扫码/单价/金额同一行展示 */
  const reworkSingleSimpleQuantityPath = useMemo((): ReworkReportPathRow | null => {
    if (reworkProductGroups.length !== 1 || reworkProductGroups[0]!.paths.length !== 1) return null;
    const productId = reworkProductGroups[0]!.productId;
    if (productHasColorSize(productId) && (productMap.get(productId)?.variants?.length ?? 0) > 0) return null;
    return reworkProductGroups[0]!.paths[0] ?? null;
  }, [reworkProductGroups, productHasColorSize, productMap]);

  const reworkTotalEnteredQty = useMemo(
    () =>
      sumTotalReworkEnteredQty(reworkReportPaths, reworkReportQuantities, productHasColorSize, getProductVariantIds),
    [reworkReportPaths, reworkReportQuantities, productHasColorSize, getProductVariantIds],
  );

  const reworkMatrixInputClass =
    'h-9 w-[3.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-left text-xs font-bold text-indigo-600 tabular-nums outline-none focus:ring-2 focus:ring-indigo-200';

  /**
   * 扫码解析缓存：扫码（预览）阶段写入「scan + validate-usage」结果，
   * 点「确认应用」时命中缓存 → 0 网络请求，避免逐条重新解析触发频控/投毒。
   * 去重依赖扫码弹窗自身的 keysRef + 此缓存幂等（弹窗每次打开随组件挂载重置）。
   */
  const preparedByTokenRef = useRef<Map<string, PreparedReworkScan>>(new Map());
  /**
   * 扫码追溯关联：按 productId__variantId 分桶。
   */
  const reworkScanItemCodesByKeyRef = useRef<Map<string, string[]>>(new Map());
  const reworkScanVirtualBatchByProductRef = useRef<Map<string, string>>(new Map());
  const reworkHadBatchScanByProductRef = useRef<Set<string>>(new Set());

  const scanTraceKey = (productId: string, variantId: string) => `${productId}__${variantId || ''}`;

  const applyScanQuantity = useCallback(
    (params: {
      productId: string;
      productName?: string | null;
      vid: string;
      add: number;
      ownerTenantName?: string | null;
      relation?: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER';
      variantLabel?: string | null;
    }): boolean => {
      const { productId, productName, vid, add, ownerTenantName, relation, variantLabel } = params;
      if (add <= 0 || reworkReportPaths.length === 0) {
        toast.error('暂无待返工路径可累加');
        return false;
      }
      const hasMatrix = productHasColorSize(productId);
      const target = findReworkPathForScan(reworkReportPaths, productId, vid);
      if (!target) {
        toast.error(
          hasMatrix && !vid
            ? '当前产品按规格管理，单品/批次码未带规格'
            : `没有匹配${productName ? `「${productName}」` : '此产品'}的待返工路径`,
        );
        return false;
      }
      if (hasMatrix && !vid) {
        toast.error('当前产品按规格管理，单品/批次码未带规格');
        return false;
      }
      if (hasMatrix) {
        const key = reworkQtyKey(productId, target.pathKey, vid);
        const cap = target.pendingByVariant[vid] ?? 0;
        const cur = reworkReportQuantities[key] ?? 0;
        const ck = checkExceedMax(cur, add, cap);
        if (ck.exceeds) {
          toast.error(ck.message ?? '本次扫入数量超过该规格待返工上限');
          return false;
        }
        setReworkReportQuantities(prev => ({ ...prev, [key]: (prev[key] ?? 0) + add }));
        toast.success(
          `扫码 +${add}${variantLabel ? `（${variantLabel}）` : ''} → ${productName ?? productId} · ${target.pathLabel}${
            ownerTenantName && relation !== 'OWNER' ? ` · 来自 ${ownerTenantName}` : ''
          }`,
        );
      } else {
        const key = reworkQtyKey(productId, target.pathKey);
        const cur = reworkReportQuantities[key] ?? 0;
        const ck = checkExceedMax(cur, add, target.totalPending);
        if (ck.exceeds) {
          toast.error(ck.message ?? '本次扫入数量超过该路径待返工上限');
          return false;
        }
        setReworkReportQuantities(prev => ({ ...prev, [key]: (prev[key] ?? 0) + add }));
        toast.success(
          `扫码 +${add} → ${productName ?? productId} · ${target.pathLabel}${
            ownerTenantName && relation !== 'OWNER' ? ` · 来自 ${ownerTenantName}` : ''
          }`,
        );
      }
      return true;
    },
    [reworkReportPaths, productHasColorSize, reworkReportQuantities],
  );

  /**
   * 返工报工持久化去重：scope 用该产品相关 orderIds + 目标 nodeId。
   */
  const validateReworkScan = useCallback(
    async (params: {
      productId: string;
      itemCodeId: string | null;
      virtualBatchId: string | null;
    }): Promise<boolean> => {
      const { productId, itemCodeId, virtualBatchId } = params;
      if (!itemCodeId && !virtualBatchId) return true;
      const orderIds = collectReworkOrderIdsForProduct(reworkReportPaths, productId, order.id);
      try {
        const res = await itemCodesApi.validateUsage({
          purpose: 'REWORK_REPORT',
          scope: {
            orderIds,
            nodeId: reworkReportModal.nodeId,
          },
          itemCodeId,
          virtualBatchId,
        });
        if (res.code === 'DUPLICATE_SAVED') {
          toast.error(res.message || '该码已在本返工流程报工，不可重复扫码');
          return false;
        }
        return true;
      } catch {
        return true;
      }
    },
    [order.id, reworkReportModal.nodeId, reworkReportPaths],
  );

  /**
   * 扫码解析（含产品一致性 + 持久化去重校验），按 token 缓存。
   * - 扫码（预览）阶段与「确认应用」阶段共用：预览先解析并缓存，确认时命中缓存 → 0 网络请求。
   * - 待返工路径/规格匹配等本地校验放在预览与 applyScanQuantity 中，不计入缓存。
   */
  const prepareReworkScan = useCallback(
    async (payload: ScanPayload): Promise<PreparedReworkScan | null> => {
      if (!payload.token) return null;
      const cached = preparedByTokenRef.current.get(payload.token);
      if (cached) return cached;
      try {
        if (payload.kind === 'ITEM') {
          const res = await itemCodesApi.scan(payload.token);
          if (res.kind !== 'ITEM_CODE') return null;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return null;
          }
          const productId = res.productId ?? '';
          if (!productId) {
            toast.error('扫码未解析到产品');
            return null;
          }
          const vid = res.variantId || '';
          const target = findReworkPathForScan(reworkReportPaths, productId, vid);
          if (!target) {
            toast.error(`「${res.productName ?? productId}」在本工序暂无待返工数量`);
            return null;
          }
          if (productHasColorSize(productId) && !vid) {
            toast.error('当前产品按规格管理，单品码未带规格');
            return null;
          }
          if (
            !(await validateReworkScan({
              productId,
              itemCodeId: res.itemCodeId ?? null,
              virtualBatchId: res.batchId ?? null,
            }))
          )
            return null;
          const prepared: PreparedReworkScan = {
            productId,
            vid,
            add: 1,
            ownerTenantName: res.ownerTenantName,
            relation: res.callerContext?.relation,
            variantLabel: res.variantLabel,
            productName: res.productName,
            detail: scanItemResultToRowDetail(res),
            itemCodeId: res.itemCodeId ?? null,
            batchId: res.batchId ?? null,
          };
          preparedByTokenRef.current.set(payload.token, prepared);
          return prepared;
        }
        if (payload.kind === 'BATCH') {
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.kind !== 'VIRTUAL_BATCH') return null;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return null;
          }
          const productId = res.productId ?? '';
          if (!productId) {
            toast.error('扫码未解析到产品');
            return null;
          }
          const add = res.quantity ?? 0;
          if (add <= 0) {
            toast.error('暂无待返工路径可累加');
            return null;
          }
          const vid = res.variantId || '';
          const target = findReworkPathForScan(reworkReportPaths, productId, vid);
          if (!target) {
            toast.error(`「${res.productName ?? productId}」在本工序暂无待返工数量`);
            return null;
          }
          if (productHasColorSize(productId) && !vid) {
            toast.error('当前产品按规格管理，批次码未带规格');
            return null;
          }
          if (
            !(await validateReworkScan({
              productId,
              itemCodeId: null,
              virtualBatchId: res.batchId ?? null,
            }))
          )
            return null;
          const prepared: PreparedReworkScan = {
            productId,
            vid,
            add,
            ownerTenantName: res.ownerTenantName,
            relation: res.callerContext?.relation,
            variantLabel: res.variantLabel,
            productName: res.productName,
            detail: scanVirtualBatchResultToRowDetail(res),
            itemCodeId: null,
            batchId: res.batchId ?? null,
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
    [reworkReportPaths, productHasColorSize, validateReworkScan],
  );

  const applyReworkScanPayload = useCallback(
    async (payload: ScanPayload): Promise<boolean> => {
      const prepared = await prepareReworkScan(payload);
      if (!prepared) return false;
      const traceKey = scanTraceKey(prepared.productId, prepared.vid);
      if (prepared.itemCodeId) {
        const arr = reworkScanItemCodesByKeyRef.current.get(traceKey) ?? [];
        if (!arr.includes(prepared.itemCodeId)) arr.push(prepared.itemCodeId);
        reworkScanItemCodesByKeyRef.current.set(traceKey, arr);
      } else if (prepared.batchId) {
        reworkHadBatchScanByProductRef.current.add(prepared.productId);
        if (!reworkScanVirtualBatchByProductRef.current.has(prepared.productId)) {
          reworkScanVirtualBatchByProductRef.current.set(prepared.productId, prepared.batchId);
        }
      }
      return applyScanQuantity({
        productId: prepared.productId,
        productName: prepared.productName,
        vid: prepared.vid,
        add: prepared.add,
        ownerTenantName: prepared.ownerTenantName,
        relation: prepared.relation,
        variantLabel: prepared.variantLabel,
      });
    },
    [prepareReworkScan, applyScanQuantity],
  );

  const resolveReworkScanRowPreview = useCallback(
    async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      const prepared = await prepareReworkScan(payload);
      return prepared?.detail ?? null;
    },
    [prepareReworkScan],
  );

  const handleReworkScanBatchConfirm = useCallback(
    async (payloads: ScanPayload[]) => {
      for (const p of payloads) {
        if (!(await applyReworkScanPayload(p))) return false;
      }
      return true;
    },
    [applyReworkScanPayload],
  );

  const handleSubmit = async () => {
    if (!isOutsourceRework) {
      if (!reworkReportWorkerId?.trim()) {
        toast.warning('请先选择生产人员');
        return;
      }
      const needEquip =
        equipmentFeaturesOn &&
        globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport;
      if (needEquip && !reworkReportEquipmentId?.trim()) {
        toast.warning('请先选择设备');
        return;
      }
    }
    const pathsSnapshot = reworkReportPaths;
    const hasAnyQty = hasAnyReworkEnteredQty(
      pathsSnapshot,
      reworkReportQuantities,
      productHasColorSize,
      getProductVariantIds,
    );
    if (!hasAnyQty) {
      toast.warning('请先在各返工路径下填写报工数量');
      return;
    }
    let batchDocNo = '';
    let reportSeq = 0;
    let appliedReportQty = 0;
    const appliedReportQtyByProduct = new Map<string, number>();
    const appliedReworkSourceIds = new Set<string>();
    const resolveOpName = (fallback?: string) => workers?.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? fallback ?? docOperatorFallback;
    const collabExtra = reworkReportCollabFromValues(reworkReportCustomData);
    const assignedScanTraceKeys = new Set<string>();
    const scanTraceFor = (
      productId: string,
      variantId: string | undefined,
    ): { virtualBatchId?: string; customData?: Record<string, unknown> } => {
      if (reworkHadBatchScanByProductRef.current.has(productId)) {
        const batchId = reworkScanVirtualBatchByProductRef.current.get(productId);
        return batchId ? { virtualBatchId: batchId } : {};
      }
      const traceKey = scanTraceKey(productId, variantId || '');
      if (assignedScanTraceKeys.has(traceKey)) return {};
      const list = reworkScanItemCodesByKeyRef.current.get(traceKey) ?? [];
      if (list.length === 0) return {};
      assignedScanTraceKeys.add(traceKey);
      return { customData: { [SCAN_ITEM_CODE_IDS_KEY]: list } };
    };
    const pendingReworkReports: Array<{
      qty: number;
      variantId: string | undefined;
      src: ProductionOpRecord;
    }> = [];
    const pushReworkReport = (qty: number, variantId: string | undefined, src: ProductionOpRecord) => {
      if (qty <= 0) return;
      if (!batchDocNo) batchDocNo = getNextReworkReportDocNo();
      appliedReportQty += qty;
      const pid = src.productId ?? order.productId;
      appliedReportQtyByProduct.set(pid, (appliedReportQtyByProduct.get(pid) ?? 0) + qty);
      if (src.id) appliedReworkSourceIds.add(String(src.id));
      pendingReworkReports.push({ qty, variantId, src });
    };
    try {
      for (const { productId, pathKey, records: pathRecords, pendingByVariant } of pathsSnapshot) {
        const product = productMap.get(productId);
        const hasMatrix = productHasColorSize(productId);
        const variantIds = getProductVariantIds(productId);
        if (hasMatrix && variantIds.length > 0) {
          const pendingUndiff = pendingByVariant[''] ?? 0;
          const onlyUndiffPending =
            pendingUndiff > 0 &&
            Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);

          if (onlyUndiffPending) {
            const userTotal = variantIds.reduce(
              (s, vid) => s + (reworkReportQuantities[reworkQtyKey(productId, pathKey, vid)] ?? 0),
              0,
            );
            const totalToApply = Math.min(userTotal, pendingUndiff);
            if (totalToApply <= 0) continue;
            let remaining = totalToApply;
            const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
            for (const r of sortedRecs) {
              if (remaining <= 0) break;
              const room = r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0);
              const add = Math.min(room, remaining);
              if (add <= 0) continue;
              remaining -= add;
              const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + add;
              const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
              const allDone = nodes.every(
                n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? add : 0) >= r.quantity
              );
              const opName = resolveOpName(r.operator);
              const ts = new Date().toLocaleString();
              onUpdateRecord({
                ...r,
                reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
                ...(allDone ? { status: '已完成' as const } : {}),
                ...(isOutsourceRework
                  ? { timestamp: ts }
                  : {
                      workerId: reworkReportWorkerId || undefined,
                      equipmentId: reworkReportEquipmentId || undefined,
                      operator: opName,
                      timestamp: ts,
                    }),
              });
              pushReworkReport(add, undefined, r);
            }
            continue;
          }

          const byVariant: Record<string, number> = {};
          if ((pendingByVariant[''] ?? 0) > 0) {
            byVariant[''] = Math.min(
              reworkReportQuantities[reworkQtyKey(productId, pathKey, '')] ?? 0,
              pendingByVariant[''] ?? 0,
            );
          }
          variantIds.forEach(vid => {
            byVariant[vid] = Math.min(
              reworkReportQuantities[reworkQtyKey(productId, pathKey, vid)] ?? 0,
              pendingByVariant[vid] ?? 0,
            );
          });
          const totalToApply = Object.values(byVariant).reduce((s, q) => s + q, 0);
          if (totalToApply <= 0) continue;
          let remainingByVariant = { ...byVariant };
          const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          for (const r of sortedRecs) {
            const vid = r.variantId ?? '';
            const need = Math.min(
              r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0),
              remainingByVariant[vid] ?? 0,
            );
            if (need <= 0) continue;
            remainingByVariant[vid] = (remainingByVariant[vid] ?? 0) - need;
            const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + need;
            const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
            const allDone = nodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? need : 0) >= r.quantity);
            const opName = resolveOpName(r.operator);
            const ts = new Date().toLocaleString();
            onUpdateRecord({
              ...r,
              reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
              ...(allDone ? { status: '已完成' as const } : {}),
              ...(isOutsourceRework
                ? { timestamp: ts }
                : {
                    workerId: reworkReportWorkerId || undefined,
                    equipmentId: reworkReportEquipmentId || undefined,
                    operator: opName,
                    timestamp: ts,
                  }),
            });
            pushReworkReport(need, vid || undefined, r);
          }
        } else {
          const totalToApply = Math.min(
            reworkReportQuantities[reworkQtyKey(productId, pathKey)] ?? 0,
            pathRecords.reduce((s, r) => s + (r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0)), 0),
          );
          if (totalToApply <= 0) continue;
          let remaining = totalToApply;
          const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          for (const r of sortedRecs) {
            if (remaining <= 0) break;
            const room = r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0);
            const add = Math.min(room, remaining);
            if (add <= 0) continue;
            remaining -= add;
            const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + add;
            const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
            const allDone = nodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? add : 0) >= r.quantity);
            const opName = resolveOpName(r.operator);
            const ts = new Date().toLocaleString();
            onUpdateRecord({
              ...r,
              reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
              ...(allDone ? { status: '已完成' as const } : {}),
              ...(isOutsourceRework
                ? { timestamp: ts }
                : {
                    workerId: reworkReportWorkerId || undefined,
                    equipmentId: reworkReportEquipmentId || undefined,
                    operator: opName,
                    timestamp: ts,
                  }),
            });
            pushReworkReport(add, r.variantId, r);
          }
        }
        void product;
      }
    } catch (e) {
      console.error(e);
      toast.error(`提交失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    for (let i = 0; i < pendingReworkReports.length; i++) {
      const { qty, variantId, src } = pendingReworkReports[i]!;
      const srcProductId = src.productId ?? order.productId;
      const ts = new Date().toLocaleString();
      const opName = isOutsourceRework ? '' : resolveOpName();
      const sid = src.id != null ? String(src.id) : 'x';
      onAddRecord({
        id: `rec-rework-report-${Date.now()}-${reportSeq++}-${sid.slice(-8)}`,
        type: 'REWORK_REPORT' as const,
        orderId: src.orderId ?? order.id,
        productId: srcProductId,
        operator: opName,
        timestamp: ts,
        nodeId: currentNodeId,
        sourceNodeId: src.sourceNodeId,
        sourceReworkId: src.id,
        workerId: isOutsourceRework ? undefined : (reworkReportWorkerId || undefined),
        equipmentId: isOutsourceRework ? undefined : (reworkReportEquipmentId || undefined),
        quantity: qty,
        variantId: variantId || undefined,
        docNo: batchDocNo,
        unitPrice: reworkReportUnitPrice > 0 ? reworkReportUnitPrice : undefined,
        amount: reworkReportUnitPrice > 0 ? qty * reworkReportUnitPrice : undefined,
        ...(isOutsourceRework && outsourcePartner ? { partner: outsourcePartner } : {}),
        ...collabExtra,
        ...scanTraceFor(srcProductId, variantId),
      });
    }
    if (appliedReportQty <= 0) {
      toast.error(isOutsourceRework ? '未能写入委外返工收回：请确认所填数量与各规格「待收回」一致，或尝试刷新页面后重试。' : '未能写入返工报工：请确认所填数量与各规格「待返工」一致，或尝试刷新页面后重试。');
      return;
    }
    if (isOutsourceRework && appliedReportQty > 0) {
      const ts = new Date().toLocaleString();
      for (const [productId, productQty] of appliedReportQtyByProduct.entries()) {
        if (productQty <= 0) continue;
        let receiveDocNo: string;
        try {
          receiveDocNo = await nextOutsourceDocNumberResolved(
            'receive',
            partners,
            records,
            '',
            (outsourcePartner || '').trim(),
          );
        } catch (e) {
          toast.error(`生成外协收回单号失败：${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        const productSourceIds = pendingReworkReports
          .filter(r => (r.src.productId ?? order.productId) === productId)
          .map(r => String(r.src.id))
          .filter(Boolean);
        const firstDispatch = records.find(r =>
          r.type === 'OUTSOURCE' && r.sourceReworkId &&
          productSourceIds.includes(String(r.sourceReworkId)) &&
          (r.partner ?? '') === outsourcePartner
        );
        const receiveScanTrace: { virtualBatchId?: string; customData?: Record<string, unknown> } =
          reworkHadBatchScanByProductRef.current.has(productId)
            ? (() => {
                const batchId = reworkScanVirtualBatchByProductRef.current.get(productId);
                return batchId ? { virtualBatchId: batchId } : {};
              })()
            : (() => {
                const all = [
                  ...new Set(
                    [...reworkScanItemCodesByKeyRef.current.entries()]
                      .filter(([k]) => k.startsWith(`${productId}__`))
                      .flatMap(([, v]) => v),
                  ),
                ];
                return all.length ? { customData: { [SCAN_ITEM_CODE_IDS_KEY]: all } } : {};
              })();
        onAddRecord({
          id: `wx-recv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          orderId: productionLinkMode === 'product' ? undefined : order.id,
          productId,
          quantity: productQty,
          operator: resolveOpName(),
          timestamp: ts,
          status: '已收回',
          partner: outsourcePartner,
          nodeId: currentNodeId,
          docNo: receiveDocNo,
          sourceReworkId: firstDispatch?.sourceReworkId,
          ...receiveScanTrace,
        });
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-0 bg-slate-900/60"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative z-10 bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> {reworkReportModal.nodeName} · {isOutsourceRework ? '委外返工收回' : '返工报工'}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {reworkReportPaths.length === 0 ? (
            <div className={`${psiOrderBillFormCardClass} space-y-4`}>
              <div className={psiOrderBillFormSectionStackClass}>
                <div className="flex flex-wrap items-baseline gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={`${psiOrderBillFormSectionIconIndigoClass} shrink-0 self-start`}><FileText className="w-4 h-4" /></div>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className={sectionTitleClass}>1. 返工报工基本信息</h3>
                    <span className="text-sm font-bold normal-case tracking-normal text-slate-600">工序：{reworkReportModal.nodeName}</span>
                  </div>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass} pt-2`}>
                  {!isOutsourceRework && (
                    <div className="min-w-0 space-y-1.5 md:col-span-2">
                      <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        生产人员 <span className="text-rose-500">*</span>
                      </label>
                      <WorkerSelector
                        options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                        processNodes={globalNodes}
                        currentNodeId={reworkReportModal.nodeId}
                        value={reworkReportWorkerId}
                        onChange={(id: string) => setReworkReportWorkerId(id)}
                        placeholder="选择报工人员..."
                        variant="form"
                        icon={UserPlus}
                      />
                    </div>
                  )}
                  {reworkReportCustomBlock}
                  {!isOutsourceRework &&
                    equipmentFeaturesOn &&
                    globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport && (
                    <div className="min-w-0 space-y-1.5 md:col-span-2">
                      <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        设备 <span className="text-rose-500">*</span>
                      </label>
                      <EquipmentSelector
                        options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                        processNodes={globalNodes}
                        currentNodeId={reworkReportModal.nodeId}
                        value={reworkReportEquipmentId}
                        onChange={(id: string) => setReworkReportEquipmentId(id)}
                        placeholder="选择设备..."
                        variant="form"
                      />
                    </div>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-600">
                {productionLinkMode === 'product' ? (
                  <>
                    <span className="font-bold text-slate-800">{reworkReportDisplayName}</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-800">{order.orderNumber}</span>
                    <span className="mx-2">·</span>
                    <span>{reworkReportDisplayName}</span>
                  </>
                )}
                {isOutsourceRework && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                    外协工厂: {outsourcePartner}
                  </span>
                )}
              </p>
              <p className="text-slate-500">
                {isProcessSequential(processSequenceMode, currentNodeId, outOfSequenceTemplateIds)
                  ? '该工序暂无待返工数量（顺序模式：请先完成上一道返工工序的报工）'
                  : '该工序暂无待返工数量'}
              </p>
            </div>
          ) : (
            <div className={psiOrderBillFormCardClass}>
              <div className={psiOrderBillFormSectionStackClass}>
                <div className="flex flex-wrap items-baseline gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={`${psiOrderBillFormSectionIconIndigoClass} shrink-0 self-start`}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className={sectionTitleClass}>1. 返工报工基本信息</h3>
                    <span className="text-sm font-bold normal-case tracking-normal text-slate-600">工序：{reworkReportModal.nodeName}</span>
                  </div>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                  {isOutsourceRework ? (
                    <div className="space-y-1.5 min-w-0 md:col-span-2">
                      <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">外协工厂</label>
                      <div className="flex h-9 min-h-9 w-full min-w-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-800">
                        {(outsourcePartner ?? '').trim() || '—'}
                      </div>
                    </div>
                  ) : null}
                  {!isOutsourceRework && (
                    <div className="space-y-1.5 min-w-0 md:col-span-2">
                      <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        生产人员 <span className="text-rose-500">*</span>
                      </label>
                      <WorkerSelector
                        options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                        processNodes={globalNodes}
                        currentNodeId={reworkReportModal.nodeId}
                        value={reworkReportWorkerId}
                        onChange={(id: string) => setReworkReportWorkerId(id)}
                        placeholder="选择报工人员..."
                        variant="form"
                        icon={UserPlus}
                      />
                    </div>
                  )}
                  {reworkReportCustomBlock}
                  {!isOutsourceRework &&
                    equipmentFeaturesOn &&
                    globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport && (
                      <div className="space-y-1.5 min-w-0 md:col-span-2">
                        <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                          设备 <span className="text-rose-500">*</span>
                        </label>
                        <EquipmentSelector
                          options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                          processNodes={globalNodes}
                          currentNodeId={reworkReportModal.nodeId}
                          value={reworkReportEquipmentId}
                          onChange={(id: string) => setReworkReportEquipmentId(id)}
                          placeholder="选择设备..."
                          variant="form"
                        />
                      </div>
                    )}
                </div>
              </div>

              <div className={psiOrderBillFormDetailSplitClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={psiOrderBillFormSectionIconEmeraldClass}>
                      <Layers className="h-4 w-4" />
                    </div>
                    <h3 className={sectionTitleClass}>2. 返工报工明细录入</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {scanEnabled ? (
                    <>
                    <span className="text-[10px] font-bold uppercase text-slate-400">扫码录入</span>
                    <ScanBatchTrigger
                      onApply={handleReworkScanBatchConfirm}
                      resolveRowPreview={resolveReworkScanRowPreview}
                      hint="扫码录入"
                      modalTitle="返工报工 · 批量扫码"
                      modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加返工报工数量。"
                      showScanIntentToggle
                    />
                    </>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  {reworkProductGroups.map(({ productId, paths }) => {
                    const product = productMap.get(productId);
                    const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
                    const hasMatrix = productHasColorSize(productId);
                    const variantIds = getProductVariantIds(productId);
                    const unitName =
                      (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
                    const summaryTags = product
                      ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false })
                      : [];
                    const productEnteredQty = paths.reduce(
                      (s, p) => s + sumReworkEnteredForPath(reworkReportQuantities, productId, p, variantIds, hasMatrix),
                      0,
                    );
                    const simplePath =
                      reworkSingleSimpleQuantityPath?.productId === productId ? reworkSingleSimpleQuantityPath : null;
                    return (
                      <div
                        key={productId}
                        className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80"
                      >
                        <div className="flex flex-wrap items-start gap-2 sm:gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <label className={psiOrderBillCompactLineLabelClass}>报工明细</label>
                            <div className="flex min-w-0 items-start gap-2">
                              {product?.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt=""
                                  className="h-9 w-9 shrink-0 rounded-lg border border-slate-100 object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                  <Package className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-bold text-slate-700">{product?.name ?? productId}</span>
                                  {product?.sku?.trim() ? (
                                    <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{product.sku.trim()}</span>
                                  ) : null}
                                </div>
                                {summaryTags.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    {summaryTags.map(({ field, display }) => (
                                      <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                        {field.label}: {display}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-start gap-2 sm:gap-3">
                            {simplePath ? (
                              <div className="min-w-[10rem] max-w-[18rem] flex-1 space-y-0.5 sm:min-w-[11rem]">
                                <label className={`${psiOrderBillCompactLineLabelClass} !ml-0`}>数量</label>
                                <div className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="number"
                                    min={0}
                                    max={simplePath.totalPending}
                                    value={
                                      (reworkReportQuantities[reworkQtyKey(productId, simplePath.pathKey)] ?? 0) === 0
                                        ? ''
                                        : reworkReportQuantities[reworkQtyKey(productId, simplePath.pathKey)]
                                    }
                                    onChange={e =>
                                      setReworkReportQuantities(prev => ({
                                        ...prev,
                                        [reworkQtyKey(productId, simplePath.pathKey)]: Math.min(
                                          simplePath.totalPending,
                                          Math.max(0, Number(e.target.value) || 0),
                                        ),
                                      }))
                                    }
                                    placeholder="0"
                                    title={`最多 ${simplePath.totalPending}`}
                                    className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1`}
                                  />
                                  <span className="shrink-0 text-[9px] font-bold tabular-nums text-slate-400">
                                    最多{simplePath.totalPending}
                                  </span>
                                  <span className="w-8 shrink-0 text-right text-[9px] font-bold text-slate-400">{unitName}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                                <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                                <div className={psiOrderBillCompactLineReadonlyClass}>
                                  {productEnteredQty.toLocaleString()} {unitName}
                                </div>
                              </div>
                            )}
                            {reworkProductGroups.length === 1 ? (
                              <>
                                <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                                  <label className={psiOrderBillCompactLineLabelClass}>单价 (元)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={reworkReportUnitPrice || ''}
                                    onChange={e => setReworkReportUnitPrice(Number(e.target.value) || 0)}
                                    placeholder="0"
                                    className={psiOrderBillCompactLineInputClass}
                                  />
                                </div>
                                <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                                  <label className={psiOrderBillCompactLineLabelClass}>金额 (元)</label>
                                  <div className={psiOrderBillCompactLineReadonlyClass}>
                                    {(productEnteredQty * (reworkReportUnitPrice || 0)).toFixed(2)}
                                  </div>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {hasMatrix && variantIds.length > 0 ? (
                          <div className="space-y-3 border-t border-slate-100 pt-2">
                            <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                            {paths.map(({ pathKey, pendingByVariant }) => {
                              const pendingUndiff = pendingByVariant[''] ?? 0;
                              const onlyUndiff =
                                pendingUndiff > 0 &&
                                Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);
                              const undiffKey = reworkQtyKey(productId, pathKey, '');
                              const undiffEntered = reworkReportQuantities[undiffKey] ?? 0;
                              if (!dictionaries) {
                                return (
                                  <div key={pathKey} className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/90 p-3">
                                    <p className="text-sm font-bold text-amber-900">缺少颜色尺码字典，请先在基础资料维护后再按规格录入。</p>
                                  </div>
                                );
                              }
                              if (!product?.variants?.length) return null;
                              return (
                                <div key={pathKey} className="space-y-2 rounded-lg border border-slate-100 bg-white/90 p-3">
                                  {paths.length > 1 ? (
                                    <p className="text-[10px] font-bold text-slate-500">返工路径：{paths.find(p => p.pathKey === pathKey)?.pathLabel}</p>
                                  ) : null}
                                  {onlyUndiff ? (
                                    <p className="text-[11px] font-bold leading-snug text-slate-600">
                                      此路径返工未带规格：在各尺码中分配，合计不超过{' '}
                                      <span className="tabular-nums text-indigo-600">{pendingUndiff}</span> 件。
                                    </p>
                                  ) : null}
                                  {!onlyUndiff && pendingUndiff > 0 ? (
                                    <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-2.5 py-2 space-y-1.5">
                                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格待返工（合计）</label>
                                      <div className="flex flex-wrap items-end gap-2">
                                        <input
                                          type="number"
                                          min={0}
                                          max={pendingUndiff}
                                          value={undiffEntered === 0 ? '' : undiffEntered}
                                          onChange={e => {
                                            const raw = Math.max(0, Number(e.target.value) || 0);
                                            setReworkReportQuantities(prev => ({ ...prev, [undiffKey]: Math.min(pendingUndiff, raw) }));
                                          }}
                                          className={`${psiOrderBillCompactLineInputClass} max-w-[8rem] text-indigo-700`}
                                          placeholder="0"
                                        />
                                        <span className="pb-1 text-[10px] font-medium text-slate-500 tabular-nums">最多 {pendingUndiff}</span>
                                      </div>
                                    </div>
                                  ) : null}
                                  <VariantQtyMatrixInputs
                                    product={product}
                                    dictionaries={dictionaries}
                                    quantities={Object.fromEntries(
                                      product.variants.map(v => [v.id, reworkReportQuantities[reworkQtyKey(productId, pathKey, v.id)] ?? 0]),
                                    )}
                                    onVariantQtyChange={(variantId, qty) => {
                                      const raw = Math.max(0, qty);
                                      const qtyKey = reworkQtyKey(productId, pathKey, variantId);
                                      if (!onlyUndiff) {
                                        const maxV = pendingByVariant[variantId] ?? 0;
                                        setReworkReportQuantities(prev => ({ ...prev, [qtyKey]: Math.min(maxV, raw) }));
                                        return;
                                      }
                                      setReworkReportQuantities(prev => {
                                        const sumOthers = product.variants
                                          .filter(x => x.id !== variantId)
                                          .reduce((s, x) => s + (prev[reworkQtyKey(productId, pathKey, x.id)] ?? 0), 0);
                                        const cap = Math.max(0, pendingUndiff - sumOthers);
                                        return { ...prev, [qtyKey]: Math.min(cap, raw) };
                                      });
                                    }}
                                    getCellExtras={v => {
                                      if (!onlyUndiff) {
                                        const maxV = pendingByVariant[v.id] ?? 0;
                                        return {
                                          max: maxV,
                                          disabled: maxV <= 0,
                                          placeholder: maxV <= 0 ? '—' : '0',
                                          hint: maxV > 0 ? `最多${maxV}` : undefined,
                                        };
                                      }
                                      const sumOthers = product.variants
                                        .filter(x => x.id !== v.id)
                                        .reduce((s, x) => s + (reworkReportQuantities[reworkQtyKey(productId, pathKey, x.id)] ?? 0), 0);
                                      const cap = Math.max(0, pendingUndiff - sumOthers);
                                      return { max: cap, hint: `最多${cap}`, placeholder: '0' };
                                    }}
                                    inputClassName={reworkMatrixInputClass}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-2 border-t border-slate-100 pt-2">
                            {paths.map(({ pathKey, pathLabel, totalPending }) => {
                              const qtyKey = reworkQtyKey(productId, pathKey);
                              const totalEntered = reworkReportQuantities[qtyKey] ?? 0;
                              const hideInlineQty = simplePath?.pathKey === pathKey;
                              if (hideInlineQty) return null;
                              return (
                                <div
                                  key={pathKey}
                                  className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white/90 p-3 sm:flex-row sm:items-end sm:justify-end"
                                >
                                  {paths.length > 1 ? (
                                    <p className="text-[10px] font-bold text-slate-500 sm:mr-auto">返工路径：{pathLabel}</p>
                                  ) : null}
                                  <div className="flex min-w-0 w-full max-w-md flex-col gap-1 sm:items-end sm:ml-auto">
                                    <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                                    <div className="flex min-w-0 max-w-[14rem] items-center gap-2">
                                      <input
                                        type="number"
                                        min={0}
                                        max={totalPending}
                                        value={totalEntered === 0 ? '' : totalEntered}
                                        onChange={e =>
                                          setReworkReportQuantities(prev => ({
                                            ...prev,
                                            [qtyKey]: Math.min(totalPending, Math.max(0, Number(e.target.value) || 0)),
                                          }))
                                        }
                                        className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1 text-indigo-600`}
                                        placeholder="0"
                                        title={`最多 ${totalPending}`}
                                      />
                                      <span className="text-[9px] font-bold tabular-nums text-slate-400">最多{totalPending}</span>
                                      <span className="w-7 shrink-0 text-right text-[9px] font-bold text-slate-400">{unitName}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className={`${psiOrderBillCompactSummaryBarClass} flex-wrap justify-between gap-y-2 sm:justify-end`}>
                    <div className="flex items-baseline gap-2">
                      <span className={psiOrderBillCompactSummaryLabelClass}>本次报工合计</span>
                      <span className={psiOrderBillCompactSummaryValueClass}>
                        {reworkTotalEnteredQty.toLocaleString()}
                        <span className={psiOrderBillCompactSummaryUnitClass}>件</span>
                      </span>
                    </div>
                    {reworkProductGroups.length === 1 ? (
                      <div className="flex items-baseline gap-2 border-l border-white/25 pl-0 sm:pl-4">
                        <span className={psiOrderBillCompactSummaryLabelClass}>金额合计</span>
                        <span className={psiOrderBillCompactSummaryValueClass}>
                          ¥{(reworkTotalEnteredQty * (reworkReportUnitPrice || 0)).toFixed(2)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
        {reworkReportPaths.length > 0 && (
          <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex gap-3 bg-white">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  {isOutsourceRework ? '确认收回' : '确认报工'}
                </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ReworkReportSubmitModal);
