import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Undo2,
  ClipboardList,
  Layers,
  ScrollText,
  FileText,
  User,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  Warehouse,
  BOM,
  AppDictionaries,
  GlobalNodeTemplate,
  Partner,
  ProductCategory,
  PartnerCategory,
  ProcessSequenceMode,
  ProductMilestoneProgress,
} from '../../types';
import { PanelProps, hasOpsPerm, OutsourceModalType } from './types';
import { useDataIndexes } from './useDataIndexes';
import * as api from '../../services/api';
import {
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../../styles/uiDensity';
import { productGroupMaxReportableSum, pmpCompletedAtTemplate } from '../../utils/productReportAggregates';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import OutsourceMaterialDispatchModal from './OutsourceMaterialDispatchModal';
import OutsourceMaterialReturnModal from './OutsourceMaterialReturnModal';
import OutsourceDispatchListModal from './OutsourceDispatchListModal';
import OutsourceDispatchQuantityModal from './OutsourceDispatchQuantityModal';
import OutsourceReceiveListModal from './OutsourceReceiveListModal';
import OutsourceReceiveQuantityModal from './OutsourceReceiveQuantityModal';
import OutsourceFlowListModal from './OutsourceFlowListModal';
import OutsourceFlowDocumentDetailModal from './OutsourceFlowDocumentDetailModal';
import OutsourceCollabSyncModal from './OutsourceCollabSyncModal';

const OutsourcePanel: React.FC<PanelProps> = ({
  productionLinkMode,
  productMilestoneProgresses,
  records,
  orders,
  products,
  warehouses,
  boms,
  dictionaries,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  globalNodes,
  partners,
  categories,
  partnerCategories,
  workers,
  equipment,
  processSequenceMode,
  userPermissions,
  tenantRole,
}) => {
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:outsource_list:allow');

  const [outsourceModal, setOutsourceModal] = useState<OutsourceModalType | null>(null);
  const [dispatchPartnerName, setDispatchPartnerName] = useState('');
  const [dispatchSelectedKeys, setDispatchSelectedKeys] = useState<Set<string>>(new Set());
  const [dispatchFormModalOpen, setDispatchFormModalOpen] = useState(false);
  const [dispatchFormQuantities, setDispatchFormQuantities] = useState<Record<string, number>>({});
  const [dispatchRemark, setDispatchRemark] = useState('');
  const [collabSyncConfirm, setCollabSyncConfirm] = useState<{
    partnerName: string;
    collaborationTenantId: string;
    recordIds: string[];
  } | null>(null);
  const [collabRoutes, setCollabRoutes] = useState<any[]>([]);

  const [receiveSelectedKeys, setReceiveSelectedKeys] = useState<Set<string>>(new Set());
  const [receiveFormModalOpen, setReceiveFormModalOpen] = useState(false);
  const [receiveFormQuantities, setReceiveFormQuantities] = useState<Record<string, number>>({});
  const [receiveFormUnitPrices, setReceiveFormUnitPrices] = useState<Record<string, number>>({});
  const [receiveFormRemark, setReceiveFormRemark] = useState('');
  const [receiveModal, setReceiveModal] = useState<{ orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; pendingQty: number } | null>(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [flowDetailKey, setFlowDetailKey] = useState<string | null>(null);
  const [matDispatchOrderId, setMatDispatchOrderId] = useState<string | null>(null);
  const [matDispatchProductId, setMatDispatchProductId] = useState<string | null>(null);
  const [matDispatchPartnerOptions, setMatDispatchPartnerOptions] = useState<string[]>([]);
  const [matDispatchPartner, setMatDispatchPartner] = useState('');
  const [matDispatchWarehouseId, setMatDispatchWarehouseId] = useState('');
  const [matDispatchRemark, setMatDispatchRemark] = useState('');
  const [matDispatchQty, setMatDispatchQty] = useState<Record<string, number>>({});
  const [matReturnOrderId, setMatReturnOrderId] = useState<string | null>(null);
  const [matReturnProductId, setMatReturnProductId] = useState<string | null>(null);
  const [matReturnPartnerOptions, setMatReturnPartnerOptions] = useState<string[]>([]);
  const [matReturnPartner, setMatReturnPartner] = useState('');
  const [matReturnWarehouseId, setMatReturnWarehouseId] = useState('');
  const [matReturnRemark, setMatReturnRemark] = useState('');
  const [matReturnQty, setMatReturnQty] = useState<Record<string, number>>({});

  const OUTS_PAGE_SIZE = 10;
  const [outsPage, setOutsPage] = useState(1);
  useEffect(() => { setOutsPage(1); }, [productionLinkMode]);

  const idx = useDataIndexes(orders, products, boms, globalNodes, productMilestoneProgresses);

  const defectiveReworkByOrderForOutsource = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, records),
    [orders, records]
  );

  const outsourceDispatchRows = useMemo(() => {
    if (globalNodes.length === 0) return [];
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE');
    const isProductMode = productionLinkMode === 'product';

    if (isProductMode) {
      const dispatchedByKey: Record<string, number> = {};
      outsourceRecords.forEach(r => {
        if (r.status !== '加工中' || !r.nodeId) return;
        if (r.orderId) return;
        const key = `${r.productId}|${r.nodeId}`;
        dispatchedByKey[key] = (dispatchedByKey[key] ?? 0) + r.quantity;
      });
      const rows: { orderId?: string; orderNumber?: string; productId: string; productName: string; nodeId: string; milestoneName: string; orderTotalQty: number; reportedQty: number; dispatchedQty: number; availableQty: number }[] = [];
      const getDr = (oid: string, tid: string) =>
        defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0 };
      const { productsById, ordersByProductId, nodesById, pmpByKey } = idx;
      for (const product of products) {
        const productId = String(product.id);
        const blockOrders = ordersByProductId.get(productId) ?? [];
        const nodeIds = (product.milestoneNodeIds || []).filter((nid: string) => {
          const node = nodesById.get(nid);
          return node?.allowOutsource;
        });
        nodeIds.forEach((nodeId: string) => {
          const node = nodesById.get(nodeId);
          const maxReportable =
            blockOrders.length > 0
              ? productGroupMaxReportableSum(
                  blockOrders,
                  nodeId,
                  productId,
                  productMilestoneProgresses || [],
                  (processSequenceMode ?? 'free') as ProcessSequenceMode,
                  getDr,
                  pmpByKey
                )
              : 0;
          const reportedQty = pmpCompletedAtTemplate(productMilestoneProgresses || [], productId, nodeId, pmpByKey);
          const key = `${productId}|${nodeId}`;
          const dispatchedQty = dispatchedByKey[key] ?? 0;
          const availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
          if (availableQty <= 0) return;
          rows.push({
            productId,
            productName: product.name ?? '—',
            nodeId,
            milestoneName: node?.name ?? nodeId,
            orderTotalQty: maxReportable,
            reportedQty,
            dispatchedQty,
            availableQty
          });
        });
      }
      return rows.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    }

    const dispatchedByKey: Record<string, number> = {};
    outsourceRecords.forEach(r => {
      if (r.status !== '加工中' || !r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      dispatchedByKey[key] = (dispatchedByKey[key] ?? 0) + r.quantity;
    });
    const rows: { orderId?: string; orderNumber?: string; productId: string; productName: string; nodeId: string; milestoneName: string; orderTotalQty: number; reportedQty: number; dispatchedQty: number; availableQty: number }[] = [];
    const getDr = (oid: string, tid: string) =>
      defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0 };
    const parentList = orders.filter(o => !o.parentOrderId);
    parentList.forEach(order => {
      const rawOrderTotalQty = order.items.reduce((s, i) => s + i.quantity, 0);
      const product = idx.productsById.get(order.productId);
      order.milestones.forEach(ms => {
        const node = idx.nodesById.get(ms.templateId);
        if (!node?.allowOutsource) return;
        if (product && !(product.milestoneNodeIds || []).includes(ms.templateId)) return;
        let baseQty = rawOrderTotalQty;
        if (processSequenceMode === 'sequential') {
          const idx = order.milestones.findIndex(m => m.id === ms.id);
          if (idx > 0) {
            const prev = order.milestones[idx - 1];
            baseQty = prev?.completedQuantity ?? 0;
          }
        }
        const { defective, rework } = getDr(order.id, ms.templateId);
        const maxReportable = Math.max(0, baseQty - defective + rework);
        const key = `${order.id}|${ms.templateId}`;
        const dispatchedQty = dispatchedByKey[key] ?? 0;
        const reportedQty = ms.completedQuantity ?? 0;
        const availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
        if (availableQty <= 0) return;
        rows.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          productName: product?.name ?? order.productName ?? '—',
          nodeId: ms.templateId,
          milestoneName: ms.name,
          orderTotalQty: maxReportable,
          reportedQty,
          dispatchedQty,
          availableQty
        });
      });
    });
    return rows;
  }, [productionLinkMode, records, orders, products, globalNodes, productMilestoneProgresses, processSequenceMode, defectiveReworkByOrderForOutsource, idx]);

  const outsourceReceiveRows = useMemo(() => {
    const outsourceRecords = records.filter(r => r.type === 'OUTSOURCE');
    const isProductMode = productionLinkMode === 'product';

    if (isProductMode) {
      const byKey: Record<string, { dispatched: number; received: number; partner: string }> = {};
      outsourceRecords.forEach(r => {
        if (r.orderId || !r.nodeId || !r.productId) return;
        const key = `${r.productId}|${r.nodeId}|${r.partner ?? ''}`;
        if (!byKey[key]) byKey[key] = { dispatched: 0, received: 0, partner: r.partner ?? '' };
        if (r.status === '加工中') byKey[key].dispatched += r.quantity;
        else if (r.status === '已收回') byKey[key].received += r.quantity;
      });
      const rows: { orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; dispatched: number; received: number; pending: number }[] = [];
      Object.entries(byKey).forEach(([key, v]) => {
        const pending = v.dispatched - v.received;
        if (pending <= 0) return;
        const [productId, nodeId] = key.split('|');
        const product = idx.productsById.get(productId);
        const node = idx.nodesById.get(nodeId);
        rows.push({
          nodeId,
          productId,
          productName: product?.name ?? '—',
          milestoneName: node?.name ?? nodeId,
          partner: v.partner,
          dispatched: v.dispatched,
          received: v.received,
          pending
        });
      });
      return rows.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    }

    const byKey: Record<string, { dispatched: number; received: number; partner: string }> = {};
    outsourceRecords.forEach(r => {
      if (!r.orderId || !r.nodeId) return;
      const key = `${r.orderId}|${r.nodeId}`;
      if (!byKey[key]) byKey[key] = { dispatched: 0, received: 0, partner: r.partner ?? '' };
      if (r.status === '加工中') byKey[key].dispatched += r.quantity;
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
    const rows: { orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; dispatched: number; received: number; pending: number }[] = [];
    Object.entries(byKey).forEach(([key, v]) => {
      const pending = v.dispatched - v.received;
      if (pending <= 0) return;
      const [orderId, nodeId] = key.split('|');
      const order = idx.ordersById.get(orderId);
      if (!order) return;
      const ms = order.milestones.find(m => m.templateId === nodeId);
      const product = idx.productsById.get(order.productId);
      rows.push({
        orderId,
        nodeId,
        productId: order.productId,
        orderNumber: order.orderNumber,
        productName: product?.name ?? order.productName ?? '—',
        milestoneName: ms?.name ?? nodeId,
        partner: v.partner,
        dispatched: v.dispatched,
        received: v.received,
        pending
      });
    });
    return rows;
  }, [productionLinkMode, records, orders, products, globalNodes, idx]);

  const outsourceStatsByOrder = useMemo(() => {
    const isProductMode = productionLinkMode === 'product';
    if (isProductMode) {
      const outsourceRecs = records.filter(r => r.type === 'OUTSOURCE' && !r.orderId && r.partner && r.productId);
      const byKey: Record<string, { productId: string; partner: string; nodeId: string; dispatched: number; received: number }> = {};
      outsourceRecs.forEach(r => {
        const nodeId = r.nodeId ?? '';
        const key = `${r.productId}|${r.partner}|${nodeId}`;
        if (!byKey[key]) byKey[key] = { productId: r.productId, partner: r.partner, nodeId, dispatched: 0, received: 0 };
        if (r.status === '加工中') byKey[key].dispatched += r.quantity;
        else if (r.status === '已收回') byKey[key].received += r.quantity;
      });
      const byProduct = new Map<string, { partner: string; nodeId: string; nodeName: string; dispatched: number; received: number; pending: number }[]>();
      Object.values(byKey).forEach(v => {
        const pending = Math.max(0, v.dispatched - v.received);
        const nodeName = (idx.nodesById.get(v.nodeId)?.name ?? v.nodeId) || '—';
        if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
        byProduct.get(v.productId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
      });
      return Array.from(byProduct.entries())
        .map(([productId, ptnrs]) => {
          const product = idx.productsById.get(productId);
          const seq = product?.milestoneNodeIds ?? [];
          const nodeOrder = (nodeId: string) => {
            const i = seq.indexOf(nodeId);
            return i >= 0 ? i : 9999;
          };
          const sortedPartners = [...ptnrs].sort((a, b) => {
            const d = nodeOrder(a.nodeId) - nodeOrder(b.nodeId);
            if (d !== 0) return d;
            return (a.partner || '').localeCompare(b.partner || '');
          });
          return {
            productId,
            productName: product?.name ?? '—',
            partners: sortedPartners
          };
        })
        .sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    }
    const outsourceRecs = records.filter(r => r.type === 'OUTSOURCE' && r.orderId && r.partner);
    const byKey: Record<string, { orderId: string; partner: string; nodeId: string; dispatched: number; received: number }> = {};
    outsourceRecs.forEach(r => {
      const nodeId = r.nodeId ?? '';
      const key = `${r.orderId}|${r.partner}|${nodeId}`;
      if (!byKey[key]) byKey[key] = { orderId: r.orderId, partner: r.partner, nodeId, dispatched: 0, received: 0 };
      if (r.status === '加工中') byKey[key].dispatched += r.quantity;
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
    const byOrder = new Map<string, { partner: string; nodeId: string; nodeName: string; dispatched: number; received: number; pending: number }[]>();
    Object.values(byKey).forEach(v => {
      const pending = Math.max(0, v.dispatched - v.received);
      const order = idx.ordersById.get(v.orderId);
      const ms = order?.milestones?.find(m => m.templateId === v.nodeId);
      const nodeName = (ms?.name ?? idx.nodesById.get(v.nodeId)?.name ?? v.nodeId) || '—';
      if (!byOrder.has(v.orderId)) byOrder.set(v.orderId, []);
      byOrder.get(v.orderId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
    });
    return Array.from(byOrder.entries())
      .map(([orderId, ptnrs]) => {
        const order = idx.ordersById.get(orderId);
        const product = idx.productsById.get(order?.productId ?? '');
        const milestoneIndex = (nodeId: string) => {
          const idx = order?.milestones?.findIndex(m => m.templateId === nodeId) ?? -1;
          return idx >= 0 ? idx : 9999;
        };
        const sortedPartners = [...ptnrs].sort((a, b) => milestoneIndex(a.nodeId) - milestoneIndex(b.nodeId));
        return {
          orderId,
          orderNumber: order?.orderNumber ?? orderId,
          productId: order?.productId,
          productName: product?.name ?? order?.productName ?? '—',
          partners: sortedPartners
        };
      })
      .sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''));
  }, [productionLinkMode, records, orders, products, globalNodes, idx]);

  const outsourceFlowSummaryRows = useMemo(() => {
    const isProductMode = productionLinkMode === 'product';
    const outsourceList = isProductMode ? records.filter(r => r.type === 'OUTSOURCE' && !r.orderId) : records.filter(r => r.type === 'OUTSOURCE');

    if (isProductMode) {
      const key = (docNo: string, productId: string) => `${docNo}|${productId}`;
      const byKey = new Map<string, { docNo: string; productId: string; productName: string; records: ProductionOpRecord[] }>();
      outsourceList.forEach(rec => {
        const docNo = rec.docNo ?? '—';
        const pid = rec.productId || '';
        const product = idx.productsById.get(pid);
        const k = key(docNo, pid);
        if (!byKey.has(k)) {
          byKey.set(k, { docNo, productId: pid, productName: product?.name ?? '—', records: [] });
        }
        byKey.get(k)!.records.push(rec);
      });
      return Array.from(byKey.values())
        .map(row => {
          const sorted = [...row.records].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          const earliest = sorted[sorted.length - 1];
          const dateStr = earliest?.timestamp ? (() => { try { const d = new Date(earliest.timestamp); return isNaN(d.getTime()) ? earliest.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return earliest.timestamp; } })() : '—';
          const partner = row.records[0]?.partner ?? '—';
          const totalQuantity = row.records.reduce((s, r) => s + r.quantity, 0);
          const remark = row.records.map(r => r.reason).filter(Boolean)[0] ?? '—';
          const nodeNames = [...new Set(row.records.map(r => r.nodeId).filter(Boolean))].map(nid => idx.nodesById.get(nid)?.name ?? nid);
          const milestoneStr = nodeNames.length ? nodeNames.join('、') : '—';
          const hasDispatch = row.records.some(r => r.status !== '已收回');
          const hasReceive = row.records.some(r => r.status === '已收回');
          const typeStr = hasDispatch && hasReceive ? '发出、收回' : hasDispatch ? '发出' : '收回';
          return { ...row, orderId: '', orderNumber: '', records: sorted, dateStr, partner, totalQuantity, remark, milestoneStr, typeStr };
        })
        .sort((a, b) => {
          const tA = a.records[0]?.timestamp ?? '';
          const tB = b.records[0]?.timestamp ?? '';
          return new Date(tB).getTime() - new Date(tA).getTime();
        });
    }

    const key = (docNo: string, orderId: string, productId: string) => `${docNo}|${orderId}|${productId}`;
    const byKey = new Map<string, { docNo: string; orderId: string; orderNumber: string; productId: string; productName: string; records: ProductionOpRecord[] }>();
    outsourceList.forEach(rec => {
      const docNo = rec.docNo ?? '—';
      const oid = rec.orderId || '';
      const pid = rec.productId || '';
      const order = idx.ordersById.get(oid);
      const product = idx.productsById.get(pid);
      const k = key(docNo, oid, pid);
      if (!byKey.has(k)) {
        byKey.set(k, {
          docNo,
          orderId: oid,
          orderNumber: order?.orderNumber ?? (oid ? oid : (product?.name ?? '—')),
          productId: pid,
          productName: product?.name ?? '—',
          records: []
        });
      }
      byKey.get(k)!.records.push(rec);
    });
    return Array.from(byKey.values())
      .map(row => {
        const sorted = [...row.records].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const earliest = sorted[sorted.length - 1];
        const dateStr = earliest?.timestamp ? (() => { try { const d = new Date(earliest.timestamp); return isNaN(d.getTime()) ? earliest.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return earliest.timestamp; } })() : '—';
        const partner = row.records[0]?.partner ?? '—';
        const totalQuantity = row.records.reduce((s, r) => s + r.quantity, 0);
        const remark = row.records.map(r => r.reason).filter(Boolean)[0] ?? '—';
        const nodeNames = [...new Set(row.records.map(r => r.nodeId).filter(Boolean))].map(nid => idx.nodesById.get(nid)?.name ?? nid);
        const milestoneStr = nodeNames.length ? nodeNames.join('、') : '—';
        const hasDispatch = row.records.some(r => r.status !== '已收回');
        const hasReceive = row.records.some(r => r.status === '已收回');
        const typeStr = hasDispatch && hasReceive ? '发出、收回' : hasDispatch ? '发出' : '收回';
        return { ...row, records: sorted, dateStr, partner, totalQuantity, remark, milestoneStr, typeStr };
      })
      .sort((a, b) => {
        const tA = a.records[0]?.timestamp ?? '';
        const tB = b.records[0]?.timestamp ?? '';
        return new Date(tB).getTime() - new Date(tA).getTime();
      });
  }, [productionLinkMode, records, orders, products, globalNodes, idx]);

  const OUTSOURCE_DOCNO_REGEX = /^WX-(\d+)-(\d+)$/;
  const getPartnerCodeFromName = (partnerName: string): number => {
    const withCode = records.filter(r => r.type === 'OUTSOURCE' && r.partner === partnerName && r.docNo && OUTSOURCE_DOCNO_REGEX.test(r.docNo));
    if (withCode.length > 0) {
      const m = withCode[0].docNo!.match(OUTSOURCE_DOCNO_REGEX);
      if (m) return parseInt(m[1], 10);
    }
    const allNew = records.filter(r => r.type === 'OUTSOURCE' && r.docNo && OUTSOURCE_DOCNO_REGEX.test(r.docNo));
    const codes = allNew.map(r => { const m = r.docNo!.match(OUTSOURCE_DOCNO_REGEX); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
    return codes.length ? Math.max(...codes) + 1 : 1;
  };
  const getNextSeqForPartner = (partnerCodeNum: number): number => {
    const withNewFormat = records.filter(r => r.type === 'OUTSOURCE' && r.docNo && OUTSOURCE_DOCNO_REGEX.test(r.docNo!));
    const samePartner = withNewFormat.filter(r => {
      const m = r.docNo!.match(OUTSOURCE_DOCNO_REGEX);
      return m && parseInt(m[1], 10) === partnerCodeNum;
    });
    const seqs = samePartner.map(r => { const m = r.docNo!.match(OUTSOURCE_DOCNO_REGEX); return m ? parseInt(m[2], 10) : 0; }).filter(n => n > 0);
    return seqs.length ? Math.max(...seqs) + 1 : 1;
  };
  const getNextOutsourceDocNo = (partnerName: string): string => {
    const code = getPartnerCodeFromName(partnerName);
    const seq = getNextSeqForPartner(code);
    return `WX-${String(code).padStart(4, '0')}-${String(seq).padStart(4, '0')}`;
  };

  const OUTSOURCE_RECEIVE_DOCNO_REGEX = /^WX-R-(\d+)-(\d+)$/;
  const getPartnerCodeFromNameForReceive = (partnerName: string): number => {
    const withCode = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === partnerName && r.docNo && OUTSOURCE_RECEIVE_DOCNO_REGEX.test(r.docNo));
    if (withCode.length > 0) {
      const m = withCode[0].docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX);
      if (m) return parseInt(m[1], 10);
    }
    const allReceive = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.docNo && OUTSOURCE_RECEIVE_DOCNO_REGEX.test(r.docNo));
    const codes = allReceive.map(r => { const m = r.docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
    return codes.length ? Math.max(...codes) + 1 : 1;
  };
  const getNextSeqForPartnerReceive = (partnerCodeNum: number): number => {
    const withFormat = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.docNo && OUTSOURCE_RECEIVE_DOCNO_REGEX.test(r.docNo!));
    const samePartner = withFormat.filter(r => {
      const m = r.docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX);
      return m && parseInt(m[1], 10) === partnerCodeNum;
    });
    const seqs = samePartner.map(r => { const m = r.docNo!.match(OUTSOURCE_RECEIVE_DOCNO_REGEX); return m ? parseInt(m[2], 10) : 0; }).filter(n => n > 0);
    return seqs.length ? Math.max(...seqs) + 1 : 1;
  };
  const getNextReceiveDocNo = (partnerName: string): string => {
    const code = getPartnerCodeFromNameForReceive(partnerName);
    const seq = getNextSeqForPartnerReceive(code);
    return `WX-R-${String(code).padStart(4, '0')}-${String(seq).padStart(4, '0')}`;
  };

  const handleDispatchFormSubmit = async () => {
    const partnerName = (dispatchPartnerName || '').trim();
    if (!partnerName) {
      toast.warning('请选择外协工厂。');
      return;
    }
    const entries = (Object.entries(dispatchFormQuantities) as [string, number][]).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      toast.warning('请至少填写一项委外数量。');
      return;
    }
    const docNo = getNextOutsourceDocNo(partnerName);
    const timestamp = new Date().toLocaleString();
    const isProductMode = productionLinkMode === 'product';
    const batch: ProductionOpRecord[] = [];
    entries.forEach(([key, qty]) => {
      const parts = key.split('|');
      const nodeId = parts.length >= 2 ? parts[1] : '';
      const variantId = parts[2];
      if (isProductMode) {
        const productId = parts[0];
        const product = idx.productsById.get(productId);
        if (!product) return;
        batch.push({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          productId,
          quantity: qty,
          reason: dispatchRemark.trim() || undefined,
          operator: '张主管',
          timestamp,
          status: '加工中',
          partner: partnerName,
          docNo,
          nodeId,
          variantId: variantId || undefined
        } as ProductionOpRecord);
      } else {
        const orderId = parts[0];
        const order = idx.ordersById.get(orderId);
        if (!order) return;
        batch.push({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          orderId,
          productId: order.productId,
          quantity: qty,
          reason: dispatchRemark.trim() || undefined,
          operator: '张主管',
          timestamp,
          status: '加工中',
          partner: partnerName,
          docNo,
          nodeId,
          variantId: variantId || undefined
        } as ProductionOpRecord);
      }
    });
    if (onAddRecordBatch && batch.length > 1) {
      await onAddRecordBatch(batch);
    } else {
      for (const rec of batch) await onAddRecord(rec);
    }

    const matchedPartner = partners.find(p => p.name === partnerName);
    const collabTenantId = matchedPartner?.collaborationTenantId;

    setDispatchFormQuantities({});
    setDispatchRemark('');
    setDispatchPartnerName('');
    setDispatchFormModalOpen(false);
    setOutsourceModal(null);
    setDispatchSelectedKeys(new Set());

    if (collabTenantId) {
      setCollabSyncConfirm({
        partnerName,
        collaborationTenantId: collabTenantId,
        recordIds: batch.map(r => r.id),
      });
      api.collaboration.listOutsourceRoutes().then(setCollabRoutes).catch(() => setCollabRoutes([]));
    }
  };

  const handleOutsourceReceiveSubmit = () => {
    if (!receiveModal || receiveQty <= 0) return;
    if (receiveQty > receiveModal.pendingQty) {
      toast.error(`本次收回数量不能大于待收回数量（${receiveModal.pendingQty}）。`);
      return;
    }
    const receiveDocNo = getNextReceiveDocNo(receiveModal.partner);
    onAddRecord({
      id: `rec-${Date.now()}-recv-${Math.random().toString(36).slice(2, 8)}`,
      type: 'OUTSOURCE',
      orderId: receiveModal.orderId,
      productId: receiveModal.productId,
      quantity: receiveQty,
      operator: '张主管',
      timestamp: new Date().toLocaleString(),
      status: '已收回',
      partner: receiveModal.partner,
      nodeId: receiveModal.nodeId,
      docNo: receiveDocNo
    });
    setReceiveModal(null);
    setReceiveQty(0);
  };

  const RECEIVE_VARIANT_SEP = '__v__';
  const productReceiveRowKey = (r: { productId: string; nodeId: string; partner?: string }) =>
    `${r.productId}|${r.nodeId}|${r.partner ?? ''}`;

  const handleReceiveFormSubmit = () => {
    const entries = (Object.entries(receiveFormQuantities) as [string, number][]).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      toast.warning('请至少填写一项收回数量。');
      return;
    }
    const isProductMode = productionLinkMode === 'product';
    for (const [key, qty] of entries) {
      const parts = key.split('|');
      if (isProductMode) {
        const baseK = key.includes(RECEIVE_VARIANT_SEP) ? key.split(RECEIVE_VARIANT_SEP)[0]! : key;
        const row = outsourceReceiveRows.find(r => r.orderId == null && productReceiveRowKey(r) === baseK);
        if (!row) continue;
        const dispatchR = records.filter(
          rr =>
            rr.type === 'OUTSOURCE' &&
            rr.status === '加工中' &&
            !rr.orderId &&
            rr.productId === row.productId &&
            rr.nodeId === row.nodeId &&
            (rr.partner ?? '') === (row.partner ?? '')
        );
        const receiveR = records.filter(
          rr =>
            rr.type === 'OUTSOURCE' &&
            rr.status === '已收回' &&
            !rr.orderId &&
            rr.productId === row.productId &&
            rr.nodeId === row.nodeId &&
            (rr.partner ?? '') === (row.partner ?? '')
        );
        const pendingVar = (vid: string) => {
          const d = dispatchR.filter(rr => (rr.variantId || '') === vid).reduce((s, rr) => s + rr.quantity, 0);
          const rc = receiveR.filter(rr => (rr.variantId || '') === vid).reduce((s, rr) => s + rr.quantity, 0);
          return Math.max(0, d - rc);
        };
        const dispNoVar = dispatchR.filter(rr => !rr.variantId).reduce((s, rr) => s + rr.quantity, 0);
        const recNoVar = receiveR.filter(rr => !rr.variantId).reduce((s, rr) => s + rr.quantity, 0);
        const pendingNoVar = Math.max(0, dispNoVar - recNoVar);
        const hasVariantDispatch = dispatchR.some(rr => !!rr.variantId);
        if (key.includes(RECEIVE_VARIANT_SEP)) {
          const variantId = key.split(RECEIVE_VARIANT_SEP)[1] ?? '';
          const maxQ = pendingVar(variantId);
          if (qty > maxQ) {
            toast.error(`本次收回数量不能大于该规格待收数量（最多${maxQ}）。`);
            return;
          }
        } else if (key === productReceiveRowKey(row)) {
          const maxAgg = hasVariantDispatch ? pendingNoVar : row.pending;
          if (qty > maxAgg) {
            toast.error(`本次收回数量不能大于待收数量（最多${maxAgg}）。`);
            return;
          }
        }
      } else {
        const orderId = parts[0];
        const nodeId = parts[1];
        const variantId = parts[2];
        const row = outsourceReceiveRows.find(r => r.orderId === orderId && r.nodeId === nodeId);
        if (!row) continue;
        if (parts.length === 3) {
          const dispatchRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === orderId && r.nodeId === nodeId);
          const receiveRecords = records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.orderId === orderId && r.nodeId === nodeId);
          const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
          const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
          const maxQty = Math.max(0, dispatched - received);
          if (qty > maxQty) {
            toast.error(`本次收回数量不能大于待收数量（最多${maxQty}）。`);
            return;
          }
        } else {
          if (qty > row.pending) {
            toast.error(`本次收回数量不能大于待收数量（最多${row.pending}）。`);
            return;
          }
        }
      }
    }
    const timestamp = new Date().toLocaleString();
    const firstKey = receiveSelectedKeys.values().next().value;
    const firstRow = firstKey ? outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey) : null;
    const partnerName = firstRow?.partner ?? '';
    const receiveDocNo = getNextReceiveDocNo(partnerName);
    for (const [key, qty] of entries) {
      const parts = key.split('|');
      if (isProductMode) {
        const baseKey = key.includes(RECEIVE_VARIANT_SEP) ? key.split(RECEIVE_VARIANT_SEP)[0]! : key;
        const rowP = outsourceReceiveRows.find(r => r.orderId == null && productReceiveRowKey(r) === baseKey);
        if (!rowP) continue;
        const productId = rowP.productId;
        const nodeId = rowP.nodeId;
        const variantId = key.includes(RECEIVE_VARIANT_SEP) ? key.split(RECEIVE_VARIANT_SEP)[1] : undefined;
        const unitPrice = receiveFormUnitPrices[baseKey] ?? 0;
        const amount = qty * unitPrice;
        onAddRecord({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          productId,
          quantity: qty,
          reason: receiveFormRemark.trim() || undefined,
          operator: '张主管',
          timestamp,
          status: '已收回',
          partner: partnerName,
          nodeId,
          variantId: variantId || undefined,
          docNo: receiveDocNo,
          unitPrice: unitPrice || undefined,
          amount: amount || undefined
        });
      } else {
        const orderId = parts[0];
        const nodeId = parts[1];
        const variantId = parts[2];
        const baseKey = parts.length === 3 ? `${orderId}|${nodeId}` : key;
        const unitPrice = receiveFormUnitPrices[baseKey] ?? 0;
        const amount = qty * unitPrice;
        const order = idx.ordersById.get(orderId);
        if (!order) continue;
        onAddRecord({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          orderId,
          productId: order.productId,
          quantity: qty,
          reason: receiveFormRemark.trim() || undefined,
          operator: '张主管',
          timestamp,
          status: '已收回',
          partner: partnerName,
          nodeId,
          variantId: variantId || undefined,
          docNo: receiveDocNo,
          unitPrice: unitPrice || undefined,
          amount: amount || undefined
        });
      }
    }
    setReceiveFormQuantities({});
    setReceiveFormUnitPrices({});
    setReceiveFormRemark('');
    setReceiveFormModalOpen(false);
    setReceiveSelectedKeys(new Set());
  };

  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>外协管理</h1>
          <p className={pageSubtitleClass}>外部委托加工业务追踪</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_send:allow') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('dispatch')}
              className={outlineToolbarButtonClass}
            >
              <ClipboardList className="w-4 h-4 shrink-0" /> 待发清单
            </button>
          )}
          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_receive:allow') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('receive')}
              className={outlineToolbarButtonClass}
            >
              <ArrowDownToLine className="w-4 h-4 shrink-0" /> 待收回清单
            </button>
          )}
          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:view') && (
            <button
              type="button"
              onClick={() => setOutsourceModal('flow')}
              className={outlineToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" /> 外协流水
            </button>
          )}
        </div>
      </div>

      {outsourceModal === null && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看外协管理列表</p>
        </div>
      )}
      {outsourceModal === null && canViewMainList && (
        <div className="space-y-2">
          {outsourceStatsByOrder.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <Truck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">暂无委外数据，请点击上方「待发清单」「待收回清单」或「外协流水」操作。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {(() => {
                const outsTotalPages = Math.max(1, Math.ceil(outsourceStatsByOrder.length / OUTS_PAGE_SIZE));
                const pagedStats = outsourceStatsByOrder.slice((outsPage - 1) * OUTS_PAGE_SIZE, outsPage * OUTS_PAGE_SIZE);
                return (<>
              {pagedStats.map((item) => {
                const orderId = 'orderId' in item ? item.orderId : undefined;
                const orderNumber = 'orderNumber' in item ? item.orderNumber : undefined;
                const productId = 'productId' in item ? item.productId : (item as { productId: string }).productId;
                const productName = item.productName;
                const ptnrs = item.partners;
                const order = orderId ? idx.ordersById.get(orderId) : undefined;
                const product = idx.productsById.get(productId);
                const orderTotalQty = order?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                return (
                <div
                  key={orderId ?? productId}
                  className="bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr_auto] gap-3 lg:gap-4 items-center"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {product?.imageUrl ? (
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                        <img loading="lazy" decoding="async" src={product.imageUrl} alt={productName} className="w-full h-full object-cover block" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-indigo-50 text-indigo-600">
                        <Layers className="w-7 h-7" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        {productionLinkMode !== 'product' && orderNumber != null && <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-widest">{orderNumber}</span>}
                        <span className="text-lg font-bold text-slate-800">{productName}</span>
                        {product?.sku && <span className="text-[10px] font-bold text-slate-500">{product.sku}</span>}
                        {product && categories.find(c => c.id === product.categoryId)?.customFields?.filter(f => f.showInForm !== false && f.type !== 'file').map(f => {
                          const val = product.categoryCustomData?.[f.id];
                          if (val == null || val === '') return null;
                          return <span key={f.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">{f.label}: {typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>;
                        })}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 font-medium flex-wrap">
                        {productionLinkMode !== 'product' && order?.customer && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.customer}</span>}
                        {productionLinkMode !== 'product' && <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> 总数: {orderTotalQty}</span>}
                        {order?.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 交期: {(order.dueDate || '').trim().slice(0, 10)}</span>}
                        {order?.startDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 开始: {(order.startDate || '').trim().slice(0, 10)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 flex-wrap flex-1 min-w-0 -my-0.5">
                    {ptnrs.map(({ partner, nodeId, nodeName, dispatched, received, pending }) => (
                      <div
                        key={`${partner}|${nodeId}`}
                        className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 transition-colors"
                      >
                        <div className="mb-1 w-full text-center leading-tight">
                          <div className="text-[10px] font-bold text-emerald-600 truncate" title={nodeName}>{nodeName}</div>
                          <div className="text-[10px] font-bold text-slate-600 truncate" title={partner}>{partner}</div>
                        </div>
                        <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${pending > 0 ? 'border-indigo-300' : 'border-emerald-400'}`}>
                          <span className="text-base font-black text-slate-900 leading-none">{pending}</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 leading-tight">
                          <span className="text-[10px] font-bold text-slate-500">{dispatched} / {received}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (productionLinkMode === 'product') setFlowFilterOrder('');
                              else setFlowFilterOrder(orderNumber ?? '');
                              setFlowFilterProduct(productName);
                              setFlowFilterMilestone(nodeId);
                              setFlowFilterPartner(partner);
                              setOutsourceModal('flow');
                            }}
                            className="p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                            title="查看该产品、工序、加工厂的外协流水"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_material:allow') && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          const uniquePartners = [...new Set(ptnrs.map(p => p.partner))];
                          setMatDispatchPartnerOptions(uniquePartners);
                          setMatDispatchPartner(uniquePartners[0] ?? '');
                          setMatDispatchWarehouseId(warehouses[0]?.id ?? '');
                          setMatDispatchRemark('');
                          setMatDispatchQty({});
                          if (productionLinkMode === 'product') {
                            setMatDispatchProductId(productId);
                            setMatDispatchOrderId(null);
                          } else {
                            setMatDispatchOrderId(orderId ?? null);
                            setMatDispatchProductId(null);
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all w-full justify-center"
                      >
                        <Package className="w-3.5 h-3.5" /> 物料外发
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          const outsourceDispatchPartners = [...new Set(
                            records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && (
                              productionLinkMode === 'product'
                                ? (r.sourceProductId === productId || (!r.orderId && !r.sourceProductId && r.productId))
                                : r.orderId === orderId
                            )).map(r => r.partner!)
                          )];
                          if (outsourceDispatchPartners.length === 0) {
                            toast.warning('该卡片暂无外发记录，无法退回');
                            return;
                          }
                          setMatReturnPartnerOptions(outsourceDispatchPartners);
                          setMatReturnPartner(outsourceDispatchPartners[0] ?? '');
                          setMatReturnWarehouseId(warehouses[0]?.id ?? '');
                          setMatReturnRemark('');
                          setMatReturnQty({});
                          if (productionLinkMode === 'product') {
                            setMatReturnProductId(productId);
                            setMatReturnOrderId(null);
                          } else {
                            setMatReturnOrderId(orderId ?? null);
                            setMatReturnProductId(null);
                          }
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-amber-100 text-amber-600 bg-white hover:bg-amber-50 transition-all w-full justify-center"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> 物料退回
                      </button>
                    </div>
                  )}
                </div>
              );
              })}
              {outsTotalPages > 1 && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <span className="text-xs text-slate-400">共 {outsourceStatsByOrder.length} 项，第 {outsPage} / {outsTotalPages} 页</span>
                  <button type="button" disabled={outsPage <= 1} onClick={() => setOutsPage(p => p - 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">上一页</button>
                  <button type="button" disabled={outsPage >= outsTotalPages} onClick={() => setOutsPage(p => p + 1)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">下一页</button>
                </div>
              )}
              </>); })()}
            </div>
          )}
        </div>
      )}

      {(matDispatchOrderId || matDispatchProductId) && (
        <OutsourceMaterialDispatchModal
          productionLinkMode={productionLinkMode}
          matDispatchOrderId={matDispatchOrderId}
          matDispatchProductId={matDispatchProductId}
          matDispatchPartnerOptions={matDispatchPartnerOptions}
          matDispatchPartner={matDispatchPartner}
          setMatDispatchPartner={setMatDispatchPartner}
          matDispatchWarehouseId={matDispatchWarehouseId}
          setMatDispatchWarehouseId={setMatDispatchWarehouseId}
          matDispatchRemark={matDispatchRemark}
          setMatDispatchRemark={setMatDispatchRemark}
          matDispatchQty={matDispatchQty}
          setMatDispatchQty={setMatDispatchQty}
          orders={orders}
          products={products}
          boms={boms}
          globalNodes={globalNodes}
          records={records}
          warehouses={warehouses}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onClose={() => {
            setMatDispatchOrderId(null);
            setMatDispatchProductId(null);
            setMatDispatchQty({});
            setMatDispatchPartner('');
            setMatDispatchRemark('');
          }}
        />
      )}


      {(matReturnOrderId || matReturnProductId) && (
        <OutsourceMaterialReturnModal
          productionLinkMode={productionLinkMode}
          matReturnOrderId={matReturnOrderId}
          matReturnProductId={matReturnProductId}
          matReturnPartnerOptions={matReturnPartnerOptions}
          matReturnPartner={matReturnPartner}
          setMatReturnPartner={setMatReturnPartner}
          matReturnWarehouseId={matReturnWarehouseId}
          setMatReturnWarehouseId={setMatReturnWarehouseId}
          matReturnRemark={matReturnRemark}
          setMatReturnRemark={setMatReturnRemark}
          matReturnQty={matReturnQty}
          setMatReturnQty={setMatReturnQty}
          orders={orders}
          products={products}
          boms={boms}
          records={records}
          warehouses={warehouses}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onClose={() => {
            setMatReturnOrderId(null);
            setMatReturnProductId(null);
            setMatReturnQty({});
            setMatReturnPartner('');
            setMatReturnRemark('');
          }}
        />
      )}

      {outsourceModal === 'dispatch' && (
        <OutsourceDispatchListModal
          productionLinkMode={productionLinkMode}
          outsourceDispatchRows={outsourceDispatchRows}
          products={products}
          dispatchSelectedKeys={dispatchSelectedKeys}
          setDispatchSelectedKeys={setDispatchSelectedKeys}
          onDispatchFormOpen={() => setDispatchFormModalOpen(true)}
          onClose={() => setOutsourceModal(null)}
        />
      )}

      {dispatchFormModalOpen && (
        <OutsourceDispatchQuantityModal
          productionLinkMode={productionLinkMode}
          outsourceDispatchRows={outsourceDispatchRows}
          dispatchSelectedKeys={dispatchSelectedKeys}
          dispatchPartnerName={dispatchPartnerName}
          setDispatchPartnerName={setDispatchPartnerName}
          dispatchRemark={dispatchRemark}
          setDispatchRemark={setDispatchRemark}
          dispatchFormQuantities={dispatchFormQuantities}
          setDispatchFormQuantities={setDispatchFormQuantities}
          orders={orders}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          globalNodes={globalNodes}
          partners={partners}
          partnerCategories={partnerCategories}
          records={records}
          processSequenceMode={processSequenceMode}
          productMilestoneProgresses={productMilestoneProgresses}
          defectiveReworkByOrderForOutsource={defectiveReworkByOrderForOutsource}
          onSubmit={handleDispatchFormSubmit}
          onClose={() => setDispatchFormModalOpen(false)}
        />
      )}

      {outsourceModal === 'receive' && (
        <OutsourceReceiveListModal
          productionLinkMode={productionLinkMode}
          outsourceReceiveRows={outsourceReceiveRows}
          products={products}
          partners={partners}
          receiveSelectedKeys={receiveSelectedKeys}
          setReceiveSelectedKeys={setReceiveSelectedKeys}
          onReceiveFormOpen={() => setReceiveFormModalOpen(true)}
          onClose={() => setOutsourceModal(null)}
        />
      )}

      {receiveFormModalOpen && (
        <OutsourceReceiveQuantityModal
          productionLinkMode={productionLinkMode}
          outsourceReceiveRows={outsourceReceiveRows}
          receiveSelectedKeys={receiveSelectedKeys}
          receiveFormQuantities={receiveFormQuantities}
          setReceiveFormQuantities={setReceiveFormQuantities}
          receiveFormUnitPrices={receiveFormUnitPrices}
          setReceiveFormUnitPrices={setReceiveFormUnitPrices}
          receiveFormRemark={receiveFormRemark}
          setReceiveFormRemark={setReceiveFormRemark}
          orders={orders}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          records={records}
          onSubmit={handleReceiveFormSubmit}
          onClose={() => setReceiveFormModalOpen(false)}
        />
      )}

      {outsourceModal === 'flow' && (
        <OutsourceFlowListModal
          productionLinkMode={productionLinkMode}
          outsourceFlowSummaryRows={outsourceFlowSummaryRows}
          globalNodes={globalNodes}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          setFlowDetailKey={setFlowDetailKey}
          onClose={() => {
            setOutsourceModal(null);
            setFlowDetailKey(null);
          }}
        />
      )}

      {outsourceModal === 'flow' && flowDetailKey && (
        <OutsourceFlowDocumentDetailModal
          productionLinkMode={productionLinkMode}
          flowDetailKey={flowDetailKey}
          records={records}
          orders={orders}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          globalNodes={globalNodes}
          partners={partners}
          partnerCategories={partnerCategories}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
          onUpdateRecord={onUpdateRecord}
          onDeleteRecord={onDeleteRecord}
          onClose={() => setFlowDetailKey(null)}
        />
      )}

      {receiveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setReceiveModal(null); setReceiveQty(0); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4">
            <h3 className="text-lg font-black text-slate-900">委外收回</h3>
            <div className="text-sm space-y-1">
              {receiveModal.orderNumber != null && <p><span className="text-slate-500">工单：</span><span className="font-bold text-slate-800">{receiveModal.orderNumber}</span></p>}
              <p><span className="text-slate-500">产品：</span><span className="font-bold text-slate-800">{receiveModal.productName}</span></p>
              <p><span className="text-slate-500">工序：</span><span className="font-bold text-indigo-600">{receiveModal.milestoneName}</span></p>
              <p><span className="text-slate-500">待收回数量：</span><span className="font-bold text-amber-600">{receiveModal.pendingQty}</span></p>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">本次收回数量</label>
              <input type="number" min={1} max={receiveModal.pendingQty} value={receiveQty || ''} onChange={e => setReceiveQty(Number(e.target.value) || 0)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setReceiveModal(null); setReceiveQty(0); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
              <button type="button" onClick={handleOutsourceReceiveSubmit} disabled={receiveQty <= 0 || receiveQty > receiveModal.pendingQty} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors">确认收回</button>
            </div>
          </div>
        </div>
      )}

      {collabSyncConfirm && (
        <OutsourceCollabSyncModal
          collabSyncConfirm={collabSyncConfirm}
          collabRoutes={collabRoutes}
          onClose={() => setCollabSyncConfirm(null)}
        />
      )}
    </div>
  );
};

export default React.memo(OutsourcePanel);
