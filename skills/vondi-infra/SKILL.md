---
name: vondi-infra
description: "Vondi Global infrastructure monitoring: Kubernetes production (vondi.rs), dev environment (dev.vondi.rs), Docker services via Supervisor, SSH access to servers."
metadata: { "openclaw": { "emoji": "⚙️", "requires": { "bins": ["kubectl", "ssh"] } } }
---

# Vondi Infrastructure

## АБСОЛЮТНЫЙ ЗАПРЕТ: НЕ перезапускать openclaw-gateway

**НИКОГДА не выполнять:**

```bash
sudo supervisorctl restart tools:openclaw-gateway
sudo supervisorctl stop tools:openclaw-gateway
```

**Причина:** openclaw-gateway — это сам бот, из которого ты работаешь.
Перезапуск убивает текущий Claude subprocess → ответ в Telegram никогда не приходит.
Пользователь думает что завис, перезапускает вручную — и бот нестабилен.

**Если нужно перезапустить openclaw** — сообщи пользователю, что это нужно сделать ВРУЧНУЮ с компьютера.

## Production Kubernetes (vondi.rs, 62.169.20.78)

```bash
# All pods status
ssh vondi "kubectl get pods -n production"

# Deployments
ssh vondi "kubectl get deployments -n production"

# Recent events (errors)
ssh vondi "kubectl get events -n production --sort-by='.lastTimestamp' | tail -20"

# Service logs
ssh vondi "kubectl logs -n production deployment/backend-monolith --tail=100"
ssh vondi "kubectl logs -n production deployment/auth-service --tail=50"
ssh vondi "kubectl logs -n production deployment/listings-service --tail=50"
```

## Dev Environment (dev.vondi.rs, 144.91.66.171)

```bash
# Status all services
ssh k3s-worker-1 "sudo supervisorctl status"

# Restart a service
ssh k3s-worker-1 "sudo supervisorctl restart vondi-dev:vondi-backend"

# Backend logs
ssh k3s-worker-1 "sudo tail -100 /var/log/supervisor/vondi-dev/vondi-backend.log"
```

## Local Services (Supervisor)

```bash
# Full status
sudo supervisorctl status

# Restart core services
sudo supervisorctl restart core:backend
sudo supervisorctl restart core:frontend

# Microservices
sudo supervisorctl restart microservices:listings
sudo supervisorctl restart microservices:auth
```

## SSH Servers

| Alias        | IP              | Purpose                 |
| ------------ | --------------- | ----------------------- |
| vondi        | 62.169.20.78    | Production k3s master   |
| k3s-worker-1 | 144.91.66.171   | k3s worker + dev env    |
| svetu        | 161.97.89.28    | Metrics, GitHub Runners |
| terra        | 207.180.197.172 | k3s, agro               |

## Emergency

```bash
# Rollback deployment
ssh vondi "kubectl rollout undo deployment/<service> -n production"

# Restart all production
ssh vondi "kubectl rollout restart deployment -n production"
```

## ArgoCD

ArgoCD auto-syncs from vondi-global/k8s-configs. Manual kubectl changes get REVERTED.
To deploy: update image tags in k8s-configs repo → ArgoCD picks up automatically.
