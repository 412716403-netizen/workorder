# 小程序 UI 约定

SmartTrack Pro 微信小程序采用 **企业蓝 + 卡片化 + 底部 Tab** 的 B2B 设计语言。新页面必须复用本目录下的 Token 与组件，禁止各页自行定义色值与布局。

## 设计 Token

单一事实源：[`miniprogram/styles/tokens.wxss`](../miniprogram/styles/tokens.wxss)

- 主色：`--color-primary`（#2F6BFF）
- 页面底：`--color-bg-page`（#F7F8FA）
- 卡片底：`--color-bg-card`（#FFFFFF）
- 圆角：`--radius-card`（24rpx）

全局样式按职责拆分：

| 文件 | 职责 |
|------|------|
| `styles/tokens.wxss` | CSS 变量 |
| `styles/base.wxss` | 页面壳、卡片、文字层级 |
| `styles/button.wxss` | 按钮 |
| `styles/list.wxss` | 列表行、状态胶囊 |
| `styles/form.wxss` | 表单输入 |
| `styles/qty-price-amount-summary.wxss` | 数量 / 单价 / 金额三列一行（参考外协收回） |

类名前缀使用 `st-*`（SmartTrack）。迁移期 `apple-*` 为别名，新代码禁止新增 `apple-*`。

## 可复用组件

目录：[`miniprogram/components/`](../miniprogram/components/)

| 组件 | 用途 |
|------|------|
| `page-header` | 自定义顶栏（企业名 / 标题） |
| `section-card` | 白卡片区块 + 标题行 |
| `stat-hero` | 蓝色渐变主指标卡 |
| `stat-row` | 三列次指标 |
| `icon-grid` | 4 列图标宫格入口 |
| `todo-item` | 待处理列表行 |
| `workbench-stat-card` | 首页工作台统计卡片（工序卡片 / KPI 摘要） |
| `tab-shell` | Tab 页统一壳：蓝色渐变顶栏 + 白色圆角内容区（应用 / 扫码 / 消息 / 我的） |
| `searchable-partner-select` | 合作单位 / 客户 / 加工厂（搜索 + 分类，底栏弹层） |
| `searchable-product-select` | 产品选择（搜索 + 分类 + SKU） |
| `matrix-qty-keyboard` | 色码矩阵数量自定义键盘 |
| `batch-return-input` | 采购入库批次（点击选择；弹窗内可选已有批次或输入新批号） |

## 页面壳类型

### A. Tab 页壳（首页 / 应用 / 扫码 / 消息 / 我的）

- `navigationStyle: custom`
- **蓝色渐变顶栏** + **白色圆角内容区**（首页自定义布局；其余 Tab 用 `tab-shell` 组件，样式见 [`styles/tab-shell.wxss`](../miniprogram/styles/tab-shell.wxss)）
- 顶栏安全区由 [`utils/tabShell.js`](../miniprogram/utils/tabShell.js) 计算
- 底部原生 `tabBar` 共 **5 项**，顺序：首页 → 应用 → **扫码（居中）** → 消息 → 我的（见 `app.json`）

### B. 流程页壳（登录 / 选企业 / 入驻）

- `navigationStyle: custom`
- 顶部 `page-header`（可选 `showBack`）
- `st-page st-page--flow`
- 表单用 `st-card` + `st-input` + `st-btn-primary`

## 入口菜单

单一事实源：[`miniprogram/config/menus.js`](../miniprogram/config/menus.js)

- `HOME_QUICK_ENTRIES` / `DEFAULT_HOME_SHORTCUT_IDS`：默认快捷 id 列表，与 Web [`DEFAULT_DASHBOARD_SHORTCUT_IDS`](../shared/workbenchShortcuts.ts) 一致
- 首页蓝色区域拉取 `GET /dashboard/shortcuts`，经 [`utils/workbenchShortcuts.js`](../miniprogram/utils/workbenchShortcuts.js) 解析并按权限过滤后展示（与 Web 快捷入口组件同步）
- `APP_CATEGORIES`：应用中心，由同文件内 `WORKBENCH_SHORTCUT_CATALOG` 按 `group` 派生；展示顺序见 `APP_GROUP_ORDER`（**插件中心**置顶，其后生产管理、进销存、财务结算、基础信息）
- `buildAppCategories(permissions, keyword)`：按权限过滤（`keyword` 保留供扩展，应用页未启用搜索）
- 每项可配置 `permission`，由 [`utils/permissions.js`](../miniprogram/utils/permissions.js) 过滤

`icon-grid` 支持可选字段 `iconChar`，在图标中央叠汉字（仅首页常用入口使用）。

## Tab 页面说明

| 页面 | 布局要点 |
|------|----------|
| 首页 | **蓝色顶栏**：头像 + 用户名 + 企业名；单行白色快捷图标；**白色圆角内容区**含数据看板；下拉刷新 |
| 应用 | `tab-shell`：标题「应用」+ 分组宫格卡片（左侧色条分区标题） |
| 扫码 | `tab-shell`：扫码类型彩色顶条卡片 + 「最近扫码」白卡片列表 |
| 消息 | 蓝色顶栏（标题+未读数）+ 全宽搜索框；微信风格会话列表；详情页 `messages-chat` |
| 我的 | `tab-shell` 自定义顶栏（头像 + 用户/企业）+ 菜单白卡片 + 退出按钮 |

### A2. 扫码会话页壳（`pages/scan-session`）

- 栈页面，顶栏 `page-header` 带返回
- 全屏摄像头 + 类型专属条件区 + 手动输入
- `onLoad?type=` 校验权限与类型合法性

## 扫码页交互

- **分流**：枢纽选类型 → **直达会话页**；报工/返工在页内点击行打开底部弹窗选工序，外协在页内搜索选加工厂（弹窗更高）；入库/查询无预备条件
- **连续扫码**：默认开启，无开关；识别后自动继续，结果累积显示在取景框下方

## 新页面 Checklist

1. 选择页面壳类型（Tab / 流程）
2. 在页面 `.json` 中注册所需组件
3. 样式只用 `st-*` 类与组件，禁止内联色值
4. 业务入口走 `config/menus.js`，不写死宫格
5. 登录后进入 Tab 页使用 `wx.switchTab`，勿对 Tab 页使用 `reLaunch`
6. 验证安全区与 TabBar 遮挡（`st-page--tab` 已预留底部间距）
7. **表单录入**（合作单位 / 产品 / 色码矩阵 / 数量键盘）遵循下方 §表单录入标准，以 [`production-plan-create`](../miniprogram/pages/production-plan-create/) 为参考实现
8. **列表/流水/清单**展示产品名称时遵循下方 §产品名称与编号，以 [`production-order-report-history`](../miniprogram/pages/production-order-report-history/) 为参考实现

## 产品名称与编号（列表 / 流水 / 清单 · 默认）

凡展示**成品产品名称**的流水行、清单行、主列表卡片（含详情区产品标题），名称后须显示**产品编号（sku）**，与报工流水一致。

### 数据层

