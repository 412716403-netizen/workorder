#!/usr/bin/env bash
# 在 ECS 项目根目录执行：./update.sh
# 等价于：git pull + 后端迁移/构建 + 前端构建 + 重启 smarttrack-api（若已配置 systemd）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> git pull origin main"
git pull origin main

echo "==> backend: 依赖（含 dev，便于 prisma / tsc 构建）"
cd "$ROOT/backend"
if [[ -f package-lock.json ]]; then
  npm ci || npm install
else
  npm install
fi

echo "==> backend: 数据库迁移与构建"
npx prisma migrate deploy
npx prisma generate
npm run build

echo "==> frontend: 依赖与构建"
cd "$ROOT"
if [[ -f package-lock.json ]]; then
  npm ci || npm install
else
  npm install
fi
npm run build

echo "==> 重启 API 服务"
if systemctl list-unit-files smarttrack-api.service 2>/dev/null | grep -q smarttrack-api; then
  systemctl restart smarttrack-api
  sleep 1
  curl -sS "http://127.0.0.1:${PORT:-3001}/api/health" || true
  echo ""
  systemctl is-active smarttrack-api && echo "smarttrack-api: 运行中" || echo "WARN: smarttrack-api 未处于 active，请执行: systemctl status smarttrack-api"
else
  echo "WARN: 未检测到 systemd 单元 smarttrack-api，请手动启动后端（例如 node backend/dist/index.js 或 pm2）"
fi

echo "==> 更新完成"
