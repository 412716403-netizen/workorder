function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const env = {
  get PORT() { return parseInt(process.env.PORT || '3001', 10); },
  get DATABASE_URL() { return requireEnv('DATABASE_URL'); },
  get JWT_SECRET() { return requireEnv('JWT_SECRET'); },
  get JWT_REFRESH_SECRET() { return requireEnv('JWT_REFRESH_SECRET'); },
  get JWT_EXPIRES_IN() { return process.env.JWT_EXPIRES_IN || '15m'; },
  get JWT_REFRESH_EXPIRES_IN() { return process.env.JWT_REFRESH_EXPIRES_IN || '7d'; },
  /** 多个源用英文逗号分隔；未设置时开发环境同时允许 localhost 与 127.0.0.1，避免地址栏写法不同导致预检失败 */
  get CORS_ORIGIN(): string | string[] {
    const raw = process.env.CORS_ORIGIN;
    if (!raw) return ['http://localhost:3000', 'http://127.0.0.1:3000'];
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length === 1 ? parts[0]! : parts;
  },
  /** JSON 请求体上限（产品图、分类附件等常为 Base64，易较大）；Nginx 需同步调大 client_max_body_size */
  get JSON_BODY_LIMIT() { return process.env.JSON_BODY_LIMIT || '50mb'; },
  /** 可选；未设置时 Redis 相关能力降级（如手机号验证码仍用进程内 Map，仅适合单 worker） */
  get REDIS_URL(): string | undefined {
    const v = process.env.REDIS_URL?.trim();
    return v || undefined;
  },
  /**
   * 通用 API 每 IP 每分钟请求上限（`apiLimiter`）。
   * 默认 1000：外协扫码收货等批量场景一单可能上千件，扫码时会逐件发解析/校验请求，
   * 旧默认 200 会被打爆（前端表现：「请求过于频繁」后整单卡死）。多 worker / 多用户同 IP 时可继续调大。
   */
  get API_RATE_LIMIT_MAX() {
    const n = parseInt(process.env.API_RATE_LIMIT_MAX || '1000', 10);
    return Number.isFinite(n) && n > 0 ? n : 1000;
  },
};
