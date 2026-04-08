import React, { useState, useMemo } from 'react';
import { X, Truck } from 'lucide-react';
import { ProductionOpRecord, ProductionOrder, Product, GlobalNodeTemplate, AppDictionaries, ProductCategory, ProductVariant, ProductMilestoneProgress, Partner, PartnerCategory } from '../../types';
import { splitQtyBySourceDefectiveAcrossParentOrders } from '../../utils/reworkSplitByProductOrders';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { hasOpsPerm } from './types';

export interface ReworkDefectiveActionModalProps {
  reworkActionRow: {
    scope: 'order' | 'product';
    orderId: string;
    orderNumber: string;
    productId: string;
    productName: string;
    nodeId: string;
    milestoneName: string;
    defectiveTotal: number;
    reworkTotal: number;
    scrapTotal: number;
    pendingQty: number;
  };
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  categories: ProductCategory[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  userPermissions?: string[];
  tenantRole?: string;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  getNextReworkDocNo: () => string;
  getNextOutsourceReworkDocNo: (partnerName: string) => string;
  onClose: () => void;
}

const ReworkDefectiveActionModal: React.FC<ReworkDefectiveActionModalProps> = ({
  reworkActionRow,
  records,
  orders,
  products,
  globalNodes,
  dictionaries,
  categories,
  productMilestoneProgresses,
  partners,
  partnerCategories,
  userPermissions,
  tenantRole,
  onAddRecord,
  onAddRecordBatch,
  getNextReworkDocNo,
  getNextOutsourceReworkDocNo,
  onClose,
}) => {
  const canOutsourceRework = hasOpsPerm(tenantRole, userPermissions, 'production:rework_outsource:allow');
  const [reworkActionMode, setReworkActionMode] = useState<'scrap' | 'rework' | 'outsource_rework' | null>(null);
  const [reworkActionQty, setReworkActionQty] = useState(0);
  const [reworkActionReason, setReworkActionReason] = useState('');
  const [reworkActionNodeIds, setReworkActionNodeIds] = useState<string[]>([]);
  const [reworkActionVariantQuantities, setReworkActionVariantQuantities] = useState<Record<string, number>>({});
  const [outsourcePartnerName, setOutsourcePartnerName] = useState('');

  const reworkActionProduct = useMemo(() => products.find(p => p.id === reworkActionRow.productId) ?? null, [reworkActionRow, products]);
  const reworkActionCategory = useMemo(() => (reworkActionProduct ? categories.find(c => c.id === reworkActionProduct.categoryId) : null), [reworkActionProduct, categories]);
  const reworkActionHasColorSize = Boolean(reworkActionCategory?.hasColorSize && reworkActionProduct?.variants && reworkActionProduct.variants.length > 0);

  const reworkActionPendingByVariant = useMemo((): Record<string, number> => {
    const defectiveByVariant: Record<string, number> = {};
    if (reworkActionRow.scope === 'product') {
      productMilestoneProgresses
        .filter(p => p.productId === reworkActionRow.productId && p.milestoneTemplateId === reworkActionRow.nodeId)
        .forEach(pmp => {
          (pmp.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            defectiveByVariant[vid] = (defectiveByVariant[vid] ?? 0) + (r.defectiveQuantity ?? 0);
          });
        });
      orders.forEach(o => {
        if (o.productId !== reworkActionRow.productId) return;
        const ms = o.milestones?.find(m => m.templateId === reworkActionRow.nodeId);
        (ms?.reports || []).forEach(r => {
          const vid = r.variantId ?? '';
          defectiveByVariant[vid] = (defectiveByVariant[vid] ?? 0) + (r.defectiveQuantity ?? 0);
        });
      });
    } else {
      const order = orders.find(o => o.id === reworkActionRow.orderId);
      const ms = order?.milestones?.find(m => m.templateId === reworkActionRow.nodeId);
      (ms?.reports || []).forEach(r => {
        const vid = r.variantId ?? '';
        defectiveByVariant[vid] = (defectiveByVariant[vid] ?? 0) + (r.defectiveQuantity ?? 0);
      });
    }
    const reworkByVariant: Record<string, number> = {};
    if (reworkActionRow.scope === 'product') {
      records
        .filter(r => r.type === 'REWORK' && r.productId === reworkActionRow.productId && (r.sourceNodeId ?? r.nodeId) === reworkActionRow.nodeId)
        .forEach(r => { const vid = r.variantId ?? ''; reworkByVariant[vid] = (reworkByVariant[vid] ?? 0) + r.quantity; });
    } else {
      records
        .filter(r => r.type === 'REWORK' && r.orderId === reworkActionRow.orderId && (r.sourceNodeId ?? r.nodeId) === reworkActionRow.nodeId)
        .forEach(r => { const vid = r.variantId ?? ''; reworkByVariant[vid] = (reworkByVariant[vid] ?? 0) + r.quantity; });
    }
    const scrapByVariant: Record<string, number> = {};
    if (reworkActionRow.scope === 'product') {
      records
        .filter(r => r.type === 'SCRAP' && r.productId === reworkActionRow.productId && r.nodeId === reworkActionRow.nodeId)
        .forEach(r => { const vid = r.variantId ?? ''; scrapByVariant[vid] = (scrapByVariant[vid] ?? 0) + r.quantity; });
    } else {
      records.filter(r => r.type === 'SCRAP' && r.orderId === reworkActionRow.orderId && r.nodeId === reworkActionRow.nodeId).forEach(r => {
        const vid = r.variantId ?? '';
        scrapByVariant[vid] = (scrapByVariant[vid] ?? 0) + r.quantity;
      });
    }
    const pending: Record<string, number> = {};
    const allVariantIds = new Set<string>([...Object.keys(defectiveByVariant), ...Object.keys(reworkByVariant), ...Object.keys(scrapByVariant)]);
    if (reworkActionProduct?.variants?.length) {
      reworkActionProduct.variants.forEach(v => { allVariantIds.add(v.id); });
    }
    allVariantIds.forEach(vid => {
      const d = defectiveByVariant[vid] ?? 0;
      const rw = reworkByVariant[vid] ?? 0;
      const sp = scrapByVariant[vid] ?? 0;
      const p = Math.max(0, d - rw - sp);
      if (p > 0 || vid !== '') pending[vid] = p;
    });
    return pending;
  }, [reworkActionRow, orders, records, reworkActionProduct?.variants, productMilestoneProgresses]);

