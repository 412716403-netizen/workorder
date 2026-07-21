-- 产品名称(sku) 允许租户内重复：去掉唯一约束，保留检索索引
DROP INDEX IF EXISTS "products_tenant_id_sku_key";
CREATE INDEX IF NOT EXISTS "products_tenant_id_sku_idx" ON "products"("tenant_id", "sku");
