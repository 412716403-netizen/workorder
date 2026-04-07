import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Minus, Plus, Printer, Save } from 'lucide-react';
import { useMasterData, useConfigData, useOrdersData, useAppActions } from '../contexts/AppDataContext';
import type {
  PrintBodyElement,
  PrintBodyElementType,
  PrintImageElementConfig,
  PrintLineElementConfig,
  PrintRenderContext,
} from '../types';
import { createBlankCustomTemplate } from '../utils/printTemplateDefaults';
import { getPrintLayoutMetrics } from '../components/print-editor/layoutMetrics';
import { ComponentLibrary } from '../components/print-editor/ComponentLibrary';
import type { PaletteDropType } from '../components/print-editor/ComponentLibrary';
import { PrintPaper } from '../components/print-editor/PrintPaper';
import { PropertyPanel } from '../components/print-editor/PropertyPanel';
import { usePrintEditor } from '../components/print-editor/usePrintEditor';
import { buildPrintFieldOptions } from '../components/print-editor/printFieldOptions';
import { HiddenPrintSlot, usePrintTemplateAction } from '../components/print-editor/PrintPreview';

function CanvasDropZone({
  children,
  id,
  onBackgroundClick,
  className = '',
}: {
  children: React.ReactNode;
  id: string;
  onBackgroundClick?: () => void;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) onBackgroundClick?.();
      }}
      className={`rounded-2xl p-6 transition-colors ${isOver ? 'bg-indigo-100/40 ring-2 ring-indigo-300' : 'bg-slate-200/80'} ${className}`}
    >
      {children}
    </div>
  );
}

