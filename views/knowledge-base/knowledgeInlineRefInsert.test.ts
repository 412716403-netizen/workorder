/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import { KnowledgeProductRef } from './knowledgeProductRefExtension';
import { KnowledgeDocumentRef } from './knowledgeDocumentRefExtension';
import { KnowledgeTableCell, KnowledgeTableHeader } from './knowledgeTableCellExtensions';

function createEditor(content: string, withTable = false) {
  return new Editor({
    extensions: [
      StarterKit,
      ...(withTable
        ? [
            Table.configure({ resizable: false }),
            TableRow,
            KnowledgeTableHeader,
            KnowledgeTableCell,
          ]
        : []),
      KnowledgeProductRef,
      KnowledgeDocumentRef,
    ],
    content,
  });
}

describe('insertProductRef / insertDocumentRef inline', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('关联产品插在当前段内，不另起段落', () => {
    editor = createEditor('<p>前缀</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertProductRef({ productId: 'p1', label: '上衣' });
    const html = editor.getHTML();
    expect(html).toContain('data-type="product-ref"');
    expect(html).toMatch(/<p[^>]*>.*product-ref.*<\/p>/);
    // 不应变成两个段落（前缀一段 + 芯片一段）
    expect(html.match(/<p[\s>]/g)?.length ?? 0).toBe(1);
  });

  it('关联文档同样内联插入', () => {
    editor = createEditor('<p>说明</p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertDocumentRef({ documentId: 'd1', label: '工艺单' });
    const html = editor.getHTML();
    expect(html).toContain('data-type="document-ref"');
    expect(html.match(/<p[\s>]/g)?.length ?? 0).toBe(1);
  });

  it('表格单元格内关联产品不另起段落', () => {
    editor = createEditor(
      '<table><tr><td><p>前缀</p></td></tr></table>',
      true,
    );
    // 光标放到单元格段落末尾
    let targetPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '前缀') {
        targetPos = pos + node.nodeSize - 1;
        return false;
      }
      return undefined;
    });
    expect(targetPos).not.toBeNull();
    editor.commands.setTextSelection(targetPos!);
    editor.commands.insertProductRef({ productId: 'p1', label: '上衣' });
    const html = editor.getHTML();
    expect(html).toContain('data-type="product-ref"');
    // 单元格内仍只有一个 p（前缀与芯片同段）
    const cellMatch = html.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    expect(cellMatch?.[1].match(/<p[\s>]/g)?.length ?? 0).toBe(1);
    expect(cellMatch?.[1]).toMatch(/前缀[\s\S]*product-ref/);
  });
});
