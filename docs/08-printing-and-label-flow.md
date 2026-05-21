# 打印、标签与码管理链路说明

> 本文档说明打印模板、预览、标签打印、单品码、虚拟批次之间的关系。它的目标是把“打印不是单纯 UI，而是一条完整业务数据链路”这件事讲清楚。

## 1. 这条链路包含什么

当前打印相关能力不只是“把页面打出来”，而是包含：

- 打印模板设计
- 打印上下文字段解析
- 预览与实际打印
- 动态列表分页
- 单品码标签
- 虚拟批次标签
- 序列号展示规则

---

## 2. 主要组成

| 环节 | 代表文件 | 作用 |
|------|------|------|
| 模板定义 | `types.ts` | 定义 `PrintTemplate`、元素类型、上下文类型 |
| 模板编辑 | `views/PrintTemplateEditorView.tsx`、`components/print-editor/*` | 设计模板、调整元素 |
| 纸张渲染 | `components/print-editor/PrintPaper.tsx` | 把模板渲染成可预览 / 可打印纸张 |
| 打印触发 | `components/print-editor/PrintPreview.tsx` | 隐藏打印槽、浏览器打印、标签专用打印 |
| 占位符解析 | `utils/printResolve.ts` | 把 `{{计划.planNumber}}` 等解析成真实文本 |
| 列表分页 | `utils/printListPagination*` | 动态列表跨页分页 |
| 单品码转标签行 | `utils/printItemCodeRows.ts` | 把 `ItemCode[]` 转成打印行 |
| 批次码转标签行 | `utils/printVirtualBatch.ts` | 把 `PlanVirtualBatch` 转成打印上下文 |
| 序列号文案 | `shared/serialLabels.ts` | 单品码 `PLN47-1-1`；批次码 `PLN47-1` |

### 2.1 打印模版配置与历史系统模版 id 清理

- **`getConfig` / `updateConfig('printTemplates')`**：`shared/systemPrintTemplates.ts` 的 **`mergePrintTemplatesForTenantConfig`** / **`stripSystemPrintTemplatesForPersistence`** 在读写时过滤已废弃 id **`builtin-outsource-dispatch-v1`**（历史上曾代码统一下发的外协发出单模版，已删除），避免库内残留 JSON 仍出现在模版列表或写回数据库。
- **统一下发外协发出单**：读配置时合并内置模版 **`builtin-outsource-dispatch-v2`**（241×140mm；列表显示名含「（颜色尺码）」）；写入 `printTemplates` 时剔除该 id，由读时再次注入，避免与租户 JSON 重复落库。
- **统一下发外协收回单**：读配置时合并 **`builtin-outsource-receive-v2`**（241×140mm，动态列含单价/金额，表尾合计；显示名含「（颜色尺码）」）；持久化规则同上。
- **统一下发采购订单 / 销售订单（列表打印）**：读配置时合并 **`builtin-purchase-order-v2`**、**`builtin-sales-order-v2`**（241×140mm；占位符 `采购订单.*` / `销售订单.*`；显示名含「（颜色尺码）」）；持久化规则同上。
- **统一下发采购入库 / 销售单（进销存入库、出库单列表打印）**：读配置时合并 **`builtin-purchase-bill-v2`**、**`builtin-sales-bill-v2`**（241×140mm；占位符 `采购入库.*` / `销售单.*`，兼容 `采购单.*`；显示名含「（颜色尺码）」）；持久化规则同上。
- **统一下发生产物料详情打印**：读配置时合并 **`builtin-material-issue-v1`**（领料发出）、**`builtin-material-return-v1`**（生产退料）、**`builtin-outsource-material-issue-v1`**（外协领料发出）、**`builtin-outsource-material-return-v1`**（外协生产退料），241×140mm；占位符分别为 `领料发出.*`、`生产退料.*`、`外协领料发出.*`、`外协生产退料.*`；持久化规则同上。`normalizeMaterialFormSettings` 在未配置 `materialCenterPrint` 或某一子槽为 `undefined` 时，为该槽写入默认白名单（指向对应内置 id）。
- **统一下发返工管理详情打印**：读配置时合并 **`builtin-rework-defect-treatment-v1`**（处理不良单，版式参考外协发出）、**`builtin-rework-report-flow-v1`**（返工报工单，含工序列与颜色尺码矩阵）；占位符 `处理不良.*`、`返工报工.*`；持久化规则同上。`normalizeReworkFormSettings` 在未配置 `reworkCenterPrint` 或子槽为 `undefined` 时写入对应默认白名单。
- **统一下发计划单列表 / 单品码与批次码标签**：读配置时合并 **`builtin-plan-list-v1`**（A4，`planList`）、**`builtin-plan-label-v1`**（30×50mm，`planLabel`，单品码行占位符）与 **`builtin-plan-batch-label-v1`**（30×50mm，`planLabel`，`{{批次.*}}` 虚拟批次标签）；与其它锁定内置模版相同：列表标「系统」、不可删、不可直接可视化编辑保存，可复制为自有模版；持久化规则同上。若租户 `labelPrint.allowedTemplateIds` 误只含列表模版，`repairPlanLabelPrintWhitelistMissingPlanLabelTemplates` 会在加载时并入所有 `planLabel` 模版 id。
- **外协 / 进销存表单配置**：`normalizeOutsourceFormSettings` 等仅做字段归一化，并从 `outsourceCenterPrint.*.allowedTemplateIds` 中剔除已废弃 **`builtin-outsource-dispatch-v1`**；**不再**在归一化阶段自动写入内置模版 id。表单「打印模版」Tab 中的 **「可选模版（已加入）」** 与列表/详情 **「增加 / 管理模版」** 写入的 `allowedTemplateIds` 一致；若某 schema 将 **`hideOptionalTemplateList`** 设为 `true`，则隐藏芯片区（仅保留开关与「增加模版」），见 `PrintTemplateWhitelistCard`。

