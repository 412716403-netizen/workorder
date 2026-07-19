# 数据结构文档

> 本文档记录主要业务实体、关联关系，以及“数据归谁管”。当前项目已经进入前后端收口阶段，因此这里不再把所有数据一概视为 `localStorage` 真源，而是区分服务端持久化、客户端会话缓存和前端聚合状态。

---

## 1. 数据归属分层

### 1.1 服务端持久化真源

以下数据以数据库 / 后端 API 为主真源，前端负责拉取、展示、编辑和局部乐观更新：

| 业务域 | 主要实体 |
|------|------|
| 认证 / 租户 / 权限 | User, Tenant, TenantMembership, Role |
| 系统设置 | ProductCategory, PartnerCategory, GlobalNodeTemplate, Warehouse, FinanceCategory, FinanceAccountType, SystemSetting |
| 基础资料 | Partner, Worker, Equipment, DictionaryItem, Product, ProductVariant, BOM |
| 计划 / 工单 / 报工 | PlanOrder, PlanItem, ProductionOrder, OrderItem, Milestone, MilestoneReport, ProductMilestoneProgress |
| 生产操作 | ProductionOpRecord |
| 进销存 | PsiRecord |
| 财务 | FinanceRecord |
| 协作 | TenantCollaboration, InterTenantSubcontractTransfer, CollaborationProductMap, OutsourceRoute |
| 码管理 | ItemCode, PlanVirtualBatch |
| 款式开发 | DevStyle, DevStyleVariant, DevBom, DevBomItem, DevSample, DevStage, DevStageField, DevAttachment, DevStageTemplate, DevLog |
| 资料库 | KnowledgeFolder, KnowledgeDocument, KnowledgeAsset |

### 1.2 客户端会话 / 租户缓存

以下数据当前仍会保存在浏览器 `localStorage`，主要用于登录态恢复和租户上下文切换，不应视为业务主数据真源：

| 键 | 说明 |
|------|------|
| `currentUser` | 当前登录用户信息缓存 |
| `tenantCtx` | 当前选中企业、角色、权限、到期信息 |
| `userTenants` | 当前用户可访问企业列表 |
| `isLoggedIn` | 登录态标记 |

### 1.3 前端聚合状态

`AppDataContext` 当前聚合了大部分页面直接消费的数据与操作入口，主要包括：

| 状态键 | 类型 | 说明 |
|--------|------|------|
| products | `Product[]` | 产品主数据 |
| orders | `ProductionOrder[]` | 生产订单 |
| plans | `PlanOrder[]` | 计划单 |
| psiRecords | `any[]` | 进销存记录 |
| financeRecords | `FinanceRecord[]` | 财务记录 |
| prodRecords | `ProductionOpRecord[]` | 生产操作记录 |
| categories | `ProductCategory[]` | 产品分类 |
| partnerCategories | `PartnerCategory[]` | 合作单位分类 |
| dictionaries | `AppDictionaries` | 颜色/尺码/单位等字典 |
| globalNodes | `GlobalNodeTemplate[]` | 工序模板 |
| boms | `BOM[]` | BOM 清单 |
| partners | `Partner[]` | 合作单位 |
| workers | `Worker[]` | 工人 |
| equipment | `Equipment[]` | 设备 |
| warehouses | `Warehouse[]` | 仓库 |
| financeCategories | `FinanceCategory[]` | 收付款类型 |
| financeAccountTypes | `FinanceAccountType[]` | 收支账户类型 |
| planFormSettings | `PlanFormSettings` | 计划单表单配置 |
| orderFormSettings | `OrderFormSettings` | 工单表单配置 |
| purchaseOrderFormSettings | `PurchaseOrderFormSettings` | 采购订单表单配置 |
| purchaseBillFormSettings | `PurchaseBillFormSettings` | 采购入库表单配置 |
| printTemplates | `PrintTemplate[]` | 打印模板配置 |
| productionLinkMode | `ProductionLinkMode` | 生产关联模式 |
| processSequenceMode | `ProcessSequenceMode` | 工序顺序模式（已固定为 `sequential`；历史 `free` 租户迁移为各工序开启 `allowOutOfSequence`） |
| allowExceedMaxReportQty | `boolean` | 是否允许超额报工 |
| allowExceedMaxOutsourceReceiveQty | `boolean` | 是否允许超额外协收货（已派 − 已收） |
| allowExceedMaxStockInQty | `boolean` | 是否允许生产入库超过最大可入库数量（待入库清单入库时放开 pending 上限） |
| weightTolerancePercent | `number` | 扫码称重容差百分比（默认 5，表示 ±5%） |
| productMilestoneProgresses | `ProductMilestoneProgress[]` | 关联产品模式进度数据 |

### 1.4 说明

- `types.ts` 是前端类型定义入口
- `backend/prisma/schema.prisma` 是数据库模型入口
- `services/api.ts` 是前端接口契约入口
- 当三者不一致时，应优先修正文档，明确“当前真源”与“迁移中暂存状态”

### 1.5 系统设置 / 基本信息与聚合状态对应

