import type { jsPDF } from 'jspdf';
import type {
  PrintBodyElement,
  PrintLineElementConfig,
  PrintQRCodeElementConfig,
  PrintRectElementConfig,
  PrintRenderContext,
  PrintTemplate,
  PrintTextElementConfig,
} from '../types';
import { getPrintLayoutMetrics, getPaperMarginsMm } from '../components/print-editor/layoutMetrics';
import { formatNumberForPrint, resolvePrintPlaceholders } from './printResolve';
import { LABEL_PDF_FONT_NAME } from './labelPdfChineseFont';
import { resolveLabelQrPayload, resolveQrCells } from './labelPrintQr';
import { QR_QUIET_ZONE_MODULES } from './qrcodegen';

const PT_TO_MM = 0.3527777778;
/** 与 PrintPaper 文本 `lineHeight: 1.2` 一致 */
const LINE_HEIGHT_RATIO = 1.2;

export function lineHeightMm(fontSizePt: number): number {
  return fontSizePt * PT_TO_MM * LINE_HEIGHT_RATIO;
}

function splitDisplayLines(doc: jsPDF, display: string, maxWidthMm: number): string[] {
  const rows: string[] = [];
  for (const paragraph of display.split('\n')) {
    if (!paragraph) {
      rows.push('');
      continue;
    }
    rows.push(...doc.splitTextToSize(paragraph, maxWidthMm));
  }
  return rows.length > 0 ? rows : [''];
}

export function linesFittingBox(lineCount: number, box: { y: number; h: number }, lineHm: number): number {
  let fit = 0;
  for (let i = 0; i < lineCount; i++) {
    const lineTop = box.y + i * lineHm;
    /** 与 PrintPaper `overflow:hidden` 一致：行顶在框内即绘制，末行可略超出框底 */
    if (lineTop >= box.y + box.h - 0.05) break;
    fit++;
  }
  return fit;
}

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return [r, g, b];
  }
  if (raw.length >= 6) {
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }
  return [17, 24, 39];
}

function setDrawColorHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setFillColorHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setTextColorHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function elementBox(bodyOx: number, bodyOy: number, el: PrintBodyElement) {
  const h = Math.max(el.height, 0.5);
  return {
    x: bodyOx + el.x,
    y: bodyOy + el.y,
    w: el.width,
    h,
  };
}

function drawTextInBox(
  doc: jsPDF,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  cfg: Pick<PrintTextElementConfig, 'fontSizePt' | 'fontWeight' | 'textAlign' | 'color'>,
): void {
  const display = text.trim() || ' ';
  if (display.startsWith('data:image/')) {
    try {
      doc.addImage(display, 'PNG', box.x, box.y, box.w, box.h, undefined, 'FAST');
    } catch {
      /* 非法图片 data URL 时跳过 */
    }
    return;
  }

  doc.setFont(LABEL_PDF_FONT_NAME, cfg.fontWeight === 'bold' ? 'bold' : 'normal');
  doc.setFontSize(cfg.fontSizePt);
  setTextColorHex(doc, cfg.color);

  const lh = lineHeightMm(cfg.fontSizePt);
  const allLines = splitDisplayLines(doc, display, box.w);
  const fitCount = linesFittingBox(allLines.length, box, lh);
  if (fitCount <= 0) return;

  const lines = allLines.slice(0, fitCount);
  const align = cfg.textAlign;
  const anchorX =
    align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;

  doc.text(lines, anchorX, box.y, {
    align,
    baseline: 'top',
    lineHeightFactor: LINE_HEIGHT_RATIO,
    maxWidth: box.w,
  });
}

/**
 * 直接矢量绘制二维码：每行合并连续暗模块为一个矩形，零 PNG 编码/解码。
 * 矩阵来自与浏览器打印相同的 qrcodegen 编码器（level M），图案与扫码结果一致。
 * 四周保留 `QR_QUIET_ZONE_MODULES` 个模块的静区（与 PrintPaper 的 QRCodeSVG marginSize 一致），
 * 静区计入框内：实际模块尺寸按 `(n + 2*静区)` 均分框宽，码主体整体内缩静区模块数。
 */
function drawQrInBox(
  doc: jsPDF,
  cells: boolean[][] | undefined,
  box: { x: number; y: number; w: number; h: number },
): void {
  const n = cells?.length ?? 0;
  if (!cells || n === 0) return;
  const quiet = QR_QUIET_ZONE_MODULES;
  const totalModules = n + quiet * 2;
  const moduleW = box.w / totalModules;
  const moduleH = box.h / totalModules;
  const ox = box.x + quiet * moduleW;
  const oy = box.y + quiet * moduleH;

  doc.setFillColor(255, 255, 255);
  doc.rect(box.x, box.y, box.w, box.h, 'F');
  doc.setFillColor(0, 0, 0);

  for (let y = 0; y < n; y++) {
    const row = cells[y];
    let x = 0;
    while (x < n) {
      if (!row[x]) {
        x++;
        continue;
      }
      const runStart = x;
      while (x < n && row[x]) {
        x++;
      }
      doc.rect(ox + runStart * moduleW, oy + y * moduleH, (x - runStart) * moduleW, moduleH, 'F');
    }
  }
}

