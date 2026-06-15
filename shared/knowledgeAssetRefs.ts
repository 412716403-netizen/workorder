/** 从资料库正文 HTML 中提取引用的 asset id（/api/knowledge-base/assets/{id}） */
const ASSET_URL_RE = /\/api\/knowledge-base\/assets\/([a-zA-Z0-9_-]+)/g;

export function extractKnowledgeAssetIdsFromHtml(html: string): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  for (const m of html.matchAll(ASSET_URL_RE)) {
    const id = m[1]?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}
