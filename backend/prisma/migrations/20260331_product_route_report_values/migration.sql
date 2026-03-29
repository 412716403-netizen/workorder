-- 标准生产路线报工填报项试填/默认值：按工序节点 id -> 字段 id -> 字符串值（含 JSON 数组形式的多附件）
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "route_report_values" JSONB NOT NULL DEFAULT '{}';
