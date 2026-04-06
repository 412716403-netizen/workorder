# 数据流与计算点清单

> 本文档用于回答“数据从哪里来、在哪里聚合、哪里应该计算”。它不再按旧的前端行号清单组织，而是按当前仓库的真实分层来描述：前端页面、聚合状态、API、后端路由 / 控制器 / Prisma。

## 1. 阅读方式

如果你在排查某个功能，建议按这个顺序看：

1. 先确认数据真源：数据库 / 后端 API / 客户端缓存
2. 再确认前端入口：`AppDataContext`、对应 `View`、相关 `utils`
3. 再确认后端链路：`backend/src/app.ts` → `routes` → `controllers` → Prisma
4. 若发现口径差异，同时回查 `01-business-rules.md` 与 `02-data-structures.md`

---

## 2. 总体数据流

### 2.1 前端主链路

```text
AuthContext(localStorage + cookie/session)
        ->
AppDataContext(聚合拉取 + 刷新 + 操作入口)
        ->
App.tsx 路由层
        ->
各业务 View
        ->
表单 / 列表 / 打印 / utils
```

### 2.2 后端主链路

```text
backend/src/app.ts
        ->
middleware(auth / tenant / permission / error)
        ->
routes/*
        ->
controllers/*
        ->
Prisma / getTenantPrisma()
        ->
PostgreSQL
```

### 2.3 当前重要边界

| 层 | 主要职责 |
|------|------|
| `AuthContext` | 登录态、租户上下文、本地会话缓存恢复 |
| `AppDataContext` | 聚合业务数据、提供刷新与写操作入口 |
| `views/*` | 业务交互、页面编排、局部派生展示 |
| `utils/*` | 纯计算、格式化、打印数据转换 |
| 后端 API | 数据持久化、业务校验、聚合统计、权限隔离 |

---

## 3. 认证、租户与权限

| 环节 | 位置 | 数据 / 逻辑 |
|------|------|------|
| 登录态恢复 | `contexts/AuthContext.tsx` | 读取 `currentUser`、`tenantCtx`、`userTenants`、`isLoggedIn` |
| Token 刷新 | `services/api.ts` | 401/403 后自动走 `/auth/refresh` |
| 当前租户注入 | `backend/src/middleware/tenant.ts` | 把租户上下文写入请求 |
| 租户数据隔离 | `backend/src/lib/prisma.ts` | `getTenantPrisma()` 自动注入 `tenantId` |
| 模块权限 | `backend/src/app.ts`、部分 `routes/*.ts` | 模块权限与子权限并存 |

**计算 / 风险点**：

- 登录态不是纯后端无状态，也不是纯前端真源，而是 `localStorage + cookie + 内存 token` 混合
- 角色、租户、子权限在不同路由层级上校验粒度不完全统一

---

## 4. 系统设置与基础资料

### 4.1 主数据来源

| 业务域 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| 产品分类 / 合作单位分类 / 工序节点 / 仓库 | `AppDataContext`、`SettingsView.tsx` | `services/api.ts -> settings.*` | `/api/settings/*` |
| 产品 / BOM | `AppDataContext`、`BasicInfoView.tsx`、`ProductManagementView.tsx` | `products`、`boms` | `/api/products/*` |
| 合作单位 / 工人 / 设备 / 字典 | `AppDataContext`、`BasicInfoView.tsx` | `partners`、`workers`、`equipment`、`dictionaries` | `/api/master/*` |

### 4.2 主要计算点

这一组模块以 CRUD、筛选、表单转换为主，复杂业务计算较少，重点在：

- 字段配置的显示 / 隐藏
- 工序、分类、合作单位、字典的关联约束
- 产品、变体、BOM 之间的绑定关系

---

## 5. 计划、BOM 与工单

### 5.1 计划链路

| 功能 | 前端入口 | 主要依赖 | 后端入口 |
|------|------|------|------|
| 计划单 CRUD | `PlanOrderListView.tsx` | plans、products、globalNodes | `/api/plans` |
| 拆单 | `PlanOrderListView.tsx` | plan items、variant、数量分配 | `/api/plans/:id/split` |
| 创建子计划 | `PlanOrderListView.tsx` | BOM 递归、计划用量 | `/api/plans/:id/sub-plans` |
| 计划转工单 | `AppDataContext` / `App.tsx` | plan 状态、子计划层级 | `/api/plans/:id/convert` |

### 5.2 主要计算点

| 计算 | 说明 | 当前归属 |
|------|------|------|
| `materialRequirements` | 多级 BOM 展开、理论总需量、缺料数、计划用量 | 仍有明显前端逻辑，后续应继续后移 |
| 采购建议拆单 | 基于计划用量对叶子物料分组 | 前端主导，适合后续抽到后端 |
| 子计划树 | 父子计划递归展示与检索 | 前端页面逻辑 |
| 编号生成 / 状态流转 | 计划单号、工单号、补充下达 | 前后端都需保持一致 |

### 5.3 工单链路

| 功能 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| 工单 CRUD | `OrderListView.tsx` | `orders.*` | `/api/orders` |
| 工序报工 | 生产明细 / 工单详情 | `orders.createReport` 等 | `/api/orders/:id/milestones/:mid/reports` |
| 产品进度报工 | 产品关联模式相关入口 | `orders.createProductReport` 等 | `/api/orders/product-progress/report` |
| 可报量查询 | 报工前校验 | `orders.getReportable` | `/api/orders/:id/reportable` |

