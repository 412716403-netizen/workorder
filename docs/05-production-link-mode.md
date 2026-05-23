# 生产关联模式设计与现状说明

> 本文档说明系统中的两种生产关联模式：`order`（关联工单）与 `product`（关联产品）。它既保留设计目标，也补充当前项目现状，避免继续把它当成“未来才会实现的纯需求文档”。

## 1. 这份文档回答什么

1. 两种模式分别意味着什么
2. 计划、工单、报工、生产操作、看板、打印分别怎么受影响
3. 哪些数据模型因此发生变化
4. 当前仓库处于“哪部分已落地、哪部分仍需收口”

---

## 2. 两种模式概览

| 维度 | 关联工单 `order` | 关联产品 `product` |
|------|------------------|--------------------|
| 生产对象 | 工单 | 产品 |
| 计划视角 | 客户 / 交期 / 父子计划更突出 | 产品维度更突出 |
| 报工目标 | 工单 + 工序 + 规格 | 产品 + 工序 + 规格 |
| 生产操作 | 主要围绕工单 | 可弱化工单，强调产品 |
| 进度归属 | `ProductionOrder.milestones` | `ProductMilestoneProgress` |
| 看板口径 | 工单维度 | 产品维度 |
| 打印字段 | 更偏工单号 / 计划号 | 更偏产品 / 批次 / 规格 |

### 2.1 当前推荐理解

- `order` 不是旧方案，它仍是当前系统的重要主路径
- `product` 不是完全独立的新系统，而是同一套生产域在不同数据归属下的另一种模式
- 两种模式不应该各自长出一套完全割裂的页面和模型，而应共享大部分基础设施

---

## 3. 当前现状

### 3.1 已经明确存在的内容

- 前端类型中已有 `ProductionLinkMode`
- 聚合状态中已有 `productionLinkMode`
- 数据模型中已有 `ProductMilestoneProgress`
- 生产操作记录中 `orderId` 已允许为空
- 文档和代码都已存在“关联工单 / 关联产品”双模式语义

### 3.2 当前仍需收口的点

- 不是所有页面都已经完全按双模式收敛
- 看板、打印、工单详情、生产操作等链路仍需要持续核对是否口径一致
- 文档之前长期偏“设计稿”视角，现需同时体现“已经存在的结构事实”

---

## 4. 模式配置

### 4.1 配置项

| 键 | 类型 | 取值 | 默认 |
|----|------|------|------|
| `productionLinkMode` | `'order' \| 'product'` | `order` / `product` | `order` |

### 4.2 当前归属

该配置当前已是实际系统配置的一部分，不应再被视为“未来待加字段”。

### 4.3 变更原则

- 配置变更后，优先影响**新产生的数据**
- 历史数据不应被隐式重写
- 统计、展示、打印应根据数据实际归属决定口径，而不是只看当前模式开关

---

## 5. 关联工单模式 (`order`)

这是当前最稳定、最完整的主路径之一。

| 模块 | 行为 |
|------|------|
| 计划单 | 显示客户、交期；支持父子计划 |
| 计划转工单 | 保留父子工单结构 |
| 工单中心 | 按父子工单分组 |
| 报工 | 以工单工序为中心 |
| 生产操作 | 通常围绕 `orderId` 展开 |
| 工单删除 | 需校验报工、生产操作、子工单 |
| 看板 | 以工单和工序完成率为主 |
| 打印 | 通常显示工单号、计划号、客户等字段 |

### 5.1 典型数据归属

- 报工进度主要落在 `ProductionOrder.milestones`
- `ProductionOpRecord.orderId` 通常存在
- 工单是追踪生产过程的主要组织单位

---

## 6. 关联产品模式 (`product`)

该模式的核心是：**进度与操作更强调产品维度，而不是具体工单维度**。

| 模块 | 目标行为 |
|------|------|
| 计划单 | 更强调产品本身，客户字段可弱化或隐藏 |
| 工单中心 | 可按产品分组，弱化父子工单层级 |
| 报工 | 围绕“产品 + 工序 + 规格”记录 |
| 生产操作 | 允许 `orderId` 为空，只关联产品 |
| 进度归属 | 主要写入 `ProductMilestoneProgress` |
| 看板 | 更偏产品级任务量与产品级完成率 |
| 打印 | 更偏产品、规格、批次、标签等字段 |

### 6.1 多规格规则

两种模式下，多规格产品都不应丢失规格维度：

| 场景 | 规则 |
|------|------|
| 报工 | 按规格记录 |
| 产品进度 | 允许按 `productId + variantId + 工序` 聚合 |
| 领料 / 出入库 | 可按产品主维度处理，是否细化到规格应按业务口径决定 |

