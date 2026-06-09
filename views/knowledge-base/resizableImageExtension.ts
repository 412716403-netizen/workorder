import Image from '@tiptap/extension-image';
import { mergeAttributes, ResizableNodeView } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

/**
 * 修复 Tiptap Image 可缩放节点视图的两处问题：
 * 1. 缓存图片 onload 竞态导致 pointer-events 永久为 none
 * 2. 点击未建立 NodeSelection，缩放手柄与选中样式不出现
 */
export const ResizableImage = Image.extend({
  addNodeView() {
    if (!this.options.resize?.enabled || typeof document === 'undefined') {
      return null;
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize;
    const nodeName = this.name;

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const el = document.createElement('img');
      el.draggable = false;

      const mergedAttributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
      Object.entries(mergedAttributes).forEach(([key, value]) => {
        if (value == null) return;
        if (key === 'width' || key === 'height') return;
        el.setAttribute(key, String(value));
      });

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos,
        onResize: (width, height) => {
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
        },
        onCommit: (width, height) => {
          const pos = getPos();
          if (pos === undefined) return;
          editor.chain().setNodeSelection(pos).updateAttributes(nodeName, { width, height }).run();
        },
        onUpdate: (updatedNode) => updatedNode.type === node.type,
        options: {
          directions,
          min: { width: minWidth, height: minHeight },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
        },
      });

      const dom = nodeView.dom;
      const reveal = () => {
        dom.style.visibility = '';
        dom.style.pointerEvents = '';
      };

      dom.style.visibility = 'hidden';
      dom.style.pointerEvents = 'none';

      el.addEventListener('load', reveal, { once: true });
      el.addEventListener('error', reveal, { once: true });

      if (mergedAttributes.src != null) {
        el.src = String(mergedAttributes.src);
      }

      if (el.complete && el.naturalWidth > 0) {
        reveal();
      }

      const selectImage = (e: MouseEvent) => {
        if (!editor.isEditable) return;
        const pos = getPos();
        if (pos === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        editor.view.dispatch(
          editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)),
        );
      };

      dom.addEventListener('click', selectImage);
      el.addEventListener('click', selectImage);

      return nodeView;
    };
  },
});
