-- 单品码可选关联批次码（批次码+单品码 模式）
ALTER TABLE "item_codes" ADD COLUMN "batch_id" VARCHAR(50);

CREATE INDEX "item_codes_batch_id_idx" ON "item_codes" ("batch_id");

ALTER TABLE "item_codes"
  ADD CONSTRAINT "item_codes_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "plan_virtual_batches" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
