-- AlterTable
ALTER TABLE "partners" ADD COLUMN "partner_list_no" INTEGER;

-- 按租户、创建时间回填序号
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS rn
  FROM partners
)
UPDATE partners p
SET partner_list_no = r.rn
FROM ranked r
WHERE p.id = r.id;

ALTER TABLE "partners" ALTER COLUMN "partner_list_no" SET NOT NULL;

CREATE UNIQUE INDEX "partners_tenant_id_partner_list_no_key" ON "partners"("tenant_id", "partner_list_no");