| 入口 | 子模块 | 主要状态 / 实体 |
|------|--------|--------------|
| **系统设置** | 产品分类管理 | categories / ProductCategory |
| | 合作单位分类 | partnerCategories / PartnerCategory |
| | 工序节点库 | globalNodes / GlobalNodeTemplate |
| | 仓库管理 | warehouses / Warehouse |
| | 收付款类型 | financeCategories / FinanceCategory |
| | 收支账户类型 | financeAccountTypes / FinanceAccountType |
| **基本信息** | 产品与 BOM | products, boms / Product, BOM |
| | 合作单位 | partners / Partner |
| | 工人管理 | workers / Worker |
| | 设备管理 | equipment / Equipment |
| | 公共数据字典 | dictionaries / DictionaryItem |

### 1.6 工作台配置

| 存储 | Key / 字段 | 形状 | 说明 |
|------|------------|------|------|
| `tenant_memberships.preferences` | `dashboardWorkbench` | `WorkbenchConfig`（仅含首页） | **个人首页**布局（仅 owner 可编辑，成员只读） |
| `system_settings` | `workbenchSharedPages` | `WorkbenchPage[]`（不含首页） | **租户级共享自定义页面**池；每页带 `createdByUserId` 创建者 |
| `system_settings` | `featurePlugins` | `Record<string, boolean>` | 租户级功能插件开关 |
| `platform_announcements` | — | 行级表 | 平台 admin 发布的全租户公告（最多 50 条，发布人展示「系统」） |

工作台页面可见性与权限：

- **创建者**：owner 恒可见、可编辑全部工作台页面。
- **成员可见性（严格）**：裸 `workbench` 可查看全部页面；否则仅可查看角色显式授予的 `workbench:<pageId>`，首页也必须单独勾选。成员均为只读，未授予任何 `workbench*` 键时不显示工作台入口。
- **完整授权（页面查看权限＝该页内容整体授权）**：页面对用户完整授权（owner / `workbench:<pageId>` / 裸 `workbench`）时，该页 widget 不再按模块权限过滤、金额不再掩码；统计接口经 `augmentPermissionsWithWorkbench` 临时补齐 psi/production/finance 等模块以返回完整数据。
- 后端读取时按 `getWorkbench` 组装「个人首页 + 当前用户可见的共享页面」并按 widget 权限过滤；保存时 `saveUserWorkbench` 把首页落 `preferences`、自定义页按 `canManage`（owner）规则合并进共享池（非 owner 的改动一律忽略，库保持不变）。

类型定义见 `shared/workbench.ts`（`WORKBENCH_PERM_MODULE` / `workbenchPagePermKey`）、`shared/workbenchValidate.ts`（`canViewWorkbenchPage` / `canEditWorkbenchPage` / `hasWorkbenchPageFullAccess` / `filterWorkbenchPagesByVisibility` / `mergeSharedWorkbenchPages`）、`shared/dashboardMessages.ts`；API 见 `GET/PUT /api/dashboard/workbench`、`GET /api/dashboard/workbench/pages`（角色管理列页面）、`GET/POST/DELETE /api/dashboard/messages`（仅平台 admin）、`GET /api/dashboard/notifications`。

**工作台统计周期（共用）**：销售/销售订单/财务/工单/外协/返工/产品经营等卡片均支持 `period=today|yesterday|month`，或 `startDate` + `endDate`（`YYYY-MM-DD`，含起止日全天）自定义区间；前端 Hook `useWorkbenchPeriodFilter` + `shared/workbenchOrderStats.ts` 统一解析；标题栏内联日期选择（不占浮层）。

**产品经营情况组件**（`product_economics_consumable` / `product_economics_document`，`requiredModule: production`；旧 `product_economics` 加载时自动迁移为 consumable）：

