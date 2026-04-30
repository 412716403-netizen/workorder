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

### 系统现状（2026-04 实测）

> 正式机的 OS / 运行时 / 工具版本**与本表对齐**，避免「测试能跑、正式跑不起来」。

| 项 | 值 | 备注 |
|----|-----|------|
| **OS** | Alibaba Cloud Linux 3.2104 U12.3（OpenAnolis Edition） | 正式机选**同款镜像** |
| **Kernel** | `5.10.134-19.2.al8.x86_64` | 跟随镜像即可 |
| **时区** | `Asia/Shanghai (CST, +0800)` | 正式机务必一致；时间不一致会污染报工/打印时间戳 |
| **Locale** | `zh_CN.UTF-8` | 同上保持一致 |
| **内存** | 1.8 GiB（约 2 GB 规格） | **正式机不要照抄**，建议 4 vCPU + 8 GiB 起 |
| **Swap** | 0（未配置） | 正式机建议开 1～2 GB swap 兜底；测试机也建议补 |
| **磁盘** | 系统盘 40 GB，已用约 6.7 GB | 正式机建议系统盘 ESSD ≥ 50 GB |
| **防火墙** | `firewalld/ufw` 都未启用，依赖阿里云**安全组** | 正式同款；安全组只放行 `80/443` 与受限来源的 SSH |
| **Nginx** | `1.20.1`（dnf 包，自带 `http_ssl/http_v2/realip` 等模块） | 正式安装：`dnf install nginx` |
| **Node** | `/usr/bin/node v20.20.1`（系统包） | **正式必须同大版本 20**；不建议改用 nvm，避免 systemd `ExecStart` 路径漂移 |
| **npm** | `10.8.2` | 暂不升 11，避免 lock 行为差异 |
| **Git** | `2.43.7` | 跟随 dnf |
| **certbot** | `1.22.0` | Let's Encrypt 续期工具，正式若用 LE 证书需安装 |
| **未安装** | `pm2 / redis-server / docker` | 正式机也**保持不装**，简化运维 |
| **业务文件目录** | 无 `uploads/exports`（业务文件不落本地盘） | 正式机若以后落本地，再单独挂数据盘 |
| **logrotate** | 仅 `nginx`（系统默认） | journal 当前 ~48 MB，未限制 |
| **Cron** | 无业务 cron（仅系统默认 `0hourly/raid-check/update-motd`） | 备份/清理类任务后续按需添加 |

### 后端 `.env` 键名清单（测试机现状）

正式机 `.env` 必须包含**完全相同的键**，只改值；标 ⚠️ 的**严禁复用测试值**。

| 键名 | 测试值（脱敏） | 正式机怎么填 |
|------|----------------|--------------|
| `DATABASE_URL` | `postgresql://...@localhost:5432/smarttrack_pro?...` | **改为 RDS 内网地址**（`pgm-xxx.pg.rds.aliyuncs.com:5432`），新建库与业务账号 |
| `JWT_SECRET` | （秘密） | ⚠️ **生成新随机串**（≥ 32 字符），不复用测试 |
| `JWT_REFRESH_SECRET` | （秘密） | ⚠️ **生成新随机串**，与 `JWT_SECRET` 不同 |
| `JWT_EXPIRES_IN` | 例如 `15m` | 与测试一致 |
| `JWT_REFRESH_EXPIRES_IN` | 例如 `7d` | 与测试一致 |
| `PORT` | `3001` | 与测试一致 |
| `CORS_ORIGIN` | `https://procx.wanpuxx.com` | **改为正式域名**（如 `https://pro.wanpuxx.com`） |
| `NODE_ENV` | `production` | 一致 |
| `COOKIE_SECURE` | `true`（HTTPS） | 一致 |

> 生成密钥可用：`openssl rand -base64 48`。

### 测试服务器 PostgreSQL 现状（2026-04 实测）

