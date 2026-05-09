import React, { useMemo, useState, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, User } from 'lucide-react';
import type {
  MaterialFormSettings,
  PlanListPrintSettings,
  PrintRenderContext,
  PrintTemplate,
  ProductionOpRecord,
  ProductionOrder,
  Product,
  Warehouse,
  AppDictionaries,
} from '../../types';
import { BATCH_NO_UNTAGGED, DEFAULT_MATERIAL_FORM_SETTINGS } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { hasOpsPerm, type StockDocDetail } from './types';
import { formatLocalDateTimeZh, parseProductionOpTimestampMs } from '../../utils/localDateTime';
import {
  DocCustomFieldEditGrid,
  DocCustomFieldInlineReadList,
  DocInlineMetaRow,
  DocSummaryCard,
} from '../../components/doc-modal';
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import {
  buildMaterialStockDocPrintContext,
  materialStockDocPrintSlot,
  readMaterialStockCustomSnapshot,
} from '../../utils/buildMaterialStockDocPrintContext';
import { isOutsourceMaterialPartner, materialStockCustomDataCollabKey } from '../../utils/productionOpCollab/material';
import { psiCustomFieldHasFilledDisplayValue } from '../psi-ops/psiOpsListFormatting';
import { psiOrderBillFormPartnerTriggerClassCompact } from '../../styles/uiDensity';

const stockDocCustomFieldEditControlClass =
  'h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500';

const stockDocWarehouseSelectClass = `${psiOrderBillFormPartnerTriggerClassCompact} rounded-lg border border-slate-200 bg-white px-2 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500`;

function StockDocEditSavePortal({ active, onSave }: { active: boolean; onSave: () => void }) {
  const host = useContext(DocPhaseEditToolbarPortalContext);
  if (!active || !host) return null;
  return createPortal(
    <button
      type="button"
      onClick={onSave}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
    >
      <Check className="w-4 h-4" /> 保存
    </button>,
    host,
  );
}

