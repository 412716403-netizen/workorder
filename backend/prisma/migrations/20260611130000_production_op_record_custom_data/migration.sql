-- 生产流水（返工报工 / 待入库等）扫码追溯：单品码列表存 custom_data.__scanItemCodeIds
ALTER TABLE "production_op_records" ADD COLUMN IF NOT EXISTS "custom_data" JSONB NOT NULL DEFAULT '{}';
