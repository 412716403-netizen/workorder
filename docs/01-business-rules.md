# 业务规则文档

> 本文档记录“业务应该怎样算、怎样约束”。它不负责描述当前代码完整落点，也不默认前端旧实现仍是真源。当前架构与迁移阶段请看 [`06-current-architecture-and-migration-status.md`](./06-current-architecture-and-migration-status.md)。

## 阅读说明

1. 本文档回答“规则是什么”
2. `02-data-structures.md` 回答“数据归谁管”
3. `04-migration-checklist.md` 回答“哪些模块已落地、哪些仍需收口”
4. 文中“实现锚点”仅用于帮助定位代表性代码，不等于唯一真源

---

## 1. 进销存 (PSI)

采购订单、采购入库、调拨、盘点：**无颜色尺码**（单行数量、非规格矩阵）时，数量允许为**非负小数，至多 2 位小数**（与 `PsiRecord.quantity` Decimal(12,2) 一致）；有颜色尺码时规格格仍为**整数**件数。

### 1.1 库存计算

**目标规则**：库存应由统一库存口径计算并返回，前后端保持一致。

**历史前端公式**：`库存 = base + 入库 - 出库`（不低于 0）

| 项 | 说明 |
|----|------|
| base | 历史前端 mock：全库 100；单仓库 20 |
| 入库 | `PURCHASE_BILL` 数量 + `TRANSFER` 中 `toWarehouseId` 指向当前仓库的数量 |
| 出库 | `SALES_BILL` 数量 + `TRANSFER` 中 `fromWarehouseId` 指向当前仓库的数量 |

**筛选条件**：按 `productId`、`warehouseId`（若指定）过滤；`TRANSFER` 需根据目标仓 / 来源仓判断计入方向。

**当前要求**：

- 若后端库存接口已提供真实库存，则以后端结果为准
- 历史 mock 公式只保留为旧实现兼容说明，不应继续扩散为业务真相

**代表性实现锚点**：`views/PSIOpsView.tsx`、`services/api.ts`

### 1.2 采购订单已入库数量 (`receivedByOrderLine`)

**规则**：按 `(sourceOrderNumber, sourceLineId)` 汇总采购入库中引用该订单行的数量。

- 数据来源：`type === 'PURCHASE_BILL'` 且 `sourceOrderNumber`、`sourceLineId` 均存在
- 汇总键：`${sourceOrderNumber}::${sourceLineId}`
- 汇总值：`quantity` 累加

**用途**：用于采购订单关联采购入库时判断已入库数量、剩余可转数量。

### 1.3 行分组 (`lineGroupId`)

**规则**：同一“添加批次”的多条记录共用同一个 `lineGroupId`，列表与详情按组展示。

| 场景 | 展示 |
|------|------|
| 同一商品多个颜色尺码（同一次添加） | 合并为 1 组，数量按组汇总 |
| 同一商品被多次添加 | 每次添加为独立 1 组 |
| 历史数据无 `lineGroupId` | 回退到 `lineGroupId ?? item.id`，每条记录自成一组 |

### 1.3.1 产品分类「批次管理」与库存分桶

**适用**：仅当产品所属分类满足 `categoryUsesBatchManagement`（`hasBatchManagement` 且未启用颜色尺码）时，该产品在采购入库、生产领料（含返工领料）、外协物料发出、**销售出库**等出库类单据上要求按 `batchNo` 维度扣减；退料类单据须从**该仓库现存批次**中选择批号（与领料一致，不允许手输虚构批号；采购入库新建批号仍用手输 + datalist 提示，见 `MaterialIssueBatchSelect` 的 `mode='return'`）。

**颜色尺码 ↔ 批次互斥**：同一分类不可同时启用 `hasColorSize` 与 `hasBatchManagement`（设置页互斥 + 后端 `settings` 校验）。

