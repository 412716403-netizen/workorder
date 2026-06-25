import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Clock,
  Package,
  User,
  ChevronRight,
  FileText,
  Building2,
  CheckCircle2,
  PackageCheck,
  Printer,
  Search,
  Sliders,
  ScrollText,
  X,
} from 'lucide-react';
import {
  Product,
  Warehouse,
  ProductCategory,
  Partner,
  PartnerCategory,
  AppDictionaries,
  ProductVariant,
  PurchaseOrderFormSettings,
  SalesOrderFormSettings,
  PurchaseBillFormSettings,
  SalesBillFormSettings,
  PlanFormFieldConfig,
  PrintTemplate,
  PrintRenderContext,
  ProductionOrder,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
  PsiRecordType,
} from '../types';
import {
  formConfigToolbarButtonClass,
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  psiOrderBillListStackClass,
  psiOrderBillListEmptyClass,
  psiOrderBillListCardClass,
  psiOrderBillListCardHeaderClass,
  psiOrderBillListTableWrapClass,
} from '../styles/uiDensity';
import WarehousePanel from './psi-ops/WarehousePanel';
import OrderBillFormPage from './psi-ops/OrderBillFormPage';
import PsiDocDetailSummary from './psi-ops/PsiDocDetailSummary';
import PsiOrderBillDocModal from './psi-ops/PsiOrderBillDocModal';
import PsiOrderBillFlowListModal from './psi-ops/PsiOrderBillFlowListModal';
import { PSI_ORDER_BILL_FLOW_LABELS } from './psi-ops/psiOrderBillFlowHelpers';
import PendingShipmentListModal, { PendingShipmentGroup } from './psi-ops/PendingShipmentListModal';
import PendingShipDetailModal from './psi-ops/PendingShipDetailModal';
import AllocationModal from './psi-ops/AllocationModal';
import PsiFormConfigModal from './psi-ops/PsiFormConfigModal';
import {
  PsiListPrintController,
  type PsiListPrintControllerHandle,
} from '../components/psi/PsiListPrintPicker';
import { buildPurchaseOrderPrintContextFromPsiDoc } from '../utils/buildPurchaseOrderPrintContext';
import { buildPurchaseBillPrintContextFromPsiDoc } from '../utils/buildPurchaseBillPrintContext';
import { buildSalesOrderPrintContextFromPsiDoc } from '../utils/buildSalesOrderPrintContext';
import { buildSalesBillPrintContextFromPsiDoc } from '../utils/buildSalesBillPrintContext';
import { useConfigData, useAppActions } from '../contexts/AppDataContext';
import * as apiNs from '../services/api';
import {
  flowRecordsEarliestMs,
  formatPsiDocListTime,
  psiDocGroupListSortMs,
  psiDocNumberSeqSuffix,
  recordDocLineTimeMs,
} from '../utils/flowDocSort';
import { nextSalesBillDocNumber } from '../utils/partnerDocNumber';
import { effectiveAllocatedQuantity } from '../utils/psiAllocationDisplay';
import { effectivePlanFormFieldType } from '../utils/planFormCustomField';
import { getProductCategoryCustomFieldEntries } from '../utils/reportCustomDocField';
import { toLocalDateYmd, formatCustomFieldDatetimeForPrint } from '../utils/localDateTime';
import { hasModulePerm } from '../utils/hasModulePerm';
import { PSI_DOC_TYPE_AMOUNT_KEY, canViewAmount } from '../utils/canViewAmount';
import { maskPrintContextAmounts } from '../utils/maskPrintContextAmounts';
import { useStockSnapshot } from '../hooks/useStockSnapshot';
import { usePsiOpsRecordsList } from '../hooks/usePsiOpsRecordsList';
import { productHasColorSizeMatrix } from '../utils/productColorSize';
import {
  groupRecordsByDocNumber,
  sumReceivedByOrderLine,
  formatPsiQtyDisplay,
} from '../utils/psiOpsAggregators';

import {
  formatPsiDocNumForList,
  truncatePsiListNote,
  compactPsiListCustomValue,
  psiCustomFieldHasFilledDisplayValue,
  aggregatePurchaseBillRelatedProductListText,
  purchaseOrderStandardListText,
  purchaseBillStandardListText,
  type PsiDocListMainRow,
} from './psi-ops/psiOpsListFormatting';
import {
  DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  DEFAULT_SALES_ORDER_FORM_SETTINGS,
  DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  DEFAULT_SALES_BILL_FORM_SETTINGS,
} from '../contexts/AppDataContext';
import {
  purchaseOrderDocHasUnsettled,
  salesOrderDocFullyShipped,
  salesOrderDocHasNotFullyShippedLine,
} from '../utils/psiOrderListDisplayFilter';
import { useAuth } from '../contexts/AuthContext';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  WAREHOUSE_DOC_KIND,
} from '../utils/warehouseDocPreference';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

/** 避免 `records ?? []` 每次渲染新引用导致 react-query / useMemo 无意义抖动 */
const EMPTY_PSI_CTX: unknown[] = [];

