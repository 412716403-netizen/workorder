-- 收付款单关联来源 PSI 单据号（采购订单/采购入库/销售订单/销售单），用于详情页反查已收付金额

-- AlterTable
ALTER TABLE "finance_records" ADD COLUMN "source_doc_no" VARCHAR(50);

-- CreateIndex
CREATE INDEX "finance_records_tenant_id_source_doc_no_idx" ON "finance_records"("tenant_id", "source_doc_no");
