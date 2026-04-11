import type { TenantPrismaClient } from '../lib/prisma.js';
import { prisma as basePrisma } from '../lib/prisma.js';
import { generateDocNo } from '../utils/docNumber.js';
import { nextOutsourceDocNoForPartner } from '../utils/partnerDocNumberServer.js';
import { genId } from '../utils/genId.js';
import { sanitizeUpdate, sanitizeCreate, normalizeDates } from '../utils/request.js';

const DOC_PREFIX: Record<string, string> = {
  STOCK_OUT: 'LL',
  STOCK_RETURN: 'TL',
  STOCK_IN: 'RK',
  OUTSOURCE: 'WX',
  REWORK: 'FG',
  REWORK_REPORT: 'FGBG',
  SCRAP: 'BS',
};

export async function listRecords(
  db: TenantPrismaClient,
  opts: { type?: string; orderId?: string; productId?: string; page?: number; pageSize?: number },
) {
  const where: Record<string, unknown> = {};
  if (opts.type) where.type = opts.type;
  if (opts.orderId) where.orderId = opts.orderId;
  if (opts.productId) where.productId = opts.productId;
  const orderBy: any = [{ timestamp: 'desc' }, { id: 'asc' }];

  if (opts.page != null && opts.pageSize != null) {
    const [data, total] = await Promise.all([
      db.productionOpRecord.findMany({ where, orderBy, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
      db.productionOpRecord.count({ where }),
    ]);
    return { data, total, page: opts.page, pageSize: opts.pageSize };
  }
  return db.productionOpRecord.findMany({ where, orderBy });
}

export async function getRecord(db: TenantPrismaClient, id: string) {
  return db.productionOpRecord.findUnique({ where: { id } });
}

export async function createRecord(
  db: TenantPrismaClient,
  body: Record<string, unknown>,
  tenantId?: string,
) {
  const data = sanitizeCreate(body);
  if (!data.id) data.id = genId('prodop');
  normalizeDates(data);
  if (!data.timestamp) data.timestamp = new Date();

  if (!data.docNo) {
    if (data.type === 'OUTSOURCE' && data.partner && tenantId) {
      const kind = data.status === '已收回' ? 'receive' : 'dispatch';
      data.docNo = await nextOutsourceDocNoForPartner(tenantId, kind, String(data.partner));
    } else if (DOC_PREFIX[data.type as string]) {
      data.docNo = await generateDocNo(
        DOC_PREFIX[data.type as string],
        'production_op_records',
        'doc_no',
        tenantId,
      );
    }
  }

  const record = await db.productionOpRecord.create({ data });

  if (data.type === 'OUTSOURCE' && data.status === '已收回' && !data.sourceReworkId) {
    await applyOutsourceProgress({ ...record, tenantId: tenantId ?? null });
  }

  return record;
}

export async function updateRecord(
  db: TenantPrismaClient,
  id: string,
  body: Record<string, unknown>,
) {
  const oldRecord = await db.productionOpRecord.findUnique({ where: { id } });
  if (!oldRecord) return null;

  const data = sanitizeUpdate(body);
  normalizeDates(data);
  const record = await db.productionOpRecord.update({ where: { id }, data });

  if (oldRecord.type === 'OUTSOURCE' && oldRecord.status === '已收回' && oldRecord.docNo) {
    await syncOutsourceReportOnUpdate(oldRecord, record);
  }

  return record;
}

export async function deleteRecord(db: TenantPrismaClient, id: string) {
  const record = await db.productionOpRecord.findUnique({ where: { id } });
  if (!record) return null;

  await db.productionOpRecord.delete({ where: { id } });

  if (record.type === 'OUTSOURCE' && record.status === '已收回' && record.docNo) {
    await removeOutsourceProgress(record);
  }

  return { message: '已删除' };
}

export async function getDefectiveRework(db: TenantPrismaClient) {
  const [milestones, defectiveAgg, reworkRecords] = await Promise.all([
    db.milestone.findMany({ select: { id: true, templateId: true, productionOrderId: true } }),
    basePrisma.milestoneReport.groupBy({
      by: ['milestoneId'],
      _sum: { defectiveQuantity: true },
      having: { defectiveQuantity: { _sum: { gt: 0 } } },
    }),
    db.productionOpRecord.findMany({
      where: { type: { in: ['REWORK', 'REWORK_REPORT'] } },
      select: { orderId: true, sourceNodeId: true, nodeId: true, quantity: true },
    }),
  ]);

  const msMap = new Map(milestones.map(m => [m.id, m]));
  const defectiveByMs = new Map(defectiveAgg.map(a => [a.milestoneId, Number(a._sum?.defectiveQuantity || 0)]));

  const result: Record<string, { defective: number; rework: number }> = {};

  for (const ms of milestones) {
    const key = `${ms.productionOrderId}|${ms.templateId}`;
    const defective = defectiveByMs.get(ms.id) || 0;
    const rework = reworkRecords
      .filter(r => r.orderId === ms.productionOrderId && (r.sourceNodeId === ms.templateId || r.nodeId === ms.templateId))
      .reduce((s, r) => s + Number(r.quantity), 0);
    if (defective > 0 || rework > 0) {
      result[key] = { defective, rework };
    }
  }
  return result;
}

// ── outsource progress helpers (kept as-is from original controller) ──

export async function applyOutsourceProgress(record: {
  id?: string;
  orderId: string | null;
  productId?: string | null;
  nodeId: string | null;
  quantity: unknown;
  variantId?: string | null;
  timestamp?: Date | string | null;
  docNo?: string | null;
  tenantId?: string | null;
  partner?: string | null;
}) {
  if (!record.nodeId) return;
  const qty = Number(record.quantity);
  if (!qty || qty <= 0) return;
  const ts = record.timestamp ? new Date(record.timestamp as string) : new Date();
  const partnerName = record.partner != null ? String(record.partner).trim() : '';
  const reportData = {
    operator: partnerName || '外协收回',
    quantity: qty,
    defectiveQuantity: 0,
    variantId: record.variantId || null,
    reportNo: record.docNo ?? null,
    customData: { source: 'outsourceReceive', docNo: record.docNo ?? '' },
  };

  if (record.orderId) {
    const milestone = await basePrisma.milestone.findFirst({
      where: { productionOrderId: record.orderId, templateId: record.nodeId },
    });
    if (!milestone) return;
    const newQty = Number(milestone.completedQuantity) + qty;
    const reportId = genId('rpt-wxrecv');
    await basePrisma.$transaction([
      basePrisma.milestoneReport.create({
        data: { id: reportId, milestoneId: milestone.id, timestamp: ts, ...reportData },
      }),
      basePrisma.milestone.update({
        where: { id: milestone.id },
        data: { completedQuantity: newQty, status: 'IN_PROGRESS' },
      }),
    ]);
    return;
  }

  if (!record.productId || !record.tenantId) return;
  const vid = record.variantId || null;
  let pmp = await basePrisma.productMilestoneProgress.findFirst({
    where: {
      productId: record.productId,
      variantId: vid,
      milestoneTemplateId: record.nodeId,
      tenantId: record.tenantId,
    },
  });
  if (!pmp) {
    pmp = await basePrisma.productMilestoneProgress.create({
      data: {
        id: genId('pmp-wxrecv'),
        tenantId: record.tenantId,
        productId: record.productId,
        variantId: vid,
        milestoneTemplateId: record.nodeId,
        completedQuantity: 0,
      },
    });
  }
  const newQty = Number(pmp.completedQuantity) + qty;
  const reportId = genId('rpt-wxrecv');
  await basePrisma.$transaction([
    basePrisma.productProgressReport.create({
      data: { id: reportId, progressId: pmp.id, timestamp: ts, ...reportData },
    }),
    basePrisma.productMilestoneProgress.update({
      where: { id: pmp.id },
      data: { completedQuantity: newQty },
    }),
  ]);
}

async function removeOutsourceProgress(record: {
  orderId: string | null;
  productId?: string | null;
  nodeId: string | null;
  docNo?: string | null;
  variantId?: string | null;
}) {
  if (!record.docNo) return;

  if (record.orderId && record.nodeId) {
    const milestone = await basePrisma.milestone.findFirst({
      where: { productionOrderId: record.orderId, templateId: record.nodeId },
    });
    if (!milestone) return;
    const reports = await basePrisma.milestoneReport.findMany({
      where: { milestoneId: milestone.id, reportNo: record.docNo },
    });
    if (reports.length === 0) return;
    const totalQty = reports.reduce((s, r) => s + Number(r.quantity), 0);
    await basePrisma.$transaction([
      basePrisma.milestoneReport.deleteMany({
        where: { milestoneId: milestone.id, reportNo: record.docNo },
      }),
      basePrisma.milestone.update({
        where: { id: milestone.id },
        data: {
          completedQuantity: Math.max(0, Number(milestone.completedQuantity) - totalQty),
        },
      }),
    ]);
    return;
  }

  if (record.productId && record.nodeId) {
    const vid = record.variantId || undefined;
    const pmps: any[] = await basePrisma.productMilestoneProgress.findMany({
      where: {
        productId: record.productId,
        milestoneTemplateId: record.nodeId!,
        ...(vid ? { variantId: vid } : {}),
      },
      include: { reports: { where: { reportNo: record.docNo } } },
    });
    for (const pmp of pmps) {
      if (!pmp.reports?.length) continue;
      const totalQty = pmp.reports.reduce((s: number, r: any) => s + Number(r.quantity), 0);
      await basePrisma.$transaction([
        basePrisma.productProgressReport.deleteMany({
          where: { progressId: pmp.id, reportNo: record.docNo },
        }),
        basePrisma.productMilestoneProgress.update({
          where: { id: pmp.id },
          data: {
            completedQuantity: Math.max(0, Number(pmp.completedQuantity) - totalQty),
          },
        }),
      ]);
    }
  }
}

async function syncOutsourceReportOnUpdate(
  oldRecord: {
    orderId: string | null;
    productId?: string | null;
    nodeId: string | null;
    docNo?: string | null;
    quantity: unknown;
    variantId?: string | null;
    timestamp?: Date | string | null;
  },
  newRecord: {
    orderId: string | null;
    productId?: string | null;
    nodeId: string | null;
    docNo?: string | null;
    quantity: unknown;
    variantId?: string | null;
    timestamp?: Date | string | null;
  },
) {
  const oldDocNo = oldRecord.docNo;
  if (!oldDocNo) return;

  const newQtyVal = Number(newRecord.quantity);
  const oldQtyVal = Number(oldRecord.quantity);
  const qtyDelta = newQtyVal - oldQtyVal;
  const newTs = newRecord.timestamp ? new Date(newRecord.timestamp as string) : undefined;

  if (oldRecord.orderId && oldRecord.nodeId) {
    const milestone = await basePrisma.milestone.findFirst({
      where: { productionOrderId: oldRecord.orderId, templateId: oldRecord.nodeId },
    });
    if (!milestone) return;
    const reports = await basePrisma.milestoneReport.findMany({
      where: { milestoneId: milestone.id, reportNo: oldDocNo },
    });
    if (reports.length === 0) return;
    const ops: any[] = [];
    for (const rpt of reports) {
      const updateData: Record<string, unknown> = { quantity: newQtyVal };
      if (newTs) updateData.timestamp = newTs;
      if (newRecord.docNo && newRecord.docNo !== oldDocNo) updateData.reportNo = newRecord.docNo;
      ops.push(basePrisma.milestoneReport.update({ where: { id: rpt.id }, data: updateData }));
    }
    if (qtyDelta !== 0) {
      ops.push(
        basePrisma.milestone.update({
          where: { id: milestone.id },
          data: {
            completedQuantity: Math.max(0, Number(milestone.completedQuantity) + qtyDelta),
          },
        }),
      );
    }
    await basePrisma.$transaction(ops);
    return;
  }

  if (oldRecord.productId && oldRecord.nodeId) {
    const vid = oldRecord.variantId || undefined;
    const pmps: any[] = await basePrisma.productMilestoneProgress.findMany({
      where: {
        productId: oldRecord.productId,
        milestoneTemplateId: oldRecord.nodeId!,
        ...(vid ? { variantId: vid } : {}),
      },
      include: { reports: { where: { reportNo: oldDocNo } } },
    });
    for (const pmp of pmps) {
      if (!pmp.reports?.length) continue;
      const ops: any[] = [];
      for (const rpt of pmp.reports) {
        const updateData: Record<string, unknown> = { quantity: newQtyVal };
        if (newTs) updateData.timestamp = newTs;
        if (newRecord.docNo && newRecord.docNo !== oldDocNo) updateData.reportNo = newRecord.docNo;
        ops.push(
          basePrisma.productProgressReport.update({ where: { id: rpt.id }, data: updateData }),
        );
      }
      if (qtyDelta !== 0) {
        ops.push(
          basePrisma.productMilestoneProgress.update({
            where: { id: pmp.id },
            data: {
              completedQuantity: Math.max(0, Number(pmp.completedQuantity) + qtyDelta),
            },
          }),
        );
      }
      await basePrisma.$transaction(ops);
    }
  }
}
