import React from 'react';
import type { Product, ProductionOpRecord, AppDictionaries } from '../../types';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import { normalizeCollabSpecLabel } from '../../shared/types';

export function normalizeAcceptSpecList(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const t = normalizeCollabSpecLabel(typeof x === 'string' ? x : String(x ?? ''));
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function collabVariantKey(it: { colorName?: string | null; sizeName?: string | null }) {
  return JSON.stringify({ c: it.colorName ?? null, s: it.sizeName ?? null });
}

/** 协作在库：未写 warehouseId 的流水也计入当前选仓（外协收回等常无仓维度，否则可回/可转上限为 0） */
function collabPhysicalRecordMatchesWarehouse(r: ProductionOpRecord, warehouseId: string | undefined): boolean {
  if (!warehouseId) return true;
  if (!r.warehouseId) return true;
  return r.warehouseId === warehouseId;
}

/**
 * 本厂实物库存增减（协作回传/转发上限用）：含外协 OUTSOURCE（已收回视同入厂、加工中视同出厂）。
 * 与纯 STOCK_IN/STOCK_OUT 并存，覆盖「仓库有量但协作弹窗无产品」类数据。
 */
function collabPhysicalStockDelta(r: ProductionOpRecord): number {
  const qty = Number(r.quantity) || 0;
  if (!Number.isFinite(qty) || qty === 0) return 0;
  if (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') return qty;
  if (r.type === 'STOCK_OUT') return -qty;
  if (r.type === 'OUTSOURCE') {
    if (r.status === '已收回') return qty;
    if (r.status === '加工中') return -qty;
  }
  return 0;
}

/**
 * 链式协作：当前站已「转给下一站」的累计数量（按色码键），来自所有 `parentTransferId === transferId` 的子协作单派发 payload。
 * 用于从「甲方派发总量 − 回传」中扣减，得到仍可转发的余量（与后端 forwardTransfer 校验一致）。
 */
export function collabForwardedOutBySpec(parentTransferId: string | undefined, allTransfers: any[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!parentTransferId || !Array.isArray(allTransfers)) return out;
  for (const ct of allTransfers) {
    if (!ct || ct.parentTransferId !== parentTransferId) continue;
    if (String(ct.status ?? '') === 'CANCELLED') continue;
    for (const d of ct.dispatches || []) {
      if (String(d?.status ?? '') === 'WITHDRAWN') continue;
      for (const it of (d.payload as any)?.items ?? []) {
        const k = collabVariantKey(it);
        const q = Number(it.quantity) || 0;
        if (!Number.isFinite(q) || q === 0) continue;
        out.set(k, (out.get(k) || 0) + q);
      }
    }
  }
  return out;
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

export type BuildCollabQtyMatrixOpts = {
  preferredColorOrder?: string[];
  preferredSizeOrder?: string[];
};

/** 将去重后的颜色/尺码轴按「参考顺序」重排，未出现在参考中的项保持原发现顺序接在后面（与商品信息矩阵一致）。 */
export function orderCollabAxisNames(
  names: (string | null)[],
  preferred?: string[] | null | undefined,
): (string | null)[] {
  if (!preferred?.length) return names;
  const used = new Set<number>();
  const out: (string | null)[] = [];
  const labelEq = (cell: string | null, pref: string) => {
    const pt = String(pref ?? '').trim();
    if (!pt) return false;
    if (cell == null || cell === '') return false;
    return String(cell).trim() === pt;
  };
  for (const p of preferred) {
    const pt = String(p ?? '').trim();
    if (!pt) continue;
    for (let i = 0; i < names.length; i++) {
      if (used.has(i)) continue;
      if (labelEq(names[i]!, pt)) {
        used.add(i);
        out.push(names[i]!);
        break;
      }
    }
  }
  for (let i = 0; i < names.length; i++) {
    if (!used.has(i)) out.push(names[i]!);
  }
  return out;
}

/**
 * 协作单上用于矩阵列/行排序：优先用派发/转发 payload 的 colorNames、sizeNames（与建单时商品色码序一致），
 * 否则用本企业产品的 variant 矩阵顺序（回传单等常无 sizeNames 字段）。
 */
export function resolvePreferredCollabMatrixOrder(args: {
  payload?: { colorNames?: unknown; sizeNames?: unknown } | null;
  product?: Product | null;
  dictionaries?: AppDictionaries | null;
}): BuildCollabQtyMatrixOpts {
  const out: BuildCollabQtyMatrixOpts = {};
  const fromPayloadSize = normalizeAcceptSpecList(args.payload?.sizeNames);
  const fromPayloadColor = normalizeAcceptSpecList(args.payload?.colorNames);
  if (fromPayloadSize.length) out.preferredSizeOrder = fromPayloadSize;
  if (fromPayloadColor.length) out.preferredColorOrder = fromPayloadColor;
  if (args.product && args.dictionaries) {
    const layout = buildVariantQtyMatrixLayout(args.product, args.dictionaries);
    if (layout) {
      if (!out.preferredSizeOrder?.length) {
        out.preferredSizeOrder = layout.sizeColumns.map(c => c.header);
      }
      if (!out.preferredColorOrder?.length) {
        out.preferredColorOrder = layout.colorRows.map(r => r.colorLabel);
      }
    }
  }
  return out;
}

/** 取一条 transfer 上用于色码序参考的派发 payload（已接受/已转发/待接受优先）。 */
export function collabFirstDispatchPayload(transfer: any): any {
  const ds = [...(transfer?.dispatches || [])] as any[];
  const prefer = ds.find((d: any) => ['ACCEPTED', 'FORWARDED', 'PENDING'].includes(String(d?.status ?? '')));
  return (prefer ?? ds[0])?.payload;
}

/**
 * 通用色×码矩阵索引器：给定一组 { colorName, sizeName } 行，返回去重后的颜色列表、尺码列表
 * 以及 cellRowIdx[ci][si] → 原行下标（不存在则为 null）。
 * 用于协作回传/转发矩阵与派发只读矩阵共享排版。
 */
export function buildCollabQtyMatrix(
  items: Array<{ colorName: string | null; sizeName: string | null }>,
  opts?: BuildCollabQtyMatrixOpts | null,
): {
  colors: (string | null)[];
  sizes: (string | null)[];
  cellRowIdx: (number | null)[][];
} {
  const colorSet: (string | null)[] = [];
  const sizeSet: (string | null)[] = [];
  const colorSeen = new Set<string>();
  const sizeSeen = new Set<string>();
  for (const it of items) {
    const cKey = it.colorName ?? '__null__';
    if (!colorSeen.has(cKey)) {
      colorSeen.add(cKey);
      colorSet.push(it.colorName ?? null);
    }
    const sKey = it.sizeName ?? '__null__';
    if (!sizeSeen.has(sKey)) {
      sizeSeen.add(sKey);
      sizeSet.push(it.sizeName ?? null);
    }
  }
  const colors = orderCollabAxisNames(colorSet, opts?.preferredColorOrder);
  const sizes = orderCollabAxisNames(sizeSet, opts?.preferredSizeOrder);
  const cellRowIdx: (number | null)[][] = colors.map(() => sizes.map(() => null));
  items.forEach((it, idx) => {
    const ci = colors.findIndex(c => (c ?? null) === (it.colorName ?? null));
    const si = sizes.findIndex(s => (s ?? null) === (it.sizeName ?? null));
    if (ci >= 0 && si >= 0 && cellRowIdx[ci]![si] == null) cellRowIdx[ci]![si] = idx;
  });
  return { colors, sizes, cellRowIdx };
}

/**
 * 无 variantId 的实物库存（null 池）可被任一色码行消耗，但不能对多行重复全额叠加。
 * 按色码序贪心分配 nullPool，使各行上限之和不超过实物总量。
 */
function buildCollabCapRowsWithSharedNullPool(
  inputs: Array<{
    colorName: string | null;
    sizeName: string | null;
    remaining: number;
    variantStock: number;
  }>,
  effectiveNullStock: number,
): CollabReturnRow[] {
  let nullPool = Math.max(0, effectiveNullStock);
  const sorted = [...inputs].sort((a, b) => {
    const la = [a.colorName || '', a.sizeName || ''].join('\t');
    const lb = [b.colorName || '', b.sizeName || ''].join('\t');
    return la.localeCompare(lb, 'zh-CN');
  });
  const rows: CollabReturnRow[] = [];
  for (const c of sorted) {
    const v = Math.max(0, c.variantStock);
    const rem = Math.max(0, c.remaining);
    const maxR = Math.min(rem, v + nullPool);
    const nullUsed = Math.max(0, maxR - v);
    nullPool -= nullUsed;
    if (maxR <= 0) continue;
    rows.push({ colorName: c.colorName, sizeName: c.sizeName, maxReturnable: maxR, qty: '' });
  }
  return rows;
}

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
      if (!collabPhysicalRecordMatchesWarehouse(r, warehouseId)) continue;
      const vid = r.variantId || '';
      const delta = collabPhysicalStockDelta(r);
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

  const capInputs: Array<{ colorName: string | null; sizeName: string | null; remaining: number; variantStock: number }> = [];
  for (const [k, { colorName, sizeName, qty: dispatched }] of dispatchedBySpec) {
    const returned = returnedBySpec.get(k) || 0;
    const remaining = dispatched - returned;
    if (remaining <= 0) continue;
    const variantStock = Math.max(0, stockBySpec.get(k) || 0);
    capInputs.push({ colorName, sizeName, remaining, variantStock });
  }
  return buildCollabCapRowsWithSharedNullPool(capInputs, effectiveNullStock);
}

/**
 * 计算转发可发量：派发池为 `ACCEPTED` + `FORWARDED`（与后端 `forwardTransfer` 一致；首次转发后派发行会变 FORWARDED），
 * 扣减已回传、已从子协作单转给下一站的累计量，再与本地实物库存取 min。
 *（STOCK_IN/OUT/STOCK_RETURN 及外协 OUTSOURCE 已收回/加工中；未填 warehouseId 的流水也计入当前选仓）。
 * 与 `computeCollaborationReturnableRows` 风格一致；同样默认丢弃「最大=0」行。
 */
export function computeCollaborationForwardableRows(
  transfer: any,
  warehouseId: string | undefined,
  products: Product[],
  prodRecords: ProductionOpRecord[],
  dict: AppDictionaries,
  allChainTransfers?: any[] | null,
): CollabReturnRow[] {
  if (!transfer) return [];

  const forwardedOutBySpec = collabForwardedOutBySpec(transfer?.id, allChainTransfers ?? undefined);

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
      if (!collabPhysicalRecordMatchesWarehouse(r, warehouseId)) continue;
      const vid = r.variantId || '';
      const delta = collabPhysicalStockDelta(r);
      if (delta === 0) continue;
      if (!vid) nullVariantStock += delta;
      else {
        const { colorName, sizeName } = variantLabel(vid);
        const k = collabVariantKey({ colorName, sizeName });
        stockBySpec.set(k, (stockBySpec.get(k) || 0) + delta);
      }
    }
  }
  const effectiveNullStock = Math.max(0, nullVariantStock);

  const capInputs: Array<{ colorName: string | null; sizeName: string | null; remaining: number; variantStock: number }> = [];
  for (const [k, { colorName, sizeName, qty: dispatched }] of dispatchedBySpec) {
    const returned = returnedBySpec.get(k) || 0;
    const forwarded = forwardedOutBySpec.get(k) || 0;
    const remaining = dispatched - returned - forwarded;
    if (remaining <= 0) continue;
    const variantStock = Math.max(0, stockBySpec.get(k) || 0);
    capInputs.push({ colorName, sizeName, remaining, variantStock });
  }
  return buildCollabCapRowsWithSharedNullPool(capInputs, effectiveNullStock);
}

