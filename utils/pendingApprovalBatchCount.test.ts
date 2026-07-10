import { describe, expect, it } from 'vitest';
import { countPendingApprovalBatches } from './pendingApprovalBatchCount';

describe('countPendingApprovalBatches', () => {
  it('按 reportBatchId 去重计数', () => {
    const count = countPendingApprovalBatches(
      [
        { reportBatchId: 'b1', reportId: 'r1' },
        { reportBatchId: 'b1', reportId: 'r2' },
        { reportId: 'r3' },
      ],
      [{ reportBatchId: 'b2', reportId: 'r4' }],
    );
    expect(count).toBe(3);
  });

  it('空列表返回 0', () => {
    expect(countPendingApprovalBatches([], [])).toBe(0);
  });
});
