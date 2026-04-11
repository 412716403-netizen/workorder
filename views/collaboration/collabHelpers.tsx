import React from 'react';
import type { Product, ProductionOpRecord, AppDictionaries } from '../../types';

export function normalizeAcceptSpecList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const t = typeof x === 'string' ? x.trim() : String(x ?? '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function collabVariantKey(it: { colorName?: string | null; sizeName?: string | null }) {
  return JSON.stringify({ c: it.colorName ?? null, s: it.sizeName ?? null });
}

export function specNamesForVariant(
  product: Product | undefined,
  variantId: string,
  dict: AppDictionaries,
): { colorName: string | null; sizeName: string | null } {
  const variants = product?.variants as { id: string; colorId?: string | null; sizeId?: string | null }[] | undefined;
  if (!variants?.length) return { colorName: null, sizeName: null };
  const v = variantId
    ? variants.find(x => x.id === variantId)
    : variants.length === 1
      ? variants[0]
      : undefined;
  if (!v) return { colorName: null, sizeName: null };
  const colorName = v.colorId ? dict.colors.find(c => c.id === v.colorId)?.name ?? null : null;
  const sizeName = v.sizeId ? dict.sizes.find(s => s.id === v.sizeId)?.name ?? null : null;
  return { colorName, sizeName };
}

export type CollabReturnRow = {
  colorName: string | null;
  sizeName: string | null;
  maxReturnable: number;
  qty: string;
};

export function computeCollaborationReturnableRows(
  transfer: any,
  warehouseId: string | undefined,
  products: Product[],
  prodRecords: ProductionOpRecord[],
  dict: AppDictionaries,
  requireWarehouse: boolean,
): CollabReturnRow[] {
  if (!transfer) return [];
  if (requireWarehouse && !warehouseId) return [];

  const dispatchedBySpec = new Map<string, { colorName: string | null; sizeName: string | null; qty: number }>();
  for (const d of transfer.dispatches || []) {
    if (d.status !== 'ACCEPTED' && d.status !== 'FORWARDED') continue;
    for (const it of d.payload?.items ?? []) {
      const k = collabVariantKey(it);
      const prev = dispatchedBySpec.get(k);
      const q = Number(it.quantity) || 0;
      if (prev) prev.qty += q;
      else dispatchedBySpec.set(k, { colorName: it.colorName ?? null, sizeName: it.sizeName ?? null, qty: q });
    }
  }

  const returnedBySpec = new Map<string, number>();
  for (const r of transfer.returns || []) {
    if (r.status === 'WITHDRAWN') continue;
    for (const it of r.payload?.items ?? []) {
      const k = collabVariantKey(it);
      returnedBySpec.set(k, (returnedBySpec.get(k) || 0) + (Number(it.quantity) || 0));
    }
  }

  const productId = transfer.receiverProductId;
  let stockBySpec = new Map<string, number>();
  let nullVariantStock = 0;
  if (productId) {
    const product = products.find(p => p.id === productId);
    const colorNameById = Object.fromEntries(dict.colors.map(c => [c.id, c.name]));
    const sizeNameById = Object.fromEntries(dict.sizes.map(s => [s.id, s.name]));
    const variantLabel = (vid: string) => {
      const v = product?.variants.find(x => x.id === vid);
      if (!v) return { colorName: null as string | null, sizeName: null as string | null };
      return {
        colorName: v.colorId ? (colorNameById[v.colorId] ?? null) : null,
        sizeName: v.sizeId ? (sizeNameById[v.sizeId] ?? null) : null,
      };
    };
    for (const r of prodRecords) {
      if (r.productId !== productId) continue;
      if (warehouseId && r.warehouseId !== warehouseId) continue;
      const vid = r.variantId || '';
      const qty = Number(r.quantity) || 0;
      const delta = (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') ? qty
        : r.type === 'STOCK_OUT' ? -qty
        : 0;
      if (delta === 0) continue;
      if (!vid) {
        nullVariantStock += delta;
      } else {
        const { colorName, sizeName } = variantLabel(vid);
        const k = collabVariantKey({ colorName, sizeName });
        stockBySpec.set(k, (stockBySpec.get(k) || 0) + delta);
      }
    }
  }
  const effectiveNullStock = Math.max(0, nullVariantStock);

  const rows: CollabReturnRow[] = [];
  for (const [k, { colorName, sizeName, qty: dispatched }] of dispatchedBySpec) {
    const returned = returnedBySpec.get(k) || 0;
    const remaining = dispatched - returned;
    if (remaining <= 0) continue;
    const variantStock = Math.max(0, stockBySpec.get(k) || 0);
    const stock = variantStock + effectiveNullStock;
    const maxReturnable = Math.min(remaining, stock);
    if (maxReturnable <= 0) continue;
    rows.push({ colorName, sizeName, maxReturnable, qty: '' });
  }
  rows.sort((a, b) => {
    const la = [a.colorName || '', a.sizeName || ''].join('\t');
    const lb = [b.colorName || '', b.sizeName || ''].join('\t');
    return la.localeCompare(lb, 'zh-CN');
  });
  return rows;
}

export const statusLabel = (s: string) => {
  const map: Record<string, { text: string; cls: string }> = {
    OPEN: { text: '进行中', cls: 'bg-blue-50 text-blue-600' },
    PARTIALLY_RECEIVED: { text: '部分收回', cls: 'bg-amber-50 text-amber-600' },
    CLOSED: { text: '已关闭', cls: 'bg-emerald-50 text-emerald-600' },
    CANCELLED: { text: '已取消', cls: 'bg-slate-100 text-slate-500' },
  };
  const m = map[s] || { text: s, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${m.cls}`}>{m.text}</span>;
};

export const dispatchStatusLabel = (s: string) => {
  if (s === 'PENDING') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-600">待接受</span>;
  if (s === 'FORWARDED') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-50 text-blue-600">已转发</span>;
  if (s === 'WITHDRAWN') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-500">已撤回</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-600">已接受</span>;
};

export const returnStatusLabel = (s: string) => {
  if (s === 'PENDING_A_RECEIVE') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-600">待甲方收回</span>;
  if (s === 'WITHDRAWN') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-500">已撤回</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-600">已收回</span>;
};

/** 协作回传出库单号 → 回传记录状态（来自 listTransfers 的 returns[].payload.stockOutDocNo） */
export type ReturnDocMeta = { status: string; amendmentStatus?: string | null };

export function buildReturnDocNoMetaMap(transfers: any[]): Map<string, ReturnDocMeta> {
  const map = new Map<string, ReturnDocMeta>();
  for (const t of transfers || []) {
    for (const r of t.returns || []) {
      const docNo = (r.payload as any)?.stockOutDocNo;
      if (docNo && typeof docNo === 'string') {
        map.set(docNo, { status: r.status, amendmentStatus: r.amendmentStatus ?? null });
      }
    }
  }
  return map;
}

/** 回传流水列表「状态」列文案 */
export function returnFlowDocStatusLabel(meta: ReturnDocMeta | undefined): string {
  if (!meta) return '—';
  if (meta.amendmentStatus === 'PENDING_A_CONFIRM') return '待甲方确认';
  if (meta.status === 'PENDING_A_RECEIVE') return '待甲方确认';
  if (meta.status === 'A_RECEIVED') return '已收回';
  if (meta.status === 'WITHDRAWN') return '已撤回';
  return meta.status || '—';
}
