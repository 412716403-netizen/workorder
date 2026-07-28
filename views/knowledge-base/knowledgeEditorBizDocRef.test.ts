/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { KnowledgeBizDocKind } from '../../shared/types';
import {
  formatKnowledgeBizDocRefLabel,
  resolveKnowledgeEditorBizDocRef,
} from './knowledgeEditorBizDocRef';

describe('formatKnowledgeBizDocRefLabel', () => {
  it('拼接种类与单号', () => {
    expect(formatKnowledgeBizDocRefLabel(KnowledgeBizDocKind.PLAN, 'JH-001')).toBe('生产计划 JH-001');
    expect(formatKnowledgeBizDocRefLabel(KnowledgeBizDocKind.PURCHASE_BILL, 'CGRK-1')).toBe('采购入库 CGRK-1');
    expect(formatKnowledgeBizDocRefLabel(KnowledgeBizDocKind.SALES_BILL, 'XS-1')).toBe('销售单 XS-1');
  });

  it('无单号时仅种类', () => {
    expect(formatKnowledgeBizDocRefLabel(KnowledgeBizDocKind.PLAN, '')).toBe('生产计划');
  });
});

describe('resolveKnowledgeEditorBizDocRef', () => {
  it('从芯片解析 PLAN', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><span data-type="biz-doc-ref" data-doc-kind="PLAN" data-doc-id="p1" data-doc-number="JH-1" class="kb-biz-doc-ref">生产计划 JH-1</span></p>';
    const chip = root.querySelector('.kb-biz-doc-ref')!;
    expect(resolveKnowledgeEditorBizDocRef(chip, root)).toEqual({
      docKind: KnowledgeBizDocKind.PLAN,
      docId: 'p1',
      docNumber: 'JH-1',
    });
  });

  it('PSI 单据可不带 docId', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<span data-type="biz-doc-ref" data-doc-kind="PURCHASE_BILL" data-doc-number="PB-1" class="kb-biz-doc-ref">采购入库 PB-1</span>';
    const chip = root.querySelector('.kb-biz-doc-ref')!;
    expect(resolveKnowledgeEditorBizDocRef(chip, root)).toEqual({
      docKind: KnowledgeBizDocKind.PURCHASE_BILL,
      docId: '',
      docNumber: 'PB-1',
    });
  });

  it('PLAN 缺 docId 时返回 null', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<span data-type="biz-doc-ref" data-doc-kind="PLAN" data-doc-number="JH-1" class="kb-biz-doc-ref">x</span>';
    const chip = root.querySelector('.kb-biz-doc-ref')!;
    expect(resolveKnowledgeEditorBizDocRef(chip, root)).toBeNull();
  });

  it('点击目标在 root 外返回 null', () => {
    const root = document.createElement('div');
    const other = document.createElement('span');
    other.setAttribute('data-type', 'biz-doc-ref');
    other.setAttribute('data-doc-kind', 'SALES_BILL');
    other.setAttribute('data-doc-number', 'SB-1');
    expect(resolveKnowledgeEditorBizDocRef(other, root)).toBeNull();
  });
});
