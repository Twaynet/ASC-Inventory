# CLAUDE.md — Infrastructure & Deployment Guardrails

**ASC Inventory Truth — Production Spine**

This document governs **infrastructure, deployment, and networking** for Claude CLI operations.

For application-level governance (LAW, domain rules, AI behavior), see `.claude/`.

---

## Modes of Operation

This repository supports two deployment modes with distinct rules.

### DEV Mode

**Purpose:** Local development, debugging, rapid iteration.

Rules:
- Ports 3000 (web) and 3001 (api) MAY be exposed directly to host
- No reverse proxy required
- HTTP is acceptable
- Services may run via `docker compose` or directly (`pnpm dev`)
- `.env.local` or inline env vars permitted

DEV mode is for local machines or throwaway VMs only.

### PROD Mode

**Purpose:** Deployed environment (beta, staging, production).

Rules:
- ONLY ports 22, 80, 443 exposed to public internet
- Caddy terminates TLS and proxies to internal services
- Web and API are internal-only (`expose`, not `ports`)
- All secrets in `.env` (gitignored)
- Cloudflare sits in front of the domain

PROD mode is the deployment standard for all non-local environments.

---

## Architecture Snapshot (PROD)

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE (Proxy ON)                        │
│         beta.orthowise.dev → Droplet IP                         │
│         SSL Mode: Full (Strict) with Origin Cert                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ :443 (TLS)
┌─────────────────────────────────────────────────────────────────┐
│                     DROPLET (Firewall)                          │
│              Allowed inbound: 22, 80, 443 only                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CADDY                                   │
│     - Terminates TLS (Cloudflare Origin Cert)                   │
│     - /api/* → api:3001                                         │
│     - /*     → web:3000                                         │
└─────────────────────────────────────────────────────────────────┘
                    │                   │
                    ▼                   ▼
          ┌─────────────────┐   ┌─────────────────┐
          │   asc-web:3000  │   │   asc-api:3001  │
          │   (internal)    │   │   (internal)    │
          └─────────────────┘   └─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │  asc-postgres   │
                              │   (internal)    │
                              └─────────────────┘
```

---

## DNS & TLS Expectations

### Cloudflare Configuration

| Setting | Value |
|---------|-------|
| Proxy status | Proxied (orange cloud) |
| SSL/TLS mode | Full (Strict) |
| Origin certificate | Cloudflare Origin CA (15-year) |
| Minimum TLS | 1.2 |

### Caddy TLS Configuration

- Caddy uses Cloudflare Origin Certificate (not Let's Encrypt/ACME)
- Certificate files: `/etc/caddy/certs/origin.pem`, `/etc/caddy/certs/origin-key.pem`
- OCSP stapling warning is expected and harmless for origin certs
- Do NOT enable ACME for domains behind Cloudflare proxy

### Why This Setup

- Cloudflare terminates public TLS, provides DDoS protection and CDN
- Caddy terminates the Cloudflare→Origin connection with a trusted cert
- Full (Strict) ensures the origin cert is validated, not just "any" cert

---

## File Policy

### PROD Allowed Files

| Path | Purpose | Committed |
|------|---------|-----------|
| `docker-compose.prod.yml` | Production compose | Yes |
| `caddy/Caddyfile` | Reverse proxy config | Yes |
| `caddy/certs/` | TLS certificates | No (gitignored) |
| `.env` | Secrets | No (gitignored) |

### Secrets

All secrets MUST be in `.env` and referenced via `${VAR}` in compose.

Required variables:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `DROPLET_IP` (for CORS)

Never commit:
- `.env`
- `caddy/certs/*`
- Any file containing passwords, keys, or tokens

---

## Deployment Workflow

```
1. Tag release on GitHub (vX.Y.Z)
2. GitHub Actions builds and pushes images to ghcr.io
3. SSH to droplet
4. Pull new images: docker compose -f docker-compose.prod.yml pull
5. Restart stack: docker compose -f docker-compose.prod.yml up -d
6. Verify: curl -I https://beta.orthowise.dev
```

No manual image builds on the droplet. Images come from GitHub Container Registry.

---

## Security Rationale

### Why ports 3000/3001 are not exposed publicly

1. **Attack surface reduction** — Fewer open ports = fewer vectors
2. **TLS enforcement** — All traffic passes through Caddy's TLS termination
3. **Centralized access control** — Caddy can add headers, rate limits, auth
4. **Clean URLs** — `/api/*` routing without port numbers
5. **Cloudflare integration** — Origin cert validates the full chain

### Why a reverse proxy exists in PROD

1. **TLS termination** — Services don't need individual cert management
2. **Routing** — Single entrypoint dispatches to correct service
3. **Headers** — Add `X-Origin`, security headers consistently
4. **HTTP/2 & HTTP/3** — Caddy handles modern protocols automatically
5. **Future scaling** — Easy to add services behind same entrypoint

---

## Modification Rules

### In PROD Mode, You MAY:

- Modify `docker-compose.prod.yml` (service config, env vars, image tags)
- Modify `caddy/Caddyfile` (routing, headers, TLS settings)
- Add files to `caddy/` directory (additional config)
- Update `.env` values on the droplet

### In PROD Mode, You MUST NOT:

- Expose ports 3000 or 3001 to host (`ports:` directive)
- Remove or bypass Caddy
- Use `tls internal` or Let's Encrypt for Cloudflare-proxied domains
- Commit secrets or certificates
- Modify application code, Dockerfiles, or GitHub workflows for infra reasons

### Mode Switching

To switch between DEV and PROD:
- DEV: Use `docker-compose.yml` (if exists) or run services directly
- PROD: Use `docker-compose.prod.yml` exclusively

Do not mix configurations.

---

## Conflict Resolution

If infrastructure changes conflict with application LAW (`.claude/SYSTEM_PROMPT.md`):
1. Application LAW wins for domain/data concerns
2. This document wins for deployment/networking concerns
3. If unclear, STOP and ask

Infrastructure changes MUST NOT alter application behavior or data semantics.

---

**End of CLAUDE.md**
