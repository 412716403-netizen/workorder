import type {
  CustomDocFieldType,
  FinanceCategory,
  GlobalNodeTemplate,
  PartnerCategory,
  Product,
  ProductCategory,
  ReportFieldDefinition,
} from '../types';

const DEFAULT_BOOLEAN_OPTIONS = ['是', '否'] as const;

/** 将历史或非法 type 规范为四种自定义单据类型（与计划单字段配置一致） */
export function effectiveCustomDocFieldType(field: { type?: string | null }): CustomDocFieldType {
  const t = field.type as string | undefined;
  if (t === 'number') return 'text';
  if (t === 'boolean') return 'select';
  if (t === 'date' || t === 'select' || t === 'file') return t;
  return 'text';
}

/** 单条字段定义归一化（写回设置前调用，避免再持久化 number/boolean） */
export function normalizeReportFieldDefinition(field: ReportFieldDefinition): ReportFieldDefinition {
  const raw = field.type as string | undefined;
  if (raw === 'boolean') {
    const opts = field.options?.length ? [...field.options] : [...DEFAULT_BOOLEAN_OPTIONS];
    return { ...field, type: 'select', options: opts };
  }
  if (raw === 'number') {
    return { ...field, type: 'text', options: undefined };
  }
  if (raw === 'date' || raw === 'file') {
    return { ...field, type: raw, options: undefined };
  }
  if (raw === 'select') {
    return { ...field, type: 'select', options: field.options ?? [] };
  }
  return { ...field, type: 'text', options: undefined };
}

export function normalizeReportFieldDefinitions(defs: ReportFieldDefinition[] | undefined | null): ReportFieldDefinition[] {
  if (!defs?.length) return [];
  return defs.map(normalizeReportFieldDefinition);
}

/** 将历史 boolean 存值转为下拉文案（便于与 boolean→select 迁移一致） */
export function normalizeReportCustomDataValue(
  field: Pick<ReportFieldDefinition, 'type' | 'options'>,
  raw: unknown,
): unknown {
  const eff = effectiveCustomDocFieldType(field);
  if (eff !== 'select') return raw;
  if (typeof raw === 'boolean') return raw ? (field.options?.[0] ?? '是') : (field.options?.[1] ?? '否');
  return raw;
}

/** 列表/卡片摘要：兼容历史 boolean 存值与附件 data URL */
export function formatReportCustomDataForList(
  field: Pick<ReportFieldDefinition, 'type' | 'options'>,
  raw: unknown,
): string {
  const f = normalizeReportFieldDefinition(field as ReportFieldDefinition);
  const eff = effectiveCustomDocFieldType(f);
  if (raw === undefined || raw === null || raw === '') return '';
  if (eff === 'select' && typeof raw === 'boolean') {
    return String(normalizeReportCustomDataValue(f, raw));
  }
  if (eff === 'file' && typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
  if (typeof raw === 'boolean') return raw ? '是' : '否';
  return String(raw);
}

export function getShowInFormCategoryFields(
  category: Pick<ProductCategory, 'customFields'> | null | undefined,
  options?: { includeFile?: boolean },
): ReportFieldDefinition[] {
  const includeFile = options?.includeFile ?? true;
  const defs = category?.customFields ?? [];
  return defs.filter(f => {
    if (f.showInForm === false) return false;
    if (!includeFile && effectiveCustomDocFieldType(f) === 'file') return false;
    return true;
  });
}

export function getProductCategoryCustomFieldEntries(
  product: Pick<Product, 'categoryCustomData'> | null | undefined,
  category: Pick<ProductCategory, 'customFields'> | null | undefined,
  options?: { includeFile?: boolean; includeEmpty?: boolean },
): Array<{ field: ReportFieldDefinition; value: unknown; display: string; empty: boolean }> {
  const includeEmpty = options?.includeEmpty ?? false;
  const defs = getShowInFormCategoryFields(category, { includeFile: options?.includeFile });
  const out: Array<{ field: ReportFieldDefinition; value: unknown; display: string; empty: boolean }> = [];
  for (const f of defs) {
    const value = product?.categoryCustomData?.[f.id];
    const empty = value == null || value === '';
    if (empty && !includeEmpty) continue;
    out.push({
      field: f,
      value,
      empty,
      display: empty ? '' : formatReportCustomDataForList(f, value),
    });
  }
  return out;
}

export function normalizePartnerCategoriesFromApi(list: PartnerCategory[]): PartnerCategory[] {
  return list.map(c => ({ ...c, customFields: normalizeReportFieldDefinitions(c.customFields) }));
}

export function normalizeProductCategoriesFromApi(list: ProductCategory[]): ProductCategory[] {
  return list.map(c => ({ ...c, customFields: normalizeReportFieldDefinitions(c.customFields) }));
}

export function normalizeFinanceCategoriesFromApi(list: FinanceCategory[]): FinanceCategory[] {
  return list.map(c => ({ ...c, customFields: normalizeReportFieldDefinitions(c.customFields) }));
}

/** 报工页只读展示项：历史上仅支持文本/附件；非 text|file 的模板项降级为文本，避免与报工弹窗展示逻辑不一致 */
export function normalizeReportDisplayFieldDefinitions(
  defs: ReportFieldDefinition[] | undefined | null,
): ReportFieldDefinition[] {
  if (!defs?.length) return [];
  return defs.map(d => {
    const n = normalizeReportFieldDefinition(d);
    const t = effectiveCustomDocFieldType(n);
    if (t === 'text' || t === 'file') return n;
    return {
      ...n,
      type: 'text',
      options: undefined,
      dateWithTime: undefined,
      dateAutoFill: undefined,
    };
  });
}

export function normalizeGlobalNodesFromApi(list: GlobalNodeTemplate[]): GlobalNodeTemplate[] {
  return list.map(n => ({
    ...n,
    reportTemplate: normalizeReportFieldDefinitions(n.reportTemplate),
    reportDisplayTemplate: n.reportDisplayTemplate?.length
      ? normalizeReportDisplayFieldDefinitions(n.reportDisplayTemplate)
      : n.reportDisplayTemplate,
  }));
}
