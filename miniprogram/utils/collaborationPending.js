/**
 * 协作待办派生（对齐 Web collaborationPending + useCollabInboxState peer 计数）
 */

const COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW = 'PENDING_B_REVIEW';

function opponentName(transfer, asReceiver) {
  if (asReceiver) {
    const name = transfer.senderTenantName;
    if (name && name !== '本企业') return name;
    return transfer.senderTenantId || '未知单位';
  }
  const name = transfer.receiverTenantName;
  if (name && name !== '本企业') return name;
  return transfer.receiverTenantId || '未知单位';
}

function bumpPeer(map, peerName, delta, extra) {
  if (!peerName || delta <= 0) return;
  const prev = map.get(peerName) || { peerName, count: 0, refreshCount: 0 };
  prev.count += delta;
  if (extra && extra.refreshCount) {
    prev.refreshCount += extra.refreshCount;
  }
  map.set(peerName, prev);
}

function mapToSortedItems(map) {
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.peerName.localeCompare(b.peerName, 'zh-CN');
  });
}

/**
 * @param {object[]} transfers
 * @returns {{ sections: object[], totalCount: number, hasPending: boolean }}
 */
function buildCollabPendingSections(transfers) {
  const dispatchPeers = new Map();
  const returnPeers = new Map();
  const forwardPeers = new Map();
  let dispatchCount = 0;
  let returnCount = 0;
  let forwardCount = 0;

  (transfers || []).forEach((t) => {
    const isReceiver = t.receiverTenantName === '本企业';
    const isSender = t.senderTenantName === '本企业';

    if (isReceiver) {
      const dispatches = (t.dispatches || []).filter((d) => d.status === 'PENDING');
      if (dispatches.length > 0) {
        dispatchCount += dispatches.length;
        const refreshCount = dispatches.filter(
          (d) => d.amendmentStatus === COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW,
        ).length;
        bumpPeer(dispatchPeers, opponentName(t, true), dispatches.length, { refreshCount });
      }
    }

    if (isSender) {
      const returns = (t.returns || []).filter((r) => r.status === 'PENDING_A_RECEIVE');
      if (returns.length > 0) {
        returnCount += returns.length;
        bumpPeer(returnPeers, opponentName(t, false), returns.length);
      }

      if (t.originTenantId && (t.chainStep != null ? t.chainStep : 0) > 0 && !t.originConfirmedAt) {
        forwardCount += 1;
        bumpPeer(forwardPeers, opponentName(t, false), 1);
      }
    }
  });

  const sections = [];
  if (dispatchCount > 0) {
    sections.push({
      key: 'dispatch',
      title: '待接收派发',
      count: dispatchCount,
      items: mapToSortedItems(dispatchPeers).map((p) => ({
        peerName: p.peerName,
        count: p.count,
        hint: p.refreshCount > 0 ? `含 ${p.refreshCount} 条明细更新待核对` : '',
      })),
    });
  }
  if (returnCount > 0) {
    sections.push({
      key: 'return',
      title: '待收回回传',
      count: returnCount,
      items: mapToSortedItems(returnPeers).map((p) => ({
        peerName: p.peerName,
        count: p.count,
        hint: '',
      })),
    });
  }
  if (forwardCount > 0) {
    sections.push({
      key: 'forward',
      title: '待确认转发',
      count: forwardCount,
      items: mapToSortedItems(forwardPeers).map((p) => ({
        peerName: p.peerName,
        count: p.count,
        hint: '',
      })),
    });
  }

  const totalCount = dispatchCount + returnCount + forwardCount;
  return {
    sections,
    totalCount,
    hasPending: totalCount > 0,
  };
}

function computeCollaborationNavPending(transfers) {
  return buildCollabPendingSections(transfers).hasPending;
}

module.exports = {
  buildCollabPendingSections,
  computeCollaborationNavPending,
};
