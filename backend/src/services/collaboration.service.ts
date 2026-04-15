/**
 * collaboration.service.ts
 * Business logic for inter-tenant subcontract collaboration.
 * Extracted 1:1 from collaboration.controller.ts — all Prisma calls live here.
 */
import { Prisma } from '@prisma/client';
import { prisma as basePrisma } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import { getNextWorkOrderNumber, generateDocNo } from '../utils/docNumber.js';
import { nextOutsourceDocNoForPartner } from '../utils/partnerDocNumberServer.js';
import { applyOutsourceProgress } from './production.service.js';
import { AppError } from '../middleware/errorHandler.js';

// ── helpers ──

function assertTenantIs(tenantId: string, ...allowed: (string | null | undefined)[]) {
  if (!allowed.includes(tenantId)) throw new AppError(403, '无权操作此协作记录');
}

async function findCollaboration(tenantId: string, otherTenantId: string) {
  return basePrisma.tenantCollaboration.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { tenantAId: tenantId, tenantBId: otherTenantId },
        { tenantAId: otherTenantId, tenantBId: tenantId },
      ],
    },
  });
}

async function getProductionLinkMode(tenantId: string): Promise<string> {
  const setting = await basePrisma.systemSetting.findUnique({
    where: { tenantId_key: { tenantId, key: 'productionLinkMode' } },
  });
  return (setting?.value as string) ?? 'order';
}

function collabVariantKey(i: { colorName?: string | null; sizeName?: string | null }): string {
  return JSON.stringify({ c: i.colorName ?? null, s: i.sizeName ?? null });
}

const HC_DOCNO_REGEX = /^HC-(\d+)-(\d+)$/;

async function generateReturnFlowDocNo(tenantId: string, partnerName: string): Promise<string> {
  const allHcRecords = await basePrisma.productionOpRecord.findMany({
    where: { tenantId, type: 'STOCK_OUT', operator: '协作回传出库' },
    select: { docNo: true, partner: true },
  });
  const withSamePartner = allHcRecords.filter(r => r.partner === partnerName && r.docNo && HC_DOCNO_REGEX.test(r.docNo));
  let partnerCode: number;
  if (withSamePartner.length > 0) {
    const m = withSamePartner[0].docNo!.match(HC_DOCNO_REGEX);
    partnerCode = m ? parseInt(m[1], 10) : 1;
  } else {
    const allCodes = allHcRecords
      .filter(r => r.docNo && HC_DOCNO_REGEX.test(r.docNo))
      .map(r => { const m = r.docNo!.match(HC_DOCNO_REGEX); return m ? parseInt(m[1], 10) : 0; })
      .filter(n => n > 0);
    partnerCode = allCodes.length ? Math.max(...allCodes) + 1 : 1;
  }
  const samePartnerDocs = allHcRecords.filter(r => {
    if (!r.docNo || !HC_DOCNO_REGEX.test(r.docNo)) return false;
    const m = r.docNo.match(HC_DOCNO_REGEX);
    return m && parseInt(m[1], 10) === partnerCode;
  });
  const seqs = samePartnerDocs.map(r => { const m = r.docNo!.match(HC_DOCNO_REGEX); return m ? parseInt(m[2], 10) : 0; }).filter(n => n > 0);
  const nextSeq = seqs.length ? Math.max(...seqs) + 1 : 1;
  return `HC-${String(partnerCode).padStart(4, '0')}-${String(nextSeq).padStart(4, '0')}`;
}

async function getSenderPartnerName(tenantId: string, senderTenantId: string): Promise<string> {
  const partnerRow = await basePrisma.partner.findFirst({ where: { tenantId, collaborationTenantId: senderTenantId }, select: { name: true } });
  if (partnerRow?.name) return partnerRow.name;
  const tenant = await basePrisma.tenant.findUnique({ where: { id: senderTenantId }, select: { name: true } });
  return tenant?.name ?? '';
}

/** 乙方回传出库须已绑定：本租户合作单位 → 甲方租户 */
async function assertReceiverPartnerBindingForReturn(tenantId: string, senderTenantId: string) {
  const row = await basePrisma.partner.findFirst({
    where: { tenantId, collaborationTenantId: senderTenantId },
    select: { id: true },
  });
  if (!row) {
    throw new AppError(400, '请先在「协作管理 → 协作设置」中将合作单位绑定到该委托方企业后，再提交回传');
  }
}

function aggregateDispatchedByVariant(
  dispatches: { status: string; payload: unknown }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of dispatches) {
    if (d.status !== 'ACCEPTED' && d.status !== 'FORWARDED') continue;
    for (const it of ((d.payload as any)?.items ?? [])) {
      const k = collabVariantKey(it);
      map.set(k, (map.get(k) || 0) + (Number(it.quantity) || 0));
    }
  }
  return map;
}

function aggregateReturnedByVariant(returns: { payload: unknown }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of returns) {
    for (const it of ((r.payload as any)?.items ?? [])) {
      const k = collabVariantKey(it);
      map.set(k, (map.get(k) || 0) + (Number(it.quantity) || 0));
    }
  }
  return map;
}

async function updateTransferStatus(transferId: string) {
  const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({
    where: { id: transferId },
    include: { dispatches: true, returns: true },
  });
  if (!transfer) return;
  const dispatchedByVar = aggregateDispatchedByVariant(transfer.dispatches);
  const totalDispatched = [...dispatchedByVar.values()].reduce((a, b) => a + b, 0);
  const totalReceivedByA = transfer.returns
    .filter(r => r.status === 'A_RECEIVED')
    .reduce((sum, r) => {
      const items = (r.payload as any)?.items ?? [];
      return sum + items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
    }, 0);
  const hasPending = transfer.dispatches.some(d => d.status === 'PENDING');
  let newStatus = transfer.status;
  if (totalDispatched > 0 && totalReceivedByA >= totalDispatched && !hasPending) newStatus = 'CLOSED';
  else if (totalReceivedByA > 0 && totalReceivedByA < totalDispatched) newStatus = 'PARTIALLY_RECEIVED';
  else if (totalDispatched > 0 && totalReceivedByA < totalDispatched) newStatus = 'OPEN';
  else if (totalDispatched === 0 && transfer.status === 'CLOSED') newStatus = 'OPEN';
  if (newStatus !== transfer.status) {
    await basePrisma.interTenantSubcontractTransfer.update({
      where: { id: transferId }, data: { status: newStatus },
    });
  }
}

function normalizeSpecLabel(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function jsonToStringIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

const TRANSFER_STATUS_PRIORITY: Record<string, number> = { OPEN: 0, PARTIALLY_RECEIVED: 1, CLOSED: 2 };

function mergeTransferStatus(statuses: string[]): string {
  if (!statuses.length) return 'OPEN';
  if (statuses.every(s => s === 'CLOSED')) return 'CLOSED';
  if (statuses.some(s => s === 'PARTIALLY_RECEIVED')) return 'PARTIALLY_RECEIVED';
  return statuses.sort((a, b) => (TRANSFER_STATUS_PRIORITY[a] ?? 9) - (TRANSFER_STATUS_PRIORITY[b] ?? 9))[0];
}

function mergeTransferGroup(group: any[]): any {
  if (group.length === 1) return group[0];
  const isChain = group.some((t: any) => t.outsourceRouteSnapshot);
  if (isChain) {
    const sorted = [...group].sort((a: any, b: any) => (a.chainStep ?? 0) - (b.chainStep ?? 0));
    const active = sorted.find((t: any) => {
      if (t.status === 'CLOSED' || t.status === 'CANCELLED') return false;
      const ds = t.dispatches || [];
      if (ds.length > 0 && ds.every((d: any) => d.status === 'FORWARDED')) return false;
      return true;
    }) ?? sorted[sorted.length - 1];
    const origin = sorted[0];
    const allDispatches = group.flatMap((t: any) => (t.dispatches || []).map((d: any) => ({ ...d, transferId: t.id }))).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const allReturns = group.flatMap((t: any) => (t.returns || []).map((r: any) => ({ ...r, transferId: t.id }))).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return {
      ...active,
      outsourceRouteSnapshot: origin.outsourceRouteSnapshot,
      senderProductId: origin.senderProductId,
      senderProductSku: origin.senderProductSku,
      senderProductName: origin.senderProductName,
      senderTenantId: origin.senderTenantId,
      senderTenantName: origin.senderTenantName,
      dispatches: allDispatches, returns: allReturns,
      status: mergeTransferStatus(group.map((t: any) => t.status)),
      _transferIds: group.map((t: any) => t.id),
      _chainTransfers: sorted.map((t: any) => ({ id: t.id, chainStep: t.chainStep, status: t.status, receiverTenantId: t.receiverTenantId, receiverTenantName: t.receiverTenantName })),
    };
  }
  const primary = group[0];
  const allDispatches = group.flatMap((t: any) => t.dispatches || []).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const allReturns = group.flatMap((t: any) => t.returns || []).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return { ...primary, dispatches: allDispatches, returns: allReturns, status: mergeTransferStatus(group.map((t: any) => t.status)), _transferIds: group.map((t: any) => t.id) };
}

function buildDispatchPayload(product: any, records: any[], aLinkMode: string, dictById: Record<string, string>) {
  const items = records.map(r => {
    const variant = product.variants?.find((v: any) => v.id === r.variantId);
    return {
      variantId: r.variantId,
      colorName: normalizeSpecLabel(variant?.colorId ? dictById[variant.colorId] : null),
      sizeName: normalizeSpecLabel(variant?.sizeId ? dictById[variant.sizeId] : null),
      quantity: Number(r.quantity), nodeId: r.nodeId,
    };
  });
  const colorNames = [...new Set(jsonToStringIds(product.colorIds).map((id: string) => normalizeSpecLabel(dictById[id])).filter((n): n is string => n != null))];
  const sizeNames = [...new Set(jsonToStringIds(product.sizeIds).map((id: string) => normalizeSpecLabel(dictById[id])).filter((n): n is string => n != null))];
  return {
    productName: product.name, productSku: product.sku, description: product.description,
    imageUrl: product.imageUrl, categoryName: product.category?.name ?? null,
    colorNames, sizeNames, items, aLinkMode,
    senderRef: { productId: product.id, docNos: [...new Set(records.map((r: any) => r.docNo).filter(Boolean))] },
  };
}

function dedupeTrimmedNames(names?: string[]): string[] {
  if (!names?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) { const t = normalizeSpecLabel(raw); if (!t || seen.has(t)) continue; seen.add(t); out.push(t); }
  return out;
}

async function ensureDictionaryItem(tenantId: string, type: string, name: string): Promise<string> {
  const trimmed = normalizeSpecLabel(name);
  if (!trimmed) throw new AppError(400, '颜色/尺码名称不能为空');
  const existing = await basePrisma.dictionaryItem.findFirst({ where: { tenantId, type, name: trimmed } });
  if (existing) return existing.id;
  const id = genId('dict');
  await basePrisma.dictionaryItem.create({ data: { id, tenantId, type, name: trimmed, value: trimmed } });
  return id;
}

async function createReceiverProduct(tenantId: string, cp: { name: string; sku: string; description?: string; colorNames?: string[]; sizeNames?: string[]; categoryName?: string }): Promise<string> {
  const productId = genId('prod');
  const colorNamesIn = dedupeTrimmedNames(cp.colorNames);
  const sizeNamesIn = dedupeTrimmedNames(cp.sizeNames);
  const colorIds: string[] = [];
  for (const name of colorNamesIn) colorIds.push(await ensureDictionaryItem(tenantId, 'color', name));
  const sizeIds: string[] = [];
  for (const name of sizeNamesIn) sizeIds.push(await ensureDictionaryItem(tenantId, 'size', name));
  let categoryId: string | null = null;
  const hasColorSize = colorIds.length > 0 || sizeIds.length > 0;
  if (cp.categoryName?.trim()) {
    const existing = await basePrisma.productCategory.findFirst({ where: { tenantId, name: cp.categoryName.trim() } });
    if (existing) {
      categoryId = existing.id;
      if (hasColorSize && !existing.hasColorSize) await basePrisma.productCategory.update({ where: { id: existing.id }, data: { hasColorSize: true } });
    } else {
      categoryId = genId('cat');
      await basePrisma.productCategory.create({ data: { id: categoryId, tenantId, name: cp.categoryName.trim(), hasColorSize } });
    }
  }
  await basePrisma.product.create({ data: { id: productId, tenantId, sku: cp.sku, name: cp.name, description: cp.description, colorIds, sizeIds, ...(categoryId ? { categoryId } : {}) } });
  if (colorIds.length || sizeIds.length) {
    const colors = colorIds.length ? colorIds : [null];
    const sizes = sizeIds.length ? sizeIds : [null];
    for (const colorId of colors) for (const sizeId of sizes) await basePrisma.productVariant.create({ data: { id: genId('pv'), productId, colorId, sizeId } });
  }
  return productId;
}

function aggregateDispatchItems(dispatches: any[]): any[] {
  const map = new Map<string, any>();
  for (const d of dispatches) {
    for (const item of ((d.payload as any)?.items ?? [])) {
      const cn = normalizeSpecLabel(item.colorName); const sn = normalizeSpecLabel(item.sizeName);
      const key = `${cn ?? ''}_${sn ?? ''}`;
      const existing = map.get(key);
      if (existing) existing.quantity += Number(item.quantity) || 0;
      else map.set(key, { ...item, colorName: cn, sizeName: sn, quantity: Number(item.quantity) || 0 });
    }
  }
  return [...map.values()];
}

async function createOrderItems(orderId: string, tenantId: string, productId: string, items: any[]) {
  const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
  const dictByName = new Map(dictItems.map(d => [`${d.type}:${d.name}`, d.id]));
  const variants = await basePrisma.productVariant.findMany({ where: { productId } });
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) continue;
    let variantId: string | null = null;
    const itemColor = normalizeSpecLabel(item.colorName); const itemSize = normalizeSpecLabel(item.sizeName);
    if (itemColor || itemSize) {
      const colorId = itemColor ? dictByName.get(`color:${itemColor}`) ?? null : null;
      const sizeId = itemSize ? dictByName.get(`size:${itemSize}`) ?? null : null;
      variantId = variants.find(v => (colorId ? v.colorId === colorId : !v.colorId) && (sizeId ? v.sizeId === sizeId : !v.sizeId))?.id ?? null;
    }
    await basePrisma.orderItem.create({ data: { productionOrderId: orderId, variantId, quantity: item.quantity } });
  }
}

