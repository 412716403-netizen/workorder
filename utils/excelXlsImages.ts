/**
 * 从旧版 .xls（BIFF8 / OLE）提取内嵌 PNG/JPEG，并尽量解析单元格锚点。
 * ExcelJS 不读 .xls；SheetJS 社区版也不出图。
 */

import {
  EXCEL_DEFAULT_COL_WIDTH_CHARS,
  EXCEL_DEFAULT_ROW_HEIGHT_POINTS,
  excelColWidthToPx,
  excelRowHeightToPx,
} from './excelPreview';

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];
/** BIFF8：MsoDrawingGroup */
const BIFF_MSODRAWINGGROUP = 0x00eb;
/** BIFF8：MsoDrawing（工作表级，含 ClientAnchor） */
const BIFF_MSODRAWING = 0x00ec;
/** BIFF8：CONTINUE */
const BIFF_CONTINUE = 0x003c;
/** BIFF8：BOF */
const BIFF_BOF = 0x0809;
/** BOF.dt：工作表 */
const BOF_DT_WORKSHEET = 0x0010;

/** OfficeArt ClientAnchor */
const OFFICE_ART_CLIENT_ANCHOR = 0xf010;
/** OfficeArt SpContainer */
const OFFICE_ART_SP_CONTAINER = 0xf004;
/** OfficeArt FOPT（形状属性，含 blip 索引） */
const OFFICE_ART_FOPT = 0xf00b;
/** OfficeArt 容器 version */
const OFFICE_ART_CONTAINER_VER = 0x0f;
/** Escher property：blip to display（1-based BSE 索引） */
const ESCHER_PID_BLIP = 0x0104;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_IMAGES = 50;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export interface ExtractedRasterImage {
  mimeType: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
}

/** .xls 浮动图锚点（POI EscherClientAnchorRecord：单元格 1024×256 相对单位） */
export interface XlsClientAnchor {
  sheetIndex: number;
  col1: number;
  dx1: number;
  row1: number;
  dy1: number;
  col2: number;
  dx2: number;
  row2: number;
  dy2: number;
}

export interface XlsAnchoredImage extends ExtractedRasterImage {
  anchor: XlsClientAnchor;
}

function isOleCompound(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return OLE_MAGIC.every((b, i) => bytes[i] === b);
}

function eqAt(bytes: Uint8Array, offset: number, sig: number[]): boolean {
  if (offset + sig.length > bytes.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

function u16(bytes: Uint8Array, i: number): number {
  return bytes[i]! | (bytes[i + 1]! << 8);
}

function u32(bytes: Uint8Array, i: number): number {
  return (
    bytes[i]! |
    (bytes[i + 1]! << 8) |
    (bytes[i + 2]! << 16) |
    (bytes[i + 3]! << 24)
  ) >>> 0;
}

/** 拼接指定 BIFF 类型及其后续 CONTINUE；可按工作表分段 */
function collectContinuedBiffPayloads(
  workbook: Uint8Array,
  targetType: number,
): Array<{ sheetIndex: number; payload: Uint8Array }> {
  const results: Array<{ sheetIndex: number; payload: Uint8Array }> = [];
  let i = 0;
  let sheetIndex = -1;
  let collecting = false;
  let chunks: Uint8Array[] = [];
  let chunkSheet = -1;

  const flush = () => {
    if (!chunks.length) return;
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    results.push({ sheetIndex: chunkSheet, payload: out });
    chunks = [];
    collecting = false;
  };

  while (i + 4 <= workbook.length) {
    const type = u16(workbook, i);
    const size = u16(workbook, i + 2);
    i += 4;
    if (size < 0 || i + size > workbook.length) break;
    const data = workbook.subarray(i, i + size);
    i += size;

    if (type === BIFF_BOF && size >= 4) {
      flush();
      const dt = u16(data, 2);
      if (dt === BOF_DT_WORKSHEET) sheetIndex += 1;
    }

    if (type === targetType) {
      flush();
      collecting = true;
      chunkSheet = sheetIndex;
      chunks.push(data);
    } else if (type === BIFF_CONTINUE && collecting) {
      chunks.push(data);
    } else if (collecting) {
      flush();
    }
  }
  flush();
  return results;
}

/**
 * 拼接所有 MsoDrawingGroup 及其后续 CONTINUE 载荷。
 * 若找不到 BIFF 记录，退回整段 bytes。
 */
export function collectMsoDrawingGroupPayload(workbook: Uint8Array): Uint8Array {
  const parts = collectContinuedBiffPayloads(workbook, BIFF_MSODRAWINGGROUP);
  if (!parts.length) return workbook;
  if (parts.length === 1) return parts[0]!.payload;
  let total = 0;
  for (const p of parts) total += p.payload.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p.payload, o);
    o += p.payload.length;
  }
  return out;
}

