import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env.js', () => ({
  env: {
    WX_MINI_APPID: 'wx_test_appid',
    WX_MINI_SECRET: 'wx_test_secret',
  },
}));

describe('wechat code2Session', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns openid and sessionKey on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        openid: 'oTEST_OPENID',
        session_key: 'sess_key',
        unionid: 'uTEST_UNION',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { code2Session } = await import('../src/lib/wechat.js');
    const session = await code2Session('js_code_ok');
    expect(session).toEqual({
      openid: 'oTEST_OPENID',
      sessionKey: 'sess_key',
      unionid: 'uTEST_UNION',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('appid=wx_test_appid');
    expect(url).toContain('js_code=js_code_ok');
  });

  it('throws WECHAT_CODE_INVALID when WeChat returns errcode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ errcode: 40029, errmsg: 'invalid code' }),
      }),
    );
    const { code2Session } = await import('../src/lib/wechat.js');
    await expect(code2Session('bad')).rejects.toMatchObject({
      statusCode: 401,
      code: 'WECHAT_CODE_INVALID',
    });
  });

  it('throws on empty code', async () => {
    const { code2Session } = await import('../src/lib/wechat.js');
    await expect(code2Session('  ')).rejects.toMatchObject({ statusCode: 400 });
  });
});