**库存口径**：`batchNo` 有值的流水进入「产品 + 仓库 + 批号」分桶；历史无批次的生产/PSI 行仍计入产品级总库存，**同时**也会被归一到「无批号」哨兵桶后参与按批次结存（详见下文「无批号哨兵」）。服务端对 `STOCK_OUT`（本厂领料与外协物料发出）在分类启用批次时校验批号必填且 `(productId, warehouseId, batchNo)` 可用量 ≥ 本次数量；前端下拉与 `GET /psi/stock/batches` 一致。工单中心领料下拉在 API 结果基础上与前端 PSI 快照按批号合并余量（取较大值），减轻「刚保存尚未刷新接口」时的空列表。

**无批号哨兵 (`BATCH_NO_UNTAGGED = '无批号'`)**：批次类分类下仍会出现「采购入库未输入批号」「历史空批号流水」等情况——此时数据库 `batch_no` 字段为 `NULL`，但 UI / API / 打印需要把它作为一条**可选批次**展示与流转。约定如下：

- **DB 真源仍是 `NULL`**：不需要数据迁移；`shared/types.ts` 导出的常量 `BATCH_NO_UNTAGGED` 仅用于 UI / API / 打印的展示与等价匹配。
- **写入路径**：`backend/src/services/psi.service.cleanPsi` 把 `BATCH_NO_UNTAGGED` 视同未填、字段最终落 `NULL`；`productionStockBatchWriteValidation` 对 `STOCK_OUT` / `STOCK_RETURN` 接受哨兵字符串通过必填校验，库存可用量按 NULL 桶结存判断后落 `NULL`。**真正的空字符串 / 漏传字段仍按"漏填批号"拒绝**（语义清晰：只有显式选了"无批号"才放行）。
- **读取路径**：`getStockBatches` 不再过滤 `batchNo IS NULL`，所有 NULL 流水按 `BATCH_NO_UNTAGGED` 哨兵桶聚合并与真实批号一并返回；前端 `usePsiStockIndex` 的 `lineBatchNo` 与 `listAvailableBatches` 与之对齐，"无批号" 同样进入领料/退料/调拨/销售出库下拉。
- **采购入库 UI**：批次输入框 `placeholder = "留空 = 无批号"`（不预填），让"采购到货时还没贴批号"成为合法默认；保存后对应 PSI 行 `batch_no = NULL`，但库存与下拉均以"无批号"展示。
- **打印 / 详情列表**：`buildSalesBillPrintListRows`、`buildPurchaseBillPrintListRows`、`buildMaterialStockDocPrintContext`、采购/销售/外协物料/仓库流水**单据详情**等展示位，统一把 NULL/空批号渲染为 `BATCH_NO_UNTAGGED`，避免空白列。
- **业务批号禁用**：真实业务批号不要使用字符串字面量 "无批号"，否则会被当作未填、自动归一为 `NULL`。

**外协物料退回的批次清单（特例）**：退料界面的批次下拉**不**走"当前仓库可用余量"，而是按该工厂历史 `STOCK_OUT` 流水里出现过的批号汇总（NULL/空批号统一归一为 `BATCH_NO_UNTAGGED`），并**不**显示余量后缀——避免「物料全部发出后仓库清零导致退不回来」的死循环。后端落库仍走 `validateStockReturnBatchOnWrite`，哨兵字符串通过校验后 `batch_no` 仍写 `NULL`。

**调拨 (`TRANSFER`)**：分类启用批次时，调出仓须选择批号，数量不得超过该批在调出仓的可用结存；调入/调出两条 PSI 行均写入同一 `batchNo`。

**盘点 (`STOCKTAKE`)**：批次类物料无颜色尺码矩阵；每行对应一个 `batchNo`，系统数量按该批桶结存计算，`diffQuantity = 实盘 − 该批系统库存`。

**仓库管理**：批次类产品在「按物料」或「按仓库」结存格子上可展开查看该仓各批号结存（懒加载 `getStockBatches`）。

