import React, { useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Download, Eye, File, FileSpreadsheet, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadKnowledgeAsset } from '../../services/api/knowledgeBase';
import { formatFileSize, resolveAttachmentKind } from '../../utils/knowledgeAttachment';
import type { KnowledgeFileAttachmentOptions } from './knowledgeFileAttachmentExtension';

const KIND_ICON = {
  excel: { Icon: FileSpreadsheet, className: 'text-emerald-600 bg-emerald-50' },
  pdf: { Icon: FileText, className: 'text-rose-600 bg-rose-50' },
  image: { Icon: ImageIcon, className: 'text-amber-600 bg-amber-50' },
  other: { Icon: File, className: 'text-slate-500 bg-slate-100' },
} as const;

const KnowledgeFileAttachmentCard: React.FC<NodeViewProps> = ({ node, selected, extension }) => {
  const assetUrl = String(node.attrs.assetUrl || '');
  const fileName = String(node.attrs.fileName || '') || '未命名文件';
  const mimeType = String(node.attrs.mimeType || '');
  const sizeBytes = Number(node.attrs.sizeBytes || 0);
  const [downloading, setDownloading] = useState(false);

  const kind = resolveAttachmentKind(mimeType, fileName);
  const { Icon, className } = KIND_ICON[kind];

  const openPreview = () => {
    if (!assetUrl) return;
    const onPreview = (extension.options as KnowledgeFileAttachmentOptions).onPreview;
    onPreview?.({ assetUrl, fileName, mimeType, sizeBytes });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assetUrl || downloading) return;
    setDownloading(true);
    try {
      await downloadKnowledgeAsset(assetUrl, fileName);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <NodeViewWrapper
      className={`kb-file-attachment-card${selected ? ' is-selected' : ''}`}
      data-drag-handle
    >
      <button
        type="button"
        className="kb-file-attachment-main"
        onClick={openPreview}
        title={`预览 ${fileName}`}
      >
        <span className={`kb-file-attachment-icon ${className}`}>
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <span className="kb-file-attachment-meta">
          <span className="kb-file-attachment-name">{fileName}</span>
          <span className="kb-file-attachment-size">{formatFileSize(sizeBytes)}</span>
        </span>
      </button>

      <span className="kb-file-attachment-actions">
        <button
          type="button"
          className="kb-file-attachment-action"
          onClick={(e) => { e.stopPropagation(); openPreview(); }}
          title="预览"
          aria-label="预览"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="kb-file-attachment-action"
          onClick={handleDownload}
          title="下载"
          aria-label="下载"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </span>
    </NodeViewWrapper>
  );
};

export default KnowledgeFileAttachmentCard;