- **测试机当前是 ECS 本机自带 PostgreSQL**：
  - 监听 `localhost:5432`，库名 `smarttrack_pro`
  - **服务端版本**：`PostgreSQL 13.23 on x86_64-koji-linux-gnu`
  - **`lc_collate`**：`en_US.UTF-8`（`server_encoding / timezone` 待补，见附录 C）
  - **扩展**：仅 `plpgsql 1.0`（PostgreSQL 默认扩展，**无任何额外扩展依赖**）
  - **库大小**：17 MB；前 10 张大表均在 50～200 行（纯测试数据量）
  - systemd unit 中保留 `After=postgresql.service`
- **正式架构变化**：正式机不在 ECS 跑 PG，改用 **阿里云 RDS PostgreSQL（同地域同 VPC）**。
- **RDS 版本选型**：**PostgreSQL 13**（与测试同大版本最稳；本项目仅依赖 `plpgsql`，未来升 14/15/16 也无风险，但首次以 13 为基线）。
- **RDS 扩展**：**无需额外启用任何扩展**，`plpgsql` RDS 默认提供。
- **不迁移测试数据**：正式机走「空库 + `prisma migrate deploy` + 必要 seed」上线（详见下文「正式服务器」节）。

### 测试服务器阿里云资源（2026-04 实测）

| 项 | 值 |
|----|-----|
| **实例 ID** | `i-bp17f6mhkevassrav77l` |
| **实例名** | 万濮云通用 |
| **地域 / 可用区** | 华东 1（杭州） / 可用区 I |
| **VPC** | `vpc-bp1ik7wmb3pypouehyr0w`（默认 VPC，IPv4 网段 `172.16.0.0/12`） |
| **主私网 IP** | `172.24.201.136` |
| **公网 IP** | `47.96.132.58`（普通公网，非 EIP） |
| **实例规格** | `ecs.t6-c1m1.large`（**突发性能型 t6**，2 vCPU + 2 GiB；CPU 积分用完会被限速） |
| **公网带宽** | 3 Mbps（按固定带宽） |
| **系统盘** | ESSD 云盘 40 GiB |
| **付费** | 包年包月，到期 2027-07-20 |
| **创建时间** | 2024-07-20 |
| **安全组 ID** | `sg-bp179nhlb03dyyqo17nt`（**当前规则过于宽松，见下文「已知风险」**） |

> **正式机网络规划**：建议**复用同一个 VPC**（`vpc-bp1ik7wmb3pypouehyr0w`，华东 1 / 可用区 I），让正式 ECS、正式 RDS、测试 ECS 都在同 VPC，**RDS 走内网 + 白名单**对接 ECS，最省心。

### ⚠️ 测试机当前已知风险（必须尽快修）

下列三项**直接关系到测试机能否继续承担"上线参考"角色**。正式机上线前请先在测试机修复，避免把不安全实践搬到正式：

1. **certbot 没有自动续期**  
   - 实测：`systemctl list-timers | grep certbot` 无输出；`/etc/cron.d/certbot` 不存在。  
   - 当前证书 `procx.wanpuxx.com` 仅剩 72 天有效（到期 2026-07-11）。**到期未续会触发整站 HTTPS 报错**。  
   - 修复见「附录 D：certbot 自动续期 systemd timer」。

2. **安全组对公网开放数据库与远程协议端口**  
   - 安全组 `sg-bp179nhlb03dyyqo17nt` 入方向放行了 `0.0.0.0/0`：  
     - **数据库类**：`5432(PG)` `3306(MySQL)` `1433(MS SQL)` `1521(Oracle)` `6379(Redis)` —— 全部对全网开放。  
     - **远程协议类**：`3389(RDP)` `23(telnet)` —— Linux 服务器完全不需要。  
     - **SSH 22**：来源 `0.0.0.0/0`，登录提示已显示 _"There were 23 failed login attempts since the last successful login"_，正在被爆破。  
   - 修复见「附录 E：安全组规则收紧（测试 + 正式同款）」。

