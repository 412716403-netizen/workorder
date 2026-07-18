import React, { useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  Download,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  MonitorPlay,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadKnowledgeAsset } from '../../services/api/knowledgeBase';
import {
  formatFileSize,
  normalizeAttachmentDisplayMode,
  resolveAttachmentKind,
  type KnowledgeAttachmentDisplayMode,
} from '../../utils/knowledgeAttachment';
import type { KnowledgeFileAttachmentOptions } from './knowledgeFileAttachmentExtension';

const KIND_ICON = {
  excel: { Icon: FileSpreadsheet, className: 'text-emerald-600 bg-emerald-50' },
  pdf: { Icon: FileText, className: 'text-rose-600 bg-rose-50' },
  image: { Icon: ImageIcon, className: 'text-amber-600 bg-amber-50' },
  video: { Icon: Film, className: 'text-sky-600 bg-sky-50' },
  other: { Icon: File, className: 'text-slate-500 bg-slate-100' },
} as const;

const KnowledgeFileAttachmentCard: React.FC<NodeViewProps> = ({
  node,
  selected,
  extension,
  updateAttributes,
  editor,
}) => {
  const assetUrl = String(node.attrs.assetUrl || '');
  const fileName = String(node.attrs.fileName || '') || '未命名文件';
  const mimeType = String(node.attrs.mimeType || '');
  const sizeBytes = Number(node.attrs.sizeBytes || 0);
  const [downloading, setDownloading] = useState(false);

  const kind = resolveAttachmentKind(mimeType, fileName);
  const displayMode = normalizeAttachmentDisplayMode(node.attrs.displayMode, mimeType, fileName);
  const { Icon, className } = KIND_ICON[kind];
  const editable = editor.isEditable;
  const isVideoPlayer = kind === 'video' && displayMode === 'player';

  const openPreview = () => {
    if (!assetUrl) return;
    const onPreview = (extension.options as KnowledgeFileAttachmentOptions).onPreview;
    onPreview?.({ assetUrl, fileName, mimeType, sizeBytes, displayMode });
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

  const setDisplayMode = (mode: KnowledgeAttachmentDisplayMode) => {
    if (!editable || kind !== 'video') return;
    updateAttributes({ displayMode: mode });
  };

  if (isVideoPlayer) {
    return (
      <NodeViewWrapper
        className={`kb-file-attachment-player${selected ? ' is-selected' : ''}`}
        data-drag-handle
      >
        <div className="kb-file-attachment-player-toolbar">
          <span className="kb-file-attachment-player-title" title={fileName}>
            {fileName}
            <span className="kb-file-attachment-player-size">{formatFileSize(sizeBytes)}</span>
          </span>
          <span className="kb-file-attachment-actions is-always-visible">
            {editable && (
              <button
                type="button"
                className="kb-file-attachment-action"
                onClick={(e) => { e.stopPropagation(); setDisplayMode('tag'); }}
                title="切换为标签展示"
                aria-label="切换为标签展示"
              >
                <LayoutList className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className="kb-file-attachment-action"
              onClick={(e) => { e.stopPropagation(); openPreview(); }}
              title="全屏预览"
              aria-label="全屏预览"
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
        </div>
        <video
          className="kb-file-attachment-video"
          src={assetUrl}
          controls
          preload="metadata"
          playsInline
          onClick={(e) => e.stopPropagation()}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={`kb-file-attachment-card${selected ? ' is-selected' : ''}`}
      data-drag-handle
    >
      <button
        type="button"
        className="kb-file-attachment-main"
        onClick={openPreview}
        title={kind === 'video' ? `播放 ${fileName}` : `预览 ${fileName}`}
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
        {editable && kind === 'video' && (
          <button
            type="button"
            className="kb-file-attachment-action"
            onClick={(e) => { e.stopPropagation(); setDisplayMode('player'); }}
            title="切换为视频窗口"
            aria-label="切换为视频窗口"
          >
            <MonitorPlay className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="kb-file-attachment-action"
          onClick={(e) => { e.stopPropagation(); openPreview(); }}
          title={kind === 'video' ? '播放' : '预览'}
          aria-label={kind === 'video' ? '播放' : '预览'}
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