function findPngEnd(bytes: Uint8Array, start: number): number {
  let p = start + 8;
  while (p + 12 <= bytes.length) {
    const len = (bytes[p]! << 24) | (bytes[p + 1]! << 16) | (bytes[p + 2]! << 8) | bytes[p + 3]!;
    const type = String.fromCharCode(bytes[p + 4]!, bytes[p + 5]!, bytes[p + 6]!, bytes[p + 7]!);
    if (len < 0 || p + 12 + len > bytes.length) return -1;
    const next = p + 12 + len;
    if (type === 'IEND') return next;
    p = next;
  }
  return -1;
}

function isJpegSoi(bytes: Uint8Array, offset: number): boolean {
  return (
    offset + 2 < bytes.length &&
    bytes[offset] === 0xff &&
    bytes[offset + 1] === 0xd8 &&
    bytes[offset + 2] === 0xff
  );
}

function findJpegEoiBefore(bytes: Uint8Array, from: number, start: number): number {
  for (let i = from - 2; i >= start + 2; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return i + 2;
  }
  return -1;
}

/** 在绘图载荷中按 PNG/JPEG 文件头切图 */
export function splitRasterImagesFromDrawingPayload(payload: Uint8Array): ExtractedRasterImage[] {
  const starts: Array<{ offset: number; mimeType: 'image/png' | 'image/jpeg' }> = [];
  for (let i = 0; i + 3 < payload.length; i++) {
    if (eqAt(payload, i, PNG_SIG)) {
      starts.push({ offset: i, mimeType: 'image/png' });
      i += 7;
      continue;
    }
    if (isJpegSoi(payload, i)) {
      starts.push({ offset: i, mimeType: 'image/jpeg' });
      i += 2;
    }
  }

  const out: ExtractedRasterImage[] = [];
  for (let s = 0; s < starts.length && out.length < MAX_IMAGES; s++) {
    const cur = starts[s]!;
    const nextOff = s + 1 < starts.length ? starts[s + 1]!.offset : payload.length;
    let end = -1;
    if (cur.mimeType === 'image/png') {
      end = findPngEnd(payload, cur.offset);
    } else {
      end = findJpegEoiBefore(payload, nextOff, cur.offset);
      if (end < 0) {
        end = findJpegEoiBefore(payload, payload.length, cur.offset);
      }
    }
    if (end <= cur.offset) continue;
    const size = end - cur.offset;
    if (size > MAX_IMAGE_BYTES) continue;
    out.push({
      mimeType: cur.mimeType,
      bytes: payload.subarray(cur.offset, end),
    });
  }
  return out;
}

function parseClientAnchorBody(body: Uint8Array, sheetIndex: number): XlsClientAnchor | null {
  // 完整记录 18 字节（9×uint16）；短记录 8 字节时无法可靠还原，跳过
  if (body.length < 18) return null;
  const col1 = u16(body, 2);
  const dx1 = u16(body, 4);
  const row1 = u16(body, 6);
  const dy1 = u16(body, 8);
  const col2 = u16(body, 10);
  const dx2 = u16(body, 12);
  const row2 = u16(body, 14);
  const dy2 = u16(body, 16);
  if (col1 > 255 || col2 > 255 || row1 > 65535 || row2 > 65535) return null;
  if (col2 < col1 || row2 < row1) return null;
  return {
    sheetIndex: Math.max(0, sheetIndex),
    col1,
    dx1,
    row1,
    dy1,
    col2,
    dx2,
    row2,
    dy2,
  };
}

