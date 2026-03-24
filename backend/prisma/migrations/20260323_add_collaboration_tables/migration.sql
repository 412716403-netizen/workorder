-- Partners: add collaboration tenant binding
ALTER TABLE "partners" ADD COLUMN "collaboration_tenant_id" UUID;

-- ProductionOpRecord: add collaboration link data
ALTER TABLE "production_op_records" ADD COLUMN "collab_data" JSONB;

-- TenantCollaboration
CREATE TABLE "tenant_collaborations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_a_id" UUID NOT NULL,
    "tenant_b_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "invited_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_collaborations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenant_collaborations_tenant_a_id_tenant_b_id_key" ON "tenant_collaborations"("tenant_a_id", "tenant_b_id");
CREATE INDEX "tenant_collaborations_tenant_a_id_idx" ON "tenant_collaborations"("tenant_a_id");
CREATE INDEX "tenant_collaborations_tenant_b_id_idx" ON "tenant_collaborations"("tenant_b_id");

-- InterTenantSubcontractTransfer
CREATE TABLE "inter_tenant_subcontract_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collaboration_id" UUID NOT NULL,
    "sender_tenant_id" UUID NOT NULL,
    "receiver_tenant_id" UUID NOT NULL,
    "sender_product_id" VARCHAR(50) NOT NULL,
    "sender_product_sku" VARCHAR(100) NOT NULL,
    "sender_product_name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "a_link_mode" VARCHAR(20) NOT NULL,
    "b_receive_mode" VARCHAR(20),
    "receiver_product_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inter_tenant_subcontract_transfers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inter_tenant_subcontract_transfers_sender_tenant_id_idx" ON "inter_tenant_subcontract_transfers"("sender_tenant_id");
CREATE INDEX "inter_tenant_subcontract_transfers_receiver_tenant_id_idx" ON "inter_tenant_subcontract_transfers"("receiver_tenant_id");
CREATE INDEX "inter_tenant_subcontract_transfers_sender_product_id_idx" ON "inter_tenant_subcontract_transfers"("sender_product_id");
CREATE INDEX "inter_tenant_subcontract_transfers_status_idx" ON "inter_tenant_subcontract_transfers"("status");
ALTER TABLE "inter_tenant_subcontract_transfers" ADD CONSTRAINT "inter_tenant_subcontract_transfers_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "tenant_collaborations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SubcontractCollaborationDispatch
CREATE TABLE "subcontract_collaboration_dispatches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transfer_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "sender_dispatch_record_ids" JSONB NOT NULL,
    "receiver_production_order_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subcontract_collaboration_dispatches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subcontract_collaboration_dispatches_transfer_id_idx" ON "subcontract_collaboration_dispatches"("transfer_id");
CREATE INDEX "subcontract_collaboration_dispatches_status_idx" ON "subcontract_collaboration_dispatches"("status");
ALTER TABLE "subcontract_collaboration_dispatches" ADD CONSTRAINT "subcontract_collaboration_dispatches_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inter_tenant_subcontract_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SubcontractCollaborationReturn
CREATE TABLE "subcontract_collaboration_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transfer_id" UUID NOT NULL,
    "dispatch_id" UUID,
    "receiver_production_order_id" VARCHAR(50),
    "payload" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING_A_RECEIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subcontract_collaboration_returns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subcontract_collaboration_returns_transfer_id_idx" ON "subcontract_collaboration_returns"("transfer_id");
CREATE INDEX "subcontract_collaboration_returns_status_idx" ON "subcontract_collaboration_returns"("status");
ALTER TABLE "subcontract_collaboration_returns" ADD CONSTRAINT "subcontract_collaboration_returns_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inter_tenant_subcontract_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CollaborationProductMap
CREATE TABLE "collaboration_product_maps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collaboration_id" UUID NOT NULL,
    "sender_sku" VARCHAR(100) NOT NULL,
    "sender_product_name" VARCHAR(200) NOT NULL,
    "receiver_product_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collaboration_product_maps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collaboration_product_maps_collaboration_id_sender_sku_key" ON "collaboration_product_maps"("collaboration_id", "sender_sku");
CREATE INDEX "collaboration_product_maps_collaboration_id_idx" ON "collaboration_product_maps"("collaboration_id");
ALTER TABLE "collaboration_product_maps" ADD CONSTRAINT "collaboration_product_maps_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "tenant_collaborations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
