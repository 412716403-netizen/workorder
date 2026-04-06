-- 历史上该特性通过 db push 落库；这里补齐 plan_virtual_batches / item_codes
-- 的建表基线，确保 migrate deploy 可以从空库重建。
CREATE TABLE IF NOT EXISTS "plan_virtual_batches" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_order_id" VARCHAR(50) NOT NULL,
    "product_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "quantity" INTEGER NOT NULL,
    "scan_token" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_virtual_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_virtual_batches_scan_token_key" ON "plan_virtual_batches" ("scan_token");
CREATE INDEX IF NOT EXISTS "plan_virtual_batches_tenant_id_idx" ON "plan_virtual_batches" ("tenant_id");
CREATE INDEX IF NOT EXISTS "plan_virtual_batches_plan_order_id_idx" ON "plan_virtual_batches" ("plan_order_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_virtual_batches_plan_order_id_fkey'
  ) THEN
    ALTER TABLE "plan_virtual_batches"
      ADD CONSTRAINT "plan_virtual_batches_plan_order_id_fkey"
      FOREIGN KEY ("plan_order_id") REFERENCES "plan_orders" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "item_codes" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_order_id" VARCHAR(50) NOT NULL,
    "product_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "serial_no" INTEGER NOT NULL,
    "scan_token" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "item_codes_scan_token_key" ON "item_codes" ("scan_token");
CREATE INDEX IF NOT EXISTS "item_codes_tenant_id_idx" ON "item_codes" ("tenant_id");
CREATE INDEX IF NOT EXISTS "item_codes_plan_order_id_idx" ON "item_codes" ("plan_order_id");
CREATE INDEX IF NOT EXISTS "item_codes_product_id_idx" ON "item_codes" ("product_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'item_codes_plan_order_id_fkey'
  ) THEN
    ALTER TABLE "item_codes"
      ADD CONSTRAINT "item_codes_plan_order_id_fkey"
      FOREIGN KEY ("plan_order_id") REFERENCES "plan_orders" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 计划单内批次码序号（从 1 递增，作废不回收）
ALTER TABLE "plan_virtual_batches" ADD COLUMN IF NOT EXISTS "sequence_no" INTEGER NOT NULL DEFAULT 0;

UPDATE "plan_virtual_batches" AS p
SET "sequence_no" = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY plan_order_id ORDER BY created_at ASC) AS rn
  FROM "plan_virtual_batches"
) AS n
WHERE p.id = n.id
  AND COALESCE(p."sequence_no", 0) = 0;

CREATE UNIQUE INDEX IF NOT EXISTS "plan_virtual_batches_plan_sequence_key" ON "plan_virtual_batches" ("plan_order_id", "sequence_no");
