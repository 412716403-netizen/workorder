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
  get CORS_ORIGIN() { return process.env.CORS_ORIGIN || 'http://localhost:3000'; },
};
