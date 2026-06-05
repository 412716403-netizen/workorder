-- AlterTable
ALTER TABLE "dev_stage_template_fields" ADD COLUMN IF NOT EXISTS "type" VARCHAR(20) NOT NULL DEFAULT 'text';
ALTER TABLE "dev_stage_template_fields" ADD COLUMN IF NOT EXISTS "options" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "dev_stage_template_fields" ADD COLUMN IF NOT EXISTS "date_with_time" BOOLEAN;
ALTER TABLE "dev_stage_template_fields" ADD COLUMN IF NOT EXISTS "date_auto_fill" BOOLEAN;
