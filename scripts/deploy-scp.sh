#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-$ROOT_DIR/config/deploy.env}"

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

DEPLOY_TARGET="${DEPLOY_TARGET:-xxy}"
REMOTE_FRONTEND_DIR="${REMOTE_FRONTEND_DIR:-/usr/share/nginx/html/trip-ledger}"
REMOTE_BACKEND_DIR="${REMOTE_BACKEND_DIR:-/home/trip-ledger}"
FRONTEND_PACKAGE="$ROOT_DIR/release/trip-ledger-frontend-latest.tar.gz"
BACKEND_PACKAGE="$ROOT_DIR/release/trip-ledger-backend-latest.tar.gz"

if [ -z "$DEPLOY_TARGET" ]; then
  echo "请先设置 DEPLOY_TARGET，例如：DEPLOY_TARGET=xxy"
  echo "也可以复制 config/deploy.example.env 为 config/deploy.env 后填写。"
  exit 1
fi

"$ROOT_DIR/scripts/release-build.sh"

ssh "$DEPLOY_TARGET" "mkdir -p '$REMOTE_FRONTEND_DIR' '$REMOTE_BACKEND_DIR'"
scp "$FRONTEND_PACKAGE" "$DEPLOY_TARGET:$REMOTE_FRONTEND_DIR/trip-ledger-frontend.tar.gz"
scp "$BACKEND_PACKAGE" "$DEPLOY_TARGET:$REMOTE_BACKEND_DIR/trip-ledger-backend.tar.gz"

cat <<EOF
上传完成。

请在服务器执行：
  mkdir -p "$REMOTE_FRONTEND_DIR" "$REMOTE_BACKEND_DIR"
  tar -xzf "$REMOTE_FRONTEND_DIR/trip-ledger-frontend.tar.gz" -C "$REMOTE_FRONTEND_DIR"
  tar -xzf "$REMOTE_BACKEND_DIR/trip-ledger-backend.tar.gz" -C "$REMOTE_BACKEND_DIR"
  cd "$REMOTE_BACKEND_DIR"
  npm ci
  cp -n config/mysql.example.json config/mysql.json
  vi config/mysql.json
  API_HOST=127.0.0.1 API_PORT=5174 WEB_HOST=127.0.0.1 WEB_PORT=5173 scripts/prod-start.sh

nginx 建议：
  /api/ 转发到 http://127.0.0.1:5174
  / 转发到 http://127.0.0.1:5173
  /_next/static/ 可指向 $REMOTE_FRONTEND_DIR/_next/static/
EOF
