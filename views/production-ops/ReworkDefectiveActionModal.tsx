import React, { useState, useMemo } from 'react';
import { X, Truck, FileText, Layers } from 'lucide-react';
import { toast } from 'sonner';
import {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductCategory,
  ProductMilestoneProgress,
  Partner,
  PartnerCategory,
  PlanFormFieldConfig,
} from '../../types';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { splitQtyBySourceDefectiveAcrossParentOrders } from '../../utils/reworkSplitByProductOrders';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { SupplierSelect } from '../../components/SupplierSelect';
import {
  sectionTitleClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormDetailSplitClass,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillFormFieldControlClass,
} from '../../styles/uiDensity';
import { hasOpsPerm } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { DEFECT_TREATMENT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';

function defectTreatmentCollabFromValues(values: Record<string, unknown>): { collabData?: Record<string, unknown> } {
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v != null && v !== undefined));
  if (!Object.keys(clean).length) return {};
  return { collabData: { [DEFECT_TREATMENT_CUSTOM_DATA_KEY]: clean } };
}

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
  defectTreatmentCustomFields?: PlanFormFieldConfig[];
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
  defectTreatmentCustomFields = [],
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const canOutsourceRework = hasOpsPerm(tenantRole, userPermissions, 'production:rework_outsource:allow');
  const [reworkActionMode, setReworkActionMode] = useState<'scrap' | 'rework' | 'outsource_rework' | null>(null);
  const [reworkActionQty, setReworkActionQty] = useState(0);
  const [reworkActionReason, setReworkActionReason] = useState('');
  const [reworkActionNodeIds, setReworkActionNodeIds] = useState<string[]>([]);
  const [reworkActionVariantQuantities, setReworkActionVariantQuantities] = useState<Record<string, number>>({});
  const [outsourcePartnerName, setOutsourcePartnerName] = useState('');
  const [defectCustomData, setDefectCustomData] = useState<Record<string, unknown>>({});

  const reworkActionProduct = useMemo(() => products.find(p => p.id === reworkActionRow.productId) ?? null, [reworkActionRow, products]);
  const reworkActionCategory = useMemo(() => (reworkActionProduct ? categories.find(c => c.id === reworkActionProduct.categoryId) : null), [reworkActionProduct, categories]);
  const reworkActionHasColorSize = productHasColorSizeMatrix(reworkActionProduct ?? undefined, reworkActionCategory ?? undefined);

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

  /**
   * 有颜色尺码矩阵，但不良在报工中未按规格登记（待处理容量都在 '' 或已删除的规格 id 上）时，
   * 矩阵格子的「最多」会全是 0。此时改按合计数录入，提交用无规格 key 走 splitQtyBySourceDefectiveAcrossParentOrders。
   */
  const reworkTreatMatrixQtyAsAggregate = useMemo(() => {
    if (!reworkActionHasColorSize || reworkActionRow.pendingQty <= 0) return false;
    const ids = reworkActionProduct?.variants?.map(v => v.id) ?? [];
    const onKnown = ids.reduce((s, id) => s + (reworkActionPendingByVariant[id] ?? 0), 0);
    return onKnown <= 0;
  }, [
    reworkActionHasColorSize,
    reworkActionRow.pendingQty,
    reworkActionProduct?.variants,
    reworkActionPendingByVariant,
  ]);

  /** true：按规格矩阵录入数量；false：单笔数量（含「有矩阵但不良未分规格」） */
  const useVariantQtyGrid = reworkActionHasColorSize && !reworkTreatMatrixQtyAsAggregate;

  const reworkActionVariantTotal = useMemo(() => (Object.values(reworkActionVariantQuantities) as number[]).reduce((s, q) => s + (Number(q) || 0), 0), [reworkActionVariantQuantities]);
  const defectMatrixProduct = useMemo(
    () =>
      reworkActionProduct && reworkActionProduct.variants?.length
        ? ({ ...reworkActionProduct, colorIds: undefined, sizeIds: undefined } as Product)
        : null,
    [reworkActionProduct],
  );

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
    setDefectCustomData({});
  };

  const defectCollab = () => defectTreatmentCollabFromValues(defectCustomData);

  const handleScrapSubmit = () => {
    const reason = reworkActionReason || undefined;
    const operator = docOperator;
    const timestamp = new Date().toLocaleString();
    const nodeIdSc = reworkActionRow.nodeId;
    const scrapDocNo = getNextReworkDocNo();
    const parentsSc = orders.filter(o => !o.parentOrderId && o.productId === reworkActionRow.productId);
    const splitProductSc = reworkActionRow.scope === 'product' && parentsSc.length > 0;
    let scrapSavedLines = 0;
    let scrapSavedQty = 0;
    const pushScrap = (oid: string, vid: string | undefined, q: number, rid: string) => {
      if (q <= 0) return;
      scrapSavedLines += 1;
      scrapSavedQty += q;
      onAddRecord({
        id: rid, type: 'SCRAP', orderId: oid || undefined, productId: reworkActionRow.productId, variantId: vid, quantity: q,
        reason, operator, timestamp, nodeId: nodeIdSc, docNo: scrapDocNo,
        ...defectCollab(),
      });
    };
    if (useVariantQtyGrid) {
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
    if (scrapSavedLines > 0) {
      toast.success('报损已保存', {
        description: `处理单号 ${scrapDocNo}，${scrapSavedLines} 条明细，合计 ${scrapSavedQty} 件`,
      });
    }
    resetAndClose();
  };

  const handleReworkSubmit = () => {
    const reason = reworkActionReason || undefined;
    const operator = docOperator;
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
    let reworkSavedLines = 0;
    let reworkSavedQty = 0;
    const pushRework = (oid: string, vid: string | undefined, q: number, rid: string) => {
      if (q <= 0) return;
      reworkSavedLines += 1;
      reworkSavedQty += q;
      onAddRecord({
        id: rid, type: 'REWORK', orderId: oid || undefined, productId: reworkActionRow.productId, variantId: vid, quantity: q,
        reason, operator, timestamp, status: '待返工', sourceNodeId, nodeId: nodeIdFirst, reworkNodeIds: reworkNodeIdsSorted, docNo: reworkDocNo,
        ...defectCollab(),
      });
    };
    if (useVariantQtyGrid) {
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
    if (reworkSavedLines > 0) {
      toast.success('返工已保存', {
        description: `处理单号 ${reworkDocNo}，${reworkSavedLines} 条明细，合计 ${reworkSavedQty} 件`,
      });
    }
    resetAndClose();
  };

  const handleOutsourceReworkSubmit = async () => {
    const partnerName = (outsourcePartnerName || '').trim();
    if (!partnerName) return;
    const reason = reworkActionReason || undefined;
    const operator = docOperator;
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
        ...defectCollab(),
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
    if (useVariantQtyGrid) {
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
    const reworkRecs = batch.filter(r => r.type === 'REWORK');
    const outsourceReworkQty = reworkRecs.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    toast.success('委外返工已保存', {
      description: `返工单号 ${reworkDocNo}，委外单号 ${outsourceDocNo}，${reworkRecs.length} 组，合计 ${outsourceReworkQty} 件`,
    });
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

  const defectCreateFields = (defectTreatmentCustomFields ?? []).filter(f => f.showInCreate);
  const matrixInputClassScrap =
    'h-11 w-[3.25rem] shrink-0 rounded-xl border border-rose-200 bg-white px-2 text-left text-sm font-bold text-rose-700 shadow-sm outline-none focus:ring-2 focus:ring-rose-200 tabular-nums';
  const matrixInputClassRework =
    'h-11 w-[3.25rem] shrink-0 rounded-xl border border-slate-200 bg-white px-2 text-left text-sm font-bold text-indigo-600 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums';

  const renderDefectVariantMatrix = (mode: 'scrap' | 'rework' | 'outsource_rework') => {
    if (!useVariantQtyGrid) return null;
    if (!defectMatrixProduct) return null;
    if (!dictionaries) {
      return (
        <p className="rounded-xl border border-amber-100 bg-amber-50/90 px-3 py-2 text-sm font-bold text-amber-900">
          缺少颜色尺码字典，请先在基础资料维护后再按规格录入。
        </p>
      );
    }
    const inputClass = mode === 'scrap' ? matrixInputClassScrap : matrixInputClassRework;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
          <span className={`shrink-0 text-sm font-bold tabular-nums ${mode === 'scrap' ? 'text-rose-600' : 'text-indigo-600'}`}>
            合计 {reworkActionVariantTotal} 件
          </span>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <VariantQtyMatrixInputs
            product={defectMatrixProduct}
            dictionaries={dictionaries}
            quantities={reworkActionVariantQuantities}
            onVariantQtyChange={(variantId, qty) => {
              const maxVariant = reworkActionPendingByVariant[variantId] ?? 0;
              setReworkActionVariantQuantities(prev => ({ ...prev, [variantId]: Math.min(maxVariant, Math.max(0, qty)) }));
            }}
            getCellExtras={v => {
              const maxVariant = reworkActionPendingByVariant[v.id] ?? 0;
              return {
                max: maxVariant,
                disabled: maxVariant <= 0,
                placeholder: maxVariant <= 0 ? '—' : '0',
                hint: maxVariant > 0 ? `最多${maxVariant}` : undefined,
              };
            }}
            inputClassName={inputClass}
          />
        </div>
      </div>
    );
  };

  const defectCustomFieldsOnly =
    reworkActionMode != null && defectCreateFields.length > 0 ? (
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
        {defectCreateFields.map(cf => (
          <div key={cf.id} className="space-y-1">
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
            <PlanFormCustomFieldInput
              cf={cf}
              value={defectCustomData[cf.id]}
              onChange={v => setDefectCustomData(prev => ({ ...prev, [cf.id]: v }))}
              controlClassName={psiOrderBillFormFieldControlClass}
            />
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={resetAndClose} aria-hidden />
      <div className={`relative bg-white w-full rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden ${reworkActionMode === null ? 'max-w-md' : 'max-w-4xl max-h-[90vh]'}`} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900">不良品处理</h3>
          <button type="button" onClick={resetAndClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {reworkActionMode === null ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:px-4">
                <p className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{reworkActionRow.productName}</p>
                <p className="mt-0.5 text-[10px] sm:text-[11px] font-medium text-slate-500">
                  {reworkActionRow.scope === 'product' ? (
                    <>
                      <span className="font-bold text-indigo-700">按产品汇总</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="font-bold text-slate-600 tabular-nums">{reworkActionRow.orderNumber}</span>
                    </>
                  ) : (
                    <span className="font-bold text-slate-600 tabular-nums">工单 {reworkActionRow.orderNumber}</span>
                  )}
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-bold text-indigo-600">{reworkActionRow.milestoneName}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  待处理 <span className="font-bold text-indigo-600 tabular-nums">{reworkActionRow.pendingQty}</span> 件
                </p>
              </div>
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
            </>
          ) : (
            <div className={psiOrderBillFormSectionStackClass}>
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>1. 基础信息</h3>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:px-4">
                  <p className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{reworkActionRow.productName}</p>
                  <p className="mt-0.5 text-[10px] sm:text-[11px] font-medium text-slate-500">
                    {reworkActionRow.scope === 'product' ? (
                      <>
                        <span className="font-bold text-indigo-700">按产品汇总</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span className="font-bold text-slate-600 tabular-nums">{reworkActionRow.orderNumber}</span>
                      </>
                    ) : (
                      <span className="font-bold text-slate-600 tabular-nums">工单 {reworkActionRow.orderNumber}</span>
                    )}
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="font-bold text-indigo-600">{reworkActionRow.milestoneName}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    待处理 <span className="font-bold text-indigo-600 tabular-nums">{reworkActionRow.pendingQty}</span> 件
                  </p>
                </div>
                {reworkActionMode === 'outsource_rework' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">外协工厂</label>
                    <SupplierSelect
                      options={partners}
                      categories={partnerCategories}
                      value={outsourcePartnerName}
                      onChange={name => setOutsourcePartnerName(name)}
                      placeholder="搜索并选择外协工厂..."
                    />
                  </div>
                )}
                {(reworkActionMode === 'rework' || reworkActionMode === 'outsource_rework') && renderNodeSelector()}
              </div>

              <div className={psiOrderBillFormDetailSplitClass}>
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconEmeraldClass}><Layers className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>2. 数量明细</h3>
                </div>
                <div className="mt-3 space-y-3">
                  {useVariantQtyGrid ? (
                    renderDefectVariantMatrix(
                      reworkActionMode === 'scrap' ? 'scrap' : 'rework',
                    )
                  ) : (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      {reworkTreatMatrixQtyAsAggregate ? (
                        <p className="text-[11px] font-bold text-amber-900 bg-amber-50/90 border border-amber-100 rounded-lg px-2.5 py-2">
                          该工序不良未按颜色尺码登记，请填写合计处理数量（不超过待处理 {reworkActionRow.pendingQty} 件）。
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                            {reworkActionMode === 'scrap' ? '报损数量' : reworkActionMode === 'outsource_rework' ? '委外返工数量' : '返工数量'}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={reworkActionRow.pendingQty}
                              value={(reworkActionQty ?? 0) === 0 ? '' : reworkActionQty}
                              onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))}
                              className={
                                reworkActionMode === 'scrap'
                                  ? 'w-full bg-white border border-rose-200 rounded-xl py-2.5 px-3 text-sm font-bold text-rose-800 outline-none focus:ring-2 focus:ring-rose-500'
                                  : 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500'
                              }
                              placeholder="0"
                              title={`最多 ${reworkActionRow.pendingQty}`}
                            />
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">件</span>
                          </div>
                        </div>
                        <span className="pb-2 text-[10px] font-medium tabular-nums text-slate-400">最多 {reworkActionRow.pendingQty}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>3. 备注与扩展</h3>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">原因（选填）</label>
                  <input
                    type="text"
                    value={reworkActionReason}
                    onChange={e => setReworkActionReason(e.target.value)}
                    className={psiOrderBillFormFieldControlClass}
                    placeholder={
                      reworkActionMode === 'scrap'
                        ? '如：不可修复'
                        : reworkActionMode === 'outsource_rework'
                          ? '如：工艺缺陷需外部修复'
                          : '如：尺寸不良'
                    }
                  />
                </div>
                {defectCustomFieldsOnly}
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={resetMode} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                {reworkActionMode === 'scrap' ? (
                  <button
                    type="button"
                    disabled={useVariantQtyGrid ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty)}
                    onClick={handleScrapSubmit}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                  >
                    确定报损
                  </button>
                ) : reworkActionMode === 'rework' ? (
                  <button
                    type="button"
                    disabled={reworkActionNodeIds.length === 0 || (useVariantQtyGrid ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty))}
                    onClick={handleReworkSubmit}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    生成返工
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!outsourcePartnerName.trim() || reworkActionNodeIds.length === 0 || (useVariantQtyGrid ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty))}
                    onClick={handleOutsourceReworkSubmit}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Truck className="w-4 h-4" /> 确认委外返工
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReworkDefectiveActionModal);
