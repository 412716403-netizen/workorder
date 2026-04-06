import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type {
  PrintBodyElement,
  PrintHeaderFooterConfig,
  PrintImageElementConfig,
  PrintLineElementConfig,
  PrintListRow,
  PrintRenderContext,
  PrintTemplate,
} from '../../types';
import { computeListPaginationSummary, getListRowsForPrintPage } from '../../utils/printListPagination';
import {
  resolvePrintPlaceholders,
  formatNumberForPrint,
  resolvePrintImageSrc,
  isLikelyPrintImageUrl,
} from '../../utils/printResolve';
import { getPaperMarginsMm, getPrintLayoutMetrics, getPrintOutputPageCount } from './layoutMetrics';

function dynamicListGridTemplateColumns(
  showSerial: boolean,
  serialWidthMm: number | undefined,
  nData: number,
  dataWidthsMm: number[] | undefined,
): string {
  const parts: string[] = [];
  if (showSerial) {
    if (serialWidthMm != null && serialWidthMm > 0) {
      parts.push(`minmax(0, ${serialWidthMm}mm)`);
    } else {
      parts.push('minmax(8mm, 0.35fr)');
    }
  }
  const w = dataWidthsMm ?? [];
  for (let i = 0; i < nData; i++) {
    const mm = w[i];
    if (mm != null && mm > 0) {
      parts.push(`minmax(0, ${mm}mm)`);
    } else {
      parts.push('minmax(0, 1fr)');
    }
  }
  return parts.join(' ');
}

/** 编辑器画布：纸张边距区（padding 外圈）斜纹，与可打印白底区分 */
const EDITOR_MARGIN_STRIPES =
  'linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 50%, #f0f0f0 50%, #f0f0f0 75%, transparent 75%, transparent)';

function HeaderFooterBand({
  config,
  ctx,
  position,
}: {
  config: PrintHeaderFooterConfig;
  ctx: PrintRenderContext;
  position: 'header' | 'footer';
}) {
  const h = `${config.heightMm}mm`;
  const itemBySlot = (slot: 'left' | 'center' | 'right') =>
    config.items.find(i => i.slot === slot) ?? {
      slot,
      content: '',
      fontSizePt: 9,
      fontWeight: 'normal' as const,
      textAlign: slot,
      color: '#111',
    };

  const renderItem = (slot: 'left' | 'center' | 'right') => {
    const it = itemBySlot(slot);
    const text = resolvePrintPlaceholders(it.content, ctx);
    return (
      <div
        key={slot}
        className="min-w-0 truncate px-1"
        style={{
          fontSize: `${it.fontSizePt}pt`,
          fontWeight: it.fontWeight,
          textAlign: it.textAlign,
          color: it.color,
        }}
        title={text}
      >
        {text}
      </div>
    );
  };

  return (
    <div
      className="flex w-full shrink-0 items-stretch"
      style={{
        height: h,
        backgroundColor: config.backgroundColor,
        borderBottom: position === 'header' ? `${config.borderWidthMm}mm solid ${config.borderColor}` : undefined,
        borderTop: position === 'footer' ? `${config.borderWidthMm}mm solid ${config.borderColor}` : undefined,
      }}
    >
      <div className="grid w-full grid-cols-3 items-center gap-1 px-1">
        {renderItem('left')}
        {renderItem('center')}
        {renderItem('right')}
      </div>
    </div>
  );
}

