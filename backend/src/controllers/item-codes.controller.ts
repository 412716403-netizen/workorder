import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { genId } from '../utils/genId.js';
import { str, optStr } from '../utils/request.js';

function generateScanToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const db = getTenantPrisma(tenantId);
    const planOrderId = str(req.body.planOrderId);

    const plan = await db.planOrder.findUnique({
      where: { id: planOrderId },
      include: { items: true },
    });
    if (!plan) { res.status(404).json({ error: '计划单不存在' }); return; }

    const itemSpecs: Array<{ variantId: string | null; quantity: number }> = [];

    if (plan.items.length > 0) {
      for (const item of plan.items) {
        itemSpecs.push({
          variantId: item.variantId,
          quantity: Math.floor(Number(item.quantity)),
        });
      }
    } else {
      res.status(400).json({ error: '计划单无明细行，无法生成单品码' });
      return;
    }

    const existingCounts = await basePrisma.$queryRawUnsafe<
      Array<{ variant_id: string | null; cnt: bigint }>
    >(
      `SELECT variant_id, COUNT(*)::bigint AS cnt FROM item_codes
       WHERE tenant_id = $1::uuid AND plan_order_id = $2 AND status = 'ACTIVE' AND batch_id IS NULL
       GROUP BY variant_id`,
      tenantId,
      planOrderId,
    );
    const countMap = new Map<string, number>();
    for (const row of existingCounts) {
      countMap.set(row.variant_id ?? '__null__', Number(row.cnt));
    }

    const maxSerialResult = await basePrisma.$queryRawUnsafe<Array<{ max_sn: number | null }>>(
      `SELECT MAX(serial_no) AS max_sn FROM item_codes
       WHERE tenant_id = $1::uuid AND plan_order_id = $2`,
      tenantId,
      planOrderId,
    );
    let nextSerial = (maxSerialResult[0]?.max_sn ?? 0) + 1;

    const toInsert: Array<{
      id: string;
      tenantId: string;
      planOrderId: string;
      productId: string;
      variantId: string | null;
      serialNo: number;
      scanToken: string;
      status: string;
    }> = [];

    const byVariant: Array<{ variantId: string | null; count: number }> = [];

    for (const spec of itemSpecs) {
      const key = spec.variantId ?? '__null__';
      const existing = countMap.get(key) ?? 0;
      const needed = Math.max(0, spec.quantity - existing);
      byVariant.push({ variantId: spec.variantId, count: needed });

      for (let i = 0; i < needed; i++) {
        toInsert.push({
          id: genId('ic'),
          tenantId,
          planOrderId,
          productId: plan.productId,
          variantId: spec.variantId,
          serialNo: nextSerial++,
          scanToken: generateScanToken(),
          status: 'ACTIVE',
        });
      }
    }

    if (toInsert.length > 0) {
      await basePrisma.itemCode.createMany({ data: toInsert });
    }

    const totalForPlan = await db.itemCode.count({ where: { planOrderId } });

    res.json({
      generated: toInsert.length,
      totalForPlan,
      byVariant,
    });
  } catch (e) { next(e); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const planOrderId = optStr(req.query.planOrderId);
    const variantId = optStr(req.query.variantId);
    const batchId = optStr(req.query.batchId);
    const status = optStr(req.query.status);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(String(req.query.pageSize ?? '100'), 10)));

    const where: Record<string, unknown> = {};
    if (planOrderId) where.planOrderId = planOrderId;
    if (variantId) where.variantId = variantId === '__null__' ? null : variantId;
    if (batchId) where.batchId = batchId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.itemCode.findMany({
        where,
        orderBy: { serialNo: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { batch: { select: { id: true, sequenceNo: true } } },
      }),
      db.itemCode.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  } catch (e) { next(e); }
}

export async function voidCode(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const id = str(req.params.id);
    const code = await db.itemCode.findUnique({ where: { id } });
    if (!code) { res.status(404).json({ error: '单品码不存在' }); return; }
    if (code.status === 'VOIDED') { res.status(400).json({ error: '单品码已作废' }); return; }

    const updated = await db.itemCode.update({
      where: { id },
      data: { status: 'VOIDED' },
    });
    res.json(updated);
  } catch (e) { next(e); }
}

