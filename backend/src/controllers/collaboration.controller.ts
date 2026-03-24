import type { Request, Response, NextFunction } from 'express';
import { prisma as basePrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import { genId } from '../utils/genId.js';
import { getNextWorkOrderNumber, generateDocNo } from '../utils/docNumber.js';
import { applyOutsourceProgress } from './production.controller.js';

// ── helpers ──

function assertTenantIs(tenantId: string, ...allowed: (string | null | undefined)[]) {
  if (!allowed.includes(tenantId)) {
    const err: any = new Error('无权操作此协作记录');
    err.statusCode = 403;
    throw err;
  }
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

/** 仅统计已接受的发出批次（乙方实际可回传上限） */
function aggregateDispatchedByVariant(
  dispatches: { status: string; payload: unknown }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of dispatches) {
    if (d.status !== 'ACCEPTED') continue;
    const dItems = (d.payload as any)?.items ?? [];
    for (const it of dItems) {
      const k = collabVariantKey(it);
      map.set(k, (map.get(k) || 0) + (Number(it.quantity) || 0));
    }
  }
  return map;
}

function aggregateReturnedByVariant(returns: { payload: unknown }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of returns) {
    const rItems = (r.payload as any)?.items ?? [];
    for (const it of rItems) {
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

  let newStatus = transfer.status;
  if (totalReceivedByA > 0 && totalReceivedByA >= totalDispatched) {
    newStatus = 'CLOSED';
  } else if (totalReceivedByA > 0) {
    newStatus = 'PARTIALLY_RECEIVED';
  }

  if (newStatus !== transfer.status) {
    await basePrisma.interTenantSubcontractTransfer.update({
      where: { id: transferId },
      data: { status: newStatus },
    });
  }
}

// ── 1. 租户互信 ──

export async function createCollaboration(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const { inviteCode } = req.body;
    if (!inviteCode) { res.status(400).json({ error: '请提供对方企业邀请码' }); return; }

    const target = await basePrisma.tenant.findUnique({ where: { inviteCode } });
    if (!target) { res.status(404).json({ error: '邀请码无效' }); return; }
    if (target.id === tenantId) { res.status(400).json({ error: '不能与自己建立协作' }); return; }

    const [a, b] = [tenantId, target.id].sort();
    const existing = await basePrisma.tenantCollaboration.findUnique({
      where: { tenantAId_tenantBId: { tenantAId: a, tenantBId: b } },
    });
    if (existing) {
      if (existing.status === 'ACTIVE') { res.json(existing); return; }
      const updated = await basePrisma.tenantCollaboration.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE' },
      });
      res.json(updated);
      return;
    }

    const collab = await basePrisma.tenantCollaboration.create({
      data: { tenantAId: a, tenantBId: b, status: 'ACTIVE', invitedByUserId: req.user?.userId },
    });
    res.status(201).json(collab);
  } catch (e) { next(e); }
}

export async function listCollaborations(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const rows = await basePrisma.tenantCollaboration.findMany({
      where: { OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }] },
      orderBy: { createdAt: 'desc' },
    });

    const tenantIds = new Set<string>();
    for (const r of rows) { tenantIds.add(r.tenantAId); tenantIds.add(r.tenantBId); }
    tenantIds.delete(tenantId);

    const tenants = await basePrisma.tenant.findMany({
      where: { id: { in: [...tenantIds] } },
      select: { id: true, name: true },
    });
    const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

    const result = rows.map(r => {
      const otherId = r.tenantAId === tenantId ? r.tenantBId : r.tenantAId;
      return { ...r, otherTenantId: otherId, otherTenantName: tenantMap[otherId] ?? '未知' };
    });

    res.json(result);
  } catch (e) { next(e); }
}

// ── 2. sync-dispatch（甲方同步外协发出） ──