---

## 3. 打印主数据流

### 3.1 普通单据 / 标签打印

```text
业务数据(plan / order / product / list rows / virtualBatch)
        ->
PrintRenderContext
        ->
resolvePrintPlaceholders()
        ->
PrintPaper
        ->
PrintPreview / 浏览器打印
```

### 3.2 单品码标签

```text
ItemCode[] + 计划信息 + 规格字典
        ->
buildPrintListRowsFromItemCodes()
        ->
PrintListRow[]
        ->
PrintRenderContext.printListRows
        ->
模板动态列表 / 标签页打印
```

### 3.3 虚拟批次标签

```text
PlanVirtualBatch + 计划/产品/规格信息
        ->
buildVirtualBatchPrintRow()
        ->
PrintRenderContext.virtualBatch
        ->
模板占位符 {{批次.xxx}}
        ->
标签预览 / 打印
```

### 3.4 动态列表「颜色尺码数量」与 `colorSizeMatrixJson`

动态列表中列类型为「颜色尺码数量」时，每行 `printListRows` 可携带 `colorSizeMatrixJson`（JSON：`sizes[]` + `colorRows[].quantities[]`），由 `components/print-editor/DynamicListMatrixTable.tsx` 以 HTML 表格 + rowspan 渲染。

会在下列打印上下文的明细行中写入该字段（模板可选用矩阵列）：**销售单**、**计划单列表**、**采购订单 / 采购入库 / 销售订单**（与销售单一致为「货号块」一行，不再按规格拆多行；旧模板若依赖 `行.colorName` / `行.sizeName` 分列需改为矩阵列或 `行.qty` 等）、**外协发出与收回**、**返工报工与处理不良**、**生产退料与外协领料发出/外协生产退料**、**生产入库批次**、**报工批次**、**工单详情打印**。例外：**生产领料**（`materialIssuePrint`）仍为扁平行，**不**写入 `colorSizeMatrixJson`。

实现入口：`utils/buildSalesBillPrintContext.ts`（`buildSalesBillPrintListRowsByProductLine`、`buildMatrixJsonAndTotalQtyFromVariantLine`）、`utils/variantMatrixPrintRows.ts` 及各 `utils/build*PrintContext.ts`。

### 3.4.1 计划单动态列表「颜色物料数量」与 `colorMaterialMatrixJson`

列类型为「颜色物料数量」仅在 **计划单**模版编辑器中出现选项；明细行由 `utils/buildPlanPrintListRows.ts`（传入 `globalNodes`、`boms`、`products`）在每条 `printListRows` 上附带 `colorMaterialMatrixJson`。载荷为按 **生产路线顺序** 的 `nodeBlocks[]`：每块含 `nodeName`（工序节点标题行），下列计划中涉及的每种成品颜色两行——物料名称行与配比/用量行。渲染组件：`components/print-editor/DynamicListColorMaterialMatrixTable.tsx`。分页与列表垂直推挤与尺码矩阵共用 `matrixVisualSubRowCountForRow(row, cfg)`，以便模版切换矩阵类型时使用对应 JSON。

### 3.5 动态列表下方元素的垂直推挤

当列表实际内容高度超过画布上为该组件设定的高度时，**页眉 / 页脚不动**；**body 内**位于该动态列表**下方**（按 `y` 自上而下）的文本、线、图等元素会整体下移，下移量等于「内容所需高度 − 组件框高」，使模板里预留的相对间距在打印时仍成立。列表本身通过 `heightGrowMm` 增高以免裁切。

