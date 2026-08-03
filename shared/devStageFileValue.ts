/**
 * 开发节点登记 · 文件/图片字段值
 * - 历史：单个 data URL 字符串，或多 URL 的 JSON 字符串数组
 * - 现格式：可选文件名头（devStageFiles JSON）+ 本体（JSON 或裸 data URL）
 * - 详情延迟下发：`[{name, deferred:true}]`（无 base64），点击后再按 field 拉完整值
 */

export const DEV_STAGE_FILE_MAX_COUNT = 9;

/** 详情 / SQL LEFT 读取的文件头长度，足以容纳 names 头 + 首文件名 */
export const DEV_STAGE_FILE_VALUE_HEAD_LEN = 1200;

const FILE_NAMES_HEADER_PREFIX = '/*devStageFiles:';

export type DevStageFileItem = {
  url: string;
  /** 原始文件名；历史无名字段时为空串 */
  name: string;
  /** 款式详情延迟下发：仅有元数据，url 为空，需按 fieldId 再拉 */
  deferred?: boolean;
};

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 200);
}

function extFromDataUrl(url: string): string {
  const m = url.match(/^data:([^;,]+)/i);
  if (!m?.[1]) return 'bin';
  const mime = m[1].toLowerCase();
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  if (map[mime]) return map[mime]!;
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'docx';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'xlsx';
  const sub = mime.split('/')[1] ?? '';
  const simple = sub.replace(/[^a-z0-9]+/gi, '').slice(0, 8);
  return simple || 'bin';
}

/** 解析/剥落写入时前置的文件名头（供 LEFT(value) 不必读整段 base64） */
export function peelDevStageFileNamesHeader(raw: string): {
  names: string[] | null;
  body: string;
} {
  const s = raw;
  if (!s.startsWith(FILE_NAMES_HEADER_PREFIX)) return { names: null, body: s };
  const end = s.indexOf('*/');
  if (end < 0) return { names: null, body: s };
  const jsonPart = s.slice(FILE_NAMES_HEADER_PREFIX.length, end);
  try {
    const parsed: unknown = JSON.parse(jsonPart);
    if (!Array.isArray(parsed)) return { names: null, body: s };
    const names = parsed
      .slice(0, DEV_STAGE_FILE_MAX_COUNT)
      .map((x) => sanitizeFileName(String(x ?? '')));
    return { names, body: s.slice(end + 2) };
  } catch {
    return { names: null, body: s };
  }
}

function coerceItem(entry: unknown): DevStageFileItem | null {
  if (typeof entry === 'string') {
    const url = entry.trim();
    if (!url.startsWith('data:')) return null;
    return { url, name: '' };
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const o = entry as Record<string, unknown>;
  const name = sanitizeFileName(String(o.name ?? o.fileName ?? o.filename ?? ''));
  if (o.deferred === true) {
    return { url: '', name, deferred: true };
  }
  const url = String(o.url ?? o.dataUrl ?? '').trim();
  if (!url.startsWith('data:')) return null;
  return { url, name };
}

function coerceList(raw: unknown[]): DevStageFileItem[] {
  const out: DevStageFileItem[] = [];
  for (const entry of raw) {
    const item = coerceItem(entry);
    if (item) out.push(item);
    if (out.length >= DEV_STAGE_FILE_MAX_COUNT) break;
  }
  return out;
}

function parseBody(body: string): DevStageFileItem[] {
  const s = body.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return coerceList(parsed);
    } catch {
      /* fall through */
    }
  }
  if (s.startsWith('data:')) return [{ url: s, name: '' }];
  return [];
}

function applyHeaderNames(items: DevStageFileItem[], names: string[] | null): DevStageFileItem[] {
  if (!names || names.length === 0) return items;
  return items.map((it, i) => ({
    ...it,
    name: it.name || names[i] || '',
  }));
}

/** 解析为带文件名的条目列表（兼容裸 data URL / URL 数组 / {url,name} / deferred stub / 文件名头） */
export function parseDevStageFileItems(raw: unknown): DevStageFileItem[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return coerceList(raw);
  if (typeof raw !== 'string') return [];
  const s = raw.trim();
  if (!s) return [];
  const { names, body } = peelDevStageFileNamesHeader(s);
  const items = parseBody(body);
  if (items.length > 0) return applyHeaderNames(items, names);
  // 仅头或 LEFT 截断：用 names 生成 deferred 项
  if (names && names.length > 0) {
    return names.map((name, idx) => ({
      url: '',
      name: name || `附件${idx + 1}`,
      deferred: true as const,
    }));
  }
  return [];
}

