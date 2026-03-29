-- 报工自定义字段仅保留在工序节点库，移除产品级覆盖列
ALTER TABLE "products" DROP COLUMN IF EXISTS "node_report_templates";