3. **systemd 仍以 root 跑 Node**  
   - 改造方案见「附录 B」。

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
- **健康检查**：`curl -s http://127.0.0.1:3001/api/health` → `{"status":"ok",...}`
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
7. `curl -s http://127.0.0.1:3001/api/health` 返回 `{"status":"ok"...}`
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
curl -s http://127.0.0.1:3001/api/health
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
- 现象上很像「迁移成功 + Prisma generate 成功 + tsc 没报错 + 服务 active running + /api/health OK」一切都对，但任何 `services/*.ts` 改动都不生效。

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
2. `curl -s http://127.0.0.1:3001/api/health` 返回 `{"status":"ok",...}`。
3. `ss -tlnp | grep 3001` 确认 API 在监听。
4. 浏览器打开上文「测试环境访问地址」，强刷一次，确认登录、产品列表、系统设置、**打印模板列表**、生产/PSI/财务等核心模块无「数据库结构不一致」或字段缺失类错误。
5. `cd /var/www/smarttrack-pro/backend && npx prisma migrate status` 显示迁移已全部应用。
6. 关键功能升级时可在线上 grep 编译产物，确认新逻辑已落地（例如系统打印模板合并：见上节「构建路径与历史坑」末尾）。

### 测试环境回滚（简要）

1. `cd /var/www/smarttrack-pro && git checkout <上一提交的 hash 或 tag>`
2. 按「推荐发版顺序」重新执行：`rm -rf dist && npm run build` + `sudo systemctl restart smarttrack-api`，前端再 `npm run build`。
3. **数据库迁移一般不回滚**；若新 migration 有问题，应在修复后向前迁移，而非在生产随意 `migrate resolve` 回退，除非有明确 DBA/运维方案。

---

## 正式服务器（规划 + 首次上线）

> 上线后把本节「待填」字段替换为**实测真值**（域名/IP、RDS 地址、可用区、规格等），保留与测试机的差异说明。

### 与测试机的对照（必须知道的差异）

| 维度 | 测试服务器 | 正式服务器 | 必须改 |
|------|-----------|-----------|-------|
| 数据库位置 | ECS 本机 PostgreSQL（`localhost:5432`） | **阿里云 RDS PostgreSQL（独立实例）** | ✅ |
| 数据迁移 | — | **不从测试机迁数据**，正式空库 + `prisma migrate deploy` + seed | ✅ |
| `DATABASE_URL` | 指向 `localhost` | 指向 RDS 内网地址 | ✅ |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | 测试值 | **重新生成**，不复用测试值 | ✅ |
| `CORS_ORIGIN` | `https://procx.wanpuxx.com` | 正式域名 `https://<正式域名>` | ✅ |
| 域名 / 证书 | `procx.wanpuxx.com` + Let's Encrypt | 新正式域名 + Let's Encrypt（或阿里云 SSL） | ✅ |
| `systemd unit` 的 `After=` | `network.target postgresql.service` | **去掉 `postgresql.service`**（无本地 PG） | ✅ |
| `systemd` 运行用户 | 当前 `root`（建议同步切到 `smarttrack`，见附录 B） | **`smarttrack`（专用业务用户）** | ✅ |
| OS / Node / Nginx / 项目路径 / 端口 / 服务名 | 见上文「系统现状」 | **与测试机完全一致** | — |

### 正式机推荐规格（已确认：可适当做高）

| 资源 | 规格 | 说明 |
|------|------|------|
| ECS | **4 vCPU + 8 GiB**，计算型 `c9i`（如 `ecs.c9i.xlarge`） | 独享算力，正式更稳；不要选共享型/突发性能型 |
| ECS 系统盘 | **ESSD 50～80 GB** | 系统 + 代码 + `node_modules` + 日志 |
| ECS 公网带宽 | 5 Mbps 起（按固定带宽，可后调） | 静态资源量上来后可前置 CDN |
| Swap | **1～2 GiB**（部署后用 `dd` 创建） | 兜底防 OOM |
| RDS | **PostgreSQL 13**（与测试同大版本，已实测） | **高可用版**（主备）；起步 2 vCPU + 4 GiB；扩展无需额外启用（`plpgsql` 默认有） |
| RDS 存储 | ESSD 起步 100 GB + 自动扩容 | 测试库当前仅 17 MB，正式起步 100 GB 余量充足 |
| 网络 | ECS 与 RDS **同地域同 VPC**（建议复用现有 `vpc-bp1ik7wmb3pypouehyr0w` / 华东 1 / 可用区 I） | RDS 白名单只加 ECS 内网 IP，**禁止公网 5432** |

