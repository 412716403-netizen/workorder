import React, { useState, useEffect, useRef } from 'react';
import { ModalPortal } from '../../components/ModalPortal';
import { X, Save, ClipboardCheck, Activity, ListChecks, Settings2 } from 'lucide-react';
import type { DevStageDto, DevStageTemplateDto, ReportFieldDefinition } from '../../types';
import { DEV_STAGE_STATUS_LABEL, DevStageStatus } from '../../types';
import { useAuthOptional } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';
import { effectiveCustomDocFieldType } from '../../utils/reportCustomDocField';
import {
  isDevStageFileValueFilled,
  serializeDevStageFileItems,
  parseDevStageFileItems,
  hasDevStageFileDeferred,
} from '../../utils/devStageFileValue';
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
import { devStyles } from '../../services/api';

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
    return !isDevStageFileValueFilled(raw);
  }
  return raw === undefined || raw === null || String(raw).trim() === '';
}

function serializeTemplateFieldValue(
  field: ReportFieldDefinition,
  raw: unknown,
): { type: string; value: string } {
  const type = effectiveCustomDocFieldType(field);
  const value =
    type === 'file'
      ? serializeDevStageFileItems(parseDevStageFileItems(raw))
      : String(raw ?? '');
  return { type, value };
}

/** 模板字段相对 stage.fields 是否无变更（避免只改状态仍重传大 data URL） */
export function templateFieldsUnchanged(
  stage: DevStageDto,
  templateFields: ReportFieldDefinition[],
  templateValues: Record<string, unknown>,
  baselineValues: Record<string, unknown>,
): boolean {
  if (templateFields.length === 0) return true;
  for (const tf of templateFields) {
    const { type, value } = serializeTemplateFieldValue(tf, templateValues[tf.id]);
    const existing = stage.fields.find((f) => f.label.trim() === tf.label.trim());
    const prevRaw = baselineValues[tf.id] ?? '';
    const prevNorm =
      type === 'file'
        ? serializeDevStageFileItems(parseDevStageFileItems(prevRaw))
        : String(prevRaw);
    if (prevNorm !== value) return false;
    if ((existing?.type ?? 'text') !== type && (value || prevNorm)) return false;
  }
  return true;
}

const DevStageRegisterModal: React.FC<DevStageRegisterModalProps> = ({
  stage,
  open,
  onClose,
  onSave,
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
  // 详情中的文件初始为 deferred stub，加载完整值后同步更新基线；删除时才能与原值正确判定为有变更。
  const baselineTemplateValuesRef = useRef<Record<string, unknown>>(
    buildTemplateValues(stage, templateFields),
  );
  const [saving, setSaving] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [filesHydrating, setFilesHydrating] = useState(false);

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
    const initial = buildTemplateValues(stage, templateFields);
    baselineTemplateValuesRef.current = initial;
    setTemplateValues(initial);

    const deferredPairs = templateFields
      .map((tf) => {
        if (effectiveCustomDocFieldType(tf) !== 'file') return null;
        if (!hasDevStageFileDeferred(initial[tf.id])) return null;
        const existing = stage.fields.find((f) => f.label.trim() === tf.label.trim());
        if (!existing?.id) return null;
        return { templateFieldId: tf.id, stageFieldId: existing.id };
      })
      .filter((x): x is { templateFieldId: string; stageFieldId: string } => !!x);

    if (deferredPairs.length === 0) {
      setFilesHydrating(false);
      return;
    }

    let cancelled = false;
    setFilesHydrating(true);
    void (async () => {
      try {
        const results = await Promise.all(
          deferredPairs.map(async (p) => {
            const res = await devStyles.getStageField(p.stageFieldId);
            return { templateFieldId: p.templateFieldId, value: res.value };
          }),
        );
        if (cancelled) return;
        const hydratedBaseline = { ...baselineTemplateValuesRef.current };
        for (const r of results) hydratedBaseline[r.templateFieldId] = r.value;
        baselineTemplateValuesRef.current = hydratedBaseline;
        setTemplateValues((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.templateFieldId] = r.value;
          return next;
        });
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : '文件加载失败，请关闭后重试');
        }
      } finally {
        if (!cancelled) setFilesHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, stage.id, stage.status, stage.fields, templateFields]);

  if (!open) return null;

  async function handleSave() {
    if (filesHydrating) {
      toast.message('文件加载中，请稍候再保存');
      return;
    }
    for (const tf of templateFields) {
      if (!tf.required) continue;
      if (isTemplateFieldValueEmpty(tf, templateValues[tf.id])) {
        toast.error(`请填写必填项：${tf.label}`);
        return;
      }
    }
    // 若仍存在 deferred stub（加载失败），禁止保存以免清空文件体
    for (const tf of templateFields) {
      if (effectiveCustomDocFieldType(tf) !== 'file') continue;
      if (hasDevStageFileDeferred(templateValues[tf.id])) {
        toast.error(`文件尚未加载完成：${tf.label}`);
        return;
      }
    }
    const statusChanged = status !== stage.status;
    const fieldsChanged = !templateFieldsUnchanged(
      stage,
      templateFields,
      templateValues,
      baselineTemplateValuesRef.current,
    );
    if (!statusChanged && !fieldsChanged) {
      toast.success('节点登记已保存');
      onClose();
      return;
    }
    setSaving(true);
    try {
      const payload: {
        status?: string;
        fields?: Array<{ label: string; value: string; type?: string }>;
        user?: string;
      } = {
        user: userName,
      };
      if (statusChanged) payload.status = status;
      if (fieldsChanged && templateFields.length > 0) {
        payload.fields = templateFields.map((tf) => {
          const { type, value } = serializeTemplateFieldValue(tf, templateValues[tf.id]);
          return { label: tf.label, value, type };
        });
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
    <ModalPortal>
    <div className="fixed inset-0 z-[360] flex items-center justify-center p-4 sm:p-6">
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
        className="relative z-10 flex max-h-[min(92vh,960px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
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
              {filesHydrating && (
                <p className="mb-3 text-xs font-medium text-indigo-500">文件加载中…</p>
              )}
              <ReportCustomFieldsEditor
                fields={templateFields}
                values={templateValues}
                onChange={(fieldId, value) =>
                  setTemplateValues((prev) => ({ ...prev, [fieldId]: value }))
                }
                inputClassName={formStandardControlClass}
                variant="stack"
                allowMultipleFiles
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
            disabled={saving || filesHydrating}
            onClick={() => void handleSave()}
            className={`inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 ${primaryToolbarButtonClass} disabled:opacity-50`}
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中…' : filesHydrating ? '文件加载中…' : '保存登记'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>

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
