import React, { useRef, useCallback } from 'react';
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

function inlineAllStyles(original: Element, clone: Element) {
  const computed = window.getComputedStyle(original);
  const el = clone as HTMLElement;
  if (el.style) {
    const keep = [
      'display', 'position', 'width', 'height', 'min-width', 'min-height',
      'max-width', 'max-height', 'box-sizing',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'flex-direction', 'flex-grow', 'flex-shrink', 'flex-basis',
      'align-items', 'justify-content', 'gap',
      'grid-template-columns', 'grid-template-rows', 'grid-row', 'grid-column',
      'overflow', 'overflow-x', 'overflow-y',
      'border-width', 'border-style', 'border-color',
      'border-top-width', 'border-top-style', 'border-top-color',
      'border-bottom-width', 'border-bottom-style', 'border-bottom-color',
      'border-left-width', 'border-left-style', 'border-left-color',
      'border-right-width', 'border-right-style', 'border-right-color',
      'border-radius',
      'background', 'background-color', 'background-image',
      'color', 'font-size', 'font-weight', 'font-family', 'line-height',
      'text-align', 'word-break', 'white-space', 'text-overflow',
      'opacity', 'z-index', 'left', 'top', 'right', 'bottom',
      'transform', 'transform-origin',
    ];
    for (const prop of keep) {
      const val = computed.getPropertyValue(prop);
      if (val) el.style.setProperty(prop, val);
    }
    el.removeAttribute('class');
  }
  const origChildren = original.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
    inlineAllStyles(origChildren[i], cloneChildren[i]);
  }
}

function printViaNewWindow(contentEl: HTMLElement, wMm: number, hMm: number) {
  const innerDiv = contentEl.querySelector('[class*="text-slate"]') || contentEl;
  const labelPages = innerDiv.querySelectorAll('[data-label-page]');

  let labelsHtml = '';
  if (labelPages.length > 0) {
    labelPages.forEach(orig => {
      const clone = orig.cloneNode(true) as HTMLElement;
      inlineAllStyles(orig, clone);
      clone.removeAttribute('class');
      clone.style.setProperty('display', 'block');
      clone.style.setProperty('page-break-after', 'always');
      clone.style.setProperty('break-after', 'page');
      labelsHtml += clone.outerHTML;
    });
  } else {
    labelsHtml = contentEl.innerHTML;
  }
  const labelCount = labelPages.length || '?';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>标签打印</title>
<style>
@page { size: ${wMm}mm ${hMm}mm; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0; }
</style>
</head>
<body>
${labelsHtml}
</body></html>`;

  let iframe = document.getElementById('__label_print_frame') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = '__label_print_frame';
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;top:0;';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe!.contentWindow?.print();
  }, 300);
}

export function usePrintTemplateAction(template: PrintTemplate, _ctx: PrintRenderContext) {
  const printRef = useRef<HTMLDivElement>(null);
  const { widthMm, heightMm } = template.paperSize;
  const pageStyle = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;

  const handlePrintLib = useReactToPrint({
    contentRef: printRef,
    documentTitle: template.name || 'print',
    pageStyle,
  });

  const handlePrint = useCallback(() => {
    if (_ctx.labelPerRow && printRef.current) {
      printViaNewWindow(printRef.current, widthMm, heightMm);
    } else {
      handlePrintLib();
    }
  }, [_ctx.labelPerRow, widthMm, heightMm, handlePrintLib]);

  return { printRef, handlePrint };
}
