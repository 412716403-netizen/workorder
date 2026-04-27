-- 协作接受派发等路径会并发 ensure 字典项；去重后再加唯一约束。
DELETE FROM dictionary_items a
USING dictionary_items b
WHERE a.ctid > b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.type = b.type
  AND a.name = b.name;

CREATE UNIQUE INDEX IF NOT EXISTS "dictionary_items_tenant_type_name_key"
  ON "dictionary_items" ("tenant_id", "type", "name");