export default function PrintTemplateEditorView() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { products } = useMasterData();
  const { printTemplates, planFormSettings } = useConfigData();
  const { orders, plans } = useOrdersData();
  const { onUpdatePrintTemplates } = useAppActions();

  const editor = usePrintEditor(createBlankCustomTemplate());

  const {
    template,
    selection,
    setSelection,
    setTemplate,
    addBodyElement,
    updateElement,
    updateElementConfig,
    deleteElement,
    bringToFront,
    sendToBack,
    addHeader,
    addFooter,
    updateHeader,
    updateFooter,
    removeHeader,
    removeFooter,
    setName,
    setPaperSize,
    setPaperMarginsMm,
    setPaperBackgroundColor,
    swapPaperDimensions,
  } = editor;

  useEffect(() => {
    if (!routeId || routeId === 'new') {
      setTemplate(createBlankCustomTemplate());
      return;
    }
    const t = printTemplates.find(x => x.id === routeId);
    if (t) setTemplate({ ...t });
  }, [routeId, printTemplates, setTemplate]);

  const selectedElement = useMemo(
    () => (selection.kind === 'element' ? template.elements.find(e => e.id === selection.id) ?? null : null),
    [selection, template.elements],
  );

  const previewCtx: PrintRenderContext = useMemo(() => {
    const plan = plans[0];
    const order = orders[0];
    const product = products.find(p => p.id === (plan?.productId || order?.productId)) ?? products[0];
    return {
      plan,
      order,
      product,
      milestoneName: '示例工序',
      completedQuantity: 12,
    };
  }, [plans, orders, products]);

  const fieldOptions = useMemo(() => buildPrintFieldOptions(planFormSettings.customFields), [planFormSettings.customFields]);

  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    bw: number;
    bh: number;
    br: DOMRect;
  } | null>(null);
  const [resizing, setResizing] = useState<{
    id: string;
    mode: 'corner' | 'lineStart' | 'lineEnd';
    sx: number;
    sy: number;
    ow: number;
    oh: number;
    ox: number;
    oy: number;
    bw: number;
    bh: number;
    br: DOMRect;
  } | null>(null);

  const bodyAreaRef = useRef<HTMLDivElement>(null);

  const { bodyW, bodyH } = useMemo(() => getPrintLayoutMetrics(template), [template]);

  const beginLineResize = useCallback(
    (mode: 'lineStart' | 'lineEnd', el: PrintBodyElement, e: React.PointerEvent) => {
      e.stopPropagation();
      const body = bodyAreaRef.current?.parentElement;
      if (!body) return;
      const br = body.getBoundingClientRect();
      setResizing({
        id: el.id,
        mode,
        sx: e.clientX,
        sy: e.clientY,
        ow: el.width,
        oh: el.height,
        ox: el.x,
        oy: el.y,
        bw: bodyW,
        bh: bodyH,
        br,
      });
    },
    [bodyW, bodyH],
  );

  const onElementPointerDown = useCallback(
    (el: PrintBodyElement, e: React.PointerEvent) => {
      if (el.locked) return;
      if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
      const body = bodyAreaRef.current;
      if (!body) return;
      const br = body.getBoundingClientRect();
      setDragging({
        id: el.id,
        sx: e.clientX,
        sy: e.clientY,
        ox: el.x,
        oy: el.y,
        bw: bodyW,
        bh: bodyH,
        br,
      });
      e.preventDefault();
    },
    [bodyW, bodyH],
  );

  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dxPx = e.clientX - dragging.sx;
        const dyPx = e.clientY - dragging.sy;
        const mmPerPxX = dragging.bw / dragging.br.width;
        const mmPerPxY = dragging.bh / dragging.br.height;
        let nx = dragging.ox + dxPx * mmPerPxX;
        let ny = dragging.oy + dyPx * mmPerPxY;
        const el = template.elements.find(x => x.id === dragging.id);
        if (el) {
          nx = Math.max(0, Math.min(nx, dragging.bw - el.width));
          ny = Math.max(0, Math.min(ny, dragging.bh - Math.max(el.height, 0.5)));
        }
        updateElement(dragging.id, { x: nx, y: ny });
      }
      if (resizing) {
        const dxPx = e.clientX - resizing.sx;
        const dyPx = e.clientY - resizing.sy;
        const mmPerPxX = resizing.bw / resizing.br.width;
        const mmPerPxY = resizing.bh / resizing.br.height;
        const dxMm = dxPx * mmPerPxX;
        const dyMm = dyPx * mmPerPxY;
        const el = template.elements.find(x => x.id === resizing.id);
        if (el?.type === 'line') {
          const minW = 2;
          if (resizing.mode === 'lineEnd') {
            let nw = Math.max(minW, resizing.ow + dxMm);
            nw = Math.min(nw, resizing.bw - resizing.ox);
            updateElement(resizing.id, { width: nw });
          } else if (resizing.mode === 'lineStart') {
            const right = resizing.ox + resizing.ow;
            let nx = resizing.ox + dxMm;
            nx = Math.max(0, Math.min(nx, right - minW));
            updateElement(resizing.id, { x: nx, width: right - nx });
          }
        } else {
          const maxW = resizing.bw - resizing.ox;
          const maxH = resizing.bh - resizing.oy;
          let nw = resizing.ow + dxMm;
          let nh = resizing.oh + dyMm;

          if (el?.type === 'image') {
            const ic = el.config as PrintImageElementConfig;
            if (ic.keepAspectRatio !== false) {
              const r =
                ic.naturalAspectRatio != null && ic.naturalAspectRatio > 0
                  ? ic.naturalAspectRatio
                  : resizing.ow / Math.max(resizing.oh, 0.01);
              const driveByWidth = Math.abs(dxMm) >= Math.abs(dyMm);
              if (driveByWidth) {
                nw = Math.max(2, Math.min(nw, maxW));
                nh = nw / r;
              } else {
                nh = Math.max(0.5, Math.min(nh, maxH));
                nw = nh * r;
              }
              if (nw > maxW) {
                nw = maxW;
                nh = nw / r;
              }
              if (nh > maxH) {
                nh = maxH;
                nw = nh * r;
              }
              nw = Math.max(2, Math.min(nw, maxW));
              nh = Math.max(0.5, Math.min(nh, maxH));
            } else {
              nw = Math.max(2, Math.min(nw, maxW));
              nh = Math.max(0.5, Math.min(nh, maxH));
            }
          } else {
            nw = Math.max(2, nw);
            nh = Math.max(0.5, nh);
            nw = Math.min(nw, maxW);
            nh = Math.min(nh, maxH);
          }
          updateElement(resizing.id, { width: nw, height: nh });
        }
      }
    };
    const onUp = () => {
      setDragging(null);
      setResizing(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, resizing, template.elements, updateElement]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const pt = event.active.data.current?.paletteType as PaletteDropType | undefined;
      if (!pt || event.over?.id !== 'print-canvas-body') return;
      if (pt === 'header') {
        addHeader();
        return;
      }
      if (pt === 'footer') {
        addFooter();
        return;
      }
      addBodyElement(pt as PrintBodyElementType);
    },
    [addBodyElement, addHeader, addFooter],
  );

  const save = useCallback(async () => {
    try {
      const others = printTemplates.filter(t => t.id !== template.id);
      await onUpdatePrintTemplates([...others, { ...template, updatedAt: new Date().toISOString() }]);
      toast.success('模板已保存');
      if (routeId === 'new') {
        navigate(`/print-editor/${template.id}`, { replace: true });
      }
    } catch {
      toast.error('保存失败');
    }
  }, [printTemplates, template, onUpdatePrintTemplates, routeId, navigate]);

  const { printRef, handlePrint } = usePrintTemplateAction(template, previewCtx);

  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/production')}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> 返回
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">计划单 · 打印模板</p>
              <input
                value={template.name}
                onChange={e => setName(e.target.value)}
                className="mt-0.5 w-full max-w-md border-none bg-transparent text-lg font-black text-slate-900 outline-none focus:ring-0"
                placeholder="未命名模板"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Eye className="h-4 w-4" /> 预览模板
            </button>
            <button
              type="button"
              onClick={() => handlePrint()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> 打印
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700"
            >
              <Save className="h-4 w-4" /> 保存
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_300px]">
          <div className="min-h-0 min-w-0">
            <ComponentLibrary
              onPick={t => {
                if (t === 'header') addHeader();
                else if (t === 'footer') addFooter();
                else addBodyElement(t);
              }}
            />
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-200/70">
            <div className="flex shrink-0 border-b border-slate-200/90 bg-slate-100/90 px-4 py-2">
              <span className="text-xs font-bold text-slate-500">画布</span>
            </div>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 overflow-auto">
                <CanvasDropZone
                  id="print-canvas-body"
                  onBackgroundClick={() => setSelection({ kind: 'paper' })}
                  className="flex min-h-full w-full items-start justify-center"
                >
                  <div
                    className="flex flex-col items-center px-4 py-8 pb-24"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                  >
                    <div className="mb-2 rounded-full border border-slate-200/90 bg-white px-4 py-1 text-xs font-bold tabular-nums text-slate-600 shadow-sm">
                      {template.paperSize.widthMm} × {template.paperSize.heightMm} mm
                    </div>
                    <div
                      className={`relative rounded-sm transition-shadow ${selection.kind === 'paper' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                    >
                      <PrintPaper
                        template={template}
                        ctx={previewCtx}
                        editorMode={{
                          selectedId: selection.kind === 'element' ? selection.id : null,
                          onSelectElement: id => setSelection({ kind: 'element', id }),
                          onElementPointerDown,
                          onBodyClick: () => setSelection({ kind: 'paper' }),
                          onHeaderClick: () => setSelection({ kind: 'header' }),
                          onFooterClick: () => setSelection({ kind: 'footer' }),
                        }}
                      >
                        <div ref={bodyAreaRef} className="pointer-events-none absolute inset-0" aria-hidden />
                        {selection.kind === 'element' && selectedElement && !selectedElement.locked && selectedElement.type === 'line' && (() => {
                          const lc = selectedElement.config as PrintLineElementConfig;
                          const rad = ((lc.angleDeg ?? 0) * Math.PI) / 180;
                          const w = selectedElement.width;
                          const h = selectedElement.height;
                          const cx = selectedElement.x + w / 2;
                          const cy = selectedElement.y + h / 2;
                          const hw = w / 2;
                          const cos = Math.cos(rad);
                          const sin = Math.sin(rad);
                          const lsX = cx - hw * cos;
                          const lsY = cy - hw * sin;
                          const leX = cx + hw * cos;
                          const leY = cy + hw * sin;
                          return (
                            <>
                              <div
                                data-resize-handle
                                className="pointer-events-auto absolute z-[1000] h-3 w-3 cursor-grab rounded-full border-2 border-emerald-600 bg-white shadow"
                                style={{
                                  left: `calc(${lsX}mm - 5px)`,
                                  top: `calc(${lsY}mm - 5px)`,
                                }}
                                onPointerDown={e => beginLineResize('lineStart', selectedElement, e)}
                              />
                              <div
                                data-resize-handle
                                className="pointer-events-auto absolute z-[1000] h-3 w-3 cursor-grab rounded-full border-2 border-emerald-600 bg-white shadow"
                                style={{
                                  left: `calc(${leX}mm - 5px)`,
                                  top: `calc(${leY}mm - 5px)`,
                                }}
                                onPointerDown={e => beginLineResize('lineEnd', selectedElement, e)}
                              />
                            </>
                          );
                        })()}
                        {selection.kind === 'element' && selectedElement && !selectedElement.locked && selectedElement.type !== 'line' && (
                          <div
                            data-resize-handle
                            className="pointer-events-auto absolute z-[1000] h-3 w-3 cursor-nwse-resize rounded-full border-2 border-emerald-600 bg-white shadow"
                            style={{
                              left: `calc(${selectedElement.x + selectedElement.width}mm - 5px)`,
                              top: `calc(${selectedElement.y + selectedElement.height}mm - 5px)`,
                            }}
                            onPointerDown={e => {
                              e.stopPropagation();
                              const body = bodyAreaRef.current?.parentElement;
                              if (!body) return;
                              const br = body.getBoundingClientRect();
                              setResizing({
                                id: selectedElement.id,
                                mode: 'corner',
                                sx: e.clientX,
                                sy: e.clientY,
                                ow: selectedElement.width,
                                oh: selectedElement.height,
                                ox: selectedElement.x,
                                oy: selectedElement.y,
                                bw: bodyW,
                                bh: bodyH,
                                br,
                              });
                            }}
                          />
                        )}
                      </PrintPaper>
                    </div>
                  </div>
                </CanvasDropZone>
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-4 pb-5">
                <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/95 px-1.5 py-1 shadow-md backdrop-blur-sm">
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                    onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-11 text-center text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                    onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <aside className="flex min-h-0 min-w-0 flex-col border-l border-slate-200 bg-white">
            <div className="shrink-0 border-b border-slate-100 px-4 py-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">属性</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              <PropertyPanel
                template={template}
                selection={selection}
                selectedElement={selectedElement}
                fieldOptions={fieldOptions}
                onSetName={setName}
                setPaperSize={setPaperSize}
                setPaperMarginsMm={setPaperMarginsMm}
                setPaperBackgroundColor={setPaperBackgroundColor}
                swapPaperDimensions={swapPaperDimensions}
                onUpdateElement={updateElement}
                onUpdateElementConfig={updateElementConfig}
                onDeleteElement={deleteElement}
                onUpdateHeader={updateHeader}
                onUpdateFooter={updateFooter}
                onRemoveHeader={removeHeader}
                onRemoveFooter={removeFooter}
                bringToFront={bringToFront}
                sendToBack={sendToBack}
              />
            </div>
          </aside>
        </div>
      </div>

      <HiddenPrintSlot template={template} ctx={previewCtx} printRef={printRef} />

      {previewOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
          <div className="max-h-[90vh] overflow-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-black text-slate-900">打印预览</h3>
            <PrintPaper template={template} ctx={previewCtx} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold" onClick={() => setPreviewOpen(false)}>
                关闭
              </button>
              <button
                type="button"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white"
                onClick={() => {
                  setPreviewOpen(false);
                  void handlePrint();
                }}
              >
                打印
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
