import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadKnowledgeAsset } from '../../services/api/knowledgeBase';
import { formatFileSize, formatUnpreviewableMessage, resolveAttachmentKind } from '../../utils/knowledgeAttachment';
import KnowledgeExcelPreview from './KnowledgeExcelPreview';
import KnowledgeWordPreview from './KnowledgeWordPreview';
import type { KnowledgeAttachmentInfo } from './knowledgeFileAttachmentExtension';

interface KnowledgeFilePreviewOverlayProps {
  attachment: KnowledgeAttachmentInfo | null;
  onClose: () => void;
}

const HEADER_ICON = {
  excel: { Icon: FileSpreadsheet, className: 'text-emerald-600' },
  pdf: { Icon: FileText, className: 'text-rose-600' },
  image: { Icon: ImageIcon, className: 'text-amber-600' },
  video: { Icon: Film, className: 'text-sky-600' },
  word: { Icon: FileText, className: 'text-blue-600' },
  other: { Icon: File, className: 'text-slate-500' },
} as const;

const KnowledgeFilePreviewOverlay: React.FC<KnowledgeFilePreviewOverlayProps> = ({ attachment, onClose }) => {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!attachment) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [attachment, onClose]);

  const kind = useMemo(
    () => (attachment ? resolveAttachmentKind(attachment.mimeType, attachment.fileName) : 'other'),
    [attachment],
  );

  if (!attachment || typeof document === 'undefined') return null;

  const { assetUrl, fileName, sizeBytes } = attachment;
  const displayName = fileName || '未命名文件';
  const { Icon, className } = HEADER_ICON[kind];

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadKnowledgeAsset(assetUrl, displayName);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div className="kb-file-preview-overlay" role="dialog" aria-modal="true" aria-label="文件预览">
      <header className="kb-file-preview-header">
        <button type="button" className="kb-file-preview-exit" onClick={onClose}>
          <X className="h-4 w-4" />
          <span>退出</span>
        </button>
        <div className="kb-file-preview-title">
          <Icon className={`h-5 w-5 ${className}`} strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="kb-file-preview-name">{displayName}</p>
            <p className="kb-file-preview-size">{formatFileSize(sizeBytes)}</p>
          </div>
        </div>
        <button type="button" className="kb-file-preview-download" onClick={handleDownload} disabled={downloading}>
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span>下载</span>
        </button>
      </header>

      <div className="kb-file-preview-body">
        {kind === 'pdf' && (
          <iframe src={assetUrl} title={displayName} className="kb-file-preview-frame" />
        )}
        {kind === 'image' && (
          <div className="kb-file-preview-image-wrap">
            <img src={assetUrl} alt={displayName} className="kb-file-preview-image" />
          </div>
        )}
        {kind === 'video' && (
          <div className="kb-file-preview-video-wrap">
            <video
              className="kb-file-preview-video"
              src={assetUrl}
              controls
              autoPlay
              preload="metadata"
              playsInline
            />
          </div>
        )}
        {kind === 'excel' && <KnowledgeExcelPreview assetUrl={assetUrl} />}
        {kind === 'word' && (
          <KnowledgeWordPreview
            assetUrl={assetUrl}
            mimeType={attachment.mimeType}
            fileName={displayName}
          />
        )}
        {kind === 'other' && (
          <div className="kb-file-preview-hint kb-file-preview-fallback">
            <File className="h-12 w-12 text-slate-300" strokeWidth={1.4} />
            <p className="kb-file-preview-fallback-title">{formatUnpreviewableMessage(displayName)}</p>
            <p className="kb-file-preview-fallback-sub">{displayName} · {formatFileSize(sizeBytes)}</p>
            <button type="button" className="kb-file-preview-fallback-btn" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span>下载文件</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default KnowledgeFilePreviewOverlay;
