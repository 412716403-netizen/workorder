-- 工单派发完成状态：用于「关联工单模式」下工单中心与计划单列表的徽章
-- dispatch_status: 'IN_PROGRESS' | 'COMPLETED'，STOCK_IN 累计 ≥ items 总量自动写 COMPLETED；用户手动可覆盖
-- dispatch_status_manual: 是否被手动覆盖过；true 时自动入库逻辑跳过该工单
ALTER TABLE "production_orders" ADD COLUMN "dispatch_status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS';
ALTER TABLE "production_orders" ADD COLUMN "dispatch_status_manual" BOOLEAN NOT NULL DEFAULT FALSE;
