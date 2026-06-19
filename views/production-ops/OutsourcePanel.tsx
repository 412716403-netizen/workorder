import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProductionByFilter, getTodayRangeIso, nextOutsourceDocNumberResolved } from './sharedFlowListHelpers';
import { getActiveOrderIdsCsv, getActiveSourceProductIdsCsv } from '../../utils/stockMaterialHelpers';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Undo2,
  ClipboardList,
  Layers,
  ScrollText,
  FileText,
  User,
  Package,
  Truck,
  Sliders,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  Warehouse,
  BOM,
  AppDictionaries,
  GlobalNodeTemplate,
  Partner,
  ProductCategory,
  PartnerCategory,
  ProcessSequenceMode,
  ProductMilestoneProgress,
  PsiRecord,
  PlanFormSettings,
} from '../../types';
import { DEFAULT_MATERIAL_FORM_SETTINGS, DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../types';
import { PanelProps, hasOpsPerm, OutsourceModalType, type StockDocDetail } from './types';
import { buildOutOfSequenceTemplateIds, findGatingPredecessorIndex, isProcessSequential } from '../../shared/processSequence';
import { useDataIndexes } from './useDataIndexes';
import * as api from '../../services/api';
import {
  formConfigToolbarButtonClass,
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../../styles/uiDensity';
import { productGroupMaxReportableSum, combinedCompletedAtTemplate } from '../../utils/productReportAggregates';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import {
  productOutsourceDispatchUsesAggregateVariantPool,
  sumOutsourceableByVariantProductMatrix,
} from '../../utils/outsourceDispatchVariantCaps';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import {
  milestoneIndexInOrder,
  milestoneIndexInProduct,
  orderCreatedMs,
  productNewestOrderCreatedMs,
} from '../../utils/orderCenterSort';
import { shouldShowOrderInIncompleteListFilter } from '../../utils/orderDispatchListFilter';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import {
  buildOutsourceReceiveLastPriceIndex,
  lookupOutsourceReceiveLastPrice,
} from '../../utils/outsourceReceiveLastUnitPrice';
import OutsourceMaterialDispatchModal from './OutsourceMaterialDispatchModal';
import OutsourceMaterialReturnModal from './OutsourceMaterialReturnModal';
import OutsourceDispatchListModal from './OutsourceDispatchListModal';
import OutsourceDispatchQuantityModal from './OutsourceDispatchQuantityModal';
import OutsourceReceiveListModal from './OutsourceReceiveListModal';
import OutsourceReceiveQuantityModal from './OutsourceReceiveQuantityModal';
import {
  RECEIVE_VARIANT_SEP,
  outsourceReceiveBaseKey,
  outsourceReceiveOrderAggKey,
  outsourceReceiveProductAggKey,
  resolveOutsourceReceiveEntry,
} from './outsourceReceiveKeys';
import OutsourceFlowListModal, { type OutsourceFlowOpenSeed } from './OutsourceFlowListModal';
import OutsourcePartnerFlowDetailModal from './OutsourcePartnerFlowDetailModal';
import OutsourceFlowDocumentDetailModal from './OutsourceFlowDocumentDetailModal';
import { buildWeightMapForKeyedEntries, distributeWeightByQty, roundWeightKg } from '../../utils/reportBatchWeightHelpers';
import StockDocDetailModal from './StockDocDetailModal';
import DocPhaseModal from '../../components/DocPhaseModal';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildOutsourceFlowPrintContext } from '../../utils/buildOutsourceFlowPrintContext';
import { maskPrintContextAmounts } from '../../utils/maskPrintContextAmounts';
import { AMOUNT_PERMISSION_KEYS, canViewAmount } from '../../utils/canViewAmount';
import type { PrintRenderContext, PrintTemplate } from '../../types';
import OutsourceCollabSyncModal, {
  type CollabOutsourceRouteRow,
  type OutsourceCollabSyncConfirmPayload,
} from './OutsourceCollabSyncModal';
import { useAuth } from '../../contexts/AuthContext';
import {
  readWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { buildOutsourceDispatchCollabSnapshot, outsourceCustomCollabPart } from '../../utils/productionOpCollab/outsource';
import OutsourceFormConfigModal from './OutsourceFormConfigModal';
import type { PartnerFlowDetailSeed } from '../../utils/outsourcePartnerFlowDetail';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { toLocalDateYmd } from '../../utils/localDateTime';
import PlanProductDetail from '../plan-order-list/PlanProductDetail';

const OutsourcePanel: React.FC<PanelProps & { psiRecords?: PsiRecord[]; planFormSettings?: PlanFormSettings }> = ({
  productionLinkMode,
  productMilestoneProgresses,
  records: legacyRecords,
  orders,
  products,
  warehouses,
  boms,
  dictionaries,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  onDeleteRecordBatch,
  globalNodes,
  partners,
  categories,
  partnerCategories,
  workers,
  equipment,
  processSequenceMode,
  allowExceedMaxOutsourceReceiveQty = false,
  userPermissions,
  tenantRole,
  plans = [],
  planFormSettings,
  outsourceFormSettings = DEFAULT_OUTSOURCE_FORM_SETTINGS,
  onUpdateOutsourceFormSettings,
  printTemplates = [],
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  materialFormSettings = DEFAULT_MATERIAL_FORM_SETTINGS,
  psiRecords = [],
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const outOfSequenceTemplateIds = useMemo(() => buildOutOfSequenceTemplateIds(globalNodes), [globalNodes]);
  const onlyShowIncompleteOrders =
    productionLinkMode === 'order' && outsourceFormSettings.onlyShowNotCompletedOrder === true;
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:outsource_list:allow');
  const showOutsourceAmount = canViewAmount(tenantRole, userPermissions, AMOUNT_PERMISSION_KEYS.OUTSOURCE);

  /**
   * Phase 3.E：OutsourcePanel 自取数据。
   * 主查询：types=OUTSOURCE + 当前活动工单 ids（外协未收回的全集业务上是有限的）。
   * 次查询：types=OUTSOURCE 今日窄拉（确保今日新增的状态变化即时可见）。
   * 物料：types=STOCK_OUT,STOCK_RETURN + activeOrderIds（外协物料退回/选项用）。
   * 不良/返工：types=REWORK,REWORK_REPORT + activeOrderIds（不良工件反查口径）。
   * 合并去重后输出 records，覆盖 props.records。
   */
  const activeOrderIdsCsv = useMemo(() => getActiveOrderIdsCsv(orders), [orders]);
  /** 关联产品模式领退料 sourceProductId 兜底（写入时 orderId=null） */
  const activeSourceProductIdsCsv = useMemo(() => getActiveSourceProductIdsCsv(orders), [orders]);
  /**
   * 关联产品模式外协主数据：后端对 OUTSOURCE 的 productIds 分支要求 orderId=null；
   * 若主查询只带 orderIds，会漏掉「纯产品维度」写入的历史外协，主页聚合只剩少量产品。
   */
  const activeProductIdsCsv = useMemo(
    () => products.map(p => p.id).filter(Boolean).join(','),
    [products],
  );
  const todayRangeRef = useMemo(() => getTodayRangeIso(), []);
  const outsourceMainQuery = useQuery({
    queryKey: ['outsourcePanel.outsource.byOrders', productionLinkMode, activeOrderIdsCsv, activeProductIdsCsv],
    queryFn: () =>
      fetchProductionByFilter({
        type: 'OUTSOURCE',
        orderIds: activeOrderIdsCsv || undefined,
        ...(productionLinkMode === 'product' && activeProductIdsCsv
          ? { productIds: activeProductIdsCsv }
          : {}),
      }),
    enabled:
      productionLinkMode === 'product'
        ? activeOrderIdsCsv.length > 0 || activeProductIdsCsv.length > 0
        : activeOrderIdsCsv.length > 0,
    staleTime: 15_000,
  });
  const outsourceTodayQuery = useQuery({
    queryKey: ['outsourcePanel.outsource.today', todayRangeRef.from, todayRangeRef.to],
    queryFn: () =>
      fetchProductionByFilter({
        type: 'OUTSOURCE',
        startDate: todayRangeRef.from,
        endDate: todayRangeRef.to,
      }),
    staleTime: 15_000,
  });
  const stockByOrderQuery = useQuery({
    queryKey: ['outsourcePanel.stock.byOrders', activeOrderIdsCsv, activeSourceProductIdsCsv],
    queryFn: () =>
      fetchProductionByFilter({
        types: 'STOCK_OUT,STOCK_RETURN',
        orderIds: activeOrderIdsCsv || undefined,
        sourceProductIds: activeSourceProductIdsCsv || undefined,
      }),
    enabled: activeOrderIdsCsv.length > 0 || activeSourceProductIdsCsv.length > 0,
    staleTime: 15_000,
  });
  const reworkByOrderQuery = useQuery({
    queryKey: ['outsourcePanel.rework.byOrders', activeOrderIdsCsv],
    queryFn: () =>
      fetchProductionByFilter({
        types: 'REWORK,REWORK_REPORT',
        orderIds: activeOrderIdsCsv || undefined,
      }),
    enabled: activeOrderIdsCsv.length > 0,
    staleTime: 15_000,
  });
  const records = useMemo<ProductionOpRecord[]>(() => {
    const seen = new Set<string>();
    const out: ProductionOpRecord[] = [];
    const pushAll = (arr: ProductionOpRecord[] | undefined) => {
      if (!arr) return;
      for (const r of arr) {
        if (r?.id && !seen.has(r.id)) {
          seen.add(r.id);
          out.push(r);
        }
      }
    };
    pushAll(outsourceMainQuery.data);
    pushAll(outsourceTodayQuery.data);
    pushAll(stockByOrderQuery.data);
    pushAll(reworkByOrderQuery.data);
    if (out.length === 0 && legacyRecords && legacyRecords.length > 0) return legacyRecords;
    return out;
  }, [outsourceMainQuery.data, outsourceTodayQuery.data, stockByOrderQuery.data, reworkByOrderQuery.data, legacyRecords]);

  const [outsourceModal, setOutsourceModal] = useState<OutsourceModalType | null>(null);
  const [dispatchPartnerName, setDispatchPartnerName] = useState('');
  const [dispatchSelectedKeys, setDispatchSelectedKeys] = useState<Set<string>>(new Set());
  const [dispatchFormModalOpen, setDispatchFormModalOpen] = useState(false);
  const [dispatchFormQuantities, setDispatchFormQuantities] = useState<Record<string, number>>({});
  const [collabSyncConfirm, setCollabSyncConfirm] = useState<OutsourceCollabSyncConfirmPayload | null>(null);
  const [collabRoutes, setCollabRoutes] = useState<CollabOutsourceRouteRow[]>([]);

  const [receiveSelectedKeys, setReceiveSelectedKeys] = useState<Set<string>>(new Set());
  const [receiveFormModalOpen, setReceiveFormModalOpen] = useState(false);
  const [receiveFormQuantities, setReceiveFormQuantities] = useState<Record<string, number>>({});
  const [receiveFormUnitPrices, setReceiveFormUnitPrices] = useState<Record<string, number>>({});
  /** 外协收货按工序开关录入的本次交货总重量（kg），baseKey 维度，用于 BOM 占比分摊 */
  const [receiveFormWeights, setReceiveFormWeights] = useState<Record<string, number>>({});
  /**
   * 扫码收货时按 entry key 记录的 scan link，提交时写入收货记录，使追溯链路能按码命中本次收货。
   * - 单品码模式：收集所有扫入的 itemCodeIds，提交时逐件落记录（每件只挂自己的单品码，不下沉到整批），
   *   保证「扫 1 件只该件可查、扫多件各自独立可查」；
   * - 批次码模式：只记 virtualBatchId（整批收回，同批各单品共享链路），合并为一条记录。
   * 判定依据：扫码意图为批次时（含批次模式扫单品码）后端解析为 BATCH、itemCodeId 为空，故按是否有 itemCodeId 区分。
   */
  const [receiveScanLinkByKey, setReceiveScanLinkByKey] = useState<
    Record<string, { virtualBatchId?: string | null; itemCodeIds: string[] }>
  >({});
  const [receiveModal, setReceiveModal] = useState<{ orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; pendingQty: number } | null>(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [flowDetailKey, setFlowDetailKey] = useState<string | null>(null);
  /**
   * 流水弹窗按日期窗口窄拉 records，详情打开时把这条 docNo 的原始 records 一并存下来，
   * 避免 panel 自身 records 没覆盖到该日期范围时详情打不开。
   */
  const [flowDetailExtraRecords, setFlowDetailExtraRecords] = useState<ProductionOpRecord[] | null>(null);
  /** 从待发送保存后直接打开单据详情时，不依赖「外协流水」列表弹窗（outsourceModal==='flow'） */
  const [flowDetailRevealStandalone, setFlowDetailRevealStandalone] = useState(false);
  const [flowDocPhase, setFlowDocPhase] = useState<'detail' | 'edit'>('detail');
  const [flowOpenSeed, setFlowOpenSeed] = useState<OutsourceFlowOpenSeed>(null);
  const [flowOpenNonce, setFlowOpenNonce] = useState(0);
  const [partnerQtyDetailSeed, setPartnerQtyDetailSeed] = useState<PartnerFlowDetailSeed | null>(null);
  const [matDispatchOrderId, setMatDispatchOrderId] = useState<string | null>(null);
  const [matDispatchProductId, setMatDispatchProductId] = useState<string | null>(null);
  const [matDispatchPartnerOptions, setMatDispatchPartnerOptions] = useState<string[]>([]);
  const [matDispatchPartner, setMatDispatchPartner] = useState('');
  const [matDispatchWarehouseId, setMatDispatchWarehouseId] = useState('');
  const [matDispatchRemark, setMatDispatchRemark] = useState('');
  const [matDispatchQty, setMatDispatchQty] = useState<Record<string, number>>({});
  const [matReturnOrderId, setMatReturnOrderId] = useState<string | null>(null);
  const [matReturnProductId, setMatReturnProductId] = useState<string | null>(null);
  const [matReturnPartnerOptions, setMatReturnPartnerOptions] = useState<string[]>([]);
  const [matReturnPartner, setMatReturnPartner] = useState('');
  const [matReturnWarehouseId, setMatReturnWarehouseId] = useState('');
  const [matReturnRemark, setMatReturnRemark] = useState('');
  const [matReturnQty, setMatReturnQty] = useState<Record<string, number>>({});
  /** 外协物料发出/退回保存后，与「生产物料」页一致的物料单据详情 */
  const [stockDocDetail, setStockDocDetail] = useState<StockDocDetail | null>(null);
  const [showOutsourceConfig, setShowOutsourceConfig] = useState(false);
  const [outsourceConfigDefaultTab, setOutsourceConfigDefaultTab] = useState<'fields' | 'print'>('fields');
  const [dispatchCustomValues, setDispatchCustomValues] = useState<Record<string, unknown>>({});
  const [dispatchDeliveryDate, setDispatchDeliveryDate] = useState('');
  const [receiveCustomValues, setReceiveCustomValues] = useState<Record<string, unknown>>({});
  const [receiveLineCustomValues, setReceiveLineCustomValues] = useState<Record<string, unknown>>({});
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');

  const OUTS_PAGE_SIZE = 10;
  const [outsPage, setOutsPage] = useState(1);
  const [outsourceSearch, setOutsourceSearch] = useState('');
  const debouncedOutsourceSearch = useDebouncedValue(outsourceSearch, 300);
  useEffect(() => { setOutsPage(1); }, [productionLinkMode]);
  useEffect(() => { setOutsPage(1); }, [debouncedOutsourceSearch]);
  useEffect(() => { setOutsPage(1); }, [outsourceFormSettings.onlyShowNotCompletedOrder]);
  useEffect(() => {
    if (dispatchFormModalOpen) {
      setDispatchCustomValues({});
      setDispatchDeliveryDate('');
      setDispatchPartnerName('');
    }
  }, [dispatchFormModalOpen]);
  useEffect(() => {
    if (receiveFormModalOpen) setReceiveCustomValues({});
  }, [receiveFormModalOpen]);
  useEffect(() => {
    if (flowDetailKey) setFlowDocPhase('detail');
  }, [flowDetailKey]);
  useEffect(() => {
    if (!flowDetailKey) setFlowDetailRevealStandalone(false);
  }, [flowDetailKey]);
  useEffect(() => {
    if (receiveModal) setReceiveLineCustomValues({});
  }, [receiveModal]);

  const dispatchCustomCreateDefs = useMemo(
    () => (outsourceFormSettings.outsourceDispatchCustomFields ?? []).filter(f => f.showInCreate),
    [outsourceFormSettings.outsourceDispatchCustomFields],
  );
  const receiveCustomCreateDefs = useMemo(
    () => (outsourceFormSettings.outsourceReceiveCustomFields ?? []).filter(f => f.showInCreate),
    [outsourceFormSettings.outsourceReceiveCustomFields],
  );

  const idx = useDataIndexes(orders, products, boms, globalNodes, productMilestoneProgresses);

  const defectiveReworkByOrderForOutsource = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, records),
    [orders, records]
  );

  const flowDetailRecordsForPrint = useMemo(
    () => {
      if (!flowDetailKey) return [];
      const fromPanel = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
      if (fromPanel.length > 0) return fromPanel;
      // 兜底：流水弹窗按日期窄拉时附带的 records
      return (flowDetailExtraRecords ?? []).filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
    },
    [records, flowDetailKey, flowDetailExtraRecords],
  );
  /** 详情弹窗内 docRecords 需与打印兜底一致：合并流水弹窗附带的同单号行，避免正文为空 */
  const recordsForFlowDetailModal = useMemo(() => {
    if (!flowDetailKey) return records;
    const fromPanel = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
    const extraMatch = (flowDetailExtraRecords ?? []).filter(
      r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey,
    );
    if (extraMatch.length === 0) return records;
    /** 主流水已含该单时不再叠加 extra，避免编辑保存后旧 extra 与新 records 双计 */
    if (fromPanel.length > 0) return records;
    const byId = new Map<string, ProductionOpRecord>(records.map(r => [r.id, r]));
    for (const r of extraMatch) byId.set(r.id, r);
    return Array.from(byId.values());
  }, [records, flowDetailKey, flowDetailExtraRecords]);
  const flowDetailPrintIsReceive = flowDetailRecordsForPrint[0]?.status === '已收回';
  const flowDetailPrintSlot = flowDetailPrintIsReceive
    ? outsourceFormSettings.outsourceCenterPrint?.receiveFlowDetail
    : outsourceFormSettings.outsourceCenterPrint?.dispatchFlowDetail;

  const outsourceDispatchRows = useMemo(() => {
    if (globalNodes.length === 0) return [];
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE');
    const isProductMode = productionLinkMode === 'product';

    if (isProductMode) {
      const dispatchedByKey: Record<string, number> = {};
      const receivedByKey: Record<string, number> = {};
      // 全收：产品模式下按 productId|nodeId 聚合，无论记录是否绑工单（orderId）。
      // 这样原 order 模式产生的外协单也能在切到 product 模式后被纳入产品维度统计，
      // 避免切换模式后"已发外协凭空消失"。聚合 key 用 productId|nodeId，无双计风险。
      outsourceRecords.forEach(r => {
        if (!r.nodeId) return;
        if (!r.productId) return;
        const key = `${r.productId}|${r.nodeId}`;
        if (r.status === '加工中') dispatchedByKey[key] = (dispatchedByKey[key] ?? 0) + r.quantity;
        else if (r.status === '已收回') receivedByKey[key] = (receivedByKey[key] ?? 0) + r.quantity;
      });
      const rows: { orderId?: string; orderNumber?: string; productId: string; productName: string; nodeId: string; milestoneName: string; orderTotalQty: number; reportedQty: number; dispatchedQty: number; availableQty: number }[] = [];
      const getDr = (oid: string, tid: string) =>
        defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0 };
      const { productsById, ordersByProductId, nodesById, pmpByKey } = idx;
      for (const product of products) {
        const productId = String(product.id);
        const blockOrders = ordersByProductId.get(productId) ?? [];
        const nodeIds = (product.milestoneNodeIds || []).filter((nid: string) => {
          const node = nodesById.get(nid);
          return node?.allowOutsource;
        });
        nodeIds.forEach((nodeId: string) => {
          const node = nodesById.get(nodeId);
          const maxReportable =
            blockOrders.length > 0
              ? productGroupMaxReportableSum(
                  blockOrders,
                  nodeId,
                  productId,
                  productMilestoneProgresses || [],
                  (processSequenceMode ?? 'sequential') as ProcessSequenceMode,
                  getDr,
                  pmpByKey,
                  orders,
                  outOfSequenceTemplateIds,
                )
              : 0;
          // 关联产品 + 外协发出侧「已报」应同时覆盖 PMP 与工单里程碑写入（后者来自外协收回自动回写 / 关联工单直接报工），
          // 只用 pmpCompletedAtTemplate 会漏掉经过里程碑的那部分，外协发出可用数被错误抬高。
          const reportedQty = combinedCompletedAtTemplate(blockOrders, productMilestoneProgresses || [], productId, nodeId);
          const key = `${productId}|${nodeId}`;
          const dispatchedQty = Math.max(0, (dispatchedByKey[key] ?? 0) - (receivedByKey[key] ?? 0));
          let availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
          const category = categories.find(c => c.id === product.categoryId);
          if (
            availableQty > 0 &&
            productHasColorSizeMatrix(product, category) &&
            !productOutsourceDispatchUsesAggregateVariantPool(
              blockOrders,
              productMilestoneProgresses || [],
              productId,
              nodeId,
              product,
            )
          ) {
            const capSum = sumOutsourceableByVariantProductMatrix(
              records,
              product,
              nodeId,
              blockOrders,
              productMilestoneProgresses,
              (processSequenceMode ?? 'sequential') as ProcessSequenceMode,
              getDr,
              orders,
              outOfSequenceTemplateIds,
            );
            if (Number.isFinite(capSum)) {
              availableQty = Math.min(availableQty, capSum);
            }
          }
          if (availableQty <= 0) return;
          rows.push({
            productId,
            productName: product.name ?? '—',
            nodeId,
            milestoneName: node?.name ?? nodeId,
            orderTotalQty: maxReportable,
            reportedQty,
            dispatchedQty,
            availableQty
          });
        });
      }
      return rows.sort((a, b) => {
        const d = productNewestOrderCreatedMs(b.productId, orders) - productNewestOrderCreatedMs(a.productId, orders);
        if (d !== 0) return d;
        if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
        const pa = idx.productsById.get(a.productId);
        const pb = idx.productsById.get(b.productId);
        return milestoneIndexInProduct(pa, a.nodeId) - milestoneIndexInProduct(pb, b.nodeId);
      });
    }

    const dispatchedByKey: Record<string, number> = {};
    const receivedByKey: Record<string, number> = {};
    outsourceRecords.forEach(r => {
      if (!r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      if (r.status === '加工中') dispatchedByKey[key] = (dispatchedByKey[key] ?? 0) + r.quantity;
      else if (r.status === '已收回') receivedByKey[key] = (receivedByKey[key] ?? 0) + r.quantity;
    });
    const rows: { orderId?: string; orderNumber?: string; productId: string; productName: string; nodeId: string; milestoneName: string; orderTotalQty: number; reportedQty: number; dispatchedQty: number; availableQty: number }[] = [];
    const getDr = (oid: string, tid: string) =>
      defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0 };
    /**
     * 工单模式待发清单：父/子工单都要遍历。
     * 子工单（parentOrderId 非空）也是独立 ProductionOrder，有自己的 productId / items / milestones，
     * 若过滤掉子工单，工单中心里子工单上「可外协」工序的产品就进不了待发清单（历史 bug）。
     * 聚合 key 是 orderId|nodeId，父子 orderId 不同，无双计风险。
     */
    orders.forEach(order => {
      if (onlyShowIncompleteOrders && !shouldShowOrderInIncompleteListFilter(order, true)) return;
      const rawOrderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
      const product = idx.productsById.get(order.productId);
      order.milestones.forEach(ms => {
        const node = idx.nodesById.get(ms.templateId);
        if (!node?.allowOutsource) return;
        if (product && !(product.milestoneNodeIds || []).includes(ms.templateId)) return;
        let baseQty = rawOrderTotalQty;
        if (isProcessSequential(processSequenceMode ?? 'sequential', ms.templateId, outOfSequenceTemplateIds)) {
          const msIdx = order.milestones.findIndex(m => m.id === ms.id);
          const templateIds = order.milestones.map(m => m.templateId);
          const gateIdx = findGatingPredecessorIndex(templateIds, msIdx, outOfSequenceTemplateIds);
          if (gateIdx >= 0) {
            const prev = order.milestones[gateIdx];
            baseQty = prev?.completedQuantity ?? 0;
          }
        }
        const { defective, rework } = getDr(order.id, ms.templateId);
        const maxReportable = Math.max(0, baseQty - defective + rework);
        const key = `${order.id}|${ms.templateId}`;
        const dispatchedQty = Math.max(0, (dispatchedByKey[key] ?? 0) - (receivedByKey[key] ?? 0));
        const reportedQty = ms.completedQuantity ?? 0;
        const availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
        if (availableQty <= 0) return;
        rows.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          productName: product?.name ?? order.productName ?? '—',
          nodeId: ms.templateId,
          milestoneName: ms.name,
          orderTotalQty: maxReportable,
          reportedQty,
          dispatchedQty,
          availableQty
        });
      });
    });
    return rows.sort((a, b) => {
      const oa = a.orderId ? idx.ordersById.get(a.orderId) : undefined;
      const ob = b.orderId ? idx.ordersById.get(b.orderId) : undefined;
      const d = orderCreatedMs(ob) - orderCreatedMs(oa);
      if (d !== 0) return d;
      const ma = milestoneIndexInOrder(oa, a.nodeId);
      const mb = milestoneIndexInOrder(ob, b.nodeId);
      if (ma !== mb) return ma - mb;
      return (a.orderNumber || '').localeCompare(b.orderNumber || '');
    });
  }, [productionLinkMode, records, orders, products, globalNodes, productMilestoneProgresses, processSequenceMode, defectiveReworkByOrderForOutsource, idx, outOfSequenceTemplateIds, onlyShowIncompleteOrders]);

  /**
   * 待收回清单：跨模式全收（方案 A）。
   *
   * 行的"维度"由发出单原始 `orderId` 决定，与当前 `productionLinkMode` **无关**。
   * - 工单级（`orderId` 非空）：聚合 key = `orderId|nodeId|partner`
   * - 产品级（`orderId` 空）：聚合 key = `productId|nodeId|partner`
   *
   * 工单级聚合**必须**包含 partner，否则同一工单同一工序发给多个加工厂时
   * 会被合并成一行（数量相加、partner 只取首个），造成"分户"丢失（历史 bug）。
   *
   * 这样模式切换后，历史发出单仍能在任一模式下被看到、被收回；
   * 收回写入仍按发出单原模式分流（`handleReceiveFormSubmit` 内按 `row.orderId == null` 决定），
   * 保持发出/收回对称的核心不变量。
   */
  /**
   * 待收回聚合行的两个变体：
   * - `outsourceReceiveAllAggregates`：未过滤 pending<=0。供扫码会话做「跨工厂判定 + 特例放行」、
   *   以及录入弹窗在「扫码注入了 pending=0 行」的特例下能找到行数据。
   * - `outsourceReceiveRows`：过滤 pending>0。供清单弹窗表格展示。
   */
  const outsourceReceiveAllAggregates = useMemo(() => {
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId);
    const byKey: Record<string, { scope: 'order' | 'product'; orderId?: string; productId: string; nodeId: string; partner: string; dispatched: number; received: number }> = {};

    outsourceRecords.forEach(r => {
      if (!r.nodeId) return;
      const partner = r.partner ?? '';
      if (r.orderId) {
        const k = outsourceReceiveOrderAggKey(r.orderId, r.nodeId, partner);
        if (!byKey[k]) {
          const order = idx.ordersById.get(r.orderId);
          if (!order) return;
          byKey[k] = { scope: 'order', orderId: r.orderId, productId: order.productId, nodeId: r.nodeId, partner, dispatched: 0, received: 0 };
        }
        if (r.status === '加工中') byKey[k].dispatched += r.quantity;
        else if (r.status === '已收回') byKey[k].received += r.quantity;
      } else if (r.productId) {
        const k = outsourceReceiveProductAggKey(r.productId, r.nodeId, partner);
        if (!byKey[k]) byKey[k] = { scope: 'product', productId: r.productId, nodeId: r.nodeId, partner, dispatched: 0, received: 0 };
        if (r.status === '加工中') byKey[k].dispatched += r.quantity;
        else if (r.status === '已收回') byKey[k].received += r.quantity;
      }
    });

    const rows: { orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; dispatched: number; received: number; pending: number }[] = [];
    Object.values(byKey).forEach(v => {
      const pending = v.dispatched - v.received;
      if (v.scope === 'order' && v.orderId) {
        const order = idx.ordersById.get(v.orderId);
        if (!order) return;
        const ms = order.milestones.find(m => m.templateId === v.nodeId);
        const product = idx.productsById.get(order.productId);
        rows.push({
          orderId: v.orderId,
          nodeId: v.nodeId,
          productId: order.productId,
          orderNumber: order.orderNumber,
          productName: product?.name ?? order.productName ?? '—',
          milestoneName: ms?.name ?? v.nodeId,
          partner: v.partner,
          dispatched: v.dispatched,
          received: v.received,
          pending,
        });
      } else {
        const product = idx.productsById.get(v.productId);
        const node = idx.nodesById.get(v.nodeId);
        rows.push({
          nodeId: v.nodeId,
          productId: v.productId,
          productName: product?.name ?? '—',
          milestoneName: node?.name ?? v.nodeId,
          partner: v.partner,
          dispatched: v.dispatched,
          received: v.received,
          pending,
        });
      }
    });

    /** 排序：工单级按工单创建时间倒序在前；产品级按产品下最新工单倒序在后；并列再按工序顺序、厂商。 */
    return rows.sort((a, b) => {
      const aIsOrder = a.orderId != null;
      const bIsOrder = b.orderId != null;
      if (aIsOrder !== bIsOrder) return aIsOrder ? -1 : 1;
      if (aIsOrder && bIsOrder) {
        const oa = idx.ordersById.get(a.orderId!);
        const ob = idx.ordersById.get(b.orderId!);
        const d = orderCreatedMs(ob) - orderCreatedMs(oa);
        if (d !== 0) return d;
        const ma = milestoneIndexInOrder(oa, a.nodeId);
        const mb = milestoneIndexInOrder(ob, b.nodeId);
        if (ma !== mb) return ma - mb;
        return (a.orderNumber || '').localeCompare(b.orderNumber || '');
      }
      const d = productNewestOrderCreatedMs(b.productId, orders) - productNewestOrderCreatedMs(a.productId, orders);
      if (d !== 0) return d;
      if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
      const pa = idx.productsById.get(a.productId);
      const pb = idx.productsById.get(b.productId);
      const ni = milestoneIndexInProduct(pa, a.nodeId) - milestoneIndexInProduct(pb, b.nodeId);
      if (ni !== 0) return ni;
      return (a.partner || '').localeCompare(b.partner || '');
    });
  }, [records, orders, products, globalNodes, productMilestoneProgresses, idx]);

  /** 清单弹窗显示用：过滤掉 pending<=0；其它派生（行查找、解析 entry）走 allAggregates */
  const outsourceReceiveRows = useMemo(
    () => outsourceReceiveAllAggregates.filter(r => r.pending > 0),
    [outsourceReceiveAllAggregates],
  );

  /**
   * 外协收货模态框打开时，按「合作单位 + 商品 + 工序」查询上次收回单价；
   * 仅对当前为 0/未定义的 baseKey 预填，不覆盖用户已填的非零价。
   */
  useEffect(() => {
    if (!receiveFormModalOpen) return;
    const priceIndex = buildOutsourceReceiveLastPriceIndex(records);
    if (priceIndex.size === 0) return;
    setReceiveFormUnitPrices(prev => {
      const next = { ...prev };
      let changed = false;
      // 用 allAggregates 兼容「扫码注入了 pending=0 行」的特例，确保仍能补单价
      for (const row of outsourceReceiveAllAggregates) {
        const baseKey = outsourceReceiveBaseKey(row);
        if (!receiveSelectedKeys.has(baseKey)) continue;
        const existing = next[baseKey];
        if (existing != null && existing > 0) continue;
        const last = lookupOutsourceReceiveLastPrice(priceIndex, row.partner, row.productId, row.nodeId);
        if (last != null) {
          next[baseKey] = last;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [receiveFormModalOpen, outsourceReceiveAllAggregates, receiveSelectedKeys, records]);

  const outsourceStatsByOrder = useMemo(() => {
    const isProductMode = productionLinkMode === 'product';
    if (isProductMode) {
      // 全收：产品模式下不再因 r.orderId 存在而排除——原 order 模式产生的外协单也按其 productId 归到产品维度。
      // 仍按 productId|partner|nodeId 聚合，避免双计。
      const outsourceRecs = records.filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.partner && r.productId);
      const byKey: Record<string, { productId: string; partner: string; nodeId: string; dispatched: number; received: number }> = {};
      outsourceRecs.forEach(r => {
        const nodeId = r.nodeId ?? '';
        const key = `${r.productId}|${r.partner}|${nodeId}`;
        if (!byKey[key]) byKey[key] = { productId: r.productId, partner: r.partner, nodeId, dispatched: 0, received: 0 };
        if (r.status === '加工中') { byKey[key].dispatched += r.quantity; }
        else if (r.status === '已收回') byKey[key].received += r.quantity;
      });
      const byProduct = new Map<string, { partner: string; nodeId: string; nodeName: string; dispatched: number; received: number; pending: number }[]>();
      Object.values(byKey).forEach(v => {
        const pending = Math.max(0, v.dispatched - v.received);
        const nodeName = (idx.nodesById.get(v.nodeId)?.name ?? v.nodeId) || '—';
        if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
        byProduct.get(v.productId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
      });
      return Array.from(byProduct.entries())
        .map(([productId, ptnrs]) => {
          const product = idx.productsById.get(productId);
          const seq = product?.milestoneNodeIds ?? [];
          const nodeOrder = (nodeId: string) => {
            const i = seq.indexOf(nodeId);
            return i >= 0 ? i : 9999;
          };
          const sortedPartners = [...ptnrs].sort((a, b) => {
            const d = nodeOrder(a.nodeId) - nodeOrder(b.nodeId);
            if (d !== 0) return d;
            return (a.partner || '').localeCompare(b.partner || '');
          });
          return {
            productId,
            productName: product?.name ?? '—',
            partners: sortedPartners
          };
        })
        .sort((a, b) => {
          const d = productNewestOrderCreatedMs(b.productId, orders) - productNewestOrderCreatedMs(a.productId, orders);
          if (d !== 0) return d;
          return a.productId.localeCompare(b.productId);
        });
    }
    const outsourceRecs = records.filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.orderId && r.partner);
    const byKey: Record<string, { orderId: string; partner: string; nodeId: string; dispatched: number; received: number }> = {};
    outsourceRecs.forEach(r => {
      const nodeId = r.nodeId ?? '';
      const key = `${r.orderId}|${r.partner}|${nodeId}`;
      if (!byKey[key]) byKey[key] = { orderId: r.orderId, partner: r.partner, nodeId, dispatched: 0, received: 0 };
      if (r.status === '加工中') { byKey[key].dispatched += r.quantity; }
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
    const byOrder = new Map<string, { partner: string; nodeId: string; nodeName: string; dispatched: number; received: number; pending: number }[]>();
    Object.values(byKey).forEach(v => {
      const pending = Math.max(0, v.dispatched - v.received);
      const order = idx.ordersById.get(v.orderId);
      const ms = order?.milestones?.find(m => m.templateId === v.nodeId);
      const nodeName = (ms?.name ?? idx.nodesById.get(v.nodeId)?.name ?? v.nodeId) || '—';
      if (!byOrder.has(v.orderId)) byOrder.set(v.orderId, []);
      byOrder.get(v.orderId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
    });
    return Array.from(byOrder.entries())
      .map(([orderId, ptnrs]) => {
        const order = idx.ordersById.get(orderId);
        const product = idx.productsById.get(order?.productId ?? '');
        const milestoneIndex = (nodeId: string) => {
          const idx = order?.milestones?.findIndex(m => m.templateId === nodeId) ?? -1;
          return idx >= 0 ? idx : 9999;
        };
        const sortedPartners = [...ptnrs].sort((a, b) => milestoneIndex(a.nodeId) - milestoneIndex(b.nodeId));
        return {
          orderId,
          orderNumber: order?.orderNumber ?? orderId,
          productId: order?.productId,
          productName: product?.name ?? order?.productName ?? '—',
          partners: sortedPartners
        };
      })
      .sort((a, b) => {
        const oa = idx.ordersById.get(a.orderId);
        const ob = idx.ordersById.get(b.orderId);
        const d = orderCreatedMs(ob) - orderCreatedMs(oa);
        if (d !== 0) return d;
        return (a.orderNumber || '').localeCompare(b.orderNumber || '');
      });
  }, [productionLinkMode, records, orders, products, globalNodes, productMilestoneProgresses, idx]);

  const displayOutsourceStats = useMemo(() => {
    let base = outsourceStatsByOrder;
    if (outsourceFormSettings.hideZeroPendingPartnerOnList === true) {
      base = base
        .map(item => ({ ...item, partners: item.partners.filter(p => p.pending > 0) }))
        .filter(item => item.partners.length > 0);
    }
    if (onlyShowIncompleteOrders) {
      base = base.filter(item => {
        if (!('orderId' in item) || item.orderId == null) return true;
        const order = idx.ordersById.get(item.orderId);
        return order ? shouldShowOrderInIncompleteListFilter(order, true) : true;
      });
    }
    const q = debouncedOutsourceSearch.trim().toLowerCase();
    if (!q) return base;
    const isProductMode = productionLinkMode === 'product';
    return base.filter(item => {
      const parts: string[] = [];
      if ('productName' in item) parts.push(String(item.productName ?? ''));
      if ('orderNumber' in item && item.orderNumber != null) parts.push(String(item.orderNumber));
      const pid = 'productId' in item ? String(item.productId ?? '') : '';
      if (pid) {
        const p = idx.productsById.get(pid);
        parts.push(p?.sku ?? '', p?.name ?? '');
      }
      if (!isProductMode && 'orderId' in item && item.orderId) {
        const ord = idx.ordersById.get(item.orderId);
        parts.push(ord?.customer ?? '', ord?.productName ?? '', ord?.sku ?? '');
      }
      if ('partners' in item && Array.isArray(item.partners)) {
        item.partners.forEach((pt: { partner?: string; nodeName?: string }) => {
          parts.push(pt.partner ?? '', pt.nodeName ?? '');
        });
      }
      const hay = parts.join('\u0000').toLowerCase();
      return hay.includes(q);
    });
  }, [outsourceStatsByOrder, debouncedOutsourceSearch, productionLinkMode, idx, outsourceFormSettings.hideZeroPendingPartnerOnList, onlyShowIncompleteOrders]);

  // Phase 3.E：outsourceFlowSummaryRows 已搬入 OutsourceFlowListModal 内部，
  // 由弹窗自身按日期窗口窄拉 records + 现场聚合；panel 不再预算这份数据。

  const showOrderDueDateColumn =
    productionLinkMode !== 'product' && planFormSettings?.listDisplay?.showDeliveryDate === true;

  /** 关闭未保存的外协发出录入弹窗时丢弃草稿 */
  const resetDispatchFormDraft = () => {
    setDispatchFormQuantities({});
    setDispatchCustomValues({});
    setDispatchDeliveryDate('');
    setDispatchPartnerName('');
  };

  const closeDispatchFormModal = () => {
    resetDispatchFormDraft();
    setDispatchFormModalOpen(false);
  };

  /** 关闭未保存的收货录入弹窗时丢弃草稿（数量/单价/重量/自定义字段） */
  const resetReceiveFormDraft = () => {
    setReceiveFormQuantities({});
    setReceiveFormUnitPrices({});
    setReceiveFormWeights({});
    setReceiveScanLinkByKey({});
    setReceiveCustomValues({});
  };

  const closeReceiveFormModal = () => {
    resetReceiveFormDraft();
    setReceiveFormModalOpen(false);
  };

  const handleDispatchFormSubmit = async () => {
    const partnerName = (dispatchPartnerName || '').trim();
    if (!partnerName) {
      toast.warning('请选择外协工厂。');
      return;
    }
    const entries = (Object.entries(dispatchFormQuantities) as [string, number][]).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      toast.warning('请至少填写一项委外数量。');
      return;
    }
    let docNo: string;
    try {
      docNo = await nextOutsourceDocNumberResolved('dispatch', partners, records, '', partnerName);
    } catch (e) {
      toast.error(`生成外协发出单号失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const timestamp = new Date().toLocaleString();
    const isProductMode = productionLinkMode === 'product';
    const dispatchCollab = buildOutsourceDispatchCollabSnapshot(
      dispatchCustomValues,
      outsourceFormSettings.showOutsourceDispatchDeliveryDate ? dispatchDeliveryDate : undefined,
    );
    const batch: ProductionOpRecord[] = [];
    entries.forEach(([key, qty]) => {
      const parts = key.split('|');
      const nodeId = parts.length >= 2 ? parts[1] : '';
      const variantId = parts[2];
      if (isProductMode) {
        const productId = parts[0];
        const product = idx.productsById.get(productId);
        if (!product) return;
        batch.push({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          productId,
          quantity: qty,
          reason: undefined,
          operator: docOperator,
          timestamp,
          status: '加工中',
          partner: partnerName,
          docNo,
          nodeId,
          variantId: variantId || undefined,
          ...dispatchCollab,
        } as ProductionOpRecord);
      } else {
        const orderId = parts[0];
        const order = idx.ordersById.get(orderId);
        if (!order) return;
        batch.push({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          orderId,
          productId: order.productId,
          quantity: qty,
          reason: undefined,
          operator: docOperator,
          timestamp,
          status: '加工中',
          partner: partnerName,
          docNo,
          nodeId,
          variantId: variantId || undefined,
          ...dispatchCollab,
        } as ProductionOpRecord);
      }
    });
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) await onAddRecord(rec);
    }

    setFlowDetailExtraRecords([...batch]);
    setFlowDetailKey(docNo);
    setFlowDocPhase('detail');
    setFlowDetailRevealStandalone(true);

    const matchedPartner = partners.find(p => p.name === partnerName);
    const collabTenantId = matchedPartner?.collaborationTenantId;

    resetDispatchFormDraft();
    setDispatchFormModalOpen(false);
    setOutsourceModal(null);
    setDispatchSelectedKeys(new Set());

    if (collabTenantId) {
      const productIds = Array.from(
        new Set(batch.map(r => (r.productId ?? '').trim()).filter(Boolean)),
      );
      setCollabSyncConfirm({
        partnerName,
        collaborationTenantId: collabTenantId,
        recordIds: batch.map(r => r.id),
        productIds,
      });
      api.collaboration.listOutsourceRoutes().then(setCollabRoutes).catch(() => setCollabRoutes([]));
    }
  };

  const handleOutsourceReceiveSubmit = async () => {
    if (!receiveModal || receiveQty <= 0) return;
    if (!allowExceedMaxOutsourceReceiveQty && receiveQty > receiveModal.pendingQty) {
      toast.error(`本次收回数量不能大于待收回数量（${receiveModal.pendingQty}）。`);
      return;
    }
    let receiveDocNo: string;
    try {
      receiveDocNo = await nextOutsourceDocNumberResolved(
        'receive',
        partners,
        records,
        '',
        receiveModal.partner,
      );
    } catch (e) {
      toast.error(`生成外协收回单号失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const lineCollab = outsourceCustomCollabPart(receiveLineCustomValues, 'receive');
    const receiveRec: ProductionOpRecord = {
      id: `rec-${Date.now()}-recv-${Math.random().toString(36).slice(2, 8)}`,
      type: 'OUTSOURCE',
      orderId: receiveModal.orderId,
      productId: receiveModal.productId,
      quantity: receiveQty,
      operator: docOperator,
      timestamp: new Date().toLocaleString(),
      status: '已收回',
      partner: receiveModal.partner,
      nodeId: receiveModal.nodeId,
      docNo: receiveDocNo,
      ...lineCollab,
    };
    await Promise.resolve(onAddRecord(receiveRec));
    setFlowDetailExtraRecords([receiveRec]);
    setFlowDetailKey(receiveDocNo);
    setFlowDocPhase('detail');
    setFlowDetailRevealStandalone(true);
    toast.success('收货已保存', {
      description: `收回单号 ${receiveDocNo}，本次收回 ${receiveQty} 件`,
    });
    setReceiveModal(null);
    setReceiveQty(0);
  };

  /**
   * 解析 receiveFormQuantities 的 entry key，返回命中的 row 与 scope。
   * 详细 key 形态见 `outsourceReceiveKeys.ts`。
   */
  const resolveReceiveEntry = (key: string) =>
    // 解析 key 时用 allAggregates，否则扫码注入的 pending=0 行无法被解析
    resolveOutsourceReceiveEntry(key, outsourceReceiveAllAggregates) as
      | { row: typeof outsourceReceiveAllAggregates[number]; isProductScope: boolean; baseKey: string; variantId?: string }
      | null;

  const handleReceiveFormSubmit = async () => {
    const entries = (Object.entries(receiveFormQuantities) as [string, number][]).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      toast.warning('请至少填写一项收回数量。');
      return;
    }
    /** 受 SystemSetting.allowExceedMaxOutsourceReceiveQty 控制：开启后跳过本段所有 pending 校验。 */
    if (!allowExceedMaxOutsourceReceiveQty) {
    for (const [key, qty] of entries) {
      const resolved = resolveReceiveEntry(key);
      if (!resolved) continue;
      const { row, isProductScope, variantId } = resolved;
      if (isProductScope) {
        const dispatchR = records.filter(
          rr =>
            rr.type === 'OUTSOURCE' &&
            rr.status === '加工中' &&
            !rr.sourceReworkId &&
            !rr.orderId &&
            rr.productId === row.productId &&
            rr.nodeId === row.nodeId &&
            (rr.partner ?? '') === (row.partner ?? '')
        );
        const receiveR = records.filter(
          rr =>
            rr.type === 'OUTSOURCE' &&
            rr.status === '已收回' &&
            !rr.sourceReworkId &&
            !rr.orderId &&
            rr.productId === row.productId &&
            rr.nodeId === row.nodeId &&
            (rr.partner ?? '') === (row.partner ?? '')
        );
        const pendingVar = (vid: string) => {
          const d = dispatchR.filter(rr => (rr.variantId || '') === vid).reduce((s, rr) => s + rr.quantity, 0);
          const rc = receiveR.filter(rr => (rr.variantId || '') === vid).reduce((s, rr) => s + rr.quantity, 0);
          return Math.max(0, d - rc);
        };
        const dispNoVar = dispatchR.filter(rr => !rr.variantId).reduce((s, rr) => s + rr.quantity, 0);
        const recNoVar = receiveR.filter(rr => !rr.variantId).reduce((s, rr) => s + rr.quantity, 0);
        const pendingNoVar = Math.max(0, dispNoVar - recNoVar);
        const hasVariantDispatch = dispatchR.some(rr => !!rr.variantId);
        if (variantId !== undefined) {
          const maxQ = pendingVar(variantId);
          if (qty > maxQ) {
            toast.error(`本次收回数量不能大于该规格待收数量（最多${maxQ}）。`);
            return;
          }
        } else if (key === outsourceReceiveBaseKey(row)) {
          const maxAgg = hasVariantDispatch ? pendingNoVar : row.pending;
          if (qty > maxAgg) {
            toast.error(`本次收回数量不能大于待收数量（最多${maxAgg}）。`);
            return;
          }
        }
      } else {
        const nodeId = row.nodeId;
        const orderId = row.orderId!;
        const rowPartner = row.partner ?? '';
        if (variantId !== undefined) {
          /** 工单级单一加工厂：必须按 partner 过滤，否则同一工单同一工序多厂家会互相串用配额 */
          const dispatchRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.sourceReworkId && r.orderId === orderId && r.nodeId === nodeId && (r.partner ?? '') === rowPartner);
          const receiveRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.sourceReworkId && r.orderId === orderId && r.nodeId === nodeId && (r.partner ?? '') === rowPartner);
          const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
          const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
          const maxQty = Math.max(0, dispatched - received);
          if (qty > maxQty) {
            toast.error(`本次收回数量不能大于待收数量（最多${maxQty}）。`);
            return;
          }
        } else {
          if (qty > row.pending) {
            toast.error(`本次收回数量不能大于待收数量（最多${row.pending}）。`);
            return;
          }
        }
      }
    }
    }
    const timestamp = new Date().toLocaleString();
    const firstKey = receiveSelectedKeys.values().next().value;
    const firstRow = firstKey ? outsourceReceiveAllAggregates.find(r => outsourceReceiveBaseKey(r) === firstKey) : null;
    const partnerName = firstRow?.partner ?? '';
    let receiveDocNo: string;
    try {
      receiveDocNo = await nextOutsourceDocNumberResolved('receive', partners, records, '', partnerName);
    } catch (e) {
      toast.error(`生成外协收回单号失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const receiveCollab = outsourceCustomCollabPart(receiveCustomValues, 'receive');
    const weightByEntryKey = buildWeightMapForKeyedEntries(
      entries.flatMap(([key, qty]) => {
        const resolved = resolveReceiveEntry(key);
        if (!resolved) return [];
        return [{
          entryKey: key,
          baseKey: resolved.baseKey,
          nodeId: resolved.row.nodeId,
          quantity: Number(qty),
        }];
      }),
      receiveFormWeights,
      nodeId => !!globalNodes.find(n => n.id === nodeId)?.enableWeightOnReport,
    );
    for (const [key, qty] of entries) {
      const resolved = resolveReceiveEntry(key);
      if (!resolved) continue;
      const { row, isProductScope, baseKey, variantId } = resolved;
      const nodeId = row.nodeId;
      const unitPrice = receiveFormUnitPrices[baseKey] ?? 0;
      const weightForThis = weightByEntryKey.get(key);
      const link = receiveScanLinkByKey[key];
      const itemCodeIds = link?.itemCodeIds ?? [];

      /**
       * 把本 key 拆成若干"分片"落记录：
       * - 单品码模式：每件单独 qty1，仅挂自己的单品码（不挂批次），保证逐件独立可追溯；
       *   尊重表单可能改小的数量（最多 qty 件带链路），改大的多出部分并入一条无链路记录。
       * - 批次码模式：整批一条，挂 virtualBatchId。
       * - 手工收货（无扫码链路）：单条，无链路。
       */
      type ReceiveSlice = { quantity: number; itemCodeId?: string; virtualBatchId?: string };
      let slices: ReceiveSlice[];
      if (itemCodeIds.length > 0) {
        const linkedCount = Math.min(qty, itemCodeIds.length);
        slices = itemCodeIds.slice(0, linkedCount).map(id => ({ quantity: 1, itemCodeId: id }));
        const remainder = qty - linkedCount;
        if (remainder > 0) slices.push({ quantity: remainder });
      } else if (link?.virtualBatchId) {
        slices = [{ quantity: qty, virtualBatchId: link.virtualBatchId }];
      } else {
        slices = [{ quantity: qty }];
      }

      const sliceWeights =
        weightForThis != null
          ? distributeWeightByQty(weightForThis, slices.map(s => ({ quantity: s.quantity })))
          : null;

      slices.forEach((slice, si) => {
        const sliceAmount = slice.quantity * unitPrice;
        const baseRecord = {
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${si}`,
          type: 'OUTSOURCE' as const,
          productId: row.productId,
          quantity: slice.quantity,
          reason: undefined,
          operator: docOperator,
          timestamp,
          status: '已收回' as const,
          partner: partnerName,
          nodeId,
          variantId: variantId || undefined,
          docNo: receiveDocNo,
          unitPrice: unitPrice || undefined,
          amount: sliceAmount || undefined,
          weight: sliceWeights ? sliceWeights[si] : weightForThis,
          ...(slice.virtualBatchId ? { virtualBatchId: slice.virtualBatchId } : {}),
          ...(slice.itemCodeId ? { itemCodeId: slice.itemCodeId } : {}),
          ...receiveCollab,
        };
        if (isProductScope) {
          /** product 维度发出 → product 维度收回；不附 orderId，与发出对称 */
          onAddRecord(baseRecord);
        } else {
          /** order 维度发出 → order 维度收回；附 orderId，写回 milestone，与发出对称 */
          const order = idx.ordersById.get(row.orderId!);
          if (!order) return;
          const rowRec: ProductionOpRecord = {
            ...baseRecord,
            orderId: row.orderId!,
            productId: order.productId,
          };
          onAddRecord(rowRec);
        }
      });
    }
    const receiveTotalQty = entries.reduce((s, [, q]) => s + q, 0);
    toast.success('收货已保存', {
      description: `收回单号 ${receiveDocNo}，${entries.length} 条明细，合计 ${receiveTotalQty} 件`,
    });
    resetReceiveFormDraft();
    setReceiveFormModalOpen(false);
    setReceiveSelectedKeys(new Set());
  };

  /**
   * 待收回清单弹窗内「扫码收货」会话确认后回调：
   * 合并 receiveSelectedKeys + receiveFormQuantities，关清单弹窗、开录入弹窗，
   * 后续提交流程与「勾选→收货」完全一致。详细约束见 OutsourceReceiveListModal.handleScanApply。
   */
  const handleReceiveScanConfirm: React.ComponentProps<
    typeof OutsourceReceiveListModal
  >['onScanConfirm'] = ({ entries }) => {
    if (!entries.length) return;
    setReceiveSelectedKeys(prev => {
      const next = new Set(prev);
      entries.forEach(e => next.add(e.baseKey));
      return next;
    });
    setReceiveFormQuantities(prev => {
      const next = { ...prev };
      entries.forEach(e => {
        next[e.key] = (next[e.key] ?? 0) + e.qty;
      });
      return next;
    });
    setReceiveFormWeights(prev => {
      let changed = false;
      const next = { ...prev };
      entries.forEach(e => {
        if (e.measuredWeightKg != null && e.measuredWeightKg > 0) {
          next[e.baseKey] = roundWeightKg((next[e.baseKey] ?? 0) + e.measuredWeightKg);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setReceiveScanLinkByKey(prev => {
      const next = { ...prev };
      entries.forEach(e => {
        const cur = next[e.key] ?? { itemCodeIds: [] as string[], virtualBatchId: null };
        const itemCodeIds = [...cur.itemCodeIds];
        let virtualBatchId = cur.virtualBatchId ?? null;
        if (e.itemCodeId) {
          // 单品码模式：逐件精确关联（不挂批次，避免同批其他单品被误关联）
          if (!itemCodeIds.includes(e.itemCodeId)) itemCodeIds.push(e.itemCodeId);
        } else if (e.virtualBatchId) {
          // 批次码模式：整批关联
          virtualBatchId = virtualBatchId ?? e.virtualBatchId;
        }
        next[e.key] = { itemCodeIds, virtualBatchId };
      });
      return next;
    });
    setOutsourceModal(null);
    setReceiveFormModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>外协管理</h1>
          <p className={pageSubtitleClass}>外部委托加工业务追踪</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full sm:w-auto">
          {outsourceModal === null && canViewMainList && outsourceStatsByOrder.length > 0 && (
            <div className="relative w-full sm:w-56 sm:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                placeholder="搜索工单号、产品、客户、外协厂、工序…"
                value={outsourceSearch}
                onChange={e => setOutsourceSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end sm:justify-start">
          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_form_config:allow') && onUpdateOutsourceFormSettings && (
            <button
              type="button"
              onClick={() => {
                setOutsourceConfigDefaultTab('fields');
                setShowOutsourceConfig(true);
              }}
              className={formConfigToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_send:allow') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('dispatch')}
              className={outlineToolbarButtonClass}
            >
              <ClipboardList className="w-4 h-4 shrink-0" /> 待发清单
            </button>
          )}
          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_receive:allow') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('receive')}
              className={outlineToolbarButtonClass}
            >
              <ArrowDownToLine className="w-4 h-4 shrink-0" /> 待收回清单
            </button>
          )}
          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:view') && (
            <button
              type="button"
              onClick={() => {
                setFlowOpenSeed(null);
                setFlowOpenNonce(n => n + 1);
                setPartnerQtyDetailSeed(null);
                setOutsourceModal('flow');
              }}
              className={outlineToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" /> 外协流水
            </button>
          )}
          </div>
        </div>
      </div>

      {outsourceModal === null && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看外协管理列表</p>
        </div>
      )}
      {outsourceModal === null && canViewMainList && (
        <div className="space-y-2">
          {outsourceStatsByOrder.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <Truck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">暂无委外数据，请点击上方「待发清单」「待收回清单」或「外协流水」操作。</p>
            </div>
          ) : displayOutsourceStats.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">
                {outsourceFormSettings.hideZeroPendingPartnerOnList === true && !debouncedOutsourceSearch.trim()
                  ? '暂无待收回外协（剩余均为 0）'
                  : '无匹配项，请调整搜索关键词。'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {(() => {
                const outsTotalPages = Math.max(1, Math.ceil(displayOutsourceStats.length / OUTS_PAGE_SIZE));
                const pagedStats = displayOutsourceStats.slice((outsPage - 1) * OUTS_PAGE_SIZE, outsPage * OUTS_PAGE_SIZE);
                return (<>
              {pagedStats.map((item) => {
                const orderId = 'orderId' in item ? item.orderId : undefined;
                const orderNumber = 'orderNumber' in item ? item.orderNumber : undefined;
                const productId = 'productId' in item ? item.productId : (item as { productId: string }).productId;
                const productName = item.productName;
                const ptnrs = item.partners;
                const order = orderId ? idx.ordersById.get(orderId) : undefined;
                const product = idx.productsById.get(productId);
                const orderTotalQty = order?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                return (
                <div
                  key={orderId ?? productId}
                  className="bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr_auto] gap-3 lg:gap-4 items-center"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {product?.imageUrl ? (
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                        <img loading="lazy" decoding="async" src={product.imageUrl} alt={productName} className="w-full h-full object-cover block" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600">
                        <Layers className="w-7 h-7" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        {productionLinkMode !== 'product' && orderNumber != null && <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{orderNumber}</span>}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (productId) setViewProductId(productId);
                          }}
                          className="text-left text-base font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors"
                        >
                          {productName}
                        </button>
                        {product?.sku && <span className="text-[10px] font-bold text-slate-500">{product.sku}</span>}
                      </div>
                      <div className="mb-1 flex flex-wrap items-center gap-1">
                        {product &&
                          getProductCategoryCustomFieldEntries(
                            product,
                            categories.find(c => c.id === product.categoryId),
                            { includeFile: false },
                          ).map(({ field, display }) => (
                            <span
                              key={field.id}
                              className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50"
                            >
                              {field.label}: {display}
                            </span>
                          ))}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                        {productionLinkMode !== 'product' && order?.customer && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.customer}</span>}
                        {productionLinkMode !== 'product' && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>}
                        {showOrderDueDateColumn && order?.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> 交期: {(order.dueDate || '').trim().slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 flex-wrap flex-1 min-w-0 -my-0.5">
                    {ptnrs.map(({ partner, nodeId, nodeName, dispatched, received, pending }) => (
                      <div
                        key={`${partner}|${nodeId}`}
                        className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border transition-colors border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200"
                      >
                        <div className="mb-1 w-full text-center leading-tight">
                          <div className="text-[10px] font-bold text-emerald-600 truncate" title={nodeName}>{nodeName}</div>
                          <div className="text-[10px] font-bold text-slate-600 truncate" title={partner}>{partner}</div>
                        </div>
                        <div
                          className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${pending > 0 ? 'border-indigo-300' : 'border-emerald-400'}`}
                          title="已收回数量"
                        >
                          <span className="text-base font-black text-slate-900 leading-none">{received}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 leading-tight">
                          <span className="text-[10px] font-bold text-slate-500" title="发出 / 剩余">{dispatched} / {pending}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const seed: PartnerFlowDetailSeed = {
                                productionLinkMode,
                                orderId: productionLinkMode === 'product' ? undefined : orderId,
                                productId,
                                productName,
                                orderNumber: productionLinkMode === 'product' ? undefined : orderNumber,
                                nodeId,
                                nodeName,
                                partner,
                              };
                              if (outsourceFormSettings.showPartnerFlowDetailOnList) {
                                setPartnerQtyDetailSeed(seed);
                                return;
                              }
                              setFlowOpenSeed({
                                orderKeyword: productionLinkMode === 'product' ? '' : (orderNumber ?? ''),
                                productKeyword: productName,
                                milestoneNodeId: nodeId,
                                partnerKeyword: partner,
                              });
                              setFlowOpenNonce(n => n + 1);
                              setPartnerQtyDetailSeed(null);
                              setOutsourceModal('flow');
                            }}
                            className="p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                            title={
                              outsourceFormSettings.showPartnerFlowDetailOnList
                                ? '加工厂往来数量明细'
                                : '查看外协流水'
                            }
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_material:allow') && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          const uniquePartners = [...new Set(ptnrs.map(p => p.partner))];
                          setMatDispatchPartnerOptions(uniquePartners);
                          setMatDispatchPartner(uniquePartners[0] ?? '');
                          setMatDispatchWarehouseId(
                            resolvePreferredSingleWarehouse(
                              warehouses,
                              readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.OUTSOURCE_MAT_DISPATCH),
                              warehouses[0]?.id ?? '',
                            ) || '',
                          );
                          setMatDispatchRemark('');
                          setMatDispatchQty({});
                          if (productionLinkMode === 'product') {
                            setMatDispatchProductId(productId);
                            setMatDispatchOrderId(null);
                          } else {
                            setMatDispatchOrderId(orderId ?? null);
                            setMatDispatchProductId(null);
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                      >
                        <Package className="w-3.5 h-3.5" /> 物料外发
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          const outsourceDispatchPartners = [...new Set(
                            records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && (
                              productionLinkMode === 'product'
                                ? (r.sourceProductId === productId || (!r.orderId && !r.sourceProductId && r.productId))
                                : r.orderId === orderId
                            )).map(r => r.partner!)
                          )];
                          if (outsourceDispatchPartners.length === 0) {
                            toast.warning('该卡片暂无外发记录，无法退回');
                            return;
                          }
                          setMatReturnPartnerOptions(outsourceDispatchPartners);
                          setMatReturnPartner(outsourceDispatchPartners[0] ?? '');
                          setMatReturnWarehouseId(
                            resolvePreferredSingleWarehouse(
                              warehouses,
                              readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.OUTSOURCE_MAT_RETURN),
                              warehouses[0]?.id ?? '',
                            ) || '',
                          );
                          setMatReturnRemark('');
                          setMatReturnQty({});
                          if (productionLinkMode === 'product') {
                            setMatReturnProductId(productId);
                            setMatReturnOrderId(null);
                          } else {
                            setMatReturnOrderId(orderId ?? null);
                            setMatReturnProductId(null);
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-amber-100 text-amber-600 bg-white hover:bg-amber-50 transition-all w-full justify-center"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> 物料退回
                      </button>
                    </div>
                  )}
                </div>
              );
              })}
              {outsTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <span className="text-xs text-slate-400">共 {displayOutsourceStats.length} 项，第 {outsPage} / {outsTotalPages} 页</span>
                  <button type="button" disabled={outsPage <= 1} onClick={() => setOutsPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                  <button type="button" disabled={outsPage >= outsTotalPages} onClick={() => setOutsPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
                </div>
              )}
              </>); })()}
            </div>
          )}
        </div>
      )}

      {(matDispatchOrderId || matDispatchProductId) && (
        <OutsourceMaterialDispatchModal
          productionLinkMode={productionLinkMode}
          matDispatchOrderId={matDispatchOrderId}
          matDispatchProductId={matDispatchProductId}
          matDispatchPartnerOptions={matDispatchPartnerOptions}
          matDispatchPartner={matDispatchPartner}
          setMatDispatchPartner={setMatDispatchPartner}
          matDispatchWarehouseId={matDispatchWarehouseId}
          setMatDispatchWarehouseId={setMatDispatchWarehouseId}
          matDispatchRemark={matDispatchRemark}
          setMatDispatchRemark={setMatDispatchRemark}
          matDispatchQty={matDispatchQty}
          setMatDispatchQty={setMatDispatchQty}
          orders={orders}
          products={products}
          boms={boms}
          globalNodes={globalNodes}
          records={records}
          warehouses={warehouses}
          materialFormSettings={materialFormSettings}
          categories={categories}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onAfterMatDocSaved={setStockDocDetail}
          onClose={() => {
            setMatDispatchOrderId(null);
            setMatDispatchProductId(null);
            setMatDispatchQty({});
            setMatDispatchPartner('');
            setMatDispatchRemark('');
          }}
          psiRecords={psiRecords}
        />
      )}


      {(matReturnOrderId || matReturnProductId) && (
        <OutsourceMaterialReturnModal
          productionLinkMode={productionLinkMode}
          matReturnOrderId={matReturnOrderId}
          matReturnProductId={matReturnProductId}
          matReturnPartnerOptions={matReturnPartnerOptions}
          matReturnPartner={matReturnPartner}
          setMatReturnPartner={setMatReturnPartner}
          matReturnWarehouseId={matReturnWarehouseId}
          setMatReturnWarehouseId={setMatReturnWarehouseId}
          matReturnRemark={matReturnRemark}
          setMatReturnRemark={setMatReturnRemark}
          matReturnQty={matReturnQty}
          setMatReturnQty={setMatReturnQty}
          orders={orders}
          products={products}
          boms={boms}
          records={records}
          warehouses={warehouses}
          materialFormSettings={materialFormSettings}
          categories={categories}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onAfterMatDocSaved={setStockDocDetail}
          onClose={() => {
            setMatReturnOrderId(null);
            setMatReturnProductId(null);
            setMatReturnQty({});
            setMatReturnPartner('');
            setMatReturnRemark('');
          }}
          psiRecords={psiRecords}
        />
      )}

      <StockDocDetailModal
        detail={stockDocDetail}
        onClose={() => setStockDocDetail(null)}
        onDetailChange={setStockDocDetail}
        records={records}
        orders={orders}
        products={products}
        warehouses={warehouses}
        dictionaries={dictionaries}
        materialFormSettings={materialFormSettings}
        printTemplates={printTemplates}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      {outsourceModal === 'dispatch' && (
        <OutsourceDispatchListModal
          productionLinkMode={productionLinkMode}
          outsourceDispatchRows={outsourceDispatchRows}
          products={products}
          dispatchSelectedKeys={dispatchSelectedKeys}
          setDispatchSelectedKeys={setDispatchSelectedKeys}
          onDispatchFormOpen={() => {
            resetDispatchFormDraft();
            setDispatchFormModalOpen(true);
          }}
          onClose={() => {
            setOutsourceModal(null);
            if (!dispatchFormModalOpen) {
              resetDispatchFormDraft();
              setDispatchSelectedKeys(new Set());
            }
          }}
        />
      )}

      {dispatchFormModalOpen && (
        <DocPhaseModal
          open={dispatchFormModalOpen}
          phase="edit"
          editingDocNumber={null}
          detailTitle="外协发出详情"
          editTitle="外协发出 · 编辑"
          newTitle="外协发出 · 录入数量"
          showPrint={false}
          hasPerm={p => hasOpsPerm(tenantRole, userPermissions, p)}
          viewPerm="production:outsource_send:allow"
          editPerm="production:outsource_send:allow"
          onClose={closeDispatchFormModal}
          onEnterEdit={() => {}}
          onCancelEdit={closeDispatchFormModal}
          renderContent={() => (
            <OutsourceDispatchQuantityModal
              embedded
              productionLinkMode={productionLinkMode}
              outsourceDispatchRows={outsourceDispatchRows}
              dispatchSelectedKeys={dispatchSelectedKeys}
              dispatchPartnerName={dispatchPartnerName}
              setDispatchPartnerName={setDispatchPartnerName}
              dispatchFormQuantities={dispatchFormQuantities}
              setDispatchFormQuantities={setDispatchFormQuantities}
              orders={orders}
              products={products}
              categories={categories}
              dictionaries={dictionaries}
              globalNodes={globalNodes}
              partners={partners}
              partnerCategories={partnerCategories}
              records={records}
              processSequenceMode={processSequenceMode}
              productMilestoneProgresses={productMilestoneProgresses}
              defectiveReworkByOrderForOutsource={defectiveReworkByOrderForOutsource}
              dispatchCustomFieldDefs={dispatchCustomCreateDefs}
              dispatchCustomValues={dispatchCustomValues}
              setDispatchCustomValues={setDispatchCustomValues}
              showDispatchDeliveryDate={outsourceFormSettings.showOutsourceDispatchDeliveryDate === true}
              dispatchDeliveryDate={dispatchDeliveryDate}
              setDispatchDeliveryDate={setDispatchDeliveryDate}
              onSubmit={handleDispatchFormSubmit}
              onClose={closeDispatchFormModal}
            />
          )}
        />
      )}

      {outsourceModal === 'receive' && (
        <OutsourceReceiveListModal
          productionLinkMode={productionLinkMode}
          outsourceReceiveRows={outsourceReceiveRows}
          outsourceReceiveAllAggregates={outsourceReceiveAllAggregates}
          products={products}
          partners={partners}
          categories={categories}
          allowExceedMaxOutsourceReceiveQty={allowExceedMaxOutsourceReceiveQty}
          receiveSelectedKeys={receiveSelectedKeys}
          setReceiveSelectedKeys={setReceiveSelectedKeys}
          receiveFormQuantities={receiveFormQuantities}
          onReceiveFormOpen={() => setReceiveFormModalOpen(true)}
          onScanConfirm={handleReceiveScanConfirm}
          onClose={() => {
            setOutsourceModal(null);
            if (!receiveFormModalOpen) {
              resetReceiveFormDraft();
              setReceiveSelectedKeys(new Set());
            }
          }}
        />
      )}

      {receiveFormModalOpen && (
        <DocPhaseModal
          open={receiveFormModalOpen}
          phase="edit"
          editingDocNumber={null}
          detailTitle="外协收货详情"
          editTitle="外协收货 · 编辑"
          newTitle="外协收货 · 录入数量"
          showPrint={false}
          hasPerm={p => hasOpsPerm(tenantRole, userPermissions, p)}
          viewPerm="production:outsource_receive:allow"
          editPerm="production:outsource_receive:allow"
          onClose={closeReceiveFormModal}
          onEnterEdit={() => {}}
          onCancelEdit={closeReceiveFormModal}
          renderContent={() => (
            <OutsourceReceiveQuantityModal
              embedded
              productionLinkMode={productionLinkMode}
              // 用 allAggregates 而非过滤集，确保扫码注入的 pending=0 行也能在 visibleRows 中渲染
              outsourceReceiveRows={outsourceReceiveAllAggregates}
              receiveSelectedKeys={receiveSelectedKeys}
              receiveFormQuantities={receiveFormQuantities}
              setReceiveFormQuantities={setReceiveFormQuantities}
              receiveFormUnitPrices={receiveFormUnitPrices}
              setReceiveFormUnitPrices={setReceiveFormUnitPrices}
              receiveFormWeights={receiveFormWeights}
              setReceiveFormWeights={setReceiveFormWeights}
              orders={orders}
              products={products}
              categories={categories}
              dictionaries={dictionaries}
              records={records}
              productMilestoneProgresses={productMilestoneProgresses}
              receiveCustomFieldDefs={receiveCustomCreateDefs}
              receiveCustomValues={receiveCustomValues}
              setReceiveCustomValues={setReceiveCustomValues}
              globalNodes={globalNodes}
              boms={boms}
              allowExceedMaxOutsourceReceiveQty={allowExceedMaxOutsourceReceiveQty}
              onSubmit={handleReceiveFormSubmit}
              onClose={closeReceiveFormModal}
            />
          )}
        />
      )}

      {outsourceModal === 'flow' && (
        <OutsourceFlowListModal
          productionLinkMode={productionLinkMode}
          showOrderDueDateColumn={showOrderDueDateColumn}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          onOpenDetail={(docNo, recs) => {
            setFlowDetailExtraRecords(recs);
            setFlowDetailKey(docNo);
          }}
          flowOpenSeed={flowOpenSeed}
          flowOpenNonce={flowOpenNonce}
          onClose={() => {
            setOutsourceModal(null);
            setFlowDetailKey(null);
            setFlowDetailExtraRecords(null);
            setFlowOpenSeed(null);
            setPartnerQtyDetailSeed(null);
          }}
        />
      )}

      <OutsourcePartnerFlowDetailModal
        open={partnerQtyDetailSeed != null}
        seed={partnerQtyDetailSeed}
        onClose={() => setPartnerQtyDetailSeed(null)}
        records={records}
        products={products}
        orders={orders}
        categories={categories}
        dictionaries={dictionaries}
        outsourceFormSettings={outsourceFormSettings}
      />

      {flowDetailKey && (outsourceModal === 'flow' || flowDetailRevealStandalone) && (
        <DocPhaseModal
          open
          phase={flowDocPhase}
          editingDocNumber={flowDetailKey}
          detailTitle={flowDetailPrintIsReceive ? '外协收回详情' : '外协发出详情'}
          editTitle="编辑外协单据"
          newTitle="外协单据"
          showPrint={false}
          zIndexClass="z-[90]"
          hasPerm={p => hasOpsPerm(tenantRole, userPermissions, p)}
          viewPerm="production:outsource_records:view"
          editPerm="production:outsource_records:edit"
          deletePerm={onDeleteRecord ? 'production:outsource_records:delete' : undefined}
          deleteConfirmMessage="确定要删除该张外协单的所有记录吗？此操作不可恢复。"
          onDelete={
            (onDeleteRecordBatch || onDeleteRecord) && flowDetailRecordsForPrint.length > 0
              ? async () => {
                  const ids = flowDetailRecordsForPrint.map(r => r.id).filter(Boolean);
                  if (onDeleteRecordBatch) {
                    await onDeleteRecordBatch(ids);
                  } else if (onDeleteRecord) {
                    await Promise.all(ids.map(id => Promise.resolve(onDeleteRecord(id))));
                  }
                  setFlowDetailKey(null);
                  setFlowDocPhase('detail');
                }
              : undefined
          }
          leadingDetailActions={
            flowDetailRecordsForPrint.length > 0 ? (
              <OrderCenterDetailPrintBlock
                printSlot={flowDetailPrintSlot}
                printTemplates={printTemplates}
                buildContext={(_template: PrintTemplate): PrintRenderContext => {
                  const ctx: PrintRenderContext = {
                    ...buildOutsourceFlowPrintContext({
                      docRecords: flowDetailRecordsForPrint,
                      isReceiveDoc: !!flowDetailPrintIsReceive,
                      orders,
                      products,
                      globalNodes,
                      dictionaries,
                    }),
                    tenantName: tenantCtx?.tenantName?.trim() || undefined,
                  };
                  return flowDetailPrintIsReceive && !showOutsourceAmount ? maskPrintContextAmounts(ctx) : ctx;
                }}
                pickerSubtitle={`单号 ${flowDetailKey}`}
                onAddPrintTemplate={() => {
                  setOutsourceConfigDefaultTab('print');
                  setShowOutsourceConfig(true);
                }}
              />
            ) : null
          }
          onClose={() => {
            setFlowDetailKey(null);
            setFlowDocPhase('detail');
            setFlowDetailExtraRecords(null);
          }}
          onEnterEdit={() => setFlowDocPhase('edit')}
          onCancelEdit={() => setFlowDocPhase('detail')}
          renderContent={() => (
            <OutsourceFlowDocumentDetailModal
              layout="docPhase"
              phase={flowDocPhase}
              onAfterSave={() => {
                setFlowDetailKey(null);
                setFlowDocPhase('detail');
                setFlowDetailExtraRecords(null);
              }}
              productionLinkMode={productionLinkMode}
              flowDetailKey={flowDetailKey}
              records={recordsForFlowDetailModal}
              orders={orders}
              products={products}
              categories={categories}
              dictionaries={dictionaries}
              globalNodes={globalNodes}
              partners={partners}
              partnerCategories={partnerCategories}
              userPermissions={userPermissions}
              tenantRole={tenantRole}
              onAddRecord={onAddRecord}
              onAddRecordBatch={onAddRecordBatch}
              onUpdateRecord={onUpdateRecord}
              onDeleteRecord={onDeleteRecord}
              onDeleteRecordBatch={onDeleteRecordBatch}
              outsourceFormSettings={outsourceFormSettings}
              printTemplates={printTemplates}
              onOpenOutsourceFormPrintTab={() => {
                setOutsourceConfigDefaultTab('print');
                setShowOutsourceConfig(true);
              }}
              onClose={() => {
                setFlowDetailKey(null);
                setFlowDocPhase('detail');
                setFlowDetailExtraRecords(null);
              }}
            />
          )}
        />
      )}

      {receiveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setReceiveModal(null); setReceiveQty(0); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4">
            <h3 className="text-lg font-black text-slate-900">委外收回</h3>
            <div className="text-sm space-y-1">
              {receiveModal.orderNumber != null && <p><span className="text-slate-500">工单：</span><span className="font-bold text-slate-800">{receiveModal.orderNumber}</span></p>}
              <p><span className="text-slate-500">产品：</span><span className="font-bold text-slate-800">{receiveModal.productName}</span></p>
              <p><span className="text-slate-500">工序：</span><span className="font-bold text-indigo-600">{receiveModal.milestoneName}</span></p>
              <p><span className="text-slate-500">待收回数量：</span><span className="font-bold text-amber-600">{receiveModal.pendingQty}</span></p>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">本次收回数量</label>
              <input type="number" min={1} max={receiveModal.pendingQty} value={receiveQty || ''} onChange={e => setReceiveQty(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
            </div>
            {receiveCustomCreateDefs.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">自定义内容</h4>
                <div className="grid gap-3 sm:grid-cols-1">
                  {receiveCustomCreateDefs.map(cf => (
                    <div key={cf.id} className="min-w-0 space-y-1">
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                      <PlanFormCustomFieldInput
                        cf={cf}
                        value={receiveLineCustomValues[cf.id]}
                        onChange={v => setReceiveLineCustomValues(prev => ({ ...prev, [cf.id]: v }))}
                        controlClassName="h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setReceiveModal(null); setReceiveQty(0); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
              <button type="button" onClick={handleOutsourceReceiveSubmit} disabled={receiveQty <= 0 || receiveQty > receiveModal.pendingQty} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors">确认收回</button>
            </div>
          </div>
        </div>
      )}

      {collabSyncConfirm && (
        <OutsourceCollabSyncModal
          tenantId={tenantCtx?.tenantId}
          collabSyncConfirm={collabSyncConfirm}
          collabRoutes={collabRoutes}
          onClose={() => setCollabSyncConfirm(null)}
        />
      )}

      {showOutsourceConfig && onUpdateOutsourceFormSettings && (
        <OutsourceFormConfigModal
          open={showOutsourceConfig}
          onClose={() => setShowOutsourceConfig(false)}
          defaultTabWhenOpen={outsourceConfigDefaultTab}
          productionLinkMode={productionLinkMode}
          outsourceFormSettings={outsourceFormSettings}
          onUpdateOutsourceFormSettings={next => {
            void onUpdateOutsourceFormSettings(next);
          }}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
      )}

      {filePreviewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm" onClick={() => setFilePreviewUrl(null)}>
          <button type="button" onClick={() => setFilePreviewUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
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

      {viewProductId && dictionaries && (
        <PlanProductDetail
          viewProductId={viewProductId}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          globalNodes={globalNodes}
          boms={boms}
          onClose={() => setViewProductId(null)}
          onFilePreview={(url, type) => {
            setFilePreviewUrl(url);
            setFilePreviewType(type);
          }}
        />
      )}
    </div>
  );
};

export default React.memo(OutsourcePanel);
