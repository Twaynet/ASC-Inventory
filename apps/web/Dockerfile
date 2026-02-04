FROM node:20-alpine

WORKDIR /app

# Build arguments (passed from CI)
ARG VERSION=dev
ARG BUILD_TIME=dev
ARG COMMIT_SHA=dev
ARG NEXT_PUBLIC_API_URL=https://beta.orthowise.dev/api

# Set as env vars for Next.js build (NEXT_PUBLIC_ prefix exposes to client)
ENV NEXT_PUBLIC_VERSION=$VERSION
ENV NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME
ENV NEXT_PUBLIC_COMMIT_SHA=$COMMIT_SHA
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

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

# Build Next.js for production
RUN cd apps/web && npm run build

# Expose port
EXPOSE 3000

# Start in production mode
WORKDIR /app/apps/web
CMD ["npm", "run", "start"]
