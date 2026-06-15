/**
 * 资料库 Tiptap 正文 HTML 消毒白名单（前后端共用配置）。
 */

export const KNOWLEDGE_HTML_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'del', 'span', 'mark',
  'h1', 'h2', 'h3',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'pre', 'code',
  'hr', 'a', 'img',
  'div',
] as const;

export const KNOWLEDGE_HTML_ALLOWED_ATTR = [
  'href', 'target', 'rel',
  'src', 'alt', 'title', 'width', 'height',
  'colspan', 'rowspan',
  'data-type', 'data-checked',
  'class', 'style',
] as const;