export function parseDevStageFileUrls(raw: unknown): string[] {
  return parseDevStageFileItems(raw)
    .filter((i) => i.url.startsWith('data:'))
    .map((i) => i.url);
}

/** 是否含有延迟下发的文件项（详情剥离后） */
export function hasDevStageFileDeferred(raw: unknown): boolean {
  return parseDevStageFileItems(raw).some((i) => i.deferred === true);
}

/** 是否有可立即使用的 data URL 文件体 */
export function hasDevStageFilePayload(raw: unknown): boolean {
  return parseDevStageFileItems(raw).some((i) => i.url.startsWith('data:'));
}

function stubsFromNames(names: string[]): string {
  return JSON.stringify(
    names.map((n, idx) => ({
      name: n || `附件${idx + 1}`,
      deferred: true as const,
    })),
  );
}

/**
 * 剥离文件本体，仅保留文件名元数据 stub，供款式详情 GET 减负。
 * 空值原样返回空串。
 */
export function stripDevStageFilePayloads(raw: unknown): string {
  const items = parseDevStageFileItems(raw);
  if (items.length === 0) return '';
  return stubsFromNames(items.map((i) => i.name));
}

/**
 * 由 SQL LEFT(value, N) 得到的短前缀生成 deferred stub（不要求完整 JSON / data URL）。
 * 优先读文件名头；否则尝试从前缀里捞 "name"；再否则占位「附件1」。
 */
export function stubDevStageFileValueFromHead(head: unknown): string {
  if (head == null) return '';
  const s = String(head);
  if (!s.trim()) return '';

  const { names, body } = peelDevStageFileNamesHeader(s.trim());
  if (names && names.length > 0) return stubsFromNames(names);

  const found: string[] = [];
  const re = /"name"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) && found.length < DEV_STAGE_FILE_MAX_COUNT) {
    try {
      found.push(sanitizeFileName(JSON.parse(`"${m[1]}"`) as string));
    } catch {
      found.push(sanitizeFileName(m[1]!.replace(/\\"/g, '"')));
    }
  }
  if (found.length > 0) return stubsFromNames(found);

  const probe = body.trim() || s.trim();
  if (probe.startsWith('data:') || probe.startsWith('[') || /data:/i.test(s)) {
    return stubsFromNames(['']);
  }
  return '';
}

/** 序列化：前置文件名头 + 本体；便于详情只读 LEFT(value) 取名 */
export function serializeDevStageFileItems(items: DevStageFileItem[]): string {
  const list = items
    .filter((i) => typeof i?.url === 'string' && i.url.trim().startsWith('data:'))
    .map((i) => ({
      url: i.url.trim(),
      name: sanitizeFileName(i.name ?? ''),
    }))
    .slice(0, DEV_STAGE_FILE_MAX_COUNT);
  if (list.length === 0) return '';
  const names = list.map((i) => i.name);
  const header = `${FILE_NAMES_HEADER_PREFIX}${JSON.stringify(names)}*/`;
  const anyName = list.some((i) => i.name);
  if (!anyName && list.length === 1) return `${header}${list[0]!.url}`;
  if (!anyName) return `${header}${JSON.stringify(list.map((i) => i.url))}`;
  // name 在前，利于无文件头的旧 LEFT 兜底
  return `${header}${JSON.stringify(list.map((i) => ({ name: i.name, url: i.url })))}`;
}

/** @deprecated 优先用 serializeDevStageFileItems；无文件名时兼容旧调用 */
export function serializeDevStageFileUrls(urls: string[]): string {
  return serializeDevStageFileItems(urls.map((url) => ({ url, name: '' })));
}

export function isDevStageFileValueFilled(raw: unknown): boolean {
  return parseDevStageFileItems(raw).length > 0;
}

export function listDevStageImageUrls(raw: unknown): string[] {
  return parseDevStageFileUrls(raw).filter((u) => u.startsWith('data:image/'));
}

/** 下载用文件名：优先原始名，否则字段标签 + 序号 */
export function resolveDevStageFileDownloadName(
  item: DevStageFileItem,
  fallbackLabel: string,
  index = 0,
): string {
  if (item.name) return item.name;
  const label = (fallbackLabel || '附件').trim() || '附件';
  const ext = item.url.startsWith('data:') ? extFromDataUrl(item.url) : 'bin';
  return `${label}-${index + 1}.${ext}`;
}
