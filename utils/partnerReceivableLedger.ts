import type { FinanceRecord } from '../types';
import { flowRecordsEarliestMs } from './flowDocSort';

type LedgerDoc = {
  key: string;
  t: number;
  inc: number;
  dec: number;
};

function partnerMatches(r: { partner?: string; partnerId?: string }, partnerName: string, partnerId?: string): boolean {
  const name = (partnerName || '').trim();
  if (partnerId && r.partnerId === partnerId) return true;
  return (r.partner || '').trim() === name && name.length > 0;
}

function financeTimeMs(rec: FinanceRecord): number {
  const t = Date.parse(rec.timestamp);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 与「财务 → 合作单位对账」应收增减规则一致：销售单增加应收、采购单减少、收付款、外协收回。
 * 用于销售单打印「上次结余 / 累计应收」。
 */
export function computePartnerReceivableBeforeDoc(
  partnerName: string,
  partnerId: string | undefined,
  psiRecords: any[],
  financeRecords: FinanceRecord[],
  prodRecords: any[],
  current: {
    docKey: string;
    anchorTimeMs: number;
    /** 本单计入应收的净额（销售为正、退货为负） */
    currentSignedAmount: number;
  },
): { previousBalance: number; currentDebt: number; accumulatedDebt: number } {
  const docs: LedgerDoc[] = [];

  const psiFiltered = (psiRecords || []).filter(
    (r: any) =>
      (r.type === 'SALES_BILL' || r.type === 'PURCHASE_BILL') && partnerMatches(r, partnerName, partnerId),
  );
  const psiByDoc = new Map<string, any[]>();
  psiFiltered.forEach((r: any) => {
    const docKey = `${r.type}|${r.docNumber || r.id}`;
    if (docKey === current.docKey) return;
    if (!psiByDoc.has(docKey)) psiByDoc.set(docKey, []);
    psiByDoc.get(docKey)!.push(r);
  });
  psiByDoc.forEach((lines, key) => {
    const t = flowRecordsEarliestMs(lines);
    const amount = lines.reduce((s, r: any) => s + (Number(r.amount) || 0), 0);
    const type = key.split('|')[0];
    if (type === 'SALES_BILL') {
      if (amount >= 0) docs.push({ key, t, inc: amount, dec: 0 });
      else docs.push({ key, t, inc: 0, dec: Math.abs(amount) });
    } else if (type === 'PURCHASE_BILL') {
      docs.push({ key, t, inc: 0, dec: Math.abs(amount) });
    }
  });

  const finByDoc = new Map<string, FinanceRecord[]>();
  (financeRecords || []).forEach(rec => {
    if (rec.type !== 'RECEIPT' && rec.type !== 'PAYMENT') return;
    if ((rec.partner || '').trim() !== (partnerName || '').trim()) return;
    const dk = `${rec.type}|${rec.docNo || rec.id}`;
    if (!finByDoc.has(dk)) finByDoc.set(dk, []);
    finByDoc.get(dk)!.push(rec);
  });
  finByDoc.forEach((recs, key) => {
    const t = Math.max(...recs.map(financeTimeMs), 0);
    const amount = recs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const typ = key.split('|')[0];
    if (typ === 'RECEIPT') docs.push({ key, t, inc: 0, dec: Math.abs(amount) });
    else if (typ === 'PAYMENT') docs.push({ key, t, inc: Math.abs(amount), dec: 0 });
  });

  const prodByDoc = new Map<string, any[]>();
  (prodRecords || []).forEach((rec: any) => {
    if (rec.type !== 'OUTSOURCE' || rec.status !== '已收回') return;
    if ((rec.partner || '').trim() !== (partnerName || '').trim()) return;
    const dk = `OUTSOURCE|${rec.docNo || rec.id}`;
    if (!prodByDoc.has(dk)) prodByDoc.set(dk, []);
    prodByDoc.get(dk)!.push(rec);
  });
  prodByDoc.forEach((recs, key) => {
    const t = Math.max(
      ...recs.map((r: any) => {
        const ts = r.timestamp ? Date.parse(String(r.timestamp)) : 0;
        return Number.isNaN(ts) ? 0 : ts;
      }),
      0,
    );
    const amount = recs.reduce((s, r: any) => s + (Number(r.amount) || 0), 0);
    docs.push({ key, t, inc: 0, dec: Math.abs(amount) });
  });

  const cmp = (a: LedgerDoc, b: LedgerDoc): number => {
    if (a.t !== b.t) return a.t - b.t;
    return a.key.localeCompare(b.key);
  };
  docs.sort(cmp);

  const virtual: LedgerDoc = {
    key: current.docKey,
    t: current.anchorTimeMs,
    inc: current.currentSignedAmount >= 0 ? current.currentSignedAmount : 0,
    dec: current.currentSignedAmount < 0 ? Math.abs(current.currentSignedAmount) : 0,
  };

  let previous = 0;
  for (const d of docs) {
    if (cmp(d, virtual) >= 0) break;
    previous += d.inc - d.dec;
  }

  const net = virtual.inc - virtual.dec;
  const currentDebt = current.currentSignedAmount;
  const accumulatedDebt = previous + net;
  return { previousBalance: previous, currentDebt, accumulatedDebt };
}
