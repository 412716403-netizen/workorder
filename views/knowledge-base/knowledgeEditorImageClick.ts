/** 从编辑器点击目标解析资料库正文图片地址（仅点在 img 本身才预览） */
export function resolveKnowledgeEditorImageSrc(target: Element, root: HTMLElement): string | null {
  if (!root.contains(target)) return null;
  // 点在节点空白/缩放手柄/包装层上不预览，避免「这一行都能点开」
  if (!(target instanceof HTMLImageElement)) return null;

  const src = target.currentSrc || target.getAttribute('src') || '';
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