- 前端：`ProductEconomicsWidget`（汇总 KPI）+ `ProductEconomicsModal`（产品列表 + 单产品下钻）；Hook `useProductEconomics` / `useProductEconomicsDetail`。
- 弹窗左侧列表：仅展示**已配置标准生产路线**（`milestoneNodeIds` 非空）且有经营数据的产品；卡片汇总 KPI 仍含全部有活动产品。
- API：`GET /api/dashboard/product-economics`（列表 + 汇总）、`GET /api/dashboard/product-economics/:productId`（单产品明细含 `byNode` 工序拆分）。
- **工作台卡片**：支持 `period=today|yesterday|month`，或 `startDate` + `endDate`（`YYYY-MM-DD`，含起止日全天）自定义区间；按报工/外协/返工/报损/销售单据 `timestamp` 过滤。**不传 period / 日期为累计**（弹窗明细用累计口径）。
- 弹窗明细：`GET /api/dashboard/product-economics/:productId` 始终累计。
- 口径：**累计**（弹窗明细）；卡片可按周期过滤。按产品聚合，仅纳入有任一生产/销售/库存/单据关联活动的产品。
- **物料成本口径**：由工作台组件决定，**无租户级开关**。添加 **产品经营·报工耗材**（`consumable`）或 **产品经营·单据关联**（`document_linked`）组件即可；API 请求带 `materialCostMode` 查询参数。未传参时后端回退 `productEconomicsSettings.materialCostMode`（默认 `consumable`，仅兼容旧调用）。
- **`productEconomicsSettings.materialPriceRule`**（租户配置，默认 `all_time`）：报工耗材口径下的**物料采购均价**统计规则；在 **产品经营·报工耗材 → 更多 → 物料价格** 维护，不由业务配置页切换。
  - **`consumable`（默认）** — 报工耗材 + 结余损耗，**并叠加关联收付款**：
    - **物料成本**：与生产物料面板「报工耗材」同一数量口径（`shared/productMaterialConsumableCost.ts`），再 × 物料单价。未开启称重 → 报工数 × BOM 用量；开启称重且有快照 → 各子物料 `actualWeight` 累加。**物料单价**按 **成品上下文** `parentProductId + materialId` 解析；规则优先级：单物料覆盖 → 成品 BOM 规则（**默认最近一次采购价**，可改为自定义时间区间）。成品级规则与单物料覆盖存 `products.economicsBomMaterialPrice`；计价见 `shared/materialPurchasePrice.ts`（`resolveEffectiveMaterialPriceRule`）；仍无数据时回退档案 `purchasePrice`。
    - **物料采购均价配置入口**：工作台 **产品经营·报工耗材** → **更多** → **物料价格**（`MaterialPurchasePriceModal`）：一级为带 BOM 成品列表；二级设定该成品 BOM 统计规则（默认最近一次采购价 / 自定义时间），单条物料可单独覆盖（同样仅**最近一次采购价 / 自定义时间**；「恢复成品规则」清除覆盖）。**变更成品 BOM 统计规则时会清除该成品下全部单物料覆盖**。
    - **报工价格 / 外协价格**（同弹窗顶栏按钮；`ReportProcessPriceModal` / `OutsourceProcessPriceModal`）：一级为有标准路线成品；二级为成品默认规则 + 各工序核算单价（**最近一次单价** / **自定义时间**，单工序可覆盖）。规则存 `products.economics_report_node_price` / `products.economics_outsource_node_price`。报工流水：`milestoneReport` + `productProgressReport` 的 `rate`；外协流水：`OUTSOURCE` 已收回单的 `unitPrice`（或 `amount/quantity`）。无流水回退 `nodeRates[nodeId]`。
    - **物料结余（损耗）**：对齐生产物料面板结余口径（仅累计）。`max(0, 净领用 − 报工耗材) × 物料单价`。
    - **关联付款 / 关联收款**：与 `document_linked` 相同规则（分类 `linkProduct` + `productId`），计入成本 / 收入侧；**不含**关联采购入库金额。
    - **毛利参考** = (`salesAmount` + `linkedReceiptAmount`) −（物料+报工+外协+返工+物料结余+报损+`linkedPaymentCost`）。
    - **产品成本价（理论）**（仅 `consumable`）：单件理论成本 = 根 BOM 物料 + 标准路线各工序单价。工序单价优先级：**外协核算价 → 报工核算价 → 档案 nodeRates**（见报工/外协价格配置）；不含实际累计外协经营成本/返工/结余损耗/关联收付款。列表 `theoreticalUnitCost`；明细 `theoreticalCostBreakdown`（饼图）。顶栏可点击查看组成。
  - **`document_linked`** — 关联采购入库 + 关联收付款（与上项**互斥**，不做系统自动去重）：
    - **关联采购入库**（`linkedPurchaseCost`）：`PURCHASE_BILL` 行 `customData.relatedProductId = 成品 id` 的 `amount`（或 `quantity × purchasePrice`）累计。
    - **关联付款**（`linkedPaymentCost`）：`FinanceRecord` `type=PAYMENT`、`status=COMPLETED`、`productId` 非空，且分类 `linkProduct=true`，需 finance 模块权限。
    - **关联收款**（`linkedReceiptAmount`，收入侧）：同上 `type=RECEIPT`。
    - **业务规范**：物料已在采购入库关联成品时，给供应商付货款**勿**再关联产品；关联付款适用于运费、外协现金等无法走 PSI 的费用。
    - **毛利参考** = (`salesAmount` + `linkedReceiptAmount`) −（关联采购入库+关联付款+报工+外协+返工+报损）。
- 两种口径**共用**（需 production 模块）：
  - **报工成本**：各工序 `quantity × rate` 汇总，**按工序扣减同工序外协加工费**后相加。
  - **外协加工费**：`ProductionOpRecord`（`type=OUTSOURCE`）`amount` 汇总。
  - **返工费**：`ProductionOpRecord`（`type=REWORK_REPORT`）`amount` 汇总。
  - **报损**：数量 = `SCRAP` 流水 `quantity` 汇总；金额 = 报损量 × 单件 BOM 标准物料成本。
  - **详情 `totalOrderQty` / `stockInQty` / `byNode`**：同前。
- 响应字段：`materialCostMode`、`canFinance`；行级 `linkedPurchaseCost` / `linkedPaymentCost` / `linkedReceiptAmount` / `totalRevenue` / `theoreticalUnitCost`（consumable；`document_linked` 为 0）；明细 `theoreticalCostBreakdown`（consumable 饼图）；consumable 时 `linkedPurchaseCost=0`；`linkedPaymentCost`/`linkedReceiptAmount` 按 finance 权限累计。
- 库存/销售（需 psi 模块）：库存走 `psi.service.getStock`；销售 = `SALES_BILL` `quantity` / `amount` 汇总。

