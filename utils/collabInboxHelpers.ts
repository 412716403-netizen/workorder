/**
 * CollaborationInboxView 用到的纯函数 (Phase 3.9 抽离)。
 *
 * 这些函数原本写在 CollaborationInboxView.tsx 顶层，与 React 无关，
 * 抽出后可独立单测，避免视图层混杂业务规则。
 */

export type BubbleKind = 'dispatch' | 'return' | 'forward';

export interface TransferLike {
  senderTenantId?: string | null;
  receiverTenantId?: string | null;
  originTenantId?: string | null;
  chainStep?: number | null;
  outsourceRouteSnapshot?: Array<{ stepOrder: number; receiverTenantId?: string | null }> | null;
}

/**
 * 一条 transfer 在我（myTenantId）视角下应该把哪条气泡显示在哪个对端窗口里。
 *
 * 普通派发：转发链未启用 → 只有一个对端，全类型气泡。
 *
 * 转发链 + 我是 origin（A→B→C 里的 A）：
 *   · 在「A↔B」窗口里只显示 forward 气泡（A 已确认转发给 B 的链路联动）
 *   · 在「A↔C」窗口里显示 dispatch/return 气泡（与普通派发一致，C 才能出现在对端列表中）
 */
export function peerBindingsForTransfer(
  t: TransferLike | null | undefined,
  myTenantId: string | null,
): Array<{ peerTenantId: string; kinds: Set<BubbleKind> }> {
  if (!t) return [];
  const all: Set<BubbleKind> = new Set(['dispatch', 'return', 'forward']);
  if (!myTenantId) {
    if (t.senderTenantId === t.receiverTenantId) return [];
    if (!t.receiverTenantId) return [];
    return [{ peerTenantId: t.receiverTenantId, kinds: all }];
  }
  const isChain = !!t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0;
  const isOrigin = (t.originTenantId ?? t.senderTenantId) === myTenantId;
  if (isChain && isOrigin) {
    const out: Array<{ peerTenantId: string; kinds: Set<BubbleKind> }> = [];
    const route = Array.isArray(t.outsourceRouteSnapshot) ? t.outsourceRouteSnapshot : [];
    const prev = route.find(s => s.stepOrder === (t.chainStep ?? 0) - 1);
    if (prev?.receiverTenantId && prev.receiverTenantId !== myTenantId) {
      out.push({ peerTenantId: prev.receiverTenantId, kinds: new Set<BubbleKind>(['forward']) });
    }
    const curReceiver = t.receiverTenantId;
    if (curReceiver && curReceiver !== myTenantId) {
      out.push({ peerTenantId: curReceiver, kinds: new Set<BubbleKind>(['dispatch', 'return']) });
    }
    return out;
  }
  const peer = t.senderTenantId === myTenantId ? t.receiverTenantId : t.senderTenantId;
  if (!peer || peer === myTenantId) return [];
  return [{ peerTenantId: peer, kinds: all }];
}

/** Array.prototype.find 的语义化别名（保留与原文件相同的签名）。 */
export function firstOrDefault<T>(arr: ReadonlyArray<T>, pred: (x: T) => boolean): T | undefined {
  for (const x of arr) if (pred(x)) return x;
  return undefined;
}

/** 累加 items[i].quantity（任何类型，无效转 0） */
export function sumItems(items: ReadonlyArray<{ quantity?: unknown }> | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, i) => s + (Number((i as { quantity?: unknown })?.quantity) || 0), 0);
}
