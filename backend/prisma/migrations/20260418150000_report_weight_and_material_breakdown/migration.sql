-- 工序级开关：报工时是否录入交货重量并按 BOM 占比分摊物料消耗
ALTER TABLE "global_node_templates"
  ADD COLUMN "enable_weight_on_report" BOOLEAN NOT NULL DEFAULT false;

-- BOM 子项开关：按重量分摊消耗时是否排除该子项（辅料如标签/纽扣）
ALTER TABLE "bom_items"
  ADD COLUMN "exclude_from_weight_share" BOOLEAN NOT NULL DEFAULT false;

-- 报工 / 外协收货：本次交货重量 + 按 BOM 占比拆出的各子物料实际消耗快照
ALTER TABLE "production_op_records"
  ADD COLUMN "weight" DECIMAL(12, 4),
  ADD COLUMN "material_breakdown" JSONB;

-- 工单报工（milestone_reports）：同上
ALTER TABLE "milestone_reports"
  ADD COLUMN "weight" DECIMAL(12, 4),
  ADD COLUMN "material_breakdown" JSONB;

-- 关联产品报工（product_progress_reports）：同上
ALTER TABLE "product_progress_reports"
  ADD COLUMN "weight" DECIMAL(12, 4),
  ADD COLUMN "material_breakdown" JSONB;
