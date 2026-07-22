import { Node, mergeAttributes } from '@tiptap/core';

export interface KnowledgeDocumentRefAttrs {
  documentId: string;
  label: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentRef: {
      insertDocumentRef: (attrs: KnowledgeDocumentRefAttrs) => ReturnType;
    };
  }
}

/** 资料库正文内联「关联文档」节点 */
export const KnowledgeDocumentRef = Node.create({
  name: 'documentRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      documentId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-document-id') || '',
        renderHTML: (attributes: { documentId?: string }) => {
          if (!attributes.documentId) return {};
          return { 'data-document-id': attributes.documentId };
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
    return [{ tag: 'span[data-type="document-ref"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string)?.trim() || '文档';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'document-ref',
        class: 'kb-document-ref',
      }),
      label,
    ];
  },

  addCommands() {
    return {
      insertDocumentRef: (attrs: KnowledgeDocumentRefAttrs) => ({ tr, dispatch, state }) => {
        if (!attrs.documentId?.trim()) return false;
        const type = state.schema.nodes[this.name];
        if (!type) return false;
        const node = type.create({
          documentId: attrs.documentId.trim(),
          label: attrs.label.trim() || '文档',
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
