import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Package, Route, Settings2, Link2, ChevronRight, Truck, X, Users, Forward, PackageCheck, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData, useOrdersData, useAppActions } from '../contexts/AppDataContext';
import * as api from '../services/api';
import { resolveCollabOutboundWarehouseId, WAREHOUSE_DOC_KIND } from '../utils/warehouseDocPreference';
import {
  moduleHeaderRowClass, outlineToolbarButtonClass, pageSubtitleClass, pageTitleClass,
} from '../styles/uiDensity';
import type {
  Product, Partner, PartnerCategory, ProductionOpRecord, Warehouse, ProductionOrder, AppDictionaries, GlobalNodeTemplate,
} from '../types';
import {
  computeCollaborationForwardableRows,
  computeCollaborationReturnableRows,
  dispatchStatusLabel,
  returnStatusLabel,
} from './collaboration/collabHelpers';
import { collabPayloadItemsToQtyMatrixProps } from './collaboration/collabDocDisplay';
import QtyMatrixTable from '../components/variant-matrix/QtyMatrixTable';
import CollabSettingsPanel from './collaboration/CollabSettingsPanel';
import CollabRoutesPanel from './collaboration/CollabRoutesPanel';
import CollabProductMapsPanel from './collaboration/CollabProductMapsPanel';
import CollabReturnFlowPanel from './collaboration/CollabReturnFlowPanel';
import CollabPeerReturnModal from './collaboration/CollabPeerReturnModal';
import CollabPeerForwardModal from './collaboration/CollabPeerForwardModal';
import CollabPeerReceiveModal from './collaboration/CollabPeerReceiveModal';
import CollabPeerConfirmForwardModal from './collaboration/CollabPeerConfirmForwardModal';
import CollabDocDetailModal from './collaboration/CollabDocDetailModal';
import CollabForwardDetailModal from './collaboration/CollabForwardDetailModal';
import CollabAggReturnDetailModal, { type AggReturnItem } from './collaboration/CollabAggReturnDetailModal';

/** 时间轴气泡类型：派发 / 单张回传 / 同 returnGroupId 聚合回传 / 转发 */
type DocKind = 'dispatch' | 'return' | 'agg-return' | 'forward';

type TimelineItem = {
  kind: DocKind;
  /** 气泡排序时间戳 */
  at: number;
  /** 排序稳定键 */
  key: string;
  transfer: any;
  doc?: any;
  /** 聚合回传时的若干 returns + 所属 transfer */
  aggItems?: AggReturnItem[];
  /** 聚合回传时的 stockOutDocNo */
  aggDocNo?: string;
  /** 转发类气泡：下一站的 transfer */
  forwardTransfer?: any;
  /** 转发类气泡：同一派发单号下若干同步创建的转发 transfer（多产品批量转发） */
  forwardSiblings?: any[];
};

type BubbleKind = 'dispatch' | 'return' | 'forward';

/**
 * 一条 transfer 可能同时归属于多个「合作单位窗口」：
 * 以 A→B→C 链为例，A 的 step-2 A→C 转发 transfer：
 *   · 在「A↔B」窗口里只显示 forward 气泡（由 A 确认转发）——A-B 窗口里也能联动拿到上一站的对话；
 *   · 在「A↔C」窗口里显示 dispatch/return 气泡——与普通派发完全一致，C 才能出现在对端列表中。
 * 因此每条 transfer 返回一组「对端 + 允许展示的气泡类型」绑定；非链/origin 非我 的场景退化成单对端全类型。
 */
function peerBindingsForTransfer(t: any, myTenantId: string | null): Array<{ peerTenantId: string; kinds: Set<BubbleKind> }> {
  if (!t) return [];
  const all: Set<BubbleKind> = new Set(['dispatch', 'return', 'forward']);
  if (!myTenantId) {
    if (t.senderTenantId === t.receiverTenantId) return [];
    return [{ peerTenantId: t.receiverTenantId, kinds: all }];
  }
  const isChain = !!t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0;
  const isOrigin = (t.originTenantId ?? t.senderTenantId) === myTenantId;
  if (isChain && isOrigin) {
    const out: Array<{ peerTenantId: string; kinds: Set<BubbleKind> }> = [];
    const route = Array.isArray(t.outsourceRouteSnapshot) ? t.outsourceRouteSnapshot : [];
    const prev = route.find((s: any) => s.stepOrder === (t.chainStep ?? 0) - 1);
    if (prev?.receiverTenantId && prev.receiverTenantId !== myTenantId) {
      out.push({ peerTenantId: prev.receiverTenantId, kinds: new Set<BubbleKind>(['forward']) });
    }
    const curReceiver = t.receiverTenantId;
    if (curReceiver && curReceiver !== myTenantId) {
      out.push({ peerTenantId: curReceiver, kinds: new Set<BubbleKind>(['dispatch', 'return']) });
    }
    return out;
  }
  const peer = t.senderTenantId === myTenantId ? t.receiverTenantId : t.senderTenantId;
  if (!peer || peer === myTenantId) return [];
  return [{ peerTenantId: peer, kinds: all }];
}

function firstOrDefault<T>(arr: T[], pred: (x: T) => boolean): T | undefined {
  for (const x of arr) if (pred(x)) return x;
  return undefined;
}

type PeerTransferEntry = { transfer: any; kinds: Set<BubbleKind> };

