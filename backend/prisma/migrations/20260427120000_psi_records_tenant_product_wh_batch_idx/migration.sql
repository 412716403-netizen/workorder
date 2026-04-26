-- 按租户+产品+仓库+批次查询 `getStockBatches` 等热路径
CREATE INDEX IF NOT EXISTS "psi_records_tenant_product_wh_batch_idx"
  ON "psi_records" ("tenant_id", "product_id", "warehouse_id", "batch_no");
