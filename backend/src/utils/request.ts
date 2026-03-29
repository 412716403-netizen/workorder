/** Extract a single string from Express query/params which may be string | string[] */
export function str(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return '';
}

export function optStr(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}

const UPDATE_EXCLUDE = new Set(['id', 'tenantId', 'createdAt', 'updatedAt']);
const CREATE_EXCLUDE = new Set(['tenantId', 'updatedAt']);

const JSON_FIELD_KEYS = new Set([
  'customData', 'customFields', 'assignments', 'reportTemplate',
  'colorIds', 'sizeIds', 'categoryCustomData', 'milestoneNodeIds',
  'routeReportValues',
  'nodeRates', 'nodePricingModes', 'nodeBoms', 'permissions',
  'standardFields', 'assignedWorkerIds', 'assignedEquipmentIds',
]);

function isRelationObject(k: string, v: unknown): boolean {
  if (JSON_FIELD_KEYS.has(k)) return false;
  return !!v && typeof v === 'object' && !Array.isArray(v) && (v as Record<string, unknown>).id !== undefined;
}

/**
 * Strip read-only / relation fields from req.body before passing to Prisma update.
 * Removes: id, tenantId, createdAt, updatedAt, and any plain-object value that looks
 * like a loaded Prisma relation (non-array object with an `id` property).
 */
export function sanitizeUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (UPDATE_EXCLUDE.has(k)) continue;
    if (isRelationObject(k, v)) continue;
    data[k] = v;
  }
  return data;
}

/**
 * Strip non-schema fields for Prisma create. Keeps `id` and `createdAt` but removes
 * tenantId, updatedAt, and relation objects.
 */
export function sanitizeCreate(body: Record<string, unknown>): any {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (CREATE_EXCLUDE.has(k)) continue;
    if (isRelationObject(k, v)) continue;
    data[k] = v;
  }
  return data;
}

/**
 * Sanitize an array of items for createMany — strips id, tenantId,
 * createdAt, updatedAt, relation objects, and optional extra keys from each item.
 */
export function sanitizeItems(items: Record<string, unknown>[], extraExclude?: string[]): any[] {
  const extra = extraExclude ? new Set(extraExclude) : null;
  return items.map(item => {
    const clean = sanitizeUpdate(item);
    if (extra) { for (const k of extra) delete clean[k]; }
    return clean;
  });
}

const DATE_KEYS = new Set([
  'startDate', 'dueDate', 'timestamp', 'createdAt',
  'plannedDate', 'actualDate', 'accountExpiresAt',
]);

/**
 * Convert date-like string values to Date objects (or null for empty strings).
 * Prisma requires Date objects for DateTime fields, not plain date strings.
 */
export function normalizeDates(data: Record<string, unknown>): Record<string, unknown> {
  for (const k of DATE_KEYS) {
    if (!(k in data)) continue;
    const v = data[k];
    if (v === '' || v === null || v === undefined) { data[k] = null; continue; }
    if (typeof v === 'string') { data[k] = new Date(v); }
  }
  return data;
}
