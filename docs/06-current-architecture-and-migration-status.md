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
| 企业成员身份 | `tenant_memberships.role`：仅 `owner`（创建者）/ `worker`（成员）；成员业务权限由 `roleId` 绑定的自定义角色提供，空权限不再默认全权 |
| 页面聚合状态 | `AppDataContext` |
| 打印模板 / 表单配置 | 已进入聚合状态与后端配置并存阶段，需持续收口 |
| 待办提醒（`todo_reminder` 插件） | 后端 `TodoItem` 表 + `/api/todos`（个人区，按 `tenantId + userId` 隔离，不挂 `requireSubPermission`；`TodoItem` 已登记进 `lib/prisma.ts` 的 `TENANT_MODELS`）；工作台首页「待办事项」组件（`todos`，插件开启自动出现）管理清单；提醒经 `dashboard.getNotifications` 注入工作台消息中心，无业务字段落本地 |
| 微信服务号模板消息 | `users.wx_mp_openid` + `wx_push_logs`；公开回调 `/webhooks/wechat-mp`；个人区 `/api/wx-mp/*`；对齐小程序消息 Tab：公告 / 到期 / 待办到点 / 协作待处理，约 60s 轮询推送（公告发布时即时 fanout）；模板暂复用 `WX_MP_TEMPLATE_TODO_REMIND` |

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
- 工作台域已按职责细分：`dashboard.service.ts`（工作台/快捷入口/统计）、`dashboardMessages.service.ts`（消息 feed + 已读 + 平台公告）、`featurePlugins.service.ts`、`tenantMembership.service.ts`（共享的成员/`preferences` 读取）；`dashboard.controller.ts` 分别按域引用，避免 service 间循环依赖

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
- **小程序自报工审核**：`MilestoneReport` / `ProductProgressReport.approvalStatus`；进度只计 `APPROVED`；可报 `remaining` 扣 `PENDING`；审核 API 与 Web 流水 / 小程序待审列表已通。
  - **产品模式报工 Tab（已对齐）**：可报任务按「产品×工序」聚合（`listMyReportableTasks`）；提交写 `POST /orders/product-progress/report`；扫码 `PRODUCT_REPORT`；详见 `docs/05` §12.1。
  - **报工链路性能**：主数据短 TTL 缓存；报工 Tab `onShow` 45s 防抖；报工页改 `GET /products/:id` + `product-progress?productId=` 窄拉；报工 Tab 去掉 business 分包预加载。
  - 已对齐：`ReportModal`、`OrderDetailModal` 工序表、`OrderListView` 产品组卡、后端 `GET /orders/:id/reportable`。
  - 工单卡圆心采用 `items.quantity` 比例摊回 PMP 的**估算值**（hover tip 已标注），精确数字以产品维度详情为准。
