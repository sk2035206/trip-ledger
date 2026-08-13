#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$LOG_DIR/api.pid"
LOG_FILE="$LOG_DIR/api.log"
PORT="${API_PORT:-5174}"

mkdir -p "$LOG_DIR"

stop_pid() {
  local pid="$1"
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  kill "$pid"
  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" 2>/dev/null || true
}

STOPPED=0

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if [ -n "$PID" ]; then
    stop_pid "$PID"
    STOPPED=1
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  while read -r PID; do
    if [ -n "$PID" ]; then
      stop_pid "$PID"
      STOPPED=1
    fi
  done < <(lsof -tiTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null || true)
fi

{
  echo ""
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 停止旅行分账 API"
} >> "$LOG_FILE"

if [ "$STOPPED" = "1" ]; then
  echo "后端已停止"
else
  echo "没有发现正在运行的后端"
fi
