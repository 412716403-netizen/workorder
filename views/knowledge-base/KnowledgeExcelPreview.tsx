import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchKnowledgeAssetBlob } from '../../services/api/knowledgeBase';
import {
  computeAnchoredImageSize,
  excelColWidthToPx,
  excelRowHeightToPx,
  formatExcelCellValue,
  parseCellRange,
} from '../../utils/excelPreview';

/** 防止超大表拖垮渲染 */
const MAX_ROWS = 1000;
const MAX_COLS = 100;

interface CellImage {
  url: string;
  width: number;
  height: number;
}

interface GridCell {
  text: string;
  rowSpan: number;
  colSpan: number;
  images: CellImage[];
}

interface SheetGrid {
  name: string;
  colWidths: number[];
  rowHeights: number[];
  /** null 表示被合并区覆盖的从属单元格（不渲染） */
  rows: Array<Array<GridCell | null>>;
}

/** SheetJS 回退（.xls 等 ExcelJS 无法解析的旧格式，无图片） */
interface HtmlSheet {
  name: string;
  html: string;
}

type ParseResult =
  | { mode: 'grid'; sheets: SheetGrid[] }
  | { mode: 'html'; sheets: HtmlSheet[] };

const RENDERABLE_IMAGE_EXT = new Set(['png', 'jpeg', 'jpg', 'gif']);

async function parseWithExcelJS(
  buffer: ArrayBuffer,
  registerUrl: (url: string) => void,
): Promise<SheetGrid[]> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  await wb.xlsx.load(buffer);

  const sheets: SheetGrid[] = [];
  wb.eachSheet((ws) => {
    // 图片锚点可能落在正文行列之外（如表尾简图），行列数需覆盖锚点
    const rawImages = ws.getImages();
    let maxImageRow = 0;
    let maxImageCol = 0;
    for (const img of rawImages) {
      maxImageRow = Math.max(maxImageRow, img.range.br.nativeRow + 1);
      maxImageCol = Math.max(maxImageCol, img.range.br.nativeCol + 1);
    }
    const rowCount = Math.min(Math.max(ws.rowCount, maxImageRow), MAX_ROWS);
    const colCount = Math.min(Math.max(ws.columnCount, maxImageCol, 1), MAX_COLS);

    const colWidths: number[] = [];
    for (let c = 1; c <= colCount; c++) {
      colWidths.push(excelColWidthToPx(ws.getColumn(c).width));
    }
    const rowHeights: number[] = [];
    for (let r = 1; r <= rowCount; r++) {
      rowHeights.push(excelRowHeightToPx(ws.getRow(r).height));
    }

    // 合并区：master 记录跨行列，covered 指回 master
    const spanByMaster = new Map<string, { rowSpan: number; colSpan: number }>();
    const coveredToMaster = new Map<string, string>();
    for (const rangeStr of ws.model.merges ?? []) {
      const range = parseCellRange(rangeStr);
      if (!range) continue;
      const masterKey = `${range.top},${range.left}`;
      spanByMaster.set(masterKey, {
        rowSpan: range.bottom - range.top + 1,
        colSpan: range.right - range.left + 1,
      });
      for (let r = range.top; r <= range.bottom; r++) {
        for (let c = range.left; c <= range.right; c++) {
          const key = `${r},${c}`;
          if (key !== masterKey) coveredToMaster.set(key, masterKey);
        }
      }
    }

    // 图片：按 tl 锚点归入单元格；锚点落在合并区从属格时归到 master
    const imagesByCell = new Map<string, CellImage[]>();
    for (const img of rawImages) {
      const media = wb.getImage(Number(img.imageId));
      if (!media?.buffer) continue;
      const ext = (media.extension || '').toLowerCase();
      if (!RENDERABLE_IMAGE_EXT.has(ext)) continue;
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const blob = new Blob([media.buffer as unknown as BlobPart], { type: mime });
      const url = URL.createObjectURL(blob);
      registerUrl(url);
      const { tl, br } = img.range;
      const size = computeAnchoredImageSize(tl, br, colWidths, rowHeights);
      let key = `${tl.nativeRow},${tl.nativeCol}`;
      key = coveredToMaster.get(key) ?? key;
      const list = imagesByCell.get(key) ?? [];
      list.push({ url, ...size });
      imagesByCell.set(key, list);
    }

    const rows: Array<Array<GridCell | null>> = [];
    for (let r = 0; r < rowCount; r++) {
      const row: Array<GridCell | null> = [];
      const wsRow = ws.getRow(r + 1);
      for (let c = 0; c < colCount; c++) {
        const key = `${r},${c}`;
        if (coveredToMaster.has(key)) {
          row.push(null);
          continue;
        }
        const span = spanByMaster.get(key);
        row.push({
          text: formatExcelCellValue(wsRow.getCell(c + 1).value),
          rowSpan: span?.rowSpan ?? 1,
          colSpan: span?.colSpan ?? 1,
          images: imagesByCell.get(key) ?? [],
        });
      }
      rows.push(row);
    }

    sheets.push({ name: ws.name, colWidths, rowHeights, rows });
  });

  if (!sheets.length) throw new Error('empty workbook');
  return sheets;
}

