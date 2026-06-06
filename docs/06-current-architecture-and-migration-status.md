# 当前架构与迁移现状

> 本文档用于回答三个问题：项目现在是什么结构、迁移进行到哪一步、哪些结构问题已经值得治理。它不是业务规则文档，也不是逐接口说明，而是“当前现状快照”。

## 1. 当前阶段判断

当前仓库应视为一个**正在从前端聚合逻辑向后端真源收口**的制造业 ERP 项目，而不是纯前端原型。

### 已经明确存在的能力

- 前端：React + Vite + TypeScript
- 后端：Express + TypeScript + Prisma + PostgreSQL
- 数据层：Prisma schema 已覆盖主要业务域
- 业务域：认证、多租户、系统设置、基础资料、**款式开发**、计划、工单、报工、生产操作、进销存、财务、协作、单品码、虚拟批次、打印

### 当前不是的状态

- 不是“全部数据仍以 localStorage 为真源”的纯前端应用
- 不是“迁移已经完全收口、边界稳定”的成熟架构
- 不是“只需补几个 API”的轻量迁移阶段

## 2. 现实架构快照

### 2.1 前端

- 入口：`App.tsx`（侧栏「开发管理」位于「生产管理」之上，路由 `/development`）
- 款式开发：`views/development/DevManagementView.tsx`、`hooks/useDevStyles.ts`、`services/api/development.ts`
- 认证与租户：`contexts/AuthContext.tsx`
- 聚合数据：`contexts/AppDataContext.tsx`
- 主要页面：`views/`
- 打印链路：`views/PrintTemplateEditorView.tsx`、`components/print-editor/`、`utils/printResolve.ts`

### 2.2 后端

- 入口：`backend/src/app.ts`
- 路由：`backend/src/routes/`
- 控制器：`backend/src/controllers/`
- 中间件：`backend/src/middleware/`
- 数据模型：`backend/prisma/schema.prisma`

### 2.3 数据真源

| 类型 | 当前真源 |
|------|------|
| 业务主数据 | 后端 API + 数据库 |
| 租户/登录态恢复 | 浏览器 `localStorage` + httpOnly Cookie + 内存 token |
| 页面聚合状态 | `AppDataContext` |
| 打印模板 / 表单配置 | 已进入聚合状态与后端配置并存阶段，需持续收口 |

## 3. 当前最重要的结构事实

### 3.1 文档与实现已经出现阶段漂移

早期文档仍倾向于把项目描述为“前端 localStorage 持久化 + 未来接后端”，但实际代码中已经存在较完整的后端 API、Prisma 模型和多租户体系。

这意味着：

- 旧文档仍有参考价值，但不能单独代表当前实现
- 需要同时维护“业务规则文档”和“当前现状文档”
- 判断项目状态时，应优先交叉参考 `services/api.ts`、`types.ts`、`schema.prisma` 与本文件

### 3.2 前端骨架可用，但结构债务已经集中暴露

当前前端不是“没有结构”，而是“结构骨架尚可，但部分文件过大”。

主要问题：

- `views/ProductionMgmtOpsView.tsx`、`views/PSIOpsView.tsx`、`views/OrderListView.tsx`、`views/PlanOrderListView.tsx` 体量过大
- `App.tsx` 在路由层承担大量 props 注入
- `AppDataContext` 负责的数据范围过宽，成为跨模块汇聚点

这类问题短期不会让系统立刻失效，但会持续抬高新增功能、联调、回归和多人协作成本。

### 3.3 后端能支撑业务，但分层尚未收敛

后端已经具备清晰入口、中间件链路、多租户注入和主要业务路由，但整体更接近：

`route -> controller -> prisma`

而不是稳定成熟的：

`route -> controller -> service -> data`

当前主要特征：

- `auth`、`adminUsers` 已出现 service 层
- 大多数业务域逻辑仍集中在 controller
- 权限校验存在模块级、子权限级、局部自定义逻辑并存的情况

### 3.4 Prisma schema 比文档更接近真实状态

数据库模型已经覆盖：

- 多租户与成员关系
- 系统设置与基础资料
- 计划 / 工单 / 报工
- 进销存 / 财务
- 协作
- 单品码 / 虚拟批次

但近期新增能力仍应继续核对迁移链完整性，避免 schema 已更新、migration 历史却无法完整复现。

### 3.5 协作派发接受（现状要点）