function BodyElementView({
  el,
  ctx,
  editorMode,
  listPageChunk,
}: {
  el: PrintBodyElement;
  ctx: PrintRenderContext;
  editorMode?: {
    selectedId: string | null;
    onSelectElement: (id: string) => void;
    onElementPointerDown?: (el: PrintBodyElement, e: React.PointerEvent) => void;
  };
  /** 动态列表多页打印时当前页的明细切片；无则单行预览 */
  listPageChunk?: { rows: PrintListRow[]; serialStart: number };
}) {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${el.x}mm`,
    top: `${el.y}mm`,
    width: `${el.width}mm`,
    height: `${Math.max(el.height, 0.5)}mm`,
    zIndex: el.zIndex,
    boxSizing: 'border-box',
    pointerEvents: editorMode ? 'auto' : 'none',
  };

  switch (el.type) {
    case 'text': {
      const c = el.config as import('../../types').PrintTextElementConfig;
      let display = resolvePrintPlaceholders(c.content, ctx);
      if (c.displayFormat === 'number' && display && !Number.isNaN(Number(display))) {
        display = formatNumberForPrint(Number(display), c.thousandSeparator, c.uppercase);
      }
      const wrap = (node: React.ReactNode) => (
        <div
          role="presentation"
          style={style}
          className={`cursor-move ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
          onClick={e => {
            e.stopPropagation();
            editorMode?.onSelectElement(el.id);
          }}
          onPointerDown={e => {
            editorMode?.onElementPointerDown?.(el, e);
          }}
        >
          {node}
        </div>
      );
      if (c.renderAsQr) {
        return wrap(
          <div className="h-full w-full overflow-hidden">
            <QRCodeSVG value={display || '-'} style={{ width: '100%', height: '100%' }} />
          </div>,
        );
      }
      return wrap(
        <div
          style={{
            fontSize: `${c.fontSizePt}pt`,
            fontWeight: c.fontWeight,
            textAlign: c.textAlign,
            color: c.color,
            overflow: 'hidden',
            wordBreak: 'break-all',
            whiteSpace: 'pre-line',
            lineHeight: 1.2,
            height: '100%',
          }}
        >
          {display}
        </div>,
      );
    }
    case 'qrcode': {
      const c = el.config as import('../../types').PrintQRCodeElementConfig;
      const v = resolvePrintPlaceholders(c.content, ctx) || '-';
      return (
        <div
          role="presentation"
          style={style}
          className={`flex cursor-move items-center justify-center overflow-hidden bg-white ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
          onClick={e => {
            e.stopPropagation();
            editorMode?.onSelectElement(el.id);
          }}
          onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
        >
          <QRCodeSVG value={v.length > 2000 ? v.slice(0, 2000) : v} style={{ width: '100%', height: '100%' }} />
        </div>
      );
    }
    case 'line': {
      const c = el.config as PrintLineElementConfig;
      const thicknessMm = Math.max(0.05, c.thicknessMm);
      const angleDeg = c.angleDeg ?? 0;
      const borderStyle = c.lineStyle === 'solid' ? 'solid' : c.lineStyle === 'dashed' ? 'dashed' : 'dotted';
      return (
        <div
          role="presentation"
          style={{
            ...style,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'visible',
            boxSizing: 'border-box',
          }}
          className="cursor-move"
          onClick={e => {
            e.stopPropagation();
            editorMode?.onSelectElement(el.id);
          }}
          onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
        >
          <div
            style={{
              width: `${el.width}mm`,
              height: 0,
              borderTopWidth: `${thicknessMm}mm`,
              borderTopStyle: borderStyle,
              borderTopColor: c.color,
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              backgroundColor: 'transparent',
              transform: `rotate(${angleDeg}deg)`,
              transformOrigin: 'center center',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          />
        </div>
      );
    }
    case 'rect': {
      const c = el.config as import('../../types').PrintRectElementConfig;
      return (
        <div
          role="presentation"
          style={{
            ...style,
            borderWidth: `${c.borderWidthMm}mm`,
            borderColor: c.borderColor,
            borderStyle: c.lineStyle === 'solid' ? 'solid' : c.lineStyle === 'dashed' ? 'dashed' : 'dotted',
            backgroundColor: c.fillColor === 'transparent' ? 'transparent' : c.fillColor,
            borderRadius: `${c.cornerRadiusMm}mm`,
          }}
          className={`cursor-move ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
          onClick={e => {
            e.stopPropagation();
            editorMode?.onSelectElement(el.id);
          }}
          onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
        />
      );
    }
    case 'image': {
      const c = el.config as PrintImageElementConfig;
      const resolved = resolvePrintImageSrc(c, ctx);
      const showImg = isLikelyPrintImageUrl(resolved);
      const op = (c.opacityPct ?? 100) / 100;
      const objectFit = c.keepAspectRatio !== false ? ('contain' as const) : ('fill' as const);
      return (
        <div
          role="presentation"
          style={{
            ...style,
            opacity: op,
            overflow: 'hidden',
            backgroundColor: '#f1f5f9',
            boxSizing: 'border-box',
          }}
          className={`cursor-move ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
          onClick={e => {
            e.stopPropagation();
            editorMode?.onSelectElement(el.id);
          }}
          onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
        >
          {showImg ? (
            <img src={resolved} alt="" style={{ width: '100%', height: '100%', objectFit, display: 'block' }} />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[7pt] font-bold text-slate-400">
              <ImageIcon className="h-[18%] w-[18%] min-h-[14px] min-w-[14px] opacity-60" strokeWidth={1.5} />
              <span>请配置图片</span>
            </div>
          )}
        </div>
      );
    }
    case 'dynamicTable': {
      const c = el.config as import('../../types').PrintTableElementConfig;
      const cells: React.ReactNode[] = [];
      for (let r = 0; r < c.rows; r++) {
        for (let col = 0; col < c.cols; col++) {
          const key = `${r}-${col}`;
          const raw = c.cells[key] ?? '';
          const text = resolvePrintPlaceholders(raw, ctx);
          const ta = c.cellTextAlign?.[key] ?? 'center';
          const jc = ta === 'left' ? 'flex-start' : ta === 'right' ? 'flex-end' : 'center';
          const cellColor = c.cellColors?.[key] ?? '#000000';
          const fpt = c.cellFontSizePt?.[key] ?? 6;
          const fw = c.cellFontWeight?.[key] === 'bold' ? 700 : 400;
          cells.push(
            <div
              key={key}
              className="flex items-center border border-slate-400 px-0.5 leading-tight"
              style={{
                borderStyle: c.borderStyle === 'none' ? 'none' : c.borderStyle,
                borderColor: c.borderColor,
                gridRow: r + 1,
                gridColumn: col + 1,
                justifyContent: jc,
                color: cellColor,
                fontSize: `${fpt}pt`,
                fontWeight: fw,
              }}
            >
              {text}
            </div>,
          );
        }
      }
      return (
        <div
          role="presentation"
          style={{
            ...style,
            display: 'grid',
            gridTemplateColumns: `repeat(${c.cols}, 1fr)`,
            gridTemplateRows: `repeat(${c.rows}, 1fr)`,
          }}
          className={`cursor-move ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
          onClick={e => {
            e.stopPropagation();
            editorMode?.onSelectElement(el.id);
          }}
          onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
        >
          {cells}
        </div>
      );
    }
    case 'dynamicList': {
      const cfg = el.config as import('../../types').PrintDynamicListElementConfig;
      const rawCols = cfg.columns ?? [];
      const n = Math.max(1, cfg.dataColumnCount ?? (rawCols.length || 3));
      const dataCols = rawCols.slice(0, n);
      const padded =
        dataCols.length >= n
          ? dataCols
          : [
              ...dataCols,
              ...Array.from({ length: n - dataCols.length }, (_, i) => ({
                id: `pad-${i}`,
                headerLabel: `列${dataCols.length + i + 1}`,
                contentTemplate: '',
                textAlign: 'left' as const,
                color: '#000000',
              })),
            ];
      const totalCols = (cfg.showSerial ? 1 : 0) + padded.length;
      const colTpl = dynamicListGridTemplateColumns(
        cfg.showSerial,
        cfg.serialColumnWidthMm,
        padded.length,
        cfg.dataColumnWidthsMm,
      );
      const headerRowH = cfg.headerRowHeightMm != null && cfg.headerRowHeightMm > 0 ? `${cfg.headerRowHeightMm}mm` : undefined;
      const bodyRowH = cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0 ? `${cfg.bodyRowHeightMm}mm` : undefined;
      const bStyle = cfg.borderStyle === 'none' ? 'none' : cfg.borderStyle;
      const cellBorder: React.CSSProperties =
        bStyle === 'none'
          ? { boxSizing: 'border-box' }
          : {
              borderWidth: 0.5,
              borderStyle: bStyle,
              borderColor: cfg.borderColor,
              boxSizing: 'border-box',
            };

      const headerRow =
        cfg.showHeader && totalCols > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: colTpl,
              gridTemplateRows: headerRowH ?? 'minmax(0, auto)',
              minHeight: headerRowH ? undefined : '3mm',
              backgroundColor: cfg.headerBackgroundColor || '#f1f5f9',
            }}
          >
            {cfg.showSerial ? (
              <div
                key="h-serial"
                className="flex min-h-0 items-center justify-center px-0.5 py-0.5"
                style={{
                  ...cellBorder,
                  fontSize: `${cfg.headerFontSizePt ?? 8}pt`,
                  fontWeight: 600,
                }}
              >
                {cfg.serialHeaderLabel || '序号'}
              </div>
            ) : null}
            {padded.map(col => {
              const hpt = col.headerFontSizePt ?? cfg.headerFontSizePt ?? 8;
              const hw =
                col.headerFontWeight === 'bold' ? 700 : col.headerFontWeight === 'normal' ? 400 : 600;
              return (
                <div
                  key={`h-${col.id}`}
                  className="flex min-h-0 items-center justify-center px-0.5 py-0.5"
                  style={{ ...cellBorder, textAlign: col.textAlign, fontSize: `${hpt}pt`, fontWeight: hw }}
                >
                  {col.headerLabel}
                </div>
              );
            })}
          </div>
        ) : null;

      const useListChunk = listPageChunk != null && !!ctx.printListRows?.length;
      const rowBlocks = useListChunk
        ? listPageChunk!.rows.map((row, i) => ({
            serial: listPageChunk!.serialStart + i,
            rowCtx: { ...ctx, listRow: row } as PrintRenderContext,
          }))
        : [{ serial: 1, rowCtx: ctx }];

      const renderBodyRow = (serial: number, rowCtx: PrintRenderContext) => (
        <div
          key={`dl-br-${serial}`}
          style={{
            flex: bodyRowH ? 'none' : useListChunk ? ('1 1 0' as const) : 1,
            height: bodyRowH,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: colTpl,
            gridTemplateRows: bodyRowH ? 'minmax(0, 1fr)' : 'minmax(0, 1fr)',
            alignSelf: 'stretch',
          }}
        >
          {cfg.showSerial ? (
            <div
              className="flex min-h-0 items-center justify-center px-0.5 py-0.5"
              style={{
                ...cellBorder,
                fontSize: `${cfg.fontSizePt ?? 8}pt`,
                fontWeight: 400,
              }}
            >
              {serial}
            </div>
          ) : null}
          {padded.map(col => {
            const text = resolvePrintPlaceholders(col.contentTemplate, rowCtx);
            const bpt = col.fontSizePt ?? cfg.fontSizePt ?? 8;
            const bw = col.fontWeight === 'bold' ? 700 : 400;
            return (
              <div
                key={`b-${col.id}`}
                className="flex min-h-0 items-center px-0.5 py-0.5"
                style={{
                  ...cellBorder,
                  textAlign: col.textAlign,
                  color: col.color,
                  overflow: 'hidden',
                  wordBreak: 'break-all',
                  fontSize: `${bpt}pt`,
                  fontWeight: bw,
                }}
                title={text}
              >
                {text || '\u00a0'}
              </div>
            );
          })}
        </div>
      );

      return (
        <div
          role="presentation"
          style={{
            ...style,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
          className={`cursor-move ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
          onClick={e => {
            e.stopPropagation();
            editorMode?.onSelectElement(el.id);
          }}
          onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
        >
          {headerRow}
          {rowBlocks.map(({ serial, rowCtx }) => renderBodyRow(serial, rowCtx))}
        </div>
      );
    }
    default:
      return null;
  }
}

export interface PrintPaperProps {
  template: PrintTemplate;
  ctx: PrintRenderContext;
  /** 子元素：交互层（选中框、拖动手柄），置于 body 内 */
  children?: React.ReactNode;
  /** body 内额外 class */
  bodyClassName?: string;
  editorMode?: {
    selectedId: string | null;
    onSelectElement: (id: string) => void;
    onElementPointerDown?: (el: PrintBodyElement, e: React.PointerEvent) => void;
    onBodyClick?: () => void;
    onHeaderClick?: () => void;
    onFooterClick?: () => void;
  };
}

/** 按纸张 mm 尺寸渲染模板（预览与打印共用） */
export function PrintPaper({ template, ctx, children, bodyClassName, editorMode }: PrintPaperProps) {
  const { bodyH } = getPrintLayoutMetrics(template);
  const sorted = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
  const m = getPaperMarginsMm(template);
  const paperBg = template.paperBackgroundColor?.trim() ? template.paperBackgroundColor : '#ffffff';

  const isLabelPerRow = !editorMode && !!ctx.labelPerRow && !!ctx.printListRows?.length;
  const totalPages = isLabelPerRow
    ? ctx.printListRows!.length
    : getPrintOutputPageCount(template, ctx, !!editorMode);


  const baseOuterStyle: React.CSSProperties = {
    width: `${template.paperSize.widthMm}mm`,
    height: `${template.paperSize.heightMm}mm`,
    boxSizing: 'border-box',
    padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`,
    boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
  };
  if (editorMode) {
    baseOuterStyle.backgroundColor = '#ffffff';
    baseOuterStyle.backgroundImage = EDITOR_MARGIN_STRIPES;
    baseOuterStyle.backgroundSize = '20px 20px';
  } else {
    baseOuterStyle.backgroundColor = paperBg;
  }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const { listRow: _omitListRow, ...ctxBase } = ctx;
  const listPag = computeListPaginationSummary(template, ctx, !!editorMode);

  return (
    <div
      className={editorMode ? 'flex flex-col text-slate-900' : 'text-slate-900'}
    >
      {pages.map(pageIndex => {
        const pageCtx: PrintRenderContext = {
          ...ctxBase,
          page: { current: pageIndex, total: totalPages },
          ...(isLabelPerRow ? { listRow: ctx.printListRows![pageIndex - 1] } : {}),
        };
        const listChunk =
          !isLabelPerRow && listPag && ctx.printListRows?.length && !editorMode
            ? getListRowsForPrintPage(listPag, ctx.printListRows, pageIndex)
            : undefined;
        const elementsForPage = editorMode
          ? sorted
          : isLabelPerRow
            ? sorted
            : sorted.filter(el => {
                if (el.repeatPerPage) return true;
                if (pageIndex === 1) return true;
                if (ctx.printListRows?.length && el.type === 'dynamicList') return true;
                return false;
              });
        const isLastPage = pageIndex === totalPages;
        const outerStyle: React.CSSProperties = {
          ...baseOuterStyle,
          display: 'block',
          ...(editorMode
            ? {}
            : {
                breakInside: 'avoid' as const,
                ...(totalPages > 1 && !isLastPage
                  ? {
                      pageBreakAfter: 'always' as const,
                      breakAfter: 'page' as const,
                      marginBottom: 0,
                    }
                  : {}),
              }),
        };

        return (
          <div key={pageIndex} style={outerStyle} data-label-page={isLabelPerRow ? pageIndex : undefined}>
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-white">
              {template.header && (
                <div
                  className={editorMode ? 'cursor-pointer ring-0 hover:ring-2 hover:ring-indigo-300' : ''}
                  onClick={
                    editorMode
                      ? e => {
                          e.stopPropagation();
                          editorMode.onHeaderClick?.();
                        }
                      : undefined
                  }
                  role={editorMode ? 'button' : undefined}
                >
                  <HeaderFooterBand config={template.header} ctx={pageCtx} position="header" />
                </div>
              )}
              <div
                className={`relative w-full shrink-0 bg-white ${editorMode ? 'overflow-visible' : 'overflow-hidden'} ${bodyClassName ?? ''}`}
                style={{ height: `${bodyH}mm` }}
                onClick={editorMode ? () => editorMode.onBodyClick?.() : undefined}
              >
                {elementsForPage.map(el => (
                  <BodyElementView
                    key={`${el.id}-p${pageIndex}`}
                    el={el}
                    ctx={pageCtx}
                    editorMode={editorMode}
                    listPageChunk={el.type === 'dynamicList' ? listChunk : undefined}
                  />
                ))}
                {editorMode && pageIndex === 1 ? children : null}
              </div>
              {template.footer && (
                <div
                  className={editorMode ? 'cursor-pointer ring-0 hover:ring-2 hover:ring-indigo-300' : ''}
                  onClick={
                    editorMode
                      ? e => {
                          e.stopPropagation();
                          editorMode.onFooterClick?.();
                        }
                      : undefined
                  }
                  role={editorMode ? 'button' : undefined}
                >
                  <HeaderFooterBand config={template.footer} ctx={pageCtx} position="footer" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
