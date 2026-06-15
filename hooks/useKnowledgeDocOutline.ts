import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/core';
import {
  collectKnowledgeOutlineFromEditor,
  scrollEditorToKnowledgeOutline,
  type KnowledgeOutlineItem,
} from '../utils/knowledgeDocOutline';

export function useKnowledgeDocOutline(
  editor: Editor | null,
  scrollRootRef: RefObject<HTMLElement | null>,
) {
  const [items, setItems] = useState<KnowledgeOutlineItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const syncOutline = useCallback(() => {
    if (!editor) {
      setItems([]);
      setActiveId(null);
      return;
    }
    const next = collectKnowledgeOutlineFromEditor(editor);
    setItems(next);
    setActiveId(prev => (prev && next.some(i => i.id === prev) ? prev : next[0]?.id ?? null));
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    syncOutline();
    const onChange = () => syncOutline();
    editor.on('update', onChange);
    return () => {
      editor.off('update', onChange);
    };
  }, [editor, syncOutline]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || !editor || items.length === 0) return;

    const headingEls = items
      .map(item => {
        if (item.pos == null) return null;
        const dom = editor.view.nodeDOM(item.pos);
        return dom instanceof HTMLElement ? dom : null;
      })
      .filter((el): el is HTMLElement => el != null);

    if (headingEls.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0]?.target;
        if (!(top instanceof HTMLElement)) return;
        const index = headingEls.indexOf(top);
        if (index >= 0 && items[index]) setActiveId(items[index].id);
      },
      { root, rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );

    headingEls.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [editor, items, scrollRootRef]);

  const jumpTo = useCallback((item: KnowledgeOutlineItem) => {
    if (!editor) return;
    scrollEditorToKnowledgeOutline(editor, item, scrollRootRef.current);
    setActiveId(item.id);
  }, [editor, scrollRootRef]);

  return { items, activeId, jumpTo };
}
