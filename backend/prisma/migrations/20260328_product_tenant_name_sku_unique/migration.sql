-- 租户内产品编号、产品名称分别唯一
-- 若存在重复，先为重复行自动改名/改编号（保留同组内 id 字典序最小的一条不变）

WITH ranked AS (
  SELECT id, tenant_id, sku,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, sku ORDER BY id ASC) AS rn
  FROM products
)
UPDATE products p
SET sku = LEFT(p.sku || '-' || p.id, 100)
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, tenant_id, name,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, name ORDER BY id ASC) AS rn
  FROM products
)
UPDATE products p
SET name = LEFT(p.name || '·' || p.id, 200)
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS "products_sku_idx";

CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");
CREATE UNIQUE INDEX "products_tenant_id_name_key" ON "products"("tenant_id", "name");