/** 取转发链下一站步骤定义：按 `outsourceRouteSnapshot` 中 `stepOrder === chainStep + 1` 匹配；最后一站返回 null。 */
export function getNextForwardStep(transfer: any): {
  stepOrder: number;
  nodeId?: string | null;
  nodeName?: string | null;
  receiverTenantId?: string | null;
  receiverTenantName?: string | null;
} | null {
  const route = Array.isArray(transfer?.outsourceRouteSnapshot) ? (transfer.outsourceRouteSnapshot as any[]) : null;
  if (!route?.length) return null;
  const nextOrder = (transfer.chainStep ?? 0) + 1;
  const step = route.find((s: any) => s?.stepOrder === nextOrder);
  return step ? { ...step } : null;
}

/** 下一站一致性判断键：`nodeId::receiverTenantId`，两者都为空时用 stepOrder 兜底。 */
export function getNextForwardStepKey(transfer: any): string | null {
  const s = getNextForwardStep(transfer);
  if (!s) return null;
  const nodeKey = s.nodeId ?? '';
  const tenantKey = s.receiverTenantId ?? '';
  if (!nodeKey && !tenantKey) return `step:${s.stepOrder ?? ''}`;
  return `${nodeKey}::${tenantKey}`;
}

/**
 * 扫描「同合作单位」全部 transfers 的回传 payload，按 `receiverProductId` 定位，取最近一次
 * 非撤回回传中首个含有 `unitPrice` 的行作为默认单价。不涉及 PSI/销售单，严格只吃历史回传。
 *
 * 选取规则：
 *   1) 过滤与该 `receiverProductId` 一致的 transfers（兼容历史数据：若 transfer 未补充 receiverProductId，回退用 senderProductId）。
 *   2) 按 returns 的 createdAt 倒序，取最新一条未撤回的 return。
 *   3) 在该 return.payload.items 中，找到第一个 `Number.isFinite(unitPrice) && unitPrice >= 0` 的行作为默认单价。
 */
