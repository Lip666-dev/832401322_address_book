#!/usr/bin/env bash
# 把通讯录静态站点部署到云服务器。
#
#   bash deploy/deploy.sh root@192.144.235.99
#   bash deploy/deploy.sh root@192.144.235.99 8081 /var/www/address-book
#
set -euo pipefail

TARGET="${1:?用法: deploy.sh <user@host> [port] [remote_dir]}"
PORT="${2:-8081}"
REMOTE_DIR="${3:-/var/www/address-book}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 上传 $SRC_DIR → $TARGET:$REMOTE_DIR"
ssh "$TARGET" "mkdir -p '$REMOTE_DIR'"
# 只传运行需要的文件；测试与录屏脚本留在本地
rsync -az --delete \
  --exclude '_verification' --exclude 'tests' --exclude '__pycache__' \
  --exclude '.git' --exclude 'downloads' \
  "$SRC_DIR"/ "$TARGET:$REMOTE_DIR"/

echo "==> 设置权限"
ssh "$TARGET" "chmod -R a+rX '$REMOTE_DIR'"

if ssh "$TARGET" "command -v nginx >/dev/null 2>&1"; then
  echo "==> 安装 Nginx 站点配置（端口 $PORT）"
  sed "s/__PORT__/$PORT/; s#__ROOT__#$REMOTE_DIR#" "$SRC_DIR/deploy/nginx-address-book.conf" \
    | ssh "$TARGET" "cat > /etc/nginx/conf.d/address-book.conf"
  ssh "$TARGET" "nginx -t && nginx -s reload"
else
  echo "==> 没装 Nginx，用 Python 起一个后台服务"
  ssh "$TARGET" "cd '$REMOTE_DIR' && (pkill -f 'serve.py' || true) && nohup env PORT=$PORT python3 serve.py > /var/log/address-book.log 2>&1 &"
fi

echo "==> 自检"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://$(echo "$TARGET" | cut -d@ -f2):$PORT/")
echo "HTTP $CODE  http://$(echo "$TARGET" | cut -d@ -f2):$PORT/"
[ "$CODE" = "200" ] || { echo "部署后访问失败，请检查安全组与防火墙是否放行 $PORT"; exit 1; }
echo "完成。"