export async function syncDispatch(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const { recordIds, collaborationTenantId } = req.body as {
      recordIds: string[];
      collaborationTenantId: string;
    };

    if (!recordIds?.length) { res.status(400).json({ error: '请提供外协记录' }); return; }
    if (!collaborationTenantId) { res.status(400).json({ error: '请提供协作企业' }); return; }

    const collab = await findCollaboration(tenantId, collaborationTenantId);
    if (!collab) { res.status(400).json({ error: '未找到有效的企业协作关系' }); return; }

    const records = await basePrisma.productionOpRecord.findMany({
      where: { id: { in: recordIds }, tenantId, type: 'OUTSOURCE' },
    });
    if (records.length !== recordIds.length) {
      res.status(400).json({ error: `部分记录不存在或不属于当前租户（找到 ${records.length}/${recordIds.length}）` });
      return;
    }

    const aLinkMode = await getProductionLinkMode(tenantId);

    const productIds = [...new Set(records.map(r => r.productId))];
    const products = await basePrisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      include: { variants: true },
    });
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    const dictItems = await basePrisma.dictionaryItem.findMany({ where: { tenantId } });
    const dictById = Object.fromEntries(dictItems.map(d => [d.id, d.name]));

    const grouped = new Map<string, typeof records>();
    for (const r of records) {
      const list = grouped.get(r.productId) ?? [];
      list.push(r);
      grouped.set(r.productId, list);
    }

    const dispatches: any[] = [];

    for (const [productId, recs] of grouped) {
      const product = productMap[productId];
      if (!product) continue;

      let transfer = await basePrisma.interTenantSubcontractTransfer.findFirst({
        where: {
          senderTenantId: tenantId,
          receiverTenantId: collaborationTenantId,
          senderProductId: productId,
          status: { not: 'CLOSED' },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!transfer) {
        transfer = await basePrisma.interTenantSubcontractTransfer.create({
          data: {
            collaborationId: collab.id,
            senderTenantId: tenantId,
            receiverTenantId: collaborationTenantId,
            senderProductId: productId,
            senderProductSku: product.sku,
            senderProductName: product.name,
            aLinkMode,
          },
        });
      }

      const payload = buildDispatchPayload(product, recs, aLinkMode, dictById);
      const dispatch = await basePrisma.subcontractCollaborationDispatch.create({
        data: {
          transferId: transfer.id,
          payload,
          senderDispatchRecordIds: recs.map(r => r.id),
        },
      });

      for (const r of recs) {
        await basePrisma.productionOpRecord.update({
          where: { id: r.id },
          data: { collabData: { transferId: transfer.id, dispatchId: dispatch.id } },
        });
      }

      dispatches.push({ transferId: transfer.id, dispatchId: dispatch.id, productName: product.name });
    }

    res.status(201).json({ dispatches });
  } catch (e) { next(e); }
}

