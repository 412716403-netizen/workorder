import React, { useState, useMemo } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  Clock,
  Undo2,
  ClipboardList,
  Layers,
  X,
  ScrollText,
  Check,
  Filter,
  FileText,
  Pencil,
  Trash2,
  Building2,
  User,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProdOpType,
  Warehouse,
  BOM,
  AppDictionaries,
  GlobalNodeTemplate,
  Partner,
  ProductCategory,
  ProductVariant,
  PartnerCategory,
  Worker,
  ProcessSequenceMode,
  ProductMilestoneProgress,
} from '../../types';
import { PanelProps, hasOpsPerm, OutsourceModalType } from './types';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import * as api from '../../services/api';
import {
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../../styles/uiDensity';
import { productGroupMaxReportableSum, pmpCompletedAtTemplate, variantMaxGoodProductMode } from '../../utils/productReportAggregates';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { useConfirm } from '../../contexts/ConfirmContext';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';

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
  const confirm = useConfirm();
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:outsource_list:allow');

  const [outsourceModal, setOutsourceModal] = useState<OutsourceModalType | null>(null);
  const [dispatchPartnerName, setDispatchPartnerName] = useState('');
  const [dispatchListSearchOrder, setDispatchListSearchOrder] = useState('');
  const [dispatchListSearchProduct, setDispatchListSearchProduct] = useState('');
  const [dispatchListSearchNodeId, setDispatchListSearchNodeId] = useState('');
  const [dispatchSelectedKeys, setDispatchSelectedKeys] = useState<Set<string>>(new Set());
  const [dispatchFormModalOpen, setDispatchFormModalOpen] = useState(false);
  const [dispatchFormQuantities, setDispatchFormQuantities] = useState<Record<string, number>>({});
  const [dispatchRemark, setDispatchRemark] = useState('');
  const [collabSyncConfirm, setCollabSyncConfirm] = useState<{
    partnerName: string;
    collaborationTenantId: string;
    recordIds: string[];
  } | null>(null);
  const [collabSyncing, setCollabSyncing] = useState(false);
  const [collabRoutes, setCollabRoutes] = useState<any[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');

  const [receiveListSearchOrder, setReceiveListSearchOrder] = useState('');
  const [receiveListSearchProduct, setReceiveListSearchProduct] = useState('');
  const [receiveListSearchNodeId, setReceiveListSearchNodeId] = useState('');
  const [receiveListSearchPartner, setReceiveListSearchPartner] = useState('');
  const [receiveSelectedKeys, setReceiveSelectedKeys] = useState<Set<string>>(new Set());
  const [receiveFormModalOpen, setReceiveFormModalOpen] = useState(false);
  const [receiveFormQuantities, setReceiveFormQuantities] = useState<Record<string, number>>({});
  const [receiveFormUnitPrices, setReceiveFormUnitPrices] = useState<Record<string, number>>({});
  const [receiveFormRemark, setReceiveFormRemark] = useState('');
  const [receiveModal, setReceiveModal] = useState<{ orderId?: string; nodeId: string; productId: string; orderNumber?: string; productName: string; milestoneName: string; partner: string; pendingQty: number } | null>(null);
  const [receiveQty, setReceiveQty] = useState(0);
  const [flowDetailKey, setFlowDetailKey] = useState<string | null>(null);
  const [flowDetailEditMode, setFlowDetailEditMode] = useState(false);
  const [flowDetailEditPartner, setFlowDetailEditPartner] = useState('');
  const [flowDetailEditRemark, setFlowDetailEditRemark] = useState('');
  const [flowDetailQuantities, setFlowDetailQuantities] = useState<Record<string, number>>({});
  const [flowDetailUnitPrices, setFlowDetailUnitPrices] = useState<Record<string, number>>({});
  const [flowFilterDateFrom, setFlowFilterDateFrom] = useState('');
  const [flowFilterDateTo, setFlowFilterDateTo] = useState('');
  const [flowFilterType, setFlowFilterType] = useState<'all' | '发出' | '收回'>('all');
  const [flowFilterPartner, setFlowFilterPartner] = useState('');
  const [flowFilterDocNo, setFlowFilterDocNo] = useState('');
  const [flowFilterOrder, setFlowFilterOrder] = useState('');
  const [flowFilterProduct, setFlowFilterProduct] = useState('');
  const [flowFilterMilestone, setFlowFilterMilestone] = useState('');
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
      const productIds = new Set<string>(products.map(p => String(p.id)));
      const getDr = (oid: string, tid: string) =>
        defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0 };
      productIds.forEach(productId => {
        const product = products.find(p => p.id === productId);
        const blockOrders = orders.filter(o => o.productId === productId);
        const nodeIds = (product?.milestoneNodeIds || []).filter((nid: string) => {
          const node = globalNodes.find(n => n.id === nid);
          return node?.allowOutsource;
        });
        nodeIds.forEach((nodeId: string) => {
          const node = globalNodes.find(n => n.id === nodeId);
          const maxReportable =
            blockOrders.length > 0
              ? productGroupMaxReportableSum(
                  blockOrders,
                  nodeId,
                  productId,
                  productMilestoneProgresses || [],
                  (processSequenceMode ?? 'free') as ProcessSequenceMode,
                  getDr
                )
              : 0;
          const reportedQty = pmpCompletedAtTemplate(productMilestoneProgresses || [], productId, nodeId);
          const key = `${productId}|${nodeId}`;
          const dispatchedQty = dispatchedByKey[key] ?? 0;
          const availableQty = Math.max(0, maxReportable - reportedQty - dispatchedQty);
          if (availableQty <= 0) return;
          rows.push({
            productId,
            productName: product?.name ?? '—',
            nodeId,
            milestoneName: node?.name ?? nodeId,
            orderTotalQty: maxReportable,
            reportedQty,
            dispatchedQty,
            availableQty
          });
        });
      });
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
      const product = products.find(p => p.id === order.productId);
      order.milestones.forEach(ms => {
        const node = globalNodes.find(n => n.id === ms.templateId);
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
  }, [productionLinkMode, records, orders, products, globalNodes, productMilestoneProgresses, processSequenceMode, defectiveReworkByOrderForOutsource]);

  const filteredDispatchRows = useMemo(() => {
    const orderKw = (dispatchListSearchOrder || '').trim().toLowerCase();
    const productKw = (dispatchListSearchProduct || '').trim().toLowerCase();
    return outsourceDispatchRows.filter(row => {
      if (productionLinkMode === 'order' && orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (dispatchListSearchNodeId && row.nodeId !== dispatchListSearchNodeId) return false;
      return true;
    });
  }, [outsourceDispatchRows, dispatchListSearchOrder, dispatchListSearchProduct, dispatchListSearchNodeId, products, productionLinkMode]);

  const dispatchListNodeOptions = useMemo(() => {
    const seen = new Set<string>();
    return outsourceDispatchRows.reduce<{ value: string; label: string }[]>((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, []);
  }, [outsourceDispatchRows]);

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
        const product = products.find(p => p.id === productId);
        const node = globalNodes.find(n => n.id === nodeId);
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
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      const ms = order.milestones.find(m => m.templateId === nodeId);
      const product = products.find(p => p.id === order.productId);
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
  }, [productionLinkMode, records, orders, products, globalNodes]);

  const filteredReceiveRows = useMemo(() => {
    const orderKw = (receiveListSearchOrder || '').trim().toLowerCase();
    const productKw = (receiveListSearchProduct || '').trim().toLowerCase();
    const partnerKw = (receiveListSearchPartner || '').trim().toLowerCase();
    return outsourceReceiveRows.filter(row => {
      if (productionLinkMode === 'order' && orderKw && !(row.orderNumber || '').toLowerCase().includes(orderKw)) return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (partnerKw && !(row.partner || '').toLowerCase().includes(partnerKw)) return false;
      if (receiveListSearchNodeId && row.nodeId !== receiveListSearchNodeId) return false;
      return true;
    });
  }, [outsourceReceiveRows, receiveListSearchOrder, receiveListSearchProduct, receiveListSearchPartner, receiveListSearchNodeId, products, productionLinkMode]);

  const receiveListNodeOptions = useMemo(() => {
    const seen = new Set<string>();
    return outsourceReceiveRows.reduce<{ value: string; label: string }[]>((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, []);
  }, [outsourceReceiveRows]);

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
        const nodeName = (globalNodes.find(n => n.id === v.nodeId)?.name ?? v.nodeId) || '—';
        if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
        byProduct.get(v.productId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
      });
      return Array.from(byProduct.entries())
        .map(([productId, ptnrs]) => {
          const product = products.find(p => p.id === productId);
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
      const order = orders.find(o => o.id === v.orderId);
      const ms = order?.milestones?.find(m => m.templateId === v.nodeId);
      const nodeName = (ms?.name ?? globalNodes.find(n => n.id === v.nodeId)?.name ?? v.nodeId) || '—';
      if (!byOrder.has(v.orderId)) byOrder.set(v.orderId, []);
      byOrder.get(v.orderId)!.push({ partner: v.partner, nodeId: v.nodeId, nodeName, dispatched: v.dispatched, received: v.received, pending });
    });
    return Array.from(byOrder.entries())
      .map(([orderId, ptnrs]) => {
        const order = orders.find(o => o.id === orderId);
        const product = products.find(p => p.id === order?.productId);
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
  }, [productionLinkMode, records, orders, products, globalNodes]);

  const outsourceFlowSummaryRows = useMemo(() => {
    const isProductMode = productionLinkMode === 'product';
    const outsourceList = isProductMode ? records.filter(r => r.type === 'OUTSOURCE' && !r.orderId) : records.filter(r => r.type === 'OUTSOURCE');

    if (isProductMode) {
      const key = (docNo: string, productId: string) => `${docNo}|${productId}`;
      const byKey = new Map<string, { docNo: string; productId: string; productName: string; records: ProductionOpRecord[] }>();
      outsourceList.forEach(rec => {
        const docNo = rec.docNo ?? '—';
        const pid = rec.productId || '';
        const product = products.find(p => p.id === pid);
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
          const nodeNames = [...new Set(row.records.map(r => r.nodeId).filter(Boolean))].map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid);
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
      const order = orders.find(o => o.id === oid);
      const product = products.find(p => p.id === pid);
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
        const nodeNames = [...new Set(row.records.map(r => r.nodeId).filter(Boolean))].map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid);
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
  }, [productionLinkMode, records, orders, products, globalNodes]);

  const filteredOutsourceFlowRows = useMemo(() => {
    let list = outsourceFlowSummaryRows;
    if (flowFilterDateFrom.trim()) {
      const from = flowFilterDateFrom.trim();
      list = list.filter(row => {
        const ts = row.records.length ? row.records[row.records.length - 1]?.timestamp : '';
        const d = ts ? new Date(ts).toISOString().split('T')[0] : '';
        return d >= from;
      });
    }
    if (flowFilterDateTo.trim()) {
      const to = flowFilterDateTo.trim();
      list = list.filter(row => {
        const ts = row.records.length ? row.records[row.records.length - 1]?.timestamp : '';
        const d = ts ? new Date(ts).toISOString().split('T')[0] : '';
        return d <= to;
      });
    }
    if (flowFilterType !== 'all') {
      list = list.filter(row => (row.typeStr || '').includes(flowFilterType));
    }
    if (flowFilterPartner.trim()) {
      const kw = flowFilterPartner.trim().toLowerCase();
      list = list.filter(row => (row.partner ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterDocNo.trim()) {
      const kw = flowFilterDocNo.trim().toLowerCase();
      list = list.filter(row => (row.docNo ?? '').toLowerCase().includes(kw));
    }
    if (productionLinkMode !== 'product' && flowFilterOrder.trim()) {
      const kw = flowFilterOrder.trim().toLowerCase();
      list = list.filter(row => (row.orderNumber ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterProduct.trim()) {
      const kw = flowFilterProduct.trim().toLowerCase();
      list = list.filter(row => (row.productName ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterMilestone.trim()) {
      const nodeId = flowFilterMilestone.trim();
      list = list.filter(row => row.records.some(r => r.nodeId === nodeId));
    }
    return list;
  }, [outsourceFlowSummaryRows, flowFilterDateFrom, flowFilterDateTo, flowFilterType, flowFilterPartner, flowFilterDocNo, flowFilterOrder, flowFilterProduct, flowFilterMilestone, productionLinkMode]);

  const { outsourceFlowTotalDispatch, outsourceFlowTotalReceive } = useMemo(() => {
    let dispatch = 0;
    let receive = 0;
    filteredOutsourceFlowRows.forEach(row => {
      row.records.forEach(r => {
        if (r.status === '加工中') dispatch += r.quantity;
        else if (r.status === '已收回') receive += r.quantity;
      });
    });
    return { outsourceFlowTotalDispatch: dispatch, outsourceFlowTotalReceive: receive };
  }, [filteredOutsourceFlowRows]);

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
        const product = products.find(p => p.id === productId);
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
        const order = orders.find(o => o.id === orderId);
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
        const order = orders.find(o => o.id === orderId);
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
              {outsourceStatsByOrder.map((item) => {
                const orderId = 'orderId' in item ? item.orderId : undefined;
                const orderNumber = 'orderNumber' in item ? item.orderNumber : undefined;
                const productId = 'productId' in item ? item.productId : (item as { productId: string }).productId;
                const productName = item.productName;
                const ptnrs = item.partners;
                const order = orderId ? orders.find(o => o.id === orderId) : undefined;
                const product = products.find(p => p.id === productId);
                const orderTotalQty = order?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                return (
                <div
                  key={orderId ?? productId}
                  className="bg-white px-5 py-2 rounded-[32px] border border-slate-200 hover:shadow-xl hover:border-indigo-200 transition-all grid grid-cols-1 lg:grid-cols-[360px_1fr_auto] gap-3 lg:gap-4 items-center"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {product?.imageUrl ? (
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-100 flex-shrink-0">
                        <img src={product.imageUrl} alt={productName} className="w-full h-full object-cover block" />
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
            </div>
          )}
        </div>
      )}

      {(matDispatchOrderId || matDispatchProductId) && (() => {
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
        if (isProductMode && targetProduct) {
          const relatedOrders = orders.filter(o => o.productId === targetProduct.id);
          const variants = targetProduct.variants ?? [];
          relatedOrders.forEach(ord => {
            const oQty = ord.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
            if (variants.length > 0) {
              ord.items?.forEach(item => {
                const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
                const lineQty = item.quantity;
                const seenBomIds = new Set<string>();
                if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
                  (Object.entries(v.nodeBoms) as [string, string][]).forEach(([nodeId, bomId]) => {
                    if (seenBomIds.has(bomId)) return;
                    seenBomIds.add(bomId);
                    const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
                    const bom = boms.find(b => b.id === bomId);
                    if (bom) addBomItems(bom, lineQty, nodeName);
                  });
                } else {
                  boms.filter(b => b.parentProductId === targetProduct.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                    if (seenBomIds.has(bom.id)) return;
                    seenBomIds.add(bom.id);
                    const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
                    addBomItems(bom, lineQty, nodeName);
                  });
                }
              });
            }
            if (matMap.size === 0) {
              const seenBomIds = new Set<string>();
              boms.filter(b => b.parentProductId === targetProduct.id && b.nodeId).forEach(bom => {
                if (seenBomIds.has(bom.id)) return;
                seenBomIds.add(bom.id);
                const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
                const qty = bom.variantId
                  ? (ord.items?.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
                  : oQty;
                addBomItems(bom, qty, nodeName);
              });
            }
          });
        } else if (targetOrder && targetProduct) {
          const variants = targetProduct.variants ?? [];
          if (variants.length > 0) {
            targetOrder.items?.forEach(item => {
              const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
              const lineQty = item.quantity;
              const seenBomIds = new Set<string>();
              if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
                (Object.entries(v.nodeBoms) as [string, string][]).forEach(([nodeId, bomId]) => {
                  if (seenBomIds.has(bomId)) return;
                  seenBomIds.add(bomId);
                  const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
                  const bom = boms.find(b => b.id === bomId);
                  if (bom) addBomItems(bom, lineQty, nodeName);
                });
              } else {
                boms.filter(b => b.parentProductId === targetProduct.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                  if (seenBomIds.has(bom.id)) return;
                  seenBomIds.add(bom.id);
                  const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
                  addBomItems(bom, lineQty, nodeName);
                });
              }
            });
          }
          if (matMap.size === 0) {
            const seenBomIds = new Set<string>();
            boms.filter(b => b.parentProductId === targetProduct.id && b.nodeId).forEach(bom => {
              if (seenBomIds.has(bom.id)) return;
              seenBomIds.add(bom.id);
              const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
              const qty = bom.variantId
                ? (targetOrder.items?.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
                : orderQty;
              addBomItems(bom, qty, nodeName);
            });
          }
        }
        matMap.forEach((v, pid) => {
          bomMaterials.push({ productId: pid, ...v, nodeNames: Array.from(v.nodeNames) });
        });
        const issuedMap = new Map<string, number>();
        if (isProductMode) {
          records.filter(r => r.type === 'STOCK_OUT' && r.productId && (r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId))).forEach(r => {
            issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
          });
          const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
          records.filter(r => r.type === 'STOCK_OUT' && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
            issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
          });
        } else if (targetOrder) {
          records.filter(r => r.type === 'STOCK_OUT' && r.orderId === targetOrder.id && r.reason !== '来自于返工').forEach(r => {
            issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
          });
        }
        const getNextWfDocNo = () => {
          const prefix = 'WF';
          const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
          const pattern = `${prefix}${todayStr}-`;
          const existing = records.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
          const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
          const maxSeq = seqs.length ? Math.max(...seqs) : 0;
          return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`;
        };
        const closeMatDispatch = () => {
          setMatDispatchOrderId(null);
          setMatDispatchProductId(null);
          setMatDispatchQty({});
          setMatDispatchPartner('');
          setMatDispatchRemark('');
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
          const docNo = getNextWfDocNo();
          const timestamp = new Date().toLocaleString();
          const batch: ProductionOpRecord[] = toIssue.map(m => ({
            id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'STOCK_OUT' as ProdOpType,
            orderId: isProductMode ? undefined : (matDispatchOrderId ?? undefined),
            productId: m.productId,
            quantity: matDispatchQty[m.productId],
            operator: '张主管',
            timestamp,
            status: '已完成',
            partner: matDispatchPartner,
            warehouseId: matDispatchWarehouseId || undefined,
            docNo,
            reason: matDispatchRemark.trim() || undefined,
            sourceProductId: isProductMode ? (targetProductId ?? undefined) : undefined,
          }));
          if (onAddRecordBatch && batch.length > 1) {
            await onAddRecordBatch(batch);
          } else {
            for (const rec of batch) onAddRecord(rec);
          }
          toast.success(`已外发 ${toIssue.length} 种物料至「${matDispatchPartner}」`);
          closeMatDispatch();
        };
        const headerLabel = isProductMode
          ? (targetProduct?.name ?? '—')
          : `${targetOrder?.orderNumber ?? '—'} — ${targetProduct?.name ?? '—'}`;
        return (
          <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={closeMatDispatch} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-indigo-600" /> 物料外发
                  </h3>
                  <p className="text-sm text-slate-500 mt-0.5">{headerLabel}</p>
                </div>
                <button type="button" onClick={closeMatDispatch} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">外协工厂</label>
                    {matDispatchPartnerOptions.length <= 1 ? (
                      <div className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-slate-50">{matDispatchPartnerOptions[0] ?? '—'}</div>
                    ) : (
                      <select
                        value={matDispatchPartner}
                        onChange={e => setMatDispatchPartner(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        {matDispatchPartnerOptions.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {warehouses.length > 0 && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                      <select
                        value={matDispatchWarehouseId}
                        onChange={e => setMatDispatchWarehouseId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注说明</label>
                  <input
                    type="text"
                    value={matDispatchRemark}
                    onChange={e => setMatDispatchRemark(e.target.value)}
                    placeholder="选填"
                    className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                  />
                </div>
                {bomMaterials.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-sm">该{isProductMode ? '产品' : '工单'}未配置 BOM 物料，无法进行物料外发</p>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">理论需量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">已发进度</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次外发数量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {bomMaterials.map(m => {
                        const issued = issuedMap.get(m.productId) ?? 0;
                        return (
                          <tr key={m.productId} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-800">{m.name}</p>
                                {m.nodeNames.map(nn => (
                                  <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>
                                ))}
                              </div>
                              {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{m.unitNeeded}</td>
                            <td className="px-4 py-3">
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
                                    <span className="text-[9px] font-bold text-slate-500">
                                      {overIssue ? <span>已发 {issued} <span className="text-rose-500">（超发 {issued - needed}）</span></span> : `已发 ${issued}`}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={matDispatchQty[m.productId] ?? ''}
                                onChange={e => setMatDispatchQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                                className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {bomMaterials.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={closeMatDispatch}
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
      })()}

      {(matReturnOrderId || matReturnProductId) && (() => {
        const isProductMode = productionLinkMode === 'product';
        const targetOrder = !isProductMode && matReturnOrderId ? orders.find(o => o.id === matReturnOrderId) : undefined;
        const targetProductId = isProductMode ? matReturnProductId : targetOrder?.productId;
        const targetProduct = targetProductId ? products.find(p => p.id === targetProductId) : undefined;
        const dispatchedByPartnerMat = new Map<string, number>();
        const returnedByPartnerMat = new Map<string, number>();
        const matInfoMap = new Map<string, { name: string; sku: string }>();
        const filterForCard = (r: ProductionOpRecord) => {
          if (isProductMode) {
            return r.sourceProductId === targetProductId || (!r.orderId && !r.sourceProductId && r.productId);
          }
          return r.orderId === matReturnOrderId;
        };
        records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && r.partner === matReturnPartner && filterForCard(r)).forEach(r => {
          const key = r.productId;
          dispatchedByPartnerMat.set(key, (dispatchedByPartnerMat.get(key) ?? 0) + r.quantity);
          if (!matInfoMap.has(key)) {
            const mp = products.find(px => px.id === key);
            matInfoMap.set(key, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '' });
          }
        });
        if (isProductMode) {
          const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
          records.filter(r => r.type === 'STOCK_OUT' && !!r.partner && r.partner === matReturnPartner && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
            const key = r.productId;
            dispatchedByPartnerMat.set(key, (dispatchedByPartnerMat.get(key) ?? 0) + r.quantity);
            if (!matInfoMap.has(key)) {
              const mp = products.find(px => px.id === key);
              matInfoMap.set(key, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '' });
            }
          });
        }
        records.filter(r => r.type === 'STOCK_RETURN' && !!r.partner && r.partner === matReturnPartner && filterForCard(r)).forEach(r => {
          returnedByPartnerMat.set(r.productId, (returnedByPartnerMat.get(r.productId) ?? 0) + r.quantity);
        });
        if (isProductMode) {
          const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
          records.filter(r => r.type === 'STOCK_RETURN' && !!r.partner && r.partner === matReturnPartner && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
            returnedByPartnerMat.set(r.productId, (returnedByPartnerMat.get(r.productId) ?? 0) + r.quantity);
          });
        }
        const consumedByPartnerMat = new Map<string, number>();
        (() => {
          const receivedByNode = new Map<string, number>();
          const outsourceFilter = (r: ProductionOpRecord) => {
            if (isProductMode) {
              return !r.orderId && r.productId === targetProductId;
            }
            return r.orderId === matReturnOrderId;
          };
          records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === matReturnPartner && r.nodeId && outsourceFilter(r)).forEach(r => {
            receivedByNode.set(r.nodeId!, (receivedByNode.get(r.nodeId!) ?? 0) + r.quantity);
          });
          if (isProductMode) {
            const relatedOrderIds = new Set(orders.filter(o => o.productId === targetProductId).map(o => o.id));
            records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.partner === matReturnPartner && r.nodeId && r.orderId && relatedOrderIds.has(r.orderId)).forEach(r => {
              receivedByNode.set(r.nodeId!, (receivedByNode.get(r.nodeId!) ?? 0) + r.quantity);
            });
          }
          receivedByNode.forEach((recvQty, nodeId) => {
            const nodeBoms = boms.filter(b => b.parentProductId === targetProductId && b.nodeId === nodeId);
            nodeBoms.forEach(bom => {
              bom.items.forEach(bi => {
                const matConsumption = Number(bi.quantity) * recvQty;
                consumedByPartnerMat.set(bi.productId, (consumedByPartnerMat.get(bi.productId) ?? 0) + matConsumption);
              });
            });
          });
        })();
        const returnableMaterials = Array.from(dispatchedByPartnerMat.entries()).map(([pid, dispatched]) => ({
          productId: pid,
          name: matInfoMap.get(pid)?.name ?? '未知物料',
          sku: matInfoMap.get(pid)?.sku ?? '',
          dispatched,
          consumed: consumedByPartnerMat.get(pid) ?? 0,
          returned: returnedByPartnerMat.get(pid) ?? 0,
        })).filter(m => m.dispatched > 0);
        const getNextWtDocNo = () => {
          const prefix = 'WT';
          const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
          const pattern = `${prefix}${todayStr}-`;
          const existing = records.filter(r => r.type === 'STOCK_RETURN' && r.docNo && r.docNo.startsWith(pattern));
          const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
          const maxSeq = seqs.length ? Math.max(...seqs) : 0;
          return `${pattern}${String(maxSeq + 1).padStart(4, '0')}`;
        };
        const closeMatReturn = () => {
          setMatReturnOrderId(null);
          setMatReturnProductId(null);
          setMatReturnQty({});
          setMatReturnPartner('');
          setMatReturnRemark('');
        };
        const handleMatReturnSubmit = async () => {
          if (!matReturnPartner) { toast.warning('请选择外协工厂'); return; }
          const toReturn = returnableMaterials.filter(m => (matReturnQty[m.productId] ?? 0) > 0);
          if (toReturn.length === 0) { toast.warning('请至少填写一项退回数量'); return; }
          const overItems = toReturn.filter(m => (matReturnQty[m.productId] ?? 0) > Math.max(0, m.dispatched - m.consumed - m.returned));
          if (overItems.length > 0) { toast.warning(`「${overItems[0].name}」退回数量超过可退回数量`); return; }
          const docNo = getNextWtDocNo();
          const timestamp = new Date().toLocaleString();
          const batch: ProductionOpRecord[] = toReturn.map(m => ({
            id: `wt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'STOCK_RETURN' as ProdOpType,
            orderId: isProductMode ? undefined : (matReturnOrderId ?? undefined),
            productId: m.productId,
            quantity: matReturnQty[m.productId],
            operator: '张主管',
            timestamp,
            status: '已完成',
            partner: matReturnPartner,
            warehouseId: matReturnWarehouseId || undefined,
            docNo,
            reason: matReturnRemark.trim() || undefined,
            sourceProductId: isProductMode ? (targetProductId ?? undefined) : undefined,
          }));
          if (onAddRecordBatch && batch.length > 1) { await onAddRecordBatch(batch); } else { for (const rec of batch) onAddRecord(rec); }
          toast.success(`已退回 ${toReturn.length} 种物料，来自「${matReturnPartner}」`);
          closeMatReturn();
        };
        const headerLabel = isProductMode ? (targetProduct?.name ?? '—') : `${targetOrder?.orderNumber ?? '—'} — ${targetProduct?.name ?? '—'}`;
        return (
          <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={closeMatReturn} aria-hidden />
            <div className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Undo2 className="w-5 h-5 text-amber-600" /> 物料退回</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{headerLabel}</p>
                </div>
                <button type="button" onClick={closeMatReturn} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">外协工厂</label>
                    {matReturnPartnerOptions.length <= 1 ? (
                      <div className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-slate-50">{matReturnPartnerOptions[0] ?? '—'}</div>
                    ) : (
                      <select value={matReturnPartner} onChange={e => { setMatReturnPartner(e.target.value); setMatReturnQty({}); }} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                        {matReturnPartnerOptions.map(p => (<option key={p} value={p}>{p}</option>))}
                      </select>
                    )}
                  </div>
                  {warehouses.length > 0 && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">退回仓库</label>
                      <select value={matReturnWarehouseId} onChange={e => setMatReturnWarehouseId(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none bg-white">
                        {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注说明</label>
                  <input type="text" value={matReturnRemark} onChange={e => setMatReturnRemark(e.target.value)} placeholder="选填" className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-amber-500 outline-none placeholder:text-slate-400" />
                </div>
                {returnableMaterials.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-sm">该工厂暂无外发记录</p>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已外发</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">交货耗材</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已退回</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">可退回</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次退回数量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {returnableMaterials.map(m => {
                        const remaining = Math.max(0, m.dispatched - m.consumed - m.returned);
                        return (
                          <tr key={m.productId} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3"><p className="text-sm font-bold text-slate-800">{m.name}</p>{m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-indigo-600">{m.dispatched}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-rose-600">{m.consumed}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-amber-600">{m.returned}</td>
                            <td className="px-4 py-3 text-right text-sm font-black text-emerald-600">{remaining}</td>
                            <td className="px-4 py-3">
                              <input type="number" min={0} max={remaining} step={1} value={matReturnQty[m.productId] ?? ''} onChange={e => setMatReturnQty(prev => ({ ...prev, [m.productId]: Math.min(Number(e.target.value) || 0, remaining) }))} className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-amber-500 outline-none" placeholder="0" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {returnableMaterials.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button type="button" onClick={closeMatReturn} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
                  <button type="button" onClick={handleMatReturnSubmit} disabled={!returnableMaterials.some(m => (matReturnQty[m.productId] ?? 0) > 0) || !matReturnPartner} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"><Undo2 className="w-4 h-4" /> 确认退回</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {outsourceModal === 'dispatch' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOutsourceModal(null)} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600" /> 待发清单</h3>
              <button type="button" onClick={() => setOutsourceModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <p className="text-xs text-slate-500">
                {productionLinkMode === 'product'
                  ? '仅显示工序节点中已开启「可外协」的工序；可委外数量 = 产品该工序报工完成量 − 已委外发出。同一批次只能选择同一工序同时发出。'
                  : '仅显示工序节点中已开启「可外协」的工序；可委外数量 = 工单总量 − 该工序已报工 − 已委外发出。同一批次只能选择同一工序的工单同时发出。'}
              </p>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
              {productionLinkMode !== 'product' && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</label>
                  <input type="text" value={dispatchListSearchOrder} onChange={e => setDispatchListSearchOrder(e.target.value)} placeholder="工单号模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">货号</label>
                <input type="text" value={dispatchListSearchProduct} onChange={e => setDispatchListSearchProduct(e.target.value)} placeholder="产品名/SKU 模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</label>
                <select value={dispatchListSearchNodeId} onChange={e => setDispatchListSearchNodeId(e.target.value)} className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="">全部</option>
                  {dispatchListNodeOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                    <th className="w-12 px-4 py-3" />
                    {productionLinkMode !== 'product' && <th className="w-[28%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>}
                    <th className={`${productionLinkMode === 'product' ? 'w-[40%]' : 'w-[28%]'} px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest`}>产品</th>
                    <th className="w-[20%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                    <th className="w-[24%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">可委外数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDispatchRows.length === 0 ? (
                    <tr>
                      <td colSpan={productionLinkMode === 'product' ? 4 : 5} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceDispatchRows.length === 0 ? (productionLinkMode === 'product' ? '暂无可外协工序或可委外数量均为 0。请先在关联产品报工中完成该工序报工。' : '暂无可外协工序，或可委外数量均为 0。请在系统设置中为工序开启「可外协」并确保工单有未委外数量。') : '无匹配项，请调整搜索条件。'}</td>
                    </tr>
                  ) : (
                    filteredDispatchRows.map(row => {
                      const key = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
                      const checked = dispatchSelectedKeys.has(key);
                      return (
                        <tr key={key} className="hover:bg-slate-50/50 bg-white">
                          <td className="w-12 px-4 py-3 align-middle">
                            <input type="checkbox" checked={checked} onChange={() => {
                              setDispatchSelectedKeys(prev => {
                                const next = new Set(prev);
                                if (next.has(key)) { next.delete(key); return next; }
                                if (next.size > 0) {
                                  const selectedNodeId = next.values().next().value?.split('|')[1];
                                  if (selectedNodeId !== row.nodeId) { toast.warning('只能选择同一工序同时发出，请先取消其他工序的勾选。'); return prev; }
                                }
                                next.add(key);
                                return next;
                              });
                            }} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          </td>
                          {productionLinkMode !== 'product' && <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>}
                          <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700 align-middle">{row.availableQty}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {outsourceDispatchRows.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <span className="text-sm font-bold text-slate-600">已选 {dispatchSelectedKeys.size} 项</span>
                <button type="button" disabled={dispatchSelectedKeys.size === 0} onClick={() => setDispatchFormModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <Check className="w-4 h-4" /> 外协发出
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {dispatchFormModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setDispatchFormModalOpen(false); }} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-indigo-600" /> 外协发出 · 录入数量</h3>
              <button type="button" onClick={() => setDispatchFormModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
                  <SearchablePartnerSelect
                    options={partners}
                    categories={partnerCategories}
                    value={dispatchPartnerName}
                    onChange={name => setDispatchPartnerName(name)}
                    placeholder="搜索并选择外协工厂..."
                    triggerClassName="bg-white border border-slate-200 min-h-[52px] rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
                  <input type="text" value={dispatchRemark} onChange={e => setDispatchRemark(e.target.value)} placeholder="选填" className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品明细</h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {productionLinkMode === 'product'
                  ? '有颜色尺码的产品按规格录入委外数量。每格「最多」与工单中心 · 关联产品报工该工序一致（规格级可报良品余量，已扣本工序已报良品；再扣本规格已外协未收回）。无规格区分的单规格产品可填合计。'
                  : '有颜色尺码的工单按规格录入。每格「最多」与该工序可报最多数量一致（顺序模式以前工序该规格完成量为基数），再扣已报良品及已外协未收回。'}
              </p>
              <div className="space-y-8">
              {outsourceDispatchRows.filter(row => dispatchSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`)).map(row => {
                const dispatchRowKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
                const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
                const product = products.find(p => p.id === row.productId);
                const category = categories.find(c => c.id === product?.categoryId);
                const isProductBlock = productionLinkMode === 'product' && row.orderId == null;
                const blockOrders = isProductBlock ? orders.filter(o => o.productId === row.productId) : [];
                const variantIdsInBlock = new Set<string>();
                blockOrders.forEach(o => { (o.items ?? []).forEach(i => { if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId); }); });
                const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                const hasMultiVariantProduct = (product?.variants?.length ?? 0) > 1;
                const hasColorSizeOrder = productionLinkMode === 'order' && category?.hasColorSize && hasMultiVariantProduct;
                const hasColorSizeProduct = isProductBlock && category?.hasColorSize && hasMultiVariantProduct;
                const baseKey = dispatchRowKey;
                const variantsInOrder = hasColorSizeOrder && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id)) : [];
                const variantsInProductBlock = hasColorSizeProduct && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInBlock.has(v.id)) : [];

                if (variantsInOrder.length > 0) {
                  const ms = order?.milestones?.find(m => m.templateId === row.nodeId);
                  const msIdx = order?.milestones?.findIndex(m => m.templateId === row.nodeId) ?? -1;
                  const prevMs = (processSequenceMode === 'sequential' && msIdx > 0) ? order?.milestones?.[msIdx - 1] : undefined;
                  const outsourceDispatchedForNode = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                  const drForNode = row.orderId ? (defectiveReworkByOrderForOutsource.get(`${row.orderId}|${row.nodeId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> }) : { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
                  const getAvailableForVariant = (variantId: string) => {
                    const completedInMs = (ms?.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.quantity), 0);
                    const defectiveForVariant = (ms?.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.defectiveQuantity ?? 0), 0);
                    let seqRemaining: number;
                    if (prevMs) {
                      const prevCompleted = (prevMs.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.quantity), 0);
                      seqRemaining = prevCompleted - completedInMs;
                    } else {
                      const orderItem = order?.items?.find(i => (i.variantId || '') === variantId);
                      seqRemaining = (orderItem?.quantity ?? 0) - completedInMs;
                    }
                    const base = Math.max(0, seqRemaining - defectiveForVariant);
                    const reworkForVariant = drForNode.reworkByVariant?.[variantId] ?? 0;
                    const dispatched = outsourceDispatchedForNode.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                    return Math.max(0, base + reworkForVariant - dispatched);
                  };
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInOrder.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        {row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">颜色尺码</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}|${v.id}`;
                                  const maxVariant = getAvailableForVariant(v.id);
                                  const cellQty = dispatchFormQuantities[qtyKey] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input type="number" min={0} max={maxVariant} value={cellQty === 0 ? '' : cellQty} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxVariant) })); }} placeholder={`最多${maxVariant}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
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
                }

                if (variantsInProductBlock.length > 0) {
                  const getDr = (oid: string, tid: string) => defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
                  const milestoneNodeIds = product?.milestoneNodeIds || [];
                  const seq = (processSequenceMode ?? 'free') as ProcessSequenceMode;
                  const outsourcedProductNode = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId);
                  const getAvailableForVariantProduct = (variantId: string) => {
                    const maxGood = variantMaxGoodProductMode(variantId, row.nodeId, row.productId, blockOrders, productMilestoneProgresses || [], seq, milestoneNodeIds, getDr);
                    const dispatched = outsourcedProductNode.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                    return Math.max(0, maxGood - dispatched);
                  };
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInProductBlock.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">关联产品 · 颜色尺码</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                        <span className="text-xs text-slate-500">（合计可委外 {row.availableQty}，按规格之和填写）</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}|${v.id}`;
                                  const maxVariant = getAvailableForVariantProduct(v.id);
                                  const cellQty = dispatchFormQuantities[qtyKey] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input type="number" min={0} max={maxVariant} value={cellQty === 0 ? '' : cellQty} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxVariant) })); }} placeholder={`最多${maxVariant}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
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
                }

                return (
                  <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                      {isProductBlock && <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">单规格/无尺码矩阵</span>}
                      <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    </div>
                    <div className="flex flex-col gap-1 flex-1 max-w-xs">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">委外数量</label>
                      <input type="number" min={0} max={row.availableQty} value={(dispatchFormQuantities[baseKey] ?? 0) === 0 ? '' : dispatchFormQuantities[baseKey]} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setDispatchFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, row.availableQty) })); }} placeholder={`最多${row.availableQty}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                      <span className="text-[10px] text-slate-500">{isProductBlock ? '与报工页本工序合计上限一致' : '下单 − 已报 − 已发出'}</span>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 shrink-0">
              <button type="button" onClick={handleDispatchFormSubmit} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                <Check className="w-4 h-4" /> 确认发出
              </button>
            </div>
          </div>
        </div>
      )}

      {outsourceModal === 'receive' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOutsourceModal(null)} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 待收回清单</h3>
              <button type="button" onClick={() => setOutsourceModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <p className="text-xs text-slate-500">{productionLinkMode === 'product' ? '已发出未收回的产品+工序+外协厂汇总；勾选后点击「批量收回」填写本次收回数量。' : '已发出未收回的工单+工序汇总；点击「收回」填写本次收回数量。'}</p>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex flex-wrap items-center gap-3">
              {productionLinkMode !== 'product' && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</label>
                  <input type="text" value={receiveListSearchOrder} onChange={e => setReceiveListSearchOrder(e.target.value)} placeholder="工单号模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">货号</label>
                <input type="text" value={receiveListSearchProduct} onChange={e => setReceiveListSearchProduct(e.target.value)} placeholder="产品名/SKU 模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</label>
                <input type="text" value={receiveListSearchPartner} onChange={e => setReceiveListSearchPartner(e.target.value)} placeholder="模糊搜索" className="w-36 rounded-lg border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</label>
                <select value={receiveListSearchNodeId} onChange={e => setReceiveListSearchNodeId(e.target.value)} className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="">全部</option>
                  {receiveListNodeOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                    <th className="w-12 px-4 py-3" />
                    {productionLinkMode !== 'product' && <th className="w-[18%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工单号</th>}
                    <th className="w-[18%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">产品</th>
                    <th className="w-[14%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">工序</th>
                    <th className="w-[14%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">外协厂商</th>
                    <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">发出总量</th>
                    <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收总量</th>
                    <th className="w-[9%] px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceiveRows.length === 0 ? (
                    <tr><td colSpan={productionLinkMode === 'product' ? 7 : 8} className="px-6 py-16 text-center text-slate-400 text-sm">{outsourceReceiveRows.length === 0 ? '暂无待收回项。' : '无匹配项，请调整搜索条件。'}</td></tr>
                  ) : (
                    filteredReceiveRows.map(row => {
                      const key = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
                      const checked = receiveSelectedKeys.has(key);
                      return (
                        <tr key={key} className="hover:bg-slate-50/50 bg-white">
                          <td className="w-12 px-4 py-3 align-middle">
                            <input type="checkbox" checked={checked} onChange={() => {
                              setReceiveSelectedKeys(prev => {
                                const next = new Set(prev);
                                if (next.has(key)) { next.delete(key); return next; }
                                if (next.size > 0) {
                                  const firstKey = next.values().next().value;
                                  const firstRow = outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey);
                                  const selectedPartner = firstRow?.partner ?? '';
                                  if (selectedPartner !== (row.partner ?? '')) { toast.warning('只能选择同一外协工厂同时收货，请先取消其他加工厂的勾选。'); return prev; }
                                  const selectedNodeId = firstKey?.split('|')[1];
                                  if (selectedNodeId !== row.nodeId) { toast.warning('只能选择同一工序同时收货，请先取消其他工序的勾选。'); return prev; }
                                }
                                next.add(key);
                                return next;
                              });
                            }} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          </td>
                          {productionLinkMode !== 'product' && <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.orderNumber}>{row.orderNumber}</td>}
                          <td className="px-6 py-3 text-sm font-bold text-slate-800 align-middle truncate" title={row.productName}>{row.productName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-indigo-600 align-middle truncate" title={row.milestoneName}>{row.milestoneName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-700 align-middle truncate" title={row.partner || '—'}>
                            {row.partner || '—'}
                            {partners.find(p => p.name === row.partner)?.collaborationTenantId && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-50 text-indigo-600 uppercase">协作</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-slate-700 align-middle">{row.dispatched}</td>
                          <td className="px-6 py-3 text-right text-sm font-bold text-emerald-600 align-middle">{row.received}</td>
                          <td className="px-6 py-3 text-right text-sm font-black text-amber-600 align-middle">{row.pending}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {outsourceReceiveRows.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <span className="text-sm font-bold text-slate-600">已选 {receiveSelectedKeys.size} 项</span>
                <button type="button" disabled={receiveSelectedKeys.size === 0} onClick={() => setReceiveFormModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <Check className="w-4 h-4" /> 收货
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {receiveFormModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setReceiveFormModalOpen(false); }} aria-hidden />
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 外协收货 · 录入数量</h3>
              <button type="button" onClick={() => setReceiveFormModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
                  <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-slate-50 flex items-center">
                    {(() => { const firstKey = receiveSelectedKeys.values().next().value; if (!firstKey) return '—'; const row = outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey); return row?.partner || '—'; })()}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
                  <input type="text" value={receiveFormRemark} onChange={e => setReceiveFormRemark(e.target.value)} placeholder="选填" className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0 p-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品明细</h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {productionLinkMode === 'product'
                  ? '关联产品且发出单按颜色尺码录入时，按规格收回；每格「最多」= 该规格已发出未收回数。若有未带规格的发出的数量，在下方「未按规格」行收回。'
                  : '按规格收回时每格不超过该规格待收数量。'}
              </p>
              <div className="space-y-8">
              {outsourceReceiveRows.filter(row => receiveSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`)).map(row => {
                const receiveRowKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
                const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
                const product = products.find(p => p.id === row.productId);
                const category = categories.find(c => c.id === product?.categoryId);
                const hasColorSize = productionLinkMode === 'order' && category?.hasColorSize && (product?.variants?.length ?? 0) > 1;
                const baseKey = receiveRowKey;
                const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                const variantsInOrder = hasColorSize && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id)) : [];
                const dispatchRecords = productionLinkMode === 'product'
                  ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
                  : records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                const receiveRecords = productionLinkMode === 'product'
                  ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
                  : records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.orderId === row.orderId && r.nodeId === row.nodeId);
                const getPendingForVariant = (variantId: string) => {
                  const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                  const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                  return Math.max(0, dispatched - received);
                };
                const isProductBlockRecv = productionLinkMode === 'product' && row.orderId == null;
                const blockOrdersRecv = isProductBlockRecv ? orders.filter(o => o.productId === row.productId) : [];
                const variantIdsInBlockRecv = new Set<string>();
                blockOrdersRecv.forEach(o => { (o.items ?? []).forEach(i => { if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlockRecv.add(i.variantId); }); });
                const hasMultiVariantRecv = (product?.variants?.length ?? 0) > 1;
                const variantsInProductBlockRecv = isProductBlockRecv && category?.hasColorSize && hasMultiVariantRecv && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInBlockRecv.has(v.id)) : [];
                const hasVariantProductDispatchesRecv = dispatchRecords.some(r => !!r.variantId);
                const dispNoVarRecv = dispatchRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
                const recNoVarRecv = receiveRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
                const pendingNoVarRecv = Math.max(0, dispNoVarRecv - recNoVarRecv);

                if (isProductBlockRecv && variantsInProductBlockRecv.length > 0 && hasVariantProductDispatchesRecv) {
                  const groupedPb: Record<string, ProductVariant[]> = {};
                  variantsInProductBlockRecv.forEach(v => { if (!groupedPb[v.colorId]) groupedPb[v.colorId] = []; groupedPb[v.colorId].push(v); });
                  const rowTotalPb = variantsInProductBlockRecv.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`] ?? 0), 0) + (pendingNoVarRecv > 0 ? receiveFormQuantities[baseKey] ?? 0 : 0);
                  const rowUnitPb = receiveFormUnitPrices[baseKey] ?? 0;
                  const rowAmountPb = rowTotalPb * rowUnitPb;
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">关联产品 · 颜色尺码</span>
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                        <span className="text-xs text-slate-500">待收回合计 {row.pending} 件</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedPb, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`;
                                  const maxV = getPendingForVariant(v.id);
                                  const cellQ = receiveFormQuantities[qtyKey] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input type="number" min={0} max={maxV} value={cellQ === 0 ? '' : cellQ} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxV) })); }} placeholder={`最多${maxV}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {pendingNoVarRecv > 0 && (
                        <div className="p-4 bg-white rounded-xl border border-dashed border-slate-200 flex flex-wrap items-center gap-4">
                          <span className="text-sm font-bold text-slate-600">未按规格发出的待收回</span>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-400">数量</span>
                            <input type="number" min={0} max={pendingNoVarRecv} value={(receiveFormQuantities[baseKey] ?? 0) === 0 ? '' : receiveFormQuantities[baseKey]} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, pendingNoVarRecv) })); }} placeholder={`最多${pendingNoVarRecv}`} className="w-36 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                          <input type="number" min={0} step={0.01} value={receiveFormUnitPrices[baseKey] ?? ''} onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                          <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{rowAmountPb.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (variantsInOrder.length > 0) {
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  variantsInOrder.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
                  const rowTotalQty = variantsInOrder.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}|${v.id}`] ?? 0), 0);
                  const rowUnitPrice = receiveFormUnitPrices[baseKey] ?? 0;
                  const rowAmount = rowTotalQty * rowUnitPrice;
                  return (
                    <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                        <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                        <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      </div>
                      <div className="space-y-4">
                        {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3 w-40 shrink-0">
                                <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                              </div>
                              <div className="flex-1 flex flex-wrap gap-4">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                  const qtyKey = `${baseKey}|${v.id}`;
                                  const maxVariant = getPendingForVariant(v.id);
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                      <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                                      <div className="relative flex items-center bg-white border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500">
                                        <input type="number" min={0} max={maxVariant} value={receiveFormQuantities[qtyKey] ?? ''} onChange={e => setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Number(e.target.value) || 0 }))} className="w-full bg-transparent rounded-xl py-1.5 pl-2 pr-12 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none" />
                                        <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{maxVariant}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                          <input type="number" min={0} step={0.01} value={receiveFormUnitPrices[baseKey] ?? ''} onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                          <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{rowAmount.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                      <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap flex-1">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本次收回数量</label>
                        <div className="relative flex items-center bg-white border border-slate-200 rounded-xl w-32 focus-within:ring-2 focus-within:ring-indigo-500">
                          <input type="number" min={0} max={row.pending} value={receiveFormQuantities[baseKey] ?? ''} onChange={e => setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} className="w-full bg-transparent rounded-xl py-2 pl-3 pr-10 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none" />
                          <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{row.pending}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                        <input type="number" min={0} step={0.01} value={receiveFormUnitPrices[baseKey] ?? ''} onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                        <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                          {((receiveFormQuantities[baseKey] ?? 0) * (receiveFormUnitPrices[baseKey] ?? 0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 shrink-0">
              <button type="button" onClick={handleReceiveFormSubmit} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                <Check className="w-4 h-4" /> 确认收货
              </button>
            </div>
          </div>
        </div>
      )}

      {outsourceModal === 'flow' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setOutsourceModal(null); setFlowDetailKey(null); }} aria-hidden />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 外协流水</h3>
              <button type="button" onClick={() => { setOutsourceModal(null); setFlowDetailKey(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                  <input type="date" value={flowFilterDateFrom} onChange={e => setFlowFilterDateFrom(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                  <input type="date" value={flowFilterDateTo} onChange={e => setFlowFilterDateTo(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                  <select value={flowFilterType} onChange={e => setFlowFilterType(e.target.value as 'all' | '发出' | '收回')} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                    <option value="all">全部</option>
                    <option value="发出">发出</option>
                    <option value="收回">收回</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">外协工厂</label>
                  <input type="text" value={flowFilterPartner} onChange={e => setFlowFilterPartner(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
                  <input type="text" value={flowFilterDocNo} onChange={e => setFlowFilterDocNo(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                {productionLinkMode !== 'product' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工单</label>
                    <input type="text" value={flowFilterOrder} onChange={e => setFlowFilterOrder(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                  <input type="text" value={flowFilterProduct} onChange={e => setFlowFilterProduct(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
                  <select value={flowFilterMilestone} onChange={e => setFlowFilterMilestone(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                    <option value="">全部</option>
                    {globalNodes.map(n => (<option key={n.id} value={n.id}>{n.name}</option>))}
                  </select>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <button type="button" onClick={() => { setFlowFilterDateFrom(''); setFlowFilterDateTo(''); setFlowFilterType('all'); setFlowFilterPartner(''); setFlowFilterDocNo(''); setFlowFilterOrder(''); setFlowFilterProduct(''); setFlowFilterMilestone(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                <span className="text-xs text-slate-400">共 {filteredOutsourceFlowRows.length} 条</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {filteredOutsourceFlowRows.length === 0 ? (
                <p className="text-slate-500 text-center py-12">暂无外协流水记录</p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</th>
                        {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">备注</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOutsourceFlowRows.map(row => {
                        const rowKey = productionLinkMode === 'product' ? `${row.docNo}|${row.productId}` : `${row.docNo}|${row.orderId}|${row.productId}`;
                        const hasDispatch = (row.typeStr || '').includes('发出');
                        const hasReceive = (row.typeStr || '').includes('收回');
                        return (
                          <tr key={rowKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNo}</td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.dateStr}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                {hasDispatch && (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800"><ArrowUpFromLine className="w-3 h-3" /> 发出</span>)}
                                {hasReceive && (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"><Undo2 className="w-3 h-3" /> 收回</span>)}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800">{row.partner}</td>
                            {productionLinkMode !== 'product' && <td className="px-4 py-3 text-[10px] font-black text-indigo-600 uppercase">{row.orderNumber}</td>}
                            <td className="px-4 py-3 font-bold text-slate-800">{row.productName}</td>
                            <td className="px-4 py-3 font-bold text-slate-700">{row.milestoneStr}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQuantity}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={row.remark}>{row.remark}</td>
                            <td className="px-4 py-3">
                              {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:view') && (
                                <button type="button" onClick={() => setFlowDetailKey(row.docNo)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0">
                                  <FileText className="w-3.5 h-3.5" /> 详情
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 9 : 10}>
                          <span className="text-[10px] text-slate-500 uppercase mr-3">合计</span>
                          <span className="text-xs text-indigo-600">发出 {outsourceFlowTotalDispatch} 件</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-amber-600">收回 {outsourceFlowTotalReceive} 件</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-slate-700">结余 {Math.round((outsourceFlowTotalDispatch - outsourceFlowTotalReceive) * 100) / 100} 件</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {outsourceModal === 'flow' && flowDetailKey && (() => {
        const docRecords = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
        if (docRecords.length === 0) return null;
        const first = docRecords[0];
        const isReceiveDoc = first.status === '已收回';
        const totalAmount = isReceiveDoc ? docRecords.reduce((s, r) => s + (r.amount ?? 0), 0) : 0;
        const docDateStr = first.timestamp ? (() => { try { const d = new Date(first.timestamp); return isNaN(d.getTime()) ? first.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return first.timestamp; } })() : '—';
        const docPartner = first.partner ?? '—';
        const docRemark = docRecords.map(r => r.reason).filter(Boolean)[0] ?? '—';
        const isProductModeDetail = productionLinkMode === 'product' && docRecords.some(r => !r.orderId);
        const byOrderNode = new Map<string, ProductionOpRecord[]>();
        docRecords.forEach(rec => {
          if (!rec.nodeId) return;
          const key = isProductModeDetail ? `${rec.productId}|${rec.nodeId}` : (rec.orderId ? `${rec.orderId}|${rec.nodeId}` : '');
          if (!key) return;
          if (!byOrderNode.has(key)) byOrderNode.set(key, []);
          byOrderNode.get(key)!.push(rec);
        });
        const detailLines = Array.from(byOrderNode.entries()).map(([key, recs]) => {
          const order = recs[0].orderId ? orders.find(o => o.id === recs[0].orderId) : undefined;
          const product = products.find(p => p.id === (order?.productId ?? recs[0].productId));
          const nodeName = recs[0].nodeId ? (globalNodes.find(n => n.id === recs[0].nodeId)?.name ?? recs[0].nodeId) : '—';
          const variantQty: Record<string, number> = {};
          recs.forEach(r => { const v = r.variantId || ''; if (!variantQty[v]) variantQty[v] = 0; variantQty[v] += r.quantity; });
          return { key, order, product, orderNumber: order?.orderNumber ?? (isProductModeDetail ? '' : recs[0].orderId), productName: product?.name ?? '—', nodeName, records: recs, variantQty };
        });
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setFlowDetailKey(null); setFlowDetailEditMode(false); }} aria-hidden />
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 单据详情 · {flowDetailKey}</h3>
                <div className="flex items-center gap-2">
                  {flowDetailEditMode ? (
                    <>
                      <button type="button" onClick={() => { setFlowDetailEditMode(false); setFlowDetailUnitPrices({}); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button type="button" onClick={async () => {
                        if (!onDeleteRecord) return;
                        const partnerName = (flowDetailEditPartner || '').trim();
                        if (!partnerName) { toast.warning('请选择外协工厂。'); return; }
                        const entries = (Object.entries(flowDetailQuantities) as [string, number][]).filter(([, qty]) => qty > 0);
                        if (entries.length === 0) { toast.warning('请至少填写一项数量。'); return; }
                        const toDelete = isReceiveDoc ? docRecords : docRecords.filter(r => r.status !== '已收回');
                        for (const rec of toDelete) await onDeleteRecord(rec.id);
                        const timestamp = first.timestamp || new Date().toLocaleString();
                        const newStatus = isReceiveDoc ? '已收回' : '加工中';
                        const batch: ProductionOpRecord[] = [];
                        entries.forEach(([key, qty]) => {
                          const parts = key.split('|');
                          const nodeId = parts[1];
                          const variantId = parts[2];
                          if (isProductModeDetail) {
                            const productId = parts[0];
                            const bk = parts.length >= 2 ? `${productId}|${nodeId}` : key;
                            const unitPrice = isReceiveDoc ? (flowDetailUnitPrices[key] ?? flowDetailUnitPrices[bk] ?? 0) : undefined;
                            const amount = isReceiveDoc && unitPrice != null ? Number(qty) * unitPrice : undefined;
                            batch.push({ id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'OUTSOURCE', productId, quantity: qty, reason: flowDetailEditRemark.trim() || undefined, operator: first.operator || '张主管', timestamp, status: newStatus, partner: partnerName, docNo: flowDetailKey, nodeId, variantId: variantId || undefined, unitPrice: unitPrice || undefined, amount: amount ?? undefined } as ProductionOpRecord);
                            return;
                          }
                          const orderId = parts[0];
                          const bk = parts.length >= 2 ? `${orderId}|${nodeId}` : key;
                          const order = orders.find(o => o.id === orderId);
                          if (!order) return;
                          const unitPrice = isReceiveDoc ? (flowDetailUnitPrices[key] ?? flowDetailUnitPrices[bk] ?? 0) : undefined;
                          const amount = isReceiveDoc && unitPrice != null ? Number(qty) * unitPrice : undefined;
                          batch.push({ id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'OUTSOURCE', orderId, productId: order.productId, quantity: qty, reason: flowDetailEditRemark.trim() || undefined, operator: first.operator || '张主管', timestamp, status: newStatus, partner: partnerName, docNo: flowDetailKey, nodeId, variantId: variantId || undefined, unitPrice: unitPrice || undefined, amount: amount ?? undefined } as ProductionOpRecord);
                        });
                        if (onAddRecordBatch && batch.length > 1) { await onAddRecordBatch(batch); } else { for (const rec of batch) await onAddRecord(rec); }
                        setFlowDetailEditMode(false);
                        setFlowDetailUnitPrices({});
                      }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:edit') && (
                        <button type="button" onClick={() => {
                          setFlowDetailEditPartner(docPartner);
                          setFlowDetailEditRemark(docRemark);
                          const initQty: Record<string, number> = {};
                          docRecords.forEach(r => { const k = isProductModeDetail ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}` : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`; initQty[k] = (initQty[k] || 0) + r.quantity; });
                          setFlowDetailQuantities(initQty);
                          if (isReceiveDoc) {
                            const initUnitPrice: Record<string, number> = {};
                            docRecords.forEach(r => { const k = isProductModeDetail ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}` : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`; initUnitPrice[k] = r.unitPrice ?? 0; });
                            docRecords.forEach(r => { if (r.variantId) { const base = isProductModeDetail ? `${r.productId}|${r.nodeId}` : `${r.orderId}|${r.nodeId}`; if (initUnitPrice[base] == null) initUnitPrice[base] = r.unitPrice ?? 0; } });
                            setFlowDetailUnitPrices(initUnitPrice);
                          } else { setFlowDetailUnitPrices({}); }
                          setFlowDetailEditMode(true);
                        }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:delete') && (
                        <button type="button" onClick={() => {
                          void confirm({ message: '确定要删除该张外协单的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                            if (!ok) return;
                            docRecords.forEach(rec => onDeleteRecord(rec.id));
                            setFlowDetailKey(null);
                            setFlowDetailEditMode(false);
                          });
                        }} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setFlowDetailKey(null); setFlowDetailEditMode(false); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">单号</label>
                    <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{flowDetailKey}</div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">日期</label>
                    <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docDateStr}</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
                    {flowDetailEditMode ? (
                      <SearchablePartnerSelect options={partners} categories={partnerCategories} value={flowDetailEditPartner} onChange={name => setFlowDetailEditPartner(name)} placeholder="搜索并选择外协工厂..." triggerClassName="bg-white border border-slate-200 min-h-[52px] rounded-xl" />
                    ) : (
                      <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docPartner}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
                    {flowDetailEditMode ? (
                      <input type="text" value={flowDetailEditRemark} onChange={e => setFlowDetailEditRemark(e.target.value)} placeholder="选填" className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" />
                    ) : (
                      <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center truncate" title={docRemark}>{docRemark}</div>
                    )}
                  </div>
                  {isReceiveDoc && (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">加工费合计（元）</label>
                      <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-emerald-50 flex items-center">{totalAmount.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0 p-6">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">商品明细</h4>
                <div className="space-y-8">
                  {detailLines.map(({ key, order, product, orderNumber, productName, nodeName, records: lineRecords, variantQty }) => {
                    const category = categories.find(c => c.id === product?.categoryId);
                    const hasColorSizeCategory = !!category?.hasColorSize;
                    const allProductVariants = (product?.variants as ProductVariant[]) ?? [];
                    const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
                    const variantIdsFromRecords = new Set(Object.entries(variantQty).filter(([vid, q]) => vid !== '' && (Number(q) || 0) !== 0).map(([vid]) => vid));
                    let variantsForDetail: ProductVariant[] = [];
                    if (hasColorSizeCategory && allProductVariants.length > 0) {
                      if (variantIdsInOrder.size > 0) variantsForDetail = allProductVariants.filter(v => variantIdsInOrder.has(v.id));
                      if (variantsForDetail.length === 0 && variantIdsFromRecords.size > 0) variantsForDetail = allProductVariants.filter(v => variantIdsFromRecords.has(v.id));
                    }
                    const showVariantQtyGrid = hasColorSizeCategory && variantsForDetail.length > 0;
                    if (showVariantQtyGrid) {
                      const groupedByColor: Record<string, ProductVariant[]> = {};
                      variantsForDetail.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
                      return (
                        <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>}
                            <span className="text-sm font-bold text-slate-800">{productName}</span>
                            <span className="text-sm font-bold text-indigo-600">{nodeName}</span>
                          </div>
                          <div className="space-y-4">
                            {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                              const color = dictionaries?.colors?.find(c => c.id === colorId);
                              return (
                                <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                                  <div className="flex items-center gap-3 w-40 shrink-0">
                                    <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                                    <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                                  </div>
                                  <div className="flex-1 flex flex-wrap gap-4">
                                    {colorVariants.map(v => {
                                      const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                      const qtyKey = `${key}|${v.id}`;
                                      const qty = flowDetailEditMode ? (flowDetailQuantities[qtyKey] ?? variantQty[v.id] ?? 0) : (variantQty[v.id] ?? 0);
                                      return (
                                        <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                          <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                                          {flowDetailEditMode ? (
                                            <input type="number" min={0} value={flowDetailQuantities[qtyKey] ?? ''} onChange={e => setFlowDetailQuantities(prev => ({ ...prev, [qtyKey]: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none" />
                                          ) : (
                                            <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{qty}</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {isReceiveDoc && (
                            <div className="flex flex-wrap items-center gap-4 pt-4 mt-4 border-t border-slate-100">
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                                {flowDetailEditMode ? (
                                  <input type="number" min={0} step={0.01} value={flowDetailUnitPrices[key] ?? ''} onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                ) : (
                                  <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineRecords[0]?.unitPrice != null ? Number(lineRecords[0].unitPrice).toFixed(2) : '—'}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                                <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                                  {flowDetailEditMode
                                    ? variantsForDetail.reduce((sum, v) => { const qk = `${key}|${v.id}`; const q = flowDetailQuantities[qk] ?? variantQty[v.id] ?? 0; const up = flowDetailUnitPrices[qk] ?? flowDetailUnitPrices[key] ?? lineRecords.find(r => (r.variantId || '') === v.id)?.unitPrice ?? 0; return sum + q * up; }, 0).toFixed(2)
                                    : lineRecords.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    const totalQty = Object.values(variantQty).reduce((s, n) => s + n, 0);
                    const singleQty = flowDetailEditMode ? (flowDetailQuantities[key] ?? totalQty) : totalQty;
                    const lineRec = lineRecords[0];
                    const lineUnitPrice = flowDetailEditMode && isReceiveDoc ? (flowDetailUnitPrices[key] ?? lineRec?.unitPrice ?? 0) : (lineRec?.unitPrice ?? 0);
                    const lineAmount = flowDetailEditMode && isReceiveDoc ? (singleQty * lineUnitPrice) : (lineRec?.amount ?? 0);
                    return (
                      <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-3 flex-wrap">
                            {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>}
                            <span className="text-sm font-bold text-slate-800">{productName}</span>
                            <span className="text-sm font-bold text-indigo-600">{nodeName}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">委外数量</label>
                            {flowDetailEditMode ? (
                              <input type="number" min={0} value={flowDetailQuantities[key] ?? ''} onChange={e => setFlowDetailQuantities(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} className="w-32 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none" />
                            ) : (
                              <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl w-32 py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{totalQty}</div>
                            )}
                          </div>
                        </div>
                        {isReceiveDoc && (
                          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                              {flowDetailEditMode ? (
                                <input type="number" min={0} step={0.01} value={flowDetailUnitPrices[key] ?? ''} onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                              ) : (
                                <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineUnitPrice.toFixed(2)}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                              <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineAmount.toFixed(2)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setCollabSyncConfirm(null); setSelectedRouteId(''); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" /> 同步到协作企业
            </h3>
            <p className="text-sm text-slate-600">
              外协工厂「<span className="font-bold text-slate-800">{collabSyncConfirm.partnerName}</span>」已绑定协作企业，是否将本次发出的 {collabSyncConfirm.recordIds.length} 条记录同步？
            </p>
            {(() => {
              const matchingRoutes = collabRoutes.filter((r: any) => {
                const sorted = [...(r.steps || [])].sort((a: any, b: any) => a.stepOrder - b.stepOrder);
                return sorted.length > 0 && sorted[0].receiverTenantId === collabSyncConfirm.collaborationTenantId;
              });
              if (matchingRoutes.length === 0) return null;
              return (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">外协路线（可选）</label>
                <select value={selectedRouteId} onChange={e => setSelectedRouteId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-slate-800">
                  <option value="">不使用路线（单步外协）</option>
                  {matchingRoutes.map((r: any) => (<option key={r.id} value={r.id}>{r.name} ({(r.steps || []).length} 步)</option>))}
                </select>
                {selectedRouteId && (() => {
                  const route = collabRoutes.find((r: any) => r.id === selectedRouteId);
                  if (!route) return null;
                  return (
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      {(route.steps || []).sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((s: any, i: number) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-slate-400 text-xs">→</span>}
                          <span className="text-xs font-bold text-indigo-600">{s.nodeName}·{s.receiverTenantName}</span>
                        </React.Fragment>
                      ))}
                      <span className="text-slate-400 text-xs">→</span>
                      <span className="text-xs font-bold text-emerald-600">回传</span>
                    </div>
                  );
                })()}
              </div>
              );
            })()}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setCollabSyncConfirm(null); setSelectedRouteId(''); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">暂不发送</button>
              <button type="button" disabled={collabSyncing} onClick={async () => {
                setCollabSyncing(true);
                try {
                  const res = await api.collaboration.syncDispatch({
                    recordIds: collabSyncConfirm.recordIds,
                    collaborationTenantId: collabSyncConfirm.collaborationTenantId,
                    ...(selectedRouteId ? { outsourceRouteId: selectedRouteId } : {}),
                  });
                  toast.success(`已同步 ${res.dispatches?.length ?? 0} 条到协作企业`);
                  setCollabSyncConfirm(null);
                  setSelectedRouteId('');
                } catch (err: any) {
                  toast.error(err.message || '同步失败');
                } finally {
                  setCollabSyncing(false);
                }
              }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {collabSyncing ? '同步中...' : '确认发送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(OutsourcePanel);