export interface StockDocDetailModalProps {
  detail: StockDocDetail | null;
  onClose: () => void;
  onDetailChange: (detail: StockDocDetail | null) => void;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries?: AppDictionaries;
  materialFormSettings?: MaterialFormSettings;
  printTemplates?: PrintTemplate[];
  onOpenMaterialFormPrintTab?: () => void;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const StockDocDetailModal: React.FC<StockDocDetailModalProps> = ({
  detail,
  onClose,
  onDetailChange,
  records,
  orders,
  products,
  warehouses,
  dictionaries,
  materialFormSettings = DEFAULT_MATERIAL_FORM_SETTINGS,
  printTemplates = [],
  onOpenMaterialFormPrintTab,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
}) => {
  const { tenantCtx } = useAuth();
  const [stockDocEditForm, setStockDocEditForm] = useState<{
    warehouseId: string;
    lines: { productId: string; quantity: number; batchNo?: string }[];
    reason: string;
    customData: Record<string, unknown>;
  } | null>(null);

  const materialCustomFieldDefsForDetail = useMemo(() => {
    if (!detail) return [];
    const wx = isOutsourceMaterialPartner(detail.partner);
    const raw =
      detail.type === 'STOCK_RETURN'
        ? wx
          ? materialFormSettings.outsourceMaterialReturnCustomFields
          : materialFormSettings.materialReturnCustomFields
        : wx
          ? materialFormSettings.outsourceMaterialIssueCustomFields
          : materialFormSettings.materialIssueCustomFields;
    return (raw ?? []).filter(f => f.showInDetail);
  }, [
    detail,
    materialFormSettings.materialIssueCustomFields,
    materialFormSettings.materialReturnCustomFields,
    materialFormSettings.outsourceMaterialIssueCustomFields,
    materialFormSettings.outsourceMaterialReturnCustomFields,
  ]);

  const materialCustomSnapshot = useMemo(() => {
    if (!detail) return {} as Record<string, unknown>;
    return readMaterialStockCustomSnapshot(records, detail.docNo, detail.type, detail.partner);
  }, [detail, records]);

  const docRecordsForDetail = useMemo(() => {
    if (!detail) return [] as ProductionOpRecord[];
    return records.filter(r => r.docNo === detail.docNo && r.type === detail.type);
  }, [detail, records]);

  if (!detail) return null;

  const stockDocDetail = detail;
  const order = orders.find(o => o.id === stockDocDetail.orderId);
  const sourceProd = stockDocDetail.sourceProductId
    ? products.find(p => p.id === stockDocDetail.sourceProductId)
    : null;
  const warehouse = warehouses.find(w => w.id === stockDocDetail.warehouseId);
  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
  };
  const isReturn = stockDocDetail.type === 'STOCK_RETURN';
  const isEditing = stockDocEditForm !== null;
  const showBatchColumn = stockDocDetail.lines.some(l => Boolean(l.batchNo?.trim()));
  const startEdit = () => {
    const snap = { ...materialCustomSnapshot };
    setStockDocEditForm({
      warehouseId: stockDocDetail.warehouseId,
      lines: stockDocDetail.lines.map(l => ({
        productId: l.productId,
        quantity: l.quantity,
        ...(l.batchNo ? { batchNo: l.batchNo } : {}),
      })),
      reason: stockDocDetail.reason ?? '',
      customData: snap,
    });
  };
  const cancelEdit = () => setStockDocEditForm(null);
  const saveEdit = () => {
    if (!stockDocEditForm || !onUpdateRecord) return;
    const dataKey = materialStockCustomDataCollabKey(
      isReturn ? 'STOCK_RETURN' : 'STOCK_OUT',
      stockDocDetail.partner,
    );
    const cleanCustom = Object.fromEntries(
      Object.entries(stockDocEditForm.customData).filter(([, v]) => v !== '' && v != null && v !== undefined),
    );
    const docRecs = records.filter(r => r.docNo === stockDocDetail.docNo && r.type === stockDocDetail.type);
    docRecs.forEach(rec => {
      const line = stockDocEditForm.lines.find(l => l.productId === rec.productId);
      if (line) {
        const prevCd = (rec as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
        onUpdateRecord({
          ...rec,
          quantity: line.quantity,
          ...(line.batchNo != null && line.batchNo !== ''
            ? { batchNo: line.batchNo }
            : {}),
          warehouseId: stockDocEditForm.warehouseId || undefined,
          reason: stockDocEditForm.reason.trim() || undefined,
          collabData: { ...prevCd, [dataKey]: cleanCustom },
        });
      }
    });
    onDetailChange({
      ...stockDocDetail,
      warehouseId: stockDocEditForm.warehouseId,
      lines: stockDocEditForm.lines,
      reason: stockDocEditForm.reason.trim() || undefined
    });
    setStockDocEditForm(null);
  };
  const handleClose = () => {
    setStockDocEditForm(null);
    onClose();
  };
  const editForm = stockDocEditForm;

  const printSlot: PlanListPrintSettings | undefined = materialStockDocPrintSlot(materialFormSettings, stockDocDetail);

  const businessTimeDisplay = (() => {
    const ms = parseProductionOpTimestampMs(stockDocDetail.timestamp);
    if (ms > 0) return formatLocalDateTimeZh(new Date(ms));
    const raw = stockDocDetail.timestamp?.trim();
    return raw || '—';
  })();

  const operatorLabel = (() => {
    const names = docRecordsForDetail.map(r => r.operator?.trim()).filter((v): v is string => Boolean(v));
    const uniq = [...new Set(names)];
    return uniq.length ? uniq.join('、') : '—';
  })();

  const totalQty = stockDocDetail.lines.reduce((s, l) => s + (l.quantity ?? 0), 0);
  const productTitle =
    sourceProd?.name ??
    (order ? products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—' : '—');
  const summaryUnit = stockDocDetail.lines[0] ? getUnitName(stockDocDetail.lines[0].productId) : '件';

  const deleteMsg = `确定要删除该张${isReturn ? '退料' : '领料'}单的所有记录吗？此操作不可恢复。`;

  return (
    <DocPhaseModal
      zIndexClass="z-[90]"
      open
      phase={isEditing ? 'edit' : 'detail'}
      editingDocNumber={stockDocDetail.docNo || '—'}
      maxWidthClass="max-w-4xl"
      detailTitle={isReturn ? '退料单详情' : '领料单详情'}
      editTitle={isReturn ? '退料单 · 编辑' : '领料单 · 编辑'}
      newTitle=""
      showPrint={false}
      onPrint={() => {}}
      leadingDetailActions={
        !isEditing ? (
          <OrderCenterDetailPrintBlock
            printSlot={printSlot}
            printTemplates={printTemplates}
            onAddPrintTemplate={onOpenMaterialFormPrintTab}
            buildContext={(template: PrintTemplate): PrintRenderContext =>
              buildMaterialStockDocPrintContext(template, {
                detail: stockDocDetail,
                records,
                orders,
                products,
                warehouses,
                dictionaries,
                customSnapshot: materialCustomSnapshot,
                tenantName: tenantCtx?.tenantName,
              })
            }
            pickerSubtitle={`${isReturn ? '退料' : '领料'}单 ${stockDocDetail.docNo}`}
          />
        ) : null
      }
      hasPerm={perm => hasOpsPerm(tenantRole, userPermissions, perm)}
      viewPerm="production:material_records:view"
      editPerm="production:material_records:edit"
      deletePerm={onDeleteRecord ? 'production:material_records:delete' : undefined}
      deleteConfirmMessage={onDeleteRecord ? deleteMsg : ''}
      onDelete={
        onDeleteRecord
          ? async () => {
              const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
              docRecords.forEach(rec => onDeleteRecord(rec.id));
              setStockDocEditForm(null);
              onClose();
            }
          : undefined
      }
      renderDocBadge={() => (
        <>
          {stockDocDetail.partner ? (
            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black tracking-wider shrink-0">
              {stockDocDetail.partner}
            </span>
          ) : null}
          <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">
            {order
              ? order.orderNumber
              : sourceProd?.name ??
                (stockDocDetail.lines[0]
                  ? products.find(p => p.id === stockDocDetail.lines[0].productId)?.name ?? stockDocDetail.docNo
                  : stockDocDetail.docNo)}
          </span>
        </>
      )}
      onClose={handleClose}
      onEnterEdit={() => {
        if (onUpdateRecord) startEdit();
      }}
      onCancelEdit={cancelEdit}
      renderContent={() => (
        <>
          <StockDocEditSavePortal active={isEditing} onSave={saveEdit} />
          <div className="space-y-4 min-h-0">
          {!isEditing ? (
            <>
              <DocSummaryCard
                className="mb-5"
                main={
                  <>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span className="font-black text-slate-800">{productTitle}</span>
                      <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        {stockDocDetail.docNo}
                      </span>
                      <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        {isReturn ? '退料' : '领料'}
                      </span>
                      {warehouse ? (
                        <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm">
                          {isReturn ? '退回仓库' : '出库仓库'}：{warehouse.name}
                          {warehouse.code ? ` (${warehouse.code})` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-bold normal-case text-xs">仓库：—</span>
                      )}
                      {stockDocDetail.partner ? (
                        <span className="font-black text-amber-800 normal-case">{stockDocDetail.partner}</span>
                      ) : null}
                    </div>
                    <DocInlineMetaRow>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="normal-case">{businessTimeDisplay}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="normal-case">经办: {operatorLabel}</span>
                      </span>
                      <DocCustomFieldInlineReadList
                        fields={materialCustomFieldDefsForDetail}
                        values={materialCustomSnapshot}
                        hasFilled={psiCustomFieldHasFilledDisplayValue}
                      />
                    </DocInlineMetaRow>
                    {stockDocDetail.reason?.trim() ? (
                      <p className="text-xs font-bold text-slate-600 normal-case border-t border-slate-200/80 pt-2">
                        备注：{stockDocDetail.reason.trim()}
                      </p>
                    ) : null}
                  </>
                }
                side={
                  <div className="min-w-[6.5rem] md:text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
                    <p className="font-black tabular-nums text-slate-800">
                      {totalQty.toLocaleString()} {summaryUnit}
                    </p>
                  </div>
                }
              />
              <div className="flex-1 overflow-auto">
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                        {showBatchColumn ? (
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-36">批次</th>
                        ) : null}
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockDocDetail.lines.map(({ productId, quantity, batchNo }) => {
                        const prod = products.find(p => p.id === productId);
                        return (
                          <tr key={productId} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                            {showBatchColumn ? (
                              <td className="px-4 py-3 text-sm font-mono font-bold text-slate-700">
                                {batchNo?.trim() || BATCH_NO_UNTAGGED}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 font-bold text-indigo-600 text-right">{quantity}</td>
                            <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <>
              {editForm && (
                <>
                  <DocSummaryCard
                    className="mb-5"
                    main={
                      <>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                          <span className="font-black text-slate-800">{productTitle}</span>
                          <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                            {stockDocDetail.docNo}
                          </span>
                          <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                            {isReturn ? '退料' : '领料'}
                          </span>
                          <div className="min-w-0 max-w-lg flex-1 basis-full sm:basis-auto">
                            <label className="sr-only">{isReturn ? '退回仓库' : '出库仓库'}</label>
                            <select
                              value={editForm.warehouseId}
                              onChange={e => setStockDocEditForm(prev => prev ? { ...prev, warehouseId: e.target.value } : null)}
                              className={stockDocWarehouseSelectClass}
                            >
                              {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <DocInlineMetaRow>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="normal-case">{businessTimeDisplay}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="normal-case">经办: {operatorLabel}</span>
                          </span>
                        </DocInlineMetaRow>
                        <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-3">
                          <div className="min-w-0 space-y-1">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">备注</label>
                            <input
                              type="text"
                              value={editForm.reason}
                              onChange={e => setStockDocEditForm(prev => prev ? { ...prev, reason: e.target.value } : null)}
                              className={stockDocCustomFieldEditControlClass}
                              placeholder="选填"
                            />
                          </div>
                          <DocCustomFieldEditGrid
                            showTopDivider={false}
                            fields={materialCustomFieldDefsForDetail}
                            values={editForm.customData}
                            onChange={(fieldId, v) =>
                              setStockDocEditForm(prev =>
                                prev ? { ...prev, customData: { ...prev.customData, [fieldId]: v } } : null,
                              )
                            }
                            controlClassName={stockDocCustomFieldEditControlClass}
                          />
                        </div>
                      </>
                    }
                    side={
                      <div className="min-w-[6.5rem] md:text-right">
                        <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
                        <p className="font-black tabular-nums text-slate-800">
                          {editForm.lines.reduce((s, l) => s + (l.quantity ?? 0), 0).toLocaleString()} {summaryUnit}
                        </p>
                      </div>
                    }
                  />
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                          {showBatchColumn ? (
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-36">批次</th>
                          ) : null}
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editForm.lines.map(({ productId, quantity, batchNo }) => {
                          const prod = products.find(p => p.id === productId);
                          return (
                            <tr key={productId} className="border-b border-slate-100">
                              <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                              {showBatchColumn ? (
                                <td className="px-4 py-3 text-xs font-mono text-slate-500">{batchNo?.trim() || BATCH_NO_UNTAGGED}</td>
                              ) : null}
                              <td className="px-4 py-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  value={quantity}
                                  onChange={e => {
                                    const v = Number(e.target.value) || 0;
                                    setStockDocEditForm(prev => prev ? {
                                      ...prev,
                                      lines: prev.lines.map(l => l.productId === productId ? { ...l, quantity: v } : l)
                                    } : null);
                                  }}
                                  className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
          </div>
        </>
      )}
    />
  );
};

export default React.memo(StockDocDetailModal);
