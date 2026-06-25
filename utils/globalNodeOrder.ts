import type { GlobalNodeTemplate } from '../types';

/** 按工序节点库 sortOrder（同序时按 id）对 id 列表排序；未知 id 排在末尾。 */
export function sortNodeIdsByGlobalOrder(
  nodeIds: string[],
  globalNodes: GlobalNodeTemplate[],
): string[] {
  const orderMap = new Map(
    globalNodes.map((node, index) => [node.id, node.sortOrder ?? index] as const),
  );
  return [...nodeIds].sort((a, b) => {
    const orderA = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });
}