**采购订单（`PURCHASE_ORDER`）与批次**：采购订单**不写入** `psi_records`、不产生库存结存，行上**不要求**批次号。批次约束发生在**转采购入库（`PURCHASE_BILL`）**时：与采购入库、销售出库等一致，按分类 `categoryUsesBatchManagement` 在入库界面选择/填写 `batchNo`。若未来业务要求「订单阶段即锁定批号」，需单独建模（订单行预占批号），当前产品未实现。

**展示边界**：生产物料主面板、领料/退料流水列表、仓库流水**列表**主表仍可为总账；仓库流水**单据详情**、采购入库详情（有条件列）、对应打印模板可选用 `行.batchNo`；仓库列表展开子表展示批次结存。

### 1.4 单据号生成

| 类型 | 格式 | 规则 |
|------|------|------|
| 采购订单 | `PO-{partnerCode}-{seq}` | `partnerCode` 取 `partnerId` 前 8 位字母数字；`seq` 按该供应商已有订单递增 |
| 采购入库 | `PB-{partnerCode}-{seq}` | 同上 |

### 1.5 替换保存时顺序保持

编辑保存采购订单时，新记录应插回原列表位置，而不是直接追加到末尾。

---

## 2. 经营看板 (Dashboard)

> 看板指标口径应逐步由后端聚合统一返回，下列定义用于说明指标“应该怎么算”。

### 2.1 生产统计

| 指标 | 规则 |
|------|------|
| 活跃订单数 | `orders` 中 `status !== 'SHIPPED'` 的数量 |
| 总工序数 | 所有订单 `milestones.length` 之和 |
| 已完成工序数 | `milestones` 中 `status === COMPLETED` 的数量 |
| 完成率 | `(completedMilestones / totalMilestones) * 100`，四舍五入 |

### 2.2 财务统计

| 指标 | 规则 |
|------|------|
| 累计收款 | `financeRecords` 中 `type === 'RECEIPT'` 的 `amount` 之和 |
| 累计支出 | `financeRecords` 中 `type === 'PAYMENT'` 的 `amount` 之和 |
| 现金流 | 收款 - 支出 |

### 2.3 库存预警

**历史前端规则**：`(100 + 入库 - 出库) < 10` 的产品数量。

**当前要求**：库存预警阈值与库存口径应以后端库存结果为准，避免看板与 PSI 明细出现口径漂移。

### 2.4 订单进度

**公式**：`progress = round((sum(m.completedQuantity / totalOrderQty) / msCount) * 100)`

- `totalOrderQty`：`order.items` 数量之和
- `msCount`：`milestones.length`

---

## 3. 计划 / BOM / 工单

### 3.1 物料需求计算与计划用量 (`materialRequirements`)

**逻辑**：多级 BOM 递归，理论总需量按层级由生产计划数量或父件计划用量驱动。

- 一级物料：理论总需量 = 生产计划数量 × BOM 用量
- 二级物料：理论总需量 = 一级物料计划用量 × BOM 比例
- 三级及以下：按上一层计划用量继续递推
- 默认计划用量 = 缺料数 = 理论总需量 - 库存

**计划用量**：是 BOM 表格中可编辑的确认数量，用于后续生产 / 采购决策。

**当前要求**：库存不应长期依赖 mock，应逐步接入真实库存或后端物料可用量。

### 3.2 采购单智能拆单

仅统计**无下级 BOM** 的叶子物料；数量取**计划用量**。所有缺料物料的计划用量填写完成后，才允许生成采购订单。

### 3.3 单据编号规则

| 类型 | 格式 | 规则 |
|------|------|------|
| 计划单号 | `PLN1`, `PLN2`, ... | 从已有计划单号中解析最大编号后递增 |
| 子计划单号 | `PLN1-S1`, `PLN1-S2`, ... | 从父计划派生；多级继续追加 `-S{序号}` |
| 工单号 | `WO1`, `WO2`, ... | 主计划下达时由计划单号转换 |
| 子工单号 | `WO1-S1`, `WO1-S2`, ... | 由子计划单号转换得到 |

