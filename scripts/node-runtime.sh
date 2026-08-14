#!/usr/bin/env bash

BUNDLED_NODE="/Users/make/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"

if [ -x "$BUNDLED_NODE/node" ]; then
  export PATH="$BUNDLED_NODE:$PATH"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh"
  nvm use "${NODE_VERSION:-node}" >/dev/null
elif [ -s "/root/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "/root/.nvm/nvm.sh"
  nvm use "${NODE_VERSION:-node}" >/dev/null
fi
