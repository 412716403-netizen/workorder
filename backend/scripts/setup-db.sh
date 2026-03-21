#!/usr/bin/env bash
# 一键：① 启动 PostgreSQL（Docker，可选）② 建表 ③ 种子数据
set -e
cd "$(dirname "$0")/.."

# macOS：Docker Desktop 的 docker 常在 /usr/local/bin 或 /opt/homebrew/bin
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
  export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

CONTAINER="smarttrack-pg"
DOCKER_URL="postgresql://postgres:postgres@127.0.0.1:5432/smarttrack_pro?schema=public"

docker_cmd() {
  command -v docker >/dev/null 2>&1
}

if [[ ! -f .env ]]; then
  echo ">>> 未找到 .env，从 .env.example 复制..."
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env 2>/dev/null || true
set +a

if docker_cmd; then
  echo ">>> 步骤 1/3：PostgreSQL（Docker 容器 $CONTAINER）..."
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    echo "    容器已在运行。"
  elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    echo "    启动已有容器..."
    docker start "$CONTAINER"
  else
    echo "    创建并启动 PostgreSQL 16（首次会下载镜像，请稍候）..."
    if ! docker run -d --name "$CONTAINER" \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=smarttrack_pro \
      -p 5432:5432 \
      postgres:16-alpine; then
      echo "    失败：请确认 Docker Desktop 已打开，且 5432 端口未被占用。"
      exit 1
    fi
  fi
  export DATABASE_URL="$DOCKER_URL"
  echo "    连接: $DATABASE_URL"
  echo "    等待数据库就绪..."
  for i in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U postgres -d smarttrack_pro >/dev/null 2>&1; then
      echo "    就绪。"
      break
    fi
    if [[ $i -eq 60 ]]; then
      echo "    超时：请打开 Docker Desktop，等鲸鱼图标稳定后再执行: npm run setup"
      exit 1
    fi
    sleep 1
  done
else
  echo ">>> 步骤 1/3：终端里找不到 docker 命令"
  echo "    若已安装 Docker Desktop：请先打开 Docker，再重新打开终端，在 backend 目录执行 npm run setup"
  echo "    若不用 Docker：请用 Homebrew 安装 PostgreSQL（见下方报错后的说明）"
  if [[ -z "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL="$DOCKER_URL"
  fi
fi

echo ">>> 步骤 2/3：同步表结构（prisma db push）..."
npx prisma generate
set +e
npx prisma db push --accept-data-loss 2>&1
PUSH_EXIT=$?
set -e

if [[ $PUSH_EXIT -ne 0 ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  连不上 PostgreSQL（常见原因与解决办法）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  1) 目录：若提示符已是「... backend %」，不要再执行 cd backend（会报错）。"
  echo "     从项目根目录进入：cd 到「smarttrack-pro---生产进度节点报工系统」再执行 cd backend"
  echo ""
  echo "  2) 用 Docker（推荐）：安装并打开 Docker Desktop"
  echo "     https://www.docker.com/products/docker-desktop/"
  echo "     打开后等几秒，在本目录执行：npm run setup"
  echo ""
  echo "  3) 无 Docker 但有 Homebrew 时，一条命令（推荐）："
  echo "     npm run setup:homebrew"
  echo "     （会自动安装 postgresql@16、建库、改 .env、建表、种子数据）"
  echo ""
  exit 1
fi

echo ">>> 步骤 3/3：种子数据（admin / admin123）..."
npm run db:seed

echo ""
echo "=== 完成 ===  启动 API: npm run dev  |  登录: admin / admin123"
