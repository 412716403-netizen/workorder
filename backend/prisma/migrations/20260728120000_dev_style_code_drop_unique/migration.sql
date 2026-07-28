-- 款号(code) 允许租户内重复，与产品档案 products.sku 同口径：去掉唯一约束，保留检索索引
DROP INDEX IF EXISTS "dev_styles_tenant_id_code_key";
CREATE INDEX IF NOT EXISTS "dev_styles_tenant_id_code_idx" ON "dev_styles"("tenant_id", "code");
