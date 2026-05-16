/**
 * 协作收件箱主壳 (Phase P6 拆分后)。
 *
 * 当前职责:
 * - 顶部 toolbar + maps 切换;
 * - state 通过 `useCollabInboxState` 集中托管(transfers/peers/timeline/批量动作);
 * - 左右两栏 → `PeerListPanel` + `TimelineColumn`;
 * - 各类弹窗(设置/路线/流水/回传/转发/接收/确认转发/明细/聚合回传) → `InboxUtilityModals`;
 * - 时间轴滚动 ref 由本主壳持有, 数据指纹变化时执行滚到底。
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link2, Route, Settings2, Truck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData, useOrdersData, useAppActions } from '../contexts/AppDataContext';
import {
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../styles/uiDensity';
import CollabProductMapsPanel from './collaboration/CollabProductMapsPanel';
import PeerListPanel from './collaboration/inbox/PeerListPanel';
import TimelineColumn from './collaboration/inbox/TimelineColumn';
import InboxUtilityModals from './collaboration/inbox/InboxUtilityModals';
import { useCollabInboxState } from '../hooks/useCollabInboxState';
import type { AggReturnItem } from './collaboration/CollabAggReturnDetailModal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

type ViewMode = 'inbox' | 'maps';

const CollaborationInboxView: React.FC = () => {
  const m = useMasterData();
  const o = useOrdersData();
  const a = useAppActions();
  useEffect(() => {
    void a.ensureDeferredLoaded();
  }, [a.ensureDeferredLoaded]);

  const products = m.products;
  const partners = m.partners;
  const categories = m.categories;
  const partnerCategories = m.partnerCategories;
  const warehouses = m.warehouses;
  const dictionaries = m.dictionaries;
  const nodeTemplates = m.globalNodes;
  void o; // orders not directly needed in main shell; hooks use prodRecords narrow

  const onRefreshPartners = a.refreshPartners;
  const onRefreshProducts = a.refreshProducts;
  const onRefreshOrders = a.refreshOrders;
  const onRefreshPMP = a.refreshPMP;

  const { tenantCtx, userId } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('inbox');

  const s = useCollabInboxState({
    warehouses,
    products,
    dictionaries,
    tenantId: tenantCtx?.tenantId,
    userId: userId ?? undefined,
  });

  /* ---- 各类弹窗的开关/详情 state(轻量, 主壳本地持有) ---- */
  const [returnFlowModalOpen, setReturnFlowModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [routesModalOpen, setRoutesModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [confirmForwardModalOpen, setConfirmForwardModalOpen] = useState(false);
  const [docDetail, setDocDetail] = useState<{ kind: 'dispatch' | 'return'; doc: Any; transfer: Any } | null>(null);
  const [forwardDetailSiblings, setForwardDetailSiblings] = useState<Any[] | null>(null);
  const [aggReturnDetail, setAggReturnDetail] = useState<{ docNo: string; items: AggReturnItem[] } | null>(null);

  /* ---- 时间轴滚动 ref + 数据指纹变化时滚到底 ---- */
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [s.selectedTimelineDataKey]);

  const utilityModals = useMemo(
    () => (
      <InboxUtilityModals
        returnFlowModalOpen={returnFlowModalOpen}
        setReturnFlowModalOpen={setReturnFlowModalOpen}
        settingsModalOpen={settingsModalOpen}
        setSettingsModalOpen={setSettingsModalOpen}
        routesModalOpen={routesModalOpen}
        setRoutesModalOpen={setRoutesModalOpen}
        returnModalOpen={returnModalOpen}
        setReturnModalOpen={setReturnModalOpen}
        forwardModalOpen={forwardModalOpen}
        setForwardModalOpen={setForwardModalOpen}
        receiveModalOpen={receiveModalOpen}
        setReceiveModalOpen={setReceiveModalOpen}
        confirmForwardModalOpen={confirmForwardModalOpen}
        setConfirmForwardModalOpen={setConfirmForwardModalOpen}
        docDetail={docDetail}
        setDocDetail={setDocDetail}
        forwardDetailSiblings={forwardDetailSiblings}
        setForwardDetailSiblings={setForwardDetailSiblings}
        aggReturnDetail={aggReturnDetail}
        setAggReturnDetail={setAggReturnDetail}
        transfers={s.transfers}
        myTenantId={s.myTenantId}
        prodRecords={s.prodRecords}
        products={products}
        partners={partners}
        partnerCategories={partnerCategories}
        categories={categories}
        warehouses={warehouses}
        dictionaries={dictionaries}
        nodeTemplates={nodeTemplates}
        activeCollabs={s.activeCollabs}
        returnableTransfers={s.returnableTransfers}
        forwardableTransfers={s.forwardableTransfers}
        pendingReceiveItems={s.pendingReceiveItems}
        pendingConfirmForwards={s.pendingConfirmForwards}
        peerTransfersForPricing={s.peerTransfersForPricing}
        refresh={s.refresh}
        refreshCollabs={s.refreshCollabs}
        onRefreshProdRecords={s.onRefreshProdRecords}
        onRefreshOrders={onRefreshOrders}
        onRefreshPMP={onRefreshPMP}
        onRefreshProducts={onRefreshProducts}
        onRefreshPartners={onRefreshPartners}
      />
    ),
    [
      returnFlowModalOpen,
      settingsModalOpen,
      routesModalOpen,
      returnModalOpen,
      forwardModalOpen,
      receiveModalOpen,
      confirmForwardModalOpen,
      docDetail,
      forwardDetailSiblings,
      aggReturnDetail,
      s.transfers,
      s.myTenantId,
      s.prodRecords,
      s.activeCollabs,
      s.returnableTransfers,
      s.forwardableTransfers,
      s.pendingReceiveItems,
      s.pendingConfirmForwards,
      s.peerTransfersForPricing,
      s.refresh,
      s.refreshCollabs,
      s.onRefreshProdRecords,
      products,
      partners,
      partnerCategories,
      categories,
      warehouses,
      dictionaries,
      nodeTemplates,
      onRefreshOrders,
      onRefreshPMP,
      onRefreshProducts,
      onRefreshPartners,
    ],
  );

  if (viewMode === 'maps') {
    return <CollabProductMapsPanel onBack={() => setViewMode('inbox')} products={products} />;
  }

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

        {s.loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">加载中...</div>
        ) : s.peerSummaries.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">暂无协作单</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 md:gap-4 min-w-0 h-[calc(100vh-108px)] min-h-[520px]">
            <PeerListPanel
              peers={s.peerSummaries}
              selectedPeerId={s.selectedPeerId}
              onSelect={s.setSelectedPeerId}
            />

            {s.selectedPeer ? (
              <TimelineColumn
                selectedPeer={s.selectedPeer}
                timelineItems={s.timelineItems}
                myTenantId={s.myTenantId}
                timelineScrollRef={timelineScrollRef}
                returnableTransfersLen={s.returnableTransfers.length}
                returnableWithRowsLen={s.returnableTransfersWithRows.length}
                forwardableTransfersLen={s.forwardableTransfers.length}
                forwardableWithRowsLen={s.forwardableTransfersWithRows.length}
                pendingReceiveLen={s.pendingReceiveItems.length}
                pendingConfirmForwardLen={s.pendingConfirmForwards.length}
                onOpenReturnModal={() => setReturnModalOpen(true)}
                onOpenForwardModal={() => setForwardModalOpen(true)}
                onOpenReceiveModal={() => setReceiveModalOpen(true)}
                onOpenConfirmForwardModal={() => setConfirmForwardModalOpen(true)}
                onOpenDoc={(kind, doc, transfer) => setDocDetail({ kind, doc, transfer })}
                onOpenAgg={(docNo, items) => setAggReturnDetail({ docNo, items })}
                onOpenForward={siblings => setForwardDetailSiblings(siblings)}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 flex items-center justify-center text-sm text-slate-400">
                请选择左侧合作单位
              </div>
            )}
          </div>
        )}
      </div>

      {utilityModals}
    </>
  );
};

export default React.memo(CollaborationInboxView);
