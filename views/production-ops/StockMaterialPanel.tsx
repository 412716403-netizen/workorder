import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Product } from '../../types';
import { fetchProductionByFilter, getTodayRangeIso } from './sharedFlowListHelpers';
import {
  getActiveOrderIdsCsv,
  getActiveSourceProductIdsCsv,
  buildNodeWeightEnabledMap,
} from '../../utils/stockMaterialHelpers';
import {
  ArrowUpFromLine,
  Undo2,
  Layers,
  ScrollText,
  Check,
  Package,
  Sliders,
  Building2,
  Search,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type {
  ProductionOpRecord,
  ProductionOrder,
  PlanOrder,
  ProdOpType,
  MaterialPanelSettings,
  MaterialFormSettings,
  PrintTemplate,
  MaterialBreakdownRow,
  PsiRecord,
} from '../../types';
import { DEFAULT_MATERIAL_PANEL_SETTINGS, DEFAULT_MATERIAL_FORM_SETTINGS } from '../../types';
import { PanelProps, hasOpsPerm, getOrderFamilyIds, type StockDocDetail } from './types';
import { orderCreatedMs } from '../../utils/orderCenterSort';
import { shouldShowOrderInIncompleteListFilter } from '../../utils/orderDispatchListFilter';
import { buildMaterialStockCustomCollabPayload } from '../../utils/productionOpCollab/material';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { categoryUsesBatchManagement, BATCH_NO_UNTAGGED } from '../../types';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import * as api from '../../services/api';
import { toast } from 'sonner';

import {
  computeAllParentMaterialStats,
  computeAllProductMaterialStats,
} from '../../utils/computeOrderMaterialStats';
import {
  filterMaterialRowsWithActivity,
  displayMaterialsForKeyword,
  visibleMaterialRowsForList,
  resolveBomItems,
  applyMaterialBreakdown,
  type MatRow,
} from './stockMaterialPanelHelpers';
import { MaterialStatsTable } from './MaterialStatsTable';

interface StockMaterialPanelProps extends PanelProps {
  /** 与进销存快照合并批次选项（领料确认弹窗） */
  psiRecords?: PsiRecord[];
  plans?: PlanOrder[];
  materialPanelSettings?: MaterialPanelSettings;
  onUpdateMaterialPanelSettings?: (settings: MaterialPanelSettings) => void;
  materialFormSettings?: MaterialFormSettings;
  onUpdateMaterialFormSettings?: (settings: MaterialFormSettings) => void;
  printTemplates?: PrintTemplate[];
  onUpdatePrintTemplates?: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
}
import { useDataIndexes } from './useDataIndexes';
import {
  formConfigToolbarButtonClass,
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../../styles/uiDensity';
import StockConfirmModal from './StockConfirmModal';
import StockDocDetailModal from './StockDocDetailModal';
import StockFlowListModal from './StockFlowListModal';
import StockMaterialFormModal from './StockMaterialFormModal';
import MaterialFormConfigModal from './MaterialFormConfigModal';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';

const StockMaterialPanel: React.FC<StockMaterialPanelProps> = ({
  productionLinkMode,
  productMilestoneProgresses,
  plans = [],
  records: legacyRecords,
  orders,
  products,
  categories,
  warehouses,
  boms,
  dictionaries,
  globalNodes,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
  materialPanelSettings = DEFAULT_MATERIAL_PANEL_SETTINGS,
  onUpdateMaterialPanelSettings,
  materialFormSettings = DEFAULT_MATERIAL_FORM_SETTINGS,
  onUpdateMaterialFormSettings,
  printTemplates = [],
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  psiRecords = [],
}) => {
  const { tenantCtx, userId, currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);

  /**
   * Phase 3.E：StockMaterialPanel 自取数据，按当前 tab 的活动工单 ids 收窄拉取 STOCK_OUT / STOCK_RETURN / OUTSOURCE。
   * 不再消费上游 ProductionMgmtOpsView 的 12000 上限全量。`legacyRecords` 仅做加载未完成时的兜底。
   *
   * 关联产品模式补丁：领退料写入时 `orderId=null` + `sourceProductId=成品 id`，仅按 orderIds
   * 窄拉会漏掉这些记录（"净已领 0" bug）。同时按 `sourceProductIds=活动工单的 productId 集合` 取并集。
   */
  const activeOrderIdsCsv = useMemo(() => getActiveOrderIdsCsv(orders), [orders]);
  const activeSourceProductIdsCsv = useMemo(() => getActiveSourceProductIdsCsv(orders), [orders]);
  const stockPanelQuery = useQuery({
    queryKey: ['stockPanel.records', activeOrderIdsCsv, activeSourceProductIdsCsv],
    queryFn: () =>
      fetchProductionByFilter({
        types: 'STOCK_OUT,STOCK_RETURN,OUTSOURCE',
        orderIds: activeOrderIdsCsv || undefined,
        /**
         * 关联产品模式整件外发：OUTSOURCE 记录 `orderId=null` + 无 `sourceProductId`，
         * 仅靠 `orderIds` / `sourceProductIds` 命中不到，必须叠加 `productIds` 才能取回，
         * 否则"按加工厂展示"分桶里的外协理论耗材会全部为 0。
         */
        productIds: activeSourceProductIdsCsv || undefined,
        sourceProductIds: activeSourceProductIdsCsv || undefined,
      }),
    enabled: activeOrderIdsCsv.length > 0 || activeSourceProductIdsCsv.length > 0,
    staleTime: 15_000,
  });
  /**
   * 取号用：仅拉今日 STOCK_OUT，避免按 orderIds 全量拉时跨日复杂；按日期收窄一页足够。
   */
  const todayRangeRef = useMemo(() => getTodayRangeIso(), []);
  const todayStockOutQuery = useQuery({
    queryKey: ['stockPanel.todayStockOut', todayRangeRef.from, todayRangeRef.to],
    queryFn: () =>
      fetchProductionByFilter({
        types: 'STOCK_OUT',
        startDate: todayRangeRef.from,
        endDate: todayRangeRef.to,
      }),
    staleTime: 15_000,
  });
  const records = useMemo<ProductionOpRecord[]>(() => {
    const main = stockPanelQuery.data ?? legacyRecords ?? [];
    const today = todayStockOutQuery.data ?? [];
    if (today.length === 0) return main;
    const seen = new Set(main.map(r => r.id));
    const merged = [...main];
    for (const r of today) if (!seen.has(r.id)) merged.push(r);
    return merged;
  }, [stockPanelQuery.data, legacyRecords, todayStockOutQuery.data]);
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:material_list:allow');
  const toggleSelect = (productId: string) => setStockSelectedIds(prev => { const next = new Set(prev); if (next.has(productId)) next.delete(productId); else next.add(productId); return next; });

  const [showModal, setShowModal] = useState(false);
  const [stockModalMode, setStockModalMode] = useState<'stock_out' | 'stock_return' | null>(null);
  const [showStockFlowModal, setShowStockFlowModal] = useState(false);
  const [stockSelectOrderId, setStockSelectOrderId] = useState<string | null>(null);
  const [stockSelectMode, setStockSelectMode] = useState<'stock_out' | 'stock_return' | null>(null);
  const [stockSelectedIds, setStockSelectedIds] = useState<Set<string>>(new Set());
  const [stockSelectSourceProductId, setStockSelectSourceProductId] = useState<string | null>(null);
  const [showStockConfirmModal, setShowStockConfirmModal] = useState(false);
  const [stockConfirmQuantities, setStockConfirmQuantities] = useState<Record<string, number>>({});
  const [stockConfirmWarehouseId, setStockConfirmWarehouseId] = useState('');
  const [stockConfirmReason, setStockConfirmReason] = useState('');
  const [stockConfirmCustomValues, setStockConfirmCustomValues] = useState<Record<string, unknown>>({});
  /** 确认领退料弹窗内按物料行的批次 */
  const [stockConfirmBatches, setStockConfirmBatches] = useState<Record<string, string>>({});
  const [stockDocDetail, setStockDocDetail] = useState<StockDocDetail | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [materialFormConfigEntryTab, setMaterialFormConfigEntryTab] = useState<'fields' | 'print' | 'list'>('fields');
  const [stockSelectPartner, setStockSelectPartner] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');
  const debouncedMaterialSearch = useDebouncedValue(materialSearch, 300);

  const PAGE_SIZE = materialPanelSettings.groupByOutsourcePartner ? 5 : 10;
  const onlyShowIncompleteOrders =
    productionLinkMode === 'order' && materialPanelSettings.onlyShowNotCompletedOrder === true;
  const [stockPage, setStockPage] = useState(1);
  useEffect(() => {
    setStockPage(1);
  }, [productionLinkMode, materialPanelSettings.groupByOutsourcePartner, materialPanelSettings.onlyShowNotCompletedOrder, debouncedMaterialSearch]);

  const idx = useDataIndexes(orders, products, boms, [] /* no globalNodes needed */, productMilestoneProgresses);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  /**
   * 工序当前是否开启"称重报工"。报工/外协收回记录里的 materialBreakdown 是写入时按工序当时配置固化的快照，
   * 工序后续改回"非称重"会让这份快照变得不准（同物料数量却显示极小的实际重量），所以面板按当前开关决定是否信任快照。
   */
  const nodeWeightEnabledMap = useMemo(() => buildNodeWeightEnabledMap(globalNodes), [globalNodes]);
  const renderProductCustomTags = useCallback((product: Product | undefined) => {
    if (!product) return null;
    return getProductCategoryCustomFieldEntries(product, categoryMap.get(product.categoryId), {
      includeFile: false,
    }).map(({ field, display }) => (
      <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
        {field.label}: {display}
      </span>
    ));
  }, [categoryMap]);

  const resolveConfirmDefaultWarehouse = useCallback(
    (mode: 'stock_out' | 'stock_return') => {
      const kind =
        mode === 'stock_out' ? WAREHOUSE_DOC_KIND.PROD_STOCK_CONFIRM_OUT : WAREHOUSE_DOC_KIND.PROD_STOCK_CONFIRM_IN;
      const pref = readWarehousePreference(tenantCtx?.tenantId, userId, kind);
      return resolvePreferredSingleWarehouse(warehouses, pref, warehouses[0]?.id ?? '') || '';
    },
    [warehouses, tenantCtx?.tenantId, userId],
  );

  const parentOrders = useMemo(() => orders.filter(o => !o.parentOrderId), [orders]);

  /** 按父工单聚合：父工单 id -> 该父工单及所有子工单下各物料的 领料/退料/净领用/报工理论耗材 汇总；含 BOM 全部物料（无记录时也显示） */
  const parentMaterialStats = useMemo(
    () =>
      computeAllParentMaterialStats({
        orders,
        idx,
        stockRecords: records,
        nodeWeightEnabledMap,
      }),
    [records, orders, idx, nodeWeightEnabledMap],
  );

  /** 关联产品模式：按成品聚合物料（多工单同产品合并一行卡片） */
  const productMaterialStatsByProduct = useMemo(() => {
    if (productionLinkMode !== 'product') return null as Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number; actualCost: number }[]> | null;
    return computeAllProductMaterialStats({
      orders,
      idx,
      stockRecords: records,
      productMilestoneProgresses,
      nodeWeightEnabledMap,
    });
  }, [productionLinkMode, records, orders, productMilestoneProgresses, idx, nodeWeightEnabledMap]);

  /** 开启「按委外加工厂展示」时：按 partner 拆分领退 + 理论耗材 */
  const partnerMaterialGroups = useMemo(() => {
    if (!materialPanelSettings.groupByOutsourcePartner) return null;

    const INTERNAL_KEY = '__internal__';
    const { productsById, bomsById, bomsByParentProduct, ordersById } = idx;

    const rootIdCache = new Map<string, string>();
    const getRootOrderId = (orderId: string): string => {
      const cached = rootIdCache.get(orderId);
      if (cached !== undefined) return cached;
      let cur = orderId;
      for (let i = 0; i < 10; i++) {
        const o = ordersById.get(cur);
        if (!o?.parentOrderId) break;
        cur = o.parentOrderId;
      }
      rootIdCache.set(orderId, cur);
      return cur;
    };

    type MatAcc = { issue: number; returnQty: number; theoryCost: number; actualCost: number };
    type Buckets = Map<string, Map<string, Map<string, MatAcc>>>;
    const buckets: Buckets = new Map();
    const ensure = (pk: string, sk: string, matId: string): MatAcc => {
      if (!buckets.has(pk)) buckets.set(pk, new Map());
      const pMap = buckets.get(pk)!;
      if (!pMap.has(sk)) pMap.set(sk, new Map());
      const sMap = pMap.get(sk)!;
      if (!sMap.has(matId)) sMap.set(matId, { issue: 0, returnQty: 0, theoryCost: 0, actualCost: 0 });
      return sMap.get(matId)!;
    };

    // Step 1: seed internal bucket with total theory/actual from existing aggregation
    const totalSource = productionLinkMode === 'product' ? productMaterialStatsByProduct : parentMaterialStats;
    if (totalSource) {
      for (const [scopeKey, rows] of totalSource.entries()) {
        for (const row of rows) {
          const acc = ensure(INTERNAL_KEY, scopeKey, row.productId);
          acc.theoryCost = row.theoryCost;
          acc.actualCost = row.actualCost;
        }
      }
    }

    // Step 2: split STOCK_OUT / STOCK_RETURN by partner
    const getScopeKey = (r: ProductionOpRecord): string | null => {
      if (productionLinkMode === 'product') {
        if (r.sourceProductId) return r.sourceProductId;
        if (r.orderId) {
          const rootId = getRootOrderId(r.orderId);
          return ordersById.get(rootId)?.productId || null;
        }
        return null;
      }
      return r.orderId ? getRootOrderId(r.orderId) : null;
    };

    for (const r of records) {
      if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') continue;
      const pk = r.partner?.trim() || INTERNAL_KEY;
      const sk = getScopeKey(r);
      if (!sk) continue;
      const acc = ensure(pk, sk, r.productId);
      if (r.type === 'STOCK_OUT') acc.issue += r.quantity;
      else acc.returnQty += r.quantity;
    }

    // Step 3: compute outsource partner theory from OUTSOURCE 已收回 × BOM, deduct from internal
    for (const r of records) {
      if (r.type !== 'OUTSOURCE' || r.status !== '已收回' || r.sourceReworkId) continue;
      const pk = r.partner?.trim() || INTERNAL_KEY;
      if (pk === INTERNAL_KEY || !r.nodeId) continue;

      let scopeKey: string | null = null;
      let productForBom: string | null = null;
      if (productionLinkMode === 'product') {
        scopeKey = r.productId;
        productForBom = r.productId;
      } else if (r.orderId) {
        scopeKey = getRootOrderId(r.orderId);
        productForBom = ordersById.get(r.orderId)?.productId || null;
      }
      if (!scopeKey || !productForBom) continue;

      // kind 决定计入实际称重（actual）还是按件理论（theory），从本厂同口径桶里扣减以守恒。
      const applyPartnerCost = (pid: string, amt: number, kind: 'theoryCost' | 'actualCost') => {
        ensure(pk, scopeKey!, pid)[kind] += amt;
        const internal = ensure(INTERNAL_KEY, scopeKey!, pid);
        internal[kind] = Math.max(0, internal[kind] - amt);
      };
      // 外协收回：仅当该工序当前开启称重 + 记录里存有 materialBreakdown 快照时，才按实际重量（actualCost）计入加工厂分桶；
      // 否则一律走 "本工序 BOM × 件数"（theoryCost）。若该工序在本产品上根本没配 BOM（典型如套口/裁剪等只是工序流转），
      // 既不动本厂理论也不进加工厂桶——避免无关加工厂被错误带出现在物料面板里。
      const nodeWeightOn = !!nodeWeightEnabledMap.get(r.nodeId);
      if (!applyMaterialBreakdown(r, (pid, amt) => applyPartnerCost(pid, amt, 'actualCost'), nodeWeightOn)) {
        const bomItems = resolveBomItems(productsById, bomsById, bomsByParentProduct, productForBom, r.nodeId, r.variantId);
        for (const bi of bomItems) {
          applyPartnerCost(bi.productId, Number(bi.quantity) * r.quantity, 'theoryCost');
        }
      }
    }

    // Step 4: build sorted output — 本厂首位，其余加工厂按名称字母序
    const allKeys = [...buckets.keys()].sort((a, b) => {
      if (a === INTERNAL_KEY) return b === INTERNAL_KEY ? 0 : -1;
      if (b === INTERNAL_KEY) return 1;
      return a.localeCompare(b);
    });

    return allKeys.map(pk => {
      const scopeMap = buckets.get(pk)!;
      const data = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number; actualCost: number }[]>();
      for (const [sk, matMap] of scopeMap.entries()) {
        data.set(sk, Array.from(matMap.entries()).map(([pid, v]) => ({ productId: pid, ...v })));
      }
      return { partnerKey: pk, partnerLabel: pk === INTERNAL_KEY ? '本厂' : pk, data };
    });
  }, [materialPanelSettings.groupByOutsourcePartner, records, orders, productionLinkMode, idx, parentMaterialStats, productMaterialStatsByProduct, nodeWeightEnabledMap]);

  const materialKw = debouncedMaterialSearch.trim().toLowerCase();

  const partnerGroupsForDisplay = useMemo(() => {
    if (!materialPanelSettings.groupByOutsourcePartner || !partnerMaterialGroups) return null;
    if (!materialKw) return partnerMaterialGroups;

    const materialsHit = (materials: MatRow[]) =>
      materials.some(m => {
        const p = idx.productsById.get(m.productId);
        return (p?.name ?? '').toLowerCase().includes(materialKw) || (p?.sku ?? '').toLowerCase().includes(materialKw);
      });

    const productScopeHit = (fpId: string, materials: MatRow[]) => {
      if (materialsHit(materials)) return true;
      const fp = idx.productsById.get(fpId);
      if ((fp?.name ?? '').toLowerCase().includes(materialKw) || (fp?.sku ?? '').toLowerCase().includes(materialKw)) return true;
      const scopeOrders = idx.ordersByProductId.get(fpId) ?? [];
      return scopeOrders.some(o =>
        (o.orderNumber ?? '').toLowerCase().includes(materialKw) ||
        (o.customer ?? '').toLowerCase().includes(materialKw) ||
        (o.productName ?? '').toLowerCase().includes(materialKw)
      );
    };

    const orderScopeHit = (orderId: string, materials: MatRow[]) => {
      if (materialsHit(materials)) return true;
      const order = idx.ordersById.get(orderId);
      if (!order) return false;
      const prod = idx.productsById.get(order.productId);
      return (
        (order.orderNumber ?? '').toLowerCase().includes(materialKw) ||
        (order.customer ?? '').toLowerCase().includes(materialKw) ||
        (order.productName ?? '').toLowerCase().includes(materialKw) ||
        (prod?.name ?? '').toLowerCase().includes(materialKw) ||
        (prod?.sku ?? '').toLowerCase().includes(materialKw)
      );
    };

    return partnerMaterialGroups
      .map(pg => {
        const partnerHit =
          (pg.partnerLabel || '').toLowerCase().includes(materialKw) ||
          (pg.partnerKey !== '__internal__' && (pg.partnerKey || '').toLowerCase().includes(materialKw));
        if (partnerHit) {
          if (!onlyShowIncompleteOrders || productionLinkMode === 'product') return pg;
          const next = new Map<string, MatRow[]>();
          for (const [scopeKey, materials] of pg.data.entries()) {
            const order = idx.ordersById.get(scopeKey);
            if (order && !shouldShowOrderInIncompleteListFilter(order, true)) continue;
            next.set(scopeKey, materials);
          }
          return { ...pg, data: next };
        }

        const next = new Map<string, MatRow[]>();
        for (const [scopeKey, materials] of pg.data.entries()) {
          if (productionLinkMode === 'product') {
            if (productScopeHit(scopeKey, materials)) next.set(scopeKey, materials);
          } else {
            const order = idx.ordersById.get(scopeKey);
            if (order && !shouldShowOrderInIncompleteListFilter(order, onlyShowIncompleteOrders)) continue;
            if (orderScopeHit(scopeKey, materials)) next.set(scopeKey, materials);
          }
        }
        return { ...pg, data: next };
      })
      .filter(pg => pg.data.size > 0);
  }, [materialPanelSettings.groupByOutsourcePartner, partnerMaterialGroups, materialKw, productionLinkMode, idx, onlyShowIncompleteOrders]);

  const productEntriesForDisplay = useMemo(() => {
    if (!productMaterialStatsByProduct) return null;
    const sortByNewest = (entries: [string, MatRow[]][]) =>
      entries.sort((a, b) => {
        const aMax = Math.max(0, ...(idx.ordersByProductId.get(a[0]) ?? []).map(orderCreatedMs));
        const bMax = Math.max(0, ...(idx.ordersByProductId.get(b[0]) ?? []).map(orderCreatedMs));
        return bMax - aMax;
      });
    const allEntries = Array.from(productMaterialStatsByProduct.entries()) as [string, MatRow[]][];
    const base = !materialKw
      ? allEntries
      : allEntries.filter(([fpId, materials]) => {
          if (materials.some(m => {
            const p = idx.productsById.get(m.productId);
            return (p?.name ?? '').toLowerCase().includes(materialKw) || (p?.sku ?? '').toLowerCase().includes(materialKw);
          })) return true;
          const fp = idx.productsById.get(fpId);
          if ((fp?.name ?? '').toLowerCase().includes(materialKw) || (fp?.sku ?? '').toLowerCase().includes(materialKw)) return true;
          const scopeOrders = idx.ordersByProductId.get(fpId) ?? [];
          return scopeOrders.some(o =>
            (o.orderNumber ?? '').toLowerCase().includes(materialKw) ||
            (o.customer ?? '').toLowerCase().includes(materialKw) ||
            (o.productName ?? '').toLowerCase().includes(materialKw)
          );
        });
    const withRows = base.filter(([, materials]) => visibleMaterialRowsForList(materials, materialKw, idx.productsById).length > 0);
    return sortByNewest(withRows);
  }, [productMaterialStatsByProduct, materialKw, idx]);

  const parentOrdersForDisplay = useMemo(() => {
    const sortByNewest = (list: typeof parentOrders) =>
      [...list].sort((a, b) => orderCreatedMs(b) - orderCreatedMs(a));
    const nameMatched = !materialKw
      ? parentOrders
      : parentOrders.filter(parent => {
          const materials = parentMaterialStats.get(parent.id) ?? [];
          if (materials.some(m => {
            const p = idx.productsById.get(m.productId);
            return (p?.name ?? '').toLowerCase().includes(materialKw) || (p?.sku ?? '').toLowerCase().includes(materialKw);
          })) return true;
          const prod = idx.productsById.get(parent.productId);
          return (
            (parent.orderNumber ?? '').toLowerCase().includes(materialKw) ||
            (parent.customer ?? '').toLowerCase().includes(materialKw) ||
            (parent.productName ?? '').toLowerCase().includes(materialKw) ||
            (prod?.name ?? '').toLowerCase().includes(materialKw) ||
            (prod?.sku ?? '').toLowerCase().includes(materialKw)
          );
        });
    return sortByNewest(
      nameMatched.filter(parent => {
        if (!shouldShowOrderInIncompleteListFilter(parent, onlyShowIncompleteOrders)) return false;
        return visibleMaterialRowsForList(parentMaterialStats.get(parent.id) ?? [], materialKw, idx.productsById).length > 0;
      }),
    );
  }, [parentOrders, parentMaterialStats, materialKw, idx, onlyShowIncompleteOrders]);

  /** 有搜索词时表格内只显示名称/SKU 含关键词的物料行；若当前卡片因工单/产品名等命中、但物料名都不含关键词，则仍显示全部行 */
  const displayMaterialsForSearch = useCallback(
    (materials: MatRow[]): MatRow[] => displayMaterialsForKeyword(materials, materialKw, idx.productsById),
    [materialKw, idx.productsById],
  );

  /**
   * Phase 3.E follow-up：领料/退料的 docNo 不再前端自算。
   *
   * 历史实现按 `records` 缓存 max+1，但 `records` 现在是按 panel 窄拉的子集，
   * 跨 panel / 跨 tab 的并发领料会重号；PM2 cluster 上线后多副本也会重号。
   * 现在统一交给后端 `POST /production/records/batch` 在事务 + advisory lock 下分配。
   */

  const handleStockConfirmSubmit = async () => {
    if (!stockSelectMode) return;
    const modeForPref = stockSelectMode;
    const widForPref = stockConfirmWarehouseId;
    const toSubmit = Array.from(stockSelectedIds).filter(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
    if (toSubmit.length === 0) return;
    const recordType: ProdOpType = stockSelectMode === 'stock_out' ? 'STOCK_OUT' : 'STOCK_RETURN';
    const wh = stockConfirmWarehouseId || '';
    /** 领料与退料：启用批次时须选批号；仅领料再校验该批可用量 */
    if (wh) {
      for (const pid of toSubmit) {
        const p = idx.productsById.get(pid);
        const c = categoryMap.get(p?.categoryId ?? '');
        if (!categoryUsesBatchManagement(c)) continue;
        const bn = clampBatchNoInput(stockConfirmBatches[pid] ?? '');
        if (!bn) {
          toast.error(`请为物料「${p?.name ?? pid}」选择批次`);
          return;
        }
        if (recordType === 'STOCK_OUT') {
          try {
            const opts = await api.psi.getStockBatches({ productId: pid, warehouseId: wh });
            const av = opts.find(o => o.batchNo === bn)?.stock ?? 0;
            if ((stockConfirmQuantities[pid] ?? 0) > av) {
              toast.error(`物料「${p?.name ?? pid}」批次「${bn}」可用库存不足（${av}）`);
              return;
            }
          } catch {
            toast.error('校验批次库存失败，请稍后重试');
            return;
          }
        }
      }
    }
    const timestamp = new Date().toLocaleString();
    const partnerForRecord = stockSelectPartner && stockSelectPartner !== '__internal__' ? stockSelectPartner : undefined;
    const srcPid = stockSelectSourceProductId;
    const collabExtra = buildMaterialStockCustomCollabPayload(
      stockConfirmCustomValues,
      recordType,
      partnerForRecord,
    );

    /**
     * 提交不再带 docNo，统一由后端 createRecordBatch 在事务 + advisory lock 下分配；
     * onAddRecordBatch 返回服务端创建后的记录数组，前端从中读出真实 docNo
     * 用于打开 stockDocDetail 弹窗。
     */
    const buildBatch = (orderIdForRow: string | undefined): ProductionOpRecord[] =>
      toSubmit.map(pid => {
        const p = idx.productsById.get(pid);
        const c = categoryMap.get(p?.categoryId ?? '');
        const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(stockConfirmBatches[pid] ?? '') : '';
        return {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: recordType,
          orderId: orderIdForRow,
          ...(srcPid ? { sourceProductId: srcPid } : {}),
          productId: pid,
          quantity: stockConfirmQuantities[pid],
          reason: stockConfirmReason || undefined,
          timestamp,
          status: '已完成',
          warehouseId: stockConfirmWarehouseId || undefined,
          partner: partnerForRecord,
          operator: docOperator,
          ...(bn ? { batchNo: bn } : {}),
          ...collabExtra,
        } as ProductionOpRecord;
      });

    const submitAndResolveDocNo = async (batch: ProductionOpRecord[]): Promise<string> => {
      if (onAddRecordBatch && batch.length > 1) {
        const created = await onAddRecordBatch(batch);
        const first = Array.isArray(created) ? created[0] : null;
        return (first?.docNo ?? '') as string;
      }
      let resolved = '';
      for (const rec of batch) {
        const r = await onAddRecord(rec);
        if (!resolved && r && typeof r === 'object' && 'docNo' in r) {
          resolved = ((r as ProductionOpRecord).docNo ?? '') as string;
        }
      }
      return resolved;
    };

    const buildDetail = (orderIdForDetail: string): import('./types').StockDocDetail => ({
      docNo: '',
      type: recordType,
      orderId: orderIdForDetail,
      ...(srcPid ? { sourceProductId: srcPid } : {}),
      timestamp,
      warehouseId: stockConfirmWarehouseId || '',
      lines: toSubmit.map(pid => {
        const p = idx.productsById.get(pid);
        const c = categoryMap.get(p?.categoryId ?? '');
        const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(stockConfirmBatches[pid] ?? '') : '';
        return { productId: pid, quantity: stockConfirmQuantities[pid], ...(bn ? { batchNo: bn } : {}) };
      }),
      reason: stockConfirmReason || undefined,
      operator: docOperator,
      partner: partnerForRecord,
    });

    if (srcPid) {
      const batch = buildBatch(undefined);
      const docNo = await submitAndResolveDocNo(batch);
      setStockDocDetail({ ...buildDetail(''), docNo });
    } else if (stockSelectOrderId) {
      const batch = buildBatch(stockSelectOrderId);
      const docNo = await submitAndResolveDocNo(batch);
      setStockDocDetail({ ...buildDetail(stockSelectOrderId), docNo });
    } else return;
    if (widForPref) {
      writeWarehousePreference(
        tenantCtx?.tenantId,
        userId,
        modeForPref === 'stock_out' ? WAREHOUSE_DOC_KIND.PROD_STOCK_CONFIRM_OUT : WAREHOUSE_DOC_KIND.PROD_STOCK_CONFIRM_IN,
        { warehouseId: widForPref },
      );
    }
    setShowStockConfirmModal(false);
    setStockSelectOrderId(null);
    setStockSelectSourceProductId(null);
    setStockSelectPartner(null);
    setStockSelectMode(null);
    setStockSelectedIds(new Set());
    setStockConfirmQuantities({});
    setStockConfirmBatches({});
    setStockConfirmReason('');
    setStockConfirmCustomValues({});
  };

  const stockConfirmMaterialCustomFieldDefs = useMemo(() => {
    const wx = stockSelectPartner && stockSelectPartner !== '__internal__';
    const raw =
      stockSelectMode === 'stock_return'
        ? wx
          ? materialFormSettings.outsourceMaterialReturnCustomFields
          : materialFormSettings.materialReturnCustomFields
        : wx
          ? materialFormSettings.outsourceMaterialIssueCustomFields
          : materialFormSettings.materialIssueCustomFields;
    return (raw ?? []).filter(f => f.showInCreate);
  }, [
    stockSelectMode,
    stockSelectPartner,
    materialFormSettings.materialIssueCustomFields,
    materialFormSettings.materialReturnCustomFields,
    materialFormSettings.outsourceMaterialIssueCustomFields,
    materialFormSettings.outsourceMaterialReturnCustomFields,
  ]);

  /**
   * 生产退料批次选项：与 `OutsourceMaterialReturnModal` 一致，按「该合作单位/本厂 + 本工单族或本产品」下
   * 历史领料发出（STOCK_OUT）出现过的批号汇总；**不**按当前仓库 PSI 余量过滤（加工厂可整批退回时仓库可能为零）。
   */
  const stockReturnDispatchedBatchesByProduct = useMemo(() => {
    if (stockSelectMode !== 'stock_return') return undefined;
    const INTERNAL = '__internal__';
    const pkRaw = stockSelectPartner ?? INTERNAL;
    const partnerMatch = (r: ProductionOpRecord) => {
      const rp = (r.partner ?? '').trim();
      if (!pkRaw || pkRaw === INTERNAL) return !rp;
      return rp === pkRaw;
    };
    const byMat = new Map<string, Set<string>>();
    const addBatch = (r: ProductionOpRecord) => {
      const pid = r.productId;
      if (!pid) return;
      const bn = (r.batchNo ?? '').trim() || BATCH_NO_UNTAGGED;
      if (!byMat.has(pid)) byMat.set(pid, new Set());
      byMat.get(pid)!.add(bn);
    };
    for (const r of records) {
      if (r.type !== 'STOCK_OUT' || !partnerMatch(r)) continue;
      let inScope = false;
      if (stockSelectSourceProductId) {
        const target = stockSelectSourceProductId;
        if (r.sourceProductId === target) inScope = true;
        else if (r.orderId) {
          const related = new Set(orders.filter(o => o.productId === target).map(o => o.id));
          if (related.has(r.orderId)) inScope = true;
        }
      } else if (stockSelectOrderId) {
        const fam = new Set(getOrderFamilyIds(orders, stockSelectOrderId, idx.childrenByParentId));
        if (r.orderId && fam.has(r.orderId)) inScope = true;
      }
      if (!inScope) continue;
      addBatch(r);
    }
    const out: Record<string, string[]> = {};
    for (const [pid, set] of byMat) {
      out[pid] = Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }
    return out;
  }, [
    stockSelectMode,
    stockSelectPartner,
    stockSelectOrderId,
    stockSelectSourceProductId,
    records,
    orders,
    idx.childrenByParentId,
  ]);

  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>生产物料</h1>
          <p className={pageSubtitleClass}>物料下发与库存扣减</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
        {!showModal && (
            <div className="relative w-full sm:w-56 sm:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                placeholder="搜索产品、工单号、客户、物料..."
                value={materialSearch}
                onChange={e => setMaterialSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
        )}
        <div className="flex flex-wrap items-center gap-2 justify-end sm:justify-start">
        {!showModal && hasOpsPerm(tenantRole, userPermissions, 'production:material_form_config:allow') && (
            <button
              type="button"
              onClick={() => {
                setMaterialFormConfigEntryTab('fields');
                setShowConfigModal(true);
              }}
              className={formConfigToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" />
              表单配置
            </button>
        )}
        {!showModal && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:view') && (
            <button
              type="button"
              onClick={() => setShowStockFlowModal(true)}
              className={outlineToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" />
              领料退料流水
            </button>
        )}
        </div>
        </div>
      </div>

      {!showModal && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看生产物料列表</p>
        </div>
      )}
      {!showModal && canViewMainList && (
        <div className="space-y-4">
          {materialPanelSettings.groupByOutsourcePartner && partnerGroupsForDisplay ? (
            (() => {
              if (partnerGroupsForDisplay.length === 0) {
                return (
                  <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
                    <p className="text-slate-400 text-sm">{materialKw ? '无匹配项，请调整搜索条件' : '暂无物料数据'}</p>
                  </div>
                );
              }
              const totalPartnerPages = Math.max(1, Math.ceil(partnerGroupsForDisplay.length / PAGE_SIZE));
              const pagedPartners = partnerGroupsForDisplay.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE);

              return (<>
                {pagedPartners.map(({ partnerKey, partnerLabel, data }) => {
                  const entries = Array.from(data.entries());
                  const visibleEntryCount = entries.filter(([, materials]) => {
                    const searched = displayMaterialsForSearch(materials);
                    const rows =
                      partnerKey === '__internal__' ? filterMaterialRowsWithActivity(searched) : searched;
                    return rows.length > 0;
                  }).length;
                  if (visibleEntryCount === 0) return null;
                  return (
                    <div key={partnerKey} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                      <div className={`px-6 py-3 border-b border-slate-100 flex items-center gap-3 ${partnerKey === '__internal__' ? 'bg-slate-50' : 'bg-gradient-to-r from-indigo-50/80 to-white'}`}>
                        <Building2 className={`w-5 h-5 ${partnerKey === '__internal__' ? 'text-slate-400' : 'text-indigo-500'}`} />
                        <span className="text-sm font-black text-slate-700">{partnerLabel}</span>
                        <span className="text-[10px] text-slate-400 font-medium">({visibleEntryCount} 项)</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {entries.flatMap(([scopeKey, materials]) => {
                          const searched = displayMaterialsForSearch(materials);
                          const displayMaterials =
                            partnerKey === '__internal__' ? filterMaterialRowsWithActivity(searched) : searched;
                          if (displayMaterials.length === 0) return [];
                          if (productionLinkMode === 'product') {
                            const fp = idx.productsById.get(scopeKey);
                            const selecting = stockSelectSourceProductId === scopeKey && stockSelectPartner === partnerKey && !!stockSelectMode;
                            return [
                              <div key={`${partnerKey}-${scopeKey}`} className="rounded-2xl border border-slate-100 overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3 bg-white">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Package className="w-4 h-4 text-indigo-400 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-slate-800 truncate">
                                        {fp?.name ?? '—'}
                                        {fp?.sku ? <span className="ml-2 text-xs font-medium text-slate-400">{fp.sku}</span> : null}
                                        <span className="ml-1 inline-flex items-center gap-1 align-middle">{renderProductCustomTags(fp)}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {selecting ? (
                                      <>
                                        <span className="text-xs font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                                        <button type="button" onClick={() => { if (stockSelectedIds.size === 0) return; setStockConfirmQuantities({}); setStockConfirmBatches({}); setStockConfirmCustomValues({}); setStockConfirmWarehouseId(stockSelectMode ? resolveConfirmDefaultWarehouse(stockSelectMode) : ''); setShowStockConfirmModal(true); }} disabled={stockSelectedIds.size === 0} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}><Check className="w-3 h-3" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}</button>
                                        <button type="button" onClick={() => { setStockSelectSourceProductId(null); setStockSelectPartner(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">取消</button>
                                      </>
                                    ) : (
                                      <>
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                                          <button type="button" onClick={() => { setStockSelectSourceProductId(scopeKey); setStockSelectOrderId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><ArrowUpFromLine className="w-3 h-3" /> 领料</button>
                                        )}
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                                          <button type="button" onClick={() => { setStockSelectSourceProductId(scopeKey); setStockSelectOrderId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><Undo2 className="w-3 h-3" /> 退料</button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                                <MaterialStatsTable materials={displayMaterials} selecting={selecting} compact selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} categoryMap={categoryMap} />
                              </div>,
                            ];
                          }
                          const order = idx.ordersById.get(scopeKey);
                          if (!order) return [];
                          const product = idx.productsById.get(order.productId);
                          const selecting = stockSelectOrderId === scopeKey && stockSelectPartner === partnerKey && !!stockSelectMode;
                          return [
                            <div key={`${partnerKey}-${scopeKey}`} className="rounded-2xl border border-slate-100 overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3 bg-white">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-bold text-slate-400 truncate">{order.orderNumber}</p>
                                      <p className="text-sm font-bold text-slate-800 truncate">
                                        {product?.name ?? order.productName ?? '—'}
                                        {(product?.sku ?? order.sku) ? (
                                          <span className="ml-2 text-xs font-medium text-slate-400">{product?.sku ?? order.sku}</span>
                                        ) : null}
                                      </p>
                                      <div className="mt-1 flex flex-wrap items-center gap-1">{renderProductCustomTags(product) ?? null}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {selecting ? (
                                      <>
                                        <span className="text-xs font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                                        <button type="button" onClick={() => { if (stockSelectedIds.size === 0) return; setStockConfirmQuantities({}); setStockConfirmBatches({}); setStockConfirmCustomValues({}); setStockConfirmWarehouseId(stockSelectMode ? resolveConfirmDefaultWarehouse(stockSelectMode) : ''); setShowStockConfirmModal(true); }} disabled={stockSelectedIds.size === 0} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}><Check className="w-3 h-3" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}</button>
                                        <button type="button" onClick={() => { setStockSelectOrderId(null); setStockSelectPartner(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">取消</button>
                                      </>
                                    ) : (
                                      <>
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                                          <button type="button" onClick={() => { setStockSelectOrderId(scopeKey); setStockSelectSourceProductId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><ArrowUpFromLine className="w-3 h-3" /> 领料</button>
                                        )}
                                        {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                                          <button type="button" onClick={() => { setStockSelectOrderId(scopeKey); setStockSelectSourceProductId(null); setStockSelectPartner(partnerKey); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"><Undo2 className="w-3 h-3" /> 退料</button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                                <MaterialStatsTable materials={displayMaterials} selecting={selecting} compact selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} categoryMap={categoryMap} />
                              </div>,
                          ];
                        })}
                      </div>
                    </div>
                  );
                })}
                {totalPartnerPages > 1 && (
                  <div className="flex items-center justify-center gap-3 py-4">
                    <span className="text-xs text-slate-400">共 {partnerGroupsForDisplay.length} 个加工厂，第 {stockPage} / {totalPartnerPages} 页</span>
                    <button type="button" disabled={stockPage <= 1} onClick={() => setStockPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                    <button type="button" disabled={stockPage >= totalPartnerPages} onClick={() => setStockPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
                  </div>
                )}
              </>);
            })()
          ) : productionLinkMode === 'product' && productMaterialStatsByProduct ? (
            (() => {
              const pEntries = productEntriesForDisplay ?? [];
              if (pEntries.length === 0) {
                const hadAnyProductScope = (productMaterialStatsByProduct?.size ?? 0) > 0;
                return (
                  <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
                    <p className="text-slate-400 text-sm">
                      {materialKw
                        ? '无匹配项，请调整搜索条件'
                        : hadAnyProductScope
                          ? '无可展示物料（领料、退料、报工耗材均为 0 的关联产品已隐藏）'
                          : '暂无工单，请先在「生产计划」下达工单'}
                    </p>
                  </div>
                );
              }
              const totalProductPages = Math.max(1, Math.ceil(pEntries.length / PAGE_SIZE));
              const pagedEntries = pEntries.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE);
              return (<>
              {pagedEntries.map(([fpId, materials]) => {
                const fp = idx.productsById.get(fpId);
                const orderCnt = (idx.ordersByProductId.get(fpId) ?? []).length;
                const selecting = stockSelectSourceProductId === fpId && stockSelectMode;
                const displayMaterials = visibleMaterialRowsForList(materials, materialKw, idx.productsById);
                return (
                  <div key={`fp-${fpId}`} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">关联产品（共 {orderCnt} 条工单）</p>
                          <p className="mt-0.5 text-base font-bold text-slate-900">
                            {fp?.name ?? '—'}
                            {fp?.sku ? <span className="ml-2 text-sm font-medium text-slate-400">{fp.sku}</span> : null}
                            <span className="ml-1 inline-flex items-center gap-1 align-middle">{renderProductCustomTags(fp)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selecting ? (
                          <>
                            <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (stockSelectedIds.size === 0) return;
                                setStockConfirmQuantities({});
                                setStockConfirmBatches({});
                                setStockConfirmCustomValues({});
                                setStockConfirmWarehouseId(stockSelectMode ? resolveConfirmDefaultWarehouse(stockSelectMode) : '');
                                setShowStockConfirmModal(true);
                              }}
                              disabled={stockSelectedIds.size === 0}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                            >
                              <Check className="w-3.5 h-3.5" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                            </button>
                            )}
                            {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <Undo2 className="w-3.5 h-3.5" /> 生产退料
                            </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <MaterialStatsTable materials={displayMaterials} selecting={!!selecting} selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} categoryMap={categoryMap} emptyMessage="该产品暂无 BOM 物料，请先在产品中配置 BOM" />
                </div>
              );
              })}
              {totalProductPages > 1 && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <span className="text-xs text-slate-400">共 {pEntries.length} 项，第 {stockPage} / {totalProductPages} 页</span>
                  <button type="button" disabled={stockPage <= 1} onClick={() => setStockPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                  <button type="button" disabled={stockPage >= totalProductPages} onClick={() => setStockPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
                </div>
              )}
              </>);
            })()
          ) : parentOrdersForDisplay.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">
                {parentOrders.length === 0
                  ? '暂无工单，请先在「生产计划」下达工单'
                  : materialKw
                    ? '无匹配项，请调整搜索条件'
                    : '无可展示物料（领料、退料、报工耗材均为 0 的工单已隐藏）'}
              </p>
            </div>
          ) : (
            (() => {
              const totalOrderPages = Math.max(1, Math.ceil(parentOrdersForDisplay.length / PAGE_SIZE));
              const pagedParentOrders = parentOrdersForDisplay.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE);
              return (<>
            {pagedParentOrders.map(order => {
              const product = idx.productsById.get(order.productId);
              const materials = parentMaterialStats.get(order.id) ?? [];
              const displayMaterials = visibleMaterialRowsForList(materials, materialKw, idx.productsById);
              const familyIds = getOrderFamilyIds(orders, order.id, idx.childrenByParentId);
              const childCount = familyIds.length - 1;
              return (
                <div key={order.id} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          工单号: {order.orderNumber}
                          {childCount > 0 && <span className="ml-2 text-slate-400 font-normal">（含 {childCount} 个子工单）</span>}
                        </p>
                        {order.priority && order.priority !== 'Medium' && (
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-bold ${order.priority === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {order.priority === 'High' ? 'HIGH' : 'LOW'}
                          </span>
                        )}
                        <p className="text-base font-bold text-slate-900 mt-0.5">
                          {product?.name ?? order.productName ?? '—'}
                          {(product?.sku ?? order.sku) ? (
                            <span className="ml-2 text-sm font-medium text-slate-400">{product?.sku ?? order.sku}</span>
                          ) : null}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">{renderProductCustomTags(product) ?? null}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stockSelectOrderId === order.id && stockSelectMode ? (
                        <>
                          <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (stockSelectedIds.size === 0) return;
                              setStockConfirmQuantities({});
                              setStockConfirmBatches({});
                              setStockConfirmCustomValues({});
                              setStockConfirmWarehouseId(stockSelectMode ? resolveConfirmDefaultWarehouse(stockSelectMode) : '');
                              setShowStockConfirmModal(true);
                            }}
                            disabled={stockSelectedIds.size === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                          >
                            <Check className="w-3.5 h-3.5" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                          </button>
                          )}
                          {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> 生产退料
                          </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <MaterialStatsTable materials={displayMaterials} selecting={stockSelectOrderId === order.id && !!stockSelectMode} selectedIds={stockSelectedIds} onSelectAll={setStockSelectedIds} onToggleSelect={toggleSelect} productsById={idx.productsById} categoryMap={categoryMap} emptyMessage="该工单暂无 BOM 物料，请先在产品中配置 BOM" />
                </div>
              );
            })}
            {totalOrderPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
                <span className="text-xs text-slate-400">共 {parentOrdersForDisplay.length} 条工单，第 {stockPage} / {totalOrderPages} 页</span>
                <button type="button" disabled={stockPage <= 1} onClick={() => setStockPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                <button type="button" disabled={stockPage >= totalOrderPages} onClick={() => setStockPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
              </div>
            )}
            </>);
            })()
          )}
        </div>
      )}

      <StockConfirmModal
        visible={showStockConfirmModal}
        onClose={() => {
          setShowStockConfirmModal(false);
          setStockConfirmReason('');
          setStockConfirmCustomValues({});
          setStockConfirmBatches({});
        }}
        onSubmit={handleStockConfirmSubmit}
        stockSelectMode={stockSelectMode}
        stockSelectOrderId={stockSelectOrderId}
        stockSelectSourceProductId={stockSelectSourceProductId}
        stockSelectedIds={stockSelectedIds}
        stockConfirmQuantities={stockConfirmQuantities}
        onQuantityChange={(pid, qty) => setStockConfirmQuantities(prev => ({ ...prev, [pid]: qty }))}
        stockConfirmWarehouseId={stockConfirmWarehouseId}
        onWarehouseChange={wid => {
          setStockConfirmWarehouseId(wid);
          setStockConfirmBatches({});
        }}
        stockConfirmReason={stockConfirmReason}
        onReasonChange={setStockConfirmReason}
        materialCustomFieldDefs={stockConfirmMaterialCustomFieldDefs}
        materialCustomValues={stockConfirmCustomValues}
        onMaterialCustomValueChange={(fieldId, value) =>
          setStockConfirmCustomValues(prev => ({ ...prev, [fieldId]: value }))
        }
        orders={orders}
        products={products}
        warehouses={warehouses}
        dictionaries={dictionaries}
        partnerLabel={stockSelectPartner && stockSelectPartner !== '__internal__' ? stockSelectPartner : undefined}
        categories={categories}
        lineBatchByProduct={stockConfirmBatches}
        onLineBatchChange={(pid, bn) => setStockConfirmBatches(prev => ({ ...prev, [pid]: bn }))}
        psiRecords={psiRecords}
        prodRecords={records}
        returnDispatchedBatchesByProduct={stockSelectMode === 'stock_return' ? stockReturnDispatchedBatchesByProduct : undefined}
      />

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
        onOpenMaterialFormPrintTab={
          hasOpsPerm(tenantRole, userPermissions, 'production:material_form_config:allow')
            ? () => {
                setMaterialFormConfigEntryTab('print');
                setShowConfigModal(true);
              }
            : undefined
        }
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      <StockFlowListModal
        visible={showStockFlowModal}
        onClose={() => setShowStockFlowModal(false)}
        orders={orders}
        products={products}
        productionLinkMode={productionLinkMode}
        onOpenDocDetail={setStockDocDetail}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      <StockMaterialFormModal
        visible={showModal}
        onClose={() => { setShowModal(false); setStockModalMode(null); }}
        stockModalMode={stockModalMode}
        orders={orders}
        products={products}
        warehouses={warehouses}
        productionLinkMode={productionLinkMode}
        materialFormSettings={materialFormSettings}
        categories={categories}
        onAddRecord={onAddRecord}
        onAfterDocSaved={detail => setStockDocDetail(detail)}
      />

      {showConfigModal && onUpdateMaterialPanelSettings && onUpdateMaterialFormSettings && (
        <MaterialFormConfigModal
          open={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          defaultTabWhenOpen={materialFormConfigEntryTab}
          materialFormSettings={materialFormSettings}
          onUpdateMaterialFormSettings={onUpdateMaterialFormSettings}
          materialPanelSettings={materialPanelSettings}
          onUpdateMaterialPanelSettings={onUpdateMaterialPanelSettings}
          productionLinkMode={productionLinkMode}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates ?? (async () => {})}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
      )}
    </div>
  );
};

export default React.memo(StockMaterialPanel);
