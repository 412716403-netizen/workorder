-- Drop global unique constraints
DROP INDEX IF EXISTS "plan_orders_plan_number_key";
DROP INDEX IF EXISTS "production_orders_order_number_key";

-- Add tenant-scoped unique constraints
CREATE UNIQUE INDEX "plan_orders_tenant_id_plan_number_key" ON "plan_orders"("tenant_id", "plan_number");
CREATE UNIQUE INDEX "production_orders_tenant_id_order_number_key" ON "production_orders"("tenant_id", "order_number");