// ── public API ──

export async function createCollaboration(tenantId: string, userId: string | undefined, inviteCode: string) {
  if (!inviteCode) throw new AppError(400, '请提供对方企业邀请码');
  const target = await basePrisma.tenant.findUnique({ where: { inviteCode } });
  if (!target) throw new AppError(404, '邀请码无效');
  if (target.id === tenantId) throw new AppError(400, '不能与自己建立协作');
  const [a, b] = [tenantId, target.id].sort();
  const existing = await basePrisma.tenantCollaboration.findUnique({ where: { tenantAId_tenantBId: { tenantAId: a, tenantBId: b } } });
  if (existing) {
    if (existing.status === 'ACTIVE') return existing;
    return basePrisma.tenantCollaboration.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
  }
  return basePrisma.tenantCollaboration.create({ data: { tenantAId: a, tenantBId: b, status: 'ACTIVE', invitedByUserId: userId } });
}

export async function listCollaborations(tenantId: string) {
  const rows = await basePrisma.tenantCollaboration.findMany({ where: { OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }] }, orderBy: { createdAt: 'desc' } });
  const tenantIds = new Set<string>();
  for (const r of rows) { tenantIds.add(r.tenantAId); tenantIds.add(r.tenantBId); }
  tenantIds.delete(tenantId);
  const tenants = await basePrisma.tenant.findMany({ where: { id: { in: [...tenantIds] } }, select: { id: true, name: true } });
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  return rows.map(r => {
    const otherId = r.tenantAId === tenantId ? r.tenantBId : r.tenantAId;
    return { ...r, otherTenantId: otherId, otherTenantName: tenantMap[otherId] ?? '未知' };
  });
}

export async function listOutsourceRoutes(tenantId: string) {
  return basePrisma.outsourceRoute.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
}

export async function createOutsourceRoute(tenantId: string, body: { name: string; steps: any[] }) {
  if (!body.name?.trim()) throw new AppError(400, '请提供路线名称');
  if (!body.steps?.length) throw new AppError(400, '请至少添加一个步骤');
  for (const step of body.steps) {
    if (!step.receiverTenantId) throw new AppError(400, '每一步须指定协作企业');
    const collab = await findCollaboration(tenantId, step.receiverTenantId);
    if (!collab) throw new AppError(400, `与「${step.receiverTenantName || step.receiverTenantId}」未建立协作关系`);
  }
  return basePrisma.outsourceRoute.create({ data: { tenantId, name: body.name.trim(), steps: body.steps as any } });
}

export async function updateOutsourceRoute(tenantId: string, id: string, body: { name?: string; steps?: any[] }) {
  const existing = await basePrisma.outsourceRoute.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) throw new AppError(404, '路线不存在');
  if (body.steps?.length) {
    for (const step of body.steps) {
      if (!step.receiverTenantId) throw new AppError(400, '每一步须指定协作企业');
      const collab = await findCollaboration(tenantId, step.receiverTenantId);
      if (!collab) throw new AppError(400, `与「${step.receiverTenantName || step.receiverTenantId}」未建立协作关系`);
    }
  }
  return basePrisma.outsourceRoute.update({
    where: { id }, data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.steps !== undefined ? { steps: body.steps as any } : {}) },
  });
}

export async function deleteOutsourceRoute(tenantId: string, id: string) {
  const existing = await basePrisma.outsourceRoute.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) throw new AppError(404, '路线不存在');
  await basePrisma.outsourceRoute.delete({ where: { id } });
  return { success: true };
}

export async function syncDispatch(tenantId: string, body: { recordIds: string[]; collaborationTenantId: string; outsourceRouteId?: string }) {
  const { recordIds, collaborationTenantId, outsourceRouteId } = body;
  if (!recordIds?.length) throw new AppError(400, '请提供外协记录');
  if (!collaborationTenantId) throw new AppError(400, '请提供协作企业');
  const collab = await findCollaboration(tenantId, collaborationTenantId);
  if (!collab) throw new AppError(400, '未找到有效的企业协作关系');
  const records = await basePrisma.productionOpRecord.findMany({ where: { id: { in: recordIds }, tenantId, type: 'OUTSOURCE' } });
  if (records.length !== recordIds.length) throw new AppError(400, `部分记录不存在或不属于当前租户（找到 ${records.length}/${recordIds.length}）`);
  const aLinkMode = await getProductionLinkMode(tenantId);
  let routeSnapshot: any = null;
  if (outsourceRouteId) {
    const route = await basePrisma.outsourceRoute.findUnique({ where: { id: outsourceRouteId } });
    if (!route || route.tenantId !== tenantId) throw new AppError(400, '外协路线不存在');
    routeSnapshot = route.steps;
  }
  const productIds = [...new Set(records.map(r => r.productId))];
  const products = await basePrisma.product.findMany({ where: { id: { in: productIds }, tenantId }, include: { variants: true, category: true } });
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
  const dictById = Object.fromEntries(dictItems.map(d => [d.id, d.name]));
  const grouped = new Map<string, typeof records>();
  for (const r of records) { const list = grouped.get(r.productId) ?? []; list.push(r); grouped.set(r.productId, list); }
  const dispatches: any[] = [];
  for (const [productId, recs] of grouped) {
    const product = productMap[productId]; if (!product) continue;
    let transfer = routeSnapshot ? null : await basePrisma.interTenantSubcontractTransfer.findFirst({
      where: { senderTenantId: tenantId, receiverTenantId: collaborationTenantId, senderProductId: productId, status: { not: 'CLOSED' }, originTransferId: null, outsourceRouteSnapshot: { equals: Prisma.DbNull } },
      orderBy: { createdAt: 'desc' },
    });
    if (!transfer) {
      transfer = await basePrisma.interTenantSubcontractTransfer.create({
        data: { collaborationId: collab.id, senderTenantId: tenantId, receiverTenantId: collaborationTenantId, senderProductId: productId, senderProductSku: product.sku, senderProductName: product.name, aLinkMode, ...(routeSnapshot ? { outsourceRouteSnapshot: routeSnapshot, chainStep: 0, originTenantId: tenantId } : {}) },
      });
    }
    const payload = buildDispatchPayload(product, recs, aLinkMode, dictById);
    const dispatch = await basePrisma.subcontractCollaborationDispatch.create({ data: { transferId: transfer.id, payload: payload as Prisma.InputJsonValue, senderDispatchRecordIds: recs.map(r => r.id) } });
    for (const r of recs) await basePrisma.productionOpRecord.update({ where: { id: r.id }, data: { collabData: { transferId: transfer.id, dispatchId: dispatch.id } } });
    dispatches.push({ transferId: transfer.id, dispatchId: dispatch.id, productName: product.name });
  }
  return { dispatches };
}

