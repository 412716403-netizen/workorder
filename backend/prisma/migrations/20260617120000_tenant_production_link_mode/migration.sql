-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "production_link_mode" VARCHAR(20) NOT NULL DEFAULT 'order';

-- 从 system_settings 回填存量租户（value 为 JSON 字符串 "order" / "product"）
UPDATE "tenants" t
SET "production_link_mode" = sub.mode
FROM (
  SELECT
    ss.tenant_id,
    CASE
      WHEN ss.value::text IN ('"product"', 'product') THEN 'product'
      ELSE 'order'
    END AS mode
  FROM "system_settings" ss
  WHERE ss.key = 'productionLinkMode'
) sub
WHERE t.id = sub.tenant_id;
