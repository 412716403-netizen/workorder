/**
 * 租户上下文热同步 — 对齐 Web AuthContext GET /tenants?all=true
 */

const { request } = require('./request.js');
const { readTenantCtx, parseTenantListResponse } = require('./session.js');

let syncPromise = null;

function normalizePermissions(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }
  return [];
}

function buildTenantCtxFromMatch(ctx, matched) {
  return {
    tenantId: matched.id,
    tenantName: matched.name,
    tenantRole: matched.role,
    permissions: normalizePermissions(matched.permissions),
    status: matched.status,
    expiresAt: matched.expiresAt != null ? matched.expiresAt : null,
    industryKind: matched.industryKind || ctx.industryKind || 'generic',
    equipmentFeaturesEnabled: matched.equipmentFeaturesEnabled !== false,
  };
}

/**
 * 从服务端刷新当前 tenantCtx（permissions / role 等）
 * @returns {Promise<object|null>}
 */
function syncTenantCtx() {
  const ctx = readTenantCtx();
  if (!ctx || !ctx.tenantId) return Promise.resolve(ctx);

  if (syncPromise) return syncPromise;

  syncPromise = request({ path: '/tenants?all=true', method: 'GET' })
    .then((raw) => {
      const list = parseTenantListResponse(raw);
      const matched = list.find((t) => t.id === ctx.tenantId);
      if (!matched) return ctx;

      const next = buildTenantCtxFromMatch(ctx, matched);
      if (JSON.stringify(next) !== JSON.stringify(ctx)) {
        wx.setStorageSync('tenantCtx', JSON.stringify(next));
      }
      return next;
    })
    .catch(() => ctx)
    .finally(() => {
      syncPromise = null;
    });

  return syncPromise;
}

module.exports = {
  syncTenantCtx,
};
