import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  buildTenantUsageAlerts,
  type AdminUsageAlert,
} from '../utils/adminUsageAlerts.js';

export type TenantHealth = 'active' | 'low' | 'silent' | 'expired';

export type TenantUsageModules = {
  production: boolean;
  psi: boolean;
  finance: boolean;
  knowledge: boolean;
  development: boolean;
};

export type TenantUsageRow = {
  tenantId: string;
  name: string;
  status: string;
  expiresAt: string | null;
  memberCount: number;
  mau: number;
  dau: number;
  loginClientWeb: number;
  loginClientMiniprogram: number;
  loginClientUnknown: number;
  planOrderCount: number;
  productionOrderCount: number;
  reportCount: number;
  reportCountRecent: number;
  opRecordCount: number;
  opRecordByType: Record<string, number>;
  psiRecordCount: number;
  financeRecordCount: number;
  productCount: number;
  partnerCount: number;
  itemCodeCount: number;
  itemCodeCountRecent: number;
  virtualBatchCount: number;
  virtualBatchCountRecent: number;
  knowledgeDocumentCount: number;
  knowledgeFolderCount: number;
  knowledgeAssetCount: number;
  knowledgeAssetBytes: number;
  knowledgeContentBytes: number;
  knowledgeDocUpdatedRecent: number;
  productWithImageCount: number;
  productImageBytes: number;
  devStyleCount: number;
  devAttachmentCount: number;
  devAttachmentBytes: number;
  storageBytesTotal: number;
  lastActivityAt: string | null;
  health: TenantHealth;
  modules: TenantUsageModules;
};

export type AdminUsageTopItem = {
  tenantId: string;
  name: string;
  value: number;
};

export type AdminUsageOverview = {
  windowDays: number;
  tenantTotal: number;
  pendingCount: number;
  expiredCount: number;
  activeRecentReportTenants: number;
  newTenantsThisWeek: number;
  platformMau: number;
  platformDau: number;
  loginClientWeb: number;
  loginClientMiniprogram: number;
  loginClientUnknown: number;
  itemCodeTotal: number;
  itemCodeRecent7d: number;
  knowledgeAssetBytesTotal: number;
  knowledgeDocumentTotal: number;
  productImageBytesTotal: number;
  storageBytesTotal: number;
  refreshTokenTotal: number;
  refreshTokenExpired: number;
  topByItemCode: AdminUsageTopItem[];
  topByReports: AdminUsageTopItem[];
  topByKnowledgeBytes: AdminUsageTopItem[];
  topByStorage: AdminUsageTopItem[];
  expiringSoon: Array<{
    tenantId: string;
    name: string;
    expiresAt: string;
    daysLeft: number;
  }>;
  alerts: AdminUsageAlert[];
};

export type AdminUsageResponse = {
  windowDays: number;
  overview: AdminUsageOverview;
  tenants: TenantUsageRow[];
};

function toCountMap(rows: Array<{ tenantId: string; _count: { _all: number } }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.tenantId, r._count._all);
  return map;
}

function numMapFromRaw(rows: Array<{ tenant_id: string; cnt: number | bigint }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.tenant_id, Number(r.cnt));
  return map;
}

/** 健康度：已过期 > 近 7 天有业务 > 近 30 天有业务 > 沉默 */
export function classifyTenantHealth(opts: {
  expiresAt: Date | null;
  status: string;
  lastActivityAt: Date | null;
  now: Date;
}): TenantHealth {
  if (opts.status === 'active' && opts.expiresAt && opts.expiresAt < opts.now) return 'expired';
  if (!opts.lastActivityAt) return 'silent';
  const days = (opts.now.getTime() - opts.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 7) return 'active';
  if (days <= 30) return 'low';
  return 'silent';
}

function get(map: Map<string, number>, id: string): number {
  return map.get(id) ?? 0;
}

/**
 * 平台管理员：跨租户业务用量 + 系统负担 + 登录活跃。
 * 使用全局 prisma（非租户作用域），仅供 requireAdmin 路由调用。
 */
