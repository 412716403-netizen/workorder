import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PdfPreviewViewer } from './PdfPreviewViewer';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

export type MediaFilePreview = { src: string; kind: 'image' | 'pdf' };

export interface MediaFilePreviewOverlayProps {
  preview: MediaFilePreview | null;
  onClose: () => void;
}

/**
 * 图片 / PDF 全屏预览（挂到 body）。
 * Esc 只关本层，不关掉底下的业务弹窗。
 */
export function MediaFilePreviewOverlay({ preview, onClose }: MediaFilePreviewOverlayProps) {
  useEscapeToClose(!!preview, onClose);

  if (!preview || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-900/80 p-8 backdrop-blur-sm"
      style={{ zIndex: 2147483000 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="附件预览"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 z-10 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
        aria-label="关闭预览"
      >
        <X className="h-8 w-8" />
      </button>
      <div
        className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {preview.kind === 'image' ? (
          <img src={preview.src} alt="预览" className="h-full max-h-[85vh] w-full object-contain" />
        ) : (
          <PdfPreviewViewer src={preview.src} />
        )}
      </div>
    </div>,
    document.body,
  );
}

export default MediaFilePreviewOverlay;
