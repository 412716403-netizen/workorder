/**
 * 租户打印模版与「系统层」逻辑的衔接点。
 * 历史上曾统一下发外协发出单系统模版（id `builtin-outsource-dispatch-v1`），已移除；读/写时仍从列表中剔除该 id，避免库内残留副本被当作可用模版。
 */

/** 已从产品中移除的系统模版 id：合并配置与持久化写入时一律过滤 */
const OBSOLETE_SYSTEM_PRINT_TEMPLATE_IDS = new Set(['builtin-outsource-dispatch-v1']);

/** 当前无锁定系统模版；保留常量供前端/扩展判断 */
export const SYSTEM_LOCKED_PRINT_TEMPLATE_IDS = [] as const;

const LOCKED_SET = new Set<string>(SYSTEM_LOCKED_PRINT_TEMPLATE_IDS);

export function isSystemLockedPrintTemplateId(id: string | undefined): boolean {
  return id != null && LOCKED_SET.has(String(id).trim());
}

/** 预留：若未来再次增加代码统一下发的模版，在此返回 JSON 记录数组 */
export function listSystemPrintTemplateRecordsForMerge(): Record<string, unknown>[] {
  return [];
}

function filterStoredPrintTemplates(stored: unknown): unknown[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(x => {
    if (x == null || typeof x !== 'object') return false;
    const id = String((x as { id?: string }).id ?? '').trim();
    if (!id || OBSOLETE_SYSTEM_PRINT_TEMPLATE_IDS.has(id)) return false;
    if (isSystemLockedPrintTemplateId(id)) return false;
    return true;
  });
}

/**
 * 合并租户库中已保存的模版与系统模版：当前无系统条目，仅过滤已废弃 id 与锁定 id。
 */
export function mergePrintTemplatesForTenantConfig(stored: unknown): unknown[] {
  return filterStoredPrintTemplates(stored);
}

/** 写入 DB 前移除锁定系统模版与已废弃系统 id */
export function stripSystemPrintTemplatesForPersistence(value: unknown): unknown[] {
  return filterStoredPrintTemplates(value);
}
