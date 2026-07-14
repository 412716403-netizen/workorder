-- Phase 3.F 性能优化：
-- 1. plan_order_id：计划单关联工单查询（revertPlanIfNoLinkedOrders / 计划详情聚合）走索引
-- 2. tenant_id + dispatch_status：工单中心 excludeCompleted 筛选走索引
CREATE INDEX IF NOT EXISTS "production_orders_plan_order_id_idx" ON "production_orders"("plan_order_id");
CREATE INDEX IF NOT EXISTS "production_orders_tenant_id_dispatch_status_idx" ON "production_orders"("tenant_id", "dispatch_status");
