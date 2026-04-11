import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Clock,
  ClipboardList,
  Layers,
  ScrollText,
  FileText,
  ChevronDown,
  ChevronRight,
  User,
  Package,
  History
} from 'lucide-react';
import { ProductionOpRecord, ProductionOrder } from '../../types';
import {
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageTitleClass,
  pageSubtitleClass,
} from '../../styles/uiDensity';
import { PanelProps, hasOpsPerm, getOrderFamilyIds, getOrderFamilyWithDepth, ReworkPendingRow } from './types';
import { useDataIndexes } from './useDataIndexes';
import { toLocalCompactYmd } from '../../utils/localDateTime';
import {
  milestoneIndexInOrder,
  milestoneIndexInProduct,
  orderCreatedMs,
  productNewestOrderCreatedMs,
  reworkMainListBlockCreatedMs,
  reworkMainListBlockTieId,
} from '../../utils/orderCenterSort';
import ReworkPendingDefectiveModal from './ReworkPendingDefectiveModal';
import ReworkOrderDetailModal from './ReworkOrderDetailModal';
import ReworkMaterialIssueModal from './ReworkMaterialIssueModal';
import DefectTreatmentFlowListModal from './DefectTreatmentFlowListModal';
import DefectTreatmentFlowDetailModal from './DefectTreatmentFlowDetailModal';
import ReworkReportFlowListModal from './ReworkReportFlowListModal';
import ReworkReportFlowDetailModal from './ReworkReportFlowDetailModal';
import ReworkDefectiveActionModal from './ReworkDefectiveActionModal';
import ReworkReportSubmitModal from './ReworkReportSubmitModal';
import { nextOutsourceDocNumber } from '../../utils/partnerDocNumber';

/** sourceReworkId → partner 的预建索引 */
function buildReworkPartnerMap(allRecords: ProductionOpRecord[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of allRecords) {
    if (x.type === 'OUTSOURCE' && x.sourceReworkId && (x.partner ?? '').trim()) {
      m.set(String(x.sourceReworkId), (x.partner ?? '').trim());
    }
  }
  return m;
}

/** REWORK 记录的外协工厂：优先 REWORK.partner，否则从预建索引反查 */
function resolveReworkOutsourcePartner(r: ProductionOpRecord, partnerMap: Map<string, string>): string {
  const fromRec = (r.partner ?? '').trim();
  if (fromRec) return fromRec;
  if (r.id) return partnerMap.get(String(r.id)) ?? '';
  return '';
}

