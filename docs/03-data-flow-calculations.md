# 数据流与计算点清单

> 各模块使用的数据源、计算逻辑所在位置、依赖关系。用于迁移时快速定位与前后端职责划分。

---

## 1. 进销存 (PSI)

| 计算/功能 | 数据来源 | 位置 | 依赖 |
|-----------|----------|------|------|
| 库存 getStock | psiRecords | PSIOpsView.tsx L345 | PURCHASE_BILL, SALES_BILL, TRANSFER |
| receivedByOrderLine | psiRecords | PSIOpsView.tsx L548 | PURCHASE_BILL 的 sourceOrderNumber/sourceLineId |
| groupedRecords | psiRecords | PSIOpsView.tsx L659 | 按 docNumber 分组 |
| 列表按 lineGroupId 分组 | docItems | PSIOpsView.tsx L1397+ | lineGroupId \|\| item.id |
| 详情加载按 lineGroupId 分组 | docItems | PSIOpsView.tsx L1321+ | 同上 |
| 采购单转化 | availableItemsFromSelectedPOs | PSIOpsView.tsx handleConvertPOToBill | receivedByOrderLine |
| 单据号生成 | psiRecords | PSIOpsView.tsx L353-376 | 按 partner 过滤同类型记录 |
| 单据替换保持顺序 | psiRecords | App.tsx handleReplacePSIRecords | 无 |

---

## 2. 经营看板 (Dashboard)

| 计算/功能 | 数据来源 | 位置 | 依赖 |
|-----------|----------|------|------|
| 生产统计 | orders | DashboardView.tsx L56-61 | milestones |
| 财务统计 | financeRecords | DashboardView.tsx L64-66 | type, amount |
| 库存预警 | products, psiRecords | DashboardView.tsx L69-73 | PURCHASE_BILL, SALES_BILL（简化版库存） |
| 订单进度 | orders | DashboardView.tsx L76-83 | items, milestones |
| 财务饼图 | totalReceipts, totalPayments | DashboardView.tsx L85-88 | 同上 |

---

## 3. 计划/BOM (PlanOrderListView)

| 计算/功能 | 数据来源 | 位置 | 依赖 |
|-----------|----------|------|------|
| materialRequirements | viewPlan, viewProduct, tempPlanInfo.items, boms, products, globalNodes | PlanOrderListView.tsx L726 | BOM 递归、stableMockStock |
| 采购单智能拆单 | materialRequirements, boms | PlanOrderListView.tsx handleGenerateProposedOrders | hasSubBom、leafOnly |
| 计划与采购订单关联 | psiRecords | PlanOrderListView.tsx L678-691 | note 含 planMarker |
| 列表分组 listBlocks | plans | PlanOrderListView.tsx L1188+ | planNumber 等 |

---

## 4. 财务 (FinanceView / FinanceOpsView)

| 计算/功能 | 数据来源 | 位置 | 依赖 |
|-----------|----------|------|------|
| 按类型过滤 | financeRecords | FinanceView.tsx L56 | type === activeTab |
| 列表展示 | records | FinanceOpsView.tsx | 无聚合，直接展示 |

---

## 5. 系统设置 (SettingsView)

| 计算/功能 | 数据来源 | 位置 | 依赖 |
|-----------|----------|------|------|
| 产品分类 CRUD | categories | SettingsView.tsx | 含 customFields 增删改 |
| 合作单位分类 CRUD | partnerCategories | SettingsView.tsx | 含 customFields |
| 工序节点 CRUD | globalNodes | SettingsView.tsx | 含 reportTemplate、enablePieceRate |
| 仓库 CRUD | warehouses | SettingsView.tsx | 无 |

**说明**：以 CRUD 为主，无聚合计算。

---

## 6. 基本信息 (BasicInfoView)

| 计算/功能 | 数据来源 | 位置 | 依赖 |
|-----------|----------|------|------|
| 产品与 BOM | products, boms | ProductManagementView.tsx | 嵌入 BasicInfoView |
| 合作单位 CRUD | partners | BasicInfoView.tsx | 按 partnerCategory 过滤、搜索 |
| 工人 CRUD | workers | BasicInfoView.tsx | 按工序分类过滤（全部/未分配/指定工序） |
| 设备 CRUD | equipment | BasicInfoView.tsx | 同上 |
| 字典 CRUD | dictionaries | BasicInfoView.tsx | colors, sizes, units |

**说明**：filteredPartners 等为简单 filter，无复杂计算。

---

## 7. 生产管理

| 计算/功能 | 数据来源 | 位置 | 依赖 |
|-----------|----------|------|------|
| 工单父子分组 listBlocks | orders | OrderListView.tsx | parentToSubOrders、getAllDescendantsWithDepth |
| 工单收缩/展开 | expandedParents 状态 | OrderListView.tsx | toggleExpand |
| 工单删除校验 | order, prodRecords, orders | OrderDetailView.tsx handleDelete | 报工、ProductionOpRecord、子工单 |
| 生产操作记录列表 | prodRecords, orders | ProductionMgmtOpsView.tsx | orderId 关联 |

---

## 8. 数据流概览

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  psiRecords │────►│  PSIOpsView     │────►│ getStock     │
│             │     │  receivedBy...  │     │ groupedRec.. │
└─────────────┘     └────────┬────────┘     └──────┬───────┘
                             │                     │
                             ▼                     ▼
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│   orders    │────►│ DashboardView   │     │ 库存预警     │
│financeRec.. │     │ 生产/财务统计   │     │ (复用思路)   │
└─────────────┘     └─────────────────┘     └──────────────┘

┌─────────────┐     ┌─────────────────┐
│ plans, boms │────►│ PlanOrderList   │────► materialRequirements
│ products    │     │ View            │────► handleGenerateProposedOrders
└─────────────┘     └─────────────────┘

┌───────────────────────────────────────┐
│ 系统设置: categories, partnerCategories│
│           globalNodes, warehouses      │  SettingsView (CRUD)
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ 基本信息: products, boms, partners,   │
│           workers, equipment, dicts   │  BasicInfoView + ProductManagementView
└───────────────────────────────────────┘
```

---

*新模块开发完成后，请在此补充对应行。*
