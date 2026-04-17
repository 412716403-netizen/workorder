import type { ReactNode } from 'react';
import type {
  PlanFormFieldConfig,
  PlanListPrintSettings,
  PrintTemplate,
  Product,
  ProductionOrder,
  PlanOrder,
} from '../../types';
import type { PlanPrintTemplateManageScope } from '../plan-print/PlanPrintTemplateManageDialog';
import type { CustomFieldEditorColumn } from './CustomFieldsEditorTable';

/**
 * 9 个业务 FormConfig Modal 经过抽象后，差异可以压缩成一份「schema 对象」。
 * BusinessFormConfigModal 根据 schema 渲染壳 + tabs + sections，保存路径自动化。
 *
 * path 语法参考 formConfigPath.ts；所有 path 相对 settings 根对象。
 */

/** 上下文：section 在渲染时可取用的辅助对象（典型：打印模板刷新、navigate） */
export interface FormConfigSlotContext<TSettings = unknown> {
  /** 当前 draft 副本（只读） */
  draft: TSettings;
  /** 就地 patch draft（immer 风格：传入新值替换原值） */
  setDraft: (updater: (d: TSettings) => TSettings) => void;
  /** 通过 path 读取 draft 中的子值 */
  get: <V = unknown>(path: string) => V | undefined;
  /** 通过 path 写入 draft 中的子值（value=undefined 时清除 key） */
  set: (path: string, value: unknown) => void;
  /** 关闭 Modal（customSlot 中若需要跳转到别的页面时用） */
  close: () => void;
  /** 打开 PlanPrintTemplateManageDialog（customSlot 若需要也可调） */
  openPrintManage: (scope: PlanPrintTemplateManageScope) => void;
  /** 触发手动刷新打印模板（当前 schema 的 onRefresh 回调） */
  refreshPrintTemplates: () => void | Promise<void>;
}

/** 自定义字段表 section */
export interface FormConfigCustomFieldsSection {
  kind: 'customFieldsTable';
  id: string;
  title?: string;
  subtitle?: ReactNode;
  /** settings 中的字段数组路径，如 'customFields' / 'stockInCustomFields' / 'materialIssueCustomFields' */
  path: string;
  columns?: CustomFieldEditorColumn[];
  addButtonLabel?: string;
  emptyHint?: string;
  /** 新行 id 前缀，默认 'custom-' */
  idPrefix?: string;
  /** 紧邻标题右侧的额外按钮（如「去工序节点库」入口） */
  renderHeaderExtra?: (ctx: FormConfigSlotContext) => ReactNode;
}

/** 标准字段显示列表 section（PlanFormSettings 等含 standardFields 的配置使用） */
export interface FormConfigStandardFieldsSection {
  kind: 'standardFieldsList';
  id: string;
  title?: string;
  /** 默认 'standardFields' */
  path?: string;
  /** 默认隐藏 id 列表（典型为 productionLinkMode 影响的字段） */
  hiddenIds?: string[];
  /** 需要动态隐藏时使用（优先于 hiddenIds） */
  hiddenIdsFromCtx?: (ctx: FormConfigSlotContext) => string[];
}

/** 单个打印模版白名单卡片 section */
export interface FormConfigPrintWhitelistSection {
  kind: 'printWhitelist';
  id: string;
  title: string;
  hint?: ReactNode;
  scope: PlanPrintTemplateManageScope;
  /**
   * 指向一个 PlanListPrintSettings 形状的值（含 allowedTemplateIds），
   * 如 'listPrint' / 'labelPrint' / 'orderCenterPrint.orderDetail' /
   * 'reworkCenterPrint.defectTreatmentFlowDetail'。
   * 不存在时视为 undefined；写入时用 setByPath 新建父对象。
   */
  path: string;
  /** 可选布尔开关：如「列表上显示打印按钮」 / 「计划详情中显示追溯码区块」 */
  toggle?: {
    label: ReactNode;
    description?: ReactNode;
    /** 相对 path 的子 key，默认 'showPrintButton' */
    key?: string;
    /** 缺省视为 true（业务上默认显示按钮/区块） */
    defaultChecked?: boolean;
  };
  emptyHint?: ReactNode;
}

