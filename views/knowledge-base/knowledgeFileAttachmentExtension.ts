import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import KnowledgeFileAttachmentCard from './KnowledgeFileAttachmentCard';

/** 附件节点承载的资产信息（同时用于预览壳入参） */
export interface KnowledgeAttachmentInfo {
  assetUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface KnowledgeFileAttachmentOptions {
  /** 打开全屏预览（由编辑器宿主注入，读取最新 state 无需重建编辑器） */
  onPreview?: (info: KnowledgeAttachmentInfo) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileAttachment: {
      insertFileAttachment: (attrs: KnowledgeAttachmentInfo) => ReturnType;
    };
  }
}

/** 资料库正文「附件」块：卡片展示 + 全屏预览 + 下载（飞书式） */
export const KnowledgeFileAttachment = Node.create<KnowledgeFileAttachmentOptions>({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { onPreview: undefined };
  },

  addAttributes() {
    return {
      assetUrl: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-asset-url') || '',
        renderHTML: (attributes: { assetUrl?: string }) => {
          if (!attributes.assetUrl) return {};
          return { 'data-asset-url': attributes.assetUrl };
        },
      },
      fileName: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-file-name') || '',
        renderHTML: (attributes: { fileName?: string }) => {
          if (!attributes.fileName) return {};
          return { 'data-file-name': attributes.fileName };
        },
      },
      mimeType: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-mime-type') || '',
        renderHTML: (attributes: { mimeType?: string }) => {
          if (!attributes.mimeType) return {};
          return { 'data-mime-type': attributes.mimeType };
        },
      },
      sizeBytes: {
        default: 0,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-size-bytes');
          const n = raw ? Number(raw) : 0;
          return Number.isFinite(n) ? n : 0;
        },
        renderHTML: (attributes: { sizeBytes?: number }) => {
          if (!attributes.sizeBytes) return {};
          return { 'data-size-bytes': String(attributes.sizeBytes) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file-attachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'file-attachment',
        class: 'kb-file-attachment',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KnowledgeFileAttachmentCard);
  },

  addCommands() {
    return {
      insertFileAttachment: (attrs: KnowledgeAttachmentInfo) => ({ chain }) => {
        if (!attrs.assetUrl?.trim()) return false;
        return chain()
          .focus()
          .insertContent({ type: this.name, attrs })
          .run();
      },
    };
  },
});
