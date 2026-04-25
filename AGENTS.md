# AGENTS.md — SmartTrack Pro 协作约定

本文件是 AI 代理与贡献者在本仓库工作的**默认背景**。写代码、改文件、做重构前，请先浏览本文件与 `.cursor/rules/` 下的规则；规则负责"常态"，本文件负责"全局认知"。

---

## 1. 项目定位

制造业 / ERP / 生产进度节点报工系统，覆盖：计划单、工单、生产报工、进销存（PSI）、财务、协作、打印/标签、单品码与虚拟批次、多租户 + 细粒度权限。

仓库当前阶段：**由前端 `localStorage` + 本地状态 → 后端 API + Prisma/PostgreSQL 持久化渐进迁移中**。写任何新功能时都要先问：**数据归哪层？**

---

## 2. 技术栈

- 前端：React 19 + Vite 6 + TypeScript 5.8 + TailwindCSS 3；路由 `react-router-dom@7`；状态集中在 `contexts/AppDataContext.tsx`。
- 后端：Express 5 + TypeScript + Prisma 6 + PostgreSQL；JWT + Cookie 鉴权；Zod 校验。
- 测试：`vitest`（前端根目录 `npm test` / 后端 `backend/tests`）。
- Lint：`eslint`（根目录 `npm run lint`）。

---

## 3. 目录约定（写代码前先对号）

### 前端（仓库根）

- `views/**` — 业务视图。**单文件主责要单一**；超过约 500 行或状态过多时应拆：
  - 数据/副作用 → `hooks/useXxx.ts`
  - 复杂弹窗 / 打印叠加 / 子区块 → `views/<模块>/XxxModal.tsx` 等子组件
  - 纯函数 → `utils/xxx.ts`
- `components/**` — 跨页面可复用的通用 UI。
- `contexts/**` — 全局状态、数据装载（`AppDataContext.tsx`、`appDataLoadCore.ts` 等）。
- `hooks/**` — 复用逻辑 hook。
- `services/api.ts` — 前端唯一 HTTP 客户端出入口。
- `utils/**` — 纯函数、打印上下文 builder、排序/格式化等。
- `types.ts` — 前端领域类型；**共享枚举/常量从 `shared/types.ts` re-export**。
- `shared/types.ts` — **前后端共用**枚举/常量/DTO（单一事实源）。

### 后端（`backend/src/`）

严格分层：

- `routes/*.ts` — 路由注册 + Zod 校验 + 权限中间件。**不得**写业务分支。
- `controllers/*.controller.ts` — HTTP 映射（读 `req`、拿 `tenantId`、调用 service、`res.json`）；统一用 `asyncHandler` 包装。
- `services/*.service.ts` — 业务步骤、事务、Prisma 访问。**不得**依赖 `req/res`。
- `middleware/` — `auth` / `tenant` / `validate` / `asyncHandler` / `errorHandler` / `cacheControl` / `requireAdmin`。
- `types/index.ts` — 后端领域类型；**共享枚举/常量从 `../../../shared/types.ts` re-export**。
- `lib/prisma.ts` — `getTenantPrisma(tenantId)`：**所有业务查询**走租户作用域客户端。

### 文档（`docs/`）

- `01-business-rules.md` 业务规则
- `02-data-structures.md` 数据结构
- `03-data-flow-calculations.md` 数据流与计算
- `04-migration-checklist.md` 迁移清单
- `05-production-link-mode.md` 生产链路模式
- `06-current-architecture-and-migration-status.md` 架构现状与迁移进度
- `07-auth-tenant-session.md` 认证/租户/会话
- `08-printing-and-label-flow.md` 打印与标签
- `09-deploy-servers.md` 部署

---

## 4. 全局协作约定（必读）

1. **分层不可跨**：前端 View 不直接算业务规则；Controller 不写业务；Service 不碰 `req/res`。
2. **权限**：新路由**必须**挂 `requireSubPermission('<module>:<resource>:<action>')`（见 `backend/src/middleware/tenant.ts`）。action ∈ `view | create | edit | delete` 等；`create/edit/delete` 会被隐式要求 `view`。
3. **租户**：后端入口已挂 `authMiddleware + requireTenant`；业务查询**只用** `getTenantPrisma(req.tenantId!)`，禁止直接用全局 `prisma`（`plans.service.ts` 的历史特例除外，见文件内说明）。
4. **共享类型**：前后端都会用到的**枚举、常量、DTO 形状**放 `shared/types.ts`；新增时两端都从该文件 re-export，不再在各自 `types.ts` 里重复声明。
5. **避免 `any`**：新代码默认**不**写 `any`；边界（API 响应、Prisma `include`）显式类型化。若确需放宽，加注释说明原因。
6. **docs 与代码同步**：改业务规则 → 顺手更 `docs/01`；改数据结构 → 更 `docs/02`；改 API 或迁移状态 → 更 `docs/04` / `docs/06`。
7. **文件大小**：单个 `.tsx` 视图超过约 500 行，或单个 `.ts` service 超过约 400 行，请拆分。
8. **测试**：纯函数 utils（排序、格式化、打印 builder）新增/改动时补 `*.test.ts`（参考 `utils/formatTime.test.ts`、`utils/fileHelpers.test.ts`）。

---

## 5. 启动

```bash
# 前端
npm install
npm run dev         # 或 npm run dev:all 同时起前后端

# 后端
cd backend
npm install
npm run dev         # tsx watch src/index.ts
npm run db:migrate  # Prisma 迁移
npm run db:seed     # 种子数据
```

---

## 6. 常见陷阱

- **localStorage ≠ 数据真源**：当前仍有一部分数据在前端本地；新增数据默认走后端 API + Prisma，别再新增"只落本地"的业务字段。
- **前后端共享常量漂移**：`FINANCE_DOC_NO_PREFIX`、各 `*Status` 枚举必须从 `shared/types.ts` 走；两端写死字面量会埋雷。
- **打印链路**：模板、预览、导出的上下文都在 `utils/build*PrintContext.ts`；这些是**纯函数**，禁止依赖 React state/context。
- **Prisma schema 改动**：先写 migration 再改 service；`prisma/schema.prisma` 与 `migrations/` 必须同步。

---

## 7. 需要深度分析时

使用 `.cursor/skills/project-analysis/SKILL.md` 触发分析工作流；日常写代码时以本文件与 `.cursor/rules/` 为准。
