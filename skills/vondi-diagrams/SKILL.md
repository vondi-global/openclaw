---
name: vondi-diagrams
description: "Generate architecture diagrams using D2 and send them as PNG/PDF files directly in Telegram via MEDIA: token. Use for drawing microservices, auth flows, database schemas, sequence diagrams."
metadata: { "openclaw": { "emoji": "📊", "requires": { "bins": ["d2"] } } }
---

# vondi-diagrams

Generates architecture diagrams using D2 and sends them to the user as PNG/PDF files directly in Telegram.

## When to use

Use this skill when the user asks to:

- Draw a diagram, scheme, flow, architecture, chart
- Visualize microservices, database schema, auth flow, sequence, infrastructure
- Generate PNG/PDF file with any visual diagram
- Keyword triggers: "нарисуй", "схему", "диаграмму", "схема", "draw", "diagram", "chart", "visualize"

## Tools

- `d2` binary at `/home/dim/.local/bin/d2` (v0.7.1)
- Standard Bash for file operations
- Output directory: `/tmp/openclaw/` (guaranteed to be in OpenClaw's allowed paths)

## Workflow

1. Plan the diagram content based on user request
2. Write D2 code (see syntax below)
3. Save D2 source to `/tmp/openclaw/{name}.d2`
4. Render to PNG: `d2 /tmp/openclaw/{name}.d2 /tmp/openclaw/{name}.png`
5. Optionally render to PDF: `d2 /tmp/openclaw/{name}.d2 /tmp/openclaw/{name}.pdf`
6. In your reply include: `MEDIA: /tmp/openclaw/{name}.png`

**CRITICAL:** Always use ABSOLUTE paths starting with `/tmp/openclaw/`. Never use relative paths.

## D2 Syntax Reference

### Basic elements

```d2
# Nodes with shapes
user: User {shape: person}
api: API Gateway {shape: rectangle}
db: PostgreSQL {shape: cylinder}
cache: Redis {shape: cylinder}
queue: Message Queue {shape: queue}
service: Service {shape: hexagon}

# Connections
user -> api: HTTP/HTTPS
api -> db: SQL query
api -> cache: GET/SET
api <-> service: gRPC
```

### Containers (groups)

```d2
k8s: Kubernetes Cluster {
  backend: Go Backend
  frontend: Next.js Frontend
  auth: Auth Service
}

client -> k8s.frontend: HTTPS
k8s.frontend -> k8s.backend: /api/v1
k8s.backend -> k8s.auth: gRPC
```

### Sequences

```d2
shape: sequence_diagram

user: User
browser: Browser
api: Backend API
db: Database

user -> browser: clicks login
browser -> api: POST /auth/login
api -> db: SELECT user WHERE email=...
db -> api: user record
api -> browser: JWT token
browser -> user: redirected to dashboard
```

### Styling

```d2
service: Payment Service {
  style: {
    fill: "#e8f5e9"
    stroke: "#2e7d32"
    font-color: "#1b5e20"
    border-radius: 8
  }
}

# Connection label color
a -> b: important {
  style: {
    stroke: "#d32f2f"
    font-color: "#d32f2f"
  }
}
```

### Direction

```d2
direction: right  # or: down, left, up
```

### Vondi Microservices Reference

Use these names when drawing Vondi architecture:

```d2
# Standard Vondi services
client: Browser / Mobile {shape: person}
bff: Next.js BFF {shape: hexagon}
backend: Go Monolith {shape: rectangle}
auth: Auth Service {shape: rectangle}
listings: Listings Service {shape: rectangle}
delivery: Delivery Service {shape: rectangle}
payment: Payment Service {shape: rectangle}
notifications: Notifications Service {shape: rectangle}
warehouse: Warehouse / WMS {shape: rectangle}
fiscal: Fiscal Service {shape: rectangle}

# Databases
vondi_db: vondi_db {shape: cylinder}
auth_db: auth_db {shape: cylinder}
listings_db: listings_dev_db {shape: cylinder}
redis: Redis {shape: cylinder}
opensearch: OpenSearch {shape: cylinder}
minio: MinIO S3 {shape: cylinder}

# Infrastructure
k8s: Kubernetes (k3s) {
  prod: production namespace
  dev: development namespace
}
harbor: Harbor Registry {shape: rectangle}
argocd: ArgoCD {shape: rectangle}
```

## Examples

### Generate and send a diagram

User: "нарисуй архитектуру auth flow"

```bash
# 1. Create D2 source
cat > /tmp/openclaw/auth-flow.d2 << 'EOF'
direction: right

browser: Browser {shape: person}
bff: Next.js BFF {shape: hexagon}
backend: Go Monolith
auth_svc: Auth Service

browser -> bff: POST /api/v2/auth/login
bff -> backend: POST /api/v1/auth/login
backend -> auth_svc: gRPC ValidateCredentials
auth_svc -> backend: JWT token + user
backend -> bff: {token, user}
bff -> browser: Set-Cookie: session_token
EOF

# 2. Render
d2 /tmp/openclaw/auth-flow.d2 /tmp/openclaw/auth-flow.png
```

Then reply:

```
Схема auth flow готова.

MEDIA: /tmp/openclaw/auth-flow.png
```

### Multiple formats

```bash
d2 /tmp/openclaw/schema.d2 /tmp/openclaw/schema.png
d2 /tmp/openclaw/schema.d2 /tmp/openclaw/schema.pdf
```

Reply:

```
Схема готова в двух форматах.

MEDIA: /tmp/openclaw/schema.png
MEDIA: /tmp/openclaw/schema.pdf
```

## Error handling

If `d2` command fails:

1. Check D2 syntax (most common error: unclosed braces, wrong connection syntax)
2. Try simplified version without styling
3. Report the error clearly

## Notes

- Keep diagrams focused — better to have a clean 5-node diagram than a cluttered 20-node one
- For large architectures, split into multiple diagrams (one per area)
- PNG is best for Telegram (renders inline); PDF for detailed/printable versions
- Default direction: `right` for left-to-right flows, `down` for top-to-bottom hierarchies
