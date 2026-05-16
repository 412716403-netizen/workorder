/**
 * 协作收件箱 - 各类工具/详情弹窗集中编排 (Phase P6 抽离自 CollaborationInboxView)。
 *
 * 这里只是"渲染哪个弹窗"的薄壳；状态由主壳/hook 持有，回调统一上抛。
 */
import React from 'react';
import { Route, Settings2, Truck, X } from 'lucide-react';
import CollabSettingsPanel from '../CollabSettingsPanel';
import CollabRoutesPanel from '../CollabRoutesPanel';
import CollabReturnFlowPanel from '../CollabReturnFlowPanel';
import CollabPeerReturnModal from '../CollabPeerReturnModal';
import CollabPeerForwardModal from '../CollabPeerForwardModal';
import CollabPeerReceiveModal from '../CollabPeerReceiveModal';
import CollabPeerConfirmForwardModal from '../CollabPeerConfirmForwardModal';
import CollabDocDetailModal from '../CollabDocDetailModal';
import CollabForwardDetailModal from '../CollabForwardDetailModal';
import CollabAggReturnDetailModal, { type AggReturnItem } from '../CollabAggReturnDetailModal';
import type {
  AppDictionaries,
  Partner,
  PartnerCategory,
  Product,
  ProductionOpRecord,
  GlobalNodeTemplate,
  Warehouse,
} from '../../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Props {
  /* utility modal flags */
  returnFlowModalOpen: boolean;
  setReturnFlowModalOpen: (v: boolean) => void;
  settingsModalOpen: boolean;
  setSettingsModalOpen: (v: boolean) => void;
  routesModalOpen: boolean;
  setRoutesModalOpen: (v: boolean) => void;

  /* peer action modals */
  returnModalOpen: boolean;
  setReturnModalOpen: (v: boolean) => void;
  forwardModalOpen: boolean;
  setForwardModalOpen: (v: boolean) => void;
  receiveModalOpen: boolean;
  setReceiveModalOpen: (v: boolean) => void;
  confirmForwardModalOpen: boolean;
  setConfirmForwardModalOpen: (v: boolean) => void;

  /* detail modals */
  docDetail: { kind: 'dispatch' | 'return'; doc: Any; transfer: Any } | null;
  setDocDetail: (v: { kind: 'dispatch' | 'return'; doc: Any; transfer: Any } | null) => void;
  forwardDetailSiblings: Any[] | null;
  setForwardDetailSiblings: (v: Any[] | null) => void;
  aggReturnDetail: { docNo: string; items: AggReturnItem[] } | null;
  setAggReturnDetail: (v: { docNo: string; items: AggReturnItem[] } | null) => void;

  /* shared data */
  transfers: Any[];
  myTenantId: string | null;
  prodRecords: ProductionOpRecord[];
  products: Product[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  categories: Any[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  nodeTemplates: GlobalNodeTemplate[];
  activeCollabs: Any[];

  /* batch-action inputs */
  returnableTransfers: Any[];
  forwardableTransfers: Any[];
  pendingReceiveItems: Array<{ ret: Any; transfer: Any }>;
  pendingConfirmForwards: Any[];
  peerTransfersForPricing: Any[];

  /* refresh callbacks */
  refresh: () => Promise<void>;
  refreshCollabs: (force?: boolean) => Promise<void>;
  onRefreshProdRecords: () => Promise<void>;
  onRefreshOrders?: () => Promise<void> | void;
  onRefreshPMP?: () => Promise<void> | void;
  onRefreshProducts?: () => Promise<void> | void;
  onRefreshPartners?: () => Promise<void> | void;
}

const Shell: React.FC<{
  title: React.ReactNode;
  icon: React.ReactNode;
  max: 'sm' | 'md' | 'lg' | 'xl';
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, icon, max, onClose, children }) => {
  const maxCls = { sm: 'max-w-2xl', md: 'max-w-3xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[max];
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${maxCls} max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-slate-50 overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 min-w-0">
            {icon}
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
};

const InboxUtilityModals: React.FC<Props> = props => {
  const {
    returnFlowModalOpen,
    setReturnFlowModalOpen,
    settingsModalOpen,
    setSettingsModalOpen,
    routesModalOpen,
    setRoutesModalOpen,
    returnModalOpen,
    setReturnModalOpen,
    forwardModalOpen,
    setForwardModalOpen,
    receiveModalOpen,
    setReceiveModalOpen,
    confirmForwardModalOpen,
    setConfirmForwardModalOpen,
    docDetail,
    setDocDetail,
    forwardDetailSiblings,
    setForwardDetailSiblings,
    aggReturnDetail,
    setAggReturnDetail,
    transfers,
    myTenantId,
    prodRecords,
    products,
    partners,
    partnerCategories,
    categories,
    warehouses,
    dictionaries,
    nodeTemplates,
    activeCollabs,
    returnableTransfers,
    forwardableTransfers,
    pendingReceiveItems,
    pendingConfirmForwards,
    peerTransfersForPricing,
    refresh,
    refreshCollabs,
    onRefreshProdRecords,
    onRefreshOrders,
    onRefreshPMP,
    onRefreshProducts,
    onRefreshPartners,
  } = props;

  const onDoneSet = async () => {
    await Promise.all(
      [refresh(), onRefreshProdRecords?.(), onRefreshOrders?.(), onRefreshPMP?.()].filter(Boolean) as Promise<void>[],
    );
  };

  return (
    <>
      {returnFlowModalOpen && (
        <Shell
          title="协作流水"
          icon={<Truck className="w-5 h-5 text-emerald-600 shrink-0" />}
          max="xl"
          onClose={() => setReturnFlowModalOpen(false)}
        >
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
        </Shell>
      )}

      {settingsModalOpen && (
        <Shell
          title="协作设置"
          icon={<Settings2 className="w-5 h-5 text-indigo-600 shrink-0" />}
          max="sm"
          onClose={() => setSettingsModalOpen(false)}
        >
          <CollabSettingsPanel
            embeddedInModal
            onBack={() => setSettingsModalOpen(false)}
            activeCollabs={activeCollabs}
            partners={partners}
            partnerCategories={partnerCategories}
            onRefreshPartners={onRefreshPartners}
            onRefreshCollabs={() => refreshCollabs(true)}
          />
        </Shell>
      )}

      {routesModalOpen && (
        <Shell
          title="外协路线"
          icon={<Route className="w-5 h-5 text-orange-500 shrink-0" />}
          max="md"
          onClose={() => setRoutesModalOpen(false)}
        >
          <CollabRoutesPanel
            embeddedInModal
            onBack={() => setRoutesModalOpen(false)}
            nodeTemplates={nodeTemplates}
            activeCollabs={activeCollabs}
            partners={partners}
          />
        </Shell>
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
          onDone={async () => {
            await Promise.all([refresh(), onRefreshProdRecords?.()].filter(Boolean) as Promise<void>[]);
          }}
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
          onDone={async () => {
            await Promise.all([refresh(), onRefreshProdRecords?.()].filter(Boolean) as Promise<void>[]);
          }}
        />
      )}

      {receiveModalOpen && (
        <CollabPeerReceiveModal
          open={receiveModalOpen}
          onClose={() => setReceiveModalOpen(false)}
          items={pendingReceiveItems}
          onDone={onDoneSet}
        />
      )}

      {confirmForwardModalOpen && (
        <CollabPeerConfirmForwardModal
          open={confirmForwardModalOpen}
          onClose={() => setConfirmForwardModalOpen(false)}
          transfers={pendingConfirmForwards}
          onDone={onDoneSet}
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
          categories={categories}
          onRefreshList={refresh}
          onRefreshOrders={onRefreshOrders}
          onRefreshProdRecords={onRefreshProdRecords}
          onRefreshPMP={onRefreshPMP}
          onRefreshProducts={onRefreshProducts}
        />
      )}

      {forwardDetailSiblings && forwardDetailSiblings.length > 0 && (
        <CollabForwardDetailModal
          key={forwardDetailSiblings.map((s: Any) => s.id).join('|')}
          open
          onClose={() => setForwardDetailSiblings(null)}
          siblings={forwardDetailSiblings}
          onDone={onDoneSet}
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
};

export default InboxUtilityModals;
