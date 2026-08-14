#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/api.pid"
LOG_FILE="$LOG_DIR/api.log"
HOST="${API_HOST:-127.0.0.1}"
PORT="${API_PORT:-5174}"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/node-runtime.sh"

mkdir -p "$LOG_DIR"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "后端已在运行：PID $OLD_PID"
    echo "本机访问：http://localhost:$PORT/api/health"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null | head -n 1 || true)"
  if [ -n "$PORT_PID" ]; then
    echo "后端端口 $PORT 已被 PID $PORT_PID 占用，请先停止该进程或改用 API_PORT=其他端口。"
    exit 1
  fi
fi

{
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动旅行分账 API"
  echo "Host: $HOST"
  echo "Port: $PORT"
} >> "$LOG_FILE"

cd "$ROOT_DIR"
nohup env API_HOST="$HOST" API_PORT="$PORT" node_modules/.bin/tsx server/index.ts >> "$LOG_FILE" 2>&1 &
LAUNCH_PID="$!"
sleep 1
PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null | head -n 1 || true)"
if [ -z "$PID" ]; then
  PID="$LAUNCH_PID"
fi
echo "$PID" > "$PID_FILE"

echo "后端已启动：PID $PID"
echo "本机访问：http://localhost:$PORT/api/health"
echo "后端默认仅监听本机；局域网用户通过 H5 同源 /api 代理访问。"
echo "日志文件：$LOG_FILE"
