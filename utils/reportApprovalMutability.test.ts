import { describe, expect, it } from 'vitest';
import {
  ReportApprovalStatus,
  REPORT_NO_PREFIX,
  WORKER_SELF_REPORT_NO_PREFIX,
  reportAllowsEditDelete,
} from '../types';

describe('reportAllowsEditDelete', () => {
  it('allows PENDING and legacy missing status', () => {
    expect(reportAllowsEditDelete(ReportApprovalStatus.PENDING)).toBe(true);
    expect(reportAllowsEditDelete(undefined)).toBe(true);
    expect(reportAllowsEditDelete(null)).toBe(true);
  });

  it('blocks REJECTED', () => {
    expect(reportAllowsEditDelete(ReportApprovalStatus.REJECTED, `${WORKER_SELF_REPORT_NO_PREFIX}20260709-0001`)).toBe(false);
    expect(reportAllowsEditDelete(ReportApprovalStatus.REJECTED, `${REPORT_NO_PREFIX}20260709-0001`)).toBe(false);
  });

  it('blocks approved worker self-report (ZBG)', () => {
    expect(
      reportAllowsEditDelete(
        ReportApprovalStatus.APPROVED,
        `${WORKER_SELF_REPORT_NO_PREFIX}20260709-0001`,
      ),
    ).toBe(false);
  });

  it('allows approved instant order-center report (BG)', () => {
    expect(
      reportAllowsEditDelete(
        ReportApprovalStatus.APPROVED,
        `${REPORT_NO_PREFIX}20260709-0001`,
      ),
    ).toBe(true);
  });
});
