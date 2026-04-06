# 智造云 ERP / 生产进度节点报工系统

制造业 ERP / 生产进度节点报工系统，包含前端业务界面、后端 API、多租户权限、Prisma 数据模型，以及打印、协作、单品码/批次码等扩展能力。

## 仓库结构

- `docs/`：业务规则、数据结构、迁移与现状文档
- `backend/`：Express + TypeScript + Prisma + PostgreSQL 后端
- 根目录前端：React + Vite + TypeScript

## 文档入口

- 总入口：[`docs/README.md`](./docs/README.md)
- 当前架构与迁移现状：[`docs/06-current-architecture-and-migration-status.md`](./docs/06-current-architecture-and-migration-status.md)
- 认证/租户/会话说明：[`docs/07-auth-tenant-session.md`](./docs/07-auth-tenant-session.md)
- 打印与标签链路：[`docs/08-printing-and-label-flow.md`](./docs/08-printing-and-label-flow.md)
- 后端启动与 API：[`backend/README.md`](./backend/README.md)

## 开发说明

### 前端

```bash
npm install
npm run dev
```

### 后端

后端初始化、数据库、种子数据、接口说明见 [`backend/README.md`](./backend/README.md)。

## 维护约定

- 新增或调整业务规则时，优先更新 `docs/01-business-rules.md`
- 新增或调整数据结构、数据归属时，更新 `docs/02-data-structures.md`
- 新增或调整 API、迁移阶段或模块收口状态时，更新 `docs/04-migration-checklist.md` 与 `docs/06-current-architecture-and-migration-status.md`
