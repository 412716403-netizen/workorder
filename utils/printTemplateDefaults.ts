import type { PrintBodyElement, PrintTemplate } from '../types';

/** ISO 216 竖向常用幅面（mm） */
export const PRINT_PAPER_A4_MM = { widthMm: 210, heightMm: 297 } as const;
export const PRINT_PAPER_A5_MM = { widthMm: 148, heightMm: 210 } as const;

function nowIso() {
  return new Date().toISOString();
}

export function newPrintTemplateId() {
  return `print-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newElementId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 预设标签尺寸下的默认元素布局（含二维码 + 两行文本） */
export function createPresetLabelTemplate(
  preset: '30x40' | '80x60' | '80x100',
  name?: string,
): PrintTemplate {
  const dims: Record<typeof preset, [number, number]> = {
    '30x40': [30, 40],
    '80x60': [80, 60],
    '80x100': [80, 100],
  };
  const [w, h] = dims[preset];
  const t = nowIso();
  const id = newPrintTemplateId();

  const qrSize = Math.min(22, w - 4, h * 0.45);
  const qrX = (w - qrSize) / 2;
  const qrY = 2;
  const lineH = Math.max(4, Math.min(8, (h - qrY - qrSize - 4) / 2));

  const elements: PrintBodyElement[] = [
    {
      id: newElementId(),
      type: 'qrcode',
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
      zIndex: 1,
      config: { content: '{{计划.planNumber}}' },
    },
    {
      id: newElementId(),
      type: 'text',
      x: 1,
      y: qrY + qrSize + 1,
      width: w - 2,
      height: lineH,
      zIndex: 2,
      config: {
        content: '{{产品.name}}',
        fontSizePt: 7,
        fontWeight: 'normal',
        textAlign: 'center',
        color: '#111827',
      },
    },
    {
      id: newElementId(),
      type: 'text',
      x: 1,
      y: qrY + qrSize + 1 + lineH + 0.5,
      width: w - 2,
      height: lineH,
      zIndex: 2,
      config: {
        content: '{{计划.planNumber}}',
        fontSizePt: 7,
        fontWeight: 'normal',
        textAlign: 'center',
        color: '#111827',
      },
    },
  ];

  return {
    id,
    name: name ?? `标签 ${preset.replace('x', '×')}`,
    paperSize: { widthMm: w, heightMm: h },
    paperMarginsMm: { top: 2, bottom: 2, left: 2, right: 2 },
    paperBackgroundColor: '#FFFFFF',
    elements,
    createdAt: t,
    updatedAt: t,
  };
}

export function createBlankCustomTemplate(
  widthMm = PRINT_PAPER_A4_MM.widthMm,
  heightMm = PRINT_PAPER_A4_MM.heightMm,
  name = '未命名模板',
): PrintTemplate {
  const t = nowIso();
  return {
    id: newPrintTemplateId(),
    name,
    paperSize: { widthMm, heightMm },
    paperMarginsMm: { top: 2, bottom: 2, left: 2, right: 2 },
    paperBackgroundColor: '#FFFFFF',
    elements: [],
    createdAt: t,
    updatedAt: t,
  };
}

export function duplicatePrintTemplate(src: PrintTemplate): PrintTemplate {
  const t = nowIso();
  const idMap = new Map<string, string>();
  const remap = (oldId: string) => {
    if (!idMap.has(oldId)) idMap.set(oldId, newElementId());
    return idMap.get(oldId)!;
  };
  return {
    ...src,
    id: newPrintTemplateId(),
    name: `${src.name}（副本）`,
    elements: src.elements.map(el => ({ ...el, id: remap(el.id) })),
    createdAt: t,
    updatedAt: t,
  };
}
