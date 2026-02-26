# 业务规则文档

> 记录各模块核心计算逻辑、单据规则、分组约定。迁移到后端时需保证公式与规则一致。

---

## 1. 进销存 (PSI)

### 1.1 库存计算

**公式**：`库存 = base + 入库 - 出库`（不低于 0）

| 项 | 说明 |
|----|------|
| base | 全库：100；单仓库：20 |
| 入库 | `PURCHASE_BILL` 数量 + `TRANSFER` 的 `toWarehouseId` 指向当前仓库的数量 |
| 出库 | `SALES_BILL` 数量 + `TRANSFER` 的 `fromWarehouseId` 指向当前仓库的数量 |

**筛选条件**：按 `productId`、`warehouseId`（若指定）过滤；`TRANSFER` 需根据 `toWarehouseId` / `fromWarehouseId` 判断计入入库还是出库。

**位置**：`views/PSIOpsView.tsx` → `getStock(pId, whId?)`

### 1.2 采购订单已入库数量 (receivedByOrderLine)

**规则**：按 `(sourceOrderNumber, sourceLineId)` 汇总采购单中引用该订单行的数量。

- 数据来源：`type === 'PURCHASE_BILL'` 且 `sourceOrderNumber`、`sourceLineId` 均存在
- 汇总键：`${sourceOrderNumber}::${sourceLineId}`
- 汇总值：`quantity` 累加

**位置**：`views/PSIOpsView.tsx` → `receivedByOrderLine` useMemo

### 1.3 采购订单/采购单行分组 (lineGroupId)

**规则**：同一「添加」批次的多条记录共用同一个 `lineGroupId`，列表与详情均按组展示。

| 场景 | 展示 |
|------|------|
| 同一商品多个颜色尺码（同一次添加） | 1 行，数量为总数量 |
| 同一商品被多次添加 | 每次添加占 1 行 |
| 以「添加」为单位 | 第一次添加黑/均 10 件 + 第二次添加白/M 10 件 → 2 行 |

**实现**：保存时 `lineGroupId = item.id`（表单行 id）；引用采购订单生成采购单时继承 `lineGroupId`。  
**向后兼容**：无 `lineGroupId` 时用 `lineGroupId ?? item.id`，每条记录各成一组。

**位置**：`views/PSIOpsView.tsx` → 保存逻辑、列表分组、详情加载

### 1.4 单据号生成

| 类型 | 格式 | 规则 |
|------|------|------|
| 采购订单 | `PO-{partnerCode}-{seq}` | partnerCode 取 partnerId 前 8 位字母数字；seq 按该供应商已有订单递增 |
| 采购单 | `PB-{partnerCode}-{seq}` | 同上 |

**位置**：`views/PSIOpsView.tsx` → `generatePODocNumber`、`generatePBDocNumber`

### 1.5 单据替换时的顺序保持

编辑保存采购订单时，新记录插入到原记录在列表中的位置，不追加到末尾。

**位置**：`App.tsx` → `handleReplacePSIRecords`

---

## 2. 经营看板 (Dashboard)

### 2.1 生产统计

| 指标 | 计算 |
|------|------|
| 活跃订单数 | `orders` 中 `status !== 'SHIPPED'` 的数量 |
| 总工序数 | 所有订单 `milestones.length` 之和 |
| 已完成工序数 | `milestones` 中 `status === COMPLETED` 的数量 |
| 完成率 | `(completedMilestones / totalMilestones) * 100`，四舍五入 |

### 2.2 财务统计

| 指标 | 计算 |
|------|------|
| 累计收款 | `financeRecords` 中 `type === 'RECEIPT'` 的 `amount` 之和 |
| 累计支出 | `financeRecords` 中 `type === 'PAYMENT'` 的 `amount` 之和 |
| 现金流 | 收款 - 支出 |

### 2.3 库存预警

