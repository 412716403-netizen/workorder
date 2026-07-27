# 迁移清单（后端接入与收口）

> 本文档不再把项目视为“尚未接入后端”的空白清单，而是记录各模块当前是否已经具备后端能力、哪些仍需收口。更完整的现状说明见 [`06-current-architecture-and-migration-status.md`](./06-current-architecture-and-migration-status.md)。

## 状态说明

- `已落地`：已确认存在后端路由 / API 封装 / 数据模型主链路
- `部分落地`：已有后端能力，但前端切换、行为验证、文档同步或边界治理仍未完成
- `待补齐`：当前未确认闭环，或仍以旧逻辑为主

---

## 1. 认证、租户与权限

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 登录、登出、刷新 token | 已落地 | JWT + refresh；`refresh_tokens.client` 按端隔离，网页/小程序可同时在线（见 `docs/07` §4.3.3） | 会话缓存语义继续收敛 |
| 租户选择、成员与权限 | 已落地 | 已有 tenants / roles / admin 相关接口 | 统一权限模型与文档说明 |
| 平台企业使用情况 | 已落地 | `GET /api/admin/tenants/usage`：业务/负担/MAU/告警；`GET /api/admin/audit-logs`；登录写 `last_login_*` / `last_active_at` | 告警暂为看板红标，未做消息推送 | |
| 浏览器本地缓存 | 部分落地 | `currentUser`、`tenantCtx`、`userTenants`、`isLoggedIn` 仍保存在 `localStorage` | 明确哪些属于会话缓存，哪些不得再作为业务真源 |

---

## 2. 系统设置与基础资料

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 产品分类、合作单位分类、工序节点、仓库 | 已落地 | 已有 settings 路由与前端封装 | 细化子权限说明，保持文档同步 |
| 工序报工自定义字段（`reportTemplate`） | 已落地 | 维护入口迁至工单中心表单配置；`PUT /api/orders/node-report-templates`（`production:orders_form_config:allow`） | 数据仍存 `global_node_templates.report_template` |
| 收付款类型、收支账户类型 | 已落地 | 已有 settings 路由与前端封装 | 对照财务页面核验真实使用范围 |
| 产品、BOM、合作单位、工人、设备、字典 | 已落地 | 已有 master / products / boms 等后端能力；合作单位批量导入 `POST /master/partners/import` | 持续清理前端历史假设与文档中的旧字段说明 |

---

