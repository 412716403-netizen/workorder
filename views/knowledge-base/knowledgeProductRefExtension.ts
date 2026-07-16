import { Node, mergeAttributes } from '@tiptap/core';

export interface KnowledgeProductRefAttrs {
  productId: string;
  label: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    productRef: {
      insertProductRef: (attrs: KnowledgeProductRefAttrs) => ReturnType;
    };
  }
}

/** 资料库正文内联「关联产品」节点 */
export const KnowledgeProductRef = Node.create({
  name: 'productRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      productId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-product-id') || '',
        renderHTML: (attributes: { productId?: string }) => {
          if (!attributes.productId) return {};
          return { 'data-product-id': attributes.productId };
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
    return [{ tag: 'span[data-type="product-ref"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string)?.trim() || '产品';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'product-ref',
        class: 'kb-product-ref',
      }),
      label,
    ];
  },

  addCommands() {
    return {
      insertProductRef: (attrs: KnowledgeProductRefAttrs) => ({ chain }) => {
        if (!attrs.productId?.trim()) return false;
        const label = attrs.label.trim() || '产品';
        return chain()
          .focus()
          .insertContent({
            type: this.name,
            attrs: { productId: attrs.productId.trim(), label },
          })
          .run();
      },
    };
  },
});
