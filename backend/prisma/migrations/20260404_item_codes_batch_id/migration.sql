-- 单品码可选关联批次码（批次码+单品码 模式）
ALTER TABLE "item_codes" ADD COLUMN IF NOT EXISTS "batch_id" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "item_codes_batch_id_idx" ON "item_codes" ("batch_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'item_codes_batch_id_fkey'
  ) THEN
    ALTER TABLE "item_codes"
      ADD CONSTRAINT "item_codes_batch_id_fkey"
      FOREIGN KEY ("batch_id") REFERENCES "plan_virtual_batches" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
