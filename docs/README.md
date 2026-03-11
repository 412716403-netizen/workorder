# 智造云 ERP 项目文档

> 本文档随模块开发持续补充，每完成一个模块请更新对应章节。

## 文档索引

| 文档 | 说明 |
|------|------|
| [01-business-rules.md](./01-business-rules.md) | **业务规则文档**：核心计算逻辑、单据规则、分组约定 |
| [02-data-structures.md](./02-data-structures.md) | **数据结构文档**：实体字段、关联关系、存储键 |
| [03-data-flow-calculations.md](./03-data-flow-calculations.md) | **数据流与计算点清单**：各模块数据来源、计算逻辑所在位置 |
| [04-migration-checklist.md](./04-migration-checklist.md) | **迁移清单**：接入数据库/后端时的 API 清单、前后端职责划分 |
| [05-production-link-mode.md](./05-production-link-mode.md) | **生产关联模式**：关联工单/关联产品两种模式的需求规格、数据模型与迁移说明 |

## 当前架构概述

- **数据存储**：前端 `localStorage`（通过 `usePersistedState` 持久化）
- **数据计算**：全部在前端（`filter`、`reduce`、`useMemo`）
- **计划**：后续接入数据库，将数据计算迁移至后端

## 补充文档的约定

1. **每开发/迭代完一个模块**，请在对应文档中补充该模块的业务规则、数据结构、计算点
2. **新增 API 或数据表设计**时，同步更新 `04-migration-checklist.md`
3. 代码中可在关键计算处加注释，引用文档章节，如：`// 见 docs/01-business-rules.md#库存计算`