async function parseWithSheetJS(buffer: ArrayBuffer): Promise<HtmlSheet[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheets = wb.SheetNames.map((name) => ({
    name,
    html: XLSX.utils.sheet_to_html(wb.Sheets[name]),
  }));
  return sheets.length ? sheets : [{ name: 'Sheet1', html: '<table></table>' }];
}

const KnowledgeExcelPreview: React.FC<{ assetUrl: string }> = ({ assetUrl }) => {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    setActiveIdx(0);

    const registerUrl = (url: string) => objectUrlsRef.current.push(url);

    (async () => {
      try {
        const blob = await fetchKnowledgeAssetBlob(assetUrl);
        const buffer = await blob.arrayBuffer();
        let parsed: ParseResult;
        try {
          parsed = { mode: 'grid', sheets: await parseWithExcelJS(buffer, registerUrl) };
        } catch {
          // .xls（BIFF）等旧格式 ExcelJS 不支持，回退 SheetJS（无图片）
          parsed = { mode: 'html', sheets: await parseWithSheetJS(buffer) };
        }
        if (!cancelled) setResult(parsed);
      } catch {
        if (!cancelled) setError('无法解析该表格文件');
      }
    })();

    return () => {
      cancelled = true;
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
    };
  }, [assetUrl]);

  if (error) {
    return <div className="kb-file-preview-hint">{error}</div>;
  }
  if (!result) {
    return (
      <div className="kb-file-preview-hint">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <span>正在加载表格…</span>
      </div>
    );
  }

  const names = result.sheets.map(s => s.name);
  const idx = Math.min(activeIdx, result.sheets.length - 1);

  return (
    <div className="kb-excel-preview">
      <div className="kb-excel-sheet">
        {result.mode === 'html' ? (
          <div dangerouslySetInnerHTML={{ __html: result.sheets[idx].html }} />
        ) : (
          <ExcelGridTable grid={result.sheets[idx]} />
        )}
      </div>
      {names.length > 1 && (
        <div className="kb-excel-tabs">
          {names.map((name, i) => (
            <button
              key={name + i}
              type="button"
              className={`kb-excel-tab${i === idx ? ' is-active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ExcelGridTable: React.FC<{ grid: SheetGrid }> = ({ grid }) => (
  <table className="kb-excel-grid">
    <colgroup>
      {grid.colWidths.map((w, i) => (
        <col key={i} style={{ width: `${w}px`, minWidth: `${Math.min(w, 48)}px` }} />
      ))}
    </colgroup>
    <tbody>
      {grid.rows.map((row, r) => (
        <tr key={r} style={{ height: `${grid.rowHeights[r]}px` }}>
          {row.map((cell, c) => {
            if (!cell) return null;
            return (
              <td key={c} rowSpan={cell.rowSpan} colSpan={cell.colSpan}>
                {cell.images.map((img, i) => (
                  <img
                    key={i}
                    src={img.url}
                    alt=""
                    className="kb-excel-img"
                    style={{ width: `${img.width}px`, height: `${img.height}px` }}
                    loading="lazy"
                  />
                ))}
                {cell.text}
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
);

export default KnowledgeExcelPreview;