### 3.4 子计划 / 子工单层级

| 规则项 | 说明 |
|--------|------|
| 创建 | 按 BOM 层级递归创建 |
| 关系 | 一级挂父计划，二级挂一级子计划，依此类推 |
| 展示 | 列表按层级递归缩进 |
| 下达 | 支持递归下达所有子孙计划 |
| 补充下达 | 父计划已下达后，可只下达新增子计划并挂到既有父工单下 |

### 3.5 工单来源

工单只允许由生产计划“下达工单”生成，工单中心本身不提供任意新建工单入口。

### 3.6 工单列表展示

| 规则项 | 说明 |
|--------|------|
| 父子分组 | 主工单及子工单以分组形式展示 |
| 收缩 / 展开 | 默认可收缩，仅显示主工单 |
| 层级缩进 | 子工单按 depth 缩进，保留层级关系 |

### 3.7 创建计划校验

创建计划时，若所选产品未配置工序（`milestoneNodeIds` 为空），应阻止创建并提示先配置工序。

### 3.8 工单删除校验

以下任一情况不允许删除工单：

| 条件 | 提示方向 |
|------|------|
| 有报工记录 | 先删除报工或处理历史数据 |
| 有 `ProductionOpRecord` | 先删除关联领料 / 外协 / 返工 / 入库单据 |
| 有子工单 | 先删除子工单 |

通过校验后再进行二次确认，删除后返回工单中心。

### 3.9 工单表单配置

`OrderFormSettings` 结构与计划单表单配置一致，控制列表 / 详情页展示字段。

标准可配置字段主要包括：工单号、客户、交期、开始日期。  
产品、SKU、总量、状态通常为固定展示字段。

**列表显示**（关联工单模式）：

| 开关 | 字段 | 效果 |
|------|------|------|
| 仅显示未完成 | `orderFormSettings.listDisplay.onlyShowNotCompleted` | 工单中心分页列表传 `excludeCompleted=true`，SQL 过滤 `dispatchStatus=IN_PROGRESS` |

计划单表单配置 **列表显示** 页签另有「仅显示未完成 / 未下单」（`planFormSettings.listDisplay.onlyShowNotCompleted`），列表传 `excludeCompleted=true`，后端按派生 `PlanDispatchStatus` 内存过滤（隐藏 `COMPLETED`）。

### 3.10 派发完成状态徽章（关联工单模式专属）

仅在「关联工单模式」(`productionLinkMode === 'order'`) 的工单中心与计划单列表展示。

#### 工单层（`ProductionOrder.dispatchStatus`，持久化）

| 状态 | 中文 | 判定 |
|------|------|------|
| `IN_PROGRESS` | 进行中 | 默认；入库累计不足或被回退 |
| `COMPLETED`   | 已完成 | `sum(STOCK_IN.quantity WHERE orderId=order.id) ≥ sum(items.quantity)` |

- **自动推进**：所有改变 `STOCK_IN` 数据的入口（`createRecord` / `createRecordBatch` 内单条 / `updateRecord` / `deleteRecord`）在事务后调用 `recalcOrderDispatchStatusByStockIn`，当 `dispatchStatusManual=false` 时自动推进。
- **手动覆盖**：用户在工单中心点击徽章 → `PATCH /api/orders/:id/dispatch-status`，后端写 `dispatchStatusManual=true`，自动逻辑不再覆盖该工单。
- **回退**：删除 `STOCK_IN` 导致入库量回落，若 `manual=false` 会自动从 COMPLETED 退回 IN_PROGRESS。
- **本期不提供**「恢复自动判定」按钮，需手动覆盖后保持手动状态；后续可补 `dispatchStatusManual=false` 的"恢复自动"动作。
- **与 `OrderStatus`（PLANNING/PRODUCING/QC/SHIPPED/ON_HOLD）解耦**，互不影响。

