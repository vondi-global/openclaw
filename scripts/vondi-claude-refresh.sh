#!/bin/bash
# Vondi Claude OAuth Auto-Refresh
# Runs every 6 hours via cron. Refreshes access token proactively.
# On failure: generates new auth link and sends to Telegram.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/tmp/openclaw/claude-token-refresh.log"
LOCK_FILE="/tmp/openclaw/claude-token-refresh.lock"

# Load env from openclaw .env
if [ -f "$OPENCLAW_DIR/.env" ]; then
    source "$OPENCLAW_DIR/.env"
fi

TELEGRAM_CHAT_ID="158107689"
CLAUDE_BIN="${HOME}/.local/bin/claude"
PYTHON="${PYTHON:-python3}"

mkdir -p /tmp/openclaw

# Prevent concurrent runs
if ! mkdir "$LOCK_FILE" 2>/dev/null; then
    echo "[$(date)] Refresh already in progress, skipping" >> "$LOG_FILE"
    exit 0
fi
trap 'rmdir "$LOCK_FILE" 2>/dev/null || true' EXIT

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

send_telegram() {
    local text="$1"
    if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
        log "WARN: TELEGRAM_BOT_TOKEN not set, cannot send Telegram message"
        return
    fi
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
        --data-urlencode "text=${text}" \
        -o /dev/null
}

log "Starting Claude OAuth token refresh check"

# Try proactive refresh
if "$PYTHON" "$SCRIPT_DIR/claude-token-refresh.py" >> "$LOG_FILE" 2>&1; then
    log "Refresh check completed successfully"
    exit 0
fi

log "Refresh failed, attempting to generate new auth link..."

# Refresh failed — generate new OAuth link automatically
AUTH_URL_FILE="/tmp/openclaw/claude-auth-url.txt"
AUTH_OUTPUT_FILE="/tmp/openclaw/claude-auth-output.txt"
rm -f "$AUTH_URL_FILE" "$AUTH_OUTPUT_FILE"

# Start auth login in background, capture output
CLAUDECODE="" "$CLAUDE_BIN" auth login > "$AUTH_OUTPUT_FILE" 2>&1 &
AUTH_PID=$!

# Wait up to 10 seconds for URL to appear
for i in $(seq 1 20); do
    sleep 0.5
    if grep -q "https://claude.ai/oauth/authorize" "$AUTH_OUTPUT_FILE" 2>/dev/null; then
        break
    fi
done

# Extract URL
AUTH_URL=$(grep -o 'https://claude.ai/oauth/authorize[^ ]*' "$AUTH_OUTPUT_FILE" 2>/dev/null | head -1 || echo "")

if [ -n "$AUTH_URL" ]; then
    log "Generated auth URL, sending to Telegram"
    send_telegram "Claude OAuth token expired!

Для восстановления авторизации перейди по ссылке:
${AUTH_URL}

После авторизации напиши боту /reauth"
    log "Telegram notification sent with auth URL"
else
    log "WARN: Could not extract auth URL from claude output"
    # Kill the auth process if we couldn't get the URL
    kill "$AUTH_PID" 2>/dev/null || true
    send_telegram "Claude OAuth token expired! Не удалось сгенерировать ссылку автоматически.

Запустите в терминале: claude auth login
Затем напишите боту /reauth"
fi

log "Refresh failed — user notification sent"
exit 1