### 6.2 删除与历史数据

切换到 `product` 模式后，不应要求历史工单数据自动完全迁就新口径。  
原则是：

- 历史工单数据保留
- 新数据按新模式落库
- 统计时根据真实数据归属决定聚合方式

---

## 7. 受影响的数据模型

### 7.1 `ProductionOpRecord`

关键点不是“字段新增”，而是**`orderId` 的业务语义变化**：

- `order` 模式：通常必填
- `product` 模式：允许为空，重点改由 `productId` 承担关联

### 7.2 `ProductMilestoneProgress`

这是 `product` 模式的核心进度模型，用于表达：

`产品 × 规格 × 工序 -> 已完成数量 / 报工流水`

它的意义是把进度从“某张工单的工序”抽到“某个产品在某个工序上的累计状态”。

### 7.3 `ProductionOrder`

在 `product` 模式下，`ProductionOrder` 仍可能保留，但它不一定继续承担唯一进度真源的职责。

---

## 8. 关键链路如何分支

### 8.1 计划转工单

| 模式 | 主要差异 |
|------|------|
| `order` | 强调父子工单结构、工单连续性 |
| `product` | 可保留工单作为执行单元，但进度归属和展示可更偏产品 |

### 8.2 报工

| 模式 | 主要差异 |
|------|------|
| `order` | 写入工单工序进度 |
| `product` | 写入产品工序进度 |

### 8.3 生产操作

| 模式 | 主要差异 |
|------|------|
| `order` | 表单更强调选择工单 |
| `product` | 表单更强调选择产品，允许 `orderId` 为空 |

### 8.4 看板与统计

| 模式 | 主要差异 |
|------|------|
| `order` | 活跃工单、工单工序完成率 |
| `product` | 有任务的产品数、产品级完成率、产品工序汇总 |

### 8.5 打印

| 模式 | 主要差异 |
|------|------|
| `order` | 工单号、计划号、客户字段更重要 |
| `product` | 产品、规格、批次、标签字段更重要 |

---

## 9. 当前实现与文档维护原则

### 9.1 不要再把它当成纯“未来开发说明”

这份文档现在应同时承担两件事：

- 解释双模式的业务语义
- 记录当前仓库已经出现的结构事实

### 9.2 变更时同步更新哪些文档

| 变化类型 | 需要同步的文档 |
|------|------|
| 模式规则调整 | 本文档、`01-business-rules.md` |
| 数据归属变化 | 本文档、`02-data-structures.md` |
| 模块落地 / 收口状态变化 | 本文档、`04-migration-checklist.md`、`06-current-architecture-and-migration-status.md` |

---

## 10. 当前剩余收口项

1. 继续核对各页面是否真的按模式切换了数据归属和展示口径
2. 统一看板、打印、生产操作在两种模式下的字段口径
3. 避免出现“前端页面按产品模式展示，后端统计仍按工单模式计算”的漂移
4. 把模式分支沉淀为更稳定的 hooks / service / 文档结构，而不是散落在超大页面里
5. 工单卡圆心圆周已报量在 `product` 模式下采用 PMP 按 `items.quantity` 比例摊回的**估算值**，精确数字以产品维度详情为准

---

## 12. 关键计算口径（混读规则）

为避免模式切换时进度数据"看起来消失"，前后端采取**一致的"PMP + milestone 双路求和"读口径**：

| 入口 | 已报口径 | 剩余口径 | 备注 |
|------|----------|----------|------|
| `ReportModal`（工单维度报工） | `combinedCompletedAtTemplate` = PMP(同 product+template) + milestone.completedQuantity | `可报最多 - 已报 - 外协未收回`；外协未收回单独显示 | 写入仍按当前模式分流到 PMP 或 milestone |
| `OrderDetailModal` 工序进度表 | 同上 | — | 与 `ReportModal` 完全一致 |
| `OrderListView` 工单卡圆心 | milestone + (PMP × `items.quantity / Σorders.totalQty` 比例摊回) | 圆下数字仍为 `可报 - 已报`（不扣外协）；**hover tooltip** 追加「外协剩余 Z 件」作为补充信息 | **估算值**，仅展示用 |
| `OrderListView` 产品组卡 | PMP + 该产品下所有工单 milestone 求和 | 同上，外协合并产品维度 + 旗下所有工单维度后只在 tooltip 显示 | 精确值 |
| 后端 `GET /orders/:id/reportable` | PMP(同 product+template) + milestone.completedQuantity | — | 与前端口径完全一致 |

