# ASC Inventory Release & Deploy Runbook

This document describes how to release a new version and deploy it to beta.orthowise.dev.

## Overview

| Component | Details |
|-----------|---------|
| **Registry** | ghcr.io/twaynet/asc-inventory-api, ghcr.io/twaynet/asc-inventory-web |
| **Tagging** | SemVer (e.g., 1.5.6) |
| **Build Trigger** | GitHub Release publication triggers CD workflow |
| **Deploy Method** | Change `IMAGE_TAG` in `.env`, pull, restart |

---

## Prerequisites

### Droplet `.env` File

The droplet must have `/home/tim/asc-inventory/.env` with these variables:

```bash
# REQUIRED - Database password
POSTGRES_PASSWORD=<your-secure-password>

# REQUIRED - JWT signing secret
JWT_SECRET=<your-jwt-secret>

# REQUIRED - Docker image version to deploy
IMAGE_TAG=1.5.6
```

> **Note**: `.env` is gitignored and must be created manually on the droplet.

---

## 1. Create a Release (Claude/CI)

### Step 1a: Ensure code is on master

```bash
git status
git push origin master
```

### Step 1b: Determine next version

```bash
git tag --list 'v*' | sort -V | tail -3
```

Version bumping:
- **Patch** (1.5.5 → 1.5.6): Bug fixes
- **Minor** (1.5.6 → 1.6.0): New features
- **Major** (1.6.0 → 2.0.0): Breaking changes

### Step 1c: Create and push tag

```bash
git tag -a v1.5.6 -m "Brief description"
git push origin v1.5.6
```

### Step 1d: Create GitHub Release

```bash
gh release create v1.5.6 \
  --title "v1.5.6 - Release Title" \
  --generate-notes
```

This triggers the CD workflow which builds and pushes both images to GHCR.

### Step 1e: Verify images published

Wait 3-5 minutes for CD workflow, then verify:

```bash
# Check workflow status
gh run list --workflow=cd.yml --limit 3

# Verify images exist (requires gh auth with read:packages)
gh api /users/twaynet/packages/container/asc-inventory-api/versions \
  --jq '.[0].metadata.container.tags'
```

Or check: https://github.com/Twaynet?tab=packages

---

## 2. Deploy to Droplet

### Step 2a: SSH to droplet

```bash
ssh root@<DROPLET_IP>
cd /home/tim/asc-inventory
```

### Step 2b: Update IMAGE_TAG

Edit `.env` to set the new version:

```bash
nano .env
# Change: IMAGE_TAG=1.5.6
```

Or use sed:

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=1.5.6/' .env
grep IMAGE_TAG .env  # Verify
```

### Step 2c: Pull and deploy

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Step 2d: Verify deployment

```bash
# Check containers are running
docker ps

# Verify correct image versions
docker inspect asc-api --format '{{.Config.Image}}'
docker inspect asc-web --format '{{.Config.Image}}'

# Test API health
curl -s https://beta.orthowise.dev/api/health

# Check logs if needed
docker logs asc-api --tail 20
docker logs asc-web --tail 20
```

---

## 3. Rollback

If the new version has issues, revert to the previous version:

### Step 3a: Update IMAGE_TAG to previous version

```bash
ssh root@<DROPLET_IP>
cd /home/tim/asc-inventory

# Set previous version
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=1.5.5/' .env
grep IMAGE_TAG .env  # Verify shows 1.5.5
```

### Step 3b: Pull and restart

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Step 3c: Verify rollback

```bash
docker inspect asc-api --format '{{.Config.Image}}'
# Should show: ghcr.io/twaynet/asc-inventory-api:1.5.5

curl -s https://beta.orthowise.dev/api/health
```

---

## Happy Path Example: Releasing v1.5.6

```bash
# 1. On dev machine - create release
git tag -a v1.5.6 -m "feat: new feature description"
git push origin v1.5.6
gh release create v1.5.6 --title "v1.5.6" --generate-notes

# 2. Wait for CD workflow (~3-5 min)
gh run list --workflow=cd.yml --limit 1

# 3. On droplet - deploy
ssh root@<DROPLET_IP>
cd /home/tim/asc-inventory
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=1.5.6/' .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 4. Verify
docker inspect asc-api --format '{{.Config.Image}}'
# → ghcr.io/twaynet/asc-inventory-api:1.5.6
curl -s https://beta.orthowise.dev/api/health
# → {"status":"ok",...}
```

---

## Rollback Example: Reverting from v1.5.6 to v1.5.5

```bash
# On droplet
ssh root@<DROPLET_IP>
cd /home/tim/asc-inventory

# Revert to previous version
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=1.5.5/' .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Verify
docker inspect asc-api --format '{{.Config.Image}}'
# → ghcr.io/twaynet/asc-inventory-api:1.5.5
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| List tags | `git tag --list 'v*' \| sort -V \| tail -5` |
| Create tag | `git tag -a v1.5.6 -m "message"` |
| Push tag | `git push origin v1.5.6` |
| Create release | `gh release create v1.5.6 --generate-notes` |
| Check CD workflow | `gh run list --workflow=cd.yml --limit 3` |
| Update IMAGE_TAG | `sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=1.5.6/' .env` |
| Pull images | `docker compose -f docker-compose.prod.yml pull` |
| Deploy | `docker compose -f docker-compose.prod.yml up -d` |
| Check version | `docker inspect asc-api --format '{{.Config.Image}}'` |
| API health | `curl -s https://beta.orthowise.dev/api/health` |

---

## Troubleshooting

### Container won't start

```bash
docker logs asc-api --tail 50
docker logs asc-web --tail 50
```

### Database migrations needed

```bash
docker exec -it asc-api npm run db:migrate
```

### Check .env is loaded

```bash
docker compose -f docker-compose.prod.yml config | grep IMAGE_TAG
```

### Force recreate containers

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate
```
