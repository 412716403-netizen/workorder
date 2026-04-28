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

- **进程管理**：**systemd**（旧的 `nohup node ... &` 方式已弃用）
- **服务名**：`smarttrack-api.service`
- **unit 文件**：`/etc/systemd/system/smarttrack-api.service`
- **WorkingDirectory**：`/var/www/smarttrack-pro/backend`
- **ExecStart**：`/usr/bin/node dist/backend/src/index.js`
  - ⚠️ **不是** `dist/index.js`。`backend/tsconfig.json` 把 `../shared` include 进来后，TS 把公共 rootDir 自动提升到仓库根，编译产物落在 `dist/backend/src/`。详见下文「构建路径与历史坑（必读）」。
- **监听端口**：**3001**（`ss -tlnp | grep 3001` 可见 `node` 进程）
- **健康检查**：`curl -s http://127.0.0.1:3001/health` → `{"status":"ok",...}`
- **常用操作**：
  - 重启：`sudo systemctl restart smarttrack-api`
  - 状态：`sudo systemctl status smarttrack-api --no-pager`
  - 日志：`sudo journalctl -u smarttrack-api -f`（或 `--since "10 min ago"`）
  - 查看 unit 内容：`systemctl cat smarttrack-api`

### 推荐发版顺序（测试机一条龙）

在服务器上按顺序执行，可减少漏步骤：

1. `cd /var/www/smarttrack-pro && git pull origin main`
2. `cd /var/www/smarttrack-pro/backend && npm ci`（无 lock 时用 `npm install`）
3. `npx prisma migrate deploy`（有未应用 migration 时执行）
4. `rm -rf dist && npm run build`
   - `package.json` 的 `build` 已含 `rm -rf dist`，命令行上再写一遍是双保险，避免历史 `dist/index.js` 等旧产物残留导致 systemd 跑老代码。
5. `sudo systemctl restart smarttrack-api`
6. `sudo systemctl status smarttrack-api --no-pager | head -15` 确认 `active (running)`，且 `ExecStart` 指向 `dist/backend/src/index.js`
7. `curl -s http://127.0.0.1:3001/health` 返回 `{"status":"ok"...}`
8. 前端：`cd /var/www/smarttrack-pro && npm ci && npm run build`
9. 若改过 Nginx：`nginx -t && nginx -s reload`；仅更新前端 `dist` 时一般只需浏览器强刷或清 CDN

### 数据库迁移（说明）

- 在 **`backend` 目录**执行 `npx prisma migrate deploy`，且 `.env` 中 `DATABASE_URL` 必须指向**本环境**要升级的 PostgreSQL。
- 开发机本地可用 `npx prisma migrate dev` 生成/调试迁移；**测试/正式环境推荐只用 `migrate deploy`**。

### 后端 API 发布（命令块，与上文顺序一致）

```bash
cd /var/www/smarttrack-pro/backend
npm ci  # 若无 lock 文件则：npm install
npx prisma migrate deploy
rm -rf dist
npm run build
sudo systemctl restart smarttrack-api
sudo systemctl status smarttrack-api --no-pager | head -15
curl -s http://127.0.0.1:3001/health
```

### 构建路径与历史坑（必读）

**症状**：发版后 systemd 仍跑老代码，新功能不生效。  
（典型案例：2026-04-28 阿里云测试机看不到「系统打印模板（外协发出/收回、采购销售订单/单据、领退料、返工等）」。）

**根因**：

- `backend/tsconfig.json` 的 `include` 同时包含 `src/**` 与 `../shared/**`，TypeScript 自动把**公共 rootDir 提升到仓库根**。
- 因此 `tsc` 实际产物位置为：
  - `backend/dist/backend/src/index.js`（后端入口）
  - `backend/dist/backend/src/services/...`
  - `backend/dist/shared/...`
- 历史上 `package.json` 的 `start` 与 systemd `ExecStart` 都写 `dist/index.js`，但**新构建不会再写这个文件** —— 线上其实跑的是上一次部署残留的 `dist/index.js`，新代码全在旁边的 `dist/backend/src/` 里**从未被加载**。
- 现象上很像「迁移成功 + Prisma generate 成功 + tsc 没报错 + 服务 active running + /health OK」一切都对，但任何 `services/*.ts` 改动都不生效。

**当前已修复**：

- `backend/package.json`：`"build": "rm -rf dist && tsc"`、`"start": "node dist/backend/src/index.js"`（commit `6bf2ef3`）。
- systemd `ExecStart=/usr/bin/node dist/backend/src/index.js`（已在测试机改完）。

**部署时必做**：

- 每次发版前都执行 `rm -rf dist`（`npm run build` 内已有，命令行再来一遍当防御）。
- 修改 `backend/tsconfig.json` 的 `include` 时，必须同步检查 `dist` 实际产物位置，并保持 systemd `ExecStart` 与 `package.json` 的 `start` 一致。
- 升级关键功能时可 grep 编译产物快速验证，例如：  
  `grep -c mergePrintTemplatesForTenantConfig /var/www/smarttrack-pro/backend/dist/backend/src/services/settings.service.js` 期望输出 `2`（import + 调用各一次）。

### 前端静态资源发布

```bash
cd /var/www/smarttrack-pro
npm ci
npm run build
```

构建产物目录为 **`/var/www/smarttrack-pro/dist`**，与当前 Nginx `root` 一致。

### 自检清单（测试发版后）

1. `sudo systemctl status smarttrack-api --no-pager | head -15` 显示 `active (running)`，`Main PID` 后的命令行包含 `dist/backend/src/index.js`。
2. `curl -s http://127.0.0.1:3001/health` 返回 `{"status":"ok",...}`。
3. `ss -tlnp | grep 3001` 确认 API 在监听。
4. 浏览器打开上文「测试环境访问地址」，强刷一次，确认登录、产品列表、系统设置、**打印模板列表**、生产/PSI/财务等核心模块无「数据库结构不一致」或字段缺失类错误。
5. `cd /var/www/smarttrack-pro/backend && npx prisma migrate status` 显示迁移已全部应用。
6. 关键功能升级时可在线上 grep 编译产物，确认新逻辑已落地（例如系统打印模板合并：见上节「构建路径与历史坑」末尾）。

### 测试环境回滚（简要）

1. `cd /var/www/smarttrack-pro && git checkout <上一提交的 hash 或 tag>`
2. 按「推荐发版顺序」重新执行：`rm -rf dist && npm run build` + `sudo systemctl restart smarttrack-api`，前端再 `npm run build`。
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
