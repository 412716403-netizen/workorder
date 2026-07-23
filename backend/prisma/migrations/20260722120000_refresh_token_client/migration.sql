-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "client" VARCHAR(20) NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_client_idx" ON "refresh_tokens"("user_id", "client");
