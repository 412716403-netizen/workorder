import { isAllowedKnowledgeExternalUrl } from '../../shared/knowledgeLinkUrl';

/** 在编辑器正文内点击超链接时打开（编辑/只读均生效） */
export function bindKnowledgeEditorLinkClick(root: HTMLElement): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const el = event.target;
    if (!(el instanceof Element)) return;
    const anchor = el.closest('a');
    if (!anchor || !root.contains(anchor)) return;
    const href = anchor.getAttribute('href');
    if (!href || !isAllowedKnowledgeExternalUrl(href)) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(href, anchor.getAttribute('target') || '_blank', 'noopener,noreferrer');
  };

  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
