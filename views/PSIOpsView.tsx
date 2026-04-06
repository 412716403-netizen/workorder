import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import { 
  Plus, 
  X, 
  Clock, 
  Package, 
  User, 
  Hash,
  AlertCircle,
  ArrowRight,
  Boxes,
  Warehouse as WarehouseIcon,
  ChevronRight,
  ChevronDown,
  Tag,
  LayoutGrid,
  List,
  MoveRight,
  TrendingDown,
  TrendingUp,
  ArrowRightCircle,
  Search,
  Filter,
  Layers,
  FileText,
  Building2,
  CheckCircle2,
  ShoppingCart,
  CheckSquare,
  Square,
  ClipboardList,
  ArrowDownToLine,
  ListFilter,
  ArrowLeft,
  Save,
  Trash2,
  Sliders,
  PackageCheck,
  Pencil,
  Check,
  ScrollText
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchableProductSelect } from '../components/SearchableProductSelect';
import { SearchablePartnerSelect } from '../components/SearchablePartnerSelect';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries, ProductVariant, PurchaseOrderFormSettings, PurchaseBillFormSettings } from '../types';
import { sortedVariantColorEntries, sortedColorEntries } from '../utils/sortVariantsByProduct';
import {
  moduleHeaderRowClass,
  outlineAccentToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  secondaryToolbarButtonClass,
  sectionTitleClass,
} from '../styles/uiDensity';
import { useConfirm } from '../contexts/ConfirmContext';
import WarehousePanel from './psi-ops/WarehousePanel';
import OrderBillFormPage from './psi-ops/OrderBillFormPage';

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
  const confirm = useConfirm();
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
  const [poFormConfigDraft, setPOFormConfigDraft] = useState<PurchaseOrderFormSettings | null>(null);
  const [showPBFormConfigModal, setShowPBFormConfigModal] = useState(false);
  const [pbFormConfigDraft, setPBFormConfigDraft] = useState<PurchaseBillFormSettings | null>(null);
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
    'SALES_BILL': { label: '销售单', color: 'bg-indigo-600', partnerLabel: '客户', prefix: 'SB' },
    'WAREHOUSE_MGMT': { label: '仓库管理', color: 'bg-indigo-600', sub: '全方位的仓库业务控制中心' },
  };

  const current = bizConfig[type];

  // 待发货清单：搜索与勾选
  const [pendingShipSearchDoc, setPendingShipSearchDoc] = useState('');
  const [pendingShipSearchProduct, setPendingShipSearchProduct] = useState('');
  const [pendingShipSearchPartner, setPendingShipSearchPartner] = useState('');
  const [pendingShipSearchWarehouse, setPendingShipSearchWarehouse] = useState('');
  const [pendingShipSelectedIds, setPendingShipSelectedIds] = useState<Set<string>>(new Set());
  /** 销售订单下：待发货清单是否以弹窗形式打开 */
  const [showPendingShipmentModal, setShowPendingShipmentModal] = useState(false);
  /** 待发货清单 - 详情弹窗：当前选中的分组（按 lineGroupId 一组，有颜色尺码时一行显示总数） */
  const [pendingShipDetailGroup, setPendingShipDetailGroup] = useState<{
    groupKey: string;
    docNumber: string;
    productId: string;
    productName: string;
    productSku: string;
    partner: string;
    warehouseId: string;
    warehouseName: string;
    totalQuantity: number;
    records: any[];
  } | null>(null);
  /** 待发货详情 - 编辑态：各行的已配数量（variantId -> qty 或 单行 quantity） */
  const [pendingShipDetailEdit, setPendingShipDetailEdit] = useState<Record<string, number> | number | null>(null);
  /** 待发货详情 - 编辑态：配货仓库（出库仓库） */
  const [pendingShipDetailEditWarehouseId, setPendingShipDetailEditWarehouseId] = useState<string | null>(null);

  // 解析记录时间戳（用于排序和比较）：优先 _savedAtMs（可靠毫秒戳），其次尝试解析 createdAt（ISO 日期）
  const parseRecordTime = useCallback((r: any): number => {
    if (typeof r._savedAtMs === 'number') return r._savedAtMs;
    for (const key of ['timestamp', 'createdAt']) {
      const t = r[key];
      if (t) { const d = new Date(t); if (!isNaN(d.getTime())) return d.getTime(); }
    }
    return 0;
  }, []);

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
    const pTime = (r: any): number => {
      if (typeof r._savedAtMs === 'number') return r._savedAtMs;
      for (const key of ['timestamp', 'createdAt']) { const t = r[key]; if (t) { const d = new Date(t); if (!isNaN(d.getTime())) return d.getTime(); } }
      return 0;
    };

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
  const generateSBDocNumberForPartner = (partnerId: string, partnerName: string): string => {
    const partnerCode = (partnerId || partners.find(p => p.name === partnerName)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'SALES_BILL' && (r.partnerId === partnerId || r.partner === partnerName)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`SB-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `SB-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };
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
    if (type !== 'SALES_ORDER') return [];
    const list = recordsList.filter((r: any) => {
      if (r.type !== 'SALES_ORDER') return false;
      const allocated = r.allocatedQuantity ?? 0;
      const shipped = r.shippedQuantity ?? 0;
      return allocated - shipped > 0;
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
      const totalQuantity = g.records.reduce((s, r) => s + ((r.allocatedQuantity ?? 0) - (r.shippedQuantity ?? 0)), 0);
      return {
        groupKey,
        docNumber: g.docNumber,
        productId: g.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        partner: first.partner ?? '—',
        warehouseId: first.allocationWarehouseId || first.warehouseId || '',
        warehouseName: warehouse?.name ?? '—',
        totalQuantity,
        records: g.records,
      };
    });
  }, [recordsList, type, products, warehouses]);

  const filteredPendingShipmentGroups = useMemo(() => {
    if (type !== 'SALES_ORDER') return [];
    const doc = pendingShipSearchDoc.trim().toLowerCase();
    const prod = pendingShipSearchProduct.trim().toLowerCase();
    const part = pendingShipSearchPartner.trim().toLowerCase();
    const wh = pendingShipSearchWarehouse.trim().toLowerCase();
    return pendingShipmentGroups.filter(row => {
      if (doc && !row.docNumber.toLowerCase().includes(doc)) return false;
      if (prod && !row.productName.toLowerCase().includes(prod) && !row.productSku.toLowerCase().includes(prod)) return false;
      if (part && !row.partner.toLowerCase().includes(part)) return false;
      if (wh && !row.warehouseName.toLowerCase().includes(wh)) return false;
      return true;
    });
  }, [type, pendingShipmentGroups, pendingShipSearchDoc, pendingShipSearchProduct, pendingShipSearchPartner, pendingShipSearchWarehouse]);

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

  /** 单据列表排序：按单据号倒序（003、002、001），新单在上，001 不会因时间戳排到第一条 */
  const sortedGroupedEntries = useMemo(() => {
    const entries = Object.entries(groupedRecords);
    return entries.sort(([docNumA], [docNumB]) => (docNumB || '').localeCompare(docNumA || ''));
  }, [groupedRecords]);

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
            <button type="button" onClick={() => { setPOFormConfigDraft(JSON.parse(JSON.stringify(purchaseOrderFormSettings))); setShowPOFormConfigModal(true); }} className={secondaryToolbarButtonClass}>
              <Sliders className="w-4 h-4 shrink-0" /> 表单配置
            </button>
          )}
          {type === 'PURCHASE_BILL' && onUpdatePurchaseBillFormSettings && (
            <button type="button" onClick={() => { setPBFormConfigDraft(JSON.parse(JSON.stringify(purchaseBillFormSettings))); setShowPBFormConfigModal(true); }} className={secondaryToolbarButtonClass}>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPendingShipmentModal(false)} aria-hidden />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><PackageCheck className="w-5 h-5 text-indigo-600" /> 待发货清单</h3>
              <button type="button" onClick={() => setShowPendingShipmentModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">订单单号</label>
                  <input type="text" value={pendingShipSearchDoc} onChange={e => setPendingShipSearchDoc(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">商品名称</label>
                  <input type="text" value={pendingShipSearchProduct} onChange={e => setPendingShipSearchProduct(e.target.value)} placeholder="产品名/SKU 模糊" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">客户</label>
                  <input type="text" value={pendingShipSearchPartner} onChange={e => setPendingShipSearchPartner(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
                  <input type="text" value={pendingShipSearchWarehouse} onChange={e => setPendingShipSearchWarehouse(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <span className="text-xs text-slate-400">已配货未出库的销售订单明细；勾选后点击「发货」生成销售单（仅可同时勾选同一客户、同一仓库的明细一起发货）。</span>
                <span className="text-xs text-slate-400">共 {filteredPendingShipmentGroups.length} 项</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {filteredPendingShipmentGroups.length === 0 ? (
                <p className="text-slate-500 text-center py-12">{pendingShipmentGroups.length === 0 ? '暂无待发货项，请先在销售订单中完成配货。' : '无匹配项，请调整搜索条件。'}</p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="w-12 px-4 py-3" />
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">订单单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">商品名称</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">客户</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPendingShipmentGroups.map(group => {
                        const groupRecordIds = group.records.map((r: any) => r.id);
                        const allChecked = groupRecordIds.every(id => pendingShipSelectedIds.has(id));
                        const checked = allChecked;
                        const toggleGroupSelection = () => {
                          if (!allChecked && pendingShipSelectedIds.size > 0) {
                            const firstId = pendingShipSelectedIds.values().next().value!;
                            const firstGroup = filteredPendingShipmentGroups.find(gg => gg.records.some((r: any) => r.id === firstId));
                            if (firstGroup && (firstGroup.partner !== group.partner || firstGroup.warehouseId !== group.warehouseId)) {
                              toast.warning('只能选择同一客户、同一仓库的明细同时发货，请先取消其他勾选。');
                              return;
                            }
                          }
                          setPendingShipSelectedIds(prev => {
                            const next = new Set(prev);
                            if (allChecked) {
                              groupRecordIds.forEach(id => next.delete(id));
                              return next;
                            }
                            groupRecordIds.forEach(id => next.add(id));
                            return next;
                          });
                        };
                        return (
                          <tr
                            key={group.groupKey}
                            className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                            onClick={toggleGroupSelection}
                          >
                            <td className="px-4 py-3 align-middle" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={toggleGroupSelection}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{group.docNumber}</td>
                            <td className="px-4 py-3 font-bold text-slate-800 truncate" title={group.productName}>{group.productName}</td>
                            <td className="px-4 py-3 font-bold text-slate-800 truncate" title={group.partner}>{group.partner}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{group.totalQuantity.toLocaleString()}</td>
                            <td className="px-4 py-3 font-bold text-slate-700 truncate" title={group.warehouseName}>{group.warehouseName}</td>
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => { setPendingShipDetailGroup(group); setPendingShipDetailEdit(null); }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                            >
                              <FileText className="w-3.5 h-3.5" /> 详情
                            </button>
                            </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {pendingShipmentGroups.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <span className="text-sm font-bold text-slate-600">已选 {pendingShipSelectedIds.size} 项</span>
                <button
                  type="button"
                  disabled={pendingShipSelectedIds.size === 0}
                  onClick={async () => {
                    if (pendingShipSelectedIds.size === 0 || !onAddRecord) return;
                    const selectedRecords = filteredPendingShipmentGroups.flatMap(g => g.records).filter((r: any) => pendingShipSelectedIds.has(r.id));
                    const first = selectedRecords[0];
                    const partnerName = first.partner || '';
                    const partnerId = first.partnerId || partners.find(p => p.name === partnerName)?.id || '';
                    const warehouseId = first.allocationWarehouseId || first.warehouseId || '';
                    if (!warehouseId || !partnerName) {
                      toast.error('所选明细缺少客户或仓库信息，无法生成销售单。');
                      return;
                    }
                    const newDocNumber = generateSBDocNumberForPartner(partnerId, partnerName);
                    const timestamp = new Date().toLocaleString();
                    const createdAt = new Date().toISOString().split('T')[0];
                    let recIdx = 0;
                    const newBillRecords = selectedRecords.map((r: any) => {
                      const pendingQty = (r.allocatedQuantity ?? 0) - (r.shippedQuantity ?? 0);
                      const price = r.salesPrice ?? 0;
                      return {
                        id: `psi-sb-${Date.now()}-${recIdx++}`,
                        type: 'SALES_BILL',
                        docNumber: newDocNumber,
                        timestamp,
                        _savedAtMs: Date.now(),
                        partner: partnerName,
                        partnerId,
                        warehouseId,
                        productId: r.productId,
                        variantId: r.variantId,
                        quantity: pendingQty,
                        salesPrice: price,
                        amount: pendingQty * price,
                        note: '',
                        operator: '张主管',
                        lineGroupId: r.lineGroupId ?? r.id,
                        createdAt,
                      };
                    });
                    if (onAddRecordBatch) await onAddRecordBatch(newBillRecords);
                    else { for (const r of newBillRecords) await onAddRecord(r); }
                    // 发走后只增加已发数量，不修改已配数量，销售订单仍为已配货；待发清单按「已配-已发」过滤，发走的自动不显示
                    if (onReplaceRecords) {
                      const docNumbersToUpdate = [...new Set(selectedRecords.map((r: any) => r.docNumber))];
                      docNumbersToUpdate.forEach(docNum => {
                        const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === docNum);
                        const newRecords = docRecords.map((re: any) => {
                          if (!pendingShipSelectedIds.has(re.id)) return re;
                          const allocated = re.allocatedQuantity ?? 0;
                          const alreadyShipped = re.shippedQuantity ?? 0;
                          const pending = allocated - alreadyShipped;
                          return { ...re, shippedQuantity: alreadyShipped + pending };
                        });
                        onReplaceRecords('SALES_ORDER', docNum, newRecords);
                      });
                    }
                    setPendingShipSelectedIds(new Set());
                    setShowPendingShipmentModal(false);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowDownToLine className="w-4 h-4" /> 发货生成销售单
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 待发货清单 - 详情弹窗（数量明细、编辑、删除，参考报工流水详情） */}
      {type === 'SALES_ORDER' && pendingShipDetailGroup && (() => {
        const g = pendingShipDetailGroup;
        const product = productMapPSI.get(g.productId);
        const hasVariants = g.records.some((r: any) => r.variantId) && (product?.variants?.length ?? 0) > 0;
        const unitName = getUnitName(g.productId);
        const isEditing = pendingShipDetailEdit !== null;
        const editQuantities = isEditing
          ? (hasVariants
            ? (pendingShipDetailEdit as Record<string, number>)
            : { _single: pendingShipDetailEdit as number })
          : null;
        const editWarehouseId = pendingShipDetailEditWarehouseId ?? g.warehouseId;
        const handleSaveEdit = () => {
          if (!onReplaceRecords || editQuantities == null) return;
          const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === g.docNumber);
          const newRecords = docRecords.map((re: any) => {
            const inGroup = g.records.some((r: any) => r.id === re.id);
            if (!inGroup) return re;
            const base = { ...re, allocationWarehouseId: editWarehouseId || re.allocationWarehouseId };
            if (hasVariants && re.variantId != null) {
              const qty = (editQuantities as Record<string, number>)[re.variantId] ?? re.allocatedQuantity ?? 0;
              return { ...base, allocatedQuantity: Math.max(0, qty) };
            }
            if (!hasVariants) {
              const qty = typeof editQuantities === 'number' ? editQuantities : (editQuantities as Record<string, number>)._single ?? re.allocatedQuantity ?? 0;
              return { ...base, allocatedQuantity: Math.max(0, qty) };
            }
            return base;
          });
          onReplaceRecords('SALES_ORDER', g.docNumber, newRecords);
          setPendingShipDetailEdit(null);
          setPendingShipDetailEditWarehouseId(null);
          setPendingShipDetailGroup(null);
        };
        const handleDelete = () => {
          if (!onReplaceRecords) return;
          void confirm({ message: '确定要取消该组配货吗？已配数量将清零。', danger: true }).then((ok) => {
            if (!ok) return;
            const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === g.docNumber);
            const newRecords = docRecords.map((re: any) => {
              if (!g.records.some((r: any) => r.id === re.id)) return re;
              return { ...re, allocatedQuantity: 0 };
            });
            onReplaceRecords('SALES_ORDER', g.docNumber, newRecords);
            setPendingShipDetailGroup(null);
            setPendingShipDetailEdit(null);
            setPendingShipDetailEditWarehouseId(null);
          });
        };
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setPendingShipDetailGroup(null); setPendingShipDetailEdit(null); setPendingShipDetailEditWarehouseId(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{g.docNumber}</span>
                  配货详情
                </h3>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button type="button" onClick={() => { setPendingShipDetailEdit(null); setPendingShipDetailEditWarehouseId(null); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button type="button" onClick={handleSaveEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingShipDetailEditWarehouseId(g.warehouseId);
                          if (hasVariants) {
                            const next: Record<string, number> = {};
                            g.records.forEach((r: any) => { next[r.variantId] = r.allocatedQuantity ?? 0; });
                            setPendingShipDetailEdit(next);
                          } else {
                            setPendingShipDetailEdit(g.records[0]?.allocatedQuantity ?? 0);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Pencil className="w-4 h-4" /> 编辑
                      </button>
                      {onReplaceRecords && (
                        <button type="button" onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setPendingShipDetailGroup(null); setPendingShipDetailEdit(null); setPendingShipDetailEditWarehouseId(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{g.productName}</h2>
                  <p className="text-xs text-slate-500 mt-1">客户：{g.partner}{!isEditing && ` · 仓库：${g.warehouseName}`}</p>
                  {isEditing && (
                    <div className="mt-3">
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">配货仓库（出库仓库）</label>
                      <select
                        value={editWarehouseId}
                        onChange={e => setPendingShipDetailEditWarehouseId(e.target.value)}
                        className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3">数量明细</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格 / 颜色尺码</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已配数量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hasVariants
                          ? g.records.map((r: any) => {
                              const v = product?.variants?.find((vv: ProductVariant) => vv.id === r.variantId);
                              const colorName = v?.colorId ? (dictionaries.colors.find(c => c.id === v.colorId)?.name ?? '') : '';
                              const sizeName = v?.sizeId ? (dictionaries.sizes.find(s => s.id === v.sizeId)?.name ?? '') : '';
                              const specLabel = [colorName, sizeName].filter(Boolean).join(' / ') || (r.variantId ?? '—');
                              const qty = isEditing && editQuantities && typeof editQuantities === 'object' && !('_single' in editQuantities)
                                ? (editQuantities as Record<string, number>)[r.variantId] ?? r.allocatedQuantity ?? 0
                                : r.allocatedQuantity ?? 0;
                              return (
                                <tr key={r.id} className="border-b border-slate-100">
                                  <td className="px-4 py-3 font-bold text-slate-800">{specLabel}</td>
                                  <td className="px-4 py-3 text-right">
                                    {isEditing ? (
                                      <input
                                        type="number"
                                        min={0}
                                        value={qty}
                                        onChange={e => setPendingShipDetailEdit((prev: Record<string, number> | number | null) => {
                                          const next = prev as Record<string, number>;
                                          return { ...next, [r.variantId]: Math.max(0, parseInt(e.target.value, 10) || 0) };
                                        })}
                                        className="w-24 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                      />
                                    ) : (
                                      <span className="font-black text-indigo-600">{qty.toLocaleString()} {unitName}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          : (
                            <tr className="border-b border-slate-100">
                              <td className="px-4 py-3 font-bold text-slate-800">数量</td>
                              <td className="px-4 py-3 text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min={0}
                                    value={typeof editQuantities === 'number' ? editQuantities : (editQuantities as Record<string, number>)?._single ?? g.totalQuantity}
                                    onChange={e => setPendingShipDetailEdit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="w-24 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                ) : (
                                  <span className="font-black text-indigo-600">{g.totalQuantity.toLocaleString()} {unitName}</span>
                                )}
                              </td>
                            </tr>
                          )}
                        <tr className="bg-indigo-50/80 font-bold">
                          <td className="px-4 py-3 text-slate-700">合计</td>
                          <td className="px-4 py-3 text-right text-indigo-600">
                            {isEditing && hasVariants && editQuantities && typeof editQuantities === 'object' && !('_single' in editQuantities)
                              ? (Object.values(editQuantities) as number[]).reduce((s, n) => s + (n || 0), 0).toLocaleString()
                              : isEditing && !hasVariants && typeof editQuantities === 'number'
                                ? (editQuantities as number).toLocaleString()
                                : g.totalQuantity.toLocaleString()}{' '}
                            {unitName}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
          {sortedGroupedEntries.length === 0 ? (
            <div className="bg-white rounded-[32px] border-2 border-dashed border-slate-200 py-24 text-center">
              <FileText className="w-16 h-16 text-slate-100 mx-auto mb-4" />
              <p className="text-slate-400 font-medium italic">暂无{current.label}流水记录</p>
            </div>
          ) : (
            sortedGroupedEntries.map(([docNum, docItems]) => {
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
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {mainInfo.timestamp}</span>
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
                            const warehouse = warehouseMapPSI.get(first.warehouseId);
                            const orderQty = grp.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
                            const allocatedQty = type === 'SALES_ORDER' ? grp.reduce((s, i) => s + (i.allocatedQuantity ?? 0), 0) : 0;
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
                                const v = product!.variants!.find((vv: ProductVariant) => vv.id === i.variantId);
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
                          return (
                              <tr key={gid} className="hover:bg-slate-50/30 transition-colors">
                                <td className="py-4 pr-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300"><Package className="w-4 h-4" /></div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-700">{product?.name || '未知产品'}</p>
                                      <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">
                                        {product?.sku}
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
                                        {allocatedQty > orderQty ? (
                                          <>
                                            <div className="h-full bg-emerald-500" style={{ width: `${orderQty > 0 ? (orderQty / allocatedQty) * 100 : 0}%` }} />
                                            <div className="h-full bg-rose-500" style={{ width: `${orderQty > 0 ? ((allocatedQty - orderQty) / allocatedQty) * 100 : 0}%` }} />
                                          </>
                                        ) : (
                                          <div
                                            className={`h-full rounded-full transition-all ${orderQty > 0 && allocatedQty >= orderQty ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${orderQty > 0 ? Math.min(100, (allocatedQty / orderQty) * 100) : 0}%` }}
                                          />
                                        )}
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-400">
                                        {allocatedQty > orderQty ? `已配 ${allocatedQty} / ${orderQty}（已超配）` : orderQty > 0 && allocatedQty >= orderQty ? '已完成' : `已配 ${allocatedQty} / ${orderQty}`}
                                      </span>
                                    </div>
                                  </td>
                                )}
                                {type === 'SALES_ORDER' && hasPsiPerm('psi:sales_order_allocation:allow') && (
                                  <td className="py-4 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAllocationModal({ docNumber: docNum, lineGroupId: gid, product: product!, grp: grp });
                                        setAllocationWarehouseId(grp[0]?.allocationWarehouseId ?? warehouses[0]?.id ?? '');
                                        const hasVariants = grp.some((i: any) => i.variantId);
                                        if (hasVariants) {
                                          const next: Record<string, number> = {};
                                          grp.forEach((i: any) => {
                                            if (i.variantId) {
                                              const order = i.quantity ?? 0;
                                              const allocated = i.allocatedQuantity ?? 0;
                                              next[i.variantId] = Math.max(0, order - allocated);
                                            }
                                          });
                                          setAllocationQuantities(next);
                                        } else {
                                          const order = grp[0]?.quantity ?? 0;
                                          const allocated = grp[0]?.allocatedQuantity ?? 0;
                                          setAllocationQuantities(Math.max(0, order - allocated));
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

        </div>
      )}


      {/* 销售订单列表 - 配货弹窗 */}
      {allocationModal && allocationQuantities !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => { setAllocationModal(null); setAllocationQuantities(null); }} />
          <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-black text-slate-800">配货</h3>
              </div>
              <button type="button" onClick={() => { setAllocationModal(null); setAllocationQuantities(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-auto flex-1 min-h-0">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-800">{allocationModal.product?.name}</span>
                <span className="text-slate-400 ml-1">· 单号 {allocationModal.docNumber}</span>
              </p>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">配货仓库（出库仓库）</label>
                <select
                  value={allocationWarehouseId}
                  onChange={e => setAllocationWarehouseId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">请选择仓库...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const orderTotal = allocationModal.grp.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                const allocatedTotal = allocationModal.grp.reduce((s: number, i: any) => s + (i.allocatedQuantity ?? 0), 0);
                const remainingTotal = typeof allocationQuantities === 'object'
                  ? (Object.values(allocationQuantities) as number[]).reduce((a, b) => a + b, 0)
                  : (allocationQuantities ?? 0);
                const unallocatedTotal = Math.max(0, orderTotal - allocatedTotal - remainingTotal);
                return (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <span className="text-slate-500">订单数量：<strong className="text-slate-800">{orderTotal.toLocaleString()}</strong></span>
                    <span className="text-slate-500">已配货数量：<strong className="text-slate-700">{allocatedTotal.toLocaleString()}</strong></span>
                    <span className="text-slate-500">本次剩余待配：<strong className="text-indigo-600">{remainingTotal.toLocaleString()}</strong></span>
                    {unallocatedTotal > 0 && (
                      <span className="text-slate-500">未配货：<strong className="text-amber-600">{unallocatedTotal.toLocaleString()}</strong></span>
                    )}
                  </div>
                );
              })()}
              {allocationModal.grp.some((i: any) => i.variantId) ? (
                <div className="space-y-4 overflow-auto">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）· 输入为剩余配货数量</p>
                  {(() => {
                    const groupedByColor: Record<string, ProductVariant[]> = {};
                    const grpVariantIds = new Set(allocationModal.grp.map((i: any) => i.variantId).filter(Boolean));
                    allocationModal.product?.variants?.forEach((v: ProductVariant) => {
                      if (!grpVariantIds.has(v.id)) return;
                      if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                      groupedByColor[v.colorId].push(v);
                    });
                    const orderByVariant: Record<string, number> = {};
                    const allocatedByVariant: Record<string, number> = {};
                    allocationModal.grp.forEach((i: any) => {
                      if (i.variantId) {
                        orderByVariant[i.variantId] = (orderByVariant[i.variantId] ?? 0) + (i.quantity ?? 0);
                        allocatedByVariant[i.variantId] = (allocatedByVariant[i.variantId] ?? 0) + (i.allocatedQuantity ?? 0);
                      }
                    });
                    return sortedVariantColorEntries(groupedByColor, allocationModal.product?.colorIds, allocationModal.product?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries.colors.find(c => c.id === colorId);
                      const orderSum = (colorVariants as ProductVariant[]).reduce((s, v) => s + (orderByVariant[v.id] ?? 0), 0);
                      const allocatedSum = (colorVariants as ProductVariant[]).reduce((s, v) => s + (allocatedByVariant[v.id] ?? 0), 0);
                      const remainingSum = typeof allocationQuantities === 'object'
                        ? (colorVariants as ProductVariant[]).reduce((s, v) => s + (allocationQuantities[v.id] ?? 0), 0)
                        : 0;
                      const unallocSum = Math.max(0, orderSum - allocatedSum - remainingSum);
                      return (
                        <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-2 w-28 shrink-0">
                            <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                            <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {colorVariants.map(v => {
                              const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                              const orderQty = orderByVariant[v.id] ?? 0;
                              const allocatedQty = allocatedByVariant[v.id] ?? 0;
                              const remainingQty = typeof allocationQuantities === 'object' ? (allocationQuantities[v.id] ?? 0) : 0;
                              const unallocated = Math.max(0, orderQty - allocatedQty - remainingQty);
                              return (
                                <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                  <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder="0"
                                    value={remainingQty || ''}
                                    onChange={e => {
                                      const val = parseInt(e.target.value, 10);
                                      setAllocationQuantities(prev => {
                                        if (typeof prev !== 'object') return prev;
                                        return { ...prev, [v.id]: isNaN(val) ? 0 : val };
                                      });
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                    title="剩余配货数量"
                                  />
                                  <div className="flex justify-between text-[9px] text-slate-400">
                                    <span>已配 {allocatedQty}</span>
                                    {unallocated > 0 && <span className="text-amber-600">未配 {unallocated}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">剩余配货数量</label>
                  <input
                    type="number"
                    min={0}
                    value={typeof allocationQuantities === 'number' ? allocationQuantities : 0}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      setAllocationQuantities(isNaN(v) ? 0 : v);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="本次配货数量"
                  />
                  {allocationModal.grp[0] && (allocationModal.grp[0].allocatedQuantity ?? 0) > 0 && (
                    <p className="text-xs text-slate-500 mt-1">已配货：{(allocationModal.grp[0].allocatedQuantity ?? 0).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-5 border-t border-slate-100 flex justify-end gap-4 shrink-0 bg-slate-50/50">
              <button type="button" onClick={() => { setAllocationModal(null); setAllocationQuantities(null); }} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 rounded-xl hover:bg-white border border-slate-200 transition-colors">
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!allocationModal || !onReplaceRecords) { setAllocationModal(null); setAllocationQuantities(null); return; }
                  if (!allocationWarehouseId) return;
                  const docRecords = recordsList.filter((r: any) => r.type === 'SALES_ORDER' && r.docNumber === allocationModal.docNumber);
                  const newRecords = docRecords.map((r: any) => {
                    const inGrp = allocationModal.grp.find((g: any) => g.id === r.id);
                    if (!inGrp) return r;
                    const remaining = typeof allocationQuantities === 'object' && inGrp.variantId
                      ? (allocationQuantities[inGrp.variantId] ?? 0)
                      : (typeof allocationQuantities === 'number' ? allocationQuantities : 0);
                    return { ...r, allocatedQuantity: (r.allocatedQuantity ?? 0) + remaining, allocationWarehouseId: allocationWarehouseId };
                  });
                  onReplaceRecords('SALES_ORDER', allocationModal.docNumber, newRecords);
                  setAllocationModal(null);
                  setAllocationQuantities(null);
                }}
                disabled={!allocationWarehouseId}
                className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 采购订单表单配置弹窗 */}
      {showPOFormConfigModal && poFormConfigDraft && onUpdatePurchaseOrderFormSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPOFormConfigModal(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sliders className="w-5 h-5 text-indigo-500" /> 采购订单表单配置</h3>
                <p className="text-xs text-slate-500 mt-1">配置在列表、新增、详情页中显示的字段，可增加自定义项</p>
              </div>
              <button onClick={() => setShowPOFormConfigModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              <div>
                <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">标准字段显示</h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">字段</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poFormConfigDraft.standardFields.filter(f => !['docNumber', 'partner', 'createdAt'].includes(f.id)).map(f => (
                        <tr key={f.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setPOFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setPOFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setPOFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
                  <button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                    <Plus className="w-3.5 h-3.5" /> 增加
                  </button>
                </div>
                {poFormConfigDraft.customFields.length === 0 ? (
                  <p className="text-sm text-slate-400 italic py-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">暂无自定义项，点击「增加」添加</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">标签</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">类型</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">选项（下拉时）</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poFormConfigDraft.customFields.map(cf => (
                          <tr key={cf.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                            <td className="px-4 py-2">
                              <select value={cf.type || 'text'} onChange={e => {
                                const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                                setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                              }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 align-top">
                              {cf.type === 'select' ? (
                                <div className="min-w-[180px] space-y-1.5">
                                  {(cf.options ?? []).map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-1">
                                      <input type="text" value={opt} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                      <button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                    <Plus className="w-3.5 h-3.5" /> 添加选项
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2"><button type="button" onClick={() => setPOFormConfigDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowPOFormConfigModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
              <button onClick={() => { onUpdatePurchaseOrderFormSettings(poFormConfigDraft); setShowPOFormConfigModal(false); setPOFormConfigDraft(null); }} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">保存配置</button>
            </div>
          </div>
        </div>
      )}

      {/* 采购单表单配置弹窗 */}
      {showPBFormConfigModal && pbFormConfigDraft && onUpdatePurchaseBillFormSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowPBFormConfigModal(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sliders className="w-5 h-5 text-indigo-500" /> 采购单表单配置</h3>
                <p className="text-xs text-slate-500 mt-1">配置在列表、新增、详情页中显示的字段，可增加自定义项</p>
              </div>
              <button onClick={() => setShowPBFormConfigModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-auto">
              <div>
                <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">标准字段显示</h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">字段</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pbFormConfigDraft.standardFields.filter(f => !['docNumber', 'partner', 'warehouse', 'createdAt'].includes(f.id)).map(f => (
                        <tr key={f.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setPBFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setPBFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                          <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setPBFormConfigDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
                  <button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                    <Plus className="w-3.5 h-3.5" /> 增加
                  </button>
                </div>
                {pbFormConfigDraft.customFields.length === 0 ? (
                  <p className="text-sm text-slate-400 italic py-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">暂无自定义项，点击「增加」添加</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">标签</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">类型</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">选项（下拉时）</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pbFormConfigDraft.customFields.map(cf => (
                          <tr key={cf.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                            <td className="px-4 py-2">
                              <select value={cf.type || 'text'} onChange={e => {
                                const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                                setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                              }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 align-top">
                              {cf.type === 'select' ? (
                                <div className="min-w-[180px] space-y-1.5">
                                  {(cf.options ?? []).map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-1">
                                      <input type="text" value={opt} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                      <button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                    <Plus className="w-3.5 h-3.5" /> 添加选项
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                            <td className="px-4 py-2"><button type="button" onClick={() => setPBFormConfigDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowPBFormConfigModal(false)} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
              <button onClick={() => { onUpdatePurchaseBillFormSettings(pbFormConfigDraft); setShowPBFormConfigModal(false); setPBFormConfigDraft(null); }} className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">保存配置</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PSIOpsView);