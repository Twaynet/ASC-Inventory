#!/usr/bin/env bash
#
# ASC Inventory Release Helper
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 1.5.5
#

set -e

VERSION=${1:-}

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.5.5"
  echo ""
  echo "Current tags:"
  git tag --list 'v*' | sort -V | tail -5
  exit 1
fi

# Validate version format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in format X.Y.Z (e.g., 1.5.5)"
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
echo "5. Updating docker-compose.prod.yml..."
sed -i "s|asc-inventory-api:[0-9.]*|asc-inventory-api:$VERSION|g" docker-compose.prod.yml
sed -i "s|asc-inventory-web:[0-9.]*|asc-inventory-web:$VERSION|g" docker-compose.prod.yml

echo ""
echo "6. Committing version bump..."
git add docker-compose.prod.yml
git commit -m "chore(docker): bump prod images to v$VERSION"
git push origin master

echo ""
echo "============================================"
echo "Release $TAG created successfully!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Wait for CD workflow: gh run list --limit 3"
echo "  2. SSH to droplet and deploy:"
echo "     ssh root@<DROPLET_IP>"
echo "     cd /opt/asc-inventory"
echo "     git pull && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d"
echo ""
