# SmartTrack Pro 后端 API

基于 Node.js + Express + TypeScript + Prisma + PostgreSQL 的后端服务。

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

## 默认账号

- 管理员: `admin` / `admin123`
