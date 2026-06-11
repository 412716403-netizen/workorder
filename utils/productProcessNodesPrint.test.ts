import { describe, expect, it } from 'vitest';
import { formatProductProcessNodesText } from './productProcessNodesPrint';

describe('formatProductProcessNodesText', () => {
  it('按 milestoneNodeIds 顺序输出工序名称', () => {
    const text = formatProductProcessNodesText(
      { milestoneNodeIds: ['n2', 'n1', 'n3'] },
      [
        { id: 'n1', name: '套口' },
        { id: 'n2', name: '横机' },
        { id: 'n3', name: '后道' },
      ],
    );
    expect(text).toBe('横机 → 套口 → 后道');
  });

  it('无工序或无法解析时返回空串', () => {
    expect(formatProductProcessNodesText({ milestoneNodeIds: [] }, [])).toBe('');
    expect(formatProductProcessNodesText(undefined, [])).toBe('');
    expect(formatProductProcessNodesText({ milestoneNodeIds: ['missing'] }, [])).toBe('');
  });
});
