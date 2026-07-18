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
| `styles/plan-list-shell.wxss` | 列表页壳（顶栏 / 搜索 / 筛选 / 列表行），主包 `styles/` 与分包页面共用 |
| `styles/order-process-scroll.wxss` | 工序 chip 横向滚动（`order-process-scroll` 组件与 `outsource-shared.wxss` 共用，勿从 `components/` 引用） |

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
| `finance-category-tag-select` | 收/付款单据分类（标签宫格底栏，与日期弹层同高） |
| `finance-account-select` | 收/付款收支账户（列表底栏，与日期弹层同高；无最近使用/添加账户） |
| `datetime-calendar-select` | 创建时间（日历 + 时刻滚轮底栏；无时间启用开关） |
| `matrix-qty-keyboard` | 色码矩阵数量自定义键盘 |
| `batch-return-input` | 采购入库批次（点击选择；弹窗内可选已有批次或输入新批号） |

## 页面壳类型

### A. Tab 页壳（首页 / 应用 / 报工 / 消息 / 我的）

- `navigationStyle: custom`
- **蓝色渐变顶栏** + **白色圆角内容区**（首页自定义布局；其余 Tab 用 `tab-shell` 组件，样式见 [`styles/tab-shell.wxss`](../miniprogram/styles/tab-shell.wxss)）
- 顶栏安全区由 [`utils/tabShell.js`](../miniprogram/utils/tabShell.js) 计算
- 底部使用 `custom-tab-bar`，通常为：首页 → 应用 → **报工（`pages/scan`）** → 消息 → 我的。创建者恒显示首页；成员仅在拥有裸 `workbench` 或任一 `workbench:<pageId>` 时显示首页，没有工作台权限时首页 Tab 会从导航中移除。
- **「应用」Tab**：创建者恒显示；成员若权限**仅含** `process_report`（及 `process_report:*`），或应用中心按 RBAC/插件过滤后无任何入口，则从底栏隐藏；误入应用页会跳转到默认 Tab。
- 登录、启动或切换企业时，无工作台权限但拥有 `process_report` 的成员直接进入「报工」；其它无工作台权限且仍有应用入口的成员进入「应用」。直接停留在首页/应用后权限被撤销时也会自动跳离。

### B. 流程页壳（登录 / 选企业 / 入驻）

- `navigationStyle: custom`
- 顶部 `page-header`（可选 `showBack`）
- `st-page st-page--flow`
- 表单用 `st-card` + `st-input` + `st-btn-primary`

## 入口菜单

RBAC 字段单一事实源：[`shared/workbenchShortcuts.ts`](../shared/workbenchShortcuts.ts)（小程序在 [`miniprogram/config/menus.js`](../miniprogram/config/menus.js) 维护同构 `WORKBENCH_SHORTCUT_CATALOG` + 专属 `path`）。

- `HOME_QUICK_ENTRIES` / `DEFAULT_HOME_SHORTCUT_IDS`：默认快捷 id 列表，与 Web [`DEFAULT_DASHBOARD_SHORTCUT_IDS`](../shared/workbenchShortcuts.ts) 一致
- 首页蓝色区域拉取 `GET /dashboard/shortcuts`，经 [`utils/workbenchShortcuts.js`](../miniprogram/utils/workbenchShortcuts.js) 解析后，用 [`utils/accessControl.js`](../miniprogram/utils/accessControl.js) 的 `filterShortcutsByAccess` 过滤（与 Web `filterWorkbenchShortcutsByAccess` + 协作侧栏规则一致；含 owner 提权、插件开关、协作双门控；`:view` 入口兼容 `view_own`）
- `APP_CATEGORIES`：应用中心，由同文件内 `WORKBENCH_SHORTCUT_CATALOG` 按 `group` 派生；展示顺序见 `APP_GROUP_ORDER`（**插件中心**置顶，其后生产管理、进销存、财务结算、基础信息）
- `buildAppCategories(permissions, keyword, plugins, tenantRole)`：按 RBAC + 插件过滤（`keyword` 保留供扩展，应用页未启用搜索）
- 系统设置 Tab 可见性：`config/settingsTabs.js` 使用 `canViewSettingsTab`（对齐 Web `SettingsView`：`owner` 全开，其余按 `settings:<tab>:view` 与裸 `settings` 模块键）
- **单据「仅本人可见」**：销售订单 / 销售单 / 收款单 / 付款单持 `view_own` 时可进应用中心与列表页（`hasShortcutPerm` / `hasDocViewPermission`）；列表数据仍由后端 `viewerScope` 过滤

### 权限热同步

与 Web [`AuthContext`](../contexts/AuthContext.tsx) 一致：已登录且存在 `tenantCtx` 时，[`utils/tenantCtxSync.js`](../miniprogram/utils/tenantCtxSync.js) 调用 `GET /tenants?all=true` 刷新 `permissions` / `tenantRole` 等。触发点：`app.onShow`、首页/应用/设置 `onShow`、首页下拉刷新。

各业务页 `onShow` 守卫仍用 [`utils/permissions.js`](../miniprogram/utils/permissions.js)（细粒度 API 兜底）；**菜单/快捷入口**勿再单独写过滤逻辑。

插件开关缓存：登录、切租户、登出（`clearSession`）时调用 `clearFeaturePluginsCache()`，与网页重新拉取 `feature-plugins` 对齐。

`icon-grid` 支持可选字段 `iconChar`，在图标中央叠汉字（仅首页常用入口使用）。

## Tab 页面说明

| 页面 | 布局要点 |
|------|----------|
| 首页 | **蓝色顶栏**：头像 + 用户名 + 企业名；单行白色快捷图标；**白色圆角内容区**含数据看板；下拉刷新 |
| 应用 | `tab-shell`：标题「应用」+ 分组宫格卡片（左侧色条分区标题） |
| 报工 | `tab-shell`：需 `process_report`；双段「可报任务 / 我的报工」；**可报任务**按工序 Chip 筛选 + 分组（**工序顺序 = 系统设置工序节点库 sortOrder**；**产品模式**卡片为产品×工序、无工单号）；**我的报工**按审核状态 Chip 筛选（「全部」及单状态均为按报工时间倒序平铺，不按状态分组标题）；列表含产品缩略图；右下扫码 FAB → `worker-report-scan` → `worker-report-confirm`；无权限空态 |
| 消息 | 蓝色顶栏（标题+未读数）+ 全宽搜索框；微信风格会话列表；详情页 `messages-chat` |
| 我的 | `tab-shell` 自定义顶栏（头像 + 用户/企业）+ 菜单白卡片 + 退出按钮 |

**报工审核**（审核员）：[`packageBusiness/production-report-pending/`](../miniprogram/packageBusiness/production-report-pending/)，入口在**工单中心**筛选面板（与「待入库清单」并列），需 `production:orders_report_records:edit`；有待审时显示角标。连续扫码会话仍在 [`packageBusiness/scan-session/`](../miniprogram/packageBusiness/scan-session/)。

### A2. 扫码会话页壳（`pages/scan-session`）

- 栈页面，顶栏 `page-header` 带返回
- 全屏摄像头 + 类型专属条件区 + 手动输入
- `onLoad?type=` 校验权限与类型合法性

## 扫码页交互

- **分流**：枢纽选类型 → **直达会话页**；报工/返工在页内点击行打开底部弹窗选工序，外协在页内搜索选加工厂（弹窗更高）；入库/查询无预备条件
- **连续扫码**：默认开启，无开关；识别后自动继续，结果累积显示在取景框下方
- **批量扫码弹层反馈**（`scan-batch-modal` + [`utils/scanFeedback.js`](../miniprogram/packageBusiness/utils/scanFeedback.js)）：
  - **失败**：弹层顶部红色提示条显示原因，**2 秒后自动消失**；同时播放错误提示音（`assets/sounds/scan-error.wav`）+ 短震动
  - **成功**：不显示文字条，仅播放成功提示音（`assets/sounds/scan-success.wav`）+ 短震动
  - 业务层统一调用 `scanFail(page, message)` 或 `page._scanNotify`（由 `scanBatchController` 挂载）
  - 真机静音模式下可能无声音，震动为降级；开发者工具音频可能受限

## 新页面 Checklist

1. 选择页面壳类型（Tab / 流程）
2. 在页面 `.json` 中注册所需组件
3. 样式只用 `st-*` 类与组件，禁止内联色值
4. 业务入口走 `config/menus.js`，不写死宫格
5. 登录后进入 Tab 页使用 `wx.switchTab`，勿对 Tab 页使用 `reLaunch`
6. 验证安全区与 TabBar 遮挡（`st-page--tab` 已预留底部间距）
7. **表单录入**（合作单位 / 产品 / 色码矩阵 / 数量键盘）遵循下方 §表单录入标准，以 [`production-plan-create`](../miniprogram/packageBusiness/production-plan-create/) 为参考实现
8. **列表/流水/清单**展示产品名称时遵循下方 §产品名称与编号，以 [`production-order-report-history`](../miniprogram/packageBusiness/production-order-report-history/) 为参考实现

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

[`packageBusiness/production-plan-create/`](../miniprogram/packageBusiness/production-plan-create/) — 完整示例：产品 + 客户 + 矩阵 + 键盘 + 表单样式。

已对齐的页面（新功能应与此保持一致）：

| 页面 | 合作单位 | 产品 | 矩阵 | 键盘 |
|------|:--------:|:----:|:----:|:----:|
| 新建生产计划 | — | ✓ | ✓ | ✓ |
| 工单报工 | — | — | ✓（含 Tab 自报工 `production-order-report?selfReport=1`） | ✓ |
| 报工批次编辑 | — | — | ✓ | ✓ |
| 待入库确认 | — | — | ✓ | ✓ |
| 外协发出确认 | ✓ | — | ✓ | ✓ |
| 扫码外协收回 | ✓ | — | — | — |
| 登记/编辑采购订单 | — | ✓ | ✓ | ✓ |
| 登记/编辑采购入库 | ✓ | ✓ | ✓ | ✓ |

### 底栏选择器与「保存单据」穿透

页面 fixed 底栏（`plan-create-footer` 等，`z-index:100`）与组件内 fixed 弹层不在同一层叠上下文，弹层打开时底栏会透出。统一约定：

