import type { TenantPrismaClient } from '../lib/prisma.js';

export async function getStats(db: TenantPrismaClient) {
  const [
    activeOrderCount,
    totalMilestones,
    _completedMilestones,
    receiptAgg,
    paymentAgg,
    psiPurchase,
    psiSales,
    products,
  ] = await Promise.all([
    db.productionOrder.count({ where: { status: { not: 'SHIPPED' } } }),
    db.productionOrder.findMany({
      where: { status: { not: 'SHIPPED' } },
      select: { milestones: { select: { status: true } } },
    }),
    db.productionOrder.count({ where: {} }).then(() => null),
    db.financeRecord.aggregate({ where: { type: 'RECEIPT' }, _sum: { amount: true } }),
    db.financeRecord.aggregate({ where: { type: 'PAYMENT' }, _sum: { amount: true } }),
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: 'PURCHASE_BILL', productId: { not: null } },
      _sum: { quantity: true },
    }),
    db.psiRecord.groupBy({
      by: ['productId'],
      where: { type: 'SALES_BILL', productId: { not: null } },
      _sum: { quantity: true },
    }),
    db.product.findMany({ select: { id: true, name: true, sku: true } }),
  ]);

  let totalMs = 0;
  let completedMs = 0;
  for (const order of totalMilestones) {
    totalMs += order.milestones.length;
    completedMs += order.milestones.filter((m) => m.status === 'COMPLETED').length;
  }
  const completionRate = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : 0;

  const totalReceipts = Number(receiptAgg._sum?.amount || 0);
  const totalPayments = Number(paymentAgg._sum?.amount || 0);

  const stockMap: Record<string, number> = {};
  for (const r of psiPurchase) {
    if (r.productId) stockMap[r.productId] = Number(r._sum?.quantity || 0);
  }
  for (const r of psiSales) {
    if (r.productId)
      stockMap[r.productId] = (stockMap[r.productId] || 0) - Number(r._sum?.quantity || 0);
  }
  const lowStockProducts = products.filter((p) => (stockMap[p.id] || 0) < 10);

  const activeOrders = await db.productionOrder.findMany({
    where: { status: { not: 'SHIPPED' } },
    select: {
      id: true,
      orderNumber: true,
      productName: true,
      items: { select: { quantity: true } },
      milestones: { select: { completedQuantity: true } },
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  const orderProgress = activeOrders.map((o) => {
    const totalQty = o.items.reduce((s, i) => s + Number(i.quantity), 0);
    const msCount = o.milestones.length;
    const progress =
      msCount > 0 && totalQty > 0
        ? Math.round(
            (o.milestones.reduce((s, m) => s + Number(m.completedQuantity) / totalQty, 0) /
              msCount) *
              100,
          )
        : 0;
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      productName: o.productName,
      progress,
    };
  });

  return {
    production: {
      activeOrders: activeOrderCount,
      totalMilestones: totalMs,
      completedMilestones: completedMs,
      completionRate,
    },
    finance: {
      totalReceipts,
      totalPayments,
      cashFlow: totalReceipts - totalPayments,
    },
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts.slice(0, 10),
    orderProgress,
  };
}
