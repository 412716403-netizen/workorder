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
import {
  computeListPaginationSummary,
  getListRowsForPrintPage,
} from '../../utils/printListPagination';
import {
  resolvePrintPlaceholders,
  formatNumberForPrint,
  resolvePrintImageSrc,
  isLikelyPrintImageUrl,
} from '../../utils/printResolve';
import { getPaperMarginsMm, getPrintLayoutMetrics, getPrintOutputPageCount } from './layoutMetrics';
import {
  computeBodyVerticalPushByElementId,
  elementHeightGrowMm,
} from './printBodyVerticalPush';
import { DynamicListMatrixTable } from './DynamicListMatrixTable';
import { padDynamicListDataColumns } from '../../utils/dynamicListMatrix';
import { serializeColorSizeMatrixPayload } from '../../utils/colorSizeMatrixPrint';

/** 编辑器内动态列表含「颜色尺码数量」列且无 printListRows 时的预览数据 */
const EDITOR_DYNAMIC_LIST_MATRIX_PREVIEW: PrintListRow[] = [
  {
    sku: '示例货号',
    productName: '示例名称',
    qty: 200,
    unitPrice: '0',
    amount: '0',
    remark: '',
    colorSizeMatrixJson: serializeColorSizeMatrixPayload({
      sizes: ['XL', 'xs'],
      colorRows: [
        { colorName: '大红', quantities: [50, 50] },
        { colorName: '颜色2', quantities: [50, 50] },
      ],
    }),
  },
  {
    sku: '示例货号2',
    productName: '示例名称2',
    qty: 100,
    unitPrice: '0',
    amount: '0',
    remark: '',
    colorSizeMatrixJson: serializeColorSizeMatrixPayload({
      sizes: ['均码'],
      colorRows: [
        { colorName: '米白色', quantities: [50] },
        { colorName: '大红', quantities: [50] },
      ],
    }),
  },
];

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

