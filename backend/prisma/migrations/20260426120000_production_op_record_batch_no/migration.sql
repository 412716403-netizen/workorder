-- AlterTable
ALTER TABLE "production_op_records" ADD COLUMN "batch_no" VARCHAR(100);

-- CreateIndex
CREATE INDEX "production_op_records_tenant_product_wh_batch_idx"
  ON "production_op_records"("tenant_id", "product_id", "warehouse_id", "batch_no");
