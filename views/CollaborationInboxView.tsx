import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Package, Check, X, ArrowLeft, Truck, RotateCcw,
  Search, Building2, Layers, ChevronDown, ChevronRight, RefreshCw,
  Link2, Settings2, Trash2, Edit2, Save, Plus, UserPlus, Route, Forward, CheckCircle2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useConfirm } from '../contexts/ConfirmContext';
import * as api from '../services/api';
import { moduleHeaderRowClass, outlineToolbarButtonClass, pageSubtitleClass, pageTitleClass } from '../styles/uiDensity';
import type { Product, Partner, PartnerCategory, ProductionOpRecord, Warehouse, ProductionOrder, AppDictionaries, GlobalNodeTemplate, OutsourceRoute, OutsourceRouteStep } from '../types';
import { SearchablePartnerSelect } from '../components/SearchablePartnerSelect';

const COLLAB_RETURN_STOCK_OUT_OP = '协作回传出库';

interface CollaborationInboxViewProps {
  products: Product[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  orders: ProductionOrder[];
  prodRecords: ProductionOpRecord[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  nodeTemplates?: GlobalNodeTemplate[];
  onRefreshPartners: () => Promise<void>;
  onRefreshProducts?: () => Promise<void>;
  onRefreshOrders?: () => Promise<void>;
  onRefreshProdRecords?: () => Promise<void>;
  onRefreshPMP?: () => Promise<void>;
  tenantRole?: string;
  userPermissions?: string[];
}

type ViewMode = 'inbox' | 'detail' | 'maps' | 'settings' | 'routes';

/** 协作接受预填：去掉空白项，避免乙方出现无文字的颜色/尺码标签 */
function normalizeAcceptSpecList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const t = typeof x === 'string' ? x.trim() : String(x ?? '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function collabVariantKey(it: { colorName?: string | null; sizeName?: string | null }) {
  return JSON.stringify({ c: it.colorName ?? null, s: it.sizeName ?? null });
}

/** 用乙方产品变体 + 字典解析颜色/尺码名称（与甲方发出明细中的名称一致） */
function specNamesForVariant(
  product: Product | undefined,
  variantId: string,
  dict: AppDictionaries,
): { colorName: string | null; sizeName: string | null } {
  const variants = product?.variants as { id: string; colorId?: string | null; sizeId?: string | null }[] | undefined;
  if (!variants?.length) return { colorName: null, sizeName: null };
  const v = variantId
    ? variants.find(x => x.id === variantId)
    : variants.length === 1
      ? variants[0]
      : undefined;
  if (!v) return { colorName: null, sizeName: null };
  const colorName = v.colorId ? dict.colors.find(c => c.id === v.colorId)?.name ?? null : null;
  const sizeName = v.sizeId ? dict.sizes.find(s => s.id === v.sizeId)?.name ?? null : null;
  return { colorName, sizeName };
}

type CollabReturnRow = {
  colorName: string | null;
  sizeName: string | null;
  maxReturnable: number;
  qty: string;
};

/**
 * 可回传 = min(仓库库存, 发出明细剩余可回)，按颜色/尺码合并。
 * 使用发出明细中的颜色/尺码名称（与甲方一致），保证后端校验通过。
 */
function computeCollaborationReturnableRows(
  transfer: any,
  warehouseId: string | undefined,
  products: Product[],
  prodRecords: ProductionOpRecord[],
  dict: AppDictionaries,
  requireWarehouse: boolean,
): CollabReturnRow[] {
  if (!transfer) return [];
  if (requireWarehouse && !warehouseId) return [];

  // 1. 按发出明细统计各规格已发数量（使用甲方名称）
  const dispatchedBySpec = new Map<string, { colorName: string | null; sizeName: string | null; qty: number }>();
  for (const d of transfer.dispatches || []) {
    if (d.status !== 'ACCEPTED') continue;
    for (const it of d.payload?.items ?? []) {
      const k = collabVariantKey(it);
      const prev = dispatchedBySpec.get(k);
      const q = Number(it.quantity) || 0;
      if (prev) prev.qty += q;
      else dispatchedBySpec.set(k, { colorName: it.colorName ?? null, sizeName: it.sizeName ?? null, qty: q });
    }
  }

  // 2. 统计已回传数量
  const returnedBySpec = new Map<string, number>();
  for (const r of transfer.returns || []) {
    if (r.status === 'WITHDRAWN') continue;
    for (const it of r.payload?.items ?? []) {
      const k = collabVariantKey(it);
      returnedBySpec.set(k, (returnedBySpec.get(k) || 0) + (Number(it.quantity) || 0));
    }
  }

  // 3. 统计仓库库存
  const productId = transfer.receiverProductId;
  let stockBySpec = new Map<string, number>();
  let nullVariantStock = 0;
  if (productId) {
    const product = products.find(p => p.id === productId);
    const colorNameById = Object.fromEntries(dict.colors.map(c => [c.id, c.name]));
    const sizeNameById = Object.fromEntries(dict.sizes.map(s => [s.id, s.name]));
    const variantLabel = (vid: string) => {
      const v = product?.variants.find(x => x.id === vid);
      if (!v) return { colorName: null as string | null, sizeName: null as string | null };
      return {
        colorName: v.colorId ? (colorNameById[v.colorId] ?? null) : null,
        sizeName: v.sizeId ? (sizeNameById[v.sizeId] ?? null) : null,
      };
    };
    for (const r of prodRecords) {
      if (r.productId !== productId) continue;
      if (warehouseId && r.warehouseId !== warehouseId) continue;
      const vid = r.variantId || '';
      const qty = Number(r.quantity) || 0;
      const delta = (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') ? qty
        : r.type === 'STOCK_OUT' ? -qty
        : 0;
      if (delta === 0) continue;
      if (!vid) {
        nullVariantStock += delta;
      } else {
        const { colorName, sizeName } = variantLabel(vid);
        const k = collabVariantKey({ colorName, sizeName });
        stockBySpec.set(k, (stockBySpec.get(k) || 0) + delta);
      }
    }
  }
  const effectiveNullStock = Math.max(0, nullVariantStock);

  // 4. 可回 = min(发出剩余, 仓库库存)
  const rows: CollabReturnRow[] = [];
  for (const [k, { colorName, sizeName, qty: dispatched }] of dispatchedBySpec) {
    const returned = returnedBySpec.get(k) || 0;
    const remaining = dispatched - returned;
    if (remaining <= 0) continue;
    const variantStock = Math.max(0, stockBySpec.get(k) || 0);
    const stock = variantStock + effectiveNullStock;
    const maxReturnable = Math.min(remaining, stock);
    if (maxReturnable <= 0) continue;
    rows.push({ colorName, sizeName, maxReturnable, qty: '' });
  }
  rows.sort((a, b) => {
    const la = [a.colorName || '', a.sizeName || ''].join('\t');
    const lb = [b.colorName || '', b.sizeName || ''].join('\t');
    return la.localeCompare(lb, 'zh-CN');
  });
  return rows;
}

const CollaborationInboxView: React.FC<CollaborationInboxViewProps> = ({ products, partners, partnerCategories, orders, prodRecords, warehouses, dictionaries, nodeTemplates, onRefreshPartners, onRefreshProducts, onRefreshOrders, onRefreshProdRecords, onRefreshPMP, tenantRole, userPermissions }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  /** 对照表行：全局 products 未命中时按 id 拉取补全名称 */
  const [resolvedReceiverProducts, setResolvedReceiverProducts] = useState<Record<string, Product>>({});
  const mapsFetchedProductIdsRef = useRef<Set<string>>(new Set());
  const returnModalTransferRef = useRef<any>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);
  const [collabs, setCollabs] = useState<any[]>([]);

  // Accept wizard state
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptNewName, setAcceptNewName] = useState('');
  const [acceptNewSku, setAcceptNewSku] = useState('');
  const [acceptNewDesc, setAcceptNewDesc] = useState('');
  const [acceptNewColors, setAcceptNewColors] = useState<string[]>([]);
  const [acceptNewSizes, setAcceptNewSizes] = useState<string[]>([]);
  const [acceptDispatchIds, setAcceptDispatchIds] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);

