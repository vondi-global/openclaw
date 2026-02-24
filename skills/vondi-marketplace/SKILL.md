---
name: vondi-marketplace
description: "Business analytics and operations for Vondi Global D.O.O. marketplace (vondi.rs, Serbia). Access listings, orders, storefronts, deliveries, reviews via PostgreSQL. Monitor KPIs and business metrics."
metadata: { "openclaw": { "emoji": "🛒", "requires": { "bins": ["psql"] } } }
---

# Vondi Marketplace Analytics

Business intelligence for Vondi marketplace (vondi.rs).

## Database Connections

```bash
# Main marketplace DB (monolith)
PGPASSWORD=mX3g1XGhMRUZEX3l psql -h localhost -p 5433 -U postgres -d vondi_db

# Listings service DB
PGPASSWORD=listings_secret psql -h localhost -p 35434 -U listings_user -d listings_dev_db
```

## Key Queries

### Dashboard — current state

```sql
-- Listings (via listings DB)
SELECT COUNT(*) FILTER (WHERE status='active') AS active,
       COUNT(*) FILTER (WHERE status='draft')  AS draft
FROM listings;

-- Storefronts
SELECT COUNT(*) AS total_storefronts FROM storefronts;

-- Categories
SELECT COUNT(*) AS total_categories FROM categories;
```

```sql
-- Orders (via vondi_db)
SELECT status, COUNT(*) AS cnt
FROM orders
GROUP BY status
ORDER BY cnt DESC;

-- Today's orders
SELECT COUNT(*) AS today_orders, SUM(total_amount)/100.0 AS revenue_eur
FROM orders
WHERE created_at >= CURRENT_DATE;

-- Recent deliveries
SELECT d.status, COUNT(*) AS cnt
FROM deliveries d
GROUP BY d.status;
```

### Sellers / Storefronts

```sql
-- Top storefronts by listings count
SELECT s.name, COUNT(l.id) AS listings_count
FROM storefronts s
LEFT JOIN listings l ON l.storefront_id = s.id
GROUP BY s.id, s.name
ORDER BY listings_count DESC
LIMIT 10;
```

### Reviews

```sql
SELECT rating, COUNT(*) AS cnt FROM reviews GROUP BY rating ORDER BY rating DESC;
SELECT AVG(rating)::numeric(3,1) AS avg_rating FROM reviews;
```

### Shopping Activity

```sql
-- Active carts
SELECT COUNT(DISTINCT user_id) AS users_with_cart FROM shopping_cart_items;
```

## Production Kubernetes

```bash
# Check production pods
ssh vondi "kubectl get pods -n production | grep -E 'backend|frontend|listings'"

# Production logs
ssh vondi "kubectl logs -n production deployment/backend-monolith --tail=50"
```

## Business KPIs (daily briefing format)

```bash
# Run full dashboard in one query set
PGPASSWORD=mX3g1XGhMRUZEX3l psql -h localhost -p 5433 -U postgres -d vondi_db -c "
SELECT
  (SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE) AS orders_today,
  (SELECT SUM(total_amount)/100.0 FROM orders WHERE created_at >= CURRENT_DATE) AS revenue_eur,
  (SELECT COUNT(*) FROM orders) AS total_orders,
  (SELECT COUNT(*) FROM deliveries WHERE status='in_transit') AS in_transit;
"
PGPASSWORD=listings_secret psql -h localhost -p 35434 -U listings_user -d listings_dev_db -c "
SELECT
  (SELECT COUNT(*) FROM listings WHERE status='active') AS active_listings,
  (SELECT COUNT(*) FROM storefronts) AS storefronts;
"
```