### 1.7 资料库

| 表 | 租户 | 说明 |
|------|------|------|
| `knowledge_folders` | `tenant_id` | 文件夹树，`parent_id` 自关联 |
| `knowledge_documents` | `tenant_id` | 文档标题 + Tiptap HTML 正文 `content` |
| `knowledge_assets` | `tenant_id` | 图片/附件二进制 `data`（BYTEA），`mime_type` + `file_name`（附件原名，用于卡片展示与下载）+ `size_bytes`；文档正文引用 `/api/knowledge-base/assets/:id`；正文更新/删文档时 diff 清理无引用 asset（引用检测按正文中的 `/assets/:id` 匹配，图片 `img[src]` 与附件卡片 `data-asset-url` 均命中） |

DTO 见 `shared/types.ts`（`KnowledgeFolderDto`、`KnowledgeDocumentSummaryDto`、`KnowledgeDocumentDto`）。`GET /knowledge-base/tree` 与 `GET /knowledge-base/documents`（列表/搜索）仅返回摘要（无 `content`）；单篇正文走 `GET /knowledge-base/documents/:id`。更新文档可传 `expectedUpdatedAt`（乐观锁，冲突 409）。删除前 `GET /documents/:id/references` 检查产品/开发款引用。图片不支持 SVG（≤10MB）；附件允许任意文件类型（≤30MB），其中 PDF、Excel（`.xls/.xlsx`）、Word（`.docx` 在线预览，旧版 `.doc` 仅下载）可预览，视频（mp4/webm/ogg/mov 等）可播放，其余类型仅提供下载；可预览 MIME 列表见 `shared/types.ts` 的 `KNOWLEDGE_ASSET_FILE_MIME_TYPES`（**非上传白名单**），体积上限见 `KNOWLEDGE_ASSET_*_MAX_BYTES`；`POST /assets` 接受 `{ data, mimeType, fileName }`（缺省 MIME 为 `application/octet-stream`），`GET /assets/:id` 返回二进制，带 `?download=1` 时附 `Content-Disposition`（RFC 5987 中文名）。正文保存时 HTML 白名单消毒（含表格图片属性、`span[data-type=product-ref]` 关联产品芯片的 `data-product-id` / `data-label`、`span[data-type=document-ref]` 关联文档芯片的 `data-document-id` / `data-label`、`div[data-type=file-attachment]` 附件卡片的 `data-asset-url` / `data-file-name` / `data-mime-type` / `data-size-bytes` / `data-display-mode`）。API 见 `/api/knowledge-base/*`。

---

## 2. 进销存记录 (psiRecords)

**统一结构**：每条记录有 `type` 字段区分业务类型。

| type | 说明 | 关键字段 |
|------|------|----------|
| PURCHASE_ORDER | 采购订单 | docNumber, partner, partnerId, productId, variantId?, quantity, purchasePrice, amount, dueDate, lineGroupId |
| PURCHASE_BILL | 采购入库 | docNumber, partner, warehouseId, productId, variantId?, quantity, purchasePrice, sourceOrderNumber?, sourceLineId?, lineGroupId |
| SALES_BILL | 销售单 | docNumber, warehouseId, productId, variantId?, quantity |
| STOCKTAKE | 盘点 | warehouseId, productId, actualQuantity |
| TRANSFER | 调拨 | fromWarehouseId, toWarehouseId, productId, quantity |

**lineGroupId**：同一次添加的明细共用，用于列表/详情按组展示。  
**sourceOrderNumber / sourceLineId**：采购入库引用采购订单时记录来源，用于计算已入库数量。`sourceLineId` 等于订单行 `PsiRecord.id`；编辑订单整单替换时须保留该 id（见 `docs/01` §1.2）。  
**createdByUserId**：制单人账号 ID（`created_by_user_id`，UUID，可空）。创建时由后端写入当前登录用户，客户端传值忽略、编辑不可改；销售订单/销售单上是「仅本人可见」（`view_own`）的过滤依据（见 `docs/01` §5.6.1），其余 PSI 类型仅绑定账号（§5.6.2）；`operator` 仅作展示名。  
**PURCHASE_ORDER.customData**：生产计划详情生成采购订单时写入 `sourcePlanId`、`sourcePlanNumber`（键名见 `shared/types.ts` 中 `PSI_PO_CUSTOM_DATA_SOURCE_*`），并自动写入 `relatedProductId` 为**该计划单的产品** `productId`（与表单「关联产品」一致，便于进销存列表/详情展示）；手工新建单可另选或留空。

---

## 3. 财务记录 (FinanceRecord)

```ts
interface FinanceRecord {
  id: string;
  type: 'RECEIPT' | 'PAYMENT' | 'RECONCILIATION' | 'SETTLEMENT';
  amount: number;
  relatedId?: string;       // 账户间转账时为 transferGroupId（串联同组进/出两条流水）
  partner: string;
  operator: string;
  createdByUserId?: string; // 制单人账号 ID：后端创建时写入，view_own「仅本人可见」过滤依据（operator 仅作展示名）
  timestamp: string;
  note?: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  paymentAccount?: string;  // 收支账户名（展示用）
  accountTypeId?: string;   // 关联 FinanceAccountType.id（余额聚合/台账/转账的精确分组键）
  customData?: Record<string, any>;  // 转账记录含 { transfer:true, transferGroupId, direction:'in'|'out', counterpartAccountId, counterpartAccountName }
}
```

