-- 工序级开关：不按顺序生产（脱链工序，可按工单总量报工、不校验前道）
ALTER TABLE "global_node_templates"
  ADD COLUMN "allow_out_of_sequence" BOOLEAN NOT NULL DEFAULT false;

-- 数据迁移（方案 X）：原「不限制工序顺序(free)」租户，全局改为按顺序生产，
-- 故把这些租户下所有工序统一开启「不按顺序生产」以保持原有自由报工行为不变。
UPDATE "global_node_templates" t
SET "allow_out_of_sequence" = true
WHERE t."tenant_id" IN (
  SELECT s."tenant_id"
  FROM "system_settings" s
  WHERE s."key" = 'processSequenceMode'
    AND (s."value" #>> '{}') = 'free'
);

-- 统一全局口径：工序顺序设置已下线，所有租户固定为「按工序顺序生产」。
UPDATE "system_settings"
SET "value" = '"sequential"'::jsonb
WHERE "key" = 'processSequenceMode'
  AND (("value" #>> '{}') IS DISTINCT FROM 'sequential');
