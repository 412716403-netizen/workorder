-- 工序级开关：扫码称重（扫码会话显示电子秤捕获框 + 理论/实测比对）
ALTER TABLE "global_node_templates"
  ADD COLUMN "enable_scan_weighing" BOOLEAN NOT NULL DEFAULT false;

-- 存量回填：原本「报工时记录重量」的工序保留称重行为，避免开关上线后秤框消失
UPDATE "global_node_templates"
  SET "enable_scan_weighing" = "enable_weight_on_report"
  WHERE "enable_weight_on_report" = true;
