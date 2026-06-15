import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface KnowledgeImagePreviewOverlayProps {
  src: string | null;
  onClose: () => void;
}

const KnowledgeImagePreviewOverlay: React.FC<KnowledgeImagePreviewOverlayProps> = ({
  src,
  onClose,
}) => {
  useEffect(() => {
    if (!src) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [src, onClose]);

  if (!src || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="kb-image-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      <button
        type="button"
        className="kb-image-preview-close"
        onClick={onClose}
        aria-label="关闭"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt="图片预览"
        className="kb-image-preview-img"
        onClick={e => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
};

export default KnowledgeImagePreviewOverlay;