/** 从 FOPT 读出图片 blip 索引（1-based）；非图片形状返回 null */
export function parseFoptBlipIndex(body: Uint8Array, propCount: number): number | null {
  if (propCount <= 0 || body.length < propCount * 6) return null;
  let blip: number | null = null;
  for (let i = 0; i < propCount; i++) {
    const opid = u16(body, i * 6);
    const value = u32(body, i * 6 + 2);
    const pid = opid & 0x3fff;
    if (pid === ESCHER_PID_BLIP && value > 0 && value <= MAX_IMAGES) {
      blip = value;
    }
  }
  return blip;
}

interface XlsPictureShape {
  blipIndex: number;
  anchor: XlsClientAnchor;
}

function parseSpContainerPicture(body: Uint8Array, sheetIndex: number): XlsPictureShape | null {
  let blipIndex: number | null = null;
  let anchor: XlsClientAnchor | null = null;
  let offset = 0;
  while (offset + 8 <= body.length) {
    const verInst = u16(body, offset);
    const type = u16(body, offset + 2);
    const len = u32(body, offset + 4);
    const version = verInst & 0x0f;
    const instance = verInst >> 4;
    const bodyStart = offset + 8;
    const bodyEnd = bodyStart + len;
    if (len < 0 || bodyEnd > body.length || bodyEnd < bodyStart) break;

    if (type === OFFICE_ART_FOPT) {
      const found = parseFoptBlipIndex(body.subarray(bodyStart, bodyEnd), instance);
      if (found != null) blipIndex = found;
    } else if (type === OFFICE_ART_CLIENT_ANCHOR) {
      anchor = parseClientAnchorBody(body.subarray(bodyStart, bodyEnd), sheetIndex);
    } else if (version === OFFICE_ART_CONTAINER_VER) {
      // 嵌套容器少见，忽略
    }
    offset = bodyEnd;
  }
  if (blipIndex == null || !anchor) return null;
  return { blipIndex, anchor };
}

/**
 * 只收集「带 blip 的图片形状」锚点（忽略文本框等其它 ClientAnchor），
 * 避免按序配对把图画到错误单元格。
 */
export function collectPictureShapesFromOfficeArt(
  bytes: Uint8Array,
  sheetIndex: number,
): XlsPictureShape[] {
  const shapes: XlsPictureShape[] = [];

  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      const verInst = u16(bytes, offset);
      const type = u16(bytes, offset + 2);
      const len = u32(bytes, offset + 4);
      const version = verInst & 0x0f;
      const bodyStart = offset + 8;
      const bodyEnd = bodyStart + len;
      if (len < 0 || bodyEnd > end || bodyEnd < bodyStart) break;

      if (type === OFFICE_ART_SP_CONTAINER) {
        const shape = parseSpContainerPicture(bytes.subarray(bodyStart, bodyEnd), sheetIndex);
        if (shape) shapes.push(shape);
      } else if (version === OFFICE_ART_CONTAINER_VER) {
        walk(bodyStart, bodyEnd);
      }
      offset = bodyEnd;
    }
  };

  walk(0, bytes.length);
  return shapes;
}

/** @deprecated 仅测试/兼容：收集全部 ClientAnchor（含非图片） */
export function collectClientAnchorsFromOfficeArt(
  bytes: Uint8Array,
  sheetIndex: number,
): XlsClientAnchor[] {
  return collectPictureShapesFromOfficeArt(bytes, sheetIndex).map((s) => s.anchor);
}

/**
 * 取锚点覆盖区域的中心所在单元格（浮动图常跨 A–B，中心落在「示意图」列）。
 */