#### 计划单层（`PlanOrder.derivedStatus`，响应派生，不落库）

| 状态 | 中文 | 判定 |
|------|------|------|
| `NOT_DISPATCHED` | 未下单 | 该计划**未下达**（`status !== CONVERTED`）且无直接关联工单 |
| `IN_PROGRESS`    | 未完成 | 有工单但未全部完成；**或**计划已下达（`status === CONVERTED`）但当前查不到关联工单 |
| `COMPLETED`      | 已完成 | 所有 `planOrderId = plan.id` 工单 `dispatchStatus === COMPLETED` |

- 由后端 `plans.service.listPlans` / `getPlan` 注入；前端不再二次算。
- **已下达兜底**：只要 `status === CONVERTED`（确实点过「下达工单」），即使关联工单被删除 / 历史数据 `planOrderId` 未关联 / 经委外等非下达途径产生，也**不会回退成「未下单」**，而按「未完成」展示，避免「明明下了单却显示未下单」。
- **父子计划独立**：父和子计划各自是独立的 `PlanOrder` 行，徽章互不影响。
- **多工单的计划**（如「补充下达子工单」）：所有工单都 COMPLETED 才算计划完成；任何一张退回，计划单也回到 IN_PROGRESS。

#### 搜索关键字

计划单列表搜索框支持「未下单 / 未完成 / 已完成」整词匹配（仅工单模式）；命中后通过 `?dispatchStatus=` 透传后端，后端退化为「全量 `where` 命中 → 内存按派生状态过滤 → 切片分页」。不支持状态 + 关键字组合搜索（命中状态词即整段视为状态过滤）。

---

## 4. 财务 (Finance)

### 4.1 财务记录类型

| type | 说明 |
|------|------|
| `RECEIPT` | 收款单 |
| `PAYMENT` | 付款单 |
| `RECONCILIATION` | 财务对账 |
| `SETTLEMENT` | 工人工资 / 结算 |

### 4.2 汇总规则

按 `type` 过滤后，对 `amount` 求和。当前没有复杂的状态口径分叉说明时，默认按有效记录直接累计。

### 4.3 合作单位对账 Excel 导出

- **入口**：财务 → 对账 → 合作单位，在已选择合作单位并点击「查询」后，工具栏「导出 Excel」可用（数据加载中禁用）。
- **汇总区**（表头前几行）：对账时间范围、合作单位名称；**上期结余、本期累计增加、本期累计减少、本期应收余额**与页面上方汇总条一致，按**整次查询**（所选日期区间 + 合作单位）的全量对账结果计算，**不受**列表上方搜索框过滤影响。
- **明细表**：导出**当前搜索过滤后**的列表——「按单据」导出 `partnerReconWithBalance`；「按产品」导出 `partnerProductReconListFiltered`。
- **按产品模式表尾**：在明细下方追加「产品汇总（按单价）」：按「产品名称 + 单价」分组汇总数量与金额；同一产品若存在多个不同单价，各占一行。

**实现锚点**：`utils/buildPartnerReconciliationExportSheet.ts`、`utils/downloadPartnerReconciliationXlsx.ts`、`utils/partnerReconProductLedger.ts`（`summarizePartnerProductRowsByProductAndPrice`）、`views/FinanceOpsView.tsx`。

---

## 5. 系统设置与基础信息

> 这一组模块以 CRUD、字段配置和关联约束为主，复杂计算较少。

### 5.1 系统设置

| 子模块 | 管理实体 | 规则 |
|--------|----------|------|
| 产品分类管理 | `categories` | 支持 `customFields` 扩展 |
| 合作单位分类 | `partnerCategories` | 支持 `customFields` 扩展 |
| 工序节点库 | `globalNodes` | 支持 `reportTemplate`、`enablePieceRate` 等配置 |
| 仓库管理 | `warehouses` | 支持 code 自动生成或手工填写 |
| 收付款类型 | `financeCategories` | 控制财务表单显示与关联项 |
| 收支账户类型 | `financeAccountTypes` | 控制收付款账户选项 |

