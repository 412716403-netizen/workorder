import { describe, expect, it } from 'vitest';
import {
  ReportApprovalStatus,
  REPORT_QTY_OCCUPYING_STATUSES,
  REPORT_APPROVAL_STATUS_LABEL,
} from '../src/types/index.js';

describe('ReportApprovalStatus', () => {
  it('labels cover all statuses', () => {
    expect(REPORT_APPROVAL_STATUS_LABEL[ReportApprovalStatus.PENDING]).toBe('未审核');
    expect(REPORT_APPROVAL_STATUS_LABEL[ReportApprovalStatus.APPROVED]).toBe('已审核');
    expect(REPORT_APPROVAL_STATUS_LABEL[ReportApprovalStatus.REJECTED]).toBe('已驳回');
  });

  it('occupying statuses exclude REJECTED', () => {
    expect(REPORT_QTY_OCCUPYING_STATUSES).toContain(ReportApprovalStatus.APPROVED);
    expect(REPORT_QTY_OCCUPYING_STATUSES).toContain(ReportApprovalStatus.PENDING);
    expect(REPORT_QTY_OCCUPYING_STATUSES).not.toContain(ReportApprovalStatus.REJECTED);
  });

  it('remaining formula: base minus approved minus pending', () => {
    const base = 100;
    const approved = 30;
    const pending = 20;
    const rejected = 10;
    const occupied = approved + pending; // rejected 不占
    expect(base - occupied).toBe(50);
    expect(occupied + rejected).toBe(60); // 驳回后额度回到 70：100-30
    expect(base - approved).toBe(70);
  });
});

describe('reportAllowsEditDelete', () => {
  it('re-exports from shared types', async () => {
    const { reportAllowsEditDelete, ReportApprovalStatus, WORKER_SELF_REPORT_NO_PREFIX } =
      await import('../src/types/index.js');
    expect(reportAllowsEditDelete(ReportApprovalStatus.PENDING)).toBe(true);
    expect(reportAllowsEditDelete(ReportApprovalStatus.REJECTED)).toBe(false);
    expect(
      reportAllowsEditDelete(ReportApprovalStatus.APPROVED, `${WORKER_SELF_REPORT_NO_PREFIX}20260709-0001`),
    ).toBe(false);
  });
});