const ReworkPanel: React.FC<PanelProps> = ({
  productionLinkMode = 'order', productMilestoneProgresses = [], records, orders, products, warehouses = [], boms = [], dictionaries, onAddRecord, onAddRecordBatch, onUpdateRecord, onDeleteRecord, globalNodes = [], partners = [], categories = [], partnerCategories = [], workers = [], equipment = [], processSequenceMode = 'free',
  userPermissions, tenantRole
}) => {
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:rework_list:allow');

  /** 返工管理：待处理不良弹窗 */
  const [reworkPendingModalOpen, setReworkPendingModalOpen] = useState(false);
  /** 返工报工流水弹窗（参考报工流水） */
  const [reworkFlowModalOpen, setReworkFlowModalOpen] = useState(false);
  /** 返工报工流水：点击详情的记录（同单号批次在弹窗内按 docNo 聚合） */
  const [reworkFlowDetailRecord, setReworkFlowDetailRecord] = useState<ProductionOpRecord | null>(null);
  /** 返工管理：点击「详情」时展示的工单 id（主工单），弹窗内展示该工单的返工与不良处理情况 */
  const [reworkDetailOrderId, setReworkDetailOrderId] = useState<string | null>(null);
  /** 处理不良品流水弹窗：生成返工(REWORK)+报损(SCRAP)，UI 参考返工报工流水 */
  const [defectFlowModalOpen, setDefectFlowModalOpen] = useState(false);
  const [defectFlowDetailRecord, setDefectFlowDetailRecord] = useState<ProductionOpRecord | null>(null);
  const [reworkListSearchOrder, setReworkListSearchOrder] = useState('');
  const [reworkListSearchProduct, setReworkListSearchProduct] = useState('');
  const [reworkListSearchNodeId, setReworkListSearchNodeId] = useState('');
  /** 待处理不良：当前点击「处理」的行，并弹出处理方式（报损/返工） */
  const [reworkActionRow, setReworkActionRow] = useState<ReworkPendingRow | null>(null);
  /** 返工管理：主工单及子工单 展开/收起 */
  const [reworkExpandedParents, setReworkExpandedParents] = useState<Set<string>>(new Set());
  /** 返工管理：物料弹窗（该工单 BOM 领料，确认后写入生产物料并在领料退料流水中备注「来自于返工」） */
  const [reworkMaterialOrderId, setReworkMaterialOrderId] = useState<string | null>(null);
  /** 返工报工弹窗：点击工序标签打开，当前工单 + 工序 */
  const [reworkReportModal, setReworkReportModal] = useState<{ order: ProductionOrder; nodeId: string; nodeName: string; outsourcePartner?: string } | null>(null);

  const REWORK_PAGE_SIZE = 10;
  const [reworkPage, setReworkPage] = useState(1);
  useEffect(() => { setReworkPage(1); }, [productionLinkMode]);

  const idx = useDataIndexes(orders, products, boms, globalNodes, productMilestoneProgresses);

  /** 父工单列表（无 parentOrderId 的为父工单） */
  const parentOrders = useMemo(() => orders.filter(o => !o.parentOrderId), [orders]);

  /** 返工：待处理不良。工单模式按单+工序；关联产品模式按产品+工序（PMP + 各工单工序不良合并，扣减工单级与无单号返工/报损） */
  const reworkPendingRows = useMemo((): ReworkPendingRow[] => {
    if (productionLinkMode === 'order') {
      const reworkByKey: Record<string, number> = {};
      records
        .filter(r => r.type === 'REWORK' && r.orderId)
        .forEach(r => {
          const srcNode = r.sourceNodeId ?? r.nodeId;
          if (!srcNode) return;
          const key = `${r.orderId}|${srcNode}`;
          reworkByKey[key] = (reworkByKey[key] ?? 0) + r.quantity;
        });
      const scrapByKey: Record<string, number> = {};
      records
        .filter(r => r.type === 'SCRAP' && r.orderId && r.nodeId)
        .forEach(r => {
          const key = `${r.orderId}|${r.nodeId}`;
          scrapByKey[key] = (scrapByKey[key] ?? 0) + r.quantity;
        });
      const rows: ReworkPendingRow[] = [];
      orders.forEach(order => {
        const product = idx.productsById.get(order.productId);
        order.milestones.forEach(ms => {
          const defectiveTotal = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
          if (defectiveTotal <= 0) return;
          const key = `${order.id}|${ms.templateId}`;
          const reworkTotal = reworkByKey[key] ?? 0;
          const scrapTotal = scrapByKey[key] ?? 0;
          const pendingQty = defectiveTotal - reworkTotal - scrapTotal;
          if (pendingQty <= 0) return;
          rows.push({
            scope: 'order',
            orderId: order.id,
            orderNumber: order.orderNumber,
            productId: order.productId,
            productName: product?.name ?? order.productName ?? '—',
            nodeId: ms.templateId,
            milestoneName: ms.name,
            defectiveTotal,
            reworkTotal,
            scrapTotal,
            pendingQty
          });
        });
      });
      rows.sort((a, b) => {
        const oa = idx.ordersById.get(a.orderId);
        const ob = idx.ordersById.get(b.orderId);
        const d = orderCreatedMs(ob!) - orderCreatedMs(oa!);
        if (d !== 0) return d;
        const ma = milestoneIndexInOrder(oa, a.nodeId);
        const mb = milestoneIndexInOrder(ob, b.nodeId);
        if (ma !== mb) return ma - mb;
        return (a.orderNumber || '').localeCompare(b.orderNumber || '');
      });
      return rows;
    }
    const prodKey = (productId: string, nodeId: string) => `${productId}|${nodeId}`;
    const defectiveMap = new Map<string, number>();
    productMilestoneProgresses.forEach(pmp => {
      const k = prodKey(pmp.productId, pmp.milestoneTemplateId);
      const d = (pmp.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
      defectiveMap.set(k, (defectiveMap.get(k) ?? 0) + d);
    });
    orders.forEach(order => {
      order.milestones.forEach(ms => {
        const d = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
        if (d <= 0) return;
        const k = prodKey(order.productId, ms.templateId);
        defectiveMap.set(k, (defectiveMap.get(k) ?? 0) + d);
      });
    });
    const reworkProd = new Map<string, number>();
    records
      .filter(r => r.type === 'REWORK' && r.productId)
      .forEach(r => {
        const src = r.sourceNodeId ?? r.nodeId;
        if (!src) return;
        const k = prodKey(r.productId, src);
        reworkProd.set(k, (reworkProd.get(k) ?? 0) + r.quantity);
      });
    const scrapProd = new Map<string, number>();
    records
      .filter(r => r.type === 'SCRAP' && r.productId && r.nodeId)
      .forEach(r => {
        const k = prodKey(r.productId, r.nodeId);
        scrapProd.set(k, (scrapProd.get(k) ?? 0) + r.quantity);
      });
    const rows: ReworkPendingRow[] = [];
    defectiveMap.forEach((defectiveTotal, key) => {
      if (defectiveTotal <= 0) return;
      const [productId, nodeId] = key.split('|');
      const reworkTotal = reworkProd.get(key) ?? 0;
      const scrapTotal = scrapProd.get(key) ?? 0;
      const pendingQty = defectiveTotal - reworkTotal - scrapTotal;
      if (pendingQty <= 0) return;
      const product = idx.productsById.get(productId);
      const parents = idx.rootOrdersByProductId.get(productId) ?? [];
      const cnt = parents.length;
      const parentNos = parents.map(o => o.orderNumber).filter(Boolean) as string[];
      const productOrdersTitle = parentNos.join('、');
      const productOrdersLine =
        parentNos.length === 0
          ? undefined
          : parentNos.length <= 2
            ? productOrdersTitle
            : `${parentNos.slice(0, 2).join('、')} … 共 ${cnt} 单`;
      const firstNo = parents[0]?.orderNumber;
      rows.push({
        scope: 'product',
        orderId: '',
        orderNumber: cnt > 1 ? `关联产品（${cnt}条工单）` : firstNo ? `${firstNo}（按产品）` : '按产品汇总',
        productId,
        productName: product?.name ?? '—',
        nodeId,
        milestoneName: idx.nodesById.get(nodeId)?.name ?? nodeId,
        defectiveTotal,
        reworkTotal,
        scrapTotal,
        pendingQty,
        productOrderCount: cnt,
        productOrdersLine,
        productOrdersTitle: parentNos.length ? productOrdersTitle : undefined
      });
    });
    rows.sort((a, b) => {
      const d = productNewestOrderCreatedMs(b.productId, orders) - productNewestOrderCreatedMs(a.productId, orders);
      if (d !== 0) return d;
      if (a.productId !== b.productId) return a.productId.localeCompare(b.productId);
      const pa = idx.productsById.get(a.productId);
      const pb = idx.productsById.get(b.productId);
      return milestoneIndexInProduct(pa, a.nodeId) - milestoneIndexInProduct(pb, b.nodeId);
    });
    return rows;
  }, [productionLinkMode, records, orders, products, productMilestoneProgresses, globalNodes, idx]);

  /** 顺序模式：单条返工记录在工序 nodeId 上的「剩余可报数」= 上道已完成流入本道 - 本道已完成 */
  const reworkRemainingAtNode = (r: ProductionOpRecord, nodeId: string): number => {
    const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
    const idx = pathNodes.indexOf(nodeId);
    if (idx < 0) return 0;
    const doneAtNode = r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) ? r.quantity : 0);
    if (processSequenceMode === 'sequential' && idx > 0) {
      const prevNodeId = pathNodes[idx - 1];
      const doneAtPrev = r.reworkCompletedQuantityByNode?.[prevNodeId] ?? 0;
      return Math.max(0, Math.min(doneAtPrev, r.quantity) - doneAtNode);
    }
    return Math.max(0, r.quantity - doneAtNode);
  };

  /** 返工管理·关联产品：按产品汇总各返工目标工序（不区分工单） */
  const reworkStatsByProductId = useMemo(() => {
    if (productionLinkMode !== 'product') {
      return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number; outsourcePartner?: string }[]>();
    }
    const reworkPartnerMap = buildReworkPartnerMap(records);
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const parentIdSetByProduct = new Map<string, Set<string>>();
    parentOrders.forEach(o => {
      if (!parentIdSetByProduct.has(o.productId)) parentIdSetByProduct.set(o.productId, new Set());
      parentIdSetByProduct.get(o.productId)!.add(o.id);
    });
    const byProduct = new Map<string, Map<string, { nodeId: string; totalQty: number; completedQty: number; pendingSeq: number; outsourcePartner: string }>>();
    reworkRecords.forEach(r => {
      const pid = r.productId;
      if (!pid) return;
      const parents = parentIdSetByProduct.get(pid);
      if (!parents) return;
      if (r.orderId && !parents.has(r.orderId)) return;
      const byKey = byProduct.get(pid) ?? new Map();
      const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      const completed =
        r.status === '已完成' ||
        (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
      const outsourcePartnerName = resolveReworkOutsourcePartner(r, reworkPartnerMap);
      targetNodes.forEach(nodeId => {
        const groupKey = `${nodeId}\0${outsourcePartnerName}`;
        const cur = byKey.get(groupKey) ?? { nodeId, totalQty: 0, completedQty: 0, pendingSeq: 0, outsourcePartner: outsourcePartnerName };
        cur.totalQty += r.quantity;
        const doneAtNode =
          r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
        cur.completedQty += Math.min(r.quantity, doneAtNode);
        cur.pendingSeq += reworkRemainingAtNode(r, nodeId);
        byKey.set(groupKey, cur);
      });
      byProduct.set(pid, byKey);
    });
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number; outsourcePartner?: string }[]>();
    byProduct.forEach((byKey, pid) => {
      const product = idx.productsById.get(pid);
      const seq = product?.milestoneNodeIds ?? [];
      let list = Array.from(byKey.values())
        .filter(v => v.totalQty > 0)
        .map(v => ({
          nodeId: v.nodeId,
          nodeName: idx.nodesById.get(v.nodeId)?.name ?? v.nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty,
          outsourcePartner: v.outsourcePartner || undefined,
        }));
      const sortByNodeThenPartner = (a: typeof list[0], b: typeof list[0], getIdx: (nid: string) => number) => {
        const ia = getIdx(a.nodeId);
        const ib = getIdx(b.nodeId);
        if (ia !== ib) return ia - ib;
        const ao = a.outsourcePartner ? 1 : 0;
        const bo = b.outsourcePartner ? 1 : 0;
        return ao - bo;
      };
      if (seq.length) {
        const seqIndex = new Map<string, number>();
        for (let i = 0; i < seq.length; i++) seqIndex.set(seq[i], i);
        list.sort((a, b) => sortByNodeThenPartner(a, b, nid => seqIndex.get(nid) ?? 999));
      } else {
        list.sort((a, b) => sortByNodeThenPartner(a, b, nid => idx.nodeIndexMap.get(nid) ?? 999));
      }
      if (list.length > 0) result.set(pid, list);
    });
    return result;
  }, [productionLinkMode, records, parentOrders, products, globalNodes, processSequenceMode]);

  /** 返工管理·关联工单：按单 + 目标工序聚合 */
  const reworkStatsByOrderId = useMemo(() => {
    if (productionLinkMode === 'product') {
      return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number; outsourcePartner?: string }[]>();
    }
    const reworkPartnerMap = buildReworkPartnerMap(records);
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const reworkByOrderId = new Map<string, ProductionOpRecord[]>();
    for (const r of reworkRecords) {
      if (!r.orderId) continue;
      let arr = reworkByOrderId.get(r.orderId);
      if (!arr) { arr = []; reworkByOrderId.set(r.orderId, arr); }
      arr.push(r);
    }
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number; outsourcePartner?: string }[]>();
    orders.forEach(order => {
      const orderReworks = reworkByOrderId.get(order.id);
      if (!orderReworks || orderReworks.length === 0) return;
      const byKey = new Map<string, { nodeId: string; totalQty: number; completedQty: number; pendingSeq: number; outsourcePartner: string }>();
      orderReworks.forEach(r => {
        const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
        const completed =
          r.status === '已完成' ||
          (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
        const outsourcePartnerName = resolveReworkOutsourcePartner(r, reworkPartnerMap);
        targetNodes.forEach(nodeId => {
          const groupKey = `${nodeId}\0${outsourcePartnerName}`;
          const cur = byKey.get(groupKey) ?? { nodeId, totalQty: 0, completedQty: 0, pendingSeq: 0, outsourcePartner: outsourcePartnerName };
          cur.totalQty += r.quantity;
          const doneAtNode =
            r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
          cur.completedQty += Math.min(r.quantity, doneAtNode);
          cur.pendingSeq += reworkRemainingAtNode(r, nodeId);
          byKey.set(groupKey, cur);
        });
      });
      const list = Array.from(byKey.values())
        .filter(v => v.totalQty > 0)
        .map(v => ({
          nodeId: v.nodeId,
          nodeName: idx.nodesById.get(v.nodeId)?.name ?? v.nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty,
          outsourcePartner: v.outsourcePartner || undefined,
        }))
        .sort((a, b) => {
          const idxA = idx.nodeIndexMap.get(a.nodeId) ?? 999;
          const idxB = idx.nodeIndexMap.get(b.nodeId) ?? 999;
          if (idxA !== idxB) return idxA - idxB;
          const ao = a.outsourcePartner ? 1 : 0;
          const bo = b.outsourcePartner ? 1 : 0;
          return ao - bo;
        });
      if (list.length > 0) result.set(order.id, list);
    });
    return result;
  }, [productionLinkMode, records, orders, globalNodes, processSequenceMode, idx]);

  /** 处理不良品流水单号（生成返工 REWORK + 报损 SCRAP 共用）：FL + 日期(yyyyMMdd) + 序号(4位)，使两条流水单号连续 */
  const getNextReworkDocNo = () => {
    const todayStr = toLocalCompactYmd(new Date());
    const pattern = `FL${todayStr}-`;
    const existing = records.filter(r => (r.type === 'REWORK' || r.type === 'SCRAP') && r.docNo && r.docNo.startsWith(pattern));
    const used = new Set(existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n) && n >= 1));
    let next = 1;
    while (used.has(next)) next++;
    return `FL${todayStr}-${String(next).padStart(4, '0')}`;
  };

  /** 返工报工流水单号（REWORK_REPORT）：FG + 日期(yyyyMMdd) + 序号(4位)；仅统计 REWORK_REPORT，使返工报工流水中单号连续 */
  const getNextReworkReportDocNo = () => {
    const todayStr = toLocalCompactYmd(new Date());
    const pattern = `FG${todayStr}-`;
    const existing = records.filter(r => r.type === 'REWORK_REPORT' && r.docNo && r.docNo.startsWith(pattern));
    const used = new Set(existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n) && n >= 1));
    let next = 1;
    while (used.has(next)) next++;
    return `FG${todayStr}-${String(next).padStart(4, '0')}`;
  };

  const getNextOutsourceReworkDocNo = (partnerName: string): string =>
    nextOutsourceDocNumber('dispatch', partners, records, '', partnerName.trim());

  /** 返工管理：工单模式=主/子分组；关联产品模式=仅按产品一条（工序汇总） */
  const reworkListBlocks = useMemo(() => {
    if (productionLinkMode === 'product') {
      return (Array.from(reworkStatsByProductId.keys()) as string[])
        .sort((a, b) => {
          const d = productNewestOrderCreatedMs(b, orders) - productNewestOrderCreatedMs(a, orders);
          if (d !== 0) return d;
          return a.localeCompare(b);
        })
        .map(productId => ({ type: 'productAggregate' as const, productId }));
    }
    const reworkOrderIds = new Set(orders.filter(o => (reworkStatsByOrderId.get(o.id)?.length ?? 0) > 0).map(o => o.id));
    const parentHasRework = (parent: ProductionOrder) => {
      if (reworkOrderIds.has(parent.id)) return true;
      return getOrderFamilyIds(orders, parent.id, idx.childrenByParentId).some(id => reworkOrderIds.has(id));
    };
    const blocks: ({ type: 'single'; order: ProductionOrder } | { type: 'parentChild'; parent: ProductionOrder; children: ProductionOrder[] })[] = [];
    const used = new Set<string>();
    parentOrders.forEach(order => {
      if (used.has(order.id)) return;
      const childList = idx.childrenByParentId.get(order.id) ?? [];
      if (childList.length > 0 && parentHasRework(order)) {
        used.add(order.id);
        getOrderFamilyIds(orders, order.id, idx.childrenByParentId).forEach(id => used.add(id));
        blocks.push({ type: 'parentChild', parent: order, children: childList });
      } else if (reworkStatsByOrderId.has(order.id)) {
        used.add(order.id);
        blocks.push({ type: 'single', order });
      }
    });
    return blocks.sort(
      (a, b) =>
        reworkMainListBlockCreatedMs(b, idx.childrenByParentId) - reworkMainListBlockCreatedMs(a, idx.childrenByParentId) ||
        reworkMainListBlockTieId(a).localeCompare(reworkMainListBlockTieId(b)),
    );
  }, [productionLinkMode, parentOrders, orders, reworkStatsByOrderId, reworkStatsByProductId, products, productMilestoneProgresses, idx]);

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>返工管理</h1>
          <p className={pageSubtitleClass}>不良品处理与返工报工追踪</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
          {hasOpsPerm(tenantRole, userPermissions, 'production:rework_defective:allow') && (
          <button
            type="button"
            onClick={() => setReworkPendingModalOpen(true)}
            className={outlineToolbarButtonClass}
          >
            <ClipboardList className="w-4 h-4 shrink-0" /> 待处理不良
          </button>
          )}
          {hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:view') &&
            !hasOpsPerm(tenantRole, userPermissions, 'production:rework_defective:allow') && (
            <button
              type="button"
              onClick={() => {
                setDefectFlowModalOpen(true);
                setDefectFlowDetailRecord(null);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all"
            >
              <ScrollText className="w-4 h-4 shrink-0" /> 处理不良品流水
            </button>
          )}
          {hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:view') && (
          <button
            type="button"
            onClick={() => setReworkFlowModalOpen(true)}
            className={outlineToolbarButtonClass}
          >
            <History className="w-4 h-4 shrink-0" /> 返工报工流水
          </button>
          )}
        </div>
      </div>

      {/* No permission */}
      {!reworkPendingModalOpen && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看返工管理列表</p>
        </div>
      )}

      {/* Main rework list */}
      {!reworkPendingModalOpen && canViewMainList && (
        <div className="space-y-2">
          {parentOrders.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">暂无工单，请先在「生产计划」下达工单</p>
            </div>
          ) : reworkListBlocks.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">暂无返工记录，请先在「待处理不良」中处理不良品</p>
            </div>
          ) : (
            (() => {
              const reworkTotalPages = Math.max(1, Math.ceil(reworkListBlocks.length / REWORK_PAGE_SIZE));
              const pagedBlocks = reworkListBlocks.slice((reworkPage - 1) * REWORK_PAGE_SIZE, reworkPage * REWORK_PAGE_SIZE);
              return (<>
            {pagedBlocks.map((block) => {
              const renderReworkCard = (order: ProductionOrder, isChild?: boolean, indentPx?: number) => {
                const product = idx.productsById.get(order.productId);
                const stats = [...(reworkStatsByOrderId.get(order.id) ?? [])];
                const orderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const cardClass = isChild
                  ? 'bg-white px-5 py-2 rounded-2xl border border-l-4 border-l-slate-300 border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center'
                  : 'bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 lg:gap-4 items-center';
                return (
                  <div key={order.id} className={cardClass} style={indentPx != null && indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
                    <div className="flex items-center gap-4 min-w-0">
                      {product?.imageUrl ? (
                        <button type="button" onClick={() => setReworkDetailOrderId(order.parentOrderId ?? order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} overflow-hidden border border-slate-100 flex-shrink-0 focus:ring-2 focus:ring-indigo-500 outline-none block`}>
                          <img loading="lazy" decoding="async" src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => setReworkDetailOrderId(order.parentOrderId ?? order.id)} className={`${isChild ? 'w-12 h-12 rounded-xl' : 'w-14 h-14 rounded-2xl'} flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors`}>
                          <Layers className={isChild ? 'w-6 h-6' : 'w-7 h-7'} />
                        </button>
                      )}
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{order.orderNumber}</span>
                          {isChild && <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">子工单</span>}
                          <span className={`font-bold text-slate-800 ${isChild ? 'text-base' : 'text-lg'}`}>{order.productName || '未知产品'}</span>
                          {order.sku && <span className="text-[10px] font-bold text-slate-500">{order.sku}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          {productionLinkMode !== 'product' && order.customer && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.customer}</span>}
                          <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>
                          {order.startDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 开始: {(order.startDate || '').trim().slice(0, 10)}</span>}
                          {order.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 交期: {(order.dueDate || '').trim().slice(0, 10)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                      {stats.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x -mx-0.5">
                          <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
                            {stats.map(({ nodeId, nodeName, totalQty, completedQty, pendingQty, outsourcePartner }) => {
                              const isAllDone = pendingQty <= 0;
                              const isOutsource = !!outsourcePartner;
                              return (
                                <button
                                  key={`${nodeId}\0${outsourcePartner ?? ''}`}
                                  type="button"
                                  title={isOutsource
                                    ? (isAllDone
                                      ? `工序「${nodeName}」委外返工已收回·${outsourcePartner}：总 ${totalQty}，已返工 ${completedQty}（点击查看）`
                                      : `工序「${nodeName}」委外返工中·${outsourcePartner}：总 ${totalQty}，已返工 ${completedQty}，待收回 ${pendingQty}（点击收回）`)
                                    : `工序「${nodeName}」返工：总 ${totalQty}，已返工 ${completedQty}，${processSequenceMode === 'sequential' ? '可报 ' : '未返工 '}${pendingQty}${processSequenceMode === 'sequential' ? '（顺序模式：上道流入可报数）' : ''}（点击报工）`}
                                  onClick={() => { setReworkReportModal({ order, nodeId, nodeName, outsourcePartner: outsourcePartner || undefined }); }}
                                  className={`flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border transition-colors text-left cursor-pointer ${isOutsource ? 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200' : 'bg-slate-50 border-slate-100 hover:bg-indigo-50 hover:border-indigo-200'}`}
                                >
                                  {isOutsource ? (
                                    <>
                                      <div className="mb-1 w-full text-center leading-tight">
                                        <div className="text-[10px] font-bold text-emerald-600 truncate" title={nodeName}>{nodeName}</div>
                                        <div className="text-[10px] font-bold text-slate-600 truncate" title={outsourcePartner}>{outsourcePartner}</div>
                                      </div>
                                      <div
                                        className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}
                                        title="已返工数量"
                                      >
                                        <span className="text-base font-black text-slate-900 leading-none">{completedQty}</span>
                                      </div>
                                      <div className="flex items-center justify-center gap-1.5 leading-tight">
                                        <span className="text-[10px] font-bold text-slate-500 tabular-nums" title="返工总量 / 可报">{totalQty} / {pendingQty}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-bold text-indigo-600 mb-1 leading-tight truncate w-full text-center">{nodeName}</span>
                                      <div
                                        className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}
                                        title="已返工数量"
                                      >
                                        <span className="text-base font-black text-slate-900 leading-none">{completedQty}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
                                        <span title="返工总量 / 可报">{totalQty} / {pendingQty}</span>
                                      </div>
                                    </>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 text-slate-400 text-sm italic">该工单暂无返工工序</div>
                      )}
                      {(hasOpsPerm(tenantRole, userPermissions, 'production:rework_detail:allow') || hasOpsPerm(tenantRole, userPermissions, 'production:rework_material:allow')) && (
                      <div className="flex flex-col gap-2 shrink-0 pt-0.5">
                        {hasOpsPerm(tenantRole, userPermissions, 'production:rework_detail:allow') && (
                        <button
                          type="button"
                          onClick={() => setReworkDetailOrderId(order.parentOrderId ?? order.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        )}
                        {hasOpsPerm(tenantRole, userPermissions, 'production:rework_material:allow') && (
                        <button
                          type="button"
                          onClick={() => { setReworkMaterialOrderId(order.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <Package className="w-3.5 h-3.5" /> 物料
                        </button>
                        )}
                      </div>
                      )}
                    </div>
                  </div>
                );
              };

              if (block.type === 'productAggregate') {
                const fp = idx.productsById.get(block.productId);
                const stats = reworkStatsByProductId.get(block.productId) ?? [];
                const productParents = idx.rootOrdersByProductId.get(block.productId) ?? [];
                const repOrder = [...productParents]
                  .sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''))[0];
                const totalQtyAll = productParents
                  .reduce((s, o) => s + o.items.reduce((t, i) => t + i.quantity, 0), 0);
                if (!repOrder) return null;
                return (
                  <div
                    key={`rework-prod-${block.productId}`}
                    className="bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all group grid grid-cols-1 lg:grid-cols-[360px_1fr_auto] gap-3 lg:gap-4 items-center"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {fp?.imageUrl ? (
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                          <img loading="lazy" decoding="async" src={fp.imageUrl} alt={fp.name} className="w-full h-full object-cover block" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600">
                          <Layers className="w-7 h-7" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">按产品汇总</span>
                          <span className="font-bold text-slate-800 text-lg">{fp?.name ?? '未知产品'}</span>
                          {fp?.sku && <span className="text-[10px] font-bold text-slate-500">{fp.sku}</span>}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" /> 合计件数: {totalQtyAll}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 -my-0.5">
                      {stats.length > 0 ? (
                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden scroll-smooth custom-scrollbar touch-pan-x -mx-0.5">
                          <div className="flex items-stretch gap-1.5 flex-nowrap py-0.5 w-max px-0.5">
                            {stats.map(({ nodeId, nodeName, totalQty, completedQty, pendingQty, outsourcePartner }) => {
                              const isAllDone = pendingQty <= 0;
                              const isOutsource = !!outsourcePartner;
                              return (
                                <button
                                  key={`${nodeId}\0${outsourcePartner ?? ''}`}
                                  type="button"
                                  title={isOutsource
                                    ? (isAllDone
                                      ? `工序「${nodeName}」委外返工已收回·${outsourcePartner}：总 ${totalQty}，已返工 ${completedQty}（点击查看）`
                                      : `工序「${nodeName}」委外返工中·${outsourcePartner}：总 ${totalQty}，已返工 ${completedQty}，待收回 ${pendingQty}（点击收回）`)
                                    : `工序「${nodeName}」返工（全产品汇总）：总 ${totalQty}，已返工 ${completedQty}，${processSequenceMode === 'sequential' ? '可报 ' : '未返工 '}${pendingQty}（点击报工，以首单为载体）`}
                                  onClick={() => {
                                    setReworkReportModal({ order: repOrder, nodeId, nodeName, outsourcePartner: outsourcePartner || undefined });
                                  }}
                                  className={`flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border transition-colors text-left cursor-pointer ${isOutsource ? 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200' : 'bg-slate-50 border-slate-100 hover:bg-indigo-50 hover:border-indigo-200'}`}
                                >
                                  {isOutsource ? (
                                    <>
                                      <div className="mb-1 w-full text-center leading-tight">
                                        <div className="text-[10px] font-bold text-emerald-600 truncate" title={nodeName}>{nodeName}</div>
                                        <div className="text-[10px] font-bold text-slate-600 truncate" title={outsourcePartner}>{outsourcePartner}</div>
                                      </div>
                                      <div
                                        className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}
                                        title="已返工数量"
                                      >
                                        <span className="text-base font-black text-slate-900 leading-none">{completedQty}</span>
                                      </div>
                                      <div className="flex items-center justify-center gap-1.5 leading-tight">
                                        <span className="text-[10px] font-bold text-slate-500 tabular-nums" title="返工总量 / 可报">{totalQty} / {pendingQty}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-bold text-indigo-600 mb-1 leading-tight truncate w-full text-center">{nodeName}</span>
                                      <div
                                        className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}
                                        title="已返工数量"
                                      >
                                        <span className="text-base font-black text-slate-900 leading-none">{completedQty}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
                                        <span title="返工总量 / 可报">{totalQty} / {pendingQty}</span>
                                      </div>
                                    </>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 text-slate-400 text-sm italic">暂无返工工序</div>
                      )}
                    </div>
                    {(hasOpsPerm(tenantRole, userPermissions, 'production:rework_detail:allow') || hasOpsPerm(tenantRole, userPermissions, 'production:rework_material:allow')) && (
                      <div className="flex flex-col gap-2 shrink-0 pt-0.5">
                        {hasOpsPerm(tenantRole, userPermissions, 'production:rework_detail:allow') && (
                        <button
                          type="button"
                          onClick={() => setReworkDetailOrderId(repOrder.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        )}
                        {hasOpsPerm(tenantRole, userPermissions, 'production:rework_material:allow') && (
                        <button
                          type="button"
                          onClick={() => { setReworkMaterialOrderId(repOrder.id); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                        >
                          <Package className="w-3.5 h-3.5" /> 物料
                        </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              if (block.type === 'single') {
                return <div key={block.order.id}>{renderReworkCard(block.order)}</div>;
              }
              const { parent, children: childList } = block;
              const allWithDepth = getOrderFamilyWithDepth(orders, parent.id, idx.ordersById, idx.childrenByParentId);
              const isExpanded = reworkExpandedParents.has(parent.id);
              return (
                <div key={`rework-parentChild-${parent.id}`} className="rounded-2xl border-2 border-slate-300 bg-slate-50/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setReworkExpandedParents(prev => { const next = new Set(prev); if (next.has(parent.id)) next.delete(parent.id); else next.add(parent.id); return next; })}
                    className="w-full px-4 py-2 border-b border-slate-200 bg-slate-100/80 flex items-center gap-2 hover:bg-slate-200/60 transition-colors text-left"
                    title={isExpanded ? '收起子工单' : '展开子工单'}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />}
                    <Plus className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">主工单及子工单（共 {allWithDepth.length} 条）</span>
                  </button>
                  <div className="p-2.5 space-y-1.5">
                    {isExpanded ? allWithDepth.map(({ order, depth }) => renderReworkCard(order, depth > 0, depth > 0 ? 24 * depth : 0)) : renderReworkCard(parent)}
                  </div>
                </div>
              );
            })}
            {reworkTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
                <span className="text-xs text-slate-400">共 {reworkListBlocks.length} 项，第 {reworkPage} / {reworkTotalPages} 页</span>
                <button type="button" disabled={reworkPage <= 1} onClick={() => setReworkPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                <button type="button" disabled={reworkPage >= reworkTotalPages} onClick={() => setReworkPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
              </div>
            )}
            </>); })()
          )}
        </div>
      )}

      {/* ══════════════ MODALS ══════════════ */}

      {reworkPendingModalOpen && (
        <ReworkPendingDefectiveModal
          productionLinkMode={productionLinkMode}
          products={products}
          orders={orders}
          productMilestoneProgresses={productMilestoneProgresses}
          reworkPendingRows={reworkPendingRows}
          reworkListSearchOrder={reworkListSearchOrder}
          setReworkListSearchOrder={setReworkListSearchOrder}
          reworkListSearchProduct={reworkListSearchProduct}
          setReworkListSearchProduct={setReworkListSearchProduct}
          reworkListSearchNodeId={reworkListSearchNodeId}
          setReworkListSearchNodeId={setReworkListSearchNodeId}
          onClose={() => setReworkPendingModalOpen(false)}
          onAction={setReworkActionRow}
          onOpenDefectTreatmentFlow={
            hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:view')
              ? () => {
                  setDefectFlowModalOpen(true);
                  setDefectFlowDetailRecord(null);
                }
              : undefined
          }
        />
      )}

      {reworkDetailOrderId && (
        <ReworkOrderDetailModal
          reworkDetailOrderId={reworkDetailOrderId}
          orders={orders}
          products={products}
          records={records}
          globalNodes={globalNodes}
          reworkStatsByOrderId={reworkStatsByOrderId}
          onClose={() => setReworkDetailOrderId(null)}
        />
      )}

      {reworkMaterialOrderId && onAddRecord && (
        <ReworkMaterialIssueModal
          reworkMaterialOrderId={reworkMaterialOrderId}
          orders={orders}
          products={products}
          records={records}
          warehouses={warehouses}
          boms={boms}
          globalNodes={globalNodes}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onClose={() => setReworkMaterialOrderId(null)}
        />
      )}

      {defectFlowModalOpen && (
        <DefectTreatmentFlowListModal
          productionLinkMode={productionLinkMode}
          records={records}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          onClose={() => { setDefectFlowModalOpen(false); setDefectFlowDetailRecord(null); }}
          onViewDetail={setDefectFlowDetailRecord}
        />
      )}

      {defectFlowDetailRecord && (
        <DefectTreatmentFlowDetailModal
          productionLinkMode={productionLinkMode}
          defectFlowDetailRecord={defectFlowDetailRecord}
          records={records}
          orders={orders}
          products={products}
          categories={categories}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          onUpdateRecord={onUpdateRecord}
          onDeleteRecord={onDeleteRecord}
          onClose={() => { setDefectFlowDetailRecord(null); }}
        />
      )}

      {reworkFlowModalOpen && (
        <ReworkReportFlowListModal
          productionLinkMode={productionLinkMode}
          records={records}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          onClose={() => { setReworkFlowModalOpen(false); setReworkFlowDetailRecord(null); }}
          onViewDetail={setReworkFlowDetailRecord}
        />
      )}

      {reworkFlowDetailRecord && (
        <ReworkReportFlowDetailModal
          productionLinkMode={productionLinkMode}
          reworkFlowDetailRecord={reworkFlowDetailRecord}
          records={records}
          orders={orders}
          products={products}
          categories={categories}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          workers={workers}
          equipment={equipment}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          onUpdateRecord={onUpdateRecord}
          onDeleteRecord={onDeleteRecord}
          onClose={() => { setReworkFlowDetailRecord(null); }}
        />
      )}

      {reworkActionRow && (
        <ReworkDefectiveActionModal
          reworkActionRow={reworkActionRow}
          records={records}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          categories={categories}
          productMilestoneProgresses={productMilestoneProgresses}
          partners={partners}
          partnerCategories={partnerCategories}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          getNextReworkDocNo={getNextReworkDocNo}
          getNextOutsourceReworkDocNo={getNextOutsourceReworkDocNo}
          onClose={() => { setReworkActionRow(null); }}
        />
      )}

      {reworkReportModal && onUpdateRecord && (
        <ReworkReportSubmitModal
          reworkReportModal={reworkReportModal}
          productionLinkMode={productionLinkMode}
          records={records}
          products={products}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          categories={categories}
          workers={workers}
          equipment={equipment}
          processSequenceMode={processSequenceMode}
          partners={partners}
          onAddRecord={onAddRecord}
          onUpdateRecord={onUpdateRecord}
          getNextReworkReportDocNo={getNextReworkReportDocNo}
          onClose={() => { setReworkReportModal(null); }}
        />
      )}
    </div>
  );
};

export default React.memo(ReworkPanel);
