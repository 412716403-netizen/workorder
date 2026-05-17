
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Layers,
  Clock,
  ArrowRightCircle,
  Save,
  FileText,
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
  Printer,
  QrCode,
  RefreshCw,
  Wrench,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
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
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
} from '../../types';
import { itemCodesApi, psi } from '../../services/api';
import { useQuery } from '@tanstack/react-query';
import { CustomerSelect } from '../../components/CustomerSelect';
import { SearchableMultiSelectWithProcessTabs } from '../../components/SearchableMultiSelect';
import { formatPlanOrderCreatedAtForList, localTodayYmd, planIdToLocalYmd, toLocalDateYmd } from '../../utils/localDateTime';
// Phase 3.D follow-up：`nextPsiDocNumber` / `getLastPurchaseUnitPrice` 不再依赖前端全量扫表，
// 改为调后端 `psi.nextDocNumber` / `psi.lastPurchasePrices`。
import { PlanPrintTemplateManageDialog } from '../../components/plan-print/PlanPrintTemplateManageDialog';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { isEquipmentAssignmentEnabled, isWorkerAssignmentEnabled } from '../../utils/nodeAssignmentFlags';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import PlanTraceSection from './PlanTraceSection';
import PlanPrintOverlays from './PlanPrintOverlays';
import PlanPoSupplierAssignModal, {
  type PlanPoSupplierAssignRow,
  type PlanPoSupplierOverride,
} from './PlanPoSupplierAssignModal';
import {
  formStandardControlClass,
  formStandardLabelClass,
  outlineToolbarButtonClass,
  primaryToolbarButtonClass,
} from '../../styles/uiDensity';
import {
  formatPlanCreatedDateList,
  effectiveSupplierIdFromProduct,
  purchaseOrderRecordMatchesPlanPanel,
} from '../../utils/planDetailHelpers';

// formatPlanCreatedDateList / effectiveSupplierIdFromProduct / purchaseOrderRecordMatchesPlanPanel
// 已抽离至 utils/planDetailHelpers.ts

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
    /** 与保存至采购订单的 purchasePrice 一致；可预览中微调 */
    purchasePrice: number;
  }[];
}

