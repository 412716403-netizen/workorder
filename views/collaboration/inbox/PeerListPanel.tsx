/**
 * 协作收件箱 - 左侧合作单位列表 (Phase P6 抽离自 CollaborationInboxView)。
 */
import React from 'react';
import { Users } from 'lucide-react';
import type { PeerSummary } from '../../../hooks/useCollabInboxState';

interface Props {
  peers: PeerSummary[];
  selectedPeerId: string | null;
  onSelect: (peerId: string) => void;
}

const PeerListPanel: React.FC<Props> = ({ peers, selectedPeerId, onSelect }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50 text-xs font-black text-slate-500">
      <Users className="w-4 h-4 text-indigo-500" /> 合作单位 ({peers.length})
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto">
      {peers.map(s => {
        const pending = s.pendingDispatches + s.pendingReturns + s.pendingForwards;
        const active = s.peerTenantId === selectedPeerId;
        return (
          <button
            key={s.peerTenantId}
            type="button"
            onClick={() => onSelect(s.peerTenantId)}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 flex items-center gap-3 transition-colors ${
              active ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
            }`}
          >
            <div className="shrink-0 w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-black">
              {s.peerTenantName.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-sm font-black truncate ${active ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {s.peerTenantName}
                </span>
                {pending > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-rose-500" aria-label="待办" />}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                协作单 {s.entries.length} 张 · 文档 {s.totalItems} 项
              </div>
              {s.pendingDispatchPayloadRefresh > 0 && (
                <div className="text-[11px] font-bold text-amber-700 mt-1">
                  甲方已更新 {s.pendingDispatchPayloadRefresh} 条待发单明细，请打开核对
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

export default PeerListPanel;
