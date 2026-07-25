import Image from '@tiptap/extension-image';
import { mergeAttributes, ResizableNodeView } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { knowledgeImagePlaceholderHeight } from './knowledgeTableImage';

/**
 * 修复 Tiptap Image 可缩放节点视图的两处问题：
 * 1. 缓存图片 onload 竞态导致 pointer-events 永久为 none
 * 2. 点击未建立 NodeSelection，缩放手柄与选中样式不出现
 */
export const ResizableImage = Image.extend({
  addNodeView() {
    // options.resize 为 `false | { enabled: boolean; ... }` 联合，先收窄掉 false 再读取配置
    const resizeOptions = this.options.resize;
    if (!resizeOptions || !resizeOptions.enabled || typeof document === 'undefined') {
      return null;
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = resizeOptions;
    const nodeName = this.name;

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const el = document.createElement('img');
      el.draggable = false;
      el.decoding = 'async';

      const mergedAttributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
      Object.entries(mergedAttributes).forEach(([key, value]) => {
        if (value == null) return;
        if (key === 'width' || key === 'height') return;
        if (key === 'src') return; // 延迟赋值，见下方 IntersectionObserver
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
        el.style.minHeight = '';
      };

      // 无 height attr 的历史图片未加载时高度为 0，整篇会同时进入视口；先占位撑开
      if (!(Number(node.attrs.height) > 0)) {
        el.style.minHeight = `${knowledgeImagePlaceholderHeight(Number(node.attrs.width))}px`;
      }

      dom.style.visibility = 'hidden';
      dom.style.pointerEvents = 'none';

      el.addEventListener('load', reveal, { once: true });
      el.addEventListener('error', reveal, { once: true });

      const realSrc = mergedAttributes.src != null ? String(mergedAttributes.src) : '';
      let io: IntersectionObserver | null = null;
      let assigned = false;
      const assignSrc = () => {
        if (!realSrc || assigned) return;
        assigned = true;
        el.src = realSrc;
        if (el.complete && el.naturalWidth > 0) {
          reveal();
        }
      };

      if (!realSrc) {
        reveal();
      } else if (typeof IntersectionObserver === 'undefined') {
        assignSrc();
      } else {
        // 长文档一次性拉全部图片会拖慢打开；进入视口附近再请求
        io = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            assignSrc();
            io?.disconnect();
            io = null;
          },
          { rootMargin: '320px 0px', threshold: 0.01 },
        );
        io.observe(dom);
      }

      const selectImage = (e: MouseEvent) => {
        if (!editor.isEditable) return;
        // 点在缩放手柄上时不抢选（手柄自己处理拖拽）
        if ((e.target as HTMLElement | null)?.closest?.('[data-resize-handle]')) return;
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

      // 覆盖实例方法而非展开对象：ResizableNodeView 的 dom / update 定义在原型上，展开会丢失
      const baseDestroy = nodeView.destroy.bind(nodeView);
      nodeView.destroy = () => {
        io?.disconnect();
        io = null;
        dom.removeEventListener('click', selectImage);
        el.removeEventListener('click', selectImage);
        baseDestroy();
      };

      return nodeView;
    };
  },
});
