-- AlterTable
ALTER TABLE "users" ADD COLUMN "wx_mp_openid" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "users_wx_mp_openid_key" ON "users"("wx_mp_openid");

-- CreateTable
CREATE TABLE "wx_push_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'mp_template',
    "template_key" VARCHAR(60) NOT NULL,
    "dedupe_key" VARCHAR(120) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "err_code" VARCHAR(40),
    "err_msg" VARCHAR(500),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wx_push_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wx_push_logs_dedupe_key_key" ON "wx_push_logs"("dedupe_key");

-- CreateIndex
CREATE INDEX "wx_push_logs_status_created_at_idx" ON "wx_push_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "wx_push_logs_user_id_created_at_idx" ON "wx_push_logs"("user_id", "created_at" DESC);