/** 去掉仅空白/空串的规格名，避免协作接收方出现「空白颜色」标签 */
function normalizeSpecLabel(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function buildDispatchPayload(product: any, records: any[], aLinkMode: string, dictById: Record<string, string>) {
  const items = records.map(r => {
    const variant = product.variants?.find((v: any) => v.id === r.variantId);
    const rawColor = variant?.colorId ? dictById[variant.colorId] : null;
    const rawSize = variant?.sizeId ? dictById[variant.sizeId] : null;
    return {
      variantId: r.variantId,
      colorName: normalizeSpecLabel(rawColor),
      sizeName: normalizeSpecLabel(rawSize),
      quantity: Number(r.quantity),
      nodeId: r.nodeId,
    };
  });

  const colorNames: string[] = [...new Set(
    (product.colorIds ?? [])
      .map((id: string) => normalizeSpecLabel(dictById[id]))
      .filter((n: string | null): n is string => n != null),
  )];
  const sizeNames: string[] = [...new Set(
    (product.sizeIds ?? [])
      .map((id: string) => normalizeSpecLabel(dictById[id]))
      .filter((n: string | null): n is string => n != null),
  )];

  return {
    productName: product.name,
    productSku: product.sku,
    description: product.description,
    imageUrl: product.imageUrl,
    colorNames,
    sizeNames,
    items,
    aLinkMode,
    senderRef: {
      productId: product.id,
      docNos: [...new Set(records.map(r => r.docNo).filter(Boolean))],
    },
  };
}

// ── helpers: 同产品多 transfer 合并 ──

const TRANSFER_STATUS_PRIORITY: Record<string, number> = {
  OPEN: 0, PARTIALLY_RECEIVED: 1, CLOSED: 2,
};

function mergeTransferStatus(statuses: string[]): string {
  if (!statuses.length) return 'OPEN';
  if (statuses.every(s => s === 'CLOSED')) return 'CLOSED';
  if (statuses.some(s => s === 'PARTIALLY_RECEIVED')) return 'PARTIALLY_RECEIVED';
  return statuses.sort((a, b) => (TRANSFER_STATUS_PRIORITY[a] ?? 9) - (TRANSFER_STATUS_PRIORITY[b] ?? 9))[0];
}

function mergeTransferGroup(group: any[]): any {
  if (group.length === 1) return group[0];
  const primary = group[0];
  const allDispatches = group.flatMap((t: any) => t.dispatches || [])
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const allReturns = group.flatMap((t: any) => t.returns || [])
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return {
    ...primary,
    dispatches: allDispatches,
    returns: allReturns,
    status: mergeTransferStatus(group.map((t: any) => t.status)),
    _transferIds: group.map((t: any) => t.id),
  };
}

// ── 3. 主单列表 + 详情 ──

export async function listTransfers(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const role = optStr(req.query.role);
    const status = optStr(req.query.status);

    const where: any = {};
    if (role === 'sender') where.senderTenantId = tenantId;
    else if (role === 'receiver') where.receiverTenantId = tenantId;
    else where.OR = [{ senderTenantId: tenantId }, { receiverTenantId: tenantId }];
    if (status) where.status = status;

    const transfers = await basePrisma.interTenantSubcontractTransfer.findMany({
      where,
      include: {
        dispatches: { orderBy: { createdAt: 'asc' } },
        returns: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const peerIds = new Set<string>();
    for (const t of transfers) {
      peerIds.add(t.senderTenantId === tenantId ? t.receiverTenantId : t.senderTenantId);
    }
    const tenants = await basePrisma.tenant.findMany({
      where: { id: { in: [...peerIds] } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

    const enriched = transfers.map(t => ({
      ...t,
      senderTenantName: t.senderTenantId === tenantId ? '本企业' : (nameMap[t.senderTenantId] ?? ''),
      receiverTenantName: t.receiverTenantId === tenantId ? '本企业' : (nameMap[t.receiverTenantId] ?? ''),
    }));

    // 按 (senderProductId + senderTenantId + receiverTenantId) 合并同产品的多条 transfer
    const groupMap = new Map<string, any[]>();
    for (const t of enriched) {
      const key = `${t.senderProductId}::${t.senderTenantId}::${t.receiverTenantId}`;
      const list = groupMap.get(key) ?? [];
      list.push(t);
      groupMap.set(key, list);
    }
    const result = [...groupMap.values()].map(mergeTransferGroup);

    res.json(result);
  } catch (e) { next(e); }
}

export async function getTransfer(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const id = str(req.params.id);
    const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({
      where: { id },
      include: {
        dispatches: { orderBy: { createdAt: 'asc' } },
        returns: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!transfer) { res.status(404).json({ error: '主单不存在' }); return; }
    assertTenantIs(tenantId, transfer.senderTenantId, transfer.receiverTenantId);

    // 查找同产品/同甲乙方的所有 transfer，合并为一个视图
    const related = await basePrisma.interTenantSubcontractTransfer.findMany({
      where: {
        senderTenantId: transfer.senderTenantId,
        receiverTenantId: transfer.receiverTenantId,
        senderProductId: transfer.senderProductId,
        id: { not: transfer.id },
      },
      include: {
        dispatches: { orderBy: { createdAt: 'asc' } },
        returns: { orderBy: { createdAt: 'asc' } },
      },
    });

    const peerIds = [transfer.senderTenantId, transfer.receiverTenantId].filter(tid => tid !== tenantId);
    const tenants = await basePrisma.tenant.findMany({
      where: { id: { in: peerIds } },
      select: { id: true, name: true },
    });
    const nameMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

    const enrich = (t: any) => ({
      ...t,
      senderTenantName: t.senderTenantId === tenantId ? '本企业' : (nameMap[t.senderTenantId] ?? ''),
      receiverTenantName: t.receiverTenantId === tenantId ? '本企业' : (nameMap[t.receiverTenantId] ?? ''),
    });

    const all = [enrich(transfer), ...related.map(enrich)];
    res.json(mergeTransferGroup(all));
  } catch (e) { next(e); }
}

// ── 4. 乙方接受 ──

export async function acceptTransfer(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const transferId = str(req.params.id);
    const {
      createProduct,
      dispatchIds,
    } = req.body as {
      createProduct?: {
        name: string;
        sku: string;
        description?: string;
        colorNames?: string[];
        sizeNames?: string[];
      };
      dispatchIds?: string[];
    };

    const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({
      where: { id: transferId },
      include: { dispatches: true },
    });
    if (!transfer) { res.status(404).json({ error: '主单不存在' }); return; }
    assertTenantIs(tenantId, transfer.receiverTenantId);

    const pendingDispatches = transfer.dispatches.filter(d => d.status === 'PENDING');
    const toAccept = dispatchIds
      ? pendingDispatches.filter(d => dispatchIds.includes(d.id))
      : pendingDispatches;

    if (!toAccept.length) { res.status(400).json({ error: '没有待接受的 Dispatch' }); return; }

    // Resolve receiver product：主单 → 对照表 → 本次新建（顺序避免多 transfer 分次接受时重复建产品）
    let finalProductId = transfer.receiverProductId;

    if (!finalProductId && transfer.senderProductSku) {
      const mapped = await basePrisma.collaborationProductMap.findUnique({
        where: {
          collaborationId_senderSku: {
            collaborationId: transfer.collaborationId,
            senderSku: transfer.senderProductSku,
          },
        },
      });
      if (mapped?.receiverProductId) finalProductId = mapped.receiverProductId;
    }

    if (!finalProductId && createProduct) {
      finalProductId = await createReceiverProduct(tenantId, createProduct);
    }

    if (!finalProductId) {
      res.status(400).json({ error: '请提供或新建乙方产品' });
      return;
    }

    // bReceiveMode follows receiver tenant's productionLinkMode config
    const effectiveMode = transfer.bReceiveMode ?? await getProductionLinkMode(tenantId);
    if (!transfer.bReceiveMode || !transfer.receiverProductId) {
      await basePrisma.interTenantSubcontractTransfer.update({
        where: { id: transferId },
        data: {
          bReceiveMode: effectiveMode,
          receiverProductId: finalProductId,
        },
      });
    }

    // Auto-remember mapping for future reference
    if (transfer.senderProductSku) {
      await basePrisma.collaborationProductMap.upsert({
        where: {
          collaborationId_senderSku: {
            collaborationId: transfer.collaborationId,
            senderSku: transfer.senderProductSku,
          },
        },
        update: { receiverProductId: finalProductId, senderProductName: transfer.senderProductName },
        create: {
          collaborationId: transfer.collaborationId,
          senderSku: transfer.senderProductSku,
          senderProductName: transfer.senderProductName,
          receiverProductId: finalProductId,
        },
      });
    }

    const displayName = transfer.senderProductName || '';
    const displaySku = transfer.senderProductSku || '';

    // Resolve milestones from product if processes are configured
    const product = await basePrisma.product.findUnique({ where: { id: finalProductId } });
    const milestoneNodeIds = (product?.milestoneNodeIds as string[]) || [];
    const nodes = milestoneNodeIds.length > 0
      ? await basePrisma.globalNodeTemplate.findMany({ where: { tenantId } })
      : [];
    const hasProcesses = milestoneNodeIds.length > 0;
    const orderStatus = hasProcesses ? 'IN_PROGRESS' : 'PENDING_PROCESS';

    // Build production orders
    const createdOrders: string[] = [];

    if (effectiveMode === 'product') {
      // Merge into one ProductionOrder
      let existingOrderId = transfer.dispatches.find(d => d.receiverProductionOrderId)?.receiverProductionOrderId;

      if (!existingOrderId) {
        const orderId = genId('ord');
        const orderNumber = await getNextWorkOrderNumber(tenantId);
        const totalItems = aggregateDispatchItems(toAccept);

        const milestones = milestoneNodeIds.map((nodeId, idx) => {
          const node = nodes.find(n => n.id === nodeId);
          return {
            id: genId('ms'),
            templateId: nodeId,
            name: node?.name || nodeId,
            status: 'PENDING',
            completedQuantity: 0,
            reportTemplate: (node as any)?.reportTemplate || [],
            weight: 1,
            assignedWorkerIds: [],
            assignedEquipmentIds: [],
            sortOrder: idx,
          };
        });

        await basePrisma.productionOrder.create({
          data: {
            id: orderId,
            tenantId,
            orderNumber,
            productId: finalProductId,
            productName: displayName,
            sku: displaySku,
            status: orderStatus,
            ...(milestones.length > 0 ? { milestones: { create: milestones } } : {}),
          },
        });

        await createOrderItems(orderId, tenantId, finalProductId, totalItems);
        existingOrderId = orderId;
        createdOrders.push(orderId);
      } else {
        const additionalItems = aggregateDispatchItems(toAccept);
        await createOrderItems(existingOrderId, tenantId, finalProductId, additionalItems);
      }

      for (const d of toAccept) {
        await basePrisma.subcontractCollaborationDispatch.update({
          where: { id: d.id },
          data: { status: 'ACCEPTED', receiverProductionOrderId: existingOrderId },
        });
      }
    } else {
      // order mode: each dispatch → one ProductionOrder
      for (const d of toAccept) {
        const orderId = genId('ord');
        const orderNumber = await getNextWorkOrderNumber(tenantId);
        const items = (d.payload as any)?.items ?? [];

        const milestones = milestoneNodeIds.map((nodeId, idx) => {
          const node = nodes.find(n => n.id === nodeId);
          return {
            id: genId('ms'),
            templateId: nodeId,
            name: node?.name || nodeId,
            status: 'PENDING',
            completedQuantity: 0,
            reportTemplate: (node as any)?.reportTemplate || [],
            weight: 1,
            assignedWorkerIds: [],
            assignedEquipmentIds: [],
            sortOrder: idx,
          };
        });

        await basePrisma.productionOrder.create({
          data: {
            id: orderId,
            tenantId,
            orderNumber,
            productId: finalProductId,
            productName: displayName,
            sku: displaySku,
            status: orderStatus,
            ...(milestones.length > 0 ? { milestones: { create: milestones } } : {}),
          },
        });

        await createOrderItems(orderId, tenantId, finalProductId, items);

        await basePrisma.subcontractCollaborationDispatch.update({
          where: { id: d.id },
          data: { status: 'ACCEPTED', receiverProductionOrderId: orderId },
        });

        createdOrders.push(orderId);
      }
    }

    res.json({
      accepted: toAccept.length,
      bReceiveMode: effectiveMode,
      receiverProductId: finalProductId,
      createdOrders,
      pendingProcess: !hasProcesses,
    });
  } catch (e) { next(e); }
}

function dedupeTrimmedNames(names?: string[]): string[] {
  if (!names?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const t = normalizeSpecLabel(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function createReceiverProduct(
  tenantId: string,
  cp: { name: string; sku: string; description?: string; colorNames?: string[]; sizeNames?: string[] },
): Promise<string> {
  const productId = genId('prod');

  const colorNamesIn = dedupeTrimmedNames(cp.colorNames);
  const sizeNamesIn = dedupeTrimmedNames(cp.sizeNames);

  const colorIds: string[] = [];
  for (const name of colorNamesIn) {
    const id = await ensureDictionaryItem(tenantId, 'color', name);
    colorIds.push(id);
  }

  const sizeIds: string[] = [];
  for (const name of sizeNamesIn) {
    const id = await ensureDictionaryItem(tenantId, 'size', name);
    sizeIds.push(id);
  }

  await basePrisma.product.create({
    data: {
      id: productId,
      tenantId,
      sku: cp.sku,
      name: cp.name,
      description: cp.description,
      colorIds,
      sizeIds,
    },
  });

  if (colorIds.length || sizeIds.length) {
    const colors = colorIds.length ? colorIds : [null];
    const sizes = sizeIds.length ? sizeIds : [null];

    for (const colorId of colors) {
      for (const sizeId of sizes) {
        await basePrisma.productVariant.create({
          data: {
            id: genId('pv'),
            productId,
            colorId,
            sizeId,
          },
        });
      }
    }
  }

  return productId;
}

async function ensureDictionaryItem(tenantId: string, type: string, name: string): Promise<string> {
  const trimmed = normalizeSpecLabel(name);
  if (!trimmed) {
    const err: any = new Error('颜色/尺码名称不能为空');
    err.statusCode = 400;
    throw err;
  }
  const existing = await basePrisma.dictionaryItem.findFirst({
    where: { tenantId, type, name: trimmed },
  });
  if (existing) return existing.id;

  const id = genId('dict');
  await basePrisma.dictionaryItem.create({
    data: { id, tenantId, type, name: trimmed, value: trimmed },
  });
  return id;
}

function aggregateDispatchItems(dispatches: any[]): any[] {
  const map = new Map<string, any>();
  for (const d of dispatches) {
    const items = (d.payload as any)?.items ?? [];
    for (const item of items) {
      const cn = normalizeSpecLabel(item.colorName);
      const sn = normalizeSpecLabel(item.sizeName);
      const key = `${cn ?? ''}_${sn ?? ''}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += Number(item.quantity) || 0;
      } else {
        map.set(key, { ...item, colorName: cn, sizeName: sn, quantity: Number(item.quantity) || 0 });
      }
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
    const itemColor = normalizeSpecLabel(item.colorName);
    const itemSize = normalizeSpecLabel(item.sizeName);
    if (itemColor || itemSize) {
      const colorId = itemColor ? dictByName.get(`color:${itemColor}`) ?? null : null;
      const sizeId = itemSize ? dictByName.get(`size:${itemSize}`) ?? null : null;
      const match = variants.find(v =>
        (colorId ? v.colorId === colorId : !v.colorId) &&
        (sizeId ? v.sizeId === sizeId : !v.sizeId),
      );
      variantId = match?.id ?? null;
    }

    await basePrisma.orderItem.create({
      data: {
        productionOrderId: orderId,
        variantId,
        quantity: item.quantity,
      },
    });
  }
}

// ── 5. 乙方回传 ──

export async function createReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const transferId = str(req.params.id);
    const { items, note, dispatchId, receiverProductionOrderId, warehouseId } = req.body as {
      items: { colorName?: string | null; sizeName?: string | null; quantity: number }[];
      note?: string;
      dispatchId?: string;
      receiverProductionOrderId?: string;
      warehouseId?: string;
    };

    if (!items?.length) { res.status(400).json({ error: '请提供回传明细' }); return; }

    const cleanItems = items.filter(i => (Number(i.quantity) || 0) > 0);
    if (!cleanItems.length) { res.status(400).json({ error: '回传数量须大于 0' }); return; }

    const transfer = await basePrisma.interTenantSubcontractTransfer.findUnique({
      where: { id: transferId },
      include: { dispatches: true, returns: true },
    });
    if (!transfer) { res.status(404).json({ error: '主单不存在' }); return; }
    assertTenantIs(tenantId, transfer.receiverTenantId);

    const dispatchedByVar = aggregateDispatchedByVariant(transfer.dispatches);
    const returnedByVar = aggregateReturnedByVariant(transfer.returns);

    const totalDispatchedAccepted = [...dispatchedByVar.values()].reduce((a, b) => a + b, 0);
    const alreadyReturnedTotal = [...returnedByVar.values()].reduce((a, b) => a + b, 0);
    const thisReturn = cleanItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

    if (totalDispatchedAccepted <= 0) {
      res.status(400).json({ error: '没有已接受的发出批次，无法回传' });
      return;
    }

    for (const it of cleanItems) {
      const q = Number(it.quantity) || 0;
      const k = collabVariantKey(it);
      const cap = dispatchedByVar.get(k) ?? 0;
      if (cap <= 0) {
        res.status(400).json({
          error: `规格「${[it.colorName, it.sizeName].filter(Boolean).join('/') || '无规格'}」不在已发出明细中`,
        });
        return;
      }
      const already = returnedByVar.get(k) ?? 0;
      if (already + q > cap) {
        res.status(400).json({
          error: `规格「${[it.colorName, it.sizeName].filter(Boolean).join('/') || '无规格'}」回传超限：已回 ${already}，本次 ${q}，可回上限 ${cap}`,
        });
        return;
      }
    }

    if (alreadyReturnedTotal + thisReturn > totalDispatchedAccepted) {
      res.status(400).json({
        error: `回传数量超限：已回传 ${alreadyReturnedTotal} + 本次 ${thisReturn} > 已接受发出总量 ${totalDispatchedAccepted}`,
      });
      return;
    }

    // 为回传生成出库单号
    const stockOutDocNo = await generateDocNo('CK', 'production_op_records', 'doc_no', tenantId);

    // 解析 variant 映射（colorName/sizeName → variantId）
    const receiverProductId = transfer.receiverProductId;
    const dictItems = receiverProductId
      ? await basePrisma.dictionaryItem.findMany({ where: { tenantId } })
      : [];
    const dictByName = new Map(dictItems.map(d => [`${d.type}:${d.name}`, d.id]));
    const variants = receiverProductId
      ? await basePrisma.productVariant.findMany({ where: { productId: receiverProductId } })
      : [];

    // 找关联工单（从 dispatch 上取）
    const orderIds = transfer.dispatches
      .map(d => d.receiverProductionOrderId)
      .filter((v): v is string => !!v);
    const firstOrderId = orderIds[0] ?? null;

    const ret = await basePrisma.subcontractCollaborationReturn.create({
      data: {
        transferId,
        dispatchId: dispatchId ?? null,
        receiverProductionOrderId: receiverProductionOrderId ?? null,
        payload: { items: cleanItems, note, stockOutDocNo, warehouseId },
      },
    });

    // 自动生成 STOCK_OUT 出库记录（从仓库出库用于回传）
    if (receiverProductId) {
      for (const item of cleanItems) {
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;

        const cn = normalizeSpecLabel(item.colorName);
        const sn = normalizeSpecLabel(item.sizeName);
        let variantId: string | null = null;
        if (cn || sn) {
          const colorId = cn ? dictByName.get(`color:${cn}`) ?? null : null;
          const sizeId = sn ? dictByName.get(`size:${sn}`) ?? null : null;
          const match = variants.find(v =>
            (colorId ? v.colorId === colorId : !v.colorId) &&
            (sizeId ? v.sizeId === sizeId : !v.sizeId),
          );
          variantId = match?.id ?? null;
        }

        await basePrisma.productionOpRecord.create({
          data: {
            id: genId('prodop'),
            tenantId,
            type: 'STOCK_OUT',
            productId: receiverProductId,
            variantId,
            orderId: firstOrderId,
            quantity: qty,
            operator: '协作回传出库',
            timestamp: new Date(),
            status: '已完成',
            warehouseId: warehouseId ?? null,
            docNo: stockOutDocNo,
          },
        });
      }
    }

    res.status(201).json(ret);
  } catch (e) { next(e); }
}

// ── 6. 甲方确认收回 ──

export async function receiveReturn(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const returnId = str(req.params.id);

    const ret = await basePrisma.subcontractCollaborationReturn.findUnique({
      where: { id: returnId },
      include: { transfer: { include: { dispatches: true } } },
    });
    if (!ret) { res.status(404).json({ error: 'Return 不存在' }); return; }
    assertTenantIs(tenantId, ret.transfer.senderTenantId);

    if (ret.status === 'A_RECEIVED') {
      res.status(400).json({ error: '该回传已确认收回' });
      return;
    }

    // ── 生成外协回收单 ──

    const transfer = ret.transfer;
    const returnItems: { colorName?: string; sizeName?: string; quantity: number }[] =
      (ret.payload as any)?.items ?? [];

    // dispatch items 按规格 key 索引，用于查找 variantId / nodeId
    const dispatchLookup = new Map<string, { nodeId: string | null; variantId: string | null }>();
    const allSenderRecordIds: string[] = [];
    for (const d of transfer.dispatches) {
      if (d.status !== 'ACCEPTED') continue;
      for (const item of ((d.payload as any)?.items ?? []) as any[]) {
        const key = collabVariantKey(item);
        if (!dispatchLookup.has(key)) {
          dispatchLookup.set(key, { nodeId: item.nodeId ?? null, variantId: item.variantId ?? null });
        }
      }
      allSenderRecordIds.push(...((d.senderDispatchRecordIds as string[]) ?? []));
    }

    // 从甲方原始外协发出记录获取 orderId 和 partner（本地合作单位名）
    let orderIdByVariant = new Map<string, string>();
    let localPartnerName = '';
    if (allSenderRecordIds.length > 0) {
      const origRecs = await basePrisma.productionOpRecord.findMany({
        where: { id: { in: allSenderRecordIds } },
        select: { orderId: true, variantId: true, partner: true },
      });
      for (const r of origRecs) {
        if (r.orderId && r.variantId && !orderIdByVariant.has(r.variantId)) {
          orderIdByVariant.set(r.variantId, r.orderId);
        }
        if (!localPartnerName && r.partner) localPartnerName = r.partner;
      }
    }
    if (!localPartnerName) {
      const receiverTenant = await basePrisma.tenant.findUnique({
        where: { id: transfer.receiverTenantId },
        select: { name: true },
      });
      localPartnerName = receiverTenant?.name ?? '';
    }

    const receiptDocNo = await generateDocNo('WXR', 'production_op_records', 'doc_no', tenantId);

    for (const item of returnItems) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      const key = collabVariantKey(item);
      const dInfo = dispatchLookup.get(key);
      const orderId = (dInfo?.variantId && orderIdByVariant.get(dInfo.variantId)) ?? null;

      const data = {
        id: genId('prodop'),
        tenantId,
        type: 'OUTSOURCE',
        productId: transfer.senderProductId,
        variantId: dInfo?.variantId ?? null,
        quantity: qty,
        operator: '协作回收',
        timestamp: new Date(),
        status: '已收回',
        partner: localPartnerName,
        nodeId: dInfo?.nodeId ?? null,
        orderId,
        docNo: receiptDocNo,
        collabData: {
          source: 'collaborationReturn',
          returnId: ret.id,
          transferId: transfer.id,
        },
      };

      await basePrisma.productionOpRecord.create({ data });
      await applyOutsourceProgress({ ...data, tenantId });
    }

    // 写回收单号到 return payload 并更新状态
    const updatedPayload = { ...(ret.payload as any), receiptDocNo };
    await basePrisma.subcontractCollaborationReturn.update({
      where: { id: returnId },
      data: { status: 'A_RECEIVED', payload: updatedPayload },
    });

    await updateTransferStatus(ret.transferId);

    res.json({ success: true, receiptDocNo });
  } catch (e) { next(e); }
}

// ── 7. 对照表 CRUD ──

export async function listProductMaps(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const collaborationId = optStr(req.query.collaborationId);

    const where: any = {};
    if (collaborationId) {
      where.collaborationId = collaborationId;
    } else {
      const collabs = await basePrisma.tenantCollaboration.findMany({
        where: { OR: [{ tenantAId: tenantId }, { tenantBId: tenantId }], status: 'ACTIVE' },
        select: { id: true },
      });
      where.collaborationId = { in: collabs.map(c => c.id) };
    }

    const maps = await basePrisma.collaborationProductMap.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(maps);
  } catch (e) { next(e); }
}

export async function updateProductMap(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const id = str(req.params.id);

    const map = await basePrisma.collaborationProductMap.findUnique({
      where: { id },
      include: { collaboration: true },
    });
    if (!map) { res.status(404).json({ error: '对照记录不存在' }); return; }
    assertTenantIs(tenantId, map.collaboration.tenantAId, map.collaboration.tenantBId);

    const { receiverProductId, senderProductName } = req.body;
    const updated = await basePrisma.collaborationProductMap.update({
      where: { id },
      data: {
        ...(receiverProductId !== undefined ? { receiverProductId } : {}),
        ...(senderProductName !== undefined ? { senderProductName } : {}),
      },
    });

    res.json(updated);
  } catch (e) { next(e); }
}

export async function deleteProductMap(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenantId!;
    const id = str(req.params.id);

    const map = await basePrisma.collaborationProductMap.findUnique({
      where: { id },
      include: { collaboration: true },
    });
    if (!map) { res.status(404).json({ error: '对照记录不存在' }); return; }
    assertTenantIs(tenantId, map.collaboration.tenantAId, map.collaboration.tenantBId);

    await basePrisma.collaborationProductMap.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) { next(e); }
}