| 工具 | 路径 | 用途 |
|------|------|------|
| `listProductNameSkuFields` | [`utils/listProductThumb.js`](../miniprogram/utils/listProductThumb.js) | 从 `product` + 回退字段生成三件套 |
| `listProductDisplayFields` | 同上 | 三件套 + 缩略图 |
| `productMetaFromMap` | [`utils/orderReportHistory.js`](../miniprogram/utils/orderReportHistory.js) | 带 `productMap` 的列表行（含 `imageUrl`） |

行模型字段：`productName`、`productSku`、`showProductSku`。`showProductSku` 仅在「有名称且有编号且二者不同」时为 `true`。

### 视图层

- **双字段分行**：`product-name` + `sku` 两个 `<text>`（报工流水、工单列表、外协/返工流水行）
- **单行后缀**：`{{productName}}<text class="list-product-sku"> {{productSku}}</text>`（详情 hero、部分副标题）
- 样式：列表行用各页 `__sku`；通用后缀用全局 `.list-product-sku`（[`styles/list.wxss`](../miniprogram/styles/list.wxss)）

### Cursor 规则

[`.cursor/rules/miniprogram-lists.mdc`](../.cursor/rules/miniprogram-lists.mdc)

## 表单录入标准（默认）

涉及**合作单位选择、产品选择、颜色×尺码矩阵数量录入**的页面，统一复用生产计划新建页同一套组件与交互。Cursor 规则见 [`.cursor/rules/miniprogram-forms.mdc`](../.cursor/rules/miniprogram-forms.mdc)。

### 参考页面

[`pages/production-plan-create/`](../miniprogram/pages/production-plan-create/) — 完整示例：产品 + 客户 + 矩阵 + 键盘 + 表单样式。

已对齐的页面（新功能应与此保持一致）：

| 页面 | 合作单位 | 产品 | 矩阵 | 键盘 |
|------|:--------:|:----:|:----:|:----:|
| 新建生产计划 | — | ✓ | ✓ | ✓ |
| 工单报工 | — | — | ✓ | ✓ |
| 报工批次编辑 | — | — | ✓ | ✓ |
| 待入库确认 | — | — | ✓ | ✓ |
| 外协发出确认 | ✓ | — | ✓ | ✓ |
| 扫码外协收回 | ✓ | — | — | — |
| 登记/编辑采购订单 | — | ✓ | ✓ | ✓ |
| 登记/编辑采购入库 | ✓ | ✓ | ✓ | ✓ |

### 数量 / 单价 / 金额（三列一行）

同时展示**数量、单价、金额**时，统一使用 [`styles/qty-price-amount-summary.wxss`](../miniprogram/styles/qty-price-amount-summary.wxss)（参考外协收回确认页）：

- **表单录入**：`order-detail-summary` + `order-detail-summary__item`；可编辑列用 `order-detail-summary__input`
- **列表 / 详情只读行**：同上，加 `order-detail-summary--compact`
- 无金额权限时只显示数量列

已对齐：采购订单新建/编辑、采购入库新建/编辑、列表产品行、详情产品行。

### 组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `searchable-partner-select` | [`components/searchable-partner-select/`](../miniprogram/components/searchable-partner-select/) | 合作单位 / 客户 / 加工厂（搜索 + 分类 Tab 底栏弹层） |
| `searchable-product-select` | [`components/searchable-product-select/`](../miniprogram/components/searchable-product-select/) | 产品（搜索 + 分类 Tab，展示 SKU） |
| `matrix-qty-keyboard` | [`components/matrix-qty-keyboard/`](../miniprogram/components/matrix-qty-keyboard/) | 矩阵格数量自定义键盘（↵ 同行下一格、→ 同列下一行、完成关闭） |

### 数据加载（planApi）

```javascript
const {
  fetchProductsAll,
  fetchCategoriesAll,
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  fetchDictionaries,
} = require('../../utils/planApi.js');
```

合作单位：`partners` + `partnerCategories`，`bind:change` 取 `e.detail.name`（及 `e.detail.id`）。  
产品：`products` + `categories`，`bind:change` 取 `e.detail.product`。

### 色码矩阵

- **布局模型**：[`utils/variantQtyMatrix.js`](../miniprogram/utils/variantQtyMatrix.js) 的 `buildVariantMatrixUiModel(product, dictionaries, qtyMap)`；业务侧有上限/禁用格时用专用 builder（如 [`outsourceDispatchMatrix.js`](../miniprogram/utils/outsourceDispatchMatrix.js)）。
- **WXML 结构**：`plan-create-matrix-scroll` → `plan-create-matrix` → `__head` / `__row` / `__cell`；格内用 `view.plan-create-matrix__input` + `bindtap="onMatrixCellTap"`，**禁止**矩阵格内 `<input>`。
- **样式**：`@import` [`production-plan-create.wxss`](../miniprogram/pages/production-plan-create/production-plan-create.wxss)；需展示「最多 N」时叠加 `report-matrix`（见报工 / 外协发出页）。

### 矩阵键盘

- 页面底部挂载 `<matrix-qty-keyboard visible="{{matrixKeyboardVisible}}" bind:action="onMatrixKeyboardAction" />`。
- 逻辑统一走 [`utils/matrixQtyKeyboard.js`](../miniprogram/utils/matrixQtyKeyboard.js)：`createMatrixKeyboardInputSession`、`activateMatrixKeyboardCell`、`applyMatrixKeyboardKey`（选中格后**首键整格替换**）、`buildMatrixKeyboardPreview`、`getNextMatrixVariantIdInRow`、`getNextMatrixVariantIdInColumn`。
- 选中待替换时格子上加 `plan-create-matrix__input--replace`（浅蓝底提示）。
- 键盘弹出时滚动容器加 `plan-create-page--keyboard`（底部留白，避免被键盘遮挡）。

### 禁止项

- 用 `picker mode="selector"` 选合作单位或产品（历史筛选 Tab、仓库等枚举除外）。
- 在页面 WXML 内复制粘贴自建数字键盘（须用 `matrix-qty-keyboard`）。
- 各页自行定义矩阵表格样式（须复用 `plan-create-matrix*`）。

## 保存后导航

单据保存/提交成功后**统一回到所属列表页**，工具：[`utils/saveNavigation.js`](../miniprogram/utils/saveNavigation.js) 的 `afterSaveReturnToList` + `LIST_ROUTES` / `MODULE_HUB_ROUTES`。

### 规则

1. **新建 / 确认 / 处置类**（一次性提交）→ 回到**模块 Hub 主列表**（见下表 `MODULE_HUB_ROUTES`）
   - 例外：从明确**子清单**进入的确认页（待发/待收回/待入库）→ 回到该子清单
2. **流水 / 批次详情**编辑或删除 → 回到对应**流水列表**（不跳详情、不停留在编辑页）
3. 栈内已有目标列表时 `navigateBack` + `_refreshOnNextShow`；否则 `redirectTo`
4. 成功后先 `wx.showToast`，约 400ms 后跳转
5. **Hub 列表刷新**：目标列表页 `onShow` 用 `consumeListRefreshOnShow(page, route)` 判断；为真时须 `bootstrap` / 重新请求 API，不能只重筛本地缓存；下拉刷新 `reloadList` 亦须重新拉数
6. **除外**：`scan-session` 扫码连续作业；详情页内联保存（不离开当前页）

