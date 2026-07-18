/** 资料库「关联文档」展示文案 */
export function formatKnowledgeDocumentRefLabel(title?: string | null): string {
  return (title || '').trim() || '无标题';
}

/** 从编辑器点击目标解析关联文档 id */
export function resolveKnowledgeEditorDocumentRefId(
  target: Element,
  root: HTMLElement,
): string | null {
  if (!root.contains(target)) return null;
  const chip = target.closest('[data-type="document-ref"]');
  if (!(chip instanceof HTMLElement) || !root.contains(chip)) return null;
  const id = chip.getAttribute('data-document-id')?.trim() || '';
  return id || null;
}

/** 点击正文关联文档时打开文档预览 */
export function bindKnowledgeEditorDocumentRefClick(
  root: HTMLElement,
  onOpen: (documentId: string) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const el = event.target;
    if (!(el instanceof Element)) return;
    const documentId = resolveKnowledgeEditorDocumentRefId(el, root);
    if (!documentId) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen(documentId);
  };

  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
