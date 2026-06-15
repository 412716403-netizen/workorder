/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { collectKnowledgeOutlineFromHtmlRoot } from './knowledgeDocOutline';

describe('collectKnowledgeOutlineFromHtmlRoot', () => {
  it('解析标题并补充元素 id', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h1>概述</h1><h2>细节</h2><p>正文</p>';
    const items = collectKnowledgeOutlineFromHtmlRoot(root);
    expect(items).toHaveLength(2);
    expect(items[0]?.text).toBe('概述');
    expect(items[1]?.level).toBe(2);
    expect(root.querySelector('h1')?.id).toBeTruthy();
  });
});
