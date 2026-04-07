import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';

export interface OutsourceCollabSyncModalProps {
  collabSyncConfirm: {
    partnerName: string;
    collaborationTenantId: string;
    recordIds: string[];
  };
  collabRoutes: any[];
  onClose: () => void;
}

const OutsourceCollabSyncModal: React.FC<OutsourceCollabSyncModalProps> = ({
  collabSyncConfirm,
  collabRoutes,
  onClose,
}) => {
  const [collabSyncing, setCollabSyncing] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState('');

  const matchingRoutes = collabRoutes.filter((r: any) => {
    const sorted = [...(r.steps || [])].sort((a: any, b: any) => a.stepOrder - b.stepOrder);
    return sorted.length > 0 && sorted[0].receiverTenantId === collabSyncConfirm.collaborationTenantId;
  });

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
              {matchingRoutes.map((r: any) => (<option key={r.id} value={r.id}>{r.name} ({(r.steps || []).length} 步)</option>))}
            </select>
            {selectedRouteId && (() => {
              const route = collabRoutes.find((r: any) => r.id === selectedRouteId);
              if (!route) return null;
              return (
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  {(route.steps || []).sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((s: any, i: number) => (
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
              toast.success(`已同步 ${res.dispatches?.length ?? 0} 条到协作企业`);
              onClose();
            } catch (err: any) {
              toast.error(err.message || '同步失败');
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