`paymentAccount` 历史只存账户名字符串；新增 `accountTypeId` 外键后，余额聚合、账户台账、转账一律以 `accountTypeId` 精确分组，`paymentAccount` 仅作展示与回退。迁移 `20260625120000_finance_account_balance` 已按 `(tenant_id, name)` 回填存量数据；新建/编辑收付款记录时，`finance.service` 会按 `paymentAccount` 名解析并写入 `accountTypeId`（`resolveAccountTypeId`），保证写入即归账；空或对不上的记录 `accountTypeId` 为 NULL，在「资金账户」页归入「未归账」提示，不计入任一账户余额。

### 3.1 收支账户类型 (FinanceAccountType)

```ts
interface FinanceAccountType {
  id: string;
  name: string;
  initialBalance?: number;  // 期初余额，参与当前余额聚合
  openingDate?: string;     // 期初日期（ISO）
  accountKind?: string;     // 账户分类：现金 / 银行 / 在线钱包
  sortOrder?: number;
  active?: boolean;
}
```

账户「当前余额」为派生值，不落库存量：`当前余额 = initialBalance + Σ(RECEIPT) - Σ(PAYMENT)`（仅 `status != CANCELLED` 的流水）。由 `GET /api/finance/account-balances` 实时聚合（`finance.service.getAccountBalances` → 纯函数 `accumulateAccountBalances`）。

**账户间转账（内部调拨）**：`POST /api/finance/transfers` 在事务内落两条流水——PAYMENT（转出账户）+ RECEIPT（转入账户），共享同一 `ZZD` 转账单号与 `transferGroupId`；两条流水保持 RECEIPT/PAYMENT 类型，天然复用余额聚合口径。

---

## 4. 计划单 (PlanOrder)

```ts
interface PlanOrder {
  id: string;
  planNumber: string;
  productId: string;
  items: PlanItem[];  // { variantId?, quantity }
  startDate: string;
  dueDate?: string;  // 计划交货日期；列表/录入由 planFormSettings.listDisplay.showDeliveryDate 控制
  /** 本计划工序路线覆盖；null/未设/空数组时沿用产品 milestoneNodeIds */
  milestoneNodeIds?: string[] | null;
  status: PlanStatus;
  customer: string;
  priority: 'High' | 'Medium' | 'Low';
  assignments?: Record<string, NodeAssignment>;
  customData?: Record<string, any>;  // 引用销售订单建计划时含 sourceSalesOrderDocNumber（见 shared/types PLAN_CUSTOM_DATA_SOURCE_SALES_ORDER_DOC_NUMBER）
  createdByUserId?: string; // 制单人账号 ID：后端创建时写入；本阶段仅关联，不做 view_own（见 docs/01 §5.6.2）
  createdAt?: string;
  nodePricingModes?: Record<string, ProcessPricingMode>;  // 已弃用，仅保留计件（元/件）
  /**
   * 派发完成派生状态（响应字段，不落库）。
   * 由后端 `listPlans` / `getPlan` 注入，基于该计划下 `productionOrders WHERE planOrderId = plan.id`
   * 的 `dispatchStatus` 聚合：无工单 → NOT_DISPATCHED；全部 COMPLETED → COMPLETED；其他 → IN_PROGRESS。
   * 仅「关联工单模式」的列表展示徽章；详见 `docs/01-business-rules.md §3.10`。
   */
  derivedStatus?: PlanDispatchStatus;
}
```

`PlanListDisplaySettings`（`planFormSettings` / `orderFormSettings.listDisplay` 共用形状）：

| 字段 | 说明 |
|------|------|
| `showDeliveryDate` | 仅工单模式：计划列表/表单/打印交期，以及外协与工单中心交期列；产品模式表单配置不展示此项，界面亦不显示交货日期 |
| `onlyShowNotCompleted` | 列表默认隐藏已完成：计划单排除派生 `COMPLETED`；工单中心排除 `dispatchStatus=COMPLETED`（仅关联工单模式 UI） |
| `showPurchaseProgress` | （已固定开启，无表单开关）计划单列表每行显示该计划关联采购订单的汇总到货进度；数据由 `POST /api/psi/plans-purchase-progress` 批量取回，无关联采购订单的行不展示 |
| `materialLossEnabled` | 计划详情「用料清单」显示「损耗」列，按物料行填写损耗百分比；理论总需量按 `(1 + 损耗%/100)` 放大，联动缺料数/计划用量/采购数量。损耗率按计划单持久化于 `PlanOrder.customData.materialLossRates`（`Record<rowKey, number>`，rowKey = `materialId-nodeId-parentId`，百分比值）（仅计划单 UI） |
| `splitPlanEnabled` | 计划详情底部显示「拆单」；每次拆出 1 条新计划（`POST /api/plans/:id/split`），单号 `{源}-1`…`-99`（仅计划单 UI） |

