# 认证、租户与会话状态说明

> 本文档解释认证、租户上下文、浏览器缓存、Cookie 与前端状态之间的关系。它的核心目标是避免把“会话缓存”误认为“业务主数据真源”。

## 1. 一句话结论

当前项目**不是**“所有数据都还在前端本地存”，而是：

- **业务主数据**已经主要走后端 API + 数据库
- **认证与租户上下文**仍使用浏览器 `localStorage` 做会话恢复缓存
- **access token** 在内存中维护，**refresh token** 依赖 httpOnly Cookie

所以现在的真实状态是：  
**业务数据后移了，但会话 / 租户上下文仍是前端缓存 + 后端会话的混合模型。**

---

## 2. 相关状态分别是什么

### 2.1 浏览器 `localStorage`

当前会保存这些键：

| 键 | 含义 | 是否业务真源 |
|------|------|------|
| `currentUser` | 当前登录用户基础信息缓存 | 否 |
| `tenantCtx` | 当前选中企业、角色、权限、状态 | 否 |
| `userTenants` | 用户可访问企业列表缓存 | 否 |
| `isLoggedIn` | 登录态标记 | 否 |

这些值的作用是：

- 刷新页面后恢复 UI 上下文
- 避免每次进页面都重新从零进入登录 / 选租户流程
- 在 token 仍有效时，快速恢复客户端状态

### 2.2 内存 access token

前端 `services/api.ts` 中的 `memoryAccessToken` 用来在请求头中带 `Authorization`。

特点：

- 不落盘到 `localStorage`
- 页面完全刷新后会丢失
- 可以通过 refresh 流程重新获取

### 2.3 httpOnly Cookie

refresh 依赖后端 Cookie 机制，而不是前端直接读写 refresh token。

这意味着：

- 前端无法直接读取 refresh token 明文
- 更适合作为长期登录续期机制
- 401 / 403 后前端会尝试静默刷新

---

## 3. 为什么说“前端本地状态没有完全退出”

这句话的意思不是“业务还没迁走”，而是说：

### 3.1 业务数据层面

像这些数据已经明显不是单纯前端自管：

- 产品、BOM、合作单位、工人、设备
- 计划单、工单、报工、生产操作
- 进销存、财务
- 协作、单品码、虚拟批次

这些都已经有：

- 前端 API 封装
- 后端路由 / controller
- Prisma schema / 数据库模型

所以**业务主数据已经明显后移**。

### 3.2 会话层面

但下面这些“用户进入系统所需上下文”仍保存在前端缓存中：

- 当前登录用户是谁
- 当前选中的企业是谁
- 当前企业下权限是什么
- 用户可切换的企业列表是什么

这就说明前端本地状态还承担着**会话恢复与租户切换**职责。

### 3.3 因此形成了“不同层次混在一起”的现状

现在项目里同时存在三类状态：

| 状态层次 | 例子 | 当前归属 |
|------|------|------|
| 业务真源 | plans、orders、products、psiRecords | 后端 API + 数据库 |
| 会话恢复缓存 | currentUser、tenantCtx、userTenants | `localStorage` |
| 请求会话令牌 | access token / refresh 续期 | 内存 + Cookie |

如果文档里笼统写成“项目还在用 localStorage”，就会误导；  
如果文档里笼统写成“项目已经完全服务端化”，也不准确。

更准确的说法应该是：

**业务主数据已大幅后移，但认证 / 租户上下文仍采用前端缓存协助恢复。**

---

## 4. 当前这样做有什么影响

### 4.1 好处

- 刷新页面后能恢复登录后上下文
- 切租户体验更顺
- access token 过期时可以静默刷新，不用每次都重新登录

### 4.2 风险

- 文档若不区分“会话缓存”和“业务真源”，团队会误判项目阶段
- 如果前端把 `tenantCtx` 这类缓存误当真源，可能出现权限展示与后端真实权限短暂不一致
- 多租户状态更新时，需要同步刷新 `userTenants` 与 `tenantCtx`

### 4.3 这不是坏设计，但必须写清楚

这类模式本身是常见做法，不算错误。  
问题不在于用了 `localStorage`，而在于：

- 过去文档没有把它和业务主数据区分开
- 导致“项目到底有没有迁到后端”变得含糊