## 3. 计划、工单与报工

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 计划单 CRUD、拆单、工序路线覆盖、下达工单、子计划 | 已落地 | `PlanOrder.milestoneNodeIds` 可选覆盖产品标准路线；详情可编辑；`POST /api/plans/:id/split` 继承源计划路线；`convertPlanToOrders` 优先计划路线 | 继续核对前端是否仍保留旧计算路径 |
| 工单 CRUD、报工、可报量查询 | 已落地 | 已有 `/api/orders`、报工与产品进度接口；`GET /:id/reportable` 已合并 PMP；`createReport` / `createProductReport` 受 `allowExceedMaxReportQty` 控制做硬校验；新增 `PATCH /:id/dispatch-status` 用于关联工单模式下手动切换派发完成徽章（写 `dispatchStatusManual=true`） | 继续补充服务层与测试 |
| 小程序自报工审核 | 已落地 | `approvalStatus`（migration `20260708120000`）；`requireApproval` 创建 PENDING；`GET /my-reportable-tasks` / `my-report-history`；`POST /reports/:id/approve\|reject`；可报占用含 PENDING | Web 流水 + 小程序待审列表已接 |
| 工单派发完成状态（关联工单模式） | 已落地 | `ProductionOrder.dispatchStatus` / `dispatchStatusManual` 持久化字段；`recalcOrderDispatchStatusByStockIn` 在入库达标时返回 `dispatchCompletionPending` 供前端确认，确认后 `PATCH dispatch-status` 写 COMPLETED；回退仍自动写 IN_PROGRESS（`manual=true` 时跳过）；计划单徽章基于工单聚合（详见 `docs/01-business-rules.md §3.10`） | 后续如需"恢复自动判定"按钮，可补 `dispatchStatusManual=false` 重置接口 |
| 生产操作记录 | 已落地 | 已有 `/api/production/records` 等接口；`createRecord` / `createRecordBatch` 在 `OUTSOURCE 已收回` 写入前调用 `enforceOutsourceReceiveQuantity`，受 `allowExceedMaxOutsourceReceiveQty` 控制做硬校验 | 梳理大体量前端页面与复杂业务校验 |
| 返工物料领退 | 已落地 | `GET /api/production/orders/:orderId/rework-material-records` + `POST .../rework-material-issues/batch` / `.../rework-material-returns/batch`；服务端强制 `reason=来自于返工` + `orderId`，退料按「物料+仓库+批次」净领用校验；聚合复用 `material-op-shared.ts`（与开发物料同一算法）；Web「返工物料」弹窗（汇总/领料/退料，流水复用生产物料「领料退料流水」弹窗并预填本工单族）；生产物料流水类型标注「返工领料/返工退料」，仓库流水不变 | 小程序返工领料页仍走通用 `production/records` 写入，后续可切新端点并补退料入口 |
| 生产关联模式 | 已落地 | 规则与实现并存，读口径统一为"PMP + milestone 双路求和"（含 `OrderDetailModal` / `OrderListView` / 后端 `getReportable`）；OutsourcePanel 展示统计端已"全收"含 `orderId` 历史记录；**待收回清单与收货录入弹窗按行级 `orderId` 决定 scope，跨模式可见、可收回**（方案 A）；`OrderListView` 工单卡 / 产品组卡圆下剩余数字保持原口径（不扣外协），**hover tooltip 上额外提示"外协剩余 Z 件"**作为补充信息；`ProductionConfigTab` 切换前已加 `useConfirm` 提示；删除工单在 `product` 模式下不再跳过基础校验；后端 `createReport`/`createProductReport` 加 `enforceReportQuantity` 硬校验（受 `allowExceedMaxReportQty` 控制） | 持续在更多页面（看板、打印）核对模式分流口径 |

### 3.1 流水自定义 `collabData` 键映射

`production_op_records.collab_data`（前端 `ProductionOpRecord.collabData`）为 JSON 杂物袋，下列键与 `utils/productionOpCollab/*` 及打印上下文一致；长期迁移目标是将高频查询字段逐步建模为独立列或规范化子表。

| 键名 | 用途 |
|------|------|
| `stockInCustomData` | 生产入库流水自定义字段快照 |
| `outsourceDispatchCustomData` | 外协发出自定义字段 |
| `outsourceReceiveCustomData` | 外协收回自定义字段 |
| `reworkReportCustomData` | 返工报工批次自定义字段 |
| `defectTreatmentCustomData` | 处理不良品批次自定义字段 |
| `materialStockCustomData` | 领料/退料/外协物料单自定义字段 |
| `source` | 协作等业务来源标记（如 `collaborationReturn`） |

类型定义：`shared/types.ts` → `ProductionOpCollabData`。

---

## 4. 进销存（PSI）

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| PSI 记录 CRUD | 已落地 | 已有 `/api/psi/records` 系列接口 | 继续核对前端大页面内是否仍有遗留本地计算假设 |
| 库存查询 | 已落地 | 已有 `/api/psi/stock` 与前端 `getStock` 封装 | 对齐文档中的历史 mock / stableMockStock 描述 |
| 按批次库存与生产扣减 | 已落地 | `GET /api/psi/stock/batches`、Prisma `production_op_records.batch_no` / `psi_records` 复合索引、领料/退料/外协物料/返工领料写入与校验；**销售出库**按批手选；`getStock` 盘点项用 `diffQuantity` 与按批口径一致；`shared/types.normalizeBatchNo` 归一化；调拨/盘点单行写 `batchNo`；仓库列表展开批次缓存随 `records` 失效；`replaceRecords`/领退料 Serializable 事务 + `withSerializableRetry`（P2034 冲突重试）；错误处理对 P2034 返回可读中文提示；**采购订单不按批**、转采购入库单时按批见 `docs/01-business-rules.md` | 协作跨租户批次等仍非本期范围 |
| 采购单替换、批量写入、列表分组 | 部分落地 | API 已出现，但前端行为与列表分组策略仍需持续验证 | 细化“后端返回什么，前端只做展示什么” |