### 页面 → 成功后列表

| 页面 | `listUrl` |
|------|-----------|
| 处理不良（报损/厂内返工/委外返工） | `REWORK_HUB` |
| 返工报工 | `REWORK_HUB` |
| 返工领料 | `REWORK_HUB` |
| 处理不良流水详情 | `REWORK_DEFECT_FLOW` |
| 返工报工流水详情 | `REWORK_REPORT_FLOW` |
| 工单报工 | `PRODUCTION_ORDERS` |
| 报工批次详情 | `buildReportHistoryListUrl(...)` |
| 工单领料 / 退料 | `PRODUCTION_ORDERS` |
| 外协发出确认 | `OUTSOURCE_DISPATCH` |
| 外协收回确认 | `OUTSOURCE_RECEIVE` |
| 外协领退料 | `OUTSOURCE_HUB` |
| 外协流水详情 | `OUTSOURCE_FLOW` |
| 待入库确认 | `PENDING_STOCK` |
| 入库流水详情 | `STOCK_IN_HISTORY` |
| 领退料确认 | `STOCK_OUT`（外协来源 → `OUTSOURCE_HUB`） |
| 领退料流水详情 | `STOCK_OUT` |
| 新建计划 | `PRODUCTION_PLANS` |
| 登记/编辑采购订单 | `PSI_PURCHASE_ORDERS` |
| 采购订单详情（删除） | `PSI_PURCHASE_ORDERS` |
| 登记/编辑采购入库 | `PSI_PURCHASE_BILLS` |
| 采购入库详情（删除） | `PSI_PURCHASE_BILLS` |
| 登记/编辑销售订单 | `PSI_SALES_ORDERS` |
| 销售订单详情（删除） | `PSI_SALES_ORDERS` |
| 销售订单配货 | 返回详情（`navigateBack`） |
| 待发货生成销售单 | `PSI_SALES_ORDERS` |
| 登记/编辑销售单 | `PSI_SALES_BILLS` |
| 销售单详情（删除） | `PSI_SALES_BILLS` |
| 登记/编辑调拨单 | `PSI_WAREHOUSE_TRANSFER` |
| 调拨单详情（删除） | `PSI_WAREHOUSE_TRANSFER` |
| 登记/编辑盘点单 | `PSI_WAREHOUSE_STOCKTAKE` |
| 盘点单详情（删除） | `PSI_WAREHOUSE_STOCKTAKE` |
| 登记/编辑收款单 | `FINANCE_RECEIPTS` |
| 收款单详情（删除） | `FINANCE_RECEIPTS` |
| 登记/编辑付款单 | `FINANCE_PAYMENTS` |
| 付款单详情（删除） | `FINANCE_PAYMENTS` |

新功能登记：在 `LIST_ROUTES` 增加路径常量，上表与 `.cursor/rules/miniprogram-forms.mdc` 同步补充一行。

详见 `.cursor/rules/miniprogram-forms.mdc` §保存后导航。

## 图标资源

图标源自 **Lucide**（与 Web `lucide-react` 一致），描边色 `#2F6BFF`，由脚本栅格化为 PNG：

| 目录 | 尺寸 | 用途 |
|------|------|------|
| `miniprogram/assets/icons/` | 48×48 | 宫格 / 扫码类型 |
| `miniprogram/assets/tab/` | 81×81 | TabBar（home/apps/scan/messages/mine，灰 / 蓝选中） |
| `miniprogram/assets/mine/` | 40×40 | 我的页菜单 |
| `miniprogram/assets/illustrations/` | — | 数据卡插画 |
| `miniprogram/assets/wanpu-logo.png` | — | 品牌 Logo |

重新生成：

```bash
npm run miniprogram:icons
```

脚本：[`miniprogram/scripts/export-lucide-icons.mjs`](../miniprogram/scripts/export-lucide-icons.mjs)。新增宫格图标时，在脚本 `APP_ICON_NAMES` 与 `menus.js` 中同步登记文件名。

> `miniprogram/scripts/generate-icons.py` 已废弃，请勿再使用。

## 消息 Tab 业务链路

消息 Tab 采用聊天工具式 UI（参考 Web 协作管理）：会话列表 + 聊天详情气泡。

| 页面 | 路径 | 职责 |
|------|------|------|
| 会话列表 | [`pages/messages/`](../miniprogram/pages/messages/) | 类微信聊天列表：消息中心 / 待办事项 / 各协作合作单位 |
| 聊天详情 | [`pages/messages-chat/`](../miniprogram/pages/messages-chat/) | 时间轴气泡布局，左右对齐 |

| 会话类型 | 数据源 | 气泡方向 |
|----------|--------|----------|
| 消息中心 | `/dashboard/notifications`（排除待办类通知） | 系统消息左侧 |
| 待办事项 | `/todos` | 待办右侧 |
| 协作合作单位 | `/collaboration/subcontract-transfers` | 派发/转发按发送方右侧、接收方左侧；回传反向 |

| 工具 | 作用 |
|------|------|
| [`utils/messagesChatBuilder.js`](../miniprogram/utils/messagesChatBuilder.js) | 构建会话列表 + 时间轴气泡（融合三类数据源） |
| [`utils/collabInboxHelpers.js`](../miniprogram/utils/collabInboxHelpers.js) | `peerBindingsForTransfer`（对齐 Web） |
| [`utils/collabStatusLabels.js`](../miniprogram/utils/collabStatusLabels.js) | 派发/回传/转发状态文案 |
| [`utils/notificationRead.js`](../miniprogram/utils/notificationRead.js) | 本地已读 |
| [`utils/messagesCache.js`](../miniprogram/utils/messagesCache.js) | 跨页面数据缓存 |
| [`utils/messagesTabBadge.js`](../miniprogram/utils/messagesTabBadge.js) | Tab 角标 |

进入「消息中心」会话时自动标记系统消息已读；Tab 角标 = 未读消息 + 未完成待办 + 协作待处理。点击气泡可查看详情；协作操作提示去电脑端处理。

## 生产计划

