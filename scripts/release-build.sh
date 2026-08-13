#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
STAMP="$(date '+%Y%m%d%H%M%S')"
WORK_DIR="$RELEASE_DIR/trip-ledger-$STAMP"
FRONTEND_TAR="$RELEASE_DIR/trip-ledger-frontend-$STAMP.tar.gz"
BACKEND_TAR="$RELEASE_DIR/trip-ledger-backend-$STAMP.tar.gz"
BUNDLED_NODE="/Users/make/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"

if [ -x "$BUNDLED_NODE/node" ]; then
  export PATH="$BUNDLED_NODE:$PATH"
fi

mkdir -p "$WORK_DIR/frontend" "$WORK_DIR/backend"

cd "$ROOT_DIR"
if [ "${SKIP_CHECKS:-0}" != "1" ]; then
  npm run lint
  ./node_modules/.bin/tsc --noEmit
fi
npm run build

cp -R dist/client/. "$WORK_DIR/frontend/"

tar \
  --exclude='node_modules' \
  --exclude='logs' \
  --exclude='release' \
  --exclude='.next' \
  --exclude='.vinext' \
  --exclude='dist/client' \
  --exclude='config/mysql.json' \
  -czf "$BACKEND_TAR" \
  package.json package-lock.json tsconfig.json vite.config.ts next.config.ts postcss.config.mjs \
  app build config frontend public scripts server dist

tar -czf "$FRONTEND_TAR" -C "$WORK_DIR/frontend" .

rm -f "$RELEASE_DIR/trip-ledger-frontend-latest.tar.gz" "$RELEASE_DIR/trip-ledger-backend-latest.tar.gz"
ln -s "$(basename "$FRONTEND_TAR")" "$RELEASE_DIR/trip-ledger-frontend-latest.tar.gz"
ln -s "$(basename "$BACKEND_TAR")" "$RELEASE_DIR/trip-ledger-backend-latest.tar.gz"

echo "前端资源包：$FRONTEND_TAR"
echo "后端服务包：$BACKEND_TAR"
echo "latest：$RELEASE_DIR/trip-ledger-frontend-latest.tar.gz"
echo "latest：$RELEASE_DIR/trip-ledger-backend-latest.tar.gz"
