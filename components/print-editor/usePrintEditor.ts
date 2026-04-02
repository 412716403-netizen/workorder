import { useCallback, useMemo, useState } from 'react';
import type {
  PrintBodyElement,
  PrintBodyElementType,
  PrintElementConfig,
  PrintHeaderFooterConfig,
  PrintLineElementConfig,
  PrintPaperMarginsMm,
  PrintTemplate,
} from '../../types';
import { newElementId } from '../../utils/printTemplateDefaults';
import {
  normalizePrintTemplateNumeric1,
  roundHeaderFooterConfig,
  roundPrintDecimal1,
  roundPrintElementConfigForType,
} from '../../utils/printRounding';
import { getPrintLayoutMetrics } from './layoutMetrics';

export type PrintSelection =
  | { kind: 'none' }
  | { kind: 'paper' }
  | { kind: 'header' }
  | { kind: 'footer' }
  | { kind: 'element'; id: string };

function defaultConfigForType(type: PrintBodyElementType): PrintElementConfig {
  switch (type) {
    case 'text':
      return {
        content: '文本内容',
        fontSizePt: 10,
        fontWeight: 'normal',
        textAlign: 'left',
        color: '#111827',
      };
    case 'qrcode':
      return { content: '{{计划.planNumber}}' };
    case 'line':
      return { thicknessMm: 0.4, lineStyle: 'solid', color: '#000000', angleDeg: 0 };
    case 'rect':
      return {
        borderWidthMm: 0.5,
        borderColor: '#000000',
        lineStyle: 'solid',
        fillColor: 'transparent',
        cornerRadiusMm: 0,
      };
    case 'image':
      return {
        sourceType: 'upload',
        src: '',
        opacityPct: 100,
        keepAspectRatio: true,
      };
    case 'dynamicTable':
      return {
        rows: 2,
        cols: 2,
        borderStyle: 'solid',
        borderColor: '#333333',
        cells: { '0-0': '', '0-1': '', '1-0': '', '1-1': '' },
      };
    case 'dynamicList':
      return {
        dataSource: 'order',
        dataColumnCount: 3,
        showHeader: true,
        showSerial: true,
        serialHeaderLabel: '序号',
        borderStyle: 'solid',
        borderColor: '#000000',
        headerBackgroundColor: '#f1f5f9',
        headerFontSizePt: 8,
        fontSizePt: 8,
        columns: [
          { id: newElementId(), headerLabel: '列1', contentTemplate: '', textAlign: 'left', color: '#000000' },
          { id: newElementId(), headerLabel: '列2', contentTemplate: '', textAlign: 'left', color: '#000000' },
          { id: newElementId(), headerLabel: '列3', contentTemplate: '', textAlign: 'left', color: '#000000' },
        ],
      };
    default:
      return { content: '', fontSizePt: 10, fontWeight: 'normal', textAlign: 'left', color: '#111' };
  }
}

function defaultSizeForType(type: PrintBodyElementType, paperW: number, _paperH: number): { w: number; h: number } {
  switch (type) {
    case 'text':
      return { w: Math.min(60, paperW - 4), h: 10 };
    case 'qrcode':
      return { w: 20, h: 20 };
    case 'line':
      return { w: Math.min(50, paperW - 8), h: 0.5 };
    case 'rect':
      return { w: 30, h: 15 };
    case 'image':
      return { w: 40, h: 40 };
    case 'dynamicTable':
      return { w: Math.min(60, paperW - 8), h: 20 };
    case 'dynamicList':
      return { w: Math.min(162, paperW - 8), h: 13 };
    default:
      return { w: 20, h: 10 };
  }
}

const defaultHeader = (): PrintHeaderFooterConfig => ({
  heightMm: 12,
  backgroundColor: '#f1f5f9',
  borderWidthMm: 0.5,
  borderColor: '#cbd5e1',
  items: [
    { slot: 'left', content: '页眉左侧', fontSizePt: 9, fontWeight: 'normal', textAlign: 'left', color: '#0f172a' },
    { slot: 'center', content: '', fontSizePt: 9, fontWeight: 'normal', textAlign: 'center', color: '#0f172a' },
    { slot: 'right', content: '{{系统.systemTime}}', fontSizePt: 9, fontWeight: 'normal', textAlign: 'right', color: '#0f172a' },
  ],
});