export async function listTransfers(tenantId: string, opts: { role?: string; status?: string }) {
  const where: any = {};
  if (opts.role === 'sender') where.senderTenantId = tenantId;
  else if (opts.role === 'receiver') where.receiverTenantId = tenantId;
  else where.OR = [{ senderTenantId: tenantId }, { receiverTenantId: tenantId }];
  if (opts.status) where.status = opts.status;
  const transfers = await basePrisma.interTenantSubcontractTransfer.findMany({ where, include: { dispatches: { orderBy: { createdAt: 'asc' } }, returns: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  const peerIds = new Set<string>();
  for (const t of transfers) peerIds.add(t.senderTenantId === tenantId ? t.receiverTenantId : t.senderTenantId);
  const tenants = await basePrisma.tenant.findMany({ where: { id: { in: [...peerIds] } }, select: { id: true, name: true } });
  const nameMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  const enriched = transfers.map(t => ({ ...t, senderTenantName: t.senderTenantId === tenantId ? '本企业' : (nameMap[t.senderTenantId] ?? ''), receiverTenantName: t.receiverTenantId === tenantId ? '本企业' : (nameMap[t.receiverTenantId] ?? '') }));
  const groupMap = new Map<string, any[]>();
  for (const t of enriched) {
    let routeKey = '';
    if (t.outsourceRouteSnapshot) routeKey = t.originTransferId ?? t.id;
    const key = routeKey ? `chain::${routeKey}` : `${t.senderProductId}::${t.senderTenantId}::${t.receiverTenantId}`;
    const list = groupMap.get(key) ?? [];
    list.push(t); groupMap.set(key, list);
  }
  return [...groupMap.values()].map(mergeTransferGroup);
}

export async function getTransfer(tenantId: string, id: string) {
  const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id }, include: { dispatches: { orderBy: { createdAt: 'asc' } }, returns: { orderBy: { createdAt: 'asc' } } } });
  if (!transfer) throw new AppError(404, '主单不存在');
  assertTenantIs(tenantId, transfer.senderTenantId, transfer.receiverTenantId);
  let related: any[] = [];
  if (transfer.outsourceRouteSnapshot) {
    const chainOriginId = transfer.originTransferId ?? transfer.id;
    related = await basePrisma.interTenantSubcontractTransfer.findMany({ where: { id: { not: transfer.id }, OR: [{ id: chainOriginId }, { originTransferId: chainOriginId }] }, include: { dispatches: { orderBy: { createdAt: 'asc' } }, returns: { orderBy: { createdAt: 'asc' } } } });
    related = related.filter(r => r.senderTenantId === tenantId || r.receiverTenantId === tenantId);
  } else {
    related = await basePrisma.interTenantSubcontractTransfer.findMany({ where: { senderTenantId: transfer.senderTenantId, receiverTenantId: transfer.receiverTenantId, senderProductId: transfer.senderProductId, id: { not: transfer.id }, outsourceRouteSnapshot: { equals: Prisma.DbNull } }, include: { dispatches: { orderBy: { createdAt: 'asc' } }, returns: { orderBy: { createdAt: 'asc' } } } });
  }
  const allTransfers = [transfer, ...related];
  const peerIds = new Set<string>();
  for (const t of allTransfers) { if (t.senderTenantId !== tenantId) peerIds.add(t.senderTenantId); if (t.receiverTenantId !== tenantId) peerIds.add(t.receiverTenantId); }
  const tenants = await basePrisma.tenant.findMany({ where: { id: { in: [...peerIds] } }, select: { id: true, name: true } });
  const nameMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  const latestInChain = transfer.outsourceRouteSnapshot ? allTransfers.reduce((latest, t) => (t.chainStep ?? 0) > (latest.chainStep ?? 0) ? t : latest, allTransfers[0]) : transfer;
  const childTransfer = await basePrisma.interTenantSubcontractTransfer.findFirst({ where: { parentTransferId: latestInChain.id, status: { not: 'CANCELLED' } }, select: { id: true, originConfirmedAt: true, status: true } });
  const enrich = (t: any) => ({ ...t, senderTenantName: t.senderTenantId === tenantId ? '本企业' : (nameMap[t.senderTenantId] ?? ''), receiverTenantName: t.receiverTenantId === tenantId ? '本企业' : (nameMap[t.receiverTenantId] ?? '') });
  const merged = mergeTransferGroup(allTransfers.map(enrich));
  if (childTransfer) { merged.childTransferId = childTransfer.id; merged.childConfirmed = !!childTransfer.originConfirmedAt; }
  return merged;
}

export async function acceptTransfer(tenantId: string, transferId: string, body: { createProduct?: { name: string; sku: string; description?: string; colorNames?: string[]; sizeNames?: string[] }; dispatchIds?: string[] }) {
  const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id: transferId }, include: { dispatches: true } });
  if (!transfer) throw new AppError(404, '主单不存在');
  assertTenantIs(tenantId, transfer.receiverTenantId);
  const pendingDispatches = transfer.dispatches.filter(d => d.status === 'PENDING');
  const toAccept = body.dispatchIds ? pendingDispatches.filter(d => body.dispatchIds!.includes(d.id)) : pendingDispatches;
  if (!toAccept.length) throw new AppError(400, '没有待接受的 Dispatch');
  let finalProductId = transfer.receiverProductId;
  if (!finalProductId && transfer.senderProductSku) {
    const mapped = await basePrisma.collaborationProductMap.findUnique({ where: { collaborationId_senderSku: { collaborationId: transfer.collaborationId, senderSku: transfer.senderProductSku } } });
    if (mapped?.receiverProductId) finalProductId = mapped.receiverProductId;
  }
  if (!finalProductId && transfer.senderProductId) {
    const resolvedTransfer = await basePrisma.interTenantSubcontractTransfer.findFirst({ where: { senderTenantId: transfer.senderTenantId, receiverTenantId: transfer.receiverTenantId, senderProductId: transfer.senderProductId, receiverProductId: { not: null }, id: { not: transferId } }, select: { receiverProductId: true } });
    if (resolvedTransfer?.receiverProductId) finalProductId = resolvedTransfer.receiverProductId;
  }
  if (!finalProductId && body.createProduct) {
    const firstPayload = toAccept[0]?.payload as any;
    finalProductId = await createReceiverProduct(tenantId, { ...body.createProduct, categoryName: firstPayload?.categoryName ?? null });
  }
  if (!finalProductId) throw new AppError(400, '请提供或新建乙方产品');
  const effectiveMode = transfer.bReceiveMode ?? await getProductionLinkMode(tenantId);
  if (!transfer.bReceiveMode || !transfer.receiverProductId) {
    await basePrisma.interTenantSubcontractTransfer.update({ where: { id: transferId }, data: { bReceiveMode: effectiveMode, receiverProductId: finalProductId } });
  }
  if (transfer.senderProductSku) {
    await basePrisma.collaborationProductMap.upsert({ where: { collaborationId_senderSku: { collaborationId: transfer.collaborationId, senderSku: transfer.senderProductSku } }, update: { receiverProductId: finalProductId, senderProductName: transfer.senderProductName }, create: { collaborationId: transfer.collaborationId, senderSku: transfer.senderProductSku, senderProductName: transfer.senderProductName, receiverProductId: finalProductId } });
  }
  const displayName = transfer.senderProductName || '';
  const displaySku = transfer.senderProductSku || '';
  const product = await basePrisma.product.findUnique({ where: { id: finalProductId } });
  let milestoneNodeIds = (product?.milestoneNodeIds as string[]) || [];
  let fallbackMilestones: Array<{ templateId: string; name: string; reportTemplate: any; reportDisplayTemplate?: any; sortOrder: number }> | null = null;
  if (milestoneNodeIds.length === 0) {
    const existingOrder = await basePrisma.productionOrder.findFirst({ where: { productId: finalProductId, tenantId, milestones: { some: {} } }, include: { milestones: { orderBy: { sortOrder: 'asc' } } } });
    if (existingOrder?.milestones?.length) {
      fallbackMilestones = existingOrder.milestones.map(m => ({
        templateId: m.templateId,
        name: m.name,
        reportTemplate: m.reportTemplate,
        reportDisplayTemplate: (m as { reportDisplayTemplate?: unknown }).reportDisplayTemplate ?? [],
        sortOrder: m.sortOrder,
      }));
    }
  }
  const nodes = milestoneNodeIds.length > 0 ? await basePrisma.globalNodeTemplate.findMany({ where: { tenantId } }) : [];
  const hasProcesses = milestoneNodeIds.length > 0 || fallbackMilestones !== null;
  const orderStatus = hasProcesses ? 'IN_PROGRESS' : 'PENDING_PROCESS';
  const buildMilestones = () => {
    if (milestoneNodeIds.length > 0) {
      return milestoneNodeIds.map((nodeId, idx) => {
        const node = nodes.find(n => n.id === nodeId);
        return {
          id: genId('ms'), templateId: nodeId, name: node?.name || nodeId, status: 'PENDING', completedQuantity: 0,
          reportTemplate: (node as any)?.reportTemplate || [],
          reportDisplayTemplate: (node as any)?.reportDisplayTemplate ?? [],
          weight: 1, assignedWorkerIds: [], assignedEquipmentIds: [], sortOrder: idx,
        };
      });
    }
    if (fallbackMilestones) {
      return fallbackMilestones.map(fm => ({
        id: genId('ms'), templateId: fm.templateId, name: fm.name, status: 'PENDING', completedQuantity: 0,
        reportTemplate: fm.reportTemplate || [],
        reportDisplayTemplate: fm.reportDisplayTemplate ?? [],
        weight: 1, assignedWorkerIds: [], assignedEquipmentIds: [], sortOrder: fm.sortOrder,
      }));
    }
    return [];
  };
  const createdOrders: string[] = [];
  if (effectiveMode === 'product') {
    let existingOrderId = transfer.dispatches.find(d => d.receiverProductionOrderId)?.receiverProductionOrderId;
    if (!existingOrderId) {
      const orderId = genId('ord'); const orderNumber = await getNextWorkOrderNumber(tenantId); const milestones = buildMilestones();
      await basePrisma.productionOrder.create({ data: { id: orderId, tenantId, orderNumber, productId: finalProductId, productName: displayName, sku: displaySku, status: orderStatus, ...(milestones.length > 0 ? { milestones: { create: milestones } } : {}) } });
      for (const d of toAccept) await createOrderItemsWithSource(orderId, tenantId, finalProductId, (d.payload as any)?.items ?? [], d.id);
      existingOrderId = orderId; createdOrders.push(orderId);
    } else {
      for (const d of toAccept) await createOrderItemsWithSource(existingOrderId, tenantId, finalProductId, (d.payload as any)?.items ?? [], d.id);
    }
    for (const d of toAccept) await basePrisma.subcontractCollaborationDispatch.update({ where: { id: d.id }, data: { status: 'ACCEPTED', receiverProductionOrderId: existingOrderId } });
  } else {
    for (const d of toAccept) {
      const orderId = genId('ord'); const orderNumber = await getNextWorkOrderNumber(tenantId); const items = (d.payload as any)?.items ?? []; const milestones = buildMilestones();
      await basePrisma.productionOrder.create({ data: { id: orderId, tenantId, orderNumber, productId: finalProductId, productName: displayName, sku: displaySku, status: orderStatus, ...(milestones.length > 0 ? { milestones: { create: milestones } } : {}) } });
      await createOrderItemsWithSource(orderId, tenantId, finalProductId, items, d.id);
      await basePrisma.subcontractCollaborationDispatch.update({ where: { id: d.id }, data: { status: 'ACCEPTED', receiverProductionOrderId: orderId } });
      createdOrders.push(orderId);
    }
  }
  return { accepted: toAccept.length, bReceiveMode: effectiveMode, receiverProductId: finalProductId, createdOrders, pendingProcess: !hasProcesses };
}

