---
name: vondi-db
description: "Direct database access for all Vondi microservices: PostgreSQL connections, migrations, data queries across listings, auth, delivery, payment, warehouse, notifications services."
metadata: { "openclaw": { "emoji": "🗄️", "requires": { "bins": ["psql"] } } }
---

# Vondi Databases

## Connection Strings

```bash
# Monolith (port 5433)
psql "postgres://postgres:mX3g1XGhMRUZEX3l@localhost:5433/vondi_db?sslmode=disable"

# Listings Service (port 35434)
psql "postgres://listings_user:listings_secret@localhost:35434/listings_dev_db?sslmode=disable"

# Auth Service (port 25432)
psql "postgres://auth_user:auth_secret@localhost:25432/auth_db?sslmode=disable"

# Delivery Service (port 35432)
psql "postgres://delivery_user:delivery_password@localhost:35432/delivery_db?sslmode=disable"

# Payment Service (port 35433)
psql "postgres://payment_user:payment_password@localhost:35433/payment_db?sslmode=disable"

# Notifications (port 35437)
psql "postgres://notify_user:notify_secret@localhost:35437/notifications_db?sslmode=disable"

# Warehouse/WMS (port 35435)
psql "postgres://wms_user:wms_secure_pass_2025@localhost:35435/wms_db?sslmode=disable"
```

## Quick Diagnostics

```bash
# Check all local PostgreSQL instances
for port in 5433 25432 35432 35433 35434 35435 35437; do
  echo -n "Port $port: "
  pg_isready -h localhost -p $port -q && echo "OK" || echo "DOWN"
done
```

## Common Queries

### Users (Auth DB)

```sql
SELECT COUNT(*) AS total_users,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS new_week
FROM users;
```

### Listings (Listings DB)

```sql
SELECT status, COUNT(*) FROM listings GROUP BY status;

SELECT c.name, COUNT(l.id) AS listings
FROM categories c
LEFT JOIN listings l ON l.category_id = c.id
GROUP BY c.id, c.name
ORDER BY listings DESC
LIMIT 10;
```

### Migrations

```bash
# Monolith
cd /p/github.com/vondi-global/vondi/backend && ./migrator up

# Listings
cd /p/github.com/vondi-global/listings && make migrate-up

# Check pending migrations
cd /p/github.com/vondi-global/vondi/backend && ./migrator status
```