### 4.4 「自动掉线」常见原因（会话层）

- 业务请求使用 **Bearer access JWT**（默认约 **15 分钟** 过期，见 `backend/src/config/env.ts` 的 `JWT_EXPIRES_IN`）。过期后若 **`POST /auth/refresh`** 未成功换新 access，前端在 **401 后刷新仍失败** 时会清理 `localStorage` 并整页回到登录（`services/api.ts`）。
- refresh 依赖 **httpOnly 的 `refreshToken` Cookie**（`backend/src/utils/cookies.ts`）。生产环境若用 **HTTP 访问** 且未设置 **`COOKIE_SECURE=false`**，浏览器不会保存/携带 Cookie，表现为「用一会儿就掉线」。
- 前端在 access **剩余不足约 5 分钟**（`REFRESH_MARGIN_S`）时会主动续期，并对 refresh 的 **网络异常与 502/503/504** 做 **最多 3 次** 间隔重试，减轻短暂抖动导致的误登出。

### 4.5 平台管理员：租户行业类型与行业预设

- 全局 `role=admin` 账号通过 **`PUT /api/admin/tenants/:id`** 可维护企业状态、到期时间、**设备模块开关**（`equipmentModuleEnabled`）、**生产关联模式**（`productionLinkMode`：`order` | `product`），以及 **`industryKind`**（`generic` | `sweater_factory`，见 `shared/types.ts`）。
- **`productionLinkMode`** 存于 `Tenant` 表，为真源；保存时同步写入 `system_settings` 镜像。审核通过（`pending` → `active`）时**必选**模式。若租户已有生产业务数据（报工、外协、返工、入库等，见 `tenantHasProductionActivity`），则模式**锁定**，平台修改返回 **409**；租户 `PUT /settings/config/productionLinkMode` 恒为 **403**。
- 当 `industryKind` 为 `sweater_factory`、且该企业 **`industry_preset_applied_at` 仍为空**、且五类基础表（产品分类、合作单位分类、仓库、财务类型、工序节点）**均为空**时，后端会在同一事务内灌入代码预设（`backend/src/lib/tenantIndustryPresets.ts`），并写入 `industry_preset_applied_at`；若任一类已有数据则跳过灌入并在响应中返回 `presetSkippedReason`。
- 普通租户成员 JWT 不依赖上述平台字段；行业类型与生产模式仅用于平台侧初始化、列表展示与各业务页只读消费。

### 4.6 细粒度权限：单价/金额查看（前端展示）

以下 key 在**角色编辑**中配置，控制进销存、外协、协作模块的单价/金额是否在 UI / 打印 / 导出中展示。语义见 [`01-business-rules.md`](./01-business-rules.md) §5.6。

| 权限 key | 模块 |
|----------|------|
| `psi:purchase_order:amount` | 进销存 · 采购订单 |
| `psi:purchase_bill:amount` | 进销存 · 采购入库 |
| `psi:sales_order:amount` | 进销存 · 销售订单 |
| `psi:sales_bill:amount` | 进销存 · 销售单 |
| `production:outsource_amount:allow` | 生产 · 外协加工费/单价 |
| `collaboration:list:allow` | 协作 · 列表/收件箱 |
| `collaboration`（裸模块键） | 协作 · 侧栏入口开关 |
| `price_amount`（裸模块键） | 单价/金额 · 模块入口；细粒度见下 |
| `psi:purchase_order:amount` 等 | 单价/金额 · 各业务（在角色「单价/金额」区块配置） |

判定逻辑：`utils/canViewAmount.ts`（封装 `hasModulePerm`）。owner/admin、裸模块键且无细粒度 → 可见；细粒度角色须精确命中上表 key。

### 4.7 工作台 API（`/api/dashboard`）

