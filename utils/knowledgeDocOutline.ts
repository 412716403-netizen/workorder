import type { Editor } from '@tiptap/core';

export type KnowledgeOutlineLevel = 1 | 2 | 3;

export interface KnowledgeOutlineItem {
  id: string;
  level: KnowledgeOutlineLevel;
  text: string;
  /** Tiptap 文档位置（仅编辑器内导航） */
  pos?: number;
  /** 只读 HTML 预览中的元素 id */
  elementId?: string;
}

function slugifyHeadingText(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]+/g, '')
    .slice(0, 48);
  return base || 'heading';
}

function makeOutlineId(text: string, level: KnowledgeOutlineLevel, index: number): string {
  return `${slugifyHeadingText(text)}-${level}-${index}`;
}

/** 从 Tiptap 编辑器提取标题大纲 */
export function collectKnowledgeOutlineFromEditor(editor: Editor): KnowledgeOutlineItem[] {
  const items: KnowledgeOutlineItem[] = [];
  let index = 0;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return;
    const level = Number(node.attrs.level);
    if (level !== 1 && level !== 2 && level !== 3) return;
    const text = node.textContent.trim();
    if (!text) return;
    items.push({
      id: makeOutlineId(text, level as KnowledgeOutlineLevel, index),
      level: level as KnowledgeOutlineLevel,
      text,
      pos,
    });
    index += 1;
  });

  return items;
}

/** 为只读 HTML 中的标题补充 id，并生成大纲 */
export function collectKnowledgeOutlineFromHtmlRoot(root: HTMLElement): KnowledgeOutlineItem[] {
  const items: KnowledgeOutlineItem[] = [];
  const headings = root.querySelectorAll('h1, h2, h3');

  headings.forEach((el, index) => {
    if (!(el instanceof HTMLElement)) return;
    const tag = el.tagName.toLowerCase();
    const level = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
    const text = el.textContent?.trim() ?? '';
    if (!text) return;

    const elementId = el.id || `kb-outline-${index}`;
    if (!el.id) el.id = elementId;

    items.push({
      id: makeOutlineId(text, level, index),
      level,
      text,
      elementId,
    });
  });

  return items;
}

export function scrollEditorToKnowledgeOutline(
  editor: Editor,
  item: KnowledgeOutlineItem,
  scrollRoot: HTMLElement | null,
): void {
  if (item.pos == null) return;
  editor.chain().focus().setTextSelection(item.pos + 1).run();
  const dom = editor.view.nodeDOM(item.pos);
  if (!(dom instanceof HTMLElement)) return;

  if (scrollRoot) {
    const rootRect = scrollRoot.getBoundingClientRect();
    const elRect = dom.getBoundingClientRect();
    scrollRoot.scrollTo({
      top: elRect.top - rootRect.top + scrollRoot.scrollTop - 16,
      behavior: 'smooth',
    });
    return;
  }

  dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function scrollHtmlToKnowledgeOutline(
  scrollRoot: HTMLElement,
  item: KnowledgeOutlineItem,
): void {
  if (!item.elementId) return;
  const el = scrollRoot.querySelector(`#${CSS.escape(item.elementId)}`);
  if (!(el instanceof HTMLElement)) return;

  const rootRect = scrollRoot.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  scrollRoot.scrollTo({
    top: elRect.top - rootRect.top + scrollRoot.scrollTop - 16,
    behavior: 'smooth',
  });
}