对齐 Web [`PlanOrderListView`](../views/PlanOrderListView.tsx)（P2 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 计划列表 | [`pages/production-plans/`](../miniprogram/pages/production-plans/) | 分页列表、搜索/派发状态筛选、采购到货进度条、下拉刷新 |
| 计划详情 | [`pages/production-plan-detail/`](../miniprogram/pages/production-plan-detail/) | 对齐 Web：基础信息/数量/工序/BOM 横向表格（可左右滑动）；下达工单 |
| 新建计划 | [`pages/production-plan-create/`](../miniprogram/pages/production-plan-create/) | 简化新建（产品+数量+客户+交期） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/productionPlans.js`](../miniprogram/config/productionPlans.js) | 派发状态常量、筛选 Tab |
| [`utils/productionPlans.js`](../miniprogram/utils/productionPlans.js) | 搜索解析、列表/详情 UI 模型 |
| [`utils/planApi.js`](../miniprogram/utils/planApi.js) | `/plans`、`/psi/plans-purchase-progress` 等 API 封装 |
| [`components/searchable-product-select/`](../miniprogram/components/searchable-product-select/) | 新建页产品选择 |
| [`components/searchable-partner-select/`](../miniprogram/components/searchable-partner-select/) | 合作单位 / 客户选择 |
| [`components/matrix-qty-keyboard/`](../miniprogram/components/matrix-qty-keyboard/) | 色码矩阵数量键盘 |

表单录入完整约定见本文 §表单录入标准（默认）；参考页 [`production-plan-create`](../miniprogram/pages/production-plan-create/)。
**API**：`GET /plans`（分页 + `search` / `dispatchStatus` / `excludeCompleted`）· `GET /plans/:id` · `POST /plans` · `POST /plans/:id/convert` · `POST /psi/plans-purchase-progress` · `GET /psi/plan-related`

**权限**：`production:plans:view`（列表/详情）· `production:plans:create`（新建，另需 `basic:products:view`）· `production:plans:edit`（下达工单）

**深链**：`/pages/production-plans/production-plans?planId=<id>` 重定向至详情页。

**留 Web**：BOM 用料编辑、生成采购订单、追溯码、打印、表单配置、删除/子计划。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-plans` → `/pages/production-plans/production-plans`（首页快捷入口 / 应用中心）。

## 工单中心

对齐 Web [`OrderListView`](../views/OrderListView.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 工单列表 | [`pages/production-orders/`](../miniprogram/pages/production-orders/) | 分页列表、搜索/仅未完成、父子/产品分组、工序横向卡、点按报工；**筛选面板**内含工单流水 / 报工流水 / 待入库清单入口 |
| 工单流水 | [`pages/production-order-flow/`](../miniprogram/pages/production-order-flow/) | 按日期/工单号/产品筛选的只读工单流水列表 + 底部汇总 |
| 工单详情 | [`pages/production-order-detail/`](../miniprogram/pages/production-order-detail/) | 基础信息/数量/工序进度；编辑客户/交期/开始日期；派发状态切换 |
| 报工流水 | [`pages/production-order-report-history/`](../miniprogram/pages/production-order-report-history/) | 全局或单工单报工流水；按批次聚合；顶栏单搜索框 + 日期筛选；点击进入批次详情 |
| 报工批次详情 | [`pages/production-order-report-batch-detail/`](../miniprogram/pages/production-order-report-batch-detail/) | 对齐 Web `ReportBatchDetailModal`：汇总、颜色尺码矩阵、明细行；支持编辑/删除（外协收回仅电脑端） |
| 待入库 | [`pages/production-order-pending-stock/`](../miniprogram/pages/production-order-pending-stock/) | **清单模式**：多工单待入库列表；**单工单模式**：摘要 + 简入库 + 跳转扫码 |
| 领料 | [`pages/production-order-material/`](../miniprogram/pages/production-order-material/) | BOM 待发清单 + 简 STOCK_OUT |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/productionOrders.js`](../miniprogram/config/productionOrders.js) | 派发状态常量、桌面端提示、`ORDER_CENTER_SHORTCUTS` 筛选面板快捷入口 |
| [`utils/productionOrders.js`](../miniprogram/utils/productionOrders.js) | 列表分组、搜索、详情 UI 模型 |
| [`utils/orderFlow.js`](../miniprogram/utils/orderFlow.js) | 工单流水筛选/排序/行模型 |
| [`utils/orderReportHistory.js`](../miniprogram/utils/orderReportHistory.js) | 报工流水行模型、日期转换、客户端筛选 |
| [`utils/reportBatchDetail.js`](../miniprogram/utils/reportBatchDetail.js) | 报工批次分组、详情视图、编辑时间工具 |
| [`utils/pendingStockBadge.js`](../miniprogram/utils/pendingStockBadge.js) | 待入库角标与清单数据加载 |
| [`utils/orderProcessChips.js`](../miniprogram/utils/orderProcessChips.js) | 工序进度卡计算 |
| [`utils/orderApi.js`](../miniprogram/utils/orderApi.js) | `/orders`、`/production/records` 等 API |
| [`components/report-sheet/`](../miniprogram/components/report-sheet/) | 手输报工底部弹层 |
| [`components/order-process-scroll/`](../miniprogram/components/order-process-scroll/) | 列表行内工序横向卡 |

**API**：`GET /orders`（分页 + `search` / `excludeCompleted`）· `GET /orders/:id` · `PUT /orders/:id` · `PATCH /orders/:id/dispatch-status` · `POST .../reports` · `GET /orders/report-history` · `PUT/DELETE .../reports/:reportId` · `PUT/DELETE /orders/product-progress/report/:reportId` · `POST /production/records`

**权限**：`production:orders_list:allow`（列表）· `production:orders_detail:view|edit` · `production:orders_report_records:create|view` · `production:orders_pending_stock_in`（任意子权限）· `production:orders_material:allow`

**深链**：`/pages/production-orders/production-orders?orderId=<id>` 重定向至详情。计划下达成功可跳转首个新工单详情。

**留 Web**：工单新建（仅计划下达）、删除、表单配置、打印、色码矩阵报工、待入库批量/矩阵/入库流水。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-orders` → `/pages/production-orders/production-orders`。

## 采购订单

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 采购订单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 采购订单 Hub | [`pages/psi-purchase-orders/`](../miniprogram/pages/psi-purchase-orders/) | 按单号分组卡片列表、搜索/仅未交清筛选、行级入库进度预览、新建入口 |
| 采购订单详情 | [`pages/psi-purchase-order-detail/`](../miniprogram/pages/psi-purchase-order-detail/) | 供应商/单号/明细/行级入库进度；编辑/删除 |
| 登记/编辑 | [`pages/psi-purchase-order-edit/`](../miniprogram/pages/psi-purchase-order-edit/) | 供应商、多行明细、色码矩阵、保存/删除 |
| 订单流水 | [`pages/psi-purchase-order-flow/`](../miniprogram/pages/psi-purchase-order-flow/) | 行级履约流水（未入库/部分/已入库筛选） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/purchaseOrders.js`](../miniprogram/config/purchaseOrders.js) | PSI 类型常量、流水状态筛选、`PURCHASE_ORDER_SHORTCUTS` |
| [`utils/psiApi.js`](../miniprogram/utils/psiApi.js) | `/psi/records*`、`next-doc-number`、`last-purchase-prices` |
| [`utils/psiOpsAggregators.js`](../miniprogram/utils/psiOpsAggregators.js) | 按单号分组、入库汇总、未交清判断 |
| [`utils/purchaseOrders.js`](../miniprogram/utils/purchaseOrders.js) | 列表/详情/流水 view-model |
| [`utils/purchaseOrderForm.js`](../miniprogram/utils/purchaseOrderForm.js) | 表单状态、校验、保存 payload |

**API**：`GET /psi/records?type=PURCHASE_ORDER`（客户端拉全量分组）· 并行拉 `PURCHASE_BILL` 计算 `receivedByOrderLine` · `POST /psi/records/batch` · `PUT /psi/records/replace` · `DELETE /psi/records` · `GET /psi/next-doc-number` · `POST /psi/last-purchase-prices`

**权限**：`psi:purchase_order:view` · `psi:purchase_order:create` · `psi:purchase_order:edit` · `psi:purchase_order:delete` · `psi:purchase_order:amount`

**深链**：`/pages/psi-purchase-orders/psi-purchase-orders?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段、关联产品、从计划生成采购订单。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-purchase-order` → `/pages/psi-purchase-orders/psi-purchase-orders`（首页快捷 / 应用中心）。

## 销售订单

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 销售订单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 销售订单 Hub | [`pages/psi-sales-orders/`](../miniprogram/pages/psi-sales-orders/) | 按单号分组卡片列表、搜索/仅未发齐筛选、行级配货/发货进度预览、新建入口 |
| 销售订单详情 | [`pages/psi-sales-order-detail/`](../miniprogram/pages/psi-sales-order-detail/) | 客户/单号/明细/行级进度；配货入口；编辑/删除 |
| 登记/编辑 | [`pages/psi-sales-order-edit/`](../miniprogram/pages/psi-sales-order-edit/) | 客户、多行明细、色码矩阵、销售价、保存/删除 |
| 订单流水 | [`pages/psi-sales-order-flow/`](../miniprogram/pages/psi-sales-order-flow/) | 行级配货/发货流水（未配货/已配货/已发齐筛选） |
| 配货 | [`pages/psi-sales-order-allocate/`](../miniprogram/pages/psi-sales-order-allocate/) | 按行组配货、出库仓库、色码矩阵 |
| 待发货清单 | [`pages/psi-sales-order-pending-ship/`](../miniprogram/pages/psi-sales-order-pending-ship/) | 已配未发汇总、多选生成销售单 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/salesOrders.js`](../miniprogram/config/salesOrders.js) | PSI 类型常量、流水状态筛选、`SALES_ORDER_SHORTCUTS` |
| [`utils/salesOrders.js`](../miniprogram/utils/salesOrders.js) | 列表/详情/流水/待发货 view-model |
| [`utils/salesOrderForm.js`](../miniprogram/utils/salesOrderForm.js) | 表单状态、校验、保存 payload（保留已配/已发） |
| [`utils/salesOrderAllocation.js`](../miniprogram/utils/salesOrderAllocation.js) | 配货数量初始化与保存 |
| [`utils/salesOrderPendingShip.js`](../miniprogram/utils/salesOrderPendingShip.js) | 待发货生成销售单 |
| [`utils/psiPartnerProductLastPrice.js`](../miniprogram/utils/psiPartnerProductLastPrice.js) | 客户+商品默认销售价 |

