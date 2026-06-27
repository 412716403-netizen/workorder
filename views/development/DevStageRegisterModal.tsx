import React, { useState, useEffect } from 'react';
import { X, Save, ClipboardCheck, Activity, ListChecks, Settings2 } from 'lucide-react';
import type { DevStageDto, DevStageTemplateDto, ReportFieldDefinition } from '../../types';
import { DEV_STAGE_STATUS_LABEL, DevStageStatus } from '../../types';
import { useAuthOptional } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';
import { effectiveCustomDocFieldType } from '../../utils/reportCustomDocField';
import {
  formStandardControlClass,
  outlineAccentToolbarButtonClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';
import DevCreateSectionCard from './DevCreateSectionCard';
import DevStageTemplateModal, { type DevTemplatePerms } from './DevStageTemplateModal';
import AddTodoButton from '../../components/AddTodoButton';

const STATUS_OPTIONS: DevStageStatus[] = [
  DevStageStatus.PENDING,
  DevStageStatus.IN_PROGRESS,
  DevStageStatus.COMPLETED,
  DevStageStatus.EXCEPTION,
];

// 与未选中态保持完全一致的形状（尺寸/圆角/边框/字号），仅切换颜色
const STATUS_BTN_BASE = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border';

const STATUS_ACTIVE_CLASS: Record<DevStageStatus, string> = {
  [DevStageStatus.PENDING]: 'bg-slate-600 border-slate-600 text-white',
  [DevStageStatus.IN_PROGRESS]: 'bg-blue-600 border-blue-600 text-white',
  [DevStageStatus.COMPLETED]: 'bg-emerald-600 border-emerald-600 text-white',
  [DevStageStatus.EXCEPTION]: 'bg-red-500 border-red-500 text-white',
};

const STATUS_INACTIVE_CLASS =
  'bg-white/80 text-slate-600 border-slate-200 hover:bg-white hover:text-slate-800 hover:border-slate-300';

interface DevStageRegisterModalProps {
  stage: DevStageDto;
  open: boolean;
  onClose: () => void;
  /** 所属款式 id（用于待办「前往单据」深链） */
  styleId?: string;
  /** 所属款式名称（用于待办快照上下文） */
  styleName?: string;
  onSave: (payload: {
    status?: string;
    fields?: Array<{ label: string; value: string; type?: string }>;
    user?: string;
  }) => Promise<void>;
  /** 节点库匹配的登记参数字段（完整 ReportFieldDefinition） */
  templateFields?: ReportFieldDefinition[];
  templates?: DevStageTemplateDto[];
  canManageTemplates?: boolean;
  templatePerms?: DevTemplatePerms;
  onCreateTemplate?: (name: string) => Promise<void>;
  onUpdateTemplate?: (id: string, data: Partial<DevStageTemplateDto>) => Promise<void>;
  onDeleteTemplate?: (id: string) => Promise<void>;
  onMoveTemplate?: (id: string, dir: 'up' | 'down') => Promise<void>;
}

function buildTemplateValues(
  stage: DevStageDto,
  templateFields: ReportFieldDefinition[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const tf of templateFields) {
    const existing = stage.fields.find((f) => f.label.trim() === tf.label.trim());
    values[tf.id] = existing?.value ?? '';
  }
  return values;
}

function isTemplateFieldValueEmpty(field: ReportFieldDefinition, raw: unknown): boolean {
  const t = effectiveCustomDocFieldType(field);
  if (t === 'file') {
    return typeof raw !== 'string' || !raw.trim();
  }
  return raw === undefined || raw === null || String(raw).trim() === '';
}

const DevStageRegisterModal: React.FC<DevStageRegisterModalProps> = ({
  stage,
  open,
  onClose,
  onSave,
  styleId,
  styleName,
  templateFields = [],
  templates = [],
  canManageTemplates = false,
  templatePerms,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onMoveTemplate,
}) => {
  const auth = useAuthOptional();
  const userName =
    (auth?.currentUser as Record<string, unknown> | undefined)?.displayName as string
    || (auth?.currentUser as Record<string, unknown> | undefined)?.username as string
    || '用户';

  const [status, setStatus] = useState(stage.status);
  const [templateValues, setTemplateValues] = useState<Record<string, unknown>>(() =>
    buildTemplateValues(stage, templateFields),
  );
  const [saving, setSaving] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const canOpenTemplateSettings =
    canManageTemplates
    && !!onCreateTemplate
    && !!onUpdateTemplate
    && !!onDeleteTemplate
    && !!onMoveTemplate;

  const templateSettingsBtn = canOpenTemplateSettings ? (
    <button
      type="button"
      onClick={() => setTemplateModalOpen(true)}
      className={outlineAccentToolbarButtonClass}
    >
      <Settings2 className="h-3.5 w-3.5" />
      开发节点库
    </button>
  ) : null;

  useEffect(() => {
    if (!open) return;
    setStatus(stage.status);
    setTemplateValues(buildTemplateValues(stage, templateFields));
  }, [open, stage.id, stage.status, stage.fields, templateFields]);

  if (!open) return null;

  async function handleSave() {
    for (const tf of templateFields) {
      if (!tf.required) continue;
      if (isTemplateFieldValueEmpty(tf, templateValues[tf.id])) {
        toast.error(`请填写必填项：${tf.label}`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: {
        status?: string;
        fields?: Array<{ label: string; value: string; type?: string }>;
        user?: string;
      } = {
        status,
        user: userName,
      };
      if (templateFields.length > 0) {
        payload.fields = templateFields.map((tf) => ({
          label: tf.label,
          value: String(templateValues[tf.id] ?? ''),
          type: effectiveCustomDocFieldType(tf),
        }));
      }
      await onSave(payload);
      toast.success('节点登记已保存');
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-[360] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        role="presentation"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-stage-register-title"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="dev-stage-register-title" className={`truncate ${sectionTitleClass}`}>
                节点登记 · {stage.name}
              </h2>
              <p className={`truncate ${pageSubtitleClass} mt-0 max-w-none`}>
                更新节点状态并录入登记自定义内容
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <AddTodoButton
              modalZIndexClass="z-[400]"
              seed={{
                sourceType: 'dev_stage',
                sourceId: stage.id,
                sourceDocNo: '开发管理',
                sourceTitle: `${styleName ? `${styleName} · ` : ''}节点登记 · ${stage.name}`,
                href: `/development?styleId=${encodeURIComponent(styleId ?? '')}&devStageId=${encodeURIComponent(stage.id)}`,
              }}
            />
            {templateSettingsBtn}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-slate-50/90 px-4 py-5 sm:px-6 space-y-4"
        >
          <DevCreateSectionCard title="节点状态" description="选择当前节点的进度状态" icon={Activity} iconTone="violet">
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`${STATUS_BTN_BASE} ${
                    status === s ? STATUS_ACTIVE_CLASS[s] : STATUS_INACTIVE_CLASS
                  }`}
                >
                  {DEV_STAGE_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </DevCreateSectionCard>

          {templateFields.length > 0 && (
            <DevCreateSectionCard
              title="登记自定义内容"
              description="按开发节点库配置的填报项录入"
              icon={ListChecks}
              iconTone="indigo"
            >
              <ReportCustomFieldsEditor
                fields={templateFields}
                values={templateValues}
                onChange={(fieldId, value) =>
                  setTemplateValues((prev) => ({ ...prev, [fieldId]: value }))
                }
                inputClassName={formStandardControlClass}
                variant="stack"
              />
            </DevCreateSectionCard>
          )}
        </form>

        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`${outlineToolbarButtonClass} disabled:opacity-50`}
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className={`inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 ${primaryToolbarButtonClass} disabled:opacity-50`}
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中…' : '保存登记'}
          </button>
        </div>
      </div>
    </div>

    {canOpenTemplateSettings && (
      <DevStageTemplateModal
        open={templateModalOpen}
        templates={templates}
        perms={templatePerms}
        overlayZIndex={380}
        onClose={() => setTemplateModalOpen(false)}
        onCreateTemplate={onCreateTemplate!}
        onUpdateTemplate={onUpdateTemplate!}
        onDeleteTemplate={onDeleteTemplate!}
        onMoveTemplate={onMoveTemplate!}
      />
    )}
    </>
  );
};

export default DevStageRegisterModal;
