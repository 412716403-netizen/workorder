# SmartTrack Pro 后端 API

基于 Node.js + Express + TypeScript + Prisma + PostgreSQL 的后端服务。

## 先看这些文档

如果你是第一次接手这个仓库，建议先看：

- 项目文档总入口：[`../docs/README.md`](../docs/README.md)
- 当前架构与迁移现状：[`../docs/06-current-architecture-and-migration-status.md`](../docs/06-current-architecture-and-migration-status.md)
- 认证 / 租户 / 会话说明：[`../docs/07-auth-tenant-session.md`](../docs/07-auth-tenant-session.md)
- 打印 / 标签 / 单品码 / 批次码链路：[`../docs/08-printing-and-label-flow.md`](../docs/08-printing-and-label-flow.md)

## 当前后端定位

当前后端已经不是“预留接口层”，而是项目业务真源的重要组成部分，主要负责：

- 认证、租户、权限与多租户数据隔离
- 系统设置、基础资料、计划、工单、报工、生产操作、进销存、财务等数据持久化
- 聚合统计、业务校验、状态流转
- 协作、单品码、虚拟批次等扩展能力

需要注意：

- 业务主数据以后端和数据库为真源
- 前端仍保留部分会话 / 租户上下文缓存，详见 `docs/07-auth-tenant-session.md`
- 打印、标签、码管理虽然主要在前端渲染，但依赖后端数据模型与接口闭环，详见 `docs/08-printing-and-label-flow.md`

## 环境要求

- Node.js 18+
- PostgreSQL 14+
- npm 或 pnpm

## 快速开始

### 一键初始化（推荐）

本机已安装并启动 **Docker Desktop** 时，在 `backend` 目录执行一条命令即可完成：**拉取并启动 PostgreSQL → 建表 → 种子数据（admin/admin123）**：

```bash
cd backend
npm install
npm run setup
```

**注意：**

- 终端提示符若已是 `... backend %`，说明**已经在 `backend` 目录**，不要再执行 `cd backend`（会报 `no such file`）。若人在项目根目录，应先：`cd backend` 再 `npm run setup`。
- 无 Docker 时会出现 **P1001**。可任选：

- **有 Homebrew（无 Docker）**：在 `backend` 目录执行 **`npm run setup:homebrew`**（自动安装 `postgresql@16`、启动服务、建库、写入 `DATABASE_URL`、建表、种子）。
- **有 Docker**：安装并打开 Docker Desktop 后执行 **`npm run setup`**。

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，修改数据库连接信息：

```bash
cp .env.example .env
```

编辑 `.env`：
```
DATABASE_URL="postgresql://用户名:密码@localhost:5432/smarttrack_pro?schema=public"
JWT_SECRET="你的JWT密钥"
JWT_REFRESH_SECRET="你的刷新密钥"
```

### 3. 安装并启动 PostgreSQL（必须先做，否则会出现 `P1001 Can't reach database server`）

**macOS（Homebrew）：**

```bash
brew install postgresql@16
brew services start postgresql@16
createdb smarttrack_pro
```

**或用 Docker：**

```bash
docker run --name smarttrack-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=smarttrack_pro -p 5432:5432 -d postgres:16
```

确认 `.env` 里 `DATABASE_URL` 的用户名、密码、库名与上面一致（Docker 示例：`postgresql://postgres:postgres@localhost:5432/smarttrack_pro?schema=public`）。

### 4. 迁移与种子（数据库能连上后再执行）

```bash
npx prisma migrate dev --name init
npx prisma generate
npm run db:seed
```

> 不要把说明文档里的 `# 注释行` 粘贴到终端，会报 `command not found: #`。

### 5. 启动开发服务器

```bash
npm run dev
```

服务运行在 http://localhost:3001（根路径会提示这是 API；健康检查：<http://localhost:3001/api/health>）

### 6. 查看数据库

```bash
npx prisma studio
```

## API 文档

## 认证与会话模型

当前前后端采用混合会话模型：

- access token：前端内存中维护，请求时通过 `Authorization` 发送
- refresh：依赖 httpOnly Cookie 静默刷新
- 用户 / 当前租户上下文：前端会缓存到浏览器，作为页面刷新后的会话恢复辅助

