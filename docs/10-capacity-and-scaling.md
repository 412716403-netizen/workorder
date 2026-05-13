# 容量治理与扩容路线图（10）

本文档对应「1 万用户 / 百万级日写入」治理计划，与仓库内实现阶段同步更新。

## Phase 0：准备（运维清单）

在任意代码阶段上线前，在阿里云控制台完成：

| 项 | 说明 |
|----|------|
| ECS 云监控 | CPU / 内存 / 公网带宽 / 磁盘 IO；>70% 持续 5 分钟告警 |
| RDS SQL 洞察 | 开启慢 SQL（建议阈值 >1s） |
| RDS 按需备份 | 每个大版本发布前手动备份一次 |
| Git 基线 | 发布前打 tag，例如 `v-pre-capacity-tuning` |

**实测指标占位（发布后由运维填写）**

| 指标 | Phase0 基线 | Phase1 后 | Phase2 后 | Phase3 后 |
|------|-------------|-------------|-------------|-------------|
| 首屏 API 总耗时 (ms) | _待填_ | _待填_ | _待填_ | _待填_ |
| `/api/auth/login` p95 (ms) | _待填_ | _待填_ | — | — |
| RDS CPU 峰值 % | _待填_ | _待填_ | _待填_ | _待填_ |

---

## Phase 1：PM2 cluster + Redis（代码与部署）

### 已实现（仓库）

- `REDIS_URL` 可选；未配置时手机号验证码等仍使用进程内 Map（**单 worker** 场景安全）。
- `backend/src/lib/redis.ts`：JSON 读写、删除；连接失败时降级为无缓存。
- `auth.service`：`buildTenantPayload` 短时缓存（30s）；手机号变更验证码 / 冷却使用 Redis（若可用）。
- `masterData` 字典列表：`GET /master/dictionaries` 带 60s Redis 缓存；增删改字典项时失效缓存。
- `backend/ecosystem.config.cjs`：`pm2-runtime` 集群 4 实例（可按 CPU 调整）。

### 服务器部署步骤（测试机 / 正式机）

1. `sudo dnf install -y redis && sudo systemctl enable --now redis`（或购买阿里云 Redis 并填外网/内网 URL）。
2. 在 `backend/.env` 增加：`REDIS_URL=redis://127.0.0.1:6379`。
3. `cd backend && npm ci && npm run build`。
4. 将 `smarttrack-api.service` 的 `ExecStart` 改为使用 `pm2-runtime`（见下文 systemd 片段）。
5. `sudo systemctl daemon-reload && sudo systemctl restart smarttrack-api`。

**systemd 片段（`ExecStart`）**

```ini
WorkingDirectory=/var/www/smarttrack-pro/backend
ExecStart=/var/www/smarttrack-pro/backend/node_modules/.bin/pm2-runtime start ecosystem.config.cjs
```

---

## Phase 2：列表接口默认分页 + `all=true` 兼容

### 行为约定

- 未传 `all=true` 时：默认 `page=1`、`pageSize=50`（上限 200），返回 `{ data, total, page, pageSize }`。
- 传 `all=true` 时：返回与历史一致的全量数组（或历史形状），并打日志 `[list:all] service=...`。
- 前端 `services/api.ts` 的 `crud().list` 与 `psi.list` 等默认附带 `all=true`，直至 Phase 3 各视图改为显式分页后再移除。
- **`*.listPaginated()` 绝对不能再叠 `all=true`**：分页接口和 `all=true` 是两种返回形状（对象 vs 数组），叠在一起会让 `result.data` 变 undefined → 视图层 `setState(undefined)` 后再 `.length` 直接整页崩。已修：`plans/orders/production/psi.listPaginated` 现在只透传调用方参数；前端 `PlanOrderListView / OrderListView` 也加了 `Array.isArray(result)` 防御兜底，未来即使后端误返回数组也不会闪退。

### 已覆盖的服务端列表（随 PR 迭代）

生产报工、PSI、财务、计划、工单、产品、往来单位、工人、设备；工单「产品进度」列表；其余小表（角色、租户、设置项分类等）体量小，可按需再收紧。

