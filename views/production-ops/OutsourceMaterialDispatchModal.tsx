import React, { useEffect, useMemo, useState } from 'react';
import { Package, X, ArrowUpFromLine } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  ProdOpType,
  BOM,
  GlobalNodeTemplate,
  Warehouse,
  MaterialFormSettings,
  PsiRecord,
} from '../../types';
import { DEFAULT_MATERIAL_FORM_SETTINGS, categoryUsesBatchManagement } from '../../types';
import * as api from '../../services/api';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { toLocalCompactYmd } from '../../utils/localDateTime';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { formatMaterialQtyDisplay } from '../../utils/formatMaterialQtyDisplay';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { buildMaterialStockCustomCollabPayload } from '../../utils/productionOpCollab/material';
import { writeWarehousePreference, WAREHOUSE_DOC_KIND } from '../../utils/warehouseDocPreference';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { usePsiStockIndex } from '../../hooks/usePsiStockIndex';

/**
 * 子工单等：外协记录上的 variantId 常为父成品规格，与本产品 BOM 规格对不上。
 * 若按「工序+规格」拆分量对不上，但工序上仍有外协合计，则在「单规格产品」或「无按规格拆分量」时回退为工序级数量。
 */
function computeOutsourceQtyForNodeVariant(
  nodeId: string,
  variantId: string,
  outsourceQtyByNode: Map<string, number>,
  outsourceQtyByNodeVar: Map<string, number>,
  bomsAtNode: BOM[],
  productVariantCount: number,
): number {
  const direct = outsourceQtyByNodeVar.get(`${nodeId}|${variantId}`) ?? 0;
  if (direct > 0) return direct;
  const nodeTotal = outsourceQtyByNode.get(nodeId) ?? 0;
  if (nodeTotal <= 0) return 0;
  const prefix = `${nodeId}|`;
  const reportedIds = [...outsourceQtyByNodeVar.keys()]
    .filter(k => k.startsWith(prefix))
    .map(k => k.slice(prefix.length));
  const siblingVariantIds = new Set(bomsAtNode.map(b => b.variantId).filter((id): id is string => Boolean(id)));
  const anyReportedHitsSiblingVariant = reportedIds.some(id => siblingVariantIds.has(id));
  if (anyReportedHitsSiblingVariant) return 0;
  if (productVariantCount <= 1 || reportedIds.length === 0) return nodeTotal;
  return 0;
}

function effectiveOutsourceQtyForBomFallback(
  bom: BOM,
  nodeId: string,
  outsourceQtyByNode: Map<string, number>,
  outsourceQtyByNodeVar: Map<string, number>,
  siblingBomsAtNode: BOM[],
  productVariantCount: number,
): number {
  if (!bom.variantId) return outsourceQtyByNode.get(nodeId) ?? 0;
  return computeOutsourceQtyForNodeVariant(
    nodeId,
    bom.variantId,
    outsourceQtyByNode,
    outsourceQtyByNodeVar,
    siblingBomsAtNode,
    productVariantCount,
  );
}

export interface OutsourceMaterialDispatchModalProps {
  productionLinkMode: 'order' | 'product';
  matDispatchOrderId: string | null;
  matDispatchProductId: string | null;
  matDispatchPartnerOptions: string[];
  matDispatchPartner: string;
  setMatDispatchPartner: React.Dispatch<React.SetStateAction<string>>;
  matDispatchWarehouseId: string;
  setMatDispatchWarehouseId: React.Dispatch<React.SetStateAction<string>>;
  matDispatchRemark: string;
  setMatDispatchRemark: React.Dispatch<React.SetStateAction<string>>;
  matDispatchQty: Record<string, number>;
  setMatDispatchQty: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  records: ProductionOpRecord[];
  warehouses: Warehouse[];
  categories?: ProductCategory[];
  /** 外协领料发出自定义字段（生产物料 → 字段配置） */
  materialFormSettings?: MaterialFormSettings;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
  /** 进销存快照，合并批次下拉里余量 */
  psiRecords?: PsiRecord[];
}