const defaultFooter = (): PrintHeaderFooterConfig => ({
  heightMm: 10,
  backgroundColor: '#f8fafc',
  borderWidthMm: 0.5,
  borderColor: '#e2e8f0',
  items: [
    { slot: 'left', content: '', fontSizePt: 8, fontWeight: 'normal', textAlign: 'left', color: '#64748b' },
    { slot: 'center', content: '第 {{系统.pageCurrent}} 页 / 共 {{系统.pageTotal}} 页', fontSizePt: 8, fontWeight: 'normal', textAlign: 'center', color: '#64748b' },
    { slot: 'right', content: '', fontSizePt: 8, fontWeight: 'normal', textAlign: 'right', color: '#64748b' },
  ],
});

export function usePrintEditor(initial: PrintTemplate) {
  const [template, setTemplateState] = useState<PrintTemplate>(() => normalizePrintTemplateNumeric1({ ...initial }));
  const [selection, setSelection] = useState<PrintSelection>({ kind: 'paper' });

  const setTemplate = useCallback((t: PrintTemplate) => {
    setTemplateState({ ...normalizePrintTemplateNumeric1({ ...t }), updatedAt: new Date().toISOString() });
  }, []);

  const sortedElements = useMemo(
    () => [...template.elements].sort((a, b) => a.zIndex - b.zIndex),
    [template.elements],
  );

  const maxZ = useMemo(
    () => template.elements.reduce((m, e) => Math.max(m, e.zIndex), 0),
    [template.elements],
  );

  const updateTemplate = useCallback((fn: (t: PrintTemplate) => PrintTemplate) => {
    setTemplateState(t => {
      const next = fn(t);
      return { ...next, updatedAt: new Date().toISOString() };
    });
  }, []);

  const addBodyElement = useCallback(
    (type: PrintBodyElementType, at?: { x: number; y: number }) => {
      const { bodyW, bodyH: bodyHmm } = getPrintLayoutMetrics(template);
      const { w, h } = defaultSizeForType(type, bodyW, bodyHmm);
      const x = roundPrintDecimal1(at?.x ?? Math.max(2, (bodyW - w) / 2));
      const y = roundPrintDecimal1(at?.y ?? Math.max(2, (bodyHmm - h) / 2));
      const el: PrintBodyElement = {
        id: newElementId(),
        type,
        x,
        y,
        width: roundPrintDecimal1(w),
        height: roundPrintDecimal1(Math.max(h, type === 'line' ? 0.5 : h)),
        zIndex: maxZ + 1,
        config: defaultConfigForType(type),
      };
      updateTemplate(t => ({ ...t, elements: [...t.elements, el] }));
      setSelection({ kind: 'element', id: el.id });
    },
    [template, maxZ, updateTemplate],
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<PrintBodyElement>) => {
      const p = { ...patch };
      if (p.x !== undefined) p.x = roundPrintDecimal1(p.x);
      if (p.y !== undefined) p.y = roundPrintDecimal1(p.y);
      if (p.width !== undefined) p.width = roundPrintDecimal1(p.width);
      if (p.height !== undefined) p.height = roundPrintDecimal1(p.height);
      updateTemplate(t => ({
        ...t,
        elements: t.elements.map(e => {
          if (e.id !== id) return e;
          let next: PrintBodyElement = { ...e, ...p };
          if (e.type === 'line' && p.height !== undefined) {
            const lc = next.config as PrintLineElementConfig;
            const nextCfg = roundPrintElementConfigForType('line', {
              ...lc,
              thicknessMm: p.height,
            }) as PrintLineElementConfig;
            next = {
              ...next,
              config: nextCfg,
              height: Math.max(0.5, roundPrintDecimal1(nextCfg.thicknessMm)),
            };
          }
          return next;
        }),
      }));
    },
    [updateTemplate],
  );

  const updateElementConfig = useCallback(
    (id: string, config: PrintElementConfig) => {
      updateTemplate(t => {
        const el = t.elements.find(e => e.id === id);
        const nextConfig = el ? roundPrintElementConfigForType(el.type, config) : config;
        return {
          ...t,
          elements: t.elements.map(e => {
            if (e.id !== id) return e;
            let next: PrintBodyElement = { ...e, config: nextConfig };
            if (e.type === 'line') {
              const lc = nextConfig as PrintLineElementConfig;
              next = {
                ...next,
                height: Math.max(0.5, roundPrintDecimal1(lc.thicknessMm)),
              };
            }
            return next;
          }),
        };
      });
    },
    [updateTemplate],
  );

  const deleteElement = useCallback(
    (id: string) => {
      updateTemplate(t => ({ ...t, elements: t.elements.filter(e => e.id !== id) }));
      setSelection(s => (s.kind === 'element' && s.id === id ? { kind: 'paper' } : s));
    },
    [updateTemplate],
  );

  const bringToFront = useCallback(
    (id: string) => {
      updateTemplate(t => ({
        ...t,
        elements: t.elements.map(e => (e.id === id ? { ...e, zIndex: maxZ + 1 } : e)),
      }));
    },
    [maxZ, updateTemplate],
  );

  const sendToBack = useCallback(
    (id: string) => {
      updateTemplate(prev => {
        const m = prev.elements.reduce((min, e) => Math.min(min, e.zIndex), 0);
        return {
          ...prev,
          elements: prev.elements.map(e => (e.id === id ? { ...e, zIndex: m - 1 } : e)),
        };
      });
    },
    [updateTemplate],
  );

  const addHeader = useCallback(() => {
    updateTemplate(t => ({ ...t, header: t.header ?? defaultHeader() }));
    setSelection({ kind: 'header' });
  }, [updateTemplate]);

  const addFooter = useCallback(() => {
    updateTemplate(t => ({ ...t, footer: t.footer ?? defaultFooter() }));
    setSelection({ kind: 'footer' });
  }, [updateTemplate]);

  const updateHeader = useCallback(
    (h: PrintHeaderFooterConfig) => {
      updateTemplate(t => ({ ...t, header: roundHeaderFooterConfig(h) }));
    },
    [updateTemplate],
  );

  const updateFooter = useCallback(
    (f: PrintHeaderFooterConfig) => {
      updateTemplate(t => ({ ...t, footer: roundHeaderFooterConfig(f) }));
    },
    [updateTemplate],
  );

  const removeHeader = useCallback(() => {
    updateTemplate(t => {
      const next = { ...t };
      delete next.header;
      return next;
    });
    setSelection(s => (s.kind === 'header' ? { kind: 'paper' } : s));
  }, [updateTemplate]);

  const removeFooter = useCallback(() => {
    updateTemplate(t => {
      const next = { ...t };
      delete next.footer;
      return next;
    });
    setSelection(s => (s.kind === 'footer' ? { kind: 'paper' } : s));
  }, [updateTemplate]);

  const setName = useCallback((name: string) => {
    updateTemplate(t => ({ ...t, name }));
  }, [updateTemplate]);

  const setPaperSize = useCallback((widthMm: number, heightMm: number) => {
    updateTemplate(t => ({
      ...t,
      paperSize: {
        widthMm: roundPrintDecimal1(Math.max(0.1, widthMm)),
        heightMm: roundPrintDecimal1(Math.max(0.1, heightMm)),
      },
    }));
  }, [updateTemplate]);

  const setPaperMarginsMm = useCallback((patch: Partial<PrintPaperMarginsMm>) => {
    updateTemplate(t => {
      const base: PrintPaperMarginsMm = t.paperMarginsMm ?? { top: 0, bottom: 0, left: 0, right: 0 };
      const rounded: Partial<PrintPaperMarginsMm> = {};
      (['top', 'bottom', 'left', 'right'] as const).forEach(k => {
        const v = patch[k];
        if (v !== undefined) rounded[k] = roundPrintDecimal1(Math.max(0, v));
      });
      return { ...t, paperMarginsMm: { ...base, ...rounded } };
    });
  }, [updateTemplate]);

  const setPaperBackgroundColor = useCallback((paperBackgroundColor: string) => {
    updateTemplate(t => ({ ...t, paperBackgroundColor }));
  }, [updateTemplate]);

  const swapPaperDimensions = useCallback(() => {
    updateTemplate(t => ({
      ...t,
      paperSize: { widthMm: t.paperSize.heightMm, heightMm: t.paperSize.widthMm },
    }));
  }, [updateTemplate]);

  return {
    template,
    setTemplate,
    selection,
    setSelection,
    sortedElements,
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
  };
}