**API**：`GET /psi/records?type=SALES_ORDER` · `POST /psi/records/batch` · `PUT /psi/records/replace` · `DELETE /psi/records` · `GET /psi/next-doc-number`（SO / XS）

**权限**：`psi:sales_order:view` · `psi:sales_order:create` · `psi:sales_order:edit` · `psi:sales_order:delete` · `psi:sales_order:amount` · `psi:sales_order_allocation:allow` · `psi:sales_order_pending_shipment:allow`

**深链**：`/pages/psi-sales-orders/psi-sales-orders?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-sales-order` → `/pages/psi-sales-orders/psi-sales-orders`（首页快捷 / 应用中心）。

## 销售单

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 销售单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 销售单 Hub | [`pages/psi-sales-bills/`](../miniprogram/pages/psi-sales-bills/) | 按单号分组卡片列表、搜索、仓库展示、流水快捷入口、新建 |
| 销售单详情 | [`pages/psi-sales-bill-detail/`](../miniprogram/pages/psi-sales-bill-detail/) | 客户/单号/出库仓库/明细/批次；编辑/删除 |
| 登记/编辑 | [`pages/psi-sales-bill-edit/`](../miniprogram/pages/psi-sales-bill-edit/) | 客户、出库仓库、多行明细、色码矩阵、销售价、出库批次、保存/删除 |
| 销售流水 | [`pages/psi-sales-bill-flow/`](../miniprogram/pages/psi-sales-bill-flow/) | 行级出库流水（日期/搜索筛选） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/salesBills.js`](../miniprogram/config/salesBills.js) | PSI 类型常量、`SALES_BILL_SHORTCUTS` |
| [`utils/salesBills.js`](../miniprogram/utils/salesBills.js) | 列表/详情/流水 view-model |
| [`utils/salesBillForm.js`](../miniprogram/utils/salesBillForm.js) | 表单状态、校验、保存 payload |
| [`utils/purchaseBillBatch.js`](../miniprogram/utils/purchaseBillBatch.js) | 出库批次本地库存合并（复用） |
| [`utils/psiPartnerProductLastPrice.js`](../miniprogram/utils/psiPartnerProductLastPrice.js) | 客户+商品默认销售价 |

**API**：`GET /psi/records?type=SALES_BILL` · `POST /psi/records/batch` · `PUT /psi/records/replace` · `DELETE /psi/records` · `GET /psi/next-doc-number`（XS / SB）

**权限**：`psi:sales_bill:view` · `psi:sales_bill:create` · `psi:sales_bill:edit` · `psi:sales_bill:delete` · `psi:sales_bill:amount`

**深链**：`/pages/psi-sales-bills/psi-sales-bills?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-sales-bill` → `/pages/psi-sales-bills/psi-sales-bills`（应用中心）。

## 收款单

对齐 Web [`FinanceOpsView`](../views/FinanceOpsView.tsx) 收款单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 收款单 Hub | [`pages/finance-receipts/`](../miniprogram/pages/finance-receipts/) | 分页列表、搜索、流水快捷入口、新建 |
| 收款单详情 | [`pages/finance-receipt-detail/`](../miniprogram/pages/finance-receipt-detail/) | 分类/客户/账户/工人/产品/金额；编辑/删除 |
| 登记/编辑 | [`pages/finance-receipt-edit/`](../miniprogram/pages/finance-receipt-edit/) | 分类联动字段、缴款客户、收支账户、金额、备注 |
| 收款流水 | [`pages/finance-receipt-flow/`](../miniprogram/pages/finance-receipt-flow/) | 日期/搜索筛选流水 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/financeReceipts.js`](../miniprogram/config/financeReceipts.js) | `RECEIPT` 类型常量 |
| [`utils/financeApi.js`](../miniprogram/utils/financeApi.js) | `/finance/records` CRUD、分类/账户/插件读取 |
| [`utils/financeReceipts.js`](../miniprogram/utils/financeReceipts.js) | 列表/详情/表单 view-model、校验、payload |

**API**：`GET/POST /finance/records` · `GET/PUT/DELETE /finance/records/:id` · `GET /settings/finance-categories` · `GET /settings/finance-account-types` · `GET /dashboard/feature-plugins`（资金账户插件）

**权限**：`finance:receipt:view` · `finance:receipt:create` · `finance:receipt:edit` · `finance:receipt:delete`

