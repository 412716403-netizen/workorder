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
| `tenant_memberships.preferences` | `dashboardWorkbench` | `WorkbenchConfig` | 用户个性化工作台（多 Tab + 每页 layout） |
| `system_settings` | `featurePlugins` | `Record<string, boolean>` | 租户级功能插件开关 |
| `platform_announcements` | — | 行级表 | 平台 admin 发布的全租户公告（最多 50 条，发布人展示「系统」） |

类型定义见 `shared/workbench.ts`、`shared/dashboardMessages.ts`；到期提醒逻辑见 `shared/tenantExpiryReminder.ts`；API 见 `GET/PUT /api/dashboard/workbench`、`GET/POST/DELETE /api/dashboard/messages`（仅平台 admin）、`GET /api/dashboard/notifications`。

### 1.7 资料库

| 表 | 租户 | 说明 |
|------|------|------|
| `knowledge_folders` | `tenant_id` | 文件夹树，`parent_id` 自关联 |
| `knowledge_documents` | `tenant_id` | 文档标题 + Tiptap HTML 正文 `content` |
| `knowledge_assets` | `tenant_id` | 图片二进制 `data`（BYTEA），文档正文引用 `/api/knowledge-base/assets/:id`；正文更新/删文档时 diff 清理无引用 asset |

DTO 见 `shared/types.ts`（`KnowledgeFolderDto`、`KnowledgeDocumentSummaryDto`、`KnowledgeDocumentDto`）。`GET /knowledge-base/tree` 与 `GET /knowledge-base/documents`（列表/搜索）仅返回摘要（无 `content`）；单篇正文走 `GET /knowledge-base/documents/:id`。更新文档可传 `expectedUpdatedAt`（乐观锁，冲突 409）。删除前 `GET /documents/:id/references` 检查产品/开发款引用。图片不支持 SVG；正文保存时 HTML 白名单消毒。API 见 `/api/knowledge-base/*`。

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
**sourceOrderNumber / sourceLineId**：采购入库引用采购订单时记录来源，用于计算已入库数量。  
**PURCHASE_ORDER.customData**：生产计划详情生成采购订单时写入 `sourcePlanId`、`sourcePlanNumber`（键名见 `shared/types.ts` 中 `PSI_PO_CUSTOM_DATA_SOURCE_*`），并自动写入 `relatedProductId` 为**该计划单的产品** `productId`（与表单「关联产品」一致，便于进销存列表/详情展示）；手工新建单可另选或留空。

---

## 3. 财务记录 (FinanceRecord)

```ts
interface FinanceRecord {
  id: string;
  type: 'RECEIPT' | 'PAYMENT' | 'RECONCILIATION' | 'SETTLEMENT';
  amount: number;
  relatedId?: string;
  partner: string;
  operator: string;
  timestamp: string;
  note?: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
}
```

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

`PlanListDisplaySettings`（`planFormSettings` / `orderFormSettings.listDisplay` 共用形状）：

| 字段 | 说明 |
|------|------|
| `showDeliveryDate` | 计划列表/表单/打印交期；工单模式外协与工单中心交期列 |
| `onlyShowNotCompleted` | 列表默认隐藏已完成：计划单排除派生 `COMPLETED`；工单中心排除 `dispatchStatus=COMPLETED`（仅关联工单模式 UI） |
| `showPurchaseProgress` | 计划单列表每行显示该计划关联采购订单的汇总到货进度（单一百分比，迷你进度条），不显示物料明细；数据由 `POST /api/psi/plans-purchase-progress` 批量取回，无关联采购订单的行不展示（仅计划单 UI） |
| `materialLossEnabled` | 计划详情「用料清单」显示「损耗」列，按物料行填写损耗百分比；理论总需量按 `(1 + 损耗%/100)` 放大，联动缺料数/计划用量/采购数量。损耗率按计划单持久化于 `PlanOrder.customData.materialLossRates`（`Record<rowKey, number>`，rowKey = `materialId-nodeId-parentId`，百分比值）（仅计划单 UI） |

`MaterialPanelSettings` / `OutsourceFormSettings` / `ReworkFormSettings` 另有 `onlyShowNotCompletedOrder?: boolean`（默认 `false`）：关联工单模式下主列表等按 `dispatchStatus=COMPLETED` 隐藏已完成工单；外协「待收回清单」与各类历史流水弹窗不受此开关影响。详见 `docs/01-business-rules.md` §3.9。
  status: PlanStatus;
  customer: string;
  priority: 'High' | 'Medium' | 'Low';
  assignments?: Record<string, NodeAssignment>;
  customData?: Record<string, any>;
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

*类型定义以 `types.ts` 为准。表设计时需考虑外键、索引及迁移时的数据导入。*
