import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalPortal } from '../ModalPortal';
import { X, Sliders, Printer } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanFormFieldConfig } from '../../types';
import {
  PlanPrintTemplateManageDialog,
} from '../plan-print/PlanPrintTemplateManageDialog';
import type { PlanPrintTemplateManageScope } from '../../types';
import { useRefreshPrintTemplatesOnWindowFocus } from '../../hooks/useRefreshPrintTemplatesOnWindowFocus';
import { CustomFieldsEditorTable } from './CustomFieldsEditorTable';
import { PrintTemplateWhitelistCard } from './PrintTemplateWhitelistCard';
import { getByPath, setByPath } from './formConfigPath';
import {
  type FormConfigPrintContextDependencies,
  type FormConfigSchema,
  type FormConfigSection,
  type FormConfigSlotContext,
  type FormConfigPrintWhitelistSection,
  mergeAllowedTemplateIdInDraft,
} from './formConfigSchema';

export type FormConfigSaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export interface BusinessFormConfigModalProps<TSettings extends object>
  extends FormConfigPrintContextDependencies {
  open: boolean;
  onClose: () => void;
  /** 若 schema.tabs 有多个，指定首次打开进入的 tab id；默认第一个 tab */
  defaultTabId?: string;
  schema: FormConfigSchema<TSettings>;
  initialValue: TSettings;
  onSave: (next: TSettings) => void | Promise<void>;
  /**
   * schema.sideEffectSaves 中声明的「额外 key」要写入时调用。
   * 典型：MaterialForm 需要把 draft 里的 __panel 切出来写入 materialPanelSettings。
   * 不传则忽略 sideEffectSaves（保持向后兼容）。
   */
  onSideSave?: (key: string, payload: unknown) => void | Promise<void>;
  /**
   * 壳外独立草稿的保存状态（如工单「报工自定义单据内容」）。
   * 与内部 draft 状态合并后显示在左下角：error > saving > pending > saved。
   */
  extraSaveStatus?: FormConfigSaveStatus;
  /** extraSaveStatus === 'error' 时，左下角「重试」一并触发 */
  onRetryExtraSave?: () => void;
  /** 透传给 CustomSlot / 用于 standardFieldsList 的默认隐藏规则等；可选 */
  productionLinkMode?: 'order' | 'product';
}

function mergeFormConfigSaveStatus(
  primary: FormConfigSaveStatus,
  extra?: FormConfigSaveStatus,
): FormConfigSaveStatus {
  if (!extra) return primary;
  const rank: Record<FormConfigSaveStatus, number> = {
    saved: 0,
    pending: 1,
    saving: 2,
    error: 3,
  };
  return rank[extra] > rank[primary] ? extra : primary;
}

