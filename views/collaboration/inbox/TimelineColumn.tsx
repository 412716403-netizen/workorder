/**
 * 协作收件箱 - 右侧时间轴列 (Phase P6 抽离自 CollaborationInboxView)。
 *
 * 负责：
 * - 当前合作单位的顶栏（标题 + 4 个批量操作按钮）；
 * - 时间轴气泡列表的滚动容器；
 * - 数据变化时滚到底（通过外部传入 ref 实现，主壳负责 useLayoutEffect 触发）。
 */
import React from 'react';
import { CheckCircle2, Forward, PackageCheck, Truck, Users } from 'lucide-react';
import { ActionButton, TimelineBubble, type TimelineBubbleHandlers } from './TimelineBubbles';
import type { PeerSummary, TimelineItem } from '../../../hooks/useCollabInboxState';

interface Props extends TimelineBubbleHandlers {
  selectedPeer: PeerSummary;
  timelineItems: TimelineItem[];
  myTenantId: string | null;
  timelineScrollRef: React.RefObject<HTMLDivElement | null>;

  /** 顶栏批量按钮可用项 */
  returnableTransfersLen: number;
  returnableWithRowsLen: number;
  forwardableTransfersLen: number;
  forwardableWithRowsLen: number;
  pendingReceiveLen: number;
  pendingConfirmForwardLen: number;

  onOpenReturnModal: () => void;
  onOpenForwardModal: () => void;
  onOpenReceiveModal: () => void;
  onOpenConfirmForwardModal: () => void;
}

const TimelineColumn: React.FC<Props> = ({
  selectedPeer,
  timelineItems,
  myTenantId,
  timelineScrollRef,
  returnableTransfersLen,
  returnableWithRowsLen,
  forwardableTransfersLen,
  forwardableWithRowsLen,
  pendingReceiveLen,
  pendingConfirmForwardLen,
  onOpenReturnModal,
  onOpenForwardModal,
  onOpenReceiveModal,
  onOpenConfirmForwardModal,
  onOpenDoc,
  onOpenAgg,
  onOpenForward,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Users className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="text-sm font-black text-slate-900 truncate">{selectedPeer.peerTenantName}</span>
        <span className="text-[11px] text-slate-400 shrink-0">{selectedPeer.entries.length} 张协作单</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {returnableTransfersLen > 0 && (
          <ActionButton
            icon={<Truck className="w-4 h-4" />}
            label="回传"
            accent="emerald"
            dot={returnableWithRowsLen > 0}
            onClick={onOpenReturnModal}
          />
        )}
        {forwardableTransfersLen > 0 && (
          <ActionButton
            icon={<Forward className="w-4 h-4" />}
            label="转发"
            accent="orange"
            dot={forwardableWithRowsLen > 0}
            onClick={onOpenForwardModal}
          />
        )}
        {pendingReceiveLen > 0 && (
          <ActionButton
            icon={<PackageCheck className="w-4 h-4" />}
            label="批量确认收回"
            accent="indigo"
            dot
            onClick={onOpenReceiveModal}
          />
        )}
        {pendingConfirmForwardLen > 0 && (
          <ActionButton
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="批量确认转发"
            accent="amber"
            dot
            onClick={onOpenConfirmForwardModal}
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
              onOpenDoc={onOpenDoc}
              onOpenAgg={onOpenAgg}
              onOpenForward={onOpenForward}
            />
          ))}
        </div>
      )}
    </div>
  </div>
);

export default TimelineColumn;
