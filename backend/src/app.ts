import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { requireTenant, requirePermission } from './middleware/tenant.js';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import tenantsRoutes from './routes/tenants.js';
import settingsRoutes from './routes/settings.js';
import masterDataRoutes from './routes/masterData.js';
import productsRoutes from './routes/products.js';
import plansRoutes from './routes/plans.js';
import ordersRoutes from './routes/orders.js';
import productionRoutes from './routes/production.js';
import psiRoutes from './routes/psi.js';
import financeRoutes from './routes/finance.js';
import dashboardRoutes from './routes/dashboard.js';
import rolesRoutes from './routes/roles.js';
import collaborationRoutes from './routes/collaboration.js';

const app = express();

function convertDecimals(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj === 'object' && typeof (obj as any).toNumber === 'function' && typeof (obj as any).toFixed === 'function') {
    return (obj as any).toNumber();
  }
  if (Array.isArray(obj)) return obj.map(convertDecimals);
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = convertDecimals(v);
    }
    return result;
  }
  return obj;
}

app.use((_req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = function (body: unknown) {
    return origJson(convertDecimals(body));
  } as any;
  next();
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '请求过于频繁，请 15 分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/', (_req, res) => {
  res.type('html').send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>SmartTrack Pro API</title></head><body style="font-family:sans-serif;padding:2rem">' +
    '<h1>SmartTrack Pro API</h1><p>这是接口服务，不是网页前台。</p>' +
    '<ul><li><a href="/api/health">健康检查 /api/health</a></li>' +
    '<li>前端请在项目根目录运行 <code>npm run dev</code>，浏览器打开 Vite 地址（多为 <code>http://localhost:3000</code>）</li></ul></body></html>',
  );
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tenants', authMiddleware, apiLimiter, tenantsRoutes);
app.use('/api/admin', authMiddleware, requireAdmin, apiLimiter, adminRoutes);

app.use('/api/roles',      authMiddleware, requireTenant, apiLimiter, rolesRoutes);

app.use('/api/settings',   authMiddleware, requireTenant, apiLimiter, settingsRoutes);
app.use('/api/master',     authMiddleware, requireTenant, apiLimiter, masterDataRoutes);
app.use('/api/products',   authMiddleware, requireTenant, apiLimiter, productsRoutes);
app.use('/api/plans',      authMiddleware, requireTenant, requirePermission('production'), apiLimiter, plansRoutes);
app.use('/api/orders',     authMiddleware, requireTenant, requirePermission('production'), apiLimiter, ordersRoutes);
app.use('/api/production', authMiddleware, requireTenant, requirePermission('production'), apiLimiter, productionRoutes);
app.use('/api/psi',        authMiddleware, requireTenant, requirePermission('psi'),        apiLimiter, psiRoutes);
app.use('/api/finance',    authMiddleware, requireTenant, requirePermission('finance'),    apiLimiter, financeRoutes);
app.use('/api/dashboard',  authMiddleware, requireTenant, requirePermission('dashboard'),  apiLimiter, dashboardRoutes);

app.use('/api/collaboration', authMiddleware, requireTenant, apiLimiter, collaborationRoutes);

app.use(errorHandler);

export default app;
