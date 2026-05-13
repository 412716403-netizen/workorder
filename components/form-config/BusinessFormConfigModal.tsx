import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  mergeAllowedTemplateId,
} from './formConfigSchema';

export interface BusinessFormConfigModalProps<TSettings extends Record<string, unknown>>
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
  /** 透传给 CustomSlot / 用于 standardFieldsList 的默认隐藏规则等；可选 */
  productionLinkMode?: 'order' | 'product';
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
 * - 保存：先跑 `transformOnSave`，再 `onSave`；另起 `sideEffectSaves` 钩子支持多 key 写入
 */
export function BusinessFormConfigModal<TSettings extends Record<string, unknown>>({
  open,
  onClose,
  defaultTabId,
  schema,
  initialValue,
  onSave,
  onSideSave,
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
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  const hasAnyPrintWhitelist = useMemo(
    () => schema.tabs.some(t => t.sections.some(s => s.kind === 'printWhitelist')),
    [schema],
  );

  useRefreshPrintTemplatesOnWindowFocus(open && hasAnyPrintWhitelist, onRefreshPrintTemplates);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraftState(JSON.parse(JSON.stringify(initialValue)) as TSettings);
      const tabIds = new Set(schema.tabs.map(t => t.id));
      const fallback = schema.tabs[0]?.id ?? '';
      const want = defaultTabId ?? fallback;
      setTabId(tabIds.has(want) ? want : fallback);
      setSaving(false);
    } else if (!open && wasOpenRef.current) {
      setDraftState(null);
      setActivePrintSection(null);
      setSaving(false);
    }
    wasOpenRef.current = open;
  }, [open, initialValue, defaultTabId, schema]);

  const buildCtx = useCallback(
    (current: TSettings): FormConfigSlotContext<TSettings> => ({
      draft: current,
      setDraft: updater => setDraftState(d => (d ? updater(d) : d)),
      get: path => getByPath(current, path),
      set: (path, value) => setDraftState(d => (d ? (setByPath(d, path, value) as TSettings) : d)),
      close: onClose,
      openPrintManage: scope => {
        const found = findPrintWhitelistSectionByScope(schema, scope);
        if (found) setActivePrintSection(found);
      },
      refreshPrintTemplates: () => onRefreshPrintTemplates?.() ?? undefined,
    }),
    [onClose, schema, onRefreshPrintTemplates],
  );

  if (!open || !draft) return null;

  const ctx = buildCtx(draft);
  const tabs = schema.tabs;
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0];
  const subtitle = resolveSubtitle(schema.subtitle, tab?.id);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const transformed = schema.transformOnSave ? schema.transformOnSave(draft) : draft;
    /**
     * 保存管线（错误处理契约）
     * - 主 onSave 失败：toast 提示，不跑 sideEffectSaves，不 onClose（保留用户编辑）
     * - sideEffectSaves 中任一失败：toast 提示「主配置已保存，但 X 同步失败」，不 onClose
     *   底层 SystemSetting upsert 不在事务里，主 + 副两步是独立请求，部分成功是真实可能性。
     * - 全部成功才 onClose。saving 锁防止快速双击重复触发。
     */
    try {
      await onSave(transformed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`保存失败：${msg}`);
      setSaving(false);
      return;
    }
    if (schema.sideEffectSaves && onSideSave) {
      for (const side of schema.sideEffectSaves) {
        try {
          await onSideSave(side.key, side.build(draft));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const name = side.label ?? side.key;
          toast.error(`主配置已保存，但「${name}」同步失败，请稍后重新保存：${msg}`);
          setSaving(false);
          return;
        }
      }
    }
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Sliders className="h-5 w-5 text-indigo-500" /> {schema.title}
            </h3>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
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

        <div className="flex justify-end gap-3 border-t border-slate-100 px-8 py-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存配置'}
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
            mergeAllowedTemplateId(buildCtx(draft), activePrintSection.path, id);
          }}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
      )}
    </div>
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
      const defaultChecked = section.toggle?.defaultChecked ?? true;
      // 语义与现状保持一致：slot[toggleKey] === false 视为关闭，其它（含 undefined）视为开
      const toggleChecked =
        section.toggle == null
          ? true
          : (slot[toggleKey] as boolean | undefined) !== false &&
            ((slot[toggleKey] as boolean | undefined) !== undefined || defaultChecked);
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
