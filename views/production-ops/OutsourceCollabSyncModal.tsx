import React, { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import {
  readOutsourceCollabRoutePreference,
  resolvePreferredOutsourceRouteId,
  writeOutsourceCollabRoutePreference,
} from '../../utils/outsourceCollabRoutePreference';

export interface OutsourceCollabSyncConfirmPayload {
  partnerName: string;
  collaborationTenantId: string;
  recordIds: string[];
  /** 本次发出涉及的产品 id（去重）；仅当长度为 1 时用该产品记忆默认路线 */
  productIds: string[];
}

export interface OutsourceCollabSyncModalProps {
  tenantId: string | undefined | null;
  collabSyncConfirm: OutsourceCollabSyncConfirmPayload;
  collabRoutes: CollabOutsourceRouteRow[];
  onClose: () => void;
}

/** 与 `api.collaboration.listOutsourceRoutes` 返回项兼容的最小形状 */
export interface CollabOutsourceRouteRow {
  id: string;
  name?: string;
  steps?: { stepOrder: number; receiverTenantId: string; nodeName: string; receiverTenantName: string }[];
}

const OutsourceCollabSyncModal: React.FC<OutsourceCollabSyncModalProps> = ({
  tenantId,
  collabSyncConfirm,
  collabRoutes,
  onClose,
}) => {
  const [collabSyncing, setCollabSyncing] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState('');

  const matchingRoutes = useMemo(
    () =>
      collabRoutes.filter(r => {
        const sorted = [...(r.steps || [])].sort((a, b) => a.stepOrder - b.stepOrder);
        return sorted.length > 0 && sorted[0].receiverTenantId === collabSyncConfirm.collaborationTenantId;
      }),
    [collabRoutes, collabSyncConfirm.collaborationTenantId],
  );

  useEffect(() => {
    if (collabSyncConfirm.productIds.length !== 1) {
      setSelectedRouteId('');
      return;
    }
    const productId = collabSyncConfirm.productIds[0];
    const saved = readOutsourceCollabRoutePreference(tenantId, productId, collabSyncConfirm.collaborationTenantId);
    const allowedIds = matchingRoutes.map(r => r.id);
    setSelectedRouteId(resolvePreferredOutsourceRouteId(saved, allowedIds));
  }, [tenantId, collabSyncConfirm.collaborationTenantId, collabSyncConfirm.productIds, matchingRoutes]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-600" /> 同步到协作企业
        </h3>
        <p className="text-sm text-slate-600">
          外协工厂「<span className="font-bold text-slate-800">{collabSyncConfirm.partnerName}</span>」已绑定协作企业，是否将本次发出的 {collabSyncConfirm.recordIds.length} 条记录同步？
        </p>
        {matchingRoutes.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">外协路线（可选）</label>
            <select value={selectedRouteId} onChange={e => setSelectedRouteId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-slate-800">
              <option value="">不使用路线（单步外协）</option>
              {matchingRoutes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({(r.steps || []).length} 步)
                </option>
              ))}
            </select>
            {selectedRouteId && (() => {
              const route = collabRoutes.find(r => r.id === selectedRouteId);
              if (!route) return null;
              return (
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  {(route.steps || [])
                    .sort((a, b) => a.stepOrder - b.stepOrder)
                    .map((s, i: number) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="text-slate-400 text-xs">→</span>}
                        <span className="text-xs font-bold text-indigo-600">{s.nodeName}·{s.receiverTenantName}</span>
                      </React.Fragment>
                    ))}
                  <span className="text-slate-400 text-xs">→</span>
                  <span className="text-xs font-bold text-emerald-600">回传</span>
                </div>
              );
            })()}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">暂不发送</button>
          <button type="button" disabled={collabSyncing} onClick={async () => {
            setCollabSyncing(true);
            try {
              const res = await api.collaboration.syncDispatch({
                recordIds: collabSyncConfirm.recordIds,
                collaborationTenantId: collabSyncConfirm.collaborationTenantId,
                ...(selectedRouteId ? { outsourceRouteId: selectedRouteId } : {}),
              });
              if (selectedRouteId) {
                const pidSet = new Set(collabSyncConfirm.productIds.map(p => p.trim()).filter(Boolean));
                for (const pid of pidSet) {
                  writeOutsourceCollabRoutePreference(
                    tenantId,
                    pid,
                    collabSyncConfirm.collaborationTenantId,
                    selectedRouteId,
                  );
                }
              }
              toast.success(`已同步 ${res.dispatches?.length ?? 0} 条到协作企业`);
              onClose();
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : '同步失败');
            } finally {
              setCollabSyncing(false);
            }
          }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {collabSyncing ? '同步中...' : '确认发送'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourceCollabSyncModal);
