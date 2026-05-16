-- 单品码展示编号：计划单号-批次序号-批次内件号（batch_piece_no）
ALTER TABLE "item_codes" ADD COLUMN IF NOT EXISTS "batch_piece_no" INTEGER;

UPDATE "item_codes" AS ic
SET "batch_piece_no" = sub.rn
FROM (
  SELECT
    "tenant_id",
    "id",
    ROW_NUMBER() OVER (PARTITION BY "batch_id" ORDER BY "serial_no") AS rn
  FROM "item_codes"
  WHERE "batch_id" IS NOT NULL
) AS sub
WHERE ic."tenant_id" = sub."tenant_id"
  AND ic."id" = sub."id"
  AND ic."batch_piece_no" IS NULL;
