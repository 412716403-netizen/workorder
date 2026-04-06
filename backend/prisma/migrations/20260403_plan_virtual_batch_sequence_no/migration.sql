-- 计划单内批次码序号（从 1 递增，作废不回收）
ALTER TABLE "plan_virtual_batches" ADD COLUMN "sequence_no" INTEGER NOT NULL DEFAULT 0;

UPDATE "plan_virtual_batches" AS p
SET "sequence_no" = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY plan_order_id ORDER BY created_at ASC) AS rn
  FROM "plan_virtual_batches"
) AS n
WHERE p.id = n.id;

CREATE UNIQUE INDEX "plan_virtual_batches_plan_sequence_key" ON "plan_virtual_batches" ("plan_order_id", "sequence_no");