### 5.2 基本信息

| 子模块 | 管理实体 | 规则 |
|--------|----------|------|
| 产品与 BOM | `products`, `boms` | 支持产品编辑、变体管理、BOM 绑定 |
| 合作单位 | `partners` | 关联 `partnerCategories` |
| 工人管理 | `workers` | 支持按工序派工 |
| 设备管理 | `equipment` | 支持按工序派工 |
| 公共数据字典 | `dictionaries` | 维护颜色、尺码、单位三组数据 |

### 5.3 工序工价

工序节点库中可为每道工序开启“计件工价”。

- 开启后，产品与 BOM 中可配置该工序工价（元/件）
- 计划详情中可显示该工序工价
- 未开启的工序不显示工价配置
- 当前规则以计件为主，计时模式已不作为主路径

### 5.3.1 颜色尺码矩阵：编辑时可调整/补录规格

适用于工单中心「报工批次」编辑、返工管理「返工报工流水」编辑、「处理不良品」流水编辑、工单中心「生产入库」单编辑，以及外协「派工 / 收货 / 外协单」等使用颜色×尺码矩阵录入的界面：

- **编辑态矩阵展示产品全部颜色×尺码组合**（与新建录入一致），便于纠正录入时选错规格。
- **保存时**对已有明细行走更新，对原单据中尚不存在的规格可走新增（同一批次号/单号沿用既有约定）；数量与外协在途、报工上限等仍按既有后端与前端校验执行，不因放开矩阵而绕过。

### 5.4 报工时记录重量（按重量核算物料损耗）

针对毛衣类横机工序、外协收货等“件数同口径但每件克重浮动”的业务场景，`GlobalNodeTemplate.enableWeightOnReport` 提供**工序级开关**：

- 开启后，对应工序的三个入口（工单报工 / 外协收货 / 返工报工）会额外出现“本次交货总重量 (kg)”输入框，并实时预览按 BOM 占比拆分出的各子物料实际消耗。
- BOM 子项 (`BomItem.excludeFromWeightShare`) 可勾选“不参与重量分摊”，用于标签、纽扣、吊牌这类辅料；参与分摊的子项占比 = 子项 `quantity` / Σ 参与分摊子项 `quantity`（无需用户手填比例）。
- 写入时：
  - `ProductionOpRecord.weight` / `MilestoneReport.weight` / `ProductProgressReport.weight` 固化本次交货总重量；
  - `materialBreakdown` 固化每个子物料的 `ratio / actualWeight / theoreticalQty` 快照，避免后续改 BOM 后历史记录失真。
- 消耗口径切换：`StockMaterialPanel` 的“报工耗材(理论)”列在对应工序开启后，自动改用 `materialBreakdown.actualWeight` 汇总；“结余”列（净领用 − 报工耗材）即反映真实物料损耗/结余。未开启工序维持原“件数 × BOM 用量”口径，两种模式可在同一产品不同工序并存。

### 5.4.1 扫码去重与单据数量上限

**适用入口**：工序报工（含产品池报工）、待入库扫码、返工报工、外协收货等所有「扫单品码 / 扫批次码」的累加入口。

**规则一：已保存去重（持久化判定）**

- 同一业务作用域内，若 `item_code_id` 或 `virtual_batch_id` 已出现在该作用域的已保存记录中 → 拒绝该次扫码并提示「该码在本工序 / 本单已报工（或已入库）」。
- 作用域按入口语义划分：
  - 工序报工 / 产品池报工：`milestone_id` 或 `productId + milestoneTemplateId + variantId`
  - 待入库：合并行内全部 `order_id`（同一码不能在并行待入库的多个工单里二次入库）
  - 返工报工：`order_id + 目标 nodeId`
  - 外协收货：`order_id + product_id + partner`（已收回状态、排除返工收回）