**规则**：`(100 + 入库 - 出库) < 10` 的产品数量（与 PSI 库存公式一致，base=100，且未考虑 TRANSFER）。

**位置**：`views/DashboardView.tsx`

### 2.4 订单进度

**公式**：`progress = round((sum(m.completedQuantity / totalOrderQty) / msCount) * 100)`  
- `totalOrderQty`：`order.items` 数量之和  
- `msCount`：`milestones.length`

---

## 3. 计划/BOM (PlanOrder)

### 3.1 物料需求计算 (materialRequirements)

**逻辑**：多级 BOM 递归展开，每层子项按**父件缺料数**计算。

- 一级：按计划数量 × BOM 用量
- 二级及以下：按父件 `shortage` × 子件 `unitPerParent`
- 有 variant 的：按 `variant.nodeBOMs` 按工序展开
- 无 variant：按 `single-{productId}` 的 BOM

**stock**：当前为 mock（`stableMockStock` = 根据 materialId 字符种子取 5–44），后续需接入真实库存。

**位置**：`views/PlanOrderListView.tsx` → `materialRequirements` useMemo

### 3.2 采购单智能拆单

仅统计**无下级 BOM** 的物料；有下级 BOM 的只取其下一级子件。按供应商聚合生成采购订单。

**位置**：`views/PlanOrderListView.tsx` → `handleGenerateProposedOrders`

---

## 4. 财务 (Finance)

### 4.1 财务记录类型

| type | 说明 |
|------|------|
| RECEIPT | 收款单 |
| PAYMENT | 付款单 |
| RECONCILIATION | 财务对账 |
| SETTLEMENT | 工人工资 |

### 4.2 汇总规则

按 `type` 过滤后，对 `amount` 求和。无复杂分组或状态过滤。

---

## 5. 系统设置与基本信息

> 9 个子模块，以 CRUD 为主，无复杂计算。规则主要为 ID 生成与关联约束。

### 5.1 系统设置 (SettingsView) — 4 个子模块

| 子模块 | 管理实体 | ID 生成格式 | 说明 |
|--------|----------|-------------|------|
| 产品分类管理 | categories | `cat-${Date.now()}` | 含 customFields，扩展项 id: `cf-${Date.now()}` |
| 合作单位分类 | partnerCategories | `pcat-${Date.now()}` | 含 customFields，扩展项 id: `pcf-${Date.now()}` |
| 工序节点库 | globalNodes | `gn-${Date.now()}` | 含 reportTemplate，填报项 id: `f-${Date.now()}` |
| 仓库分类管理 | warehouses | `wh-${Date.now()}` | code 可自动生成或手动填写 |

**位置**：`views/SettingsView.tsx`

### 5.2 基本信息 (BasicInfoView) — 5 个子模块

| 子模块 | 管理实体 | ID 生成格式 | 说明 |
|--------|----------|-------------|------|
| 产品与 BOM | products, boms | 见 ProductManagementView | 产品编辑、BOM 绑定、变体管理 |
| 合作单位 | partners | `pa-${Date.now()}` | 关联 partnerCategories |
| 工人管理 | workers | `w-${Date.now()}` | assignedMilestoneIds 关联工序派工 |
| 设备管理 | equipment | `e-${Date.now()}` | assignedMilestoneIds 关联工序派工 |
| 公共数据字典 | dictionaries | 颜色 `c-`、尺码 `s-`、单位 `u-` + Date.now() | colors, sizes, units 三组 |

**关联**：工人/设备可按工序筛选（全部、未分配、指定工序）；合作单位按 partnerCategory 筛选。

**位置**：`views/BasicInfoView.tsx`、`views/ProductManagementView.tsx`

---

## 6. 待补充模块

- [ ] 生产报工 (ProductionMgmtOpsView)
- [ ] 其他新增业务模块

---

*最后更新：按当前代码梳理。新模块开发完成后请在此补充对应规则。*
