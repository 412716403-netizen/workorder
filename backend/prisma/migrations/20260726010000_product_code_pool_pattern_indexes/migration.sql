-- 产品编号取号号池的前缀扫描索引
--
-- 背景：`readMaxProductCodeSerial` 在 advisory lock 内按 `^{prefix}[0-9]+$` 扫描
-- products + dev_styles 的品名求 max 流水号。库 collation 为 en_US.UTF-8，
-- 默认 opclass 的 (tenant_id, name) 索引无法用于 `LIKE '{prefix}%'` 前缀匹配，
-- 因此另建 varchar_pattern_ops 索引（按字符逐位比较，与 LIKE 前缀语义一致）。
--
-- 两张表在本域体量为百至千级，普通 CREATE INDEX 毫秒级完成；Prisma 迁移在事务内执行，
-- 无法使用 CONCURRENTLY，故不采用。

-- CreateIndex
CREATE INDEX "products_tenant_id_name_pattern_idx" ON "products"("tenant_id", "name" varchar_pattern_ops);

-- CreateIndex
CREATE INDEX "dev_styles_tenant_id_name_pattern_idx" ON "dev_styles"("tenant_id", "name" varchar_pattern_ops);
