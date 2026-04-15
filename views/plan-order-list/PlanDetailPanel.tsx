
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Layers,
  Clock,
  ArrowRightCircle,
  AlertCircle,
  Save,
  FileText,
  CalendarDays,
  Info,
  Users,
  UserPlus,
  Boxes,
  ClipboardCheck,
  Package,
  ShoppingCart,
  Trash2,
  Building2,
  FileSpreadsheet,
  ListOrdered,
  Split,
  Printer,
  QrCode,
  Ban,
  RefreshCw,
  Wrench,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  PlanOrder,
  Product,
  PlanStatus,
  ProductCategory,
  AppDictionaries,
  ProductVariant,
  PlanItem,
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
  ItemCode,
  PlanVirtualBatch,
} from '../../types';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import { buildPrintListRowsFromItemCodes, type ItemCodePrintContext } from '../../utils/printItemCodeRows';
import { buildVirtualBatchPrintRow } from '../../utils/printVirtualBatch';
import { formatBatchSerialLabel, formatItemCodeSerialLabel } from '../../utils/serialLabels';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { SearchableMultiSelectWithProcessTabs } from '../../components/SearchableMultiSelect';
import { localTodayYmd, planIdToLocalYmd, toLocalDateYmd } from '../../utils/localDateTime';
import { nextPsiDocNumber } from '../../utils/partnerDocNumber';

function formatPlanDueDateList(dueDate: string | undefined | null): string {
  if (!dueDate) return '';
  return toLocalDateYmd(dueDate) || String(dueDate).trim().slice(0, 10);
}

function formatPlanCreatedDateList(created: string | undefined | null): string {
  if (!created) return '';
  return toLocalDateYmd(created) || String(created).trim().slice(0, 10);
}

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

interface ProposedOrder {
  orderNumber: string;
  partnerId: string;
  partnerName: string;
  items: {
    id: string;
    productId: string;
    materialName: string;
    materialSku: string;
    quantity: number;
    suggestedQty: number;
    nodeName: string;
  }[];
}

type TraceGenMode = null | 'item' | 'batch' | 'batchWithItems';

export interface PlanDetailPanelProps {
  planId: string;
  onClose: () => void;

  // Data
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
  orders?: ProductionOrder[];
  productionLinkMode?: 'order' | 'product';

  // Callbacks
  onUpdatePlan?: (planId: string, updates: Partial<PlanOrder>) => void;
  onDeletePlan?: (planId: string) => void;
  onConvertToOrder: (planId: string) => void;
  onUpdateProduct: (product: Product) => Promise<boolean>;
  onAddPSIRecord?: (record: any) => void;
  onAddPSIRecordBatch?: (records: any[]) => Promise<void>;
  onCreateSubPlan?: (params: { productId: string; quantity: number; planId: string; bomNodeId: string }) => void;
  onCreateSubPlans?: (params: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId: string; parentProductId?: string; parentNodeId?: string }> }) => void;

  // Shared UI actions
  onRequestSplit: (plan: PlanOrder) => void;
  onImagePreview: (url: string) => void;
  onFilePreview: (url: string, type: 'image' | 'pdf') => void;
  onPrintRun: (run: { template: PrintTemplate; plan: PlanOrder } | null) => void;
  labelPrintPickerTemplates: PrintTemplate[];
  printTemplates: PrintTemplate[];
}

