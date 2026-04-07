-- Composite indexes for pagination/sorting hot paths

-- PlanOrder: tenant + time ordering, tenant + status filtering + time ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PlanOrder_tenantId_createdAt_idx" ON "PlanOrder" ("tenant_id", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PlanOrder_tenantId_status_createdAt_idx" ON "PlanOrder" ("tenant_id", "status", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PlanOrder_tenantId_updatedAt_idx" ON "PlanOrder" ("tenant_id", "updated_at" DESC);

-- ProductionOrder: tenant + time ordering, tenant + status filtering + time ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProductionOrder_tenantId_createdAt_idx" ON "production_orders" ("tenant_id", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProductionOrder_tenantId_status_createdAt_idx" ON "production_orders" ("tenant_id", "status", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProductionOrder_tenantId_updatedAt_idx" ON "production_orders" ("tenant_id", "updated_at" DESC);

-- ProductionOpRecord: tenant + type + time ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProductionOpRecord_tenantId_type_timestamp_idx" ON "production_op_records" ("tenant_id", "type", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProductionOpRecord_tenantId_updatedAt_idx" ON "production_op_records" ("tenant_id", "updated_at" DESC);

-- PsiRecord: tenant + type + time ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PsiRecord_tenantId_type_createdAt_idx" ON "psi_records" ("tenant_id", "type", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PsiRecord_tenantId_updatedAt_idx" ON "psi_records" ("tenant_id", "updated_at" DESC);

-- FinanceRecord: tenant + type + time ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FinanceRecord_tenantId_type_createdAt_idx" ON "finance_records" ("tenant_id", "type", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FinanceRecord_tenantId_updatedAt_idx" ON "finance_records" ("tenant_id", "updated_at" DESC);
