import {
  KnowledgeBizDocKind,
  KNOWLEDGE_BIZ_DOC_KIND_LABEL,
  isKnowledgeBizDocKind,
} from '../../shared/types';

export interface KnowledgeBizDocRefResolved {
  docKind: KnowledgeBizDocKind;
  docId: string;
  docNumber: string;
}

/** 资料库「关联单据」展示文案：种类 + 单号 */
export function formatKnowledgeBizDocRefLabel(
  docKind: KnowledgeBizDocKind | string,
  docNumber?: string | null,
): string {
  const kindLabel = isKnowledgeBizDocKind(docKind)
    ? KNOWLEDGE_BIZ_DOC_KIND_LABEL[docKind]
    : '单据';
  const num = (docNumber || '').trim();
  return num ? `${kindLabel} ${num}` : kindLabel;
}

/** 从编辑器点击目标解析关联单据 */
export function resolveKnowledgeEditorBizDocRef(
  target: Element,
  root: HTMLElement,
): KnowledgeBizDocRefResolved | null {
  if (!root.contains(target)) return null;
  const chip = target.closest('[data-type="biz-doc-ref"]');
  if (!(chip instanceof HTMLElement) || !root.contains(chip)) return null;
  const docKindRaw = chip.getAttribute('data-doc-kind')?.trim() || '';
  if (!isKnowledgeBizDocKind(docKindRaw)) return null;
  const docNumber = chip.getAttribute('data-doc-number')?.trim() || '';
  if (!docNumber) return null;
  const docId = chip.getAttribute('data-doc-id')?.trim() || '';
  if (docKindRaw === KnowledgeBizDocKind.PLAN && !docId) return null;
  return { docKind: docKindRaw, docId, docNumber };
}

/** 点击正文关联单据时打开详情 */
export function bindKnowledgeEditorBizDocRefClick(
  root: HTMLElement,
  onOpen: (ref: KnowledgeBizDocRefResolved) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const el = event.target;
    if (!(el instanceof Element)) return;
    const ref = resolveKnowledgeEditorBizDocRef(el, root);
    if (!ref) return;
    event.preventDefault();
    event.stopPropagation();
    onOpen(ref);
  };

  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
