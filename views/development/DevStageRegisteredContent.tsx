import React, { useCallback, useState } from 'react';
import { Download, FileText, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import type { DevStageDto, DevStageTemplateDto } from '../../types';
import type { CustomDocFieldType } from '../../types';
import { effectiveCustomDocFieldType } from '../../utils/reportCustomDocField';
import { formatLocalDateTimeZh } from '../../utils/localDateTime';
import { getStageRegisteredDisplayFields } from '../../utils/devStageDisplay';
import { parseDevStageFileItems, resolveDevStageFileDownloadName } from '../../utils/devStageFileValue';
import { toKnowledgeAttachmentInfo } from '../../utils/devStageAttachmentPreview';
import { formatUnpreviewableMessage, resolveAttachmentKind } from '../../utils/knowledgeAttachment';
import { formStandardLabelClass } from '../../styles/uiDensity';
import KnowledgeFilePreviewOverlay from '../knowledge-base/KnowledgeFilePreviewOverlay';
import type { KnowledgeAttachmentInfo } from '../knowledge-base/knowledgeFileAttachmentExtension';

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

function DevStageFieldValue({
  type,
  value,
  label,
  dateWithTime,
}: {
  type: CustomDocFieldType;
  value: string;
  label: string;
  dateWithTime?: boolean;
}) {
  const [attachmentPreview, setAttachmentPreview] = useState<KnowledgeAttachmentInfo | null>(null);
  const openAttachment = useCallback(
    (item: { url: string; name?: string }, index: number) => {
      const info = toKnowledgeAttachmentInfo(item, label, index);
      const kind = resolveAttachmentKind(info.mimeType, info.fileName);
      if (kind === 'image' || kind === 'pdf' || kind === 'excel' || kind === 'word' || kind === 'video') {
        setAttachmentPreview(info);
        return;
      }
      toast.message(formatUnpreviewableMessage(info.fileName));
      const a = document.createElement('a');
      a.href = item.url;
      a.download = info.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [label],
  );

  const str = value.trim();
  if (!str) return null;

  if (type === 'file') {
    const items = parseDevStageFileItems(str);
    if (items.length === 0) return null;

    return (
      <>
        <KnowledgeFilePreviewOverlay
          attachment={attachmentPreview}
          onClose={() => setAttachmentPreview(null)}
        />
        <div className="flex flex-wrap items-center gap-3">
          {items.map((item, idx) => {
            const url = item.url;
            const downloadName = resolveDevStageFileDownloadName(item, label, idx);
            const info = toKnowledgeAttachmentInfo(item, label, idx);
            const kind = resolveAttachmentKind(info.mimeType, info.fileName);
            const isImage = kind === 'image';
            const isPdf = kind === 'pdf';
            const kindLabel =
              kind === 'pdf' ? 'PDF 文档' : kind === 'excel' ? 'Excel' : kind === 'word' ? 'Word' : '附件';
            if (isImage) {
              return (
                <div key={`${idx}-${url.slice(0, 24)}`} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openAttachment(item, idx)}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-transform hover:scale-[1.02]"
                    title={downloadName}
                  >
                    <img src={url} alt={downloadName} className="h-full w-full object-cover" />
                  </button>
                  <a
                    href={url}
                    download={downloadName}
                    className="max-w-[96px] truncate text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                    title={downloadName}
                  >
                    {item.name || '下载'}
                  </a>
                </div>
              );
            }
            return (
              <div
                key={`${idx}-${url.slice(0, 24)}`}
                className="flex max-w-[240px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => openAttachment(item, idx)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100"
                  title={`查看 ${downloadName}`}
                >
                  <FileText className={`h-5 w-5 ${isPdf ? 'text-red-400' : 'text-indigo-500'}`} />
                </button>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => openAttachment(item, idx)}
                    className="truncate text-left text-[11px] font-semibold text-slate-700 hover:text-indigo-700 hover:underline"
                    title={downloadName}
                  >
                    {item.name || kindLabel}
                  </button>
                  <a
                    href={url}
                    download={downloadName}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    <Download className="h-3.5 w-3.5" /> 下载
                  </a>
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
