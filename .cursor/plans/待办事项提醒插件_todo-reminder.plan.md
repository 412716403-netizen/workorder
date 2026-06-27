# 待办事项提醒插件（todo_reminder）实施计划

## 1. 需求（已与用户确认）

做一个"待办事项提醒"功能插件，挂到现有**功能插件系统**：

- **插件开关**：在插件市场开启 `todo_reminder` 后功能才出现，关闭即全部隐藏。
- **详情页加待办**：先只做**生产相关详情**（生产工单详情 `OrderDetailModal`、生产计划详情 `PlanDetailPanel`）。在详情页头部加一个"+待办"图标，点击把当前单据关联成一条待办，可填**内容备注** + **是否提醒** + **提醒时间**。
- **独立待办**：支持**不关联单据**的待办（`sourceType = standalone`）。
- **入口（不做侧栏）**：只在**工作台首页「消息中心」卡片**头部加一个"待办事项"按钮（插件开启才显示）。点击打开待办面板，可**查看待办列表** + **新增待办**。
- **提醒方式**：到点的待办进入**消息中心消息流**（轮询 ≤60s 冒出）+ **浏览器桌面通知**（Notification API，需用户授权）。
- **归属**：**个人级**——每个成员只看自己创建的待办。

## 2. 关键架构决策

### 2.1 归到 dashboard 域，不挂 requireSubPermission
待办是**个人 / 工作台级**功能。现有 `/api/dashboard` 路由（workbench / shortcuts / notifications / feature-plugins）只挂 `authMiddleware + requireTenant`，**不挂 `requireSubPermission`**，因为工作台是每个成员都有的个人区。

→ 待办接口同样归到 **dashboard 域**（路径前缀 `/api/dashboard/todos`），不进 RBAC 权限目录（`views/member-management/constants.ts` 不动）。这样既符合"个人工具无需管理员授权"的产品语义，又与现有 dashboard 路由一致；本插件仅由 `featurePlugins.todo_reminder` 开关 + 后端 `userId` 作用域控制可见性与数据隔离。

> 说明：这是对"新路由必须挂 requireSubPermission"硬约束的**有意例外**，理由同 dashboard 既有路由（个人工作台区）。实现时在 `routes` 文件顶部加注释标明。

### 2.2 数据落后端（禁止只落 localStorage）
新增 Prisma 模型 `TodoItem`，租户 + 用户作用域。**先 migration 再写 service**。

### 2.3 提醒走轮询，不引入新基础设施
复用 `dashboard.service.getNotifications()`：把当前用户**到点未完成**的待办映射成 `DashboardNotification`（已含 `href` 字段）。消息中心 60s 轮询自动呈现。桌面通知在前端轮询 hook 内对"新到点待办"调用 Notification API，用 localStorage 记已弹 id 去重。

## 3. 数据模型

### 3.1 Prisma 模型（`backend/prisma/schema.prisma`）

```prisma
/** 个人待办事项（todo_reminder 插件）；个人级，按 userId 作用域 */
model TodoItem {
  id            String    @id @default(uuid()) @db.Uuid
  tenantId      String    @map("tenant_id") @db.Uuid
  userId        String    @map("user_id") @db.Uuid
  /** 关联单据类型：standalone / production_order / plan（先只支持这三种） */
  sourceType    String    @default("standalone") @map("source_type") @db.VarChar(40)
  /** 关联单据 id；standalone 时为空 */
  sourceId      String?   @map("source_id") @db.VarChar(50)
  /** 单号快照，用于列表展示，避免跨表查 */
  sourceDocNo   String?   @map("source_doc_no") @db.VarChar(100)
  /** 标题快照（产品名/计划名等） */
  sourceTitle   String?   @map("source_title") @db.VarChar(200)
  /** 跳转路径快照（点提醒/列表跳单据用） */
  href          String?   @db.Text
  note          String    @db.Text
  remindEnabled Boolean   @default(false) @map("remind_enabled")
  remindAt      DateTime? @map("remind_at") @db.Timestamptz()
  /** 已生成提醒/已弹通知的时间，去重用 */
  remindedAt    DateTime? @map("reminded_at") @db.Timestamptz()
  /** open / done */
  status        String    @default("open") @db.VarChar(20)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt     DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId, status])
  @@index([tenantId, userId, remindEnabled, remindAt])
  @@map("todo_items")
}
```

