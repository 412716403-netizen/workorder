-- 产品名称(sku) / 开发款号(code) 改为可空：不填不自动生成；PG UNIQUE 允许多条 NULL
ALTER TABLE "products" ALTER COLUMN "sku" DROP NOT NULL;
UPDATE "products" SET "sku" = NULL WHERE btrim("sku") = '';

ALTER TABLE "dev_styles" ALTER COLUMN "code" DROP NOT NULL;
UPDATE "dev_styles" SET "code" = NULL WHERE btrim("code") = '';