const OutsourceMaterialDispatchModal: React.FC<OutsourceMaterialDispatchModalProps> = ({
  productionLinkMode,
  matDispatchOrderId,
  matDispatchProductId,
  matDispatchPartnerOptions,
  matDispatchPartner,
  setMatDispatchPartner,
  matDispatchWarehouseId,
  setMatDispatchWarehouseId,
  matDispatchRemark,
  setMatDispatchRemark,
  matDispatchQty,
  setMatDispatchQty,
  orders,
  products,
  boms,
  globalNodes,
  records,
  warehouses,
  categories = [],
  materialFormSettings = DEFAULT_MATERIAL_FORM_SETTINGS,
  onAddRecord,
  onAddRecordBatch,
  onClose,
  psiRecords = [],
}) => {
  const { currentUser, tenantCtx, userId } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [matDispatchCustomValues, setMatDispatchCustomValues] = useState<Record<string, unknown>>({});
  const [lineBatchByProduct, setLineBatchByProduct] = useState<Record<string, string>>({});
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const { listAvailableBatches } = usePsiStockIndex(psiRecords, records);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const materialProductCustomTags = (productId: string) => {
    const p = productById.get(productId);
    if (!p?.categoryId) return null;
    const entries = getProductCategoryCustomFieldEntries(p, categoryById.get(p.categoryId), { includeFile: false });
    if (entries.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {entries.map(({ field, display }) => (
          <span key={field.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">
            {field.label}: {display}
          </span>
        ))}
      </div>
    );
  };
  const materialCustomFieldDefs = useMemo(
    () => (materialFormSettings.outsourceMaterialIssueCustomFields ?? []).filter(f => f.showInCreate),
    [materialFormSettings.outsourceMaterialIssueCustomFields],
  );
  useEffect(() => {
    setMatDispatchCustomValues({});
    setLineBatchByProduct({});
  }, [matDispatchOrderId, matDispatchProductId]);

  useEffect(() => {
    setLineBatchByProduct({});
  }, [matDispatchPartner, matDispatchWarehouseId]);
  const isProductMode = productionLinkMode === 'product';
  const targetOrder = !isProductMode && matDispatchOrderId ? orders.find(o => o.id === matDispatchOrderId) : undefined;
  const targetProductId = isProductMode ? matDispatchProductId : targetOrder?.productId;
  const targetProduct = targetProductId ? products.find(p => p.id === targetProductId) : undefined;
  const orderQty = targetOrder?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
  const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
  const addBomItems = (bom: BOM, qty: number, nodeName: string) => {
    bom.items.forEach(bi => {
      const mp = products.find(px => px.id === bi.productId);
      const add = Number(bi.quantity) * qty;
      const existing = matMap.get(bi.productId);
      if (existing) {
        existing.unitNeeded += add;
        if (nodeName) existing.nodeNames.add(nodeName);
      } else {
        const ns = new Set<string>();
        if (nodeName) ns.add(nodeName);
        matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
      }
    });
  };
  const outsourceQtyByNode = new Map<string, number>();
  const outsourceQtyByNodeVar = new Map<string, number>();
  {
    const relOrderIds = isProductMode
      ? new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id))
      : undefined;
    records.forEach(r => {
      if (r.type !== 'OUTSOURCE' || !r.nodeId || r.sourceReworkId) return;
      if (r.status !== '加工中') return;
      const match = isProductMode
        ? ((r.productId === targetProductId && !r.orderId) || (r.orderId && relOrderIds!.has(r.orderId)))
        : (r.orderId === targetOrder?.id);
      if (!match) return;
      outsourceQtyByNode.set(r.nodeId, (outsourceQtyByNode.get(r.nodeId) ?? 0) + r.quantity);
      if (r.variantId) {
        const vk = `${r.nodeId}|${r.variantId}`;
        outsourceQtyByNodeVar.set(vk, (outsourceQtyByNodeVar.get(vk) ?? 0) + r.quantity);
      }
    });
  }
  if (targetProduct) {
    const variants = targetProduct.variants ?? [];
    const productVariantCount = variants.length;
    const bomsForProduct = boms.filter(b => b.parentProductId === targetProduct.id);
    if (variants.length > 0) {
      for (const v of variants) {
        const seenBomIds = new Set<string>();
        if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
          (Object.entries(v.nodeBoms) as [string, string][]).forEach(([nodeId, bomId]) => {
            if (seenBomIds.has(bomId)) return;
            seenBomIds.add(bomId);
            const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
            const bom = boms.find(b => b.id === bomId);
            const bomsAtNode = bomsForProduct.filter(b => b.nodeId === nodeId);
            const qty = computeOutsourceQtyForNodeVariant(
              nodeId,
              v.id,
              outsourceQtyByNode,
              outsourceQtyByNodeVar,
              bomsAtNode,
              productVariantCount,
            );
            if (bom && qty > 0) addBomItems(bom, qty, nodeName);
          });
        } else {
          boms.filter(b => b.parentProductId === targetProduct.id && b.variantId === v.id && b.nodeId).forEach(bom => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            const nodeId = bom.nodeId!;
            const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
            const bomsAtNode = bomsForProduct.filter(b => b.nodeId === nodeId);
            const qty = computeOutsourceQtyForNodeVariant(
              nodeId,
              v.id,
              outsourceQtyByNode,
              outsourceQtyByNodeVar,
              bomsAtNode,
              productVariantCount,
            );
            if (qty > 0) addBomItems(bom, qty, nodeName);
          });
        }
      }
    }
    if (matMap.size === 0) {
      const fallbackBoms = boms.filter(b => b.parentProductId === targetProduct.id && b.nodeId);
      fallbackBoms.forEach(bom => {
        const nodeId = bom.nodeId!;
        const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
        const siblingAtNode = fallbackBoms.filter(b => b.nodeId === nodeId);
        const qty = effectiveOutsourceQtyForBomFallback(
          bom,
          nodeId,
          outsourceQtyByNode,
          outsourceQtyByNodeVar,
          siblingAtNode,
          productVariantCount,
        );
        if (qty > 0) addBomItems(bom, qty, nodeName);
      });
    }
  }
  matMap.forEach((v, pid) => {
    bomMaterials.push({ productId: pid, ...v, nodeNames: Array.from(v.nodeNames) });
  });
  const showDispatchBatchCol = bomMaterials.some(m => {
    const p = products.find(x => x.id === m.productId);
    return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
  });
  /**
   * 已发进度：当前所选外协工厂的「外协领料发出」合计 − 同工厂「外协生产退料」退回（与物料退回弹窗口径一致）。
   * 仅统计带 partner 的流水；工单模式排除返工领料 reason。
   */
  const issuedMap = new Map<string, number>();
  const dispatchPartner = (matDispatchPartner || '').trim();
  if (dispatchPartner) {
    if (isProductMode && targetProductId) {
      records
        .filter(
          r =>
            r.type === 'STOCK_OUT' &&
            r.partner === dispatchPartner &&
            r.productId &&
            (r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId)),
        )
        .forEach(r => {
          issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
        });
      const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
      records
        .filter(
          r =>
            r.type === 'STOCK_OUT' &&
            r.partner === dispatchPartner &&
            r.orderId &&
            relatedOrderIds.has(r.orderId),
        )
        .forEach(r => {
          issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
        });
      records
        .filter(
          r =>
            r.type === 'STOCK_RETURN' &&
            r.partner === dispatchPartner &&
            (r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId)),
        )
        .forEach(r => {
          issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) - r.quantity);
        });
      records
        .filter(
          r =>
            r.type === 'STOCK_RETURN' &&
            r.partner === dispatchPartner &&
            r.orderId &&
            relatedOrderIds.has(r.orderId),
        )
        .forEach(r => {
          issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) - r.quantity);
        });
    } else if (targetOrder) {
      records
        .filter(
          r =>
            r.type === 'STOCK_OUT' &&
            r.partner === dispatchPartner &&
            r.orderId === targetOrder.id &&
            r.reason !== '来自于返工',
        )
        .forEach(r => {
          issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
        });
      records
        .filter(
          r =>
            r.type === 'STOCK_RETURN' &&
            r.partner === dispatchPartner &&
            r.orderId === targetOrder.id,
        )
        .forEach(r => {
          issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) - r.quantity);
        });
    }
  }
  const getNextWfDocNo = () => {
    const prefix = 'WF';
    const todayStr = toLocalCompactYmd(new Date());
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`;
  };
  const handleMatDispatchSubmit = async () => {
    if (!matDispatchPartner) {
      toast.warning('请选择外协工厂');
      return;
    }
    const toIssue = bomMaterials.filter(m => (matDispatchQty[m.productId] ?? 0) > 0);
    if (toIssue.length === 0) {
      toast.warning('请至少填写一项发出数量');
      return;
    }
    const wh = matDispatchWarehouseId || '';
    if (wh) {
      for (const m of toIssue) {
        const p = products.find(x => x.id === m.productId);
        const c = categoryById.get(p?.categoryId ?? '');
        if (!categoryUsesBatchManagement(c)) continue;
        const bn = clampBatchNoInput(lineBatchByProduct[m.productId] ?? '');
        if (!bn) {
          toast.error(`请为物料「${m.name}」选择批次`);
          return;
        }
        try {
          const opts = await api.psi.getStockBatches({ productId: m.productId, warehouseId: wh });
          const av = opts.find(o => o.batchNo === bn)?.stock ?? 0;
          if ((matDispatchQty[m.productId] ?? 0) > av) {
            toast.error(`物料「${m.name}」批次「${bn}」可用库存不足（${av}）`);
            return;
          }
        } catch {
          toast.error('校验批次库存失败，请稍后重试');
          return;
        }
      }
    }
    const docNo = getNextWfDocNo();
    const timestamp = new Date().toLocaleString();
    const collabExtra = buildMaterialStockCustomCollabPayload(matDispatchCustomValues, 'STOCK_OUT', matDispatchPartner);
    const batch: ProductionOpRecord[] = toIssue.map(m => {
      const p = products.find(x => x.id === m.productId);
      const c = categoryById.get(p?.categoryId ?? '');
      const bn = categoryUsesBatchManagement(c) ? clampBatchNoInput(lineBatchByProduct[m.productId] ?? '') : '';
      return {
        id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'STOCK_OUT' as ProdOpType,
        orderId: isProductMode ? undefined : (matDispatchOrderId ?? undefined),
        productId: m.productId,
        quantity: matDispatchQty[m.productId],
        operator: docOperator,
        timestamp,
        status: '已完成',
        partner: matDispatchPartner,
        warehouseId: matDispatchWarehouseId || undefined,
        docNo,
        reason: matDispatchRemark.trim() || undefined,
        sourceProductId: isProductMode ? (targetProductId ?? undefined) : undefined,
        ...(bn ? { batchNo: bn } : {}),
        ...collabExtra,
      };
    });
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) onAddRecord(rec);
    }
    if (matDispatchWarehouseId) {
      writeWarehousePreference(tenantCtx?.tenantId, userId, WAREHOUSE_DOC_KIND.OUTSOURCE_MAT_DISPATCH, {
        warehouseId: matDispatchWarehouseId,
      });
    }
    toast.success(`已外发 ${toIssue.length} 种物料至「${matDispatchPartner}」`);
    onClose();
  };
  const headerLabel = isProductMode
    ? (targetProduct?.name ?? '—')
    : `${targetOrder?.orderNumber ?? '—'} — ${targetProduct?.name ?? '—'}`;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                <Package className="w-5 h-5" />
              </span>
              物料外发
            </h3>
            <p className="text-sm text-slate-500 mt-1 font-medium line-clamp-2">{headerLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 shrink-0" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">外协工厂</label>
              {matDispatchPartnerOptions.length <= 1 ? (
                <div className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white">{matDispatchPartnerOptions[0] ?? '—'}</div>
              ) : (
                <select
                  value={matDispatchPartner}
                  onChange={e => {
                    setMatDispatchPartner(e.target.value);
                    setMatDispatchCustomValues({});
                    setLineBatchByProduct({});
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {matDispatchPartnerOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>
            {warehouses.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                <select
                  value={matDispatchWarehouseId}
                  onChange={e => {
                    setMatDispatchWarehouseId(e.target.value);
                    setLineBatchByProduct({});
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注说明</label>
            <input
              type="text"
              value={matDispatchRemark}
              onChange={e => setMatDispatchRemark(e.target.value)}
              placeholder="选填"
              className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
            />
          </div>
          {materialCustomFieldDefs.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">外协领料发出自定义内容</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {materialCustomFieldDefs.map(cf => (
                  <div key={cf.id} className="space-y-1">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                    <PlanFormCustomFieldInput
                      cf={cf}
                      value={matDispatchCustomValues[cf.id]}
                      onChange={v => setMatDispatchCustomValues(prev => ({ ...prev, [cf.id]: v }))}
                      controlClassName="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {bomMaterials.length === 0 ? (
            <p className="py-8 text-center text-slate-400 text-sm">该{isProductMode ? '产品' : '工单'}未配置 BOM 物料，无法进行物料外发</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[760px] text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap">物料</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap">理论需量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-40">净已发进度</th>
                  {showDispatchBatchCol ? (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-52">批次</th>
                  ) : null}
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-center whitespace-nowrap w-44">本次外发数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bomMaterials.map(m => {
                  const issued = issuedMap.get(m.productId) ?? 0;
                  return (
                    <tr key={m.productId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-bold text-slate-800">{m.name}</span>
                          {m.sku ? (
                            <span className="text-xs font-bold text-slate-400 tabular-nums" title="产品编号">
                              {m.sku}
                            </span>
                          ) : null}
                          {m.nodeNames.map(nn => (
                            <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>
                          ))}
                        </div>
                        {materialProductCustomTags(m.productId)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-bold text-slate-600 tabular-nums">{formatMaterialQtyDisplay(m.unitNeeded)}</td>
                      <td className="px-4 py-4">
                        {(() => {
                          const needed = m.unitNeeded;
                          const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
                          const overIssue = issued > needed;
                          return (
                            <div className="flex flex-col gap-1">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                {overIssue ? (
                                  <>
                                    <div className="h-full bg-emerald-500" style={{ width: `${(needed / issued) * 100}%` }} />
                                    <div className="h-full bg-rose-500" style={{ width: `${((issued - needed) / issued) * 100}%` }} />
                                  </>
                                ) : (
                                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-slate-500 tabular-nums">
                                {overIssue ? (
                                  <span>
                                    净已发 {formatMaterialQtyDisplay(issued)}{' '}
                                    <span className="text-rose-500">（超发 {formatMaterialQtyDisplay(issued - needed)}）</span>
                                  </span>
                                ) : (
                                  `净已发 ${formatMaterialQtyDisplay(issued)}`
                                )}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      {showDispatchBatchCol ? (
                        <td className="px-4 py-4 align-middle">
                          <MaterialIssueBatchSelect
                            product={products.find(x => x.id === m.productId)}
                            categories={categories}
                            warehouseId={matDispatchWarehouseId}
                            value={lineBatchByProduct[m.productId] ?? ''}
                            onChange={v => setLineBatchByProduct(prev => ({ ...prev, [m.productId]: v }))}
                            mode="issue"
                            hideLabel
                            className="min-w-[170px]"
                            mergeBatches={listAvailableBatches(m.productId, matDispatchWarehouseId)}
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-4">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={matDispatchQty[m.productId] ?? ''}
                          onChange={e => setMatDispatchQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                          className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 px-3 text-base font-black text-slate-800 text-right tabular-nums focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        {bomMaterials.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleMatDispatchSubmit}
              disabled={!bomMaterials.some(m => (matDispatchQty[m.productId] ?? 0) > 0) || !matDispatchPartner}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <ArrowUpFromLine className="w-4 h-4" /> 确认外发
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceMaterialDispatchModal);