export async function createReturn(tenantId: string, transferId: string, body: { items: any[]; note?: string; dispatchId?: string; receiverProductionOrderId?: string; warehouseId?: string }) {
  if (!body.items?.length) throw new AppError(400, '请提供回传明细');
  const cleanItems = body.items.filter((i: any) => (Number(i.quantity) || 0) > 0);
  if (!cleanItems.length) throw new AppError(400, '回传数量须大于 0');
  const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id: transferId }, include: { dispatches: true, returns: true } });
  if (!transfer) throw new AppError(404, '主单不存在');
  assertTenantIs(tenantId, transfer.receiverTenantId);
  const dispatchedByVar = aggregateDispatchedByVariant(transfer.dispatches);
  const returnedByVar = aggregateReturnedByVariant(transfer.returns);
  const totalDispatchedAccepted = [...dispatchedByVar.values()].reduce((a, b) => a + b, 0);
  const alreadyReturnedTotal = [...returnedByVar.values()].reduce((a, b) => a + b, 0);
  const thisReturn = cleanItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
  if (totalDispatchedAccepted <= 0) throw new AppError(400, '没有已接受的发出批次，无法回传');
  for (const it of cleanItems) {
    const q = Number(it.quantity) || 0; const k = collabVariantKey(it); const cap = dispatchedByVar.get(k) ?? 0;
    if (cap <= 0) throw new AppError(400, `规格「${[it.colorName, it.sizeName].filter(Boolean).join('/') || '无规格'}」不在已发出明细中`);
    const already = returnedByVar.get(k) ?? 0;
    if (already + q > cap) throw new AppError(400, `规格「${[it.colorName, it.sizeName].filter(Boolean).join('/') || '无规格'}」回传超限：已回 ${already}，本次 ${q}，可回上限 ${cap}`);
  }
  if (alreadyReturnedTotal + thisReturn > totalDispatchedAccepted) throw new AppError(400, `回传数量超限：已回传 ${alreadyReturnedTotal} + 本次 ${thisReturn} > 已接受发出总量 ${totalDispatchedAccepted}`);
  await assertReceiverPartnerBindingForReturn(tenantId, transfer.senderTenantId);
  const partnerName = await getSenderPartnerName(tenantId, transfer.senderTenantId);
  const stockOutDocNo = await generateReturnFlowDocNo(tenantId, partnerName);
  const receiverProductId = transfer.receiverProductId;
  const dictItems = receiverProductId ? await basePrisma.dictionaryItem.findMany({ where: { tenantId } }) : [];
  const dictByName = new Map(dictItems.map(d => [`${d.type}:${d.name}`, d.id]));
  const variants = receiverProductId ? await basePrisma.productVariant.findMany({ where: { productId: receiverProductId } }) : [];
  const orderIds = transfer.dispatches.map(d => d.receiverProductionOrderId).filter((v): v is string => !!v);
  const firstOrderId = orderIds[0] ?? null;
  const ret = await basePrisma.subcontractCollaborationReturn.create({ data: { transferId, dispatchId: body.dispatchId ?? null, receiverProductionOrderId: body.receiverProductionOrderId ?? null, payload: { items: cleanItems, note: body.note, stockOutDocNo, warehouseId: body.warehouseId } } });
  if (receiverProductId) {
    for (const item of cleanItems) {
      const qty = Number(item.quantity) || 0; if (qty <= 0) continue;
      const cn = normalizeSpecLabel(item.colorName); const sn = normalizeSpecLabel(item.sizeName);
      let variantId: string | null = null;
      if (cn || sn) {
        const colorId = cn ? dictByName.get(`color:${cn}`) ?? null : null;
        const sizeId = sn ? dictByName.get(`size:${sn}`) ?? null : null;
        variantId = variants.find(v => (colorId ? v.colorId === colorId : !v.colorId) && (sizeId ? v.sizeId === sizeId : !v.sizeId))?.id ?? null;
      }
      await basePrisma.productionOpRecord.create({ data: { id: genId('prodop'), tenantId, type: 'STOCK_OUT', productId: receiverProductId, variantId, orderId: firstOrderId, quantity: qty, operator: '协作回传出库', timestamp: new Date(), status: '已完成', warehouseId: body.warehouseId ?? null, docNo: stockOutDocNo, partner: partnerName || null, collabData: { source: 'collaborationReturn', returnId: ret.id, transferId } } });
    }
  }
  return ret;
}

export async function receiveReturn(tenantId: string, returnId: string) {
  const ret = await basePrisma.subcontractCollaborationReturn.findUnique({ where: { id: returnId }, include: { transfer: { include: { dispatches: true } } } });
  if (!ret) throw new AppError(404, 'Return 不存在');
  assertTenantIs(tenantId, ret.transfer.senderTenantId);
  if (ret.status === 'A_RECEIVED') throw new AppError(400, '该回传已确认收回');
  const transfer = ret.transfer;
  const returnItems: any[] = (ret.payload as any)?.items ?? [];
  const isChainTransfer = !!(transfer.outsourceRouteSnapshot && transfer.chainStep > 0);
  const route = transfer.outsourceRouteSnapshot as any[] | null;
  const chainStepDef = isChainTransfer && route ? route.find((s: any) => s.stepOrder === transfer.chainStep) : null;
  const dispatchLookup = new Map<string, { nodeId: string | null; variantId: string | null }>();
  const allSenderRecordIds: string[] = [];
  for (const d of transfer.dispatches) {
    if (d.status !== 'ACCEPTED' && d.status !== 'FORWARDED') continue;
    for (const item of ((d.payload as any)?.items ?? []) as any[]) { const key = collabVariantKey(item); if (!dispatchLookup.has(key)) dispatchLookup.set(key, { nodeId: item.nodeId ?? null, variantId: item.variantId ?? null }); }
    allSenderRecordIds.push(...((d.senderDispatchRecordIds as string[]) ?? []));
  }
  let chainResolveVariantId: ((cn: string | null, sn: string | null) => string | null) | null = null;
  if (isChainTransfer && transfer.senderProductId) {
    const senderProduct = await basePrisma.product.findUnique({ where: { id: transfer.senderProductId }, include: { variants: true } });
    if (senderProduct?.variants?.length) {
      const senderDictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
      const senderDictById = Object.fromEntries(senderDictItems.map(d => [d.id, d.name]));
      chainResolveVariantId = (cn, sn) => senderProduct.variants.find(v => { const vc = v.colorId ? (senderDictById[v.colorId] ?? null) : null; const vs = v.sizeId ? (senderDictById[v.sizeId] ?? null) : null; return (vc ?? null) === (cn ?? null) && (vs ?? null) === (sn ?? null); })?.id ?? null;
    }
  }
  let orderIdByVariant = new Map<string, string>();
  let localPartnerName = '';
  if (allSenderRecordIds.length > 0) {
    const origRecs = await basePrisma.productionOpRecord.findMany({ where: { id: { in: allSenderRecordIds } }, select: { orderId: true, variantId: true, partner: true } });
    for (const r of origRecs) { if (r.orderId && r.variantId && !orderIdByVariant.has(r.variantId)) orderIdByVariant.set(r.variantId, r.orderId); if (!localPartnerName && r.partner) localPartnerName = r.partner; }
  }
  if (isChainTransfer) {
    const partnerRow = await basePrisma.partner.findFirst({ where: { tenantId, collaborationTenantId: transfer.receiverTenantId }, select: { name: true } });
    localPartnerName = partnerRow ? partnerRow.name : ((await basePrisma.tenant.findUnique({ where: { id: transfer.receiverTenantId }, select: { name: true } }))?.name ?? '');
  } else if (!localPartnerName) { localPartnerName = (await basePrisma.tenant.findUnique({ where: { id: transfer.receiverTenantId }, select: { name: true } }))?.name ?? ''; }
  const receiptDocNo = await nextOutsourceDocNoForPartner(tenantId, 'receive', localPartnerName);
  for (const item of returnItems) {
    const qty = Number(item.quantity) || 0; if (qty <= 0) continue;
    const key = collabVariantKey(item); const dInfo = dispatchLookup.get(key);
    let variantId = dInfo?.variantId ?? null;
    if (!variantId && chainResolveVariantId) variantId = chainResolveVariantId(normalizeSpecLabel(item.colorName) ?? null, normalizeSpecLabel(item.sizeName) ?? null);
    const orderId = (variantId && orderIdByVariant.get(variantId)) ?? null;
    const nodeId = chainStepDef?.nodeId ?? dInfo?.nodeId ?? null;
    const data = { id: genId('prodop'), tenantId, type: 'OUTSOURCE', productId: transfer.senderProductId, variantId, quantity: qty, operator: '协作回收', timestamp: new Date(), status: '已收回', partner: localPartnerName, nodeId, orderId, docNo: receiptDocNo, collabData: { source: 'collaborationReturn', returnId: ret.id, transferId: transfer.id } };
    await basePrisma.productionOpRecord.create({ data });
    await applyOutsourceProgress({ ...data, tenantId });
  }
  const updatedPayload = { ...(ret.payload as any), receiptDocNo };
  await basePrisma.subcontractCollaborationReturn.update({ where: { id: returnId }, data: { status: 'A_RECEIVED', payload: updatedPayload } });
  await updateTransferStatus(ret.transferId);
  if (transfer.originTransferId) {
    // Re-evaluate the entire chain: only close origin/siblings if ALL dispatched qty has been received
    const chainTransfers = await basePrisma.interTenantSubcontractTransfer.findMany({
      where: { OR: [{ id: transfer.originTransferId }, { originTransferId: transfer.originTransferId }] },
      include: { dispatches: true, returns: true },
    });
    const allChainFullyClosed = chainTransfers.every(ct => {
      const dTotal = aggregateDispatchedByVariant(ct.dispatches);
      const dispatched = [...dTotal.values()].reduce((a, b) => a + b, 0);
      const received = ct.returns.filter(r => r.status === 'A_RECEIVED').reduce((s, r) => s + ((r.payload as any)?.items ?? []).reduce((a: number, i: any) => a + (Number(i.quantity) || 0), 0), 0);
      return dispatched > 0 && received >= dispatched;
    });
    if (allChainFullyClosed) {
      await basePrisma.interTenantSubcontractTransfer.updateMany({ where: { OR: [{ id: transfer.originTransferId }, { originTransferId: transfer.originTransferId }], status: { not: 'CLOSED' } }, data: { status: 'CLOSED' } });
    }
  }
  return { success: true, receiptDocNo };
}