- [`openBottomSheet` / `closeBottomSheet`](../miniprogram/utils/bottomSheetAnim.js) **自动**维护当前页 `pickerSheetOpen`（深度计数，支持嵌套弹层）
- 页面 `data` 须有 `pickerSheetOpen: false`
- 底栏提交区：`wx:if="{{!pickerSheetOpen}}"`（与矩阵键盘并存：`!matrixKeyboardVisible && !pickerSheetOpen`）
- 可选：组件仍可 `bind:sheetopen` / `bind:sheetclose`；与中央计数并存时勿再单独用关闭事件把 `pickerSheetOpen` 设为 false 覆盖深度（当前页面 handler 仅 `setData` 布尔值，与深度结果一致即可）

适用于：合作单位 / 产品 / 报工人员 / 创建时间 / 单据分类 / 收支账户 等走 `openBottomSheet` 的选择器。

### 创建时间（日期+时刻）

单据**新建/编辑**与流水**详情改时间戳**，须用 [`datetime-calendar-select`](../miniprogram/components/datetime-calendar-select/)，禁止 `picker mode="date"` + `picker mode="time"` 拆分。参考 [`finance-receipt-edit`](../miniprogram/packageFinance/finance-receipt-edit/)：

- 组件：`bind:change` 一次写入 date/time
- 底栏提交：见上节 `pickerSheetOpen` 约定
- **例外**：列表/流水筛选的纯日期区间（`dateFrom`/`dateTo`）仍可用 `picker mode="date"`

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
| `searchable-product-select` | [`components/searchable-product-select/`](../miniprogram/components/searchable-product-select/) | 产品（搜索 + 分类 Tab + 缩略图/SKU）；**弹层统一**对齐生产计划新建：顶栏「取消 / 标题」、约 75% 屏高；`cell` / `embedded` 只影响触发行样式，不影响弹层 |
| `finance-category-tag-select` | [`components/finance-category-tag-select/`](../miniprogram/components/finance-category-tag-select/) | 收/付款单据分类：5 列图标标签宫格，底栏与创建时间同高（约 55%）；统一细线简约 `finance-category` 图标；仅一项时不显示已选高亮；无「最近使用」/分组标题 |
| `finance-account-select` | [`components/finance-account-select/`](../miniprogram/components/finance-account-select/) | 收/付款收支账户与转账转出/转入：列表行（蓝线 `wallet` 图标 + 名称 + 余额副标题 + 勾选）；`valueMode=name|id`；底栏与创建时间同高（约 55%）；仅一项时不显示勾选；无「最近使用」/「添加账户」 |
| `datetime-calendar-select` | [`components/datetime-calendar-select/`](../miniprogram/components/datetime-calendar-select/) | 创建时间：日历选日 + 点「时刻」进时分滚轮；点月标题进年月滚轮；无时间启用开关；右上角「完成」提交；底栏约 55% 屏高 |
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
- **样式**：`@import` [`production-plan-create.wxss`](../miniprogram/packageBusiness/production-plan-create/production-plan-create.wxss)；需展示「最多 N」时叠加 `report-matrix`（见报工 / 外协发出页）。

## 小程序包体结构（按微信官方代码包体积优化）