- 弹窗内 session 级去重（同一次编辑里扫两次同一码）仍保留，由 `scannedItemTokensRef` / `scannedBatchTokensRef` 处理，与持久化去重叠加生效。
- 写入兜底：`createReport` / `createProductReport` / `createRecord` 在入库前再次调用 `assertScanNotAlreadyUsed`，绕过前端直连接口的重复写入会被以 `HTTP 409` 拒绝。

**规则二：超单据最大数量拒绝（不再静默截断）**

- `当前表单数量 + 本次扫码数量 > 该格 / 该单允许的最大数量` → toast 给出最大可填值与超出量，**不写入列表、不累加表单**。
- 各入口「最大数量」与 UI 上展示的口径一致：
  - 工序报工矩阵：`getSeqRemainingForVariant(vid) − 不良 − 净外协`
  - 工序报工单规格：`effectiveRemainingForModal`
  - 待入库矩阵：`pendingByVariant[variantId]`；单规格：`pendingTotal`
  - 返工报工：路径行的 `pendingByVariant` / `totalPending`
  - 外协收货：行级 `pending`（已派 − 已收）；**受 `SystemSetting.allowExceedMaxOutsourceReceiveQty` 控制**——开启后所有 pending clamp（手输、矩阵 cell、扫码累加）以及 `OutsourcePanel.handleReceiveFormSubmit` 的提交校验全部跳过，后端 `enforceOutsourceReceiveQuantity` 同步放行。
- 历史接口 `addScanQtyToStockInForm` 改为「超上限不修改表单」的兜底行为；新代码统一调用 [`tryAddScanQtyToStockInForm`](../utils/pendingStockScanMatch.ts) 与 [`checkExceedMax`](../utils/scanApplyGuards.ts)。

**实现锚点**：后端 [`backend/src/services/scanValidate.service.ts`](../backend/src/services/scanValidate.service.ts) + `POST /api/item-codes/scan/validate-usage`；前端 `itemCodesApi.validateUsage` 经 [`useReportModalState`](../hooks/useReportModalState.ts)、[`usePendingStockState`](../hooks/usePendingStockState.ts)、[`ReworkReportSubmitModal`](../views/production-ops/ReworkReportSubmitModal.tsx)、[`OutsourceReceiveQuantityModal`](../views/production-ops/OutsourceReceiveQuantityModal.tsx) 调用。外协收货扫码（清单弹窗 / 录入弹窗）统一走 [`useOutsourceReceiveScan`](../hooks/useOutsourceReceiveScan.ts) hook。

### 5.4.2 外协收货：清单弹窗扫码 → 自动跳录入弹窗

**入口**：「外协管理 → 待收回清单」弹窗（[`OutsourceReceiveListModal`](../views/production-ops/OutsourceReceiveListModal.tsx)）底部「扫码收货」按钮，与「收货」按钮并列。

**流程**：

1. 弹出扫码会话（[`ScanBatchSessionModal`](../components/scan/ScanBatchSessionModal.tsx)），顶部 `headerSlot` 内嵌**加工厂下拉**（候选项 = 当前待收回清单中出现过的加工厂去重）。未选加工厂前扫码输入框 + 扫码枪监听全部禁用，hint 提示「请先选择加工厂」。
2. 选定加工厂后开始扫码，**首条命中码自动锁定该工序**（UI 顶部出现「工序已锁定」徽标）；后续扫到不同工序的码 toast「请分批收货」并拒绝。
3. 点「确认应用」时，由 [`OutsourcePanel.handleReceiveScanConfirm`](../views/production-ops/OutsourcePanel.tsx) 把命中行 baseKey 合并入 `receiveSelectedKeys`、把每条 entry 的 `{ key, qty }` 累加到 `receiveFormQuantities`，关闭清单弹窗、打开「外协收货 · 录入数量」弹窗供用户复核提交。提交链路与「勾选→收货」完全一致（`onAddRecord` → `POST /api/production/records`）。
4. 用户在清单里已经手动勾选过的行若与扫码命中行的工厂 / 工序不一致 → toast 报错并拒绝合并，要求先清空已勾选项。

