import type { PrintTemplate } from '../types';

/**
 * 按表单配置白名单过滤可选打印模版。
 * 未配置或白名单为空时返回空数组（不回落为「全部模版」），与进销存列表打印、计划单列表打印一致。
 */
export function filterPrintTemplatesByAllowedIds(
  printTemplates: PrintTemplate[],
  allowedTemplateIds: string[] | undefined,
): PrintTemplate[] {
  const raw = allowedTemplateIds;
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  const allowedSet = new Set(
    raw.map(x => (x != null && x !== '' ? String(x).trim() : '')).filter(Boolean),
  );
  if (allowedSet.size === 0) return [];
  return printTemplates.filter(t => allowedSet.has(String(t.id).trim()));
}
