/**
 * 消息聊天构建器：把消息中心、待办事项、协作转交融合为「会话列表 + 气泡」
 * 对齐 Web 协作管理（CollaborationInboxView）的聊天式 UI。
 */

const _require = require('./collabInboxHelpers.js'),peerBindingsForTransfer = _require.peerBindingsForTransfer,sumItems = _require.sumItems;
const _require2 =





  require('./collabStatusLabels.js'),dispatchStatusLabel = _require2.dispatchStatusLabel,returnStatusLabel = _require2.returnStatusLabel,forwardStatusLabel = _require2.forwardStatusLabel,dispatchStatusTone = _require2.dispatchStatusTone,returnStatusTone = _require2.returnStatusTone;

const COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW = 'PENDING_B_REVIEW';

const NOTIF_TYPE_META = {
  system: { label: '系统', tone: 'muted' },
  announcement: { label: '公告', tone: 'info' },
  expiry_reminder: { label: '到期', tone: 'warning' },
  todo: { label: '待办', tone: 'success' }
};

const TODO_SOURCE_LABELS = {
  standalone: '独立待办',
  production_order: '生产工单',
  plan: '计划单',
  product: '产品',
  outsource: '外协',
  rework: '返工',
  purchase_order: '采购订单',
  purchase_bill: '采购入库',
  sales_order: '销售订单',
  sales_bill: '销售出库',
  dev_stage: '开发阶段',
  dev_bom: '开发BOM'
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatChatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
  d.getFullYear() === now.getFullYear() &&
  d.getMonth() === now.getMonth() &&
  d.getDate() === now.getDate();
  if (sameDay) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
  d.getFullYear() === yesterday.getFullYear() &&
  d.getMonth() === yesterday.getMonth() &&
  d.getDate() === yesterday.getDate();
  if (isYesterday) {
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function lastBubbleSummary(bubbles) {
  if (!bubbles || bubbles.length === 0) return '';
  const last = bubbles[bubbles.length - 1];
  return last.preview || last.title || '';
}

function avatarText(name) {
  if (!name) return '?';
  return name.slice(0, 2);
}

/**
 * 把 notifications 转为「系统消息」会话的气泡列表
 */
function buildNotificationBubbles(notifications, { excludeTodoType = false } = {}) {
  return (Array.isArray(notifications) ? notifications : []).
  filter((n) => !(excludeTodoType && n.type === 'todo')).
  map((n) => {
    const meta = NOTIF_TYPE_META[n.type] || { label: '消息', tone: 'muted' };
    return {
      id: n.id,
      kind: 'notification',
      side: 'left',
      title: n.title || meta.label,
      body: n.body || '',
      tagLabel: meta.label,
      tagTone: meta.tone,
      timeText: formatChatTime(n.createdAt),
      at: new Date(n.createdAt).getTime() || 0,
      preview: n.title || '',
      raw: n
    };
  });
}

/**
 * 消息中心 + 待办事项合并为同一聊天时间轴（按时间升序，最新在底部）
 */
function buildInboxBubbles(notifications, todos) {
  const notifBubbles = buildNotificationBubbles(notifications, { excludeTodoType: true });
  const todoBubbles = buildTodoBubbles(todos);
  return [...notifBubbles, ...todoBubbles].sort((a, b) => a.at - b.at);
}

/**
 * 把 todos 转为「待办事项」会话的气泡列表
 */
function buildTodoBubbles(todos) {
  return (Array.isArray(todos) ? todos : []).
  map((t) => {
    const sourceLabel = TODO_SOURCE_LABELS[t.sourceType] || t.sourceType || '待办';
    const done = t.status === 'done';
    const title = t.sourceTitle || t.note || sourceLabel;
    const bodyParts = [t.note || ''];
    if (t.sourceDocNo) bodyParts.push(`单号：${t.sourceDocNo}`);
    if (t.remindAt) bodyParts.push(`提醒：${formatChatTime(t.remindAt)}`);
    return {
      id: t.id,
      kind: 'todo',
      side: 'right',
      title,
      body: bodyParts.filter(Boolean).join('\n'),
      tagLabel: done ? '已完成' : '待处理',
      tagTone: done ? 'muted' : 'warning',
      sourceLabel,
      sourceDocNo: t.sourceDocNo || '',
      timeText: formatChatTime(t.updatedAt || t.createdAt),
      at: new Date(t.updatedAt || t.createdAt).getTime() || 0,
      preview: `${done ? '[已完成] ' : ''}${title}`,
      raw: t
    };
  });
}

/**
 * 构建协作会话列表 + 每个会话的时间轴气泡
 * 返回 { peers: PeerConversation[], myTenantId }
 */
function buildCollabConversations(transfers, myTenantId) {
  const list = Array.isArray(transfers) ? transfers : [];
  const peerMap = new Map();

  function ensurePeer(peerTenantId, peerTenantName) {
    let p = peerMap.get(peerTenantId);
    if (!p) {
      p = {
        peerTenantId,
        peerTenantName,
        entries: [],
        pendingDispatches: 0,
        pendingDispatchPayloadRefresh: 0,
        pendingReturns: 0,
        pendingForwards: 0,
        totalItems: 0
      };
      peerMap.set(peerTenantId, p);
    }
    return p;
  }

  function peerNameOf(t, peerTenantId) {
    if (t.senderTenantId === peerTenantId) {
      return t.senderTenantName && t.senderTenantName !== '本企业' ?
      t.senderTenantName :
      peerTenantId;
    }
    return t.receiverTenantName && t.receiverTenantName !== '本企业' ?
    t.receiverTenantName :
    peerTenantId;
  }

  list.forEach((t) => {
    const bindings = peerBindingsForTransfer(t, myTenantId);
    if (bindings.length === 0) return;
    bindings.forEach((b) => {
      const peer = ensurePeer(b.peerTenantId, peerNameOf(t, b.peerTenantId));
      const existing = peer.entries.find((e) => e.transfer.id === t.id);
      if (existing) {
        b.kinds.forEach((k) => existing.kinds.add(k));
      } else {
        peer.entries.push({ transfer: t, kinds: new Set(b.kinds) });
      }
    });
  });

  const peers = [...peerMap.values()].map((p) => {
    let pendingDispatches = 0;
    let pendingDispatchPayloadRefresh = 0;
    let pendingReturns = 0;
    let pendingForwards = 0;
    let totalItems = 0;

    p.entries.forEach((e) => {var _t$chainStep, _t$dispatches$length, _t$dispatches, _t$returns$length, _t$returns;
      const t = e.transfer;
      if (e.kinds.has('dispatch') && t.receiverTenantName === '本企业') {
        const ds = (t.dispatches || []).filter((d) => d.status === 'PENDING');
        pendingDispatches += ds.length;
        pendingDispatchPayloadRefresh += ds.filter(
          (d) => d.amendmentStatus === COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW
        ).length;
      }
      if (e.kinds.has('return') && t.senderTenantName === '本企业') {
        pendingReturns += (t.returns || []).filter((r) => r.status === 'PENDING_A_RECEIVE').length;
      }
      if (
      e.kinds.has('forward') &&
      t.senderTenantName === '本企业' &&
      t.originTenantId &&
      ((_t$chainStep = t.chainStep) != null ? _t$chainStep : 0) > 0 &&
      !t.originConfirmedAt)
      {
        pendingForwards += 1;
      }
      if (e.kinds.has('dispatch')) totalItems += (_t$dispatches$length = (_t$dispatches = t.dispatches) == null ? void 0 : _t$dispatches.length) != null ? _t$dispatches$length : 0;
      if (e.kinds.has('return')) totalItems += (_t$returns$length = (_t$returns = t.returns) == null ? void 0 : _t$returns.length) != null ? _t$returns$length : 0;
    });

    const pending = pendingDispatches + pendingReturns + pendingForwards;
    const bubbles = buildPeerTimelineBubbles(p.entries, myTenantId);
    const lastBubble = bubbles.length > 0 ? bubbles[bubbles.length - 1] : null;

    return {
      kind: 'collab',
      peerTenantId: p.peerTenantId,
      peerTenantName: p.peerTenantName,
      avatarText: avatarText(p.peerTenantName),
      pending,
      pendingDispatches,
      pendingDispatchPayloadRefresh,
      pendingReturns,
      pendingForwards,
      totalItems,
      transferCount: p.entries.length,
      lastTimeText: lastBubble ? lastBubble.timeText : '',
      lastSummary: lastBubble ? lastBubble.preview : '',
      bubbles
    };
  });

  peers.sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending;
    if (b.pendingDispatchPayloadRefresh !== a.pendingDispatchPayloadRefresh) {
      return b.pendingDispatchPayloadRefresh - a.pendingDispatchPayloadRefresh;
    }
    return a.peerTenantName.localeCompare(b.peerTenantName, 'zh-CN');
  });

  return peers;
}

