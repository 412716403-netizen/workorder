import React from 'react';
import { Printer, X } from 'lucide-react';
import type { PrintRenderContext, PrintTemplate } from '../../types';
import { PrintPaper } from '../../components/print-editor/PrintPaper';
import { HiddenPrintSlot, usePrintTemplateAction } from '../../components/print-editor/PrintPreview';

export interface SalesBillPrintDialogProps {
  open: boolean;
  onClose: () => void;
  template: PrintTemplate;
  ctx: PrintRenderContext;
}

export const SalesBillPrintDialog: React.FC<SalesBillPrintDialogProps> = ({ open, onClose, template, ctx }) => {
  const { printRef, handlePrint } = usePrintTemplateAction(template, ctx);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        onClick={() => onClose()}
        role="presentation"
      >
        <div
          className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-lg font-black text-slate-900">销售单打印预览</h3>
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[calc(92vh-8rem)] overflow-auto p-5">
            <div className="mx-auto flex justify-center">
              <div className="origin-top scale-[0.72] sm:scale-[0.82]">
                <PrintPaper template={template} ctx={ctx} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => {
                void handlePrint();
              }}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <Printer className="h-4 w-4" /> 打印
            </button>
          </div>
        </div>
      </div>
      <HiddenPrintSlot template={template} ctx={ctx} printRef={printRef} />
    </>
  );
};
