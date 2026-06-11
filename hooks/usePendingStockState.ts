/**
 * PendingStockPanel 的 state + handler 集中托管 hook (Phase P7 抽离)。
 *
 * 持有:
 * - stockInOrder / stockInForm: 单条选择入库流
 * - batchStockInItems / batchStockForm: 批量入库流
 * - selectedPendingRowKeys: 列表勾选
 * - showStockInFlowModal: 入库流水弹窗开关
 * - stockInFilePreview: 自定义字段附件预览
 * - scannedItem / scannedBatch ref: 防重复扫码
 *
 * 暴露:
 * - 上述 state + setter
 * - 待入库 query/derived 数据 (pendingStockOrders / pendingProdRecords)
 * - 单条 stockInBatch 提交、批量 batchStockIn 提交 handler
 * - 扫码 (applyStockInScan / resolveStockInScanRowPreview / handleStockInBatchConfirm)
 * - 仓库偏好读写、togglePendingRowKey、入库流水弹窗开关
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import type {
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductionOpRecord,
  Warehouse,
  ProductCategory,
  ProcessSequenceMode,
  ProductMilestoneProgress,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import { currentOperatorDisplayName } from '../utils/currentOperatorDisplayName';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../utils/warehouseDocPreference';
import { computePendingStockOrders } from '../utils/pendingStockCompute';
import { getActiveOrderIdsCsv, getActiveSourceProductIdsCsv } from '../utils/stockMaterialHelpers';
import { productHasColorSizeMatrix } from '../utils/productColorSize';
import { itemCodesApi, planVirtualBatchesApi } from '../services/api';
import { rewriteScanApiErrorForIme, type ScanPayload } from '../utils/scanPayload';
import type { ScanBatchRowDetail } from '../utils/scanBatchRowDetail';
import { scanItemResultToRowDetail, scanVirtualBatchResultToRowDetail } from '../utils/scanBatchRowDetail';
import { fetchProductionByFilter, getTodayRangeIso, isoToDateInput } from '../views/production-ops/sharedFlowListHelpers';
import {
  stockInCollabFromCustomData,
  expandPendingByVariantForMatrix,
  type PendingStockItem,
} from '../views/order-list/pendingStockStockInHelpers';
import { buildSingleStockInRecords } from '../utils/pendingStockRecordBuilders';
import {
  findPendingStockRowForScan,
  tryAddScanQtyToStockInForm,
} from '../utils/pendingStockScanMatch';
import { checkExceedMax } from '../utils/scanApplyGuards';

export type StockInForm = {
  warehouseId: string;
  variantQuantities: Record<string, number>;
  singleQuantity: number;
  customData: Record<string, unknown>;
};

/** 待入库扫码解析结果（按 token 缓存，确认时复用以避免重复网络请求） */
type ResolvedPendingScan = {
  row: PendingStockItem;
  variantId: string;
  addQty: number;
  hasColorSize: boolean;
  detail: ScanBatchRowDetail;
  virtualBatchId?: string;
  itemCodeId?: string;
};

export type BatchStockForm = {
  warehouseId: string;
  customData: Record<string, unknown>;
  lines: Record<string, { variantQuantities: Record<string, number>; singleQuantity: number }>;
};

