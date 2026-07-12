import { describe, it, expect } from 'vitest';
import {
  defaultPlanEntryDate,
  hydratePlanEntryDate,
  planEntryDateToCreatedAt,
  planEntryDatetimeToCreatedAt,
  defaultEntryDatetimeLocal,
  hydrateEntryDatetimeLocal,
  entryDatetimeLocalToTimestamp,
  psiEntryTimestampsFromDate,
  psiEntryTimestampsFromDatetime,
} from './docEntryTime';

describe('docEntryTime (plan pilot)', () => {
  it('defaultPlanEntryDate 返回 YYYY-MM-DD', () => {
    expect(defaultPlanEntryDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('hydratePlanEntryDate 从 ISO 回填本地日历日', () => {
    expect(hydratePlanEntryDate('2026-04-21T00:00:00.000Z')).toBe('2026-04-21');
    expect(hydratePlanEntryDate('2026-05-01')).toBe('2026-05-01');
  });

  it('planEntryDateToCreatedAt 将 YMD 转为本地 0 点 ISO', () => {
    const iso = planEntryDateToCreatedAt('2026-04-21');
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('空入单日期回落为今天', () => {
    const iso = planEntryDateToCreatedAt('');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(iso).getTime()).toBeGreaterThan(0);
  });

  it('planEntryDatetimeToCreatedAt 保留时刻', () => {
    const iso = planEntryDatetimeToCreatedAt('2026-04-21T14:30');
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe('docEntryTime (datetime + PSI)', () => {
  it('defaultEntryDatetimeLocal 为 datetime-local 格式', () => {
    expect(defaultEntryDatetimeLocal()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('entryDatetimeLocalToTimestamp 输出 yyyy-MM-dd HH:mm', () => {
    const out = entryDatetimeLocalToTimestamp('2026-04-21T14:30');
    expect(out).toBe('2026-04-21 14:30');
  });

  it('psiEntryTimestampsFromDate 同步 createdAt 与 timestamp', () => {
    const { createdAt, timestamp } = psiEntryTimestampsFromDate('2026-05-01');
    expect(createdAt).toBe(timestamp);
    const d = new Date(createdAt);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(1);
  });

  it('hydrateEntryDatetimeLocal 从 ISO 回填', () => {
    const local = hydrateEntryDatetimeLocal('2026-04-21T06:30:00.000Z');
    expect(local).toMatch(/^2026-04-21T\d{2}:\d{2}$/);
  });

  it('psiEntryTimestampsFromDatetime 保留时刻并输出业务 timestamp', () => {
    const { createdAt, timestamp } = psiEntryTimestampsFromDatetime('2026-05-01T09:15');
    expect(timestamp).toBe('2026-05-01 09:15');
    const d = new Date(createdAt);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(15);
  });
});
