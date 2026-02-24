#!/usr/bin/env bash
# Vondi OpenClaw Gateway — production start script
# Used by Supervisor to run the gateway process

set -euo pipefail

# Supervisor не устанавливает HOME — определяем по user=dim
export HOME="${HOME:-/home/dim}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load nvm
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$HOME/.local/bin:$PATH"

# Load environment
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env"
  set +a
fi

# OPENCLAW_HOME — директория где лежит .openclaw/ (конфиг, state, workspace)
export OPENCLAW_HOME="$REPO_DIR"

# Verify claude CLI is available (used as AI backend via Claude Max subscription)
if ! command -v claude &>/dev/null; then
  echo "ERROR: claude CLI not found in PATH ($PATH)" >&2
  echo "Install: https://claude.ai/download" >&2
  exit 1
fi

exec node "$REPO_DIR/dist/entry.js" gateway run
