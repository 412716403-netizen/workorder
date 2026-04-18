-- 企业级开关：是否启用设备模块（设备档案 + 派工/报工选设备）
ALTER TABLE "tenants" ADD COLUMN "equipment_module_enabled" BOOLEAN NOT NULL DEFAULT true;
