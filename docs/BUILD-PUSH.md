You are working in the ASC Inventory Truth repository.

ROLE:
Do the work; do not hand-wave. If something is missing, implement it.

GOAL:
Implement deployment: build/push immutable GHCR images from GitHub Actions and deploy by bumping image tags on the droplet. The droplet must never rely on local builds to reflect git pulls.

CURRENT STATE (known facts):
- Droplet runs docker-compose.prod.yml that pins:
  - ghcr.io/twaynet/asc-inventory-api:1.5.4
  - ghcr.io/twaynet/asc-inventory-web:1.5.4
- Next.js NEXT_PUBLIC_* env is baked at build time, so the web image must be rebuilt for changes.
- We want a repeatable process so beta.orthowise.dev updates by pulling a new tag.

NON-NEGOTIABLE OUTCOMES:
1) GitHub Actions must build and push BOTH images to GHCR:
   - ghcr.io/twaynet/asc-inventory-api:<tag>
   - ghcr.io/twaynet/asc-inventory-web:<tag>
2) The tagging scheme must be deterministic and human-friendly:
   - Prefer SemVer (e.g., 1.5.5) OR SemVer + short SHA (e.g., 1.5.5-9fa50d3)
   - Do NOT use “latest” as the sole deploy mechanism.
3) Provide a markdown runbook file that I can follow every time:
   - Name it docs/DEPLOY_RELEASE.md (or similar)
   - Must include: how to bump version/tag, how to trigger build, how to verify GHCR images exist, and droplet commands to deploy.
4) Add a simple “version source of truth”:
   - Either a VERSION file, package.json version, or git tag-driven versioning
   - But it must be clear how the tag is chosen and applied to both images.
5) Ensure GHCR auth/permissions are correct:
   - Use GITHUB_TOKEN with appropriate permissions in workflow, or PAT if required
   - Workflow must set permissions for packages write
6) Provide droplet deploy commands that are always the same:
   - Edit docker-compose.prod.yml image tags (or use an .env like IMAGE_TAG=...)
   - docker compose pull
   - docker compose up -d
   - verify running image tags
7) Keep changes minimal, but complete. Do not refactor unrelated systems.

TASKS:
A) Audit current CI: search for existing .github/workflows that build/push GHCR.
B) If missing or incomplete, add/modify workflow(s) to build/push:
   - separate images for apps/api and apps/web
   - correct build contexts and Dockerfiles
   - proper caching
   - correct tags
C) Add docs/DEPLOY_RELEASE.md with:
   - “Release” steps (create tag / bump version)
   - “CI build verification” steps (where to see build, how to confirm image tags)
   - “Deploy to droplet” steps (commands; include branch/tag alignment)
   - “Rollback” steps (how to revert to prior tag in compose + pull + up -d)
D) (Optional but recommended) Add a tiny helper script under scripts/ like:
   - scripts/deploy-prod.sh (prints steps; does NOT auto-edit remote)
   - Or scripts/bump-version.sh (if safe)
   Keep it small and obvious.

DELIVERABLES:
1) Brief plan
2) Implemented code/workflow/docs changes
3) A “happy path” example using a hypothetical tag (e.g., 1.5.5)
4) A rollback example

CONSTRAINT:
If something about build contexts/Dockerfiles is unclear, locate the actual Dockerfiles and wire them correctly—do not guess.

Now implement.