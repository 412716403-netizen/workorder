-- AlterTable
ALTER TABLE "tenant_memberships" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';
