FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json turbo.json ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN npm install

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
