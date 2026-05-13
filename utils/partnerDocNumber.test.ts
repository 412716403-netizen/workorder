import { describe, expect, it } from 'vitest';
import type { Partner } from '../types';
import { nextOutsourceDocNumber } from './partnerDocNumber';

describe('nextOutsourceDocNumber', () => {
  const partners: Partner[] = [
    { id: 'p1', name: '测试厂', contact: '', partnerListNo: 2 },
  ];

  it('发出单号：即使历史 WX 行已为已收回也占用序号，避免重号', () => {
    const records = [
      {
        type: 'OUTSOURCE' as const,
        partner: '测试厂',
        docNo: 'WX-0002-001',
        status: '已收回' as const,
      },
    ];
    expect(nextOutsourceDocNumber('dispatch', partners, records, '', '测试厂')).toBe('WX-0002-002');
  });

  it('收回单号：不按状态排除，同前缀下连续递增', () => {
    const records = [
      {
        type: 'OUTSOURCE' as const,
        partner: '测试厂',
        docNo: 'WR-0002-001',
        status: '加工中' as const,
      },
    ];
    expect(nextOutsourceDocNumber('receive', partners, records, '', '测试厂')).toBe('WR-0002-002');
  });
});
