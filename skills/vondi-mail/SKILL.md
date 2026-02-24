---
name: vondi-mail
description: "Manage Vondi Global corporate email mail@vondi.rs via Himalaya CLI (IMAP/SMTP). Read, search, reply to emails. Check inbox, analyze correspondence."
metadata:
  {
    "openclaw":
      {
        "emoji": "📬",
        "requires": { "bins": ["himalaya"] },
        "install":
          [
            {
              "id": "download",
              "kind": "shell",
              "label": "Install Himalaya for Linux x86_64",
              "script": "curl -L https://github.com/pimalaya/himalaya/releases/latest/download/himalaya.x86_64-linux.tgz | tar xz -C ~/.local/bin/",
            },
          ],
      },
  }
---

# Vondi Corporate Email

Manages mail@vondi.rs via Himalaya CLI.

## Setup

Himalaya config: `~/.config/himalaya/config.toml`

```toml
[accounts.vondi]
email = "mail@vondi.rs"
display-name = "Vondi Global"
default = true
backend.type = "imap"
backend.host = "imappro.zoho.eu"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "mail@vondi.rs"
backend.auth.type = "password"
backend.auth.raw = "APP_PASSWORD_HERE"
message.send.backend.type = "smtp"
message.send.backend.host = "smtppro.zoho.eu"
message.send.backend.port = 465
message.send.backend.encryption.type = "tls"
message.send.backend.login = "mail@vondi.rs"
message.send.backend.auth.type = "password"
message.send.backend.auth.raw = "APP_PASSWORD_HERE"
```

## ВАЖНО: всегда используй timeout 30

IMAP соединение может зависнуть. Все himalaya команды ОБЯЗАТЕЛЬНО запускай через `timeout 30`:

```bash
timeout 30 himalaya envelope list --page-size 20
timeout 30 himalaya message read <ID>
```

Если команда вернула ошибку/таймаут — сообщи пользователю и предложи попробовать позже.

## Commands

```bash
# List inbox (latest 20)
timeout 30 himalaya envelope list --page-size 20

# Read a message
timeout 30 himalaya message read <ID>

# Search (space-separated, no colons)
timeout 30 himalaya envelope list "from raiffeisen"
timeout 30 himalaya envelope list "subject invoice"
timeout 30 himalaya envelope list "from allsecure and subject ticket"

# Reply
timeout 30 himalaya message reply <ID>

# Send new email
timeout 30 himalaya message send <<EOF
From: mail@vondi.rs
To: recipient@example.com
Subject: Test

Message body here.
EOF

# List folders
timeout 30 himalaya folder list
```

## Zoho Mail Web

Direct link: https://mail.zoho.eu (mail@vondi.rs)
