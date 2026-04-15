-- 报工页只读展示项模板（工序库 + 工单工序快照）
ALTER TABLE "global_node_templates" ADD COLUMN IF NOT EXISTS "report_display_template" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "report_display_template" JSONB NOT NULL DEFAULT '[]';

-- 产品侧：各工序展示项内容（与 report_display_template 字段 id 对应）
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "route_report_display_values" JSONB NOT NULL DEFAULT '{}';