/** 解析结果为单张 data URL 图片时输出 img，便于打印与预览（如 {{产品.custom.xxx}} 上传图） */
function renderPrintResolvedContent(display: string): React.ReactNode {
  const t = display.trim();
  if (t.startsWith('data:image/')) {
    return (
      <img
        src={t}
        alt=""
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }}
      />
    );
  }
  return display || '\u00a0';
}

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
  topPushMm = 0,
  heightGrowMm = 0,
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
  /** 因上方列表增高，本元素整体下移 (mm) */
  topPushMm?: number;
  /** 本元素为列表时，在模板高度基础上增加 (mm) 以容纳内容 */
  heightGrowMm?: number;
}) {
  const baseH = Math.max(el.height, 0.5) + (heightGrowMm > 0 ? heightGrowMm : 0);
  const effectiveY = el.y;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${el.x}mm`,
    top: `${effectiveY + topPushMm}mm`,
    width: `${el.width}mm`,
    height: `${baseH}mm`,
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
          {renderPrintResolvedContent(display)}
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
              {renderPrintResolvedContent(text)}
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
      const padded = padDynamicListDataColumns(cfg);
      const matrixIdx = padded.findIndex(c => c.cellKind === 'colorSizeMatrix');
      const totalCols = (cfg.showSerial ? 1 : 0) + padded.length;
      const useListChunk = listPageChunk != null && !!ctx.printListRows?.length;
      const matrixListRows: PrintListRow[] = useListChunk
        ? listPageChunk!.rows
        : ctx.printListRows && ctx.printListRows.length > 0
          ? ctx.printListRows
          : editorMode
            ? EDITOR_DYNAMIC_LIST_MATRIX_PREVIEW
            : [];
      const matrixSerialStart = useListChunk ? listPageChunk!.serialStart : 1;

      if (matrixIdx >= 0) {
        if (!matrixListRows.length) {
          return (
            <div
              role="presentation"
              style={{
                ...style,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: editorMode ? 'auto' : heightGrowMm > 0 ? 'visible' : 'hidden',
                boxSizing: 'border-box',
              }}
              className={`cursor-move ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
              onClick={e => {
                e.stopPropagation();
                editorMode?.onSelectElement(el.id);
              }}
              onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
            >
              <span className="px-1 text-center text-[7pt] font-bold text-slate-400">
                当前无 printListRows；请传入明细行数据以预览颜色尺码数量列表
              </span>
            </div>
          );
        }
        return (
          <div
            role="presentation"
            style={{
              ...style,
              display: 'flex',
              flexDirection: 'column',
              overflow: editorMode ? 'auto' : heightGrowMm > 0 ? 'visible' : 'hidden',
              boxSizing: 'border-box',
            }}
            className={`cursor-move ${editorMode?.selectedId === el.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
            onClick={e => {
              e.stopPropagation();
              editorMode?.onSelectElement(el.id);
            }}
            onPointerDown={e => editorMode?.onElementPointerDown?.(el, e)}
          >
            <div className={`flex min-h-0 flex-1 flex-col ${editorMode ? 'overflow-auto' : heightGrowMm > 0 ? 'overflow-visible' : 'overflow-hidden'}`}>
              <DynamicListMatrixTable
                cfg={cfg}
                ctx={ctx}
                padded={padded}
                matrixIdx={matrixIdx}
                listRows={matrixListRows}
                serialStart={matrixSerialStart}
              />
            </div>
          </div>
        );
      }

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
              minHeight: headerRowH ?? '3mm',
              height: headerRowH,
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
                  className="flex min-h-0 items-center px-0.5 py-0.5"
                  style={{
                    ...cellBorder,
                    fontSize: `${hpt}pt`,
                    fontWeight: hw,
                  }}
                >
                  <span className="min-w-0 w-full" style={{ textAlign: col.textAlign ?? 'left' }}>
                    {col.headerLabel}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null;

      const rowBlocks = useListChunk
        ? listPageChunk!.rows.map((row, i) => ({
            serial: listPageChunk!.serialStart + i,
            rowCtx: { ...ctx, listRow: row } as PrintRenderContext,
          }))
        : editorMode && ctx.printListRows && ctx.printListRows.length > 0
          ? ctx.printListRows.map((row, i) => ({
              serial: i + 1,
              rowCtx: { ...ctx, listRow: row } as PrintRenderContext,
            }))
          : [{ serial: 1, rowCtx: ctx }];

      const renderBodyRow = (serial: number, rowCtx: PrintRenderContext) => (
        <div
          key={`dl-br-${serial}`}
          style={{
            flex: bodyRowH ? 'none' : useListChunk ? ('1 1 0' as const) : 1,
            height: bodyRowH,
            minHeight: bodyRowH ?? 0,
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
                  color: col.color,
                  overflow: 'hidden',
                  fontSize: `${bpt}pt`,
                  fontWeight: bw,
                }}
                title={text.length > 120 ? `${text.slice(0, 120)}…` : text}
              >
                <span className="min-w-0 w-full break-words" style={{ textAlign: col.textAlign ?? 'left' }}>
                  {renderPrintResolvedContent(text)}
                </span>
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
            overflow: editorMode ? 'auto' : heightGrowMm > 0 ? 'visible' : 'hidden',
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
  const layout = getPrintLayoutMetrics(template);
  const { bodyH } = layout;
  const sorted = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
  const m = getPaperMarginsMm(template);
  const paperBg = template.paperBackgroundColor?.trim() ? template.paperBackgroundColor : '#ffffff';

  const isLabelPerRow = !editorMode && !!ctx.labelPerRow && !!ctx.printListRows?.length;
  const isLabelPerVirtualBatch = !editorMode && !!ctx.labelPerVirtualBatch && !!ctx.virtualBatchRows?.length;
  const totalPages = isLabelPerRow
    ? ctx.printListRows!.length
    : isLabelPerVirtualBatch
      ? ctx.virtualBatchRows!.length
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

  const listEl = sorted.find(e => e.type === 'dynamicList');
  const pagedAnchorY = listEl?.y ?? 0;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const { listRow: _omitListRow, ...ctxBase } = ctx;
  const listPag = computeListPaginationSummary(template, ctx, !!editorMode, bodyH);

  return (
    <div
      className={editorMode ? 'flex flex-col text-slate-900' : 'text-slate-900'}
    >
      {pages.map(pageIndex => {
        const pageCtx: PrintRenderContext = {
          ...ctxBase,
          page: { current: pageIndex, total: totalPages },
          ...(isLabelPerRow ? { listRow: ctx.printListRows![pageIndex - 1] } : {}),
          ...(isLabelPerVirtualBatch ? { virtualBatch: ctx.virtualBatchRows![pageIndex - 1] } : {}),
        };
        const listChunk =
          !isLabelPerRow && !isLabelPerVirtualBatch && listPag && ctx.printListRows?.length && !editorMode
            ? getListRowsForPrintPage(listPag, ctx.printListRows, pageIndex)
            : undefined;
        const isLastPage = pageIndex === totalPages;
        const isFirstPage = pageIndex === 1;
        const hasPagedContent =
          !!(ctx.printListRows?.length && sorted.some(e => e.type === 'dynamicList'));

        const elementsForPage = editorMode
          ? sorted
          : isLabelPerRow || isLabelPerVirtualBatch
            ? sorted
            : sorted.filter(el => {
                if (el.repeatPerPage) return true;
                if (el.type === 'dynamicList') return true;
                if (!hasPagedContent) return true;
                if (el.y <= pagedAnchorY) return isFirstPage;
                return isLastPage;
              });

        const verticalPushMmById =
          editorMode || isLabelPerRow || isLabelPerVirtualBatch
            ? new Map<string, number>()
            : computeBodyVerticalPushByElementId(elementsForPage, pageCtx, listChunk);

        const globalYShift = 0;

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
          <div
            key={pageIndex}
            style={outerStyle}
            data-label-page={!editorMode && (isLabelPerRow || isLabelPerVirtualBatch || totalPages > 1) ? pageIndex : undefined}
          >
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
                  <React.Fragment key={`${el.id}-p${pageIndex}`}>
                    <BodyElementView
                      el={el}
                      ctx={pageCtx}
                      editorMode={editorMode}
                      listPageChunk={el.type === 'dynamicList' ? listChunk : undefined}
                      topPushMm={globalYShift + (verticalPushMmById.get(el.id) ?? 0)}
                      heightGrowMm={
                        editorMode || isLabelPerRow || isLabelPerVirtualBatch
                          ? 0
                          : elementHeightGrowMm(el, pageCtx, listChunk)
                      }
                    />
                  </React.Fragment>
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
