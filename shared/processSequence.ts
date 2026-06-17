/**
 * 工序顺序约束判定（前后端共用纯函数）。
 *
 * 方案 X：系统全局恒「按工序顺序生产」(processSequenceMode === 'sequential')；
 * 但某工序可在「工序节点库 → 工序功能开关」开启 `allowOutOfSequence`（不按顺序生产），
 * 开启后该工序脱链：按工单总量报工、不校验前一道是否已报；
 * 其下游按顺序工序 gate 在「最近一道上游按顺序工序」完成量上；脱链工序在顺序链中透明跳过。
 * 若上游无按顺序工序则按工单总量放开。
 */

import type { ProcessSequenceMode } from './types.js';

/**
 * 判断某工序当前是否仍受「按顺序」约束。
 *
 * @param processSequenceMode 全局顺序模式（迁移后恒为 'sequential'，保留以兼容历史口径）
 * @param nodeId 当前工序 id（= GlobalNodeTemplate.id / milestone.templateId / 返工 nodeId）
 * @param outOfSequenceTemplateIds 已开启「不按顺序生产」的工序 id 集合
 * @returns true 表示受顺序约束（基数取前道完成量，前道未报则拦截）；false 表示脱链（按总量）
 */
export function isProcessSequential(
  processSequenceMode: ProcessSequenceMode,
  nodeId: string | undefined,
  outOfSequenceTemplateIds?: ReadonlySet<string> | null,
): boolean {
  if (processSequenceMode !== 'sequential') return false;
  if (nodeId && outOfSequenceTemplateIds && outOfSequenceTemplateIds.has(nodeId)) return false;
  return true;
}

/**
 * 顺序链 gate 前序定位：从 currentIndex 往前找最近一道「按顺序」工序的下标。
 * 「不按顺序生产」(脱链) 工序在链中透明、被跳过。
 *
 * @returns 最近上游按顺序工序下标；若前面没有按顺序工序则返回 -1（调用方据此按总量放开）。
 */
export function findGatingPredecessorIndex(
  templateIds: ReadonlyArray<string | undefined>,
  currentIndex: number,
  outOfSequenceTemplateIds?: ReadonlySet<string> | null,
): number {
  for (let i = currentIndex - 1; i >= 0; i--) {
    const tid = templateIds[i];
    if (!tid) continue;
    if (!outOfSequenceTemplateIds || !outOfSequenceTemplateIds.has(tid)) return i;
  }
  return -1;
}

/** 从工序节点列表派生「不按顺序生产」工序 id 集合。 */
export function buildOutOfSequenceTemplateIds(
  nodes: ReadonlyArray<{ id: string; allowOutOfSequence?: boolean | null }>,
): Set<string> {
  const set = new Set<string>();
  for (const n of nodes) {
    if (n.allowOutOfSequence) set.add(n.id);
  }
  return set;
}
