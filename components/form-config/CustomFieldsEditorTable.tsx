import React, { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CustomDocFieldType, PlanFormFieldConfig, PlanFormCustomFieldType, ReportFieldDefinition } from '../../types';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
import { effectiveCustomDocFieldType, normalizeReportFieldDefinition } from '../../utils/reportCustomDocField';
import { DateCustomFieldConfigCheckboxes } from '../DateCustomFieldConfigCheckboxes';
import { BlurPersistLabelInput, BlurPersistSelectOptionRow } from './BlurPersistFieldInputs';

export type CustomFieldEditorColumn =
  | 'label'
  | 'type'
  | 'options'
  | 'showInAdd'
  | 'showInDetail'
  | 'showInList'
  | 'remove';

export interface CustomFieldsEditorTableProps {
  fields: PlanFormFieldConfig[];
  onChange: (next: PlanFormFieldConfig[]) => void;
  /** 要显示的列；默认 7 列（label/type/options/showInList/showInAdd/showInDetail/remove）。 */
  columns?: CustomFieldEditorColumn[];
  title?: string;
  /** 子标题/说明，放在标题下方；可包含 JSX（如「去工序节点库」按钮等） */
  subtitle?: ReactNode;
  /** 紧邻标题右侧的按钮组区域；典型是「去工序节点库」等跳转入口 */
  headerExtra?: ReactNode;
  addButtonLabel?: string;
  emptyHint?: string;
  /** 新行 id 前缀，默认 'custom-'；id 统一使用 crypto.randomUUID()。 */
  idPrefix?: string;
  /** 覆盖表头 `title` 默认提示（如「列表中」含义） */
  columnHints?: Partial<Record<CustomFieldEditorColumn, string>>;
}

const DEFAULT_COLUMNS: CustomFieldEditorColumn[] = [
  'label',
  'type',
  'options',
  'showInList',
  'showInAdd',
  'showInDetail',
  'remove',
];

/** 表头悬停提示（可被 `columnHints` 覆盖） */
const DEFAULT_COLUMN_HINTS: Partial<Record<CustomFieldEditorColumn, string>> = {
  label: '在表单与列表中展示的名称。',
  type: '字段类型：文本、日期、下拉选项或上传文件/图片。',
  options: '下拉时的各选项文案；日期类型可配置含时分、自动带出等。',
  showInList: '勾选后，该字段可作为列表表格中的一列展示（是否出现列、列宽等还受列表页布局影响）。',
  showInAdd: '勾选后，新建单据表单中显示该字段。',
  showInDetail: '勾选后，在单据详情中显示该字段。',
};