export async function forwardTransfer(tenantId: string, transferId: string, body: { items: any[]; note?: string; warehouseId?: string }) {
  if (!Array.isArray(body.items) || body.items.length === 0) throw new AppError(400, '请提供转发明细 (items)');
  for (const it of body.items) if (!it.quantity || Number(it.quantity) <= 0) throw new AppError(400, '转发数量必须大于 0');
  const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id: transferId }, include: { dispatches: true, returns: true } });
  if (!transfer) throw new AppError(404, '主单不存在');
  assertTenantIs(tenantId, transfer.receiverTenantId);
  const route = transfer.outsourceRouteSnapshot as any[];
  if (!route?.length) throw new AppError(400, '该协作单未配置外协路线，无法转发');
  const nextStepIdx = transfer.chainStep + 1;
  const nextStep = route.find((s: any) => s.stepOrder === nextStepIdx);
  if (!nextStep) throw new AppError(400, '已是路线最后一站，请使用回传功能');
  const acceptedDispatches = transfer.dispatches.filter(d => d.status === 'ACCEPTED' || d.status === 'FORWARDED');
  if (!acceptedDispatches.length) throw new AppError(400, '没有已接受的 Dispatch 可转发');
  // validate capacity
  const dispatchedBySpec = new Map<string, number>();
  for (const d of acceptedDispatches) for (const it of ((d.payload as any)?.items ?? [])) { const cn = normalizeSpecLabel(it.colorName); const sn = normalizeSpecLabel(it.sizeName); const k = `${cn ?? ''}\t${sn ?? ''}`; dispatchedBySpec.set(k, (dispatchedBySpec.get(k) || 0) + (Number(it.quantity) || 0)); }
  const returnedBySpec = new Map<string, number>();
  for (const r of (transfer.returns || []).filter(r => r.status !== 'WITHDRAWN')) for (const it of ((r.payload as any)?.items ?? [])) { const cn = normalizeSpecLabel(it.colorName); const sn = normalizeSpecLabel(it.sizeName); const k = `${cn ?? ''}\t${sn ?? ''}`; returnedBySpec.set(k, (returnedBySpec.get(k) || 0) + (Number(it.quantity) || 0)); }
  for (const it of body.items) { const cn = normalizeSpecLabel(it.colorName); const sn = normalizeSpecLabel(it.sizeName); const k = `${cn ?? ''}\t${sn ?? ''}`; const max = (dispatchedBySpec.get(k) || 0) - (returnedBySpec.get(k) || 0); if (Number(it.quantity) > max) throw new AppError(400, `「${[cn, sn].filter(Boolean).join('/') || '无规格'}」转发数量 ${it.quantity} 超过可转发上限 ${max}`); }
  const originTenantId = transfer.originTenantId ?? transfer.senderTenantId;
  const originTransferId = transfer.originTransferId ?? transfer.id;
  const collab = await findCollaboration(originTenantId, nextStep.receiverTenantId);
  if (!collab) throw new AppError(400, `甲方与「${nextStep.receiverTenantName || ''}」未建立协作关系`);
  for (const d of acceptedDispatches) await basePrisma.subcontractCollaborationDispatch.update({ where: { id: d.id }, data: { status: 'FORWARDED' } });
  await updateTransferStatus(transferId);
  const forwardItems = body.items.map((it: any) => ({ colorName: normalizeSpecLabel(it.colorName), sizeName: normalizeSpecLabel(it.sizeName), quantity: Number(it.quantity) }));
  let forwardStockOutDocNo: string | null = null;
  const receiverProductId = transfer.receiverProductId;
  if (receiverProductId) forwardStockOutDocNo = await generateDocNo('CK', 'production_op_records', 'doc_no', tenantId);
  const payload = { productName: transfer.senderProductName, productSku: transfer.senderProductSku, colorNames: [...new Set(forwardItems.map((i: any) => i.colorName).filter(Boolean))], sizeNames: [...new Set(forwardItems.map((i: any) => i.sizeName).filter(Boolean))], items: forwardItems, aLinkMode: transfer.aLinkMode, senderRef: { productId: transfer.senderProductId }, forwardedFrom: { transferId: transfer.id, factoryTenantId: tenantId }, ...(body.note ? { note: body.note } : {}), ...(forwardStockOutDocNo ? { stockOutDocNo: forwardStockOutDocNo } : {}), ...(body.warehouseId ? { warehouseId: body.warehouseId } : {}) };
  const allSenderRecordIds = acceptedDispatches.flatMap(d => (d.senderDispatchRecordIds as string[]) ?? []);
  const newTransfer = await basePrisma.interTenantSubcontractTransfer.create({ data: { collaborationId: collab.id, senderTenantId: originTenantId, receiverTenantId: nextStep.receiverTenantId, senderProductId: transfer.senderProductId, senderProductSku: transfer.senderProductSku, senderProductName: transfer.senderProductName, aLinkMode: transfer.aLinkMode, originTransferId, parentTransferId: transfer.id, chainStep: nextStepIdx, originTenantId, outsourceRouteSnapshot: route } });
  const dispatch = await basePrisma.subcontractCollaborationDispatch.create({ data: { transferId: newTransfer.id, payload: payload as Prisma.InputJsonValue, senderDispatchRecordIds: allSenderRecordIds } });
  if (receiverProductId && forwardStockOutDocNo) {
    const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
    const dictByName = new Map(dictItems.map(d => [`${d.type}:${d.name}`, d.id]));
    const variants = await basePrisma.productVariant.findMany({ where: { productId: receiverProductId } });
    const orderIds = transfer.dispatches.map(d => d.receiverProductionOrderId).filter((v): v is string => !!v);
    const firstOrderId = orderIds[0] ?? null;
    for (const item of forwardItems) { const qty = Number(item.quantity) || 0; if (qty <= 0) continue; let variantId: string | null = null; if (item.colorName || item.sizeName) { const colorId = item.colorName ? dictByName.get(`color:${item.colorName}`) ?? null : null; const sizeId = item.sizeName ? dictByName.get(`size:${item.sizeName}`) ?? null : null; variantId = variants.find(v => (colorId ? v.colorId === colorId : !v.colorId) && (sizeId ? v.sizeId === sizeId : !v.sizeId))?.id ?? null; } await basePrisma.productionOpRecord.create({ data: { id: genId('prodop'), tenantId, type: 'STOCK_OUT', productId: receiverProductId, variantId, orderId: firstOrderId, quantity: qty, operator: '协作转发出库', timestamp: new Date(), status: '已完成', warehouseId: body.warehouseId ?? null, docNo: forwardStockOutDocNo } }); }
  }
  return { newTransferId: newTransfer.id, dispatchId: dispatch.id, nextStep };
}

export async function confirmForward(tenantId: string, transferId: string) {
  const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id: transferId }, include: { dispatches: true } });
  if (!transfer) throw new AppError(404, '主单不存在');
  assertTenantIs(tenantId, transfer.originTenantId ?? transfer.senderTenantId);
  if (transfer.originConfirmedAt) throw new AppError(400, '该转发已确认');
  if (transfer.chainStep <= 0) throw new AppError(400, '第一步无需确认转发');
  const route = transfer.outsourceRouteSnapshot as any[];
  if (!route?.length) throw new AppError(400, '缺少路线信息');
  const prevStepDef = route.find((s: any) => s.stepOrder === transfer.chainStep - 1);
  const currStepDef = route.find((s: any) => s.stepOrder === transfer.chainStep);
  if (!prevStepDef || !currStepDef) throw new AppError(400, '路线步骤数据异常');
  const stepTenantIds = [prevStepDef.receiverTenantId, currStepDef.receiverTenantId].filter(Boolean);
  const partnerRows = stepTenantIds.length > 0 ? await basePrisma.partner.findMany({ where: { tenantId, collaborationTenantId: { in: stepTenantIds } }, select: { name: true, collaborationTenantId: true } }) : [];
  const partnerNameByTenantId = Object.fromEntries(partnerRows.map(p => [p.collaborationTenantId!, p.name]));
  const prevPartnerName = partnerNameByTenantId[prevStepDef.receiverTenantId] ?? prevStepDef.receiverTenantName ?? '';
  const currPartnerName = partnerNameByTenantId[currStepDef.receiverTenantId] ?? currStepDef.receiverTenantName ?? '';
  await basePrisma.interTenantSubcontractTransfer.update({ where: { id: transferId }, data: { originConfirmedAt: new Date() } });
  const originTransferId = transfer.originTransferId ?? transfer.id;
  const originTransfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id: originTransferId }, include: { dispatches: true } });
  const allOrigSenderRecordIds = (originTransfer?.dispatches ?? []).flatMap(d => (d.senderDispatchRecordIds as string[]) ?? []);
  let orderIdByVariant = new Map<string, string>();
  if (allOrigSenderRecordIds.length > 0) { const origRecs = await basePrisma.productionOpRecord.findMany({ where: { id: { in: allOrigSenderRecordIds } }, select: { orderId: true, variantId: true } }); for (const r of origRecs) { if (r.orderId && r.variantId && !orderIdByVariant.has(r.variantId)) orderIdByVariant.set(r.variantId, r.orderId); } }
  const dispatchItems = transfer.dispatches.flatMap(d => ((d.payload as any)?.items ?? []) as any[]);
  const senderProduct = transfer.senderProductId ? await basePrisma.product.findUnique({ where: { id: transfer.senderProductId }, include: { variants: true } }) : null;
  const senderDictItems = senderProduct ? await basePrisma.dictionaryItem.findMany({ where: { tenantId } }) : [];
  const senderDictById = Object.fromEntries(senderDictItems.map(d => [d.id, d.name]));
  const resolveVariantId = (cn: string | null, sn: string | null): string | null => { if (!senderProduct?.variants?.length) return null; return senderProduct.variants.find(v => { const vc = v.colorId ? (senderDictById[v.colorId] ?? null) : null; const vs = v.sizeId ? (senderDictById[v.sizeId] ?? null) : null; return (vc ?? null) === (cn ?? null) && (vs ?? null) === (sn ?? null); })?.id ?? null; };
  const receiveDocNo = await nextOutsourceDocNoForPartner(tenantId, 'receive', prevPartnerName);
  const dispatchDocNo = await nextOutsourceDocNoForPartner(tenantId, 'dispatch', currPartnerName);
  for (const item of dispatchItems) {
    const qty = Number(item.quantity) || 0; if (qty <= 0) continue;
    const variantId = item.variantId ?? resolveVariantId(item.colorName ?? null, item.sizeName ?? null);
    const orderId = (variantId && orderIdByVariant.get(variantId)) ?? null;
    const receiveData = { id: genId('prodop'), tenantId, type: 'OUTSOURCE', productId: transfer.senderProductId, variantId, quantity: qty, operator: '链式转发-自动收回', timestamp: new Date(), status: '已收回', partner: prevPartnerName, nodeId: prevStepDef.nodeId ?? null, orderId, docNo: receiveDocNo, collabData: { source: 'chainForwardReceive', transferId: transfer.parentTransferId, chainStep: transfer.chainStep - 1 } };
    await basePrisma.productionOpRecord.create({ data: receiveData });
    await applyOutsourceProgress({ ...receiveData, tenantId });
    await basePrisma.productionOpRecord.create({ data: { id: genId('prodop'), tenantId, type: 'OUTSOURCE', productId: transfer.senderProductId, variantId, quantity: qty, operator: '链式转发-自动发出', timestamp: new Date(), status: '加工中', partner: currPartnerName, nodeId: currStepDef.nodeId ?? null, orderId, docNo: dispatchDocNo, collabData: { source: 'chainForwardDispatch', transferId: transfer.id, chainStep: transfer.chainStep } } });
  }
  return { success: true, receiveDocNo, dispatchDocNo };
}

