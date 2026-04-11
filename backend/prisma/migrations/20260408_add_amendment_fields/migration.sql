-- SubcontractCollaborationDispatch: amendment fields for edit-sync flow
ALTER TABLE "subcontract_collaboration_dispatches"
  ADD COLUMN IF NOT EXISTS "amendment_payload" JSONB,
  ADD COLUMN IF NOT EXISTS "amendment_sender_record_ids" JSONB,
  ADD COLUMN IF NOT EXISTS "amendment_status" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "amendment_note" TEXT;

-- SubcontractCollaborationReturn: amendment fields for edit-sync flow
ALTER TABLE "subcontract_collaboration_returns"
  ADD COLUMN IF NOT EXISTS "amendment_payload" JSONB,
  ADD COLUMN IF NOT EXISTS "amendment_status" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "amendment_note" TEXT;

-- OrderItem: track which dispatch created this item (for product-mode partial update)
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "source_dispatch_id" UUID;