### 正式服务器关键信息（部分已确定 + 部分待填）

> ⚠️ 上线时把"待填"项替换为实测真值，**这是文档作为"读得回"的核心**。

| 项 | 值 |
|----|-----|
| 公网域名 | **`procx.wanpuxx.com`**（与原测试机域名一致；2026-04-30 由测试机 IP 切换至正式机 IP） |
| 计费方式 | **包年包月**（已确定） |
| 地域 / 可用区 | **华东 1（杭州） / 主可用区 K**（已确定；RDS 备可用区 B；正式 ECS 也建在 K 区） |
| VPC | **`vpc-bp1wd8l5laj336fif28zs`**（已确定，**独立于测试 VPC**，与测试环境天然内网隔离更安全） |
| ECS 实例规格 | **`ecs.c9i.xlarge`** 4 vCPU + 8 GiB（已确定） |
| ECS 系统盘 | **ESSD 60 GiB**（已确定） |
| ECS 公网带宽 | **5 Mbps 固定**（已确定） |
| ECS 安全组 | **新建 `smarttrack-prod-sg`**，仅放行 80/443 + SSH 限源（已确定，**不复用测试安全组**） |
| ECS 登录方式 | **密钥对 `smarttrack-prod`**（阿里云自动生成，2026-04-30 创建）；登录用户 `root`；私钥由运维人员本地保管，**只有一次下载机会**，丢失需重置 ECS 登录信息 |
| ECS 登录命令模板 | `ssh -i <你的私钥路径>/smarttrack-prod.pem root@<ECS公网IP>`（私钥需 `chmod 600`） |
| ECS 实例 ID | **`i-bp15tqtq9ad92wwq0u2a`** |
| ECS 公网 IP | **`120.26.182.164`** |
| ECS 私网 IP | **`172.27.25.85`** |
| ECS 安全组 ID | **`sg-bp15ooknaelm7w087gxf`** |
| ECS 到期时间 | **2031-04-30**（已购 5 年，已开启自动续费 1 年） |
| RDS 引擎 / 系列 | **PostgreSQL 13 高可用版**（已确定） |
| RDS 规格 / 存储 | **2 vCPU + 4 GiB / ESSD 100 GB**（已确定） |
| RDS 库名 | **`smarttrack_prod`**（已确定） |
| RDS 业务账号 | **`smarttrack`**（已确定，密码仅存于服务器 `.env`） |
| RDS 实例 ID | **`pgm-bp156t5849gu9fh8`** |
| RDS 内网地址 | **`pgm-bp156t5849gu9fh8.pg.rds.aliyuncs.com:5432`** |
| RDS 白名单 | 分组 `smarttrack` = `172.27.25.85/32`（已生效）；另有阿里云内置 `default` = `172.16.0.0/12`，建议后续清理（见下方备注） |
| HTTPS 证书 / 续期 | **Let's Encrypt（procx.wanpuxx.com，2026-04-30 签发，到期 2026-07-29）+ certbot + RPM 自带 `certbot-renew.timer`（已 `enable --now`，每 12h 触发）** |
| 备份策略 | RDS 自动备份（每日，保留 ≥ 7 天）；ECS 自动快照 |

### 2026-04-30 首次上线踩坑实录（必读）

> 以下 4 项是当天部署中实际碰到的问题。后续二次部署或灾备重建时，**按本节顺序提前规避**。

1. **`backend/tsconfig.json` 默认会把 `../shared/**/*.test.ts` 编译进生产产物**
   - 现象：`npm run build` 报 `error TS2307: Cannot find module 'vitest'`（vitest 是前端 devDependency，后端 `node_modules` 里没有）。
   - 修复：仓库里 `backend/tsconfig.json` 的 `exclude` 已加上 `../shared/**/*.test.ts`。**确认这条已合入再 build**。
2. **`backend/package.json` 缺顶级 `prisma.seed` 字段，`npx prisma db seed` 静默无输出**
   - 现象：`npx prisma db seed` 没报错也不执行 seed.ts，数据库始终为空。
   - 修复：仓库里 `backend/package.json` 已补 `"prisma": { "seed": "tsx prisma/seed.ts" }`。
   - 备选：直接 `sudo -u smarttrack npm run db:seed` 也行（绕开 Prisma 的 seed 机制）。
