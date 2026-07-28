import { Node, mergeAttributes } from '@tiptap/core';
import { KnowledgeBizDocKind, isKnowledgeBizDocKind } from '../../shared/types';

export interface KnowledgeBizDocRefAttrs {
  docKind: KnowledgeBizDocKind | string;
  docId: string;
  docNumber: string;
  label: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bizDocRef: {
      insertBizDocRef: (attrs: KnowledgeBizDocRefAttrs) => ReturnType;
    };
  }
}

/** 资料库正文内联「关联单据」节点 */
export const KnowledgeBizDocRef = Node.create({
  name: 'bizDocRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      docKind: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-doc-kind') || '',
        renderHTML: (attributes: { docKind?: string }) => {
          if (!attributes.docKind) return {};
          return { 'data-doc-kind': attributes.docKind };
        },
      },
      docId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-doc-id') || '',
        renderHTML: (attributes: { docId?: string }) => {
          if (!attributes.docId) return {};
          return { 'data-doc-id': attributes.docId };
        },
      },
      docNumber: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-doc-number') || '',
        renderHTML: (attributes: { docNumber?: string }) => {
          if (!attributes.docNumber) return {};
          return { 'data-doc-number': attributes.docNumber };
        },
      },
      label: {
        default: '',
        parseHTML: (element: HTMLElement) => {
          const fromAttr = element.getAttribute('data-label');
          if (fromAttr?.trim()) return fromAttr.trim();
          return (element.textContent || '').trim();
        },
        renderHTML: (attributes: { label?: string }) => {
          if (!attributes.label) return {};
          return { 'data-label': attributes.label };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="biz-doc-ref"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string)?.trim() || '单据';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'biz-doc-ref',
        class: 'kb-biz-doc-ref',
      }),
      label,
    ];
  },

  addCommands() {
    return {
      insertBizDocRef: (attrs: KnowledgeBizDocRefAttrs) => ({ tr, dispatch, state }) => {
        const docKind = String(attrs.docKind || '').trim();
        const docNumber = String(attrs.docNumber || '').trim();
        if (!isKnowledgeBizDocKind(docKind) || !docNumber) return false;
        if (docKind === KnowledgeBizDocKind.PLAN && !String(attrs.docId || '').trim()) return false;
        const type = state.schema.nodes[this.name];
        if (!type) return false;
        const node = type.create({
          docKind,
          docId: String(attrs.docId || '').trim(),
          docNumber,
          label: String(attrs.label || '').trim() || '单据',
        });
        if (dispatch) {
          // 与关联产品一致：内联插入，避免 insertContent 包成新段落
          let next = tr.replaceSelectionWith(node);
          const after = next.selection.to;
          next = next.insertText(' ', after);
          dispatch(next.scrollIntoView());
        }
        return true;
      },
    };
  },
});
