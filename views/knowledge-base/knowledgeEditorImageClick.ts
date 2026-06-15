/** 从编辑器点击目标解析资料库正文图片地址 */
export function resolveKnowledgeEditorImageSrc(target: Element, root: HTMLElement): string | null {
  if (!root.contains(target)) return null;
  if (target.closest('[data-resize-handle]')) return null;

  let img: HTMLImageElement | null = null;
  if (target instanceof HTMLImageElement) {
    img = target;
  } else {
    const imageNode = target.closest('[data-node="image"]');
    img = imageNode?.querySelector('img') ?? target.closest('img');
  }
  if (!(img instanceof HTMLImageElement) || !root.contains(img)) return null;

  const src = img.currentSrc || img.getAttribute('src') || '';
  return src.trim() || null;
}

/** 点击正文图片时放大预览（capture 阶段，优先于节点选中） */
export function bindKnowledgeEditorImageClick(
  root: HTMLElement,
  onPreview: (src: string) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const el = event.target;
    if (!(el instanceof Element)) return;
    const src = resolveKnowledgeEditorImageSrc(el, root);
    if (!src) return;
    event.preventDefault();
    event.stopPropagation();
    onPreview(src);
  };

  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