/** 单个布尔开关 section（站在 section 级别，不嵌在 printWhitelist 中） */
export interface FormConfigToggleSection {
  kind: 'toggle';
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** settings 中布尔值路径 */
  path: string;
  /** 缺省为 false 还是 true；默认 false */
  defaultChecked?: boolean;
}

/** 完全自定义的 JSX 逃生舱（不要为了奇形怪状的 section 去膨胀 schema） */
export interface FormConfigCustomSlotSection {
  kind: 'customSlot';
  id: string;
  render: (ctx: FormConfigSlotContext) => ReactNode;
}

export type FormConfigSection =
  | FormConfigCustomFieldsSection
  | FormConfigStandardFieldsSection
  | FormConfigPrintWhitelistSection
  | FormConfigToggleSection
  | FormConfigCustomSlotSection;

export interface FormConfigTab {
  id: string;
  label: string;
  /** 是否在该 tab 上挂 printer 图标 */
  iconPrinter?: boolean;
  sections: FormConfigSection[];
  /**
   * 切到该 tab 时触发（典型：切到 'print' tab 时刷新打印模板列表）。
   * 不设则 tab 切换时不触发额外副作用。
   */
  onActivate?: (ctx: FormConfigSlotContext) => void;
}

export interface FormConfigSchema<TSettings> {
  title: string;
  /** 字段/打印两种 tab 下的默认副标题（若 tab 没单独写 subtitle） */
  subtitle?: string | { fields?: string; print?: string };
  /** 对应 SystemSetting.key / AppDataContext 中使用的 key，如 'planFormSettings' */
  settingsKey: string;
  defaultValue: TSettings;
  normalize: (v: unknown) => TSettings;
  tabs: FormConfigTab[];
  /** 保存前的最终改写（如 OrderFormConfig 里强制 customFields=[]） */
  transformOnSave?: (v: TSettings) => TSettings;
  /**
   * 保存时额外写入的配置 key（如 MaterialForm 的 groupByOutsourcePartner 要同步写入 materialPanelSettings）。
   * 形式：从 draft 中抽取出第二个键的 payload。
   *
   * 注意：sideEffectSaves 与主 onSave 是两次独立请求，后端 SystemSetting upsert 不在事务里，
   * 部分成功是真实可能性（主成功、副失败）。BusinessFormConfigModal 在副失败时会
   * 用 `label ?? key` 在 toast 中提示用户哪一项同步失败。
   */
  sideEffectSaves?: Array<{
    key: string;
    /** 在「主配置已保存，但 X 同步失败」toast 中替代 key 显示的中文标签 */
    label?: string;
    build: (v: TSettings) => unknown;
  }>;
}

/**
 * 打印模板白名单卡片用到的共享字段（给 BusinessFormConfigModal 集中挂载 PlanPrintTemplateManageDialog 用）。
 * schema 渲染时不需要自己传 —— BusinessFormConfigModal 会注入。
 */
export interface FormConfigPrintContextDependencies {
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

/** 在 ctx 里做 PlanListPrintSettings 的读写辅助 */
export function readListPrintSlot(ctx: FormConfigSlotContext, path: string): PlanListPrintSettings | undefined {
  return ctx.get<PlanListPrintSettings>(path);
}

export function writeListPrintSlot(
  ctx: FormConfigSlotContext,
  path: string,
  patch: Partial<PlanListPrintSettings> & Record<string, unknown>,
): void {
  const prev = readListPrintSlot(ctx, path) ?? {};
  const next = { ...prev, ...patch };
  ctx.set(path, next);
}

/** 合并 PlanPrintTemplateManageDialog 新增的 templateId 到白名单 */
export function mergeAllowedTemplateId(
  ctx: FormConfigSlotContext,
  path: string,
  templateId: string,
): void {
  const prev = readListPrintSlot(ctx, path);
  const prevIds = prev?.allowedTemplateIds;
  const allowedTemplateIds = prevIds?.length ? Array.from(new Set([...prevIds, templateId])) : [templateId];
  writeListPrintSlot(ctx, path, { allowedTemplateIds });
}

/** 所有可能出现的 PlanFormFieldConfig 列 */
export type { PlanFormFieldConfig };
