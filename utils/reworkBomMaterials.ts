import type { BOM, GlobalNodeTemplate, Product, ProductionOrder } from '../types';

export interface ReworkBomMaterial {
  productId: string;
  name: string;
  sku: string;
  unitNeeded: number;
  nodeNames: string[];
}

/**
 * 按工单解析可领用的 BOM 物料（返工领料选料范围）：
 * 优先按订单行变体的 nodeBoms 展开；无变体级配置时回落到产品各工序 BOM。
 * 纯函数，供返工物料壳弹窗与领料子弹窗共用。
 */
export function computeReworkBomMaterials(
  order: ProductionOrder,
  products: Product[],
  boms: BOM[],
  globalNodes: GlobalNodeTemplate[],
): ReworkBomMaterial[] {
  const product = products.find(p => p.id === order.productId);
  const orderQty = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
  const addMat = (bom: BOM, qty: number, nodeName: string) => {
    bom.items.forEach(bi => {
      const mp = products.find(px => px.id === bi.productId);
      const add = Number(bi.quantity) * qty;
      const existing = matMap.get(bi.productId);
      if (existing) {
        existing.unitNeeded += add;
        if (nodeName) existing.nodeNames.add(nodeName);
      } else {
        const ns = new Set<string>();
        if (nodeName) ns.add(nodeName);
        matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
      }
    });
  };
  const variants = product?.variants ?? [];
  if (variants.length > 0) {
    (order.items ?? []).forEach(item => {
      const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
      const lineQty = item.quantity;
      const seenBomIds = new Set<string>();
      if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
        Object.entries(v.nodeBoms).forEach(([nodeId, bomIdRaw]) => {
          const bomId = bomIdRaw as string;
          if (seenBomIds.has(bomId)) return;
          seenBomIds.add(bomId);
          const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
          const bom = boms.find(b => b.id === bomId);
          if (bom) addMat(bom, lineQty, nodeName);
        });
      } else {
        boms.filter(b => b.parentProductId === product!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
          if (seenBomIds.has(bom.id)) return;
          seenBomIds.add(bom.id);
          const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
          addMat(bom, lineQty, nodeName);
        });
      }
    });
  }
  if (matMap.size === 0 && product) {
    const seenBomIds = new Set<string>();
    boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
      if (seenBomIds.has(bom.id)) return;
      seenBomIds.add(bom.id);
      const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
      const qty = bom.variantId ? ((order.items ?? []).find(i => i.variantId === bom.variantId)?.quantity ?? 0) : orderQty;
      addMat(bom, qty, nodeName);
    });
  }
  const result: ReworkBomMaterial[] = [];
  matMap.forEach((v, productId) => {
    result.push({ productId, name: v.name, sku: v.sku, unitNeeded: v.unitNeeded, nodeNames: Array.from(v.nodeNames) });
  });
  return result;
}