3. **`.env` 中 `JWT_SECRET` / `JWT_REFRESH_SECRET` 必须为强随机非空值**
   - 现象：登录返回 500「服务器内部错误」，`journalctl -u smarttrack-api` 看到 `Missing required env var: JWT_SECRET`（被 `errorHandler` 在生产模式下兜成通用错误）。
   - 推荐生成方式：`openssl rand -hex 64`（128 字符，远超 base64 48 字节强度）。
   - **不要用 `JWT_SECRET=""` 或 `JWT_SECRET=changeme` 这类占位**，dotenv 解析空字符串后 `requireEnv` 会抛错。
4. **DNS 从测试机切到正式机时，本机 DNS 缓存可能顽固持有旧 IP**
   - 现象：阿里云 DNS 控制台已改 A 记录，ECS 上 `curl http://procx.wanpuxx.com/` 已经命中正式机，但 Mac 浏览器仍打到测试机；登录页能看到测试机数据，被误判为"正式机部署成功"。
   - 排查：在 Mac 上 `dig +short procx.wanpuxx.com @223.5.5.5` 与默认 DNS 比对；浏览器 F12 → Network → Remote Address；最稳的是临时加一行 `/etc/hosts` 强制指向正式机。
   - 提醒：每次 DNS 切换后**用浏览器无痕窗口 + Network Remote Address 双重确认**到的是新 IP 才能开始功能验收。

### 首次上线步骤（按顺序执行）

> 前置：ECS 已开通、RDS 已建库与白名单（白名单只加 ECS 内网 IP）、域名 A 记录已指向 ECS 公网 IP。

**1. 系统初始化（在 ECS 上）**

```bash
timedatectl set-timezone Asia/Shanghai
localectl set-locale LANG=zh_CN.UTF-8

# swap（建议）
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 基础包（与测试机版本对齐）
sudo dnf install -y nginx git nodejs certbot python3-certbot-nginx
node -v   # 期望 v20.x；若不是请装阿里云源 Node 20
```

**2. 拉代码 + 创建运行用户**

```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone https://gitee.com/zheng-jun1988/workorder.git smarttrack-pro
sudo useradd -r -s /sbin/nologin -d /var/www/smarttrack-pro smarttrack
sudo chown -R smarttrack:smarttrack /var/www/smarttrack-pro
```

**3. 写 `.env`（按上文键名清单，全部用新值）**

```bash
sudo -u smarttrack tee /var/www/smarttrack-pro/backend/.env > /dev/null <<'EOF'
DATABASE_URL="postgresql://<rds_user>:<密码>@<rds-内网>:5432/smarttrack_prod?schema=public"
JWT_SECRET="<openssl rand -base64 48>"
JWT_REFRESH_SECRET="<openssl rand -base64 48>"
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
PORT=3001
CORS_ORIGIN=https://<正式域名>
NODE_ENV=production
COOKIE_SECURE=true
EOF
sudo chmod 640 /var/www/smarttrack-pro/backend/.env
```

**4. 安装依赖、迁移、构建**

```bash
cd /var/www/smarttrack-pro/backend
sudo -u smarttrack npm ci
sudo -u smarttrack npx prisma migrate deploy
sudo -u smarttrack npx prisma generate
sudo -u smarttrack npm run build  # 产出 dist/backend/src/index.js
# 如需种子数据：
# sudo -u smarttrack npm run db:seed

cd /var/www/smarttrack-pro
sudo -u smarttrack npm ci
sudo -u smarttrack npm run build  # 产出 ./dist
```

**5. systemd 服务（专用用户、不依赖本地 PG）**

```bash
sudo tee /etc/systemd/system/smarttrack-api.service > /dev/null <<'EOF'
[Unit]
Description=SmartTrack Pro API
After=network.target

[Service]
Type=simple
User=smarttrack
Group=smarttrack
WorkingDirectory=/var/www/smarttrack-pro/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/backend/src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now smarttrack-api
sudo systemctl status smarttrack-api --no-pager | head -15
curl -s http://127.0.0.1:3001/api/health
```