**跨工厂 / 未外发 / 已收完判定**（hook 内 `applyScanPayload` 实现）：扫码命中 `pendingRows`（pending>0）失败时按 `allAggregates`（未过滤 pending<=0）分流：

| 情况 | `allowExceedMaxOutsourceReceiveQty=false`（默认） | `=true`（允许超额） |
|------|--------------------------------------------------|----------------------|
| 当前加工厂下从未外发过该产品 | toast「此码对应产品未外发给加工厂 X」 | 同左（**特例不放行**） |
| 当前加工厂下有外发但 `pending<=0`（已全部收回） | toast「此码对应产品在加工厂 X 已全部收回」 | **特例放行**：注入该聚合行 baseKey，按超额累加处理（行级 pending 校验跳过） |
| 当前加工厂下有外发且 `pending>0` | 走常规累加；超出行级 pending → toast | 走常规累加（不再做 pending clamp） |

即「开启允许超额时，只判断是否给该加工厂外发过；关闭时同时要求 pending>0」。

**实现锚点**：[`OutsourceReceiveListModal.handleScanApply`](../views/production-ops/OutsourceReceiveListModal.tsx) + [`useOutsourceReceiveScan`](../hooks/useOutsourceReceiveScan.ts) + [`OutsourcePanel.handleReceiveScanConfirm`](../views/production-ops/OutsourcePanel.tsx)。录入弹窗内的扫码按钮（[`OutsourceReceiveQuantityModal`](../views/production-ops/OutsourceReceiveQuantityModal.tsx) 顶部「扫码录入」）保留并复用同一 hook，仅在已勾选行范围内累加（不传 `partner` / `isNodeAllowed`，因为 `receiveSelectedKeys` 已经保证同工厂 + 同工序）。

### 5.5 协作派发：乙方接收与产品分类

**真源**：乙方租户侧 `POST /api/collaboration/subcontract-transfers/:id/accept` 的 `createProduct` 与既有产品同步逻辑（`collaboration.service`）。

- **分类不由甲方 `payload.categoryName` 自动写库**：甲方名称仅作前端默认提示；乙方在「接受派发 / 新建本地产品」界面须选择 **既有分类** 或 **新建分类**（与「设置 → 产品分类」同一列表）。若派发含颜色/尺码，未启用色码（`hasColorSize`）的分类在下拉中置灰不可选；与批次管理互斥的分类规则不变。`categoryDecision` 在 API 上仍为 `existing` | `create` | `none`（`none` 仅兼容历史/外部调用，协作接受弹窗不再提供「不归类」入口）。
- **颜色尺码与批次互斥**：若乙方选择「既有分类」且该分类已启用批次管理（`categoryUsesBatchManagement`），则本次派发若带颜色/尺码矩阵，不得绑定该分类（前端置灰选项，后端亦拒绝将分类升级为 `hasColorSize` 当分类仍带批次语义时）。
- **复用本地同名/SKU 产品**：接受时除同步色码字典外，可按同一 `categoryDecision` 补绑分类、或在新增色码时将分类 `hasColorSize` 升为 `true`（仍受上述互斥守卫约束）。
- **外协链转发**：中间站转发给下游的派发 `payload.categoryName` 优先取**链头甲方**最早派发单上的分类名（与色码沿用链头一致），避免中间站本地分类名污染下游默认展示。
- **规格标签归一**：协作侧颜色/尺码名称使用 `normalizeCollabSpecLabel`（NFKC + 折叠空白），前后端一致，减少重复字典项。

---

## 6. 待持续补充

- 生产报工更细粒度规则
- 打印 / 码管理的业务规则补充
- 后续新增业务模块

---

*最后更新：补充扫码去重与单据数量上限校验规则（§5.4.1）。*