估算规则与分页一致：`utils/printListPagination.ts` 导出 `dynamicListHeaderHeightMm`、`DYNAMIC_LIST_DEFAULT_BODY_ROW_MM`；未设置 `bodyRowHeightMm` 时用默认 **6mm/行**（矩阵行按 `matrixVisualSubRowCountForRow` 累计子行数）。实现见 `components/print-editor/printBodyVerticalPush.ts`，由 `PrintPaper.tsx` 在预览/打印时应用。

---

## 4. 打印上下文怎么工作

`PrintRenderContext` 是打印链路里的核心中间层。

它负责承接这些业务对象：

| 上下文字段 | 含义 |
|------|------|
| `plan` | 计划单 |
| `order` | 工单 |
| `product` | 产品 |
| `milestoneName` | 工序名称 |
| `completedQuantity` | 完成数量 |
| `printListRows` | 动态列表行数据 |
| `labelPerRow` | 每行一页的标签打印模式 |
| `virtualBatch` | 批次码打印数据 |
| `page` | 当前页码 / 总页数 |

`utils/printResolve.ts` 会把占位符解析到这些字段上，例如：

- `{{计划.planNumber}}`
- `{{计划.dueDate}}`（计划交货日期；打印编辑器「插入字段」是否在「计划」分组中显示该项，与计划表单配置「列表显示 → 显示交货日期」开关一致）
- `{{工单.orderNumber}}`
- `{{产品.name}}`
- `{{系统.pageCurrent}}`
- `{{行.scanUrl}}`
- `{{批次.serialLabel}}`

---

## 5. 预览与真正打印的区别

### 5.1 预览

预览主要由 `PrintPaper.tsx` 完成：

- 按 mm 尺寸渲染纸张
- 处理页眉页脚
- 渲染文本、二维码、线条、图片、动态表格、动态列表
- 支持编辑器模式和真正输出模式

### 5.2 真正打印

`PrintPreview.tsx` 里有两种打印方式：

1. 普通模板打印：使用 `react-to-print`
2. 标签逐页打印：在隐藏 iframe / 新窗口中生成独立页面后调用浏览器打印

这就是为什么这套打印链路不是“把 React 组件截图打印”，而是**有专门输出策略**。

---

## 6. 单品码与批次码在打印中的角色

### 6.1 单品码 `ItemCode`

单品码打印时，会生成这些典型字段：

- `scanUrl`
- `scanToken`
- `serialNo`
- `serialLabel`
- `variantLabel`
- `colorName`
- `sizeName`
- `orderNumbers`
- `status`

### 6.2 虚拟批次 `PlanVirtualBatch`

虚拟批次打印时，会生成这些典型字段：

- `scanUrl`
- `scanToken`
- `sequenceNo`
- `serialLabel`
- `quantity`
- `planNumber`
- `orderNumbers`
- `productName`
- `sku`
- `variantLabel`
- `colorName`
- `sizeName`
- `status`

### 6.3 序列号规则

当前序列号展示约定：

- 单品码：`formatItemCodeSerialLabel` → **`{计划单号}-{批次序号}-{批次内件号}`**（如 `PLN47-1-1` 表示计划 PLN47、第 1 批、该批第 1 件）；无批次绑定的历史纯计划单品码仍为 `{计划单号}-{全局序号}`（如 `PLN47-12`）
- 批次码：`formatBatchSerialLabel` → **`{计划单号}-{批次序号}`**（如 `PLN47-1`，不再使用 `B-` 前缀）

例如：

- `PLN47-1-1`（单品码，绑定批次时）
- `PLN47-12`（纯计划单品码，无批次）
- `PLN47-1`（批次码）

---

## 7. 当前已知边界与风险

### 7.1 打印不是独立子系统

打印依赖很多上游业务数据：

- 计划单
- 工单
- 产品
- 动态列表行
- 单品码
- 批次码

所以它会受到这些上游字段变化影响，文档必须跟着更新。

### 7.2 占位符体系需要保持稳定

如果修改这些对象的字段命名或语义：

- `types.ts`
- `printResolve.ts`
- 单品码 / 批次码转换函数

就可能直接导致历史模板失效。

### 7.3 URL 规则必须统一

单品码和批次码打印中都会拼接扫码地址。  
如果扫码路由、前端访问路径、网关规则变动，需要一起检查：

- `utils/printItemCodeRows.ts`
- `utils/printVirtualBatch.ts`
- 对应扫码页面 / API 路径

---

## 8. 当前维护建议

1. 新增打印字段时，先定义它来自哪个业务对象，再补占位符解析
2. 新增标签能力时，优先复用 `PrintRenderContext`，不要绕开现有链路
3. 修改单品码 / 批次码字段时，同时检查打印转换函数
4. 修改扫码路径时，同时检查标签中的 `scanUrl`
5. 打印链路变更后，同步更新本文件和 `03-data-flow-calculations.md`

