import type { PrintTemplate } from '../types';

const PREFIX = 'printTemplateBootstrap:';

/** 新开打印编辑器页面前写入，避免全局配置尚未同步时出现空白画布 */
export function stashPrintTemplateForEditorBootstrap(tpl: PrintTemplate): void {
  try {
    sessionStorage.setItem(`${PREFIX}${tpl.id}`, JSON.stringify(tpl));
  } catch {
    /* quota / private mode */
  }
}

export function takePrintTemplateEditorBootstrap(id: string): PrintTemplate | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as PrintTemplate;
  } catch {
    return null;
  }
}

export function clearPrintTemplateEditorBootstrap(id: string): void {
  try {
    sessionStorage.removeItem(`${PREFIX}${id}`);
  } catch {
    /* ignore */
  }
}