---

## 5. 财务与经营看板

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 财务记录 CRUD | 已落地 | 已有 `/api/finance/records` | 补充统计、校验与测试说明 |
| 资金账户余额 | 已落地 | `FinanceAccountType` 加期初余额；`GET /api/finance/account-balances` 实时聚合（期初+收-付）；`FinanceRecord.accountTypeId` 外键（migration `20260625120000` 已回填）；前端「资金账户」Tab | 后续可加按状态过滤（审核流）/账户报表 |
| 账户间转账 | 已落地 | `POST /api/finance/transfers` 事务内落 PAYMENT+RECEIPT 同组（`ZZD` 单号） | 后续可加转账撤销/红冲 |
| Dashboard / 工作台 | 已落地 | `/api/dashboard/*`：工作台页面存于 `system_settings.workbenchSharedPages`；owner 恒可见并可编辑全部页面；成员按裸 `workbench` 或 `workbench:<pageId>` 严格授权且只读，未授予任何工作台 key 时不显示入口；页面授权同时授予该页组件完整数据 | migration `20260710113000_tenant_member_role_cleanup` 将历史租户 `admin` 迁为 `worker`并清理旧 `dashboard` 权限；存量用户旧 `preferences.dashboardWorkbench` 中的自定义页不会自动迁入共享池 |
| 追溯码插件 | 已落地 | `featurePlugins.traceability`：计划追溯码、扫码累加、扫码称重 UI gate | 插件中心开通；存量租户默认开启 |
| 资料库 | 已落地 | `/api/knowledge-base/*`：文件夹/文档 CRUD、图片资源上传 | 前端 `KnowledgeBaseView`；插件 `knowledge_base` 可开关；**小程序只读**（树+详情，见 §10） |
| 收支汇总、库存预警、订单进度 | 部分落地 | 已有后端聚合方向 | 继续按指标逐项校验计算口径 |

---

## 6. 款式开发管理

- [x] 创建款式弹窗（款号/品名/分类/色码/主图/价格/开发流程节点）
- [x] 开发节点库管理（`DevStageTemplateModal`）
- [x] 样品轮次新增沿用节点库；节点登记匹配模板参数字段
- [x] 节点完成自动推进下一节点为「进行中」


| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 款式 CRUD、样品轮次、开发节点登记 | 已落地 | `/api/dev/styles`；`DevStage` 与 `GlobalNodeTemplate` 分离（开发进度 vs 大货工序） | — |
| 开发 BOM | 已落地 | 创建/编辑均支持工序+变体矩阵（`BomVariantMatrix`）；`node-boms` 同步；发布时 `bomId`/`nodeBoms` 重映射到产品档案 | — |
| 开发流程模板 | 已落地 | `/api/dev/stage-templates` | 新建款式时可选模板初始化可加强 |
| 发布大货商品 | 已落地 | `POST /api/dev/styles/:id/publish` → `products` + `variants` + `boms` | 发布后跳转产品档案入口可补 |
| 开发领料 / 退料 | 已落地 | `/api/dev/styles/:styleId/material-*`；`reason=来自于开发` + `customData.devStyleId`；Web 款式详情区块 + 小程序操作/流水页 | 生产物料中心无入口（按设计） |
| 小程序开发管理 | 已落地 | `packageBusiness/development-*`：列表/详情/创建编辑/样品/节点登记/BOM 格子下钻/节点库/开发物料；菜单 `development` + 插件门控；待办深链 | BOM 非 Web 整表矩阵；待办备注为简易弹窗 |

---

