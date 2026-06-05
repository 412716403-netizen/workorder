import { describe, expect, it } from 'vitest';
import type { DevSampleDto } from '../types';
import { DevStageStatus } from '../types';
import { stageNamesFromDevSample, stageNamesFromFirstDevSample } from './devStyleVariants';

const mkSample = (name: string, stageNames: string[]): DevSampleDto => ({
  id: `s-${name}`,
  name,
  createdAt: '',
  stages: stageNames.map((n, order) => ({
    id: `st-${name}-${order}`,
    name: n,
    status: DevStageStatus.PENDING,
    order,
    updatedAt: '',
    fields: [],
    attachments: [],
  })),
  logs: [],
});

describe('stageNamesFromFirstDevSample', () => {
  it('uses first sample stage order, not template or last sample', () => {
    const samples = [
      mkSample('头样', ['设计', '制版', '打样']),
      mkSample('二样', ['设计', '评审']),
    ];
    expect(stageNamesFromFirstDevSample(samples)).toEqual(['设计', '制版', '打样']);
  });

  it('returns empty when no samples', () => {
    expect(stageNamesFromFirstDevSample([])).toEqual([]);
  });
});

describe('stageNamesFromDevSample', () => {
  it('sorts by order field', () => {
    const sample = mkSample('头样', ['a', 'b', 'c']);
    sample.stages[0].order = 2;
    sample.stages[1].order = 0;
    sample.stages[2].order = 1;
    expect(stageNamesFromDevSample(sample)).toEqual(['b', 'c', 'a']);
  });
});
