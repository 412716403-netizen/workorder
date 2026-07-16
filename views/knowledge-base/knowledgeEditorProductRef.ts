/** 资料库「关联产品」展示文案：名称（货号） */
export function formatKnowledgeProductRefLabel(product: {
  name?: string | null;
  sku?: string | null;
}): string {
  const name = (product.name || '').trim() || '未命名产品';
  const sku = (product.sku || '').trim();
  return sku ? `${name}（${sku}）` : name;
}

/** 从编辑器点击目标解析关联产品 id */
export function resolveKnowledgeEditorProductRefId(
  target: Element,
  root: HTMLElement,
): string | null {
  if (!root.contains(target)) return null;
  const chip = target.closest('[data-type="product-ref"]');
  if (!(chip instanceof HTMLElement) || !root.contains(chip)) return null;
  const id = chip.getAttribute('data-product-id')?.trim() || '';
  return id || null;
}

/** 点击正文关联产品时打开产品档案 */
export function bindKnowledgeEditorProductRefClick(
  root: HTMLElement,
  onOpen: (productId: string) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const el = event.target;
    if (!(el instanceof Element)) return;
    const productId = resolveKnowledgeEditorProductRefId(el, root);
    if (!productId) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen(productId);
  };

  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
