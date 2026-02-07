#!/usr/bin/env bash
#
# ASC Inventory Release Helper
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 1.5.6
#

set -e

VERSION=${1:-}

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.5.6"
  echo ""
  echo "Current tags:"
  git tag --list 'v*' | sort -V | tail -5
  exit 1
fi

# Validate version format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in format X.Y.Z (e.g., 1.5.6)"
  exit 1
fi

TAG="v$VERSION"

echo "============================================"
echo "ASC Inventory Release: $TAG"
echo "============================================"
echo ""

# Check if tag already exists
if git tag --list | grep -q "^$TAG$"; then
  echo "Error: Tag $TAG already exists"
  exit 1
fi

# Ensure we're on master and up to date
echo "1. Checking git status..."
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "master" ]; then
  echo "Warning: Not on master branch (on $BRANCH)"
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: You have uncommitted changes. Commit or stash them first."
  exit 1
fi

echo ""
echo "2. Creating tag $TAG..."
git tag -a "$TAG" -m "Release $VERSION"

echo ""
echo "3. Pushing tag to origin..."
git push origin "$TAG"

echo ""
echo "4. Creating GitHub release..."
gh release create "$TAG" \
  --title "$TAG" \
  --generate-notes

echo ""
echo "============================================"
echo "Release $TAG created successfully!"
echo "============================================"
echo ""
echo "CD workflow will build and push images to GHCR."
echo "Check status: gh run list --workflow=cd.yml --limit 3"
echo ""
echo "Once complete, deploy to droplet:"
echo ""
echo "  ssh root@<DROPLET_IP>"
echo "  cd /home/tim/asc-inventory"
echo "  sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=$VERSION/' .env"
echo "  docker compose -f docker-compose.prod.yml pull"
echo "  docker compose -f docker-compose.prod.yml up -d"
echo ""