**结构提示**：

- 计划 / 工单是当前前端结构债务最集中的区域之一
- 物料需求、子计划树、补充下达等逻辑不应再只依赖单个超大视图文件理解

---

## 6. 生产操作

### 6.1 主链路

| 功能 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| 领料 / 退料 / 外协 / 返工 / 入库记录 | `ProductionMgmtOpsView.tsx` | `production.*` | `/api/production/records` |
| 不良 / 返工汇总 | 生产管理页面相关入口 | `production.getDefectiveRework()` | `/api/production/defective-rework` |

### 6.2 关键数据关系

- `ProductionOpRecord` 可关联工单，也可能在产品模式下不关联工单
- 外协、返工、生产入库等记录会影响工单删除校验、报工可报量或协作链路
- 这一层既有业务规则，也有大量表单与展示逻辑，是后续拆分重点

---

## 7. 进销存（PSI）

### 7.1 主链路

| 功能 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| PSI 记录列表 | `PSIOpsView.tsx` | `psi.list()` | `/api/psi/records` |
| 新增 / 修改 / 删除 | `PSIOpsView.tsx` | `psi.create/update/delete` | `/api/psi/records/*` |
| 批量写入 / 替换 | `PSIOpsView.tsx` | `psi.createBatch()`、`psi.replace()` | `/api/psi/records/batch`、`/replace` |
| 库存查询 | PSI / 计划 / 看板等入口 | `psi.getStock()` | `/api/psi/stock` |

### 7.2 关键计算点

| 计算 | 说明 | 当前归属 |
|------|------|------|
| `receivedByOrderLine` | 采购订单已入库汇总 | 前端仍保留代表性聚合逻辑 |
| `groupedRecords` | 按单据号、分组键组织展示 | 前端展示逻辑 |
| `lineGroupId` 组装 | 按“同次添加”组织明细 | 前端表单与列表逻辑 |
| 库存口径 | 由 PSI 记录推导库存 | 应逐步以后端库存接口为准 |

---

## 8. 财务与看板

### 8.1 财务

| 功能 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| 财务记录列表 / CRUD | `FinanceView.tsx`、相关操作页 | `finance.*` | `/api/finance/records` |
| 分类、账户类型联动 | 财务表单 | `settings.financeCategories`、`settings.financeAccountTypes` | `/api/settings/*` |

### 8.2 经营看板

| 功能 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| 汇总统计 | `DashboardView.tsx` | `dashboard.getStats()` | `/api/dashboard/stats` |

### 8.3 指标口径

主要指标包括：

- 活跃订单数
- 工序完成率
- 财务收支汇总
- 库存预警
- 订单 / 产品进度展示

**原则**：看板应尽量使用统一聚合结果，不应长期由多个前端页面各算一套。

---

## 9. 协作、打印与码管理

### 9.1 协作

| 功能 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| 企业协作、外协路线、流转 | `CollaborationInboxView.tsx` | `collaboration.*` | `/api/collaboration/*` |

### 9.2 打印

| 功能 | 前端入口 | 主要组件 / 工具 |
|------|------|------|
| 模板编辑 | `PrintTemplateEditorView.tsx` | `components/print-editor/*`、`usePrintEditor` |
| 预览 / 解析 | 打印相关视图与弹窗 | `PrintPreview`、`utils/printResolve.ts` |
| 标签数据转换 | 打印链路 | `utils/printItemCodeRows.ts`、`utils/printVirtualBatch.ts` |

### 9.3 单品码 / 虚拟批次

| 功能 | 前端入口 | API 封装 | 后端入口 |
|------|------|------|------|
| 单品码生成、列表、作废、扫码 | 计划 / 打印相关入口 | `itemCodesApi.*` | `/api/item-codes/*` |
| 虚拟批次创建、批量拆分、作废、扫码 | 计划 / 打印相关入口 | `planVirtualBatchesApi.*` | `/api/plan-virtual-batches/*` |

**关键点**：

- 打印链路是“业务数据 -> 渲染上下文 -> 模板元素”的转换链
- 单品码 / 虚拟批次已不只是 UI 工具，而是明确的数据模型与接口能力

---

## 10. 当前重点计算 / 收口项

以下内容仍值得持续治理：

1. 物料需求、采购建议等计划逻辑仍偏前端集中
2. PSI 展示分组与库存口径需要进一步统一
3. 看板统计应尽量以后端聚合为准
4. 打印链路缺少单独文档时，容易被误判成纯 UI 功能
5. 扫码、协作、码管理已形成独立数据流，不能再藏在大页面中理解

---

## 11. 维护原则

- 不再使用“某某视图第几行”作为主要文档结构
- 优先记录“数据真源”“计算归属”“接口入口”“页面入口”
- 当计算从前端迁到后端时，应同步修改本文件，而不是只改代码
- 业务规则改动时，先同步 `01-business-rules.md`

---

*最后更新：将本文档从“旧前端行号索引”重写为“当前架构下的数据流与计算点地图”。*