参考：[代码包体积优化](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeA.html)、[社区性能优化指南](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。

| 包 | root | 内容 |
|---|---|---|
| 主包 | `miniprogram/` | Tab/登录等；**多分包共用**的 `utils/`、`components/`（选择器、矩阵键盘等）、`styles/` |
| 生产分包 | `packageBusiness` | 计划/工单/外协/返工/物料/基础档案等 |
| 进销存分包 | `packagePsi` | 采购/销售/仓库 |
| 财务分包 | `packageFinance` | 收款/付款/对账/资金账户 |

约定：

1. **仅单一分包使用的代码**放在该分包内，不要塞进主包（避免「主包仅被分包依赖」）。例如：`scan-batch-modal` → `packageBusiness`；`batch-return-input` → `packagePsi`。
2. **两个及以上分包都要用的**组件/工具/样式放主包（主包定位：公共资源），如矩阵键盘、可搜索选择器、`orderApi` / `saveNavigation`。
3. 分包之间**不可** `require` / `@import` / 引用对方组件；跨包跳转用绝对路径（`/packagePsi/...`）。
4. `preloadRule` 仅在 Wi‑Fi 下预下载高频的 `business` 分包，避免一进应用就拉满全量业务包。
5. 已开启 `"lazyCodeLoading": "requiredComponents"`（按需注入）；定期用开发者工具「代码质量 / 依赖分析」清理无依赖文件。

### 矩阵键盘

- 页面底部挂载 `<matrix-qty-keyboard visible="{{matrixKeyboardVisible}}" bind:action="onMatrixKeyboardAction" />`。
- 逻辑统一走 [`utils/matrixQtyKeyboard.js`](../miniprogram/utils/matrixQtyKeyboard.js)：`createMatrixKeyboardInputSession`、`activateMatrixKeyboardCell`、`applyMatrixKeyboardKey`（选中格后**首键整格替换**）、`buildMatrixKeyboardPreview`、`getNextMatrixVariantIdInRow`、`getNextMatrixVariantIdInColumn`。
- 选中待替换时格子上加 `plan-create-matrix__input--replace`（浅蓝底提示）。
- **滚动容器约定**（所有矩阵键盘页统一）：
  - 纵向 `scroll-view`：`scroll-y` + `enhanced` + `scroll-top="{{matrixScrollTop}}"` + `scroll-with-animation="{{false}}"`
  - `data.matrixScrollTop: 0`
  - 内容区加 `matrix-keyboard-page--open`（底部留白）；[`utils/matrixKeyboardLayout.js`](../miniprogram/utils/matrixKeyboardLayout.js) `afterMatrixKeyboardOpen(page, '.xxx-scroll')` **仅微调**当前激活格到键盘上方，**禁止** `scroll-into-view` 钉顶
- **收起**：点键盘「完成」，或点矩阵输入格以外的表单空白区（`onMatrixOutsideTap` → `confirm`）；矩阵格用 `catchtap` 切格不误关。不铺全屏 mask，键盘弹出后表单仍可滚动。

### 分包体积

- 单包上限 2MB。超限时优先**按业务再拆分包**，公共能力留主包；勿用「全塞主包」规避。

### 禁止项

- 用 `picker mode="date"` + `picker mode="time"` 拆分录入单据创建时间（须用 `datetime-calendar-select`；列表筛选纯日期除外）。
- 用 `picker mode="selector"` 选合作单位、产品、收/付款单据分类或收支账户（历史筛选 Tab、仓库等枚举除外）。
- 在页面 WXML 内复制粘贴自建数字键盘（须用 `matrix-qty-keyboard`）。
- 各页自行定义矩阵表格样式（须复用 `plan-create-matrix*`）。

## 保存后导航

单据保存/提交成功后**统一回到所属列表页**，工具：[`utils/saveNavigation.js`](../miniprogram/packageBusiness/utils/saveNavigation.js) 的 `afterSaveReturnToList` + `LIST_ROUTES` / `MODULE_HUB_ROUTES`。

### 规则

1. **新建 / 确认 / 处置类**（一次性提交）→ 回到**模块 Hub 主列表**（见下表 `MODULE_HUB_ROUTES`）
   - 例外：从明确**子清单**进入的确认页（待入库）→ 回到该子清单；**外协发出 / 外协收回确认**成功后回到外协 Hub（`OUTSOURCE_HUB`），不再停留在待发/待收回清单
2. **流水 / 批次详情**编辑或删除 → 回到对应**流水列表**（不跳详情、不停留在编辑页）
3. 栈内已有目标列表时 `navigateBack` + `_refreshOnNextShow`；否则 `redirectTo`
4. 成功后先 `wx.showToast`，约 400ms 后跳转
5. **Hub 列表刷新**：目标列表页 `onHide` 调 `trackHubListHidden(this)`；`onShow` 用 `shouldHubListRefetch(page, route)` 判断；为真时须 `bootstrap` / 重新请求 API，不能只重筛本地缓存；下拉刷新 `reloadList` 亦须重新拉数
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
| 外协发出确认 | `OUTSOURCE_HUB` |
| 外协收回确认 | `OUTSOURCE_HUB` |
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
| 账户转账（新建/编辑/删除） | `FINANCE_ACCOUNTS` |
| 新建/编辑产品 | `BASIC_PRODUCTS` |
| 新建/编辑合作单位 | `BASIC_PARTNERS` |

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

进入「消息中心」会话时自动标记系统消息已读；Tab 角标 = 未读消息 + 未完成待办 + 协作待处理。点击气泡可查看详情（待办气泡经 [`utils/todoNavigate.js`](../miniprogram/utils/todoNavigate.js) 深链到小程序详情）；协作操作提示去电脑端处理。

完整待办管理（对齐 Web `TodoPanelModal`）见下方「待办提醒」节；消息 Tab 内「待办事项」会话为快捷时间轴视图。

## 生产计划

对齐 Web [`PlanOrderListView`](../views/PlanOrderListView.tsx)（P2 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 计划列表 | [`packageBusiness/production-plans/`](../miniprogram/packageBusiness/production-plans/) | 分页列表、搜索/派发状态筛选、采购到货进度条、下拉刷新 |
| 计划详情 | [`packageBusiness/production-plan-detail/`](../miniprogram/packageBusiness/production-plan-detail/) | 对齐 Web：基础信息/数量/工序/BOM 横向表格（可左右滑动）；下达工单；点产品名称打开只读商品信息（与资料库共用 `product-quick-detail`） |
| 新建计划 | [`packageBusiness/production-plan-create/`](../miniprogram/packageBusiness/production-plan-create/) | 简化新建（产品+数量+客户+交期） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/productionPlans.js`](../miniprogram/config/productionPlans.js) | 派发状态常量、筛选 Tab |
| [`utils/productionPlans.js`](../miniprogram/utils/productionPlans.js) | 搜索解析、列表/详情 UI 模型 |
| [`utils/planApi.js`](../miniprogram/utils/planApi.js) | `/plans`、`/psi/plans-purchase-progress` 等 API 封装 |
| [`components/searchable-product-select/`](../miniprogram/components/searchable-product-select/) | 新建页产品选择 |
| [`components/searchable-partner-select/`](../miniprogram/components/searchable-partner-select/) | 合作单位 / 客户选择 |
| [`components/matrix-qty-keyboard/`](../miniprogram/components/matrix-qty-keyboard/) | 色码矩阵数量键盘 |

表单录入完整约定见本文 §表单录入标准（默认）；参考页 [`production-plan-create`](../miniprogram/packageBusiness/production-plan-create/)。
**API**：`GET /plans`（分页 + `search` / `dispatchStatus` / `excludeCompleted`）· `GET /plans/:id` · `POST /plans` · `POST /plans/:id/convert` · `POST /psi/plans-purchase-progress` · `GET /psi/plan-related`

**权限**：`production:plans:view`（列表/详情）· `production:plans:create`（新建，另需 `basic:products:view`）· `production:plans:edit`（下达工单）

**深链**：`/packageBusiness/production-plans/production-plans?planId=<id>` 重定向至详情页。

**留 Web**：BOM 用料编辑、生成采购订单、追溯码、打印、表单配置、删除/子计划。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-plans` → `/packageBusiness/production-plans/production-plans`（首页快捷入口 / 应用中心）。

## 工单中心

对齐 Web [`OrderListView`](../views/OrderListView.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 工单列表 | [`packageBusiness/production-orders/`](../miniprogram/packageBusiness/production-orders/) | **订单模式**：分页工单行、搜索/仅未完成、父子分组、工序横向卡；**产品模式**：一产品一聚合卡（合计件数 + PMP 双路工序数字），点 chip 进产品报工；本地分批渲染；隐藏派发 pill / 仅未完成 / 工单详情与返工入口；筛选面板含工单流水 / 报工流水 / 待入库清单入口 |
| 工单流水 | [`packageBusiness/production-order-flow/`](../miniprogram/packageBusiness/production-order-flow/) | 按日期/工单号/产品筛选的只读工单流水列表 + 底部汇总 |
| 工单详情 | [`packageBusiness/production-order-detail/`](../miniprogram/packageBusiness/production-order-detail/) | **订单模式**：基础信息、工序进度 chips（可点报工）、数量明细、报工汇总、物料、外协；派发状态切换 |
| 产品生产详情 | [`packageBusiness/production-product-detail/`](../miniprogram/packageBusiness/production-product-detail/) | **产品模式**工单中心产品组卡「详情」：对齐 Web `ProductProductionDetailModal`（摘要、工序报工汇总、物料、外协、关联工单） |
| 工单报工 | [`packageBusiness/production-order-report/`](../miniprogram/packageBusiness/production-order-report/) | 单规格/多规格/矩阵报工（良品·不良切换）；工序开启「报工时记录重量」时额外录入本次交货总重量并实时预览按 BOM 占比（多规格合并，[`utils/bomWeightUsageLite.js`](../miniprogram/packageBusiness/utils/bomWeightUsageLite.js)）拆分的物料消耗，提交按良品数量分摊 `weight` 逐条落库 |
| 报工流水 | [`packageBusiness/production-order-report-history/`](../miniprogram/packageBusiness/production-order-report-history/) | 全局或单工单报工流水；按批次聚合；顶栏单搜索框 + 日期筛选；点击进入批次详情 |
| 报工批次详情 | [`packageBusiness/production-order-report-batch-detail/`](../miniprogram/packageBusiness/production-order-report-batch-detail/) | 对齐 Web `ReportBatchDetailModal`：汇总、颜色尺码矩阵、明细行；支持编辑/删除（外协收回仅电脑端） |
| 待入库 | [`packageBusiness/production-order-pending-stock/`](../miniprogram/packageBusiness/production-order-pending-stock/) | **清单模式**：多工单待入库列表；**单工单模式**：摘要 + 简入库 + 跳转扫码 |
| 领料 | [`packageBusiness/production-order-material/`](../miniprogram/packageBusiness/production-order-material/) | BOM 待发清单 + 简 STOCK_OUT |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/productionOrders.js`](../miniprogram/config/productionOrders.js) | 派发状态常量、桌面端提示、`ORDER_CENTER_SHORTCUTS` 筛选面板快捷入口 |
| [`utils/productionOrders.js`](../miniprogram/utils/productionOrders.js) | 列表分组、搜索、详情 UI 模型 |
| [`utils/orderFlow.js`](../miniprogram/utils/orderFlow.js) | 工单流水筛选/排序/行模型 |
| [`utils/orderReportHistory.js`](../miniprogram/utils/orderReportHistory.js) | 报工流水行模型、日期转换、客户端筛选 |
| [`utils/reportBatchDetail.js`](../miniprogram/utils/reportBatchDetail.js) | 报工批次分组、详情视图、编辑时间工具 |
| [`utils/pendingStockBadge.js`](../miniprogram/utils/pendingStockBadge.js) | 待入库角标与清单数据加载 |
| [`utils/orderProcessChips.js`](../miniprogram/packageBusiness/utils/orderProcessChips.js) | 订单模式工序进度卡：已报仅计审核通过；可报不扣待审（与 Web 工单中心一致） |
| [`utils/productGroupChips.js`](../miniprogram/packageBusiness/utils/productGroupChips.js) | 产品模式产品组卡工序：已报 = PMP.completedQuantity + 里程碑 completedQuantity；可报 = `productGroupMaxReportableSum` |
| [`utils/productReportHints.js`](../miniprogram/packageBusiness/utils/productReportHints.js) | 产品模式报工页可报上限（与 Web / 组卡 `productGroupMaxReportableSum` 对齐） |
| [`utils/orderApi.js`](../miniprogram/packageBusiness/utils/orderApi.js) | `/orders`、`/orders/product-progress`、`/production/records` 等 API |
| [`components/report-sheet/`](../miniprogram/components/report-sheet/) | 手输报工底部弹层 |
| [`components/order-process-scroll/`](../miniprogram/components/order-process-scroll/) | 列表行内工序横向卡 |

**API**：`GET /orders`（分页 + `search` / `excludeCompleted`）· `GET /orders/:id` · `PUT /orders/:id` · `PATCH /orders/:id/dispatch-status` · `POST .../reports` · `GET /orders/report-history` · `PUT/DELETE .../reports/:reportId` · `PUT/DELETE /orders/product-progress/report/:reportId` · `POST /production/records`

**权限**：`production:orders_list:allow`（列表）· `production:orders_detail:view|edit` · `production:orders_report_records:create|view` · `production:orders_pending_stock_in`（任意子权限）· `production:orders_material:allow`

**深链**：`/packageBusiness/production-orders/production-orders?orderId=<id>` 重定向至详情。计划下达成功可跳转首个新工单详情。

**留 Web**：工单新建（仅计划下达）、删除、表单配置、打印、色码矩阵报工、待入库批量/矩阵/入库流水。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-orders` → `/packageBusiness/production-orders/production-orders`。

## 采购订单

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 采购订单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 采购订单 Hub | [`packagePsi/psi-purchase-orders/`](../miniprogram/packagePsi/psi-purchase-orders/) | 按单号分组卡片列表（布局对齐销售订单：供应商+单号，下一行日期/经办，右侧总件数/金额；行内入库进度+数量·单价·金额三列卡片）、搜索/仅未交清筛选、新建入口 |
| 采购订单详情 | [`packageBusiness/psi-purchase-order-detail/`](../miniprogram/packageBusiness/psi-purchase-order-detail/) | 供应商/单号/明细/行级入库进度；编辑/删除 |
| 登记/编辑 | [`packageBusiness/psi-purchase-order-edit/`](../miniprogram/packageBusiness/psi-purchase-order-edit/) | 供应商、多行明细、色码矩阵、保存/删除 |
| 订单流水 | [`packageBusiness/psi-purchase-order-flow/`](../miniprogram/packageBusiness/psi-purchase-order-flow/) | 行级履约流水（未入库/部分/已入库筛选） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/purchaseOrders.js`](../miniprogram/config/purchaseOrders.js) | PSI 类型常量、流水状态筛选、`PURCHASE_ORDER_SHORTCUTS` |
| [`utils/psiApi.js`](../miniprogram/utils/psiApi.js) | `/psi/records*`、`next-doc-number`、`last-purchase-prices` |
| [`utils/psiOpsAggregators.js`](../miniprogram/utils/psiOpsAggregators.js) | 按单号分组、入库汇总、未交清判断 |
| [`utils/purchaseOrders.js`](../miniprogram/utils/purchaseOrders.js) | 列表/详情/流水 view-model |
| [`utils/purchaseOrderForm.js`](../miniprogram/utils/purchaseOrderForm.js) | 表单状态、校验、保存 payload |

**API**：`GET /psi/records?type=PURCHASE_ORDER`（客户端拉全量分组）· 并行拉 `PURCHASE_BILL` 计算 `receivedByOrderLine` · `POST /psi/records/batch` · `PUT /psi/records/replace` · `DELETE /psi/records` · `GET /psi/next-doc-number` · `POST /psi/last-purchase-prices`

**权限**：`psi:purchase_order:view` · `psi:purchase_order:create` · `psi:purchase_order:edit` · `psi:purchase_order:delete` · `psi:purchase_order:amount`

**深链**：`/packageBusiness/psi-purchase-orders/psi-purchase-orders?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段、关联产品、从计划生成采购订单。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-purchase-order` → `/packageBusiness/psi-purchase-orders/psi-purchase-orders`（首页快捷 / 应用中心）。

## 销售订单

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 销售订单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 销售订单 Hub | [`packagePsi/psi-sales-orders/`](../miniprogram/packagePsi/psi-sales-orders/) | 按单号分组卡片列表（头区状态标签右侧为总件数/金额；行内品名标签右侧为发货进度+配货，发齐后配货位显示「已发齐」）、搜索/仅未发齐筛选、行级配货/发货进度预览、新建入口 |
| 销售订单详情 | [`packageBusiness/psi-sales-order-detail/`](../miniprogram/packageBusiness/psi-sales-order-detail/) | 客户/单号/明细/行级进度；配货入口；编辑/删除 |
| 登记/编辑 | [`packageBusiness/psi-sales-order-edit/`](../miniprogram/packageBusiness/psi-sales-order-edit/) | 客户、多行明细、色码矩阵、销售价、保存/删除 |
| 订单流水 | [`packageBusiness/psi-sales-order-flow/`](../miniprogram/packageBusiness/psi-sales-order-flow/) | 行级发货流水（未发货/发部分/已发齐筛选） |
| 配货 | [`packageBusiness/psi-sales-order-allocate/`](../miniprogram/packageBusiness/psi-sales-order-allocate/) | 按行组配货、出库仓库、色码矩阵 |
| 待发货清单 | [`packageBusiness/psi-sales-order-pending-ship/`](../miniprogram/packageBusiness/psi-sales-order-pending-ship/) | 已配未发汇总、多选生成销售单 |

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

**深链**：`/packageBusiness/psi-sales-orders/psi-sales-orders?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-sales-order` → `/packageBusiness/psi-sales-orders/psi-sales-orders`（首页快捷 / 应用中心）。

## 销售单

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 销售单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 销售单 Hub | [`packagePsi/psi-sales-bills/`](../miniprogram/packagePsi/psi-sales-bills/) | 按单号分组卡片列表（布局对齐销售订单：头区客户下一行日期/经办/仓库，右侧总件数/金额；行内数量·销售价·金额三列卡片）、搜索、流水快捷入口、新建 |
| 销售单详情 | [`packageBusiness/psi-sales-bill-detail/`](../miniprogram/packageBusiness/psi-sales-bill-detail/) | 客户/单号/出库仓库/明细/批次；编辑/删除 |
| 登记/编辑 | [`packageBusiness/psi-sales-bill-edit/`](../miniprogram/packageBusiness/psi-sales-bill-edit/) | 客户、出库仓库、多行明细、色码矩阵、销售价、出库批次、保存/删除 |
| 销售流水 | [`packageBusiness/psi-sales-bill-flow/`](../miniprogram/packageBusiness/psi-sales-bill-flow/) | 行级出库流水（日期/搜索筛选） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/salesBills.js`](../miniprogram/config/salesBills.js) | PSI 类型常量、`SALES_BILL_SHORTCUTS` |
| [`utils/salesBills.js`](../miniprogram/utils/salesBills.js) | 列表/详情/流水 view-model |
| [`utils/salesBillForm.js`](../miniprogram/utils/salesBillForm.js) | 表单状态、校验、保存 payload |
| [`utils/purchaseBillBatch.js`](../miniprogram/utils/purchaseBillBatch.js) | 出库批次本地库存合并（复用） |
| [`utils/psiPartnerProductLastPrice.js`](../miniprogram/utils/psiPartnerProductLastPrice.js) | 客户+商品默认销售价 |

**API**：`GET /psi/records?type=SALES_BILL` · `POST /psi/records/batch` · `PUT /psi/records/replace` · `DELETE /psi/records` · `GET /psi/next-doc-number`（XS / SB）

**权限**：`psi:sales_bill:view` · `psi:sales_bill:create` · `psi:sales_bill:edit` · `psi:sales_bill:delete` · `psi:sales_bill:amount`

**深链**：`/packageBusiness/psi-sales-bills/psi-sales-bills?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-sales-bill` → `/packageBusiness/psi-sales-bills/psi-sales-bills`（应用中心）。

## 收款单

对齐 Web [`FinanceOpsView`](../views/FinanceOpsView.tsx) 收款单 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 收款单 Hub | [`packageFinance/finance-receipts/`](../miniprogram/packageFinance/finance-receipts/) | 分页列表（含**经办人**）、搜索、流水快捷入口、新建 |
| 收款单详情 | [`packageFinance/finance-receipt-detail/`](../miniprogram/packageFinance/finance-receipt-detail/) | 分类/客户/账户/工人/产品/自定义内容（**图片可预览**）/金额/**业务时间**/**经办人**；编辑/删除 |
| 登记/编辑 | [`packageFinance/finance-receipt-edit/`](../miniprogram/packageFinance/finance-receipt-edit/) | **日历式**创建时间（`datetime-calendar-select`）、**标签式**单据分类（`finance-category-tag-select`）、**列表式**收支账户（`finance-account-select`）、分类联动（合作单位/工人/产品）、**类型自定义内容**、金额、备注 |
| 收款流水 | [`packageFinance/finance-receipt-flow/`](../miniprogram/packageFinance/finance-receipt-flow/) | 日期/搜索筛选流水 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/financeReceipts.js`](../miniprogram/packageFinance/config/financeReceipts.js) | `RECEIPT` 类型常量 |
| [`utils/financeApi.js`](../miniprogram/utils/financeApi.js) | `/finance/records` CRUD、分类/账户/插件读取 |
| [`utils/financeRecords.js`](../miniprogram/packageFinance/utils/financeRecords.js) | 收/付款共用 view-model（含分类 `customFields`） |
| [`utils/financeReceipts.js`](../miniprogram/packageFinance/utils/financeReceipts.js) | 收款单适配层 |

**自定义内容**：与网页端一致，字段定义来自收付款类型（`FinanceCategory.customFields`），非 `receiptFormSettings`。支持 text / date / select / **file（图片或 PDF/Office，data URL 落库，限 4MB；表单/详情预览为右侧 144rpx 正方形缩略图）**；knowledge 仍提示「请在电脑端填写」。日期支持 `dateAutoFill`；必填项带 `*` 并在保存时校验。**详情页**：file 类图片展示右侧方图，点击 `wx.previewImage` 查看大图。

**API**：`GET/POST /finance/records` · `GET/PUT/DELETE /finance/records/:id` · `GET /settings/finance-categories` · `GET /settings/finance-account-types` · `GET /dashboard/feature-plugins`（资金账户插件）· `GET /products`（分类开启「关联产品」时）

**权限**：`finance:receipt:view` · `finance:receipt:create` · `finance:receipt:edit` · `finance:receipt:delete`。登记页只读依赖（收付款类型 / 产品 / 合作单位 / 工人 / 收支账户类型）对持有任意 `finance:*` 的角色放行，无需再勾 `settings:finance_categories:view` 或 `basic:products:view`；否则分类上的「关联产品」开关不生效。

**深链**：`/packageFinance/finance-receipts/finance-receipts?id=<id>` 重定向至详情。

**留 Web**：列表/详情打印；资料库（knowledge）类自定义字段。

入口：[`menus.js`](../miniprogram/config/menus.js) `finance-receipt` → `/packageFinance/finance-receipts/finance-receipts`（首页快捷 / 应用中心）。

## 付款单

对齐 Web [`FinanceOpsView`](../views/FinanceOpsView.tsx) 付款单 Tab，结构复用收款单：

| 页面 | 路径 | 职责 |
|------|------|------|
| 付款单 Hub | [`packageFinance/finance-payments/`](../miniprogram/packageFinance/finance-payments/) | 分页列表（含**经办人**）、搜索、流水快捷入口、新建 |
| 付款单详情 | [`packageFinance/finance-payment-detail/`](../miniprogram/packageFinance/finance-payment-detail/) | 分类/收款单位/账户/工人/产品/自定义内容（**图片可预览**）/金额/**业务时间**/**经办人**；编辑/删除 |
| 登记/编辑 | [`packageFinance/finance-payment-edit/`](../miniprogram/packageFinance/finance-payment-edit/) | **日历式**创建时间、**标签式**单据分类、**列表式**收支账户、分类联动、**类型自定义内容**、收款单位/个人、金额、备注 |
| 付款流水 | [`packageFinance/finance-payment-flow/`](../miniprogram/packageFinance/finance-payment-flow/) | 日期/搜索筛选流水，底部合计栏 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/financePayments.js`](../miniprogram/packageFinance/config/financePayments.js) | `PAYMENT` 类型常量 |
| [`utils/financeRecords.js`](../miniprogram/packageFinance/utils/financeRecords.js) | 收/付款共用 view-model |
| [`utils/financePayments.js`](../miniprogram/packageFinance/utils/financePayments.js) | 付款单适配层 |
| [`utils/financeApi.js`](../miniprogram/utils/financeApi.js) | `/finance/records` CRUD |