/**
 * 为单个 peer 构建时间轴气泡（对齐 Web timelineItems 构建逻辑）
 */
function buildPeerTimelineBubbles(entries, myTenantId) {
  const items = [];
  const seenForwardChain = new Set();

  entries.forEach((e) => {
    const t = e.transfer;

    if (e.kinds.has('dispatch')) {
      (t.dispatches || []).forEach((d) => {var _d$payload, _d$payload2;
        const isSender = t.senderTenantId === myTenantId;
        items.push({
          id: `d:${d.id}`,
          kind: 'dispatch',
          side: isSender ? 'right' : 'left',
          title: '派发',
          tagLabel: dispatchStatusLabel(d.status),
          tagTone: dispatchStatusTone(d.status),
          productName: t.senderProductName || t.receiverProductName || '',
          productSku: t.senderProductSku || '',
          quantity: sumItems((_d$payload = d.payload) == null ? void 0 : _d$payload.items),
          docNo: (((_d$payload2 = d.payload) == null || (_d$payload2 = _d$payload2.senderRef) == null ? void 0 : _d$payload2.docNos) || []).join('、'),
          timeText: formatChatTime(d.createdAt),
          at: new Date(d.createdAt).getTime() || 0,
          preview: `派发 · ${dispatchStatusLabel(d.status)}`,
          transfer: t,
          doc: d
        });
      });
    }

    if (e.kinds.has('return')) {
      const retGroupsInTransfer = new Map();
      const leftovers = [];
      (t.returns || []).forEach((r) => {
        const pl = r.payload || {};
        const gid = pl.returnGroupId && String(pl.returnGroupId).trim() || '';
        const docNo = pl.stockOutDocNo && String(pl.stockOutDocNo).trim() || '';
        const groupKey = gid ? `g:${gid}` : docNo ? `n:${docNo}` : '';
        if (!groupKey) {
          leftovers.push(r);
          return;
        }
        const arr = retGroupsInTransfer.get(groupKey) || [];
        arr.push(r);
        retGroupsInTransfer.set(groupKey, arr);
      });

      retGroupsInTransfer.forEach((arr, k) => {var _arr$;
        const latest = arr.reduce((acc, it) => Math.max(acc, new Date(it.createdAt).getTime() || 0), 0);
        const aggDocNo = ((_arr$ = arr[0]) == null || (_arr$ = _arr$.doc) == null || (_arr$ = _arr$.payload) == null ? void 0 : _arr$.stockOutDocNo) || '';
        const isSender = t.senderTenantId === myTenantId;
        const side = isSender ? 'left' : 'right';
        const allReceived = arr.every((r) => r.status === 'A_RECEIVED');
        const allWithdrawn = arr.every((r) => r.status === 'WITHDRAWN');
        const summaryLabel = allReceived ?
        '已收回' :
        allWithdrawn ?
        '已撤回' :
        '待甲方收回';
        const qty = arr.reduce((s, r) => {var _r$payload;return s + sumItems((_r$payload = r.payload) == null ? void 0 : _r$payload.items);}, 0);
        items.push({
          id: `agg:${k}:${t.id}`,
          kind: 'agg-return',
          side,
          title: `批量回传 · ${arr.length} 条`,
          tagLabel: summaryLabel,
          tagTone: summaryLabel === '已收回' ? 'success' : summaryLabel === '已撤回' ? 'muted' : 'warning',
          productName: t.senderProductName || t.receiverProductName || '',
          quantity: qty,
          docNo: aggDocNo,
          timeText: formatChatTime(new Date(latest).toISOString()),
          at: latest,
          preview: `批量回传 · ${summaryLabel}`,
          transfer: t,
          aggItems: arr
        });
      });

      leftovers.forEach((r) => {
        const isSender = t.senderTenantId === myTenantId;
        const side = isSender ? 'left' : 'right';
        const pl = r.payload || {};
        items.push({
          id: `r:${r.id}`,
          kind: 'return',
          side,
          title: '回传',
          tagLabel: returnStatusLabel(r.status),
          tagTone: returnStatusTone(r.status),
          productName: t.senderProductName || t.receiverProductName || '',
          quantity: sumItems(pl.items),
          docNo: pl.stockOutDocNo || '',
          timeText: formatChatTime(r.createdAt),
          at: new Date(r.createdAt).getTime() || 0,
          preview: `回传 · ${returnStatusLabel(r.status)}`,
          transfer: t,
          doc: r
        });
      });
    }

    if (e.kinds.has('forward')) {var _t$payload, _t$originTenantId, _t$outsourceRouteSnap;
      const fwdKey = `${t.id}`;
      if (seenForwardChain.has(fwdKey)) return;
      seenForwardChain.add(fwdKey);

      const siblings = [t];
      const sharedDocNo = ((_t$payload = t.payload) == null || (_t$payload = _t$payload.senderRef) == null || (_t$payload = _t$payload.docNos) == null ? void 0 : _t$payload[0]) || '';
      const isOriginSide = ((_t$originTenantId = t.originTenantId) != null ? _t$originTenantId : t.senderTenantId) === myTenantId;
      const side = isOriginSide ? 'left' : 'right';

      const productNames = siblings.
      map((s) => s.senderProductName || s.receiverProductName || '').
      filter(Boolean);
      const totalQty = siblings.reduce((s, x) => {var _x$payload;return s + sumItems((_x$payload = x.payload) == null ? void 0 : _x$payload.items);}, 0);
      const nextStep = ((_t$outsourceRouteSnap = t.outsourceRouteSnapshot) == null || _t$outsourceRouteSnap.find == null ? void 0 : _t$outsourceRouteSnap.find((s) => {var _t$chainStep2;return s.stepOrder === ((_t$chainStep2 = t.chainStep) != null ? _t$chainStep2 : 0);})) || null;

      items.push({
        id: `fwd:${t.id}`,
        kind: 'forward',
        side,
        title: '转发到下一站',
        tagLabel: forwardStatusLabel(t.originConfirmedAt),
        tagTone: t.originConfirmedAt ? 'success' : 'warning',
        productName: productNames.join('、'),
        quantity: totalQty,
        docNo: sharedDocNo,
        nextFactory: (nextStep == null ? void 0 : nextStep.receiverTenantName) || '',
        timeText: formatChatTime(t.createdAt),
        at: new Date(t.createdAt).getTime() || 0,
        preview: `转发 · ${forwardStatusLabel(t.originConfirmedAt)}`,
        transfer: t
      });
    }
  });

  items.sort((a, b) => a.at - b.at);
  return items;
}

