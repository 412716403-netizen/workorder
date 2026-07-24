import React, { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { dataUrlToBlobUrl } from '../utils/routeReportFileUrls';
import { useFileOpenInTabMenu } from '../hooks/useFileOpenInTabMenu';

export interface PdfThumbPreviewProps {
  src: string;
  onClick?: () => void;
  title?: string;
  /** 缩略图外框尺寸，默认与产品图片预览接近 */
  className?: string;
}

/**
 * PDF 首页小图预览：将 data URL 转 blob 后用 iframe 缩放展示第一页。
 * 左键打开全屏预览；右键可「在新标签页打开」。
 */
export function PdfThumbPreview({
  src,
  onClick,
  title = '查看 PDF',
  className = 'h-32 w-24',
}: PdfThumbPreviewProps) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const revokeRef = useRef<(() => void) | null>(null);
  const { onContextMenuFor, menuNode } = useFileOpenInTabMenu();

  useEffect(() => {
    revokeRef.current?.();
    revokeRef.current = null;
    setFailed(false);

    if (!src) {
      setFrameSrc(null);
      return;
    }
    if (src.startsWith('blob:')) {
      setFrameSrc(src);
      return;
    }
    if (src.startsWith('data:')) {
      const conv = dataUrlToBlobUrl(src);
      if (conv) {
        revokeRef.current = conv.revoke;
        setFrameSrc(conv.url);
      } else {
        setFrameSrc(null);
        setFailed(true);
      }
      return () => {
        revokeRef.current?.();
        revokeRef.current = null;
      };
    }
    setFrameSrc(src);
    return () => {
      revokeRef.current?.();
      revokeRef.current = null;
    };
  }, [src]);

  return (
    <>
      {menuNode}
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenuFor(src)}
        title={title}
        className={`relative block shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
      >
        {frameSrc && !failed ? (
          <iframe
            src={`${frameSrc}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            title=""
            className="pointer-events-none absolute left-0 top-0 h-[400%] w-[400%] origin-top-left scale-[0.25] border-0 bg-white"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-rose-50 text-rose-500">
            <FileText className="h-6 w-6" />
            <span className="text-[9px] font-bold">PDF</span>
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-900/55 py-0.5 text-center text-[9px] font-bold tracking-wide text-white">
          PDF
        </span>
      </button>
    </>
  );
}

export default PdfThumbPreview;
