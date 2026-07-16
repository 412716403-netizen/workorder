/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  formatKnowledgeProductRefLabel,
  resolveKnowledgeEditorProductRefId,
} from './knowledgeEditorProductRef';

describe('formatKnowledgeProductRefLabel', () => {
  it('名称 + 货号', () => {
    expect(formatKnowledgeProductRefLabel({ name: '上衣', sku: 'A01' })).toBe('上衣（A01）');
  });

  it('无货号仅名称', () => {
    expect(formatKnowledgeProductRefLabel({ name: '上衣', sku: '' })).toBe('上衣');
  });

  it('空名称回退', () => {
    expect(formatKnowledgeProductRefLabel({ name: '', sku: 'S1' })).toBe('未命名产品（S1）');
  });
});

describe('resolveKnowledgeEditorProductRefId', () => {
  it('解析关联产品节点', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p><span data-type="product-ref" data-product-id="p1" class="kb-product-ref">上衣（A01）</span></p>';
    const chip = root.querySelector('[data-type="product-ref"]')!;
    expect(resolveKnowledgeEditorProductRefId(chip, root)).toBe('p1');
  });

  it('非产品节点返回 null', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>普通文字</p>';
    expect(resolveKnowledgeEditorProductRefId(root.querySelector('p')!, root)).toBeNull();
  });
});
