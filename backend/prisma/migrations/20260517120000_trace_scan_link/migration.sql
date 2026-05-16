-- 追溯链路：报工/入库扫码时写入虚拟批次与单品码关联
ALTER TABLE milestone_reports ADD COLUMN IF NOT EXISTS virtual_batch_id UUID;
ALTER TABLE milestone_reports ADD COLUMN IF NOT EXISTS item_code_id UUID;

ALTER TABLE product_progress_reports ADD COLUMN IF NOT EXISTS virtual_batch_id UUID;
ALTER TABLE product_progress_reports ADD COLUMN IF NOT EXISTS item_code_id UUID;

ALTER TABLE production_op_records ADD COLUMN IF NOT EXISTS virtual_batch_id UUID;
ALTER TABLE production_op_records ADD COLUMN IF NOT EXISTS item_code_id UUID;

CREATE INDEX IF NOT EXISTS milestone_reports_virtual_batch_id_idx ON milestone_reports (virtual_batch_id);
CREATE INDEX IF NOT EXISTS milestone_reports_item_code_id_idx ON milestone_reports (item_code_id);
CREATE INDEX IF NOT EXISTS product_progress_reports_virtual_batch_id_idx ON product_progress_reports (virtual_batch_id);
CREATE INDEX IF NOT EXISTS product_progress_reports_item_code_id_idx ON product_progress_reports (item_code_id);
CREATE INDEX IF NOT EXISTS production_op_records_virtual_batch_id_idx ON production_op_records (virtual_batch_id);
CREATE INDEX IF NOT EXISTS production_op_records_item_code_id_idx ON production_op_records (item_code_id);
