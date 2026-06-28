-- 收付款类型：移除「是否关联工单」开关（link_order）
ALTER TABLE "finance_categories" DROP COLUMN IF EXISTS "link_order";
