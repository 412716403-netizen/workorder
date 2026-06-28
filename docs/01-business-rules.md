# 业务规则文档

> 本文档记录“业务应该怎样算、怎样约束”。它不负责描述当前代码完整落点，也不默认前端旧实现仍是真源。当前架构与迁移阶段请看 [`06-current-architecture-and-migration-status.md`](./06-current-architecture-and-migration-status.md)。

## 阅读说明

1. 本文档回答“规则是什么”
2. `02-data-structures.md` 回答“数据归谁管”
3. `04-migration-checklist.md` 回答“哪些模块已落地、哪些仍需收口”
4. 文中“实现锚点”仅用于帮助定位代表性代码，不等于唯一真源

---

## 1. 进销存 (PSI)

采购订单、调拨、盘点：**无颜色尺码**（单行数量、非规格矩阵）时，数量允许为**非负小数，至多 2 位小数**（与 `PsiRecord.quantity` Decimal(12,2) 一致）。**采购入库（`PURCHASE_BILL`）与销售单（`SALES_BILL`）** 无变体时允许**带符号小数**（负数表示退货，见 §1.1.1）；有颜色尺码时规格格仍为**整数**件数。

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

### 1.1.1 销售退货 / 采购退货（负数结算单）

无独立退货单据类型；负数量的结算单行在库存、财务、仓库流水中统一解释：

| 单据类型 | 正数量 | 负数量（退货） |
|----------|--------|----------------|
| `SALES_BILL`（销售单） | 出库，应收增 | 入库回冲，应收减；UI/流水标注「销售退货」 |
| `PURCHASE_BILL`（采购入库） | 入库，应付增（对账 `dec`） | 出库回冲，应付减（对账 `inc`）；UI/流水标注「采购退货」 |

- **录入**：手动创建结算单时，无变体明细行数量可填负数；「引用采购订单生成」入库路径仍仅正数。
- **库存**：`PURCHASE_BILL` 负数量减少 `psiIn` 累计（净库存减少）；`SALES_BILL` 负数量减少 `psiOut` 累计（净库存增加）。
- **财务对账**：`utils/partnerReconLedger.ts`、`backend/src/services/finance.service.ts` 按单据签名金额区分增减。
- **仓库流水筛选**：虚拟类型 `PURCHASE_RETURN` / `SALES_RETURN` 仅用于 UI 筛选，存储类型仍为 `PURCHASE_BILL` / `SALES_BILL`。

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

### 2.2 销售统计（工作台）

| 指标 | 规则 |
|------|------|
| 周期 | 今日 / 昨日 / 本月 / **自定义**（`startDate`+`endDate`，含起止日全天；与工单统计一致，按单据 `timestamp` 过滤） |
| 销售额 / 单数 / 件数 | 周期内 `SALES_BILL` 正数量出库合计 |
| 销售退货件数 | 周期内 `SALES_BILL` 负数量绝对值合计 |

### 2.3 销售订单统计（工作台）

| 指标 | 规则 |
|------|------|
| 周期 | 今日 / 昨日 / 本月 / **自定义**（`startDate`+`endDate`，含起止日全天；按 `PsiRecord.timestamp` 过滤） |
| 订单额 / 单数 / 件数 | 周期内 `SALES_ORDER` 正数量合计；单数按 `docNumber` 去重 |
| 减单件数 | 周期内 `SALES_ORDER` 负数量绝对值合计 |

### 2.4 财务统计（工作台）

| 指标 | 规则 |
|------|------|
| 周期 | 今日 / 昨日 / 本月 / **自定义**（`startDate`+`endDate`，含起止日全天；按 `FinanceRecord.timestamp` 过滤） |
| 净现金流 | 周期内收款 − 支出 |
| 收款 / 支出 | 周期内 `RECEIPT` / `PAYMENT` 金额与笔数 |

### 2.5 财务统计（累计，历史口径）

| 指标 | 规则 |
|------|------|
| 累计收款 | `financeRecords` 中 `type === 'RECEIPT'` 的 `amount` 之和 |
| 累计支出 | `financeRecords` 中 `type === 'PAYMENT'` 的 `amount` 之和 |
| 现金流 | 收款 - 支出 |

### 2.6 库存预警

**历史前端规则**：`(100 + 入库 - 出库) < 10` 的产品数量。

**当前要求**：库存预警阈值与库存口径应以后端库存结果为准，避免看板与 PSI 明细出现口径漂移。

### 2.7 订单进度

**公式**：`progress = round((sum(m.completedQuantity / totalOrderQty) / msCount) * 100)`

- `totalOrderQty`：`order.items` 数量之和
- `msCount`：`milestones.length`

### 2.8 工作台（多 Tab 首页）

- 路由：`/workbench`；登录后默认首页。
- **WorkbenchConfig**：`pages[]` 每页含独立 `layout.items`；`activePageId` 记录上次 Tab；自定义页 `createdByUserId` 记录创建者。
- **页面归属**：**首页**＝个人页（`membership.preferences.dashboardWorkbench`，每人私有、自由自定义）；**自定义页**＝租户级共享池（`system_settings.workbenchSharedPages`）。
- **自定义页创建/编辑（本次新增）**：**仅企业创建者 owner 账号**可创建/改名/删除/增删组件；其余成员（含 admin）不能创建或编辑。
- **自定义页可见性（严格）**：默认**仅创建者可见**，**不**给 owner/admin 自动可见；其余成员需在「角色管理 → 工作台」被授予该页查看权（权限 key `workbench:<pageId>`，裸 `workbench` ＝全部自定义页面），且为**只读**。
- **首页可见性（本次更新）**：首页**不再恒可见**，纳入「角色管理 → 工作台」按页面授权：
 - 角色持有裸 `workbench`（＝全部页面）或显式勾选「首页」（`workbench:<homeId>`）→ 首页可见。
 - 角色**已启用按页面授权**（持有任意 `workbench:<pageId>` 键）但**未含首页** → 首页对该角色**隐藏**（不再作为默认页强行注入）。
 - 角色**完全未涉及**工作台页面权限（无任何 `workbench*` 键）→ 首页作为默认落地页**保持可见**（不破坏既有普通角色）。
 - 若某角色最终无任何可见工作台页面，`/workbench` 显示「暂无可查看的工作台页面」空态。