const PlanDetailPanel: React.FC<PlanDetailPanelProps> = ({
  planId,
  onClose,
  plans,
  products,
  categories,
  dictionaries,
  workers,
  equipment,
  globalNodes,
  boms,
  partners,
  partnerCategories = [],
  psiRecords = [],
  planFormSettings,
  orders = [],
  productionLinkMode = 'order',
  onUpdatePlan,
  onDeletePlan,
  onConvertToOrder,
  onUpdateProduct,
  onAddPSIRecord,
  onAddPSIRecordBatch,
  onCreateSubPlan,
  onCreateSubPlans,
  onRequestSplit,
  onImagePreview,
  onFilePreview,
  onPrintRun,
  labelPrintPickerTemplates,
  printTemplates,
}) => {
  const confirm = useConfirm();

  // --- State ---
  const [tempAssignments, setTempAssignments] = useState<Record<string, NodeAssignment>>({});
  const [tempPlanInfo, setTempPlanInfo] = useState<{
    customer: string;
    dueDate: string;
    createdAt: string;
    items: PlanItem[];
    customData?: Record<string, any>;
  }>({ customer: '', dueDate: '', createdAt: '', items: [] });

  const [isSaving, setIsSaving] = useState(false);
  const [tempNodeRates, setTempNodeRates] = useState<Record<string, number>>({});
  const [proposedOrders, setProposedOrders] = useState<ProposedOrder[]>([]);
  const [isProcessingPO, setIsProcessingPO] = useState(false);
  const [plannedQtyByKey, setPlannedQtyByKey] = useState<Record<string, number | null>>({});
  const [relatedPOsMaterialId, setRelatedPOsMaterialId] = useState<string | null>(null);
  const [traceGenMode, setTraceGenMode] = useState<TraceGenMode>(null);

  const [itemCodes, setItemCodes] = useState<ItemCode[]>([]);
  const [itemCodesTotal, setItemCodesTotal] = useState(0);
  const [itemCodesPage, setItemCodesPage] = useState(1);
  const [itemCodesLoading, setItemCodesLoading] = useState(false);
  const [itemCodesGenerating, setItemCodesGenerating] = useState(false);
  const [itemCodesVariantFilter, setItemCodesVariantFilter] = useState<string>('');
  const [itemCodesBatchFilter, setItemCodesBatchFilter] = useState<string>('');

  const [virtualBatches, setVirtualBatches] = useState<PlanVirtualBatch[]>([]);
  const [virtualBatchesSubtree, setVirtualBatchesSubtree] = useState<PlanVirtualBatch[]>([]);
  const [virtualBatchesLoading, setVirtualBatchesLoading] = useState(false);
  const [vbCreating, setVbCreating] = useState(false);
  const [vbBulkBatchSize, setVbBulkBatchSize] = useState<string>('');
  const [vbBulkSplitting, setVbBulkSplitting] = useState(false);
  const [vbVariantId, setVbVariantId] = useState<string>('');
  const [vbQuantity, setVbQuantity] = useState<string>('');

  const [itemCodePrintOpen, setItemCodePrintOpen] = useState(false);
  const [itemCodePrintPlan, setItemCodePrintPlan] = useState<PlanOrder | null>(null);
  const [itemCodePrintCodes, setItemCodePrintCodes] = useState<ItemCode[]>([]);
  const [itemCodePrintSelectedIds, setItemCodePrintSelectedIds] = useState<Set<string>>(new Set());
  const [itemCodePrintLoading, setItemCodePrintLoading] = useState(false);
  const [batchPrintModal, setBatchPrintModal] = useState<{ plan: PlanOrder; batch: PlanVirtualBatch } | null>(null);

  const sectionBasicRef = useRef<HTMLDivElement>(null);
  const sectionQtyRef = useRef<HTMLDivElement>(null);
  const sectionProcessRef = useRef<HTMLDivElement>(null);
  const sectionMaterialRef = useRef<HTMLDivElement>(null);
  const sectionTraceRef = useRef<HTMLDivElement>(null);
  const traceItemListRef = useRef<HTMLDivElement>(null);
  const traceBatchListRef = useRef<HTMLDivElement>(null);

  // --- Derived data ---
  const viewPlan = plans.find(p => p.id === planId);
  const viewProduct = products.find(p => p.id === viewPlan?.productId);
  const parentPlan = viewPlan?.parentPlanId ? plans.find(p => p.id === viewPlan.parentPlanId) : null;
  const effectivePlanForMaterial = parentPlan || viewPlan;

  const parentToSubPlans = useMemo(() => {
    const map = new Map<string, PlanOrder[]>();
    plans.filter(p => p.parentPlanId).forEach(p => {
      const pid = p.parentPlanId!;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(p);
    });
    map.forEach(arr => arr.sort((a, b) => (a.planNumber || '').localeCompare(b.planNumber || '')));
    return map;
  }, [plans]);

  const getAllDescendantsWithDepth = (pid: string, depth: number): { plan: PlanOrder; depth: number }[] => {
    const direct = parentToSubPlans.get(pid) || [];
    const result: { plan: PlanOrder; depth: number }[] = [];
    direct.forEach(p => {
      result.push({ plan: p, depth });
      result.push(...getAllDescendantsWithDepth(p.id, depth + 1));
    });
    return result;
  };

  const hasUnconvertedSubPlans = (pid: string) =>
    getAllDescendantsWithDepth(pid, 1).some(d => d.plan.status !== PlanStatus.CONVERTED);

  const planNumbersForPO = useMemo(() => {
    if (!viewPlan) return [];
    const nums: string[] = [viewPlan.planNumber];
    let p: PlanOrder | undefined = viewPlan;
    while (p?.parentPlanId) {
      const parent = plans.find(x => x.id === p!.parentPlanId);
      if (parent) { nums.push(parent.planNumber); p = parent; } else break;
    }
    return nums;
  }, [viewPlan, plans]);

  const vbQuotaInfo = useMemo(() => {
    if (!viewPlan || !viewProduct) return null;
    const vKey = (v: string | null | undefined) => v ?? '';
    if (viewProduct.variants.length > 0 && !vbVariantId) {
      return { kind: 'needVariant' as const };
    }
    const effVariant: string | null = viewProduct.variants.length > 0 ? vbVariantId : null;
    const subtree = collectSubtreePlanIdsForPlan(viewPlan.id, plans);
    const productId = viewPlan.productId;
    let maxFromPlan = 0;
    for (const pid of subtree) {
      const p = plans.find(pl => pl.id === pid);
      if (!p || p.productId !== productId) continue;
      for (const it of p.items || []) {
        if (vKey(it.variantId) === vKey(effVariant)) {
          maxFromPlan += Math.floor(Number(it.quantity));
        }
      }
    }
    let allocated = 0;
    for (const b of virtualBatchesSubtree) {
      if (b.status !== 'ACTIVE') continue;
      if (b.productId !== productId) continue;
      if (!subtree.includes(b.planOrderId)) continue;
      if (vKey(b.variantId) !== vKey(effVariant)) continue;
      allocated += b.quantity;
    }
    const remaining = Math.max(0, maxFromPlan - allocated);
    return { kind: 'ok' as const, maxFromPlan, allocated, remaining };
  }, [viewPlan, viewProduct, vbVariantId, plans, virtualBatchesSubtree]);

  const vbBulkAllSummary = useMemo(() => {
    if (!viewPlan || !viewProduct) return null;
    const vKey = (v: string | null | undefined) => v ?? '';
    const subtree = collectSubtreePlanIdsForPlan(viewPlan.id, plans);
    const productId = viewPlan.productId;
    const variantKeys = new Set<string>();
    for (const pid of subtree) {
      const p = plans.find(pl => pl.id === pid);
      if (!p || p.productId !== productId) continue;
      for (const it of p.items || []) {
        variantKeys.add(vKey(it.variantId));
      }
    }
    if (variantKeys.size === 0) {
      return { totalRemaining: 0, variantCount: 0 };
    }
    let totalRemaining = 0;
    for (const vk of variantKeys) {
      let maxFromPlan = 0;
      for (const pid of subtree) {
        const p = plans.find(pl => pl.id === pid);
        if (!p || p.productId !== productId) continue;
        for (const it of p.items || []) {
          if (vKey(it.variantId) === vk) maxFromPlan += Math.floor(Number(it.quantity));
        }
      }
      let alloc = 0;
      for (const b of virtualBatchesSubtree) {
        if (b.status !== 'ACTIVE') continue;
        if (b.productId !== productId) continue;
        if (!subtree.includes(b.planOrderId)) continue;
        if (vKey(b.variantId) !== vk) continue;
        alloc += b.quantity;
      }
      totalRemaining += Math.max(0, maxFromPlan - alloc);
    }
    return { totalRemaining, variantCount: variantKeys.size };
  }, [viewPlan, viewProduct, plans, virtualBatchesSubtree]);

  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const materialIdsWithPO = useMemo(() => {
    if (!planNumbersForPO.length || !psiRecords?.length) return new Set<string>();
    const ids = new Set<string>();
    psiRecords.forEach((r: any) => {
      if (r.type !== 'PURCHASE_ORDER' || !r.note || !r.productId) return;
      if (planNumbersForPO.some(planNum => String(r.note).includes(`计划单[${planNum}]`))) ids.add(r.productId);
    });
    return ids;
  }, [planNumbersForPO, psiRecords]);

  const relatedPOsByMaterial = useMemo(() => {
    if (!planNumbersForPO.length || !psiRecords?.length) return {} as Record<string, any[]>;
    const map: Record<string, any[]> = {};
    psiRecords.forEach((r: any) => {
      if (r.type !== 'PURCHASE_ORDER' || !r.note || !r.productId) return;
      if (planNumbersForPO.some(planNum => String(r.note).includes(`计划单[${planNum}]`))) {
        if (!map[r.productId]) map[r.productId] = [];
        map[r.productId].push(r);
      }
    });
    return map;
  }, [planNumbersForPO, psiRecords]);

  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    (psiRecords || []).filter((r: any) => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId).forEach((r: any) => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
    });
    return map;
  }, [psiRecords]);

  const getInboundProgress = (materialId: string): { received: number; ordered: number } | null => {
    const list = relatedPOsByMaterial[materialId];
    if (!list?.length) return null;
    let ordered = 0;
    let received = 0;
    list.forEach((r: any) => {
      ordered += r.quantity ?? 0;
      received += receivedByOrderLine[`${r.docNumber}::${r.id}`] ?? 0;
    });
    return { received, ordered };
  };

  const groupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!viewProduct || !viewProduct.variants) return {};
    const groups: Record<string, ProductVariant[]> = {};
    viewProduct.variants.forEach(v => {
      if (!groups[v.colorId]) groups[v.colorId] = [];
      groups[v.colorId].push(v);
    });
    return groups;
  }, [viewProduct]);

  const productNodes = useMemo(() => {
    if (!viewProduct || !viewProduct.milestoneNodeIds) return [];
    return viewProduct.milestoneNodeIds
      .map(id => globalNodes.find(gn => gn.id === id))
      .filter((n): n is GlobalNodeTemplate => Boolean(n));
  }, [viewProduct, globalNodes]);

  const findSubPlanForMaterial = (materialId: string, nodeId: string, rootPlanId: string): PlanOrder | null => {
    const queue: string[] = [rootPlanId];
    while (queue.length > 0) {
      const pid = queue.shift()!;
      const child = plans.find((p: PlanOrder) => p.parentPlanId === pid && p.productId === materialId && (p.bomNodeId || '') === (nodeId || ''));
      if (child) return child;
      plans.filter((p: PlanOrder) => p.parentPlanId === pid).forEach((p: PlanOrder) => queue.push(p.id));
    }
    return null;
  };

  const getEffectiveQty = (materialId: string, nodeId: string, fallback: number): number => {
    if (!viewPlan) return fallback;
    const subPlan = findSubPlanForMaterial(materialId, nodeId, viewPlan.id);
    const subQty = subPlan?.items?.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0) ?? 0;
    if (subPlan && subQty > 0) return subQty;
    return fallback;
  };

  const materialRequirements = useMemo(() => {
    if (!viewPlan || !viewProduct || !tempPlanInfo.items) return [];
    type ReqEntry = { materialId: string; nodeId: string; quantity: number; level: number; parentProductId?: string };
    const reqMap: Record<string, ReqEntry> = {};
    const shortageDrivenList: { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }[] = [];

    const addToReqMap = (productId: string, quantity: number, nodeId: string, visited: Set<string>, level: number, parentProductId?: string) => {
      if (quantity <= 0) return;
      if (visited.has(productId)) return;
      const key = `${productId}-${nodeId}`;
      if (!reqMap[key]) reqMap[key] = { materialId: productId, nodeId, quantity: 0, level, parentProductId };
      reqMap[key].quantity += quantity;
      if (level > (reqMap[key].level ?? 0)) reqMap[key].level = level;
      if (parentProductId) reqMap[key].parentProductId = parentProductId;

      const subBom = boms.find(b => b.parentProductId === productId);
      if (!subBom || !subBom.items.length) return;
      visited.add(productId);
      subBom.items.forEach((bomItem: { productId: string; quantity: number }) => {
        shortageDrivenList.push({ productId: bomItem.productId, nodeId, parentProductId: productId, unitPerParent: Number(bomItem.quantity) || 0 });
      });
      visited.delete(productId);
    };

    const stockIndex = new Map<string, number>();
    if (psiRecords && psiRecords.length > 0) {
      for (const r of psiRecords) {
        const pid = r.productId;
        if (!pid) continue;
        const prev = stockIndex.get(pid) || 0;
        if (r.type === 'PURCHASE_BILL') stockIndex.set(pid, prev + (Number(r.quantity) || 0));
        else if (r.type === 'SALES_BILL') stockIndex.set(pid, prev - (Number(r.quantity) || 0));
        else if (r.type === 'STOCKTAKE') stockIndex.set(pid, prev + (Number(r.diffQuantity) || 0));
      }
    }
    const getRealStock = (materialId: string) => stockIndex.get(materialId) || 0;

    tempPlanInfo.items.forEach((item: PlanItem) => {
      const planQty = Number(item.quantity) || 0;
      if (planQty <= 0) return;
      const variantId = item.variantId || `single-${viewProduct.id}`;
      const variantBoms = boms.filter(b => b.parentProductId === viewProduct.id && b.variantId === variantId && b.nodeId);
      variantBoms.forEach(bom => {
        if (bom.nodeId) {
          bom.items.forEach((bomItem: { productId: string; quantity: number }) => {
            addToReqMap(bomItem.productId, Number(bomItem.quantity) * planQty, bom.nodeId!, new Set(), 1);
          });
        }
      });
    });

    type Row = { rowKey: string; materialId: string; materialName: string; materialSku: string; nodeName: string; nodeId: string; totalNeeded: number; stock: number; shortage: number; level: number; parentProductId?: string; parentMaterialName?: string; plannedQty: number };
    const list: Row[] = [];
    Object.values(reqMap).forEach(req => {
      const material = products.find(p => p.id === req.materialId);
      const node = globalNodes.find(n => n.id === req.nodeId);
      const stock = getRealStock(req.materialId);
      const totalNeeded = req.quantity;
      const shortage = Math.max(0, totalNeeded - stock);
      const parentId = req.parentProductId ?? viewProduct.id;
      const rowKey = `${req.materialId}-${req.nodeId}-${parentId}`;
      const plannedQty = getEffectiveQty(req.materialId, req.nodeId, plannedQtyByKey[rowKey] !== undefined ? (plannedQtyByKey[rowKey] ?? 0) : shortage);
      list.push({
        rowKey,
        materialId: req.materialId,
        materialName: material?.name || '未知物料',
        materialSku: material?.sku || '-',
        nodeName: node?.name || '未知工序',
        nodeId: req.nodeId,
        totalNeeded,
        stock,
        shortage,
        level: req.level,
        parentProductId: req.parentProductId,
        plannedQty
      });
    });

    const aggregatePending = (items: { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }[]) => {
      const map: Record<string, { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }> = {};
      items.forEach(({ productId, nodeId, parentProductId, unitPerParent }) => {
        const k = `${productId}-${nodeId}-${parentProductId}`;
        if (!map[k]) map[k] = { productId, nodeId, parentProductId, unitPerParent };
      });
      return Object.values(map);
    };
    let pending = aggregatePending(shortageDrivenList);
    let currentLevel = 2;
    while (pending.length > 0) {
      const nextPending: { productId: string; nodeId: string; parentProductId: string; unitPerParent: number }[] = [];
      pending.forEach(({ productId, nodeId, parentProductId, unitPerParent }) => {
        const parentRow = list.find(r => r.materialId === parentProductId && r.nodeId === nodeId);
        const parentFallback = parentRow ? (plannedQtyByKey[parentRow.rowKey] !== undefined ? (plannedQtyByKey[parentRow.rowKey] ?? 0) : parentRow.shortage) : 0;
        const parentPlannedQty = parentRow ? getEffectiveQty(parentProductId, nodeId, parentFallback) : 0;
        const totalNeeded = parentPlannedQty * unitPerParent;
        const material = products.find(p => p.id === productId);
        const node = globalNodes.find(n => n.id === nodeId);
        const stock = getRealStock(productId);
        const shortage = Math.max(0, totalNeeded - stock);
        const rowKey = `${productId}-${nodeId}-${parentProductId}`;
        const plannedQty = plannedQtyByKey[rowKey] !== undefined ? (plannedQtyByKey[rowKey] ?? 0) : shortage;
        list.push({
          rowKey,
          materialId: productId,
          materialName: material?.name || '未知物料',
          materialSku: material?.sku || '-',
          nodeName: node?.name || '未知工序',
          nodeId,
          totalNeeded,
          stock,
          shortage,
          level: currentLevel,
          parentProductId,
          plannedQty
        });
        const subBom = boms.find(b => b.parentProductId === productId);
        if (subBom?.items?.length) subBom.items.forEach((bomItem: { productId: string; quantity: number }) => nextPending.push({ productId: bomItem.productId, nodeId, parentProductId: productId, unitPerParent: Number(bomItem.quantity) || 0 }));
      });
      pending = aggregatePending(nextPending);
      currentLevel++;
    }

    const level1Rows = list.filter(r => r.level === 1);
    const appendSubtree = (out: Row[], parentId: string, nid: string) => {
      list.filter(r => r.parentProductId === parentId && r.nodeId === nid).forEach(c => { out.push(c); appendSubtree(out, c.materialId, c.nodeId); });
    };
    const sorted: Row[] = [];
    level1Rows.forEach(p => { sorted.push(p); appendSubtree(sorted, p.materialId, p.nodeId); });
    sorted.push(...list.filter(r => !sorted.includes(r)));

    return sorted.map(r => ({
      ...r,
      parentMaterialName: r.parentProductId ? (products.find(p => p.id === r.parentProductId)?.name) : undefined
    }));
  }, [viewPlan, viewProduct, tempPlanInfo.items, boms, products, globalNodes, plannedQtyByKey, plans, effectivePlanForMaterial, psiRecords]);

  const hasProducibleNeedingSubPlan = (materialRequirements as any[]).some((r: any) => {
    const p = products.find(px => px.id === r.materialId);
    const isProducible = (p?.milestoneNodeIds?.length ?? 0) > 0;
    if (!isProducible || (r.plannedQty ?? 0) <= 0) return false;
    const existing = viewPlan ? findSubPlanForMaterial(r.materialId, r.nodeId, viewPlan.id) : null;
    return !existing;
  });

  const hasSubBom = (materialId: string) => boms.some(b => b.parentProductId === materialId);
  const leafMaterials = (materialRequirements as any[]).filter((m: any) => !hasSubBom(m.materialId));
  const leafWithShortage = leafMaterials.filter((m: any) => m.shortage > 0);
  const allPlannedFilled = leafWithShortage.every((m: any) => (m.plannedQty ?? 0) > 0);
  const hasExistingPOs = Object.keys(relatedPOsByMaterial).length > 0;
  const canGeneratePO = leafWithShortage.length > 0 && allPlannedFilled && proposedOrders.length === 0 && !hasExistingPOs;

  // --- Effects ---
  useEffect(() => {
    if (viewProduct) {
      setTempNodeRates(viewProduct.nodeRates ? { ...viewProduct.nodeRates } : {});
    } else {
      setTempNodeRates({});
    }
  }, [viewProduct?.id]);

  useEffect(() => {
    if (viewPlan) {
      setTempAssignments(viewPlan.assignments || {});
      const createdDate = formatPlanCreatedDateList(viewPlan.createdAt || planIdToLocalYmd(viewPlan.id) || localTodayYmd());
      const dueDateOnly = formatPlanDueDateList(viewPlan.dueDate || '');
      setTempPlanInfo({
        customer: viewPlan.customer,
        dueDate: dueDateOnly || viewPlan.dueDate || '',
        createdAt: createdDate,
        items: JSON.parse(JSON.stringify(viewPlan.items || [])),
        customData: viewPlan.customData ? { ...viewPlan.customData } : {}
      });
      setProposedOrders([]);
    }
  }, [viewPlan]);

  useEffect(() => {
    if (planId) {
      void loadItemCodes(planId);
      void loadVirtualBatches(planId);
      setItemCodesVariantFilter('');
      setItemCodesBatchFilter('');
      setVbVariantId('');
      setVbQuantity('');
      setVbBulkBatchSize('');
      setTraceGenMode(null);
    } else {
      setItemCodes([]);
      setItemCodesTotal(0);
      setVirtualBatches([]);
      setVirtualBatchesSubtree([]);
    }
  }, [planId]);

  // --- Callbacks ---
  const handleUpdateDetail = () => {
    if (planId) {
      setIsSaving(true);
      onUpdatePlan?.(planId, {
        assignments: tempAssignments,
        customer: tempPlanInfo.customer,
        dueDate: tempPlanInfo.dueDate,
        createdAt: tempPlanInfo.createdAt,
        items: tempPlanInfo.items,
        customData: tempPlanInfo.customData
      });
      if (viewProduct) {
        const mergedRates: Record<string, number> = { ...(viewProduct.nodeRates || {}) };
        Object.entries(tempNodeRates).forEach(([nodeId, rate]) => {
          const numericRate = typeof rate === 'number' ? rate : parseFloat(String(rate));
          mergedRates[nodeId] = isNaN(numericRate) ? 0 : numericRate;
        });
        onUpdateProduct({ ...viewProduct, nodeRates: mergedRates });
      }
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 300);
    }
  };

  const updateTempAssignment = (nodeId: string, updates: Partial<NodeAssignment>) => {
    setTempAssignments(prev => ({
      ...prev,
      [nodeId]: {
        workerIds: prev[nodeId]?.workerIds || [],
        equipmentIds: prev[nodeId]?.equipmentIds || [],
        ...updates
      }
    }));
  };

  const updateDetailItemQty = (variantId: string | undefined, val: string) => {
    const qty = parseInt(val) || 0;
    setTempPlanInfo(prev => {
      const newItems = prev.items.map(item => {
        if (item.variantId === variantId) return { ...item, quantity: qty };
        return item;
      });
      if (variantId === undefined && newItems.length === 1) {
        newItems[0].quantity = qty;
      }
      return { ...prev, items: newItems };
    });
  };

  const handleCreateSubPlansFromPlannedQty = () => {
    if (!viewPlan || (!onCreateSubPlan && !onCreateSubPlans)) return;
    const producible = (materialRequirements as any[]).filter((r: any) => {
      const p = products.find(px => px.id === r.materialId);
      return (p?.milestoneNodeIds?.length ?? 0) > 0 && r.plannedQty > 0;
    });
    if (producible.length === 0) {
      toast.warning("请先填写可生产物料的计划用量（有工序路线的物料）。");
      return;
    }
    const existingByProductNode = new Map<string, PlanOrder>();
    const addExistingRecursive = (pid: string) => {
      plans.filter((p: PlanOrder) => p.parentPlanId === pid).forEach((p: PlanOrder) => {
        existingByProductNode.set(`${p.productId}-${p.bomNodeId || ''}`, p);
        addExistingRecursive(p.id);
      });
    };
    addExistingRecursive(viewPlan.id);
    const toUpdate: { req: any; existing: PlanOrder }[] = [];
    const toCreate: any[] = [];
    producible.forEach((r: any) => {
      const qty = Math.max(0, Number(r.plannedQty) || 0);
      if (qty <= 0) return;
      const existing = existingByProductNode.get(`${r.materialId}-${r.nodeId || ''}`);
      if (existing) {
        toUpdate.push({ req: r, existing });
      } else {
        toCreate.push(r);
      }
    });
    toUpdate.forEach(({ req, existing }) => {
      onUpdatePlan?.(existing.id, { items: [{ variantId: products.find(p => p.id === req.materialId)?.variants?.[0]?.id, quantity: Math.max(0, Number(req.plannedQty) || 0) }] });
    });
    if (toCreate.length > 0) {
      if (onCreateSubPlans) {
        const sorted = [...toCreate].sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
        onCreateSubPlans({
          planId: viewPlan.id,
          items: sorted.map((r: any) => {
            const parentRow = r.parentProductId ? (materialRequirements as any[]).find((x: any) => x.materialId === r.parentProductId) : null;
            return {
              productId: r.materialId,
              quantity: Math.max(0, Number(r.plannedQty) || 0),
              bomNodeId: r.nodeId,
              parentProductId: r.parentProductId,
              parentNodeId: r.parentProductId ? (parentRow?.nodeId ?? r.nodeId) : undefined
            };
          })
        });
      } else {
        toCreate.forEach((r: any) => {
          onCreateSubPlan?.({ productId: r.materialId, quantity: Math.max(0, Number(r.plannedQty) || 0), planId: viewPlan.id, bomNodeId: r.nodeId });
        });
      }
    }
    toast.success(`已创建/更新 ${toUpdate.length + toCreate.length} 条子计划单。`);
  };

  const handleGenerateProposedOrders = () => {
    if (!canGeneratePO) {
      if (hasExistingPOs) toast.warning("采购订单已创建，不可重复创建。");
      else if (leafWithShortage.length === 0) toast.info("当前库存充裕，无需生成额外采购单。");
      else if (!allPlannedFilled) toast.warning("请先为所有缺料物料填写计划用量。");
      return;
    }

    if (partners.length === 0) {
      toast.error("未找到系统定义的单位，请先在基本信息中创建供应商。");
      return;
    }

    const groupedMap: Record<string, ProposedOrder> = {};

    leafWithShortage.forEach((item: any, index: number) => {
      const materialProduct = products.find(p => p.id === item.materialId);
      const supplierId = materialProduct?.supplierId;
      const supplier = (supplierId && partners.find(p => p.id === supplierId)) || partners[0];
      if (!supplier) return;
      if (!groupedMap[supplier.id]) {
        const orderNumber = nextPsiDocNumber('PO', 'PURCHASE_ORDER', partners, psiRecords || [], supplier.id, supplier.name);
        groupedMap[supplier.id] = { orderNumber, partnerId: supplier.id, partnerName: supplier.name, items: [] };
      }
      const qtyRounded = Math.round(Number(item.plannedQty ?? item.shortage) * 100) / 100;
      groupedMap[supplier.id].items.push({
        id: `item-${Date.now()}-${item.materialId}-${index}`,
        productId: item.materialId,
        materialName: item.materialName,
        materialSku: item.materialSku,
        quantity: qtyRounded,
        suggestedQty: qtyRounded,
        nodeName: item.nodeName
      });
    });

    setProposedOrders(Object.values(groupedMap));
  };

  const handleConfirmAndSaveOrders = async () => {
    if (!onAddPSIRecord) return;
    setIsProcessingPO(true);

    try {
        const existingDocNumbers = new Set(
          (psiRecords || []).filter((r: any) => r.type === 'PURCHASE_ORDER' && r.docNumber).map((r: any) => r.docNumber)
        );
        const getNextPoDocForPartner = (partnerId: string, partnerName: string) => {
          const extra: Array<{ type: string; partnerId?: string; partner?: string; docNumber?: string }> = [];
          let cand = nextPsiDocNumber('PO', 'PURCHASE_ORDER', partners, [...(psiRecords || []), ...extra], partnerId, partnerName);
          while (existingDocNumbers.has(cand)) {
            extra.push({ type: 'PURCHASE_ORDER', partnerId, partner: partnerName, docNumber: cand });
            cand = nextPsiDocNumber('PO', 'PURCHASE_ORDER', partners, [...(psiRecords || []), ...extra], partnerId, partnerName);
          }
          existingDocNumbers.add(cand);
          return cand;
        };

        const allRecs: any[] = [];
        const baseId = Date.now();
        proposedOrders.forEach((order, oi) => {
            const docNum = existingDocNumbers.has(order.orderNumber)
              ? getNextPoDocForPartner(order.partnerId, order.partnerName)
              : order.orderNumber;
            existingDocNumbers.add(docNum);
            order.items.forEach((item, ii) => {
                const qty = item.quantity ?? 0;
                if (qty <= 0) return;
                const prod = products.find(p => p.id === item.productId);
                const purchasePrice = prod?.purchasePrice ?? 0;
                allRecs.push({
                    id: `psi-po-${baseId}-${oi}-${ii}`,
                    docNumber: docNum,
                    type: 'PURCHASE_ORDER',
                    productId: item.productId,
                    quantity: qty,
                    purchasePrice,
                    partner: order.partnerName,
                    partnerId: order.partnerId,
                    warehouseId: 'wh-1',
                    note: `计划单[${viewPlan?.planNumber}]补货需求 | 针对工序:${item.nodeName}`,
                    timestamp: new Date().toISOString(),
                    operator: '系统生成',
            });
        });
        });
        const reversed = allRecs.reverse();
        if (onAddPSIRecordBatch) {
          await onAddPSIRecordBatch(reversed);
        } else {
          for (const r of reversed) await onAddPSIRecord(r);
        }

        setTimeout(() => {
            setIsProcessingPO(false);
            setProposedOrders([]);
            toast.success(`已成功保存 ${proposedOrders.length} 张采购订单，可在进销存模块查看详情。`);
        }, 500);
    } catch (err) {
        setIsProcessingPO(false);
        console.error(err);
    }
  };

  const updateProposedItemQty = (orderNum: string, itemId: string, val: string) => {
    const trimmed = val.trim();
    const qty = trimmed === '' ? undefined : (Number.isFinite(parseFloat(trimmed)) ? Math.round(parseFloat(trimmed) * 100) / 100 : undefined);
    setProposedOrders(prev => prev.map(order => {
        if (order.orderNumber !== orderNum) return order;
        return {
            ...order,
            items: order.items.map(item => item.id === itemId ? { ...item, quantity: qty } : item)
        };
    }));
  };

  const removeProposedOrder = (orderNum: string) => {
    setProposedOrders(prev => prev.filter(o => o.orderNumber !== orderNum));
  };

  const removeProposedOrderItem = (orderNum: string, itemId: string) => {
    setProposedOrders(prev => prev.flatMap(order => {
      if (order.orderNumber !== orderNum) return [order];
      const newItems = order.items.filter(item => item.id !== itemId);
      if (newItems.length === 0) return [];
      return [{ ...order, items: newItems }];
    }));
  };

  const loadItemCodes = useCallback(async (planOrderId: string, page = 1, variantFilter = '', batchFilter = '') => {
    setItemCodesLoading(true);
    try {
      const params: any = { planOrderId, page, pageSize: 100, status: 'ACTIVE' };
      if (variantFilter) params.variantId = variantFilter;
      if (batchFilter) params.batchId = batchFilter;
      const res = await itemCodesApi.list(params);
      setItemCodes(res.items);
      setItemCodesTotal(res.total);
      setItemCodesPage(res.page);
    } catch (e: any) {
      toast.error(e.message || '加载单品码失败');
    } finally {
      setItemCodesLoading(false);
    }
  }, []);

  const handleGenerateItemCodes = useCallback(async (planOrderId: string) => {
    setItemCodesGenerating(true);
    try {
      const res = await itemCodesApi.generate(planOrderId);
      if (res.generated === 0) {
        toast.info('单品码已全部生成，无需补充');
      } else {
        const details = res.byVariant
          .filter(v => v.count > 0)
          .map(v => `${v.variantId ? v.variantId : '总量'}: ${v.count}`)
          .join(', ');
        toast.success(`已生成 ${res.generated} 个单品码${details ? `（${details}）` : ''}`);
      }
      await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
    } catch (e: any) {
      toast.error(e.message || '生成单品码失败');
    } finally {
      setItemCodesGenerating(false);
    }
  }, [loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter]);

  const handleVoidItemCode = useCallback(async (codeId: string, planOrderId: string) => {
    try {
      await itemCodesApi.void(codeId);
      toast.success('单品码已作废');
      await loadItemCodes(planOrderId, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter);
    } catch (e: any) {
      toast.error(e.message || '作废失败');
    }
  }, [loadItemCodes, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter]);

  const loadVirtualBatches = useCallback(async (planOrderId: string) => {
    setVirtualBatchesLoading(true);
    try {
      const subtree = collectSubtreePlanIdsForPlan(planOrderId, plans);
      const results = await Promise.all(
        subtree.map(id => planVirtualBatchesApi.list({ planOrderId: id }).then(res => ({ id, items: res.items }))),
      );
      const byId = new Map<string, PlanVirtualBatch>();
      for (const { items } of results) {
        for (const b of items) byId.set(b.id, b);
      }
      setVirtualBatchesSubtree([...byId.values()]);
      setVirtualBatches(results.find(r => r.id === planOrderId)?.items ?? []);
    } catch (e: any) {
      toast.error(e.message || '加载批次码失败');
    } finally {
      setVirtualBatchesLoading(false);
    }
  }, [plans]);

  const handleCreateVirtualBatch = useCallback(
    async (planOrderId: string, productVariants: ProductVariant[]) => {
      const qty = Math.floor(Number(vbQuantity));
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error('请输入有效的批次件数（≥1）');
        return;
      }
      let variantId: string | null = null;
      if (productVariants.length > 0) {
        if (!vbVariantId) {
          toast.error('请选择规格（颜色/尺码）');
          return;
        }
        variantId = vbVariantId;
      }
      setVbCreating(true);
      try {
        const res = await planVirtualBatchesApi.create({
          planOrderId,
          variantId,
          quantity: qty,
          withItemCodes: traceGenMode === 'batchWithItems',
        });
        const ic = res.itemCodesCreated ?? 0;
        toast.success(
          ic > 0 ? `已生成批次码，并生成 ${ic} 个单品码` : '已生成批次码',
        );
        setVbQuantity('');
        await loadVirtualBatches(planOrderId);
        await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
      } catch (e: any) {
        toast.error(e.message || '生成失败');
      } finally {
        setVbCreating(false);
      }
    },
    [vbQuantity, vbVariantId, traceGenMode, loadVirtualBatches, loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  const handleBulkSplitVirtualBatches = useCallback(
    async (planOrderId: string) => {
      const bs = Math.floor(Number(vbBulkBatchSize));
      if (!Number.isFinite(bs) || bs < 1) {
        toast.error('请输入有效的每批件数（≥1）');
        return;
      }
      setVbBulkSplitting(true);
      try {
        const res = await planVirtualBatchesApi.bulkSplitAll({
          planOrderId,
          batchSize: bs,
          withItemCodes: traceGenMode === 'batchWithItems',
        });
        const vCount = res.byVariant.length;
        const totalQty = res.byVariant.reduce((s, x) => s + x.totalQty, 0);
        const ic = res.itemCodesCreated ?? 0;
        toast.success(
          ic > 0
            ? `已生成 ${res.totalCreated} 个批次码（${vCount} 种规格），合计 ${totalQty} 件；同时生成 ${ic} 个单品码`
            : `已生成 ${res.totalCreated} 个批次码（${vCount} 种规格），合计 ${totalQty} 件，每批最多 ${res.batchSize} 件`,
        );
        await loadVirtualBatches(planOrderId);
        await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
      } catch (e: any) {
        toast.error(e.message || '批量拆批失败');
      } finally {
        setVbBulkSplitting(false);
      }
    },
    [vbBulkBatchSize, traceGenMode, loadVirtualBatches, loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  const handleVoidVirtualBatch = useCallback(
    async (id: string, planOrderId: string) => {
      try {
        await planVirtualBatchesApi.void(id);
        toast.success('批次码已作废（关联单品码已同步作废）');
        await loadVirtualBatches(planOrderId);
        await loadItemCodes(planOrderId, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter);
      } catch (e: any) {
        toast.error(e.message || '作废失败');
      }
    },
    [loadVirtualBatches, loadItemCodes, itemCodesPage, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  const openItemCodePrintPicker = useCallback(
    (plan: PlanOrder, variantFilter: string, batchFilter: string) => {
      if (!labelPrintPickerTemplates.length) {
        toast.error('暂无标签打印模版，请在「表单配置 → 打印模版」中配置标签白名单或取消白名单限制');
        return;
      }
      setItemCodePrintPlan(plan);
      setItemCodePrintOpen(true);
      setItemCodePrintLoading(true);
      const params: Record<string, string | number> = {
        planOrderId: plan.id,
        page: 1,
        pageSize: 500,
        status: 'ACTIVE',
      };
      if (variantFilter) params.variantId = variantFilter;
      if (batchFilter) params.batchId = batchFilter;
      void itemCodesApi
        .list(params as any)
        .then(res => {
          setItemCodePrintCodes(res.items);
          setItemCodePrintSelectedIds(new Set(res.items.map(c => c.id)));
        })
        .catch(() => toast.error('加载单品码失败'))
        .finally(() => setItemCodePrintLoading(false));
    },
    [labelPrintPickerTemplates],
  );

  // --- Guard: bail out if plan or product not found ---
  if (!viewPlan || !viewProduct) return null;

  // --- Render ---
  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}></div>
        <div className="relative bg-white w-full max-w-6xl rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh]">

          <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-50">
             <div className="flex items-center gap-5">
                {viewProduct.imageUrl ? (
                  <button type="button" onClick={() => onImagePreview(viewProduct.imageUrl)} className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none">
                    <img loading="lazy" decoding="async" src={viewProduct.imageUrl} alt={viewProduct.name} className="w-full h-full object-cover block" />
                  </button>
                ) : (
                  <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100 flex-shrink-0"><Info className="w-7 h-7" /></div>
                )}
                <div>
                     <h2 className="text-2xl font-black text-slate-900 tracking-tight">查看生产计划</h2>
                  <p className="text-sm font-bold text-slate-400 mt-0.5 tracking-tighter uppercase flex flex-wrap items-center gap-2">
                    {viewPlan.planNumber} — 关联：{viewProduct.name}
                  </p>
                </div>
             </div>
             <button onClick={onClose} className="p-3 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-all"><X className="w-7 h-7" /></button>
          </div>

          {/* 类目锚点小标签 */}
          <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-50/80 border-b border-slate-100 shrink-0">
            <button type="button" onClick={() => sectionBasicRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
              基本信息
            </button>
            <button type="button" onClick={() => sectionQtyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
              数量明细
            </button>
            <button type="button" onClick={() => sectionProcessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
              工序任务
            </button>
            <button type="button" onClick={() => sectionMaterialRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
              生产用料
            </button>
            <button type="button" onClick={() => sectionTraceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
              <span className="inline-flex items-center gap-1"><QrCode className="w-3.5 h-3.5" />追溯码</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-12 bg-slate-50/30">
             {/* 1. 计划基础信息 */}
             <div ref={sectionBasicRef} className="space-y-4 scroll-mt-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">1. 计划基础信息</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                  {planFormSettings.standardFields.find(f => f.id === 'customer')?.showInDetail !== false && productionLinkMode !== 'product' && (
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">计划客户（合作单位）</label>
                      <SearchablePartnerSelect
                        options={partners}
                        categories={partnerCategories}
                        value={tempPlanInfo.customer}
                        onChange={customerName => setTempPlanInfo({ ...tempPlanInfo, customer: customerName })}
                        placeholder="搜索并选择合作单位..."
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">交期截止日期</label>
                    <div className="relative">
                      <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input type="date" value={tempPlanInfo.dueDate || ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-11 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">添加日期</label>
                    <div className="relative">
                      <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input type="date" value={tempPlanInfo.createdAt || ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-11 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  {planFormSettings.customFields.filter(f => f.showInDetail).map(cf => (
                    <div key={cf.id} className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{cf.label}</label>
                      {cf.type === 'date' ? (
                        <input type="date" value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                      ) : cf.type === 'number' ? (
                        <input type="number" value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                      ) : cf.type === 'select' ? (
                        <select value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none">
                          <option value="">请选择</option>
                          {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={tempPlanInfo.customData?.[cf.id] ?? ''} onChange={e => setTempPlanInfo({ ...tempPlanInfo, customData: { ...tempPlanInfo.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
                      )}
                    </div>
                  ))}
                </div>
             </div>

             {/* 2. 规格数量矩阵 */}
             <div ref={sectionQtyRef} className="space-y-4 scroll-mt-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">2. 生产数量明细录入 (可编辑)</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                  {tempPlanInfo.items && tempPlanInfo.items.length > 0 && tempPlanInfo.items[0].variantId ? (
                      <div className="space-y-4">
                          {(Object.entries(tempPlanInfo.items.reduce((acc: Record<string, any[]>, item) => {
                              const v = viewProduct.variants.find(vx => vx.id === item.variantId);
                              if (v) { if (!acc[v.colorId]) acc[v.colorId] = []; acc[v.colorId].push({ ...item, variant: v }); }
                              return acc;
                          }, {})) as [string, any[]][]).map(([colorId, colorItems]) => {
                              const color = dictionaries.colors.find(c => c.id === colorId);
                              return (
                                  <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                      <div className="flex items-center gap-3 w-40 shrink-0">
                                          <div className="w-6 h-6 rounded-full border border-slate-200" style={{backgroundColor: color?.value}}></div>
                                          <span className="text-sm font-black text-slate-700">{color?.name}</span>
                                      </div>
                                      <div className="flex-1 flex flex-wrap gap-4">
                                          {colorItems.map((item: any, idx: number) => {
                                              const size = dictionaries.sizes.find(s => s.id === item.variant.sizeId);
                                              return (
                                                  <div key={idx} className="flex flex-col gap-1 w-20">
                                                      <span className="text-[10px] font-black text-slate-400 uppercase text-center">{size?.name}</span>
                                                      <input type="number" value={item.quantity} onChange={e => updateDetailItemQty(item.variantId, e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                                                  </div>
                                              )
                                          })}
                                      </div>
                                  </div>
                              )
                          })}
                      </div>
                  ) : (
                      <div className="max-w-xs space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase">总量 ({getUnitName(viewPlan.productId)})</label>
                           <input type="number" value={tempPlanInfo.items?.[0]?.quantity || 0} onChange={e => updateDetailItemQty(undefined, e.target.value)} className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-2xl font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                  )}
                </div>
             </div>

             {/* 3. 工序任务 */}
             <div ref={sectionProcessRef} className="space-y-4 scroll-mt-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">3. 工序任务</h3>
                </div>
                <div className="space-y-4">
                   {productNodes.map((node, idx) => {
                     const eligibleWorkers = workers.filter(w => w.assignedMilestoneIds?.includes(node.id));
                     const isAssigned = (tempAssignments[node.id] as NodeAssignment)?.workerIds?.length > 0;
                     const enableWorker = node.enableAssignment !== false && node.enableWorkerAssignment !== false;
                     const enableEquipment = node.enableAssignment !== false && node.enableEquipmentAssignment !== false;
                     const canAssign = enableWorker || enableEquipment;
                     return (
                       <div key={node.id} className={`flex flex-col md:flex-row md:items-center gap-4 p-5 rounded-[28px] border transition-all ${isAssigned ? 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-50' : 'bg-white/60 border-slate-200'}`}>
                          <div className="flex items-center gap-4 md:w-56 shrink-0">
                             <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black shadow-inner ${isAssigned ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                             <div>
                               <h4 className="text-sm font-black text-slate-800">{node.name}</h4>
                               <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                 {node.hasBOM ? '需配置BOM' : '标准工序'}
                                 {canAssign ? (enableWorker && enableEquipment ? ' · 工人/设备派工' : enableWorker ? ' · 工人派工' : ' · 设备派工') : ' · 不派工'}
                               </p>
                          </div>
                          </div>
                          <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                             <div className="flex items-center gap-4 shrink-0">
                               {node.enablePieceRate && (
                               <div className="flex items-center gap-2 w-[9rem]">
                                 <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap w-6">工价</span>
                                 <input
                                   type="number"
                                   min={0}
                                   step={0.01}
                                   placeholder="0"
                                   value={tempNodeRates[node.id] ?? ''}
                                   onChange={e => {
                                     const v = parseFloat(e.target.value);
                                     setTempNodeRates(prev => ({ ...prev, [node.id]: isNaN(v) ? 0 : v }));
                                   }}
                                   className="w-20 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                 />
                                 <span className="text-[9px] text-slate-400 whitespace-nowrap">元/件</span>
                               </div>
                               )}
                               {canAssign && (
                                 <div className="flex flex-wrap items-center gap-4 md:gap-4 border-l border-slate-200 pl-4 md:pl-5 min-w-[480px] flex-1">
                                   {enableWorker && (
                                     <div className="min-w-[440px] w-full max-w-[640px]">
                                       <SearchableMultiSelectWithProcessTabs
                                         variant="compact"
                                         icon={UserPlus}
                                         placeholder="分派负责人..."
                                         processNodes={globalNodes}
                                         currentNodeId={node.id}
                                         options={workers.map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                                         selectedIds={(tempAssignments[node.id] as NodeAssignment)?.workerIds || []}
                                         onChange={(ids) => updateTempAssignment(node.id, { workerIds: ids })}
                                       />
                                     </div>
                                   )}
                                   {enableEquipment && (
                                     <div className="min-w-[440px] w-full max-w-[640px]">
                                       <SearchableMultiSelectWithProcessTabs
                                         variant="compact"
                                         icon={Wrench}
                                         placeholder="分派设备..."
                                         processNodes={globalNodes}
                                         currentNodeId={node.id}
                                         options={equipment.map(e => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                                         selectedIds={(tempAssignments[node.id] as NodeAssignment)?.equipmentIds || []}
                                         onChange={(ids) => updateTempAssignment(node.id, { equipmentIds: ids })}
                                       />
                                     </div>
                                   )}
                                 </div>
                               )}
                             </div>
                          </div>
                       </div>
                     )
                   })}
                </div>
             </div>

             {/* 4. 计划生产用料清单 (BOM 汇总) */}
             <div ref={sectionMaterialRef} className="space-y-4 pb-20 scroll-mt-4">
                <div className="flex flex-col gap-4 ml-2">
                   <div className="flex items-center justify-between flex-wrap gap-4">
                   <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-indigo-600" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">4. 计划生产用料清单 (BOM 汇总)</h3>
                   </div>
                      <div className="flex items-center gap-2">
                         {onCreateSubPlan && (
                           <button
                             onClick={handleCreateSubPlansFromPlannedQty}
                             disabled={!hasProducibleNeedingSubPlan}
                             className="bg-amber-500 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 transition-all flex items-center gap-2 disabled:opacity-50"
                             title={!hasProducibleNeedingSubPlan ? '可生产物料均已生成计划单，或请先填写计划用量' : undefined}
                           >
                             <Plus className="w-3.5 h-3.5" />
                             创建子工单
                           </button>
                         )}
                   <button
                      onClick={handleGenerateProposedOrders}
                           disabled={!canGeneratePO || materialRequirements.length === 0}
                      className="bg-slate-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-black transition-all flex items-center gap-2 shadow-lg disabled:opacity-50"
                           title={hasExistingPOs ? '采购订单已创建，不可重复创建' : !allPlannedFilled && leafWithShortage.length > 0 ? '请先为所有缺料物料填写计划用量' : undefined}
                    >
                       <ShoppingCart className="w-3.5 h-3.5" />
                           创建采购订单
                    </button>
                      </div>
                   </div>
                </div>

                <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="bg-slate-50/50 border-b border-slate-100">
                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料名称 / SKU</th>
                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">理论总需量</th>
                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">库存</th>
                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">计算缺料数</th>
                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center min-w-[140px]">计划用量</th>
                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center min-w-[220px]">状态</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                         {(materialRequirements as any[]).length === 0 ? (
                            <tr><td colSpan={6} className="px-8 py-10 text-center text-slate-300 italic text-sm">尚未配置 BOM 详情</td></tr>
                         ) : (
                            (materialRequirements as any[]).map((req: any, idx: number) => (
                               <tr
                                  key={idx}
                                  className={`hover:bg-slate-50/30 transition-colors group ${(req.level ?? 1) >= 2 ? 'bg-slate-50/40' : ''}`}
                               >
                                  <td className={`py-4 pr-8 ${(req.level ?? 1) === 1 ? 'pl-8' : ''}`} style={(req.level ?? 1) >= 2 ? { paddingLeft: `${32 + ((req.level ?? 2) - 1) * 20}px` } : undefined}>
                                     <div className="flex flex-col gap-0.5">
                                        {(req.level ?? 1) >= 2 && (
                                           <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                                              <span className="inline-block w-4 border-l-2 border-indigo-300 border-b-0 rounded-b-none shrink-0" aria-hidden />
                                              {req.level === 2 ? '二级' : req.level === 3 ? '三级' : `${req.level}级`} BOM
                                           </span>
                                        )}
                                        <div className="flex flex-col gap-0.5">
                                          <span className="text-sm font-bold text-slate-800">
                                            {(() => {
                                              const hasSku = req.materialSku && String(req.materialSku).trim() && req.materialSku !== '-';
                                              const skuPart = hasSku ? `（${req.materialSku}）` : '';
                                              return `${req.materialName}${skuPart}`;
                                            })()}
                                          </span>
                                          {(() => {
                                            const p = products.find(x => x.id === req.materialId);
                                            const cat = categories.find(c => c.id === p?.categoryId);
                                            const catName = cat?.name ?? '';
                                            return catName ? <span className="text-[10px] font-medium text-slate-400">{catName}</span> : null;
                                          })()}
                                        </div>
                                     </div>
                                  </td>
                                  <td className="px-8 py-4">
                                     <span className="text-sm font-black text-slate-600 whitespace-nowrap">{Number(req.totalNeeded).toFixed(2)} {getUnitName(req.materialId)}</span>
                                  </td>
                                  <td className="px-8 py-4 text-center">
                                     <span className={`text-sm font-black whitespace-nowrap ${req.stock < req.totalNeeded ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {Number(req.stock).toFixed(2)} {getUnitName(req.materialId)}
                                     </span>
                                  </td>
                                  <td className="px-8 py-4 text-right">
                                     {req.shortage > 0 ? (
                                        <span className="text-sm font-black text-indigo-600 whitespace-nowrap">
                                          {Number(req.shortage).toFixed(2)} {getUnitName(req.materialId)}
                                           </span>
                                     ) : (
                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap">库存充沛</span>
                                     )}
                                  </td>
                                  <td className="px-8 py-4">
                                     <div className="flex items-center justify-center gap-1 flex-nowrap">
                                        {(() => {
                                          const subPlan = viewPlan ? findSubPlanForMaterial(req.materialId, req.nodeId, viewPlan.id) : null;
                                          const subPlanQty = subPlan?.items?.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0) ?? 0;
                                          const hasSubPlan = !!(subPlan && subPlanQty > 0);
                                          if (hasSubPlan) {
                                            return (
                                              <span className="inline-block bg-slate-100 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-700 text-right whitespace-nowrap">{Number(subPlanQty).toFixed(2)} {getUnitName(req.materialId)}</span>
                                            );
                                          }
                                          const poList = relatedPOsByMaterial[req.materialId] || [];
                                          const hasPO = poList.length > 0;
                                          const poQty = poList.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
                                          if (hasPO) {
                                            return (
                                              <span className="inline-block bg-slate-100 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-700 text-right whitespace-nowrap">{Number(poQty).toFixed(2)} {getUnitName(req.materialId)}</span>
                                            );
                                          }
                                          return (
                                            <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                              <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                placeholder="—"
                                                value={(() => {
                                                  const raw = req.rowKey in plannedQtyByKey ? plannedQtyByKey[req.rowKey] : req.plannedQty;
                                                  if (raw == null || raw === 0) return '';
                                                  const n = Number(raw);
                                                  if (isNaN(n) || n <= 0) return '';
                                                  const rounded = Math.round(n * 100) / 100;
                                                  return String(Number(rounded.toFixed(2)));
                                                })()}
                                                onChange={e => {
                                                  const raw = e.target.value.trim();
                                                  if (raw === '') {
                                                    setPlannedQtyByKey(prev => ({ ...prev, [req.rowKey]: null }));
                                                    return;
                                                  }
                                                  const v = parseFloat(raw);
                                                  const qty = isNaN(v) || v < 0 ? 0 : Math.round(v * 100) / 100;
                                                  setPlannedQtyByKey(prev => ({ ...prev, [req.rowKey]: qty }));
                                                }}
                                                className="w-24 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none shrink-0"
                                              />
                                              <span className="text-[10px] font-bold text-slate-400 shrink-0">{getUnitName(req.materialId)}</span>
                                            </span>
                                          );
                                        })()}
                                        </div>
                                  </td>
                                  <td className="px-8 py-4">
                                     {(() => {
                                        const isProducible = (products.find(p => p.id === req.materialId)?.milestoneNodeIds?.length ?? 0) > 0;
                                        const subPlan = viewPlan ? findSubPlanForMaterial(req.materialId, req.nodeId, viewPlan.id) : null;
                                        const hasSubPlan = !!subPlan;
                                        if (isProducible) {
                                           if (hasSubPlan) {
                                              return <span className="text-emerald-600 text-[10px] font-bold uppercase whitespace-nowrap">已生成生产计划</span>;
                                           }
                                           return <span className="text-slate-300 text-[10px] font-bold uppercase whitespace-nowrap">未生成计划单</span>;
                                        }
                                        const progress = getInboundProgress(req.materialId);
                                        if (progress) {
                                           const unit = getUnitName(req.materialId);
                                           const received = progress.received;
                                           const ordered = progress.ordered;
                                           const pct = ordered > 0 ? Math.min(1, received / ordered) : 0;
                                           const isOverReceived = received > ordered;
                                           return (
                                              <button
                                                 type="button"
                                                 onClick={() => setRelatedPOsMaterialId(req.materialId)}
                                                 className="w-full min-w-[200px] inline-flex flex-col items-stretch gap-1.5 px-3 py-2 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-indigo-50/80 hover:border-indigo-100 transition-colors cursor-pointer text-left"
                                                 title="点击查看相关采购订单"
                                              >
                                                 <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
                                                    {isOverReceived ? (
                                                       <>
                                                          <div className="h-full bg-emerald-500" style={{ width: `${(ordered / received) * 100}%` }} />
                                                          <div className="h-full bg-rose-500" style={{ width: `${((received - ordered) / received) * 100}%` }} />
                                                       </>
                                                    ) : (
                                                       <div
                                                          className={`h-full rounded-full transition-all ${pct >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                          style={{ width: `${Math.min(100, pct * 100)}%` }}
                                                       />
                                                    )}
                                                 </div>
                                                 <span className="text-[10px] font-bold text-slate-700 whitespace-nowrap">
                                                    {isOverReceived
                                                       ? `已收 ${Number(received).toFixed(2)} / ${Number(ordered).toFixed(2)} ${unit}（已超收）`
                                                       : pct >= 1
                                                          ? `已完成`
                                                          : `已收 ${Number(received).toFixed(2)} / ${Number(ordered).toFixed(2)} ${unit}`}
                                                 </span>
                                              </button>
                                           );
                                        }
                                        return (
                                           <span className="text-slate-300 text-[10px] font-bold uppercase whitespace-nowrap">未生成采购单</span>
                                        );
                                     })()}
                                  </td>
                               </tr>
                            ))
                         )}
                      </tbody>
                   </table>
                </div>

                {proposedOrders.length > 0 && (
                  <div className="mt-12 space-y-8 animate-in slide-in-from-bottom-6">
                     <div className="flex items-center justify-between ml-2">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 border border-amber-100 shadow-sm"><FileSpreadsheet className="w-5 h-5" /></div>
                           <div>
                              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">待确认采购订单预览 ({proposedOrders.length} 张单据)</h3>
                              <p className="text-[10px] text-slate-400 font-bold italic mt-0.5">已按单位归类，点击保存正式同步至采购模块</p>
                           </div>
                        </div>
                        <div className="flex gap-3">
                           <button onClick={() => setProposedOrders([])} className="px-4 py-2 text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase">清空待办</button>
                           <button
                              onClick={handleConfirmAndSaveOrders}
                              disabled={isProcessingPO}
                              className="bg-emerald-600 text-white px-8 py-2.5 rounded-xl text-xs font-black shadow-xl shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all"
                           >
                              {isProcessingPO ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              确认并保存采购订单
                           </button>
                        </div>
                     </div>

                     <div className="space-y-4">
                        {proposedOrders.map(order => (
                          <div key={order.orderNumber} className="bg-white border-2 border-slate-100 p-8 rounded-[40px] shadow-sm relative group hover:border-indigo-400 transition-all overflow-hidden">
                             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-50 pb-4">
                                <div className="flex items-center gap-5">
                                   <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg">
                                      <Building2 className="w-5 h-5 mb-0.5" />
                                      <span className="text-[8px] font-black uppercase opacity-60">PRT</span>
                                   </div>
                                   <div>
                                      <div className="flex items-center gap-3">
                                         <h4 className="text-lg font-black text-slate-800">{order.partnerName}</h4>
                                         <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                                            {order.orderNumber}
                                         </span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest italic flex items-center gap-2">
                                         <ListOrdered className="w-3 h-3" /> 包含明细：{order.items.length} 项
                                      </p>
                                   </div>
                                </div>
                                <button
                                    onClick={() => removeProposedOrder(order.orderNumber)}
                                    className="flex items-center gap-2 px-4 py-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all text-[11px] font-black uppercase"
                                 >
                                    <Trash2 className="w-4 h-4" /> 移除单据
                                 </button>
                             </div>

                             <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                   <thead>
                                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                         <th className="pb-4 pl-2">物料档案 / SKU</th>
                                         <th className="pb-4 text-center">对应生产环节</th>
                                         <th className="pb-4 text-center">系统缺料数</th>
                                         <th className="pb-4 text-right">拟采购数量 (可编辑)</th>
                                         <th className="pb-4 pr-2 w-16 text-center">操作</th>
                                      </tr>
                                   </thead>
                                   <tbody className="divide-y divide-slate-50">
                                      {order.items.map(item => (
                                        <tr key={item.id} className="group/item">
                                           <td className="py-4 pl-2">
                                              <div className="flex flex-col">
                                                 <span className="text-sm font-bold text-slate-700">{item.materialName}</span>
                                                 <span className="text-[9px] font-bold text-slate-300 uppercase">SKU: {item.materialSku}</span>
                                              </div>
                                           </td>
                                           <td className="py-4 text-center">
                                              <span className="text-[10px] font-black text-indigo-400 uppercase">{item.nodeName}</span>
                                           </td>
                                           <td className="py-4 text-center">
                                              <span className="text-xs font-bold text-slate-400">{Number(item.suggestedQty).toFixed(2)} {getUnitName(item.productId)}</span>
                                           </td>
                                           <td className="py-4 text-right">
                                              <div className="flex items-center justify-end gap-1">
                                                    <input
                                                       type="number"
                                                    min={0}
                                                    step="0.01"
                                                    placeholder="—"
                                                    value={(() => {
                                                       const raw = item.quantity;
                                                       if (raw == null || raw === 0) return '';
                                                       const n = Number(raw);
                                                       if (isNaN(n) || n <= 0) return '';
                                                       const rounded = Math.round(n * 100) / 100;
                                                       return String(Number(rounded.toFixed(2)));
                                                    })()}
                                                    onChange={e => {
                                                       const raw = e.target.value.trim();
                                                       if (raw === '') {
                                                          updateProposedItemQty(order.orderNumber, item.id, '');
                                                          return;
                                                       }
                                                       const v = parseFloat(raw);
                                                       const qty = isNaN(v) || v < 0 ? 0 : Math.round(v * 100) / 100;
                                                       updateProposedItemQty(order.orderNumber, item.id, String(qty));
                                                    }}
                                                    className="w-24 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                                 />
                                                 <span className="text-[10px] font-bold text-slate-400">{getUnitName(item.productId)}</span>
                                              </div>
                                           </td>
                                           <td className="py-4 pr-2 text-center">
                                              <button
                                                 type="button"
                                                 onClick={() => removeProposedOrderItem(order.orderNumber, item.id)}
                                                 className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                 title="删除该物料"
                                              >
                                                 <Trash2 className="w-4 h-4" />
                                              </button>
                                           </td>
                                        </tr>
                                      ))}
                                   </tbody>
                                </table>
                             </div>

                             <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-4 text-[10px] font-bold text-amber-500">
                                   <AlertCircle className="w-3.5 h-3.5" />
                                   <span>请确认各明细项数量是否满足最小包装量</span>
                                </div>
                                <div className="flex items-center gap-2">
                                   <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">单据预估总量：</span>
                                   <span className="text-lg font-black text-slate-900">{Number(order.items.reduce((s, i) => s + (i.quantity ?? 0), 0)).toFixed(2)} {getUnitName(viewPlan.productId)}</span>
                                </div>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
             </div>

             {/* 5. 追溯码 */}
             <div ref={sectionTraceRef} className="space-y-4 scroll-mt-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                  <QrCode className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">5. 追溯码</h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">生成类型</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setTraceGenMode('item')}
                        className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'item' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                      >
                        <span className="text-xs font-black text-slate-800 block">单品码</span>
                        <span className="text-[10px] text-slate-500 mt-1 block leading-snug">一物一码，不经过批次</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTraceGenMode('batch')}
                        className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'batch' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                      >
                        <span className="text-xs font-black text-slate-800 block">批次码</span>
                        <span className="text-[10px] text-slate-500 mt-1 block leading-snug">按批二维码，不自动建单品码</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTraceGenMode('batchWithItems')}
                        className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'batchWithItems' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
                      >
                        <span className="text-xs font-black text-slate-800 block">单品码+批次码</span>
                        <span className="text-[10px] text-slate-500 mt-1 block leading-snug">建批时同步生成关联单品码</span>
                      </button>
                    </div>
                    {traceGenMode === null && (
                      <p className="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 leading-relaxed">
                        请先选择要生成的码类型，再填写参数并点击生成。
                      </p>
                    )}
                  </div>

                  {(traceGenMode === 'item' || traceGenMode === 'batchWithItems') && (
                    <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                      <p className="text-xs text-slate-500 max-w-xl">
                        {traceGenMode === 'batchWithItems' ? (
                          <>
                            除批次同步生成的关联单品码外，还可在此<strong className="text-slate-700">单独补充</strong>不绑定批次的单品码；下方列表含<strong className="text-slate-700">批次码</strong>列便于对照。
                          </>
                        ) : (
                          <>为计划内每件货物生成全局唯一单品码（不绑定批次），可用于标签打印与扫码识别。</>
                        )}
                      </p>
                      <button
                        type="button"
                        disabled={itemCodesGenerating}
                        onClick={() => viewPlan && handleGenerateItemCodes(viewPlan.id)}
                        className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-100 shrink-0"
                      >
                        {itemCodesGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                        {itemCodesGenerating ? '生成中...' : '生成单品码'}
                      </button>
                    </div>
                  )}

                  {(traceGenMode === 'batch' || traceGenMode === 'batchWithItems') && (
                    <div className="space-y-6">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        一个二维码对应<strong className="text-slate-700">固定件数</strong>。额度按<strong className="text-slate-600">本计划及子计划、同产品</strong>的计划明细汇总；有效批次占用额度，作废不占。标签请使用打印模版中的批次码占位符。
                        {traceGenMode === 'batchWithItems' ? (
                          <> 当前类型下，每批会<strong className="text-slate-600">同步创建 N 条可单独扫码的单品码</strong>并与批次关联；作废批次将级联作废这些单品码。</>
                        ) : (
                          <> 当前类型下<strong className="text-slate-600">不会</strong>随批次自动创建单品码。</>
                        )}
                      </p>

                      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-5 space-y-4 shadow-sm shadow-indigo-500/5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                            <Layers className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <p className="text-[11px] font-black text-indigo-950 uppercase tracking-wider">快速批量</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">对计划树里出现的<strong className="text-slate-600">每一种规格</strong>分别拆满剩余额度，无需先选规格。</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                          <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">每批件数</label>
                            <input
                              type="number"
                              min={1}
                              value={vbBulkBatchSize}
                              onChange={e => setVbBulkBatchSize(e.target.value)}
                              placeholder={vbBulkAllSummary && vbBulkAllSummary.totalRemaining > 0 ? '如 50' : '—'}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={
                              vbBulkSplitting ||
                              !vbBulkAllSummary ||
                              vbBulkAllSummary.variantCount === 0 ||
                              vbBulkAllSummary.totalRemaining <= 0
                            }
                            onClick={() => viewPlan && handleBulkSplitVirtualBatches(viewPlan.id)}
                            className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            {vbBulkSplitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                            {vbBulkSplitting ? '拆批中...' : '一键拆满全部规格'}
                          </button>
                          {vbBulkAllSummary && vbBulkAllSummary.variantCount > 0 ? (
                            <p className="text-[10px] text-slate-500 sm:max-w-xs sm:pb-0.5">
                              {vbBulkAllSummary.totalRemaining > 0 ? (
                                <>全规格合计还可分配约 <strong className="text-slate-700">{vbBulkAllSummary.totalRemaining}</strong> 件（{vbBulkAllSummary.variantCount} 种规格有明细）。</>
                              ) : (
                                <>当前各规格剩余额度已为 0，无法继续批量拆批。</>
                              )}
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-400 sm:pb-0.5">暂无计划明细，无法拆批。</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-white">
                            <Boxes className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <p className="text-[11px] font-black text-slate-800 uppercase tracking-wider">单条生成</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">任选一种规格，自定义本批次件数（受该规格剩余额度限制）。</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          {viewProduct.variants.length > 0 ? (
                            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[220px]">
                              <label className="text-[10px] font-black text-slate-400 uppercase">规格</label>
                              <select
                                value={vbVariantId}
                                onChange={e => setVbVariantId(e.target.value)}
                                className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                              >
                                <option value="">请选择</option>
                                {viewProduct.variants.map(v => {
                                  const color = dictionaries.colors.find(c => c.id === v.colorId);
                                  const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                  const label = [color?.name, size?.name].filter(Boolean).join('-') || v.skuSuffix || v.id;
                                  return (
                                    <option key={v.id} value={v.id}>{label}</option>
                                  );
                                })}
                              </select>
                            </div>
                          ) : null}
                          <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">件数</label>
                            <input
                              type="number"
                              min={1}
                              max={vbQuotaInfo?.kind === 'ok' && vbQuotaInfo.remaining > 0 ? vbQuotaInfo.remaining : undefined}
                              value={vbQuantity}
                              onChange={e => setVbQuantity(e.target.value)}
                              placeholder={
                                vbQuotaInfo?.kind === 'needVariant'
                                  ? '请先选规格'
                                  : vbQuotaInfo?.kind === 'ok'
                                    ? vbQuotaInfo.remaining > 0
                                      ? `最多 ${vbQuotaInfo.remaining}`
                                      : '已满（0）'
                                    : '如 100'
                              }
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={vbCreating}
                            onClick={() => viewPlan && handleCreateVirtualBatch(viewPlan.id, viewProduct.variants)}
                            className="shrink-0 border-2 border-slate-300 bg-white text-slate-800 px-5 py-2.5 rounded-xl text-xs font-bold hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
                          >
                            {vbCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Boxes className="w-3.5 h-3.5" />}
                            {vbCreating ? '生成中...' : '生成批次码'}
                          </button>
                        </div>
                        {vbQuotaInfo?.kind === 'ok' && vbQuotaInfo.maxFromPlan > 0 && (
                          <p className="text-[10px] text-slate-400 leading-tight">
                            当前所选规格：计划量 {vbQuotaInfo.maxFromPlan}，已用批次 {vbQuotaInfo.allocated}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {(traceGenMode === 'item' || traceGenMode === 'batchWithItems') && (
                  <div ref={traceItemListRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-indigo-600 shrink-0" />
                        单品码一览
                      </h4>
                      {viewPlan && itemCodesTotal > 0 && (
                        <button
                          type="button"
                          onClick={() => openItemCodePrintPicker(viewPlan, itemCodesVariantFilter, itemCodesBatchFilter)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          打印单品码
                        </button>
                      )}
                    </div>

                    {viewProduct.variants.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-400 uppercase">筛选规格：</span>
                        <button
                          type="button"
                          onClick={() => {
                            setItemCodesVariantFilter('');
                            setItemCodesBatchFilter('');
                            viewPlan && loadItemCodes(viewPlan.id, 1, '', '');
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${!itemCodesVariantFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          全部
                        </button>
                        {viewProduct.variants.map(v => {
                          const color = dictionaries.colors.find(c => c.id === v.colorId);
                          const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                          const label = [color?.name, size?.name].filter(Boolean).join('-') || v.skuSuffix || v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setItemCodesBatchFilter('');
                                setItemCodesVariantFilter(v.id);
                                viewPlan && loadItemCodes(viewPlan.id, 1, v.id, '');
                              }}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${itemCodesVariantFilter === v.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {itemCodesBatchFilter && viewPlan && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">批次筛选</span>
                        <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                          仅显示所选批次的单品码
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setItemCodesBatchFilter('');
                            viewPlan && loadItemCodes(viewPlan.id, 1, itemCodesVariantFilter, '');
                          }}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          清除批次筛选
                        </button>
                      </div>
                    )}

                    {itemCodesLoading ? (
                      <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
                    ) : itemCodes.length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-400">
                        暂无单品码
                        {traceGenMode === 'item'
                          ? '，点击上方「生成单品码」开始'
                          : '；可点击上方「生成单品码」补充，或通过下方批次生成时自动创建关联单品码'}
                      </div>
                    ) : (
                      <>
                        <div className="text-xs text-slate-500">
                          共 <span className="font-black text-indigo-600">{itemCodesTotal}</span> 个单品码
                          {itemCodesTotal > 100 && `（第 ${itemCodesPage} 页）`}
                        </div>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">编号</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">
                                  {traceGenMode === 'batchWithItems' ? '批次码' : '所属批次'}
                                </th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">状态</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">生成时间</th>
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase text-right">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {itemCodes.map(code => {
                                const variant = viewProduct.variants.find(v => v.id === code.variantId);
                                const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                                const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                                const variantLabel = [color?.name, size?.name].filter(Boolean).join('-') || variant?.skuSuffix || '—';
                                return (
                                  <tr key={code.id} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5 text-xs font-bold text-slate-800 break-all">
                                      {formatItemCodeSerialLabel(viewPlan.planNumber, code.serialNo)}
                                    </td>
                                    <td
                                      className={`px-4 py-2.5 text-xs break-all ${traceGenMode === 'batchWithItems' && code.batch?.sequenceNo != null ? 'cursor-pointer text-indigo-600 hover:underline' : 'text-slate-600'}`}
                                      onClick={() => {
                                        if (!code.batch?.sequenceNo || traceGenMode !== 'batchWithItems') return;
                                        traceBatchListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      }}
                                      title={traceGenMode === 'batchWithItems' && code.batch?.sequenceNo != null ? '点击查看下方批次码一览' : undefined}
                                    >
                                      {code.batch?.sequenceNo != null
                                        ? formatBatchSerialLabel(viewPlan.planNumber, code.batch.sequenceNo)
                                        : '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">{variantLabel}</td>
                                    <td className="px-4 py-2.5">
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${code.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                        {code.status === 'ACTIVE' ? '正常' : '已作废'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-[10px] text-slate-400">{new Date(code.createdAt).toLocaleDateString('zh-CN')}</td>
                                    <td className="px-4 py-2.5 text-right">
                                      {code.status === 'ACTIVE' && (
                                        <button
                                          type="button"
                                          onClick={() => viewPlan && handleVoidItemCode(code.id, viewPlan.id)}
                                          className="text-[10px] font-bold text-rose-400 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                                        >
                                          <Ban className="w-3 h-3 inline mr-0.5" />作废
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {itemCodesTotal > 100 && (
                          <div className="flex items-center justify-center gap-2 pt-2">
                            <button
                              type="button"
                              disabled={itemCodesPage <= 1}
                              onClick={() =>
                                viewPlan &&
                                loadItemCodes(viewPlan.id, itemCodesPage - 1, itemCodesVariantFilter, itemCodesBatchFilter)
                              }
                              className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                            >
                              上一页
                            </button>
                            <span className="text-xs text-slate-500">第 {itemCodesPage} 页 / 共 {Math.ceil(itemCodesTotal / 100)} 页</span>
                            <button
                              type="button"
                              disabled={itemCodesPage >= Math.ceil(itemCodesTotal / 100)}
                              onClick={() =>
                                viewPlan &&
                                loadItemCodes(viewPlan.id, itemCodesPage + 1, itemCodesVariantFilter, itemCodesBatchFilter)
                              }
                              className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                            >
                              下一页
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  )}

                  {(traceGenMode === 'batch' || traceGenMode === 'batchWithItems') && (
                  <div ref={traceBatchListRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                      批次码一览
                    </h4>
                    {virtualBatchesLoading ? (
                      <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
                    ) : virtualBatches.length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-400">暂无批次码</div>
                    ) : (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase min-w-[7rem]">编号</th>
                              <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">规格</th>
                              <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">件数</th>
                              {traceGenMode === 'batchWithItems' && (
                                <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase w-16">单品码</th>
                              )}
                              <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">状态</th>
                              <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">创建时间</th>
                              <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {virtualBatches.map(b => {
                              const variant = b.variantId ? viewProduct.variants.find(v => v.id === b.variantId) : null;
                              const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                              const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                              const variantLabel = variant
                                ? [color?.name, size?.name].filter(Boolean).join('-') || variant.skuSuffix || '—'
                                : '默认';
                              return (
                                <tr key={b.id} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-2.5 text-xs font-black text-slate-700 break-all" title={b.sequenceNo != null ? String(b.sequenceNo) : undefined}>
                                    {b.sequenceNo != null ? formatBatchSerialLabel(viewPlan.planNumber, b.sequenceNo) : '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-slate-600">{variantLabel}</td>
                                  <td className="px-4 py-2.5 text-xs font-black text-indigo-600">{b.quantity}</td>
                                  {traceGenMode === 'batchWithItems' && (
                                    <td className="px-4 py-2.5 text-xs">
                                      {(b.itemCodeCount ?? 0) > 0 ? (
                                        <button
                                          type="button"
                                          className="font-black text-indigo-600 hover:underline"
                                          onClick={() => {
                                            if (!viewPlan) return;
                                            setItemCodesBatchFilter(b.id);
                                            traceItemListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            void loadItemCodes(viewPlan.id, 1, itemCodesVariantFilter, b.id);
                                          }}
                                        >
                                          {b.itemCodeCount}
                                        </button>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                  )}
                                  <td className="px-4 py-2.5">
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${b.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                      {b.status === 'ACTIVE' ? '正常' : '已作废'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-[10px] text-slate-400">{new Date(b.createdAt).toLocaleString('zh-CN')}</td>
                                  <td className="px-4 py-2.5 text-right space-x-2">
                                    {b.status === 'ACTIVE' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => viewPlan && setBatchPrintModal({ plan: viewPlan, batch: b })}
                                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                                        >
                                          <Printer className="w-3 h-3 inline mr-0.5" />打印标签
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => viewPlan && handleVoidVirtualBatch(b.id, viewPlan.id)}
                                          className="text-[10px] font-bold text-rose-400 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                                        >
                                          <Ban className="w-3 h-3 inline mr-0.5" />作废
                                        </button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  )}
                </div>
             </div>


          </div>

          <div className="px-10 py-6 bg-white/80 backdrop-blur-lg border-t border-slate-100 flex justify-between items-center sticky bottom-0">
             <div className="flex flex-col">
                <p className="text-xs font-bold text-slate-500">当前操作：<span className="text-indigo-600 font-black">计划资料整体更新</span></p>
                <p className="text-[10px] text-slate-400 mt-1 italic font-medium">※ 点击保存将同步更新客户、交期、规格数量及派发方案。</p>
             </div>
             <div className="flex items-center gap-4">
               <button onClick={onClose} className="px-8 py-3 text-sm font-black text-slate-400 hover:text-slate-800 transition-colors uppercase">放弃修改</button>
               {onDeletePlan && (
                 <button
                   onClick={() => {
                     void confirm({ message: '确定要删除该计划单吗？', danger: true }).then((ok) => {
                       if (!ok) return;
                       onDeletePlan(viewPlan.id);
                       onClose();
                     });
                   }}
                   className="px-6 py-3 text-sm font-black text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-2xl border border-rose-200 flex items-center gap-2"
                 >
                   <Trash2 className="w-4 h-4" /> 删除
                 </button>
               )}
               {viewPlan.status !== PlanStatus.CONVERTED && !viewPlan.parentPlanId && (
                 <>
                   {(parentToSubPlans.get(viewPlan.id)?.length ?? 0) === 0 && (
                     <button onClick={() => { onRequestSplit(viewPlan); onClose(); }} className="px-6 py-3 text-sm font-black text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-2xl border border-amber-200 flex items-center gap-2">
                       <Split className="w-4 h-4" /> 拆分计划
                     </button>
                   )}
                   <button onClick={() => { onConvertToOrder(viewPlan.id); onClose(); }} className="px-6 py-3 text-sm font-black text-white bg-slate-900 hover:bg-black rounded-2xl flex items-center gap-2">
                     <ArrowRightCircle className="w-4 h-4" /> 下达工单
                   </button>
                 </>
               )}
               {viewPlan.status === PlanStatus.CONVERTED && !viewPlan.parentPlanId && hasUnconvertedSubPlans(viewPlan.id) && (
                 <button onClick={() => { onConvertToOrder(viewPlan.id); onClose(); }} className="px-6 py-3 text-sm font-black text-white bg-amber-500 hover:bg-amber-600 rounded-2xl flex items-center gap-2">
                   <ArrowRightCircle className="w-4 h-4" /> 补充下达子工单
                 </button>
               )}
               <button
                  onClick={handleUpdateDetail}
                  disabled={isSaving}
                  className="bg-indigo-600 text-white px-12 py-3.5 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
               >
                 {isSaving ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                 保存并更新计划内容
               </button>
             </div>
          </div>
        </div>
      </div>

      {/* 点击「已生成采购单」后展示该物料关联的采购订单 */}
      {relatedPOsMaterialId && (() => {
        const list = relatedPOsByMaterial[relatedPOsMaterialId] || [];
        const materialName = products.find(p => p.id === relatedPOsMaterialId)?.name || '未知物料';
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setRelatedPOsMaterialId(null)} />
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                  相关采购订单 — {materialName}
                </h3>
                <button type="button" onClick={() => setRelatedPOsMaterialId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                {list.length === 0 ? (
                  <p className="px-6 py-8 text-center text-slate-400 text-sm">暂无记录</p>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">供应商</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">订购数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已收</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {list.map((r: any, i: number) => {
                        const received = receivedByOrderLine[`${r.docNumber}::${r.id}`] ?? 0;
                        const ordered = r.quantity ?? 0;
                        return (
                        <tr key={r.id || i} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-xs font-bold text-slate-700">{r.docNumber ?? '—'}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-700">{r.partner ?? '—'}</td>
                          <td className="px-4 py-3 text-xs font-black text-indigo-600 text-right">{Number(ordered).toFixed(2)} {relatedPOsMaterialId ? getUnitName(relatedPOsMaterialId) : 'PCS'}</td>
                          <td className="px-4 py-3 text-xs font-bold text-right">{Number(received).toFixed(2)} <span className="text-slate-400 font-normal">/ {Number(ordered).toFixed(2)}</span></td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
                <button type="button" onClick={() => setRelatedPOsMaterialId(null)} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">关闭</button>
              </div>
            </div>
    </div>
  );
      })()}

      {/* 计划详情：单品码标签打印 */}
      {itemCodePrintOpen && itemCodePrintPlan && (() => {
        const pickerPlan = itemCodePrintPlan;
        const pickerProduct = products.find(p => p.id === pickerPlan.productId);

        const handleItemCodeTemplatePick = (t: PrintTemplate) => {
          const selectedCodes = itemCodePrintCodes.filter(c => itemCodePrintSelectedIds.has(c.id));
          if (selectedCodes.length === 0) {
            toast.error('请至少勾选一个单品码');
            return;
          }
          const orders2 = (orders ?? []).filter((o: any) => o.planOrderId === pickerPlan.id);
          const ctx2: ItemCodePrintContext = {
            planNumber: pickerPlan.planNumber,
            productName: pickerProduct?.name ?? '',
            orderNumbers: orders2.map((o: any) => o.orderNumber),
            variants: pickerProduct?.variants ?? [],
          };
          const baseUrl = window.location.origin;
          const rows = buildPrintListRowsFromItemCodes(selectedCodes, ctx2, dictionaries, baseUrl);
          onPrintRun({
            template: t,
            plan: { ...pickerPlan, _printListRows: rows, _labelPerRow: true } as any,
          });
          setItemCodePrintOpen(false);
          setItemCodePrintPlan(null);
          setItemCodePrintSelectedIds(new Set());
        };

        return (
        <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() => {
              setItemCodePrintOpen(false);
              setItemCodePrintPlan(null);
              setItemCodePrintSelectedIds(new Set());
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
                <h3 className="text-base font-black text-slate-900">打印单品码标签</h3>
                <p className="mt-0.5 text-xs text-slate-500">计划单 {pickerPlan.planNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setItemCodePrintOpen(false);
                  setItemCodePrintPlan(null);
                  setItemCodePrintSelectedIds(new Set());
                }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 max-h-48 overflow-y-auto">
              {itemCodePrintLoading ? (
                <div className="text-center py-4 text-xs text-slate-400">加载中...</div>
              ) : itemCodePrintCodes.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">暂无单品码，请先生成单品码</div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-400">
                    已加载 {itemCodePrintCodes.length} 条（最多 500 条；超出时请用规格/批次筛选后分批打印）
                  </p>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded text-indigo-600"
                        checked={itemCodePrintSelectedIds.size === itemCodePrintCodes.length && itemCodePrintCodes.length > 0}
                        onChange={e => {
                          setItemCodePrintSelectedIds(
                            e.target.checked ? new Set(itemCodePrintCodes.map(c => c.id)) : new Set(),
                          );
                        }}
                      />
                      全选（{itemCodePrintSelectedIds.size}/{itemCodePrintCodes.length}）
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {itemCodePrintCodes.map(code => {
                      const variant = pickerProduct?.variants.find(v => v.id === code.variantId);
                      const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                      const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                      const vLabel = [color?.name, size?.name].filter(Boolean).join('-') || variant?.skuSuffix || '';
                      return (
                        <label
                          key={code.id}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${itemCodePrintSelectedIds.has(code.id) ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3 rounded text-indigo-600"
                            checked={itemCodePrintSelectedIds.has(code.id)}
                            onChange={e => {
                              const next = new Set(itemCodePrintSelectedIds);
                              if (e.target.checked) next.add(code.id);
                              else next.delete(code.id);
                              setItemCodePrintSelectedIds(next);
                            }}
                          />
                          {formatItemCodeSerialLabel(pickerPlan.planNumber, code.serialNo)}
                          {vLabel ? ` · ${vLabel}` : ''}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <ul className="max-h-[min(40vh,280px)] divide-y divide-slate-100 overflow-y-auto p-2">
              {labelPrintPickerTemplates.length === 0 ? (
                <li className="text-center py-6 text-xs text-slate-400">
                  暂无标签打印模版，请在「表单配置 → 打印模版」中配置标签白名单
                </li>
              ) : labelPrintPickerTemplates.map(t => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handleItemCodeTemplatePick(t)}
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

      {/* 批次码：选择标签模版 */}
      {batchPrintModal && (() => {
        const { plan, batch } = batchPrintModal;
        const prod = products.find(p => p.id === plan.productId);
        const variant = batch.variantId ? prod?.variants.find(v => v.id === batch.variantId) : null;
        const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
        const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
        const variantLabel = variant
          ? [color?.name, size?.name].filter(Boolean).join('-') || variant.skuSuffix || ''
          : '';
        const pickTemplate = (t: PrintTemplate) => {
          const orders2 = (orders ?? []).filter((o: ProductionOrder) => o.planOrderId === plan.id);
          const vbRow = buildVirtualBatchPrintRow(
            batch,
            {
              planNumber: plan.planNumber,
              productName: prod?.name ?? '',
              sku: prod?.sku ?? '',
              orderNumbers: orders2.map(o => o.orderNumber).filter(Boolean).join(', '),
              variantLabel,
              colorName: color?.name ?? '',
              sizeName: size?.name ?? '',
            },
            window.location.origin,
          );
          onPrintRun({ template: t, plan: { ...plan, _virtualBatch: vbRow } as any });
          setBatchPrintModal(null);
        };
        return (
          <div className="fixed inset-0 z-[73] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              aria-label="关闭"
              onClick={() => setBatchPrintModal(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">打印批次标签</h3>
                  <p className="mt-0.5 text-xs text-slate-500 break-all">
                    {batch.sequenceNo != null ? formatBatchSerialLabel(plan.planNumber, batch.sequenceNo) : '—'} · {batch.quantity} 件{variantLabel ? ` · ${variantLabel}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchPrintModal(null)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ul className="max-h-[min(40vh,280px)] divide-y divide-slate-100 overflow-y-auto p-2">
                {labelPrintPickerTemplates.length === 0 ? (
                  <li className="text-center py-6 text-xs text-slate-400">
                    暂无标签打印模版，请在「表单配置 → 打印模版」中配置标签白名单
                  </li>
                ) : (
                  labelPrintPickerTemplates.map(t => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => pickTemplate(t)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold text-slate-800 hover:bg-indigo-50"
                      >
                        <span className="min-w-0 truncate">{t.name}</span>
                        <span className="shrink-0 text-xs font-bold text-indigo-600">
                          {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        );
      })()}
    </>
  );
};

export default PlanDetailPanel;
