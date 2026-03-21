-- AlterTable: add assigned_milestone_ids to tenant_memberships
ALTER TABLE "tenant_memberships" ADD COLUMN "assigned_milestone_ids" JSONB NOT NULL DEFAULT '[]';
