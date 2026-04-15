# 服务器部署说明（测试 / 正式）

> 本文记录当前**测试环境**的部署路径与发布步骤；**正式服务器**上线后请在本文件追加一节，避免与测试环境混淆。

## 环境划分

| 环境 | 说明 | 状态 |
|------|------|------|
| **测试服务器** | 阿里云 ECS，用于联调、验收与预发验证 | 已在使用，路径见下 |
| **正式服务器** | 生产环境，面向最终用户 | **待部署**；上线后补充域名、路径、备份与监控说明 |

---

## 测试服务器（当前）

### 运行时与仓库

| 项 | 值 |
|----|-----|
| **Node.js** | `v20.20.1`（建议正式环境保持同大版本） |
| **npm** | `10.8.2` |
| **代码仓库（origin）** | `https://gitee.com/zheng-jun1988/workorder.git` |
| **发版分支** | `main` |
| **项目根目录（含前端）** | `/var/www/smarttrack-pro` |
| **后端目录** | `/var/www/smarttrack-pro/backend` |
| **环境变量文件** | 后端敏感配置在 **`/var/www/smarttrack-pro/backend/.env`**（含 `DATABASE_URL` 等，**勿提交到 Git**） |

### 测试环境访问地址

- **浏览器访问 URL（推荐）**：`https://procx.wanpuxx.com/`（测试环境正式入口，HTTPS）
- **ECS 公网 IP**：`47.96.132.58`（若直接访问 `http://IP` 出现 Nginx 404，多为 `server_name` 未匹配该 IP、请求落到默认站点所致；**日常验收请以域名为准**）

### Nginx（当前实测）

- **站点配置文件**：`/etc/nginx/conf.d/smarttrack.conf`
- **静态资源**：`root /var/www/smarttrack-pro/dist;`（前端在仓库根目录 `npm run build` 后，产物直接落在该 `dist`，无需再拷贝）
- **API 反代**：`proxy_pass http://127.0.0.1:3001/api/;`（浏览器请求路径以 `/api/` 为前缀时转发到本机 Node）

修改 Nginx 配置后建议执行：`nginx -t && nginx -s reload`。

### 后端 API 进程

- **监听端口**：**3001**（`ss -tlnp | grep 3001` 可见 `node` 进程）
- **启动方式**：无 PM2；生产构建为 `node dist/index.js`（见下文命令）

### 推荐发版顺序（测试机一条龙）

在服务器上按顺序执行，可减少漏步骤：

1. `cd /var/www/smarttrack-pro && git pull origin main`
2. `cd /var/www/smarttrack-pro/backend && npm ci`（无 lock 时用 `npm install`）
3. `npx prisma migrate deploy`（有未应用 migration 时执行）
4. `npm run build`
5. `ss -tlnp | grep 3001` 查旧 PID，`kill <PID>`
6. `nohup node dist/index.js > /var/log/smarttrack-api.log 2>&1 &`（日志路径可按运维规范调整）
7. `cd /var/www/smarttrack-pro && npm ci && npm run build`
8. 若改过 Nginx：`nginx -t && nginx -s reload`；仅更新 `dist` 时一般只需浏览器强刷或清 CDN

### 数据库迁移（说明）

- 在 **`backend` 目录**执行 `npx prisma migrate deploy`，且 `.env` 中 `DATABASE_URL` 必须指向**本环境**要升级的 PostgreSQL。
- 开发机本地可用 `npx prisma migrate dev` 生成/调试迁移；**测试/正式环境推荐只用 `migrate deploy`**。

### 后端 API 发布（命令块，与上文顺序一致）

```bash
cd /var/www/smarttrack-pro/backend
npm ci
# 若无 lock 文件则：npm install
npx prisma migrate deploy
npm run build
ss -tlnp | grep 3001
kill <旧 node 的 PID>
nohup node dist/index.js > /var/log/smarttrack-api.log 2>&1 &
```

### 前端静态资源发布

```bash
cd /var/www/smarttrack-pro
npm ci
npm run build
```

构建产物目录为 **`/var/www/smarttrack-pro/dist`**，与当前 Nginx `root` 一致。

### 自检清单（测试发版后）

1. 浏览器打开上文「测试环境访问地址」，确认登录、产品列表、系统设置等无「数据库结构不一致」类错误。
2. `cd /var/www/smarttrack-pro/backend && npx prisma migrate status` 显示迁移已全部应用。
3. `ss -tlnp | grep 3001` 确认 API 在监听。
4. 可选：`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/`（Express 可能返回 404，仅表示进程在响应；真实接口需带路径与鉴权时再测）

### 测试环境回滚（简要）

1. `cd /var/www/smarttrack-pro && git checkout <上一提交的 hash 或 tag>`
2. 按「推荐发版顺序」重新执行后端 `npm run build`、重启 `node`，以及前端 `npm run build`。
3. **数据库迁移一般不回滚**；若新 migration 有问题，应在修复后向前迁移，而非在生产随意 `migrate resolve` 回退，除非有明确 DBA/运维方案。

---

## 正式服务器（待补充）

正式上线后请在本节补充至少以下内容：

- 服务器角色、公网域名与 HTTPS 证书策略  
- 项目路径是否与测试机一致（建议**区分目录或区分库名**，避免误连测试库）  
- `DATABASE_URL`（仅存于服务器 `.env`）、备份周期、监控与告警  
- 发版审批与回滚步骤（含 `migrate deploy` 与进程重启顺序）

---

## 与「业务迁移文档」的区别

- **`docs/04-migration-checklist.md`**：指代码与数据模型从旧架构收口到后端的**开发迁移清单**。  
- **本文**：指**测试机 / 正式机**上的发布路径、命令与注意事项。

二者不要混为一谈。

---

## 本地开发（Mac / Windows）

若拉取含 **Prisma 新列**（如 `report_display_template`、`route_report_display_values`）的代码后，在「系统设置 → 工序节点」保存报工展示模板报错：

1. 在 **`backend` 目录**执行：`npx prisma migrate deploy`（或 `npx prisma migrate dev`）。
2. 执行：`npx prisma generate`（通常 `migrate` 后会提示；保险可手动跑一次）。
3. **重启本地 API 进程**（`tsx watch` / `npm run dev`），再刷新前端。

开发环境下 API 若返回 `detail` 字段，为 Prisma 原始报错摘要，便于对照缺哪一列。