  // Return state（按颜色/尺码行回传，与发出明细一致）
  type ReturnRow = { colorName: string | null; sizeName: string | null; maxReturnable: number; qty: string };
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([]);
  const [returnNote, setReturnNote] = useState('');
  const [returnWarehouseId, setReturnWarehouseId] = useState('');
  const [returning, setReturning] = useState(false);

  // Product maps state
  const [productMaps, setProductMaps] = useState<any[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);

  // Receive (A-side confirm) state
  const [receiving, setReceiving] = useState(false);

  // Settings: invite code + partner binding
  const [inviteCode, setInviteCode] = useState('');
  const [inviting, setInviting] = useState(false);
  const [bindPartnerId, setBindPartnerId] = useState('');
  const [bindCollabTenantId, setBindCollabTenantId] = useState('');
  const [binding, setBinding] = useState(false);

  // Role filter
  const [roleFilter, setRoleFilter] = useState<'all' | 'sender' | 'receiver'>('all');

  // Outsource routes state
  const [outsourceRoutes, setOutsourceRoutes] = useState<OutsourceRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeEditOpen, setRouteEditOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<OutsourceRoute | null>(null);
  const [routeName, setRouteName] = useState('');
  const [routeSteps, setRouteSteps] = useState<OutsourceRouteStep[]>([]);
  const [savingRoute, setSavingRoute] = useState(false);