**API / 权限**：与收款单相同接口，`type=PAYMENT`；`finance:payment:view|create|edit|delete`

**深链**：`/packageFinance/finance-payments/finance-payments?id=<id>` 重定向至详情。

**留 Web**：列表/详情打印；资料库（knowledge）类自定义字段。

入口：[`menus.js`](../miniprogram/config/menus.js) `finance-payment` → `/packageFinance/finance-payments/finance-payments`（应用中心）。

## 财务对账

对齐 Web [`FinanceOpsView`](../views/FinanceOpsView.tsx) 对账 Tab（只读查询，P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 财务对账 | [`packageBusiness/finance-reconciliation/`](../miniprogram/packageBusiness/finance-reconciliation/) | 合作单位 / 报工结算双 Tab；日期 + 对方筛选；查询后展示汇总与应收增减流水 |
| 报工单详情 | [`packageBusiness/finance-recon-work-detail/`](../miniprogram/packageBusiness/finance-recon-work-detail/) | 报工结算行的汇总与明细行（只读） |

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

入口：[`menus.js`](../miniprogram/config/menus.js) `finance-reconciliation` → `/packageBusiness/finance-reconciliation/finance-reconciliation`。

## 资金账户

对齐 Web [`AccountBalancesTab`](../views/finance/AccountBalancesTab.tsx) / [`AccountTransferModal`](../views/finance/AccountTransferModal.tsx) / [`AccountTypesModal`](../views/settings/AccountTypesModal.tsx)（P2+ 移动端口径），由功能插件 `funds_account` 门控：

