import React, { useMemo, useState, useEffect } from 'react';
import {
  Edit3,
  CheckCircle2,
  History,
  Plus,
  Layers,
  Image as ImageIcon,
  Trash2,
  Tag,
  Ruler,
  RefreshCw,
  FileArchive,
  PackageCheck,
  X,
  Download,
  FileText,
  FileArchive as FileArchiveIcon,
} from 'lucide-react';
import type { AppDictionaries, DevAttachmentDto, DevSampleDto, DevStageDto, DevStageTemplateDto, DevStyleDto, Partner, Product } from '../../types';
import { DevStyleStatus, DEV_STAGE_STATUS_LABEL, DevStageStatus } from '../../types';
import { toast } from 'sonner';
import {
  canDeleteDevStyle,
  formatDevStyleCreatedAt,
  getDevSampleDeleteBlockReason,
  resolveColorNames,
  resolveSizeNames,
  resolveDevStyleCustomerName,
} from '../../utils/devStyleDisplay';
import { resolveDevStyleWithPublishedProduct } from '../../utils/productInfoDevStyleBridge';
import { devTemplateFieldsToReportFields } from '../../utils/devStageTemplateFields';
import DevStageRegisterModal from './DevStageRegisterModal';
import { type DevTemplatePerms } from './DevStageTemplateModal';
import DevStageRegisteredContent from './DevStageRegisteredContent';
import DevAddSampleModal from './DevAddSampleModal';
import DevStyleLogModal from './DevStyleLogModal';
import {
  formStandardLabelClass,
  outlineToolbarButtonClass,
  pageTitleClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
  subModuleTabButtonClass,
} from '../../styles/uiDensity';

