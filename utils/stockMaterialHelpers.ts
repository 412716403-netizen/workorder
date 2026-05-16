/**
 * StockMaterialPanel 用到的纯函数工具 (Phase 3.7 抽离)。
 *
 * 这些函数原是 StockMaterialPanel.tsx 内的小 useMemo / 闭包，
 * 抽离后可独立单测，避免视图层混杂数据构造逻辑。
 */
import type { ProductionOrder } from '../types';

/** 从工单列表中提取唯一 productId，以逗号拼接。空集返回空字符串。
 *  用于 useQuery key 与按 sourceProductIds 二次窄拉。 */
export function getActiveSourceProductIdsCsv(
  orders: ReadonlyArray<Pick<ProductionOrder, 'productId'>>,
): string {
  const set = new Set<string>();
  for (const o of orders) {
    if (o.productId) set.add(o.productId);
  }
  return Array.from(set).join(',');
}

/** 从工单列表中提取所有 id，以逗号拼接。空集返回空字符串。 */
export function getActiveOrderIdsCsv(
  orders: ReadonlyArray<Pick<ProductionOrder, 'id'>>,
): string {
  return orders.map(o => o.id).filter(Boolean).join(',');
}

interface NodeLike {
  id?: string;
  enableWeightOnReport?: boolean;
}

/**
 * 构建「工序 → 是否启用称重报工」的 Map。
 *
 * 报工记录的 materialBreakdown 是按写入时工序配置固化的快照。如果工序后续从
 * "称重" 改回 "非称重"，老快照会显得很奇怪（同物料不同重量）。
 * 面板用这个 map 在渲染时决定要不要信任老快照。
 */
export function buildNodeWeightEnabledMap(
  globalNodes: ReadonlyArray<NodeLike> | null | undefined,
): Map<string, boolean> {
  const m = new Map<string, boolean>();
  (globalNodes ?? []).forEach(n => {
    if (n?.id) m.set(n.id, !!n.enableWeightOnReport);
  });
  return m;
}