- 乙方 `POST /collaboration/subcontract-transfers/:id/accept` 主逻辑在 `backend/src/services/collaboration.service.ts` 内以 **`$transaction` 单事务**提交；与工单创建、协作 SKU 映射、色码字典写入同进同退。
- 新建本地产品时的分类由 `createProduct.categoryDecision`（`existing | create | none`）显式表达；**不再**用甲方派发 `payload.categoryName` 自动建分类写库。
- 字典并发：`dictionary_items` 上 `(tenant_id, type, name)` 唯一约束 + `upsert`，避免并行接受相同色码名时反复 P2002。
- 外协链多站转发时，下游派发 `payload.categoryName` 可与色码一致，**优先沿用链头甲方**最早派发单上的值（见 `getOriginChainDispatchCategoryName`）。

### 3.6 生产关联模式：读口径混读 + 后端硬校验（现状要点）

- **读口径双路求和**：`order` 与 `product` 模式切换时为防数据"看起来消失"，前后端报工口径统一为 `combinedCompletedAtTemplate = PMP(同 product+template) + milestone.completedQuantity`。
  - 已对齐：`ReportModal`、`OrderDetailModal` 工序表、`OrderListView` 产品组卡、后端 `GET /orders/:id/reportable`。
  - 工单卡圆心采用 `items.quantity` 比例摊回 PMP 的**估算值**（hover tip 已标注），精确数字以产品维度详情为准。
- **列表小卡 hover tooltip 增补外协未收回**：`OrderListView` 工单卡 / 产品组卡圆下数字保持原口径（`可报 - 已报`，不扣外协，避免日常列表数字反复跳动），**hover tooltip** 上额外追加「外协剩余 Z 件」作为补充信息，与 `ReportModal` 的"扣外协剩余"口径互补。产品模式下工单卡的外协未收回按 `items.quantity` 比例摊回（与 PMP 摊回对称），产品组卡合并产品维度 + 旗下所有工单维度的外协。
- **写口径仍按当前模式分流**：`order` 写 `Milestone`/`MilestoneReport`；`product` 写 `ProductMilestoneProgress`/`ProductProgressReport`。
- **后端硬校验**：`createReport` / `createProductReport` 在写入前调用 `enforceReportQuantity`，受 `SystemSetting.allowExceedMaxReportQty` 控制。`false` 时拒绝 `(已报+本次) > totalQty` 的请求；`true` 时完全放行。`product` 范围以该产品下 `Σ orders.totalQty` 为上限。
- **外协收货后端硬校验**：`createRecord` / `createRecordBatch` 在 `OUTSOURCE 已收回` 写入前调用 `enforceOutsourceReceiveQuantity`，受 `SystemSetting.allowExceedMaxOutsourceReceiveQty` 控制。`false`（默认）时按 `(orderId/productId, nodeId, partner, variantId?)` 维度聚合 `加工中/已收回` 数量，拒绝 `(已收+本次收) > 已派`；`true` 时完全放行。前端 `OutsourcePanel.handleReceiveFormSubmit` / `OutsourceReceiveQuantityModal`（手输 + 矩阵 cell + 扫码累加）也按同一开关条件化所有 pending clamp / toast。
- **OutsourcePanel 跨模式收回（方案 A）**：待收回清单（`outsourceReceiveRows`）与收货录入弹窗（`OutsourceReceiveQuantityModal`）按行级 `orderId` 决定 scope（"工单级 / 产品级"维度徽标），与当前 `productionLinkMode` 无关；写入仍保持"发出维度 = 收回维度"对称（工单级回写 `Milestone`，产品级回写 `PMP`）。模式切换不再造成"数据黑洞"。
- **模式切换前提示**：`ProductionConfigTab` 切换 `productionLinkMode` / `processSequenceMode` 通过 `useConfirm` 弹出影响说明。
- **工单删除（product 模式）**：前端不再跳过 `hasReport / relatedRecords / childOrders` 三项校验；当该产品有 PMP 累计已报工时，确认弹窗追加"删除单工单不会清除产品池进度"提示。
- 详见 `docs/05-production-link-mode.md` §12-§15。

## 4. 数据归属原则

后续继续开发时，建议统一遵守以下规则：

1. **服务端真源优先**
   - 业务主数据、状态流转、库存、统计、跨单据校验，应以后端和数据库为准。

2. **客户端缓存只做缓存**
   - `currentUser`、`tenantCtx`、`userTenants`、`isLoggedIn` 这类浏览器缓存只用于恢复会话与提升体验，不能再承担业务真相。

3. **前端聚合状态不等于永久存储**
   - `AppDataContext` 负责页面消费与操作分发，不应被误认为数据的最终归属地。

4. **文档必须显式说明“真源是谁”**
   - 新增字段、模块、打印链路、协作链路时，必须写清楚：是服务端持久化、客户端缓存，还是临时 UI 状态。

## 5. 当前已知结构问题

### 高优先级

1. 文档与实现漂移，容易误判项目阶段
2. 前端巨型页面文件过多
3. `AppDataContext` 过宽，路由层 props 过重
4. 后端 service 层覆盖不足，controller 偏胖
5. schema 与 migration 需要持续对账

