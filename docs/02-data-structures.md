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
| | 工序节点库 | globalNodes |
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
  nodePricingModes?: Record<string, ProcessPricingMode>;
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

详见 `types.ts`。核心：`categoryId`、`variants`、`nodeRates`、`nodePricingModes`、`categoryCustomData`。

---

## 7. 生产订单 (ProductionOrder)

```ts
interface ProductionOrder {
  id: string;
  orderNumber: string;
  planOrderId?: string;
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

---

## 8. 待补充

- [ ] 生产操作记录 (ProductionOpRecord) 详细结构
- [ ] 其他新增实体

---

*类型定义以 `types.ts` 为准。表设计时需考虑外键、索引及迁移时的数据导入。*
