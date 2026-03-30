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
};
