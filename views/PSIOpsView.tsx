import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Clock, 
  Package, 
  User, 
  ChevronRight,
  FileText,
  Building2,
  CheckCircle2,
  Sliders,
  PackageCheck,
} from 'lucide-react';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries, ProductVariant, PurchaseOrderFormSettings, PurchaseBillFormSettings } from '../types';
import {
  moduleHeaderRowClass,
  outlineAccentToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  secondaryToolbarButtonClass,
} from '../styles/uiDensity';
import WarehousePanel from './psi-ops/WarehousePanel';
import OrderBillFormPage from './psi-ops/OrderBillFormPage';
import PendingShipmentListModal, { PendingShipmentGroup } from './psi-ops/PendingShipmentListModal';
import PendingShipDetailModal from './psi-ops/PendingShipDetailModal';
import AllocationModal from './psi-ops/AllocationModal';
import FormConfigModal from './psi-ops/FormConfigModal';
import { flowRecordsEarliestMs, formatPsiDocListTime, recordDocLineTimeMs } from '../utils/flowDocSort';
import { nextSalesBillDocNumber } from '../utils/partnerDocNumber';
import { effectiveAllocatedQuantity } from '../utils/psiAllocationDisplay';

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
  purchaseBillFormSettings?: PurchaseBillFormSettings;
  onUpdatePurchaseBillFormSettings?: (settings: PurchaseBillFormSettings) => void;
  onAddRecord: (record: any) => void;
  onAddRecordBatch?: (records: any[]) => Promise<void>;
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  /** 当进入订单/单据详情页时通知父组件，用于隐藏顶部标签 */
  onDetailViewChange?: (isDetail: boolean) => void;
  /** 生产操作记录（入仓流水合并生产入库 STOCK_IN 用） */
  prodRecords?: any[];
  /** 工单列表（生产入库行显示工单号用） */
  orders?: { id: string; orderNumber?: string }[];
  userPermissions?: string[];
  tenantRole?: string;
}

