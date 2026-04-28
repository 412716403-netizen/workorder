import React, { useState, useMemo, useCallback, useRef } from 'react';
import { FileText, X, UserPlus, Layers, Package } from 'lucide-react';
import { toast } from 'sonner';
import { ScanInputButton } from '../../components/scan/ScanInputButton';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import type { ScanPayload } from '../../utils/scanPayload';
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
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
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
import { nextOutsourceDocNumber } from '../../utils/partnerDocNumber';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { REWORK_REPORT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';

function reworkReportCollabFromValues(values: Record<string, unknown>): { collabData?: Record<string, unknown> } {
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v != null && v !== undefined));
  if (!Object.keys(clean).length) return {};
  return { collabData: { [REWORK_REPORT_CUSTOM_DATA_KEY]: clean } };
}

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

  const reworkRemainingAtNode = (r: ProductionOpRecord, nodeId: string): number => {
    const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
    const idx = pathNodes.indexOf(nodeId);
    if (idx < 0) return 0;
    const doneAtNode = r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) ? r.quantity : 0);
    if (processSequenceMode === 'sequential' && idx > 0) {
      const prevNodeId = pathNodes[idx - 1];
      const doneAtPrev = r.reworkCompletedQuantityByNode?.[prevNodeId] ?? 0;
      return Math.max(0, Math.min(doneAtPrev, r.quantity) - doneAtNode);
    }
    return Math.max(0, r.quantity - doneAtNode);
  };

  const reworkReportPaths = useMemo(() => {
    const reworkList = records.filter(r => {
      if (r.type !== 'REWORK') return false;
      if (productionLinkMode === 'product') {
        if (r.productId !== order.productId) return false;
      } else {
        const orderOk = r.orderId === order.id;
        const productLegacy = !r.orderId && r.productId === order.productId;
        if (!orderOk && !productLegacy) return false;
      }
      const recPartner = (r.partner ?? '').trim();
      if (isOutsourceRework) {
        if (recPartner !== outsourcePartner) return false;
      } else {
        if (recPartner) return false;
      }
      const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      if (!pathNodes.includes(currentNodeId)) return false;
      if (r.status === '已完成') return false;
      const remaining = reworkRemainingAtNode(r, currentNodeId);
      if (remaining <= 0) return false;
      return true;
    });
    const byPath = new Map<string, { records: ProductionOpRecord[]; pendingByVariant: Record<string, number> }>();
    reworkList.forEach(r => {
      const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      const pathKey = pathNodes.join('|');
      const cur = byPath.get(pathKey) ?? { records: [], pendingByVariant: {} };
      cur.records.push(r);
      const remaining = reworkRemainingAtNode(r, currentNodeId);
      const vid = r.variantId ?? '';
      cur.pendingByVariant[vid] = (cur.pendingByVariant[vid] ?? 0) + remaining;
      byPath.set(pathKey, cur);
    });
    return Array.from(byPath.entries()).map(([pathKey, { records: recs, pendingByVariant }]) => {
      const nodeIds = pathKey.split('|').filter(Boolean);
      const pathLabel = nodeIds.length <= 1
        ? (globalNodes.find(n => n.id === nodeIds[0])?.name ?? nodeIds[0])
        : nodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、');
      const totalPending = Object.values(pendingByVariant).reduce((s, q) => s + q, 0);
      return { pathKey, pathLabel, nodeIds, records: recs, totalPending, pendingByVariant };
    }).filter(p => p.totalPending > 0);
  }, [records, order, currentNodeId, globalNodes, processSequenceMode, productionLinkMode, isOutsourceRework, outsourcePartner]);

  const reworkReportProduct = useMemo(() => products.find(p => p.id === order.productId) ?? null, [order, products]);
  const reworkReportCategory = useMemo(() => reworkReportProduct ? categories.find(c => c.id === reworkReportProduct.categoryId) : null, [reworkReportProduct, categories]);
  const reworkReportHasColorSize = productHasColorSizeMatrix(reworkReportProduct ?? undefined, reworkReportCategory ?? undefined);
  const reworkReportMatrixProduct = useMemo(
    () =>
      reworkReportProduct && reworkReportProduct.variants?.length
        ? ({ ...reworkReportProduct, colorIds: undefined, sizeIds: undefined } as Product)
        : null,
    [reworkReportProduct],
  );

  /** 仅一条返工路径且无颜色尺码矩阵时，数量与扫码/单价/金额同一行展示 */
  const reworkSingleSimpleQuantityPath = useMemo(() => {
    if (reworkReportPaths.length !== 1) return null;
    if (reworkReportHasColorSize && (reworkReportProduct?.variants?.length ?? 0) > 0) return null;
    return reworkReportPaths[0] ?? null;
  }, [reworkReportPaths, reworkReportHasColorSize, reworkReportProduct?.variants?.length]);

  const reworkUnitName = useMemo(
    () => (reworkReportProduct?.unitId && dictionaries?.units?.find(u => u.id === reworkReportProduct.unitId)?.name) || '件',
    [reworkReportProduct, dictionaries],
  );
  const reworkSummaryProductTags = useMemo(() => {
    if (!reworkReportProduct) return [] as ReturnType<typeof getProductCategoryCustomFieldEntries>;
    return getProductCategoryCustomFieldEntries(reworkReportProduct, reworkReportCategory, { includeFile: false });
  }, [reworkReportProduct, reworkReportCategory]);

  const reworkTotalEnteredQty = useMemo(() => {
    return reworkReportPaths.reduce((sum, p) => {
      if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
        const pendingUndiff = p.pendingByVariant[''] ?? 0;
        const onlyUndiff =
          pendingUndiff > 0 &&
          Object.keys(p.pendingByVariant).every(k => k === '' || (p.pendingByVariant[k] ?? 0) <= 0);
        if (onlyUndiff) {
          return (
            sum +
            reworkReportProduct.variants.reduce((s, v) => s + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0), 0)
          );
        }
        const undiffQ = reworkReportQuantities[`${p.pathKey}__`] ?? 0;
        const variantQ = reworkReportProduct.variants.reduce(
          (s, v) => s + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0),
          0,
        );
        return sum + undiffQ + variantQ;
      }
      return sum + (reworkReportQuantities[p.pathKey] ?? 0);
    }, 0);
  }, [reworkReportPaths, reworkReportQuantities, reworkReportHasColorSize, reworkReportProduct?.variants]);

  const reworkMatrixInputClass =
    'h-9 w-[3.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-left text-xs font-bold text-indigo-600 tabular-nums outline-none focus:ring-2 focus:ring-indigo-200';

  const scannedItemTokensRef = useRef<Set<string>>(new Set());
  const scannedBatchTokensRef = useRef<Set<string>>(new Set());

  const applyScanQuantity = useCallback(
    (params: {
      vid: string;
      add: number;
      ownerTenantName?: string | null;
      relation?: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER';
      variantLabel?: string | null;
    }): boolean => {
      const { vid, add, ownerTenantName, relation, variantLabel } = params;
      if (add <= 0 || reworkReportPaths.length === 0) {
        toast.error('暂无待返工路径可累加');
        return false;
      }
      if (reworkReportHasColorSize) {
        if (!vid) {
          toast.error('当前产品按规格管理，单品/批次码未带规格');
          return false;
        }
        const target = reworkReportPaths.find((p) => (p.pendingByVariant[vid] ?? 0) > 0);
        if (!target) {
          toast.error('没有匹配此规格的待返工路径');
          return false;
        }
        const key = `${target.pathKey}__${vid}`;
        setReworkReportQuantities((prev) => {
          const prevV = prev[key] ?? 0;
          const cap = target.pendingByVariant[vid] ?? 0;
          return { ...prev, [key]: Math.min(cap, prevV + add) };
        });
        toast.success(
          `扫码 +${add}${variantLabel ? `（${variantLabel}）` : ''} → ${target.pathLabel}${
            ownerTenantName && relation !== 'OWNER' ? ` · 来自 ${ownerTenantName}` : ''
          }`,
        );
      } else {
        const target = reworkReportPaths[0];
        setReworkReportQuantities((prev) => {
          const prevV = prev[target.pathKey] ?? 0;
          return { ...prev, [target.pathKey]: Math.min(target.totalPending, prevV + add) };
        });
        toast.success(
          `扫码 +${add} → ${target.pathLabel}${
            ownerTenantName && relation !== 'OWNER' ? ` · 来自 ${ownerTenantName}` : ''
          }`,
        );
      }
      return true;
    },
    [reworkReportPaths, reworkReportHasColorSize],
  );

  const handleScanPayload = useCallback(
    async (payload: ScanPayload) => {
      if (!payload.token) return;
      try {
        if (payload.kind === 'ITEM') {
          if (scannedItemTokensRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.kind !== 'ITEM_CODE' || res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return;
          }
          if (res.productId !== order.productId) {
            toast.error('此码产品与当前工单不一致');
            return;
          }
          if (
            !applyScanQuantity({
              vid: res.variantId || '',
              add: 1,
              ownerTenantName: res.ownerTenantName,
              relation: res.callerContext?.relation,
              variantLabel: res.variantLabel,
            })
          ) {
            return;
          }
          scannedItemTokensRef.current.add(payload.token);
        } else if (payload.kind === 'BATCH') {
          if (scannedBatchTokensRef.current.has(payload.token)) {
            toast.warning('此批次码已扫描过');
            return;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.kind !== 'VIRTUAL_BATCH' || res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return;
          }
          if (res.productId !== order.productId) {
            toast.error('此批次码产品与当前工单不一致');
            return;
          }
          if (
            !applyScanQuantity({
              vid: res.variantId || '',
              add: res.quantity ?? 0,
              ownerTenantName: res.ownerTenantName,
              relation: res.callerContext?.relation,
              variantLabel: res.variantLabel,
            })
          ) {
            return;
          }
          scannedBatchTokensRef.current.add(payload.token);
        }
      } catch (e) {
        toast.error((e as Error)?.message || '扫码查询失败');
      }
    },
    [order.productId, applyScanQuantity],
  );

  const handleSubmit = () => {
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
    const hasAnyQty = pathsSnapshot.some(p => {
      if (!reworkReportHasColorSize) return (reworkReportQuantities[p.pathKey] ?? 0) > 0;
      const pu = p.pendingByVariant[''] ?? 0;
      const onlyU =
        pu > 0 &&
        Object.keys(p.pendingByVariant).every(k => k === '' || (p.pendingByVariant[k] ?? 0) <= 0);
      if (onlyU) {
        const sum =
          reworkReportProduct?.variants?.reduce(
            (s, v) => s + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0),
            0
          ) ?? 0;
        if (sum > 0) return true;
      }
      if ((p.pendingByVariant[''] ?? 0) > 0 && (reworkReportQuantities[`${p.pathKey}__`] ?? 0) > 0) return true;
      return (reworkReportProduct?.variants ?? []).some(v => (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0) > 0);
    });
    if (!hasAnyQty) {
      toast.warning('请先在各返工路径下填写报工数量');
      return;
    }
    let batchDocNo = '';
    let reportSeq = 0;
    let appliedReportQty = 0;
    const resolveOpName = (fallback?: string) => workers?.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? fallback ?? docOperatorFallback;
    const collabExtra = reworkReportCollabFromValues(reworkReportCustomData);
    const pushReworkReport = (qty: number, variantId: string | undefined, src: ProductionOpRecord) => {
      if (qty <= 0) return;
      if (!batchDocNo) batchDocNo = getNextReworkReportDocNo();
      appliedReportQty += qty;
      const ts = new Date().toLocaleString();
      const opName = isOutsourceRework ? '' : resolveOpName();
      const sid = src.id != null ? String(src.id) : 'x';
      onAddRecord({
        id: `rec-rework-report-${Date.now()}-${reportSeq++}-${sid.slice(-8)}`,
        type: 'REWORK_REPORT' as const,
        orderId: src.orderId ?? order.id,
        productId: order.productId,
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
      });
    };
    try {
      for (const { pathKey, records: pathRecords, pendingByVariant } of pathsSnapshot) {
        if (reworkReportHasColorSize) {
          const pendingUndiff = pendingByVariant[''] ?? 0;
          const onlyUndiffPending =
            pendingUndiff > 0 &&
            Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);

          if (onlyUndiffPending) {
            const userTotal =
              reworkReportProduct?.variants?.reduce(
                (s, v) => s + (reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0),
                0
              ) ?? 0;
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
          if ((pendingByVariant[''] ?? 0) > 0) byVariant[''] = Math.min(reworkReportQuantities[`${pathKey}__`] ?? 0, pendingByVariant[''] ?? 0);
          reworkReportProduct?.variants?.forEach(v => { byVariant[v.id] = Math.min(reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0, pendingByVariant[v.id] ?? 0); });
          const totalToApply = Object.values(byVariant).reduce((s, q) => s + q, 0);
          if (totalToApply <= 0) continue;
          let remainingByVariant = { ...byVariant };
          const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          for (const r of sortedRecs) {
            const vid = r.variantId ?? '';
            const need = Math.min(r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0), remainingByVariant[vid] ?? 0);
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
          const totalToApply = Math.min(reworkReportQuantities[pathKey] ?? 0, pathRecords.reduce((s, r) => s + (r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0)), 0));
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
      }
    } catch (e) {
      console.error(e);
      toast.error(`提交失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (appliedReportQty <= 0) {
      toast.error(isOutsourceRework ? '未能写入委外返工收回：请确认所填数量与各规格「待收回」一致，或尝试刷新页面后重试。' : '未能写入返工报工：请确认所填数量与各规格「待返工」一致，或尝试刷新页面后重试。');
      return;
    }
    if (isOutsourceRework && appliedReportQty > 0) {
      const receiveDocNo = nextOutsourceDocNumber('receive', partners, records, '', (outsourcePartner || '').trim());
      const ts = new Date().toLocaleString();
      const firstDispatch = records.find(r =>
        r.type === 'OUTSOURCE' && r.status === '加工中' && r.sourceReworkId &&
        r.nodeId === currentNodeId && (r.partner ?? '') === outsourcePartner
      );
      onAddRecord({
        id: `wx-recv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'OUTSOURCE',
        orderId: productionLinkMode === 'product' ? undefined : order.id,
        productId: order.productId,
        quantity: appliedReportQty,
        operator: '',
        timestamp: ts,
        status: '已收回',
        partner: outsourcePartner,
        nodeId: currentNodeId,
        docNo: receiveDocNo,
        sourceReworkId: firstDispatch?.sourceReworkId,
      });
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
                    <span className="font-bold text-slate-800">{order.productName || '—'}</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-800">{order.orderNumber}</span>
                    <span className="mx-2">·</span>
                    <span>{order.productName || '—'}</span>
                  </>
                )}
                {isOutsourceRework && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                    外协工厂: {outsourcePartner}
                  </span>
                )}
              </p>
              <p className="text-slate-500">
                {processSequenceMode === 'sequential'
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
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">扫码录入</span>
                    <ScanInputButton onScan={handleScanPayload} hint="扫码录入" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80">
                    <div className="flex flex-wrap items-start gap-2 sm:gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <label className={psiOrderBillCompactLineLabelClass}>报工明细</label>
                        <div className="flex min-w-0 items-start gap-2">
                          {reworkReportProduct?.imageUrl ? (
                            <img
                              src={reworkReportProduct.imageUrl}
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
                              <span className="font-bold text-slate-700">{order.productName || '—'}</span>
                              {reworkReportProduct?.sku?.trim() ? (
                                <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{reworkReportProduct.sku.trim()}</span>
                              ) : null}
                            </div>
                            {reworkSummaryProductTags.length > 0 ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {reworkSummaryProductTags.map(({ field, display }) => (
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
                        {reworkSingleSimpleQuantityPath ? (
                          <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                            <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                            <input
                              type="number"
                              min={0}
                              max={reworkSingleSimpleQuantityPath.totalPending}
                              value={
                                (reworkReportQuantities[reworkSingleSimpleQuantityPath.pathKey] ?? 0) === 0
                                  ? ''
                                  : reworkReportQuantities[reworkSingleSimpleQuantityPath.pathKey]
                              }
                              onChange={e =>
                                setReworkReportQuantities(prev => ({
                                  ...prev,
                                  [reworkSingleSimpleQuantityPath.pathKey]: Math.min(
                                    reworkSingleSimpleQuantityPath.totalPending,
                                    Math.max(0, Number(e.target.value) || 0),
                                  ),
                                }))
                              }
                              placeholder="0"
                              title={`最多 ${reworkSingleSimpleQuantityPath.totalPending}`}
                              className={psiOrderBillCompactLineInputClass}
                            />
                          </div>
                        ) : (
                          <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                            <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                            <div className={psiOrderBillCompactLineReadonlyClass}>
                              {reworkTotalEnteredQty.toLocaleString()} {reworkUnitName}
                            </div>
                          </div>
                        )}
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
                            {(reworkTotalEnteredQty * (reworkReportUnitPrice || 0)).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {reworkReportHasColorSize && reworkReportProduct?.variants?.length ? (
                      <div className="space-y-3 border-t border-slate-100 pt-2">
                        <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                        {reworkReportPaths.map(({ pathKey, pendingByVariant }) => {
                          const pendingUndiff = pendingByVariant[''] ?? 0;
                          const onlyUndiff =
                            pendingUndiff > 0 &&
                            Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);
                          const undiffKey = `${pathKey}__`;
                          const undiffEntered = reworkReportQuantities[undiffKey] ?? 0;
                          if (!dictionaries) {
                            return (
                              <div key={pathKey} className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/90 p-3">
                                <p className="text-sm font-bold text-amber-900">缺少颜色尺码字典，请先在基础资料维护后再按规格录入。</p>
                              </div>
                            );
                          }
                          if (!reworkReportMatrixProduct || !reworkReportProduct.variants?.length) return null;
                          return (
                            <div key={pathKey} className="space-y-2 rounded-lg border border-slate-100 bg-white/90 p-3">
                              {onlyUndiff ? (
                                <p className="text-[11px] font-bold leading-snug text-slate-600">
                                  此路径返工未带规格：在各尺码中分配，合计不超过 <span className="tabular-nums text-indigo-600">{pendingUndiff}</span> 件。
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
                                product={reworkReportMatrixProduct}
                                dictionaries={dictionaries}
                                quantities={Object.fromEntries(
                                  reworkReportProduct.variants.map(v => [v.id, reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0]),
                                )}
                                onVariantQtyChange={(variantId, qty) => {
                                  const raw = Math.max(0, qty);
                                  if (!onlyUndiff) {
                                    const maxV = pendingByVariant[variantId] ?? 0;
                                    setReworkReportQuantities(prev => ({ ...prev, [`${pathKey}__${variantId}`]: Math.min(maxV, raw) }));
                                    return;
                                  }
                                  setReworkReportQuantities(prev => {
                                    const sumOthers = (reworkReportProduct?.variants ?? [])
                                      .filter(x => x.id !== variantId)
                                      .reduce((s, x) => s + (prev[`${pathKey}__${x.id}`] ?? 0), 0);
                                    const cap = Math.max(0, pendingUndiff - sumOthers);
                                    return { ...prev, [`${pathKey}__${variantId}`]: Math.min(cap, raw) };
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
                                  const sumOthers = (reworkReportProduct?.variants ?? [])
                                    .filter(x => x.id !== v.id)
                                    .reduce((s, x) => s + (reworkReportQuantities[`${pathKey}__${x.id}`] ?? 0), 0);
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
                        {reworkReportPaths.map(({ pathKey, totalPending }) => {
                          const totalEntered = reworkReportQuantities[pathKey] ?? 0;
                          const hideInlineQty = reworkSingleSimpleQuantityPath?.pathKey === pathKey;
                          if (hideInlineQty) return null;
                          return (
                            <div
                              key={pathKey}
                              className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white/90 p-3 sm:flex-row sm:items-end sm:justify-end"
                            >
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
                                        [pathKey]: Math.min(totalPending, Math.max(0, Number(e.target.value) || 0)),
                                      }))
                                    }
                                    className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1 text-indigo-600`}
                                    placeholder="0"
                                    title={`最多 ${totalPending}`}
                                  />
                                  <span className="text-[9px] font-bold tabular-nums text-slate-400">最多{totalPending}</span>
                                  <span className="w-7 shrink-0 text-right text-[9px] font-bold text-slate-400">{reworkUnitName}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className={`${psiOrderBillCompactSummaryBarClass} flex-wrap justify-between gap-y-2 sm:justify-end`}>
                    <div className="flex items-baseline gap-2">
                      <span className={psiOrderBillCompactSummaryLabelClass}>本次报工合计</span>
                      <span className={psiOrderBillCompactSummaryValueClass}>
                        {reworkTotalEnteredQty.toLocaleString()}
                        <span className={psiOrderBillCompactSummaryUnitClass}>{reworkUnitName}</span>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 border-l border-white/25 pl-0 sm:pl-4">
                      <span className={psiOrderBillCompactSummaryLabelClass}>金额合计</span>
                      <span className={psiOrderBillCompactSummaryValueClass}>
                        ¥{(reworkTotalEnteredQty * (reworkReportUnitPrice || 0)).toFixed(2)}
                      </span>
                    </div>
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
