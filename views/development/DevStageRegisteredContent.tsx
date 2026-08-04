import React, { useCallback, useState } from 'react';
import { Download, FileText, ListChecks, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DevStageDto, DevStageTemplateDto } from '../../types';
import type { CustomDocFieldType } from '../../types';
import { effectiveCustomDocFieldType } from '../../utils/reportCustomDocField';
import { formatLocalDateTimeZh } from '../../utils/localDateTime';
import { getStageRegisteredDisplayFields } from '../../utils/devStageDisplay';
import {
  parseDevStageFileItems,
  resolveDevStageFileDownloadName,
} from '../../utils/devStageFileValue';
import type { DevStageFileItem } from '../../utils/devStageFileValue';
import { toKnowledgeAttachmentInfo } from '../../utils/devStageAttachmentPreview';
import {
  formatUnpreviewableMessage,
  resolveAttachmentKind,
  resolveUploadMimeType,
} from '../../utils/knowledgeAttachment';
import { formStandardLabelClass } from '../../styles/uiDensity';
import KnowledgeFilePreviewOverlay from '../knowledge-base/KnowledgeFilePreviewOverlay';
import type { KnowledgeAttachmentInfo } from '../knowledge-base/knowledgeFileAttachmentExtension';
import { downloadKnowledgeAsset } from '../../services/api/knowledgeBase';
import { devStyles } from '../../services/api';

interface DevStageRegisteredContentProps {
  stage: DevStageDto;
  templates: DevStageTemplateDto[];
}

function formatStageFieldDisplayValue(
  type: CustomDocFieldType,
  raw: string,
  dateWithTime?: boolean,
): string {
  if (!raw.trim()) return '';
  if (type === 'date') {
    if (dateWithTime || raw.includes('T') || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:/.test(raw)) {
      return formatLocalDateTimeZh(raw);
    }
    return raw.slice(0, 10);
  }
  return raw;
}