interface UsePendingStockStateArgs {
  open: boolean;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  /** 当前父级面板的 globalNodes（暂保留以备后续 P7 BOM/物料行扩展使用） */
  globalNodes?: GlobalNodeTemplate[];
  prodRecords: ProductionOpRecord[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  productMilestoneProgresses: ProductMilestoneProgress[];
  productionLinkMode: 'order' | 'product';
  /** 暂保留 (可能后续在 hook 中做按序校验) */
  processSequenceMode?: ProcessSequenceMode;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
}

export function usePendingStockState(args: UsePendingStockStateArgs) {
  const {
    open,
    orders,
    products,
    categories,
    prodRecords,
    warehouses,
    dictionaries,
    productMilestoneProgresses,
    productionLinkMode,
    onAddRecord,
    onAddRecordBatch,
  } = args;

  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  /* ---------------- 仓库偏好 ---------------- */
  const singlePendingStockInDefaultWh = useCallback(() => {
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN);
    return resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '') || '';
  }, [warehouses, tenantCtx?.tenantId, userId]);
  const batchPendingStockInDefaultWh = useCallback(() => {
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN_BATCH);
    return resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '') || '';
  }, [warehouses, tenantCtx?.tenantId, userId]);

  /* ---------------- 待入库数据查询 ---------------- */
  const pendingOrderIdsCsv = useMemo(() => getActiveOrderIdsCsv(orders), [orders]);
  const pendingProductIdsCsv = useMemo(() => getActiveSourceProductIdsCsv(orders), [orders]);
  const pendingStockInQuery = useQuery({
    queryKey: ['pendingStockPanel.stockIn', pendingOrderIdsCsv, pendingProductIdsCsv],
    queryFn: () =>
      fetchProductionByFilter({
        type: 'STOCK_IN',
        orderIds: pendingOrderIdsCsv || undefined,
        productIds: pendingProductIdsCsv || undefined,
      }),
    enabled: open && (pendingOrderIdsCsv.length > 0 || pendingProductIdsCsv.length > 0),
    staleTime: 15_000,
  });
  const pendingProdRecords = useMemo<ProductionOpRecord[]>(() => {
    const local = pendingStockInQuery.data;
    if (Array.isArray(local) && local.length > 0) return local;
    return prodRecords ?? [];
  }, [pendingStockInQuery.data, prodRecords]);

  const pendingStockOrders = useMemo(
    (): PendingStockItem[] =>
      computePendingStockOrders(orders, pendingProdRecords, {
        productionLinkMode,
        productMilestoneProgresses,
      }),
    [orders, pendingProdRecords, productionLinkMode, productMilestoneProgresses],
  );

  /* ---------------- 面板状态 ---------------- */
  const [stockInFilePreview, setStockInFilePreview] = useState<{ url: string; type: 'image' | 'pdf' } | null>(null);
  const [stockInOrder, setStockInOrder] = useState<PendingStockItem | null>(null);
  const stockInScannedItemRef = useRef<Set<string>>(new Set());
  const stockInScannedBatchRef = useRef<Set<string>>(new Set());
  /**
   * 待入库批量扫码：按 token 缓存「解析 + 持久化去重」结果。
   * - 扫码（预览）阶段写入；点「确认应用」时命中缓存 → 0 网络请求，避免触发频控；
   * - 待入库清单变化（如已入库消化）或面板关闭时清空，避免使用过期 pendingTotal。
   */
  const preparedPendingScanRef = useRef<Map<string, ResolvedPendingScan>>(new Map());
  const [stockInForm, setStockInForm] = useState<StockInForm>({
    warehouseId: '',
    variantQuantities: {},
    singleQuantity: 0,
    customData: {},
  });
  const [stockInScanLink, setStockInScanLink] = useState<{
    virtualBatchId?: string;
    itemCodeId?: string;
    /** 单品码模式下按规格扫入的单品码列表（追溯逐件命中） */
    itemCodeIdsByVid?: Record<string, string[]>;
    /** 本次是否扫过批次码：批次码模式沿用整批链路，不写逐件列表 */
    hadBatchScan?: boolean;
  }>({});
  const [selectedPendingRowKeys, setSelectedPendingRowKeys] = useState<Set<string>>(new Set());
  const togglePendingRowKey = useCallback((rowKey: string) => {
    setSelectedPendingRowKeys(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }, []);
  const [batchStockInItems, setBatchStockInItems] = useState<PendingStockItem[] | null>(null);
  const [batchStockForm, setBatchStockForm] = useState<BatchStockForm>({
    warehouseId: '',
    customData: {},
    lines: {},
  });
  const [showStockInFlowModal, setShowStockInFlowModal] = useState(false);
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);

  /* ---------------- 副作用:重置 ---------------- */
  useEffect(() => {
    if (!open) {
      setSelectedPendingRowKeys(new Set());
      setBatchStockInItems(null);
      setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
      setStockInOrder(null);
      setStockInForm({
        warehouseId: singlePendingStockInDefaultWh(),
        variantQuantities: {},
        singleQuantity: 0,
        customData: {},
      });
      setStockInScanLink({});
    }
  }, [open, singlePendingStockInDefaultWh]);
  useEffect(() => {
    const valid = new Set(pendingStockOrders.map(i => i.rowKey));
    setSelectedPendingRowKeys(prev => {
      const next = new Set([...prev].filter(id => valid.has(id)));
      return next.size === prev.size && [...prev].every(id => next.has(id)) ? prev : next;
    });
    preparedPendingScanRef.current.clear();
  }, [pendingStockOrders]);
  useEffect(() => {
    if (!open) preparedPendingScanRef.current.clear();
  }, [open]);
  useEffect(() => {
    if (!stockInOrder) {
      stockInScannedItemRef.current.clear();
      stockInScannedBatchRef.current.clear();
      setStockInScanLink({});
    }
  }, [stockInOrder]);

  const matchPendingRowFromScan = useCallback(
    (productId: string, planOrderId: string | undefined, orderNumbers: string[] | undefined) =>
      findPendingStockRowForScan(pendingStockOrders, {
        productId,
        planOrderId,
        orderNumbers,
        productionLinkMode,
      }),
    [pendingStockOrders, productionLinkMode],
  );

  /**
   * 待入库扫码前的持久化去重：scope 覆盖该待入库行对应的所有工单（合并行内 ordersInRow）。
   * - 单品码或批次码已在任一关联工单写入过 STOCK_IN → toast 拒绝；
   * - 仅做去重，超 max 校验在 confirmPendingListScan 的累加阶段做（依赖 pendingByVariant / pendingTotal）。
   */
  const validatePendingStockScan = useCallback(
    async (params: {
      row: PendingStockItem;
      itemCodeId: string | null;
      virtualBatchId: string | null;
    }): Promise<boolean> => {
      const { row, itemCodeId, virtualBatchId } = params;
      if (!itemCodeId && !virtualBatchId) return true;
      const orderIds = Array.from(
        new Set([row.order.id, ...row.ordersInRow.map(o => o.id)].filter(Boolean)),
      );
      try {
        const res = await itemCodesApi.validateUsage({
          purpose: 'STOCK_IN',
          scope: { orderIds },
          itemCodeId,
          virtualBatchId,
        });
        if (res.code === 'DUPLICATE_SAVED') {
          toast.error(res.message || '该码已在本单入库，不可重复扫码');
          return false;
        }
        return true;
      } catch {
        return true;
      }
    },
    [],
  );

  /** `buildApplyStockInScan` 单工单作用域版本：仅按 order.id 去重 */
  const validatePendingStockScanByOrder = useCallback(
    async (params: {
      orderId: string;
      itemCodeId: string | null;
      virtualBatchId: string | null;
    }): Promise<boolean> => {
      const { orderId, itemCodeId, virtualBatchId } = params;
      if (!itemCodeId && !virtualBatchId) return true;
      try {
        const res = await itemCodesApi.validateUsage({
          purpose: 'STOCK_IN',
          scope: { orderId },
          itemCodeId,
          virtualBatchId,
        });
        if (res.code === 'DUPLICATE_SAVED') {
          toast.error(res.message || '该码已在本单入库，不可重复扫码');
          return false;
        }
        return true;
      } catch {
        return true;
      }
    },
    [],
  );

  const resolveScanPayloadForPendingList = useCallback(
    async (
      payload: ScanPayload,
    ): Promise<{
      row: PendingStockItem;
      variantId: string;
      addQty: number;
      hasColorSize: boolean;
      detail: ScanBatchRowDetail;
      virtualBatchId?: string;
      itemCodeId?: string;
    } | null> => {
      if (!payload.token) return null;
      const cacheKey = `${payload.kind}:${payload.token}`;
      const cached = preparedPendingScanRef.current.get(cacheKey);
      if (cached) return cached;
      try {
        if (payload.kind === 'ITEM') {
          const res = await itemCodesApi.scan(payload.token);
          if (res.kind !== 'ITEM_CODE') return null;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return null;
          }
          if (!res.productId) {
            toast.error('扫码结果缺少产品信息');
            return null;
          }
          const row = matchPendingRowFromScan(
            res.productId,
            res.callerContext?.callerPlanOrderId ?? res.planOrderId,
            res.orderNumbers,
          );
          if (!row) {
            toast.error('此码无对应待入库记录');
            return null;
          }
          const product = productMap.get(res.productId);
          const category = product ? categoryMap.get(product.categoryId) : undefined;
          const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);
          const vid = res.variantId || '';
          if (hasColorSize && !vid) {
            toast.error('产品按规格管理，码未带规格');
            return null;
          }
          const okValidate = await validatePendingStockScan({
            row,
            itemCodeId: res.itemCodeId ?? null,
            virtualBatchId: res.batchId ?? null,
          });
          if (!okValidate) return null;
          const resolved: ResolvedPendingScan = {
            row,
            variantId: vid,
            addQty: 1,
            hasColorSize,
            detail: scanItemResultToRowDetail(res),
            virtualBatchId: res.batchId ?? undefined,
            itemCodeId: res.itemCodeId,
          };
          preparedPendingScanRef.current.set(cacheKey, resolved);
          return resolved;
        }
        if (payload.kind === 'BATCH') {
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.kind !== 'VIRTUAL_BATCH') return null;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return null;
          }
          if (!res.productId) {
            toast.error('扫码结果缺少产品信息');
            return null;
          }
          const row = matchPendingRowFromScan(
            res.productId,
            res.callerContext?.callerPlanOrderId ?? res.planOrderId,
            res.orderNumbers,
          );
          if (!row) {
            toast.error('此码无对应待入库记录');
            return null;
          }
          const product = productMap.get(res.productId);
          const category = product ? categoryMap.get(product.categoryId) : undefined;
          const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);
          const vid = res.variantId || '';
          if (hasColorSize && !vid) {
            toast.error('产品按规格管理，码未带规格');
            return null;
          }
          const qty = res.quantity ?? 0;
          if (qty <= 0) {
            toast.error('批次数量无效');
            return null;
          }
          const okValidate = await validatePendingStockScan({
            row,
            itemCodeId: null,
            virtualBatchId: res.batchId ?? null,
          });
          if (!okValidate) return null;
          const resolved: ResolvedPendingScan = {
            row,
            variantId: vid,
            addQty: qty,
            hasColorSize,
            detail: scanVirtualBatchResultToRowDetail(res),
            virtualBatchId: res.batchId,
          };
          preparedPendingScanRef.current.set(cacheKey, resolved);
          return resolved;
        }
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return null;
      }
      return null;
    },
    [matchPendingRowFromScan, productMap, categoryMap, validatePendingStockScan],
  );

  const resolvePendingListScanPreview = useCallback(
    async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      const r = await resolveScanPayloadForPendingList(payload);
      return r?.detail ?? null;
    },
    [resolveScanPayloadForPendingList],
  );

  const confirmPendingListScan = useCallback(
    async (payloads: ScanPayload[]): Promise<boolean> => {
      if (payloads.length === 0) {
        toast.error('请先扫码');
        return false;
      }

      let targetRow: PendingStockItem | null = null;
      let formSlice = { variantQuantities: {} as Record<string, number>, singleQuantity: 0 };
      const scanLink: {
        virtualBatchId?: string;
        itemCodeId?: string;
        itemCodeIdsByVid: Record<string, string[]>;
        hadBatchScan: boolean;
      } = { itemCodeIdsByVid: {}, hadBatchScan: false };
      const seen = new Set<string>();

      for (const payload of payloads) {
        if (!payload.token) continue;
        const key = `${payload.kind}:${payload.token}`;
        if (seen.has(key)) {
          toast.warning('列表中存在重复扫码');
          return false;
        }
        seen.add(key);

        const parsed = await resolveScanPayloadForPendingList(payload);
        if (!parsed) return false;

        if (!targetRow) {
          targetRow = parsed.row;
        } else if (targetRow.rowKey !== parsed.row.rowKey) {
          toast.error('本次扫码对应多个不同待入库工单，请分开扫码');
          return false;
        }

        const pitProduct = productMap.get(parsed.row.order.productId);
        const pitCategory = pitProduct ? categoryMap.get(pitProduct.categoryId) : undefined;
        const caps = expandPendingByVariantForMatrix(parsed.row, pitProduct, pitCategory);
        const tryResult = tryAddScanQtyToStockInForm(formSlice, {
          hasColorSize: parsed.hasColorSize,
          pendingTotal: parsed.row.pendingTotal,
          pendingByVariant: caps,
          variantId: parsed.variantId,
          addQty: parsed.addQty,
        });
        if (tryResult.ok === false) {
          toast.error(tryResult.message ?? '本次扫入数量超过待入库上限');
          return false;
        }
        formSlice = tryResult.form;
        if (parsed.virtualBatchId) scanLink.virtualBatchId = parsed.virtualBatchId;
        if (parsed.itemCodeId) {
          scanLink.itemCodeId = parsed.itemCodeId;
          const vid = parsed.variantId || '';
          const arr = scanLink.itemCodeIdsByVid[vid] ?? [];
          if (!arr.includes(parsed.itemCodeId)) arr.push(parsed.itemCodeId);
          scanLink.itemCodeIdsByVid[vid] = arr;
        } else if (parsed.virtualBatchId) {
          // 批次码扫入（含批次码模式扫单品码后解析为批次）→ 沿用整批链路
          scanLink.hadBatchScan = true;
        }
      }

      if (!targetRow) {
        toast.error('扫码未匹配到待入库清单');
        return false;
      }

      setBatchStockInItems(null);
      setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
      setStockInOrder(targetRow);
      setStockInScanLink(scanLink);
      setStockInForm({
        warehouseId: singlePendingStockInDefaultWh(),
        variantQuantities: formSlice.variantQuantities,
        singleQuantity: formSlice.singleQuantity,
        customData: {},
      });
      for (const key of seen) {
        const [kind, token] = key.split(':');
        if (kind === 'ITEM' && token) stockInScannedItemRef.current.add(token);
        if (kind === 'BATCH' && token) stockInScannedBatchRef.current.add(token);
      }
      toast.success('已进入确认入库，请核对仓库与数量后提交');
      return true;
    },
    [
      resolveScanPayloadForPendingList,
      productMap,
      categoryMap,
      singlePendingStockInDefaultWh,
    ],
  );

  /* ---------------- 扫码 (确认入库页不再扫码，保留供兼容) ---------------- */
  const buildApplyStockInScan = useCallback(
    (order: ProductionOrder, hasColorSize: boolean, pendingTotal: number) => async (payload: ScanPayload): Promise<boolean> => {
      if (!payload.token) return false;
      try {
        if (payload.kind === 'ITEM') {
          if (stockInScannedItemRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return false;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.kind !== 'ITEM_CODE') return false;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return false;
          }
          if (res.productId !== order.productId) {
            toast.error('此码产品与当前入库工单不一致');
            return false;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (order.planOrderId && callerPlanId !== order.planOrderId) {
            toast.error('此码不属于当前工单所在计划');
            return false;
          }
          const vid = res.variantId || '';
          if (hasColorSize && !vid) {
            toast.error('产品按规格管理，码未带规格');
            return false;
          }
          const okDup = await validatePendingStockScanByOrder({
            orderId: order.id,
            itemCodeId: res.itemCodeId ?? null,
            virtualBatchId: res.batchId ?? null,
          });
          if (!okDup) return false;
          if (hasColorSize) {
            const exceeded = checkExceedMax(stockInForm.variantQuantities[vid] ?? 0, 1, undefined);
            void exceeded;
            setStockInForm(f => ({
              ...f,
              variantQuantities: { ...f.variantQuantities, [vid]: (f.variantQuantities[vid] ?? 0) + 1 },
            }));
          } else {
            const ck = checkExceedMax(stockInForm.singleQuantity || 0, 1, pendingTotal);
            if (ck.exceeds) {
              toast.error(ck.message ?? '本次扫入数量超过该单待入库上限');
              return false;
            }
            setStockInForm(f => ({ ...f, singleQuantity: (f.singleQuantity || 0) + 1 }));
          }
          stockInScannedItemRef.current.add(payload.token);
          toast.success(
            `扫码入库 +1${res.variantLabel ? `（${res.variantLabel}）` : ''}${
              res.ownerTenantName && res.callerContext?.relation !== 'OWNER' ? ` · 来自 ${res.ownerTenantName}` : ''
            }`,
          );
          return true;
        }
        if (payload.kind === 'BATCH') {
          if (stockInScannedBatchRef.current.has(payload.token)) {
            toast.warning('此批次码已扫描过');
            return false;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.kind !== 'VIRTUAL_BATCH') return false;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return false;
          }
          if (res.productId !== order.productId) {
            toast.error('此批次码产品与当前入库工单不一致');
            return false;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (order.planOrderId && callerPlanId !== order.planOrderId) {
            toast.error('此批次码不属于当前工单所在计划');
            return false;
          }
          const qty = res.quantity ?? 0;
          const vid = res.variantId || '';
          if (hasColorSize && !vid) {
            toast.error('产品按规格管理，码未带规格');
            return false;
          }
          const okDup = await validatePendingStockScanByOrder({
            orderId: order.id,
            itemCodeId: null,
            virtualBatchId: res.batchId ?? null,
          });
          if (!okDup) return false;
          if (hasColorSize) {
            setStockInForm(f => ({
              ...f,
              variantQuantities: { ...f.variantQuantities, [vid]: (f.variantQuantities[vid] ?? 0) + qty },
            }));
          } else {
            const ck = checkExceedMax(stockInForm.singleQuantity || 0, qty, pendingTotal);
            if (ck.exceeds) {
              toast.error(ck.message ?? '本次扫入数量超过该单待入库上限');
              return false;
            }
            setStockInForm(f => ({ ...f, singleQuantity: (f.singleQuantity || 0) + qty }));
          }
          stockInScannedBatchRef.current.add(payload.token);
          toast.success(
            `批次码入库 +${qty}${res.variantLabel ? `（${res.variantLabel}）` : ''}${
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
    [stockInForm.variantQuantities, stockInForm.singleQuantity, validatePendingStockScanByOrder],
  );

  const buildResolveStockInScanRowPreview = useCallback(
    (order: ProductionOrder, hasColorSize: boolean) => async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      if (!payload.token) return null;
      try {
        if (payload.kind === 'ITEM') {
          if (stockInScannedItemRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return null;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.kind !== 'ITEM_CODE') return null;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return null;
          }
          if (res.productId !== order.productId) {
            toast.error('此码产品与当前入库工单不一致');
            return null;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (order.planOrderId && callerPlanId !== order.planOrderId) {
            toast.error('此码不属于当前工单所在计划');
            return null;
          }
          const vid = res.variantId || '';
          if (hasColorSize && !vid) {
            toast.error('产品按规格管理，码未带规格');
            return null;
          }
          return scanItemResultToRowDetail(res);
        }
        if (payload.kind === 'BATCH') {
          if (stockInScannedBatchRef.current.has(payload.token)) {
            toast.warning('此批次码已扫描过');
            return null;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.kind !== 'VIRTUAL_BATCH') return null;
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return null;
          }
          if (res.productId !== order.productId) {
            toast.error('此批次码产品与当前入库工单不一致');
            return null;
          }
          const callerPlanId = res.callerContext?.callerPlanOrderId ?? res.planOrderId;
          if (order.planOrderId && callerPlanId !== order.planOrderId) {
            toast.error('此批次码不属于当前工单所在计划');
            return null;
          }
          const vid = res.variantId || '';
          if (hasColorSize && !vid) {
            toast.error('产品按规格管理，码未带规格');
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
    [],
  );

  /* ---------------- 提交:单条入库 ---------------- */
  const submitSingleStockIn = useCallback(
    async (params: { unitName: string }) => {
      if (!stockInOrder) return;
      if (!(onAddRecord || onAddRecordBatch)) return;

      const product = productMap.get(stockInOrder.order.productId);
      const category = product ? categoryMap.get(product.categoryId) : undefined;
      const hasColorSize = productHasColorSizeMatrix(product ?? undefined, category ?? undefined);

      const ts = new Date().toLocaleString();
      const operator = docOperator;

      const records = buildSingleStockInRecords({
        order: stockInOrder.order,
        ordersInRow: stockInOrder.ordersInRow,
        productionLinkMode,
        hasColorSize,
        hasVariants: !!product?.variants?.length,
        variantQuantities: stockInForm.variantQuantities,
        singleQuantity: stockInForm.singleQuantity,
        warehouseId: stockInForm.warehouseId || undefined,
        customData: stockInForm.customData,
        virtualBatchId: stockInScanLink.virtualBatchId,
        itemCodeId: stockInScanLink.itemCodeId,
        scanItemCodeIdsByVid: stockInScanLink.itemCodeIdsByVid,
        hadBatchScan: stockInScanLink.hadBatchScan,
        operator,
        timestamp: ts,
        prodRecords,
      });
      if (records.length === 0) return;

      if (onAddRecordBatch) await onAddRecordBatch(records);
      else for (const rec of records) await onAddRecord!(rec);

      const totalQty = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      toast.success('入库已保存', {
        description: `${records.length} 条明细，合计 ${totalQty} ${params.unitName}（入库单号由系统自动分配）`,
      });
      if (stockInForm.warehouseId) {
        writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN, {
          warehouseId: stockInForm.warehouseId,
        });
      }
      setStockInOrder(null);
      setStockInForm({ warehouseId: singlePendingStockInDefaultWh(), variantQuantities: {}, singleQuantity: 0, customData: {} });
    },
    [
      stockInOrder,
      stockInForm,
      stockInScanLink,
      onAddRecord,
      onAddRecordBatch,
      productMap,
      categoryMap,
      productionLinkMode,
      docOperator,
      prodRecords,
      tenantCtx?.tenantId,
      userId,
      singlePendingStockInDefaultWh,
    ],
  );

  /* ---------------- 提交:批量入库 ---------------- */
  const submitBatchStockIn = useCallback(async () => {
    if (!batchStockInItems || batchStockInItems.length === 0) return;
    if (!(onAddRecord || onAddRecordBatch)) return;

    const ts = new Date().toLocaleString();
    const operator = docOperator;
    const allRecords: ProductionOpRecord[] = [];
    for (const pit of batchStockInItems) {
      const line = batchStockForm.lines[pit.rowKey];
      if (!line) continue;
      const p = productMap.get(pit.order.productId);
      const cat = p ? categoryMap.get(p.categoryId) : undefined;
      const hasCS = productHasColorSizeMatrix(p ?? undefined, cat ?? undefined);

      const subset = buildSingleStockInRecords({
        order: pit.order,
        ordersInRow: pit.ordersInRow,
        productionLinkMode,
        hasColorSize: hasCS,
        hasVariants: !!p?.variants?.length,
        variantQuantities: line.variantQuantities,
        singleQuantity: line.singleQuantity,
        warehouseId: batchStockForm.warehouseId || undefined,
        customData: batchStockForm.customData,
        operator,
        timestamp: ts,
        prodRecords,
      });
      allRecords.push(...subset);
    }
    if (allRecords.length === 0) return;

    if (onAddRecordBatch) await onAddRecordBatch(allRecords);
    else for (const rec of allRecords) await onAddRecord!(rec);

    if (batchStockForm.warehouseId) {
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PROD_PENDING_STOCK_IN_BATCH, {
        warehouseId: batchStockForm.warehouseId,
      });
    }
    const totalQty = allRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    toast.success('批量入库已保存', {
      description: `${allRecords.length} 条明细，合计 ${totalQty} 件（入库单号由系统自动分配）`,
    });
    setBatchStockInItems(null);
    setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
    setSelectedPendingRowKeys(new Set());
  }, [
    batchStockInItems,
    batchStockForm,
    onAddRecord,
    onAddRecordBatch,
    productMap,
    categoryMap,
    productionLinkMode,
    docOperator,
    prodRecords,
    tenantCtx?.tenantId,
    userId,
  ]);

  /* ---------------- 单元工具 ---------------- */
  const getUnitName = useCallback(
    (productId: string) => {
      const p = productMap.get(productId);
      const u = (dictionaries.units ?? []).find((x: { id: string; name: string }) => x.id === p?.unitId);
      return (u as { name: string } | undefined)?.name ?? 'PCS';
    },
    [productMap, dictionaries.units],
  );

  /** 单条选择入库表单的 cap 计算辅助 */
  const computePendingCapsForSingle = useCallback(
    (item: PendingStockItem) => {
      const p = productMap.get(item.order.productId);
      const cat = p ? categoryMap.get(p.categoryId) : undefined;
      return expandPendingByVariantForMatrix(item, p ?? undefined, cat ?? undefined);
    },
    [productMap, categoryMap],
  );

  /** 关联模式中"按 collab 字段写出 STOCK_IN" 入口暴露,供其它面板复用(目前未用) */
  const _collabFromCustomData = stockInCollabFromCustomData;
  void _collabFromCustomData;

  return {
    /* 数据 */
    pendingStockOrders,
    productMap,
    categoryMap,
    /* 单元工具 */
    getUnitName,
    computePendingCapsForSingle,
    /* 仓库偏好 */
    singlePendingStockInDefaultWh,
    batchPendingStockInDefaultWh,
    /* state */
    stockInOrder,
    setStockInOrder,
    stockInForm,
    setStockInForm,
    batchStockInItems,
    setBatchStockInItems,
    batchStockForm,
    setBatchStockForm,
    selectedPendingRowKeys,
    setSelectedPendingRowKeys,
    togglePendingRowKey,
    showStockInFlowModal,
    setShowStockInFlowModal,
    stockInFilePreview,
    setStockInFilePreview,
    todayDate,
    /* 扫码：清单弹窗扫 → 确认后进入单条确认入库页 */
    confirmPendingListScan,
    resolvePendingListScanPreview,
    buildApplyStockInScan,
    buildResolveStockInScanRowPreview,
    /* 提交 */
    submitSingleStockIn,
    submitBatchStockIn,
  };
}