export async function scan(req: Request, res: Response, next: NextFunction) {
  try {
    const token = str(req.params.token);
    const code = await basePrisma.itemCode.findUnique({ where: { scanToken: token } });
    if (!code) { res.status(404).json({ error: '单品码不存在' }); return; }

    const callerTenantId = req.tenantId!;
    const ownerTenantId = code.tenantId;

    if (callerTenantId !== ownerTenantId) {
      const collab = await basePrisma.tenantCollaboration.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [
            { tenantAId: ownerTenantId, tenantBId: callerTenantId },
            { tenantAId: callerTenantId, tenantBId: ownerTenantId },
          ],
        },
      });
      if (!collab) {
        res.status(403).json({ error: '无权访问该单品码' });
        return;
      }
    }

    if (code.status === 'VOIDED') {
      res.json({ status: 'VOIDED', message: '该单品码已作废' });
      return;
    }

    const [product, plan, orders, tenant] = await Promise.all([
      basePrisma.product.findUnique({
        where: { id: code.productId },
        include: { variants: true },
      }),
      basePrisma.planOrder.findUnique({
        where: { id: code.planOrderId },
        select: { planNumber: true },
      }),
      basePrisma.productionOrder.findMany({
        where: { planOrderId: code.planOrderId, tenantId: ownerTenantId },
        select: { orderNumber: true },
      }),
      basePrisma.tenant.findUnique({
        where: { id: ownerTenantId },
        select: { name: true },
      }),
    ]);

    let colorName: string | null = null;
    let sizeName: string | null = null;
    let variantLabel: string | null = null;

    if (code.variantId && product) {
      const variant = product.variants.find((v: any) => v.id === code.variantId);
      if (variant) {
        const dictIds = [variant.colorId, variant.sizeId].filter(Boolean) as string[];
        if (dictIds.length > 0) {
          const dictItems = await basePrisma.dictionaryItem.findMany({
            where: { id: { in: dictIds }, tenantId: ownerTenantId },
          });
          const dictMap = new Map(dictItems.map((d: any) => [d.id, d.name]));
          colorName = (variant.colorId ? dictMap.get(variant.colorId) : null) ?? null;
          sizeName = (variant.sizeId ? dictMap.get(variant.sizeId) : null) ?? null;
        }
        const parts = [colorName, sizeName].filter(Boolean);
        variantLabel = parts.length > 0 ? parts.join('-') : (variant.skuSuffix || null);
      }
    }

    let batchIdOut: string | null = code.batchId ?? null;
    let batchSequenceNo: number | null = null;
    let batchSerialLabel: string | null = null;
    if (code.batchId) {
      const vb = await basePrisma.planVirtualBatch.findUnique({
        where: { id: code.batchId },
        select: { sequenceNo: true, planOrderId: true },
      });
      if (vb) {
        const pl = await basePrisma.planOrder.findUnique({
          where: { id: vb.planOrderId },
          select: { planNumber: true },
        });
        batchSequenceNo = vb.sequenceNo;
        batchSerialLabel =
          pl?.planNumber != null
            ? `B-${pl.planNumber}-${String(vb.sequenceNo).padStart(4, '0')}`
            : null;
      }
    }

    res.json({
      itemCodeId: code.id,
      serialNo: code.serialNo,
      status: code.status,
      planNumber: plan?.planNumber ?? null,
      orderNumbers: orders.map((o: any) => o.orderNumber),
      productId: code.productId,
      productName: product?.name ?? null,
      sku: product?.sku ?? null,
      variantId: code.variantId ?? null,
      variantLabel,
      colorName,
      sizeName,
      ownerTenantId,
      ownerTenantName: tenant?.name ?? null,
      batchId: batchIdOut,
      batchSequenceNo,
      batchSerialLabel,
    });
  } catch (e) { next(e); }
}
