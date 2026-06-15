import React, { useCallback, useState } from 'react';
import { FileDown, Plus, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { buildPrintListRowsFromItemCodes, type ItemCodePrintContext } from '../../utils/printItemCodeRows';
import { buildVirtualBatchPrintRow } from '../../utils/printVirtualBatch';
import { mergeTenantPrintContext } from '../../utils/mergeTenantPrintContext';
import { buildPlanPrintPdfFilename } from '../../utils/printDocumentTitle';
import { formatBatchSerialLabel, formatItemCodeSerialLabelFromCode } from '../../utils/serialLabels';
import { AppDictionaries, ItemCode, PlanOrder, PlanVirtualBatch, PrintTemplate, Product, ProductionOrder } from '../../types';

interface PlanPrintOverlaysProps {
  plan: PlanOrder | null;
  product: Product | null;
  products: Product[];
  dictionaries: AppDictionaries;
  orders: ProductionOrder[];
  labelPrintPickerTemplates: PrintTemplate[];
  labelPrintPickerHasWhitelist: boolean;
  onOpenLabelPrintConfig: () => void;
  onPrintRun: (run: { template: PrintTemplate; plan: PlanOrder } | null) => void;
  virtualBatches: PlanVirtualBatch[];
  itemCodePrintOpen: boolean;
  setItemCodePrintOpen: (open: boolean) => void;
  itemCodePrintPlan: PlanOrder | null;
  setItemCodePrintPlan: (plan: PlanOrder | null) => void;
  itemCodePrintCodes: ItemCode[];
  itemCodePrintLoading: boolean;
  batchBulkPrintOpen: boolean;
  setBatchBulkPrintOpen: (open: boolean) => void;
  itemCodeSinglePrintModal: { plan: PlanOrder; code: ItemCode } | null;
  setItemCodeSinglePrintModal: (modal: { plan: PlanOrder; code: ItemCode } | null) => void;
  batchPrintModal: { plan: PlanOrder; batch: PlanVirtualBatch } | null;
  setBatchPrintModal: (modal: { plan: PlanOrder; batch: PlanVirtualBatch } | null) => void;
}

const LabelPrintTemplateEmptyState: React.FC<{
  hasWhitelist: boolean;
  onAddTemplate: () => void;
}> = ({ hasWhitelist, onAddTemplate }) => (
  <div className="px-2 py-2">
    <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
      <p className="text-xs leading-relaxed text-slate-500">
        {hasWhitelist
          ? '已加入的可选模版在当前列表中均不可用，或模版已被删除。请在「表单配置 → 打印模版」中调整。'
          : '请先在「表单配置 → 打印模版」中为「标签打印」增加模版并加入可选列表后，再在此处打印。'}
      </p>
      <button
        type="button"
        onClick={onAddTemplate}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" />
        增加打印模版
      </button>
    </div>
  </div>
);

const PlanPrintOverlays: React.FC<PlanPrintOverlaysProps> = ({
  plan,
  product,
  products,
  dictionaries,
  orders,
  labelPrintPickerTemplates,
  labelPrintPickerHasWhitelist,
  onOpenLabelPrintConfig,
  onPrintRun,
  virtualBatches,
  itemCodePrintOpen,
  setItemCodePrintOpen,
  itemCodePrintPlan,
  setItemCodePrintPlan,
  itemCodePrintCodes,
  itemCodePrintLoading,
  batchBulkPrintOpen,
  setBatchBulkPrintOpen,
  itemCodeSinglePrintModal,
  setItemCodeSinglePrintModal,
  batchPrintModal,
  setBatchPrintModal,
}) => {
  const { tenantCtx } = useAuth();
  const [itemCodePdfExportingId, setItemCodePdfExportingId] = useState<string | null>(null);

  const buildItemCodeLabelRows = useCallback(
    (pickerPlan: PlanOrder) => {
      const pickerProduct = products.find(p => p.id === pickerPlan.productId);
      const orders2 = (orders ?? []).filter((o: ProductionOrder) => o.planOrderId === pickerPlan.id);
      const ctx2: ItemCodePrintContext = {
        planNumber: pickerPlan.planNumber,
        productName: pickerProduct?.name ?? '',
        orderNumbers: orders2.map(o => o.orderNumber),
        variants: pickerProduct?.variants ?? [],
      };
      const rows = buildPrintListRowsFromItemCodes(
        itemCodePrintCodes,
        ctx2,
        dictionaries,
        window.location.origin,
      );
      return { pickerProduct, rows };
    },
    [products, orders, itemCodePrintCodes, dictionaries],
  );

  return (
    <>
      {itemCodePrintOpen && itemCodePrintPlan && (() => {
        const pickerPlan = itemCodePrintPlan;

        const handleItemCodeTemplatePick = (t: PrintTemplate) => {
          if (itemCodePrintCodes.length === 0) {
            toast.error('没有可打印的单品码');
            return;
          }
          const { rows } = buildItemCodeLabelRows(pickerPlan);
          onPrintRun({
            template: t,
            plan: { ...pickerPlan, _printListRows: rows, _labelPerRow: true } as any,
          });
          setItemCodePrintOpen(false);
          setItemCodePrintPlan(null);
        };

        const handleItemCodeExportPdf = async (t: PrintTemplate) => {
          if (itemCodePrintCodes.length === 0) {
            toast.error('没有可导出的单品码');
            return;
          }
          if (itemCodePdfExportingId) return;
          const { pickerProduct, rows } = buildItemCodeLabelRows(pickerPlan);
          setItemCodePdfExportingId(t.id);
          const toastId = 'item-code-pdf-export';
          toast.loading(`正在生成 PDF（0/${rows.length}）…`, { id: toastId });
          try {
            const { exportPrintLabelsPdf } = await import('../../utils/exportPrintLabelsPdf');
            await exportPrintLabelsPdf({
              template: t,
              ctx: mergeTenantPrintContext(
                {
                  plan: pickerPlan,
                  product: pickerProduct,
                  printListRows: rows,
                  labelPerRow: true,
                },
                tenantCtx?.tenantName,
              ),
              filename: buildPlanPrintPdfFilename(pickerPlan.planNumber, pickerProduct?.name, '单品码标签'),
              onProgress: (done, total) => {
                toast.loading(`正在生成 PDF（${done}/${total}）…`, { id: toastId });
              },
            });
            toast.success('PDF 已下载到本地', { id: toastId });
          } catch (err) {
            console.error('[item-code-pdf-export]', err);
            const msg = err instanceof Error ? err.message : '';
            toast.error(msg ? `导出 PDF 失败：${msg}` : '导出 PDF 失败，请稍后重试', { id: toastId });
          } finally {
            setItemCodePdfExportingId(null);
          }
        };

        return (
          <div className="fixed inset-0 z-[72] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              aria-label="关闭"
              onClick={() => {
                setItemCodePrintOpen(false);
                setItemCodePrintPlan(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">打印单品码标签</h3>
                  <p className="mt-0.5 text-xs text-slate-500">计划单 {pickerPlan.planNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setItemCodePrintOpen(false);
                    setItemCodePrintPlan(null);
                  }}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-slate-100 px-5 py-4">
                {itemCodePrintLoading ? (
                  <div className="text-center py-2 text-xs text-slate-400">加载中...</div>
                ) : itemCodePrintCodes.length === 0 ? (
                  <div className="text-center py-2 text-xs text-slate-400">
                    暂无单品码；请在计划详情「追溯码」中选择「单品码+批次码」并生成批次后自动创建。
                  </div>
                ) : (
                  <p className="text-[11px] leading-snug text-slate-500">
                    共{' '}
                    <span className="font-black text-indigo-600">{itemCodePrintCodes.length}</span> 条有效单品码，各 1
                    张，合计{' '}
                    <span className="font-black text-indigo-600">{itemCodePrintCodes.length}</span> 张。导出 PDF 为矢量生成，通常比浏览器批量打印更快。
                  </p>
                )}
              </div>

              <div className="max-h-[min(40vh,280px)] overflow-y-auto">
                {labelPrintPickerTemplates.length === 0 ? (
                  <LabelPrintTemplateEmptyState
                    hasWhitelist={labelPrintPickerHasWhitelist}
                    onAddTemplate={onOpenLabelPrintConfig}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 p-2">
                  {labelPrintPickerTemplates.map(t => (
                    <li key={t.id}>
                      <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50/80">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-800">{t.name}</div>
                          <div className="mt-0.5 text-xs font-bold text-indigo-600">
                            {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleItemCodeTemplatePick(t)}
                            disabled={itemCodePdfExportingId != null}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            打印
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleItemCodeExportPdf(t)}
                            disabled={itemCodePdfExportingId != null}
                            className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            {itemCodePdfExportingId === t.id ? '导出中…' : '导出 PDF'}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {batchBulkPrintOpen && plan && (() => {
        const activeBatches = virtualBatches.filter(b => b.status === 'ACTIVE');

        const buildRowForBatch = (batch: PlanVirtualBatch) => {
          const variant = batch.variantId ? product?.variants.find(v => v.id === batch.variantId) : null;
          const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
          const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
          const variantLabel = variant
            ? [color?.name, size?.name].filter(Boolean).join('-') || variant.skuSuffix || ''
            : '';
          const orders2 = (orders ?? []).filter((o: ProductionOrder) => o.planOrderId === plan.id);
          return buildVirtualBatchPrintRow(
            batch,
            {
              planNumber: plan.planNumber,
              productName: product?.name ?? '',
              sku: product?.sku ?? '',
              orderNumbers: orders2.map(o => o.orderNumber).filter(Boolean).join(', '),
              variantLabel,
              colorName: color?.name ?? '',
              sizeName: size?.name ?? '',
            },
            window.location.origin,
          );
        };

        const pickTemplate = (t: PrintTemplate) => {
          if (activeBatches.length === 0) {
            toast.error('没有可打印的有效批次码');
            return;
          }
          const rows = activeBatches.map(buildRowForBatch);
          onPrintRun({
            template: t,
            plan: { ...plan, _virtualBatchRows: rows, _labelPerVirtualBatch: true } as any,
          });
          setBatchBulkPrintOpen(false);
        };

        const closeBulk = () => {
          setBatchBulkPrintOpen(false);
        };

        return (
          <div className="fixed inset-0 z-[73] flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" aria-label="关闭" onClick={closeBulk} />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">打印批次码</h3>
                  <p className="mt-0.5 text-xs text-slate-500">计划单 {plan.planNumber}</p>
                </div>
                <button type="button" onClick={closeBulk} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="border-b border-slate-100 px-5 py-4">
                {activeBatches.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-400">没有可打印的有效批次码</p>
                ) : (
                  <p className="text-[11px] leading-snug text-slate-500">
                    共{' '}
                    <span className="font-black text-indigo-600">{activeBatches.length}</span> 条有效批次码，各 1
                    张，合计{' '}
                    <span className="font-black text-indigo-600">{activeBatches.length}</span> 张。不含已作废。
                  </p>
                )}
              </div>

              <div className="max-h-[min(40vh,280px)] overflow-y-auto">
                {labelPrintPickerTemplates.length === 0 ? (
                  <LabelPrintTemplateEmptyState
                    hasWhitelist={labelPrintPickerHasWhitelist}
                    onAddTemplate={onOpenLabelPrintConfig}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 p-2">
                  {labelPrintPickerTemplates.map(t => (
                    <li key={t.id}>
                      <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50/80">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-800">{t.name}</div>
                          <div className="mt-0.5 text-xs font-bold text-indigo-600">
                            {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => pickTemplate(t)}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          打印
                        </button>
                      </div>
                    </li>
                  ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {itemCodeSinglePrintModal && (() => {
        const { plan: modalPlan, code } = itemCodeSinglePrintModal;
        const modalProduct = products.find(p => p.id === modalPlan.productId);
        const variant = code.variantId ? modalProduct?.variants.find(v => v.id === code.variantId) : null;
        const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
        const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
        const variantLabel = [color?.name, size?.name].filter(Boolean).join('-') || variant?.skuSuffix || '';
        const pickTemplate = (t: PrintTemplate) => {
          const orders2 = (orders ?? []).filter((o: ProductionOrder) => o.planOrderId === modalPlan.id);
          const ctx2: ItemCodePrintContext = {
            planNumber: modalPlan.planNumber,
            productName: modalProduct?.name ?? '',
            orderNumbers: orders2.map(o => o.orderNumber),
            variants: modalProduct?.variants ?? [],
          };
          const rows = buildPrintListRowsFromItemCodes([code], ctx2, dictionaries, window.location.origin);
          onPrintRun({ template: t, plan: { ...modalPlan, _printListRows: rows, _labelPerRow: true } as any });
          setItemCodeSinglePrintModal(null);
        };
        return (
          <div className="fixed inset-0 z-[73] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              aria-label="关闭"
              onClick={() => setItemCodeSinglePrintModal(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">打印单品码标签</h3>
                  <p className="mt-0.5 text-xs text-slate-500 break-all">
                    {formatItemCodeSerialLabelFromCode(modalPlan.planNumber, code)}
                    {variantLabel ? ` · ${variantLabel}` : ''}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                    共 <span className="font-black text-indigo-600">1</span> 张单品码标签。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setItemCodeSinglePrintModal(null)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[min(40vh,280px)] overflow-y-auto">
                {labelPrintPickerTemplates.length === 0 ? (
                  <LabelPrintTemplateEmptyState
                    hasWhitelist={labelPrintPickerHasWhitelist}
                    onAddTemplate={onOpenLabelPrintConfig}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 p-2">
                  {labelPrintPickerTemplates.map(t => (
                    <li key={t.id}>
                      <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50/80">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-800">{t.name}</div>
                          <div className="mt-0.5 text-xs font-bold text-indigo-600">
                            {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => pickTemplate(t)}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          打印
                        </button>
                      </div>
                    </li>
                  ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {batchPrintModal && (() => {
        const { plan: modalPlan, batch } = batchPrintModal;
        const modalProduct = products.find(p => p.id === modalPlan.productId);
        const variant = batch.variantId ? modalProduct?.variants.find(v => v.id === batch.variantId) : null;
        const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
        const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
        const variantLabel = variant
          ? [color?.name, size?.name].filter(Boolean).join('-') || variant.skuSuffix || ''
          : '';
        const pickTemplate = (t: PrintTemplate) => {
          const orders2 = (orders ?? []).filter((o: ProductionOrder) => o.planOrderId === modalPlan.id);
          const vbRow = buildVirtualBatchPrintRow(
            batch,
            {
              planNumber: modalPlan.planNumber,
              productName: modalProduct?.name ?? '',
              sku: modalProduct?.sku ?? '',
              orderNumbers: orders2.map(o => o.orderNumber).filter(Boolean).join(', '),
              variantLabel,
              colorName: color?.name ?? '',
              sizeName: size?.name ?? '',
            },
            window.location.origin,
          );
          onPrintRun({ template: t, plan: { ...modalPlan, _virtualBatch: vbRow } as any });
          setBatchPrintModal(null);
        };
        return (
          <div className="fixed inset-0 z-[73] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              aria-label="关闭"
              onClick={() => setBatchPrintModal(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">打印批次标签</h3>
                  <p className="mt-0.5 text-xs text-slate-500 break-all">
                    {batch.sequenceNo != null ? formatBatchSerialLabel(modalPlan.planNumber, batch.sequenceNo) : '—'} · {batch.quantity} 件{variantLabel ? ` · ${variantLabel}` : ''}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
                    共 <span className="font-black text-indigo-600">1</span> 张批次标签。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchPrintModal(null)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[min(40vh,280px)] overflow-y-auto">
                {labelPrintPickerTemplates.length === 0 ? (
                  <LabelPrintTemplateEmptyState
                    hasWhitelist={labelPrintPickerHasWhitelist}
                    onAddTemplate={onOpenLabelPrintConfig}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 p-2">
                  {labelPrintPickerTemplates.map(t => (
                    <li key={t.id}>
                      <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50/80">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-800">{t.name}</div>
                          <div className="mt-0.5 text-xs font-bold text-indigo-600">
                            {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => pickTemplate(t)}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          打印
                        </button>
                      </div>
                    </li>
                  ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
};

export default PlanPrintOverlays;
