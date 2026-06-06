import React, { useState, useMemo, useCallback } from 'react';
import {
  X,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  Settings,
  Check,
  GitBranch,
  ListTree,
} from 'lucide-react';
import type { DevStageTemplateDto, ReportFieldDefinition } from '../../types';
import { toast } from 'sonner';
import { ReportCustomFieldsConfigTable } from '../../components/form-config/CustomFieldsEditorTable';
import {
  devTemplateFieldsToReportFields,
  reportFieldToDevTemplateField,
} from '../../utils/devStageTemplateFields';
import { normalizeReportFieldDefinition } from '../../utils/reportCustomDocField';
import DevCreateSectionCard from './DevCreateSectionCard';
import {
  formStandardControlClass,
  outlineToolbarButtonClass,
  pageSubtitleClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';

/** 开发流程模板的细粒度写权限，与后端 development:templates:{create|edit|delete} 对齐 */
export interface DevTemplatePerms {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const FULL_TEMPLATE_PERMS: DevTemplatePerms = { canCreate: true, canEdit: true, canDelete: true };

interface DevStageTemplateModalProps {
  open: boolean;
  templates: DevStageTemplateDto[];
  onClose: () => void;
  onCreateTemplate: (name: string) => Promise<void>;
  onUpdateTemplate: (id: string, data: Partial<DevStageTemplateDto>) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onMoveTemplate: (id: string, dir: 'up' | 'down') => Promise<void>;
  /** 细粒度写权限；不传时默认全开（兼容旧调用） */
  perms?: DevTemplatePerms;
  /** 嵌套在节点登记弹窗之上时使用更高层级 */
  overlayZIndex?: number;
}

function sortTemplates(list: DevStageTemplateDto[]): DevStageTemplateDto[] {
  return [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
}

function makeFieldId(prefix: string): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}${c.randomUUID()}`;
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildNewReportField(prefix: string): ReportFieldDefinition {
  return normalizeReportFieldDefinition({
    id: makeFieldId(prefix),
    label: '新扩展项',
    type: 'text',
    required: false,
  });
}

const DevStageTemplateModal: React.FC<DevStageTemplateModalProps> = ({
  open,
  templates,
  onClose,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onMoveTemplate,
  perms = FULL_TEMPLATE_PERMS,
  overlayZIndex = 360,
}) => {
  const { canCreate, canEdit, canDelete } = perms;
  const [newName, setNewName] = useState('');
  const sortedTemplates = useMemo(() => sortTemplates(templates), [templates]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => sortedTemplates.find((t) => t.id === selectedId),
    [sortedTemplates, selectedId],
  );

  const reportFields = useMemo(
    () => (selected ? devTemplateFieldsToReportFields(selected.fields) : []),
    [selected],
  );

  const fieldIdPrefix = 'dtplf-';

  React.useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setEditingTemplateId(null);
      setNewName('');
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !selectedId) return;
    if (!sortedTemplates.some((t) => t.id === selectedId)) {
      setSelectedId(null);
    }
  }, [open, sortedTemplates, selectedId]);

  const persistReportFields = useCallback(
    async (templateId: string, next: ReportFieldDefinition[]) => {
      await onUpdateTemplate(templateId, {
        fields: next.map((f, i) => reportFieldToDevTemplateField(f, i)),
      });
    },
    [onUpdateTemplate],
  );

  const handleFieldsChange = useCallback(
    async (next: ReportFieldDefinition[]) => {
      if (!selected || busy || !canEdit) return;
      setBusy(true);
      try {
        await persistReportFields(selected.id, next);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      } finally {
        setBusy(false);
      }
    },
    [selected, busy, canEdit, persistReportFields],
  );

  const handleAddReportField = useCallback(() => {
    if (!selected || busy || !canEdit) return;
    void handleFieldsChange([...reportFields, buildNewReportField(fieldIdPrefix)]);
  }, [selected, busy, canEdit, reportFields, fieldIdPrefix, handleFieldsChange]);

  if (!open) return null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || busy || !canCreate) return;
    setBusy(true);
    try {
      await onCreateTemplate(name);
      setNewName('');
      toast.success('节点已添加');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (id: string, dir: 'up' | 'down') => {
    if (!canEdit) return;
    setBusy(true);
    try {
      await onMoveTemplate(id, dir);
    } catch {
      // hook 已 toast
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTemplateName = async () => {
    if (!editingTemplateId || !editingTemplateName.trim() || busy || !canEdit) return;
    setBusy(true);
    try {
      await onUpdateTemplate(editingTemplateId, { name: editingTemplateName.trim() });
      setEditingTemplateId(null);
      toast.success('节点名称已更新');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!canDelete) return;
    if (!confirm(`确定要删除节点「${name}」吗？`)) return;
    setBusy(true);
    try {
      await onDeleteTemplate(id);
      if (selectedId === id) setSelectedId(null);
      toast.success('节点已删除');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-4"
      style={{ zIndex: overlayZIndex }}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        role="presentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-stage-template-title"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
              <GitBranch className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="dev-stage-template-title" className={`truncate ${sectionTitleClass}`}>
                开发节点管理
              </h2>
              <p className={`truncate ${pageSubtitleClass} mt-0 max-w-none`}>
                配置样品开发流程节点及登记时的自定义填报内容
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-slate-50/90 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
            <DevCreateSectionCard
              title="节点列表"
              description="选择节点后可在右侧配置登记自定义内容"
              icon={ListTree}
              iconTone="violet"
              className="lg:col-span-4"
            >
              <div className="mb-4 max-h-[360px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {sortedTemplates.map((template, index) => {
                  const isSelected = selectedId === template.id;
                  const paramCount = template.fields?.length ?? 0;
                  return (
                    <div
                      key={template.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(template.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(template.id);
                        }
                      }}
                      className={`group flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition-all ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50/80 shadow-sm'
                          : 'border-slate-200/80 bg-white hover:border-slate-300'
                      }`}
                    >
                      {canEdit && (
                        <div className="flex shrink-0 flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={index === 0 || busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleMove(template.id, 'up');
                            }}
                            className={`rounded p-0.5 transition-colors ${
                              index === 0
                                ? 'text-slate-200'
                                : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === sortedTemplates.length - 1 || busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleMove(template.id, 'down');
                            }}
                            className={`rounded p-0.5 transition-colors ${
                              index === sortedTemplates.length - 1
                                ? 'text-slate-200'
                                : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        {editingTemplateId === template.id ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={editingTemplateName}
                              onChange={(e) => setEditingTemplateName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveTemplateName();
                                if (e.key === 'Escape') setEditingTemplateId(null);
                              }}
                              className={`min-w-0 flex-1 ${formStandardControlClass} !h-8 !py-1`}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveTemplateName()}
                              className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-50"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTemplateId(null)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-800">{template.name}</span>
                            <span className="shrink-0 text-xs font-medium text-slate-400">
                              {paramCount} 项
                            </span>
                          </div>
                        )}
                      </div>

                      {editingTemplateId !== template.id && (canEdit || canDelete) && (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTemplateId(template.id);
                                setEditingTemplateName(template.name);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                              title="编辑节点名称"
                            >
                              <Settings className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteTemplate(template.id, template.name);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                              title="删除节点"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {sortedTemplates.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs font-medium text-slate-400">
                    暂无节点，请在下方添加
                  </div>
                )}
              </div>

              {canCreate && (
                <div className="flex gap-2">
                  <input
                    placeholder="输入新节点名称"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreate();
                    }}
                    className={`min-w-0 flex-1 ${formStandardControlClass} text-xs font-medium`}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={!newName.trim() || busy}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </DevCreateSectionCard>

            {selected ? (
              <DevCreateSectionCard
                title={`${selected.name} · 登记自定义内容`}
                description="与工序节点库「报工自定义单据内容」一致，支持文本、日期、下拉与文件上传"
                icon={GitBranch}
                iconTone="indigo"
                className="lg:col-span-8"
                headerExtra={
                  canEdit ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleAddReportField}
                      className={`inline-flex items-center gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 ${primaryToolbarButtonClass} !px-3 !py-1.5 !text-xs disabled:opacity-50`}
                    >
                      <Plus className="h-3.5 w-3.5" /> 增加填报项
                    </button>
                  ) : undefined
                }
              >
                <ReportCustomFieldsConfigTable
                  fields={reportFields}
                  onChange={(next) => void handleFieldsChange(next)}
                  showRequiredColumn
                  showShowInFormColumn={false}
                  showHeader={false}
                  allowedTypes={['text', 'date', 'select', 'file']}
                  idPrefix={fieldIdPrefix}
                  emptyHint="暂无自定义内容，点击右上角「增加填报项」添加"
                />
              </DevCreateSectionCard>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/80 px-6 text-center lg:col-span-8">
                <p className="text-xs font-medium text-slate-400">请先在左侧选择或创建节点</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className={outlineToolbarButtonClass}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`bg-indigo-600 text-white hover:bg-indigo-700 ${primaryToolbarButtonClass}`}
          >
            完成配置
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevStageTemplateModal;
