import { describe, expect, it } from 'vitest';
import type { DevSampleDto } from '../types';
import { DevStageStatus } from '../types';
import {
  canDeleteDevSample,
  getDevSampleDeleteBlockReason,
  getDevSampleSidebarProgress,
} from './devStyleDisplay';

type StageSpec = DevStageStatus | { status: DevStageStatus; withData?: boolean };

const sample = (stages: StageSpec[]): DevSampleDto => ({
  id: 's1',
  name: '头样',
  createdAt: '',
  stages: stages.map((spec, order) => {
    const status = typeof spec === 'object' ? spec.status : spec;
    const withData = typeof spec === 'object' ? spec.withData : false;
    return {
      id: `st-${order}`,
      name: `节点${order}`,
      status,
      order,
      updatedAt: '',
      fields: withData ? [{ id: `f-${order}`, label: '说明', value: '已填', type: 'text' }] : [],
      attachments: [],
    };
  }),
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

  it('allows delete when first stage is in_progress but has no entered data', () => {
    expect(
      canDeleteDevSample(sample([DevStageStatus.IN_PROGRESS, DevStageStatus.PENDING])),
    ).toBe(true);
  });

  it('blocks delete when first stage in_progress has entered data', () => {
    expect(
      canDeleteDevSample(
        sample([{ status: DevStageStatus.IN_PROGRESS, withData: true }, DevStageStatus.PENDING]),
      ),
    ).toBe(false);
  });

  it('blocks delete when a started stage is not the first one', () => {
    expect(
      canDeleteDevSample(sample([DevStageStatus.PENDING, DevStageStatus.IN_PROGRESS])),
    ).toBe(false);
  });

  it('blocks delete when first stage completed', () => {
    expect(canDeleteDevSample(sample([DevStageStatus.COMPLETED]))).toBe(false);
  });
});

describe('getDevSampleDeleteBlockReason', () => {
  it('returns reason for nodes with entered data', () => {
    expect(
      getDevSampleDeleteBlockReason(sample([{ status: DevStageStatus.IN_PROGRESS, withData: true }])),
    ).toMatch(/已录入资料/);
  });

  it('allows deleting the only/head sample (款式可回到 0 样品)', () => {
    expect(
      getDevSampleDeleteBlockReason(sample([DevStageStatus.PENDING]), { sampleCount: 1 }),
    ).toBeNull();
  });

  it('returns null when deletable', () => {
    expect(
      getDevSampleDeleteBlockReason(sample([DevStageStatus.PENDING]), { sampleCount: 2 }),
    ).toBeNull();
  });
});
