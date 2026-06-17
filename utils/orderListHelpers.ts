/**
 * OrderListView 用到的纯函数工具集 (Phase 3.3 抽离)。
 *
 * 这些函数原本作为闭包内嵌在 OrderListView.tsx 内，
 * 抽出后可独立单测，避免在视图渲染中再生成函数对象。
 */
import type { ProductionOpRecord } from '../types';
import { isProcessSequential, findGatingPredecessorIndex } from '../shared/processSequence';

/**
 * 关联工单模式下：把工单号反复去掉末尾 `-数字`，得到「根工单号」。
 * 同一原单拆出的工单（WO2-1-2 → WO2-1 → WO2）会归到同一根。
 *
 * 规则：仅去掉末尾 `-1` 到 `-99` 这一段，避免把 `MO-2024` 这类合法日期段误剥离。
 */
export function getRootOrderNumber(orderNumber: string): string {
  let s = orderNumber || '';
  for (;;) {
    const m = s.match(/^(.+)-([1-9]\d?)$/);
    if (!m) return s;
    s = m[1];
  }
}

/**
 * 顺序模式：单条返工记录在工序 nodeId 上的「剩余可报数」。
 *
 * - 顺序 (`sequential`)：必须等上一工序完成后才能流入本道；
 *   剩余 = min(上道完成数, 本工序总量) - 本道已完成
 * - 自由 (`free`)：剩余 = 总量 - 本道已完成
 *
 * 抽出 OrderListView.tsx:386-397，将 processSequenceMode 改为入参。
 */
export function reworkRemainingAtNode(
  r: ProductionOpRecord,
  nodeId: string,
  // 接 string 而非 union，规避调用方默认参数推断为 string 的问题；运行时仅比较 'sequential'
  processSequenceMode: string,
  outOfSequenceTemplateIds?: ReadonlySet<string>,
): number {
  const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0)
    ? r.reworkNodeIds
    : (r.nodeId ? [r.nodeId] : []);
  const idx = pathNodes.indexOf(nodeId);
  if (idx < 0) return 0;
  const doneAtNode = r.reworkCompletedQuantityByNode?.[nodeId]
    ?? ((r.completedNodeIds ?? []).includes(nodeId) ? r.quantity : 0);
  if (isProcessSequential(processSequenceMode as 'free' | 'sequential', nodeId, outOfSequenceTemplateIds)) {
    const gateIdx = findGatingPredecessorIndex(pathNodes, idx, outOfSequenceTemplateIds);
    if (gateIdx >= 0) {
      const prevNodeId = pathNodes[gateIdx];
      const doneAtPrev = r.reworkCompletedQuantityByNode?.[prevNodeId] ?? 0;
      return Math.max(0, Math.min(doneAtPrev, r.quantity) - doneAtNode);
    }
  }
  return Math.max(0, r.quantity - doneAtNode);
}