  const reworkActionVariantTotal = useMemo(() => (Object.values(reworkActionVariantQuantities) as number[]).reduce((s, q) => s + (Number(q) || 0), 0), [reworkActionVariantQuantities]);
  const reworkActionGroupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!reworkActionProduct?.variants?.length) return {};
    const groups: Record<string, ProductVariant[]> = {};
    reworkActionProduct.variants.forEach(v => {
      const c = v.colorId || 'none';
      if (!groups[c]) groups[c] = [];
      groups[c].push(v);
    });
    return groups;
  }, [reworkActionProduct?.variants]);

  const resetAndClose = () => {
    onClose();
  };

  const resetMode = () => {
    setReworkActionMode(null);
    setReworkActionQty(0);
    setReworkActionReason('');
    setReworkActionNodeIds([]);
    setReworkActionVariantQuantities({});
    setOutsourcePartnerName('');
  };

  const handleScrapSubmit = () => {
    const reason = reworkActionReason || undefined;
    const operator = '张主管';
    const timestamp = new Date().toLocaleString();
    const nodeIdSc = reworkActionRow.nodeId;
    const scrapDocNo = getNextReworkDocNo();
    const parentsSc = orders.filter(o => !o.parentOrderId && o.productId === reworkActionRow.productId);
    const splitProductSc = reworkActionRow.scope === 'product' && parentsSc.length > 0;
    const pushScrap = (oid: string, vid: string | undefined, q: number, rid: string) => {
      if (q <= 0) return;
      onAddRecord({
        id: rid, type: 'SCRAP', orderId: oid, productId: reworkActionRow.productId, variantId: vid, quantity: q,
        reason, operator, timestamp, nodeId: nodeIdSc, docNo: scrapDocNo
      });
    };
    if (reworkActionHasColorSize) {
      if (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) return;
      if (splitProductSc) {
        const qtyMap: Record<string, number> = {};
        Object.entries(reworkActionVariantQuantities).forEach(([vId, q]) => {
          const n = Number(q) || 0;
          if (n <= 0 || n > (reworkActionPendingByVariant[vId] ?? 0)) return;
          qtyMap[vId] = n;
        });
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(reworkActionRow.productId, reworkActionRow.nodeId, parentsSc, productMilestoneProgresses, qtyMap);
        if (splits.length === 0) return;
        splits.forEach((sp, i) => pushScrap(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-sc-${i}`));
      } else {
        Object.entries(reworkActionVariantQuantities).forEach(([variantId, qty]) => {
          const q = Number(qty) || 0;
          if (q <= 0) return;
          const maxV = reworkActionPendingByVariant[variantId] ?? 0;
          if (q > maxV) return;
          pushScrap(reworkActionRow.orderId, variantId || undefined, q, `rec-${Date.now()}-${variantId}`);
        });
      }
    } else {
      if (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
      if (splitProductSc) {
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(reworkActionRow.productId, reworkActionRow.nodeId, parentsSc, productMilestoneProgresses, { '': reworkActionQty });
        if (splits.length === 0) return;
        splits.forEach((sp, i) => pushScrap(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-sc-${i}`));
      } else {
        pushScrap(reworkActionRow.orderId, undefined, reworkActionQty, `rec-${Date.now()}-sc-${Math.random().toString(36).slice(2, 8)}`);
      }
    }
    resetAndClose();
  };

  const handleReworkSubmit = () => {
    const reason = reworkActionReason || undefined;
    const operator = '张主管';
    const timestamp = new Date().toLocaleString();
    const sourceNodeId = reworkActionRow.nodeId;
    const reworkDocNo = getNextReworkDocNo();
    const seqPath = reworkActionProduct?.milestoneNodeIds ?? [];
    const sortedPath =
      reworkActionNodeIds.length > 0
        ? [...reworkActionNodeIds].sort((a, b) => {
            const ia = seqPath.indexOf(a);
            const ib = seqPath.indexOf(b);
            if (ia < 0 && ib < 0) return a.localeCompare(b);
            if (ia < 0) return 1;
            if (ib < 0) return -1;
            return ia - ib;
          })
        : [];
    const reworkNodeIdsSorted = sortedPath.length > 0 ? sortedPath : undefined;
    const nodeIdFirst = sortedPath[0];
    const parentsRw = orders.filter(o => !o.parentOrderId && o.productId === reworkActionRow.productId);
    const splitProductRw = reworkActionRow.scope === 'product' && parentsRw.length > 0;
    const pushRework = (oid: string, vid: string | undefined, q: number, rid: string) => {
      if (q <= 0) return;
      onAddRecord({
        id: rid, type: 'REWORK', orderId: oid, productId: reworkActionRow.productId, variantId: vid, quantity: q,
        reason, operator, timestamp, status: '待返工', sourceNodeId, nodeId: nodeIdFirst, reworkNodeIds: reworkNodeIdsSorted, docNo: reworkDocNo
      });
    };
    if (reworkActionHasColorSize) {
      if (reworkActionNodeIds.length === 0 || reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) return;
      if (splitProductRw) {
        const qtyMap: Record<string, number> = {};
        Object.entries(reworkActionVariantQuantities).forEach(([vId, q]) => {
          const n = Number(q) || 0;
          if (n <= 0) return;
          if (n > (reworkActionPendingByVariant[vId] ?? 0)) return;
          qtyMap[vId] = n;
        });
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(reworkActionRow.productId, reworkActionRow.nodeId, parentsRw, productMilestoneProgresses, qtyMap);
        if (splits.length === 0) return;
        splits.forEach((sp, i) => pushRework(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-rw-${i}-${sp.orderId}`));
      } else {
        Object.entries(reworkActionVariantQuantities).forEach(([variantId, qty]) => {
          const q = Number(qty) || 0;
          if (q <= 0) return;
          const maxV = reworkActionPendingByVariant[variantId] ?? 0;
          if (q > maxV) return;
          pushRework(reworkActionRow.orderId, variantId || undefined, q, `rec-${Date.now()}-${variantId}`);
        });
      }
    } else {
      if (reworkActionNodeIds.length === 0 || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
      if (splitProductRw) {
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(reworkActionRow.productId, reworkActionRow.nodeId, parentsRw, productMilestoneProgresses, { '': reworkActionQty });
        if (splits.length === 0) return;
        splits.forEach((sp, i) => pushRework(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-rw-${i}-${sp.orderId}`));
      } else {
        pushRework(reworkActionRow.orderId, undefined, reworkActionQty, `rec-${Date.now()}-rw-${Math.random().toString(36).slice(2, 8)}`);
      }
    }
    resetAndClose();
  };

  const handleOutsourceReworkSubmit = async () => {
    const partnerName = (outsourcePartnerName || '').trim();
    if (!partnerName) return;
    const reason = reworkActionReason || undefined;
    const operator = '张主管';
    const timestamp = new Date().toLocaleString();
    const sourceNodeId = reworkActionRow.nodeId;
    const reworkDocNo = getNextReworkDocNo();
    const outsourceDocNo = getNextOutsourceReworkDocNo(partnerName);
    const seqPath = reworkActionProduct?.milestoneNodeIds ?? [];
    const sortedPath =
      reworkActionNodeIds.length > 0
        ? [...reworkActionNodeIds].sort((a, b) => {
            const ia = seqPath.indexOf(a);
            const ib = seqPath.indexOf(b);
            if (ia < 0 && ib < 0) return a.localeCompare(b);
            if (ia < 0) return 1;
            if (ib < 0) return -1;
            return ia - ib;
          })
        : [];
    const reworkNodeIdsSorted = sortedPath.length > 0 ? sortedPath : undefined;
    const nodeIdFirst = sortedPath[0];
    const parentsOr = orders.filter(o => !o.parentOrderId && o.productId === reworkActionRow.productId);
    const splitProductOr = reworkActionRow.scope === 'product' && parentsOr.length > 0;

    const isProductScope = reworkActionRow.scope === 'product';
    const now = Date.now();
    const buildPair = (oid: string, vid: string | undefined, q: number, idx: number): ProductionOpRecord[] => {
      if (q <= 0) return [];
      const reworkId = `rec-${now}-orw-${idx}-${oid || 'p'}`;
      const reworkRec: ProductionOpRecord = {
        id: reworkId, type: 'REWORK', orderId: oid || undefined, productId: reworkActionRow.productId,
        variantId: vid, quantity: q, reason, operator, timestamp, status: '委外返工中',
        sourceNodeId, nodeId: nodeIdFirst, reworkNodeIds: reworkNodeIdsSorted,
        partner: partnerName, docNo: reworkDocNo,
      };
      const outsourceRec: ProductionOpRecord = {
        id: `wx-${now}-orw-${idx}-${oid || 'p'}`, type: 'OUTSOURCE',
        orderId: isProductScope ? undefined : (oid || undefined),
        productId: reworkActionRow.productId,
        variantId: vid, quantity: q, reason: reason ? `委外返工·${reason}` : '委外返工',
        operator, timestamp, status: '加工中', partner: partnerName,
        nodeId: sourceNodeId, sourceReworkId: reworkId, docNo: outsourceDocNo,
      };
      return [reworkRec, outsourceRec];
    };

    const batch: ProductionOpRecord[] = [];
    if (reworkActionHasColorSize) {
      if (reworkActionNodeIds.length === 0 || reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) return;
      if (splitProductOr) {
        const qtyMap: Record<string, number> = {};
        Object.entries(reworkActionVariantQuantities).forEach(([vId, q]) => {
          const n = Number(q) || 0;
          if (n <= 0 || n > (reworkActionPendingByVariant[vId] ?? 0)) return;
          qtyMap[vId] = n;
        });
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(reworkActionRow.productId, reworkActionRow.nodeId, parentsOr, productMilestoneProgresses, qtyMap);
        if (splits.length === 0) return;
        splits.forEach((sp, i) => batch.push(...buildPair(sp.orderId, sp.variantId, sp.quantity, i)));
      } else {
        let i = 0;
        Object.entries(reworkActionVariantQuantities).forEach(([variantId, qty]) => {
          const q = Number(qty) || 0;
          if (q <= 0) return;
          if (q > (reworkActionPendingByVariant[variantId] ?? 0)) return;
          batch.push(...buildPair(reworkActionRow.orderId, variantId || undefined, q, i++));
        });
      }
    } else {
      if (reworkActionNodeIds.length === 0 || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
      if (splitProductOr) {
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(reworkActionRow.productId, reworkActionRow.nodeId, parentsOr, productMilestoneProgresses, { '': reworkActionQty });
        if (splits.length === 0) return;
        splits.forEach((sp, i) => batch.push(...buildPair(sp.orderId, sp.variantId, sp.quantity, i)));
      } else {
        batch.push(...buildPair(reworkActionRow.orderId, undefined, reworkActionQty, 0));
      }
    }
    if (batch.length === 0) return;
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) onAddRecord(rec);
    }
    resetAndClose();
  };

  const renderNodeSelector = () => (
    <div className="space-y-3">
      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
        {reworkActionRow.scope === 'product' ? '返工目标工序（按产品工艺顺序，可多选）' : '返工目标工序（可多选）'}
      </label>
      {reworkActionProduct?.milestoneNodeIds && reworkActionProduct.milestoneNodeIds.length > 0 ? (
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
          {reworkActionProduct.milestoneNodeIds.map((nid, stepIdx) => {
            const n = globalNodes.find(x => x.id === nid);
            if (!n) return null;
            const checked = reworkActionNodeIds.includes(nid);
            return (
              <button
                key={nid}
                type="button"
                onClick={() =>
                  setReworkActionNodeIds(prev =>
                    checked ? prev.filter(id => id !== nid) : [...prev, nid].sort((a, b) => {
                      const ia = reworkActionProduct.milestoneNodeIds!.indexOf(a);
                      const ib = reworkActionProduct.milestoneNodeIds!.indexOf(b);
                      if (ia < 0 && ib < 0) return a.localeCompare(b);
                      if (ia < 0) return 1;
                      if (ib < 0) return -1;
                      return ia - ib;
                    })
                  )
                }
                className={`flex flex-col items-center min-w-[76px] py-2 px-2 rounded-xl border-2 transition-all ${
                  checked ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-indigo-200'
                }`}
              >
                <span className="text-[9px] font-black text-slate-400 mb-0.5">第{stepIdx + 1}道</span>
                <span className="text-xs font-bold text-slate-800 text-center leading-tight">{n.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="text-[10px] text-slate-500 font-bold">其他工序</p>
      <div className="max-h-32 overflow-auto border border-slate-200 rounded-xl p-2 space-y-1">
        {globalNodes
          .filter(n => !reworkActionProduct?.milestoneNodeIds?.includes(n.id))
          .map(n => {
            const checked = reworkActionNodeIds.includes(n.id);
            return (
              <label key={n.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1">
                <input type="checkbox" checked={checked} onChange={() => setReworkActionNodeIds(prev => checked ? prev.filter(id => id !== n.id) : [...prev, n.id])} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm font-bold text-slate-700">{n.name}</span>
              </label>
            );
          })}
      </div>
    </div>
  );

  const renderVariantGrid = (mode: 'scrap' | 'rework' | 'outsource_rework') => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-slate-400 uppercase">{mode === 'scrap' ? '报损' : mode === 'outsource_rework' ? '委外返工' : '返工'}数量明细（按规格）</label>
        <span className={`text-sm font-bold ${mode === 'scrap' ? 'text-rose-600' : 'text-indigo-600'}`}>合计 {reworkActionVariantTotal} 件</span>
      </div>
      <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
        {sortedVariantColorEntries(reworkActionGroupedVariants, reworkActionProduct?.colorIds, reworkActionProduct?.sizeIds).map(([colorId, colorVariants]) => {
          const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
          return (
            <div
              key={colorId}
              className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4"
            >
              <div className="flex items-center gap-2.5 w-40 shrink-0 sm:pb-0.5 min-w-0">
                {color && (
                  <span
                    className="w-5 h-5 rounded-full border border-slate-200 shrink-0"
                    style={{ backgroundColor: (color as { value?: string }).value }}
                  />
                )}
                <span className="text-sm font-bold text-slate-800 leading-tight truncate" title={(color as { name?: string })?.name ?? colorId}>
                  {(color as { name?: string })?.name ?? colorId}
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3 flex-1 min-w-0">
                {colorVariants.map(v => {
                  const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                  const maxVariant = reworkActionPendingByVariant[v.id] ?? 0;
                  const qty = reworkActionVariantQuantities[v.id] ?? 0;
                  return (
                    <div key={v.id} className="flex flex-col gap-1 w-[4.75rem] flex-none">
                      <span className="text-[10px] font-bold text-slate-400 text-center leading-none min-h-[14px] flex items-end justify-center">
                        {size?.name ?? v.sizeId}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={maxVariant}
                        value={qty === 0 ? '' : qty}
                        onChange={e => setReworkActionVariantQuantities(prev => ({ ...prev, [v.id]: Math.min(maxVariant, Math.max(0, Number(e.target.value) || 0)) }))}
                        className={`h-10 w-full box-border bg-white border border-slate-200 rounded-lg px-2 text-sm font-bold tabular-nums ${mode === 'scrap' ? 'text-rose-600 focus:ring-2 focus:ring-rose-200' : 'text-indigo-600 focus:ring-2 focus:ring-indigo-200'} text-right outline-none placeholder:text-[10px] placeholder:text-slate-400 placeholder:text-right`}
                        placeholder={`最多${maxVariant}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={resetAndClose} aria-hidden />
      <div className={`relative bg-white w-full rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden ${reworkActionMode === null ? 'max-w-md' : 'max-w-4xl max-h-[90vh]'}`} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900">不良品处理</h3>
          <button type="button" onClick={resetAndClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            {reworkActionRow.scope === 'product' ? (
              <>
                <span className="font-bold text-indigo-700">按产品汇总</span>
                <span className="mx-1">·</span>
                <span className="font-bold text-slate-800">{reworkActionRow.orderNumber}</span>
              </>
            ) : (
              <span className="font-bold text-slate-800">{reworkActionRow.orderNumber}</span>
            )}
            <span className="mx-1">·</span>
            {reworkActionRow.productName} · {reworkActionRow.milestoneName} · 待处理 <span className="font-bold text-indigo-600">{reworkActionRow.pendingQty}</span> 件
          </p>
          {reworkActionMode === null ? (
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setReworkActionMode('scrap')} className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-slate-200 text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 transition-colors">
                报损
              </button>
              <button type="button" onClick={() => setReworkActionMode('rework')} className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                返工到指定工序
              </button>
              {canOutsourceRework && (
                <button type="button" onClick={() => setReworkActionMode('outsource_rework')} className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1.5">
                  <Truck className="w-4 h-4" /> 委外返工
                </button>
              )}
            </div>
          ) : reworkActionMode === 'scrap' ? (
            <>
              {reworkActionHasColorSize ? renderVariantGrid('scrap') : (
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">报损数量</label>
                  <input type="number" min={1} max={reworkActionRow.pendingQty} value={reworkActionQty || ''} onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none" placeholder={`1 ~ ${reworkActionRow.pendingQty}`} />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因（选填）</label>
                <input type="text" value={reworkActionReason} onChange={e => setReworkActionReason(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none" placeholder="如：不可修复" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetMode} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                <button
                  type="button"
                  disabled={reworkActionHasColorSize ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty)}
                  onClick={handleScrapSubmit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                >
                  确定报损
                </button>
              </div>
            </>
          ) : reworkActionMode === 'rework' ? (
            <>
              {renderNodeSelector()}
              {reworkActionHasColorSize ? renderVariantGrid('rework') : (
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">返工数量</label>
                  <input type="number" min={1} max={reworkActionRow.pendingQty} value={reworkActionQty || ''} onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={`1 ~ ${reworkActionRow.pendingQty}`} />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因（选填）</label>
                <input type="text" value={reworkActionReason} onChange={e => setReworkActionReason(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="如：尺寸不良" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetMode} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                <button
                  type="button"
                  disabled={reworkActionNodeIds.length === 0 || (reworkActionHasColorSize ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty))}
                  onClick={handleReworkSubmit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  生成返工
                </button>
              </div>
            </>
          ) : reworkActionMode === 'outsource_rework' ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
                <SearchablePartnerSelect
                  options={partners}
                  categories={partnerCategories}
                  value={outsourcePartnerName}
                  onChange={name => setOutsourcePartnerName(name)}
                  placeholder="搜索并选择外协工厂..."
                  triggerClassName="bg-white border border-slate-200 min-h-[44px] rounded-xl"
                />
              </div>
              {renderNodeSelector()}
              {reworkActionHasColorSize ? renderVariantGrid('outsource_rework') : (
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">委外返工数量</label>
                  <input type="number" min={1} max={reworkActionRow.pendingQty} value={reworkActionQty || ''} onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={`1 ~ ${reworkActionRow.pendingQty}`} />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因（选填）</label>
                <input type="text" value={reworkActionReason} onChange={e => setReworkActionReason(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="如：工艺缺陷需外部修复" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={resetMode} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                <button
                  type="button"
                  disabled={!outsourcePartnerName.trim() || reworkActionNodeIds.length === 0 || (reworkActionHasColorSize ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty))}
                  onClick={handleOutsourceReworkSubmit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Truck className="w-4 h-4" /> 确认委外返工
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReworkDefectiveActionModal);
