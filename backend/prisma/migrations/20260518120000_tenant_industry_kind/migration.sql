-- 租户行业类型与行业预设灌入标记
ALTER TABLE "tenants" ADD COLUMN "industry_kind" VARCHAR(40) NOT NULL DEFAULT 'generic';
ALTER TABLE "tenants" ADD COLUMN "industry_preset_applied_at" TIMESTAMPTZ;