---

## 9. 一句话总结

当前打印系统本质上是一条：

**业务数据 -> 打印上下文 -> 占位符解析 -> 模板渲染 -> 浏览器输出**

的完整链路。  
单品码、虚拟批次、标签打印都已经是这条链路中的正式业务能力，不再只是前端小工具。

---

## 10. 码的消费侧：扫码报工 / 收货 / 入库 / 返工 / 追溯

### 10.1 扫码入口一览

| 场景 | 文件 | 入口位置 | 累加规则 |
|------|------|----------|----------|
| 工单报工 | `views/order-list/ReportModal.tsx` | 「本次完成数量」旁 `ScanBatchTrigger`（`showScanIntentToggle`，默认「批次码」） | 弹窗内可选「批次码 / 单品码」；规则与 `scanBatchIntent` 一致；单品 +1、批次 +`quantity`；计划校验与防重同下 |
| 返工报工 | `views/production-ops/ReworkReportSubmitModal.tsx` | 「扫码累加」旁 `ScanBatchTrigger`（同上） | 同上；产品须一致；按规格匹配有待返工的路径累加 |
| 外协收货 | `views/production-ops/OutsourceReceiveQuantityModal.tsx` | 「商品明细」标题栏旁 `ScanBatchTrigger`（同上） | 同上；在已选行中按 `productId` 匹配行，规格 key 使用 `__v__`（关联产品块）或 `\|`（工单按规格） |
| 生产入库 | `views/order-list/PendingStockPanel.tsx` | 入库弹窗内 `ScanBatchTrigger`（同上，矩阵/单量两处） | 同上；计划校验 + 矩阵写 `variantQuantities` / 否则 `singleQuantity` |
| 产品追溯 | `views/TraceView.tsx` | `App.tsx` 侧栏「切换企业」与主导航之间独立「扫码追溯」 | **无批量弹窗、无摄像头**：`ScanPanel`（`showCameraButton={false}`）仅扫码枪 + 粘贴，每扫一次即 `scan+trace` 刷新下方；再扫下一条码即切换为当前码的追溯信息 |

通用能力：`utils/scanPayload.ts`、`utils/scanBatchIntent.ts`（批量弹窗扫码方式归一化）、`hooks/useScanGun.ts`；**报工 / 返工 / 外协收货 / 生产入库**使用 `ScanBatchSessionModal` + `ScanBatchTrigger`（先收集列表再确认；列表行展示依赖 `resolveRowPreview`）。**产品追溯**使用 `ScanPanel`（即时查询，`suppressDispatchSounds` + 关闭摄像头）。`ScanInputButton` 供其他入口复用；摄像头依赖 `@zxing/browser`（`ScanInputButton`、`ScanPanel` 在 `showCameraButton` 为真时、`ScanBatchSessionModal` 在开启 `showCameraButton` 时）。

### 10.2 后端接口

| 接口 | 说明 |
|------|------|
| `GET /item-codes/scan/:token` | 单品码解析；返回 `kind: 'ITEM_CODE'`、`planOrderId`、`callerContext`；若码关联虚拟批次则含 **`batchScanToken`**（批次扫码方式下扫单品归一化用） |
| `GET /plan-virtual-batches/scan/:token` | 批次码解析；返回 `kind: 'VIRTUAL_BATCH'`、`planOrderId`、`callerContext` |
| `GET /item-codes/trace/:token` | 追溯时间轴（按产品 + 规格 + 计划树聚合） |
| `GET /plan-virtual-batches/trace/:token` | 同上（入口在 `itemCodes.service` 的 `traceVirtualBatch`） |

### 10.3 多级协作

- `verifyCollaborationAccess`（`backend/src/services/planTreeQuota.service.ts`）在 ACTIVE 的 `tenantCollaboration` 图上 **BFS**，最多 4 跳，结果约 **60s** 内存缓存。
- `callerContext` 由 `resolveCallerContext` + `collectPlanTreeFromNode` 计算：在码所属计划树中定位**扫码租户**对应的计划节点与工单号，便于乙方使用甲方原码。
- 本期**不做**协作侧批次拆分子码。

### 10.4 追溯粒度说明

报工与 `ProductionOpRecord` 当前**未**持久化 `itemCodeId` / `batchId`，因此 `trace` 时间轴为「同产品 + 规格 + 计划树」上的事件汇总，而非单件码专属轨迹。时间轴数据源含：`milestone_reports`（关联工单报工）、`product_progress_reports`（关联产品报工）、`production_op_records`（入库/外协/返工等）。若要单件级追溯，需在写入链路增加字段并回填。