export async function getAdminTenantUsage(windowDays = 30): Promise<AdminUsageResponse> {
  const days = Number.isFinite(windowDays) && windowDays > 0 && windowDays <= 365 ? Math.floor(windowDays) : 30;
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since1d = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const [
    planCounts,
    orderCounts,
    psiCounts,
    financeCounts,
    productCounts,
    partnerCounts,
    itemCodeCounts,
    itemCodeRecentCounts,
    batchCounts,
    batchRecentCounts,
    opCounts,
    folderCounts,
    docCounts,
    assetAgg,
    contentAgg,
    docUpdatedRecent,
    devStyleCounts,
    milestoneReportCounts,
    milestoneReportRecent,
    productReportCounts,
    productReportRecent,
    lastActivityRows,
    itemCodeRecent7dRows,
    mauRows,
    dauRows,
    clientRows,
    productImageRows,
    opTypeRows,
    devAttachmentRows,
    refreshTokenTotal,
    refreshTokenExpired,
    platformMau,
    platformDau,
    platformClients,
  ] = await Promise.all([
    prisma.planOrder.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.productionOrder.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.psiRecord.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.financeRecord.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.product.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.partner.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.itemCode.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.itemCode.groupBy({
      by: ['tenantId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.planVirtualBatch.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.planVirtualBatch.groupBy({
      by: ['tenantId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.productionOpRecord.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.knowledgeFolder.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.knowledgeDocument.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint; bytes: bigint }>>(Prisma.sql`
      SELECT tenant_id, COUNT(*)::bigint AS cnt, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
      FROM knowledge_assets
      GROUP BY tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; bytes: bigint }>>(Prisma.sql`
      SELECT tenant_id, COALESCE(SUM(octet_length(content)), 0)::bigint AS bytes
      FROM knowledge_documents
      GROUP BY tenant_id
    `),
    prisma.knowledgeDocument.groupBy({
      by: ['tenantId'],
      where: { updatedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.devStyle.groupBy({ by: ['tenantId'], _count: { _all: true } }),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint }>>(Prisma.sql`
      SELECT po.tenant_id, COUNT(*)::bigint AS cnt
      FROM milestone_reports mr
      INNER JOIN milestones m ON m.id = mr.milestone_id
      INNER JOIN production_orders po ON po.id = m.production_order_id
      GROUP BY po.tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint }>>(Prisma.sql`
      SELECT po.tenant_id, COUNT(*)::bigint AS cnt
      FROM milestone_reports mr
      INNER JOIN milestones m ON m.id = mr.milestone_id
      INNER JOIN production_orders po ON po.id = m.production_order_id
      WHERE mr.created_at >= ${since}
      GROUP BY po.tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint }>>(Prisma.sql`
      SELECT pmp.tenant_id, COUNT(*)::bigint AS cnt
      FROM product_progress_reports ppr
      INNER JOIN product_milestone_progresses pmp ON pmp.id = ppr.progress_id
      GROUP BY pmp.tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint }>>(Prisma.sql`
      SELECT pmp.tenant_id, COUNT(*)::bigint AS cnt
      FROM product_progress_reports ppr
      INNER JOIN product_milestone_progresses pmp ON pmp.id = ppr.progress_id
      WHERE ppr.created_at >= ${since}
      GROUP BY pmp.tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; last_at: Date | null }>>(Prisma.sql`
      SELECT tenant_id, MAX(last_at) AS last_at
      FROM (
        SELECT tenant_id, MAX(created_at) AS last_at FROM item_codes GROUP BY tenant_id
        UNION ALL
        SELECT tenant_id, MAX(created_at) AS last_at FROM plan_virtual_batches GROUP BY tenant_id
        UNION ALL
        SELECT tenant_id, MAX(created_at) AS last_at FROM production_op_records GROUP BY tenant_id
        UNION ALL
        SELECT tenant_id, MAX(created_at) AS last_at FROM psi_records GROUP BY tenant_id
        UNION ALL
        SELECT tenant_id, MAX(created_at) AS last_at FROM finance_records GROUP BY tenant_id
        UNION ALL
        SELECT tenant_id, MAX(updated_at) AS last_at FROM knowledge_documents GROUP BY tenant_id
        UNION ALL
        SELECT tenant_id, MAX(last_active_at) AS last_at
        FROM tenant_memberships
        WHERE last_active_at IS NOT NULL
        GROUP BY tenant_id
        UNION ALL
        SELECT po.tenant_id, MAX(mr.created_at) AS last_at
        FROM milestone_reports mr
        INNER JOIN milestones m ON m.id = mr.milestone_id
        INNER JOIN production_orders po ON po.id = m.production_order_id
        GROUP BY po.tenant_id
        UNION ALL
        SELECT pmp.tenant_id, MAX(ppr.created_at) AS last_at
        FROM product_progress_reports ppr
        INNER JOIN product_milestone_progresses pmp ON pmp.id = ppr.progress_id
        GROUP BY pmp.tenant_id
      ) activity
      GROUP BY tenant_id
    `),
    prisma.itemCode.groupBy({
      by: ['tenantId'],
      where: { createdAt: { gte: since7d } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint }>>(Prisma.sql`
      SELECT tenant_id, COUNT(*)::bigint AS cnt
      FROM tenant_memberships
      WHERE last_active_at >= ${since}
      GROUP BY tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint }>>(Prisma.sql`
      SELECT tenant_id, COUNT(*)::bigint AS cnt
      FROM tenant_memberships
      WHERE last_active_at >= ${since1d}
      GROUP BY tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; client: string | null; cnt: bigint }>>(Prisma.sql`
      SELECT m.tenant_id, COALESCE(u.last_login_client, 'unknown') AS client, COUNT(*)::bigint AS cnt
      FROM tenant_memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.last_active_at >= ${since}
      GROUP BY m.tenant_id, COALESCE(u.last_login_client, 'unknown')
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; with_img: bigint; bytes: bigint }>>(Prisma.sql`
      SELECT
        tenant_id,
        COUNT(*) FILTER (
          WHERE image_url IS NOT NULL AND length(image_url) > 0
        )::bigint AS with_img,
        COALESCE(SUM(octet_length(COALESCE(image_url, '')) + octet_length(COALESCE(image_thumb, ''))), 0)::bigint AS bytes
      FROM products
      GROUP BY tenant_id
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; type: string; cnt: bigint }>>(Prisma.sql`
      SELECT tenant_id, type, COUNT(*)::bigint AS cnt
      FROM production_op_records
      GROUP BY tenant_id, type
    `),
    prisma.$queryRaw<Array<{ tenant_id: string; cnt: bigint; bytes: bigint }>>(Prisma.sql`
      SELECT
        s.tenant_id,
        COUNT(a.id)::bigint AS cnt,
        COALESCE(SUM(octet_length(a.file_url)), 0)::bigint AS bytes
      FROM dev_attachments a
      INNER JOIN dev_stages st ON st.id = a.stage_id
      INNER JOIN dev_samples sm ON sm.id = st.sample_id
      INNER JOIN dev_styles s ON s.id = sm.style_id
      GROUP BY s.tenant_id
    `),
    prisma.refreshToken.count(),
    prisma.refreshToken.count({ where: { expiresAt: { lt: now } } }),
    prisma.tenantMembership.count({ where: { lastActiveAt: { gte: since } } }),
    prisma.tenantMembership.count({ where: { lastActiveAt: { gte: since1d } } }),
    prisma.$queryRaw<Array<{ client: string | null; cnt: bigint }>>(Prisma.sql`
      SELECT COALESCE(last_login_client, 'unknown') AS client, COUNT(*)::bigint AS cnt
      FROM users
      WHERE last_login_at >= ${since}
      GROUP BY COALESCE(last_login_client, 'unknown')
    `),
  ]);

  const planMap = toCountMap(planCounts);
  const orderMap = toCountMap(orderCounts);
  const psiMap = toCountMap(psiCounts);
  const financeMap = toCountMap(financeCounts);
  const productMap = toCountMap(productCounts);
  const partnerMap = toCountMap(partnerCounts);
  const itemMap = toCountMap(itemCodeCounts);
  const itemRecentMap = toCountMap(itemCodeRecentCounts);
  const batchMap = toCountMap(batchCounts);
  const batchRecentMap = toCountMap(batchRecentCounts);
  const opMap = toCountMap(opCounts);
  const folderMap = toCountMap(folderCounts);
  const docMap = toCountMap(docCounts);
  const docUpdatedMap = toCountMap(docUpdatedRecent);
  const devMap = toCountMap(devStyleCounts);
  const mrMap = numMapFromRaw(milestoneReportCounts);
  const mrRecentMap = numMapFromRaw(milestoneReportRecent);
  const pprMap = numMapFromRaw(productReportCounts);
  const pprRecentMap = numMapFromRaw(productReportRecent);
  const mauMap = numMapFromRaw(mauRows);
  const dauMap = numMapFromRaw(dauRows);

  const assetMap = new Map<string, { count: number; bytes: number }>();
  for (const r of assetAgg) {
    assetMap.set(r.tenant_id, { count: Number(r.cnt), bytes: Number(r.bytes) });
  }
  const contentBytesMap = new Map<string, number>();
  for (const r of contentAgg) contentBytesMap.set(r.tenant_id, Number(r.bytes));

  const activityMap = new Map<string, Date | null>();
  for (const r of lastActivityRows) activityMap.set(r.tenant_id, r.last_at);

  const productImageMap = new Map<string, { withImg: number; bytes: number }>();
  for (const r of productImageRows) {
    productImageMap.set(r.tenant_id, { withImg: Number(r.with_img), bytes: Number(r.bytes) });
  }

  const opTypeMap = new Map<string, Record<string, number>>();
  for (const r of opTypeRows) {
    const cur = opTypeMap.get(r.tenant_id) ?? {};
    cur[r.type] = Number(r.cnt);
    opTypeMap.set(r.tenant_id, cur);
  }

  const devAttMap = new Map<string, { count: number; bytes: number }>();
  for (const r of devAttachmentRows) {
    devAttMap.set(r.tenant_id, { count: Number(r.cnt), bytes: Number(r.bytes) });
  }

  const clientMap = new Map<string, { web: number; miniprogram: number; unknown: number }>();
  for (const r of clientRows) {
    const cur = clientMap.get(r.tenant_id) ?? { web: 0, miniprogram: 0, unknown: 0 };
    const n = Number(r.cnt);
    if (r.client === 'web') cur.web += n;
    else if (r.client === 'miniprogram') cur.miniprogram += n;
    else cur.unknown += n;
    clientMap.set(r.tenant_id, cur);
  }

  const rows: TenantUsageRow[] = tenants.map((t) => {
    const reportCount = get(mrMap, t.id) + get(pprMap, t.id);
    const reportCountRecent = get(mrRecentMap, t.id) + get(pprRecentMap, t.id);
    const asset = assetMap.get(t.id) ?? { count: 0, bytes: 0 };
    const img = productImageMap.get(t.id) ?? { withImg: 0, bytes: 0 };
    const devAtt = devAttMap.get(t.id) ?? { count: 0, bytes: 0 };
    const clients = clientMap.get(t.id) ?? { web: 0, miniprogram: 0, unknown: 0 };
    const lastAt = activityMap.get(t.id) ?? null;
    const knowledgeDocumentCount = get(docMap, t.id);
    const storageBytesTotal = asset.bytes + img.bytes + devAtt.bytes;
    const modules: TenantUsageModules = {
      production: reportCount > 0 || get(opMap, t.id) > 0 || get(orderMap, t.id) > 0,
      psi: get(psiMap, t.id) > 0,
      finance: get(financeMap, t.id) > 0,
      knowledge: knowledgeDocumentCount > 0 || asset.count > 0,
      development: get(devMap, t.id) > 0,
    };
    return {
      tenantId: t.id,
      name: t.name,
      status: t.status,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      memberCount: t._count.memberships,
      mau: get(mauMap, t.id),
      dau: get(dauMap, t.id),
      loginClientWeb: clients.web,
      loginClientMiniprogram: clients.miniprogram,
      loginClientUnknown: clients.unknown,
      planOrderCount: get(planMap, t.id),
      productionOrderCount: get(orderMap, t.id),
      reportCount,
      reportCountRecent,
      opRecordCount: get(opMap, t.id),
      opRecordByType: opTypeMap.get(t.id) ?? {},
      psiRecordCount: get(psiMap, t.id),
      financeRecordCount: get(financeMap, t.id),
      productCount: get(productMap, t.id),
      partnerCount: get(partnerMap, t.id),
      itemCodeCount: get(itemMap, t.id),
      itemCodeCountRecent: get(itemRecentMap, t.id),
      virtualBatchCount: get(batchMap, t.id),
      virtualBatchCountRecent: get(batchRecentMap, t.id),
      knowledgeDocumentCount,
      knowledgeFolderCount: get(folderMap, t.id),
      knowledgeAssetCount: asset.count,
      knowledgeAssetBytes: asset.bytes,
      knowledgeContentBytes: contentBytesMap.get(t.id) ?? 0,
      knowledgeDocUpdatedRecent: get(docUpdatedMap, t.id),
      productWithImageCount: img.withImg,
      productImageBytes: img.bytes,
      devStyleCount: get(devMap, t.id),
      devAttachmentCount: devAtt.count,
      devAttachmentBytes: devAtt.bytes,
      storageBytesTotal,
      lastActivityAt: lastAt?.toISOString() ?? null,
      health: classifyTenantHealth({
        expiresAt: t.expiresAt,
        status: t.status,
        lastActivityAt: lastAt,
        now,
      }),
      modules,
    };
  });

  const itemCodeRecent7d = itemCodeRecent7dRows.reduce((s, r) => s + r._count._all, 0);
  let platWeb = 0;
  let platMp = 0;
  let platUnknown = 0;
  for (const r of platformClients) {
    const n = Number(r.cnt);
    if (r.client === 'web') platWeb += n;
    else if (r.client === 'miniprogram') platMp += n;
    else platUnknown += n;
  }

  const topN = 10;
  const byItem = [...rows].sort((a, b) => b.itemCodeCount - a.itemCodeCount).slice(0, topN);
  const byReport = [...rows].sort((a, b) => b.reportCount - a.reportCount).slice(0, topN);
  const byKb = [...rows].sort((a, b) => b.knowledgeAssetBytes - a.knowledgeAssetBytes).slice(0, topN);
  const byStorage = [...rows].sort((a, b) => b.storageBytesTotal - a.storageBytesTotal).slice(0, topN);

  const expiringSoon = tenants
    .filter((t) => t.status === 'active' && t.expiresAt && t.expiresAt >= now)
    .map((t) => {
      const expiresAt = t.expiresAt!;
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return { tenantId: t.id, name: t.name, expiresAt: expiresAt.toISOString(), daysLeft };
    })
    .filter((t) => t.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const alerts = buildTenantUsageAlerts(rows);

  const overview: AdminUsageOverview = {
    windowDays: days,
    tenantTotal: tenants.length,
    pendingCount: tenants.filter((t) => t.status === 'pending').length,
    expiredCount: tenants.filter((t) => t.status === 'active' && t.expiresAt && t.expiresAt < now).length,
    activeRecentReportTenants: rows.filter((r) => r.reportCountRecent > 0).length,
    newTenantsThisWeek: tenants.filter((t) => t.createdAt >= weekAgo).length,
    platformMau,
    platformDau,
    loginClientWeb: platWeb,
    loginClientMiniprogram: platMp,
    loginClientUnknown: platUnknown,
    itemCodeTotal: rows.reduce((s, r) => s + r.itemCodeCount, 0),
    itemCodeRecent7d,
    knowledgeAssetBytesTotal: rows.reduce((s, r) => s + r.knowledgeAssetBytes, 0),
    knowledgeDocumentTotal: rows.reduce((s, r) => s + r.knowledgeDocumentCount, 0),
    productImageBytesTotal: rows.reduce((s, r) => s + r.productImageBytes, 0),
    storageBytesTotal: rows.reduce((s, r) => s + r.storageBytesTotal, 0),
    refreshTokenTotal,
    refreshTokenExpired,
    topByItemCode: byItem.map((r) => ({ tenantId: r.tenantId, name: r.name, value: r.itemCodeCount })),
    topByReports: byReport.map((r) => ({ tenantId: r.tenantId, name: r.name, value: r.reportCount })),
    topByKnowledgeBytes: byKb.map((r) => ({
      tenantId: r.tenantId,
      name: r.name,
      value: r.knowledgeAssetBytes,
    })),
    topByStorage: byStorage.map((r) => ({
      tenantId: r.tenantId,
      name: r.name,
      value: r.storageBytesTotal,
    })),
    expiringSoon,
    alerts: alerts.slice(0, 30),
  };

  return { windowDays: days, overview, tenants: rows };
}

/** 单企业详情：业务/负担指标均按时间窗统计；存储占用为当前快照。 */
export type AdminTenantUsageDetail = {
  windowDays: number;
  tenantId: string;
  name: string;
  status: string;
  expiresAt: string | null;
  health: TenantHealth;
  lastActivityAt: string | null;
  mau: number;
  dau: number;
  loginClientWeb: number;
  loginClientMiniprogram: number;
  loginClientUnknown: number;
  planOrderCount: number;
  productionOrderCount: number;
  reportCount: number;
  psiRecordCount: number;
  financeRecordCount: number;
  productCount: number;
  partnerCount: number;
  devStyleCount: number;
  itemCodeCount: number;
  virtualBatchCount: number;
  opRecordCount: number;
  knowledgeDocUpdated: number;
  knowledgeDocumentCount: number;
  knowledgeAssetCount: number;
  knowledgeAssetBytes: number;
  knowledgeContentBytes: number;
  productWithImageCount: number;
  productImageBytes: number;
  devAttachmentCount: number;
  devAttachmentBytes: number;
  storageBytesTotal: number;
};

function normalizeWindowDays(windowDays: number): number {
  return Number.isFinite(windowDays) && windowDays > 0 && windowDays <= 365 ? Math.floor(windowDays) : 30;
}

export async function getAdminTenantUsageDetail(
  tenantId: string,
  windowDays = 30,
): Promise<AdminTenantUsageDetail> {
  const days = normalizeWindowDays(windowDays);
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const since1d = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, status: true, expiresAt: true },
  });
  if (!tenant) throw new AppError(404, '企业不存在');

  const [
    planOrderCount,
    productionOrderCount,
    psiRecordCount,
    financeRecordCount,
    productCount,
    partnerCount,
    devStyleCount,
    itemCodeCount,
    virtualBatchCount,
    opRecordCount,
    knowledgeDocUpdated,
    mau,
    dau,
    clientRows,
    mrCount,
    pprCount,
    lastActivityRows,
    assetAgg,
    contentAgg,
    docCount,
    productImageRows,
    devAttachmentRows,
  ] = await Promise.all([
    prisma.planOrder.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.productionOrder.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.psiRecord.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.financeRecord.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.product.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.partner.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.devStyle.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.itemCode.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.planVirtualBatch.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.productionOpRecord.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.knowledgeDocument.count({ where: { tenantId, updatedAt: { gte: since } } }),
    prisma.tenantMembership.count({ where: { tenantId, lastActiveAt: { gte: since } } }),
    prisma.tenantMembership.count({ where: { tenantId, lastActiveAt: { gte: since1d } } }),
    prisma.$queryRaw<Array<{ client: string | null; cnt: bigint }>>(Prisma.sql`
      SELECT COALESCE(u.last_login_client, 'unknown') AS client, COUNT(*)::bigint AS cnt
      FROM tenant_memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ${tenantId}::uuid AND m.last_active_at >= ${since}
      GROUP BY COALESCE(u.last_login_client, 'unknown')
    `),
    prisma.$queryRaw<Array<{ cnt: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS cnt
      FROM milestone_reports mr
      INNER JOIN milestones m ON m.id = mr.milestone_id
      INNER JOIN production_orders po ON po.id = m.production_order_id
      WHERE po.tenant_id = ${tenantId}::uuid AND mr.created_at >= ${since}
    `),
    prisma.$queryRaw<Array<{ cnt: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS cnt
      FROM product_progress_reports ppr
      INNER JOIN product_milestone_progresses pmp ON pmp.id = ppr.progress_id
      WHERE pmp.tenant_id = ${tenantId}::uuid AND ppr.created_at >= ${since}
    `),
    prisma.$queryRaw<Array<{ last_at: Date | null }>>(Prisma.sql`
      SELECT MAX(last_at) AS last_at
      FROM (
        SELECT MAX(created_at) AS last_at FROM item_codes WHERE tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(created_at) FROM plan_virtual_batches WHERE tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(created_at) FROM production_op_records WHERE tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(created_at) FROM psi_records WHERE tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(created_at) FROM finance_records WHERE tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(updated_at) FROM knowledge_documents WHERE tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(last_active_at) FROM tenant_memberships WHERE tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(mr.created_at)
        FROM milestone_reports mr
        INNER JOIN milestones m ON m.id = mr.milestone_id
        INNER JOIN production_orders po ON po.id = m.production_order_id
        WHERE po.tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT MAX(ppr.created_at)
        FROM product_progress_reports ppr
        INNER JOIN product_milestone_progresses pmp ON pmp.id = ppr.progress_id
        WHERE pmp.tenant_id = ${tenantId}::uuid
      ) activity
    `),
    prisma.$queryRaw<Array<{ cnt: bigint; bytes: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
      FROM knowledge_assets WHERE tenant_id = ${tenantId}::uuid
    `),
    prisma.$queryRaw<Array<{ bytes: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(octet_length(content)), 0)::bigint AS bytes
      FROM knowledge_documents WHERE tenant_id = ${tenantId}::uuid
    `),
    prisma.knowledgeDocument.count({ where: { tenantId } }),
    prisma.$queryRaw<Array<{ with_img: bigint; bytes: bigint }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE image_url IS NOT NULL AND length(image_url) > 0)::bigint AS with_img,
        COALESCE(SUM(octet_length(COALESCE(image_url, '')) + octet_length(COALESCE(image_thumb, ''))), 0)::bigint AS bytes
      FROM products WHERE tenant_id = ${tenantId}::uuid
    `),
    prisma.$queryRaw<Array<{ cnt: bigint; bytes: bigint }>>(Prisma.sql`
      SELECT COUNT(a.id)::bigint AS cnt, COALESCE(SUM(octet_length(a.file_url)), 0)::bigint AS bytes
      FROM dev_attachments a
      INNER JOIN dev_stages st ON st.id = a.stage_id
      INNER JOIN dev_samples sm ON sm.id = st.sample_id
      INNER JOIN dev_styles s ON s.id = sm.style_id
      WHERE s.tenant_id = ${tenantId}::uuid
    `),
  ]);

  let loginClientWeb = 0;
  let loginClientMiniprogram = 0;
  let loginClientUnknown = 0;
  for (const r of clientRows) {
    const n = Number(r.cnt);
    if (r.client === 'web') loginClientWeb += n;
    else if (r.client === 'miniprogram') loginClientMiniprogram += n;
    else loginClientUnknown += n;
  }

  const reportCount = Number(mrCount[0]?.cnt ?? 0) + Number(pprCount[0]?.cnt ?? 0);
  const lastAt = lastActivityRows[0]?.last_at ?? null;
  const knowledgeAssetCount = Number(assetAgg[0]?.cnt ?? 0);
  const knowledgeAssetBytes = Number(assetAgg[0]?.bytes ?? 0);
  const knowledgeContentBytes = Number(contentAgg[0]?.bytes ?? 0);
  const productWithImageCount = Number(productImageRows[0]?.with_img ?? 0);
  const productImageBytes = Number(productImageRows[0]?.bytes ?? 0);
  const devAttachmentCount = Number(devAttachmentRows[0]?.cnt ?? 0);
  const devAttachmentBytes = Number(devAttachmentRows[0]?.bytes ?? 0);

  return {
    windowDays: days,
    tenantId: tenant.id,
    name: tenant.name,
    status: tenant.status,
    expiresAt: tenant.expiresAt?.toISOString() ?? null,
    health: classifyTenantHealth({
      expiresAt: tenant.expiresAt,
      status: tenant.status,
      lastActivityAt: lastAt,
      now,
    }),
    lastActivityAt: lastAt?.toISOString() ?? null,
    mau,
    dau,
    loginClientWeb,
    loginClientMiniprogram,
    loginClientUnknown,
    planOrderCount,
    productionOrderCount,
    reportCount,
    psiRecordCount,
    financeRecordCount,
    productCount,
    partnerCount,
    devStyleCount,
    itemCodeCount,
    virtualBatchCount,
    opRecordCount,
    knowledgeDocUpdated,
    knowledgeDocumentCount: docCount,
    knowledgeAssetCount,
    knowledgeAssetBytes,
    knowledgeContentBytes,
    productWithImageCount,
    productImageBytes,
    devAttachmentCount,
    devAttachmentBytes,
    storageBytesTotal: knowledgeAssetBytes + productImageBytes + devAttachmentBytes,
  };
}
