-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "economics_report_node_price" JSONB;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "economics_outsource_node_price" JSONB;
