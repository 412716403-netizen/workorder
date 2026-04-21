import React, { useState, useMemo, useCallback, useRef } from 'react';
import { FileText, X, UserPlus, Scale } from 'lucide-react';
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
  ProductVariant,
  Worker,
  ProcessSequenceMode,
  Partner,
  PlanFormFieldConfig,
  BOM,
  MaterialBreakdownRow,
} from '../../types';
import { calcUsageByWeight } from '../../utils/bomMaterialUsageByWeight';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import { nextOutsourceDocNumber } from '../../utils/partnerDocNumber';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { REWORK_REPORT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';

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
  boms?: BOM[];
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
  boms = [],
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
  const [reworkReportTotalWeight, setReworkReportTotalWeight] = useState<number | ''>('');

  const reworkReportCreateFields = useMemo(
    () => reworkReportCustomFields.filter(f => f.showInCreate),
    [reworkReportCustomFields],
  );
  const reworkReportCustomBlock =
    reworkReportCreateFields.length > 0 ? (
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">返工报工自定义</h4>
          <p className="text-[11px] font-bold text-slate-500">自定义单据内容（选填，本批次报工共用）</p>
        </div>
        {reworkReportCreateFields.map(cf => (
          <div key={cf.id} className="space-y-1">
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
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
              controlClassName="h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ))}
      </div>
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
  const reworkReportGroupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!reworkReportProduct?.variants?.length) return {};
    const groups: Record<string, ProductVariant[]> = {};
    reworkReportProduct.variants.forEach(v => {
      const c = v.colorId || 'none';
      if (!groups[c]) groups[c] = [];
      groups[c].push(v);
    });
    return groups;
  }, [reworkReportProduct?.variants]);

  /**
   * 返工报工称重：取决于当前工序（currentNodeId）是否开启 enableWeightOnReport。
   * 委外返工时也沿用外协收回同一套口径：整批总重量由用户录入，按各变体实际报工数量同比分摊到每条派生单据。
   */
  const weightReportEnabled = useMemo(
    () => !!globalNodes.find(n => n.id === currentNodeId)?.enableWeightOnReport,
    [globalNodes, currentNodeId],
  );
  const productsById = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);
  const reworkReportBom = useMemo((): BOM | null => {
    if (!weightReportEnabled || !reworkReportProduct) return null;
    const nodeBoms = boms.filter(b => b.parentProductId === reworkReportProduct.id && b.nodeId === currentNodeId);
    if (nodeBoms.length === 0) return null;
    return nodeBoms.find(b => !b.variantId) ?? nodeBoms[0];
  }, [weightReportEnabled, boms, reworkReportProduct, currentNodeId]);
  const reworkReportPlannedTotalQty = useMemo(() => {
    return reworkReportPaths.reduce((sum, p) => {
      if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
        const undiffKey = `${p.pathKey}__`;
        const pu = p.pendingByVariant[''] ?? 0;
        const onlyU = pu > 0 && Object.keys(p.pendingByVariant).every(k => k === '' || (p.pendingByVariant[k] ?? 0) <= 0);
        if (onlyU) {
          return sum + (reworkReportProduct.variants.reduce((vs, v) => vs + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0), 0));
        }
        const undiffQ = (reworkReportQuantities[undiffKey] ?? 0);
        const variantQ = reworkReportProduct.variants.reduce((vs, v) => vs + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0), 0);
        return sum + undiffQ + variantQ;
      }
      return sum + (reworkReportQuantities[p.pathKey] ?? 0);
    }, 0);
  }, [reworkReportPaths, reworkReportQuantities, reworkReportHasColorSize, reworkReportProduct?.variants]);
  const reworkReportWeightPreview = useMemo((): MaterialBreakdownRow[] => {
    const w = typeof reworkReportTotalWeight === 'number' ? reworkReportTotalWeight : 0;
    if (!weightReportEnabled || !reworkReportBom || w <= 0 || reworkReportPlannedTotalQty <= 0) return [];
    return calcUsageByWeight(reworkReportBom, reworkReportPlannedTotalQty, w, productsById);
  }, [weightReportEnabled, reworkReportBom, reworkReportTotalWeight, reworkReportPlannedTotalQty, productsById]);

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
    /**
     * 本批次总重量按"本次实际报工数量"同比分摊到每条派生的 REWORK_REPORT；
     * 分母取提交前用预估数量算得的 plannedTotal，以保持前端预览与写入一致。
     */
    const totalWeightNum = typeof reworkReportTotalWeight === 'number' && reworkReportTotalWeight > 0
      ? reworkReportTotalWeight
      : 0;
    const canSplitWeight = weightReportEnabled && totalWeightNum > 0 && reworkReportPlannedTotalQty > 0;
    const pushReworkReport = (qty: number, variantId: string | undefined, src: ProductionOpRecord) => {
      if (qty <= 0) return;
      if (!batchDocNo) batchDocNo = getNextReworkReportDocNo();
      appliedReportQty += qty;
      const ts = new Date().toLocaleString();
      const opName = isOutsourceRework ? '' : resolveOpName();
      const sid = src.id != null ? String(src.id) : 'x';
      const weightForThis = canSplitWeight
        ? Number(((qty / reworkReportPlannedTotalQty) * totalWeightNum).toFixed(4))
        : undefined;
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
        ...(weightForThis != null ? { weight: weightForThis } : {}),
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
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            {productionLinkMode === 'product' ? (
              <>
                <span className="font-bold text-slate-800">{order.productName || '—'}</span>
                <span className="text-slate-400 text-xs ml-2">载体工单 {order.orderNumber}</span>
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
          {!isOutsourceRework && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">生产人员 <span className="text-rose-500">*</span></label>
              <WorkerSelector
                options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                processNodes={globalNodes}
                currentNodeId={reworkReportModal.nodeId}
                value={reworkReportWorkerId}
                onChange={(id: string) => setReworkReportWorkerId(id)}
                placeholder="选择报工人员..."
                variant="default"
                icon={UserPlus}
              />
            </div>
          )}
          {!isOutsourceRework &&
            equipmentFeaturesOn &&
            globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">设备 <span className="text-rose-500">*</span></label>
              <EquipmentSelector
                options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                processNodes={globalNodes}
                currentNodeId={reworkReportModal.nodeId}
                value={reworkReportEquipmentId}
                onChange={(id: string) => setReworkReportEquipmentId(id)}
                placeholder="选择设备..."
                variant="default"
              />
            </div>
          )}
          {reworkReportCustomBlock}
          <div className="flex flex-wrap items-end gap-6 pt-2 border-t border-slate-100">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">扫码累加</label>
              <div className="h-10 flex items-center">
                <ScanInputButton onScan={handleScanPayload} hint="扫码录入" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={reworkReportUnitPrice || ''}
                onChange={e => setReworkReportUnitPrice(Number(e.target.value) || 0)}
                placeholder="0"
                className="h-10 w-28 box-border rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-800 text-center tabular-nums focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
              <div className="h-10 w-28 box-border rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-slate-700 text-center flex items-center justify-center tabular-nums">
                {(() => {
                  const totalQty = reworkReportPaths.reduce((sum, p) => {
                    if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
                      return sum + (reworkReportProduct.variants.reduce((vs, v) => vs + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0), 0));
                    }
                    return sum + (reworkReportQuantities[p.pathKey] ?? 0);
                  }, 0);
                  return (totalQty * (reworkReportUnitPrice || 0)).toFixed(2);
                })()}
              </div>
            </div>
          </div>
          {weightReportEnabled && (
            <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-black uppercase tracking-widest text-amber-700">本次交货总重量</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={reworkReportTotalWeight === '' ? '' : reworkReportTotalWeight}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw === '') setReworkReportTotalWeight('');
                      else setReworkReportTotalWeight(Math.max(0, Number(raw) || 0));
                    }}
                    placeholder="0"
                    className="h-10 w-32 box-border rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold text-slate-800 text-right tabular-nums outline-none focus:ring-2 focus:ring-amber-300"
                  />
                  <span className="text-sm font-bold text-slate-600">kg</span>
                </div>
              </div>
              {reworkReportBom == null ? (
                <p className="text-[11px] font-bold text-amber-700">
                  当前产品在该工序下暂无 BOM，无法按重量分摊物料消耗。报工仍可提交，但不会生成预估消耗数据。
                </p>
              ) : reworkReportWeightPreview.length === 0 ? (
                <p className="text-[11px] font-bold text-slate-500">
                  输入本次交货总重量后，将按 BOM 占比预估各物料的实际消耗。
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-amber-100 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-50/60">
                      <tr className="text-left text-[10px] font-black uppercase tracking-widest text-amber-700">
                        <th className="px-3 py-2">物料</th>
                        <th className="px-3 py-2 text-right">占比</th>
                        <th className="px-3 py-2 text-right">预估消耗 (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reworkReportWeightPreview.map(row => (
                        <tr key={row.materialProductId} className="border-t border-amber-50">
                          <td className="px-3 py-2 font-bold text-slate-800">{row.materialName || '—'}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-600 tabular-nums">
                            {(row.ratio * 100).toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right font-black text-slate-900 tabular-nums">
                            {row.actualWeight.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {reworkReportPaths.length === 0 ? (
            <p className="text-slate-500 py-4">
              {processSequenceMode === 'sequential'
                ? '该工序暂无待返工数量（顺序模式：请先完成上一道返工工序的报工）'
                : '该工序暂无待返工数量'}
            </p>
          ) : (
            <div className="space-y-4 pb-2">
              {reworkReportPaths.map(({ pathKey, pathLabel, records: pathRecords, totalPending, pendingByVariant }) => {
                if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
                  return (
                    <div key={pathKey} className="space-y-3 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800">返工路径：{pathLabel}</span>
                        <span className="text-xs font-bold text-indigo-600">待返工合计 {totalPending} 件</span>
                      </div>
                      <div className="space-y-3 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                        {sortedVariantColorEntries(reworkReportGroupedVariants, reworkReportProduct?.colorIds, reworkReportProduct?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
                          return (
                            <div
                              key={colorId}
                              className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4"
                            >
                              <div className="flex items-center gap-2.5 w-40 shrink-0 sm:pb-0.5">
                                {color && (
                                  <span
                                    className="w-5 h-5 rounded-full border border-slate-200 shrink-0"
                                    style={{ backgroundColor: (color as { value?: string }).value }}
                                  />
                                )}
                                <span className="text-sm font-bold text-slate-800 leading-tight">{(color as { name?: string })?.name ?? colorId}</span>
                              </div>
                              <div className="flex flex-wrap items-end gap-x-4 gap-y-3 flex-1 min-w-0">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                                  const pendingUndiff = pendingByVariant[''] ?? 0;
                                  const onlyUndiff =
                                    pendingUndiff > 0 &&
                                    Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);
                                  const maxV = onlyUndiff
                                    ? pendingUndiff
                                    : (pendingByVariant[v.id] ?? 0);
                                  const qty = reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 w-[4.75rem] flex-none">
                                      <span className="text-[10px] font-bold text-slate-400 text-center leading-none min-h-[14px] flex items-end justify-center">
                                        {size?.name ?? v.sizeId}
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxV}
                                        value={qty === 0 ? '' : qty}
                                        onChange={e => {
                                          const raw = Math.max(0, Number(e.target.value) || 0);
                                          if (!onlyUndiff) {
                                            setReworkReportQuantities(prev => ({ ...prev, [`${pathKey}__${v.id}`]: Math.min(maxV, raw) }));
                                            return;
                                          }
                                          setReworkReportQuantities(prev => {
                                            const sumOthers = (reworkReportProduct?.variants ?? [])
                                              .filter(x => x.id !== v.id)
                                              .reduce((s, x) => s + (prev[`${pathKey}__${x.id}`] ?? 0), 0);
                                            const cap = Math.max(0, pendingUndiff - sumOthers);
                                            return { ...prev, [`${pathKey}__${v.id}`]: Math.min(cap, raw) };
                                          });
                                        }}
                                        className="h-10 w-full box-border bg-white border border-slate-200 rounded-lg px-2 text-sm font-bold text-indigo-600 text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400 placeholder:text-right"
                                        placeholder={`最多${maxV}`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                const totalEntered = reworkReportQuantities[pathKey] ?? 0;
                return (
                  <div
                    key={pathKey}
                    className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4 bg-slate-50/50 rounded-xl p-4 border border-slate-100"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-bold text-slate-800 block">返工路径：{pathLabel}</span>
                      <span className="text-xs font-bold text-slate-500">待返工 {totalPending} 件</span>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">数量</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={totalPending}
                          value={totalEntered === 0 ? '' : totalEntered}
                          onChange={e => setReworkReportQuantities(prev => ({ ...prev, [pathKey]: Math.min(totalPending, Math.max(0, Number(e.target.value) || 0)) }))}
                          className="h-10 w-24 box-border bg-white border border-slate-200 rounded-lg px-2 text-sm font-bold text-indigo-600 text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400"
                          placeholder={`最多${totalPending}`}
                        />
                        <span className="text-sm font-medium text-slate-500 shrink-0">件</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
