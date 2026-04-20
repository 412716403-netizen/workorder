/** 与协作页头部待办徽章逻辑一致，用于主导航红点 */
export const COLLAB_PENDING_UPDATE_EVENT = 'smarttrack:collab-pending-update';

export type CollabPendingUpdateDetail = { transfers: any[] };

export function computeCollaborationNavPending(transfers: any[]): boolean {
  /** 仅「本企业为接收方」时的待接受派发才算待办；等待对方接受不计入 */
  const pendingDispatchThreads = transfers.filter(t =>
    t.receiverTenantName === '本企业' &&
    (t.dispatches || []).some((d: any) => d.status === 'PENDING'),
  ).length;
  const pendingReturnThreads = transfers.filter(t =>
    t.senderTenantName === '本企业' &&
    (t.returns || []).some((r: any) => r.status === 'PENDING_A_RECEIVE'),
  ).length;
  const pendingForwardThreads = transfers.filter(t =>
    t.originTenantId && t.chainStep > 0 && !t.originConfirmedAt && t.senderTenantName === '本企业',
  ).length;
  return pendingDispatchThreads > 0 || pendingReturnThreads > 0 || pendingForwardThreads > 0;
}