export function resolveAnchorHostCell(
  anchor: Pick<XlsClientAnchor, 'col1' | 'dx1' | 'row1' | 'dy1' | 'col2' | 'dx2' | 'row2' | 'dy2'>,
  colWidthsPx: number[],
  rowHeightsPx: number[],
): { row: number; col: number } {
  const defCol = excelColWidthToPx(EXCEL_DEFAULT_COL_WIDTH_CHARS);
  const defRow = excelRowHeightToPx(EXCEL_DEFAULT_ROW_HEIGHT_POINTS);

  const colLeft = (col: number, dx: number): number => {
    let x = 0;
    for (let c = 0; c < col; c++) x += colWidthsPx[c] ?? defCol;
    return x + (Math.max(0, Math.min(1023, dx)) / 1024) * (colWidthsPx[col] ?? defCol);
  };
  const rowTop = (row: number, dy: number): number => {
    let y = 0;
    for (let r = 0; r < row; r++) y += rowHeightsPx[r] ?? defRow;
    return y + (Math.max(0, Math.min(255, dy)) / 256) * (rowHeightsPx[row] ?? defRow);
  };

  const midX = (colLeft(anchor.col1, anchor.dx1) + colLeft(anchor.col2, anchor.dx2)) / 2;
  const midY = (rowTop(anchor.row1, anchor.dy1) + rowTop(anchor.row2, anchor.dy2)) / 2;

  let col = anchor.col1;
  let acc = 0;
  const maxCol = Math.max(anchor.col2, colWidthsPx.length - 1, anchor.col1);
  for (let c = 0; c <= maxCol; c++) {
    const w = colWidthsPx[c] ?? defCol;
    if (midX < acc + w || c === maxCol) {
      col = c;
      break;
    }
    acc += w;
  }

  let row = anchor.row1;
  acc = 0;
  const maxRow = Math.max(anchor.row2, rowHeightsPx.length - 1, anchor.row1);
  for (let r = 0; r <= maxRow; r++) {
    const h = rowHeightsPx[r] ?? defRow;
    if (midY < acc + h || r === maxRow) {
      row = r;
      break;
    }
    acc += h;
  }

  return { row, col };
}

/** 在盒子内等比缩放（contain） */
export function fitImageInBox(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const w = Math.max(1, srcW);
  const h = Math.max(1, srcH);
  const bw = Math.max(8, boxW);
  const bh = Math.max(8, boxH);
  const scale = Math.min(bw / w, bh / h, 1);
  return {
    width: Math.max(8, Math.round(w * scale)),
    height: Math.max(8, Math.round(h * scale)),
  };
}

/** 已拿到 Workbook/Book 流字节时抽图（纯函数，便于单测） */
export function extractImagesFromXlsWorkbookStream(workbook: Uint8Array): ExtractedRasterImage[] {
  const drawing = collectMsoDrawingGroupPayload(workbook);
  let images = splitRasterImagesFromDrawingPayload(drawing);
  if (!images.length && drawing !== workbook) {
    images = splitRasterImagesFromDrawingPayload(workbook);
  }
  return images;
}

/**
 * 抽图，并用 SpContainer.blip 索引对齐锚点（避免文本框锚点干扰）。
 * blip 解析失败时回退：仅用「图片形状」锚点按序配对。
 */
export function extractAnchoredImagesFromXlsWorkbookStream(workbook: Uint8Array): XlsAnchoredImage[] {
  const images = extractImagesFromXlsWorkbookStream(workbook);
  if (!images.length) return [];

  const drawingParts = collectContinuedBiffPayloads(workbook, BIFF_MSODRAWING);
  const shapes: XlsPictureShape[] = [];
  for (const part of drawingParts) {
    if (part.sheetIndex < 0) continue;
    shapes.push(...collectPictureShapesFromOfficeArt(part.payload, part.sheetIndex));
  }

  const used = new Set<number>();
  const out: XlsAnchoredImage[] = [];

  for (const shape of shapes) {
    const idx = shape.blipIndex - 1;
    if (idx < 0 || idx >= images.length || used.has(idx)) continue;
    used.add(idx);
    out.push({ ...images[idx]!, anchor: shape.anchor });
  }

  // 有图但未挂上锚点：按剩余图片形状锚点顺序补齐
  if (out.length < images.length) {
    const freeAnchors = shapes
      .map((s) => s.anchor)
      .filter((a) => !out.some((o) => o.anchor === a));
    let ai = 0;
    for (let i = 0; i < images.length; i++) {
      if (used.has(i)) continue;
      const anchor =
        freeAnchors[ai++] ??
        ({
          sheetIndex: 0,
          col1: 1,
          dx1: 0,
          row1: Math.min(i + 1, 50),
          dy1: 0,
          col2: 2,
          dx2: 0,
          row2: Math.min(i + 2, 51),
          dy2: 0,
        } satisfies XlsClientAnchor);
      used.add(i);
      out.push({ ...images[i]!, anchor });
    }
  }

  // 按行、列排序，便于稳定渲染
  out.sort(
    (a, b) =>
      a.anchor.sheetIndex - b.anchor.sheetIndex ||
      a.anchor.row1 - b.anchor.row1 ||
      a.anchor.col1 - b.anchor.col1,
  );
  return out;
}