function makeId(prefix: string): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}${c.randomUUID()}`;
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildDefaultField(prefix: string): PlanFormFieldConfig {
  return {
    id: makeId(prefix),
    label: '新自定义项',
    type: 'text',
    showInList: false,
    showInCreate: true,
    showInDetail: true,
  };
}

/**
 * 通用自定义字段编辑表。9 个 *FormConfigModal 中原本有 10+ 份几乎一致的「自定义字段表」JSX，
 * 现全部收拢到本组件。差异通过 `columns` 控制（例如入库详情只展示「新增时/详情中」两列）。
 */
export const CustomFieldsEditorTable: React.FC<CustomFieldsEditorTableProps> = ({
  fields,
  onChange,
  columns = DEFAULT_COLUMNS,
  title,
  subtitle,
  headerExtra,
  addButtonLabel = '增加',
  emptyHint,
  idPrefix = 'custom-',
  columnHints,
}) => {
  const hasCol = (c: CustomFieldEditorColumn) => columns.includes(c);
  const colTitle = (c: CustomFieldEditorColumn) => columnHints?.[c] ?? DEFAULT_COLUMN_HINTS[c];

  const patch = (id: string, mut: (cf: PlanFormFieldConfig) => PlanFormFieldConfig) => {
    onChange(fields.map(c => (c.id === id ? mut(c) : c)));
  };

  const handleTypeChange = (id: string, newType: PlanFormCustomFieldType) => {
    patch(id, c => {
      if (newType === 'select') {
        return {
          ...c,
          type: newType,
          options: c.options ?? [],
          dateWithTime: undefined,
          dateAutoFill: undefined,
        };
      }
      if (newType === 'date') {
        return { ...c, type: newType, options: undefined };
      }
      return {
        ...c,
        type: newType,
        options: undefined,
        dateWithTime: undefined,
        dateAutoFill: undefined,
      };
    });
  };

  return (
    <div>
      {(title || headerExtra) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {title && (
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-600">{title}</h4>
            )}
            {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={() => onChange([...fields, buildDefaultField(idPrefix)])}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> {addButtonLabel}
            </button>
          </div>
        </div>
      )}
      {fields.length === 0 ? (
        emptyHint ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-100 py-4 text-center text-sm italic text-slate-400">
            {emptyHint}
          </p>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-100 py-6" aria-hidden />
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {hasCol('label') && (
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500" title={colTitle('label')}>
                    标签
                  </th>
                )}
                {hasCol('type') && (
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500" title={colTitle('type')}>
                    类型
                  </th>
                )}
                {hasCol('options') && (
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500" title={colTitle('options')}>
                    选项（下拉/日期）
                  </th>
                )}
                {hasCol('showInList') && (
                  <th
                    className="cursor-help px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500"
                    title={colTitle('showInList')}
                  >
                    列表中
                  </th>
                )}
                {hasCol('showInAdd') && (
                  <th
                    className="cursor-help px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500"
                    title={colTitle('showInAdd')}
                  >
                    新增时
                  </th>
                )}
                {hasCol('showInDetail') && (
                  <th
                    className="cursor-help px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500"
                    title={colTitle('showInDetail')}
                  >
                    详情中
                  </th>
                )}
                {hasCol('remove') && <th className="w-16 px-4 py-3 text-[10px] font-black uppercase text-slate-500" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map(cf => (
                <tr key={cf.id} className="hover:bg-slate-50/50">
                  {hasCol('label') && (
                    <td className="px-4 py-2">
                      <BlurPersistLabelInput
                        inputKey={cf.id}
                        label={cf.label}
                        onPersist={t => patch(cf.id, c => ({ ...c, label: t }))}
                        placeholder="标签"
                        emptyHint="标签不能为空"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-bold outline-none"
                      />
                    </td>
                  )}
                  {hasCol('type') && (
                    <td className="px-4 py-2">
                      <select
                        value={effectivePlanFormFieldType(cf)}
                        onChange={e => handleTypeChange(cf.id, e.target.value as PlanFormCustomFieldType)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold outline-none"
                      >
                        <option value="text">文本</option>
                        <option value="date">日期</option>
                        <option value="select">下拉</option>
                        <option value="file">上传文件/图片</option>
                      </select>
                    </td>
                  )}
                  {hasCol('options') && (
                    <td className="align-top px-4 py-2">
                      {cf.type === 'select' ? (
                        <div className="min-w-[180px] space-y-1.5">
                          {(cf.options ?? []).map((opt, idx) => (
                            <BlurPersistSelectOptionRow
                              key={`${cf.id}-opt-${idx}`}
                              serverValue={opt}
                              onCommit={text => {
                                const v = text.trim();
                                if (!v) {
                                  patch(cf.id, c => ({
                                    ...c,
                                    options: (c.options ?? []).filter((_, i) => i !== idx),
                                  }));
                                } else if (v !== (opt || '').trim()) {
                                  patch(cf.id, c => ({
                                    ...c,
                                    options: (c.options ?? []).map((o, i) => (i === idx ? v : o)),
                                  }));
                                }
                              }}
                              onRemove={() =>
                                patch(cf.id, c => ({
                                  ...c,
                                  options: (c.options ?? []).filter((_, i) => i !== idx),
                                }))
                              }
                            />
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              patch(cf.id, c => ({ ...c, options: [...(c.options ?? []), '新选项'] }))
                            }
                            className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                          >
                            <Plus className="h-3.5 w-3.5" /> 添加选项
                          </button>
                        </div>
                      ) : cf.type === 'date' ? (
                        <DateCustomFieldConfigCheckboxes
                          dateWithTime={cf.dateWithTime}
                          dateAutoFill={cf.dateAutoFill}
                          onPatch={p => patch(cf.id, c => ({ ...c, ...p }))}
                        />
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  )}
                  {hasCol('showInList') && (
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={cf.showInList}
                        onChange={e => patch(cf.id, c => ({ ...c, showInList: e.target.checked }))}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                    </td>
                  )}
                  {hasCol('showInAdd') && (
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={cf.showInCreate}
                        onChange={e => patch(cf.id, c => ({ ...c, showInCreate: e.target.checked }))}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                    </td>
                  )}
                  {hasCol('showInDetail') && (
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={cf.showInDetail}
                        onChange={e => patch(cf.id, c => ({ ...c, showInDetail: e.target.checked }))}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                    </td>
                  )}
                  {hasCol('remove') && (
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => onChange(fields.filter(c => c.id !== cf.id))}
                        className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

function buildDefaultReportField(prefix: string): ReportFieldDefinition {
  return {
    id: makeId(prefix),
    label: '新扩展项',
    type: 'text',
    required: false,
    showInForm: true,
  };
}

const DEFAULT_REPORT_ALLOWED_TYPES: readonly CustomDocFieldType[] = ['text', 'date', 'select', 'file'];

function clampReportFieldToAllowedTypes(
  field: ReportFieldDefinition,
  allowed: readonly CustomDocFieldType[] | undefined,
): ReportFieldDefinition {
  const n = normalizeReportFieldDefinition(field);
  if (!allowed?.length) return n;
  const t = effectiveCustomDocFieldType(n);
  if (allowed.includes(t)) return n;
  const fallback = allowed[0];
  if (fallback === 'select') {
    return normalizeReportFieldDefinition({
      ...n,
      type: 'select',
      options: n.options?.length ? n.options : ['选项1'],
      dateWithTime: undefined,
      dateAutoFill: undefined,
    });
  }
  if (fallback === 'date') {
    return normalizeReportFieldDefinition({ ...n, type: 'date', options: undefined });
  }
  return normalizeReportFieldDefinition({
    ...n,
    type: fallback,
    options: undefined,
    dateWithTime: undefined,
    dateAutoFill: undefined,
  });
}

export interface ReportCustomFieldsConfigTableProps {
  fields: ReportFieldDefinition[];
  onChange: (next: ReportFieldDefinition[]) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  headerExtra?: ReactNode;
  addButtonLabel?: string;
  emptyHint?: string;
  idPrefix?: string;
  /** 显示「必填」列（合作单位/产品分类等） */
  showRequiredColumn?: boolean;
  /** 限制可选类型（如报工页只读展示仅文本/附件） */
  allowedTypes?: readonly CustomDocFieldType[];
  /** 为 false 时不显示「表单中」列（如工序展示模板） */
  showShowInFormColumn?: boolean;
}

/** 产品分类 / 合作单位分类 / 财务分类 / 工序报工模板等 `ReportFieldDefinition[]` 配置表 */
export const ReportCustomFieldsConfigTable: React.FC<ReportCustomFieldsConfigTableProps> = ({
  fields,
  onChange,
  title,
  subtitle,
  headerExtra,
  addButtonLabel = '增加',
  emptyHint,
  idPrefix = 'rcf-',
  showRequiredColumn = false,
  allowedTypes = DEFAULT_REPORT_ALLOWED_TYPES,
  showShowInFormColumn = true,
}) => {
  const typeOptions = (allowedTypes?.length ? allowedTypes : DEFAULT_REPORT_ALLOWED_TYPES) as CustomDocFieldType[];

  const patch = (id: string, mut: (cf: ReportFieldDefinition) => ReportFieldDefinition) => {
    onChange(
      fields.map(c =>
        c.id === id ? clampReportFieldToAllowedTypes(normalizeReportFieldDefinition(mut(c)), allowedTypes) : c,
      ),
    );
  };

  const handleTypeChange = (id: string, newType: CustomDocFieldType) => {
    patch(id, c => {
      if (newType === 'select') {
        return {
          ...c,
          type: newType,
          options: c.options ?? [],
          dateWithTime: undefined,
          dateAutoFill: undefined,
        };
      }
      if (newType === 'date') {
        return { ...c, type: newType, options: undefined };
      }
      return {
        ...c,
        type: newType,
        options: undefined,
        dateWithTime: undefined,
        dateAutoFill: undefined,
      };
    });
  };

  return (
    <div>
      {(title || headerExtra) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {title && <div className="text-sm font-black uppercase tracking-widest text-slate-600">{title}</div>}
            {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={() =>
                onChange([
                  ...fields,
                  clampReportFieldToAllowedTypes(
                    normalizeReportFieldDefinition(buildDefaultReportField(idPrefix)),
                    allowedTypes,
                  ),
                ])
              }
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> {addButtonLabel}
            </button>
          </div>
        </div>
      )}
      {fields.length === 0 ? (
        emptyHint ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-100 py-4 text-center text-sm italic text-slate-400">
            {emptyHint}
          </p>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-100 py-6" aria-hidden />
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">标签</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">类型</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">选项（下拉/日期）</th>
                {showRequiredColumn && (
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500">必填</th>
                )}
                {showShowInFormColumn && (
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500">表单中</th>
                )}
                <th className="w-16 px-4 py-3 text-[10px] font-black uppercase text-slate-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map(cf => (
                <tr key={cf.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2">
                    <BlurPersistLabelInput
                      inputKey={`${idPrefix}${cf.id}`}
                      label={cf.label}
                      onPersist={t => patch(cf.id, c => ({ ...c, label: t }))}
                      placeholder="标签"
                      emptyHint="标签不能为空"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-bold outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={
                        typeOptions.includes(effectiveCustomDocFieldType(cf))
                          ? effectiveCustomDocFieldType(cf)
                          : typeOptions[0]
                      }
                      onChange={e => handleTypeChange(cf.id, e.target.value as CustomDocFieldType)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold outline-none"
                    >
                      {typeOptions.includes('text') && <option value="text">文本</option>}
                      {typeOptions.includes('date') && <option value="date">日期</option>}
                      {typeOptions.includes('select') && <option value="select">下拉</option>}
                      {typeOptions.includes('file') && <option value="file">上传文件/图片</option>}
                    </select>
                  </td>
                  <td className="align-top px-4 py-2">
                    {effectiveCustomDocFieldType(cf) === 'select' ? (
                      <div className="min-w-[180px] space-y-1.5">
                        {(cf.options ?? []).map((opt, idx) => (
                          <BlurPersistSelectOptionRow
                            key={`${cf.id}-opt-${idx}`}
                            serverValue={opt}
                            onCommit={text => {
                              const v = text.trim();
                              if (!v) {
                                patch(cf.id, c => ({
                                  ...c,
                                  options: (c.options ?? []).filter((_, i) => i !== idx),
                                }));
                              } else if (v !== (opt || '').trim()) {
                                patch(cf.id, c => ({
                                  ...c,
                                  options: (c.options ?? []).map((o, i) => (i === idx ? v : o)),
                                }));
                              }
                            }}
                            onRemove={() =>
                              patch(cf.id, c => ({
                                ...c,
                                options: (c.options ?? []).filter((_, i) => i !== idx),
                              }))
                            }
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            patch(cf.id, c => ({ ...c, options: [...(c.options ?? []), '新选项'] }))
                          }
                          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          <Plus className="h-3.5 w-3.5" /> 添加选项
                        </button>
                      </div>
                    ) : effectiveCustomDocFieldType(cf) === 'date' ? (
                      <DateCustomFieldConfigCheckboxes
                        dateWithTime={cf.dateWithTime}
                        dateAutoFill={cf.dateAutoFill}
                        onPatch={p => patch(cf.id, c => ({ ...c, ...p }))}
                      />
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  {showRequiredColumn && (
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!cf.required}
                        onChange={e => patch(cf.id, c => ({ ...c, required: e.target.checked }))}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                    </td>
                  )}
                  {showShowInFormColumn && (
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={cf.showInForm !== false}
                        onChange={e => patch(cf.id, c => ({ ...c, showInForm: e.target.checked }))}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => onChange(fields.filter(c => c.id !== cf.id))}
                      className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomFieldsEditorTable;
