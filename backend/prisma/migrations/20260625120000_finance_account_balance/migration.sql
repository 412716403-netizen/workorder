-- AlterTable: 收支账户类型新增期初余额等主数据字段
ALTER TABLE "finance_account_types"
  ADD COLUMN "initial_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "opening_date" TIMESTAMPTZ,
  ADD COLUMN "account_kind" VARCHAR(50),
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: 财务记录新增账户类型外键列（保留 payment_account 作展示/回退）
ALTER TABLE "finance_records" ADD COLUMN "account_type_id" VARCHAR(50);

-- CreateIndex
CREATE INDEX "finance_records_account_type_id_idx" ON "finance_records"("account_type_id");

-- Backfill: 按 (tenant_id, name) 把历史 payment_account 文本回填成 account_type_id。
-- 账户名在租户内唯一（应用层 assertSettingsNameUnique 保证），匹配安全；
-- payment_account 为空或对不上的记录保持 account_type_id 为 NULL（余额聚合忽略）。
UPDATE "finance_records" fr
SET "account_type_id" = fat."id"
FROM "finance_account_types" fat
WHERE fr."payment_account" IS NOT NULL
  AND fr."payment_account" <> ''
  AND fat."tenant_id" = fr."tenant_id"
  AND fat."name" = fr."payment_account";

-- AddForeignKey
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_account_type_id_fkey" FOREIGN KEY ("account_type_id") REFERENCES "finance_account_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