`MaterialPanelSettings` / `OutsourceFormSettings` / `ReworkFormSettings` 另有 `onlyShowNotCompletedOrder?: boolean`（默认 `false`）：关联工单模式下主列表等按 `dispatchStatus=COMPLETED` 隐藏已完成工单；外协「待收回清单」与各类历史流水弹窗不受此开关影响。详见 `docs/01-business-rules.md` §3.9。

---

## 5. BOM (BOM)

```ts
interface BOM {
  id: string;
  name: string;
  parentProductId: string;
  variantId?: string;   // 如 single-{productId}
  nodeId?: string;      // 工序节点
  version: string;
  items: BOMItem[];     // { productId, quantity, useShortageOnly? }
}
```

**关联**：`Product.variants[].nodeBOMs` 为 `{ [nodeId]: bomId }`，按工序绑定 BOM。`Product.variants[].nodeUnitWeights` 为 `{ [nodeId]: number }`（kg），按规格×工序维护单件标准重量，供扫码称重校验。

### 5.1 开发款式 BOM（DevBom）

与产品 BOM 同形，见 `shared/types.ts` 中 `DevBomDto` / `DevBomItemDto`：

| 字段 | 说明 |
|------|------|
| `parentStyleId` | 开发款式 id |
| `variantId` | 可选；多变体时为 `DevStyleVariant.id`；单 SKU 时为空 |
| `nodeId` | 大货工序节点 id（`GlobalNodeTemplate`，非样品开发 `DevStage`） |
| `items` | 子件物料行 |

`DevStyleVariant.nodeBoms` 与 `ProductVariant.nodeBoms` 同形。发布大货时拷贝为 `Bom`，并重新生成 `bom-*` id 写入产品变体 `nodeBoms`。

`DevStyle.defaultStageNames`（Json 字符串数组）：款式创建时配置的默认开发流程节点名。创建款式不再自动建头样；新增首个样品（头样）时带出这套默认节点。开发域 `DevStyle` / `DevSample` / `DevBom` / `DevStageTemplate` / `DevLog` 均有 `createdByUserId`（创建时后端写入，本阶段仅关联，见 `docs/01` §5.6.2）。`DevStyle.imageThumb`：列表缩略图（由 `imageUrl` 生成）；`GET /dev/styles` 列表 omit 原图与节点附件/文件字段二进制，详情 `GET /dev/styles/:id` 返回完整数据。

`DevSample` 增加可选 `colorId` / `sizeId`：开发样品（头样与新增样品轮次）绑定**单一**「颜色×尺码」组合，取自款式 `DevStyleVariant`。款式配置了颜色尺码（存在 variants）时为必填，且组合须命中某条 variant；款式无颜色尺码时为空。

### 5.2 开发节点模板字段（DevStageTemplateField）

与工序节点库 `GlobalNodeTemplate.reportTemplate`（`ReportFieldDefinition`）同形，持久化于关系表 `dev_stage_template_fields`：

| 字段 | 说明 |
|------|------|
| `label` | 登记项标签 |
| `type` | `text \| date \| select \| file`，默认 `text` |
| `options` | 下拉选项 JSON 数组（`type=select`） |
| `dateWithTime` | 日期含时分（`type=date`） |
| `dateAutoFill` | 打开登记表单自动填入当前日期/时间 |
| `required` | 是否必填 |
| `order` | 排序 |

样品节点登记时按节点名匹配模板，渲染对应控件；值落 `dev_stage_fields.value` + `type`。

---

## 6. 产品 (Product)

详见 `types.ts`。核心：`categoryId`、`variants`、`milestoneNodeIds`（标准生产路线）、`nodeRates`（仅对工序节点开启计件工价的工序）、`categoryCustomData`。工价单位为元/件，仅当工序 `enablePieceRate` 为 true 时在产品与 BOM、计划详情中显示。

| 字段 | 说明 |
|------|------|
| `enabled` | 是否启用，默认 `true`；禁用后不在 `SearchableProductSelect` 等商品选择组件中出现（已选中的禁用产品仍显示名称） |
| `processLocked` | **运行时只读**（API 计算，不落库）：产品模式且已有非 `PENDING_PROCESS` 工单且 `milestoneNodeIds` 非空时为 `true`，表示工序路线不可再改 |

### 6.1 产品分类 (ProductCategory)

| 字段 | 说明 |
|------|------|
| `hasSalesPrice` | 是否录入标准销售单价 |
| `hasPurchasePrice` | 是否录入参考采购单价；开启时须同时 `linkPartner=true` |
| `linkPartner` | 是否关联合作单位（产品档案首选供应商；开发款式 `customerName`） |
| `hasColorSize` | 颜色尺码（与 `hasBatchManagement` 互斥） |
| `hasBatchManagement` | 批次管理 |
| `customFields` | 分类扩展字段 |

历史数据：`hasPurchasePrice=true` 的分类在 migration 中回填 `linkPartner=true`。

---

## 7. 生产订单 (ProductionOrder)

