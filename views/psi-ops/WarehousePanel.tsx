import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Package,
  ChevronRight,
  ChevronDown,
  MoveRight,
  Search,
  FileText,
  ClipboardList,
  ArrowLeft,
  ScrollText,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product, Warehouse, ProductCategory, Partner, AppDictionaries } from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import * as api from '../../services/api';
import { production as productionApi } from '../../services/api';
import { normalizeDecimals } from '../../contexts/formSettingsDefaults';
import { fetchAllPages, type PaginatedLike } from '../../utils/fetchAllPages';
import { computeWarehouseFlowRows } from './warehouseFlowHelpers';
import { sortedColorEntries } from '../../utils/sortVariantsByProduct';
import { useProgressiveList } from '../../hooks/useProgressiveList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { localTodayYmd, toLocalDateYmd } from '../../utils/localDateTime';
import { useAuth } from '../../contexts/AuthContext';
import {
  readWarehousePreference,
  writeWarehousePreference,
  resolvePreferredSingleWarehouse,
  resolvePreferredTransferWarehouses,
  WAREHOUSE_DOC_KIND,
} from '../../utils/warehouseDocPreference';
import StocktakeListModal from './StocktakeListModal';
import TransferListModal from './TransferListModal';
import TransferOrderModal from './TransferOrderModal';
import StocktakeOrderModal from './StocktakeOrderModal';
import WarehouseFlowModal from './WarehouseFlowModal';
import ProductFlowDetailModal from './ProductFlowDetailModal';
import WarehouseFlowDocumentDetailModal from './WarehouseFlowDocumentDetailModal';
import { hasModulePerm } from '../../utils/hasModulePerm';

type TransferLineDraft = {
  id: string;
  productId: string;
  quantity?: number;
  variantQuantities?: Record<string, number>;
  batchNo?: string;
};
type StocktakeLineDraft = {
  id: string;
  productId: string;
  quantity?: number;
  variantQuantities?: Record<string, number>;
  batchNo?: string;
};

