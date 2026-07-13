-- AlterTable
ALTER TABLE "subcontract_collaboration_dispatches" ADD COLUMN IF NOT EXISTS "receiver_plan_order_id" VARCHAR(50);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subcontract_collaboration_dispatches_receiver_plan_order_id_idx" ON "subcontract_collaboration_dispatches"("receiver_plan_order_id");