---

## Phase 3：前端按需加载（渐进）

### Phase 3.A 财务

后端：

- `finance.service.listRecords` 支持 `startDate/endDate/type/status/categoryId/partner/operator/workerId/productId/search` 过滤。
- 新增 `GET /api/finance/summary`：按 `type / type×status / categoryId / partner` 聚合，与列表口径一致（同一 filter）。

前端：

- `services/api.ts` 暴露 `finance.listPage(filter)` 与 `finance.summary(filter)`；新视图应通过它们消费。
- `FinanceView` 不再 `refreshFinanceRecords()`：所有列表 / 单号预览 / 对账 / 详情明细均走后端按需查询；仅 PSI / 生产流水仍 refresh（销售单打印兜底等还会用）。
- **`FinanceOpsView` 列表**：非对账模式（OTHER_RECEIPT/RECEIPT/PAYMENT/REFUND/REIMBURSE…）改为 react-query 按 `type+search+page` 走 `finance.listPage`，本地仅维护 `finPage` state；翻页/搜索切换只刷一页。
- **`FinanceOpsView` 单号预生成**：从"前端 `allRecords` 全量遍历今日同类型"切换为后端 `today-count`（pageSize=1 仅取 `total`）；后端 `createRecord` 仍调 `generateDocNo` 保证落库唯一性。
- **`FinanceDetailModal` 明细**：对账行的 PSI / 外协明细改 react-query 按 `docNumber / docNo` 后端窄拉（新增 `production.listRecords.docNo` filter 支持），不再依赖 `psiRecords / prodRecords` 全量；props 上的字段已 deprecated，保留作兜底。
- **对账 hook（`useFinanceReconciliation`）已改为 react-query 按需窄拉**：当用户点击"对账查询"且选择 partner/worker + 日期范围后，hook 内会发起 3 条窄查询（finance / psi / production），完全不依赖 props 中的全量数据；props 上的全量列表只在用户没启用对账查询时作兜底。
- 至此 Finance 模块在主流路径上已与 `AppDataContext.financeRecords` 完全解耦；context 状态仅保留为旧 view 兜底。

### Phase 3.B PSI

后端：

- 新增 `GET /api/psi/stock-snapshot?productId&warehouseId`：返回 `byWarehouse / byVariant / byBatch` 三个桶（语义与前端 `usePsiStockIndex` 完全一致）。
- `byVariant` 桶补 `displayQty`：当变体下存在盘点记录时，按"最近一次盘点 + 之后增减 + 其它盘点 adj"在后端算好，等价于前端 `getVariantDisplayQty`，省去前端 timestamp 时序回放。
- 现有 `/psi/stock` 与 `/psi/stock/batches` 保留，作为更细的单 product 查询。

前端：

- `hooks/useStockSnapshot.ts`：react-query 包装，返回 `getStock / getStockVariant / getVariantDisplayQty / getNullVariantProdStock / getStocktakeAdjust / getBatchStock / listAvailableBatches`，与 `usePsiStockIndex` API 完全对齐；新视图与新弹窗优先使用。
- **已完成迁移到 `useStockSnapshot` 的调用点**：`StockConfirmModal` / `OutsourceMaterialDispatchModal` / `OutsourceMaterialReturnModal` / `ReworkMaterialIssueModal` / `MaterialIssueModal`（order-list）/ `PurchaseBillFormSection` / `SalesBillFormSection` / **`PSIOpsView` 库存索引**。库存计算路径全部下沉到后端，前端不再持有派生索引。
- ✅ **业务列表**：`PSIOpsView` 通过 `usePsiOpsRecordsList` + `psi.listPaginated` 按 tab `type` 分页拉取（采购订单 tab 额外拉 `PURCHASE_BILL` 全量以维护「已入库」与未结筛选）；`PSIView` 不再挂载即 `refreshPsiRecords()`。

### Phase 3.C 生产报工

后端：

