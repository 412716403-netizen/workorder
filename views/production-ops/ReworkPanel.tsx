import React, { useState, useMemo } from 'react';
import {
  Plus,
  ArrowUpFromLine,
  Clock,
  ClipboardList,
  Layers,
  X,
  ScrollText,
  Check,
  Filter,
  FileText,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  User,
  Package,
  UserPlus,
  History
} from 'lucide-react';
import { toast } from 'sonner';
import { ProductionOpRecord, ProductionOrder, Product, Warehouse, BOM, AppDictionaries, GlobalNodeTemplate, ProductCategory, ProductVariant, Worker, ProcessSequenceMode, ProductMilestoneProgress } from '../../types';
import { splitQtyBySourceDefectiveAcrossParentOrders } from '../../utils/reworkSplitByProductOrders';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import {
  outlineToolbarButtonClass,
} from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';
import { PanelProps, hasOpsPerm, getOrderFamilyIds, getOrderFamilyWithDepth, ReworkPendingRow } from './types';

/** 待处理不良「单号」筛选：支持报工单号 BG…、批次 id */
function reworkReportsMatchDocSearch(
  reports: { reportNo?: string; reportBatchId?: string; id: string }[] | undefined,
  kwLower: string
): boolean {
  if (!kwLower || !reports?.length) return false;
  return reports.some(
    r =>
      (r.reportNo && r.reportNo.toLowerCase().includes(kwLower)) ||
      (r.reportBatchId && String(r.reportBatchId).toLowerCase().includes(kwLower)) ||
      String(r.id).toLowerCase().includes(kwLower)
  );
}