export async function listProductMaps(tenantId: string, collaborationId?: string) {
  const where: any = {};
  if (collaborationId) where.collaborationId = collaborationId;
  else { const collabs = await basePrisma.tenantCollaboration.findMany({ where: { OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }], status: 'ACTIVE' }, select: { id: true } }); where.collaborationId = { in: collabs.map(c => c.id) }; }
  return basePrisma.collaborationProductMap.findMany({ where, orderBy: { createdAt: 'desc' } });
}

export async function updateProductMap(tenantId: string, id: string, body: { receiverProductId?: string; senderProductName?: string }) {
  const map = await basePrisma.collaborationProductMap.findUnique({ where: { id }, include: { collaboration: true } });
  if (!map) throw new AppError(404, '对照记录不存在');
  assertTenantIs(tenantId, map.collaboration.tenantAId, map.collaboration.tenantBId);
  return basePrisma.collaborationProductMap.update({ where: { id }, data: { ...(body.receiverProductId !== undefined ? { receiverProductId: body.receiverProductId } : {}), ...(body.senderProductName !== undefined ? { senderProductName: body.senderProductName } : {}) } });
}

export async function deleteProductMap(tenantId: string, id: string) {
  const map = await basePrisma.collaborationProductMap.findUnique({ where: { id }, include: { collaboration: true } });
  if (!map) throw new AppError(404, '对照记录不存在');
  assertTenantIs(tenantId, map.collaboration.tenantAId, map.collaboration.tenantBId);
  await basePrisma.collaborationProductMap.delete({ where: { id } });
  return { success: true };
}

export async function withdrawDispatch(tenantId: string, dispatchId: string) {
  const dispatch = await basePrisma.subcontractCollaborationDispatch.findUnique({ where: { id: dispatchId }, include: { transfer: true } });
  if (!dispatch) throw new AppError(404, 'Dispatch 不存在');
  assertTenantIs(tenantId, dispatch.transfer.senderTenantId);
  if (dispatch.status !== 'PENDING') throw new AppError(400, '仅待接受状态的发出可以撤回');
  await basePrisma.subcontractCollaborationDispatch.update({ where: { id: dispatchId }, data: { status: 'WITHDRAWN' } });
  const senderRecordIds = jsonToStringIds(dispatch.senderDispatchRecordIds);
  if (senderRecordIds.length > 0) await basePrisma.productionOpRecord.updateMany({ where: { id: { in: senderRecordIds } }, data: { collabData: Prisma.DbNull } });
  const remaining = await basePrisma.subcontractCollaborationDispatch.count({ where: { transferId: dispatch.transferId, status: { notIn: ['WITHDRAWN'] } } });
  if (remaining === 0) await basePrisma.interTenantSubcontractTransfer.update({ where: { id: dispatch.transferId }, data: { status: 'CANCELLED' } });
  return { success: true };
}

export async function withdrawReturn(tenantId: string, returnId: string) {
  const ret = await basePrisma.subcontractCollaborationReturn.findUnique({ where: { id: returnId }, include: { transfer: true } });
  if (!ret) throw new AppError(404, 'Return 不存在');
  assertTenantIs(tenantId, ret.transfer.receiverTenantId);
  if (ret.status !== 'PENDING_A_RECEIVE') throw new AppError(400, '仅待甲方收回状态的回传可以撤回');
  await basePrisma.subcontractCollaborationReturn.update({ where: { id: returnId }, data: { status: 'WITHDRAWN' } });
  const stockOutDocNo = (ret.payload as any)?.stockOutDocNo;
  if (stockOutDocNo) await basePrisma.productionOpRecord.deleteMany({ where: { tenantId, docNo: stockOutDocNo, type: 'STOCK_OUT', operator: '协作回传出库' } });
  return { success: true };
}

export async function withdrawForward(tenantId: string, transferId: string) {
  const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id: transferId }, include: { dispatches: true } });
  if (!transfer) throw new AppError(404, '主单不存在');
  if (!transfer.parentTransferId) throw new AppError(400, '该单不是转发产生的，无法撤回转发');
  if (transfer.originConfirmedAt) throw new AppError(400, '甲方已确认该转发，无法撤回');
  const parentTransfer = await basePrisma.interTenantSubcontractTransfer.findUnique({ where: { id: transfer.parentTransferId }, include: { dispatches: true } });
  if (!parentTransfer) throw new AppError(404, '上游主单不存在');
  assertTenantIs(tenantId, parentTransfer.receiverTenantId);
  const pendingDispatches = transfer.dispatches.filter(d => d.status === 'PENDING');
  if (pendingDispatches.length !== transfer.dispatches.length) throw new AppError(400, '下游已接受部分发出，无法撤回');
  for (const d of pendingDispatches) await basePrisma.subcontractCollaborationDispatch.update({ where: { id: d.id }, data: { status: 'WITHDRAWN' } });
  await basePrisma.interTenantSubcontractTransfer.update({ where: { id: transferId }, data: { status: 'CANCELLED' } });
  for (const d of parentTransfer.dispatches.filter(d => d.status === 'FORWARDED')) await basePrisma.subcontractCollaborationDispatch.update({ where: { id: d.id }, data: { status: 'ACCEPTED' } });
  await basePrisma.interTenantSubcontractTransfer.update({ where: { id: parentTransfer.id }, data: { status: 'OPEN' } });
  const stockOutDocNo = (pendingDispatches[0]?.payload as any)?.stockOutDocNo;
  if (stockOutDocNo) await basePrisma.productionOpRecord.deleteMany({ where: { tenantId, docNo: stockOutDocNo, type: 'STOCK_OUT', operator: '协作转发出库' } });
  return { success: true };
}

export async function deleteDispatch(tenantId: string, dispatchId: string) {
  const dispatch = await basePrisma.subcontractCollaborationDispatch.findUnique({ where: { id: dispatchId }, include: { transfer: true } });
  if (!dispatch) throw new AppError(404, 'Dispatch 不存在');
  assertTenantIs(tenantId, dispatch.transfer.senderTenantId);
  if (dispatch.status !== 'WITHDRAWN') throw new AppError(400, '仅已撤回的发出可以删除');
  await basePrisma.subcontractCollaborationDispatch.delete({ where: { id: dispatchId } });
  const remaining = await basePrisma.subcontractCollaborationDispatch.count({ where: { transferId: dispatch.transferId } });
  if (remaining === 0) await basePrisma.interTenantSubcontractTransfer.delete({ where: { id: dispatch.transferId } });
  return { success: true };
}

export async function deleteReturn(tenantId: string, returnId: string) {
  const ret = await basePrisma.subcontractCollaborationReturn.findUnique({ where: { id: returnId }, include: { transfer: true } });
  if (!ret) throw new AppError(404, 'Return 不存在');
  assertTenantIs(tenantId, ret.transfer.receiverTenantId);
  if (ret.status !== 'WITHDRAWN') throw new AppError(400, '仅已撤回的回传可以删除');
  await basePrisma.subcontractCollaborationReturn.delete({ where: { id: returnId } });
  return { success: true };
}

// ── Dispatch edit-sync (1a: PENDING direct update, 1b: ACCEPTED amendment) ──

export async function updateDispatchPayload(tenantId: string, dispatchId: string, body: { recordIds: string[] }) {
  if (!body.recordIds?.length) throw new AppError(400, '请提供新的记录 ID 列表');
  const dispatch = await basePrisma.subcontractCollaborationDispatch.findUnique({ where: { id: dispatchId }, include: { transfer: true } });
  if (!dispatch) throw new AppError(404, 'Dispatch 不存在');
  assertTenantIs(tenantId, dispatch.transfer.senderTenantId);
  if (dispatch.status !== 'PENDING') throw new AppError(400, '仅待接受状态的发出可以直接更新');

  const oldRecordIds = jsonToStringIds(dispatch.senderDispatchRecordIds);
  if (oldRecordIds.length > 0) {
    await basePrisma.productionOpRecord.updateMany({ where: { id: { in: oldRecordIds } }, data: { collabData: Prisma.DbNull } });
  }

  const records = await basePrisma.productionOpRecord.findMany({ where: { id: { in: body.recordIds }, tenantId, type: 'OUTSOURCE' } });
  if (records.length !== body.recordIds.length) throw new AppError(400, `部分记录不存在（找到 ${records.length}/${body.recordIds.length}）`);

  const aLinkMode = await getProductionLinkMode(tenantId);
  const productIds = [...new Set(records.map(r => r.productId))];
  const products = await basePrisma.product.findMany({ where: { id: { in: productIds } }, include: { variants: true, category: true } });
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
  const dictById = Object.fromEntries(dictItems.map(d => [d.id, d.name]));

  const firstProduct = productMap[records[0].productId];
  if (!firstProduct) throw new AppError(400, '关联产品不存在');
  const payload = buildDispatchPayload(firstProduct, records, aLinkMode, dictById);

  await basePrisma.subcontractCollaborationDispatch.update({
    where: { id: dispatchId },
    data: { payload: payload as Prisma.InputJsonValue, senderDispatchRecordIds: body.recordIds },
  });
  for (const r of records) {
    await basePrisma.productionOpRecord.update({ where: { id: r.id }, data: { collabData: { transferId: dispatch.transferId, dispatchId } } });
  }
  return { success: true };
}