> 同步在 `User` / `Tenant` model 加反向关系字段 `todoItems TodoItem[]`。
> migration：`cd backend && npx prisma migrate dev --name add_todo_items`。

### 3.2 共享枚举（`shared/types.ts`）

```ts
export const TODO_SOURCE_TYPES = ['standalone', 'production_order', 'plan'] as const;
export type TodoSourceType = (typeof TODO_SOURCE_TYPES)[number];

export const TODO_STATUSES = ['open', 'done'] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export interface TodoItemDTO {
  id: string;
  sourceType: TodoSourceType;
  sourceId: string | null;
  sourceDocNo: string | null;
  sourceTitle: string | null;
  href: string | null;
  note: string;
  remindEnabled: boolean;
  remindAt: string | null;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
}
```
- 前端根 `types.ts` re-export；后端 `backend/src/types/index.ts` re-export。

## 4. 后端实现

### 4.1 插件注册
- `shared/workbench.ts`：`FeaturePluginId` 增加 `'todo_reminder'`。
- `shared/featurePluginCatalog.ts`：新增一条 market item（`toggleable: true`、`defaultEnabled: false`、`category: 'tools'`、`icon` 选一个已支持的 key 或新增 `CheckSquare`）。
  - 注意 `FeaturePluginIconKey` 当前只有 `'Inbox' | 'FlaskConical' | 'BookOpen' | 'ScanLine' | 'Wallet'`，需要给它加一个新 key（如 `'ListTodo'`）并在插件市场图标映射处补上对应 lucide 图标。

### 4.2 service：`backend/src/services/todos.service.ts`（新建）
纯业务，接 `db: TenantPrismaClient` + `tenantId` + `userId`：
- `listTodos(db, userId, { status? })` → 按 `userId` 过滤，`remindAt`/`createdAt` 排序。
- `createTodo(db, tenantId, userId, input)` → 校验 `note` 非空、`sourceType` 合法、`remindEnabled` 时 `remindAt` 必填且为将来时间；`id` 用 `genId`。
- `updateTodo(db, userId, id, patch)` → 只能改自己的（查 `userId` 匹配，否则 `AppError(404)`）；支持改 note/remind/status。
- `deleteTodo(db, userId, id)`。
- `toggleDone(db, userId, id, done)`（也可并入 update）。

### 4.3 提醒注入
在 `backend/src/services/dashboard.service.ts` 的 `getNotifications()`：
- 查当前用户 `status='open' && remindEnabled && remindAt <= now`（且本插件开启）的待办。
- 映射成 `DashboardNotification`：`type` 复用 `'system'`（或扩 union 加 `'todo'`，需同步前端 `services/api/dashboard.ts` 与 `MessageDetailModal` 的类型/样式）。`href` = 待办的 `href`；`title` = note 摘要；`createdAt` 用 `remindAt`。
- 合并进现有 items 一起排序。
- 插件开关检查：读 `featurePlugins.todo_reminder`，关闭则不注入。

### 4.4 controller + route
- `backend/src/controllers/todos.controller.ts`（新建）：`asyncHandler` 包装，从 `req.user!.userId` / `req.tenantId!` 取，`getTenantPrisma`，调 service。参数清洗用 `utils/request.ts`。
- 路由**加到现有 `backend/src/routes/dashboard.ts`**（前缀 `/todos`），或新建 `routes/todos.ts` 并在 `app.ts` 用与 dashboard 相同的中间件挂载。推荐**加到 dashboard.ts**，省一次挂载且语义一致：
  ```ts
  router.get('/todos', ctrl.listTodos);
  router.post('/todos', validate(createTodoSchema), ctrl.createTodo);
  router.patch('/todos/:id', validate(updateTodoSchema), ctrl.updateTodo);
  router.delete('/todos/:id', ctrl.deleteTodo);
  ```