- `production.service.listRecords` 增加 `workerId / partner / status / docNo / startDate / endDate / search` 过滤（`docNo` 服务于 `FinanceDetailModal` 的外协收回明细窄查）。
- 新增 `types` 多值 filter（`?types=STOCK_OUT,STOCK_RETURN` 或 `?types[]=...`），与单值 `type` 互斥；用于容器层按 tab 窄拉。
- 新增 `orderIds` / `productIds`（逗号分隔，上限 500）：与 `types` 组合时用于工单中心等场景 OR 作用域（工单 id 命中，或「无 orderId 的外协/返工」+「按产品的 STOCK_IN」）。
- 新增 `GET /api/production/summary`：返回 `byType / byStatus / byWorker / byPartner` 聚合，与列表口径一致。

前端：

- `services/api.ts` 暴露 `production.listPage(filter)` / `production.summary(filter)` / `ProductionFilter.types`（逗号分隔多 type）。
- ✅ **生产物料 / 外协 / 返工**：`StockMaterialPanel` / `OutsourcePanel` / `ReworkPanel` 各自按 `activeOrderIds`、status、今日窗口多条 `useQuery` 窄拉（见 Phase 3.E）；`ProductionMgmtOpsView` 不再下发全量 `records`。
- ✅ **工单中心**：`OrderListView` 内用 `useQuery` + `production.listPage`，按当前列表工单 id / 产品 id 窄拉 `REWORK,OUTSOURCE,REWORK_REPORT,STOCK_IN`。`MaterialIssueModal` 也已切换为内部 useQuery 拉 `STOCK_OUT/STOCK_RETURN`（按 orderId/forProduct family）以及今日 `STOCK_OUT` 用于生成单号。
- ✅ **`CollaborationInboxView`** 按 transfers 涉及的 `productIds` 用 `useQuery` 自取 `STOCK_IN/STOCK_OUT/STOCK_RETURN/OUTSOURCE`，不再依赖 context 大包，且本地 invalidate 触发刷新。
- ✅ **`WarehousePanel`** 在 PSI 业务页内 useQuery 自取 STOCK_* 流水。
- ✅ 由 `AppDataContext` 提供的 `refreshProdRecords / refreshPsiRecords / refreshFinanceRecords` 已删除；写动作完成后由 `invalidateAllProdRecords/PsiRecords/FinanceRecords` 触发各窄查询 `queryKey` 刷新。
- ⏸️ Follow-up：报工/外协看板改走 `production.summary`（可选）。

### Phase 3.D AppDataContext 清理

**已完成（Phase 3.D follow-up，一次性收口）：**

- ✅ `appDataLoadCore.executeAppDataDeferredLoad` 不再 eager 加载 `prodRecords / psiRecords / financeRecords`；首屏仅拉 `plans / orders / 产品进度`。
- ✅ `AppDataContext` 三大 state、setter、`refreshProdRecords / refreshPsiRecords / refreshFinanceRecords` 全部删除。所有 `onAdd*Record / onUpdate*Record / onDelete*Record / onReplacePSIRecords / onDeletePSIRecords / onReportSubmit*` 改为仅调用后端 API，并通过 `useQueryClient.invalidateQueries` 触发各窄查询自动重拉：
  - `prod`：`invalidateAllProdRecords` 使用 **predicate** 批量匹配 `queryKey[0]`：`orderCenterProdNarrow` / `prodMgmtOpsView.records` / `collabInbox.prodRecords` / `warehousePanel.prodStockRecords` / `stockPanel.*` / `outsourcePanel.*` / `reworkPanel.records` / `flow.*` / `materialIssueStockProd` / `materialIssueTodayStockOut` / `finance-detail` 的 prod 分支
  - `psi`：`invalidateAllPsiRecords`：`psiOpsRecords` / `planRelatedPsi` / `finance-detail` 的 psi 分支 / **`flow.warehouse.psi.*` 前缀**（仓库流水弹窗）
  - `finance`：`['finance', 'list']` / `['finance', 'today-count']` / `['useFinanceReconciliation']`
