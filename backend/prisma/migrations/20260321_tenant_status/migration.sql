-- AlterTable: add status to tenants (default 'active' so existing rows are unaffected)
ALTER TABLE "tenants" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'active';
