import { describe, it, expect } from 'vitest';
import { generateNextReportNo } from './reportNoGen';
import { toLocalCompactYmd } from './localDateTime';

const TODAY = new Date('2026-05-16T10:30:00');
const todayStr = toLocalCompactYmd(TODAY);
const yesterday = new Date('2026-05-15T10:30:00');

const mkOrder = (reports: { id: string; reportBatchId?: string | null; reportNo?: string | null; timestamp: Date }[]) => ({
  milestones: [{ id: 'm1', reports }],
}) as unknown as Parameters<typeof generateNextReportNo>[0][number];

const mkProgress = (reports: { id: string; reportBatchId?: string | null; reportNo?: string | null; timestamp: Date }[]) => ({
  reports,
}) as unknown as Parameters<typeof generateNextReportNo>[1][number];

describe('generateNextReportNo', () => {
  it('当日无任何报工 → BG{today}-0001', () => {
    expect(generateNextReportNo([], [], TODAY)).toBe(`BG${todayStr}-0001`);
  });

  it('同一个 reportBatchId 的多条记录算 1 个批次', () => {
    const orders = [mkOrder([
      { id: 'r1', reportBatchId: 'B1', timestamp: TODAY },
      { id: 'r2', reportBatchId: 'B1', timestamp: TODAY },
      { id: 'r3', reportBatchId: 'B1', timestamp: TODAY },
    ])];
    expect(generateNextReportNo(orders, [], TODAY)).toBe(`BG${todayStr}-0002`);
  });

  it('多批次 + 产品维度报工合并去重', () => {
    const orders = [mkOrder([
      { id: 'r1', reportBatchId: 'B1', timestamp: TODAY },
      { id: 'r2', reportBatchId: 'B2', timestamp: TODAY },
    ])];
    const progresses = [mkProgress([
      { id: 'r3', reportBatchId: 'B2', timestamp: TODAY }, // 与 r2 同批次
      { id: 'r4', reportBatchId: 'B3', timestamp: TODAY },
    ])];
    expect(generateNextReportNo(orders, progresses, TODAY)).toBe(`BG${todayStr}-0004`);
  });

  it('跨天的报工不计入今日流水', () => {
    const orders = [mkOrder([
      { id: 'r-yest', reportBatchId: 'BY', timestamp: yesterday },
      { id: 'r-now', reportBatchId: 'BN', timestamp: TODAY },
    ])];
    expect(generateNextReportNo(orders, [], TODAY)).toBe(`BG${todayStr}-0002`);
  });

  it('reportBatchId 缺失时退化用 reportNo / id 去重', () => {
    const orders = [mkOrder([
      { id: 'r1', reportNo: 'N1', timestamp: TODAY },
      { id: 'r2', reportNo: 'N1', timestamp: TODAY }, // 与 r1 同 reportNo
      { id: 'r3', timestamp: TODAY },
    ])];
    expect(generateNextReportNo(orders, [], TODAY)).toBe(`BG${todayStr}-0003`);
  });

  it('编号格式始终为 BG + 8 位日期 + - + 4 位流水', () => {
    const out = generateNextReportNo([], [], TODAY);
    expect(out).toMatch(/^BG\d{8}-\d{4}$/);
  });
});
