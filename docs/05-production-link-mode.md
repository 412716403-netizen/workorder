# 生产关联模式需求规格

> 定义「关联工单」与「关联产品」两种生产关联模式，覆盖计划单、工单、领料、报工、数据模型及迁移规则。便于后期开发实现。

---

## 1. 概述与两种模式对比

| 维度 | 关联工单 (order) | 关联产品 (product) |
|------|------------------|--------------------|
| **计划单** | 显示客户、交期 | 不显示客户，按产品维度 |
| **工单结构** | 保留父子工单 | 下达后扁平化，无父子 |
| **工单中心** | 按父子工单分组 | 按产品分组 |
| **领料/报工/外协/返工/入库** | 关联工单 | 关联产品 |
| **进度归属** | `ProductionOrder.milestones` | `ProductMilestoneProgress` |
| **关注闭环** | 单工单完工 | 产品总下单量、产品各工序总进度 |

### 1.1 多规格产品规则（两种模式通用）

| 场景 | 规则 |
|------|------|
| 报工 | 按规格（如 黑色-M、白色-L）；需选择规格后报工 |
| 领料 / 出入库 | 按产品，不按规格细分 |
| 进度存储 | 按规格；ProductMilestoneProgress 含 variantId；关联工单模式下 order.milestones 按 item/variant 存储 |

---

## 2. 系统配置

### 2.1 配置项

| 键 | 类型 | 取值 | 默认 |
|----|------|------|------|
| productionLinkMode | `'order' \| 'product'` | order / product | order |

**默认与首次**：新安装/新租户默认 `order`（关联工单），保持与现有实现兼容；不需要首次进入生产模块时的引导选择。

### 2.2 存储

纳入持久化配置，与 `printSettings`、`planFormSettings` 同级存储（如 `usePersistedState` 或后端 settings 表）。

### 2.3 配置入口

系统设置中增加「生产关联模式」配置项，建议放在 `SettingsView` 或单独「生产业务配置」区域。

### 2.4 变更规则

- 配置修改后**仅影响新产生的数据**
- 历史数据保持不变，**无需数据迁移**
- 统计时按 `orderId` 是否为空区分处理

---

## 3. 关联工单模式 (order)

当前实现即为此模式，各模块行为见 [01-business-rules.md](./01-business-rules.md) 第 3 节。

| 模块 | 行为 |
|------|------|
| 计划单 | 显示客户、交期；支持父子计划 |
| 计划转工单 | 保留父子工单结构 |
| 工单中心 | 按父子工单分组，支持收缩/展开 |
| 领料出库 | orderId 必填 |
| 报工 | 按工单工序报工，写入 `ProductionOrder.milestones` |
| 外协/返工/生产入库 | orderId 必填 |
| 工单删除 | 校验报工、ProductionOpRecord、子工单 |
| 经营看板 | 按工单统计（活跃订单数、完成率等） |
| 打印 | 领料/入库单打印工单号；计划单/工单显示客户等字段 |
| 工单详情 | 单张工单详情（工单视角） |

---

## 4. 关联产品模式 (product)

### 4.1 计划单

- 不显示客户字段（创建/编辑/列表/详情均隐藏）
- 每个计划仅代表产品维度，不做客户区分
- `planFormSettings` 中 customer 在 product 模式下强制不展示

### 4.2 计划转工单

- 仍支持父子计划下达
- 下达后**取消父子工单结构**：所有工单 `parentOrderId` 置空
- **一子计划 = 一工单**：主计划、每个子计划（如毛衣、全毛黑色、毛条）各自生成一条独立工单
- 生成多条扁平工单，工单中心按产品分组展示

### 4.3 工单中心

- **按产品分组**：同一产品的多个工单归为一组
- 分组标题：「产品名（共 N 条工单）」
- 组内为扁平工单列表，无父子缩进

### 4.4 领料出库 / 外协 / 返工 / 生产入库

- `orderId` 为空
- 表单只选产品，不选工单
- **按产品记录**，不按规格细分（如 领料 毛衣 100 件，不区分 黑色-M / 白色-L）

### 4.5 报工

- 报工目标：产品 + 规格 + 工序（不选工单）；多规格产品需选择规格（如 黑色-M）
- 进度写入 `ProductMilestoneProgress`（含 variantId），不写入 `ProductionOrder.milestones`
- 工单中心展示时，按产品聚合 `ProductMilestoneProgress` 显示各工序总进度；多规格时按规格汇总

### 4.6 工单删除

