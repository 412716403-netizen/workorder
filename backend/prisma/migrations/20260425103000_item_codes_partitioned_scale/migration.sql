-- 单品码/批次码：按 tenant_id HASH 分区（16 分区）、复合主键、无外键（与 Prisma schema 一致）
-- 注意：会删除并重建 item_codes、plan_virtual_batches；仅适用于无生产数据环境。

DROP TABLE IF EXISTS "item_codes" CASCADE;
DROP TABLE IF EXISTS "plan_virtual_batches" CASCADE;

CREATE TABLE "plan_virtual_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_order_id" VARCHAR(50) NOT NULL,
    "product_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "quantity" INTEGER NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "scan_token" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plan_virtual_batches_pkey" PRIMARY KEY ("tenant_id", "id")
) PARTITION BY HASH ("tenant_id");

CREATE TABLE "plan_virtual_batches_p0" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE "plan_virtual_batches_p1" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE "plan_virtual_batches_p2" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE "plan_virtual_batches_p3" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE "plan_virtual_batches_p4" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE "plan_virtual_batches_p5" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE "plan_virtual_batches_p6" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE "plan_virtual_batches_p7" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE "plan_virtual_batches_p8" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE "plan_virtual_batches_p9" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE "plan_virtual_batches_p10" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE "plan_virtual_batches_p11" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE "plan_virtual_batches_p12" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE "plan_virtual_batches_p13" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE "plan_virtual_batches_p14" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE "plan_virtual_batches_p15" PARTITION OF "plan_virtual_batches" FOR VALUES WITH (MODULUS 16, REMAINDER 15);

CREATE UNIQUE INDEX "plan_virtual_batches_plan_sequence_key" ON "plan_virtual_batches" ("tenant_id", "plan_order_id", "sequence_no");
CREATE UNIQUE INDEX "plan_virtual_batches_tenant_id_scan_token_key" ON "plan_virtual_batches" ("tenant_id", "scan_token");
CREATE INDEX "plan_virtual_batches_tenant_id_plan_order_id_variant_id_idx" ON "plan_virtual_batches" ("tenant_id", "plan_order_id", "variant_id");
CREATE INDEX "plan_virtual_batches_tenant_id_plan_order_id_sequence_no_idx" ON "plan_virtual_batches" ("tenant_id", "plan_order_id", "sequence_no");
CREATE INDEX "plan_virtual_batches_tenant_id_idx" ON "plan_virtual_batches" ("tenant_id");
CREATE INDEX "plan_virtual_batches_plan_order_id_idx" ON "plan_virtual_batches" ("plan_order_id");

CREATE TABLE "item_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_order_id" VARCHAR(50) NOT NULL,
    "product_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "serial_no" INTEGER NOT NULL,
    "scan_token" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batch_id" UUID,
    CONSTRAINT "item_codes_pkey" PRIMARY KEY ("tenant_id", "id")
) PARTITION BY HASH ("tenant_id");

CREATE TABLE "item_codes_p0" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE "item_codes_p1" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE "item_codes_p2" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE "item_codes_p3" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE "item_codes_p4" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE "item_codes_p5" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE "item_codes_p6" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE "item_codes_p7" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE "item_codes_p8" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE "item_codes_p9" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE "item_codes_p10" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE "item_codes_p11" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE "item_codes_p12" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE "item_codes_p13" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE "item_codes_p14" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE "item_codes_p15" PARTITION OF "item_codes" FOR VALUES WITH (MODULUS 16, REMAINDER 15);

CREATE UNIQUE INDEX "item_codes_tenant_id_scan_token_key" ON "item_codes" ("tenant_id", "scan_token");
CREATE INDEX "item_codes_tenant_id_plan_order_id_variant_id_idx" ON "item_codes" ("tenant_id", "plan_order_id", "variant_id");
CREATE INDEX "item_codes_tenant_id_plan_order_id_serial_no_idx" ON "item_codes" ("tenant_id", "plan_order_id", "serial_no");
CREATE INDEX "item_codes_tenant_id_status_idx" ON "item_codes" ("tenant_id", "status");
CREATE INDEX "item_codes_plan_order_id_idx" ON "item_codes" ("plan_order_id");
CREATE INDEX "item_codes_product_id_idx" ON "item_codes" ("product_id");
CREATE INDEX "item_codes_batch_id_idx" ON "item_codes" ("batch_id");
