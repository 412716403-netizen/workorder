/**
 * 合作单位单号段（对齐 utils/partnerDocNumber.ts 外协 WX/WR 部分）
 */

function trimStr(s) {
  return String(s || '').trim();
}

function findPartner(partners, partnerId, partnerName) {
  if (partnerId) {
    const byId = (partners || []).find((x) => x.id === partnerId);
    if (byId) return byId;
  }
  if (partnerName) {
    const t = trimStr(partnerName);
    return (partners || []).find((x) => trimStr(x.name) === t);
  }
  return undefined;
}

function readPartnerListNoField(p) {
  const raw = p.partnerListNo ?? p.partner_list_no;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function fallbackPartnerListNoBySort(all, p) {
  const sorted = [...(all || [])].sort((a, b) => {
    const ca = a.createdAt != null ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt != null ? new Date(b.createdAt).getTime() : 0;
    if (ca !== cb) return ca - cb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const idx = sorted.findIndex((x) => x.id === p.id);
  return idx < 0 ? 1 : idx + 1;
}

function partnerListNoToSegment(partners, partnerId, partnerName) {
  const p = findPartner(partners, partnerId, partnerName);
  if (!p) return null;
  let n = readPartnerListNoField(p);
  if (n == null) n = fallbackPartnerListNoBySort(partners, p);
  if (n < 1) return null;
  return String(n).padStart(4, '0');
}

function maxOutsourceSeqForSegment(prefix, seg, records, partnerName) {
  const escaped = seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${prefix}-${escaped}-(\\d+)$`);
  const pt = trimStr(partnerName);
  let maxSeq = 0;
  (records || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || !r.docNo) return;
    if (trimStr(r.partner || '') !== pt) return;
    const m = r.docNo.match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  });
  return maxSeq;
}

const OUTSOURCE_PREFIX = { dispatch: 'WX', receive: 'WR' };

function nextOutsourceDocNumber(kind, partners, records, partnerId, partnerName) {
  const pid = partnerId || (findPartner(partners, undefined, partnerName) || {}).id || '';
  let seg = partnerListNoToSegment(partners, pid, partnerName);
  if (!seg) seg = '0000';
  const prefix = OUTSOURCE_PREFIX[kind] || 'WX';
  const nextSeq = maxOutsourceSeqForSegment(prefix, seg, records, partnerName) + 1;
  return `${prefix}-${seg}-${String(nextSeq).padStart(3, '0')}`;
}

module.exports = {
  nextOutsourceDocNumber,
  partnerListNoToSegment,
};