- ✅ `PsiState` 简化为占位接口（仅保留 `usePsiData()` 防破坏，但不再返回任何字段）；`FinanceState` 仅保留 `financeCategories / financeAccountTypes` 这两个字典型小数据。`OrdersState` 不再含 `prodRecords`。
- ✅ 所有曾经从 context 取大数组的 view 已替换为各自的 react-query：
  - `ProductionManagementView` 不再读 `prodRecords / psiRecords`，子页（工单中心 / 物料 / 外协 / 返工）各自窄拉。
  - `PSIView` 不再传 `prodRecords` 给 `PSIOpsView`；`WarehousePanel` 内部用 useQuery 自取 STOCK 流水。
  - `FinanceView` 不再消费 `f.financeRecords`，`FinanceOpsView` 内部按 `type+page+search` 窄拉；对账 hook 完全依赖 react-query。
  - `PlanDetailPanel` 用 `psi.planRelated / psi.lastPurchasePrices / psi.nextDocNumber` 三个后端 API 替代之前 `psiRecords.forEach` 全表扫。
  - `OrderListView` 不再接收 `prodRecords / psiRecords`；`MaterialIssueModal` 内部按当前 `orderId / forProduct.orders` 窄拉 STOCK_OUT/STOCK_RETURN + 当日 STOCK_OUT 取号。
  - `PSIOpsView` 销售单打印走 `api.finance.partnerReceivable` 在线计算应收 ledger，不再依赖 context 任何全量数组。

至此 `AppDataContext.tsx` 中**业务流水**（prod/psi/finance records）的 state、setter、refresh 全部下线；context 仅保留：主数据（产品、物料、工人、设备、字典、分类、partner、warehouse 等）+ 配置（formSettings / printTemplates 等）+ orders/plans + 写动作 + invalidate 触发器。

### Phase 3.E 流水弹窗默认当天 + 删 12000 上限

**问题与目标**

- `ProductionMgmtOpsView` 旧实现用 `fetchAllProductionByTypes`（60 页 × 200/页 = 12000 条硬上限）把整个 tab 的 production 流水一次性拉到容器层，再以 `records` props 下发给 `StockMaterialPanel / OutsourcePanel / ReworkPanel` 与各流水弹窗；客户多起来后单租户单 tab 就可能突破 12000，且弹窗"默认全部历史"的查询模式越来越慢。
- 本阶段目标：**1）7 个流水弹窗（领退料 / 外协 / 返工报工 / 不良品处理 / 仓库 / 报工流水 / 生产入库流水）默认当天时间窗；2）删除 12000 条客户端硬上限（同时连带绕过 `OrderListView.orderCenterProdQuery` 的 40 页/8000 条限制）；3）流水弹窗不分页（用户体验保留），靠默认窗 + 业务条件收窄数据量**。

**后端**

- `psi.service.listRecords` 增加 `startDate / endDate / search / types(逗号分隔多值)`：`where.createdAt` 用 `gte / lt`（利用 `@@index([tenantId, type, createdAt])`），`search` 在 `docNumber / partner / note / operator` 上 `contains, mode: 'insensitive'`。
- 新增 `GET /api/orders/report-history`（`production:orders_report_records:view`）：服务端展平 `Order.milestones[].reports` + `ProductMilestoneProgress.reports`，按 `timestamp ∈ [start, end)` 过滤，支持 `orderIds / productIds / search / productionLinkMode`，返回扁平 `{ orderReports, productReports }`，前端仅在 `productionLinkMode==='product'` 时消费 productReports。

**前端共享 helper**

- `views/production-ops/sharedFlowListHelpers.ts`：
  - `getTodayRangeIso()` / `dateInputToIsoStart/EndExclusive()` / `isoToDateInput()`：本地零点 ~ 次日零点。
  - `fetchProductionByFilter(filter)` / `fetchPsiByFilter(filter)`：服务端 200/页循环拉直到 `total`，**无 FETCH_MAX_PAGES 上限**；当 filter 为空且循环 > 20 页时 `console.warn` 提醒调用方收窄。

**7 个流水弹窗 — 弹窗内独立 useQuery，默认当天**

