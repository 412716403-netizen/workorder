import type { GlobalNodeTemplate, Product } from '../types';

/** 将产品生产路线（milestoneNodeIds）格式化为打印用工序文案，按路线顺序以「 → 」连接工序名称 */
export function formatProductProcessNodesText(
  product: Pick<Product, 'milestoneNodeIds'> | undefined | null,
  globalNodes: Array<Pick<GlobalNodeTemplate, 'id' | 'name'>> | undefined,
): string {
  const ids = product?.milestoneNodeIds ?? [];
  if (ids.length === 0) return '';
  const nodes = globalNodes ?? [];
  const names = ids
    .map(id => nodes.find(n => n.id === id)?.name?.trim() ?? '')
    .filter(name => name.length > 0);
  return names.join(' → ');
}
