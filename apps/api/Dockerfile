FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests + lockfile (this layer caches until these files change)
COPY package.json package-lock.json turbo.json ./
COPY packages/domain/package.json ./packages/domain/
COPY packages/contract/package.json ./packages/contract/
COPY apps/api/package.json ./apps/api/

# Deterministic install from lockfile
RUN npm ci

# Copy source code
COPY packages/domain ./packages/domain
COPY packages/contract ./packages/contract
COPY apps/api ./apps/api

# Build workspace packages (order matters: domain → contract → api)
RUN npm run build --workspace=@asc/domain
RUN npm run build --workspace=@asc/contract
RUN npm run build --workspace=@asc/api

# ============================================================================
# Production image
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# Copy package files for production install
COPY package.json package-lock.json turbo.json ./
COPY packages/domain/package.json ./packages/domain/
COPY packages/contract/package.json ./packages/contract/
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/domain/dist ./packages/domain/dist
COPY --from=builder /app/packages/contract/dist ./packages/contract/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy database scripts and migrations (tsx is in prod deps for runtime migration)
COPY --from=builder /app/apps/api/db ./apps/api/db

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

WORKDIR /app/apps/api

# Run compiled production code
CMD ["node", "dist/index.js"]
