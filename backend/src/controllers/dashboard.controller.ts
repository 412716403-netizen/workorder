import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const orders = await db.productionOrder.findMany({
      include: { items: true, milestones: true },
    });
    const financeRecords = await db.financeRecord.findMany();

    const activeOrders = orders.filter(o => o.status !== 'SHIPPED');
    const totalMilestones = orders.reduce((s, o) => s + o.milestones.length, 0);
    const completedMilestones = orders.reduce(
      (s, o) => s + o.milestones.filter(m => m.status === 'COMPLETED').length, 0,
    );
    const completionRate = totalMilestones > 0
      ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    const totalReceipts = financeRecords
      .filter(r => r.type === 'RECEIPT')
      .reduce((s, r) => s + Number(r.amount), 0);
    const totalPayments = financeRecords
      .filter(r => r.type === 'PAYMENT')
      .reduce((s, r) => s + Number(r.amount), 0);

    const psiRecords = await db.psiRecord.findMany({
      where: { type: { in: ['PURCHASE_BILL', 'SALES_BILL'] } },
    });
    const products = await db.product.findMany({ select: { id: true, name: true, sku: true } });

    const stockMap: Record<string, number> = {};
    for (const r of psiRecords) {
      if (!r.productId) continue;
      if (r.type === 'PURCHASE_BILL') stockMap[r.productId] = (stockMap[r.productId] || 0) + Number(r.quantity || 0);
      if (r.type === 'SALES_BILL') stockMap[r.productId] = (stockMap[r.productId] || 0) - Number(r.quantity || 0);
    }
    const lowStockProducts = products.filter(p => (stockMap[p.id] || 0) < 10);

    const orderProgress = activeOrders.slice(0, 10).map(o => {
      const totalQty = o.items.reduce((s, i) => s + Number(i.quantity), 0);
      const msCount = o.milestones.length;
      const progress = msCount > 0 && totalQty > 0
        ? Math.round(o.milestones.reduce((s, m) => s + Number(m.completedQuantity) / totalQty, 0) / msCount * 100)
        : 0;
      return { orderId: o.id, orderNumber: o.orderNumber, productName: o.productName, progress };
    });

    res.json({
      production: {
        activeOrders: activeOrders.length,
        totalMilestones,
        completedMilestones,
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
    });
  } catch (e) { next(e); }
}
