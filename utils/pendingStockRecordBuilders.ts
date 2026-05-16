/**
 * 待入库 / 批量待入库的 STOCK_IN `ProductionOpRecord` 构造器 (Phase P7 抽离自 PendingStockPanel)。
 *
 * 设计原则:
 * - 纯函数,不依赖 React / toast / API,便于单测
 * - records 不带 docNo,由后端批量端点共享分配,避免前端 stale 缓存串号
 * - 关联产品模式下,按工单已入库做容量分摊;尾差全部塞最后一张工单
 * - 颜色 × 尺码模式按 variantId 分别构造记录
 */
import type { ProductionOrder, ProductionOpRecord } from '../types';
import { stockInCollabFromCustomData } from '../views/order-list/pendingStockStockInHelpers';

export interface BuildSingleStockInArgs {
  /** 当前工单 + 关联组 (orders ordered ascending by orderNumber when in productionLinkMode='product') */
  order: ProductionOrder;
  ordersInRow: ProductionOrder[];
  productionLinkMode: 'order' | 'product';
  hasColorSize: boolean;
  variantQuantities: Record<string, number>;
  singleQuantity: number;
  warehouseId?: string;
  customData: Record<string, unknown>;
  virtualBatchId?: string;
  itemCodeId?: string;
  operator: string;
  timestamp: string;
  /** 上游 prodRecords,用于按工单做"已入库"扣减(产品模式 + 多工单) */
  prodRecords: ProductionOpRecord[];
  /** 当前产品是否有 variants(供颜色×尺码时使用) */
  hasVariants: boolean;
}

function makeRecordId(seq: number): string {
  return `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 单条"选择入库"提交时的 records 构造。
 * - 关联产品模式 + 多工单: 按 variant 分摊到各工单
 * - 关联产品模式 + 单工单 / 关联工单模式: 直接一条/多条(matrix)
 */
export function buildSingleStockInRecords(args: BuildSingleStockInArgs): ProductionOpRecord[] {
  const {
    order,
    ordersInRow,
    productionLinkMode,
    hasColorSize,
    hasVariants,
    variantQuantities,
    singleQuantity,
    warehouseId,
    customData,
    virtualBatchId,
    itemCodeId,
    operator,
    timestamp,
    prodRecords,
  } = args;

  const collab = stockInCollabFromCustomData(customData);
  const traceFields = {
    ...(virtualBatchId ? { virtualBatchId } : {}),
    ...(itemCodeId ? { itemCodeId } : {}),
  };
  const isProductMulti = productionLinkMode === 'product' && ordersInRow.length > 1;
  const records: ProductionOpRecord[] = [];
  let seq = 0;

  if (isProductMulti) {
    const sortedOrders = [...ordersInRow].sort((a, b) =>
      (a.orderNumber || '').localeCompare(b.orderNumber || '', 'zh-CN'),
    );

    if (hasColorSize && hasVariants) {
      const variantEntries = (Object.entries(variantQuantities) as [string, number][]).filter(([, q]) => q > 0);
      for (const [vid, totalQty] of variantEntries) {
        let remain = totalQty;
        for (const o of sortedOrders) {
          if (remain <= 0) break;
          const orderVarQty = o.items.filter(i => (i.variantId || '') === vid).reduce((s, i) => s + i.quantity, 0);
          if (orderVarQty <= 0) continue;
          const orderStockIn = prodRecords
            .filter(r => r.type === 'STOCK_IN' && r.orderId === o.id && (r.variantId ?? '') === vid)
            .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
          const cap = Math.max(0, orderVarQty - orderStockIn);
          if (cap <= 0) continue;
          const alloc = Math.min(remain, cap);
          remain -= alloc;
          seq += 1;
          records.push({
            id: makeRecordId(seq),
            type: 'STOCK_IN',
            orderId: o.id,
            productId: o.productId,
            variantId: vid || undefined,
            quantity: alloc,
            operator,
            timestamp,
            status: '已完成',
            warehouseId: warehouseId || undefined,
            ...collab,
            ...traceFields,
          } as ProductionOpRecord);
        }
        if (remain > 0) {
          const fallback = sortedOrders[sortedOrders.length - 1]!;
          seq += 1;
          records.push({
            id: makeRecordId(seq),
            type: 'STOCK_IN',
            orderId: fallback.id,
            productId: fallback.productId,
            variantId: vid || undefined,
            quantity: remain,
            operator,
            timestamp,
            status: '已完成',
            warehouseId: warehouseId || undefined,
            ...collab,
            ...traceFields,
          } as ProductionOpRecord);
        }
      }
    } else {
      let remain = singleQuantity || 0;
      for (const o of sortedOrders) {
        if (remain <= 0) break;
        const oTotal = o.items.reduce((s, i) => s + i.quantity, 0);
        const oIn = prodRecords
          .filter(r => r.type === 'STOCK_IN' && r.orderId === o.id)
          .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        const cap = Math.max(0, oTotal - oIn);
        if (cap <= 0) continue;
        const alloc = Math.min(remain, cap);
        remain -= alloc;
        seq += 1;
        records.push({
          id: makeRecordId(seq),
          type: 'STOCK_IN',
          orderId: o.id,
          productId: o.productId,
          quantity: alloc,
          operator,
          timestamp,
          status: '已完成',
          warehouseId: warehouseId || undefined,
          ...collab,
          ...traceFields,
        } as ProductionOpRecord);
      }
      if (remain > 0) {
        const fallback = sortedOrders[sortedOrders.length - 1]!;
        seq += 1;
        records.push({
          id: makeRecordId(seq),
          type: 'STOCK_IN',
          orderId: fallback.id,
          productId: fallback.productId,
          quantity: remain,
          operator,
          timestamp,
          status: '已完成',
          warehouseId: warehouseId || undefined,
          ...collab,
          ...traceFields,
        } as ProductionOpRecord);
      }
    }
    return records;
  }

  /* 单工单分支 */
  if (hasColorSize && hasVariants) {
    return (Object.entries(variantQuantities) as [string, number][])
      .filter(([, qty]) => qty > 0)
      .map(
        ([variantId, qty]) =>
          ({
            id: makeRecordId(++seq),
            type: 'STOCK_IN',
            orderId: order.id,
            productId: order.productId,
            variantId: variantId || undefined,
            quantity: qty,
            operator,
            timestamp,
            status: '已完成',
            warehouseId: warehouseId || undefined,
            ...collab,
            ...traceFields,
          }) as ProductionOpRecord,
      );
  }
  const qty = singleQuantity || 0;
  if (qty <= 0) return [];
  return [
    {
      id: makeRecordId(++seq),
      type: 'STOCK_IN',
      orderId: order.id,
      productId: order.productId,
      quantity: qty,
      operator,
      timestamp,
      status: '已完成',
      warehouseId: warehouseId || undefined,
      ...collab,
      ...traceFields,
    } as ProductionOpRecord,
  ];
}
