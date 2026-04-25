import type {
  AppDictionaries,
  Product,
  ProductCategory,
  ProductionOpRecord,
  ProductionOrder,
} from '../types';
import { flowRecordsEarliestMs } from './flowDocSort';
import { formatLocalDateTimeZh } from './localDateTime';
import { productHasColorSizeMatrix } from './productColorSize';

/** 加工厂往来数量明细弹窗：当前卡片的产品/工单、工序、加工厂上下文 */
export interface PartnerFlowDetailSeed {
  productionLinkMode: 'order' | 'product';
  orderId?: string;
  productId: string;
  productName: string;
  orderNumber?: string;
  nodeId: string;
  nodeName: string;
  partner: string;
}

export interface PartnerFlowDocRow {
  docNo: string;
  records: ProductionOpRecord[];
  dateDisplay: string;
  typeLabel: string;
  totalQty: number;
  /** 仅含非空 variantId 的聚合；无规格行只计入 totalQty */
  variantQty: Record<string, number>;
}

/** 仅聚合有 variantId 的行；无规格数量只体现在总件数 */
export function aggregateOutsourceQtyByVariant(recs: ProductionOpRecord[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of recs) {
    const vid = (r.variantId || '').trim();
    if (!vid) continue;
    const q = Number(r.quantity) || 0;
    m[vid] = (m[vid] ?? 0) + q;
  }
  return m;
}

function typeLabelFromRecords(recs: ProductionOpRecord[]): string {
  const hasDispatch = recs.some(r => r.status !== '已收回');
  const hasReceive = recs.some(r => r.status === '已收回');
  if (hasDispatch && hasReceive) return '发出、收回';
  if (hasDispatch) return '外协发出';
  if (hasReceive) return '外协收回';
  return '—';
}

function docGroupKey(r: ProductionOpRecord, isProductMode: boolean): string {
  const doc = r.docNo ?? '—';
  if (isProductMode) return `${doc}|${r.productId ?? ''}`;
  return `${doc}|${r.orderId ?? ''}|${r.productId ?? ''}`;
}

export function filterPartnerNodeOutsourceRecords(
  records: ProductionOpRecord[],
  opts: {
    productionLinkMode: 'order' | 'product';
    orderId?: string;
    productId: string;
    partner: string;
    nodeId: string;
  },
): ProductionOpRecord[] {
  const { productionLinkMode, orderId, productId, partner, nodeId } = opts;
  return records.filter(r => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return false;
    if ((r.partner ?? '') !== (partner ?? '')) return false;
    if ((r.nodeId ?? '') !== (nodeId ?? '')) return false;
    if (productionLinkMode === 'product') {
      return !r.orderId && (r.productId ?? '') === productId;
    }
    return (r.orderId ?? '') === (orderId ?? '') && (r.productId ?? '') === productId;
  });
}

/** 单条记录是否属于列表气泡对应的外协维度（与 filterPartnerNodeOutsourceRecords 一致） */
export function recordMatchesPartnerFlowListScope(r: ProductionOpRecord, seed: PartnerFlowDetailSeed): boolean {
  return (
    filterPartnerNodeOutsourceRecords([r], {
      productionLinkMode: seed.productionLinkMode,
      orderId: seed.productionLinkMode === 'product' ? undefined : seed.orderId,
      productId: seed.productId,
      partner: seed.partner,
      nodeId: seed.nodeId,
    }).length > 0
  );
}

/** 外协流水汇总行：保留至少一条明细落在 seed 范围内的单据行 */
export function filterOutsourceFlowSummaryRowsByPartnerScope<T extends { records: ProductionOpRecord[] }>(
  rows: T[],
  seed: PartnerFlowDetailSeed,
): T[] {
  return rows.filter(row => row.records.some(r => recordMatchesPartnerFlowListScope(r, seed)));
}

export function buildPartnerFlowDocRows(
  filtered: ProductionOpRecord[],
  isProductMode: boolean,
): PartnerFlowDocRow[] {
  const byKey = new Map<string, ProductionOpRecord[]>();
  for (const r of filtered) {
    const k = docGroupKey(r, isProductMode);
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }
  return Array.from(byKey.values())
    .map(recs => {
      const sorted = [...recs].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      const ms = flowRecordsEarliestMs(sorted);
      const dateDisplay =
        ms > 0 ? formatLocalDateTimeZh(new Date(ms)) : sorted[0]?.timestamp?.trim() || '—';
      const totalQty = sorted.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      return {
        docNo: sorted[0]?.docNo ?? '—',
        records: sorted,
        dateDisplay,
        typeLabel: typeLabelFromRecords(sorted),
        totalQty,
        variantQty: aggregateOutsourceQtyByVariant(sorted),
      };
    })
    .sort((a, b) => {
      const ta = flowRecordsEarliestMs(a.records);
      const tb = flowRecordsEarliestMs(b.records);
      if (tb !== ta) return tb - ta;
      return (a.docNo || '').localeCompare(b.docNo || '');
    });
}

