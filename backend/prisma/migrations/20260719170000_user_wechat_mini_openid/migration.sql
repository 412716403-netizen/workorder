-- AlterTable
ALTER TABLE "users" ADD COLUMN "wx_mini_openid" VARCHAR(64);
ALTER TABLE "users" ADD COLUMN "wx_unionid" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "users_wx_mini_openid_key" ON "users"("wx_mini_openid");

-- CreateIndex
CREATE INDEX "users_wx_unionid_idx" ON "users"("wx_unionid");
