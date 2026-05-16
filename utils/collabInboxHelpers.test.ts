import { describe, it, expect } from 'vitest';
import { peerBindingsForTransfer, firstOrDefault, sumItems } from './collabInboxHelpers';

describe('sumItems', () => {
  it('null / undefined / 非数组 → 0', () => {
    expect(sumItems(null)).toBe(0);
    expect(sumItems(undefined)).toBe(0);
  });
  it('空数组 → 0', () => {
    expect(sumItems([])).toBe(0);
  });
  it('累加 quantity，无效项视为 0', () => {
    expect(sumItems([{ quantity: 1 }, { quantity: 2 }, { quantity: 'abc' }, { quantity: null }])).toBe(3);
  });
  it('字符串数字也会累加', () => {
    expect(sumItems([{ quantity: '2.5' }, { quantity: '1.5' }])).toBe(4);
  });
});

describe('firstOrDefault', () => {
  it('空 → undefined', () => {
    expect(firstOrDefault([], () => true)).toBeUndefined();
  });
  it('返回首个匹配', () => {
    expect(firstOrDefault([1, 2, 3, 4], n => n > 2)).toBe(3);
  });
  it('无匹配 → undefined', () => {
    expect(firstOrDefault([1, 2, 3], n => n > 100)).toBeUndefined();
  });
});

describe('peerBindingsForTransfer', () => {
  it('transfer 空 → []', () => {
    expect(peerBindingsForTransfer(null, 'me')).toEqual([]);
    expect(peerBindingsForTransfer(undefined, 'me')).toEqual([]);
  });

  it('无 myTenantId：receiver = sender → []', () => {
    expect(peerBindingsForTransfer(
      { senderTenantId: 'A', receiverTenantId: 'A' },
      null,
    )).toEqual([]);
  });

  it('无 myTenantId：返回唯一对端 + 全 kind', () => {
    const out = peerBindingsForTransfer(
      { senderTenantId: 'A', receiverTenantId: 'B' },
      null,
    );
    expect(out).toHaveLength(1);
    expect(out[0].peerTenantId).toBe('B');
    expect(out[0].kinds).toEqual(new Set(['dispatch', 'return', 'forward']));
  });

  it('普通派发（无链）：对端 = 另一方', () => {
    const out = peerBindingsForTransfer(
      { senderTenantId: 'A', receiverTenantId: 'B' },
      'B',
    );
    expect(out).toEqual([{ peerTenantId: 'A', kinds: new Set(['dispatch', 'return', 'forward']) }]);
  });

  it('普通派发：peer 等于我 → []', () => {
    expect(peerBindingsForTransfer(
      { senderTenantId: 'A', receiverTenantId: 'A' },
      'A',
    )).toEqual([]);
  });

  it('转发链 + 我是 origin：返回上游 forward + 当前 receiver dispatch/return', () => {
    const out = peerBindingsForTransfer(
      {
        senderTenantId: 'A',
        receiverTenantId: 'C',
        originTenantId: 'A',
        chainStep: 1,
        outsourceRouteSnapshot: [
          { stepOrder: 0, receiverTenantId: 'B' },
          { stepOrder: 1, receiverTenantId: 'C' },
        ],
      },
      'A',
    );
    expect(out).toHaveLength(2);
    const byPeer = Object.fromEntries(out.map(o => [o.peerTenantId, o.kinds]));
    expect(byPeer['B']).toEqual(new Set(['forward']));
    expect(byPeer['C']).toEqual(new Set(['dispatch', 'return']));
  });
});