```ts
interface ProductionOrder {
  id: string;
  orderNumber: string;
  planOrderId?: string;   // 来源计划 id
  parentOrderId?: string; // 父工单 id，子工单使用
  bomNodeId?: string;     // 来源 BOM 工序节点
  sourcePlanId?: string;
  productId: string;
  productName: string;
  sku: string;
  items: OrderItem[];
  customer: string;
  startDate: string;
  dueDate: string;
  status: OrderStatus;
  milestones: Milestone[];
  priority: 'High' | 'Medium' | 'Low';
  /**
   * 派发完成状态（持久化字段，DB 列 `dispatch_status` / `dispatch_status_manual`）。
   * 由 STOCK_IN 入库累计自动推进；用户在工单中心点击徽章可手动覆盖。
   * 仅「关联工单模式」UI 展示徽章；产品模式不展示但字段仍写入。详见 `docs/01-business-rules.md §3.10`。
   */
  dispatchStatus?: OrderDispatchStatus;        // 'IN_PROGRESS' | 'COMPLETED'，默认 IN_PROGRESS
  dispatchStatusManual?: boolean;              // true 时自动入库逻辑跳过该工单
  createdByUserId?: string; // 制单人账号 ID：后端创建时写入；本阶段仅关联（见 docs/01 §5.6.2）
}
```

**关联**：`parentOrderId` 建立父子工单关系；`planOrderId` 用于补充下达时查找已有父工单。

---

## 8. 生产操作记录 (ProductionOpRecord)

```ts
interface ProductionOpRecord {
  id: string;
  type: ProdOpType;  // STOCK_IN | STOCK_OUT | OUTSOURCE | REWORK | SCRAP
  orderId: string;   // 关联工单，删除工单前需先删除关联记录
  productId: string;
  variantId?: string;
  quantity: number;
  reason?: string;
  partner?: string;
  operator: string;
  /** 制单人账号 ID：后端创建时写入；与 operator 展示名分离（见 docs/01 §5.6.2） */
  createdByUserId?: string;
  timestamp: string;
  status?: string;
  nodeId?: string;       // 外协/返工：工序；返工时为返工目标工序；SCRAP 为报损所在工序
  sourceNodeId?: string; // 返工专用：不良品来源工序（报工所在工序），用于从待处理不良中扣减
  reworkNodeIds?: string[]; // 返工专用：返工目标工序 id 列表（多选时）
  weight?: number;                         // 仅当 node.enableWeightOnReport 时写入，本次交货总重量 (kg)
  materialBreakdown?: MaterialBreakdownRow[]; // 按 BOM 占比把 weight 拆成各子物料实际消耗的快照
  batchNo?: string; // 领料出库 STOCK_OUT / 退料 STOCK_RETURN / 外协物料类流水：批次号（与 PSI 行 batchNo 对齐）
  /** 协作元数据、单据级自定义字段等；Prisma 列 `collab_data` JSON；形状见 `shared/types.ts` 的 `ProductionOpCollabData` */
  collabData?: Record<string, unknown>;
}
```

**`collabData`**：单一事实源类型为 `shared/types.ts` 中的 `ProductionOpCollabData`（与 `Record<string, unknown>` 交叉）；常见键见 [`docs/04-migration-checklist.md`](./04-migration-checklist.md)「流水自定义 collabData 键映射」。

**说明**：领料出库、外协、返工、报损、生产入库通过 `orderId` 关联工单；`orderId` 为可选时表示关联产品模式，详见 [05-production-link-mode.md](./05-production-link-mode.md)。**报损 (SCRAP)**：记录不良品报损数量，工单详情各工序报工汇总中展示「报损」列。**返工 (REWORK)**：`sourceNodeId` 为不良来源工序，`nodeId`/`reworkNodeIds` 为返工目标工序（可多选）。

**批次**：`PsiRecord` 采购类行字段为 `batchNo`（API）；持久化与打印上下文与 `ProductionOpRecord.batchNo` 一致，用于按批结存与扣减。

**按重量报工（`GlobalNodeTemplate.enableWeightOnReport`）**：
- 工序级开关。开启后，对应工序的**工单报工 / 外协收货**两个入口会额外录入 `weight`（单位 kg）。返工报工不录入重量。
- BOM 子项可配置 `excludeFromWeightShare` 排除辅料后，其余子项按 `quantity` 自动派生占比，`weight` 被拆成 `materialBreakdown: { materialProductId, materialName, ratio, actualWeight, theoreticalQty? }[]` 写入 `ProductionOpRecord` + 同步派生的 `MilestoneReport` / `ProductProgressReport`。
- `StockMaterialPanel` / 工单详情「生产物料」的「报工耗材」列：内部按工序分别累加 `MatRow.theoryCost`（未开称重）与 `MatRow.actualCost`（开启称重），展示时合计为一列；"结余" = 净领用 − 报工耗材。
- 详细业务规则见 [01-business-rules.md §5.4](./01-business-rules.md)。

