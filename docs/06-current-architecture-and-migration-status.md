# 当前架构与迁移现状

> 本文档用于回答三个问题：项目现在是什么结构、迁移进行到哪一步、哪些结构问题已经值得治理。它不是业务规则文档，也不是逐接口说明，而是“当前现状快照”。

## 1. 当前阶段判断

当前仓库应视为一个**正在从前端聚合逻辑向后端真源收口**的制造业 ERP 项目，而不是纯前端原型。

### 已经明确存在的能力

- 前端：React + Vite + TypeScript
- 后端：Express + TypeScript + Prisma + PostgreSQL
- 数据层：Prisma schema 已覆盖主要业务域
- 业务域：认证、多租户、系统设置、基础资料、计划、工单、报工、生产操作、进销存、财务、协作、单品码、虚拟批次、打印

### 当前不是的状态

- 不是“全部数据仍以 localStorage 为真源”的纯前端应用
- 不是“迁移已经完全收口、边界稳定”的成熟架构
- 不是“只需补几个 API”的轻量迁移阶段

## 2. 现实架构快照

### 2.1 前端

- 入口：`App.tsx`
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

## 8. 本文件的边界

本文件关注的是“当前架构与迁移阶段”，不负责：

- 逐接口 API 细节
- 逐表字段说明
- 逐业务模块完整规则
- 代码风格细节

这些内容分别由其他文档维护。
