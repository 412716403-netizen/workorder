/**
 * 协作收件箱 (CollaborationInboxView) 的状态/派生数据集中托管 hook (Phase P6 抽离)。
 *
 * 负责：
 * - `transfers` 列表加载 + 反推 `myTenantId`
 * - 与 `productionApi` 协作流水的窄拉缓存 (TanStack Query)
 * - `collabs` (协作关系) 列表加载 + 派生 activeCollabs
 * - 以「对端」为维度分组的 peerSummaries / selectedPeer / timelineItems
 * - 派生 returnable / forwardable / pendingReceive / pendingConfirmForward 等
 * - 时间轴滚动指纹 (selectedTimelineDataKey)
 *
 * 不持有：DOM ref（scroll ref 由主壳持有，主壳依据本 hook 暴露的 key 触发滚动）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '../services/api';
import { production as productionApi } from '../services/api';
import { normalizeDecimals } from '../contexts/formSettingsDefaults';
import { fetchAllPages, type PaginatedLike } from '../utils/fetchAllPages';
import { resolveCollabOutboundWarehouseId, WAREHOUSE_DOC_KIND } from '../utils/warehouseDocPreference';
import {
  computeCollaborationForwardableRows,
  computeCollaborationReturnableRows,
} from '../views/collaboration/collabHelpers';
import {
  peerBindingsForTransfer,
  type BubbleKind,
} from '../utils/collabInboxHelpers';
import type { AppDictionaries, Product, ProductionOpRecord, Warehouse } from '../types';
import { COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW } from '../types';
import type { AggReturnItem } from '../views/collaboration/CollabAggReturnDetailModal';

export type DocKind = 'dispatch' | 'return' | 'agg-return' | 'forward';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTransfer = any;

export interface TimelineItem {
  kind: DocKind;
  at: number;
  key: string;
  transfer: AnyTransfer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc?: any;
  aggItems?: AggReturnItem[];
  aggDocNo?: string;
  forwardTransfer?: AnyTransfer;
  forwardSiblings?: AnyTransfer[];
}

export type PeerTransferEntry = { transfer: AnyTransfer; kinds: Set<BubbleKind> };

export interface PeerSummary {
  peerTenantId: string;
  peerTenantName: string;
  entries: PeerTransferEntry[];
  pendingDispatches: number;
  pendingDispatchPayloadRefresh: number;
  pendingReturns: number;
  pendingForwards: number;
  totalItems: number;
}

interface Args {
  warehouses: Warehouse[];
  products: Product[];
  dictionaries: AppDictionaries;
  tenantId: string | undefined;
  userId: string | undefined;
}

export function useCollabInboxState(args: Args) {
  const { warehouses, products, dictionaries, tenantId, userId } = args;

  const queryClient = useQueryClient();
  const [transfers, setTransfers] = useState<AnyTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTenantId, setMyTenantId] = useState<string | null>(null);
  const [collabs, setCollabs] = useState<AnyTransfer[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

  /** Phase 3.D follow-up：协作流水窄拉。仅按 transfers 涉及的 productIds 拉 4 类流水。 */
  const productIdsKey = useMemo(() => {
    const set = new Set<string>();
    for (const t of transfers) {
      const pid = (t as { receiverProductId?: unknown }).receiverProductId;
      if (typeof pid === 'string' && pid) set.add(pid);
    }
    return Array.from(set).sort();
  }, [transfers]);

  /** Phase 3.E follow-up：协作收发箱默认 30 天窗口，避免长期运营后单次返万条。 */
  const collabProdDateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      ymd: `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`,
    };
  }, []);

  const prodRecordsQuery = useQuery({
    queryKey: ['collabInbox.prodRecords', productIdsKey, collabProdDateRange.ymd],
    enabled: productIdsKey.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const all = await fetchAllPages<ProductionOpRecord>(
        page =>
          productionApi.listPage({
            types: 'STOCK_IN,STOCK_OUT,STOCK_RETURN,OUTSOURCE',
            productIds: productIdsKey.join(','),
            page,
            pageSize: 200,
            startDate: collabProdDateRange.startDate,
            endDate: collabProdDateRange.endDate,
          }) as Promise<ProductionOpRecord[] | PaginatedLike<ProductionOpRecord>>,
        { maxPages: 60, warnTag: 'collabInbox.prodRecords' },
      );
      return normalizeDecimals(all) as ProductionOpRecord[];
    },
  });
  const prodRecords = useMemo<ProductionOpRecord[]>(() => {
    if (prodRecordsQuery.isSuccess && Array.isArray(prodRecordsQuery.data)) return prodRecordsQuery.data;
    return [];
  }, [prodRecordsQuery.isSuccess, prodRecordsQuery.data]);

  const onRefreshProdRecords = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['collabInbox.prodRecords'] });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.collaboration.listTransfers({});
      setTransfers(data);
      for (const t of data) {
        if (t.senderTenantName === '本企业') {
          setMyTenantId(t.senderTenantId);
          break;
        }
        if (t.receiverTenantName === '本企业') {
          setMyTenantId(t.receiverTenantId);
          break;
        }
      }
    } catch (err) {
      toast.error((err as Error).message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const collabsLoadedRef = useRef(false);
  const refreshCollabs = useCallback(async (force = false) => {
    if (!force && collabsLoadedRef.current) return;
    try {
      const data = await api.collaboration.listCollaborations();
      setCollabs(data);
      collabsLoadedRef.current = true;
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void refreshCollabs(true);
  }, [refreshCollabs]);
  const activeCollabs = useMemo(() => collabs.filter(c => c.status === 'ACTIVE'), [collabs]);

  /** 以「对端」为维度分组 transfers。详见原文件注释。 */
  const peerSummaries = useMemo<PeerSummary[]>(() => {
    const map = new Map<string, PeerSummary>();
    const tenantNameById = new Map<string, string>();
    for (const t of transfers) {
      if (t.senderTenantName && t.senderTenantName !== '本企业') tenantNameById.set(t.senderTenantId, t.senderTenantName);
      if (t.receiverTenantName && t.receiverTenantName !== '本企业') tenantNameById.set(t.receiverTenantId, t.receiverTenantName);
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
          pendingDispatchPayloadRefresh: 0,
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
          const dispatches = t.dispatches || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.pendingDispatches += dispatches.filter((d: any) => d.status === 'PENDING').length;
          s.pendingDispatchPayloadRefresh += dispatches.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) => d.status === 'PENDING' && d.amendmentStatus === COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW,
          ).length;
        }
        if (b.kinds.has('return') && isSender) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          s.pendingReturns += (t.returns || []).filter((r: any) => r.status === 'PENDING_A_RECEIVE').length;
        }
        if (
          b.kinds.has('forward') &&
          isSender &&
          t.outsourceRouteSnapshot &&
          (t.chainStep ?? 0) > 0 &&
          !t.originConfirmedAt
        ) {
          s.pendingForwards += 1;
        }
      }
    }
    for (const s of map.values()) {
      s.totalItems = s.entries.reduce((n, e) => {
        let c = 0;
        if (e.kinds.has('dispatch')) c += e.transfer.dispatches?.length ?? 0;
        if (e.kinds.has('return')) c += e.transfer.returns?.length ?? 0;
        return n + c;
      }, 0);
    }
    return [...map.values()].sort((a, b) => {
      const pendA = a.pendingDispatches + a.pendingReturns + a.pendingForwards;
      const pendB = b.pendingDispatches + b.pendingReturns + b.pendingForwards;
      if (pendA !== pendB) return pendB - pendA;
      const refA = a.pendingDispatchPayloadRefresh;
      const refB = b.pendingDispatchPayloadRefresh;
      if (refA !== refB) return refB - refA;
      return a.peerTenantName.localeCompare(b.peerTenantName, 'zh-CN');
    });
  }, [transfers, myTenantId]);

  useEffect(() => {
    if (!peerSummaries.length) {
      setSelectedPeerId(null);
      return;
    }
    if (!selectedPeerId || !peerSummaries.some(p => p.peerTenantId === selectedPeerId)) {
      setSelectedPeerId(peerSummaries[0].peerTenantId);
    }
  }, [peerSummaries, selectedPeerId]);

  const selectedPeer = useMemo(
    () => peerSummaries.find(p => p.peerTenantId === selectedPeerId) ?? null,
    [peerSummaries, selectedPeerId],
  );

  /** 时间轴构建（注释详见原文件） */
  const timelineItems = useMemo<TimelineItem[]>(() => {
    if (!selectedPeer) return [];
    const items: TimelineItem[] = [];
    const seenForwardChain = new Set<string>();
    const peerTenantId = selectedPeer.peerTenantId;

    for (const e of selectedPeer.entries) {
      const t = e.transfer;
      if (e.kinds.has('dispatch')) {
        for (const d of t.dispatches || []) {
          items.push({ kind: 'dispatch', at: new Date(d.createdAt).getTime(), key: `d:${d.id}`, transfer: t, doc: d });
        }
      }
      if (e.kinds.has('return')) {
        const retGroupsInTransfer = new Map<string, AggReturnItem[]>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retLeftovers: any[] = [];
        for (const r of t.returns || []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pl: any = r.payload ?? {};
          const gid: string = (pl.returnGroupId && String(pl.returnGroupId).trim()) || '';
          const docNo: string = (pl.stockOutDocNo && String(pl.stockOutDocNo).trim()) || '';
          const groupKey = gid ? `g:${gid}` : docNo ? `n:${docNo}` : '';
          if (!groupKey) {
            retLeftovers.push(r);
            continue;
          }
          const arr = retGroupsInTransfer.get(groupKey) ?? [];
          arr.push({ doc: r, transfer: t });
          retGroupsInTransfer.set(groupKey, arr);
        }
        for (const [k, arr] of retGroupsInTransfer) {
          const latest = arr.reduce((acc, it) => Math.max(acc, new Date(it.doc.createdAt).getTime()), 0);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      if (e.kinds.has('forward') && t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0 && t.parentTransferId) {
        const parent = transfers.find(x => x.id === t.parentTransferId);
        const parentReceiver = parent?.receiverTenantId ?? null;
        const parentSender = parent?.senderTenantId ?? null;
        const isOriginSide = (t.originTenantId ?? t.senderTenantId) === myTenantId && parentReceiver === peerTenantId;
        const isForwarderSide = parentReceiver === myTenantId && parentSender === peerTenantId;
        if (isOriginSide || isForwarderSide) {
          const firstDispatch = (t.dispatches || [])[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sharedDocNo = (firstDispatch?.payload as any)?.stockOutDocNo ?? '';
          const chainKey = sharedDocNo ? `fwd:${sharedDocNo}:${t.parentTransferId}` : `fwd:${t.id}`;
          if (!seenForwardChain.has(chainKey)) {
            seenForwardChain.add(chainKey);
            const siblings = sharedDocNo
              ? transfers.filter(
                  x =>
                    x.parentTransferId === t.parentTransferId &&
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (x.dispatches || []).some((d: any) => (d.payload as any)?.stockOutDocNo === sharedDocNo),
                )
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

  /** 右上批量按钮可用项 */
  const returnEntries = useMemo(
    () => (selectedPeer?.entries ?? []).filter(e => e.kinds.has('return')),
    [selectedPeer],
  );
  const forwardEntries = useMemo(
    () => (selectedPeer?.entries ?? []).filter(e => e.kinds.has('forward')),
    [selectedPeer],
  );

  const returnableTransfers = useMemo(() => {
    const seenProduct = new Set<string>();
    return returnEntries
      .map(e => e.transfer)
      .filter(
        t =>
          t.receiverTenantName === '本企业' &&
          (t.status === 'OPEN' || t.status === 'PARTIALLY_RECEIVED') &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED' || d.status === 'FORWARDED') &&
          !(
            t.outsourceRouteSnapshot &&
            Array.isArray(t.outsourceRouteSnapshot) &&
            (t.chainStep ?? 0) <
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Math.max(...(t.outsourceRouteSnapshot as any[]).map((s: any) => s.stepOrder ?? 0))
          ),
      )
      .filter(t => {
        const pid = t.receiverProductId || t.id;
        if (seenProduct.has(pid)) return false;
        seenProduct.add(pid);
        return true;
      });
  }, [returnEntries]);

  const returnableTransfersWithRows = useMemo(() => {
    if (!returnableTransfers.length) return [];
    const peerTid = returnableTransfers[0]?.senderTenantId ?? '';
    const defaultWh = resolveCollabOutboundWarehouseId(
      warehouses,
      tenantId,
      userId,
      WAREHOUSE_DOC_KIND.COLLAB_RETURN,
      peerTid || undefined,
    );
    const requireWarehouse = warehouses.length > 0;
    return returnableTransfers.filter(
      t =>
        computeCollaborationReturnableRows(
          t,
          defaultWh || undefined,
          products,
          prodRecords,
          dictionaries,
          requireWarehouse,
        ).length > 0,
    );
  }, [returnableTransfers, warehouses, tenantId, userId, products, prodRecords, dictionaries]);

  const forwardableTransfers = useMemo(() => {
    const seenProduct = new Set<string>();
    return (selectedPeer?.entries ?? [])
      .map(e => e.transfer)
      .filter(t => {
        if (t.receiverTenantName !== '本企业') return false;
        if (!(t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot))) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const steps = t.outsourceRouteSnapshot as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maxStep = Math.max(...steps.map((s: any) => s.stepOrder ?? 0));
        if ((t.chainStep ?? 0) >= maxStep) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED' || d.status === 'FORWARDED');
      })
      .filter(t => {
        const pid = t.receiverProductId || t.id;
        if (seenProduct.has(pid)) return false;
        seenProduct.add(pid);
        return true;
      });
  }, [selectedPeer]);

  const forwardableTransfersWithRows = useMemo(() => {
    if (!forwardableTransfers.length) return [];
    const peerTid = forwardableTransfers[0]?.senderTenantId ?? '';
    const defaultWh = resolveCollabOutboundWarehouseId(
      warehouses,
      tenantId,
      userId,
      WAREHOUSE_DOC_KIND.COLLAB_FORWARD,
      peerTid || undefined,
    );
    const requireWarehouse = warehouses.length > 0;
    const wh = requireWarehouse ? defaultWh || undefined : undefined;
    return forwardableTransfers.filter(
      t => computeCollaborationForwardableRows(t, wh, products, prodRecords, dictionaries, transfers).length > 0,
    );
  }, [forwardableTransfers, warehouses, tenantId, userId, products, prodRecords, dictionaries, transfers]);

  const pendingReceiveItems = useMemo<Array<{ ret: AnyTransfer; transfer: AnyTransfer }>>(() => {
    const arr: Array<{ ret: AnyTransfer; transfer: AnyTransfer }> = [];
    for (const e of returnEntries) {
      const t = e.transfer;
      if (t.senderTenantName !== '本企业') continue;
      for (const r of t.returns || []) {
        if (r.status === 'PENDING_A_RECEIVE') arr.push({ ret: r, transfer: t });
      }
    }
    return arr;
  }, [returnEntries]);

  const pendingConfirmForwards = useMemo(() => {
    return forwardEntries
      .map(e => e.transfer)
      .filter(
        t =>
          t.senderTenantName === '本企业' && t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0 && !t.originConfirmedAt,
      );
  }, [forwardEntries]);

  const peerTransfersForPricing = useMemo(
    () => selectedPeer?.entries.map(e => e.transfer) ?? [],
    [selectedPeer],
  );

  /** 时间轴滚动指纹：窗口或任意 bubble 状态变化都重置以滚到底 */
  const selectedTimelineDataKey = useMemo(() => {
    if (!selectedPeer) return '';
    const parts: string[] = [selectedPeer.peerTenantId];
    for (const it of timelineItems) {
      if (it.kind === 'dispatch' || it.kind === 'return') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = it.doc as any;
        parts.push(`${it.key}:${doc?.status}:${doc?.updatedAt ?? doc?.createdAt}`);
      } else if (it.kind === 'agg-return') {
        parts.push(`${it.key}:${it.aggItems?.map(a => a.doc.status).join(',')}`);
      } else if (it.kind === 'forward') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parts.push(`${it.key}:${(it.forwardTransfer as any)?.originConfirmedAt ?? ''}`);
      }
    }
    return parts.join('|');
  }, [selectedPeer, timelineItems]);

  return {
    /* core lists */
    transfers,
    loading,
    myTenantId,
    activeCollabs,
    refresh,
    refreshCollabs,

    /* prod records (narrow) */
    prodRecords,
    onRefreshProdRecords,

    /* peers / selection */
    peerSummaries,
    selectedPeerId,
    setSelectedPeerId,
    selectedPeer,

    /* timeline */
    timelineItems,
    selectedTimelineDataKey,

    /* batch actions */
    returnableTransfers,
    returnableTransfersWithRows,
    forwardableTransfers,
    forwardableTransfersWithRows,
    pendingReceiveItems,
    pendingConfirmForwards,
    peerTransfersForPricing,
  };
}