type PeerSummary = {
  peerTenantId: string;
  peerTenantName: string;
  entries: PeerTransferEntry[];
  pendingDispatches: number;
  pendingReturns: number;
  pendingForwards: number;
  totalItems: number;
};

type ViewMode = 'inbox' | 'maps';

const CollaborationInboxView: React.FC = () => {
  const m = useMasterData();
  const o = useOrdersData();
  const a = useAppActions();
  useEffect(() => { void a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);

  const products = m.products;
  const partners = m.partners;
  const partnerCategories = m.partnerCategories;
  const orders = o.orders;
  const prodRecords = o.prodRecords;
  const warehouses = m.warehouses;
  const dictionaries = m.dictionaries;
  const nodeTemplates = m.globalNodes;
  const onRefreshPartners = a.refreshPartners;
  const onRefreshProducts = a.refreshProducts;
  const onRefreshOrders = a.refreshOrders;
  const onRefreshProdRecords = a.refreshProdRecords;
  const onRefreshPMP = a.refreshPMP;

  const { tenantCtx, userId } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTenantId, setMyTenantId] = useState<string | null>(null);
  const [collabs, setCollabs] = useState<any[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

  const [returnFlowModalOpen, setReturnFlowModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [routesModalOpen, setRoutesModalOpen] = useState(false);

  // 操作弹窗
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [confirmForwardModalOpen, setConfirmForwardModalOpen] = useState(false);
  const [docDetail, setDocDetail] = useState<{ kind: 'dispatch' | 'return'; doc: any; transfer: any } | null>(null);
  /** 转发单详情（点击时间轴转发气泡打开，内含确认转发） */
  const [forwardDetailSiblings, setForwardDetailSiblings] = useState<any[] | null>(null);
  const [aggReturnDetail, setAggReturnDetail] = useState<{ docNo: string; items: AggReturnItem[] } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.collaboration.listTransfers({});
      setTransfers(data);
      // 第一条「本企业」视角的 tenant 解析：找任一 transfer 的 senderTenantName='本企业' 或 receiverTenantName='本企业'，相应 id 即为 myTenantId
      for (const t of data) {
        if (t.senderTenantName === '本企业') { setMyTenantId(t.senderTenantId); break; }
        if (t.receiverTenantName === '本企业') { setMyTenantId(t.receiverTenantId); break; }
      }
    } catch (err: any) {
      toast.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const collabsLoadedRef = useRef(false);
  const refreshCollabs = useCallback(async (force = false) => {
    if (!force && collabsLoadedRef.current) return;
    try {
      const data = await api.collaboration.listCollaborations();
      setCollabs(data);
      collabsLoadedRef.current = true;
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { refreshCollabs(true); }, [refreshCollabs]);
  const activeCollabs = useMemo(() => collabs.filter(c => c.status === 'ACTIVE'), [collabs]);

  /**
   * 以「对端」为维度分组 transfers：每个对端 tenantId 拥有：
   *   · 相关 transfers 条目（每条附 kinds，用于右侧时间轴在该窗口展示哪些气泡）
   *   · 待我方处理的 dispatch / return / forward 计数（决定左侧红点 + 右上批量操作按钮红点）
   *
   * 同一条 transfer 在链式场景下可能同时绑定到多个对端——例如 A 的 step-2 A→C 转发：
   *   · A↔B 窗口里显示 forward 气泡（等 A 确认）
   *   · A↔C 窗口里显示 dispatch/return 气泡（与阿卡的真正派发/回传对话）
   */
  const peerSummaries = useMemo<PeerSummary[]>(() => {
    const map = new Map<string, PeerSummary>();
    const tenantNameById = new Map<string, string>();
    for (const t of transfers) {
      if (t.senderTenantName && t.senderTenantName !== '本企业') tenantNameById.set(t.senderTenantId, t.senderTenantName);
      if (t.receiverTenantName && t.receiverTenantName !== '本企业') tenantNameById.set(t.receiverTenantId, t.receiverTenantName);
      // 链上当前 step 的 receiver 通常命名在 route 里（如「阿卡」），同步吸收
      if (Array.isArray(t.outsourceRouteSnapshot)) {
        for (const step of t.outsourceRouteSnapshot) {
          if (step?.receiverTenantId && step?.receiverTenantName && step.receiverTenantId !== myTenantId) {
            tenantNameById.set(step.receiverTenantId, step.receiverTenantName);
          }
        }
      }
    }
    const ensurePeer = (peerId: string): PeerSummary => {
      let s = map.get(peerId);
      if (!s) {
        s = {
          peerTenantId: peerId,
          peerTenantName: tenantNameById.get(peerId) ?? '未知合作单位',
          entries: [],
          pendingDispatches: 0,
          pendingReturns: 0,
          pendingForwards: 0,
          totalItems: 0,
        };
        map.set(peerId, s);
      }
      return s;
    };
    for (const t of transfers) {
      const bindings = peerBindingsForTransfer(t, myTenantId);
      if (bindings.length === 0) continue;
      const isSender = t.senderTenantName === '本企业';
      const isReceiver = t.receiverTenantName === '本企业';
      for (const b of bindings) {
        const s = ensurePeer(b.peerTenantId);
        const dup = s.entries.find(e => e.transfer.id === t.id);
        if (dup) {
          for (const k of b.kinds) dup.kinds.add(k);
        } else {
          s.entries.push({ transfer: t, kinds: new Set(b.kinds) });
        }
        if (b.kinds.has('dispatch') && isReceiver) {
          s.pendingDispatches += (t.dispatches || []).filter((d: any) => d.status === 'PENDING').length;
        }
        if (b.kinds.has('return') && isSender) {
          s.pendingReturns += (t.returns || []).filter((r: any) => r.status === 'PENDING_A_RECEIVE').length;
        }
        if (
          b.kinds.has('forward')
          && isSender
          && t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0
          && !t.originConfirmedAt
        ) {
          s.pendingForwards += 1;
        }
      }
    }
    for (const s of map.values()) {
      s.totalItems = s.entries.reduce((n, e) => {
        let c = 0;
        if (e.kinds.has('dispatch')) c += (e.transfer.dispatches?.length ?? 0);
        if (e.kinds.has('return')) c += (e.transfer.returns?.length ?? 0);
        return n + c;
      }, 0);
    }
    return [...map.values()].sort((a, b) => {
      const pendA = a.pendingDispatches + a.pendingReturns + a.pendingForwards;
      const pendB = b.pendingDispatches + b.pendingReturns + b.pendingForwards;
      if (pendA !== pendB) return pendB - pendA;
      return a.peerTenantName.localeCompare(b.peerTenantName, 'zh-CN');
    });
  }, [transfers, myTenantId]);

  // 默认选中第一个有待办的对端；若之前选中的 peer 已不在列表里则回退到第一个
  useEffect(() => {
    if (!peerSummaries.length) { setSelectedPeerId(null); return; }
    if (!selectedPeerId || !peerSummaries.some(p => p.peerTenantId === selectedPeerId)) {
      setSelectedPeerId(peerSummaries[0].peerTenantId);
    }
  }, [peerSummaries, selectedPeerId]);

  const selectedPeer = useMemo(() => peerSummaries.find(p => p.peerTenantId === selectedPeerId) ?? null, [peerSummaries, selectedPeerId]);

  // ---------- 时间轴构建 ----------
  /**
   * returnGroupId 聚合：乙方批量回传时写入相同 returnGroupId，同批次在时间轴上合并成一个聚合气泡，
   * 允许甲方「批量撤回 / 批量确认收回」。撤回后用户再回传相同出库单号时 returnGroupId 变更 → 出现新气泡。
   */
  const timelineItems = useMemo<TimelineItem[]>(() => {
    if (!selectedPeer) return [];
    const items: TimelineItem[] = [];
    const seenForwardChain = new Set<string>();
    const peerTenantId = selectedPeer.peerTenantId;

    for (const e of selectedPeer.entries) {
      const t = e.transfer;
      // 1) dispatch 气泡：仅当此窗口允许 dispatch 气泡时
      if (e.kinds.has('dispatch')) {
        for (const d of (t.dispatches || [])) {
          items.push({
            kind: 'dispatch',
            at: new Date(d.createdAt).getTime(),
            key: `d:${d.id}`,
            transfer: t,
            doc: d,
          });
        }
      }

      // 2) return 气泡（按 returnGroupId / stockOutDocNo 聚合）：仅当此窗口允许 return 气泡时
      if (e.kinds.has('return')) {
        const retGroupsInTransfer = new Map<string, AggReturnItem[]>();
        const retLeftovers: any[] = [];
        for (const r of (t.returns || [])) {
          const pl: any = r.payload ?? {};
          const gid: string = (pl.returnGroupId && String(pl.returnGroupId).trim()) || '';
          const docNo: string = (pl.stockOutDocNo && String(pl.stockOutDocNo).trim()) || '';
          const groupKey = gid ? `g:${gid}` : (docNo ? `n:${docNo}` : '');
          if (!groupKey) { retLeftovers.push(r); continue; }
          const arr = retGroupsInTransfer.get(groupKey) ?? [];
          arr.push({ doc: r, transfer: t });
          retGroupsInTransfer.set(groupKey, arr);
        }
        for (const [k, arr] of retGroupsInTransfer) {
          const latest = arr.reduce((acc, it) => Math.max(acc, new Date(it.doc.createdAt).getTime()), 0);
          const aggDocNo = (arr[0]?.doc?.payload as any)?.stockOutDocNo ?? '';
          if (arr.length === 1) {
            items.push({ kind: 'return', at: latest, key: `r:${arr[0].doc.id}`, transfer: t, doc: arr[0].doc });
          } else {
            items.push({ kind: 'agg-return', at: latest, key: `agg:${k}:${t.id}`, transfer: t, aggItems: arr, aggDocNo });
          }
        }
        for (const r of retLeftovers) {
          items.push({ kind: 'return', at: new Date(r.createdAt).getTime(), key: `r:${r.id}`, transfer: t, doc: r });
        }
      }

      // 3) forward 气泡：链式子 transfer 的 senderTenantId 在库内为 origin（甲方），乙方需在与上游对话窗也能看到。
      //    · 甲方视角：peer = 上一站接收方（乙方），parentReceiver === peer。
      //    · 乙方视角：peer = 上游（甲方），本人是 parent 的接收方且 parent 的发送方 === peer。
      if (
        e.kinds.has('forward')
        && t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0
        && t.parentTransferId
      ) {
        const parent = transfers.find(x => x.id === t.parentTransferId);
        const parentReceiver = parent?.receiverTenantId ?? null;
        const parentSender = parent?.senderTenantId ?? null;
        const isOriginSide = (t.originTenantId ?? t.senderTenantId) === myTenantId && parentReceiver === peerTenantId;
        const isForwarderSide = parentReceiver === myTenantId && parentSender === peerTenantId;
        if (isOriginSide || isForwarderSide) {
          const firstDispatch = (t.dispatches || [])[0];
          const sharedDocNo = (firstDispatch?.payload as any)?.stockOutDocNo ?? '';
          const chainKey = sharedDocNo ? `fwd:${sharedDocNo}:${t.parentTransferId}` : `fwd:${t.id}`;
          if (!seenForwardChain.has(chainKey)) {
            seenForwardChain.add(chainKey);
            const siblings = sharedDocNo
              ? transfers.filter(x => x.parentTransferId === t.parentTransferId && (x.dispatches || []).some((d: any) => (d.payload as any)?.stockOutDocNo === sharedDocNo))
              : [t];
            const at = siblings.reduce((acc, x) => Math.max(acc, new Date(x.createdAt).getTime()), 0);
            items.push({ kind: 'forward', at, key: chainKey, transfer: t, forwardTransfer: t, forwardSiblings: siblings });
          }
        }
      }
    }

    items.sort((a, b) => a.at - b.at);
    return items;
  }, [selectedPeer, myTenantId, transfers]);

  // ---------- 右上批量按钮可用项（按当前窗口的 kinds 过滤，避免错位） ----------
  const returnEntries = useMemo(() => (selectedPeer?.entries ?? []).filter(e => e.kinds.has('return')), [selectedPeer]);
  const forwardEntries = useMemo(() => (selectedPeer?.entries ?? []).filter(e => e.kinds.has('forward')), [selectedPeer]);

  const returnableTransfers = useMemo(() => {
    const seenProduct = new Set<string>();
    return returnEntries
      .map(e => e.transfer)
      .filter(t =>
        t.receiverTenantName === '本企业'
        && (t.status === 'OPEN' || t.status === 'PARTIALLY_RECEIVED')
        && (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED' || d.status === 'FORWARDED')
        && !(t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot) && (t.chainStep ?? 0) < Math.max(...(t.outsourceRouteSnapshot as any[]).map((s: any) => s.stepOrder ?? 0)))
      )
      .filter(t => {
        const pid = t.receiverProductId || t.id;
        if (seenProduct.has(pid)) return false;
        seenProduct.add(pid);
        return true;
      });
  }, [returnEntries]);

  /** 与回传弹窗首次打开一致：默认出库仓 + 库存上限；无可回传规格时不亮红点 */
  const returnableTransfersWithRows = useMemo(() => {
    if (!returnableTransfers.length) return [];
    const peerTid = returnableTransfers[0]?.senderTenantId ?? '';
    const defaultWh = resolveCollabOutboundWarehouseId(
      warehouses,
      tenantCtx?.tenantId,
      userId,
      WAREHOUSE_DOC_KIND.COLLAB_RETURN,
      peerTid || undefined,
    );
    const requireWarehouse = warehouses.length > 0;
    return returnableTransfers.filter(t =>
      computeCollaborationReturnableRows(
        t,
        defaultWh || undefined,
        products,
        prodRecords,
        dictionaries,
        requireWarehouse,
      ).length > 0,
    );
  }, [returnableTransfers, warehouses, tenantCtx?.tenantId, userId, products, prodRecords, dictionaries]);

  const forwardableTransfers = useMemo(() => {
    const seenProduct = new Set<string>();
    return (selectedPeer?.entries ?? [])
      .map(e => e.transfer)
      .filter(t => {
        if (t.receiverTenantName !== '本企业') return false;
        if (!(t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot))) return false;
        const steps = (t.outsourceRouteSnapshot as any[]);
        const maxStep = Math.max(...steps.map((s: any) => s.stepOrder ?? 0));
        if ((t.chainStep ?? 0) >= maxStep) return false;
        return (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED' || d.status === 'FORWARDED');
      })
      .filter(t => {
        const pid = t.receiverProductId || t.id;
        if (seenProduct.has(pid)) return false;
        seenProduct.add(pid);
        return true;
      });
  }, [selectedPeer]);

  /** 与转发弹窗一致：有出库仓要求时需选仓后才认为有可转规格；用于转发按钮红点 */
  const forwardableTransfersWithRows = useMemo(() => {
    if (!forwardableTransfers.length) return [];
    const peerTid = forwardableTransfers[0]?.senderTenantId ?? '';
    const defaultWh = resolveCollabOutboundWarehouseId(
      warehouses,
      tenantCtx?.tenantId,
      userId,
      WAREHOUSE_DOC_KIND.COLLAB_FORWARD,
      peerTid || undefined,
    );
    const requireWarehouse = warehouses.length > 0;
    const wh = requireWarehouse ? (defaultWh || undefined) : undefined;
    return forwardableTransfers.filter(t =>
      computeCollaborationForwardableRows(t, wh, products, prodRecords, dictionaries, transfers).length > 0,
    );
  }, [forwardableTransfers, warehouses, tenantCtx?.tenantId, userId, products, prodRecords, dictionaries, transfers]);

  const pendingReceiveItems = useMemo<Array<{ ret: any; transfer: any }>>(() => {
    const arr: Array<{ ret: any; transfer: any }> = [];
    for (const e of returnEntries) {
      const t = e.transfer;
      if (t.senderTenantName !== '本企业') continue;
      for (const r of (t.returns || [])) {
        if (r.status === 'PENDING_A_RECEIVE') arr.push({ ret: r, transfer: t });
      }
    }
    return arr;
  }, [returnEntries]);

  const pendingConfirmForwards = useMemo(() => {
    return forwardEntries
      .map(e => e.transfer)
      .filter(t =>
        t.senderTenantName === '本企业'
        && t.outsourceRouteSnapshot
        && (t.chainStep ?? 0) > 0
        && !t.originConfirmedAt
      );
  }, [forwardEntries]);

  /** 乙方可与合作单位关联的 peerTransfers：用于历史回传价格查询 */
  const peerTransfersForPricing = useMemo(() => selectedPeer?.entries.map(e => e.transfer) ?? [], [selectedPeer]);

  // ---------- 滚动指纹：窗口切换、任何 bubble 变化都滚到底 ----------
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const selectedTimelineDataKey = useMemo(() => {
    if (!selectedPeer) return '';
    const parts: string[] = [selectedPeer.peerTenantId];
    for (const it of timelineItems) {
      if (it.kind === 'dispatch' || it.kind === 'return') parts.push(`${it.key}:${(it.doc as any)?.status}:${(it.doc as any)?.updatedAt ?? (it.doc as any)?.createdAt}`);
      else if (it.kind === 'agg-return') parts.push(`${it.key}:${it.aggItems?.map(a => a.doc.status).join(',')}`);
      else if (it.kind === 'forward') parts.push(`${it.key}:${(it.forwardTransfer as any)?.originConfirmedAt ?? ''}`);
    }
    return parts.join('|');
  }, [selectedPeer, timelineItems]);
  useLayoutEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [selectedTimelineDataKey]);

  if (viewMode === 'maps') {
    return (
      <CollabProductMapsPanel
        onBack={() => setViewMode('inbox')}
        products={products}
      />
    );
  }

  const collabUtilityModals = (
    <>
      {returnFlowModalOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setReturnFlowModalOpen(false)} />
          <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-slate-50 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 min-w-0">
                <Truck className="w-5 h-5 text-emerald-600 shrink-0" /> 协作流水
              </h2>
              <button type="button" onClick={() => setReturnFlowModalOpen(false)} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0" aria-label="关闭">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
              <CollabReturnFlowPanel
                embeddedInModal
                onBack={() => setReturnFlowModalOpen(false)}
                transfers={transfers}
                myTenantId={myTenantId}
                prodRecords={prodRecords}
                products={products}
                warehouses={warehouses}
                dictionaries={dictionaries}
                onRefreshProdRecords={onRefreshProdRecords}
              />
            </div>
          </div>
        </div>
      )}

      {settingsModalOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSettingsModalOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-slate-50 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 min-w-0">
                <Settings2 className="w-5 h-5 text-indigo-600 shrink-0" /> 协作设置
              </h2>
              <button type="button" onClick={() => setSettingsModalOpen(false)} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0" aria-label="关闭">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
              <CollabSettingsPanel
                embeddedInModal
                onBack={() => setSettingsModalOpen(false)}
                activeCollabs={activeCollabs}
                partners={partners}
                partnerCategories={partnerCategories}
                onRefreshPartners={onRefreshPartners}
                onRefreshCollabs={() => refreshCollabs(true)}
              />
            </div>
          </div>
        </div>
      )}

      {routesModalOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setRoutesModalOpen(false)} />
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-slate-50 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 min-w-0">
                <Route className="w-5 h-5 text-orange-500 shrink-0" /> 外协路线
              </h2>
              <button type="button" onClick={() => setRoutesModalOpen(false)} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0" aria-label="关闭">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
              <CollabRoutesPanel
                embeddedInModal
                onBack={() => setRoutesModalOpen(false)}
                nodeTemplates={nodeTemplates}
                activeCollabs={activeCollabs}
                partners={partners}
              />
            </div>
          </div>
        </div>
      )}

      {returnModalOpen && (
        <CollabPeerReturnModal
          open={returnModalOpen}
          onClose={() => setReturnModalOpen(false)}
          eligibleTransfers={returnableTransfers}
          peerTransfers={peerTransfersForPricing}
          warehouses={warehouses}
          products={products}
          prodRecords={prodRecords}
          dictionaries={dictionaries}
          onDone={async () => { await Promise.all([refresh(), onRefreshProdRecords?.()].filter(Boolean) as Promise<void>[]); }}
        />
      )}

      {forwardModalOpen && (
        <CollabPeerForwardModal
          open={forwardModalOpen}
          onClose={() => setForwardModalOpen(false)}
          eligibleTransfers={forwardableTransfers}
          peerTransfers={peerTransfersForPricing}
          allChainTransfers={transfers}
          warehouses={warehouses}
          products={products}
          prodRecords={prodRecords}
          dictionaries={dictionaries}
          onDone={async () => { await Promise.all([refresh(), onRefreshProdRecords?.()].filter(Boolean) as Promise<void>[]); }}
        />
      )}

      {receiveModalOpen && (
        <CollabPeerReceiveModal
          open={receiveModalOpen}
          onClose={() => setReceiveModalOpen(false)}
          items={pendingReceiveItems}
          onDone={async () => { await Promise.all([refresh(), onRefreshProdRecords?.(), onRefreshOrders?.(), onRefreshPMP?.()].filter(Boolean) as Promise<void>[]); }}
        />
      )}

      {confirmForwardModalOpen && (
        <CollabPeerConfirmForwardModal
          open={confirmForwardModalOpen}
          onClose={() => setConfirmForwardModalOpen(false)}
          transfers={pendingConfirmForwards}
          onDone={async () => { await Promise.all([refresh(), onRefreshProdRecords?.(), onRefreshOrders?.(), onRefreshPMP?.()].filter(Boolean) as Promise<void>[]); }}
        />
      )}

      {docDetail && (
        <CollabDocDetailModal
          open
          onClose={() => setDocDetail(null)}
          docKind={docDetail.kind}
          doc={docDetail.doc}
          transfer={docDetail.transfer}
          warehouses={warehouses}
          products={products}
          partners={partners}
          prodRecords={prodRecords}
          dictionaries={dictionaries}
          onRefreshList={refresh}
          onRefreshOrders={onRefreshOrders}
          onRefreshProdRecords={onRefreshProdRecords}
          onRefreshPMP={onRefreshPMP}
          onRefreshProducts={onRefreshProducts}
        />
      )}

      {forwardDetailSiblings && forwardDetailSiblings.length > 0 && (
        <CollabForwardDetailModal
          key={forwardDetailSiblings.map((s: any) => s.id).join('|')}
          open
          onClose={() => setForwardDetailSiblings(null)}
          siblings={forwardDetailSiblings}
          onDone={async () => { await Promise.all([refresh(), onRefreshProdRecords?.(), onRefreshOrders?.(), onRefreshPMP?.()].filter(Boolean) as Promise<void>[]); }}
        />
      )}

      {aggReturnDetail && (
        <CollabAggReturnDetailModal
          open
          docNo={aggReturnDetail.docNo}
          items={aggReturnDetail.items}
          products={products}
          dictionaries={dictionaries}
          onClose={() => setAggReturnDetail(null)}
          onRefreshList={refresh}
          onRefreshProdRecords={onRefreshProdRecords}
          onRefreshOrders={onRefreshOrders}
          onRefreshPMP={onRefreshPMP}
        />
      )}
    </>
  );

  return (
    <>
    <div className="w-full min-w-0 space-y-1.5">
      <div className={moduleHeaderRowClass}>
        <div className="min-w-0">
          <h1 className={pageTitleClass}>协作管理</h1>
          <p className={pageSubtitleClass}>处理委托与承接协作单，维护外协路线、物料对照与协作关系</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-end sm:justify-end shrink-0 w-full sm:w-auto min-w-0">
          <button type="button" onClick={() => setSettingsModalOpen(true)} className={outlineToolbarButtonClass}>
            <Settings2 className="w-4 h-4 shrink-0" /> 协作设置
          </button>
          <button type="button" onClick={() => setRoutesModalOpen(true)} className={outlineToolbarButtonClass}>
            <Route className="w-4 h-4 shrink-0" /> 外协路线
          </button>
          <button type="button" onClick={() => setViewMode('maps')} className={outlineToolbarButtonClass}>
            <Link2 className="w-4 h-4 shrink-0" /> 对照表
          </button>
          <button type="button" onClick={() => setReturnFlowModalOpen(true)} className={outlineToolbarButtonClass}>
            <Truck className="w-4 h-4 shrink-0" /> 协作流水
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">加载中...</div>
      ) : peerSummaries.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">暂无协作单</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 md:gap-4 min-w-0 h-[calc(100vh-108px)] min-h-[520px]">
          {/* 左：对端列表 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-black text-slate-500">
              <Users className="w-4 h-4 text-indigo-500" /> 合作单位 ({peerSummaries.length})
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {peerSummaries.map(s => {
                const pending = s.pendingDispatches + s.pendingReturns + s.pendingForwards;
                const active = s.peerTenantId === selectedPeerId;
                return (
                  <button
                    key={s.peerTenantId}
                    type="button"
                    onClick={() => setSelectedPeerId(s.peerTenantId)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 flex items-center gap-3 transition-colors ${active ? 'bg-indigo-50/80' : 'hover:bg-slate-50'}`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-black">
                      {s.peerTenantName.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-sm font-black truncate ${active ? 'text-indigo-700' : 'text-slate-800'}`}>{s.peerTenantName}</span>
                        {pending > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-rose-500" aria-label="待办" />}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">协作单 {s.entries.length} 张 · 文档 {s.totalItems} 项</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右：时间轴 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
            {selectedPeer ? (
              <>
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="text-sm font-black text-slate-900 truncate">{selectedPeer.peerTenantName}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">{selectedPeer.entries.length} 张协作单</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 乙方视角：回传 / 转发（派发接受在单据详情内） */}
                    {returnableTransfers.length > 0 && (
                      <ActionButton
                        icon={<Truck className="w-4 h-4" />}
                        label="回传"
                        accent="emerald"
                        dot={returnableTransfersWithRows.length > 0}
                        onClick={() => setReturnModalOpen(true)}
                      />
                    )}
                    {forwardableTransfers.length > 0 && (
                      <ActionButton
                        icon={<Forward className="w-4 h-4" />}
                        label="转发"
                        accent="orange"
                        dot={forwardableTransfersWithRows.length > 0}
                        onClick={() => setForwardModalOpen(true)}
                      />
                    )}
                    {/* 甲方视角：批量确认收回 / 确认转发 */}
                    {pendingReceiveItems.length > 0 && (
                      <ActionButton
                        icon={<PackageCheck className="w-4 h-4" />}
                        label="批量确认收回"
                        accent="indigo"
                        dot
                        onClick={() => setReceiveModalOpen(true)}
                      />
                    )}
                    {pendingConfirmForwards.length > 0 && (
                      <ActionButton
                        icon={<CheckCircle2 className="w-4 h-4" />}
                        label="批量确认转发"
                        accent="amber"
                        dot
                        onClick={() => setConfirmForwardModalOpen(true)}
                      />
                    )}
                  </div>
                </div>

                <div ref={timelineScrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-slate-50">
                  {timelineItems.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">该合作单位暂无文档</div>
                  ) : (
                    <div className="space-y-3">
                      {timelineItems.map(it => (
                        <TimelineBubble
                          key={it.key}
                          item={it}
                          myTenantId={myTenantId}
                          onOpenDoc={(kind, doc, transfer) => setDocDetail({ kind, doc, transfer })}
                          onOpenAgg={(docNo, items) => setAggReturnDetail({ docNo, items })}
                          onOpenForward={siblings => setForwardDetailSiblings(siblings)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">请选择左侧合作单位</div>
            )}
          </div>
        </div>
      )}
    </div>

    {collabUtilityModals}
    </>
  );
};