| 页面 | 路径 | 职责 |
|------|------|------|
| 资金账户 Hub | [`packageFinance/finance-accounts/`](../miniprogram/packageFinance/finance-accounts/) | 各账户期初/流入/流出/当前余额实时聚合；今日/本周/本月/全部期间筛选；合计卡；未归账行；转账与账户管理入口 |
| 账户流水 | [`packageFinance/finance-account-flow/`](../miniprogram/packageFinance/finance-account-flow/) | 单账户（含「未归账」哨兵）收付流水下钻；搜索、分页；普通行跳收/付款详情，转账行跳转账编辑 |
| 账户转账 | [`packageFinance/finance-account-transfer/`](../miniprogram/packageFinance/finance-account-transfer/) | 转出/转入账户（`finance-account-select` 列表底栏）+ 金额 + 备注；编辑/删除按 `transferGroupId` 成对处理 |
| 账户类型 | [`packageFinance/finance-account-types/`](../miniprogram/packageFinance/finance-account-types/) | 账户档案维护：名称、期初余额、期初日期、账户分类；新增/编辑/删除 |

| 工具 | 作用 |
|------|------|
| [`packageFinance/utils/financeAccounts.js`](../miniprogram/packageFinance/utils/financeAccounts.js) | 期间换算、余额/流水/账户类型 view-model、转账校验与编辑入参还原、资金账户可见性（对齐 Web `FinanceView` `canViewAccountTab`） |
| [`utils/financeApi.js`](../miniprogram/utils/financeApi.js) | `getAccountBalances`、`createAccountTransfer` / `updateAccountTransfer` / `deleteAccountTransfer` |
| [`utils/settingsApi.js`](../miniprogram/utils/settingsApi.js) | `financeAccountTypes` CRUD（`/settings/finance-account-types`） |

**API**：`GET /finance/account-balances` · `POST/PUT/DELETE /finance/transfers[/:groupId]` · `GET /finance/records?accountTypeId=...`（`__unassigned__` 哨兵与 Web 一致）· `GET/POST/PUT/DELETE /settings/finance-account-types` · `GET /dashboard/feature-plugins`

**权限**：余额/流水 `finance:account:view`（模块级 `finance` 仅在无任何 `finance:*` 细粒度时放行，口径同 Web）· 转账 `finance:transfer:create|edit|delete` · 账户类型 `settings:finance_account_types:view|create|edit|delete`（owner 全开）

**留 Web**：账户流水详情弹窗内联编辑、列表打印。

入口：[`menus.js`](../miniprogram/config/menus.js) `finance-account` → `/packageFinance/finance-accounts/finance-accounts`（应用中心「财务结算」，小程序专属入口；插件关闭时隐藏）。

## 采购入库

对齐 Web [`PSIOpsView`](../views/PSIOpsView.tsx) 采购入库 Tab（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 采购入库 Hub | [`packagePsi/psi-purchase-bills/`](../miniprogram/packagePsi/psi-purchase-bills/) | 按单号分组卡片列表（布局对齐销售订单/销售单）、搜索、仓库/来源订单展示、新建入口 |
| 采购入库详情 | [`packageBusiness/psi-purchase-bill-detail/`](../miniprogram/packageBusiness/psi-purchase-bill-detail/) | 供应商/单号/仓库/明细；来源订单跳转；编辑/删除 |
| 登记/编辑 | [`packageBusiness/psi-purchase-bill-edit/`](../miniprogram/packageBusiness/psi-purchase-bill-edit/) | 手动创建或引用采购订单、仓库选择、色码矩阵、批次、保存/删除 |
| 入库流水 | [`packageBusiness/psi-purchase-bill-flow/`](../miniprogram/packageBusiness/psi-purchase-bill-flow/) | 行级入库流水（日期/搜索筛选） |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/purchaseBills.js`](../miniprogram/config/purchaseBills.js) | PSI 类型常量、`PURCHASE_BILL_SHORTCUTS` |
| [`utils/purchaseBills.js`](../miniprogram/utils/purchaseBills.js) | 列表/详情/流水 view-model |
| [`utils/purchaseBillForm.js`](../miniprogram/utils/purchaseBillForm.js) | 表单状态、引用订单转化、校验、保存 payload |

**API**：`GET /psi/records?type=PURCHASE_BILL` · 引用订单时并行拉 `PURCHASE_ORDER` 计算待入量 · `POST /psi/records/batch` · `PUT /psi/records/replace` · `DELETE /psi/records` · `GET /psi/next-doc-number` · `GET /settings/warehouses?all=true`

**权限**：`psi:purchase_bill:view` · `psi:purchase_bill:create` · `psi:purchase_bill:edit` · `psi:purchase_bill:delete` · `psi:purchase_bill:amount`

**深链**：`/packageBusiness/psi-purchase-bills/psi-purchase-bills?docNumber=<单号>` 重定向至详情。

**留 Web**：表单配置、列表/详情打印、租户自定义字段、关联产品。

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-purchase-bill` → `/packageBusiness/psi-purchase-bills/psi-purchase-bills`（应用中心）。

## 仓库管理

