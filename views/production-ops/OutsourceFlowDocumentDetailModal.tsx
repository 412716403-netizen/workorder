import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScrollText, X, Check, Pencil, Trash2, Clock, User, Package } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  ProductVariant,
  AppDictionaries,
  GlobalNodeTemplate,
  Partner,
  PartnerCategory,
  OutsourceFormSettings,
  PrintRenderContext,
  PrintTemplate,
} from '../../types';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../types';
import { hasOpsPerm } from './types';
import { SupplierSelect } from '../../components/SupplierSelect';
import { psiOrderBillFormPartnerTriggerClassCompact } from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import * as api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildOutsourceFlowPrintContext } from '../../utils/buildOutsourceFlowPrintContext';
import { AMOUNT_PERMISSION_KEYS, canViewAmount } from '../../utils/canViewAmount';
import { maskPrintContextAmounts } from '../../utils/maskPrintContextAmounts';
import {
  OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY,
  OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY,
  OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY,
  mergeOutsourceDetailEditCollab,
} from '../../utils/productionOpCollab/outsource';
import { PlanFormCustomFieldInput, PlanFormCustomFieldReadonly } from '../../components/PlanFormCustomFieldControls';
import { psiCustomFieldHasFilledDisplayValue } from '../psi-ops/psiOpsListFormatting';
import {
  buildOutsourceReceiveLastPriceIndex,
  lookupOutsourceReceiveLastPrice,
} from '../../utils/outsourceReceiveLastUnitPrice';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { sortVariantsByColorThenSize } from '../../utils/sortVariantsByProduct';
import { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import {
  buildWeightMapForKeyedEntries,
  formatWeightKgDisplay,
  roundWeightKg,
} from '../../utils/reportBatchWeightHelpers';
import {
  propagateLineUnitPriceToEntries,
  resolveOutsourceReceiveLineUnitPrice,
} from '../../utils/outsourceReceiveUnitPrice';

export interface OutsourceFlowDocumentDetailModalProps {
  productionLinkMode: 'order' | 'product';
  flowDetailKey: string;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries?: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  userPermissions?: string[];
  tenantRole?: string;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void | Promise<void>;
  onDeleteRecordBatch?: (recordIds: string[]) => Promise<void>;
  onClose: () => void;
  outsourceFormSettings?: OutsourceFormSettings;
  printTemplates?: PrintTemplate[];
  /** 从详情「增加打印模版」打开外协表单配置并切到打印页 */
  onOpenOutsourceFormPrintTab?: () => void;
  /** `docPhase`：由外层 DocPhaseModal 提供顶栏与详情/编辑切换，本组件不渲染全屏壳与顶栏 */
  layout?: 'standalone' | 'docPhase';
  /** 与外层 `DocPhaseModal` 的 phase 同步；仅 `layout==='docPhase'` 时有效 */
  phase?: 'detail' | 'edit';
  /** 保存成功后回到详情态（由父级把 phase 设为 detail） */
  onPhaseDetail?: () => void;
  /** 保存成功后回调（默认 docPhase 布局会关闭弹窗，避免 extra records 与刷新数据双计） */
  onAfterSave?: () => void;
}

const OutsourceFlowDocumentDetailModal: React.FC<OutsourceFlowDocumentDetailModalProps> = ({
  productionLinkMode,
  flowDetailKey,
  records,
  orders,
  products,
  categories,
  dictionaries,
  globalNodes,
  partners,
  partnerCategories,
  userPermissions,
  tenantRole,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  onDeleteRecordBatch,
  onClose,
  outsourceFormSettings = DEFAULT_OUTSOURCE_FORM_SETTINGS,
  printTemplates = [],
  onOpenOutsourceFormPrintTab,
  layout = 'standalone',
  phase = 'detail',
  onPhaseDetail,
  onAfterSave,
}) => {
  const { currentUser, tenantCtx } = useAuth();
  const flowDetailOperatorFallback = currentOperatorDisplayName(currentUser);
  const showOutsourceAmount = canViewAmount(tenantRole, userPermissions, AMOUNT_PERMISSION_KEYS.OUTSOURCE);
  const confirm = useConfirm();
  const docPhaseEditToolbarHost = useContext(DocPhaseEditToolbarPortalContext);
  const [flowDetailEditMode, setFlowDetailEditMode] = useState(false);
  const editActive = layout === 'docPhase' ? phase === 'edit' : flowDetailEditMode;
  const docPhaseInitKeyRef = useRef<string | null>(null);
  /** 保存时同步读取，避免输入框 onChange 尚未 commit 就点保存导致单价丢失 */
  const flowDetailQuantitiesRef = useRef<Record<string, number>>({});
  const flowDetailUnitPricesRef = useRef<Record<string, number>>({});
  const [flowDetailEditPartner, setFlowDetailEditPartner] = useState('');
  const [flowDetailQuantities, setFlowDetailQuantities] = useState<Record<string, number>>({});
  const [flowDetailUnitPrices, setFlowDetailUnitPrices] = useState<Record<string, number>>({});
  const patchFlowDetailQuantities = useCallback((patch: Record<string, number>) => {
    setFlowDetailQuantities(prev => {
      const next = { ...prev, ...patch };
      flowDetailQuantitiesRef.current = next;
      return next;
    });
  }, []);
  const setLineUnitPrice = useCallback((lineKey: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? undefined : parseFloat(trimmed);
    const price = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    setFlowDetailUnitPrices(prev => {
      const next = propagateLineUnitPriceToEntries(
        prev,
        lineKey,
        price,
        Object.keys(flowDetailQuantitiesRef.current),
      );
      flowDetailUnitPricesRef.current = next;
      return next;
    });
  }, []);
  /** 收回单、工序启用称重：按明细行 key（`产品|工序` 或 `工单|工序`）编辑交货总重 kg，保存时按数量比分摊到各规格记录 */
  const [flowDetailLineWeights, setFlowDetailLineWeights] = useState<Record<string, number>>({});
  const [flowDetailEditCustom, setFlowDetailEditCustom] = useState<Record<string, unknown>>({});
  const [flowDetailDeliveryDate, setFlowDetailDeliveryDate] = useState('');
  const [detailImagePreviewUrl, setDetailImagePreviewUrl] = useState<string | null>(null);

  const docRecords = useMemo(
    () => records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey),
    [records, flowDetailKey],
  );

  const outsourceCustomDefsDetail = useMemo(() => {
    if (!docRecords.length) return [];
    const recv = docRecords[0].status === '已收回';
    const arr = recv ? outsourceFormSettings.outsourceReceiveCustomFields : outsourceFormSettings.outsourceDispatchCustomFields;
    return (arr ?? []).filter(f => f.showInDetail);
  }, [docRecords, outsourceFormSettings]);

  const outsourceCustomSnapshot = useMemo(() => {
    if (!docRecords.length) return {} as Record<string, unknown>;
    const recv = docRecords[0].status === '已收回';
    const key = recv ? OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY : OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY;
    const raw = docRecords[0].collabData?.[key];
    return typeof raw === 'object' && raw != null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  }, [docRecords]);

  const totalDocQty = useMemo(
    () => docRecords.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
    [docRecords],
  );

  const dispatchDetailDeliveryDateLabel = useMemo(() => {
    if (!docRecords.length) return '—';
    if (docRecords[0]!.status === '已收回') return '—';
    if (!outsourceFormSettings.showOutsourceDispatchDeliveryDate) return '—';
    const raw = (docRecords[0]!.collabData as Record<string, unknown> | undefined)?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY];
    if (typeof raw !== 'string' || !raw.trim()) return '—';
    return raw.trim().slice(0, 10);
  }, [docRecords, outsourceFormSettings.showOutsourceDispatchDeliveryDate]);

  const beginFlowDetailEdit = useCallback(() => {
    if (docRecords.length === 0) return;
    const firstD = docRecords[0];
    const docPartnerVal = firstD.partner ?? '—';
    setFlowDetailEditPartner(docPartnerVal);
    setFlowDetailEditCustom({ ...outsourceCustomSnapshot });
    if (firstD.status !== '已收回') {
      const rawDd = (firstD.collabData as Record<string, unknown> | undefined)?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY];
      setFlowDetailDeliveryDate(typeof rawDd === 'string' ? rawDd.trim().slice(0, 10) : '');
    } else {
      setFlowDetailDeliveryDate('');
    }
    const isProductMode = productionLinkMode === 'product' && docRecords.some(r => !r.orderId);
    const initQty: Record<string, number> = {};
    docRecords.forEach(r => {
      const k = isProductMode
        ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`
        : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`;
      initQty[k] = (initQty[k] || 0) + r.quantity;
    });
    flowDetailQuantitiesRef.current = initQty;
    setFlowDetailQuantities(initQty);
    const isRecv = firstD.status === '已收回';
    if (isRecv) {
      const initUnitPrice: Record<string, number> = {};
      docRecords.forEach(r => {
        const k = isProductMode
          ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`
          : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`;
        const up = r.unitPrice != null ? Number(r.unitPrice) : NaN;
        if (Number.isFinite(up) && up >= 0) initUnitPrice[k] = up;
      });
      docRecords.forEach(r => {
        const base = isProductMode ? `${r.productId}|${r.nodeId}` : `${r.orderId}|${r.nodeId}`;
        const up = r.unitPrice != null ? Number(r.unitPrice) : NaN;
        if (Number.isFinite(up) && up >= 0 && initUnitPrice[base] == null) initUnitPrice[base] = up;
      });
      const priceIdx = buildOutsourceReceiveLastPriceIndex(records, { excludeDocNo: flowDetailKey });
      if (priceIdx.size > 0) {
        docRecords.forEach(r => {
          const k = isProductMode
            ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`
            : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`;
          const curr = initUnitPrice[k];
          if (curr != null && curr > 0) return;
          const last = lookupOutsourceReceiveLastPrice(priceIdx, r.partner ?? docPartnerVal, r.productId ?? '', r.nodeId ?? '');
          if (last != null) initUnitPrice[k] = last;
        });
      }
      flowDetailUnitPricesRef.current = initUnitPrice;
      setFlowDetailUnitPrices(initUnitPrice);
      const initWt: Record<string, number> = {};
      const byLineW = new Map<string, ProductionOpRecord[]>();
      docRecords.forEach(rec => {
        if (!rec.nodeId) return;
        const gk = isProductMode ? `${rec.productId}|${rec.nodeId}` : rec.orderId ? `${rec.orderId}|${rec.nodeId}` : '';
        if (!gk) return;
        if (!byLineW.has(gk)) byLineW.set(gk, []);
        byLineW.get(gk)!.push(rec);
      });
      byLineW.forEach((recs, gk) => {
        const nid = recs[0]?.nodeId;
        if (!nid || !globalNodes.find(n => n.id === nid)?.enableWeightOnReport) return;
        const sum = recs.reduce((s, r) => s + (Number(r.weight) || 0), 0);
        if (sum > 0) initWt[gk] = roundWeightKg(sum);
      });
      setFlowDetailLineWeights(initWt);
    } else {
      flowDetailUnitPricesRef.current = {};
      setFlowDetailUnitPrices({});
      setFlowDetailLineWeights({});
    }
    if (layout === 'standalone') setFlowDetailEditMode(true);
  }, [docRecords, outsourceCustomSnapshot, productionLinkMode, flowDetailKey, records, layout, globalNodes]);

  /** 取消编辑或关闭弹窗时丢弃未保存的明细数量/单价/重量等草稿 */
  const discardFlowDetailEditDraft = useCallback(() => {
    docPhaseInitKeyRef.current = null;
    flowDetailQuantitiesRef.current = {};
    flowDetailUnitPricesRef.current = {};
    setFlowDetailQuantities({});
    setFlowDetailUnitPrices({});
    setFlowDetailLineWeights({});
    setFlowDetailEditCustom({});
    setFlowDetailDeliveryDate('');
    setFlowDetailEditMode(false);
  }, []);

  useEffect(() => {
    docPhaseInitKeyRef.current = null;
  }, [flowDetailKey, layout]);

  useEffect(() => {
    if (layout !== 'docPhase' || phase !== 'detail') return;
    docPhaseInitKeyRef.current = null;
    flowDetailUnitPricesRef.current = {};
    flowDetailQuantitiesRef.current = {};
    setFlowDetailQuantities({});
    setFlowDetailUnitPrices({});
    setFlowDetailLineWeights({});
    setFlowDetailEditCustom({});
    setFlowDetailDeliveryDate('');
  }, [layout, phase]);

  useEffect(() => {
    if (layout !== 'docPhase' || phase !== 'edit' || docRecords.length === 0) return;
    const k = `${flowDetailKey}|edit-session`;
    if (docPhaseInitKeyRef.current === k) return;
    docPhaseInitKeyRef.current = k;
    beginFlowDetailEdit();
  }, [layout, phase, flowDetailKey, docRecords, beginFlowDetailEdit]);

  const handleSaveDetailEdit = useCallback(async () => {
    if ((!onDeleteRecordBatch && !onDeleteRecord) || docRecords.length === 0) return;
    const firstSave = docRecords[0];
    const isReceiveDocSave = firstSave.status === '已收回';
    const isProductModeSave = productionLinkMode === 'product' && docRecords.some(r => !r.orderId);
    const nodeUsesWeight = (nodeId: string | undefined) =>
      !!nodeId && !!globalNodes.find(n => n.id === nodeId)?.enableWeightOnReport;
    const partnerName = (flowDetailEditPartner || '').trim();
    if (!partnerName) return;
    const qtySnapshot = flowDetailQuantitiesRef.current;
    const unitPricesSnapshot = flowDetailUnitPricesRef.current;
    const entries = (Object.entries(qtySnapshot) as [string, number][]).filter(([, qty]) => qty > 0);
    if (entries.length === 0) return;
    const toDelete = isReceiveDocSave ? docRecords : docRecords.filter(r => r.status !== '已收回');
    const weightByEntryKey = isReceiveDocSave
      ? buildWeightMapForKeyedEntries(
          entries.map(([key, qty]) => {
            const parts = key.split('|');
            const nodeId = parts[1] ?? '';
            const bk = parts.length >= 2 ? `${parts[0]}|${nodeId}` : key;
            return { entryKey: key, baseKey: bk, nodeId, quantity: Number(qty) };
          }),
          flowDetailLineWeights,
          nodeId => nodeUsesWeight(nodeId),
        )
      : new Map<string, number>();
    let preservedCollabData: Record<string, unknown> | undefined;
    for (const rec of toDelete) {
      const cd = rec.collabData;
      if (cd && typeof cd === 'object') {
        preservedCollabData = { ...(cd as Record<string, unknown>) };
        break;
      }
    }
    const customDataKey = isReceiveDocSave ? OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY : OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY;
    const mergeCollab = (preserved: Record<string, unknown> | undefined): { collabData?: Record<string, unknown> } =>
      mergeOutsourceDetailEditCollab(preserved, customDataKey, flowDetailEditCustom, {
        updateDispatchDeliveryDate:
          !isReceiveDocSave && outsourceFormSettings.showOutsourceDispatchDeliveryDate === true,
        dispatchDeliveryDate: flowDetailDeliveryDate,
      });
    const deleteIds = toDelete.map(rec => rec.id).filter(Boolean);
    if (onDeleteRecordBatch) {
      await onDeleteRecordBatch(deleteIds);
    } else {
      for (const rec of toDelete) await onDeleteRecord(rec.id);
    }
    const timestamp = firstSave.timestamp || new Date().toLocaleString();
    const newStatus = isReceiveDocSave ? '已收回' : '加工中';
    const resolveReceiveUnitPrice = (entryKey: string, baseKey: string): number | undefined => {
      if (!isReceiveDocSave) return undefined;
      return resolveOutsourceReceiveLineUnitPrice(unitPricesSnapshot, entryKey, baseKey);
    };
    const outsourcePendingWrites: ProductionOpRecord[] = [];
    entries.forEach(([key, qty]) => {
      const parts = key.split('|');
      const nodeId = parts[1];
      const variantId = parts[2];
      if (isProductModeSave) {
        const productId = parts[0];
        const bk = parts.length >= 2 ? `${productId}|${nodeId}` : key;
        const unitPrice = resolveReceiveUnitPrice(key, bk);
        const amount = unitPrice != null ? Number(qty) * unitPrice : undefined;
        const weightForThis = weightByEntryKey.get(key);
        outsourcePendingWrites.push({
          id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'OUTSOURCE',
          productId,
          quantity: qty,
          reason: undefined,
          operator: firstSave.operator || flowDetailOperatorFallback,
          timestamp,
          status: newStatus,
          partner: partnerName,
          docNo: flowDetailKey,
          nodeId,
          variantId: variantId || undefined,
          unitPrice,
          amount,
          weight: weightForThis != null && weightForThis > 0 ? weightForThis : undefined,
          ...mergeCollab(preservedCollabData),
        } as ProductionOpRecord);
        return;
      }
      const orderId = parts[0];
      const bk = parts.length >= 2 ? `${orderId}|${nodeId}` : key;
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      const unitPrice = resolveReceiveUnitPrice(key, bk);
      const amount = unitPrice != null ? Number(qty) * unitPrice : undefined;
      const weightOrd = weightByEntryKey.get(key);
      outsourcePendingWrites.push({
        id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'OUTSOURCE',
        orderId,
        productId: order.productId,
        quantity: qty,
        reason: undefined,
        operator: firstSave.operator || flowDetailOperatorFallback,
        timestamp,
        status: newStatus,
        partner: partnerName,
        docNo: flowDetailKey,
        nodeId,
        variantId: variantId || undefined,
        unitPrice,
        amount,
        weight: weightOrd != null && weightOrd > 0 ? weightOrd : undefined,
        ...mergeCollab(preservedCollabData),
      } as ProductionOpRecord);
    });
    if (onAddRecordBatch && outsourcePendingWrites.length > 1) {
      await onAddRecordBatch(outsourcePendingWrites);
    } else {
      for (const rec of outsourcePendingWrites) await onAddRecord(rec);
    }

    const collabDispatchIds = new Set<string>();
    for (const rec of toDelete) {
      const cd = (rec as { collabData?: { dispatchId?: string } }).collabData;
      if (cd?.dispatchId) collabDispatchIds.add(cd.dispatchId);
    }
    if (collabDispatchIds.size > 0) {
      const newRecordIds = outsourcePendingWrites.map(r => r.id);
      const doSync = await confirm({
        message:
          '此单据关联协作发出（已同步给乙方）。是否将编辑后的数据同步给乙方？\n\n选择"确认"将推送修订给乙方确认。',
      });
      if (doSync) {
        for (const dispatchId of collabDispatchIds) {
          try {
            await api.collaboration.updateDispatchPayload(dispatchId, { recordIds: newRecordIds });
            toast.success('已更新同步数据');
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('仅待接受')) {
              try {
                await api.collaboration.amendDispatch(dispatchId, { recordIds: newRecordIds });
                toast.success('已向乙方推送修订');
              } catch (e2: unknown) {
                toast.error(`同步失败: ${e2 instanceof Error ? e2.message : '未知错误'}`);
              }
            } else {
              toast.error(`同步失败: ${msg || '未知错误'}`);
            }
          }
        }
      }
    }

    flowDetailUnitPricesRef.current = {};
    flowDetailQuantitiesRef.current = {};
    setFlowDetailUnitPrices({});
    setFlowDetailLineWeights({});
    setFlowDetailEditCustom({});
    setFlowDetailDeliveryDate('');
    toast.success('已保存');
    if (onAfterSave) {
      onAfterSave();
    } else if (layout === 'docPhase') {
      onClose();
    } else {
      setFlowDetailEditMode(false);
    }
  }, [
    docRecords,
    flowDetailEditPartner,
    flowDetailQuantities,
    flowDetailEditCustom,
    flowDetailUnitPrices,
    flowDetailLineWeights,
    onDeleteRecord,
    onDeleteRecordBatch,
    onAddRecordBatch,
    onAddRecord,
    orders,
    flowDetailKey,
    flowDetailOperatorFallback,
    productionLinkMode,
    layout,
    onAfterSave,
    onClose,
    confirm,
    globalNodes,
    flowDetailDeliveryDate,
    outsourceFormSettings.showOutsourceDispatchDeliveryDate,
  ]);

  if (docRecords.length === 0) return null;
  const first = docRecords[0];
  const isReceiveDoc = first.status === '已收回';
  const printSlot = isReceiveDoc
    ? outsourceFormSettings.outsourceCenterPrint?.receiveFlowDetail
    : outsourceFormSettings.outsourceCenterPrint?.dispatchFlowDetail;
  const isFromCollabReturn = docRecords.some(r => r.collabData?.source === 'collaborationReturn');
  const totalAmount = isReceiveDoc ? docRecords.reduce((s, r) => s + (r.amount ?? 0), 0) : 0;
  const docDateStr = first.timestamp ? (() => { try { const d = new Date(first.timestamp); return isNaN(d.getTime()) ? first.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return first.timestamp; } })() : '—';
  const docPartner = first.partner ?? '—';
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
    /** 以单据行上的 productId 为准，再回退工单，避免工单与行不一致时名称/SKU/矩阵与实发规格错位 */
    const lineProductId = recs[0].productId ?? order?.productId;
    const product = lineProductId ? products.find(p => p.id === lineProductId) : undefined;
    const nodeName = recs[0].nodeId ? (globalNodes.find(n => n.id === recs[0].nodeId)?.name ?? recs[0].nodeId) : '—';
    const variantQty: Record<string, number> = {};
    recs.forEach(r => { const v = r.variantId || ''; if (!variantQty[v]) variantQty[v] = 0; variantQty[v] += r.quantity; });
    return { key, order, product, orderNumber: order?.orderNumber ?? (isProductModeDetail ? '' : recs[0].orderId), productName: product?.name ?? '—', nodeName, records: recs, variantQty };
  });

  const docMilestonesSummary = [...new Set(detailLines.map(d => d.nodeName).filter(n => n && n !== '—'))].join('、');
  const showOrderCol = productionLinkMode !== 'product';
  const nodeUsesWeightRow = (nodeId?: string) =>
    !!nodeId && !!globalNodes.find(n => n.id === nodeId)?.enableWeightOnReport;
  const showWeightCol = isReceiveDoc && detailLines.some(d => nodeUsesWeightRow(d.records[0]?.nodeId));
  const outsourceDetailColCount = (showOrderCol ? 3 : 2) + (isReceiveDoc && showOutsourceAmount ? 2 : 0) + (showWeightCol ? 1 : 0);
  const formatLineWeightKg = (sum: number) => formatWeightKgDisplay(sum);

  const getUnitName = (productId: string | undefined) => {
    if (!productId) return 'PCS';
    const p = products.find(pr => pr.id === productId);
    const u = (dictionaries?.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const docSummaryQtyUnitLabels = [...new Set(detailLines.map(d => getUnitName(d.product?.id ?? d.records[0]?.productId)))];
  const docSummaryQtyUnit = docSummaryQtyUnitLabels.length === 1 ? docSummaryQtyUnitLabels[0]! : 'PCS';

  const saveDetailToolbarButton = (
    <button
      type="button"
      onClick={() => {
        void handleSaveDetailEdit();
      }}
      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
    >
      <Check className="h-4 w-4 shrink-0" /> 保存
    </button>
  );

  return (
    <>
      {layout === 'docPhase' && editActive && docPhaseEditToolbarHost
        ? createPortal(saveDetailToolbarButton, docPhaseEditToolbarHost)
        : null}
      <div
        className={
          layout === 'standalone'
            ? 'fixed inset-0 z-[90] flex items-center justify-center p-4'
            : 'flex min-h-0 w-full max-w-4xl flex-1 flex-col'
        }
      >
        {layout === 'standalone' && (
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { discardFlowDetailEditDraft(); onClose(); }} aria-hidden />
        )}
        <div
          className={
            layout === 'standalone'
              ? 'relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl'
              : 'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden'
          }
          onClick={e => e.stopPropagation()}
        >
        {layout === 'standalone' && (
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ScrollText className="h-5 w-5 shrink-0 text-indigo-600" /> 单据详情
          </h3>
          <div className="flex items-center gap-2">
            {editActive ? (
              <>
                <button
                  type="button"
                  onClick={discardFlowDetailEditDraft}
                  className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                >
                  取消
                </button>
                <button type="button" onClick={() => { void handleSaveDetailEdit(); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                  <Check className="w-4 h-4" /> 保存
                </button>
              </>
            ) : (
              <>
                <OrderCenterDetailPrintBlock
                  printSlot={printSlot}
                  printTemplates={printTemplates}
                  buildContext={(_template: PrintTemplate): PrintRenderContext => {
                    const ctx: PrintRenderContext = {
                      ...buildOutsourceFlowPrintContext({
                        docRecords,
                        isReceiveDoc,
                        orders,
                        products,
                        globalNodes,
                        dictionaries,
                      }),
                      tenantName: tenantCtx?.tenantName?.trim() || undefined,
                    };
                    return isReceiveDoc && !showOutsourceAmount ? maskPrintContextAmounts(ctx) : ctx;
                  }}
                  pickerSubtitle={`单号 ${flowDetailKey}`}
                  onAddPrintTemplate={onOpenOutsourceFormPrintTab}
                />
                {onUpdateRecord && hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:edit') && (
                  <button type="button" onClick={beginFlowDetailEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {(onDeleteRecordBatch || onDeleteRecord) && hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:delete') && (
                  <button type="button" onClick={() => {
                    void confirm({ message: '确定要删除该张外协单的所有记录吗？此操作不可恢复。', danger: true }).then(async (ok) => {
                      if (!ok) return;
                      const ids = docRecords.map(rec => rec.id).filter(Boolean);
                      if (onDeleteRecordBatch) {
                        await onDeleteRecordBatch(ids);
                      } else if (onDeleteRecord) {
                        await Promise.all(ids.map(id => Promise.resolve(onDeleteRecord(id))));
                      }
                      onClose();
                      discardFlowDetailEditDraft();
                    });
                  }} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={() => { discardFlowDetailEditDraft(); onClose(); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
          </div>
        </div>
        )}
        {editActive && isFromCollabReturn && (
          <div className="px-6 py-3 border-b border-amber-200 bg-amber-50 shrink-0 flex items-start gap-2">
            <span className="text-amber-500 text-sm mt-0.5">⚠</span>
            <p className="text-xs text-amber-700 leading-relaxed">此单据来源于协作回传，本地修改<strong>不会</strong>同步到乙方。如需双方数据一致，请通知乙方在协作管理中编辑并重新同步。</p>
          </div>
        )}
        <div
          className={
            layout === 'standalone' ? 'min-h-0 flex-1 overflow-auto px-4 sm:px-6 pb-4' : undefined
          }
        >
          <div className="space-y-5 pt-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {editActive ? (
                    <div className="min-w-0 max-w-lg flex-1">
                      <SupplierSelect
                        options={partners}
                        categories={partnerCategories}
                        value={flowDetailEditPartner}
                        onChange={name => setFlowDetailEditPartner(name)}
                        placeholder="搜索并选择外协工厂..."
                        triggerClassName={`${psiOrderBillFormPartnerTriggerClassCompact} rounded-lg border border-slate-200 bg-white`}
                      />
                    </div>
                  ) : (
                    <span className="font-black text-slate-800">{docPartner}</span>
                  )}
                  <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                    {flowDetailKey}
                  </span>
                  {docMilestonesSummary ? (
                    <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm" title="工序">
                      工序：{docMilestonesSummary}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-slate-400 uppercase">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="normal-case">{docDateStr}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3 shrink-0" />
                    <span className="normal-case">经办: {first.operator || '—'}</span>
                  </span>
                  {!editActive && !isReceiveDoc && outsourceFormSettings.showOutsourceDispatchDeliveryDate ? (
                    <span className="flex items-center gap-1 normal-case text-slate-500">
                      <Package className="h-3 w-3 shrink-0" />
                      <span className="font-bold">交货日期</span>
                      <span className="text-slate-700 tabular-nums">{dispatchDetailDeliveryDateLabel}</span>
                    </span>
                  ) : null}
                  {!editActive &&
                    outsourceCustomDefsDetail
                      .filter(cf => psiCustomFieldHasFilledDisplayValue(cf, outsourceCustomSnapshot[cf.id]))
                      .map(cf => (
                        <span key={cf.id} className="inline-flex max-w-full min-w-0 items-baseline gap-1 normal-case">
                          <span className="shrink-0">{cf.label}:</span>
                          <span className="min-w-0">
                            <PlanFormCustomFieldReadonly
                              variant="inlineMeta"
                              cf={cf}
                              value={outsourceCustomSnapshot[cf.id]}
                              onFilePreview={(url, type) => {
                                if (type === 'image') setDetailImagePreviewUrl(url);
                                else window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                            />
                          </span>
                        </span>
                      ))}
                </div>
                {editActive &&
                ((!isReceiveDoc && outsourceFormSettings.showOutsourceDispatchDeliveryDate) ||
                  outsourceCustomDefsDetail.length > 0) ? (
                  <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-3">
                    {!isReceiveDoc && outsourceFormSettings.showOutsourceDispatchDeliveryDate ? (
                      <div className="min-w-0 space-y-1">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">交货日期</label>
                        <input
                          type="date"
                          value={flowDetailDeliveryDate}
                          onChange={e => setFlowDetailDeliveryDate(e.target.value)}
                          className="h-9 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    ) : null}
                    {outsourceCustomDefsDetail.map(cf => (
                      <div key={cf.id} className="min-w-0 space-y-1">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                        <PlanFormCustomFieldInput
                          cf={cf}
                          value={flowDetailEditCustom[cf.id]}
                          onChange={v => setFlowDetailEditCustom(prev => ({ ...prev, [cf.id]: v }))}
                          controlClassName="h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                          onFilePreview={(url, type) => {
                            if (type === 'image') setDetailImagePreviewUrl(url);
                            else window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-6 border-t border-slate-200/80 pt-3 text-sm md:border-t-0 md:border-l md:border-slate-200/80 md:pt-0 md:pl-6">
                <div className="min-w-[6.5rem] md:text-right">
                  <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
                  <p className="font-black tabular-nums text-slate-800">
                    {totalDocQty.toLocaleString()} {docSummaryQtyUnit}
                  </p>
                </div>
                {isReceiveDoc && showOutsourceAmount ? (
                  <div className="min-w-[6.5rem] md:text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">加工费合计</p>
                    <p className="font-black tabular-nums text-emerald-600">¥{totalAmount.toFixed(2)}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: showOrderCol ? (showWeightCol ? '32%' : '44%') : showWeightCol ? '40%' : '52%' }} />
                {showOrderCol ? <col style={{ width: showWeightCol ? '14%' : '18%' }} /> : null}
                <col style={{ width: isReceiveDoc ? (showWeightCol ? '10%' : '12%') : '18%' }} />
                {isReceiveDoc && showOutsourceAmount ? <col style={{ width: showWeightCol ? '10%' : '13%' }} /> : null}
                {isReceiveDoc && showOutsourceAmount ? <col style={{ width: showWeightCol ? '10%' : '13%' }} /> : null}
                {showWeightCol ? <col style={{ width: '12%' }} /> : null}
              </colgroup>
              <thead>
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                  <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                  {showOrderCol ? <th className="py-2.5 px-3 text-left">工单</th> : null}
                  <th className="py-2.5 px-3 text-right">{isReceiveDoc ? '数量' : '委外数量'}</th>
                  {isReceiveDoc && showOutsourceAmount ? <th className="py-2.5 px-3 text-right">单价</th> : null}
                  {isReceiveDoc && showOutsourceAmount ? <th className="py-2.5 px-3 text-right">金额</th> : null}
                  {showWeightCol ? (
                    <th className="py-2.5 px-3 text-right whitespace-nowrap" title="工序开启称重时，本次收回交货总重量（kg）">
                      重量 (kg)
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
            {detailLines.map(({ key, order: _order, product, orderNumber, productName, records: lineRecords, variantQty }) => {
              const category = categories.find(c => c.id === product?.categoryId);
              const lineProductId = product?.id ?? lineRecords[0]?.productId;
              const unitLabel = getUnitName(lineProductId);
              const productCustomTags =
                product && category ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false }) : [];
              const matrixEnabled = productHasColorSizeMatrix(product, category);
              const productThumb = (
                <>
                  {product?.imageUrl ? (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setDetailImagePreviewUrl(product.imageUrl!);
                      }}
                      className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label="查看产品图片"
                    >
                      <img
                        src={product.imageUrl}
                        alt={productName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                      <Package className="h-4 w-4" />
                    </div>
                  )}
                </>
              );
              const allProductVariants = (product?.variants as ProductVariant[]) ?? [];
              let variantsForDetail: ProductVariant[] = [];
              if (matrixEnabled && allProductVariants.length > 0) {
                variantsForDetail = sortVariantsByColorThenSize(
                  [...allProductVariants],
                  product.colorIds,
                  product.sizeIds,
                );
              }
              const showVariantQtyGrid = matrixEnabled && variantsForDetail.length > 0;
              if (showVariantQtyGrid && product && dictionaries) {
                /** 保留 colorIds/sizeIds，矩阵列/行顺序与产品档案、外协录入弹窗一致 */
                const matrixFlowProduct = { ...product, variants: variantsForDetail } as Product;
                const qtyRecord = Object.fromEntries(
                  variantsForDetail.map(v => {
                    const qtyKey = `${key}|${v.id}`;
                    const q = editActive
                      ? (flowDetailQuantities[qtyKey] ?? variantQty[v.id] ?? 0)
                      : (variantQty[v.id] ?? 0);
                    return [v.id, q];
                  }),
                );
                const matrixLineTotalQty = variantsForDetail.reduce(
                  (s, v) => s + (editActive ? (flowDetailQuantities[`${key}|${v.id}`] ?? variantQty[v.id] ?? 0) : (variantQty[v.id] ?? 0)),
                  0,
                );
                const matrixLineAmount = editActive
                  ? variantsForDetail.reduce((sum, v) => {
                      const qk = `${key}|${v.id}`;
                      const q = flowDetailQuantities[qk] ?? variantQty[v.id] ?? 0;
                      const up = flowDetailUnitPrices[qk] ?? flowDetailUnitPrices[key] ?? lineRecords.find(r => (r.variantId || '') === v.id)?.unitPrice ?? 0;
                      return sum + q * up;
                    }, 0)
                  : lineRecords.reduce((s, r) => s + (r.amount ?? 0), 0);
                const matrixLineUnitPriceVal = lineRecords.reduce<number | null>((picked, r) => {
                  if (picked != null) return picked;
                  const n = r.unitPrice != null ? Number(r.unitPrice) : NaN;
                  return Number.isFinite(n) && n >= 0 ? n : null;
                }, null);
                const matrixLineUnitPriceDisplay =
                  matrixLineUnitPriceVal != null ? matrixLineUnitPriceVal.toFixed(2) : '—';
                return (
                  <React.Fragment key={key}>
                    <tr>
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex min-w-0 items-start gap-2">
                          {productThumb}
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="font-bold text-slate-700">{productName}</span>
                              {product?.sku ? (
                                <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{product.sku}</span>
                              ) : null}
                            </div>
                            {productCustomTags.length > 0 ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {productCustomTags.map(({ field, display }) => (
                                  <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                    {field.label}: {display}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      {showOrderCol ? (
                        <td className="py-2.5 px-3 align-middle text-xs font-bold text-slate-600">
                          {orderNumber && String(orderNumber).trim() ? orderNumber : '—'}
                        </td>
                      ) : null}
                      <td className="py-2.5 px-3 text-right align-middle">
                        <span className="font-black text-indigo-600">
                          {matrixLineTotalQty.toLocaleString()} {unitLabel}
                        </span>
                      </td>
                      {isReceiveDoc && showOutsourceAmount ? (
                        <td className="py-2.5 px-3 text-right align-middle">
                          {editActive ? (
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={flowDetailUnitPrices[key] ?? ''}
                              onChange={e => setLineUnitPrice(key, e.target.value)}
                              placeholder="0"
                              className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          ) : (
                            <span className="font-bold text-slate-600">
                              {matrixLineUnitPriceDisplay === '—' ? '—' : `¥${matrixLineUnitPriceDisplay}`}
                            </span>
                          )}
                        </td>
                      ) : null}
                      {isReceiveDoc && showOutsourceAmount ? (
                        <td className="py-2.5 px-3 text-right align-middle font-black text-indigo-600">
                          ¥{matrixLineAmount.toFixed(2)}
                        </td>
                      ) : null}
                      {showWeightCol ? (
                        <td className="py-2.5 px-3 text-right align-middle">
                          {!nodeUsesWeightRow(lineRecords[0]?.nodeId) ? (
                            <span className="text-xs font-bold tabular-nums text-slate-600">—</span>
                          ) : editActive ? (
                            <input
                              type="number"
                              min={0}
                              step={0.0001}
                              value={
                                flowDetailLineWeights[key] != null && Number.isFinite(flowDetailLineWeights[key])
                                  ? flowDetailLineWeights[key] === 0
                                    ? ''
                                    : flowDetailLineWeights[key]
                                  : ''
                              }
                              onChange={e => {
                                const raw = e.target.value.trim();
                                if (raw === '') {
                                  setFlowDetailLineWeights(prev => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                  return;
                                }
                                const n = parseFloat(raw);
                                if (!Number.isFinite(n) || n < 0) return;
                                setFlowDetailLineWeights(prev => ({ ...prev, [key]: n }));
                              }}
                              placeholder="kg"
                              title="本行交货总重量 (kg)，将按各规格数量比例分摊到明细"
                              className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          ) : (
                            <span className="text-xs font-bold tabular-nums text-slate-600">
                              {formatLineWeightKg(lineRecords.reduce((s, r) => s + (Number(r.weight) || 0), 0))}
                            </span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                    <tr className="bg-slate-50/70">
                      <td colSpan={outsourceDetailColCount} className="border-t border-slate-100 px-3 pb-3 pt-2 align-top">
                        <VariantQtyMatrixInputs
                          product={matrixFlowProduct}
                          dictionaries={dictionaries}
                          quantities={qtyRecord}
                          readOnly={!editActive}
                          balancedNumericLayout
                          onVariantQtyChange={(variantId, qty) => {
                            patchFlowDetailQuantities({ [`${key}|${variantId}`]: qty });
                          }}
                        />
                      </td>
                    </tr>
                  </React.Fragment>
                );
              }
              const totalQty = Object.values(variantQty).reduce((s, n) => s + n, 0);
              const singleQty = editActive ? (flowDetailQuantities[key] ?? totalQty) : totalQty;
              const lineRec = lineRecords[0];
              const lineUnitPrice = editActive && isReceiveDoc ? (flowDetailUnitPrices[key] ?? lineRec?.unitPrice ?? 0) : (lineRec?.unitPrice ?? 0);
              const lineAmount = editActive && isReceiveDoc ? (singleQty * lineUnitPrice) : (lineRec?.amount ?? 0);
              return (
                <tr key={key}>
                  <td className="py-2.5 px-3 align-top">
                    <div className="flex min-w-0 items-start gap-2">
                      {productThumb}
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-bold text-slate-700">{productName}</span>
                          {product?.sku ? (
                            <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{product.sku}</span>
                          ) : null}
                        </div>
                        {productCustomTags.length > 0 ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {productCustomTags.map(({ field, display }) => (
                              <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                {field.label}: {display}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  {showOrderCol ? (
                    <td className="py-2.5 px-3 align-middle text-xs font-bold text-slate-600">
                      {orderNumber && String(orderNumber).trim() ? orderNumber : '—'}
                    </td>
                  ) : null}
                  <td className="py-2.5 px-3 align-middle">
                    <div className="flex min-w-0 items-center justify-end gap-1.5 whitespace-nowrap">
                      {editActive ? (
                        <input
                          type="number"
                          min={0}
                          value={flowDetailQuantities[key] ?? ''}
                          onChange={e => patchFlowDetailQuantities({ [key]: Number(e.target.value) || 0 })}
                          className="h-8 w-[5.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="shrink-0 font-black tabular-nums text-indigo-600">{totalQty.toLocaleString()}</span>
                      )}
                      <span className="shrink-0 text-xs font-bold text-slate-500">{unitLabel}</span>
                    </div>
                  </td>
                  {isReceiveDoc && showOutsourceAmount ? (
                    <td className="py-2.5 px-3 text-right align-middle">
                      {editActive ? (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={flowDetailUnitPrices[key] ?? ''}
                          onChange={e => setLineUnitPrice(key, e.target.value)}
                          className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="font-bold text-slate-600">
                          {lineRec?.unitPrice != null && Number.isFinite(Number(lineRec.unitPrice))
                            ? `¥${Number(lineRec.unitPrice).toFixed(2)}`
                            : '—'}
                        </span>
                      )}
                    </td>
                  ) : null}
                  {isReceiveDoc && showOutsourceAmount ? (
                    <td className="py-2.5 px-3 text-right align-middle font-black text-indigo-600">¥{lineAmount.toFixed(2)}</td>
                  ) : null}
                  {showWeightCol ? (
                    <td className="py-2.5 px-3 text-right align-middle">
                      {!nodeUsesWeightRow(lineRecords[0]?.nodeId) ? (
                        <span className="text-xs font-bold tabular-nums text-slate-600">—</span>
                      ) : editActive ? (
                        <input
                          type="number"
                          min={0}
                          step={0.0001}
                          value={
                            flowDetailLineWeights[key] != null && Number.isFinite(flowDetailLineWeights[key])
                              ? flowDetailLineWeights[key] === 0
                                ? ''
                                : flowDetailLineWeights[key]
                              : ''
                          }
                          onChange={e => {
                            const raw = e.target.value.trim();
                            if (raw === '') {
                              setFlowDetailLineWeights(prev => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                              return;
                            }
                            const n = parseFloat(raw);
                            if (!Number.isFinite(n) || n < 0) return;
                            setFlowDetailLineWeights(prev => ({ ...prev, [key]: n }));
                          }}
                          placeholder="kg"
                          title="本行交货总重量 (kg)"
                          className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <span className="text-xs font-bold tabular-nums text-slate-600">
                          {formatLineWeightKg(lineRecords.reduce((s, r) => s + (Number(r.weight) || 0), 0))}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </div>
    </div>

      {detailImagePreviewUrl && (
        <div
          className="fixed inset-0 z-[100] flex animate-in fade-in items-center justify-center bg-black/80 p-4"
          onClick={() => setDetailImagePreviewUrl(null)}
          role="presentation"
        >
          <img
            src={detailImagePreviewUrl}
            alt="产品图片"
            className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setDetailImagePreviewUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white transition-all hover:bg-white/30"
            aria-label="关闭"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
  </>
  );
};

export default React.memo(OutsourceFlowDocumentDetailModal);
