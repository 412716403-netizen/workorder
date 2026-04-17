import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Printer, X } from 'lucide-react';
import type { PlanListPrintSettings, PrintRenderContext, PrintTemplate } from '../../types';
import { HiddenPrintSlot, usePrintTemplateAction } from '../print-editor/PrintPreview';
import { createBlankCustomTemplate } from '../../utils/printTemplateDefaults';

export interface OrderCenterDetailPrintBlockProps {
  printSlot?: PlanListPrintSettings;
  printTemplates: PrintTemplate[];
  buildContext: (template: PrintTemplate) => PrintRenderContext;
  /** 选择模版弹窗副标题 */
  pickerSubtitle?: string;
  /** 未配置「已加入可选模版」时：点「增加打印模版」打开工单表单配置（打印页签） */
  onAddPrintTemplate?: () => void;
}

/**
 * 工单中心详情类弹窗：按表单配置显示「打印」、选模版、走统一隐藏打印槽。
 */
export const OrderCenterDetailPrintBlock: React.FC<OrderCenterDetailPrintBlockProps> = ({
  printSlot,
  printTemplates,
  buildContext,
  pickerSubtitle,
  onAddPrintTemplate,
}) => {
  const showBtn = printSlot?.showPrintButton !== false;
  /** 仅当已在表单配置中加入至少一个可选模版 id 时，才列出可选模版；未配置时不列出全部模版 */
  const { pickerTemplates, hasWhitelist } = useMemo(() => {
    const raw = printSlot?.allowedTemplateIds;
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      return { pickerTemplates: [] as PrintTemplate[], hasWhitelist: false };
    }
    const allowedSet = new Set(
      raw.map(x => (x != null && x !== '' ? String(x).trim() : '')).filter(Boolean),
    );
    if (allowedSet.size === 0) {
      return { pickerTemplates: [] as PrintTemplate[], hasWhitelist: false };
    }
    return {
      pickerTemplates: printTemplates.filter(t => allowedSet.has(String(t.id).trim())),
      hasWhitelist: true,
    };
  }, [printTemplates, printSlot?.allowedTemplateIds]);

  const idleTemplate = useMemo(() => createBlankCustomTemplate(80, 60, ' '), []);
  const idleCtx = useMemo<PrintRenderContext>(() => ({}), []);
  const [printRun, setPrintRun] = useState<{ template: PrintTemplate; ctx: PrintRenderContext } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTemplate = printRun?.template ?? idleTemplate;
  const activeCtx = printRun?.ctx ?? idleCtx;
  const { printRef, handlePrint } = usePrintTemplateAction(activeTemplate, activeCtx);
  const handlePrintRef = useRef(handlePrint);
  handlePrintRef.current = handlePrint;

  useEffect(() => {
    if (!printRun) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const maybePromise = handlePrintRef.current();
      if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
        (maybePromise as Promise<void>).finally(() => {
          if (!cancelled) setPrintRun(null);
        });
      } else {
        setTimeout(() => {
          if (!cancelled) setPrintRun(null);
        }, 1000);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [printRun]);

  const handlePick = useCallback(
    (t: PrintTemplate) => {
      setPrintRun({ template: t, ctx: buildContext(t) });
      setPickerOpen(false);
    },
    [buildContext],
  );

  return (
    <>
      <HiddenPrintSlot template={activeTemplate} ctx={activeCtx} printRef={printRef} />
      {showBtn ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
        >
          <Printer className="h-4 w-4" />
          打印
        </button>
      ) : null}
      {showBtn && pickerOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() => setPickerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-900">选择打印模版</h3>
                {pickerSubtitle ? <p className="mt-0.5 text-xs text-slate-500">{pickerSubtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[min(40vh,280px)] overflow-y-auto p-2">
              {pickerTemplates.length === 0 ? (
                <div className="flex flex-col items-center gap-4 px-4 py-8 text-center">
                  <p className="text-xs leading-relaxed text-slate-500">
                    {hasWhitelist
                      ? '已加入的可选模版在当前列表中均不可用，或模版已被删除。请在「表单配置 → 打印模版」中调整。'
                      : '请先在「表单配置 → 打印模版」中为该入口增加模版并加入可选列表后，再在此处打印。'}
                    {!onAddPrintTemplate ? '（需具备「工单表单配置」权限方可从此处跳转）' : ''}
                  </p>
                  {onAddPrintTemplate ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPickerOpen(false);
                        onAddPrintTemplate();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                    >
                      <Plus className="h-4 w-4" />
                      增加打印模版
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pickerTemplates.map(t => (
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
                          onClick={() => handlePick(t)}
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
      ) : null}
    </>
  );
};