export function computeDispatchReceiveRemaining(filtered: ProductionOpRecord[]): {
  dispatchTotal: number;
  receiveTotal: number;
  remainingTotal: number;
  dispatchByVariant: Record<string, number>;
  receiveByVariant: Record<string, number>;
  remainingByVariant: Record<string, number>;
} {
  let dispatchTotal = 0;
  let receiveTotal = 0;
  const dispatchByVariant: Record<string, number> = {};
  const receiveByVariant: Record<string, number> = {};
  for (const r of filtered) {
    const q = Number(r.quantity) || 0;
    const vid = (r.variantId || '').trim();
    if (r.status === '已收回') {
      receiveTotal += q;
      if (vid) receiveByVariant[vid] = (receiveByVariant[vid] ?? 0) + q;
    } else {
      dispatchTotal += q;
      if (vid) dispatchByVariant[vid] = (dispatchByVariant[vid] ?? 0) + q;
    }
  }
  const remainingTotal = Math.max(0, dispatchTotal - receiveTotal);
  const keys = new Set([...Object.keys(dispatchByVariant), ...Object.keys(receiveByVariant)]);
  const remainingByVariant: Record<string, number> = {};
  for (const k of keys) {
    const d = dispatchByVariant[k] ?? 0;
    const rc = receiveByVariant[k] ?? 0;
    remainingByVariant[k] = Math.max(0, d - rc);
  }
  return {
    dispatchTotal,
    receiveTotal,
    remainingTotal,
    dispatchByVariant,
    receiveByVariant,
    remainingByVariant,
  };
}

/**
 * 与详情弹窗一致：工单行上出现的规格优先，否则流水里出现的规格，否则产品全部规格。
 */
/** 与当前详情单同一 partner，且 (orderId, productId, nodeId) 落在本单出现过的组合上的全部外协流水（用于累计发出/收回/剩余）。 */
export function filterOutsourceRecordsMatchingDocScope(
  allRecords: ProductionOpRecord[],
  docRecords: ProductionOpRecord[],
): ProductionOpRecord[] {
  if (docRecords.length === 0) return [];
  const partner = docRecords[0]?.partner ?? '';
  const keys = new Set<string>();
  for (const r of docRecords) {
    const oid = r.orderId ?? '';
    const pid = r.productId ?? '';
    const nid = r.nodeId ?? '';
    keys.add(`${oid}\u0000${pid}\u0000${nid}`);
  }
  return allRecords.filter(r => {
    if (r.type !== 'OUTSOURCE' || r.sourceReworkId) return false;
    if ((r.partner ?? '') !== (partner ?? '')) return false;
    const k = `${r.orderId ?? ''}\u0000${r.productId ?? ''}\u0000${r.nodeId ?? ''}`;
    return keys.has(k);
  });
}

export function orderedVariantColumnIds(
  product: Product | undefined,
  category: ProductCategory | undefined,
  order: ProductionOrder | undefined,
  variantQtyMaps: Record<string, number>[],
): string[] {
  if (!productHasColorSizeMatrix(product, category)) return [];
  const allProductVariants = product?.variants ?? [];
  const unionKeys = new Set<string>();
  for (const m of variantQtyMaps) {
    Object.keys(m).forEach(k => {
      if (k) unionKeys.add(k);
    });
  }
  const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean) as string[]);
  let variantsForDetail = allProductVariants.filter(v => variantIdsInOrder.has(v.id));
  if (variantsForDetail.length === 0 && unionKeys.size > 0) {
    variantsForDetail = allProductVariants.filter(v => unionKeys.has(v.id));
  }
  if (variantsForDetail.length === 0) variantsForDetail = [...allProductVariants];
  const ordered = variantsForDetail.map(v => v.id);
  const extra = [...unionKeys].filter(id => !ordered.includes(id)).sort();
  return [...ordered, ...extra];
}
