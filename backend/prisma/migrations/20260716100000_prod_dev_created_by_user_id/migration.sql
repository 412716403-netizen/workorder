-- 生产管理 / 开发管理：制单人账号 ID（仅关联，不做数据级权限）
ALTER TABLE "plan_orders" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "production_op_records" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "milestone_reports" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "product_progress_reports" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "dev_styles" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "dev_boms" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "dev_samples" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "dev_stage_templates" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "dev_logs" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;

CREATE INDEX IF NOT EXISTS "plan_orders_tenant_id_created_by_user_id_idx" ON "plan_orders"("tenant_id", "created_by_user_id");
CREATE INDEX IF NOT EXISTS "production_orders_tenant_id_created_by_user_id_idx" ON "production_orders"("tenant_id", "created_by_user_id");
CREATE INDEX IF NOT EXISTS "production_op_records_tenant_id_created_by_user_id_idx" ON "production_op_records"("tenant_id", "created_by_user_id");
CREATE INDEX IF NOT EXISTS "milestone_reports_created_by_user_id_idx" ON "milestone_reports"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "product_progress_reports_created_by_user_id_idx" ON "product_progress_reports"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "dev_styles_tenant_id_created_by_user_id_idx" ON "dev_styles"("tenant_id", "created_by_user_id");
CREATE INDEX IF NOT EXISTS "dev_boms_tenant_id_created_by_user_id_idx" ON "dev_boms"("tenant_id", "created_by_user_id");
CREATE INDEX IF NOT EXISTS "dev_samples_created_by_user_id_idx" ON "dev_samples"("created_by_user_id");
CREATE INDEX IF NOT EXISTS "dev_stage_templates_tenant_id_created_by_user_id_idx" ON "dev_stage_templates"("tenant_id", "created_by_user_id");
CREATE INDEX IF NOT EXISTS "dev_logs_created_by_user_id_idx" ON "dev_logs"("created_by_user_id");
