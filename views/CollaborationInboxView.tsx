import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Inbox, Package, Check, X, ArrowLeft, Truck, RotateCcw,
  Search, Building2, Layers, ChevronDown, ChevronRight, RefreshCw,
  Link2, Settings2, Trash2, Edit2, Save, Plus, UserPlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '../services/api';
import type { Product, Partner, ProductionOpRecord, Warehouse, ProductionOrder, AppDictionaries } from '../types';

const COLLAB_RETURN_STOCK_OUT_OP = '协作回传出库';

interface CollaborationInboxViewProps {
  products: Product[];
  partners: Partner[];
  orders: ProductionOrder[];
  prodRecords: ProductionOpRecord[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  onRefreshPartners: () => Promise<void>;
  onRefreshProducts?: () => Promise<void>;
  onRefreshOrders?: () => Promise<void>;
  onRefreshProdRecords?: () => Promise<void>;
  onRefreshPMP?: () => Promise<void>;
  tenantRole?: string;
  userPermissions?: string[];
}

type ViewMode = 'inbox' | 'detail' | 'maps' | 'settings';

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
 * 可回传 = 甲方已接受发出总量 − 已回传总量，按颜色/尺码合并（与后端校验口径一致）。
 */
function computeCollaborationReturnableRows(
  transfer: any,
  _warehouseId: string | undefined,
  _products: Product[],
  _prodRecords: ProductionOpRecord[],
  _dict: AppDictionaries,
  _requireWarehouse: boolean,
): CollabReturnRow[] {
  if (!transfer) return [];

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

  const returnedBySpec = new Map<string, number>();
  for (const r of transfer.returns || []) {
    for (const it of r.payload?.items ?? []) {
      const k = collabVariantKey(it);
      returnedBySpec.set(k, (returnedBySpec.get(k) || 0) + (Number(it.quantity) || 0));
    }
  }

  const rows: CollabReturnRow[] = [];
  for (const [k, { colorName, sizeName, qty: dispatched }] of dispatchedBySpec) {
    const returned = returnedBySpec.get(k) || 0;
    const remaining = dispatched - returned;
    if (remaining <= 0) continue;
    rows.push({ colorName, sizeName, maxReturnable: remaining, qty: '' });
  }
  rows.sort((a, b) => {
    const la = [a.colorName || '', a.sizeName || ''].join('\t');
    const lb = [b.colorName || '', b.sizeName || ''].join('\t');
    return la.localeCompare(lb, 'zh-CN');
  });
  return rows;
}

const CollaborationInboxView: React.FC<CollaborationInboxViewProps> = ({ products, partners, orders, prodRecords, warehouses, dictionaries, onRefreshPartners, onRefreshProducts, onRefreshOrders, onRefreshProdRecords, onRefreshPMP, tenantRole, userPermissions }) => {
  const navigate = useNavigate();
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
    const firstPayload = (transfer.dispatches || []).find((d: any) => d.status === 'PENDING')?.payload;
    setAcceptNewDesc(firstPayload?.description || '');
    setAcceptNewColors(normalizeAcceptSpecList(firstPayload?.colorNames));
    setAcceptNewSizes(normalizeAcceptSpecList(firstPayload?.sizeNames));
    const pending = (transfer.dispatches || []).filter((d: any) => d.status === 'PENDING');
    setAcceptDispatchIds(new Set(pending.map((d: any) => d.id)));
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
  const loadMaps = async () => {
    setMapsLoading(true);
    try {
      await onRefreshProducts?.();
      const data = await api.collaboration.listProductMaps();
      setProductMaps(data);
    } catch {}
    setMapsLoading(false);
  };

  useEffect(() => {
    if (viewMode !== 'maps' || productMaps.length === 0) return;
    const ids = [...new Set(productMaps.map((m: any) => m.receiverProductId).filter(Boolean))];
    let cancelled = false;
    (async () => {
      for (const id of ids) {
        if (cancelled) return;
        if (products.some(p => p.id === id)) continue;
        if (mapsFetchedProductIdsRef.current.has(id)) continue;
        mapsFetchedProductIdsRef.current.add(id);
        try {
          const p = (await api.products.get(id)) as Product;
          if (!cancelled) setResolvedReceiverProducts(prev => ({ ...prev, [id]: p }));
        } catch {
          mapsFetchedProductIdsRef.current.delete(id);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode, productMaps, products]);

  const deleteMap = async (id: string) => {
    try {
      await api.collaboration.deleteProductMap(id);
      toast.success('已删除');
      loadMaps();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const refreshCollabs = useCallback(async () => {
    try {
      const data = await api.collaboration.listCollaborations();
      setCollabs(data);
    } catch {}
  }, []);

  useEffect(() => { refreshCollabs(); }, [refreshCollabs]);

  const handleInvite = async () => {
    const code = inviteCode.trim();
    if (!code) { toast.warning('请输入对方企业邀请码'); return; }
    setInviting(true);
    try {
      await api.collaboration.createCollaboration({ inviteCode: code });
      toast.success('协作建立成功');
      setInviteCode('');
      await refreshCollabs();
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
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-600">已接受</span>;
  };

  const returnStatusLabel = (s: string) => {
    if (s === 'PENDING_A_RECEIVE') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-600">待甲方收回</span>;
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-600">已收回</span>;
  };

  // ---- RENDER ----

  if (viewMode === 'settings') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4">
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
                <select
                  value={bindPartnerId}
                  onChange={e => setBindPartnerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">选择合作单位...</option>
                  {unboundPartners.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
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

  if (viewMode === 'maps') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setViewMode('inbox')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回收件箱
          </button>
          <button onClick={loadMaps} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"><RefreshCw className="w-4 h-4" /> 刷新</button>
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
      <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between">
          <button onClick={() => { setViewMode('inbox'); setSelectedTransfer(null); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <button onClick={refreshDetail} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"><RefreshCw className="w-4 h-4" /> 刷新</button>
        </div>

        {/* 主单信息 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
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

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {!isSender && pendingDispatches.length > 0 && (
              <button onClick={() => startAccept(t)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                <Check className="w-4 h-4" /> 接受 ({pendingDispatches.length} 待处理)
              </button>
            )}
            {!isSender && t.status !== 'CLOSED' && t.status !== 'CANCELLED' && (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED') && (
              <button onClick={() => openReturnModal(t)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all">
                <Truck className="w-4 h-4" /> 回传
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
                <div key={d.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="space-y-1">
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
                  {d.receiverProductionOrderId && (
                    <span className="text-xs text-indigo-600 font-bold">工单: {d.receiverProductionOrderId.slice(0, 16)}...</span>
                  )}
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
                  <div key={r.id} className="px-6 py-4 flex items-center justify-between">
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
                    {isSender && r.status === 'PENDING_A_RECEIVE' && (
                      <button
                        disabled={receiving}
                        onClick={() => handleReceive(r.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                      >
                        <Check className="w-3.5 h-3.5" /> 确认收回
                      </button>
                    )}
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
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
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
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
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
                            : '所有规格已全部回传完毕，无剩余可回传数量。'}
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
      </div>
    );
  }

  // ---- INBOX LIST ----
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl font-black text-slate-900">协作管理</h2>
          {pendingCount > 0 && (
            <span className="px-2.5 py-0.5 bg-rose-500 text-white text-xs font-black rounded-full">{pendingCount}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('settings')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Settings2 className="w-4 h-4" /> 协作设置
          </button>
          <button
            onClick={() => { setViewMode('maps'); loadMaps(); }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Link2 className="w-4 h-4" /> 对照表
          </button>
          <button onClick={refresh} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
        </div>
      </div>

      {/* Role filter */}
      <div className="flex items-center gap-2">
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
            return (
              <div
                key={t.id}
                onClick={() => openDetail(t)}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-indigo-600" />
                    <div>
                      <span className="text-sm font-black text-slate-900">{t.senderProductName}</span>
                      <span className="ml-2 text-xs text-slate-500">{t.senderProductSku}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendingD > 0 && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-black rounded">{pendingD} 待接受</span>
                    )}
                    {statusLabel(t.status)}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-xs text-slate-500">
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

export default CollaborationInboxView;
