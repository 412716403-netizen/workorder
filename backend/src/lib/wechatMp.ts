import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { redisGet, redisSetEx, redisSetNxEx } from './redis.js';

const STABLE_TOKEN_CACHE_KEY = 'wx:mp:stable_token';
const STABLE_TOKEN_TTL_SEC = 7000;
const STABLE_TOKEN_LOCK_KEY = 'wx:mp:stable_token:lock';

type StableTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type QrcodeCreateResponse = {
  ticket?: string;
  expire_seconds?: number;
  url?: string;
  errcode?: number;
  errmsg?: string;
};

type TemplateSendResponse = {
  errcode?: number;
  errmsg?: string;
  msgid?: number;
};

let memoryToken: { value: string; expiresAt: number } | null = null;

export function isWechatMpConfigured(): boolean {
  return Boolean(env.WX_MP_APPID && env.WX_MP_SECRET && env.WX_MP_TOKEN);
}

export function assertWechatMpConfigured(): void {
  if (!isWechatMpConfigured()) {
    throw new AppError(503, '微信服务号未配置，请联系管理员', 'WECHAT_MP_NOT_CONFIGURED');
  }
}

/** 公众平台服务器配置验签：sha1(sort(token, timestamp, nonce)) */
export function verifyMpSignature(params: {
  signature: string;
  timestamp: string;
  nonce: string;
}): boolean {
  const token = env.WX_MP_TOKEN;
  if (!token) return false;
  const { signature, timestamp, nonce } = params;
  if (!signature || !timestamp || !nonce) return false;
  const raw = [token, timestamp, nonce].sort().join('');
  const hash = createHash('sha1').update(raw).digest('hex');
  return hash === signature;
}

async function fetchStableAccessToken(forceRefresh = false): Promise<string> {
  assertWechatMpConfigured();
  const res = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: env.WX_MP_APPID,
      secret: env.WX_MP_SECRET,
      force_refresh: forceRefresh,
    }),
  });
  const data = (await res.json()) as StableTokenResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new AppError(502, data.errmsg || `获取服务号 token 失败(${data.errcode})`, 'WECHAT_MP_TOKEN');
  }
  if (!data.access_token) {
    throw new AppError(502, '微信返回 access_token 为空', 'WECHAT_MP_TOKEN');
  }
  const ttl = Math.min(STABLE_TOKEN_TTL_SEC, Math.max(60, (data.expires_in ?? 7200) - 200));
  await redisSetEx(STABLE_TOKEN_CACHE_KEY, ttl, data.access_token);
  memoryToken = { value: data.access_token, expiresAt: Date.now() + ttl * 1000 };
  return data.access_token;
}

export async function getMpAccessToken(): Promise<string> {
  assertWechatMpConfigured();
  const cached = await redisGet(STABLE_TOKEN_CACHE_KEY);
  if (cached) return cached;
  if (memoryToken && memoryToken.expiresAt > Date.now()) return memoryToken.value;

  const lock = await redisSetNxEx(STABLE_TOKEN_LOCK_KEY, 10, '1');
  if (lock === 'exists') {
    await new Promise(r => setTimeout(r, 200));
    const again = await redisGet(STABLE_TOKEN_CACHE_KEY);
    if (again) return again;
    if (memoryToken && memoryToken.expiresAt > Date.now()) return memoryToken.value;
  }
  return fetchStableAccessToken(false);
}

export async function createTempQrcode(sceneStr: string, expireSeconds = 600): Promise<{
  ticket: string;
  expireSeconds: number;
  qrcodeUrl: string;
}> {
  if (!sceneStr || sceneStr.length > 64) {
    throw new AppError(400, '二维码场景值无效');
  }
  const token = await getMpAccessToken();
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expire_seconds: expireSeconds,
        action_name: 'QR_STR_SCENE',
        action_info: { scene: { scene_str: sceneStr } },
      }),
    },
  );
  const data = (await res.json()) as QrcodeCreateResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new AppError(502, data.errmsg || `创建二维码失败(${data.errcode})`, 'WECHAT_MP_QRCODE');
  }
  if (!data.ticket) {
    throw new AppError(502, '微信返回二维码 ticket 为空', 'WECHAT_MP_QRCODE');
  }
  return {
    ticket: data.ticket,
    expireSeconds: data.expire_seconds ?? expireSeconds,
    qrcodeUrl: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(data.ticket)}`,
  };
}

export type MpTemplateData = Record<string, { value: string }>;

export async function sendMpTemplateMessage(input: {
  touser: string;
  templateId: string;
  data: MpTemplateData;
  pagepath?: string;
  url?: string;
}): Promise<{ msgid?: number }> {
  assertWechatMpConfigured();
  const token = await getMpAccessToken();
  const body: Record<string, unknown> = {
    touser: input.touser,
    template_id: input.templateId,
    data: input.data,
  };
  if (input.url) body.url = input.url;
  if (input.pagepath && env.WX_MINI_APPID) {
    body.miniprogram = {
      appid: env.WX_MINI_APPID,
      pagepath: input.pagepath,
    };
  }

  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json()) as TemplateSendResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new AppError(
      502,
      data.errmsg || `模板消息发送失败(${data.errcode})`,
      `WECHAT_MP_SEND_${data.errcode}`,
    );
  }
  return { msgid: data.msgid };
}