const StageAttachmentItem: React.FC<{ file: DevAttachmentDto }> = ({ file }) => {
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName) || file.fileUrl.startsWith('data:image');
  const isZip = /\.(zip|rar|7z)$/i.test(file.fileName);
  return (
    <div className="group/file relative flex items-center gap-3 px-4 py-2.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl pr-12">
      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden shrink-0">
        {isImage ? (
          <img src={file.fileUrl} alt="" className="w-full h-full object-cover" />
        ) : isZip ? (
          <FileArchiveIcon className="w-5 h-5 text-amber-500" />
        ) : (
          <FileText className="w-5 h-5 text-indigo-500" />
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-indigo-600 truncate max-w-[140px]">{file.fileName}</span>
        <span className="text-[10px] font-medium text-indigo-400">{isImage ? '图片' : isZip ? '压缩包' : '文档'}</span>
      </div>
      <a
        href={file.fileUrl}
        download={file.fileName}
        className="absolute right-3 p-2 bg-white text-indigo-500 rounded-lg shadow-sm opacity-0 group-hover/file:opacity-100"
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

interface DevStyleMainContentProps {
  style: DevStyleDto;
  products: Product[];
  partners: Partner[];
  dictionaries: AppDictionaries;
  templates: DevStageTemplateDto[];
  readOnly?: boolean;
  canEdit?: boolean;
  canDeleteStyle?: boolean;
  canManageTemplates?: boolean;
  templatePerms?: DevTemplatePerms;
  onCreateTemplate?: (name: string) => Promise<void>;
  onUpdateTemplate?: (id: string, data: Partial<DevStageTemplateDto>) => Promise<void>;
  onDeleteTemplate?: (id: string) => Promise<void>;
  onMoveTemplate?: (id: string, dir: 'up' | 'down') => Promise<void>;
  onEditProduct: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onToggleArchive: () => void;
  onAddSample: (data: { name: string; stageNames: string[] }) => Promise<void>;
  onDeleteSample: (sampleId: string) => Promise<void>;
  onUpdateStage: (
    stageId: string,
    data: Parameters<typeof import('../../services/api/development').devStyles.updateStage>[1],
  ) => Promise<void>;
}

const DevStyleMainContent: React.FC<DevStyleMainContentProps> = ({
  style,
  products,
  partners,
  dictionaries,
  templates,
  readOnly,
  canEdit,
  canDeleteStyle,
  canManageTemplates,
  templatePerms,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onMoveTemplate,
  onEditProduct,
  onPublish,
  onDelete,
  onToggleArchive,
  onAddSample,
  onDeleteSample,
  onUpdateStage,
}) => {
  const [activeSampleId, setActiveSampleId] = useState(style.samples[0]?.id ?? '');
  const [registerStage, setRegisterStage] = useState<DevStageDto | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [addSampleOpen, setAddSampleOpen] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  useEffect(() => {
    if (style.samples.length && !style.samples.some((s) => s.id === activeSampleId)) {
      setActiveSampleId(style.samples[0].id);
    }
  }, [style.samples, activeSampleId]);

  const activeSample: DevSampleDto | undefined = style.samples.find((s) => s.id === activeSampleId);
  const displayStyle = useMemo(
    () => resolveDevStyleWithPublishedProduct(style, products),
    [style, products],
  );
  const colorNames = resolveColorNames(displayStyle, dictionaries);
  const sizeNames = resolveSizeNames(displayStyle, dictionaries);
  const customerLabel = resolveDevStyleCustomerName(displayStyle, partners);
  const canDelete = !!canDeleteStyle && canDeleteDevStyle(style);

  const templateFieldsForStage = useMemo(() => {
    if (!registerStage) return [];
    const tpl = templates.find((t) => t.name === registerStage.name);
    return tpl ? devTemplateFieldsToReportFields(tpl.fields) : [];
  }, [registerStage, templates]);

  const stageStatusLabel = (status: string) =>
    DEV_STAGE_STATUS_LABEL[status as DevStageStatus] ?? status;

  const handleDeleteSampleClick = (sampleId: string) => {
    const sample = style.samples.find((s) => s.id === sampleId);
    if (!sample) return;
    const blockReason = getDevSampleDeleteBlockReason(sample, { sampleCount: style.samples.length });
    if (blockReason) {
      toast.warning(blockReason);
      return;
    }
    void onDeleteSample(sampleId);
  };

  return (
    <main className="flex-1 flex flex-col bg-white overflow-y-auto min-w-0">
      {showFullImage && style.imageUrl && (
        <div
          className="fixed inset-0 z-[500] bg-slate-900/90 flex items-center justify-center p-10"
          onClick={() => setShowFullImage(false)}
          role="presentation"
        >
          <button type="button" className="absolute top-10 right-10 p-4 text-white" onClick={() => setShowFullImage(false)}>
            <X className="w-8 h-8" />
          </button>
          <img src={style.imageUrl} alt="" className="max-w-full max-h-full object-contain rounded-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <div className="p-8 lg:p-10 flex flex-col lg:flex-row gap-8 border-b border-slate-100">
        <div
          className={`w-full lg:w-56 h-56 bg-slate-50 rounded-[32px] overflow-hidden relative shadow-lg shrink-0 flex items-center justify-center ${
            style.imageUrl ? 'cursor-zoom-in' : ''
          }`}
          onClick={() => style.imageUrl && setShowFullImage(true)}
          onKeyDown={() => {}}
          role={style.imageUrl ? 'button' : undefined}
          tabIndex={style.imageUrl ? 0 : undefined}
        >
          {style.imageUrl ? (
            <img src={style.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-16 h-16 text-slate-300 opacity-30" />
          )}
          {canEdit && !readOnly && (
            <div className="absolute top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={onEditProduct} className="p-2 bg-white/90 rounded-lg shadow-sm text-slate-600 hover:text-indigo-600" title="编辑款式">
                <Edit3 className="w-4 h-4" />
              </button>
              {canDelete && (
                <button type="button" onClick={onDelete} className="p-2 bg-white/90 rounded-lg shadow-sm text-red-400 hover:text-red-600" title="删除">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className={`truncate ${pageTitleClass}`}>{style.name}</h2>
            {style.status === DevStyleStatus.PUBLISHED ? (
              <span className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> 商品信息已发布
              </span>
            ) : canEdit && !readOnly && style.status === DevStyleStatus.ARCHIVED ? (
              <button
                type="button"
                onClick={onPublish}
                className={`${primaryToolbarButtonClass} bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2`}
              >
                <PackageCheck className="w-3.5 h-3.5" /> 生成大货商品信息
              </button>
            ) : null}
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm font-medium text-indigo-500">
            <span className="text-xs font-medium text-slate-500">{style.code}</span>
            {customerLabel && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-200" />
                <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-100">
                  {customerLabel}
                </span>
              </>
            )}
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-200" />
            <span className="text-xs text-slate-400 font-medium">创建于 {formatDevStyleCreatedAt(style.createdAt)}</span>
            {canEdit && !readOnly && style.status !== DevStyleStatus.PUBLISHED && (
              <button
                type="button"
                onClick={onToggleArchive}
                className={`flex items-center gap-2 ${outlineToolbarButtonClass} ${
                  style.status === DevStyleStatus.ARCHIVED
                    ? 'border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                    : 'text-slate-500'
                }`}
              >
                {style.status === DevStyleStatus.ARCHIVED ? (
                  <><RefreshCw className="w-3.5 h-3.5" /> 还原至开发中</>
                ) : (
                  <><FileArchive className="w-3.5 h-3.5" /> 归档此货号</>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className={`mb-2 flex items-center gap-2 ${formStandardLabelClass}`}>
                <Tag className="w-3 h-3" /> 颜色
              </div>
              <div className="flex flex-wrap gap-1">
                {colorNames.length ? colorNames.map((c) => (
                  <span key={c} className="rounded-md border bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{c}</span>
                )) : <span className="text-xs text-slate-300 italic">未设置</span>}
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className={`mb-2 flex items-center gap-2 ${formStandardLabelClass}`}>
                <Ruler className="w-3 h-3" /> 尺码
              </div>
              <div className="flex flex-wrap gap-1">
                {sizeNames.length ? sizeNames.map((s) => (
                  <span key={s} className="rounded-md border bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{s}</span>
                )) : <span className="text-xs text-slate-300 italic">未设置</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 lg:p-10 bg-slate-50/30 flex-1">
        <div className="flex items-center justify-between mb-6">
          <h3 className={sectionTitleClass}>样品开发记录</h3>
          {activeSample && (
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-indigo-600"
            >
              <History className="w-3.5 h-3.5" /> 版本日志
            </button>
          )}
        </div>

        <div className="mb-8 flex gap-3 overflow-x-auto px-0.5 pb-2 pt-3">
          {style.samples.map((sample) => (
            <div key={sample.id} className="group/sample relative shrink-0 pr-1 pt-1">
              <button
                type="button"
                onClick={() => setActiveSampleId(sample.id)}
                className={`flex items-center gap-3 whitespace-nowrap shadow-sm ${subModuleTabButtonClass(activeSampleId === sample.id)} ${
                  activeSampleId === sample.id
                    ? 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700'
                    : 'border border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
                }`}
              >
                <Layers className="h-4 w-4 shrink-0" />
                {sample.name}
              </button>
              {canEdit && !readOnly && style.samples.length > 1 && (
                <button
                  type="button"
                  aria-label={`删除${sample.name}`}
                  onClick={() => handleDeleteSampleClick(sample.id)}
                  className="absolute right-0 top-0 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 text-white opacity-0 shadow-sm transition-opacity group-hover/sample:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          {canEdit && !readOnly && (
            <button
              type="button"
              onClick={() => setAddSampleOpen(true)}
              className="w-10 h-10 shrink-0 bg-white border border-slate-200 text-slate-400 rounded-full flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {activeSample && (
          <div className="space-y-6 max-w-4xl relative">
            <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-100" aria-hidden />
            {activeSample.stages.map((stage, idx) => (
              <div key={stage.id} className="relative pl-16">
                <div
                  className={`absolute left-0 top-6 w-12 h-12 rounded-full border-4 border-white shadow-md flex items-center justify-center z-10 ${
                    stage.status === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : stage.status === 'in_progress'
                        ? 'bg-blue-600 text-white'
                        : stage.status === 'exception'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-300 text-white'
                  }`}
                >
                  {stage.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> : idx + 1}
                </div>
                <div className="bg-white rounded-3xl border border-slate-100 p-6 lg:p-8 shadow-sm hover:shadow-md transition-shadow group">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                      <h4 className="text-base font-semibold text-slate-900 tracking-tight">{stage.name}</h4>
                      <span className="text-xs font-medium text-slate-300 italic">
                        更新于 {new Date(stage.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        stage.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-600'
                          : stage.status === 'in_progress'
                            ? 'bg-blue-50 text-blue-600'
                            : stage.status === 'exception'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-slate-50 text-slate-400'
                      }`}
                    >
                      {stageStatusLabel(stage.status)}
                    </span>
                  </div>

                  <DevStageRegisteredContent stage={stage} templates={templates} />

                  {stage.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-4">
                      {stage.attachments.map((file) => (
                        <StageAttachmentItem key={file.id} file={file} />
                      ))}
                    </div>
                  )}

                  {canEdit && !readOnly && (
                    <button
                      type="button"
                      onClick={() => setRegisterStage(stage)}
                      className={`w-full justify-center ${outlineToolbarButtonClass} border-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      录入节点开发资料
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DevAddSampleModal
        open={addSampleOpen}
        existingSamples={style.samples}
        templates={templates}
        onClose={() => setAddSampleOpen(false)}
        onConfirm={(data) => void onAddSample(data)}
      />

      {registerStage && (
        <DevStageRegisterModal
          stage={registerStage}
          open
          templateFields={templateFieldsForStage}
          templates={templates}
          canManageTemplates={canManageTemplates}
          templatePerms={templatePerms}
          onCreateTemplate={onCreateTemplate}
          onUpdateTemplate={onUpdateTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onMoveTemplate={onMoveTemplate}
          onClose={() => setRegisterStage(null)}
          onSave={async (payload) => {
            await onUpdateStage(registerStage.id, payload);
            setRegisterStage(null);
          }}
        />
      )}

      <DevStyleLogModal
        open={logOpen}
        sampleName={activeSample?.name ?? ''}
        logs={activeSample?.logs ?? []}
        onClose={() => setLogOpen(false)}
      />
    </main>
  );
};

export default DevStyleMainContent;
