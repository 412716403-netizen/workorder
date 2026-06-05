/**
 * 前端统一 HTTP 出口（barrel）。
 *
 * 历史上整个 1080 行 API 客户端都堆在这一个文件里；为减小单文件体积、避免多人协作冲突，
 * Phase 1.2 起按业务域拆到 `services/api/` 下：
 *
 * - `_client.ts`        — fetch / token / 续期 / 共享 CRUD 工厂
 * - `auth.ts`           — auth / adminUsers / adminTenants
 * - `settings.ts`       — settings
 * - `masterData.ts`     — partners / workers / equipment / dictionaries
 * - `products.ts`       — products / boms
 * - `plans.ts`          — plans
 * - `orders.ts`         — orders / production
 * - `psi.ts`            — psi
 * - `finance.ts`        — finance
 * - `tenants.ts`        — roles / tenants
 * - `collaboration.ts`  — collaboration / itemCodesApi / planVirtualBatchesApi
 *
 * 调用方仍可继续用 `import * as api from 'services/api'` 或 `import { orders } from 'services/api'`，
 * 无需任何改动。
 */

export {
  API_BASE,
  setTokens,
  clearTokens,
  isAuthenticated,
  refreshSessionSilently,
  type PaginatedResponse,
  type PaginationParams,
} from './api/_client';

export { auth, adminUsers, adminTenants } from './api/auth';
export type { TenantInfo, LoginResult, MeUser, AdminUserRow, AdminTenantRow } from './api/auth';

export { settings } from './api/settings';

export { partners, workers, equipment, dictionaries } from './api/masterData';

export { products, boms } from './api/products';

export { devStyles, devBoms, devTemplates } from './api/development';

export { plans } from './api/plans';

export { orders, production } from './api/orders';
export type { ProductionFilter, ProductionSummary } from './api/orders';

export { psi } from './api/psi';
export type { StockSnapshotBucket } from './api/psi';

export { finance } from './api/finance';
export type { FinanceFilter, FinanceSummary } from './api/finance';

export { roles, tenants } from './api/tenants';
export type { RoleRow } from './api/tenants';

export { collaboration, itemCodesApi, planVirtualBatchesApi } from './api/collaboration';
