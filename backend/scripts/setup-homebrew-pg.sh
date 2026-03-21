#!/usr/bin/env bash
# 无 Docker 时：用 Homebrew 安装/启动 PostgreSQL，再建库、改 .env、push、seed
set -e
cd "$(dirname "$0")/.."

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v brew >/dev/null 2>&1; then
  echo "未检测到 Homebrew。请任选其一："
  echo "  1) 安装 Homebrew: https://brew.sh  然后执行: npm run setup:homebrew"
  echo "  2) 安装 Docker Desktop 后执行: npm run setup"
  exit 1
fi

echo ">>> 安装/检查 PostgreSQL 16（Homebrew）..."
brew install postgresql@16 2>/dev/null || true

PG_BIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"
if [[ ! -x "$PG_BIN/pg_isready" ]]; then
  echo "错误：未找到 postgresql@16，请手动执行: brew install postgresql@16"
  exit 1
fi
export PATH="$PG_BIN:$PATH"

echo ">>> 启动 PostgreSQL 服务..."
brew services start postgresql@16 2>/dev/null || brew services restart postgresql@16

echo ">>> 等待 5432 就绪..."
for i in $(seq 1 45); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "    已就绪。"
    break
  fi
  if [[ $i -eq 45 ]]; then
    echo "超时。请执行: brew services list   确认 postgresql@16 为 started"
    exit 1
  fi
  sleep 1
done

echo ">>> 创建数据库 smarttrack_pro（若已存在会跳过）..."
createdb smarttrack_pro 2>/dev/null || true

USER_NAME="$(whoami)"
PG_URL="postgresql://${USER_NAME}@127.0.0.1:5432/smarttrack_pro?schema=public"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

echo ">>> 写入 DATABASE_URL 到 .env（本机用户: ${USER_NAME}）..."
if grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  if [[ "$(uname)" == Darwin ]]; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${PG_URL}\"|" .env
  else
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${PG_URL}\"|" .env
  fi
else
  echo "DATABASE_URL=\"${PG_URL}\"" >> .env
fi

export DATABASE_URL="$PG_URL"

echo ">>> 建表（prisma db push）..."
npx prisma generate
npx prisma db push --accept-data-loss

echo ">>> 种子数据（admin / admin123）..."
npm run db:seed

echo ""
echo "=== 完成 ===  启动 API: npm run dev  |  登录: admin / admin123"