- **列表小卡 hover tooltip 增补外协未收回**：`OrderListView` 工单卡 / 产品组卡圆下数字保持原口径（`可报 - 已报`，不扣外协，避免日常列表数字反复跳动），**hover tooltip** 上额外追加「外协剩余 Z 件」作为补充信息，与 `ReportModal` 的"扣外协剩余"口径互补。产品模式下工单卡的外协未收回按 `items.quantity` 比例摊回（与 PMP 摊回对称），产品组卡合并产品维度 + 旗下所有工单维度的外协。
- **写口径仍按当前模式分流**：`order` 写 `Milestone`/`MilestoneReport`；`product` 写 `ProductMilestoneProgress`/`ProductProgressReport`。
- **后端硬校验**：`createReport` / `createProductReport` 在写入前调用 `enforceReportQuantity`，受 `SystemSetting.allowExceedMaxReportQty` 控制。`false` 时拒绝 `(已报+本次) > totalQty` 的请求；`true` 时完全放行。`product` 范围以该产品下 `Σ orders.totalQty` 为上限。
- **外协收货后端硬校验**：`createRecord` / `createRecordBatch` 在 `OUTSOURCE 已收回` 写入前调用 `enforceOutsourceReceiveQuantity`，受 `SystemSetting.allowExceedMaxOutsourceReceiveQty` 控制。`false`（默认）时按 `(orderId/productId, nodeId, partner, variantId?)` 维度聚合 `加工中/已收回` 数量，拒绝 `(已收+本次收) > 已派`；`true` 时完全放行。前端 `OutsourcePanel.handleReceiveFormSubmit` / `OutsourceReceiveQuantityModal`（手输 + 矩阵 cell + 扫码累加）也按同一开关条件化所有 pending clamp / toast。
- **生产入库数量上限（仅前端）**：STOCK_IN 写入后端**无**数量硬校验，待入库上限只在前端 `PendingStockSingleModal` / `PendingStockBatchModal` / `usePendingStockState` 扫码累加处 clamp，受 `SystemSetting.allowExceedMaxStockInQty` 控制。`false`（默认）时入库数量被限制在每行/每规格 `pending`（工单总量 − 已入库）以内；`true` 时放开所有 pending clamp（手输、矩阵 cell、清单扫码累加），允许超量入库（关联产品多工单分摊时超出部分由 `buildSingleStockInRecords` 全部归入末尾工单，不丢失数量）。
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
- **Phase 3.F（已完成）登录首屏提速（安全重做版）**：
  - **首屏拆两批**（`contexts/appDataLoadCore.ts`）：critical 批（getConfig + 产品分类 + 工序节点 + 仓库）完成即撤全屏 spinner；secondary 批（products / boms / partners / 字典 / 财务分类 / 成员 / 设备）后台补齐，完成后置 `masterDataReady=true`。产品档案页在未就绪且列表为空时显示局部 loading。`App.tsx` 的 `AppLayout` 拆出 `AppLayoutReady`，spinner 期间不挂载协作红点 / feature-plugins / workbench hook。
  - **products lite（保守版）**：`GET /products?lite=true`（前端 `api.products.list` 默认带）用 Prisma `omit` 裁 4 个 `economics*` 经营核算规则 JSON，以及 Phase 3.H 起再裁 `imageUrl` 原图（列表改用 `imageThumb`）；**保留** `routeReportValues / routeReportDisplayValues / nodeRates / nodePricingModes / milestoneNodeIds` 与 variants 全字段（含 `nodeBoms`）——这些被报工弹窗展示项、领退料/外协物料、产品编辑表单直接消费，裁掉会复现「工序标签数量错误」同类问题。编辑/详情走 `GET /products/:id` 按需拉原图。
  - **orders / product-progress 不做 lite**：`milestones[].reports` 明细是前端按规格聚合工序标签数字的数据源，首拉与刷新均保持全量结构。瘦身留待服务端预聚合后再做。
  - **orders 增量刷新**：`GET /orders?updatedAfter=<ts>` 只返回自该时间起有变化的工单；因报工/审批只 update `milestone` 不触碰工单 `updatedAt`，增量条件覆盖「工单自身 / milestones / childOrders 任一有更新」。前端 `refreshOrders` 带 2 分钟重叠窗口 + `mergeById` 幂等合并。注意增量拿不到「被删除的工单」（本地删除路径已同步 setOrders，跨标签页依赖下次全量）。
  - **权限缓存**：`buildTenantPayload` TTL 5s→30s + 进程内 singleflight；`invalidateAuthTenantCache / invalidateAuthCacheForTenant` 同步清 in-flight。权限写路径仍主动失效，30s 只是漏调 invalidate 时的兜底窗口。
  - **启动请求去重**：`useFeaturePlugins` 用 getConfig 已带的 `featurePlugins` 作 React Query `initialData`（getConfig 403 时回退正常请求）；`AuthContext.syncTenantPermissions` 首屏延后 2.5s。
  - **product 模式工序锁定标记缓存**：`getProductIdsWithActiveOrders` 加 60s Redis 缓存（key `cache:products:active-order-product-ids:<tenantId>`）；仅影响 `processLocked` 展示标记，写保护 `assertProcessRouteEditableIfNeeded` 实时查库。
  - **索引**：`production_orders(plan_order_id)`、`production_orders(tenant_id, dispatch_status)`（migration `20260714090000_production_order_plan_dispatch_indexes`）；`products(tenant_id, name varchar_pattern_ops)`、`dev_styles(tenant_id, name varchar_pattern_ops)`（migration `20260726010000_product_code_pool_pattern_indexes`，供产品编号取号号池的前缀扫描，见 `docs/02` §1.5.1）。
  - 部署提醒：生产环境须配 `REDIS_URL`（无 Redis 时权限/锁定标记缓存自动降级为直查 DB）并执行 `prisma migrate deploy`。
