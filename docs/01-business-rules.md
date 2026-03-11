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

### 3.1 物料需求计算与计划用量 (materialRequirements)

**逻辑**：多级 BOM 递归，理论总需量按层级由生产计划/父件计划用量驱动。

- 一级（如全毛黑色）：理论总需量 = 生产计划数量 × BOM 用量；计划用量默认 = 缺料数
- 二级（如毛条）：理论总需量 = 全毛黑色**计划用量** × BOM 比例；计划用量默认 = 缺料数
- 三级（如羊毛）：理论总需量 = 毛条**计划用量** × BOM 比例；计划用量默认 = 缺料数
- **计划用量默认 = 计算缺料数**（理论总需量 − 库存）

**计划用量**：BOM 表格中可编辑列，为生产/采购的确认数量。修改父件计划用量会联动下级理论总需量。

**创建子工单**：对有计划用量且可生产（有工序路线）的物料，批量创建或更新子计划单。**按 BOM 层级建立父子关系**：一级物料挂当前计划下，二级物料挂对应一级子计划下，支持多级（父→子→孙…）。

**stock**：当前为 mock，后续需接入真实库存。

**位置**：`views/PlanOrderListView.tsx` → `materialRequirements`、`plannedQtyByKey`、`handleCreateSubPlansFromPlannedQty`、`onCreateSubPlans`

### 3.2 采购单智能拆单

仅统计**无下级 BOM** 的物料；数量取**计划用量**。**全部缺料物料的计划用量填写完成后**才允许生成采购订单。

**位置**：`views/PlanOrderListView.tsx` → `handleGenerateProposedOrders`

### 3.2.1 计划单号与工单号（单据编号生成逻辑）

| 类型 | 格式 | 规则 |
|------|------|------|
| 计划单号 | PLN1, PLN2, ... | 按现有 plans 解析 `PLN-?(\d+)`，取 max+1 |
| 子计划单号 | PLN1-S1, PLN1-S2, ... | 从父计划 BOM 创建：`{父计划号}-S{序号}`；多级为 PLN1-S1-S1 等 |
| 工单号 | WO1, WO2, ... | 计划转工单时 `PLN`→`WO` 替换 |
| 子工单号 | WO1-S1, WO1-S2, ... | 由子计划单号转换，多级如 WO1-S1-S1 |

**转工单规则**：点击父计划「下达工单」时，递归转换父计划及所有子孙计划；父→主工单，子计划→子工单（设 parentOrderId），全部标记 CONVERTED。**补充下达**：父计划已转、后补子计划时，在父计划行显示「补充下达子工单」，仅转换未下达的子计划并挂到已有父工单下。

**位置**：`PlanOrderListView.tsx` → `getNextPlanNumber`；`App.tsx` → `onConvertToOrder` 中生成工单号；`onCreateSubPlan`、`onCreateSubPlans`

### 3.3 子工单 (Sub-Plans) 规则

| 规则项 | 说明 |
|--------|------|
| **创建** | 在父计划或子计划详情页点击「创建子工单」，按 BOM 层级递归创建；一级物料挂当前计划，二级挂对应一级子计划，支持多级 |
| **计划单号** | 子计划：`{父计划号}-S{序号}`；孙计划：`{父计划号}-S{序号}-S{序号}`（如 PLN879258-S1-S1） |
| **列表展示** | 递归展示父-子-孙等多级，按层级缩进；支持四阶、五阶及以上 |
| **子计划查找** | 用料清单、计划用量、状态等按**当前计划子树**递归查找，不混用父计划 |
| **采购单关联** | 子工单创建的采购单 note 含当前计划单号；查找时匹配**当前计划及所有祖先**的单号 |
| **下达** | 递归转换所有子孙计划；父已转时仅转换未转的子计划，挂到已有父工单 |
| **补充下达** | 父计划已 CONVERTED、存在未转子计划时，父计划行显示「补充下达子工单」；列表卡片、分组、详情页均有入口 |

**补充下达场景**：父计划先下达→工单中心有主工单；后创建子计划（如毛条）→子计划无法单独下达；点击父计划「补充下达子工单」→仅转换子计划并挂到已有主工单下。

**位置**：`PlanOrderListView.tsx` → `getAllDescendantsWithDepth`、`hasUnconvertedSubPlans`、`findSubPlanForMaterial`、`planNumbersForPO`；`App.tsx` → `onConvertToOrder` 补充逻辑

### 3.4 工单表单配置 (OrderFormSettings)

**结构**：与计划单表单配置相同，含 `standardFields`、`customFields`，控制列表/详情页字段显示。

**标准字段**：工单号、客户、交期、开始日期。产品、SKU、总量、状态为固定展示，不在此配置。

**位置**：`App.tsx` 持久化 `orderFormSettings`；`OrderListView.tsx` 表单配置弹窗；`OrderDetailView.tsx` 按配置显示详情字段

### 3.5 工单创建与来源

**规则**：工单仅允许由生产计划「下达工单」生成，工单中心不提供「新建工单」入口。

**位置**：`OrderListView.tsx` 无创建按钮；`App.tsx` → `onConvertToOrder`

### 3.6 工单中心列表展示

| 规则项 | 说明 |
|--------|------|
| **父子分组** | 主工单及子工单以分组形式展示，与计划单一致；标题「主工单及子工单（共 N 条）」 |
| **收缩/展开** | 分组支持收缩/展开，默认收缩；收缩时仅显示主工单 |
| **层级缩进** | 子工单按 depth 缩进，带「子工单」标签 |

**位置**：`OrderListView.tsx` → `parentToSubOrders`、`getAllDescendantsWithDepth`、`listBlocks`、`expandedParents`、`toggleExpand`

### 3.7 生产计划创建校验

**规则**：创建计划时，若所选产品未配置工序（`milestoneNodeIds` 为空），保存时提示「该产品未配置工序，不允许创建生产计划。请先在产品管理中为该产品添加工序。」并阻止创建。

**位置**：`PlanOrderListView.tsx` → `handleCreate`

### 3.8 工单删除

**规则**：工单详情页提供「删除工单」按钮。以下任一情况**不允许删除**，需用户先处理相关数据：

| 条件 | 提示 |
|------|------|
| 有报工记录 | 该工单已有报工记录，不允许删除 |
| 存在 ProductionOpRecord（领料出库/外协/返工/生产入库） | 该工单存在 N 条关联单据，请先在相关模块删除后再试 |
| 存在子工单 | 该工单存在 N 条子工单，请先删除子工单后再试 |

通过校验后二次确认，删除后跳转回工单中心。

**位置**：`OrderDetailView.tsx` → `handleDelete`；`App.tsx` → `onDeleteOrder`

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
| 工序节点库 | globalNodes | `gn-${Date.now()}` | 含 reportTemplate、enablePieceRate（是否开启计件工价），填报项 id: `f-${Date.now()}` |
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

**工序工价**：工序节点库中可为每道工序开启「计件工价」；开启后，产品与 BOM 中可配置该工序工价（元/件），生产计划详情中显示工价输入；未开启的工序不显示工价。计价方式已简化为仅计件（元/件），计时已移除。

**位置**：`views/BasicInfoView.tsx`、`views/ProductManagementView.tsx`

---

## 6. 待补充模块

- [ ] 生产报工 (ProductionMgmtOpsView)
- [ ] 其他新增业务模块

---

*最后更新：补充工序工价规则（仅计件、enablePieceRate 开关）；工单创建来源、工单中心列表展示、计划创建校验、工单删除规则。*
