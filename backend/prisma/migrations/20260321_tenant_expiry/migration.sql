-- AlterTable: add expires_at to tenants
ALTER TABLE "tenants" ADD COLUMN "expires_at" TIMESTAMPTZ;