function resolveSubtitle(
  subtitle: FormConfigSchema<unknown>['subtitle'],
  tabId: string | undefined,
): string | undefined {
  if (!subtitle) return undefined;
  if (typeof subtitle === 'string') return subtitle;
  if (tabId === 'fields' || tabId === 'print' || tabId === 'listDisplay' || tabId === 'list') {
    const v = subtitle[tabId];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return subtitle.fields ?? subtitle.print ?? subtitle.listDisplay ?? subtitle.list;
}

/**
 * 通用业务表单配置 Modal：根据 `schema` 渲染壳 + tabs + sections + 底部按钮，
 * 取代原先 9 个几乎一致的 *FormConfigModal 文件。
 *
 * 能力：
 * - draft 生命周期：仅在弹窗从关闭→打开时 clone 一份 initialValue；**打开期间**父级若刷新
 *   `initialValue` 引用（如全局配置重拉）**不会**重置 draft，避免打印白名单 / 嵌套弹窗合并结果在点「保存配置」前被冲掉
 * - tabs 切换 + `onActivate` 钩子（典型：切到 print tab 触发模板刷新）
 * - section 分派：customFieldsTable / standardFieldsList / printWhitelist / toggle / customSlot
 * - 内置 PlanPrintTemplateManageDialog 挂载：scope 由 printWhitelist 卡片触发；section.hideOptionalTemplateList 时可隐藏「可选模版」芯片区
 * - window.focus 刷新：当 schema 含任一 printWhitelist section 时自动启用
 * - 自动保存：编辑停止 600ms 后先跑 `transformOnSave`，再 `onSave`；另起 `sideEffectSaves` 钩子支持多 key 写入
 */
export function BusinessFormConfigModal<TSettings extends object>({
  open,
  onClose,
  defaultTabId,
  schema,
  initialValue,
  onSave,
  onSideSave,
  extraSaveStatus,
  onRetryExtraSave,
  productionLinkMode = 'order',
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  plans,
  orders,
  products,
}: BusinessFormConfigModalProps<TSettings>): React.ReactElement | null {
  const [draft, setDraftState] = useState<TSettings | null>(null);
  const [tabId, setTabId] = useState<string>(() => defaultTabId ?? schema.tabs[0]?.id ?? '');
  const [activePrintSection, setActivePrintSection] = useState<FormConfigPrintWhitelistSection | null>(null);
  const [saveStatus, setSaveStatus] = useState<FormConfigSaveStatus>('saved');
  const wasOpenRef = useRef(false);
  const draftRef = useRef<TSettings | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const snapshot = useCallback((value: TSettings) => JSON.stringify(value), []);
  const displaySaveStatus = mergeFormConfigSaveStatus(saveStatus, extraSaveStatus);

  const hasAnyPrintWhitelist = useMemo(
    () => schema.tabs.some(t => t.sections.some(s => s.kind === 'printWhitelist')),
    [schema],
  );

  useRefreshPrintTemplatesOnWindowFocus(open && hasAnyPrintWhitelist, onRefreshPrintTemplates);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const normalized = schema.normalize(JSON.parse(JSON.stringify(initialValue))) as TSettings;
      setDraftState(normalized);
      draftRef.current = normalized;
      lastSavedSnapshotRef.current = snapshot(normalized);
      const tabIds = new Set(schema.tabs.map(t => t.id));
      const fallback = schema.tabs[0]?.id ?? '';
      const want = defaultTabId ?? fallback;
      setTabId(tabIds.has(want) ? want : fallback);
      setSaveStatus('saved');
    } else if (!open && wasOpenRef.current) {
      setDraftState(null);
      draftRef.current = null;
      lastSavedSnapshotRef.current = null;
      setActivePrintSection(null);
      setSaveStatus('saved');
    }
    wasOpenRef.current = open;
  }, [open, initialValue, defaultTabId, schema, snapshot]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  /**
   * 同一弹窗内的保存严格串行，避免慢请求以旧草稿覆盖新草稿。
   * 失败不会丢草稿；下次编辑或点击重试会再次提交最新值。
   */
  const enqueueSave = useCallback(async (value: TSettings): Promise<boolean> => {
    const valueSnapshot = snapshot(value);
    if (valueSnapshot === lastSavedSnapshotRef.current) return true;

    const task = async (): Promise<boolean> => {
      setSaveStatus('saving');
      const transformed = schema.transformOnSave ? schema.transformOnSave(value) : value;
      try {
        await onSave(transformed);
        if (schema.sideEffectSaves && onSideSave) {
          for (const side of schema.sideEffectSaves) {
            await onSideSave(side.key, side.build(value));
          }
        }
        lastSavedSnapshotRef.current = valueSnapshot;
        setSaveStatus(snapshot(draftRef.current ?? value) === valueSnapshot ? 'saved' : 'pending');
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`自动保存失败：${msg}`);
        setSaveStatus(snapshot(draftRef.current ?? value) === valueSnapshot ? 'error' : 'pending');
        return false;
      }
    };

    const result = saveQueueRef.current.then(task, task);
    saveQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }, [onSave, onSideSave, schema, snapshot]);

  useEffect(() => {
    if (!open || !draft) return;
    if (snapshot(draft) === lastSavedSnapshotRef.current) return;
    setSaveStatus('pending');
    const timer = window.setTimeout(() => {
      void enqueueSave(draft);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, enqueueSave, open, snapshot]);

  const handleClose = useCallback(async () => {
    const current = draftRef.current;
    if (current && snapshot(current) !== lastSavedSnapshotRef.current) {
      const saved = await enqueueSave(current);
      if (!saved) return;
    }
    onClose();
  }, [enqueueSave, onClose, snapshot]);

  const buildCtx = useCallback(
    (current: TSettings): FormConfigSlotContext<TSettings> => ({
      draft: current,
      setDraft: updater => setDraftState(d => (d ? updater(d) : d)),
      get: path => getByPath(current, path),
      set: (path, value) => setDraftState(d => (d ? (setByPath(d, path, value) as TSettings) : d)),
      close: () => { void handleClose(); },
      openPrintManage: scope => {
        const found = findPrintWhitelistSectionByScope(schema, scope);
        if (found) setActivePrintSection(found);
      },
      refreshPrintTemplates: () => onRefreshPrintTemplates?.() ?? undefined,
    }),
    [handleClose, schema, onRefreshPrintTemplates],
  );

  if (!open || !draft) return null;

  const ctx = buildCtx(draft);
  const tabs = schema.tabs;
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0];
  const subtitle = resolveSubtitle(schema.subtitle, tab?.id);

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { void handleClose(); }} />
      <div className="relative z-10 flex max-h-[min(92vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Sliders className="h-5 w-5 text-indigo-500" /> {schema.title}
            </h3>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={() => { void handleClose(); }} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {tabs.length > 1 && (
          <div className="flex gap-1 border-b border-slate-100 px-6 pt-2">
            {tabs.map(t => {
              const active = t.id === tab?.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTabId(t.id);
                    t.onActivate?.(buildCtx(draft));
                  }}
                  className={`flex items-center gap-1.5 rounded-t-xl px-4 py-2.5 text-sm font-black transition-colors ${
                    active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {t.iconPrinter && <Printer className="h-4 w-4" />}
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {tab?.hint != null && tab.hint !== '' && (
            <div
              role="note"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600"
            >
              {tab.hint}
            </div>
          )}
          {tab?.sections.map(section => (
            <SectionRenderer
              key={section.id}
              section={section}
              ctx={ctx}
              productionLinkMode={productionLinkMode}
              printTemplates={printTemplates}
              onRequestAddTemplate={sec => {
                void onRefreshPrintTemplates?.();
                setActivePrintSection(sec);
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-8 py-5">
          <div className={`text-xs font-semibold ${displaySaveStatus === 'error' ? 'text-rose-600' : displaySaveStatus === 'saved' ? 'text-emerald-600' : 'text-slate-500'}`}>
            {displaySaveStatus === 'saving' && '正在保存…'}
            {displaySaveStatus === 'pending' && '更改将自动保存…'}
            {displaySaveStatus === 'saved' && '✓ 已保存'}
            {displaySaveStatus === 'error' && (
              <button
                type="button"
                onClick={() => {
                  if (saveStatus === 'error' && draftRef.current) void enqueueSave(draftRef.current);
                  if (extraSaveStatus === 'error') onRetryExtraSave?.();
                }}
                className="font-bold underline underline-offset-2"
              >
                保存失败，点击重试
              </button>
            )}
          </div>
          <button
            onClick={() => { void handleClose(); }}
            className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            关闭
          </button>
        </div>
      </div>

      {activePrintSection && (
        <PlanPrintTemplateManageDialog
          open
          onClose={() => setActivePrintSection(null)}
          scope={activePrintSection.scope}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          // PlanPrintTemplateManageDialog 内部只读 draft 中 scope 对应的 allowedTemplateIds
          // （通过内置的 allowedTemplateIdsForScope），这里直接把 draft 原值传入即可。
          planFormSettings={draft as never}
          onMergePrintWhitelist={id => {
            setDraftState(d =>
              d && activePrintSection ? mergeAllowedTemplateIdInDraft(d, activePrintSection.path, id) : d,
            );
          }}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
      )}
    </div>
    </ModalPortal>
  );
}

function findPrintWhitelistSectionByScope<T>(
  schema: FormConfigSchema<T>,
  scope: PlanPrintTemplateManageScope,
): FormConfigPrintWhitelistSection | null {
  for (const t of schema.tabs) {
    for (const s of t.sections) {
      if (s.kind === 'printWhitelist' && s.scope === scope) return s;
    }
  }
  return null;
}

interface SectionRendererProps {
  section: FormConfigSection;
  ctx: FormConfigSlotContext;
  productionLinkMode: 'order' | 'product';
  printTemplates: FormConfigPrintContextDependencies['printTemplates'];
  onRequestAddTemplate: (section: FormConfigPrintWhitelistSection) => void;
}

const SectionRenderer: React.FC<SectionRendererProps> = ({
  section,
  ctx,
  productionLinkMode,
  printTemplates,
  onRequestAddTemplate,
}) => {
  switch (section.kind) {
    case 'customFieldsTable': {
      const fields = ((ctx.get(section.path) as PlanFormFieldConfig[] | undefined) ?? []) as PlanFormFieldConfig[];
      return (
        <CustomFieldsEditorTable
          title={section.title}
          subtitle={section.subtitle}
          headerExtra={section.renderHeaderExtra?.(ctx)}
          fields={fields}
          onChange={next => ctx.set(section.path, next)}
          columns={section.columns}
          addButtonLabel={section.addButtonLabel}
          emptyHint={section.emptyHint}
          idPrefix={section.idPrefix}
          columnHints={section.columnHints}
        />
      );
    }
    case 'standardFieldsList': {
      const path = section.path ?? 'standardFields';
      const fields = ((ctx.get(path) as PlanFormFieldConfig[] | undefined) ?? []) as PlanFormFieldConfig[];
      const hidden = section.hiddenIdsFromCtx
        ? section.hiddenIdsFromCtx(ctx)
        : section.hiddenIds ?? [];
      // productionLinkMode=product 时隐藏 customer 字段（保留计划单原语义）
      const dynamicHidden = productionLinkMode === 'product' ? [...hidden, 'customer'] : hidden;
      const visible = fields.filter(f => !dynamicHidden.includes(f.id));
      return (
        <div>
          {section.title && (
            <h4 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-600">{section.title}</h4>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">字段</th>
                  <th
                    className="cursor-help px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500"
                    title="勾选后，该标准字段作为列表表格中的一列展示（是否出现列、列宽等还受列表页布局影响）。"
                  >
                    列表中
                  </th>
                  <th
                    className="cursor-help px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500"
                    title="勾选后，新建单据时可填写或选择该字段。"
                  >
                    新增时
                  </th>
                  <th
                    className="cursor-help px-4 py-3 text-center text-[10px] font-black uppercase text-slate-500"
                    title="勾选后，在单据详情中展示该字段。"
                  >
                    详情中
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(f => {
                  const patch = (mut: (sf: PlanFormFieldConfig) => PlanFormFieldConfig) =>
                    ctx.set(
                      path,
                      fields.map(sf => (sf.id === f.id ? mut(sf) : sf)),
                    );
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={f.showInList}
                          onChange={e => patch(sf => ({ ...sf, showInList: e.target.checked }))}
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={f.showInCreate}
                          onChange={e => patch(sf => ({ ...sf, showInCreate: e.target.checked }))}
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={f.showInDetail}
                          onChange={e => patch(sf => ({ ...sf, showInDetail: e.target.checked }))}
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    case 'printWhitelist': {
      const slot = ((ctx.get(section.path) as Record<string, unknown> | undefined) ?? {}) as {
        allowedTemplateIds?: string[];
        [k: string]: unknown;
      };
      const toggleKey = section.toggle?.key ?? 'showPrintButton';
      const defaultChecked = section.toggle?.defaultChecked ?? false;
      const toggleChecked =
        section.toggle == null
          ? false
          : (slot[toggleKey] as boolean | undefined) === true ||
            ((slot[toggleKey] as boolean | undefined) === undefined && defaultChecked);
      const onChangeAllowedTemplateIds = (next: string[] | undefined) => {
        const nextSlot: Record<string, unknown> = { ...slot, allowedTemplateIds: next };
        if (!next) delete nextSlot.allowedTemplateIds;
        ctx.set(section.path, nextSlot);
      };
      const onChangeToggle = (v: boolean) => {
        const nextSlot: Record<string, unknown> = { ...slot, [toggleKey]: v };
        ctx.set(section.path, nextSlot);
      };
      return (
        <PrintTemplateWhitelistCard
          title={section.title}
          hint={section.hint}
          allowedTemplateIds={slot.allowedTemplateIds}
          onChangeAllowedTemplateIds={onChangeAllowedTemplateIds}
          toggle={
            section.toggle
              ? {
                  label: section.toggle.label,
                  description: section.toggle.description,
                  checked: toggleChecked,
                  onChange: onChangeToggle,
                }
              : undefined
          }
          availableTemplates={printTemplates}
          onRequestAddTemplate={() => onRequestAddTemplate(section)}
          emptyHint={section.emptyHint}
          hideOptionalTemplateList={section.hideOptionalTemplateList === true}
        />
      );
    }
    case 'toggle': {
      const defaultChecked = section.defaultChecked ?? false;
      const raw = ctx.get(section.path) as boolean | undefined;
      const checked = raw === undefined ? defaultChecked : !!raw;
      return (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
            checked={checked}
            onChange={e => ctx.set(section.path, e.target.checked)}
          />
          <span className="min-w-0 flex-1 leading-relaxed">
            <span className="font-bold">{section.label}</span>
            {section.description && (
              <span className="ml-2 text-xs font-medium text-slate-500">{section.description}</span>
            )}
          </span>
        </label>
      );
    }
    case 'customSlot':
      return (
        <React.Fragment>{section.render(ctx, { productionLinkMode })}</React.Fragment>
      );
    default:
      return null;
  }
};

export default BusinessFormConfigModal;
