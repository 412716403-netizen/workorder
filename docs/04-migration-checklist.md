# 迁移清单（接入数据库/后端）

> 接入数据库时，供后端开发对照。每完成一项可勾选。前端需同步将数据源从 localStorage 改为 API 调用。

---

## 1. 进销存 (PSI)

| # | API/能力 | 对应前端逻辑 | 输入 | 输出 | 状态 |
|---|----------|--------------|------|------|------|
| 1 | 库存查询 | `getStock(pId, whId?)` | productId, warehouseId? | 库存数量 | ⬜ |
| 2 | 采购订单已入库汇总 | `receivedByOrderLine` | - | `{ [docNum::lineId]: qty }` 或按需结构 | ⬜ |
| 3 | 采购订单/采购单 CRUD | `handleSaveManual`, `onReplaceRecords` | 单据+明细 | 保存结果 | ⬜ |
| 4 | 采购单引用订单生成 | `handleConvertPOToBill` | 选中的订单行+数量 | 新采购单记录 | ⬜ |
| 5 | 单据列表（含 lineGroupId 分组） | `groupedRecords` + 列表分组 | type, 可选筛选 | 按 docNumber 分组，组内按 lineGroupId 分组 | ⬜ |
| 6 | 盘点、调拨、销售单 | 对应保存逻辑 | 表单数据 | 新记录 | ⬜ |

**注意事项**：
- 单据替换时需保持列表顺序（插入到原位置）
- lineGroupId 需在保存时写入，引用订单生成采购单时继承

---

## 2. 经营看板 (Dashboard)

| # | API/能力 | 对应前端逻辑 | 输入 | 输出 | 状态 |
|---|----------|--------------|------|------|------|
| 1 | 生产统计汇总 | DashboardView L56-61 | - | activeOrders, totalMilestones, completedMilestones, completionRate | ⬜ |
| 2 | 财务统计汇总 | DashboardView L64-66 | - | totalReceipts, totalPayments, cashFlow | ⬜ |
| 3 | 库存预警 | DashboardView L69-73 | - | lowStockCount 或 lowStockProducts | ⬜ |
| 4 | 订单进度 | DashboardView L76-83 | - | prodProgressData | ⬜ |

**可选**：Dashboard 可提供聚合 API，一次性返回所有看板指标，减少请求数。

---

## 3. 计划/BOM (PlanOrder)

| # | API/能力 | 对应前端逻辑 | 输入 | 输出 | 状态 |
|---|----------|--------------|------|------|------|
| 1 | 物料需求计算 | `materialRequirements` | planId, productId, items | 物料清单（含 totalNeeded, stock, shortage） | ⬜ |
| 2 | 采购单智能拆单 | `handleGenerateProposedOrders` | materialRequirements, boms | 按供应商分组的采购建议 | ⬜ |
| 3 | 计划单 CRUD | plans 增删改 | 计划单数据 | 保存结果 | ⬜ |
| 4 | BOM CRUD | boms 增删改 | BOM 数据 | 保存结果 | ⬜ |

**注意**：`stableMockStock` 需替换为真实库存查询（可复用 PSI 库存 API）。

---

## 4. 财务 (Finance)

| # | API/能力 | 对应前端逻辑 | 输入 | 输出 | 状态 |
|---|----------|--------------|------|------|------|
| 1 | 财务记录 CRUD | FinanceOpsView | 记录数据 | 保存结果 | ⬜ |
| 2 | 按类型列表 | records.filter(r => r.type === activeTab) | type | 记录列表 | ⬜ |
| 3 | 收支汇总 | Dashboard 财务统计 | - | totalReceipts, totalPayments | ⬜ |

---

## 5. 基础数据（系统设置 + 基本信息）

### 5.1 系统设置入口 (SettingsView) — 4 个子模块

| # | API/能力 | 管理实体 | 说明 | 状态 |
|---|----------|----------|------|------|
| 1 | 产品分类 CRUD | categories | 含 customFields | ⬜ |
| 2 | 合作单位分类 CRUD | partnerCategories | 含 customFields | ⬜ |
| 3 | 工序节点 CRUD | globalNodes | 含 reportTemplate、enablePieceRate | ⬜ |
| 4 | 仓库 CRUD | warehouses | - | ⬜ |

### 5.2 基本信息入口 (BasicInfoView) — 5 个子模块

| # | API/能力 | 管理实体 | 说明 | 状态 |
|---|----------|----------|------|------|
| 1 | 产品 CRUD | products | ProductManagementView 嵌入 | ⬜ |
| 2 | BOM CRUD | boms | 关联 products | ⬜ |
| 3 | 合作单位 CRUD | partners | 关联 partnerCategories | ⬜ |
| 4 | 工人 CRUD | workers | assignedMilestoneIds | ⬜ |
| 5 | 设备 CRUD | equipment | assignedMilestoneIds | ⬜ |
| 6 | 字典 CRUD | dictionaries | colors, sizes, units | ⬜ |

---

## 6. 生产管理 (Production)

| # | API/能力 | 对应前端逻辑 | 输入 | 输出 | 状态 |
|---|----------|--------------|------|------|------|
| 1 | 工单 CRUD | orders 增删改 | 工单数据 | 保存结果 | ⬜ |
| 2 | 工单删除（含校验） | OrderDetailView handleDelete | orderId | 校验：报工、prodRecords、子工单 | ⬜ |
| 3 | 生产操作记录 CRUD | ProductionMgmtOpsView | prodRecords | 领料出库/外协/返工/生产入库 | ⬜ |
| 4 | 计划转工单 | App onConvertToOrder | planId | 新建 orders，更新 plans.status | ⬜ |

**注意**：工单删除前需校验无报工、无 ProductionOpRecord、无子工单；后端可复用相同规则。

---

## 7. 前后端职责划分建议

| 层级 | 职责 |
|------|------|
| 后端 | 数据持久化、聚合计算（库存、已入库、汇总统计）、单据号生成、业务校验 |
| 前端 | UI、表单校验、调用 API、本地缓存/乐观更新、列表分组展示（若后端返回明细则前端仅做展示分组） |

**建议**：库存、已入库、财务汇总等计算优先放在后端，保证数据一致性；前端仅负责展示与交互。

---

*接入数据库时按此清单逐项实现，并同步更新本文档状态。*
