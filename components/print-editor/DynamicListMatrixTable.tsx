import React, { useMemo } from 'react';
import type { PrintDynamicListColumn, PrintDynamicListElementConfig, PrintListRow, PrintRenderContext } from '../../types';
import { fmtMatrixCellQtyLocal, parseColorSizeMatrixFromRow } from '../../utils/colorSizeMatrixPrint';
import { resolvePrintPlaceholders } from '../../utils/printResolve';
import { matrixKForPrintRow, matrixVisualSubRowCountForRow, sizeHeadCellLabel } from '../../utils/dynamicListMatrix';

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

function mmAt(cfg: PrintDynamicListElementConfig, paddedIndex: number): number | undefined {
  const raw = cfg.dataColumnWidthsMm?.[paddedIndex];
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function DynamicListMatrixTable({ cfg, ctx, padded, matrixIdx, listRows, serialStart }: Props) {
  const mcol = padded[matrixIdx];
  const bStyle = cfg.borderStyle === 'none' ? 'none' : cfg.borderStyle;
  const bColor = cfg.borderColor;
  const bodyPt = cfg.fontSizePt ?? 8;
  const headPt = cfg.headerFontSizePt ?? 8;
  const headBg = cfg.headerBackgroundColor || '#f1f5f9';
  const showHeader = cfg.showHeader !== false;
  const showSerial = cfg.showSerial !== false;

  const maxK = useMemo(() => {
    if (!listRows.length) return 1;
    return Math.max(1, ...listRows.map(matrixKForPrintRow));
  }, [listRows]);

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

  const bodyTrStyle: React.CSSProperties = {};
  if (cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0) {
    bodyTrStyle.height = `${cfg.bodyRowHeightMm}mm`;
    bodyTrStyle.minHeight = `${cfg.bodyRowHeightMm}mm`;
  }

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

  /** 与 tdBody 一致，保留列配置的 textAlign（勿再强制居中，否则普通列对齐无效） */
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
            {showSerial ? (
              <th style={serialThStyle}>
                {cfg.serialHeaderLabel || '序号'}
              </th>
            ) : null}
            {padded.slice(0, matrixIdx).map(col => (
              <th key={col.id} style={thStyle(col)}>
                {col.headerLabel}
              </th>
            ))}
            <th style={thStyle(mcol)}>{mcol.matrixColorHeader ?? '颜色'}</th>
            <th colSpan={maxK} style={thStyle(mcol)}>
              {mcol.matrixSizeGroupTitle ?? '尺码数量'}
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
          const p = parseColorSizeMatrixFromRow(row);
          const K = matrixKForPrintRow(row);
          const colorRows =
            p && p.colorRows.length > 0 ? p.colorRows : [{ colorName: '', quantities: [] as number[] }];
          const totalSubRows = matrixVisualSubRowCountForRow(row);
          const productTop = ri > 0;
          const topExtra: React.CSSProperties | undefined =
            productTop && bStyle !== 'none'
              ? { borderTop: `${BORDER_THICK} ${bStyle} ${bColor}` }
              : undefined;

          return (
            <React.Fragment key={ri}>
              {Array.from({ length: totalSubRows }, (_, sj) => {
                const isSizeRow = sj === 0;
                const colorIdx = sj - 1;
                const cr = !isSizeRow ? colorRows[colorIdx] ?? { colorName: '', quantities: [] } : null;

                return (
                  <tr key={`${ri}-${sj}`} style={bodyTrStyle}>
                    {showSerial && isSizeRow ? (
                      <td rowSpan={totalSubRows} style={serialTdStyle(topExtra)}>
                        {curSerial}
                      </td>
                    ) : null}
                    {padded.slice(0, matrixIdx).map(col => {
                      if (!isSizeRow) return null;
                      const text = resolvePrintPlaceholders(col.contentTemplate, rowCtx);
                      return (
                        <td key={col.id} rowSpan={totalSubRows} style={tdMerged(col, topExtra)}>
                          {text || '\u00a0'}
                        </td>
                      );
                    })}
                    {isSizeRow ? (
                      <>
                        <td style={tdBody(mcol, topExtra)}>{'\u00a0'}</td>
                        {Array.from({ length: maxK }, (_, qi) => (
                          <td key={`sh-${qi}`} style={tdBody(mcol, topExtra)}>
                            {p ? sizeHeadCellLabel(p, qi, K, maxK) : '\u00a0'}
                          </td>
                        ))}
                      </>
                    ) : (
                      <>
                        <td style={tdBody(mcol)}>{cr?.colorName || '\u00a0'}</td>
                        {Array.from({ length: maxK }, (_, qi) => {
                          const q = cr && qi < cr.quantities.length ? cr.quantities[qi] ?? 0 : 0;
                          const inK = qi < K;
                          return (
                            <td key={`q-${qi}`} style={tdBody(mcol)}>
                              {inK ? fmtMatrixCellQtyLocal(q) : '\u00a0'}
                            </td>
                          );
                        })}
                      </>
                    )}
                    {padded.slice(matrixIdx + 1).map(col => {
                      if (!isSizeRow) return null;
                      const text = resolvePrintPlaceholders(col.contentTemplate, rowCtx);
                      return (
                        <td key={col.id} rowSpan={totalSubRows} style={tdMerged(col, topExtra)}>
                          {text || '\u00a0'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