## 7. 协作、打印与码管理

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 企业协作 / 外协路线 | 已落地 | 已有 collaboration 路由、数据模型与前端 API 封装；接受派发 `createProduct` 含 `categoryDecision` + Zod 校验；`acceptTransfer` 事务化；字典项 `dictionary_items` 唯一约束 `(tenant_id, type, name)` 支撑并发 upsert；链头 `categoryName` 沿转发链路写入 payload | 继续治理 controller 过胖与权限边界不一致问题；可选后续：`collaborationCategoryMap` 甲方分类名 → 乙方分类预填 |
| 打印模板、预览、标签 | 部分落地 | 前端能力完整，但文档入口尚未充分整理 | 后续可补独立打印链路文档 |
| 单品码 `ItemCode` | 已落地 | 已有 schema、route、controller、前端 API 封装 | 补扫码响应类型与迁移链核验 |
| 虚拟批次 `PlanVirtualBatch` | 已落地 | 已有 schema、route、controller、前端 API 封装 | 核对 migration 完整性与打印链路说明 |
| 待办提醒 `todo_reminder` 插件 | 已落地 | `TodoItem` 表（migration `20260626120000_add_todo_items`）、`/api/todos` 路由（个人区，不挂 `requireSubPermission`）、`services/api/todos.ts` + `hooks/useTodos.ts`；提醒经 `dashboard.getNotifications` 注入工作台消息中心；**无 localStorage 业务字段**；消息「前往单据」按 `href` 内 `tab/orderId/productId/planId` 经 `location.state` 深链打开对应详情弹窗 | — |

---

## 8. 当前主要收口项

### 待产品确认（行为口径）

以下项实现上已有路径，但**跨单据/打印展示**的产品语义需业务侧拍板后再改代码，避免反复：

1. **外协流水详情中修改加工厂（合作方）**：`docNo` / 单号 segment 是否随厂重算、抑或保留原号仅 UI 提示，见 `OutsourceFlowDocumentDetailModal` 与 `utils/partnerDocNumber.ts`。
2. **报工批次编辑保存**：批次内多行 `customData` 不一致时，当前保存会**统一覆盖**为编辑表单一份 `customData`（有 toast 预警）；若需「逐行保留」需另定规则。

3. 文档已明显落后于代码实现，应以“当前架构现状 + 收口清单”取代旧的“未来接后端”口径。
4. 前端超大页面文件需要拆分，否则后端能力越完整，前端维护成本越高。
5. 后端需逐步从“route -> controller -> prisma”过渡到更稳定的 service 分层。
6. Prisma schema 与 migrations 需要继续核对，尤其是近期新增的单品码/批次码链路。

## 9. 前后端职责划分

| 层级 | 主要职责 |
|------|------|
| 后端 | 数据持久化、权限校验、业务规则校验、聚合计算、单据号与状态流转 |
| 前端 | UI、表单交互、API 调用、轻量展示分组、局部乐观更新、会话缓存恢复 |

**原则**：库存、汇总、状态流转、跨单据校验等应继续以后端为真源；前端不再承担核心业务真相，只承担展示与交互。

---

