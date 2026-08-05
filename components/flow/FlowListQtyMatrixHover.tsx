import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { AppDictionaries, Product } from '../../types';
import type { VariantQtyBreakdown } from '../../utils/flowListVariantQty';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
}

export interface FlowListQtyMatrixHoverProps {
  product?: Product | null;
  dictionaries?: AppDictionaries;
  breakdown: VariantQtyBreakdown;
  totalQty: number;
  children: React.ReactNode;
  label?: string;
  unitName?: string;
  className?: string;
}

const VIEWPORT_GAP = 8;
const PANEL_GAP = 6;
const MAX_PANEL_WIDTH = 640;
const CLOSE_DELAY_MS = 140;

function formatQty(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString('zh-CN')
    : value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

function computePosition(
  trigger: DOMRect,
  width: number,
  panelHeight: number,
): PopoverPosition {
  const safeWidth = Math.min(width, window.innerWidth - VIEWPORT_GAP * 2);
  let left = trigger.right - safeWidth;
  left = Math.max(
    VIEWPORT_GAP,
    Math.min(left, window.innerWidth - safeWidth - VIEWPORT_GAP),
  );

  let top = trigger.bottom + PANEL_GAP;
  if (top + panelHeight > window.innerHeight - VIEWPORT_GAP) {
    top = Math.max(VIEWPORT_GAP, trigger.top - panelHeight - PANEL_GAP);
  }

  return { top, left, width: safeWidth };
}

const FlowListQtyMatrixHover: React.FC<FlowListQtyMatrixHoverProps> = ({
  product,
  dictionaries,
  breakdown,
  totalQty,
  children,
  label = '数量',
  unitName = '件',
  className = '',
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const layout = useMemo(() => {
    if (!product || !dictionaries || !productHasColorSizeMatrix(product, undefined)) {
      return null;
    }
    return buildVariantQtyMatrixLayout(product, dictionaries);
  }, [dictionaries, product]);

  const preferredWidth = useMemo(() => {
    const sizeCount = layout?.sizeColumns.length ?? 0;
    return Math.min(MAX_PANEL_WIDTH, Math.max(280, 116 + sizeCount * 76));
  }, [layout]);

  const unmatchedQty = useMemo(() => {
    if (!product) return breakdown.unassignedQty;
    const knownVariantIds = new Set(product.variants.map(variant => variant.id));
    return Object.entries(breakdown.quantities).reduce(
      (sum, [variantId, quantity]) =>
        knownVariantIds.has(variantId) ? sum : sum + quantity,
      breakdown.unassignedQty,
    );
  }, [breakdown, product]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(
    (panelHeight = panelRef.current?.offsetHeight ?? 280) => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setPosition(
        computePosition(trigger.getBoundingClientRect(), preferredWidth, panelHeight),
      );
    },
    [preferredWidth],
  );

  const show = useCallback(() => {
    clearCloseTimer();
    updatePosition();
    setOpen(true);
  }, [clearCloseTimer, updatePosition]);

  const hide = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer]);

  const scheduleHide = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(hide, CLOSE_DELAY_MS);
  }, [clearCloseTimer, hide]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(() => {
      updatePosition(panelRef.current?.offsetHeight);
    });
    const handleViewportChange = () => updatePosition(panelRef.current?.offsetHeight);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  if (!layout) return <>{children}</>;

  const popover =
    open &&
    position &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={panelRef}
        role="tooltip"
        className="fixed max-h-[min(28rem,72vh)] overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xl ring-1 ring-slate-900/5"
        style={{
          zIndex: 140,
          top: position.top,
          left: position.left,
          width: position.width,
        }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleHide}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-black text-slate-700">{label}颜色尺码明细</span>
          <span className="shrink-0 text-xs font-black tabular-nums text-indigo-600">
            合计 {formatQty(totalQty)} {unitName}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2 text-slate-500">
                  颜色
                </th>
                {layout.sizeColumns.map(size => (
                  <th
                    key={size.id}
                    className="min-w-[4.5rem] border border-slate-200 px-3 py-2 font-black text-slate-700"
                  >
                    {size.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {layout.colorRows.map(row => (
                <tr key={row.key}>
                  <td className="border border-slate-200 bg-slate-50/60 px-3 py-2 font-bold text-slate-800">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {row.colorSwatch ? (
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-200"
                          style={{ backgroundColor: row.colorSwatch }}
                        />
                      ) : null}
                      {row.colorLabel}
                    </span>
                  </td>
                  {row.variantAtSize.map((variant, index) => {
                    const quantity = variant
                      ? breakdown.quantities[variant.id] ?? 0
                      : 0;
                    return (
                      <td
                        key={variant?.id ?? `${row.key}-empty-${index}`}
                        className={`border border-slate-200 px-3 py-2 font-bold tabular-nums ${
                          quantity < 0
                            ? 'text-rose-600'
                            : quantity === 0
                              ? 'text-slate-300'
                              : 'text-slate-700'
                        }`}
                      >
                        {quantity === 0 ? '—' : formatQty(quantity)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unmatchedQty !== 0 ? (
          <p className="mt-2 text-[11px] font-medium text-amber-700">
            未记录颜色尺码明细：{formatQty(unmatchedQty)} {unitName}
          </p>
        ) : null}
      </div>,
      document.body,
    );

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={`查看${label}颜色尺码明细`}
        className={`inline-flex cursor-default items-center underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${className}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={show}
        onKeyDown={event => {
          if (event.key === 'Escape') hide();
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            show();
          }
        }}
      >
        {children}
      </span>
      {popover}
    </>
  );
};

export default React.memo(FlowListQtyMatrixHover);
