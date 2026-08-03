import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanFormFieldConfig } from '../types';
import {
  DEV_STAGE_FILE_MAX_COUNT,
  parseDevStageFileItems,
  resolveDevStageFileDownloadName,
  serializeDevStageFileItems,
  type DevStageFileItem,
} from '../utils/devStageFileValue';
import { toKnowledgeAttachmentInfo } from '../utils/devStageAttachmentPreview';
import { formatUnpreviewableMessage, resolveAttachmentKind } from '../utils/knowledgeAttachment';
import { effectivePlanFormFieldType } from '../utils/planFormCustomField';
import {
  parseKnowledgeFieldValue,
  stringifyKnowledgeFieldValue,
} from '../utils/knowledgeFieldValue';
import {
  KnowledgeDocPickerModal,
  KnowledgeDocPreviewModal,
} from './knowledge/KnowledgeDocPickerModal';
import {
  formatLocalDateTimeZh,
  localNowForDatetimeLocal,
  localTodayYmd,
  toDatetimeLocalInputValue,
} from '../utils/localDateTime';
import { getFileExtFromDataUrl } from '../utils/fileHelpers';
import { readFileAsDevStageItem } from '../utils/readFileAsDevStageItem';
import { PdfThumbPreview } from './PdfThumbPreview';
import KnowledgeFilePreviewOverlay from '../views/knowledge-base/KnowledgeFilePreviewOverlay';
import type { KnowledgeAttachmentInfo } from '../views/knowledge-base/knowledgeFileAttachmentExtension';

