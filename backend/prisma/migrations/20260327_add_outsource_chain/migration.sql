-- 外协路线表
CREATE TABLE IF NOT EXISTS "outsource_routes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "steps" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "outsource_routes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "outsource_routes_tenant_id_idx" ON "outsource_routes"("tenant_id");

-- 链式外协字段
ALTER TABLE "inter_tenant_subcontract_transfers"
    ADD COLUMN IF NOT EXISTS "origin_transfer_id" UUID,
    ADD COLUMN IF NOT EXISTS "parent_transfer_id" UUID,
    ADD COLUMN IF NOT EXISTS "chain_step" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "origin_tenant_id" UUID,
    ADD COLUMN IF NOT EXISTS "outsource_route_snapshot" JSONB,
    ADD COLUMN IF NOT EXISTS "origin_confirmed_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "inter_tenant_subcontract_transfers_origin_tenant_id_idx"
    ON "inter_tenant_subcontract_transfers"("origin_tenant_id");
CREATE INDEX IF NOT EXISTS "inter_tenant_subcontract_transfers_origin_transfer_id_idx"
    ON "inter_tenant_subcontract_transfers"("origin_transfer_id");