| 弹窗 | queryKey | 数据源 |
|------|----------|--------|
| `StockFlowListModal` | `['flow.stock', from, to]` | `fetchProductionByFilter({ types: 'STOCK_OUT,STOCK_RETURN' })` |
| `OutsourceFlowListModal` | `['flow.outsource', from, to]` | `fetchProductionByFilter({ types: 'OUTSOURCE' })`；聚合 `outsourceFlowSummaryRows` 从 `OutsourcePanel` 搬入 |
| `ReworkReportFlowListModal` | `['flow.reworkReport', from, to]` | `fetchProductionByFilter({ types: 'REWORK_REPORT,REWORK' })` |
| `DefectTreatmentFlowListModal` | `['flow.defect', from, to]` | `fetchProductionByFilter({ types: 'REWORK,SCRAP' })` |
| `WarehouseFlowModal` | `['flow.warehouse.psi.{purchaseBill\|salesBill\|transfer\|stocktake}']` + `['flow.warehouse.prod']` | 4 并发 `fetchPsiByFilter` + 1 `fetchProductionByFilter`，聚合从 `WarehousePanel` 搬入 |
| `ReportHistoryModal` | `['flow.reportHistory', from, to, productionLinkMode]` | `ordersApi.listReportHistory()`（后端扁平结果） |
| `PendingStockPanel` 生产入库流水（内嵌） | `['flow.stockIn', from, to]` | `fetchProductionByFilter({ type: 'STOCK_IN' })`；与 `OrderListView.orderCenterProdQuery` 完全脱钩，绕开其 40 页/8000 条客户端硬上限 |

- 弹窗均增加"重置为当天"按钮 + loading 指示；UI 仍然不分页（一次性渲染 react-query 返回的当日数据）。
- 流水弹窗触发的明细模态：把弹窗自己拉到的相关行通过 `onOpenDetail(docNo, extraRecords)` 透传给 panel 容器，panel 用 `flowDetailExtraRecords` 临时存放作为详情兜底；保证旧"详情依赖 panel 全量 records"的视图在 panel 数据已收窄后仍能完整渲染。

**Panel 容器层 — 按业务条件窄拉，无 12000 上限**

- `ProductionMgmtOpsView` 删除 `TAB_TYPE_SETS / FETCH_PAGE_SIZE / FETCH_MAX_PAGES / fetchAllProductionByTypes / recordsQuery` 与 `records` 下发；`records` props 标注 deprecated，仅保留兜底。
- `StockMaterialPanel`：
  - `useQuery(['stockPanel.records', activeOrderIdsCsv])`：`fetchProductionByFilter({ types: 'STOCK_OUT,STOCK_RETURN,OUTSOURCE', orderIds: activeOrderIds })`，无日期上限（按活动工单收窄）。
  - `useQuery(['stockPanel.todayStockOut', from, to])`：`STOCK_OUT` 今日（生成 `getNextStockDocNo`）。
- `OutsourcePanel`：
  - `outsourcePanel.outsource.byOrders` / `outsource.today` / `stock.byOrders` / `rework.byOrders` 四条窄查询，合并去重作为 panel 主 records 输入；`outsourceFlowSummaryRows` 已搬到弹窗内。
- `ReworkPanel`：
  - `useQuery(['reworkPanel.records', activeOrderIdsCsv])`：`types=REWORK,REWORK_REPORT,SCRAP,OUTSOURCE, orderIds=activeOrderIds`。
- `WarehousePanel` 保留原 `warehousePanel.prodStockRecords` 自取；`warehouseFlowRows` 聚合搬到 `WarehouseFlowModal` 内部。
- ✅ `PendingStockPanel` 「生产入库流水」子弹窗换成独立 useQuery。
- ✅ 主面板「待入库清单」改为本地 `useQuery(['pendingStockPanel.stockIn', orderIdsCsv, productIdsCsv])` 按当前 `orders` 全集的 `orderIds + productIds` 窄拉 `STOCK_IN` 全集，`computePendingStockOrders` 与 `OrderListView` 顶部按钮 badge 走同一份数据源（之前曾错按 `OrderListView.orderCenterProdQuery` 的分页/产品 id 窄拉，导致"badge 显示 3 但弹窗为空"等不一致）。跨日累计不再依赖 `props.prodRecords`。
- ✅ `getNextStockInDocNo` 已下线：所有 RK/LL/TL/WX 取号统一由后端 `POST /production/records/batch` + `pg_advisory_xact_lock` 串行化分配（前端 `StockMaterialPanel` / `StockMaterialFormModal` / `ReworkMaterialIssueModal` / `MaterialIssueModal` 均不再自算单号；`onAddProdRecord(Batch)` 返回服务端记录供 view 层读真实 docNo）。

