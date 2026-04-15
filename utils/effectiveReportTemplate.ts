import type { GlobalNodeTemplate, Milestone, ReportFieldDefinition } from '../types';

/**
 * 里程碑上的 reportTemplate 为建单快照；节点库更新后以节点库为准（与报工弹窗一致）。
 */
export function getEffectiveReportTemplate(
  milestone: Pick<Milestone, 'templateId' | 'reportTemplate'>,
  globalNodes: GlobalNodeTemplate[],
): ReportFieldDefinition[] {
  const nodeDef = globalNodes.find(n => n.id === milestone.templateId);
  const fromNode = nodeDef?.reportTemplate ?? [];
  if (fromNode.length > 0) return fromNode;
  return milestone.reportTemplate ?? [];
}

const INTERNAL_CUSTOM_DATA_KEYS = new Set(['source', 'docNo']);

/** 将报工 customData 按当前填报项定义格式化为只读行（用于流水/工单详情） */
export function getReportCustomDataDisplayEntries(
  customData: Record<string, any> | undefined | null,
  fieldDefs: ReportFieldDefinition[],
): { fieldId: string; label: string; display: string }[] {
  if (!customData || !fieldDefs.length) return [];
  const out: { fieldId: string; label: string; display: string }[] = [];
  for (const f of fieldDefs) {
    const v = customData[f.id];
    if (v == null || v === '') continue;
    if (f.type === 'boolean') {
      out.push({ fieldId: f.id, label: f.label, display: v === true || v === 'true' || v === '1' ? '是' : '否' });
      continue;
    }
    if (f.type === 'file') {
      const s = typeof v === 'string' ? v : '';
      if (!s) continue;
      if (s.startsWith('data:image/')) out.push({ fieldId: f.id, label: f.label, display: '（已上传图片）' });
      else if (s.startsWith('data:')) out.push({ fieldId: f.id, label: f.label, display: '（已上传附件）' });
      else out.push({ fieldId: f.id, label: f.label, display: s.length > 80 ? `${s.slice(0, 80)}…` : s });
      continue;
    }
    out.push({ fieldId: f.id, label: f.label, display: String(v) });
  }
  for (const [k, v] of Object.entries(customData)) {
    if (INTERNAL_CUSTOM_DATA_KEYS.has(k)) continue;
    if (fieldDefs.some(f => f.id === k)) continue;
    if (v == null || v === '') continue;
    out.push({ fieldId: k, label: k, display: typeof v === 'object' ? JSON.stringify(v) : String(v) });
  }
  return out;
}

/**
 * 报工弹窗：从产品 routeReportValues 取默认值时做类型校验，避免旧数据（如文本写进文件项、data URL 写进文本项）污染表单。
 */
export function coerceRouteReportDefaultForField(
  f: ReportFieldDefinition,
  raw: unknown,
): string | boolean | '' {
  if (raw === undefined || raw === null || raw === '') {
    return f.type === 'boolean' ? false : '';
  }
  if (f.type === 'boolean') {
    return raw === true || raw === 'true' || raw === '1' || raw === 1;
  }
  if (f.type === 'file') {
    if (typeof raw !== 'string') return '';
    const t = raw.trim();
    if (t.startsWith('data:') || t.startsWith('[')) return raw as string;
    return '';
  }
  if (f.type === 'text' || f.type === 'number' || f.type === 'select' || f.type === 'date') {
    if (typeof raw === 'string' && raw.startsWith('data:')) return '';
    if (f.type === 'number' && typeof raw === 'number') return String(raw);
    return String(raw);
  }
  return String(raw);
}

/**
 * 编辑报工或切换工序模板时，按当前填报项定义合并已有 customData 与产品工序默认值。
 * 已有值也会经过 coerceRouteReportDefaultForField 做类型安全转换，避免历史脏数据类型与当前字段定义不匹配。
 * 模板外的孤儿字段和内部元数据（source/docNo）会保留。
 */
export function mergeCustomDataForTemplate(
  existing: Record<string, any> | undefined | null,
  templateId: string,
  milestoneReportTemplate: ReportFieldDefinition[] | undefined,
  routeValuesForNode: Record<string, unknown> | undefined,
  globalNodes: GlobalNodeTemplate[],
): Record<string, any> {
  const ms = { templateId, reportTemplate: milestoneReportTemplate ?? [] };
  const tmpl = getEffectiveReportTemplate(ms, globalNodes);
  const route = routeValuesForNode ?? {};
  const ex = { ...(existing ?? {}) };
  const out: Record<string, any> = {};
  for (const f of tmpl) {
    const raw = ex[f.id];
    if (raw !== undefined && raw !== null) {
      out[f.id] = coerceRouteReportDefaultForField(f, raw);
    } else if (route[f.id] !== undefined && route[f.id] !== '') {
      out[f.id] = coerceRouteReportDefaultForField(f, route[f.id]);
    } else {
      out[f.id] = f.type === 'boolean' ? false : '';
    }
  }
  for (const [k, v] of Object.entries(ex)) {
    if (INTERNAL_CUSTOM_DATA_KEYS.has(k)) out[k] = v;
    else if (!tmpl.some(f => f.id === k) && !Object.prototype.hasOwnProperty.call(out, k)) {
      out[k] = v;
    }
  }
  return out;
}