const PSIOpsView: React.FC<PSIOpsViewProps> = ({ type, products, warehouses, categories, partners, partnerCategories, dictionaries, records, purchaseOrderFormSettings = { standardFields: [], customFields: [] }, onUpdatePurchaseOrderFormSettings, purchaseBillFormSettings = { standardFields: [], customFields: [] }, onUpdatePurchaseBillFormSettings, onAddRecord, onAddRecordBatch, onReplaceRecords, onDeleteRecords, onDetailViewChange, prodRecords = [], orders = [], userPermissions, tenantRole }) => {
  const _isOwner = tenantRole === 'owner';
  const hasPsiPerm = (perm: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('psi') && !userPermissions.some(p => p.startsWith('psi:'))) return true;
    if (userPermissions.includes(perm)) return true;
    if (userPermissions.some(p => p.startsWith(`${perm}:`))) return true;
    return false;
  };
  const ordersList = orders ?? [];
  const recordsList = records ?? [];
  const safePurchaseOrderFormSettings = { standardFields: purchaseOrderFormSettings?.standardFields ?? [], customFields: purchaseOrderFormSettings?.customFields ?? [] };
  const safePurchaseBillFormSettings = { standardFields: purchaseBillFormSettings?.standardFields ?? [], customFields: purchaseBillFormSettings?.customFields ?? [] };
  const productMapPSI = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const warehouseMapPSI = useMemo(() => new Map(warehouses.map(w => [w.id, w])), [warehouses]);
  const categoryMapPSI = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const getUnitName = (productId: string) => {
    const p = productMapPSI.get(productId);
    const u = (dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };
  /** 数量列展示：转为数字去掉前导零，如 "035" 千克 -> 35 千克 */
  const formatQtyDisplay = (q: number | string | undefined | null): number => {
    if (q == null || q === '') return 0;
    const n = Number(q);
    return Number.isFinite(n) ? n : 0;
  };

  // 仓库管理子视图状态已迁移至 WarehousePanel

  const [showModal, setShowModal] = useState<string | null>(null); 
  // 当前是否处于采购订单编辑模式（存原始单号）
  const [editingPODocNumber, setEditingPODocNumber] = useState<string | null>(null);
  const [showPOFormConfigModal, setShowPOFormConfigModal] = useState(false);
  const [showPBFormConfigModal, setShowPBFormConfigModal] = useState(false);
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

  // 切换标签时清除新增/编辑状态，避免出现不匹配的弹窗
  useEffect(() => {
    setShowModal(null);
    setEditingPODocNumber(null);
    setEditingPBDocNumber(null);
    setEditingSODocNumber(null);
    setEditingSBDocNumber(null);
    setShowPendingShipmentModal(false);
  }, [type]);

  // 订单/单据详情页时通知父组件隐藏顶部标签
  const isDetailView = (type === 'PURCHASE_ORDER' && showModal === 'PURCHASE_ORDER') || (type === 'PURCHASE_BILL' && showModal === 'PURCHASE_BILL') || (type === 'SALES_ORDER' && showModal === 'SALES_ORDER') || (type === 'SALES_BILL' && showModal === 'SALES_BILL');
  useEffect(() => {
    onDetailViewChange?.(isDetailView);
  }, [isDetailView, onDetailViewChange]);


  const bizConfig: Record<string, any> = {
    'PURCHASE_ORDER': { label: '采购订单', color: 'bg-indigo-600', partnerLabel: '供应商', prefix: 'PO', hideWarehouse: true },
    'PURCHASE_BILL': { label: '采购单', color: 'bg-indigo-600', partnerLabel: '供应商', prefix: 'PB' },
    'SALES_ORDER': { label: '销售订单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'SO', hideWarehouse: true },
    'SALES_BILL': { label: '销售单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'XS' },
    'WAREHOUSE_MGMT': { label: '仓库管理', color: 'bg-indigo-600', sub: '全方位的仓库业务控制中心' },
  };

  const current = bizConfig[type];

  /** 销售订单下：待发货清单是否以弹窗形式打开 */
  const [showPendingShipmentModal, setShowPendingShipmentModal] = useState(false);
  /** 待发货清单 - 详情弹窗：当前选中的分组 */
  const [pendingShipDetailGroup, setPendingShipDetailGroup] = useState<PendingShipmentGroup | null>(null);

  /** 与 flowDocSort.recordDocLineTimeMs 一致，用于库存流水等排序 */
  const parseRecordTime = useCallback((r: any): number => recordDocLineTimeMs(r), []);

  // ── 库存预聚合索引：一次遍历 recordsList + prodRecords，后续 O(1) 查询 ──
  type WhBucket = { psiIn: number; psiOut: number; transferIn: number; transferOut: number; prodIn: number; prodOut: number; stocktakeAdj: number; stocktakeByDoc: Map<string, number> };
  type TimedQty = { time: number; qty: number };
  type VarBucket = { psiIn: number; psiOut: number; transferIn: number; transferOut: number; prodIn: number; prodOut: number; stocktakeRecords: { time: number; qty: number; sysQty: number; id: string }[]; psiInRecords: TimedQty[]; psiOutRecords: TimedQty[]; prodInRecords: TimedQty[]; prodOutRecords: TimedQty[] };

  const stockIndex = useMemo(() => {
    const whMap = new Map<string, WhBucket>();
    const varMap = new Map<string, VarBucket>();

    const getWh = (pId: string, whId: string): WhBucket => {
      const k = `${pId}::${whId}`;
      let b = whMap.get(k);
      if (!b) { b = { psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeAdj: 0, stocktakeByDoc: new Map() }; whMap.set(k, b); }
      return b;
    };
    const getVar = (pId: string, whId: string, vId: string): VarBucket => {
      const k = `${pId}::${whId}::${vId}`;
      let b = varMap.get(k);
      if (!b) { b = { psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeRecords: [], psiInRecords: [], psiOutRecords: [], prodInRecords: [], prodOutRecords: [] }; varMap.set(k, b); }
      return b;
    };
    const pTime = (r: any): number => recordDocLineTimeMs(r);

    for (const r of recordsList) {
      const pId = r.productId;
      if (!pId) continue;
      const wh = r.warehouseId || '';
      const vId = (r as any).variantId || '';
      const qty = Number(r.quantity) || 0;
      const time = pTime(r);

      if (r.type === 'PURCHASE_BILL') {
        if (wh) { const wb = getWh(pId, wh); wb.psiIn += qty; if (vId) { const vb = getVar(pId, wh, vId); vb.psiIn += qty; vb.psiInRecords.push({ time, qty }); } }
      } else if (r.type === 'SALES_BILL') {
        if (wh) { const wb = getWh(pId, wh); wb.psiOut += qty; if (vId) { const vb = getVar(pId, wh, vId); vb.psiOut += qty; vb.psiOutRecords.push({ time, qty }); } }
      } else if (r.type === 'TRANSFER') {
        const toWh = (r as any).toWarehouseId as string | undefined;
        const fromWh = (r as any).fromWarehouseId as string | undefined;
        if (toWh) { const wb = getWh(pId, toWh); wb.transferIn += qty; if (vId) { const vb = getVar(pId, toWh, vId); vb.transferIn += qty; vb.psiInRecords.push({ time, qty }); } }
        if (fromWh) { const wb = getWh(pId, fromWh); wb.transferOut += qty; if (vId) { const vb = getVar(pId, fromWh, vId); vb.transferOut += qty; vb.psiOutRecords.push({ time, qty }); } }
      } else if (r.type === 'STOCKTAKE') {
        if (wh) {
          const wb = getWh(pId, wh);
          const diff = Number(r.diffQuantity) || 0;
          wb.stocktakeAdj += diff;
          const doc = r.docNumber || '';
          wb.stocktakeByDoc.set(doc, (wb.stocktakeByDoc.get(doc) || 0) + diff);
          if (vId && typeof (r as any).systemQuantity === 'number') {
            getVar(pId, wh, vId).stocktakeRecords.push({ time, qty, sysQty: (r as any).systemQuantity, id: r.id });
          }
        }
      }
    }

    for (const r of (prodRecords || []) as any[]) {
      const pId = r.productId;
      if (!pId) continue;
      const wh = r.warehouseId || '';
      const vId = r.variantId || '';
      const qty = Number(r.quantity) || 0;
      const time = pTime(r);

      if (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') {
        if (wh) { getWh(pId, wh).prodIn += qty; const vb = getVar(pId, wh, vId); vb.prodIn += qty; vb.prodInRecords.push({ time, qty }); }
      } else if (r.type === 'STOCK_OUT') {
        if (wh) { getWh(pId, wh).prodOut += qty; const vb = getVar(pId, wh, vId); vb.prodOut += qty; vb.prodOutRecords.push({ time, qty }); }
      }
    }

    return { whMap, varMap };
  }, [recordsList, prodRecords]);

  // ── 库存查询函数（O(1) 查表） ──
  const getStock = useCallback((pId: string, whId?: string, excludeDocNumber?: string) => {
    if (!whId) return 0;
    const b = stockIndex.whMap.get(`${pId}::${whId}`);
    if (!b) return 0;
    const ins = b.psiIn + b.transferIn + b.prodIn;
    const outs = b.psiOut + b.transferOut + b.prodOut;
    const adj = b.stocktakeAdj - (excludeDocNumber ? (b.stocktakeByDoc.get(excludeDocNumber) || 0) : 0);
    return ins - outs + adj;
  }, [stockIndex]);

  const getStockVariant = useCallback((pId: string, whId: string | undefined, variantId: string) => {
    if (!whId) return 0;
    const vb = stockIndex.varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb) return 0;
    return (vb.psiIn + vb.transferIn + vb.prodIn) - (vb.psiOut + vb.transferOut + vb.prodOut);
  }, [stockIndex]);

  const getNullVariantProdStock = useCallback((pId: string, whId?: string) => {
    if (!whId) return 0;
    const vb = stockIndex.varMap.get(`${pId}::${whId}::`);
    if (!vb) return 0;
    return Math.max(0, vb.prodIn - vb.prodOut);
  }, [stockIndex]);

  const getStocktakeAdjust = useCallback((pId: string, whId: string) => {
    const b = stockIndex.whMap.get(`${pId}::${whId}`);
    return b ? b.stocktakeAdj : 0;
  }, [stockIndex]);

  const getVariantDisplayQty = useCallback((pId: string, whId: string, variantId: string) => {
    const vb = stockIndex.varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb || vb.stocktakeRecords.length === 0) return getStockVariant(pId, whId, variantId);
    const latest = vb.stocktakeRecords.reduce((best, r) => r.time > best.time ? r : best);
    const latestTime = latest.time;
    const insAfter =
      vb.psiInRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0) +
      vb.prodInRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0);
    const outsAfter =
      vb.psiOutRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0) +
      vb.prodOutRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0);
    const adjustAfter = vb.stocktakeRecords.filter(r => r.id !== latest.id && r.time >= latestTime)
      .reduce((s, r) => s + (r.qty - r.sysQty), 0);
    return latest.qty + insAfter - outsAfter + adjustAfter;
  }, [stockIndex, getStockVariant]);
  const generateSBDocNumberForPartner = (partnerId: string, partnerName: string): string =>
    nextSalesBillDocNumber(partners, recordsList, partnerId, partnerName);
  const allPOByGroups = useMemo(() => {
    const filtered = recordsList.filter(r => r.type === 'PURCHASE_ORDER');
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  // 按 (sourceOrderNumber, sourceLineId) 汇总采购单已入库数量
  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    recordsList.filter(r => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId).forEach(r => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
    });
    return map;
  }, [recordsList]);



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

  const groupedRecords = useMemo(() => {
    const filtered = recordsList.filter(r => r.type === type);
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber || 'UNGROUPED-' + r.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList, type]);

  /** 单据列表：按组内制单时间（最早一行）倒序，无有效时间殿后，再按单号 */
  const sortedGroupedEntries = useMemo(() => {
    const entries = Object.entries(groupedRecords);
    return entries.sort(([docA, recsA], [docB, recsB]) => {
      const ma = flowRecordsEarliestMs(recsA as { timestamp?: string; createdAt?: string; _savedAtMs?: number }[]);
      const mb = flowRecordsEarliestMs(recsB as { timestamp?: string; createdAt?: string; _savedAtMs?: number }[]);
      const ha = ma > 0;
      const hb = mb > 0;
      if (ha !== hb) return ha ? -1 : 1;
      if (ha && hb && mb !== ma) return mb - ma;
      return (docB || '').localeCompare(docA || '');
    });
  }, [groupedRecords]);

  const PSI_PAGE_SIZE = 20;
  const [psiPage, setPsiPage] = useState(1);
  useEffect(() => { setPsiPage(1); }, [type]);
  const psiTotalPages = Math.max(1, Math.ceil(sortedGroupedEntries.length / PSI_PAGE_SIZE));
  const pagedGroupedEntries = useMemo(
    () => sortedGroupedEntries.slice((psiPage - 1) * PSI_PAGE_SIZE, psiPage * PSI_PAGE_SIZE),
    [sortedGroupedEntries, psiPage],
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


  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>{current.label}</h1>
          <p className={pageSubtitleClass}>{current.sub || '管理业务单据与记录'}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {type === 'PURCHASE_ORDER' && onUpdatePurchaseOrderFormSettings && (
            <button type="button" onClick={() => setShowPOFormConfigModal(true)} className={secondaryToolbarButtonClass}>
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'PURCHASE_BILL' && onUpdatePurchaseBillFormSettings && (
            <button type="button" onClick={() => setShowPBFormConfigModal(true)} className={secondaryToolbarButtonClass}>
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'SALES_ORDER' && !showModal && hasPsiPerm('psi:sales_order_pending_shipment:allow') && (
            <button
              type="button"
              onClick={() => setShowPendingShipmentModal(true)}
              className={outlineAccentToolbarButtonClass}
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
              onClick={() => { setEditingPODocNumber(null); setEditingSODocNumber(null); setEditingSBDocNumber(null); setShowModal(type); }}
              className={`${primaryToolbarButtonClass} ${current.color}`}
            >
            <Plus className="w-4 h-4 shrink-0" /> 登记新{current.label}
          </button>
        )}
        </div>
      </div>

      {type === 'SALES_ORDER' && showPendingShipmentModal && (
        <PendingShipmentListModal
          pendingShipmentGroups={pendingShipmentGroups}
          partners={partners}
          recordsList={recordsList}
          onClose={() => setShowPendingShipmentModal(false)}
          onOpenDetail={group => setPendingShipDetailGroup(group)}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onReplaceRecords={onReplaceRecords}
          generateSBDocNumberForPartner={generateSBDocNumberForPartner}
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

      {showModal && ['PURCHASE_ORDER', 'PURCHASE_BILL', 'SALES_ORDER', 'SALES_BILL'].includes(showModal) && showModal === type ? (
        <OrderBillFormPage
          formType={type as 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL'}
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
          onBack={() => { setShowModal(null); setEditingPODocNumber(null); setEditingPBDocNumber(null); setEditingSODocNumber(null); setEditingSBDocNumber(null); }}
          onSave={onAddRecord}
          onSaveBatch={onAddRecordBatch}
          onReplaceRecords={onReplaceRecords}
          onDeleteRecords={onDeleteRecords}
          editingDocNumber={type === 'PURCHASE_ORDER' ? editingPODocNumber : type === 'PURCHASE_BILL' ? editingPBDocNumber : type === 'SALES_ORDER' ? editingSODocNumber : editingSBDocNumber}
          purchaseOrderFormSettings={safePurchaseOrderFormSettings}
          purchaseBillFormSettings={safePurchaseBillFormSettings}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          partnerLabel={current.partnerLabel || '供应商'}
        />
      ) : type === 'WAREHOUSE_MGMT' ? (
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
        <div className="space-y-4">
          {pagedGroupedEntries.length === 0 && sortedGroupedEntries.length === 0 ? (
            <div className="bg-white rounded-[32px] border-2 border-dashed border-slate-200 py-24 text-center">
              <FileText className="w-16 h-16 text-slate-100 mx-auto mb-4" />
              <p className="text-slate-400 font-medium italic">暂无{current.label}流水记录</p>
            </div>
          ) : (
            pagedGroupedEntries.map(([docNum, docItems]) => {
              const mainInfo = docItems[0];
              const totalQty = docItems.reduce((s, i) => s + (i.quantity ?? 0), 0);
              const totalAmount = (type === 'SALES_ORDER' || type === 'SALES_BILL')
                ? docItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.salesPrice ?? 0), 0)
                : docItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.purchasePrice ?? 0), 0);
              const isConverted = type === 'PURCHASE_ORDER' && docItems.every((item: any) => (item.quantity ?? 0) <= (receivedByOrderLine[`${docNum}::${item.id}`] ?? 0));
              const openSalesOrderDetail = () => { setEditingSODocNumber(docNum); setShowModal('SALES_ORDER'); };
              const openSalesBillDetail = () => { setEditingSBDocNumber(docNum); setShowModal('SALES_BILL'); };
              const openPurchaseOrderDetail = () => { setEditingPODocNumber(docNum); setShowModal('PURCHASE_ORDER'); };
              const openPurchaseBillDetail = () => { setEditingPBDocNumber(docNum); setShowModal('PURCHASE_BILL'); };

              return (
                <div key={docNum} className="bg-white border border-slate-200 rounded-[32px] shadow-sm hover:shadow-lg transition-all overflow-hidden group">
                  <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:border-indigo-100 transition-all ${isConverted ? 'text-emerald-500' : 'text-slate-400 group-hover:text-indigo-600'}`}>
                        {isConverted ? <CheckCircle2 className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-black text-slate-800">{mainInfo.partner || '未指定单位'}</h3>
                          <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${isConverted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                             {docNum.startsWith('UNGROUPED-') ? '独立单据' : docNum}
                          </span>
                          {type === 'SALES_BILL' && totalQty < 0 && <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shadow-sm">销售退货</span>}
                          {isConverted && <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter bg-white px-2 py-0.5 rounded-full border border-emerald-50 shadow-sm">已入库完成</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-[10px] font-bold text-slate-400 uppercase flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatPsiDocListTime(docItems as any[])}</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> 经办: {mainInfo.operator}</span>
                          {type === 'PURCHASE_ORDER' && safePurchaseOrderFormSettings.standardFields.find(f => f.id === 'note')?.showInList && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'PURCHASE_ORDER' && safePurchaseOrderFormSettings.customFields.filter(f => f.showInList).map(cf => (mainInfo.customData?.[cf.id] != null && mainInfo.customData?.[cf.id] !== '') && (
                            <span key={cf.id} className="flex items-center gap-1 text-slate-500">{cf.label}: {String(mainInfo.customData[cf.id])}</span>
                          ))}
                          {type === 'PURCHASE_BILL' && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'PURCHASE_BILL' && safePurchaseBillFormSettings.customFields.filter(f => f.showInList).map(cf => (mainInfo.customData?.[cf.id] != null && mainInfo.customData?.[cf.id] !== '') && (
                            <span key={cf.id} className="flex items-center gap-1 text-slate-500">{cf.label}: {String(mainInfo.customData[cf.id])}</span>
                          ))}
                          {type === 'SALES_ORDER' && mainInfo.dueDate && (
                            <span className="flex items-center gap-1 text-rose-500 font-bold">交期: {mainInfo.dueDate}</span>
                          )}
                          {type === 'SALES_ORDER' && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                          {type === 'SALES_BILL' && mainInfo.note && (
                            <span className="flex items-center gap-1 text-slate-500" title={mainInfo.note}>备注: {mainInfo.note.length > 30 ? mainInfo.note.slice(0, 30) + '…' : mainInfo.note}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right mr-2">
                        <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据总量</p>
                        <p className={`text-lg font-black ${type === 'SALES_BILL' && totalQty < 0 ? 'text-amber-600' : 'text-slate-900'}`}>{totalQty.toLocaleString()} <span className="text-xs font-medium text-slate-400">PCS</span></p>
                      </div>
                      {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL' || type === 'SALES_ORDER' || type === 'SALES_BILL') && (
                        <div className="text-right mr-2">
                          <p className="text-[9px] text-slate-300 font-black uppercase tracking-tighter">单据金额</p>
                          <p className={`text-lg font-black ${type === 'SALES_BILL' && totalAmount < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>¥{totalAmount.toFixed(2)}</p>
                        </div>
                      )}
                      {type === 'PURCHASE_ORDER' && hasPsiPerm('psi:purchase_order:view') && (
                        <button
                          type="button"
                          onClick={openPurchaseOrderDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      {type === 'PURCHASE_BILL' && hasPsiPerm('psi:purchase_bill:view') && (
                        <button
                          type="button"
                          onClick={openPurchaseBillDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      {type === 'SALES_ORDER' && hasPsiPerm('psi:sales_order:view') && (
                        <button
                          type="button"
                          onClick={openSalesOrderDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      {type === 'SALES_BILL' && hasPsiPerm('psi:sales_bill:view') && (
                        <button
                          type="button"
                          onClick={openSalesBillDetail}
                          className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      )}
                      <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>

                  <div className="px-8 py-4 overflow-x-auto">
                    <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: 'auto' }} />
                        {!current.hideWarehouse && <col style={{ width: 100 }} />}
                        {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <col style={{ width: 100 }} />}
                        {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <col style={{ width: 110 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 132 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 82 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 92 }} />}
                        {type === 'SALES_BILL' && <col style={{ width: 82 }} />}
                        {type === 'SALES_BILL' && <col style={{ width: 92 }} />}
                        {type !== 'SALES_ORDER' && <col style={{ width: type === 'SALES_BILL' ? 132 : 100 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 140 }} />}
                        {type === 'SALES_ORDER' && <col style={{ width: 82 }} />}
                        {type === 'PURCHASE_ORDER' && <col style={{ width: 140 }} />}
                      </colgroup>
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                          <th className="pb-3 pr-6 text-left">产品信息 / SKU</th>
                          {!current.hideWarehouse && <th className="pb-3 px-3 text-center">{type === 'SALES_BILL' ? '出库仓库' : '入库仓库'}</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <th className="pb-3 px-3 text-right">采购价</th>}
                          {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && <th className="pb-3 px-3 text-right">金额</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-right">数量</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-right">销售价</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-right">金额</th>}
                          {type === 'SALES_BILL' && <th className="pb-3 px-3 text-right">销售价</th>}
                          {type === 'SALES_BILL' && <th className="pb-3 px-3 text-right">金额</th>}
                          {type !== 'SALES_ORDER' && <th className="pb-3 px-3 text-right">数量</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-left">配货进度</th>}
                          {type === 'SALES_ORDER' && <th className="pb-3 px-3 text-center">操作</th>}
                          {type === 'PURCHASE_ORDER' && <th className="pb-3 px-3 text-left">入库进度</th>}
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
                            const rowProductName = product?.name || (first as any)?.productName;
                            const rowProductSku = product?.sku || (first as any)?.productSku;
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
                                <td className="py-4 pr-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300"><Package className="w-4 h-4" /></div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-700">{rowProductName || '未知产品'}</p>
                                      <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">
                                        {rowProductSku}
                                        {variantLabel && type !== 'SALES_ORDER' && type !== 'SALES_BILL' && ` · ${variantLabel}`}
                                      </p>
                                  </div>
                                </div>
                              </td>
                              {!current.hideWarehouse && (
                                  <td className="py-4 px-3 text-center">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-black uppercase border border-slate-100">
                                    {warehouse?.name || '默认库'}
                                  </span>
                                </td>
                              )}
                                {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                              </td>
                                )}
                                {(type === 'PURCHASE_ORDER' || type === 'PURCHASE_BILL') && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">
                                      {orderQty.toLocaleString()} {first.productId ? getUnitName(first.productId) : 'PCS'}
                                    </span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_BILL' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-bold text-slate-600">¥{avgPrice.toFixed(2)}</span>
                                  </td>
                                )}
                                {type === 'SALES_BILL' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className="text-sm font-black text-indigo-600">¥{rowAmount.toFixed(2)}</span>
                                  </td>
                                )}
                                {type !== 'SALES_ORDER' && (
                                  <td className="py-4 px-3 text-right">
                                    <span className={`text-sm font-black ${type.includes('BILL') ? 'text-indigo-600' : 'text-slate-700'}`}>
                                      {type === 'PURCHASE_ORDER' && received > orderQty
                                        ? `${received.toLocaleString()} / ${orderQty.toLocaleString()}`
                                        : orderQty.toLocaleString()}{' '}
                                      {first.productId ? getUnitName(first.productId) : 'PCS'}
                                    </span>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && (
                                  <td className="py-4 px-3">
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
                                  <td className="py-4 px-3 text-center">
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
                                        setAllocationWarehouseId(grp[0]?.allocationWarehouseId ?? warehouses[0]?.id ?? '');
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
                                      className="px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1 inline-flex whitespace-nowrap"
                                    >
                                      <PackageCheck className="w-3.5 h-3.5 shrink-0" /> 配货
                                    </button>
                                  </td>
                                )}
                                {type === 'PURCHASE_ORDER' && (
                                  <td className="py-4 px-3">
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
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="text-xs text-slate-400">共 {sortedGroupedEntries.length} 条单据，第 {psiPage} / {psiTotalPages} 页</span>
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
          onClose={() => { setAllocationModal(null); setAllocationQuantities(null); }}
        />
      )}

      {showPOFormConfigModal && onUpdatePurchaseOrderFormSettings && (
        <FormConfigModal
          title="采购订单表单配置"
          subtitle="配置在列表、新增、详情页中显示的字段，可增加自定义项"
          hiddenStandardFieldIds={['docNumber', 'partner', 'createdAt']}
          initialSettings={purchaseOrderFormSettings}
          onSave={onUpdatePurchaseOrderFormSettings}
          onClose={() => setShowPOFormConfigModal(false)}
        />
      )}

      {showPBFormConfigModal && onUpdatePurchaseBillFormSettings && (
        <FormConfigModal
          title="采购单表单配置"
          subtitle="配置在列表、新增、详情页中显示的字段，可增加自定义项"
          hiddenStandardFieldIds={['docNumber', 'partner', 'warehouse', 'createdAt']}
          initialSettings={purchaseBillFormSettings}
          onSave={onUpdatePurchaseBillFormSettings}
          onClose={() => setShowPBFormConfigModal(false)}
        />
      )}

    </div>
  );
};

export default React.memo(PSIOpsView);