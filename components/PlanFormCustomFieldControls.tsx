import React, { useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import type { PlanFormFieldConfig } from '../types';
import {
  DEV_STAGE_FILE_MAX_COUNT,
  parseDevStageFileUrls,
  serializeDevStageFileUrls,
} from '../utils/devStageFileValue';
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
import { PdfThumbPreview } from './PdfThumbPreview';

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx';

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
  /** 开发节点登记等多图场景：文件字段可追加多张（默认单文件） */
  multipleFiles?: boolean;
}

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
    const openPreview = (url: string, kind: 'image' | 'pdf') => {
      if (onFilePreview) onFilePreview(url, kind);
      else window.open(url, '_blank', 'noopener,noreferrer');
    };

    if (multipleFiles) {
      const urls = parseDevStageFileUrls(value);
      const canAdd = urls.length < DEV_STAGE_FILE_MAX_COUNT;
      return (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={!canAdd}
            className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700 disabled:opacity-50"
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (!files.length) return;
              const room = DEV_STAGE_FILE_MAX_COUNT - urls.length;
              const slice = files.slice(0, room);
              Promise.all(
                slice.map(
                  (file) =>
                    new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result ?? ''));
                      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
                      reader.readAsDataURL(file);
                    }),
                ),
              ).then((added) => {
                const next = [...urls, ...added.filter((u) => u.startsWith('data:'))];
                onChange(serializeDevStageFileUrls(next));
              });
            }}
          />
          <p className="text-[11px] text-slate-400">
            最多 {DEV_STAGE_FILE_MAX_COUNT} 张，已选 {urls.length} 张
            {!canAdd ? '（已满）' : '，可继续添加'}
          </p>
          {urls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {urls.map((url, idx) => (
                <div key={`${idx}-${url.slice(0, 32)}`} className="relative">
                  {url.startsWith('data:image/') ? (
                    <button
                      type="button"
                      onClick={() => openPreview(url, 'image')}
                      className="block h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                      title="查看大图"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                      附件
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="删除"
                    onClick={() => onChange(serializeDevStageFileUrls(urls.filter((_, i) => i !== idx)))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    const dataStr = typeof value === 'string' ? value : '';
    const onThumbClick = () => {
      if (!dataStr.startsWith('data:')) return;
      if (dataStr.startsWith('data:image/')) openPreview(dataStr, 'image');
      else if (dataStr.startsWith('data:application/pdf')) openPreview(dataStr, 'pdf');
      else window.open(dataStr, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="space-y-2">
        <input
          type="file"
          accept={FILE_ACCEPT}
          className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700"
          onChange={e => {
            const file = e.target.files?.[0];
            if (!file) {
              onChange('');
              return;
            }
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
          }}
        />
        {dataStr.startsWith('data:image/') && (
          <button
            type="button"
            onClick={onThumbClick}
            className="block max-w-full overflow-hidden rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="点击查看大图"
          >
            <img src={dataStr} alt="" className="max-h-32 max-w-full object-contain" />
          </button>
        )}
        {dataStr.startsWith('data:application/pdf') && (
          <div className="flex flex-wrap items-center gap-2">
            <PdfThumbPreview src={dataStr} onClick={onThumbClick} title="点击查看 PDF" />
            <a
              href={dataStr}
              download={`${cf.label}.pdf`}
              className="text-xs font-bold text-indigo-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              下载
            </a>
          </div>
        )}
        {dataStr.startsWith('data:') && !dataStr.startsWith('data:image/') && !dataStr.startsWith('data:application/pdf') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">已选择附件</span>
            <button type="button" onClick={onThumbClick} className="text-xs font-bold text-indigo-600 hover:underline">
              点击查看
            </button>
            <a
              href={dataStr}
              download={`${cf.label}.${getFileExtFromDataUrl(dataStr)}`}
              className="text-xs font-bold text-indigo-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              下载
            </a>
          </div>
        )}
      </div>
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

  if (inlineMeta && t === 'file' && str.startsWith('data:')) {
    const open = () => {
      if (str.startsWith('data:image/')) {
        if (onFilePreview) onFilePreview(str, 'image');
        else window.open(str, '_blank', 'noopener,noreferrer');
      } else if (str.startsWith('data:application/pdf')) {
        if (onFilePreview) onFilePreview(str, 'pdf');
        else window.open(str, '_blank', 'noopener,noreferrer');
      } else {
        if (onFilePreview) onFilePreview(str, 'pdf');
        else window.open(str, '_blank', 'noopener,noreferrer');
      }
    };
    const shortLabel = str.startsWith('data:image/') ? '图片' : str.startsWith('data:application/pdf') ? 'PDF' : '附件';
    return (
      <button
        type="button"
        onClick={open}
        className={`${metaTextCls} underline decoration-slate-300/90 underline-offset-2 hover:text-slate-600`}
      >
        {shortLabel}
      </button>
    );
  }

  if (t === 'file' && str.startsWith('data:image/')) {
    const open = () => {
      if (onFilePreview) onFilePreview(str, 'image');
      else window.open(str, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={open}
          className="overflow-hidden rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="点击查看"
        >
          <img src={str} alt="" className="h-20 max-w-[220px] object-contain" />
        </button>
        <a
          href={str}
          download={`${cf.label}.${getFileExtFromDataUrl(str)}`}
          className="text-xs font-bold text-indigo-600 hover:underline"
          onClick={e => e.stopPropagation()}
        >
          下载
        </a>
      </div>
    );
  }
  if (t === 'file' && str.startsWith('data:application/pdf')) {
    const open = () => {
      if (onFilePreview) onFilePreview(str, 'pdf');
      else window.open(str, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <PdfThumbPreview src={str} onClick={open} title="点击查看 PDF" className="h-20 w-16" />
        <a href={str} download={`${cf.label}.pdf`} className="text-xs font-bold text-indigo-600 hover:underline" onClick={e => e.stopPropagation()}>
          下载
        </a>
      </div>
    );
  }
  if (t === 'file' && str.startsWith('data:')) {
    const open = () => {
      if (onFilePreview) onFilePreview(str, 'pdf');
      else window.open(str, '_blank', 'noopener,noreferrer');
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={open} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
          点击查看
        </button>
        <a
          href={str}
          download={`${cf.label}.${getFileExtFromDataUrl(str)}`}
          className="text-xs font-bold text-indigo-600 hover:underline"
          onClick={e => e.stopPropagation()}
        >
          下载
        </a>
      </div>
    );
  }

  return <span className={valueCls}>{str}</span>;
};