**深链**：`/pages/finance-receipts/finance-receipts?id=<id>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印。

入口：[`menus.js`](../miniprogram/config/menus.js) `finance-receipt` → `/pages/finance-receipts/finance-receipts`（首页快捷 / 应用中心）。

## 付款单

对齐 Web [`FinanceOpsView`](../views/FinanceOpsView.tsx) 付款单 Tab，结构复用收款单：

| 页面 | 路径 | 职责 |
|------|------|------|
| 付款单 Hub | [`pages/finance-payments/`](../miniprogram/pages/finance-payments/) | 分页列表、搜索、流水快捷入口、新建 |
| 付款单详情 | [`pages/finance-payment-detail/`](../miniprogram/pages/finance-payment-detail/) | 分类/收款单位/账户/工人/产品/金额；编辑/删除 |
| 登记/编辑 | [`pages/finance-payment-edit/`](../miniprogram/pages/finance-payment-edit/) | 分类联动字段、收款单位/个人、收支账户、金额、备注 |
| 付款流水 | [`pages/finance-payment-flow/`](../miniprogram/pages/finance-payment-flow/) | 日期/搜索筛选流水，底部合计栏 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/financePayments.js`](../miniprogram/config/financePayments.js) | `PAYMENT` 类型常量 |
| [`utils/financeRecords.js`](../miniprogram/utils/financeRecords.js) | 收/付款共用 view-model |
| [`utils/financePayments.js`](../miniprogram/utils/financePayments.js) | 付款单适配层 |
| [`utils/financeApi.js`](../miniprogram/utils/financeApi.js) | `/finance/records` CRUD |

**API / 权限**：与收款单相同接口，`type=PAYMENT`；`finance:payment:view|create|edit|delete`

**深链**：`/pages/finance-payments/finance-payments?id=<id>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印。

入口：[`menus.js`](../miniprogram/config/menus.js) `finance-payment` → `/pages/finance-payments/finance-payments`（应用中心）。

## 财务对账

对齐 Web [`FinanceOpsView`](../views/FinanceOpsView.tsx) 对账 Tab（只读查询，P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 财务对账 | [`pages/finance-reconciliation/`](../miniprogram/pages/finance-reconciliation/) | 合作单位 / 报工结算双 Tab；日期 + 对方筛选；查询后展示汇总与应收增减流水 |
| 报工单详情 | [`pages/finance-recon-work-detail/`](../miniprogram/pages/finance-recon-work-detail/) | 报工结算行的汇总与明细行（只读） |

| 工具 | 作用 |
|------|------|
| [`utils/financeReconciliation.js`](../miniprogram/utils/financeReconciliation.js) | 合作单位 / 结算对账行归并、余额滚算、卡片映射 |
| [`utils/financeApi.js`](../miniprogram/utils/financeApi.js) | `fetchAllFinanceRecords`、`partnerOpeningBalance` |

**能力**：

- 合作单位：PSI 采购入库/销售单 + 外协/返工收回 + 收/付款单，上期余额走 `GET /finance/reconciliation/partner-opening-balance`
- 报工结算：报工流水（`/orders/report-history`）+ 返工报工 + 收/付款单（工人维度）
- **按单据 / 按产品**两种展示：按产品时采购/销售/外协/报工按产品行展开，收付款保持单据级一行；余额按行顺序滚算
- 单据行可跳转既有详情（收款/付款/采购入库/销售单/外协流水/返工报工；报工单走本模块详情）

**权限**：`finance:reconciliation:allow`（只读，无新建/编辑/删除）。报工流水依赖 `production:orders_report_records:view`；无权限时报工行可能为空，其余来源仍可查询。

**留 Web**：导出 Excel、打印。

入口：[`menus.js`](../miniprogram/config/menus.js) `finance-reconciliation` → `/pages/finance-reconciliation/finance-reconciliation`。

## 采购入库

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 采购入库 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 采购入库 Hub | [`pages/psi-purchase-bills/`](../miniprogram/pages/psi-purchase-bills/) | 按单号分组卡片列表、搜索、仓库/来源订单展示、新建入口 |
| 采购入库详情 | [`pages/psi-purchase-bill-detail/`](../miniprogram/pages/psi-purchase-bill-detail/) | 供应商/单号/仓库/明细；来源订单跳转；编辑/删除 |
| 登记/编辑 | [`pages/psi-purchase-bill-edit/`](../miniprogram/pages/psi-purchase-bill-edit/) | 手动创建或引用采购订单、仓库选择、色码矩阵、批次、保存/删除 |
| 入库流水 | [`pages/psi-purchase-bill-flow/`](../miniprogram/pages/psi-purchase-bill-flow/) | 行级入库流水（日期/搜索筛选） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/purchaseBills.js`](../miniprogram/config/purchaseBills.js) | PSI 类型常量、`PURCHASE_BILL_SHORTCUTS` |
| [`utils/purchaseBills.js`](../miniprogram/utils/purchaseBills.js) | 列表/详情/流水 view-model |
| [`utils/purchaseBillForm.js`](../miniprogram/utils/purchaseBillForm.js) | 表单状态、引用订单转化、校验、保存 payload |

**API**：`GET /psi/records?type=PURCHASE_BILL` · 引用订单时并行拉 `PURCHASE_ORDER` 计算待入量 · `POST /psi/records/batch` · `PUT /psi/records/replace` · `DELETE /psi/records` · `GET /psi/next-doc-number` · `GET /settings/warehouses?all=true`

**权限**：`psi:purchase_bill:view` · `psi:purchase_bill:create` · `psi:purchase_bill:edit` · `psi:purchase_bill:delete` · `psi:purchase_bill:amount`

**深链**：`/pages/psi-purchase-bills/psi-purchase-bills?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段、关联产品。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-purchase-bill` → `/pages/psi-purchase-bills/psi-purchase-bills`（应用中心）。

## 仓库管理