### 中优先级

1. 打印、标签、预览链路的文档入口还不够集中
2. 权限模型尚未完全统一成单一风格
3. 扫码、协作等扩展链路的类型契约仍可进一步收紧

## 6. 推荐治理顺序

### 第一阶段：先恢复认知一致性

- 更新 `docs/README.md`
- 更新 `docs/02-data-structures.md`
- 更新 `docs/04-migration-checklist.md`
- 后续所有“现状变化”优先同步本文件

### 第二阶段：拆前端大文件

优先考虑：

- `views/ProductionMgmtOpsView.tsx`
- `views/PSIOpsView.tsx`
- `views/OrderListView.tsx`
- `views/PlanOrderListView.tsx`

建议拆分方向：

- 视图壳
- 表格 / 列表组件
- 表单弹窗
- 领域 hooks
- 纯计算 utils

### 第三阶段：收敛后端分层

- 把复杂业务逻辑从 controller 抽到 service
- 统一参数校验风格
- 统一权限校验粒度与挂载方式

### 第四阶段：补契约与迁移核验

- 核对关键 Prisma migration 是否可从空库完整执行
- 收紧扫码、协作、打印扩展接口的类型定义

## 7. 使用说明

如果你要继续维护本仓库，建议这样用这些文档：

- 想看业务规则：读 `01-business-rules.md`
- 想看当前系统到底是不是已经接后端：读本文件
- 想看字段和数据归属：读 `02-data-structures.md`
- 想看模块还差什么没收口：读 `04-migration-checklist.md`
- 想看生产关联模式：读 `05-production-link-mode.md`
- 想弄清为什么还有 `localStorage`：读 `07-auth-tenant-session.md`
- 想梳理打印、标签、单品码、批次码：读 `08-printing-and-label-flow.md`

## 7.1 容量与扩展（运维向）

- 路线图与 Phase 说明、PM2/Redis、列表分页与前端兼容策略见 **`docs/10-capacity-and-scaling.md`**。
- 后端列表接口默认分页；旧客户端通过 `?all=true` 拉全量时打 `[list:all]` 告警日志。
- **Phase 3.E（已完成）流水弹窗默认当天 + 删 12000 上限**：
  - `ProductionMgmtOpsView` 不再 `fetchAllProductionByTypes`（旧 12000 客户端硬上限已移除），`StockMaterialPanel / OutsourcePanel / ReworkPanel` 各自按 `activeOrderIds / 今日窗口` 多条 `useQuery` 窄拉。
  - 7 个流水弹窗（领退料 / 外协 / 返工报工 / 不良品处理 / 仓库 / 报工流水 / 生产入库流水）内部独立 `useQuery`，默认 `dateFrom = dateTo = today`，无上限分页。
  - **进销存四 Tab 业务流水**（采购订单 / 采购入库 / 销售订单 / 销售单）：`PsiOrderBillFlowListModal` 按当前 Tab `type` 窄拉，`queryKey` 前缀 `flow.psi.<PURCHASE_ORDER|PURCHASE_BILL|SALES_ORDER|SALES_BILL>`，工具栏「订单流水 / 采购流水 / 销售流水」入口，按单号→行组聚合 + 冻结合计。
  - **财务收款/付款流水**：`FinanceDocFlowListModal` 按 Tab `RECEIPT|PAYMENT` 窄拉 `finance.listPage`，`queryKey` 前缀 `flow.finance.<RECEIPT|PAYMENT>`，工具栏「收款流水 / 付款流水」入口，一行一单 + 金额合计。
  - 新 queryKey 前缀：`stockPanel.* / outsourcePanel.* / reworkPanel.records / flow.stock / flow.stockIn / flow.outsource / flow.reworkReport / flow.defect / flow.warehouse.psi.* / flow.warehouse.prod / flow.reportHistory / flow.psi.* / flow.finance.*`。
  - 新后端接口：`psi.listRecords` 加 `startDate/endDate/search/types`；新增 `GET /api/orders/report-history`。
  - `PendingStockPanel` 内嵌的「生产入库流水」与 `OrderListView.orderCenterProdQuery` 脱钩，绕过其 40 页/8000 条客户端硬上限；主面板「待入库清单」跨日累计逻辑仍沿用 props.prodRecords。
  - `AppDataContext.invalidateAll{Prod,Psi}Records` 改 predicate 风格批量匹配 queryKey 前缀，修复旧 `psiOps.warehouseStockProd` 与实际 key 不一致的 invalidate bug。

## 8. 本文件的边界

本文件关注的是“当前架构与迁移阶段”，不负责：

- 逐接口 API 细节
- 逐表字段说明
- 逐业务模块完整规则
- 代码风格细节

这些内容分别由其他文档维护。