任意已选租户用户可访问（仅 `authMiddleware + requireTenant`）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/dashboard/workbench` | 有效配置（用户个性化或内置默认） |
| PUT | `/dashboard/workbench` | 保存用户个性化 |
| GET/PUT | `/dashboard/feature-plugins` | 功能插件；PUT 需管理员 |
| GET | `/dashboard/stats` | 按模块权限返回生产/销售/财务统计 |
| GET | `/dashboard/notifications` | 工作台消息列表（管理员发布的公告） |
| POST | `/dashboard/messages` | 发布消息（owner/admin 或 `settings:config:edit`） |
| DELETE | `/dashboard/messages/:id` | 删除已发布消息（同上权限） |

---

## 5. 当前推荐口径

以后描述项目状态时，建议统一这样说：

1. 业务数据以后端 API + 数据库为主真源
2. 认证与租户上下文仍使用浏览器缓存辅助恢复
3. 前端聚合状态负责页面消费，不等于持久化真源

---

## 6. 对应代码入口

| 功能 | 代表性文件 |
|------|------|
| 登录态与租户缓存恢复 | `contexts/AuthContext.tsx` |
| token 刷新与请求重试 | `services/api.ts` |
| 租户列表与切换 | `services/api.ts`、`contexts/AuthContext.tsx` |
| 租户隔离 | `backend/src/middleware/tenant.ts`、`backend/src/lib/prisma.ts` |
| 平台管理员更新企业与行业预设 | `backend/src/routes/admin.ts`、`backend/src/services/adminTenants.service.ts`、`backend/src/lib/tenantIndustryPresets.ts` |

---

## 7. 后端租户隔离的两种模型（写新 service 前必看）

`getTenantPrisma(tenantId)` 在 `backend/src/lib/prisma.ts` 通过 Prisma `$extends` 给所有读 / 批写 hook 自动注入租户过滤。规则按模型分两类：

### 7.1 自带 `tenantId` 列的模型（`TENANT_MODELS`）

直接注入 `where: { tenantId }`，行为最直接。代表：`ProductionOrder`、`PlanOrder`、`ProductMilestoneProgress`、`ProductionOpRecord`、`PsiRecord`、`FinanceRecord`、`Product`、`Bom`、`Worker`、`Equipment`、`Partner`、`Role`、`ItemCode`、`PlanVirtualBatch`、各类字典表等。

### 7.2 靠父级关系继承租户的模型（`RELATION_TENANT_PATH`）

这些表自身没有 `tenantId` 列，由 `getTenantPrisma` 自动注入嵌套关系过滤（用 `AND` 包，与调用方 `where` 共存）：

| 模型 | 关系链（→ 带 tenantId 的祖先） | Prisma 注入形状 |
|------|------|------|
| `Milestone` | `productionOrder` | `{ productionOrder: { tenantId } }` |
| `MilestoneReport` | `milestone → productionOrder` | `{ milestone: { productionOrder: { tenantId } } }` |
| `ProductProgressReport` | `progress` | `{ progress: { tenantId } }` |
| `OrderItem` | `productionOrder` | `{ productionOrder: { tenantId } }` |
| `BomItem` | `bom` | `{ bom: { tenantId } }` |
| `PlanItem` | `planOrder` | `{ planOrder: { tenantId } }` |
| `ProductVariant` | `product` | `{ product: { tenantId } }` |

`findUnique` 会被透明转译成 `findFirst({ AND: [unique, tenantWhere] })`；`update / delete` 会先用 `findFirst` 校验所有权再放行。

### 7.3 已知盲区（写代码时要主动避开）

- **事务内 `tx.*` / 直接用 `basePrisma`**：Prisma 扩展不会被透传到 `$transaction((tx) => ...)` 的 `tx`，也不会作用于全局 `prisma`。事务里跑业务查询时，仍需要显式带租户过滤（参考 `verifyMilestoneTenant` / `productionOrder: { tenantId }` 这类写法）。
- **`create / createMany / upsert`**：子表写入不会自动校验外键归属，约定只用「已 tenant-verify 过的父级 ID」作为 FK 传入；如需强校验，service 内显式查父级。
- **新增「靠父级继承租户」的模型**：必须把它加到 `RELATION_TENANT_PATH`，并在 `backend/tests/tenantPrismaRelation.test.ts` 中加一条 `buildRelationTenantWhere` 断言。

---

## 8. 文档维护要求

如果后续有这些变化，需要同步更新本文档：

- `localStorage` 键变化
- token 策略变化
- 租户切换流程变化
- 认证从混合模式改成纯 Cookie / 纯 token / 其它方案

否则团队很容易再次把“会话缓存”和“业务数据真源”混淆。
