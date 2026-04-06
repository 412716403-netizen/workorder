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
| 序列号文案 | `utils/serialLabels.ts` | `J-PLNxx-0001` / `B-PLNxx-0001` |

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

- 单品码前缀：`J`
- 批次码前缀：`B`

例如：

- `J-PLN12-0001`
- `B-PLN12-0003`

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