**6. Nginx 站点（用「附录 A」模板，把 `<你的域名>` 全替换）**

```bash
sudo vi /etc/nginx/conf.d/smarttrack.conf   # 内容见附录 A
sudo nginx -t && sudo systemctl restart nginx
```

**7. 申请 HTTPS 证书**

```bash
sudo certbot --nginx -d <正式域名>
sudo systemctl list-timers | grep certbot   # 确认自动续期 timer
```

**8. 上线自检**：参考测试机「自检清单」节，命令完全一致。

### 正式机日常发版

与测试机「推荐发版顺序」一致，唯一差异：**所有 `npm ci / build / migrate` 都用 `sudo -u smarttrack`** 执行（避免 owner 漂移），最后 `sudo systemctl restart smarttrack-api`。

---

## 与「业务迁移文档」的区别

- **`docs/04-migration-checklist.md`**：指代码与数据模型从旧架构收口到后端的**开发迁移清单**。  
- **本文**：指**测试机 / 正式机**上的发布路径、命令与注意事项。

二者不要混为一谈。

---

## 附录 A：Nginx 推荐配置模板（正式机用 + 测试机同步）

测试机当前 `/etc/nginx/conf.d/smarttrack.conf` 是基础版（仅 `try_files` + `proxy_pass`）。建议正式机直接采用以下增强版，并把测试机也同步改造（**配置升级，无业务影响**）。

### 模板内容

```nginx
server {
    server_name <你的域名>;

    root /var/www/smarttrack-pro/dist;
    index index.html;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml image/svg+xml font/woff font/woff2;

    # Vite 产物文件名带 hash，可放心 immutable
    location ~* \.(?:js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /api/ {
        client_max_body_size 50m;
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/<你的域名>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<你的域名>/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = <你的域名>) { return 301 https://$host$request_uri; }
    listen 80;
    server_name <你的域名>;
    return 404;
}
```

### 相比测试机当前配置的升级点（一行一项）

- `proxy_read_timeout 120s` / `proxy_send_timeout 120s`：导出/打印类接口偶尔超过默认 60s 会被 Nginx 切断。
- `X-Forwarded-Proto $scheme`：让后端识别真实协议（生成回调链接、Cookie `secure` 判断会用到）。
- `gzip` + 静态资源 30 天 `immutable` 缓存：首屏与二次访问明显更快。

### 测试机同步改造步骤

```bash
sudo cp /etc/nginx/conf.d/smarttrack.conf /etc/nginx/conf.d/smarttrack.conf.bak.$(date +%Y%m%d)
sudo vi /etc/nginx/conf.d/smarttrack.conf
# 按上方模板调整；server_name 保留：procx.wanpuxx.com 47.96.132.58
sudo nginx -t
sudo nginx -s reload
```

如 `nginx -t` 报错或 reload 后异常，**回滚**：

```bash
sudo cp /etc/nginx/conf.d/smarttrack.conf.bak.$(date +%Y%m%d) /etc/nginx/conf.d/smarttrack.conf
sudo nginx -t && sudo nginx -s reload
```

---

## 附录 B：systemd 切换到专用业务用户 `smarttrack`

> 当前测试机以 `root` 身份跑 Node API（`User=` 为空），安全性较差。正式机直接按本附录用 `smarttrack` 用户落地；测试机也按下方步骤同步切换，保持两侧一致。

### 一次性准备（创建用户 + 修正属主）

```bash
sudo useradd -r -s /sbin/nologin -d /var/www/smarttrack-pro smarttrack
sudo chown -R smarttrack:smarttrack /var/www/smarttrack-pro
sudo chmod 640 /var/www/smarttrack-pro/backend/.env
```

### 修改 unit 文件

测试机 unit 在 `/etc/systemd/system/smarttrack-api.service`，改为：

