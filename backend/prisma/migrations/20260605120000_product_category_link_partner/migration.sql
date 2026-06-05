-- 产品分类：拆分「启用采购价和供应商」为 hasPurchasePrice + linkPartner
ALTER TABLE "product_categories" ADD COLUMN "link_partner" BOOLEAN NOT NULL DEFAULT false;

-- 历史已启用采购价的分类，同步开启关联合作单位
UPDATE "product_categories" SET "link_partner" = true WHERE "has_purchase_price" = true;