/** 打开附件预览：父级 onFilePreview 优先处理 image/pdf；其余走资料库 Overlay。 */
function useDevStageAttachmentPreview(onFilePreview?: (url: string, type: 'image' | 'pdf') => void) {
  const [attachmentPreview, setAttachmentPreview] = useState<KnowledgeAttachmentInfo | null>(null);
  const openAttachment = useCallback(
    (item: DevStageFileItem, fallbackLabel: string, index: number) => {
      const info = toKnowledgeAttachmentInfo(item, fallbackLabel, index);
      const kind = resolveAttachmentKind(info.mimeType, info.fileName);
      if (onFilePreview && (kind === 'image' || kind === 'pdf')) {
        onFilePreview(item.url, kind);
        return;
      }
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
    [onFilePreview],
  );
  const overlay = (
    <KnowledgeFilePreviewOverlay
      attachment={attachmentPreview}
      onClose={() => setAttachmentPreview(null)}
    />
  );
  return { openAttachment, overlay };
}

/** 「资料库」类型字段的填值控件：选择资料库文档，存储 {id,title}。 */
export const PlanFormKnowledgeInput: React.FC<{
  value: unknown;
  onChange: (next: unknown) => void;
}> = ({ value, onChange }) => {
  const ref = parseKnowledgeFieldValue(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
        >
          <BookOpen className="h-3.5 w-3.5" /> {ref ? '重新选择' : '从资料库选择'}
        </button>
        {ref && (
          <>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="max-w-[180px] truncate text-xs font-bold text-indigo-600 hover:underline"
              title={ref.title || '查看'}
            >
              {ref.title || '查看文件'}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex items-center gap-0.5 text-xs font-bold text-rose-500 hover:text-rose-700"
            >
              <X className="h-3 w-3" /> 移除
            </button>
          </>
        )}
      </div>
      <KnowledgeDocPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedId={ref?.id ?? null}
        onSelect={r => onChange(stringifyKnowledgeFieldValue(r))}
      />
      <KnowledgeDocPreviewModal
        isOpen={previewOpen}
        docId={ref?.id ?? null}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
};

const PlanFormDateCustomInput: React.FC<{
  cf: PlanFormFieldConfig;
  value: unknown;
  onChange: (next: unknown) => void;
  controlClassName: string;
}> = ({ cf, value, onChange, controlClassName }) => {
  const withTime = !!cf.dateWithTime;
  const auto = !!cf.dateAutoFill;
  const strVal = value === undefined || value === null ? '' : String(value);
  const filledOnce = useRef(false);
  useLayoutEffect(() => {
    filledOnce.current = false;
  }, [cf.id]);
  useLayoutEffect(() => {
    if (!auto) return;
    if (value != null && String(value).trim() !== '') return;
    if (filledOnce.current) return;
    filledOnce.current = true;
    onChange(withTime ? localNowForDatetimeLocal() : localTodayYmd());
  }, [auto, withTime, cf.id, value, onChange]);
  const inputType = withTime ? 'datetime-local' : 'date';
  const inputValue = withTime ? toDatetimeLocalInputValue(strVal) : strVal.slice(0, 10);
  return (
    <input
      type={inputType}
      className={controlClassName}
      value={inputValue}
      step={withTime ? 60 : undefined}
      autoComplete="off"
      onChange={e => onChange(e.target.value)}
    />
  );
};

export interface PlanFormCustomFieldInputProps {
  cf: PlanFormFieldConfig;
  value: unknown;
  onChange: (next: unknown) => void;
  /** 文本 / 日期 / 下拉 */
  controlClassName: string;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
  /** 开发节点登记等：文件字段可追加多个（默认单文件）；accept 与单文件一致（图片/PDF/Office） */
  multipleFiles?: boolean;
}

const PlanFormFileFieldInput: React.FC<{
  cf: PlanFormFieldConfig;
  value: unknown;
  onChange: (next: unknown) => void;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
  multipleFiles?: boolean;
}> = ({ cf, value, onChange, onFilePreview, multipleFiles = false }) => {
  const { openAttachment, overlay } = useDevStageAttachmentPreview(onFilePreview);
  const [dragDepth, setDragDepth] = useState(0);
  const dragOver = dragDepth > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = parseDevStageFileItems(value);
  const canAdd = multipleFiles ? items.length < DEV_STAGE_FILE_MAX_COUNT : true;
  const acceptDrop = canAdd;

  const ingestFiles = useCallback(
    (fileList: FileList | File[] | null | undefined) => {
      const files = Array.from(fileList ?? []).filter(Boolean);
      if (!files.length) return;
      if (multipleFiles) {
        const room = DEV_STAGE_FILE_MAX_COUNT - items.length;
        if (room <= 0) return;
        const slice = files.slice(0, room);
        void Promise.all(slice.map((file) => readFileAsDevStageItem(file)))
          .then((added) => {
            const next = [
              ...items,
              ...added.filter((a): a is DevStageFileItem => a != null),
            ];
            onChange(serializeDevStageFileItems(next));
          })
          .catch(() => toast.error('文件读取失败'));
        return;
      }
      const file = files[0];
      if (!file) return;
      void readFileAsDevStageItem(file)
        .then((item) => {
          if (!item) {
            onChange('');
            return;
          }
          onChange(serializeDevStageFileItems([item]));
        })
        .catch(() => toast.error('文件读取失败'));
    },
    [multipleFiles, items, onChange],
  );

  const onDragEnter = (e: React.DragEvent) => {
    if (!acceptDrop) return;
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => d + 1);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!acceptDrop) return;
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!acceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => Math.max(0, d - 1));
  };
  const onDrop = (e: React.DragEvent) => {
    if (!acceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(0);
    ingestFiles(e.dataTransfer.files);
  };

  const dropZoneClass = [
    'rounded-xl border-2 border-dashed px-3 py-3 transition-all',
    acceptDrop ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
    dragOver && acceptDrop
      ? 'border-indigo-300 bg-indigo-50/90 ring-2 ring-indigo-400'
      : 'border-slate-200 bg-slate-50/40 hover:border-slate-300',
  ].join(' ');

  const dropHint = !acceptDrop
    ? '已达上限，无法继续添加'
    : dragOver
      ? '松开即可上传'
      : '点击选择或拖拽到此处';

  if (multipleFiles) {
    return (
      <div className="space-y-2">
        {overlay}
        <div
          className={dropZoneClass}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => {
            if (!canAdd) return;
            fileInputRef.current?.click();
          }}
          role="button"
          tabIndex={canAdd ? 0 : -1}
          onKeyDown={(e) => {
            if (!canAdd) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label={dropHint}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            disabled={!canAdd}
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              ingestFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <p
            className={`text-center text-xs font-bold ${
              dragOver && acceptDrop ? 'text-indigo-700' : 'text-slate-500'
            }`}
          >
            {dropHint}
          </p>
          <p className="mt-1 text-center text-[11px] text-slate-400">
            最多 {DEV_STAGE_FILE_MAX_COUNT} 个，已选 {items.length} 个
            {!canAdd ? '（已满）' : items.length > 0 ? '，可继续添加' : ''}
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {items.map((item, idx) => {
              const url = item.url;
              const downloadName = resolveDevStageFileDownloadName(item, cf.label, idx);
              const info = toKnowledgeAttachmentInfo(item, cf.label, idx);
              const kind = resolveAttachmentKind(info.mimeType, info.fileName);
              const isImage = kind === 'image';
              const isPdf = kind === 'pdf';
              const canPreview =
                kind === 'image' || kind === 'pdf' || kind === 'excel' || kind === 'word' || kind === 'video';
              return (
                <div key={`${idx}-${url.slice(0, 32)}`} className="relative" title={downloadName}>
                  {isImage ? (
                    <button
                      type="button"
                      onClick={() => openAttachment(item, cf.label, idx)}
                      className="block h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                      title={downloadName}
                    >
                      <img src={url} alt={downloadName} className="h-full w-full object-cover" />
                    </button>
                  ) : isPdf ? (
                    <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1">
                      <PdfThumbPreview
                        src={url}
                        onClick={() => openAttachment(item, cf.label, idx)}
                        title={downloadName}
                        className="h-12 w-10"
                      />
                      <a
                        href={url}
                        download={downloadName}
                        className="max-w-full truncate text-[9px] font-bold text-indigo-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        title={downloadName}
                      >
                        下载
                      </a>
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1 text-center">
                      <span className="line-clamp-2 w-full text-[9px] font-bold leading-tight text-slate-600" title={downloadName}>
                        {item.name || downloadName}
                      </span>
                      <button
                        type="button"
                        onClick={() => openAttachment(item, cf.label, idx)}
                        className="text-[9px] font-bold text-indigo-600 hover:underline"
                      >
                        {canPreview ? '查看' : '下载'}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="删除"
                    onClick={() => onChange(serializeDevStageFileItems(items.filter((_, i) => i !== idx)))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const single = items[0];
  const dataStr = single?.url ?? '';
  const singleDownloadName = single
    ? resolveDevStageFileDownloadName(single, cf.label, 0)
    : `${cf.label}.${getFileExtFromDataUrl(dataStr) || 'bin'}`;
  const singleKind = single
    ? resolveAttachmentKind(
        toKnowledgeAttachmentInfo(single, cf.label, 0).mimeType,
        singleDownloadName,
      )
    : 'other';
  const onThumbClick = () => {
    if (!single || !dataStr.startsWith('data:')) return;
    openAttachment(single, cf.label, 0);
  };
  const clearSingle = () => onChange('');
  return (
    <div className="space-y-2">
      {overlay}
      <div
        className={dropZoneClass}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-label={dropHint}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) {
              onChange('');
              return;
            }
            ingestFiles([file]);
          }}
        />
        <p
          className={`text-center text-xs font-bold ${
            dragOver ? 'text-indigo-700' : 'text-slate-500'
          }`}
        >
          {dropHint}
        </p>
      </div>
      {single && dataStr.startsWith('data:') ? (
        <div className="space-y-1.5 text-left">
          <div className="flex flex-wrap items-center justify-start gap-2">
            <span
              className="max-w-[180px] truncate text-[11px] font-medium text-slate-600"
              title={single.name || singleDownloadName}
            >
              {single.name || singleDownloadName}
            </span>
            <button
              type="button"
              onClick={onThumbClick}
              className="shrink-0 text-xs font-bold text-indigo-600 hover:underline"
            >
              查看
            </button>
            <a
              href={dataStr}
              download={singleDownloadName}
              className="shrink-0 text-xs font-bold text-indigo-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              下载
            </a>
            <button
              type="button"
              aria-label="删除"
              onClick={clearSingle}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-rose-500 hover:bg-rose-50 hover:text-rose-700"
            >
              <X className="h-3 w-3" /> 删除
            </button>
          </div>
          {singleKind === 'image' ? (
            <button
              type="button"
              onClick={onThumbClick}
              className="block overflow-hidden rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="查看"
            >
              <img src={dataStr} alt={single.name || ''} className="max-h-32 max-w-[240px] object-contain" />
            </button>
          ) : singleKind === 'pdf' ? (
            <PdfThumbPreview src={dataStr} onClick={onThumbClick} title="查看 PDF" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const PlanFormCustomFieldInput: React.FC<PlanFormCustomFieldInputProps> = ({
  cf,
  value,
  onChange,
  controlClassName,
  onFilePreview,
  multipleFiles = false,
}) => {
  const t = effectivePlanFormFieldType(cf);
  const strVal = value === undefined || value === null ? '' : String(value);

  if (t === 'date') {
    return <PlanFormDateCustomInput cf={cf} value={value} onChange={onChange} controlClassName={controlClassName} />;
  }
  if (t === 'select') {
    return (
      <select className={controlClassName} value={(value as string) ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">请选择</option>
        {(cf.options ?? []).map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (t === 'knowledge') {
    return <PlanFormKnowledgeInput value={value} onChange={onChange} />;
  }
  if (t === 'file') {
    return (
      <PlanFormFileFieldInput
        cf={cf}
        value={value}
        onChange={onChange}
        onFilePreview={onFilePreview}
        multipleFiles={multipleFiles}
      />
    );
  }
  return (
    <input
      type="text"
      className={controlClassName}
      value={strVal}
      autoComplete="off"
      onChange={e => onChange(e.target.value)}
      placeholder={cf.label}
    />
  );
};

/** 「资料库」类型只读展示：显示标题，点击在弹窗内预览文档 */
const PlanFormKnowledgeReadonly: React.FC<{ value: unknown; className: string }> = ({ value, className }) => {
  const ref = parseKnowledgeFieldValue(value);
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!ref) return <span className="text-sm font-bold text-slate-400">—</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className={`inline-flex items-center gap-1 ${className} text-indigo-600 hover:underline`}
        title={ref.title || '查看资料库文件'}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[220px] truncate">{ref.title || '资料库文件'}</span>
      </button>
      <KnowledgeDocPreviewModal isOpen={previewOpen} docId={ref.id} onClose={() => setPreviewOpen(false)} />
    </>
  );
};

export interface PlanFormCustomFieldReadonlyProps {
  cf: PlanFormFieldConfig;
  value: unknown;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
  /** 与顶栏「时间 / 经办」同行：小字号、灰字（normal-case） */
  variant?: 'default' | 'inlineMeta';
}

const PlanFormFileFieldReadonly: React.FC<{
  cf: PlanFormFieldConfig;
  value: unknown;
  onFilePreview?: (url: string, type: 'image' | 'pdf') => void;
  inlineMeta?: boolean;
  metaTextCls: string;
}> = ({ cf, value, onFilePreview, inlineMeta = false, metaTextCls }) => {
  const { openAttachment, overlay } = useDevStageAttachmentPreview(onFilePreview);
  const str = value === undefined || value === null ? '' : String(value);
  const items = parseDevStageFileItems(str);
  if (items.length === 0) {
    return <span className={inlineMeta ? metaTextCls : 'text-sm font-bold text-slate-400'}>—</span>;
  }

  return (
    <>
      {overlay}
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => {
          const url = item.url;
          const downloadName = resolveDevStageFileDownloadName(item, cf.label, idx);
          const info = toKnowledgeAttachmentInfo(item, cf.label, idx);
          const kind = resolveAttachmentKind(info.mimeType, info.fileName);
          const isImage = kind === 'image';
          const isPdf = kind === 'pdf';
          const open = () => openAttachment(item, cf.label, idx);
          const kindLabel =
            kind === 'image' ? '图片' : kind === 'pdf' ? 'PDF' : kind === 'excel' ? 'Excel' : kind === 'word' ? 'Word' : '附件';

          if (inlineMeta) {
            return (
              <button
                key={`${idx}-${url.slice(0, 24)}`}
                type="button"
                onClick={open}
                className={`${metaTextCls} underline decoration-slate-300/90 underline-offset-2 hover:text-slate-600`}
                title={downloadName}
              >
                {item.name || kindLabel}
                {items.length > 1 && !item.name ? idx + 1 : ''}
              </button>
            );
          }
          if (isImage) {
            return (
              <div key={`${idx}-${url.slice(0, 24)}`} className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={open}
                  className="overflow-hidden rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title={downloadName}
                >
                  <img src={url} alt={downloadName} className="h-16 w-16 object-cover" />
                </button>
                <a
                  href={url}
                  download={downloadName}
                  className="max-w-[140px] truncate text-[10px] font-bold text-indigo-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  title={downloadName}
                >
                  {item.name || '下载'}
                </a>
              </div>
            );
          }
          return (
            <div key={`${idx}-${url.slice(0, 24)}`} className="flex max-w-[220px] items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
              {isPdf ? (
                <PdfThumbPreview src={url} onClick={open} title={downloadName} className="h-10 w-8 shrink-0" />
              ) : null}
              <button
                type="button"
                onClick={open}
                className="min-w-0 truncate text-xs font-bold text-indigo-700 hover:underline"
                title={downloadName}
              >
                {item.name || kindLabel}
              </button>
              <a
                href={url}
                download={downloadName}
                className="shrink-0 text-[10px] font-bold text-indigo-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                下载
              </a>
            </div>
          );
        })}
      </div>
    </>
  );
};

export const PlanFormCustomFieldReadonly: React.FC<PlanFormCustomFieldReadonlyProps> = ({
  cf,
  value,
  onFilePreview,
  variant = 'default',
}) => {
  const t = effectivePlanFormFieldType(cf);
  const str = value === undefined || value === null ? '' : String(value);
  const inlineMeta = variant === 'inlineMeta';
  const metaTextCls = 'text-[10px] font-bold text-slate-400 normal-case';
  const defaultValueCls = 'text-sm font-bold text-slate-800';
  const valueCls = inlineMeta ? metaTextCls : defaultValueCls;

  if (t === 'knowledge') {
    return <PlanFormKnowledgeReadonly value={value} className={valueCls} />;
  }

  if (str === '') {
    return <span className={inlineMeta ? metaTextCls : 'text-sm font-bold text-slate-400'}>—</span>;
  }

  if (t === 'date') {
    const display =
      str.includes('T') || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:/.test(str) ? formatLocalDateTimeZh(str) : str.slice(0, 10);
    return <span className={valueCls}>{display || str}</span>;
  }

  if (t === 'file') {
    return (
      <PlanFormFileFieldReadonly
        cf={cf}
        value={value}
        onFilePreview={onFilePreview}
        inlineMeta={inlineMeta}
        metaTextCls={metaTextCls}
      />
    );
  }

  return <span className={valueCls}>{str}</span>;
};
