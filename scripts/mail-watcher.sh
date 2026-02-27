#!/bin/bash
# mail-watcher.sh — мониторинг почты mail@vondi.rs с AI-анализом новых писем
# Crontab: */2 * * * * /p/github.com/vondi-global/openclaw/scripts/mail-watcher.sh

# Нужно для cron — himalaya ищет конфиг в $HOME/.config/himalaya/
export HOME=/home/dim
export PATH=/usr/local/bin:/usr/bin:/bin:/home/dim/.local/bin:/home/dim/.cargo/bin
unset CLAUDECODE  # claude -p не работает внутри claude code сессии

BOT_TOKEN="8359984514:AAF_gf2Qau1Ntc0Ns5PwwOrDmvUDvSFEX0Y"
CHAT_ID="158107689"
LAST_ID_FILE="/home/dim/.openclaw/last_email_id"
LOG_FILE="/home/dim/.openclaw/logs/mail-watcher.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

send_telegram() {
    local text="$1"
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        --data-urlencode "text=${text}" \
        > /dev/null 2>&1
}

# Получить текущие конверты
output=$(timeout 30 himalaya envelope list --page-size 30 2>/dev/null)
if [ -z "$output" ]; then
    log "ERROR: himalaya вернул пустой результат"
    exit 0
fi

# Найти максимальный числовой ID
max_id=$(echo "$output" | awk -F'|' 'NR>2 && $2 ~ /[0-9]+/ {gsub(/ /,"",$2); if ($2+0 > max) max=$2+0} END {print max+0}')
if [ -z "$max_id" ] || [ "$max_id" -eq 0 ]; then
    log "ERROR: не удалось определить max ID"
    exit 0
fi

# Первый запуск — сохранить текущий max ID без уведомления
if [ ! -f "$LAST_ID_FILE" ]; then
    echo "$max_id" > "$LAST_ID_FILE"
    log "Первый запуск, сохранён max_id=$max_id"
    exit 0
fi

last_id=$(cat "$LAST_ID_FILE" 2>/dev/null || echo 0)

if [ "$max_id" -le "$last_id" ]; then
    exit 0
fi

log "Новые письма: max_id=$max_id, last_id=$last_id"

# Собрать список новых ID
new_ids=()
while IFS='|' read -r _ id _ flags _ subject _ from _ date _; do
    id=$(echo "$id" | tr -d ' ')
    [[ "$id" =~ ^[0-9]+$ ]] || continue
    [ "$id" -gt "$last_id" ] || continue
    new_ids+=("$id")
done <<< "$output"

if [ ${#new_ids[@]} -eq 0 ]; then
    log "WARN: max_id обновился но новые ID не распарсились"
    echo "$max_id" > "$LAST_ID_FILE"
    exit 0
fi

# Обработать каждое новое письмо
for email_id in "${new_ids[@]}"; do
    log "Читаю и анализирую письмо ID=$email_id"

    # Прочитать полное содержимое письма
    email_body=$(timeout 30 himalaya message read "$email_id" 2>/dev/null | head -100)

    if [ -z "$email_body" ]; then
        log "WARN: не удалось прочитать письмо ID=$email_id"
        continue
    fi

    # Форматированное уведомление с содержимым письма
    header=$(echo "$email_body" | grep -E "^(From|To|Subject|Date):" | head -4)
    body_text=$(echo "$email_body" | awk '/^$/{found=1; next} found{print}' | head -30 | grep -v "^>")

    notification="Новое письмо #${email_id}
---
${header}
---
${body_text}"

    send_telegram "$notification"
    log "Уведомление отправлено для ID=$email_id"
done

# Обновить last_id после обработки всех писем
echo "$max_id" > "$LAST_ID_FILE"
log "last_email_id обновлён до $max_id"
