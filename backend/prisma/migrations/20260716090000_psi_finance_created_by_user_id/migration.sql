-- 单据「仅本人可见」权限（销售订单/销售单/收款单/付款单）：
-- 新增制单人账号 ID 列（服务端创建时写入；operator 仅作展示名），
-- 并为「按 type + 创建人」的列表范围过滤补组合索引。
ALTER TABLE "psi_records" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "finance_records" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;

CREATE INDEX IF NOT EXISTS "psi_records_tenant_id_type_created_by_user_id_idx" ON "psi_records"("tenant_id", "type", "created_by_user_id");
CREATE INDEX IF NOT EXISTS "finance_records_tenant_id_type_created_by_user_id_idx" ON "finance_records"("tenant_id", "type", "created_by_user_id");