interface PSIOpsViewProps {
  type: string;
  products: Product[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  records: any[];
  purchaseOrderFormSettings?: PurchaseOrderFormSettings;
  onUpdatePurchaseOrderFormSettings?: (settings: PurchaseOrderFormSettings) => void;
  salesOrderFormSettings?: SalesOrderFormSettings;
  onUpdateSalesOrderFormSettings?: (settings: SalesOrderFormSettings) => void;
  purchaseBillFormSettings?: PurchaseBillFormSettings;
  onUpdatePurchaseBillFormSettings?: (settings: PurchaseBillFormSettings) => void;
  salesBillFormSettings?: SalesBillFormSettings;
  onUpdateSalesBillFormSettings?: (settings: SalesBillFormSettings) => void;
  onAddRecord: (record: any) => void;
  onAddRecordBatch?: (records: any[]) => Promise<void>;
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  /** 生产操作记录（入仓流水合并生产入库 STOCK_IN 用） */
  prodRecords?: any[];
  /** 工单列表（生产入库行显示工单号用） */
  orders?: { id: string; orderNumber?: string }[];
  userPermissions?: string[];
  tenantRole?: string;
}

const PSIOpsView: React.FC<PSIOpsViewProps> = ({
  type,
  products,
  warehouses,
  categories,
  partners,
  partnerCategories,
  dictionaries,
  records,
  purchaseOrderFormSettings = DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  onUpdatePurchaseOrderFormSettings,
  salesOrderFormSettings = DEFAULT_SALES_ORDER_FORM_SETTINGS,
  onUpdateSalesOrderFormSettings,
  purchaseBillFormSettings = DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  onUpdatePurchaseBillFormSettings,
  salesBillFormSettings = DEFAULT_SALES_BILL_FORM_SETTINGS,
  onUpdateSalesBillFormSettings,
  onAddRecord,
  onAddRecordBatch,
  onReplaceRecords,
  onDeleteRecords,
  prodRecords = [],
  orders = [],
  userPermissions,
  tenantRole,
}) => {
  const { tenantCtx, userId } = useAuth();
  const _isOwner = tenantRole === 'owner';
  const hasPsiPerm = (perm: string) => hasModulePerm(tenantRole, userPermissions, 'psi', perm);
  const showPsiDocAmount = (docType: string) => {
    const key = PSI_DOC_TYPE_AMOUNT_KEY[docType];
    return key ? canViewAmount(tenantRole, userPermissions, key) : true;
  };
  const ordersList = orders ?? [];
  const recordsList = usePsiOpsRecordsList(type, records == null ? EMPTY_PSI_CTX : records) as any[];
  const { printTemplates } = useConfigData();
  const { refreshPrintTemplates, onUpdatePrintTemplates } = useAppActions();
  // Phase 3.D follow-up：financeRecords 旧用作销售单打印应收 ledger 兜底；现已改异步调
  // `api.finance.partnerReceivable`，故不再从 context 读取全量财务记录。
  const safePurchaseOrderFormSettings = useMemo(
    (): PurchaseOrderFormSettings => ({
      standardFields: purchaseOrderFormSettings?.standardFields ?? [],
      customFields: purchaseOrderFormSettings?.customFields ?? [],
      listPrint: purchaseOrderFormSettings?.listPrint ?? { showPrintButton: true },
      listDisplay: purchaseOrderFormSettings?.listDisplay,
      relatedProductEnabled: purchaseOrderFormSettings?.relatedProductEnabled,
    }),
    [purchaseOrderFormSettings],
  );
  const safePurchaseBillFormSettings = useMemo(
    (): PurchaseBillFormSettings => ({
      standardFields: purchaseBillFormSettings?.standardFields ?? [],
      customFields: purchaseBillFormSettings?.customFields ?? [],
      listPrint: purchaseBillFormSettings?.listPrint ?? { showPrintButton: true },
      relatedProductEnabled: purchaseBillFormSettings?.relatedProductEnabled,
    }),
    [purchaseBillFormSettings],
  );
  const safeSalesOrderFormSettings = useMemo(
    (): SalesOrderFormSettings => ({
      standardFields: salesOrderFormSettings?.standardFields ?? [],
      customFields: salesOrderFormSettings?.customFields ?? [],
      listPrint: salesOrderFormSettings?.listPrint ?? { showPrintButton: true },
      listDisplay: salesOrderFormSettings?.listDisplay,
    }),
    [salesOrderFormSettings],
  );
  const safeSalesBillFormSettings = useMemo(
    (): SalesBillFormSettings => ({
      standardFields: salesBillFormSettings?.standardFields ?? [],
      customFields: salesBillFormSettings?.customFields ?? [],
      listPrint: salesBillFormSettings?.listPrint ?? { showPrintButton: true },
    }),
    [salesBillFormSettings],
  );
  const productMapPSI = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const warehouseMapPSI = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses]);
  const categoryMapPSI = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const getUnitName = (productId: string) => {
    const p = productMapPSI.get(productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };
  /** 数量列展示：转为数字去掉前导零，如 "035" 千克 -> 35 千克 */
  const formatQtyDisplay = formatPsiQtyDisplay;

  // 仓库管理子视图状态已迁移至 WarehousePanel

  const [showModal, setShowModal] = useState<string | null>(null); 
  // 当前是否处于采购订单编辑模式（存原始单号）
  const [editingPODocNumber, setEditingPODocNumber] = useState<string | null>(null);
  /** 采购订单弹窗：列表进详情先看只读摘要，点「编辑」再进表单；新建直达 edit */
  const [purchaseOrderModalPhase, setPurchaseOrderModalPhase] = useState<'detail' | 'edit' | null>(null);
  const [purchaseBillModalPhase, setPurchaseBillModalPhase] = useState<'detail' | 'edit' | null>(null);
  const [salesOrderModalPhase, setSalesOrderModalPhase] = useState<'detail' | 'edit' | null>(null);
  const [salesBillModalPhase, setSalesBillModalPhase] = useState<'detail' | 'edit' | null>(null);
  const [showPOFormConfigModal, setShowPOFormConfigModal] = useState(false);
  const [poFormConfigEntryTab, setPoFormConfigEntryTab] = useState<'fields' | 'print' | 'listDisplay'>('fields');
  const [showPBFormConfigModal, setShowPBFormConfigModal] = useState(false);
  const [pbFormConfigEntryTab, setPbFormConfigEntryTab] = useState<'fields' | 'print' | 'listDisplay'>('fields');
  const [showSOFormConfigModal, setShowSOFormConfigModal] = useState(false);
  const [soFormConfigEntryTab, setSoFormConfigEntryTab] = useState<'fields' | 'print' | 'listDisplay'>('fields');
  const [showSBFormConfigModal, setShowSBFormConfigModal] = useState(false);
  const [sbFormConfigEntryTab, setSbFormConfigEntryTab] = useState<'fields' | 'print' | 'listDisplay'>('fields');
  // 列表行「打印」按钮 → 选模版 Dialog → HiddenPrintSlot → 打印的完整链路，
  // 封装在 PsiListPrintController 内；4 个 type 各持一个 ref 以便触发 openPicker。
  const poListPrintControllerRef = useRef<PsiListPrintControllerHandle>(null);
  const pbListPrintControllerRef = useRef<PsiListPrintControllerHandle>(null);
  const soListPrintControllerRef = useRef<PsiListPrintControllerHandle>(null);
  const sbListPrintControllerRef = useRef<PsiListPrintControllerHandle>(null);
  // 采购单详情查看/删除（存单号）
  const [editingPBDocNumber, setEditingPBDocNumber] = useState<string | null>(null);
  // 销售订单详情编辑（存单号）
  const [editingSODocNumber, setEditingSODocNumber] = useState<string | null>(null);
  // 销售单详情编辑（存单号）
  const [editingSBDocNumber, setEditingSBDocNumber] = useState<string | null>(null);
  // 销售订单列表 - 配货弹窗：当前行 { docNumber, lineGroupId, product, grp }
  const [allocationModal, setAllocationModal] = useState<{ docNumber: string; lineGroupId: string; product: Product; grp: any[] } | null>(null);
  // 配货弹窗内输入的配货数量：无规格时为 number，有规格时为 { variantId: number }
  const [allocationQuantities, setAllocationQuantities] = useState<number | Record<string, number> | null>(null);
  // 配货弹窗选择的出库仓库
  const [allocationWarehouseId, setAllocationWarehouseId] = useState<string>('');
  /** 进销存列表/单据详情内产品图点击放大 */
  const [psiProductImagePreviewUrl, setPsiProductImagePreviewUrl] = useState<string | null>(null);

  // 切换标签时清除新增/编辑状态，避免出现不匹配的弹窗
  useEffect(() => {
    setShowModal(null);
    setEditingPODocNumber(null);
    setEditingPBDocNumber(null);
    setEditingSODocNumber(null);
    setEditingSBDocNumber(null);
    setShowPendingShipmentModal(false);
    setPsiOrderBillFlowOpen(false);
    setPurchaseOrderModalPhase(null);
    setPurchaseBillModalPhase(null);
    setSalesOrderModalPhase(null);
    setSalesBillModalPhase(null);
    setPsiProductImagePreviewUrl(null);
    setPendingShipDetailGroup(null);
    setSalesBillRevealFromPending(null);
  }, [type]);

  const bizConfig: Record<string, any> = {
    'PURCHASE_ORDER': { label: '采购订单', color: 'bg-indigo-600', partnerLabel: '供应商', prefix: 'PO', hideWarehouse: true },
    'PURCHASE_BILL': { label: '采购入库', color: 'bg-indigo-600', partnerLabel: '供应商', prefix: 'PB' },
    'SALES_ORDER': { label: '销售订单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'SO', hideWarehouse: true },
    'SALES_BILL': { label: '销售单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'XS' },
    'WAREHOUSE_MGMT': { label: '仓库管理', color: 'bg-indigo-600', sub: '全方位的仓库业务控制中心' },
  };

  const current = bizConfig[type];

  /** 销售订单下：待发货清单是否以弹窗形式打开 */
  const [showPendingShipmentModal, setShowPendingShipmentModal] = useState(false);
  /** 采购/销售订单与入库/出库单业务流水弹窗 */
  const [psiOrderBillFlowOpen, setPsiOrderBillFlowOpen] = useState(false);
  /** 待发货清单 - 详情弹窗：当前选中的分组 */
  const [pendingShipDetailGroup, setPendingShipDetailGroup] = useState<PendingShipmentGroup | null>(null);
  /** 待发货清单生成销售单后，在销售订单 tab 上叠加销售单详情（query 刷新前用本地行合并展示） */
  const [salesBillRevealFromPending, setSalesBillRevealFromPending] = useState<{ docNumber: string; records: any[] } | null>(null);

  const recordsListForSalesBillRevealMerged = useMemo(() => {
    const extra = salesBillRevealFromPending?.records;
    if (!extra?.length) return recordsList;
    const byId = new Map<string, unknown>();
    for (const r of recordsList) {
      const id = (r as { id?: string }).id;
      if (id) byId.set(id, r);
    }
    for (const r of extra) {
      const id = (r as { id?: string }).id;
      if (id) byId.set(id, r);
    }
    return [...byId.values()];
  }, [recordsList, salesBillRevealFromPending]);

  /** 与 flowDocSort.recordDocLineTimeMs 一致，用于库存流水等排序 */
  const parseRecordTime = useCallback((r: any): number => recordDocLineTimeMs(r), []);

  /**
   * Phase 3.B：库存索引切换到后端 stock-snapshot（react-query）。业务列表由
   * `usePsiOpsRecordsList` 按 tab `type` 分页拉取，不再依赖全量 `AppDataContext.psiRecords`。
   * byVariant.displayQty 已在后端做好「最近一次盘点 + 之后增减」。
   */
  const { getStock, getStockVariant, getNullVariantProdStock, getStocktakeAdjust, getVariantDisplayQty } = useStockSnapshot();
  const generateSBDocNumberForPartner = (partnerId: string, partnerName: string): string =>
    nextSalesBillDocNumber(partners, recordsListForSalesBillRevealMerged, partnerId, partnerName);
  const allPOByGroups = useMemo(
    () => groupRecordsByDocNumber(recordsList, 'PURCHASE_ORDER'),
    [recordsList],
  );

  // 按 (sourceOrderNumber, sourceLineId) 汇总采购单已入库数量
  const receivedByOrderLine = useMemo(() => sumReceivedByOrderLine(recordsList), [recordsList]);



  // 待发货清单：已配货且未发走的销售订单（待发 = 已配 - 已发），按 (docNumber, lineGroupId) 分组
  const pendingShipmentGroups = useMemo(() => {
    const linePending = (r: any) =>
      Math.max(0, (Number(r?.allocatedQuantity) || 0) - (Number(r?.shippedQuantity) || 0));
    if (type !== 'SALES_ORDER') return [];
    const list = recordsList.filter((r: any) => {
      if (r.type !== 'SALES_ORDER') return false;
      return linePending(r) > 0;
    });
    const groups: Record<string, { docNumber: string; productId: string; records: any[] }> = {};
    list.forEach((r: any) => {
      const gid = r.lineGroupId ?? r.id;
      const key = `${r.docNumber}::${gid}`;
      if (!groups[key]) {
        groups[key] = { docNumber: r.docNumber, productId: r.productId, records: [] };
      }
      groups[key].records.push(r);
    });
    return Object.entries(groups).map(([groupKey, g]) => {
      const product = productMapPSI.get(g.productId);
      const first = g.records[0];
      const warehouse = warehouseMapPSI.get((first.allocationWarehouseId || first.warehouseId));
      const totalQuantity = g.records.reduce((s, r) => s + linePending(r), 0);
      const firstRec = g.records[0];
      return {
        groupKey,
        docNumber: g.docNumber,
        productId: g.productId,
        productName: product?.name ?? firstRec?.productName ?? '—',
        productSku: product?.sku ?? firstRec?.productSku ?? '—',
        partner: first.partner ?? '—',
        warehouseId: first.allocationWarehouseId || first.warehouseId || '',
        warehouseName: warehouse?.name ?? '—',
        totalQuantity,
        records: g.records,
      };
    });
  }, [recordsList, type, products, warehouses]);

  const groupedRecords = useMemo(
    () => groupRecordsByDocNumber(recordsList, type),
    [recordsList, type],
  );

  /** 单据列表：销售单按真实生成时刻倒序（待发货生成含 timestamp/_savedAtMs）；其余按组内制单时间倒序；同刻再按单号流水 */
  const sortedGroupedEntries = useMemo(() => {
    const entries = Object.entries(groupedRecords);
    const sortKeyMs = (recs: any[]) =>
      type === 'SALES_BILL'
        ? psiDocGroupListSortMs(recs as { timestamp?: string; createdAt?: string; _savedAtMs?: number }[])
        : flowRecordsEarliestMs(recs as { timestamp?: string; createdAt?: string; _savedAtMs?: number }[]);
    return entries.sort(([docA, recsA], [docB, recsB]) => {
      const ma = sortKeyMs(recsA as any[]);
      const mb = sortKeyMs(recsB as any[]);
      const ha = ma > 0;
      const hb = mb > 0;
      if (ha !== hb) return ha ? -1 : 1;
      if (ha && hb && mb !== ma) return mb - ma;
      if (type === 'SALES_BILL') {
        const seqDiff = psiDocNumberSeqSuffix(docB) - psiDocNumberSeqSuffix(docA);
        if (seqDiff !== 0) return seqDiff;
      }
      return (docB || '').localeCompare(docA || '');
    });
  }, [groupedRecords, type]);

  const PSI_PAGE_SIZE = 20;
  const [psiPage, setPsiPage] = useState(1);
  const [psiListSearch, setPsiListSearch] = useState('');
  const debouncedPsiListSearch = useDebouncedValue(psiListSearch, 300);
  useEffect(() => {
    setPsiPage(1);
  }, [
    type,
    debouncedPsiListSearch,
    safePurchaseOrderFormSettings.listDisplay?.onlyShowUnsettled,
    safeSalesOrderFormSettings.listDisplay?.onlyShowNotFullyShipped,
  ]);

  const afterListDisplayFilter = useMemo(() => {
    if (type === 'PURCHASE_ORDER' && safePurchaseOrderFormSettings.listDisplay?.onlyShowUnsettled) {
      return sortedGroupedEntries.filter(([docNum, docItems]) =>
        purchaseOrderDocHasUnsettled(docNum, docItems as { id: string; quantity?: number | null }[], receivedByOrderLine),
      );
    }
    if (type === 'SALES_ORDER' && safeSalesOrderFormSettings.listDisplay?.onlyShowNotFullyShipped) {
      return sortedGroupedEntries.filter(([, docItems]) =>
        salesOrderDocHasNotFullyShippedLine(docItems as { id: string; lineGroupId?: string; quantity?: number | null; shippedQuantity?: number | null }[]),
      );
    }
    return sortedGroupedEntries;
  }, [
    sortedGroupedEntries,
    type,
    safePurchaseOrderFormSettings.listDisplay?.onlyShowUnsettled,
    safeSalesOrderFormSettings.listDisplay?.onlyShowNotFullyShipped,
    receivedByOrderLine,
  ]);

  const filteredGroupedEntries = useMemo(() => {
    const docTypes = ['PURCHASE_ORDER', 'PURCHASE_BILL', 'SALES_ORDER', 'SALES_BILL'];
    if (!docTypes.includes(type)) return afterListDisplayFilter;
    const q = debouncedPsiListSearch.trim().toLowerCase();
    if (!q) return afterListDisplayFilter;
    return afterListDisplayFilter.filter(([docNum, docItems]) => {
      const parts: string[] = [docNum, formatPsiDocNumForList(docNum)];
      const main = docItems[0] as Record<string, unknown> | undefined;
      if (main) {
        const mainTextKeys =
          type === 'PURCHASE_ORDER'
            ? (['partner', 'operator', 'productName', 'productSku'] as const)
            : (['partner', 'operator', 'note', 'productName', 'productSku'] as const);
        mainTextKeys.forEach(k => {
          const v = main[k];
          if (v != null && v !== '') parts.push(String(v));
        });
        const cd = main.customData;
        if (cd && typeof cd === 'object' && !Array.isArray(cd)) {
          for (const v of Object.values(cd as Record<string, unknown>)) {
            if (v != null && v !== '') parts.push(String(v));
          }
        }
        if (type === 'PURCHASE_ORDER') {
          const cdObj = main.customData && typeof main.customData === 'object' && !Array.isArray(main.customData)
            ? (main.customData as Record<string, unknown>)
            : undefined;
          const rpId = String(cdObj?.relatedProductId ?? '').trim();
          if (rpId) {
            const rp = productMapPSI.get(rpId);
            if (rp?.name) parts.push(rp.name);
            if (rp?.sku) parts.push(rp.sku);
          }
        }
        if (type === 'PURCHASE_BILL') {
          for (const line of docItems as Array<{ customData?: unknown }>) {
            const cd = line.customData;
            if (!cd || typeof cd !== 'object' || Array.isArray(cd)) continue;
            const rpId = String((cd as Record<string, unknown>).relatedProductId ?? '').trim();
            if (rpId) {
              const rp = productMapPSI.get(rpId);
              if (rp?.name) parts.push(rp.name);
              if (rp?.sku) parts.push(rp.sku);
            }
          }
        }
      }
      for (const line of docItems as Record<string, unknown>[]) {
        const pid = line.productId as string | undefined;
        const p = pid ? productMapPSI.get(pid) : undefined;
        const lineTextKeys =
          type === 'PURCHASE_ORDER' ? (['productName', 'productSku'] as const) : (['productName', 'productSku', 'note', 'lineNote'] as const);
        lineTextKeys.forEach(k => {
          const v = line[k];
          if (v != null && v !== '') parts.push(String(v));
        });
        parts.push(p?.name ?? '', p?.sku ?? '', String(line.quantity ?? ''));
      }
      return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
    });
  }, [afterListDisplayFilter, type, debouncedPsiListSearch, productMapPSI]);

  const psiTotalPages = Math.max(1, Math.ceil(filteredGroupedEntries.length / PSI_PAGE_SIZE));
  const pagedGroupedEntries = useMemo(
    () => filteredGroupedEntries.slice((psiPage - 1) * PSI_PAGE_SIZE, psiPage * PSI_PAGE_SIZE),
    [filteredGroupedEntries, psiPage],
  );

  /** 调拨单按单号分组（列表弹窗用） */
  const transferOrdersGrouped = useMemo(() => {
    const filtered = recordsList.filter((r: any) => r.type === 'TRANSFER');
    const groups: Record<string, any[]> = {};
    filtered.forEach((r: any) => {
      const key = r.docNumber || 'UNGROUPED-' + r.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  /** 盘点单按单号分组（列表弹窗用） */
  const stocktakeOrdersGrouped = useMemo(() => {
    const filtered = recordsList.filter((r: any) => r.type === 'STOCKTAKE');
    const groups: Record<string, any[]> = {};
    filtered.forEach((r: any) => {
      const key = r.docNumber || 'UNGROUPED-' + r.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  const showPoListPrintButton = type === 'PURCHASE_ORDER' && safePurchaseOrderFormSettings.listPrint?.showPrintButton !== false;
  const showPbListPrintButton = type === 'PURCHASE_BILL' && safePurchaseBillFormSettings.listPrint?.showPrintButton !== false;
  const showSoListPrintButton = type === 'SALES_ORDER' && safeSalesOrderFormSettings.listPrint?.showPrintButton !== false;
  const showSbListPrintButton = type === 'SALES_BILL' && safeSalesBillFormSettings.listPrint?.showPrintButton !== false;

  const closeOrderBillModal = useCallback(() => {
    setShowModal(null);
    setEditingPODocNumber(null);
    setEditingPBDocNumber(null);
    setEditingSODocNumber(null);
    setEditingSBDocNumber(null);
    setPurchaseOrderModalPhase(null);
    setPurchaseBillModalPhase(null);
    setSalesOrderModalPhase(null);
    setSalesBillModalPhase(null);
    setSalesBillRevealFromPending(null);
  }, []);

  const handlePsiOrderBillFlowDetail = useCallback(
    (docNumber: string) => {
      setPsiOrderBillFlowOpen(false);
      if (type === 'PURCHASE_ORDER') {
        setEditingPODocNumber(docNumber);
        setShowModal('PURCHASE_ORDER');
        setPurchaseOrderModalPhase('detail');
      } else if (type === 'PURCHASE_BILL') {
        setEditingPBDocNumber(docNumber);
        setShowModal('PURCHASE_BILL');
        setPurchaseBillModalPhase('detail');
      } else if (type === 'SALES_ORDER') {
        setEditingSODocNumber(docNumber);
        setShowModal('SALES_ORDER');
        setSalesOrderModalPhase('detail');
      } else if (type === 'SALES_BILL') {
        setEditingSBDocNumber(docNumber);
        setShowModal('SALES_BILL');
        setSalesBillModalPhase('detail');
      }
    },
    [type],
  );

  const psiTabViewPerm =
    type === 'PURCHASE_ORDER'
      ? 'psi:purchase_order:view'
      : type === 'PURCHASE_BILL'
        ? 'psi:purchase_bill:view'
        : type === 'SALES_ORDER'
          ? 'psi:sales_order:view'
          : type === 'SALES_BILL'
            ? 'psi:sales_bill:view'
            : '';

  const salesBillRevealOpen = salesBillRevealFromPending != null;
  const salesBillStdModalOpen = type === 'SALES_BILL' && showModal === 'SALES_BILL' && salesBillModalPhase;
  const salesBillOverlayOpen = salesBillStdModalOpen || salesBillRevealOpen;
  const salesBillModalPhaseResolved = salesBillRevealOpen ? 'detail' : salesBillModalPhase;
  const salesBillEditingDocForModal = salesBillRevealOpen ? salesBillRevealFromPending!.docNumber : editingSBDocNumber;
  const salesBillDetailRecordsList = salesBillRevealOpen ? recordsListForSalesBillRevealMerged : recordsList;
  const salesBillShowPrintResolved = salesBillRevealOpen
    ? safeSalesBillFormSettings.listPrint?.showPrintButton !== false
    : showSbListPrintButton;

  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>{current.label}</h1>
          <p className={pageSubtitleClass}>{current.sub || '管理业务单据与记录'}</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full sm:w-auto">
          {['PURCHASE_ORDER', 'PURCHASE_BILL', 'SALES_ORDER', 'SALES_BILL'].includes(type) &&
            !(showModal && showModal === type) &&
            sortedGroupedEntries.length > 0 && (
            <div className="relative w-full sm:w-56 sm:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                placeholder="搜索单号、往来单位、产品、SKU、备注…"
                value={psiListSearch}
                onChange={e => setPsiListSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
          )}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {type === 'PURCHASE_ORDER' && onUpdatePurchaseOrderFormSettings && (
            <button
              type="button"
              onClick={() => {
                setPoFormConfigEntryTab('fields');
                setShowPOFormConfigModal(true);
              }}
              className={formConfigToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'PURCHASE_BILL' && onUpdatePurchaseBillFormSettings && (
            <button
              type="button"
              onClick={() => {
                setPbFormConfigEntryTab('fields');
                setShowPBFormConfigModal(true);
              }}
              className={formConfigToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'SALES_ORDER' && onUpdateSalesOrderFormSettings && (
            <button
              type="button"
              onClick={() => {
                setSoFormConfigEntryTab('fields');
                setShowSOFormConfigModal(true);
              }}
              className={formConfigToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'SALES_BILL' && onUpdateSalesBillFormSettings && (
            <button
              type="button"
              onClick={() => {
                setSbFormConfigEntryTab('fields');
                setShowSBFormConfigModal(true);
              }}
              className={formConfigToolbarButtonClass}
            >
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {['PURCHASE_ORDER', 'PURCHASE_BILL', 'SALES_ORDER', 'SALES_BILL'].includes(type) &&
            !(showModal && showModal === type) &&
            hasPsiPerm(psiTabViewPerm) && (
            <button
              type="button"
              onClick={() => setPsiOrderBillFlowOpen(true)}
              className={outlineToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" /> {PSI_ORDER_BILL_FLOW_LABELS[type as keyof typeof PSI_ORDER_BILL_FLOW_LABELS]}
            </button>
          )}
          {type === 'SALES_ORDER' && !showModal && hasPsiPerm('psi:sales_order_pending_shipment:allow') && (
            <button
              type="button"
              onClick={() => setShowPendingShipmentModal(true)}
              className={outlineToolbarButtonClass}
            >
              <PackageCheck className="w-4 h-4 shrink-0" /> 待发货清单
              {pendingShipmentGroups.length > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                  {pendingShipmentGroups.length}
                </span>
              )}
            </button>
          )}
          {type !== 'WAREHOUSE_MGMT' && !(type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') && !(type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL') && !(type === 'SALES_ORDER' && showModal === 'SALES_ORDER') && !(type === 'SALES_BILL' && showModal === 'SALES_BILL') && hasPsiPerm(`psi:${type === 'PURCHASE_ORDER' ? 'purchase_order' : type === 'PURCHASE_BILL' ? 'purchase_bill' : type === 'SALES_ORDER' ? 'sales_order' : 'sales_bill'}:create`) && (
            <button
              type="button"
              onClick={() => {
                setEditingPODocNumber(null);
                setEditingPBDocNumber(null);
                setEditingSODocNumber(null);
                setEditingSBDocNumber(null);
                setShowModal(type);
                if (type === 'PURCHASE_ORDER') setPurchaseOrderModalPhase('edit');
                else if (type === 'PURCHASE_BILL') setPurchaseBillModalPhase('edit');
                else if (type === 'SALES_ORDER') setSalesOrderModalPhase('edit');
                else if (type === 'SALES_BILL') setSalesBillModalPhase('edit');
              }}
              className={`${primaryToolbarButtonClass} ${current.color}`}
            >
            <Plus className="w-4 h-4 shrink-0" /> 登记新{current.label}
          </button>
        )}
        </div>
        </div>
      </div>

      {type === 'SALES_ORDER' && showPendingShipmentModal && (
        <PendingShipmentListModal
          pendingShipmentGroups={pendingShipmentGroups}
          partners={partners}
          products={products}
          recordsList={recordsList}
          onClose={() => setShowPendingShipmentModal(false)}
          onOpenDetail={group => setPendingShipDetailGroup(group)}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onReplaceRecords={onReplaceRecords}
          generateSBDocNumberForPartner={generateSBDocNumberForPartner}
          onSalesBillCreated={(docNumber, billRecords) => {
            setSalesBillRevealFromPending({ docNumber, records: billRecords });
          }}
        />
      )}

      {type === 'SALES_ORDER' && pendingShipDetailGroup && (
        <PendingShipDetailModal
          key={pendingShipDetailGroup.groupKey}
          group={pendingShipDetailGroup}
          productMapPSI={productMapPSI}
          dictionaries={dictionaries}
          getUnitName={getUnitName}
          warehouses={warehouses}
          onReplaceRecords={onReplaceRecords}
          recordsList={recordsList}
          onClose={() => setPendingShipDetailGroup(null)}
        />
      )}

      {type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER' && purchaseOrderModalPhase && (
        <PsiOrderBillDocModal
          open
          phase={purchaseOrderModalPhase}
          editingDocNumber={editingPODocNumber}
          maxWidthClass="max-w-4xl"
          detailTitle="采购订单详情"
          editTitle="编辑采购订单"
          newTitle="新建采购订单"
          showPrint={showPoListPrintButton}
          onPrint={() => {
            void refreshPrintTemplates();
            poListPrintControllerRef.current?.openPicker(editingPODocNumber);
          }}
          permSubmodule="purchase_order"
          deleteConfirmMessage="确定要删除该采购订单吗？"
          recordType="PURCHASE_ORDER"
          onDeleteRecords={onDeleteRecords}
          onClose={closeOrderBillModal}
          onEnterEdit={() => setPurchaseOrderModalPhase('edit')}
          onCancelEdit={() => setPurchaseOrderModalPhase('detail')}
          hasPsiPerm={hasPsiPerm}
          detailContent={
            <PsiDocDetailSummary
              docType="PURCHASE_ORDER"
              docNumber={editingPODocNumber!}
              recordsList={recordsList}
              productMapPSI={productMapPSI}
              categories={categories}
              showPurchaseOrderRelatedProduct={safePurchaseOrderFormSettings.relatedProductEnabled === true}
              dictionaries={dictionaries}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              receivedByOrderLine={receivedByOrderLine}
              onProductImagePreview={setPsiProductImagePreviewUrl}
              headerCustomFieldDefs={safePurchaseOrderFormSettings.customFields}
              showAmount={showPsiDocAmount('PURCHASE_ORDER')}
            />
          }
          formContent={
            <OrderBillFormPage
              key={`PURCHASE_ORDER-${editingPODocNumber ?? 'new'}`}
              formType="PURCHASE_ORDER"
              products={products}
              warehouses={warehouses}
              categories={categories}
              partners={partners}
              partnerCategories={partnerCategories}
              dictionaries={dictionaries}
              records={recordsList}
              getStock={getStock}
              getVariantDisplayQty={getVariantDisplayQty}
              getNullVariantProdStock={getNullVariantProdStock}
              productMapPSI={productMapPSI}
              warehouseMapPSI={warehouseMapPSI}
              categoryMapPSI={categoryMapPSI}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              onBack={closeOrderBillModal}
              onSave={onAddRecord}
              onSaveBatch={onAddRecordBatch}
              onReplaceRecords={onReplaceRecords}
              onDeleteRecords={onDeleteRecords}
              editingDocNumber={editingPODocNumber}
              purchaseOrderFormSettings={safePurchaseOrderFormSettings}
              salesOrderFormSettings={safeSalesOrderFormSettings}
              purchaseBillFormSettings={safePurchaseBillFormSettings}
              salesBillFormSettings={safeSalesBillFormSettings}
              userPermissions={userPermissions}
              tenantRole={tenantRole}
              partnerLabel={current.partnerLabel || '供应商'}
              prodRecords={prodRecords}
              orderBillPrintTemplates={printTemplates}
            />
          }
        />
      )}

      {type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL' && purchaseBillModalPhase && (
        <PsiOrderBillDocModal
          open
          phase={purchaseBillModalPhase}
          editingDocNumber={editingPBDocNumber}
          maxWidthClass="max-w-4xl"
          detailTitle="采购入库详情"
          editTitle="编辑采购入库"
          newTitle="新建采购入库"
          showPrint={showPbListPrintButton}
          onPrint={() => {
            void refreshPrintTemplates();
            pbListPrintControllerRef.current?.openPicker(editingPBDocNumber);
          }}
          permSubmodule="purchase_bill"
          deleteConfirmMessage="确定要删除该采购入库单吗？"
          recordType="PURCHASE_BILL"
          onDeleteRecords={onDeleteRecords}
          onClose={closeOrderBillModal}
          onEnterEdit={() => setPurchaseBillModalPhase('edit')}
          onCancelEdit={() => setPurchaseBillModalPhase('detail')}
          hasPsiPerm={hasPsiPerm}
          detailContent={
            <PsiDocDetailSummary
              docType="PURCHASE_BILL"
              docNumber={editingPBDocNumber!}
              recordsList={recordsList}
              productMapPSI={productMapPSI}
              categories={categories}
              showPurchaseBillRelatedProduct={safePurchaseBillFormSettings.relatedProductEnabled === true}
              warehouseMapPSI={warehouseMapPSI}
              dictionaries={dictionaries}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              onProductImagePreview={setPsiProductImagePreviewUrl}
              headerCustomFieldDefs={safePurchaseBillFormSettings.customFields}
              showAmount={showPsiDocAmount('PURCHASE_BILL')}
            />
          }
          formContent={
            <OrderBillFormPage
              key={`PURCHASE_BILL-${editingPBDocNumber ?? 'new'}`}
              formType="PURCHASE_BILL"
              products={products}
              warehouses={warehouses}
              categories={categories}
              partners={partners}
              partnerCategories={partnerCategories}
              dictionaries={dictionaries}
              records={recordsList}
              getStock={getStock}
              getVariantDisplayQty={getVariantDisplayQty}
              getNullVariantProdStock={getNullVariantProdStock}
              productMapPSI={productMapPSI}
              warehouseMapPSI={warehouseMapPSI}
              categoryMapPSI={categoryMapPSI}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              onBack={closeOrderBillModal}
              onSave={onAddRecord}
              onSaveBatch={onAddRecordBatch}
              onReplaceRecords={onReplaceRecords}
              onDeleteRecords={onDeleteRecords}
              editingDocNumber={editingPBDocNumber}
              purchaseOrderFormSettings={safePurchaseOrderFormSettings}
              salesOrderFormSettings={safeSalesOrderFormSettings}
              purchaseBillFormSettings={safePurchaseBillFormSettings}
              salesBillFormSettings={safeSalesBillFormSettings}
              userPermissions={userPermissions}
              tenantRole={tenantRole}
              partnerLabel={current.partnerLabel || '供应商'}
              prodRecords={prodRecords}
              orderBillPrintTemplates={printTemplates}
            />
          }
        />
      )}

      {type === 'SALES_ORDER' && showModal === 'SALES_ORDER' && salesOrderModalPhase && (
        <PsiOrderBillDocModal
          open
          phase={salesOrderModalPhase}
          editingDocNumber={editingSODocNumber}
          maxWidthClass="max-w-5xl"
          detailTitle="销售订单详情"
          editTitle="编辑销售订单"
          newTitle="新建销售订单"
          showPrint={showSoListPrintButton}
          onPrint={() => {
            void refreshPrintTemplates();
            soListPrintControllerRef.current?.openPicker(editingSODocNumber);
          }}
          permSubmodule="sales_order"
          deleteConfirmMessage="确定要删除该销售订单吗？"
          recordType="SALES_ORDER"
          onDeleteRecords={onDeleteRecords}
          onClose={closeOrderBillModal}
          onEnterEdit={() => setSalesOrderModalPhase('edit')}
          onCancelEdit={() => setSalesOrderModalPhase('detail')}
          hasPsiPerm={hasPsiPerm}
          detailContent={
            <PsiDocDetailSummary
              docType="SALES_ORDER"
              docNumber={editingSODocNumber!}
              recordsList={recordsList}
              productMapPSI={productMapPSI}
              categories={categories}
              dictionaries={dictionaries}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              onProductImagePreview={setPsiProductImagePreviewUrl}
              headerCustomFieldDefs={safeSalesOrderFormSettings.customFields}
              showAmount={showPsiDocAmount('SALES_ORDER')}
            />
          }
          formContent={
            <OrderBillFormPage
              key={`SALES_ORDER-${editingSODocNumber ?? 'new'}`}
              formType="SALES_ORDER"
              products={products}
              warehouses={warehouses}
              categories={categories}
              partners={partners}
              partnerCategories={partnerCategories}
              dictionaries={dictionaries}
              records={recordsList}
              getStock={getStock}
              getVariantDisplayQty={getVariantDisplayQty}
              getNullVariantProdStock={getNullVariantProdStock}
              productMapPSI={productMapPSI}
              warehouseMapPSI={warehouseMapPSI}
              categoryMapPSI={categoryMapPSI}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              onBack={closeOrderBillModal}
              onSave={onAddRecord}
              onSaveBatch={onAddRecordBatch}
              onReplaceRecords={onReplaceRecords}
              onDeleteRecords={onDeleteRecords}
              editingDocNumber={editingSODocNumber}
              purchaseOrderFormSettings={safePurchaseOrderFormSettings}
              salesOrderFormSettings={safeSalesOrderFormSettings}
              purchaseBillFormSettings={safePurchaseBillFormSettings}
              salesBillFormSettings={safeSalesBillFormSettings}
              userPermissions={userPermissions}
              tenantRole={tenantRole}
              partnerLabel={current.partnerLabel || '客户'}
              prodRecords={prodRecords}
              orderBillPrintTemplates={printTemplates}
            />
          }
        />
      )}

      {salesBillOverlayOpen && salesBillModalPhaseResolved && (
        <PsiOrderBillDocModal
          open
          phase={salesBillModalPhaseResolved}
          editingDocNumber={salesBillEditingDocForModal}
          maxWidthClass="max-w-4xl"
          detailTitle="销售单详情"
          editTitle="编辑销售单"
          newTitle="新建销售单"
          showPrint={salesBillShowPrintResolved}
          onPrint={() => {
            void refreshPrintTemplates();
            sbListPrintControllerRef.current?.openPicker(salesBillEditingDocForModal);
          }}
          permSubmodule="sales_bill"
          deleteConfirmMessage="确定要删除该销售单吗？"
          recordType="SALES_BILL"
          onDeleteRecords={onDeleteRecords}
          onClose={() => {
            if (salesBillRevealOpen) {
              setSalesBillRevealFromPending(null);
              return;
            }
            closeOrderBillModal();
          }}
          onEnterEdit={() => setSalesBillModalPhase('edit')}
          onCancelEdit={() => setSalesBillModalPhase('detail')}
          hasPsiPerm={hasPsiPerm}
          detailContent={
            <PsiDocDetailSummary
              docType="SALES_BILL"
              docNumber={salesBillEditingDocForModal!}
              recordsList={salesBillDetailRecordsList}
              productMapPSI={productMapPSI}
              categories={categories}
              warehouseMapPSI={warehouseMapPSI}
              dictionaries={dictionaries}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              onProductImagePreview={setPsiProductImagePreviewUrl}
              headerCustomFieldDefs={safeSalesBillFormSettings.customFields}
              showAmount={showPsiDocAmount('SALES_BILL')}
            />
          }
          formContent={
            <OrderBillFormPage
              key={`SALES_BILL-${editingSBDocNumber ?? 'new'}`}
              formType="SALES_BILL"
              products={products}
              warehouses={warehouses}
              categories={categories}
              partners={partners}
              partnerCategories={partnerCategories}
              dictionaries={dictionaries}
              records={recordsList}
              getStock={getStock}
              getVariantDisplayQty={getVariantDisplayQty}
              getNullVariantProdStock={getNullVariantProdStock}
              productMapPSI={productMapPSI}
              warehouseMapPSI={warehouseMapPSI}
              categoryMapPSI={categoryMapPSI}
              getUnitName={getUnitName}
              formatQtyDisplay={formatQtyDisplay}
              onBack={closeOrderBillModal}
              onSave={onAddRecord}
              onSaveBatch={onAddRecordBatch}
              onReplaceRecords={onReplaceRecords}
              onDeleteRecords={onDeleteRecords}
              editingDocNumber={editingSBDocNumber}
              purchaseOrderFormSettings={safePurchaseOrderFormSettings}
              salesOrderFormSettings={safeSalesOrderFormSettings}
              purchaseBillFormSettings={safePurchaseBillFormSettings}
              salesBillFormSettings={safeSalesBillFormSettings}
              userPermissions={userPermissions}
              tenantRole={tenantRole}
              partnerLabel={current.partnerLabel || '客户'}
              prodRecords={prodRecords}
              orderBillPrintTemplates={printTemplates}
            />
          }
        />
      )}

      {type === 'WAREHOUSE_MGMT' ? (
        <WarehousePanel
          products={products}
          warehouses={warehouses}
          categories={categories}
          partners={partners}
          dictionaries={dictionaries}
          records={recordsList}
          prodRecords={prodRecords}
          orders={ordersList}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onReplaceRecords={onReplaceRecords}
          onDeleteRecords={onDeleteRecords}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          getStock={getStock}
          getVariantDisplayQty={getVariantDisplayQty}
          getNullVariantProdStock={getNullVariantProdStock}
          productMapPSI={productMapPSI}
          warehouseMapPSI={warehouseMapPSI}
          categoryMapPSI={categoryMapPSI}
          getUnitName={getUnitName}
          formatQtyDisplay={formatQtyDisplay}
          parseRecordTime={parseRecordTime}
        />
      ) : (
        <div className={psiOrderBillListStackClass}>
          {pagedGroupedEntries.length === 0 && sortedGroupedEntries.length === 0 ? (
            <div className={psiOrderBillListEmptyClass}>
              <FileText className="w-12 h-12 text-slate-100 mx-auto mb-3" />
              <p className="text-slate-400 font-medium italic">暂无{current.label}流水记录</p>
            </div>
          ) : pagedGroupedEntries.length === 0 && afterListDisplayFilter.length === 0 && sortedGroupedEntries.length > 0 ? (
            <div className={psiOrderBillListEmptyClass}>
              <FileText className="w-12 h-12 text-slate-100 mx-auto mb-3" />
              <p className="text-slate-400 font-medium italic">
                {type === 'PURCHASE_ORDER' && safePurchaseOrderFormSettings.listDisplay?.onlyShowUnsettled
                  ? '已开启「只显示未交清」，当前没有符合条件的采购订单。可在表单配置中关闭该选项以查看全部。'
                  : type === 'SALES_ORDER' && safeSalesOrderFormSettings.listDisplay?.onlyShowNotFullyShipped
                    ? '已开启「只显示未发齐」，当前没有符合条件的销售订单。可在表单配置中关闭该选项以查看全部。'
                    : '无匹配项，请调整搜索关键词'}
              </p>
            </div>
          ) : pagedGroupedEntries.length === 0 && filteredGroupedEntries.length === 0 && afterListDisplayFilter.length > 0 && sortedGroupedEntries.length > 0 ? (
            <div className={psiOrderBillListEmptyClass}>
              <FileText className="w-12 h-12 text-slate-100 mx-auto mb-3" />
              <p className="text-slate-400 font-medium italic">无匹配项，请调整搜索关键词</p>
            </div>
          ) : (
            pagedGroupedEntries.map(([docNum, docItems]) => {
              const mainInfo = docItems[0];
              const totalQty = docItems.reduce((s, i) => s + (i.quantity ?? 0), 0);
              const totalAmount = (type === 'SALES_ORDER' || type === 'SALES_BILL')
                ? docItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.salesPrice ?? 0), 0)
                : docItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.purchasePrice ?? 0), 0);
              const isPurchaseOrderFullyReceived =
                type === 'PURCHASE_ORDER' &&
                docItems.every((item: any) => (item.quantity ?? 0) <= (receivedByOrderLine[`${docNum}::${item.id}`] ?? 0));
              const isSalesOrderFullyShipped =
                type === 'SALES_ORDER' &&
                salesOrderDocFullyShipped(
                  docItems as {
                    id: string;
                    lineGroupId?: string;
                    quantity?: number | null;
                    shippedQuantity?: number | null;
                  }[],
                );
              const poDocNumBadgeClass =
                'px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-indigo-50 text-indigo-600 border-indigo-100';
              const soDocNumBadgeClass = poDocNumBadgeClass;
              const docCompletedBadgeClass =
                'text-[10px] font-black text-indigo-600 uppercase tracking-tighter bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 shadow-sm';
              const openSalesOrderDetail = () => {
                setEditingSODocNumber(docNum);
                setShowModal('SALES_ORDER');
                setSalesOrderModalPhase('detail');
              };
              const openSalesBillDetail = () => {
                setEditingSBDocNumber(docNum);
                setShowModal('SALES_BILL');
                setSalesBillModalPhase('detail');
              };
              const openPurchaseOrderDetail = () => {
                setEditingPODocNumber(docNum);
                setShowModal('PURCHASE_ORDER');
                setPurchaseOrderModalPhase('detail');
              };
              const openPurchaseBillDetail = () => {
                setEditingPBDocNumber(docNum);
                setShowModal('PURCHASE_BILL');
                setPurchaseBillModalPhase('detail');
              };

              return (
                <div key={docNum} className={psiOrderBillListCardClass}>
                  <div className={psiOrderBillListCardHeaderClass}>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:border-indigo-100 transition-all ${
                          isPurchaseOrderFullyReceived ? 'text-emerald-500' : 'text-slate-400 group-hover:text-indigo-600'
                        }`}
                      >
                        {isPurchaseOrderFullyReceived ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Building2 className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          {type === 'PURCHASE_ORDER' ? (
                            <>
                              <h3 className="text-sm font-black text-slate-800">{mainInfo.partner || '未指定单位'}</h3>
                              <span className={poDocNumBadgeClass}>
                                {docNum.startsWith('UNGROUPED-') ? '独立单据' : docNum}
                              </span>
                              {isPurchaseOrderFullyReceived && (
                                <span className={docCompletedBadgeClass}>已入库完成</span>
                              )}
                            </>
                          ) : type === 'SALES_ORDER' ? (
                            <>
                              <h3 className="text-sm font-black text-slate-800">{mainInfo.partner || '未指定单位'}</h3>
                              <span className={soDocNumBadgeClass}>
                                {docNum.startsWith('UNGROUPED-') ? '独立单据' : docNum}
                              </span>
                              {isSalesOrderFullyShipped && (
                                <span className={docCompletedBadgeClass}>已完成</span>
                              )}
                            </>
                          ) : (
                            <>
                              <h3 className="text-sm font-black text-slate-800">{mainInfo.partner || '未指定单位'}</h3>
                              <span className={poDocNumBadgeClass}>
                                {docNum.startsWith('UNGROUPED-') ? '独立单据' : docNum}
                              </span>
                              {type === 'SALES_BILL' && totalQty < 0 && (
                                <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shadow-sm">
                                  销售退货
                                </span>
                              )}
                              {type === 'PURCHASE_BILL' && totalQty < 0 && (
                                <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shadow-sm">
                                  采购退货
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-400 uppercase flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatPsiDocListTime(docItems as any[])}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> 经办: {mainInfo.operator}</span>
                          {type === 'PURCHASE_ORDER' &&
                            (() => {
                              const sn = String(
                                (mainInfo as { customData?: Record<string, unknown> }).customData?.[
                                  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER
                                ] ?? '',
                              ).trim();
                              if (!sn) return null;
                              return (
                                <span className="flex items-center gap-1 text-slate-500 normal-case" title={`来源计划: ${sn}`}>
                                  来源计划: {sn}
                                </span>
                              );
                            })()}
                          {type === 'PURCHASE_ORDER' &&
                            safePurchaseOrderFormSettings.relatedProductEnabled &&
                            String(
                              (mainInfo as { customData?: Record<string, unknown> }).customData?.relatedProductId ?? '',
                            ).trim() !== '' && (
                              <span
                                className="flex items-center gap-1 text-slate-500 normal-case"
                                title={`关联产品: ${purchaseOrderStandardListText('relatedProduct', mainInfo, docNum, productMapPSI)}`}
                              >
                                关联产品: {purchaseOrderStandardListText('relatedProduct', mainInfo, docNum, productMapPSI)}
                              </span>
                            )}
                          {type === 'PURCHASE_ORDER' &&
                            safePurchaseOrderFormSettings.standardFields
                              .filter(
                                f =>
                                  f.showInList &&
                                  f.id !== 'relatedProduct' &&
                                  f.id !== 'createdAt' &&
                                  f.id !== 'note' &&
                                  f.id !== 'docNumber' &&
                                  f.id !== 'partner' &&
                                  f.id !== 'warehouse' &&
                                  f.id !== 'warehouseId',
                              )
                              .map(f => {
                                const text = purchaseOrderStandardListText(f.id, mainInfo, docNum, productMapPSI);
                                return (
                                  <span key={`po-std-${f.id}`} className="flex items-center gap-1 text-slate-500 normal-case" title={`${f.label}: ${text}`}>
                                    {f.label}: {text}
                                  </span>
                                );
                              })}
                          {type === 'PURCHASE_ORDER' &&
                            safePurchaseOrderFormSettings.customFields
                              .filter(f => f.showInList)
                              .filter(cf => psiCustomFieldHasFilledDisplayValue(cf, mainInfo.customData?.[cf.id]))
                              .map(cf => {
                                const text = compactPsiListCustomValue(cf, mainInfo.customData?.[cf.id]);
                                return (
                                  <span key={`po-cf-${cf.id}`} className="flex items-center gap-1 text-slate-500 normal-case" title={`${cf.label}: ${text}`}>
                                    {cf.label}: {text}
                                  </span>
                                );
                              })}
                          {type === 'PURCHASE_BILL' &&
                            safePurchaseBillFormSettings.standardFields
                              .filter(
                                f =>
                                  f.showInList &&
                                  f.id !== 'relatedProduct' &&
                                  f.id !== 'createdAt' &&
                                  f.id !== 'note' &&
                                  f.id !== 'docNumber' &&
                                  f.id !== 'partner' &&
                                  f.id !== 'warehouse' &&
                                  f.id !== 'warehouseId',
                              )
                              .map(f => {
                                const text = purchaseBillStandardListText(f.id, mainInfo, docNum, warehouseMapPSI, productMapPSI);
                                return (
                                  <span key={`pb-std-${f.id}`} className="flex items-center gap-1 text-slate-500 normal-case" title={`${f.label}: ${text}`}>
                                    {f.label}: {text}
                                  </span>
                                );
                              })}
                          {type === 'PURCHASE_BILL' &&
                            safePurchaseBillFormSettings.customFields
                              .filter(f => f.showInList)
                              .filter(cf => psiCustomFieldHasFilledDisplayValue(cf, mainInfo.customData?.[cf.id]))
                              .map(cf => {
                                const text = compactPsiListCustomValue(cf, mainInfo.customData?.[cf.id]);
                                return (
                                  <span key={`pb-cf-${cf.id}`} className="flex items-center gap-1 text-slate-500 normal-case" title={`${cf.label}: ${text}`}>
                                    {cf.label}: {text}
                                  </span>
                                );
                              })}
                          {type === 'SALES_ORDER' &&
                            safeSalesOrderFormSettings.standardFields
                              .filter(
                                f =>
                                  f.showInList &&
                                  f.id !== 'createdAt' &&
                                  f.id !== 'note' &&
                                  f.id !== 'docNumber' &&
                                  f.id !== 'partner',
                              )
                              .map(f => {
                                const text = purchaseOrderStandardListText(f.id, mainInfo, docNum, productMapPSI);
                                return (
                                  <span key={`so-std-${f.id}`} className="flex items-center gap-1 text-slate-500 normal-case" title={`${f.label}: ${text}`}>
                                    {f.label}: {text}
                                  </span>
                                );
                              })}
                          {type === 'SALES_ORDER' &&
                            safeSalesOrderFormSettings.customFields
                              .filter(f => f.showInList)
                              .filter(cf => psiCustomFieldHasFilledDisplayValue(cf, mainInfo.customData?.[cf.id]))
                              .map(cf => {
                                const text = compactPsiListCustomValue(cf, mainInfo.customData?.[cf.id]);
                                return (
                                  <span key={`so-cf-${cf.id}`} className="flex items-center gap-1 text-slate-500 normal-case" title={`${cf.label}: ${text}`}>
                                    {cf.label}: {text}
                                  </span>
                                );
                              })}
                          {type === 'SALES_BILL' &&
                            safeSalesBillFormSettings.customFields
                              .filter(f => f.showInList)
                              .filter(cf => psiCustomFieldHasFilledDisplayValue(cf, mainInfo.customData?.[cf.id]))
                              .map(cf => {
                                const text = compactPsiListCustomValue(cf, mainInfo.customData?.[cf.id]);
                                return (
                                  <span key={`sb-cf-${cf.id}`} className="flex items-center gap-1 text-slate-500 normal-case" title={`${cf.label}: ${text}`}>
                                    {cf.label}: {text}
                                  </span>
                                );
                              })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-1">
                        <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据总量</p>
                        <p className={`text-base font-black ${(type === 'SALES_BILL' || type === 'PURCHASE_BILL') && totalQty < 0 ? 'text-amber-600' : 'text-slate-900'}`}>{totalQty.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></p>
                      </div>
                      {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL' || type === 'SALES_ORDER' || type === 'SALES_BILL') && showPsiDocAmount(type) && (
                        <div className="text-right mr-1">
                          <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据金额</p>
                          <p className={`text-base font-black ${(type === 'SALES_BILL' || type === 'PURCHASE_BILL') && totalAmount < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>¥{totalAmount.toFixed(2)}</p>
                        </div>
                      )}
                      {type === 'PURCHASE_ORDER' && hasPsiPerm('psi:purchase_order:view') && (
                        <>
                          {showPoListPrintButton && (
                            <button
                              type="button"
                              onClick={() => {
                                void refreshPrintTemplates();
                                poListPrintControllerRef.current?.openPicker(docNum);
                              }}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-700 transition-all hover:bg-slate-50"
                            >
                              <Printer className="h-3.5 w-3.5" /> 打印
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={openPurchaseOrderDetail}
                            className="flex items-center gap-1 rounded-lg border border-indigo-100 bg-white px-2.5 py-1 text-[10px] font-black text-indigo-600 transition-all hover:bg-indigo-50"
                          >
                            <FileText className="w-3.5 h-3.5" /> 详情
                          </button>
                        </>
                      )}
                      {type === 'PURCHASE_BILL' && hasPsiPerm('psi:purchase_bill:view') && (
                        <>
                          {showPbListPrintButton && (
                            <button
                              type="button"
                              onClick={() => {
                                void refreshPrintTemplates();
                                pbListPrintControllerRef.current?.openPicker(docNum);
                              }}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-700 transition-all hover:bg-slate-50"
                            >
                              <Printer className="h-3.5 w-3.5" /> 打印
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={openPurchaseBillDetail}
                            className="px-2.5 py-1 text-[10px] font-black rounded-lg border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" /> 详情
                          </button>
                        </>
                      )}
                      {type === 'SALES_ORDER' && hasPsiPerm('psi:sales_order:view') && (
                        <>
                          {showSoListPrintButton && (
                            <button
                              type="button"
                              onClick={() => {
                                void refreshPrintTemplates();
                                soListPrintControllerRef.current?.openPicker(docNum);
                              }}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-700 transition-all hover:bg-slate-50"
                            >
                              <Printer className="h-3.5 w-3.5" /> 打印
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={openSalesOrderDetail}
                            className="px-2.5 py-1 text-[10px] font-black rounded-lg border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" /> 详情
                          </button>
                        </>
                      )}
                      {type === 'SALES_BILL' && hasPsiPerm('psi:sales_bill:view') && (
                        <>
                          {showSbListPrintButton && (
                            <button
                              type="button"
                              onClick={() => {
                                void refreshPrintTemplates();
                                sbListPrintControllerRef.current?.openPicker(docNum);
                              }}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-700 transition-all hover:bg-slate-50"
                            >
                              <Printer className="h-3.5 w-3.5" /> 打印
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={openSalesBillDetail}
                            className="px-2.5 py-1 text-[10px] font-black rounded-lg border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" /> 详情
                          </button>
                        </>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>

                  <div className={psiOrderBillListTableWrapClass}>
                    <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: 'auto' }} />
                        {type === 'PURCHASE_BILL' && safePurchaseBillFormSettings.relatedProductEnabled && (
                          <col style={{ width: 120 }} />
                        )}
                        {!current.hideWarehouse && <col style={{ width: 100 }} />}
                        {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <col style={{ width: 100 }} />}
                        {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && showPsiDocAmount(type) && <col style={{ width: 100 }} />}
                        {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && showPsiDocAmount(type) && <col style={{ width: 110 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 132 }} />}
                        {type === 'SALES_ORDER' && showPsiDocAmount(type) && <col style={{ width: 82 }} />}
                        {type === 'SALES_ORDER' && showPsiDocAmount(type) && <col style={{ width: 92 }} />}
                        {type === 'SALES_BILL' && <col style={{ width: 132 }} />}
                        {type === 'SALES_BILL' && showPsiDocAmount(type) && <col style={{ width: 82 }} />}
                        {type === 'SALES_BILL' && showPsiDocAmount(type) && <col style={{ width: 92 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 140 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 82 }} />}
                        {type === 'PURCHASE_ORDER' && <col style={{ width: 140 }} />}
                      </colgroup>
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                          <th className="pb-2 pr-3 text-left">产品信息 / SKU</th>
                          {type === 'PURCHASE_BILL' && safePurchaseBillFormSettings.relatedProductEnabled && (
                            <th className="pb-2 px-3 text-left normal-case">关联产品</th>
                          )}
                          {!current.hideWarehouse && <th className="pb-2 px-3 text-center">{type === 'SALES_BILL' ? '出库仓库' : '入库仓库'}</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <th className="pb-2 px-3 text-right">数量</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && showPsiDocAmount(type) && <th className="pb-2 px-3 text-right">采购价</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && showPsiDocAmount(type) && <th className="pb-2 px-3 text-right">金额</th>}
                          {type === 'SALES_ORDER' && <th className="pb-2 px-3 text-right">数量</th>}
                          {type === 'SALES_ORDER' && showPsiDocAmount(type) && <th className="pb-2 px-3 text-right">销售价</th>}
                          {type === 'SALES_ORDER' && showPsiDocAmount(type) && <th className="pb-2 px-3 text-right">金额</th>}
                          {type === 'SALES_BILL' && <th className="pb-2 px-3 text-right">数量</th>}
                          {type === 'SALES_BILL' && showPsiDocAmount(type) && <th className="pb-2 px-3 text-right">销售价</th>}
                          {type === 'SALES_BILL' && showPsiDocAmount(type) && <th className="pb-2 px-3 text-right">金额</th>}
                          {type === 'SALES_ORDER' && (
                            <th className={`pb-2 px-3 ${showPsiDocAmount(type) ? 'text-left' : 'text-right'}`}>配货进度</th>
                          )}
                          {type === 'SALES_ORDER' && <th className="pb-2 px-3 text-center">操作</th>}
                          {type === 'PURCHASE_ORDER' && (
                            <th className={`pb-2 px-3 ${showPsiDocAmount(type) ? 'text-left' : 'text-right'}`}>入库进度</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(() => {
                          const groups: Record<string, any[]> = {};
                          (docItems as any[]).forEach((item: any) => {
                            const gid = item.lineGroupId ?? item.id;
                            if (!groups[gid]) groups[gid] = [];
                            groups[gid].push(item);
                          });
                          return Object.entries(groups).map(([gid, grp]) => {
                            const first = grp[0];
                            const product = productMapPSI.get(first.productId);
                            const lineCategory = product ? categoryMapPSI.get(product.categoryId) : undefined;
                            const rowProductName = product?.name || (first as any)?.productName;
                            const rowProductSku = product?.sku || (first as any)?.productSku;
                            const productCustomTags = getProductCategoryCustomFieldEntries(
                              product,
                              product ? categoryMapPSI.get(product.categoryId) : undefined,
                              { includeFile: false },
                            );
                            const warehouse = warehouseMapPSI.get(first.warehouseId);
                            const orderQty = grp.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
                            const allocatedQty = type === 'SALES_ORDER' ? grp.reduce((s, i) => s + (i.allocatedQuantity ?? 0), 0) : 0;
                            const shippedQty = type === 'SALES_ORDER' ? grp.reduce((s, i) => s + (Number(i.shippedQuantity) || 0), 0) : 0;
                            /** 待发 = 总已配 − 总已发（与待发货清单、靛色条一致） */
                            const allocPendingQty =
                              type === 'SALES_ORDER' ? Math.max(0, allocatedQty - shippedQty) : 0;
                            const received = type === 'PURCHASE_ORDER'
                              ? grp.reduce((s, i) => s + (receivedByOrderLine[`${docNum}::${i.id}`] ?? 0), 0)
                              : 0;
                            const progress = orderQty > 0 ? Math.min(1, received / orderQty) : 0;
                            const rowAmount = (type === 'SALES_ORDER' || type === 'SALES_BILL')
                              ? grp.reduce((s, i) => s + (i.quantity ?? 0) * (i.salesPrice ?? 0), 0)
                              : grp.reduce((s, i) => s + (i.quantity ?? 0) * (i.purchasePrice ?? 0), 0);
                            const avgPrice = orderQty > 0 ? rowAmount / orderQty : 0;
                            const variantParts = grp
                              .filter((i: any) => i.variantId && product?.variants)
                              .map((i: any) => {
                                const v = product?.variants?.find((vv: ProductVariant) => vv.id === i.variantId);
                                if (!v) return '';
                                const c = dictionaries.colors.find(cc => cc.id === v.colorId)?.name ?? '';
                                const sz = dictionaries.sizes.find(ss => ss.id === v.sizeId)?.name ?? '';
                                return [c, sz].filter(Boolean).join(' / ');
                              })
                              .filter(Boolean);
                            const variantLabel = variantParts.length > 1
                              ? `多规格 (${variantParts.join(', ')})`
                              : variantParts[0]
                                ? variantParts[0]
                                : '';
                            const showVariantSuffixInSku = Boolean(
                              variantLabel && !(product && productHasColorSizeMatrix(product, lineCategory)),
                            );
                            const pbLineRelatedListText =
                              type === 'PURCHASE_BILL' && safePurchaseBillFormSettings.relatedProductEnabled
                                ? aggregatePurchaseBillRelatedProductListText(grp, productMapPSI)
                                : '';
                            let soBarShipPct = 0;
                            let soBarAllocPct = 0;
                            let soBarRosePct = 0;
                            if (type === 'SALES_ORDER' && orderQty > 0) {
                              const ac = Math.min(allocatedQty, orderQty);
                              const shipCap = Math.min(shippedQty, ac);
                              const allocRemain = Math.max(0, ac - shipCap);
                              if (allocatedQty > orderQty) {
                                soBarShipPct = (Math.min(shippedQty, orderQty) / allocatedQty) * 100;
                                soBarAllocPct = (allocRemain / allocatedQty) * 100;
                                soBarRosePct = ((allocatedQty - orderQty) / allocatedQty) * 100;
                              } else {
                                soBarShipPct = (Math.min(shippedQty, orderQty) / orderQty) * 100;
                                soBarAllocPct = (allocRemain / orderQty) * 100;
                              }
                            }
                          return (
                              <tr key={gid} className="hover:bg-slate-50/30 transition-colors">
                                <td className="py-2.5 pr-3">
                                  <div className="flex items-start gap-2 min-w-0">
                                    {product?.imageUrl ? (
                                      <button
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          setPsiProductImagePreviewUrl(product.imageUrl!);
                                        }}
                                        className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        aria-label="查看产品图片"
                                      >
                                        <img
                                          src={product.imageUrl}
                                          alt={rowProductName || product.name || ''}
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      </button>
                                    ) : (
                                      <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-100">
                                        <Package className="w-4 h-4" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <span className="text-sm font-bold text-slate-700 shrink-0">
                                          {rowProductName || '未知产品'}
                                        </span>
                                        {!!rowProductSku && (
                                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                            {rowProductSku}
                                            {showVariantSuffixInSku && ` · ${variantLabel}`}
                                          </span>
                                        )}
                                      </div>
                                      {productCustomTags.length > 0 && (
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                          {productCustomTags.map(({ field, display }) => (
                                            <span
                                              key={field.id}
                                              className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                            >
                                              {field.label}: {display}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                {type === 'PURCHASE_BILL' && safePurchaseBillFormSettings.relatedProductEnabled && (
                                  <td className="py-2.5 px-3 align-top">
                                    <span
                                      className="text-[11px] font-bold text-slate-600 leading-snug line-clamp-2"
                                      title={pbLineRelatedListText}
                                    >
                                      {pbLineRelatedListText}
                                    </span>
                                  </td>
                                )}
                              {!current.hideWarehouse && (
                                  <td className="py-2.5 px-3 text-center">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-black uppercase border border-slate-100">
                                    {warehouse?.name || '默认库'}
                                  </span>
                                </td>
                              )}
                                {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className={`text-sm font-black ${type === 'PURCHASE_BILL' ? 'text-indigo-600' : 'text-slate-700'}`}>
                                      {type === 'PURCHASE_ORDER' && received > orderQty
                                        ? `${received.toLocaleString()} / ${orderQty.toLocaleString()}`
                                        : orderQty.toLocaleString()}{' '}
                                      {first.productId ? getUnitName(first.productId) : 'PCS'}
                                    </span>
                                  </td>
                                )}
                                {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && showPsiDocAmount(type) && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                              </td>
                                )}
                                {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && showPsiDocAmount(type) && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">
                                      {orderQty.toLocaleString()} {first.productId ? getUnitName(first.productId) : 'PCS'}
                                    </span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && showPsiDocAmount(type) && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && showPsiDocAmount(type) && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_BILL' && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">
                                      {orderQty.toLocaleString()} {first.productId ? getUnitName(first.productId) : 'PCS'}
                                    </span>
                                  </td>
                                )}
                                {type === 'SALES_BILL' && showPsiDocAmount(type) && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_BILL' && showPsiDocAmount(type) && (
                                  <td className="py-2.5 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
                                        {orderQty <= 0 ? null : (
                                          <>
                                            <div className="h-full bg-sky-500 shrink-0 transition-all" title="已发" style={{ width: `${soBarShipPct}%` }} />
                                            <div className="h-full bg-indigo-500 shrink-0 transition-all" title="待发（已配−已发）" style={{ width: `${soBarAllocPct}%` }} />
                                            {soBarRosePct > 0 && (
                                              <div className="h-full bg-rose-500 shrink-0" title="超配" style={{ width: `${soBarRosePct}%` }} />
                                            )}
                                          </>
                                        )}
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-500 leading-snug">
                                        <span className="text-sky-600">已发 {shippedQty}</span>
                                        <span className="text-slate-300 mx-1">/</span>
                                        <span className="text-indigo-600">待发 {allocPendingQty}</span>
                                        {allocatedQty > orderQty && <span className="text-rose-600 ml-1">（超配）</span>}
                                        {orderQty > 0 && shippedQty >= orderQty && (
                                          <span className="text-emerald-600 ml-1">· 已发齐</span>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && hasPsiPerm('psi:sales_order_allocation:allow') && (
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAllocationModal({
                                          docNumber: docNum,
                                          lineGroupId: gid,
                                          product: product ?? {
                                            id: first.productId,
                                            sku: rowProductSku || '',
                                            name: rowProductName || '未知产品',
                                            colorIds: [],
                                            sizeIds: [],
                                            variants: [],
                                            milestoneNodeIds: [],
                                          } as Product,
                                          grp,
                                        });
                                        (() => {
                                          const lineWh = grp[0]?.allocationWarehouseId as string | undefined;
                                          const whIds = new Set(warehouses.map(w => w.id));
                                          const lineOk = lineWh && whIds.has(lineWh) ? lineWh : '';
                                          const prefWh = resolvePreferredSingleWarehouse(
                                            warehouses,
                                            readWarehousePreference(
                                              tenantCtx?.tenantId,
                                              userId,
                                              WAREHOUSE_DOC_KIND.SALES_ORDER_ALLOCATION,
                                            ),
                                            '',
                                          );
                                          setAllocationWarehouseId(
                                            lineOk || prefWh || warehouses[0]?.id || '',
                                          );
                                        })();
                                        const hasVariants = grp.some((i: any) => i.variantId);
                                        if (hasVariants) {
                                          const agg: Record<string, { order: number; allocated: number; shipped: number }> = {};
                                          grp.forEach((i: any) => {
                                            if (!i.variantId) return;
                                            if (!agg[i.variantId]) agg[i.variantId] = { order: 0, allocated: 0, shipped: 0 };
                                            agg[i.variantId].order += Number(i.quantity) || 0;
                                            agg[i.variantId].allocated += Number(i.allocatedQuantity) || 0;
                                            agg[i.variantId].shipped += Number(i.shippedQuantity) || 0;
                                          });
                                          const next: Record<string, number> = {};
                                          Object.keys(agg).forEach(vid => {
                                            const e = agg[vid];
                                            const eff = effectiveAllocatedQuantity(e.allocated, e.shipped);
                                            next[vid] = Math.max(0, e.order - eff);
                                          });
                                          setAllocationQuantities(next);
                                        } else {
                                          const order = grp.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
                                          const allocated = grp.reduce((s: number, i: any) => s + (Number(i.allocatedQuantity) || 0), 0);
                                          const shipped = grp.reduce((s: number, i: any) => s + (Number(i.shippedQuantity) || 0), 0);
                                          const eff = effectiveAllocatedQuantity(allocated, shipped);
                                          setAllocationQuantities(Math.max(0, order - eff));
                                        }
                                      }}
                                      className="px-2.5 py-1 text-[10px] font-black rounded-lg border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1 inline-flex whitespace-nowrap"
                                    >
                                      <PackageCheck className="w-3.5 h-3.5 shrink-0" /> 配货
                                    </button>
                                  </td>
                                )}
                                {type === 'PURCHASE_ORDER' && (
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
                                        {received > orderQty ? (
                                          <>
                                            <div className="h-full bg-emerald-500" style={{ width: `${(orderQty / received) * 100}%` }} />
                                            <div className="h-full bg-rose-500" style={{ width: `${((received - orderQty) / received) * 100}%` }} />
                                          </>
                                        ) : (
                                          <div 
                                            className={`h-full rounded-full transition-all ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${Math.min(100, progress * 100)}%` }}
                                          />
                                        )}
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-400">
                                        {received > orderQty ? `${received} / ${orderQty}（已超收）` : progress >= 1 ? '已完成' : `${received} / ${orderQty}`}
                                      </span>
                                    </div>
                                  </td>
                                )}
                            </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
          {psiTotalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-2">
              <span className="text-xs text-slate-400">共 {filteredGroupedEntries.length} 条单据，第 {psiPage} / {psiTotalPages} 页</span>
              <button type="button" disabled={psiPage <= 1} onClick={() => setPsiPage(p => p - 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">上一页</button>
              <button type="button" disabled={psiPage >= psiTotalPages} onClick={() => setPsiPage(p => p + 1)} className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed">下一页</button>
            </div>
          )}
        </div>
      )}


      {allocationModal && allocationQuantities !== null && (
        <AllocationModal
          allocationModal={allocationModal}
          allocationQuantities={allocationQuantities}
          allocationWarehouseId={allocationWarehouseId}
          onQuantityChange={v => setAllocationQuantities(v)}
          onWarehouseIdChange={v => setAllocationWarehouseId(v)}
          warehouses={warehouses}
          dictionaries={dictionaries}
          recordsList={recordsList}
          onReplaceRecords={onReplaceRecords}
          onCommittedWarehouse={wid => {
            if (wid) {
              writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.SALES_ORDER_ALLOCATION, {
                warehouseId: wid,
              });
            }
          }}
          onClose={() => { setAllocationModal(null); setAllocationQuantities(null); }}
        />
      )}

      {showPOFormConfigModal && onUpdatePurchaseOrderFormSettings && (
        <PsiFormConfigModal
          docType="PURCHASE_ORDER"
          open={showPOFormConfigModal}
          onClose={() => setShowPOFormConfigModal(false)}
          defaultTabWhenOpen={poFormConfigEntryTab}
          settings={purchaseOrderFormSettings ?? DEFAULT_PURCHASE_ORDER_FORM_SETTINGS}
          onSave={onUpdatePurchaseOrderFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={refreshPrintTemplates}
          plans={[]}
          orders={ordersList as ProductionOrder[]}
          products={products}
        />
      )}

      {type === 'PURCHASE_ORDER' && (
        <PsiListPrintController<any>
          ref={poListPrintControllerRef}
          listPrintSlot={safePurchaseOrderFormSettings.listPrint}
          printTemplates={printTemplates}
          resolveDocItems={docNumber =>
            recordsList.filter((r: any) => r.type === 'PURCHASE_ORDER' && r.docNumber === docNumber)
          }
          buildContext={(_t, { docNumber, docItems }) => {
            const ctx = buildPurchaseOrderPrintContextFromPsiDoc({
              docNumber,
              docItems,
              productMap: productMapPSI,
              dictionaries,
            });
            return showPsiDocAmount('PURCHASE_ORDER') ? ctx : maskPrintContextAmounts(ctx);
          }}
          pickerSubtitle={docNumber =>
            `采购订单 ${docNumber.startsWith('UNGROUPED-') ? '独立单据' : docNumber}`
          }
          onAddPrintTemplate={onUpdatePurchaseOrderFormSettings ? () => {
            setPoFormConfigEntryTab('print');
            setShowPOFormConfigModal(true);
          } : undefined}
        />
      )}

      {type === 'PURCHASE_BILL' && (
        <PsiListPrintController<any>
          ref={pbListPrintControllerRef}
          listPrintSlot={safePurchaseBillFormSettings.listPrint}
          printTemplates={printTemplates}
          resolveDocItems={docNumber =>
            recordsList.filter((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === docNumber)
          }
          buildContext={(_t, { docNumber, docItems }) => {
            const ctx = buildPurchaseBillPrintContextFromPsiDoc({
              docNumber,
              docItems,
              productMap: productMapPSI,
              warehouseMap: warehouseMapPSI,
              dictionaries,
            });
            return showPsiDocAmount('PURCHASE_BILL') ? ctx : maskPrintContextAmounts(ctx);
          }}
          pickerSubtitle={docNumber =>
            `采购入库 ${docNumber.startsWith('UNGROUPED-') ? '独立单据' : docNumber}`
          }
          onAddPrintTemplate={onUpdatePurchaseBillFormSettings ? () => {
            setPbFormConfigEntryTab('print');
            setShowPBFormConfigModal(true);
          } : undefined}
        />
      )}

      {type === 'SALES_ORDER' && (
        <PsiListPrintController<any>
          ref={soListPrintControllerRef}
          listPrintSlot={safeSalesOrderFormSettings.listPrint}
          printTemplates={printTemplates}
          resolveDocItems={docNumber =>
            recordsList.filter((r: any) => r.type === 'SALES_ORDER' && r.docNumber === docNumber)
          }
          buildContext={(t, { docNumber, docItems }) => {
            const ctx = buildSalesOrderPrintContextFromPsiDoc({
              docNumber,
              docItems,
              productMap: productMapPSI,
              dictionaries,
              onlyUnshipped: t.documentType === 'salesOrderUnshipped',
            });
            return showPsiDocAmount('SALES_ORDER') ? ctx : maskPrintContextAmounts(ctx);
          }}
          pickerSubtitle={docNumber =>
            `销售订单 ${docNumber.startsWith('UNGROUPED-') ? '独立单据' : docNumber}`
          }
          onAddPrintTemplate={onUpdateSalesOrderFormSettings ? () => {
            setSoFormConfigEntryTab('print');
            setShowSOFormConfigModal(true);
          } : undefined}
        />
      )}

      {(type === 'SALES_BILL' || salesBillRevealOpen) && (
        <PsiListPrintController<any>
          ref={sbListPrintControllerRef}
          listPrintSlot={safeSalesBillFormSettings.listPrint}
          printTemplates={printTemplates}
          resolveDocItems={docNumber => {
            const list =
              salesBillRevealFromPending?.docNumber === docNumber
                ? recordsListForSalesBillRevealMerged
                : recordsList;
            return list.filter((r: any) => r.type === 'SALES_BILL' && r.docNumber === docNumber);
          }}
          /**
           * Phase 3.D follow-up：销售单打印「上次结余」改为 await 后端 `api.finance.partnerReceivable`，
           * 而不是把 context 的 psi/finance/prod 三个全量数组喂给 builder。
           * anchorTime 取本单第一条 line 的最早时间（与原 `flowRecordsEarliestMs` 同义）。
           */
          buildContext={async (_t, { docNumber, docItems }) => {
            const main = (docItems[0] ?? {}) as any;
            const partnerName = String(main.partner ?? '').trim();
            const partnerId = main.partnerId ? String(main.partnerId).trim() : '';
            // 用 line 的最早 createdAt（DB 中销售单同 docNumber 多行 createdAt 同源）作为锚点
            const candidates: number[] = [];
            for (const r of docItems as any[]) {
              const ts = r?.createdAt ? Date.parse(String(r.createdAt)) : NaN;
              if (Number.isFinite(ts)) candidates.push(ts);
            }
            const anchorMs = candidates.length ? Math.min(...candidates) : Date.now();
            const beforeIso = new Date(anchorMs).toISOString();
            let previousBalance = 0;
            if (partnerName || partnerId) {
              try {
                const res = await apiNs.finance.partnerReceivable({
                  partnerName,
                  partnerId: partnerId || undefined,
                  before: beforeIso,
                  excludeSalesBillDocNumber: docNumber,
                });
                previousBalance = res?.previousBalance ?? 0;
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[PSIOpsView] partnerReceivable failed', e);
              }
            }
            const ctx = buildSalesBillPrintContextFromPsiDoc({
              docNumber,
              docItems,
              productMap: productMapPSI,
              warehouseMap: warehouseMapPSI,
              dictionaries,
              preBalance: { previousBalance },
            });
            return showPsiDocAmount('SALES_BILL') ? ctx : maskPrintContextAmounts(ctx);
          }}
          pickerSubtitle={docNumber =>
            `销售单 ${docNumber.startsWith('UNGROUPED-') ? '独立单据' : docNumber}`
          }
          onAddPrintTemplate={onUpdateSalesBillFormSettings ? () => {
            setSbFormConfigEntryTab('print');
            setShowSBFormConfigModal(true);
          } : undefined}
        />
      )}

      {showSOFormConfigModal && onUpdateSalesOrderFormSettings && (
        <PsiFormConfigModal
          docType="SALES_ORDER"
          open={showSOFormConfigModal}
          onClose={() => setShowSOFormConfigModal(false)}
          defaultTabWhenOpen={soFormConfigEntryTab}
          settings={salesOrderFormSettings ?? DEFAULT_SALES_ORDER_FORM_SETTINGS}
          onSave={onUpdateSalesOrderFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={refreshPrintTemplates}
          plans={[]}
          orders={ordersList as ProductionOrder[]}
          products={products}
        />
      )}

      {showPBFormConfigModal && onUpdatePurchaseBillFormSettings && (
        <PsiFormConfigModal
          docType="PURCHASE_BILL"
          open={showPBFormConfigModal}
          onClose={() => setShowPBFormConfigModal(false)}
          defaultTabWhenOpen={pbFormConfigEntryTab}
          settings={purchaseBillFormSettings ?? DEFAULT_PURCHASE_BILL_FORM_SETTINGS}
          onSave={onUpdatePurchaseBillFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={refreshPrintTemplates}
          plans={[]}
          orders={ordersList as ProductionOrder[]}
          products={products}
        />
      )}

      {showSBFormConfigModal && onUpdateSalesBillFormSettings && (
        <PsiFormConfigModal
          docType="SALES_BILL"
          open={showSBFormConfigModal}
          onClose={() => setShowSBFormConfigModal(false)}
          defaultTabWhenOpen={sbFormConfigEntryTab}
          settings={salesBillFormSettings ?? DEFAULT_SALES_BILL_FORM_SETTINGS}
          onSave={onUpdateSalesBillFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={refreshPrintTemplates}
          plans={[]}
          orders={ordersList as ProductionOrder[]}
          products={products}
        />
      )}

      {['PURCHASE_ORDER', 'PURCHASE_BILL', 'SALES_ORDER', 'SALES_BILL'].includes(type) &&
        psiOrderBillFlowOpen && (
        <PsiOrderBillFlowListModal
          recordType={type as PsiRecordType}
          open={psiOrderBillFlowOpen}
          onClose={() => setPsiOrderBillFlowOpen(false)}
          onOpenDetail={handlePsiOrderBillFlowDetail}
          products={products}
          warehouses={warehouses}
          receivedByOrderLine={type === 'PURCHASE_ORDER' ? receivedByOrderLine : undefined}
        />
      )}

      {psiProductImagePreviewUrl && (
        <div
          className="fixed inset-0 z-[100] flex animate-in fade-in items-center justify-center bg-black/80 p-4"
          onClick={() => setPsiProductImagePreviewUrl(null)}
          role="presentation"
        >
          <img
            src={psiProductImagePreviewUrl}
            alt="产品图片"
            className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setPsiProductImagePreviewUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white transition-all hover:bg-white/30"
            aria-label="关闭"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}

    </div>
  );
};

export default React.memo(PSIOpsView);