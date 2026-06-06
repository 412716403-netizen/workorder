import React, { useState } from 'react';
import { Download, FileText, ListChecks, X } from 'lucide-react';
import type { DevStageDto, DevStageTemplateDto } from '../../types';
import type { CustomDocFieldType } from '../../types';
import { effectiveCustomDocFieldType } from '../../utils/reportCustomDocField';
import { getFileExtFromDataUrl } from '../../utils/fileHelpers';
import { formatLocalDateTimeZh } from '../../utils/localDateTime';
import { getStageRegisteredDisplayFields } from '../../utils/devStageDisplay';
import { formStandardLabelClass } from '../../styles/uiDensity';

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const str = value.trim();
  if (!str) return null;

  if (type === 'file' && str.startsWith('data:image/')) {
    const ext = getFileExtFromDataUrl(str);
    return (
      <>
        {previewOpen && (
          <div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/90 p-10 backdrop-blur-xl"
            onClick={() => setPreviewOpen(false)}
            role="presentation"
          >
            <button
              type="button"
              className="absolute right-10 top-10 rounded-full bg-white/10 p-4 text-white hover:bg-white/20"
              onClick={() => setPreviewOpen(false)}
            >
              <X className="h-8 w-8" />
            </button>
            <img
              src={str}
              alt=""
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-transform hover:scale-[1.02]"
            title="点击查看"
          >
            <img src={str} alt="" className="h-full w-full object-cover" />
          </button>
          <a
            href={str}
            download={`${label}.${ext}`}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            下载
          </a>
        </div>
      </>
    );
  }

  if (type === 'file' && str.startsWith('data:')) {
    const ext = getFileExtFromDataUrl(str);
    const isPdf = str.startsWith('data:application/pdf');
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <FileText className={`h-6 w-6 ${isPdf ? 'text-red-400' : 'text-indigo-500'}`} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-slate-400">{isPdf ? 'PDF 文档' : '附件'}</span>
          <a
            href={str}
            download={`${label}.${ext}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            <Download className="h-3.5 w-3.5" /> 下载
          </a>
        </div>
      </div>
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