**扫码称重（`GlobalNodeTemplate.enableScanWeighing`）**：
- 工序级开关，独立于 `enableWeightOnReport`。开启后（且追溯码插件开启），**工单报工 / 外协收货**的扫码会话顶部显示电子秤捕获框，并按「单件标准重量 × 数量」与实测重量做理论/实测比对（超容差仅告警，不拦截）。
- **本身不落库重量**：只负责秤框与比对。若该工序**同时**开启 `enableWeightOnReport`，扫码会话累计实测总重会自动同步到报工 / 收货表单的交货重量字段（仍可手改），最终由 `enableWeightOnReport` 链路写入 `weight` + `materialBreakdown`。（返工报工扫码不使用本开关。）
- 存量迁移：原 `enableWeightOnReport=true` 的工序回填 `enableScanWeighing=true`，保留上线前行为。

---

## 9. 产品工序进度 (ProductMilestoneProgress)

关联产品模式下使用，用于存储产品 × 工序维度的报工进度。

```ts
interface ProductMilestoneProgress {
  id: string;
  productId: string;
  variantId?: string;  // 多规格产品按规格存储
  milestoneTemplateId: string;
  completedQuantity: number;
  reports?: MilestoneReport[];
  updatedAt?: string;
}
```

**报工审核字段**（`MilestoneReport` / `ProductProgressReport`，枚举 `ReportApprovalStatus` 见 `shared/types.ts`）：

| 字段 | 说明 |
|------|------|
| `approvalStatus` | `APPROVED`（默认/工单中心即时）· `PENDING`（小程序 Tab 自报工）· `REJECTED` |
| `approvedAt` / `approvedBy` | 审核通过或驳回的时间与操作人 |
| `rejectedReason` | 驳回原因（可选） |
| `createdByUserId` | 提交报工的登录账号 ID（与工人 `workerId`/`operator` 分离；见 `docs/01` §5.6.2） |

`completedQuantity` 仅汇总 `APPROVED`；可报占用合计 `APPROVED + PENDING`。

详见 [05-production-link-mode.md](./05-production-link-mode.md)。

---

## 10. 自定义扩展字段类型（与计划单一致）

`ReportFieldDefinition.type` 的取值见 `shared/types.ts` 中的 `CustomDocFieldType`：**`text` | `date` | `select` | `file` | `knowledge`**。

- **`knowledge`（资料库）**：填值时从资料库中选择一篇文档，存值为 JSON 字符串 `{"id":"<docId>","title":"<标题快照>"}`（解析见 `utils/knowledgeFieldValue.ts`）。`title` 仅作离线/列表展示快照，查看时以 `id` 实时读取资料库文档；选择/预览复用 `components/knowledge/KnowledgeDocPickerModal.tsx`。
- 各处可用类型由组件 `allowedTypes` 控制：**产品分类扩展字段**（`CategoriesTab`）开放全部含 `knowledge`；**工序节点库报工页展示内容**（`NodesTab` 的 `reportDisplayTemplate`）开放 `text`/`file`/`knowledge`；合作单位分类、财务分类、计划单单据等沿用默认 `text`/`date`/`select`/`file`，不含 `knowledge`。
- 历史 JSON 中若仍存在 `number`，加载与归一化时视为 **`text`**；若存在 **`boolean`**，定义会规范为 **`select`**，缺省选项为 `['是','否']`（已有 `options` 则保留）。
- 工序 **`reportDisplayTemplate`**（报工页只读展示）保留 **文本 / 附件 / 资料库** 语义：归一化时非 `text`/`file`/`knowledge` 的项会降级为 **`text`**，与报工弹窗只读区展示逻辑一致。
- 前端在 `appDataLoadCore` / 设置保存链路对 `customFields`、`reportTemplate`、`reportDisplayTemplate` 做归一化；设置 API 写入时对上述 JSON 数组做 Zod 校验，拒绝再写入 `number`/`boolean` 类型字面量。

---

## 待办事项 `todo_items`（`todo_reminder` 插件）

个人待办，按 `tenantId + userId` 作用域。模型 `TodoItem`（`backend/prisma/schema.prisma`），共享 DTO `TodoItemDTO` 与枚举 `TodoSourceType` / `TodoStatus` 在 `shared/types.ts`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `tenantId` / `userId` | uuid | 租户 + 归属人（FK `tenants` / `users`，级联删除） |
| `sourceType` | varchar(40) | `standalone` / `production_order` / `plan` / `product` / `outsource` / `rework` / `purchase_order` / `purchase_bill` / `sales_order` / `sales_bill` / `dev_stage` / `dev_bom` |
| `sourceId` | varchar(50)? | 关联单据 id；`standalone` 为空 |
| `sourceDocNo` / `sourceTitle` | varchar? | 单号 / 标题快照（列表展示，免跨表） |
| `href` | text? | 跳转路径快照（消息中心/列表跳单据） |
| `note` | text | 内容备注（≤2000，`TODO_NOTE_MAX_CHARS`） |
| `remindEnabled` | bool | 是否定时提醒 |
| `remindAt` | timestamptz? | 提醒时间（开启时必填、需为将来） |
| `remindedAt` | timestamptz? | 已提醒标记，重设提醒时清空 |
| `status` | varchar(20) | `open` / `done` |

索引：`(tenant_id,user_id,status)`、`(tenant_id,user_id,remind_enabled,remind_at)`。迁移：`20260626120000_add_todo_items`。

---

*类型定义以 `types.ts` 为准。表设计时需考虑外键、索引及迁移时的数据导入。*