- **页面授权＝该页内容整体授权**：当某页面对用户**完整授权**（创建者本人 / 被授予 `workbench:<pageId>` / 裸 `workbench` / owner·admin）时，该页内所有组件内容**全部展示**——不再按查看者各自的模块/金额权限剔除组件或将金额掩码为 `***`；统计接口也据此为该页组件返回完整数据（后端 `augmentPermissionsWithWorkbench` 按页面完整授权临时补齐 psi/production/finance 等模块）。
- **首页内容授权**：首页可见时，其内容默认仍按查看者**自身**模块/金额权限掩码；在「角色管理 → 工作台」勾选「首页」后，该角色成员的首页内容也**完整展示**（含金额）。仅作用于统计数据展示，不放宽其它业务模块的权限。
- **首页默认布局**：顶部三卡（快捷入口 / 插件中心 / 消息中心）+ 工单/外协统计（各 6×7 格，占满第二行）+ 财务/销售/返工统计（各 4×6 格）；详见 `WORKBENCH_HOME_DEFAULT_LAYOUT`。
- **首页固定组件**：快捷入口、插件中心、消息中心**不可移除、拖动或缩放**；保存时后端强制合并固定位置，租户仅可调整其余组件与其他 Tab 页。
- **Tab 约束**：至少保留 1 个页面；编辑模式可增删改 Tab、拖拽排序（自定义页的改名/删除/排序仅对可编辑页生效）。
- **组件**：快捷入口、插件中心（租户功能开关）、消息中心（只读，展示系统公告与到期提醒）、**工单统计 / 外协统计 / 返工统计**、销售/财务统计；无模块权限或未启用功能插件的组件不可添加且保存时剔除。
- **工单统计**：按用户所选工序展示卡片；周期可选今日/昨日/本月/**自定义**；**生产任务数**为当前快照（未完工工单/产品数，不随周期变化）；**剩余可报**与工单中心工序卡一致（可报最多 − 已报数）；良品/不良品为周期内报工合计；**进度 = 已报数 / 可报最多**。
- **外协统计**：布局与工单统计一致；**外协任务数**为有待收回的任务数（快照）；**待收回**为已派 − 已收（快照）；**已收回 / 已派出**为周期内外协流水；**进度 = 已收回 / 已派出**（快照）。
- **返工统计**：布局与工单统计一致；**返工任务数**为进行中返工任务数（快照）；**待返工**为剩余未完成数（快照）；**已完成 / 新开返工**为周期内返工报工 / 新开返工单；**进度 = 已完成 / 返工总量**（快照）。
- **产品经营情况**：工作台提供两个独立组件——**产品经营·报工耗材**（`product_economics_consumable`）与 **产品经营·单据关联**（`product_economics_document`），可分别添加到页面；旧 `product_economics` 自动视为报工耗材组件。详见 `docs/02-data-structures.md` §1.6。
- **周期控件（统一）**：销售/销售订单/财务/工单/外协/返工/产品经营等统计卡片共用 `WorkbenchStatsHeaderExtra`（标题栏内联 Tab + 自定义起止日）；自定义区间经 `startDate`+`endDate` 传 API，结束日早于开始日时前端提示且不请求。
- **消息中心**：**仅平台管理员**（`users.role === admin`）可在 `/announcements` 发布/删除**全平台**公告，存 `platform_announcements` 表；各租户消息中心只读展示，发布人显示为「系统」（最多 50 条）。租户及租户管理员**不可**发布消息。
- **软件到期提醒**：租户 `expiresAt` 到期前第 7、3、1 个日历日，消息中心自动出现一条系统提醒（发布人「系统」），无需持久化；当日仅对应里程碑出现一次。
- **平台管理员**（`users.role === admin`）：侧栏仅「信息发布」「账号管理」；登录默认进入 `/announcements`；不可访问 ERP 业务模块。
- **功能插件**（`system_settings.featurePlugins`）：插件市场展示「协作管理」「开发管理」「资料库」等可开关插件；与 RBAC 叠加，关闭后隐藏侧栏入口与相关 widget/快捷项。默认关闭：「协作管理」「开发管理」「资料库」；租户管理员在插件中心手动开启。
- **资料库**（`knowledge_base` 插件）：租户内共享文件夹与文档；左侧树形管理（文档/文件夹可拖拽排序与移动），右侧 Tiptap 块级富文本（左侧 + 菜单插入标题/列表/待办/表格/代码块/图片等；超链接经弹窗填写文本与 URL）自动保存；图片经 `/api/knowledge-base/assets` 独立存储（不支持 SVG）；正文保存 HTML 白名单消毒；树/搜索接口不含正文，编辑时按文档 id 拉取；保存可带 `expectedUpdatedAt` 乐观锁；删文档前检查产品/开发款引用，仍被引用则 409；侧栏支持服务端搜索；侧栏入口位于「基础信息」上方；权限 `knowledge_base:folders:*` / `knowledge_base:documents:*`。
- **资料库引用字段**（`CustomDocFieldType='knowledge'`）：产品分类扩展字段、工序节点库「报工页展示内容」的字段类型可选「资料库」；填写产品/工序内容时从资料库中选择一篇文档，存值为 `{id,title}` JSON；报工只读区与产品列表显示文档标题，点击在弹窗内只读预览（实时读取资料库文档，需 `knowledge_base:documents:view`）。
- **消息 feed**：聚合平台公告、到期提醒；无独立 Notification 表。

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

点击「创建采购订单」后直接进入**待确认采购订单预览**：物料档案有有效默认合作单位时按合作单位合并；无绑定合作单位的物料各生成一张待指定采购单，在预览卡片**左侧**选择合作单位（可快捷新建）。选择相同合作单位的多张待指定单会自动合并。全部指定完成后方可保存。**不在保存时写回**产品档案的默认合作单位（计划阶段所选供应商仅用于本次采购单）。

### 3.3 单据编号规则

| 类型 | 格式 | 规则 |
|------|------|------|
| 计划单号 | `PLN1`, `PLN2`, ... | 与无计划来源的新工单号（含协作接单自动建单）**共用主序号池**：取 `max(计划主序号, 工单主序号) + 1` |
| 子计划单号 | `PLN1-S1`, `PLN1-S2`, ... | 从父计划派生；多级继续追加 `-S{序号}` |
| 工单号 | `WO1`, `WO2`, ... | 主计划下达时由计划单号严格转换（`PLN40` → `WO40`），**不再**因冲突静默改号 |
| 子工单号 | `WO1-S1`, `WO1-S2`, ... | 由子计划单号转换得到 |

**下达与冲突**：

- 计划下达时目标工单号 = 计划单号 `PLN` → `WO` 替换（后缀保留）。
- 若目标号已被**无 `planOrderId` 的协作孤儿工单**占用，且**产品一致** → 挂接该工单（写入 `planOrderId` 等），不新建第二条。
- 若目标号已被其他计划占用，或已被不同产品工单占用 → 返回 409，提示检查协作接单占用。
- 历史已存在的不一致编号不做自动迁移。

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

删除成功后，若该工单关联的计划单（`planOrderId`）已无任何剩余关联工单，后端将计划 `status` 从 `CONVERTED` 回退：
- 主计划 → `APPROVED`
- 子计划 → `DRAFT`

回退后计划单派生状态为「未下单」，可再次「下达工单」，详情中的数量明细与 BOM 汇总恢复可编辑。

### 3.10 工单详情 · 生产物料

工单中心打开单工单详情（`OrderDetailModal`）时，在报工汇总与外协卡片之间**只读展示**生产物料统计表，口径与「生产物料」Tab 一致：

| 列 | 含义 |
|----|------|
| 生产领料(+) | `STOCK_OUT` 累计 |
| 生产退料(-) | `STOCK_RETURN` 累计 |
| 净领用 | 领料 − 退料 |
| 报工耗材 | 未开称重工序：件数 × BOM；开启称重工序：`materialBreakdown` 实际重量；同一物料两类来源合计展示 |
| 当前结余 | 净领用 − 报工耗材 |

- **关联工单模式**：按父工单族（含子工单）聚合；子工单详情与父工单展示同一族数据。
- **关联产品模式**：按成品 `sourceProductId` 聚合物料，并标注「产品维度聚合（含本产品下多张工单）」。
- 领退料数据由详情页按需窄拉 `STOCK_OUT/STOCK_RETURN`（不依赖工单中心列表的 `orderCenterProdNarrow` 类型集）；写入领退料后随 `invalidateAllProdRecords` 刷新。
- 详情页不提供领退料操作；发料仍通过列表「物料」按钮或「生产物料」Tab。

### 3.11 工单表单配置

`OrderFormSettings` 结构与计划单表单配置一致，控制列表 / 详情页展示字段。

标准可配置字段主要包括：工单号、客户、交期、开始日期。  
产品、SKU、总量、状态通常为固定展示字段。

**字段配置**（工单中心 → 表单配置 → 字段配置）：

- **入库自定义单据内容**：写入 `orderFormSettings.stockInCustomFields`，控制待入库 / 入库登记 / 入库流水详情。
- **报工自定义单据内容（按工序）**：按 `GlobalNodeTemplate` 维护 `reportTemplate`（报工弹窗填报项）；保存时调用 `PUT /api/orders/node-report-templates`（权限 `production:orders_form_config:allow`）。数据仍存工序节点库，报工运行时以节点库为准（`getEffectiveReportTemplate`）。

**列表显示**（关联工单模式）：

| 开关 | 字段 | 效果 |
|------|------|------|
| 仅显示未完成 | `orderFormSettings.listDisplay.onlyShowNotCompleted` | 工单中心分页列表传 `excludeCompleted=true`，SQL 过滤 `dispatchStatus=IN_PROGRESS` |

计划单表单配置 **列表显示** 页签另有「仅显示未完成 / 未下单」（`planFormSettings.listDisplay.onlyShowNotCompleted`），列表传 `excludeCompleted=true`，后端按派生 `PlanDispatchStatus` 内存过滤（隐藏 `COMPLETED`）。

计划单表单配置 **列表显示** 页签另有「物料损耗计算」（`planFormSettings.listDisplay.materialLossEnabled`）：开启后计划详情「用料清单」在物料名称后显示「损耗」列，可按物料行填写损耗百分比。

- 口径：理论总需量 = 基础理论量 × `(1 + 损耗% / 100)`（如输入 5 → +5%）；负值/非法视为 0。
- 联动：放大后的理论总需量参与 `缺料数 = max(0, 理论总需量 − 库存)` → 默认回填「计划用量」→ 生成采购订单数量，自动随损耗变化；多级 BOM 逐级向下传导。
- 持久化：损耗率按计划单存于 `PlanOrder.customData.materialLossRates`（键为行 rowKey `materialId-nodeId-parentId`），随计划详情「保存」按钮落库；关闭开关后已存值保留但不参与计算。

计划单表单配置 **列表显示** 页签另有「列表上显示采购订单进度」（`planFormSettings.listDisplay.showPurchaseProgress`）：开启后计划单列表每行显示该计划关联采购订单的**汇总到货进度**（单一总百分比 + 迷你进度条），不展示每个物料的明细。

- 口径：与详情面板单物料一致，进度 = `已收 / 已订购`；总进度按**数量加权** `Σ已收 / Σ已订购`，超收（received > ordered）截断为 100% 并标记「已超收」。
- 关联范围：与详情面板同口径（PO 的 `customData.sourcePlanId / sourcePlanNumber`，及历史 `note` 含 `计划单[<no>]`），子计划行包含其**祖先计划**的采购订单。
- 数据来源：列表当前页（含展开的子孙计划）经 `POST /api/psi/plans-purchase-progress` 批量取回；`已订购 = 0`（无关联采购订单）的行不显示进度。

**生产物料 / 外协管理 / 返工管理** 表单配置 **列表显示** 页签（仅关联工单模式 UI）另有「仅显示工单未完成」（字段名 `onlyShowNotCompletedOrder`，分别存于 `materialPanelSettings` / `outsourceFormSettings` / `reworkFormSettings`）：

| 模块 | 过滤范围 | 不过滤 |
|------|----------|--------|
| 生产物料 | 主列表（含按委外加工厂展示时的工单 scope） | 领料退料流水 |
| 外协管理 | 主列表、**待发清单** | **待收回清单**、外协流水 |
| 返工管理 | 主列表、**待处理不良** | 处理不良/返工报工流水 |

判定：前端内存过滤 `ProductionOrder.dispatchStatus === COMPLETED`（`undefined` 视为进行中）。三模块开关相互独立，不与工单中心 `orderFormSettings.listDisplay.onlyShowNotCompleted` 联动。

### 3.10 派发完成状态徽章（关联工单模式专属）

仅在「关联工单模式」(`productionLinkMode === 'order'`) 的工单中心与计划单列表展示。

#### 工单层（`ProductionOrder.dispatchStatus`，持久化）

| 状态 | 中文 | 判定 |
|------|------|------|
| `IN_PROGRESS` | 进行中 | 默认；入库累计不足或被回退 |
| `COMPLETED`   | 已完成 | 入库累计达标后用户确认写入；或用户手动覆盖 |

- **自动推进**：所有改变 `STOCK_IN` 数据的入口在事务后调用 `recalcOrderDispatchStatusByStockIn`。当入库累计 ≥ 工单总量且当前为 `IN_PROGRESS` 时，**不**直接写 `COMPLETED`，而是在 API 响应中附带 `dispatchCompletionPending`，由前端弹出与手动切换相同的确认框；用户确认后调用 `PATCH /api/orders/:id/dispatch-status` 写入 `COMPLETED` 并置 `dispatchStatusManual=true`。删除/退库导致入库量回落时，若 `manual=false` 仍会自动从 `COMPLETED` 退回 `IN_PROGRESS`。
- **手动覆盖**：用户在工单中心点击徽章 → `PATCH /api/orders/:id/dispatch-status`，后端写 `dispatchStatusManual=true`，自动逻辑不再覆盖该工单。
- **回退**：删除 `STOCK_IN` 导致入库量回落，若 `manual=false` 会自动从 COMPLETED 退回 IN_PROGRESS。
- **本期不提供**「恢复自动判定」按钮，需手动覆盖后保持手动状态；后续可补 `dispatchStatusManual=false` 的"恢复自动"动作。
- **与 `OrderStatus`（PLANNING/PRODUCING/QC/SHIPPED/ON_HOLD）解耦**，互不影响。

#### 计划单层（`PlanOrder.derivedStatus`，响应派生，不落库）

| 状态 | 中文 | 判定 |
|------|------|------|
| `NOT_DISPATCHED` | 未下单 | 无直接关联工单（含删除全部关联工单后由 `deleteOrder` 回退计划状态） |
| `IN_PROGRESS`    | 未完成 | 有工单但未全部完成 |
| `COMPLETED`      | 已完成 | 所有 `planOrderId = plan.id` 工单 `dispatchStatus === COMPLETED` |

- 由后端 `plans.service.listPlans` / `getPlan` 注入；前端不再二次算。
- **删单回退**：删除工单且该计划无剩余关联工单时，`orders.service.deleteOrder` 将计划 `status` 从 `CONVERTED` 回退，派生状态同步为「未下单」。
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

### 4.2.1 资金账户余额

- **口径**：账户「当前余额」为派生值，不落库存量：`当前余额 = initialBalance + Σ(RECEIPT) - Σ(PAYMENT)`，仅统计 `accountTypeId` 命中该账户且 `status != CANCELLED` 的流水。期初余额（`FinanceAccountType.initialBalance`）与期初日期在「财务 - 资金账户 - 账户类型」录入（原「系统设置 - 收支账户类型」入口已迁移至此，权限仍沿用 `settings:finance_account_types:*`）。
- **实现**：`GET /api/finance/account-balances`（权限 `finance:account:view`）→ `finance.service.getAccountBalances` → 纯函数 `accumulateAccountBalances`（已覆盖单测）。前端在「财务 - 资金账户」Tab 展示账户余额卡片、账户流水下钻（按 `accountTypeId` 过滤 `listPage`）。
- **插件开关**：「资金账户」由功能插件 `funds_account` 控制（插件中心开启，默认关闭）。开启后「财务」才显示「资金账户」页，且收款单/付款单登记时**强制选择收支账户**（前端 `FinanceRecordFormModal` 按 `fundsAccountEnabled` 渲染并校验，替代原收付款分类上的「是否选择收支账户」逐项开关——该逐项开关已下线）。关闭插件则隐藏资金账户页、收付款不再要求选账户。
- **期间筛选（今日/本周/本月/全部）**：接口可带 `startDate/endDate`（周以周一为起点）。**流入/流出**取期间口径；**当前余额**始终全量；**期初余额**（前端「期初合计/期初余额」卡）选「全部」时 = 账户初始资金 `initialBalance`，选期间时 = `initialBalance + 期间开始日之前的净流水`（即该日期前的账户余额）。三套口径由 `accumulateAccountBalances` 接收 `grouped`(期间) / `balanceGrouped`(全量) / `openingGrouped`(开始日前) 三组分组算出。同一期间也会同步过滤账户流水下钻列表。
- **未归账**：历史流水 `accountTypeId` 为空（`paymentAccount` 对不上账户名）时归入「未归账」提示，不计入任一账户余额。

### 4.2.2 账户间转账（内部调拨）

- **规则**：一笔转账在事务内落两条流水——PAYMENT（转出账户）+ RECEIPT（转入账户），金额相等、共享同一 `ZZD` 转账单号与 `relatedId = transferGroupId`，`customData.transfer = true`。两条流水仍是 RECEIPT/PAYMENT 类型，天然计入各自账户余额，整体对净现金流无影响。
- **约束**：转出 ≠ 转入账户、金额 > 0；账户须属当前租户。
- **实现**：`POST /api/finance/transfers`（权限 `finance:transfer:create`）→ `finance.service.createTransfer`。
- **编辑/删除（成对）**：转账两腿必须一起改/删，否则余额失衡。
  - 编辑：`PUT /api/finance/transfers/:groupId`（`finance:transfer:edit`）→ `updateTransfer`，事务内按 `transferGroupId` 取出 PAYMENT/RECEIPT 两腿成对更新账户、金额、备注；`docNo` 与 `transferGroupId` 不变。
  - 删除：`DELETE /api/finance/transfers/:groupId`（`finance:transfer:delete`）→ `deleteTransfer`，按 `transferGroupId` 成对删除。
  - 防误删：普通 `deleteRecord` 检测到记录为转账腿（`customData.transfer === true`）时，按 `relatedId` 级联删整组，避免从收/付款列表删半条转账。

### 4.3 合作单位对账 Excel 导出

- **入口**：财务 → 对账 → 合作单位，在已选择合作单位并点击「查询」后，工具栏「导出 Excel」可用（数据加载中禁用）。**开始/结束日期可不填**；未填开始日期时「上期结余」为 0，明细为与该合作单位相关的全部对账单据。
- **汇总区**（表头前几行）：对账时间范围、合作单位名称；**上期结余、本期累计增加、本期累计减少、本期应收余额**与页面上方汇总条一致，按**整次查询**（所选日期区间 + 合作单位；日期为空则视为全量）的全量对账结果计算，**不受**「在当前对账结果中搜索…」过滤影响。
- **明细表**：导出**当前搜索过滤后**的列表——「按单据」导出 `partnerReconWithBalance`；「按产品」导出 `partnerProductReconListFiltered`。
- **按产品模式表尾**：在明细下方追加「产品汇总（按单价）」：按「产品名称 + 单价」分组汇总数量与金额；同一产品若存在多个不同单价，各占一行。

**实现锚点**：`utils/buildPartnerReconciliationExportSheet.ts`、`utils/downloadPartnerReconciliationXlsx.ts`、`utils/partnerReconProductLedger.ts`（`summarizePartnerProductRowsByProductAndPrice`）、`views/FinanceOpsView.tsx`。

### 4.4 报工结算对账 Excel 导出

与合作单位对账（§4.3）交互一致：

- **入口**：财务 → 对账 → 报工结算，选择工人并点击「查询」后可用「导出 Excel」；日期可不填，未填开始日期时「上期结余」为 0。
- **汇总区**：对账时间范围、工人名称；**上期结余、本期累计增加、本期累计减少、本期应收余额**按整次查询全量计算，不受搜索框影响。
- **视图**：支持「按单据 / 按产品」；按产品时将报工单展开为产品×工序明细行（含数量、工价），表尾按「产品 + 单价」汇总。
- **明细**：导出当前搜索过滤后的列表。

**实现锚点**：`utils/settlementReconLedger.ts`、`utils/settlementReconProductLedger.ts`、`utils/buildSettlementReconciliationExportSheet.ts`、`utils/downloadSettlementReconciliationXlsx.ts`、`hooks/useFinanceReconciliation.ts`、`views/FinanceOpsView.tsx`。

---

## 5. 系统设置与基础信息

> 这一组模块以 CRUD、字段配置和关联约束为主，复杂计算较少。

### 5.1 系统设置

| 子模块 | 管理实体 | 规则 |
|--------|----------|------|
| 产品分类管理 | `categories` | 支持 `customFields` 扩展；**名称租户内唯一**（新增/编辑，忽略首尾空白与大小写）；**「启用颜色尺码」开关仅毛衣工厂行业租户可见**（租户 `industryKind = sweater_factory`，由平台在企业管理中指定，经登录/选企业/租户列表接口透传到前端 `tenantCtx.industryKind`）；通用行业租户隐藏该开关，但已开启颜色尺码的分类仍显示开关便于关闭；**删除限制**：被产品（`Product.categoryId`）或开发款式（`DevStyle.categoryId`）引用时禁止删除，`deleteCategory` 返回 409 列明细；前端经 `GET /settings/categories/usage` 预检，被引用项删除按钮置灰并提示 |
| 合作单位分类 | `partnerCategories` | 支持 `customFields` 扩展；名称租户内唯一；**删除限制**：被合作单位（`Partner.categoryId`）引用时禁止删除，`deletePartnerCategory` 返回 409；前端经 `GET /settings/partner-categories/usage` 预检，被引用项删除按钮置灰并提示 |
| 工序节点库 | `globalNodes` | 维护工序名称、功能开关（含「不按顺序生产」`allowOutOfSequence`）、`reportDisplayTemplate`（报工页展示内容）等；`reportTemplate`（报工自定义单据内容）在 **工单中心 → 表单配置 → 字段配置** 按工序维护；工序名称租户内唯一；左侧列表支持拖拽调整 `sortOrder`，商品信息选工序时按该顺序自动排列；**工序被产品信息（生产路线 `Product.milestoneNodeIds`）引用时禁止删除**：后端 `deleteNode` 校验，若有产品引用返回 409；前端删除按钮置灰并提示，需先在相关产品信息中移除该工序后再删除 |

#### 工序生产顺序（方案 X）

- 系统全局恒为「按工序顺序生产」（`processSequenceMode = sequential`，原全局设置 UI 已下线）。
- 工序节点库可为单道工序开启 **「不按顺序生产」**（`GlobalNodeTemplate.allowOutOfSequence`）：该工序脱链，工单中心可按工单总量报工，不校验前道是否已报。
- **透明链 gate 规则**（报工 / 外协 / 返工 / 可报最多统计共用 `shared/processSequence.ts`）：
  - 脱链工序在顺序链中**透明跳过**，不作为下游按顺序工序的 gate。
  - 一道「按顺序」工序的可报基数 gate 在**最近一道上游按顺序工序**的完成量上。
  - 若其上游没有任何按顺序工序（前面全是脱链，或本身是首道按顺序工序），则按**工单总量**放开。
- 示例：`横机(不按顺序) → 套口(按顺序) → 缩绒(按顺序)` 时，套口按总量可报；缩绒 gate 在套口完成量。`横机(按顺序) → 套口(不按顺序) → 缩绒(按顺序)` 时，缩绒 gate 在横机完成量（跳过套口）。
- **报工弹窗的统计作用域**（`ReportModal` 表头「可报 / 已报 / 剩 / 返工」与各规格「最多」共用一套口径，见 `utils/reportRowDerivations.ts` 的 `scopedOrderIds` 与 `useReportModalState.getSeqRemainingForVariant`）：
  - **关联工单模式**：从某张工单的工序圈点开报工，只统计**被点击的这一张工单**；不得按 `productId` 把同款其它工单一并聚合（否则表头数量、可报基数、各规格上限都会虚高）。
  - **产品组 / 关联产品模式**：从产品组卡报工（传入 `productOrders`）或关联产品模式（PMP）时，按该组工单 / 产品维度聚合，作用域即弹窗实际纳入的工单集合。
| 仓库管理 | `warehouses` | 支持 code 自动生成或手工填写；仓库名称租户内唯一；**删除限制**：被进销存单据（`PsiRecord` 的 `warehouseId/fromWarehouseId/toWarehouseId/allocationWarehouseId`，无外键）或生产操作记录（`ProductionOpRecord.warehouseId`）引用时禁止删除，`deleteWarehouse` 返回 409 列明细；前端经 `GET /settings/warehouses/usage` 预检，被引用项删除按钮置灰并提示 |
| 收付款类型 | `financeCategories` | 控制财务表单显示与关联项；类型名称租户内唯一（不区分收款/付款 kind）；**删除限制**：被财务记录（`FinanceRecord.categoryId`）引用时禁止删除，`deleteFinanceCategory` 返回 409；前端经 `GET /settings/finance-categories/usage` 预检，被引用项删除按钮置灰并提示 |
| 收支账户类型 | `financeAccountTypes` | 控制收付款账户选项；类型名称租户内唯一；可配期初余额/期初日期/账户分类，用于「资金账户」余额聚合（详见 §4.2.1） |

### 5.2 基本信息

| 子模块 | 管理实体 | 规则 |
|--------|----------|------|
| 产品与 BOM | `products`, `boms` | 支持产品编辑、变体管理、BOM 绑定；**启用/禁用**：产品档案列表可切换 `enabled`；禁用后不在商品选择组件（`SearchableProductSelect`）中展示，已选中的禁用产品仍保留显示；**产品模式工序锁定**：当租户 `productionLinkMode='product'` 且产品已有非 `PENDING_PROCESS` 的生产工单、且 `milestoneNodeIds` 非空时，禁止再修改工序增删与顺序（`PUT /products/:id` 改 `milestoneNodeIds` 返回 409）；产品首次从 0 工序配置路线仍放行；工价、报工模板、BOM 不受锁；前端产品编辑页根据 API 返回的 `processLocked` 禁用工序 UI；**颜色尺码保存**：分类 `hasColorSize` 为真时，保存产品须至少选择 1 个颜色与 1 个尺码（前后端同口径）；**改名级联**：修改产品名称/编号时，后端事务内同步刷新工单快照字段 `ProductionOrder.productName` / `ProductionOrder.sku`，保证工单中心、报工记录及相关单据展示与产品档案一致（PSI、财务、计划单等均按 `productId` 动态取名，无需级联；跨租户协作单据的 `senderProductName` 为发出时快照，刻意不随改名变化）；**规格删除限制**：取消勾选颜色/尺码即删除对应变体，若变体已被业务数据引用（工单明细、工单/产品报工记录、产品工序进度、生产操作记录、进销存流水、计划单明细、扫码批次、单品码）则禁止删除——前端取消勾选时经 `GET /products/:id/variant-usage` 预检提示，后端保存时同口径校验 409 兜底；变体写入为 diff 式（保留的 update、新增 create、移除先校验再 delete），被删变体的变体级 BOM（配置数据）随之清理 |
| 合作单位 | `partners` | 关联 `partnerCategories`；**名称租户内唯一**（新增/编辑均校验，忽略首尾空白与大小写）；**单位编号**（`partnerListNo`）创建时按租户递增自动生成，**不可编辑**；**改名级联**：修改单位名称时，后端事务内同步更新名称快照字段 `ProductionOpRecord.partner`（外协/委外返工）、`PsiRecord.partner`（按 `partnerId` 或旧名称匹配）、`FinanceRecord.partner`，保证外协管理、外协流水及相关单据展示一致；**批量导入**：基础信息 → 合作单位 →「导入单位」，按分类下载 Excel 模板（单位名称 + 该分类 `customFields`），预览校验后调用 `POST /master/partners/import`；名称重复（库内或文件内）跳过；扩展字段（联系人、电话等）随分类模板导入，不支持附件/资料库字段；不导入协作租户关联 |
| 工人管理 | `workers` | 支持按工序派工 |
| 设备管理 | `equipment` | 支持按工序派工 |
| 公共数据字典 | `dictionaries` | 维护颜色、尺码、单位三组数据；**名称同类型租户内唯一**；**删除限制**：被业务数据按 id 引用时禁止删除（颜色/尺码查产品勾选 `colorIds`/`sizeIds`、产品规格 `ProductVariant.colorId/sizeId`、开发款式规格 `DevStyleVariant`；单位查 `Product.unitId`），409 列明细；前端删除有确认弹窗。改名安全（业务引用按 id 动态取名），但变体 `skuSuffix` 为创建时快照、跨租户协作按名称匹配规格，改名不回刷这两处 |

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

- 开启后，对应工序的**工单报工 / 外协收货**两个入口会额外出现“本次交货总重量 (kg)”输入框，并实时预览按 BOM 占比拆分出的各子物料实际消耗。（返工报工**不**录入重量。）
- BOM 子项 (`BomItem.excludeFromWeightShare`) 可勾选“不参与重量分摊”，用于标签、纽扣、吊牌这类辅料；参与分摊的子项占比 = 子项 `quantity` / Σ 参与分摊子项 `quantity`（无需用户手填比例）。
- 写入时：
  - `ProductionOpRecord.weight` / `MilestoneReport.weight` / `ProductProgressReport.weight` 固化本次交货总重量；
  - `materialBreakdown` 固化每个子物料的 `ratio / actualWeight / theoreticalQty` 快照，避免后续改 BOM 后历史记录失真。
- 消耗口径：`StockMaterialPanel` / 工单详情「生产物料」的**报工耗材**列按工序逐条判定——未开启称重的工序用「件数 × BOM」（`MatRow.theoryCost`），开启称重的工序用 `materialBreakdown.actualWeight`（`MatRow.actualCost`），展示时两者合计为一列；**结余** = 净领用 − 报工耗材。两种口径可在同一产品不同工序并存。

### 5.4.1 扫码去重与单据数量上限

**适用入口**：工序报工（含产品池报工）、待入库扫码、返工报工、外协收货等所有「扫单品码 / 扫批次码」的累加入口。

**同工序多产品 / 多款同批报工**（参考外协收货扫码归集）：

- **主列表报工权限门控**：工单中心主列表「工序圈圈」点击报工受角色权限「生产管理 → 工单中心 → 报工流水 · 添加」（`production:orders_report_records:create`）控制——未勾选则圈圈不可点击、无法报工；owner、未配置细粒度权限、或持有裸 `production` 模块键者放行（见 `OrderListView.hasProcessReportPerm`）。
- **工序报工**（[`ReportModal`](../views/order-list/ReportModal.tsx) + [`useReportModalState`](../hooks/useReportModalState.ts)）：从某工序节点打开弹窗后，工序模板（`milestone.templateId`）已锁定；批量扫码可扫入**不同产品 / 不同款**的码，系统按 `productId` 归集成多行，共享生产人员 / 设备 / 自定义字段，提交时逐产品、逐规格写入（关联工单模式 → `createReport`；关联产品模式 → `createProductReport`）。扫码须通过计划树兼容校验（关联工单模式：与入口工单 `planOrderId` 父子链兼容；**关联产品模式**：与该产品任一工单的 `planOrderId` 兼容，或处于同一计划树根下的兄弟子计划），且目标产品须包含当前工序模板。
- **返工报工**（[`ReworkReportSubmitModal`](../views/production-ops/ReworkReportSubmitModal.tsx)）：从某产品/工单工序入口打开时，弹窗**仅展示该入口范围内的待返工路径**（关联产品模式按 `productId`；关联工单模式再限定 `orderId`）；扫码按 `productId + 规格` 在可见路径内累加，提交时 `REWORK_REPORT.productId` 取源 `REWORK` 记录；委外返工收回按产品各生成一条 `OUTSOURCE` 汇总单。
- **硬约束**：一次报工会话内所有扫码须属于**同一工序模板**；不允许跨工序混扫（外协收货通过首扫锁 `nodeId` 实现；报工 / 返工通过入口工序锁定 + 扫码时校验产品是否含该工序）。

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
  - 工序报工矩阵：`getSeqRemainingForVariant(vid) − 不良 − 净外协`；**受 `SystemSetting.allowExceedMaxReportQty` 控制**——开启后扫码上限放开（`ReportModal` 的 `getScanMaxQty` 返回 null，不再向 `validate-usage` 传 `maxQty`），与矩阵/单规格手输放开口径及后端 `enforceReportQuantity` 同步。
  - 工序报工单规格：`effectiveRemainingForModal`；同样受 `allowExceedMaxReportQty` 控制，开启后扫码不再拦截。
  - 待入库矩阵：`pendingByVariant[variantId]`；单规格：`pendingTotal`；**受 `SystemSetting.allowExceedMaxStockInQty` 控制**——开启后工单中心「待入库清单」入库时所有 pending clamp（单条/批量弹窗手输、矩阵 cell、清单扫码累加）全部跳过，允许录入超过待入库的数量（后端 STOCK_IN 本就无数量硬校验）。
  - 返工报工：路径行的 `pendingByVariant` / `totalPending`
  - 外协收货：行级 `pending`（已派 − 已收）；**受 `SystemSetting.allowExceedMaxOutsourceReceiveQty` 控制**——开启后所有 pending clamp（手输、矩阵 cell、扫码累加）以及 `OutsourcePanel.handleReceiveFormSubmit` 的提交校验全部跳过，后端 `enforceOutsourceReceiveQuantity` 同步放行。
- 历史接口 `addScanQtyToStockInForm` 改为「超上限不修改表单」的兜底行为；新代码统一调用 [`tryAddScanQtyToStockInForm`](../utils/pendingStockScanMatch.ts) 与 [`checkExceedMax`](../utils/scanApplyGuards.ts)。

**实现锚点**：后端 [`backend/src/services/scanValidate.service.ts`](../backend/src/services/scanValidate.service.ts) + `POST /api/item-codes/scan/validate-usage`；前端 `itemCodesApi.validateUsage` 经 [`useReportModalState`](../hooks/useReportModalState.ts)、[`usePendingStockState`](../hooks/usePendingStockState.ts)、[`ReworkReportSubmitModal`](../views/production-ops/ReworkReportSubmitModal.tsx)、[`OutsourceReceiveQuantityModal`](../views/production-ops/OutsourceReceiveQuantityModal.tsx) 调用。外协收货扫码（清单弹窗 / 录入弹窗）统一走 [`useOutsourceReceiveScan`](../hooks/useOutsourceReceiveScan.ts) hook。

### 5.4.1.1 扫码追溯链路口径（按扫码模式区分写入粒度）

工序报工（含产品池报工）、生产入库、返工报工、外协收货扫码后，写入记录时附带扫码关联，使产品追溯查询能命中本次生产事件。**写入粒度由扫码模式决定**（不是看物理扫了批次码还是单品码）：

- **批次码模式**（可扫批次码，也可扫单品码，均按整批数量）：记录挂 `virtual_batch_id`。该批次下所有单品码做追溯时都能查到本事件（整批共享链路）。
- **单品码模式**（仅可扫单品码，每件 qty=1）：把本次逐件扫入的单品码列表写入记录 `customData.__scanItemCodeIds`（常量 `SCAN_ITEM_CODE_IDS_KEY`，见 `shared/types.ts`），追溯按列表**逐件精确命中**——「扫 1 件只该件可查、同批其他单品查不到」「一次扫多件各自独立可查」。

关键实现要点：

- **不改变扫码去重所依赖的 `item_code_id / virtual_batch_id` 列写入**：`__scanItemCodeIds` 只服务于追溯展示，去重（`assertScanNotAlreadyUsed` / `buildDupIdsFilter` 的批次展开）行为不变。
- 追溯 SQL（[`itemCodes.service.ts`](../backend/src/services/itemCodes.service.ts) 的 `traceScanLinkSql`）：记录带 `__scanItemCodeIds` 数组时按列表逐件匹配（忽略列）；否则回退 `virtual_batch_id / item_code_id` 列匹配。仅按批次追溯（scope 无具体单品码）时直接用列，单品模式记录仍写了 `virtual_batch_id`，整批查询照样能命中。
- 矩阵报工/多规格：逐件列表**按规格**收集与写入；同一规格被拆到多条记录（如生产入库按工单分摊）时只首条携带列表，避免追溯出现重复事件。
- **委外返工收回去重**：委外返工报工提交时会同时写 `REWORK_REPORT` 与镜像 `OUTSOURCE（已收回，sourceReworkId 非空）`；产品追溯时间轴**仅展示返工报工**，不重复展示后者（与外协管理流水 `!sourceReworkId` 过滤口径一致）。
- **外协收货派生报工去重**：普通外协收货写入 `OUTSOURCE（已收回）` 后，`applyOutsourceProgress` 会同步派生 `milestone_reports` / `product_progress_reports`（`customData.source = 'outsourceReceive'`）；追溯时间轴**仅展示外协收货**，不重复展示派生工序报工。
- 该键以 `__` 前缀标记为内部元数据，报工详情/打印不展示（见 [`effectiveReportTemplate.ts`](../utils/effectiveReportTemplate.ts) 的 `INTERNAL_CUSTOM_DATA_KEYS`）。
- **例外**：外协收货（[`OutsourcePanel.handleReceiveFormSubmit`](../views/production-ops/OutsourcePanel.tsx)）单品码模式采用「逐件单独落一条 qty1 记录、各挂自己的 `item_code_id`」实现同样效果，不走 `__scanItemCodeIds` 列表（见 5.4.2）。

**外协主列表显示**（表单配置 → 外协管理 →「列表显示」）：`outsourceFormSettings.hideZeroPendingPartnerOnList` 为 true 时，主列表隐藏加工厂「剩余」为 0（已全部收回）的小卡；若工单/产品下加工厂均被隐藏则整行也不显示。仅影响主列表展示，不影响外协流水、待收回清单与收货业务。

**剩余数量负数显示**：加工厂小卡「发出 / 剩余」与「加工厂往来数量明细」弹窗（`OutsourcePartnerFlowDetailTable`）的「剩余数量」行口径统一为 `剩余 = 已派 − 已收`，**超收时显示负数并标红**（参考工单中心工序圈圈剩余口径，不再 clamp 到 0；计算见 `computeDispatchReceiveRemaining`）。`hideZeroPendingPartnerOnList` 仍按 `剩余 > 0` 过滤——超收（剩余 ≤ 0）小卡视为已收完，开启隐藏时不展示。

### 5.4.2 外协收货：清单弹窗扫码 → 自动跳录入弹窗

**入口**：「外协管理 → 待收回清单」弹窗（[`OutsourceReceiveListModal`](../views/production-ops/OutsourceReceiveListModal.tsx)）底部「扫码收货」按钮，与「收货」按钮并列。

**流程**：

1. 弹出扫码会话（[`ScanBatchSessionModal`](../components/scan/ScanBatchSessionModal.tsx)），顶部 `headerSlot` 内嵌**加工厂下拉**（候选项 = 当前待收回清单中出现过的加工厂去重）。未选加工厂前「确认应用」禁用；若用户仍用扫码枪扫入，toast 提示「请先在上方选择加工厂后再开始扫码」并播放错误音。
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

**扫码收货的追溯链路口径（按扫码模式区分写入粒度）**：外协收货记录会把扫码所属的 `itemCodeId / virtualBatchId` 落到 `ProductionOpRecord`，并由 `applyOutsourceProgress` 透传到派生的工序报工 / 产品进度报工，使产品追溯查询能命中本次「外协收货」事件。写入粒度由扫码模式决定（实现见 [`OutsourcePanel.handleReceiveFormSubmit`](../views/production-ops/OutsourcePanel.tsx) 的分片逻辑）：

- **批次码模式**（可扫批次码，也可扫单品码，均按整批数量）：按产品+规格合并为**一条**收货记录，挂 `virtualBatchId`。该批次下所有单品码做追溯时都能查到这条收货（整批共享链路）。
- **单品码模式**（仅可扫单品码，每件 qty=1）：**每扫一件单独落一条收货记录**，只挂该件自己的 `itemCodeId`、**不挂 `virtualBatchId`**。因此「扫 1 件只该件可查、同批其他单品查不到」「一次收货扫多件也各自独立可查」。
  - 受单条记录只有一个链路字段限制，逐件落记录是为支持「同款多件各自独立追溯」；若提交前在录入弹窗把数量改小，则按数量截取前 N 件带链路，改大的多出部分并入一条无链路记录。

**实现锚点**：[`OutsourceReceiveListModal.handleScanApply`](../views/production-ops/OutsourceReceiveListModal.tsx) + [`useOutsourceReceiveScan`](../hooks/useOutsourceReceiveScan.ts) + [`OutsourcePanel.handleReceiveScanConfirm`](../views/production-ops/OutsourcePanel.tsx)。录入弹窗内的扫码按钮（[`OutsourceReceiveQuantityModal`](../views/production-ops/OutsourceReceiveQuantityModal.tsx) 顶部「扫码录入」）保留并复用同一 hook，仅在已勾选行范围内累加（不传 `partner` / `isNodeAllowed`，因为 `receiveSelectedKeys` 已经保证同工厂 + 同工序）。

### 5.4.3 扫码称重校验（电子秤 + 标准重量）

**插件开关**：以上扫码累加、追溯码生成/查询、以及本节称重能力均依赖租户插件 **`traceability`（追溯码）**。插件中心关闭后：侧栏/快捷「扫码追溯」、计划详情追溯码区块、报工/外协/返工/待入库扫码按钮、工序「报工时记录重量」「扫码称重」、单件标准重量与容差设置等 UI 均不可用（存量租户在插件上线前未写入 `featurePlugins.traceability` 键时视为已开启；新建租户默认关闭）。

**工序级开关（两个，互相独立）**：

- **`enableScanWeighing`（扫码称重）**：控制扫码会话是否出现**电子秤捕获框 + 理论/实测比对**。**本身不落库重量**。
- **`enableWeightOnReport`（报工时记录重量）**：控制报工/收货表单是否有**交货重量字段**，并按 BOM 占比把重量写入 `weight` + `materialBreakdown`。
- **两者同开**：扫码称到的累计实测总重自动同步到**工单报工 / 外协收货**表单的交货重量字段（仍可手改）。**同工序多产品**报工时按 `productId` 分别累加（与外协收货按 `baseKey` 分行一致），提交后各产品生成独立报工/收回记录的 `weight`。（返工报工扫码**不**启用称重与重量回填。）
- **仅开扫码称重**：现场称重比对，但重量不进表单、不落库（适合只想核对、不做物料损耗核算的收货场景）。
- 存量迁移：原 `enableWeightOnReport=true` 的工序回填 `enableScanWeighing=true`，保留上线前行为。

**适用入口**：工序报工、外协收货扫码（**不含**返工报工、待入库扫码；待入库扫码亦受追溯码插件总开关控制）。外协收货扫码弹窗在首扫前未锁定工序，按「待收回行涉及的工序中是否有开启扫码称重」决定是否显示秤框。

**标准重量维护**：产品档案 → 编辑产品 → 点击「设置单件标准重量」打开弹窗，按 **规格 × 已开启扫码称重的工序** 录入 kg（若标准路线中无一工序开启扫码称重，则不显示该按钮）；数据存 `product_variants.node_unit_weights`（JSON）。弹窗矩阵输入框右侧「均 X kg」为历史外协收货单件重量均值（Σ交货重÷Σ收货件数，仅统计已落库的 `OUTSOURCE` 已收回且含重量记录）。

**容差**：租户级 `SystemSetting.weightTolerancePercent`（默认 5），在「设置 → 生产业务配置 → 数量上限」区块维护。

**现场流程**：

1. 批量扫码弹窗顶部有**秤捕获输入框**（打开后自动聚焦）：HID 秤稳定后会把读数打进该框，左侧同步显示 kg；扫码枪仍可用（快速按键不会写入该框）。
2. 现场顺序：**放货 → 待重量显示 → 扫本包标签 → 换下一包重复**。
2. 每次扫码成功时快照当前秤读数；期望重量 = `nodeUnitWeights[nodeId] × 扫码数量`（批次码数量取 `PlanVirtualBatch.quantity`，单品码为 1）。
3. 扫码列表每行**同一行**展示理论重量与实测重量（`理论 X kg · 实测 Y kg`）；未维护理论重量时显示「未设置」。有 `basic:products:edit` 权限时，行内**设置**按钮打开弹窗，维护该产品**全部规格 × 工序**的单件标准重量矩阵（与产品档案编辑页一致，写回 `nodeUnitWeights`）。
4. 偏差超过容差 → 列表行标红 + toast 告警 + 错误提示音；**不强制拦截**，用户仍可确认应用。
5. 实测重量**不落库**；若当前工序**同时**开启 `enableWeightOnReport`，报工扫码确认后会把各行实测重量**按产品**累加填入对应产品的「交货总重」字段（多产品场景每产品独立；单产品仍填一行总重）。仅开 `enableScanWeighing` 时只做现场比对，不写入表单。

**实现锚点**：[`hooks/useScanSessionKeyboard.ts`](../hooks/useScanSessionKeyboard.ts)、[`utils/scanSessionKeyboardLogic.ts`](../utils/scanSessionKeyboardLogic.ts)、[`components/scan/ScaleWeightInput.tsx`](../components/scan/ScaleWeightInput.tsx)、[`components/scan/ScanBatchSessionModal.tsx`](../components/scan/ScanBatchSessionModal.tsx)、[`components/scan/ScanUnitWeightSettingPopover.tsx`](../components/scan/ScanUnitWeightSettingPopover.tsx)、[`utils/scanWeightCheck.ts`](../utils/scanWeightCheck.ts)。

### 5.5 协作派发：乙方接收与产品分类

**真源**：乙方租户侧 `POST /api/collaboration/subcontract-transfers/:id/accept` 的 `createProduct` 与既有产品同步逻辑（`collaboration.service`）。

- **分类不由甲方 `payload.categoryName` 自动写库**：甲方名称仅作前端默认提示；乙方在「接受派发 / 新建本地产品」界面须选择 **既有分类** 或 **新建分类**（与「设置 → 产品分类」同一列表）。若派发含颜色/尺码，未启用色码（`hasColorSize`）的分类在下拉中置灰不可选；与批次管理互斥的分类规则不变。`categoryDecision` 在 API 上仍为 `existing` | `create` | `none`（`none` 仅兼容历史/外部调用，协作接受弹窗不再提供「不归类」入口）。
- **颜色尺码与批次互斥**：若乙方选择「既有分类」且该分类已启用批次管理（`categoryUsesBatchManagement`），则本次派发若带颜色/尺码矩阵，不得绑定该分类（前端置灰选项，后端亦拒绝将分类升级为 `hasColorSize` 当分类仍带批次语义时）。
- **复用本地同名/SKU 产品**：接受时除同步色码字典外，可按同一 `categoryDecision` 补绑分类、或在新增色码时将分类 `hasColorSize` 升为 `true`（仍受上述互斥守卫约束）。
- **外协链转发**：中间站转发给下游的派发 `payload.categoryName` 优先取**链头甲方**最早派发单上的分类名（与色码沿用链头一致），避免中间站本地分类名污染下游默认展示。
- **规格标签归一**：协作侧颜色/尺码名称使用 `normalizeCollabSpecLabel`（NFKC + 折叠空白），前后端一致，减少重复字典项。
- **乙方自动建工单与编号**：`acceptTransfer` 接受派发时会自动创建 `ProductionOrder`（不经计划单），工单号走与计划单相同的**主序号池**（`getNextWorkOrderNumber`）。若协作先占用 `WO40`、后创建并下达 `PLN40` 且产品一致，计划下达时**挂接**该孤儿工单而非改号；新计划创建时若协作已占 `WO40`，下一计划号从 `PLN41` 起，避免制造无法下达的 `PLN40`。

### 5.6 单价/金额查看权限

模块级权限 **`price_amount`（单价/金额）** 统一管控各业务域金额展示；在角色编辑的「单价/金额 - 细粒度权限」中按业务勾选（实际落库键仍分别为 `psi:*:amount`、`production:outsource_amount:allow`、`collaboration:amount:allow`）。

| 业务域 | 权限 key | 说明 |
|--------|----------|------|
| 模块入口 | `price_amount` | 勾选后可在细粒度中配置；未勾选且无历史 amount 键 → 全站隐藏单价/金额 |
| 进销存 · 采购订单 | `psi:purchase_order:amount` | 采购价、行金额、合计 |
| 进销存 · 采购入库 | `psi:purchase_bill:amount` | 同上 |
| 进销存 · 销售订单 | `psi:sales_order:amount` | 销售价、行金额、合计 |
| 进销存 · 销售单 | `psi:sales_bill:amount` | 同上 |
| 生产 · 外协 | `production:outsource_amount:allow` | 收回单加工单价/金额、收货录入加工费 |
| 协作 | `collaboration:amount:allow` | 回传/转发单价金额、详情页脚（协作列表仍在「协作管理」模块） |

**协作模块入口**：侧栏「协作管理」仅当角色勾选模块级 `collaboration` 时显示；细粒度 `collaboration:list:allow` 控制列表。协作单价/金额在「单价/金额」模块中配置（`collaboration:amount:allow`）。勾选协作模块且未配置 list 细粒度时，列表可见。

**可见性语义**（与 `useModulePermission().hasPerm` 一致）：

- **owner / admin**：始终可见。
- **未配置细粒度**（仅持裸模块键如 `psi`、`production`、`collaboration`）：始终可见。
- **细粒度角色**：须精确勾选对应 `:amount` 或 `:allow` 键；未勾选则隐藏。

**隐藏不清空（关键约束）**：新增/编辑单据页无金额权限时，**只隐藏**单价输入框、金额列与合计等 UI；表单 state 与默认「上次成交价/加工单价」填充逻辑**照常运行**，保存提交体仍带 `purchasePrice` / `salesPrice` / `unitPrice` / `amount` 等字段。**禁止**在无权限时把价格字段从 state 或提交体删除/置 0。

**打印/导出**：无权限时在调用 `build*PrintContext` 后对上下文做金额脱敏（`utils/maskPrintContextAmounts.ts`），将 `unitPrice`、`amount`、`docTotalAmount` 等置空。

**实现锚点**：`utils/canViewAmount.ts`、`views/member-management/constants.ts`、`views/member-management/RoleEditModal.tsx`；进销存 `views/PSIOpsView.tsx` / `views/psi-ops/*`；外协 `views/production-ops/Outsource*.tsx`；协作 `views/collaboration/*`。

**范围外（默认不做）**：财务对账模块中的 PSI/外协金额展示与导出，仍按财务域权限控制；如需叠加金额权限可单独评估。

### 5.7 成员审核权限

- **成员审核（加入申请的通过/拒绝）** 不再仅限 owner/admin：**被授予「基础信息 → 成员管理 → 添加」（`basic:members:create`）** 细粒度权限的角色成员，也可在「成员管理 → 待审核」查看并审核加入申请。
- 判定：`role ∈ {owner, admin}` **或** 有效权限含 `basic:members:create` → 可审核；否则隐藏「待审核」Tab 且后端 403。
- 仅放开**成员审核**；角色管理、分配/修改成员角色与权限、移除成员等仍限 owner/admin（移除成员仍仅 owner）。
- 实现锚点：前端 `views/MemberManagementView.tsx`（`canReviewApplications`）；后端 `tenants.service.ts` 的 `assertCanReviewApplications` 同时门控 `getApplications` 与 `reviewApplication`（此前后端无校验，已补齐）。

---

## 6. 款式开发管理

开发管理「款式 / 商品信息」与「基础信息 → 产品与 BOM」共用 `ProductCategoryInfoFields`：按产品分类的 `hasSalesPrice`、`hasPurchasePrice`、`linkPartner`、`hasColorSize`、分类扩展字段等开关显示相同表单项；发布大货时字段一一写入 `Product`（`customerName` 为开发专属，不写入产品档案）。

**产品分类开关（设置 → 产品分类）**：

| 开关 | 字段 | 说明 |
|------|------|------|
| 启用采购价 | `hasPurchasePrice` | 产品档案 / 开发款式可录入参考采购单价；开启时**自动**开启「关联合作单位」 |
| 关联合作单位 | `linkPartner` | 产品档案可关联首选供应商；开发管理按客户排序/搜索由首选供应商名称推导 |
| 互斥 | — | 已启用采购价时不可单独关闭「关联合作单位」 |

**开发管理按客户排序**：左侧「按客户」由款式的首选供应商（`supplierId` → 合作单位名称）分组；`customerName` 在保存时自动同步，兼容历史数据。须至少一个产品分类启用 `linkPartner`。

**款号 / 品名唯一性**：创建或编辑开发款式时，`code`（款号，对应产品 `sku`）与 `name`（品名）须在租户内与已有 **产品档案**（`products` 表）不重复；与产品档案新建校验口径一致。另仍校验开发款式表内 `code` 不重复。

**路由**：前端 `/development`；API `/api/dev/*`。权限 `development:styles:*`、`development:templates:*`。

### 6.1 两套节点

| 类型 | 数据 | 用途 |
|------|------|------|
| 开发进度节点 | `DevStage`（按样品轮次） | 打样流程跟踪：设计、横机编程等；含工艺参数、附件、日志 |
| 大货生产工序 | `DevStyle.milestoneNodeIds` → `GlobalNodeTemplate` | 发布后的报工路线；BOM 的 `nodeId` 键与此一致 |

### 6.2 BOM 与发布大货

- 开发期 BOM 存 `dev_boms` / `dev_bom_items`；维度与产品档案一致：**一条 BOM = 父款式 × 变体（颜色×尺码）× 工序 `nodeId`**；子件为 `dev_bom_items` 行。
- 变体索引 `DevStyleVariant.nodeBoms`：`{ [nodeId]: devBomId }`，保存 BOM 后通过 `PUT /api/dev/styles/:id/variants/:variantId/node-boms` 同步（形状同 `ProductVariant.nodeBoms`）。
- **录入 UI**：`DevBomConfigSection` + `BomVariantMatrix`（与「基础信息 → 产品与 BOM」矩阵一致）；创建款式弹窗可预配 `pendingBoms`，保存款式后批量写入 `dev_boms`。单 SKU（无颜色尺码变体）时 `dev_boms.variant_id` 为空。
- **发布**（`POST /api/dev/styles/:id/publish`）：须先将开发产品 **归档**（`status=archived`）；事务内创建 `Product`、`ProductVariant`、`Bom`；预生成新产品 `bom-*` id，`nodeBoms` 与 `boms` 表 id 一致重映射；单 SKU 虚拟变体 `dvar-single-*` 映射到默认 `ProductVariant`；`Bom.nodeId` **原样拷贝**，不做工序名称映射。
- 已发布款式（`status=published`）不可再编辑；`publishedProductId` 指向产品档案。

### 6.3 安全删除

- 款式：所有样品下全部 `DevStage` 均为 `pending` 方可删除。
- 样品轮次：可删条件为「全部节点待开始」**或**「仅第一个节点为进行中且未录入任何资料（无附件、无填值字段），其余待开始」——即头样首节点刚进入进行中、尚未登记内容时仍可删；存在已录入资料或已推进（完成/异常/非首节点已开始）的节点则不可删。前后端（`canDeleteDevSample` / `deleteDevSample`）一致。允许删到 0 样品后再用「+」重建。
- 创建款式时**不再自动生成头样**；款式创建时配置的开发流程节点存为 `DevStyle.defaultStageNames`（默认流程）。头样与后续轮次都在「样品开发记录」区点「+」用同一弹窗（`DevAddSampleModal`）创建。
- 开发流程节点**可在「编辑款式」弹窗重新编辑**（非新建态也展示「开发流程节点配置」，保存即更新 `DevStyle.defaultStageNames`）；编辑后**新建的样品按新的开发节点**。
- 新建样品默认节点优先取 `DevStyle.defaultStageNames`（含头样与后续轮次，名称默认「头样」/「样品 N」）；款式无 `defaultStageNames`（历史数据）时回退到头样（首个轮次）节点 → 节点库默认顺序 → 内置兜底。已创建样品的节点不随之变更，仅影响之后新建的样品。
- 样品颜色尺码：当款式配置了颜色尺码（存在 `DevStyleVariant`）时，创建开发样品（头样与新增样品轮次）**必须**从款式的「颜色×尺码」组合中单选一个，落到 `DevSample.colorId/sizeId`，用于确定该样品打的是哪个颜色尺码；款式无颜色尺码时不展示选择器、强制为空。后端 `resolveSampleColorSize` 校验必填与组合归属。
- 样品面板 BOM 录入：在「样品开发记录」选中某样品后，可按该样品对应的颜色尺码变体录入 BOM（复用「变体×大货工序」矩阵，但只显示该样品对应的那一行变体）。这与「编辑款式」里该变体的 BOM 是**同一份数据**——样品面板录入即直接写 `DevStyleVariant` 的变体 BOM（`dev_boms` + `syncVariantNodeBoms`），保存后自动同步，无独立按钮。样品面板不改大货工序（隐藏工序选择器）；单 SKU 款式录入单 SKU BOM；历史未绑定颜色尺码的样品显示提示、不渲染矩阵。仅 `readOnly`/未发布且有编辑权限时显示。

### 6.4 附件

- `DevAttachment.fileUrl` 存 **data URL（base64）**，与产品路线报工附件、自定义字段文件上传一致，查询时直接从库取回。

### 6.5 开发节点库自定义内容

- **开发节点库**（`DevStageTemplate` + `DevStageTemplateField`）中每个节点的「节点登记自定义内容」与 **工单中心 → 表单配置 → 字段配置 → 报工自定义单据内容（按工序）** 对齐：支持字段类型 `text | date | select | file`、下拉选项、日期（含时分 / 自动填入）、必填。
- 配置 UI 复用 `ReportCustomFieldsConfigTable`；节点登记弹窗对模板字段复用 `ReportCustomFieldsEditor`，按类型渲染控件；登记值写入 `DevStageField.value`（字符串）与 `DevStageField.type`。
- 模板外仍可添加「附加参数」（自由 label + 文本值），与模板字段一并保存。

---

## 6.x 待办提醒（`todo_reminder` 插件）

- **个人级**：待办按 `userId` 隔离，每位成员只能查看/操作自己的待办；不进 RBAC 权限目录，开通插件后全员可用（与工作台/dashboard 同属个人区，接口不挂 `requireSubPermission`）。
- **来源**：`sourceType ∈ standalone | production_order | plan | product | outsource | rework | purchase_order | purchase_bill | sales_order | sales_bill | dev_stage | dev_bom`。`standalone` 为不关联单据的独立待办；其余从对应详情页「待办」按钮生成并快照单号、标题与跳转 `href`：`production_order`（工单详情）/ `plan`（计划详情）/ `product`（产品生产详情）/ `outsource`（外协「加工厂往来数量明细」）/ `rework`（返工管理「返工详情」）/ `purchase_order`（采购订单详情）/ `purchase_bill`（采购入库详情）/ `sales_order`（销售订单详情）/ `sales_bill`（销售单详情）/ `dev_stage`（开发管理「节点登记」）/ `dev_bom`（开发管理「BOM 录入」）。各待办「关联单据」标签（`[sourceDocNo, sourceTitle]` 拼接）统一以**所属模块名打头**：`sourceDocNo` 放模块名（生产计划 / 工单中心 / 外协管理 / 返工管理 / 采购订单 / 采购入库 / 销售订单 / 销售单 / 开发管理），`sourceTitle` 放单号 + 产品/标题快照。
- **提醒**：`remindEnabled` 开启时必须给将来时间 `remindAt`。到点（`remindAt <= now`）的待办，由工作台消息中心 `getNotifications` 注入消息流（轮询 ≤60s 呈现）；**完成后仍保留显示**（不改标题，完成状态由通知的 `done` 字段驱动：消息中心列表前置只读复选框图标、详情弹窗用可点击复选框/「标记完成·取消完成」按钮展示），仅**删除**待办才从消息中心移除。通知**标题**只放固定提示 +（若有）关联单据号，备注内容放 body；「前往单据」按 `href` 经 `utils/todoHrefNavigate` 把 query 透传进 `location.state`（`orderId/productId/planId` 别名映射为 `detailOrderId/detailProductId/detailPlanId`），各业务页据此**直接打开对应单据详情弹窗**：工单/产品/计划（`/production?tab=orders|plans&orderId|productId|planId=`）、返工（`/production?tab=REWORK&reworkOrderId=`，`ReworkPanel` 打开返工详情）、外协（`/production?tab=OUTSOURCE&outsourceFlow=<PartnerFlowDetailSeed JSON>`，`OutsourcePanel` 重开「加工厂往来数量明细」）、采购/销售（`/psi?tab=<PSITab>&psiDoc=<单号>`，`PSIOpsView` 在 `tab===type` 命中时打开对应单据详情）、开发管理（`/development?styleId=<款式>&devStageId=<节点>` 或 `&devSampleId=<样品>`，`DevManagementView` 先选中款式并切到对应页签/清空筛选，再由 `DevStyleMainContent` 打开「节点登记」或「BOM 录入」弹窗）。各页消费深链后会 `navigate(replace)` 清掉对应 state 键，避免切页签再回来重复弹窗。
- **入口**：工作台「消息中心」卡片头部「待办事项」按钮（插件关闭即隐藏）打开待办面板（未完成/已完成 + 搜索，可完成、编辑、删除、新建，列表按建立时间倒序）；各业务详情弹窗顶栏的「待办」按钮（`components/AddTodoButton`）带单据上下文新建：工单详情、计划详情、产品生产详情、外协「加工厂往来数量明细」、返工详情、采购订单/采购入库/销售订单/销售单详情、开发管理「节点登记」与「BOM 录入」（宿主弹窗层级高，按钮传 `modalZIndexClass` 上调新建弹窗层级）。

---

## 7. 待持续补充

- 生产报工更细粒度规则
- 打印 / 码管理的业务规则补充
- 后续新增业务模块

---

*最后更新：新增单价/金额查看权限规则（§5.6）。*
