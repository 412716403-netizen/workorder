-- P2: 登录活跃
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_client" VARCHAR(20);
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "last_active_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "users_last_login_at_idx" ON "users" ("last_login_at");
CREATE INDEX IF NOT EXISTS "tenant_memberships_tenant_last_active_idx"
  ON "tenant_memberships" ("tenant_id", "last_active_at");

-- P3: 平台关键操作审计
CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "target_type" VARCHAR(40) NOT NULL,
  "target_id" VARCHAR(80) NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "platform_audit_logs_created_at_idx"
  ON "platform_audit_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "platform_audit_logs_target_idx"
  ON "platform_audit_logs" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "platform_audit_logs_actor_idx"
  ON "platform_audit_logs" ("actor_user_id");
