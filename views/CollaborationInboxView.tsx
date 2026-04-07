import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Package, Route, Settings2, Link2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../services/api';
import { moduleHeaderRowClass, outlineToolbarButtonClass, pageSubtitleClass, pageTitleClass } from '../styles/uiDensity';
import type { Product, Partner, PartnerCategory, ProductionOpRecord, Warehouse, ProductionOrder, AppDictionaries, GlobalNodeTemplate } from '../types';
import { statusLabel } from './collaboration/collabHelpers';
import CollabSettingsPanel from './collaboration/CollabSettingsPanel';
import CollabRoutesPanel from './collaboration/CollabRoutesPanel';
import CollabProductMapsPanel from './collaboration/CollabProductMapsPanel';
import CollabTransferDetailPanel from './collaboration/CollabTransferDetailPanel';

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

const CollaborationInboxView: React.FC<CollaborationInboxViewProps> = ({
  products, partners, partnerCategories, orders, prodRecords, warehouses, dictionaries, nodeTemplates,
  onRefreshPartners, onRefreshProducts, onRefreshOrders, onRefreshProdRecords, onRefreshPMP,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransfer, setSelectedTransfer] = useState<any>(null);
  const [collabs, setCollabs] = useState<any[]>([]);
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

  // ---- VIEW MODE ROUTING ----

  if (viewMode === 'settings') {
    return (
      <CollabSettingsPanel
        onBack={() => setViewMode('inbox')}
        activeCollabs={activeCollabs}
        partners={partners}
        partnerCategories={partnerCategories}
        onRefreshPartners={onRefreshPartners}
        onRefreshCollabs={() => refreshCollabs(true)}
      />
    );
  }

  if (viewMode === 'routes') {
    return (
      <CollabRoutesPanel
        onBack={() => setViewMode('inbox')}
        nodeTemplates={nodeTemplates}
        activeCollabs={activeCollabs}
        partners={partners}
      />
    );
  }

  if (viewMode === 'maps') {
    return (
      <CollabProductMapsPanel
        onBack={() => setViewMode('inbox')}
        products={products}
      />
    );
  }

  if (viewMode === 'detail' && selectedTransfer) {
    return (
      <CollabTransferDetailPanel
        initialTransfer={selectedTransfer}
        onBack={() => { setViewMode('inbox'); setSelectedTransfer(null); }}
        onRefreshList={refresh}
        warehouses={warehouses}
        products={products}
        prodRecords={prodRecords}
        dictionaries={dictionaries}
        onRefreshProdRecords={onRefreshProdRecords}
        onRefreshOrders={onRefreshOrders}
        onRefreshPMP={onRefreshPMP}
        onRefreshProducts={onRefreshProducts}
      />
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
            onClick={() => setViewMode('routes')}
            className={outlineToolbarButtonClass}
          >
            <Route className="w-4 h-4 shrink-0" /> 外协路线
          </button>
          <button type="button" onClick={() => setViewMode('maps')} className={outlineToolbarButtonClass}>
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
