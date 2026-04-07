import { useMemo } from 'react';
import type {
  ProductionOrder,
  Product,
  BOM,
  GlobalNodeTemplate,
  ProductMilestoneProgress,
} from '../../types';

export interface DataIndexes {
  productsById: Map<string, Product>;
  ordersById: Map<string, ProductionOrder>;
  bomsById: Map<string, BOM>;
  nodesById: Map<string, GlobalNodeTemplate>;
  childrenByParentId: Map<string, ProductionOrder[]>;
  ordersByProductId: Map<string, ProductionOrder[]>;
  rootOrdersByProductId: Map<string, ProductionOrder[]>;
  pmpByKey: Map<string, number>;
  bomsByParentProduct: Map<string, BOM[]>;
  nodeIndexMap: Map<string, number>;
}

/**
 * Pre-builds O(1) lookup indexes from the source arrays.
 * All downstream useMemo chains should use these instead of .find()/.filter() inside loops.
 */
export function useDataIndexes(
  orders: ProductionOrder[],
  products: Product[],
  boms: BOM[],
  globalNodes: GlobalNodeTemplate[],
  pmp: ProductMilestoneProgress[],
): DataIndexes {
  return useMemo(() => {
    const productsById = new Map<string, Product>(products.map(p => [p.id, p]));
    const ordersById = new Map<string, ProductionOrder>(orders.map(o => [o.id, o]));
    const bomsById = new Map<string, BOM>(boms.map(b => [b.id, b]));
    const nodesById = new Map<string, GlobalNodeTemplate>(globalNodes.map(n => [n.id, n]));

    const childrenByParentId = new Map<string, ProductionOrder[]>();
    const ordersByProductId = new Map<string, ProductionOrder[]>();
    const rootOrdersByProductId = new Map<string, ProductionOrder[]>();

    for (const o of orders) {
      if (o.parentOrderId) {
        let arr = childrenByParentId.get(o.parentOrderId);
        if (!arr) { arr = []; childrenByParentId.set(o.parentOrderId, arr); }
        arr.push(o);
      } else {
        let arr = rootOrdersByProductId.get(o.productId);
        if (!arr) { arr = []; rootOrdersByProductId.set(o.productId, arr); }
        arr.push(o);
      }
      let arr2 = ordersByProductId.get(o.productId);
      if (!arr2) { arr2 = []; ordersByProductId.set(o.productId, arr2); }
      arr2.push(o);
    }

    const pmpByKey = new Map<string, number>();
    for (const p of pmp) {
      const k = `${p.productId}|${p.milestoneTemplateId}`;
      pmpByKey.set(k, (pmpByKey.get(k) ?? 0) + (p.completedQuantity ?? 0));
    }

    const bomsByParentProduct = new Map<string, BOM[]>();
    for (const b of boms) {
      if (b.parentProductId) {
        let arr = bomsByParentProduct.get(b.parentProductId);
        if (!arr) { arr = []; bomsByParentProduct.set(b.parentProductId, arr); }
        arr.push(b);
      }
    }

    const nodeIndexMap = new Map<string, number>();
    for (let i = 0; i < globalNodes.length; i++) {
      nodeIndexMap.set(globalNodes[i].id, i);
    }

    return {
      productsById, ordersById, bomsById, nodesById,
      childrenByParentId, ordersByProductId, rootOrdersByProductId,
      pmpByKey, bomsByParentProduct, nodeIndexMap,
    };
  }, [orders, products, boms, globalNodes, pmp]);
}
