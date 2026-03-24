-- Add updatedAt columns to tables that were missing them
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "production_op_records" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "psi_records" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "finance_records" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "finance_account_types" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "dictionary_items" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add missing indexes for query performance
CREATE INDEX IF NOT EXISTS "milestones_template_id_idx" ON "milestones"("template_id");
CREATE INDEX IF NOT EXISTS "milestone_reports_worker_id_idx" ON "milestone_reports"("worker_id");
CREATE INDEX IF NOT EXISTS "milestone_reports_report_no_idx" ON "milestone_reports"("report_no");
CREATE INDEX IF NOT EXISTS "product_progress_reports_report_batch_id_idx" ON "product_progress_reports"("report_batch_id");
CREATE INDEX IF NOT EXISTS "product_progress_reports_report_no_idx" ON "product_progress_reports"("report_no");
CREATE INDEX IF NOT EXISTS "production_op_records_timestamp_idx" ON "production_op_records"("timestamp");
CREATE INDEX IF NOT EXISTS "production_op_records_doc_no_idx" ON "production_op_records"("doc_no");
CREATE INDEX IF NOT EXISTS "psi_records_partner_id_idx" ON "psi_records"("partner_id");
CREATE INDEX IF NOT EXISTS "psi_records_warehouse_id_idx" ON "psi_records"("warehouse_id");
CREATE INDEX IF NOT EXISTS "psi_records_timestamp_idx" ON "psi_records"("timestamp");
CREATE INDEX IF NOT EXISTS "finance_records_timestamp_idx" ON "finance_records"("timestamp");
CREATE INDEX IF NOT EXISTS "finance_records_category_id_idx" ON "finance_records"("category_id");
CREATE INDEX IF NOT EXISTS "finance_records_worker_id_idx" ON "finance_records"("worker_id");
CREATE INDEX IF NOT EXISTS "partners_category_id_idx" ON "partners"("category_id");
CREATE INDEX IF NOT EXISTS "products_sku_idx" ON "products"("sku");
