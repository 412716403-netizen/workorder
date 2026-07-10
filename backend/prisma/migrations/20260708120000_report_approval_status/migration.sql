-- 报工审核状态：小程序 Tab 自报工 PENDING；工单中心/扫码即时 APPROVED
ALTER TABLE "milestone_reports"
  ADD COLUMN IF NOT EXISTS "approval_status" VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "approved_by" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "rejected_reason" VARCHAR(500);

ALTER TABLE "product_progress_reports"
  ADD COLUMN IF NOT EXISTS "approval_status" VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "approved_by" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "rejected_reason" VARCHAR(500);

CREATE INDEX IF NOT EXISTS "milestone_reports_approval_status_idx"
  ON "milestone_reports"("approval_status");
CREATE INDEX IF NOT EXISTS "milestone_reports_worker_id_approval_status_idx"
  ON "milestone_reports"("worker_id", "approval_status");

CREATE INDEX IF NOT EXISTS "product_progress_reports_approval_status_idx"
  ON "product_progress_reports"("approval_status");
CREATE INDEX IF NOT EXISTS "product_progress_reports_worker_id_approval_status_idx"
  ON "product_progress_reports"("worker_id", "approval_status");