- Zod schema：`note` 非空 ≤2000；`sourceType` enum；`remindEnabled` bool；`remindAt` datetime 可空；`status` enum。

## 5. 前端实现

### 5.1 API：`services/api/dashboard.ts`（或新建 `services/api/todos.ts`）
加 `todos` 接口对象：`list / create / update / remove`，返回 `TodoItemDTO`。

### 5.2 hook：`hooks/useTodos.ts`（新建）
- react-query：`useQuery` 拉列表（queryKey 带 tenantId），`useMutation` 增改删，成功后 invalidate 列表 + invalidate 通知 queryKey（让消息中心刷新）。

### 5.3 消息中心卡片按钮（主入口）
`views/workbench/widgets/MessageCenterWidget.tsx`：
- 引 `useFeaturePlugins()`，`isPluginEnabled('todo_reminder')` 为真时给 `WidgetShell` 传 `headerExtra`：一个"待办事项"按钮（`ListTodo` 图标）。
- 按钮点击 `setTodoOpen(true)` 打开 `TodoPanelModal`。
- `WidgetShell` 的 `headerExtra` 只在非编辑态渲染（已确认），无需额外处理编辑态。

### 5.4 待办面板：`views/workbench/widgets/TodoPanelModal.tsx`（新建）
- `createPortal` 弹窗（参考 `MessageDetailModal` 视觉）。
- 顶部："+ 新建待办"按钮 → 打开 `AddTodoModal`（standalone）。
- 列表：未完成/已完成切换 tab；每条显示 note、关联单号 badge（有则可点 `href` 跳转 + 关闭面板）、提醒时间；操作：勾选完成、删除。
- 空态文案。

### 5.5 新增/编辑弹窗：`components/AddTodoModal.tsx`（新建，通用）
- 字段：内容备注（textarea，必填）、是否提醒（switch）、提醒时间（datetime-local，仅在开启提醒时显示，校验为将来时间）。
- 入参 `seed?: { sourceType; sourceId; sourceDocNo; sourceTitle; href }`：从详情页带单据上下文进来；从面板"+新建"进来则为 standalone。
- 提交走 `useTodos().create`。

### 5.6 详情页"+待办"图标：`components/AddTodoButton.tsx`（新建，通用）
- 内部 `isPluginEnabled('todo_reminder')` 为 false → 返回 `null`。
- props：`sourceType / sourceId / sourceDocNo / sourceTitle / href`。
- 点击打开 `AddTodoModal` 并带上 seed。
- 接入点：
  - **生产工单详情** `views/OrderDetailModal.tsx`：已用 `leadingDetailActions`（约 704 行），把 `<AddTodoButton .../>` 拼进去。href 指向工单（参考现有工单路由/跳转方式）。
  - **生产计划详情** `views/plan-order-list/PlanDetailPanel.tsx`：自定义头部（约 1202 行 `flex items-center justify-between`），把图标加到右侧操作按钮组。

### 5.7 桌面通知 hook：`hooks/useTodoDesktopNotify.ts`（新建）
- 消费 `useDashboardNotifications` 数据（或单独轮询到点待办）。
- 首次/开启时 `Notification.requestPermission()`。
- 对新出现的 `todo` 提醒（按 id），localStorage 记已弹集合去重，`new Notification(title, { body })`；点击聚焦窗口并跳 `href`。
- 在工作台挂载点调用（如 `WorkbenchRoute` 或 MessageCenterWidget 内），仅插件开启时启用。

### 5.8 消息详情跳转
`views/workbench/widgets/MessageDetailModal.tsx`：当 `message.href` 存在时，底部加"前往单据"按钮，`useNavigate()` 跳转并关闭（`href` 字段已存在，目前未消费）。

## 6. 文件清单汇总

