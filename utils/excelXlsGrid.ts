/**
 * .xls 预览网格：SheetJS 单元格 + BIFF 锚点图（一次 XLSX.read，图片尺寸并行探测）。
 */
import {
  excelColWidthToPx,
  excelRowHeightToPx,
  formatExcelCellValue,
} from './excelPreview';
import {
  computeXlsClientAnchorSize,
  extractAnchoredImagesFromXlsBuffer,
  fitImageInBox,
  resolveAnchorHostCell,
  type XlsAnchoredImage,
} from './excelXlsImages';

const MAX_ROWS = 1000;
const MAX_COLS = 100;
const XLS_IMAGE_COL_MIN_PX = 120;
const XLS_IMAGE_ROW_MIN_PX = 72;
const XLS_IMAGE_ROW_MAX_PX = 140;

export interface ExcelPreviewCellImage {
  url: string;
  width: number;
  height: number;
}

export interface ExcelPreviewGridCell {
  text: string;
  rowSpan: number;
  colSpan: number;
  images: ExcelPreviewCellImage[];
}

export interface ExcelPreviewSheetGrid {
  name: string;
  colWidths: number[];
  rowHeights: number[];
  rows: Array<Array<ExcelPreviewGridCell | null>>;
}

export interface ExcelPreviewHtmlSheet {
  name: string;
  html: string;
}

export type ExcelXlsFallbackResult =
  | { mode: 'grid'; sheets: ExcelPreviewSheetGrid[] }
  | { mode: 'html'; sheets: ExcelPreviewHtmlSheet[] };

type XlsxModule = typeof import('xlsx');

function emptyGridCell(): ExcelPreviewGridCell {
  return { text: '', rowSpan: 1, colSpan: 1, images: [] };
}

function probeImageNaturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth || 120,
        height: img.naturalHeight || 120,
      });
    img.onerror = () => resolve({ width: 120, height: 120 });
    img.src = url;
  });
}