**invalidate bug 修复**

- `AppDataContext.invalidateAllProdRecords` 之前写死 `['psiOps.warehouseStockProd']`，与实际 `WarehousePanel` 用的 `['warehousePanel.prodStockRecords']` 不一致，导致仓库流水写入后不刷新。
- 现改用 `predicate` 风格批量匹配 `queryKey[0]`：覆盖 `orderCenterProdNarrow / prodMgmtOpsView.* / collabInbox.prod* / warehousePanel.prod* / stockPanel.* / outsourcePanel.* / reworkPanel.* / flow.* (stock / outsource / reworkReport / defect / warehouse.prod / reportHistory) / materialIssueStockProd / materialIssueTodayStockOut / pendingStockPanel.stockIn`，以及 `['recon','prod',...]` 对账分支；`invalidateAllPsiRecords` 同步加 `flow.warehouse.psi.*` 前缀匹配与 `['recon','psi',...]`；`invalidateAllFinanceRecords` 加 `['recon','finance',...]`。

  Phase 3.E follow-up：matchSet 由"硬编码枚举"改为"prefix 匹配"，避免新增 panel queryKey 时漏注册（典型坑：`recon-prod` 三系 query 曾因未注册导致对账写入后 stale）。

**关键非目标**

- 弹窗内"上一页/下一页"分页 UI。
- ProductionOpRecord / PsiRecord 的 schema 改动。
- `ReportHistoryModal` 之外其他 panel 使用 `productMilestoneProgresses` 的逻辑改造。

### 容量治理 follow-up 后续（暂不实施）

- **报工/外协 summary 看板**：当前仓库内没有独立的"看板视图"消费方，`/api/production/summary` 已返回 `byType / byStatus / byWorker / byPartner`，但**缺 `byNode`（按里程碑节点聚合）与按 `type × status` 维度的 `quantity` 拆分**——例如外协 tab 需要分别看「发出但未收回」「已收回」的 quantity 总额。
  - 待产品侧确认是否新建独立看板页后，再扩 `summarize` 接口：
    1. 新增 `byNode: Record<milestoneTemplateId, { quantity, defectiveQty }>`；
    2. 新增 `byTypeStatus: Record<\`${type}|${status}\`, quantity>`；
    3. 前端新建 `ProductionDashboardView`，按 partner / date 过滤后展示。
  - 不在本次 follow-up 实施。

---

## Phase 4：React Query

- 根目录已安装 `@tanstack/react-query`，`App.tsx` 挂载 `QueryClientProvider`。
- `hooks/useRolesQuery.ts`：`MemberManagementView` 使用，减少角色列表重复请求。
- `hooks/useStockSnapshot.ts`：PSI 库存快照（Phase 3.B 联动）。
- `hooks/usePsiOpsRecordsList.ts`：PSI 作业页按 tab `type` 分页拉业务列表（替代全类型 `psi.list?all=true`）。
- `hooks/useMasterDataQuery.ts`：partners / products / dictionaries / warehouses / 各分类 / global nodes / finance 分类 & 账户类型 / workers / equipment 全部就绪；新视图优先 `useXxxQuery()`，旧 view 可逐步切换。
- `useInvalidateMasterData()`：批量 / 单条 invalidate helpers，租户切换时 `invalidateAll()`。

---

## Phase 5：二期方向（未实现）

- 消息队列（批量报工、导出、对账异步化）
- RDS 只读实例 + 报表读走只读
- 大表分区与冷归档（OSS）

---

## 相关文档

- [09-deploy-servers.md](./09-deploy-servers.md) 部署与运维
- [06-current-architecture-and-migration-status.md](./06-current-architecture-and-migration-status.md) 架构现状