这不表示业务数据仍由前端本地管理；业务主数据已经以后端接口和数据库为准。  
如果需要理解这层边界，请同时阅读 [`../docs/07-auth-tenant-session.md`](../docs/07-auth-tenant-session.md)。

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 手机号注册（body: `phone`, `password`, `displayName?`；暂无需验证码，上线后可接短信） |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/refresh` | 刷新 token |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户信息 |
| PUT | `/api/auth/me` | 修改显示名、密码（改密会换新 token） |
| POST | `/api/auth/phone-change/send-code-old` | 换绑：向**原手机**发验证码（须与当前 `username` 一致）；非生产环境响应可含 `devCode` |
| POST | `/api/auth/phone-change/verify-old-code` | 校验原手机验证码，返回短时 `phaseToken` |
| POST | `/api/auth/phone-change/send-code-new` | 凭 `phaseToken` 向**新手机**发验证码 |
| POST | `/api/auth/phone-change/complete` | `phaseToken`、`newPhone`、新号验证码；成功后返回新 token |

### 账号管理（仅管理员）

请求头需带 `Authorization: Bearer <accessToken>`，且 JWT 中 `role` 为 `admin`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users` | 新建用户（body: username, password, displayName?, email?, role?） |
| PUT | `/api/admin/users/:id` | 更新显示名、邮箱、角色、状态、`accountExpiresAt`（到期时间，null=永不到期）、重置密码等 |
| DELETE | `/api/admin/users/:id` | 删除用户（不可删自己、不可删唯一管理员） |

前端侧栏 **账号管理** 即对接上述接口。用户若已设置 **账号到期时间**，到期后将无法登录与刷新 token（提示联系管理员续期）；更新库结构后请在 `backend` 执行 **`npx prisma db push`**。

### 系统设置

- `GET/POST/PUT/DELETE /api/settings/categories` - 产品分类
- `GET/POST/PUT/DELETE /api/settings/partner-categories` - 合作单位分类
- `GET/POST/PUT/DELETE /api/settings/nodes` - 工序节点
- `GET/POST/PUT/DELETE /api/settings/warehouses` - 仓库
- `GET/POST/PUT/DELETE /api/settings/finance-categories` - 收付款类型
- `GET/POST/PUT/DELETE /api/settings/finance-account-types` - 收支账户类型
- `GET/PUT /api/settings/config/:key` - 系统配置

### 基础数据

- `/api/master/partners` - 合作单位 CRUD
- `/api/master/workers` - 工人 CRUD
- `/api/master/equipment` - 设备 CRUD
- `/api/master/dictionaries` - 数据字典

### 产品

- `/api/products` - 产品 CRUD
- `/api/products/:id/variants` - 产品变体
- `/api/products/boms/*` - BOM 管理

### 生产计划

- `/api/plans` - 计划单 CRUD
- `POST /api/plans/:id/split` - 拆单
- `POST /api/plans/:id/convert` - 下达工单
- `POST /api/plans/:id/sub-plans` - 创建子计划

### 工单

- `/api/orders` - 工单 CRUD
- `POST /api/orders/:id/milestones/:mid/reports` - 报工
- `GET /api/orders/:id/reportable` - 可报数量
- `/api/orders/product-progress/report` - 产品模式报工

### 生产操作

- `/api/production/records` - 领料/外协/返工/入库 CRUD
- `GET /api/production/defective-rework` - 不良品/返工汇总

### 进销存

- `/api/psi/records` - 采购/销售/调拨/盘点 CRUD
- `GET /api/psi/stock` - 库存查询

### 财务

- `/api/finance/records` - 收付款 CRUD

### 经营看板

- `GET /api/dashboard/stats` - 统计数据

### 协作、角色与租户

- `/api/tenants` - 租户列表、创建、切换、成员、申请等
- `/api/roles` - 角色管理
- `/api/collaboration/*` - 企业协作、外协路线、协作流转

### 码管理

- `/api/item-codes/*` - 单品码生成、列表、作废、扫码
- `/api/plan-virtual-batches/*` - 虚拟批次创建、批量拆分、作废、扫码

这些能力与打印 / 标签链路强相关，前端文档见 [`../docs/08-printing-and-label-flow.md`](../docs/08-printing-and-label-flow.md)。

## 维护提醒

- 若新增路由 / 控制器 / 数据模型，请同步更新 `docs/04-migration-checklist.md`
- 若修改认证、租户、会话恢复方式，请同步更新 `docs/07-auth-tenant-session.md`
- 若修改单品码、虚拟批次、扫码或打印字段，请同步更新 `docs/08-printing-and-label-flow.md`

## 默认账号

- 管理员: `admin` / `admin123`
