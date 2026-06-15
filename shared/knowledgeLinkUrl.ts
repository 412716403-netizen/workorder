/** 资料库外链允许的 URL 协议 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** 规范化用户输入的外部链接（无协议时默认 https） */
export function normalizeKnowledgeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^mailto:/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** 是否为允许保存/打开的外部链接 */
export function isAllowedKnowledgeExternalUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withProtocol);
    return ALLOWED_PROTOCOLS.has(u.protocol.toLowerCase());
  } catch {
    return false;
  }
}