- **允许自由删除工单**（无需校验报工、ProductionOpRecord、子工单）
- `ProductionOpRecord` 不关联工单，不参与删除校验
- `ProductMilestoneProgress` 独立于工单，删除工单不删除产品进度
- **删除后需重算产品进度展示**：总计划量 = 剩余工单数量之和，完成率等随计划量变化而更新

### 4.7 闭环关注点

- **总下单量**：某产品下所有计划/工单的数量汇总
- **工序进度**：按「产品 + 工序」从 `ProductMilestoneProgress` 汇总
- **展示**：工单中心按产品分组，每组展示该产品总计划量、各工序总完成量

### 4.8 经营看板

- **关联工单模式**：按工单统计（活跃订单数、工单完成率等）
- **关联产品模式**：改为按产品统计（如有生产任务的产品数、产品级完成率）
- 部分统计指标在两种模式下口径不同，展示逻辑随模式变化

### 4.9 打印

- **领料单、生产入库单等**：关联产品模式下不打印工单号，打印产品；关联工单模式打印工单号
- **计划单、工单**：字段随模式变化（如关联产品模式下计划单不显示客户）
- 打印内容根据当前模式和单据内容动态调整

### 4.10 工单/产品详情页

- **关联工单模式**：点击工单进入单张工单详情（工单视角）
- **关联产品模式**：点击工单或产品进入「产品生产详情」，汇总该产品下所有工单及总体进度（产品视角）

---

## 5. 数据模型

### 5.1 ProductionOpRecord 变更

```ts
// types.ts
export interface ProductionOpRecord {
  id: string;
  type: ProdOpType;
  orderId?: string;   // 改为可选；关联工单时必填，关联产品时为空
  productId: string;
  variantId?: string;
  quantity: number;
  reason?: string;
  partner?: string;
  operator: string;
  timestamp: string;
  status?: string;
}
```

### 5.2 ProductMilestoneProgress（新增）

关联产品模式下，产品 × 工序维度的进度独立存储。

```ts
// types.ts 新增
export interface ProductMilestoneProgress {
  /** 唯一标识 */
  id: string;
  /** 产品 id */
  productId: string;
  /** 规格 id（多规格产品必填；单规格产品可为空） */
  variantId?: string;
  /** 工序模板 id（对应 GlobalNodeTemplate.id） */
  milestoneTemplateId: string;
  /** 该产品（该规格）在该工序的累计完成数量 */
  completedQuantity: number;
  /** 报工流水（可选，用于追溯） */
  reports?: MilestoneReport[];
  /** 最后更新时间 */
  updatedAt?: string;
}
```

**说明**：

- 每个「产品 + 规格 + 工序」组合对应一条记录；单规格产品 variantId 为空
- `reports` 可复用现有 `MilestoneReport` 结构

### 5.3 ProductionOrder 在关联产品模式下

- 下达时 `parentOrderId` 不写入或置空
- `milestones` 可不使用或仅存计划量；实际完工数据在 `ProductMilestoneProgress`

---

## 6. 迁移说明

### 6.1 从关联工单切换到关联产品

| 数据 | 处理方式 |
|------|----------|
| 已有 ProductionOpRecord | 保留 orderId，新记录 orderId 为空 |
| 已有 ProductionOrder.milestones | 可**一次性迁移**到 ProductMilestoneProgress |
| 新报工 | 写入 ProductMilestoneProgress |

**迁移步骤（可选）**：

1. 遍历所有 `ProductionOrder`
2. 按 `(productId, variantId, milestone.templateId)` 聚合 `completedQuantity` 及 `reports`（多规格产品按 item.variantId 区分）
3. 写入或更新 `ProductMilestoneProgress`
4. 原 `order.milestones` 可保留作历史，或置空

### 6.2 从关联产品切换到关联工单

| 数据 | 处理方式 |
|------|----------|
| 已有 ProductMilestoneProgress | 保留，历史进度无法关联到具体工单 |
| 已有 ProductionOpRecord（无 orderId） | 仅作历史保留，不再参与新统计；新记录必填 orderId |
| 新报工 | 写入 ProductionOrder.milestones |

### 6.3 统计兼容

- **按产品统计**：聚合 `productId`；切换为关联工单后，无 orderId 的历史记录仅保留，不参与新统计
- **按工单统计**：过滤 `orderId != null`
- **产品工序进度**：关联工单模式从 order.milestones 聚合；关联产品模式从 ProductMilestoneProgress 读取
- **多规格**：报工按规格（variantId）；领料/出入库按产品；ProductMilestoneProgress 按 productId + variantId + milestoneTemplateId 存储