export function lastCollabPeerReturnUnitPriceFromTransfers(
  peerTransfers: any[],
  receiverProductId: string | null | undefined,
): number | null {
  if (!Array.isArray(peerTransfers) || peerTransfers.length === 0) return null;
  const pid = receiverProductId ?? null;
  const candidates: Array<{ at: number; items: any[] }> = [];
  for (const t of peerTransfers) {
    if (!t) continue;
    const tPid = t.receiverProductId ?? t.senderProductId ?? null;
    if (pid && tPid && tPid !== pid) continue;
    for (const r of t.returns || []) {
      if (r.status === 'WITHDRAWN') continue;
      const items = (r.payload as any)?.items;
      if (!Array.isArray(items) || items.length === 0) continue;
      const at = new Date(r.createdAt).getTime();
      candidates.push({ at: Number.isFinite(at) ? at : 0, items });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.at - a.at);
  for (const c of candidates) {
    for (const it of c.items) {
      const n = Number((it as any)?.unitPrice);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return null;
}

/**
 * 同合作单位历史「链式转发」派发上的 `originSettlement.unitPrice`（按 dispatch.createdAt 最新一条）。
 */
export function lastCollabPeerForwardOriginUnitPriceFromTransfers(
  peerTransfers: any[],
  receiverProductId: string | null | undefined,
): number | null {
  if (!Array.isArray(peerTransfers) || peerTransfers.length === 0) return null;
  const pid = receiverProductId ?? null;
  const candidates: Array<{ at: number; up: number }> = [];
  for (const t of peerTransfers) {
    if (!t) continue;
    const tPid = t.receiverProductId ?? t.senderProductId ?? null;
    if (pid && tPid && tPid !== pid) continue;
    for (const d of t.dispatches || []) {
      if (String(d?.status ?? '') === 'WITHDRAWN') continue;
      const p = d.payload as any;
      if (!p?.forwardedFrom) continue;
      const n = Number(p?.originSettlement?.unitPrice);
      if (!Number.isFinite(n) || n < 0) continue;
      const at = new Date(d.createdAt).getTime();
      candidates.push({ at: Number.isFinite(at) ? at : 0, up: n });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.at - a.at);
  return candidates[0]!.up;
}

/**
 * 取协作回传/转发弹窗输入框的默认单价字符串。规则：
 *   - 优先历史回传价；若无则历史链式转发 `originSettlement.unitPrice`
 *   - 仍未命中 → 空字符串（由用户手动填写）
 */
export function resolveCollabPeerDefaultUnitPriceString(opts: {
  peerTransfers: any[];
  receiverProductId: string | null | undefined;
}): string {
  const fromReturn = lastCollabPeerReturnUnitPriceFromTransfers(opts.peerTransfers, opts.receiverProductId);
  if (fromReturn != null) return String(fromReturn);
  const fromForward = lastCollabPeerForwardOriginUnitPriceFromTransfers(opts.peerTransfers, opts.receiverProductId);
  if (fromForward != null) return String(fromForward);
  return '';
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

/** 协作流水列表中「回传」类行的「状态」列文案 */
export function returnFlowDocStatusLabel(meta: ReturnDocMeta | undefined): string {
  if (!meta) return '—';
  if (meta.amendmentStatus === 'PENDING_A_CONFIRM') return '待甲方确认';
  if (meta.status === 'PENDING_A_RECEIVE') return '待甲方确认';
  if (meta.status === 'A_RECEIVED') return '已收回';
  if (meta.status === 'WITHDRAWN') return '已撤回';
  return meta.status || '—';
}

/** 协作流水列表中「派发」类行的「状态」列文案 */
export function dispatchFlowDocStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  if (status === 'PENDING') return '待接受';
  if (status === 'FORWARDED') return '已转发';
  if (status === 'WITHDRAWN') return '已撤回';
  if (status === 'ACCEPTED') return '已接受';
  return status;
}

/** 协作流水列表中「转发」类行的「状态」列文案（基于 originConfirmedAt） */
export function forwardFlowDocStatusLabel(originConfirmedAt: string | Date | null | undefined): string {
  return originConfirmedAt ? '已确认' : '待甲方确认';
}
