import type { PrintTemplate } from '../types';

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

export function createBlankCustomTemplate(
  widthMm: number = PRINT_PAPER_A4_MM.widthMm,
  heightMm: number = PRINT_PAPER_A4_MM.heightMm,
  name: string = '未命名模板',
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
