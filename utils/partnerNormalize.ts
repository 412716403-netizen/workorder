/** 统一合作单位接口字段（兼容 snake_case、字符串数字），供进销存单号与基础资料使用 */
export function normalizePartnerFromApi(p: unknown): unknown {
  if (!p || typeof p !== 'object') return p;
  const row = p as Record<string, unknown>;
  const raw = row.partnerListNo ?? row.partner_list_no;
  let partnerListNo = row.partnerListNo as number | undefined;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 1) partnerListNo = n;
  }
  return { ...row, partnerListNo };
}

export function normalizePartnersFromApi(list: unknown[]): unknown[] {
  if (!Array.isArray(list)) return [];
  return list.map(p => normalizePartnerFromApi(p) as unknown);
}