// 见 utils/planDetailHelpers.ts: purchaseOrderRecordMatchesPlanPanel

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
  planFormSettings: PlanFormSettings;
  orders?: ProductionOrder[];
  productionLinkMode?: 'order' | 'product';

  // Callbacks
  onUpdatePlan?: (planId: string, updates: Partial<PlanOrder>) => void;
  /** 计划交期变更时同步更新关联工单 `dueDate`（需工单编辑权限） */
  onUpdateOrder?: (orderId: string, updates: Partial<ProductionOrder>) => void | Promise<void>;
  onDeletePlan?: (planId: string) => void;
  onConvertToOrder: (planId: string) => void;
  onUpdateProduct: (product: Product) => Promise<Product | null>;
  onAddPSIRecord?: (record: any) => void;
  onAddPSIRecordBatch?: (records: any[]) => Promise<void>;
  onCreateSubPlan?: (params: { productId: string; quantity: number; planId: string; bomNodeId: string }) => void;
  onCreateSubPlans?: (params: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId: string; parentProductId?: string; parentNodeId?: string }> }) => void;

  // Shared UI actions
  onImagePreview: (url: string) => void;
  onFilePreview: (url: string, type: 'image' | 'pdf') => void;
  onPrintRun: (run: { template: PrintTemplate; plan: PlanOrder } | null) => void;
  labelPrintPickerTemplates: PrintTemplate[];
  labelPrintPickerHasWhitelist: boolean;
  /** 打开计划单表单配置 → 打印模版（标签打印） */
  onOpenLabelPrintConfig: () => void;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  /** 将模版 id 合并进计划单「标签可选模版」白名单（仅当已处于限制模式时生效） */
  onMergeLabelPrintWhitelist: (templateId: string) => void;
  onUpdatePlanFormSettings: (settings: PlanFormSettings) => void | Promise<void>;
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
  planFormSettings,
  orders = [],
  productionLinkMode = 'order',
  onUpdatePlan,
  onUpdateOrder,
  onDeletePlan,
  onConvertToOrder,
  onUpdateProduct,
  onAddPSIRecord,
  onAddPSIRecordBatch,
  onCreateSubPlan,
  onCreateSubPlans,
  onImagePreview,
  onFilePreview,
  onPrintRun,
  labelPrintPickerTemplates,
  labelPrintPickerHasWhitelist,
  onOpenLabelPrintConfig,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  onMergeLabelPrintWhitelist,
  onUpdatePlanFormSettings,
}) => {
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const confirm = useConfirm();
  const [labelPrintTemplateManageOpen, setLabelPrintTemplateManageOpen] = useState(false);

  // --- State ---
  const [tempAssignments, setTempAssignments] = useState<Record<string, NodeAssignment>>({});
  const [tempPlanInfo, setTempPlanInfo] = useState<{
    customer: string;
    createdAt: string;
    dueDate: string;
    items: PlanItem[];
    customData?: Record<string, any>;
  }>({ customer: '', createdAt: '', dueDate: '', items: [] });

  const [isSaving, setIsSaving] = useState(false);
  const [tempNodeRates, setTempNodeRates] = useState<Record<string, number>>({});
  const [proposedOrders, setProposedOrders] = useState<ProposedOrder[]>([]);
  const [isProcessingPO, setIsProcessingPO] = useState(false);
  const [supplierAssignModalOpen, setSupplierAssignModalOpen] = useState(false);
  const [supplierAssignRows, setSupplierAssignRows] = useState<PlanPoSupplierAssignRow[]>([]);
  /** 保存 PO 后需把 `supplierId` 写回产品档案的物料 id（生成预览时无有效档案供应商） */
  const poSupplierBackfillMaterialIdsRef = useRef<Set<string>>(new Set());
  const [plannedQtyByKey, setPlannedQtyByKey] = useState<Record<string, number | null>>({});
  const [relatedPOsMaterialId, setRelatedPOsMaterialId] = useState<string | null>(null);
  const [virtualBatches, setVirtualBatches] = useState<PlanVirtualBatch[]>([]);

  /** BOM 库存列：与后端 `/psi/stock` 汇总一致（含生产入库、调拨等），非前端流水简单加减 */
  const [serverStockMap, setServerStockMap] = useState<Record<string, number>>({});
  const [serverStockStatus, setServerStockStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [itemCodePrintOpen, setItemCodePrintOpen] = useState(false);
  const [itemCodePrintPlan, setItemCodePrintPlan] = useState<PlanOrder | null>(null);
  const [itemCodePrintCodes, setItemCodePrintCodes] = useState<ItemCode[]>([]);
  const [itemCodePrintLoading, setItemCodePrintLoading] = useState(false);
  const [batchPrintModal, setBatchPrintModal] = useState<{ plan: PlanOrder; batch: PlanVirtualBatch } | null>(null);
  const [itemCodeSinglePrintModal, setItemCodeSinglePrintModal] = useState<{ plan: PlanOrder; code: ItemCode } | null>(
    null,
  );
  const [batchBulkPrintOpen, setBatchBulkPrintOpen] = useState(false);

  const sectionBasicRef = useRef<HTMLDivElement>(null);
  const sectionQtyRef = useRef<HTMLDivElement>(null);
  const sectionProcessRef = useRef<HTMLDivElement>(null);
  const sectionMaterialRef = useRef<HTMLDivElement>(null);
  const sectionTraceRef = useRef<HTMLDivElement>(null);

  // --- Derived data ---
  const viewPlan = plans.find(p => p.id === planId);
  const viewProduct = products.find(p => p.id === viewPlan?.productId);
  /** 已下达工单：计划行已转 CONVERTED，或已有 planOrderId 指向本计划的工单 */
  const planWorkOrdersDispatched = useMemo(() => {
    if (!viewPlan) return false;
    if (viewPlan.status === PlanStatus.CONVERTED) return true;
    return orders.some(o => o.planOrderId === viewPlan.id);
  }, [viewPlan, orders]);
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

  /**
   * Phase 3.D follow-up：替代 `AppDataContext.psiRecords` 全量扫描。
   * 调 `GET /api/psi/plan-related?planId=...&planNumbers=...` 后端按 customData.sourcePlanId /
   * customData.sourcePlanNumber / note "计划单[..]" 一次性筛出本计划相关的 PO + 关联 PB。
   * 返回数据用于：`materialIdsWithPO` / `relatedPOsByMaterial` / `receivedByOrderLine`。
   *
   * 当 mutation（新建 / 删除 PO/PB）发生时，外部调用方可通过 `queryClient.invalidateQueries({ queryKey: ['plan.relatedPsi'] })`
   * 触发本地刷新；本组件落库 PO 后会主动 refetch。
   */
  const planRelatedPsiQuery = useQuery({
    queryKey: ['plan.relatedPsi', planId, planNumbersForPO.join(',')],
    queryFn: () => psi.planRelated({ planId, planNumbers: planNumbersForPO }),
    enabled: Boolean(planId) && (planNumbersForPO.length > 0 || Boolean(planId)),
    staleTime: 15_000,
  });
  const planRelatedPurchaseOrders = useMemo<any[]>(
    () => (planRelatedPsiQuery.isSuccess && Array.isArray(planRelatedPsiQuery.data?.purchaseOrders)
      ? (planRelatedPsiQuery.data!.purchaseOrders as any[])
      : []),
    [planRelatedPsiQuery.isSuccess, planRelatedPsiQuery.data],
  );
  const planRelatedPurchaseBills = useMemo<any[]>(
    () => (planRelatedPsiQuery.isSuccess && Array.isArray(planRelatedPsiQuery.data?.purchaseBills)
      ? (planRelatedPsiQuery.data!.purchaseBills as any[])
      : []),
    [planRelatedPsiQuery.isSuccess, planRelatedPsiQuery.data],
  );

  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const loadServerStock = useCallback(async () => {
    setServerStockStatus('loading');
    try {
      const rows = (await psi.getStock()) as unknown;
      const m: Record<string, number> = {};
      if (Array.isArray(rows)) {
        for (const e of rows as Array<{ productId?: string; stock?: unknown }>) {
          const pid = e?.productId;
          if (!pid) continue;
          m[pid] = Math.max(0, Number(e.stock) || 0);
        }
      }
      setServerStockMap(m);
      setServerStockStatus('ready');
    } catch (err: unknown) {
      setServerStockMap({});
      setServerStockStatus('error');
      const msg = err instanceof Error ? err.message : '加载库存失败';
      toast.error(msg);
    }
  }, []);

  // 切计划单或本计划相关 PSI 更新时重新拉服务端库存（取代旧的 [psiRecords?.length] 副作用）
  useEffect(() => {
    void loadServerStock();
  }, [planId, planRelatedPsiQuery.dataUpdatedAt, loadServerStock]);

  const stockReady = serverStockStatus === 'ready';
  const getServerStockQty = (materialId: string): number | null =>
    stockReady ? (serverStockMap[materialId] ?? 0) : null;

  const materialIdsWithPO = useMemo(() => {
    if (!planNumbersForPO.length || !viewPlan || !planRelatedPurchaseOrders.length) return new Set<string>();
    const ids = new Set<string>();
    planRelatedPurchaseOrders.forEach((r: any) => {
      if (!purchaseOrderRecordMatchesPlanPanel(r, planNumbersForPO, viewPlan)) return;
      ids.add(r.productId);
    });
    return ids;
  }, [planNumbersForPO, planRelatedPurchaseOrders, viewPlan]);

  const relatedPOsByMaterial = useMemo(() => {
    if (!planNumbersForPO.length || !viewPlan || !planRelatedPurchaseOrders.length) return {} as Record<string, any[]>;
    const map: Record<string, any[]> = {};
    planRelatedPurchaseOrders.forEach((r: any) => {
      if (!purchaseOrderRecordMatchesPlanPanel(r, planNumbersForPO, viewPlan)) return;
      if (!map[r.productId]) map[r.productId] = [];
      map[r.productId].push(r);
    });
    return map;
  }, [planNumbersForPO, planRelatedPurchaseOrders, viewPlan]);

  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    planRelatedPurchaseBills
      .filter((r: any) => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId)
      .forEach((r: any) => {
        const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
        map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
      });
    return map;
  }, [planRelatedPurchaseBills]);

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
      const stockQty = getServerStockQty(req.materialId);
      const stock = stockQty ?? 0;
      const totalNeeded = req.quantity;
      const shortage = stockQty === null ? 0 : Math.max(0, totalNeeded - stockQty);
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
        const stockQty = getServerStockQty(productId);
        const stock = stockQty ?? 0;
        const shortage = stockQty === null ? 0 : Math.max(0, totalNeeded - stockQty);
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
  }, [viewPlan, viewProduct, tempPlanInfo.items, boms, products, globalNodes, plannedQtyByKey, plans, effectivePlanForMaterial, stockReady, serverStockMap]);

  const hasProducibleNeedingSubPlan = (materialRequirements as any[]).some((r: any) => {
    const p = products.find(px => px.id === r.materialId);
    const isProducible = (p?.milestoneNodeIds?.length ?? 0) > 0;
    if (!isProducible || (r.plannedQty ?? 0) <= 0) return false;
    const existing = viewPlan ? findSubPlanForMaterial(r.materialId, r.nodeId, viewPlan.id) : null;
    return !existing;
  });

  const canUseSubPlanActions = Boolean(onCreateSubPlan || onCreateSubPlans);
  const showCreateSubPlanButton = canUseSubPlanActions && hasProducibleNeedingSubPlan;

  const hasSubBom = (materialId: string) => boms.some(b => b.parentProductId === materialId);
  const leafMaterials = (materialRequirements as any[]).filter((m: any) => !hasSubBom(m.materialId));
  const leafWithShortage = leafMaterials.filter((m: any) => m.shortage > 0);
  const allPlannedFilled = leafWithShortage.every((m: any) => (m.plannedQty ?? 0) > 0);
  const hasExistingPOs = Object.keys(relatedPOsByMaterial).length > 0;
  const canGeneratePO = leafWithShortage.length > 0 && allPlannedFilled && proposedOrders.length === 0 && !hasExistingPOs;

  /**
   * Phase 3.D follow-up：构建建议采购单。
   * - 单号生成从前端扫表改为后端 `psi.nextDocNumber`（每个 supplier 一次）。
   * - 单价上次取价从前端扫表改为后端 `psi.lastPurchasePrices`（批量一次）。
   * 入参不变；改造为 async，调用方需 await。
   */
  const buildProposedOrdersFromLeaves = useCallback(
    async (overrides: Record<string, PlanPoSupplierOverride>) => {
      const groupedMap: Record<string, ProposedOrder> = {};
      const backfill = new Set<string>();

      // 1) 先把每个 leaf 解析到 supplier；并收集要批量查上次单价的 pairs
      type StagedItem = {
        supplierId: string;
        supplierName: string;
        item: any;
        index: number;
        qtyRounded: number;
      };
      const staged: StagedItem[] = [];
      const pricePairs: Array<{ partnerId: string; partnerName: string; productId: string }> = [];

      leafWithShortage.forEach((item: any, index: number) => {
        const materialProduct = products.find(p => p.id === item.materialId);
        const effective = effectiveSupplierIdFromProduct(materialProduct, partners);
        if (!effective) backfill.add(item.materialId);

        const supplierIdResolved = effective || overrides[item.materialId]?.partnerId;
        const supplier = supplierIdResolved ? partners.find(p => p.id === supplierIdResolved) : undefined;
        if (!supplier) return;

        const qtyRounded = Math.round(Number(item.plannedQty ?? item.shortage) * 100) / 100;
        staged.push({ supplierId: supplier.id, supplierName: supplier.name, item, index, qtyRounded });
        pricePairs.push({ partnerId: supplier.id, partnerName: supplier.name, productId: item.materialId });
      });

      poSupplierBackfillMaterialIdsRef.current = backfill;

      if (staged.length === 0) {
        setProposedOrders([]);
        return;
      }

      // 2) 批量查上次采购单价
      let priceMap: Map<string, number | null>;
      try {
        const prices = await psi.lastPurchasePrices(pricePairs);
        priceMap = new Map<string, number | null>();
        pricePairs.forEach((p, i) => {
          priceMap.set(`${p.partnerId}|${p.productId}`, prices[i]?.price ?? null);
        });
      } catch {
        priceMap = new Map();
      }

      // 3) 每个独立 supplier 分一次后端取号
      const uniqueSuppliers = Array.from(
        new Map(staged.map(s => [s.supplierId, { id: s.supplierId, name: s.supplierName }])).values(),
      );
      const supplierDocMap = new Map<string, string>();
      try {
        const docs = await Promise.all(
          uniqueSuppliers.map(s =>
            psi.nextDocNumber({
              prefix: 'PO',
              psiType: 'PURCHASE_ORDER',
              partnerId: s.id,
              partnerName: s.name,
            }),
          ),
        );
        uniqueSuppliers.forEach((s, i) => supplierDocMap.set(s.id, docs[i]?.docNumber ?? ''));
      } catch (e) {
        // 取号失败时退回最简形态（缺合作单位 segment 时后端会返回 0000），不阻断本地预览
        // eslint-disable-next-line no-console
        console.warn('[PlanDetailPanel] nextDocNumber batch failed', e);
      }

      // 4) 组装 proposedOrders
      for (const s of staged) {
        if (!groupedMap[s.supplierId]) {
          const orderNumber = supplierDocMap.get(s.supplierId) || `PO-0000-001`;
          groupedMap[s.supplierId] = {
            orderNumber,
            partnerId: s.supplierId,
            partnerName: s.supplierName,
            items: [],
          };
        }
        const prod = products.find(p => p.id === s.item.materialId);
        const lastPrice = priceMap.get(`${s.supplierId}|${s.item.materialId}`) ?? null;
        const purchasePrice = lastPrice ?? prod?.purchasePrice ?? 0;
        groupedMap[s.supplierId].items.push({
          id: `item-${Date.now()}-${s.item.materialId}-${s.index}`,
          productId: s.item.materialId,
          materialName: s.item.materialName,
          materialSku: s.item.materialSku,
          quantity: s.qtyRounded,
          suggestedQty: s.qtyRounded,
          nodeName: s.item.nodeName,
          purchasePrice,
        });
      }

      setProposedOrders(Object.values(groupedMap));
    },
    [leafWithShortage, products, partners],
  );

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
      setTempPlanInfo({
        customer: viewPlan.customer,
        createdAt: createdDate,
        dueDate: viewPlan.dueDate
          ? toLocalDateYmd(viewPlan.dueDate) || String(viewPlan.dueDate).trim().slice(0, 10)
          : '',
        items: JSON.parse(JSON.stringify(viewPlan.items || [])),
        customData: viewPlan.customData ? { ...viewPlan.customData } : {}
      });
      setProposedOrders([]);
      poSupplierBackfillMaterialIdsRef.current = new Set();
    }
  }, [viewPlan]);

  useEffect(() => {
    setVirtualBatches([]);
  }, [planId]);

  /** 表单可关闭「追溯码」区块；若本计划已有 ACTIVE 单品码，仍展示以免看不到已生成追溯码 */
  const [planHasActiveItemCodes, setPlanHasActiveItemCodes] = useState(false);
  const probePlanActiveItemCodes = useCallback(async () => {
    if (!planId) {
      setPlanHasActiveItemCodes(false);
      return;
    }
    try {
      const res = await itemCodesApi.list({
        planOrderId: planId,
        page: 1,
        pageSize: 1,
        status: 'ACTIVE',
      });
      setPlanHasActiveItemCodes(res.total > 0);
    } catch {
      setPlanHasActiveItemCodes(false);
    }
  }, [planId]);

  useEffect(() => {
    void probePlanActiveItemCodes();
  }, [probePlanActiveItemCodes]);

  // --- Callbacks ---
  const handleUpdateDetail = async () => {
    if (!planId || !viewPlan) return;
    setIsSaving(true);
    try {
      const showDelivery = planFormSettings.listDisplay?.showDeliveryDate === true;
      const nextDueStr = tempPlanInfo.dueDate.trim() ? tempPlanInfo.dueDate.trim() : undefined;
      const prevDueNorm = viewPlan.dueDate
        ? toLocalDateYmd(viewPlan.dueDate) || String(viewPlan.dueDate).trim().slice(0, 10)
        : '';
      const nextDueNorm = nextDueStr ?? '';
      const dueChanged = showDelivery && nextDueNorm !== prevDueNorm;

      const planPayload: Partial<PlanOrder> = {
        assignments: tempAssignments,
        customer: tempPlanInfo.customer,
        createdAt: tempPlanInfo.createdAt,
        ...(showDelivery ? { dueDate: nextDueStr } : {}),
        ...(!planWorkOrdersDispatched ? { items: tempPlanInfo.items } : {}),
        customData: tempPlanInfo.customData,
      };

      await onUpdatePlan?.(planId, planPayload);

      if (dueChanged && onUpdateOrder) {
        const linkedOrders =
          !viewPlan.parentPlanId
            ? orders.filter(o => o.sourcePlanId === viewPlan.id)
            : orders.filter(o => o.planOrderId === viewPlan.id);
        const uniqById = [...new Map(linkedOrders.map(o => [o.id, o])).values()];
        await Promise.allSettled(
          uniqById.map(o => Promise.resolve(onUpdateOrder(o.id, { dueDate: nextDueStr }))),
        );
      }

      if (viewProduct) {
        const mergedRates: Record<string, number> = { ...(viewProduct.nodeRates || {}) };
        Object.entries(tempNodeRates).forEach(([nodeId, rate]) => {
          const numericRate = typeof rate === 'number' ? rate : parseFloat(String(rate));
          mergedRates[nodeId] = isNaN(numericRate) ? 0 : numericRate;
        });
        await onUpdateProduct({ ...viewProduct, nodeRates: mergedRates });
      }
      onClose();
    } finally {
      setIsSaving(false);
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
    if (planWorkOrdersDispatched) return;
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

    const missingSupplierLeaves = leafWithShortage.filter((item: any) => {
      const p = products.find(x => x.id === item.materialId);
      return effectiveSupplierIdFromProduct(p, partners) == null;
    });

    if (missingSupplierLeaves.length > 0) {
      const rows: PlanPoSupplierAssignRow[] = missingSupplierLeaves.map((item: any) => ({
        materialId: item.materialId,
        materialName: item.materialName,
        materialSku: item.materialSku,
        nodeName: item.nodeName,
        plannedQty: Number(item.plannedQty ?? item.shortage) || 0,
        shortage: Number(item.shortage) || 0,
      }));
      setSupplierAssignRows(rows);
      setSupplierAssignModalOpen(true);
      return;
    }

    void buildProposedOrdersFromLeaves({});
  };

  const handleSupplierAssignConfirm = (overrides: Record<string, PlanPoSupplierOverride>) => {
    void buildProposedOrdersFromLeaves(overrides);
    setSupplierAssignModalOpen(false);
    setSupplierAssignRows([]);
  };

  const handleSupplierAssignCancel = () => {
    setSupplierAssignModalOpen(false);
    setSupplierAssignRows([]);
  };

  const handleConfirmAndSaveOrders = async () => {
    if (!onAddPSIRecord) return;
    setIsProcessingPO(true);

    try {
        /**
         * Phase 3.D follow-up：
         * - 不再扫 `psiRecords` 全表去重；按 supplier 一次性向后端 `psi.nextDocNumber` 取号。
         *   即便 proposedOrders 中 orderNumber 与最新历史冲突，也由后端"查 MAX(seq)+1"重新给。
         * - lastPrice 也走后端 `psi.lastPurchasePrices` 批量查；UI 上已经手填的 `item.purchasePrice` 仍优先生效。
         */
        const supplierDocMap = new Map<string, string>();
        const uniqueSuppliers = Array.from(
          new Map<string, { id: string; name: string }>(
            proposedOrders.map(o => [o.partnerId, { id: o.partnerId, name: o.partnerName }] as [string, { id: string; name: string }]),
          ).values(),
        );
        try {
          const docs = await Promise.all(
            uniqueSuppliers.map(s =>
              psi.nextDocNumber({
                prefix: 'PO',
                psiType: 'PURCHASE_ORDER',
                partnerId: s.id,
                partnerName: s.name,
              }),
            ),
          );
          uniqueSuppliers.forEach((s, i) => supplierDocMap.set(s.id, docs[i]?.docNumber ?? ''));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[PlanDetailPanel] handleConfirmAndSaveOrders: nextDocNumber failed', e);
        }

        // 批量预查"上次单价"，用于未在 UI 手填的行兜底
        const pricePairs: Array<{ partnerId: string; partnerName: string; productId: string }> = [];
        for (const order of proposedOrders) {
          for (const item of order.items) {
            if (item.purchasePrice != null && Number.isFinite(Number(item.purchasePrice))) continue;
            pricePairs.push({ partnerId: order.partnerId, partnerName: order.partnerName, productId: item.productId });
          }
        }
        const lastPriceMap = new Map<string, number | null>();
        if (pricePairs.length) {
          try {
            const prices = await psi.lastPurchasePrices(pricePairs);
            pricePairs.forEach((p, i) => {
              lastPriceMap.set(`${p.partnerId}|${p.productId}`, prices[i]?.price ?? null);
            });
          } catch {
            // 失败时下游回退到 product.purchasePrice
          }
        }

        const allRecs: any[] = [];
        const baseId = Date.now();
        proposedOrders.forEach((order, oi) => {
            const docNum = supplierDocMap.get(order.partnerId) || order.orderNumber;
            order.items.forEach((item, ii) => {
                const qty = item.quantity ?? 0;
                if (qty <= 0) return;
                const prod = products.find(p => p.id === item.productId);
                const lastPrice = lastPriceMap.get(`${order.partnerId}|${item.productId}`) ?? null;
                const purchasePrice =
                  item.purchasePrice != null && Number.isFinite(Number(item.purchasePrice))
                    ? Number(item.purchasePrice)
                    : (lastPrice ?? prod?.purchasePrice ?? 0);
                const amount = Math.round(qty * purchasePrice * 100) / 100;
                allRecs.push({
                    id: `psi-po-${baseId}-${oi}-${ii}`,
                    docNumber: docNum,
                    type: 'PURCHASE_ORDER',
                    productId: item.productId,
                    quantity: qty,
                    purchasePrice,
                    amount,
                    partner: order.partnerName,
                    partnerId: order.partnerId,
                    warehouseId: 'wh-1',
                    note: `计划单[${viewPlan?.planNumber}]补货需求 | 针对工序:${item.nodeName}`,
                    timestamp: new Date().toISOString(),
                    operator: '系统生成',
                    customData: (() => {
                      if (!viewPlan) return undefined;
                      const cd: Record<string, string> = {};
                      if (viewPlan.id) cd[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID] = viewPlan.id;
                      if (viewPlan.planNumber) cd[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] = viewPlan.planNumber;
                      if (viewPlan.productId) cd.relatedProductId = viewPlan.productId;
                      return Object.keys(cd).length > 0 ? cd : undefined;
                    })(),
            });
        });
        });
        const reversed = allRecs.reverse();
        if (onAddPSIRecordBatch) {
          await onAddPSIRecordBatch(reversed);
        } else {
          for (const r of reversed) await onAddPSIRecord(r);
        }

        const backfillIds = poSupplierBackfillMaterialIdsRef.current;
        const toUpdate = new Map<string, Product>();
        for (const order of proposedOrders) {
          for (const item of order.items) {
            if (!backfillIds.has(item.productId)) continue;
            const prod = products.find(p => p.id === item.productId);
            if (!prod || !order.partnerId) continue;
            toUpdate.set(item.productId, { ...prod, supplierId: order.partnerId });
          }
        }

        let supplierWriteFail = 0;
        if (toUpdate.size > 0) {
          for (const p of toUpdate.values()) {
            try {
              const updated = await onUpdateProduct(p);
              if (updated == null) supplierWriteFail++;
            } catch {
              supplierWriteFail++;
            }
          }
        }

        poSupplierBackfillMaterialIdsRef.current = new Set();

        const nPo = proposedOrders.length;
        const nProd = toUpdate.size;
        setTimeout(() => {
          setIsProcessingPO(false);
          setProposedOrders([]);
          const extra =
            nProd === 0
              ? ''
              : supplierWriteFail > 0
                ? `；${supplierWriteFail} 个物料默认供应商写入失败，请在产品管理中补全`
                : `；已将 ${nProd} 个物料的默认供应商写入产品档案`;
          toast.success(`已成功保存 ${nPo} 张采购订单，可在进销存模块查看详情。${extra}`);
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

  const updateProposedItemPurchasePrice = (orderNum: string, itemId: string, val: string) => {
    const trimmed = val.trim();
    const n = trimmed === '' ? 0 : parseFloat(trimmed);
    const purchasePrice = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
    setProposedOrders(prev => prev.map(order => {
      if (order.orderNumber !== orderNum) return order;
      return {
        ...order,
        items: order.items.map(item => (item.id === itemId ? { ...item, purchasePrice } : item)),
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

  const openItemCodePrintPicker = useCallback((plan: PlanOrder, variantFilter: string, batchFilter: string) => {
    setItemCodePrintPlan(plan);
    setItemCodePrintOpen(true);
    setItemCodePrintLoading(true);
    void (async () => {
      const base: Record<string, string | number> = {
        planOrderId: plan.id,
        status: 'ACTIVE',
      };
      if (variantFilter) base.variantId = variantFilter;
      if (batchFilter) base.batchId = batchFilter;
      const chunk = 10_000;
      try {
        let page = 1;
        const acc: ItemCode[] = [];
        let total = 0;
        for (;;) {
          const res = await itemCodesApi.list({ ...base, page, pageSize: chunk } as any);
          if (page === 1) total = res.total;
          acc.push(...res.items);
          if (acc.length >= total || res.items.length === 0 || res.items.length < chunk) break;
          page++;
        }
        setItemCodePrintCodes(acc);
      } catch {
        toast.error('加载单品码失败');
        setItemCodePrintCodes([]);
      } finally {
        setItemCodePrintLoading(false);
      }
    })();
  }, []);

  const handleOpenLabelPrintConfig = useCallback(() => {
    setItemCodePrintOpen(false);
    setItemCodePrintPlan(null);
    setBatchBulkPrintOpen(false);
    setItemCodeSinglePrintModal(null);
    setBatchPrintModal(null);
    onOpenLabelPrintConfig();
  }, [onOpenLabelPrintConfig]);

  // --- Guard: bail out if plan or product not found ---
  if (!viewPlan || !viewProduct) return null;

  const showPlanDetailTraceSection =
    planFormSettings.labelPrint?.showPlanDetailTraceSection !== false || planHasActiveItemCodes;

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
            {!planWorkOrdersDispatched && (
              <button type="button" onClick={() => sectionMaterialRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
                生产用料
              </button>
            )}
            {showPlanDetailTraceSection && (
              <button type="button" onClick={() => sectionTraceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/80 transition-colors">
                <span className="inline-flex items-center gap-1"><QrCode className="w-3.5 h-3.5" />追溯码</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-12 bg-slate-50/30">
             {/* 1. 计划基础信息 */}
             <div ref={sectionBasicRef} className="space-y-4 scroll-mt-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">1. 计划基础信息</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                  {planFormSettings.standardFields.find(f => f.id === 'planNumber')?.showInDetail !== false && (
                    <div className="space-y-2">
                      <label className={formStandardLabelClass}>
                        单据号
                      </label>
                      <div className={`${formStandardControlClass} flex items-center`}>
                        {viewPlan.planNumber}
                      </div>
                    </div>
                  )}
                  {planFormSettings.standardFields.find(f => f.id === 'createdAt')?.showInDetail !== false && (
                    <div className="space-y-2">
                      <label className={formStandardLabelClass}>
                        {planFormSettings.standardFields.find(f => f.id === 'createdAt')?.label ?? '创建时间'}
                      </label>
                      <div className={`${formStandardControlClass} flex items-center text-slate-800`}>
                        {formatPlanOrderCreatedAtForList(viewPlan.createdAt, viewPlan.id) || '—'}
                      </div>
                    </div>
                  )}
                  {planFormSettings.listDisplay?.showDeliveryDate === true && (
                    <div className="space-y-2">
                      <label className={formStandardLabelClass}>交货日期</label>
                      <input
                        type="date"
                        value={tempPlanInfo.dueDate}
                        onChange={e => setTempPlanInfo({ ...tempPlanInfo, dueDate: e.target.value })}
                        className={formStandardControlClass}
                      />
                    </div>
                  )}
                  {planFormSettings.standardFields.find(f => f.id === 'customer')?.showInDetail === true && productionLinkMode !== 'product' && (
                    <div className="md:col-span-2 space-y-2">
                      <label className={formStandardLabelClass}>计划客户（合作单位）</label>
                      <CustomerSelect
                        options={partners}
                        categories={partnerCategories}
                        value={tempPlanInfo.customer}
                        onChange={customerName => setTempPlanInfo({ ...tempPlanInfo, customer: customerName })}
                        placeholder="搜索并选择合作单位..."
                      />
                    </div>
                  )}
                  {planFormSettings.customFields.filter(f => f.showInDetail).map(cf => (
                    <div key={cf.id} className="space-y-2">
                      <label className={formStandardLabelClass}>{cf.label}</label>
                      <PlanFormCustomFieldInput
                        cf={cf}
                        value={tempPlanInfo.customData?.[cf.id]}
                        onChange={next =>
                          setTempPlanInfo({
                            ...tempPlanInfo,
                            customData: { ...tempPlanInfo.customData, [cf.id]: next },
                          })
                        }
                        controlClassName={formStandardControlClass}
                        onFilePreview={onFilePreview}
                      />
                    </div>
                  ))}
                </div>
             </div>

             {/* 2. 规格数量矩阵 */}
             <div ref={sectionQtyRef} className="space-y-4 scroll-mt-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                    2. 生产数量明细录入 {planWorkOrdersDispatched ? '(已下达工单，不可改)' : '(可编辑)'}
                  </h3>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                  {tempPlanInfo.items && tempPlanInfo.items.length > 0 && tempPlanInfo.items[0].variantId && viewProduct ? (
                      <VariantQtyMatrixInputs
                        product={viewProduct}
                        dictionaries={dictionaries}
                        quantities={Object.fromEntries(
                          (tempPlanInfo.items ?? [])
                            .filter((i): i is PlanItem & { variantId: string } => Boolean(i.variantId))
                            .map(i => [i.variantId, Number(i.quantity) || 0]),
                        )}
                        onVariantQtyChange={(variantId, qty) => updateDetailItemQty(variantId, String(qty))}
                        readOnly={planWorkOrdersDispatched}
                      />
                  ) : (
                      <div className="max-w-xs space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase">总量 ({getUnitName(viewPlan.productId)})</label>
                           <input
                             type="number"
                             disabled={planWorkOrdersDispatched}
                             value={tempPlanInfo.items?.[0]?.quantity || 0}
                             onChange={e => updateDetailItemQty(undefined, e.target.value)}
                             className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-2xl font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                           />
                      </div>
                  )}
                </div>
             </div>

             {/* 3. 工序任务 */}
             <div ref={sectionProcessRef} className={`space-y-4 scroll-mt-4${planWorkOrdersDispatched ? ' pb-20' : ''}`}>
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">3. 工序任务</h3>
                </div>
                <div className="space-y-4">
                   {productNodes.map((node, idx) => {
                     const isAssigned = (tempAssignments[node.id] as NodeAssignment)?.workerIds?.length > 0;
                     const enableWorker =
                      equipmentFeaturesOn && isWorkerAssignmentEnabled(node);
                     const enableEquipment =
                       equipmentFeaturesOn && isEquipmentAssignmentEnabled(node);
                     const canAssign = enableWorker || enableEquipment;
                     return (
                       <div key={node.id} className={`flex flex-col md:flex-row md:items-center gap-4 p-5 rounded-[28px] border transition-all ${isAssigned ? 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-50' : 'bg-white/60 border-slate-200'}`}>
                          <div className="flex items-center gap-4 md:w-56 shrink-0">
                             <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black shadow-inner ${isAssigned ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                             <div>
                               <h4 className="text-sm font-black text-slate-800">{node.name}</h4>
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

             {/* 4. 计划生产用料清单 (BOM 汇总) — 已下达工单后隐藏 */}
             {!planWorkOrdersDispatched && (
             <div ref={sectionMaterialRef} className="space-y-4 pb-20 scroll-mt-4">
                <div className="flex flex-col gap-4 ml-2">
                   <div className="flex items-center justify-between flex-wrap gap-4">
                   <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-indigo-600" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">4. 计划生产用料清单 (BOM 汇总)</h3>
                   </div>
                      <div className="flex items-center gap-2">
                         {showCreateSubPlanButton && (
                           <button
                             onClick={handleCreateSubPlansFromPlannedQty}
                             className="bg-amber-500 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 transition-all flex items-center gap-2"
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
                            <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                              <div className="inline-flex flex-col items-center gap-1 max-w-[120px] mx-auto">
                                <div className="flex items-center justify-center gap-1">
                                  <span>库存</span>
                                  <button
                                    type="button"
                                    onClick={() => void loadServerStock()}
                                    disabled={serverStockStatus === 'loading'}
                                    className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 transition-colors"
                                    title="从服务端重新同步（与进销存/生产入库等汇总一致，全仓合计）"
                                    aria-label="重新同步库存"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${serverStockStatus === 'loading' ? 'animate-spin' : ''}`} />
                                  </button>
                                </div>
                                <span className="text-[8px] font-semibold text-slate-400 normal-case tracking-normal leading-tight">
                                  仓库汇总
                                </span>
                              </div>
                            </th>
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
                                          {(() => {
                                            const p = products.find(x => x.id === req.materialId);
                                            const skuText =
                                              req.materialSku && String(req.materialSku).trim() && req.materialSku !== '-'
                                                ? String(req.materialSku).trim()
                                                : '-';
                                            const customTags = getProductCategoryCustomFieldEntries(
                                              p,
                                              categories.find(c => c.id === p?.categoryId),
                                              { includeFile: false },
                                            );
                                            return (
                                              <>
                                                <span className="text-sm font-bold text-slate-800">
                                                  {req.materialName}
                                                  <span className="ml-2 text-[10px] font-medium text-slate-400">{skuText}</span>
                                                </span>
                                                {customTags.length > 0 && (
                                                  <span className="mt-1 flex flex-wrap items-center gap-1">
                                                    {customTags.map(({ field, display }) => (
                                                      <span
                                                        key={field.id}
                                                        className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                                      >
                                                        {field.label}: {display}
                                                      </span>
                                                    ))}
                                                  </span>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </div>
                                     </div>
                                  </td>
                                  <td className="px-8 py-4">
                                     <span className="text-sm font-black text-slate-600 whitespace-nowrap">{Number(req.totalNeeded).toFixed(2)} {getUnitName(req.materialId)}</span>
                                  </td>
                                  <td className="px-8 py-4 text-center">
                                     {!stockReady ? (
                                       <span className="text-sm font-bold text-slate-400 whitespace-nowrap">
                                         {serverStockStatus === 'error' ? '—' : '…'}
                                       </span>
                                     ) : (
                                       <span className={`text-sm font-black whitespace-nowrap ${req.stock < req.totalNeeded ? 'text-rose-500' : 'text-emerald-500'}`}>
                                         {Number(req.stock).toFixed(2)} {getUnitName(req.materialId)}
                                       </span>
                                     )}
                                  </td>
                                  <td className="px-8 py-4 text-right">
                                     {!stockReady ? (
                                       <span className="text-sm font-bold text-slate-400 whitespace-nowrap">
                                         {serverStockStatus === 'error' ? '—' : '…'}
                                       </span>
                                     ) : req.shortage > 0 ? (
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
                           <button
                              type="button"
                              onClick={() => {
                                setProposedOrders([]);
                                poSupplierBackfillMaterialIdsRef.current = new Set();
                              }}
                              className="px-4 py-2 text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase"
                            >
                              清空待办
                            </button>
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
                                         <th className="pb-4 text-right">单价 (元)</th>
                                         <th className="pb-4 text-right">金额 (元)</th>
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
                                           <td className="py-4 text-right">
                                              <input
                                                 type="number"
                                                 min={0}
                                                 step={0.01}
                                                 value={Number.isFinite(item.purchasePrice) ? item.purchasePrice : 0}
                                                 onChange={e => updateProposedItemPurchasePrice(order.orderNumber, item.id, e.target.value)}
                                                 className="w-24 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                                 title="与保存至采购订单的单价一致"
                                              />
                                           </td>
                                           <td className="py-4 text-right">
                                              <span className="text-sm font-black text-emerald-700 tabular-nums">
                                                 {(() => {
                                                    const q = Number(item.quantity) || 0;
                                                    const p = Number(item.purchasePrice) || 0;
                                                    return (Math.round(q * p * 100) / 100).toFixed(2);
                                                 })()}
                                              </span>
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

                             <div className="mt-6 pt-6 border-t border-slate-50 flex flex-wrap items-center gap-4 justify-end">
                                   <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">单据预估总量：</span>
                                      <span className="text-lg font-black text-slate-900">{Number(order.items.reduce((s, i) => s + (i.quantity ?? 0), 0)).toFixed(2)} {getUnitName(viewPlan.productId)}</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">单据合计金额：</span>
                                      <span className="text-lg font-black text-emerald-700 tabular-nums">
                                         {order.items
                                            .reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.purchasePrice) || 0), 0)
                                            .toFixed(2)}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400">元</span>
                                   </div>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
             </div>
             )}

            {/* 5. 追溯码 */}
            {showPlanDetailTraceSection && (
              <PlanTraceSection
                key={planId}
                planId={planId}
                plan={viewPlan}
                product={viewProduct}
                plans={plans}
                dictionaries={dictionaries}
                sectionRef={sectionTraceRef}
                onOpenItemCodePrintPicker={openItemCodePrintPicker}
                onOpenBatchBulkPrint={() => setBatchBulkPrintOpen(true)}
                onOpenItemCodeSinglePrint={(plan2, code) => setItemCodeSinglePrintModal({ plan: plan2, code })}
                onOpenBatchPrint={(plan2, batch) => setBatchPrintModal({ plan: plan2, batch })}
                onVirtualBatchesChange={setVirtualBatches}
                onTraceItemCodesInventoryMayHaveChanged={probePlanActiveItemCodes}
                planFormSettings={planFormSettings}
                onUpdatePlanFormSettings={onUpdatePlanFormSettings}
              />
            )}


          </div>

          <div className="px-6 sm:px-10 py-4 sm:py-5 bg-white/90 backdrop-blur-md border-t border-slate-100 shadow-[0_-6px_28px_-10px_rgba(15,23,42,0.08)] flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between sticky bottom-0 z-10">
             <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-500">
                  当前操作：<span className="text-indigo-600 font-black">计划资料整体更新</span>
                  {planWorkOrdersDispatched && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      已下达工单
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed font-medium">
                  {planWorkOrdersDispatched
                    ? '※ 生产数量与 BOM 汇总已锁定。保存将更新客户、交期、工序派发等；交期会同步到关联工单（工单中心 / 外协等）。'
                    : '※ 点击保存将同步更新客户、交期、规格数量及派发方案。'}
                </p>
             </div>
             <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
                 {onDeletePlan && (
                   <button
                     type="button"
                     onClick={() => {
                       void confirm({
                         message: planWorkOrdersDispatched
                           ? '该计划已下达工单，删除可能影响追溯。确定要删除该计划单吗？'
                           : '确定要删除该计划单吗？',
                         danger: true,
                       }).then((ok) => {
                         if (!ok) return;
                         onDeletePlan(viewPlan.id);
                         onClose();
                       });
                     }}
                     className={
                       planWorkOrdersDispatched
                         ? `${outlineToolbarButtonClass} border-rose-200/80 text-rose-600 hover:bg-rose-50/90 font-black`
                         : 'px-4 py-2 text-sm font-black text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200 flex items-center gap-2 active:scale-[0.98] transition-all'
                     }
                   >
                     <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                     删除
                   </button>
                 )}
                 {viewPlan.status !== PlanStatus.CONVERTED && !viewPlan.parentPlanId && (
                     <button
                       type="button"
                       onClick={() => {
                         onConvertToOrder(viewPlan.id);
                         onClose();
                       }}
                       className="px-4 py-2 text-sm font-black text-white bg-slate-900 hover:bg-black rounded-xl flex items-center gap-2 shadow-md active:scale-[0.98] transition-all"
                     >
                       <ArrowRightCircle className="w-4 h-4" /> 下达工单
                     </button>
                 )}
                 {viewPlan.status === PlanStatus.CONVERTED && !viewPlan.parentPlanId && hasUnconvertedSubPlans(viewPlan.id) && (
                   <button
                     type="button"
                     onClick={() => {
                       onConvertToOrder(viewPlan.id);
                       onClose();
                     }}
                     className="px-4 py-2 text-sm font-black text-white bg-amber-500 hover:bg-amber-600 rounded-xl flex items-center gap-2 shadow-md active:scale-[0.98] transition-all"
                   >
                     <ArrowRightCircle className="w-4 h-4" /> 补充下达子工单
                   </button>
                 )}
                 <button
                   type="button"
                   onClick={() => void handleUpdateDetail()}
                   disabled={isSaving}
                   className={`${primaryToolbarButtonClass} rounded-xl px-6 sm:px-8 py-2.5 font-black text-sm shadow-md shadow-indigo-100/90 disabled:opacity-50 disabled:pointer-events-none`}
                 >
                   {isSaving ? <Clock className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : <Save className="h-4 w-4 shrink-0" aria-hidden />}
                   {planWorkOrdersDispatched ? '保存更新' : '保存并更新计划内容'}
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

      <PlanPoSupplierAssignModal
        open={supplierAssignModalOpen}
        rows={supplierAssignRows}
        partners={partners}
        partnerCategories={partnerCategories}
        onConfirm={handleSupplierAssignConfirm}
        onCancel={handleSupplierAssignCancel}
      />

      <PlanPrintOverlays
        plan={viewPlan}
        product={viewProduct}
        products={products}
        dictionaries={dictionaries}
        orders={orders ?? []}
        labelPrintPickerTemplates={labelPrintPickerTemplates}
        labelPrintPickerHasWhitelist={labelPrintPickerHasWhitelist}
        onOpenLabelPrintConfig={handleOpenLabelPrintConfig}
        onPrintRun={onPrintRun}
        virtualBatches={virtualBatches}
        itemCodePrintOpen={itemCodePrintOpen}
        setItemCodePrintOpen={setItemCodePrintOpen}
        itemCodePrintPlan={itemCodePrintPlan}
        setItemCodePrintPlan={setItemCodePrintPlan}
        itemCodePrintCodes={itemCodePrintCodes}
        itemCodePrintLoading={itemCodePrintLoading}
        batchBulkPrintOpen={batchBulkPrintOpen}
        setBatchBulkPrintOpen={setBatchBulkPrintOpen}
        itemCodeSinglePrintModal={itemCodeSinglePrintModal}
        setItemCodeSinglePrintModal={setItemCodeSinglePrintModal}
        batchPrintModal={batchPrintModal}
        setBatchPrintModal={setBatchPrintModal}
      />

      {labelPrintTemplateManageOpen && (
        <PlanPrintTemplateManageDialog
          open
          onClose={() => setLabelPrintTemplateManageOpen(false)}
          scope="planLabel"
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          planFormSettings={planFormSettings}
          onMergePrintWhitelist={onMergeLabelPrintWhitelist}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders ?? []}
          products={products}
        />
      )}
    </>
  );
};

export default PlanDetailPanel;
