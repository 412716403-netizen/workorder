-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- AlterTable: add role_id to tenant_memberships
ALTER TABLE "tenant_memberships" ADD COLUMN "role_id" VARCHAR(50);

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
