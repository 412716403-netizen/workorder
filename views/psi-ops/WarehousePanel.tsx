import React, { useState, useMemo } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import {
  Plus,
  X,
  Package,
  ChevronRight,
  ChevronDown,
  MoveRight,
  Search,
  Filter,
  Layers,
  FileText,
  ClipboardList,
  ArrowLeft,
  Save,
  Trash2,
  Pencil,
  ScrollText,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { Product, Warehouse, ProductCategory, Partner, AppDictionaries, ProductVariant } from '../../types';
import { sortedVariantColorEntries, sortedColorEntries } from '../../utils/sortVariantsByProduct';
import { useProgressiveList } from '../../hooks/useProgressiveList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useConfirm } from '../../contexts/ConfirmContext';

interface WarehouseProps {
  products: Product[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  partners: Partner[];
  dictionaries: AppDictionaries;
  records: any[];
  prodRecords: any[];
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
  prodRecords,
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
  const confirm = useConfirm();
  const recordsList = records ?? [];
  const ordersList = orders ?? [];

  const hasPsiPerm = (perm: string): boolean => {
    if (tenantRole === 'owner') return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('psi') && !userPermissions.some(p => p.startsWith('psi:'))) return true;
    if (userPermissions.includes(perm)) return true;
    if (userPermissions.some(p => p.startsWith(`${perm}:`))) return true;
    return false;
  };

  // ── 仓库管理子视图状态 ──
  const [inventoryViewMode, setInventoryViewMode] = useState<'warehouse' | 'product'>('warehouse');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [expandedWarehouseProductKeys, setExpandedWarehouseProductKeys] = useState<Set<string>>(new Set());
  const [expandedProductIdByMaterial, setExpandedProductIdByMaterial] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [warehouseFlowModalOpen, setWarehouseFlowModalOpen] = useState(false);
  const [warehouseFlowDetailKey, setWarehouseFlowDetailKey] = useState<string | null>(null);
  const [whFlowDateFrom, setWhFlowDateFrom] = useState('');
  const [whFlowDateTo, setWhFlowDateTo] = useState('');
  const [whFlowType, setWhFlowType] = useState<string>('all');
  const [whFlowWarehouse, setWhFlowWarehouse] = useState<string>('all');
  const [whFlowDocNo, setWhFlowDocNo] = useState('');
  const [whFlowProduct, setWhFlowProduct] = useState('');
  const [productFlowDetail, setProductFlowDetail] = useState<{ productId: string; productName: string; warehouseId: string | null; warehouseName: string | null } | null>(null);
  const [productFlowDateFrom, setProductFlowDateFrom] = useState('');
  const [productFlowDateTo, setProductFlowDateTo] = useState('');
  const [productFlowType, setProductFlowType] = useState<string>('all');
  const [productFlowWarehouseId, setProductFlowWarehouseId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<{ fromWarehouseId: string; toWarehouseId: string; transferDate: string; note: string }>({
    fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().split('T')[0], note: ''
  });
  const [transferItems, setTransferItems] = useState<{ id: string; productId: string; quantity?: number; variantQuantities?: Record<string, number> }[]>([]);
  const [editingTransferDocNumber, setEditingTransferDocNumber] = useState<string | null>(null);
  const [transferListModalOpen, setTransferListModalOpen] = useState(false);
  const [transferDetailDocNumber, setTransferDetailDocNumber] = useState<string | null>(null);
  const [stocktakeListModalOpen, setStocktakeListModalOpen] = useState(false);
  const [stocktakeDetailDocNumber, setStocktakeDetailDocNumber] = useState<string | null>(null);
  const [stocktakeModalOpen, setStocktakeModalOpen] = useState(false);
  const [stocktakeForm, setStocktakeForm] = useState<{ warehouseId: string; stocktakeDate: string; note: string }>({
    warehouseId: '', stocktakeDate: new Date().toISOString().split('T')[0], note: ''
  });
  const [stocktakeItems, setStocktakeItems] = useState<{ id: string; productId: string; quantity?: number; variantQuantities?: Record<string, number> }[]>([]);
  const [editingStocktakeDocNumber, setEditingStocktakeDocNumber] = useState<string | null>(null);

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
  const addTransferItem = () => setTransferItems(prev => [...prev, { id: `tr-line-${Date.now()}`, productId: '', quantity: 0 }]);
  const updateTransferItem = (id: string, updates: Partial<{ productId: string; quantity?: number; variantQuantities?: Record<string, number> }>) => {
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
  const addStocktakeItem = () => setStocktakeItems(prev => [...prev, { id: `st-line-${Date.now()}`, productId: '', quantity: 0 }]);
  const updateStocktakeItem = (id: string, updates: Partial<{ productId: string; quantity?: number; variantQuantities?: Record<string, number> }>) => {
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
    const docNumber = editingTransferDocNumber || generateTRDocNumber();
    const timestamp = editingTransferDocNumber
      ? (recordsList.find((r: any) => r.type === 'TRANSFER' && r.docNumber === editingTransferDocNumber)?.timestamp ?? new Date().toLocaleString())
      : new Date().toLocaleString();
    const createdAt = transferForm.transferDate || new Date().toISOString().split('T')[0];
    const newRecords: any[] = [];
    let trIdx = 0;
    transferItems.forEach((item) => {
      if (!item.productId) return;
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
    setTransferForm({ fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().split('T')[0], note: '' });
    setTransferItems([]);
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
    const docNumber = editingStocktakeDocNumber || generateSTDocNumber();
    const timestamp = editingStocktakeDocNumber
      ? (recordsList.find((r: any) => r.type === 'STOCKTAKE' && r.docNumber === editingStocktakeDocNumber)?.timestamp ?? new Date().toLocaleString())
      : new Date().toLocaleString();
    const createdAt = stocktakeForm.stocktakeDate || new Date().toISOString().split('T')[0];
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
        const sysQtyAtSave = getStock(item.productId, warehouseId, editingStocktakeDocNumber ?? undefined);
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
        });
      }
    });
    const originalDocNumber = editingStocktakeDocNumber ?? undefined;
    const byProductId = new Map<string, number>();
    newRecords.forEach(r => { byProductId.set(r.productId, (byProductId.get(r.productId) ?? 0) + (r.quantity ?? 0)); });
    const firstRecordIndexByProductId = new Map<string, number>();
    newRecords.forEach((r, idx) => {
      if (!firstRecordIndexByProductId.has(r.productId)) firstRecordIndexByProductId.set(r.productId, idx);
    });
    byProductId.forEach((actualTotal, productId) => {
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
    setStocktakeForm({ warehouseId: '', stocktakeDate: new Date().toISOString().split('T')[0], note: '' });
    setStocktakeItems([]);
  };

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
      return { ...p, total, distribution, categoryName: category?.name || '未分类', variantBreakdown };
    });
    if (!debouncedSearchTerm.trim()) return allStocks;
    const term = debouncedSearchTerm.toLowerCase();
    return allStocks.filter(ps => ps.name.toLowerCase().includes(term) || ps.sku.toLowerCase().includes(term) || ps.categoryName.toLowerCase().includes(term));
  }, [products, warehouses, recordsList, categories, debouncedSearchTerm, getVariantDisplayQty, dictionaries, getStock, categoryMapPSI]);

  const nonZeroStocks = useMemo(() => filteredProductStocks.filter(p => p.total !== 0), [filteredProductStocks]);
  const pStocks = useProgressiveList(nonZeroStocks);

  // ── 仓库流水 ──
  const WAREHOUSE_FLOW_TYPES = ['PURCHASE_BILL', 'SALES_BILL', 'TRANSFER', 'STOCKTAKE', 'STOCK_IN', 'STOCK_RETURN', 'STOCK_OUT'] as const;
  const warehouseFlowTypeLabel: Record<string, string> = { PURCHASE_BILL: '采购入库', SALES_BILL: '销售出库', SALES_RETURN: '销售退货', TRANSFER: '调拨', STOCKTAKE: '盘点', STOCK_IN: '生产入库', STOCK_RETURN: '生产退料', STOCK_OUT: '领料发出' };
  const formatFlowDateTime = (ts: string) => {
    if (!ts || !ts.toString().trim()) return '—';
    const d = new Date(ts.toString());
    if (isNaN(d.getTime())) return ts.toString();
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0 || (ts.toString().length > 10 && /[T\s]/.test(ts.toString()));
    return hasTime ? d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : d.toLocaleDateString('zh-CN');
  };
  const toFlowDateStr = (ts: string) => {
    if (!ts || !ts.toString().trim()) return '';
    const d = new Date(ts.toString());
    if (isNaN(d.getTime())) return ts.toString().slice(0, 10);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const warehouseFlowRows = useMemo(() => {
    const list = recordsList.filter(r => WAREHOUSE_FLOW_TYPES.includes(r.type as any)) as any[];
    const psiRows = list.map(r => {
      const product = productMapPSI.get(r.productId);
      const dateStr = toFlowDateStr((r.createdAt || r.timestamp || '').toString()) || (r.createdAt || r.timestamp || '').toString().slice(0, 10);
      const dateOnly = dateStr;
      const displayDate = dateOnly || (r.timestamp || '—');
      const displayDateTime = formatFlowDateTime(r.timestamp || r.createdAt || '');
      const inboundWarehouseId = r.type === 'TRANSFER' ? r.toWarehouseId : r.warehouseId;
      const outboundWarehouseId = r.type === 'TRANSFER' ? r.fromWarehouseId : (r.type === 'SALES_BILL' ? r.warehouseId : undefined);
      const warehouseName = r.type === 'SALES_BILL'
        ? (warehouseMapPSI.get(r.warehouseId)?.name ?? '—')
        : (r.type === 'TRANSFER'
          ? (r.toWarehouseId ? warehouseMapPSI.get(r.toWarehouseId)?.name ?? '—' : '—')
          : (warehouseMapPSI.get(r.warehouseId)?.name ?? '—'));
      const qty = r.quantity ?? 0;
      const isSalesReturn = r.type === 'SALES_BILL' && qty < 0;
      return {
        id: r.id,
        type: r.type,
        typeLabel: isSalesReturn ? '销售退货' : (warehouseFlowTypeLabel[r.type] || r.type),
        docNumber: r.docNumber || '—',
        dateStr: displayDate,
        displayDateTime: displayDateTime,
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: qty,
        warehouseId: inboundWarehouseId || r.warehouseId,
        warehouseName,
        isOutbound: r.type === 'SALES_BILL',
        partner: r.partner ?? '—',
        record: r
      };
    });
    const stockInList = (prodRecords || []).filter((r: any) => r.type === 'STOCK_IN') as any[];
    const stockInRows = stockInList.map(r => {
      const product = productMapPSI.get(r.productId);
      const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
      const dateStr = toFlowDateStr((r.timestamp || '').toString()) || (r.timestamp || '').toString().slice(0, 10);
      const displayDate = dateStr || '—';
      const docNumber = r.docNo || (order?.orderNumber ? `工单入库-${order.orderNumber}` : `SI-${r.id}`);
      return {
        id: r.id,
        type: 'STOCK_IN',
        typeLabel: '生产入库',
        docNumber,
        dateStr: displayDate,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: warehouseMapPSI.get(r.warehouseId)?.name ?? '—',
        isOutbound: false,
        partner: '—',
        record: r
      };
    });
    const stockReturnList = (prodRecords || []).filter((r: any) => r.type === 'STOCK_RETURN') as any[];
    const stockReturnRows = stockReturnList.map(r => {
      const product = productMapPSI.get(r.productId);
      const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
      const dateStr = toFlowDateStr((r.timestamp || '').toString()) || (r.timestamp || '').toString().slice(0, 10);
      const displayDate = dateStr || '—';
      const docNumber = r.docNo || (order?.orderNumber ? `退料-${order.orderNumber}` : `TR-${r.id}`);
      return {
        id: r.id,
        type: 'STOCK_RETURN',
        typeLabel: '生产退料',
        docNumber,
        dateStr: displayDate,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: warehouseMapPSI.get(r.warehouseId)?.name ?? '—',
        isOutbound: false,
        partner: '—',
        record: r
      };
    });
    const stockOutList = (prodRecords || []).filter((r: any) => r.type === 'STOCK_OUT') as any[];
    const stockOutRows = stockOutList.map(r => {
      const product = productMapPSI.get(r.productId);
      const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
      const dateStr = toFlowDateStr((r.timestamp || '').toString()) || (r.timestamp || '').toString().slice(0, 10);
      const displayDate = dateStr || '—';
      const docNumber = r.docNo || (order?.orderNumber ? `领料-${order.orderNumber}` : `LO-${r.id}`);
      return {
        id: r.id,
        type: 'STOCK_OUT',
        typeLabel: '领料发出',
        docNumber,
        dateStr: displayDate,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: warehouseMapPSI.get(r.warehouseId)?.name ?? '—',
        isOutbound: true,
        partner: '—',
        record: r
      };
    });
    const allRows = [...psiRows, ...stockInRows, ...stockReturnRows, ...stockOutRows];
    const byKey = new Map<string, { row: typeof allRows[0]; totalQty: number; maxTs: number }>();
    allRows.forEach(r => {
      const key = `${r.type}|${r.docNumber}|${r.productId}`;
      const ts = parseRecordTime(r.record);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { row: r, totalQty: r.quantity, maxTs: ts });
      } else {
        existing.totalQty += r.quantity;
        if (ts > existing.maxTs) { existing.maxTs = ts; existing.row = r; }
      }
    });
    return Array.from(byKey.entries())
      .map(([key, { row, totalQty, maxTs }]) => ({ ...row, id: key, quantity: totalQty, _sortTs: maxTs }))
      .sort((a, b) => (b as any)._sortTs - (a as any)._sortTs);
  }, [recordsList, prodRecords, products, warehouses, ordersList, parseRecordTime, productMapPSI, warehouseMapPSI]);

  const filteredWarehouseFlowRows = useMemo(() => {
    let rows = warehouseFlowRows;
    if (whFlowDateFrom) rows = rows.filter(r => r.dateStr >= whFlowDateFrom);
    if (whFlowDateTo) rows = rows.filter(r => r.dateStr <= whFlowDateTo);
    if (whFlowType !== 'all') {
      if (whFlowType === 'SALES_RETURN') rows = rows.filter(r => r.type === 'SALES_BILL' && r.quantity < 0);
      else if (whFlowType === 'SALES_BILL') rows = rows.filter(r => r.type === 'SALES_BILL' && r.quantity >= 0);
      else rows = rows.filter(r => r.type === whFlowType);
    }
    if (whFlowWarehouse !== 'all') {
      rows = rows.filter(r => (r.warehouseId || '') === whFlowWarehouse);
    }
    if (whFlowDocNo.trim()) {
      const t = whFlowDocNo.trim().toLowerCase();
      rows = rows.filter(r => (r.docNumber || '').toLowerCase().includes(t));
    }
    if (whFlowProduct.trim()) {
      const t = whFlowProduct.trim().toLowerCase();
      rows = rows.filter(r => r.productName.toLowerCase().includes(t) || r.productSku.toLowerCase().includes(t));
    }
    return rows;
  }, [warehouseFlowRows, whFlowDateFrom, whFlowDateTo, whFlowType, whFlowWarehouse, whFlowDocNo, whFlowProduct]);

  // ── 产品流水详情 ──
  const productFlowDetailRows = useMemo(() => {
    if (!productFlowDetail) return [];
    const pid = productFlowDetail.productId;
    const whId = productFlowDetail.warehouseId;
    let rows = warehouseFlowRows.filter((r: any) => r.productId === pid);
    if (whId) {
      rows = rows.filter((r: any) => {
        const rec = r.record;
        if (rec.type === 'TRANSFER') return rec.toWarehouseId === whId || rec.fromWarehouseId === whId;
        if (rec.type === 'SALES_BILL') return rec.warehouseId === whId;
        return (r.warehouseId || rec.warehouseId) === whId;
      });
    }
    return rows.sort((a: any, b: any) => parseRecordTime(b.record) - parseRecordTime(a.record));
  }, [warehouseFlowRows, productFlowDetail, parseRecordTime]);

  const productFlowFilteredRows = useMemo(() => {
    let rows = productFlowDetailRows;
    if (productFlowDateFrom) rows = rows.filter((r: any) => (r.dateStr || '') >= productFlowDateFrom);
    if (productFlowDateTo) rows = rows.filter((r: any) => (r.dateStr || '') <= productFlowDateTo);
    if (productFlowType !== 'all') {
      if (productFlowType === 'SALES_RETURN') rows = rows.filter((r: any) => r.type === 'SALES_BILL' && r.quantity < 0);
      else rows = rows.filter((r: any) => r.type === productFlowType);
    }
    if (productFlowWarehouseId !== 'all') rows = rows.filter((r: any) => (r.warehouseId || '') === productFlowWarehouseId);
    return rows;
  }, [productFlowDetailRows, productFlowDateFrom, productFlowDateTo, productFlowType, productFlowWarehouseId]);

  const productFlowTotalQuantity = useMemo(() => productFlowFilteredRows.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0), [productFlowFilteredRows]);

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
          return { productId: ps.id, name: ps.name, sku: ps.sku, categoryName: ps.categoryName, qty: qtyForLine, imageUrl: ps.imageUrl, variantBreakdown };
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
                 onClick={() => { setStocktakeListModalOpen(true); setStocktakeDetailDocNumber(null); }}
                 className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold transition-all hover:bg-indigo-50"
               >
                 <ClipboardList className="w-4 h-4" /> 盘点单
               </button>
               )}
               {hasPsiPerm('psi:warehouse_transfer:view') && (
               <button
                 type="button"
                 onClick={() => { setTransferListModalOpen(true); setTransferDetailDocNumber(null); }}
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
                                             {hasVariants ? (
                                               <button type="button" onClick={() => setExpandedWarehouseProductKeys(prev => { const next = new Set(prev); if (next.has(expandKey)) next.delete(expandKey); else next.add(expandKey); return next; })} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                                                 {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                               </button>
                                             ) : null}
                                           </td>
                                           <td className="px-4 py-3">
                                             {line.imageUrl ? (
                                               <button type="button" onClick={() => setImagePreviewUrl(line.imageUrl!)} className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:opacity-90 transition-opacity">
                                                 <img src={line.imageUrl} alt={line.name} className="w-full h-full object-cover block" />
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
                                             <span className={`text-sm font-black ${line.qty < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>{line.qty.toLocaleString()}</span>
                                             <span className="text-[10px] text-slate-400 ml-1">{line.productId ? getUnitName(line.productId) : 'PCS'}</span>
                                           </td>
                                           <td className="px-4 py-3 text-right">
                                             <button type="button" onClick={() => setProductFlowDetail({ productId: line.productId, productName: line.name, warehouseId: whRow.warehouseId, warehouseName: whRow.warehouseName })} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                               <FileText className="w-3.5 h-3.5" /> 详情
                                             </button>
                                           </td>
                                         </tr>
                                        {hasVariants && isExpanded && (
                                          <tr>
                                            <td colSpan={6} className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                                              <div className="space-y-3 pl-4">
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
                                                 {(() => {
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
                            return (
                              <React.Fragment key={ps.id}>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-2 py-3 w-10">
                                    {hasVariants ? (
                                      <button type="button" onClick={() => setExpandedProductIdByMaterial(prev => prev === ps.id ? null : ps.id)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                      </button>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3">
                                    {ps.imageUrl ? (
                                      <button type="button" onClick={() => setImagePreviewUrl(ps.imageUrl!)} className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:opacity-90 transition-opacity">
                                        <img src={ps.imageUrl} alt={ps.name} className="w-full h-full object-cover block" />
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
                                        {qty !== 0 ? <span className={qty < 0 ? 'text-rose-600 font-bold' : ''}>{qty.toLocaleString()}</span> : '—'}
                                      </td>
                                    );
                                  })}
                                  <td className="px-4 py-3 text-right">
                                    <button type="button" onClick={() => setProductFlowDetail({ productId: ps.id, productName: ps.name, warehouseId: null, warehouseName: null })} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                      <FileText className="w-3.5 h-3.5" /> 详情
                                    </button>
                                  </td>
                                </tr>
                                {hasVariants && isExpanded && (
                                  <tr>
                                    <td colSpan={colSpan} className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                                      <div className="space-y-3 pl-4">
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

               {stocktakeListModalOpen && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStocktakeListModalOpen(false); setStocktakeDetailDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-3xl max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div className="flex items-center gap-3">
                         {stocktakeDetailDocNumber ? (
                           <button type="button" onClick={() => setStocktakeDetailDocNumber(null)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="返回列表"><ArrowLeft className="w-5 h-5" /></button>
                         ) : null}
                         <div>
                           <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><ClipboardList className="w-5 h-5 text-indigo-600" /> {stocktakeDetailDocNumber ? `盘点单详情 - ${stocktakeDetailDocNumber}` : '盘点单'}</h3>
                           <p className="text-xs text-slate-500 mt-0.5">{stocktakeDetailDocNumber ? '查看明细，可点击「编辑」修改' : '盘点单列表，可查看详情或新增'}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {!stocktakeDetailDocNumber && hasPsiPerm('psi:warehouse_stocktake:create') && (
                           <button type="button" onClick={() => { setEditingStocktakeDocNumber(null); setStocktakeForm({ warehouseId: '', stocktakeDate: new Date().toISOString().split('T')[0], note: '' }); setStocktakeItems([]); setStocktakeListModalOpen(false); setStocktakeModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                             <Plus className="w-4 h-4" /> 新增盘点单
                           </button>
                         )}
                         <button type="button" onClick={() => { setStocktakeListModalOpen(false); setStocktakeDetailDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {!stocktakeDetailDocNumber ? (
                         Object.keys(stocktakeOrdersGrouped).length === 0 ? (
                           <div className="py-16 text-center text-slate-500">
                             <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                             <p className="text-sm font-medium">暂无盘点单</p>
                             <p className="text-xs mt-1">点击「新增盘点单」创建第一张盘点单</p>
                           </div>
                         ) : (
                           <div className="space-y-3">
                             {Object.entries(stocktakeOrdersGrouped).map(([docNum, docItems]) => {
                               const first = docItems[0];
                               const totalQty = docItems.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                               const whName = warehouseMapPSI.get(first.warehouseId)?.name ?? '—';
                               return (
                                 <div key={docNum} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                   <div className="flex items-center gap-4">
                                     <span className="text-[10px] font-mono font-black text-indigo-600 uppercase tracking-wide">{docNum}</span>
                                     <span className="text-sm text-slate-600">{whName}</span>
                                     <span className="text-xs text-slate-400">{(first.createdAt || '').toString().slice(0, 10)}</span>
                                     <span className="text-sm font-bold text-slate-700">共 {totalQty} 件</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <button type="button" onClick={() => setStocktakeDetailDocNumber(docNum)} className="px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1">
                                       <FileText className="w-3.5 h-3.5" /> 查看详情
                                     </button>
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         )
                       ) : (
                         (() => {
                           const docItems = stocktakeOrdersGrouped[stocktakeDetailDocNumber];
                           if (!docItems || docItems.length === 0) return <p className="text-slate-500 py-8">未找到该盘点单</p>;
                           const first = docItems[0];
                           const whName = warehouseMapPSI.get(first.warehouseId)?.name ?? '—';
                           const byLineGroup = new Map<string, any[]>();
                           docItems.forEach((r: any) => {
                             const gid = r.lineGroupId ?? r.id;
                             if (!byLineGroup.has(gid)) byLineGroup.set(gid, []);
                             byLineGroup.get(gid)!.push(r);
                           });
                           const openStocktakeForEdit = () => {
                             setEditingStocktakeDocNumber(stocktakeDetailDocNumber);
                             setStocktakeForm({
                               warehouseId: first.warehouseId || '',
                               stocktakeDate: (first.createdAt || '').toString().slice(0, 10) || new Date().toISOString().split('T')[0],
                               note: first.note || ''
                             });
                             const groups: Record<string, any[]> = {};
                             docItems.forEach((item: any) => {
                               const gid = item.lineGroupId ?? item.id;
                               if (!groups[gid]) groups[gid] = [];
                               groups[gid].push(item);
                             });
                             setStocktakeItems(Object.entries(groups).map(([gid, grp]) => {
                               const firstItem = grp[0];
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
                                 ? { id: gid, productId: firstItem.productId, variantQuantities }
                                 : { id: gid, productId: firstItem.productId, quantity };
                             }));
                             setStocktakeListModalOpen(false);
                             setStocktakeDetailDocNumber(null);
                             setStocktakeModalOpen(true);
                           };
                           return (
                             <div className="space-y-4">
                               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">盘点仓库</span><span className="font-bold text-slate-800">{whName}</span></div>
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">盘点日期</span><span className="font-bold text-slate-800">{(first.createdAt || '').toString().slice(0, 10)}</span></div>
                                 {first.note && <div className="col-span-2"><span className="text-slate-400 block text-xs font-bold mb-0.5">备注</span><span className="text-slate-600">{first.note}</span></div>}
                               </div>
                               <div>
                                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">盘点明细</h4>
                                 <p className="text-xs text-slate-500 mb-2">「系统数量」= 本单保存时该产品在系统中的数量（盘前），「实盘数量」= 本单盘点录入的数量，便于了解从多少数量盘库到多少数量；有颜色尺码会展开各规格的当时系统数与实盘数。</p>
                                 <div className="border border-slate-200 rounded-xl overflow-hidden">
                                   <table className="w-full text-left text-sm">
                                     <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">系统数量（盘前）</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">实盘数量</th></tr></thead>
                                     <tbody>
                                       {Array.from(byLineGroup.entries()).map(([gid, grp]) => {
                                         const firstLine = grp[0];
                                         const product = productMapPSI.get(firstLine.productId);
                                         const whId = first.warehouseId;
                                         const qty = grp.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
                                         const hasVariants = (product?.variants?.length ?? 0) > 0;
                                         const hasSavedSysQty = grp.some((r: any) => typeof r.systemQuantity === 'number');
                                         const systemQtyAtStocktake = hasSavedSysQty
                                           ? grp.reduce((s: number, r: any) => s + (r.systemQuantity ?? 0), 0)
                                           : (() => { const diffQ = docItems.find((r: any) => r.productId === firstLine.productId)?.diffQuantity ?? 0; return qty - Number(diffQ); })();
                                         const stGroupedByColor: Record<string, ProductVariant[]> = {};
                                         if (product?.variants) {
                                           product.variants.forEach((v: ProductVariant) => {
                                             if (!stGroupedByColor[v.colorId]) stGroupedByColor[v.colorId] = [];
                                             stGroupedByColor[v.colorId].push(v);
                                           });
                                         }
                                         const variantQtyFromGrp = (variantId: string) => grp.reduce((s: number, r: any) => s + (r.variantId === variantId ? (r.quantity ?? 0) : 0), 0);
                                         const variantSysFromGrp = (variantId: string) => {
                                           const rec = grp.find((r: any) => (r.variantId || '') === variantId);
                                           return typeof rec?.systemQuantity === 'number' ? rec.systemQuantity : null;
                                         };
                                         return (
                                           <React.Fragment key={gid}>
                                             <tr className="border-b border-slate-100">
                                               <td className="px-4 py-3 font-bold text-slate-800">{product?.name ?? '—'} <span className="text-slate-400 font-normal text-xs">{product?.sku ?? ''}</span></td>
                                               <td className="px-4 py-3 text-right font-bold text-slate-600">{systemQtyAtStocktake} {product ? getUnitName(product.id) : 'PCS'}</td>
                                               <td className="px-4 py-3 text-right font-black text-indigo-600">{qty} {product ? getUnitName(product.id) : 'PCS'}</td>
                                             </tr>
                                             {hasVariants && whId && (
                                               <tr className="border-b border-slate-100 last:border-0 bg-slate-50/60">
                                                 <td colSpan={3} className="px-4 py-3">
                                                   <div className="space-y-3">
                                                     {sortedVariantColorEntries(stGroupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                                                       const color = dictionaries?.colors?.find(c => c.id === colorId);
                                                       return (
                                                         <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-slate-100">
                                                           <div className="flex items-center gap-2 w-28 shrink-0">
                                                             <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                                             <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                                           </div>
                                                           <div className="flex flex-wrap gap-4">
                                                             {colorVariants.map((v: ProductVariant) => {
                                                               const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                                               const actualV = variantQtyFromGrp(v.id);
                                                               const sysV = variantSysFromGrp(v.id) ?? actualV;
                                                               return (
                                                                 <div key={v.id} className="flex flex-col gap-0.5 w-24">
                                                                   <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                                                   <div className="flex items-center gap-2 text-xs">
                                                                     <span className="text-slate-500">系统 <span className="font-bold text-slate-600">{sysV}</span></span>
                                                                     <span className="text-slate-400">/</span>
                                                                     <span className="text-indigo-600 font-black">实盘 {actualV}</span>
                                                                   </div>
                                                                 </div>
                                                               );
                                                             })}
                                                           </div>
                                                         </div>
                                                       );
                                                     })}
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
                               </div>
                               <div className="flex justify-end items-center gap-3 pt-2">
                                 {onDeleteRecords && hasPsiPerm('psi:warehouse_stocktake:delete') && (
                                   <button type="button" onClick={() => { void confirm({ message: '确定要删除该盘点单吗？', danger: true }).then((ok) => { if (!ok) return; onDeleteRecords('STOCKTAKE', stocktakeDetailDocNumber); setStocktakeDetailDocNumber(null); setStocktakeListModalOpen(false); }); }} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all">
                                     <Trash2 className="w-4 h-4" /> 删除盘点单
                                   </button>
                                 )}
                                 {hasPsiPerm('psi:warehouse_stocktake:edit') && (
                                 <button type="button" onClick={openStocktakeForEdit} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                                   <Pencil className="w-4 h-4" /> 编辑盘点单
                                 </button>
                                 )}
                               </div>
                             </div>
                           );
                         })()
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {transferListModalOpen && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setTransferListModalOpen(false); setTransferDetailDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-3xl max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div className="flex items-center gap-3">
                         {transferDetailDocNumber ? (
                           <button type="button" onClick={() => setTransferDetailDocNumber(null)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="返回列表"><ArrowLeft className="w-5 h-5" /></button>
                         ) : null}
                         <div>
                           <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><MoveRight className="w-5 h-5 text-indigo-600" /> {transferDetailDocNumber ? `调拨单详情 - ${transferDetailDocNumber}` : '调拨单'}</h3>
                           <p className="text-xs text-slate-500 mt-0.5">{transferDetailDocNumber ? '查看明细，可点击「编辑」修改' : '调拨单列表，可查看详情或新建'}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {!transferDetailDocNumber && hasPsiPerm('psi:warehouse_transfer:create') && (
                           <button type="button" onClick={() => { setEditingTransferDocNumber(null); setTransferForm({ fromWarehouseId: '', toWarehouseId: '', transferDate: new Date().toISOString().split('T')[0], note: '' }); setTransferItems([]); setTransferListModalOpen(false); setTransferModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                             <Plus className="w-4 h-4" /> 新建调拨单
                           </button>
                         )}
                         <button type="button" onClick={() => { setTransferListModalOpen(false); setTransferDetailDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {!transferDetailDocNumber ? (
                         Object.keys(transferOrdersGrouped).length === 0 ? (
                           <div className="py-16 text-center text-slate-500">
                             <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                             <p className="text-sm font-medium">暂无调拨单</p>
                             <p className="text-xs mt-1">点击「新建调拨单」创建第一张调拨单</p>
                           </div>
                         ) : (
                           <div className="space-y-3">
                             {Object.entries(transferOrdersGrouped).map(([docNum, docItems]) => {
                               const first = docItems[0];
                               const totalQty = docItems.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                               const fromName = warehouseMapPSI.get(first.fromWarehouseId)?.name ?? '—';
                               const toName = warehouseMapPSI.get(first.toWarehouseId)?.name ?? '—';
                               return (
                                 <div key={docNum} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                   <div className="flex items-center gap-4">
                                     <span className="text-[10px] font-mono font-black text-indigo-600 uppercase tracking-wide">{docNum}</span>
                                     <span className="text-sm text-slate-600">{fromName} → {toName}</span>
                                     <span className="text-xs text-slate-400">{(first.createdAt || '').toString().slice(0, 10)}</span>
                                     <span className="text-sm font-bold text-slate-700">共 {totalQty} 件</span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <button type="button" onClick={() => setTransferDetailDocNumber(docNum)} className="px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1">
                                       <FileText className="w-3.5 h-3.5" /> 查看详情
                                     </button>
                                     {onDeleteRecords && hasPsiPerm('psi:warehouse_transfer:delete') && (
                                       <button type="button" onClick={() => { void confirm({ message: '确定要删除该调拨单吗？', danger: true }).then((ok) => { if (!ok) return; onDeleteRecords('TRANSFER', docNum); }); }} className="px-3 py-1.5 text-[11px] font-bold rounded-xl border border-slate-200 text-slate-500 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all flex items-center gap-1">
                                         <Trash2 className="w-3.5 h-3.5" /> 删除
                                       </button>
                                     )}
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         )
                       ) : (
                         (() => {
                           const docItems = transferOrdersGrouped[transferDetailDocNumber];
                           if (!docItems || docItems.length === 0) return <p className="text-slate-500 py-8">未找到该调拨单</p>;
                           const first = docItems[0];
                           const fromName = warehouseMapPSI.get(first.fromWarehouseId)?.name ?? '—';
                           const toName = warehouseMapPSI.get(first.toWarehouseId)?.name ?? '—';
                           const byLineGroup = new Map<string, any[]>();
                           docItems.forEach((r: any) => {
                             const gid = r.lineGroupId ?? r.id;
                             if (!byLineGroup.has(gid)) byLineGroup.set(gid, []);
                             byLineGroup.get(gid)!.push(r);
                           });
                           const openTransferForEdit = () => {
                             setEditingTransferDocNumber(transferDetailDocNumber);
                             setTransferForm({
                               fromWarehouseId: first.fromWarehouseId || '',
                               toWarehouseId: first.toWarehouseId || '',
                               transferDate: (first.createdAt || '').toString().slice(0, 10) || new Date().toISOString().split('T')[0],
                               note: first.note || ''
                             });
                             const groups: Record<string, any[]> = {};
                             docItems.forEach((item: any) => {
                               const gid = item.lineGroupId ?? item.id;
                               if (!groups[gid]) groups[gid] = [];
                               groups[gid].push(item);
                             });
                             setTransferItems(Object.entries(groups).map(([gid, grp]) => {
                               const firstItem = grp[0];
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
                                 ? { id: gid, productId: firstItem.productId, variantQuantities }
                                 : { id: gid, productId: firstItem.productId, quantity };
                             }));
                             setTransferListModalOpen(false);
                             setTransferDetailDocNumber(null);
                             setTransferModalOpen(true);
                           };
                           return (
                             <div className="space-y-4">
                               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">调出仓库</span><span className="font-bold text-slate-800">{fromName}</span></div>
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">调入仓库</span><span className="font-bold text-slate-800">{toName}</span></div>
                                 <div><span className="text-slate-400 block text-xs font-bold mb-0.5">调拨日期</span><span className="font-bold text-slate-800">{(first.createdAt || '').toString().slice(0, 10)}</span></div>
                                 {first.note && <div className="col-span-2"><span className="text-slate-400 block text-xs font-bold mb-0.5">备注</span><span className="text-slate-600">{first.note}</span></div>}
                               </div>
                               <div>
                                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">调拨明细</h4>
                                 <div className="border border-slate-200 rounded-xl overflow-hidden">
                                   <table className="w-full text-left text-sm">
                                     <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                                     <tbody>
                                       {Array.from(byLineGroup.entries()).map(([gid, grp]) => {
                                         const firstLine = grp[0];
                                         const product = productMapPSI.get(firstLine.productId);
                                         const qty = grp.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
                                         return (
                                           <tr key={gid} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3 font-bold text-slate-800">{product?.name ?? '—'} <span className="text-slate-400 font-normal text-xs">{product?.sku ?? ''}</span></td><td className="px-4 py-3 text-right font-black text-indigo-600">{qty} {product ? getUnitName(product.id) : 'PCS'}</td></tr>
                                         );
                                       })}
                                     </tbody>
                                   </table>
                                 </div>
                               </div>
                               {hasPsiPerm('psi:warehouse_transfer:edit') && (
                               <div className="flex justify-end pt-2">
                                 <button type="button" onClick={openTransferForEdit} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                                   <Pencil className="w-4 h-4" /> 编辑调拨单
                                 </button>
                               </div>
                               )}
                             </div>
                           );
                         })()
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {transferModalOpen && (
                 <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setTransferModalOpen(false); setEditingTransferDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div>
                         <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><MoveRight className="w-5 h-5 text-indigo-600" /> {editingTransferDocNumber ? '编辑调拨单' : '调拨单'}</h3>
                         <p className="text-xs text-slate-500 mt-0.5">{editingTransferDocNumber ? `单号：${editingTransferDocNumber}` : '选择调出/调入仓库并添加调拨产品'}</p>
                       </div>
                       <button type="button" onClick={() => { setTransferModalOpen(false); setEditingTransferDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="flex-1 overflow-auto p-4 space-y-4">
                       <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">单据信息</h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">调出仓库</label>
                             <select value={transferForm.fromWarehouseId} onChange={e => setTransferForm(f => ({ ...f, fromWarehouseId: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                               <option value="">请选择</option>
                               {warehouses.map(w => (
                                 <option key={w.id} value={w.id}>{w.name}</option>
                               ))}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">调入仓库</label>
                             <select value={transferForm.toWarehouseId} onChange={e => setTransferForm(f => ({ ...f, toWarehouseId: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                               <option value="">请选择</option>
                               {warehouses.map(w => (
                                 <option key={w.id} value={w.id}>{w.name}</option>
                               ))}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">调拨日期</label>
                             <input type="date" value={transferForm.transferDate} onChange={e => setTransferForm(f => ({ ...f, transferDate: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                           <div className="sm:col-span-2 lg:col-span-1">
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">备注</label>
                             <input type="text" value={transferForm.note} onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))} placeholder="选填" className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                         </div>
                       </div>
                       <div>
                         <div className="flex items-center justify-between mb-3">
                           <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> 调拨明细</h4>
                           <button type="button" onClick={addTransferItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                             <Plus className="w-4 h-4" /> 添加明细行
                           </button>
                         </div>
                         <div className="space-y-3">
                           {transferItems.map((line) => {
                             const trProd = productMapPSI.get(line.productId);
                             const trHasVariants = trProd?.variants && trProd.variants.length > 0;
                             const trLineQty = trHasVariants
                               ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                               : (line.quantity ?? 0);
                             const trGroupedByColor: Record<string, ProductVariant[]> = {};
                             if (trProd?.variants) {
                               trProd.variants.forEach(v => {
                                 if (!trGroupedByColor[v.colorId]) trGroupedByColor[v.colorId] = [];
                                 trGroupedByColor[v.colorId].push(v);
                               });
                             }
                             const isLineEmpty = !line.productId;
                             return (
                               <div key={line.id} className={`rounded-2xl border space-y-4 transition-all ${isLineEmpty ? 'bg-white border-slate-200 p-4 border-dashed' : 'bg-white border-slate-200 p-4 shadow-sm'}`}>
                                 <div className="flex flex-wrap items-end gap-3">
                                   <div className="flex-1 min-w-[200px] max-w-md space-y-1">
                                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{isLineEmpty ? '选择产品' : '产品'}</label>
                                     <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                                       const p = productMapPSI.get(id);
                                       const hv = p?.variants && p.variants.length > 0;
                                       updateTransferItem(line.id, { productId: id, quantity: hv ? undefined : 0, variantQuantities: hv ? {} : undefined });
                                     }} />
                                   </div>
                                   {trHasVariants && (
                                     <div className="w-24 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">总数</label>
                                       <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-indigo-50 rounded-xl border border-indigo-100">
                                         {formatQtyDisplay(trLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                                       </div>
                                     </div>
                                   )}
                                   {!trHasVariants && (
                                     <div className="w-28 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">数量</label>
                                       <div className="flex items-center gap-1.5">
                                         <input type="number" min={0} value={line.quantity ?? ''} onChange={e => updateTransferItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                         <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                                       </div>
                                     </div>
                                   )}
                                   <button type="button" onClick={() => removeTransferItem(line.id)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shrink-0" title="删除该行"><Trash2 className="w-5 h-5" /></button>
                                 </div>
                                 {trHasVariants && line.productId && (
                                   <div className="pt-3 border-t border-slate-100 space-y-3">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">颜色尺码数量</label>
                                     {sortedVariantColorEntries(trGroupedByColor, trProd?.colorIds, trProd?.sizeIds).map(([colorId, colorVariants]) => {
                                       const color = dictionaries.colors.find(c => c.id === colorId);
                                       return (
                                         <div key={colorId} className="flex flex-wrap items-center gap-4 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                                           <div className="flex items-center gap-2 w-28 shrink-0">
                                             <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                             <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                           </div>
                                           <div className="flex flex-wrap gap-3">
                                             {colorVariants.map(v => {
                                               const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                               return (
                                                 <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                                   <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                                   <input type="number" min={0} placeholder="0" value={line.variantQuantities?.[v.id] ?? ''} onChange={e => updateTransferVariantQty(line.id, v.id, parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
                                                 </div>
                                               );
                                             })}
                                           </div>
                                           <div className="ml-auto text-right shrink-0">
                                             <span className="text-[9px] font-bold text-slate-400">小计</span>
                                             <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                                           </div>
                                         </div>
                                       );
                                     })}
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                           {transferItems.length === 0 && (
                             <div className="py-14 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/50">
                               <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                               <p className="text-slate-500 text-sm font-medium">暂无明细，点击「添加明细行」添加调拨产品</p>
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                     <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
                       <div className="text-sm text-slate-600">
                         {transferItems.length > 0 && (() => {
                           const totalQty = transferItems.reduce((sum, i) => sum + (i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0)), 0);
                           const validLines = transferItems.filter(i => i.productId && ((i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0)) > 0)).length;
                           return <span>共 <strong className="text-indigo-600">{validLines}</strong> 种产品，合计 <strong className="text-indigo-600">{totalQty}</strong> 件</span>;
                         })()}
                       </div>
                       <button
                         type="button"
                         onClick={handleSaveTransfer}
                         disabled={
                           !transferForm.fromWarehouseId ||
                           !transferForm.toWarehouseId ||
                           transferForm.fromWarehouseId === transferForm.toWarehouseId ||
                           transferItems.length === 0 ||
                           !transferItems.some(i => {
                             if (!i.productId) return false;
                             const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                             return q > 0;
                           })
                         }
                         className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md"
                       >
                         <Save className="w-4 h-4" /> 保存调拨单
                       </button>
                     </div>
                   </div>
                 </div>
               )}

               {stocktakeModalOpen && (
                 <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStocktakeModalOpen(false); setEditingStocktakeDocNumber(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
                       <div>
                         <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><ClipboardList className="w-5 h-5 text-indigo-600" /> {editingStocktakeDocNumber ? '编辑盘点单' : '盘点单'}</h3>
                         <p className="text-xs text-slate-500 mt-0.5">{editingStocktakeDocNumber ? `单号：${editingStocktakeDocNumber}` : '选择盘点仓库并录入实盘数量'}</p>
                       </div>
                       <button type="button" onClick={() => { setStocktakeModalOpen(false); setEditingStocktakeDocNumber(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="flex-1 overflow-auto p-4 space-y-4">
                       <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">单据信息</h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">盘点仓库</label>
                             <select value={stocktakeForm.warehouseId} onChange={e => setStocktakeForm(f => ({ ...f, warehouseId: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                               <option value="">请选择</option>
                               {warehouses.map(w => (
                                 <option key={w.id} value={w.id}>{w.name}</option>
                               ))}
                             </select>
                           </div>
                           <div>
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">盘点日期</label>
                             <input type="date" value={stocktakeForm.stocktakeDate} onChange={e => setStocktakeForm(f => ({ ...f, stocktakeDate: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                           <div className="sm:col-span-2 lg:col-span-1">
                             <label className="text-[10px] font-bold text-slate-500 block mb-1.5">备注</label>
                             <input type="text" value={stocktakeForm.note} onChange={e => setStocktakeForm(f => ({ ...f, note: e.target.value }))} placeholder="选填" className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                           </div>
                         </div>
                       </div>
                       <div>
                         <div className="flex items-center justify-between mb-3">
                           <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> 盘点明细（可多产品）</h4>
                           <button type="button" onClick={addStocktakeItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                             <Plus className="w-4 h-4" /> 添加明细行
                           </button>
                         </div>
                         <p className="text-xs text-slate-500 mb-3">每行会显示当前「系统数量」供参考，录入实盘数量保存后将按差异调整库存。</p>
                         <div className="space-y-3">
                           {stocktakeItems.map((line) => {
                             const stProd = productMapPSI.get(line.productId);
                             const stHasVariants = stProd?.variants && stProd.variants.length > 0;
                             const stLineQty = stHasVariants
                               ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                               : (line.quantity ?? 0);
                             const stGroupedByColor: Record<string, ProductVariant[]> = {};
                             if (stProd?.variants) {
                               stProd.variants.forEach(v => {
                                 if (!stGroupedByColor[v.colorId]) stGroupedByColor[v.colorId] = [];
                                 stGroupedByColor[v.colorId].push(v);
                               });
                             }
                             const isLineEmpty = !line.productId;
                             const systemQtyForLine = line.productId && stocktakeForm.warehouseId
                               ? (stHasVariants && stProd?.variants
                                   ? stProd.variants.reduce((s, v) => s + getVariantDisplayQty(line.productId!, stocktakeForm.warehouseId!, v.id), 0)
                                   : getStock(line.productId, stocktakeForm.warehouseId, editingStocktakeDocNumber ?? undefined))
                               : null;
                             return (
                               <div key={line.id} className={`rounded-2xl border space-y-4 transition-all ${isLineEmpty ? 'bg-white border-slate-200 p-4 border-dashed' : 'bg-white border-slate-200 p-4 shadow-sm'}`}>
                                 <div className="flex flex-wrap items-end gap-3">
                                   <div className="flex-1 min-w-[200px] max-w-md space-y-1">
                                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{isLineEmpty ? '选择产品' : '产品'}</label>
                                     <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                                       const p = productMapPSI.get(id);
                                       const hv = p?.variants && p.variants.length > 0;
                                       updateStocktakeItem(line.id, { productId: id, quantity: hv ? undefined : 0, variantQuantities: hv ? {} : undefined });
                                     }} />
                                   </div>
                                   {line.productId && stocktakeForm.warehouseId && (
                                     <div className="w-28 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">系统数量</label>
                                       <div className="py-2.5 px-3 text-sm font-bold text-slate-600 bg-slate-50 rounded-xl border border-slate-200">
                                         {systemQtyForLine != null ? systemQtyForLine : '—'} {getUnitName(line.productId)}
                                       </div>
                                     </div>
                                   )}
                                   {stHasVariants && (
                                     <div className="w-24 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">总数</label>
                                       <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-indigo-50 rounded-xl border border-indigo-100">
                                         {formatQtyDisplay(stLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                                       </div>
                                     </div>
                                   )}
                                   {!stHasVariants && (
                                     <div className="w-28 space-y-1">
                                       <label className="text-[10px] font-bold text-slate-500 block">实盘数量</label>
                                       <div className="flex items-center gap-1.5">
                                         <input type="number" min={0} value={line.quantity ?? ''} onChange={e => updateStocktakeItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                         <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                                       </div>
                                     </div>
                                   )}
                                   <button type="button" onClick={() => removeStocktakeItem(line.id)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shrink-0" title="删除该行"><Trash2 className="w-5 h-5" /></button>
                                 </div>
                                 {stHasVariants && line.productId && (
                                   <div className="pt-3 border-t border-slate-100 space-y-3">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">颜色尺码（{stocktakeForm.warehouseId ? '系统数量供参考，请录入实盘数量' : '请先选择盘点仓库后可显示系统数量' }）</label>
                                     {sortedVariantColorEntries(stGroupedByColor, stProd?.colorIds, stProd?.sizeIds).map(([colorId, colorVariants]) => {
                                       const color = dictionaries.colors.find(c => c.id === colorId);
                                       return (
                                         <div key={colorId} className="flex flex-wrap items-center gap-4 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                                           <div className="flex items-center gap-2 w-28 shrink-0">
                                             <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                             <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                           </div>
                                           <div className="flex flex-wrap gap-3">
                                             {colorVariants.map(v => {
                                               const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                               const sysQtyV = stocktakeForm.warehouseId ? getVariantDisplayQty(line.productId, stocktakeForm.warehouseId, v.id) : null;
                                               return (
                                                 <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                                   <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                                   {sysQtyV != null && <span className="text-[9px] text-slate-500">系统 {sysQtyV}</span>}
                                                   <input type="number" min={0} placeholder="0" value={line.variantQuantities?.[v.id] ?? ''} onChange={e => updateStocktakeVariantQty(line.id, v.id, parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
                                                 </div>
                                               );
                                             })}
                                           </div>
                                           <div className="ml-auto text-right shrink-0">
                                             <span className="text-[9px] font-bold text-slate-400">小计</span>
                                             <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                                           </div>
                                         </div>
                                       );
                                     })}
                                   </div>
                                 )}
                               </div>
                             );
                           })}
                           {stocktakeItems.length === 0 && (
                             <div className="py-14 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/50">
                               <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                               <p className="text-slate-500 text-sm font-medium">暂无明细，点击「添加明细行」录入盘点数量</p>
                             </div>
                           )}
                         </div>
                         <div className="mt-6 flex justify-end">
                           <button
                             type="button"
                             onClick={handleSaveStocktake}
                             disabled={
                               !stocktakeForm.warehouseId ||
                               stocktakeItems.length === 0 ||
                               !stocktakeItems.some(i => {
                                 if (!i.productId) return false;
                                 const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                                 return q >= 0;
                               })
                             }
                             className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md"
                           >
                             <Save className="w-4 h-4" /> 保存盘点单
                           </button>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               )}

               {warehouseFlowModalOpen && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setWarehouseFlowModalOpen(false); setWarehouseFlowDetailKey(null); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 仓库流水</h3>
                       <button type="button" onClick={() => { setWarehouseFlowModalOpen(false); setWarehouseFlowDetailKey(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                       <div className="flex items-center gap-2 mb-3">
                         <Filter className="w-4 h-4 text-slate-500" />
                         <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                           <input type="date" value={whFlowDateFrom} onChange={e => setWhFlowDateFrom(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                           <input type="date" value={whFlowDateTo} onChange={e => setWhFlowDateTo(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                          <select value={whFlowType} onChange={e => setWhFlowType(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                            <option value="all">全部</option>
                            {WAREHOUSE_FLOW_TYPES.map(t => (
                              <option key={t} value={t}>{warehouseFlowTypeLabel[t]}</option>
                            ))}
                            <option value="SALES_RETURN">销售退货</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
                          <select value={whFlowWarehouse} onChange={e => setWhFlowWarehouse(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                            <option value="all">全部</option>
                            {warehouses.map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
                           <input type="text" value={whFlowDocNo} onChange={e => setWhFlowDocNo(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                           <input type="text" value={whFlowProduct} onChange={e => setWhFlowProduct(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                         </div>
                       </div>
                       <div className="mt-2 flex items-center gap-4">
                         <button type="button" onClick={() => { setWhFlowDateFrom(''); setWhFlowDateTo(''); setWhFlowType('all'); setWhFlowWarehouse('all'); setWhFlowDocNo(''); setWhFlowProduct(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                         <span className="text-xs text-slate-400">共 {filteredWarehouseFlowRows.length} 条</span>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {filteredWarehouseFlowRows.length === 0 ? (
                         <p className="text-slate-500 text-center py-12">暂无仓库流水记录</p>
                       ) : (
                         <div className="border border-slate-200 rounded-2xl overflow-hidden">
                           <TableVirtuoso
                             style={{ height: Math.min(filteredWarehouseFlowRows.length * 48 + 48, 520) }}
                             data={filteredWarehouseFlowRows}
                             fixedHeaderContent={() => (
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期时间</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                              </tr>
                             )}
                             itemContent={(_idx, row) => (
                               <>
                                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.displayDateTime ?? row.dateStr}</td>
                                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">{row.typeLabel}</span></td>
                                  <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNumber}</td>
                                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName}</td>
                                  <td className="px-4 py-3 font-bold text-slate-800">{row.productName} <span className="text-slate-400 font-normal text-[10px]">{row.productSku}</span></td>
                                  <td className="px-4 py-3 text-right font-black text-indigo-600">{row.quantity}</td>
                                  <td className="px-4 py-3">
                                     <button type="button" onClick={() => setWarehouseFlowDetailKey(`${row.type}|${row.docNumber}`)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                       <FileText className="w-3.5 h-3.5" /> 详情
                                     </button>
                                   </td>
                               </>
                             )}
                             components={{ Table: (props) => <table {...props} className="w-full text-left text-sm" />, TableRow: ({ item: _item, ...props }) => <tr {...props} className="border-b border-slate-100 hover:bg-slate-50/50" /> }}
                           />
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {productFlowDetail && (
                 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                   <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setProductFlowDetail(null); setWarehouseFlowDetailKey(null); setProductFlowDateFrom(''); setProductFlowDateTo(''); setProductFlowType('all'); setProductFlowWarehouseId('all'); }} aria-hidden />
                   <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                     <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                       <h3 className="font-bold text-slate-800 flex items-center gap-2">
                         <ScrollText className="w-5 h-5 text-indigo-600" />
                         仓库流水
                         {productFlowDetail.warehouseName ? ` - ${productFlowDetail.warehouseName} / ${productFlowDetail.productName}` : ` - ${productFlowDetail.productName}`}
                       </h3>
                       <button type="button" onClick={() => { setProductFlowDetail(null); setWarehouseFlowDetailKey(null); setProductFlowDateFrom(''); setProductFlowDateTo(''); setProductFlowType('all'); setProductFlowWarehouseId('all'); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                     </div>
                     <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                       <div className="flex items-center gap-2 mb-3">
                         <Filter className="w-4 h-4 text-slate-500" />
                         <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">开始时间</label>
                           <input
                             type="date"
                             value={productFlowDateFrom}
                             onChange={e => setProductFlowDateFrom(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                           />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">结束时间</label>
                           <input
                             type="date"
                             value={productFlowDateTo}
                             onChange={e => setProductFlowDateTo(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                           />
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                           <select
                             value={productFlowType}
                             onChange={e => setProductFlowType(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                           >
                             <option value="all">全部</option>
                             <option value="PURCHASE_BILL">采购入库</option>
                             <option value="SALES_BILL">销售出库</option>
                             <option value="SALES_RETURN">销售退货</option>
                             <option value="TRANSFER">调拨</option>
                             <option value="STOCKTAKE">盘点</option>
                             <option value="STOCK_IN">生产入库</option>
                             <option value="STOCK_RETURN">生产退料</option>
                             <option value="STOCK_OUT">领料发出</option>
                           </select>
                         </div>
                         <div>
                           <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
                           <select
                             value={productFlowWarehouseId}
                             onChange={e => setProductFlowWarehouseId(e.target.value)}
                             className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                           >
                             <option value="all">全部</option>
                             {warehouses.map(w => (
                               <option key={w.id} value={w.id}>{w.name}</option>
                             ))}
                           </select>
                         </div>
                       </div>
                       <div className="mt-2 flex items-center gap-4 flex-wrap">
                         <button
                           type="button"
                           onClick={() => { setProductFlowDateFrom(''); setProductFlowDateTo(''); setProductFlowType('all'); setProductFlowWarehouseId('all'); }}
                           className="text-xs font-bold text-slate-500 hover:text-slate-700"
                         >
                           清空筛选
                         </button>
                         <span className="text-xs text-slate-400">共 {productFlowFilteredRows.length} 条</span>
                         <span className="text-xs font-bold text-indigo-600">合计数量：{Math.round(productFlowTotalQuantity * 100) / 100}</span>
                       </div>
                     </div>
                     <div className="flex-1 overflow-auto p-4">
                       {productFlowDetailRows.length === 0 ? (
                         <p className="text-slate-500 text-center py-12">暂无该产品{productFlowDetail.warehouseName ? '在该仓库' : ''}的流水记录</p>
                       ) : productFlowFilteredRows.length === 0 ? (
                         <p className="text-slate-500 text-center py-12">无符合筛选条件的记录</p>
                       ) : (
                         <div className="border border-slate-200 rounded-2xl overflow-hidden">
                           <table className="w-full text-left text-sm">
                             <thead>
                               <tr className="bg-slate-50 border-b border-slate-200">
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期时间</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                               </tr>
                             </thead>
                             <tbody>
                               {productFlowFilteredRows.map((row: any) => (
                                 <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                   <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.displayDateTime ?? row.dateStr}</td>
                                   <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">{row.typeLabel}</span></td>
                                   <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNumber}</td>
                                   <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.warehouseName}</td>
                                   <td className="px-4 py-3 font-bold text-slate-800">{row.productName} <span className="text-slate-400 font-normal text-[10px]">{row.productSku}</span></td>
                                   <td className="px-4 py-3 text-right font-black text-indigo-600">{row.quantity}</td>
                                   <td className="px-4 py-3">
                                     <button type="button" onClick={() => setWarehouseFlowDetailKey(`${row.type}|${row.docNumber}`)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap">
                                       <FileText className="w-3.5 h-3.5" /> 详情
                                     </button>
                                   </td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               )}

               {(warehouseFlowModalOpen || productFlowDetail) && warehouseFlowDetailKey && (() => {
                 const [detailType, detailDocNo] = warehouseFlowDetailKey.split('|');
                 const isStockIn = detailType === 'STOCK_IN';
                 const isStockReturn = detailType === 'STOCK_RETURN';
                 const isStockOut = detailType === 'STOCK_OUT';
                 const docRecords = isStockIn
                   ? (prodRecords || []).filter((r: any) => {
                       if (r.type !== 'STOCK_IN') return false;
                       if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
                       if (detailDocNo.startsWith('工单入库-')) {
                         const wantOrderNum = detailDocNo.replace('工单入库-', '');
                         const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
                         return order?.orderNumber === wantOrderNum;
                       }
                       return false;
                     }) as any[]
                   : isStockReturn
                   ? (prodRecords || []).filter((r: any) => {
                       if (r.type !== 'STOCK_RETURN') return false;
                       if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
                       if (detailDocNo.startsWith('退料-')) {
                         const wantOrderNum = detailDocNo.replace('退料-', '');
                         const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
                         return order?.orderNumber === wantOrderNum;
                       }
                       return false;
                     }) as any[]
                   : isStockOut
                   ? (prodRecords || []).filter((r: any) => {
                       if (r.type !== 'STOCK_OUT') return false;
                       if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
                       if (detailDocNo.startsWith('领料-')) {
                         const wantOrderNum = detailDocNo.replace('领料-', '');
                         const order = ordersList.find((o: { id: string; orderNumber?: string }) => o.id === r.orderId);
                         return order?.orderNumber === wantOrderNum;
                       }
                       return false;
                     }) as any[]
                   : recordsList.filter((r: any) => r.type === detailType && (r.docNumber || '') === detailDocNo) as any[];
                 if (docRecords.length === 0) return null;
                 const first = docRecords[0];
                 const mainInfo = isStockIn
                   ? { docNumber: first.docNo || (ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ? `工单入库-${ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ?? '—' }
                   : isStockReturn
                   ? { docNumber: first.docNo || (ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ? `退料-${ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ?? '—' }
                   : isStockOut
                   ? { docNumber: first.docNo || (ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ? `领料-${ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o: { id: string; orderNumber?: string }) => o.id === first.orderId)?.orderNumber ?? '—' }
                   : { docNumber: first.docNumber || detailDocNo, createdAt: first.createdAt || first.timestamp || '—', partner: first.partner ?? '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.note ?? '—', fromWarehouseId: first.fromWarehouseId, toWarehouseId: first.toWarehouseId, orderNumber: '—' };
                 const detailLinesByProductVariant = new Map<string, { productId: string; variantId?: string; quantity: number; purchasePrice?: number; salesPrice?: number; record: any }>();
                 docRecords.forEach(r => {
                   const vId = r.variantId ?? '';
                   const key = `${r.productId}|${vId}`;
                   const existing = detailLinesByProductVariant.get(key);
                   const qty = r.quantity ?? 0;
                   const price = r.purchasePrice ?? r.salesPrice;
                   if (!existing) {
                     detailLinesByProductVariant.set(key, { productId: r.productId, variantId: vId || undefined, quantity: qty, purchasePrice: price, salesPrice: r.salesPrice, record: r });
                   } else {
                     existing.quantity += qty;
                   }
                 });
                 const detailLines = Array.from(detailLinesByProductVariant.values()).map(item => {
                   const product = productMapPSI.get(item.productId);
                   const category = categoryMapPSI.get(product?.categoryId);
                   const hasColorSize = category?.hasColorSize && (product?.variants?.length ?? 0) > 0;
                   let variantLabel = '';
                   if (item.variantId && product?.variants) {
                     const v = product.variants.find((vv: ProductVariant) => vv.id === item.variantId);
                     if (v) {
                       const colorName = (dictionaries.colors ?? []).find(c => c.id === v.colorId)?.name ?? '';
                       const sizeName = (dictionaries.sizes ?? []).find(s => s.id === v.sizeId)?.name ?? '';
                       variantLabel = [colorName, sizeName].filter(Boolean).join(' / ') || v.skuSuffix || item.variantId;
                     }
                   }
                   return {
                     ...item,
                     productName: product?.name ?? '—',
                     productSku: product?.sku ?? '—',
                     unitName: item.productId ? getUnitName(item.productId) : 'PCS',
                     hasColorSize: !!variantLabel,
                     variantLabel
                   };
                 });
                 return (
                   <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                     <div className="absolute inset-0 bg-slate-900/60" onClick={() => setWarehouseFlowDetailKey(null)} aria-hidden />
                     <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                       <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                         <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 单据详情 · {mainInfo.docNumber}</h3>
                         <button type="button" onClick={() => setWarehouseFlowDetailKey(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                       </div>
                       <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                           <div>
                             <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">单号</label>
                             <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{mainInfo.docNumber}</div>
                           </div>
                           <div>
                             <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">日期时间</label>
                             <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{formatFlowDateTime(mainInfo.createdAt)}</div>
                           </div>
                           <div>
                             <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">{detailType === 'SALES_BILL' ? '客户' : detailType === 'PURCHASE_BILL' ? '供应商' : detailType === 'TRANSFER' ? '调拨' : detailType === 'STOCKTAKE' ? '仓库' : detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT' ? '工单号' : '备注'}</label>
                             <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">
                               {detailType === 'TRANSFER' ? `${warehouseMapPSI.get(mainInfo.fromWarehouseId)?.name ?? '—'} → ${warehouseMapPSI.get(mainInfo.toWarehouseId)?.name ?? '—'}` : detailType === 'STOCKTAKE' ? mainInfo.warehouseName : detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT' ? (mainInfo as any).orderNumber : mainInfo.partner}
                             </div>
                           </div>
                           {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL' || detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT') && (
                             <div>
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">仓库</label>
                               <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{mainInfo.warehouseName}</div>
                             </div>
                           )}
                           {mainInfo.note && (
                             <div className="md:col-span-2">
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注</label>
                               <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white truncate" title={mainInfo.note}>{mainInfo.note}</div>
                             </div>
                           )}
                         </div>
                       </div>
                       <div className="flex-1 overflow-auto min-h-0 p-4">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">明细</h4>
                         <div className="border border-slate-200 rounded-xl overflow-hidden">
                           <table className="w-full text-left text-sm">
                             <thead>
                               <tr className="bg-slate-50 border-b border-slate-200">
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品 / SKU</th>
                                 {detailLines.some((l: any) => l.variantLabel) && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格（颜色/尺码）</th>}
                                 <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                 {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">单价</th>}
                                 {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>}
                               </tr>
                             </thead>
                             <tbody>
                               {detailLines.map((line, idx) => {
                                 const price = line.purchasePrice ?? line.salesPrice ?? 0;
                                 return (
                                   <tr key={`${line.productId}-${line.variantId ?? ''}-${idx}`} className="border-b border-slate-100">
                                     <td className="px-4 py-3"><span className="font-bold text-slate-800">{line.productName}</span> <span className="text-slate-400 text-[10px]">{line.productSku}</span></td>
                                     {detailLines.some((l: any) => l.variantLabel) && (
                                       <td className="px-4 py-3 text-slate-600">{line.variantLabel || '—'}</td>
                                     )}
                                     <td className="px-4 py-3 text-right font-bold text-indigo-600">{(line.quantity ?? 0)} {line.unitName}</td>
                                     {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && (
                                       <>
                                         <td className="px-4 py-3 text-right">¥{price.toFixed(2)}</td>
                                         <td className="px-4 py-3 text-right">¥{((line.quantity ?? 0) * price).toFixed(2)}</td>
                                       </>
                                     )}
                                   </tr>
                                 );
                               })}
                             </tbody>
                           </table>
                         </div>
                       </div>
                     </div>
                   </div>
                 );
               })()}
           </>
        </div>
  );
};

export default React.memo(WarehousePanel);
