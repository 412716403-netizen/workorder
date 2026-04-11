import { prisma } from '../lib/prisma.js';

function trimStr(s: string): string {
  return s.trim();
}

async function resolvePartnerSegment(tenantId: string, partnerName: string): Promise<string> {
  const t = trimStr(partnerName);
  if (!t) return '0000';
  const partners = await prisma.partner.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, partnerListNo: true },
  });
  const p = partners.find(x => trimStr(x.name) === t);
  if (!p) return '0000';
  if (p.partnerListNo != null && p.partnerListNo >= 1) {
    return String(p.partnerListNo).padStart(4, '0');
  }
  const idx = partners.findIndex(x => x.id === p.id);
  return String(idx >= 0 ? idx + 1 : 1).padStart(4, '0');
}

export type OutsourceDocKindServer = 'dispatch' | 'receive';

const PREFIX: Record<OutsourceDocKindServer, string> = {
  dispatch: 'WX',
  receive: 'WR',
};

/**
 * 服务端外协单号（与前端 partnerDocNumber 规则一致）
 */
export async function nextOutsourceDocNoForPartner(
  tenantId: string,
  kind: OutsourceDocKindServer,
  partnerName: string,
): Promise<string> {
  const seg = await resolvePartnerSegment(tenantId, partnerName);
  const prefix = PREFIX[kind];
  const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${prefix}-${escaped}-(\\d+)$`);
  const pt = trimStr(partnerName);
  const rows = await prisma.productionOpRecord.findMany({
    where: { tenantId, type: 'OUTSOURCE', docNo: { not: null } },
    select: { docNo: true, partner: true, status: true },
  });
  let maxSeq = 0;
  for (const r of rows) {
    if (!r.docNo) continue;
    if (trimStr(r.partner || '') !== pt) continue;
    if (kind === 'receive') {
      if (r.status !== '已收回') continue;
    } else {
      if (r.status === '已收回') continue;
    }
    const m = r.docNo.match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}-${seg}-${String(maxSeq + 1).padStart(3, '0')}`;
}