  // Chain forward state
  const [forwarding, setForwarding] = useState(false);
  const [confirmingForward, setConfirmingForward] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardRows, setForwardRows] = useState<ReturnRow[]>([]);
  const [forwardNote, setForwardNote] = useState('');
  const [forwardWarehouseId, setForwardWarehouseId] = useState('');
  const forwardModalTransferRef = useRef<any>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (roleFilter !== 'all') params.role = roleFilter;
      const data = await api.collaboration.listTransfers(params);
      setTransfers(data);
    } catch (err: any) {
      toast.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const routesLoadedRef = useRef(false);
  const loadRoutes = useCallback(async (force = false) => {
    if (!force && routesLoadedRef.current && outsourceRoutes.length >= 0) return;
    setRoutesLoading(true);
    try {
      const data = await api.collaboration.listOutsourceRoutes();
      setOutsourceRoutes(data);
      routesLoadedRef.current = true;
    } catch (err: any) {
      toast.error(err.message || '加载路线失败');
    } finally {
      setRoutesLoading(false);
    }
  }, [outsourceRoutes.length]);

  const startEditRoute = (route?: OutsourceRoute) => {
    setEditingRoute(route ?? null);
    setRouteName(route?.name ?? '');
    setRouteSteps(route?.steps ?? []);
    setRouteEditOpen(true);
  };

  const addRouteStep = () => {
    setRouteSteps(prev => [...prev, { stepOrder: prev.length, nodeId: '', nodeName: '', receiverTenantId: '', receiverTenantName: '' }]);
  };

  const removeRouteStep = (idx: number) => {
    setRouteSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i })));
  };

  const updateRouteStep = (idx: number, patch: Partial<OutsourceRouteStep>) => {
    setRouteSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const saveRoute = async () => {
    if (!routeName.trim()) { toast.warning('请输入路线名称'); return; }
    if (routeSteps.length === 0) { toast.warning('请至少添加一个步骤'); return; }
    for (const s of routeSteps) {
      if (!s.receiverTenantId || !s.nodeId) { toast.warning('每一步须选择工序和协作企业'); return; }
    }
    setSavingRoute(true);
    try {
      const payload = { name: routeName.trim(), steps: routeSteps };
      if (editingRoute) {
        await api.collaboration.updateOutsourceRoute(editingRoute.id, payload);
        toast.success('路线已更新');
      } else {
        await api.collaboration.createOutsourceRoute(payload);
        toast.success('路线已创建');
      }
      setRouteEditOpen(false);
      loadRoutes(true);
    } catch (err: any) {
      toast.error(err.message || '保存失败');
    } finally {
      setSavingRoute(false);
    }
  };

  const deleteRoute = async (id: string) => {
    const ok = await confirm({ message: '确认删除该路线？', danger: true });
    if (!ok) return;
    try {
      await api.collaboration.deleteOutsourceRoute(id);
      toast.success('已删除');
      loadRoutes(true);
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const openForwardModal = (transfer: any) => {
    forwardModalTransferRef.current = transfer;
    setForwardNote('');
    setForwardWarehouseId(warehouses[0]?.id ?? '');
    setForwardOpen(true);
  };

  useEffect(() => {
    if (!forwardOpen) return;
    const transfer = forwardModalTransferRef.current;
    if (!transfer) return;
    const productId = transfer.receiverProductId;
    if (!productId) { setForwardRows([]); return; }

    const product = products.find(p => p.id === productId);
    const colorNameById = Object.fromEntries(dictionaries.colors.map(c => [c.id, c.name]));
    const sizeNameById = Object.fromEntries(dictionaries.sizes.map(s => [s.id, s.name]));
    const variantLabel = (vid: string) => {
      const v = product?.variants.find(x => x.id === vid);
      if (!v) return { colorName: null as string | null, sizeName: null as string | null };
      return {
        colorName: v.colorId ? (colorNameById[v.colorId] ?? null) : null,
        sizeName: v.sizeId ? (sizeNameById[v.sizeId] ?? null) : null,
      };
    };

    const stockByVariant = new Map<string, { colorName: string | null; sizeName: string | null; qty: number }>();
    let fwdNullVariantStock = 0;
    for (const r of prodRecords) {
      if (r.productId !== productId) continue;
      if (forwardWarehouseId && r.warehouseId !== forwardWarehouseId) continue;
      const vid = r.variantId || '';
      const qty = Number(r.quantity) || 0;
      const delta = (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') ? qty
        : r.type === 'STOCK_OUT' ? -qty
        : 0;
      if (delta === 0) continue;
      if (!vid) {
        fwdNullVariantStock += delta;
      } else {
        const { colorName, sizeName } = variantLabel(vid);
        const k = collabVariantKey({ colorName, sizeName });
        const prev = stockByVariant.get(k);
        if (prev) prev.qty += delta;
        else stockByVariant.set(k, { colorName, sizeName, qty: delta });
      }
    }

    const effNullStock = Math.max(0, fwdNullVariantStock);
    if (effNullStock > 0) {
      const pvariants = product?.variants || [];
      if (pvariants.length > 0) {
        for (const v of pvariants) {
          const cn = v.colorId ? (colorNameById[v.colorId] ?? null) : null;
          const sn = v.sizeId ? (sizeNameById[v.sizeId] ?? null) : null;
          const k = collabVariantKey({ colorName: cn, sizeName: sn });
          const prev = stockByVariant.get(k);
          if (prev) prev.qty += effNullStock;
          else stockByVariant.set(k, { colorName: cn, sizeName: sn, qty: effNullStock });
        }
      } else {
        const k = collabVariantKey({ colorName: null, sizeName: null });
        const prev = stockByVariant.get(k);
        if (prev) prev.qty += effNullStock;
        else stockByVariant.set(k, { colorName: null, sizeName: null, qty: effNullStock });
      }
    }

    const rows: CollabReturnRow[] = [];
    for (const [, { colorName, sizeName, qty }] of stockByVariant) {
      const stock = Math.max(0, qty);
      if (stock <= 0) continue;
      rows.push({ colorName, sizeName, maxReturnable: stock, qty: '' });
    }
    rows.sort((a, b) => {
      const la = [a.colorName || '', a.sizeName || ''].join('\t');
      const lb = [b.colorName || '', b.sizeName || ''].join('\t');
      return la.localeCompare(lb, 'zh-CN');
    });
    setForwardRows(rows);
  }, [forwardOpen, forwardWarehouseId, products, prodRecords, dictionaries]);

  const submitForward = async () => {
    const transfer = forwardModalTransferRef.current;
    if (!transfer) return;
    if (warehouses.length > 0 && !forwardWarehouseId) {
      toast.warning('请选择出库仓库');
      return;
    }
    if (forwardRows.length === 0) {
      toast.warning('所有规格已全部转发完毕，无剩余可转发数量');
      return;
    }
    for (const r of forwardRows) {
      const q = Number(r.qty) || 0;
      if (q > r.maxReturnable) {
        toast.error(`「${[r.colorName, r.sizeName].filter(Boolean).join('/') || '无规格'}」超过可转发上限 ${r.maxReturnable}`);
        return;
      }
    }
    const items = forwardRows
      .map(r => ({ colorName: r.colorName, sizeName: r.sizeName, quantity: Number(r.qty) || 0 }))
      .filter(i => i.quantity > 0);
    if (items.length === 0) {
      toast.warning('请至少填写一行转发数量');
      return;
    }
    setForwarding(true);
    try {
      const res = await api.collaboration.forwardTransfer(transfer.id, { items, note: forwardNote || undefined, warehouseId: forwardWarehouseId || undefined });
      toast.success(`已转发到下一站: ${res.nextStep?.receiverTenantName ?? ''}`);
      setForwardOpen(false);
      setForwardRows([]);
      setForwardNote('');
      setForwardWarehouseId('');
      refreshDetail();
      refresh();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '转发失败');
    } finally {
      setForwarding(false);
    }
  };

  const handleConfirmForward = async (transferId: string) => {
    const ok = await confirm({ message: '确认该转发？确认后将自动生成外协收回/发出流水和报工记录。' });
    if (!ok) return;
    setConfirmingForward(true);
    try {
      const res = await api.collaboration.confirmForward(transferId);
      toast.success(`已确认转发，收回单号: ${res.receiveDocNo}，发出单号: ${res.dispatchDocNo}`);
      refreshDetail();
      refresh();
      onRefreshProdRecords?.();
      onRefreshOrders?.();
      onRefreshPMP?.();
    } catch (err: any) {
      toast.error(err.message || '确认失败');
    } finally {
      setConfirmingForward(false);
    }
  };

  const [withdrawing, setWithdrawing] = useState(false);

  const handleWithdrawDispatch = async (dispatchId: string) => {
    const ok = await confirm({ message: '确认撤回该发出批次？撤回后对方将无法看到此批次。' });
    if (!ok) return;
    setWithdrawing(true);
    try {
      await api.collaboration.withdrawDispatch(dispatchId);
      toast.success('已撤回发出');
      refreshDetail();
      refresh();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '撤回失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleWithdrawReturn = async (returnId: string) => {
    const ok = await confirm({ message: '确认撤回该回传？撤回后出库记录将被还原。' });
    if (!ok) return;
    setWithdrawing(true);
    try {
      await api.collaboration.withdrawReturn(returnId);
      toast.success('已撤回回传');
      refreshDetail();
      refresh();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '撤回失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleWithdrawForward = async (transferId: string) => {
    const ok = await confirm({ message: '确认撤回该转发？撤回后将恢复到转发前的状态，出库记录将被还原。' });
    if (!ok) return;
    setWithdrawing(true);
    try {
      await api.collaboration.withdrawForward(transferId);
      toast.success('已撤回转发');
      refreshDetail();
      refresh();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '撤回失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDeleteDispatch = async (dispatchId: string) => {
    const ok = await confirm({ message: '确认删除该发出记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    try {
      await api.collaboration.deleteDispatch(dispatchId);
      toast.success('已删除');
      refreshDetail();
      refresh();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const handleDeleteReturn = async (returnId: string) => {
    const ok = await confirm({ message: '确认删除该回传记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    try {
      await api.collaboration.deleteReturn(returnId);
      toast.success('已删除');
      refreshDetail();
      refresh();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const outsourceNodes = useMemo(() =>
    (nodeTemplates ?? []).filter(n => n.allowOutsource),
  [nodeTemplates]);

  const activeCollabsForRoutes = useMemo(() =>
    collabs.filter((c: any) => c.status === 'ACTIVE'),
  [collabs]);

  const collabTenantPartnerMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of partners) {
      if (p.collaborationTenantId) map[p.collaborationTenantId] = p.name;
    }
    return map;
  }, [partners]);

  const collabDisplayName = useCallback((tenantId: string, tenantName: string) => {
    const partnerName = collabTenantPartnerMap[tenantId];
    return partnerName ? `${partnerName}（${tenantName}）` : tenantName;
  }, [collabTenantPartnerMap]);

  const pendingForwardCount = useMemo(() =>
    transfers.filter(t => t.originTenantId && t.chainStep > 0 && !t.originConfirmedAt && t.senderTenantName === '本企业').length,
  [transfers]);

  const openDetail = async (t: any) => {
    try {
      const detail = await api.collaboration.getTransfer(t.id);
      setSelectedTransfer(detail);
      setViewMode('detail');
    } catch (err: any) {
      toast.error(err.message || '加载详情失败');
    }
  };

  const refreshDetail = async () => {
    if (!selectedTransfer) return;
    try {
      const detail = await api.collaboration.getTransfer(selectedTransfer.id);
      setSelectedTransfer(detail);
    } catch {}
  };

  // Accept logic
  const startAccept = (transfer: any) => {
    setAcceptOpen(true);
    setAcceptNewName(transfer.senderProductName || '');
    setAcceptNewSku(transfer.senderProductSku || '');
    const pendingDispatches = (transfer.dispatches || []).filter((d: any) => d.status === 'PENDING');
    const firstPayload = pendingDispatches[0]?.payload;
    setAcceptNewDesc(firstPayload?.description || '');
    // 优先从 payload.colorNames/sizeNames 取，fallback 从 items 中提取
    let colors = normalizeAcceptSpecList(firstPayload?.colorNames);
    let sizes = normalizeAcceptSpecList(firstPayload?.sizeNames);
    if (!colors.length || !sizes.length) {
      const allItems = pendingDispatches.flatMap((d: any) => d.payload?.items ?? []);
      if (!colors.length) colors = [...new Set(allItems.map((i: any) => i.colorName).filter(Boolean))] as string[];
      if (!sizes.length) sizes = [...new Set(allItems.map((i: any) => i.sizeName).filter(Boolean))] as string[];
    }
    setAcceptNewColors(colors);
    setAcceptNewSizes(sizes);
    setAcceptDispatchIds(new Set(pendingDispatches.map((d: any) => d.id)));
  };

  const submitAccept = async () => {
    if (!selectedTransfer) return;
    if (!acceptNewName.trim()) { toast.warning('请填写产品名称'); return; }
    if (!acceptNewSku.trim()) { toast.warning('请填写产品编号'); return; }
    const pendingSelected = (selectedTransfer.dispatches || []).filter(
      (d: any) => d.status === 'PENDING' && acceptDispatchIds.has(d.id),
    );
    if (pendingSelected.length === 0) {
      toast.warning('没有待接受的发出批次');
      return;
    }
    // 合并展示时 dispatch 可能分属多条 transfer，须按 transferId 分别调用接受接口
    const byTransfer = new Map<string, string[]>();
    for (const d of pendingSelected) {
      const tid = (d as any).transferId || selectedTransfer.id;
      const list = byTransfer.get(tid) ?? [];
      list.push(d.id);
      byTransfer.set(tid, list);
    }
    const orderedTids = [...byTransfer.keys()].sort();
    const specColors = normalizeAcceptSpecList(acceptNewColors);
    const specSizes = normalizeAcceptSpecList(acceptNewSizes);
    const createProductBody = {
      name: acceptNewName,
      sku: acceptNewSku,
      description: acceptNewDesc || undefined,
      colorNames: specColors.length ? specColors : undefined,
      sizeNames: specSizes.length ? specSizes : undefined,
    };
    setAccepting(true);
    try {
      let acceptedSum = 0;
      const createdOrders: string[] = [];
      let receiverProductId: string | null = null;
      let pendingProcess = false;
      for (const tid of orderedTids) {
        const ids = byTransfer.get(tid)!;
        const body: any = { dispatchIds: ids, createProduct: createProductBody };
        const res = await api.collaboration.acceptTransfer(tid, body);
        acceptedSum += res.accepted ?? 0;
        if (Array.isArray(res.createdOrders)) createdOrders.push(...res.createdOrders);
        if (res.receiverProductId) receiverProductId = res.receiverProductId;
        if (res.pendingProcess) pendingProcess = true;
      }
      const msg = pendingProcess
        ? `已接受 ${acceptedSum} 条，生成 ${createdOrders.length} 张工单（待配工序）`
        : `已接受 ${acceptedSum} 条，生成 ${createdOrders.length} 张工单`;
      toast.success(msg, {
        duration: 8000,
        action: receiverProductId && pendingProcess
          ? {
              label: '去配置工序 →',
              onClick: () => navigate('/basic', { state: { editProductId: receiverProductId } }),
            }
          : undefined,
      });
      setAcceptOpen(false);
      await refreshDetail();
      refresh();
      onRefreshProducts?.();
      onRefreshOrders?.();
    } catch (err: any) {
      toast.error(err.message || '接受失败');
    } finally {
      setAccepting(false);
    }
  };

  /** 回传弹窗打开时，按甲方发出 − 已回传计算可回行 */
  useEffect(() => {
    if (!returnOpen) return;
    const transfer = returnModalTransferRef.current;
    if (!transfer) return;
    const rows = computeCollaborationReturnableRows(
      transfer,
      returnWarehouseId || undefined,
      products,
      prodRecords,
      dictionaries,
      warehouses.length > 0,
    );
    setReturnRows(rows.map(r => ({ ...r, qty: '' })));
  }, [returnOpen, returnWarehouseId, products, prodRecords, dictionaries, warehouses.length]);

  const openReturnModal = (transfer: any) => {
    if (!transfer?.receiverProductId) {
      toast.warning('缺少乙方产品信息，无法回传');
      return;
    }
    returnModalTransferRef.current = transfer;
    setReturnNote('');
    setReturnWarehouseId(warehouses[0]?.id ?? '');
    setReturnOpen(true);
  };

  // Return logic
  const submitReturn = async () => {
    if (!selectedTransfer) return;
    if (warehouses.length > 0 && !returnWarehouseId) {
      toast.warning('请选择出库仓库');
      return;
    }
    if (returnRows.length === 0) {
      toast.warning('所有规格已全部回传完毕，无剩余可回传数量');
      return;
    }
    for (const r of returnRows) {
      const q = Number(r.qty) || 0;
      if (q > r.maxReturnable) {
        toast.error(`「${[r.colorName, r.sizeName].filter(Boolean).join('/') || '无规格'}」超过可回传上限 ${r.maxReturnable}`);
        return;
      }
    }
    const items = returnRows
      .map(r => ({
        colorName: r.colorName,
        sizeName: r.sizeName,
        quantity: Number(r.qty) || 0,
      }))
      .filter(i => i.quantity > 0);
    if (items.length === 0) {
      toast.warning('请至少填写一行回传数量');
      return;
    }
    setReturning(true);
    try {
      await api.collaboration.createReturn(selectedTransfer.id, {
        items,
        note: returnNote || undefined,
        warehouseId: returnWarehouseId || undefined,
      });
      toast.success('回传提交成功（已自动从仓库出库）');
      setReturnOpen(false);
      setReturnRows([]);
      setReturnNote('');
      setReturnWarehouseId('');
      await refreshDetail();
      refresh();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '回传失败');
    } finally {
      setReturning(false);
    }
  };

  // Receive (甲方确认收回)
  const handleReceive = async (returnId: string) => {
    setReceiving(true);
    try {
      const res = await api.collaboration.receiveReturn(returnId);
      toast.success(res.receiptDocNo ? `已确认收回，外协回收单号: ${res.receiptDocNo}` : '已确认收回');
      await refreshDetail();
      refresh();
      onRefreshProdRecords?.();
      onRefreshOrders?.();
      onRefreshPMP?.();
    } catch (err: any) {
      toast.error(err.message || '收回确认失败');
    } finally {
      setReceiving(false);
    }
  };

  // Product maps
  const mapsLoadedRef = useRef(false);
  const loadMaps = async (force = false) => {
    if (!force && mapsLoadedRef.current) return;
    setMapsLoading(true);
    try {
      const data = await api.collaboration.listProductMaps();
      setProductMaps(data);
      mapsLoadedRef.current = true;
    } catch {}
    setMapsLoading(false);
  };

  useEffect(() => {
    if (viewMode !== 'maps' || productMaps.length === 0) return;
    const ids = [...new Set(productMaps.map((m: any) => m.receiverProductId).filter(Boolean))]
      .filter(id => !products.some(p => p.id === id) && !mapsFetchedProductIdsRef.current.has(id));
    if (ids.length === 0) return;
    let cancelled = false;
    ids.forEach(id => mapsFetchedProductIdsRef.current.add(id));
    Promise.all(
      ids.map(id =>
        api.products.get(id)
          .then(p => ({ id, product: p as Product }))
          .catch(() => { mapsFetchedProductIdsRef.current.delete(id); return null; })
      )
    ).then(results => {
      if (cancelled) return;
      const resolved: Record<string, Product> = {};
      for (const r of results) { if (r) resolved[r.id] = r.product; }
      if (Object.keys(resolved).length > 0) {
        setResolvedReceiverProducts(prev => ({ ...prev, ...resolved }));
      }
    });
    return () => { cancelled = true; };
  }, [viewMode, productMaps, products]);

  const deleteMap = async (id: string) => {
    try {
      await api.collaboration.deleteProductMap(id);
      toast.success('已删除');
      loadMaps(true);
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const collabsLoadedRef = useRef(false);
  const refreshCollabs = useCallback(async (force = false) => {
    if (!force && collabsLoadedRef.current) return;
    try {
      const data = await api.collaboration.listCollaborations();
      setCollabs(data);
      collabsLoadedRef.current = true;
    } catch {}
  }, []);

  useEffect(() => { refreshCollabs(true); }, [refreshCollabs]);

  const handleInvite = async () => {
    const code = inviteCode.trim();
    if (!code) { toast.warning('请输入对方企业邀请码'); return; }
    setInviting(true);
    try {
      await api.collaboration.createCollaboration({ inviteCode: code });
      toast.success('协作建立成功');
      setInviteCode('');
      await refreshCollabs(true);
    } catch (err: any) {
      toast.error(err.message || '建立协作失败');
    } finally {
      setInviting(false);
    }
  };

  const handleBindPartner = async () => {
    if (!bindPartnerId || !bindCollabTenantId) { toast.warning('请选择合作单位和协作企业'); return; }
    setBinding(true);
    try {
      await api.partners.update(bindPartnerId, { collaborationTenantId: bindCollabTenantId } as any);
      toast.success('绑定成功');
      setBindPartnerId('');
      setBindCollabTenantId('');
      await onRefreshPartners();
    } catch (err: any) {
      toast.error(err.message || '绑定失败');
    } finally {
      setBinding(false);
    }
  };

  const handleUnbindPartner = async (partnerId: string) => {
    try {
      await api.partners.update(partnerId, { collaborationTenantId: null } as any);
      toast.success('已解除绑定');
      await onRefreshPartners();
    } catch (err: any) {
      toast.error(err.message || '解除绑定失败');
    }
  };

  const activeCollabs = useMemo(() => collabs.filter(c => c.status === 'ACTIVE'), [collabs]);
  const boundPartners = useMemo(() => partners.filter(p => p.collaborationTenantId), [partners]);
  const unboundPartners = useMemo(() => partners.filter(p => !p.collaborationTenantId), [partners]);

  // Computed
  const pendingCount = useMemo(() => {
    return transfers.filter(t =>
      (t.dispatches || []).some((d: any) => d.status === 'PENDING')
    ).length;
  }, [transfers]);

  const pendingReturnCount = useMemo(() => {
    return transfers.filter(t =>
      t.senderTenantName === '本企业' &&
      (t.returns || []).some((r: any) => r.status === 'PENDING_A_RECEIVE')
    ).length;
  }, [transfers]);

  const statusLabel = (s: string) => {
    const map: Record<string, { text: string; cls: string }> = {
      OPEN: { text: '进行中', cls: 'bg-blue-50 text-blue-600' },
      PARTIALLY_RECEIVED: { text: '部分收回', cls: 'bg-amber-50 text-amber-600' },
      CLOSED: { text: '已关闭', cls: 'bg-emerald-50 text-emerald-600' },
      CANCELLED: { text: '已取消', cls: 'bg-slate-100 text-slate-500' },
    };
    const m = map[s] || { text: s, cls: 'bg-slate-100 text-slate-600' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${m.cls}`}>{m.text}</span>;
  };

  const dispatchStatusLabel = (s: string) => {
    if (s === 'PENDING') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-600">待接受</span>;
    if (s === 'FORWARDED') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-50 text-blue-600">已转发</span>;
    if (s === 'WITHDRAWN') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-500">已撤回</span>;
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-600">已接受</span>;
  };

  const returnStatusLabel = (s: string) => {
    if (s === 'PENDING_A_RECEIVE') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-600">待甲方收回</span>;
    if (s === 'WITHDRAWN') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-500">已撤回</span>;
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-600">已收回</span>;
  };

  // ---- RENDER ----

  if (viewMode === 'settings') {
    return (
      <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setViewMode('inbox')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回收件箱
          </button>
        </div>

        {/* 建立企业协作 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-black text-slate-900">建立企业协作</h3>
              <p className="text-xs text-slate-500">输入对方企业的邀请码（在对方成员管理中可查看）来建立互信</p>
            </div>
          </div>
          <div className="px-6 py-5 flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">对方企业邀请码</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                placeholder="输入邀请码..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <button
              disabled={inviting || !inviteCode.trim()}
              onClick={handleInvite}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0"
            >
              {inviting ? '建立中...' : '建立协作'}
            </button>
          </div>

          {/* 已有协作企业列表 */}
          {activeCollabs.length > 0 && (
            <div className="px-6 pb-5">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">已建立协作 ({activeCollabs.length})</p>
              <div className="space-y-2">
                {activeCollabs.map(c => (
                  <div key={c.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-sm font-bold text-slate-800 flex-1">{c.otherTenantName}</span>
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">已生效</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 绑定合作单位 ↔ 协作企业 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <Link2 className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-black text-slate-900">绑定合作单位</h3>
              <p className="text-xs text-slate-500">将「基础信息」中的合作单位绑定到协作企业，外协发出时自动触发同步</p>
            </div>
          </div>

          {/* 新增绑定 */}
          {activeCollabs.length > 0 && unboundPartners.length > 0 && (
            <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-end gap-3">
              <div className="space-y-1 flex-1 min-w-[180px]">
                <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">合作单位</label>
                <SearchablePartnerSelect
                  options={unboundPartners}
                  categories={partnerCategories}
                  value={bindPartnerId}
                  onChange={(_, id) => setBindPartnerId(id)}
                  valueMode="id"
                  placeholder="选择合作单位..."
                  triggerClassName="bg-slate-50 border border-slate-200"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[180px]">
                <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">协作企业</label>
                <select
                  value={bindCollabTenantId}
                  onChange={e => setBindCollabTenantId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">选择协作企业...</option>
                  {activeCollabs.map(c => (
                    <option key={c.otherTenantId} value={c.otherTenantId}>{c.otherTenantName}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={binding || !bindPartnerId || !bindCollabTenantId}
                onClick={handleBindPartner}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0"
              >
                {binding ? '绑定中...' : '确认绑定'}
              </button>
            </div>
          )}

          {activeCollabs.length === 0 && (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">请先在上方建立企业协作</div>
          )}

          {/* 已绑定列表 */}
          {boundPartners.length > 0 ? (
            <div className="px-6 py-5">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-3">已绑定 ({boundPartners.length})</p>
              <div className="space-y-2">
                {boundPartners.map(p => {
                  const collab = activeCollabs.find(c => c.otherTenantId === p.collaborationTenantId);
                  return (
                    <div key={p.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                      <span className="text-sm font-bold text-slate-800 flex-1">{p.name}</span>
                      <span className="text-xs text-indigo-600 font-bold">→ {collab?.otherTenantName ?? '未知企业'}</span>
                      <button
                        onClick={() => handleUnbindPartner(p.id)}
                        className="text-rose-500 hover:text-rose-700 text-xs font-bold shrink-0"
                      >
                        解除绑定
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeCollabs.length > 0 && (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">暂未绑定任何合作单位</div>
          )}
        </div>
      </div>
    );
  }

  if (viewMode === 'routes') {
    return (
      <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setViewMode('inbox')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回收件箱
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => startEditRoute()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
              <Plus className="w-4 h-4" /> 新建路线
            </button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <Route className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-black text-slate-900">外协路线</h3>
              <p className="text-xs text-slate-500">配置多步外协传递路线，在外协发出时可选择路线实现链式转发</p>
            </div>
          </div>
          {routesLoading ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">加载中...</div>
          ) : outsourceRoutes.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">暂无外协路线，点击右上角新建</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {outsourceRoutes.map(r => (
                <div key={r.id} className="px-6 py-4 hover:bg-slate-50/50 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-black text-slate-900">{r.name}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEditRoute(r)} className="text-indigo-600 hover:text-indigo-800"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => deleteRoute(r.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(r.steps || []).sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((s: any, i: number) => (
                      <React.Fragment key={i}>
                        {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">
                          {s.nodeName || '工序'} · {s.receiverTenantId ? collabDisplayName(s.receiverTenantId, s.receiverTenantName || '企业') : (s.receiverTenantName || '企业')}
                        </span>
                      </React.Fragment>
                    ))}
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">
                      回传甲方
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(r.createdAt).toLocaleDateString()} · {r.steps.length} 步</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 路线编辑弹窗 */}
        {routeEditOpen && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setRouteEditOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900">{editingRoute ? '编辑路线' : '新建路线'}</h3>
                <button onClick={() => setRouteEditOpen(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">路线名称</label>
                  <input
                    value={routeName}
                    onChange={e => setRouteName(e.target.value)}
                    placeholder="例如：裁剪-缝制-后整"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">步骤 ({routeSteps.length})</label>
                    <button onClick={addRouteStep} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1">
                      <Plus className="w-3 h-3" /> 添加步骤
                    </button>
                  </div>
                  {routeSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
                      <span className="text-xs font-black text-slate-400 w-6 text-center shrink-0">{idx + 1}</span>
                      <select
                        value={step.nodeId}
                        onChange={e => {
                          const node = outsourceNodes.find(n => n.id === e.target.value);
                          updateRouteStep(idx, { nodeId: e.target.value, nodeName: node?.name ?? '' });
                        }}
                        className="flex-1 bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold text-slate-800"
                      >
                        <option value="">选择工序</option>
                        {outsourceNodes.map(n => (
                          <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                      </select>
                      <select
                        value={step.receiverTenantId}
                        onChange={e => {
                          const c = activeCollabsForRoutes.find((c: any) => c.otherTenantId === e.target.value);
                          updateRouteStep(idx, { receiverTenantId: e.target.value, receiverTenantName: c?.otherTenantName ?? '' });
                        }}
                        className="flex-1 bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold text-slate-800"
                      >
                        <option value="">选择协作企业</option>
                        {activeCollabsForRoutes.filter((c: any) => {
                          const usedIds = routeSteps.filter((_, si) => si !== idx).map(s => s.receiverTenantId);
                          return !usedIds.includes(c.otherTenantId);
                        }).map((c: any) => (
                          <option key={c.otherTenantId} value={c.otherTenantId}>{collabDisplayName(c.otherTenantId, c.otherTenantName)}</option>
                        ))}
                      </select>
                      <button onClick={() => removeRouteStep(idx)} className="text-rose-400 hover:text-rose-600 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {routeSteps.length === 0 && (
                    <div className="text-center text-slate-400 text-xs py-4">点击上方「添加步骤」开始配置路线</div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button onClick={() => setRouteEditOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800">取消</button>
                <button onClick={saveRoute} disabled={savingRoute} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  {savingRoute ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'maps') {
    return (
      <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setViewMode('inbox')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回收件箱
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <Link2 className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-black text-slate-900">伙伴物料对照表</h3>
          </div>
          {mapsLoading ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">加载中...</div>
          ) : productMaps.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 text-sm">暂无对照记录，接受协作单时勾选「记住映射」即可自动生成</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">甲方 SKU</th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">甲方产品名</th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">乙方产品</th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productMaps.map((m: any) => {
                  const rp = products.find(p => p.id === m.receiverProductId) ?? resolvedReceiverProducts[m.receiverProductId];
                  const nodeCount = rp?.milestoneNodeIds?.length ?? 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 text-sm font-bold text-slate-800">{m.senderSku}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{m.senderProductName}</td>
                      <td className="px-6 py-3">
                        <span className="text-sm font-bold text-indigo-600">{rp?.name ?? m.receiverProductId}</span>
                        {rp && (
                          <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${nodeCount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {nodeCount > 0 ? `${nodeCount} 道工序` : '未配工序'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {rp && (
                            <button
                              onClick={() => navigate('/basic', { state: { editProductId: rp.id } })}
                              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-bold"
                              title="查看/编辑产品信息与工序"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => deleteMap(m.id)} className="text-rose-500 hover:text-rose-700 text-xs font-bold"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (viewMode === 'detail' && selectedTransfer) {
    const t = selectedTransfer;
    const isSender = t.senderTenantName === '本企业';
    const pendingDispatches = (t.dispatches || []).filter((d: any) => d.status === 'PENDING');
    const totalDispatched = (t.dispatches || []).reduce((sum: number, d: any) => {
      const items = d.payload?.items ?? [];
      return sum + items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
    }, 0);
    const totalReturned = (t.returns || []).reduce((sum: number, r: any) => {
      const items = r.payload?.items ?? [];
      return sum + items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
    }, 0);

    return (
      <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <button onClick={() => { setViewMode('inbox'); setSelectedTransfer(null); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <button onClick={refreshDetail} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"><RefreshCw className="w-4 h-4" /> 刷新</button>
        </div>

        {/* 主单信息 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6 text-indigo-600" />
              <div>
                <h3 className="text-lg font-black text-slate-900">{t.senderProductName}</h3>
                <p className="text-xs text-slate-500">SKU: {t.senderProductSku}</p>
              </div>
            </div>
            {statusLabel(t.status)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-[10px] font-black text-slate-400 uppercase block">甲方</span><span className="font-bold text-slate-800">{t.senderTenantName}</span></div>
            <div><span className="text-[10px] font-black text-slate-400 uppercase block">乙方</span><span className="font-bold text-slate-800">{t.receiverTenantName}</span></div>
            <div><span className="text-[10px] font-black text-slate-400 uppercase block">发出总量</span><span className="font-bold text-slate-800">{totalDispatched}</span></div>
            <div><span className="text-[10px] font-black text-slate-400 uppercase block">已回传</span><span className="font-bold text-emerald-600">{totalReturned}</span></div>
          </div>
          {t.bReceiveMode && (
            <p className="text-xs text-slate-500">乙方接收模式：{t.bReceiveMode === 'product' ? '关联产品' : '关联工单'}</p>
          )}

          {/* 链式外协路线进度 */}
          {t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot) && (
            <div className="pt-2">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">外协路线进度</p>
              <div className="flex items-center gap-1 flex-wrap">
                {(t.outsourceRouteSnapshot as any[]).sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((step: any, i: number) => {
                  const isComplete = i < t.chainStep;
                  const isCurrent = i === t.chainStep;
                  return (
                    <React.Fragment key={i}>
                      {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                        isComplete ? 'bg-emerald-50 text-emerald-700' :
                        isCurrent ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {isComplete && <Check className="w-3 h-3" />}
                        {step.nodeName} · {step.receiverTenantName}
                      </span>
                    </React.Fragment>
                  );
                })}
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                  t.status === 'CLOSED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {t.status === 'CLOSED' && <Check className="w-3 h-3" />}
                  回传甲方
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {!isSender && pendingDispatches.length > 0 && (
              <button onClick={() => startAccept(t)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                <Check className="w-4 h-4" /> 接受 ({pendingDispatches.length} 待处理)
              </button>
            )}
            {/* 乙方：转发到下一站（有路线且不是最后一站） */}
            {!isSender && t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot) &&
              (t.outsourceRouteSnapshot as any[]).some((s: any) => s.stepOrder > t.chainStep) &&
              t.status !== 'CLOSED' && (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED') && (
              <button onClick={() => openForwardModal(t)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all">
                <Forward className="w-4 h-4" /> 转发到下一站
              </button>
            )}
            {/* 乙方：回传（无路线，或是路线最后一站） */}
            {!isSender && t.status !== 'CLOSED' && t.status !== 'CANCELLED' && (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED') &&
              (!t.outsourceRouteSnapshot || !Array.isArray(t.outsourceRouteSnapshot) ||
                !(t.outsourceRouteSnapshot as any[]).some((s: any) => s.stepOrder > t.chainStep)) && (
              <button onClick={() => openReturnModal(t)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all">
                <Truck className="w-4 h-4" /> 回传给甲方
              </button>
            )}
            {/* 甲方：确认转发 */}
            {isSender && t.chainStep > 0 && !t.originConfirmedAt && (
              <button onClick={() => handleConfirmForward(t.id)} disabled={confirmingForward} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">
                <CheckCircle2 className="w-4 h-4" /> {confirmingForward ? '确认中...' : '确认转发'}
              </button>
            )}
            {/* 乙方：撤回转发（有子单且未被甲方确认） */}
            {!isSender && t.childTransferId && !t.childConfirmed && (
              <button onClick={() => handleWithdrawForward(t.childTransferId)} disabled={withdrawing} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
                <RotateCcw className="w-4 h-4" /> {withdrawing ? '撤回中...' : '撤回转发'}
              </button>
            )}
          </div>
        </div>

        {/* Dispatch 列表 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">发出批次 ({(t.dispatches || []).length})</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {(t.dispatches || []).map((d: any) => {
              const items = d.payload?.items ?? [];
              const qty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
              return (
                <div key={d.id} className="px-6 py-4 flex items-center justify-between gap-4 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {dispatchStatusLabel(d.status)}
                      <span className="text-sm font-bold text-slate-800">数量 {qty}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {items.map((i: any, idx: number) => {
                        const parts = [i.colorName, i.sizeName].filter(Boolean).join('/');
                        return parts ? `${parts}: ${i.quantity}` : `${i.quantity}`;
                      }).join('  ')}
                    </p>
                    <p className="text-[10px] text-slate-400">{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.receiverProductionOrderId && (
                      <span className="text-xs text-indigo-600 font-bold">工单: {d.receiverProductionOrderId.slice(0, 16)}...</span>
                    )}
                    {isSender && d.status === 'PENDING' && !(t._chainTransfers && d.transferId && (t._chainTransfers as any[]).some((ct: any) => ct.id === d.transferId && ct.chainStep > 0)) && (
                      <button
                        disabled={withdrawing}
                        onClick={e => { e.stopPropagation(); handleWithdrawDispatch(d.id); }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 disabled:opacity-50 transition-all"
                      >
                        <RotateCcw className="w-3 h-3" /> 撤回
                      </button>
                    )}
                    {isSender && d.status === 'WITHDRAWN' && !(t._chainTransfers && d.transferId && (t._chainTransfers as any[]).some((ct: any) => ct.id === d.transferId && ct.chainStep > 0)) && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteDispatch(d.id); }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-500 rounded-lg text-[10px] font-bold hover:bg-rose-100 transition-all"
                      >
                        <Trash2 className="w-3 h-3" /> 删除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Return 列表 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">回传记录 ({(t.returns || []).length})</h4>
          </div>
          {(t.returns || []).length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">暂无回传记录</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {(t.returns || []).map((r: any) => {
                const items = r.payload?.items ?? [];
                const qty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
                return (
                  <div key={r.id} className="px-6 py-4 flex items-center justify-between gap-4 min-w-0">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {returnStatusLabel(r.status)}
                        <span className="text-sm font-bold text-slate-800">合计 {qty}</span>
                      </div>
                      {items.length > 0 && (
                        <ul className="text-xs text-slate-600 space-y-0.5 mt-1">
                          {items.map((it: any, i: number) => (
                            <li key={i}>
                              {[it.colorName, it.sizeName].filter(Boolean).join('/') || '无规格'}：{it.quantity}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.payload?.note && <p className="text-xs text-slate-500">备注: {r.payload.note}</p>}
                      {r.payload?.receiptDocNo && (
                        <p className="text-[10px] font-bold text-emerald-600">回收单号: {r.payload.receiptDocNo}</p>
                      )}
                      <p className="text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSender && r.status === 'PENDING_A_RECEIVE' && (
                        <button
                          disabled={receiving}
                          onClick={() => handleReceive(r.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" /> 确认收回
                        </button>
                      )}
                      {!isSender && r.status === 'PENDING_A_RECEIVE' && (
                        <button
                          disabled={withdrawing}
                          onClick={e => { e.stopPropagation(); handleWithdrawReturn(r.id); }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 disabled:opacity-50 transition-all"
                        >
                          <RotateCcw className="w-3 h-3" /> 撤回
                        </button>
                      )}
                      {!isSender && r.status === 'WITHDRAWN' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteReturn(r.id); }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-500 rounded-lg text-[10px] font-bold hover:bg-rose-100 transition-all"
                        >
                          <Trash2 className="w-3 h-3" /> 删除
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accept wizard modal */}
        {acceptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setAcceptOpen(false)} aria-hidden />
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Check className="w-5 h-5 text-indigo-600" /> 接受协作单</h3>
                <button onClick={() => setAcceptOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
              </div>

              {/* Snapshot preview */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase">甲方产品信息</p>
                <p className="text-sm font-bold text-slate-800">{t.senderProductName} ({t.senderProductSku})</p>
                {(t.dispatches || []).filter((d: any) => d.status === 'PENDING').slice(0, 1).map((d: any) => (
                  <div key={d.id} className="text-xs text-slate-600 space-y-0.5">
                    {d.payload?.description && <p>{d.payload.description}</p>}
                    {(d.payload?.items || []).map((item: any, i: number) => (
                      <p key={i}>{[item.colorName, item.sizeName].filter(Boolean).join('/') || '无规格'}: {item.quantity}</p>
                    ))}
                  </div>
                ))}
              </div>

              {/* 新建乙方产品 */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase">乙方新建产品（已从甲方信息预填）</p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">产品名称 *</label>
                    <input
                      type="text"
                      value={acceptNewName}
                      onChange={e => setAcceptNewName(e.target.value)}
                      placeholder="产品名称"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">产品编号/SKU *</label>
                    <input
                      type="text"
                      value={acceptNewSku}
                      onChange={e => setAcceptNewSku(e.target.value)}
                      placeholder="产品编号/SKU"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">描述</label>
                    <input
                      type="text"
                      value={acceptNewDesc}
                      onChange={e => setAcceptNewDesc(e.target.value)}
                      placeholder="选填"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  {acceptNewColors.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">颜色（来自甲方）</label>
                      <div className="flex flex-wrap gap-1.5">
                        {acceptNewColors.map((c, i) => (
                          <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {acceptNewSizes.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">尺码（来自甲方）</label>
                      <div className="flex flex-wrap gap-1.5">
                        {acceptNewSizes.map((s, i) => (
                          <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setAcceptOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
                <button
                  disabled={accepting || !acceptNewName.trim() || !acceptNewSku.trim() || acceptDispatchIds.size === 0}
                  onClick={submitAccept}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {accepting ? '处理中...' : '确认接受'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Return modal */}
        {returnOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setReturnOpen(false)} aria-hidden />
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-emerald-600" /> 提交回传</h3>
              <p className="text-xs text-slate-500">
                请先选择<strong>出库仓库</strong>，可回传 = 甲方发出总量 − 已回传总量，按颜色/尺码汇总。
              </p>
              {warehouses.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase block">出库仓库</label>
                  <select
                    value={returnWarehouseId}
                    onChange={e => setReturnWarehouseId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">请选择仓库</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase">颜色</th>
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase">尺码</th>
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase text-right">可回</th>
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase w-24">本次</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {returnRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-amber-700 bg-amber-50/50 font-medium">
                          {!returnWarehouseId && warehouses.length > 0
                            ? '请先选择出库仓库'
                            : '无可回传数量（库存不足或已全部回传）。'}
                        </td>
                      </tr>
                    ) : (
                      returnRows.map((row, idx) => (
                        <tr key={collabVariantKey(row)}>
                          <td className="px-3 py-2 font-bold text-slate-800">{row.colorName || '—'}</td>
                          <td className="px-3 py-2 font-bold text-slate-800">{row.sizeName || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{row.maxReturnable}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={row.maxReturnable}
                              value={row.qty}
                              onChange={e => {
                                const v = e.target.value;
                                setReturnRows(prev => prev.map((r, i) => (i === idx ? { ...r, qty: v } : r)));
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block">备注（可选）</label>
                <input
                  type="text"
                  value={returnNote}
                  onChange={e => setReturnNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="选填"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setReturnOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
                <button
                  disabled={returning || returnRows.length === 0 || (warehouses.length > 0 && !returnWarehouseId)}
                  onClick={submitReturn}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {returning ? '提交中...' : '确认回传'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 转发弹窗 */}
        {forwardOpen && (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setForwardOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4 p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Forward className="w-5 h-5 text-orange-500" /> 转发到下一站</h3>
              {(() => {
                const transfer = forwardModalTransferRef.current;
                const route = transfer?.outsourceRouteSnapshot as any[] | undefined;
                const nextStep = route?.find((s: any) => s.stepOrder === (transfer?.chainStep ?? 0) + 1);
                return nextStep ? (
                  <p className="text-xs text-slate-500">
                    下一站：<span className="font-bold text-slate-800">{nextStep.nodeName}</span> · <span className="font-bold text-orange-600">{nextStep.receiverTenantName}</span>
                    ，请先选择<strong>出库仓库</strong>，可转发数量为该仓库中对应规格的库存数量。
                  </p>
                ) : null;
              })()}
              {warehouses.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase block">出库仓库</label>
                  <select
                    value={forwardWarehouseId}
                    onChange={e => setForwardWarehouseId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none"
                  >
                    <option value="">请选择仓库</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase">颜色</th>
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase">尺码</th>
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase text-right">可转</th>
                      <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase w-24">本次</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {forwardRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-amber-700 bg-amber-50/50 font-medium">
                          {!forwardWarehouseId && warehouses.length > 0
                            ? '请先选择出库仓库'
                            : '该仓库中无可转发库存。'}
                        </td>
                      </tr>
                    ) : (
                      forwardRows.map((row, idx) => (
                        <tr key={collabVariantKey(row)}>
                          <td className="px-3 py-2 font-bold text-slate-800">{row.colorName || '—'}</td>
                          <td className="px-3 py-2 font-bold text-slate-800">{row.sizeName || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{row.maxReturnable}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={row.maxReturnable}
                              value={row.qty}
                              onChange={e => {
                                const v = e.target.value;
                                setForwardRows(prev => prev.map((r, i) => (i === idx ? { ...r, qty: v } : r)));
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-orange-500 outline-none"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block">备注（可选）</label>
                <input
                  type="text"
                  value={forwardNote}
                  onChange={e => setForwardNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="选填"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setForwardOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
                <button
                  disabled={forwarding || forwardRows.length === 0 || (warehouses.length > 0 && !forwardWarehouseId)}
                  onClick={submitForward}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {forwarding ? '转发中...' : '确认转发'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- INBOX LIST ----
  return (
    <div className="w-full min-w-0 space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={pageTitleClass}>协作管理</h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 bg-rose-500 text-white text-xs font-semibold rounded-full">{pendingCount}</span>
            )}
            {pendingForwardCount > 0 && (
              <span className="px-2.5 py-0.5 bg-orange-500 text-white text-xs font-semibold rounded-full" title="待确认转发">{pendingForwardCount}</span>
            )}
            {pendingReturnCount > 0 && (
              <span className="px-2.5 py-0.5 bg-indigo-500 text-white text-xs font-semibold rounded-full" title="待确认收回">{pendingReturnCount}</span>
            )}
          </div>
          <p className={pageSubtitleClass}>处理委托与承接协作单，维护外协路线、物料对照与协作关系</p>
        </div>
      </div>

      {/* 角色筛选与协作设置 / 外协路线 / 对照表同一行 */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-between min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {(['all', 'sender', 'receiver'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${roleFilter === r ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {r === 'all' ? '全部' : r === 'sender' ? '我的委托' : '我的承接'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button type="button" onClick={() => setViewMode('settings')} className={outlineToolbarButtonClass}>
            <Settings2 className="w-4 h-4 shrink-0" /> 协作设置
          </button>
          <button
            type="button"
            onClick={() => { setViewMode('routes'); loadRoutes(); refreshCollabs(); }}
            className={outlineToolbarButtonClass}
          >
            <Route className="w-4 h-4 shrink-0" /> 外协路线
          </button>
          <button type="button" onClick={() => { setViewMode('maps'); loadMaps(); }} className={outlineToolbarButtonClass}>
            <Link2 className="w-4 h-4 shrink-0" /> 对照表
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">加载中...</div>
      ) : transfers.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">暂无协作单</div>
      ) : (
        <div className="space-y-4">
          {transfers.map(t => {
            const pendingD = (t.dispatches || []).filter((d: any) => d.status === 'PENDING').length;
            const totalD = (t.dispatches || []).length;
            const totalR = (t.returns || []).length;
            const isSender = t.senderTenantName === '本企业';
            const pendingR = isSender ? (t.returns || []).filter((r: any) => r.status === 'PENDING_A_RECEIVE').length : 0;
            return (
              <div
                key={t.id}
                onClick={() => openDetail(t)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between gap-4 mb-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Package className="w-5 h-5 text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-black text-slate-900">{t.senderProductName}</span>
                      <span className="ml-2 text-xs text-slate-500">{t.senderProductSku}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendingD > 0 && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-black rounded">{pendingD} 待接受</span>
                    )}
                    {t.chainStep > 0 && !t.originConfirmedAt && isSender && (
                      <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-black rounded">待确认转发</span>
                    )}
                    {pendingR > 0 && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded">{pendingR} 待确认收回</span>
                    )}
                    {statusLabel(t.status)}
                  </div>
                </div>
                {t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot) && (
                  <div className="flex items-center gap-1 flex-wrap mb-2">
                    <Route className="w-3 h-3 text-orange-400 shrink-0" />
                    {[...(t.outsourceRouteSnapshot as any[])].sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((s: any, i: number) => (
                      <React.Fragment key={i}>
                        {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                        <span className={`text-[10px] font-bold ${s.stepOrder === t.chainStep ? 'text-orange-600' : 'text-slate-400'}`}>{s.nodeName}·{s.receiverTenantName}</span>
                      </React.Fragment>
                    ))}
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                    <span className="text-[10px] font-bold text-emerald-500">回传</span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{isSender ? '→' : '←'} {isSender ? t.receiverTenantName : t.senderTenantName}</span>
                  <span>Dispatch: {totalD}</span>
                  <span>回传: {totalR}</span>
                  <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(CollaborationInboxView);