写口径仍按当前 `productionLinkMode` 分流：
- `order` 模式：写 `Milestone` + `MilestoneReport`
- `product` 模式：写 `ProductMilestoneProgress` + `ProductProgressReport`

切回旧模式时**新增数据**走旧路径，但**历史数据保留在 PMP**，因此读口径必须双路合并才不会"丢"。

---

## 13. 后端硬校验

`createReport` / `createProductReport` 在写入前调用 `enforceReportQuantity`：

- 受 `SystemSetting.allowExceedMaxReportQty` 控制
- `false`（默认）：拒绝 `(已报+本次) > totalQty` 的请求，防止前端校验被绕过
- `true`：完全放行，由业务自行决定是否超报
- `order` 范围以 `ProductionOrder.totalQty` 为上限
- `product` 范围以该产品下所有工单 `Σ totalQty` 为上限

这是一道**保守兜底**，复杂的顺序工序 / 不良 / 返工细粒度规则仍由前端按场景计算。

---

## 14. 模式切换前的提示

`views/settings/ProductionConfigTab.tsx` 切换 `productionLinkMode` / `processSequenceMode` 时使用 `useConfirm` 弹出影响说明，避免用户在不了解数据归属变化的情况下切换。

---

## 15. 外协跨模式收回（方案 A）

`views/production-ops/OutsourcePanel.tsx` 的待收回清单（`outsourceReceiveRows`）以及收货录入弹窗（`OutsourceReceiveQuantityModal`）已脱离当前 `productionLinkMode`，改为按发出单原始 `orderId` 决定**行的"维度"**：

- `orderId` 非空：**工单级**，按 `orderId|nodeId|partner` 聚合；收回写回 `Milestone` + `MilestoneReport`
- `orderId` 为空：**产品级**，按 `productId|nodeId|partner` 聚合；收回写回 `ProductMilestoneProgress` + `ProductProgressReport`

工单级聚合**必须**包含 `partner`：同一工单同一工序若发给多个加工厂，待收回清单需要"分户"展示，
否则会被合并为一行（数量相加、partner 取首条）造成误收。key 形态、解析与集中实现见
`views/production-ops/outsourceReceiveKeys.ts`，三个调用方（`OutsourcePanel` /
`OutsourceReceiveListModal` / `OutsourceReceiveQuantityModal`）必须复用同一组工具，
禁止再手写 `${orderId}|${nodeId}` 旧形态。

UI 在「待收回清单」和「收货录入」两处都增加「维度」徽标（工单级 / 产品级），用户可在任一模式下看到并收回所有未完成发出单，避免模式切换造成的"数据黑洞"。  
"发出维度 = 收回维度"是核心不变量：工单级发出 → 工单级收回写回工单进度；产品级发出 → 产品级收回写回 PMP。

### 15.1 待收回清单扫码收货（先选加工厂 → 自动跳录入）

清单弹窗底部除「收货」外新增「扫码收货」按钮：选定加工厂、扫码命中后自动勾选对应行 + 累加数量 + 跳到「外协收货 · 录入数量」复核提交。这条路径与勾选→收货完全并行，最终提交链路一致。

为此 `OutsourcePanel` 派生**两份**聚合行：

- `outsourceReceiveRows`：过滤 `pending>0`，仍用于清单弹窗表格展示
- `outsourceReceiveAllAggregates`：**不过滤** `pending<=0`，用于：
  - 扫码会话「跨工厂 / 已收完」分流判定（详见 [docs/01-business-rules.md §5.4.2](./01-business-rules.md)）
  - `resolveOutsourceReceiveEntry` 解析（特例放行时注入的 pending=0 行也能被正确解析）
  - `OutsourceReceiveQuantityModal` 的 `visibleRows` 计算（确保扫码注入的 pending=0 行能被渲染）
  - `useEffect` 上次单价预填、`handleReceiveFormSubmit` 首行查找

工序锁定由 [`useOutsourceReceiveScan`](../hooks/useOutsourceReceiveScan.ts) hook 的 `isNodeAllowed` 闭包驱动；调用方（列表弹窗）持有 `scanLockedNodeId` state 并按首条命中码自动写入。

详细数据结构与提交链路见 `docs/02-data-structures.md` 与 `docs/06-current-architecture-and-migration-status.md`。

---

## 11. 一句话总结

`order` 和 `product` 不是两套独立系统，而是同一生产域在不同追踪粒度下的两种组织方式。  
当前仓库已经具备这两种模式的结构基础，但仍需要持续收口，确保数据归属、统计口径、打印字段和页面交互保持一致。