// ============ 子组件 ============

const accentCls: Record<string, { bg: string; text: string; hover: string; border: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', hover: 'hover:bg-indigo-100', border: 'border-indigo-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hover: 'hover:bg-emerald-100', border: 'border-emerald-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', hover: 'hover:bg-orange-100', border: 'border-orange-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', hover: 'hover:bg-amber-100', border: 'border-amber-200' },
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  accent: 'indigo' | 'emerald' | 'orange' | 'amber';
  dot?: boolean;
  onClick: () => void;
}> = ({ icon, label, accent, dot, onClick }) => {
  const c = accentCls[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border ${c.bg} ${c.text} ${c.border} ${c.hover} transition-colors`}
    >
      {icon}
      {label}
      {dot && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 border border-white" aria-hidden />}
    </button>
  );
};

const TimelineBubble: React.FC<{
  item: TimelineItem;
  myTenantId: string | null;
  onOpenDoc: (kind: 'dispatch' | 'return', doc: any, transfer: any) => void;
  onOpenAgg: (docNo: string, items: AggReturnItem[]) => void;
  onOpenForward: (siblings: any[]) => void;
}> = ({ item, myTenantId, onOpenDoc, onOpenAgg, onOpenForward }) => {
  if (item.kind === 'dispatch') return <DispatchBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenDoc('dispatch', item.doc, item.transfer)} />;
  if (item.kind === 'return') return <ReturnBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenDoc('return', item.doc, item.transfer)} />;
  if (item.kind === 'agg-return') return <AggReturnBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenAgg(item.aggDocNo ?? '', item.aggItems ?? [])} />;
  if (item.kind === 'forward') {
    const siblings = item.forwardSiblings ?? [item.forwardTransfer].filter(Boolean);
    return <ForwardBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenForward(siblings)} />;
  }
  return null;
};

function sumItems(items: any[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, i) => s + (Number((i as any)?.quantity) || 0), 0);
}

const DispatchBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({ item, myTenantId, onOpen }) => {
  const t = item.transfer; const d = item.doc;
  const isSender = t.senderTenantId === myTenantId;
  const side = isSender ? 'right' : 'left';
  const qty = sumItems((d.payload as any)?.items);
  const docNo = ((d.payload as any)?.senderRef?.docNos ?? []).join('、');
  return (
    <BubbleShell side={side} onClick={onOpen} accent="indigo" title="派发">
      <div className="flex items-center gap-2 min-w-0">
        <Package className="w-4 h-4 text-indigo-600 shrink-0" />
        <span className="text-sm font-black text-slate-900 truncate">{t.senderProductName || '—'}</span>
        {t.senderProductSku && <span className="text-xs font-bold text-slate-500 shrink-0">{t.senderProductSku}</span>}
        <span className="ml-auto">{dispatchStatusLabel(d.status)}</span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1 flex gap-2 flex-wrap">
        <span className="font-bold text-slate-700">{qty} 件</span>
        {docNo && <span className="truncate">单号：{docNo}</span>}
        <span>{new Date(d.createdAt).toLocaleString()}</span>
      </div>
    </BubbleShell>
  );
};

const ReturnBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({ item, myTenantId, onOpen }) => {
  const t = item.transfer; const r = item.doc;
  const isSender = t.senderTenantId === myTenantId; // 甲方接收回传
  const side = isSender ? 'left' : 'right'; // 回传是乙方发起，乙方视角=右、甲方视角=左
  const qty = sumItems((r.payload as any)?.items);
  const docNo = (r.payload as any)?.stockOutDocNo ?? '';
  return (
    <BubbleShell side={side} onClick={onOpen} accent="emerald" title="回传">
      <div className="flex items-center gap-2 min-w-0">
        <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-sm font-black text-slate-900 truncate">{t.senderProductName || '—'}</span>
        <span className="ml-auto">{returnStatusLabel(r.status)}</span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1 flex gap-2 flex-wrap">
        <span className="font-bold text-slate-700">{qty} 件</span>
        {docNo && <span className="truncate">单号：{docNo}</span>}
        <span>{new Date(r.createdAt).toLocaleString()}</span>
      </div>
    </BubbleShell>
  );
};

const AggReturnBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({ item, myTenantId, onOpen }) => {
  const t = item.transfer;
  const isSender = t.senderTenantId === myTenantId;
  const side = isSender ? 'left' : 'right';
  const items = item.aggItems ?? [];
  const qty = items.reduce((s, it) => s + sumItems((it.doc.payload as any)?.items), 0);
  const latest = items.reduce((acc, it) => Math.max(acc, new Date(it.doc.createdAt).getTime()), 0);
  const statuses = new Set<string>(items.map(it => String(it.doc.status)));
  const anyPending = statuses.has('PENDING_A_RECEIVE');
  const allReceived = statuses.size === 1 && statuses.has('A_RECEIVED');
  const allWithdrawn = statuses.size === 1 && statuses.has('WITHDRAWN');
  const summaryLabel = allWithdrawn ? '已撤回' : allReceived ? '已收回' : anyPending ? '部分待确认' : '混合状态';
  return (
    <BubbleShell side={side} onClick={onOpen} accent="emerald" title={`批量回传 · ${items.length} 条`}>
      <div className="flex items-center gap-2 min-w-0">
        <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-sm font-black text-slate-900 truncate">{t.senderProductName || '—'}</span>
        <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{summaryLabel}</span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1 flex gap-2 flex-wrap">
        <span className="font-bold text-slate-700">合计 {qty} 件</span>
        {item.aggDocNo && <span className="truncate">单号：{item.aggDocNo}</span>}
        <span>{new Date(latest).toLocaleString()}</span>
      </div>
    </BubbleShell>
  );
};

const ForwardBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({ item, myTenantId, onOpen }) => {
  const siblings = item.forwardSiblings ?? [item.forwardTransfer].filter(Boolean);
  const first = siblings[0] || item.forwardTransfer;
  const route = Array.isArray(first.outsourceRouteSnapshot) ? first.outsourceRouteSnapshot : [];
  const step = route.find((s: any) => s.stepOrder === first.chainStep);
  const label = step ? `${step.nodeName ?? '未命名工序'} · ${step.receiverTenantName ?? '未知工厂'}` : `第 ${first.chainStep} 站`;
  const qty = siblings.reduce((s, t) => {
    const firstDispatch = (t.dispatches || [])[0];
    return s + sumItems((firstDispatch?.payload as any)?.items);
  }, 0);
  const confirmed = siblings.every((t: any) => !!t.originConfirmedAt);
  const sharedDocNo = ((siblings[0]?.dispatches || [])[0]?.payload as any)?.stockOutDocNo ?? '';
  // 转发方（乙方）视角右侧显示；origin（甲方）视角左侧显示
  const isOriginSide = (first.originTenantId ?? first.senderTenantId) === myTenantId;
  const side: 'left' | 'right' = isOriginSide ? 'left' : 'right';
  return (
    <BubbleShell side={side} accent="orange" title={`转发到下一站 · ${siblings.length > 1 ? `${siblings.length} 个产品` : '单产品'}`} onClick={onOpen}>
      <div className="flex items-center gap-2 min-w-0">
        <Forward className="w-4 h-4 text-orange-600 shrink-0" />
        <span className="text-sm font-black text-slate-900 truncate">
          {siblings.map((t: any) => t.senderProductName).filter(Boolean).join('、') || '—'}
        </span>
        <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">
          {confirmed ? '已确认转发' : '待甲方确认'}
        </span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1 flex gap-2 flex-wrap items-center">
        <span className="font-bold text-slate-700">合计 {qty} 件</span>
        <span className="inline-flex items-center gap-1">
          下一站
          <ChevronRight className="w-3 h-3 text-slate-300" />
          <span className="font-bold text-orange-600">{label}</span>
        </span>
        {sharedDocNo && <span className="truncate">单号：{sharedDocNo}</span>}
        <span>{new Date(first.createdAt).toLocaleString()}</span>
      </div>
    </BubbleShell>
  );
};

const BubbleShell: React.FC<{
  side: 'left' | 'right';
  onClick?: () => void;
  accent: 'indigo' | 'emerald' | 'orange' | 'amber';
  title: string;
  children?: React.ReactNode;
}> = ({ side, onClick, accent, title, children }) => {
  const c = accentCls[accent];
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        onClick={onClick}
        className={`relative max-w-[78%] rounded-2xl border shadow-sm bg-white ${c.border} ${onClick ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow`}
        role={onClick ? 'button' : undefined}
      >
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-2xl text-[10px] font-black uppercase tracking-wide ${c.bg} ${c.text}`}>
          <span>{title}</span>
        </div>
        <div className="px-3 py-2.5">{children}</div>
      </div>
    </div>
  );
};

// firstOrDefault is retained for potential external consumers but unused inline.
void firstOrDefault;
void collabPayloadItemsToQtyMatrixProps; void QtyMatrixTable;

export default React.memo(CollaborationInboxView);