对齐 Web [`WarehousePanel`](../views/psi-ops/WarehousePanel.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 库存 Hub | [`packageBusiness/psi-warehouses/`](../miniprogram/packageBusiness/psi-warehouses/) | 按仓库/按物料库存列表、搜索、批次展开、快捷入口（流水/盘点/调拨） |
| 库存详情 | [`packageBusiness/psi-warehouse-product-flow/`](../miniprogram/packageBusiness/psi-warehouse-product-flow/) | 单产品（可选单仓）流水只读列表；支持日期/类型/仓库筛选 |
| 调拨单 Hub | [`packageBusiness/psi-warehouse-transfer/`](../miniprogram/packageBusiness/psi-warehouse-transfer/) | 调拨单列表、搜索、新建 |
| 调拨详情 | [`packageBusiness/psi-warehouse-transfer-detail/`](../miniprogram/packageBusiness/psi-warehouse-transfer-detail/) | 调出/调入仓、明细；编辑/删除 |
| 登记/编辑调拨 | [`packageBusiness/psi-warehouse-transfer-edit/`](../miniprogram/packageBusiness/psi-warehouse-transfer-edit/) | 双仓库、产品、矩阵、批次 |
| 盘点单 Hub | [`packageBusiness/psi-warehouse-stocktake/`](../miniprogram/packageBusiness/psi-warehouse-stocktake/) | 盘点单列表、搜索、新建 |
| 盘点详情 | [`packageBusiness/psi-warehouse-stocktake-detail/`](../miniprogram/packageBusiness/psi-warehouse-stocktake-detail/) | 盘点仓、实盘/系统/差异；编辑/删除 |
| 登记/编辑盘点 | [`packageBusiness/psi-warehouse-stocktake-edit/`](../miniprogram/packageBusiness/psi-warehouse-stocktake-edit/) | 单仓库、实盘录入、系统库存展示 |
| 仓库流水 | [`packageBusiness/psi-warehouse-flow/`](../miniprogram/packageBusiness/psi-warehouse-flow/) | 全局流水（日期/类型/仓库/搜索）；行点击跳转各单据详情 |
| 生产退料详情 | [`packageBusiness/psi-warehouse-flow-prod-detail/`](../miniprogram/packageBusiness/psi-warehouse-flow-prod-detail/) | 流水中的 STOCK_RETURN 轻量只读详情 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/warehouses.js`](../miniprogram/config/warehouses.js) | PSI 类型、`WAREHOUSE_SHORTCUTS`、流水类型筛选 |
| [`utils/warehouseStock.js`](../miniprogram/utils/warehouseStock.js) | `stock-snapshot` 客户端索引 |
| [`utils/warehouseInventory.js`](../miniprogram/utils/warehouseInventory.js) | 库存主列表 view-model |
| [`utils/warehouseTransfer.js`](../miniprogram/utils/warehouseTransfer.js) / [`warehouseTransferForm.js`](../miniprogram/utils/warehouseTransferForm.js) | 调拨列表/表单 |
| [`utils/warehouseStocktake.js`](../miniprogram/utils/warehouseStocktake.js) / [`warehouseStocktakeForm.js`](../miniprogram/utils/warehouseStocktakeForm.js) | 盘点列表/表单 |
| [`utils/warehouseFlow.js`](../miniprogram/utils/warehouseFlow.js) | 流水聚合/筛选/详情路由 |

**API**：`GET /psi/stock-snapshot` · `GET /psi/stock/batches` · `GET /psi/records?type=TRANSFER|STOCKTAKE` · `POST /psi/records/batch` · `PUT /psi/records/replace` · `GET /psi/next-doc-number` · `GET /production/records?types=STOCK_*` · `GET /settings/warehouses?all=true`

**权限**：`permAnyOf` 含 `warehouse_list` / `warehouse_stocktake` / `warehouse_transfer` / `warehouse_flow` 任一子键（如 `psi:warehouse_list:allow`）· 各子页另按 `psi:warehouse_*` 细粒度控制

入口：[`menus.js`](../miniprogram/config/menus.js) `psi-warehouse` → `/packageBusiness/psi-warehouses/psi-warehouses`（应用中心）。

## 返工管理

对齐 Web [`ReworkPanel`](../views/production-ops/ReworkPanel.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 返工 Hub | [`packageBusiness/production-rework/`](../miniprogram/packageBusiness/production-rework/) | 主列表（工单/产品 × 返工工序标签）、搜索/筛选、待处理不良/流水快捷入口、详情/物料/扫码报工 |
| 待处理不良 | [`packageBusiness/production-rework-pending/`](../miniprogram/packageBusiness/production-rework-pending/) | 不良待处理列表 + 搜索/工序筛选 |
| 处理不良 | [`packageBusiness/production-rework-defect-action/`](../miniprogram/packageBusiness/production-rework-defect-action/) | 报损/厂内返工/委外返工；返工目标工序与 Web 一致（产品工艺全工序 + 其他工序，可多选） |
| 返工报工 | [`packageBusiness/production-rework-report/`](../miniprogram/packageBusiness/production-rework-report/) | 手输返工报工（路径分组、矩阵、人员/设备/加工费、跳转扫码）；单产品时价格区为「数量 + 单价 + 金额」一行（简单路径可编辑数量，矩阵为已填合计只读） |
| 返工详情 | [`packageBusiness/production-rework-detail/`](../miniprogram/packageBusiness/production-rework-detail/) | 工序不良汇总、返工进度、处理/报工记录只读；`todo_reminder` 开启时可加待办 |
| 处理不良流水 | [`packageBusiness/production-rework-defect-flow/`](../miniprogram/packageBusiness/production-rework-defect-flow/) | REWORK+SCRAP 按 docNo 聚合列表 |
| 处理不良详情 | [`packageBusiness/production-rework-defect-flow-detail/`](../miniprogram/packageBusiness/production-rework-defect-flow-detail/) | 查看/编辑/删除 |
| 返工报工流水 | [`packageBusiness/production-rework-report-flow/`](../miniprogram/packageBusiness/production-rework-report-flow/) | REWORK_REPORT 流水列表 |
| 报工流水详情 | [`packageBusiness/production-rework-report-flow-detail/`](../miniprogram/packageBusiness/production-rework-report-flow-detail/) | 查看/编辑/删除 |

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
| 返工领料 | 复用 [`production-order-material`](../miniprogram/packageBusiness/production-order-material/) `?source=rework`，`reason: 来自于返工` |

**API**：`GET /production/records`（`types=REWORK,REWORK_REPORT,SCRAP,OUTSOURCE`）· `POST /production/records` · `POST /production/records/batch` · `PUT/DELETE /production/records/:id` · `POST /item-codes/scan/validate-usage`（`purpose: REWORK_REPORT`）· `GET /settings/config`（`productionLinkMode` / `reworkFormSettings` 只读）

**权限**：应用中心入口 `permAnyOf` 含 `rework_list` 等返工子模块任一（如 `production:rework_list:allow`）· 各子页按 `production:rework_*` 细粒度控制

**深链**：`/packageBusiness/production-rework/production-rework?reworkOrderId=<id>` 重定向至详情。

**留 Web**：表单配置、打印。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-rework` → `/packageBusiness/production-rework/production-rework`。

## 外协管理

对齐 Web [`OutsourcePanel`](../views/production-ops/OutsourcePanel.tsx)（P2+ 移动端口径）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 外协 Hub | [`packageBusiness/production-outsource/`](../miniprogram/packageBusiness/production-outsource/) | 主列表（工单/产品 × 加工厂工序标签）、搜索/筛选、待发/待收回/流水快捷入口、物料外发/退回 |
| 待发清单 | [`packageBusiness/production-outsource-dispatch/`](../miniprogram/packageBusiness/production-outsource-dispatch/) | 可外协行多选 → 发出录入；同一批次只能勾选同一工序（对齐 Web） |
| 外协发出 | [`packageBusiness/production-outsource-dispatch-confirm/`](../miniprogram/packageBusiness/production-outsource-dispatch-confirm/) | 合作单位选择 + 色码矩阵 + 矩阵键盘 → `POST /production/records/batch` |
| 待收回清单 | [`packageBusiness/production-outsource-receive/`](../miniprogram/packageBusiness/production-outsource-receive/) | 待收回聚合列表、扫码收货入口、多选收回 |
| 外协收回 | [`packageBusiness/production-outsource-receive-confirm/`](../miniprogram/packageBusiness/production-outsource-receive-confirm/) | 收回数量/单价录入；工序开启「报工时记录重量」时额外录入本次交货总重量并预览按 BOM 占比（多规格合并）拆分的物料消耗，提交按数量分摊 `weight` 逐条落库 |
| 外协流水 | [`packageBusiness/production-outsource-flow/`](../miniprogram/packageBusiness/production-outsource-flow/) | 按日期/类型/工序筛选；列表带产品缩略图，顶栏为「类型 · 工单 · 时间」 |
| 流水详情 | [`packageBusiness/production-outsource-flow-detail/`](../miniprogram/packageBusiness/production-outsource-flow-detail/) | 发出/收回明细只读 |
| 往来明细 | [`packageBusiness/production-outsource-partner-detail/`](../miniprogram/packageBusiness/production-outsource-partner-detail/) | 加工厂×工序维度 doc 列表 |

| 工具 / 配置 | 作用 |
|-------------|------|
| [`config/productionOutsource.js`](../miniprogram/config/productionOutsource.js) | 快捷入口、`DESKTOP_HINT` |
| [`utils/outsourcePanelLite.js`](../miniprogram/utils/outsourcePanelLite.js) | 主列表聚合与搜索 |
| [`utils/outsourceDispatchLite.js`](../miniprogram/utils/outsourceDispatchLite.js) | 待发清单可外协量 |
| [`utils/outsourceReceiveAggregates.js`](../miniprogram/utils/outsourceReceiveAggregates.js) | 待收回聚合（跨模式方案 A） |
| [`utils/outsourceFlow.js`](../miniprogram/utils/outsourceFlow.js) | 流水 doc 分组与筛选 |
| [`utils/outsourcePartnerFlowDetail.js`](../miniprogram/utils/outsourcePartnerFlowDetail.js) | 加工厂往来明细 |
| [`utils/outsourceConfirm.js`](../miniprogram/packageBusiness/utils/outsourceConfirm.js) | 发出/收回 payload 与单号 |
| [`utils/outsourceMaterialLite.js`](../miniprogram/packageBusiness/utils/outsourceMaterialLite.js) | 外协物料外发：按「OUTSOURCE·加工中」工序×BOM 筛物料；加工厂选项；Hub / `production-order-material?source=outsource` |

物料外发/退回进入 [`production-order-material`](../miniprogram/packageBusiness/production-order-material/)（`source=outsource`）：Hub 不弹加工厂选择；加工厂在物料页内选择（多个外协工厂时默认「请选择外协工厂」，不预选）。外发清单口径对齐 Web `OutsourceMaterialDispatchModal`（仅在途外协工序对应物料，非全工序 BOM）。

**API**：`GET /production/records`（`types=OUTSOURCE` / 物料 `STOCK_OUT,STOCK_RETURN`）· `POST /production/records/batch` · `GET /settings/config`（`productionLinkMode` / `outsourceFormSettings`）

**权限**：应用中心入口 `permAnyOf` 含 `outsource_list` 等外协子模块任一（如 `production:outsource_list:allow`）· 各子页按 `production:outsource_*` 细粒度控制

**留 Web**：外协表单配置、流水编辑/删除/打印、协作链同步、外协收回派生报工编辑/删除。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-outsource` → `/packageBusiness/production-outsource/production-outsource`。

## 扫码页业务链路

| 页面 | 路径 | 职责 |
|------|------|------|
| 报工 Tab | [`pages/scan/`](../miniprogram/pages/scan/) | 可报任务 + 我的报工（工人）；**产品模式**任务卡按「产品×工序」展示（无工单号），`order` 模式仍为工单×工序；`order` 模式「可报 N」经 [`utils/enrichReportableTasks.js`](../miniprogram/utils/enrichReportableTasks.js) 本地重算；产品模式信任后端 `remaining`；可报任务右下圆形「扫码报工」→ 工序选择弹层 → 工人扫码页 |
| 工人扫码报工 | [`packageBusiness/worker-report-scan/`](../miniprogram/packageBusiness/worker-report-scan/) | 按预选工序模板批量扫码；可跨多张可报工单累加；**产品模式**按产品×工序聚合可报 key 与扫码校验 `PRODUCT_REPORT`；确认后跳转确认页 |
| 工人报工确认 | [`packageBusiness/worker-report-confirm/`](../miniprogram/packageBusiness/worker-report-confirm/) | 布局对齐 `production-order-report`；工单模式逐张 `createOrderReport`；**产品模式**合并后 `createProductReport`；一次提交共用 `reportBatchId`（`PENDING`） |
| 扫码会话 | [`packageBusiness/scan-session/`](../miniprogram/packageBusiness/scan-session/) | 连续扫码作业 |
| 预备 | [`packageBusiness/scan-setup/`](../miniprogram/packageBusiness/scan-setup/) | 已废弃，自动跳转会话页 |
| 会话 | [`packageBusiness/scan-session/`](../miniprogram/packageBusiness/scan-session/) | 条件选择 + 取景扫码 + 下方本次扫码记录 |

类型目录：[`packageBusiness/config/scanTypes.js`](../miniprogram/packageBusiness/config/scanTypes.js)

| 类型 | 页内条件 | 扫码后解析 | 写入 |
|------|----------|------------|------|
| 报工 | 工序（底部弹窗选择） | 按码反查工单 + 里程碑；产品模式校验产品可报 key | 工单：`POST .../milestones/.../reports`；产品：`POST /orders/product-progress/report` |
| 外协 | 可搜索加工厂（底栏弹层 + 分类 Tab） | 按产品匹配待收回行 | `POST /production/records`（OUTSOURCE 已收回） |
| 返工 | 返工工序（底部弹窗选择） | 按产品匹配返工路径 | `POST /production/records`（REWORK_REPORT） |
| 入库 | —（默认仓库） | 按码反查工单 | `POST /production/records`（STOCK_IN） |
| 查询 | — | 只读 | — |

组件：[`node-chip-select`](../miniprogram/components/node-chip-select/) · [`searchable-partner-select`](../miniprogram/components/searchable-partner-select/)（对齐 Web `SearchablePartnerSelect`）

处理器：[`utils/scanHandlers/`](../miniprogram/utils/scanHandlers/) · 外协聚合 [`outsourceReceiveAggregates.js`](../miniprogram/utils/outsourceReceiveAggregates.js) · 返工路径 [`reworkReportPathsLite.js`](../miniprogram/utils/reworkReportPathsLite.js)

迁移状态详见 [`docs/04-migration-checklist.md`](./04-migration-checklist.md) §10。

## 首页工作台统计

对齐 Web [`WorkbenchView`](../views/workbench/WorkbenchView.tsx) 工作台：

| 工具 | 作用 |
|------|------|
| [`utils/workbenchHome.js`](../miniprogram/utils/workbenchHome.js) | 解析 `/dashboard/workbench` 可见页面与布局，按当前页拉取各统计 API |
| [`utils/workbenchPeriodFilter.js`](../miniprogram/utils/workbenchPeriodFilter.js) | 统计周期筛选（今日 / 昨日 / 本月 / 自定义），对齐 Web [`useWorkbenchPeriodFilter`](../hooks/useWorkbenchPeriodFilter.ts) |
| [`config/workbenchWidgets.js`](../miniprogram/config/workbenchWidgets.js) | 统计组件类型与默认布局 |
| [`components/workbench-stat-card/`](../miniprogram/components/workbench-stat-card/) | 移动端统计卡片 UI（工序类横向滑动芯片；KPI 类紧凑主指标 + 横向指标芯片） |

支持的统计组件：`order_stats` / `outsource_stats` / `rework_stats` / `sales_stats` / `sales_order_stats` / `finance_stats` / `product_economics*`。除首页（`page-overview`）外，**网页端创建的自定义工作台页**在 API 返回且当前用户有查看权限时，数据看板日期筛选右侧显示**当前页面名称 + 下拉箭头**按钮，点击后从底部弹出页面列表进行选择；权限与 widget 过滤与 Web 一致（`GET /dashboard/workbench` 的 `effective`）。快捷入口、插件中心、消息中心仍仅在 Web 首页固定区展示；小程序首页仅渲染统计类组件。数据看板顶部提供**全局周期切换**（今日 / 昨日 / 本月 / 自定义日期区间），API 参数与 Web 一致（`period` 或 `startDate`+`endDate`）；布局与增减组件请在电脑端工作台编辑。

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
| 档案列表 | [`packageBusiness/settings-archive-list/`](../miniprogram/packageBusiness/settings-archive-list/) | 5 个档案 Tab 搜索、新建、列表（工序节点支持上移/下移排序） |
| 档案编辑 | [`packageBusiness/settings-archive-edit/`](../miniprogram/packageBusiness/settings-archive-edit/) | 档案 CRUD、特性开关、扩展字段定义 |
| 生产业务配置 | [`pages/settings-tab/`](../miniprogram/pages/settings-tab/) | 数量上限开关、扫码称重容差、物料成本口径（逐项即时保存） |

| 工具 / API | 作用 |
|-------------|------|
| [`utils/settingsApi.js`](../miniprogram/utils/settingsApi.js) | `/settings/*` CRUD + config PUT |
| [`utils/settingsForm.js`](../miniprogram/utils/settingsForm.js) | 保存校验、特性开关规则 |
| [`components/settings-custom-fields-editor/`](../miniprogram/components/settings-custom-fields-editor/) | 扩展字段 / 报工展示模板定义 |

**权限**：`settings:categories:*` · `settings:partner_categories:*` · `settings:nodes:*` · `settings:warehouses:*` · `settings:finance_categories:*` · `settings:config:view/edit`

**留 Web**：`productionLinkMode`（平台级）；各业务表单配置（`planFormSettings` 等）；收支账户类型（财务模块）；扩展字段 **file/knowledge** 上传；工序 `reportTemplate`（工单表单配置）。

配置单一事实源：[`config/settingsTabs.js`](../miniprogram/config/settingsTabs.js)。应用 Tab「系统设置」入口路径 `/pages/settings/settings`。

## 产品档案

对齐 Web [`ProductManagementView`](../views/ProductManagementView.tsx) / [`ProductEditForm`](../views/product-management/ProductEditForm.tsx)（**不含** [`ProductImportModal`](../views/ProductImportModal.tsx) 批量导入；**不含**工序路线、工价、BOM 配置）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 档案列表 | [`packageBusiness/basic-products/`](../miniprogram/packageBusiness/basic-products/) | 分类 Tab、搜索、客户端分页、启用/禁用、创建入口 |
| 产品编辑 | [`packageBusiness/basic-product-edit/`](../miniprogram/packageBusiness/basic-product-edit/) | 基本信息、颜色尺码、分类自定义字段 |

| 工具 / 组件 | 作用 |
|-------------|------|
| [`utils/productApi.js`](../miniprogram/utils/productApi.js) | `/products` CRUD + variant-usage |
| [`utils/products.js`](../miniprogram/utils/products.js) | 列表筛选、分页 UI 模型 |
| [`utils/productForm.js`](../miniprogram/utils/productForm.js) | 保存校验、变体生成、自定义字段 |
| [`components/color-size-spec-picker/`](../miniprogram/components/color-size-spec-picker/) | 颜色/尺码勾选 + 快捷新增字典 |

**权限**：`basic:products:view`（列表/读）· `basic:products:create`（新建）· `basic:products:edit`（编辑/启用）· `basic:products:delete`（删除）

**留 Web**：批量导入产品；工序路线、工价、BOM 矩阵；产品分类/报工展示 **file/knowledge** 类型附件上传（小程序只读 + 提示电脑端）。

入口：[`menus.js`](../miniprogram/config/menus.js) `basic-products` → `/packageBusiness/basic-products/basic-products`。

## 合作单位

对齐 Web [`PartnersTab`](../views/basic-info/tabs/PartnersTab.tsx)（**不含** [`PartnerImportModal`](../views/PartnerImportModal.tsx) 批量导入；**不含**协作租户绑定编辑）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 档案列表 | [`packageBusiness/basic-partners/`](../miniprogram/packageBusiness/basic-partners/) | 分类 Tab、搜索、客户端分页、创建入口 |
| 单位编辑 | [`packageBusiness/basic-partner-edit/`](../miniprogram/packageBusiness/basic-partner-edit/) | 名称、分类、只读编号、分类自定义扩展字段 |

| 工具 | 作用 |
|------|------|
| [`utils/partnerApi.js`](../miniprogram/utils/partnerApi.js) | `/master/partners` CRUD |
| [`utils/partners.js`](../miniprogram/utils/partners.js) | 列表筛选、分页 UI 模型 |
| [`utils/partnerForm.js`](../miniprogram/utils/partnerForm.js) | 保存校验、自定义字段 |
| [`utils/partnerNormalize.js`](../miniprogram/utils/partnerNormalize.js) | 名称去重 |
| [`components/plan-form-custom-field/`](../miniprogram/components/plan-form-custom-field/) | 扩展属性录入 |

**权限**：`basic:partners:view` · `basic:partners:create` · `basic:partners:edit` · `basic:partners:delete`

**留 Web**：批量导入单位；协作租户关联；**file/knowledge** 类型扩展字段上传（分类定义可在小程序维护）。

入口：[`menus.js`](../miniprogram/config/menus.js) `basic-partners` → `/packageBusiness/basic-partners/basic-partners`。

## 成员管理

对齐 Web [`MemberManagementView`](../views/MemberManagementView.tsx)（**不含** [`RolesTab`](../views/member-management/RolesTab.tsx) / [`RoleEditModal`](../views/member-management/RoleEditModal.tsx) 角色 CRUD 与权限树）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 成员 Hub | [`packageBusiness/basic-members/`](../miniprogram/packageBusiness/basic-members/) | 三 Tab：成员列表（搜索/分配角色/工序/移除）、待审核（通过/拒绝）、邀请码（复制） |

| 工具 / 组件 | 作用 |
|-------------|------|
| [`utils/memberApi.js`](../miniprogram/utils/memberApi.js) | `/tenants/:id/members`、applications、invite、`/roles?all=true`（只读） |
| [`utils/members.js`](../miniprogram/utils/members.js) | 列表筛选、行 UI 模型、`memberHasReportPerm` |
| [`config/members.js`](../miniprogram/config/members.js) | Tab 常量、审核通过默认权限 |
| [`components/role-picker-sheet/`](../miniprogram/components/role-picker-sheet/) | 底栏单选分配已有角色 |
| [`components/milestone-multi-select/`](../miniprogram/components/milestone-multi-select/) | 底栏多选工序节点（`planApi.fetchNodesAll`） |

**权限**：`basic:members:view`（入口）· 审核需 owner 或 `basic:members:create` · 分配角色/工序仅 owner · 移除仅 owner · **企业创建者也可分配生产工序**（与成员相同，写入 `assignedMilestoneIds`）

**留 Web**：角色 CRUD、细粒度权限树、直接编辑成员 `permissions`

入口：[`menus.js`](../miniprogram/config/menus.js) `basic-members` → `/packageBusiness/basic-members/basic-members`。

## 公共数据字典

对齐 Web [`DictionariesTab`](../views/basic-info/tabs/DictionariesTab.tsx)（颜色 / 尺码 / 产品单位三组；名称同类型租户内唯一；被产品引用时禁止删除）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 字典列表 | [`packageBusiness/basic-dictionaries/`](../miniprogram/packageBusiness/basic-dictionaries/) | 类型 Tab（全部/颜色/尺码/产品单位）、搜索、客户端分页、创建入口 |
| 字典编辑 | [`packageBusiness/basic-dictionary-edit/`](../miniprogram/packageBusiness/basic-dictionary-edit/) | 类型（新建可选/编辑只读）、名称 |

| 工具 | 作用 |
|------|------|
| [`utils/dictionaryApi.js`](../miniprogram/utils/dictionaryApi.js) | `/master/dictionaries` 增删改 |
| [`utils/dictionaries.js`](../miniprogram/utils/dictionaries.js) | 列表筛选、分页 UI 模型（对齐 Web `basicInfoFilters`） |
| [`utils/dictionaryForm.js`](../miniprogram/utils/dictionaryForm.js) | 保存校验、名称去重 |
| [`config/dictionaries.js`](../miniprogram/config/dictionaries.js) | 类型 Tab 常量 |

**权限**：`basic:dictionaries:view` · `basic:dictionaries:create` · `basic:dictionaries:edit` · `basic:dictionaries:delete`

**菜单说明**：设备管理仅 Web 端维护，小程序应用中心**不含** `basic-equipment` 入口；报工/返工流程内设备选择仍受企业 `equipmentModuleEnabled` 控制。

入口：[`menus.js`](../miniprogram/config/menus.js) `basic-dictionaries` → `/packageBusiness/basic-dictionaries/basic-dictionaries`。

## 资料库

对齐 Web [`KnowledgeBaseView`](../views/knowledge-base/KnowledgeBaseView.tsx) 的**只读浏览**（不支持新建/编辑/上传）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 树 / 搜索 | [`packageBusiness/knowledge-base/`](../miniprogram/packageBusiness/knowledge-base/) | 文件夹面包屑、当前层列表、标题/正文搜索、进入文档 |
| 文档详情 | [`packageBusiness/knowledge-doc-detail/`](../miniprogram/packageBusiness/knowledge-doc-detail/) | 标题 + 更新时间 + 消毒后 HTML（块渲染）；鉴权图片；按文档宽度展示图片；表格可横向滚动；**附件卡片**（PDF/Excel/Office 点按 `wx.openDocument`，图片点按预览，视频标签点按 `wx.previewMedia` 播放、`data-display-mode=player` 时内嵌 `<video>`，其它类型提示无法预览）；**关联产品** / **关联文档** 芯片可点跳转 |
| 产品快览 | [`packageBusiness/knowledge-product-detail/`](../miniprogram/packageBusiness/knowledge-product-detail/) + [`components/product-quick-detail/`](../miniprogram/packageBusiness/components/product-quick-detail/) | 只读商品信息共用组件：基本信息、分类扩展属性、标准生产路线、工艺 BOM；入口含资料库关联产品、生产计划详情点产品名；无编辑/删除；大图不进 `setData` |

| 工具 | 作用 |
|------|------|
| [`utils/knowledgeApi.js`](../miniprogram/packageBusiness/utils/knowledgeApi.js) | `GET /knowledge-base/tree` · `documents` · `documents/:id` · `assets/:id`（arraybuffer） |
| [`utils/knowledgeTree.js`](../miniprogram/packageBusiness/utils/knowledgeTree.js) | 当前层行模型、面包屑 |
| [`utils/knowledgeHtmlForMini.js`](../miniprogram/packageBusiness/utils/knowledgeHtmlForMini.js) | 拆成 html/image/product/file/callout/table 渲染块；表格行内边框；鉴权图片 URL；附件节点 `div[data-type=file-attachment]` |
| [`utils/knowledgeAttachmentForMini.js`](../miniprogram/packageBusiness/utils/knowledgeAttachmentForMini.js) | 附件类型判定、体积文案、`openDocument` 支持的扩展名 |

**权限 / 插件**：入口需插件 `knowledge_base` 开启；页内校验 `knowledge_base:folders:view`（树）+ `knowledge_base:documents:view`（正文/图片/附件）。图片资源不可裸链，须 Bearer 下载后**写入本地临时文件**再引用路径（禁止 base64 塞进 `setData`，避免超大传输与渲染层错误）；正文内图片点按 `wx.previewImage`（按文档设定宽度展示，最大不超过页面宽）；关联产品芯片跳转只读产品快览（需 `basic:products:view`）。关联文档芯片跳转另一篇资料库文档详情。附件卡片点击后鉴权下载到临时文件：PDF/Excel/Word/PPT 用 `wx.openDocument({ showMenu: true })` 系统预览；附件为图片时用 `previewImage`；视频标签用 `previewMedia`；CAD 等不支持类型弹窗提示「无法预览，请在电脑端打开」。首屏预拉正文图片与内嵌播放视频，标签式附件按点击再下载。

**留 Web**：新建/编辑/上传；业务表单里 knowledge 类自定义字段仍「请在电脑端填写」。

入口：[`menus.js`](../miniprogram/config/menus.js) `knowledge-base` → `/packageBusiness/knowledge-base/knowledge-base`。

## 待办提醒

对齐 Web 待办提醒插件（`todo_reminder`）：个人级待办，复用 `/api/todos`，无需模块 RBAC。

| 页面 | 路径 | 职责 |
|------|------|------|
| 管理页 | [`packageBusiness/todos/`](../miniprogram/packageBusiness/todos/) | 未完成 / 已完成 Tab、搜索、完成/还原、编辑、删除、点关联单据跳转 |
| 新建/编辑 | [`packageBusiness/todo-edit/`](../miniprogram/packageBusiness/todo-edit/) | 备注 + 定时提醒（`datetime-calendar-select`）；可带单据 seed |

| 工具 | 作用 |
|------|------|
| [`utils/todosApi.js`](../miniprogram/utils/todosApi.js) | `list/create/update/delete` + `openTodoEdit` |
| [`utils/todoNavigate.js`](../miniprogram/utils/todoNavigate.js) | Web `href` → 小程序详情深链（计划/工单/外协/进销存/开发） |
| [`utils/devTodoCreate.js`](../miniprogram/packageBusiness/utils/devTodoCreate.js) | 兼容旧入口，转调 `openTodoEdit` |

**插件门控**：`todo_reminder` 开启后，应用中心「插件中心」出现「待办事项」入口；下列详情**首卡右上角**显示浅蓝胶囊「待办」（不放顶栏，避免与微信胶囊冲突）：

- 生产计划详情、工单详情、返工详情、加工厂往来数量明细
- 开发节点登记、BOM 录入
- 进销存：采购订单 / 采购入库 / 销售订单 / 销售单详情

入口：[`menus.js`](../miniprogram/config/menus.js) `todo-reminder` → `/packageBusiness/todos/todos`。

## 开发管理

对齐 Web [`views/development/`](../views/development/) 全功能（移动端改为「列表 Hub → 详情 → 子页」）：

| 页面 | 路径 | 职责 |
|------|------|------|
| 款式列表 | [`packageBusiness/development-styles/`](../miniprogram/packageBusiness/development-styles/) | 开发中 / 已归档 Tab、搜索、进度节点或同步状态筛选、按时间/客户排序、录入新产品、节点库入口 |
| 款式详情 | [`development-style-detail/`](../miniprogram/packageBusiness/development-style-detail/) | 基本信息、归档/还原/发布大货/删除、样品 Tab、节点时间线、加删样品、版本日志、深链 `styleId` + `devStageId` / `devSampleId` |
| 创建/编辑 | [`development-style-edit/`](../miniprogram/packageBusiness/development-style-edit/) | 分类商品字段、开发流程节点、大货工序；保存回列表 |
| 节点登记 | [`development-stage-register/`](../miniprogram/packageBusiness/development-stage-register/) | 四态 + 模板自定义字段；`todo_reminder` 开启时可加待办 |
| BOM 录入 | [`development-bom-edit/`](../miniprogram/packageBusiness/development-bom-edit/) | **格子下钻**（变体×工序 → 物料行），非 Web 整表矩阵；同数据源 `dev_boms` + `syncVariantNodeBoms` |
| 节点库 | [`development-stage-templates/`](../miniprogram/packageBusiness/development-stage-templates/) + [`development-stage-template-edit/`](../miniprogram/packageBusiness/development-stage-template-edit/) | 模板 CRUD、排序、字段配置 |

| 工具 | 作用 |
|------|------|
| [`utils/developmentApi.js`](../miniprogram/packageBusiness/utils/developmentApi.js) | `/dev/styles*` · `/dev/styles/boms*` · `/dev/stage-templates*` |
| [`utils/devStyleListFilter.js`](../miniprogram/packageBusiness/utils/devStyleListFilter.js) 等 | 列表筛选/展示/表单/登记/BOM view-model |
| [`utils/todoNavigate.js`](../miniprogram/utils/todoNavigate.js) | 消息/管理页待办 Web href → 小程序详情深链 |

**权限 / 插件**：插件 `development`；款式 `development:styles:*`；节点库 `development:templates:*`。保存后导航：`LIST_ROUTES.DEVELOPMENT_STYLES`。

**与 Web 差异**：BOM 为格子下钻编辑；待办新建/编辑与 Web 同为备注 + 提醒时间（`todo-edit` 页）。

入口：[`menus.js`](../miniprogram/config/menus.js) `development` → `/packageBusiness/development-styles/development-styles`。

## 分包与上传体积

微信代码质量要求**主包（不含插件）< 1.5 MB**。业务页全部放在 [`app.json`](../miniprogram/app.json) 的 `business` 分包（`root: packageBusiness`），主包仅保留 Tab 壳、登录/租户、消息聊天、系统设置等入口页（仍在 `pages/` 目录）。

| 包 | 目录 / 页面范围 |
|----|----------------|
| **主包** | `pages/`：`home` / `apps` / `scan` / `messages` / `mine`、登录与租户、`messages-chat`、`settings*` |
| **business 分包** | `packageBusiness/`：生产 / 进销存 / 财务 / 产品档案 / 合作单位 / 成员管理 / 公共数据字典 / 扫码连续作业（`scan-setup`、`scan-session`） |

新增业务页时：**不要**写入主包 `pages` 数组；在 `packageBusiness/` 下新建页面目录，并追加到 `subPackages[0].pages`（路径相对 `packageBusiness/`，如 `finance-foo/finance-foo`）。跳转 URL 使用 `/packageBusiness/...`（见 [`saveNavigation.js`](../miniprogram/packageBusiness/utils/saveNavigation.js) `LIST_ROUTES`）。

`preloadRule`：进入「应用」「扫码」Tab 时预下载 `business` 分包，减少首次打开业务页的等待。

上传优化（[`project.config.json`](../miniprogram/project.config.json)）：`uploadWithSourceMap: false`、`ignoreDevUnusedFiles: true`。

若主包仍超限：检查主包页是否 `require` 了仅分包使用的 `utils/`；或将图标等资源进一步压缩。

### 主包 / 分包代码目录（2026-03 起）

| 目录 | 用途 |
|------|------|
| `miniprogram/utils/` | **仅主包**可达的工具（`session`、`request`、`permissions`、工作台、消息 Tab 等） |
| `miniprogram/config/` | **仅主包**菜单/设置/扫码类型等 |
| `miniprogram/components/` | **仅主包**页注册的组件（`tab-shell`、`icon-grid`、`page-header` 等） |
| `packageBusiness/utils/` | 生产 / 进销存 / 财务 / 档案等业务工具 |
| `packageBusiness/config/` | 各业务模块列表配置 |
| `packageBusiness/components/` | 仅分包页引用的表单组件（产品/合作单位选择、矩阵键盘等） |

分包页引用：`require('../utils/...')` / `require('../config/...')`；需用主包能力时用 `require('../../utils/...')`（如 `session.js`）。**禁止**主包 `require` 分包内 JS。

分析脚本：`miniprogram/scripts/analyze-main-package-deps.cjs`（输出主包未使用的 utils/config）。

**WXSS 跨包**：主包 `styles/` **不得** `@import` 分包内 `.wxss`（微信编译报错）。共用样式须放在主包 `styles/`（如 `plan-list-shell.wxss`），分包页面再 `@import '../../styles/...'`。