export async function amendDispatch(tenantId: string, dispatchId: string, body: { recordIds: string[]; note?: string }) {
  if (!body.recordIds?.length) throw new AppError(400, '请提供新的记录 ID 列表');
  const dispatch = await basePrisma.subcontractCollaborationDispatch.findUnique({ where: { id: dispatchId }, include: { transfer: true } });
  if (!dispatch) throw new AppError(404, 'Dispatch 不存在');
  assertTenantIs(tenantId, dispatch.transfer.senderTenantId);
  if (dispatch.status !== 'ACCEPTED' && dispatch.status !== 'FORWARDED') throw new AppError(400, '仅已接受/已转发状态的发出可以发起修订');

  const records = await basePrisma.productionOpRecord.findMany({ where: { id: { in: body.recordIds }, tenantId, type: 'OUTSOURCE' } });
  if (records.length !== body.recordIds.length) throw new AppError(400, `部分记录不存在（找到 ${records.length}/${body.recordIds.length}）`);

  const aLinkMode = await getProductionLinkMode(tenantId);
  const productIds = [...new Set(records.map(r => r.productId))];
  const products = await basePrisma.product.findMany({ where: { id: { in: productIds } }, include: { variants: true, category: true } });
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
  const dictById = Object.fromEntries(dictItems.map(d => [d.id, d.name]));

  const firstProduct = productMap[records[0].productId];
  if (!firstProduct) throw new AppError(400, '关联产品不存在');
  const amendmentPayload = buildDispatchPayload(firstProduct, records, aLinkMode, dictById);

  const oldRecordIds = jsonToStringIds(dispatch.senderDispatchRecordIds);
  if (oldRecordIds.length > 0) {
    await basePrisma.productionOpRecord.updateMany({ where: { id: { in: oldRecordIds } }, data: { collabData: Prisma.DbNull } });
  }

  await basePrisma.subcontractCollaborationDispatch.update({
    where: { id: dispatchId },
    data: {
      amendmentPayload: amendmentPayload as Prisma.InputJsonValue,
      amendmentSenderRecordIds: body.recordIds,
      amendmentStatus: 'PENDING_B_CONFIRM',
      amendmentNote: body.note ?? null,
      senderDispatchRecordIds: body.recordIds,
    },
  });

  for (const r of records) {
    await basePrisma.productionOpRecord.update({ where: { id: r.id }, data: { collabData: { transferId: dispatch.transferId, dispatchId } } });
  }
  return { success: true };
}

export async function confirmDispatchAmendment(tenantId: string, dispatchId: string) {
  const dispatch = await basePrisma.subcontractCollaborationDispatch.findUnique({ where: { id: dispatchId }, include: { transfer: true } });
  if (!dispatch) throw new AppError(404, 'Dispatch 不存在');
  assertTenantIs(tenantId, dispatch.transfer.receiverTenantId);
  if (dispatch.amendmentStatus !== 'PENDING_B_CONFIRM') throw new AppError(400, '该发出没有待确认的修订');

  const newPayload = dispatch.amendmentPayload as any;
  const newSenderRecordIds = dispatch.amendmentSenderRecordIds as string[] ?? [];

  await basePrisma.subcontractCollaborationDispatch.update({
    where: { id: dispatchId },
    data: {
      payload: newPayload as Prisma.InputJsonValue,
      senderDispatchRecordIds: newSenderRecordIds,
      amendmentPayload: Prisma.DbNull,
      amendmentSenderRecordIds: Prisma.DbNull,
      amendmentStatus: null,
      amendmentNote: null,
    },
  });

  let updatedOrderId: string | null = null;
  let orderItemsChanged = false;
  let quantityWarning: string | null = null;

  if (dispatch.receiverProductionOrderId && newPayload?.items) {
    const orderId = dispatch.receiverProductionOrderId;
    updatedOrderId = orderId;

    const transfer = dispatch.transfer;
    const receiverProductId = transfer.receiverProductId;
    if (receiverProductId) {
      // Delete ALL order items for this order, then rebuild from every dispatch's current payload.
      // This handles legacy items that lack sourceDispatchId (created before the field existed).
      await basePrisma.orderItem.deleteMany({ where: { productionOrderId: orderId } });

      const allDispatches = await basePrisma.subcontractCollaborationDispatch.findMany({
        where: { receiverProductionOrderId: orderId, status: { in: ['ACCEPTED', 'FORWARDED'] } },
      });
      for (const d of allDispatches) {
        const payload = d.payload as any;
        const items = payload?.items ?? [];
        if (items.length > 0) {
          await createOrderItemsWithSource(orderId, tenantId, receiverProductId, items, d.id);
        }
      }
      orderItemsChanged = true;

      const order = await basePrisma.productionOrder.findUnique({ where: { id: orderId }, include: { milestones: true } });
      if (order?.milestones) {
        for (const ms of order.milestones) {
          const completed = Number(ms.completedQuantity);
          const allItems = await basePrisma.orderItem.findMany({ where: { productionOrderId: orderId } });
          const totalPlanned = allItems.reduce((s, i) => s + Number(i.quantity), 0);
          if (completed > totalPlanned && totalPlanned > 0) {
            quantityWarning = `工单 ${order.orderNumber} 的工序「${ms.name}」已完成 ${completed}，但修订后计划量仅 ${totalPlanned}`;
            break;
          }
        }
      }
    }
  }

  return { success: true, updatedOrderId, orderItemsChanged, quantityWarning };
}

export async function rejectDispatchAmendment(tenantId: string, dispatchId: string) {
  const dispatch = await basePrisma.subcontractCollaborationDispatch.findUnique({ where: { id: dispatchId }, include: { transfer: true } });
  if (!dispatch) throw new AppError(404, 'Dispatch 不存在');
  assertTenantIs(tenantId, dispatch.transfer.receiverTenantId);
  if (dispatch.amendmentStatus !== 'PENDING_B_CONFIRM') throw new AppError(400, '该发出没有待确认的修订');

  await basePrisma.subcontractCollaborationDispatch.update({
    where: { id: dispatchId },
    data: { amendmentPayload: Prisma.DbNull, amendmentSenderRecordIds: Prisma.DbNull, amendmentStatus: null, amendmentNote: null },
  });
  return { success: true };
}

// ── Return edit-sync (2a: PENDING_A_RECEIVE direct update, 2b: A_RECEIVED amendment) ──

export async function updateReturnPayload(tenantId: string, returnId: string, body: { items: any[]; note?: string; warehouseId?: string }) {
  if (!Array.isArray(body.items) || body.items.length === 0) throw new AppError(400, '请提供回传明细');
  const ret = await basePrisma.subcontractCollaborationReturn.findUnique({ where: { id: returnId }, include: { transfer: { include: { dispatches: true } } } });
  if (!ret) throw new AppError(404, 'Return 不存在');
  assertTenantIs(tenantId, ret.transfer.receiverTenantId);
  if (ret.status !== 'PENDING_A_RECEIVE') throw new AppError(400, '仅待甲方收回状态的回传可以直接更新');
  await assertReceiverPartnerBindingForReturn(tenantId, ret.transfer.senderTenantId);

  const oldPayload = ret.payload as any;
  const oldStockOutDocNo = oldPayload?.stockOutDocNo;
  if (oldStockOutDocNo) {
    await basePrisma.productionOpRecord.deleteMany({ where: { tenantId, docNo: oldStockOutDocNo, type: 'STOCK_OUT', operator: '协作回传出库' } });
  }

  const cleanItems = body.items.filter((i: any) => (Number(i.quantity) || 0) > 0);
  const partnerName = await getSenderPartnerName(tenantId, ret.transfer.senderTenantId);
  const stockOutDocNo =
    oldStockOutDocNo && HC_DOCNO_REGEX.test(String(oldStockOutDocNo))
      ? String(oldStockOutDocNo)
      : await generateReturnFlowDocNo(tenantId, partnerName);
  const receiverProductId = ret.transfer.receiverProductId;

  if (receiverProductId) {
    const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
    const dictByName = new Map(dictItems.map(d => [`${d.type}:${d.name}`, d.id]));
    const variants = await basePrisma.productVariant.findMany({ where: { productId: receiverProductId } });
    const orderIds = ret.transfer.dispatches.map(d => d.receiverProductionOrderId).filter((v): v is string => !!v);
    const firstOrderId = orderIds[0] ?? null;

    for (const item of cleanItems) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const cn = normalizeSpecLabel(item.colorName);
      const sn = normalizeSpecLabel(item.sizeName);
      let variantId: string | null = null;
      if (cn || sn) {
        const colorId = cn ? dictByName.get(`color:${cn}`) ?? null : null;
        const sizeId = sn ? dictByName.get(`size:${sn}`) ?? null : null;
        variantId = variants.find(v => (colorId ? v.colorId === colorId : !v.colorId) && (sizeId ? v.sizeId === sizeId : !v.sizeId))?.id ?? null;
      }
      await basePrisma.productionOpRecord.create({ data: { id: genId('prodop'), tenantId, type: 'STOCK_OUT', productId: receiverProductId, variantId, orderId: firstOrderId, quantity: qty, operator: '协作回传出库', timestamp: new Date(), status: '已完成', warehouseId: body.warehouseId ?? null, docNo: stockOutDocNo, partner: partnerName || null, collabData: { source: 'collaborationReturn', returnId, transferId: ret.transferId } } });
    }
  }

  const newPayload = {
    items: cleanItems,
    note: body.note !== undefined ? body.note : oldPayload?.note,
    stockOutDocNo,
    warehouseId: body.warehouseId !== undefined ? body.warehouseId : oldPayload?.warehouseId,
  };
  await basePrisma.subcontractCollaborationReturn.update({ where: { id: returnId }, data: { payload: newPayload as Prisma.InputJsonValue } });
  return { success: true };
}

