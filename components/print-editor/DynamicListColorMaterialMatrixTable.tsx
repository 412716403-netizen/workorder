import React, { useMemo } from 'react';
import type { PrintDynamicListColumn, PrintDynamicListElementConfig, PrintListRow, PrintRenderContext } from '../../types';
import type { ColorMaterialMatrixMaterialCell } from '../../utils/colorMaterialMatrixPrint';
import { parseColorMaterialMatrixFromRow } from '../../utils/colorMaterialMatrixPrint';
import { isLikelyPrintImageUrl, resolvePrintPlaceholders } from '../../utils/printResolve';
import { matrixKForPrintRow, matrixVisualSubRowCountForRow } from '../../utils/dynamicListMatrix';
import { DYNAMIC_LIST_DEFAULT_BODY_ROW_MM } from '../../utils/printListPagination';

const BORDER_THIN = '0.25mm';
const BORDER_THICK = '0.55mm';

type Props = {
  cfg: PrintDynamicListElementConfig;
  ctx: PrintRenderContext;
  padded: PrintDynamicListColumn[];
  matrixIdx: number;
  listRows: PrintListRow[];
  serialStart: number;
};

type SegNode = { kind: 'node'; nodeName: string };
type SegPair = { kind: 'pair'; colorName: string; materials: ColorMaterialMatrixMaterialCell[] };
type Seg = SegNode | SegPair;