/**
 * .xls ClientAnchor 尺寸：列内偏移 /1024、行内 /256（相对该格宽高）。
 */
export function computeXlsClientAnchorSize(
  anchor: Pick<XlsClientAnchor, 'col1' | 'dx1' | 'row1' | 'dy1' | 'col2' | 'dx2' | 'row2' | 'dy2'>,
  colWidthsPx: number[],
  rowHeightsPx: number[],
): { width: number; height: number } {
  const defCol = excelColWidthToPx(EXCEL_DEFAULT_COL_WIDTH_CHARS);
  const defRow = excelRowHeightToPx(EXCEL_DEFAULT_ROW_HEIGHT_POINTS);

  const colX = (col: number, dx: number): number => {
    let x = 0;
    for (let c = 0; c < col; c++) x += colWidthsPx[c] ?? defCol;
    const w = colWidthsPx[col] ?? defCol;
    return x + (Math.max(0, Math.min(1023, dx)) / 1024) * w;
  };
  const rowY = (row: number, dy: number): number => {
    let y = 0;
    for (let r = 0; r < row; r++) y += rowHeightsPx[r] ?? defRow;
    const h = rowHeightsPx[row] ?? defRow;
    return y + (Math.max(0, Math.min(255, dy)) / 256) * h;
  };

  const width = colX(anchor.col2, anchor.dx2) - colX(anchor.col1, anchor.dx1);
  const height = rowY(anchor.row2, anchor.dy2) - rowY(anchor.row1, anchor.dy1);
  return {
    width: Math.max(8, Math.round(width)),
    height: Math.max(8, Math.round(height)),
  };
}

type XlsxCfb = {
  CFB: {
    read: (data: ArrayBuffer | Uint8Array, opts: { type: string }) => unknown;
    find: (cfb: unknown, path: string) => { content?: Uint8Array | number[] } | null;
  };
};

async function readWorkbookStream(buffer: ArrayBuffer): Promise<Uint8Array | null> {
  try {
    const XLSX = (await import('xlsx')) as unknown as XlsxCfb;
    const cfb = XLSX.CFB.read(new Uint8Array(buffer), { type: 'array' });
    const entry =
      XLSX.CFB.find(cfb, 'Workbook') ||
      XLSX.CFB.find(cfb, '/Workbook') ||
      XLSX.CFB.find(cfb, 'Book') ||
      XLSX.CFB.find(cfb, '/Book');
    const content = entry?.content;
    if (!content) return null;
    return content instanceof Uint8Array ? content : Uint8Array.from(content);
  } catch {
    return null;
  }
}

/** 从 .xls ArrayBuffer 提取内嵌光栅图（无锚点）。 */
export async function extractImagesFromXlsBuffer(buffer: ArrayBuffer): Promise<ExtractedRasterImage[]> {
  const root = new Uint8Array(buffer);
  if (!isOleCompound(root)) return [];
  const workbook = (await readWorkbookStream(buffer)) ?? root;
  return extractImagesFromXlsWorkbookStream(workbook);
}

/** 从 .xls ArrayBuffer 提取带单元格锚点的内嵌图。 */
export async function extractAnchoredImagesFromXlsBuffer(
  buffer: ArrayBuffer,
): Promise<XlsAnchoredImage[]> {
  const root = new Uint8Array(buffer);
  if (!isOleCompound(root)) return [];
  const workbook = (await readWorkbookStream(buffer)) ?? root;
  return extractAnchoredImagesFromXlsWorkbookStream(workbook);
}