## 10. 微信小程序

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 登录 / 选企业 / 会话 | 已落地 | JWT + `tenantCtx` 本地缓存；`utils/request.js` 带 Bearer、401 刷新；**微信一键登录**（绑定已有账号，见 `docs/07` §4.5.2） | Web 扫码 / unionid 跨端未做 |
| 首页 / 应用中心 / 我的 | 部分落地 | 菜单对齐 Web `WORKBENCH_SHORTCUT_CATALOG`；权限过滤；生产计划、**工单中心**、**外协管理**、**返工管理**已深链；我的页可绑定/解绑微信 | — |
| **生产计划** | **部分落地（P2）** | 列表（搜索/状态/分页/采购进度）+ 详情只读 + 简化新建 + 下达工单；`packageBusiness/production-plans` / `production-plan-detail` / `production-plan-create` | BOM/PO/追溯/打印/删除留 Web |
| **工单中心** | **部分落地（P2+）** | 列表（搜索/仅未完成/分组/工序卡）+ 详情 + 手输报工 + 编辑 + 报工流水 + 待入库 + 领料；`packageBusiness/production-orders` 及子页 | 删除/打印/表单配置/矩阵报工留 Web |
| **外协管理** | **部分落地（P2+）** | Hub 主列表 + 待发/待收回/流水 + 发出/收回录入 + 往来明细 + 物料外发/退回（复用 stock-out-confirm）；`packageBusiness/production-outsource` 及子页 | 表单配置/流水编辑删除/打印/色码矩阵/协作同步留 Web |
| **返工管理** | **部分落地（P2+）** | Hub 主列表 + 待处理不良 + 处理/报工 + 流水编辑删除 + 详情 + 返工领料；`packageBusiness/production-rework` 及子页 | 表单配置/打印留 Web |
| **报工 Tab** | **已落地** | TabBar 居中「报工」=`pages/scan`：可报任务 + 我的报工；`selfReport` 提交 PENDING；工单中心筛选面板「报工审核」 | 原生 tabBar 无法按权限隐藏项（无 `process_report` 时页内空态） |
| **扫码会话** | **部分落地** | 分包 `scan-session` 连续扫码；报工/返工页内选工序；外协可选加工厂 | 产品关联模式外协/外协返工；待入库合并行 `orderIds` |
| **消息 Tab** | **部分落地** | 聊天式 UI：会话列表（系统消息/待办事项/协作合作单位）+ 详情列表；融合 `/dashboard/notifications` + `/todos` + `/collaboration/subcontract-transfers`；已读经 `GET/POST /dashboard/notification-reads` 与网页同步；Tab 角标 | 协作单据详情/操作仍依赖电脑端 |
| **产品与 BOM** | **部分落地** | 档案列表（分类 Tab/搜索/分页/启用切换）+ 产品编辑（基本信息/颜色尺码）；新建时消费网页 `productCodeRules` 自动取号（`GET /products/code-rules` + `next-code`）；`packageBusiness/basic-products` / `basic-product-edit`；**不含**工序/BOM 配置、批量导入、编号规则配置 UI | 工序路线、工价、BOM、分类/报工 file·knowledge 附件上传、编号规则配置留 Web |
| **合作单位** | **部分落地** | 档案列表（分类 Tab/搜索/分页）+ 单位编辑（名称/分类/扩展字段）；`packageBusiness/basic-partners` / `basic-partner-edit`；**不含**批量导入 | 协作租户绑定、file/knowledge 附件上传留 Web |
| **成员管理** | **部分落地** | Hub 三 Tab（成员列表/待审核/邀请码）+ 分配角色 + 工序分配 + 移除成员；`packageBusiness/basic-members`；对齐 Web `MemberManagementView`（**不含**角色 CRUD） | 角色权限树编辑、直接编辑成员 permissions 留 Web |
| **公共数据字典** | **已落地** | 列表（类型 Tab/搜索/分页）+ 字典项编辑（颜色/尺码/单位 CRUD）；`packageBusiness/basic-dictionaries` / `basic-dictionary-edit`；应用中心**不含**设备管理入口 | — |
| **资料库** | **部分落地（只读）** | 应用中心入口 + 文件夹树/搜索 + 文档详情（`rich-text` + 鉴权图片）；`packageBusiness/knowledge-base` / `knowledge-doc-detail` | 新建/编辑/上传、关联产品弹层、表单 knowledge 字段填写留 Web |
| **系统设置** | **已落地** | 6 Tab 全量对齐 Web `SettingsView`：档案类 `settings-archive-list` / `settings-archive-edit`（CRUD + 扩展字段 + 工序排序）；生产业务配置 `pages/settings-tab`（数量上限/扫码称重容差/物料成本口径，即时 PUT）；`utils/settingsApi.js` | `productionLinkMode`、各业务表单配置、收支账户类型、file/knowledge 上传、工序 `reportTemplate` 留 Web |
