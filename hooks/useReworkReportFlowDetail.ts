/**
 * ReworkReportFlowDetailModal 的 state + handler + 派生计算集中托管 hook (Phase P9 抽离)。
 *
 * 持有:
 * - editing: 编辑模式下的临时表单 state
 *
 * 暴露:
 * - editing / setEditing
 * - startEdit / saveEdit / handleDelete
 * - 大量派生 useMemo (detailBatch / first / product / unitName / matrix 相关 / 自定义字段快照 / 打印上下文)
 *
 * 设计要点:
 * - 主壳/Edit/Detail 三处共用,因此 hook 返回的字段尽量"扁平"以便解构
 * - saveEdit 与 handleDelete 都执行外部 onUpdateRecord/onDeleteRecord 副作用并最终 onClose,符合原行为
 */
import { useState, useMemo, useCallback } from 'react';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  Worker,
  ReworkFormSettings,
  PrintTemplate,
  PrintRenderContext,
} from '../types';
import {
  sumBatchTotalQty,
  sumBatchTotalAmount,
  pickUniqueUnitPrice,
  uniqOutsourcePartnersInBatch,
  uniqOperatorsInBatch,
} from '../utils/reworkBatchSummary';
import { productHasColorSizeMatrix } from '../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../utils/variantQtyMatrix';
import {
  groupProductionOpBatchByVariant,
  mapGroupedOpQuantitiesToRecordIds,
} from '../utils/groupProductionOpBatchByVariant';
import { fmtDT, timestampFromDatetimeLocal, nowTimestamp } from '../utils/formatTime';
import { getProductCategoryCustomFieldEntries } from '../utils/reportCustomDocField';
import { buildReworkReportFlowPrintContext } from '../utils/buildReworkReportFlowPrintContext';
import { readReworkReportCustomSnapshot, REWORK_REPORT_CUSTOM_DATA_KEY } from '../utils/productionOpCollab/rework';

export type EditingRowEdit = {
  variantId: string;
  label: string;
  quantity: number;
  recordIds: string[];
};

export type EditingState = {
  form: {
    timestamp: string;
    workerId: string;
    equipmentId: string;
    reason: string;
    unitPrice: number;
    customData: Record<string, unknown>;
    rowEdits: EditingRowEdit[];
  };
  firstRecord: ProductionOpRecord;
} | null;

interface UseReworkReportFlowDetailArgs {
  productionLinkMode: 'order' | 'product';
  reworkFlowDetailRecord: ProductionOpRecord;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  reworkFormSettings?: ReworkFormSettings;
  tenantName?: string;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  onAddRecord?: (record: ProductionOpRecord) => void | Promise<void>;
  onClose: () => void;
}

