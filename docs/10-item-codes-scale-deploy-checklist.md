# 单品码 / 批次码大表改造 — 部署检查清单

> **用途**：在「合并了 `item_codes` / `plan_virtual_batches` 分区、复合主键、扫码 token 格式、追溯分页」等相关代码或迁移后，上环境前按条执行，避免漏迁移、连错库、上线后才发现扫码/追溯异常。  
> **何时用**：只要本次发布包含下列任一内容，就应打开本清单：  
> - `backend/prisma/migrations/` 下**新增或修改**与 `item_codes`、`plan_virtual_batches` 有关的 migration  
> - `backend/prisma/schema.prisma` 里上述两模型有变更  
> - `itemCodes.service.ts`、`planVirtualBatches.service.ts`、`planTreeQuota.service.ts`（`generateScanToken`）、`genId.ts`（`genUuidV7`）有变更且要发版  
> **文件位置**：`docs/10-item-codes-scale-deploy-checklist.md`（与 `docs/README.md` 索引中的「10」对应）。

---

## 0. 先确认环境假设

- **本迁移会 `DROP` 并重建** `item_codes`、`plan_virtual_batches`（见 `20260425103000_item_codes_partitioned_scale`）。仅适用于**可清空该两表数据**的环境；生产有真实数据时**禁止**直接跑，需另做数据迁移方案。
- 若本地/CI 数据库与迁移历史**漂移**，先 `prisma migrate resolve` / `migrate reset` 或对齐迁移记录后再继续（详见 `backend/README.md`）。

---

## 1. 代码与依赖

- [ ] 已拉取包含上述改动的分支，且 `backend` 下 `npm install` 无报错。
- [ ] `cd backend && npx prisma validate` 通过。

---

## 2. 数据库迁移（目标库）

在**目标 PostgreSQL**上、使用**正确的 `DATABASE_URL`**：

- [ ] `cd backend && npx prisma migrate deploy`  
  - 期望：包含 `20260425103000_item_codes_partitioned_scale`，执行成功无 SQL 错误。
- [ ] `npx prisma generate`（若 CI 未自动生成，部署脚本里应包含）。

---

## 3. 应用重启

- [ ] 重启 API 进程（使新 Prisma Client 与路由生效）。
- [ ] 若前后端分开发：前端重新 `npm run build` / 部署静态资源（涉及 `TraceView`、`PlanTraceSection`、`services/api.ts` 时必做）。

---

## 4. 冒烟（最小集合，约 5～10 分钟）

在**已登录、已选租户**的测试环境执行：

| # | 操作 | 期望 |
|---|------|------|
| 1 | 打开某计划单「追溯码」区块 | 批次列表分页正常；子树额度与拆批前一致感（无 NaN、无报错 toast） |
| 2 | 生成一批单品码 / 批次码（含「带单品码」批次） | 成功；库中 `scan_token` 形如 `xxxxxxxx.` 前缀 + 后缀 |
| 3 | 用追溯页或扫码入口扫**新**单品码、批次码 | 能解析；跨租户协作场景仍返回 403/200 符合规则 |
| 4 | 追溯时间轴 | 首屏有数据时显示「已加载 / 共」；若有「加载更多」可点开且事件追加 |
| 5 | 删除**无子计划**的测试计划单 | 成功；该计划下 `item_codes` / `plan_virtual_batches` 无残留（应用层已删） |

---

## 5. 成功标准（本次可标记发布完成）

- [ ] 迁移在目标库执行成功，无回滚。
- [ ] 上述冒烟 5 项无阻塞性错误。
- [ ] 日志无持续 Prisma `P20xx` / 分区相关错误。

---

## 6. 出问题先看哪里

| 现象 | 优先检查 |
|------|----------|
| 迁移失败 / 表已存在 | 是否重复执行；迁移历史表 `_prisma_migrations` 与文件是否一致 |
| 扫码 404「单品码/批次码不存在」 | `scan_token` 格式是否带点号前缀；租户表 `tenants.id` 去连字符前 8 位是否与 token 前缀一致 |
| 追溯空或分页错乱 | `GET .../trace/:token?page=&pageSize=` 与前端 `TraceView` 是否同版本 |
| 删计划后仍有孤儿码 | `plans.service` 是否已部署；是否走了未更新的 API 节点 |

---

## 7. 给 AI / 协作者的检索句

需要回忆「大表码表上线前要做什么」时，在仓库内搜：**`10-item-codes-scale-deploy`** 或 **`分区 item_codes`** 即可定位到本文件。
