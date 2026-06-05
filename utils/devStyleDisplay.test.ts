import { describe, expect, it } from 'vitest';
import type { DevSampleDto } from '../types';
import { DevStageStatus } from '../types';
import {
  canDeleteDevSample,
  getDevSampleDeleteBlockReason,
  getDevSampleSidebarProgress,
} from './devStyleDisplay';

const sample = (stages: DevStageStatus[]): DevSampleDto => ({
  id: 's1',
  name: '头样',
  createdAt: '',
  stages: stages.map((status, order) => ({
    id: `st-${order}`,
    name: `节点${order}`,
    status,
    order,
    updatedAt: '',
    fields: [],
    attachments: [],
  })),
  logs: [],
});

describe('getDevSampleSidebarProgress', () => {
  it('shows completed when all stages are completed', () => {
    expect(
      getDevSampleSidebarProgress(
        sample([DevStageStatus.COMPLETED, DevStageStatus.COMPLETED]),
      ),
    ).toEqual({ kind: 'completed', label: '已完成' });
  });

  it('prioritizes exception and in_progress over completed', () => {
    expect(
      getDevSampleSidebarProgress(
        sample([DevStageStatus.COMPLETED, DevStageStatus.EXCEPTION]),
      ).kind,
    ).toBe('exception');
    expect(
      getDevSampleSidebarProgress(
        sample([DevStageStatus.COMPLETED, DevStageStatus.IN_PROGRESS]),
      ),
    ).toMatchObject({ kind: 'in_progress', label: '节点1' });
  });

  it('shows pending when no stage has started', () => {
    expect(getDevSampleSidebarProgress(sample([DevStageStatus.PENDING]))).toEqual({
      kind: 'pending',
      label: '待开始',
    });
  });
});

describe('canDeleteDevSample', () => {
  it('allows delete when all stages pending', () => {
    expect(canDeleteDevSample(sample([DevStageStatus.PENDING, DevStageStatus.PENDING]))).toBe(true);
  });

  it('blocks delete when any stage started', () => {
    expect(canDeleteDevSample(sample([DevStageStatus.IN_PROGRESS, DevStageStatus.PENDING]))).toBe(false);
    expect(canDeleteDevSample(sample([DevStageStatus.COMPLETED]))).toBe(false);
  });
});

describe('getDevSampleDeleteBlockReason', () => {
  it('returns reason for started nodes', () => {
    expect(getDevSampleDeleteBlockReason(sample([DevStageStatus.IN_PROGRESS]))).toMatch(/已开始的节点/);
  });

  it('returns reason when only one sample left', () => {
    expect(
      getDevSampleDeleteBlockReason(sample([DevStageStatus.PENDING]), { sampleCount: 1 }),
    ).toMatch(/至少保留一个样品轮次/);
  });

  it('returns null when deletable', () => {
    expect(
      getDevSampleDeleteBlockReason(sample([DevStageStatus.PENDING]), { sampleCount: 2 }),
    ).toBeNull();
  });
});
