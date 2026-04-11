import type { Partner } from '../types';

function trimStr(s: string): string {
  return s.trim();
}

function findPartner(partners: Partner[], partnerId?: string, partnerName?: string): Partner | undefined {
  if (partnerId) {
    const byId = partners.find(x => x.id === partnerId);
    if (byId) return byId;
  }
  if (partnerName) {
    const t = trimStr(partnerName);
    return partners.find(x => trimStr(x.name) === t);
  }
  return undefined;
}

function readPartnerListNoField(p: Partner): number | null {
  const raw = (p as any).partnerListNo ?? (p as any).partner_list_no;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function fallbackPartnerListNoBySort(all: Partner[], p: Partner): number {
  const sorted = [...all].sort((a, b) => {
    const ca = (a as any).createdAt != null ? new Date((a as any).createdAt).getTime() : 0;
    const cb = (b as any).createdAt != null ? new Date((b as any).createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;
    return (a.id || '').localeCompare(b.id || '');
  });
  const idx = sorted.findIndex(x => x.id === p.id);
  return idx < 0 ? 1 : idx + 1;
}

/** 合作单位 4 位序号（与数据库 partner_list_no / 创建顺序一致） */
export function partnerListNoToSegment(partners: Partner[], partnerId?: string, partnerName?: string): string | null {
  const p = findPartner(partners, partnerId, partnerName);
  if (!p) return null;
  let n = readPartnerListNoField(p);
  if (n == null) {
    n = fallbackPartnerListNoBySort(partners, p);
  }
  if (n < 1) return null;
  return String(n).padStart(4, '0');
}

function maxPsiSeqForSegment(
  prefix: string,
  seg: string,
  recordsList: Array<{ type?: string; partnerId?: string; partner?: string; docNumber?: string }>,
  psiType: string,
  partnerId: string,
  partnerName: string,
): number {
  const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${prefix}-${escaped}-(\\d+)$`);
  const existing = recordsList.filter(
    r => r.type === psiType && (r.partnerId === partnerId || trimStr(r.partner || '') === trimStr(partnerName)),
  );
  const seqNums = existing.map(r => {
    const m = r.docNumber?.match(re);
    return m ? parseInt(m[1], 10) : 0;
  });
  return seqNums.length > 0 ? Math.max(...seqNums) : 0;
}

export type PsiDocPrefix = 'PO' | 'PB' | 'SO' | 'XS';
export type PsiRecordType = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL';

/**
 * 进销存单号：{2字母}-{合作单位4位}-{流水3位}
 * 仅统计同类型、同合作单位、且匹配新格式的历史单号。
 */
export function nextPsiDocNumber(
  prefix: PsiDocPrefix,
  psiType: PsiRecordType,
  partners: Partner[],
  recordsList: Array<{ type?: string; partnerId?: string; partner?: string; docNumber?: string }>,
  partnerId: string,
  partnerName: string,
  /** 生成新号时一并统计旧前缀流水，避免改前缀后序号从 001 重来 */
  legacyPrefixesForSeq?: string[],
): string {
  const pid = partnerId || findPartner(partners, undefined, partnerName)?.id || '';
  let seg = partnerListNoToSegment(partners, pid, partnerName);
  if (!seg) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[${prefix}] 无法解析合作单位序号，请确认已选择单位并刷新基础资料`, partnerId, partnerName);
    }
    seg = '0000';
  }
  let maxSeq = maxPsiSeqForSegment(prefix, seg, recordsList, psiType, pid, partnerName);
  for (const lp of legacyPrefixesForSeq ?? []) {
    maxSeq = Math.max(maxSeq, maxPsiSeqForSegment(lp, seg, recordsList, psiType, pid, partnerName));
  }
  const nextSeq = maxSeq + 1;
  return `${prefix}-${seg}-${String(nextSeq).padStart(3, '0')}`;
}

export type OutsourceDocKind = 'dispatch' | 'receive';

const OUTSOURCE_PREFIX: Record<OutsourceDocKind, string> = {
  dispatch: 'WX',
  receive: 'WR',
};

type OutsourceRecordLike = { type?: string; status?: string; partner?: string; docNo?: string };

function maxOutsourceSeqForSegment(
  prefix: string,
  seg: string,
  records: OutsourceRecordLike[],
  kind: OutsourceDocKind,
  partnerName: string,
): number {
  const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${prefix}-${escaped}-(\\d+)$`);
  const pt = trimStr(partnerName);
  const filtered = records.filter(r => {
    if (r.type !== 'OUTSOURCE' || !r.docNo) return false;
    if (trimStr(r.partner || '') !== pt) return false;
    if (kind === 'receive') {
      if (r.status !== '已收回') return false;
    } else {
      if (r.status === '已收回') return false;
    }
    return true;
  });
  let maxSeq = 0;
  for (const r of filtered) {
    const m = r.docNo!.match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return maxSeq;
}

/**
 * 外协发出 WX / 外协收回 WR：{2字母}-{合作单位4位}-{流水3位}
 */
export function nextOutsourceDocNumber(
  kind: OutsourceDocKind,
  partners: Partner[],
  records: OutsourceRecordLike[],
  partnerId: string,
  partnerName: string,
): string {
  const pid = partnerId || findPartner(partners, undefined, partnerName)?.id || '';
  let seg = partnerListNoToSegment(partners, pid, partnerName);
  if (!seg) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[${OUTSOURCE_PREFIX[kind]}] 无法解析合作单位序号`, partnerId, partnerName);
    }
    seg = '0000';
  }
  const prefix = OUTSOURCE_PREFIX[kind];
  const nextSeq = maxOutsourceSeqForSegment(prefix, seg, records, kind, partnerName) + 1;
  return `${prefix}-${seg}-${String(nextSeq).padStart(3, '0')}`;
}

export function nextSalesBillDocNumber(
  partners: Partner[],
  recordsList: Array<{ type?: string; partnerId?: string; partner?: string; docNumber?: string }>,
  partnerId: string,
  partnerName: string,
): string {
  return nextPsiDocNumber('XS', 'SALES_BILL', partners, recordsList, partnerId, partnerName, ['SB']);
}
