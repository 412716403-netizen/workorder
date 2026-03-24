#!/bin/bash
# 在 ECS 上以 root 执行：bash setup-systemd-on-server.sh
# 或：scp deploy/setup-systemd-on-server.sh root@你的IP:/root/ && ssh root@你的IP bash /root/setup-systemd-on-server.sh

set -euo pipefail

NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then
  echo "错误: 未找到 node，请先安装 Node.js"
  exit 1
fi

BACKEND="/var/www/smarttrack-pro/backend"
if [[ ! -f "$BACKEND/dist/index.js" ]]; then
  echo "错误: 未找到 $BACKEND/dist/index.js，请先 npm run build"
  exit 1
fi

cat > /etc/systemd/system/smarttrack-api.service << EOF
[Unit]
Description=SmartTrack Pro API
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=$BACKEND
Environment=NODE_ENV=production
ExecStart=$NODE_BIN dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable smarttrack-api
systemctl restart smarttrack-api
sleep 1
systemctl --no-pager status smarttrack-api

echo ""
echo "健康检查:"
curl -sS "http://127.0.0.1:3001/api/health" || true
echo ""
echo "若前端用 HTTP（非 HTTPS）访问，请在 $BACKEND/.env 中设置 COOKIE_SECURE=false 后执行: systemctl restart smarttrack-api"
echo ""