| 类型 | 文件 | 动作 |
|---|---|---|
| 插件注册 | `shared/workbench.ts` | 加 `todo_reminder` 到 `FeaturePluginId` |
| 插件注册 | `shared/featurePluginCatalog.ts` | 加 market item + 图标 key |
| 共享类型 | `shared/types.ts` | `TodoSourceType` / `TodoStatus` / `TodoItemDTO` |
| 共享类型 | `types.ts`、`backend/src/types/index.ts` | re-export |
| DB | `backend/prisma/schema.prisma`（+ migration） | `TodoItem` 模型 + User/Tenant 反向关系 |
| 后端 | `backend/src/services/todos.service.ts` | 新建 CRUD |
| 后端 | `backend/src/services/dashboard.service.ts` | `getNotifications` 注入到点待办 |
| 后端 | `backend/src/controllers/todos.controller.ts` | 新建 |
| 后端 | `backend/src/routes/dashboard.ts` | 加 `/todos` 路由 + Zod |
| 前端 API | `services/api/dashboard.ts` | 加 `todos` 接口（或新建 `services/api/todos.ts`） |
| 前端 hook | `hooks/useTodos.ts`、`hooks/useTodoDesktopNotify.ts` | 新建 |
| 前端组件 | `views/workbench/widgets/TodoPanelModal.tsx` | 新建 |
| 前端组件 | `components/AddTodoModal.tsx`、`components/AddTodoButton.tsx` | 新建 |
| 接入点 | `views/workbench/widgets/MessageCenterWidget.tsx` | 加 `headerExtra` 待办按钮 |
| 接入点 | `views/OrderDetailModal.tsx`、`views/plan-order-list/PlanDetailPanel.tsx` | 加 `<AddTodoButton>` |
| 接入点 | `views/workbench/widgets/MessageDetailModal.tsx` | href 跳转 |
| 文档 | `docs/01-business-rules.md`、`docs/02-data-structures.md`、`docs/04`、`docs/06` | 同步 |

## 7. 实施顺序（建议）

1. **共享层**：`shared/types.ts` 枚举/DTO + `workbench.ts` 插件 id + `featurePluginCatalog.ts` 目录项；两端 re-export。
2. **DB**：schema 加 `TodoItem` → migration。
3. **后端**：service → controller → dashboard 路由；最后 `getNotifications` 注入提醒。
4. **前端数据层**：api + `useTodos`。
5. **前端 UI**：`AddTodoModal` → `AddTodoButton` →（详情页接入）→ `TodoPanelModal` → 消息中心按钮接入。
6. **提醒**：`MessageDetailModal` href 跳转 + `useTodoDesktopNotify` 桌面通知。
7. **插件市场图标映射**补全。
8. **文档同步**。

## 8. 验收清单

- [ ] 插件关闭：消息中心无"待办事项"按钮、详情页无"+待办"图标、无待办提醒注入。
- [ ] 插件开启：消息中心出现"待办事项"按钮，点开可看列表 + 新建（含独立待办）。
- [ ] 工单/计划详情可"+待办"，带单号/标题/href 快照。
- [ ] 待办可设提醒时间；到点后 ≤60s 出现在消息中心；浏览器授权后弹桌面通知（去重不重复弹）。
- [ ] 点提醒/列表条目可跳转关联单据。
- [ ] 只能看到/操作自己的待办（个人级隔离）。
- [ ] 完成/删除待办后列表与消息中心同步刷新。

## 9. 风险与说明

- **提醒精度**：轮询 ≤60s 延迟，非秒级；如需更准后续可调小间隔或上 WebSocket。
- **桌面通知**：依赖用户授权，拒绝则退回消息中心红点；关页/后台时由浏览器策略决定。
- **权限例外**：待办接口不挂 `requireSubPermission`（个人工作台区，与现有 dashboard 路由一致），需在路由文件加注释说明，避免后续误判为漏挂权限。
- **DashboardNotification.type**：若新增 `'todo'` 枚举值，需前后端类型同步（`shared`/`services/api/dashboard.ts`/widget 样式）；否则先复用 `'system'` 最省改动。
