import { describe, it, expect } from 'vitest';
import {
  isProcessSequential,
  buildOutOfSequenceTemplateIds,
  findGatingPredecessorIndex,
} from './processSequence';

describe('isProcessSequential', () => {
  it('free 模式恒不受顺序约束', () => {
    expect(isProcessSequential('free', 'n1', new Set(['n2']))).toBe(false);
    expect(isProcessSequential('free', 'n1')).toBe(false);
  });

  it('sequential 模式下未脱链工序受约束', () => {
    expect(isProcessSequential('sequential', 'n1', new Set(['n2']))).toBe(true);
    expect(isProcessSequential('sequential', 'n1')).toBe(true);
    expect(isProcessSequential('sequential', 'n1', new Set())).toBe(true);
  });

  it('sequential 模式下脱链工序不受约束', () => {
    expect(isProcessSequential('sequential', 'n2', new Set(['n2']))).toBe(false);
  });

  it('nodeId 缺失时按受约束处理', () => {
    expect(isProcessSequential('sequential', undefined, new Set(['n2']))).toBe(true);
  });
});

describe('findGatingPredecessorIndex', () => {
  const oos = new Set(['n1', 'n3']);

  it('首道返回 -1', () => {
    expect(findGatingPredecessorIndex(['n1', 'n2'], 0, oos)).toBe(-1);
  });

  it('紧邻前道脱链时跳过，返回 -1（按总量放开）', () => {
    expect(findGatingPredecessorIndex(['n1', 'n2'], 1, oos)).toBe(-1);
  });

  it('连续脱链后第一道按顺序工序仍返回 -1', () => {
    expect(findGatingPredecessorIndex(['n1', 'n3', 'n4'], 2, oos)).toBe(-1);
  });

  it('跳过中间脱链工序，gate 在最近上游按顺序工序', () => {
    expect(findGatingPredecessorIndex(['n0', 'n3', 'n4'], 2, oos)).toBe(0);
  });

  it('纯按顺序链退化为 idx-1', () => {
    expect(findGatingPredecessorIndex(['a', 'b', 'c'], 2, new Set())).toBe(1);
    expect(findGatingPredecessorIndex(['a', 'b', 'c'], 2)).toBe(1);
  });

  it('横机(不按顺序)→套口→缩绒：套口 gateIdx=-1，缩绒 gateIdx=1', () => {
    const ids = ['hengji', 'taokou', 'suorong'];
    const set = new Set(['hengji']);
    expect(findGatingPredecessorIndex(ids, 1, set)).toBe(-1);
    expect(findGatingPredecessorIndex(ids, 2, set)).toBe(1);
  });

  it('横机(按顺序)→套口(不按顺序)→缩绒：缩绒 gate 在横机', () => {
    const ids = ['hengji', 'taokou', 'suorong'];
    const set = new Set(['taokou']);
    expect(findGatingPredecessorIndex(ids, 2, set)).toBe(0);
  });
});

describe('buildOutOfSequenceTemplateIds', () => {
  it('仅收集开启 allowOutOfSequence 的工序 id', () => {
    const set = buildOutOfSequenceTemplateIds([
      { id: 'a', allowOutOfSequence: true },
      { id: 'b', allowOutOfSequence: false },
      { id: 'c' },
      { id: 'd', allowOutOfSequence: null },
      { id: 'e', allowOutOfSequence: true },
    ]);
    expect(set.has('a')).toBe(true);
    expect(set.has('e')).toBe(true);
    expect(set.has('b')).toBe(false);
    expect(set.has('c')).toBe(false);
    expect(set.has('d')).toBe(false);
    expect(set.size).toBe(2);
  });

  it('空列表返回空集合', () => {
    expect(buildOutOfSequenceTemplateIds([]).size).toBe(0);
  });
});