/** 已解析的 SheetJS workbook + 锚点图 → 网格（图片尺寸 Promise.all） */
export async function buildXlsSheetGridsFromWorkbook(
  XLSX: XlsxModule,
  wb: ReturnType<XlsxModule['read']>,
  anchored: XlsAnchoredImage[],
  registerUrl: (url: string) => void,
): Promise<ExcelPreviewSheetGrid[]> {
  if (!wb.SheetNames.length) throw new Error('empty workbook');

  const sheets: ExcelPreviewSheetGrid[] = [];

  for (let si = 0; si < wb.SheetNames.length; si++) {
    const name = wb.SheetNames[si]!;
    const ws = wb.Sheets[name]!;
    const ref = ws['!ref'] || 'A1';
    const range = XLSX.utils.decode_range(ref);

    const sheetImages = anchored.filter((img) => img.anchor.sheetIndex === si);
    let maxImageRow = range.e.r + 1;
    let maxImageCol = range.e.c + 1;
    for (const img of sheetImages) {
      maxImageRow = Math.max(maxImageRow, img.anchor.row2 + 1, img.anchor.row1 + 1);
      maxImageCol = Math.max(maxImageCol, img.anchor.col2 + 1, img.anchor.col1 + 1);
    }

    const rowCount = Math.min(Math.max(range.e.r + 1, maxImageRow, 1), MAX_ROWS);
    const colCount = Math.min(Math.max(range.e.c + 1, maxImageCol, 1), MAX_COLS);

    const colWidths: number[] = [];
    for (let c = 0; c < colCount; c++) {
      const cols = ws['!cols'] as Array<{ wch?: number; width?: number } | undefined> | undefined;
      const wch = cols?.[c]?.wch ?? cols?.[c]?.width;
      colWidths.push(excelColWidthToPx(typeof wch === 'number' ? wch : undefined));
    }
    const rowHeights: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      const rowsMeta = ws['!rows'] as Array<{ hpt?: number } | undefined> | undefined;
      rowHeights.push(excelRowHeightToPx(rowsMeta?.[r]?.hpt));
    }

    const spanByMaster = new Map<string, { rowSpan: number; colSpan: number }>();
    const coveredToMaster = new Map<string, string>();
    for (const merge of ws['!merges'] ?? []) {
      const top = merge.s.r;
      const left = merge.s.c;
      const bottom = merge.e.r;
      const right = merge.e.c;
      const masterKey = `${top},${left}`;
      spanByMaster.set(masterKey, {
        rowSpan: bottom - top + 1,
        colSpan: right - left + 1,
      });
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          const key = `${r},${c}`;
          if (key !== masterKey) coveredToMaster.set(key, masterKey);
        }
      }
    }

    type PendingPlace = {
      url: string;
      hostRow: number;
      hostCol: number;
      key: string;
      boxW: number;
      preferH: number;
    };
    const pending: PendingPlace[] = [];

    for (const img of sheetImages) {
      const url = URL.createObjectURL(new Blob([img.bytes], { type: img.mimeType }));
      registerUrl(url);
      const host = resolveAnchorHostCell(img.anchor, colWidths, rowHeights);
      if (host.row >= rowCount || host.col >= colCount) continue;

      if ((colWidths[host.col] ?? 0) < XLS_IMAGE_COL_MIN_PX) {
        colWidths[host.col] = XLS_IMAGE_COL_MIN_PX;
      }

      const anchorSize = computeXlsClientAnchorSize(img.anchor, colWidths, rowHeights);
      const span = spanByMaster.get(`${host.row},${host.col}`);
      const colSpan = span?.colSpan ?? 1;
      let boxW = 0;
      for (let c = host.col; c < host.col + colSpan && c < colCount; c++) {
        boxW += colWidths[c] ?? XLS_IMAGE_COL_MIN_PX;
      }
      boxW = Math.max(40, boxW - 12);
      const preferH = Math.min(
        XLS_IMAGE_ROW_MAX_PX,
        Math.max(48, Math.min(anchorSize.height || 96, XLS_IMAGE_ROW_MAX_PX)),
      );
      let key = `${host.row},${host.col}`;
      key = coveredToMaster.get(key) ?? key;
      pending.push({ url, hostRow: host.row, hostCol: host.col, key, boxW, preferH });
    }

    const naturals = await Promise.all(pending.map((p) => probeImageNaturalSize(p.url)));
    const imagesByCell = new Map<string, ExcelPreviewCellImage[]>();
    pending.forEach((p, i) => {
      const natural = naturals[i]!;
      const fitted = fitImageInBox(natural.width, natural.height, p.boxW, p.preferH);
      const list = imagesByCell.get(p.key) ?? [];
      list.push({ url: p.url, ...fitted });
      imagesByCell.set(p.key, list);
    });

    for (const [key, list] of imagesByCell) {
      const [rs, cs] = key.split(',').map(Number) as [number, number];
      const needH = Math.min(
        XLS_IMAGE_ROW_MAX_PX,
        Math.max(XLS_IMAGE_ROW_MIN_PX, ...list.map((im) => im.height + 8)),
      );
      rowHeights[rs] = needH;
      if ((colWidths[cs] ?? 0) < XLS_IMAGE_COL_MIN_PX) colWidths[cs] = XLS_IMAGE_COL_MIN_PX;
    }

    const rows: Array<Array<ExcelPreviewGridCell | null>> = [];
    for (let r = 0; r < rowCount; r++) {
      const row: Array<ExcelPreviewGridCell | null> = [];
      for (let c = 0; c < colCount; c++) {
        const key = `${r},${c}`;
        if (coveredToMaster.has(key)) {
          row.push(null);
          continue;
        }
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as { w?: string; v?: unknown } | undefined;
        const text =
          cell?.w != null
            ? String(cell.w)
            : cell?.v != null
              ? formatExcelCellValue(cell.v)
              : '';
        const span = spanByMaster.get(key);
        row.push({
          text,
          rowSpan: span?.rowSpan ?? 1,
          colSpan: span?.colSpan ?? 1,
          images: imagesByCell.get(key) ?? [],
        });
      }
      rows.push(row);
    }

    if (!rows.length) {
      rows.push([emptyGridCell()]);
      colWidths.push(excelColWidthToPx(undefined));
      rowHeights.push(excelRowHeightToPx(undefined));
    }

    sheets.push({ name, colWidths, rowHeights, rows });
  }

  return sheets;
}

function htmlSheetsFromWorkbook(
  XLSX: XlsxModule,
  wb: ReturnType<XlsxModule['read']>,
): ExcelPreviewHtmlSheet[] {
  const sheets = wb.SheetNames.map((name) => ({
    name,
    html: XLSX.utils.sheet_to_html(wb.Sheets[name]),
  }));
  return sheets.length ? sheets : [{ name: 'Sheet1', html: '<table></table>' }];
}

/**
 * ExcelJS 失败后的 .xls / 旧格式回退：
 * 锚点抽图与 SheetJS.read 并行；单元格只 read 一次。
 */
export async function parseXlsFallbackPreview(
  buffer: ArrayBuffer,
  registerUrl: (url: string) => void,
): Promise<ExcelXlsFallbackResult> {
  const XLSX = await import('xlsx');
  const [anchored, wb] = await Promise.all([
    extractAnchoredImagesFromXlsBuffer(buffer),
    Promise.resolve(XLSX.read(buffer, { type: 'array' })),
  ]);

  if (anchored.length > 0) {
    return {
      mode: 'grid',
      sheets: await buildXlsSheetGridsFromWorkbook(XLSX, wb, anchored, registerUrl),
    };
  }
  return { mode: 'html', sheets: htmlSheetsFromWorkbook(XLSX, wb) };
}
