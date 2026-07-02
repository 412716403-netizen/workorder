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

**留 Web**：工单新建（仅计划下达）、删除、表单配置、打印、报工批次编辑/删除、色码矩阵报工、待入库批量/矩阵/入库流水、外协/返工详情。

入口：[`menus.js`](../miniprogram/config/menus.js) `production-orders` → `/pages/production-orders/production-orders`。

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
