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
| 登录、登出、刷新 token | 已落地 | 已有后端认证接口与前端 API 封装 | 继续收敛会话缓存语义，减少文档与实现漂移 |
| 租户选择、成员与权限 | 已落地 | 已有 tenants / roles / admin 相关接口 | 统一权限模型与文档说明 |
| 浏览器本地缓存 | 部分落地 | `currentUser`、`tenantCtx`、`userTenants`、`isLoggedIn` 仍保存在 `localStorage` | 明确哪些属于会话缓存，哪些不得再作为业务真源 |

---

## 2. 系统设置与基础资料

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 产品分类、合作单位分类、工序节点、仓库 | 已落地 | 已有 settings 路由与前端封装 | 细化子权限说明，保持文档同步 |
| 收付款类型、收支账户类型 | 已落地 | 已有 settings 路由与前端封装 | 对照财务页面核验真实使用范围 |
| 产品、BOM、合作单位、工人、设备、字典 | 已落地 | 已有 master / products / boms 等后端能力 | 持续清理前端历史假设与文档中的旧字段说明 |

---

## 3. 计划、工单与报工

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 计划单 CRUD、拆单、下达工单、子计划 | 已落地 | 已有 `/api/plans` 及相关动作接口；`listPlans` / `getPlan` 注入 `derivedStatus`（关联工单模式徽章数据源） | 继续核对前端是否仍保留旧计算路径 |
| 工单 CRUD、报工、可报量查询 | 已落地 | 已有 `/api/orders`、报工与产品进度接口；`GET /:id/reportable` 已合并 PMP；`createReport` / `createProductReport` 受 `allowExceedMaxReportQty` 控制做硬校验；新增 `PATCH /:id/dispatch-status` 用于关联工单模式下手动切换派发完成徽章（写 `dispatchStatusManual=true`） | 继续补充服务层与测试 |
| 工单派发完成状态（关联工单模式） | 已落地 | `ProductionOrder.dispatchStatus` / `dispatchStatusManual` 持久化字段，由 STOCK_IN 入库累计自动推进（`production.service.recalcOrderDispatchStatusByStockIn`，在 `createRecord` / `createRecordBatch` 内单条 / `updateRecord` / `deleteRecord` 触发，`manual=true` 时跳过）；计划单徽章基于工单聚合（详见 `docs/01-business-rules.md §3.10`） | 后续如需"恢复自动判定"按钮，可补 `dispatchStatusManual=false` 重置接口 |
| 生产操作记录 | 已落地 | 已有 `/api/production/records` 等接口；`createRecord` / `createRecordBatch` 在 `OUTSOURCE 已收回` 写入前调用 `enforceOutsourceReceiveQuantity`，受 `allowExceedMaxOutsourceReceiveQty` 控制做硬校验 | 梳理大体量前端页面与复杂业务校验 |
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
| Dashboard 汇总接口 | 已落地 | 已有 `/api/dashboard/stats` 聚合接口 | 核对看板指标口径与业务文档的一致性 |
| 收支汇总、库存预警、订单进度 | 部分落地 | 已有后端聚合方向 | 继续按指标逐项校验计算口径 |

---

## 6. 协作、打印与码管理

| 模块 | 当前状态 | 说明 | 剩余收口 |
|------|------|------|------|
| 企业协作 / 外协路线 | 已落地 | 已有 collaboration 路由、数据模型与前端 API 封装；接受派发 `createProduct` 含 `categoryDecision` + Zod 校验；`acceptTransfer` 事务化；字典项 `dictionary_items` 唯一约束 `(tenant_id, type, name)` 支撑并发 upsert；链头 `categoryName` 沿转发链路写入 payload | 继续治理 controller 过胖与权限边界不一致问题；可选后续：`collaborationCategoryMap` 甲方分类名 → 乙方分类预填 |
| 打印模板、预览、标签 | 部分落地 | 前端能力完整，但文档入口尚未充分整理 | 后续可补独立打印链路文档 |
| 单品码 `ItemCode` | 已落地 | 已有 schema、route、controller、前端 API 封装 | 补扫码响应类型与迁移链核验 |
| 虚拟批次 `PlanVirtualBatch` | 已落地 | 已有 schema、route、controller、前端 API 封装 | 核对 migration 完整性与打印链路说明 |

---

## 7. 当前主要收口项

### 待产品确认（行为口径）

以下项实现上已有路径，但**跨单据/打印展示**的产品语义需业务侧拍板后再改代码，避免反复：

1. **外协流水详情中修改加工厂（合作方）**：`docNo` / 单号 segment 是否随厂重算、抑或保留原号仅 UI 提示，见 `OutsourceFlowDocumentDetailModal` 与 `utils/partnerDocNumber.ts`。
2. **报工批次编辑保存**：批次内多行 `customData` 不一致时，当前保存会**统一覆盖**为编辑表单一份 `customData`（有 toast 预警）；若需「逐行保留」需另定规则。

3. 文档已明显落后于代码实现，应以“当前架构现状 + 收口清单”取代旧的“未来接后端”口径。
4. 前端超大页面文件需要拆分，否则后端能力越完整，前端维护成本越高。
5. 后端需逐步从“route -> controller -> prisma”过渡到更稳定的 service 分层。
6. Prisma schema 与 migrations 需要继续核对，尤其是近期新增的单品码/批次码链路。

## 8. 前后端职责划分

| 层级 | 主要职责 |
|------|------|
| 后端 | 数据持久化、权限校验、业务规则校验、聚合计算、单据号与状态流转 |
| 前端 | UI、表单交互、API 调用、轻量展示分组、局部乐观更新、会话缓存恢复 |

**原则**：库存、汇总、状态流转、跨单据校验等应继续以后端为真源；前端不再承担核心业务真相，只承担展示与交互。
