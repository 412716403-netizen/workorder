import React, { useState, useMemo, useCallback } from 'react';
import { X, Check, Pencil, Trash2, FileText, Layers } from 'lucide-react';
import {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  ReworkFormSettings,
  PrintTemplate,
  PrintRenderContext,
} from '../../types';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { groupProductionOpBatchByVariant, mapGroupedOpQuantitiesToRecordIds } from '../../utils/groupProductionOpBatchByVariant';
import { hasOpsPerm } from './types';
import { formatTimestamp, timestampFromDatetimeLocal, nowTimestamp } from '../../utils/formatTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import { PlanFormCustomFieldInput, PlanFormCustomFieldReadonly } from '../../components/PlanFormCustomFieldControls';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildDefectTreatmentPrintContext } from '../../utils/buildReworkDefectTreatmentPrintContext';
import { readDefectTreatmentCustomSnapshot, DEFECT_TREATMENT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import {
  sectionTitleClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormDetailSplitClass,
  psiOrderBillFormGridGapClass,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillFormFieldControlClass,
} from '../../styles/uiDensity';

export interface DefectTreatmentFlowDetailModalProps {
  productionLinkMode: 'order' | 'product';
  defectFlowDetailRecord: ProductionOpRecord;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  categories?: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  userPermissions?: string[];
  tenantRole?: string;
  reworkFormSettings?: ReworkFormSettings;
  printTemplates?: PrintTemplate[];
  onOpenReworkFormPrintTab?: () => void;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  onClose: () => void;
}

const DefectTreatmentFlowDetailModal: React.FC<DefectTreatmentFlowDetailModalProps> = ({
  productionLinkMode,
  defectFlowDetailRecord,
  records,
  orders,
  products,
  categories = [],
  globalNodes,
  dictionaries,
  userPermissions,
  tenantRole,
  reworkFormSettings,
  printTemplates = [],
  onOpenReworkFormPrintTab,
  onUpdateRecord,
  onDeleteRecord,
  onClose,
}) => {
  const confirm = useConfirm();
  const r = defectFlowDetailRecord;
  const matchScope = (x: ProductionOpRecord) =>
    productionLinkMode === 'product' ? x.productId === r.productId : x.orderId === r.orderId;
  const detailBatch = r.type === 'REWORK' && r.docNo
    ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'REWORK' && matchScope(x) && x.docNo === r.docNo)
    : r.type === 'SCRAP' && r.docNo
      ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'SCRAP' && matchScope(x) && x.docNo === r.docNo)
      : [r];
  const first = detailBatch[0];

  const [editing, setEditing] = useState<{
    form: {
      timestamp: string;
      operator: string;
      reason: string;
      customData: Record<string, unknown>;
      rowEdits: { variantId: string; label: string; quantity: number; recordIds: string[] }[];
    };
    firstRecord: ProductionOpRecord;
  } | null>(null);

  const order = first ? orders.find(o => o.id === first.orderId) : undefined;
  const product = first ? products.find(p => p.id === first.productId) : undefined;
  const productCategory = product ? categories.find(c => c.id === product.categoryId) : undefined;
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
  const sourceNodeId = first ? (first.type === 'REWORK' ? (first.sourceNodeId ?? first.nodeId) : first.nodeId) : undefined;
  const sourceNodeName = sourceNodeId ? globalNodes.find(n => n.id === sourceNodeId)?.name ?? sourceNodeId : '—';
  const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const hasColorSize = productHasColorSizeMatrix(product, productCategory);
  const typeLabel = first?.type === 'REWORK' ? '返工' : '报损';

  const displayVariantRows = useMemo(
    () => (first ? groupProductionOpBatchByVariant(detailBatch, product) : []),
    [detailBatch, product, first],
  );
  const defectDetailMatrixProduct = useMemo(
    () =>
      product && product.variants?.length
        ? ({ ...product, colorIds: undefined, sizeIds: undefined } as Product)
        : null,
    [product],
  );
  const variantQtyFromDisplayRows = useMemo(() => {
    const m: Record<string, number> = {};
    displayVariantRows.forEach(r => {
      if (r.variantId) m[r.variantId] = r.quantity;
    });
    return m;
  }, [displayVariantRows]);
  const undiffDisplayRow = useMemo(
    () => displayVariantRows.find(r => !r.variantId) ?? null,
    [displayVariantRows],
  );
  const latestBatchTimestamp = detailBatch.reduce(
    (best: { t: number; ts?: string }, x) => {
      const t = new Date(x.timestamp || 0).getTime();
      if (isNaN(t)) return best;
      return t >= best.t ? { t, ts: x.timestamp } : best;
    },
    { t: -1 },
  ).ts;
  const opsInBatch = [...new Set(detailBatch.map(x => (x.operator ?? '').trim()).filter(Boolean))];
  const operatorsLabel = opsInBatch.length === 0 ? '—' : opsInBatch.length === 1 ? opsInBatch[0]! : `${opsInBatch[0]} 等${opsInBatch.length}人`;

  const defectFieldsForDetail = useMemo(
    () => (reworkFormSettings?.defectTreatmentCustomFields ?? []).filter(f => f.showInDetail),
    [reworkFormSettings?.defectTreatmentCustomFields],
  );
  const defectCustomSnapshot = useMemo(
    () => readDefectTreatmentCustomSnapshot(records, first?.docNo),
    [records, first?.docNo],
  );

  const buildPrintContext = useCallback(
    (template: PrintTemplate): PrintRenderContext =>
      buildDefectTreatmentPrintContext(template, {
        productionLinkMode,
        detailBatch,
        records,
        orders,
        products,
        globalNodes,
        dictionaries,
      }),
    [productionLinkMode, detailBatch, records, orders, products, globalNodes, dictionaries],
  );

  if (!first) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            {productionLinkMode === 'product'
              ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
              : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
            }
            处理不良品详情
          </h3>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" onClick={() => {
                  if (!onUpdateRecord || !editing) return;
                  const tsStr = editing.form.timestamp ? timestampFromDatetimeLocal(editing.form.timestamp) : nowTimestamp();
                  const newQtyByRecordId = mapGroupedOpQuantitiesToRecordIds(detailBatch, editing.form.rowEdits);
                  const cleanCustom = Object.fromEntries(
                    Object.entries(editing.form.customData).filter(([, v]) => v !== '' && v != null && v !== undefined),
                  );
                  detailBatch.forEach(rec => {
                    const newQty = newQtyByRecordId.get(rec.id);
                    if (newQty === undefined) return;
                    const prevCd = (rec as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
                    onUpdateRecord({
                      ...rec,
                      quantity: newQty,
                      timestamp: tsStr,
                      operator: editing.form.operator,
                      reason: editing.form.reason || undefined,
                      collabData: { ...prevCd, [DEFECT_TREATMENT_CUSTOM_DATA_KEY]: cleanCustom },
                    });
                  });
                  setEditing(null); onClose();
                }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"><Check className="w-4 h-4" /> 保存</button>
              </>
            ) : (
              <>
                <OrderCenterDetailPrintBlock
                  printSlot={reworkFormSettings?.reworkCenterPrint?.defectTreatmentFlowDetail}
                  printTemplates={printTemplates}
                  buildContext={buildPrintContext}
                  onAddPrintTemplate={onOpenReworkFormPrintTab}
                  pickerSubtitle={`处理不良流水 ${first.docNo ?? '—'}`}
                />
                {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:edit') && (
                  <button type="button" onClick={() => { const rec = detailBatch[0]; let dt = new Date(rec.timestamp || undefined); if (isNaN(dt.getTime())) dt = new Date(); const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`; const snap = { ...defectCustomSnapshot }; setEditing({ firstRecord: rec, form: { timestamp: tsStr, operator: rec.operator ?? '', reason: rec.reason ?? '', customData: snap, rowEdits: groupProductionOpBatchByVariant(detailBatch, product).map(g => ({ variantId: g.variantId, label: g.label, quantity: g.quantity, recordIds: [...g.recordIds] })) } }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"><Pencil className="w-4 h-4" /> 编辑</button>
                )}
                {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:delete') && (
                  <button type="button" onClick={() => { void confirm({ message: '确定删除该记录？', danger: true }).then((ok) => { if (!ok) return; detailBatch.forEach(x => onDeleteRecord(x.id)); onClose(); }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100"><Trash2 className="w-4 h-4" /> 删除</button>
                )}
              </>
            )}
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {hasColorSize ? <h2 className="text-xl font-bold text-slate-900">{product?.name ?? first.productId ?? '—'}</h2> : null}
          {editing ? (
            <div className={psiOrderBillFormSectionStackClass}>
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>1. 基础信息</h3>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">时间</label>
                    <input type="datetime-local" value={editing.form.timestamp} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)} className={psiOrderBillFormFieldControlClass} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">操作人</label>
                    <input type="text" value={editing.form.operator} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)} className={psiOrderBillFormFieldControlClass} placeholder="操作人" />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">原因/备注</label>
                    <input type="text" value={editing.form.reason} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)} className={psiOrderBillFormFieldControlClass} placeholder="选填" />
                  </div>
                </div>
              </div>
              {defectFieldsForDetail.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                    <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                    <h3 className={sectionTitleClass}>3. 备注与扩展</h3>
                  </div>
                  {defectFieldsForDetail.map(cf => (
                    <div key={cf.id} className="space-y-1">
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                      <PlanFormCustomFieldInput
                        cf={cf}
                        value={editing.form.customData[cf.id]}
                        onChange={v =>
                          setEditing(prev =>
                            prev ? { ...prev, form: { ...prev.form, customData: { ...prev.form.customData, [cf.id]: v } } } : prev,
                          )
                        }
                        dictionaries={dictionaries}
                        controlClassName={psiOrderBillFormFieldControlClass}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className={psiOrderBillFormDetailSplitClass}>
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconEmeraldClass}><Layers className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>2. 数量明细</h3>
                </div>
                {hasColorSize && defectDetailMatrixProduct && dictionaries ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                    {editing.form.rowEdits.some(r => !r.variantId) ? (
                      <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-3 space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格</label>
                        <div className="flex flex-wrap items-end gap-2">
                          <input
                            type="number"
                            min={0}
                            value={
                              (editing.form.rowEdits.find(r => !r.variantId)?.quantity ?? 0) === 0
                                ? ''
                                : editing.form.rowEdits.find(r => !r.variantId)?.quantity
                            }
                            onChange={e => {
                              const v = Math.max(0, Number(e.target.value) || 0);
                              setEditing(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      form: {
                                        ...prev.form,
                                        rowEdits: prev.form.rowEdits.map(re =>
                                          !re.variantId ? { ...re, quantity: v } : re,
                                        ),
                                      },
                                    }
                                  : prev,
                              );
                            }}
                            className={`${psiOrderBillFormFieldControlClass} max-w-[8rem] text-indigo-600 font-bold`}
                            placeholder="0"
                          />
                          <span className="pb-2 text-[10px] font-medium text-slate-500">{unitName}</span>
                        </div>
                      </div>
                    ) : null}
                    {(() => {
                      const vars = (product?.variants ?? []).filter(v =>
                        editing.form.rowEdits.some(r => r.variantId === v.id),
                      );
                      if (vars.length === 0) return null;
                      const matrixProd = { ...product!, variants: vars, colorIds: undefined, sizeIds: undefined } as Product;
                      return (
                        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                          <VariantQtyMatrixInputs
                            product={matrixProd}
                            dictionaries={dictionaries}
                            quantities={Object.fromEntries(
                              vars.map(v => {
                                const row = editing.form.rowEdits.find(r => r.variantId === v.id);
                                return [v.id, row?.quantity ?? 0];
                              }),
                            )}
                            onVariantQtyChange={(variantId, qty) => {
                              const next = Math.max(0, qty);
                              setEditing(prev =>
                                prev
                                  ? {
                                      ...prev,
                                      form: {
                                        ...prev.form,
                                        rowEdits: prev.form.rowEdits.map(re =>
                                          re.variantId === variantId ? { ...re, quantity: next } : re,
                                        ),
                                      },
                                    }
                                  : prev,
                              );
                            }}
                            inputClassName="h-11 w-[3.25rem] shrink-0 rounded-xl border border-slate-200 bg-white px-2 text-left text-sm font-bold text-indigo-600 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                          />
                        </div>
                      );
                    })()}
                    <div className="flex justify-end rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm font-bold text-indigo-700 tabular-nums">
                      合计 {editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {hasColorSize ? (
                            <>
                              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">规格</th>
                              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                            </>
                          ) : (
                            <>
                              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">产品</th>
                              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {editing.form.rowEdits.map(rowEdit => (
                          <tr key={rowEdit.variantId || '_none'} className="border-b border-slate-100">
                            {hasColorSize ? (
                              <td className="px-3 py-2.5 sm:px-4 text-slate-800">{rowEdit.label}</td>
                            ) : (
                              <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[14rem]">
                                <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={product?.name ?? first.productId ?? '—'}>
                                  {product?.name ?? first.productId ?? '—'}
                                </span>
                                {productionLinkMode !== 'product' && order?.orderNumber ? (
                                  <span className="mt-0.5 block text-[10px] sm:text-[11px] font-medium text-slate-500 truncate">
                                    工单 <span className="font-bold text-slate-600 tabular-nums">{order.orderNumber}</span>
                                  </span>
                                ) : null}
                              </td>
                            )}
                            <td className="px-3 py-2.5 sm:px-4 text-right align-middle">
                              <input
                                type="number"
                                min={0}
                                value={rowEdit.quantity === 0 ? '' : rowEdit.quantity}
                                onChange={e => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  setEditing(prev =>
                                    prev
                                      ? {
                                          ...prev,
                                          form: {
                                            ...prev.form,
                                            rowEdits: prev.form.rowEdits.map(re =>
                                              re.variantId === rowEdit.variantId ? { ...re, quantity: v } : re,
                                            ),
                                          },
                                        }
                                      : prev,
                                  );
                                }}
                                className="h-11 w-[6.5rem] inline-block rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                                placeholder="0"
                              />
                              <span className="text-[10px] font-medium text-slate-500 ml-1 tabular-nums">{unitName}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                          <td className="px-3 py-2.5 sm:px-4">合计</td>
                          <td className="px-3 py-2.5 sm:px-4 text-indigo-600 text-right tabular-nums">{editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className={psiOrderBillFormSectionStackClass}>
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>1. 基础信息</h3>
                </div>
              <div
                className={
                  hasColorSize
                    ? 'flex flex-wrap gap-4'
                    : `grid grid-cols-2 ${psiOrderBillFormGridGapClass} rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:grid-cols-3 sm:px-4`
                }
              >
                {!hasColorSize && (
                  <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">产品</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={product?.name ?? first.productId ?? '—'}>{product?.name ?? first.productId ?? '—'}</p>
                  </div>
                )}
                <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">类型</p>
                  <p className="text-xs sm:text-sm font-bold text-slate-800">{typeLabel}</p>
                </div>
                <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">来源工序</p>
                  <p className="text-xs sm:text-sm font-bold text-slate-800">{sourceNodeName}</p>
                </div>
                <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">数量</p>
                  <p className="text-xs sm:text-sm font-bold text-indigo-600 tabular-nums">{totalQty} {unitName}</p>
                </div>
                <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">时间</p>
                  <p className="text-xs sm:text-sm font-bold text-slate-800">{formatTimestamp(latestBatchTimestamp)}</p>
                </div>
                <div className={`min-w-0 max-w-full ${hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}`}>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">操作人</p>
                  <p className="text-xs sm:text-sm font-bold text-slate-800 break-words" title={operatorsLabel}>{operatorsLabel}</p>
                </div>
                {productionLinkMode !== 'product' && order?.orderNumber && !hasColorSize ? (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">工单号</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 tabular-nums">{order.orderNumber}</p>
                  </div>
                ) : null}
                {first.reason && (
                  <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : 'col-span-2 sm:col-span-3'}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">原因/备注</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-800">{first.reason}</p>
                  </div>
                )}
              </div>
              </div>
              {defectFieldsForDetail.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                    <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                    <div className="space-y-1">
                      <h4 className={sectionTitleClass}>3. 备注与扩展</h4>
                      <p className="text-[11px] font-bold text-slate-500">自定义单据内容（本批次共用）</p>
                    </div>
                  </div>
                  {defectFieldsForDetail.map(cf => (
                    <div key={cf.id} className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</p>
                      <PlanFormCustomFieldReadonly cf={cf} value={defectCustomSnapshot[cf.id]} />
                    </div>
                  ))}
                </div>
              )}
              {(displayVariantRows.length > 1 || hasColorSize || displayVariantRows.some(v => v.recordIds.length > 1)) && (
                <div className={psiOrderBillFormDetailSplitClass}>
                  <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                    <div className={psiOrderBillFormSectionIconEmeraldClass}><Layers className="w-4 h-4" /></div>
                    <h3 className={sectionTitleClass}>2. 数量明细</h3>
                  </div>
                  {hasColorSize && defectDetailMatrixProduct && dictionaries ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                      {undiffDisplayRow ? (
                        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格</p>
                          <p className="text-lg font-bold text-indigo-600 tabular-nums">{undiffDisplayRow.quantity} {unitName}</p>
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                        <VariantQtyMatrixInputs
                          readOnly
                          product={defectDetailMatrixProduct}
                          dictionaries={dictionaries}
                          quantities={variantQtyFromDisplayRows}
                        />
                      </div>
                      <div className="flex justify-end rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm font-bold text-indigo-700 tabular-nums">
                        合计 {totalQty} {unitName}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            {hasColorSize ? (
                              <>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                              </>
                            ) : (
                              <>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">产品</th>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {displayVariantRows.map(vr => (
                            <tr key={vr.variantId || '_none'} className="border-b border-slate-100">
                              {hasColorSize ? (
                                <td className="px-3 py-2.5 sm:px-4 text-slate-800">{vr.label}</td>
                              ) : (
                                <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[14rem]">
                                  <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={product?.name ?? first.productId ?? '—'}>
                                    {product?.name ?? first.productId ?? '—'}
                                  </span>
                                  {productionLinkMode !== 'product' && order?.orderNumber ? (
                                    <span className="mt-0.5 block text-[10px] sm:text-[11px] font-medium text-slate-500 truncate">
                                      工单 <span className="font-bold text-slate-600 tabular-nums">{order.orderNumber}</span>
                                    </span>
                                  ) : null}
                                </td>
                              )}
                              <td className="px-3 py-2.5 sm:px-4 text-sm font-bold text-indigo-600 text-right tabular-nums">{vr.quantity} {unitName}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                            <td className="px-3 py-2.5 sm:px-4">合计</td>
                            <td className="px-3 py-2.5 sm:px-4 text-indigo-600 text-right tabular-nums">{totalQty} {unitName}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
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
};

export default React.memo(DefectTreatmentFlowDetailModal);
