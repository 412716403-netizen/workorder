import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader2 } from 'lucide-react';
import { fetchKnowledgeAssetBlob } from '../../services/api/knowledgeBase';
import { isDocxOnlinePreviewable } from '../../utils/knowledgeAttachment';

interface KnowledgeWordPreviewProps {
  assetUrl: string;
  mimeType: string;
  fileName: string;
}

/** 资料库附件：Word（.docx）分页式预览（docx-preview） */
const KnowledgeWordPreview: React.FC<KnowledgeWordPreviewProps> = ({
  assetUrl,
  mimeType,
  fileName,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const clearContainers = () => {
      if (bodyRef.current) bodyRef.current.innerHTML = '';
      if (styleRef.current) styleRef.current.innerHTML = '';
    };

    const run = async () => {
      setLoading(true);
      setError(null);
      clearContainers();

      if (!isDocxOnlinePreviewable(mimeType, fileName)) {
        if (!cancelled) {
          setError('旧版 .doc 暂不支持在线预览，请下载后用 Word 打开，或另存为 .docx 后重新上传');
          setLoading(false);
        }
        return;
      }

      try {
        const blob = await fetchKnowledgeAssetBlob(assetUrl);
        if (cancelled || !bodyRef.current) return;

        await renderAsync(blob, bodyRef.current, styleRef.current ?? undefined, {
          className: 'kb-docx',
          inWrapper: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          ignoreWidth: false,
          ignoreHeight: false,
          useBase64URL: true,
        });
        if (cancelled) {
          clearContainers();
          return;
        }
        if (!bodyRef.current.childElementCount) {
          setError('文档内容为空或无法解析');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Word 预览失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      clearContainers();
    };
  }, [assetUrl, mimeType, fileName]);

  return (
    <div className="kb-word-preview">
      <div ref={styleRef} className="kb-word-preview-styles" hidden aria-hidden />
      {loading && (
        <div className="kb-file-preview-hint kb-word-preview-status">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <p>正在解析 Word…</p>
        </div>
      )}
      {error && !loading && (
        <div className="kb-file-preview-hint kb-word-preview-status">
          <p className="kb-file-preview-fallback-title">{error}</p>
        </div>
      )}
      <div
        ref={bodyRef}
        className={`kb-word-preview-body${loading || error ? ' is-hidden' : ''}`}
      />
    </div>
  );
};

export default KnowledgeWordPreview;
