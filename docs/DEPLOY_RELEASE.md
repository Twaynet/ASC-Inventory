# ASC Inventory Release & Deploy Runbook

This document describes how to release a new version and deploy it to beta.orthowise.dev.

## Overview

- **Image Registry**: ghcr.io/twaynet/asc-inventory-api and ghcr.io/twaynet/asc-inventory-web
- **Tagging**: SemVer (e.g., 1.5.5)
- **Build Trigger**: GitHub Release publication triggers CD workflow
- **Deploy Method**: Pull new images on droplet, restart containers

---

## 1. Create a Release

### Step 1a: Ensure code is pushed to master

```bash
git status
git push origin master
```

### Step 1b: Determine next version

Check the latest tag:
```bash
git tag --list 'v*' | sort -V | tail -3
```

Bump according to change type:
- **Patch** (1.5.4 → 1.5.5): Bug fixes, minor changes
- **Minor** (1.5.5 → 1.6.0): New features, backward compatible
- **Major** (1.6.0 → 2.0.0): Breaking changes

### Step 1c: Create and push tag

```bash
# Create annotated tag
git tag -a v1.5.5 -m "Brief description of release"

# Push tag to GitHub
git push origin v1.5.5
```

### Step 1d: Create GitHub Release

```bash
gh release create v1.5.5 \
  --title "v1.5.5 - Release Title" \
  --notes "## Changes
- Feature 1
- Bug fix 2"
```

Or create via GitHub UI: https://github.com/Twaynet/ASC-Inventory/releases/new

---

## 2. Verify CI Build

### Step 2a: Check workflow status

```bash
gh run list --limit 5
```

Or view: https://github.com/Twaynet/ASC-Inventory/actions/workflows/cd.yml

### Step 2b: Wait for completion

The CD workflow builds and pushes both images. Takes ~3-5 minutes.

### Step 2c: Verify images exist in GHCR

```bash
# Check API image
gh api /users/twaynet/packages/container/asc-inventory-api/versions --jq '.[0:3] | .[] | .metadata.container.tags'

# Check Web image
gh api /users/twaynet/packages/container/asc-inventory-web/versions --jq '.[0:3] | .[] | .metadata.container.tags'
```

Or view packages at: https://github.com/Twaynet?tab=packages

---

## 3. Update docker-compose.prod.yml

Bump image tags in docker-compose.prod.yml:

```yaml
services:
  api:
    image: ghcr.io/twaynet/asc-inventory-api:1.5.5  # ← Update this
  web:
    image: ghcr.io/twaynet/asc-inventory-web:1.5.5  # ← Update this
```

Commit and push:
```bash
git add docker-compose.prod.yml
git commit -m "chore(docker): bump prod images to v1.5.5"
git push origin master
```

---

## 4. Deploy to Droplet

### Step 4a: SSH to droplet

```bash
ssh root@<DROPLET_IP>
cd /opt/asc-inventory  # or wherever docker-compose.prod.yml lives
```

### Step 4b: Pull latest compose file

```bash
git pull origin master
```

### Step 4c: Pull new images

```bash
docker compose -f docker-compose.prod.yml pull
```

### Step 4d: Restart services

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Step 4e: Verify deployment

```bash
# Check running containers
docker compose -f docker-compose.prod.yml ps

# Check image versions
docker inspect asc-api --format '{{.Config.Image}}'
docker inspect asc-web --format '{{.Config.Image}}'

# Test health
curl -s https://beta.orthowise.dev/api/health
```

---

## 5. Rollback

If something goes wrong, revert to the previous version:

### Step 5a: Edit docker-compose.prod.yml

Change image tags back to previous version (e.g., 1.5.4):
```yaml
  api:
    image: ghcr.io/twaynet/asc-inventory-api:1.5.4
  web:
    image: ghcr.io/twaynet/asc-inventory-web:1.5.4
```

### Step 5b: Pull and restart

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Step 5c: Verify rollback

```bash
docker inspect asc-api --format '{{.Config.Image}}'
# Should show: ghcr.io/twaynet/asc-inventory-api:1.5.4
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| List tags | `git tag --list 'v*' \| sort -V \| tail -5` |
| Create tag | `git tag -a v1.5.5 -m "message"` |
| Push tag | `git push origin v1.5.5` |
| Create release | `gh release create v1.5.5 --title "Title" --notes "Notes"` |
| Check workflows | `gh run list --limit 5` |
| Pull images | `docker compose -f docker-compose.prod.yml pull` |
| Deploy | `docker compose -f docker-compose.prod.yml up -d` |
| Check version | `docker inspect asc-api --format '{{.Config.Image}}'` |

---

## Versioning Source of Truth

The version is determined by **git tags**. The CD workflow extracts the version from the release tag and applies it to both images.

- Tags follow SemVer: `v1.5.5`, `v1.6.0`, `v2.0.0`
- The `v` prefix is stripped for image tags: `1.5.5`
- Both API and Web images share the same version tag
