# 智造云 ERP 项目文档

> 本目录用于记录业务规则、数据结构、迁移状态与当前架构现状。项目已经不再是“纯前端 localStorage 原型”，而是一个处于前后端收口阶段的多模块仓库，因此文档也需要区分“历史设计”“当前实现”“待收口事项”。

## 建议阅读顺序

1. 先看 [`06-current-architecture-and-migration-status.md`](./06-current-architecture-and-migration-status.md)，了解项目当前处于什么阶段、哪些已经后移、哪些仍在收口。
2. 再看 [`01-business-rules.md`](./01-business-rules.md) 与 [`05-production-link-mode.md`](./05-production-link-mode.md)，理解业务规则和生产链路。
3. 需要对照数据与接口时，再看 [`02-data-structures.md`](./02-data-structures.md)、[`03-data-flow-calculations.md`](./03-data-flow-calculations.md)、[`04-migration-checklist.md`](./04-migration-checklist.md)。

## 文档索引

| 文档 | 说明 |
|------|------|
| [01-business-rules.md](./01-business-rules.md) | **业务规则文档**：核心计算逻辑、单据规则、分组约定 |
| [02-data-structures.md](./02-data-structures.md) | **数据结构文档**：实体字段、关联关系、当前数据归属 |
| [03-data-flow-calculations.md](./03-data-flow-calculations.md) | **数据流与计算点清单**：各模块数据来源、计算逻辑所在位置 |
| [04-migration-checklist.md](./04-migration-checklist.md) | **迁移/收口清单**：按模块整理当前后端接入状态与剩余缺口 |
| [05-production-link-mode.md](./05-production-link-mode.md) | **生产关联模式**：关联工单/关联产品两种模式的需求规格、数据模型与迁移说明 |
| [06-current-architecture-and-migration-status.md](./06-current-architecture-and-migration-status.md) | **当前架构现状**：真实代码结构、迁移阶段、已知结构问题与治理优先级 |
| [07-auth-tenant-session.md](./07-auth-tenant-session.md) | **认证/租户/会话说明**：解释 localStorage、Cookie、内存 token 与租户上下文的边界 |
| [08-printing-and-label-flow.md](./08-printing-and-label-flow.md) | **打印与标签链路**：模板、预览、占位符、单品码、虚拟批次、标签输出链路 |

## 当前项目状态

- **前端**：React + Vite + TypeScript，认证/租户上下文仍有 `localStorage` 缓存，但大部分业务数据已围绕 `AppDataContext` + API 拉取展开
- **后端**：Express + TypeScript + Prisma + PostgreSQL，已具备认证、多租户、基础资料、生产、进销存、财务、协作等接口骨架
- **数据库**：Prisma schema 已覆盖主要业务域，但迁移链与文档状态仍需持续核对
- **文档状态**：早期文档偏向“前端本地数据设计”，现已补充“当前实现现状”文档用于承接迁移后的真实结构

## 文档维护约定

1. 业务规则变更，优先更新 `01-business-rules.md`
2. 数据结构、字段归属、客户端缓存与服务端真源变更，更新 `02-data-structures.md`
3. API、数据库迁移、模块是否已后移或仍在收口，更新 `04-migration-checklist.md`
4. 只要架构阶段、模块边界、迁移现状发生明显变化，就更新 `06-current-architecture-and-migration-status.md`
5. 认证、租户或会话恢复策略变更时，更新 `07-auth-tenant-session.md`
6. 打印、标签、码管理链路变更时，更新 `08-printing-and-label-flow.md`
7. 代码中可在关键计算处加注释，引用文档章节，如：`// 见 docs/01-business-rules.md#库存计算`

## 维护原则

- `types.ts`、`backend/prisma/schema.prisma`、`services/api.ts` 是重要实现契约，但不是文档入口
- `06-current-architecture-and-migration-status.md` 负责回答“项目现在到底是什么状态”
- `04-migration-checklist.md` 负责回答“还有哪些模块没收口”
- `07-auth-tenant-session.md` 负责回答“为什么还有 localStorage，但项目又不是纯前端”
- `08-printing-and-label-flow.md` 负责回答“打印 / 标签 / 单品码 / 批次码到底是一条什么链路”
- 不再把所有客户端状态都默认视为 `localStorage` 真源；应明确区分会话缓存、UI 配置缓存与服务端持久化数据
