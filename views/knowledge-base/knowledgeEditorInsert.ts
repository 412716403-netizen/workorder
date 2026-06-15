import type { Editor } from '@tiptap/core';
import { normalizeKnowledgeExternalUrl } from '../../shared/knowledgeLinkUrl';

/** 在光标处（或替换选区）插入外部超链接 */
export function insertKnowledgeExternalLink(
  editor: Editor,
  text: string,
  href: string,
): void {
  const normalized = normalizeKnowledgeExternalUrl(href);
  const { empty } = editor.state.selection;
  const chain = editor.chain().focus();
  if (!empty) {
    chain.deleteSelection();
  }
  chain
    .insertContent({
      type: 'text',
      text,
      marks: [{ type: 'link', attrs: { href: normalized } }],
    })
    .run();
}