interface WarehouseProps {
  products: Product[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  partners: Partner[];
  dictionaries: AppDictionaries;
  records: any[];
  /** 已废弃：本组件内 useQuery 按 STOCK_* 类型窄拉；保留兼容旧调用方但不再消费 */
  prodRecords?: any[];
  orders: { id: string; orderNumber?: string }[];
  onAddRecord: (record: any) => void;
  onAddRecordBatch?: (records: any[]) => Promise<void>;
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
  getStock: (productId: string, warehouseId: string, excludeStocktakeDocNumber?: string) => number;
  getVariantDisplayQty: (productId: string, warehouseId: string, variantId: string) => number;
  productMapPSI: Map<string, Product>;
  warehouseMapPSI: Map<string, Warehouse>;
  categoryMapPSI: Map<string, ProductCategory>;
  getNullVariantProdStock: (productId: string, warehouseId?: string) => number;
  getUnitName: (productId: string) => string;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  parseRecordTime: (r: any) => number;
}

const WarehousePanel: React.FC<WarehouseProps> = ({
  products,
  warehouses,
  categories,
  partners,
  dictionaries,
  records,
  prodRecords: _legacyProdRecords,
  orders,
  onAddRecord,
  onAddRecordBatch,
  onReplaceRecords,
  onDeleteRecords,
  userPermissions,
  tenantRole,
  getStock,
  getVariantDisplayQty,
  productMapPSI,
  warehouseMapPSI,
  categoryMapPSI,
  getNullVariantProdStock,
  getUnitName,
  formatQtyDisplay,
  parseRecordTime,
}) => {
  const { tenantCtx, userId } = useAuth();
  const recordsList = records ?? [];
  const ordersList = orders ?? [];

  /**
   * Phase 3.D follow-up：仓库流水合并需要的生产入库 / 物料发出 / 物料退回三类记录，
   * 由本组件 useQuery 按 types 窄拉，替代 `AppDataContext.prodRecords` 全量大包。
   * 注意：返回数据走 `normalizeDecimals`，与 context 旧行为一致。
   *
   * Phase 3.E follow-up：默认窗口最近 30 天，避免大租户长时间运营后单次拉回数万条
   * 让页面卡顿。"近 30 天"足够覆盖仓库视图的库存反推与流水浏览；
   * 历史范围请改走「仓库流水」弹窗（内部按用户选择的日期再发请求）。
   */
  const stockProdDateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      ymd: `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`,
    };
  }, []);
  const stockProdQuery = useQuery({
    queryKey: ['warehousePanel.prodStockRecords', stockProdDateRange.ymd],
    queryFn: async () => {
      // 业务消费侧（仓库视图聚合）目前用动态字段访问，沿用 any 兼容；
      // 后续若把 prodStockRecords 类型化为 ProductionOpRecord[] 再统一收紧。
      const all = await fetchAllPages<any>(
        page =>
          productionApi.listPage({
            types: 'STOCK_IN,STOCK_OUT,STOCK_RETURN',
            page,
            pageSize: 200,
            startDate: stockProdDateRange.startDate,
            endDate: stockProdDateRange.endDate,
          }) as Promise<any[] | PaginatedLike<any>>,
        { maxPages: 60, warnTag: 'warehousePanel.prodStockRecords' },
      );
      return normalizeDecimals(all as never[]);
    },
    staleTime: 15_000,
  });
  const prodRecords = useMemo<any[]>(() => {
    if (stockProdQuery.isSuccess && Array.isArray(stockProdQuery.data)) return stockProdQuery.data as any[];
    return [];
  }, [stockProdQuery.isSuccess, stockProdQuery.data]);

  const hasPsiPerm = (perm: string) => hasModulePerm(tenantRole, userPermissions, 'psi', perm);

  // ── 仓库管理子视图状态 ──
  const [inventoryViewMode, setInventoryViewMode] = useState<'warehouse' | 'product'>('warehouse');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [expandedWarehouseProductKeys, setExpandedWarehouseProductKeys] = useState<Set<string>>(new Set());
  const [expandedProductIdByMaterial, setExpandedProductIdByMaterial] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [warehouseFlowModalOpen, setWarehouseFlowModalOpen] = useState(false);
  const [warehouseFlowDetailKey, setWarehouseFlowDetailKey] = useState<string | null>(null);
  /**
   * 仓库流水弹窗按日期窄拉 records，详情打开时把当时窄拉的 PSI / 生产记录附带传回，
   * 补齐 WarehouseFlowDocumentDetailModal 在 panel.recordsList / prodRecords 之外的数据。
   */
  const [warehouseFlowDetailExtra, setWarehouseFlowDetailExtra] = useState<{ psiRecords: any[]; prodRecords: any[] } | null>(null);
  const [productFlowDetail, setProductFlowDetail] = useState<{ productId: string; productName: string; warehouseId: string | null; warehouseName: string | null } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<{ fromWarehouseId: string; toWarehouseId: string; transferDate: string; note: string }>({
    fromWarehouseId: '', toWarehouseId: '', transferDate: localTodayYmd(), note: ''
  });
  const [transferItems, setTransferItems] = useState<TransferLineDraft[]>([]);
  const prevTransferFromWarehouseIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!transferModalOpen) {
      prevTransferFromWarehouseIdRef.current = null;
      return;
    }
    const cur = transferForm.fromWarehouseId;
    const prev = prevTransferFromWarehouseIdRef.current;
    if (prev !== null && prev !== cur) {
      setTransferItems(items => items.map(i => ({ ...i, batchNo: undefined })));
    }
    prevTransferFromWarehouseIdRef.current = cur;
  }, [transferModalOpen, transferForm.fromWarehouseId]);
  const [editingTransferDocNumber, setEditingTransferDocNumber] = useState<string | null>(null);
  const [transferListModalOpen, setTransferListModalOpen] = useState(false);
  const [stocktakeListModalOpen, setStocktakeListModalOpen] = useState(false);
  const [stocktakeModalOpen, setStocktakeModalOpen] = useState(false);
  const [stocktakeForm, setStocktakeForm] = useState<{ warehouseId: string; stocktakeDate: string; note: string }>({
    warehouseId: '', stocktakeDate: localTodayYmd(), note: ''
  });
  const [stocktakeItems, setStocktakeItems] = useState<StocktakeLineDraft[]>([]);
  const [editingStocktakeDocNumber, setEditingStocktakeDocNumber] = useState<string | null>(null);
  const prevStocktakeWarehouseIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!stocktakeModalOpen) {
      prevStocktakeWarehouseIdRef.current = null;
      return;
    }
    const cur = stocktakeForm.warehouseId;
    const prev = prevStocktakeWarehouseIdRef.current;
    if (prev !== null && prev !== cur) {
      setStocktakeItems(items => items.map(i => ({ ...i, batchNo: undefined })));
    }
    prevStocktakeWarehouseIdRef.current = cur;
  }, [stocktakeModalOpen, stocktakeForm.warehouseId]);

  /** `${productId}::${warehouseId}` 展开时懒加载 `getStockBatches` */
  const [batchBreakdownCache, setBatchBreakdownCache] = useState<
    Record<string, { batchNo: string; stock: number }[] | 'loading'>
  >({});
  /** 与「成功但无批次数」区分：仅请求失败时写入 */
  const [batchBreakdownError, setBatchBreakdownError] = useState<Record<string, string>>({});

  const loadBatchBreakdown = useCallback(async (productId: string, warehouseId: string) => {
    const k = `${productId}::${warehouseId}`;
    const pid = productId?.trim() ?? '';
    const wid = warehouseId?.trim() ?? '';
    if (!pid || !wid) {
      setBatchBreakdownError(prev => ({ ...prev, [k]: '缺少产品或仓库参数，无法拉取批次' }));
      setBatchBreakdownCache(prev => ({ ...prev, [k]: [] }));
      return;
    }
    setBatchBreakdownError(prev => {
      if (!(k in prev)) return prev;
      const n = { ...prev };
      delete n[k];
      return n;
    });
    setBatchBreakdownCache(prev => ({ ...prev, [k]: 'loading' }));
    try {
      const rows = await api.psi.getStockBatches({ productId: pid, warehouseId: wid });
      setBatchBreakdownCache(prev => ({ ...prev, [k]: Array.isArray(rows) ? rows : [] }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setBatchBreakdownError(prev => ({ ...prev, [k]: msg }));
      setBatchBreakdownCache(prev => ({ ...prev, [k]: [] }));
      toast.error(`加载批次结存失败：${msg}`, { id: `psi-batch-fail-${k}` });
    }
  }, []);

  useEffect(() => {
    setBatchBreakdownCache({});
    setBatchBreakdownError({});
  }, [records]);

  // ── 单号生成 ──
  const generateTRDocNumber = (): string => {
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
    const prefix = `TR-${y}${m}${d}`;
    const existing = recordsList.filter((r: any) => r.type === 'TRANSFER' && (r.docNumber || '').toLowerCase().startsWith(prefix.toLowerCase()));
    const seqNums = existing.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
  };

  const generateSTDocNumber = (): string => {
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
    const prefix = `ST-${y}${m}${d}`;
    const existing = recordsList.filter((r: any) => r.type === 'STOCKTAKE' && (r.docNumber || '').toLowerCase().startsWith(prefix.toLowerCase()));
    const seqNums = existing.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
  };

  // ── 调拨明细行操作 ──
  const addTransferItem = () => setTransferItems(prev => [...prev, { id: `tr-line-${Date.now()}`, productId: '', quantity: 0, batchNo: undefined }]);
  const updateTransferItem = (id: string, updates: Partial<TransferLineDraft>) => {
    setTransferItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateTransferVariantQty = (lineId: string, variantId: string, qty: number) => {
    setTransferItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeTransferItem = (id: string) => setTransferItems(prev => prev.filter(i => i.id !== id));

  // ── 盘点明细行操作 ──
  const addStocktakeItem = () => setStocktakeItems(prev => [...prev, { id: `st-line-${Date.now()}`, productId: '', quantity: 0, batchNo: undefined }]);
  const updateStocktakeItem = (id: string, updates: Partial<StocktakeLineDraft>) => {
    setStocktakeItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateStocktakeVariantQty = (lineId: string, variantId: string, qty: number) => {
    setStocktakeItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeStocktakeItem = (id: string) => setStocktakeItems(prev => prev.filter(i => i.id !== id));

  // ── 保存调拨单 ──
  const handleSaveTransfer = async () => {
    const fromId = transferForm.fromWarehouseId?.trim();
    const toId = transferForm.toWarehouseId?.trim();
    if (!fromId || !toId) {
      toast.warning('请选择调出仓库和调入仓库');
      return;
    }
    if (fromId === toId) {
      toast.warning('调出仓库与调入仓库不能相同');
      return;
    }
    const hasValidLine = transferItems.some(i => {
      if (!i.productId) return false;
      const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
      return q > 0;
    });
    if (transferItems.length === 0 || !hasValidLine) {
      toast.warning('请至少添加一条调拨明细且数量大于 0');
      return;
    }
    for (const item of transferItems) {
      if (!item.productId) continue;
      const p = productMapPSI.get(item.productId);
      const cat = categoryMapPSI.get(p?.categoryId ?? '');
      if (!categoryUsesBatchManagement(cat)) continue;
      const q =
        item.variantQuantities && Object.keys(item.variantQuantities).length > 0
          ? Object.values(item.variantQuantities).reduce((s, v) => s + v, 0)
          : (item.quantity ?? 0);
      if (q <= 0) continue;
      const bn = (item.batchNo ?? '').trim();
      if (!bn) {
        toast.error(`调拨产品「${p?.name ?? item.productId}」启用批次管理，请选择批次`);
        return;
      }
      try {
        const opts = await api.psi.getStockBatches({ productId: item.productId, warehouseId: fromId });
        const av = opts.find(o => o.batchNo === bn)?.stock ?? 0;
        if (q > av) {
          toast.error(`「${p?.name ?? item.productId}」批次「${bn}」在调出仓可用量不足（${av}）`);
          return;
        }
      } catch {
        toast.error('校验调拨批次库存失败');
        return;
      }
    }
    const docNumber = editingTransferDocNumber || generateTRDocNumber();
    const timestamp = editingTransferDocNumber
      ? (recordsList.find((r: any) => r.type === 'TRANSFER' && r.docNumber === editingTransferDocNumber)?.timestamp ?? new Date().toLocaleString())
      : new Date().toLocaleString();
    const createdAt = transferForm.transferDate || localTodayYmd();
    const newRecords: any[] = [];
    let trIdx = 0;
    transferItems.forEach((item) => {
      if (!item.productId) return;
      const p = productMapPSI.get(item.productId);
      const batchCat = categoryUsesBatchManagement(categoryMapPSI.get(p?.categoryId ?? ''));
      const bn = (item.batchNo ?? '').trim();
      if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
        Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
          if (!qty || qty <= 0) return;
          newRecords.push({
            id: `psi-tr-${Date.now()}-${trIdx++}`,
            type: 'TRANSFER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            fromWarehouseId: fromId,
            toWarehouseId: toId,
            productId: item.productId,
            variantId,
            quantity: qty,
            note: transferForm.note || undefined,
            lineGroupId: item.id,
            createdAt,
            ...(batchCat && bn ? { batchNo: bn } : {}),
          });
        });
      } else if ((item.quantity ?? 0) > 0) {
        newRecords.push({
          id: `psi-tr-${Date.now()}-${trIdx++}`,
          type: 'TRANSFER',
          docNumber,
          timestamp,
          _savedAtMs: Date.now(),
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          productId: item.productId,
          quantity: item.quantity!,
          note: transferForm.note || undefined,
          lineGroupId: item.id,
          createdAt,
          ...(batchCat && bn ? { batchNo: bn } : {}),
        });
      }
    });
    const originalDocNumber = editingTransferDocNumber;
    if (originalDocNumber && onReplaceRecords) {
      onReplaceRecords('TRANSFER', originalDocNumber, newRecords);
    } else {
      if (onAddRecordBatch) await onAddRecordBatch(newRecords);
      else { for (const r of newRecords) await onAddRecord(r); }
    }
    setTransferModalOpen(false);
    setEditingTransferDocNumber(null);
    setTransferForm({ fromWarehouseId: '', toWarehouseId: '', transferDate: localTodayYmd(), note: '' });
    setTransferItems([]);
    writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PSI_TRANSFER, {
      fromWarehouseId: fromId,
      toWarehouseId: toId,
    });
  };

  // ── 保存盘点单 ──
  const handleSaveStocktake = async () => {
    const warehouseId = stocktakeForm.warehouseId?.trim();
    if (!warehouseId) {
      toast.warning('请选择盘点仓库');
      return;
    }
    const hasValidLine = stocktakeItems.some(i => {
      if (!i.productId) return false;
      const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
      return q >= 0;
    });
    if (stocktakeItems.length === 0 || !hasValidLine) {
      toast.warning('请至少添加一条盘点明细');
      return;
    }
    for (const item of stocktakeItems) {
      if (!item.productId) continue;
      const p = productMapPSI.get(item.productId);
      const cat = categoryMapPSI.get(p?.categoryId ?? '');
      if (!categoryUsesBatchManagement(cat)) continue;
      const q = item.variantQuantities
        ? Object.values(item.variantQuantities).reduce((s, v) => s + v, 0)
        : (item.quantity ?? 0);
      if (q > 0 && !(item.batchNo ?? '').trim()) {
        toast.error(`盘点产品「${p?.name ?? item.productId}」启用批次管理，请选择批次`);
        return;
      }
    }
    const batchSysByProductBatch = new Map<string, number>();
    for (const item of stocktakeItems) {
      if (!item.productId) continue;
      const p = productMapPSI.get(item.productId);
      const cat = categoryMapPSI.get(p?.categoryId ?? '');
      const bn = (item.batchNo ?? '').trim();
      if (!bn || !categoryUsesBatchManagement(cat)) continue;
      const k = `${item.productId}::${bn}`;
      if (batchSysByProductBatch.has(k)) continue;
      try {
        const opts = await api.psi.getStockBatches({ productId: item.productId, warehouseId });
        batchSysByProductBatch.set(k, opts.find(o => o.batchNo === bn)?.stock ?? 0);
      } catch {
        batchSysByProductBatch.set(k, 0);
      }
    }
    const docNumber = editingStocktakeDocNumber || generateSTDocNumber();
    const timestamp = editingStocktakeDocNumber
      ? (recordsList.find((r: any) => r.type === 'STOCKTAKE' && r.docNumber === editingStocktakeDocNumber)?.timestamp ?? new Date().toLocaleString())
      : new Date().toLocaleString();
    const createdAt = stocktakeForm.stocktakeDate || localTodayYmd();
    const newRecords: any[] = [];
    let stIdx = 0;
    stocktakeItems.forEach((item) => {
      if (!item.productId) return;
      if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
        Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
          if (qty < 0) return;
          const sysQtyAtSave = getVariantDisplayQty(item.productId, warehouseId, variantId);
          newRecords.push({
            id: `psi-st-${Date.now()}-${stIdx++}`,
            type: 'STOCKTAKE',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            warehouseId,
            productId: item.productId,
            variantId,
            quantity: qty,
            systemQuantity: sysQtyAtSave,
            note: stocktakeForm.note || undefined,
            lineGroupId: item.id,
            createdAt,
          });
        });
      } else if ((item.quantity ?? 0) >= 0) {
        const bn = (item.batchNo ?? '').trim();
        const p = productMapPSI.get(item.productId);
        const batchCat = categoryUsesBatchManagement(categoryMapPSI.get(p?.categoryId ?? ''));
        const sysQtyAtSave =
          batchCat && bn
            ? (batchSysByProductBatch.get(`${item.productId}::${bn}`) ?? 0)
            : getStock(item.productId, warehouseId, editingStocktakeDocNumber ?? undefined);
        newRecords.push({
          id: `psi-st-${Date.now()}-${stIdx++}`,
          type: 'STOCKTAKE',
          docNumber,
          timestamp,
          _savedAtMs: Date.now(),
          warehouseId,
          productId: item.productId,
          quantity: item.quantity ?? 0,
          systemQuantity: sysQtyAtSave,
          note: stocktakeForm.note || undefined,
          lineGroupId: item.id,
          createdAt,
          ...(batchCat && bn ? { batchNo: bn } : {}),
        });
      }
    });
    const originalDocNumber = editingStocktakeDocNumber ?? undefined;
    newRecords.forEach(r => {
      if (r.batchNo) {
        r.diffQuantity = (Number(r.quantity) || 0) - (Number(r.systemQuantity) || 0);
      }
    });
    const productIdsWithBatchLine = new Set(newRecords.filter((r: any) => r.batchNo).map((r: any) => r.productId));
    const byProductId = new Map<string, number>();
    newRecords.forEach((r: any) => {
      if (r.batchNo) return;
      byProductId.set(r.productId, (byProductId.get(r.productId) ?? 0) + (r.quantity ?? 0));
    });
    const firstRecordIndexByProductId = new Map<string, number>();
    newRecords.forEach((r: any, idx: number) => {
      if (!firstRecordIndexByProductId.has(r.productId)) firstRecordIndexByProductId.set(r.productId, idx);
    });
    byProductId.forEach((actualTotal, productId) => {
      if (productIdsWithBatchLine.has(productId)) return;
      const product = productMapPSI.get(productId);
      const hasVariants = (product?.variants?.length ?? 0) > 0;
      const systemQty = hasVariants
        ? (product!.variants ?? []).reduce((s, v) => s + getVariantDisplayQty(productId, warehouseId, v.id), 0)
        : getStock(productId, warehouseId, originalDocNumber);
      const diff = actualTotal - systemQty;
      const firstIdx = firstRecordIndexByProductId.get(productId);
      if (firstIdx !== undefined) newRecords[firstIdx].diffQuantity = diff;
    });
    if (originalDocNumber && onReplaceRecords) {
      onReplaceRecords('STOCKTAKE', originalDocNumber, newRecords);
    } else {
      if (onAddRecordBatch) await onAddRecordBatch(newRecords);
      else { for (const r of newRecords) await onAddRecord(r); }
    }
    setStocktakeModalOpen(false);
    setEditingStocktakeDocNumber(null);
    setStocktakeForm({ warehouseId: '', stocktakeDate: localTodayYmd(), note: '' });
    setStocktakeItems([]);
    writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PSI_STOCKTAKE, {
      warehouseId,
    });
  };

  // ── 列表弹层回调 ──
  const handleCreateStocktake = useCallback(() => {
    setEditingStocktakeDocNumber(null);
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PSI_STOCKTAKE);
    const wh = resolvePreferredSingleWarehouse(warehouses, pref, '');
    setStocktakeForm({ warehouseId: wh, stocktakeDate: localTodayYmd(), note: '' });
    setStocktakeItems([]);
    setStocktakeListModalOpen(false);
    setStocktakeModalOpen(true);
  }, [tenantCtx?.tenantId, userId, warehouses]);

  const handleEditStocktake = useCallback((docNumber: string, docItems: any[]) => {
    setEditingStocktakeDocNumber(docNumber);
    const first = docItems[0];
    setStocktakeForm({
      warehouseId: first.warehouseId || '',
      stocktakeDate: toLocalDateYmd(first.createdAt) || localTodayYmd(),
      note: first.note || ''
    });
    const groups: Record<string, any[]> = {};
    docItems.forEach((item: any) => {
      const batchPart = String(item.batchNo ?? item.batch ?? '').trim();
      const gid = `${item.lineGroupId ?? item.id}|${batchPart}`;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(item);
    });
    setStocktakeItems(
      Object.entries(groups).map(([_gid, grp]) => {
        const firstItem = grp[0];
        const rowId = String(firstItem.lineGroupId ?? firstItem.id);
        const batchNo = String(firstItem.batchNo ?? firstItem.batch ?? '').trim() || undefined;
        const variantQuantities: Record<string, number> = {};
        let quantity = 0;
        grp.forEach((item: any) => {
          if (item.variantId) {
            variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
          } else {
            quantity += item.quantity ?? 0;
          }
        });
        const hasVariants = Object.keys(variantQuantities).length > 0;
        return hasVariants
          ? { id: rowId, productId: firstItem.productId, variantQuantities, batchNo }
          : { id: rowId, productId: firstItem.productId, quantity, batchNo };
      }),
    );
    setStocktakeListModalOpen(false);
    setStocktakeModalOpen(true);
  }, []);

  const handleCreateTransfer = useCallback(() => {
    setEditingTransferDocNumber(null);
    const pref = readWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.PSI_TRANSFER);
    const { fromWarehouseId, toWarehouseId } = resolvePreferredTransferWarehouses(warehouses, pref);
    setTransferForm({
      fromWarehouseId,
      toWarehouseId,
      transferDate: localTodayYmd(),
      note: '',
    });
    setTransferItems([]);
    setTransferListModalOpen(false);
    setTransferModalOpen(true);
  }, [tenantCtx?.tenantId, userId, warehouses]);

  const handleEditTransfer = useCallback((docNumber: string, docItems: any[]) => {
    setEditingTransferDocNumber(docNumber);
    const first = docItems[0];
    setTransferForm({
      fromWarehouseId: first.fromWarehouseId || '',
      toWarehouseId: first.toWarehouseId || '',
      transferDate: toLocalDateYmd(first.createdAt) || localTodayYmd(),
      note: first.note || ''
    });
    const groups: Record<string, any[]> = {};
    docItems.forEach((item: any) => {
      const batchPart = String(item.batchNo ?? item.batch ?? '').trim();
      const gid = `${item.lineGroupId ?? item.id}|${batchPart}`;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(item);
    });
    setTransferItems(
      Object.entries(groups).map(([_gid, grp]) => {
        const firstItem = grp[0];
        const rowId = String(firstItem.lineGroupId ?? firstItem.id);
        const batchNo = String(firstItem.batchNo ?? firstItem.batch ?? '').trim() || undefined;
        const variantQuantities: Record<string, number> = {};
        let quantity = 0;
        grp.forEach((item: any) => {
          if (item.variantId) {
            variantQuantities[item.variantId] = (variantQuantities[item.variantId] ?? 0) + (item.quantity ?? 0);
          } else {
            quantity += item.quantity ?? 0;
          }
        });
        const hasVariants = Object.keys(variantQuantities).length > 0;
        return hasVariants
          ? { id: rowId, productId: firstItem.productId, variantQuantities, batchNo }
          : { id: rowId, productId: firstItem.productId, quantity, batchNo };
      }),
    );
    setTransferListModalOpen(false);
    setTransferModalOpen(true);
  }, []);

  // ── 调拨单按单号分组 ──
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

  // ── 盘点单按单号分组 ──
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

  // ── 按物料视图的库存列表 ──
  const filteredProductStocks = useMemo(() => {
    const allStocks = products.map(p => {
      const category = categoryMapPSI.get(p.categoryId);
      const hasVariants = (p.variants?.length ?? 0) > 0;
      const distribution = warehouses.map(wh => ({
        warehouseId: wh.id,
        warehouseName: wh.name,
        category: wh.category,
        qty: hasVariants
          ? (p.variants ?? []).reduce((s, v) => s + getVariantDisplayQty(p.id, wh.id, v.id), 0) + getNullVariantProdStock(p.id, wh.id)
          : getStock(p.id, wh.id)
      }));
      const total = distribution.reduce((s, d) => s + d.qty, 0);
      const variantBreakdown = (p.variants?.length
        ? p.variants.map(v => {
            const perWarehouse = warehouses.map(wh => ({ warehouseId: wh.id, qty: getVariantDisplayQty(p.id, wh.id, v.id) }));
            const totalQty = perWarehouse.reduce((s, x) => s + x.qty, 0);
            return {
              variantId: v.id,
              colorId: v.colorId,
              sizeId: v.sizeId,
              colorName: dictionaries?.colors?.find(c => c.id === v.colorId)?.name ?? v.colorId,
              sizeName: dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name ?? v.sizeId,
              totalQty,
              perWarehouse
            };
          })
        : undefined) as { variantId: string; colorId: string; sizeId: string; colorName: string; sizeName: string; totalQty: number; perWarehouse: { warehouseId: string; qty: number }[] }[] | undefined;
      return {
        ...p,
        total,
        distribution,
        categoryName: category?.name || '未分类',
        categoryId: p.categoryId,
        usesBatch: categoryUsesBatchManagement(category),
        variantBreakdown,
      };
    });
    if (!debouncedSearchTerm.trim()) return allStocks;
    const term = debouncedSearchTerm.toLowerCase();
    return allStocks.filter(ps => ps.name.toLowerCase().includes(term) || ps.sku.toLowerCase().includes(term) || ps.categoryName.toLowerCase().includes(term));
  }, [products, warehouses, recordsList, categories, debouncedSearchTerm, getVariantDisplayQty, dictionaries, getStock, categoryMapPSI]);

  const nonZeroStocks = useMemo(() => filteredProductStocks.filter(p => p.total !== 0), [filteredProductStocks]);
  const pStocks = useProgressiveList(nonZeroStocks);

  // ── 仓库流水 ── 聚合逻辑下沉到 ./warehouseFlowHelpers
  const warehouseFlowRows = useMemo(() => {
    return computeWarehouseFlowRows({
      recordsList: recordsList as any[],
      prodRecords: prodRecords as any[],
      productMapPSI,
      warehouseMapPSI,
      ordersList: ordersList as { id: string; orderNumber?: string }[],
      parseRecordTime,
    });
  }, [recordsList, prodRecords, productMapPSI, warehouseMapPSI, ordersList, parseRecordTime]);
  // 占位：保留下面原 IIFE 直到下方匹配 `}, [recordsList...` 行被一并删除（见 git diff）

  // ── 按仓库聚合的库存列表 ──
  const warehouseStockList = useMemo(() => {
    return warehouses.map(wh => {
      const lines = filteredProductStocks
        .filter(ps => {
          const d = ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id);
          return d && d.qty !== 0;
        })
        .map(ps => {
          const d = ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id);
          const hasVariants = (ps as any).variantBreakdown != null;
          const variantBreakdown = hasVariants
            ? ((ps as any).variantBreakdown as { variantId: string; colorId: string; sizeId: string; colorName: string; sizeName: string; perWarehouse: { warehouseId: string; qty: number }[] }[]).map((vb: { variantId: string; colorId: string; sizeId: string; colorName: string; sizeName: string; perWarehouse: { warehouseId: string; qty: number }[] }) => ({
                variantId: vb.variantId,
                colorId: vb.colorId,
                sizeId: vb.sizeId,
                colorName: vb.colorName,
                sizeName: vb.sizeName,
                qty: vb.perWarehouse.find((pw: { warehouseId: string }) => pw.warehouseId === wh.id)?.qty ?? 0
              }))
            : undefined;
          const qtyForLine = d?.qty ?? 0;
          return {
            productId: ps.id,
            name: ps.name,
            sku: ps.sku,
            categoryName: ps.categoryName,
            qty: qtyForLine,
            imageUrl: ps.imageUrl,
            variantBreakdown,
            usesBatch: (ps as { usesBatch?: boolean }).usesBatch ?? false,
          };
        });
      const totalQty = lines.reduce((s, l) => s + l.qty, 0);
      return { warehouseId: wh.id, warehouseName: wh.name, code: wh.code, category: wh.category, location: wh.location, contact: wh.contact, totalQty, skuCount: lines.length, lines };
    });
  }, [warehouses, filteredProductStocks]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
           <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
             <div className="flex items-center gap-3 flex-wrap">
               <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                 <button onClick={() => { setInventoryViewMode('warehouse'); setSelectedWarehouseId(null); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${inventoryViewMode === 'warehouse' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                   <WarehouseIcon className="w-3.5 h-3.5" /> 按仓库
                 </button>
                 <button onClick={() => setInventoryViewMode('product')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${inventoryViewMode === 'product' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                   <Package className="w-3.5 h-3.5" /> 按物料
                 </button>
               </div>
               <div className="relative group">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <input type="text" placeholder="搜索产品名称、SKU 或分类..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
               </div>
             </div>
             <div className="flex items-center gap-3">
               {hasPsiPerm('psi:warehouse_stocktake:view') && (
               <button
                 type="button"
                 onClick={() => setStocktakeListModalOpen(true)}
                 className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold transition-all hover:bg-indigo-50"
               >
                 <ClipboardList className="w-4 h-4" /> 盘点单
               </button>
               )}
               {hasPsiPerm('psi:warehouse_transfer:view') && (
               <button
                 type="button"
                 onClick={() => setTransferListModalOpen(true)}
                 className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold transition-all hover:bg-indigo-50"
               >
                 <MoveRight className="w-4 h-4" /> 调拨单
               </button>
               )}
               {hasPsiPerm('psi:warehouse_flow:allow') && (
               <button
                 type="button"
                 onClick={() => { setWarehouseFlowModalOpen(true); setWarehouseFlowDetailKey(null); }}
                 className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold transition-all hover:bg-indigo-50"
               >
                 <ScrollText className="w-4 h-4" /> 仓库流水
               </button>
               )}
             </div>
           </div>
           
           <>
               {!hasPsiPerm('psi:warehouse_list:allow') ? (
                 <div className="bg-white rounded-[24px] border-2 border-dashed border-slate-100 p-20 text-center">
                   <WarehouseIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                   <p className="text-slate-400 font-medium">无权限查看仓库列表</p>
                 </div>
               ) : (
               <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2">
                 {inventoryViewMode === 'warehouse' ? (
                   selectedWarehouseId == null ? (
                     <div className="p-4 md:p-5">
                       {warehouseStockList.length === 0 ? (
                         <div className="py-16 text-center text-slate-400">
                           <WarehouseIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                           <p className="text-sm font-bold">暂无仓库或库存数据</p>
                           <p className="text-xs mt-1">请先在系统设置中维护仓库，并通过采购入库等业务产生库存</p>
                         </div>
                       ) : (
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                           {warehouseStockList.map(whRow => (
                             <button
                               key={whRow.warehouseId}
                               type="button"
                               onClick={() => setSelectedWarehouseId(whRow.warehouseId)}
                               className="text-left p-5 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md hover:bg-indigo-50/30 transition-all group"
                             >
                               <div className="flex items-start gap-4">
                                 <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 shrink-0">
                                   <WarehouseIcon className="w-6 h-6" />
                                 </div>
                                 <div className="min-w-0 flex-1">
                                   <h3 className="text-base font-black text-slate-800 truncate">{whRow.warehouseName}</h3>
                                   <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                     <span>{whRow.code}</span>
                                     <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{whRow.category}</span>
                                     {whRow.location && <span className="truncate">{whRow.location}</span>}
                                   </div>
                                   <div className="flex items-center gap-4 mt-3 text-sm">
                                     <span className="text-slate-500 font-bold">总存量 <span className={`font-black ${whRow.totalQty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{whRow.totalQty.toLocaleString()}</span></span>
                                     <span className="text-slate-500 font-bold">物料 <span className="text-slate-700 font-black">{whRow.skuCount}</span> SKU</span>
                                   </div>
                                 </div>
                                 <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 shrink-0 mt-0.5" />
                               </div>
                             </button>
                           ))}
                         </div>
                       )}
                     </div>
                   ) : (
                     (() => {
                       const whRow = warehouseStockList.find(w => w.warehouseId === selectedWarehouseId);
                       if (!whRow) return null;
                       return (
                         <div className="p-4 md:p-5">
                           <button
                             type="button"
                             onClick={() => setSelectedWarehouseId(null)}
                             className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold text-sm mb-4"
                           >
                             <ArrowLeft className="w-4 h-4" /> 返回仓库列表
                           </button>
                           <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                             <div className="flex items-center gap-4">
                               <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                 <WarehouseIcon className="w-6 h-6" />
                               </div>
                               <div>
                                 <h3 className="text-lg font-black text-slate-800">{whRow.warehouseName}</h3>
                                 <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                   <span>{whRow.code}</span>
                                   <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{whRow.category}</span>
                                   {whRow.location && <span>{whRow.location}</span>}
                                   {whRow.contact && <span>负责人: {whRow.contact}</span>}
                                 </div>
                               </div>
                             </div>
                             <div className="flex items-center gap-4 text-sm">
                               <span className="text-slate-500 font-bold">总存量 <span className={`font-black ${whRow.totalQty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{whRow.totalQty.toLocaleString()}</span> PCS</span>
                               <span className="text-slate-500 font-bold">物料种类 <span className="text-slate-700 font-black">{whRow.skuCount}</span> SKU</span>
                             </div>
                           </div>
                           {whRow.lines.length === 0 ? (
                             <p className="text-sm text-slate-400 italic py-6">该仓库暂无结存</p>
                           ) : (
                             <div className="overflow-x-auto rounded-xl border border-slate-100">
                               <table className="w-full text-left">
                                 <thead>
                                   <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/80 border-b border-slate-100">
                                     <th className="px-4 py-3 w-10" />
                                     <th className="px-4 py-3 w-14">图片</th>
                                     <th className="px-4 py-3">产品 / SKU</th>
                                     <th className="px-4 py-3">分类</th>
                                     <th className="px-4 py-3 text-right">结存数量</th>
                                     <th className="px-4 py-3 text-right w-24">操作</th>
                                   </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-50">
                                   {whRow.lines.map(line => {
                                     const expandKey = `${whRow.warehouseId}-${line.productId}`;
                                     const hasVariants = (line as any).variantBreakdown?.length > 0;
                                    const isExpanded = expandedWarehouseProductKeys.has(expandKey);
                                    const usesBatch = (line as { usesBatch?: boolean }).usesBatch ?? false;
                                    const canExpand = hasVariants || (usesBatch && line.qty !== 0);
                                     const groupedByColor: Record<string, { colorName: string; items: { sizeName: string; qty: number }[] }> = {};
                                     if (hasVariants) {
                                       ((line as any).variantBreakdown as { colorId: string; colorName: string; sizeName: string; qty: number }[]).forEach((vb: { colorId: string; colorName: string; sizeName: string; qty: number }) => {
                                         if (!groupedByColor[vb.colorId]) groupedByColor[vb.colorId] = { colorName: vb.colorName, items: [] };
                                         groupedByColor[vb.colorId].items.push({ sizeName: vb.sizeName, qty: vb.qty });
                                       });
                                     }
                                     return (
                                       <React.Fragment key={expandKey}>
                                         <tr className="hover:bg-slate-50/50 transition-colors">
                                          <td className="px-2 py-3 w-10">
                                            {canExpand ? (
                                              <button type="button" onClick={() => setExpandedWarehouseProductKeys(prev => {
                                                const next = new Set(prev);
                                                if (next.has(expandKey)) {
                                                  next.delete(expandKey);
                                                } else {
                                                  next.add(expandKey);
                                                  if (usesBatch && line.qty !== 0) void loadBatchBreakdown(line.productId, whRow.warehouseId);
                                                }
                                                return next;
                                              })} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="展开明细">
                                                 {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                               </button>
                                             ) : null}
                                           </td>
                                           <td className="px-4 py-3">
                                             {line.imageUrl ? (
                                               <button type="button" onClick={() => setImagePreviewUrl(line.imageUrl!)} className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:opacity-90 transition-opacity">
                                                 <img loading="lazy" decoding="async" src={line.imageUrl} alt={line.name} className="w-full h-full object-cover block" />
                                               </button>
                                             ) : (
                                               <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                                                 <Package className="w-5 h-5" />
                                               </div>
                                             )}
                                           </td>
                                           <td className="px-4 py-3">
                                             <div>
                                               <p className="text-sm font-bold text-slate-800">{line.name}</p>
                                               <p className="text-[10px] text-slate-400 font-bold uppercase">{line.sku}</p>
                                             </div>
                                           </td>
                                           <td className="px-4 py-3 text-sm text-slate-600">{line.categoryName}</td>
                                           <td className="px-4 py-3 text-right">
                                             <div className="flex flex-col items-end gap-1">
                                               <div>
                                                 <span className={`text-sm font-black ${line.qty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{line.qty.toLocaleString()}</span>
                                                 <span className="text-[10px] text-slate-400 ml-1">{line.productId ? getUnitName(line.productId) : 'PCS'}</span>
                                               </div>
                                             </div>
                                           </td>
                                           <td className="px-4 py-3 text-right">
                                             <button type="button" onClick={() => setProductFlowDetail({ productId: line.productId, productName: line.name, warehouseId: whRow.warehouseId, warehouseName: whRow.warehouseName })} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                               <FileText className="w-3.5 h-3.5" /> 详情
                                             </button>
                                           </td>
                                         </tr>
                                        {isExpanded && (
                                          <tr>
                                            <td colSpan={6} className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                                              <div className="space-y-3 pl-4">
                                                {usesBatch && line.qty !== 0 && (() => {
                                                  const bk = `${line.productId}::${whRow.warehouseId}`;
                                                  const cache = batchBreakdownCache[bk];
                                                  const errMsg = batchBreakdownError[bk];
                                                  return (
                                                    <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
                                                      <div className="flex items-center justify-between gap-3 mb-3">
                                                        <div>
                                                          <p className="text-sm font-black text-slate-800">批次结存</p>
                                                          <p className="text-[10px] font-bold text-slate-400">{whRow.warehouseName}</p>
                                                        </div>
                                                        <span className="text-xs font-black text-indigo-600 tabular-nums">{line.qty.toLocaleString()} {line.productId ? getUnitName(line.productId) : 'PCS'}</span>
                                                      </div>
                                                      {cache === 'loading' ? (
                                                        <p className="text-xs text-slate-400">加载中…</p>
                                                      ) : errMsg ? (
                                                        <p className="text-xs text-rose-600 font-medium" title={errMsg}>无法加载批次数据：{errMsg}</p>
                                                      ) : !cache || cache.length === 0 ? (
                                                        <p className="text-xs text-slate-400">暂无批次明细（若已采购入库带批号，请确认入库行已保存批号且仓库与当前行一致）</p>
                                                      ) : (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                          {cache.map(row => (
                                                            <div key={row.batchNo} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                                              <span className="truncate text-xs font-black text-slate-700" title={row.batchNo}>{row.batchNo}</span>
                                                              <span className="text-xs font-black text-indigo-600 tabular-nums shrink-0">{row.stock.toLocaleString()}</span>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })()}
                                                {hasVariants && (
                                                  <>
                                                {sortedColorEntries(groupedByColor, productMapPSI.get(line.productId)?.colorIds).map(([colorId, { colorName, items }]) => {
                                                  const color = dictionaries?.colors?.find(c => c.id === colorId);
                                                  return (
                                                  <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                                                    <div className="flex items-center gap-3 w-40 shrink-0">
                                                      <div className="w-5 h-5 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: color?.value }} />
                                                      <span className="text-sm font-black text-slate-700">{colorName}</span>
                                                    </div>
                                                    <div className="flex-1 flex flex-wrap gap-4">
                                                      {items.map((item, idx) => (
                                                        <div key={idx} className="flex flex-col gap-1.5 w-24">
                                                          <span className="text-[10px] font-black text-slate-400 uppercase">{item.sizeName}</span>
                                                          <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2">
                                                            <span className={`text-sm font-bold ${item.qty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{item.qty.toLocaleString()}</span>
                                                           </div>
                                                         </div>
                                                       ))}
                                                     </div>
                                                   </div>
                                                   );
                                                 })}
                                                  </>
                                                )}
                                                {hasVariants && (() => {
                                                   const variantSum = (Object.values(groupedByColor) as { items: { qty: number }[] }[]).reduce((s, g) => s + g.items.reduce((t, i) => t + i.qty, 0), 0);
                                                   const stocktakePart = line.qty - variantSum;
                                                   if (stocktakePart > 0) return (
                                                     <div className="mt-2 p-3 bg-amber-50/80 rounded-xl border border-amber-100 text-xs">
                                                       <span className="text-amber-700 font-bold">盘点调整（产品级）：+{stocktakePart.toLocaleString()}</span>
                                                       <span className="text-slate-500 ml-1">（行结存 = 各规格数量 + 盘点调整）</span>
                                                     </div>
                                                   );
                                                   return null;
                                                 })()}
                                               </div>
                                             </td>
                                           </tr>
                                         )}
                                       </React.Fragment>
                                     );
                                   })}
                                 </tbody>
                               </table>
                             </div>
                           )}
                         </div>
                       );
                     })()
                   )
                 ) : (
                   <div className="overflow-x-auto">
                     {nonZeroStocks.length === 0 ? (
                       <div className="py-16 text-center text-slate-400">
                         <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                         <p className="text-sm font-bold">暂无库存数据</p>
                         <p className="text-xs mt-1">通过采购入库、生产入库等业务产生库存后在此展示</p>
                       </div>
                     ) : (<>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-4 w-10" />
                            <th className="px-4 py-4 w-14">图片</th>
                            <th className="px-6 py-4">产品 / SKU</th>
                            <th className="px-6 py-4">分类</th>
                            <th className="px-6 py-4 text-right">总库存</th>
                            {warehouses.map(wh => (
                              <th key={wh.id} className="px-4 py-4 text-right whitespace-nowrap">{wh.name}</th>
                            ))}
                            <th className="px-4 py-4 text-right w-24">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                         {pStocks.visibleItems.map(ps => {
                            const hasVariants = (ps as any).variantBreakdown?.length > 0;
                            const isExpanded = expandedProductIdByMaterial === ps.id;
                            const groupedByColor: Record<string, { colorName: string; items: { sizeName: string; totalQty: number }[] }> = {};
                            if (hasVariants) {
                              ((ps as any).variantBreakdown as { colorId: string; colorName: string; sizeName: string; totalQty: number }[]).forEach((vb: { colorId: string; colorName: string; sizeName: string; totalQty: number }) => {
                                if (!groupedByColor[vb.colorId]) groupedByColor[vb.colorId] = { colorName: vb.colorName, items: [] };
                                groupedByColor[vb.colorId].items.push({ sizeName: vb.sizeName, totalQty: vb.totalQty });
                              });
                            }
                            const colSpan = 6 + warehouses.length;
                            const usesBatch = (ps as { usesBatch?: boolean }).usesBatch ?? false;
                            const batchWarehouseIds = usesBatch
                              ? warehouses
                                  .filter(wh => (ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id)?.qty ?? 0) !== 0)
                                  .map(wh => wh.id)
                              : [];
                            const canExpand = hasVariants || batchWarehouseIds.length > 0;
                            return (
                              <React.Fragment key={ps.id}>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-2 py-3 w-10">
                                    {canExpand ? (
                                      <button type="button" onClick={() => setExpandedProductIdByMaterial(prev => {
                                        const next = prev === ps.id ? null : ps.id;
                                        if (next === ps.id && batchWarehouseIds.length > 0) {
                                          batchWarehouseIds.forEach(warehouseId => {
                                            void loadBatchBreakdown(ps.id, warehouseId);
                                          });
                                        }
                                        return next;
                                      })} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="展开明细">
                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                      </button>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3">
                                    {ps.imageUrl ? (
                                      <button type="button" onClick={() => setImagePreviewUrl(ps.imageUrl!)} className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:opacity-90 transition-opacity">
                                        <img loading="lazy" decoding="async" src={ps.imageUrl} alt={ps.name} className="w-full h-full object-cover block" />
                                      </button>
                                    ) : (
                                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                                        <Package className="w-5 h-5" />
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-3">
                                    <div>
                                      <p className="text-sm font-bold text-slate-800">{ps.name}</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase">{ps.sku}</p>
                                    </div>
                                  </td>
                                  <td className="px-6 py-3 text-sm text-slate-600">{ps.categoryName}</td>
                                  <td className="px-6 py-3 text-right">
                                    <span className={`text-sm font-black ${ps.total < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{ps.total.toLocaleString()}</span>
                                    <span className="text-[10px] text-slate-400 ml-1">{getUnitName(ps.id)}</span>
                                  </td>
                                  {warehouses.map(wh => {
                                    const d = ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id);
                                    const qty = d?.qty ?? 0;
                                    return (
                                      <td key={wh.id} className="px-4 py-3 text-right text-sm font-bold text-slate-600">
                                        <div className="inline-flex flex-col items-end gap-1">
                                          <span>{qty !== 0 ? <span className={qty < 0 ? 'text-rose-600 font-bold' : ''}>{qty.toLocaleString()}</span> : '—'}</span>
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="px-4 py-3 text-right">
                                    <button type="button" onClick={() => setProductFlowDetail({ productId: ps.id, productName: ps.name, warehouseId: null, warehouseName: null })} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                      <FileText className="w-3.5 h-3.5" /> 详情
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={colSpan} className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                                      <div className="space-y-3 pl-4">
                                        {batchWarehouseIds.length > 0 && (
                                          <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                              <div>
                                                <p className="text-sm font-black text-slate-800">按仓库批次结存</p>
                                                <p className="text-[10px] font-bold text-slate-400">仅展示当前产品有结存的仓库批号</p>
                                              </div>
                                              <span className="text-xs font-black text-indigo-600">{batchWarehouseIds.length} 个仓库</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                              {warehouses.map(wh => {
                                                if (!batchWarehouseIds.includes(wh.id)) return null;
                                                const bk = `${ps.id}::${wh.id}`;
                                                const d = ps.distribution.find((x: { warehouseId: string }) => x.warehouseId === wh.id);
                                                const cache = batchBreakdownCache[bk];
                                                const errMsg = batchBreakdownError[bk];
                                                return (
                                                  <div key={bk} className="rounded-2xl border border-indigo-100 bg-white p-3 shadow-sm">
                                                    <div className="flex items-center justify-between gap-3 mb-3">
                                                      <p className="text-xs font-black text-slate-800 truncate" title={wh.name}>{wh.name}</p>
                                                      <span className="text-[10px] font-black text-indigo-600 tabular-nums shrink-0">{(d?.qty ?? 0).toLocaleString()}</span>
                                                    </div>
                                                    {cache === 'loading' ? (
                                                      <p className="text-xs text-slate-400">加载中…</p>
                                                    ) : errMsg ? (
                                                      <p className="text-xs text-rose-600 font-medium" title={errMsg}>无法加载：{errMsg}</p>
                                                    ) : !cache || cache.length === 0 ? (
                                                      <p className="text-xs text-slate-400">暂无批次明细（与总账一致时可忽略）</p>
                                                    ) : (
                                                      <div className="space-y-2">
                                                        {cache.map(row => (
                                                          <div key={row.batchNo} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                                            <span className="truncate text-xs font-black text-slate-700" title={row.batchNo}>{row.batchNo}</span>
                                                            <span className="text-xs font-black text-indigo-600 tabular-nums shrink-0">{row.stock.toLocaleString()}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                        {hasVariants && (
                                          <>
                                        {sortedColorEntries(groupedByColor, productMapPSI.get(ps.id)?.colorIds).map(([colorId, { colorName, items }]) => {
                                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                                          return (
                                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                                              <div className="flex items-center gap-3 w-40 shrink-0">
                                                <div className="w-5 h-5 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: color?.value }} />
                                                <span className="text-sm font-black text-slate-700">{colorName}</span>
                                              </div>
                                              <div className="flex-1 flex flex-wrap gap-4">
                                                {items.map((item, idx) => (
                                                  <div key={idx} className="flex flex-col gap-1.5 w-24">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">{item.sizeName}</span>
                                                    <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-2">
                                                      <span className="text-sm font-bold text-indigo-600">{item.totalQty.toLocaleString()}</span>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          );
                                        })}
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                         </tbody>
                       </table>
                       {pStocks.hasMore && (
                         <div className="flex items-center justify-center gap-3 py-3 bg-slate-50/80 border-t border-slate-100">
                           <span className="text-xs text-slate-400">已显示 {pStocks.visibleItems.length} / {pStocks.total} 条</span>
                           <button type="button" onClick={pStocks.showMore} className="px-4 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all">加载更多</button>
                           <button type="button" onClick={pStocks.showAll} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all">全部显示</button>
                         </div>
                       )}
                     </>)}
                   </div>
                 )}
               </div>
               )}

               {imagePreviewUrl && (
                 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 animate-in fade-in" onClick={() => setImagePreviewUrl(null)} aria-hidden>
                   <img src={imagePreviewUrl} alt="产品图片" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                   <button type="button" onClick={() => setImagePreviewUrl(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all" aria-label="关闭">
                     <X className="w-6 h-6" />
                   </button>
                 </div>
               )}

               <StocktakeListModal
                 open={stocktakeListModalOpen}
                 onClose={() => setStocktakeListModalOpen(false)}
                 stocktakeOrdersGrouped={stocktakeOrdersGrouped}
                 warehouseMapPSI={warehouseMapPSI}
                 productMapPSI={productMapPSI}
                 dictionaries={dictionaries}
                 hasPsiPerm={hasPsiPerm}
                 onDeleteRecords={onDeleteRecords}
                 onCreateNew={handleCreateStocktake}
                 onEditStocktake={handleEditStocktake}
                 getUnitName={getUnitName}
               />
               <TransferListModal
                 open={transferListModalOpen}
                 onClose={() => setTransferListModalOpen(false)}
                 transferOrdersGrouped={transferOrdersGrouped}
                 warehouseMapPSI={warehouseMapPSI}
                 productMapPSI={productMapPSI}
                 hasPsiPerm={hasPsiPerm}
                 onDeleteRecords={onDeleteRecords}
                 onCreateNew={handleCreateTransfer}
                 onEditTransfer={handleEditTransfer}
                 getUnitName={getUnitName}
               />
               <TransferOrderModal
                 open={transferModalOpen}
                 onClose={() => { setTransferModalOpen(false); setEditingTransferDocNumber(null); }}
                 editingDocNumber={editingTransferDocNumber}
                 transferForm={transferForm}
                 setTransferForm={setTransferForm}
                 transferItems={transferItems}
                 addTransferItem={addTransferItem}
                 updateTransferItem={updateTransferItem}
                 updateTransferVariantQty={updateTransferVariantQty}
                 removeTransferItem={removeTransferItem}
                 handleSaveTransfer={handleSaveTransfer}
                 warehouses={warehouses}
                 products={products}
                 categories={categories}
                 productMapPSI={productMapPSI}
                 dictionaries={dictionaries}
                 getUnitName={getUnitName}
                 formatQtyDisplay={formatQtyDisplay}
               />
               <StocktakeOrderModal
                 open={stocktakeModalOpen}
                 onClose={() => { setStocktakeModalOpen(false); setEditingStocktakeDocNumber(null); }}
                 editingDocNumber={editingStocktakeDocNumber}
                 stocktakeForm={stocktakeForm}
                 setStocktakeForm={setStocktakeForm}
                 stocktakeItems={stocktakeItems}
                 addStocktakeItem={addStocktakeItem}
                 updateStocktakeItem={updateStocktakeItem}
                 updateStocktakeVariantQty={updateStocktakeVariantQty}
                 removeStocktakeItem={removeStocktakeItem}
                 handleSaveStocktake={handleSaveStocktake}
                 warehouses={warehouses}
                 products={products}
                 categories={categories}
                 productMapPSI={productMapPSI}
                 dictionaries={dictionaries}
                 getUnitName={getUnitName}
                 formatQtyDisplay={formatQtyDisplay}
                 getVariantDisplayQty={getVariantDisplayQty}
                 getStock={getStock}
               />
               <WarehouseFlowModal
                 open={warehouseFlowModalOpen}
                 onClose={() => { setWarehouseFlowModalOpen(false); setWarehouseFlowDetailKey(null); setWarehouseFlowDetailExtra(null); }}
                 products={products}
                 warehouses={warehouses}
                 orders={ordersList}
                 onViewDetail={(key, extra) => {
                   setWarehouseFlowDetailExtra(extra);
                   setWarehouseFlowDetailKey(key);
                 }}
               />
               {productFlowDetail && (
                 <ProductFlowDetailModal
                   productFlowDetail={productFlowDetail}
                   onClose={() => { setProductFlowDetail(null); setWarehouseFlowDetailKey(null); }}
                   warehouseFlowRows={warehouseFlowRows}
                   warehouses={warehouses}
                   parseRecordTime={parseRecordTime}
                   onViewDetail={setWarehouseFlowDetailKey}
                 />
               )}
               {(warehouseFlowModalOpen || productFlowDetail) && warehouseFlowDetailKey && (
                 <WarehouseFlowDocumentDetailModal
                   warehouseFlowDetailKey={warehouseFlowDetailKey}
                   onClose={() => { setWarehouseFlowDetailKey(null); setWarehouseFlowDetailExtra(null); }}
                   recordsList={warehouseFlowDetailExtra?.psiRecords ?? recordsList}
                   prodRecords={warehouseFlowDetailExtra?.prodRecords ?? prodRecords}
                   ordersList={ordersList}
                   productMapPSI={productMapPSI}
                   warehouseMapPSI={warehouseMapPSI}
                   categoryMapPSI={categoryMapPSI}
                   dictionaries={dictionaries}
                   getUnitName={getUnitName}
                 />
               )}
           </>
        </div>
  );
};

export default React.memo(WarehousePanel);
