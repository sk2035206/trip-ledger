#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/web.pid"
LOG_FILE="$LOG_DIR/web.log"
HOST="${WEB_HOST:-127.0.0.1}"
PORT="${WEB_PORT:-5173}"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/node-runtime.sh"

mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Web 服务已在运行：PID $OLD_PID"
    echo "本机访问：http://$HOST:$PORT/"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null | head -n 1 || true)"
  if [ -n "$PORT_PID" ]; then
    echo "Web 端口 $PORT 已被 PID $PORT_PID 占用，请先停止该进程或改用 WEB_PORT=其他端口。"
    exit 1
  fi
fi

{
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动旅行分账 Web"
  echo "Host: $HOST"
  echo "Port: $PORT"
} >> "$LOG_FILE"

cd "$ROOT_DIR"
nohup env HOST="$HOST" PORT="$PORT" WRANGLER_LOG_PATH="$LOG_DIR/wrangler-start.log" npm run start >> "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

echo "Web 服务已启动：PID $PID"
echo "本机访问：http://$HOST:$PORT/"
echo "日志文件：$LOG_FILE"
