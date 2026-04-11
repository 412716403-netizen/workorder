import type { ProductionOrder, Product, ProductMilestoneProgress } from '../types';

/** 工单创建时刻（ms），用于工单模式「最新生成的工单」排序 */
export function orderCreatedMs(o: ProductionOrder): number {
  if (o.createdAt) {
    const t = new Date(o.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const m = o.id.match(/^ord-([^-]+)-/);
  if (m) {
    const ts = parseInt(m[1], 36);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

/** 工单最近活动时间（ms）：优先 updatedAt，否则取里程碑报工最新时间，再退回创建时间 */
export function orderUpdatedMs(o: ProductionOrder): number {
  if (o.updatedAt) {
    const t = new Date(o.updatedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  let maxR = 0;
  o.milestones?.forEach(ms => {
    (ms.reports || []).forEach(r => {
      const rt = new Date(r.timestamp).getTime();
      if (!Number.isNaN(rt)) maxR = Math.max(maxR, rt);
    });
  });
  return Math.max(orderCreatedMs(o), maxR);
}

export function maxCreatedMsInSubtree(root: ProductionOrder, parentToSub: Map<string, ProductionOrder[]>): number {
  let m = orderCreatedMs(root);
  const stack = [...(parentToSub.get(root.id) ?? [])];
  while (stack.length) {
    const x = stack.pop()!;
    m = Math.max(m, orderCreatedMs(x));
    for (const c of parentToSub.get(x.id) ?? []) stack.push(c);
  }
  return m;
}

/** 产品维度最近活动：关联工单 + 产品级进度（报工写在 PMP 时） */
export function productActivityMs(productId: string, ords: ProductionOrder[], pmps: ProductMilestoneProgress[]): number {
  let ms = 0;
  for (const o of ords) ms = Math.max(ms, orderUpdatedMs(o));
  for (const p of pmps) {
    if (p.productId !== productId) continue;
    if (p.updatedAt) {
      const t = new Date(p.updatedAt).getTime();
      if (!Number.isNaN(t)) ms = Math.max(ms, t);
    }
    (p.reports ?? []).forEach(r => {
      const t = new Date(r.timestamp).getTime();
      if (!Number.isNaN(t)) ms = Math.max(ms, t);
    });
  }
  return ms;
}

/** 该产品下关联工单中，「最新一条工单」的创建时间（ms）；关联产品模式流水按工单创建排序用 */
export function productNewestOrderCreatedMs(productId: string, orders: ProductionOrder[]): number {
  let m = 0;
  for (const o of orders) {
    if (o.productId === productId) m = Math.max(m, orderCreatedMs(o));
  }
  return m;
}

export type OrderCenterListBlock =
  | { type: 'single'; order: ProductionOrder }
  | { type: 'orderGroup'; groupKey: string; orders: ProductionOrder[] }
  | { type: 'parentChild'; parent: ProductionOrder; children: ProductionOrder[] }
  | { type: 'productGroup'; productId: string; productName: string; orders: ProductionOrder[] };

export function blockOrderCreatedMs(block: OrderCenterListBlock, parentToSub: Map<string, ProductionOrder[]>): number {
  switch (block.type) {
    case 'single':
      return orderCreatedMs(block.order);
    case 'orderGroup':
      return Math.max(0, ...block.orders.map(orderCreatedMs));
    case 'parentChild':
      return maxCreatedMsInSubtree(block.parent, parentToSub);
    case 'productGroup':
      return Math.max(0, ...block.orders.map(orderCreatedMs));
    default:
      return 0;
  }
}

/** 块级最近活动时间（含报工），报工后排在前面 */
export function blockActivityMs(block: OrderCenterListBlock, parentToSub: Map<string, ProductionOrder[]>): number {
  switch (block.type) {
    case 'single':
      return orderUpdatedMs(block.order);
    case 'orderGroup':
      return Math.max(0, ...block.orders.map(orderUpdatedMs));
    case 'parentChild': {
      let m = orderUpdatedMs(block.parent);
      const stack = [...(parentToSub.get(block.parent.id) ?? [])];
      while (stack.length) {
        const x = stack.pop()!;
        m = Math.max(m, orderUpdatedMs(x));
        for (const c of parentToSub.get(x.id) ?? []) stack.push(c);
      }
      return m;
    }
    case 'productGroup':
      return Math.max(0, ...block.orders.map(orderUpdatedMs));
    default:
      return 0;
  }
}

export function blockSortTieId(block: OrderCenterListBlock): string {
  switch (block.type) {
    case 'single':
      return block.order.id;
    case 'orderGroup':
      return block.groupKey;
    case 'parentChild':
      return block.parent.id;
    case 'productGroup':
      return block.productId;
    default:
      return '';
  }
}

/** 工单模式下：同一工单多工序行按工序顺序 */
export function milestoneIndexInOrder(order: ProductionOrder | undefined, nodeId: string): number {
  if (!order?.milestones?.length) return 9999;
  const i = order.milestones.findIndex(m => m.templateId === nodeId);
  return i >= 0 ? i : 9999;
}

/** 产品模式下：同一产品多工序行按产品工序配置顺序 */
export function milestoneIndexInProduct(product: Product | undefined, nodeId: string): number {
  if (!product?.milestoneNodeIds?.length) return 9999;
  const i = product.milestoneNodeIds.indexOf(nodeId);
  return i >= 0 ? i : 9999;
}

export type ReworkMainListBlock =
  | { type: 'single'; order: ProductionOrder }
  | { type: 'parentChild'; parent: ProductionOrder; children: ProductionOrder[] };

export function reworkMainListBlockCreatedMs(
  block: ReworkMainListBlock,
  childrenByParentId: Map<string, ProductionOrder[]>,
): number {
  if (block.type === 'single') return orderCreatedMs(block.order);
  return maxCreatedMsInSubtree(block.parent, childrenByParentId);
}

export function reworkMainListBlockTieId(block: ReworkMainListBlock): string {
  return block.type === 'single' ? block.order.id : block.parent.id;
}
