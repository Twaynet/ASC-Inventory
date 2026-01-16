FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json turbo.json ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm install

# Copy source code
COPY packages/domain ./packages/domain
COPY apps/web ./apps/web

# Build domain package
RUN cd packages/domain && npm run build

# Expose port
EXPOSE 3000

# Start in dev mode
WORKDIR /app/apps/web
CMD ["npm", "run", "dev"]