function buildConversationEntry({
  kind,
  id,
  title,
  avatarText,
  avatarTone,
  bubbles,
  badge
}) {
  const sorted = [...(bubbles || [])].sort((a, b) => a.at - b.at);
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  return {
    kind,
    id,
    title,
    avatarText,
    avatarTone,
    lastTimeText: (latest == null ? void 0 : latest.timeText) || '',
    lastSummary: (latest == null ? void 0 : latest.preview) || (sorted.length === 0 ? '暂无内容' : ''),
    unread: badge,
    badge,
    bubbles: sorted
  };
}

/**
 * 构建完整的会话列表
 * @returns { conversations: Conversation[], unreadCount: number, collabPendingCount: number }
 */
function buildConversations({ notifications, todos, transfers, tenantId, userId }) {
  const notifBubbles = buildNotificationBubbles(notifications, { excludeTodoType: true });
  const todoBubbles = buildTodoBubbles(todos);

  const readIdSet = (() => {
    try {
      const _require3 = require('./notificationRead.js'),getReadIdSet = _require3.getReadIdSet;
      return getReadIdSet(tenantId, userId);
    } catch {
      return new Set();
    }
  })();

  const unreadNotifCount = notifBubbles.filter(
    (b) => b.kind === 'notification' && b.id && !readIdSet.has(b.id)
  ).length;
  const openTodoCount = todoBubbles.filter((b) => b.tagTone !== 'muted').length;

  const myTenantId = (() => {
    try {
      const _require4 = require('./session.js'),readTenantCtx = _require4.readTenantCtx;
      const ctx = readTenantCtx();
      return (ctx == null ? void 0 : ctx.tenantId) || null;
    } catch {
      return null;
    }
  })();

  const collabPeers = buildCollabConversations(transfers, myTenantId);
  const collabPendingCount = collabPeers.reduce((s, p) => s + p.pending, 0);

  const conversations = [
  buildConversationEntry({
    kind: 'notifications',
    id: 'notifications',
    title: '消息中心',
    avatarText: '讯',
    avatarTone: unreadNotifCount > 0 ? 'info' : 'muted',
    bubbles: notifBubbles,
    badge: unreadNotifCount
  }),
  buildConversationEntry({
    kind: 'todos',
    id: 'todos',
    title: '待办事项',
    avatarText: '办',
    avatarTone: openTodoCount > 0 ? 'warning' : 'muted',
    bubbles: todoBubbles,
    badge: openTodoCount
  })];


  collabPeers.forEach((p) => {
    conversations.push({
      kind: 'collab',
      id: `collab:${p.peerTenantId}`,
      title: p.peerTenantName,
      avatarText: p.avatarText,
      avatarTone: p.pending > 0 ? 'danger' : 'muted',
      lastTimeText: p.lastTimeText,
      lastSummary: p.lastSummary || `协作单 ${p.transferCount} 张 · 文档 ${p.totalItems} 项`,
      unread: p.pending,
      badge: p.pending,
      bubbles: p.bubbles,
      peer: p
    });
  });

  return {
    conversations,
    unreadCount: unreadNotifCount + openTodoCount + collabPendingCount,
    collabPendingCount,
    openTodoCount,
    unreadNotifCount
  };
}

module.exports = {
  buildConversations,
  buildInboxBubbles,
  buildNotificationBubbles,
  buildTodoBubbles,
  buildCollabConversations,
  buildPeerTimelineBubbles,
  formatChatTime,
  NOTIF_TYPE_META,
  TODO_SOURCE_LABELS
};