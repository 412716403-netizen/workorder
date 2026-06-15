/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { resolveKnowledgeEditorImageSrc } from '../views/knowledge-base/knowledgeEditorImageClick';

describe('resolveKnowledgeEditorImageSrc', () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="ProseMirror">
      <div data-node="image"><img src="/api/kb/a.png" alt="" /></div>
      <p><img src="/api/kb/b.png" alt="" /></p>
    </div>
  `;

  it('解析 resizable 图片节点', () => {
    const img = root.querySelector('[data-node="image"] img')!;
    expect(resolveKnowledgeEditorImageSrc(img, root)).toBe('/api/kb/a.png');
  });

  it('解析普通 img', () => {
    const img = root.querySelector('p img')!;
    expect(resolveKnowledgeEditorImageSrc(img, root)).toBe('/api/kb/b.png');
  });

  it('忽略缩放手柄点击', () => {
    const handle = document.createElement('div');
    handle.setAttribute('data-resize-handle', 'bottom-right');
    root.querySelector('[data-node="image"]')!.appendChild(handle);
    expect(resolveKnowledgeEditorImageSrc(handle, root)).toBeNull();
  });
});
