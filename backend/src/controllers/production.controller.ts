import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma, prisma as basePrisma } from '../lib/prisma.js';
import { generateDocNo } from '../utils/docNumber.js';
import { str, optStr, sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

const DOC_PREFIX: Record<string, string> = {
  STOCK_OUT: 'LL',
  STOCK_RETURN: 'TL',
  STOCK_IN: 'RK',
  OUTSOURCE: 'WX',
  REWORK: 'FG',
  REWORK_REPORT: 'FGBG',
  SCRAP: 'BS',
};

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const type = optStr(req.query.type);
    const orderId = optStr(req.query.orderId);
    const productId = optStr(req.query.productId);
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (orderId) where.orderId = orderId;
    if (productId) where.productId = productId;
    res.json(await db.productionOpRecord.findMany({ where, orderBy: { timestamp: 'desc' } }));
  } catch (e) { next(e); }
}

export async function getRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await basePrisma.productionOpRecord.findUnique({ where: { id: str(req.params.id) } });
    if (!record) { res.status(404).json({ error: '记录不存在' }); return; }
    res.json(record);
  } catch (e) { next(e); }
}

export async function createRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const data = sanitizeCreate(req.body);
    if (!data.id) data.id = `prodop-${Date.now()}`;
    normalizeDates(data);
    if (!data.timestamp) data.timestamp = new Date();

    if (!data.docNo && DOC_PREFIX[data.type]) {
      data.docNo = await generateDocNo(DOC_PREFIX[data.type], 'production_op_records', 'doc_no');
    }

    const record = await db.productionOpRecord.create({ data });

    if (data.type === 'OUTSOURCE' && data.status === '已收回') {
      await applyOutsourceProgress(record);
    }

    res.status(201).json(record);
  } catch (e) { next(e); }
}

export async function updateRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sanitizeUpdate(req.body);
    normalizeDates(data);
    const record = await basePrisma.productionOpRecord.update({ where: { id: str(req.params.id) }, data });
    res.json(record);
  } catch (e) { next(e); }
}

export async function deleteRecord(req: Request, res: Response, next: NextFunction) {
  try {
    await basePrisma.productionOpRecord.delete({ where: { id: str(req.params.id) } });
    res.json({ message: '已删除' });
  } catch (e) { next(e); }
}

async function applyOutsourceProgress(record: {
  id?: string; orderId: string | null; nodeId: string | null;
  quantity: unknown; variantId?: string | null;
  timestamp?: Date | string | null; docNo?: string | null;
}) {
  if (!record.orderId || !record.nodeId) return;

  const milestone = await basePrisma.milestone.findFirst({
    where: { productionOrderId: record.orderId, templateId: record.nodeId },
  });
  if (!milestone) return;

  const qty = Number(record.quantity);
  const newQty = Number(milestone.completedQuantity) + qty;

  const reportId = `rpt-wxrecv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await basePrisma.$transaction([
    basePrisma.milestoneReport.create({
      data: {
        id: reportId,
        milestoneId: milestone.id,
        timestamp: record.timestamp ? new Date(record.timestamp as string) : new Date(),
        operator: '外协收回',
        quantity: qty,
        defectiveQuantity: 0,
        variantId: record.variantId || null,
        reportNo: record.docNo ? `外协收回·${record.docNo}` : null,
        customData: { source: 'outsourceReceive', docNo: record.docNo ?? '' },
      },
    }),
    basePrisma.milestone.update({
      where: { id: milestone.id },
      data: { completedQuantity: newQty, status: 'IN_PROGRESS' },
    }),
  ]);
}

export async function getDefectiveRework(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const orders = await db.productionOrder.findMany({
      include: { milestones: { include: { reports: true } } },
    });
    const reworkRecords = await db.productionOpRecord.findMany({
      where: { type: { in: ['REWORK', 'REWORK_REPORT'] } },
    });

    const result: Record<string, { defective: number; rework: number }> = {};
    for (const order of orders) {
      for (const ms of order.milestones) {
        const key = `${order.id}|${ms.templateId}`;
        const defective = ms.reports.reduce((s, r) => s + Number(r.defectiveQuantity), 0);
        const rework = reworkRecords
          .filter(r => r.orderId === order.id && (r.sourceNodeId === ms.templateId || r.nodeId === ms.templateId))
          .reduce((s, r) => s + Number(r.quantity), 0);
        result[key] = { defective, rework };
      }
    }

    res.json(result);
  } catch (e) { next(e); }
}
