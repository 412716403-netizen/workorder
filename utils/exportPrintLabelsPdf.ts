import { jsPDF } from 'jspdf';
import type { PrintRenderContext, PrintTemplate } from '../types';
import { applyLabelPdfChineseFont, preloadLabelPdfChineseFont } from './labelPdfChineseFont';
import { buildLabelPageContexts } from './labelPrintExportShared';
import { renderLabelPageVectorPdf } from './renderLabelPageVectorPdf';

export interface ExportPrintLabelsPdfOptions {
  template: PrintTemplate;
  ctx: PrintRenderContext;
  filename: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * 将标签模版按行导出为多页 PDF（矢量文字 + 矢量二维码，无 PNG 编码、无 html2canvas）。
 * 二维码矩阵在渲染循环中按页懒计算并按 value 缓存，进度随页推进平滑刷新。
 */
export async function exportPrintLabelsPdf(options: ExportPrintLabelsPdfOptions): Promise<void> {
  const { template, ctx, filename, onProgress } = options;
  const { widthMm, heightMm } = template.paperSize;
  const pageContexts = buildLabelPageContexts(ctx);
  if (pageContexts.length === 0) {
    throw new Error('没有可导出的标签页');
  }

  onProgress?.(0, pageContexts.length);

  await preloadLabelPdfChineseFont();

  const doc = new jsPDF({
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: true,
  });

  await applyLabelPdfChineseFont(doc);

  const qrCellsCache = new Map<string, boolean[][]>();

  for (let i = 0; i < pageContexts.length; i++) {
    if (i > 0) {
      doc.addPage([widthMm, heightMm]);
    }
    renderLabelPageVectorPdf(doc, template, pageContexts[i], qrCellsCache);
    onProgress?.(i + 1, pageContexts.length);

    // 大批量时偶尔让出主线程，保持 toast 刷新
    if ((i + 1) % 50 === 0) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      });
    }
  }

  const safeName = filename.trim() || 'labels.pdf';
  doc.save(safeFilename(safeName));
}

function safeFilename(name: string): string {
  return name.endsWith('.pdf') ? name : `${name}.pdf`;
}
