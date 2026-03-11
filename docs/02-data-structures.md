# 数据结构文档

> 实体字段、关联关系、localStorage 存储键。迁移到数据库时需设计对应表结构。

---

## 1. 全局状态 (App.tsx)

| 存储键 | 类型 | 说明 |
|--------|------|------|
| products | `Product[]` | 产品主数据 |
| orders | `ProductionOrder[]` | 生产订单 |
| plans | `PlanOrder[]` | 计划单 |
| psiRecords | `any[]` | 进销存记录（采购订单、采购单、销售单、盘点、调拨等） |
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
| printSettings | `PrintSettings` | 打印模板配置 |
| planFormSettings | `PlanFormSettings` | 计划单表单配置 |

### 1.1 系统设置 / 基本信息与全局 state 对应

| 入口 | 子模块 | 管理的存储键 |
|------|--------|--------------|
| **系统设置** | 产品分类管理 | categories |
| | 合作单位分类 | partnerCategories |
| | 工序节点库 | globalNodes（含 reportTemplate、enablePieceRate） |
| | 仓库分类管理 | warehouses |
| **基本信息** | 产品与 BOM | products, boms |
| | 合作单位 | partners |
| | 工人管理 | workers |
| | 设备管理 | equipment |
| | 公共数据字典 | dictionaries |

---

## 2. 进销存记录 (psiRecords)

**统一结构**：每条记录有 `type` 字段区分业务类型。

| type | 说明 | 关键字段 |
|------|------|----------|
| PURCHASE_ORDER | 采购订单 | docNumber, partner, partnerId, productId, variantId?, quantity, purchasePrice, amount, dueDate, lineGroupId |
| PURCHASE_BILL | 采购单 | docNumber, partner, warehouseId, productId, variantId?, quantity, purchasePrice, sourceOrderNumber?, sourceLineId?, lineGroupId |
| SALES_BILL | 销售单 | docNumber, warehouseId, productId, variantId?, quantity |
| STOCKTAKE | 盘点 | warehouseId, productId, actualQuantity |
| TRANSFER | 调拨 | fromWarehouseId, toWarehouseId, productId, quantity |

**lineGroupId**：同一次添加的明细共用，用于列表/详情按组展示。  
**sourceOrderNumber / sourceLineId**：采购单引用采购订单时记录来源，用于计算已入库数量。

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
  dueDate: string;
  status: PlanStatus;
  customer: string;
  priority: 'High' | 'Medium' | 'Low';
  assignments?: Record<string, NodeAssignment>;
  customData?: Record<string, any>;
  createdAt?: string;
  nodePricingModes?: Record<string, ProcessPricingMode>;  // 已弃用，仅保留计件（元/件）
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

**关联**：`Product.variants[].nodeBOMs` 为 `{ [nodeId]: bomId }`，按工序绑定 BOM。

---

## 6. 产品 (Product)

详见 `types.ts`。核心：`categoryId`、`variants`、`nodeRates`（仅对工序节点开启计件工价的工序）、`categoryCustomData`。工价单位为元/件，仅当工序 `enablePieceRate` 为 true 时在产品与 BOM、计划详情中显示。

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
}
```

**说明**：领料出库、外协、返工、报损、生产入库通过 `orderId` 关联工单；`orderId` 为可选时表示关联产品模式，详见 [05-production-link-mode.md](./05-production-link-mode.md)。**报损 (SCRAP)**：记录不良品报损数量，工单详情各工序报工汇总中展示「报损」列。**返工 (REWORK)**：`sourceNodeId` 为不良来源工序，`nodeId`/`reworkNodeIds` 为返工目标工序（可多选）。

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

*类型定义以 `types.ts` 为准。表设计时需考虑外键、索引及迁移时的数据导入。*