- **Phase 3.G（已完成）产品经营弹窗提速**（`dashboard/product-economics` 列表 + `:productId` 明细）：
  - **明细接口按 productId 下推过滤**：`loadProductionAggregates`（报工/外协/返工/报废聚合）与 `loadPsiAggregates`（销售/库存）加可选 `productId`；`computeMaterialSurplusLossByProduct` 加 `{ scoped: true }` 模式——先按成品找工单家族（生产该成品的工单 + 沿 `parentOrderId` 向上补祖先 + 向下补子孙，`loadScopedOrderIds`），再只拉家族内工单（嵌套报工）与相关领退料流水（`sourceProductId in ids OR orderId in 家族`）。此前点单个产品明细会全量拉全租户报工重算一遍。列表接口传全部产品时行为不变（不走 scoped）。
  - **结果缓存**（`backend/src/services/productEconomicsCache.ts`，TTL 60s）：key 含 `materialCostMode + period/customRange + 权限位(canProduction/canPsi/canFinance)`，两个物料成本口径独立缓存、不同权限用户不串数据。读序：进程内内存 → Redis → 计算；无 `REDIS_URL` 时内存兜底仍生效（单实例语义等效）。失效走租户级版本号（内存 + Redis `pe:ver:<tenantId>` INCR），价格写路径（全局物料价规则 / 成品 BOM 物料价 / 报工·外协工序单价的默认规则与覆盖）均触发失效。同 key `singleflight` 合并 widget 预热与弹窗并发首算。报工/销售等业务写入不主动失效，数字最多延迟 60s（前端另有 60s staleTime）。
  - **document_linked 列表跳过报工物料成本**：该口径下列表行 `materialCost` 恒为 0，`loadProductionAggregates({ skipMaterialCost: true })` 不 select `materialBreakdown`/`variantId`，并跳过逐条 BOM 物料计算；明细接口仍算物料（工序明细卡片需要）。
  - `processEconomicsPrice` 四个 update 函数与 `updateParentMaterialPriceDefaultRule` 签名加 `tenantId` 参数（用于失效缓存）。
- **Phase 3.H（已完成）产品主图缩略图**：
  - `Product.imageThumb`（migration `20260714170000_product_image_thumb`）：create/update/import 时用 `sharp` 从 `imageUrl` 生成约 256px JPEG 缩略图；http(s) 外链则 thumb 复用原链接。
  - `products?lite=true` 再裁 `imageUrl`（保留 `imageThumb`）；Web/小程序列表与打印统一走 `productThumbSrc` / `imageThumb || imageUrl`；编辑页 `GET /products/:id` 补原图，保存时 absent `imageUrl` 不代表清空。
  - 列表点击产品图：`components/ProductImageLightbox` 先展示缩略图，再按需拉详情原图。
  - 前端上传三入口 canvas 压缩（最长边 1600px / JPEG 0.85）：`ProductEditForm`、`ProductCategoryInfoFields`、`ProductImportModal`。
  - 存量回填：`backend` 下 `npm run db:backfill-product-thumbs`（可选 `--force` 按当前尺寸重算）；部署需 `prisma migrate deploy` + 跑一次回填。
- **资金账户余额与转账（已完成）**：
  - `FinanceAccountType` 加 `initialBalance/openingDate/accountKind/sortOrder/active`；`FinanceRecord` 加 `accountTypeId` 外键（migration `20260625120000_finance_account_balance` 按 `(tenant_id, name)` 回填，保留 `payment_account` 作展示/回退）。
  - 余额实时聚合（不落库存量）：`GET /api/finance/account-balances`（`finance:account:view`）→ `getAccountBalances` → 纯函数 `accumulateAccountBalances`（含单测 `backend/tests/financeAccountBalances.test.ts`）。
  - 账户间转账：`POST /api/finance/transfers`（`finance:transfer:create`）事务内落 PAYMENT+RECEIPT 同 `transferGroupId`/`ZZD` 单号；前端「财务 - 资金账户」Tab（`AccountBalancesTab` + `AccountTransferModal`），账户流水下钻按 `accountTypeId` 窄拉 `finance.listPage`。
  - 转账编辑/删除（成对操作）：`PUT /api/finance/transfers/:groupId`（`finance:transfer:edit`）事务内成对改两腿、保持 `docNo`/`transferGroupId` 不变；`DELETE /api/finance/transfers/:groupId`（`finance:transfer:delete`）按 `transferGroupId` 成对删。`deleteRecord` 也对转账腿做级联（删任一腿即删整组），避免从收/付款列表误删半条转账导致余额失衡。流水下钻点「详情」打开 `FinanceDetailModal`，转账记录在弹窗右上角显示「编辑/删除」（按 `finance:transfer:edit|delete` 权限）：编辑复用 `AccountTransferModal` 编辑模式，删除走 `deleteTransfer`（弹窗自带二次确认）。

## 8. 本文件的边界

本文件关注的是“当前架构与迁移阶段”，不负责：

- 逐接口 API 细节
- 逐表字段说明
- 逐业务模块完整规则
- 代码风格细节

这些内容分别由其他文档维护。