function triggerDownload(url: string, downloadName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function DevStageFieldValue({
  fieldId,
  type,
  value,
  label,
  dateWithTime,
}: {
  fieldId: string;
  type: CustomDocFieldType;
  value: string;
  label: string;
  dateWithTime?: boolean;
}) {
  const [attachmentPreview, setAttachmentPreview] = useState<KnowledgeAttachmentInfo | null>(null);
  const [hydratedItems, setHydratedItems] = useState<DevStageFileItem[] | null>(null);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);

  const items = hydratedItems ?? parseDevStageFileItems(value.trim());

  const ensureItemReady = useCallback(
    async (index: number): Promise<DevStageFileItem | null> => {
      const current = hydratedItems ?? parseDevStageFileItems(value.trim());
      const target = current[index];
      if (!target) return null;
      if (target.url.startsWith('data:') && !target.deferred) return target;
      if (!fieldId) {
        toast.error('无法加载文件：缺少字段编号');
        return null;
      }
      setLoadingIndex(index);
      try {
        const res = await devStyles.getStageField(fieldId);
        const full = parseDevStageFileItems(res.value);
        setHydratedItems(full);
        return full[index] ?? null;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '加载文件失败');
        return null;
      } finally {
        setLoadingIndex(null);
      }
    },
    [fieldId, hydratedItems, value],
  );

  const openAttachment = useCallback(
    async (index: number) => {
      const current = hydratedItems ?? parseDevStageFileItems(value.trim());
      const stub = current[index];
      if (!stub) return;
      const downloadName = resolveDevStageFileDownloadName(stub, label, index);
      const stubKind = resolveAttachmentKind('', downloadName);

      // 视频走二进制流（支持 Range），避免先拉整段 base64 JSON
      if (stubKind === 'video' && fieldId) {
        setAttachmentPreview({
          assetUrl: devStyles.stageFieldFileUrl(fieldId, index),
          fileName: downloadName,
          mimeType: resolveUploadMimeType(downloadName, ''),
          sizeBytes: 0,
        });
        return;
      }

      const item = await ensureItemReady(index);
      if (!item?.url.startsWith('data:')) return;
      const info = toKnowledgeAttachmentInfo(item, label, index);
      const kind = resolveAttachmentKind(info.mimeType, info.fileName);
      if (kind === 'image' || kind === 'pdf' || kind === 'excel' || kind === 'word' || kind === 'video') {
        setAttachmentPreview(info);
        return;
      }
      toast.message(formatUnpreviewableMessage(info.fileName));
      triggerDownload(item.url, info.fileName);
    },
    [ensureItemReady, fieldId, hydratedItems, label, value],
  );

  const downloadAttachment = useCallback(
    async (index: number, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      const current = hydratedItems ?? parseDevStageFileItems(value.trim());
      const stub = current[index];
      if (!stub) return;
      const downloadName = resolveDevStageFileDownloadName(stub, label, index);
      const stubKind = resolveAttachmentKind('', downloadName);

      if (stubKind === 'video' && fieldId) {
        setLoadingIndex(index);
        try {
          await downloadKnowledgeAsset(devStyles.stageFieldFileUrl(fieldId, index), downloadName);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : '下载失败');
        } finally {
          setLoadingIndex(null);
        }
        return;
      }

      const item = await ensureItemReady(index);
      if (!item?.url.startsWith('data:')) return;
      triggerDownload(item.url, resolveDevStageFileDownloadName(item, label, index));
    },
    [ensureItemReady, fieldId, hydratedItems, label, value],
  );

  const str = value.trim();
  if (!str) return null;

  if (type === 'file') {
    if (items.length === 0) return null;

    return (
      <>
        <KnowledgeFilePreviewOverlay
          attachment={attachmentPreview}
          onClose={() => setAttachmentPreview(null)}
        />
        <div className="flex flex-wrap items-center gap-3">
          {items.map((item, idx) => {
            const ready = item.url.startsWith('data:') && !item.deferred;
            const downloadName = resolveDevStageFileDownloadName(item, label, idx);
            const info = ready ? toKnowledgeAttachmentInfo(item, label, idx) : null;
            const kind = info
              ? resolveAttachmentKind(info.mimeType, info.fileName)
              : resolveAttachmentKind('', downloadName);
            const isImage = ready && kind === 'image';
            const isPdf = kind === 'pdf';
            const kindLabel =
              kind === 'pdf' ? 'PDF 文档' : kind === 'excel' ? 'Excel' : kind === 'word' ? 'Word' : '附件';
            const busy = loadingIndex === idx;

            if (isImage) {
              return (
                <div key={`${idx}-${downloadName}`} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openAttachment(idx)}
                    disabled={busy}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-60"
                    title={downloadName}
                  >
                    <img src={item.url} alt={downloadName} className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void downloadAttachment(idx, e)}
                    disabled={busy}
                    className="max-w-[96px] truncate text-[10px] font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
                    title={downloadName}
                  >
                    {busy ? '加载中…' : item.name || '下载'}
                  </button>
                </div>
              );
            }

            return (
              <div
                key={`${idx}-${downloadName}`}
                className="flex max-w-[240px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => void openAttachment(idx)}
                  disabled={busy}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 disabled:opacity-60"
                  title={`查看 ${downloadName}`}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                  ) : (
                    <FileText className={`h-5 w-5 ${isPdf ? 'text-red-400' : 'text-indigo-500'}`} />
                  )}
                </button>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => void openAttachment(idx)}
                    disabled={busy}
                    className="truncate text-left text-[11px] font-semibold text-slate-700 hover:text-indigo-700 hover:underline disabled:opacity-60"
                    title={downloadName}
                  >
                    {item.name || kindLabel}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void downloadAttachment(idx, e)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" /> {busy ? '加载中…' : '下载'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <p className="break-words text-sm font-medium leading-snug text-slate-900">
      {formatStageFieldDisplayValue(type, str, dateWithTime)}
    </p>
  );
}

/** 开发管理主页 · 节点登记内容展示（对齐万濮云样品开发记录卡片） */
const DevStageRegisteredContent: React.FC<DevStageRegisteredContentProps> = ({ stage, templates }) => {
  const rows = getStageRegisteredDisplayFields(stage, templates);

  if (rows.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-5 text-center">
        <p className="text-xs font-medium text-slate-400">暂无登记内容</p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5 text-indigo-500" strokeWidth={2.5} />
        <span className={formStandardLabelClass}>登记内容</span>
      </div>
      <div className="flex flex-wrap gap-4">
        {rows.map(({ field, tplField }) => {
          const fieldType = effectiveCustomDocFieldType({
            type: (tplField?.type ?? field.type ?? 'text') as CustomDocFieldType,
          });
          const isFile = fieldType === 'file';
          return (
            <div
              key={field.id}
              className={`rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 ${
                isFile ? 'min-w-[200px]' : 'min-w-[140px]'
              }`}
            >
              <div className={`mb-1.5 truncate ${formStandardLabelClass}`}>
                {field.label}
              </div>
              <DevStageFieldValue
                fieldId={field.id}
                type={fieldType}
                value={field.value}
                label={field.label}
                dateWithTime={tplField?.dateWithTime}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DevStageRegisteredContent;
