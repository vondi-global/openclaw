#!/bin/bash
# OpenClaw Watchdog: kills stuck claude subprocess if older than MAX_AGE_MINUTES.
# Targets only claude processes launched with --dangerously-skip-permissions (OpenClaw pattern).
#
# Usage:
#   ./scripts/openclaw-watchdog.sh [max_age_minutes]
#
# Add to crontab for automatic cleanup:
#   */5 * * * * /path/to/openclaw/scripts/openclaw-watchdog.sh 60

MAX_AGE_MINUTES=${1:-60}
MAX_AGE_SECONDS=$((MAX_AGE_MINUTES * 60))

killed=0
while IFS= read -r line; do
  pid=$(echo "$line" | awk '{print $1}')
  elapsed=$(echo "$line" | awk '{print $2}')
  if [ "$elapsed" -gt "$MAX_AGE_SECONDS" ] 2>/dev/null; then
    echo "$(date): Killing stuck claude subprocess PID=$pid (running ${elapsed}s > ${MAX_AGE_SECONDS}s limit)"
    kill -9 "$pid" 2>/dev/null && killed=$((killed + 1))
  fi
done < <(ps -eo pid,etimes,args | awk '/[c]laude.*-p.*--dangerously-skip-permissions/ {print $1, $2}')

if [ "$killed" -gt 0 ]; then
  echo "$(date): Watchdog killed $killed subprocess(es)"
fi
