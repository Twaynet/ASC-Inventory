FROM node:20-alpine

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
COPY apps/api ./apps/api

# Build domain package
RUN cd packages/domain && npm run build

# Expose port
EXPOSE 3001

# Start in dev mode
WORKDIR /app/apps/api
CMD ["npm", "run", "dev"]