---

## 7. 待确认 / 待设计项

全部已确认，无待办。

| 序号 | 事项 | 说明 |
|------|------|------|
| ~~1~~ | ~~多规格产品 (variants)~~ | **已确认**：报工按规格（方案 B）；领料/出入库按产品；进度存储按规格含 variantId（见 4.4、4.5、5.2） |
| ~~2~~ | ~~计划转工单拆分规则~~ | **已确认**：一子计划 = 一工单，生成多条扁平工单（见 4.2） |
| ~~3~~ | ~~经营看板~~ | **已确认**：关联产品模式改为按产品统计（见 4.8） |
| ~~4~~ | ~~打印~~ | **已确认**：打印内容随模式和单据变化（见 4.9） |
| ~~5~~ | ~~工单详情页~~ | **已确认**：关联产品模式改为产品生产详情，汇总该产品下所有工单及总体进度（见 4.10） |
| ~~6~~ | ~~采购单关联~~ | **无需调整**：计划与采购单以计划单关联，与客户无关，关联产品模式下逻辑不变 |

### 7.1 后续扩展：外协管理、返工管理、生产入库

领料出库、外协管理、返工管理、生产入库均统一按 `productionLinkMode` 区分工单/产品：

- **关联工单**：表单必选工单，orderId 必填
- **关联产品**：表单只选产品，orderId 为空

后续新增或完善外协、返工、生产入库模块时，需按本文档 4.4 规则实现，与领料出库保持一致。

---

## 8. 实现位置索引

| 模块 | 文件 | 说明 |
|------|------|------|
| 配置存储 | App.tsx | 新增 productionLinkMode 状态 |
| 配置 UI | SettingsView.tsx 或新建 | 生产关联模式选择 |
| 经营看板 | DashboardView.tsx | product 模式按产品统计 |
| 打印 | 各打印逻辑 | 领料/入库单、计划单/工单字段随模式变化 |
| 计划单 | PlanOrderListView.tsx | product 模式下隐藏 customer |
| 计划转工单 | App.tsx onConvertToOrder | product 模式下 parentOrderId 置空 |
| 工单中心 | OrderListView.tsx | product 模式下按 productId 分组 |
| 工单/产品详情 | OrderDetailView.tsx 或新建 | product 模式为产品生产详情，汇总所有工单及总体进度 |
| 领料/外协/返工/入库 | ProductionMgmtOpsView.tsx | 根据 productionLinkMode 显示/隐藏工单选择，四类业务规则一致 |
| 报工写入 | OrderDetailView / 报工入口 | product 模式写入 ProductMilestoneProgress |
| 工单删除 | OrderDetailView.tsx handleDelete | product 模式允许自由删除，删除后重算产品进度展示 |

---

## 9. 开发实施计划

### 9.1 前置依赖

**必须先完成**：`productionLinkMode` 配置（App 状态 + Settings 配置入口），后续模块才能读取模式并分支。

### 9.2 开发顺序建议

| 阶段 | 任务 | 依赖 |
|------|------|------|
| 1 | 配置 productionLinkMode（存储、UI） | 无 |
| 2 | 计划单、计划转工单、工单中心 | 阶段 1 |
| 3 | 领料出库、报工、工单删除、工单/产品详情 | 阶段 1 |
| 4 | 经营看板、打印 | 阶段 1 |
| 5 | 外协、返工、生产入库（待开发模块） | 阶段 1，参考领料出库实现 |

### 9.3 重要：后续新增模块不会自动区分模式

**不会自动**。开发外协管理、返工管理、生产入库等新模块时，必须在实现时主动按 `productionLinkMode` 分支，否则只会支持一种模式。

**开发新模块时需做到**：

1. 读取 `productionLinkMode`（从 props 或 context）
2. 表单：关联工单时显示并必填工单选择；关联产品时隐藏工单、只选产品
3. 保存：orderId 在 product 模式下为空
4. 列表/统计：按模式选择按工单或按产品展示
5. 参考领料出库（ProductionMgmtOpsView）的实现方式

### 9.4 新模块开发检查清单

开发领料、外协、返工、生产入库等 ProductionOpRecord 相关模块时，确认：

- [ ] 表单根据 productionLinkMode 显示/隐藏工单选择器
- [ ] product 模式下 orderId 为空，productId 必填
- [ ] 列表展示能处理 orderId 为空（显示产品名等）
- [ ] 打印内容随模式变化（工单号 vs 产品）

---

*最后更新：补充开发实施计划，明确后续新增模块需主动实现模式分支。*
