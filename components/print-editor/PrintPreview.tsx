import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import type { PrintRenderContext, PrintTemplate } from '../../types';
import { PrintPaper } from './PrintPaper';

export function HiddenPrintSlot({
  template,
  ctx,
  printRef,
}: {
  template: PrintTemplate;
  ctx: PrintRenderContext;
  printRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="pointer-events-none fixed left-[-9999px] top-0 opacity-0" aria-hidden>
      <div ref={printRef}>
        <PrintPaper template={template} ctx={ctx} />
      </div>
    </div>
  );
}

export function usePrintTemplateAction(template: PrintTemplate, _ctx: PrintRenderContext) {
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: template.name || 'print',
    pageStyle: '@page { size: auto; margin: 8mm; }',
  });
  return { printRef, handlePrint };
}
