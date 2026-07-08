/**
 * 协作收件箱纯函数（对齐 Web utils/collabInboxHelpers.ts）
 */

function peerBindingsForTransfer(t, myTenantId) {var _t$chainStep, _t$originTenantId;
  if (!t) return [];
  const all = ['dispatch', 'return', 'forward'];
  if (!myTenantId) {
    if (t.senderTenantId === t.receiverTenantId) return [];
    if (!t.receiverTenantId) return [];
    return [{ peerTenantId: t.receiverTenantId, kinds: all }];
  }
  const isChain = !!t.outsourceRouteSnapshot && ((_t$chainStep = t.chainStep) != null ? _t$chainStep : 0) > 0;
  const isOrigin = ((_t$originTenantId = t.originTenantId) != null ? _t$originTenantId : t.senderTenantId) === myTenantId;
  if (isChain && isOrigin) {
    const out = [];
    const route = Array.isArray(t.outsourceRouteSnapshot) ? t.outsourceRouteSnapshot : [];
    const prev = route.find((s) => {var _t$chainStep2;return s.stepOrder === ((_t$chainStep2 = t.chainStep) != null ? _t$chainStep2 : 0) - 1;});
    if (prev != null && prev.receiverTenantId && prev.receiverTenantId !== myTenantId) {
      out.push({ peerTenantId: prev.receiverTenantId, kinds: ['forward'] });
    }
    if (t.receiverTenantId && t.receiverTenantId !== myTenantId) {
      out.push({ peerTenantId: t.receiverTenantId, kinds: ['dispatch', 'return'] });
    }
    return out;
  }
  const peer = t.senderTenantId === myTenantId ? t.receiverTenantId : t.senderTenantId;
  if (!peer || peer === myTenantId) return [];
  return [{ peerTenantId: peer, kinds: all }];
}

function sumItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, i) => s + (Number(i == null ? void 0 : i.quantity) || 0), 0);
}

module.exports = {
  peerBindingsForTransfer,
  sumItems
};