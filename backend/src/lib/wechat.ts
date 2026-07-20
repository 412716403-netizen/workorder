import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

export type WechatMiniSession = {
  openid: string;
  unionid?: string;
  sessionKey: string;
};

type Code2SessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export function isWechatMiniConfigured(): boolean {
  return Boolean(env.WX_MINI_APPID && env.WX_MINI_SECRET);
}

export function assertWechatMiniConfigured(): void {
  if (!isWechatMiniConfigured()) {
    throw new AppError(503, '微信登录未配置，请联系管理员或使用账号密码登录', 'WECHAT_NOT_CONFIGURED');
  }
}

/**
 * 用 wx.login 得到的 code 换取 openid（服务端调用微信 jscode2session）。
 * @see https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
 */
export async function code2Session(code: string): Promise<WechatMiniSession> {
  assertWechatMiniConfigured();
  const trimmed = code.trim();
  if (!trimmed) throw new AppError(400, '缺少微信登录 code');

  const params = new URLSearchParams({
    appid: env.WX_MINI_APPID!,
    secret: env.WX_MINI_SECRET!,
    js_code: trimmed,
    grant_type: 'authorization_code',
  });
  const url = `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`;

  let data: Code2SessionResponse;
  try {
    const res = await fetch(url);
    data = (await res.json()) as Code2SessionResponse;
  } catch {
    throw new AppError(502, '无法连接微信服务器，请稍后重试', 'WECHAT_UPSTREAM');
  }

  if (data.errcode && data.errcode !== 0) {
    const msg = data.errmsg || `微信登录失败(${data.errcode})`;
    // 40029 invalid code / 40163 code been used — 客户端可重新 wx.login
    throw new AppError(401, msg, 'WECHAT_CODE_INVALID');
  }
  if (!data.openid || !data.session_key) {
    throw new AppError(502, '微信返回数据异常', 'WECHAT_UPSTREAM');
  }

  return {
    openid: data.openid,
    sessionKey: data.session_key,
    unionid: data.unionid || undefined,
  };
}