const ReworkPanel: React.FC<PanelProps> = ({
  productionLinkMode = 'order', productMilestoneProgresses = [], records, orders, products, warehouses = [], boms = [], dictionaries, onAddRecord, onAddRecordBatch, onUpdateRecord, onDeleteRecord, globalNodes = [], partners = [], categories = [], partnerCategories = [], workers = [], equipment = [], processSequenceMode = 'free',
  userPermissions, tenantRole
}) => {
  const confirm = useConfirm();
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:rework_list:allow');

  /** 返工管理：待处理不良弹窗 */
  const [reworkPendingModalOpen, setReworkPendingModalOpen] = useState(false);
  /** 返工报工流水弹窗（参考报工流水） */
  const [reworkFlowModalOpen, setReworkFlowModalOpen] = useState(false);
  const [reworkFlowFilter, setReworkFlowFilter] = useState<{ dateFrom: string; dateTo: string; orderNumber: string; productId: string; nodeName: string; operator: string; reportNo: string }>({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', reportNo: '' });
  /** 返工报工流水：点击详情的记录（同单号批次在弹窗内按 docNo 聚合） */
  const [reworkFlowDetailRecord, setReworkFlowDetailRecord] = useState<ProductionOpRecord | null>(null);
  /** 返工报工流水详情：编辑态（参考报工流水详情），含时间/操作人/报工人员/设备/原因及每行数量 */
  const [reworkFlowDetailEditing, setReworkFlowDetailEditing] = useState<{
    form: { timestamp: string; operator: string; workerId: string; equipmentId: string; reason: string; unitPrice: number; rowEdits: { recordId: string; quantity: number }[] };
    firstRecord: ProductionOpRecord;
  } | null>(null);
  /** 返工管理：点击「详情」时展示的工单 id（主工单），弹窗内展示该工单的返工与不良处理情况 */
  const [reworkDetailOrderId, setReworkDetailOrderId] = useState<string | null>(null);
  /** 处理不良品流水弹窗：生成返工(REWORK)+报损(SCRAP)，UI 参考返工报工流水 */
  const [defectFlowModalOpen, setDefectFlowModalOpen] = useState(false);
  const [defectFlowFilter, setDefectFlowFilter] = useState<{ dateFrom: string; dateTo: string; orderNumber: string; productId: string; nodeName: string; operator: string; recordType: string }>({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', recordType: '' });
  const [defectFlowDetailRecord, setDefectFlowDetailRecord] = useState<ProductionOpRecord | null>(null);
  const [defectFlowDetailEditing, setDefectFlowDetailEditing] = useState<{ form: { timestamp: string; operator: string; reason: string; rowEdits: { recordId: string; quantity: number }[] }; firstRecord: ProductionOpRecord } | null>(null);
  const [reworkListSearchOrder, setReworkListSearchOrder] = useState('');
  const [reworkListSearchProduct, setReworkListSearchProduct] = useState('');
  const [reworkListSearchNodeId, setReworkListSearchNodeId] = useState('');
  /** 待处理不良：当前点击「处理」的行，并弹出处理方式（报损/返工） */
  const [reworkActionRow, setReworkActionRow] = useState<{
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
  } | null>(null);
  /** 处理方式：报损 → 填数量+原因提交 SCRAP；返工 → 选工序+数量提交 REWORK */
  const [reworkActionMode, setReworkActionMode] = useState<'scrap' | 'rework' | null>(null);
  const [reworkActionQty, setReworkActionQty] = useState(0);
  const [reworkActionReason, setReworkActionReason] = useState('');
  /** 返工目标工序（多选） */
  const [reworkActionNodeIds, setReworkActionNodeIds] = useState<string[]>([]);
  /** 不良品处理：有颜色尺码时按规格录入数量（参考计划单生产明细） */
  const [reworkActionVariantQuantities, setReworkActionVariantQuantities] = useState<Record<string, number>>({});
  /** 返工管理：主工单及子工单 展开/收起 */
  const [reworkExpandedParents, setReworkExpandedParents] = useState<Set<string>>(new Set());
  /** 返工管理：物料弹窗（该工单 BOM 领料，确认后写入生产物料并在领料退料流水中备注「来自于返工」） */
  const [reworkMaterialOrderId, setReworkMaterialOrderId] = useState<string | null>(null);
  const [reworkMaterialQty, setReworkMaterialQty] = useState<Record<string, number>>({});
  const [reworkMaterialWarehouseId, setReworkMaterialWarehouseId] = useState<string>(() => warehouses[0]?.id ?? '');
  /** 返工报工弹窗：点击工序标签打开，当前工单 + 工序 */
  const [reworkReportModal, setReworkReportModal] = useState<{ order: ProductionOrder; nodeId: string; nodeName: string } | null>(null);
  /** 返工报工：按路径（及规格）录入的完成数量，key = pathKey 或 pathKey__variantId */
  const [reworkReportQuantities, setReworkReportQuantities] = useState<Record<string, number>>({});
  /** 返工报工：报工人员、设备（与工单中心报工一致） */
  const [reworkReportWorkerId, setReworkReportWorkerId] = useState('');
  const [reworkReportEquipmentId, setReworkReportEquipmentId] = useState('');
  /** 返工报工：单价（元/件） */
  const [reworkReportUnitPrice, setReworkReportUnitPrice] = useState<number>(0);

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
        const product = products.find(p => p.id === order.productId);
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
      rows.sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''));
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
      const product = products.find(p => p.id === productId);
      const parents = orders.filter(o => !o.parentOrderId && o.productId === productId);
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
        milestoneName: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId,
        defectiveTotal,
        reworkTotal,
        scrapTotal,
        pendingQty,
        productOrderCount: cnt,
        productOrdersLine,
        productOrdersTitle: parentNos.length ? productOrdersTitle : undefined
      });
    });
    rows.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
    return rows;
  }, [productionLinkMode, records, orders, products, productMilestoneProgresses, globalNodes]);

  /** 待处理不良：单号（含报工单号 BG…）、货号、工序 */
  const filteredReworkPendingRows = useMemo(() => {
    const orderKw = (reworkListSearchOrder || '').trim().toLowerCase();
    const productKw = (reworkListSearchProduct || '').trim().toLowerCase();
    return reworkPendingRows.filter(row => {
      if (orderKw) {
        const numOk = (row.orderNumber || '').toLowerCase().includes(orderKw);
        let docOk = false;
        if (row.scope === 'order') {
          const o = orders.find(x => x.id === row.orderId);
          const ms = o?.milestones?.find(m => m.templateId === row.nodeId);
          docOk = reworkReportsMatchDocSearch(ms?.reports, orderKw);
        } else {
          for (const p of productMilestoneProgresses) {
            if (p.productId !== row.productId || p.milestoneTemplateId !== row.nodeId) continue;
            if (reworkReportsMatchDocSearch(p.reports, orderKw)) {
              docOk = true;
              break;
            }
          }
          if (!docOk) {
            for (const o of orders) {
              if (o.productId !== row.productId) continue;
              const ms = o.milestones?.find(m => m.templateId === row.nodeId);
              if (reworkReportsMatchDocSearch(ms?.reports, orderKw)) {
                docOk = true;
                break;
              }
            }
          }
          if (!docOk) {
            docOk = orders.some(
              o => !o.parentOrderId && o.productId === row.productId && (o.orderNumber || '').toLowerCase().includes(orderKw)
            );
          }
        }
        if (!numOk && !docOk) return false;
      }
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (reworkListSearchNodeId && row.nodeId !== reworkListSearchNodeId) return false;
      return true;
    });
  }, [
    reworkPendingRows,
    reworkListSearchOrder,
    reworkListSearchProduct,
    reworkListSearchNodeId,
    products,
    orders,
    productMilestoneProgresses
  ]);

  /** 待处理不良列表：待返工多的优先，便于处理积压 */
  const displayReworkPendingRows = useMemo(() => {
    return [...filteredReworkPendingRows].sort((a, b) => {
      if (b.pendingQty !== a.pendingQty) return b.pendingQty - a.pendingQty;
      const aKey = a.scope === 'order' ? a.orderNumber : a.productName;
      const bKey = b.scope === 'order' ? b.orderNumber : b.productName;
      return (aKey || '').localeCompare(bKey || '', 'zh-CN');
    });
  }, [filteredReworkPendingRows]);

  const reworkPendingTotalPending = useMemo(
    () => displayReworkPendingRows.reduce((s, r) => s + r.pendingQty, 0),
    [displayReworkPendingRows]
  );

  /** 待处理不良：工序选项（当前列表中的工序去重） */
  const reworkPendingNodeOptions = useMemo(() => {
    const seen = new Set<string>();
    return reworkPendingRows.reduce<{ value: string; label: string }[]>((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, []);
  }, [reworkPendingRows]);

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
      return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    }
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const parentIdSetByProduct = new Map<string, Set<string>>();
    parentOrders.forEach(o => {
      if (!parentIdSetByProduct.has(o.productId)) parentIdSetByProduct.set(o.productId, new Set());
      parentIdSetByProduct.get(o.productId)!.add(o.id);
    });
    const byProduct = new Map<string, Map<string, { totalQty: number; completedQty: number; pendingSeq: number }>>();
    reworkRecords.forEach(r => {
      const pid = r.productId;
      if (!pid) return;
      const parents = parentIdSetByProduct.get(pid);
      if (!parents) return;
      if (r.orderId && !parents.has(r.orderId)) return;
      const byNode = byProduct.get(pid) ?? new Map();
      const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      const completed =
        r.status === '已完成' ||
        (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
      targetNodes.forEach(nodeId => {
        const cur = byNode.get(nodeId) ?? { totalQty: 0, completedQty: 0, pendingSeq: 0 };
        cur.totalQty += r.quantity;
        const doneAtNode =
          r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
        cur.completedQty += Math.min(r.quantity, doneAtNode);
        cur.pendingSeq += reworkRemainingAtNode(r, nodeId);
        byNode.set(nodeId, cur);
      });
      byProduct.set(pid, byNode);
    });
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    byProduct.forEach((byNode, pid) => {
      const product = products.find(p => p.id === pid);
      const seq = product?.milestoneNodeIds ?? [];
      let list = Array.from(byNode.entries())
        .filter(([, v]) => v.totalQty > 0)
        .map(([nodeId, v]) => ({
          nodeId,
          nodeName: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty
        }));
      if (seq.length) {
        list.sort((a, b) => {
          const ia = seq.indexOf(a.nodeId);
          const ib = seq.indexOf(b.nodeId);
          if (ia === -1 && ib === -1) return (a.nodeName || '').localeCompare(b.nodeName || '');
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
      } else {
        list.sort((a, b) => {
          const idxA = globalNodes.findIndex(n => n.id === a.nodeId);
          const idxB = globalNodes.findIndex(n => n.id === b.nodeId);
          return (idxA < 0 ? 999 : idxA) - (idxB < 0 ? 999 : idxB);
        });
      }
      if (list.length > 0) result.set(pid, list);
    });
    return result;
  }, [productionLinkMode, records, parentOrders, products, globalNodes, processSequenceMode]);

  /** 返工管理·关联工单：按单 + 目标工序聚合 */
  const reworkStatsByOrderId = useMemo(() => {
    if (productionLinkMode === 'product') {
      return new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    }
    const reworkRecords = records.filter(r => r.type === 'REWORK');
    const result = new Map<string, { nodeId: string; nodeName: string; totalQty: number; completedQty: number; pendingQty: number }[]>();
    orders.forEach(order => {
      const byNode = new Map<string, { totalQty: number; completedQty: number; pendingSeq: number }>();
      reworkRecords.forEach(r => {
        if (r.orderId !== order.id) return;
        const targetNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
        const completed =
          r.status === '已完成' ||
          (targetNodes.length > 0 && targetNodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) >= r.quantity));
        targetNodes.forEach(nodeId => {
          const cur = byNode.get(nodeId) ?? { totalQty: 0, completedQty: 0, pendingSeq: 0 };
          cur.totalQty += r.quantity;
          const doneAtNode =
            r.reworkCompletedQuantityByNode?.[nodeId] ?? ((r.completedNodeIds ?? []).includes(nodeId) || completed ? r.quantity : 0);
          cur.completedQty += Math.min(r.quantity, doneAtNode);
          cur.pendingSeq += reworkRemainingAtNode(r, nodeId);
          byNode.set(nodeId, cur);
        });
      });
      const list = Array.from(byNode.entries())
        .filter(([, v]) => v.totalQty > 0)
        .map(([nodeId, v]) => ({
          nodeId,
          nodeName: globalNodes.find(n => n.id === nodeId)?.name ?? nodeId,
          totalQty: v.totalQty,
          completedQty: v.completedQty,
          pendingQty: processSequenceMode === 'sequential' ? v.pendingSeq : v.totalQty - v.completedQty
        }))
        .sort((a, b) => {
          const idxA = globalNodes.findIndex(n => n.id === a.nodeId);
          const idxB = globalNodes.findIndex(n => n.id === b.nodeId);
          return (idxA < 0 ? 999 : idxA) - (idxB < 0 ? 999 : idxB);
        });
      if (list.length > 0) result.set(order.id, list);
    });
    return result;
  }, [productionLinkMode, records, orders, globalNodes, processSequenceMode]);

  /** 不良品处理：当前行的产品、分类、是否按颜色尺码录入 */
  const reworkActionProduct = useMemo(() => (reworkActionRow ? products.find(p => p.id === reworkActionRow.productId) : null), [reworkActionRow, products]);
  const reworkActionCategory = useMemo(() => (reworkActionProduct ? categories.find(c => c.id === reworkActionProduct.categoryId) : null), [reworkActionProduct, categories]);
  const reworkActionHasColorSize = Boolean(reworkActionCategory?.hasColorSize && reworkActionProduct?.variants && reworkActionProduct.variants.length > 0);
  /** 不良品处理：按规格的可处理数量 = 报工不良明细(variantId) − 已返工明细 − 已报损明细 */
  const reworkActionPendingByVariant = useMemo((): Record<string, number> => {
    if (!reworkActionRow) return {};
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
        .filter(
          r =>
            r.type === 'REWORK' &&
            r.productId === reworkActionRow.productId &&
            (r.sourceNodeId ?? r.nodeId) === reworkActionRow.nodeId
        )
        .forEach(r => {
          const vid = r.variantId ?? '';
          reworkByVariant[vid] = (reworkByVariant[vid] ?? 0) + r.quantity;
        });
    } else {
      records
        .filter(r => r.type === 'REWORK' && r.orderId === reworkActionRow.orderId && (r.sourceNodeId ?? r.nodeId) === reworkActionRow.nodeId)
        .forEach(r => {
          const vid = r.variantId ?? '';
          reworkByVariant[vid] = (reworkByVariant[vid] ?? 0) + r.quantity;
        });
    }
    const scrapByVariant: Record<string, number> = {};
    if (reworkActionRow.scope === 'product') {
      records
        .filter(r => r.type === 'SCRAP' && r.productId === reworkActionRow.productId && r.nodeId === reworkActionRow.nodeId)
        .forEach(r => {
          const vid = r.variantId ?? '';
          scrapByVariant[vid] = (scrapByVariant[vid] ?? 0) + r.quantity;
        });
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

  /** 不良品处理：规格数量汇总（用于校验与展示） */
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

  /** 返工报工弹窗：按路径分组的待返工数据；顺序模式下仅统计「上道已流入本道」的可报数，pathKey 保留路径顺序 */
  const reworkReportPaths = useMemo(() => {
    if (!reworkReportModal) return [];
    const { order, nodeId: currentNodeId } = reworkReportModal;
    const reworkList = records.filter(r => {
      if (r.type !== 'REWORK') return false;
      const orderOk = r.orderId === order.id;
      const productLegacy = !r.orderId && r.productId === order.productId;
      if (!orderOk && !productLegacy) return false;
      const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      if (!pathNodes.includes(currentNodeId)) return false;
      if (r.status === '已完成') return false;
      const remaining = reworkRemainingAtNode(r, currentNodeId);
      if (remaining <= 0) return false;
      return true;
    });
    const byPath = new Map<string, { records: ProductionOpRecord[]; pendingByVariant: Record<string, number> }>();
    reworkList.forEach(r => {
      const pathNodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
      const pathKey = pathNodes.join('|');
      const cur = byPath.get(pathKey) ?? { records: [], pendingByVariant: {} };
      cur.records.push(r);
      const remaining = reworkRemainingAtNode(r, currentNodeId);
      const vid = r.variantId ?? '';
      cur.pendingByVariant[vid] = (cur.pendingByVariant[vid] ?? 0) + remaining;
      byPath.set(pathKey, cur);
    });
    return Array.from(byPath.entries()).map(([pathKey, { records: recs, pendingByVariant }]) => {
      const nodeIds = pathKey.split('|').filter(Boolean);
      const pathLabel = nodeIds.length <= 1
        ? (globalNodes.find(n => n.id === nodeIds[0])?.name ?? nodeIds[0])
        : nodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、');
      const totalPending = Object.values(pendingByVariant).reduce((s, q) => s + q, 0);
      return { pathKey, pathLabel, nodeIds, records: recs, totalPending, pendingByVariant };
    }).filter(p => p.totalPending > 0);
  }, [reworkReportModal, records, globalNodes, processSequenceMode]);

  /** 返工报工：当前工单产品、是否按规格 */
  const reworkReportProduct = useMemo(() => reworkReportModal ? products.find(p => p.id === reworkReportModal.order.productId) : null, [reworkReportModal, products]);
  const reworkReportCategory = useMemo(() => reworkReportProduct ? categories.find(c => c.id === reworkReportProduct.categoryId) : null, [reworkReportProduct, categories]);
  const reworkReportHasColorSize = Boolean(reworkReportCategory?.hasColorSize && reworkReportProduct?.variants && reworkReportProduct.variants.length > 0);
  const reworkReportGroupedVariants = useMemo((): Record<string, ProductVariant[]> => {
    if (!reworkReportProduct?.variants?.length) return {};
    const groups: Record<string, ProductVariant[]> = {};
    reworkReportProduct.variants.forEach(v => {
      const c = v.colorId || 'none';
      if (!groups[c]) groups[c] = [];
      groups[c].push(v);
    });
    return groups;
  }, [reworkReportProduct?.variants]);

  /** 返工管理：工单模式=主/子分组；关联产品模式=仅按产品一条（工序汇总） */
  const reworkListBlocks = useMemo(() => {
    if (productionLinkMode === 'product') {
      return Array.from(reworkStatsByProductId.keys())
        .sort((a, b) =>
          (products.find(p => p.id === a)?.name || '').localeCompare(products.find(p => p.id === b)?.name || '', 'zh-CN')
        )
        .map(productId => ({ type: 'productAggregate' as const, productId }));
    }
    const reworkOrderIds = new Set(orders.filter(o => (reworkStatsByOrderId.get(o.id)?.length ?? 0) > 0).map(o => o.id));
    const parentHasRework = (parent: ProductionOrder) => {
      if (reworkOrderIds.has(parent.id)) return true;
      return getOrderFamilyIds(orders, parent.id).some(id => reworkOrderIds.has(id));
    };
    const children = (parentId: string) => orders.filter(o => o.parentOrderId === parentId);
    const blocks: ({ type: 'single'; order: ProductionOrder } | { type: 'parentChild'; parent: ProductionOrder; children: ProductionOrder[] })[] = [];
    const used = new Set<string>();
    parentOrders.forEach(order => {
      if (used.has(order.id)) return;
      const childList = children(order.id);
      if (childList.length > 0 && parentHasRework(order)) {
        used.add(order.id);
        getOrderFamilyIds(orders, order.id).forEach(id => used.add(id));
        blocks.push({ type: 'parentChild', parent: order, children: childList });
      } else if (reworkStatsByOrderId.has(order.id)) {
        used.add(order.id);
        blocks.push({ type: 'single', order });
      }
    });
    return blocks;
  }, [productionLinkMode, parentOrders, orders, reworkStatsByOrderId, reworkStatsByProductId, products]);

  /** 处理不良品流水单号（生成返工 REWORK + 报损 SCRAP 共用）：FL + 日期(yyyyMMdd) + 序号(4位)，使两条流水单号连续 */
  const getNextReworkDocNo = () => {
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `FL${todayStr}-`;
    const existing = records.filter(r => (r.type === 'REWORK' || r.type === 'SCRAP') && r.docNo && r.docNo.startsWith(pattern));
    const used = new Set(existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n) && n >= 1));
    let next = 1;
    while (used.has(next)) next++;
    return `FL${todayStr}-${String(next).padStart(4, '0')}`;
  };

  /** 返工报工流水单号（REWORK_REPORT）：FG + 日期(yyyyMMdd) + 序号(4位)；仅统计 REWORK_REPORT，使返工报工流水中单号连续 */
  const getNextReworkReportDocNo = () => {
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `FG${todayStr}-`;
    const existing = records.filter(r => r.type === 'REWORK_REPORT' && r.docNo && r.docNo.startsWith(pattern));
    const used = new Set(existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n) && n >= 1));
    let next = 1;
    while (used.has(next)) next++;
    return `FG${todayStr}-${String(next).padStart(4, '0')}`;
  };

  /** 返工单号展示：有 docNo 且符合 FG+8位日期+序号 则用 docNo；否则需由调用方传入同日内顺序号（见返工流水弹窗内 buildReworkDisplayDocNoMap） */
  const getReworkDisplayDocNo = (r: ProductionOpRecord, fallbackSeq?: number) => {
    if (r.docNo && /^FG\d{8}-\d{4}$/.test(r.docNo)) return r.docNo;
    const d = r.timestamp ? new Date(r.timestamp) : new Date();
    const dateStr = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0].replace(/-/g, '') : d.toISOString().split('T')[0].replace(/-/g, '');
    const seq = fallbackSeq != null ? fallbackSeq : 1;
    return `FG${dateStr}-${String(seq).padStart(4, '0')}`;
  };

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {hasOpsPerm(tenantRole, userPermissions, 'production:rework_defective:allow') && (
        <button
          type="button"
          onClick={() => setReworkPendingModalOpen(true)}
          className={outlineToolbarButtonClass}
        >
          <ClipboardList className="w-4 h-4 shrink-0" /> 待处理不良
        </button>
        )}
        {hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:view') && (
        <button
          type="button"
          onClick={() => { setDefectFlowModalOpen(true); setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }}
          className={outlineToolbarButtonClass}
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
            reworkListBlocks.map((block) => {
              const renderReworkCard = (order: ProductionOrder, isChild?: boolean, indentPx?: number) => {
                const product = products.find(p => p.id === order.productId);
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
                          <img src={product.imageUrl} alt={order.productName} className="w-full h-full object-cover block" />
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
                            {stats.map(({ nodeId, nodeName, totalQty, completedQty, pendingQty }) => {
                              const isAllDone = pendingQty <= 0;
                              return (
                                <button
                                  key={nodeId}
                                  type="button"
                                  title={`工序「${nodeName}」返工：总 ${totalQty}，已返工 ${completedQty}，${processSequenceMode === 'sequential' ? '可报 ' : '未返工 '}${pendingQty}${processSequenceMode === 'sequential' ? '（顺序模式：上道流入可报数）' : ''}（点击报工）`}
                                  onClick={() => { setReworkReportModal({ order, nodeId, nodeName }); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); }}
                                  className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border bg-slate-50 border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left cursor-pointer"
                                >
                                  <span className="text-[10px] font-bold text-indigo-600 mb-1 leading-tight truncate w-full text-center">{nodeName}</span>
                                  <div className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}>
                                    <span className="text-base font-black text-slate-900 leading-none">{pendingQty}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
                                    <span>{processSequenceMode === 'sequential' ? (pendingQty + completedQty) : totalQty} / <span className="text-slate-600">{completedQty}</span></span>
                                  </div>
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
                          onClick={() => { setReworkMaterialOrderId(order.id); setReworkMaterialQty({}); setReworkMaterialWarehouseId(warehouses[0]?.id ?? ''); }}
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
                const fp = products.find(p => p.id === block.productId);
                const stats = reworkStatsByProductId.get(block.productId) ?? [];
                const repOrder = parentOrders
                  .filter(o => o.productId === block.productId)
                  .sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || ''))[0];
                const totalQtyAll = parentOrders
                  .filter(o => o.productId === block.productId)
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
                          <img src={fp.imageUrl} alt={fp.name} className="w-full h-full object-cover block" />
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
                            {stats.map(({ nodeId, nodeName, totalQty, completedQty, pendingQty }) => {
                              const isAllDone = pendingQty <= 0;
                              return (
                                <button
                                  key={nodeId}
                                  type="button"
                                  title={`工序「${nodeName}」返工（全产品汇总）：总 ${totalQty}，已返工 ${completedQty}，${processSequenceMode === 'sequential' ? '可报 ' : '未返工 '}${pendingQty}（点击报工，以首单为载体）`}
                                  onClick={() => {
                                    setReworkReportModal({ order: repOrder, nodeId, nodeName });
                                    setReworkReportQuantities({});
                                    setReworkReportWorkerId('');
                                    setReworkReportEquipmentId('');
                                  }}
                                  className="flex flex-col items-center justify-center shrink-0 min-w-[88px] min-h-[118px] py-2.5 px-2 rounded-xl border bg-slate-50 border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left cursor-pointer"
                                >
                                  <span className="text-[10px] font-bold text-indigo-600 mb-1 leading-tight truncate w-full text-center">{nodeName}</span>
                                  <div
                                    className={`w-12 h-12 rounded-full border-2 bg-white flex items-center justify-center mb-1 shrink-0 ${isAllDone ? 'border-emerald-400' : 'border-indigo-300'}`}
                                  >
                                    <span className="text-base font-black text-slate-900 leading-none">{pendingQty}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 leading-tight">
                                    <span>
                                      {processSequenceMode === 'sequential' ? pendingQty + completedQty : totalQty} /{' '}
                                      <span className="text-slate-600">{completedQty}</span>
                                    </span>
                                  </div>
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
                          onClick={() => { setReworkMaterialOrderId(repOrder.id); setReworkMaterialQty({}); setReworkMaterialWarehouseId(warehouses[0]?.id ?? ''); }}
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
              const allWithDepth = getOrderFamilyWithDepth(orders, parent.id);
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
            })
          )}
        </div>
      )}

      {/* ══════════════ MODALS ══════════════ */}

      {/* 待处理不良弹窗 */}
      {reworkPendingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setReworkPendingModalOpen(false)} aria-hidden />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" /> 待处理不良</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed hidden sm:block">
                  {productionLinkMode === 'product'
                    ? '合并产品工序与各工单报工不良；单号支持工单号或报工单号 BG…。列表按「待返工」从高到低排列。'
                    : '扣除已返工/报损后的待处理数量；单号支持工单号或报工单号。按待返工数量优先显示。'}
                </p>
              </div>
              <button type="button" onClick={() => setReworkPendingModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 shrink-0"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:flex-initial sm:min-w-[180px]">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">单号</label>
                  <input
                    type="text"
                    value={reworkListSearchOrder}
                    onChange={e => setReworkListSearchOrder(e.target.value)}
                    placeholder="工单号 / BG报工单号"
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[120px] flex-1 sm:flex-initial sm:min-w-[160px]">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">产品</label>
                  <input
                    type="text"
                    value={reworkListSearchProduct}
                    onChange={e => setReworkListSearchProduct(e.target.value)}
                    placeholder="名称 / SKU"
                    className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">工序</label>
                  <select
                    value={reworkListSearchNodeId}
                    onChange={e => setReworkListSearchNodeId(e.target.value)}
                    className="rounded-xl border border-slate-200 py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[120px]"
                  >
                    <option value="">全部工序</option>
                    {reworkPendingNodeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className={`w-full text-left border-collapse ${productionLinkMode === 'product' ? 'min-w-[720px]' : 'min-w-[880px]'}`}>
                <thead>
                  <tr className="bg-slate-100/95 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                    {productionLinkMode !== 'product' && (
                      <th className="px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-[22%]">工单号</th>
                    )}
                    <th className={`px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider ${productionLinkMode === 'product' ? 'w-[30%]' : 'w-[24%]'}`}>产品</th>
                    <th className="px-4 sm:px-5 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-[14%]">工序</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">不良</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">已返工</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap w-[9%]">已报损</th>
                    <th className="px-3 py-3 text-right text-[10px] font-black text-amber-700 uppercase tracking-wider whitespace-nowrap w-[10%]">待返工</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase tracking-wider w-[11%]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReworkPendingRows.length === 0 ? (
                    <tr>
                      <td colSpan={productionLinkMode === 'product' ? 7 : 8} className="px-6 py-16 text-center text-slate-400 text-sm">
                        {reworkPendingRows.length === 0
                          ? '暂无待处理不良。请先在工单中心报工中登记不良品数量。'
                          : '无匹配项，可尝试报工单号（BG…）或清空筛选。'}
                      </td>
                    </tr>
                  ) : (
                    displayReworkPendingRows.map((row, idx) => {
                      const p = products.find(pr => pr.id === row.productId);
                      return (
                        <tr
                          key={row.scope === 'product' ? `p-${row.productId}|${row.nodeId}` : `${row.orderId}|${row.nodeId}`}
                          className={`border-b border-slate-100/80 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-indigo-50/40`}
                        >
                          {productionLinkMode !== 'product' && (
                            <td className="px-4 sm:px-5 py-3 align-top min-w-0">
                              {row.scope === 'product' && row.productOrderCount != null ? (
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 shrink-0">按产品</span>
                                    <span className="text-sm font-bold text-slate-800 tabular-nums">{row.productOrderCount} 条工单</span>
                                  </div>
                                  {row.productOrdersLine ? (
                                    <p
                                      className="text-[11px] text-slate-500 mt-1.5 leading-snug line-clamp-2 break-all"
                                      title={row.productOrdersTitle || row.productOrdersLine}
                                    >
                                      {row.productOrdersLine}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-sm font-bold text-slate-800 tabular-nums" title={row.orderNumber}>{row.orderNumber}</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 sm:px-5 py-3 align-top min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2" title={row.productName}>{row.productName}</p>
                            {p?.sku ? <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate" title={p.sku}>{p.sku}</p> : null}
                          </td>
                          <td className="px-4 sm:px-5 py-3 align-middle">
                            <span className="inline-flex items-center text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg max-w-full truncate" title={row.milestoneName}>
                              {row.milestoneName}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-bold text-slate-600">{row.defectiveTotal}</td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-semibold text-slate-500">{row.reworkTotal}</td>
                          <td className="px-3 py-3 text-right align-middle tabular-nums text-sm font-semibold text-slate-500">{row.scrapTotal}</td>
                          <td className="px-3 py-3 text-right align-middle">
                            <span className="inline-block min-w-[2rem] tabular-nums text-sm font-black text-amber-800 bg-amber-100/90 px-2 py-1 rounded-lg">{row.pendingQty}</span>
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <button
                              type="button"
                              onClick={() => setReworkActionRow(row)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                              处理
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {displayReworkPendingRows.length > 0 && (
              <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <span className="text-xs font-bold text-slate-600">
                  当前列表 <span className="text-slate-900 tabular-nums">{displayReworkPendingRows.length}</span> 条
                </span>
                <span className="text-xs font-bold text-slate-600">
                  待返工合计 <span className="text-base font-black text-amber-700 tabular-nums">{reworkPendingTotalPending}</span> 件
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 返工详情弹窗 */}
      {reworkDetailOrderId && (() => {
        const mainOrder = orders.find(o => o.id === reworkDetailOrderId);
        if (!mainOrder) return null;
        const childOrders = orders.filter(o => o.parentOrderId === reworkDetailOrderId);
        const orderIds = [reworkDetailOrderId, ...childOrders.map(o => o.id)];
        const product = products.find(p => p.id === mainOrder.productId);
        const orderTotalQty = mainOrder.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
        const defectByNode = new Map<string, { name: string; defective: number; rework: number; scrap: number; pending: number }>();
        orderIds.forEach(oid => {
          const order = orders.find(o => o.id === oid);
          if (!order) return;
          order.milestones.forEach(ms => {
            const defective = (ms.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
            const rework = (records || []).filter(r => r.type === 'REWORK' && r.orderId === oid && (r.sourceNodeId ?? r.nodeId) === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
            const scrap = (records || []).filter(r => r.type === 'SCRAP' && r.orderId === oid && r.nodeId === ms.templateId).reduce((s, r) => s + (r.quantity ?? 0), 0);
            const pending = Math.max(0, defective - rework - scrap);
            if (defective <= 0 && rework <= 0 && scrap <= 0) return;
            const name = globalNodes.find(n => n.id === ms.templateId)?.name ?? ms.templateId;
            const cur = defectByNode.get(ms.templateId) ?? { name, defective: 0, rework: 0, scrap: 0, pending: 0 };
            cur.defective += defective; cur.rework += rework; cur.scrap += scrap; cur.pending += pending;
            defectByNode.set(ms.templateId, cur);
          });
        });
        const defectRows = Array.from(defectByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const reworkStatsByNode = new Map<string, { name: string; totalQty: number; completedQty: number; pendingQty: number }>();
        orderIds.forEach(oid => {
          const stats = reworkStatsByOrderId.get(oid) ?? [];
          stats.forEach(s => {
            const cur = reworkStatsByNode.get(s.nodeId) ?? { name: s.nodeName, totalQty: 0, completedQty: 0, pendingQty: 0 };
            cur.totalQty += s.totalQty; cur.completedQty += s.completedQty; cur.pendingQty += s.pendingQty;
            reworkStatsByNode.set(s.nodeId, cur);
          });
        });
        const reworkStatRows = Array.from(reworkStatsByNode.entries()).map(([nodeId, v]) => ({ nodeId, ...v })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const defectRecordsList = (records || []).filter((r): r is ProductionOpRecord => (r.type === 'REWORK' || r.type === 'SCRAP') && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const reworkReportList = (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT' && orderIds.includes(r.orderId ?? '')).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const getSourceNodeName = (rec: ProductionOpRecord) => { const sid = rec.type === 'REWORK' ? (rec.sourceNodeId ?? rec.nodeId) : rec.nodeId; return sid ? (globalNodes.find(n => n.id === sid)?.name ?? sid) : '—'; };
        const getReworkTargetNodes = (rec: ProductionOpRecord) => (rec.reworkNodeIds?.length ? rec.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、') : (rec.nodeId ? (globalNodes.find(n => n.id === rec.nodeId)?.name ?? rec.nodeId) : '—'));
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setReworkDetailOrderId(null)} aria-hidden />
            <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{mainOrder.orderNumber}</span>
                  返工详情
                </h3>
                <p className="text-xs text-slate-500 mt-1">本页仅展示该工单的返工与不良处理情况</p>
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                  <span className="font-bold text-slate-800">{mainOrder.productName ?? product?.name ?? '—'}</span>
                  <span className="text-slate-500">总数量 {orderTotalQty} 件</span>
                  {mainOrder.customer && <span className="text-slate-500">客户 {mainOrder.customer}</span>}
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {defectRows.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">不良与处理汇总（按来源工序）</h4>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工不良</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已生成返工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报损</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">待处理</th></tr></thead>
                        <tbody>
                          {defectRows.map(row => (
                            <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.defective}</td><td className="px-4 py-3 text-right text-slate-600">{row.rework}</td><td className="px-4 py-3 text-right text-slate-600">{row.scrap}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pending}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {reworkStatRows.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">工序返工未报工</h4>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">返工总量</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">已报工</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">未报工</th></tr></thead>
                        <tbody>
                          {reworkStatRows.map(row => (
                            <tr key={row.nodeId} className="border-b border-slate-100"><td className="px-4 py-3 font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 text-right text-slate-600">{row.totalQty}</td><td className="px-4 py-3 text-right text-emerald-600">{row.completedQty}</td><td className="px-4 py-3 text-right font-bold text-amber-600">{row.pendingQty}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">处理不良品记录（生成返工 + 报损）</h4>
                  {defectRecordsList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">类型</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">来源工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">返工目标工序</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                        <tbody>
                          {defectRecordsList.map(r => (
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3"><span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{r.type === 'REWORK' ? '返工' : '报损'}</span></td><td className="px-4 py-3 text-slate-700">{getSourceNodeName(r)}</td><td className="px-4 py-3 text-right font-bold text-slate-800">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.type === 'REWORK' ? getReworkTargetNodes(r) : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{r.timestamp || '—'}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">返工报工记录</h4>
                  {reworkReportList.length === 0 ? <p className="text-slate-400 text-sm py-4">暂无记录</p> : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">工序</th><th className="px-4 py-3 text-right text-[10px] font-black text-slate-500 uppercase">报工数量</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">时间</th><th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase">操作人</th></tr></thead>
                        <tbody>
                          {reworkReportList.map(r => (
                            <tr key={r.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-700 font-mono text-xs">{r.docNo ?? '—'}</td><td className="px-4 py-3 text-slate-700">{globalNodes.find(n => n.id === r.nodeId)?.name ?? r.nodeId ?? '—'}</td><td className="px-4 py-3 text-right font-bold text-indigo-600">{r.quantity ?? 0}</td><td className="px-4 py-3 text-slate-600">{r.variantId ? (product?.variants?.find(v => v.id === r.variantId) as { skuSuffix?: string } | undefined)?.skuSuffix ?? r.variantId : '—'}</td><td className="px-4 py-3 text-slate-500 text-xs">{r.timestamp || '—'}</td><td className="px-4 py-3 text-slate-600">{r.operator ?? '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end">
                <button type="button" onClick={() => setReworkDetailOrderId(null)} className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">关闭</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* 返工管理：物料弹窗 */}
      {reworkMaterialOrderId && onAddRecord && (() => {
        const order = orders.find(o => o.id === reworkMaterialOrderId);
        if (!order) return null;
        const product = products.find(p => p.id === order.productId);
        const orderQty = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
        const bomMaterials: { productId: string; name: string; sku: string; unitNeeded: number; nodeNames: string[] }[] = [];
        const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
        const addMat = (bom: BOM, qty: number, nodeName: string) => {
          bom.items.forEach(bi => {
            const mp = products.find(px => px.id === bi.productId);
            const add = Number(bi.quantity) * qty;
            const existing = matMap.get(bi.productId);
            if (existing) { existing.unitNeeded += add; if (nodeName) existing.nodeNames.add(nodeName); }
            else { const ns = new Set<string>(); if (nodeName) ns.add(nodeName); matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns }); }
          });
        };
        const variants = product?.variants ?? [];
        if (variants.length > 0) {
          (order.items ?? []).forEach(item => {
            const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
            const lineQty = item.quantity;
            const seenBomIds = new Set<string>();
            if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              Object.entries(v.nodeBoms).forEach(([nodeId, bomIdRaw]) => {
                const bomId = bomIdRaw as string;
                if (seenBomIds.has(bomId)) return; seenBomIds.add(bomId);
                const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
                const bom = boms.find(b => b.id === bomId);
                if (bom) addMat(bom, lineQty, nodeName);
              });
            } else {
              boms.filter(b => b.parentProductId === product!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                if (seenBomIds.has(bom.id)) return; seenBomIds.add(bom.id);
                const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
                addMat(bom, lineQty, nodeName);
              });
            }
          });
        }
        if (matMap.size === 0 && product) {
          const seenBomIds = new Set<string>();
          boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
            if (seenBomIds.has(bom.id)) return; seenBomIds.add(bom.id);
            const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
            const qty = bom.variantId ? ((order.items ?? []).find(i => i.variantId === bom.variantId)?.quantity ?? 0) : orderQty;
            addMat(bom, qty, nodeName);
          });
        }
        matMap.forEach((v, productId) => { bomMaterials.push({ productId, ...v, nodeNames: Array.from(v.nodeNames) }); });
        const getNextStockDocNoLocal = () => {
          const prefix = 'LL';
          const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
          const pattern = `${prefix}${todayStr}-`;
          const existing = records.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
          const seqs = existing.map(r => parseInt((r.docNo ?? '').slice(pattern.length), 10)).filter(n => !isNaN(n));
          const maxSeq = seqs.length ? Math.max(...seqs) : 0;
          return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
        };
        const handleConfirm = async () => {
          const toIssue = bomMaterials.filter(m => (reworkMaterialQty[m.productId] ?? 0) > 0);
          if (toIssue.length === 0) return;
          const docNo = getNextStockDocNoLocal();
          const warehouseId = reworkMaterialWarehouseId || (warehouses[0]?.id ?? '');
          const batch: ProductionOpRecord[] = toIssue.map(m => ({
            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'STOCK_OUT' as const, orderId: order.id, productId: m.productId,
            quantity: reworkMaterialQty[m.productId], operator: '张主管',
            timestamp: new Date().toLocaleString(), status: '已完成',
            warehouseId: warehouseId || undefined, docNo, reason: '来自于返工'
          } as ProductionOpRecord));
          if (onAddRecordBatch && batch.length > 1) { await onAddRecordBatch(batch); }
          else { for (const rec of batch) await onAddRecord(rec); }
          setReworkMaterialOrderId(null); setReworkMaterialQty({});
        };
        return (
          <div className="fixed inset-0 z-[76] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setReworkMaterialOrderId(null); setReworkMaterialQty({}); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Package className="w-5 h-5 text-indigo-600" /> 返工领料</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {product?.name ?? order.productName}</p>
                </div>
                <button type="button" onClick={() => { setReworkMaterialOrderId(null); setReworkMaterialQty({}); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {warehouses.length > 0 && (
                  <div className="mb-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                    <select value={reworkMaterialWarehouseId} onChange={e => setReworkMaterialWarehouseId(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                      {warehouses.map(w => (<option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>))}
                    </select>
                  </div>
                )}
                {bomMaterials.length === 0 ? (
                  <p className="py-8 text-center text-slate-400 text-sm">该工单未配置 BOM 物料，无法进行领料</p>
                ) : (
                  (() => {
                    const reworkIssuedMap = new Map<string, number>();
                    records.filter(r => r.type === 'STOCK_OUT' && r.orderId === order.id && r.reason === '来自于返工').forEach(r => { reworkIssuedMap.set(r.productId, (reworkIssuedMap.get(r.productId) ?? 0) + r.quantity); });
                    return (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-100">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">领料累计</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料数量</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {bomMaterials.map(m => (
                            <tr key={m.productId} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-slate-800">{m.name}</p>
                                  {m.nodeNames.map(nn => (<span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>))}
                                </div>
                                {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{reworkIssuedMap.get(m.productId) ?? 0}</td>
                              <td className="px-4 py-3">
                                <input type="number" min={0} step={1} value={reworkMaterialQty[m.productId] ?? ''} onChange={e => setReworkMaterialQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()
                )}
              </div>
              {bomMaterials.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                  <button type="button" onClick={() => { setReworkMaterialOrderId(null); setReworkMaterialQty({}); }} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
                  <button type="button" onClick={handleConfirm} disabled={!bomMaterials.some(m => (reworkMaterialQty[m.productId] ?? 0) > 0)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    <ArrowUpFromLine className="w-4 h-4" /> 确认领料
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* 处理不良品流水弹窗 */}
      {defectFlowModalOpen && (() => {
        const defectRecords = (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK' || r.type === 'SCRAP');
        const f = defectFlowFilter;
        const filtered = defectRecords.filter(r => {
          const order = orders.find(o => o.id === r.orderId);
          const product = products.find(p => p.id === r.productId);
          const sourceNodeId = r.type === 'REWORK' ? (r.sourceNodeId ?? r.nodeId) : r.nodeId;
          const nodeName = sourceNodeId ? (globalNodes.find(n => n.id === sourceNodeId)?.name ?? '') : '';
          if (f.dateFrom || f.dateTo) { const dateStr = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : ''; if (f.dateFrom && dateStr < f.dateFrom) return false; if (f.dateTo && dateStr > f.dateTo) return false; }
          if (f.orderNumber && !(order?.orderNumber ?? '').toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
          if (f.productId) { const name = (product?.name ?? '').toLowerCase(); const kw = f.productId.toLowerCase(); if (!name.includes(kw) && !(r.productId ?? '').toLowerCase().includes(kw)) return false; }
          if (f.nodeName && !nodeName.toLowerCase().includes(f.nodeName.toLowerCase())) return false;
          if (f.operator && !(r.operator ?? '').toLowerCase().includes(f.operator.toLowerCase())) return false;
          if (f.recordType === 'REWORK' && r.type !== 'REWORK') return false;
          if (f.recordType === 'SCRAP' && r.type !== 'SCRAP') return false;
          return true;
        });
        const sorted = [...filtered].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const totalQuantity = sorted.reduce((s, r) => s + (r.quantity ?? 0), 0);
        const uniqueNodeNames = [...new Set(defectRecords.map(r => { const sid = r.type === 'REWORK' ? (r.sourceNodeId ?? r.nodeId) : r.nodeId; return sid ? (globalNodes.find(n => n.id === sid)?.name ?? '') : ''; }).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string)) as string[];
        const uniqueOperators = [...new Set(defectRecords.map(r => r.operator).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
        const getSourceNodeName = (rec: ProductionOpRecord) => { const sid = rec.type === 'REWORK' ? (rec.sourceNodeId ?? rec.nodeId) : rec.nodeId; return sid ? (globalNodes.find(n => n.id === sid)?.name ?? sid) : '—'; };
        const getDocNo = (rec: ProductionOpRecord) => (rec.docNo) ? rec.docNo : '—';
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setDefectFlowModalOpen(false); setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 处理不良品流水</h3>
                <button type="button" onClick={() => { setDefectFlowModalOpen(false); setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0"><p className="text-xs text-slate-500">生成返工、报损等处理不良品的记录。按时间倒序。</p></div>
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-2 mb-3"><Filter className="w-4 h-4 text-slate-500" /><span className="text-xs font-bold text-slate-500 uppercase">筛选</span></div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${productionLinkMode === 'product' ? 'md:grid-cols-7' : 'md:grid-cols-8'}`}>
                  <div><label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label><input type="date" value={f.dateFrom} onChange={e => setDefectFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
                  <div><label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label><input type="date" value={f.dateTo} onChange={e => setDefectFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
                  {productionLinkMode !== 'product' && (<div><label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label><input type="text" value={f.orderNumber} onChange={e => setDefectFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>)}
                  <div><label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label><input type="text" value={f.productId} onChange={e => setDefectFlowFilter(prev => ({ ...prev, productId: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
                  <div><label className="text-[10px] font-bold text-slate-400 block mb-1">来源工序</label><select value={f.nodeName} onChange={e => setDefectFlowFilter(prev => ({ ...prev, nodeName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"><option value="">全部</option>{uniqueNodeNames.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                  <div><label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label><select value={f.recordType} onChange={e => setDefectFlowFilter(prev => ({ ...prev, recordType: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"><option value="">全部</option><option value="REWORK">返工</option><option value="SCRAP">报损</option></select></div>
                  <div><label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label><input type="text" value={f.operator} onChange={e => setDefectFlowFilter(prev => ({ ...prev, operator: e.target.value }))} placeholder="操作人模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" /></div>
                </div>
                <div className="mt-2 flex items-center gap-4">
                  <button type="button" onClick={() => setDefectFlowFilter({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', recordType: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                  <span className="text-xs text-slate-400">共 {sorted.length} 条记录</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {sorted.length === 0 ? (<p className="text-slate-500 text-center py-12">暂无处理不良品流水</p>) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                        {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">来源工序</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                      </tr></thead>
                      <tbody>
                        {sorted.map(r => {
                          const order = orders.find(o => o.id === r.orderId);
                          const product = products.find(p => p.id === r.productId);
                          const typeLabel = r.type === 'REWORK' ? '返工' : '报损';
                          return (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.timestamp || '—'}</td>
                              {productionLinkMode !== 'product' && <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{order?.orderNumber ?? '—'}</td>}
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getDocNo(r)}</td>
                              <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{product?.name ?? r.productId ?? '—'}</td>
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{getSourceNodeName(r)}</td>
                              <td className="px-4 py-3 whitespace-nowrap"><span className={r.type === 'REWORK' ? 'text-indigo-600 font-bold' : 'text-rose-600 font-bold'}>{typeLabel}</span></td>
                              <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">{r.quantity ?? 0} 件</td>
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.operator || '—'}</td>
                              <td className="px-4 py-3">
                                {hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:view') && (
                                  <button type="button" onClick={() => setDefectFlowDetailRecord(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"><FileText className="w-3.5 h-3.5" /> 详情</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                          <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 5 : 6}></td>
                          <td className="px-4 py-3 text-indigo-600 text-right">{totalQuantity} 件</td>
                          <td className="px-4 py-3" colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 处理不良品流水 - 详情弹窗 */}
      {defectFlowDetailRecord && (() => {
        const r = defectFlowDetailRecord;
        const detailBatch = r.type === 'REWORK' && r.docNo
          ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'REWORK' && x.orderId === r.orderId && x.docNo === r.docNo)
          : r.type === 'SCRAP' && r.docNo
            ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'SCRAP' && x.orderId === r.orderId && x.docNo === r.docNo)
            : [r];
        const first = detailBatch[0];
        if (!first) return null;
        const order = orders.find(o => o.id === first.orderId);
        const product = products.find(p => p.id === first.productId);
        const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
        const sourceNodeId = first.type === 'REWORK' ? (first.sourceNodeId ?? first.nodeId) : first.nodeId;
        const sourceNodeName = sourceNodeId ? globalNodes.find(n => n.id === sourceNodeId)?.name ?? sourceNodeId : '—';
        const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
        const hasColorSize = Boolean(product?.variants?.length);
        const getVariantLabel = (rec: ProductionOpRecord) => { if (!rec.variantId) return '未分规格'; const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId); return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId; };
        const typeLabel = first.type === 'REWORK' ? '返工' : '报损';
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  {productionLinkMode === 'product'
                    ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
                    : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
                  }
                  处理不良品详情
                </h3>
                <div className="flex items-center gap-2">
                  {defectFlowDetailEditing ? (
                    <>
                      <button type="button" onClick={() => setDefectFlowDetailEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button type="button" onClick={() => {
                        if (!onUpdateRecord || !defectFlowDetailEditing) return;
                        const tsStr = defectFlowDetailEditing.form.timestamp ? (() => { const d = new Date(defectFlowDetailEditing.form.timestamp); return isNaN(d.getTime()) ? new Date().toLocaleString() : d.toLocaleString(); })() : new Date().toLocaleString();
                        defectFlowDetailEditing.form.rowEdits.forEach(row => { const rec = detailBatch.find(x => x.id === row.recordId); if (!rec) return; onUpdateRecord({ ...rec, quantity: Math.max(0, row.quantity), timestamp: tsStr, operator: defectFlowDetailEditing.form.operator, reason: defectFlowDetailEditing.form.reason || undefined }); });
                        setDefectFlowDetailEditing(null); setDefectFlowDetailRecord(null);
                      }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"><Check className="w-4 h-4" /> 保存</button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:edit') && (
                        <button type="button" onClick={() => { const rec = detailBatch[0]; let dt = new Date(rec.timestamp || undefined); if (isNaN(dt.getTime())) dt = new Date(); const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`; setDefectFlowDetailEditing({ firstRecord: rec, form: { timestamp: tsStr, operator: rec.operator ?? '', reason: rec.reason ?? '', rowEdits: detailBatch.map(x => ({ recordId: x.id, quantity: x.quantity ?? 0 })) } }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"><Pencil className="w-4 h-4" /> 编辑</button>
                      )}
                      {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:delete') && (
                        <button type="button" onClick={() => { void confirm({ message: '确定删除该记录？', danger: true }).then((ok) => { if (!ok) return; detailBatch.forEach(x => onDeleteRecord(x.id)); setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100"><Trash2 className="w-4 h-4" /> 删除</button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setDefectFlowDetailRecord(null); setDefectFlowDetailEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{product?.name ?? first.productId ?? '—'}</h2>
                {defectFlowDetailEditing ? (
                  <>
                    <div className="grid grid-cols-[1fr_1fr] gap-3">
                      <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">时间</p><input type="datetime-local" value={defectFlowDetailEditing.form.timestamp} onChange={e => setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" /></div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p><input type="text" value={defectFlowDetailEditing.form.operator} onChange={e => setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" placeholder="操作人" /></div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">原因/备注</p><input type="text" value={defectFlowDetailEditing.form.reason} onChange={e => setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" placeholder="选填" /></div>
                    </div>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                        <tbody>
                          {defectFlowDetailEditing.form.rowEdits.map((rowEdit) => { const rec = detailBatch.find(x => x.id === rowEdit.recordId); if (!rec) return null; return (
                            <tr key={rec.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td><td className="px-4 py-3 text-right"><input type="number" min={0} value={rowEdit.quantity} onChange={e => { const v = Math.max(0, Number(e.target.value) || 0); setDefectFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(re => re.recordId === rec.id ? { ...re, quantity: v } : re) } } : prev); }} className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200" /><span className="text-slate-600 text-sm ml-1">{unitName}</span></td></tr>
                          ); })}
                        </tbody>
                        <tfoot><tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold"><td className="px-4 py-3">合计</td><td className="px-4 py-3 text-indigo-600 text-right">{defectFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}</td></tr></tfoot>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">类型</p><p className="text-sm font-bold text-slate-800">{typeLabel}</p></div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">来源工序</p><p className="text-sm font-bold text-slate-800">{sourceNodeName}</p></div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">数量</p><p className="text-sm font-bold text-indigo-600">{totalQty} {unitName}</p></div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">时间</p><p className="text-sm font-bold text-slate-800">{first.timestamp || '—'}</p></div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p><p className="text-sm font-bold text-slate-800">{first.operator ?? '—'}</p></div>
                      {first.reason && (<div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">原因/备注</p><p className="text-sm font-bold text-slate-800">{first.reason}</p></div>)}
                    </div>
                    {(detailBatch.length > 1 || hasColorSize) && (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                          <tbody>{detailBatch.map(rec => (<tr key={rec.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td><td className="px-4 py-3 font-bold text-indigo-600 text-right">{rec.quantity ?? 0} {unitName}</td></tr>))}</tbody>
                          <tfoot><tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold"><td className="px-4 py-3">合计</td><td className="px-4 py-3 text-indigo-600 text-right">{totalQty} {unitName}</td></tr></tfoot>
                        </table>
                      </div>
                    )}
                    {first.type === 'REWORK' && (first.reworkNodeIds?.length ?? 0) > 0 && (
                      <div className="text-sm"><span className="text-slate-400 font-bold">返工目标工序</span><p className="text-slate-800 mt-1">{first.reworkNodeIds!.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p></div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}


      {reworkFlowModalOpen && (() => {
        /** 返工报工流水仅显示「返工报工」产生的流水（每报一次一条），不显示「生成返工」的单据，避免同一次报工出现两条 */
        const reworkRecords = (records || []).filter((r): r is ProductionOpRecord => r.type === 'REWORK_REPORT');
        const validDocNoRe = /^FG\d{8}-\d{4}$/;
        const getDateStr = (r: ProductionOpRecord) => {
          const d = r.timestamp ? new Date(r.timestamp) : new Date();
          return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0].replace(/-/g, '') : d.toISOString().split('T')[0].replace(/-/g, '');
        };
        const needFallback = reworkRecords.filter(r => !r.docNo || !validDocNoRe.test(r.docNo));
        const needFallbackSorted = [...needFallback].sort((a, b) => {
          const da = getDateStr(a), db = getDateStr(b);
          if (da !== db) return da.localeCompare(db);
          const ta = new Date(a.timestamp || 0).getTime(), tb = new Date(b.timestamp || 0).getTime();
          if (ta !== tb) return ta - tb;
          return (a.id || '').localeCompare(b.id || '');
        });
        const reworkDisplayDocNoMap = new Map<string, string>();
        const seqByDate: Record<string, number> = {};
        needFallbackSorted.forEach(r => {
          const ds = getDateStr(r);
          seqByDate[ds] = (seqByDate[ds] ?? 0) + 1;
          reworkDisplayDocNoMap.set(r.id, `FG${ds}-${String(seqByDate[ds]).padStart(4, '0')}`);
        });
        const getDisplayDocNo = (r: ProductionOpRecord) =>
          (r.docNo && validDocNoRe.test(r.docNo)) ? r.docNo : (reworkDisplayDocNoMap.get(r.id) ?? getReworkDisplayDocNo(r, 1));
        const f = reworkFlowFilter;
        const filtered = reworkRecords.filter(r => {
          const order = orders.find(o => o.id === r.orderId);
          const product = products.find(p => p.id === r.productId);
          const nodeName = r.nodeId ? (globalNodes.find(n => n.id === r.nodeId)?.name ?? '') : '';
          if (f.dateFrom || f.dateTo) {
            const dateStr = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
            if (f.dateFrom && dateStr < f.dateFrom) return false;
            if (f.dateTo && dateStr > f.dateTo) return false;
          }
          if (f.orderNumber && !(order?.orderNumber ?? '').toLowerCase().includes(f.orderNumber.toLowerCase())) return false;
          if (f.productId) {
            const name = (product?.name ?? '').toLowerCase();
            const kw = f.productId.toLowerCase();
            if (!name.includes(kw) && !(r.productId ?? '').toLowerCase().includes(kw)) return false;
          }
          if (f.nodeName && !nodeName.toLowerCase().includes(f.nodeName.toLowerCase())) return false;
          if (f.operator && !(r.operator ?? '').toLowerCase().includes(f.operator.toLowerCase())) return false;
          if (f.reportNo) {
            const key = getDisplayDocNo(r).toLowerCase();
            if (!key.includes(f.reportNo.toLowerCase())) return false;
          }
          return true;
        });
        const sorted = [...filtered].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        const totalQuantity = sorted.reduce((s, r) => s + (r.quantity ?? 0), 0);
        const totalAmount = sorted.reduce((s, r) => s + (r.amount ?? 0), 0);
        const hasAnyPrice = sorted.some(r => r.unitPrice != null && r.unitPrice > 0);
        const uniqueNodeNames = [...new Set(reworkRecords.map(r => globalNodes.find(n => n.id === r.nodeId)?.name).filter(Boolean))] as string[];
        const uniqueOperators = [...new Set(reworkRecords.map(r => r.operator).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
        const displayReportNo = getDisplayDocNo;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setReworkFlowModalOpen(false); setReworkFlowDetailRecord(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-600" /> 返工报工流水</h3>
                <button type="button" onClick={() => { setReworkFlowModalOpen(false); setReworkFlowDetailRecord(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <p className="text-xs text-slate-500">仅显示每次在工序上做返工报工产生的流水，报一次产生一条（新单据号）。按报工时间排序。</p>
              </div>
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
                </div>
                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${productionLinkMode === 'product' ? 'md:grid-cols-6' : 'md:grid-cols-7'}`}>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                    <input type="date" value={f.dateFrom} onChange={e => setReworkFlowFilter(prev => ({ ...prev, dateFrom: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                    <input type="date" value={f.dateTo} onChange={e => setReworkFlowFilter(prev => ({ ...prev, dateTo: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  {productionLinkMode !== 'product' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
                    <input type="text" value={f.orderNumber} onChange={e => setReworkFlowFilter(prev => ({ ...prev, orderNumber: e.target.value }))} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
                    <input type="text" value={f.productId} onChange={e => setReworkFlowFilter(prev => ({ ...prev, productId: e.target.value }))} placeholder="产品名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
                    <select value={f.nodeName} onChange={e => setReworkFlowFilter(prev => ({ ...prev, nodeName: e.target.value }))} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200">
                      <option value="">全部</option>
                      {uniqueNodeNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">报工单号</label>
                    <input type="text" value={f.reportNo} onChange={e => setReworkFlowFilter(prev => ({ ...prev, reportNo: e.target.value }))} placeholder="FG+日期+序号 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">操作人</label>
                    <input type="text" value={f.operator} onChange={e => setReworkFlowFilter(prev => ({ ...prev, operator: e.target.value }))} placeholder="操作人模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4">
                  <button type="button" onClick={() => setReworkFlowFilter({ dateFrom: '', dateTo: '', orderNumber: '', productId: '', nodeName: '', operator: '', reportNo: '' })} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
                  <span className="text-xs text-slate-400">共 {sorted.length} 条返工报工记录</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {sorted.length === 0 ? (
                  <p className="text-slate-500 text-center py-12">暂无返工报工流水</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">时间</th>
                          {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">报工单号</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                          {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">单价</th>}
                          {hasAnyPrice && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">金额</th>}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">操作人</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map(r => {
                          const order = orders.find(o => o.id === r.orderId);
                          const product = products.find(p => p.id === r.productId);
                          const nodeName = r.nodeId ? (globalNodes.find(n => n.id === r.nodeId)?.name ?? '') : '—';
                          return (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.timestamp || '—'}</td>
                              {productionLinkMode !== 'product' && <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{order?.orderNumber ?? '—'}</td>}
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{displayReportNo(r)}</td>
                              <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{product?.name ?? r.productId ?? '—'}</td>
                              <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{nodeName}</td>
                              <td className="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">{r.quantity ?? 0} 件</td>
                              {hasAnyPrice && <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{r.unitPrice != null && r.unitPrice > 0 ? r.unitPrice.toFixed(2) : '—'}</td>}
                              {hasAnyPrice && <td className="px-4 py-3 text-right font-bold text-amber-600 whitespace-nowrap">{r.amount != null && r.amount > 0 ? r.amount.toFixed(2) : '—'}</td>}
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.operator || '—'}</td>
                              <td className="px-4 py-3">
                                {hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:view') && (
                                  <button type="button" onClick={() => setReworkFlowDetailRecord(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0">
                                    <FileText className="w-3.5 h-3.5" /> 详情
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                          <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 4 : 5}></td>
                          <td className="px-4 py-3 text-indigo-600 text-right">{totalQuantity} 件</td>
                          {hasAnyPrice && <td className="px-4 py-3"></td>}
                          {hasAnyPrice && <td className="px-4 py-3 text-amber-600 text-right">{totalAmount.toFixed(2)}</td>}
                          <td className="px-4 py-3" colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 返工报工流水 - 详情弹窗（参考报工流水：同单号批次、规格表、合计、编辑/删除） */}
      {reworkFlowDetailRecord && (() => {
        const r = reworkFlowDetailRecord;
        const detailBatch = r.type === 'REWORK_REPORT'
          ? (r.docNo
              ? (records || []).filter(
                  (x): x is ProductionOpRecord =>
                    x.type === 'REWORK_REPORT' && x.docNo === r.docNo && x.productId === r.productId
                )
              : [r])
          : (records || []).filter(
              (x): x is ProductionOpRecord => x.type === 'REWORK' && x.orderId === r.orderId && (x.sourceNodeId ?? x.nodeId) === (r.sourceNodeId ?? r.nodeId) && (r.docNo ? x.docNo === r.docNo : x.id === r.id)
            );
        const first = detailBatch[0];
        if (!first) return null;
        const order = orders.find(o => o.id === first.orderId);
        const product = products.find(p => p.id === first.productId);
        const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
        const nodeName = first.nodeId ? globalNodes.find(n => n.id === first.nodeId)?.name : null;
        /** 来源工序应显示返工来源（报不良的工序），用 REWORK 记录的 sourceNodeId；不显示路径上的上一道工序 */
        const reworkOrigin = (records || []).find(x => x.type === 'REWORK' && (x.orderId === first.orderId || (orders.find(o => o.id === first.orderId)?.parentOrderId === x.orderId)) && ((x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : []).includes(first.nodeId ?? '')));
        const resolvedSourceNodeId = (reworkOrigin?.sourceNodeId != null ? reworkOrigin.sourceNodeId : first.sourceNodeId) ?? undefined;
        const sourceNodeName = resolvedSourceNodeId ? globalNodes.find(n => n.id === resolvedSourceNodeId)?.name : null;
        const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
        const hasColorSize = Boolean(product?.variants?.length);
        const getVariantLabel = (rec: ProductionOpRecord) => {
          if (!rec.variantId) return '未分规格';
          const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId);
          return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId;
        };
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setReworkFlowDetailRecord(null); setReworkFlowDetailEditing(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  {productionLinkMode === 'product'
                    ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
                    : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
                  }
                  返工详情
                </h3>
                <div className="flex items-center gap-2">
                  {reworkFlowDetailEditing ? (
                    <>
                      <button type="button" onClick={() => setReworkFlowDetailEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!onUpdateRecord || !reworkFlowDetailEditing) return;
                          const f = reworkFlowDetailEditing.form;
                          const tsStr = f.timestamp ? (() => { const d = new Date(f.timestamp); return isNaN(d.getTime()) ? new Date().toLocaleString() : d.toLocaleString(); })() : new Date().toLocaleString();
                          const opName = (workers?.find(w => w.id === f.workerId)?.name) ?? f.operator;
                          const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
                          f.rowEdits.forEach(row => {
                            const rec = detailBatch.find(x => x.id === row.recordId);
                            if (!rec) return;
                            const newQty = Math.max(0, row.quantity);
                            const oldQty = rec.quantity ?? 0;
                            const delta = newQty - oldQty;
                            if (delta !== 0 && rec.sourceReworkId && rec.nodeId) {
                              const key = `${rec.sourceReworkId}|${rec.nodeId}`;
                              const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
                              cur.delta += delta;
                              reworkDeltas.set(key, cur);
                            }
                            onUpdateRecord({ ...rec, quantity: newQty, timestamp: tsStr, operator: opName, reason: f.reason || undefined, workerId: f.workerId || undefined, equipmentId: f.equipmentId || undefined, unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined, amount: f.unitPrice > 0 ? newQty * f.unitPrice : undefined });
                          });
                          reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
                            const reworkRec = records.find(r => r.id === reworkId && r.type === 'REWORK');
                            if (!reworkRec) return;
                            const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
                            const newDone = Math.max(0, oldDone + delta);
                            const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
                            const nodes = (reworkRec.reworkNodeIds?.length ? reworkRec.reworkNodeIds : (reworkRec.nodeId ? [reworkRec.nodeId] : []));
                            const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
                            const wasComplete = reworkRec.status === '已完成';
                            onUpdateRecord({ ...reworkRec, reworkCompletedQuantityByNode: updCompleted, status: allDone ? '已完成' : (wasComplete ? '处理中' : reworkRec.status) });
                          });
                          setReworkFlowDetailEditing(null);
                          setReworkFlowDetailRecord(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:edit') && (
                        <button
                          type="button"
                          onClick={() => {
                            const rec = detailBatch[0];
                            let dt = new Date(rec.timestamp || undefined);
                            if (isNaN(dt.getTime())) dt = new Date();
                            const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                            setReworkFlowDetailEditing({
                              firstRecord: rec,
                              form: {
                                timestamp: tsStr,
                                operator: rec.operator ?? '',
                                workerId: rec.workerId ?? '',
                                equipmentId: rec.equipmentId ?? '',
                                reason: rec.reason ?? '',
                                unitPrice: rec.unitPrice ?? 0,
                                rowEdits: detailBatch.map(x => ({ recordId: x.id, quantity: x.quantity ?? 0 }))
                              }
                            });
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:delete') && (
                        <button
                          type="button"
                          onClick={() => {
                            void confirm({ message: '确定要删除该返工单的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                              if (!ok) return;
                            const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
                            detailBatch.forEach(rec => {
                              if (rec.sourceReworkId && rec.nodeId) {
                                const key = `${rec.sourceReworkId}|${rec.nodeId}`;
                                const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
                                cur.delta -= (rec.quantity ?? 0);
                                reworkDeltas.set(key, cur);
                              }
                            });
                            detailBatch.forEach(x => onDeleteRecord(x.id));
                            reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
                              const reworkRec = records.find(r => r.id === reworkId && r.type === 'REWORK');
                              if (!reworkRec || !onUpdateRecord) return;
                              const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
                              const newDone = Math.max(0, oldDone + delta);
                              const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
                              const nodes = (reworkRec.reworkNodeIds?.length ? reworkRec.reworkNodeIds : (reworkRec.nodeId ? [reworkRec.nodeId] : []));
                              const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
                              const wasComplete = reworkRec.status === '已完成';
                              onUpdateRecord({ ...reworkRec, reworkCompletedQuantityByNode: updCompleted, status: allDone ? '已完成' : (wasComplete ? '处理中' : reworkRec.status) });
                            });
                            setReworkFlowDetailRecord(null);
                            setReworkFlowDetailEditing(null);
                          });
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                        >
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setReworkFlowDetailRecord(null); setReworkFlowDetailEditing(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{product?.name ?? first.productId ?? '—'}</h2>
                {reworkFlowDetailEditing ? (
                  <>
                    <div className="grid grid-cols-[1fr_1fr] gap-3">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">返工时间</p>
                        <input
                          type="datetime-local"
                          value={reworkFlowDetailEditing.form.timestamp}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p>
                        <input
                          type="text"
                          value={reworkFlowDetailEditing.form.operator}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="操作人"
                        />
                      </div>
                      {workers && workers.length > 0 && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">报工人员</p>
                          <WorkerSelector
                            options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                            processNodes={globalNodes}
                            currentNodeId={first.nodeId ?? ''}
                            value={reworkFlowDetailEditing.form.workerId}
                            onChange={(id) => { const w = workers.find(wx => wx.id === id); setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, workerId: id, operator: w?.name ?? prev.form.operator } } : prev); }}
                            placeholder="选择报工人员..."
                            variant="compact"
                          />
                        </div>
                      )}
                      {equipment && equipment.length > 0 && globalNodes.find(n => n.id === first.nodeId)?.enableEquipmentOnReport && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">设备</p>
                          <EquipmentSelector
                            options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                            processNodes={globalNodes}
                            currentNodeId={first.nodeId ?? ''}
                            value={reworkFlowDetailEditing.form.equipmentId}
                            onChange={(id) => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, equipmentId: id } } : prev)}
                            placeholder="选择设备..."
                            variant="compact"
                          />
                        </div>
                      )}
                      <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">原因/备注</p>
                        <input
                          type="text"
                          value={reworkFlowDetailEditing.form.reason}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                          placeholder="选填"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={reworkFlowDetailEditing.form.unitPrice || ''}
                          onChange={e => setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev)}
                          placeholder="0"
                          className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                        <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                          {(reworkFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (reworkFlowDetailEditing.form.unitPrice || 0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                            {reworkFlowDetailEditing.form.unitPrice > 0 && (
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {detailBatch.map(rec => {
                            const rowEdit = reworkFlowDetailEditing.form.rowEdits.find(re => re.recordId === rec.id);
                            if (!rowEdit) return null;
                            return (
                              <tr key={rec.id} className="border-b border-slate-100">
                                <td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      value={rowEdit.quantity}
                                      onChange={e => {
                                        const v = Math.max(0, Number(e.target.value) || 0);
                                        setReworkFlowDetailEditing(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.recordId === rec.id ? { ...r, quantity: v } : r) } } : prev);
                                      }}
                                      className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    <span className="text-slate-600 text-sm">{unitName}</span>
                                  </div>
                                </td>
                                {reworkFlowDetailEditing.form.unitPrice > 0 && (
                                  <td className="px-4 py-3 font-bold text-amber-600 text-right">{(rowEdit.quantity * reworkFlowDetailEditing.form.unitPrice).toFixed(2)}</td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                            <td className="px-4 py-3">合计</td>
                            <td className="px-4 py-3 text-indigo-600 text-right">{reworkFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}</td>
                            {reworkFlowDetailEditing.form.unitPrice > 0 && (
                              <td className="px-4 py-3 text-amber-600 text-right">{(reworkFlowDetailEditing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * reworkFlowDetailEditing.form.unitPrice).toFixed(2)}</td>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工序</p>
                        <p className="text-sm font-bold text-slate-800">{nodeName ?? first.nodeId ?? '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">来源工序</p>
                        <p className="text-sm font-bold text-slate-800">{sourceNodeName ?? (first.sourceNodeId ? globalNodes.find(n => n.id === first.sourceNodeId)?.name : null) ?? '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">返工数量</p>
                        <p className="text-sm font-bold text-indigo-600">{totalQty} {unitName}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">返工时间</p>
                        <p className="text-sm font-bold text-slate-800">{first.timestamp || '—'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p>
                        <p className="text-sm font-bold text-slate-800">{first.operator ?? '—'}</p>
                      </div>
                      {first.reason && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">原因/备注</p>
                          <p className="text-sm font-bold text-slate-800">{first.reason}</p>
                        </div>
                      )}
                      {first.unitPrice != null && first.unitPrice > 0 && (
                        <>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">单价（元/件）</p>
                            <p className="text-sm font-bold text-slate-800">{first.unitPrice.toFixed(2)}</p>
                          </div>
                          <div className="bg-amber-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-amber-500 font-bold uppercase mb-0.5">金额（元）</p>
                            <p className="text-sm font-bold text-amber-600">{(totalQty * first.unitPrice).toFixed(2)}</p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                            {first.unitPrice != null && first.unitPrice > 0 && (
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {detailBatch.map(rec => (
                            <tr key={rec.id} className="border-b border-slate-100">
                              <td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td>
                              <td className="px-4 py-3 font-bold text-indigo-600 text-right">{rec.quantity ?? 0} {unitName}</td>
                              {first.unitPrice != null && first.unitPrice > 0 && (
                                <td className="px-4 py-3 font-bold text-amber-600 text-right">{((rec.quantity ?? 0) * first.unitPrice).toFixed(2)}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        {hasColorSize || detailBatch.length > 1 ? (
                          <tfoot>
                            <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                              <td className="px-4 py-3">合计</td>
                              <td className="px-4 py-3 text-indigo-600 text-right">{totalQty} {unitName}</td>
                              {first.unitPrice != null && first.unitPrice > 0 && (
                                <td className="px-4 py-3 text-amber-600 text-right">{(totalQty * first.unitPrice).toFixed(2)}</td>
                              )}
                            </tr>
                          </tfoot>
                        ) : null}
                      </table>
                    </div>
                    {(first.reworkNodeIds?.length ?? 0) > 0 && (
                      <div className="text-sm">
                        <span className="text-slate-400 font-bold">返工目标工序</span>
                        <p className="text-slate-800 mt-1">{first.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p>
                      </div>
                    )}
                    {(first.completedNodeIds?.length ?? 0) > 0 && (
                      <div className="text-sm">
                        <span className="text-slate-400 font-bold">已完成工序</span>
                        <p className="text-slate-800 mt-1">{first.completedNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {reworkActionRow && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({}); }} aria-hidden />
          <div className={`relative bg-white w-full rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden ${reworkActionMode === null ? 'max-w-md' : 'max-w-4xl max-h-[90vh]'}`} onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900">不良品处理</h3>
              <button type="button" onClick={() => { setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({}); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
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
                {reworkActionRow.productName} · {reworkActionRow.milestoneName} · 待处理 <span className="font-bold text-amber-600">{reworkActionRow.pendingQty}</span> 件
              </p>
              {reworkActionMode === null ? (
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setReworkActionMode('scrap')}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-slate-200 text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 transition-colors"
                  >
                    报损
                  </button>
                  <button
                    type="button"
                    onClick={() => setReworkActionMode('rework')}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-indigo-200 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                  >
                    返工到指定工序
                  </button>
                </div>
              ) : reworkActionMode === 'scrap' ? (
                <>
                  {reworkActionHasColorSize ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">报损数量明细（按规格）</label>
                        <span className="text-sm font-bold text-rose-600">合计 {reworkActionVariantTotal} 件</span>
                      </div>
                      <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
                        {sortedVariantColorEntries(reworkActionGroupedVariants, reworkActionProduct?.colorIds, reworkActionProduct?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
                          return (
                            <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-2 shrink-0">
                                {color && <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string }).value }} />}
                                <span className="text-sm font-bold text-slate-800">{(color as { name?: string })?.name ?? colorId}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-1">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                                  const maxVariant = reworkActionPendingByVariant[v.id] ?? 0;
                                  const qty = reworkActionVariantQuantities[v.id] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxVariant}
                                        value={qty === 0 ? '' : qty}
                                        onChange={e => setReworkActionVariantQuantities(prev => ({ ...prev, [v.id]: Math.min(maxVariant, Math.max(0, Number(e.target.value) || 0)) }))}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-rose-600 text-right outline-none focus:ring-2 focus:ring-rose-200 placeholder:text-[10px] placeholder:text-slate-400"
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
                  ) : (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">报损数量</label>
                      <input
                        type="number"
                        min={1}
                        max={reworkActionRow.pendingQty}
                        value={reworkActionQty || ''}
                        onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                        placeholder={`1 ~ ${reworkActionRow.pendingQty}`}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因（选填）</label>
                    <input
                      type="text"
                      value={reworkActionReason}
                      onChange={e => setReworkActionReason(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                      placeholder="如：不可修复"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionVariantQuantities({}); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      disabled={reworkActionHasColorSize ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty)}
                      onClick={() => {
                        const reason = reworkActionReason || undefined;
                        const operator = '张主管';
                        const timestamp = new Date().toLocaleString();
                        const nodeIdSc = reworkActionRow.nodeId;
                        const scrapDocNo = getNextReworkDocNo();
                        const parentsSc = orders.filter(o => !o.parentOrderId && o.productId === reworkActionRow.productId);
                        const splitProductSc = reworkActionRow.scope === 'product' && parentsSc.length > 0;
                        const pushScrap = (oid: string, vid: string | undefined, q: number, rid: string) => {
                          if (!onAddRecord || q <= 0) return;
                          onAddRecord({
                            id: rid,
                            type: 'SCRAP',
                            orderId: oid,
                            productId: reworkActionRow.productId,
                            variantId: vid,
                            quantity: q,
                            reason,
                            operator,
                            timestamp,
                            nodeId: nodeIdSc,
                            docNo: scrapDocNo
                          });
                        };
                        if (reworkActionHasColorSize) {
                          if (!onAddRecord || reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) return;
                          if (splitProductSc) {
                            const qtyMap: Record<string, number> = {};
                            Object.entries(reworkActionVariantQuantities).forEach(([vId, q]) => {
                              const n = Number(q) || 0;
                              if (n <= 0 || n > (reworkActionPendingByVariant[vId] ?? 0)) return;
                              qtyMap[vId] = n;
                            });
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsSc,
                              productMilestoneProgresses,
                              qtyMap
                            );
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
                          if (!onAddRecord || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
                          if (splitProductSc) {
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsSc,
                              productMilestoneProgresses,
                              { '': reworkActionQty }
                            );
                            if (splits.length === 0) return;
                            splits.forEach((sp, i) => pushScrap(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-sc-${i}`));
                          } else {
                            pushScrap(reworkActionRow.orderId, undefined, reworkActionQty, `rec-${Date.now()}-sc-${Math.random().toString(36).slice(2, 8)}`);
                          }
                        }
                        setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionVariantQuantities({});
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                    >
                      确定报损
                    </button>
                  </div>
                </>
              ) : (
                <>
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
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setReworkActionNodeIds(prev => checked ? prev.filter(id => id !== n.id) : [...prev, n.id])}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm font-bold text-slate-700">{n.name}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                  {reworkActionHasColorSize ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">返工数量明细（按规格）</label>
                        <span className="text-sm font-bold text-indigo-600">合计 {reworkActionVariantTotal} 件</span>
                      </div>
                      <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
                        {sortedVariantColorEntries(reworkActionGroupedVariants, reworkActionProduct?.colorIds, reworkActionProduct?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
                          return (
                            <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-2 shrink-0">
                                {color && <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string }).value }} />}
                                <span className="text-sm font-bold text-slate-800">{(color as { name?: string })?.name ?? colorId}</span>
                              </div>
                              <div className="flex items-center gap-3 flex-1">
                                {colorVariants.map(v => {
                                  const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                                  const maxVariant = reworkActionPendingByVariant[v.id] ?? 0;
                                  const qty = reworkActionVariantQuantities[v.id] ?? 0;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                      <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxVariant}
                                        value={qty === 0 ? '' : qty}
                                        onChange={e => setReworkActionVariantQuantities(prev => ({ ...prev, [v.id]: Math.min(maxVariant, Math.max(0, Number(e.target.value) || 0)) }))}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
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
                  ) : (
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">返工数量</label>
                      <input
                        type="number"
                        min={1}
                        max={reworkActionRow.pendingQty}
                        value={reworkActionQty || ''}
                        onChange={e => setReworkActionQty(Math.min(reworkActionRow.pendingQty, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder={`1 ~ ${reworkActionRow.pendingQty}`}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因（选填）</label>
                    <input
                      type="text"
                      value={reworkActionReason}
                      onChange={e => setReworkActionReason(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="如：尺寸不良"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({}); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      disabled={reworkActionNodeIds.length === 0 || (reworkActionHasColorSize ? (reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) : (reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty))}
                      onClick={() => {
                        const reason = reworkActionReason || undefined;
                        const operator = '张主管';
                        const timestamp = new Date().toLocaleString();
                        const sourceNodeId = reworkActionRow.nodeId;
                        const reworkNodeIds = reworkActionNodeIds.length > 0 ? reworkActionNodeIds : undefined;
                        const nodeId = reworkActionNodeIds[0];
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
                          if (!onAddRecord || q <= 0) return;
                          onAddRecord({
                            id: rid,
                            type: 'REWORK',
                            orderId: oid,
                            productId: reworkActionRow.productId,
                            variantId: vid,
                            quantity: q,
                            reason,
                            operator,
                            timestamp,
                            status: '待返工',
                            sourceNodeId,
                            nodeId: nodeIdFirst,
                            reworkNodeIds: reworkNodeIdsSorted,
                            docNo: reworkDocNo
                          });
                        };
                        if (reworkActionHasColorSize) {
                          if (!onAddRecord || reworkActionNodeIds.length === 0 || reworkActionVariantTotal <= 0 || reworkActionVariantTotal > reworkActionRow.pendingQty) return;
                          if (splitProductRw) {
                            const qtyMap: Record<string, number> = {};
                            Object.entries(reworkActionVariantQuantities).forEach(([vId, q]) => {
                              const n = Number(q) || 0;
                              if (n <= 0) return;
                              if (n > (reworkActionPendingByVariant[vId] ?? 0)) return;
                              qtyMap[vId] = n;
                            });
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsRw,
                              productMilestoneProgresses,
                              qtyMap
                            );
                            if (splits.length === 0) return;
                            splits.forEach((sp, i) =>
                              pushRework(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-rw-${i}-${sp.orderId}`)
                            );
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
                          if (!onAddRecord || reworkActionNodeIds.length === 0 || reworkActionQty <= 0 || reworkActionQty > reworkActionRow.pendingQty) return;
                          if (splitProductRw) {
                            const splits = splitQtyBySourceDefectiveAcrossParentOrders(
                              reworkActionRow.productId,
                              reworkActionRow.nodeId,
                              parentsRw,
                              productMilestoneProgresses,
                              { '': reworkActionQty }
                            );
                            if (splits.length === 0) return;
                            splits.forEach((sp, i) =>
                              pushRework(sp.orderId, sp.variantId, sp.quantity, `rec-${Date.now()}-rw-${i}-${sp.orderId}`)
                            );
                          } else {
                            pushRework(reworkActionRow.orderId, undefined, reworkActionQty, `rec-${Date.now()}-rw-${Math.random().toString(36).slice(2, 8)}`);
                          }
                        }
                        setReworkActionRow(null); setReworkActionMode(null); setReworkActionQty(0); setReworkActionReason(''); setReworkActionNodeIds([]); setReworkActionVariantQuantities({});
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    >
                      生成返工
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 返工报工弹窗：点击工序标签打开，按路径分开录入（做法1），支持颜色尺码与最多数量提示 */}
      {reworkReportModal && onUpdateRecord && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 z-0 bg-slate-900/60"
            onClick={() => { setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); setReworkReportUnitPrice(0); }}
            aria-hidden
          />
          <div
            className="relative z-10 bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> {reworkReportModal.nodeName} · 返工报工</h3>
              <button type="button" onClick={() => { setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); setReworkReportUnitPrice(0); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              <p className="text-sm text-slate-600">
                {productionLinkMode === 'product' ? (
                  <>
                    <span className="font-bold text-slate-800">{reworkReportModal.order.productName || '—'}</span>
                    <span className="text-slate-400 text-xs ml-2">载体工单 {reworkReportModal.order.orderNumber}</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-slate-800">{reworkReportModal.order.orderNumber}</span>
                    <span className="mx-2">·</span>
                    <span>{reworkReportModal.order.productName || '—'}</span>
                  </>
                )}
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">生产人员 <span className="text-rose-500">*</span></label>
                <WorkerSelector
                  options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                  processNodes={globalNodes}
                  currentNodeId={reworkReportModal.nodeId}
                  value={reworkReportWorkerId}
                  onChange={(id: string) => setReworkReportWorkerId(id)}
                  placeholder="选择报工人员..."
                  variant="default"
                  icon={UserPlus}
                />
              </div>
              {globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">设备 <span className="text-rose-500">*</span></label>
                  <EquipmentSelector
                    options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                    processNodes={globalNodes}
                    currentNodeId={reworkReportModal.nodeId}
                    value={reworkReportEquipmentId}
                    onChange={(id: string) => setReworkReportEquipmentId(id)}
                    placeholder="选择设备..."
                    variant="default"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={reworkReportUnitPrice || ''}
                    onChange={e => setReworkReportUnitPrice(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                  <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                    {(() => {
                      const totalQty = reworkReportPaths.reduce((sum, p) => {
                        if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
                          return sum + (reworkReportProduct.variants.reduce((vs, v) => vs + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0), 0));
                        }
                        return sum + (reworkReportQuantities[p.pathKey] ?? 0);
                      }, 0);
                      return (totalQty * (reworkReportUnitPrice || 0)).toFixed(2);
                    })()}
                  </div>
                </div>
              </div>
              {reworkReportPaths.length === 0 ? (
                <p className="text-slate-500 py-4">
                  {processSequenceMode === 'sequential'
                    ? '该工序暂无待返工数量（顺序模式：请先完成上一道返工工序的报工）'
                    : '该工序暂无待返工数量'}
                </p>
              ) : (
                <div className="space-y-4 pb-2">
                  {reworkReportPaths.map(({ pathKey, pathLabel, records: pathRecords, totalPending, pendingByVariant }) => {
                    const currentNodeId = reworkReportModal.nodeId;
                    if (reworkReportHasColorSize && reworkReportProduct?.variants?.length) {
                      return (
                        <div key={pathKey} className="space-y-3 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800">返工路径：{pathLabel}</span>
                            <span className="text-xs font-bold text-indigo-600">待返工合计 {totalPending} 件</span>
                          </div>
                          <div className="space-y-3 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                            {sortedVariantColorEntries(reworkReportGroupedVariants, reworkReportProduct?.colorIds, reworkReportProduct?.sizeIds).map(([colorId, colorVariants]) => {
                              const color = dictionaries?.colors?.find((c: { id: string; name: string; value?: string }) => c.id === colorId);
                              return (
                                <div key={colorId} className="flex items-center gap-4 flex-wrap">
                                  <div className="flex items-center gap-2 shrink-0">
                                    {color && <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: (color as { value?: string }).value }} />}
                                    <span className="text-sm font-bold text-slate-800">{(color as { name?: string })?.name ?? colorId}</span>
                                  </div>
                                  <div className="flex items-center gap-3 flex-1">
                                    {colorVariants.map(v => {
                                      const size = dictionaries?.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                                      const pendingUndiff = pendingByVariant[''] ?? 0;
                                      const onlyUndiff =
                                        pendingUndiff > 0 &&
                                        Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);
                                      const maxV = onlyUndiff
                                        ? pendingUndiff
                                        : (pendingByVariant[v.id] ?? 0);
                                      const qty = reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0;
                                      return (
                                        <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                          <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                          <input
                                            type="number"
                                            min={0}
                                            max={maxV}
                                            value={qty === 0 ? '' : qty}
                                            onChange={e => {
                                              const raw = Math.max(0, Number(e.target.value) || 0);
                                              if (!onlyUndiff) {
                                                setReworkReportQuantities(prev => ({ ...prev, [`${pathKey}__${v.id}`]: Math.min(maxV, raw) }));
                                                return;
                                              }
                                              setReworkReportQuantities(prev => {
                                                const sumOthers = (reworkReportProduct?.variants ?? [])
                                                  .filter(x => x.id !== v.id)
                                                  .reduce((s, x) => s + (prev[`${pathKey}__${x.id}`] ?? 0), 0);
                                                const cap = Math.max(0, pendingUndiff - sumOthers);
                                                return { ...prev, [`${pathKey}__${v.id}`]: Math.min(cap, raw) };
                                              });
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                                            placeholder={`最多${maxV}`}
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
                    }
                    const totalEntered = reworkReportQuantities[pathKey] ?? 0;
                    return (
                      <div key={pathKey} className="flex items-center gap-4 flex-wrap bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                        <span className="text-sm font-bold text-slate-800 shrink-0">返工路径：{pathLabel}</span>
                        <span className="text-xs font-bold text-slate-500">待返工 {totalPending} 件</span>
                        <input
                          type="number"
                          min={0}
                          max={totalPending}
                          value={totalEntered === 0 ? '' : totalEntered}
                          onChange={e => setReworkReportQuantities(prev => ({ ...prev, [pathKey]: Math.min(totalPending, Math.max(0, Number(e.target.value) || 0)) }))}
                          className="w-28 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400"
                          placeholder={`最多${totalPending}`}
                        />
                        <span className="text-xs text-slate-400">件</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {reworkReportPaths.length > 0 && (
              <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex gap-3 bg-white">
                    <button type="button" onClick={() => { setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportUnitPrice(0); }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!reworkReportWorkerId?.trim()) {
                          toast.warning('请先选择生产人员');
                          return;
                        }
                        const needEquip = globalNodes.find(n => n.id === reworkReportModal.nodeId)?.enableEquipmentOnReport;
                        if (needEquip && !reworkReportEquipmentId?.trim()) {
                          toast.warning('请先选择设备');
                          return;
                        }
                        if (!onAddRecord) {
                          toast.error('系统未配置保存单据，无法提交返工报工');
                          return;
                        }
                        const pathsSnapshot = reworkReportPaths;
                        const hasAnyQty = pathsSnapshot.some(p => {
                          if (!reworkReportHasColorSize) return (reworkReportQuantities[p.pathKey] ?? 0) > 0;
                          const pu = p.pendingByVariant[''] ?? 0;
                          const onlyU =
                            pu > 0 &&
                            Object.keys(p.pendingByVariant).every(k => k === '' || (p.pendingByVariant[k] ?? 0) <= 0);
                          if (onlyU) {
                            const sum =
                              reworkReportProduct?.variants?.reduce(
                                (s, v) => s + (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0),
                                0
                              ) ?? 0;
                            if (sum > 0) return true;
                          }
                          if ((p.pendingByVariant[''] ?? 0) > 0 && (reworkReportQuantities[`${p.pathKey}__`] ?? 0) > 0) return true;
                          return (reworkReportProduct?.variants ?? []).some(v => (reworkReportQuantities[`${p.pathKey}__${v.id}`] ?? 0) > 0);
                        });
                        if (!hasAnyQty) {
                          toast.warning('请先在各返工路径下填写报工数量');
                          return;
                        }
                        const currentNodeId = reworkReportModal.nodeId;
                        let batchDocNo = '';
                        let reportSeq = 0;
                        let appliedReportQty = 0;
                        const pushReworkReport = (qty: number, variantId: string | undefined, src: ProductionOpRecord) => {
                          if (qty <= 0 || !onAddRecord) return;
                          if (!batchDocNo) batchDocNo = getNextReworkReportDocNo();
                          appliedReportQty += qty;
                          const ts = new Date().toLocaleString();
                          const opName = workers?.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? '张主管';
                          const sid = src.id != null ? String(src.id) : 'x';
                          onAddRecord({
                            id: `rec-rework-report-${Date.now()}-${reportSeq++}-${sid.slice(-8)}`,
                            type: 'REWORK_REPORT' as const,
                            orderId: src.orderId ?? reworkReportModal.order.id,
                            productId: reworkReportModal.order.productId,
                            operator: opName,
                            timestamp: ts,
                            nodeId: currentNodeId,
                            sourceNodeId: src.sourceNodeId,
                            sourceReworkId: src.id,
                            workerId: reworkReportWorkerId || undefined,
                            equipmentId: reworkReportEquipmentId || undefined,
                            quantity: qty,
                            variantId: variantId || undefined,
                            docNo: batchDocNo,
                            unitPrice: reworkReportUnitPrice > 0 ? reworkReportUnitPrice : undefined,
                            amount: reworkReportUnitPrice > 0 ? qty * reworkReportUnitPrice : undefined,
                          });
                        };
                        try {
                        for (const { pathKey, records: pathRecords, pendingByVariant } of pathsSnapshot) {
                          if (reworkReportHasColorSize) {
                            const pendingUndiff = pendingByVariant[''] ?? 0;
                            const onlyUndiffPending =
                              pendingUndiff > 0 &&
                              Object.keys(pendingByVariant).every(k => k === '' || (pendingByVariant[k] ?? 0) <= 0);

                            if (onlyUndiffPending) {
                              const userTotal =
                                reworkReportProduct?.variants?.reduce(
                                  (s, v) => s + (reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0),
                                  0
                                ) ?? 0;
                              const totalToApply = Math.min(userTotal, pendingUndiff);
                              if (totalToApply <= 0) continue;
                              let remaining = totalToApply;
                              const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
                              for (const r of sortedRecs) {
                                if (remaining <= 0) break;
                                const room = r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0);
                                const add = Math.min(room, remaining);
                                if (add <= 0) continue;
                                remaining -= add;
                                const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + add;
                                const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
                                const allDone = nodes.every(
                                  n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? add : 0) >= r.quantity
                                );
                                const opName = workers.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? r.operator;
                                const ts = new Date().toLocaleString();
                                onUpdateRecord({
                                  ...r,
                                  reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
                                  ...(allDone ? { status: '已完成' as const } : {}),
                                  workerId: reworkReportWorkerId || undefined,
                                  equipmentId: reworkReportEquipmentId || undefined,
                                  operator: opName,
                                  timestamp: ts
                                });
                                pushReworkReport(add, undefined, r);
                              }
                              continue;
                            }

                            const byVariant: Record<string, number> = {};
                            if ((pendingByVariant[''] ?? 0) > 0) byVariant[''] = Math.min(reworkReportQuantities[`${pathKey}__`] ?? 0, pendingByVariant[''] ?? 0);
                            reworkReportProduct?.variants?.forEach(v => { byVariant[v.id] = Math.min(reworkReportQuantities[`${pathKey}__${v.id}`] ?? 0, pendingByVariant[v.id] ?? 0); });
                            const totalToApply = Object.values(byVariant).reduce((s, q) => s + q, 0);
                            if (totalToApply <= 0) continue;
                            let remainingByVariant = { ...byVariant };
                            const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
                            for (const r of sortedRecs) {
                              const vid = r.variantId ?? '';
                              const need = Math.min(r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0), remainingByVariant[vid] ?? 0);
                              if (need <= 0) continue;
                              remainingByVariant[vid] = (remainingByVariant[vid] ?? 0) - need;
                              const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + need;
                              const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
                              const allDone = nodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? need : 0) >= r.quantity);
                              const opName = workers.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? r.operator;
                              const ts = new Date().toLocaleString();
                              onUpdateRecord({
                                ...r,
                                reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
                                ...(allDone ? { status: '已完成' as const } : {}),
                                workerId: reworkReportWorkerId || undefined,
                                equipmentId: reworkReportEquipmentId || undefined,
                                operator: opName,
                                timestamp: ts
                              });
                              pushReworkReport(need, vid || undefined, r);
                            }
                          } else {
                            const totalToApply = Math.min(reworkReportQuantities[pathKey] ?? 0, pathRecords.reduce((s, r) => s + (r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0)), 0));
                            if (totalToApply <= 0) continue;
                            let remaining = totalToApply;
                            const sortedRecs = [...pathRecords].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
                            for (const r of sortedRecs) {
                              if (remaining <= 0) break;
                              const room = r.quantity - (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0);
                              const add = Math.min(room, remaining);
                              if (add <= 0) continue;
                              remaining -= add;
                              const nextDone = (r.reworkCompletedQuantityByNode?.[currentNodeId] ?? 0) + add;
                              const nodes = (r.reworkNodeIds && r.reworkNodeIds.length > 0) ? r.reworkNodeIds : (r.nodeId ? [r.nodeId] : []);
                              const allDone = nodes.every(n => (r.reworkCompletedQuantityByNode?.[n] ?? 0) + (n === currentNodeId ? add : 0) >= r.quantity);
                              const opName = workers.find((w: Worker) => w.id === reworkReportWorkerId)?.name ?? r.operator;
                              const ts = new Date().toLocaleString();
                              onUpdateRecord({
                                ...r,
                                reworkCompletedQuantityByNode: { ...(r.reworkCompletedQuantityByNode ?? {}), [currentNodeId]: nextDone },
                                ...(allDone ? { status: '已完成' as const } : {}),
                                workerId: reworkReportWorkerId || undefined,
                                equipmentId: reworkReportEquipmentId || undefined,
                                operator: opName,
                                timestamp: ts
                              });
                              pushReworkReport(add, r.variantId, r);
                            }
                          }
                        }
                        } catch (e) {
                          console.error(e);
                          toast.error(`提交失败：${e instanceof Error ? e.message : String(e)}`);
                          return;
                        }
                        if (appliedReportQty <= 0) {
                          toast.error('未能写入返工报工：请确认所填数量与各规格「待返工」一致，或尝试刷新页面后重试。');
                          return;
                        }
                        setReworkReportModal(null); setReworkReportQuantities({}); setReworkReportWorkerId(''); setReworkReportEquipmentId(''); setReworkReportUnitPrice(0);
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      确认报工
                    </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(ReworkPanel);
