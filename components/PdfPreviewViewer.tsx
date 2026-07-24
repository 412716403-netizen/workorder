import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useFileOpenInTabMenu } from '../hooks/useFileOpenInTabMenu';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1;

function withPdfViewerParams(src: string): string {
  const hashIdx = src.indexOf('#');
  const base = hashIdx >= 0 ? src.slice(0, hashIdx) : src;
  const existing = hashIdx >= 0 ? src.slice(hashIdx + 1) : '';
  const params = new URLSearchParams(existing);
  if (!params.has('toolbar')) params.set('toolbar', '0');
  if (!params.has('navpanes')) params.set('navpanes', '0');
  // 整页适配：100% 时一页完整落入视口
  if (!params.has('view')) params.set('view', 'Fit');
  return `${base}#${params.toString()}`;
}

export interface PdfPreviewViewerProps {
  src: string;
  title?: string;
  className?: string;
  /** iframe sandbox（部分场景需收紧） */
  sandbox?: string;
}

/**
 * PDF 预览：100% 时整页适配视口；放大后可按住拖动平移。
 */
export function PdfPreviewViewer({
  src,
  title = 'PDF 预览',
  className = 'h-[85vh] w-full',
  sandbox,
}: PdfPreviewViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [dragging, setDragging] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const { onContextMenuFor, menuNode } = useFileOpenInTabMenu();

  const frameSrc = withPdfViewerParams(src);

  const clampScale = useCallback((next: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)), []);

  const zoomBy = useCallback(
    (delta: number) => {
      setScale((prev) => Number(clampScale(prev + delta).toFixed(2)));
    },
    [clampScale],
  );

  const resetView = useCallback(() => {
    setScale(DEFAULT_SCALE);
    const el = viewportRef.current;
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    resetView();
  }, [src, resetView]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setScale((prev) => Number(clampScale(prev + (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP)).toFixed(2)));
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [clampScale]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = viewportRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: el.scrollLeft,
      originTop: el.scrollTop,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = viewportRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !el) return;
    el.scrollLeft = drag.originLeft - (e.clientX - drag.startX);
    el.scrollTop = drag.originTop - (e.clientY - drag.startY);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const contentW = Math.max(1, Math.round(viewportSize.w * scale));
  const contentH = Math.max(1, Math.round(viewportSize.h * scale));
  const canPan = scale > 1;

  return (
    <div
      className={`relative flex flex-col overflow-hidden bg-slate-100 ${className}`}
      onContextMenu={onContextMenuFor(src)}
    >
      {menuNode}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/95 px-1.5 py-1 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          title="缩小"
          aria-label="缩小"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          disabled={scale <= MIN_SCALE}
          onClick={() => zoomBy(-SCALE_STEP)}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[3rem] text-center text-[11px] font-semibold tabular-nums text-slate-600">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          title="放大"
          aria-label="放大"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          disabled={scale >= MAX_SCALE}
          onClick={() => zoomBy(SCALE_STEP)}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="重置"
          aria-label="重置视图"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
          onClick={resetView}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={viewportRef}
        className={`min-h-0 flex-1 overflow-auto overscroll-contain ${
          canPan ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
        onPointerDown={canPan ? onPointerDown : undefined}
        onPointerMove={canPan ? onPointerMove : undefined}
        onPointerUp={canPan ? endDrag : undefined}
        onPointerCancel={canPan ? endDrag : undefined}
        style={{ touchAction: canPan ? 'none' : 'auto' }}
      >
        {viewportSize.w > 0 && viewportSize.h > 0 && (
          <div
            className="relative mx-auto bg-white shadow-sm"
            style={{
              width: contentW,
              height: contentH,
            }}
          >
            <iframe
              src={frameSrc}
              title={title}
              className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-white"
              sandbox={sandbox}
            />
          </div>
        )}
      </div>

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/55 px-3 py-1 text-[10px] font-medium text-white/90">
        {canPan ? '按住拖动 · Ctrl/⌘ + 滚轮缩放' : 'Ctrl/⌘ + 滚轮或右上角按钮缩放'}
      </p>
    </div>
  );
}

export default PdfPreviewViewer;
