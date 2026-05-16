/**
 * 协作收件箱 - 时间轴气泡集 (Phase P6 抽离自 CollaborationInboxView)。
 *
 * 包含：ActionButton(右上批量按钮)、BubbleShell、Dispatch/Return/AggReturn/Forward Bubble
 * 以及统一的入口 TimelineBubble。
 */
import React from 'react';
import { ChevronRight, Forward, Package, Truck } from 'lucide-react';
import { COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW } from '../../../types';
import { dispatchStatusLabel, returnStatusLabel } from '../collabHelpers';
import { sumItems } from '../../../utils/collabInboxHelpers';
import type { AggReturnItem } from '../CollabAggReturnDetailModal';
import type { TimelineItem } from '../../../hooks/useCollabInboxState';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = any;

export const accentCls: Record<string, { bg: string; text: string; hover: string; border: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', hover: 'hover:bg-indigo-100', border: 'border-indigo-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', hover: 'hover:bg-emerald-100', border: 'border-emerald-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', hover: 'hover:bg-orange-100', border: 'border-orange-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', hover: 'hover:bg-amber-100', border: 'border-amber-200' },
};

export const ActionButton: React.FC<{
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
        className={`relative max-w-[78%] rounded-2xl border shadow-sm bg-white ${c.border} ${
          onClick ? 'cursor-pointer hover:shadow-md' : ''
        } transition-shadow`}
        role={onClick ? 'button' : undefined}
      >
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-t-2xl text-[10px] font-black uppercase tracking-wide ${c.bg} ${c.text}`}
        >
          <span>{title}</span>
        </div>
        <div className="px-3 py-2.5">{children}</div>
      </div>
    </div>
  );
};

const DispatchBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({
  item,
  myTenantId,
  onOpen,
}) => {
  const t = item.transfer;
  const d = item.doc;
  const isSender = t.senderTenantId === myTenantId;
  const side = isSender ? 'right' : 'left';
  const qty = sumItems((d.payload as AnyDoc)?.items);
  const docNo = ((d.payload as AnyDoc)?.senderRef?.docNos ?? []).join('、');
  const needsPayloadRefresh =
    !isSender && d.status === 'PENDING' && d.amendmentStatus === COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW;
  return (
    <BubbleShell side={side} onClick={onOpen} accent="indigo" title="派发">
      <div className="flex items-center gap-2 min-w-0">
        <Package className="w-4 h-4 text-indigo-600 shrink-0" />
        <span className="text-sm font-black text-slate-900 truncate">{t.senderProductName || '—'}</span>
        {t.senderProductSku && <span className="text-xs font-bold text-slate-500 shrink-0">{t.senderProductSku}</span>}
        {needsPayloadRefresh && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200">
            明细已更新
          </span>
        )}
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

const ReturnBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({
  item,
  myTenantId,
  onOpen,
}) => {
  const t = item.transfer;
  const r = item.doc;
  const isSender = t.senderTenantId === myTenantId;
  const side = isSender ? 'left' : 'right';
  const qty = sumItems((r.payload as AnyDoc)?.items);
  const docNo = (r.payload as AnyDoc)?.stockOutDocNo ?? '';
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

const AggReturnBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({
  item,
  myTenantId,
  onOpen,
}) => {
  const t = item.transfer;
  const isSender = t.senderTenantId === myTenantId;
  const side = isSender ? 'left' : 'right';
  const items = item.aggItems ?? [];
  const qty = items.reduce((s, it) => s + sumItems((it.doc.payload as AnyDoc)?.items), 0);
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
        <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
          {summaryLabel}
        </span>
      </div>
      <div className="text-[11px] text-slate-500 mt-1 flex gap-2 flex-wrap">
        <span className="font-bold text-slate-700">合计 {qty} 件</span>
        {item.aggDocNo && <span className="truncate">单号：{item.aggDocNo}</span>}
        <span>{new Date(latest).toLocaleString()}</span>
      </div>
    </BubbleShell>
  );
};

const ForwardBubble: React.FC<{ item: TimelineItem; myTenantId: string | null; onOpen: () => void }> = ({
  item,
  myTenantId,
  onOpen,
}) => {
  const siblings = item.forwardSiblings ?? [item.forwardTransfer].filter(Boolean);
  const first = siblings[0] || item.forwardTransfer;
  const route = Array.isArray(first.outsourceRouteSnapshot) ? first.outsourceRouteSnapshot : [];
  const step = route.find((s: AnyDoc) => s.stepOrder === first.chainStep);
  const label = step ? `${step.nodeName ?? '未命名工序'} · ${step.receiverTenantName ?? '未知工厂'}` : `第 ${first.chainStep} 站`;
  const qty = siblings.reduce((s: number, t: AnyDoc) => {
    const firstDispatch = (t.dispatches || [])[0];
    return s + sumItems((firstDispatch?.payload as AnyDoc)?.items);
  }, 0);
  const confirmed = siblings.every((t: AnyDoc) => !!t.originConfirmedAt);
  const sharedDocNo = ((siblings[0]?.dispatches || [])[0]?.payload as AnyDoc)?.stockOutDocNo ?? '';
  const isOriginSide = (first.originTenantId ?? first.senderTenantId) === myTenantId;
  const side: 'left' | 'right' = isOriginSide ? 'left' : 'right';
  return (
    <BubbleShell
      side={side}
      accent="orange"
      title={`转发到下一站 · ${siblings.length > 1 ? `${siblings.length} 个产品` : '单产品'}`}
      onClick={onOpen}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Forward className="w-4 h-4 text-orange-600 shrink-0" />
        <span className="text-sm font-black text-slate-900 truncate">
          {siblings.map((t: AnyDoc) => t.senderProductName).filter(Boolean).join('、') || '—'}
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

export interface TimelineBubbleHandlers {
  onOpenDoc: (kind: 'dispatch' | 'return', doc: AnyDoc, transfer: AnyDoc) => void;
  onOpenAgg: (docNo: string, items: AggReturnItem[]) => void;
  onOpenForward: (siblings: AnyDoc[]) => void;
}

export const TimelineBubble: React.FC<{
  item: TimelineItem;
  myTenantId: string | null;
} & TimelineBubbleHandlers> = ({ item, myTenantId, onOpenDoc, onOpenAgg, onOpenForward }) => {
  if (item.kind === 'dispatch')
    return <DispatchBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenDoc('dispatch', item.doc, item.transfer)} />;
  if (item.kind === 'return')
    return <ReturnBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenDoc('return', item.doc, item.transfer)} />;
  if (item.kind === 'agg-return')
    return <AggReturnBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenAgg(item.aggDocNo ?? '', item.aggItems ?? [])} />;
  if (item.kind === 'forward') {
    const siblings = item.forwardSiblings ?? [item.forwardTransfer].filter(Boolean);
    return <ForwardBubble item={item} myTenantId={myTenantId} onOpen={() => onOpenForward(siblings)} />;
  }
  return null;
};
