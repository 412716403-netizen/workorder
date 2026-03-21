import type { ProductionOpRecord, ProductionOrder, Product, ProductMilestoneProgress } from '../types';
import { MilestoneStatus } from '../types';
import { sumVariantQtyInOrders } from './productReportAggregates';

/**
 * 外协收回确认后，将收回数量计入工单中心对应工序完成量（工单里程碑或关联产品 pmp）。
 */
export function applyOutsourceReceiveProgress(
  r: ProductionOpRecord,
  productionLinkMode: 'order' | 'product',
  orders: ProductionOrder[],
  products: Product[],
  setOrders: (fn: (prev: ProductionOrder[]) => ProductionOrder[]) => void,
  setProductMilestoneProgresses: (fn: (prev: ProductMilestoneProgress[]) => ProductMilestoneProgress[]) => void
): void {
  if (r.type !== 'OUTSOURCE' || r.status !== '已收回' || !r.nodeId || !r.quantity || r.quantity <= 0) return;

  const nodeTid = r.nodeId;
  const qty = r.quantity;
  const opName = r.operator || '外协收回';

  const mergePmpBatch = (
    prev: ProductMilestoneProgress[],
    parts: { productId: string; milestoneTemplateId: string; addQty: number; variantId: string }[]
  ): ProductMilestoneProgress[] => {
    let next = [...prev];
    for (const { productId, milestoneTemplateId, addQty, variantId } of parts) {
      if (addQty <= 0) continue;
      const vid = variantId ?? '';
      const rate = products.find(p => p.id === productId)?.nodeRates?.[milestoneTemplateId];
      const newReport = {
        id: `rep-wxrecv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: r.timestamp,
        operator: opName,
        quantity: addQty,
        defectiveQuantity: undefined as number | undefined,
        equipmentId: undefined as string | undefined,
        variantId: vid || undefined,
        reportBatchId: undefined as string | undefined,
        reportNo: r.docNo ? `外协收回·${r.docNo}` : undefined,
        customData: { source: 'outsourceReceive', docNo: r.docNo ?? '' },
        rate: rate != null ? rate : undefined,
        workerId: undefined as string | undefined
      };
      const existing = next.find(
        p => p.productId === productId && (p.variantId ?? '') === vid && p.milestoneTemplateId === milestoneTemplateId
      );
      const reports = [...(existing?.reports ?? []), newReport];
      const completedQuantity = reports.reduce((s, x) => s + x.quantity, 0);
      const updated: ProductMilestoneProgress = {
        id: existing?.id ?? `pmp-wxrecv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        productId,
        variantId: vid || undefined,
        milestoneTemplateId,
        completedQuantity,
        reports,
        updatedAt: new Date().toISOString()
      };
      if (existing) next = next.map(p => (p.id === existing.id ? updated : p));
      else next = [...next, updated];
    }
    return next;
  };

  if (r.orderId) {
    setOrders(prev =>
      prev.map(o => {
        if (o.id !== r.orderId) return o;
        const ms = o.milestones.find(m => m.templateId === nodeTid);
        if (!ms) return o;
        const rate = products.find(p => p.id === o.productId)?.nodeRates?.[nodeTid];
        const newReport = {
          id: `rep-wxrecv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: r.timestamp,
          operator: opName,
          quantity: qty,
          variantId: r.variantId,
          customData: { source: 'outsourceReceive', docNo: r.docNo ?? '' },
          rate: rate != null ? rate : undefined
        };
        const newMQty = ms.completedQuantity + qty;
        const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
        const newMilestones = o.milestones.map(m =>
          m.templateId !== nodeTid
            ? m
            : {
                ...m,
                completedQuantity: newMQty,
                reports: [...m.reports, newReport],
                status:
                  newMQty >= totalQty ? MilestoneStatus.COMPLETED : MilestoneStatus.IN_PROGRESS
              }
        );
        const vId = r.variantId;
        let newItems: typeof o.items;
        if (o.items.length === 1) {
          newItems = [
            {
              ...o.items[0],
              completedQuantity: (o.items[0].completedQuantity || 0) + qty
            }
          ];
        } else if (vId) {
          newItems = o.items.map(item =>
            (item.variantId || '') === vId
              ? { ...item, completedQuantity: (item.completedQuantity || 0) + qty }
              : item
          );
        } else {
          const tot = o.items.reduce((s, i) => s + i.quantity, 0);
          if (tot <= 0) newItems = o.items;
          else {
            let rem = qty;
            newItems = o.items.map((item, idx) => {
              const part =
                idx === o.items.length - 1 ? rem : Math.floor((qty * item.quantity) / tot);
              rem -= part;
              return {
                ...item,
                completedQuantity: (item.completedQuantity || 0) + part
              };
            });
          }
        }
        return { ...o, milestones: newMilestones, items: newItems };
      })
    );
    return;
  }

  if (productionLinkMode !== 'product') return;

  const pid = r.productId;
  const block = orders.filter(o => o.productId === pid);
  if (r.variantId) {
    setProductMilestoneProgresses(prev =>
      mergePmpBatch(prev, [{ productId: pid, milestoneTemplateId: nodeTid, addQty: qty, variantId: r.variantId! }])
    );
    return;
  }

  const variantSet = new Set<string>();
  block.forEach(o => o.items.forEach(i => i.variantId && variantSet.add(i.variantId)));
  const vids = [...variantSet];
  const total = block.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const batch: { productId: string; milestoneTemplateId: string; addQty: number; variantId: string }[] = [];
  if (total <= 0 || vids.length === 0) {
    batch.push({ productId: pid, milestoneTemplateId: nodeTid, addQty: qty, variantId: '' });
  } else {
    let rem = qty;
    vids.forEach((vid, idx) => {
      const vq = sumVariantQtyInOrders(block, vid);
      const part = idx === vids.length - 1 ? rem : Math.floor((qty * vq) / total);
      rem -= part;
      if (part > 0) batch.push({ productId: pid, milestoneTemplateId: nodeTid, addQty: part, variantId: vid });
    });
  }
  if (batch.length) setProductMilestoneProgresses(prev => mergePmpBatch(prev, batch));
}
