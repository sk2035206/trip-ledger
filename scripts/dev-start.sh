#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/dev.pid"
LOG_FILE="$LOG_DIR/dev.log"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5173}"
BUNDLED_NODE="/Users/make/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"

if [ -x "$BUNDLED_NODE/node" ]; then
  export PATH="$BUNDLED_NODE:$PATH"
fi

mkdir -p "$LOG_DIR"
"$ROOT_DIR/scripts/api-start.sh"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "项目已在运行：PID $OLD_PID"
    echo "本机访问：http://localhost:$PORT/"
    LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
    if [ -n "$LAN_IP" ]; then
      echo "局域网访问：http://$LAN_IP:$PORT/"
    fi
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null | head -n 1 || true)"
  if [ -n "$PORT_PID" ]; then
    echo "端口 $PORT 已被 PID $PORT_PID 占用，请先停止该进程或改用 PORT=其他端口。"
    exit 1
  fi
fi

{
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动旅行分账 H5"
  echo "Host: $HOST"
  echo "Port: $PORT"
} >> "$LOG_FILE"

cd "$ROOT_DIR"
nohup env WRANGLER_LOG_PATH="$LOG_DIR/wrangler.log" node_modules/.bin/vinext dev --hostname "$HOST" --port "$PORT" >> "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

echo "项目已启动：PID $PID"
echo "本机访问：http://localhost:$PORT/"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -n "$LAN_IP" ]; then
  echo "局域网访问：http://$LAN_IP:$PORT/"
else
  echo "局域网访问：请查看本机局域网 IP 后访问 http://<你的IP>:$PORT/"
fi
echo "日志文件：$LOG_FILE"
