-- 对齐数据库实际默认值与 schema.prisma 的 Prisma-side 默认值语义
-- 1. 协作相关 UUID 主键改回由 Prisma 侧生成，不依赖 DB default
-- 2. 虚拟批次 sequence_no 仅在回填时临时使用默认值，落库后去掉默认值

ALTER TABLE "tenant_collaborations"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "inter_tenant_subcontract_transfers"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "subcontract_collaboration_dispatches"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "subcontract_collaboration_returns"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "collaboration_product_maps"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "plan_virtual_batches"
  ALTER COLUMN "sequence_no" DROP DEFAULT;
