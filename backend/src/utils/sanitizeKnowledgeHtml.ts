import DOMPurify from 'isomorphic-dompurify';
import {
  KNOWLEDGE_HTML_ALLOWED_ATTR,
  KNOWLEDGE_HTML_ALLOWED_TAGS,
} from '../../../shared/knowledgeHtml.js';
import {
  isAllowedKnowledgeExternalUrl,
  normalizeKnowledgeExternalUrl,
} from '../../../shared/knowledgeLinkUrl.js';

let hrefSanitizeHookInstalled = false;

function ensureHrefSanitizeHook(): void {
  if (hrefSanitizeHookInstalled) return;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName !== 'href' || node.tagName !== 'A') return;
    const raw = String(data.attrValue ?? '');
    if (!isAllowedKnowledgeExternalUrl(raw)) {
      data.keepAttr = false;
      return;
    }
    data.attrValue = normalizeKnowledgeExternalUrl(raw);
  });
  hrefSanitizeHookInstalled = true;
}

export function sanitizeKnowledgeHtml(html: string): string {
  if (!html) return '';
  ensureHrefSanitizeHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...KNOWLEDGE_HTML_ALLOWED_TAGS],
    ALLOWED_ATTR: [...KNOWLEDGE_HTML_ALLOWED_ATTR],
  });
}
