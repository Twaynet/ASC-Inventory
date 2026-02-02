FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests + lockfile (this layer caches until these files change)
COPY package.json package-lock.json turbo.json ./
COPY packages/domain/package.json ./packages/domain/
COPY packages/contract/package.json ./packages/contract/
COPY apps/web/package.json ./apps/web/

# Deterministic install from lockfile
RUN npm ci

# Copy source code
COPY packages/domain ./packages/domain
COPY packages/contract ./packages/contract
COPY apps/web ./apps/web

# Build workspace packages
RUN cd packages/domain && npm run build
RUN cd packages/contract && npm run build

# Expose port
EXPOSE 3000

# Start in dev mode
WORKDIR /app/apps/web
CMD ["npm", "run", "dev"]