对齐 Web [`WarehousePanel`](../views/psi-ops/WarehousePanel.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 库存 Hub | [`pages/psi-warehouses/`](../miniprogram/pages/psi-warehouses/) | 按仓库/按物料库存列表、搜索、批次展开、快捷入口（流水/盘点/调拨） |
| 库存详情 | [`pages/psi-warehouse-product-flow/`](../miniprogram/pages/psi-warehouse-product-flow/) | 单产品（可选单仓）流水只读列表；支持日期/类型/仓库筛选 |
| 调拨单 Hub | [`pages/psi-warehouse-transfer/`](../miniprogram/pages/psi-warehouse-transfer/) | 调拨单列表、搜索、新建 |
| 调拨详情 | [`pages/psi-warehouse-transfer-detail/`](../miniprogram/pages/psi-warehouse-transfer-detail/) | 调出/调入仓、明细；编辑/删除 |
| 登记/编辑调拨 | [`pages/psi-warehouse-transfer-edit/`](../miniprogram/pages/psi-warehouse-transfer-edit/) | 双仓库、产品、矩阵、批次 |
| 盘点单 Hub | [`pages/psi-warehouse-stocktake/`](../miniprogram/pages/psi-warehouse-stocktake/) | 盘点单列表、搜索、新建 |
| 盘点详情 | [`pages/psi-warehouse-stocktake-detail/`](../miniprogram/pages/psi-warehouse-stocktake-detail/) | 盘点仓、实盘/系统/差异；编辑/删除 |
| 登记/编辑盘点 | [`pages/psi-warehouse-stocktake-edit/`](../miniprogram/pages/psi-warehouse-stocktake-edit/) | 单仓库、实盘录入、系统库存展示 |
| 仓库流水 | [`pages/psi-warehouse-flow/`](../miniprogram/pages/psi-warehouse-flow/) | 全局流水（日期/类型/仓库/搜索）；行点击跳转各单据详情 |
| 生产退料详情 | [`pages/psi-warehouse-flow-prod-detail/`](../miniprogram/pages/psi-warehouse-flow-prod-detail/) | 流水中的 STOCK_RETURN 轻量只读详情 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/warehouses.js`](../miniprogram/config/warehouses.js) | PSI 类型、`WAREHOUSE_SHORTCUTS`、流水类型筛选 |
| [`utils/warehouseStock.js`](../miniprogram/utils/warehouseStock.js) | `stock-snapshot` 客户端索引 |
| [`utils/warehouseInventory.js`](../miniprogram/utils/warehouseInventory.js) | 库存主列表 view-model |
| [`utils/warehouseTransfer.js`](../miniprogram/utils/warehouseTransfer.js) / [`warehouseTransferForm.js`](../miniprogram/utils/warehouseTransferForm.js) | 调拨列表/表单 |
| [`utils/warehouseStocktake.js`](../miniprogram/utils/warehouseStocktake.js) / [`warehouseStocktakeForm.js`](../miniprogram/utils/warehouseStocktakeForm.js) | 盘点列表/表单 |
| [`utils/warehouseFlow.js`](../miniprogram/utils/warehouseFlow.js) | 流水聚合/筛选/详情路由 |

**API**：`GET /psi/stock-snapshot` · `GET /psi/stock/batches` · `GET /psi/records?type=TRANSFER|STOCKTAKE` · `POST /psi/records/batch` · `PUT /psi/records/replace` · `GET /psi/next-doc-number` · `GET /production/records?types=STOCK_*` · `GET /settings/warehouses?all=true`

**权限**：`psi:warehouse_list:view` · `psi:warehouse_transfer:view/create/edit/delete` · `psi:warehouse_stocktake:view/create/edit/delete` · `psi:warehouse_flow:allow`

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-warehouse` → `/pages/psi-warehouses/psi-warehouses`（应用中心）。

## 返工管理

对齐 Web [`ReworkPanel`](../views/production-ops/ReworkPanel.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 返工 Hub | [`pages/production-rework/`](../miniprogram/pages/production-rework/) | 主列表（工单/产品 × 返工工序标签）、搜索/筛选、待处理不良/流水快捷入口、详情/物料/扫码报工 |
| 待处理不良 | [`pages/production-rework-pending/`](../miniprogram/pages/production-rework-pending/) | 不良待处理列表 + 搜索/工序筛选 |
| 处理不良 | [`pages/production-rework-defect-action/`](../miniprogram/pages/production-rework-defect-action/) | 报损/厂内返工/委外返工；返工目标工序与 Web 一致（产品工艺全工序 + 其他工序，可多选） |
| 返工报工 | [`pages/production-rework-report/`](../miniprogram/pages/production-rework-report/) | 手输返工报工（路径分组、矩阵、人员/设备/加工费、跳转扫码）；单产品时价格区为「数量 + 单价 + 金额」一行（简单路径可编辑数量，矩阵为已填合计只读） |
| 返工详情 | [`pages/production-rework-detail/`](../miniprogram/pages/production-rework-detail/) | 工序不良汇总、返工进度、处理/报工记录只读 |
| 处理不良流水 | [`pages/production-rework-defect-flow/`](../miniprogram/pages/production-rework-defect-flow/) | REWORK+SCRAP 按 docNo 聚合列表 |
| 处理不良详情 | [`pages/production-rework-defect-flow-detail/`](../miniprogram/pages/production-rework-defect-flow-detail/) | 查看/编辑/删除 |
| 返工报工流水 | [`pages/production-rework-report-flow/`](../miniprogram/pages/production-rework-report-flow/) | REWORK_REPORT 流水列表 |
| 报工流水详情 | [`pages/production-rework-report-flow-detail/`](../miniprogram/pages/production-rework-report-flow-detail/) | 查看/编辑/删除 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/productionRework.js`](../miniprogram/config/productionRework.js) | 快捷入口、`DESKTOP_HINT` |
| [`utils/reworkPanelLite.js`](../miniprogram/utils/reworkPanelLite.js) | 主列表聚合与搜索 |
| [`utils/reworkPendingLite.js`](../miniprogram/utils/reworkPendingLite.js) | 待处理不良行计算 |
| [`utils/reworkReportGroupLite.js`](../miniprogram/utils/reworkReportGroupLite.js) | 返工报工路径分组（扫码/手输共用） |
| [`utils/reworkDefectAction.js`](../miniprogram/utils/reworkDefectAction.js) | 处理不良提交 payload |
| [`utils/reworkReportSubmit.js`](../miniprogram/utils/reworkReportSubmit.js) | 手输返工报工提交 |
| [`utils/reworkDefectFlow.js`](../miniprogram/utils/reworkDefectFlow.js) / [`reworkReportFlow.js`](../miniprogram/utils/reworkReportFlow.js) | 流水列表 |
| [`utils/reworkDetailLite.js`](../miniprogram/utils/reworkDetailLite.js) | 详情视图 |
| 返工领料 | 复用 [`production-order-material`](../miniprogram/pages/production-order-material/) `?source=rework`，`reason: 来自于返工` |

**API**：`GET /production/records`（`types=REWORK,REWORK_REPORT,SCRAP,OUTSOURCE`）· `POST /production/records` · `POST /production/records/batch` · `PUT/DELETE /production/records/:id` · `POST /item-codes/scan/validate-usage`（`purpose: REWORK_REPORT`）· `GET /settings/config`（`productionLinkMode` / `reworkFormSettings` 只读）

**权限**：`production:rework:view`（入口）· `production:rework_list:allow` · `production:rework_defective:allow` · `production:rework_records:view/edit/delete` · `production:rework_report_records:view/edit/delete` · `production:rework_outsource:allow` · `production:rework_detail:allow` · `production:rework_material:allow`

**深链**：`/pages/production-rework/production-rework?reworkOrderId=<id>` 重定向至详情。

**留 Web**：表单配置、打印。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-rework` → `/pages/production-rework/production-rework`。

## 外协管理

对齐 Web [`OutsourcePanel`](../views/production-ops/OutsourcePanel.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 外协 Hub | [`pages/production-outsource/`](../miniprogram/pages/production-outsource/) | 主列表（工单/产品 × 加工厂工序标签）、搜索/筛选、待发/待收回/流水快捷入口、物料外发/退回 |
| 待发清单 | [`pages/production-outsource-dispatch/`](../miniprogram/pages/production-outsource-dispatch/) | 可外协行多选 → 发出录入 |
| 外协发出 | [`pages/production-outsource-dispatch-confirm/`](../miniprogram/pages/production-outsource-dispatch-confirm/) | 合作单位选择 + 色码矩阵 + 矩阵键盘 → `POST /production/records/batch` |
| 待收回清单 | [`pages/production-outsource-receive/`](../miniprogram/pages/production-outsource-receive/) | 待收回聚合列表、扫码收货入口、多选收回 |
| 外协收回 | [`pages/production-outsource-receive-confirm/`](../miniprogram/pages/production-outsource-receive-confirm/) | 收回数量/单价录入 |
| 外协流水 | [`pages/production-outsource-flow/`](../miniprogram/pages/production-outsource-flow/) | 按日期/类型/工序筛选；列表带产品缩略图，顶栏为「类型 · 工单 · 时间」 |
| 流水详情 | [`pages/production-outsource-flow-detail/`](../miniprogram/pages/production-outsource-flow-detail/) | 发出/收回明细只读 |
| 往来明细 | [`pages/production-outsource-partner-detail/`](../miniprogram/pages/production-outsource-partner-detail/) | 加工厂×工序维度 doc 列表 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/productionOutsource.js`](../miniprogram/config/productionOutsource.js) | 快捷入口、`DESKTOP_HINT` |
| [`utils/outsourcePanelLite.js`](../miniprogram/utils/outsourcePanelLite.js) | 主列表聚合与搜索 |
| [`utils/outsourceDispatchLite.js`](../miniprogram/utils/outsourceDispatchLite.js) | 待发清单可外协量 |
| [`utils/outsourceReceiveAggregates.js`](../miniprogram/utils/outsourceReceiveAggregates.js) | 待收回聚合（跨模式方案 A） |
| [`utils/outsourceFlow.js`](../miniprogram/utils/outsourceFlow.js) | 流水 doc 分组与筛选 |
| [`utils/outsourcePartnerFlowDetail.js`](../miniprogram/utils/outsourcePartnerFlowDetail.js) | 加工厂往来明细 |
| [`utils/outsourceConfirm.js`](../miniprogram/utils/outsourceConfirm.js) | 发出/收回 payload 与单号 |
| [`utils/outsourceMaterialLite.js`](../miniprogram/utils/outsourceMaterialLite.js) | Hub 卡片物料外发/退回 → 复用 `production-stock-out-confirm?source=outsource` |

**API**：`GET /production/records`（`types=OUTSOURCE` / 物料 `STOCK_OUT,STOCK_RETURN`）· `POST /production/records/batch` · `GET /settings/config`（`productionLinkMode` / `outsourceFormSettings`）

**权限**：`production:outsource:view`（入口）· `production:outsource_list:allow` · `production:outsource_send:allow` · `production:outsource_receive:allow` · `production:outsource_records:view` · `production:outsource_material:allow` · `production:outsource_amount:allow`

**留 Web**：外协表单配置、流水编辑/删除/打印、协作链同步、外协收回派生报工编辑/删除。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-outsource` → `/pages/production-outsource/production-outsource`。

## 扫码页业务链路

| 页面 | 路径 | 职责 |
|------|------|------|
| 枢纽 | [`pages/scan/`](../miniprogram/pages/scan/) | 类型入口、最近记录 |
| 预备 | [`pages/scan-setup/`](../miniprogram/pages/scan-setup/) | 已废弃，自动跳转会话页 |
| 会话 | [`pages/scan-session/`](../miniprogram/pages/scan-session/) | 条件选择 + 取景扫码 + 下方本次扫码记录 |

类型目录：[`config/scanTypes.js`](../miniprogram/config/scanTypes.js)

| 类型 | 页内条件 | 扫码后解析 | 写入 |
|------|----------|------------|------|
| 报工 | 工序（底部弹窗选择） | 按码反查工单 + 里程碑 | `POST .../milestones/.../reports` |
| 外协 | 可搜索加工厂（底栏弹层 + 分类 Tab） | 按产品匹配待收回行 | `POST /production/records`（OUTSOURCE 已收回） |
| 返工 | 返工工序（底部弹窗选择） | 按产品匹配返工路径 | `POST /production/records`（REWORK_REPORT） |
| 入库 | —（默认仓库） | 按码反查工单 | `POST /production/records`（STOCK_IN） |
| 查询 | — | 只读 | — |

组件：[`node-chip-select`](../miniprogram/components/node-chip-select/) · [`searchable-partner-select`](../miniprogram/components/searchable-partner-select/)（对齐 Web `SearchablePartnerSelect`）

处理器：[`utils/scanHandlers/`](../miniprogram/utils/scanHandlers/) · 外协聚合 [`outsourceReceiveAggregates.js`](../miniprogram/utils/outsourceReceiveAggregates.js) · 返工路径 [`reworkReportPathsLite.js`](../miniprogram/utils/reworkReportPathsLite.js)

迁移状态详见 [`docs/04-migration-checklist.md`](./04-migration-checklist.md) §10。

## 首页工作台统计

对齐 Web [`WorkbenchView`](../views/workbench/WorkbenchView.tsx) 首页（`page-overview`）：

| 工具 | 作用 |
|------|------|
| [`utils/workbenchHome.js`](../miniprogram/utils/workbenchHome.js) | 解析 `/dashboard/workbench` 首页布局，拉取各统计 API |
| [`utils/workbenchPeriodFilter.js`](../miniprogram/utils/workbenchPeriodFilter.js) | 统计周期筛选（今日 / 昨日 / 本月 / 自定义），对齐 Web [`useWorkbenchPeriodFilter`](../hooks/useWorkbenchPeriodFilter.ts) |
| [`config/workbenchWidgets.js`](../miniprogram/config/workbenchWidgets.js) | 统计组件类型与默认布局 |
| [`components/workbench-stat-card/`](../miniprogram/components/workbench-stat-card/) | 移动端统计卡片 UI（工序类横向滑动芯片；KPI 类紧凑主指标 + 横向指标芯片） |

支持的统计组件：`order_stats` / `outsource_stats` / `rework_stats` / `sales_stats` / `sales_order_stats` / `finance_stats` / `product_economics*`。快捷入口、插件中心、消息中心仍仅在 Web 首页固定区展示；小程序首页仅渲染统计类组件。数据看板顶部提供**全局周期切换**（今日 / 昨日 / 本月 / 自定义日期区间），API 参数与 Web 一致（`period` 或 `startDate`+`endDate`）；布局与增减组件请在电脑端工作台编辑。

## 系统设置

对齐 Web [`SettingsView.tsx`](../views/SettingsView.tsx) 六个 Tab，移动端按业务域分组展示：

| 分组 | 设置项 |
|------|--------|
| 基础档案 | 产品分类管理、合作单位分类 |
| 生产与仓储 | 工序节点库、仓库分类管理 |
| 财务结算 | 收付款类型设置 |
| 业务规则 | 生产业务配置 |

| 页面 | 路径 | 职责 |
|------|------|------|
| 设置首页 | [`pages/settings/`](../miniprogram/pages/settings/) | 分组列表，权限过滤 |
| 设置详情 | [`pages/settings-tab/`](../miniprogram/pages/settings-tab/) | 档案类只读列表；生产配置只读展示 |

配置单一事实源：[`config/settingsTabs.js`](../miniprogram/config/settingsTabs.js)。应用 Tab「系统设置」入口路径 `/pages/settings/settings`。