export async function amendReturn(tenantId: string, returnId: string, body: { items: any[]; note?: string }) {
  if (!Array.isArray(body.items) || body.items.length === 0) throw new AppError(400, '请提供修订明细');
  const ret = await basePrisma.subcontractCollaborationReturn.findUnique({ where: { id: returnId }, include: { transfer: true } });
  if (!ret) throw new AppError(404, 'Return 不存在');
  assertTenantIs(tenantId, ret.transfer.receiverTenantId);
  if (ret.status !== 'A_RECEIVED') throw new AppError(400, '仅已收回状态的回传可以发起修订');
  if (ret.amendmentStatus === 'PENDING_A_CONFIRM') throw new AppError(400, '已有待确认的修订，请等待甲方处理');

  const cleanItems = body.items.filter((i: any) => (Number(i.quantity) || 0) > 0);
  await basePrisma.subcontractCollaborationReturn.update({
    where: { id: returnId },
    data: {
      amendmentPayload: { items: cleanItems, note: body.note } as Prisma.InputJsonValue,
      amendmentStatus: 'PENDING_A_CONFIRM',
      amendmentNote: body.note ?? null,
    },
  });
  return { success: true };
}

export async function confirmReturnAmendment(tenantId: string, returnId: string) {
  const ret = await basePrisma.subcontractCollaborationReturn.findUnique({
    where: { id: returnId },
    include: { transfer: { include: { dispatches: true } } },
  });
  if (!ret) throw new AppError(404, 'Return 不存在');
  assertTenantIs(tenantId, ret.transfer.senderTenantId);
  if (ret.amendmentStatus !== 'PENDING_A_CONFIRM') throw new AppError(400, '该回传没有待确认的修订');

  const oldPayload = ret.payload as any;
  const receiptDocNo = oldPayload?.receiptDocNo;
  const amendPayload = ret.amendmentPayload as any;
  const newItems: any[] = amendPayload?.items ?? [];

  // Collect nodeId/orderId/variantId/partner from existing receipt records before deleting them.
  // These are authoritative for the sender side and independent of colorName/sizeName matching.
  let oldRecordsByVariant = new Map<string, { nodeId: string | null; orderId: string | null; variantId: string | null }>();
  let localPartnerName = '';
  if (receiptDocNo) {
    const oldRecords = await basePrisma.productionOpRecord.findMany({ where: { tenantId, docNo: receiptDocNo, type: 'OUTSOURCE', status: '已收回' } });
    for (const rec of oldRecords) {
      const vk = rec.variantId ?? '__none';
      if (!oldRecordsByVariant.has(vk)) oldRecordsByVariant.set(vk, { nodeId: rec.nodeId, orderId: rec.orderId, variantId: rec.variantId });
      if (!localPartnerName && rec.partner) localPartnerName = rec.partner;
      await removeOutsourceProgress({ orderId: rec.orderId, productId: rec.productId, nodeId: rec.nodeId, docNo: rec.docNo, variantId: rec.variantId });
    }
    await basePrisma.productionOpRecord.deleteMany({ where: { tenantId, docNo: receiptDocNo, type: 'OUTSOURCE', status: '已收回' } });
  }

  const transfer = ret.transfer;
  const dispatchLookup = new Map<string, { nodeId: string | null; variantId: string | null }>();
  const allSenderRecordIds: string[] = [];
  for (const d of transfer.dispatches) {
    if (d.status !== 'ACCEPTED' && d.status !== 'FORWARDED') continue;
    for (const item of ((d.payload as any)?.items ?? []) as any[]) {
      const key = collabVariantKey(item);
      if (!dispatchLookup.has(key)) dispatchLookup.set(key, { nodeId: item.nodeId ?? null, variantId: item.variantId ?? null });
    }
    allSenderRecordIds.push(...((d.senderDispatchRecordIds as string[]) ?? []));
  }

  let orderIdByVariant = new Map<string, string>();
  if (allSenderRecordIds.length > 0) {
    const origRecs = await basePrisma.productionOpRecord.findMany({ where: { id: { in: allSenderRecordIds } }, select: { orderId: true, variantId: true, partner: true } });
    for (const r of origRecs) {
      if (r.orderId && r.variantId && !orderIdByVariant.has(r.variantId)) orderIdByVariant.set(r.variantId, r.orderId);
      if (!localPartnerName && r.partner) localPartnerName = r.partner;
    }
  }
  if (!localPartnerName) {
    const partnerRow = await basePrisma.partner.findFirst({ where: { tenantId, collaborationTenantId: transfer.receiverTenantId }, select: { name: true } });
    localPartnerName = partnerRow?.name ?? (await basePrisma.tenant.findUnique({ where: { id: transfer.receiverTenantId }, select: { name: true } }))?.name ?? '';
  }

  const finalReceiptDocNo = receiptDocNo ?? await nextOutsourceDocNoForPartner(tenantId, 'receive', localPartnerName);
  for (const item of newItems) {
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const key = collabVariantKey(item);
    const dInfo = dispatchLookup.get(key);
    let variantId = dInfo?.variantId ?? null;
    let orderId = (variantId && orderIdByVariant.get(variantId)) ?? null;
    let nodeId = dInfo?.nodeId ?? null;

    // Prefer data from old receipt records — avoids mismatches when colorName/sizeName
    // differs between sender and receiver dictionaries or is absent in amendment items.
    const vk = variantId ?? '__none';
    const oldRec = oldRecordsByVariant.get(vk);
    if (oldRec) {
      if (!nodeId) nodeId = oldRec.nodeId;
      if (!orderId) orderId = oldRec.orderId;
      if (!variantId) variantId = oldRec.variantId;
    }
    // Last resort: if still no nodeId, inherit from any old record (single-variant products)
    if (!nodeId && oldRecordsByVariant.size > 0) {
      const fallback = oldRecordsByVariant.values().next().value;
      if (fallback) { nodeId = fallback.nodeId; if (!orderId) orderId = fallback.orderId; if (!variantId) variantId = fallback.variantId; }
    }

    const data = { id: genId('prodop'), tenantId, type: 'OUTSOURCE', productId: transfer.senderProductId, variantId, quantity: qty, operator: '协作回收', timestamp: new Date(), status: '已收回', partner: localPartnerName, nodeId, orderId, docNo: finalReceiptDocNo, collabData: { source: 'collaborationReturn', returnId: ret.id, transferId: transfer.id } };
    await basePrisma.productionOpRecord.create({ data });
    await applyOutsourceProgress({ ...data, tenantId });
  }

  const updatedPayload = { ...oldPayload, items: newItems, note: amendPayload?.note ?? oldPayload?.note, receiptDocNo: finalReceiptDocNo };
  await basePrisma.subcontractCollaborationReturn.update({
    where: { id: returnId },
    data: {
      payload: updatedPayload as Prisma.InputJsonValue,
      amendmentPayload: Prisma.DbNull,
      amendmentStatus: null,
      amendmentNote: null,
    },
  });

  return { success: true, receiptDocNo: finalReceiptDocNo };
}

export async function rejectReturnAmendment(tenantId: string, returnId: string) {
  const ret = await basePrisma.subcontractCollaborationReturn.findUnique({ where: { id: returnId }, include: { transfer: true } });
  if (!ret) throw new AppError(404, 'Return 不存在');
  assertTenantIs(tenantId, ret.transfer.senderTenantId);
  if (ret.amendmentStatus !== 'PENDING_A_CONFIRM') throw new AppError(400, '该回传没有待确认的修订');

  await basePrisma.subcontractCollaborationReturn.update({
    where: { id: returnId },
    data: { amendmentPayload: Prisma.DbNull, amendmentStatus: null, amendmentNote: null },
  });
  return { success: true };
}

// ── helper: createOrderItems with sourceDispatchId ──

async function createOrderItemsWithSource(orderId: string, tenantId: string, productId: string, items: any[], sourceDispatchId: string) {
  const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
  const dictByName = new Map(dictItems.map(d => [`${d.type}:${d.name}`, d.id]));
  const variants = await basePrisma.productVariant.findMany({ where: { productId } });
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) continue;
    let variantId: string | null = null;
    const itemColor = normalizeSpecLabel(item.colorName);
    const itemSize = normalizeSpecLabel(item.sizeName);
    if (itemColor || itemSize) {
      const colorId = itemColor ? dictByName.get(`color:${itemColor}`) ?? null : null;
      const sizeId = itemSize ? dictByName.get(`size:${itemSize}`) ?? null : null;
      variantId = variants.find(v => (colorId ? v.colorId === colorId : !v.colorId) && (sizeId ? v.sizeId === sizeId : !v.sizeId))?.id ?? null;
    }
    await basePrisma.orderItem.create({ data: { productionOrderId: orderId, variantId, quantity: item.quantity, sourceDispatchId } });
  }
}

// ── helper: removeOutsourceProgress (re-export for use in amendment) ──

async function removeOutsourceProgress(record: { orderId: string | null; productId?: string | null; nodeId: string | null; docNo?: string | null; variantId?: string | null }) {
  if (!record.docNo) return;
  if (record.orderId && record.nodeId) {
    const milestone = await basePrisma.milestone.findFirst({ where: { productionOrderId: record.orderId, templateId: record.nodeId } });
    if (!milestone) return;
    const reports = await basePrisma.milestoneReport.findMany({ where: { milestoneId: milestone.id, reportNo: record.docNo } });
    if (reports.length === 0) return;
    const totalQty = reports.reduce((s, r) => s + Number(r.quantity), 0);
    await basePrisma.$transaction([
      basePrisma.milestoneReport.deleteMany({ where: { milestoneId: milestone.id, reportNo: record.docNo } }),
      basePrisma.milestone.update({ where: { id: milestone.id }, data: { completedQuantity: Math.max(0, Number(milestone.completedQuantity) - totalQty) } }),
    ]);
    return;
  }
  if (record.productId && record.nodeId) {
    const vid = record.variantId || undefined;
    const pmps: any[] = await basePrisma.productMilestoneProgress.findMany({
      where: { productId: record.productId, milestoneTemplateId: record.nodeId!, ...(vid ? { variantId: vid } : {}) },
      include: { reports: { where: { reportNo: record.docNo } } },
    });
    for (const pmp of pmps) {
      if (!pmp.reports?.length) continue;
      const totalQty = pmp.reports.reduce((s: number, r: any) => s + Number(r.quantity), 0);
      await basePrisma.$transaction([
        basePrisma.productProgressReport.deleteMany({ where: { progressId: pmp.id, reportNo: record.docNo } }),
        basePrisma.productMilestoneProgress.update({ where: { id: pmp.id }, data: { completedQuantity: Math.max(0, Number(pmp.completedQuantity) - totalQty) } }),
      ]);
    }
  }
}