```ini
[Unit]
Description=SmartTrack Pro API
# 测试机本机仍跑 PG，保留下一行；正式机请删除 postgresql.service
After=network.target postgresql.service

[Service]
Type=simple
User=smarttrack
Group=smarttrack
WorkingDirectory=/var/www/smarttrack-pro/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/backend/src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

应用：

```bash
sudo systemctl daemon-reload
sudo systemctl restart smarttrack-api
sudo systemctl status smarttrack-api --no-pager | head -15
sudo ss -tlnp | grep 3001
curl -s http://127.0.0.1:3001/api/health
```

### 发版流程相应调整（重要）

切到 `smarttrack` 后，**所有写操作**都要以 `smarttrack` 身份执行，避免 `git pull / npm ci / build` 写入 root 拥有的文件，导致 systemd 重启后读不到：

```bash
# 后端
cd /var/www/smarttrack-pro/backend
sudo -u smarttrack npm ci
sudo -u smarttrack npx prisma migrate deploy
sudo -u smarttrack npm run build
sudo systemctl restart smarttrack-api

# 前端
cd /var/www/smarttrack-pro
sudo -u smarttrack npm ci
sudo -u smarttrack npm run build
```

> 兜底：若某次发版用 `root` 跑了 `npm ci/build`，结尾补一句  
> `sudo chown -R smarttrack:smarttrack /var/www/smarttrack-pro` 再 `restart`。

### 回滚

切回 root：unit 中删除 `User=`/`Group=` 两行，`daemon-reload && restart` 即可。

---

## 附录 C：信息待补 TODO

以下信息确认后请回填到本文件相应位置。

### 1. 测试机 PostgreSQL 的 `server_encoding` / `timezone`

之前一次跑 3 个 `show` 只回显了最后一个 `lc_collate`，请分开各跑一次：

```bash
sudo -u postgres psql -d smarttrack_pro -c "show server_encoding;"
sudo -u postgres psql -d smarttrack_pro -c "show timezone;"
```

把两条结果回填到「测试服务器 PostgreSQL 现状」节。

### 2. 正式机相关（2026-04-30 已回填，本节保留作为采购变更追踪表）

- 公网域名 → `procx.wanpuxx.com`（与测试机域名一致；测试机后续改成新域名）✅
- 正式 ECS 实例 ID / 公网 IP / 私网 IP / 实例规格 → `i-bp15tqtq9ad92wwq0u2a` / `120.26.182.164` / `172.27.25.85` / `ecs.c9i.xlarge` ✅
- 正式 RDS 实例 ID / 内网地址 / 业务库名 / 业务账号 → `pgm-bp156t5849gu9fh8` / `pgm-bp156t5849gu9fh8.pg.rds.aliyuncs.com:5432` / `smarttrack_prod` / `smarttrack` ✅
- 正式机安全组 ID → `sg-bp15ooknaelm7w087gxf` ✅
- 正式机 systemd timer（certbot）→ RPM 自带 `certbot-renew.timer`（已 `enable --now`），`Trigger: 12h 触发；OnCalendar=*-*-* 00/12:00:00 + RandomizedDelaySec=12hours` ✅

### 3. 待补 / 后续治理项

- **测试机改用新域名**（如 `test.wanpuxx.com` / `procx-test.wanpuxx.com`）：
  - 阿里云 DNS 加新 A 记录指向 `47.96.132.58`；
  - 测试机 `nginx server_name` 改成新域名 + 重新 `certbot --nginx -d <新域名>`；
  - 测试机老的 `procx.wanpuxx.com` 证书自然过期不再续。
- **正式机 RDS 内置 `default` 安全分组（`172.16.0.0/12`）建议清理**，仅保留 `smarttrack = 172.27.25.85/32` 一条。
- **测试机的 3 项已知风险（见上文测试节）尚未修复**：certbot 自动续期 timer、安全组收紧、systemd 切到 smarttrack 用户。

---

## 附录 D：certbot 自动续期 systemd timer

> 阿里云 Linux 3 / RHEL 系 `dnf install certbot` **不会**自动建 systemd timer 或 cron（与 Ubuntu 不同）。**必须手动建**，否则 90 天后证书过期整站 HTTPS 报错。
> 测试机和正式机都需要执行本节。

### 一次性配置

```bash
sudo tee /etc/systemd/system/certbot-renew.service > /dev/null <<'EOF'
[Unit]
Description=Certbot Renewal

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