function renderCellContent(text: string, maxHeightMm: number): React.ReactNode {
  if (isLikelyPrintImageUrl(text)) {
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={text}
          alt=""
          style={{ maxWidth: '100%', maxHeight: `${maxHeightMm}mm`, width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }
  return text || '\u00a0';
}

function segmentsForMaterialMatrix(row: PrintListRow): Seg[] {
  const p = parseColorMaterialMatrixFromRow(row);
  const out: Seg[] = [];
  if (!p || p.nodeBlocks.length === 0) {
    out.push({ kind: 'pair', colorName: '—', materials: [] });
    return out;
  }
  for (const b of p.nodeBlocks) {
    out.push({ kind: 'node', nodeName: b.nodeName });
    for (const cr of b.colorRows) {
      out.push({ kind: 'pair', colorName: cr.colorName, materials: cr.materials });
    }
  }
  return out;
}

function mmAt(cfg: PrintDynamicListElementConfig, paddedIndex: number): number | undefined {
  const raw = cfg.dataColumnWidthsMm?.[paddedIndex];
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function DynamicListColorMaterialMatrixTable({ cfg, ctx, padded, matrixIdx, listRows, serialStart }: Props) {
  const mcol = padded[matrixIdx];
  const bStyle = cfg.borderStyle === 'none' ? 'none' : cfg.borderStyle;
  const bColor = cfg.borderColor;
  const bodyPt = cfg.fontSizePt ?? 8;
  const headPt = cfg.headerFontSizePt ?? 8;
  const headBg = cfg.headerBackgroundColor || '#f1f5f9';
  const showHeader = cfg.showHeader !== false;
  const showSerial = cfg.showSerial !== false;
  const rowHeightMm = cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0 ? cfg.bodyRowHeightMm : 6;

  const maxK = useMemo(() => {
    if (!listRows.length) return 1;
    return Math.max(1, ...listRows.map(r => matrixKForPrintRow(r, cfg)));
  }, [listRows, cfg]);

  const colSpecs = useMemo(() => {
    const out: { key: string; wMm?: number }[] = [];
    if (showSerial) {
      const s = cfg.serialColumnWidthMm;
      const sn = s != null && s !== '' ? (typeof s === 'number' ? s : Number(s)) : NaN;
      out.push({ key: 'serial', wMm: Number.isFinite(sn) && sn > 0 ? sn : undefined });
    }
    for (let i = 0; i < matrixIdx; i++) {
      out.push({ key: `l-${padded[i].id}`, wMm: mmAt(cfg, i) });
    }
    const matrixBlockMm = mmAt(cfg, matrixIdx);
    if (matrixBlockMm != null && matrixBlockMm > 0) {
      const each = matrixBlockMm / (1 + maxK);
      for (let q = 0; q <= maxK; q++) {
        out.push({ key: `m-${q}`, wMm: each });
      }
    } else {
      for (let q = 0; q <= maxK; q++) {
        out.push({ key: `m-${q}`, wMm: undefined });
      }
    }
    for (let i = matrixIdx + 1; i < padded.length; i++) {
      out.push({ key: `r-${padded[i].id}`, wMm: mmAt(cfg, i) });
    }
    return out;
  }, [cfg, padded, matrixIdx, maxK, showSerial]);

  const headerTrStyle: React.CSSProperties = {};
  if (cfg.headerRowHeightMm != null && cfg.headerRowHeightMm > 0) {
    headerTrStyle.height = `${cfg.headerRowHeightMm}mm`;
    headerTrStyle.minHeight = `${cfg.headerRowHeightMm}mm`;
  }

  const bodyRowHeightMm =
    cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0
      ? cfg.bodyRowHeightMm
      : DYNAMIC_LIST_DEFAULT_BODY_ROW_MM;
  const bodyTrStyle: React.CSSProperties = {
    height: `${bodyRowHeightMm}mm`,
    minHeight: `${bodyRowHeightMm}mm`,
  };

  const borderCell = (extra: React.CSSProperties = {}): React.CSSProperties =>
    bStyle === 'none'
      ? { boxSizing: 'border-box' as const, ...extra }
      : {
          boxSizing: 'border-box' as const,
          border: `${BORDER_THIN} ${bStyle} ${bColor}`,
          ...extra,
        };

  const thStyle = (col: PrintDynamicListColumn): React.CSSProperties => ({
    ...borderCell(),
    backgroundColor: headBg,
    fontSize: `${col.headerFontSizePt ?? headPt}pt`,
    fontWeight: col.headerFontWeight === 'normal' ? 400 : col.headerFontWeight === 'bold' ? 700 : 600,
    textAlign: (col.textAlign ?? 'center') as const,
    padding: '0.25mm 0.35mm',
    verticalAlign: 'middle' as const,
    color: col.color,
    lineHeight: 1.1,
    wordBreak: 'break-all' as const,
  });

  const serialThStyle: React.CSSProperties = {
    ...borderCell(),
    backgroundColor: headBg,
    fontSize: `${headPt}pt`,
    fontWeight: 600,
    textAlign: 'center',
    padding: '0.25mm 0.35mm',
    verticalAlign: 'middle',
    color: '#000000',
    lineHeight: 1.1,
  };

  const tdBody = (col: PrintDynamicListColumn, extra?: React.CSSProperties): React.CSSProperties => ({
    ...borderCell(extra),
    fontSize: `${col.fontSizePt ?? bodyPt}pt`,
    fontWeight: col.fontWeight === 'bold' ? 700 : 400,
    textAlign: col.textAlign,
    padding: '0.2mm 0.35mm',
    verticalAlign: 'middle',
    color: col.color,
    lineHeight: 1.12,
    wordBreak: 'break-all' as const,
  });

  const tdMerged = (col: PrintDynamicListColumn, extra?: React.CSSProperties): React.CSSProperties => ({
    ...tdBody(col, extra),
  });

  const serialTdStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    ...borderCell(extra),
    fontSize: `${bodyPt}pt`,
    fontWeight: 600,
    textAlign: 'center',
    padding: '0.2mm 0.35mm',
    verticalAlign: 'middle',
    color: '#0f172a',
    lineHeight: 1.12,
  });

  return (
    <table
      className="w-full border-collapse"
      style={{
        tableLayout: 'fixed',
        fontSize: `${bodyPt}pt`,
        border: bStyle === 'none' ? undefined : `0.35mm ${bStyle} ${bColor}`,
      }}
    >
      <colgroup>
        {colSpecs.map(s => (
          <col key={s.key} style={s.wMm != null && s.wMm > 0 ? { width: `${s.wMm}mm` } : undefined} />
        ))}
      </colgroup>
      {showHeader ? (
        <thead>
          <tr style={headerTrStyle}>
            {showSerial ? <th style={serialThStyle}>{cfg.serialHeaderLabel || '序号'}</th> : null}
            {padded.slice(0, matrixIdx).map(col => (
              <th key={col.id} style={thStyle(col)}>
                {col.headerLabel}
              </th>
            ))}
            <th style={thStyle(mcol)}>{mcol.matrixColorHeader ?? '颜色'}</th>
            <th colSpan={maxK} style={thStyle(mcol)}>
              {mcol.matrixSizeGroupTitle ?? '工序物料'}
            </th>
            {padded.slice(matrixIdx + 1).map(col => (
              <th key={col.id} style={thStyle(col)}>
                {col.headerLabel}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {listRows.map((row, ri) => {
          const rowCtx: PrintRenderContext = { ...ctx, listRow: row };
          const curSerial = serialStart + ri;
          const segments = segmentsForMaterialMatrix(row);
          const totalSubRows = matrixVisualSubRowCountForRow(row, cfg);
          const K = matrixKForPrintRow(row, cfg);
          const productTop = ri > 0;
          const topExtra: React.CSSProperties | undefined =
            productTop && bStyle !== 'none'
              ? { borderTop: `${BORDER_THICK} ${bStyle} ${bColor}` }
              : undefined;

          let rowOrdinal = 0;
          const bodyRows: React.ReactNode[] = [];

          for (let si = 0; si < segments.length; si++) {
            const seg = segments[si]!;
            const isFirstRowOfProduct = rowOrdinal === 0;

            if (seg.kind === 'node') {
              bodyRows.push(
                <tr key={`${ri}-${rowOrdinal}-node`} style={bodyTrStyle}>
                  {showSerial && isFirstRowOfProduct ? (
                    <td rowSpan={totalSubRows} style={serialTdStyle(topExtra)}>
                      {curSerial}
                    </td>
                  ) : null}
                  {padded.slice(0, matrixIdx).map(col => {
                    if (!isFirstRowOfProduct) return null;
                    const text = resolvePrintPlaceholders(col.contentTemplate, rowCtx);
                    return (
                      <td key={col.id} rowSpan={totalSubRows} style={tdMerged(col, topExtra)}>
                        {renderCellContent(text, rowHeightMm * totalSubRows)}
                      </td>
                    );
                  })}
                  <td style={tdBody(mcol, isFirstRowOfProduct ? topExtra : undefined)}>{'\u00a0'}</td>
                  <td
                    colSpan={maxK}
                    style={tdBody(mcol, {
                      ...(isFirstRowOfProduct ? topExtra : undefined),
                      textAlign: 'center',
                      fontWeight: 600,
                    })}
                  >
                    {seg.nodeName.trim() || '\u00a0'}
                  </td>
                  {padded.slice(matrixIdx + 1).map(col => {
                    if (!isFirstRowOfProduct) return null;
                    const text = resolvePrintPlaceholders(col.contentTemplate, rowCtx);
                    return (
                      <td key={col.id} rowSpan={totalSubRows} style={tdMerged(col, topExtra)}>
                        {renderCellContent(text, rowHeightMm * totalSubRows)}
                      </td>
                    );
                  })}
                </tr>,
              );
              rowOrdinal += 1;
              continue;
            }

            const namesTop = isFirstRowOfProduct ? topExtra : undefined;
            bodyRows.push(
              <tr key={`${ri}-${rowOrdinal}-pair-a`} style={bodyTrStyle}>
                {showSerial && isFirstRowOfProduct ? (
                  <td rowSpan={totalSubRows} style={serialTdStyle(topExtra)}>
                    {curSerial}
                  </td>
                ) : null}
                {padded.slice(0, matrixIdx).map(col => {
                  if (!isFirstRowOfProduct) return null;
                  const text = resolvePrintPlaceholders(col.contentTemplate, rowCtx);
                  return (
                    <td key={col.id} rowSpan={totalSubRows} style={tdMerged(col, topExtra)}>
                      {renderCellContent(text, rowHeightMm * totalSubRows)}
                    </td>
                  );
                })}
                <td rowSpan={2} style={tdBody(mcol, namesTop)}>
                  {seg.colorName || '\u00a0'}
                </td>
                {Array.from({ length: maxK }, (_, qi) => {
                  const m = qi < seg.materials.length ? seg.materials[qi] : undefined;
                  const inK = qi < K;
                  const txt = inK && m?.name != null && String(m.name).trim() !== '' ? String(m.name) : '';
                  return (
                    <td key={`nm-${qi}`} style={tdBody(mcol, namesTop)}>
                      {txt || '\u00a0'}
                    </td>
                  );
                })}
                {padded.slice(matrixIdx + 1).map(col => {
                  if (!isFirstRowOfProduct) return null;
                  const text = resolvePrintPlaceholders(col.contentTemplate, rowCtx);
                  return (
                    <td key={col.id} rowSpan={totalSubRows} style={tdMerged(col, topExtra)}>
                      {text || '\u00a0'}
                    </td>
                  );
                })}
              </tr>,
            );
            rowOrdinal += 1;

            bodyRows.push(
              <tr key={`${ri}-${rowOrdinal}-pair-b`} style={bodyTrStyle}>
                {Array.from({ length: maxK }, (_, qi) => {
                  const m = qi < seg.materials.length ? seg.materials[qi] : undefined;
                  const inK = qi < K;
                  const txt = inK && m?.ratio != null && String(m.ratio).trim() !== '' ? String(m.ratio) : '';
                  return (
                    <td key={`rt-${qi}`} style={tdBody(mcol)}>
                      {txt || '\u00a0'}
                    </td>
                  );
                })}
              </tr>,
            );
            rowOrdinal += 1;
          }

          return (
            <React.Fragment key={ri}>
              {bodyRows}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