function renderTextElement(
  doc: jsPDF,
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  qrCellsCache: Map<string, boolean[][]>,
  bodyOx: number,
  bodyOy: number,
): void {
  const c = el.config as PrintTextElementConfig;
  let display = resolvePrintPlaceholders(c.content, ctx);
  if (c.displayFormat === 'number' && display && !Number.isNaN(Number(display))) {
    display = formatNumberForPrint(Number(display), c.thousandSeparator, c.uppercase);
  }
  const box = elementBox(bodyOx, bodyOy, el);
  if (c.renderAsQr) {
    drawQrInBox(doc, resolveQrCells(resolveLabelQrPayload(c.content, ctx), qrCellsCache), box);
    return;
  }
  drawTextInBox(doc, display, box, c);
}

function renderQrElement(
  doc: jsPDF,
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  qrCellsCache: Map<string, boolean[][]>,
  bodyOx: number,
  bodyOy: number,
): void {
  const c = el.config as PrintQRCodeElementConfig;
  const v = resolveLabelQrPayload(c.content, ctx);
  drawQrInBox(doc, resolveQrCells(v, qrCellsCache), elementBox(bodyOx, bodyOy, el));
}

function renderLineElement(
  doc: jsPDF,
  el: PrintBodyElement,
  _ctx: PrintRenderContext,
  bodyOx: number,
  bodyOy: number,
): void {
  const c = el.config as PrintLineElementConfig;
  const thicknessMm = Math.max(0.05, c.thicknessMm);
  const angleDeg = c.angleDeg ?? 0;
  const box = elementBox(bodyOx, bodyOy, el);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const halfW = box.w / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const x1 = cx - halfW * Math.cos(rad);
  const y1 = cy - halfW * Math.sin(rad);
  const x2 = cx + halfW * Math.cos(rad);
  const y2 = cy + halfW * Math.sin(rad);

  setDrawColorHex(doc, c.color);
  doc.setLineWidth(thicknessMm);
  if (c.lineStyle === 'dashed') {
    doc.setLineDashPattern([thicknessMm * 2, thicknessMm * 1.5], 0);
  } else if (c.lineStyle === 'dotted') {
    doc.setLineDashPattern([thicknessMm, thicknessMm], 0);
  }
  doc.line(x1, y1, x2, y2);
  if (c.lineStyle !== 'solid') {
    doc.setLineDashPattern([], 0);
  }
}

function renderRectElement(
  doc: jsPDF,
  el: PrintBodyElement,
  _ctx: PrintRenderContext,
  bodyOx: number,
  bodyOy: number,
): void {
  const c = el.config as PrintRectElementConfig;
  const box = elementBox(bodyOx, bodyOy, el);
  if (c.fillColor !== 'transparent') {
    setFillColorHex(doc, c.fillColor);
  }
  setDrawColorHex(doc, c.borderColor);
  doc.setLineWidth(Math.max(0.05, c.borderWidthMm));
  const style =
    c.fillColor !== 'transparent' ? ('FD' as const) : ('S' as const);
  doc.roundedRect(box.x, box.y, box.w, box.h, c.cornerRadiusMm, c.cornerRadiusMm, style);
}

function renderBodyElement(
  doc: jsPDF,
  el: PrintBodyElement,
  ctx: PrintRenderContext,
  qrCellsCache: Map<string, boolean[][]>,
  bodyOx: number,
  bodyOy: number,
): void {
  switch (el.type) {
    case 'text':
      renderTextElement(doc, el, ctx, qrCellsCache, bodyOx, bodyOy);
      break;
    case 'qrcode':
      renderQrElement(doc, el, ctx, qrCellsCache, bodyOx, bodyOy);
      break;
    case 'line':
      renderLineElement(doc, el, ctx, bodyOx, bodyOy);
      break;
    case 'rect':
      renderRectElement(doc, el, ctx, bodyOx, bodyOy);
      break;
    default:
      break;
  }
}

/** 在 jsPDF 当前页按模版矢量绘制一张标签（坐标系：左上为原点，单位 mm） */
export function renderLabelPageVectorPdf(
  doc: jsPDF,
  template: PrintTemplate,
  ctx: PrintRenderContext,
  qrCellsCache: Map<string, boolean[][]>,
): void {
  const { widthMm, heightMm } = template.paperSize;
  const m = getPaperMarginsMm(template);
  const layout = getPrintLayoutMetrics(template);
  const paperBg = template.paperBackgroundColor?.trim() || '#ffffff';

  setFillColorHex(doc, paperBg);
  doc.rect(0, 0, widthMm, heightMm, 'F');

  const bodyOx = m.left;
  const bodyOy = m.top + layout.headerH;

  doc.setFillColor(255, 255, 255);
  doc.rect(bodyOx, bodyOy, layout.bodyW, layout.bodyH, 'F');

  const sorted = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const el of sorted) {
    renderBodyElement(doc, el, ctx, qrCellsCache, bodyOx, bodyOy);
  }
}