sudo tee /etc/systemd/system/certbot-renew.timer > /dev/null <<'EOF'
[Unit]
Description=Run certbot renew twice a day

[Timer]
OnCalendar=*-*-* 03,15:00:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renew.timer
```

### 验证

```bash
sudo systemctl list-timers | grep certbot
# 期望看到 NEXT 列是几小时后的时间，UNIT 列是 certbot-renew.timer

sudo certbot renew --dry-run
# 期望最后输出 "Congratulations, all simulated renewals succeeded."
```

### 工作机制

- 每天 03:00 与 15:00 各试一次；`certbot renew` 自身只在剩余有效期 < 30 天时才真正续；其余时间直接退出，无副作用。  
- 续期成功后会自动 `systemctl reload nginx`，让新证书生效，不影响在线连接。

---

## 附录 E：安全组规则收紧（测试 + 正式同款）

### 入方向最终目标

| 端口 | 来源 | 说明 |
|------|------|------|
| `80` | `0.0.0.0/0` | HTTP（用于 certbot 验证 + 80→443 跳转） |
| `443` | `0.0.0.0/0` | HTTPS |
| `22` | **办公/家庭固定 IP（限制为 `xxx.xxx.xxx.xxx/32` 或公司公网段）** | SSH，**禁止 `0.0.0.0/0`** |

> 其它端口**一律不放行**，包括 `5432 / 3306 / 6379 / 1433 / 1521 / 3389 / 23 / 3000 / 8989` 等。

### 测试机当前要删掉的规则

到「ECS 控制台 → 实例详情 → 网络与安全组 → 安全组 `sg-bp179nhlb03dyyqo17nt` → 入方向」，**删除以下条目**：

- `PostgreSQL(5432)` `0.0.0.0/0` ← **最危险，立刻删**
- `MySQL(3306)` `0.0.0.0/0`
- `Redis(6379)` `0.0.0.0/0`
- `MS SQL(1433)` `0.0.0.0/0`
- `Oracle(1521)` `0.0.0.0/0`
- `RDP(3389)` `0.0.0.0/0`
- `自定义 TCP 23 (telnet)` `0.0.0.0/0`
- `自定义 TCP 3000` `0.0.0.0/0`（业务用 3001，3000 无在用进程）
- `自定义 TCP 8989` `0.0.0.0/0`（用途不明，无在用进程则删）

> 不放心可先把"授权策略"改为"拒绝"或缩窄到 `127.0.0.1/32` 观察一两天再删。

### 把 SSH 22 收紧到固定 IP

1. 查自己的公网 IP：`curl -s ifconfig.me; echo`。  
2. 控制台编辑 `SSH(22)` 规则，把"访问来源"由 `0.0.0.0/0` 改成 `<你的公网 IP>/32`。  
3. **改之前请保留另一个 SSH 会话不要关**，避免被自己锁在外面；改完用新会话验证能登录后再退出旧会话。  
4. 公网 IP 不固定（如家庭宽带）的备选：  
   - 使用 阿里云 VPN 或 跳板机；  
   - 段放宽到运营商段（如 `xxx.xxx.0.0/16`），仍比 `0.0.0.0/0` 安全得多；  
   - 加一台低配 ECS 当跳板（仅它的 IP 能 SSH 业务机）。

### 正式机沿用同一安全组策略

正式机新建安全组时，**只放行 80/443 + 受限 IP 的 22**；RDS 的访问通过 **VPC 内网 + 白名单（只加正式 ECS 内网 IP）**，不需要在 ECS 安全组上放 5432。

---

## 本地开发（Mac / Windows）

若拉取含 **Prisma 新列**（如 `report_display_template`、`route_report_display_values`）的代码后，在「系统设置 → 工序节点」保存报工展示模板报错：

1. 在 **`backend` 目录**执行：`npx prisma migrate deploy`（或 `npx prisma migrate dev`）。
2. 执行：`npx prisma generate`（通常 `migrate` 后会提示；保险可手动跑一次）。
3. **重启本地 API 进程**（`tsx watch` / `npm run dev`），再刷新前端。

开发环境下 API 若返回 `detail` 字段，为 Prisma 原始报错摘要，便于对照缺哪一列。
