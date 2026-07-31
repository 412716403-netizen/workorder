import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../src/config/env.js', () => ({
  env: {
    WX_MP_APPID: 'wx_mp_appid',
    WX_MP_SECRET: 'wx_mp_secret',
    WX_MP_TOKEN: 'test_token',
    WX_MINI_APPID: 'wx_mini_appid',
  },
}));

describe('verifyMpSignature', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('accepts valid signature', async () => {
    const { verifyMpSignature } = await import('../src/lib/wechatMp.js');
    const timestamp = '1710000000';
    const nonce = 'nonce123';
    const raw = ['test_token', timestamp, nonce].sort().join('');
    const signature = createHash('sha1').update(raw).digest('hex');
    expect(verifyMpSignature({ signature, timestamp, nonce })).toBe(true);
  });

  it('rejects invalid signature', async () => {
    const { verifyMpSignature } = await import('../src/lib/wechatMp.js');
    expect(
      verifyMpSignature({ signature: 'bad', timestamp: '1', nonce: '2' }),
    ).toBe(false);
  });
});