export function useReworkReportFlowDetail(args: UseReworkReportFlowDetailArgs) {
  const {
    productionLinkMode,
    reworkFlowDetailRecord: r,
    records,
    orders,
    products,
    categories,
    globalNodes,
    dictionaries,
    workers,
    equipment,
    reworkFormSettings,
    tenantName,
    onUpdateRecord,
    onDeleteRecord,
    onAddRecord,
    onClose,
  } = args;

  const [editing, setEditing] = useState<EditingState>(null);

  /** 同一批次内的所有记录(REWORK_REPORT 按 docNo+productId 聚合;REWORK 按 orderId+sourceNodeId+docNo|id) */
  const detailBatch = useMemo<ProductionOpRecord[]>(() => {
    if (r.type === 'REWORK_REPORT') {
      return r.docNo
        ? (records || []).filter(
            (x): x is ProductionOpRecord =>
              x.type === 'REWORK_REPORT' && x.docNo === r.docNo && x.productId === r.productId,
          )
        : [r];
    }
    return (records || []).filter(
      (x): x is ProductionOpRecord =>
        x.type === 'REWORK' &&
        x.orderId === r.orderId &&
        (x.sourceNodeId ?? x.nodeId) === (r.sourceNodeId ?? r.nodeId) &&
        (r.docNo ? x.docNo === r.docNo : x.id === r.id),
    );
  }, [r, records]);

  const first = detailBatch[0];
  const isReportDetail = first?.type === 'REWORK_REPORT';

  const outsourcePartnersInBatch = useMemo(
    () => (isReportDetail ? uniqOutsourcePartnersInBatch(detailBatch) : ([] as string[])),
    [isReportDetail, detailBatch],
  );
  const isOutsourceReworkReport = isReportDetail && outsourcePartnersInBatch.length > 0;
  const outsourcePartnerDisplay =
    outsourcePartnersInBatch.length === 0
      ? ''
      : outsourcePartnersInBatch.length === 1
        ? outsourcePartnersInBatch[0]!
        : outsourcePartnersInBatch.join('、');

  const order = first ? orders.find(o => o.id === first.orderId) : undefined;
  const product = first ? products.find(p => p.id === first.productId) : undefined;
  const productCategory = product ? categories.find(c => c.id === product.categoryId) : undefined;
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';

  const reworkOrigin = first
    ? (records || []).find(
        x =>
          x.type === 'REWORK' &&
          (x.orderId === first.orderId || orders.find(o => o.id === first.orderId)?.parentOrderId === x.orderId) &&
          (x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : []).includes(first.nodeId ?? ''),
      )
    : undefined;
  const resolvedSourceNodeId = first
    ? (reworkOrigin?.sourceNodeId != null ? reworkOrigin.sourceNodeId : first.sourceNodeId) ?? undefined
    : undefined;
  const sourceNodeName = resolvedSourceNodeId ? globalNodes.find(n => n.id === resolvedSourceNodeId)?.name : null;

  const totalQty = sumBatchTotalQty(detailBatch);
  const hasColorSize = productHasColorSizeMatrix(product, productCategory);

  const nodeNamesInBatch = useMemo(
    () =>
      [
        ...new Set(
          detailBatch
            .map(x => (x.nodeId ? globalNodes.find(n => n.id === x.nodeId)?.name ?? '' : ''))
            .filter(Boolean),
        ),
      ] as string[],
    [detailBatch, globalNodes],
  );
  const nodeNamesLabel =
    nodeNamesInBatch.length === 0 ? '—' : nodeNamesInBatch.length === 1 ? nodeNamesInBatch[0]! : nodeNamesInBatch.join('、');

  const latestBatchTimestamp = useMemo(
    () =>
      detailBatch.reduce<{ t: number; ts?: string }>(
        (best, x) => {
          const t = new Date(x.timestamp || 0).getTime();
          if (isNaN(t)) return best;
          return t >= best.t ? { t, ts: x.timestamp } : best;
        },
        { t: -1 },
      ).ts,
    [detailBatch],
  );

  const opsInBatch = uniqOperatorsInBatch(detailBatch);
  const operatorsLabel =
    opsInBatch.length === 0 ? '—' : opsInBatch.length === 1 ? opsInBatch[0]! : `${opsInBatch[0]} 等${opsInBatch.length}人`;
  const unitPriceLabel = pickUniqueUnitPrice(detailBatch);
  const batchTotalAmount = sumBatchTotalAmount(detailBatch);

  const detailHeaderUnitPriceText = useMemo(() => {
    if (unitPriceLabel != null) return unitPriceLabel.toFixed(2);
    const up = detailBatch[0]?.unitPrice;
    return up != null && Number(up) > 0 ? Number(up).toFixed(2) : '—';
  }, [unitPriceLabel, detailBatch]);

  const displayVariantRows = useMemo(() => {
    const grouped = groupProductionOpBatchByVariant(detailBatch, product);
    return grouped.map(g => {
      let lineAmount = 0;
      for (const id of g.recordIds) {
        const rec = detailBatch.find(x => x.id === id);
        if (!rec) continue;
        const q = rec.quantity ?? 0;
        lineAmount +=
          rec.amount != null && rec.amount > 0
            ? rec.amount
            : rec.unitPrice != null && rec.unitPrice > 0
              ? q * rec.unitPrice
              : 0;
      }
      return { ...g, lineAmount };
    });
  }, [detailBatch, product]);

  const reworkFlowMatrixProduct = useMemo(
    () => (product && product.variants?.length ? product : null),
    [product],
  );
  const variantQtyFromDisplayRows = useMemo(() => {
    const m: Record<string, number> = {};
    displayVariantRows.forEach(row => {
      if (row.variantId) m[row.variantId] = row.quantity;
    });
    return m;
  }, [displayVariantRows]);
  const undiffDisplayRow = useMemo(
    () => displayVariantRows.find(row => !row.variantId) ?? null,
    [displayVariantRows],
  );

  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const matrixSummaryCustomTags = useMemo(() => {
    if (!product) return [];
    const cat = product.categoryId ? categoryMap.get(product.categoryId) : undefined;
    return getProductCategoryCustomFieldEntries(product, cat ?? null, { includeFile: false, includeEmpty: false });
  }, [product, categoryMap]);

  const reworkReportFieldsForDetail = useMemo(
    () => (reworkFormSettings?.reworkReportCustomFields ?? []).filter(f => f.showInDetail),
    [reworkFormSettings?.reworkReportCustomFields],
  );
  const reworkReportCustomSnapshot = useMemo(() => {
    if (!isReportDetail || !first) return {} as Record<string, unknown>;
    return readReworkReportCustomSnapshot(records, first.docNo, first.productId);
  }, [records, first, isReportDetail]);

  const buildPrintContext = useCallback(
    (template: PrintTemplate): PrintRenderContext =>
      buildReworkReportFlowPrintContext(template, {
        productionLinkMode,
        detailBatch,
        records,
        orders,
        products,
        globalNodes,
        dictionaries,
        workers,
        equipment,
        tenantName,
      }),
    [productionLinkMode, detailBatch, records, orders, products, globalNodes, dictionaries, workers, equipment, tenantName],
  );

  const startEdit = useCallback(() => {
    if (!onUpdateRecord || detailBatch.length === 0) return;
    const rec = detailBatch[0]!;
    let dt = new Date(rec.timestamp || undefined);
    if (isNaN(dt.getTime())) dt = new Date();
    const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(
      2,
      '0',
    )}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const snap =
      rec.type === 'REWORK_REPORT' ? { ...readReworkReportCustomSnapshot(records, rec.docNo, rec.productId) } : {};
    const grouped = groupProductionOpBatchByVariant(detailBatch, product);
    let rowEdits: EditingRowEdit[] = grouped.map(g => ({
      variantId: g.variantId,
      label: g.label,
      quantity: g.quantity,
      recordIds: [...g.recordIds],
    }));
    if (isReportDetail && hasColorSize && product && dictionaries) {
      const layout = buildVariantQtyMatrixLayout(product, dictionaries);
      if (layout) {
        const undiff = grouped.find(g => !g.variantId);
        const byVid = new Map(grouped.filter(g => g.variantId).map(g => [g.variantId, g]));
        const next: EditingRowEdit[] = [];
        if (undiff) {
          next.push({
            variantId: undiff.variantId,
            label: undiff.label,
            quantity: undiff.quantity,
            recordIds: [...undiff.recordIds],
          });
        }
        for (const cr of layout.colorRows) {
          for (const v of cr.variantAtSize) {
            if (!v) continue;
            const g = byVid.get(v.id);
            const label = (v as { skuSuffix?: string }).skuSuffix ?? v.id;
            if (g) {
              next.push({
                variantId: g.variantId,
                label: g.label,
                quantity: g.quantity,
                recordIds: [...g.recordIds],
              });
            } else {
              next.push({ variantId: v.id, label, quantity: 0, recordIds: [] });
            }
          }
        }
        rowEdits = next;
      }
    }
    setEditing({
      firstRecord: rec,
      form: {
        timestamp: tsStr,
        workerId: rec.workerId ?? '',
        equipmentId: rec.equipmentId ?? '',
        reason: rec.reason ?? '',
        unitPrice: rec.unitPrice ?? 0,
        customData: snap,
        rowEdits,
      },
    });
  }, [onUpdateRecord, detailBatch, records, product, isReportDetail, hasColorSize, dictionaries]);

  const saveEdit = useCallback(() => {
    if (!onUpdateRecord || !editing) return;
    const f = editing.form;
    const tsStr = f.timestamp ? timestampFromDatetimeLocal(f.timestamp) : nowTimestamp();
    const isOutsourceSave = detailBatch.some(
      x => x.type === 'REWORK_REPORT' && (x.partner ?? '').trim().length > 0,
    );
    const opName = isOutsourceSave
      ? ''
      : (workers?.find(w => w.id === f.workerId)?.name) ?? editing.firstRecord.operator ?? '';
    const newQtyByRecordId = mapGroupedOpQuantitiesToRecordIds(detailBatch, f.rowEdits);
    const cleanCustom = Object.fromEntries(
      Object.entries(f.customData).filter(([, v]) => v !== '' && v != null && v !== undefined),
    );
    const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
    detailBatch.forEach(rec => {
      const newQty = newQtyByRecordId.get(rec.id);
      if (newQty === undefined) return;
      const oldQty = rec.quantity ?? 0;
      const delta = newQty - oldQty;
      if (delta !== 0 && rec.sourceReworkId && rec.nodeId) {
        const key = `${rec.sourceReworkId}|${rec.nodeId}`;
        const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
        cur.delta += delta;
        reworkDeltas.set(key, cur);
      }
      const prevCd = (rec as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
      const collabMerged =
        rec.type === 'REWORK_REPORT'
          ? { ...prevCd, [REWORK_REPORT_CUSTOM_DATA_KEY]: cleanCustom }
          : prevCd;
      onUpdateRecord({
        ...rec,
        quantity: newQty,
        timestamp: tsStr,
        operator: opName,
        reason: f.reason || undefined,
        workerId: isOutsourceSave ? undefined : f.workerId || undefined,
        equipmentId: isOutsourceSave ? undefined : f.equipmentId || undefined,
        unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined,
        amount: f.unitPrice > 0 ? newQty * f.unitPrice : undefined,
        ...(rec.type === 'REWORK_REPORT' ? { collabData: collabMerged } : {}),
      });
    });
    for (const row of f.rowEdits) {
      if (row.recordIds.length > 0 || !row.variantId || row.quantity <= 0) continue;
      const tmpl = first!;
      if (tmpl.sourceReworkId && tmpl.nodeId) {
        const key = `${tmpl.sourceReworkId}|${tmpl.nodeId}`;
        const cur = reworkDeltas.get(key) ?? { reworkId: tmpl.sourceReworkId, nodeId: tmpl.nodeId, delta: 0 };
        cur.delta += row.quantity;
        reworkDeltas.set(key, cur);
      }
    }
    if (isReportDetail && onAddRecord) {
      let seq = 0;
      for (const row of f.rowEdits) {
        if (row.recordIds.length > 0 || !row.variantId || row.quantity <= 0) continue;
        const base = first!;
        void onAddRecord({
          id: `rec-rework-report-edit-${Date.now()}-${seq++}-${row.variantId.slice(-6)}`,
          type: 'REWORK_REPORT',
          orderId: base.orderId,
          productId: base.productId,
          operator: opName,
          timestamp: tsStr,
          nodeId: base.nodeId,
          sourceNodeId: base.sourceNodeId,
          sourceReworkId: base.sourceReworkId ?? reworkOrigin?.id,
          variantId: row.variantId,
          quantity: row.quantity,
          docNo: base.docNo,
          workerId: isOutsourceSave ? undefined : f.workerId || undefined,
          equipmentId: isOutsourceSave ? undefined : f.equipmentId || undefined,
          unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined,
          amount: f.unitPrice > 0 ? row.quantity * f.unitPrice : undefined,
          ...((base.partner ?? '').trim() ? { partner: base.partner } : {}),
          collabData: { [REWORK_REPORT_CUSTOM_DATA_KEY]: cleanCustom },
        });
      }
    }
    reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
      const reworkRec = records.find(rec => rec.id === reworkId && rec.type === 'REWORK');
      if (!reworkRec) return;
      const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
      const newDone = Math.max(0, oldDone + delta);
      const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
      const nodes = reworkRec.reworkNodeIds?.length
        ? reworkRec.reworkNodeIds
        : reworkRec.nodeId
          ? [reworkRec.nodeId]
          : [];
      const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
      const wasComplete = reworkRec.status === '已完成';
      onUpdateRecord({
        ...reworkRec,
        reworkCompletedQuantityByNode: updCompleted,
        status: allDone ? '已完成' : wasComplete ? '处理中' : reworkRec.status,
      });
    });
    setEditing(null);
    onClose();
  }, [editing, detailBatch, first, isReportDetail, onAddRecord, onUpdateRecord, records, reworkOrigin, workers, onClose]);

  const handleDelete = useCallback(() => {
    if (!onDeleteRecord) return;
    const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
    detailBatch.forEach(rec => {
      if (rec.sourceReworkId && rec.nodeId) {
        const key = `${rec.sourceReworkId}|${rec.nodeId}`;
        const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
        cur.delta -= rec.quantity ?? 0;
        reworkDeltas.set(key, cur);
      }
    });
    detailBatch.forEach(x => onDeleteRecord(x.id));
    reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
      const reworkRec = records.find(rec => rec.id === reworkId && rec.type === 'REWORK');
      if (!reworkRec || !onUpdateRecord) return;
      const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
      const newDone = Math.max(0, oldDone + delta);
      const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
      const nodes = reworkRec.reworkNodeIds?.length
        ? reworkRec.reworkNodeIds
        : reworkRec.nodeId
          ? [reworkRec.nodeId]
          : [];
      const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
      const wasComplete = reworkRec.status === '已完成';
      onUpdateRecord({
        ...reworkRec,
        reworkCompletedQuantityByNode: updCompleted,
        status: allDone ? '已完成' : wasComplete ? '处理中' : reworkRec.status,
      });
    });
    onClose();
  }, [onDeleteRecord, onUpdateRecord, detailBatch, records, onClose]);

  return {
    editing,
    setEditing,

    detailBatch,
    first,
    order,
    product,
    productCategory,
    unitName,

    isReportDetail,
    outsourcePartnersInBatch,
    isOutsourceReworkReport,
    outsourcePartnerDisplay,
    nodeNamesLabel,
    sourceNodeName,
    operatorsLabel,
    latestBatchTimestamp,

    totalQty,
    batchTotalAmount,
    detailHeaderUnitPriceText,
    hasColorSize,
    reworkFlowMatrixProduct,

    displayVariantRows,
    variantQtyFromDisplayRows,
    undiffDisplayRow,

    matrixSummaryCustomTags,
    reworkReportFieldsForDetail,
    reworkReportCustomSnapshot,

    buildPrintContext,
    fmtDT,

    startEdit,
    saveEdit,
    handleDelete,
  };
}
