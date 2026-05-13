import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Plus, Printer, X } from 'lucide-react';
import type { PlanListPrintSettings, PrintRenderContext, PrintTemplate } from '../../types';
import { HiddenPrintSlot, usePrintTemplateAction } from '../print-editor/PrintPreview';
import { createBlankCustomTemplate } from '../../utils/printTemplateDefaults';
import { OrderCenterDetailPrintBlock } from '../order-print/OrderCenterDetailPrintBlock';

/**
 * PSI 表单详情页「列表/详情共用列表打印槽」选择器
 *
 * 用于 Psi 4 个 FormSection 顶部的「打印」按钮：直接复用
 * OrderCenterDetailPrintBlock，只做 slot/buildContext guard。
 */
export interface PsiListPrintPickerProps {
  slot?: PlanListPrintSettings;
  printTemplates?: PrintTemplate[];
  buildContext?: (template: PrintTemplate) => PrintRenderContext;
  pickerSubtitle?: string;
}

export const PsiListPrintPicker: React.FC<PsiListPrintPickerProps> = ({
  slot,
  printTemplates = [],
  buildContext,
  pickerSubtitle,
}) => {
  if (!slot || !buildContext) return null;
  return (
    <OrderCenterDetailPrintBlock
      printSlot={slot}
      printTemplates={printTemplates}
      buildContext={buildContext}
      pickerSubtitle={pickerSubtitle}
    />
  );
};

/* -------------------------------------------------------------------- */

/**
 * PSI 列表行打印 Controller（收拢 PSIOpsView 4 套重复逻辑）
 *
 * 背景：
 *   PSIOpsView 对 4 个类型（PO/PB/SO/SB）各维护一套：
 *     - state：printRun / pickerOpen / pickerDocNum
 *     - useMemo：pickerTemplates / hasWhitelist
 *     - idleTemplate / idleCtx / usePrintTemplateAction / useEffect 触发链
 *     - HiddenPrintSlot 挂载
 *     - 选模版 Dialog UI
 *   4 套代码 ~500 行纯重复，仅 buildContext 与文案不同。
 *
 * 设计：
 *   外部只持有一个 ref，在点击行内「打印」时调 `openPicker(docNumber, docItems)`；
 *   组件内部负责全部 state、打印执行、Dialog 渲染和 HiddenPrintSlot 挂载。
 *   需要在外部跳到 FormConfig 的打印 Tab 时，通过 onAddPrintTemplate 回调。
 *
 * 为什么不用 OrderCenterDetailPrintBlock：
 *   它的「打印」按钮是头部固定按钮；此处的触发点是列表某行的内联按钮，
 *   且 buildContext 依赖 docNumber/docItems，不能在组件渲染时一次拿到。
 */
export interface PsiListPrintControllerHandle {
  /** 外部（列表行上的打印按钮）触发打开选择模版弹窗 */
  openPicker: (docNumber: string) => void;
}

export interface PsiListPrintControllerProps<TDoc> {
  /** 表单配置中的 listPrint：读 showPrintButton/allowedTemplateIds；缺失时组件不工作 */
  listPrintSlot: PlanListPrintSettings | undefined;
  printTemplates: PrintTemplate[];
  /**
   * 根据单号解析本次打印涉及的行数据。
   * 放在组件内而不是由外部传 docItems，避免外部在每次渲染时重算列表并持续持有。
   */
  resolveDocItems: (docNumber: string) => TDoc[];
  /**
   * 基于行数据与选中模版构造打印上下文。
   * Phase 3.D follow-up：允许返回 Promise，便于销售单打印先 await `api.finance.partnerReceivable` 拿到 preBalance 再组装上下文。
   */
  buildContext: (
    template: PrintTemplate,
    payload: { docNumber: string; docItems: TDoc[] },
  ) => PrintRenderContext | Promise<PrintRenderContext>;
  /** 选模版弹窗副标题：通常根据单号拼成「采购订单 xxx」「独立单据」等 */
  pickerSubtitle: (docNumber: string) => string;
  /**
   * 空态时的「增加打印模版」按钮行为（通常是打开当前业务的 FormConfigModal 并切到打印 Tab）。
   * 未提供时不显示该按钮。
   */
  onAddPrintTemplate?: () => void;
}

function PsiListPrintControllerInner<TDoc>(
  {
    listPrintSlot,
    printTemplates,
    resolveDocItems,
    buildContext,
    pickerSubtitle,
    onAddPrintTemplate,
  }: PsiListPrintControllerProps<TDoc>,
  ref: React.Ref<PsiListPrintControllerHandle>,
): React.ReactElement {
  const [printRun, setPrintRun] = useState<{ template: PrintTemplate; ctx: PrintRenderContext } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDocNum, setPickerDocNum] = useState<string | null>(null);

  const { pickerTemplates, hasWhitelist } = useMemo(() => {
    const raw = listPrintSlot?.allowedTemplateIds;
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
  }, [printTemplates, listPrintSlot?.allowedTemplateIds]);

  const idleTemplate = useMemo(() => createBlankCustomTemplate(80, 60, ' '), []);
  const idleCtx = useMemo<PrintRenderContext>(() => ({}), []);
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

  useImperativeHandle(ref, () => ({
    openPicker: (docNumber: string) => {
      setPickerDocNum(docNumber);
      setPickerOpen(true);
    },
  }), []);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerDocNum(null);
  }, []);

  const handlePick = useCallback(
    async (t: PrintTemplate) => {
      if (!pickerDocNum) return;
      const docItems = resolveDocItems(pickerDocNum);
      const maybe = buildContext(t, { docNumber: pickerDocNum, docItems });
      const ctx = await Promise.resolve(maybe);
      setPrintRun({ template: t, ctx });
      closePicker();
    },
    [pickerDocNum, resolveDocItems, buildContext, closePicker],
  );

  return (
    <>
      <HiddenPrintSlot template={activeTemplate} ctx={activeCtx} printRef={printRef} />
      {pickerOpen && pickerDocNum ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-label="关闭"
            onClick={closePicker}
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
                <p className="mt-0.5 text-xs text-slate-500">{pickerSubtitle(pickerDocNum)}</p>
              </div>
              <button
                type="button"
                onClick={closePicker}
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
                      : '请先在「表单配置 → 打印模版」中为「列表打印」增加模版并加入可选列表后，再在此处打印。'}
                  </p>
                  {onAddPrintTemplate ? (
                    <button
                      type="button"
                      onClick={() => {
                        closePicker();
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
                          onClick={() => { void handlePick(t); }}
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
}

// forwardRef + 泛型：需要用 as 强转回带泛型的签名
export const PsiListPrintController = forwardRef(PsiListPrintControllerInner) as <TDoc>(
  props: PsiListPrintControllerProps<TDoc> & { ref?: React.Ref<PsiListPrintControllerHandle> },
) => React.ReactElement;
